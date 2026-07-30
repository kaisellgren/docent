# Docent demo roadmap

This roadmap is intentionally implemented as small, independently reviewable commits.

1. Scaffold the TanStack Start application, local Podman PostgreSQL + pgvector, dbmate, and shared tooling.
2. Add Slonik data access and the versioned wiki/file/chat schema.
3. Add Google OAuth sessions and the deploy-time editor allowlist.
4. Add Markdown spaces and pages: browsing, hierarchy, editing, revision history, and soft deletion.
5. Add the global Cloud Storage file library, folders, tags, and page attachments.
6. Add retry-safe asynchronous document extraction and Vertex embedding ingestion.
7. Add the Mastra/Vertex cited chat experience and private conversation history.
8. Provision the single `dev` GCP environment with CDKTF.
9. Add GitHub Actions verification and OIDC deployment.
10. Cover critical behavior with Vitest and Playwright.

Every step is committed separately. The deployment uses the Cloud Run URL, has no CDN or WAF, and uses Neon PostgreSQL in `dev`; local PostgreSQL runs through Podman.
