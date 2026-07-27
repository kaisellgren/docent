import { App, TerraformStack, TerraformOutput } from 'cdktf';
import { Construct } from 'constructs';
import * as google from '@cdktf/provider-google';

class DocentDev extends TerraformStack {
  constructor(scope: Construct, id: string) { super(scope, id); const project = process.env.GOOGLE_CLOUD_PROJECT!; const region = 'europe-north1'; new google.provider.GoogleProvider(this, 'google', { project, region });
    for (const service of ['run.googleapis.com','artifactregistry.googleapis.com','cloudtasks.googleapis.com','secretmanager.googleapis.com','storage.googleapis.com','aiplatform.googleapis.com']) new google.projectService.ProjectService(this, service.replaceAll('.','-'), { service, disableOnDestroy: false });
    const account = new google.serviceAccount.ServiceAccount(this, 'app', { accountId: 'docent-dev', displayName: 'Docent dev Cloud Run' });
    const bucket = new google.storageBucket.StorageBucket(this, 'files', { name: `${project}-docent-files`, location: region, uniformBucketLevelAccess: true, forceDestroy: false });
    new google.artifactRegistryRepository.ArtifactRegistryRepository(this, 'images', { location: region, repositoryId: 'docent', format: 'DOCKER' });
    const queue = new google.cloudTasksQueue.CloudTasksQueue(this, 'ingestion', { name: 'docent-ingestion', location: region });
    for (const secretId of ['docent-neon-url','docent-google-client-id','docent-google-client-secret','docent-session-secret']) new google.secretManagerSecret.SecretManagerSecret(this, secretId, { secretId, replication: { auto: {} } });
    const app = new google.cloudRunV2Service.CloudRunV2Service(this, 'web', { name: 'docent-dev', location: region, ingress: 'INGRESS_TRAFFIC_ALL', template: { serviceAccount: account.email, scaling: { minInstanceCount: 0, maxInstanceCount: 2 }, containers: [{ image: `${region}-docker.pkg.dev/${project}/docent/web:latest`, resources: { limits: { cpu: '1', memory: '512Mi' } }, env: [{ name: 'GOOGLE_CLOUD_PROJECT', value: project }, { name: 'GOOGLE_CLOUD_LOCATION', value: region }, { name: 'GCS_BUCKET', value: bucket.name }, { name: 'CLOUD_TASKS_QUEUE', value: queue.name }] }] } });
    new TerraformOutput(this, 'service_url', { value: app.uri });
  }
}
const app = new App(); new DocentDev(app, 'docent-dev'); app.synth();
