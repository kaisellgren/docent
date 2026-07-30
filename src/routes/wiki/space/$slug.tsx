import { Link, createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getSpace, getSpacePages } from '@/features/wiki/server';
import { currentSession } from '@/server/auth';
import * as styles from '@/styles/app.css';

const getViewer = createServerFn({ method: 'GET' }).handler(() => currentSession());

export const Route = createFileRoute('/wiki/space/$slug')({
  loader: async ({ params }) => {
    const viewer = await getViewer();
    if (!viewer) return { viewer, space: null, pages: [] };
    const space = await getSpace({ data: { slug: params.slug } });
    if (!space) throw notFound();
    return { viewer, space, pages: await getSpacePages({ data: { spaceId: space.id } }) };
  },
  component: SpacePage,
});

function SpacePage() {
  const { viewer, space, pages } = Route.useLoaderData();
  if (!viewer || !space) return <div className={styles.shell}><header className={styles.nav}><Link className={styles.link} to="/wiki">← Spaces</Link></header><section className={styles.section}><a className={styles.primaryButton} href="/auth/google">Sign in to browse spaces</a></section></div>;
  const children = new Map<string | null, typeof pages>();
  for (const page of pages) children.set(page.parentPageId, [...(children.get(page.parentPageId) ?? []), page]);
  return <div className={styles.shell}><header className={styles.nav}><Link className={styles.link} to="/wiki">← Spaces</Link><span className={styles.muted}>{space.name}</span></header><section className={styles.section}><div className={styles.pageSectionHead}><div><h1>{space.name}</h1><p className={styles.muted}>{space.description}</p></div>{viewer.isEditor && <Link className={styles.primaryButton} to="/wiki/new" search={{ spaceId: space.id }}>Create page</Link>}</div><div className={styles.pageTree}>{(children.get(null) ?? []).map((page) => <PageBranch key={page.id} page={page} children={children} depth={0} />)}{pages.length === 0 && <p className={styles.muted}>No pages in this space yet.</p>}</div></section></div>;
}

function PageBranch({ page, children, depth }: { page: { id: string; slug: string; title: string }; children: Map<string | null, ReadonlyArray<{ id: string; slug: string; title: string }>>; depth: number }) {
  return <div><Link className={styles.pageTreeLink} style={{ marginLeft: depth * 22 }} to="/wiki/$slug" params={{ slug: page.slug }}>{page.title}</Link>{(children.get(page.id) ?? []).map((child) => <PageBranch key={child.id} page={child} children={children} depth={depth + 1} />)}</div>;
}
