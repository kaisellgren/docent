import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { getInlineFileUrl, getPreviewUrl } from '@/features/files/server'
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
  const fetchInline = useServerFn(getInlineFileUrl)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const pdfContainerRef = useRef<HTMLDivElement>(null)
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
        const result = await (file.mediaType === 'application/pdf'
          ? fetchInline({ data: { fileId: file.id } })
          : fetchPreview({ data: { fileId: file.id } }))
        // Server functions can resolve with a Response-like value for HTTP
        // errors. `fetch` does not reject for 404/500 responses, so inspect
        // the result before treating it as a successful preview URL lookup.
        const responseLike = result as unknown as { ok?: boolean; status?: number; previewUrl?: string }
        if (responseLike.ok === false) {
          throw new Error(`Preview request failed (${responseLike.status ?? 'unknown'})`)
        }
        if (!responseLike.previewUrl) {
          throw new Error('Preview URL was not returned')
        }
        if (!cancelled) {
          setError('')
          setUrl(responseLike.previewUrl)
        }
      } catch {
        if (cancelled) return
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
  }, [file?.id, file?.mediaType, attempt])
  useEffect(() => {
    if (!file || file.mediaType !== 'application/pdf' || !url || !pdfContainerRef.current) return
    let cancelled = false
    void import('pdfjs-dist/legacy/build/pdf.mjs')
      .then(async (pdfjs) => {
        const document = await pdfjs.getDocument(url).promise
        if (cancelled || !pdfContainerRef.current) return
        pdfContainerRef.current.replaceChildren()
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          const page = await document.getPage(pageNumber)
          const viewport = page.getViewport({ scale: 1.35 })
          const canvas = window.document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.className = styles.filePreviewPdfPage
          pdfContainerRef.current.appendChild(canvas)
          await page.render({ canvasContext: canvas.getContext('2d')!, canvas, viewport }).promise
        }
      })
      .catch(() => {
        if (!cancelled) setError('The PDF could not be rendered.')
      })
    return () => {
      cancelled = true
    }
  }, [file?.id, file?.mediaType, url])
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
          file.mediaType === 'application/pdf' ? (
            <div className={styles.filePreviewPdf} ref={pdfContainerRef} />
          ) : (
            <iframe
              className={styles.filePreviewFrame}
              src={url}
              title={file.filename}
              onError={() => setError('The preview is not available yet. Retry file indexing and try again.')}
            />
          )
        ) : (
          <p className={styles.filePreviewLoading}>Preparing preview…</p>
        )}
      </section>
    </div>
  )
}
