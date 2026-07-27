import { z } from 'zod';

const envSchema = z.object({
  APP_URL: z.url().default('http://localhost:3000'),
  DATABASE_URL: z.url(),
  SESSION_SECRET: z.string().min(32),
  EDITOR_EMAILS: z.string().default('kaisellgren@gmail.com'),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  GOOGLE_CLOUD_LOCATION: z.string().default('europe-north1'),
  VERTEX_CHAT_MODEL: z.string().default('gemini-2.0-flash-lite'),
  VERTEX_EMBEDDING_MODEL: z.string().default('gemini-embedding-001'),
  GCS_BUCKET: z.string().optional(),
  CLOUD_TASKS_QUEUE: z.string().optional(),
  CLOUD_RUN_TASK_URL: z.url().optional(),
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
