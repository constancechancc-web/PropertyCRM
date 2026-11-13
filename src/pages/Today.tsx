import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, CalendarClock, CircleCheckBig, Inbox, Sparkles, KeyRound } from 'lucide-react'
import { PageShell } from '../components/Shell'
import { Avatar, Barcode, Button, Card, Dot, IconWell, RoundLink, SectionTitle } from '../components/ui'
import { useToast } from '../components/Toast'
import { useIsAdmin } from '../data/auth'
import { useContactMap, useMatches, useStore } from '../data/store'
import { STAGES, VIEWING_TO_BOOKING } from '../lib/constants'
import { addDays, diffDays, fmtLongDate, fmtNumber, pct } from '../lib/format'
import { contactedToday, isDueSoon, isOpen, rentStatus } from '../lib/logic'
import type { Lead } from '../lib/types'
import { LeadRow } from './Leads'
import { RentLine } from './Rent'

function greeting(d = new Date()) {
  const h = d.getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function Summary({
  icon,
  tone,
  title,
  sub,
  value,
  status,
  bar,
  footer,
  to,
}: {
  icon: ReactNode
  tone: number
  title: string
  sub: string
  value: number
  status: { tone: 'good' | 'bad' | 'warn' | 'plain'; text: string }
  bar: ReactNode
  footer: string
  to: string
}) {
  return (
    <Card as="article" className="flex flex-col gap-4 p-5 md:p-6">
      <div className="flex items-center gap-3">
        <IconWell tone={tone}>{icon}</IconWell>
        <div className="min-w-0">
          <h2 className="truncate text-[16px] font-semibold">{title}</h2>
          <div className="truncate text-[13px] text-text-3">{sub}</div>
        </div>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="tnum text-[52px] leading-none font-light tracking-tight">{fmtNumber(value)}</div>
        <div className="flex items-center gap-1.5 pb-1.5 text-[13.5px] text-text-2">
          <Dot tone={status.tone} />
          {status.text}
        </div>
      </div>
      {bar}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13.5px] text-text-2">{footer}</span>
        <RoundLink to={to} label={`Open ${title}`} />
      </div>
    </Card>
  )
}

export default function Today() {
  const { db, today, removeExamples } = useStore()
  const contacts = useContactMap()
  const { byListing } = useMatches()
  const nav = useNavigate()
  const admin = useIsAdmin()
  const toast = useToast()
  const [removing, setRemoving] = useState(false)

  const s = useMemo(() => {
    const open = db.leads.filter(isOpen)
    const overdue = open.filter((l) => l.next_follow_up && l.next_follow_up < today)
    const dueToday = open.filter((l) => l.next_follow_up === today)
    const next7 = open.filter((l) => l.next_follow_up && l.next_follow_up > today && l.next_follow_up <= addDays(today, 7))
    const contacted = open.filter((l) => contactedToday(l, today))
    const newThisWeek = db.leads.filter((l) => diffDays(l.created_at.slice(0, 10), today) < 7)
    const noDate = open.filter((l) => !l.next_follow_up)
    const available = db.listings.filter((l) => l.status === 'available')
    const matched = available.filter((l) => (byListing.get(l.id)?.length ?? 0) > 0)
    const v2b = db.leads.filter((l) => VIEWING_TO_BOOKING.includes(l.stage))
    const booked = db.leads.filter((l) => l.stage === 'Booked')
    const closed = db.leads.filter((l) => l.stage === 'Closed')
    const lost = db.leads.filter((l) => l.stage === 'Lost')
    const rentDue = db.tenancies
      .map((t) => ({ t, st: rentStatus(t, db.tenancy_payments, today) }))
      .filter((x) => x.st.kind !== 'ended' && isDueSoon(x.st))
      .sort((a, b) => (a.st.days ?? 0) - (b.st.days ?? 0))
    const byFu = (a: Lead, b: Lead) => (a.next_follow_up ?? '').localeCompare(b.next_follow_up ?? '')
    return {
      open,
      overdue: overdue.sort(byFu),
      dueToday,
      next7: next7.sort(byFu),
      contacted,
      newThisWeek,
      noDate,
      available,
      matched,
      v2b,
      booked,
      closed,
      lost,
      rentDue,
      examples: db.contacts.some((c) => c.is_example) || db.leads.some((l) => l.is_example) || db.listings.some((l) => l.is_example) || db.tenancies.some((t) => t.is_example),
    }
  }, [db, today, byListing])

  const due = s.overdue.length + s.dueToday.length
  const now = new Date()

  const list = (title: string, leads: Lead[]) =>
    leads.length > 0 && (
      <div className="flex flex-col gap-1">
        <h3 className="px-1 text-[13px] font-medium text-text-3">{title}</h3>
        <ul className="divide-y divide-line overflow-hidden rounded-[18px] border border-line">
          {leads.map((l) => (
            <LeadRow key={l.id} lead={l} contact={l.contact_id ? contacts.get(l.contact_id) : undefined} onClick={() => nav(`/leads?id=${l.id}`)} />
          ))}
        </ul>
      </div>
    )

  return (
    <PageShell label="Today's overview" title={`${greeting(now)}, Constance`} sub={fmtLongDate(now)}>
      {s.examples && (
        <Card className="mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <div className="flex items-center gap-3">
            <IconWell tone={3} size={40}>
              <Sparkles size={18} strokeWidth={1.5} />
            </IconWell>
            <p className="text-[15px] text-text-2">The CRM has some example records so you can try things out.</p>
          </div>
          {admin && (
            <Button
              disabled={removing}
              onClick={async () => {
                setRemoving(true)
                if (await removeExamples()) toast('Examples removed')
                setRemoving(false)
              }}
            >
              Remove Examples
            </Button>
          )}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Summary
              icon={<CalendarClock size={20} strokeWidth={1.5} />}
              tone={0}
              title="Follow-ups Due"
              sub="Due today or overdue"
              value={due}
              status={s.overdue.length ? { tone: 'bad', text: `${s.overdue.length} overdue` } : s.dueToday.length ? { tone: 'warn', text: `${s.dueToday.length} today` } : { tone: 'good', text: 'All caught up' }}
              bar={
                <Barcode
                  label={`${s.contacted.length} contacted today, ${s.dueToday.length} due today, ${s.overdue.length} overdue`}
                  total={s.contacted.length + due}
                  segments={[
                    { value: s.contacted.length, color: 'good' },
                    { value: s.dueToday.length, color: 'warn' },
                    { value: s.overdue.length, color: 'bad' },
                  ]}
                />
              }
              footer={`${s.contacted.length} contacted today`}
              to="/leads"
            />
            <Summary
              icon={<Inbox size={20} strokeWidth={1.5} />}
              tone={2}
              title="Open Leads"
              sub="New to Booked"
              value={s.open.length}
              status={{ tone: 'good', text: `${s.newThisWeek.length} new this week` }}
              bar={
                <Barcode
                  label={`${s.open.length - s.noDate.length} with a follow-up date, ${s.noDate.length} without`}
                  total={s.open.length}
                  segments={[
                    { value: s.open.length - s.noDate.length, color: 'good' },
                    { value: s.noDate.length, color: 'warn' },
                  ]}
                />
              }
              footer={s.noDate.length ? `${s.noDate.length} have no follow-up date` : 'Every open lead has a follow-up date'}
              to="/leads"
            />
            <Summary
              icon={<Building2 size={20} strokeWidth={1.5} />}
              tone={4}
              title="Available Listings"
              sub="For sale and for rent"
              value={s.available.length}
              status={{ tone: s.matched.length ? 'good' : 'plain', text: `${s.matched.length} matched` }}
              bar={<Barcode label={`${s.matched.length} of ${s.available.length} listings fit an open lead`} total={s.available.length} segments={[{ value: s.matched.length, color: 'good' }]} />}
              footer={`${s.available.filter((l) => l.deal === 'sale').length} for sale · ${s.available.filter((l) => l.deal === 'rent').length} for rent`}
              to="/listings"
            />
            <Summary
              icon={<KeyRound size={20} strokeWidth={1.5} />}
              tone={3}
              title="Viewing To Booking"
              sub="Viewing Set, Viewed, Negotiating, Booked"
              value={s.v2b.length}
              status={{ tone: s.booked.length ? 'good' : 'plain', text: `${s.booked.length} booked` }}
              bar={<Barcode label={`${s.v2b.length} of ${s.open.length} open leads are viewing or later`} total={s.open.length} segments={[{ value: s.v2b.length, color: 'good' }]} />}
              footer={s.open.length ? `${pct((s.v2b.length / s.open.length) * 100)} of open leads` : 'No open leads yet'}
              to="/leads?stage=Viewing+Set"
            />
            <Summary
              icon={<CircleCheckBig size={20} strokeWidth={1.5} />}
              tone={1}
              title="Closed"
              sub="All time"
              value={s.closed.length}
              status={{ tone: s.lost.length ? 'bad' : 'plain', text: `${s.lost.length} lost` }}
              bar={
                <Barcode
                  label={`${s.closed.length} closed, ${s.lost.length} lost`}
                  total={s.closed.length + s.lost.length}
                  segments={[
                    { value: s.closed.length, color: 'good' },
                    { value: s.lost.length, color: 'bad' },
                  ]}
                />
              }
              footer={s.closed.length + s.lost.length ? `${pct((s.closed.length / (s.closed.length + s.lost.length)) * 100)} won` : 'Nothing closed yet'}
              to="/leads?stage=Closed"
            />
          </div>

          <Card className="flex flex-col gap-4 p-5 md:p-6">
            <SectionTitle>Pipeline</SectionTitle>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {STAGES.map((st) => {
                const n = db.leads.filter((l) => l.stage === st).length
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => nav(`/leads?stage=${encodeURIComponent(st)}`)}
                    className="flex min-h-11 flex-col gap-2 rounded-[18px] border border-line p-3.5 text-left transition-colors hover:border-brand/40 hover:bg-brand-soft/40"
                  >
                    <span className="text-[13.5px] text-text-2">{st}</span>
                    <span className="tnum text-[28px] leading-none font-light">{n}</span>
                    <Barcode bars={20} height={18} label={`${n} of ${db.leads.length} leads`} total={db.leads.length} segments={[{ value: n, color: st === 'Lost' ? 'bad' : 'good' }]} />
                  </button>
                )
              })}
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card className="flex flex-col gap-4 p-5 md:p-6">
            <SectionTitle action={<RoundLink to="/leads" label="Open Leads" />}>Follow-ups</SectionTitle>
            {s.overdue.length + s.dueToday.length + s.next7.length === 0 ? (
              <p className="text-[14px] text-text-2">No follow-ups in the next 7 days.</p>
            ) : (
              <>
                {list('Overdue', s.overdue)}
                {list('Today', s.dueToday)}
                {list('Next 7 days', s.next7)}
              </>
            )}
          </Card>

          <Card className="flex flex-col gap-4 p-5 md:p-6">
            <SectionTitle action={<RoundLink to="/tenancy?show=due" label="Open Tenancy Reminders" />}>Rent Due</SectionTitle>
            {s.rentDue.length ? (
              <ul className="divide-y divide-line overflow-hidden rounded-[18px] border border-line">
                {s.rentDue.map(({ t, st }) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => nav(`/tenancy?id=${t.id}`)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-page">
                      <Avatar id={t.id} name={t.tenant_name} size={38} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{t.tenant_name}</span>
                        <span className="block truncate text-[13px] text-text-2">{t.address}</span>
                      </span>
                      <RentLine s={st} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-text-2">No rent due in the next 3 days.</p>
            )}
          </Card>
        </div>
      </div>
    </PageShell>
  )
}
