import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { pageInputSchema, spaceInputSchema } from '@/server/content';
import { db, sql } from '@/server/db';
import { requireEditor, requireSession } from '@/server/auth';
import { enqueueIngestionJob } from '@/features/ingestion/queue';

const pageSummarySchema = z.object({ id: z.string().uuid(), slug: z.string(), title: z.string(), updatedAt: z.string(), author: z.string() });
const ingestionStatusSchema = z.enum(['pending', 'processing', 'ready', 'failed']);
const pageSchema = pageSummarySchema.extend({ markdown: z.string(), revisionId: z.string().uuid(), revisionNumber: z.number().int(), createdAt: z.string(), spaceId: z.string().uuid(), spaceSlug: z.string(), spaceName: z.string(), spaceIcon: z.enum(['book-open', 'code-2', 'compass', 'database', 'megaphone', 'palette', 'shield-check', 'users']), parentPageId: z.string().uuid().nullable(), ingestionStatus: ingestionStatusSchema.nullable(), ingestionError: z.string().nullable() });
const revisionSummarySchema = z.object({ id: z.string().uuid(), revisionNumber: z.number().int(), title: z.string(), createdAt: z.string(), author: z.string() });
const slugSchema = z.object({ slug: z.string().min(1).max(240) });
const pageMutationSchema = pageInputSchema.extend({ slug: z.string().min(1).max(240) });
const restoreRevisionSchema = slugSchema.extend({ revisionId: z.string().uuid() });
const createPageSchema = pageInputSchema.extend({ spaceId: z.string().uuid(), parentPageId: z.string().uuid().nullable() });
const movePageSchema = z.object({ pageId: z.string().uuid(), destinationParentId: z.string().uuid().nullable() });
const spaceSchema = z.object({ id: z.string().uuid(), slug: z.string(), name: z.string(), description: z.string(), icon: z.enum(['book-open', 'code-2', 'compass', 'database', 'megaphone', 'palette', 'shield-check', 'users']), pageCount: z.number().int(), updatedAt: z.string(), isFavorite: z.boolean() });
const spacePageSchema = z.object({ id: z.string().uuid(), slug: z.string(), title: z.string(), parentPageId: z.string().uuid().nullable(), updatedAt: z.string(), author: z.string(), ingestionStatus: ingestionStatusSchema.nullable(), ingestionError: z.string().nullable() });

function slugify(title: string): string {
  const slug = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || 'untitled';
}

export const getRecentPages = createServerFn({ method: 'GET' }).handler(async () => {
  await requireSession();
  return (await db()).any(sql.type(pageSummarySchema)`
    SELECT p.id, p.slug, p.title, p.updated_at::text AS "updatedAt", u.display_name AS author
    FROM wiki_page p
    JOIN app_user u ON u.id = p.created_by
    WHERE p.deleted_at IS NULL
    ORDER BY p.updated_at DESC
    LIMIT 12
  `);
});

export const getSpaces = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await requireSession();
  return (await db()).any(sql.type(spaceSchema)`
    SELECT s.id, s.slug, s.name, s.description, s.icon, COUNT(p.id)::integer AS "pageCount",
      GREATEST(s.updated_at, COALESCE(MAX(p.updated_at), s.updated_at))::text AS "updatedAt",
      (f.user_id IS NOT NULL) AS "isFavorite"
    FROM wiki_space s
    LEFT JOIN wiki_page p ON p.space_id = s.id AND p.deleted_at IS NULL
    LEFT JOIN wiki_space_favorite f ON f.space_id = s.id AND f.user_id = ${user.userId}
    WHERE s.archived_at IS NULL
    GROUP BY s.id, f.user_id
    ORDER BY "isFavorite" DESC, "updatedAt" DESC
  `);
});

export const getSpace = createServerFn({ method: 'GET' })
  .validator((data: unknown) => z.object({ slug: z.string().min(1).max(240) }).parse(data))
  .handler(async ({ data }) => {
    const user = await requireSession();
    return (await db()).maybeOne(sql.type(spaceSchema)`
      SELECT s.id, s.slug, s.name, s.description, s.icon, 0::integer AS "pageCount", s.updated_at::text AS "updatedAt",
        (f.user_id IS NOT NULL) AS "isFavorite"
      FROM wiki_space s
      LEFT JOIN wiki_space_favorite f ON f.space_id = s.id AND f.user_id = ${user.userId}
      WHERE s.slug = ${data.slug} AND s.archived_at IS NULL
  `);
});

export const toggleSpaceFavorite = createServerFn({ method: 'POST' })
  .validator((data: unknown) => z.object({ spaceId: z.string().uuid(), favorite: z.boolean() }).parse(data))
  .handler(async ({ data }) => {
    const user = await requireSession();
    const pool = await db();
    if (data.favorite) {
      await pool.query(sql.unsafe`
        INSERT INTO wiki_space_favorite (user_id, space_id)
        SELECT ${user.userId}, id FROM wiki_space WHERE id = ${data.spaceId} AND archived_at IS NULL
        ON CONFLICT (user_id, space_id) DO NOTHING
      `);
    } else {
      await pool.query(sql.unsafe`
        DELETE FROM wiki_space_favorite WHERE user_id = ${user.userId} AND space_id = ${data.spaceId}
      `);
    }
    return { isFavorite: data.favorite };
  });

export const getSpacePages = createServerFn({ method: 'GET' })
  .validator((data: unknown) => z.object({ spaceId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireSession();
    return (await db()).any(sql.type(spacePageSchema)`
      SELECT p.id, p.slug, p.title, p.parent_page_id AS "parentPageId", p.updated_at::text AS "updatedAt", u.display_name AS author,
        j.status AS "ingestionStatus", j.error_message AS "ingestionError"
      FROM wiki_page p JOIN app_user u ON u.id = p.created_by
      LEFT JOIN ingestion_job j ON j.page_revision_id = p.current_revision_id
      WHERE p.space_id = ${data.spaceId} AND p.deleted_at IS NULL
      ORDER BY title
    `);
  });

export const createSpace = createServerFn({ method: 'POST' })
  .validator((data: unknown) => spaceInputSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireEditor();
    const slug = slugify(data.name);
    const existing = await (await db()).maybeOne(sql.type(z.object({ id: z.string().uuid() }))`SELECT id FROM wiki_space WHERE slug = ${slug}`);
    if (existing) throw new Response('A space with this name already exists. Choose a different name.', { status: 409 });
    return (await db()).one(sql.type(spaceSchema)`
      INSERT INTO wiki_space (slug, name, description, icon, created_by)
      VALUES (${slug}, ${data.name}, ${data.description}, ${data.icon}, ${user.userId})
      RETURNING id, slug, name, description, icon, 0::integer AS "pageCount", updated_at::text AS "updatedAt", false AS "isFavorite"
    `);
  });

export const updateSpace = createServerFn({ method: 'POST' })
  .validator((data: unknown) => spaceInputSchema.extend({ spaceId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireEditor();
    return (await db()).one(sql.type(spaceSchema)`
      UPDATE wiki_space
      SET name = ${data.name}, description = ${data.description}, icon = ${data.icon}, updated_at = now()
      WHERE id = ${data.spaceId}
      RETURNING id, slug, name, description, icon, 0::integer AS "pageCount", updated_at::text AS "updatedAt", false AS "isFavorite"
    `);
  });

export const getPage = createServerFn({ method: 'GET' })
  .validator((data: unknown) => slugSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSession();
    return (await db()).maybeOne(sql.type(pageSchema)`
      SELECT p.id, p.slug, p.title, p.updated_at::text AS "updatedAt", p.created_at::text AS "createdAt",
        p.space_id AS "spaceId", s.slug AS "spaceSlug", s.name AS "spaceName", s.icon AS "spaceIcon", p.parent_page_id AS "parentPageId", u.display_name AS author,
        j.status AS "ingestionStatus", j.error_message AS "ingestionError",
        r.markdown, r.id AS "revisionId", r.revision_number AS "revisionNumber"
      FROM wiki_page p
      JOIN page_revision r ON r.id = p.current_revision_id
      JOIN app_user u ON u.id = r.created_by
      JOIN wiki_space s ON s.id = p.space_id
      LEFT JOIN ingestion_job j ON j.page_revision_id = r.id
      WHERE p.slug = ${data.slug} AND p.deleted_at IS NULL
    `);
  });

export const retryPageIngestion = createServerFn({ method: 'POST' })
  .validator((data: unknown) => slugSchema.parse(data))
  .handler(async ({ data }) => {
    await requireEditor();
    const pool = await db();
    const job = await pool.transaction(async (transaction) => {
      const page = await transaction.maybeOne(sql.type(z.object({ revisionId: z.string().uuid() }))`
        SELECT current_revision_id AS "revisionId" FROM wiki_page WHERE slug = ${data.slug} AND deleted_at IS NULL
      `);
      if (!page) throw new Response('Page not found', { status: 404 });
      const existing = await transaction.maybeOne(sql.type(z.object({ id: z.string().uuid() }))`
        SELECT id FROM ingestion_job WHERE page_revision_id = ${page.revisionId}
      `);
      if (existing) {
        await transaction.query(sql.unsafe`UPDATE ingestion_job SET status = 'pending', error_message = NULL, started_at = NULL, completed_at = NULL WHERE id = ${existing.id}`);
        return existing;
      }
      return transaction.one(sql.type(z.object({ id: z.string().uuid() }))`
        INSERT INTO ingestion_job (content_kind, page_revision_id) VALUES ('page', ${page.revisionId}) RETURNING id
      `);
    });
    await enqueueIngestionJob(job.id);
    return { ok: true };
  });

export const getPageRevisions = createServerFn({ method: 'GET' })
  .validator((data: unknown) => slugSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSession();
    return (await db()).any(sql.type(revisionSummarySchema)`
      SELECT r.id, r.revision_number AS "revisionNumber", r.title, r.created_at::text AS "createdAt", u.display_name AS author
      FROM page_revision r
      JOIN wiki_page p ON p.id = r.page_id
      JOIN app_user u ON u.id = r.created_by
      WHERE p.slug = ${data.slug} AND p.deleted_at IS NULL
      ORDER BY r.revision_number DESC
    `);
  });

export const createPage = createServerFn({ method: 'POST' })
  .validator((data: unknown) => createPageSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireEditor();
    const pool = await db();
    const slug = slugify(data.title);
    const result = await pool.transaction(async (transaction) => {
      const space = await transaction.maybeOne(sql.type(z.object({ id: z.string().uuid() }))`
        SELECT id FROM wiki_space WHERE id = ${data.spaceId} AND archived_at IS NULL
      `);
      if (!space) throw new Response('The selected space no longer exists.', { status: 404 });
      if (data.parentPageId) {
        const parent = await transaction.maybeOne(sql.type(z.object({ id: z.string().uuid() }))`
          SELECT id FROM wiki_page WHERE id = ${data.parentPageId} AND space_id = ${data.spaceId} AND deleted_at IS NULL
        `);
        if (!parent) throw new Response('The selected parent page is not in this space.', { status: 400 });
      }
      const existing = await transaction.maybeOne(sql.type(z.object({ deletedAt: z.string().nullable() }))`
        SELECT deleted_at::text AS "deletedAt" FROM wiki_page WHERE slug = ${slug}
      `);
      if (existing) {
        throw new Response(existing.deletedAt
          ? 'A deleted page already uses this page address. Choose a different title.'
          : 'A page with this title already exists. Choose a different title.', { status: 409 });
      }
      const page = await transaction.one(sql.type(z.object({ id: z.string().uuid() }))`
        INSERT INTO wiki_page (slug, title, space_id, parent_page_id, created_by)
        VALUES (${slug}, ${data.title}, ${data.spaceId}, ${data.parentPageId}, ${user.userId})
        RETURNING id
      `);
      const revision = await transaction.one(sql.type(z.object({ id: z.string().uuid() }))`
        INSERT INTO page_revision (page_id, revision_number, title, markdown, created_by)
        VALUES (${page.id}, 1, ${data.title}, ${data.markdown}, ${user.userId})
        RETURNING id
      `);
      await transaction.query(sql.unsafe`
        UPDATE wiki_page SET current_revision_id = ${revision.id}, updated_at = now() WHERE id = ${page.id}
      `);
      const job = await transaction.one(sql.type(z.object({ id: z.string().uuid() }))`
        INSERT INTO ingestion_job (content_kind, page_revision_id) VALUES ('page', ${revision.id}) RETURNING id
      `);
      return { slug, revisionId: revision.id, jobId: job.id };
    });
    await enqueueIngestionJob(result.jobId);
    return result;
  });

export const movePage = createServerFn({ method: 'POST' })
  .validator((data: unknown) => movePageSchema.parse(data))
  .handler(async ({ data }) => {
    await requireEditor();
    const pool = await db();
    const page = await pool.maybeOne(sql.type(z.object({ id: z.string().uuid(), spaceId: z.string().uuid() }))`
      SELECT id, space_id AS "spaceId" FROM wiki_page WHERE id = ${data.pageId} AND deleted_at IS NULL
    `);
    if (!page) throw new Response('Page not found', { status: 404 });
    if (data.destinationParentId === data.pageId) throw new Response('A page cannot be moved under itself.', { status: 400 });
    if (data.destinationParentId) {
      const parent = await pool.maybeOne(sql.type(z.object({ id: z.string().uuid() }))`
        SELECT id FROM wiki_page WHERE id = ${data.destinationParentId} AND space_id = ${page.spaceId} AND deleted_at IS NULL
      `);
      if (!parent) throw new Response('Destination page not found', { status: 404 });
      const descendant = await pool.one(sql.type(z.object({ isDescendant: z.boolean() }))`
        WITH RECURSIVE descendants AS (
          SELECT id FROM wiki_page WHERE id = ${data.pageId}
          UNION ALL
          SELECT child.id FROM wiki_page child JOIN descendants ancestor ON child.parent_page_id = ancestor.id
          WHERE child.deleted_at IS NULL
        )
        SELECT EXISTS (SELECT 1 FROM descendants WHERE id = ${data.destinationParentId}) AS "isDescendant"
      `);
      if (descendant.isDescendant) throw new Response('A page cannot be moved under one of its descendants.', { status: 400 });
    }
    await pool.query(sql.unsafe`UPDATE wiki_page SET parent_page_id = ${data.destinationParentId}, updated_at = now() WHERE id = ${data.pageId} AND deleted_at IS NULL`);
    return { ok: true };
  });

export const updatePage = createServerFn({ method: 'POST' })
  .validator((data: unknown) => pageMutationSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireEditor();
    const pool = await db();
    const result = await pool.transaction(async (transaction) => {
      const current = await transaction.one(sql.type(z.object({ id: z.string().uuid(), revisionNumber: z.number().int() }))`
        SELECT p.id, r.revision_number AS "revisionNumber"
        FROM wiki_page p JOIN page_revision r ON r.id = p.current_revision_id
        WHERE p.slug = ${data.slug} AND p.deleted_at IS NULL
        FOR UPDATE
      `);
      const revision = await transaction.one(sql.type(z.object({ id: z.string().uuid() }))`
        INSERT INTO page_revision (page_id, revision_number, title, markdown, created_by)
        VALUES (${current.id}, ${current.revisionNumber + 1}, ${data.title}, ${data.markdown}, ${user.userId})
        RETURNING id
      `);
      await transaction.query(sql.unsafe`
        UPDATE wiki_page SET title = ${data.title}, current_revision_id = ${revision.id}, updated_at = now() WHERE id = ${current.id}
      `);
      const job = await transaction.one(sql.type(z.object({ id: z.string().uuid() }))`
        INSERT INTO ingestion_job (content_kind, page_revision_id) VALUES ('page', ${revision.id}) RETURNING id
      `);
      return { revisionId: revision.id, jobId: job.id };
    });
    await enqueueIngestionJob(result.jobId);
    return result;
  });

export const restorePageRevision = createServerFn({ method: 'POST' })
  .validator((data: unknown) => restoreRevisionSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireEditor();
    const pool = await db();
    const result = await pool.transaction(async (transaction) => {
      const current = await transaction.maybeOne(sql.type(z.object({ id: z.string().uuid(), revisionNumber: z.number().int() }))`
        SELECT p.id, r.revision_number AS "revisionNumber"
        FROM wiki_page p
        JOIN page_revision r ON r.id = p.current_revision_id
        WHERE p.slug = ${data.slug} AND p.deleted_at IS NULL
        FOR UPDATE
      `);
      if (!current) throw new Response('Page not found', { status: 404 });
      const source = await transaction.maybeOne(sql.type(z.object({ title: z.string(), markdown: z.string() }))`
        SELECT title, markdown FROM page_revision WHERE id = ${data.revisionId} AND page_id = ${current.id}
      `);
      if (!source) throw new Response('Revision not found for this page', { status: 404 });
      const revision = await transaction.one(sql.type(z.object({ id: z.string().uuid() }))`
        INSERT INTO page_revision (page_id, revision_number, title, markdown, created_by)
        VALUES (${current.id}, ${current.revisionNumber + 1}, ${source.title}, ${source.markdown}, ${user.userId})
        RETURNING id
      `);
      await transaction.query(sql.unsafe`
        UPDATE wiki_page SET title = ${source.title}, current_revision_id = ${revision.id}, updated_at = now() WHERE id = ${current.id}
      `);
      const job = await transaction.one(sql.type(z.object({ id: z.string().uuid() }))`
        INSERT INTO ingestion_job (content_kind, page_revision_id) VALUES ('page', ${revision.id}) RETURNING id
      `);
      return { revisionId: revision.id, jobId: job.id };
    });
    await enqueueIngestionJob(result.jobId);
    return result;
  });

export const deletePage = createServerFn({ method: 'POST' })
  .validator((data: unknown) => slugSchema.parse(data))
  .handler(async ({ data }) => {
    await requireEditor();
    await (await db()).query(sql.unsafe`UPDATE wiki_page SET deleted_at = now(), updated_at = now() WHERE slug = ${data.slug} AND deleted_at IS NULL`);
    return { ok: true };
  });
