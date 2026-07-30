# Dev deployment

Set `GOOGLE_CLOUD_PROJECT`, then run `npm run infra:deploy`. Populate the four Secret Manager secrets with the Neon URL, Google OAuth client ID/secret, and a 32+ character session secret. Register `${Cloud Run URL}/auth/google/callback` in Google OAuth. GitHub deployment should use Workload Identity Federation and deploy only from `main`; no CDN, WAF, custom DNS, or Cloud SQL is provisioned.

## Local cloud-backed testing

Local development uses Podman PostgreSQL and can use the single `dev` GCP project's Vertex AI and Cloud Storage bucket. Authenticate Application Default Credentials with `gcloud auth application-default login`, then set `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, and `GCS_BUCKET` in `.env`.

Leave every Cloud Tasks setting blank locally. After creating or uploading content, run `npm run ingestion:worker` to process up to ten pending jobs with the local database, dev bucket, and Vertex AI. Cloud Run enables Cloud Tasks only when all task settings are present.
