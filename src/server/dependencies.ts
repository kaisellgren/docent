import { db } from './db'
import { createChatRepository } from '@/features/chat/repository'
import { createChatServer } from '@/features/chat/chat.server'
import { createWikiRepository } from '@/features/wiki/wiki.repository'

export const chatRepository = createChatRepository(db)
export const chatServer = createChatServer(chatRepository)
export const wikiRepository = createWikiRepository(db)
