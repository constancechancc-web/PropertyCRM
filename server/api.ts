// All API routes. Framework-agnostic: used by the Vercel function (api/[...route].ts)
// and by the Vite dev server (vite.config.ts).
import { checkPassword, clearCookie, COOKIE, hashPassword, makeToken, parseCookies, readToken, sessionCookie } from './auth.js'
import { getDb, type Q, type SessionUser } from './db.js'

export interface ApiRequest {
  method: string
  url: string
  headers: Record<string, string | string[] | undefined>
  body: unknown
}
export interface ApiResponse {
  status: number
  body: unknown
  headers?: Record<string, string>
}

const TABLES = ['contacts', 'listings', 'leads', 'lead_notes', 'tenancies', 'tenancy_payments'] as const
type Table = (typeof TABLES)[number]

/** Columns the app may write, per table. Anything else in a request is ignored. */
const COLUMNS: Record<Table, string[]> = {
  contacts: ['id', 'name', 'phone', 'race', 'roles', 'note', 'is_example'],
  listings: ['id', 'deal', 'address', 'type', 'price', 'built_up_sqft', 'land_sqft', 'bedrooms', 'bathrooms', 'furnishing', 'tenure', 'status', 'owner_id', 'viewing_access', 'note', 'is_example'],
  leads: ['id', 'contact_id', 'deal', 'property_types', 'areas', 'budget_min', 'budget_max', 'stage', 'next_follow_up', 'source', 'timeline', 'lost_reason', 'last_contacted_at', 'is_example'],
  lead_notes: ['id', 'lead_id', 'text', 'created_at'],
  tenancies: ['id', 'tenant_name', 'phone', 'address', 'start_date', 'end_date', 'pay_day', 'rent', 'account_holder', 'bank', 'account_number', 'is_example'],
  tenancy_payments: ['id', 'tenancy_id', 'month', 'paid'],
}

const ok = (body: unknown, headers?: Record<string, string>): ApiResponse => ({ status: 200, body, headers })
const fail = (status: number, error: string, message?: string): ApiResponse => ({ status, body: { error, message } })

class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code)
  }
}

const isTable = (t: string): t is Table => (TABLES as readonly string[]).includes(t)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function pick(table: Table, input: unknown, allowId: boolean): Record<string, unknown> {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'bad_request')
  const out: Record<string, unknown> = {}
  for (const col of COLUMNS[table]) {
    if (col === 'id' && !allowId) continue
    if (col in (input as Record<string, unknown>)) out[col] = (input as Record<string, unknown>)[col]
  }
  return out
}

let dummyHash: Promise<string> | undefined

// Small per-instance limit on failed logins.
const failures = new Map<string, { n: number; until: number }>()

async function login(req: ApiRequest, secure: boolean): Promise<ApiResponse> {
  const { email, password } = (req.body ?? {}) as { email?: string; password?: string }
  if (!email || !password) return fail(400, 'wrong_login')
  const key = email.trim().toLowerCase()
  const f = failures.get(key)
  if (f && f.n >= 8 && f.until > Date.now()) return fail(429, 'too_many', 'Too many tries. Wait a few minutes and try again.')
  const db = await getDb()
  const { rows } = await db.owner.query<{ id: string; email: string; password_hash: string }>(
    'select id, email, password_hash from app_users where lower(email) = $1',
    [key],
  )
  const user = rows[0]
  // Compare against a dummy hash for unknown emails so both cases take the same time.
  dummyHash ??= hashPassword('not-a-real-password')
  const good = await checkPassword(password, user ? user.password_hash : await dummyHash)
  if (!user || !good) {
    failures.set(key, { n: (f?.n ?? 0) + 1, until: Date.now() + 10 * 60_000 })
    return fail(401, 'wrong_login')
  }
  failures.delete(key)
  const role = await db.asUser({ id: user.id, email: user.email }, async (q) => (await q.query<{ r: string | null }>('select public.my_role() as r')).rows[0].r)
  return ok({ email: user.email, role }, { 'Set-Cookie': sessionCookie(makeToken(user.id, user.email), secure) })
}

async function withUser<T>(req: ApiRequest, fn: (q: Q, role: 'admin' | 'staff', user: SessionUser) => Promise<T>): Promise<T> {
  const cookies = parseCookies(req.headers.cookie as string | undefined)
  const t = readToken(cookies[COOKIE])
  if (!t) throw new HttpError(401, 'signed_out')
  const db = await getDb()
  const user = { id: t.uid, email: t.email }
  return db.asUser(user, async (q) => {
    const role = (await q.query<{ r: 'admin' | 'staff' | null }>('select public.my_role() as r')).rows[0].r
    if (!role) throw new HttpError(403, 'no_access')
    return fn(q, role, user)
  })
}

async function loadAll(q: Q) {
  const out: Record<string, unknown[]> = {}
  for (const t of TABLES) out[t] = (await q.query(`select * from public.${t} order by created_at`)).rows
  const cursor = (await q.query<{ c: number }>('select coalesce(max(seq), 0)::bigint as c from public.change_log')).rows[0].c
  return { ...out, cursor: Number(cursor) }
}

async function changes(q: Q, after: number) {
  // Look back a little so changes committed slightly out of order are not missed.
  const from = Math.max(0, after - 25)
  const { rows } = await q.query<{ tbl: Table; row_id: string; op: string; seq: number }>(
    `select distinct on (tbl, row_id) tbl, row_id, op, seq
       from public.change_log where seq > $1 order by tbl, row_id, seq desc limit 501`,
    [from],
  )
  if (rows.length > 500) return { reset: true }
  const cursor = rows.reduce((m, r) => Math.max(m, Number(r.seq)), after)
  const out: { table: Table; op: string; id: string; row?: unknown }[] = []
  for (const t of TABLES) {
    const ups = rows.filter((r) => r.tbl === t && r.op === 'upsert').map((r) => r.row_id)
    const found = ups.length ? (await q.query<{ id: string }>(`select * from public.${t} where id = any($1::uuid[])`, [ups])).rows : []
    for (const row of found) out.push({ table: t, op: 'upsert', id: row.id, row })
    for (const r of rows.filter((x) => x.tbl === t && (x.op === 'delete' || (x.op === 'upsert' && !found.some((f) => f.id === x.row_id)))))
      out.push({ table: t, op: 'delete', id: r.row_id })
  }
  return { cursor, changes: out }
}

async function insertRow(q: Q, table: Table, input: unknown) {
  const row = pick(table, input, true)
  const cols = Object.keys(row)
  if (!cols.length) throw new HttpError(400, 'bad_request')
  const sql = `insert into public.${table} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning *`
  return (await q.query(sql, Object.values(row))).rows[0]
}

async function updateRow(q: Q, table: Table, id: string, input: unknown) {
  const patch = pick(table, input, false)
  const cols = Object.keys(patch)
  if (!cols.length) return (await q.query(`select * from public.${table} where id = $1`, [id])).rows[0]
  const sql = `update public.${table} set ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} where id = $1 returning *`
  const r = await q.query(sql, [id, ...Object.values(patch)])
  if (!r.rows[0]) throw new HttpError(404, 'not_found')
  return r.rows[0]
}

async function deleteRow(q: Q, table: Table, id: string) {
  // RLS decides: staff deletes affect 0 rows.
  const r = await q.query(`delete from public.${table} where id = $1 returning id`, [id])
  if (r.rows.length) return { deleted: id }
  const exists = await q.query(`select 1 from public.${table} where id = $1`, [id])
  if (exists.rows.length) throw new HttpError(403, 'not_allowed', 'Only Constance can delete records.')
  return { deleted: null }
}

async function setPaid(q: Q, body: unknown) {
  const { tenancy_id, month, paid } = (body ?? {}) as { tenancy_id?: string; month?: string; paid?: boolean }
  if (!tenancy_id || !UUID.test(tenancy_id) || !month || !/^\d{4}-\d{2}-01$/.test(month)) throw new HttpError(400, 'bad_request')
  const r = await q.query(
    `insert into public.tenancy_payments (tenancy_id, month, paid) values ($1, $2, $3)
     on conflict (tenancy_id, month) do update set paid = excluded.paid returning *`,
    [tenancy_id, month, paid !== false],
  )
  return r.rows[0]
}

async function removeExamples(q: Q, role: string) {
  if (role !== 'admin') throw new HttpError(403, 'not_allowed', 'Only Constance can remove examples.')
  let n = 0
  for (const t of ['leads', 'tenancies', 'listings', 'contacts'] as const) {
    n += (await q.query(`delete from public.${t} where is_example returning id`)).rows.length
  }
  return { removed: n }
}

export async function handle(req: ApiRequest): Promise<ApiResponse> {
  const url = new URL(req.url, 'http://local')
  const path = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/'
  const parts = path.split('/').filter(Boolean)
  const method = req.method.toUpperCase()
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? ''
  const secure = proto.includes('https') || !!process.env.VERCEL

  try {
    if (path === '/login' && method === 'POST') return await login(req, secure)
    if (path === '/logout' && method === 'POST') return ok({ ok: true }, { 'Set-Cookie': clearCookie(secure) })

    if (path === '/me' && method === 'GET') {
      try {
        return ok(await withUser(req, async (_q, role, user) => ({ email: user.email, role })))
      } catch (e) {
        if (e instanceof HttpError && e.code === 'no_access') {
          return { status: 403, body: { error: 'no_access' }, headers: { 'Set-Cookie': clearCookie(secure) } }
        }
        throw e
      }
    }

    if (path === '/data' && method === 'GET') return ok(await withUser(req, (q) => loadAll(q)))
    if (path === '/changes' && method === 'GET') {
      const after = Number(url.searchParams.get('after') ?? 0) || 0
      return ok(await withUser(req, (q) => changes(q, after)))
    }
    if (path === '/payments' && method === 'POST') return ok(await withUser(req, (q) => setPaid(q, req.body)))
    if (path === '/remove-examples' && method === 'POST') return ok(await withUser(req, (q, role) => removeExamples(q, role)))

    if (parts[0] === 'rows' && parts[1]) {
      const table = parts[1]
      if (!isTable(table)) return fail(404, 'not_found')
      const id = parts[2]
      if (id && !UUID.test(id)) return fail(400, 'bad_request')
      if (!id && method === 'POST') return ok(await withUser(req, (q) => insertRow(q, table, (req.body as { row?: unknown })?.row)))
      if (id && method === 'PATCH') return ok(await withUser(req, (q) => updateRow(q, table, id, (req.body as { patch?: unknown })?.patch)))
      if (id && method === 'DELETE') return ok(await withUser(req, (q) => deleteRow(q, table, id)))
    }
    return fail(404, 'not_found')
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message)
    const err = e as { code?: string; message?: string }
    // Postgres errors: 42501 = insufficient privilege / RLS, 23xxx = constraint
    if (err.code === '42501') return fail(403, 'not_allowed', 'You do not have permission to do that.')
    if (err.code?.startsWith('23')) return fail(400, 'invalid', err.message)
    console.error(e)
    return fail(500, 'server_error')
  }
}
