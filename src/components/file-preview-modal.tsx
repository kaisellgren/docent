import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getPreviewUrl } from "@/features/files/server";
import { useServerFn } from "@tanstack/react-start";
import * as styles from "@/styles/app.css";

export function FilePreviewModal({ file, onClose }: { file: { id: string; filename: string } | null; onClose: () => void }) {
  const fetchPreview = useServerFn(getPreviewUrl);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setUrl(""); setError("");
    void fetchPreview({ data: { fileId: file.id } }).then((result) => { if (!cancelled) setUrl(result.previewUrl); }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Preview unavailable."); });
    return () => { cancelled = true; };
  }, [file?.id]);
  useEffect(() => {
    if (!file) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [file, onClose]);
  if (!file) return null;
  return <div className={styles.filePreviewBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={styles.filePreviewModal} role="dialog" aria-modal="true" aria-label={`Preview ${file.filename}`}><header className={styles.filePreviewHead}><strong>{file.filename}</strong><button type="button" className={styles.detailIconButton} onClick={onClose} aria-label="Close preview"><X size={17} /></button></header>{error ? <p className={styles.filePreviewError}>{error}</p> : url ? <iframe className={styles.filePreviewFrame} src={url} title={file.filename} onError={() => setError("The preview is not available yet. Retry file indexing and try again.")} /> : <p className={styles.filePreviewLoading}>Preparing preview…</p>}</section></div>;
}
