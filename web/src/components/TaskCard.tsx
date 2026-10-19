import { Check, Dices, RotateCcw, Trash2, Bell, CalendarDays } from 'lucide-react'
import type { Member, Task } from '../lib/types'
import { Avatar, Avatars } from './Avatar'
import { labelDate, labelInterval, todayParis } from '../lib/presence'

type Props = {
  task: Task
  members: Map<string, Member>
  meId: string
  onComplete: (t: Task) => void
  onReopen: (t: Task) => void
  onDelete: (t: Task) => void
  onReplay: (t: Task) => void
}

export function TaskCard({ task, members, meId, onComplete, onReopen, onDelete, onReplay }: Props) {
  const assignees = task.task_assignees.map((a) => members.get(a.member_id)).filter(Boolean) as Member[]
  const isMine = task.task_assignees.some((a) => a.member_id === meId)
  const creator = members.get(task.created_by)
  const done = task.status === 'done'
  const late = !done && task.scheduled_date < todayParis()
  const doneBy = task.done_by ? members.get(task.done_by) : null

  return (
    <div className={`card stack fade-in ${done ? 'done' : ''} ${isMine && !done ? 'mine' : ''} ${late ? 'late' : ''}`} style={{ gap: 10 }}>
      <div className="row spread" style={{ alignItems: 'flex-start' }}>
        <div className="stack" style={{ gap: 4 }}>
          <h3 style={{ textDecoration: done ? 'line-through' : 'none' }}>{task.title}</h3>
          {task.note && <p className="muted small">{task.note}</p>}
        </div>
        <Avatars members={assignees} />
      </div>

      <div className="row wrap" style={{ gap: 6 }}>
        {assignees.length > 0 && (
          <span className={`tag ${isMine && !done ? 'accent' : ''}`}>
            {isMine ? 'Pour toi' : `Pour ${assignees.map((m) => m.name).join(', ')}`}
          </span>
        )}
        <span className={`tag ${late ? 'warn' : ''}`}><CalendarDays size={13} /> {labelDate(task.scheduled_date)}</span>
        {!done && <span className="tag"><Bell size={13} /> {labelInterval(task.interval_minutes)}</span>}
        {task.mode === 'roulette' && (
          <button className="tag roulette" onClick={() => onReplay(task)}>
            <Dices size={13} /> Roulette · revoir
          </button>
        )}
      </div>

      <div className="row spread">
        <span className="row small muted" style={{ gap: 6 }}>
          {creator && <Avatar m={creator} size={20} />}
          {done && doneBy ? `Fait par ${doneBy.name}` : creator ? `Demandé par ${creator.name}` : ''}
        </span>
        <span className="row" style={{ gap: 6 }}>
          {task.created_by === meId && !done && (
            <button className="icon-btn" title="Supprimer" onClick={() => onDelete(task)}><Trash2 size={18} /></button>
          )}
          {done && (task.done_by === meId || task.created_by === meId) && (
            <button className="btn ghost" onClick={() => onReopen(task)}><RotateCcw size={16} /> Annuler</button>
          )}
          {!done && isMine && (
            <button className="btn" onClick={() => onComplete(task)}><Check size={18} /> C'est fait</button>
          )}
        </span>
      </div>
    </div>
  )
}
