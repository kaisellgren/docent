import { GoogleAuth } from 'google-auth-library';
import { env } from '@/server/env';

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

async function vertexFetch(path: string, body: unknown) {
  const project = env().GOOGLE_CLOUD_PROJECT;
  if (!project) throw new Error('GOOGLE_CLOUD_PROJECT is required for Vertex AI');
  const client = await auth.getClient(); const token = await client.getAccessToken();
  const response = await fetch(`https://${env().GOOGLE_CLOUD_LOCATION}-aiplatform.googleapis.com/v1/projects/${project}/locations/${env().GOOGLE_CLOUD_LOCATION}/publishers/google/models/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Vertex AI request failed: ${response.status} ${await response.text()}`);
  return response.json() as Promise<unknown>;
}

export async function embedText(text: string, taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT'): Promise<number[]> {
  const response = await vertexFetch(`${env().VERTEX_EMBEDDING_MODEL}:predict`, { instances: [{ content: text, task_type: taskType }], parameters: { outputDimensionality: 768 } }) as { predictions?: Array<{ embeddings?: { values?: number[] } }> };
  const values = response.predictions?.[0]?.embeddings?.values;
  if (!values || values.length !== 768) throw new Error('Vertex did not return a 768-dimensional embedding');
  return values;
}

export async function answerWithVertex(question: string, context: string): Promise<string> {
  const response = await vertexFetch(`${env().VERTEX_CHAT_MODEL}:generateContent`, { contents: [{ role: 'user', parts: [{ text: `You are Docent, a precise internal knowledge assistant. Answer only from the supplied knowledge. Cite source numbers such as [1] when you rely on them. If evidence is insufficient, say so.\n\nKnowledge:\n${context}\n\nQuestion: ${question}` }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 1024 } }) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return response.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') || 'I could not produce an answer from the indexed knowledge.';
}
