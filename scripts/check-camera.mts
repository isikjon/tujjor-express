/**
 * Camera continuity contract check (docs/DESIGN.md §3.3):
 * for every consecutive stage pair without `cutAtEnd`, cameraAt_N(1) must equal cameraAt_{N+1}(0)
 * (|Δpos| < 1e-3, |Δtarget| < 1e-3, |Δfov| < 1e-3) in world space. Run: npm run check:camera
 */
import { STAGES, WORLD_OFFSET } from '../src/lib/timeline'
import type { CameraCtx, CameraFn } from '../src/lib/camera'
import { offsetPose } from '../src/lib/camera'

const FILES: Record<string, string> = {
  hero: 'HeroScene',
  warehouse: 'WarehouseScene',
  conveyor: 'ConveyorScene',
  container: 'ContainerScene',
  globe: 'GlobeScene',
  tunnel: 'TunnelScene',
  uzbekistan: 'UzbekistanScene',
  delivery: 'DeliveryScene',
  network: 'NetworkScene',
  exploded: 'BoxExplodedScene',
  calculator: 'CalculatorScene',
  tracking: 'TrackingScene',
  final: 'FinalScene',
}
const ctx: CameraCtx = { aspect: 16 / 9, isPortrait: false, isShort: false, isMobile: false, isCoarse: false, offset: 0, motionOff: false }
let failures = 0
const fns: Record<string, CameraFn> = {}
for (const s of STAGES) {
  try {
    const mod = await import(`../src/components/three/scenes/${FILES[s.id]}.camera.ts`)
    fns[s.id] = mod.cameraAt
    if (!mod.lights) {
      console.error(`✗ ${s.id}: missing 'lights' export`)
      failures++
    }
  } catch (e) {
    console.error(`✗ ${s.id}: cannot import ${FILES[s.id]}.camera.ts —`, (e as Error).message)
    failures++
  }
}
for (let i = 0; i < STAGES.length - 1; i++) {
  const a = STAGES[i]
  const b = STAGES[i + 1]
  if (a.cutAtEnd) continue
  const fa = fns[a.id]
  const fb = fns[b.id]
  if (!fa || !fb) continue
  const pa = offsetPose(fa(1, { ...ctx, offset: WORLD_OFFSET[a.world] }), WORLD_OFFSET[a.world])
  const pb = offsetPose(fb(0, { ...ctx, offset: WORLD_OFFSET[b.world] }), WORLD_OFFSET[b.world])
  const d = (x: number[], y: number[]) => Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
  const dp = d(pa.position, pb.position)
  const dt = d(pa.target, pb.target)
  const df = Math.abs(pa.fov - pb.fov)
  const ok = dp < 1e-3 && dt < 1e-3 && df < 1e-3
  if (!ok) failures++
  console.log(`${ok ? '✓' : '✗'} ${a.id} → ${b.id}: Δpos ${dp.toFixed(3)} Δtarget ${dt.toFixed(3)} Δfov ${df.toFixed(2)}${ok ? '' : `\n     ${a.id}(1) = ${JSON.stringify(pa)}\n     ${b.id}(0) = ${JSON.stringify(pb)}`}`)
}
// also sample every pose for NaN / degenerate lookAt
for (const s of STAGES) {
  const f = fns[s.id]
  if (!f) continue
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const p = f(t, { ...ctx, offset: WORLD_OFFSET[s.world] })
    const vals = [...p.position, ...p.target, p.fov]
    if (vals.some((v) => !Number.isFinite(v))) {
      console.error(`✗ ${s.id} t=${t.toFixed(2)}: non-finite pose`)
      failures++
    }
    const dir = [p.target[0] - p.position[0], p.target[1] - p.position[1], p.target[2] - p.position[2]]
    const len = Math.hypot(...dir)
    if (len < 1e-4) {
      console.error(`✗ ${s.id} t=${t.toFixed(2)}: target equals position`)
      failures++
    }
    const up = p.up ?? [0, 1, 0]
    const cos = Math.abs((dir[0] * up[0] + dir[1] * up[1] + dir[2] * up[2]) / len)
    if (cos > 0.999) {
      console.error(`✗ ${s.id} t=${t.toFixed(2)}: view direction parallel to up (degenerate lookAt) — set pose.up`)
      failures++
    }
  }
}
console.log(failures ? `\n${failures} problem(s)` : '\nAll camera boundaries continuous.')
process.exit(failures ? 1 : 0)
