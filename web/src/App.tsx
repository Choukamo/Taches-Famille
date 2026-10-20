import { useCallback, useEffect, useMemo, useState } from 'react'
import { ListChecks, Plus, Trophy, UserRound, Users } from 'lucide-react'
import { supabase, ensureSession } from './lib/supabase'
import type { Member, Preset, Recurrence, Task, Trade } from './lib/types'
import { Family } from './screens/Family'
import { TradeSheet } from './components/TradeSheet'
import { Join } from './screens/Join'
import { TaskList } from './screens/TaskList'
import { NewTask } from './screens/NewTask'
import { Leaderboard } from './screens/Leaderboard'
import { Settings } from './screens/Settings'
import { Wheel } from './components/Wheel'
import { disablePush, enablePush, getPushState, type PushState } from './lib/push'

type Tab = 'tasks' | 'family' | 'new' | 'board' | 'me'

export default function App() {
  const [ready, setReady] = useState(false)
  const [fatal, setFatal] = useState<string | null>(null)
  const [me, setMe] = useState<Member | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [presets, setPresets] = useState<Preset[]>([])
  const [recurrences, setRecurrences] = useState<Recurrence[]>([])
  const [tradeWith, setTradeWith] = useState<Member | null>(null)
  const [tab, setTab] = useState<Tab>('tasks')
  const [pushState, setPushState] = useState<PushState>('off')
  const [wheel, setWheel] = useState<{ task: Task; auto: boolean } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const membersMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])

  const loadAll = useCallback(async () => {
    const [{ data: ms }, { data: ts }, { data: trs }, { data: ps }, { data: rs }] = await Promise.all([
      supabase.from('members').select('*').order('sort_order'),
      supabase.from('tasks').select('*, task_assignees(*)').order('scheduled_date').order('created_at'),
      supabase.from('trades').select('*').order('created_at', { ascending: false }),
      supabase.from('task_presets').select('*').order('sort_order').order('created_at'),
      supabase.from('recurrences').select('*').eq('active', true).order('at_time').order('created_at'),
    ])
    setMembers((ms ?? []) as Member[])
    setTasks((ts ?? []) as Task[])
    setTrades((trs ?? []) as Trade[])
    setPresets((ps ?? []) as Preset[])
    setRecurrences((rs ?? []) as Recurrence[])
    setRefreshKey((k) => k + 1)
  }, [])

  const refreshPush = useCallback(async () => setPushState(await getPushState()), [])

  useEffect(() => {
    (async () => {
      try {
        await ensureSession()
        const { data: myId } = await supabase.rpc('current_member_id')
        if (myId) {
          await loadAll()
          const { data: m } = await supabase.from('members').select('*').eq('id', myId).single()
          setMe(m as Member)
          refreshPush()
        }
      } catch (e) {
        setFatal((e as Error).message)
      } finally {
        setReady(true)
      }
    })()
  }, [loadAll, refreshPush])

  useEffect(() => {
    if (!me) return
    const ch = supabase
      .channel('family')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_assignees' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_presets' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recurrences' }, () => loadAll())
      .subscribe()
    const onVisible = () => { if (document.visibilityState === 'visible') { loadAll(); refreshPush() } }
    document.addEventListener('visibilitychange', onVisible)
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVisible) }
  }, [me, loadAll, refreshPush])

  useEffect(() => {
    if (me) setMe(membersMap.get(me.id) ?? me)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membersMap])

  const onJoined = async (m: Member) => {
    setMe(m)
    await loadAll()
    refreshPush()
  }

  const onEnablePush = async () => {
    if (!me) return
    try {
      setPushState(await enablePush(me.id))
    } catch (e) {
      console.error(e)
      alert('Impossible d\'activer les notifications : ' + (e as Error).message)
      refreshPush()
    }
  }
  const onDisablePush = async () => { await disablePush(); refreshPush() }

  const complete = async (t: Task) => {
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, status: 'done', done_by: me!.id, done_at: new Date().toISOString() } : x)))
    const { error } = await supabase.rpc('complete_task', { p_task_id: t.id })
    if (error) alert(error.message)
    loadAll()
  }
  const reopen = async (t: Task) => {
    const { error } = await supabase.rpc('reopen_task', { p_task_id: t.id })
    if (error) alert(error.message)
    loadAll()
  }
  const remove = async (t: Task) => {
    if (!confirm(`Supprimer « ${t.title} » ?`)) return
    await supabase.from('tasks').delete().eq('id', t.id)
    loadAll()
  }
  const replay = (t: Task) => setWheel({ task: t, auto: false })

  const proposeTrade = async (requested: string[], offered: string[], message: string) => {
    if (!tradeWith) return
    const { data, error } = await supabase.rpc('propose_trade', { p_to: tradeWith.id, p_requested: requested, p_offered: offered, p_message: message })
    if (error) throw new Error(error.message)
    supabase.functions.invoke('send-reminders', { body: { trade_id: (data as Trade).id } }).catch(() => {})
    setTradeWith(null)
    await loadAll()
    setTab('tasks')
  }
  const respondTrade = async (t: Trade, accept: boolean) => {
    const { error } = await supabase.rpc('respond_trade', { p_trade: t.id, p_accept: accept })
    if (error) alert(error.message)
    else supabase.functions.invoke('send-reminders', { body: { trade_id: t.id } }).catch(() => {})
    loadAll()
  }
  const deleteRecurrence = async (r: Recurrence) => {
    if (!confirm(`Arrêter « ${r.title} » (${r.mode === 'roulette' ? 'roulette' : 'direct'}) ? Les tâches déjà créées restent.`)) return
    const { error } = await supabase.rpc('delete_recurrence', { p_id: r.id })
    if (error) alert(error.message)
    loadAll()
  }
  const cancelTrade = async (t: Trade) => {
    const { error } = await supabase.rpc('cancel_trade', { p_trade: t.id })
    if (error) alert(error.message)
    loadAll()
  }

  const onCreated = (t: Task) => {
    loadAll()
    if (t.mode === 'roulette') setWheel({ task: t, auto: true })
    else setTab('tasks')
  }

  const leave = async () => {
    if (!confirm('Changer de personne sur ce téléphone ?')) return
    await disablePush().catch(() => {})
    await supabase.rpc('leave_family')
    setMe(null)
    setTasks([])
    setTrades([])
    setMembers([])
    setTab('tasks')
  }

  if (!ready) return <div className="app"><div className="center"><div className="spinner" /></div></div>
  if (fatal) return <div className="app"><div className="screen"><div className="banner error">Problème de connexion : {fatal}</div></div></div>
  if (!me) return <div className="app"><Join onJoined={onJoined} /></div>

  return (
    <div className="app">
      {tab === 'tasks' && (
        <TaskList me={me} members={membersMap} tasks={tasks} trades={trades} pushState={pushState} onEnablePush={onEnablePush}
          onComplete={complete} onReopen={reopen} onDelete={remove} onReplay={replay} onGoSettings={() => setTab('me')}
          onRespondTrade={respondTrade} onCancelTrade={cancelTrade} />
      )}
      {tab === 'family' && <Family me={me} members={members} tasks={tasks} recurrences={recurrences} onTrade={setTradeWith} onDeleteRecurrence={deleteRecurrence} />}
      {tab === 'new' && <NewTask me={me} members={members} presets={presets} onCreated={onCreated} onRecurrenceCreated={() => { loadAll(); setTab('family') }} />}
      {tab === 'board' && <Leaderboard members={membersMap} tasks={tasks} refreshKey={refreshKey} />}
      {tab === 'me' && (
        <Settings me={me} pushState={pushState} onEnablePush={onEnablePush} onDisablePush={onDisablePush}
          onSaved={(m) => { setMe(m); loadAll() }} onLeave={leave} />
      )}

      {tradeWith && (
        <TradeSheet
          me={me}
          other={tradeWith}
          theirTasks={tasks.filter((t) => t.status === 'open' && t.task_assignees.some((a) => a.member_id === tradeWith.id))}
          myTasks={tasks.filter((t) => t.status === 'open' && t.task_assignees.some((a) => a.member_id === me.id) && !t.task_assignees.some((a) => a.member_id === tradeWith.id))}
          onSubmit={proposeTrade}
          onClose={() => setTradeWith(null)}
        />
      )}

      {wheel && (
        <Wheel
          title={wheel.task.title}
          candidates={wheel.task.candidates.map((id) => membersMap.get(id)).filter(Boolean) as Member[]}
          winners={wheel.task.task_assignees.map((a) => membersMap.get(a.member_id)).filter(Boolean) as Member[]}
          autoSpin={wheel.auto}
          onClose={() => { setWheel(null); setTab('tasks') }}
        />
      )}

      <nav className="nav">
        <button className={tab === 'tasks' ? 'on' : ''} onClick={() => setTab('tasks')}><ListChecks size={22} />Tâches</button>
        <button className={tab === 'family' ? 'on' : ''} onClick={() => setTab('family')}><Users size={22} />Famille</button>
        <button className={tab === 'new' ? 'on' : ''} onClick={() => setTab('new')}><Plus size={22} />Nouvelle</button>
        <button className={tab === 'board' ? 'on' : ''} onClick={() => setTab('board')}><Trophy size={22} />Classement</button>
        <button className={tab === 'me' ? 'on' : ''} onClick={() => setTab('me')}><UserRound size={22} />Moi</button>
      </nav>
    </div>
  )
}
