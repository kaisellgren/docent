# Docent implementation status

Updated: 2026-07-30

## Honest roadmap progress

Overall completion is approximately **55–60%**: three roadmap steps are complete and the remaining seven are partial.

| Roadmap step | Status | What exists | What remains |
| --- | --- | --- | --- |
| 1. Foundation | Complete | Node 26 / TypeScript 7 scaffold, Podman Compose PostgreSQL+pgvector, dbmate config, roadmap, Vite/TanStack configuration | Verify Podman on a host where Podman is available |
| 2. Data layer | Complete | Slonik helpers and initial dbmate schema for users, pages/revisions, files/folders/tags, jobs/chunks, conversations/citations; migration applied to local PostgreSQL | Run migration against Neon when its connection URL is provisioned |
| 3. Auth | Complete | Google OAuth start/callback/logout server routes, signed sessions, deploy-time `EDITOR_EMAILS` role checks, and verified local Google sign-in | Register the Cloud Run callback URL before production deployment |
| 4. Wiki pages | Partial | SSR browse/create/edit/render/current revision/soft-delete flow, revision history, and restore-as-new-revision | Better mutation errors and page attachment UI |
| 5. File library | Partial | Signed upload intent, server-side PDF/DOCX/ODT validation, 5 MiB limit, folder/tag schema, nested folder creation, tagged library listing, move/delete/download, and page attachments | Folder deletion/move UX and integration tests |
| 6. Ingestion | Partial | PDF/DOCX/ODT extraction, chunking, Vertex embeddings, job states, pgvector persistence, local one-shot worker, Cloud Tasks enqueueing, authenticated worker endpoint, and task caller identity/IAM | Configure the Cloud Run task target after its first deployment, retry action/status UI, integration tests |
| 7. AI chat | Partial | Private conversation/message schema, pgvector retrieval, Mastra/Vertex answer generation, cited answers, and new/resume history UI with persisted citations | Streaming |
| 8. GCP infrastructure | Partial | One deployed dev environment: Cloud Run, Storage, Cloud Tasks, Artifact Registry, runtime/task service accounts, least-privilege IAM, populated Secret Manager versions, and a runnable container image. Cloud Run responds with HTTP 200 and CDKTF synthesis succeeds. | Budget alert; WIF resources; remote Terraform state before CI/CD |
| 9. CI/CD | Partial | GitHub Actions runs install/typecheck/lint/test/build/synth | GitHub OIDC Workload Identity Federation and main-only build/push/deploy workflow |
| 10. Test coverage | Partial | Vitest and Playwright configuration plus ingestion chunking unit tests | Database/worker unit tests, Playwright journeys, and running them in CI |

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
- `npm run ingestion:worker` runs against local PostgreSQL and cleanly reports pending-job results; local Application Default Credentials are configured for GCS/Vertex processing.
- The `docent-dev` GCP bootstrap and Cloud Run service are deployed. Cloud Run, Storage, and Vertex use `europe-north1`; the `docent-ingestion` Cloud Tasks queue uses `europe-west1`, because Cloud Tasks does not support `europe-north1`.

## Recommended continuation order

1. Register the deployed Cloud Run Google OAuth callback, then verify production sign-in.
2. Set the local GCS bucket value and validate one local upload/indexing cycle against the dev GCS bucket and Vertex AI.
3. Add integration coverage for page/file indexing and retry/status UI.
4. Add streaming to the Mastra chat flow.
5. Configure remote Terraform state, budget alert, and GitHub OIDC deployment, then expand Vitest and Playwright coverage.

## Important configuration

- `EDITOR_EMAILS` defaults to `kaisellgren@gmail.com`; all signed-in Google users should remain viewers.
- Production PostgreSQL is Neon. Store its connection URL in the `docent-neon-url` Secret Manager secret; local PostgreSQL is Podman.
- Uploads are PDF, DOCX, and ODT only, maximum 5 MiB.
- The sole GCP environment is `dev`: Cloud Run, Storage, and Vertex are in `europe-north1`; Cloud Tasks is in its nearest supported region, `europe-west1`. Retain Cloud Run's provided URL and do not add CDN, WAF, custom DNS, or Cloud SQL.
