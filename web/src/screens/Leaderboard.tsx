import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { LeaderRow, Member } from '../lib/types'
import { Avatar } from '../components/Avatar'

type Period = 'this_week' | 'this_month' | 'total'

export function Leaderboard({ members, refreshKey }: { members: Map<string, Member>; refreshKey: number }) {
  const [rows, setRows] = useState<LeaderRow[]>([])
  const [period, setPeriod] = useState<Period>('this_month')

  useEffect(() => {
    supabase.rpc('leaderboard').then(({ data }) => setRows((data ?? []) as LeaderRow[]))
  }, [refreshKey])

  const sorted = [...rows].sort((a, b) => b[period] - a[period])
  const max = Math.max(1, ...sorted.map((r) => Number(r[period])))

  return (
    <div className="screen stack fade-in">
      <div className="screen-header">
        <h1>Classement</h1>
        <Trophy color="#e08a1e" />
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
            <div key={r.member_id} className="card row" style={{ gap: 12 }}>
              <span className="rank">{i + 1}</span>
              <Avatar m={m} size={44} />
              <div className="stack" style={{ flex: 1, gap: 6 }}>
                <div className="row spread">
                  <strong>{m.name}</strong>
                  <span className="muted">{v} tâche{v > 1 ? 's' : ''}</span>
                </div>
                <div className="bar"><div style={{ width: `${(v / max) * 100}%`, background: m.color }} /></div>
              </div>
            </div>
          )
        })}
        {rows.length === 0 && <div className="empty">Pas encore de tâche terminée.</div>}
      </div>
    </div>
  )
}
