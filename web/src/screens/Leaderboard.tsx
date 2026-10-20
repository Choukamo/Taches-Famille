import { useEffect, useState } from 'react'
import { Skull, Trophy } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { LeaderRow, Member, Task } from '../lib/types'
import { Avatar } from '../components/Avatar'
import { labelDeadline } from '../lib/presence'

type Period = 'this_week' | 'this_month' | 'total'
type Board = 'podium' | 'shame'

export function Leaderboard({ members, tasks, refreshKey }: { members: Map<string, Member>; tasks: Task[]; refreshKey: number }) {
  const [rows, setRows] = useState<LeaderRow[]>([])
  const [shame, setShame] = useState<LeaderRow[]>([])
  const [period, setPeriod] = useState<Period>('this_month')
  const [board, setBoard] = useState<Board>('podium')

  useEffect(() => {
    supabase.rpc('leaderboard').then(({ data }) => setRows((data ?? []) as LeaderRow[]))
    supabase.rpc('shame_board').then(({ data }) => setShame((data ?? []) as LeaderRow[]))
  }, [refreshKey])

  const isShame = board === 'shame'
  const source = isShame ? shame : rows
  const sorted = [...source].sort((a, b) => b[period] - a[period])
  const max = Math.max(1, ...sorted.map((r) => Number(r[period])))
  const expired = tasks.filter((t) => t.status === 'expired').sort((a, b) => (b.expired_at ?? '').localeCompare(a.expired_at ?? '')).slice(0, 8)

  return (
    <div className="screen stack fade-in">
      <div className="screen-header">
        <h1>{isShame ? 'Tableau de la honte' : 'Classement'}</h1>
        {isShame ? <Skull color="#b42318" /> : <Trophy color="#e08a1e" />}
      </div>
      <div className="seg">
        <button className={!isShame ? 'on' : ''} onClick={() => setBoard('podium')}><Trophy size={16} style={{ verticalAlign: -3 }} /> Podium</button>
        <button className={isShame ? 'on shame' : ''} onClick={() => setBoard('shame')}><Skull size={16} style={{ verticalAlign: -3 }} /> Honte</button>
      </div>
      <div className="seg">
        <button className={period === 'this_week' ? 'on' : ''} onClick={() => setPeriod('this_week')}>Semaine</button>
        <button className={period === 'this_month' ? 'on' : ''} onClick={() => setPeriod('this_month')}>Mois</button>
        <button className={period === 'total' ? 'on' : ''} onClick={() => setPeriod('total')}>Total</button>
      </div>
      <div className="stack">
        {sorted.map((r, i) => {
          const m = members.get(r.member_id)
          if (!m) return null
          const v = Number(r[period])
          return (
            <div key={r.member_id} className={`card row ${isShame && v > 0 ? 'expired' : ''}`} style={{ gap: 12 }}>
              <span className={`rank ${isShame ? 'bad' : ''}`}>{i + 1}</span>
              <Avatar m={m} size={44} />
              <div className="stack" style={{ flex: 1, gap: 6 }}>
                <div className="row spread">
                  <strong>{m.name}</strong>
                  <span className="muted">{v} {isShame ? `ratée${v > 1 ? 's' : ''}` : `tâche${v > 1 ? 's' : ''}`}</span>
                </div>
                <div className="bar"><div style={{ width: `${(v / max) * 100}%`, background: isShame ? '#b42318' : m.color }} /></div>
              </div>
            </div>
          )
        })}
        {!isShame && rows.length === 0 && <div className="empty">Pas encore de tâche terminée.</div>}
        {isShame && sorted.every((r) => Number(r[period]) === 0) && <div className="empty">Personne à afficher : bravo à tous !</div>}
      </div>

      {isShame && expired.length > 0 && (
        <div className="card stack" style={{ gap: 10 }}>
          <h3>Dernières tâches ratées</h3>
          <ul className="mini-list">
            {expired.map((t) => (
              <li key={t.id}>
                <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                  <span>{t.title}</span>
                  <span className="small muted" style={{ fontWeight: 600 }}>
                    {t.task_assignees.map((a) => members.get(a.member_id)?.name ?? '?').join(', ')}
                    {t.deadline ? ` · limite ${labelDeadline(t.deadline)}` : ''}
                  </span>
                </div>
                <Skull size={16} color="#b42318" />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
