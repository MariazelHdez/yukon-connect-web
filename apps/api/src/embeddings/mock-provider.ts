import { DEFAULT_EMBEDDING_DIMENSIONS, type EmbeddingProvider } from './provider.ts';

export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'mock';
  readonly dimensions: number;

  constructor(dimensions = DEFAULT_EMBEDDING_DIMENSIONS) {
    if (!Number.isInteger(dimensions) || dimensions <= 0) {
      throw new Error('MockEmbeddingProvider dimensions must be a positive integer.');
    }

    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const vector = Array.from({ length: this.dimensions }, () => 0);
    const normalizedText = text.trim().toLowerCase();

    if (!normalizedText) {
      return vector;
    }

    const tokens = normalizedText.match(/[\p{L}\p{N}]+/gu) ?? [normalizedText];

    for (const token of tokens) {
      let hash = 2166136261;
      for (const character of token) {
        hash ^= character.codePointAt(0) ?? 0;
        hash = Math.imul(hash, 16777619) >>> 0;
      }

      const index = hash % this.dimensions;
      const sign = hash & 1 ? 1 : -1;
      vector[index] += sign;
    }

    const magnitude = Math.hypot(...vector);
    if (magnitude === 0) {
      return vector;
    }

    return vector.map((value) => value / magnitude);
  }
}
