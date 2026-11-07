import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, ApiError } from '../lib/api'
import { newId, nowISO, todayISO } from '../lib/format'
import { isOpen, matches } from '../lib/logic'
import { TABLES, type DB, type Lead, type Listing, type RowOf, type TableName } from '../lib/types'
import { NO_ACCESS, useAuth } from './auth'
import { SAVE_FAILED, useToast } from '../components/Toast'

const EMPTY: DB = { contacts: [], listings: [], leads: [], lead_notes: [], tenancies: [], tenancy_payments: [], deals: [] }
const POLL_MS = 3000

interface Store {
  db: DB
  ready: boolean
  loadError: boolean
  today: string
  insert<T extends TableName>(table: T, row: Partial<RowOf<T>>): Promise<RowOf<T> | null>
  update<T extends TableName>(table: T, id: string, patch: Partial<RowOf<T>>): Promise<boolean>
  remove(table: TableName, id: string): Promise<boolean>
  setPaid(tenancyId: string, month: string, paid: boolean): Promise<boolean>
  removeExamples(): Promise<boolean>
  reload(): Promise<void>
}

const Ctx = createContext<Store | null>(null)

type Change = { table: TableName; op: 'upsert' | 'delete'; id: string; row?: unknown }

function upsert<T extends { id: string }>(list: T[], row: T): T[] {
  const i = list.findIndex((r) => r.id === row.id)
  if (i < 0) return [...list, row]
  const copy = list.slice()
  copy[i] = row
  return copy
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { signOut } = useAuth()
  const toast = useToast()
  const [db, setDb] = useState<DB>(EMPTY)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [today, setToday] = useState(todayISO())
  const cursor = useRef(0)
  const pending = useRef(0) // optimistic writes in flight; pause applying polls meanwhile

  const handleAuthError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.code === 'no_access') {
        signOut(NO_ACCESS)
        return true
      }
      if (e instanceof ApiError && e.code === 'signed_out') {
        signOut()
        return true
      }
      return false
    },
    [signOut],
  )

  const reload = useCallback(async () => {
    try {
      const data = await api<DB & { cursor: number }>('GET', '/data')
      cursor.current = data.cursor
      const next = { ...EMPTY }
      for (const t of TABLES) (next as Record<string, unknown>)[t] = data[t] ?? []
      setDb(next)
      setReady(true)
      setLoadError(false)
    } catch (e) {
      if (!handleAuthError(e)) setLoadError(true)
    }
  }, [handleAuthError])

  const poll = useCallback(async () => {
    if (pending.current > 0) return
    try {
      const r = await api<{ cursor?: number; changes?: Change[]; reset?: boolean }>('GET', `/changes?after=${cursor.current}`)
      if (r.reset) return reload()
      if (pending.current > 0) return
      if (r.cursor != null) cursor.current = r.cursor
      if (!r.changes?.length) return
      setDb((prev) => {
        const next = { ...prev }
        for (const c of r.changes!) {
          const list = next[c.table] as { id: string }[]
          ;(next as Record<string, unknown>)[c.table] =
            c.op === 'delete' ? list.filter((x) => x.id !== c.id) : upsert(list, c.row as { id: string })
        }
        return next
      })
    } catch (e) {
      handleAuthError(e)
    }
  }, [handleAuthError, reload])

  useEffect(() => {
    reload()
  }, [reload])

  // Pick up the other user's edits within a few seconds.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') poll()
      setToday(todayISO())
    }
    const id = setInterval(tick, POLL_MS)
    const onVis = () => document.visibilityState === 'visible' && tick()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
    }
  }, [poll])

  const fail = useCallback(
    (e: unknown) => {
      if (handleAuthError(e)) return
      if (e instanceof ApiError && e.code === 'not_allowed') toast(e.message || 'Only Constance can do that.', 'error')
      else toast(SAVE_FAILED, 'error')
    },
    [handleAuthError, toast],
  )

  const withPending = useCallback(async <R,>(fn: () => Promise<R>): Promise<R> => {
    pending.current++
    try {
      return await fn()
    } finally {
      pending.current--
    }
  }, [])

  const insert = useCallback(
    async <T extends TableName>(table: T, row: Partial<RowOf<T>>): Promise<RowOf<T> | null> => {
      const now = nowISO()
      const full = { id: newId(), created_at: now, updated_at: now, ...row } as RowOf<T>
      setDb((p) => ({ ...p, [table]: upsert(p[table] as { id: string }[], full) }))
      return withPending(async () => {
        try {
          const { id: _id, created_at, updated_at, ...rest } = full as unknown as Record<string, unknown>
          void _id
          void updated_at
          const body = table === 'lead_notes' ? { ...rest, id: full.id, created_at } : { ...rest, id: full.id }
          const saved = await api<RowOf<T>>('POST', `/rows/${table}`, { row: body })
          setDb((p) => ({ ...p, [table]: upsert(p[table] as { id: string }[], saved) }))
          return saved
        } catch (e) {
          setDb((p) => ({ ...p, [table]: (p[table] as { id: string }[]).filter((r) => r.id !== full.id) }))
          fail(e)
          return null
        }
      })
    },
    [fail, withPending],
  )

  const update = useCallback(
    async <T extends TableName>(table: T, id: string, patch: Partial<RowOf<T>>): Promise<boolean> => {
      let before: RowOf<T> | undefined
      setDb((p) => {
        const list = p[table] as RowOf<T>[]
        before = list.find((r) => r.id === id)
        if (!before) return p
        return { ...p, [table]: upsert(list as { id: string }[], { ...before, ...patch }) }
      })
      return withPending(async () => {
        try {
          const saved = await api<RowOf<T>>('PATCH', `/rows/${table}/${id}`, { patch })
          setDb((p) => ({ ...p, [table]: upsert(p[table] as { id: string }[], saved) }))
          return true
        } catch (e) {
          if (before) setDb((p) => ({ ...p, [table]: upsert(p[table] as { id: string }[], before!) }))
          fail(e)
          return false
        }
      })
    },
    [fail, withPending],
  )

  const remove = useCallback(
    async (table: TableName, id: string) => {
      return withPending(async () => {
        try {
          await api('DELETE', `/rows/${table}/${id}`)
          await reload() // cascades and "set null" links
          return true
        } catch (e) {
          fail(e)
          return false
        }
      })
    },
    [fail, reload, withPending],
  )

  const setPaid = useCallback(
    async (tenancyId: string, month: string, paid: boolean) => {
      let before: RowOf<'tenancy_payments'> | undefined
      setDb((p) => {
        before = p.tenancy_payments.find((x) => x.tenancy_id === tenancyId && x.month === month)
        const now = nowISO()
        const row = before ? { ...before, paid } : { id: newId(), created_at: now, updated_at: now, tenancy_id: tenancyId, month, paid }
        return { ...p, tenancy_payments: upsert(p.tenancy_payments, row) }
      })
      return withPending(async () => {
        try {
          const saved = await api<RowOf<'tenancy_payments'>>('POST', '/payments', { tenancy_id: tenancyId, month, paid })
          setDb((p) => ({
            ...p,
            tenancy_payments: upsert(
              p.tenancy_payments.filter((x) => !(x.tenancy_id === tenancyId && x.month === month && x.id !== saved.id)),
              saved,
            ),
          }))
          return true
        } catch (e) {
          setDb((p) => ({
            ...p,
            tenancy_payments: before
              ? upsert(p.tenancy_payments, before)
              : p.tenancy_payments.filter((x) => !(x.tenancy_id === tenancyId && x.month === month)),
          }))
          fail(e)
          return false
        }
      })
    },
    [fail, withPending],
  )

  const removeExamples = useCallback(async () => {
    try {
      await api('POST', '/remove-examples', {})
      await reload()
      return true
    } catch (e) {
      fail(e)
      return false
    }
  }, [fail, reload])

  const value = useMemo(
    () => ({ db, ready, loadError, today, insert, update, remove, setPaid, removeExamples, reload }),
    [db, ready, loadError, today, insert, update, remove, setPaid, removeExamples, reload],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const c = useContext(Ctx)
  if (!c) throw new Error('useStore outside DataProvider')
  return c
}

/** Matching lookups between open leads and available listings. */
export function useMatches() {
  const { db } = useStore()
  return useMemo(() => {
    const open = db.leads.filter(isOpen)
    const byListing = new Map<string, Lead[]>()
    const byLead = new Map<string, Listing[]>()
    for (const l of db.listings) {
      if (l.status !== 'available') continue
      for (const lead of open) {
        if (!matches(lead, l)) continue
        byListing.set(l.id, [...(byListing.get(l.id) ?? []), lead])
        byLead.set(lead.id, [...(byLead.get(lead.id) ?? []), l])
      }
    }
    return { byListing, byLead }
  }, [db.leads, db.listings])
}

export function useContactMap() {
  const { db } = useStore()
  return useMemo(() => new Map(db.contacts.map((c) => [c.id, c])), [db.contacts])
}
