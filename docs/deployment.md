# Dev deployment

Set `GOOGLE_CLOUD_PROJECT`, then run `npm run infra:deploy`. Populate the four Secret Manager secrets with the Neon URL, Google OAuth client ID/secret, and a 32+ character session secret. Register `${Cloud Run URL}/auth/google/callback` in Google OAuth. GitHub deployment should use Workload Identity Federation and deploy only from `main`; no CDN, WAF, custom DNS, or Cloud SQL is provisioned.
