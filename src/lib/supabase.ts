import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
// Publishable key (sb_publishable_...). The legacy anon key name is still
// accepted so older .env files keep working.
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined

/** False when .env.local (or the hosting provider's env vars) are missing. */
export const supabaseConfigured = Boolean(url && publishableKey)

// The publishable key is designed to be public: it maps to the Postgres role
// "anon" (or "authenticated" once the instructor logs in), and Row Level
// Security in supabase/migrations decides what it can do.
// Never use a secret / service_role key here.
export const supabase = createClient(
  url || 'http://localhost:54321',
  publishableKey || 'missing-publishable-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  },
)
