import { createServerFn } from '@tanstack/react-start'
import { embedText } from '@/features/ai/vertex'
import { getDocentAgent } from '@/mastra'
import { chatInputSchema } from '@/server/content'
import { requireSession } from '@/server/auth'
import { chatRepository } from '@/server/dependencies'

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

export const askDocent = createServerFn({ method: 'POST' })
  .validator((data: unknown) => chatInputSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireSession()
    const conversation = data.conversationId
      ? await chatRepository.findConversation(data.conversationId, user.userId)
      : await chatRepository.createConversation(user.userId, data.message.slice(0, 80))
    if (!conversation) throw new Response('Conversation not found', { status: 404 })
    await chatRepository.addMessage(conversation.id, 'user', data.message)
    const embedding = await embedText(data.message, 'RETRIEVAL_QUERY')
    const sources = await chatRepository.searchSources(embedding)
    const context = sources
      .map((source, index) => `[${index + 1}] ${source.pageTitle ?? source.filename}\n${source.text}`)
      .join('\n\n')
    const answer = await getDocentAgent()
      .generate(`Knowledge:\n${context || 'No indexed knowledge is available.'}\n\nQuestion: ${data.message}`)
      .then((result) => result.text)
    const citedSources = sources.flatMap((source, index) =>
      citedNumberSet(answer).has(index + 1) ? [{ source, ordinal: index }] : [],
    )
    const message = await chatRepository.addMessage(conversation.id, 'assistant', answer)
    for (const { source, ordinal } of citedSources)
      await chatRepository.addCitation(message.id, source.id, ordinal, source.text.slice(0, 500))
    await chatRepository.touchConversation(conversation.id)
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
