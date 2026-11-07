import { useState } from 'react'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { useIsAdmin } from '../data/auth'
import type { Kind, Table } from '../lib/export'
import { Button } from './ui'
import { headerBtn } from './Shell'
import { useToast } from './Toast'

/** Admin only. Exports exactly the rows passed in (the current search and filters). */
export function ExportButtons({ kind, build }: { kind: Kind; build: () => Table }) {
  const admin = useIsAdmin()
  const toast = useToast()
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null)
  if (!admin) return null
  const run = async (type: 'xlsx' | 'pdf') => {
    setBusy(type)
    try {
      const mod = await import('../lib/export')
      const t = build()
      await (type === 'xlsx' ? mod.exportExcel(kind, t) : mod.exportPdf(kind, t))
      toast(`Exported ${t.rows.length} ${t.rows.length === 1 ? 'record' : 'records'}`)
    } catch (e) {
      console.error(e)
      toast("Couldn't export. Try again.", 'error')
    }
    setBusy(null)
  }
  return (
    <>
      <Button size="sm" className={headerBtn} disabled={!!busy} icon={<FileSpreadsheet size={16} strokeWidth={1.5} />} onClick={() => run('xlsx')}>
        {busy === 'xlsx' ? 'Exporting…' : 'Export Excel'}
      </Button>
      <Button size="sm" className={headerBtn} disabled={!!busy} icon={<FileText size={16} strokeWidth={1.5} />} onClick={() => run('pdf')}>
        {busy === 'pdf' ? 'Exporting…' : 'Export PDF'}
      </Button>
    </>
  )
}
