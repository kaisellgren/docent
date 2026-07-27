# Docent implementation status

Updated: 2026-07-28

## Honest roadmap progress

Overall completion is approximately **35–40%**: two roadmap steps are complete, seven are partial, and one has not started.

| Roadmap step | Status | What exists | What remains |
| --- | --- | --- | --- |
| 1. Foundation | Complete | Node 26 / TypeScript 7 scaffold, Podman Compose PostgreSQL+pgvector, dbmate config, roadmap, Vite/TanStack configuration | Verify Podman on a host where Podman is available |
| 2. Data layer | Complete | Slonik helpers and initial dbmate schema for users, pages/revisions, files/folders/tags, jobs/chunks, conversations/citations | Run migration against local PostgreSQL and Neon |
| 3. Auth | Partial | Google OAuth/session functions and deploy-time `EDITOR_EMAILS` role checks | Restore functional OAuth start/callback/logout routes; current UI links to `/auth/google`, but API routes were removed during framework compatibility work |
| 4. Wiki pages | Partial | SSR browse/create/edit/render/current revision/soft-delete flow | Revision history, restore workflow, better errors, page attachment UI |
| 5. File library | Partial | Signed upload intent, server-side PDF/DOCX/ODT validation, 5 MiB limit, folder/tag schema and basic UI | Nested folder UX, move/delete/download, page attachment UI, list tags |
| 6. Ingestion | Partial | PDF/DOCX/ODT extraction, chunking, Vertex embeddings, job states, pgvector persistence | Cloud Tasks enqueue, authenticated worker endpoint, retry action/status UI, integration tests |
| 7. AI chat | Partial | Private conversation/message schema, pgvector retrieval, Vertex answer generation, citations that link to pages | Streaming, new/resume conversation UI, robust citations, make Mastra drive the agent rather than only initializing it |
| 8. GCP infrastructure | Partial | CDKTF scaffold for one `europe-north1` dev environment, Cloud Run, Storage, Tasks, Artifact Registry, service account, Secret Manager placeholders | Validate/synth CDKTF; IAM; public Cloud Run invocation; secret-version env mounts; task target; container build; budget alert; WIF resources |
| 9. CI/CD | Partial | GitHub Actions runs install/typecheck/lint/test/build/synth | GitHub OIDC Workload Identity Federation and main-only build/push/deploy workflow |
| 10. Test coverage | Not started | Vitest and Playwright configuration files only | Unit tests, Playwright journeys, and running them in CI |

## Existing commits

- `0d885ae` — foundation scaffold
- `48d17a8` — database schema and Slonik
- `6ae8131` — OAuth/session and editor-role logic
- `06347f9` — dependency compatibility fixes
- `5ab508c` — Markdown wiki UI
- `ee08493` — file library foundation
- `87b40f9` — ingestion and cited chat foundation
- `cf3063f` — CDKTF/CI scaffold

## Current verification state

- `npm install` completes, with existing transitive Mastra peer-dependency warnings and npm audit findings.
- `npm run build` and `npm run typecheck` passed before the final infrastructure commit.
- CDKTF has **not** been synthesized successfully after `infra/main.ts` was adjusted to the current provider namespace API.
- Podman could not run in the prior sandbox due its runtime directory being read-only; this is environmental, not a project configuration result.

## Recommended continuation order

1. Repair OAuth routes using the currently installed TanStack Start API pattern, then test sign-in locally.
2. Run local PostgreSQL through Podman and apply `dbmate up`; add a seeded editor/user fixture.
3. Complete page revision restore and file-library management/attachment flows.
4. Implement the Cloud Tasks producer plus authenticated Cloud Run ingestion endpoint; integration-test page and file indexing.
5. Replace the direct Vertex chat call with a real Mastra agent setup and add streaming/history UI.
6. Finish and synthesize CDKTF, then implement GitHub OIDC deployment after the GCP project identifiers are available.
7. Add Vitest and Playwright tests, run all checks, and update this file as each roadmap step becomes complete.

## Important configuration

- `EDITOR_EMAILS` defaults to `kaisellgren@gmail.com`; all signed-in Google users should remain viewers.
- Production PostgreSQL is Neon. Store its connection URL in the `docent-neon-url` Secret Manager secret; local PostgreSQL is Podman.
- Uploads are PDF, DOCX, and ODT only, maximum 5 MiB.
- The sole GCP environment is `dev` in `europe-north1`; retain Cloud Run's provided URL and do not add CDN, WAF, custom DNS, or Cloud SQL.
