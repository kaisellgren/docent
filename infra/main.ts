import { App, GcsBackend, TerraformOutput, TerraformStack } from 'cdktf';
import { Construct } from 'constructs';
import * as google from '@cdktf/provider-google';

class DocentDev extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    if (!project) throw new Error('GOOGLE_CLOUD_PROJECT is required to synthesize the Docent dev stack');
    const region = 'europe-north1';
    const tasksRegion = 'europe-west1';
    new google.provider.GoogleProvider(this, 'google', { project, region });
    new GcsBackend(this, { bucket: 'docent-terraform', prefix: 'docent/dev' });

    const enabledServices = new Map<string, google.projectService.ProjectService>();
    for (const service of [
      'aiplatform.googleapis.com',
      'artifactregistry.googleapis.com',
      'cloudtasks.googleapis.com',
      'iamcredentials.googleapis.com',
      'run.googleapis.com',
      'secretmanager.googleapis.com',
      'storage.googleapis.com',
    ]) {
      enabledServices.set(service, new google.projectService.ProjectService(this, service.replaceAll('.', '-'), { service, disableOnDestroy: false }));
    }

    const appAccount = new google.serviceAccount.ServiceAccount(this, 'app', {
      accountId: 'docent-dev',
      displayName: 'Docent dev Cloud Run runtime',
      dependsOn: [enabledServices.get('iamcredentials.googleapis.com')!],
    });
    const taskAccount = new google.serviceAccount.ServiceAccount(this, 'task', {
      accountId: 'docent-task-dev',
      displayName: 'Docent dev Cloud Tasks caller',
      dependsOn: [enabledServices.get('iamcredentials.googleapis.com')!],
    });
    const projectInfo = new google.dataGoogleProject.DataGoogleProject(this, 'project-info', { projectId: project });
    const bucket = new google.storageBucket.StorageBucket(this, 'files', {
      name: `${project}-docent-files`,
      location: region,
      uniformBucketLevelAccess: true,
      forceDestroy: false,
      dependsOn: [enabledServices.get('storage.googleapis.com')!],
    });
    new google.artifactRegistryRepository.ArtifactRegistryRepository(this, 'images', {
      location: region,
      repositoryId: 'docent',
      format: 'DOCKER',
      dependsOn: [enabledServices.get('artifactregistry.googleapis.com')!],
    });
    const queue = new google.cloudTasksQueue.CloudTasksQueue(this, 'ingestion', {
      name: 'docent-ingestion',
      location: tasksRegion,
      retryConfig: { maxAttempts: 5, minBackoff: '5s', maxBackoff: '300s', maxDoublings: 5 },
      rateLimits: { maxConcurrentDispatches: 2, maxDispatchesPerSecond: 1 },
      dependsOn: [enabledServices.get('cloudtasks.googleapis.com')!],
    });
    const secretIds = ['docent-neon-url', 'docent-google-client-id', 'docent-google-client-secret', 'docent-session-secret'];
    const secrets = secretIds.map((secretId) => new google.secretManagerSecret.SecretManagerSecret(this, secretId, {
      secretId,
      replication: { auto: {} },
      dependsOn: [enabledServices.get('secretmanager.googleapis.com')!],
    }));

    new google.storageBucketIamMember.StorageBucketIamMember(this, 'app-files', {
      bucket: bucket.name,
      role: 'roles/storage.objectUser',
      member: `serviceAccount:${appAccount.email}`,
      dependsOn: [bucket],
    });
    new google.projectIamMember.ProjectIamMember(this, 'app-vertex', {
      project,
      role: 'roles/aiplatform.user',
      member: `serviceAccount:${appAccount.email}`,
      dependsOn: [enabledServices.get('aiplatform.googleapis.com')!],
    });
    new google.cloudTasksQueueIamMember.CloudTasksQueueIamMember(this, 'app-enqueue', {
      name: queue.name,
      location: tasksRegion,
      role: 'roles/cloudtasks.enqueuer',
      member: `serviceAccount:${appAccount.email}`,
      dependsOn: [queue],
    });
    for (const [index, secret] of secrets.entries()) {
      new google.secretManagerSecretIamMember.SecretManagerSecretIamMember(this, `secret-${index}-accessor`, {
        secretId: secret.secretId,
        role: 'roles/secretmanager.secretAccessor',
        member: `serviceAccount:${appAccount.email}`,
        dependsOn: [secret],
      });
    }
    new google.serviceAccountIamMember.ServiceAccountIamMember(this, 'cloud-tasks-sign', {
      serviceAccountId: taskAccount.name,
      role: 'roles/iam.serviceAccountTokenCreator',
      member: `serviceAccount:service-${projectInfo.number}@gcp-sa-cloudtasks.iam.gserviceaccount.com`,
      dependsOn: [enabledServices.get('cloudtasks.googleapis.com')!, taskAccount],
    });

    if (process.env.DOCENT_DEPLOY_WEB !== 'true') {
      new TerraformOutput(this, 'task_service_account', { value: taskAccount.email });
      new TerraformOutput(this, 'bootstrap_complete', { value: 'Set DOCENT_DEPLOY_WEB=true after pushing the image and adding secret versions.' });
      return;
    }

    const app = new google.cloudRunV2Service.CloudRunV2Service(this, 'web', {
      name: 'docent-dev',
      location: region,
      ingress: 'INGRESS_TRAFFIC_ALL',
      invokerIamDisabled: true,
      dependsOn: [enabledServices.get('run.googleapis.com')!, appAccount],
      template: {
        serviceAccount: appAccount.email,
        scaling: { minInstanceCount: 0, maxInstanceCount: 2 },
        containers: [{
          image: `${region}-docker.pkg.dev/${project}/docent/web:latest`,
          resources: { limits: { cpu: '1', memory: '512Mi' } },
          env: [
            { name: 'GOOGLE_CLOUD_PROJECT', value: project },
            { name: 'GOOGLE_CLOUD_LOCATION', value: region },
            { name: 'GCS_BUCKET', value: bucket.name },
            { name: 'CLOUD_TASKS_LOCATION', value: tasksRegion },
            { name: 'DATABASE_URL', valueSource: { secretKeyRef: { secret: 'docent-neon-url', version: 'latest' } } },
            { name: 'GOOGLE_CLIENT_ID', valueSource: { secretKeyRef: { secret: 'docent-google-client-id', version: 'latest' } } },
            { name: 'GOOGLE_CLIENT_SECRET', valueSource: { secretKeyRef: { secret: 'docent-google-client-secret', version: 'latest' } } },
            { name: 'SESSION_SECRET', valueSource: { secretKeyRef: { secret: 'docent-session-secret', version: 'latest' } } },
            ...(process.env.DOCENT_APP_URL ? [
              { name: 'APP_URL', value: process.env.DOCENT_APP_URL },
              { name: 'CLOUD_TASKS_QUEUE', value: queue.name },
              { name: 'CLOUD_RUN_TASK_URL', value: process.env.DOCENT_APP_URL },
              { name: 'CLOUD_RUN_TASK_AUDIENCE', value: process.env.DOCENT_APP_URL },
              { name: 'CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL', value: taskAccount.email },
            ] : []),
          ],
        }],
      },
    });
    new google.cloudRunV2ServiceIamMember.CloudRunV2ServiceIamMember(this, 'task-invoker', {
      name: app.name,
      location: region,
      role: 'roles/run.invoker',
      member: `serviceAccount:${taskAccount.email}`,
    });

    new TerraformOutput(this, 'service_url', { value: app.uri });
    new TerraformOutput(this, 'task_service_account', { value: taskAccount.email });
  }
}

const app = new App();
new DocentDev(app, 'docent-dev');
app.synth();
