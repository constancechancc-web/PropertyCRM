import { OPEN_STAGES } from './constants'
import { addDays, diffDays, daysInMonth, fmtDMY, fmtDate, fmtNumber, monthName, monthStart, parseISODate, toISODate } from './format'
import type { Contact, Lead, LeadNote, Listing, Tenancy, TenancyPayment } from './types'

// ---------------------------------------------------------------------------
// Matching (§7)
// ---------------------------------------------------------------------------

export function isOpen(lead: Lead): boolean {
  return OPEN_STAGES.includes(lead.stage)
}

export function leadAreas(lead: Pick<Lead, 'areas'>): string[] {
  return (lead.areas ?? '')
    .split(',')
    .map((a) => a.trim())
    .filter((a) => a && a.toLowerCase() !== 'any')
}

export function matches(lead: Lead, listing: Listing): boolean {
  if (listing.status !== 'available') return false
  if (!lead.deal || !listing.deal || lead.deal !== listing.deal) return false
  if (lead.property_types.length && (!listing.type || !lead.property_types.includes(listing.type))) return false
  const areas = leadAreas(lead)
  if (areas.length) {
    const addr = listing.address.toLowerCase()
    if (!areas.some((a) => addr.includes(a.toLowerCase()))) return false
  }
  if (listing.price != null) {
    if (lead.budget_max != null && listing.price > lead.budget_max * 1.05) return false
    if (lead.budget_min != null && listing.price < lead.budget_min * 0.8) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------

export function followUpInfo(lead: Lead, today: string): { text: string; tone: 'bad' | 'warn' | 'none' | 'plain' } {
  if (!lead.next_follow_up) return { text: isOpen(lead) ? 'No follow-up' : '', tone: 'none' }
  const d = diffDays(today, lead.next_follow_up)
  if (d < 0) return { text: `${-d}d overdue`, tone: 'bad' }
  if (d === 0) return { text: 'Today', tone: 'warn' }
  if (d === 1) return { text: 'Tomorrow', tone: 'plain' }
  return { text: fmtDate(lead.next_follow_up), tone: 'plain' }
}

export function contactedToday(lead: Lead, today: string): boolean {
  return !!lead.last_contacted_at && toISODate(new Date(lead.last_contacted_at)) === today
}

export function defaultFollowUp(today: string): string {
  return addDays(today, 2)
}

// ---------------------------------------------------------------------------
// Rent (§6 Rent, §8)
// ---------------------------------------------------------------------------

export type RentKind = 'upcoming' | 'ended' | 'paid' | 'due' | 'dueToday' | 'overdue' | 'noDay'

export interface RentStatus {
  kind: RentKind
  text: string
  tone: 'good' | 'warn' | 'bad' | 'plain'
  month: string // current month, YYYY-MM-01
  dueDate: string | null
  days: number | null // days until due (negative = overdue)
  endingSoon: boolean
  endsInDays: number | null
}

export function dueDateFor(payDay: number, month: string): string {
  const d = parseISODate(month)
  const day = Math.min(payDay, daysInMonth(d.getFullYear(), d.getMonth()))
  return toISODate(new Date(d.getFullYear(), d.getMonth(), day))
}

export function isPaid(payments: TenancyPayment[], tenancyId: string, month: string): boolean {
  return payments.some((p) => p.tenancy_id === tenancyId && p.month === month && p.paid)
}

export function rentStatus(t: Tenancy, payments: TenancyPayment[], today: string): RentStatus {
  const month = monthStart(today)
  const endsInDays = t.end_date ? diffDays(today, t.end_date) : null
  const endingSoon = endsInDays != null && endsInDays >= 0 && endsInDays <= 60
  const base = { month, endsInDays, endingSoon }
  if (t.end_date && today > t.end_date) {
    return { ...base, kind: 'ended', text: 'Tenancy ended', tone: 'plain', dueDate: null, days: null, endingSoon: false }
  }
  if (t.start_date && today < t.start_date) {
    return { ...base, kind: 'upcoming', text: `Starts ${fmtDate(t.start_date)}`, tone: 'plain', dueDate: null, days: null }
  }
  const monthLabel = monthName(month)
  if (isPaid(payments, t.id, month)) {
    return { ...base, kind: 'paid', text: `Paid for ${monthLabel}`, tone: 'good', dueDate: t.pay_day ? dueDateFor(t.pay_day, month) : null, days: null }
  }
  if (!t.pay_day) return { ...base, kind: 'noDay', text: 'No payment date set', tone: 'plain', dueDate: null, days: null }
  const dueDate = dueDateFor(t.pay_day, month)
  const days = diffDays(today, dueDate)
  if (days < 0) return { ...base, kind: 'overdue', text: `${-days}d overdue`, tone: 'bad', dueDate, days }
  if (days === 0) return { ...base, kind: 'dueToday', text: 'Due today', tone: 'warn', dueDate, days }
  return { ...base, kind: 'due', text: `Due in ${days}d`, tone: 'plain', dueDate, days }
}

export function isDueSoon(s: RentStatus): boolean {
  return s.kind === 'overdue' || s.kind === 'dueToday' || (s.kind === 'due' && (s.days ?? 99) <= 3)
}

export function rmPlain(n: number | null | undefined): string {
  if (n == null) return 'RM'
  return `RM${fmtNumber(n)}`
}

export function rentMessage(t: Pick<Tenancy, 'address' | 'start_date' | 'end_date' | 'account_holder' | 'bank' | 'account_number' | 'rent'>): string {
  return [
    'Hi',
    t.address ?? '',
    `Tenancy Period: ${fmtDMY(t.start_date)} - ${fmtDMY(t.end_date)}`,
    '',
    '⏰Reminder for Rental Payment ⏰',
    `Owner Account Holder Name: ${t.account_holder ?? ''}`,
    `Bank: ${[t.bank, t.account_number].filter(Boolean).join(' ')}`,
    `Rental: ${rmPlain(t.rent)}`,
    '',
    'Please send us the receipt for record after you made transfer. Thank you 😊',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Listing Hub hand-off (§9)
// ---------------------------------------------------------------------------

export function hubBlock(lead: Lead, contact: Contact | undefined, notes: string): string {
  const lines = [
    '[CRM → Listing Hub]',
    `Client: ${contact?.name ?? ''}`,
    `Phone: ${contact?.phone ?? ''}`,
    `Looking: ${lead.deal === 'rent' ? 'Rent' : lead.deal === 'sale' ? 'Buy' : ''}`,
    `Types: ${lead.property_types.join('; ')}`,
    `Areas: ${lead.areas ?? ''}`,
    `Budget Min: ${lead.budget_min ?? ''}`,
    `Budget Max: ${lead.budget_max ?? ''}`,
    `Notes: ${notes.replace(/\s*\r?\n\s*/g, ' · ').trim()}`,
  ]
  return lines.join('\n')
}

export function notesNewestFirst(notes: LeadNote[], leadId: string): LeadNote[] {
  return notes.filter((n) => n.lead_id === leadId).sort((a, b) => b.created_at.localeCompare(a.created_at))
}

// ---------------------------------------------------------------------------
// Tenancy period → expiry date
// ---------------------------------------------------------------------------

/** Expiry date for a tenancy starting on `start` that runs `months` months: the day before the same date N months later.
 *  20/03/2026 + 12 months → 19/03/2027. When that date doesn't exist (31 Jan + 1 month), the period ends on the last day of the month. */
export function tenancyEnd(start: string, months: number): string {
  const s = parseISODate(start)
  const y = s.getFullYear()
  const m = s.getMonth() + months
  const target = new Date(y, m, 1)
  const dim = daysInMonth(target.getFullYear(), target.getMonth())
  const anniversary = s.getDate() > dim ? new Date(target.getFullYear(), target.getMonth() + 1, 1) : new Date(target.getFullYear(), target.getMonth(), s.getDate())
  anniversary.setDate(anniversary.getDate() - 1)
  return toISODate(anniversary)
}

/** Whole number of months between start and end, if end is exactly a tenancy expiry; otherwise null. */
export function tenancyMonths(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  for (let m = 1; m <= 120; m++) if (tenancyEnd(start, m) === end) return m
  return null
}

export function periodLabel(months: number): string {
  if (months % 12 === 0) return months === 12 ? '1 Year' : `${months / 12} Years`
  if (months > 12) return `${Math.floor(months / 12)} ${months < 24 ? 'Year' : 'Years'} ${months % 12} ${months % 12 === 1 ? 'Month' : 'Months'}`
  return `${months} ${months === 1 ? 'Month' : 'Months'}`
}

/** Default rent payment day: the 7th day counting from the tenancy start (start day + 6).
 *  1st → 7, 15th → 21, 28 January → 3 (runs into the next month). */
export function defaultPayDay(start: string): number {
  return Number(addDays(start, 6).slice(8, 10))
}
