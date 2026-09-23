'use client'
/**
 * ONE requestAnimationFrame loop for the whole site (docs: "no multiple RAF loops").
 * Lenis, GSAP, the HTML overlays, the cursor and the R3F render (via `advance`) all subscribe here.
 * Subscribers run in priority order (lower first); the R3F advance is scheduled by the render
 * scheduler (60 fps while scrolling / interacting / animating, 30 fps when idle, 0 when hidden).
 */
import gsap from 'gsap'

type Sub = { fn: (t: number, dt: number) => void; prio: number }
let gsapDriven = false
function driveGsap() {
  if (gsapDriven || typeof window === 'undefined') return
  gsapDriven = true
  // GSAP is updated from this loop instead of its own rAF (one loop for Lenis, GSAP, DOM and WebGL)
  gsap.ticker.remove(gsap.updateRoot)
  gsap.ticker.lagSmoothing(0)
}
const subs: Sub[] = []
let running = false
let rafId = 0
let last = 0
let paused = false

function frame(t: number) {
  rafId = requestAnimationFrame(frame)
  if (paused) return
  const dt = last ? Math.min(0.1, (t - last) / 1000) : 0.016
  last = t
  gsap.updateRoot(t / 1000)
  for (let i = 0; i < subs.length; i++) subs[i].fn(t, dt)
}
function ensure() {
  if (running || typeof window === 'undefined') return
  running = true
  driveGsap()
  rafId = requestAnimationFrame(frame)
  document.addEventListener('visibilitychange', () => ticker.pause(document.hidden))
}
export const ticker = {
  /** subscribe; returns unsubscribe. prio: 0 = input (Lenis), 10 = GSAP, 20 = DOM overlays, 50 = render */
  add(fn: (t: number, dt: number) => void, prio = 20) {
    const s = { fn, prio }
    subs.push(s)
    subs.sort((a, b) => a.prio - b.prio)
    ensure()
    return () => {
      const i = subs.indexOf(s)
      if (i >= 0) subs.splice(i, 1)
    }
  },
  pause(v: boolean) {
    paused = v
    if (!v) last = 0
  },
  stop() {
    cancelAnimationFrame(rafId)
    running = false
    last = 0
  },
}

/* ---------------- render scheduler ---------------- */
/** Activity signals: anything that should keep the 3D loop at full rate bumps `wake(ms)`. */
let activeUntil = 0
let forced = 0
export const scheduler = {
  /** keep full-rate rendering for `ms` from now */
  wake(ms = 1200) {
    activeUntil = Math.max(activeUntil, performance.now() + ms)
  },
  /** force full-rate while > 0 (intro, transitions, sound on) */
  hold(on: boolean) {
    forced += on ? 1 : -1
    if (forced < 0) forced = 0
  },
  /** target interval for the next frame: 0 = every frame, else ms between renders */
  idleIntervalMs: 1000 / 30,
  isActive() {
    return forced > 0 || performance.now() < activeUntil
  },
  /** debug: ms of full-rate time remaining, and the forced hold count */
  debug() {
    return { remainingMs: Math.max(0, activeUntil - performance.now()), forced }
  },
}
