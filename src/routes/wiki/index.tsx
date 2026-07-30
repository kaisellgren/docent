import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import { createServerFn, useServerFn } from '@tanstack/react-start';
import { Grid2X2, List, Plus, Search } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { createSpace, getSpaces } from '@/features/wiki/server';
import { currentSession } from '@/server/auth';
import * as styles from '@/styles/app.css';

const getViewer = createServerFn({ method: 'GET' }).handler(() => currentSession());

export const Route = createFileRoute('/wiki/')({
  loader: async () => {
    const viewer = await getViewer();
    return { viewer, spaces: viewer ? await getSpaces() : [] };
  },
  component: SpacesIndex,
});

function SpacesIndex() {
  const { viewer, spaces } = Route.useLoaderData();
  const router = useRouter();
  const create = useServerFn(createSpace);
  const [query, setQuery] = useState('');
  const [listView, setListView] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const filteredSpaces = useMemo(() => spaces.filter((space) => `${space.name} ${space.description}`.toLowerCase().includes(query.toLowerCase().trim())), [query, spaces]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      await create({ data: { name, description } });
      setName(''); setDescription(''); setCreating(false);
      await router.invalidate();
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : '';
      setError(detail ? `Unable to create this space: ${detail}` : 'Unable to create this space. Please try again.');
    }
  }

  return <div className={styles.shell}>
    <header className={styles.spacesNav}>
      <Link className={styles.spacesBrand} to="/"><DocentMark />Docent</Link>
      <nav className={styles.spacesNavLinks} aria-label="Primary navigation">
        <Link className={styles.spacesNavActive} to="/wiki">Spaces</Link>
        <Link className={styles.spacesNavLink} to="/files">Files</Link>
        {viewer?.isEditor && <Link className={styles.spacesNavLink} to="/wiki/new" search={{ spaceId: '' }}>Create page</Link>}
      </nav>
      <div className={styles.spacesNavRight}>{viewer ? <><span className={styles.muted}>{viewer.name}</span><form action="/auth/logout" method="post"><button className={styles.secondaryButton}>Sign out</button></form></> : <a className={styles.secondaryButton} href="/auth/google">Sign in with Google</a>}</div>
    </header>
    {!viewer ? <section className={styles.section}><h1>Spaces</h1><p className={styles.muted}>Sign in to browse your team’s knowledge spaces.</p><a className={styles.primaryButton} href="/auth/google">Sign in with Google</a></section> : <>
      <section className={styles.spacesPageHead}>
        <div><h1>Spaces</h1><p>Where your team’s knowledge lives, organized by topic and team.</p></div>
        <div className={styles.spacesHeadActions}>
          <label className={styles.spacesSearch}><Search size={15} aria-hidden="true" /><input className={styles.spacesSearchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a space…" aria-label="Find a space" /></label>
          {viewer.isEditor && <button className={styles.spacesPrimaryButton} onClick={() => { setError(''); setCreating((value) => !value); }}><Plus size={14} />Create space</button>}
        </div>
      </section>
      {creating && <form className={styles.spaceCreateForm} onSubmit={submit}><input className={styles.spacesFormInput} value={name} onChange={(event) => setName(event.target.value)} placeholder="Space name" required autoFocus /><input className={styles.spacesFormInput} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What belongs in this space?" required /><button className={styles.primaryButton}>Create space</button><button type="button" className={styles.secondaryButton} onClick={() => setCreating(false)}>Cancel</button>{error && <p className={styles.feedbackError} role="alert">{error}</p>}</form>}
      <div className={styles.spacesFilterRow}><span className={styles.spacesCount}>All spaces ({filteredSpaces.length})</span><div className={styles.spacesViewToggle}><button type="button" className={!listView ? styles.spacesViewActive : styles.spacesViewButton} onClick={() => setListView(false)} aria-label="Grid view"><Grid2X2 size={14} /></button><button type="button" className={listView ? styles.spacesViewActive : styles.spacesViewButton} onClick={() => setListView(true)} aria-label="List view"><List size={14} /></button></div></div>
      {spaces.length === 0 ? <section className={styles.emptySpaces}><h2>No spaces yet</h2><p>Create a space to organize pages and their parent-child hierarchy.</p>{viewer.isEditor && <button className={styles.primaryButton} onClick={() => setCreating(true)}>Create the first space</button>}</section> : <><div className={`${styles.spacesGrid} ${listView ? styles.spacesGridList : ''}`}>{filteredSpaces.map((space, index) => <Link className={styles.spaceCard} key={space.id} to="/wiki/space/$slug" params={{ slug: space.slug }}><div className={styles.spaceCardTop}><span className={styles.spaceIcon}>{SPACE_ICONS[index % SPACE_ICONS.length]}</span><span className={styles.spaceKey}>{space.slug.slice(0, 3).toUpperCase()}</span></div><h2>{space.name}</h2><p>{space.description}</p><div className={styles.spaceCardFoot}><span>{space.pageCount} {space.pageCount === 1 ? 'page' : 'pages'}</span><span>updated {relativeTime(space.updatedAt)}</span></div></Link>)}</div>{filteredSpaces.length === 0 && <p className={styles.muted}>No spaces match “{query}”.</p>}</>}
    </>}
  </div>;
}

const SPACE_ICONS = ['⌁', '◧', '◎', '✦', '◫', '▤'];

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function DocentMark() {
  return <svg className={styles.spacesBrandMark} viewBox="0 0 26 26" fill="none" aria-hidden="true"><circle cx="13" cy="5" r="2.6" fill="currentColor" opacity=".95" /><circle cx="5" cy="19" r="2.6" fill="currentColor" opacity=".7" /><circle cx="21" cy="19" r="2.6" fill="currentColor" opacity=".7" /><path d="M13 7.6 6.2 17M13 7.6 19.8 17M7.6 19h10.8" stroke="currentColor" strokeWidth="1.2" opacity=".5" /></svg>;
}
