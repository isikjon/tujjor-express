'use client'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Category } from '@/lib/stores'

/** Order matches `t.calculator.categories` and the <select> values in CalculatorPanel. */
export const CATEGORY_ORDER: Category[] = ['electronics', 'clothing', 'shoes', 'parts', 'home', 'other']

/**
 * Six procedural category icons for the calculator terminal (docs §11): smartphone, t-shirt, sneaker,
 * gear, kettle, cube. Every icon fits a ~0.42 u box centred at its origin and faces +Z. Built from
 * extrusions / lathes / tubes so silhouettes read as objects, not primitives; bone matte body with
 * one small orange emissive accent each. Geometry and materials are created once (useMemo).
 * Perf: every icon's parts are merged per material (2–4 draw calls per icon instead of 2–17); only the
 * icon the scene makes visible is drawn, and only its largest part casts a shadow.
 * Handle: `groups[i]` in CATEGORY_ORDER — the scene owns visibility / scale / motion.
 */
export interface CategoryIconsHandle {
  groups: THREE.Group[]
}

function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

const _m = new THREE.Matrix4()
const _e = new THREE.Euler()
/** translate (+ optional euler rotation) a geometry in place */
function place(g: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  _m.makeRotationFromEuler(_e.set(rx, ry, rz)).setPosition(x, y, z)
  g.applyMatrix4(_m)
  return g
}
/** merge parts into one geometry (position / normal / uv only) and dispose the parts */
function merge(parts: THREE.BufferGeometry[]) {
  // extrusions are non-indexed, primitives are indexed → unify before merging
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p))
  for (const p of flat) for (const k of Object.keys(p.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') p.deleteAttribute(k)
  const g = flat.length === 1 ? flat[0] : mergeGeometries(flat, false)!
  for (const p of [...parts, ...flat]) if (p !== g) p.dispose()
  return g
}

type Part = { geo: THREE.BufferGeometry; mat: keyof ReturnType<typeof buildMats>; cast?: boolean; line?: boolean }

function buildMats() {
  return {
    bone: new THREE.MeshStandardMaterial({
      color: '#f2efe9',
      roughness: 0.38,
      metalness: 0.06,
      envMapIntensity: 1.1,
    }),
    boneSoft: new THREE.MeshStandardMaterial({
      color: '#e6e1d8',
      roughness: 0.6,
      metalness: 0,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: '#1e2129',
      roughness: 0.42,
      metalness: 0.35,
      envMapIntensity: 1.2,
    }),
    metal: new THREE.MeshStandardMaterial({
      color: '#b9bec8',
      roughness: 0.28,
      metalness: 0.85,
      envMapIntensity: 1.3,
    }),
    screen: new THREE.MeshStandardMaterial({
      color: '#0b0c0f',
      emissive: '#ff8a2a',
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.1,
    }),
    orange: new THREE.MeshBasicMaterial({
      color: '#ff6a00',
      toneMapped: false,
    }),
    orangeLine: new THREE.LineBasicMaterial({
      color: '#ff8a2a',
      toneMapped: false,
      transparent: true,
      opacity: 0.9,
    }),
  }
}

/** Builds the six icons: each is a list of merged parts (one per material). */
function buildIcons(): Part[][] {
  // --- 0 smartphone: bevelled rounded slab + emissive screen + notch + side button + orange camera dot
  const phoneBody = new THREE.ExtrudeGeometry(roundedRect(0.22, 0.44, 0.035), {
    depth: 0.028,
    bevelEnabled: true,
    bevelSize: 0.008,
    bevelThickness: 0.006,
    bevelSegments: 3,
    curveSegments: 10,
  })
  phoneBody.translate(0, 0, -0.014)
  const phoneScreen = new THREE.ExtrudeGeometry(roundedRect(0.19, 0.4, 0.028), { depth: 0.002, bevelEnabled: false, curveSegments: 10 })
  phoneScreen.translate(0, 0, 0.0195)
  const phone: Part[] = [
    { geo: merge([phoneBody, place(new THREE.BoxGeometry(0.06, 0.012, 0.004), 0, 0.185, 0.021), place(new THREE.BoxGeometry(0.006, 0.05, 0.014), 0.116, 0.06, 0)]), mat: 'dark', cast: true },
    { geo: merge([phoneScreen]), mat: 'screen' },
    { geo: merge([place(new THREE.CircleGeometry(0.008, 10), 0.06, 0.16, 0.0215)]), mat: 'orange' },
  ]

  // --- 1 t-shirt: extruded outline with bevel (body + sleeves + collar dip) + orange chest print
  const tee = new THREE.Shape()
  tee.moveTo(-0.11, 0.2)
  tee.lineTo(-0.045, 0.22)
  tee.quadraticCurveTo(0, 0.17, 0.045, 0.22)
  tee.lineTo(0.11, 0.2)
  tee.lineTo(0.22, 0.12)
  tee.lineTo(0.17, 0.02)
  tee.lineTo(0.11, 0.05)
  tee.lineTo(0.11, -0.2)
  tee.quadraticCurveTo(0, -0.215, -0.11, -0.2)
  tee.lineTo(-0.11, 0.05)
  tee.lineTo(-0.17, 0.02)
  tee.lineTo(-0.22, 0.12)
  tee.closePath()
  const teeGeo = new THREE.ExtrudeGeometry(tee, {
    depth: 0.035,
    bevelEnabled: true,
    bevelSize: 0.01,
    bevelThickness: 0.01,
    bevelSegments: 3,
    curveSegments: 8,
  })
  teeGeo.translate(0, 0, -0.0175)
  const shirt: Part[] = [
    { geo: merge([teeGeo]), mat: 'bone', cast: true },
    { geo: merge([place(new THREE.BoxGeometry(0.07, 0.014, 0.004), 0, 0.06, 0.03)]), mat: 'orange' },
  ]

  // --- 2 sneaker: extruded rounded footprint sole (XZ), sculpted upper from scaled spheres, laces, swoosh
  const foot = new THREE.Shape()
  foot.moveTo(-0.2, -0.06)
  foot.quadraticCurveTo(-0.24, 0, -0.2, 0.06)
  foot.lineTo(0.08, 0.075)
  foot.quadraticCurveTo(0.25, 0.07, 0.25, 0)
  foot.quadraticCurveTo(0.25, -0.07, 0.08, -0.075)
  foot.closePath()
  const sole = new THREE.ExtrudeGeometry(foot, {
    depth: 0.04,
    bevelEnabled: true,
    bevelSize: 0.008,
    bevelThickness: 0.006,
    bevelSegments: 2,
    curveSegments: 10,
  })
  sole.rotateX(Math.PI / 2)
  sole.translate(0, -0.075, 0)
  const midsole = new THREE.ExtrudeGeometry(foot, {
    depth: 0.022,
    bevelEnabled: false,
    curveSegments: 10,
  })
  midsole.rotateX(Math.PI / 2)
  midsole.scale(0.98, 1, 0.98)
  midsole.translate(0, -0.052, 0)
  const upperHeel = new THREE.SphereGeometry(0.1, 20, 14)
  upperHeel.scale(1.55, 0.95, 0.72)
  upperHeel.translate(-0.06, -0.01, 0)
  const upperToe = new THREE.SphereGeometry(0.085, 18, 12)
  upperToe.scale(1.9, 0.62, 0.8)
  upperToe.translate(0.09, -0.045, 0)
  const laces = [-0.09, -0.04, 0.01].map((x, i) => place(new THREE.CylinderGeometry(0.006, 0.006, 0.11, 6), x, 0.07 - i * 0.012, 0, Math.PI / 2))
  const swoosh = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([new THREE.Vector3(-0.13, -0.03, 0.075), new THREE.Vector3(-0.02, -0.05, 0.08), new THREE.Vector3(0.1, -0.02, 0.06)]),
    12,
    0.008,
    5,
    false,
  )
  const sneaker: Part[] = [
    { geo: merge([sole, ...laces]), mat: 'dark', cast: true },
    { geo: merge([midsole]), mat: 'boneSoft' },
    { geo: merge([upperHeel, upperToe]), mat: 'bone', cast: true },
    { geo: merge([swoosh]), mat: 'orange' },
  ]

  // --- 3 gear: torus rim + 10 teeth + 4 spokes (metal), hub (dark), orange hub ring
  const gearMetal: THREE.BufferGeometry[] = [new THREE.TorusGeometry(0.15, 0.04, 10, 40)]
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    gearMetal.push(place(new THREE.BoxGeometry(0.06, 0.07, 0.06), Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0, 0, 0, a))
  }
  for (const rz of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) gearMetal.push(place(new THREE.BoxGeometry(0.22, 0.025, 0.05), 0, 0, 0, 0, 0, rz))
  const hub = new THREE.CylinderGeometry(0.06, 0.06, 0.07, 20)
  hub.rotateX(Math.PI / 2)
  const gear: Part[] = [
    { geo: merge(gearMetal), mat: 'metal', cast: true },
    { geo: merge([hub]), mat: 'dark' },
    { geo: merge([place(new THREE.TorusGeometry(0.03, 0.006, 6, 24), 0, 0, 0.036)]), mat: 'orange' },
  ]

  // --- 4 kettle: lathe body (belly + shoulder + neck) + tube spout (bone), lathe lid (soft), knob + handle + base (dark), pilot (orange)
  const prof: THREE.Vector2[] = []
  const body = [
    [0.0, -0.13],
    [0.11, -0.13],
    [0.135, -0.1],
    [0.15, -0.03],
    [0.145, 0.04],
    [0.12, 0.09],
    [0.085, 0.11],
    [0.08, 0.125],
    [0.0, 0.125],
  ]
  for (const [x, y] of body) prof.push(new THREE.Vector2(x, y))
  const kettleBody = new THREE.LatheGeometry(prof, 36)
  const lidProf = [
    [0, 0],
    [0.075, 0],
    [0.06, 0.025],
    [0.02, 0.03],
    [0, 0.03],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  const lid = new THREE.LatheGeometry(lidProf, 28)
  lid.translate(0, 0.125, 0)
  const knob = new THREE.SphereGeometry(0.018, 12, 10)
  knob.translate(0, 0.165, 0)
  const spout = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0.1, -0.02, 0), new THREE.Vector3(0.21, 0.02, 0), new THREE.Vector3(0.23, 0.12, 0)), 12, 0.022, 10, false)
  const handle = new THREE.TorusGeometry(0.075, 0.014, 8, 20, Math.PI)
  handle.rotateZ(Math.PI / 2)
  handle.translate(-0.15, 0.0, 0)
  const base = new THREE.CylinderGeometry(0.115, 0.12, 0.014, 32)
  base.translate(0, -0.136, 0)
  const pilot = new THREE.SphereGeometry(0.01, 8, 6)
  pilot.translate(0.06, -0.135, 0.1)
  const kettle: Part[] = [
    { geo: merge([kettleBody, spout]), mat: 'bone', cast: true },
    { geo: merge([lid]), mat: 'boneSoft' },
    { geo: merge([knob, handle, base]), mat: 'dark' },
    { geo: merge([pilot]), mat: 'orange' },
  ]

  // --- 5 other: bevelled cube (bone) with orange edge lines
  const cube: Part[] = [
    { geo: merge([new THREE.BoxGeometry(0.28, 0.28, 0.28)]), mat: 'bone', cast: true },
    { geo: new THREE.EdgesGeometry(new THREE.BoxGeometry(0.29, 0.29, 0.29)), mat: 'orangeLine', line: true },
  ]

  return [phone, shirt, sneaker, gear, kettle, cube]
}

/** per-icon presentation rotation (product-shot angles) */
const ROT: [number, number, number][] = [
  [0.1, -0.35, 0.08],
  [0.05, -0.2, 0],
  [0, -0.7, 0],
  [0.25, 0, 0],
  [0, -0.4, 0],
  [0.3, 0.6, 0],
]

export const CategoryIcons = forwardRef<CategoryIconsHandle, { position?: [number, number, number] }>(function CategoryIcons({ position }, ref) {
  const groups = useRef<THREE.Group[]>([])
  useImperativeHandle(ref, () => ({ groups: groups.current }), [])

  const mats = useMemo(buildMats, [])
  const icons = useMemo(buildIcons, [])
  useEffect(
    () => () => {
      for (const icon of icons) for (const p of icon) p.geo.dispose()
      for (const m of Object.values(mats)) m.dispose()
    },
    [icons, mats],
  )

  const setRef = (i: number) => (g: THREE.Group | null) => {
    if (g) groups.current[i] = g
  }

  return (
    <group position={position} name="CategoryIcons">
      {icons.map((parts, i) => (
        <group key={i} ref={setRef(i)} rotation={ROT[i]} visible={false}>
          {parts.map((p, j) =>
            p.line ? <lineSegments key={j} geometry={p.geo} material={mats.orangeLine} /> : <mesh key={j} geometry={p.geo} material={mats[p.mat]} castShadow={!!p.cast} />,
          )}
        </group>
      ))}
    </group>
  )
})
