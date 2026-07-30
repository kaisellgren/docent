import { processPendingIngestionJobs } from '@/features/ingestion/server';
import { closeDb } from '@/server/db';

const rawLimit = process.argv[2] ?? '10';
const limit = Number.parseInt(rawLimit, 10);
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Pass a job limit between 1 and 100.');

try {
  const result = await processPendingIngestionJobs(limit);
  console.log(`Ingestion worker: ${result.processed}/${result.discovered} jobs processed; ${result.failed} failed.`);
  if (result.failed) process.exitCode = 1;
} finally {
  await closeDb();
}
