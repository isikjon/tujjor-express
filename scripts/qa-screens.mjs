/**
 * Visual QA: screenshots the story at every 4% of scroll progress (+ portrait set) using the local Chrome.
 * Usage: node scripts/qa-screens.mjs [baseUrl] [outDir] [--portrait] [--steps=26] [--tier=high]
 * Output: qa/shots/<landscape|portrait>/p-0.00.png … and a contact sheet index.html
 */
import puppeteer from 'puppeteer-core'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const base = args.find((a) => a.startsWith('http')) ?? 'http://localhost:3100'
const outRoot = args.find((a) => !a.startsWith('http') && !a.startsWith('--')) ?? 'qa/shots'
const portrait = args.includes('--portrait')
const steps = Number((args.find((a) => a.startsWith('--steps=')) ?? '--steps=26').split('=')[1])
const singleP = args.find((a) => a.startsWith('--p='))
const pList = singleP ? singleP.split('=')[1].split(',').map(Number) : Array.from({ length: steps + 1 }, (_, i) => i / steps)
const tier = (args.find((a) => a.startsWith('--tier=')) ?? '--tier=high').split('=')[1]
const chrome = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
if (!chrome) throw new Error('Chrome not found')

const out = join(outRoot, portrait ? 'portrait' : 'landscape')
mkdirSync(out, { recursive: true })
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage()
const vp = portrait ? { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 }
await page.setViewport(vp)
page.on('pageerror', (e) => console.error('[pageerror]', e.message))
page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()) })
await page.goto(`${base}/?tier=${tier}&debug=1`, { waitUntil: 'networkidle2', timeout: 90000 })
// wait for the experience to be live (preloader + intro done)
await page.waitForFunction(() => window.__tj && window.__tj.useApp.getState().phase === 'live', { timeout: 60000 })
await page.evaluate(() => { try { sessionStorage.setItem('tj_intro', '1') } catch {} })
await new Promise((r) => setTimeout(r, 800))
const frames = []
for (const p of pList) {
  await page.evaluate((p) => {
    const s = window.__tj.scroll
    const lim = s.limit
    window.scrollTo(0, p * lim)
    // snap the damped progress so the camera settles fast
    s.progress = p
    s.pd = p
  }, p)
  await new Promise((r) => setTimeout(r, 1400))
  const info = await page.evaluate(() => {
    const s = window.__tj.scroll
    const st = window.__tj.useApp.getState()
    const perf = window.__tjPerf || {}
    return { p: s.pd, tier: st.tier, worlds: [...st.readyWorlds].join(''), stage: perf.stage, fps: perf.fps, calls: perf.calls, tris: perf.tris }
  })
  const file = join(out, `p-${p.toFixed(2)}.png`)
  await page.screenshot({ path: file })
  frames.push({ p: p.toFixed(2), file: file.replace(outRoot + '/', ''), info })
  console.log('shot', p.toFixed(2), JSON.stringify(info))
}
writeFileSync(join(out, 'perf.json'), JSON.stringify(frames.map((f) => ({ p: f.p, ...f.info })), null, 1))
const html = `<!doctype html><meta charset="utf-8"><title>QA ${portrait ? 'portrait' : 'landscape'}</title><body style="background:#111;color:#eee;font:12px system-ui;margin:0;padding:12px"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(${portrait ? 220 : 460}px,1fr));gap:10px">${frames.map((f) => `<figure style="margin:0"><img src="${f.file.split('/').pop()}" style="width:100%;display:block;border:1px solid #333"><figcaption>p=${f.p} · ${f.info.stage} · ${f.info.calls} calls · ${f.info.tris} tris · ${f.info.fps} fps</figcaption></figure>`).join('')}</div>`
writeFileSync(join(out, 'index.html'), html)
await browser.close()
console.log('done →', out)
