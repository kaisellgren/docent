import { MoreHorizontal, Pencil, Share2, Sparkles, Star, Upload } from 'lucide-react';
import { Link, createFileRoute, notFound, redirect, useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import ReactMarkdown from 'react-markdown';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { deletePage, getPage, getPageRevisions, getSpacePages, restorePageRevision, retryPageIngestion, updatePage } from '@/features/wiki/server';
import { attachFileToPage, confirmUpload, createUploadIntent, detachFileFromPage, getPageAttachments, getSpaceFiles } from '@/features/files/server';
import { currentSession } from '@/server/auth';
import { createServerFn } from '@tanstack/react-start';
import { TopNavigation } from '@/components/navigation';
import { SpaceIcon } from '@/components/space-icon';
import { FancySelect } from '@/components/fancy-select';
import { FilePreviewModal } from '@/components/file-preview-modal';
import { friendlyFileType } from '@/server/content';
import { IngestionStatus } from '@/components/ingestion-status';
import * as styles from '@/styles/app.css';

const getViewer = createServerFn({ method: 'GET' }).handler(() => currentSession());
type SpacePages = Awaited<ReturnType<typeof getSpacePages>>;

export const Route = createFileRoute('/spaces/$slug')({
  loader: async ({ params }) => {
    const viewer = await getViewer();
    if (!viewer) throw redirect({ to: '/' });
    const page = await getPage({ data: { slug: params.slug } });
    if (!page) throw notFound();
    const [revisions, attachments, files, spacePages] = await Promise.all([
      getPageRevisions({ data: { slug: params.slug } }),
      getPageAttachments({ data: { pageId: page.id } }),
      viewer.isEditor ? getSpaceFiles({ data: { spaceId: page.spaceId } }) : Promise.resolve([]),
      getSpacePages({ data: { spaceId: page.spaceId } }),
    ]);
    return { page, viewer, revisions, attachments, files, spacePages };
  },
  component: PageView,
});

function PageView() {
  const { page, viewer, revisions, attachments, files, spacePages } = Route.useLoaderData();
  const update = useServerFn(updatePage);
  const restore = useServerFn(restorePageRevision);
  const remove = useServerFn(deletePage);
  const retryIngestion = useServerFn(retryPageIngestion);
  const attach = useServerFn(attachFileToPage);
  const detach = useServerFn(detachFileFromPage);
  const uploadIntent = useServerFn(createUploadIntent);
  const confirm = useServerFn(confirmUpload);
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [starred, setStarred] = useState(false);
  const [title, setTitle] = useState(page.title);
  const [markdown, setMarkdown] = useState(page.markdown);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState('');
  const [attachmentFileId, setAttachmentFileId] = useState('');
  const [attachmentFilename, setAttachmentFilename] = useState('');
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [attachmentDragging, setAttachmentDragging] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ id: string; filename: string } | null>(null);
  useEffect(() => { setTitle(page.title); setMarkdown(page.markdown); }, [page.revisionId, page.title, page.markdown]);

  async function run(action: string, work: () => Promise<void>) {
    setError(''); setPendingAction(action);
    try { await work(); } catch (cause) { setError(messageFor(cause, action)); } finally { setPendingAction(''); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    await run('save this revision', async () => { await update({ data: { slug: page.slug, title, markdown } }); setEditing(false); setNotice('Revision saved and queued for indexing.'); await router.invalidate(); });
  }
  async function restoreRevision(revisionId: string, revisionNumber: number) {
    if (!window.confirm(`Restore revision ${revisionNumber} as a new current revision?`)) return;
    await run('restore this revision', async () => { await restore({ data: { slug: page.slug, revisionId } }); setNotice(`Revision ${revisionNumber} was restored and queued for indexing.`); await router.invalidate(); });
  }
  async function attachSelectedFile() {
    if (!attachmentFileId) return;
    await run('attach this file', async () => { await attach({ data: { pageId: page.id, fileId: attachmentFileId } }); setAttachmentFileId(''); setNotice('File attached to this page.'); await router.invalidate(); });
  }
  async function detachFile(fileId: string) {
    await run('detach this file', async () => { await detach({ data: { pageId: page.id, fileId } }); setNotice('File detached from this page.'); await router.invalidate(); });
  }
  async function uploadAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const selectedFiles = attachmentFiles.length ? attachmentFiles : form.getAll('file').filter((value): value is File => value instanceof File && value.size > 0);
    if (selectedFiles.length === 0) return;
    await run('upload this file', async () => {
      for (const selected of selectedFiles) {
        const mediaType = selected.type || mediaTypeForFilename(selected.name);
        if (!mediaType) continue;
        const intent = await uploadIntent({ data: { filename: selected.name, mediaType, sizeBytes: selected.size, folderId: null, tagNames: [], spaceId: page.spaceId, pageId: page.id } });
        const response = await fetch(intent.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mediaType }, body: selected });
        if (!response.ok) throw new Error(`The file ${selected.name} could not be uploaded to storage.`);
        await confirm({ data: { fileId: intent.fileId } });
      }
      setNotice('File attached and queued for indexing.');
      formElement.reset();
      setAttachmentFilename('');
      setAttachmentFiles([]);
      setAttachmentDragging(false);
      await router.invalidate();
    });
  }
  async function erase() {
    if (!window.confirm(`Soft-delete “${page.title}”?`)) return;
    await run('delete this page', async () => { await remove({ data: { slug: page.slug } }); await router.navigate({ to: '/spaces' }); });
  }
  async function sharePage() {
    try { await navigator.clipboard?.writeText(window.location.href); setNotice('Page link copied to clipboard.'); } catch { setNotice('Copy the page URL from your browser address bar.'); }
  }
  async function retryIndexing() {
    await run('retry indexing', async () => {
      await retryIngestion({ data: { slug: page.slug } });
      setNotice('Indexing restarted.');
      await router.invalidate();
    });
  }

  const isPending = (action: string) => pendingAction === action;
  const availableFiles = files.filter((file) => !attachments.some((attachment) => attachment.id === file.id));
  const contributors = Array.from(new Set(revisions.map((revision) => revision.author)));
  const headings = extractHeadings(page.markdown);
  const wordCount = page.markdown.trim() ? page.markdown.trim().split(/\s+/).length : 0;
  const readMinutes = Math.max(1, Math.ceil(wordCount / 220));
  const parentPath = getParentPath(page, spacePages);
  const parentPage = page.parentPageId ? spacePages.find((item) => item.id === page.parentPageId) : undefined;

  return <div>
    <TopNavigation viewer={viewer} createPageContext={{ spaceId: page.spaceId, parentPageId: page.parentPageId ?? "" }} />
    <div className={styles.pageActionBar}>
      <div className={`${styles.shell} ${styles.pageActionBarInner}`}>
        <div className={styles.pageBreadcrumb}><Link className={styles.pageBreadcrumbLink} to="/spaces">Spaces</Link><span>/</span><Link className={styles.pageBreadcrumbLink} to="/spaces/space/$slug" params={{ slug: page.spaceSlug }}>{page.spaceName}</Link>{parentPage && <><span>/</span><Link className={styles.pageBreadcrumbLink} to="/spaces/$slug" params={{ slug: parentPage.slug }}>{parentPage.title}</Link></>}<span>/</span><span className={styles.pageBreadcrumbCurrent}>{page.title}</span></div>
        <div className={styles.pageActionGroup}><button type="button" className={styles.pageIconButton} aria-label={starred ? 'Unstar page' : 'Star page'} aria-pressed={starred} onClick={() => setStarred((value) => !value)}><Star size={15} fill={starred ? 'currentColor' : 'none'} /></button><button type="button" className={styles.pageIconButton} aria-label="Share page" onClick={() => { void sharePage(); }}><Share2 size={15} /></button><button type="button" className={styles.pageIconButton} aria-label="More page actions"><MoreHorizontal size={15} /></button>{viewer.isEditor && <button type="button" className={styles.pageActionPrimary} onClick={() => { setError(''); setEditing(true); }}><Pencil size={13} />Edit</button>}</div>
      </div>
    </div>
    <main className={`${styles.shell} ${styles.pageViewBody}`}>
      <PageTree pages={spacePages} currentId={page.id} spaceSlug={page.spaceSlug} spaceIcon={page.spaceIcon} />
      <article className={styles.pageArticle}>
        {viewer.isEditor && <form className={`${styles.fileUploadForm} ${attachmentDragging ? styles.fileUploadFormDragging : ''}`} onSubmit={uploadAttachment} onDragEnter={(event) => { event.preventDefault(); setAttachmentDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setAttachmentDragging(false); }} onDrop={(event) => { event.preventDefault(); setAttachmentDragging(false); const files = [...event.dataTransfer.files]; setAttachmentFiles(files); setAttachmentFilename(files.map((file) => file.name).join(', ')); }}><label className={styles.detailButton}><Upload size={14} /><span className={styles.fileUploadName}>{attachmentFilename || 'Attach files'}</span><input name="file" type="file" multiple accept=".pdf,.docx,.odt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text" onChange={(event) => { const files = [...(event.target.files ?? [])]; setAttachmentFiles(files); setAttachmentFilename(files.map((file) => file.name).join(', ')); }} required /></label><button className={styles.detailPrimaryButton}>Upload</button></form>}
        <div className={styles.pageArticleHead}><div className={styles.pageSpacePill}><SpaceIcon name={page.spaceIcon} size={14} /> {page.spaceName}{parentPath ? ` / ${parentPath}` : ''}</div><h1 className={styles.pageTitleView}>{page.title}</h1><div className={styles.pageArticleMeta}><span className={styles.pageAuthorMeta}><span className={styles.miniAvatar}>{initials(page.author)}</span>{page.author}</span><span>·</span><span>updated {relativeTime(page.updatedAt)}</span><span>·</span><span>{readMinutes} min read</span><span>·</span><span>{revisions.length} {revisions.length === 1 ? 'revision' : 'revisions'}</span><IngestionStatus status={page.ingestionStatus} error={page.ingestionError} onRetry={viewer.isEditor && page.ingestionStatus === 'failed' ? () => { void retryIndexing(); } : undefined} /></div></div>
        {editing ? <form className={styles.pageEditForm} onSubmit={save}><input className={styles.pageEditTitle} value={title} onChange={(event) => setTitle(event.target.value)} disabled={Boolean(pendingAction)} required /><textarea className={styles.pageEditTextarea} value={markdown} onChange={(event) => setMarkdown(event.target.value)} disabled={Boolean(pendingAction)} required /><div className={styles.actions}><button className={styles.pageActionPrimary} disabled={Boolean(pendingAction)}>{isPending('save this revision') ? 'Saving…' : 'Save revision'}</button><button type="button" className={styles.pageActionButton} disabled={Boolean(pendingAction)} onClick={() => { setEditing(false); setTitle(page.title); setMarkdown(page.markdown); }}>Cancel</button></div></form> : <div className={styles.pageProse}><ReactMarkdown components={{ h2: ({ children }) => <h2 id={headingId(children)}>{children}</h2>, h3: ({ children }) => <h3 id={headingId(children)}>{children}</h3> }}>{page.markdown}</ReactMarkdown></div>}
        {notice && <p className={styles.feedbackSuccess} role="status">{notice}</p>}{error && <p className={styles.feedbackError} role="alert">{error}</p>}
        <section className={styles.pageAttachments}><h2>Attachments</h2>{attachments.length === 0 && <p className={styles.muted}>No files are attached to this page.</p>}{attachments.map((file) => <div className={styles.pageAttachment} key={file.id}><span><b className={styles.filePreviewLink} onClick={() => setPreviewFile({ id: file.id, filename: file.filename })}>{file.filename}</b><br /><small>{friendlyFileType(file.mediaType)} · {(file.sizeBytes / 1024).toFixed(0)} KiB{file.tags.length ? ` · ${file.tags.join(', ')}` : ''}</small></span>{viewer.isEditor && <button type="button" className={styles.pageActionButton} disabled={Boolean(pendingAction)} onClick={() => { void detachFile(file.id); }}>{isPending('detach this file') ? 'Detaching…' : 'Detach'}</button>}</div>)}{viewer.isEditor && <div className={styles.actions}><FancySelect value={attachmentFileId} onChange={setAttachmentFileId} disabled={Boolean(pendingAction) || availableFiles.length === 0} options={[{ value: '', label: availableFiles.length ? 'Attach a library file' : 'All library files are attached' }, ...availableFiles.map((file) => ({ value: file.id, label: file.filename }))]} /><button type="button" className={styles.pageActionButton} disabled={!attachmentFileId || Boolean(pendingAction)} onClick={() => { void attachSelectedFile(); }}>{isPending('attach this file') ? 'Attaching…' : 'Attach file'}</button></div>}</section><FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
        <section className={styles.pageAttachments}><h2>Revision history</h2><div className={styles.pageRevisionList}>{revisions.map((revision) => <div className={styles.pageRevision} key={revision.id}><b>Revision {revision.revisionNumber}: {revision.title}</b><br /><span className={styles.muted}>{revision.author} · {new Date(revision.createdAt).toLocaleString()}</span>{viewer.isEditor && revision.id !== page.revisionId && <button type="button" className={styles.pageActionButton} disabled={Boolean(pendingAction)} onClick={() => { void restoreRevision(revision.id, revision.revisionNumber); }}>{isPending('restore this revision') ? 'Restoring…' : 'Restore'}</button>}</div>)}</div>{viewer.isEditor && <button type="button" className={styles.pageActionButton} onClick={() => { void erase(); }}>Delete page</button>}</section>
      </article>
      <PageSidebar headings={headings} contributors={contributors} page={page} revisions={revisions.length} wordCount={wordCount} />
    </main>
  </div>;
}

function PageTree({ pages, currentId, spaceSlug, spaceIcon }: { pages: SpacePages; currentId: string; spaceSlug: string; spaceIcon: Parameters<typeof SpaceIcon>[0]["name"] }) {
  const render = (parentId: string | null): ReactNode => <ul className={parentId ? styles.pageMiniTreeNested : styles.pageMiniTree}>{pages.filter((item) => item.parentPageId === parentId).map((item) => <li key={item.id}><Link className={item.id === currentId ? styles.pageMiniTreeCurrent : styles.pageMiniTreeRow} to="/spaces/$slug" params={{ slug: item.slug }}>{item.title}</Link>{render(item.id)}</li>)}</ul>;
  const current = pages.find((item) => item.id === currentId);
  return <nav className={styles.pageSideNav}><Link className={styles.pageSpaceTag} to="/spaces/space/$slug" params={{ slug: spaceSlug }}><span className={styles.pageSpaceIcon}><SpaceIcon name={spaceIcon} size={13} /></span>{current ? 'Space pages' : 'Space'}</Link>{render(null)}</nav>;
}

function PageSidebar({ headings, contributors, page, revisions, wordCount }: { headings: Heading[]; contributors: string[]; page: { createdAt: string }; revisions: number; wordCount: number }) {
  return <aside className={styles.pageRightSide}><div className={styles.pageSideCard}><h4 className={styles.pageSideHeading}>On this page</h4><nav>{headings.length ? headings.map((heading) => <a className={heading.level === 3 ? styles.pageTocSubLink : styles.pageTocLink} href={`#${heading.id}`} key={heading.id}>{heading.text}</a>) : <span className={styles.muted}>No headings</span>}</nav></div><div className={styles.pageSideCard}><h4 className={styles.pageSideHeading}>Contributors</h4><div className={styles.pageContribList}>{contributors.slice(0, 4).map((name, index) => <div className={styles.pageContribRow} key={name}><span className={styles.miniAvatar}>{initials(name)}</span><div><div className={styles.pageContribName}>{name}</div><div className={styles.pageContribRole}>{index === 0 ? 'Editing now' : `${index} ${index === 1 ? 'edit' : 'edits'}`}</div></div></div>)}</div></div><div className={styles.pageSideCard}><h4 className={styles.pageSideHeading}>Page info</h4><div className={styles.pageInfoRow}><span>Created</span><b className={styles.pageInfoValue}>{new Date(page.createdAt).toLocaleDateString()}</b></div><div className={styles.pageInfoRow}><span>Revisions</span><b className={styles.pageInfoValue}>{revisions}</b></div><div className={styles.pageInfoRow}><span>Word count</span><b className={styles.pageInfoValue}>{wordCount}</b></div></div><div className={styles.pageAiCited}><Sparkles size={18} /><div className={styles.pageAiNumber}>—</div><div className={styles.pageAiLabel}>chat citation analytics will appear here as answers use this page</div></div></aside>;
}

type Heading = { id: string; text: string; level: 2 | 3 };
function extractHeadings(markdown: string): Heading[] { return markdown.split('\n').flatMap((line) => { const match = /^(##|###)\s+(.+?)\s*$/.exec(line); if (!match?.[1] || !match[2]) return []; const text = match[2].replace(/[*_`]/g, ''); return [{ id: slugify(text), text, level: match[1].length as 2 | 3 }]; }); }
function headingId(children: ReactNode): string { return slugify(String(children ?? '')); }
function slugify(value: string): string { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section'; }
function getParentPath(page: { parentPageId: string | null }, pages: SpacePages): string { const parent = page.parentPageId ? pages.find((item) => item.id === page.parentPageId) : undefined; return parent?.title ?? ''; }
function relativeTime(value: string): string { const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60_000)); if (minutes < 60) return `${minutes}m ago`; const hours = Math.round(minutes / 60); if (hours < 24) return `${hours}h ago`; const days = Math.round(hours / 24); return `${days}d ago`; }
function initials(name: string): string { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function messageFor(cause: unknown, action: string) { const detail = cause instanceof Error ? cause.message : ''; return detail ? `Unable to ${action}: ${detail}` : `Unable to ${action}. Please try again.`; }
function mediaTypeForFilename(filename: string): 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' | 'application/vnd.oasis.opendocument.text' | undefined {
  const extension = filename.toLowerCase().split('.').pop();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (extension === 'odt') return 'application/vnd.oasis.opendocument.text';
  return undefined;
}
