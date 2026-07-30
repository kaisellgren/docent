# Dev deployment

Set `GOOGLE_CLOUD_PROJECT`, then run `npm run infra:deploy -- --auto-approve` to create the bootstrap resources: APIs, bucket, registry, queue, service accounts, IAM bindings, and empty secrets. This first phase intentionally does not create Cloud Run because it needs an image and secret versions. Cloud Run, Storage, and Vertex use `europe-north1`; Cloud Tasks uses `europe-west1`, the nearest supported queue region.

Push the image to the generated Artifact Registry repository and add the Neon URL, Google OAuth client ID/secret, and a 32+ character session secret as Secret Manager versions. Then run `DOCENT_DEPLOY_WEB=true npm run infra:deploy -- --auto-approve` to create Cloud Run with secret-version environment mounts. Copy its generated `service_url` and register `${Cloud Run URL}/auth/google/callback` in Google OAuth.

Finally, update the service with its real URL and queue target: `DOCENT_DEPLOY_WEB=true DOCENT_APP_URL=<Cloud Run URL> npm run infra:deploy -- --auto-approve`. This enables the correct production OAuth callback and Cloud Tasks configuration. GitHub deployment should use Workload Identity Federation and deploy only from `main`; no CDN, WAF, custom DNS, or Cloud SQL is provisioned.

## Local cloud-backed testing

Local development uses Podman PostgreSQL and can use the single `dev` GCP project's Vertex AI and Cloud Storage bucket. Authenticate Application Default Credentials with `gcloud auth application-default login`, then set `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, and `GCS_BUCKET` in `.env`.

Leave every Cloud Tasks setting blank locally. After creating or uploading content, run `npm run ingestion:worker` to process up to ten pending jobs with the local database, dev bucket, and Vertex AI. Cloud Run enables Cloud Tasks only when all task settings are present.
