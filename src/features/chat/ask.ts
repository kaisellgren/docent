import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { embedText } from '@/features/ai/vertex'
import { getDocentAgent } from '@/mastra'
import { chatInputSchema } from '@/server/content'
import { requireSession } from '@/server/auth'
import { db, sql } from '@/server/db'

const sourceSchema = z.object({
  id: z.string().uuid(),
  text: z.string(),
  pageSlug: z.string().nullable(),
  pageTitle: z.string().nullable(),
  filename: z.string().nullable(),
  fileId: z.string().uuid().nullable(),
})

export const askDocent = createServerFn({ method: 'POST' })
  .validator((data: unknown) => chatInputSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireSession()
    const pool = await db()
    const conversation = data.conversationId
      ? await pool.one(
          sql.type(
            z.object({ id: z.string().uuid() }),
          )`SELECT id FROM conversation WHERE id = ${data.conversationId} AND owner_id = ${user.userId} AND deleted_at IS NULL`,
        )
      : await pool.one(
          sql.type(
            z.object({ id: z.string().uuid() }),
          )`INSERT INTO conversation (owner_id, title) VALUES (${user.userId}, ${data.message.slice(0, 80)}) RETURNING id`,
        )
    await pool.query(
      sql.unsafe`INSERT INTO chat_message (conversation_id, role, content) VALUES (${conversation.id}, 'user', ${data.message})`,
    )
    const embedding = await embedText(data.message, 'RETRIEVAL_QUERY')
    const sources = await pool.any(sql.type(sourceSchema)`
      SELECT c.id, c.text_content AS text, p.slug AS "pageSlug", p.title AS "pageTitle", f.original_filename AS filename, f.id AS "fileId"
      FROM content_chunk c LEFT JOIN wiki_page p ON p.id = c.page_id LEFT JOIN stored_file f ON f.id = c.file_id
      WHERE (p.deleted_at IS NULL OR p.id IS NULL) AND (f.deleted_at IS NULL OR f.id IS NULL)
      ORDER BY c.embedding <=> ${JSON.stringify(embedding)}::vector LIMIT 6
    `)
    const context = sources
      .map((source, index) => `[${index + 1}] ${source.pageTitle ?? source.filename}\n${source.text}`)
      .join('\n\n')
    const answer = await getDocentAgent()
      .generate(`Knowledge:\n${context || 'No indexed knowledge is available.'}\n\nQuestion: ${data.message}`)
      .then((result) => result.text)
    const citedSources = sources.flatMap((source, index) =>
      citedNumberSet(answer).has(index + 1) ? [{ source, ordinal: index }] : [],
    )
    const message = await pool.one(
      sql.type(
        z.object({ id: z.string().uuid() }),
      )`INSERT INTO chat_message (conversation_id, role, content) VALUES (${conversation.id}, 'assistant', ${answer}) RETURNING id`,
    )
    for (const { source, ordinal } of citedSources)
      await pool.query(
        sql.unsafe`INSERT INTO message_citation (message_id, content_chunk_id, ordinal, excerpt) VALUES (${message.id}, ${source.id}, ${ordinal}, ${source.text.slice(0, 500)})`,
      )
    await pool.query(sql.unsafe`UPDATE conversation SET updated_at = now() WHERE id = ${conversation.id}`)
    return {
      conversationId: conversation.id,
      answer,
      citations: citedSources.map(({ source, ordinal }) => ({
        number: ordinal + 1,
        title: source.pageTitle ?? source.filename ?? 'Source',
        slug: source.pageSlug,
        fileId: source.fileId,
        excerpt: citationExcerpt(source.text),
      })),
    }
  })

function citedNumberSet(answer: string): Set<number> {
  return new Set(
    [...answer.matchAll(/\[(\d+)\]/g)]
      .map((match) => Number(match[1]))
      .filter((number) => Number.isInteger(number) && number > 0),
  )
}

function citationExcerpt(text: string): string {
  if (/[{}]|(?:@_?text|text:(?:span|p)|_text|#text)/i.test(text)) return ''
  return text.slice(0, 320).trim()
}
