import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { pageInputSchema } from '@/server/content';
import { db, sql } from '@/server/db';
import { requireEditor, requireSession } from '@/server/auth';
import { enqueueIngestionJob } from '@/features/ingestion/queue';

const pageSummarySchema = z.object({ id: z.string().uuid(), slug: z.string(), title: z.string(), updatedAt: z.string(), author: z.string() });
const pageSchema = pageSummarySchema.extend({ markdown: z.string(), revisionId: z.string().uuid(), revisionNumber: z.number().int() });
const revisionSummarySchema = z.object({ id: z.string().uuid(), revisionNumber: z.number().int(), title: z.string(), createdAt: z.string(), author: z.string() });
const slugSchema = z.object({ slug: z.string().min(1).max(240) });
const pageMutationSchema = pageInputSchema.extend({ slug: z.string().min(1).max(240) });
const restoreRevisionSchema = slugSchema.extend({ revisionId: z.string().uuid() });

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

export const getPage = createServerFn({ method: 'GET' })
  .validator((data: unknown) => slugSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSession();
    return (await db()).maybeOne(sql.type(pageSchema)`
      SELECT p.id, p.slug, p.title, p.updated_at::text AS "updatedAt", u.display_name AS author,
        r.markdown, r.id AS "revisionId", r.revision_number AS "revisionNumber"
      FROM wiki_page p
      JOIN page_revision r ON r.id = p.current_revision_id
      JOIN app_user u ON u.id = r.created_by
      WHERE p.slug = ${data.slug} AND p.deleted_at IS NULL
    `);
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
  .validator((data: unknown) => pageInputSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireEditor();
    const pool = await db();
    const slug = slugify(data.title);
    const result = await pool.transaction(async (transaction) => {
      const existing = await transaction.maybeOne(sql.type(z.object({ deletedAt: z.string().nullable() }))`
        SELECT deleted_at::text AS "deletedAt" FROM wiki_page WHERE slug = ${slug}
      `);
      if (existing) {
        throw new Response(existing.deletedAt
          ? 'A deleted page already uses this page address. Choose a different title.'
          : 'A page with this title already exists. Choose a different title.', { status: 409 });
      }
      const page = await transaction.one(sql.type(z.object({ id: z.string().uuid() }))`
        INSERT INTO wiki_page (slug, title, created_by)
        VALUES (${slug}, ${data.title}, ${user.userId})
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
      if (!current) throw new Response('Wiki page not found', { status: 404 });
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
