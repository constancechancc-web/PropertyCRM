import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Serves /api/* from server/api.ts during `npm run dev` (Vercel does this in production). */
function localApi(): Plugin {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        try {
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const raw = Buffer.concat(chunks).toString('utf8')
          const { handle } = (await server.ssrLoadModule('/server/api.ts')) as typeof import('./server/api')
          const out = await handle({
            method: req.method ?? 'GET',
            url: '/api' + (req.url ?? '/'),
            headers: req.headers,
            body: raw ? JSON.parse(raw) : undefined,
          })
          res.statusCode = out.status
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          for (const [k, v] of Object.entries(out.headers ?? {})) res.setHeader(k, v)
          res.end(JSON.stringify(out.body))
        } catch (e) {
          console.error(e)
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'server_error' }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localApi()],
  server: { watch: { ignored: ['**/.data/**'] } },
  ssr: { external: ['@electric-sql/pglite', 'pg', 'bcryptjs'] },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 60000 },
} as never)
