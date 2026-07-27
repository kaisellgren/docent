import { Mastra } from '@mastra/core/mastra';

// The application owns retrieval in PostgreSQL/pgvector; Mastra is the AI
// orchestration boundary for future agents, tools, and evaluation workflows.
export const docentMastra = new Mastra({ logger: false });
