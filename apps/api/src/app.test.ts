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
