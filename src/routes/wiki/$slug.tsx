import { Link, createFileRoute, notFound, redirect, useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import ReactMarkdown from 'react-markdown';
import { useState, type FormEvent } from 'react';
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
  const { page, viewer, revisions, attachments, files } = Route.useLoaderData(); const update = useServerFn(updatePage); const restore = useServerFn(restorePageRevision); const remove = useServerFn(deletePage); const attach = useServerFn(attachFileToPage); const detach = useServerFn(detachFileFromPage); const router = useRouter(); const [editing, setEditing] = useState(false); const [title, setTitle] = useState(page.title); const [markdown, setMarkdown] = useState(page.markdown); const [notice, setNotice] = useState(''); const [attachmentFileId, setAttachmentFileId] = useState('');
  async function save(event: FormEvent) { event.preventDefault(); await update({ data: { slug: page.slug, title, markdown } }); await router.invalidate(); setEditing(false); }
  async function restoreRevision(revisionId: string, revisionNumber: number) { if (!window.confirm(`Restore revision ${revisionNumber} as a new current revision?`)) return; await restore({ data: { slug: page.slug, revisionId } }); setNotice(`Revision ${revisionNumber} was restored and queued for indexing.`); await router.invalidate(); }
  async function attachSelectedFile() { if (!attachmentFileId) return; await attach({ data: { pageId: page.id, fileId: attachmentFileId } }); setAttachmentFileId(''); setNotice('File attached to this page.'); await router.invalidate(); }
  async function detachFile(fileId: string) { await detach({ data: { pageId: page.id, fileId } }); setNotice('File detached from this page.'); await router.invalidate(); }
  async function erase() { if (window.confirm(`Soft-delete “${page.title}”?`)) { await remove({ data: { slug: page.slug } }); await router.navigate({ to: '/wiki' }); } }
  return <div className={styles.shell}><header className={styles.nav}><Link className={styles.link} to="/wiki">← Wiki</Link><span className={styles.muted}>Revision {page.revisionNumber}</span></header><article className={styles.article}>{editing ? <form onSubmit={save}><input className={styles.chatInput} value={title} onChange={(e) => setTitle(e.target.value)} required /><textarea className={styles.chatInput} value={markdown} onChange={(e) => setMarkdown(e.target.value)} rows={18} required /><button className={styles.primaryButton}>Save revision</button></form> : <><h1>{page.title}</h1><p className={styles.muted}>Updated by {page.author}</p><ReactMarkdown>{page.markdown}</ReactMarkdown></>}{viewer.isEditor && <p>{!editing && <button className={styles.secondaryButton} onClick={() => setEditing(true)}>Edit</button>} <button className={styles.secondaryButton} onClick={erase}>Delete</button></p>}{notice && <p className={styles.muted}>{notice}</p>}<section><h2>Attachments</h2>{attachments.length === 0 && <p className={styles.muted}>No files are attached to this page.</p>}{attachments.map((file) => <div className={styles.card} key={file.id}><strong>{file.filename}</strong><p className={styles.muted}>{file.mediaType.split('/').pop()} · {(file.sizeBytes / 1024).toFixed(0)} KiB{file.tags.length ? ` · ${file.tags.join(', ')}` : ''}</p>{viewer.isEditor && <button className={styles.secondaryButton} onClick={() => { void detachFile(file.id); }}>Detach</button>}</div>)}{viewer.isEditor && <p><select value={attachmentFileId} onChange={(event) => setAttachmentFileId(event.target.value)}><option value="">Attach a library file</option>{files.filter((file) => !attachments.some((attachment) => attachment.id === file.id)).map((file) => <option key={file.id} value={file.id}>{file.filename}</option>)}</select> <button className={styles.secondaryButton} disabled={!attachmentFileId} onClick={() => { void attachSelectedFile(); }}>Attach file</button></p>}</section><section><h2>Revision history</h2>{revisions.map((revision) => <div className={styles.card} key={revision.id}><strong>Revision {revision.revisionNumber}: {revision.title}</strong><p className={styles.muted}>{revision.author} · {new Date(revision.createdAt).toLocaleString()}</p>{viewer.isEditor && revision.id !== page.revisionId && <button className={styles.secondaryButton} onClick={() => restoreRevision(revision.id, revision.revisionNumber)}>Restore this revision</button>}</div>)}</section></article></div>;
}
