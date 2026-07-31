import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { dirname, extname, normalize, resolve } from 'node:path'
import app from './dist/server/server.js'

const root = dirname(fileURLToPath(import.meta.url))
const clientDirectory = resolve(root, 'dist/client')
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

function staticFile(pathname) {
  const filename = resolve(clientDirectory, `.${normalize(pathname)}`)
  return filename.startsWith(`${clientDirectory}/`) ? filename : undefined
}

async function serveStatic(pathname, response) {
  const filename = staticFile(pathname)
  if (!filename) return false
  try {
    const file = await stat(filename)
    if (!file.isFile()) return false
    response.statusCode = 200
    response.setHeader('Content-Type', contentTypes[extname(filename)] ?? 'application/octet-stream')
    createReadStream(filename).pipe(response)
    return true
  } catch {
    return false
  }
}

function requestFromNode(request) {
  const origin = `http://${request.headers.host ?? 'localhost'}`
  const url = new URL(request.url ?? '/', origin)
  const method = request.method ?? 'GET'
  return new Request(url, {
    method,
    headers: request.headers,
    ...(method === 'GET' || method === 'HEAD' ? {} : { body: Readable.toWeb(request), duplex: 'half' }),
  })
}

async function sendResponse(response, nodeResponse) {
  const cookies = response.headers.getSetCookie?.() ?? []
  for (const [name, value] of response.headers) if (name !== 'set-cookie') nodeResponse.setHeader(name, value)
  if (cookies.length) nodeResponse.setHeader('Set-Cookie', cookies)
  nodeResponse.statusCode = response.status
  if (!response.body) return nodeResponse.end()
  Readable.fromWeb(response.body).pipe(nodeResponse)
}

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`).pathname
    if ((request.method === 'GET' || request.method === 'HEAD') && (await serveStatic(pathname, response))) return
    await sendResponse(await app.fetch(requestFromNode(request)), response)
  } catch (error) {
    console.error(error)
    response.statusCode = 500
    response.end('Internal Server Error')
  }
})

const port = Number(process.env.PORT ?? 3000)
server.listen(port, '0.0.0.0', () => console.log(`Docent listening on port ${port}`))
