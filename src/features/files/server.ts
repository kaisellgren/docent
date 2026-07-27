import { randomUUID } from 'node:crypto';
import { Storage } from '@google-cloud/storage';
import { createServerFn } from '@tanstack/react-start';
import JSZip from 'jszip';
import { z } from 'zod';
import { MAX_UPLOAD_BYTES, supportedUploadTypes, uploadMetadataSchema } from '@/server/content';
import { requireEditor, requireSession } from '@/server/auth';
import { db, sql } from '@/server/db';
import { env } from '@/server/env';

const mediaTypeSchema = z.enum(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.oasis.opendocument.text']);
const uploadIntentSchema = uploadMetadataSchema.extend({ filename: z.string().min(1).max(255), mediaType: mediaTypeSchema, sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES) });
const fileIdSchema = z.object({ fileId: z.string().uuid() });
const fileRowSchema = z.object({ id: z.string().uuid(), filename: z.string(), mediaType: mediaTypeSchema, sizeBytes: z.number().int(), status: z.enum(['pending', 'processing', 'ready', 'failed']), createdAt: z.string(), folderName: z.string().nullable() });
const folderSchema = z.object({ id: z.string().uuid(), name: z.string(), parentId: z.string().uuid().nullable() });

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
      f.extraction_status AS status, f.created_at::text AS "createdAt", folder.name AS "folderName"
    FROM stored_file f LEFT JOIN folder ON folder.id = f.folder_id
    WHERE f.deleted_at IS NULL ORDER BY f.created_at DESC
  `);
});

export const getFolders = createServerFn({ method: 'GET' }).handler(async () => {
  await requireSession();
  return (await db()).any(sql.type(folderSchema)`SELECT id, name, parent_id AS "parentId" FROM folder WHERE deleted_at IS NULL ORDER BY name`);
});

export const createFolder = createServerFn({ method: 'POST' })
  .validator((data: unknown) => z.object({ name: z.string().trim().min(1).max(120), parentId: z.string().uuid().nullable() }).parse(data))
  .handler(async ({ data }) => {
    const user = await requireEditor();
    return (await db()).one(sql.type(folderSchema)`
      INSERT INTO folder (name, parent_id, created_by) VALUES (${data.name}, ${data.parentId}, ${user.userId})
      RETURNING id, name, parent_id AS "parentId"
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
      await transaction.query(sql.unsafe`
        INSERT INTO stored_file (id, folder_id, original_filename, media_type, size_bytes, object_key, uploaded_by)
        VALUES (${fileId}, ${data.folderId ?? null}, ${data.filename}, ${data.mediaType}, ${data.sizeBytes}, ${objectKey}, ${user.userId})
      `);
      for (const tag of normalizedTags(data.tagNames)) {
        const tagRow = await transaction.one(sql.type(z.object({ id: z.string().uuid() }))`
          INSERT INTO tag (name, normalized_name) VALUES (${tag}, ${tag})
          ON CONFLICT (normalized_name) DO UPDATE SET name = EXCLUDED.name RETURNING id
        `);
        await transaction.query(sql.unsafe`INSERT INTO file_tag (file_id, tag_id) VALUES (${fileId}, ${tagRow.id}) ON CONFLICT DO NOTHING`);
      }
    });
    const [uploadUrl] = await bucket().file(objectKey).getSignedUrl({ version: 'v4', action: 'write', expires: Date.now() + 15 * 60 * 1000, contentType: data.mediaType });
    return { fileId, uploadUrl };
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
    await (await db()).transaction(async (transaction) => {
      await transaction.query(sql.unsafe`UPDATE stored_file SET extraction_status = 'pending', updated_at = now() WHERE id = ${data.fileId}`);
      await transaction.query(sql.unsafe`INSERT INTO ingestion_job (content_kind, file_id) VALUES ('file', ${data.fileId}) ON CONFLICT (file_id) DO UPDATE SET status = 'pending', error_message = NULL, completed_at = NULL`);
    });
    return { ok: true };
  });

export const attachFileToPage = createServerFn({ method: 'POST' })
  .validator((data: unknown) => z.object({ fileId: z.string().uuid(), pageId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const user = await requireEditor();
    await (await db()).query(sql.unsafe`INSERT INTO page_file (page_id, file_id, attached_by) VALUES (${data.pageId}, ${data.fileId}, ${user.userId}) ON CONFLICT DO NOTHING`);
    return { ok: true };
  });
