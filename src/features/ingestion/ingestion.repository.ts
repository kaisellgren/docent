import { z } from 'zod'
import type { DatabasePool } from 'slonik'
import { sql } from '@/server/db'

const jobSchema = z.object({
  id: z.string().uuid(),
  contentKind: z.enum(['page', 'file']),
  pageRevisionId: z.string().uuid().nullable(),
  fileId: z.string().uuid().nullable(),
})
const pendingJobSchema = z.object({ id: z.string().uuid() })
export const fileSchema = z.object({
  id: z.string().uuid(),
  objectKey: z.string(),
  mediaType: z.enum([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
  ]),
  filename: z.string(),
})

export function createIngestionRepository(database: () => Promise<DatabasePool>) {
  return {
    claimJob(jobId: string) {
      return database().then((pool) =>
        pool.maybeOne(sql.type(jobSchema)`
          UPDATE ingestion_job SET status = 'processing', attempts = attempts + 1, started_at = now()
          WHERE id = ${jobId} AND status IN ('pending', 'failed')
          RETURNING id, content_kind AS "contentKind", page_revision_id AS "pageRevisionId", file_id AS "fileId"
        `),
      )
    },
    getPageRevision(revisionId: string) {
      return database().then((pool) =>
        pool.one(sql.type(z.object({ markdown: z.string(), pageId: z.string().uuid() }))`
          SELECT markdown, page_id AS "pageId" FROM page_revision WHERE id = ${revisionId}
        `),
      )
    },
    getFile(fileId: string) {
      return database().then((pool) =>
        pool.one(sql.type(fileSchema)`
          SELECT id, object_key AS "objectKey", media_type AS "mediaType", original_filename AS filename
          FROM stored_file WHERE id = ${fileId}
        `),
      )
    },
    deletePageChunks(revisionId: string) {
      return database().then((pool) =>
        pool.query(sql.unsafe`DELETE FROM content_chunk WHERE page_revision_id = ${revisionId}`),
      )
    },
    deleteFileChunks(fileId: string) {
      return database().then((pool) => pool.query(sql.unsafe`DELETE FROM content_chunk WHERE file_id = ${fileId}`))
    },
    insertChunk(data: {
      contentKind: 'page' | 'file'
      pageId: string | null
      pageRevisionId: string | null
      fileId: string | null
      ordinal: number
      text: string
      embedding: number[]
    }) {
      return database().then((pool) =>
        pool.query(sql.unsafe`
        INSERT INTO content_chunk (content_kind, page_id, page_revision_id, file_id, ordinal, text_content, embedding)
        VALUES (${data.contentKind}, ${data.pageId}, ${data.pageRevisionId}, ${data.fileId}, ${data.ordinal}, ${data.text}, ${JSON.stringify(data.embedding)}::vector)
      `),
      )
    },
    markFileReady(fileId: string) {
      return database().then((pool) =>
        pool.query(
          sql.unsafe`UPDATE stored_file SET extraction_status = 'ready', extraction_error = NULL, updated_at = now() WHERE id = ${fileId}`,
        ),
      )
    },
    markPreview(fileId: string, status: 'ready' | 'failed', objectKey: string | null, error: string | null) {
      return database().then((pool) =>
        pool.query(sql.unsafe`
        UPDATE stored_file SET preview_object_key = ${objectKey}, preview_status = ${status}, preview_error = ${error}, updated_at = now()
        WHERE id = ${fileId}
      `),
      )
    },
    markJobReady(jobId: string) {
      return database().then((pool) =>
        pool.query(
          sql.unsafe`UPDATE ingestion_job SET status = 'ready', completed_at = now(), error_message = NULL WHERE id = ${jobId}`,
        ),
      )
    },
    markJobFailed(jobId: string, message: string, fileId: string | null) {
      return database().then(async (pool) => {
        await pool.query(
          sql.unsafe`UPDATE ingestion_job SET status = 'failed', error_message = ${message}, completed_at = now() WHERE id = ${jobId}`,
        )
        if (fileId)
          await pool.query(
            sql.unsafe`UPDATE stored_file SET extraction_status = 'failed', extraction_error = ${message}, preview_status = 'failed', preview_error = ${message} WHERE id = ${fileId}`,
          )
      })
    },
    listPending(limit: number, includeFailed: boolean) {
      return database().then((pool) =>
        pool.any(sql.type(pendingJobSchema)`
        SELECT id FROM ingestion_job WHERE status = 'pending' OR (${includeFailed} AND status = 'failed')
        ORDER BY created_at ASC LIMIT ${limit}
      `),
      )
    },
  }
}

export type IngestionRepository = ReturnType<typeof createIngestionRepository>
