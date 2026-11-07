import { describe, expect, it } from 'vitest'
import { noteSummary, parseLead, parseListing } from '../src/lib/parsers'

const L = (s: string) => s.split(' / ').join('\n')
const BOTH_TERRACE = ['1 / 1.5 Storey Terrace House', '2 / 2.5 Storey Terrace House']

describe('lead parser (§9)', () => {
  it('Mr Chan', () => {
    const p = parseLead(L('Mr Chan / 012-1234567 / WTB terrace house / budget below 600k'))
    expect(p.name).toBe('Mr Chan')
    expect(p.phone).toBe('012-1234567')
    expect(p.deal).toBe('sale')
    expect(p.types).toEqual(BOTH_TERRACE)
    expect(p.budgetMax).toBe(600000)
    expect(p.budgetMin).toBeNull()
    expect(p.areas).toEqual([])
  })

  it('Felicia Chen', () => {
    const p = parseLead(L('012-7631462 / Felicia Chen / WTR Taman Universiti / Single Storey / Budget below 1500 / Chinese'))
    expect(p.name).toBe('Felicia Chen')
    expect(p.phone).toBe('012-7631462')
    expect(p.deal).toBe('rent')
    expect(p.types).toEqual(['1 / 1.5 Storey Terrace House'])
    expect(p.areas).toEqual(['Taman Universiti'])
    expect(p.budgetMax).toBe(1500)
    expect(p.race).toBe('Chinese')
  })

  it('Max Lim', () => {
    const p = parseLead(L('012-7119657 / Max Lim / Chinese / WTR Desa Cemerlang / Shop / Budget 2500-3000 / Facing main road'))
    expect(p.name).toBe('Max Lim')
    expect(p.deal).toBe('rent')
    expect(p.types).toEqual(['Shop'])
    expect(p.areas).toEqual(['Desa Cemerlang'])
    expect(p.budgetMin).toBe(2500)
    expect(p.budgetMax).toBe(3000)
    expect(p.race).toBe('Chinese')
    expect(p.leftover).toEqual(['Facing main road'])
  })

  it('Ms Lee', () => {
    const p = parseLead(L('Ms Lee / 016 888 1234 / WTR condo Tebrau or Setia Indah / budget 1.5k-2k'))
    expect(p.name).toBe('Ms Lee')
    expect(p.phone).toBe('016 888 1234')
    expect(p.deal).toBe('rent')
    expect(p.types).toEqual(['Condo / Apartment'])
    expect(p.areas).toEqual(['Tebrau', 'Setia Indah'])
    expect(p.budgetMin).toBe(1500)
    expect(p.budgetMax).toBe(2000)
  })

  it('陈先生', () => {
    const p = parseLead(L('陈先生 / 0127778888 / 想买双层排屋 预算60万以下 Skudai'))
    expect(p.name).toBe('陈先生')
    expect(p.phone).toBe('0127778888')
    expect(p.deal).toBe('sale')
    expect(p.types).toEqual(['2 / 2.5 Storey Terrace House'])
    expect(p.areas).toEqual(['Skudai'])
    expect(p.budgetMax).toBe(600000)
  })

  it('strips WhatsApp prefixes and emoji', () => {
    const p = parseLead('[10/31/26, 11:32:31 PM] You: Mr Chan\n31/10/2026, 9:10 pm - Ah Seng: 📍012-1234567\n🏠WTB terrace')
    expect(p.name).toBe('Mr Chan')
    expect(p.phone).toBe('012-1234567')
    expect(p.types).toEqual(BOTH_TERRACE)
  })

  it('reads +60 numbers and never treats the phone as money', () => {
    const p = parseLead('Aisyah\n+60 12-345 6789\nWTB condo')
    expect(p.phone).toBe('+60 12-345 6789')
    expect(p.budgetMax).toBeNull()
    expect(p.budgetMin).toBeNull()
  })

  it('hub notes keep only what the parser did not use', () => {
    expect(noteSummary(L('012-7119657 / Max Lim / Chinese / WTR Desa Cemerlang / Shop / Budget 2500-3000 / Facing main road'))).toBe('Facing main road')
    expect(noteSummary('Called, wants high floor.\nWill decide next week')).toBe('Called, wants high floor.\nWill decide next week')
  })
})

describe('listing parser (§9)', () => {
  it('Mount Austin terrace for sale', () => {
    const p = parseListing(
      L('For Sale / Jalan Austin Perdana 2/8, Taman Mount Austin / Double storey terrace / Built-up 1650sqft, Land 22x70 / 4 bed 3 bath / Freehold, partly furnished / Selling RM680k / Owner: Mr Lim 012-3456789'),
    )
    expect(p.deal).toBe('sale')
    expect(p.type).toBe('2 / 2.5 Storey Terrace House')
    expect(p.address).toBe('Jalan Austin Perdana 2/8, Taman Mount Austin')
    expect(p.price).toBe(680000)
    expect(p.builtUp).toBe(1650)
    expect(p.land).toBe(1540)
    expect(p.bedrooms).toBe(4)
    expect(p.bathrooms).toBe(3)
    expect(p.furnishing).toBe('Partly furnished')
    expect(p.tenure).toBe('Freehold')
    expect(p.ownerName).toBe('Mr Lim')
    expect(p.ownerPhone).toBe('012-3456789')
  })

  it('Residensi Tebrau condo for rent', () => {
    const p = parseListing(
      L('[31/10/2026, 9:10 pm] Ah Seng EAG: 🏠For Rent🏠 / 📍Residensi Tebrau, Jalan Tebrau / Condo high floor 1100sf 3R2B / Fully furnished / Rental RM1,800/month / Contact owner Ms Tan 016-888 9999'),
    )
    expect(p.deal).toBe('rent')
    expect(p.type).toBe('Condo / Apartment')
    expect(p.address).toBe('Residensi Tebrau, Jalan Tebrau')
    expect(p.price).toBe(1800)
    expect(p.builtUp).toBe(1100)
    expect(p.land).toBeNull()
    expect(p.bedrooms).toBe(3)
    expect(p.bathrooms).toBe(2)
    expect(p.furnishing).toBe('Fully furnished')
    expect(p.ownerName).toBe('Ms Tan')
    expect(p.ownerPhone).toBe('016-888 9999')
  })

  it('reads RM1.2mil and 售价', () => {
    expect(parseListing('Bungalow for sale\n售价 RM1.2mil').price).toBe(1200000)
  })
})
