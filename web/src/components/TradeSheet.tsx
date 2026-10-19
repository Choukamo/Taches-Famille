import { useState } from 'react'
import { ArrowLeftRight, Check, X } from 'lucide-react'
import type { Member, Task } from '../lib/types'
import { Avatar } from './Avatar'
import { labelDate } from '../lib/presence'

type Props = {
  me: Member
  other: Member
  theirTasks: Task[]
  myTasks: Task[]
  onSubmit: (requested: string[], offered: string[], message: string) => Promise<void>
  onClose: () => void
}

function PickList({ tasks, picked, onToggle }: { tasks: Task[]; picked: Set<string>; onToggle: (id: string) => void }) {
  if (tasks.length === 0) return <p className="muted small">Aucune tâche en cours.</p>
  return (
    <div className="stack" style={{ gap: 8 }}>
      {tasks.map((t) => {
        const on = picked.has(t.id)
        return (
          <button key={t.id} className={`pick ${on ? 'on' : ''}`} onClick={() => onToggle(t.id)}>
            <span className={`box ${on ? 'on' : ''}`}>{on && <Check size={14} strokeWidth={3} />}</span>
            <span className="stack" style={{ gap: 2, textAlign: 'left' }}>
              <strong>{t.title}</strong>
              <span className="small muted">{labelDate(t.scheduled_date)}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function TradeSheet({ me, other, theirTasks, myTasks, onSubmit, onClose }: Props) {
  const [req, setReq] = useState<Set<string>>(new Set())
  const [off, setOff] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const n = new Set(set)
    if (n.has(id)) n.delete(id); else n.add(id)
    setter(n)
  }

  const submit = async () => {
    setBusy(true); setError(null)
    try {
      await onSubmit([...req], [...off], message)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet left fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="row spread" style={{ width: '100%' }}>
          <h2 className="row" style={{ gap: 8 }}><ArrowLeftRight size={20} /> Échange avec {other.name}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>

        <div className="stack" style={{ width: '100%', gap: 8 }}>
          <p className="list-title row" style={{ gap: 6, margin: 0 }}><Avatar m={other} size={20} /> Je prends chez {other.name}</p>
          <PickList tasks={theirTasks} picked={req} onToggle={(id) => toggle(req, setReq, id)} />
        </div>

        <div className="stack" style={{ width: '100%', gap: 8 }}>
          <p className="list-title row" style={{ gap: 6, margin: 0 }}><Avatar m={me} size={20} /> Je donne en échange (facultatif)</p>
          <PickList tasks={myTasks} picked={off} onToggle={(id) => toggle(off, setOff, id)} />
        </div>

        <input className="input" placeholder="Un petit mot ? (facultatif)" value={message} onChange={(e) => setMessage(e.target.value)} style={{ width: '100%' }} />

        {error && <div className="banner error" style={{ width: '100%' }}>{error}</div>}

        <button className="btn big block" disabled={req.size === 0 || busy} onClick={submit}>
          {busy ? 'Envoi…' : off.size === 0 ? `Proposer de faire ${req.size > 1 ? 'ces tâches' : 'cette tâche'}` : `Proposer l'échange ${req.size} contre ${off.size}`}
        </button>
      </div>
    </div>
  )
}
