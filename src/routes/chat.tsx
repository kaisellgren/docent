import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import { createServerFn, useServerFn } from '@tanstack/react-start';
import { useState, type FormEvent } from 'react';
import { askDocent, getConversationMessages, getConversations } from '@/features/chat/server';
import { currentSession } from '@/server/auth';
import * as styles from '@/styles/app.css';

const getViewer = createServerFn({ method: 'GET' }).handler(() => currentSession());
export const Route = createFileRoute('/chat')({
  validateSearch: (search: Record<string, unknown>) => ({ q: typeof search.q === 'string' ? search.q : '', conversationId: typeof search.conversationId === 'string' ? search.conversationId : '' }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const viewer = await getViewer();
    if (!viewer) return { viewer, conversations: [], messages: [] };
    return {
      viewer,
      conversations: await getConversations(),
      messages: deps.conversationId ? await getConversationMessages({ data: { conversationId: deps.conversationId } }) : [],
    };
  },
  component: ChatPage,
});
function ChatPage() {
  const { q, conversationId } = Route.useSearch(); const { viewer, conversations, messages } = Route.useLoaderData(); const ask = useServerFn(askDocent); const router = useRouter(); const [question, setQuestion] = useState(q); const [answer, setAnswer] = useState<{ answer: string; citations: Array<{ number: number; title: string; slug: string | null; excerpt: string }> }>(); const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); if (!question.trim()) return; setLoading(true); try { const result = await ask({ data: { message: question, conversationId: conversationId || undefined } }); setAnswer(result); setQuestion(''); await router.navigate({ to: '/chat', search: { q: '', conversationId: result.conversationId } }); } finally { setLoading(false); } }
  async function newConversation() { setAnswer(undefined); setQuestion(''); await router.navigate({ to: '/chat', search: { q: '', conversationId: '' } }); }
  return <div className={styles.shell}><header className={styles.nav}><Link className={styles.link} to="/">← Docent</Link><span className={styles.muted}>Cited knowledge chat</span></header><section className={styles.section}>{!viewer && <a className={styles.primaryButton} href="/auth/google">Sign in to ask Docent</a>}{viewer && <><p><button className={styles.secondaryButton} onClick={() => { void newConversation(); }}>New conversation</button></p>{conversations.length > 0 && <div className={styles.grid}>{conversations.map((conversation) => <button className={styles.card} key={conversation.id} onClick={() => { setAnswer(undefined); void router.navigate({ to: '/chat', search: { q: '', conversationId: conversation.id } }); }}><strong>{conversation.title}</strong><p className={styles.muted}>{new Date(conversation.updatedAt).toLocaleString()}</p></button>)}</div>}<article className={styles.article}>{messages.map((message, index) => !(answer && index === messages.length - 1 && message.role === 'assistant') && <div key={message.id}><strong>{message.role === 'user' ? 'You' : 'Docent'}</strong><p>{message.content}</p>{message.citations.length > 0 && <><h3>Sources</h3>{message.citations.map((citation) => <div className={styles.card} key={citation.number}><strong>[{citation.number}] {citation.slug ? <Link className={styles.link} to="/wiki/$slug" params={{ slug: citation.slug }}>{citation.title}</Link> : citation.title}</strong><p className={styles.muted}>{citation.excerpt}</p></div>)}</>}</div>)}{answer && <><strong>Docent</strong><p>{answer.answer}</p><h3>Sources</h3>{answer.citations.map((citation) => <div className={styles.card} key={citation.number}><strong>[{citation.number}] {citation.slug ? <Link className={styles.link} to="/wiki/$slug" params={{ slug: citation.slug }}>{citation.title}</Link> : citation.title}</strong><p className={styles.muted}>{citation.excerpt}</p></div>)}</>}</article><form className={styles.chatBox} onSubmit={submit}><input className={styles.chatInput} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask Docent…" /><button className={styles.primaryButton} disabled={loading}>{loading ? 'Thinking…' : 'Ask'}</button></form></>}</section></div>;
}
