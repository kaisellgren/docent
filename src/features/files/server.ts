import { randomUUID } from 'node:crypto'
import { Storage } from '@google-cloud/storage'
import { createServerFn } from '@tanstack/react-start'
import JSZip from 'jszip'
import { z } from 'zod'
import { MAX_UPLOAD_BYTES, supportedUploadTypes, uploadMetadataSchema } from '@/server/content'
import { requireEditor, requireSession } from '@/server/auth'
import { db, sql } from '@/server/db'
import { env } from '@/server/env'
import { enqueueIngestionJob } from '@/features/ingestion/queue'
import { filesRepository } from '@/server/dependencies'

const mediaTypeSchema = z.enum([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
])
const uploadIntentSchema = uploadMetadataSchema.extend({
  filename: z.string().min(1).max(255),
  mediaType: mediaTypeSchema,
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  spaceId: z.string().uuid().nullable().optional(),
  pageId: z.string().uuid().nullable().optional(),
})
const fileIdSchema = z.object({ fileId: z.string().uuid() })
const folderIdSchema = z.object({ folderId: z.string().uuid() })
const moveFolderSchema = folderIdSchema.extend({ destinationParentId: z.string().uuid().nullable() })
const folderSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  parentId: z.string().uuid().nullable(),
  spaceId: z.string().uuid().nullable(),
})
const moveFileSchema = fileIdSchema.extend({ folderId: z.string().uuid().nullable() })
const pageIdSchema = z.object({ pageId: z.string().uuid() })
const pageFileSchema = pageIdSchema.extend({ fileId: z.string().uuid() })

let storage: Storage | undefined
function bucket() {
  const bucketName = env().GCS_BUCKET
  if (!bucketName) throw new Error('GCS_BUCKET is required for file uploads')
  const projectId = env().GOOGLE_CLOUD_PROJECT
  storage ??= projectId ? new Storage({ projectId }) : new Storage()
  return storage.bucket(bucketName)
}

function normalizedTags(tags: string[]) {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))]
}

async function validateSignature(bytes: Buffer, mediaType: z.infer<typeof mediaTypeSchema>) {
  if (mediaType === 'application/pdf') return bytes.subarray(0, 5).toString('ascii') === '%PDF-'
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false
  const archive = await JSZip.loadAsync(bytes)
  if (mediaType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    return archive.file('word/document.xml') !== null
  const mimetype = archive.file('mimetype')
  return mimetype !== null && (await mimetype.async('string')) === 'application/vnd.oasis.opendocument.text'
}

export const getFiles = createServerFn({ method: 'GET' }).handler(async () => {
  await requireSession()
  return filesRepository.files()
})

export const getFolders = createServerFn({ method: 'GET' }).handler(async () => {
  await requireSession()
  return filesRepository.folders()
})

export const getSpaceFiles = createServerFn({ method: 'GET' })
  .validator((data: unknown) => z.object({ spaceId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireSession()
    return filesRepository.spaceFiles(data.spaceId)
  })

export const getSpaceFolders = createServerFn({ method: 'GET' })
  .validator((data: unknown) => z.object({ spaceId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireSession()
    return filesRepository.folders(data.spaceId)
  })

export const createFolder = createServerFn({ method: 'POST' })
  .validator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(120),
        parentId: z.string().uuid().nullable(),
        spaceId: z.string().uuid().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const user = await requireEditor()
    return (await db()).one(sql.type(folderSchema)`
      INSERT INTO folder (name, parent_id, space_id, created_by) VALUES (${data.name}, ${data.parentId}, ${data.spaceId ?? null}, ${user.userId})
      RETURNING id, name, parent_id AS "parentId", space_id AS "spaceId"
    `)
  })

export const deleteFolder = createServerFn({ method: 'POST' })
  .validator((data: unknown) => folderIdSchema.parse(data))
  .handler(async ({ data }) => {
    await requireEditor()
    const pool = await db()
    const folder = await pool.maybeOne(sql.type(z.object({ id: z.string().uuid() }))`
      SELECT id FROM folder WHERE id = ${data.folderId} AND deleted_at IS NULL
    `)
    if (!folder) throw new Response('Folder not found', { status: 404 })
    const contents = await pool.one(sql.type(z.object({ fileCount: z.number().int(), childCount: z.number().int() }))`
      SELECT
        (SELECT COUNT(*)::integer FROM stored_file WHERE folder_id = ${data.folderId} AND deleted_at IS NULL) AS "fileCount",
        (SELECT COUNT(*)::integer FROM folder WHERE parent_id = ${data.folderId} AND deleted_at IS NULL) AS "childCount"
    `)
    if (contents.fileCount || contents.childCount)
      throw new Response('Move or delete the folder contents before deleting this folder.', { status: 400 })
    await pool.query(sql.unsafe`UPDATE folder SET deleted_at = now(), updated_at = now() WHERE id = ${data.folderId}`)
    return { ok: true }
  })

export const moveFolder = createServerFn({ method: 'POST' })
  .validator((data: unknown) => moveFolderSchema.parse(data))
  .handler(async ({ data }) => {
    await requireEditor()
    const pool = await db()
    const source = await pool.maybeOne(sql.type(z.object({ id: z.string().uuid(), spaceId: z.string().uuid() }))`
      SELECT id, space_id AS "spaceId"
      FROM folder
      WHERE id = ${data.folderId} AND deleted_at IS NULL
    `)
    if (!source) throw new Response('Folder not found', { status: 404 })
    if (data.destinationParentId === data.folderId) {
      throw new Response('A folder cannot be moved into itself.', { status: 400 })
    }
    if (data.destinationParentId) {
      const destination = await pool.maybeOne(sql.type(z.object({ id: z.string().uuid() }))`
        SELECT id
        FROM folder
        WHERE id = ${data.destinationParentId}
          AND space_id = ${source.spaceId}
          AND deleted_at IS NULL
      `)
      if (!destination) throw new Response('Destination folder not found', { status: 404 })
      const descendant = await pool.one(sql.type(z.object({ isDescendant: z.boolean() }))`
        WITH RECURSIVE descendants AS (
          SELECT id FROM folder WHERE id = ${data.folderId}
          UNION ALL
          SELECT child.id FROM folder child JOIN descendants parent ON child.parent_id = parent.id
          WHERE child.deleted_at IS NULL
        )
        SELECT EXISTS (SELECT 1 FROM descendants WHERE id = ${data.destinationParentId}) AS "isDescendant"
      `)
      if (descendant.isDescendant)
        throw new Response('A folder cannot be moved into one of its descendants.', { status: 400 })
    }
    try {
      await pool.query(sql.unsafe`
        UPDATE folder
        SET parent_id = ${data.destinationParentId}, updated_at = now()
        WHERE id = ${data.folderId} AND deleted_at IS NULL
      `)
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes('folder_parent_id_name_key')) {
        throw new Response('A folder with that name already exists in the destination.', { status: 409 })
      }
      throw cause
    }
    return { ok: true }
  })

export const createUploadIntent = createServerFn({ method: 'POST' })
  .validator((data: unknown) => uploadIntentSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireEditor()
    const extension = supportedUploadTypes[data.mediaType]
    const fileId = randomUUID()
    const objectKey = `uploads/${fileId}.${extension}`
    await (
      await db()
    ).transaction(async (transaction) => {
      if (data.pageId) {
        const page = await transaction.maybeOne(sql.type(
          z.object({ id: z.string().uuid(), spaceId: z.string().uuid() }),
        )`
          SELECT id, space_id AS "spaceId" FROM wiki_page WHERE id = ${data.pageId} AND deleted_at IS NULL
        `)
        if (!page || !data.spaceId || page.spaceId !== data.spaceId)
          throw new Response('The upload page does not belong to this space.', { status: 400 })
      }
      await transaction.query(sql.unsafe`
        INSERT INTO stored_file (id, folder_id, space_id, original_filename, media_type, size_bytes, object_key, uploaded_by)
        VALUES (${fileId}, ${data.folderId ?? null}, ${data.spaceId ?? null}, ${data.filename}, ${data.mediaType}, ${data.sizeBytes}, ${objectKey}, ${user.userId})
      `)
      for (const tag of normalizedTags(data.tagNames)) {
        const tagRow = await transaction.one(sql.type(z.object({ id: z.string().uuid() }))`
          INSERT INTO tag (name, normalized_name) VALUES (${tag}, ${tag})
          ON CONFLICT (normalized_name) DO UPDATE SET name = EXCLUDED.name RETURNING id
        `)
        await transaction.query(
          sql.unsafe`INSERT INTO file_tag (file_id, tag_id) VALUES (${fileId}, ${tagRow.id}) ON CONFLICT DO NOTHING`,
        )
      }
      if (data.pageId) {
        await transaction.query(sql.unsafe`
          INSERT INTO page_file (page_id, file_id, attached_by) VALUES (${data.pageId}, ${fileId}, ${user.userId})
        `)
      }
    })
    try {
      const [uploadUrl] = await bucket()
        .file(objectKey)
        .getSignedUrl({
          version: 'v4',
          action: 'write',
          expires: Date.now() + 15 * 60 * 1000,
          contentType: data.mediaType,
        })
      return { fileId, uploadUrl }
    } catch (cause) {
      await (
        await db()
      ).transaction(async (transaction) => {
        await transaction.query(sql.unsafe`DELETE FROM page_file WHERE file_id = ${fileId}`)
        await transaction.query(sql.unsafe`DELETE FROM file_tag WHERE file_id = ${fileId}`)
        await transaction.query(sql.unsafe`DELETE FROM stored_file WHERE id = ${fileId}`)
      })
      const detail = cause instanceof Error ? cause.message : 'Unknown signing error'
      if (detail.includes('client_email')) {
        throw new Error(
          'Google Cloud credentials cannot sign upload URLs. For local uploads, use Application Default Credentials with service-account impersonation (see docs/deployment.md).',
        )
      }
      throw new Error(`Could not create a Google Cloud Storage upload URL: ${detail}`)
    }
  })

export const confirmUpload = createServerFn({ method: 'POST' })
  .validator((data: unknown) => fileIdSchema.parse(data))
  .handler(async ({ data }) => {
    await requireEditor()
    const file = await (
      await db()
    ).one(sql.type(z.object({ objectKey: z.string(), mediaType: mediaTypeSchema, sizeBytes: z.number().int() }))`
      SELECT object_key AS "objectKey", media_type AS "mediaType", size_bytes AS "sizeBytes" FROM stored_file WHERE id = ${data.fileId} AND deleted_at IS NULL
    `)
    const gcsFile = bucket().file(file.objectKey)
    const [metadata] = await gcsFile.getMetadata()
    if (Number(metadata.size) !== file.sizeBytes)
      throw new Response('Uploaded size does not match the requested upload', { status: 400 })
    const [contents] = await gcsFile.download()
    if (!(await validateSignature(contents, file.mediaType)))
      throw new Response('The file does not match its declared type', { status: 400 })
    const job = await (
      await db()
    ).transaction(async (transaction) => {
      await transaction.query(
        sql.unsafe`UPDATE stored_file SET extraction_status = 'pending', preview_status = 'pending', preview_error = NULL, updated_at = now() WHERE id = ${data.fileId}`,
      )
      return transaction.one(sql.type(z.object({ id: z.string().uuid() }))`
        INSERT INTO ingestion_job (content_kind, file_id) VALUES ('file', ${data.fileId})
        ON CONFLICT (page_revision_id, file_id) DO UPDATE SET status = 'pending', error_message = NULL, completed_at = NULL
        RETURNING id
      `)
    })
    await enqueueIngestionJob(job.id)
    return { ok: true }
  })

export const retryFileIngestion = createServerFn({ method: 'POST' })
  .validator((data: unknown) => fileIdSchema.parse(data))
  .handler(async ({ data }) => {
    await requireEditor()
    const pool = await db()
    const job = await pool.transaction(async (transaction) => {
      const file = await transaction.maybeOne(sql.type(z.object({ id: z.string().uuid() }))`
        SELECT id FROM stored_file WHERE id = ${data.fileId} AND deleted_at IS NULL
      `)
      if (!file) throw new Response('File not found', { status: 404 })
      await transaction.query(
        sql.unsafe`UPDATE stored_file SET extraction_status = 'pending', extraction_error = NULL, preview_status = 'pending', preview_error = NULL, updated_at = now() WHERE id = ${file.id}`,
      )
      const existing = await transaction.maybeOne(sql.type(z.object({ id: z.string().uuid() }))`
        SELECT id FROM ingestion_job WHERE file_id = ${file.id}
      `)
      if (existing) {
        await transaction.query(
          sql.unsafe`UPDATE ingestion_job SET status = 'pending', error_message = NULL, started_at = NULL, completed_at = NULL WHERE id = ${existing.id}`,
        )
        return existing
      }
      return transaction.one(sql.type(z.object({ id: z.string().uuid() }))`
        INSERT INTO ingestion_job (content_kind, file_id) VALUES ('file', ${file.id}) RETURNING id
      `)
    })
    await enqueueIngestionJob(job.id)
    return { ok: true }
  })

export const getPageAttachments = createServerFn({ method: 'GET' })
  .validator((data: unknown) => pageIdSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSession()
    return filesRepository.pageAttachments(data.pageId)
  })

export const attachFileToPage = createServerFn({ method: 'POST' })
  .validator((data: unknown) => pageFileSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireEditor()
    const pool = await db()
    const page = await pool.maybeOne(
      sql.type(
        z.object({ id: z.string().uuid(), spaceId: z.string().uuid() }),
      )`SELECT id, space_id AS "spaceId" FROM wiki_page WHERE id = ${data.pageId} AND deleted_at IS NULL`,
    )
    const file = await pool.maybeOne(
      sql.type(
        z.object({ id: z.string().uuid(), spaceId: z.string().uuid().nullable() }),
      )`SELECT id, space_id AS "spaceId" FROM stored_file WHERE id = ${data.fileId} AND deleted_at IS NULL`,
    )
    if (!page || !file) throw new Response('The page or file no longer exists', { status: 404 })
    if (file.spaceId && file.spaceId !== page.spaceId)
      throw new Response('This file belongs to a different space.', { status: 400 })
    await pool.query(
      sql.unsafe`INSERT INTO page_file (page_id, file_id, attached_by) VALUES (${data.pageId}, ${data.fileId}, ${user.userId}) ON CONFLICT DO NOTHING`,
    )
    return { ok: true }
  })

export const detachFileFromPage = createServerFn({ method: 'POST' })
  .validator((data: unknown) => pageFileSchema.parse(data))
  .handler(async ({ data }) => {
    await requireEditor()
    await (
      await db()
    ).query(sql.unsafe`DELETE FROM page_file WHERE page_id = ${data.pageId} AND file_id = ${data.fileId}`)
    return { ok: true }
  })

export const moveFile = createServerFn({ method: 'POST' })
  .validator((data: unknown) => moveFileSchema.parse(data))
  .handler(async ({ data }) => {
    await requireEditor()
    const pool = await db()
    if (data.folderId) {
      const folder = await pool.maybeOne(
        sql.type(
          z.object({ id: z.string().uuid() }),
        )`SELECT id FROM folder WHERE id = ${data.folderId} AND deleted_at IS NULL`,
      )
      if (!folder) throw new Response('Destination folder not found', { status: 404 })
    }
    const file = await pool.maybeOne(sql.type(z.object({ id: z.string().uuid() }))`
      UPDATE stored_file SET folder_id = ${data.folderId}, updated_at = now() WHERE id = ${data.fileId} AND deleted_at IS NULL RETURNING id
    `)
    if (!file) throw new Response('File not found', { status: 404 })
    return { ok: true }
  })

export const deleteFile = createServerFn({ method: 'POST' })
  .validator((data: unknown) => fileIdSchema.parse(data))
  .handler(async ({ data }) => {
    await requireEditor()
    const file = await (
      await db()
    ).maybeOne(sql.type(z.object({ id: z.string().uuid() }))`
      UPDATE stored_file SET deleted_at = now(), updated_at = now() WHERE id = ${data.fileId} AND deleted_at IS NULL RETURNING id
    `)
    if (!file) throw new Response('File not found', { status: 404 })
    return { ok: true }
  })

export const getDownloadUrl = createServerFn({ method: 'GET' })
  .validator((data: unknown) => fileIdSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSession()
    const file = await (
      await db()
    ).maybeOne(sql.type(z.object({ objectKey: z.string(), filename: z.string() }))`
      SELECT object_key AS "objectKey", original_filename AS filename FROM stored_file WHERE id = ${data.fileId} AND deleted_at IS NULL
    `)
    if (!file) throw new Response('File not found', { status: 404 })
    const filename = file.filename.replace(/["\\\r\n]/g, '_')
    const [downloadUrl] = await bucket()
      .file(file.objectKey)
      .getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000,
        responseDisposition: `attachment; filename="${filename}"`,
      })
    return { downloadUrl }
  })

export const getPreviewUrl = createServerFn({ method: 'GET' })
  .validator((data: unknown) => fileIdSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSession()
    const file = await (
      await db()
    ).maybeOne(sql.type(
      z.object({
        previewObjectKey: z.string().nullable(),
        previewStatus: z.enum(['pending', 'processing', 'ready', 'failed']),
        previewError: z.string().nullable(),
      }),
    )`
      SELECT preview_object_key AS "previewObjectKey", preview_status AS "previewStatus", preview_error AS "previewError"
      FROM stored_file
      WHERE id = ${data.fileId} AND deleted_at IS NULL
    `)
    if (!file) throw new Response('File not found', { status: 410 })
    if (file.previewStatus === 'failed')
      throw new Response(`Preview conversion failed${file.previewError ? `: ${file.previewError}` : '.'}`, {
        status: 422,
      })
    if (file.previewStatus !== 'ready' || !file.previewObjectKey)
      throw new Response('The preview is still being generated.', { status: 409 })
    const [exists] = await bucket().file(file.previewObjectKey).exists()
    if (!exists)
      throw new Response('The preview has not been generated yet. Retry file indexing and try again.', { status: 404 })
    const [previewUrl] = await bucket()
      .file(file.previewObjectKey)
      .getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 10 * 60 * 1000,
        responseDisposition: 'inline',
        responseType: 'text/html',
      })
    return { previewUrl }
  })
