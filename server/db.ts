// Database access. Production: any PostgreSQL via DATABASE_URL (Vercel Postgres / Neon, etc.).
// Local development without DATABASE_URL: PGlite (real Postgres in-process), stored in .data/pglite.
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type Params = unknown[]
export interface Q {
  query<T = Record<string, unknown>>(sql: string, params?: Params): Promise<{ rows: T[]; rowCount: number }>
}

export interface SessionUser {
  id: string
  email: string
}

interface Driver {
  /** Runs as the database owner (login lookups, scripts). */
  owner: Q
  /** Runs fn in one transaction as the limited role crm_app, with RLS applied for this user. */
  asUser<T>(user: SessionUser, fn: (q: Q) => Promise<T>): Promise<T>
  exec(sql: string): Promise<void>
}

const DATE_OID = 1082
const NUMERIC_OID = 1700
const INT8_OID = 20

async function pgDriver(url: string): Promise<Driver> {
  const pg = (await import('pg')).default
  pg.types.setTypeParser(DATE_OID, (v: string) => v)
  pg.types.setTypeParser(NUMERIC_OID, (v: string) => (v == null ? null : parseFloat(v)))
  pg.types.setTypeParser(INT8_OID, (v: string) => (v == null ? null : Number(v)))
  const local = /localhost|127\.0\.0\.1/.test(url)
  const pool = new pg.Pool({
    connectionString: url,
    max: 3,
    idleTimeoutMillis: 10_000,
    ssl: local || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: false },
  })
  const wrap = (c: { query: (s: string, p?: Params) => Promise<{ rows: unknown[]; rowCount: number | null }> }): Q => ({
    async query(sql, params) {
      const r = await c.query(sql, params)
      return { rows: r.rows as never[], rowCount: r.rowCount ?? 0 }
    },
  })
  return {
    owner: wrap(pool),
    async exec(sql) {
      await pool.query(sql)
    },
    async asUser(user, fn) {
      const client = await pool.connect()
      try {
        await client.query('begin')
        await client.query('set local role crm_app')
        await client.query(`select set_config('app.email', $1, true), set_config('app.user_id', $2, true)`, [user.email, user.id])
        const out = await fn(wrap(client))
        await client.query('commit')
        return out
      } catch (e) {
        await client.query('rollback').catch(() => {})
        throw e
      } finally {
        client.release()
      }
    },
  }
}

async function pgliteDriver(dir: string): Promise<Driver> {
  const { PGlite } = await import('@electric-sql/pglite')
  if (!dir.startsWith('memory://')) mkdirSync(dir, { recursive: true })
  const parsers = { [DATE_OID]: (v: string) => v, [NUMERIC_OID]: (v: string) => parseFloat(v), [INT8_OID]: (v: string) => Number(v) }
  const db = await PGlite.create(dir, { parsers })
  const wrap = (c: { query: (s: string, p?: Params) => Promise<{ rows: unknown[]; affectedRows?: number }> }): Q => ({
    async query(sql, params) {
      const r = await c.query(sql, params)
      return { rows: r.rows as never[], rowCount: r.affectedRows ?? r.rows.length }
    },
  })
  return {
    owner: wrap(db),
    async exec(sql) {
      await db.exec(sql)
    },
    async asUser(user, fn) {
      return db.transaction(async (tx) => {
        await tx.query('set local role crm_app')
        await tx.query(`select set_config('app.email', $1, true), set_config('app.user_id', $2, true)`, [user.email, user.id])
        return fn(wrap(tx))
      })
    },
  }
}

export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined
}

export function readSql(name: string): string {
  return readFileSync(join(process.cwd(), 'db', name), 'utf8')
}

// Kept on globalThis so a dev-server hot reload never opens the local database twice.
const g = globalThis as { __crmDriver?: Promise<Driver> | null }
let driverPromise: Promise<Driver> | null = g.__crmDriver ?? null

export function getDb(): Promise<Driver> {
  if (!driverPromise) {
    const url = databaseUrl()
    driverPromise = (async () => {
      if (url) return pgDriver(url)
      if (process.env.VERCEL) throw new Error('DATABASE_URL is not set')
      const d = await pgliteDriver(process.env.PGLITE_DIR || join(process.cwd(), '.data', 'pglite'))
      await setupLocal(d)
      return d
    })()
    driverPromise.catch(() => (driverPromise = g.__crmDriver = null))
    if (!url) g.__crmDriver = driverPromise
  }
  return driverPromise
}

/** For tests: use a specific driver (e.g. an in-memory PGlite). */
export async function useMemoryDb(): Promise<Driver> {
  const d = await pgliteDriver('memory://')
  await d.exec(readSql('schema.sql'))
  driverPromise = Promise.resolve(d)
  return d
}

/** Local PGlite: create the schema, the dev users and the example data on first run. */
async function setupLocal(d: Driver) {
  await d.exec(readSql('schema.sql'))
  const { rows } = await d.owner.query<{ n: number }>('select count(*)::int as n from app_users')
  if (rows[0].n > 0) return
  const { hashPassword } = await import('./auth.js')
  const password = process.env.DEV_USER_PASSWORD || 'crm-local-dev'
  const hash = await hashPassword(password)
  const users: [string, 'admin' | 'staff' | null][] = [
    ['constance@example.com', 'admin'],
    ['assistant@example.com', 'staff'],
    ['outsider@example.com', null],
  ]
  for (const [email, role] of users) {
    await d.owner.query('insert into app_users (email, password_hash) values ($1, $2) on conflict do nothing', [email, hash])
    if (role) await d.owner.query('insert into app_roles (email, role) values ($1, $2) on conflict do nothing', [email, role])
  }
  await d.exec(readSql('seed_examples.sql'))
  console.log(`\n  Local database ready (.data/pglite). Dev users: ${users.map((u) => u[0]).join(', ')}\n`)
}
