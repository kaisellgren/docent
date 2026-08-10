import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSession } from '@/server/auth'
import { chatServer } from '@/server/dependencies'

const conversationIdSchema = z.object({ conversationId: z.string().uuid() })

export const getConversations = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await requireSession()
  return chatServer.getConversations(user.userId)
})

export const getConversationMessages = createServerFn({ method: 'GET' })
  .validator((data: unknown) => conversationIdSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireSession()
    return chatServer.getConversationMessages(data.conversationId, user.userId)
  })

export const deleteConversation = createServerFn({ method: 'POST' })
  .validator((data: unknown) => conversationIdSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireSession()
    return chatServer.deleteConversation(data.conversationId, user.userId)
  })
