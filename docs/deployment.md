# Dev deployment

The CDKTF state is stored remotely in `gs://docent-terraform/docent/dev/default.tfstate`; the state bucket has object versioning enabled. Cloud Run, Storage, and Vertex use `europe-north1`; Cloud Tasks uses `europe-west1`, the nearest supported queue region.

For a new project, set `GOOGLE_CLOUD_PROJECT` and run `DOCENT_DEPLOY_WEB=false npm run infra:deploy -- --auto-approve` to create the bootstrap resources: APIs, bucket, registry, queue, service accounts, IAM bindings, and empty secrets. The default deployment includes Cloud Run.

Push the image to the generated Artifact Registry repository and add the Neon URL, Google OAuth client ID/secret, and a 32+ character session secret as Secret Manager versions. Use byte-exact input for OAuth values so a trailing newline is not stored: `printf '%s' "$GOOGLE_CLIENT_ID" | gcloud secrets versions add docent-google-client-id --data-file=-` (and likewise for the client secret). Then run `npm run infra:deploy -- --auto-approve` to create Cloud Run with secret-version environment mounts. Copy its generated `service_url` and register `${Cloud Run URL}/auth/google/callback` in Google OAuth.

Finally, update the service with its real URL and queue target: `DOCENT_APP_URL=<Cloud Run URL> npm run infra:deploy -- --auto-approve`. This enables the correct production OAuth callback and Cloud Tasks configuration. GitHub deployment should use Workload Identity Federation and deploy only from `main`; no CDN, WAF, custom DNS, or Cloud SQL is provisioned.

After creating a new Google OAuth secret version, increment `DOCENT_OAUTH_SECRET_ROLLOUT` and deploy. This rolls a Cloud Run revision, which is when the `latest` secret value is read by the container.

## GitHub Actions deployment

`.github/workflows/deploy.yml` runs only for `main` (or manually from `main`), verifies the project, applies CDKTF, migrates Neon, builds and pushes an immutable image, and rolls the Cloud Run revision. It authenticates with the deployed GitHub Workload Identity Federation provider; no GCP service-account key is stored in GitHub.

Before the first run, add these repository variables:

| Variable | Value |
| --- | --- |
| `GCP_PROJECT_ID` | `docent-504016` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/374228818470/locations/global/workloadIdentityPools/docent-github/providers/github` |
| `GCP_DEPLOYER_SERVICE_ACCOUNT` | `docent-github-deployer@docent-504016.iam.gserviceaccount.com` |
| `DOCENT_APP_URL` | `https://docent-dev-mslclny3pa-lz.a.run.app` |
| `DOCENT_OAUTH_SECRET_ROLLOUT` | `2` (increment whenever an OAuth secret is rotated) |

Add the full Neon connection URL as the repository secret `NEON_DATABASE_URL`. Do not add the OAuth or application secrets to GitHub: Cloud Run reads those directly from Secret Manager.

## Local cloud-backed testing

Local development uses Podman PostgreSQL and can use the single `dev` GCP project's Vertex AI and Cloud Storage bucket. Authenticate Application Default Credentials with `gcloud auth application-default login`, then set `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, and `GCS_BUCKET` in `.env`.

Leave every Cloud Tasks setting blank locally. After creating or uploading content, run `npm run ingestion:worker` to process up to ten pending jobs with the local database, dev bucket, and Vertex AI. Cloud Run enables Cloud Tasks only when all task settings are present.
