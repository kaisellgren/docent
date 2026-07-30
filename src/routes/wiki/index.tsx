import { Link, createFileRoute } from '@tanstack/react-router';
import { getRecentPages } from '@/features/wiki/server';
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
  const { viewer, pages } = Route.useLoaderData();
  return <div className={styles.shell}><header className={styles.nav}><Link className={styles.link} to="/">← Docent</Link><span className={styles.muted}>Wiki browser</span></header><section className={styles.section}><div className={styles.pageSectionHead}><div><h1>Wiki pages</h1><p className={styles.muted}>Browse your team’s published knowledge.</p></div>{viewer?.isEditor && <Link className={styles.primaryButton} to="/wiki/new">Create page</Link>}</div>{!viewer && <a className={styles.primaryButton} href="/auth/google">Sign in to browse the wiki</a>}{viewer && pages.length === 0 && <p className={styles.muted}>No pages yet.{viewer.isEditor ? ' Create the first one to start building the wiki.' : ''}</p>}<div className={styles.grid}>{pages.map((page) => <Link className={styles.card + ' ' + styles.link} key={page.id} to="/wiki/$slug" params={{ slug: page.slug }}><strong>{page.title}</strong><p className={styles.muted}>{page.author} · {new Date(page.updatedAt).toLocaleDateString()}</p></Link>)}</div></section></div>;
}
