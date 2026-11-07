import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { Button } from '../ui/Button'

interface InstructorLayoutProps {
  children: ReactNode
  /** Page heading shown under the app name. */
  title?: string
  actions?: ReactNode
}

/** Shared chrome for instructor pages: app name, signed-in user, logout. */
export function InstructorLayout({ children, title, actions }: InstructorLayoutProps) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  async function handleLogout() {
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      setSigningOut(false)
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link
            to="/dashboard"
            className="rounded text-lg font-bold text-slate-900 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Classroom Survey
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            {user?.email && (
              <span className="text-sm text-slate-600">
                Signed in as <span className="font-medium text-slate-800">{user.email}</span>
              </span>
            )}
            <Button size="sm" onClick={handleLogout} disabled={signingOut}>
              {signingOut ? 'Logging out...' : 'Logout'}
            </Button>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        {(title || actions) && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            {title && <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>}
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
