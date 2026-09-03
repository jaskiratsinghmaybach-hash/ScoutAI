import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Keep the client import-safe when Supabase is intentionally not configured.
// Auth and sync calls will fail gracefully instead of crashing the entire preview.
const fallbackUrl = 'https://placeholder.supabase.co'
const fallbackAnonKey = 'placeholder-anon-key'

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const supabase = createClient(
  supabaseUrl || fallbackUrl,
  supabaseAnonKey || fallbackAnonKey,
)
