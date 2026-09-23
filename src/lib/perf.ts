'use client'
import type * as THREE from 'three'

/**
 * Runtime performance instrumentation + live overrides used by the profiler and the dev HUD.
 * Enabled only in development or in a build with NEXT_PUBLIC_PERF_HUD=1 (never visible to production users).
 * Everything here is mutable and read in the render loop — no React state.
 */
export const PERF_ENABLED = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_PERF_HUD === '1'

export interface PerfOverrides {
  /** force a quality tier and stop the auto manager */
  lockTier?: boolean
  dpr?: number
  bloom?: boolean
  dof?: boolean
  radial?: boolean
  noise?: boolean
  vignette?: boolean
  smaa?: boolean
  msaa?: number
  postfx?: boolean
  shadows?: boolean
  particles?: number
  /** render only this stage's scene (others hidden) — per-scene cost measurement */
  onlyStage?: string
  /** disable the render scheduler (always 60 fps) */
  alwaysRender?: boolean
  /** number of active spot lights (0–4) / point lights (0–2) — per-fragment lighting cost probe */
  spots?: number
  points?: number
  /** shadow map type: 'basic' | 'pcf' | 'soft' */
  shadowType?: string
  /** environment map intensity multiplier (0 = no IBL sampling) */
  env?: number
  /** fog on/off */
  fog?: boolean
  /** bloom render target scale */
  bloomScale?: number
}
export const perfOverrides: PerfOverrides = {}

/** URL overrides for reproducible profiling runs: ?perf=dpr:1,bloom:0,dof:0,postfx:0,shadows:0,msaa:0,only:warehouse,lock:1,always:1 */
if (PERF_ENABLED && typeof window !== 'undefined') {
  try {
    const q = new URLSearchParams(window.location.search).get('perf')
    if (q) {
      for (const kv of q.split(',')) {
        const [k, v] = kv.split(':')
        const b = v === '1' || v === 'true'
        if (k === 'dpr') perfOverrides.dpr = Number(v)
        else if (k === 'msaa') perfOverrides.msaa = Number(v)
        else if (k === 'particles') perfOverrides.particles = Number(v)
        else if (k === 'only') perfOverrides.onlyStage = v
        else if (k === 'lock') perfOverrides.lockTier = b
        else if (k === 'always') perfOverrides.alwaysRender = b
        else if (k === 'bloom') perfOverrides.bloom = b
        else if (k === 'dof') perfOverrides.dof = b
        else if (k === 'radial') perfOverrides.radial = b
        else if (k === 'noise') perfOverrides.noise = b
        else if (k === 'vignette') perfOverrides.vignette = b
        else if (k === 'smaa') perfOverrides.smaa = b
        else if (k === 'postfx') perfOverrides.postfx = b
        else if (k === 'shadows') perfOverrides.shadows = b
        else if (k === 'spots') perfOverrides.spots = Number(v)
        else if (k === 'points') perfOverrides.points = Number(v)
        else if (k === 'shadowType') perfOverrides.shadowType = v
        else if (k === 'env') perfOverrides.env = Number(v)
        else if (k === 'fog') perfOverrides.fog = b
        else if (k === 'bloomScale') perfOverrides.bloomScale = Number(v)
      }
    }
  } catch {
    /* ignore */
  }
}

const N = 240
const cpu = new Float32Array(N) // JS time per frame (advance + render), ms
const raf = new Float32Array(N) // wall time between frames, ms
const gpu = new Float32Array(N) // GPU time per frame when timer queries are available, ms
let idx = 0
let filled = 0
let gpuFilled = 0
let lastRaf = 0

export const perfLive = {
  cpuMs: 0,
  rafMs: 0,
  gpuMs: -1,
  fps: 0,
  calls: 0,
  tris: 0,
  points: 0,
  lines: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
  memMb: -1,
  dpr: 1,
  stage: '',
  t: 0,
  tier: '',
  visibleStages: '',
  rendered: 0,
  skipped: 0,
}

export function perfBeginFrame(now: number) {
  if (lastRaf) raf[idx] = now - lastRaf
  lastRaf = now
}
export function perfEndFrame(cpuMs: number, gl: THREE.WebGLRenderer) {
  cpu[idx] = cpuMs
  idx = (idx + 1) % N
  filled = Math.min(N, filled + 1)
  const info = gl.info
  perfLive.calls = info.render.calls
  perfLive.tris = info.render.triangles
  perfLive.points = info.render.points
  perfLive.lines = info.render.lines
  perfLive.geometries = info.memory.geometries
  perfLive.textures = info.memory.textures
  perfLive.programs = info.programs?.length ?? 0
  perfLive.dpr = gl.getPixelRatio()
  const m = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
  if (m) perfLive.memMb = m.usedJSHeapSize / 1048576
}
export function perfPushGpu(ms: number) {
  gpu[gpuFilled % N] = ms
  gpuFilled++
}
function stats(buf: Float32Array, count: number) {
  const n = Math.min(count, N)
  if (!n) return { avg: 0, p95: 0, max: 0 }
  const arr = Array.from(buf.subarray(0, n)).sort((a, b) => a - b)
  const avg = arr.reduce((a, b) => a + b, 0) / n
  return { avg, p95: arr[Math.min(n - 1, Math.floor(n * 0.95))], max: arr[n - 1] }
}
/** Aggregate stats over the ring buffer (last ≤240 frames). */
export function perfStats() {
  const c = stats(cpu, filled)
  const r = stats(raf, filled)
  const g = stats(gpu, gpuFilled)
  perfLive.cpuMs = c.avg
  perfLive.rafMs = r.avg
  perfLive.fps = r.avg ? 1000 / r.avg : 0
  perfLive.gpuMs = gpuFilled ? g.avg : -1
  return {
    ...perfLive,
    cpu: c,
    raf: r,
    gpu: gpuFilled ? g : null,
    frames: filled,
  }
}
export function perfReset() {
  idx = 0
  filled = 0
  gpuFilled = 0
  lastRaf = 0
  perfLive.rendered = 0
  perfLive.skipped = 0
}

/** GPU timer queries (EXT_disjoint_timer_query_webgl2) — available on desktop Chrome; ignored elsewhere. */
export function createGpuTimer(gl: THREE.WebGLRenderer) {
  const ctx = gl.getContext() as WebGL2RenderingContext
  const ext = ctx.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null
  if (!ext || typeof ctx.createQuery !== 'function') return null
  const pending: WebGLQuery[] = []
  let active: WebGLQuery | null = null
  return {
    begin() {
      if (active) return
      // resolve finished queries first
      while (pending.length) {
        const q = pending[0]
        const available = ctx.getQueryParameter(q, ctx.QUERY_RESULT_AVAILABLE)
        const disjoint = ctx.getParameter(ext.GPU_DISJOINT_EXT)
        if (!available) break
        pending.shift()
        if (!disjoint) {
          const ns = ctx.getQueryParameter(q, ctx.QUERY_RESULT) as number
          perfPushGpu(ns / 1e6)
        }
        ctx.deleteQuery(q)
      }
      if (pending.length > 8) return
      active = ctx.createQuery()
      if (active) ctx.beginQuery(ext.TIME_ELAPSED_EXT, active)
    },
    end() {
      if (!active) return
      ctx.endQuery(ext.TIME_ELAPSED_EXT)
      pending.push(active)
      active = null
    },
  }
}
