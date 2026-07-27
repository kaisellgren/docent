import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { pageInputSchema } from '@/server/content';
import { db, sql } from '@/server/db';
import { requireEditor, requireSession } from '@/server/auth';

const pageSummarySchema = z.object({ id: z.string().uuid(), slug: z.string(), title: z.string(), updatedAt: z.string(), author: z.string() });
const pageSchema = pageSummarySchema.extend({ markdown: z.string(), revisionId: z.string().uuid(), revisionNumber: z.number().int() });
const slugSchema = z.object({ slug: z.string().min(1).max(240) });
const pageMutationSchema = pageInputSchema.extend({ slug: z.string().min(1).max(240) });

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

export const createPage = createServerFn({ method: 'POST' })
  .validator((data: unknown) => pageInputSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireEditor();
    const pool = await db();
    const slug = slugify(data.title);
    return pool.transaction(async (transaction) => {
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
      return { slug, revisionId: revision.id };
    });
  });

export const updatePage = createServerFn({ method: 'POST' })
  .validator((data: unknown) => pageMutationSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireEditor();
    const pool = await db();
    return pool.transaction(async (transaction) => {
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
      return { revisionId: revision.id };
    });
  });

export const deletePage = createServerFn({ method: 'POST' })
  .validator((data: unknown) => slugSchema.parse(data))
  .handler(async ({ data }) => {
    await requireEditor();
    await (await db()).query(sql.unsafe`UPDATE wiki_page SET deleted_at = now(), updated_at = now() WHERE slug = ${data.slug} AND deleted_at IS NULL`);
    return { ok: true };
  });
