import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildPreviewCommand, inlineHtmlAssets, sanitizePreviewHtml, withPreviewTempDirectory } from './preview'

describe('file previews', () => {
  it('uses Poppler single-file options for PDFs and LibreOffice HTML export for ODT files', () => {
    expect(buildPreviewCommand('application/pdf', '/tmp/source.pdf', '/tmp/output')).toEqual({
      command: 'pdftohtml',
      args: ['-c', '-s', '-dataurls', '-noframes', '/tmp/source.pdf', '/tmp/output/preview.html'],
    })
    expect(buildPreviewCommand('application/vnd.oasis.opendocument.text', '/tmp/source.odt', '/tmp/output')).toEqual({
      command: 'soffice',
      args: ['--headless', '--convert-to', 'html', '--outdir', '/tmp/output', '/tmp/source.odt'],
    })
  })

  it('inlines converter styles and images, and removes unsafe content', async () => {
    await withPreviewTempDirectory(async (directory) => {
      await fs.writeFile(join(directory, 'preview.css'), '.hero { background: url("image.png") }')
      await fs.writeFile(join(directory, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      const inlined = await inlineHtmlAssets(
        '<link rel="stylesheet" href="preview.css"><img src="image.png" onerror="alert(1)"><script>alert(1)</script>',
        directory,
      )
      const sanitized = sanitizePreviewHtml(inlined)
      expect(sanitized).toContain('data:image/png;base64,iVBORw==')
      expect(sanitized).not.toContain('preview.css')
      expect(sanitized).not.toContain('image.png')
      expect(sanitized).not.toContain('<script')
      expect(sanitized).not.toContain('onerror=')
    })
  })

  it('removes its isolated temporary directory after an unsuccessful conversion', async () => {
    let directory = ''
    await expect(
      withPreviewTempDirectory(async (temporaryDirectory) => {
        directory = temporaryDirectory
        await fs.writeFile(join(directory, 'partial.html'), 'partial output')
        throw new Error('converter failed')
      }),
    ).rejects.toThrow('converter failed')
    await expect(fs.access(directory)).rejects.toThrow()
  })
})
