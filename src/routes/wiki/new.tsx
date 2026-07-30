import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import { createServerFn, useServerFn } from '@tanstack/react-start';
import ReactMarkdown from 'react-markdown';
import { useRef, useState, type FormEvent } from 'react';
import { createPage } from '@/features/wiki/server';
import { currentSession } from '@/server/auth';
import * as styles from '@/styles/app.css';

const getViewer = createServerFn({ method: 'GET' }).handler(() => currentSession());

export const Route = createFileRoute('/wiki/new')({
  loader: async () => ({ viewer: await getViewer() }),
  component: CreatePage,
});

type ViewMode = 'split' | 'write' | 'preview';

function CreatePage() {
  const { viewer } = Route.useLoaderData();
  const create = useServerFn(createPage);
  const router = useRouter();
  const editor = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [mode, setMode] = useState<ViewMode>('split');
  const [error, setError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const slug = slugify(title);

  function insert(before: string, after = '') {
    const input = editor.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = markdown.slice(start, end);
    const next = `${markdown.slice(0, start)}${before}${selected}${after}${markdown.slice(end)}`;
    setMarkdown(next);
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + before.length, start + before.length + selected.length); });
  }

  async function publish(event: FormEvent) {
    event.preventDefault();
    setError(''); setPublishing(true);
    try {
      const page = await create({ data: { title, markdown } });
      await router.navigate({ to: '/wiki/$slug', params: { slug: page.slug } });
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : '';
      setError(detail ? `Unable to publish this page: ${detail}` : 'Unable to publish this page. Please try again.');
    } finally {
      setPublishing(false);
    }
  }

  if (!viewer) return <div className={styles.shell}><header className={styles.nav}><Link className={styles.link} to="/wiki">← Wiki</Link></header><section className={styles.section}><h1>Create page</h1><a className={styles.primaryButton} href="/auth/google">Sign in to create a page</a></section></div>;
  if (!viewer.isEditor) return <div className={styles.shell}><header className={styles.nav}><Link className={styles.link} to="/wiki">← Wiki</Link></header><section className={styles.section}><h1>Create page</h1><p className={styles.muted}>Only editors can create pages.</p></section></div>;

  return <><header className={styles.editorNav}><div className={styles.editorNavInner}><Link className={styles.editorBrand} to="/"><DocentMark />Docent</Link><div className={styles.editorCrumb}>Wiki <span className={styles.editorCrumbSeparator}>/</span> <strong className={styles.editorCrumbCurrent}>{title || 'Untitled page'}</strong></div><div className={styles.editorNavRight}><span className={styles.statusPill}><i className={styles.statusPillDot} />New draft</span><Link className={styles.editorButton} to="/wiki">Cancel</Link><button className={styles.editorPrimaryButton} form="create-page" disabled={publishing}>{publishing ? 'Publishing…' : 'Publish'}</button></div></div></header><main className={styles.shell}><form id="create-page" className={styles.editorShell} onSubmit={publish}><section><input className={styles.editorTitleInput} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Untitled page" disabled={publishing} required autoFocus /><div className={styles.editorMeta}><span className={styles.editorSpace}>⌁ Wiki</span><span>Draft</span><span>·</span><span>Editing as {viewer.name}</span></div><div className={styles.editorToolbar}><div className={styles.formatGroup}><button type="button" className={styles.formatButton} onClick={() => insert('**', '**')} title="Bold"><b>B</b></button><button type="button" className={styles.formatButton} onClick={() => insert('_', '_')} title="Italic"><i>i</i></button><button type="button" className={styles.formatButton} onClick={() => insert('## ')} title="Heading">H</button><span className={styles.formatDivider} /><button type="button" className={styles.formatButton} onClick={() => insert('- ')} title="Bulleted list">≡</button><button type="button" className={styles.formatButton} onClick={() => insert('[', '](https://)')} title="Link">⛓</button><button type="button" className={styles.formatButton} onClick={() => insert('`', '`')} title="Code">&lt;/&gt;</button><button type="button" className={styles.formatButton} onClick={() => insert('> ')} title="Quote">“</button></div><div className={styles.viewSwitch}>{(['split', 'write', 'preview'] as const).map((view) => <button type="button" className={mode === view ? styles.viewSwitchActive : styles.viewSwitchButton} key={view} onClick={() => setMode(view)}>{view.charAt(0).toUpperCase() + view.slice(1)}</button>)}</div></div><div className={`${styles.editorPanes} ${mode === 'write' ? styles.editorPanesWrite : mode === 'preview' ? styles.editorPanesPreview : ''}`}><div className={`${styles.editorPane} ${styles.editorWritePane}`}><div className={styles.editorPaneLabel}>Markdown body</div><textarea ref={editor} className={styles.editorTextarea} value={markdown} onChange={(event) => setMarkdown(event.target.value)} placeholder="Start writing in Markdown…" disabled={publishing} spellCheck={false} required /></div><div className={`${styles.editorPane} ${styles.editorPreviewPane}`}><div className={styles.editorPaneLabel}>Preview</div><div className={styles.editorPreview}>{markdown ? <ReactMarkdown>{markdown}</ReactMarkdown> : <p>Markdown preview will appear here.</p>}</div></div></div>{error && <p className={styles.feedbackError} role="alert">{error}</p>}</section><aside className={styles.editorSidebar}><div className={styles.editorSideCard}><h2 className={styles.editorSideCardTitle}>Page settings</h2><div className={styles.editorField}><span>Location</span><output className={styles.editorFieldValue}>Top-level wiki page</output></div><div className={styles.editorField}><span>Slug</span><output className={styles.editorFieldValue}>{slug || 'generated-from-title'}</output></div></div><div className={styles.editorSideCard}><div className={styles.aiHint}><span>✦</span><p className={styles.aiHintText}>Docent will index this page the moment you publish, so it can be cited in chat answers right away.</p></div></div></aside></form></main></>;
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'generated-from-title';
}

function DocentMark() {
  return <svg className={styles.editorBrandMark} viewBox="0 0 26 26" fill="none" aria-hidden="true"><circle cx="13" cy="5" r="2.6" fill="currentColor" opacity=".95" /><circle cx="5" cy="19" r="2.6" fill="currentColor" opacity=".7" /><circle cx="21" cy="19" r="2.6" fill="currentColor" opacity=".7" /><path d="M13 7.6 6.2 17M13 7.6 19.8 17M7.6 19h10.8" stroke="currentColor" strokeWidth="1.2" opacity=".5" /></svg>;
}
