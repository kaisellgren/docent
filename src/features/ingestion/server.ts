import JSZip from 'jszip';
import mammoth from 'mammoth';
import { XMLParser } from 'fast-xml-parser';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { Storage } from '@google-cloud/storage';
import { z } from 'zod';
import { db, sql } from '@/server/db';
import { env } from '@/server/env';
import { embedText } from '@/features/ai/vertex';

const jobSchema = z.object({ id: z.string().uuid(), contentKind: z.enum(['page', 'file']), pageRevisionId: z.string().uuid().nullable(), fileId: z.string().uuid().nullable() });
const fileSchema = z.object({ id: z.string().uuid(), objectKey: z.string(), mediaType: z.string(), filename: z.string() });

function chunk(text: string) { const words = text.replace(/\s+/g, ' ').trim().split(' '); const output: string[] = []; for (let index = 0; index < words.length; index += 320) output.push(words.slice(index, index + 400).join(' ')); return output.filter(Boolean); }
async function extractFile(file: z.infer<typeof fileSchema>) {
  const projectId = env().GOOGLE_CLOUD_PROJECT; const storage = projectId ? new Storage({ projectId }) : new Storage(); const bucket = storage.bucket(env().GCS_BUCKET!); const [bytes] = await bucket.file(file.objectKey).download();
  if (file.mediaType === 'application/pdf') { const document = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise; const pages = await Promise.all(Array.from({ length: document.numPages }, async (_, index) => (await (await document.getPage(index + 1)).getTextContent()).items.map((item) => ('str' in item ? item.str : '')).join(' '))); return pages.join('\n'); }
  if (file.mediaType.includes('wordprocessingml')) return (await mammoth.extractRawText({ buffer: bytes })).value;
  const archive = await JSZip.loadAsync(bytes); const xml = await archive.file('content.xml')?.async('string'); if (!xml) throw new Error('ODT content.xml is missing'); const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml); return JSON.stringify(parsed).replace(/[{}\[\]"]+/g, ' ');
}

export async function processIngestionJob(jobId: string) {
  const pool = await db(); const job = await pool.maybeOne(sql.type(jobSchema)`UPDATE ingestion_job SET status = 'processing', attempts = attempts + 1, started_at = now() WHERE id = ${jobId} AND status IN ('pending', 'failed') RETURNING id, content_kind AS "contentKind", page_revision_id AS "pageRevisionId", file_id AS "fileId"`);
  if (!job) return { processed: false };
  try {
    let text = ''; let pageId: string | undefined;
    if (job.contentKind === 'page') { const row = await pool.one(sql.type(z.object({ markdown: z.string(), pageId: z.string().uuid() }))`SELECT markdown, page_id AS "pageId" FROM page_revision WHERE id = ${job.pageRevisionId}`); text = row.markdown; pageId = row.pageId; await pool.query(sql.unsafe`DELETE FROM content_chunk WHERE page_revision_id = ${job.pageRevisionId}`); }
    else { const file = await pool.one(sql.type(fileSchema)`SELECT id, object_key AS "objectKey", media_type AS "mediaType", original_filename AS filename FROM stored_file WHERE id = ${job.fileId}`); text = await extractFile(file); await pool.query(sql.unsafe`DELETE FROM content_chunk WHERE file_id = ${job.fileId}`); }
    for (const [ordinal, value] of chunk(text).entries()) { const embedding = await embedText(value); await pool.query(sql.unsafe`INSERT INTO content_chunk (content_kind, page_id, page_revision_id, file_id, ordinal, text_content, embedding) VALUES (${job.contentKind}, ${pageId ?? null}, ${job.pageRevisionId ?? null}, ${job.fileId ?? null}, ${ordinal}, ${value}, ${JSON.stringify(embedding)}::vector)`); }
    await pool.query(sql.unsafe`UPDATE ingestion_job SET status = 'ready', completed_at = now(), error_message = NULL WHERE id = ${job.id}`); if (job.fileId) await pool.query(sql.unsafe`UPDATE stored_file SET extraction_status = 'ready', extraction_error = NULL WHERE id = ${job.fileId}`);
    return { processed: true };
  } catch (error) { const message = error instanceof Error ? error.message : 'Unknown ingestion error'; await pool.query(sql.unsafe`UPDATE ingestion_job SET status = 'failed', error_message = ${message}, completed_at = now() WHERE id = ${job.id}`); if (job.fileId) await pool.query(sql.unsafe`UPDATE stored_file SET extraction_status = 'failed', extraction_error = ${message} WHERE id = ${job.fileId}`); throw error; }
}
