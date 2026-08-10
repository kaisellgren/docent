import { z } from 'zod'
import type { DatabasePool } from 'slonik'
import { sql } from '@/server/db'

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
const sourceSchema = z.object({
  id: z.string().uuid(),
  text: z.string(),
  pageSlug: z.string().nullable(),
  pageTitle: z.string().nullable(),
  filename: z.string().nullable(),
  fileId: z.string().uuid().nullable(),
})

export type ChatRepository = ReturnType<typeof createChatRepository>
export type ChatSource = z.infer<typeof sourceSchema>

export function createChatRepository(database: () => Promise<DatabasePool>) {
  return {
    async listConversations(userId: string) {
      return (await database()).any(sql.type(conversationSchema)`
        SELECT id, title, updated_at::text AS "updatedAt" FROM conversation
        WHERE owner_id = ${userId} AND deleted_at IS NULL
        ORDER BY updated_at DESC LIMIT 30
      `)
    },

    async findConversation(conversationId: string, userId: string) {
      return (await database()).maybeOne(sql.type(z.object({ id: z.string().uuid() }))`
        SELECT id FROM conversation
        WHERE id = ${conversationId} AND owner_id = ${userId} AND deleted_at IS NULL
      `)
    },

    async listMessages(conversationId: string) {
      return (await database()).any(sql.type(conversationMessageSchema)`
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
        WHERE m.conversation_id = ${conversationId}
        GROUP BY m.id
        ORDER BY m.created_at ASC
      `)
    },

    async deleteConversation(conversationId: string, userId: string) {
      return (await database()).maybeOne(sql.type(z.object({ id: z.string().uuid() }))`
        UPDATE conversation SET deleted_at = now()
        WHERE id = ${conversationId} AND owner_id = ${userId} AND deleted_at IS NULL
        RETURNING id
      `)
    },

    async createConversation(userId: string, title: string) {
      return (await database()).one(sql.type(z.object({ id: z.string().uuid() }))`
        INSERT INTO conversation (owner_id, title) VALUES (${userId}, ${title}) RETURNING id
      `)
    },

    async addMessage(conversationId: string, role: 'user' | 'assistant', content: string) {
      return (await database()).one(sql.type(z.object({ id: z.string().uuid() }))`
        INSERT INTO chat_message (conversation_id, role, content)
        VALUES (${conversationId}, ${role}, ${content}) RETURNING id
      `)
    },

    async searchSources(embedding: number[]) {
      return (await database()).any(sql.type(sourceSchema)`
        SELECT c.id, c.text_content AS text, p.slug AS "pageSlug", p.title AS "pageTitle",
          f.original_filename AS filename, f.id AS "fileId"
        FROM content_chunk c
        LEFT JOIN wiki_page p ON p.id = c.page_id
        LEFT JOIN stored_file f ON f.id = c.file_id
        WHERE (p.deleted_at IS NULL OR p.id IS NULL) AND (f.deleted_at IS NULL OR f.id IS NULL)
        ORDER BY c.embedding <=> ${JSON.stringify(embedding)}::vector LIMIT 6
      `)
    },

    async addCitation(messageId: string, sourceId: string, ordinal: number, excerpt: string) {
      await (
        await database()
      ).query(sql.unsafe`
        INSERT INTO message_citation (message_id, content_chunk_id, ordinal, excerpt)
        VALUES (${messageId}, ${sourceId}, ${ordinal}, ${excerpt})
      `)
    },

    async touchConversation(conversationId: string) {
      await (
        await database()
      ).query(sql.unsafe`
        UPDATE conversation SET updated_at = now() WHERE id = ${conversationId}
      `)
    },
  }
}
