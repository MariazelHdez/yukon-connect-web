import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from './app.ts';

test('GET /health returns ok without DATABASE_URL', async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  const app = createApp({ db: null });
  const response = await app.inject('/health');
  const body = response.json() as { status: string; database: { configured: boolean; connected: boolean } };

  assert.equal(response.statusCode, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.database.configured, false);
  assert.equal(body.database.connected, false);

  if (originalDatabaseUrl !== undefined) {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

test('GET /contracts validates and returns paginated contracts', async () => {
  const repository = {
    async listContracts(query: { page: number; pageSize: number; vendor?: string }) {
      assert.deepEqual(query, { page: 2, pageSize: 10, vendor: 'Acme Ltd' });
      return {
        data: [
          {
            id: 123,
            contract_no: 'C-123',
            contract_description: 'Road maintenance',
            vendor: 'Acme Ltd',
            department: 'Highways',
            community: 'Whitehorse',
            contract_type: 'Services',
            tender_class: 'Open',
            fiscal_year: '2025-26',
            type_code: 'S',
            type_name: 'Service',
            amount: 1000,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-02T00:00:00.000Z',
          },
        ],
        pagination: { page: 2, pageSize: 10, total: 1 },
      };
    },
    async getContract() {
      return null;
    },
    async getFilters() {
      return {
        vendors: [],
        departments: [],
        communities: [],
        fiscalYears: [],
        contractTypes: [],
        tenderClasses: [],
        projectManagers: [],
      };
    },
  };

  const app = createApp({ db: null, repository });
  const response = await app.inject('/contracts?page=2&pageSize=10&vendor=Acme%20Ltd');
  const body = response.json() as { data: unknown[]; pagination: { page: number; pageSize: number; total: number } };

  assert.equal(response.statusCode, 200);
  assert.equal(body.data.length, 1);
  assert.deepEqual(body.pagination, { page: 2, pageSize: 10, total: 1 });
});

test('GET /contracts rejects invalid pagination', async () => {
  const app = createApp({ db: null, repository: {} as never });
  const response = await app.inject('/contracts?page=0');
  const body = response.json() as { error: string; details: string[] };

  assert.equal(response.statusCode, 400);
  assert.equal(body.error, 'Invalid request parameters.');
  assert.deepEqual(body.details, ['page must be a positive integer.']);
});

test('GET /contracts passes q through and returns ranked search results', async () => {
  const repository = {
    async listContracts(query: { page: number; pageSize: number; q?: string }) {
      assert.deepEqual(query, { page: 1, pageSize: 25, q: 'construction' });
      return {
        data: [
          {
            id: 456,
            contract_no: 'C-456',
            contract_description: 'Bridge construction materials',
            vendor: 'Road Builders Ltd',
            department: 'Highways',
            community: 'Whitehorse',
            contract_type: 'Construction',
            tender_class: 'Open',
            fiscal_year: '2025-26',
            type_code: 'C',
            type_name: 'Construction',
            amount: 5000,
            project_manager: 'Jane Manager',
            score: 0.75,
            match_reason: ['full_text', 'synonym_match'],
            created_at: '2026-01-03T00:00:00.000Z',
            updated_at: '2026-01-04T00:00:00.000Z',
          },
        ],
        pagination: { page: 1, pageSize: 25, total: 1 },
      };
    },
    async getContract() {
      return null;
    },
    async getFilters() {
      return {
        vendors: [],
        departments: [],
        communities: [],
        fiscalYears: [],
        contractTypes: [],
        tenderClasses: [],
        projectManagers: [],
      };
    },
  };

  const app = createApp({ db: null, repository });
  const response = await app.inject('/contracts?q=construction');
  const body = response.json() as { data: Array<{ score?: number; match_reason?: string[] }> };

  assert.equal(response.statusCode, 200);
  assert.equal(body.data[0]?.score, 0.75);
  assert.deepEqual(body.data[0]?.match_reason, ['full_text', 'synonym_match']);
});


test('POST /feedback validates, sanitizes, saves feedback, and returns no sensitive fields', async () => {
  const savedFeedback = {
    id: 42,
    status: 'new',
    created_at: '2026-06-12T00:00:00.000Z',
  };
  const feedbackRepository = {
    async createFeedback(feedback: { name: string; email: string; message: string; context: unknown }) {
      assert.deepEqual(feedback, {
        name: 'Jane Doe',
        email: 'jane@example.com',
        message: 'This is detailed feedback for Yukon Connect.',
        context: {
          url: 'http://localhost:3000/?q=roads',
          search: 'q=roads',
        },
      });
      return savedFeedback;
    },
  };

  const app = createApp({ db: null, feedbackRepository });
  const response = await app.inject('/feedback', {
    method: 'POST',
    body: {
      name: '  Jane   Doe ',
      email: '  JANE@example.com ',
      message: ' This is detailed feedback for Yukon Connect. ',
      context: {
        url: ' http://localhost:3000/?q=roads ',
        search: ' q=roads ',
      },
    },
  });
  const body = response.json() as { id: number; status: string; created_at: string; email?: string; message?: string };

  assert.equal(response.statusCode, 201);
  assert.deepEqual(body, savedFeedback);
  assert.equal(body.email, undefined);
  assert.equal(body.message, undefined);
});

test('POST /feedback rejects invalid feedback input', async () => {
  const feedbackRepository = {
    async createFeedback() {
      throw new Error('createFeedback should not be called for invalid feedback.');
    },
  };

  const app = createApp({ db: null, feedbackRepository });
  const response = await app.inject('/feedback', {
    method: 'POST',
    body: {
      name: '',
      email: 'invalid',
      message: 'short',
    },
  });
  const body = response.json() as { error: string; details: string[] };

  assert.equal(response.statusCode, 400);
  assert.equal(body.error, 'Invalid request parameters.');
  assert.deepEqual(body.details, ['name is required.', 'email must be a valid email address.', 'message must be at least 10 characters.']);
});

test('GET /contracts rejects pageSize above the maximum', async () => {
  const app = createApp({ db: null, repository: {} as never });
  const response = await app.inject('/contracts?pageSize=100000');
  const body = response.json() as { error: string; details: string[] };

  assert.equal(response.statusCode, 400);
  assert.equal(body.error, 'Invalid request parameters.');
  assert.deepEqual(body.details, ['pageSize must be less than or equal to 100.']);
});

test('security headers and CORS use configured allowed origins', async () => {
  const app = createApp({ db: null, security: { corsOrigins: ['https://contracts.example.gov'] } });
  const response = await app.inject('/health', { headers: { origin: 'https://contracts.example.gov' } });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://contracts.example.gov');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
});


test('GET /contracts does not allow disallowed CORS origins', async () => {
  const app = createApp({ db: null, security: { corsOrigins: ['https://contracts.example.gov'] } });
  const response = await app.inject('/health', { headers: { origin: 'https://evil.example' } });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('CORS preflight responds before route handling', async () => {
  const app = createApp({ db: null, security: { corsOrigins: ['https://contracts.example.gov'] } });
  const response = await app.inject('/contracts', {
    method: 'OPTIONS',
    headers: { origin: 'https://contracts.example.gov', 'access-control-request-method': 'GET' },
  });

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://contracts.example.gov');
  assert.equal(response.headers.get('access-control-allow-methods'), 'GET,POST,OPTIONS');
});

test('rate limiting rejects requests over the configured limit', async () => {
  const app = createApp({ db: null, security: { rateLimitMax: 1, rateLimitWindowMs: 60_000 } });
  const first = await app.inject('/health');
  const second = await app.inject('/health');
  const body = second.json() as { error: string };

  assert.equal(first.statusCode, 200);
  assert.equal(first.headers.get('ratelimit-limit'), '1');
  assert.equal(second.statusCode, 429);
  assert.equal(second.headers.get('retry-after'), '60');
  assert.deepEqual(body, { error: 'Too many requests.' });
});

test('unexpected errors return generic responses and structured logs without request query or secrets', async () => {
  const originalConsoleError = console.error;
  const logs: string[] = [];
  console.error = (message?: unknown) => {
    logs.push(String(message));
  };

  try {
    const repository = {
      async listContracts() {
        throw new Error('password=super-secret database failure');
      },
      async getContract() {
        return null;
      },
      async getFilters() {
        return {
          vendors: [],
          departments: [],
          communities: [],
          fiscalYears: [],
          contractTypes: [],
          tenderClasses: [],
          projectManagers: [],
        };
      },
    };
    const app = createApp({ db: null, repository });
    const response = await app.inject('/contracts?q=secret-query');
    const body = response.json() as { error: string };

    assert.equal(response.statusCode, 500);
    assert.deepEqual(body, { error: 'Internal server error.' });
    assert.equal(logs.length, 1);
    const log = JSON.parse(logs[0] ?? '{}') as { path: string; error: string; status_code: number };
    assert.equal(log.path, '/contracts');
    assert.equal(log.error, 'Error');
    assert.equal(log.status_code, 500);
    assert.doesNotMatch(logs[0] ?? '', /super-secret|secret-query|password/);
  } finally {
    console.error = originalConsoleError;
  }
});
