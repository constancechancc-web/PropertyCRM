import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

const SHEET_KEYS = ['id', 'edit', 'new', 'paste', 'contact', 'owner', 'lead', 'listing']

/** Record sheets live in the URL (?id=…, ?new=1, ?paste=1) so the back button closes them. */
export function useSheet() {
  const [params, setParams] = useSearchParams()
  const open = useCallback(
    (next: Record<string, string>, replace = false) => {
      setParams(
        (p) => {
          const n = new URLSearchParams(p)
          SHEET_KEYS.forEach((k) => n.delete(k))
          Object.entries(next).forEach(([k, v]) => n.set(k, v))
          return n
        },
        { replace },
      )
    },
    [setParams],
  )
  const close = useCallback(() => open({}), [open])
  const setFilter = useCallback(
    (key: string, value: string | null) => {
      setParams(
        (p) => {
          const n = new URLSearchParams(p)
          if (value == null) n.delete(key)
          else n.set(key, value)
          return n
        },
        { replace: true },
      )
    },
    [setParams],
  )
  return { params, open, close, setFilter }
}
