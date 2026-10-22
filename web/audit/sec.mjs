import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const src = fs.readFileSync('.env.development', 'utf8')
const URL_ = src.match(/VITE_SUPABASE_URL=(\S+)/)[1]; const KEY = src.match(/VITE_SUPABASE_ANON_KEY=(\S+)/)[1]
const sb = createClient(URL_, KEY, { auth: { persistSession: false } })
const { data: s, error: se } = await sb.auth.signInAnonymously(); console.log('anon signin', !!s.session, se?.message)
for (const t of ['tasks', 'members', 'trades', 'recurrences', 'task_presets', 'push_subscriptions', 'devices', 'notifications', 'family']) {
  const { data, error } = await sb.from(t).select('*').limit(3); console.log('select', t, '->', error ? 'ERR ' + error.code : (data?.length ?? 0) + ' rows')
}
const { data: pub } = await sb.rpc('list_members_public'); console.log('list_members_public rows', pub?.length)
for (const f of ['expire_due_tasks', 'spawn_due_recurrences', 'shame_board', 'leaderboard']) { const { error } = await sb.rpc(f); console.log('rpc', f, error ? 'ERR ' + error.code + ' ' + error.message.slice(0, 50) : 'OK (allowed!)') }
let fails = 0; const t0 = Date.now()
for (let i = 0; i < 15; i++) { const { data, error } = await sb.rpc('join_family', { p_code: '000' + i, p_member_id: pub[0].id }); if (error || !data) fails++; if (i === 0) console.log('attempt 1 data ->', JSON.stringify(data)?.slice(0, 60)); if (i === 11) console.log('attempt 12 ->', error?.message ?? ('data=' + data)) }
console.log('join_family 15 wrong codes: refused', fails, 'in', Date.now() - t0, 'ms (lockout?)', 'last err:', (await sb.rpc('join_family', { p_code: '000099', p_member_id: pub[0].id })).error?.message)
const { error: ct } = await sb.rpc('create_task', { p_title: 'x', p_note: null, p_scheduled_date: '2026-10-22', p_interval_minutes: 60, p_mode: 'direct', p_members: [pub[0].id], p_pick_count: 1, p_deadline: null }); console.log('create_task non-member ->', ct?.message)
const fn = await fetch(URL_ + '/functions/v1/send-reminders', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + s.session.access_token, 'Content-Type': 'application/json' }, body: '{}' }); console.log('edge fn as non-member anon ->', fn.status, (await fn.text()).slice(0, 80))
const fn2 = await fetch(URL_ + '/functions/v1/send-reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); console.log('edge fn no auth ->', fn2.status)
await sb.auth.signOut(); process.exit(0)
