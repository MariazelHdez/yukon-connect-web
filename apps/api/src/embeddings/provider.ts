export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
}

export const DEFAULT_EMBEDDING_DIMENSIONS = 384;

export function formatEmbeddingForPgVector(embedding: readonly number[]): string {
  return `[${embedding.map((value) => formatVectorNumber(value)).join(',')}]`;
}

function formatVectorNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }

  const normalizedZero = Object.is(value, -0) ? 0 : value;
  return normalizedZero.toFixed(6).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}
