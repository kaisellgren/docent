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
import {
  createIngestionRepository,
  fileSchema as repositoryFileSchema,
} from '@/features/ingestion/ingestion.repository'

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

const jobSchema = z.object({
  id: z.string().uuid(),
  contentKind: z.enum(['page', 'file']),
  pageRevisionId: z.string().uuid().nullable(),
  fileId: z.string().uuid().nullable(),
})
const pendingJobSchema = z.object({ id: z.string().uuid() })
const fileSchema = repositoryFileSchema
const repository = createIngestionRepository(db)

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
  const job = await repository.claimJob(jobId)
  if (!job) return { processed: false }
  try {
    let text = ''
    let pageId: string | undefined
    let previewFile: z.infer<typeof fileSchema> | undefined
    let previewBytes: Buffer | undefined
    if (job.contentKind === 'page') {
      const row = await repository.getPageRevision(job.pageRevisionId!)
      text = row.markdown
      pageId = row.pageId
      await repository.deletePageChunks(job.pageRevisionId!)
    } else {
      const file = await repository.getFile(job.fileId!)
      const extracted = await extractFileText(file)
      text = extracted.text
      previewFile = file
      previewBytes = extracted.bytes
      await repository.deleteFileChunks(job.fileId!)
    }
    for (const [ordinal, value] of chunkText(text).entries()) {
      const embedding = await embedText(value)
      await repository.insertChunk({
        contentKind: job.contentKind,
        pageId: pageId ?? null,
        pageRevisionId: job.pageRevisionId,
        fileId: job.fileId,
        ordinal,
        text: value,
        embedding,
      })
    }
    if (job.fileId) {
      await repository.markFileReady(job.fileId)
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
        await repository.markPreview(job.fileId, 'ready', previewObjectKey, null)
      } catch (error) {
        const message = errorMessage(error)
        console.warn('[ingestion] preview conversion failed', { fileId: job.fileId, message })
        await repository.markPreview(job.fileId, 'failed', null, message)
      }
    }
    await repository.markJobReady(job.id)
    return { processed: true }
  } catch (error) {
    const message = errorMessage(error)
    console.error('[ingestion] job failed', {
      jobId: job.id,
      contentKind: job.contentKind,
      pageRevisionId: job.pageRevisionId,
      fileId: job.fileId,
      message,
    })
    await repository.markJobFailed(job.id, message, job.fileId)
    throw error
  }
}

export async function processPendingIngestionJobs(limit = 10, includeFailed = true) {
  const pool = await db()
  const jobs = await repository.listPending(limit, includeFailed)
  let processed = 0
  let failed = 0
  const failures: Array<{ jobId: string; message: string }> = []
  for (const job of jobs) {
    try {
      if ((await processIngestionJob(job.id)).processed) processed += 1
    } catch (error) {
      failed += 1
      failures.push({ jobId: job.id, message: errorMessage(error) })
    }
  }
  return { discovered: jobs.length, processed, failed, failures }
}
