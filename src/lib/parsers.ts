// Paste From WhatsApp parsers (§9). Pure functions, run in the browser, no AI.
import { JB_AREAS, PROPERTY_TYPES, type Race } from './constants'
import type { Deal } from './types'

// ---------------------------------------------------------------------------
// Cleaning
// ---------------------------------------------------------------------------

const SP = String.raw`[\s  ]`
const TIME = String.raw`\d{1,2}[:.]\d{2}(?:[:.]\d{2})?(?:${SP}*[AaPp]\.?${SP}?[Mm]\.?)?`
const DATE = String.raw`\d{1,4}[\/.\-]\d{1,2}[\/.\-]\d{1,4}`
const PREFIX_BRACKET = new RegExp(String.raw`^\[${DATE},?${SP}+${TIME}\]${SP}*[^:]{1,60}?:${SP}*`)
const PREFIX_DASH = new RegExp(String.raw`^${DATE},?${SP}+${TIME}${SP}*-${SP}*[^:]{1,60}?:${SP}*`)
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍⃣]/gu

export function stripPrefix(line: string): string {
  return line.replace(PREFIX_BRACKET, '').replace(PREFIX_DASH, '')
}

/** Split pasted text into clean lines: no WhatsApp prefixes, no emoji, no bullets. */
export function cleanLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .flatMap((l) => stripPrefix(l.trim()).split(/\s+\/\s+/))
    .map((l) =>
      l
        .replace(EMOJI, ' ')
        .replace(/^[\s•·*\->–—]+/, '')
        .replace(/[\s  ]+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

const PHONE_RE = /(?<!\d)(?:\+?\s?60|0)[\s-]?1\d(?:[\s-]?\d){7,8}(?!\d)/

export function findPhone(s: string): string | null {
  const m = s.match(PHONE_RE)
  return m ? m[0].trim() : null
}

export function removePhones(s: string): string {
  return s.replace(new RegExp(PHONE_RE.source, 'g'), ' ')
}

const NUM = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)`
const UNIT = String.raw`\s*(k|mil(?:lion)?|m(?![a-z²])|万|w(?![a-z]))?`
const MONEY = NUM + UNIT

function unitFactor(unit: string | undefined): number {
  if (!unit) return 1
  const u = unit.toLowerCase()
  if (u === 'k') return 1_000
  if (u.startsWith('m')) return 1_000_000
  if (u === '万' || u === 'w') return 10_000
  return 1
}

function amount(num: string, unit?: string): number {
  return Math.round(parseFloat(num.replace(/,/g, '')) * unitFactor(unit) * 100) / 100
}

export function parseMoney(s: string): number | null {
  const m = s.match(new RegExp(MONEY, 'i'))
  return m ? amount(m[1], m[2]) : null
}

// ---------------------------------------------------------------------------
// Property types
// ---------------------------------------------------------------------------

const T = {
  condo: 'Condo / Apartment',
  lcFlat: 'Low Cost Flat',
  lcHouse: 'Low Cost House',
  single: '1 / 1.5 Storey Terrace House',
  double: '2 / 2.5 Storey Terrace House',
  cluster: 'Cluster House',
  semid: 'Semi D House',
  bungalow: 'Bungalow House',
  town: 'Townhouse',
  shop: 'Shop',
  shopOffice: 'Shop Office',
  tFactory: 'Terraced Factory',
  cFactory: 'Cluster Factory',
  sFactory: 'Semi D Factory',
  land: 'Land',
} as const

const STOREY_SINGLE = /\bsingle\b|\b1(?:\.5)?\s*(?:-|\s)?(?:storey|story|sty|stry)|单层|一层/i
const STOREY_DOUBLE = /\bdouble\b|\b2(?:\.5)?\s*(?:-|\s)?(?:storey|story|sty|stry)|双层|两层|二层/i
const STOREY_ANY = /stor(?:e)?y|\bsty\b|单层|双层|两层|一层|二层/i

export function detectTypes(text: string): string[] {
  let t = text.toLowerCase()
  const out = new Set<string>()

  // Factories first, then remove them so "terrace factory" isn't read as a house.
  const fac = [
    [/terrace[d]?\s*factor(?:y|ies)/g, T.tFactory],
    [/cluster\s*factor(?:y|ies)/g, T.cFactory],
    [/semi[\s-]?d(?:etached)?\s*factor(?:y|ies)/g, T.sFactory],
  ] as const
  for (const [re, type] of fac) {
    if (re.test(t)) {
      out.add(type)
      t = t.replace(re, ' ')
    }
  }
  if (/factor(?:y|ies)|工厂|厂房/.test(t)) {
    if (![T.tFactory, T.cFactory, T.sFactory].some((f) => out.has(f))) {
      out.add(T.tFactory).add(T.cFactory).add(T.sFactory)
    }
    t = t.replace(/factor(?:y|ies)|工厂|厂房/g, ' ')
  }

  if (/low[\s-]?cost\s*(?:flat|apartment)|\bflats?\b|组屋/.test(t)) {
    out.add(T.lcFlat)
    t = t.replace(/low[\s-]?cost\s*(?:flat|apartment)|\bflats?\b|组屋/g, ' ')
  }
  if (/low[\s-]?cost\s*(?:house|terrace)/.test(t)) {
    out.add(T.lcHouse)
    t = t.replace(/low[\s-]?cost\s*(?:house|terrace)/g, ' ')
  }
  if (/condo|apartment|\bapt\b|公寓|serviced?\s*(?:residence|apartment|suite)|\bsoho\b/.test(t)) out.add(T.condo)

  const cluster = /cluster|双拼/.test(t)
  const semid = /semi[\s-]?d\b|semi[\s-]?detached|semi[\s-]?d(?=\s|$)|半独立/.test(t)
  const bungalow = /bungalow|独立式|独立洋房|别墅/.test(t)
  const town = /town\s*house/.test(t)
  if (cluster) out.add(T.cluster)
  if (semid) out.add(T.semid)
  if (bungalow) out.add(T.bungalow)
  if (town) out.add(T.town)
  // Remove "semi d" and "town house" so their "house" can't confuse other checks.
  t = t.replace(/town\s*house/g, ' ')

  if (/shop\s*office|shop[\s-]?lots?|shop\s*house|shophouse|店屋|店面|商店/.test(t)) {
    out.add(T.shopOffice)
    t = t.replace(/shop\s*office|shop[\s-]?lots?|shop\s*house|shophouse|店屋|店面|商店/g, ' ')
  }
  if (/\bshops?\b/.test(t)) out.add(T.shop)
  if (/\bland\b|土地|地皮/.test(t)) out.add(T.land)

  const terrace = /terrace|排屋|link\s*house|联排/.test(t)
  const otherLanded = cluster || semid || bungalow || town || out.has(T.lcHouse)
  if (terrace || (STOREY_ANY.test(t) && !otherLanded)) {
    const s = STOREY_SINGLE.test(t)
    const d = STOREY_DOUBLE.test(t)
    if (s && !d) out.add(T.single)
    else if (d && !s) out.add(T.double)
    else out.add(T.single).add(T.double)
  }

  return PROPERTY_TYPES.filter((p) => out.has(p))
}

// ---------------------------------------------------------------------------
// Lead parser
// ---------------------------------------------------------------------------

export interface LeadParse {
  name: string | null
  phone: string | null
  race: Race | null
  deal: Deal | null
  types: string[]
  budgetMin: number | null
  budgetMax: number | null
  areas: string[]
  /** Lines the parser did not use (e.g. "Facing main road"). */
  leftover: string[]
}

const BUY_RE = /\bwtb\b|\bbuy(?:ing|er)?\b|\binvest(?:ment|or|ing)?\b|\bpurchase\b|买|购/i
const RENT_RE = /\bwtr\b|\brent(?:al|ing)?\b|\btenant\b|租/i

function detectDeal(text: string): Deal | null {
  const b = text.search(BUY_RE)
  const r = text.search(RENT_RE)
  if (b < 0 && r < 0) return null
  if (r < 0) return 'sale'
  if (b < 0) return 'rent'
  return b <= r ? 'sale' : 'rent'
}

function detectRace(text: string): Race | null {
  if (/\bchinese\b|华人|华裔/i.test(text)) return 'Chinese'
  if (/\bmalay\b|马来人|马来/i.test(text)) return 'Malay'
  if (/\bindian\b|印度人|印度/i.test(text)) return 'Indian'
  return null
}

const BUDGET_LINE = /budget|\brm\b|rm\s*\d|预算|价|price|below|under|max|within|above|\bmin|at least|up\s*to|以下|以内|以上|\d\s*(?:k|mil|m|万)\b|\d\s*(?:k|mil|万)/i

export function parseBudget(text: string, deal: Deal | null = null): { min: number | null; max: number | null } {
  const lines = text.split('\n').map(removePhones).filter((l) => BUDGET_LINE.test(l))
  let min: number | null = null
  let max: number | null = null
  const range = new RegExp(String.raw`(?:rm\s*)?${MONEY}\s*(?:-|–|—|~|to|至|until)\s*(?:rm\s*)?${MONEY}`, 'i')
  const minSuffix = new RegExp(String.raw`(?:rm\s*)?${MONEY}\s*(?:以上|and above|above|onwards|\+)`, 'i')
  const maxSuffix = new RegExp(String.raw`(?:rm\s*)?${MONEY}\s*(?:以下|以内|之内|and below|below)`, 'i')
  const minPrefix = new RegExp(String.raw`(?:above|minimum|min|at least|from|more than|>)\s*[:：]?\s*(?:rm\s*)?${MONEY}`, 'i')
  const maxPrefix = new RegExp(String.raw`(?:below|under|maximum|max|within|not more than|up\s*to|less than|<)\s*[:：]?\s*(?:rm\s*)?${MONEY}`, 'i')
  const budgetX = new RegExp(String.raw`(?:budget|预算)\s*(?:is|of|around|about|约|大概)?\s*[:：]?\s*(?:rm\s*)?${MONEY}`, 'i')
  const rmX = new RegExp(String.raw`\brm\s*${MONEY}`, 'i')

  for (const l of lines) {
    const r = l.match(range)
    if (r) {
      let u1 = r[2]
      const u2 = r[4]
      if (!u1 && u2 && parseFloat(r[1].replace(/,/g, '')) <= parseFloat(r[3].replace(/,/g, ''))) u1 = u2
      min = amount(r[1], u1)
      max = amount(r[3], u2)
      break
    }
  }
  if (min == null && max == null) {
    for (const l of lines) {
      let m: RegExpMatchArray | null
      if (min == null && (m = l.match(minSuffix))) min = amount(m[1], m[2])
      else if (max == null && (m = l.match(maxSuffix))) max = amount(m[1], m[2])
      else if (min == null && (m = l.match(minPrefix))) min = amount(m[1], m[2])
      else if (max == null && (m = l.match(maxPrefix))) max = amount(m[1], m[2])
      else if (max == null && (m = l.match(budgetX))) max = amount(m[1], m[2])
      else if (max == null && min == null && (m = l.match(rmX))) max = amount(m[1], m[2])
    }
  }
  // "budget 600" for a purchase almost always means 600k.
  if (deal === 'sale') {
    if (min != null && min < 5000) min *= 1000
    if (max != null && max < 5000) max *= 1000
  }
  return { min, max }
}

const AREA_INTRO = /(?:\barea\b|\blocation\b|\bwtb\b|\bwtr\b|@|地区|地点|区域)\s*[:：\-]?\s*(.+)$/i
const AREA_STRIP = new RegExp(
  [
    String.raw`\b(?:budget|below|under|within|max|above|min|rm)\b.*$`,
    String.raw`\d.*$`,
    String.raw`\b(?:condo(?:minium)?s?|apartments?|apt|serviced?|residences?|low\s*cost|flats?|houses?|terrace[d]?|single|double|storey|story|sty|cluster|semi[\s-]?d(?:etached)?|bungalows?|town\s*house|townhouses?|shop\s*office|shop[\s-]?lots?|shops?|office|lands?|factory|factories|units?|any\s*type|landed|property|properties|for|sale|rent|in|at|near|around|area|location|looking|want|wtb|wtr|a|an|the)\b`,
    String.raw`[想买租要找排屋公寓双层单层半独立店屋土地工厂预算以下以内以上万]+`,
  ].join('|'),
  'gi',
)

function cleanArea(s: string): string {
  return s.replace(/[.:;()]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function addArea(list: string[], area: string) {
  const a = cleanArea(area)
  if (!a || a.length < 2) return
  const low = a.toLowerCase()
  for (let i = 0; i < list.length; i++) {
    const e = list[i].toLowerCase()
    if (e === low || e.includes(low)) return
    if (low.includes(e)) {
      list[i] = a
      return
    }
  }
  list.push(a)
}

function knownAreasIn(text: string): string[] {
  const found: { area: string; at: number }[] = []
  for (const a of JB_AREAS) {
    const m = new RegExp(String.raw`(?<![A-Za-z])${escapeRe(a)}(?![A-Za-z])`, 'i').exec(text)
    if (m) found.push({ area: a, at: m.index })
  }
  return found.sort((x, y) => x.at - y.at).map((f) => f.area)
}

function isKnownArea(s: string): boolean {
  return JB_AREAS.some((a) => a.toLowerCase() === s.toLowerCase())
}

const NOT_NAME =
  /\b(?:wtb|wtr|buy|buying|rent|rental|budget|looking|want|need|area|location|condo|apartment|terrace|house|storey|story|shop|office|land|factory|cluster|semi|bungalow|townhouse|below|under|above|furnish(?:ed)?|facing|road|main|freehold|leasehold|chinese|malay|indian|others|tenant|invest|room|rooms|bed|bath|sqft|move|month|year|asap|urgent|any|near|taman|jalan|for|sale|price|rm|unit|floor|high|low|cost|single|double|budget|family|pax|working|student|pets?|car|park|parking)\b|想|买|租|预算|以下|以上|排屋|公寓|华人|马来|印度|找|要|屋|万|价/i

function looksLikeName(line: string): string | null {
  const s = line.replace(/^(?:name|client|nama)\s*[:：\-]\s*/i, '').replace(/[,.;:]+$/, '').trim()
  if (!s || /\d/.test(s) || s.length > 30) return null
  if (s.split(/\s+/).length > 4) return null
  if (!/[\p{L}]/u.test(s)) return null
  if (NOT_NAME.test(s) || isKnownArea(s)) return null
  return s
}

export function parseLead(text: string): LeadParse {
  const lines = cleanLines(text)
  const used = lines.map(() => false)
  const joined = lines.join('\n')

  // Phone
  let phone: string | null = null
  lines.forEach((l, i) => {
    const p = findPhone(l)
    if (p) {
      if (!phone) phone = p
      used[i] = true
    }
  })

  // Name: first short line (phone removed) without digits or request words
  let name: string | null = null
  for (let i = 0; i < lines.length && !name; i++) {
    const n = looksLikeName(removePhones(lines[i]).replace(/\s+/g, ' ').trim())
    if (n) {
      name = n
      used[i] = true
    }
  }

  // Race, deal, types
  const race = detectRace(joined)
  const deal = detectDeal(joined)
  const types = detectTypes(joined)

  // Budget
  const { min: budgetMin, max: budgetMax } = parseBudget(joined, deal)

  // Areas
  const areas: string[] = []
  for (const l of lines) {
    const m = removePhones(l).match(AREA_INTRO)
    if (!m) continue
    const rest = m[1].replace(AREA_STRIP, ' ')
    for (const piece of rest.split(/,|\/|\bor\b|\band\b|&|、|;|\+|\|/i)) addArea(areas, piece)
  }
  for (const a of knownAreasIn(joined)) addArea(areas, a)

  // Which lines did we use?
  lines.forEach((l, i) => {
    if (used[i]) return
    if (
      detectRace(l) ||
      detectDeal(l) ||
      detectTypes(l).length ||
      STOREY_ANY.test(l) ||
      AREA_INTRO.test(l) ||
      knownAreasIn(l).length ||
      (BUDGET_LINE.test(l) && /\d/.test(l))
    )
      used[i] = true
  })

  return {
    name,
    phone,
    race,
    deal,
    types,
    budgetMin,
    budgetMax,
    areas,
    leftover: lines.filter((_, i) => !used[i]),
  }
}

/** Notes for the Listing Hub block: typed notes as they are, pasted chats reduced to what the parser didn't pick up. */
export function noteSummary(text: string): string {
  const p = parseLead(text)
  const lines = cleanLines(text)
  if (!p.phone && !p.deal) return lines.join('\n')
  return p.leftover.join('\n')
}

// ---------------------------------------------------------------------------
// Listing parser
// ---------------------------------------------------------------------------

export interface ListingParse {
  deal: Deal | null
  type: string | null
  address: string | null
  price: number | null
  builtUp: number | null
  land: number | null
  bedrooms: number | null
  bathrooms: number | null
  furnishing: string | null
  tenure: string | null
  ownerName: string | null
  ownerPhone: string | null
}

const SALE_RE = /for\s*sale|\bselling\b|\bsale\b|\bsell\b|出售|售价|\basking\b|卖/i
const LRENT_RE = /for\s*rent|\brental\b|per\s*month|\/\s*month|\/\s*mo\b|\bmonthly\b|出租|租金|\brent\b/i
const OWNER_RE = /(?:contact\s+owner|owner|landlord|屋主|业主|房东|contact|call|whatsapp|wa)\s*[:：\-]?\s*(.*)$/i
const PRICE_LINE = /rm\s*\d|\bprice\b|售价|租金|\brental\b|\bselling\b|\basking\b|\d\s*(?:k|mil)\b/i
const SIZE_LINE = /sq\.?\s*ft|sqft|\d\s*sf\b|\bsf\b|built[\s-]?up|\bland\b[^a-z]*\d|\d+\s*[x×]\s*\d+|\bacres?\b/i
const ROOM_LINE = /\d\s*(?:bed|bath|r\s*\d\s*b|rooms?|br\b|房)/i
const ADDRESS_RE = /\b(?:jalan|jln|taman|tmn|lorong|lrg|persiaran|residensi|residence|residency|lebuh|lebuhraya|bandar|desa|bukit|kampung|kg|blok|block|menara|pangsapuri|plaza|pusat|kawasan|address)\b|\b\d{5}\b/i

export function parseListing(text: string): ListingParse {
  const lines = cleanLines(text)
  const joined = lines.join('\n')

  // Deal
  const s = joined.search(SALE_RE)
  const r = joined.search(LRENT_RE)
  const deal: Deal | null = s < 0 && r < 0 ? null : r < 0 ? 'sale' : s < 0 ? 'rent' : s <= r ? 'sale' : 'rent'

  // Owner
  let ownerName: string | null = null
  let ownerPhone: string | null = null
  const ownerIdx = lines.findIndex((l) => OWNER_RE.test(l) && (findPhone(l) || /owner|landlord|屋主|业主|房东/i.test(l)))
  if (ownerIdx >= 0) {
    const rest = lines[ownerIdx].match(OWNER_RE)![1]
    ownerPhone = findPhone(rest) ?? findPhone(lines[ownerIdx])
    const nm = removePhones(rest)
      .replace(/\b(?:owner|landlord|contact|call|whatsapp|wa|at|is|name)\b/gi, ' ')
      .replace(/[:：\-–,()]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    ownerName = nm && !/\d/.test(nm) ? nm : null
  }
  if (!ownerPhone) ownerPhone = findPhone(joined)

  const isSkip = (l: string, i: number) =>
    i === ownerIdx || PRICE_LINE.test(l) || SIZE_LINE.test(l) || ROOM_LINE.test(l) || !!findPhone(l)

  // Address
  const addrLines = lines
    .filter((l, i) => !isSkip(l, i) && ADDRESS_RE.test(l))
    .map((l) => l.replace(/^address\s*[:：\-]?\s*/i, '').replace(/[,\s]+$/, ''))
  const address = addrLines.length ? addrLines.join(', ') : null

  // Type (ignore land-size segments and the owner line)
  const typeText = lines
    .filter((_, i) => i !== ownerIdx)
    .map((l) => l.replace(/\bland(?:\s*(?:size|area))?\s*[:\-]?\s*[\d,.]+\s*(?:[x×*]\s*[\d,.]+)?\s*(?:sq\.?\s*ft|sqft|sf|ft|acres?)?/gi, ' '))
    .join('\n')
  const types = detectTypes(typeText)
  const type = types.find((t) => t !== T.land) ?? types[0] ?? null

  // Price
  let price: number | null = null
  const kw = new RegExp(String.raw`(?:selling|price|asking|rental|rent|售价|租金|售|sale)\s*(?:price)?\s*[:：]?\s*(?:at\s*)?(?:rm\s*)?${MONEY}`, 'i')
  const rm = new RegExp(String.raw`rm\s*${MONEY}(?!\s*psf)`, 'i')
  for (const l of lines) {
    const m = l.match(kw) ?? null
    if (m && !/psf/i.test(l.slice(m.index ?? 0, (m.index ?? 0) + m[0].length + 5))) {
      price = amount(m[1], m[2])
      break
    }
  }
  if (price == null) {
    for (const l of lines) {
      const m = l.match(rm)
      if (m) {
        price = amount(m[1], m[2])
        break
      }
    }
  }

  // Sizes
  let builtUp: number | null = null
  let land: number | null = null
  const bu = joined.match(new RegExp(String.raw`(?:built[\s-]?up|\bbu\b)\s*(?:area|size)?\s*[:：\-]?\s*${NUM}`, 'i'))
  if (bu) builtUp = amount(bu[1])
  const landX = joined.match(/\bland\s*(?:size|area)?\s*[:：\-]?\s*(\d{1,4}(?:\.\d+)?)\s*(?:'|ft)?\s*[x×*]\s*(\d{1,4}(?:\.\d+)?)/i)
  if (landX) land = Math.round(parseFloat(landX[1]) * parseFloat(landX[2]))
  if (land == null) {
    const lsq = joined.match(new RegExp(String.raw`\bland\s*(?:size|area)?\s*[:：\-]?\s*${NUM}\s*(?:sq\.?\s*ft|sqft|sf)?`, 'i'))
    if (lsq) land = amount(lsq[1])
  }
  if (land == null) {
    const dims = joined.match(/(?<![\d/])(\d{2,3})\s*(?:'|ft)?\s*[x×]\s*(\d{2,3})(?![\d/])/i)
    if (dims) land = parseInt(dims[1]) * parseInt(dims[2])
  }
  if (builtUp == null) {
    for (const l of lines) {
      for (const seg of l.split(',')) {
        if (/\bland\b/i.test(seg)) continue
        const m = seg.match(new RegExp(String.raw`${NUM}\s*(?:sq\.?\s*ft|sqft|sf|square\s*feet|kaki)\b`, 'i'))
        if (m) {
          builtUp = amount(m[1])
          break
        }
      }
      if (builtUp != null) break
    }
  }

  // Rooms
  let bedrooms: number | null = null
  let bathrooms: number | null = null
  const rb = joined.match(/(\d+)\s*r\s*(\d+)\s*b\b/i)
  if (rb) {
    bedrooms = parseInt(rb[1])
    bathrooms = parseInt(rb[2])
  }
  if (bedrooms == null) {
    const m = joined.match(/(\d+)\s*(?:bed(?:room)?s?\b|br\b|rooms?\b|房)/i)
    if (m) bedrooms = parseInt(m[1])
  }
  if (bathrooms == null) {
    const m = joined.match(/(\d+)\s*(?:bath(?:room)?s?\b|ba\b|toilets?\b|厕|卫)/i)
    if (m) bathrooms = parseInt(m[1])
  }

  // Furnishing, tenure
  let furnishing: string | null = null
  if (/un[\s-]?furnish|bare\s*unit|no\s*furnish|没家私|空屋/i.test(joined)) furnishing = 'Unfurnished'
  else if (/part(?:ly|ial(?:ly)?)?[\s-]?furnish|semi[\s-]?furnish|\bpf\b|半配|半家私/i.test(joined)) furnishing = 'Partly furnished'
  else if (/full(?:y)?[\s-]?furnish|\bff\b|全配|全家私/i.test(joined)) furnishing = 'Fully furnished'

  let tenure: string | null = null
  if (/freehold|\bfh\b|永久/i.test(joined)) tenure = 'Freehold'
  else if (/leasehold|\blh\b|\d+\s*years?\s*lease|地契/i.test(joined)) tenure = 'Leasehold'
  else if (/malay\s*reserve|马来保留/i.test(joined)) tenure = 'Malay reserve'
  else if (/bumi(?:putera)?\s*lot|土著/i.test(joined)) tenure = 'Bumi lot'

  return { deal, type, address, price, builtUp, land, bedrooms, bathrooms, furnishing, tenure, ownerName, ownerPhone }
}
