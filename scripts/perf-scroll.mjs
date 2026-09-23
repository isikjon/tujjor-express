/** Realistic scroll test with vsync ON: wheel-scrolls the whole story, samples fps / frame time per second. Usage: node scripts/perf-scroll.mjs [url] --tier=ultra --dpr=2 [--portrait] [--seconds=45] */
import puppeteer from 'puppeteer-core'
const args = process.argv.slice(2)
const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1]
const base = args.find((a) => a.startsWith('http')) ?? 'http://localhost:3200'
const tier = opt('tier', 'ultra')
const dpr = Number(opt('dpr', '2'))
const portrait = args.includes('--portrait')
const seconds = Number(opt('seconds', '45'))
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--hide-scrollbars'] })
const page = await browser.newPage()
await page.setViewport(portrait ? { width: 430, height: 932, deviceScaleFactor: dpr, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: dpr })
page.on('pageerror', (e) => console.error('[pageerror]', e.message))
const extra = opt('perf', '')
await page.goto(`${base}/?tier=${tier}&debug=1&perf=lock:1${extra ? ',' + extra : ''}`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__tj && window.__tj.useApp.getState().phase === 'live' && window.__tj.perf, { timeout: 90000 })
await page.waitForFunction(() => window.__tj.useApp.getState().readyWorlds.size >= 4, { timeout: 90000 }).catch(() => {})
await new Promise((r) => setTimeout(r, 1500))
await page.mouse.move(700, 450)
const limit = await page.evaluate(() => window.__tj.scroll.limit)
const samples = []
const t0 = Date.now()
const stepMs = 50
const perStep = (limit / (seconds * 1000)) * stepMs
let lastSample = t0
await page.evaluate(() => window.__tj.perf.reset())
while (Date.now() - t0 < seconds * 1000) {
  if (args.includes('--wheel')) await page.mouse.wheel({ deltaY: perStep })
  else await page.evaluate((d) => window.scrollBy(0, d), perStep)
  await new Promise((r) => setTimeout(r, stepMs))
  if (Date.now() - lastSample >= 1000) {
    lastSample = Date.now()
    const s = await page.evaluate(() => { const st = window.__tj.perf.stats(); window.__tj.perf.reset(); return { fps: st.fps, avg: st.raf.avg, p95: st.raf.p95, stage: st.stage, calls: st.calls, dpr: st.dpr, tier: st.tier, skipped: st.skipped, rendered: st.rendered } })
    samples.push(s)
    process.stdout.write(`${s.stage.padEnd(11)} ${s.fps.toFixed(0).padStart(3)} fps  avg ${s.avg.toFixed(1).padStart(5)}  p95 ${s.p95.toFixed(1).padStart(5)}  calls ${String(s.calls).padStart(3)}  dpr ${s.dpr}  rendered ${s.rendered} skipped ${s.skipped}\n`)
  }
}
await browser.close()
const fps = samples.map((s) => s.fps)
const p95 = samples.map((s) => s.p95)
console.log(`\n${tier} ${portrait ? 'portrait' : 'landscape'} dpr${dpr}: mean fps ${(fps.reduce((a, b) => a + b, 0) / fps.length).toFixed(1)}, min fps ${Math.min(...fps).toFixed(0)}, worst p95 frame ${Math.max(...p95).toFixed(1)} ms, seconds ≥55 fps: ${fps.filter((f) => f >= 55).length}/${fps.length}`)
