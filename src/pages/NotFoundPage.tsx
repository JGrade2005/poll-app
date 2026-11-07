import { LinkButton } from '../components/ui/Button'
import { useDocumentTitle } from '../lib/hooks'

export default function NotFoundPage() {
  useDocumentTitle('Page not found')
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-bold text-slate-900">Page not found</h1>
        <p className="mt-3 text-slate-700">
          Students: scan the QR code shown in class to open the survey.
        </p>
        <LinkButton to="/" className="mt-6">
          Go to home page
        </LinkButton>
      </div>
    </main>
  )
}
