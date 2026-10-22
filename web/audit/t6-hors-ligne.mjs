import { chromium } from 'playwright'
const BASE = process.env.BASE || 'http://localhost:5173/'
const out = (k, v) => console.log(JSON.stringify({ [k]: v }))
const b = await chromium.connectOverCDP('http://localhost:29229'); const ctx = b.contexts()[0]; const p = await ctx.newPage()
await p.setViewportSize({ width: 390, height: 844 })
await p.goto(BASE); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(3000)
await p.locator('.member-tile', { hasText: 'Test A' }).click(); await p.getByPlaceholder(/code/i).fill(process.env.CODE); await p.getByRole('button', { name: /Entrer/ }).click(); await p.waitForTimeout(3000)
// créer une tâche pour avoir quelque chose à voir
await p.getByRole('button', { name: /Nouvelle/ }).click(); await p.waitForTimeout(500)
await p.getByPlaceholder('Ou écris autre chose…').fill('AUDIT T6 hors-ligne'); await p.locator('.chip', { hasText: 'Test A (moi)' }).click(); await p.locator('.btn.big.block').last().click(); await p.waitForTimeout(2500)
await p.reload(); await p.waitForTimeout(4000) // 2e chargement : le SW contrôle la page et garde une copie
out('6a_sw_controlled', await p.evaluate(() => !!navigator.serviceWorker.controller))
out('6a_online_h1', await p.locator('h1').first().innerText())
await ctx.setOffline(true)
await p.reload().catch((e) => out('6b_reload_err', e.message.slice(0, 60))); await p.waitForTimeout(4000)
const body = await p.locator('body').innerText().catch(() => 'NO BODY')
out('6b_offline_banner', body.match(/Hors-ligne[^\n]*/)?.[0] ?? 'NO BANNER')
out('6b_offline_task_visible', body.includes('AUDIT T6 hors-ligne'))
out('6b_offline_h1', await p.locator('h1').first().innerText().catch(() => 'NO H1'))
await p.screenshot({ path: '/home/ubuntu/audit-t6-offline.png' })
// action hors-ligne : message clair ?
const dialogs = []; p.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept() })
await p.locator('.card', { hasText: 'AUDIT T6 hors-ligne' }).first().getByRole('button', { name: /fait/i }).click().catch(() => {}); await p.waitForTimeout(2500)
out('6c_offline_action_dialog', dialogs)
await ctx.setOffline(false)
await p.reload(); await p.waitForTimeout(4000)
out('6d_online_again_banner', (await p.locator('body').innerText()).includes('Hors-ligne'))
out('6d_online_h1', await p.locator('h1').first().innerText())
await p.close(); process.exit(0)
