import { OAuth2Client } from 'google-auth-library';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { processIngestionJob } from '@/features/ingestion/server';
import { env } from '@/server/env';

const payloadSchema = z.object({ jobId: z.string().uuid() });
let oauthClient: OAuth2Client | undefined;

async function requireCloudTaskIdentity(request: Request) {
  const configuration = env();
  if (!configuration.CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL || !configuration.CLOUD_RUN_TASK_URL) {
    throw new Response('Cloud Tasks worker identity is not configured', { status: 503 });
  }
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw new Response('Cloud Tasks identity token is required', { status: 401 });
  oauthClient ??= new OAuth2Client();
  const ticket = await oauthClient.verifyIdToken({ idToken: token, audience: configuration.CLOUD_RUN_TASK_AUDIENCE ?? configuration.CLOUD_RUN_TASK_URL });
  const payload = ticket.getPayload();
  if (!payload?.email_verified || payload.email !== configuration.CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL) {
    throw new Response('Cloud Tasks identity is not authorized', { status: 403 });
  }
}

export const Route = createFileRoute('/api/ingestion')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await requireCloudTaskIdentity(request);
        const { jobId } = payloadSchema.parse(await request.json());
        return Response.json(await processIngestionJob(jobId));
      },
    },
  },
});
