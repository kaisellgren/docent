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
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const giveUpTimer = setTimeout(() => { if (!cancelled) { timedOut = true; setError("The preview is not ready yet. Retry indexing and try again."); } }, 25000);
    let attempts = 0;
    setUrl(""); setError("");
    const load = async () => {
      try {
        const result = await Promise.race([
          fetchPreview({ data: { fileId: file.id } }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Preview request timed out.")), 4000)),
        ]);
        if (!cancelled && !timedOut) { setError(""); setUrl(result.previewUrl); }
      } catch {
        if (cancelled || timedOut) return;
        attempts += 1;
        if (attempts <= 10) {
          setError("Preview is still being generated…");
          retryTimer = setTimeout(() => { void load(); }, 2000);
        } else {
          setError("The preview is not ready yet. Retry indexing and try again.");
        }
      }
    };
    void load();
    return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); clearTimeout(giveUpTimer); };
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
