import { z } from 'zod'
import type { DatabasePool } from 'slonik'
import { sql } from '@/server/db'

const iconSchema = z.enum([
  'book-open',
  'code-2',
  'compass',
  'database',
  'megaphone',
  'palette',
  'shield-check',
  'users',
])
const statusSchema = z.enum(['pending', 'processing', 'ready', 'failed'])
const pageSummarySchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  updatedAt: z.string(),
  author: z.string(),
})
const spaceSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  icon: iconSchema,
  pageCount: z.number().int(),
  updatedAt: z.string(),
  isFavorite: z.boolean(),
})
const spacePageSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  parentPageId: z.string().uuid().nullable(),
  updatedAt: z.string(),
  author: z.string(),
  ingestionStatus: statusSchema.nullable(),
  ingestionError: z.string().nullable(),
})

export function createWikiRepository(database: () => Promise<DatabasePool>) {
  return {
    async recentPages() {
      return (await database()).any(sql.type(pageSummarySchema)`
        SELECT p.id, p.slug, p.title, p.updated_at::text AS "updatedAt", u.display_name AS author
        FROM wiki_page p JOIN app_user u ON u.id = p.created_by
        WHERE p.deleted_at IS NULL ORDER BY p.updated_at DESC LIMIT 12
      `)
    },
    async spaces(userId: string) {
      return (await database()).any(sql.type(spaceSchema)`
        SELECT s.id, s.slug, s.name, s.description, s.icon, COUNT(p.id)::integer AS "pageCount",
          GREATEST(s.updated_at, COALESCE(MAX(p.updated_at), s.updated_at))::text AS "updatedAt",
          (f.user_id IS NOT NULL) AS "isFavorite"
        FROM wiki_space s LEFT JOIN wiki_page p ON p.space_id = s.id AND p.deleted_at IS NULL
        LEFT JOIN wiki_space_favorite f ON f.space_id = s.id AND f.user_id = ${userId}
        WHERE s.archived_at IS NULL GROUP BY s.id, f.user_id ORDER BY "isFavorite" DESC, "updatedAt" DESC
      `)
    },
    async space(slug: string, userId: string) {
      return (await database()).maybeOne(sql.type(spaceSchema)`
        SELECT s.id, s.slug, s.name, s.description, s.icon, 0::integer AS "pageCount", s.updated_at::text AS "updatedAt",
          (f.user_id IS NOT NULL) AS "isFavorite" FROM wiki_space s
        LEFT JOIN wiki_space_favorite f ON f.space_id = s.id AND f.user_id = ${userId}
        WHERE s.slug = ${slug} AND s.archived_at IS NULL
      `)
    },
    async pages(spaceId: string) {
      return (await database()).any(sql.type(spacePageSchema)`
        SELECT p.id, p.slug, p.title, p.parent_page_id AS "parentPageId", p.updated_at::text AS "updatedAt", u.display_name AS author,
          j.status AS "ingestionStatus", j.error_message AS "ingestionError"
        FROM wiki_page p JOIN app_user u ON u.id = p.created_by LEFT JOIN ingestion_job j ON j.page_revision_id = p.current_revision_id
        WHERE p.space_id = ${spaceId} AND p.deleted_at IS NULL ORDER BY title
      `)
    },
  }
}

export type WikiRepository = ReturnType<typeof createWikiRepository>
