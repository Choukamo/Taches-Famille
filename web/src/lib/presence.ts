import type { Member } from './types'

export function todayParis(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
}

function mondayOf(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00Z')
  const dow = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dow)
  return d
}

export function isPresentOn(m: Member, dateStr: string): boolean {
  if (!m.alternating || !m.present_week_start) return true
  const weeks = Math.round((mondayOf(dateStr).getTime() - mondayOf(m.present_week_start).getTime()) / (7 * 86400000))
  return ((weeks % 2) + 2) % 2 === 0
}

export function hhmm(t: string): string {
  return t.slice(0, 5).replace(':', 'h')
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function labelDate(dateStr: string): string {
  const today = todayParis()
  if (dateStr === today) return "aujourd'hui"
  if (dateStr === addDays(today, 1)) return 'demain'
  if (dateStr === addDays(today, -1)) return 'hier'
  const d = new Date(dateStr + 'T12:00:00Z')
  const diff = Math.round((d.getTime() - new Date(today + 'T12:00:00Z').getTime()) / 86400000)
  const s = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d)
  return diff < 0 ? `${s} (en retard)` : s
}

export function labelInterval(min: number): string {
  if (min < 60) return `toutes les ${min} min`
  if (min === 60) return 'toutes les heures'
  if (min % 60 === 0 && min < 1440) return `toutes les ${min / 60} h`
  if (min === 1440) return 'une fois par jour'
  return `toutes les ${Math.round(min / 60)} h`
}

export const INTERVALS: { value: number; label: string }[] = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 h' },
  { value: 120, label: '2 h' },
  { value: 240, label: '4 h' },
  { value: 1440, label: '1 fois par jour' },
]
