// Listing messages written the way Constance writes them (addresses and phones changed).
import { describe, expect, it } from 'vitest'
import { detectTypes, parseLead, parseListing } from '../src/lib/parsers'

describe("Constance's listing message styles", () => {
  it('semi D factory with inch sizes', () => {
    const p = parseListing(`For Rent
Taman Impian Emas

1.5 Storey Semi D Factory
Land is 80" x 160"
Built up 6,916sqft
Power supply 200amp
Intermediate Lot

Asking Rental: RM17,000`)
    expect(p.deal).toBe('rent')
    expect(p.type).toBe('Semi D Factory')
    expect(p.land).toBe(12800)
    expect(p.builtUp).toBe(6916)
    expect(p.price).toBe(17000)
    expect(p.address).toBe('Taman Impian Emas')
  })

  it('terrace factory', () => {
    const p = parseListing(`For Rent
Taman Ungku Tun Aminah (TUTA)
Jalan Contoh @ Skudai

1.5 Storey Terrace Factory
With 2 Small Cold Rooms
Land Size: 30x95 (2849.91 sqft)
Built Up: 2850sqft

Asking Rental: RM4800 nego`)
    expect(p.type).toBe('Terraced Factory')
    expect(p.land).toBe(2850)
    expect(p.builtUp).toBe(2850)
    expect(p.bedrooms).toBeNull()
    expect(p.price).toBe(4800)
  })

  it('3 storey shoplot is a shop office, size is the floor size', () => {
    const p = parseListing(`For Rent
Taman Cahaya Kota Puteri, Masai
Jalan Kota 1/3

3 Storey Shoplot
Intermediate Lot
Size: 24x70

Asking Rental:
1st Floor: RM1500 (Original Condition)`)
    expect(p.type).toBe('Shop Office')
    expect(p.builtUp).toBe(1680)
    expect(p.price).toBe(1500)
  })

  it('double storey terrace with label-style rooms and estate-only location', () => {
    const p = parseListing(`For Rent
Eco Tropics Greensgate
Kota Masai

Double Storey Terrace House
Land Size: 20x80
Bedroom: 4
Bathroom: 3
Partially Furnished

Rental: RM2500`)
    expect(p.type).toBe('2 / 2.5 Storey Terrace House')
    expect(p.address).toBe('Eco Tropics Greensgate, Kota Masai')
    expect(p.land).toBe(1600)
    expect(p.bedrooms).toBe(4)
    expect(p.bathrooms).toBe(3)
    expect(p.furnishing).toBe('Partly furnished')
  })

  it('2.5 storey terrace, 4+1 bedrooms', () => {
    const p = parseListing(`For Rent
Taman Scientex @ Senai
Jalan Contoh Jaya

2.5 Storey Terrace House
Land Size: 18x60
Bedroom: 4+1
Bathroom: 3

Rental: RM2100 nego`)
    expect(p.type).toBe('2 / 2.5 Storey Terrace House')
    expect(p.bedrooms).toBe(5)
    expect(p.bathrooms).toBe(3)
    expect(p.land).toBe(1080)
  })

  it('apartment for sale, ignores the agent signature', () => {
    const p = parseListing(`Example Residence A-10-01

For Sale / WTS
Example Residence @ Danga Bay

Apartment
Size: 689 sqft
Bedroom: 1+1
Bathroom: 1
Fully Furnished

Asking Price: RM399k nego

TRR-EAG
Constance 019-2288249
www.wasap.my/60192288249/example`)
    expect(p.deal).toBe('sale')
    expect(p.type).toBe('Condo / Apartment')
    expect(p.builtUp).toBe(689)
    expect(p.bedrooms).toBe(2)
    expect(p.bathrooms).toBe(1)
    expect(p.price).toBe(399000)
    expect(p.ownerPhone).toBeNull()
    expect(p.address).toBe('Example Residence A-10-01, Example Residence @ Danga Bay')
  })

  it('semi D house, address not repeated', () => {
    const p = parseListing(`12, Jalan Contoh, Pontian Kecil, 82000 Pontian, Johor.

For Sale
Pontian Kecil
Jalan Contoh

2 Storey Semi D House
Land Size: 4887 sqft
Bedroom: 4
Bathroom: 3
Freehold

Asking Price: RM780k nego`)
    expect(p.type).toBe('Semi D House')
    expect(p.address).toBe('12, Jalan Contoh, Pontian Kecil, 82000 Pontian, Johor')
    expect(p.land).toBe(4887)
    expect(p.bedrooms).toBe(4)
    expect(p.bathrooms).toBe(3)
    expect(p.tenure).toBe('Freehold')
    expect(p.price).toBe(780000)
  })

  it('agricultural land in acres, "Terrain: Flat" is not a flat', () => {
    const p = parseListing(`For Sale
Tangkak Agriculture Land

Daerah: Tangkak
Type: Agriculture
Size: 1.3605 Hektar (3.36 Acres)
Tenure: Leasehold 99 years
Terrain: Flat

Asking Price: RM350k`)
    expect(p.type).toBe('Land')
    expect(p.land).toBe(146362)
    expect(p.tenure).toBe('Leasehold')
    expect(p.address).toBe('Tangkak Agriculture Land')
    expect(p.price).toBe(350000)
  })

  it('shop apartment is an apartment; commercial shop unit is a shop', () => {
    expect(parseListing('For Sale\nBukit Mewah Shop Apartment\nJalan Contoh 5/1\n\nShop Apartment\n2nd Floor\nBedroom: 3\nBathroom: 2').type).toBe('Condo / Apartment')
    expect(parseListing('For Rent\nPermas City @ Permas Jaya\n\nCommercial Shop Unit\nSize: 2596 sqft (22x118)\nBare Unit').type).toBe('Shop')
    expect(parseListing('For Rent\nPermas City @ Permas Jaya\n\nCommercial Shop Office\nSize: 1320 sqft (22x60)').type).toBe('Shop Office')
  })

  it('a lead asking for a single storey still means terrace', () => {
    expect(detectTypes('Single Storey')).toEqual(['1 / 1.5 Storey Terrace House'])
    expect(parseLead('Ann\n012-3334444\nWTR Taman Universiti\nDouble Storey').types).toEqual(['2 / 2.5 Storey Terrace House'])
  })
})
