import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Member } from '../lib/types'
import { Avatar } from '../components/Avatar'

type PublicMember = Pick<Member, 'id' | 'name' | 'role' | 'color' | 'sort_order'>

export function Join({ onJoined }: { onJoined: (m: Member) => void }) {
  const [members, setMembers] = useState<PublicMember[]>([])
  const [code, setCode] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.rpc('list_members_public').then(({ data, error }) => {
      if (error) setError(error.message)
      else setMembers((data ?? []) as PublicMember[])
    })
  }, [])

  const submit = async () => {
    if (!picked || !code.trim()) return
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('join_family', { p_code: code.trim(), p_member_id: picked })
    setBusy(false)
    if (error) {
      setError(error.message.includes('Code') ? 'Code famille incorrect.' : error.message)
      return
    }
    onJoined(data as Member)
  }

  return (
    <div className="screen stack fade-in" style={{ gap: 20, paddingBottom: 30 }}>
      <div style={{ textAlign: 'center', marginTop: 20 }}>
        <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} width={84} height={84} style={{ borderRadius: 22 }} alt="" />
        <h1 style={{ marginTop: 12 }}>Tâches Famille</h1>
        <p className="muted">Qui es-tu ?</p>
      </div>

      <div className="member-grid">
        {members.map((m) => (
          <button key={m.id} className={`member-tile ${picked === m.id ? 'on' : ''}`} onClick={() => setPicked(m.id)}>
            <Avatar m={m} size={56} />
            <span>{m.name}</span>
            <span className="small muted" style={{ fontWeight: 600 }}>{m.role === 'parent' ? 'Parent' : 'Enfant'}</span>
          </button>
        ))}
      </div>

      <div className="field">
        <label>Code famille</label>
        <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Le code donné par Matis" autoCapitalize="none" autoCorrect="off" />
      </div>

      {error && <div className="banner error">{error}</div>}

      <button className="btn big block" disabled={!picked || !code.trim() || busy} onClick={submit}>
        {busy ? 'Connexion…' : 'Entrer'}
      </button>
    </div>
  )
}
