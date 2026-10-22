import { chromium } from 'playwright'
const BASE = process.env.BASE || 'http://localhost:5173/'
const out = (k, v) => console.log(JSON.stringify({ [k]: v }))
const browser = await chromium.connectOverCDP('http://localhost:29229')
const ctx = browser.contexts()[0]
const page = await ctx.newPage()
await page.setViewportSize({ width: 390, height: 844 })
const dialogs = []
page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept() })
await page.goto(BASE); await page.evaluate(() => localStorage.clear()); await page.reload()
await page.waitForTimeout(2500)
// Join Test A
await page.locator('.member-tile', { hasText: 'Test A' }).click()
await page.getByPlaceholder(/code/i).fill(process.env.CODE)
await page.getByRole('button', { name: /Entrer/ }).click()
await page.waitForTimeout(2500)
out('1a_after_join_h1', await page.locator('h1').first().innerText())
// Reload online
await page.reload(); await page.waitForTimeout(2500)
out('1b_after_reload_h1', await page.locator('h1').first().innerText())
// Create task for self
await page.getByRole('button', { name: /Nouvelle/ }).click(); await page.waitForTimeout(600)
await page.getByPlaceholder('Ou écris autre chose…').fill('AUDIT T1 tâche')
await page.locator('.chip', { hasText: 'Test A (moi)' }).click()
await page.locator('.btn.big.block').last().click()
await page.waitForTimeout(2500)
out('1c_task_visible', await page.getByText('AUDIT T1 tâche').count())
// Offline + visibility refresh
await ctx.setOffline(true)
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
await page.waitForTimeout(3000)
out('1d_offline_task_visible', await page.getByText('AUDIT T1 tâche').count())
out('1d_offline_body', (await page.locator('.screen').first().innerText()).slice(0, 300))
// Offline reload
await page.reload().catch(e => out('1e_reload_err', e.message.slice(0, 80)))
await page.waitForTimeout(2500)
out('1e_offline_reload_body', (await page.locator('body').innerText().catch(() => 'NO BODY')).slice(0, 200))
await ctx.setOffline(false)
await page.reload(); await page.waitForTimeout(3000)
out('1f_online_reload_h1', await page.locator('h1').first().innerText())
out('1f_task_visible', await page.getByText('AUDIT T1 tâche').count())
// Offline complete
await ctx.setOffline(true)
const card = page.locator('.card', { hasText: 'AUDIT T1 tâche' }).first()
await card.getByRole('button', { name: /fait/i }).click(); await page.waitForTimeout(3000)
out('1g_offline_complete_dialogs', dialogs.splice(0))
out('1g_card_text', (await card.innerText().catch(() => 'CARD GONE')).slice(0, 200))
await ctx.setOffline(false)
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.waitForTimeout(3000)
out('1h_online_card_text', (await page.locator('.card', { hasText: 'AUDIT T1 tâche' }).first().innerText().catch(() => 'CARD GONE')).slice(0, 200))
await page.screenshot({ path: '/home/ubuntu/audit-t1.png' })
await page.close()
process.exit(0)
