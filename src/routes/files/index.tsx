import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useState, type FormEvent } from 'react';
import { createFolder, createUploadIntent, confirmUpload, getFiles, getFolders } from '@/features/files/server';
import { currentSession } from '@/server/auth';
import { createServerFn } from '@tanstack/react-start';
import * as styles from '@/styles/app.css';

const getViewer = createServerFn({ method: 'GET' }).handler(() => currentSession());
export const Route = createFileRoute('/files/')({
  loader: async () => {
    const viewer = await getViewer();
    return { viewer, files: viewer ? await getFiles() : [], folders: viewer ? await getFolders() : [] };
  },
  component: FilesPage,
});

function FilesPage() {
  const { viewer, files, folders } = Route.useLoaderData(); const router = useRouter(); const uploadIntent = useServerFn(createUploadIntent); const confirm = useServerFn(confirmUpload); const addFolder = useServerFn(createFolder); const [notice, setNotice] = useState(''); const [folder, setFolder] = useState('');
  async function upload(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const selected = form.get('file'); if (!(selected instanceof File)) return; if (selected.size > 5 * 1024 * 1024) { setNotice('Files must be 5 MiB or smaller.'); return; }
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.oasis.opendocument.text']; if (!allowed.includes(selected.type)) { setNotice('Only PDF, DOCX, and ODT files are allowed.'); return; }
    const tags = String(form.get('tags') ?? '').split(',').map((tag) => tag.trim()).filter(Boolean); const intent = await uploadIntent({ data: { filename: selected.name, mediaType: selected.type as 'application/pdf', sizeBytes: selected.size, folderId: String(form.get('folderId') || '') || null, tagNames: tags } });
    await fetch(intent.uploadUrl, { method: 'PUT', headers: { 'Content-Type': selected.type }, body: selected }); await confirm({ data: { fileId: intent.fileId } }); setNotice('Upload accepted and queued for indexing.'); await router.invalidate(); event.currentTarget.reset(); }
  async function folderSubmit(event: FormEvent) { event.preventDefault(); if (!folder.trim()) return; await addFolder({ data: { name: folder, parentId: null } }); setFolder(''); await router.invalidate(); }
  return <div className={styles.shell}><header className={styles.nav}><Link className={styles.link} to="/">← Docent</Link><span className={styles.muted}>Global file library</span></header><section className={styles.section}>{!viewer && <a className={styles.primaryButton} href="/auth/google">Sign in to browse files</a>}{viewer?.isEditor && <><form className={styles.card} onSubmit={upload}><h2>Upload document</h2><input name="file" type="file" accept=".pdf,.docx,.odt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text" required /><input name="tags" className={styles.chatInput} placeholder="tags, comma separated" /><select name="folderId"><option value="">No folder</option>{folders.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className={styles.primaryButton}>Upload</button></form><form onSubmit={folderSubmit}><input className={styles.chatInput} value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="New top-level folder" /><button className={styles.secondaryButton}>Add folder</button></form></>}{notice && <p className={styles.muted}>{notice}</p>}<div className={styles.grid}>{files.map((file) => <div className={styles.card} key={file.id}><strong>{file.filename}</strong><p className={styles.muted}>{file.mediaType.split('/').pop()} · {(file.sizeBytes / 1024).toFixed(0)} KiB · {file.status}</p><p className={styles.muted}>{file.folderName ?? 'No folder'}</p></div>)}</div></section></div>;
}
