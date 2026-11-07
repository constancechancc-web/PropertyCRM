import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/** Bottom sheet on phones, centred dialog on desktop. */
export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const html = document.documentElement
    const old = html.style.overflow
    html.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
      if (e.key === 'Tab' && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')
        if (!f.length) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    requestAnimationFrame(() => panel.current?.focus())
    return () => {
      document.removeEventListener('keydown', onKey)
      html.style.overflow = old
      prev?.focus?.()
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <div className="anim-fade absolute inset-0 bg-ink/30" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`anim-sheet relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-card focus:outline-none md:max-h-[88vh] md:rounded-[28px] ${wide ? 'md:max-w-[760px]' : 'md:max-w-[620px]'}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 md:px-7">
          <span aria-hidden className="absolute top-2 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-line md:hidden" />
          <h2 className="truncate pt-1 text-[18px] font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-brand-soft">
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:px-7">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
