# Docent

Docent is an AI-powered knowledge workspace for teams that want their internal pages and files to be easy to understand, search, and discuss.

It combines a calm wiki experience with reliable document ingestion and grounded AI answers. People can organize knowledge into spaces, upload PDF/DOCX/ODT files, and ask questions that are answered with citations back to the source material.

## Why it stands out

- **Answers grounded in your knowledge.** Docent retrieves relevant passages from indexed pages and files before asking the AI to answer. This keeps answers connected to the organization’s actual content instead of relying on unsupported guesses.
- **Citations people can verify.** Answers link back to the exact page or file excerpt that informed them, making the system useful for real work rather than just conversation.
- **AI that works behind the scenes.** The ingestion worker extracts text, creates embeddings, and prepares searchable knowledge automatically after content is added.
- **High-fidelity file previews.** PDFs and ODTs are converted server-side into self-contained HTML previews, while DOCX previews retain their document structure. Users can read and select text without downloading files or running browser-side PDF rendering code.
- **Reliable asynchronous processing.** Cloud Tasks and a dedicated ingestion worker keep uploads and page edits responsive. Jobs have explicit pending, processing, ready, and failed states with retry support and actionable diagnostics.
- **Built for secure deployment.** Google OAuth, signed Cloud Storage URLs, service-account IAM, isolated preview conversion, sandboxed iframes, and server-only credentials keep sensitive operations out of the browser.

## How the AI works

```text
Page edit or file upload
          |
          v
  Ingestion job is queued
          |
          v
  Text extraction + chunking
          |
          v
 Gemini Embedding 2 vectors
          |
          v
 PostgreSQL + pgvector
          |
          v
 User question -> query embedding -> nearest passages
          |
          v
 Grounded response with source citations
```

Docent uses **Gemini Embedding 2** through Vertex AI for retrieval embeddings. Document and query inputs use task-aware instructions, and vectors are stored at 768 dimensions to keep the PostgreSQL schema compact and efficient. The same retrieval path powers both file/page search and chat references.

The generation layer is configured through Mastra and Google Vertex AI. The model receives the retrieved knowledge as context, so the assistant can explain an answer while preserving a clear connection to the underlying sources.

## Product capabilities

- Wiki spaces with nested organization and favorites
- Markdown-based pages with revision history
- PDF, DOCX, and ODT uploads
- Folder and tag organization for files
- Searchable page and file content
- Conversational knowledge search with citations
- Selectable, high-fidelity previews in a sandboxed modal
- Google authentication and editor permissions
- Retryable ingestion jobs with visible status and error details

## Technology

| Area           | Technology                             |
| -------------- | -------------------------------------- |
| Frontend       | React, TanStack Router, TanStack Start |
| Styling        | Vanilla Extract                        |
| Language       | TypeScript with strict checking        |
| AI generation  | Mastra + Google Vertex AI              |
| Embeddings     | Gemini Embedding 2 via Vertex AI       |
| Database       | PostgreSQL with pgvector               |
| Storage        | Google Cloud Storage                   |
| Async work     | Google Cloud Tasks + ingestion worker  |
| Infrastructure | CDKTF and Google Cloud                 |
| Quality        | Vitest, Playwright, Oxlint, Oxfmt      |

## Local development

Requirements: Node.js 26, npm 11, PostgreSQL with pgvector, and Google Application Default Credentials for Vertex AI and Cloud Storage features.

```sh
npm ci
cp .env.example .env
npm run db:up
npm run db:migrate
npm run dev
```

In a second terminal, run the local ingestion worker:

```sh
npm run ingestion:watch
```

The worker polls local PostgreSQL when Cloud Tasks variables are left blank. Upload a file or edit a page, wait for the status to become `Indexed`, and then ask Docent a question about it.

## Useful commands

```sh
npm run dev             # Start the development server
npm run typecheck       # Strict TypeScript validation
npm run lint            # Lint and formatting checks
npm run test            # Unit tests
npm run test:e2e        # Playwright end-to-end tests
npm run build           # Production build
npm run infra:synth     # Synthesize CDKTF infrastructure
npm run ingestion:worker
```

Set `VERTEX_EMBEDDING_MODEL=gemini-embedding-2` in `.env` to use the current embedding path. The application keeps the embedding dimension aligned with the existing `vector(768)` database column. When changing embedding models, re-index existing content so documents and queries use the same vector space.

## Production architecture

The production deployment uses a small set of focused Google Cloud services:

- **Cloud Run** hosts the web application and authenticated ingestion endpoint.
- **Cloud Storage** stores uploaded originals and generated HTML previews.
- **Cloud Tasks** invokes ingestion asynchronously with an identity token.
- **Vertex AI** provides embeddings and answer generation.
- **PostgreSQL/pgvector** stores chunks, vectors, conversations, and citations.
- **Secret Manager** supplies database, OAuth, and session credentials at runtime.

Infrastructure is defined in [`infra/main.ts`](infra/main.ts), and deployment guidance lives in [`docs/deployment.md`](docs/deployment.md). The Cloud Run runtime uses least-privilege IAM bindings for storage access, task creation, task identity, and signed URL generation.

## Engineering principles

Docent is deliberately designed as a system, not just a prompt wrapped in a UI:

1. **Separate ingestion from interaction.** Users do not wait for extraction, conversion, embedding, or database work to finish before continuing.
2. **Make failures diagnosable.** Jobs persist their state and error message, while worker logs include the job identity and upstream API details without logging uploaded content.
3. **Keep server-only concerns server-side.** Authentication, database access, cloud credentials, file conversion, and ingestion stay out of client bundles.
4. **Prefer verifiable AI.** Retrieval context and citations make the assistant’s output inspectable.
5. **Protect existing data.** Re-indexing is explicit; existing preview objects are not rewritten automatically.

## Project structure

```text
src/routes/       TanStack Router pages and API endpoints
src/components/   Reusable React components
src/features/     Chat, files, wiki, ingestion, and AI domain logic
src/server/       Authentication, database, environment, and content helpers
src/mastra/       Mastra agent configuration
src/commands/     Ingestion and maintenance workers
db/migrations/    dbmate SQL migrations
infra/            CDKTF Google Cloud infrastructure
docs/             Deployment and project documentation
```

## Current focus

The foundation is in place for richer multimodal knowledge workflows: better document understanding, more expressive retrieval instructions, and additional source types can be added without changing the core product loop of **capture → understand → retrieve → explain**.
