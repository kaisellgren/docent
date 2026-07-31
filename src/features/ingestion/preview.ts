import { execFile as execFileCallback } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import mammoth from 'mammoth'

const execFile = promisify(execFileCallback)

export const PREVIEW_CONVERSION_TIMEOUT_MS = 30_000
export const PREVIEW_SIZE_LIMIT_BYTES = 10 * 1024 * 1024

type PreviewMediaType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/vnd.oasis.opendocument.text'

type Command = { command: string; args: string[] }
type CommandRunner = (command: string, args: string[]) => Promise<void>

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isSafeLocalPath(directory: string, candidate: string) {
  const path = resolve(directory, candidate)
  const pathRelative = relative(directory, path)
  return pathRelative !== '' && !pathRelative.startsWith('..') && !pathRelative.includes(`..${String.fromCharCode(47)}`)
}

function mediaTypeForPath(path: string) {
  switch (extname(path).toLowerCase()) {
    case '.css':
      return 'text/css'
    case '.gif':
      return 'image/gif'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.svg':
      return 'image/svg+xml'
    case '.webp':
      return 'image/webp'
    case '.woff':
      return 'font/woff'
    case '.woff2':
      return 'font/woff2'
    default:
      return 'application/octet-stream'
  }
}

function localPath(reference: string, directory: string) {
  const value = reference.trim()
  if (!value || value.startsWith('#') || /^data:/i.test(value)) return undefined
  if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//')) return undefined
  const pathname = value.split(/[?#]/, 1)[0]
  if (!pathname || !isSafeLocalPath(directory, pathname)) return undefined
  return resolve(directory, pathname)
}

async function dataUri(reference: string, directory: string) {
  const path = localPath(reference, directory)
  if (!path) return undefined
  try {
    const contents = await fs.readFile(path)
    return `data:${mediaTypeForPath(path)};base64,${contents.toString('base64')}`
  } catch {
    return undefined
  }
}

async function inlineCssAssets(css: string, directory: string) {
  const withoutImports = css.replace(/@import\s+(?:url\(\s*)?(?:["'][^"']+["']|[^;)\s]+)\s*\)?\s*;/gi, '')
  const matches = [...withoutImports.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)]
  let result = withoutImports
  for (const match of matches) {
    const reference = match[2] ?? ''
    if (/^data:/i.test(reference)) continue
    const replacement = await dataUri(reference, directory)
    result = result.replace(match[0], replacement ? `url("${replacement}")` : 'none')
  }
  return result
}

/** Makes LibreOffice's directory-based HTML export safe to store as one object. */
export async function inlineHtmlAssets(html: string, directory: string) {
  let result = html
  const stylesheets = [...result.matchAll(/<link\b([^>]*\brel\s*=\s*["']?stylesheet["']?[^>]*)>/gi)]
  for (const stylesheet of stylesheets) {
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(stylesheet[1] ?? '')
    const path = href && localPath(href[1] ?? href[2] ?? href[3] ?? '', directory)
    let replacement = ''
    if (path) {
      try {
        replacement = `<style>${await inlineCssAssets(await fs.readFile(path, 'utf8'), directory)}</style>`
      } catch {
        // A missing converter asset should not leave a network reference behind.
      }
    }
    result = result.replace(stylesheet[0], replacement)
  }
  const inlineStyles = [...result.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
  for (const style of inlineStyles)
    result = result.replace(style[0], `<style>${await inlineCssAssets(style[1] ?? '', directory)}</style>`)

  const references = [...result.matchAll(/\b(src|background)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)]
  for (const reference of references) {
    const value = reference[2] ?? reference[3] ?? reference[4] ?? ''
    const replacement = await dataUri(value, directory)
    if (replacement) result = result.replace(reference[0], `${reference[1]}="${replacement}"`)
    else if (!/^data:/i.test(value)) result = result.replace(reference[0], '')
  }
  return result
}

/** Removes executable and network-loaded content while retaining converter markup and styles. */
export function sanitizePreviewHtml(html: string) {
  return html
    .replace(/<\/?(?:script|iframe|object|embed|base)\b[^>]*>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(
      /\s(?:src|background)\s*=\s*(?:"(?:https?:|\/\/)[^"]*"|'(?:https?:|\/\/)[^']*'|(?:https?:|\/\/)[^\s>]+)/gi,
      '',
    )
    .replace(
      /\s(?:href|action)\s*=\s*(?:"(?:https?:|\/\/)[^"]*"|'(?:https?:|\/\/)[^']*'|(?:https?:|\/\/)[^\s>]+)/gi,
      '',
    )
}

export function previewDocument(title: string, body: string) {
  const safeBody = sanitizePreviewHtml(body)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;padding:2rem 2.5rem;background:#fff;color:#20252b;font:16px/1.65 Inter,system-ui,sans-serif}main{max-width:56rem;margin:0 auto}h1{font-size:1.6rem;line-height:1.25;border-bottom:1px solid #d9e0e7;padding-bottom:1rem;margin:0 0 2rem}p{margin:0 0 1rem;white-space:pre-wrap}ul,ol{padding-left:1.5rem}img{max-width:100%}</style></head><body><main><h1>${escapeHtml(title)}</h1>${safeBody}</main></body></html>`
}

export function buildPreviewCommand(
  mediaType: Exclude<PreviewMediaType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'>,
  sourcePath: string,
  outputDirectory: string,
): Command {
  if (mediaType === 'application/pdf')
    return {
      command: 'pdftohtml',
      args: ['-c', '-s', '-dataurls', '-noframes', sourcePath, join(outputDirectory, 'preview.html')],
    }
  return { command: 'soffice', args: ['--headless', '--convert-to', 'html', '--outdir', outputDirectory, sourcePath] }
}

async function runCommand(command: string, args: string[]) {
  await execFile(command, args, {
    timeout: PREVIEW_CONVERSION_TIMEOUT_MS,
    maxBuffer: PREVIEW_SIZE_LIMIT_BYTES,
    windowsHide: true,
  })
}

export async function withPreviewTempDirectory<T>(operation: (directory: string) => Promise<T>) {
  const directory = await fs.mkdtemp(join(tmpdir(), 'docent-preview-'))
  try {
    return await operation(directory)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

function extensionFor(mediaType: PreviewMediaType) {
  if (mediaType === 'application/pdf') return '.pdf'
  if (mediaType === 'application/vnd.oasis.opendocument.text') return '.odt'
  return '.docx'
}

function assertPreviewSize(html: string) {
  if (Buffer.byteLength(html, 'utf8') > PREVIEW_SIZE_LIMIT_BYTES)
    throw new Error(`Preview exceeds the ${Math.floor(PREVIEW_SIZE_LIMIT_BYTES / 1024 / 1024)} MB size limit`)
  return html
}

export async function generateFilePreview(
  file: { filename: string; mediaType: PreviewMediaType; bytes: Buffer },
  options: { runCommand?: CommandRunner } = {},
) {
  if (file.mediaType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const rendered = await mammoth.convertToHtml({ buffer: file.bytes })
    return assertPreviewSize(previewDocument(file.filename, rendered.value))
  }
  const runner = options.runCommand ?? runCommand
  return withPreviewTempDirectory(async (directory) => {
    const sourcePath = join(directory, `source-${randomUUID()}${extensionFor(file.mediaType)}`)
    await fs.writeFile(sourcePath, file.bytes)
    const command = buildPreviewCommand(
      file.mediaType === 'application/pdf' ? 'application/pdf' : 'application/vnd.oasis.opendocument.text',
      sourcePath,
      directory,
    )
    await runner(command.command, command.args)
    const outputPath =
      file.mediaType === 'application/pdf'
        ? join(directory, 'preview.html')
        : join(directory, `${basename(sourcePath, extname(sourcePath))}.html`)
    const html = await fs.readFile(outputPath, 'utf8')
    return assertPreviewSize(sanitizePreviewHtml(await inlineHtmlAssets(html, directory)))
  })
}
