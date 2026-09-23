'use client'
import * as THREE from 'three'
import { seeded } from './math'

/**
 * Procedural texture generation (CanvasTexture). Every texture is memoised per size
 * so scenes can call these freely; generation happens once during preload.
 */
const cache = new Map<string, unknown>()
function memo<T>(key: string, make: () => T): T {
  const hit = cache.get(key)
  if (hit) return hit as T
  const t = make()
  cache.set(key, t)
  return t
}

function canvas(size: number) {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  return c
}

/** value-noise on a canvas ImageData, returns Float32Array 0..1 */
function valueNoise(size: number, octaves = 4, seed = 1): Float32Array {
  const rnd = seeded(seed)
  const out = new Float32Array(size * size)
  let amp = 1
  let total = 0
  let freq = 4
  for (let o = 0; o < octaves; o++) {
    const grid = new Float32Array((freq + 1) * (freq + 1))
    for (let i = 0; i < grid.length; i++) grid[i] = rnd()
    const cell = size / freq
    for (let y = 0; y < size; y++) {
      const gy = y / cell
      const y0 = Math.floor(gy)
      const fy = gy - y0
      const sy = fy * fy * (3 - 2 * fy)
      for (let x = 0; x < size; x++) {
        const gx = x / cell
        const x0 = Math.floor(gx)
        const fx = gx - x0
        const sx = fx * fx * (3 - 2 * fx)
        const i00 = grid[y0 * (freq + 1) + x0]
        const i10 = grid[y0 * (freq + 1) + Math.min(x0 + 1, freq)]
        const i01 = grid[Math.min(y0 + 1, freq) * (freq + 1) + x0]
        const i11 = grid[Math.min(y0 + 1, freq) * (freq + 1) + Math.min(x0 + 1, freq)]
        const v = (i00 * (1 - sx) + i10 * sx) * (1 - sy) + (i01 * (1 - sx) + i11 * sx) * sy
        out[y * size + x] += v * amp
      }
    }
    total += amp
    amp *= 0.5
    freq *= 2
  }
  for (let i = 0; i < out.length; i++) out[i] /= total
  return out
}

function heightToNormal(h: Float32Array, size: number, strength = 2): THREE.CanvasTexture {
  const c = canvas(size)
  const g = c.getContext('2d')!
  const img = g.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)]
      const r = h[y * size + ((x + 1) % size)]
      const u = h[((y - 1 + size) % size) * size + x]
      const d = h[((y + 1) % size) * size + x]
      const nx = (l - r) * strength
      const ny = (u - d) * strength
      const nz = 1
      const len = Math.hypot(nx, ny, nz)
      const i = (y * size + x) * 4
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255
      img.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

export interface CardboardSet {
  map: THREE.Texture
  normalMap: THREE.Texture
  roughnessMap: THREE.Texture
}

/**
 * Branded Tujjor Express cardboard: kraft base + fibre noise + print + tape + label + barcode.
 * `variant` 0 = branded face, 1 = plain side (still kraft), 2 = plain with "fragile" arrows,
 * 3 = closed top (flap seam + tape across the middle — what the 4 closed flaps of the dynamic box look like).
 */
export type CardboardVariant = 0 | 1 | 2 | 3
export function cardboardTextures(size = 1024, variant: CardboardVariant = 0): CardboardSet {
  return memo(`cardboard-${size}-${variant}`, () => {
    const c = canvas(size)
    const g = c.getContext('2d')!
    // base kraft
    g.fillStyle = '#c99c66'
    g.fillRect(0, 0, size, size)
    const n = valueNoise(size, 5, 11 + variant)
    const img = g.getImageData(0, 0, size, size)
    const rnd = seeded(7 + variant)
    for (let i = 0; i < size * size; i++) {
      const v = n[i]
      const fibre = (rnd() - 0.5) * 18
      const shade = (v - 0.5) * 46 + fibre
      img.data[i * 4] = Math.max(0, Math.min(255, 201 + shade))
      img.data[i * 4 + 1] = Math.max(0, Math.min(255, 156 + shade * 0.9))
      img.data[i * 4 + 2] = Math.max(0, Math.min(255, 102 + shade * 0.7))
    }
    g.putImageData(img, 0, 0)
    // horizontal fibre streaks
    g.globalAlpha = 0.08
    for (let i = 0; i < 260; i++) {
      g.strokeStyle = rnd() > 0.5 ? '#f0d4a8' : '#8a6238'
      g.lineWidth = rnd() * 1.4
      const y = rnd() * size
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(size, y + (rnd() - 0.5) * 6)
      g.stroke()
    }
    g.globalAlpha = 1
    // fold crease / edge darkening
    const grad = g.createRadialGradient(size / 2, size / 2, size * 0.35, size / 2, size / 2, size * 0.72)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(1, 'rgba(60,35,10,0.35)')
    g.fillStyle = grad
    g.fillRect(0, 0, size, size)

    const s = size / 1024
    if (variant === 0) {
      // brand print
      g.fillStyle = 'rgba(28,20,14,0.88)'
      g.font = `700 ${150 * s}px "Space Grotesk", "Inter", sans-serif`
      g.textBaseline = 'alphabetic'
      g.fillText('TUJJOR', 96 * s, 420 * s)
      g.fillText('EXPRESS', 96 * s, 570 * s)
      // orange stripe
      g.fillStyle = 'rgba(255,106,0,0.92)'
      g.fillRect(96 * s, 610 * s, 620 * s, 14 * s)
      // small line
      g.fillStyle = 'rgba(28,20,14,0.75)'
      g.font = `600 ${30 * s}px "Inter", sans-serif`
      g.fillText('CHINA  →  UZBEKISTAN  →  CHIRCHIQ', 96 * s, 680 * s)
      // shipping label
      g.fillStyle = 'rgba(245,240,232,0.94)'
      g.fillRect(620 * s, 96 * s, 300 * s, 200 * s)
      g.fillStyle = '#1a1512'
      g.font = `600 ${20 * s}px "Inter", sans-serif`
      g.fillText('TUJJOR EXPRESS CHIRCHIQ', 636 * s, 130 * s)
      g.font = `400 ${16 * s}px "Inter", sans-serif`
      g.fillText('FROM: CN WAREHOUSE', 636 * s, 160 * s)
      g.fillText('TO:   UZ · CHIRCHIQ', 636 * s, 184 * s)
      g.fillText('@tujjor_chirchiq', 636 * s, 208 * s)
      // barcode
      let x = 636 * s
      const brnd = seeded(99)
      while (x < 900 * s) {
        const w = (1 + Math.floor(brnd() * 4)) * s
        g.fillRect(x, 226 * s, w, 56 * s)
        x += w + (1 + Math.floor(brnd() * 3)) * s
      }
      g.fillStyle = 'rgba(255,106,0,1)'
      g.fillRect(620 * s, 96 * s, 300 * s, 6 * s)
    } else if (variant === 2) {
      g.strokeStyle = 'rgba(28,20,14,0.7)'
      g.lineWidth = 10 * s
      g.lineCap = 'round'
      // "this way up" arrows
      for (const ox of [200, 700]) {
        g.beginPath()
        g.moveTo(ox * s, 520 * s)
        g.lineTo(ox * s, 300 * s)
        g.moveTo((ox - 70) * s, 370 * s)
        g.lineTo(ox * s, 300 * s)
        g.lineTo((ox + 70) * s, 370 * s)
        g.stroke()
      }
      g.beginPath()
      g.moveTo(150 * s, 560 * s)
      g.lineTo(830 * s, 560 * s)
      g.stroke()
      g.fillStyle = 'rgba(28,20,14,0.7)'
      g.font = `700 ${44 * s}px "Inter", sans-serif`
      g.fillText('FRAGILE · HANDLE WITH CARE', 200 * s, 660 * s)
    }
    if (variant === 3) {
      // closed flaps seen from above: seam across the middle, flap edge shading, tape along the seam
      g.fillStyle = 'rgba(40,26,12,0.55)'
      g.fillRect(0, size / 2 - 2 * s, size, 4 * s)
      const sh = g.createLinearGradient(0, size / 2 - 40 * s, 0, size / 2 + 40 * s)
      sh.addColorStop(0, 'rgba(0,0,0,0)')
      sh.addColorStop(0.5, 'rgba(0,0,0,0.18)')
      sh.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = sh
      g.fillRect(0, size / 2 - 40 * s, size, 80 * s)
      g.fillStyle = 'rgba(214,188,140,0.55)'
      g.fillRect(0, size / 2 - 23 * s, size, 46 * s)
      g.fillStyle = 'rgba(255,255,255,0.10)'
      g.fillRect(0, size / 2 - 11 * s, size, 3 * s)
    } else {
      // packing tape strip across the top (it's the closing seam)
      g.fillStyle = 'rgba(214,188,140,0.55)'
      g.fillRect(0, 0, size, 46 * s)
      g.fillStyle = 'rgba(255,255,255,0.10)'
      g.fillRect(0, 12 * s, size, 3 * s)
    }

    const map = new THREE.CanvasTexture(c)
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 4
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping

    const nsize = Math.min(512, size)
    const hn = valueNoise(nsize, 6, 31 + variant)
    // crease lines in height for realism
    for (let y = 0; y < nsize; y++) for (let x = 0; x < nsize; x++) hn[y * nsize + x] = hn[y * nsize + x] * 0.35 + (y < 20 ? 0.6 : 0)
    const normalMap = heightToNormal(hn, nsize, 1.4)
    normalMap.wrapS = normalMap.wrapT = THREE.ClampToEdgeWrapping

    const rc = canvas(nsize)
    const rg = rc.getContext('2d')!
    const rimg = rg.createImageData(nsize, nsize)
    const rn = valueNoise(nsize, 3, 77 + variant)
    for (let i = 0; i < nsize * nsize; i++) {
      const v = 190 + (rn[i] - 0.5) * 70
      rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = v
      rimg.data[i * 4 + 3] = 255
    }
    rg.putImageData(rimg, 0, 0)
    const roughnessMap = new THREE.CanvasTexture(rc)
    return { map, normalMap, roughnessMap }
  })
}

/**
 * 3-tile horizontal atlas of the cardboard variants (0 brand | 2 arrows | 1 plain) so a whole box is ONE
 * draw call: map + normal + roughness at tile width `size`. Used by TujjorBox (static mode) and MiniBox (flat).
 */
export function cardboardAtlas(size = 512): CardboardSet & { tile: (variant: CardboardVariant) => [number, number] } {
  return memo(`cardboard-atlas-${size}`, () => {
    const order: CardboardVariant[] = [0, 2, 1, 3]
    const sets = order.map((v) => cardboardTextures(size, v))
    const pack = (pick: (s: CardboardSet) => THREE.Texture, colorSpace: THREE.ColorSpace) => {
      const c = document.createElement('canvas')
      c.width = size * 4
      c.height = size
      const g = c.getContext('2d')!
      sets.forEach((set, i) => g.drawImage(pick(set).image as CanvasImageSource, i * size, 0, size, size))
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = colorSpace
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
      t.anisotropy = 4
      return t
    }
    const map = pack((s) => s.map, THREE.SRGBColorSpace)
    const normalMap = pack((s) => s.normalMap, THREE.NoColorSpace)
    const roughnessMap = pack((s) => s.roughnessMap, THREE.NoColorSpace)
    // tile u-range for a variant
    const tile = (variant: CardboardVariant): [number, number] => {
      const i = order.indexOf(variant)
      return [i / 4, (i + 1) / 4]
    }
    return { map, normalMap, roughnessMap, tile }
  })
}

/** Concrete warehouse floor with faint expansion joints and a subtle logistics grid. */
export function concreteTextures(size = 1024): { map: THREE.Texture; roughnessMap: THREE.Texture; normalMap: THREE.Texture } {
  return memo(`concrete-${size}`, () => {
    const c = canvas(size)
    const g = c.getContext('2d')!
    const n = valueNoise(size, 6, 5)
    const img = g.createImageData(size, size)
    const rnd = seeded(3)
    for (let i = 0; i < size * size; i++) {
      const v = 52 + (n[i] - 0.5) * 28 + (rnd() - 0.5) * 6
      img.data[i * 4] = v
      img.data[i * 4 + 1] = v + 1
      img.data[i * 4 + 2] = v + 3
      img.data[i * 4 + 3] = 255
    }
    g.putImageData(img, 0, 0)
    g.strokeStyle = 'rgba(0,0,0,0.35)'
    g.lineWidth = 3
    for (let i = 0; i <= 4; i++) {
      const p = (i / 4) * size
      g.beginPath()
      g.moveTo(p, 0)
      g.lineTo(p, size)
      g.moveTo(0, p)
      g.lineTo(size, p)
      g.stroke()
    }
    // faded floor markings
    g.strokeStyle = 'rgba(255,106,0,0.10)'
    g.lineWidth = 12
    g.setLineDash([80, 60])
    g.beginPath()
    g.moveTo(0, size * 0.5)
    g.lineTo(size, size * 0.5)
    g.stroke()
    const map = new THREE.CanvasTexture(c)
    map.colorSpace = THREE.SRGBColorSpace
    map.wrapS = map.wrapT = THREE.RepeatWrapping
    map.anisotropy = 4
    const rs = Math.min(512, size)
    const hn = valueNoise(rs, 4, 9)
    const normalMap = heightToNormal(hn, rs, 0.9)
    const rc = canvas(rs)
    const rg = rc.getContext('2d')!
    const ri = rg.createImageData(rs, rs)
    for (let i = 0; i < rs * rs; i++) {
      const v = 200 + (hn[i] - 0.5) * 60
      ri.data[i * 4] = ri.data[i * 4 + 1] = ri.data[i * 4 + 2] = v
      ri.data[i * 4 + 3] = 255
    }
    rg.putImageData(ri, 0, 0)
    const roughnessMap = new THREE.CanvasTexture(rc)
    roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping
    return { map, roughnessMap, normalMap }
  })
}

/** Corrugated steel normal map for containers (vertical sine profile). */
export function corrugatedNormal(size = 512, waves = 14): THREE.Texture {
  return memo(`corrugated-${size}-${waves}`, () => {
    const h = new Float32Array(size * size)
    const n = valueNoise(size, 3, 21)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const w = Math.sin((x / size) * Math.PI * 2 * waves)
        const trap = Math.max(-0.7, Math.min(0.7, w * 1.6)) / 0.7 // trapezoid profile
        h[y * size + x] = trap * 0.5 + 0.5 + (n[y * size + x] - 0.5) * 0.08
      }
    const t = heightToNormal(h, size, 3.2)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    return t
  })
}

/** Branded plate texture for truck / container / office signage. */
export function brandPlate(text = 'TUJJOR EXPRESS', w = 1024, h = 256, bg = '#ffffff', fg = '#ff6a00'): THREE.Texture {
  return memo(`plate-${text}-${w}-${h}-${bg}-${fg}`, () => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')!
    g.fillStyle = bg
    g.fillRect(0, 0, w, h)
    g.fillStyle = fg
    g.font = `700 ${h * 0.5}px "Space Grotesk", "Inter", sans-serif`
    g.textBaseline = 'middle'
    g.textAlign = 'center'
    g.fillText(text, w / 2, h / 2 + h * 0.02)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  })
}

/** Soft radial sprite for particles / glows. */
export function glowSprite(size = 128): THREE.Texture {
  return memo(`glow-${size}`, () => {
    const c = canvas(size)
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.35, 'rgba(255,255,255,0.55)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, size, size)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  })
}

/** Generic label (white text on transparent) for 3D signage where troika is overkill. */
export function labelTexture(text: string, opts: { w?: number; h?: number; font?: string; color?: string; bg?: string } = {}): THREE.Texture {
  const { w = 512, h = 128, font = '600 48px "Inter", sans-serif', color = '#f2efe9', bg = 'transparent' } = opts
  return memo(`label-${text}-${w}-${h}-${font}-${color}-${bg}`, () => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')!
    if (bg !== 'transparent') {
      g.fillStyle = bg
      g.fillRect(0, 0, w, h)
    }
    g.fillStyle = color
    g.font = font
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, w / 2, h / 2)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  })
}
