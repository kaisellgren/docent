import { describe, expect, it } from 'vitest';
import { chunkText } from './chunk';

describe('chunkText', () => {
  it('normalizes whitespace and omits empty chunks', () => {
    expect(chunkText('  alpha\n\tbeta   gamma  ', 2, 2)).toEqual(['alpha beta', 'gamma']);
    expect(chunkText('   ')).toEqual([]);
  });

  it('keeps the configured overlap between chunks', () => {
    const words = Array.from({ length: 7 }, (_, index) => `word-${index + 1}`).join(' ');
    expect(chunkText(words, 4, 3)).toEqual([
      'word-1 word-2 word-3 word-4',
      'word-4 word-5 word-6 word-7',
      'word-7',
    ]);
  });
});
