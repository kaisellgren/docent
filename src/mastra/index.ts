import { createVertex } from '@ai-sdk/google-vertex';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { env } from '@/server/env';

let docentAgent: Agent | undefined;
let docentMastra: Mastra | undefined;

export function getDocentAgent(): Agent {
  if (docentAgent) return docentAgent;
  const configuration = env();
  if (!configuration.GOOGLE_CLOUD_PROJECT) throw new Error('GOOGLE_CLOUD_PROJECT is required for the Docent agent');
  const vertex = createVertex({ project: configuration.GOOGLE_CLOUD_PROJECT, location: configuration.GOOGLE_CLOUD_LOCATION });
  docentAgent = new Agent({
    id: 'docent',
    name: 'docent',
    model: vertex(configuration.VERTEX_CHAT_MODEL),
    instructions: 'You are Docent, a precise internal knowledge assistant. Answer only from the supplied knowledge. Cite source numbers such as [1] when you rely on them. If evidence is insufficient, say so.',
  });
  docentMastra = new Mastra({ agents: { docent: docentAgent }, logger: false });
  return docentMastra.getAgent('docent');
}
