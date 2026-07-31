import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { getPreviewUrl } from '@/features/files/server'
import { previewRequestError, shouldRetryPreviewRequest } from '@/features/files/preview-status'
import { useServerFn } from '@tanstack/react-start'
import * as styles from '@/styles/app.css'

export function FilePreviewModal({
  file,
  onClose,
}: {
  file: { id: string; filename: string; mediaType?: string } | null
  onClose: () => void
}) {
  const fetchPreview = useServerFn(getPreviewUrl)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    setAttempt(0)
  }, [file?.id])
  useEffect(() => {
    if (!file) return
    let cancelled = false
    if (attempt === 0) {
      setUrl('')
      setError('')
    }
    const load = async () => {
      try {
        const result = await fetchPreview({ data: { fileId: file.id } })
        // Server functions can resolve with a Response-like value for HTTP
        // errors. `fetch` does not reject for 404/500 responses, so inspect
        // the result before treating it as a successful preview URL lookup.
        const responseLike = result as unknown as { ok?: boolean; status?: number; previewUrl?: string }
        if (responseLike.ok === false) {
          throw Object.assign(new Error(`Preview request failed (${responseLike.status ?? 'unknown'})`), {
            status: responseLike.status,
          })
        }
        if (!responseLike.previewUrl) {
          throw Object.assign(new Error('Preview URL was not returned'), { status: 500 })
        }
        if (!cancelled) {
          setError('')
          setUrl(responseLike.previewUrl)
        }
      } catch (cause) {
        if (cancelled) return
        const responseLike = cause as { status?: number }
        if (responseLike.status === 422) {
          setError(previewRequestError(responseLike.status))
          return
        }
        if (!shouldRetryPreviewRequest(responseLike.status)) {
          setError(previewRequestError(responseLike.status))
          return
        }
        if (attempt >= 14) {
          setError('The preview is not ready yet. Retry indexing and try again.')
          return
        }
        setError('Preview is still being generated…')
        window.setTimeout(() => {
          if (!cancelled) setAttempt((current) => current + 1)
        }, 2000)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [file?.id, attempt])
  useEffect(() => {
    if (!file) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [file, onClose])
  if (!file) return null
  return (
    <div
      className={styles.filePreviewBackdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className={styles.filePreviewModal}
        role="dialog"
        aria-modal="true"
        aria-label={`Preview ${file.filename}`}
      >
        <header className={styles.filePreviewHead}>
          <strong>{file.filename}</strong>
          <button type="button" className={styles.detailIconButton} onClick={onClose} aria-label="Close preview">
            <X size={17} />
          </button>
        </header>
        {error ? (
          <p className={styles.filePreviewError}>{error}</p>
        ) : url ? (
          <iframe
            className={styles.filePreviewFrame}
            src={url}
            title={file.filename}
            sandbox=""
            referrerPolicy="no-referrer"
            onError={() => setError('The preview is not available yet. Retry file indexing and try again.')}
          />
        ) : (
          <p className={styles.filePreviewLoading}>Preparing preview…</p>
        )}
      </section>
    </div>
  )
}
