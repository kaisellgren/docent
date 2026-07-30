import { z } from 'zod';

const blankAsUndefined = (value: unknown) => typeof value === 'string' && value.trim() === '' ? undefined : value;
const optionalString = z.preprocess(blankAsUndefined, z.string().optional());
const optionalUrl = z.preprocess(blankAsUndefined, z.string().url().optional());
const optionalEmail = z.preprocess(blankAsUndefined, z.string().email().optional());

const envSchema = z.object({
  APP_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  EDITOR_EMAILS: z.string().default('kaisellgren@gmail.com'),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CLOUD_PROJECT: optionalString,
  GOOGLE_CLOUD_LOCATION: z.string().default('europe-north1'),
  VERTEX_CHAT_MODEL: z.string().default('gemini-2.0-flash-lite'),
  VERTEX_EMBEDDING_MODEL: z.string().default('gemini-embedding-001'),
  GCS_BUCKET: optionalString,
  CLOUD_TASKS_QUEUE: optionalString,
  CLOUD_TASKS_LOCATION: z.string().default('europe-west1'),
  CLOUD_RUN_TASK_URL: optionalUrl,
  CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL: optionalEmail,
  CLOUD_RUN_TASK_AUDIENCE: optionalUrl,
});

export type Env = z.infer<typeof envSchema>;
let parsedEnv: Env | undefined;

export function env(): Env {
  parsedEnv ??= envSchema.parse(process.env);
  return parsedEnv;
}

export function editorEmails(): Set<string> {
  return new Set(env().EDITOR_EMAILS.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
}
