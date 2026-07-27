import { Link, createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useState, type FormEvent } from 'react';
import { askDocent } from '@/features/chat/server';
import * as styles from '@/styles/app.css';

export const Route = createFileRoute('/chat')({ validateSearch: (search: Record<string, unknown>) => ({ q: typeof search.q === 'string' ? search.q : '' }), component: ChatPage });
function ChatPage() {
  const { q } = Route.useSearch(); const ask = useServerFn(askDocent); const [question, setQuestion] = useState(q); const [answer, setAnswer] = useState<{ answer: string; citations: Array<{ number: number; title: string; slug: string | null; excerpt: string }> }>(); const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); if (!question.trim()) return; setLoading(true); try { setAnswer(await ask({ data: { message: question } })); } finally { setLoading(false); } }
  return <div className={styles.shell}><header className={styles.nav}><Link className={styles.link} to="/">← Docent</Link><span className={styles.muted}>Cited knowledge chat</span></header><section className={styles.section}><form className={styles.chatBox} onSubmit={submit}><input className={styles.chatInput} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask Docent…" /><button className={styles.primaryButton} disabled={loading}>{loading ? 'Thinking…' : 'Ask'}</button></form>{answer && <article className={styles.article}><p>{answer.answer}</p><h3>Sources</h3>{answer.citations.map((citation) => <div className={styles.card} key={citation.number}><strong>[{citation.number}] {citation.slug ? <Link className={styles.link} to="/wiki/$slug" params={{ slug: citation.slug }}>{citation.title}</Link> : citation.title}</strong><p className={styles.muted}>{citation.excerpt}</p></div>)}</article>}</section></div>;
}
