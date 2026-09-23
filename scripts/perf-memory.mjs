/** Memory / resource leak check: scroll the whole story 3× and switch tiers; report textures, geometries, programs, heap. */
import puppeteer from 'puppeteer-core'
const base = process.argv[2] ?? 'http://localhost:3200'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--js-flags=--expose-gc'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })
page.on('pageerror', (e) => console.error('[pageerror]', e.message))
await page.goto(`${base}/?tier=ultra&debug=1`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__tj && window.__tj.useApp.getState().phase === 'live' && window.__tj.perf, { timeout: 90000 })
await page.waitForFunction(() => window.__tj.useApp.getState().readyWorlds.size >= 4, { timeout: 90000 }).catch(() => {})
const snap = async (label) => {
  await page.evaluate(() => window.gc && window.gc())
  await new Promise((r) => setTimeout(r, 800))
  const s = await page.evaluate(() => { const l = window.__tj.perf.live; return { tex: l.textures, geo: l.geometries, prg: l.programs, heap: l.memMb.toFixed(0), tier: l.tier, dpr: l.dpr } })
  console.log(label.padEnd(26), JSON.stringify(s))
}
const sweep = async () => {
  for (let i = 0; i <= 40; i++) {
    await page.evaluate((p) => { const s = window.__tj.scroll; window.scrollTo(0, p * s.limit); s.progress = p; s.pd = p }, i / 40)
    await new Promise((r) => setTimeout(r, 120))
  }
  for (let i = 40; i >= 0; i--) {
    await page.evaluate((p) => { const s = window.__tj.scroll; window.scrollTo(0, p * s.limit); s.progress = p; s.pd = p }, i / 40)
    await new Promise((r) => setTimeout(r, 120))
  }
}
await snap('start (ultra)')
await sweep()
await snap('after sweep 1')
await sweep()
await snap('after sweep 2')
await sweep()
await snap('after sweep 3')
for (const t of ['low', 'medium', 'high', 'ultra']) {
  await page.evaluate((t) => window.__tj.useApp.getState().setTier(t), t)
  await new Promise((r) => setTimeout(r, 2500))
  await snap(`tier → ${t}`)
}
await sweep()
await snap('after sweep 4 (ultra)')
await browser.close()
