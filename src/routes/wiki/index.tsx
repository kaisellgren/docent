import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useState, type FormEvent } from 'react';
import { createPage, getRecentPages } from '@/features/wiki/server';
import { currentSession } from '@/server/auth';
import { createServerFn } from '@tanstack/react-start';
import * as styles from '@/styles/app.css';

const getViewer = createServerFn({ method: 'GET' }).handler(() => currentSession());
export const Route = createFileRoute('/wiki/')({
  loader: async () => {
    const viewer = await getViewer();
    return { viewer, pages: viewer ? await getRecentPages() : [] };
  },
  component: WikiIndex,
});

function WikiIndex() {
  const { viewer, pages } = Route.useLoaderData(); const create = useServerFn(createPage); const router = useRouter(); const [title, setTitle] = useState(''); const [markdown, setMarkdown] = useState(''); const [error, setError] = useState(''); const [creating, setCreating] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setCreating(true);
    try {
      const page = await create({ data: { title, markdown } });
      await router.navigate({ to: '/wiki/$slug', params: { slug: page.slug } });
    } catch (cause) {
      setError(messageFor(cause, 'create this page'));
    } finally {
      setCreating(false);
    }
  }
  return <div className={styles.shell}><header className={styles.nav}><Link className={styles.link} to="/">← Docent</Link><span className={styles.muted}>Wiki browser</span></header><section className={styles.section}><h1>Wiki pages</h1>{!viewer && <a className={styles.primaryButton} href="/auth/google">Sign in to browse the wiki</a>}{viewer?.isEditor && <form className={styles.card} onSubmit={submit}><h2>Create page</h2><input className={styles.chatInput} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" disabled={creating} required /><textarea className={styles.chatInput} value={markdown} onChange={(e) => setMarkdown(e.target.value)} placeholder="Markdown content" rows={8} disabled={creating} required />{error && <p className={styles.feedbackError} role="alert">{error}</p>}<button className={styles.primaryButton} disabled={creating}>{creating ? 'Creating…' : 'Create and index'}</button></form>}<div className={styles.grid}>{pages.map((page) => <Link className={styles.card + ' ' + styles.link} key={page.id} to="/wiki/$slug" params={{ slug: page.slug }}>{page.title}</Link>)}</div></section></div>;
}

function messageFor(cause: unknown, action: string) {
  const detail = cause instanceof Error ? cause.message : '';
  return detail ? `Unable to ${action}: ${detail}` : `Unable to ${action}. Please try again.`;
}
