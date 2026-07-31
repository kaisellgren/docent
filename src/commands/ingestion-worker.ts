import { processPendingIngestionJobs } from '@/features/ingestion/server';
import { closeDb } from '@/server/db';

const watch = process.argv.includes('--watch');
const rawLimit = process.argv.slice(2).find((argument) => !argument.startsWith('--')) ?? '10';
const limit = Number.parseInt(rawLimit, 10);
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Pass a job limit between 1 and 100.');

try {
  do {
    const result = await processPendingIngestionJobs(limit, !watch);
    console.log(`Ingestion worker: ${result.processed}/${result.discovered} jobs processed; ${result.failed} failed.`);
    if (result.failed && !watch) process.exitCode = 1;
    if (watch) await new Promise((resolve) => setTimeout(resolve, 2000));
  } while (watch);
} finally {
  await closeDb();
}
