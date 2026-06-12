import assert from 'node:assert/strict';
import test from 'node:test';
import { ContractsRepository } from './repository.ts';
import type { DatabaseClient, QueryResult, QueryValue } from '../db/database.ts';

class RecordingDb implements DatabaseClient {
  readonly calls: Array<{ sql: string; values: QueryValue[] }> = [];

  async query<Row>(sql: string, values: QueryValue[] = []): Promise<QueryResult<Row>> {
    this.calls.push({ sql, values });
    if (/count\(\*\)::int as total/.test(sql)) {
      return { rows: [{ total: 0 } as Row], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  }

  async close(): Promise<void> {}
}

test('listContracts uses contract_search_index full-text search and rank when q exists', async () => {
  const db = new RecordingDb();
  const repository = new ContractsRepository(db);

  await repository.listContracts({ page: 1, pageSize: 25, q: 'construction', vendor: 'Acme Ltd' });

  const [dataQuery, countQuery] = db.calls;
  assert.ok(dataQuery);
  assert.ok(countQuery);
  assert.match(dataQuery.sql, /websearch_to_tsquery\('english', \$2\)/);
  assert.match(dataQuery.sql, /left join contract_search_index csi on csi\.contract_record_id = v\.id/);
  assert.match(dataQuery.sql, /csi\.search_vector @@ sq\.query/);
  assert.match(dataQuery.sql, /ts_rank_cd\(csi\.search_vector, sq\.query\)/);
  assert.match(dataQuery.sql, /lower\(v\.contract_no\) = lower\(sq\.raw_query\) then 1000/);
  assert.match(dataQuery.sql, /v\.vendor ilike '%' \|\| sq\.raw_query \|\| '%' then 125/);
  assert.match(dataQuery.sql, /v\.project_manager ilike '%' \|\| sq\.raw_query \|\| '%' then 125/);
  assert.match(dataQuery.sql, /order by score desc/);
  assert.deepEqual(dataQuery.values, ['Acme Ltd', 'construction', 25, 0]);
  assert.deepEqual(countQuery.values, ['Acme Ltd', 'construction']);
});

class MissingSearchIndexDb implements DatabaseClient {
  readonly calls: Array<{ sql: string; values: QueryValue[] }> = [];

  async query<Row>(sql: string, values: QueryValue[] = []): Promise<QueryResult<Row>> {
    this.calls.push({ sql, values });
    if (/contract_search_index/.test(sql)) {
      const error = new Error('relation "contract_search_index" does not exist') as Error & { code: string };
      error.code = '42P01';
      throw error;
    }

    if (/count\(\*\)::int as total/.test(sql)) {
      return { rows: [{ total: 0 } as Row], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  }

  async close(): Promise<void> {}
}

test('listContracts falls back to direct vw_contracts_full search when contract_search_index is missing', async () => {
  const db = new MissingSearchIndexDb();
  const repository = new ContractsRepository(db);

  await repository.listContracts({ page: 1, pageSize: 25, q: 'bridge' });

  assert.equal(db.calls.length, 4);
  const [indexedDataQuery, indexedCountQuery, fallbackDataQuery, fallbackCountQuery] = db.calls;
  assert.match(indexedDataQuery.sql, /contract_search_index/);
  assert.match(indexedCountQuery.sql, /contract_search_index/);
  assert.doesNotMatch(fallbackDataQuery.sql, /contract_search_index/);
  assert.doesNotMatch(fallbackCountQuery.sql, /contract_search_index/);
  assert.match(fallbackDataQuery.sql, /v\.contract_description ilike '%' \|\| sq\.raw_query \|\| '%'/);
  assert.deepEqual(fallbackDataQuery.values, ['bridge', 25, 0]);
  assert.deepEqual(fallbackCountQuery.values, ['bridge']);
});
