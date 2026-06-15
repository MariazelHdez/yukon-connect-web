import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DatabaseClient } from './db/database.ts';
import { getDatabaseStatus } from './db/postgres.ts';
import { ContractsRepository, type ContractsReader } from './contracts/repository.ts';
import { parseContractId, parseContractListQuery, ValidationError } from './contracts/validation.ts';
import { FeedbackRepository, type FeedbackWriter } from './feedback/repository.ts';
import { parseFeedbackSubmission } from './feedback/validation.ts';

export interface AppOptions {
  db: DatabaseClient | null;
  repository?: ContractsReader;
  security?: Partial<SecurityConfig>;
  feedbackRepository?: FeedbackWriter;
}

export function createApp(options: AppOptions) {
  const repository = options.repository ?? (options.db ? new ContractsRepository(options.db) : null);
  const feedbackRepository = options.feedbackRepository ?? (options.db ? new FeedbackRepository(options.db) : null);
  const security = getSecurityConfig(options.security);
  const rateLimiter = createRateLimiter(security.rateLimitWindowMs, security.rateLimitMax);

  const server = createServer(async (request, response) => {
    const requestId = randomUUID();
    applySecurityHeaders(request, response, security, requestId);

    if (handleCorsPreflight(request, response)) {
      return;
    }

    const rateLimit = rateLimiter.check(getRateLimitKey(request));
    applyRateLimitHeaders(response, rateLimit, security.rateLimitMax);
    if (!rateLimit.allowed) {
      response.setHeader('retry-after', String(Math.ceil(security.rateLimitWindowMs / 1000)));
      sendJson(response, 429, { error: 'Too many requests.' });
      logError(request, requestId, 429, 'RateLimitError');
      return;
    }

    try {
      await routeRequest(request, response, options.db, repository, feedbackRepository);
    } catch (error) {
      sendError(request, response, error, requestId);
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
  repository: ContractsReader | null,
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
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

function sendError(request: IncomingMessage, response: ServerResponse, error: unknown, requestId: string): void {
  if (error instanceof ValidationError) {
    sendJson(response, error.statusCode, {
      error: error.message,
      details: error.details,
    });
    logError(request, requestId, error.statusCode, error.name);
    return;
  }

  const statusCode =
    typeof error === 'object' && error !== null && 'statusCode' in error ? Number(error.statusCode) : 500;
  const safeStatusCode = Number.isInteger(statusCode) && statusCode >= 400 ? statusCode : 500;
  const message =
    safeStatusCode >= 500 ? 'Internal server error.' : error instanceof Error ? error.message : 'Request failed.';

  sendJson(response, safeStatusCode, {
    error: message,
  });
  logError(request, requestId, safeStatusCode, error instanceof Error ? error.name : 'UnknownError');
}

export interface SecurityConfig {
  corsOrigins: string[];
  rateLimitWindowMs: number;
  rateLimitMax: number;
  enableHsts: boolean;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX = 120;

function getSecurityConfig(overrides: Partial<SecurityConfig> = {}): SecurityConfig {
  return {
    corsOrigins:
      overrides.corsOrigins ??
      parseCsv(process.env.API_CORS_ORIGINS ?? process.env.API_CORS_ORIGIN ?? process.env.CORS_ORIGIN ?? 'http://localhost:3000'),
    rateLimitWindowMs:
      overrides.rateLimitWindowMs ??
      parsePositiveEnvInteger(process.env.API_RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT_WINDOW_MS),
    rateLimitMax:
      overrides.rateLimitMax ??
      parsePositiveEnvInteger(process.env.API_RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT_MAX),
    enableHsts: overrides.enableHsts ?? process.env.API_ENABLE_HSTS === 'true',
  };
}

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parsePositiveEnvInteger(value: string | undefined, defaultValue: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

function applySecurityHeaders(
  request: IncomingMessage,
  response: ServerResponse,
  security: SecurityConfig,
  requestId: string,
): void {
  response.setHeader('x-request-id', requestId);
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('cross-origin-resource-policy', 'same-site');
  response.setHeader('content-security-policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  response.setHeader('permissions-policy', 'geolocation=(), microphone=(), camera=()');
  if (security.enableHsts) {
    response.setHeader('strict-transport-security', 'max-age=15552000; includeSubDomains');
  }

  const origin = request.headers.origin;
  if (typeof origin === 'string' && isCorsOriginAllowed(origin, security.corsOrigins)) {
    response.setHeader('access-control-allow-origin', security.corsOrigins.includes('*') ? '*' : origin);
    response.setHeader('vary', 'Origin');
  }
  response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type');
  response.setHeader('access-control-max-age', '600');
}

function isCorsOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.includes('*') || allowedOrigins.includes(origin);
}

function handleCorsPreflight(request: IncomingMessage, response: ServerResponse): boolean {
  if (request.method !== 'OPTIONS') {
    return false;
  }
  response.statusCode = 204;
  response.end();
  return true;
}

function createRateLimiter(windowMs: number, maxRequests: number) {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key: string): RateLimitResult {
      const now = Date.now();
      for (const [bucketKey, bucket] of buckets) {
        if (bucket.resetAt <= now) {
          buckets.delete(bucketKey);
        }
      }

      const current = buckets.get(key);
      const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };
      bucket.count += 1;
      buckets.set(key, bucket);

      return {
        allowed: bucket.count <= maxRequests,
        remaining: Math.max(maxRequests - bucket.count, 0),
        resetAt: bucket.resetAt,
      };
    },
  };
}

function getRateLimitKey(request: IncomingMessage): string {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim() !== '') {
    return forwardedFor.split(',')[0]?.trim() || request.socket.remoteAddress || 'unknown';
  }
  return request.socket.remoteAddress || 'unknown';
}

function applyRateLimitHeaders(response: ServerResponse, result: RateLimitResult, maxRequests: number): void {
  response.setHeader('ratelimit-limit', String(maxRequests));
  response.setHeader('ratelimit-remaining', String(result.remaining));
  response.setHeader('ratelimit-reset', String(Math.ceil(result.resetAt / 1000)));
}

function logError(request: IncomingMessage, requestId: string, statusCode: number, errorName: string): void {
  const url = new URL(request.url ?? '/', 'http://localhost');
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'api_request_error',
      request_id: requestId,
      method: request.method ?? 'GET',
      path: url.pathname,
      status_code: statusCode,
      error: errorName,
    }),
  );
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
): Promise<{ statusCode: number; body: string; headers: Headers; json: () => unknown }> {
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
              headers: response.headers,
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
