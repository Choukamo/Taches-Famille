import { useMemo, useState } from 'react'
import { Dices, UserCheck, Minus, Plus, Repeat, X, BookmarkPlus, Pencil, Hourglass } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Member, Preset, Task } from '../lib/types'
import { Avatar } from '../components/Avatar'
import { DAY_LABELS, INTERVALS, addDays, isPresentOn, parisToIso, todayParis } from '../lib/presence'

type Props = {
  me: Member
  members: Member[]
  presets: Preset[]
  onCreated: (task: Task) => void
  onRecurrenceCreated: () => void
}

export function NewTask({ me, members, presets, onCreated, onRecurrenceCreated }: Props) {
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
  const [repeat, setRepeat] = useState(false)
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7])
  const [atTime, setAtTime] = useState('20:00')
  const [editPresets, setEditPresets] = useState(false)
  const [hasDeadline, setHasDeadline] = useState(false)
  const [deadlineDate, setDeadlineDate] = useState<string | null>(null)
  const [deadlineTime, setDeadlineTime] = useState('21:00')

  const date = dateMode === 'today' ? today : dateMode === 'tomorrow' ? addDays(today, 1) : customDate
  const presence = useMemo(() => new Map(members.map((m) => [m.id, repeat || isPresentOn(m, date)])), [members, date, repeat])
  const selectable = picked.filter((id) => presence.get(id))
  const minNeeded = mode === 'roulette' ? 2 : 1
  const canSubmit = title.trim().length > 0 && selectable.length >= minNeeded && !busy
    && (mode !== 'roulette' || (pickCount >= 1 && pickCount < selectable.length))
    && (!repeat || (days.length >= 1 && /^\d{2}:\d{2}$/.test(atTime)))
    && (!hasDeadline || (/^\d{2}:\d{2}$/.test(deadlineTime) && (!repeat || deadlineTime > atTime)))
  const dlDate = deadlineDate ?? date
  const deadlineIso = hasDeadline && !repeat ? parisToIso(dlDate < date ? date : dlDate, deadlineTime) : null
  const titleIsPreset = presets.some((p) => p.title.toLowerCase() === title.trim().toLowerCase())

  const toggleDay = (d: number) => setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]))
  const savePreset = async () => {
    const { error } = await supabase.rpc('add_preset', { p_title: title.trim() })
    if (error) setError(error.message)
  }
  const removePreset = async (p: Preset) => {
    if (!confirm(`Retirer « ${p.title} » de la liste ?`)) return
    const { error } = await supabase.rpc('delete_preset', { p_id: p.id })
    if (error) setError(error.message)
  }

  const toggle = (id: string) => {
    if (!presence.get(id)) return
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    if (repeat) {
      const { error } = await supabase.rpc('create_recurrence', {
        p_title: title.trim(),
        p_note: note.trim() || null,
        p_mode: mode,
        p_members: selectable,
        p_pick_count: mode === 'roulette' ? pickCount : 1,
        p_interval_minutes: interval,
        p_days: days,
        p_at_time: atTime,
        p_deadline_time: hasDeadline ? deadlineTime : null,
      })
      setBusy(false)
      if (error) { setError(error.message); return }
      setTitle(''); setNote(''); setPicked([]); setMode('direct'); setPickCount(1); setInterval(60); setRepeat(false); setDays([1, 2, 3, 4, 5, 6, 7]); setAtTime('20:00'); setHasDeadline(false); setDeadlineDate(null)
      onRecurrenceCreated()
      return
    }
    const { data, error } = await supabase.rpc('create_task', {
      p_title: title.trim(),
      p_note: note.trim() || null,
      p_scheduled_date: date,
      p_interval_minutes: interval,
      p_mode: mode,
      p_members: selectable,
      p_pick_count: mode === 'roulette' ? pickCount : 1,
      p_deadline: deadlineIso,
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
    setTitle(''); setNote(''); setPicked([]); setMode('direct'); setPickCount(1); setInterval(60); setDateMode('today'); setHasDeadline(false); setDeadlineDate(null)
    onCreated((full as Task) ?? { ...created, task_assignees: [] })
  }

  return (
    <div className="screen stack fade-in" style={{ gap: 18 }}>
      <div className="screen-header">
        <h1>Nouvelle tâche</h1>
      </div>

      <div className="field">
        <label>Quoi ?</label>
        {presets.length > 0 && (
          <div className="chips">
            {presets.map((p) => (
              <button key={p.id} className={`chip sm preset ${title === p.title ? 'on' : ''}`}
                onClick={() => (editPresets ? removePreset(p) : setTitle(p.title))}>
                {editPresets && <X size={14} />}{p.title}
              </button>
            ))}
            <button className={`chip sm ghost ${editPresets ? 'on' : ''}`} onClick={() => setEditPresets((v) => !v)} title="Modifier la liste">
              <Pencil size={14} />{editPresets ? 'Terminé' : 'Modifier'}
            </button>
          </div>
        )}
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ou écris autre chose…" />
        {title.trim().length > 1 && !titleIsPreset && (
          <button className="link-btn" onClick={savePreset}><BookmarkPlus size={16} /> Garder « {title.trim()} » dans la liste</button>
        )}
      </div>

      <div className="field">
        <label>Se répète ?</label>
        <div className="seg">
          <button className={!repeat ? 'on' : ''} onClick={() => setRepeat(false)}>Une seule fois</button>
          <button className={repeat ? 'on' : ''} onClick={() => setRepeat(true)}><Repeat size={16} style={{ verticalAlign: -3 }} /> Régulièrement</button>
        </div>
      </div>

      <div className="field">
        <label>Un détail ? (facultatif)</label>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. Le bac jaune, avant 19h" />
      </div>

      {repeat ? (
        <div className="field">
          <label>Quels jours, à quelle heure ?</label>
          <div className="chips">
            {DAY_LABELS.map((l, i) => (
              <button key={l} className={`chip sm day ${days.includes(i + 1) ? 'on' : ''}`} onClick={() => toggleDay(i + 1)}>{l}</button>
            ))}
            <button className="chip sm ghost" onClick={() => setDays([1, 2, 3, 4, 5, 6, 7])}>Tous les jours</button>
          </div>
          <div className="row">
            <span className="small muted">La tâche est créée chaque jour coché à</span>
            <input className="input" type="time" value={atTime} onChange={(e) => setAtTime(e.target.value)} style={{ width: 'auto' }} />
          </div>
          <p className="small muted">Si quelqu'un n'est pas à la maison cette semaine-là, il est sauté automatiquement.</p>
        </div>
      ) : (
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
      )}

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
        {!repeat && members.some((m) => !presence.get(m.id)) && (
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
        <label>Date limite ?</label>
        <div className="seg">
          <button className={!hasDeadline ? 'on' : ''} onClick={() => setHasDeadline(false)}>Pas de limite</button>
          <button className={hasDeadline ? 'on' : ''} onClick={() => setHasDeadline(true)}><Hourglass size={16} style={{ verticalAlign: -3 }} /> Avec limite</button>
        </div>
        {hasDeadline && (
          <>
            <div className="row wrap" style={{ gap: 8 }}>
              {!repeat && <input className="input" type="date" min={date} value={dlDate < date ? date : dlDate} onChange={(e) => setDeadlineDate(e.target.value || null)} style={{ flex: 1 }} />}
              {repeat && <span className="small muted">Le même jour, avant</span>}
              <input className="input" type="time" value={deadlineTime} onChange={(e) => setDeadlineTime(e.target.value)} style={{ width: 'auto' }} />
            </div>
            {repeat && deadlineTime <= atTime && <p className="small" style={{ color: '#b42318' }}>La limite doit être après {atTime.replace(':', 'h')}.</p>}
            <p className="small muted">Pas faite à l'heure = tâche ratée, impossible à valider, et elle compte au tableau de la honte.</p>
          </>
        )}
      </div>

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
        {busy ? 'Envoi…' : repeat ? 'Programmer la tâche' : mode === 'roulette' ? 'Lancer la roulette' : 'Envoyer la tâche'}
      </button>
    </div>
  )
}
