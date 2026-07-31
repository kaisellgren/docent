import * as styles from '@/styles/app.css'

export type IngestionStatusValue = 'pending' | 'processing' | 'ready' | 'failed'

export function IngestionStatus({
  status,
  error,
  onRetry,
}: {
  status: IngestionStatusValue | null
  error?: string | null
  onRetry?: (() => void) | undefined
}) {
  if (!status) return null
  const statusClass = {
    pending: styles.ingestionStatusPending,
    processing: styles.ingestionStatusProcessing,
    ready: styles.ingestionStatusReady,
    failed: styles.ingestionStatusFailed,
  }[status]
  return (
    <span className={`${styles.ingestionStatus} ${statusClass}`} title={error ?? undefined}>
      <span>{status === 'processing' ? 'Indexing' : status === 'ready' ? 'Indexed' : status}</span>
      {status === 'failed' && onRetry && (
        <button type="button" onClick={onRetry} aria-label="Retry indexing">
          Retry
        </button>
      )}
    </span>
  )
}
