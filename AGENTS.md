# AGENTS.md

## Project overview

Docent is a TypeScript application built with TanStack Start, React, Vite, and Vanilla Extract. It provides wiki spaces, file uploads and previews, authentication, chat, and AI-assisted ingestion. The application uses PostgreSQL with pgvector, Google Cloud Storage, Vertex AI, and Cloud Tasks in deployed environments. Infrastructure is defined with CDKTF in `infra/`.

## Repository layout

- `src/routes/` — TanStack Router pages and HTTP endpoints.
- `src/components/` — reusable React components.
- `src/features/` — domain logic for chat, files, ingestion, and wiki spaces.
- `src/server/` — server-only authentication, database, environment, and content helpers.
- `src/mastra/` — Mastra AI configuration.
- `src/commands/` — executable workers and maintenance commands.
- `db/migrations/` — dbmate SQL migrations.
- `infra/` — CDKTF Google Cloud infrastructure definitions.
- `docs/` — operational and deployment documentation.
- `.github/workflows/` — CI and deployment pipelines.

## Development commands

Use Node.js 26 and npm 11, as specified in `package.json`. Install dependencies with `npm ci`.

- `npm run dev` — start the Vite development server.
- `npm run typecheck` — run strict TypeScript checking.
- `npm run lint` — run Oxlint.
- `npm run test` — run Vitest tests.
- `npm run test:e2e` — run Playwright end-to-end tests.
- `npm run build` — create the production build.
- `npm run infra:synth` — synthesize CDKTF infrastructure.

For local database-backed development, start PostgreSQL and apply migrations with `npm run db:up` and `npm run db:migrate`. Run `npm run ingestion:watch` separately when testing indexing. See `docs/deployment.md` for required cloud credentials and environment variables.

## Change conventions

- Preserve strict TypeScript settings and existing import aliases (`@/*` maps to `src/*`).
- Keep server-only code out of client components. Treat authentication, database access, cloud credentials, and ingestion workers as server-side concerns.
- Add or update focused tests alongside domain logic, especially for ingestion and parsing behavior.
- Add database changes as a new timestamped migration in `db/migrations/`; do not rewrite migrations that may already have been applied.
- Keep generated output (`dist/`, `cdktf.out/`) and secrets (`.env`) out of commits.
- Avoid logging credentials, tokens, uploaded content, or other sensitive user data.
- Use the existing formatter and linter conventions; prefer the smallest targeted change.

## Verification

Before handing off a change, run the checks relevant to it. For broad changes, use the same sequence as CI:

```sh
npm run typecheck
npm run lint
npm run test
npm run build
npm run infra:synth
```

Do not run deployment commands or modify cloud resources unless explicitly requested. Never commit values from `.env`, OAuth secrets, database URLs, or service-account credentials.

## Git convention

Use Conventional Commits style for Git commit messages.
