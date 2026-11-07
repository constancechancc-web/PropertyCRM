import { useMemo, useState, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, CircleCheckBig, CircleX, Pencil, Plus, Target, Trash2, Undo2, Wallet } from 'lucide-react'
import { PageShell } from '../components/Shell'
import { Sheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { ContactPicker, resolveContact, type ContactChoice } from '../components/ContactPicker'
import { Avatar, Barcode, Button, Card, Chip, ChoicePills, ConfirmButton, DetailGrid, Dot, Empty, IconWell, Pill, PillRow, SearchBox, SectionTitle, SelectInput, TextArea, TextInput, cx } from '../components/ui'
import { useIsAdmin } from '../data/auth'
import { useContactMap, useStore } from '../data/store'
import { DEAL_STATUSES, DEAL_STATUS_LABEL, GONE_REASONS, JB_AREAS, PROPERTY_TYPES } from '../lib/constants'
import { fmtDate, fmtNumber, pct, rmFull, shortAmount } from '../lib/format'
import { change, closeRates, lostReasons, mix, monthly, previousMonth, summarize, unclaimedTotal, yearToDate, type Period } from '../lib/sales'
import { useSheet } from '../lib/useSheet'
import type { Deal, DealStatus, Lead, Listing, SaleDeal } from '../lib/types'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const STATUS_TONE: Record<DealStatus, 'plain' | 'good' | 'bad' | 'warn'> = { forecast: 'warn', converted: 'good', gone: 'bad', claimed: 'good' }
const rm = (n: number) => `RM ${shortAmount(n)}`

export default function Sales() {
  const admin = useIsAdmin()
  if (!admin) return <Navigate to="/today" replace />
  return <SalesPage />
}

function SalesPage() {
  const { db, today } = useStore()
  const { params, open, close, setFilter } = useSheet()
  const view = params.get('view') ?? 'dashboard'
  const thisYear = Number(today.slice(0, 4))
  const year = Number(params.get('year') ?? thisYear)
  const monthParam = params.get('month')
  const month = monthParam === 'all' ? null : Number(monthParam ?? today.slice(5, 7))
  const period: Period = { year, month }

  const years = useMemo(() => {
    const ys = new Set<number>([thisYear, thisYear - 1])
    for (const d of db.deals) for (const x of [d.forecast_date, d.converted_date, d.gone_date, d.claimed_date]) if (x) ys.add(Number(x.slice(0, 4)))
    return [...ys].sort((a, b) => b - a)
  }, [db.deals, thisYear])

  const id = params.get('id')
  const deal = id ? db.deals.find((d) => d.id === id) : undefined
  const editing = !!params.get('edit')
  const creating = !!params.get('new')

  return (
    <PageShell
      label="Deals and commission"
      title="Sales"
      sub={`${db.deals.filter((d) => d.status === 'forecast').length} in forecast · ${rm(unclaimedTotal(db.deals))} waiting to be claimed`}
      actions={
        <Button size="sm" variant="primary" icon={<Plus size={16} strokeWidth={1.5} />} onClick={() => open({ new: '1' })}>
          New Deal
        </Button>
      }
    >
      <Card className="flex flex-col gap-4 p-4 md:p-6">
        <PillRow label="View">
          <Pill active={view === 'dashboard'} onClick={() => setFilter('view', null)}>
            Dashboard
          </Pill>
          <Pill active={view === 'deals'} count={db.deals.length} onClick={() => setFilter('view', 'deals')}>
            Deals
          </Pill>
        </PillRow>
        {view === 'dashboard' && (
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <SelectInput label="Year" options={years.map((y) => String(y))} value={String(year)} onChange={(e) => setFilter('year', e.target.value === String(thisYear) ? null : e.target.value)} />
            <SelectInput
              label="Month"
              options={[{ value: 'all', label: 'Whole Year' }, ...MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))]}
              value={month == null ? 'all' : String(month)}
              onChange={(e) => setFilter('month', e.target.value)}
            />
          </div>
        )}
      </Card>

      {view === 'dashboard' ? <Dashboard deals={db.deals} period={period} today={today} /> : <DealList deals={db.deals} />}

      <Sheet open={!!deal && !editing} onClose={close} title="Deal" wide>
        {deal && <DealDetail deal={deal} />}
      </Sheet>
      <Sheet open={!!deal && editing} onClose={() => open({ id: deal!.id })} title="Edit Deal" wide>
        {deal && <DealForm key={deal.id} deal={deal} onDone={() => open({ id: deal.id })} />}
      </Sheet>
      <Sheet open={creating} onClose={close} title="New Deal" wide>
        {creating && <DealForm fromLead={params.get('lead')} fromListing={params.get('listing')} onDone={(newId) => (newId ? open({ id: newId }, true) : close())} />}
      </Sheet>
    </PageShell>
  )
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function Stat({ icon, tone, title, value, sub, children }: { icon: ReactNode; tone: number; title: string; value: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <Card as="article" className="flex min-w-0 flex-col gap-3 p-4 md:p-5">
      <div className="flex items-center gap-3">
        <IconWell tone={tone} size={40}>
          {icon}
        </IconWell>
        <h2 className="text-[15px] font-semibold">{title}</h2>
      </div>
      <div className="tnum text-[34px] leading-none font-light tracking-tight md:text-[40px]">{value}</div>
      {sub && <div className="text-[13.5px] text-text-2">{sub}</div>}
      {children}
    </Card>
  )
}

function HBar({ label, right, pct: p, color = 'bg-brand' }: { label: string; right: string; pct: number; color?: string }) {
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 text-[14px]">
        <span className="min-w-0 truncate">{label}</span>
        <span className="tnum shrink-0 text-text-2">{right}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-bar">
        <div className={cx('h-full rounded-full', color)} style={{ width: `${Math.max(2, Math.min(100, p))}%` }} />
      </div>
    </li>
  )
}

function Delta({ now, before, money }: { now: number; before: number; money?: boolean }) {
  const c = change(now, before)
  const fmt = (n: number) => (money ? rm(n) : fmtNumber(n))
  return (
    <div className="flex flex-col">
      <span className="tnum text-[22px] font-light">{fmt(now)}</span>
      <span className="flex items-center gap-1 text-[12.5px] text-text-2">
        {c == null ? (
          <>vs {fmt(before)}</>
        ) : (
          <>
            {c >= 0 ? <ArrowUpRight size={14} className="text-mint-ink" /> : <ArrowDownRight size={14} className="text-rose-ink" />}
            <span className={c >= 0 ? 'text-mint-ink' : 'text-rose-ink'}>{pct(Math.abs(Math.round(c)))}</span> vs {fmt(before)}
          </>
        )}
      </span>
    </div>
  )
}

function Dashboard({ deals, period, today }: { deals: SaleDeal[]; period: Period; today: string }) {
  const s = summarize(deals, period)
  const label = period.month ? `${MONTHS[period.month - 1]} ${period.year}` : String(period.year)
  const reasons = lostReasons(deals, period)
  const byType = mix(deals, period, (d) => d.property_type || 'Type not set')
  const byDeal = mix(deals, period, (d) => (d.deal === 'rent' ? 'Rent' : 'Sale'))
  const bestAreas = closeRates(deals, period, (d) => d.area?.trim() || 'Area not set').slice(0, 5)
  const bestTypes = closeRates(deals, period, (d) => d.property_type || 'Type not set').slice(0, 5)
  const months = monthly(deals, period.year)
  const maxMonth = Math.max(1, ...months.map((m) => Math.max(m.converted, m.gone, m.forecast)))

  const cm = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }
  const lm = previousMonth(cm)
  const thisM = summarize(deals, cm)
  const lastM = summarize(deals, lm)
  const ytd = yearToDate(deals, cm.year, today)
  const lytd = yearToDate(deals, cm.year - 1, today)

  if (!deals.length)
    return (
      <Card className="mt-4">
        <Empty>No deals yet. Add a deal when a buyer or tenant is likely to close, then move it to Converted, Gone or Claimed. The dashboard fills in from there.</Empty>
      </Card>
    )

  return (
    <div className="mt-4 flex flex-col gap-4">
      <h2 className="px-1 text-[15px] font-medium text-text-2">{label}</h2>

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Stat icon={<Target size={18} strokeWidth={1.5} />} tone={3} title="Forecast" value={fmtNumber(s.forecast.count)} sub={`${rm(s.forecast.commission)} commission expected`} />
        <Stat icon={<CircleCheckBig size={18} strokeWidth={1.5} />} tone={1} title="Converted" value={fmtNumber(s.converted.count)} sub={`${rm(s.converted.value)} in deals`} />
        <Stat icon={<CircleX size={18} strokeWidth={1.5} />} tone={5} title="Gone" value={fmtNumber(s.gone.count)} sub={reasons[0] ? `Mostly: ${reasons[0].reason}` : 'None lost'} />
        <Stat
          icon={<Target size={18} strokeWidth={1.5} />}
          tone={2}
          title="Conversion Rate"
          value={s.conversionRate == null ? '–' : pct(Math.round(s.conversionRate))}
          sub={s.conversionRate == null ? 'No deals decided yet' : `${s.converted.count} closed of ${s.converted.count + s.gone.count} decided`}
        >
          <Barcode label="Converted vs gone" total={s.converted.count + s.gone.count} segments={[{ value: s.converted.count, color: 'good' }, { value: s.gone.count, color: 'bad' }]} />
        </Stat>
      </div>

      <Card className="flex flex-col gap-4 p-5 md:p-6">
        <SectionTitle>Commission</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          {[
            ['Earned', s.converted.commission, 'none'],
            ['Claimed', s.claimed.amount, 'good'],
            ['Still Pending', s.pending, 'warn'],
          ].map(([l, v, t]) => (
            <div key={l as string} className="min-w-0">
              <div className="flex items-center gap-1.5 text-[13px] text-text-2">
                <Dot tone={t as 'good' | 'warn' | 'none'} />
                {l}
              </div>
              <div className="tnum truncate text-[22px] font-light md:text-[28px]">{rm(v as number)}</div>
            </div>
          ))}
        </div>
        <Barcode
          label="Commission claimed vs pending"
          total={s.converted.commission}
          segments={[
            { value: s.converted.commission - s.pending, color: 'good' },
            { value: s.pending, color: 'warn' },
          ]}
        />
        <p className="text-[13.5px] text-text-2">
          Earned = commission on deals converted in {label}. All commission still waiting to be claimed: <span className="tnum font-medium text-ink">{rmFull(unclaimedTotal(deals))}</span>
        </p>
      </Card>

      <Card className="flex flex-col gap-4 p-5 md:p-6">
        <SectionTitle>Month By Month · {period.year}</SectionTitle>
        <div className="flex items-end justify-between gap-1" style={{ height: 120 }} role="img" aria-label={`Deals per month in ${period.year}`}>
          {months.map((m) => (
            <div key={m.month} className={cx('flex h-full flex-1 flex-col items-center justify-end gap-1', period.month === m.month && 'rounded-[10px] bg-brand-soft/60')}>
              <div className="flex h-[96px] items-end gap-[2px]">
                {[
                  [m.forecast, 'bg-warn'],
                  [m.converted, 'bg-good'],
                  [m.gone, 'bg-bad'],
                ].map(([v, c], i) => (
                  <span key={i} className={cx('w-[4px] rounded-full md:w-[6px]', (v as number) ? (c as string) : 'bg-bar')} style={{ height: `${Math.max(4, ((v as number) / maxMonth) * 96)}px` }} />
                ))}
              </div>
              <span className="text-[11px] text-text-3">{MONTHS[m.month - 1].slice(0, 3)}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 text-[13px] text-text-2">
          <span className="flex items-center gap-1.5">
            <Dot tone="warn" /> Forecast
          </span>
          <span className="flex items-center gap-1.5">
            <Dot tone="good" /> Converted
          </span>
          <span className="flex items-center gap-1.5">
            <Dot tone="bad" /> Gone
          </span>
        </div>
        <ul className="divide-y divide-line rounded-[18px] border border-line text-[14px]">
          {months
            .filter((m) => m.forecast || m.converted || m.gone || m.claimed)
            .map((m) => (
              <li key={m.month} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5">
                <span className="w-24 font-medium">{MONTHS[m.month - 1]}</span>
                <span className="tnum text-text-2">
                  {m.forecast} forecast · {m.converted} converted · {m.gone} gone
                </span>
                <span className="tnum">
                  {rm(m.earned)} earned · {rm(m.claimed)} claimed
                </span>
              </li>
            ))}
        </ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-4 p-5 md:p-6">
          <SectionTitle>Why Deals Were Lost</SectionTitle>
          {reasons.length ? (
            <ul className="flex flex-col gap-3">
              {reasons.map((r) => (
                <HBar key={r.reason} label={r.reason} right={`${r.count} · ${pct(Math.round((r.count / s.gone.count) * 100))}`} pct={(r.count / s.gone.count) * 100} color="bg-bad" />
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-text-2">No deals lost in {label}.</p>
          )}
        </Card>

        <Card className="flex flex-col gap-4 p-5 md:p-6">
          <SectionTitle>Mix Of Converted Deals</SectionTitle>
          {byType.length ? (
            <>
              <ul className="flex flex-col gap-3">
                {byDeal.map((m) => (
                  <HBar key={m.label} label={m.label} right={`${m.count} · ${pct(Math.round(m.pct))}`} pct={m.pct} color={m.label === 'Rent' ? 'bg-sky-ink/60' : 'bg-peach-ink/60'} />
                ))}
              </ul>
              <ul className="flex flex-col gap-3">
                {byType.map((m) => (
                  <HBar key={m.label} label={m.label} right={`${m.count} · ${pct(Math.round(m.pct))}`} pct={m.pct} />
                ))}
              </ul>
            </>
          ) : (
            <p className="text-[14px] text-text-2">No converted deals in {label}.</p>
          )}
        </Card>
      </div>

      <Card className="flex flex-col gap-5 p-5 md:p-6">
        <SectionTitle>How You're Improving</SectionTitle>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <div className="text-[13px] text-text-3">Converted, {MONTHS[cm.month - 1]}</div>
            <Delta now={thisM.converted.count} before={lastM.converted.count} />
          </div>
          <div>
            <div className="text-[13px] text-text-3">Earned, {MONTHS[cm.month - 1]}</div>
            <Delta now={thisM.converted.commission} before={lastM.converted.commission} money />
          </div>
          <div>
            <div className="text-[13px] text-text-3">Converted, {cm.year} so far</div>
            <Delta now={ytd.converted.count} before={lytd.converted.count} />
          </div>
          <div>
            <div className="text-[13px] text-text-3">Earned, {cm.year} so far</div>
            <Delta now={ytd.converted.commission} before={lytd.converted.commission} money />
          </div>
        </div>
        <p className="text-[13px] text-text-3">
          Month figures compare with {MONTHS[lm.month - 1]} {lm.year}; year figures compare with the same dates in {cm.year - 1}.
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-[14px] text-text-2">Average days to close in {label}:</span>
          <span className="tnum text-[22px] font-light">{s.avgDaysToClose == null ? '–' : `${s.avgDaysToClose} days`}</span>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <h3 className="text-[14px] font-medium">Areas That Close Best</h3>
            {bestAreas.length ? (
              <ul className="flex flex-col gap-3">
                {bestAreas.map((a) => (
                  <HBar key={a.label} label={a.label} right={`${pct(Math.round(a.rate))} · ${a.won} of ${a.decided}`} pct={a.rate} color="bg-good" />
                ))}
              </ul>
            ) : (
              <p className="text-[13.5px] text-text-2">Shows once an area has at least 2 decided deals in {label}.</p>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="text-[14px] font-medium">Property Types That Close Best</h3>
            {bestTypes.length ? (
              <ul className="flex flex-col gap-3">
                {bestTypes.map((a) => (
                  <HBar key={a.label} label={a.label} right={`${pct(Math.round(a.rate))} · ${a.won} of ${a.decided}`} pct={a.rate} color="bg-good" />
                ))}
              </ul>
            ) : (
              <p className="text-[13.5px] text-text-2">Shows once a type has at least 2 decided deals in {label}.</p>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Deals list
// ---------------------------------------------------------------------------

function dealDate(d: SaleDeal): string {
  if (d.status === 'claimed') return `Claimed ${fmtDate(d.claimed_date)}`
  if (d.status === 'converted') return `Converted ${fmtDate(d.converted_date)}`
  if (d.status === 'gone') return `Gone ${fmtDate(d.gone_date)}`
  return d.expected_date ? `Expected ${fmtDate(d.expected_date)}` : `Added ${fmtDate(d.forecast_date)}`
}

function DealList({ deals }: { deals: SaleDeal[] }) {
  const contacts = useContactMap()
  const { params, open, setFilter } = useSheet()
  const [q, setQ] = useState('')
  const status = params.get('status') ?? 'forecast'
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return deals
      .filter((d) => status === 'all' || d.status === status)
      .filter((d) => !s || [contacts.get(d.contact_id ?? '')?.name, d.area, d.address, d.property_type, d.note, d.gone_reason].join(' ').toLowerCase().includes(s))
      .sort((a, b) => (b.converted_date ?? b.gone_date ?? b.forecast_date).localeCompare(a.converted_date ?? a.gone_date ?? a.forecast_date))
  }, [deals, status, q, contacts])

  return (
    <>
      <Card className="mt-4 flex flex-col gap-4 p-4 md:p-6">
        <SearchBox value={q} onChange={setQ} placeholder="Search client, area, type, notes" />
        <PillRow label="Status">
          {[...DEAL_STATUSES, 'all' as const].map((st) => (
            <Pill key={st} active={status === st} count={st === 'all' ? deals.length : deals.filter((d) => d.status === st).length} onClick={() => setFilter('status', st === 'forecast' ? null : st)}>
              {st === 'all' ? 'All' : DEAL_STATUS_LABEL[st]}
            </Pill>
          ))}
        </PillRow>
      </Card>
      <Card className="mt-4 overflow-hidden">
        {shown.length ? (
          <ul className="divide-y divide-line">
            {shown.map((d) => {
              const c = d.contact_id ? contacts.get(d.contact_id) : undefined
              return (
                <li key={d.id}>
                  <button type="button" onClick={() => open({ id: d.id })} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-page md:px-6">
                    <Avatar id={c?.id ?? d.id} name={c?.name ?? d.area ?? '?'} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[16px] font-medium">{c?.name ?? d.address ?? 'Deal'}</div>
                      <div className="line-clamp-2 text-[13.5px] text-text-2">
                        {[d.deal === 'rent' ? 'Rent' : 'Sale', d.property_type, d.area].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="tnum text-[15px] font-semibold">{d.commission != null ? rm(d.commission) : '–'}</span>
                      <span className="flex items-center gap-1.5 text-[12.5px] text-text-2">
                        <Dot tone={STATUS_TONE[d.status]} />
                        {DEAL_STATUS_LABEL[d.status]}
                      </span>
                      <span className="hidden text-[12px] text-text-3 sm:block">{dealDate(d)}</span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <Empty
            action={
              <Button variant="primary" icon={<Plus size={16} strokeWidth={1.5} />} onClick={() => open({ new: '1' })}>
                New Deal
              </Button>
            }
          >
            {deals.length ? 'No deals match this search or filter.' : 'No deals yet. Add one when a buyer or tenant is likely to close.'}
          </Empty>
        )}
      </Card>
    </>
  )
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

function DealDetail({ deal: d }: { deal: SaleDeal }) {
  const { db, today, update, remove } = useStore()
  const contacts = useContactMap()
  const { open, close } = useSheet()
  const nav = useNavigate()
  const toast = useToast()
  const c = d.contact_id ? contacts.get(d.contact_id) : undefined
  const listing = d.listing_id ? db.listings.find((l) => l.id === d.listing_id) : undefined
  const [action, setAction] = useState<'convert' | 'gone' | 'claim' | null>(null)
  const [date, setDate] = useState(today)
  const [reason, setReason] = useState<string | null>(null)
  const [amount, setAmount] = useState(String(d.commission ?? ''))

  const save = async (patch: Partial<SaleDeal>, msg: string) => {
    if (await update('deals', d.id, patch)) {
      toast(msg)
      setAction(null)
    }
  }
  const start = (a: 'convert' | 'gone' | 'claim') => {
    setAction(a)
    setDate(today)
    setReason(null)
    setAmount(String(d.commission ?? ''))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={d.deal === 'rent' ? 4 : 0}>{d.deal === 'rent' ? 'Rent' : 'Sale'}</Chip>
          {d.property_type && <Chip>{d.property_type}</Chip>}
          <span className="flex items-center gap-1.5 text-[14px] text-text-2">
            <Dot tone={STATUS_TONE[d.status]} />
            {DEAL_STATUS_LABEL[d.status]}
          </span>
        </div>
        <div className="tnum text-[40px] leading-none font-light tracking-tight">{d.commission != null ? rmFull(d.commission) : 'No commission set'}</div>
        <div className="text-[14px] text-text-2">
          Commission{d.price != null ? ` on ${d.deal === 'rent' ? `${rmFull(d.price)} /mo` : rmFull(d.price)}` : ''}
          {d.status === 'claimed' && d.claimed_amount != null ? ` · claimed ${rmFull(d.claimed_amount)}` : ''}
        </div>
        {c && (
          <button type="button" onClick={() => nav(`/contacts?id=${c.id}`)} className="mt-1 flex items-center gap-3 text-left">
            <Avatar id={c.id} name={c.name} size={40} />
            <span>
              <span className="block text-[16px] font-medium">{c.name}</span>
              <span className="tnum block text-[13.5px] text-text-2">{c.phone}</span>
            </span>
          </button>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <SectionTitle>Move This Deal</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {d.status === 'forecast' && (
            <>
              <Button variant="primary" icon={<CircleCheckBig size={17} strokeWidth={1.5} />} onClick={() => start('convert')}>
                Mark Converted
              </Button>
              <Button icon={<CircleX size={17} strokeWidth={1.5} />} onClick={() => start('gone')}>
                Mark Gone
              </Button>
            </>
          )}
          {d.status === 'converted' && (
            <>
              <Button variant="primary" icon={<Wallet size={17} strokeWidth={1.5} />} onClick={() => start('claim')}>
                Mark Claimed
              </Button>
              <Button icon={<Undo2 size={17} strokeWidth={1.5} />} onClick={() => save({ status: 'forecast', converted_date: null }, 'Moved back to forecast')}>
                Back To Forecast
              </Button>
            </>
          )}
          {d.status === 'gone' && (
            <Button icon={<Undo2 size={17} strokeWidth={1.5} />} onClick={() => save({ status: 'forecast', gone_date: null, gone_reason: null }, 'Moved back to forecast')}>
              Back To Forecast
            </Button>
          )}
          {d.status === 'claimed' && (
            <Button icon={<Undo2 size={17} strokeWidth={1.5} />} onClick={() => save({ status: 'converted', claimed_date: null, claimed_amount: null }, 'Claim undone')}>
              Undo Claim
            </Button>
          )}
          <Button icon={<Pencil size={17} strokeWidth={1.5} />} onClick={() => open({ id: d.id, edit: '1' })}>
            Edit
          </Button>
        </div>

        {action && (
          <div className="flex flex-col gap-4 rounded-[18px] border border-line bg-page p-4">
            {action === 'gone' && (
              <ChoicePills label="Why Was It Lost?" options={GONE_REASONS.map((r) => ({ value: r, label: r }))} value={reason} onChange={(r) => setReason((r as string) ?? null)} />
            )}
            {action === 'claim' && <TextInput label="Claimed Amount (RM)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
            <TextInput label={action === 'convert' ? 'Converted On' : action === 'gone' ? 'Lost On' : 'Claimed On'} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <div className="flex gap-2">
              <Button
                variant="primary"
                disabled={!date || (action === 'gone' && !reason)}
                onClick={() => {
                  if (action === 'convert') save({ status: 'converted', converted_date: date }, `Converted on ${fmtDate(date)}`)
                  if (action === 'gone') save({ status: 'gone', gone_date: date, gone_reason: reason }, 'Marked as gone')
                  if (action === 'claim') {
                    const n = parseFloat(amount.replace(/[^\d.]/g, ''))
                    save({ status: 'claimed', claimed_date: date, claimed_amount: Number.isFinite(n) ? n : d.commission }, `Claimed on ${fmtDate(date)}`)
                  }
                }}
              >
                {action === 'convert' ? 'Save Converted' : action === 'gone' ? 'Save As Gone' : 'Save Claim'}
              </Button>
              <Button onClick={() => setAction(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </section>

      <DetailGrid
        items={[
          ['Deal Value', d.price != null ? (d.deal === 'rent' ? `${rmFull(d.price)} /mo` : rmFull(d.price)) : null],
          ['Area', d.area],
          ['Address', d.address ?? listing?.address],
          ['Forecast On', fmtDate(d.forecast_date)],
          ['Expected Close', fmtDate(d.expected_date)],
          ['Converted On', fmtDate(d.converted_date)],
          ['Lost On', fmtDate(d.gone_date)],
          ['Why Lost', d.gone_reason],
          ['Claimed On', fmtDate(d.claimed_date)],
          ['Claimed Amount', d.claimed_amount != null ? rmFull(d.claimed_amount) : null],
        ]}
      />
      {(listing || d.lead_id) && (
        <div className="flex flex-wrap gap-2">
          {d.lead_id && db.leads.some((l) => l.id === d.lead_id) && (
            <Button size="sm" onClick={() => nav(`/leads?id=${d.lead_id}`)}>
              Open Lead
            </Button>
          )}
          {listing && (
            <Button size="sm" onClick={() => nav(`/listings?id=${listing.id}`)}>
              Open Listing
            </Button>
          )}
        </div>
      )}
      {d.note && <p className="rounded-[18px] bg-page px-4 py-3 text-[15px] break-words whitespace-pre-wrap">{d.note}</p>}

      <ConfirmButton
        label="Delete Deal"
        icon={<Trash2 size={17} strokeWidth={1.5} />}
        question="Delete this deal? It will disappear from the sales figures. This can't be undone."
        confirmLabel="Yes, Delete Deal"
        onConfirm={async () => {
          if (await remove('deals', d.id)) {
            toast('Deal deleted')
            close()
          }
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function areaFromAddress(address: string | null | undefined): string {
  const a = (address ?? '').toLowerCase()
  return [...JB_AREAS].sort((x, y) => y.length - x.length).find((k) => a.includes(k.toLowerCase())) ?? ''
}

const num = (s: string) => {
  const n = parseFloat(s.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : null
}

function initialFrom(lead: Lead | undefined, listing: Listing | undefined, today: string) {
  return {
    contact: (lead?.contact_id ? { mode: 'existing', id: lead.contact_id } : { mode: 'none' }) as ContactChoice,
    deal: (listing?.deal ?? lead?.deal ?? 'sale') as Deal,
    type: listing?.type ?? lead?.property_types[0] ?? '',
    area: listing ? areaFromAddress(listing.address) : (lead?.areas ?? '').split(',')[0].trim().replace(/^any$/i, ''),
    address: listing?.address ?? '',
    price: listing?.price?.toString() ?? '',
    commission: '',
    forecastDate: today,
    expectedDate: '',
    note: '',
  }
}

function DealForm({ deal, fromLead, fromListing, onDone }: { deal?: SaleDeal; fromLead?: string | null; fromListing?: string | null; onDone: (id?: string) => void }) {
  const { db, today, insert, update } = useStore()
  const toast = useToast()
  const lead = fromLead ? db.leads.find((l) => l.id === fromLead) : undefined
  const listing = fromListing ? db.listings.find((l) => l.id === fromListing) : undefined
  const [v, setV] = useState(() =>
    deal
      ? {
          contact: (deal.contact_id ? { mode: 'existing', id: deal.contact_id } : { mode: 'none' }) as ContactChoice,
          deal: deal.deal,
          type: deal.property_type ?? '',
          area: deal.area ?? '',
          address: deal.address ?? '',
          price: deal.price?.toString() ?? '',
          commission: deal.commission?.toString() ?? '',
          forecastDate: deal.forecast_date,
          expectedDate: deal.expected_date ?? '',
          note: deal.note ?? '',
        }
      : initialFrom(lead, listing, today),
  )
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }))
  const price = num(v.price)
  const helpers: [string, number][] =
    price == null
      ? []
      : v.deal === 'rent'
        ? [
            ['1 Month', price],
            ['Half Month', price / 2],
            ['2 Months', price * 2],
          ]
        : [
            ['1%', price * 0.01],
            ['2%', price * 0.02],
            ['3%', price * 0.03],
          ]

  const save = async () => {
    setBusy(true)
    const role = v.deal === 'rent' ? 'tenant' : 'buyer'
    const contactId = await resolveContact(v.contact, role, db.contacts, (row) => insert('contacts', row), (id, patch) => update('contacts', id, patch))
    if (contactId === false) return setBusy(false)
    const row: Partial<SaleDeal> = {
      contact_id: contactId,
      deal: v.deal,
      property_type: v.type || null,
      area: v.area.trim() || null,
      address: v.address.trim() || null,
      price,
      commission: num(v.commission),
      forecast_date: v.forecastDate || today,
      expected_date: v.expectedDate || null,
      note: v.note.trim() || null,
    }
    if (deal) {
      const ok = await update('deals', deal.id, row)
      setBusy(false)
      if (ok) {
        toast('Changes saved')
        onDone(deal.id)
      }
      return
    }
    const saved = await insert('deals', { ...row, status: 'forecast', lead_id: lead?.id ?? null, listing_id: listing?.id ?? null, is_example: false })
    setBusy(false)
    if (saved) {
      toast('Deal added to forecast')
      onDone(saved.id)
    }
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      {(lead || listing) && <p className="rounded-[18px] bg-brand-soft px-4 py-3 text-[14px] text-brand-ink">Filled in from the {lead ? 'lead' : 'listing'}. Check the details and add the commission.</p>}
      <ContactPicker label="Client" contacts={db.contacts} value={v.contact} onChange={(c) => set('contact', c)} />
      <ChoicePills
        label="Sale Or Rent"
        options={[
          { value: 'sale', label: 'Sale' },
          { value: 'rent', label: 'Rent' },
        ]}
        value={v.deal}
        onChange={(d) => d && set('deal', d as Deal)}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectInput label="Property Type" options={PROPERTY_TYPES} placeholder="Not set" value={v.type} onChange={(e) => set('type', e.target.value)} />
        <TextInput label="Area" list="jb-areas" value={v.area} onChange={(e) => set('area', e.target.value)} placeholder="e.g. Mount Austin" />
        <datalist id="jb-areas">
          {JB_AREAS.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
      </div>
      <TextInput label="Address" value={v.address} onChange={(e) => set('address', e.target.value)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label={v.deal === 'rent' ? 'Rent Per Month (RM)' : 'Sale Price (RM)'} inputMode="decimal" value={v.price} onChange={(e) => set('price', e.target.value)} />
        <TextInput
          label="Your Commission (RM)"
          inputMode="decimal"
          value={v.commission}
          onChange={(e) => set('commission', e.target.value)}
          hint={
            helpers.length ? (
              <span className="mt-1 flex flex-wrap gap-1.5">
                {helpers.map(([l, n]) => (
                  <button key={l} type="button" onClick={() => set('commission', String(Math.round(n)))} className="min-h-9 rounded-full border border-line bg-white px-3 text-[13px] text-text-2 hover:bg-brand-soft">
                    {l} = {rm(n)}
                  </button>
                ))}
              </span>
            ) : (
              'Enter the price to see quick amounts.'
            )
          }
        />
        <TextInput label="Forecast On" type="date" value={v.forecastDate} onChange={(e) => set('forecastDate', e.target.value)} hint="When this deal entered your pipeline." />
        <TextInput label="Expected To Close" type="date" value={v.expectedDate} onChange={(e) => set('expectedDate', e.target.value)} />
      </div>
      <TextArea label="Notes" rows={3} value={v.note} onChange={(e) => set('note', e.target.value)} />
      <div className="sticky bottom-0 -mx-1 flex gap-2 bg-card px-1 pt-2">
        <Button type="submit" variant="primary" disabled={busy} className="flex-1 sm:flex-none">
          {deal ? 'Save Changes' : 'Save Deal'}
        </Button>
        <Button onClick={() => onDone(deal?.id)}>Cancel</Button>
      </div>
    </form>
  )
}

