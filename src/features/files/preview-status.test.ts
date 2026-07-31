import { describe, expect, it } from 'vitest'
import { previewRequestError, shouldRetryPreviewRequest } from './preview-status'

describe('preview request status handling', () => {
  it('retries only missing or pending previews', () => {
    expect(shouldRetryPreviewRequest(404)).toBe(true)
    expect(shouldRetryPreviewRequest(409)).toBe(true)
    expect(shouldRetryPreviewRequest(422)).toBe(false)
    expect(shouldRetryPreviewRequest(500)).toBe(false)
  })

  it('returns a conversion-specific failure message', () => {
    expect(previewRequestError(422)).toMatch(/could not be converted/i)
    expect(previewRequestError(500)).toMatch(/not available/i)
  })
})
