// Excel (SheetJS) and PDF (jsPDF + autotable) exports. Loaded on demand.
import { CONTACT_ROLE_LABEL, LISTING_STATUS_LABEL, OWNER_NAME, REN } from './constants'
import { fmtDate, fmtLongDate, fmtNumber, todayISO } from './format'
import type { Contact, Lead, LeadNote, Listing } from './types'

export type Kind = 'Leads' | 'Listings' | 'Contacts'
type Cell = string | number | null
export interface Table {
  columns: string[]
  pdfColumns: string[]
  rows: Cell[][]
}

const s = (v: unknown) => (v == null ? '' : String(v))

export function leadTable(leads: Lead[], contacts: Map<string, Contact>, notes: LeadNote[]): Table {
  const latest = new Map<string, LeadNote>()
  for (const n of notes) {
    const cur = latest.get(n.lead_id)
    if (!cur || n.created_at > cur.created_at) latest.set(n.lead_id, n)
  }
  const columns = ['Name', 'Phone', 'Race', 'Looking To', 'Property Types', 'Areas', 'Budget From', 'Budget Up To', 'Stage', 'Next Follow-Up', 'Came From', 'Timeline', 'Latest Note', 'Added On']
  const rows = leads.map((l) => {
    const c = l.contact_id ? contacts.get(l.contact_id) : undefined
    return [
      s(c?.name),
      s(c?.phone),
      s(c?.race),
      l.deal === 'rent' ? 'Rent' : l.deal === 'sale' ? 'Buy' : '',
      l.property_types.length ? l.property_types.join(', ') : 'Any type',
      s(l.areas),
      l.budget_min,
      l.budget_max,
      l.stage,
      fmtDate(l.next_follow_up),
      s(l.source),
      s(l.timeline),
      s(latest.get(l.id)?.text),
      fmtDate(l.created_at),
    ]
  })
  return { columns, rows, pdfColumns: ['Name', 'Phone', 'Looking To', 'Property Types', 'Areas', 'Budget From', 'Budget Up To', 'Stage', 'Next Follow-Up', 'Came From'] }
}

export function listingTable(listings: Listing[], contacts: Map<string, Contact>): Table {
  const columns = ['Full Address', 'Sale / Rent', 'Type', 'Price', 'Built-up', 'Land', 'Bed', 'Bath', 'Furnishing', 'Tenure', 'Status', 'Owner', 'Owner Phone', 'Viewing / Keys', 'Notes']
  const rows = listings.map((l) => {
    const o = l.owner_id ? contacts.get(l.owner_id) : undefined
    return [
      l.address,
      l.deal === 'rent' ? 'Rent' : l.deal === 'sale' ? 'Sale' : '',
      s(l.type),
      l.price,
      l.built_up_sqft,
      l.land_sqft,
      l.bedrooms,
      l.bathrooms,
      s(l.furnishing),
      s(l.tenure),
      LISTING_STATUS_LABEL[l.status],
      s(o?.name),
      s(o?.phone),
      s(l.viewing_access),
      s(l.note),
    ]
  })
  return { columns, rows, pdfColumns: ['Full Address', 'Sale / Rent', 'Type', 'Price', 'Built-up', 'Land', 'Bed', 'Bath', 'Status', 'Owner', 'Owner Phone'] }
}

export function contactTable(contacts: Contact[], listings: Listing[], leads: Lead[]): Table {
  const columns = ['Name', 'Phone', 'Race', 'Role', 'Listings Owned', 'Enquiries', 'Notes']
  const rows = contacts.map((c) => [
    c.name,
    s(c.phone),
    s(c.race),
    c.roles.map((r) => CONTACT_ROLE_LABEL[r]).join(', '),
    listings.filter((l) => l.owner_id === c.id).length,
    leads.filter((l) => l.contact_id === c.id).length,
    s(c.note),
  ])
  return { columns, rows, pdfColumns: ['Name', 'Phone', 'Race', 'Role', 'Listings Owned', 'Enquiries', 'Notes'] }
}

function fileName(kind: Kind, ext: string) {
  return `${OWNER_NAME} ${kind} ${todayISO()}.${ext}`
}

const MONEY_COLS = new Set(['Budget From', 'Budget Up To', 'Price'])
const SQFT_COLS = new Set(['Built-up', 'Land'])

export async function exportExcel(kind: Kind, t: Table, write?: (wb: import('xlsx').WorkBook, name: string) => void) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([t.columns, ...t.rows.map((r) => r.map((v) => (v == null ? '' : v)))])
  ws['!cols'] = t.columns.map((c, i) => ({
    wch: Math.min(48, Math.max(c.length + 2, ...t.rows.slice(0, 200).map((r) => s(r[i]).length + 2))),
  }))
  // Money columns shown as RM 680,000
  t.columns.forEach((c, ci) => {
    if (!MONEY_COLS.has(c)) return
    for (let ri = 0; ri < t.rows.length; ri++) {
      const cell = ws[XLSX.utils.encode_cell({ r: ri + 1, c: ci })]
      if (cell && typeof cell.v === 'number') cell.z = '"RM "#,##0'
    }
  })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, kind)
  ;(write ?? XLSX.writeFile)(wb, fileName(kind, 'xlsx'))
}

let fontB64: Promise<string> | null = null
function loadFont(): Promise<string> {
  fontB64 ??= fetch('/fonts/NotoSansSC-Subset.ttf')
    .then((r) => {
      if (!r.ok) throw new Error('font')
      return r.arrayBuffer()
    })
    .then((buf) => {
      const bytes = new Uint8Array(buf)
      let bin = ''
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      return btoa(bin)
    })
  fontB64.catch(() => (fontB64 = null))
  return fontB64
}

const HERO = [
  [255, 216, 196],
  [249, 202, 219],
  [217, 205, 246],
  [195, 230, 242],
]

function heroColor(t: number): [number, number, number] {
  const seg = Math.min(2, Math.floor(t * 3))
  const local = t * 3 - seg
  const a = HERO[seg]
  const b = HERO[seg + 1]
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * local)) as [number, number, number]
}

export async function exportPdf(kind: Kind, t: Table, save?: (doc: import('jspdf').jsPDF, name: string) => void) {
  const [{ jsPDF }, { default: autoTable }, font] = await Promise.all([import('jspdf'), import('jspdf-autotable'), loadFont()])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.addFileToVFS('NotoSansSC.ttf', font)
  doc.addFont('NotoSansSC.ttf', 'NotoSansSC', 'normal')
  doc.addFont('NotoSansSC.ttf', 'NotoSansSC', 'bold')
  doc.setFont('NotoSansSC', 'normal')

  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const idx = t.pdfColumns.map((c) => t.columns.indexOf(c))
  const fmt = (col: string, v: Cell) => {
    if (v == null || v === '') return ''
    if (typeof v === 'number') return MONEY_COLS.has(col) ? `RM ${fmtNumber(v)}` : SQFT_COLS.has(col) ? `${fmtNumber(v)} sqft` : fmtNumber(v)
    return v
  }
  const body = t.rows.map((r) => idx.map((i, k) => fmt(t.pdfColumns[k], r[i])))
  const subtitle = `${OWNER_NAME} · ${REN} · ${fmtLongDate().replace(/^\w+, /, '')} · ${t.rows.length} ${t.rows.length === 1 ? 'record' : 'records'}`
  const TOTAL = '{total_pages}'

  autoTable(doc, {
    head: [t.pdfColumns],
    body,
    startY: 30,
    margin: { top: 30, left: 10, right: 10, bottom: 14 },
    styles: { font: 'NotoSansSC', fontStyle: 'normal', fontSize: 8, cellPadding: 2, textColor: [37, 34, 58], lineColor: [236, 232, 240], lineWidth: 0.2, overflow: 'linebreak' },
    headStyles: { fillColor: [239, 234, 251], textColor: [59, 50, 112], fontStyle: 'normal' },
    alternateRowStyles: { fillColor: [248, 246, 244] },
    didDrawPage: () => {
      const strips = 80
      for (let i = 0; i < strips; i++) {
        doc.setFillColor(...heroColor(i / (strips - 1)))
        doc.rect((W / strips) * i, 0, W / strips + 0.3, 22, 'F')
      }
      doc.setTextColor(37, 34, 58)
      doc.setFontSize(15)
      doc.text(kind, 10, 11)
      doc.setFontSize(9)
      doc.setTextColor(59, 50, 112)
      doc.text(subtitle, 10, 17)
      doc.setFontSize(8)
      doc.setTextColor(111, 118, 128)
      doc.text(`Page ${doc.getCurrentPageInfo().pageNumber} of ${TOTAL}`, W - 10, H - 6, { align: 'right' })
    },
  })
  doc.putTotalPages(TOTAL)
  if (save) save(doc, fileName(kind, 'pdf'))
  else doc.save(fileName(kind, 'pdf'))
}
