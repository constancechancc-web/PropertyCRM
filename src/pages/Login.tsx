import { useState, type FormEvent } from 'react'
import { useAuth } from '../data/auth'
import { Logo, GlassFan } from '../components/Shell'
import { Button, TextInput } from '../components/ui'

export default function Login() {
  const { signIn, notice } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(await signIn(email, password))
    setBusy(false)
  }

  const message = error ?? notice
  return (
    <div className="hero relative flex min-h-dvh items-center justify-center overflow-hidden p-4">
      <GlassFan />
      <form onSubmit={submit} className="relative flex w-full max-w-[400px] flex-col gap-4 rounded-[40px] bg-white px-6 py-8 md:px-9 md:py-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo size={72} />
          <h1 className="text-[26px] font-semibold">Constance CRM</h1>
          <p className="text-[15px] text-text-2">Sign in to see your leads and listings.</p>
        </div>
        <TextInput label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextInput label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {message && (
          <p role="alert" className="rounded-[18px] bg-rose px-4 py-3 text-[14px] text-rose-ink">
            {message}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={busy} className="mt-1 w-full">
          {busy ? 'Signing In…' : 'Sign In'}
        </Button>
      </form>
    </div>
  )
}
