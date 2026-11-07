import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { RACES, type Race } from '../lib/constants'
import { samePhone } from '../lib/format'
import type { Contact } from '../lib/types'
import { Avatar, Button, ChoicePills, Field, TextInput } from './ui'

export type ContactChoice = { mode: 'none' } | { mode: 'existing'; id: string } | { mode: 'new'; name: string; phone: string; race: Race | null }

export function ContactPicker({ label, contacts, value, onChange }: { label: string; contacts: Contact[]; value: ContactChoice; onChange: (v: ContactChoice) => void }) {
  const [q, setQ] = useState('')
  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    const digits = s.replace(/\D/g, '')
    const list = s
      ? contacts.filter((c) => c.name.toLowerCase().includes(s) || (digits.length >= 3 && (c.phone ?? '').replace(/\D/g, '').includes(digits)))
      : contacts.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))
    return list.slice(0, 6)
  }, [q, contacts])

  if (value.mode === 'existing') {
    const c = contacts.find((x) => x.id === value.id)
    return (
      <Field label={label}>
        {() => (
          <div className="flex items-center gap-3 rounded-[18px] border border-line p-3">
            {c && <Avatar id={c.id} name={c.name} size={40} />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-medium">{c?.name ?? 'Contact'}</div>
              <div className="tnum truncate text-[13px] text-text-2">{c?.phone}</div>
            </div>
            <Button size="sm" onClick={() => onChange({ mode: 'none' })}>
              Change
            </Button>
          </div>
        )}
      </Field>
    )
  }

  if (value.mode === 'new') {
    const dupe = value.phone.replace(/\D/g, '').length >= 9 ? contacts.find((c) => samePhone(c.phone, value.phone)) : undefined
    return (
      <fieldset className="flex flex-col gap-3 rounded-[18px] border border-line p-4">
        <legend className="px-1 text-[14px] font-medium text-text-2">{label}: New Contact</legend>
        <TextInput label="Name" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} autoComplete="off" />
        <TextInput label="WhatsApp Number" inputMode="tel" value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} placeholder="012-345 6789" autoComplete="off" />
        {dupe && (
          <div className="flex flex-wrap items-center gap-2 rounded-[18px] bg-butter px-4 py-3 text-[14px] text-butter-ink">
            This number belongs to {dupe.name}.
            <Button size="sm" variant="outline" onClick={() => onChange({ mode: 'existing', id: dupe.id })}>
              Use {dupe.name}
            </Button>
          </div>
        )}
        <ChoicePills label="Race" options={RACES.map((r) => ({ value: r, label: r }))} value={value.race} onChange={(r) => onChange({ ...value, race: (r as Race) ?? null })} />
        <div>
          <Button size="sm" variant="ghost" onClick={() => onChange({ mode: 'none' })}>
            Pick Existing Contact Instead
          </Button>
        </div>
      </fieldset>
    )
  }

  return (
    <Field label={label}>
      {(id) => (
        <div className="flex flex-col gap-2">
          <input
            id={id}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or phone"
            className="min-h-12 w-full rounded-[18px] border border-line bg-white px-4 text-[16px] placeholder:text-text-3 focus:border-brand focus:outline-none"
            autoComplete="off"
          />
          {results.length > 0 && (
            <ul className="flex flex-col rounded-[18px] border border-line">
              {results.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => onChange({ mode: 'existing', id: c.id })} className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left hover:bg-brand-soft">
                    <Avatar id={c.id} name={c.name} size={34} />
                    <span className="min-w-0 flex-1 truncate text-[15px]">{c.name}</span>
                    <span className="tnum text-[13px] text-text-3">{c.phone}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div>
            <Button size="sm" variant="soft" icon={<Plus size={16} strokeWidth={1.5} />} onClick={() => onChange({ mode: 'new', name: q && !/\d/.test(q) ? q : '', phone: /\d{3}/.test(q) ? q : '', race: null })}>
              New Contact
            </Button>
          </div>
        </div>
      )}
    </Field>
  )
}

/** Save a ContactChoice: returns the contact id (creating the contact or adding a role when needed). */
export async function resolveContact(
  choice: ContactChoice,
  role: Contact['roles'][number],
  contacts: Contact[],
  insert: (row: Partial<Contact>) => Promise<Contact | null>,
  update: (id: string, patch: Partial<Contact>) => Promise<boolean>,
): Promise<string | null | false> {
  if (choice.mode === 'none') return null
  if (choice.mode === 'existing') {
    const c = contacts.find((x) => x.id === choice.id)
    if (c && !c.roles.includes(role)) await update(c.id, { roles: [...c.roles, role] })
    return choice.id
  }
  if (!choice.name.trim()) return null
  const dupe = contacts.find((c) => samePhone(c.phone, choice.phone))
  if (dupe) return resolveContact({ mode: 'existing', id: dupe.id }, role, contacts, insert, update)
  const c = await insert({ name: choice.name.trim(), phone: choice.phone.trim() || null, race: choice.race, roles: [role], note: null, is_example: false })
  return c ? c.id : false
}
