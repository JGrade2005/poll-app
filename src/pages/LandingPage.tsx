import { LinkButton } from '../components/ui/Button'
import { useAuth } from '../components/auth/authContext'
import { useDocumentTitle } from '../lib/hooks'

export default function LandingPage() {
  const { session } = useAuth()
  useDocumentTitle(null)

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-12">
        <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">Classroom Survey</h1>
        <p className="mt-4 text-lg text-slate-700">Quick in-class understanding checks</p>
        <p className="mt-2 text-slate-600">
          Students join by scanning the QR code shown in class. No student accounts needed.
        </p>
        <div className="mt-8">
          {session ? (
            <LinkButton to="/dashboard" variant="primary" size="lg">
              Go to Dashboard
            </LinkButton>
          ) : (
            <LinkButton to="/login" variant="primary" size="lg">
              Instructor Login
            </LinkButton>
          )}
        </div>
      </div>
    </main>
  )
}
