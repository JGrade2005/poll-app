/** Shown when VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY were not provided at build time. */
export function ConfigMissing() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-xl rounded-2xl border border-amber-300 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Supabase is not configured</h1>
        <p className="mt-3 text-slate-700">
          This build is missing <code className="font-mono">VITE_SUPABASE_URL</code> and/or{' '}
          <code className="font-mono">VITE_SUPABASE_PUBLISHABLE_KEY</code>.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-6 text-slate-700">
          <li>
            Local development: copy <code className="font-mono">.env.example</code> to{' '}
            <code className="font-mono">.env.local</code>, fill in the values, and restart{' '}
            <code className="font-mono">npm run dev</code>.
          </li>
          <li>
            Cloudflare: add both as build variables (Settings → Build → Variables and secrets), then
            rebuild. Vite reads them at build time.
          </li>
        </ul>
      </div>
    </main>
  )
}
