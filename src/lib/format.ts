// Dates are handled as local calendar days in "YYYY-MM-DD" form.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const pad = (n: number) => String(n).padStart(2, '0')

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayISO(now: Date = new Date()): string {
  return toISODate(now)
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

/** Whole days from a to b (b - a). */
export function diffDays(a: string, b: string): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime()
  return Math.round(ms / 86_400_000)
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate()
}

export function monthStart(iso: string): string {
  return iso.slice(0, 7) + '-01'
}

export function monthName(iso: string): string {
  return MONTHS[parseISODate(iso).getMonth()]
}

export function monthYear(iso: string): string {
  const d = parseISODate(iso)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** "31 October 2026" */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = iso.length > 10 ? new Date(iso) : parseISODate(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** "Saturday, 7 November 2026" */
export function fmtLongDate(d: Date = new Date()): string {
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** "31 October 2026 · 3:32 pm" */
export function fmtStamp(ts: string | null | undefined): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const h = d.getHours()
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${fmtDate(toISODate(d))} · ${h12}:${pad(d.getMinutes())} ${h < 12 ? 'am' : 'pm'}`
}

/** "20/03/2026" (only used in the rent reminder message) */
export function fmtDMY(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export function fmtNumber(n: number, maxDecimals = 2): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: maxDecimals })
}

/** Full form: "RM 680,000" */
export function rmFull(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return ''
  return `RM ${fmtNumber(n)}`
}

function trimDecimal(n: number, decimals: number): string {
  return String(Number(n.toFixed(decimals)))
}

/** Short number without "RM": 680k, 1.2 mil, 800 */
export function shortAmount(n: number): string {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${trimDecimal(n / 1_000_000, 2)} mil`
  if (a >= 1_000) return `${trimDecimal(n / 1_000, 1)}k`
  return fmtNumber(n)
}

/** Card form: sale "RM 680k" / "RM 1.2 mil"; rent "RM 1,800 /mo" */
export function rmShort(n: number | null | undefined, deal: 'sale' | 'rent' | null = 'sale'): string {
  if (n == null || Number.isNaN(n)) return ''
  if (deal === 'rent') return `RM ${fmtNumber(n)} /mo`
  return `RM ${shortAmount(n)}`
}

export function budgetText(min: number | null, max: number | null, deal: 'sale' | 'rent' | null): string {
  const f = (n: number) => (deal === 'rent' ? fmtNumber(n) : shortAmount(n))
  const tail = deal === 'rent' ? ' /mo' : ''
  if (min != null && max != null) return `RM ${f(min)} – ${f(max)}${tail}`
  if (max != null) return `Up to RM ${f(max)}${tail}`
  if (min != null) return `From RM ${f(min)}${tail}`
  return 'Any budget'
}

export function pct(n: number): string {
  return `${trimDecimal(n, 2)}%`
}

// ---------------------------------------------------------------------------
// Phones
// ---------------------------------------------------------------------------

/** "012-345 6789" / "+60 12-345 6789" → "60123456789" */
export function waDigits(phone: string | null | undefined): string {
  let d = (phone ?? '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('60')) return d
  if (d.startsWith('0')) return '60' + d.slice(1)
  return '60' + d
}

export function waLink(phone: string | null | undefined, text = ''): string {
  return `https://wa.me/${waDigits(phone)}?text=${encodeURIComponent(text)}`
}

export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = waDigits(a)
  return !!x && x === waDigits(b)
}

export function firstName(name: string | null | undefined): string {
  const n = (name ?? '').trim()
  if (!n) return ''
  const parts = n.split(/\s+/)
  if (/^(mr|mrs|ms|miss|mdm|madam|dr|encik|cik|puan|tuan|dato|datin)\.?$/i.test(parts[0]) && parts.length > 1) return n
  return parts[0]
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').replace(/^(mr|mrs|ms|miss|mdm|madam|dr)\.?\s+/i, '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const first = [...parts[0]][0] ?? ''
  const second = parts.length > 1 ? [...parts[parts.length - 1]][0] ?? '' : ''
  return (first + second).toUpperCase()
}

/** Stable pastel index (0-5) from an id */
export function pastelIndex(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % 6
}

export function newId(): string {
  return crypto.randomUUID()
}

export function nowISO(): string {
  return new Date().toISOString()
}
