'use client'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { brandPlate, concreteTextures } from '@/lib/textures'

/**
 * Tujjor Express office (docs §08): two-storey block 10 × 7 × 6, plaster upper storey over a
 * recessed glowing storefront (emissive glass strips '#ffd9b0' × 1.5), graphite columns, canopy
 * with an orange fascia and down-lights, TUJJOR EXPRESS sign plate, glass double door.
 * Local origin = centre of the FRONT facade at ground level; the block extends toward −Z.
 * Built as 7 merged meshes: plaster (block + slab + step), graphite, dark trim, roof, dark window
 * panes, and two emissive meshes sharing one 1024² atlas (storefront gradient, sign plate, white
 * patch) — one whose colour breathes with `setGlow` (storefront, door glass, down-lights) and one
 * static (sign, lit windows, orange fascia / pull bars). Vertex colours carry per-part tints.
 */
export const OFFICE_W = 10
export const OFFICE_H = 7
export const OFFICE_D = 6

export interface OfficeHandle {
  group: THREE.Group
  /** storefront glow 0..1 (1 = design intensity) */
  setGlow: (k: number) => void
}

/* ---- emissive atlas (1024 × 1024, sRGB): sign plate on top, storefront lower-left, white patch lower-right ---- */
const ATLAS = 1024
const R_PLATE = { x: 0, y: 0, w: 1024, h: 256 }
const R_STORE = { x: 0, y: 320, w: 512, h: 256 }
const R_WHITE = { x: 640, y: 320, w: 320, h: 256 }
const cache: { atlas?: THREE.Texture } = {}
function emissiveAtlas() {
  if (cache.atlas) return cache.atlas
  const c = document.createElement('canvas')
  c.width = c.height = ATLAS
  const g = c.getContext('2d')!
  g.fillStyle = '#000000'
  g.fillRect(0, 0, ATLAS, ATLAS)
  // sign plate (memoised brand texture, drawn from its canvas — never uploaded on its own)
  const plate = brandPlate('TUJJOR EXPRESS', 1024, 256, '#ff6a00', '#ffffff').image as HTMLCanvasElement
  g.drawImage(plate, R_PLATE.x, R_PLATE.y, R_PLATE.w, R_PLATE.h)
  // warm lit-interior storefront: vertical gradient + shelf / counter silhouettes
  {
    const { x, y, w, h } = R_STORE
    const grad = g.createLinearGradient(0, y, 0, y + h)
    grad.addColorStop(0, '#ffe6cc')
    grad.addColorStop(0.55, '#ffd9b0')
    grad.addColorStop(1, '#ffc48c')
    g.fillStyle = grad
    g.fillRect(x, y, w, h)
    // interior columns + shelves (soft silhouettes behind the glass)
    g.fillStyle = 'rgba(60,40,25,0.22)'
    for (let i = 0; i < 6; i++) g.fillRect(x + 40 + i * 82, y, 10, h)
    g.fillStyle = 'rgba(60,40,25,0.18)'
    g.fillRect(x, y + 118, w, 6)
    g.fillRect(x, y + 166, w, 6)
    g.fillStyle = 'rgba(60,40,25,0.3)'
    g.fillRect(x, y + 200, w, 56)
    // ceiling light strip
    g.fillStyle = 'rgba(255,255,255,0.35)'
    g.fillRect(x, y + 10, w, 6)
  }
  g.fillStyle = '#ffffff'
  g.fillRect(R_WHITE.x, R_WHITE.y, R_WHITE.w, R_WHITE.h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  cache.atlas = t
  return t
}
/** remap a geometry's 0..1 UVs into an atlas rect (inset by `pad` texels against bleed); `pad < 0` collapses to the rect centre */
function atlasUV(g: THREE.BufferGeometry, r: { x: number; y: number; w: number; h: number }, pad = 2) {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) {
    const u = pad < 0 ? 0.5 : uv.getX(i)
    const v = pad < 0 ? 0.5 : uv.getY(i)
    const p = Math.max(0, pad)
    const px = r.x + p + u * (r.w - 2 * p)
    // canvas y runs down, texture v runs up (flipY)
    const py = r.y + p + (1 - v) * (r.h - 2 * p)
    uv.setXY(i, px / ATLAS, 1 - py / ATLAS)
  }
  return g
}
function tint(g: THREE.BufferGeometry, c: THREE.Color) {
  const n = g.getAttribute('position').count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r
    col[i * 3 + 1] = c.g
    col[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}
function bx(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  return g
}
function merge(list: THREE.BufferGeometry[]) {
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g))
  const out = mergeGeometries(flat, false) ?? flat[0]
  for (const g of list) if (g !== out) g.dispose()
  for (const g of flat) if (g !== out) g.dispose()
  return out
}

const W = OFFICE_W
const H = OFFICE_H
const D = OFFICE_D
const gf = 3.5 // ground-floor height

export const OfficeBuilding = forwardRef<OfficeHandle, { position?: [number, number, number] }>(function OfficeBuilding({ position }, ref) {
  const group = useRef<THREE.Group>(null!)
  const glowK = useRef(-1)
  const built = useMemo(() => {
    const con = concreteTextures(512)
    const wall = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.9, metalness: 0, normalMap: con.normalMap, normalScale: new THREE.Vector2(0.35, 0.35) })
    const graphite = new THREE.MeshStandardMaterial({ color: '#25282e', roughness: 0.6, metalness: 0.35 })
    const dark = new THREE.MeshStandardMaterial({ color: '#15171c', roughness: 0.55, metalness: 0.4 })
    const roof = new THREE.MeshStandardMaterial({ color: '#3a3d44', roughness: 0.95, metalness: 0.05 })
    const winDark = new THREE.MeshStandardMaterial({ color: '#141a24', roughness: 0.12, metalness: 0.6, envMapIntensity: 1.3 })
    const atlas = emissiveAtlas()
    const glowDyn = new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, color: new THREE.Color(1.15, 1.15, 1.15), toneMapped: false })
    const glowStatic = new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, toneMapped: false })

    // upper-floor windows: front (flanking the sign) + both sides, mix of lit / dark
    const windows: { p: [number, number, number]; r: number; lit: boolean }[] = []
    windows.push({ p: [-3.7, 5.3, 0.02], r: 0, lit: true }, { p: [3.7, 5.3, 0.02], r: 0, lit: false })
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const z = -1.2 - i * 1.8
        windows.push({ p: [sx * (OFFICE_W / 2 + 0.02), 5.3, z], r: (sx * Math.PI) / 2, lit: (i + (sx > 0 ? 1 : 0)) % 2 === 0 })
        windows.push({ p: [sx * (OFFICE_W / 2 + 0.02), 1.9, z], r: (sx * Math.PI) / 2, lit: i === 1 })
      }
    }
    const placed = (g: THREE.BufferGeometry, w: { p: [number, number, number]; r: number }) => {
      g.rotateY(w.r)
      g.translate(w.p[0], w.p[1], w.p[2])
      return g
    }

    /* plaster: main block (front face recessed to z = −0.3), upper-storey slab over the storefront, entrance step */
    const WALL_C = new THREE.Color('#d8d2c6')
    const STEP_C = new THREE.Color('#c9c3b8')
    const wallGeo = merge([
      tint(bx(W, H, D - 0.3, 0, H / 2, -(D - 0.3) / 2 - 0.3), WALL_C),
      tint(bx(W, H - gf, 0.32, 0, gf + (H - gf) / 2, -0.16), WALL_C),
      tint(bx(W + 0.4, 0.2, 0.9, 0, 0.1, 0.3), STEP_C),
    ])
    /* graphite: inter-storey band, parapet, roof plant, vent disc, storefront columns, canopy slab */
    const vent = new THREE.CylinderGeometry(0.45, 0.45, 0.06, 20)
    vent.rotateX(Math.PI / 2)
    vent.translate(2.4, H + 0.62, -4.6)
    const graphiteGeo = merge([
      bx(W + 0.06, 0.18, D + 0.06, 0, gf + 0.08, -D / 2 + 0.02),
      bx(W + 0.1, 0.22, D + 0.1, 0, H + 0.1, -D / 2 + 0.05),
      bx(2.4, 1.0, 2.0, -2.6, H + 0.6, -4.2),
      vent,
      bx(0.4, gf, 0.5, -(W / 2 - 0.2), gf / 2, -0.1),
      bx(0.4, gf, 0.5, W / 2 - 0.2, gf / 2, -0.1),
      bx(8.6, 0.12, 1.6, 0, gf - 0.05, 0.7),
    ])
    const roofGeo = bx(W - 0.4, 0.1, D - 0.4, 0, H + 0.02, -D / 2)
    /* dark trim: second roof unit, storefront mullions + header, door frame, sign frame, window frames */
    const darkGeo = merge([
      bx(1.2, 0.5, 1.2, 2.4, H + 0.35, -4.6),
      ...[-4.5, -3, -1.5, 1.5, 3, 4.5].map((x) => bx(0.08, gf - 0.3, 0.1, x, 0.2 + (gf - 0.3) / 2, 0.02)),
      bx(W - 0.6, 0.12, 0.1, 0, gf - 0.1, 0.02),
      bx(2.0, 0.1, 0.08, 0, 2.45, 0.06),
      bx(0.08, 2.3, 0.08, -0.96, 1.3, 0.06),
      bx(0.08, 2.3, 0.08, 0.96, 1.3, 0.06),
      bx(0.03, 2.3, 0.08, 0, 1.3, 0.06),
      bx(5.0, 1.42, 0.08, 0, 5.3, 0.03),
      ...windows.map((w) => placed(bx(1.0, 1.4, 0.06, 0, 0, -0.02), w)),
    ])
    /* dark window panes (glossy) */
    const winDarkGeo = merge(
      windows
        .filter((w) => !w.lit)
        .map((w) => {
          const g = new THREE.PlaneGeometry(0.86, 1.26)
          g.translate(0, 0, 0.012)
          return placed(g, w)
        }),
    )
    /* breathing emissives: storefront strip, door glass, four canopy down-lights (colour scalar = k + 0.15 → ×1.3 / ×1.0 / ×2.2) */
    const store = new THREE.PlaneGeometry(W - 0.7, gf - 0.3)
    store.translate(0, 0.2 + (gf - 0.3) / 2, -0.02)
    const doorGlass = new THREE.PlaneGeometry(1.8, 2.2)
    doorGlass.translate(0, 1.3, 0.05)
    const LAMP_C = new THREE.Color('#ffe0b8').multiplyScalar(2.2)
    const glowDynGeo = merge([
      tint(atlasUV(store, R_STORE), new THREE.Color(1.3, 1.3, 1.3)),
      tint(atlasUV(doorGlass, R_STORE), new THREE.Color(1, 1, 1)),
      ...[-3, -1, 1, 3].map((x) => {
        const g = new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12)
        g.rotateX(Math.PI / 2)
        g.translate(x, gf - 0.115, 0.8)
        return tint(atlasUV(g, R_WHITE, -1), LAMP_C)
      }),
    ])
    /* static emissives: sign plate, lit window panes, orange fascia + door pull bars */
    const sign = new THREE.PlaneGeometry(4.8, 1.2)
    sign.translate(0, 5.3, 0.08)
    const LIT_C = new THREE.Color('#ffd0a0').multiplyScalar(1.2)
    const ORANGE_C = new THREE.Color('#ff6a00').multiplyScalar(0.9)
    const glowStaticGeo = merge([
      tint(atlasUV(sign, R_PLATE), new THREE.Color(1, 1, 1)),
      ...windows
        .filter((w) => w.lit)
        .map((w) => {
          const g = new THREE.PlaneGeometry(0.86, 1.26)
          g.translate(0, 0, 0.012)
          return tint(atlasUV(placed(g, w), R_WHITE, -1), LIT_C)
        }),
      tint(atlasUV(bx(8.6, 0.12, 0.03, 0, gf - 0.05, 1.51), R_WHITE, -1), ORANGE_C),
      tint(atlasUV(bx(0.03, 0.55, 0.03, -0.16, 1.15, 0.1), R_WHITE, -1), ORANGE_C),
      tint(atlasUV(bx(0.03, 0.55, 0.03, 0.16, 1.15, 0.1), R_WHITE, -1), ORANGE_C),
    ])
    const mats = { wall, graphite, dark, roof, winDark, glowDyn, glowStatic }
    const geos = { wallGeo, graphiteGeo, roofGeo, darkGeo, winDarkGeo, glowDynGeo, glowStaticGeo }
    return { mats, geos }
  }, [])
  useEffect(
    () => () => {
      for (const m of Object.values(built.mats)) m.dispose()
      for (const g of Object.values(built.geos)) g.dispose()
    },
    [built],
  )
  const setGlow = (k: number) => {
    if (k === glowK.current) return
    glowK.current = k
    built.mats.glowDyn.color.setScalar(k + 0.15)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useImperativeHandle(ref, () => ({ get group() { return group.current }, setGlow }), [])

  const { mats, geos } = built
  return (
    <group ref={group} position={position} name="OfficeBuilding">
      <mesh geometry={geos.wallGeo} material={mats.wall} castShadow receiveShadow />
      <mesh geometry={geos.graphiteGeo} material={mats.graphite} castShadow />
      <mesh geometry={geos.roofGeo} material={mats.roof} />
      <mesh geometry={geos.darkGeo} material={mats.dark} />
      <mesh geometry={geos.winDarkGeo} material={mats.winDark} />
      <mesh geometry={geos.glowDynGeo} material={mats.glowDyn} />
      <mesh geometry={geos.glowStaticGeo} material={mats.glowStatic} />
    </group>
  )
})
