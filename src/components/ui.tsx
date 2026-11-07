import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { ArrowUpRight, Check, Copy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { initials, pastelIndex } from '../lib/format'
import { useToast } from './Toast'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export const PASTELS = [
  'bg-peach text-peach-ink',
  'bg-mint text-mint-ink',
  'bg-lilac text-lilac-ink',
  'bg-butter text-butter-ink',
  'bg-sky text-sky-ink',
  'bg-rose text-rose-ink',
] as const

// ---------------------------------------------------------------------------
// Buttons and pills
// ---------------------------------------------------------------------------

type Variant = 'primary' | 'soft' | 'ghost' | 'outline' | 'danger'
const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-ink',
  soft: 'bg-brand-soft text-brand-ink hover:bg-lilac',
  ghost: 'bg-transparent text-ink hover:bg-brand-soft',
  outline: 'bg-white text-ink border border-line hover:border-brand/40 hover:bg-brand-soft/50',
  danger: 'bg-white text-rose-ink border border-rose hover:bg-rose',
}

export function Button({
  variant = 'outline',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; icon?: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-4 text-[14px]' : 'px-5 text-[15px]',
        VARIANT[variant],
        className,
      )}
    >
      {icon}
      {children}
    </button>
  )
}

export function LinkButton({ href, variant = 'outline', icon, children, className }: { href: string; variant?: Variant; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cx('inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-medium transition-colors', VARIANT[variant], className)}
    >
      {icon}
      {children}
    </a>
  )
}

export function Pill({ active, children, onClick, count, className }: { active?: boolean; children: ReactNode; onClick?: () => void; count?: number; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[14px] font-medium whitespace-nowrap transition-colors',
        active ? 'border-brand bg-brand text-white' : 'border-line bg-white text-text-2 hover:border-brand/40 hover:text-ink',
        className,
      )}
    >
      {active && <Check size={15} strokeWidth={1.5} />}
      {children}
      {count != null && <span className={cx('tnum', active ? 'text-white/80' : 'text-text-3')}>{count}</span>}
    </button>
  )
}

export function PillRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="group" aria-label={label} className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
      {children}
    </div>
  )
}

export function Chip({ children, tone = 'plain', className }: { children: ReactNode; tone?: 'plain' | 'brand' | number; className?: string }) {
  const cls = typeof tone === 'number' ? PASTELS[tone % 6] : tone === 'brand' ? 'bg-brand-soft text-brand-ink' : 'bg-page text-text-2 border border-line'
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-[12.5px] font-medium whitespace-nowrap', cls, className)}>{children}</span>
}

export function Dot({ tone }: { tone: 'good' | 'bad' | 'warn' | 'plain' | 'none' }) {
  if (tone === 'none') return null
  const c = { good: 'bg-good', bad: 'bg-bad', warn: 'bg-warn', plain: 'bg-text-3/50' }[tone]
  return <span aria-hidden className={cx('inline-block size-2 shrink-0 rounded-full', c)} />
}

export function Avatar({ id, name, size = 44 }: { id: string; name: string | null | undefined; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', PASTELS[pastelIndex(id)])}
    >
      {initials(name)}
    </span>
  )
}

export function IconWell({ children, tone = 2, size = 44 }: { children: ReactNode; tone?: number; size?: number }) {
  return (
    <span aria-hidden style={{ width: size, height: size }} className={cx('inline-flex shrink-0 items-center justify-center rounded-full', PASTELS[tone % 6])}>
      {children}
    </span>
  )
}

export function RoundLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} aria-label={label} title={label} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink transition-colors hover:bg-brand-soft">
      <ArrowUpRight size={18} strokeWidth={1.5} />
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Barcode chart: thin vertical lines, filled in status colours, the rest pale.
// ---------------------------------------------------------------------------

export function Barcode({ segments, total, bars = 40, height = 34, label }: { segments: { value: number; color: 'good' | 'bad' | 'warn' | 'brand' }[]; total: number; bars?: number; height?: number; label: string }) {
  const sum = segments.reduce((s, x) => s + x.value, 0)
  const denom = Math.max(total, sum, 1)
  let remaining = bars
  const counts = segments.map((s) => {
    const n = s.value > 0 ? Math.max(1, Math.round((s.value / denom) * bars)) : 0
    const take = Math.min(n, remaining)
    remaining -= take
    return take
  })
  const colors: string[] = []
  segments.forEach((s, i) => {
    for (let k = 0; k < counts[i]; k++) colors.push(s.color)
  })
  while (colors.length < bars) colors.push('')
  const cls: Record<string, string> = { good: 'bg-good', bad: 'bg-bad', warn: 'bg-warn', brand: 'bg-brand', '': 'bg-bar' }
  return (
    <div role="img" aria-label={label} className="flex items-end justify-between gap-[2px]" style={{ height }}>
      {colors.map((c, i) => (
        <span key={i} className={cx('w-[2px] rounded-full', cls[c])} style={{ height: '100%' }} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

const fieldCls = 'w-full min-h-12 rounded-[18px] border border-line bg-white px-4 py-2.5 text-[16px] text-ink placeholder:text-text-3 focus:border-brand focus:outline-none focus-visible:outline-2 focus-visible:outline-brand'

export function Field({ label, hint, children, id }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode; id?: string }) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fid} className="text-[14px] font-medium text-text-2">
        {label}
      </label>
      {children(fid)}
      {hint && <div className="text-[13px] text-text-3">{hint}</div>}
    </div>
  )
}

export function TextInput({ label, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode }) {
  return <Field label={label} hint={hint}>{(id) => <input id={id} {...rest} className={cx(fieldCls, rest.className)} />}</Field>
}

export function TextArea({ label, hint, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: ReactNode }) {
  return <Field label={label} hint={hint}>{(id) => <textarea id={id} rows={3} {...rest} className={cx(fieldCls, 'resize-y', rest.className)} />}</Field>
}

export function SelectInput({ label, options, placeholder, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: readonly (string | { value: string; label: string })[]; placeholder?: string }) {
  return (
    <Field label={label}>
      {(id) => (
        <select id={id} {...rest} className={cx(fieldCls, 'appearance-none bg-[length:16px] bg-[right_16px_center] bg-no-repeat pr-10', rest.className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236F7680' stroke-width='1.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}>
          {placeholder != null && <option value="">{placeholder}</option>}
          {options.map((o) => {
            const v = typeof o === 'string' ? o : o.value
            const l = typeof o === 'string' ? o : o.label
            return (
              <option key={v} value={v}>
                {l}
              </option>
            )
          })}
        </select>
      )}
    </Field>
  )
}

export function ChoicePills<T extends string>({ label, options, value, onChange, multi }: { label: string; options: readonly { value: T; label: string }[]; value: T[] | T | null; onChange: (v: T[] | T | null) => void; multi?: boolean }) {
  const selected = Array.isArray(value) ? value : value ? [value] : []
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-[14px] font-medium text-text-2">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o.value)
          return (
            <Pill
              key={o.value}
              active={on}
              onClick={() => {
                if (multi) onChange(on ? selected.filter((x) => x !== o.value) : [...selected, o.value])
                else onChange(on ? null : o.value)
              }}
            >
              {o.label}
            </Pill>
          )
        })}
      </div>
    </fieldset>
  )
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function Card({ children, className, as: As = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  return <As className={cx('rounded-[28px] border border-line bg-card', className)}>{children}</As>
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      <p className="max-w-sm text-[15px] text-text-2">{children}</p>
      {action}
    </div>
  )
}

/** Inline confirmation, no browser dialogs. */
export function ConfirmButton({ label, question, confirmLabel, onConfirm, icon }: { label: string; question: string; confirmLabel: string; onConfirm: () => void | Promise<void>; icon?: ReactNode }) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!asking)
    return (
      <Button variant="danger" icon={icon} onClick={() => setAsking(true)}>
        {label}
      </Button>
    )
  return (
    <div role="alertdialog" aria-label={question} className="flex flex-col gap-3 rounded-[18px] border border-rose bg-rose/40 p-4">
      <p className="text-[15px] text-rose-ink">{question}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          className="bg-rose-ink hover:bg-ink"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await onConfirm()
            setBusy(false)
            setAsking(false)
          }}
        >
          {confirmLabel}
        </Button>
        <Button variant="outline" onClick={() => setAsking(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export function CopyButton({ text, label = 'Copy', done = 'Copied' }: { text: string; label?: string; done?: string }) {
  const toast = useToast()
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          toast(done)
        } catch {
          toast("Couldn't copy. Select the text and copy it.", 'error')
        }
      }}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-text-2 hover:bg-brand-soft hover:text-ink"
    >
      <Copy size={17} strokeWidth={1.5} />
    </button>
  )
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <label className="sr-only" htmlFor="search">
        Search
      </label>
      <svg aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-text-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input id="search" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cx(fieldCls, 'rounded-full pl-11')} />
    </div>
  )
}

export function DetailGrid({ items }: { items: [string, ReactNode][] }) {
  const shown = items.filter(([, v]) => v != null && v !== '' && v !== false)
  if (!shown.length) return null
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-[18px] border border-line p-4">
      {shown.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[13px] text-text-3">{k}</dt>
          <dd className="tnum text-[15px] break-words text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function useAutoFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return ref
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-[16px] font-semibold">{children}</h3>
      {action}
    </div>
  )
}
