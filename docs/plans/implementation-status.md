# Docent implementation status

Updated: 2026-07-30

## Honest roadmap progress

Overall completion is approximately **40–45%**: two roadmap steps are complete, seven are partial, and one has not started.

| Roadmap step | Status | What exists | What remains |
| --- | --- | --- | --- |
| 1. Foundation | Complete | Node 26 / TypeScript 7 scaffold, Podman Compose PostgreSQL+pgvector, dbmate config, roadmap, Vite/TanStack configuration | Verify Podman on a host where Podman is available |
| 2. Data layer | Complete | Slonik helpers and initial dbmate schema for users, pages/revisions, files/folders/tags, jobs/chunks, conversations/citations; migration applied to local PostgreSQL | Run migration against Neon when its connection URL is provisioned |
| 3. Auth | Partial | Google OAuth start/callback/logout server routes, signed sessions, and deploy-time `EDITOR_EMAILS` role checks | Create local OAuth credentials and register the Vite callback URL; verify a real Google sign-in |
| 4. Wiki pages | Partial | SSR browse/create/edit/render/current revision/soft-delete flow, revision history, and restore-as-new-revision | Better mutation errors and page attachment UI |
| 5. File library | Partial | Signed upload intent, server-side PDF/DOCX/ODT validation, 5 MiB limit, folder/tag schema, nested folder creation, tagged library listing, move/delete/download, and page attachments | Folder deletion/move UX and integration tests |
| 6. Ingestion | Partial | PDF/DOCX/ODT extraction, chunking, Vertex embeddings, job states, pgvector persistence, Cloud Tasks enqueueing, and authenticated worker endpoint | Cloud Run IAM/task-service-account wiring, retry action/status UI, integration tests |
| 7. AI chat | Partial | Private conversation/message schema, pgvector retrieval, Mastra/Vertex answer generation, and citations that link to pages | Streaming, new/resume conversation UI, and robust citations |
| 8. GCP infrastructure | Partial | CDKTF scaffold for one `europe-north1` dev environment, Cloud Run, Storage, Tasks, Artifact Registry, service account, Secret Manager placeholders; CDKTF synthesis succeeds | IAM; public Cloud Run invocation; secret-version env mounts; task target; container build; budget alert; WIF resources |
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
- `npm run build` and `npm run typecheck` pass after the OAuth, anonymous route, and revision-history updates.
- `npm run db:migrate` was run against local Podman PostgreSQL: `20260728100000_initial_schema.sql` is applied, with zero pending migrations.
- `npm run infra:synth` successfully generated the `docent-dev` Terraform stack.
- Podman could not run in the prior sandbox due its runtime directory being read-only; this is environmental, not a project configuration result.

## Recommended continuation order

1. Create local Google OAuth credentials, set them in `.env`, register `http://localhost:5173/auth/google/callback`, and test sign-in locally.
2. Add integration coverage for page/file indexing, then wire the Cloud Run IAM and task service account in CDKTF.
3. Add streaming plus new/resume conversation history UI to the Mastra chat flow.
4. Finish and synthesize CDKTF, then implement GitHub OIDC deployment after the GCP project identifiers are available.
5. Add Vitest and Playwright tests, run all checks, and update this file as each roadmap step becomes complete.

## Important configuration

- `EDITOR_EMAILS` defaults to `kaisellgren@gmail.com`; all signed-in Google users should remain viewers.
- Production PostgreSQL is Neon. Store its connection URL in the `docent-neon-url` Secret Manager secret; local PostgreSQL is Podman.
- Uploads are PDF, DOCX, and ODT only, maximum 5 MiB.
- The sole GCP environment is `dev` in `europe-north1`; retain Cloud Run's provided URL and do not add CDN, WAF, custom DNS, or Cloud SQL.
