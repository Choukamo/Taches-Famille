import { useState } from 'react'
import { BellOff, BellRing } from 'lucide-react'
import type { Member, Task } from '../lib/types'
import { TaskCard } from '../components/TaskCard'
import { Avatar } from '../components/Avatar'
import type { PushState } from '../lib/push'

type Props = {
  me: Member
  members: Map<string, Member>
  tasks: Task[]
  pushState: PushState
  onEnablePush: () => void
  onComplete: (t: Task) => void
  onReopen: (t: Task) => void
  onDelete: (t: Task) => void
  onReplay: (t: Task) => void
  onGoSettings: () => void
}

export function TaskList({ me, members, tasks, pushState, onEnablePush, onComplete, onReopen, onDelete, onReplay, onGoSettings }: Props) {
  const [showAllDone, setShowAllDone] = useState(false)
  const open = tasks.filter((t) => t.status === 'open')
  const mine = open.filter((t) => t.task_assignees.some((a) => a.member_id === me.id))
  const others = open.filter((t) => !t.task_assignees.some((a) => a.member_id === me.id))
  const done = tasks.filter((t) => t.status === 'done').sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''))
  const doneShown = showAllDone ? done : done.slice(0, 5)

  const common = { members, meId: me.id, onComplete, onReopen, onDelete, onReplay }

  return (
    <div className="screen stack fade-in">
      <div className="screen-header">
        <div>
          <p className="muted small">Salut {me.name}</p>
          <h1>{mine.length === 0 ? 'Rien à faire pour toi' : mine.length === 1 ? '1 tâche pour toi' : `${mine.length} tâches pour toi`}</h1>
        </div>
        <button onClick={onGoSettings} aria-label="Mon profil"><Avatar m={me} size={44} /></button>
      </div>

      {pushState !== 'on' && (
        <div className="banner">
          <BellOff size={20} style={{ flex: '0 0 auto', marginTop: 2 }} />
          <div className="stack" style={{ gap: 6 }}>
            {pushState === 'need-install' ? (
              <>
                <strong>Pour recevoir les notifications sur iPhone</strong>
                <span className="small">Dans Safari, appuie sur le bouton Partager (carré avec une flèche), puis « Sur l'écran d'accueil ». Ouvre ensuite l'appli depuis l'icône.</span>
              </>
            ) : pushState === 'denied' ? (
              <>
                <strong>Notifications bloquées</strong>
                <span className="small">Autorise-les dans les réglages du téléphone pour cette appli.</span>
              </>
            ) : pushState === 'unsupported' ? (
              <>
                <strong>Notifications non disponibles sur ce navigateur</strong>
                <span className="small">Utilise Chrome (Android) ou Safari (iPhone, iOS 16.4 ou plus).</span>
              </>
            ) : (
              <>
                <strong>Active les notifications</strong>
                <span className="small">Pour être prévenu quand on te donne une tâche.</span>
                <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={onEnablePush}><BellRing size={16} /> Activer</button>
              </>
            )}
          </div>
        </div>
      )}

      {mine.length > 0 && <p className="list-title">Pour toi</p>}
      {mine.map((t) => <TaskCard key={t.id} task={t} {...common} />)}

      {others.length > 0 && <p className="list-title">Pour les autres</p>}
      {others.map((t) => <TaskCard key={t.id} task={t} {...common} />)}

      {open.length === 0 && <div className="empty">Aucune tâche en cours. Tout est fait, bravo !</div>}

      {done.length > 0 && <p className="list-title">Terminées</p>}
      {doneShown.map((t) => <TaskCard key={t.id} task={t} {...common} />)}
      {done.length > 5 && (
        <button className="btn ghost" onClick={() => setShowAllDone((s) => !s)}>
          {showAllDone ? 'Voir moins' : `Voir les ${done.length} terminées`}
        </button>
      )}
    </div>
  )
}
