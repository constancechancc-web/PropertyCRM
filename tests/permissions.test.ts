// Acceptance: permissions are enforced by Postgres Row Level Security, not only the UI.
// Runs the real schema in an in-memory Postgres (PGlite) and calls the real API handler.
import { beforeAll, describe, expect, it } from 'vitest'
import { handle, type ApiResponse } from '../server/api'
import { hashPassword } from '../server/auth'
import { useMemoryDb } from '../server/db'

type Db = Awaited<ReturnType<typeof useMemoryDb>>
let db: Db
const ids: Record<string, string> = {}
const PW = 'test-password-123'

async function call(method: string, url: string, body?: unknown, cookie?: string): Promise<ApiResponse> {
  return handle({ method, url, headers: cookie ? { cookie } : {}, body })
}

async function signIn(email: string): Promise<string> {
  const r = await call('POST', '/api/login', { email, password: PW })
  expect(r.status).toBe(200)
  return r.headers!['Set-Cookie'].split(';')[0]
}

beforeAll(async () => {
  db = await useMemoryDb()
  const hash = await hashPassword(PW)
  for (const [email, role] of [['boss@test.local', 'admin'], ['helper@test.local', 'staff'], ['stranger@test.local', null]] as const) {
    const r = await db.owner.query<{ id: string }>('insert into app_users (email, password_hash) values ($1, $2) returning id', [email, hash])
    ids[email] = r.rows[0].id
    if (role) await db.owner.query('insert into app_roles (email, role) values ($1, $2)', [email, role])
  }
})

describe('permissions', () => {
  it('wrong password is refused', async () => {
    const r = await call('POST', '/api/login', { email: 'boss@test.local', password: 'nope' })
    expect(r.status).toBe(401)
  })

  it('a signed-in user who is not in app_roles sees nothing', async () => {
    const r = await call('POST', '/api/login', { email: 'stranger@test.local', password: PW })
    expect((r.body as { role: unknown }).role).toBeNull()
    const cookie = r.headers!['Set-Cookie'].split(';')[0]
    const me = await call('GET', '/api/me', undefined, cookie)
    expect(me.status).toBe(403)
    expect((me.body as { error: string }).error).toBe('no_access')
    expect((await call('GET', '/api/data', undefined, cookie)).status).toBe(403)
    // Even directly in the database, RLS returns no rows for them.
    await db.owner.query(`insert into contacts (name) values ('Hidden')`)
    const rows = await db.asUser({ id: ids['stranger@test.local'], email: 'stranger@test.local' }, (q) => q.query('select * from contacts'))
    expect(rows.rows).toHaveLength(0)
  })

  it('staff can add and edit but a direct delete is refused by RLS', async () => {
    const cookie = await signIn('helper@test.local')
    const me = await call('GET', '/api/me', undefined, cookie)
    expect((me.body as { role: string }).role).toBe('staff')

    const add = await call('POST', '/api/rows/contacts', { row: { name: 'Staff Added', phone: '012-1112222' } }, cookie)
    expect(add.status).toBe(200)
    const id = (add.body as { id: string }).id

    const edit = await call('PATCH', `/api/rows/contacts/${id}`, { patch: { note: 'edited' } }, cookie)
    expect((edit.body as { note: string }).note).toBe('edited')

    const del = await call('DELETE', `/api/rows/contacts/${id}`, undefined, cookie)
    expect(del.status).toBe(403)

    // Bypass the API entirely: a raw DELETE as the staff user removes nothing.
    const raw = await db.asUser({ id: ids['helper@test.local'], email: 'helper@test.local' }, (q) => q.query('delete from contacts returning id'))
    expect(raw.rows).toHaveLength(0)
    const still = await db.owner.query('select 1 from contacts where id = $1', [id])
    expect(still.rows).toHaveLength(1)

    expect((await call('POST', '/api/remove-examples', {}, cookie)).status).toBe(403)
  })

  it('admin can delete', async () => {
    const cookie = await signIn('boss@test.local')
    const add = await call('POST', '/api/rows/contacts', { row: { name: 'To Delete' } }, cookie)
    const id = (add.body as { id: string }).id
    const del = await call('DELETE', `/api/rows/contacts/${id}`, undefined, cookie)
    expect(del.status).toBe(200)
    expect((del.body as { deleted: string }).deleted).toBe(id)
  })

  it('staff can undo a paid month without deleting', async () => {
    const cookie = await signIn('helper@test.local')
    const t = await call('POST', '/api/rows/tenancies', { row: { tenant_name: 'T', pay_day: 5 } }, cookie)
    const tid = (t.body as { id: string }).id
    const paid = await call('POST', '/api/payments', { tenancy_id: tid, month: '2026-11-01', paid: true }, cookie)
    expect((paid.body as { paid: boolean }).paid).toBe(true)
    const undo = await call('POST', '/api/payments', { tenancy_id: tid, month: '2026-11-01', paid: false }, cookie)
    expect((undo.body as { paid: boolean }).paid).toBe(false)
  })

  it("one user's edits reach the other through the change feed", async () => {
    const a = await signIn('boss@test.local')
    const b = await signIn('helper@test.local')
    const start = (await call('GET', '/api/data', undefined, b)).body as { cursor: number }
    const add = await call('POST', '/api/rows/leads', { row: { deal: 'rent', stage: 'New' } }, a)
    const id = (add.body as { id: string }).id
    const feed = (await call('GET', `/api/changes?after=${start.cursor}`, undefined, b)).body as {
      changes: { table: string; op: string; id: string }[]
    }
    expect(feed.changes.some((c) => c.table === 'leads' && c.id === id && c.op === 'upsert')).toBe(true)
    await call('DELETE', `/api/rows/leads/${id}`, undefined, a)
    const feed2 = (await call('GET', `/api/changes?after=${start.cursor}`, undefined, b)).body as typeof feed
    expect(feed2.changes.some((c) => c.id === id && c.op === 'delete')).toBe(true)
  })

  it('changing a password signs out sessions made with the old one', async () => {
    const old = await signIn('helper@test.local')
    expect((await call('GET', '/api/me', undefined, old)).status).toBe(200)
    // what `npm run user:add` does when a password changes (one second later, as in real life)
    await db.owner.query("update app_users set password_changed_at = now() + interval '1 second' where email = 'helper@test.local'")
    const after = await call('GET', '/api/me', undefined, old)
    expect(after.status).toBe(401)
    await db.owner.query("update app_users set password_changed_at = now() - interval '1 second' where email = 'helper@test.local'")
  })

  it('sales deals are admin only, enforced by the database', async () => {
    const admin = await signIn('boss@test.local')
    const staff = await signIn('helper@test.local')
    const before = ((await call('GET', '/api/data', undefined, staff)).body as { cursor: number }).cursor
    const add = await call('POST', '/api/rows/deals', { row: { deal: 'sale', commission: 12000 } }, admin)
    expect(add.status).toBe(200)
    const id = (add.body as { id: string }).id
    const staffData = (await call('GET', '/api/data', undefined, staff)).body as { deals: unknown[] }
    expect(staffData.deals).toHaveLength(0)
    const adminData = (await call('GET', '/api/data', undefined, admin)).body as { deals: { id: string }[] }
    expect(adminData.deals.map((d) => d.id)).toContain(id)
    expect((await call('POST', '/api/rows/deals', { row: { deal: 'rent' } }, staff)).status).toBe(403)
    expect((await call('PATCH', '/api/rows/deals/' + id, { patch: { commission: 1 } }, staff)).status).toBe(404)
    const feed = (await call('GET', '/api/changes?after=' + before, undefined, staff)).body as { changes: { table: string }[] }
    expect(feed.changes.some((c) => c.table === 'deals')).toBe(false)
  })
})
