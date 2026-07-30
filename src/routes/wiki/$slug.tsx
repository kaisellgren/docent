import { Link, createFileRoute, notFound, redirect, useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import ReactMarkdown from 'react-markdown';
import { useEffect, useState, type FormEvent } from 'react';
import { deletePage, getPage, getPageRevisions, restorePageRevision, updatePage } from '@/features/wiki/server';
import { attachFileToPage, detachFileFromPage, getFiles, getPageAttachments } from '@/features/files/server';
import { currentSession } from '@/server/auth';
import { createServerFn } from '@tanstack/react-start';
import * as styles from '@/styles/app.css';

const getViewer = createServerFn({ method: 'GET' }).handler(() => currentSession());
export const Route = createFileRoute('/wiki/$slug')({
  loader: async ({ params }) => {
    const viewer = await getViewer();
    if (!viewer) throw redirect({ to: '/' });
    const page = await getPage({ data: { slug: params.slug } });
    if (!page) throw notFound();
    const [revisions, attachments, files] = await Promise.all([
      getPageRevisions({ data: { slug: params.slug } }),
      getPageAttachments({ data: { pageId: page.id } }),
      viewer.isEditor ? getFiles() : Promise.resolve([]),
    ]);
    return { page, viewer, revisions, attachments, files };
  },
  component: WikiPage,
});

function WikiPage() {
  const { page, viewer, revisions, attachments, files } = Route.useLoaderData(); const update = useServerFn(updatePage); const restore = useServerFn(restorePageRevision); const remove = useServerFn(deletePage); const attach = useServerFn(attachFileToPage); const detach = useServerFn(detachFileFromPage); const router = useRouter(); const [editing, setEditing] = useState(false); const [title, setTitle] = useState(page.title); const [markdown, setMarkdown] = useState(page.markdown); const [notice, setNotice] = useState(''); const [error, setError] = useState(''); const [pendingAction, setPendingAction] = useState(''); const [attachmentFileId, setAttachmentFileId] = useState('');
  useEffect(() => { setTitle(page.title); setMarkdown(page.markdown); }, [page.revisionId, page.title, page.markdown]);
  async function run(action: string, work: () => Promise<void>) { setError(''); setPendingAction(action); try { await work(); } catch (cause) { setError(messageFor(cause, action)); } finally { setPendingAction(''); } }
  async function save(event: FormEvent) { event.preventDefault(); await run('save this revision', async () => { await update({ data: { slug: page.slug, title, markdown } }); setEditing(false); setNotice('Revision saved and queued for indexing.'); await router.invalidate(); }); }
  async function restoreRevision(revisionId: string, revisionNumber: number) { if (!window.confirm(`Restore revision ${revisionNumber} as a new current revision?`)) return; await run('restore this revision', async () => { await restore({ data: { slug: page.slug, revisionId } }); setNotice(`Revision ${revisionNumber} was restored and queued for indexing.`); await router.invalidate(); }); }
  async function attachSelectedFile() { if (!attachmentFileId) return; await run('attach this file', async () => { await attach({ data: { pageId: page.id, fileId: attachmentFileId } }); setAttachmentFileId(''); setNotice('File attached to this page.'); await router.invalidate(); }); }
  async function detachFile(fileId: string) { await run('detach this file', async () => { await detach({ data: { pageId: page.id, fileId } }); setNotice('File detached from this page.'); await router.invalidate(); }); }
  async function erase() { if (!window.confirm(`Soft-delete “${page.title}”?`)) return; await run('delete this page', async () => { await remove({ data: { slug: page.slug } }); await router.navigate({ to: '/wiki' }); }); }
  const isPending = (action: string) => pendingAction === action;
  const availableFiles = files.filter((file) => !attachments.some((attachment) => attachment.id === file.id));
  return <div className={styles.shell}><header className={styles.nav}><Link className={styles.link} to="/wiki">← Spaces</Link><span className={styles.muted}>Revision {page.revisionNumber}</span></header><article className={styles.article}>{editing ? <form onSubmit={save}><input className={styles.chatInput} value={title} onChange={(e) => setTitle(e.target.value)} disabled={Boolean(pendingAction)} required /><textarea className={styles.chatInput} value={markdown} onChange={(e) => setMarkdown(e.target.value)} rows={18} disabled={Boolean(pendingAction)} required /><div className={styles.actions}><button className={styles.primaryButton} disabled={Boolean(pendingAction)}>{isPending('save this revision') ? 'Saving…' : 'Save revision'}</button><button type="button" className={styles.secondaryButton} disabled={Boolean(pendingAction)} onClick={() => { setEditing(false); setTitle(page.title); setMarkdown(page.markdown); }}>Cancel</button></div></form> : <><h1>{page.title}</h1><p className={styles.muted}>Updated by {page.author}</p><ReactMarkdown>{page.markdown}</ReactMarkdown></>}{viewer.isEditor && <div className={styles.actions}>{!editing && <button type="button" className={styles.secondaryButton} disabled={Boolean(pendingAction)} onClick={() => { setError(''); setEditing(true); }}>Edit</button>}<button type="button" className={styles.secondaryButton} disabled={Boolean(pendingAction)} onClick={() => { void erase(); }}>{isPending('delete this page') ? 'Deleting…' : 'Delete'}</button></div>}{notice && <p className={styles.feedbackSuccess} role="status">{notice}</p>}{error && <p className={styles.feedbackError} role="alert">{error}</p>}<section><h2>Attachments</h2>{attachments.length === 0 && <p className={styles.muted}>No files are attached to this page.</p>}{attachments.map((file) => <div className={styles.card} key={file.id}><strong>{file.filename}</strong><p className={styles.muted}>{file.mediaType.split('/').pop()} · {(file.sizeBytes / 1024).toFixed(0)} KiB{file.tags.length ? ` · ${file.tags.join(', ')}` : ''}</p>{viewer.isEditor && <button type="button" className={styles.secondaryButton} disabled={Boolean(pendingAction)} onClick={() => { void detachFile(file.id); }}>{isPending('detach this file') ? 'Detaching…' : 'Detach'}</button>}</div>)}{viewer.isEditor && <div className={styles.actions}><select value={attachmentFileId} disabled={Boolean(pendingAction) || availableFiles.length === 0} onChange={(event) => setAttachmentFileId(event.target.value)}><option value="">{availableFiles.length ? 'Attach a library file' : 'All library files are attached'}</option>{availableFiles.map((file) => <option key={file.id} value={file.id}>{file.filename}</option>)}</select><button type="button" className={styles.secondaryButton} disabled={!attachmentFileId || Boolean(pendingAction)} onClick={() => { void attachSelectedFile(); }}>{isPending('attach this file') ? 'Attaching…' : 'Attach file'}</button></div>}</section><section><h2>Revision history</h2>{revisions.map((revision) => <div className={styles.card} key={revision.id}><strong>Revision {revision.revisionNumber}: {revision.title}</strong><p className={styles.muted}>{revision.author} · {new Date(revision.createdAt).toLocaleString()}</p>{viewer.isEditor && revision.id !== page.revisionId && <button type="button" className={styles.secondaryButton} disabled={Boolean(pendingAction)} onClick={() => { void restoreRevision(revision.id, revision.revisionNumber); }}>{isPending('restore this revision') ? 'Restoring…' : 'Restore this revision'}</button>}</div>)}</section></article></div>;
}

function messageFor(cause: unknown, action: string) {
  const detail = cause instanceof Error ? cause.message : '';
  return detail ? `Unable to ${action}: ${detail}` : `Unable to ${action}. Please try again.`;
}
