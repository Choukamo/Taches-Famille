import { useMemo, useState } from 'react'
import { Dices, UserCheck, Minus, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Member, Task } from '../lib/types'
import { Avatar } from '../components/Avatar'
import { INTERVALS, addDays, isPresentOn, todayParis } from '../lib/presence'

type Props = {
  me: Member
  members: Member[]
  onCreated: (task: Task) => void
}

export function NewTask({ me, members, onCreated }: Props) {
  const today = todayParis()
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [dateMode, setDateMode] = useState<'today' | 'tomorrow' | 'custom'>('today')
  const [customDate, setCustomDate] = useState(addDays(today, 2))
  const [mode, setMode] = useState<'direct' | 'roulette'>('direct')
  const [picked, setPicked] = useState<string[]>([])
  const [pickCount, setPickCount] = useState(1)
  const [interval, setInterval] = useState(60)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const date = dateMode === 'today' ? today : dateMode === 'tomorrow' ? addDays(today, 1) : customDate
  const presence = useMemo(() => new Map(members.map((m) => [m.id, isPresentOn(m, date)])), [members, date])
  const selectable = picked.filter((id) => presence.get(id))
  const minNeeded = mode === 'roulette' ? 2 : 1
  const canSubmit = title.trim().length > 0 && selectable.length >= minNeeded && !busy
    && (mode !== 'roulette' || (pickCount >= 1 && pickCount < selectable.length))

  const toggle = (id: string) => {
    if (!presence.get(id)) return
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('create_task', {
      p_title: title.trim(),
      p_note: note.trim() || null,
      p_scheduled_date: date,
      p_interval_minutes: interval,
      p_mode: mode,
      p_members: selectable,
      p_pick_count: mode === 'roulette' ? pickCount : 1,
    })
    if (error) {
      setBusy(false)
      setError(error.message)
      return
    }
    const created = data as Task
    const { data: full } = await supabase.from('tasks').select('*, task_assignees(*)').eq('id', created.id).single()
    // Prévenir tout de suite (sans bloquer l'interface)
    supabase.functions.invoke('send-reminders', { body: { task_id: created.id } }).catch(() => {})
    setBusy(false)
    setTitle(''); setNote(''); setPicked([]); setMode('direct'); setPickCount(1); setInterval(60); setDateMode('today')
    onCreated((full as Task) ?? { ...created, task_assignees: [] })
  }

  return (
    <div className="screen stack fade-in" style={{ gap: 18 }}>
      <div className="screen-header">
        <h1>Nouvelle tâche</h1>
      </div>

      <div className="field">
        <label>Quoi ?</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Sortir les poubelles" autoFocus />
      </div>

      <div className="field">
        <label>Un détail ? (facultatif)</label>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. Le bac jaune, avant 19h" />
      </div>

      <div className="field">
        <label>Quand ?</label>
        <div className="seg">
          <button className={dateMode === 'today' ? 'on' : ''} onClick={() => setDateMode('today')}>Aujourd'hui</button>
          <button className={dateMode === 'tomorrow' ? 'on' : ''} onClick={() => setDateMode('tomorrow')}>Demain</button>
          <button className={dateMode === 'custom' ? 'on' : ''} onClick={() => setDateMode('custom')}>Autre jour</button>
        </div>
        {dateMode === 'custom' && (
          <input className="input" type="date" min={today} value={customDate} onChange={(e) => setCustomDate(e.target.value || today)} />
        )}
      </div>

      <div className="field">
        <label>Comment choisir ?</label>
        <div className="seg">
          <button className={mode === 'direct' ? 'on' : ''} onClick={() => setMode('direct')}><UserCheck size={16} style={{ verticalAlign: -3 }} /> Je choisis</button>
          <button className={mode === 'roulette' ? 'on' : ''} onClick={() => setMode('roulette')}><Dices size={16} style={{ verticalAlign: -3 }} /> Roulette</button>
        </div>
        <p className="small muted">
          {mode === 'direct'
            ? 'Les personnes cochées reçoivent la tâche.'
            : 'La roulette tire au sort parmi les personnes cochées.'}
        </p>
      </div>

      <div className="field">
        <label>{mode === 'direct' ? 'Qui ?' : 'Qui participe au tirage ?'}</label>
        <div className="chips">
          {members.map((m) => {
            const present = presence.get(m.id)
            const on = picked.includes(m.id) && present
            return (
              <button key={m.id} className={`chip ${on ? 'on' : ''} ${!present ? 'off' : ''}`} onClick={() => toggle(m.id)} disabled={!present}
                title={present ? '' : 'Pas à la maison cette semaine'}>
                <Avatar m={m} size={26} />
                {m.name}{m.id === me.id ? ' (moi)' : ''}
              </button>
            )
          })}
        </div>
        {members.some((m) => !presence.get(m.id)) && (
          <p className="small muted">Les prénoms barrés ne sont pas à la maison cette semaine-là.</p>
        )}
      </div>

      {mode === 'roulette' && selectable.length >= 2 && (
        <div className="field">
          <label>Combien de personnes tirées au sort ?</label>
          <div className="row">
            <button className="icon-btn" onClick={() => setPickCount((c) => Math.max(1, c - 1))}><Minus size={18} /></button>
            <strong style={{ minWidth: 24, textAlign: 'center' }}>{Math.min(pickCount, selectable.length - 1)}</strong>
            <button className="icon-btn" onClick={() => setPickCount((c) => Math.min(selectable.length - 1, c + 1))}><Plus size={18} /></button>
            <span className="small muted">sur {selectable.length}</span>
          </div>
        </div>
      )}

      <div className="field">
        <label>Rappel tant que ce n'est pas fait</label>
        <div className="chips">
          {INTERVALS.map((it) => (
            <button key={it.value} className={`chip ${interval === it.value ? 'on' : ''}`} style={{ padding: '8px 12px' }} onClick={() => setInterval(it.value)}>
              {it.label}
            </button>
          ))}
        </div>
        <p className="small muted">Les rappels respectent les horaires de chacun (par défaut 10h–22h).</p>
      </div>

      {error && <div className="banner error">{error}</div>}

      <button className="btn big block" disabled={!canSubmit} onClick={submit}>
        {busy ? 'Envoi…' : mode === 'roulette' ? 'Lancer la roulette' : 'Envoyer la tâche'}
      </button>
    </div>
  )
}
