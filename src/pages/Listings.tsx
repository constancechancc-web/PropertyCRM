import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, ClipboardPaste, MessageCircle, Pencil, Plus, Trash2 } from 'lucide-react'
import { PageShell, headerBtn } from '../components/Shell'
import { Sheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { ContactPicker, resolveContact, type ContactChoice } from '../components/ContactPicker'
import { ExportButtons } from '../components/ExportButtons'
import { Avatar, Button, Card, Chip, ChoicePills, ConfirmButton, CopyButton, DetailGrid, Dot, Empty, IconWell, LinkButton, Pill, PillRow, SearchBox, SectionTitle, SelectInput, TextArea, TextInput, cx } from '../components/ui'
import { useIsAdmin } from '../data/auth'
import { useContactMap, useMatches, useStore } from '../data/store'
import { FURNISHING, LISTING_STATUSES, LISTING_STATUS_LABEL, PROPERTY_TYPES, TENURE, type ListingStatus, type Race } from '../lib/constants'
import { firstName, fmtNumber, rmFull, rmShort, samePhone, waLink } from '../lib/format'
import { parseListing } from '../lib/parsers'
import { useSheet } from '../lib/useSheet'
import { listingTable } from '../lib/export'
import type { Deal, Listing } from '../lib/types'
import { LeadRow } from './Leads'

const STATUS_TONE: Record<ListingStatus, 'good' | 'plain' | 'warn'> = { available: 'good', sold: 'plain', rented: 'plain', withdrawn: 'warn' }

export function listingLine(l: Listing): string {
  return [
    l.type,
    l.built_up_sqft ? `Built-up ${fmtNumber(l.built_up_sqft)} sqft` : null,
    l.land_sqft ? `Land ${fmtNumber(l.land_sqft)} sqft` : null,
    l.bedrooms != null || l.bathrooms != null ? `${l.bedrooms ?? '–'} bed / ${l.bathrooms ?? '–'} bath` : null,
    l.furnishing,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function ListingRow({ listing, matchCount, onClick }: { listing: Listing; matchCount: number; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-page md:px-6">
        <IconWell tone={listing.deal === 'rent' ? 4 : 0}>
          <Building2 size={19} strokeWidth={1.5} />
        </IconWell>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[15.5px] font-medium break-words md:line-clamp-1">{listing.address}</div>
          <div className="line-clamp-2 text-[13px] text-text-2">{listingLine(listing) || 'No details yet'}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="tnum text-[15.5px] font-semibold">{rmShort(listing.price, listing.deal) || '–'}</span>
          <span className="flex items-center gap-1.5">
            {listing.deal && (
              <span className="hidden sm:inline">
                <Chip tone={listing.deal === 'rent' ? 4 : 0}>{listing.deal === 'rent' ? 'Rent' : 'Sale'}</Chip>
              </span>
            )}
            <span className="flex items-center gap-1 text-[12.5px] text-text-2">
              <Dot tone={STATUS_TONE[listing.status]} />
              <span className="sr-only sm:not-sr-only">{LISTING_STATUS_LABEL[listing.status]}</span>
            </span>
            {matchCount > 0 && <Chip tone="brand">{matchCount} match</Chip>}
          </span>
        </div>
      </button>
    </li>
  )
}

export default function Listings() {
  const { db } = useStore()
  const contacts = useContactMap()
  const { byListing } = useMatches()
  const { params, open, close, setFilter } = useSheet()
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState<ListingFormValues | null>(null)
  const deal = params.get('deal') ?? 'all'
  const status = params.get('status') ?? 'available'

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return db.listings
      .filter((l) => deal === 'all' || l.deal === deal)
      .filter((l) => status === 'all' || l.status === status)
      .filter((l) => {
        if (!s) return true
        const o = l.owner_id ? contacts.get(l.owner_id) : undefined
        return [l.address, l.type, l.note, l.viewing_access, o?.name, o?.phone, l.tenure, l.furnishing].join(' ').toLowerCase().includes(s)
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [db.listings, deal, status, q, contacts])

  const id = params.get('id')
  const listing = id ? db.listings.find((l) => l.id === id) : undefined
  const editing = !!params.get('edit')
  const creating = !!params.get('new')
  const pasting = !!params.get('paste')
  const presetOwner = params.get('owner')
  const available = db.listings.filter((l) => l.status === 'available').length

  return (
    <PageShell
      label="Properties and owners"
      title="Listings"
      sub={`${available} available · ${db.listings.length} in total`}
      actions={
        <>
          <ExportButtons kind="Listings" build={() => listingTable(shown, contacts)} />
          <Button size="sm" className={headerBtn} icon={<ClipboardPaste size={16} strokeWidth={1.5} />} onClick={() => open({ paste: '1' })}>
            Paste From WhatsApp
          </Button>
          <Button size="sm" variant="primary" icon={<Plus size={16} strokeWidth={1.5} />} onClick={() => (setDraft(null), open({ new: '1' }))}>
            New Listing
          </Button>
        </>
      }
    >
      <Card className="flex flex-col gap-4 p-4 md:p-6">
        <SearchBox value={q} onChange={setQ} placeholder="Search address, type, owner, notes" />
        <PillRow label="Sale or rent">
          {[
            ['all', 'All'],
            ['sale', 'For Sale'],
            ['rent', 'For Rent'],
          ].map(([v, l]) => (
            <Pill key={v} active={deal === v} onClick={() => setFilter('deal', v === 'all' ? null : v)}>
              {l}
            </Pill>
          ))}
        </PillRow>
        <PillRow label="Status">
          {[...LISTING_STATUSES, 'all' as const].map((s) => (
            <Pill
              key={s}
              active={status === s}
              count={s === 'all' ? db.listings.length : db.listings.filter((l) => l.status === s).length}
              onClick={() => setFilter('status', s === 'available' ? null : s)}
            >
              {s === 'all' ? 'All' : LISTING_STATUS_LABEL[s]}
            </Pill>
          ))}
        </PillRow>
      </Card>

      <Card className="mt-4 overflow-hidden">
        {shown.length ? (
          <ul className="divide-y divide-line">
            {shown.map((l) => (
              <ListingRow key={l.id} listing={l} matchCount={byListing.get(l.id)?.length ?? 0} onClick={() => open({ id: l.id })} />
            ))}
          </ul>
        ) : (
          <Empty
            action={
              <Button variant="primary" icon={<Plus size={16} strokeWidth={1.5} />} onClick={() => open({ new: '1' })}>
                New Listing
              </Button>
            }
          >
            {db.listings.length ? 'No listings match this search or filter.' : 'No listings yet. Add a unit for sale or rent, or paste one from WhatsApp.'}
          </Empty>
        )}
      </Card>

      <Sheet open={!!listing && !editing} onClose={close} title="Listing" wide>
        {listing && <ListingDetail listing={listing} />}
      </Sheet>
      <Sheet open={!!listing && editing} onClose={() => open({ id: listing!.id })} title="Edit Listing" wide>
        {listing && <ListingForm key={listing.id} listing={listing} onDone={() => open({ id: listing.id })} />}
      </Sheet>
      <Sheet open={creating} onClose={() => (setDraft(null), close())} title="New Listing" wide>
        {creating && (
          <ListingForm
            initial={draft ?? (presetOwner ? { ...emptyListing(), owner: { mode: 'existing', id: presetOwner } } : undefined)}
            onDone={(newId) => {
              setDraft(null)
              if (newId) open({ id: newId }, true)
              else close()
            }}
          />
        )}
      </Sheet>
      <Sheet open={pasting} onClose={close} title="Paste Listing From WhatsApp" wide>
        {pasting && (
          <PasteListing
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

function ListingDetail({ listing }: { listing: Listing }) {
  const { update, remove } = useStore()
  const contacts = useContactMap()
  const { byListing } = useMatches()
  const { open, close } = useSheet()
  const nav = useNavigate()
  const toast = useToast()
  const admin = useIsAdmin()
  const owner = listing.owner_id ? contacts.get(listing.owner_id) : undefined
  const fits = byListing.get(listing.id) ?? []
  const psf = listing.deal === 'sale' && listing.price && listing.built_up_sqft ? listing.price / listing.built_up_sqft : null

  const setStatus = async (s: ListingStatus) => {
    if (await update('listings', listing.id, { status: s })) toast(`Marked ${LISTING_STATUS_LABEL[s].toLowerCase()}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {listing.deal && <Chip tone={listing.deal === 'rent' ? 4 : 0}>{listing.deal === 'rent' ? 'For Rent' : 'For Sale'}</Chip>}
          {listing.type && <Chip>{listing.type}</Chip>}
        </div>
        <div className="tnum text-[40px] leading-none font-light tracking-tight">
          {listing.price != null ? (listing.deal === 'rent' ? `${rmFull(listing.price)} /mo` : rmFull(listing.price)) : 'No price yet'}
        </div>
        {psf && <div className="tnum text-[14px] text-text-2">RM {fmtNumber(Math.round(psf))} psf</div>}
        <div className="text-[17px] break-words">{listing.address}</div>
      </div>

      <section className="flex flex-col gap-3">
        <SectionTitle>Status</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {LISTING_STATUSES.map((s) => (
            <Pill key={s} active={listing.status === s} onClick={() => setStatus(s)}>
              {LISTING_STATUS_LABEL[s]}
            </Pill>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button icon={<Pencil size={17} strokeWidth={1.5} />} onClick={() => open({ id: listing.id, edit: '1' })}>
          Edit
        </Button>
      </div>

      <DetailGrid
        items={[
          ['Type', listing.type],
          ['Built-up', listing.built_up_sqft ? `${fmtNumber(listing.built_up_sqft)} sqft` : null],
          ['Land Size', listing.land_sqft ? `${fmtNumber(listing.land_sqft)} sqft` : null],
          ['Bedrooms', listing.bedrooms],
          ['Bathrooms', listing.bathrooms],
          ['Furnishing', listing.furnishing],
          ['Tenure', listing.tenure],
          ['Viewing / Keys', listing.viewing_access],
        ]}
      />
      {listing.note && (
        <section className="flex flex-col gap-2">
          <SectionTitle>Notes</SectionTitle>
          <p className="rounded-[18px] bg-page px-4 py-3 text-[15px] break-words whitespace-pre-wrap">{listing.note}</p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionTitle>{listing.deal === 'rent' ? 'Landlord' : 'Owner'}</SectionTitle>
        {owner ? (
          <div className="flex flex-col gap-3 rounded-[18px] border border-line p-4">
            <button type="button" onClick={() => nav(`/contacts?id=${owner.id}`)} className="flex items-center gap-3 text-left">
              <Avatar id={owner.id} name={owner.name} />
              <div className="min-w-0">
                <div className="truncate text-[16px] font-medium">{owner.name}</div>
                <div className="tnum text-[14px] text-text-2">{owner.phone}</div>
              </div>
            </button>
            {owner.phone && (
              <div className="flex flex-wrap items-center gap-2">
                <LinkButton
                  variant="primary"
                  href={waLink(owner.phone, `Hi ${firstName(owner.name)}, about your unit at ${listing.address}: `)}
                  icon={<MessageCircle size={17} strokeWidth={1.5} />}
                >
                  WhatsApp
                </LinkButton>
                <CopyButton text={owner.phone} label="Copy Phone" done="Phone copied" />
              </div>
            )}
          </div>
        ) : (
          <p className="text-[14px] text-text-2">No owner linked. Edit the listing to add one.</p>
        )}
      </section>

      {listing.status === 'available' && (
        <section className="flex flex-col gap-3">
          <SectionTitle>Buyers And Tenants Who Fit</SectionTitle>
          {fits.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-[18px] border border-line">
              {fits.map((l) => (
                <LeadRow key={l.id} lead={l} contact={l.contact_id ? contacts.get(l.contact_id) : undefined} onClick={() => nav(`/leads?id=${l.id}`)} />
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-text-2">No open leads fit this listing yet.</p>
          )}
        </section>
      )}

      {admin && (
        <ConfirmButton
          label="Delete Listing"
          icon={<Trash2 size={17} strokeWidth={1.5} />}
          question="Delete this listing? This can't be undone."
          confirmLabel="Yes, Delete Listing"
          onConfirm={async () => {
            if (await remove('listings', listing.id)) {
              toast('Listing deleted')
              close()
            }
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

export interface ListingFormValues {
  deal: Deal
  address: string
  type: string
  price: string
  builtUp: string
  land: string
  bedrooms: string
  bathrooms: string
  furnishing: string
  tenure: string
  status: ListingStatus
  owner: ContactChoice
  access: string
  note: string
}

export function emptyListing(): ListingFormValues {
  return { deal: 'sale', address: '', type: '', price: '', builtUp: '', land: '', bedrooms: '', bathrooms: '', furnishing: '', tenure: '', status: 'available', owner: { mode: 'none' }, access: '', note: '' }
}

const num = (s: string) => {
  const n = parseFloat(s.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : null
}
const int = (s: string) => {
  const n = parseInt(s.replace(/\D/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

function ListingForm({ listing, initial, onDone }: { listing?: Listing; initial?: ListingFormValues; onDone: (id?: string) => void }) {
  const { db, insert, update } = useStore()
  const toast = useToast()
  const [v, setV] = useState<ListingFormValues>(() =>
    listing
      ? {
          deal: listing.deal ?? 'sale',
          address: listing.address,
          type: listing.type ?? '',
          price: listing.price?.toString() ?? '',
          builtUp: listing.built_up_sqft?.toString() ?? '',
          land: listing.land_sqft?.toString() ?? '',
          bedrooms: listing.bedrooms?.toString() ?? '',
          bathrooms: listing.bathrooms?.toString() ?? '',
          furnishing: listing.furnishing ?? '',
          tenure: listing.tenure ?? '',
          status: listing.status,
          owner: listing.owner_id ? { mode: 'existing', id: listing.owner_id } : { mode: 'none' },
          access: listing.viewing_access ?? '',
          note: listing.note ?? '',
        }
      : (initial ?? emptyListing()),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof ListingFormValues>(k: K, val: ListingFormValues[K]) => setV((p) => ({ ...p, [k]: val }))

  const save = async () => {
    const address = v.address.replace(/\s*\n\s*/g, ', ').replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim()
    if (!address) {
      setError('Add the full address.')
      return
    }
    setBusy(true)
    const ownerId = await resolveContact(
      v.owner,
      v.deal === 'rent' ? 'landlord' : 'owner',
      db.contacts,
      (row) => insert('contacts', row),
      (id, patch) => update('contacts', id, patch),
    )
    if (ownerId === false) return setBusy(false)
    const row: Partial<Listing> = {
      deal: v.deal,
      address,
      type: v.type || null,
      price: num(v.price),
      built_up_sqft: num(v.builtUp),
      land_sqft: num(v.land),
      bedrooms: int(v.bedrooms),
      bathrooms: int(v.bathrooms),
      furnishing: v.furnishing || null,
      tenure: v.tenure || null,
      status: v.status,
      owner_id: ownerId,
      viewing_access: v.access.trim() || null,
      note: v.note.trim() || null,
    }
    if (listing) {
      const ok = await update('listings', listing.id, row)
      setBusy(false)
      if (ok) {
        toast('Changes saved')
        onDone(listing.id)
      }
      return
    }
    const saved = await insert('listings', { ...row, is_example: false })
    setBusy(false)
    if (saved) {
      toast('Listing added')
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
      <ChoicePills
        label="For Sale / For Rent"
        options={[
          { value: 'sale', label: 'For Sale' },
          { value: 'rent', label: 'For Rent' },
        ]}
        value={v.deal}
        onChange={(d) => d && set('deal', d as Deal)}
      />
      <TextArea label="Full Address" rows={3} value={v.address} onChange={(e) => set('address', e.target.value)} hint="You can use several lines; it's saved as one line." />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectInput label="Type" options={PROPERTY_TYPES} placeholder="Not set" value={v.type} onChange={(e) => set('type', e.target.value)} />
        <TextInput label={v.deal === 'rent' ? 'Rent Per Month (RM)' : 'Asking Price (RM)'} inputMode="decimal" value={v.price} onChange={(e) => set('price', e.target.value)} />
        <TextInput label="Built-up (sqft)" inputMode="decimal" value={v.builtUp} onChange={(e) => set('builtUp', e.target.value)} />
        <TextInput label="Land Size (sqft)" inputMode="decimal" value={v.land} onChange={(e) => set('land', e.target.value)} />
        <TextInput label="Bedrooms" inputMode="numeric" value={v.bedrooms} onChange={(e) => set('bedrooms', e.target.value)} />
        <TextInput label="Bathrooms" inputMode="numeric" value={v.bathrooms} onChange={(e) => set('bathrooms', e.target.value)} />
        <SelectInput label="Furnishing" options={FURNISHING} placeholder="Not set" value={v.furnishing} onChange={(e) => set('furnishing', e.target.value)} />
        <SelectInput label="Tenure" options={TENURE} placeholder="Not set" value={v.tenure} onChange={(e) => set('tenure', e.target.value)} />
        <SelectInput label="Status" options={LISTING_STATUSES.map((s) => ({ value: s, label: LISTING_STATUS_LABEL[s] }))} value={v.status} onChange={(e) => set('status', e.target.value as ListingStatus)} />
      </div>
      <ContactPicker label="Owner / Landlord" contacts={db.contacts} value={v.owner} onChange={(o) => set('owner', o)} />
      <TextInput label="Viewing / Keys" value={v.access} onChange={(e) => set('access', e.target.value)} placeholder="e.g. Keys with guardhouse" />
      <TextArea label="Notes" rows={4} value={v.note} onChange={(e) => set('note', e.target.value)} />
      {error && (
        <p role="alert" className="rounded-[18px] bg-rose px-4 py-3 text-[14px] text-rose-ink">
          {error}
        </p>
      )}
      <div className="sticky bottom-0 -mx-1 flex gap-2 bg-card px-1 pt-2">
        <Button type="submit" variant="primary" disabled={busy} className="flex-1 sm:flex-none">
          {listing ? 'Save Changes' : 'Save Listing'}
        </Button>
        <Button onClick={() => onDone(listing?.id)}>Cancel</Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Paste From WhatsApp
// ---------------------------------------------------------------------------

function PasteListing({ onFill }: { onFill: (v: ListingFormValues) => void }) {
  const { db } = useStore()
  const [text, setText] = useState('')
  const p = useMemo(() => parseListing(text), [text])
  const existing = p.ownerPhone ? db.contacts.find((c) => samePhone(c.phone, p.ownerPhone)) : undefined

  const fill = () => {
    const owner: ContactChoice = existing
      ? { mode: 'existing', id: existing.id }
      : p.ownerName || p.ownerPhone
        ? { mode: 'new', name: p.ownerName ?? '', phone: p.ownerPhone ?? '', race: null as Race | null }
        : { mode: 'none' }
    onFill({
      ...emptyListing(),
      deal: p.deal ?? 'sale',
      address: p.address ?? '',
      type: p.type ?? '',
      price: p.price?.toString() ?? '',
      builtUp: p.builtUp?.toString() ?? '',
      land: p.land?.toString() ?? '',
      bedrooms: p.bedrooms?.toString() ?? '',
      bathrooms: p.bathrooms?.toString() ?? '',
      furnishing: p.furnishing ?? '',
      tenure: p.tenure ?? '',
      owner,
      note: text.trim(),
    })
  }

  const rows: [string, string | null][] = [
    ['Sale / Rent', p.deal === 'rent' ? 'For Rent' : p.deal === 'sale' ? 'For Sale' : null],
    ['Type', p.type],
    ['Address', p.address],
    ['Price', p.price != null ? (p.deal === 'rent' ? `${rmFull(p.price)} /mo` : rmFull(p.price)) : null],
    ['Built-up', p.builtUp ? `${fmtNumber(p.builtUp)} sqft` : null],
    ['Land', p.land ? `${fmtNumber(p.land)} sqft` : null],
    ['Rooms', p.bedrooms != null || p.bathrooms != null ? `${p.bedrooms ?? '–'} bed / ${p.bathrooms ?? '–'} bath` : null],
    ['Furnishing', p.furnishing],
    ['Tenure', p.tenure],
    ['Owner', [p.ownerName, p.ownerPhone].filter(Boolean).join(' · ') || null],
  ]

  return (
    <div className="flex flex-col gap-5">
      <TextArea
        label="Paste the WhatsApp message"
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'For Sale\nJalan Austin Perdana 2/8, Taman Mount Austin\nDouble storey terrace\nSelling RM680k\nOwner: Mr Lim 012-345 6789'}
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
        {existing && <p className="rounded-[18px] bg-mint px-4 py-3 text-[14px] text-mint-ink">This number already belongs to {existing.name}. The listing will be linked to them.</p>}
        <p className="text-[13px] text-text-3">You can check and change everything on the next step. The pasted text is kept in Notes.</p>
      </section>
      <Button variant="primary" disabled={!text.trim()} onClick={fill}>
        Fill The Form
      </Button>
    </div>
  )
}
