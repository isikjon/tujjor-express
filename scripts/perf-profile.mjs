/**
 * Headless performance profiler (production build): measures fps / frame time / JS time / GPU time /
 * draw calls / triangles / memory per stage, for a matrix of configurations (A/B toggles).
 *
 * Usage: node scripts/perf-profile.mjs [baseUrl=http://localhost:3200] [--out=qa/perf/<name>] [--stages=all|hero,globe]
 *        [--configs=baseline,nopost,...] [--tier=ultra] [--portrait] [--dpr=2] [--seconds=2.5]
 * Requires a build with NEXT_PUBLIC_PERF_HUD=1 (npm run build:perf) and `npm start -- -p 3200`.
 */
import puppeteer from 'puppeteer-core'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=').slice(1).join('=')
const base = args.find((a) => a.startsWith('http')) ?? 'http://localhost:3200'
const out = opt('out', 'qa/perf/run')
const portrait = args.includes('--portrait')
const tier = opt('tier', 'ultra')
const dpr = Number(opt('dpr', portrait ? '3' : '2'))
const seconds = Number(opt('seconds', '2.5'))
const stageArg = opt('stages', 'all')
const configArg = opt('configs', 'baseline,dpr1,nopost,nobloom,nodof,nomsaa,noshadows')

const STAGE_MID = { hero: 0.035, warehouse: 0.12, conveyor: 0.215, container: 0.29, globe: 0.37, tunnel: 0.455, uzbekistan: 0.535, delivery: 0.63, network: 0.72, exploded: 0.795, calculator: 0.865, tracking: 0.93, final: 0.985 }
const CONFIGS = {
  baseline: '',
  dpr1: 'dpr:1',
  dpr2: 'dpr:2',
  dpr15: 'dpr:1.5',
  nopost: 'postfx:0',
  nobloom: 'bloom:0',
  nodof: 'dof:0',
  nomsaa: 'msaa:0',
  noshadows: 'shadows:0',
  nonoise: 'noise:0,vignette:0',
  only: 'only:STAGE',
  msaa2: 'msaa:2',
  smaa: 'msaa:0,smaa:1',
  spots0: 'spots:0',
  spots2: 'spots:2',
  points0: 'points:0',
  pcf: 'shadowType:pcf',
  basicshadow: 'shadowType:basic',
  env0: 'env:0',
  fog0: 'fog:0',
  bloom35: 'bloomScale:0.35',
  bloom25: 'bloomScale:0.25',
}
const stages = stageArg === 'all' ? Object.keys(STAGE_MID) : stageArg.split(',')
const configs = configArg.split(',')
const chrome = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
if (!chrome) throw new Error('Chrome not found')
mkdirSync(out, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox', '--hide-scrollbars', '--disable-frame-rate-limit', '--disable-gpu-vsync'],
})
const rows = []
async function measure(page, stage, cfgName, cfg) {
  const extra = opt('perf', '')
  const perf = ['lock:1', 'always:1', extra, cfg.replace('STAGE', stage)].filter(Boolean).join(',')
  const url = `${base}/?tier=${tier}&debug=1&perf=${perf}`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction(() => window.__tj && window.__tj.useApp.getState().phase === 'live', { timeout: 60000 })
  await page.evaluate(() => { try { sessionStorage.setItem('tj_intro', '1') } catch {} })
  const p = STAGE_MID[stage]
  await page.evaluate((p) => {
    const s = window.__tj.scroll
    window.scrollTo(0, p * s.limit)
    s.progress = p
    s.pd = p
  }, p)
  // wait for all worlds to be warmed up + settle
  await page.waitForFunction(() => window.__tj.useApp.getState().readyWorlds.size >= 4, { timeout: 60000 }).catch(() => {})
  await new Promise((r) => setTimeout(r, 1500))
  await page.evaluate(() => window.__tj.perf.reset())
  await new Promise((r) => setTimeout(r, seconds * 1000))
  const s = await page.evaluate(() => window.__tj.perf.stats())
  const row = { stage, config: cfgName, fps: +s.fps.toFixed(1), frameMs: +s.raf.avg.toFixed(2), p95Ms: +s.raf.p95.toFixed(2), jsMs: +s.cpu.avg.toFixed(2), gpuMs: s.gpu ? +s.gpu.avg.toFixed(2) : null, calls: s.calls, tris: s.tris, points: s.points, textures: s.textures, geometries: s.geometries, programs: s.programs, heapMb: s.memMb >= 0 ? +s.memMb.toFixed(0) : null, dpr: +s.dpr.toFixed(2), visible: s.visibleStages }
  rows.push(row)
  console.log(`${stage.padEnd(11)} ${cfgName.padEnd(10)} ${String(row.fps).padStart(5)} fps  frame ${String(row.frameMs).padStart(6)}ms  p95 ${String(row.p95Ms).padStart(6)}  js ${String(row.jsMs).padStart(5)}  gpu ${String(row.gpuMs ?? '-').padStart(6)}  calls ${String(row.calls).padStart(4)}  tris ${String((row.tris / 1000).toFixed(0)).padStart(5)}k  tex ${row.textures}  vis ${row.visible}`)
}
async function newPage() {
  const page = await browser.newPage()
  await page.setViewport(portrait ? { width: 430, height: 932, deviceScaleFactor: dpr, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: dpr })
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  return page
}
function save() {
  writeFileSync(join(out, 'perf.json'), JSON.stringify({ base, tier, dpr, portrait, seconds, rows }, null, 1))
  const md = ['| stage | config | fps | frame ms | p95 | js ms | gpu ms | calls | tris | tex | heap MB | visible |', '|---|---|---|---|---|---|---|---|---|---|---|---|', ...rows.map((r) => `| ${r.stage} | ${r.config} | ${r.fps} | ${r.frameMs} | ${r.p95Ms} | ${r.jsMs} | ${r.gpuMs ?? '-'} | ${r.calls} | ${(r.tris / 1000).toFixed(0)}k | ${r.textures} | ${r.heapMb ?? '-'} | ${r.visible} |`)].join('\n')
  writeFileSync(join(out, 'perf.md'), md)
}
let page = await newPage()
for (const stage of stages)
  for (const c of configs) {
    try {
      await measure(page, stage, c, CONFIGS[c] ?? c)
    } catch (e) {
      console.error(`[fail] ${stage}/${c}: ${String(e.message).slice(0, 120)} — recreating page`)
      try { await page.close() } catch {}
      page = await newPage()
    }
    save()
  }
await browser.close()
console.log('→', out)
