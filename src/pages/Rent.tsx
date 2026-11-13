import { useMemo, useState } from 'react'
import { CalendarCheck, Copy, MessageCircle, Pencil, Plus, Trash2, Undo2 } from 'lucide-react'
import { PageShell } from '../components/Shell'
import { Sheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { Avatar, Button, Card, Chip, ChoicePills, ConfirmButton, DetailGrid, Dot, Empty, LinkButton, Pill, PillRow, SearchBox, SectionTitle, TextInput } from '../components/ui'
import { useIsAdmin } from '../data/auth'
import { useStore } from '../data/store'
import { BANKS } from '../lib/constants'
import { fmtDate, fmtNumber, monthName, monthYear, rmFull, waLink } from '../lib/format'
import { isDueSoon, isPaid, periodLabel, rentMessage, rentStatus, tenancyEnd, tenancyMonths, type RentStatus } from '../lib/logic'
import { useSheet } from '../lib/useSheet'
import type { Tenancy } from '../lib/types'

const PERIODS = [
  { value: '6', label: '6 Months' },
  { value: '12', label: '1 Year' },
  { value: '24', label: '2 Years' },
  { value: '36', label: '3 Years' },
  { value: 'other', label: 'Other' },
]

type Filter = 'active' | 'due' | 'ending' | 'ended' | 'all'

export function RentLine({ s }: { s: RentStatus }) {
  return (
    <span className="tnum flex items-center gap-1.5 text-[12.5px] text-text-2">
      <Dot tone={s.tone === 'plain' ? 'none' : s.tone} />
      {s.text}
    </span>
  )
}

export default function Rent() {
  const { db, today } = useStore()
  const { params, open, close, setFilter } = useSheet()
  const [q, setQ] = useState('')
  const filter = (params.get('show') ?? 'active') as Filter

  const withStatus = useMemo(() => db.tenancies.map((t) => ({ t, s: rentStatus(t, db.tenancy_payments, today) })), [db.tenancies, db.tenancy_payments, today])
  const dueCount = withStatus.filter((x) => x.s.kind !== 'ended' && isDueSoon(x.s)).length

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return withStatus
      .filter(({ s: st }) => {
        if (filter === 'active') return st.kind !== 'ended'
        if (filter === 'due') return st.kind !== 'ended' && isDueSoon(st)
        if (filter === 'ending') return st.endingSoon
        if (filter === 'ended') return st.kind === 'ended'
        return true
      })
      .filter(({ t }) => !s || [t.tenant_name, t.address, t.phone, t.account_holder].join(' ').toLowerCase().includes(s))
      .sort((a, b) => {
        const rank = (x: RentStatus) => (x.kind === 'overdue' ? 0 : x.kind === 'dueToday' ? 1 : x.kind === 'due' ? 2 : x.kind === 'paid' ? 3 : 4)
        const r = rank(a.s) - rank(b.s)
        return r !== 0 ? r : (a.s.days ?? 99) - (b.s.days ?? 99)
      })
  }, [withStatus, filter, q])

  const id = params.get('id')
  const tenancy = id ? db.tenancies.find((t) => t.id === id) : undefined
  const editing = !!params.get('edit')
  const creating = !!params.get('new')

  const pills: [Filter, string][] = [
    ['active', 'Active'],
    ['due', `Due Soon (${dueCount})`],
    ['ending', 'Ending Within 60 Days'],
    ['ended', 'Ended'],
    ['all', 'All'],
  ]

  return (
    <PageShell
      title="Tenancy Reminders"
      sub="Monthly rental reminders for your tenants"
      actions={
        <Button size="sm" variant="primary" icon={<Plus size={16} strokeWidth={1.5} />} onClick={() => open({ new: '1' })}>
          New Tenancy
        </Button>
      }
    >
      <Card className="flex flex-col gap-4 p-4 md:p-6">
        <SearchBox value={q} onChange={setQ} placeholder="Search tenant, address, phone" />
        <PillRow label="Show">
          {pills.map(([v, l]) => (
            <Pill key={v} active={filter === v} onClick={() => setFilter('show', v === 'active' ? null : v)}>
              {l}
            </Pill>
          ))}
        </PillRow>
      </Card>

      <Card className="mt-4 overflow-hidden">
        {shown.length ? (
          <ul className="divide-y divide-line">
            {shown.map(({ t, s }) => (
              <li key={t.id}>
                <button type="button" onClick={() => open({ id: t.id })} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-page md:px-6">
                  <Avatar id={t.id} name={t.tenant_name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[16px] font-medium">{t.tenant_name}</div>
                    <div className="line-clamp-2 text-[13.5px] text-text-2 md:truncate">{t.address}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="tnum text-[15px] font-semibold">{t.rent != null ? `RM ${fmtNumber(t.rent)} /mo` : '–'}</span>
                    <RentLine s={s} />
                    {s.endingSoon && t.end_date && <span className="text-[12px] text-text-3">Ends {fmtDate(t.end_date)}</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            action={
              <Button variant="primary" icon={<Plus size={16} strokeWidth={1.5} />} onClick={() => open({ new: '1' })}>
                New Tenancy
              </Button>
            }
          >
            {db.tenancies.length ? 'No tenancies match this search or filter.' : 'No tenancies yet. Add a tenancy to send monthly rent reminders in one tap.'}
          </Empty>
        )}
      </Card>

      <Sheet open={!!tenancy && !editing} onClose={close} title="Tenancy" wide>
        {tenancy && <TenancyDetail tenancy={tenancy} />}
      </Sheet>
      <Sheet open={!!tenancy && editing} onClose={() => open({ id: tenancy!.id })} title="Edit Tenancy">
        {tenancy && <TenancyForm key={tenancy.id} tenancy={tenancy} onDone={() => open({ id: tenancy.id })} />}
      </Sheet>
      <Sheet open={creating} onClose={close} title="New Tenancy">
        {creating && <TenancyForm onDone={(newId) => (newId ? open({ id: newId }, true) : close())} />}
      </Sheet>
    </PageShell>
  )
}

function TenancyDetail({ tenancy: t }: { tenancy: Tenancy }) {
  const { db, today, setPaid, remove } = useStore()
  const { open, close } = useSheet()
  const toast = useToast()
  const admin = useIsAdmin()
  const s = rentStatus(t, db.tenancy_payments, today)
  const message = rentMessage(t)
  const paid = isPaid(db.tenancy_payments, t.id, s.month)
  const month = monthName(s.month)
  const paidMonths = db.tenancy_payments
    .filter((p) => p.tenancy_id === t.id && p.paid)
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 8)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      toast('Message copied. Paste it in WhatsApp.')
    } catch {
      toast("Couldn't copy. Select the message below and copy it.", 'error')
    }
  }

  const togglePaid = async () => {
    if (await setPaid(t.id, s.month, !paid)) toast(paid ? `Paid for ${monthYear(s.month)} undone` : `Marked paid for ${monthYear(s.month)}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <Avatar id={t.id} name={t.tenant_name} size={56} />
        <div className="min-w-0 flex-1">
          <div className="text-[22px] leading-tight font-semibold break-words">{t.tenant_name}</div>
          <div className="text-[15px] break-words text-text-2">{t.address}</div>
          <div className="mt-1.5">
            <RentLine s={s} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<Copy size={17} strokeWidth={1.5} />} onClick={copy}>
          Copy Message
        </Button>
        {t.phone && (
          <LinkButton href={waLink(t.phone, message)} icon={<MessageCircle size={17} strokeWidth={1.5} />}>
            Send On WhatsApp
          </LinkButton>
        )}
        {s.kind !== 'ended' && s.kind !== 'upcoming' && (
          <Button icon={paid ? <Undo2 size={17} strokeWidth={1.5} /> : <CalendarCheck size={17} strokeWidth={1.5} />} onClick={togglePaid}>
            {paid ? `Undo Paid For ${month}` : `Mark Paid For ${month}`}
          </Button>
        )}
        <Button icon={<Pencil size={17} strokeWidth={1.5} />} onClick={() => open({ id: t.id, edit: '1' })}>
          Edit
        </Button>
      </div>

      {s.endingSoon && t.end_date && (
        <p className="rounded-[18px] bg-butter px-4 py-3 text-[14px] text-butter-ink">
          Time to talk renewal: this tenancy ends on {fmtDate(t.end_date)} ({s.endsInDays} days from today).
        </p>
      )}

      <section className="flex flex-col gap-2">
        <SectionTitle>Message Preview</SectionTitle>
        <pre className="rounded-[18px] bg-page px-4 py-3 font-sans text-[14.5px] break-words whitespace-pre-wrap">{message}</pre>
      </section>

      <DetailGrid
        items={[
          ['WhatsApp Number', t.phone],
          ['Rental', t.rent != null ? `${rmFull(t.rent)} /mo` : null],
          ['Tenancy Starts', fmtDate(t.start_date)],
          ['Tenancy Period', (() => { const m = tenancyMonths(t.start_date, t.end_date); return m ? periodLabel(m) : null })()],
          ['Expires On', fmtDate(t.end_date)],
          ['Rent Payment Date', t.pay_day ? `Day ${t.pay_day} of each month` : null],
          ['This Month Due', fmtDate(s.dueDate)],
          ['Account Holder', t.account_holder],
          ['Bank', t.bank],
          ['Account Number', t.account_number],
        ]}
      />

      <section className="flex flex-col gap-2">
        <SectionTitle>Recent Paid Months</SectionTitle>
        {paidMonths.length ? (
          <div className="flex flex-wrap gap-1.5">
            {paidMonths.map((p) => (
              <Chip key={p.id} tone={1}>
                {monthYear(p.month)}
              </Chip>
            ))}
          </div>
        ) : (
          <p className="text-[14px] text-text-2">No months marked paid yet.</p>
        )}
      </section>

      {admin && (
        <ConfirmButton
          label="Delete Tenancy"
          icon={<Trash2 size={17} strokeWidth={1.5} />}
          question="Delete this tenancy and its payment history? This can't be undone."
          confirmLabel="Yes, Delete Tenancy"
          onConfirm={async () => {
            if (await remove('tenancies', t.id)) {
              toast('Tenancy deleted')
              close()
            }
          }}
        />
      )}
    </div>
  )
}

function TenancyForm({ tenancy, onDone }: { tenancy?: Tenancy; onDone: (id?: string) => void }) {
  const { insert, update } = useStore()
  const toast = useToast()
  const [v, setV] = useState({
    tenant_name: tenancy?.tenant_name ?? '',
    phone: tenancy?.phone ?? '',
    address: tenancy?.address ?? '',
    start_date: tenancy?.start_date ?? '',
    end_date: tenancy?.end_date ?? '',
    pay_day: tenancy?.pay_day?.toString() ?? '',
    rent: tenancy?.rent?.toString() ?? '',
    account_holder: tenancy?.account_holder ?? '',
    bank: tenancy?.bank ?? '',
    account_number: tenancy?.account_number ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof v, val: string) => setV((p) => ({ ...p, [k]: val }))

  // Tenancy period: pick 6 months / 1, 2, 3 years or type the months; the expiry date is worked out.
  const existingMonths = tenancyMonths(tenancy?.start_date ?? null, tenancy?.end_date ?? null)
  const [period, setPeriod] = useState<string>(() =>
    existingMonths ? (PERIODS.some((p) => p.value === String(existingMonths)) ? String(existingMonths) : 'other') : tenancy?.end_date ? '' : '12',
  )
  const [otherMonths, setOtherMonths] = useState(existingMonths && !PERIODS.some((p) => p.value === String(existingMonths)) ? String(existingMonths) : '')
  const months = period === 'other' ? parseInt(otherMonths, 10) : period ? parseInt(period, 10) : NaN
  const validMonths = Number.isFinite(months) && months >= 1 && months <= 120
  // An older tenancy whose end date isn't a whole number of months keeps its date until a period is picked.
  const endDate = v.start_date && validMonths ? tenancyEnd(v.start_date, months) : !period ? v.end_date : ''

  const setStart = (d: string) => {
    setV((p) => ({ ...p, start_date: d, pay_day: p.pay_day || (d ? String(Number(d.slice(8, 10))) : '') }))
  }

  const save = async () => {
    if (!v.tenant_name.trim()) return setError("Add the tenant's name.")
    const day = v.pay_day ? parseInt(v.pay_day, 10) : null
    if (day != null && (!(day >= 1) || day > 31)) return setError('Rent payment date must be a day between 1 and 31.')
    if (period === 'other' && !validMonths) return setError('Type the tenancy period in months, from 1 to 120.')
    const rent = parseFloat(v.rent.replace(/[^\d.]/g, ''))
    setBusy(true)
    const row: Partial<Tenancy> = {
      tenant_name: v.tenant_name.trim(),
      phone: v.phone.trim() || null,
      address: v.address.replace(/\s*\n\s*/g, ', ').trim() || null,
      start_date: v.start_date || null,
      end_date: endDate || null,
      pay_day: day,
      rent: Number.isFinite(rent) ? rent : null,
      account_holder: v.account_holder.trim() || null,
      bank: v.bank.trim() || null,
      account_number: v.account_number.replace(/\s+/g, '') || null,
    }
    if (tenancy) {
      const ok = await update('tenancies', tenancy.id, row)
      setBusy(false)
      if (ok) {
        toast('Changes saved')
        onDone(tenancy.id)
      }
      return
    }
    const saved = await insert('tenancies', { ...row, is_example: false })
    setBusy(false)
    if (saved) {
      toast('Tenancy added')
      onDone(saved.id)
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <TextInput label="Tenant Name" value={v.tenant_name} onChange={(e) => set('tenant_name', e.target.value)} autoComplete="off" />
      <TextInput label="WhatsApp Number" inputMode="tel" value={v.phone} onChange={(e) => set('phone', e.target.value)} placeholder="012-345 6789" autoComplete="off" />
      <TextInput label="Address" value={v.address} onChange={(e) => set('address', e.target.value)} />
      <TextInput label="Tenancy Starts" type="date" value={v.start_date} onChange={(e) => setStart(e.target.value)} />
      <div className="flex flex-col gap-3">
        <ChoicePills label="Tenancy Period" options={PERIODS} value={period || null} onChange={(p) => setPeriod((p as string) ?? '')} />
        {period === 'other' && (
          <TextInput label="Number Of Months" inputMode="numeric" value={otherMonths} onChange={(e) => setOtherMonths(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 18" />
        )}
        <div className="flex items-center gap-3 rounded-[18px] bg-brand-soft px-4 py-3 text-[15px] text-brand-ink">
          <CalendarCheck size={18} strokeWidth={1.5} className="shrink-0" />
          {endDate ? (
            <span>
              Expires on <span className="font-semibold">{fmtDate(endDate)}</span>
              {validMonths ? ` (${periodLabel(months)})` : ''}
            </span>
          ) : (
            <span>{v.start_date ? 'Pick the tenancy period to see the expiry date.' : 'Pick the start date and period to see the expiry date.'}</span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="Rent Payment Date" inputMode="numeric" value={v.pay_day} onChange={(e) => set('pay_day', e.target.value)} placeholder="e.g. 20" hint="Day of the month" />
        <TextInput label="Rental (RM per month)" inputMode="decimal" value={v.rent} onChange={(e) => set('rent', e.target.value)} />
      </div>
      <fieldset className="flex flex-col gap-4 rounded-[18px] border border-line p-4">
        <legend className="px-1 text-[14px] font-medium text-text-2">Owner Bank Account</legend>
        <TextInput label="Account Holder Name" value={v.account_holder} onChange={(e) => set('account_holder', e.target.value)} />
        <TextInput label="Bank" list="banks" value={v.bank} onChange={(e) => set('bank', e.target.value)} hint="Pick from the list or type any bank." />
        <datalist id="banks">
          {BANKS.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
        <TextInput label="Account Number" inputMode="numeric" value={v.account_number} onChange={(e) => set('account_number', e.target.value)} />
      </fieldset>
      {error && (
        <p role="alert" className="rounded-[18px] bg-rose px-4 py-3 text-[14px] text-rose-ink">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={busy} className="flex-1 sm:flex-none">
          {tenancy ? 'Save Changes' : 'Save Tenancy'}
        </Button>
        <Button onClick={() => onDone(tenancy?.id)}>Cancel</Button>
      </div>
    </form>
  )
}
