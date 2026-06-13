import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DatabaseClient } from './db/database.ts';
import { getDatabaseStatus } from './db/postgres.ts';
import { ContractsRepository } from './contracts/repository.ts';
import { parseContractId, parseContractListQuery, ValidationError } from './contracts/validation.ts';
import { FeedbackRepository, type FeedbackWriter } from './feedback/repository.ts';
import { parseFeedbackSubmission } from './feedback/validation.ts';

export interface AppOptions {
  db: DatabaseClient | null;
  repository?: ContractsRepository;
  feedbackRepository?: FeedbackWriter;
}

export function createApp(options: AppOptions) {
  const repository = options.repository ?? (options.db ? new ContractsRepository(options.db) : null);
  const feedbackRepository = options.feedbackRepository ?? (options.db ? new FeedbackRepository(options.db) : null);

  const server = createServer(async (request, response) => {
    try {
      await routeRequest(request, response, options.db, repository, feedbackRepository);
    } catch (error) {
      sendError(response, error);
    }
  });

  return {
    server,
    inject: (path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
      inject(server, path, init.method ?? 'GET', init.body, init.headers),
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  db: DatabaseClient | null,
  repository: ContractsRepository | null,
  feedbackRepository: FeedbackWriter | null,
): Promise<void> {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', 'http://localhost');

  if (url.pathname === '/feedback') {
    if (method !== 'POST') {
      throw httpError(405, 'Method not allowed.');
    }

    if (!feedbackRepository) {
      throw httpError(503, 'Database is not configured. Set DATABASE_URL to enable feedback submissions.');
    }

    const feedback = parseFeedbackSubmission(await readJsonBody(request));
    const savedFeedback = await feedbackRepository.createFeedback(feedback);
    sendJson(response, 201, {
      id: savedFeedback.id,
      status: savedFeedback.status,
      created_at: savedFeedback.created_at,
    });
    return;
  }

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

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  const maxBytes = 16 * 1024;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBytes) {
      throw httpError(413, 'Request body is too large.');
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    throw new ValidationError(['Request body must be a JSON object.']);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new ValidationError(['Request body must be valid JSON.']);
  }
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

function inject(
  server: ReturnType<typeof createServer>,
  path: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ statusCode: number; body: string; json: () => unknown }> {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      const request = globalThis.fetch(`http://127.0.0.1:${address.port}${path}`, {
        method,
        headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
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
