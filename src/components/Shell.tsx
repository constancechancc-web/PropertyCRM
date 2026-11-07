import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Building2, CalendarClock, ClipboardPaste, House, KeyRound, LogOut, Plus, UserPlus, Users, UserRound, Inbox } from 'lucide-react'
import { useAuth } from '../data/auth'
import { OWNER_NAME, REN } from '../lib/constants'
import { Button, Chip, cx, IconWell } from './ui'
import { Sheet } from './Sheet'

export const NAV = [
  { to: '/today', label: 'Today', icon: House },
  { to: '/leads', label: 'Leads', icon: Inbox },
  { to: '/listings', label: 'Listings', icon: Building2 },
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/rent', label: 'Rent', icon: KeyRound },
] as const

export function Logo({ size }: { size: number }) {
  const [broken, setBroken] = useState(false)
  if (broken)
    return (
      <span
        aria-hidden
        style={{ width: size, height: size }}
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-white text-[0.4em] font-semibold text-peach-ink ring-2 ring-[#D4AF6A] ring-offset-2 ring-offset-white"
      >
        <span style={{ fontSize: size * 0.36 }}>CC</span>
      </span>
    )
  return <img src="/logo.png" alt="" width={size} height={size} onError={() => setBroken(true)} style={{ width: size, height: size }} className="shrink-0 object-contain" />
}

export function GlassFan() {
  const angles = [-60, -40, -20, 0, 20, 40, 60]
  return (
    <div aria-hidden className="pointer-events-none absolute -right-16 -bottom-20 h-[300px] w-[340px] origin-bottom-right scale-[0.6] opacity-90 md:right-[-40px] md:-bottom-16 md:scale-100">
      {angles.map((a) => (
        <span key={a} className="glass-pill" style={{ transform: `rotate(${a}deg)` }} />
      ))}
    </div>
  )
}

function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { email, role, signOut } = useAuth()
  return (
    <Sheet open={open} onClose={onClose} title="Account">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <IconWell tone={2}>
            <UserRound size={20} strokeWidth={1.5} />
          </IconWell>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-medium">{email}</div>
            <Chip tone="brand">{role === 'admin' ? 'Full access' : 'View, add, edit'}</Chip>
          </div>
        </div>
        <Button icon={<LogOut size={18} strokeWidth={1.5} />} onClick={() => signOut()}>
          Sign Out
        </Button>
      </div>
    </Sheet>
  )
}

export function AddMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const go = (to: string) => {
    onClose()
    nav(to)
  }
  const items = [
    { label: 'New Lead', to: '/leads?new=1', icon: Inbox, tone: 2 },
    { label: 'New Listing', to: '/listings?new=1', icon: Building2, tone: 0 },
    { label: 'New Contact', to: '/contacts?new=1', icon: UserPlus, tone: 1 },
    { label: 'New Tenancy', to: '/rent?new=1', icon: CalendarClock, tone: 4 },
    { label: 'Paste Lead From WhatsApp', to: '/leads?paste=1', icon: ClipboardPaste, tone: 5 },
    { label: 'Paste Listing From WhatsApp', to: '/listings?paste=1', icon: ClipboardPaste, tone: 3 },
  ]
  return (
    <Sheet open={open} onClose={onClose} title="Add">
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.label}>
            <button type="button" onClick={() => go(i.to)} className="flex min-h-14 w-full items-center gap-3 rounded-[18px] border border-line px-3 py-2 text-left text-[15px] font-medium hover:bg-brand-soft">
              <IconWell tone={i.tone} size={40}>
                <i.icon size={18} strokeWidth={1.5} />
              </IconWell>
              {i.label}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

function TopBar({ onAdd }: { onAdd: () => void }) {
  const { email, role, signOut } = useAuth()
  const [account, setAccount] = useState(false)
  return (
    <div className="flex items-center justify-between gap-3 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex min-w-0 items-center gap-3">
        <Logo size={44} />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[16px] font-semibold">{OWNER_NAME}</div>
          <div className="truncate text-[13px] text-ink/60">Property CRM · {REN}</div>
        </div>
      </div>

      <nav aria-label="Main" className="hidden items-center gap-1 rounded-full bg-white/70 p-1 backdrop-blur md:flex">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) => cx('inline-flex min-h-10 items-center rounded-full px-4 text-[15px] font-medium transition-colors', isActive ? 'bg-brand-soft text-brand-ink' : 'text-ink/70 hover:text-ink')}
          >
            {n.label}
          </NavLink>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 lg:flex">
          <div className="text-right leading-tight">
            <div className="max-w-[180px] truncate text-[13px] text-ink/70">{email}</div>
            <Chip tone="brand" className="bg-white/70">
              {role === 'admin' ? 'Full access' : 'View, add, edit'}
            </Chip>
          </div>
          <Button variant="ghost" size="sm" className="bg-white/50" icon={<LogOut size={16} strokeWidth={1.5} />} onClick={() => signOut()}>
            Sign Out
          </Button>
        </div>
        <button type="button" onClick={() => setAccount(true)} aria-label="Account" className="inline-flex size-11 items-center justify-center rounded-full bg-white/60 lg:hidden">
          <UserRound size={19} strokeWidth={1.5} />
        </button>
        <span className="hidden md:inline-flex">
          <Button variant="primary" icon={<Plus size={18} strokeWidth={1.5} />} onClick={onAdd}>
            Add
          </Button>
        </span>
      </div>
      <AccountSheet open={account} onClose={() => setAccount(false)} />
    </div>
  )
}

function BottomNav({ onAdd }: { onAdd: () => void }) {
  const left = NAV.slice(0, 2)
  const right = NAV.slice(2)
  const item = (n: (typeof NAV)[number]) => (
    <NavLink
      key={n.to}
      to={n.to}
      className={({ isActive }) => cx('flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium', isActive ? 'text-brand-ink' : 'text-text-3')}
    >
      {({ isActive }) => (
        <>
          <span className={cx('inline-flex h-7 w-11 items-center justify-center rounded-full', isActive && 'bg-brand-soft')}>
            <n.icon size={19} strokeWidth={1.5} />
          </span>
          {n.label}
        </>
      )}
    </NavLink>
  )
  return (
    <nav aria-label="Main" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex items-center gap-0.5 rounded-full border border-line bg-white/95 px-1.5 py-1.5 shadow-[0_8px_30px_rgba(37,34,58,0.08)] backdrop-blur md:hidden">
      {left.map(item)}
      <button type="button" onClick={onAdd} aria-label="Add" className="mx-0.5 inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-brand text-white">
        <Plus size={22} strokeWidth={1.5} />
      </button>
      {right.map(item)}
    </nav>
  )
}

export function PageShell({ label, title, sub, actions, children }: { label?: string; title: string; sub?: string; actions?: ReactNode; children: ReactNode }) {
  const [adding, setAdding] = useState(false)
  return (
    <div className="min-h-dvh pb-32 md:pb-16">
      <header className="hero relative overflow-hidden rounded-b-[40px] pb-[118px] md:min-h-[320px]">
        <GlassFan />
        <div className="relative mx-auto max-w-6xl px-4 md:px-8">
          <TopBar onAdd={() => setAdding(true)} />
          <div className="mt-7 flex flex-col gap-4 md:mt-9 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              {label && <div className="text-[14px] font-medium text-ink/60">{label}</div>}
              <h1 className="text-[28px] leading-tight font-medium tracking-tight md:text-[36px]">{title}</h1>
              {sub && <div className="mt-1 text-[15px] text-ink/70">{sub}</div>}
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
          </div>
        </div>
      </header>
      <main className="relative mx-auto -mt-[92px] max-w-6xl px-4 md:px-8">{children}</main>
      <BottomNav onAdd={() => setAdding(true)} />
      <AddMenu open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}

export const headerBtn = 'bg-white/80 border-white/80 backdrop-blur hover:bg-white'
