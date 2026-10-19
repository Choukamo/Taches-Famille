import { useState } from 'react'
import { BellRing, BellOff, LogOut, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Member } from '../lib/types'
import { Avatar } from '../components/Avatar'
import { isPresentOn, todayParis } from '../lib/presence'
import type { PushState } from '../lib/push'

type Props = {
  me: Member
  pushState: PushState
  onEnablePush: () => Promise<void>
  onDisablePush: () => Promise<void>
  onSaved: (m: Member) => void
  onLeave: () => void
}

export function Settings({ me, pushState, onEnablePush, onDisablePush, onSaved, onLeave }: Props) {
  const [name, setName] = useState(me.name)
  const [start, setStart] = useState(me.avail_start.slice(0, 5))
  const [end, setEnd] = useState(me.avail_end.slice(0, 5))
  const [alternating, setAlternating] = useState(me.alternating)
  const [presentThisWeek, setPresentThisWeek] = useState<boolean>(isPresentOn(me, todayParis()))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [pushBusy, setPushBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    setMsg(null)
    const { data, error } = await supabase.rpc('update_my_settings', {
      p_name: name,
      p_avail_start: start,
      p_avail_end: end,
      p_alternating: alternating,
      p_present_this_week: alternating ? presentThisWeek : null,
    })
    setBusy(false)
    if (error) { setMsg('Erreur : ' + error.message); return }
    onSaved(data as Member)
    setMsg('Enregistré.')
  }

  const togglePush = async () => {
    setPushBusy(true)
    try {
      if (pushState === 'on') await onDisablePush()
      else await onEnablePush()
    } finally {
      setPushBusy(false)
    }
  }

  return (
    <div className="screen stack fade-in" style={{ gap: 18 }}>
      <div className="screen-header">
        <h1>Moi</h1>
        <Avatar m={{ name, color: me.color }} size={44} />
      </div>

      <div className="card stack">
        <h3>Notifications</h3>
        {pushState === 'need-install' ? (
          <p className="small muted">Sur iPhone : dans Safari, bouton Partager → « Sur l'écran d'accueil », puis ouvre l'appli depuis l'icône pour activer les notifications.</p>
        ) : pushState === 'unsupported' ? (
          <p className="small muted">Ce navigateur ne gère pas les notifications. Utilise Chrome (Android) ou Safari (iPhone).</p>
        ) : pushState === 'denied' ? (
          <p className="small muted">Notifications refusées. Autorise-les dans les réglages du téléphone (Notifications → Tâches).</p>
        ) : (
          <div className="row spread">
            <span className="row">{pushState === 'on' ? <BellRing color="#1f9d8a" /> : <BellOff />} {pushState === 'on' ? 'Activées sur cet appareil' : 'Désactivées'}</span>
            <button className={`toggle ${pushState === 'on' ? 'on' : ''}`} onClick={togglePush} disabled={pushBusy} aria-label="Notifications" />
          </div>
        )}
      </div>

      <div className="card stack">
        <h3>Mon prénom</h3>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="card stack">
        <h3>Mes horaires</h3>
        <p className="small muted">Je reçois les tâches et les rappels seulement entre :</p>
        <div className="row">
          <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          <span className="muted">et</span>
          <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>

      <div className="card stack">
        <div className="row spread">
          <div>
            <h3>Une semaine sur deux</h3>
            <p className="small muted">Je ne suis à la maison qu'une semaine sur deux.</p>
          </div>
          <button className={`toggle ${alternating ? 'on' : ''}`} onClick={() => setAlternating((a) => !a)} aria-label="Une semaine sur deux" />
        </div>
        {alternating && (
          <div className="field">
            <label>Cette semaine, je suis…</label>
            <div className="seg">
              <button className={presentThisWeek ? 'on' : ''} onClick={() => setPresentThisWeek(true)}>À la maison</button>
              <button className={!presentThisWeek ? 'on' : ''} onClick={() => setPresentThisWeek(false)}>Absent(e)</button>
            </div>
            <p className="small muted">L'appli alterne ensuite automatiquement chaque semaine (du lundi au dimanche).</p>
          </div>
        )}
      </div>

      {msg && <div className={`banner ${msg.startsWith('Erreur') ? 'error' : 'info'}`}>{msg}</div>}

      <button className="btn big block" disabled={busy} onClick={save}><Save size={18} /> Enregistrer</button>

      <button className="btn danger block" onClick={onLeave}><LogOut size={18} /> Changer de personne</button>
    </div>
  )
}
