import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './data/auth'
import { DataProvider, useStore } from './data/store'
import { ToastProvider } from './components/Toast'
import { Button } from './components/ui'
import { Logo } from './components/Shell'
import Login from './pages/Login'
import Today from './pages/Today'
import Leads from './pages/Leads'
import Listings from './pages/Listings'
import Contacts from './pages/Contacts'
import Rent from './pages/Rent'
import Sales from './pages/Sales'

function Splash({ children }: { children?: React.ReactNode }) {
  return (
    <div className="hero flex min-h-dvh flex-col items-center justify-center gap-5 p-6 text-center">
      <Logo size={72} />
      {children ?? <p className="text-[15px] text-ink/70">Loading your CRM…</p>}
    </div>
  )
}

function Routed() {
  const { ready, loadError, reload } = useStore()
  if (!ready)
    return loadError ? (
      <Splash>
        <p className="text-[15px] text-ink/80">Couldn't load the CRM. Check your connection and try again.</p>
        <Button variant="primary" onClick={() => reload()}>
          Try Again
        </Button>
      </Splash>
    ) : (
      <Splash />
    )
  return (
    <Routes>
      <Route path="/today" element={<Today />} />
      <Route path="/leads" element={<Leads />} />
      <Route path="/listings" element={<Listings />} />
      <Route path="/contacts" element={<Contacts />} />
      <Route path="/tenancy" element={<Rent />} />
      <Route path="/rent" element={<Navigate to="/tenancy" replace />} />
      <Route path="/sales" element={<Sales />} />
      <Route path="*" element={<Navigate to="/today" replace />} />
    </Routes>
  )
}

function Gate() {
  const { status } = useAuth()
  if (status === 'loading') return <Splash />
  if (status === 'out') return <Login />
  return (
    <DataProvider>
      <Routed />
    </DataProvider>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ToastProvider>
  )
}
