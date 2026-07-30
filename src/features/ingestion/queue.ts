import { CloudTasksClient } from '@google-cloud/tasks';
import { env } from '@/server/env';

let client: CloudTasksClient | undefined;

export async function enqueueIngestionJob(jobId: string): Promise<boolean> {
  const configuration = env();
  const projectId = configuration.GOOGLE_CLOUD_PROJECT;
  const queueName = configuration.CLOUD_TASKS_QUEUE;
  const taskUrl = configuration.CLOUD_RUN_TASK_URL;
  const serviceAccountEmail = configuration.CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL;
  const taskConfiguration = [queueName, taskUrl, serviceAccountEmail];
  if (taskConfiguration.every((value) => !value)) return false;
  if (!projectId || !queueName || !taskUrl || !serviceAccountEmail) throw new Error('CLOUD_TASKS_QUEUE, CLOUD_RUN_TASK_URL, and CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL must be configured together when Cloud Tasks is enabled');
  client ??= new CloudTasksClient({ projectId });
  const parent = client.queuePath(projectId, configuration.GOOGLE_CLOUD_LOCATION, queueName);
  await client.createTask({
    parent,
    task: {
      httpRequest: {
        httpMethod: 'POST',
        url: `${taskUrl}/api/ingestion`,
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(JSON.stringify({ jobId })),
        oidcToken: {
          serviceAccountEmail,
          audience: configuration.CLOUD_RUN_TASK_AUDIENCE ?? taskUrl,
        },
      },
    },
  });
  return true;
}
