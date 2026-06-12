import assert from 'node:assert/strict';
import test from 'node:test';
import { MockEmbeddingProvider } from './mock-provider.ts';
import { formatEmbeddingForPgVector } from './provider.ts';

test('MockEmbeddingProvider returns deterministic local embeddings without external services', async () => {
  const provider = new MockEmbeddingProvider(8);

  const first = await provider.embed('Road maintenance road');
  const second = await provider.embed('Road maintenance road');

  assert.deepEqual(first, second);
  assert.equal(first.length, 8);
  assert.ok(first.some((value) => value !== 0));
});

test('formatEmbeddingForPgVector serializes embeddings for pgvector parameters', () => {
  assert.equal(formatEmbeddingForPgVector([0, 1.25, -0, Number.NaN]), '[0,1.25,0,0]');
});
