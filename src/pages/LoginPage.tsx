import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../components/auth/authContext'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { LoadingState } from '../components/ui/LoadingState'
import { isNetworkError } from '../lib/errors'
import { useDocumentTitle } from '../lib/hooks'

export default function LoginPage() {
  const { session, loading, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useDocumentTitle('Instructor Login')

  if (loading) return <LoadingState label="Checking login..." fullPage />
  if (session) return <Navigate to={from} replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(
        isNetworkError(err)
          ? 'Could not reach the server. Check your connection and try again.'
          : 'Invalid email or password.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Instructor Login</h1>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit} noValidate>
          {error && <Alert tone="error">{error}</Alert>}

          <div>
            <label htmlFor="email" className="block font-medium text-slate-800">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
            />
          </div>

          <div>
            <label htmlFor="password" className="block font-medium text-slate-800">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
            />
          </div>

          <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
            {submitting ? 'Logging in...' : 'Log In'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          <Link to="/" className="underline hover:text-slate-900">
            Back to home
          </Link>
        </p>
      </div>
    </main>
  )
}
