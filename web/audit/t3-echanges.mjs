import { chromium } from 'playwright'
const LOCAL = 'http://localhost:5173/', PROD = 'https://choukamo.github.io/Taches-Famille/'
const out = (k, v) => console.log(JSON.stringify({ [k]: v }))
const browser = await chromium.connectOverCDP('http://localhost:29229')
const ctx = browser.contexts()[0]
const mk = async () => { const p = await ctx.newPage(); await p.setViewportSize({ width: 390, height: 844 }); p.dialogs = []; p.on('dialog', async (d) => { p.dialogs.push(d.message()); await d.accept() }); return p }
const A = await mk(), B = await mk()
await A.goto(LOCAL); await A.waitForTimeout(2500)
await B.goto(PROD); await B.waitForTimeout(3000)
out('3a_B_joined_prod', await B.locator('h1').first().innerText())
// A crée une tâche pour B
await A.getByRole('button', { name: /Nouvelle/ }).click(); await A.waitForTimeout(500)
await A.getByPlaceholder('Ou écris autre chose…').fill('AUDIT T3 pour B')
await A.locator('.chip', { hasText: 'Test B' }).click(); await A.locator('.btn.big.block').last().click(); await A.waitForTimeout(2500)
out('3b_B_sees_task_realtime', await B.getByText('AUDIT T3 pour B').count())
// A propose de prendre la tâche de B
await A.getByRole('button', { name: /Famille/ }).click(); await A.waitForTimeout(800)
await A.locator('.member-block, .card, section', { hasText: 'Test B' }).first().getByRole('button', { name: /Échanger/ }).click(); await A.waitForTimeout(800)
await A.locator('.pick', { hasText: 'AUDIT T3 pour B' }).first().click()
await A.locator('.btn.big.block').last().click(); await A.waitForTimeout(3000)
out('3c_A_after_propose', (await A.locator('body').innerText()).match(/propos[ée]e?[^\n]*/i)?.[0] ?? 'no text')
await B.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await B.waitForTimeout(2500)
out('3c_B_sees_trade', await B.getByRole('button', { name: /Accepter/ }).count())
// B termine la tâche AVANT d'accepter, puis accepte
await B.locator('.card', { hasText: 'AUDIT T3 pour B', has: B.locator('button', { hasText: "C'est fait" }) }).first().getByRole('button', { name: /fait/i }).click(); await B.waitForTimeout(2500)
await B.getByRole('button', { name: /Accepter/ }).first().click(); await B.waitForTimeout(3000)
out('3d_B_accept_dialogs', B.dialogs.splice(0))
out('3d_B_trade_still_pending', await B.getByRole('button', { name: /Accepter/ }).count())
await B.reload(); await B.waitForTimeout(3000)
out('3d_B_after_reload_trade_pending', await B.getByRole('button', { name: /Accepter/ }).count())
await A.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await A.waitForTimeout(2500)
out('3d_A_can_cancel', await A.getByRole('button', { name: /^Annuler$/ }).count())
out('3d_A_trades_text', (await A.locator('.card', { hasText: /échange|Échange|propos/i }).first().innerText().catch(() => 'none')).slice(0, 200))
// B annule sa validation (Annuler sur la tâche) 
await B.getByRole('button', { name: /Tâches/ }).click().catch(() => {}); await B.waitForTimeout(500)
const doneCard = B.locator('.card', { hasText: 'AUDIT T3 pour B', has: B.locator('button', { hasText: 'Annuler' }) }).first()
out('3e_done_card', (await doneCard.innerText()).slice(0, 120))
await doneCard.getByRole('button', { name: /Annuler/ }).click(); await B.waitForTimeout(2500)
out('3e_reopened', (await B.locator('.card', { hasText: 'AUDIT T3 pour B' }).last().innerText()).includes("C'est fait"))
// B refuse l'échange proprement (nouveau cycle) : on vérifie refuse
await B.getByRole('button', { name: /Refuser/ }).first().click().catch(() => {}); await B.waitForTimeout(2500)
out('3f_after_refuse_pending', await B.getByRole('button', { name: /Accepter/ }).count())
// B ne doit pas pouvoir supprimer la tâche de A (bouton caché ?)
out('3g_B_delete_btn_on_A_task', await B.locator('.card', { hasText: 'AUDIT T3 pour B' }).last().locator('button[title=Supprimer]').count())
// Réglages B : prénom
await B.getByRole('button', { name: /Moi/ }).click(); await B.waitForTimeout(800)
await B.locator('input.input').first().fill('Test B2'); await B.getByRole('button', { name: /Enregistrer/ }).click(); await B.waitForTimeout(2500)
out('3h_saved_msg', (await B.locator('.banner').allInnerTexts()).join('|'))
await B.reload(); await B.waitForTimeout(3000); await B.getByRole('button', { name: /Moi/ }).click(); await B.waitForTimeout(800)
out('3h_name_after_reload', await B.locator('input.input').first().inputValue())
await B.locator('input.input').first().fill('Test B'); await B.getByRole('button', { name: /Enregistrer/ }).click(); await B.waitForTimeout(2000)
out('A_dialogs', A.dialogs); 
await A.close(); await B.close(); process.exit(0)
