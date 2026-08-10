import { db } from './db'
import { createChatRepository } from '@/features/chat/repository'
import { createChatServer } from '@/features/chat/chat.server'

export const chatRepository = createChatRepository(db)
export const chatServer = createChatServer(chatRepository)
