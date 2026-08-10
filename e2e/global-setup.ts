import { mkdir, writeFile } from 'node:fs/promises'
import { SignJWT } from 'jose'
import { createPool, sql } from 'slonik'
import { authFile, testPageId, testPageSlug, testRevisionId, testSpaceId, testSpaceSlug } from './auth'

export default async function globalSetup() {
  process.loadEnvFile?.('.env')
  const databaseUrl = process.env.DATABASE_URL
  const sessionSecret = process.env.SESSION_SECRET
  if (!databaseUrl || !sessionSecret) throw new Error('E2E tests require DATABASE_URL and SESSION_SECRET in .env')
  const email = process.env.EDITOR_EMAILS?.split(',')[0]?.trim().toLowerCase() ?? 'e2e-editor@example.com'
  const pool = await createPool(databaseUrl)
  let userId = ''
  try {
    const user = await pool.transaction(async (transaction) => {
      await transaction.query(
        sql.unsafe`UPDATE wiki_page SET current_revision_id = NULL WHERE space_id = ${testSpaceId}`,
      )
      await transaction.query(
        sql.unsafe`DELETE FROM page_revision WHERE page_id IN (SELECT id FROM wiki_page WHERE space_id = ${testSpaceId})`,
      )
      await transaction.query(sql.unsafe`DELETE FROM wiki_page WHERE space_id = ${testSpaceId}`)
      await transaction.query(sql.unsafe`UPDATE wiki_page SET current_revision_id = NULL WHERE id = ${testPageId}`)
      await transaction.query(sql.unsafe`DELETE FROM page_revision WHERE page_id = ${testPageId}`)
      await transaction.query(sql.unsafe`DELETE FROM wiki_page WHERE id = ${testPageId}`)
      await transaction.query(sql.unsafe`DELETE FROM wiki_space WHERE id = ${testSpaceId}`)
      return transaction.one(sql.unsafe`
        INSERT INTO app_user (id, google_subject, email, display_name)
        VALUES (gen_random_uuid(), 'e2e-editor', ${email}, 'E2E Editor')
        ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
        RETURNING id
      `)
    })
    userId = String(user.id)
    await pool.transaction(async (transaction) => {
      await transaction.query(sql.unsafe`
        INSERT INTO wiki_space (id, slug, name, description, icon, created_by)
        VALUES (${testSpaceId}, ${testSpaceSlug}, 'E2E Engineering', 'Engineering test knowledge', 'code-2', ${userId})
      `)
      await transaction.query(sql.unsafe`
        INSERT INTO wiki_page (id, slug, title, space_id, created_by, updated_at)
        VALUES (${testPageId}, ${testPageSlug}, 'E2E Onboarding', ${testSpaceId}, ${userId}, now())
      `)
      await transaction.query(sql.unsafe`
        INSERT INTO page_revision (id, page_id, revision_number, title, markdown, created_by)
        VALUES (${testRevisionId}, ${testPageId}, 1, 'E2E Onboarding', '# Welcome\n\nThis is test content.', ${userId})
      `)
      await transaction.query(sql.unsafe`
        UPDATE wiki_page SET current_revision_id = ${testRevisionId}, space_id = ${testSpaceId}
        WHERE id = ${testPageId}
      `)
    })
  } finally {
    await pool.end()
  }

  const token = await new SignJWT({
    userId,
    email,
    name: 'E2E Editor',
    avatarUrl: null,
    isEditor: true,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(sessionSecret))

  await mkdir('e2e/.auth', { recursive: true })
  await writeFile(
    authFile,
    JSON.stringify({
      cookies: [{ name: 'docent_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true }],
    }),
  )
}
