import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BadgeDollarSign, ClipboardPaste, Contact as ContactIcon, ExternalLink, MessageCircle, Pencil, Plus, Building2, Trash2 } from 'lucide-react'
import { PageShell, headerBtn } from '../components/Shell'
import { Sheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { ContactPicker, resolveContact, type ContactChoice } from '../components/ContactPicker'
import { ExportButtons } from '../components/ExportButtons'
import { Avatar, Button, Card, Chip, ChoicePills, ConfirmButton, CopyButton, DetailGrid, Dot, Empty, IconWell, LinkButton, Pill, PillRow, SearchBox, SectionTitle, SelectInput, TextArea, TextInput, cx } from '../components/ui'
import { useIsAdmin } from '../data/auth'
import { useContactMap, useMatches, useStore } from '../data/store'
import { LISTING_HUB_URL, OPEN_STAGES, PROPERTY_TYPES, SOURCES, STAGES, type Race, type Stage } from '../lib/constants'
import { addDays, budgetText, firstName, fmtDate, fmtStamp, nowISO, rmShort, samePhone, waLink } from '../lib/format'
import { defaultFollowUp, followUpInfo, hubBlock, isOpen, notesNewestFirst } from '../lib/logic'
import { noteSummary, parseLead } from '../lib/parsers'
import { useSheet } from '../lib/useSheet'
import type { Contact, Deal, Lead } from '../lib/types'
import { leadTable } from '../lib/export'

export function leadSummary(l: Lead): string {
  const deal = l.deal === 'rent' ? 'Rent' : l.deal === 'sale' ? 'Buy' : ''
  const types = l.property_types.length ? l.property_types.join(', ') : 'Any type'
  const areas = l.areas?.trim() ? l.areas : 'Any area'
  return [deal, types, areas, budgetText(l.budget_min, l.budget_max, l.deal)].filter(Boolean).join(' · ')
}

export function LeadRow({ lead, contact, onClick }: { lead: Lead; contact?: Contact; onClick: () => void }) {
  const { today } = useStore()
  const f = followUpInfo(lead, today)
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-page md:px-6">
        <Avatar id={contact?.id ?? lead.id} name={contact?.name ?? '?'} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-medium">{contact?.name ?? 'No contact'}</div>
          <div className="line-clamp-2 text-[13.5px] text-text-2 md:truncate">{leadSummary(lead)}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Chip tone={lead.stage === 'Lost' ? 'plain' : 'brand'}>{lead.stage}</Chip>
          {f.text && (
            <span className="tnum flex items-center gap-1.5 text-[12.5px] text-text-2">
              <Dot tone={f.tone} />
              {f.text}
            </span>
          )}
        </div>
      </button>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Leads() {
  const { db, today } = useStore()
  const contacts = useContactMap()
  const { params, open, close, setFilter } = useSheet()
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState<LeadFormValues | null>(null)
  const stage = params.get('stage') ?? 'Open'

  const notesByLead = useMemo(() => {
    const m = new Map<string, string>()
    for (const n of db.lead_notes) m.set(n.lead_id, (m.get(n.lead_id) ?? '') + ' ' + n.text)
    return m
  }, [db.lead_notes])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const digits = s.replace(/\D/g, '')
    return db.leads
      .filter((l) => (stage === 'All' ? true : stage === 'Open' ? isOpen(l) : l.stage === stage))
      .filter((l) => {
        if (!s) return true
        const c = l.contact_id ? contacts.get(l.contact_id) : undefined
        const hay = [c?.name, l.areas, l.property_types.join(' '), notesByLead.get(l.id), l.timeline, l.source].join(' ').toLowerCase()
        return hay.includes(s) || (digits.length >= 3 && (c?.phone ?? '').replace(/\D/g, '').includes(digits))
      })
      .sort((a, b) => {
        const fa = a.next_follow_up ?? '9999'
        const fb = b.next_follow_up ?? '9999'
        return fa === fb ? b.created_at.localeCompare(a.created_at) : fa.localeCompare(fb)
      })
  }, [db.leads, stage, q, contacts, notesByLead])

  const counts = useMemo(() => {
    const m: Record<string, number> = { Open: 0, All: db.leads.length }
    for (const l of db.leads) {
      m[l.stage] = (m[l.stage] ?? 0) + 1
      if (isOpen(l)) m.Open++
    }
    return m
  }, [db.leads])

  const id = params.get('id')
  const lead = id ? db.leads.find((l) => l.id === id) : undefined
  const editing = !!params.get('edit')
  const creating = !!params.get('new')
  const pasting = !!params.get('paste')
  const presetContact = params.get('contact')

  return (
    <PageShell
      label="Buyers and tenants"
      title="Leads"
      sub={`${counts.Open} open · ${db.leads.length} in total`}
      actions={
        <>
          <ExportButtons kind="Leads" build={() => leadTable(shown, contacts, db.lead_notes)} />
          <Button size="sm" className={headerBtn} icon={<ClipboardPaste size={16} strokeWidth={1.5} />} onClick={() => open({ paste: '1' })}>
            Paste From WhatsApp
          </Button>
          <Button size="sm" variant="primary" icon={<Plus size={16} strokeWidth={1.5} />} onClick={() => (setDraft(null), open({ new: '1' }))}>
            New Lead
          </Button>
        </>
      }
    >
      <Card className="flex flex-col gap-4 p-4 md:p-6">
        <SearchBox value={q} onChange={setQ} placeholder="Search name, phone, area, type, notes" />
        <PillRow label="Stage">
          {['Open', ...STAGES, 'All'].map((s) => (
            <Pill key={s} active={stage === s} count={counts[s] ?? 0} onClick={() => setFilter('stage', s === 'Open' ? null : s)}>
              {s}
            </Pill>
          ))}
        </PillRow>
      </Card>

      <Card className="mt-4 overflow-hidden">
        {shown.length ? (
          <ul className="divide-y divide-line">
            {shown.map((l) => (
              <LeadRow key={l.id} lead={l} contact={l.contact_id ? contacts.get(l.contact_id) : undefined} onClick={() => open({ id: l.id })} />
            ))}
          </ul>
        ) : (
          <Empty
            action={
              <Button variant="primary" icon={<Plus size={16} strokeWidth={1.5} />} onClick={() => open({ new: '1' })}>
                New Lead
              </Button>
            }
          >
            {db.leads.length ? 'No leads match this search or filter.' : 'No leads yet. Add a buyer or tenant enquiry, or paste one from WhatsApp.'}
          </Empty>
        )}
      </Card>

      <Sheet open={!!lead && !editing} onClose={close} title="Lead" wide>
        {lead && <LeadDetail lead={lead} today={today} />}
      </Sheet>
      <Sheet open={!!lead && editing} onClose={() => open({ id: lead!.id })} title="Edit Lead" wide>
        {lead && <LeadForm key={lead.id} lead={lead} onDone={() => open({ id: lead.id })} />}
      </Sheet>
      <Sheet open={creating} onClose={() => (setDraft(null), close())} title="New Lead" wide>
        {creating && (
          <LeadForm
            initial={draft ?? (presetContact ? { ...emptyLead(today), contact: { mode: 'existing', id: presetContact } } : undefined)}
            onDone={(newId) => {
              setDraft(null)
              if (newId) open({ id: newId }, true)
              else close()
            }}
          />
        )}
      </Sheet>
      <Sheet open={pasting} onClose={close} title="Paste Lead From WhatsApp" wide>
        {pasting && (
          <PasteLead
            onFill={(v) => {
              setDraft(v)
              open({ new: '1' }, true)
            }}
          />
        )}
      </Sheet>
    </PageShell>
  )
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

function LeadDetail({ lead, today }: { lead: Lead; today: string }) {
  const { db, update, insert, remove } = useStore()
  const contacts = useContactMap()
  const { byLead } = useMatches()
  const { open, close } = useSheet()
  const nav = useNavigate()
  const toast = useToast()
  const admin = useIsAdmin()
  const contact = lead.contact_id ? contacts.get(lead.contact_id) : undefined
  const notes = notesNewestFirst(db.lead_notes, lead.id)
  const matches = byLead.get(lead.id) ?? []
  const [note, setNote] = useState('')
  const [counts, setCounts] = useState(true)
  const [askLost, setAskLost] = useState(false)
  const [lostReason, setLostReason] = useState(lead.lost_reason ?? '')
  const [hubText, setHubText] = useState<string | null>(null)

  const setStage = async (s: Stage) => {
    if (s === 'Lost') {
      setAskLost(true)
      return
    }
    setAskLost(false)
    const patch: Partial<Lead> = { stage: s }
    if (s === 'Closed') patch.next_follow_up = null
    if (await update('leads', lead.id, patch)) toast(`Stage set to ${s}`)
  }

  const saveLost = async () => {
    if (await update('leads', lead.id, { stage: 'Lost', lost_reason: lostReason.trim() || null, next_follow_up: null })) {
      toast('Marked as lost')
      setAskLost(false)
    }
  }

  const setFollowUp = async (d: string | null) => {
    if (await update('leads', lead.id, { next_follow_up: d })) toast(d ? `Follow-up set for ${fmtDate(d)}` : 'Follow-up cleared')
  }

  const addNote = async () => {
    const text = note.trim()
    if (!text) return
    setNote('')
    const saved = await insert('lead_notes', { lead_id: lead.id, text, created_at: nowISO() })
    if (!saved) {
      setNote(text)
      return
    }
    const patch: Partial<Lead> = {}
    if (counts) patch.last_contacted_at = nowISO()
    if (lead.stage === 'New') patch.stage = 'Contacted'
    if (Object.keys(patch).length) await update('leads', lead.id, patch)
    toast('Note added')
  }

  const toHub = () => {
    const summary = notes
      .map((n) => noteSummary(n.text))
      .filter(Boolean)
      .join('\n')
    const block = hubBlock(lead, contact, summary)
    // Start the copy while this page still has focus, then open the Hub.
    const copying = navigator.clipboard ? navigator.clipboard.writeText(block) : Promise.reject(new Error('no clipboard'))
    window.open(`${LISTING_HUB_URL}#crm`, '_blank', 'noopener')
    copying
      .then(() => toast('Copied. Paste it in Listing Hub’s "Paste From CRM" box.'))
      .catch(() => setHubText(block))
  }

  const fu = followUpInfo(lead, today)

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Avatar id={contact?.id ?? lead.id} name={contact?.name} size={56} />
        <div className="min-w-0 flex-1">
          <div className="text-[22px] leading-tight font-semibold">{contact?.name ?? 'No contact linked'}</div>
          {contact?.phone && (
            <div className="tnum flex items-center text-[15px] text-text-2">
              {contact.phone}
              <CopyButton text={contact.phone} label="Copy Phone" done="Phone copied" />
            </div>
          )}
          <div className="mt-1 text-[14px] text-text-2">{leadSummary(lead)}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {contact?.phone && (
          <LinkButton href={waLink(contact.phone, `Hi ${firstName(contact.name)}, `)} variant="primary" icon={<MessageCircle size={17} strokeWidth={1.5} />}>
            WhatsApp
          </LinkButton>
        )}
        <Button icon={<ExternalLink size={17} strokeWidth={1.5} />} onClick={toHub}>
          Match In Listing Hub
        </Button>
        <Button icon={<Pencil size={17} strokeWidth={1.5} />} onClick={() => open({ id: lead.id, edit: '1' })}>
          Edit
        </Button>
        {contact && (
          <Button icon={<ContactIcon size={17} strokeWidth={1.5} />} onClick={() => nav(`/contacts?id=${contact.id}`)}>
            Contact Card
          </Button>
        )}
        {admin &&
          (() => {
            const existing = db.deals.find((x) => x.lead_id === lead.id)
            return (
              <Button icon={<BadgeDollarSign size={17} strokeWidth={1.5} />} onClick={() => nav(existing ? `/sales?view=deals&status=all&id=${existing.id}` : `/sales?view=deals&new=1&lead=${lead.id}`)}>
                {existing ? 'Open Deal' : 'Add To Sales'}
              </Button>
            )
          })()}
      </div>

      {/* Stage */}
      <section className="flex flex-col gap-3">
        <SectionTitle>Stage</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {STAGES.map((s) => (
            <Pill key={s} active={lead.stage === s} onClick={() => setStage(s)}>
              {s}
            </Pill>
          ))}
        </div>
        {askLost && (
          <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-page p-4">
            <TextInput label="Why Lost" value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="e.g. Bought elsewhere, budget too low" autoFocus />
            <div className="flex gap-2">
              <Button variant="primary" onClick={saveLost}>
                Mark As Lost
              </Button>
              <Button onClick={() => setAskLost(false)}>Cancel</Button>
            </div>
          </div>
        )}
        {lead.stage === 'Lost' && lead.lost_reason && !askLost && <p className="text-[14px] text-text-2">Why lost: {lead.lost_reason}</p>}
      </section>

      {/* Follow-up */}
      <section className="flex flex-col gap-3">
        <SectionTitle>
          <span className="flex items-center gap-2">
            Next Follow-up
            {fu.text && (
              <span className="flex items-center gap-1.5 text-[14px] font-normal text-text-2">
                <Dot tone={fu.tone} /> {fu.text}
              </span>
            )}
          </span>
        </SectionTitle>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="fu-date">
            Next follow-up date
          </label>
          <input
            id="fu-date"
            type="date"
            value={lead.next_follow_up ?? ''}
            onChange={(e) => setFollowUp(e.target.value || null)}
            className="min-h-11 rounded-full border border-line bg-white px-4 text-[15px]"
          />
          <Button size="sm" onClick={() => setFollowUp(addDays(today, 1))}>
            +1 Day
          </Button>
          <Button size="sm" onClick={() => setFollowUp(addDays(today, 3))}>
            +3 Days
          </Button>
          <Button size="sm" onClick={() => setFollowUp(addDays(today, 7))}>
            +1 Week
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setFollowUp(null)}>
            Clear
          </Button>
        </div>
      </section>

      <DetailGrid
        items={[
          ['Looking To', lead.deal === 'rent' ? 'Rent' : lead.deal === 'sale' ? 'Buy' : ''],
          ['Budget', budgetText(lead.budget_min, lead.budget_max, lead.deal)],
          ['Property Types', lead.property_types.length ? lead.property_types.join(', ') : 'Any type'],
          ['Preferred Areas', lead.areas?.trim() || 'Any area'],
          ['Timeline / Move-in', lead.timeline],
          ['Came From', lead.source],
          ['Last Contacted', fmtStamp(lead.last_contacted_at)],
          ['Added On', fmtDate(lead.created_at)],
        ]}
      />

      {/* Notes */}
      <section className="flex flex-col gap-3">
        <SectionTitle>Notes</SectionTitle>
        <TextArea label="New note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did they say?" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] text-text-2">
            <input type="checkbox" checked={counts} onChange={(e) => setCounts(e.target.checked)} className="size-5 accent-brand" />
            Counts as contacted today
          </label>
          <Button variant="primary" disabled={!note.trim()} onClick={addNote}>
            Add Note
          </Button>
        </div>
        {notes.length > 0 && (
          <ol className="flex flex-col gap-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-[18px] bg-page px-4 py-3">
                <div className="text-[12.5px] text-text-3">{fmtStamp(n.created_at)}</div>
                <div className="text-[15px] break-words whitespace-pre-wrap">{n.text}</div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Matching listings */}
      <section className="flex flex-col gap-3">
        <SectionTitle>Matching Listings</SectionTitle>
        {matches.length ? (
          <ul className="flex flex-col divide-y divide-line rounded-[18px] border border-line">
            {matches.map((l) => (
              <li key={l.id}>
                <button type="button" onClick={() => nav(`/listings?id=${l.id}`)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-page">
                  <IconWell tone={0} size={38}>
                    <Building2 size={17} strokeWidth={1.5} />
                  </IconWell>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[15px]">{l.address}</span>
                    <span className="block text-[13px] text-text-2">{l.type}</span>
                  </span>
                  <span className="tnum shrink-0 text-[15px] font-medium">{rmShort(l.price, l.deal)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-text-2">{isOpen(lead) ? 'No available listings fit this lead yet.' : 'Matching only runs for open leads.'}</p>
        )}
      </section>

      {admin && (
        <ConfirmButton
          label="Delete Lead"
          icon={<Trash2 size={17} strokeWidth={1.5} />}
          question="Delete this lead and all its notes? This can't be undone."
          confirmLabel="Yes, Delete Lead"
          onConfirm={async () => {
            if (await remove('leads', lead.id)) {
              toast('Lead deleted')
              close()
            }
          }}
        />
      )}

      <Sheet open={hubText != null} onClose={() => setHubText(null)} title="Copy For Listing Hub">
        <p className="mb-3 text-[14px] text-text-2">Your browser blocked copying. Select all of this text, copy it, then paste it in Listing Hub.</p>
        <textarea readOnly value={hubText ?? ''} rows={10} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-[18px] border border-line p-4 font-mono text-[14px]" />
      </Sheet>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

export interface LeadFormValues {
  contact: ContactChoice
  deal: Deal
  types: string[]
  areas: string
  budgetMin: string
  budgetMax: string
  stage: Stage
  nextFollowUp: string
  source: string
  timeline: string
  lostReason: string
  firstNote: string
}

export function emptyLead(today: string): LeadFormValues {
  return {
    contact: { mode: 'none' },
    deal: 'sale',
    types: [],
    areas: '',
    budgetMin: '',
    budgetMax: '',
    stage: 'New',
    nextFollowUp: defaultFollowUp(today),
    source: '',
    timeline: '',
    lostReason: '',
    firstNote: '',
  }
}

const num = (s: string) => {
  const n = parseFloat(s.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : null
}

function LeadForm({ lead, initial, onDone }: { lead?: Lead; initial?: LeadFormValues; onDone: (id?: string) => void }) {
  const { db, today, insert, update } = useStore()
  const toast = useToast()
  const [v, setV] = useState<LeadFormValues>(() =>
    lead
      ? {
          contact: lead.contact_id ? { mode: 'existing', id: lead.contact_id } : { mode: 'none' },
          deal: lead.deal ?? 'sale',
          types: lead.property_types,
          areas: lead.areas ?? '',
          budgetMin: lead.budget_min?.toString() ?? '',
          budgetMax: lead.budget_max?.toString() ?? '',
          stage: lead.stage,
          nextFollowUp: lead.next_follow_up ?? '',
          source: lead.source ?? '',
          timeline: lead.timeline ?? '',
          lostReason: lead.lost_reason ?? '',
          firstNote: '',
        }
      : (initial ?? emptyLead(today)),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof LeadFormValues>(k: K, val: LeadFormValues[K]) => setV((p) => ({ ...p, [k]: val }))

  const save = async () => {
    if (v.contact.mode === 'none' || (v.contact.mode === 'new' && !v.contact.name.trim())) {
      setError("Add the client's name, or pick an existing contact.")
      return
    }
    setBusy(true)
    const contactId = await resolveContact(
      v.contact,
      v.deal === 'rent' ? 'tenant' : 'buyer',
      db.contacts,
      (row) => insert('contacts', row),
      (id, patch) => update('contacts', id, patch),
    )
    if (contactId === false) return setBusy(false)
    const closed = v.stage === 'Closed' || v.stage === 'Lost'
    const row: Partial<Lead> = {
      contact_id: contactId,
      deal: v.deal,
      property_types: v.types,
      areas: v.areas.trim() || null,
      budget_min: num(v.budgetMin),
      budget_max: num(v.budgetMax),
      stage: v.stage,
      next_follow_up: closed ? null : v.nextFollowUp || null,
      source: v.source || null,
      timeline: v.timeline.trim() || null,
      lost_reason: v.stage === 'Lost' ? v.lostReason.trim() || null : null,
    }
    if (lead) {
      const ok = await update('leads', lead.id, row)
      setBusy(false)
      if (ok) {
        toast('Changes saved')
        onDone(lead.id)
      }
      return
    }
    const saved = await insert('leads', { ...row, is_example: false, last_contacted_at: null })
    if (saved && v.firstNote.trim()) await insert('lead_notes', { lead_id: saved.id, text: v.firstNote.trim(), created_at: nowISO() })
    setBusy(false)
    if (saved) {
      toast('Lead added')
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
      <ContactPicker label="Client" contacts={db.contacts} value={v.contact} onChange={(c) => set('contact', c)} />
      <ChoicePills
        label="Looking To"
        options={[
          { value: 'sale', label: 'Buy' },
          { value: 'rent', label: 'Rent' },
        ]}
        value={v.deal}
        onChange={(d) => d && set('deal', d as Deal)}
      />
      <div>
        <ChoicePills label="Property Type" multi options={PROPERTY_TYPES.map((t) => ({ value: t, label: t }))} value={v.types} onChange={(t) => set('types', (t as string[]) ?? [])} />
        <p className="mt-1.5 text-[13px] text-text-3">{v.types.length ? `${v.types.length} selected` : 'None ticked means any type.'}</p>
      </div>
      <TextInput label="Preferred Areas" value={v.areas} onChange={(e) => set('areas', e.target.value)} placeholder="e.g. Mount Austin, Tebrau (or Any)" hint="Separate areas with commas." />
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="Budget From (RM)" inputMode="decimal" value={v.budgetMin} onChange={(e) => set('budgetMin', e.target.value)} />
        <TextInput label="Budget Up To (RM)" inputMode="decimal" value={v.budgetMax} onChange={(e) => set('budgetMax', e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectInput label="Stage" options={STAGES} value={v.stage} onChange={(e) => set('stage', e.target.value as Stage)} />
        <TextInput label="Next Follow-up" type="date" value={v.nextFollowUp} onChange={(e) => set('nextFollowUp', e.target.value)} disabled={v.stage === 'Closed' || v.stage === 'Lost'} />
        <SelectInput label="Came From" options={SOURCES} placeholder="Not set" value={v.source} onChange={(e) => set('source', e.target.value)} />
        <TextInput label="Timeline / Move-in" value={v.timeline} onChange={(e) => set('timeline', e.target.value)} placeholder="e.g. Next month" />
      </div>
      {v.stage === 'Lost' && <TextInput label="Why Lost" value={v.lostReason} onChange={(e) => set('lostReason', e.target.value)} />}
      {!lead && <TextArea label="First Note" rows={4} value={v.firstNote} onChange={(e) => set('firstNote', e.target.value)} />}
      {error && (
        <p role="alert" className="rounded-[18px] bg-rose px-4 py-3 text-[14px] text-rose-ink">
          {error}
        </p>
      )}
      <div className="sticky bottom-0 -mx-1 flex gap-2 bg-card px-1 pt-2">
        <Button type="submit" variant="primary" disabled={busy} className="flex-1 sm:flex-none">
          {lead ? 'Save Changes' : 'Save Lead'}
        </Button>
        <Button onClick={() => onDone(lead?.id)}>Cancel</Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Paste From WhatsApp
// ---------------------------------------------------------------------------

function PasteLead({ onFill }: { onFill: (v: LeadFormValues) => void }) {
  const { db, today } = useStore()
  const [text, setText] = useState('')
  const p = useMemo(() => parseLead(text), [text])
  const existing = p.phone ? db.contacts.find((c) => samePhone(c.phone, p.phone)) : undefined

  const fill = () => {
    const contact: ContactChoice = existing ? { mode: 'existing', id: existing.id } : { mode: 'new', name: p.name ?? '', phone: p.phone ?? '', race: (p.race as Race) ?? null }
    onFill({
      ...emptyLead(today),
      contact,
      deal: p.deal ?? 'sale',
      types: p.types,
      areas: p.areas.join(', '),
      budgetMin: p.budgetMin?.toString() ?? '',
      budgetMax: p.budgetMax?.toString() ?? '',
      firstNote: text.trim(),
    })
  }

  const rows: [string, string | null][] = [
    ['Name', p.name],
    ['Phone', p.phone],
    ['Race', p.race],
    ['Looking To', p.deal === 'rent' ? 'Rent' : p.deal === 'sale' ? 'Buy' : null],
    ['Property Types', p.types.length ? p.types.join(', ') : null],
    ['Areas', p.areas.length ? p.areas.join(', ') : null],
    ['Budget', p.budgetMin != null || p.budgetMax != null ? budgetText(p.budgetMin, p.budgetMax, p.deal) : null],
  ]

  return (
    <div className="flex flex-col gap-5">
      <TextArea
        label="Paste the WhatsApp message"
        rows={7}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'Mr Chan\n012-123 4567\nWTB terrace house\nBudget below 600k'}
        autoFocus
      />
      <section className="flex flex-col gap-2">
        <SectionTitle>What the CRM picked up</SectionTitle>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-[18px] border border-line p-4 text-[15px]">
          {rows.map(([k, val]) => (
            <div key={k} className="contents">
              <dt className="text-text-3">{k}</dt>
              <dd className={cx('break-words', !val && 'text-text-3')}>{val ?? 'Not found'}</dd>
            </div>
          ))}
        </dl>
        {existing && <p className="rounded-[18px] bg-mint px-4 py-3 text-[14px] text-mint-ink">This number already belongs to {existing.name}. The lead will be linked to them.</p>}
        <p className="text-[13px] text-text-3">You can check and change everything on the next step. The pasted text is kept as the first note.</p>
      </section>
      <Button variant="primary" disabled={!text.trim()} onClick={fill}>
        Fill The Form
      </Button>
    </div>
  )
}
