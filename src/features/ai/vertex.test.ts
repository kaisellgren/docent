import { describe, expect, it } from 'vitest'
import { geminiEmbeddingInput } from './embedding-input'

describe('Gemini Embedding 2 input instructions', () => {
  it('formats document and query inputs for asymmetric retrieval', () => {
    expect(geminiEmbeddingInput('A document', 'RETRIEVAL_DOCUMENT')).toBe('title: none | text: A document')
    expect(geminiEmbeddingInput('A question', 'RETRIEVAL_QUERY')).toBe('task: search result | query: A question')
  })
})
