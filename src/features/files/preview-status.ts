export function shouldRetryPreviewRequest(status: number | undefined) {
  return status === 404 || status === 409
}

export function previewRequestError(status: number | undefined) {
  if (status === 422) return 'This preview could not be converted. Re-index the file to try again.'
  return 'The preview is not available. Retry indexing and try again.'
}
