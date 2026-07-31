import { randomUUID } from 'node:crypto';
import { Storage } from '@google-cloud/storage';
import { createServerFn } from '@tanstack/react-start';
import JSZip from 'jszip';
import { z } from 'zod';
import { MAX_UPLOAD_BYTES, supportedUploadTypes, uploadMetadataSchema } from '@/server/content';
import { requireEditor, requireSession } from '@/server/auth';
import { db, sql } from '@/server/db';
import { env } from '@/server/env';
import { enqueueIngestionJob } from '@/features/ingestion/queue';

const mediaTypeSchema = z.enum(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.oasis.opendocument.text']);
const uploadIntentSchema = uploadMetadataSchema.extend({ filename: z.string().min(1).max(255), mediaType: mediaTypeSchema, sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES), spaceId: z.string().uuid().nullable().optional(), pageId: z.string().uuid().nullable().optional() });
const fileIdSchema = z.object({ fileId: z.string().uuid() });
const fileRowSchema = z.object({ id: z.string().uuid(), filename: z.string(), mediaType: mediaTypeSchema, sizeBytes: z.number().int(), status: z.enum(['pending', 'processing', 'ready', 'failed']), error: z.string().nullable(), createdAt: z.string(), folderId: z.string().uuid().nullable(), folderName: z.string().nullable(), spaceId: z.string().uuid().nullable(), tags: z.array(z.string()) });
const pageAttachmentSchema = z.object({ id: z.string().uuid(), filename: z.string(), mediaType: mediaTypeSchema, sizeBytes: z.number().int(), tags: z.array(z.string()), attachedAt: z.string() });
const folderSchema = z.object({ id: z.string().uuid(), name: z.string(), parentId: z.string().uuid().nullable(), spaceId: z.string().uuid().nullable() });
const moveFileSchema = fileIdSchema.extend({ folderId: z.string().uuid().nullable() });
const pageIdSchema = z.object({ pageId: z.string().uuid() });
const pageFileSchema = pageIdSchema.extend({ fileId: z.string().uuid() });

let storage: Storage | undefined;
function bucket() {
  const bucketName = env().GCS_BUCKET;
  if (!bucketName) throw new Error('GCS_BUCKET is required for file uploads');
  const projectId = env().GOOGLE_CLOUD_PROJECT;
  storage ??= projectId ? new Storage({ projectId }) : new Storage();
  return storage.bucket(bucketName);
}

function normalizedTags(tags: string[]) { return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))]; }

async function validateSignature(bytes: Buffer, mediaType: z.infer<typeof mediaTypeSchema>) {
  if (mediaType === 'application/pdf') return bytes.subarray(0, 5).toString('ascii') === '%PDF-';
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false;
  const archive = await JSZip.loadAsync(bytes);
  if (mediaType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return archive.file('word/document.xml') !== null;
  const mimetype = archive.file('mimetype');
  return mimetype !== null && (await mimetype.async('string')) === 'application/vnd.oasis.opendocument.text';
}

export const getFiles = createServerFn({ method: 'GET' }).handler(async () => {
  await requireSession();
  return (await db()).any(sql.type(fileRowSchema)`
    SELECT f.id, f.original_filename AS filename, f.media_type AS "mediaType", f.size_bytes AS "sizeBytes",
      f.extraction_status AS status, f.extraction_error AS error, f.created_at::text AS "createdAt", f.folder_id AS "folderId", folder.name AS "folderName", f.space_id AS "spaceId",
      COALESCE(array_agg(tag.name) FILTER (WHERE tag.id IS NOT NULL), '{}') AS tags
    FROM stored_file f
    LEFT JOIN folder ON folder.id = f.folder_id
    LEFT JOIN file_tag ON file_tag.file_id = f.id
    LEFT JOIN tag ON tag.id = file_tag.tag_id
    WHERE f.deleted_at IS NULL
    GROUP BY f.id, folder.name
    ORDER BY f.created_at DESC
  `);
});

export const getFolders = createServerFn({ method: 'GET' }).handler(async () => {
  await requireSession();
  return (await db()).any(sql.type(folderSchema)`SELECT id, name, parent_id AS "parentId", space_id AS "spaceId" FROM folder WHERE deleted_at IS NULL ORDER BY name`);
});

export const getSpaceFiles = createServerFn({ method: 'GET' })
  .validator((data: unknown) => z.object({ spaceId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireSession();
    return (await db()).any(sql.type(fileRowSchema)`
      SELECT f.id, f.original_filename AS filename, f.media_type AS "mediaType", f.size_bytes AS "sizeBytes",
        f.extraction_status AS status, f.extraction_error AS error, f.created_at::text AS "createdAt", f.folder_id AS "folderId", folder.name AS "folderName", f.space_id AS "spaceId",
        COALESCE(array_agg(tag.name) FILTER (WHERE tag.id IS NOT NULL), '{}') AS tags
      FROM stored_file f
      LEFT JOIN folder ON folder.id = f.folder_id
      LEFT JOIN file_tag ON file_tag.file_id = f.id
      LEFT JOIN tag ON tag.id = file_tag.tag_id
      WHERE f.deleted_at IS NULL AND (f.space_id = ${data.spaceId} OR EXISTS (
        SELECT 1 FROM page_file pf JOIN wiki_page p ON p.id = pf.page_id
        WHERE pf.file_id = f.id AND p.space_id = ${data.spaceId} AND p.deleted_at IS NULL
      ))
      GROUP BY f.id, folder.name
      ORDER BY f.created_at DESC
    `);
  });

export const getSpaceFolders = createServerFn({ method: 'GET' })
  .validator((data: unknown) => z.object({ spaceId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireSession();
    return (await db()).any(sql.type(folderSchema)`SELECT id, name, parent_id AS "parentId", space_id AS "spaceId" FROM folder WHERE space_id = ${data.spaceId} AND deleted_at IS NULL ORDER BY name`);
  });

export const createFolder = createServerFn({ method: 'POST' })
  .validator((data: unknown) => z.object({ name: z.string().trim().min(1).max(120), parentId: z.string().uuid().nullable(), spaceId: z.string().uuid().nullable().optional() }).parse(data))
  .handler(async ({ data }) => {
    const user = await requireEditor();
    return (await db()).one(sql.type(folderSchema)`
      INSERT INTO folder (name, parent_id, space_id, created_by) VALUES (${data.name}, ${data.parentId}, ${data.spaceId ?? null}, ${user.userId})
      RETURNING id, name, parent_id AS "parentId", space_id AS "spaceId"
    `);
  });

export const createUploadIntent = createServerFn({ method: 'POST' })
  .validator((data: unknown) => uploadIntentSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireEditor();
    const extension = supportedUploadTypes[data.mediaType];
    const fileId = randomUUID();
    const objectKey = `uploads/${fileId}.${extension}`;
    await (await db()).transaction(async (transaction) => {
      if (data.pageId) {
        const page = await transaction.maybeOne(sql.type(z.object({ id: z.string().uuid(), spaceId: z.string().uuid() }))`
          SELECT id, space_id AS "spaceId" FROM wiki_page WHERE id = ${data.pageId} AND deleted_at IS NULL
        `);
        if (!page || !data.spaceId || page.spaceId !== data.spaceId) throw new Response('The upload page does not belong to this space.', { status: 400 });
      }
      await transaction.query(sql.unsafe`
        INSERT INTO stored_file (id, folder_id, space_id, original_filename, media_type, size_bytes, object_key, uploaded_by)
        VALUES (${fileId}, ${data.folderId ?? null}, ${data.spaceId ?? null}, ${data.filename}, ${data.mediaType}, ${data.sizeBytes}, ${objectKey}, ${user.userId})
      `);
      for (const tag of normalizedTags(data.tagNames)) {
        const tagRow = await transaction.one(sql.type(z.object({ id: z.string().uuid() }))`
          INSERT INTO tag (name, normalized_name) VALUES (${tag}, ${tag})
          ON CONFLICT (normalized_name) DO UPDATE SET name = EXCLUDED.name RETURNING id
        `);
        await transaction.query(sql.unsafe`INSERT INTO file_tag (file_id, tag_id) VALUES (${fileId}, ${tagRow.id}) ON CONFLICT DO NOTHING`);
      }
      if (data.pageId) {
        await transaction.query(sql.unsafe`
          INSERT INTO page_file (page_id, file_id, attached_by) VALUES (${data.pageId}, ${fileId}, ${user.userId})
        `);
      }
    });
    try {
      const [uploadUrl] = await bucket().file(objectKey).getSignedUrl({ version: 'v4', action: 'write', expires: Date.now() + 15 * 60 * 1000, contentType: data.mediaType });
      return { fileId, uploadUrl };
    } catch (cause) {
      await (await db()).transaction(async (transaction) => {
        await transaction.query(sql.unsafe`DELETE FROM page_file WHERE file_id = ${fileId}`);
        await transaction.query(sql.unsafe`DELETE FROM file_tag WHERE file_id = ${fileId}`);
        await transaction.query(sql.unsafe`DELETE FROM stored_file WHERE id = ${fileId}`);
      });
      const detail = cause instanceof Error ? cause.message : 'Unknown signing error';
      if (detail.includes('client_email')) {
        throw new Error('Google Cloud credentials cannot sign upload URLs. For local uploads, use Application Default Credentials with service-account impersonation (see docs/deployment.md).');
      }
      throw new Error(`Could not create a Google Cloud Storage upload URL: ${detail}`);
    }
  });

export const confirmUpload = createServerFn({ method: 'POST' })
  .validator((data: unknown) => fileIdSchema.parse(data))
  .handler(async ({ data }) => {
    await requireEditor();
    const file = await (await db()).one(sql.type(z.object({ objectKey: z.string(), mediaType: mediaTypeSchema, sizeBytes: z.number().int() }))`
      SELECT object_key AS "objectKey", media_type AS "mediaType", size_bytes AS "sizeBytes" FROM stored_file WHERE id = ${data.fileId} AND deleted_at IS NULL
    `);
    const gcsFile = bucket().file(file.objectKey);
    const [metadata] = await gcsFile.getMetadata();
    if (Number(metadata.size) !== file.sizeBytes) throw new Response('Uploaded size does not match the requested upload', { status: 400 });
    const [contents] = await gcsFile.download();
    if (!(await validateSignature(contents, file.mediaType))) throw new Response('The file does not match its declared type', { status: 400 });
    const job = await (await db()).transaction(async (transaction) => {
      await transaction.query(sql.unsafe`UPDATE stored_file SET extraction_status = 'pending', updated_at = now() WHERE id = ${data.fileId}`);
      return transaction.one(sql.type(z.object({ id: z.string().uuid() }))`
        INSERT INTO ingestion_job (content_kind, file_id) VALUES ('file', ${data.fileId})
        ON CONFLICT (file_id) DO UPDATE SET status = 'pending', error_message = NULL, completed_at = NULL
        RETURNING id
      `);
    });
    await enqueueIngestionJob(job.id);
    return { ok: true };
  });

export const retryFileIngestion = createServerFn({ method: 'POST' })
  .validator((data: unknown) => fileIdSchema.parse(data))
  .handler(async ({ data }) => {
    await requireEditor();
    const pool = await db();
    const job = await pool.transaction(async (transaction) => {
      const file = await transaction.maybeOne(sql.type(z.object({ id: z.string().uuid() }))`
        SELECT id FROM stored_file WHERE id = ${data.fileId} AND deleted_at IS NULL
      `);
      if (!file) throw new Response('File not found', { status: 404 });
      await transaction.query(sql.unsafe`UPDATE stored_file SET extraction_status = 'pending', extraction_error = NULL, updated_at = now() WHERE id = ${file.id}`);
      const existing = await transaction.maybeOne(sql.type(z.object({ id: z.string().uuid() }))`
        SELECT id FROM ingestion_job WHERE file_id = ${file.id}
      `);
      if (existing) {
        await transaction.query(sql.unsafe`UPDATE ingestion_job SET status = 'pending', error_message = NULL, started_at = NULL, completed_at = NULL WHERE id = ${existing.id}`);
        return existing;
      }
      return transaction.one(sql.type(z.object({ id: z.string().uuid() }))`
        INSERT INTO ingestion_job (content_kind, file_id) VALUES ('file', ${file.id}) RETURNING id
      `);
    });
    await enqueueIngestionJob(job.id);
    return { ok: true };
  });

export const getPageAttachments = createServerFn({ method: 'GET' })
  .validator((data: unknown) => pageIdSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSession();
    return (await db()).any(sql.type(pageAttachmentSchema)`
      SELECT f.id, f.original_filename AS filename, f.media_type AS "mediaType", f.size_bytes AS "sizeBytes",
        COALESCE(array_agg(tag.name) FILTER (WHERE tag.id IS NOT NULL), '{}') AS tags, pf.attached_at::text AS "attachedAt"
      FROM page_file pf
      JOIN stored_file f ON f.id = pf.file_id
      LEFT JOIN file_tag ON file_tag.file_id = f.id
      LEFT JOIN tag ON tag.id = file_tag.tag_id
      WHERE pf.page_id = ${data.pageId} AND f.deleted_at IS NULL
      GROUP BY f.id, pf.attached_at
      ORDER BY pf.attached_at DESC
    `);
  });

export const attachFileToPage = createServerFn({ method: 'POST' })
  .validator((data: unknown) => pageFileSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireEditor();
    const pool = await db();
    const page = await pool.maybeOne(sql.type(z.object({ id: z.string().uuid(), spaceId: z.string().uuid() }))`SELECT id, space_id AS "spaceId" FROM wiki_page WHERE id = ${data.pageId} AND deleted_at IS NULL`);
    const file = await pool.maybeOne(sql.type(z.object({ id: z.string().uuid(), spaceId: z.string().uuid().nullable() }))`SELECT id, space_id AS "spaceId" FROM stored_file WHERE id = ${data.fileId} AND deleted_at IS NULL`);
    if (!page || !file) throw new Response('The page or file no longer exists', { status: 404 });
    if (file.spaceId && file.spaceId !== page.spaceId) throw new Response('This file belongs to a different space.', { status: 400 });
    await pool.query(sql.unsafe`INSERT INTO page_file (page_id, file_id, attached_by) VALUES (${data.pageId}, ${data.fileId}, ${user.userId}) ON CONFLICT DO NOTHING`);
    return { ok: true };
  });

export const detachFileFromPage = createServerFn({ method: 'POST' })
  .validator((data: unknown) => pageFileSchema.parse(data))
  .handler(async ({ data }) => {
    await requireEditor();
    await (await db()).query(sql.unsafe`DELETE FROM page_file WHERE page_id = ${data.pageId} AND file_id = ${data.fileId}`);
    return { ok: true };
  });

export const moveFile = createServerFn({ method: 'POST' })
  .validator((data: unknown) => moveFileSchema.parse(data))
  .handler(async ({ data }) => {
    await requireEditor();
    const pool = await db();
    if (data.folderId) {
      const folder = await pool.maybeOne(sql.type(z.object({ id: z.string().uuid() }))`SELECT id FROM folder WHERE id = ${data.folderId} AND deleted_at IS NULL`);
      if (!folder) throw new Response('Destination folder not found', { status: 404 });
    }
    const file = await pool.maybeOne(sql.type(z.object({ id: z.string().uuid() }))`
      UPDATE stored_file SET folder_id = ${data.folderId}, updated_at = now() WHERE id = ${data.fileId} AND deleted_at IS NULL RETURNING id
    `);
    if (!file) throw new Response('File not found', { status: 404 });
    return { ok: true };
  });

export const deleteFile = createServerFn({ method: 'POST' })
  .validator((data: unknown) => fileIdSchema.parse(data))
  .handler(async ({ data }) => {
    await requireEditor();
    const file = await (await db()).maybeOne(sql.type(z.object({ id: z.string().uuid() }))`
      UPDATE stored_file SET deleted_at = now(), updated_at = now() WHERE id = ${data.fileId} AND deleted_at IS NULL RETURNING id
    `);
    if (!file) throw new Response('File not found', { status: 404 });
    return { ok: true };
  });

export const getDownloadUrl = createServerFn({ method: 'GET' })
  .validator((data: unknown) => fileIdSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSession();
    const file = await (await db()).maybeOne(sql.type(z.object({ objectKey: z.string() }))`
      SELECT object_key AS "objectKey" FROM stored_file WHERE id = ${data.fileId} AND deleted_at IS NULL
    `);
    if (!file) throw new Response('File not found', { status: 404 });
    const [downloadUrl] = await bucket().file(file.objectKey).getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + 15 * 60 * 1000 });
    return { downloadUrl };
  });
