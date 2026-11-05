// Servidor local de fixtures para probar CORS. No forma parte del backend/producto.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const fixtureDirectory = new URL('../public/panoramas/', import.meta.url)
const port = Number(process.env.DEMO_MEDIA_PORT || 5175)

createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname
  const match = /^\/(no-cors\/)?panoramas\/(atrio|sala)-(2048|4096)\.png$/.exec(pathname)
  if (!match) { response.writeHead(404); response.end(); return }
  try {
    const filename = `${match[2]}-${match[3]}.png`
    const data = await readFile(new URL(filename, fixtureDirectory))
    if (!match[1]) response.setHeader('Access-Control-Allow-Origin', '*')
    response.writeHead(200, {
      'Content-Type': 'image/png', 'Content-Length': data.length,
      'Cache-Control': 'public, max-age=3600',
    })
    response.end(data)
  } catch {
    response.writeHead(404); response.end()
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Fixtures: http://127.0.0.1:${port}/panoramas/ (${fileURLToPath(fixtureDirectory)})`)
})
