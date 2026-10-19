// Valeurs publiques (pas des secrets) : URL du projet Supabase, clé "anon" et clé publique VAPID.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '__SUPABASE_URL__'
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '__SUPABASE_ANON_KEY__'
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '__VAPID_PUBLIC_KEY__'
