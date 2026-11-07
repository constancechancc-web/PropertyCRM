import { describe, expect, it } from 'vitest'
import { change, closeRates, lostReasons, mix, monthly, summarize, unclaimedTotal, yearToDate } from '../src/lib/sales'
import type { SaleDeal } from '../src/lib/types'

let n = 0
function deal(p: Partial<SaleDeal>): SaleDeal {
  return {
    id: `d${++n}`,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    contact_id: null,
    lead_id: null,
    listing_id: null,
    deal: 'sale',
    property_type: '2 / 2.5 Storey Terrace House',
    area: 'Mount Austin',
    address: null,
    price: 600000,
    commission: 12000,
    status: 'forecast',
    forecast_date: '2026-10-01',
    expected_date: null,
    converted_date: null,
    gone_date: null,
    gone_reason: null,
    claimed_amount: null,
    claimed_date: null,
    note: null,
    is_example: false,
    ...p,
  }
}

const deals = [
  deal({ status: 'claimed', forecast_date: '2026-10-01', converted_date: '2026-10-21', claimed_date: '2026-11-05', claimed_amount: 11500 }),
  deal({ status: 'converted', forecast_date: '2026-10-10', converted_date: '2026-10-20', commission: 8000, property_type: 'Condo / Apartment', area: 'Tebrau' }),
  deal({ status: 'gone', forecast_date: '2026-10-03', gone_date: '2026-10-25', gone_reason: 'Financing / Loan Rejected' }),
  deal({ status: 'gone', forecast_date: '2026-10-04', gone_date: '2026-10-26', gone_reason: 'Price', area: 'Tebrau', property_type: 'Condo / Apartment' }),
  deal({ status: 'gone', forecast_date: '2026-09-04', gone_date: '2026-10-27', gone_reason: 'Price' }),
  deal({ status: 'forecast', forecast_date: '2026-10-15', commission: 5000 }),
  deal({ status: 'converted', deal: 'rent', forecast_date: '2025-10-01', converted_date: '2025-10-15', price: 1800, commission: 1800, property_type: 'Condo / Apartment', area: 'Tebrau' }),
]

describe('sales statistics', () => {
  it('counts each event in its own month', () => {
    const s = summarize(deals, { year: 2026, month: 10 })
    expect(s.forecast.count).toBe(5) // forecast in October 2026
    expect(s.converted.count).toBe(2)
    expect(s.converted.commission).toBe(20000)
    expect(s.gone.count).toBe(3)
    expect(s.claimed.count).toBe(0) // claimed in November
    expect(s.pending).toBe(8000) // the converted-but-unclaimed one
    expect(s.conversionRate).toBe(40) // 2 of 5 decided
    expect(s.avgDaysToClose).toBe(15) // (20 + 10) / 2
    expect(summarize(deals, { year: 2026, month: 11 }).claimed.amount).toBe(11500)
  })

  it('totals, reasons, mix and close rates', () => {
    expect(unclaimedTotal(deals)).toBe(9800)
    expect(lostReasons(deals, { year: 2026, month: null })).toEqual([
      { reason: 'Price', count: 2 },
      { reason: 'Financing / Loan Rejected', count: 1 },
    ])
    const m = mix(deals, { year: 2026, month: null }, (d) => d.property_type ?? '')
    expect(m.map((x) => [x.label, x.pct])).toEqual([
      ['2 / 2.5 Storey Terrace House', 50],
      ['Condo / Apartment', 50],
    ])
    const areas = closeRates(deals, { year: 2026, month: null }, (d) => d.area ?? '')
    expect(areas.map((a) => [a.label, a.won, a.decided, Math.round(a.rate)])).toEqual([
      ['Tebrau', 1, 2, 50],
      ['Mount Austin', 1, 3, 33],
    ])
    expect(monthly(deals, 2026)[9]).toMatchObject({ month: 10, converted: 2, gone: 3, earned: 20000 })
  })

  it('year to date and change', () => {
    expect(yearToDate(deals, 2025, '2026-11-07').converted.count).toBe(1)
    expect(yearToDate(deals, 2026, '2026-10-20').converted.count).toBe(1) // the 21 Oct one not yet
    expect(change(150, 100)).toBe(50)
    expect(change(5, 0)).toBeNull()
  })
})
