import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DatabaseClient } from './db/database.ts';
import { getDatabaseStatus } from './db/postgres.ts';
import { ContractsRepository } from './contracts/repository.ts';
import { parseContractId, parseContractListQuery, ValidationError } from './contracts/validation.ts';

export interface AppOptions {
  db: DatabaseClient | null;
  repository?: ContractsRepository;
}

export function createApp(options: AppOptions) {
  const repository = options.repository ?? (options.db ? new ContractsRepository(options.db) : null);

  const server = createServer(async (request, response) => {
    try {
      await routeRequest(request, response, options.db, repository);
    } catch (error) {
      sendError(response, error);
    }
  });

  return {
    server,
    inject: (path: string, init: { method?: string } = {}) => inject(server, path, init.method ?? 'GET'),
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  db: DatabaseClient | null,
  repository: ContractsRepository | null,
): Promise<void> {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', 'http://localhost');

  if (method !== 'GET') {
    throw httpError(405, 'Method not allowed.');
  }

  if (url.pathname === '/health') {
    sendJson(response, 200, {
      status: 'ok',
      database: await getDatabaseStatus(db),
    });
    return;
  }

  if (!repository) {
    throw httpError(503, 'Database is not configured. Set DATABASE_URL to enable contract endpoints.');
  }

  if (url.pathname === '/contracts') {
    const query = parseContractListQuery(url.searchParams);
    sendJson(response, 200, await repository.listContracts(query));
    return;
  }

  if (url.pathname === '/contracts/filters') {
    sendJson(response, 200, await repository.getFilters());
    return;
  }

  const contractMatch = /^\/contracts\/(\d+)$/.exec(url.pathname);
  if (contractMatch) {
    const id = parseContractId(contractMatch[1]);
    const contract = await repository.getContract(id);
    if (!contract) {
      throw httpError(404, 'Contract not found.');
    }
    sendJson(response, 200, contract);
    return;
  }

  throw httpError(404, 'Not found.');
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

function sendError(response: ServerResponse, error: unknown): void {
  if (error instanceof ValidationError) {
    sendJson(response, error.statusCode, {
      error: error.message,
      details: error.details,
    });
    return;
  }

  const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error ? Number(error.statusCode) : 500;
  const message = error instanceof Error ? error.message : 'Internal server error.';

  sendJson(response, Number.isInteger(statusCode) && statusCode >= 400 ? statusCode : 500, {
    error: message,
  });
}

function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function inject(server: ReturnType<typeof createServer>, path: string, method: string): Promise<{ statusCode: number; body: string; json: () => unknown }> {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      const request = globalThis.fetch(`http://127.0.0.1:${address.port}${path}`, { method });
      request
        .then(async (response) => {
          const body = await response.text();
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve({
              statusCode: response.status,
              body,
              json: () => JSON.parse(body),
            });
          });
        })
        .catch((error) => {
          server.close(() => reject(error));
        });
    });
  });
}
