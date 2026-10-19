import { ArrowLeftRight, Check, X } from 'lucide-react'
import type { Member, Task, Trade } from '../lib/types'
import { Avatar } from './Avatar'

type Props = {
  trade: Trade
  members: Map<string, Member>
  tasks: Map<string, Task>
  meId: string
  onRespond: (t: Trade, accept: boolean) => void
  onCancel: (t: Trade) => void
}

export function TradeCard({ trade, members, tasks, meId, onRespond, onCancel }: Props) {
  const from = members.get(trade.from_member)
  const to = members.get(trade.to_member)
  if (!from || !to) return null
  const incoming = trade.to_member === meId
  const other = incoming ? from : to
  const titles = (ids: string[]) => ids.map((id) => tasks.get(id)?.title ?? 'tâche supprimée')
  const pending = trade.status === 'pending'

  return (
    <div className={`card stack fade-in trade ${pending && incoming ? 'mine' : ''}`} style={{ gap: 10 }}>
      <div className="row" style={{ gap: 10 }}>
        <Avatar m={other} size={36} />
        <div className="stack" style={{ gap: 2 }}>
          <h3>
            {pending
              ? incoming ? `${from.name} te propose un échange` : `Proposition envoyée à ${to.name}`
              : trade.status === 'accepted' ? `${to.name} a accepté ton échange`
              : trade.status === 'declined' ? `${to.name} a refusé ton échange`
              : 'Échange annulé'}
          </h3>
          {trade.message && <p className="muted small">« {trade.message} »</p>}
        </div>
      </div>

      <div className="trade-lines">
        <div>
          <span className="small muted">{incoming ? `${from.name} ferait` : 'Tu ferais'}</span>
          <ul>{titles(trade.requested).map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
        <ArrowLeftRight size={18} className="muted" />
        <div>
          <span className="small muted">{incoming ? 'Tu ferais' : `${to.name} ferait`}</span>
          {trade.offered.length === 0
            ? <p className="small muted" style={{ fontStyle: 'italic' }}>rien, c'est cadeau</p>
            : <ul>{titles(trade.offered).map((t, i) => <li key={i}>{t}</li>)}</ul>}
        </div>
      </div>

      {pending && incoming && (
        <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={() => onRespond(trade, false)}><X size={16} /> Refuser</button>
          <button className="btn" onClick={() => onRespond(trade, true)}><Check size={18} /> Accepter</button>
        </div>
      )}
      {pending && !incoming && (
        <div className="row spread">
          <span className="small muted">En attente de {to.name}…</span>
          <button className="btn ghost" onClick={() => onCancel(trade)}>Annuler</button>
        </div>
      )}
    </div>
  )
}
