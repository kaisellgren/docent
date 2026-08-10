import type { ChatRepository, ChatSource } from './repository'

function citationExcerpt(text: string): string {
  if (/[{}]|(?:@_?text|text:(?:span|p)|_text|#text)/i.test(text)) return ''
  return text.slice(0, 320).trim()
}

export function createChatServer(repository: ChatRepository) {
  return {
    async getConversations(userId: string) {
      return repository.listConversations(userId)
    },

    async getConversationMessages(conversationId: string, userId: string) {
      const conversation = await repository.findConversation(conversationId, userId)
      if (!conversation) throw new Response('Conversation not found', { status: 404 })
      const messages = await repository.listMessages(conversation.id)
      return messages.map((message) => ({
        ...message,
        citations: message.citations.map((citation) => ({ ...citation, excerpt: citationExcerpt(citation.excerpt) })),
      }))
    },

    async deleteConversation(conversationId: string, userId: string) {
      const deleted = await repository.deleteConversation(conversationId, userId)
      if (!deleted) throw new Response('Conversation not found', { status: 404 })
      return { ok: true }
    },

    citationExcerpt,
  }
}

export type ChatServer = ReturnType<typeof createChatServer>
export type { ChatSource }
