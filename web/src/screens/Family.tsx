import { ArrowLeftRight, CalendarDays } from 'lucide-react'
import type { Member, Task } from '../lib/types'
import { Avatar } from '../components/Avatar'
import { labelDate, todayParis } from '../lib/presence'

type Props = {
  me: Member
  members: Member[]
  tasks: Task[]
  onTrade: (other: Member) => void
}

export function Family({ me, members, tasks, onTrade }: Props) {
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
