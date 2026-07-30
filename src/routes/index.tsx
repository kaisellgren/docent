import { Button } from '@base-ui/react/button';
import { Link, createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { BookOpen, MessageCircle, Send } from 'lucide-react';
import { currentSession } from '@/server/auth';
import { getRecentPages } from '@/features/wiki/server';
import * as styles from '@/styles/app.css';

const getViewer = createServerFn({ method: 'GET' }).handler(() => currentSession());

export const Route = createFileRoute('/')({
  loader: async () => {
    const viewer = await getViewer();
    return { viewer, pages: viewer ? await getRecentPages() : [] };
  },
  component: HomePage,
});

function HomePage() {
  const { viewer, pages } = Route.useLoaderData();
  const [question, setQuestion] = useState('');
  const navigateToChat = () => { if (question.trim()) window.location.assign(`/chat?q=${encodeURIComponent(question.trim())}`); };
  return <div className={styles.shell}>
    <header className={styles.nav}><div className={styles.brand}><BookOpen size={24} /> Docent</div>{viewer ? <div className={styles.muted}>{viewer.name} · {viewer.isEditor ? 'Editor' : 'Viewer'} <form style={{ display: 'inline' }} action="/auth/logout" method="post"><button className={styles.secondaryButton}>Sign out</button></form></div> : <a className={styles.secondaryButton} href="/auth/google">Sign in with Google</a>}</header>
    <section className={styles.hero}>
      <div className={styles.eyebrow}>Internal knowledge base</div>
      <h1 className={styles.headline}>Ask Docent anything.<br /><span className={styles.gradient}>It already knows.</span></h1>
      <p className={styles.subhead}>Every page and document, available through one cited conversation. Browse articles when you need the full context.</p>
      {viewer ? <div className={styles.chatBox}><MessageCircle color="#9ab1ba" /><input className={styles.chatInput} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && navigateToChat()} placeholder="Ask about a policy, a project, or who owns what…" /><Button className={styles.primaryButton} onClick={navigateToChat} aria-label="Ask Docent"><Send size={18} /></Button></div> : <a className={styles.primaryButton} href="/auth/google">Sign in to ask Docent</a>}
    </section>
    {viewer && <section className={styles.section}><h2>Recently updated</h2><div className={styles.grid}>{pages.map((page) => <Link key={page.id} className={styles.card + ' ' + styles.link} to="/wiki/$slug" params={{ slug: page.slug }}><strong>{page.title}</strong><p className={styles.muted}>{page.author} · {new Date(page.updatedAt).toLocaleDateString()}</p></Link>)}</div></section>}
  </div>;
}
