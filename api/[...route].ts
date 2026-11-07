// Vercel serverless function: every /api/* request lands here.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handle } from '../server/api.js'

export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  const out = await handle({ method: req.method ?? 'GET', url: req.url ?? '/', headers: req.headers, body: req.body })
  res.statusCode = out.status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  for (const [k, v] of Object.entries(out.headers ?? {})) res.setHeader(k, v)
  res.end(JSON.stringify(out.body))
}
