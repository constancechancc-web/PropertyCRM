// Sales statistics. A deal counts in the period of the event:
//   forecast  → forecast_date (when it entered the pipeline)
//   converted → converted_date
//   gone      → gone_date
//   claimed   → claimed_date
import { diffDays } from './format'
import type { SaleDeal } from './types'

export interface Period {
  year: number
  month: number | null // 1-12, or null for the whole year
}

export const isWon = (d: SaleDeal) => d.status === 'converted' || d.status === 'claimed'

export function inPeriod(date: string | null | undefined, p: Period): boolean {
  if (!date) return false
  const y = Number(date.slice(0, 4))
  const m = Number(date.slice(5, 7))
  return y === p.year && (p.month == null || m === p.month)
}

const sum = (xs: (number | null | undefined)[]) => xs.reduce<number>((s, x) => s + (x ?? 0), 0)

export interface Summary {
  forecast: { count: number; commission: number; value: number }
  converted: { count: number; commission: number; value: number }
  gone: { count: number }
  claimed: { count: number; amount: number }
  /** Commission on deals converted in this period that hasn't been claimed yet. */
  pending: number
  /** Converted ÷ (converted + gone), as a percentage; null when nothing was decided. */
  conversionRate: number | null
  avgDaysToClose: number | null
}

export function summarize(deals: SaleDeal[], p: Period): Summary {
  const forecast = deals.filter((d) => inPeriod(d.forecast_date, p))
  const won = deals.filter((d) => isWon(d) && inPeriod(d.converted_date, p))
  const gone = deals.filter((d) => d.status === 'gone' && inPeriod(d.gone_date, p))
  const claimed = deals.filter((d) => d.status === 'claimed' && inPeriod(d.claimed_date, p))
  const decided = won.length + gone.length
  const days = won.filter((d) => d.converted_date).map((d) => diffDays(d.forecast_date, d.converted_date!))
  return {
    forecast: { count: forecast.length, commission: sum(forecast.map((d) => d.commission)), value: sum(forecast.map((d) => d.price)) },
    converted: { count: won.length, commission: sum(won.map((d) => d.commission)), value: sum(won.map((d) => d.price)) },
    gone: { count: gone.length },
    claimed: { count: claimed.length, amount: sum(claimed.map((d) => d.claimed_amount)) },
    pending: sum(won.filter((d) => d.status === 'converted').map((d) => d.commission)),
    conversionRate: decided ? (won.length / decided) * 100 : null,
    avgDaysToClose: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
  }
}

/** All commission converted but not yet claimed, any date. */
export function unclaimedTotal(deals: SaleDeal[]): number {
  return sum(deals.filter((d) => d.status === 'converted').map((d) => d.commission))
}

export function monthly(deals: SaleDeal[], year: number) {
  return Array.from({ length: 12 }, (_, i) => {
    const s = summarize(deals, { year, month: i + 1 })
    return { month: i + 1, forecast: s.forecast.count, converted: s.converted.count, gone: s.gone.count, earned: s.converted.commission, claimed: s.claimed.amount }
  })
}

export function lostReasons(deals: SaleDeal[], p: Period): { reason: string; count: number }[] {
  const m = new Map<string, number>()
  for (const d of deals) if (d.status === 'gone' && inPeriod(d.gone_date, p)) m.set(d.gone_reason || 'Not given', (m.get(d.gone_reason || 'Not given') ?? 0) + 1)
  return [...m].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
}

/** Share of converted deals in the period by a key (property type, sale/rent). */
export function mix(deals: SaleDeal[], p: Period, key: (d: SaleDeal) => string): { label: string; count: number; pct: number; commission: number }[] {
  const won = deals.filter((d) => isWon(d) && inPeriod(d.converted_date, p))
  const m = new Map<string, { count: number; commission: number }>()
  for (const d of won) {
    const k = key(d)
    const cur = m.get(k) ?? { count: 0, commission: 0 }
    m.set(k, { count: cur.count + 1, commission: cur.commission + (d.commission ?? 0) })
  }
  return [...m]
    .map(([label, v]) => ({ label, ...v, pct: won.length ? (v.count / won.length) * 100 : 0 }))
    .sort((a, b) => b.count - a.count || b.commission - a.commission)
}

/** Which areas / property types close best: conversion rate among decided deals (at least `min`). */
export function closeRates(deals: SaleDeal[], p: Period, key: (d: SaleDeal) => string, min = 2) {
  const m = new Map<string, { won: number; gone: number }>()
  for (const d of deals) {
    const won = isWon(d) && inPeriod(d.converted_date, p)
    const gone = d.status === 'gone' && inPeriod(d.gone_date, p)
    if (!won && !gone) continue
    const k = key(d)
    const cur = m.get(k) ?? { won: 0, gone: 0 }
    m.set(k, { won: cur.won + (won ? 1 : 0), gone: cur.gone + (gone ? 1 : 0) })
  }
  return [...m]
    .map(([label, v]) => ({ label, won: v.won, decided: v.won + v.gone, rate: (v.won / (v.won + v.gone)) * 100 }))
    .filter((x) => x.decided >= min)
    .sort((a, b) => b.rate - a.rate || b.decided - a.decided)
}

export function previousMonth(p: { year: number; month: number }) {
  return p.month === 1 ? { year: p.year - 1, month: 12 } : { year: p.year, month: p.month - 1 }
}

/** Year to date (up to and including `today`'s month and day) for a given year. */
export function yearToDate(deals: SaleDeal[], year: number, today: string): Summary {
  const cut = `${year}${today.slice(4, 10)}`
  return summarize(
    deals.map((d) => ({
      ...d,
      forecast_date: d.forecast_date <= cut ? d.forecast_date : '9999-12-31',
      converted_date: d.converted_date && d.converted_date <= cut ? d.converted_date : null,
      gone_date: d.gone_date && d.gone_date <= cut ? d.gone_date : null,
      claimed_date: d.claimed_date && d.claimed_date <= cut ? d.claimed_date : null,
    })),
    { year, month: null },
  )
}

/** Percentage change from b to a; null when b is 0. */
export function change(a: number, b: number): number | null {
  if (!b) return null
  return ((a - b) / b) * 100
}
