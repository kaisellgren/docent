# Docent implementation status

Updated: 2026-07-30

## Honest roadmap progress

Overall completion is approximately **70%**: foundation, data, authentication, spaces/pages, and CI/CD are complete; the remaining work is concentrated in file-library polish, ingestion validation, chat streaming, budget alerts, and test coverage.

| Roadmap step | Status | What exists | What remains |
| --- | --- | --- | --- |
| 1. Foundation | Complete | Node 26 / TypeScript 7 scaffold, Podman Compose PostgreSQL+pgvector, dbmate config, roadmap, Vite/TanStack configuration | Verify Podman on a host where Podman is available |
| 2. Data layer | Complete | Slonik helpers and initial dbmate schema for users, pages/revisions, files/folders/tags, jobs/chunks, conversations/citations; migrations applied to local PostgreSQL and Neon | — |
| 3. Auth | Complete | Google OAuth start/callback/logout server routes, signed sessions, deploy-time `EDITOR_EMAILS` role checks, and verified local and deployed Cloud Run Google sign-in | — |
| 4. Spaces and pages | Complete | Space browsing/creation, Markdown page creation/editing/rendering, parent-page hierarchy, revision history, restore-as-new-revision, page attachments, accessible mutation feedback, pending states, and duplicate-title handling | — |
| 5. File library | Partial | Signed upload intent, server-side PDF/DOCX/ODT validation, 5 MiB limit, folder/tag schema, nested folder creation, tagged library listing, move/delete/download, and page attachments | Folder deletion/move UX and integration tests |
| 6. Ingestion | Partial | PDF/DOCX/ODT extraction, chunking, Vertex embeddings, job states, pgvector persistence, local one-shot worker, Cloud Tasks enqueueing, an authenticated Cloud Run worker endpoint, and task caller identity/IAM | Validate the deployed upload-to-indexing path, then add retry action/status UI and integration tests |
| 7. AI chat | Partial | Private conversation/message schema, pgvector retrieval, Mastra/Vertex answer generation, cited answers, and new/resume history UI with persisted citations | Streaming |
| 8. GCP infrastructure | Partial | One deployed dev environment: Cloud Run, Storage, Cloud Tasks, Artifact Registry, runtime/task service accounts, least-privilege IAM, populated Secret Manager versions, a versioned GCS Terraform backend, and GitHub WIF. Cloud Run responds with HTTP 200 and CDKTF synthesis succeeds. | Budget alert |
| 9. CI/CD | Complete | GitHub Actions runs verification and a main-only keyless pipeline for infrastructure, Neon migrations, image publishing, Cloud Run deployment, and smoke testing; the first full deployment succeeded | — |
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
- `npm run db:migrate` was run against local Podman PostgreSQL, and the deploy workflow applied `20260728100000_initial_schema.sql` to Neon.
- `npm run infra:synth` successfully generated the `docent-dev` Terraform stack.
- `npm run ingestion:worker` runs against local PostgreSQL and cleanly reports pending-job results; local Application Default Credentials are configured for GCS/Vertex processing.
- The `docent-dev` GCP bootstrap and Cloud Run service are deployed. Cloud Run, Storage, and Vertex use `europe-north1`; the `docent-ingestion` Cloud Tasks queue uses `europe-west1`, because Cloud Tasks does not support `europe-north1`.
- The first GitHub Actions deployment completed successfully: it synthesized/deployed infrastructure, ran Neon migrations, published the container, deployed Cloud Run, and passed its smoke test. Google sign-in is verified on the deployed URL.

## Recommended continuation order

1. Validate one deployed upload/indexing cycle against the dev GCS bucket and Vertex AI.
2. Complete folder delete/move UX and add file/indexing integration coverage.
3. Add retry/status UI for ingestion failures.
4. Add streaming to the Mastra chat flow.
5. Configure the budget alert, then expand Vitest, Playwright, and CI coverage.

## Important configuration

- `EDITOR_EMAILS` defaults to `kaisellgren@gmail.com`; all signed-in Google users should remain viewers.
- Production PostgreSQL is Neon. Store its connection URL in the `docent-neon-url` Secret Manager secret; local PostgreSQL is Podman.
- Uploads are PDF, DOCX, and ODT only, maximum 5 MiB.
- The sole GCP environment is `dev`: Cloud Run, Storage, and Vertex are in `europe-north1`; Cloud Tasks is in its nearest supported region, `europe-west1`. Retain Cloud Run's provided URL and do not add CDN, WAF, custom DNS, or Cloud SQL.
