export function geminiEmbeddingInput(text: string, taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY') {
  return taskType === 'RETRIEVAL_QUERY' ? `task: search result | query: ${text}` : `title: none | text: ${text}`
}

export function vertexEmbeddingServiceEndpoint(location: string) {
  return location === 'global' ? 'aiplatform.googleapis.com' : `aiplatform.${location}.rep.googleapis.com`
}
