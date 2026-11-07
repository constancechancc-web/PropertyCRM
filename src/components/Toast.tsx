import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Check, CircleAlert } from 'lucide-react'

interface Toast {
  id: number
  text: string
  kind: 'ok' | 'error'
}

const Ctx = createContext<(text: string, kind?: 'ok' | 'error') => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const n = useRef(0)
  const push = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = ++n.current
    setToasts((t) => [...t.slice(-2), { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 5000 : 3200)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-28 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-8">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="anim-sheet pointer-events-auto flex max-w-md items-center gap-2.5 rounded-full bg-ink px-5 py-3 text-[15px] text-white shadow-lg"
          >
            {t.kind === 'ok' ? <Check size={18} strokeWidth={1.5} className="text-good" /> : <CircleAlert size={18} strokeWidth={1.5} className="text-bad" />}
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  return useContext(Ctx)
}

export const SAVE_FAILED = "Couldn't save. Check your connection and try again."
