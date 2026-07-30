import { Link, createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { ChevronDown, FileText, List, MoreHorizontal, Plus, Search, Star } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { getSpace, getSpacePages } from '@/features/wiki/server';
import { currentSession } from '@/server/auth';
import * as styles from '@/styles/app.css';

const getViewer = createServerFn({ method: 'GET' }).handler(() => currentSession());

export const Route = createFileRoute('/spaces/space/$slug')({
  loader: async ({ params }) => {
    const viewer = await getViewer();
    if (!viewer) return { viewer, space: null, pages: [] };
    const space = await getSpace({ data: { slug: params.slug } });
    if (!space) throw notFound();
    return { viewer, space, pages: await getSpacePages({ data: { spaceId: space.id } }) };
  },
  component: SpacePage,
});

type SpacePageData = Awaited<ReturnType<typeof getSpacePages>>;
type SpacePageItem = SpacePageData[number];

function SpacePage() {
  const { viewer, space, pages } = Route.useLoaderData();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'tree' | 'updated' | 'name'>('tree');
  const [flatList, setFlatList] = useState(false);
  const [starred, setStarred] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  if (!viewer || !space) return <div className={styles.shell}><header className={styles.nav}><Link className={styles.link} to="/spaces">← Spaces</Link></header><section className={styles.section}><a className={styles.primaryButton} href="/auth/google">Sign in to browse spaces</a></section></div>;

  const matchingPages = useMemo(() => pages.filter((page) => page.title.toLowerCase().includes(query.toLowerCase().trim())), [pages, query]);
  const treePages = useMemo(() => includeAncestors(matchingPages, pages), [matchingPages, pages]);
  const contributors = [...new Set(pages.map((page) => page.author))];
  const orderedPages = useMemo(() => {
    const result = [...matchingPages];
    if (sort === 'updated') result.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    if (sort === 'name') result.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'tree') result.sort((a, b) => a.title.localeCompare(b.title));
    return result;
  }, [matchingPages, sort]);

  function toggleCollapsed(id: string) { setCollapsed((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }

  return <div className={styles.shell}><header className={styles.detailNav}><div className={styles.detailNavInner}><Link className={styles.detailBrand} to="/"><DocentMark />Docent</Link><div className={styles.detailCrumb}><Link to="/spaces">Spaces</Link><span>/</span><strong>{space.name}</strong></div><div className={styles.detailNavRight}><Link className={styles.detailNavLink} to="/files">Files</Link><span className={styles.detailUser}>{viewer.name}</span><form action="/auth/logout" method="post"><button className={styles.secondaryButton}>Sign out</button></form></div></div></header><main><section className={styles.spaceHeader}><div className={styles.spaceHeadTop}><div className={styles.spaceIdentity}><div className={styles.spaceLargeIcon}>◎</div><div><h1>{space.name} <span className={styles.spaceKeyBadge}>{space.slug.slice(0, 3).toUpperCase()}</span></h1><p>{space.description}</p></div></div><div className={styles.spaceActions}><button type="button" className={styles.detailIconButton} aria-label={starred ? 'Unstar space' : 'Star space'} aria-pressed={starred} onClick={() => setStarred((value) => !value)}><Star size={16} fill={starred ? 'currentColor' : 'none'} /></button><button type="button" className={styles.detailButton} onClick={() => searchRef.current?.focus()}><Search size={14} />Search in space</button>{viewer.isEditor && <Link className={styles.detailPrimaryButton} to="/spaces/new" search={{ spaceId: space.id }}><Plus size={14} />Create page</Link>}<button type="button" className={styles.detailIconButton} aria-label="More space actions"><MoreHorizontal size={16} /></button></div></div><div className={styles.spaceMetaRow}><span><b>{pages.length}</b> {pages.length === 1 ? 'page' : 'pages'}</span><span><b>{contributors.length}</b> {contributors.length === 1 ? 'contributor' : 'contributors'}</span><span>updated <b>{relativeTime(space.updatedAt)}</b></span><span className={styles.contributorStack}>{contributors.slice(0, 4).map((name) => <span className={styles.contributorAvatar} key={name}>{initials(name)}</span>)}</span></div><div className={styles.spaceTabs}><span>Overview</span><button className={styles.spaceTabActive}>Pages</button><span>People</span><span>Settings</span></div></section><section className={styles.spaceBody}><aside className={styles.treePanel}><label className={styles.treeSearch}><Search size={14} aria-hidden="true" /><input ref={searchRef} className={styles.treeSearchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter pages…" aria-label="Filter pages" /></label><div className={styles.detailPageTree}>{renderTree(null, treePages, collapsed, toggleCollapsed)}</div>{viewer.isEditor && <Link className={styles.treeAdd} to="/spaces/new" search={{ spaceId: space.id }}><Plus size={13} />Add page</Link>}</aside><section><div className={styles.contentHead}><h2>All pages <span>({matchingPages.length})</span></h2><div className={styles.contentControls}><select className={styles.detailSort} value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="tree">Sort: Tree order</option><option value="updated">Sort: Recently updated</option><option value="name">Sort: Name A–Z</option></select><div className={styles.detailViewToggle}><button type="button" className={!flatList ? styles.detailViewActive : styles.detailViewButton} onClick={() => setFlatList(false)} aria-label="Tree order"><List size={13} /></button><button type="button" className={flatList ? styles.detailViewActive : styles.detailViewButton} onClick={() => setFlatList(true)} aria-label="Flat list"><List size={13} /></button></div></div></div><div className={styles.pageList}>{orderedPages.map((page) => <PageRow key={page.id} page={page} pages={pages} depth={flatList ? 0 : pageDepth(page, pages)} />)}{matchingPages.length === 0 && <p className={styles.muted}>No pages match this filter.</p>}</div></section></section></main></div>;
}

function renderTree(parentId: string | null, pages: SpacePageData, collapsed: Set<string>, toggle: (id: string) => void): ReactNode {
  const branch = pages.filter((page) => page.parentPageId === parentId).sort((a, b) => a.title.localeCompare(b.title));
  if (branch.length === 0) return null;
  return <ul className={styles.treeList}>{branch.map((page) => { const hasChildren = pages.some((child) => child.parentPageId === page.id); return <li key={page.id}><div className={styles.treeRow}><button type="button" className={`${styles.treeTwist} ${!hasChildren ? styles.treeTwistHidden : ''}`} onClick={() => toggle(page.id)} aria-label={collapsed.has(page.id) ? 'Expand page' : 'Collapse page'}>{hasChildren && <ChevronDown size={14} />}</button><Link to="/spaces/$slug" params={{ slug: page.slug }}><FileText size={14} /><span>{page.title}</span></Link></div>{hasChildren && !collapsed.has(page.id) && renderTree(page.id, pages, collapsed, toggle)}</li>; })}</ul>;
}

function PageRow({ page, pages, depth }: { page: SpacePageItem; pages: SpacePageData; depth: number }) {
  return <Link className={styles.pageRow} style={{ paddingLeft: 8 + depth * 22 }} to="/spaces/$slug" params={{ slug: page.slug }}><FileText className={styles.pageDocumentIcon} size={15} /><span className={styles.pageMain}><span className={styles.pageTitle}>{page.title}</span>{depth > 0 && <span className={styles.pagePath}>{pagePath(page, pages)}</span>}</span><span className={styles.pageAuthor}><span className={styles.miniAvatar}>{initials(page.author)}</span>{page.author}</span><span className={styles.pageTime}>{relativeTime(page.updatedAt)}</span></Link>;
}

function pageDepth(page: SpacePageItem, pages: SpacePageData) { let depth = 0; let current = page; const visited = new Set<string>(); while (current.parentPageId && !visited.has(current.id)) { visited.add(current.id); const parent = pages.find((candidate) => candidate.id === current.parentPageId); if (!parent) break; depth += 1; current = parent; } return Math.min(depth, 2); }
function pagePath(page: SpacePageItem, pages: SpacePageData) { const path: string[] = []; let current = page; const visited = new Set<string>(); while (current.parentPageId && !visited.has(current.id)) { visited.add(current.id); const parent = pages.find((candidate) => candidate.id === current.parentPageId); if (!parent) break; path.unshift(parent.title); current = parent; } return path.join(' / '); }
function includeAncestors(matches: SpacePageData, pages: SpacePageData) { const ids = new Set(matches.map((page) => page.id)); let changed = true; while (changed) { changed = false; for (const page of pages) if (ids.has(page.id) && page.parentPageId && !ids.has(page.parentPageId)) { ids.add(page.parentPageId); changed = true; } } return pages.filter((page) => ids.has(page.id)); }
function relativeTime(value: string) { const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000)); if (minutes < 1) return 'just now'; if (minutes < 60) return `${minutes}m ago`; const hours = Math.floor(minutes / 60); return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`; }
function initials(name: string) { return name.split(/\s+/).map((part) => part[0] ?? '').join('').slice(0, 2).toUpperCase(); }
function DocentMark() { return <svg className={styles.detailBrandMark} viewBox="0 0 26 26" fill="none" aria-hidden="true"><circle cx="13" cy="5" r="2.6" fill="currentColor" opacity=".95" /><circle cx="5" cy="19" r="2.6" fill="currentColor" opacity=".7" /><circle cx="21" cy="19" r="2.6" fill="currentColor" opacity=".7" /><path d="M13 7.6 6.2 17M13 7.6 19.8 17M7.6 19h10.8" stroke="currentColor" strokeWidth="1.2" opacity=".5" /></svg>; }
