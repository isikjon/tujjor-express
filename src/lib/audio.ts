'use client'
/**
 * Zero-asset sound design: everything is synthesised with WebAudio.
 * Nothing plays until the user explicitly enables sound (useApp.soundOn).
 */
let ctx: AudioContext | null = null
let master: GainNode | null = null
let hum: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null
let noiseBuffer: AudioBuffer | null = null

function ensure() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}
function noise() {
  const c = ensure()!
  if (noiseBuffer) return noiseBuffer
  const len = c.sampleRate * 2
  noiseBuffer = c.createBuffer(1, len, c.sampleRate)
  const d = noiseBuffer.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  return noiseBuffer
}

let enabled = false
let ducked = false
function applyMaster() {
  if (!ctx || !master) return
  const t = ctx.currentTime
  master.gain.cancelScheduledValues(t)
  master.gain.setTargetAtTime(enabled && !ducked ? 0.5 : 0, t, ducked ? 0.08 : 0.25)
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    ducked = document.hidden
    applyMaster()
  })
  window.addEventListener('blur', () => {
    ducked = true
    applyMaster()
  })
  window.addEventListener('focus', () => {
    ducked = false
    applyMaster()
  })
}

export const audio = {
  enable(on: boolean) {
    enabled = on
    if (!on && !ctx) return
    const c = ensure()
    if (!c || !master) return
    applyMaster()
    if (on) this.startHum()
    try {
      localStorage.setItem('tj_sound', on ? '1' : '0')
    } catch {
      /* ignore */
    }
  },
  get enabled() {
    return enabled
  },
  /** Low cinematic hum — the 'engine' of the site. Intensity 0..1 modulated by scenes. */
  startHum() {
    const c = ensure()
    if (!c || !master || hum) return
    const osc = c.createOscillator()
    const osc2 = c.createOscillator()
    const gain = c.createGain()
    const filter = c.createBiquadFilter()
    osc.type = 'sawtooth'
    osc.frequency.value = 46
    osc2.type = 'sine'
    osc2.frequency.value = 92.5
    filter.type = 'lowpass'
    filter.frequency.value = 180
    filter.Q.value = 0.8
    gain.gain.value = 0.16
    osc.connect(filter)
    osc2.connect(filter)
    filter.connect(gain)
    gain.connect(master)
    osc.start()
    osc2.start()
    hum = { osc, osc2, gain, filter }
  },
  /** 0..1 – drives hum brightness/volume (e.g. tunnel = 1, studio = 0.3) */
  setHum(intensity: number) {
    if (!hum || !ctx) return
    const t = ctx.currentTime
    hum.filter.frequency.setTargetAtTime(120 + intensity * 520, t, 0.4)
    hum.gain.gain.setTargetAtTime(0.08 + intensity * 0.2, t, 0.4)
  },
  whoosh(duration = 0.7, pitch = 1) {
    const c = ensure()
    if (!c || !master) return
    const src = c.createBufferSource()
    src.buffer = noise()
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 1.2
    const g = c.createGain()
    const t = c.currentTime
    bp.frequency.setValueAtTime(200 * pitch, t)
    bp.frequency.exponentialRampToValueAtTime(2400 * pitch, t + duration * 0.4)
    bp.frequency.exponentialRampToValueAtTime(300 * pitch, t + duration)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.5, t + duration * 0.25)
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    src.connect(bp).connect(g).connect(master)
    src.start(t)
    src.stop(t + duration + 0.05)
  },
  click(freq = 1800) {
    const c = ensure()
    if (!c || !master) return
    const o = c.createOscillator()
    const g = c.createGain()
    const t = c.currentTime
    o.type = 'square'
    o.frequency.setValueAtTime(freq, t)
    o.frequency.exponentialRampToValueAtTime(freq * 0.4, t + 0.06)
    g.gain.setValueAtTime(0.18, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08)
    o.connect(g).connect(master)
    o.start(t)
    o.stop(t + 0.1)
  },
  /** cargo 'thud' for box landing */
  thud() {
    const c = ensure()
    if (!c || !master) return
    const o = c.createOscillator()
    const g = c.createGain()
    const t = c.currentTime
    o.type = 'sine'
    o.frequency.setValueAtTime(140, t)
    o.frequency.exponentialRampToValueAtTime(40, t + 0.25)
    g.gain.setValueAtTime(0.6, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
    o.connect(g).connect(master)
    o.start(t)
    o.stop(t + 0.4)
  },
}
