import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSession } from '@/server/auth'
import { db, sql } from '@/server/db'

const conversationSchema = z.object({ id: z.string().uuid(), title: z.string(), updatedAt: z.string() })
const citationSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  slug: z.string().nullable(),
  fileId: z.string().uuid().nullable(),
  excerpt: z.string(),
})
const conversationMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  createdAt: z.string(),
  citations: z.array(citationSchema),
})
const conversationIdSchema = z.object({ conversationId: z.string().uuid() })

export const getConversations = createServerFn({ method: 'GET' }).handler(async () => {
  const startedAt = performance.now()
  const user = await requireSession()
  const sessionValidatedAt = performance.now()
  const pool = await db()
  const poolReadyAt = performance.now()
  const conversations = await pool.any(sql.type(conversationSchema)`
    SELECT id, title, updated_at::text AS "updatedAt" FROM conversation
    WHERE owner_id = ${user.userId} AND deleted_at IS NULL
    ORDER BY updated_at DESC LIMIT 30
  `)
  const queryCompletedAt = performance.now()
  console.info('[timing] getConversations', {
    requireSessionMs: Math.round(sessionValidatedAt - startedAt),
    dbMs: Math.round(poolReadyAt - sessionValidatedAt),
    queryMs: Math.round(queryCompletedAt - poolReadyAt),
    totalMs: Math.round(queryCompletedAt - startedAt),
  })
  return conversations
})

export const getConversationMessages = createServerFn({ method: 'GET' })
  .validator((data: unknown) => conversationIdSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireSession()
    const conversation = await (
      await db()
    ).maybeOne(sql.type(z.object({ id: z.string().uuid() }))`
      SELECT id FROM conversation WHERE id = ${data.conversationId} AND owner_id = ${user.userId} AND deleted_at IS NULL
    `)
    if (!conversation) throw new Response('Conversation not found', { status: 404 })
    const messages = await (
      await db()
    ).any(sql.type(conversationMessageSchema)`
      SELECT m.id, m.role, m.content, m.created_at::text AS "createdAt",
        COALESCE(jsonb_agg(jsonb_build_object(
          'number', c.ordinal + 1,
          'title', COALESCE(p.title, f.original_filename, 'Source'),
          'slug', p.slug,
          'fileId', f.id,
          'excerpt', c.excerpt
        ) ORDER BY c.ordinal) FILTER (WHERE c.id IS NOT NULL), '[]'::jsonb) AS citations
      FROM chat_message m
      LEFT JOIN message_citation c ON c.message_id = m.id
      LEFT JOIN content_chunk chunk ON chunk.id = c.content_chunk_id
      LEFT JOIN wiki_page p ON p.id = chunk.page_id
      LEFT JOIN stored_file f ON f.id = chunk.file_id
      WHERE m.conversation_id = ${conversation.id}
      GROUP BY m.id
      ORDER BY m.created_at ASC
    `)
    return messages.map((message) => ({
      ...message,
      citations: message.citations.map((citation) => ({ ...citation, excerpt: citationExcerpt(citation.excerpt) })),
    }))
  })

export const deleteConversation = createServerFn({ method: 'POST' })
  .validator((data: unknown) => conversationIdSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireSession()
    const deleted = await (
      await db()
    ).maybeOne(sql.type(z.object({ id: z.string().uuid() }))`
      UPDATE conversation SET deleted_at = now()
      WHERE id = ${data.conversationId} AND owner_id = ${user.userId} AND deleted_at IS NULL
      RETURNING id
    `)
    if (!deleted) throw new Response('Conversation not found', { status: 404 })
    return { ok: true }
  })

function citationExcerpt(text: string): string {
  if (/[{}]|(?:@_?text|text:(?:span|p)|_text|#text)/i.test(text)) return ''
  return text.slice(0, 320).trim()
}
