import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, Pencil, Plus, Trash2 } from 'lucide-react'
import { PageShell } from '../components/Shell'
import { Sheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { ExportButtons } from '../components/ExportButtons'
import { Avatar, Button, Card, Chip, ChoicePills, ConfirmButton, CopyButton, Empty, LinkButton, Pill, PillRow, SearchBox, SectionTitle, TextArea, TextInput } from '../components/ui'
import { useIsAdmin } from '../data/auth'
import { useStore } from '../data/store'
import { CONTACT_ROLES, CONTACT_ROLE_LABEL, RACES, type ContactRole, type Race } from '../lib/constants'
import { firstName, samePhone, waLink } from '../lib/format'
import { useSheet } from '../lib/useSheet'
import { contactTable } from '../lib/export'
import type { Contact } from '../lib/types'
import { LeadRow } from './Leads'
import { ListingRow } from './Listings'
import { useMatches } from '../data/store'

export default function Contacts() {
  const { db } = useStore()
  const { params, open, close, setFilter } = useSheet()
  const [q, setQ] = useState('')
  const role = params.get('role') ?? 'all'
  const race = params.get('race') ?? 'all'

  const counts = useMemo(() => {
    const listings = new Map<string, number>()
    const leads = new Map<string, number>()
    for (const l of db.listings) if (l.owner_id) listings.set(l.owner_id, (listings.get(l.owner_id) ?? 0) + 1)
    for (const l of db.leads) if (l.contact_id) leads.set(l.contact_id, (leads.get(l.contact_id) ?? 0) + 1)
    return { listings, leads }
  }, [db.listings, db.leads])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const digits = s.replace(/\D/g, '')
    return db.contacts
      .filter((c) => role === 'all' || c.roles.includes(role as ContactRole))
      .filter((c) => race === 'all' || (race === 'none' ? !c.race : c.race === race))
      .filter((c) => !s || c.name.toLowerCase().includes(s) || (c.note ?? '').toLowerCase().includes(s) || (digits.length >= 3 && (c.phone ?? '').replace(/\D/g, '').includes(digits)))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [db.contacts, role, race, q])

  const id = params.get('id')
  const contact = id ? db.contacts.find((c) => c.id === id) : undefined
  const editing = !!params.get('edit')
  const creating = !!params.get('new')

  return (
    <PageShell
      label="Owners, landlords, buyers and tenants"
      title="Contacts"
      sub={`${db.contacts.length} contacts`}
      actions={
        <>
          <ExportButtons kind="Contacts" build={() => contactTable(shown, db.listings, db.leads)} />
          <Button size="sm" variant="primary" icon={<Plus size={16} strokeWidth={1.5} />} onClick={() => open({ new: '1' })}>
            New Contact
          </Button>
        </>
      }
    >
      <Card className="flex flex-col gap-4 p-4 md:p-6">
        <SearchBox value={q} onChange={setQ} placeholder="Search name, phone, notes" />
        <PillRow label="Role">
          <Pill active={role === 'all'} onClick={() => setFilter('role', null)}>
            All
          </Pill>
          {CONTACT_ROLES.map((r) => (
            <Pill key={r} active={role === r} onClick={() => setFilter('role', r)}>
              {CONTACT_ROLE_LABEL[r]}
            </Pill>
          ))}
        </PillRow>
        <PillRow label="Race">
          <Pill active={race === 'all'} onClick={() => setFilter('race', null)}>
            All Races
          </Pill>
          {RACES.map((r) => (
            <Pill key={r} active={race === r} count={db.contacts.filter((c) => c.race === r).length} onClick={() => setFilter('race', r)}>
              {r}
            </Pill>
          ))}
          <Pill active={race === 'none'} count={db.contacts.filter((c) => !c.race).length} onClick={() => setFilter('race', 'none')}>
            Not Set
          </Pill>
        </PillRow>
      </Card>

      <Card className="mt-4 overflow-hidden">
        {shown.length ? (
          <ul className="divide-y divide-line">
            {shown.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => open({ id: c.id })} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-page md:px-6">
                  <Avatar id={c.id} name={c.name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[16px] font-medium">{c.name}</div>
                    <div className="tnum truncate text-[13.5px] text-text-2">
                      {[c.phone, `${counts.listings.get(c.id) ?? 0} listings · ${counts.leads.get(c.id) ?? 0} leads`].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="hidden shrink-0 flex-wrap justify-end gap-1.5 sm:flex">
                    {c.race && <Chip>{c.race}</Chip>}
                    {c.roles.map((r) => (
                      <Chip key={r} tone="brand">
                        {CONTACT_ROLE_LABEL[r]}
                      </Chip>
                    ))}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            action={
              <Button variant="primary" icon={<Plus size={16} strokeWidth={1.5} />} onClick={() => open({ new: '1' })}>
                New Contact
              </Button>
            }
          >
            {db.contacts.length ? 'No contacts match this search or filter.' : 'No contacts yet. Add owners, landlords, buyers and tenants here.'}
          </Empty>
        )}
      </Card>

      <Sheet open={!!contact && !editing} onClose={close} title="Contact" wide>
        {contact && <ContactDetail contact={contact} />}
      </Sheet>
      <Sheet open={!!contact && editing} onClose={() => open({ id: contact!.id })} title="Edit Contact">
        {contact && <ContactForm key={contact.id} contact={contact} onDone={() => open({ id: contact.id })} />}
      </Sheet>
      <Sheet open={creating} onClose={close} title="New Contact">
        {creating && <ContactForm onDone={(newId) => (newId ? open({ id: newId }, true) : close())} />}
      </Sheet>
    </PageShell>
  )
}

function ContactDetail({ contact }: { contact: Contact }) {
  const { db, remove } = useStore()
  const { byListing } = useMatches()
  const { open, close } = useSheet()
  const nav = useNavigate()
  const toast = useToast()
  const admin = useIsAdmin()
  const listings = db.listings.filter((l) => l.owner_id === contact.id)
  const leads = db.leads.filter((l) => l.contact_id === contact.id)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <Avatar id={contact.id} name={contact.name} size={56} />
        <div className="min-w-0 flex-1">
          <div className="text-[22px] leading-tight font-semibold break-words">{contact.name}</div>
          {contact.phone && (
            <div className="tnum flex items-center text-[15px] text-text-2">
              {contact.phone}
              <CopyButton text={contact.phone} label="Copy Phone" done="Phone copied" />
            </div>
          )}
          <div className="mt-1 flex flex-wrap gap-1.5">
            {contact.race && <Chip>{contact.race}</Chip>}
            {contact.roles.map((r) => (
              <Chip key={r} tone="brand">
                {CONTACT_ROLE_LABEL[r]}
              </Chip>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {contact.phone && (
          <LinkButton variant="primary" href={waLink(contact.phone, `Hi ${firstName(contact.name)}, `)} icon={<MessageCircle size={17} strokeWidth={1.5} />}>
            WhatsApp
          </LinkButton>
        )}
        <Button icon={<Pencil size={17} strokeWidth={1.5} />} onClick={() => open({ id: contact.id, edit: '1' })}>
          Edit
        </Button>
      </div>
      {contact.note && (
        <section className="flex flex-col gap-2">
          <SectionTitle>Notes</SectionTitle>
          <p className="rounded-[18px] bg-page px-4 py-3 text-[15px] break-words whitespace-pre-wrap">{contact.note}</p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionTitle
          action={
            <Button size="sm" variant="soft" icon={<Plus size={15} strokeWidth={1.5} />} onClick={() => nav(`/listings?new=1&owner=${contact.id}`)}>
              Add Their Listing
            </Button>
          }
        >
          Listings They Own
        </SectionTitle>
        {listings.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-[18px] border border-line">
            {listings.map((l) => (
              <ListingRow key={l.id} listing={l} matchCount={byListing.get(l.id)?.length ?? 0} onClick={() => nav(`/listings?id=${l.id}`)} />
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-text-2">No listings yet.</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle
          action={
            <Button size="sm" variant="soft" icon={<Plus size={15} strokeWidth={1.5} />} onClick={() => nav(`/leads?new=1&contact=${contact.id}`)}>
              Add Enquiry
            </Button>
          }
        >
          Their Enquiries
        </SectionTitle>
        {leads.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-[18px] border border-line">
            {leads.map((l) => (
              <LeadRow key={l.id} lead={l} contact={contact} onClick={() => nav(`/leads?id=${l.id}`)} />
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-text-2">No enquiries yet.</p>
        )}
      </section>

      {admin && (
        <ConfirmButton
          label="Delete Contact"
          icon={<Trash2 size={17} strokeWidth={1.5} />}
          question={
            listings.length || leads.length
              ? `Delete ${contact.name}? Their ${listings.length} listings and ${leads.length} leads stay, but lose the link to this contact. This can't be undone.`
              : `Delete ${contact.name}? This can't be undone.`
          }
          confirmLabel="Yes, Delete Contact"
          onConfirm={async () => {
            if (await remove('contacts', contact.id)) {
              toast('Contact deleted')
              close()
            }
          }}
        />
      )}
    </div>
  )
}

function ContactForm({ contact, onDone }: { contact?: Contact; onDone: (id?: string) => void }) {
  const { db, insert, update } = useStore()
  const toast = useToast()
  const [name, setName] = useState(contact?.name ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [race, setRace] = useState<Race | null>(contact?.race ?? null)
  const [roles, setRoles] = useState<ContactRole[]>(contact?.roles ?? [])
  const [note, setNote] = useState(contact?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const dupe = phone.replace(/\D/g, '').length >= 9 ? db.contacts.find((c) => c.id !== contact?.id && samePhone(c.phone, phone)) : undefined

  const save = async () => {
    if (!name.trim()) return setError('Add a name.')
    setBusy(true)
    const row = { name: name.trim(), phone: phone.trim() || null, race, roles, note: note.trim() || null }
    if (contact) {
      const ok = await update('contacts', contact.id, row)
      setBusy(false)
      if (ok) {
        toast('Changes saved')
        onDone(contact.id)
      }
      return
    }
    const saved = await insert('contacts', { ...row, is_example: false })
    setBusy(false)
    if (saved) {
      toast('Contact added')
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
      <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      <TextInput label="WhatsApp Number" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="012-345 6789" autoComplete="off" />
      {dupe && <p className="rounded-[18px] bg-butter px-4 py-3 text-[14px] text-butter-ink">This number already belongs to {dupe.name}.</p>}
      <ChoicePills label="Race" options={RACES.map((r) => ({ value: r, label: r }))} value={race} onChange={(r) => setRace((r as Race) ?? null)} />
      <ChoicePills label="Role" multi options={CONTACT_ROLES.map((r) => ({ value: r, label: CONTACT_ROLE_LABEL[r] }))} value={roles} onChange={(r) => setRoles((r as ContactRole[]) ?? [])} />
      <TextArea label="Notes" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      {error && (
        <p role="alert" className="rounded-[18px] bg-rose px-4 py-3 text-[14px] text-rose-ink">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={busy} className="flex-1 sm:flex-none">
          {contact ? 'Save Changes' : 'Save Contact'}
        </Button>
        <Button onClick={() => onDone(contact?.id)}>Cancel</Button>
      </div>
    </form>
  )
}
