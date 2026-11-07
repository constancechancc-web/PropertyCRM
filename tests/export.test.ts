// Acceptance: exports contain exactly the rows shown (e.g. Contacts filtered to Chinese),
// and the PDF renders Chinese names with the embedded font.
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { contactTable, exportExcel, exportPdf } from '../src/lib/export'
import type { Contact } from '../src/lib/types'

const base = { created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', note: null, is_example: false }
const contacts: Contact[] = [
  { ...base, id: 'a', name: 'Max Lim', phone: '012-7119657', race: 'Chinese', roles: ['tenant'] },
  { ...base, id: 'b', name: 'Aisyah Rahman', phone: '013-552 1188', race: 'Malay', roles: ['buyer'] },
  { ...base, id: 'c', name: '陈先生', phone: '012-777 8888', race: 'Chinese', roles: ['buyer', 'owner'] },
  { ...base, id: 'd', name: 'No Race', phone: null, race: null, roles: [] },
]

afterEach(() => vi.restoreAllMocks())

describe('exports', () => {
  it('contacts filtered to Chinese export only those contacts', async () => {
    const shown = contacts.filter((c) => c.race === 'Chinese') // what the Contacts page passes when "Chinese" is selected
    const t = contactTable(shown, [], [])
    expect(t.columns).toEqual(['Name', 'Phone', 'Race', 'Role', 'Listings Owned', 'Enquiries', 'Notes'])
    expect(t.rows.map((r) => r[0])).toEqual(['Max Lim', '陈先生'])
    expect(t.rows.every((r) => r[2] === 'Chinese')).toBe(true)
    expect(t.rows[1][3]).toBe('Buyer, Owner')

    const XLSX = await import('xlsx')
    let wb!: import('xlsx').WorkBook
    let name = ''
    await exportExcel('Contacts', t, (w, n) => ((wb = w), (name = n)))
    expect(name).toMatch(/^Constance Chan Contacts \d{4}-\d{2}-\d{2}\.xlsx$/)
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets.Contacts)
    expect(rows.map((r) => r.Name)).toEqual(['Max Lim', '陈先生'])
  })

  it('builds an A4 landscape PDF with the Chinese font', async () => {
    const font = readFileSync('public/fonts/NotoSansSC-Subset.ttf')
    vi.stubGlobal('fetch', async () => new Response(font))
    let saved: { name: string; pages: number; w: number; h: number; fonts: string[] } | null = null
    await exportPdf('Contacts', contactTable(contacts, [], []), (doc, name) => {
      saved = { name, pages: doc.getNumberOfPages(), w: doc.internal.pageSize.getWidth(), h: doc.internal.pageSize.getHeight(), fonts: Object.keys(doc.getFontList()) }
    })
    expect(saved).not.toBeNull()
    expect(saved!.name).toMatch(/^Constance Chan Contacts \d{4}-\d{2}-\d{2}\.pdf$/)
    expect(Math.round(saved!.w)).toBe(297)
    expect(Math.round(saved!.h)).toBe(210)
    expect(saved!.fonts).toContain('NotoSansSC')
  })
})
