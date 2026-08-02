import { GoogleAuth } from 'google-auth-library'
import { env } from '@/server/env'
import { geminiEmbeddingInput } from '@/features/ai/embedding-input'

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
const EMBEDDING_DIMENSION = 768
const GEMINI_EMBEDDING_2 = 'gemini-embedding-2'

async function vertexFetch(path: string, body: unknown, serviceEndpoint?: string) {
  const project = env().GOOGLE_CLOUD_PROJECT
  if (!project) throw new Error('GOOGLE_CLOUD_PROJECT is required for Vertex AI')
  const client = await auth.getClient()
  const token = await client.getAccessToken()
  const location = env().VERTEX_AI_LOCATION
  const host =
    serviceEndpoint ?? (location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`)
  const endpoint = `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${path}`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const detail = (await response.text()).trim().slice(0, 2000)
    throw new Error(
      `Vertex AI request failed (${response.status} ${response.statusText}) at ${endpoint}${detail ? `: ${detail}` : ''}`,
    )
  }
  return response.json() as Promise<unknown>
}

export async function embedText(
  text: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT',
): Promise<number[]> {
  const model = env().VERTEX_EMBEDDING_MODEL
  const response = model.startsWith(GEMINI_EMBEDDING_2)
    ? ((await vertexFetch(
        `${model}:embedContent`,
        {
          content: { parts: [{ text: geminiEmbeddingInput(text, taskType) }] },
          embedContentConfig: { outputDimensionality: EMBEDDING_DIMENSION },
        },
        `aiplatform.${env().VERTEX_AI_LOCATION}.rep.googleapis.com`,
      )) as { embedding?: { values?: number[] } })
    : ((await vertexFetch(`${model}:predict`, {
        instances: [{ content: text, task_type: taskType }],
        parameters: { outputDimensionality: EMBEDDING_DIMENSION },
      })) as { predictions?: Array<{ embeddings?: { values?: number[] } }> })
  const values =
    (response as { embedding?: { values?: number[] }; predictions?: Array<{ embeddings?: { values?: number[] } }> })
      .embedding?.values ??
    (response as { predictions?: Array<{ embeddings?: { values?: number[] } }> }).predictions?.[0]?.embeddings?.values
  if (!values || values.length !== EMBEDDING_DIMENSION)
    throw new Error(
      `Vertex embedding response was invalid for model ${model}: expected ${EMBEDDING_DIMENSION} dimensions, received ${values?.length ?? 0}`,
    )
  return values
}
