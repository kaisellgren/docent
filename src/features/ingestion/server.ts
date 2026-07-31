import JSZip from 'jszip'
import mammoth from 'mammoth'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { Storage } from '@google-cloud/storage'
import { z } from 'zod'
import { db, sql } from '@/server/db'
import { env } from '@/server/env'
import { embedText } from '@/features/ai/vertex'
import { chunkText } from '@/features/ingestion/chunk'
import { generateFilePreview } from '@/features/ingestion/preview'

const jobSchema = z.object({
  id: z.string().uuid(),
  contentKind: z.enum(['page', 'file']),
  pageRevisionId: z.string().uuid().nullable(),
  fileId: z.string().uuid().nullable(),
})
const pendingJobSchema = z.object({ id: z.string().uuid() })
const fileSchema = z.object({
  id: z.string().uuid(),
  objectKey: z.string(),
  mediaType: z.enum([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
  ]),
  filename: z.string(),
})

async function extractFileText(file: z.infer<typeof fileSchema>) {
  const projectId = env().GOOGLE_CLOUD_PROJECT
  const storage = projectId ? new Storage({ projectId }) : new Storage()
  const bucket = storage.bucket(env().GCS_BUCKET!)
  const [bytes] = await bucket.file(file.objectKey).download()
  if (file.mediaType === 'application/pdf') {
    const document = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise
    const pages = await Promise.all(
      Array.from({ length: document.numPages }, async (_, index) =>
        (await (await document.getPage(index + 1)).getTextContent()).items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' '),
      ),
    )
    const text = pages.join('\n\n')
    return { text, bytes }
  }
  if (file.mediaType.includes('wordprocessingml')) {
    const raw = await mammoth.extractRawText({ buffer: bytes })
    return { text: raw.value, bytes }
  }
  const archive = await JSZip.loadAsync(bytes)
  const xml = await archive.file('content.xml')?.async('string')
  if (!xml) throw new Error('ODT content.xml is missing')
  const paragraphs = [...xml.matchAll(/<text:p[^>]*>([\s\S]*?)<\/text:p>/gi)]
    .map((match) =>
      (match[1] ?? '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
  const text = paragraphs.join('\n\n')
  return { text, bytes }
}

export async function processIngestionJob(jobId: string) {
  const pool = await db()
  const job = await pool.maybeOne(
    sql.type(
      jobSchema,
    )`UPDATE ingestion_job SET status = 'processing', attempts = attempts + 1, started_at = now() WHERE id = ${jobId} AND status IN ('pending', 'failed') RETURNING id, content_kind AS "contentKind", page_revision_id AS "pageRevisionId", file_id AS "fileId"`,
  )
  if (!job) return { processed: false }
  try {
    let text = ''
    let pageId: string | undefined
    let previewFile: z.infer<typeof fileSchema> | undefined
    let previewBytes: Buffer | undefined
    if (job.contentKind === 'page') {
      const row = await pool.one(
        sql.type(
          z.object({ markdown: z.string(), pageId: z.string().uuid() }),
        )`SELECT markdown, page_id AS "pageId" FROM page_revision WHERE id = ${job.pageRevisionId}`,
      )
      text = row.markdown
      pageId = row.pageId
      await pool.query(sql.unsafe`DELETE FROM content_chunk WHERE page_revision_id = ${job.pageRevisionId}`)
    } else {
      const file = await pool.one(
        sql.type(
          fileSchema,
        )`SELECT id, object_key AS "objectKey", media_type AS "mediaType", original_filename AS filename FROM stored_file WHERE id = ${job.fileId}`,
      )
      const extracted = await extractFileText(file)
      text = extracted.text
      previewFile = file
      previewBytes = extracted.bytes
      await pool.query(sql.unsafe`DELETE FROM content_chunk WHERE file_id = ${job.fileId}`)
    }
    for (const [ordinal, value] of chunkText(text).entries()) {
      const embedding = await embedText(value)
      await pool.query(
        sql.unsafe`INSERT INTO content_chunk (content_kind, page_id, page_revision_id, file_id, ordinal, text_content, embedding) VALUES (${job.contentKind}, ${pageId ?? null}, ${job.pageRevisionId ?? null}, ${job.fileId ?? null}, ${ordinal}, ${value}, ${JSON.stringify(embedding)}::vector)`,
      )
    }
    if (job.fileId) {
      await pool.query(
        sql.unsafe`UPDATE stored_file SET extraction_status = 'ready', extraction_error = NULL, updated_at = now() WHERE id = ${job.fileId}`,
      )
      try {
        if (!previewFile || !previewBytes) throw new Error('File preview source is unavailable')
        const previewHtml = await generateFilePreview({ ...previewFile, bytes: previewBytes })
        const previewObjectKey = `previews/${job.fileId}.html`
        const projectId = env().GOOGLE_CLOUD_PROJECT
        const storage = projectId ? new Storage({ projectId }) : new Storage()
        await storage
          .bucket(env().GCS_BUCKET!)
          .file(previewObjectKey)
          .save(Buffer.from(previewHtml, 'utf8'), {
            resumable: false,
            contentType: 'text/html; charset=utf-8',
            metadata: { cacheControl: 'private, max-age=300' },
          })
        await pool.query(
          sql.unsafe`UPDATE stored_file SET preview_object_key = ${previewObjectKey}, preview_status = 'ready', preview_error = NULL, updated_at = now() WHERE id = ${job.fileId}`,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown preview conversion error'
        await pool.query(
          sql.unsafe`UPDATE stored_file SET preview_status = 'failed', preview_error = ${message}, updated_at = now() WHERE id = ${job.fileId}`,
        )
      }
    }
    await pool.query(
      sql.unsafe`UPDATE ingestion_job SET status = 'ready', completed_at = now(), error_message = NULL WHERE id = ${job.id}`,
    )
    return { processed: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ingestion error'
    await pool.query(
      sql.unsafe`UPDATE ingestion_job SET status = 'failed', error_message = ${message}, completed_at = now() WHERE id = ${job.id}`,
    )
    if (job.fileId)
      await pool.query(
        sql.unsafe`UPDATE stored_file SET extraction_status = 'failed', extraction_error = ${message}, preview_status = 'failed', preview_error = ${message} WHERE id = ${job.fileId}`,
      )
    throw error
  }
}

export async function processPendingIngestionJobs(limit = 10, includeFailed = true) {
  const pool = await db()
  const jobs = await pool.any(sql.type(pendingJobSchema)`
    SELECT id FROM ingestion_job
    WHERE status = 'pending' OR (${includeFailed} AND status = 'failed')
    ORDER BY created_at ASC LIMIT ${limit}
  `)
  let processed = 0
  let failed = 0
  for (const job of jobs) {
    try {
      if ((await processIngestionJob(job.id)).processed) processed += 1
    } catch {
      failed += 1
    }
  }
  return { discovered: jobs.length, processed, failed }
}
