import type { Member, Preset, Recurrence, Task, Trade } from './types'

// Dernière copie des données, gardée sur le téléphone pour le mode hors-ligne (lecture seule).
const KEY = 'tf-cache-v1'

export type Cached = {
  me?: Member | null
  members?: Member[] | null
  tasks?: Task[] | null
  trades?: Trade[] | null
  presets?: Preset[] | null
  recurrences?: Recurrence[] | null
  at?: number
}

export function loadCache(): Cached | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Cached) : null
  } catch {
    return null
  }
}

export function saveCache(patch: Cached) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...(loadCache() ?? {}), ...patch, at: Date.now() }))
  } catch {
    // stockage plein ou indisponible : tant pis, le mode hors-ligne sera juste moins à jour
  }
}

export function clearCache() {
  try { localStorage.removeItem(KEY) } catch { /* rien */ }
}

export function cacheAge(): string {
  const at = loadCache()?.at
  if (!at) return ''
  const min = Math.round((Date.now() - at) / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `il y a ${h} h`
  return `il y a ${Math.round(h / 24)} jours`
}
