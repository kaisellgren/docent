import { describe, expect, it } from 'vitest'
import { geminiEmbeddingInput, vertexEmbeddingServiceEndpoint } from './embedding-input'

describe('Gemini Embedding 2 input instructions', () => {
  it('formats document and query inputs for asymmetric retrieval', () => {
    expect(geminiEmbeddingInput('A document', 'RETRIEVAL_DOCUMENT')).toBe('title: none | text: A document')
    expect(geminiEmbeddingInput('A question', 'RETRIEVAL_QUERY')).toBe('task: search result | query: A question')
  })

  it('uses the standard global endpoint and regional embedding endpoint', () => {
    expect(vertexEmbeddingServiceEndpoint('global')).toBe('aiplatform.googleapis.com')
    expect(vertexEmbeddingServiceEndpoint('us')).toBe('aiplatform.us.rep.googleapis.com')
  })
})
