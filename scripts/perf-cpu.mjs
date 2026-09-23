/** CPU profile of the render loop at a given stage: top self-time functions + GC time. Usage: node scripts/perf-cpu.mjs [url] --stage=warehouse --seconds=4 */
import puppeteer from 'puppeteer-core'
import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
const args = process.argv.slice(2)
const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1]
const base = args.find((a) => a.startsWith('http')) ?? 'http://localhost:3200'
const stage = opt('stage', 'warehouse')
const seconds = Number(opt('seconds', '4'))
const perf = opt('perf', '')
const MID = { hero: 0.035, warehouse: 0.12, conveyor: 0.215, container: 0.29, globe: 0.37, tunnel: 0.455, uzbekistan: 0.535, delivery: 0.63, network: 0.72, exploded: 0.795, calculator: 0.865, tracking: 0.93, final: 0.985 }
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-frame-rate-limit', '--disable-gpu-vsync'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 })
await page.goto(`${base}/?tier=ultra&debug=1&perf=lock:1,always:1${perf ? ',' + perf : ''}`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__tj && window.__tj.useApp.getState().phase === 'live', { timeout: 60000 })
await page.evaluate((p) => { const s = window.__tj.scroll; window.scrollTo(0, p * s.limit); s.progress = p; s.pd = p }, MID[stage])
await page.waitForFunction(() => window.__tj.useApp.getState().readyWorlds.size >= 4, { timeout: 60000 }).catch(() => {})
await new Promise((r) => setTimeout(r, 1500))
const client = await page.createCDPSession()
await client.send('Profiler.enable')
await client.send('Profiler.setSamplingInterval', { interval: 200 })
await client.send('Profiler.start')
await new Promise((r) => setTimeout(r, seconds * 1000))
const { profile } = await client.send('Profiler.stop')
await browser.close()
// aggregate self time per function
const nodes = new Map(profile.nodes.map((n) => [n.id, n]))
const self = new Map()
const dt = profile.timeDeltas
let total = 0
for (let i = 0; i < profile.samples.length; i++) {
  const n = nodes.get(profile.samples[i])
  const d = dt[i] || 0
  total += d
  const cf = n.callFrame
  const key = `${cf.functionName || '(anonymous)'} @ ${(cf.url || '').split('/').pop().slice(0, 40)}:${cf.lineNumber}`
  self.set(key, (self.get(key) || 0) + d)
}
const rows = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => `${(v / 1000).toFixed(1).padStart(8)} ms  ${(100 * v / total).toFixed(1).padStart(5)}%  ${k}`)
mkdirSync('qa/perf', { recursive: true })
writeFileSync(`qa/perf/cpu-${stage}.txt`, `total ${(total / 1000).toFixed(0)} ms over ${seconds}s\n` + rows.join('\n'))
console.log(`total sampled ${(total / 1000).toFixed(0)} ms over ${seconds}s (${(100 * total / 1000 / (seconds * 1000)).toFixed(0)}% busy)`)
console.log(rows.slice(0, 25).join('\n'))
