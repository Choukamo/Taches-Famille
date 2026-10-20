import { ArrowLeftRight, CalendarDays, Dices, Hourglass, Repeat, Trash2 } from 'lucide-react'
import type { Member, Recurrence, Task } from '../lib/types'
import { Avatar } from '../components/Avatar'
import { hhmm, labelDate, labelDays, todayParis } from '../lib/presence'

type Props = {
  me: Member
  members: Member[]
  tasks: Task[]
  recurrences: Recurrence[]
  onTrade: (other: Member) => void
  onDeleteRecurrence: (r: Recurrence) => void
}

export function Family({ me, members, tasks, recurrences, onTrade, onDeleteRecurrence }: Props) {
  const byId = new Map(members.map((m) => [m.id, m]))
  const open = tasks.filter((t) => t.status === 'open')
  const today = todayParis()
  const total = open.length

  return (
    <div className="screen stack fade-in">
      <div className="screen-header">
        <div>
          <p className="muted small">Vue d'ensemble</p>
          <h1>{total === 0 ? 'Rien en cours' : total === 1 ? '1 tâche en cours' : `${total} tâches en cours`}</h1>
        </div>
      </div>
      <p className="muted small">Tu vois une tâche qui te plaît chez quelqu'un ? Propose-lui un échange.</p>

      {recurrences.length > 0 && (
        <div className="card stack" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 8 }}><Repeat size={18} /><h3>Tâches qui se répètent</h3></div>
          <ul className="mini-list">
            {recurrences.map((r) => (
              <li key={r.id}>
                <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                  <span>{r.title}</span>
                  <span className="small muted" style={{ fontWeight: 600 }}>
                    {labelDays(r.days)} à {hhmm(r.at_time)}{r.deadline_time ? <> · <Hourglass size={12} style={{ verticalAlign: -1 }} /> avant {hhmm(r.deadline_time)}</> : null} ·{' '}
                    {r.mode === 'roulette' ? <><Dices size={13} style={{ verticalAlign: -2 }} /> roulette entre </> : ''}
                    {r.members.map((id) => byId.get(id)?.name ?? '?').join(', ')}
                  </span>
                </div>
                <button className="icon-btn" onClick={() => onDeleteRecurrence(r)} title="Supprimer"><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {members.map((m) => {
        const theirs = open.filter((t) => t.task_assignees.some((a) => a.member_id === m.id))
        const isMe = m.id === me.id
        return (
          <div key={m.id} className="card stack" style={{ gap: 10 }}>
            <div className="row spread">
              <div className="row" style={{ gap: 10 }}>
                <Avatar m={m} size={40} />
                <div className="stack" style={{ gap: 0 }}>
                  <h3>{m.name}{isMe ? ' (moi)' : ''}</h3>
                  <span className="small muted">{theirs.length === 0 ? 'Rien à faire' : theirs.length === 1 ? '1 tâche' : `${theirs.length} tâches`}</span>
                </div>
              </div>
              {!isMe && theirs.length > 0 && (
                <button className="btn ghost" onClick={() => onTrade(m)}><ArrowLeftRight size={16} /> Échanger</button>
              )}
            </div>
            {theirs.length > 0 && (
              <ul className="mini-list">
                {theirs.map((t) => {
                  const late = t.scheduled_date < today
                  const shared = t.task_assignees.length > 1
                  return (
                    <li key={t.id}>
                      <span>{t.title}{shared ? <span className="small muted"> (à plusieurs)</span> : null}</span>
                      <span className={`tag ${late ? 'warn' : ''}`}><CalendarDays size={12} /> {labelDate(t.scheduled_date)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
