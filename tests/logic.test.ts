import { describe, expect, it } from 'vitest'
import { budgetText, fmtDate, fmtLongDate, fmtStamp, rmFull, rmShort, waDigits, waLink } from '../src/lib/format'
import { defaultFollowUp, hubBlock, matches, rentMessage, rentStatus } from '../src/lib/logic'
import type { Contact, Lead, Listing, Tenancy } from '../src/lib/types'

const base = { created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

describe('formatting', () => {
  it('dates include the year', () => {
    expect(fmtDate('2026-10-31')).toBe('31 October 2026')
    expect(fmtLongDate(new Date(2026, 10, 7))).toBe('Saturday, 7 November 2026')
    expect(fmtStamp(new Date(2026, 9, 31, 15, 32).toISOString())).toBe('31 October 2026 · 3:32 pm')
  })
  it('money', () => {
    expect(rmShort(680000)).toBe('RM 680k')
    expect(rmShort(1200000)).toBe('RM 1.2 mil')
    expect(rmShort(1800, 'rent')).toBe('RM 1,800 /mo')
    expect(rmFull(680000)).toBe('RM 680,000')
    expect(budgetText(null, 600000, 'sale')).toBe('Up to RM 600k')
  })
  it('WhatsApp numbers', () => {
    expect(waDigits('012-3456789')).toBe('60123456789')
    expect(waDigits('+60 12-345 6789')).toBe('60123456789')
    expect(waDigits('012-345 6789')).toBe('60123456789')
    expect(waLink('012-3456789', 'Hi Max, ')).toBe('https://wa.me/60123456789?text=Hi%20Max%2C%20')
  })
  it('new lead follow-up defaults to today + 2 days', () => {
    expect(defaultFollowUp('2026-11-07')).toBe('2026-11-09')
    expect(defaultFollowUp('2026-12-31')).toBe('2027-01-02')
  })
})

const tenancy: Tenancy = {
  ...base,
  id: 't1',
  tenant_name: 'Ravi Kumar',
  phone: '017-220 4455',
  address: 'A-18-05, Residensi Example, Jalan Tebrau, 80250 Johor Bahru',
  start_date: '2026-03-20',
  end_date: '2027-03-19',
  pay_day: 20,
  rent: 1800,
  account_holder: 'Lim Ah Kow',
  bank: 'Public Bank',
  account_number: '12345678910',
  is_example: true,
}

describe('rent', () => {
  it('reminder message matches §8 character for character', () => {
    expect(rentMessage(tenancy)).toBe(
      'Hi\n' +
        'A-18-05, Residensi Example, Jalan Tebrau, 80250 Johor Bahru\n' +
        'Tenancy Period: 20/03/2026 - 19/03/2027\n' +
        '\n' +
        '⏰Reminder for Rental Payment ⏰\n' +
        'Owner Account Holder Name: Lim Ah Kow\n' +
        'Bank: Public Bank 12345678910\n' +
        'Rental: RM1,800\n' +
        '\n' +
        'Please send us the receipt for record after you made transfer. Thank you 😊',
    )
  })
  it('status', () => {
    expect(rentStatus(tenancy, [], '2026-11-18').text).toBe('Due in 2d')
    expect(rentStatus(tenancy, [], '2026-11-20').text).toBe('Due today')
    expect(rentStatus(tenancy, [], '2026-11-24').text).toBe('4d overdue')
    const paid = [{ ...base, id: 'p', tenancy_id: 't1', month: '2026-11-01', paid: true }]
    expect(rentStatus(tenancy, paid, '2026-11-24').text).toBe('Paid for November')
    expect(rentStatus(tenancy, [], '2027-03-20').text).toBe('Tenancy ended')
    expect(rentStatus({ ...tenancy, pay_day: 31 }, [], '2027-02-28').text).toBe('Due today')
    expect(rentStatus(tenancy, [], '2027-02-01').endingSoon).toBe(true)
  })
})

const lead: Lead = {
  ...base,
  id: 'l1',
  contact_id: 'c1',
  deal: 'rent',
  property_types: ['Shop'],
  areas: 'Desa Cemerlang',
  budget_min: 2500,
  budget_max: 3000,
  stage: 'Contacted',
  next_follow_up: null,
  source: null,
  timeline: null,
  lost_reason: null,
  last_contacted_at: null,
  is_example: false,
}
const listing: Listing = {
  ...base,
  id: 'x1',
  deal: 'rent',
  address: 'Jalan Cemerlang 12, Taman Desa Cemerlang',
  type: 'Shop',
  price: 2800,
  built_up_sqft: null,
  land_sqft: null,
  bedrooms: null,
  bathrooms: null,
  furnishing: null,
  tenure: null,
  status: 'available',
  owner_id: null,
  viewing_access: null,
  note: null,
  is_example: false,
}

describe('matching (§7)', () => {
  it('matches and respects each rule', () => {
    expect(matches(lead, listing)).toBe(true)
    expect(matches(lead, { ...listing, status: 'rented' })).toBe(false)
    expect(matches(lead, { ...listing, deal: 'sale' })).toBe(false)
    expect(matches(lead, { ...listing, type: 'Shop Office' })).toBe(false)
    expect(matches({ ...lead, property_types: [] }, { ...listing, type: 'Shop Office' })).toBe(true)
    expect(matches(lead, { ...listing, address: 'Jalan Tebrau' })).toBe(false)
    expect(matches({ ...lead, areas: 'Any' }, { ...listing, address: 'Jalan Tebrau' })).toBe(true)
    expect(matches(lead, { ...listing, price: 3150 })).toBe(true) // 3000 × 1.05
    expect(matches(lead, { ...listing, price: 3151 })).toBe(false)
    expect(matches(lead, { ...listing, price: 2000 })).toBe(true) // 2500 × 0.8
    expect(matches(lead, { ...listing, price: 1999 })).toBe(false)
  })
})

describe('Listing Hub block (§9)', () => {
  it('uses the exact format', () => {
    const c = { ...base, id: 'c1', name: 'Max Lim', phone: '012-7119657', race: 'Chinese', roles: [], note: null, is_example: false } as Contact
    expect(hubBlock(lead, c, 'Facing main road')).toBe(
      '[CRM → Listing Hub]\nClient: Max Lim\nPhone: 012-7119657\nLooking: Rent\nTypes: Shop\nAreas: Desa Cemerlang\nBudget Min: 2500\nBudget Max: 3000\nNotes: Facing main road',
    )
    expect(hubBlock({ ...lead, property_types: ['Shop', 'Shop Office'] }, c, 'a\nb')).toContain('Types: Shop; Shop Office\n')
    expect(hubBlock(lead, c, 'a\nb')).toContain('Notes: a · b')
  })
})

import { periodLabel, tenancyEnd, tenancyMonths } from '../src/lib/logic'

describe('tenancy period', () => {
  it('works out the expiry date', () => {
    expect(tenancyEnd('2026-03-20', 12)).toBe('2027-03-19')
    expect(tenancyEnd('2026-03-01', 12)).toBe('2027-02-28')
    expect(tenancyEnd('2027-03-01', 12)).toBe('2028-02-29') // leap year
    expect(tenancyEnd('2026-01-31', 1)).toBe('2026-02-28')
    expect(tenancyEnd('2026-08-15', 6)).toBe('2027-02-14')
    expect(tenancyEnd('2026-11-13', 24)).toBe('2028-11-12')
  })
  it('recognises the period of an existing tenancy', () => {
    expect(tenancyMonths('2026-03-20', '2027-03-19')).toBe(12)
    expect(tenancyMonths('2026-03-20', '2027-03-25')).toBeNull()
    expect(periodLabel(12)).toBe('1 Year')
    expect(periodLabel(24)).toBe('2 Years')
    expect(periodLabel(6)).toBe('6 Months')
    expect(periodLabel(18)).toBe('1 Year 6 Months')
  })
})
