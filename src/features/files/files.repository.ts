import { z } from 'zod'
import type { DatabasePool } from 'slonik'
import { sql } from '@/server/db'

const mediaTypeSchema = z.enum([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
])
const fileRowSchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  mediaType: mediaTypeSchema,
  sizeBytes: z.number().int(),
  status: z.enum(['pending', 'processing', 'ready', 'failed']),
  error: z.string().nullable(),
  createdAt: z.string(),
  folderId: z.string().uuid().nullable(),
  folderName: z.string().nullable(),
  spaceId: z.string().uuid().nullable(),
  tags: z.array(z.string()),
})
const folderSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  parentId: z.string().uuid().nullable(),
  spaceId: z.string().uuid().nullable(),
})
const pageAttachmentSchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  mediaType: mediaTypeSchema,
  sizeBytes: z.number().int(),
  tags: z.array(z.string()),
  attachedAt: z.string(),
})

export function createFilesRepository(database: () => Promise<DatabasePool>) {
  return {
    async files() {
      return (await database()).any(
        sql.type(
          fileRowSchema,
        )`SELECT f.id, f.original_filename AS filename, f.media_type AS "mediaType", f.size_bytes AS "sizeBytes", f.extraction_status AS status, f.extraction_error AS error, f.created_at::text AS "createdAt", f.folder_id AS "folderId", folder.name AS "folderName", f.space_id AS "spaceId", COALESCE(array_agg(tag.name) FILTER (WHERE tag.id IS NOT NULL), '{}') AS tags FROM stored_file f LEFT JOIN folder ON folder.id = f.folder_id LEFT JOIN file_tag ON file_tag.file_id = f.id LEFT JOIN tag ON tag.id = file_tag.tag_id WHERE f.deleted_at IS NULL GROUP BY f.id, folder.name ORDER BY f.created_at DESC`,
      )
    },
    async folders(spaceId?: string) {
      return (await database()).any(
        sql.type(
          folderSchema,
        )`SELECT id, name, parent_id AS "parentId", space_id AS "spaceId" FROM folder WHERE ${spaceId ? sql.fragment`space_id = ${spaceId} AND` : sql.fragment``} deleted_at IS NULL ORDER BY name`,
      )
    },
    async spaceFiles(spaceId: string) {
      return (await database()).any(
        sql.type(
          fileRowSchema,
        )`SELECT f.id, f.original_filename AS filename, f.media_type AS "mediaType", f.size_bytes AS "sizeBytes", f.extraction_status AS status, f.extraction_error AS error, f.created_at::text AS "createdAt", f.folder_id AS "folderId", folder.name AS "folderName", f.space_id AS "spaceId", COALESCE(array_agg(tag.name) FILTER (WHERE tag.id IS NOT NULL), '{}') AS tags FROM stored_file f LEFT JOIN folder ON folder.id = f.folder_id LEFT JOIN file_tag ON file_tag.file_id = f.id LEFT JOIN tag ON tag.id = file_tag.tag_id WHERE f.deleted_at IS NULL AND (f.space_id = ${spaceId} OR EXISTS (SELECT 1 FROM page_file pf JOIN wiki_page p ON p.id = pf.page_id WHERE pf.file_id = f.id AND p.space_id = ${spaceId} AND p.deleted_at IS NULL)) GROUP BY f.id, folder.name ORDER BY f.created_at DESC`,
      )
    },
    async pageAttachments(pageId: string) {
      return (await database()).any(
        sql.type(
          pageAttachmentSchema,
        )`SELECT f.id, f.original_filename AS filename, f.media_type AS "mediaType", f.size_bytes AS "sizeBytes", COALESCE(array_agg(tag.name) FILTER (WHERE tag.id IS NOT NULL), '{}') AS tags, pf.attached_at::text AS "attachedAt" FROM page_file pf JOIN stored_file f ON f.id = pf.file_id LEFT JOIN file_tag ON file_tag.file_id = f.id LEFT JOIN tag ON tag.id = file_tag.tag_id WHERE pf.page_id = ${pageId} AND f.deleted_at IS NULL GROUP BY f.id, pf.attached_at ORDER BY pf.attached_at DESC`,
      )
    },
  }
}

export type FilesRepository = ReturnType<typeof createFilesRepository>
