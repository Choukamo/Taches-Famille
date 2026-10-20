import { useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Skull, Trophy } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { LeaderRow, Member, Task } from '../lib/types'
import { Avatar } from '../components/Avatar'
import { labelDate, labelDeadline } from '../lib/presence'

type Period = 'this_week' | 'this_month' | 'total'
type Board = 'podium' | 'shame'

export function Leaderboard({ members, tasks, refreshKey }: { members: Map<string, Member>; tasks: Task[]; refreshKey: number }) {
  const [rows, setRows] = useState<LeaderRow[]>([])
  const [shame, setShame] = useState<LeaderRow[]>([])
  const [period, setPeriod] = useState<Period>('this_month')
  const [board, setBoard] = useState<Board>('podium')
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('leaderboard').then(({ data }) => setRows((data ?? []) as LeaderRow[]))
    supabase.rpc('shame_board').then(({ data }) => setShame((data ?? []) as LeaderRow[]))
  }, [refreshKey])

  const isShame = board === 'shame'
  const source = isShame ? shame : rows
  const sorted = [...source].sort((a, b) => b[period] - a[period])
  const max = Math.max(1, ...sorted.map((r) => Number(r[period])))
  const since = periodStart(period)
  const historyOf = (memberId: string) => tasks
    .filter((t) => isShame
      ? t.status === 'expired' && t.task_assignees.some((a) => a.member_id === memberId) && (t.expired_at ?? '') >= since
      : t.status === 'done' && t.done_by === memberId && (t.done_at ?? '') >= since)
    .sort((a, b) => ((isShame ? b.expired_at : b.done_at) ?? '').localeCompare((isShame ? a.expired_at : a.done_at) ?? ''))

  return (
    <div className="screen stack fade-in">
      <div className="screen-header">
        <h1>{isShame ? 'Tableau de la honte' : 'Classement'}</h1>
        {isShame ? <Skull color="#b42318" /> : <Trophy color="#e08a1e" />}
      </div>
      <div className="seg">
        <button className={!isShame ? 'on' : ''} onClick={() => { setBoard('podium'); setOpenId(null) }}><Trophy size={16} style={{ verticalAlign: -3 }} /> Podium</button>
        <button className={isShame ? 'on shame' : ''} onClick={() => { setBoard('shame'); setOpenId(null) }}><Skull size={16} style={{ verticalAlign: -3 }} /> Honte</button>
      </div>
      <div className="seg">
        <button className={period === 'this_week' ? 'on' : ''} onClick={() => setPeriod('this_week')}>Semaine</button>
        <button className={period === 'this_month' ? 'on' : ''} onClick={() => setPeriod('this_month')}>Mois</button>
        <button className={period === 'total' ? 'on' : ''} onClick={() => setPeriod('total')}>Total</button>
      </div>
      <p className="small muted">Appuie sur une personne pour voir ses tâches.</p>
      <div className="stack">
        {sorted.map((r, i) => {
          const m = members.get(r.member_id)
          if (!m) return null
          const v = Number(r[period])
          const open = openId === m.id
          const history = open ? historyOf(m.id) : []
          return (
            <div key={r.member_id} className={`card stack ${isShame && v > 0 ? 'expired' : ''}`} style={{ gap: 10 }}>
              <button className="row board-row" style={{ gap: 12 }} onClick={() => setOpenId(open ? null : m.id)}>
                <span className={`rank ${isShame ? 'bad' : ''}`}>{i + 1}</span>
                <Avatar m={m} size={44} />
                <div className="stack" style={{ flex: 1, gap: 6 }}>
                  <div className="row spread">
                    <strong>{m.name}</strong>
                    <span className="muted">{v} {isShame ? `ratée${v > 1 ? 's' : ''}` : `tâche${v > 1 ? 's' : ''}`}</span>
                  </div>
                  <div className="bar"><div style={{ width: `${(v / max) * 100}%`, background: isShame ? '#b42318' : m.color }} /></div>
                </div>
                {open ? <ChevronUp size={18} className="muted" /> : <ChevronDown size={18} className="muted" />}
              </button>
              {open && (
                history.length === 0
                  ? <p className="small muted" style={{ margin: 0 }}>{isShame ? 'Aucune tâche ratée sur cette période.' : 'Aucune tâche terminée sur cette période.'}</p>
                  : (
                    <ul className="mini-list">
                      {history.map((t) => (
                        <li key={t.id}>
                          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                            <span>{t.title}</span>
                            <span className="small muted" style={{ fontWeight: 600 }}>
                              {isShame
                                ? `Ratée ${t.deadline ? `· limite ${labelDeadline(t.deadline)}` : ''}`
                                : `Faite ${t.done_at ? labelDate(parisDay(t.done_at)) : ''}`}
                            </span>
                          </div>
                          {isShame ? <Skull size={16} color="#b42318" /> : <Check size={16} color={m.color} />}
                        </li>
                      ))}
                    </ul>
                  )
              )}
            </div>
          )
        })}
        {!isShame && rows.length === 0 && <div className="empty">Pas encore de tâche terminée.</div>}
        {isShame && sorted.every((r) => Number(r[period]) === 0) && <div className="empty">Personne à afficher : bravo à tous !</div>}
      </div>
    </div>
  )
}

function periodStart(period: Period): string {
  if (period === 'total') return ''
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(new Date())
  const p: Record<string, string> = {}
  for (const x of parts) p[x.type] = x.value
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day))
  if (period === 'this_month') d.setUTCDate(1)
  else {
    const dow = (d.getUTCDay() + 6) % 7
    d.setUTCDate(d.getUTCDate() - dow)
  }
  return d.toISOString().slice(0, 10)
}

function parisDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(iso))
}
