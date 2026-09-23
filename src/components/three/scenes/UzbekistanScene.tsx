'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Html, Text } from '@react-three/drei'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { FeatureCollection, Geometry, Position } from 'geojson'
import { useInRange, useSceneReady, useStageFrame } from '@/hooks/useStage'
import { useApp } from '@/lib/stores'
import { PROFILES } from '@/lib/quality'
import { easeInCubic, easeOutCubic } from '@/lib/easing'
import { lerp, range, seeded, smoothstep, window01 } from '@/lib/math'
import { countryPolygons } from '@/lib/geo'
import { cardboardTextures, concreteTextures, glowSprite } from '@/lib/textures'
import { GEO_URL, ROUTE_ENTRY_C, TASHKENT_C, TASHKENT_REGION_STYLISED, projC } from '@/config/worldC'
import { useT } from '@/translations'
import { BOX_SIZE as TJ_BOX } from '../models/TujjorBox'
import { Particles } from '../fx/Particles'
import { GlowLine } from '../fx/GlowLine'
import type { SceneProps } from './types'
export { cameraAt, lights } from './UzbekistanScene.camera'

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */
const COUNTRY_H = 0.6 // sand relief height
const REGION_H = 0.25 // Tashkent Region plateau on top of the country
const GROUND_Y = COUNTRY_H + REGION_H // .85 — Chirchiq (origin) sits on the plateau
const ROUTE_Y = 0.9 // route tube floats just above the plateau
const BOX_SIZE = 0.22
const BOX_K = BOX_SIZE / TJ_BOX[0] // keeps the 0.6×0.45×0.45 Tujjor proportions
const BOX_HALF_H = (TJ_BOX[1] * BOX_K) / 2
const RING_R = 0.3
const PIN_BASE = GROUND_Y + 0.3
const TRAIL_N = 6

const NEIGHBOUR_IDS = ['398', '417', '762', '795', '4'] // KZ KG TJ TM AF
const FONT = '/fonts/space-grotesk-700.woff'
const ORANGE = '#ff6a00'
/** Shymkent — the last waypoint before the border (a faint, already-built trace of where the cargo comes from). */
const SHYMKENT_C = projC(69.6, 42.32)

/** expo.inOut — the nested-scale reveal law shared with DeliveryScene (docs §07). */
const expoInOut = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2)

/* ------------------------------------------------------------------ */
/* Geometry builders (run once, at mount / after the GeoJSON arrives)  */
/* ------------------------------------------------------------------ */
/** lon/lat ring → THREE.Shape in the x / −z plane (shape.y = north) so a −π/2 X-rotation lays it flat with north = −z. */
function ringToShapeC(ring: Position[]): THREE.Shape {
  const s = new THREE.Shape()
  for (let i = 0; i < ring.length; i++) {
    const [x, , z] = projC(ring[i][0], ring[i][1])
    if (i === 0) s.moveTo(x, -z)
    else s.lineTo(x, -z)
  }
  s.closePath()
  return s
}
/** Extrude shapes upward (+y) to total height h with a small bevel; bottom lands exactly at y=0. */
function extrudeUp(shapes: THREE.Shape[], h: number, bevel: number): THREE.ExtrudeGeometry {
  const g = new THREE.ExtrudeGeometry(shapes, { depth: h - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 2, curveSegments: 1 })
  g.rotateX(-Math.PI / 2)
  g.translate(0, bevel, 0)
  // shape-space UVs are in world units — shrink so the roughness map tiles every ~7 u
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.14, uv.getY(i) * 0.14)
  g.computeBoundingSphere()
  return g
}
/** Flat ShapeGeometry lying in the XZ plane. */
function flatShape(shape: THREE.Shape): THREE.ShapeGeometry {
  const g = new THREE.ShapeGeometry(shape, 1)
  g.rotateX(-Math.PI / 2)
  return g
}
/** Line segments (closed loop per ring) at height y, world space, with a constant vertex colour (one LineSegments for all line work). */
function ringLines(rings: Position[][], y: number, color: THREE.Color): THREE.BufferGeometry {
  const pos: number[] = []
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = projC(ring[i][0], ring[i][1])
      const b = projC(ring[(i + 1) % ring.length][0], ring[(i + 1) % ring.length][1])
      pos.push(a[0], y, a[2], b[0], y, b[2])
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  paint(g, color)
  return g
}
/** Constant vertex colour (linear) → lets meshes with different tints share one material / draw. */
function paint(g: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  const n = g.getAttribute('position').count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return g
}
interface GeoBuild {
  country: THREE.BufferGeometry
  neighbours: THREE.BufferGeometry
  /** neighbour borders (#c9d1dc @ .35) + country outline (#fff6e6 @ .5) in ONE LineSegments: material opacity .5, border colour pre-scaled ×.7 */
  lines: THREE.BufferGeometry
}
function buildGeo(fc: FeatureCollection<Geometry>): GeoBuild {
  const uzRings = countryPolygons(fc as FeatureCollection<Geometry, { name: string }>, '860')
  const nbRings: Position[][] = []
  for (const id of NEIGHBOUR_IDS) nbRings.push(...countryPolygons(fc as FeatureCollection<Geometry, { name: string }>, id))
  const country = extrudeUp(uzRings.map(ringToShapeC), COUNTRY_H, 0.03)
  const parts = nbRings.map((r) => flatShape(ringToShapeC(r)))
  const neighbours = mergeGeometries(parts, false) ?? parts[0]
  parts.forEach((p) => p !== neighbours && p.dispose())
  const borders = ringLines(nbRings, 0.03, new THREE.Color('#c9d1dc').multiplyScalar(0.35 / 0.5))
  const outline = ringLines(uzRings, COUNTRY_H + 0.004, new THREE.Color('#fff6e6'))
  const lines = mergeGeometries([borders, outline], false) ?? outline
  if (lines !== outline) outline.dispose()
  if (lines !== borders) borders.dispose()
  return { country, neighbours, lines }
}

/** Distance from (x,z) to a polyline — used to keep the road corridor free of tall blocks. */
function distToPolyline(x: number, z: number, pts: [number, number][]): number {
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    const dx = bx - ax
    const dz = bz - az
    const l2 = dx * dx + dz * dz || 1e-9
    const u = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2))
    best = Math.min(best, Math.hypot(x - (ax + dx * u), z - (az + dz * u)))
  }
  return best
}

/* ------------------------------------------------------------------ */
/* Marker rings: plaza ring + pulse wave in ONE draw (a = ring, b = pulse) */
/* ------------------------------------------------------------------ */
const ringsVert = /* glsl */ `
attribute float aWhich;
uniform float uScaleA;
uniform float uScaleB;
varying float vWhich;
#include <fog_pars_vertex>
void main(){
  vWhich = aWhich;
  vec3 p = position;
  p.xz *= mix(uScaleA, uScaleB, aWhich);
  p.y += aWhich * 0.002;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`
const ringsFrag = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uOpacityA;
uniform float uOpacityB;
varying float vWhich;
#include <fog_pars_fragment>
void main(){
  gl_FragColor = vec4(mix(uColorA, uColorB, vWhich), mix(uOpacityA, uOpacityB, vWhich));
  #include <colorspace_fragment>
  #include <fog_fragment>
}`

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */
/**
 * §07 UZBEKISTAN — out of the tunnel flash into warm daylight over a sand-relief map of Uzbekistan
 * (real 50m geography, Chirchiq = origin). Tashkent Region is a raised plateau with an orange rim;
 * the mini-box rides the orange route Shymkent → border → Tashkent → Chirchiq (t 0–.5) and lands
 * inside the pulsing marker ring. t .8–1: the map sinks and fades while DeliveryScene grows out of
 * the origin; the marker ring widens into the plaza in front of the office (nested-scale reveal).
 *
 * Perf: the country relief + neighbour plane are OPAQUE (early-z, no sorting) and swap to pre-compiled transparent
 * clones only inside the fade window (t .8–1); the plateau stays transparent (its transparent-pass order hides the
 * route tube — frozen look); all line work is one LineSegments, rim+arrow one mesh
 * (vertex colours), ring+pulse one shader mesh, pin one geometry, comet trail one InstancedMesh, the
 * cargo one single-material mesh.
 * The city keeps its baseline transparent material: its transparent-pass order hides the route tube under the blocks.
 */
export default function UzbekistanScene({ stage }: SceneProps) {
  const tier = useApp((s) => s.tier)
  const profile = PROFILES[tier]
  const inRange = useInRange(stage)
  const t = useT()

  /* ---------- GeoJSON (fetched once; useSceneReady fires from <Ready/> when built or failed) ---------- */
  const [fc, setFc] = useState<FeatureCollection<Geometry> | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    fetch(GEO_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: FeatureCollection<Geometry>) => alive && setFc(j))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [])
  const geo = useMemo(() => (fc ? buildGeo(fc) : null), [fc])
  useEffect(
    () => () => {
      if (geo) Object.values(geo).forEach((g) => g.dispose())
    },
    [geo],
  )

  /* ---------- Materials: opaque set for the whole stage, transparent clones only for the t .8–1 dissolve ---------- */
  const mats = useMemo(() => {
    const concrete = concreteTextures(512)
    // own clone: the texture object is shared with other stages (some retile it) — keep our 1×1 repeat
    const rough = concrete.roughnessMap.clone()
    rough.wrapS = rough.wrapT = THREE.RepeatWrapping
    rough.repeat.set(1, 1)
    rough.offset.set(0, 0)
    const sandTop = new THREE.MeshStandardMaterial({ color: '#e8dcc4', roughness: 0.85, metalness: 0, roughnessMap: rough, envMapIntensity: 0.9 })
    const sandSide = new THREE.MeshStandardMaterial({ color: '#c8b795', roughness: 0.9, metalness: 0, envMapIntensity: 0.6 })
    // the Tashkent plateau stays TRANSPARENT for the whole stage (baseline): in the transparent pass it sorts nearer than
    // the additive depthWrite:false route tube (bounding-sphere depth) and paints over it, so no route streak shows on the
    // plateau — making it opaque changed the frozen p .56 frame and popped at the t .8 material swap
    const regionTop = new THREE.MeshStandardMaterial({ color: '#f4ecdb', roughness: 0.8, metalness: 0, roughnessMap: rough, envMapIntensity: 1, transparent: true })
    const regionSide = new THREE.MeshStandardMaterial({ color: '#dccba6', roughness: 0.85, metalness: 0, envMapIntensity: 0.7, transparent: true })
    // near-black graphite plane covering ~40 % of the t0 frame: Lambert (no per-pixel PBR on an invisible surface)
    const neighbour = new THREE.MeshLambertMaterial({ color: '#292a30' }) // tint raised so the Lambert plane matches the old Standard's IBL floor (~3/255)
    // city blocks stay transparent (baseline behaviour): their transparent-pass order paints over the depthWrite:false route
    // tube wherever blocks sit under it, which is part of the frozen picture; ~500 tiny boxes cost nothing to sort
    const city = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.72, metalness: 0.04, envMapIntensity: 0.8, transparent: true })
    // country relief + neighbour plane: opaque for the whole stage (early-z, no sorting; nothing translucent sits on them),
    // swapped to pre-compiled transparent clones only inside the t .8–1 dissolve
    const opaque = { sandTop, sandSide, neighbour }
    const clone = <M extends THREE.Material>(m: M): M => {
      const c = m.clone() as M
      c.transparent = true
      return c
    }
    const fade = { sandTop: clone(sandTop), sandSide: clone(sandSide), neighbour: clone(neighbour) }
    const fadeList = [...Object.values(fade), regionTop, regionSide]

    const lines = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5 })
    // orange rim + arrow share one basic material (tints in vertex colours)
    const rim = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity: 1 })
    const pin = new THREE.MeshBasicMaterial({ color: new THREE.Color(ORANGE).multiplyScalar(2.5), toneMapped: false, transparent: true })
    const pinHead = new THREE.MeshStandardMaterial({ color: '#ff6a00', emissive: '#ff6a00', emissiveIntensity: 2.5, roughness: 0.35, metalness: 0.2, transparent: true })
    const rings = new THREE.ShaderMaterial({
      vertexShader: ringsVert,
      fragmentShader: ringsFrag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uScaleA: { value: 1 },
          uScaleB: { value: 1 },
          uColorA: { value: new THREE.Color(ORANGE).multiplyScalar(1.6) },
          uColorB: { value: new THREE.Color('#ff8a2a') },
          uOpacityA: { value: 0.85 },
          uOpacityB: { value: 0 },
        },
      ]),
    })
    const sun = new THREE.SpriteMaterial({ map: glowSprite(), color: '#ffc994', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, opacity: 1 })
    const trail = new THREE.MeshBasicMaterial({ map: glowSprite(), color: '#ff8a2a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 })
    // cargo: single material (plain kraft on 5 faces, brand print on +z) instead of 6 material slots
    const kraft = cardboardTextures(512, 0)
    const box = new THREE.MeshStandardMaterial({ map: kraft.map, normalMap: kraft.normalMap, roughnessMap: kraft.roughnessMap, roughness: 0.9, emissive: '#ff6a00', emissiveIntensity: 0.12 })
    return { rough, opaque, fade, fadeList, regionTop, regionSide, city, lines, rim, pin, pinHead, rings, sun, trail, box }
  }, [])
  useEffect(
    () => () => {
      const m = mats
      ;[...Object.values(m.opaque), ...m.fadeList, m.city, m.lines, m.rim, m.pin, m.pinHead, m.rings, m.sun, m.trail, m.box].forEach((x) => x.dispose()) // fadeList holds regionTop/regionSide too
      m.rough.dispose()
    },
    [mats],
  )

  /* ---------- Static geometry: region plateau, rim+arrow, pin, rings, cargo, warm-up dummies ---------- */
  const built = useMemo(() => {
    // Tashkent Region plateau (stylised outline — no admin-1 data in world-atlas, docs §14.4), extruded from the
    // ground (0 → .85): the outline overhangs the KZ border near Shymkent, so a slab starting at .6 would float
    const region = extrudeUp([ringToShapeC(TASHKENT_REGION_STYLISED)], COUNTRY_H + REGION_H, 0.02)
    // orange rim: a thin closed tube hugging the plateau's top edge — merged with the label arrow (same material)
    const pts = TASHKENT_REGION_STYLISED.map(([lon, lat]) => {
      const [x, , z] = projC(lon, lat)
      return new THREE.Vector3(x, GROUND_Y + 0.004, z)
    })
    const tube = paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, 'centripetal'), 160, 0.026, 6, true), new THREE.Color(ORANGE).multiplyScalar(1.5))
    const shaft = new THREE.CylinderGeometry(0.022, 0.022, 0.26, 8).rotateX(Math.PI / 2).translate(0, 0, -0.06)
    const head = new THREE.ConeGeometry(0.075, 0.2, 12).rotateX(Math.PI / 2).translate(0, 0, 0.16)
    const arrow = paint(mergeGeometries([shaft, head], false)!.translate(0.85, GROUND_Y + 0.03, -0.9), new THREE.Color(ORANGE).multiplyScalar(1.2))
    shaft.dispose()
    head.dispose()
    const rim = mergeGeometries([tube, arrow], false)!
    tube.dispose()
    arrow.dispose()
    // pin shaft + halo torus in one geometry (one basic material); the emissive head stays its own mesh
    const shaftG = new THREE.CylinderGeometry(0.012, 0.004, 0.54, 6).translate(0, 0.27, 0)
    const torus = new THREE.TorusGeometry(0.11, 0.008, 6, 32).translate(0, 0.6, 0)
    const pin = mergeGeometries([shaftG, torus], false)!
    shaftG.dispose()
    torus.dispose()
    const pinHead = new THREE.SphereGeometry(0.075, 20, 16)
    // marker ring (aWhich 0) + pulse wave (aWhich 1), flat in XZ, scaled per part in the shader
    const ringA = new THREE.RingGeometry(RING_R * 0.86, RING_R, 72).rotateX(-Math.PI / 2)
    const ringB = new THREE.RingGeometry(RING_R * 0.95, RING_R * 1.02, 72).rotateX(-Math.PI / 2)
    ringA.setAttribute('aWhich', new THREE.BufferAttribute(new Float32Array(ringA.getAttribute('position').count), 1))
    ringB.setAttribute('aWhich', new THREE.BufferAttribute(new Float32Array(ringB.getAttribute('position').count).fill(1), 1))
    const rings = mergeGeometries([ringA, ringB], false)!
    ringA.dispose()
    ringB.dispose()
    // cargo box: brand print on +z, plain kraft band of the same texture on the other faces (one material, one draw)
    const box = new THREE.BoxGeometry(TJ_BOX[0] * BOX_K, TJ_BOX[1] * BOX_K, TJ_BOX[2] * BOX_K)
    const uv = box.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) {
      if (i >= 16 && i < 20) continue // +z face keeps the full print
      uv.setXY(i, 0.05 + uv.getX(i) * 0.35, 0.02 + uv.getY(i) * 0.28) // print-free kraft patch (bottom-left of the sheet)
    }
    const trail = new THREE.PlaneGeometry(1, 1)
    // warm-up dummies (hidden): give the transparent clones a program at the world's shader warm-up (gl.compile
    // traverses invisible objects) so the t .8 material swap never compiles mid-scroll
    const dummy = new THREE.BoxGeometry(0.01, 0.01, 0.01)
    return { region, rim, pin, pinHead, rings, box, trail, dummy }
  }, [])
  useEffect(() => () => Object.values(built).forEach((g) => g.dispose()), [built])

  /* ---------- Route: Shymkent ⇢ border (faint trace) · border → Tashkent → Chirchiq (built by the box) ---------- */
  const route = useMemo(() => {
    const main = [ROUTE_ENTRY_C, [lerp(ROUTE_ENTRY_C[0], TASHKENT_C[0], 0.5), 0, lerp(ROUTE_ENTRY_C[2], TASHKENT_C[2], 0.5) + 0.06], TASHKENT_C, [TASHKENT_C[0] * 0.45, 0, TASHKENT_C[2] * 0.62], [0, 0, 0]].map(
      ([x, , z]) => new THREE.Vector3(x, ROUTE_Y, z),
    )
    const pre = [SHYMKENT_C, [lerp(SHYMKENT_C[0], ROUTE_ENTRY_C[0], 0.5) - 0.12, 0, lerp(SHYMKENT_C[2], ROUTE_ENTRY_C[2], 0.5)], ROUTE_ENTRY_C].map(([x, , z]) => new THREE.Vector3(x, ROUTE_Y, z))
    const curve = new THREE.CatmullRomCurve3(main) // identical construction to GlowLine → box rides exactly on the tube
    const corridor: [number, number][] = [...pre, ...main].map((v) => [v.x, v.z])
    return { main, pre, curve, corridor }
  }, [])

  /* ---------- City blocks: dense Tashkent blob + compact Chirchiq cluster (one InstancedMesh, vertex colours) ---------- */
  const city = useMemo(() => {
    const n = Math.max(40, Math.round(500 * profile.density))
    const rnd = seeded(8607)
    const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd())
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    geometry.translate(0, 0.5, 0) // base at y=0 → instance y = ground
    const inst = new THREE.InstancedMesh(geometry, mats.city, n)
    inst.castShadow = true
    inst.receiveShadow = true // inter-block shadows read at the t .8 close-up
    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    const palette = ['#efeae0', '#d9d3c7', '#b8b4ac', '#e8dfcc', '#cfc9bd']
    const nTash = Math.round(n * 0.74)
    for (let i = 0; i < n; i++) {
      const tash = i < nTash
      const cx = tash ? TASHKENT_C[0] : 0
      const cz = tash ? TASHKENT_C[2] : 0
      const sigma = tash ? 0.27 : 0.1
      let x = 0
      let z = 0
      // rejection sample: inside the blob, outside the Chirchiq plaza
      for (let k = 0; k < 8; k++) {
        x = cx + gauss() * sigma
        z = cz + gauss() * sigma
        const d = Math.hypot(x - cx, z - cz)
        if (d < (tash ? 0.72 : 0.3) && Math.hypot(x, z) > RING_R + 0.09) break
      }
      const d = Math.hypot(x - cx, z - cz) / sigma
      const w = 0.045 + rnd() * 0.06
      const dpt = 0.045 + rnd() * 0.06
      // downtown is taller; a few towers; the road corridor stays low so the route tube reads clean
      let h = 0.025 + rnd() * (tash ? 0.09 : 0.05) * Math.exp(-d * d * 0.35)
      if (tash && rnd() < 0.07) h += 0.07 + rnd() * 0.05
      if (distToPolyline(x, z, route.corridor) < 0.1) h = Math.min(h, 0.03)
      dummy.position.set(x, GROUND_Y, z)
      dummy.rotation.set(0, (tash ? -0.35 : 0.25) + (rnd() - 0.5) * 0.16, 0)
      dummy.scale.set(w, h, dpt)
      dummy.updateMatrix()
      inst.setMatrixAt(i, dummy.matrix)
      inst.setColorAt(i, color.set(palette[Math.floor(rnd() * palette.length)]))
    }
    inst.instanceMatrix.needsUpdate = true
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true
    inst.computeBoundingSphere()
    return inst
  }, [profile.density, mats.city, route.corridor])
  useEffect(
    () => () => {
      city.geometry.dispose()
      city.dispose() // tier change rebuilds the city; free the old buffers
    },
    [city],
  )

  /* ---------- Comet trail: 6 camera-facing glow quads in one InstancedMesh (was 6 sprites = 6 draws) ---------- */
  const trailMesh = useMemo(() => {
    const m = new THREE.InstancedMesh(built.trail, mats.trail, TRAIL_N)
    m.count = 0
    m.visible = false
    return m
  }, [built.trail, mats.trail])
  useEffect(() => () => trailMesh.dispose(), [trailMesh])

  /* ---------- Daylight hand-off sprite: top-right of the canonical t0 frame (16:9, fov 45, 20 u ahead) ---------- */
  const sunPos = useMemo(() => {
    const cam = new THREE.Vector3(-10, 40, 14)
    const f = new THREE.Vector3(-11, 0, 0).sub(cam).normalize()
    const right = f.clone().cross(new THREE.Vector3(0, 1, 0)).normalize()
    const up = right.clone().cross(f).normalize()
    const D = 20
    const hh = D * Math.tan((45 / 2) * (Math.PI / 180))
    return cam.addScaledVector(f, D).addScaledVector(right, hh * (16 / 9) * 0.72).addScaledVector(up, hh * 0.72)
  }, [])

  /* ---------- Refs driven every frame ---------- */
  const mapGroup = useRef<THREE.Group>(null!)
  const countryMesh = useRef<THREE.Mesh>(null)
  const neighbourMesh = useRef<THREE.Mesh>(null)
  const routeGroup = useRef<THREE.Group>(null!)
  const preRouteGroup = useRef<THREE.Group>(null!)
  const box = useRef<THREE.Mesh>(null!)
  const pinGroup = useRef<THREE.Group>(null!)
  const rings = useRef<THREE.Mesh>(null!)
  const sun = useRef<THREE.Sprite>(null!)
  const label = useRef<HTMLDivElement>(null)
  const regionText = useRef<(THREE.Mesh & { fillOpacity: number }) | null>(null)
  const cityText = useRef<(THREE.Mesh & { fillOpacity: number }) | null>(null)
  const v = useMemo(() => ({ p: new THREE.Vector3(), tan: new THREE.Vector3(), look: new THREE.Vector3(), s: new THREE.Vector3(), m: new THREE.Matrix4(), labelA: -1, trailCount: -1 }), [])

  useStageFrame(stage, ({ t, tu, time, state }) => {
    /* 1 · daylight: the flash at the cut reads as "we came out into the sun" — fades over t 0–.06 */
    const sunA = 1 - smoothstep(0, 0.06, t)
    mats.sun.opacity = sunA * (0.9 + 0.1 * Math.sin(time * 1.7))
    sun.current.visible = sunA > 0.002 && tu >= 0

    /* 2 · nested-scale reveal (t .8–1): map sinks & dissolves, marker ring becomes the plaza ring */
    const k = expoInOut(range(t, 0.8, 1))
    const alive = 1 - k
    mapGroup.current.position.y = -2 * k
    mapGroup.current.visible = k < 0.999
    // country + neighbour stay opaque (early-z, no sorting) except inside the fade window; compared against the mesh's
    // actual material (not a cached flag) so geo meshes that mount late (fetch resolves with t already ≥ .8) get the right set
    const fading = alive < 0.999
    const M = fading ? mats.fade : mats.opaque
    const cm = countryMesh.current
    if (cm && (cm.material as THREE.Material[])[0] !== M.sandTop) {
      cm.material = [M.sandTop, M.sandSide]
      if (neighbourMesh.current) neighbourMesh.current.material = M.neighbour
    }
    if (fading) for (const m of mats.fadeList) m.opacity = alive
    else if (mats.regionTop.opacity !== 1) mats.regionTop.opacity = mats.regionSide.opacity = 1
    mats.city.opacity = alive
    mats.lines.opacity = 0.5 * alive
    mats.rim.opacity = alive
    if (regionText.current) regionText.current.fillOpacity = alive
    if (cityText.current) cityText.current.fillOpacity = alive

    /* 3 · route build + mini-box ride (t 0–.5), landing (t .5–.58), hand-off shrink (t .82–.92) */
    const u = smoothstep(0, 0.5, t)
    const land = easeOutCubic(range(t, 0.5, 0.58))
    const routeMesh = routeGroup.current.children[0] as THREE.Mesh | undefined
    // GlowLine reads `head`/`opacity` from props; the parent frame runs after the child's, so these writes win (no React state per frame)
    if (routeMesh) {
      const un = (routeMesh.material as THREE.ShaderMaterial).uniforms
      un.uHead.value = Math.max(0.015, u)
      un.uOpacity.value = alive
      routeMesh.visible = alive > 0.002
    }
    const preMesh = preRouteGroup.current.children[0] as THREE.Mesh | undefined
    if (preMesh) {
      ;(preMesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.3 * alive
      preMesh.visible = alive > 0.002
    }
    const b = box.current
    if (u < 0.999) {
      route.curve.getPointAt(u, v.p)
      route.curve.getTangentAt(u, v.tan)
      v.look.copy(v.p).add(v.tan)
      b.position.copy(v.p)
      b.position.y = ROUTE_Y + BOX_HALF_H + 0.03 + Math.sin(time * 7) * 0.012 // gentle jog along the road
      b.lookAt(v.look)
      b.rotation.z = Math.sin(time * 5) * 0.03
    } else {
      // settle onto the plaza inside the ring, brand face toward the camera (+z / +x side)
      b.position.set(0, lerp(ROUTE_Y + BOX_HALF_H + 0.03, GROUND_Y + BOX_HALF_H, land), 0)
      b.rotation.set(0, 0.55 + Math.sin(time * 0.6) * 0.03, 0)
    }
    const shrink = 1 - easeInCubic(range(t, 0.82, 0.92))
    b.scale.setScalar(Math.max(0.0001, shrink))
    b.visible = shrink > 0.001
    // comet trail: lagging camera-facing glow quads along the curve, gone once the box has landed
    const trailA = (1 - land) * alive
    const tm = trailMesh
    let n = 0
    if (u < 0.999 && trailA > 0.001) {
      for (let i = 0; i < TRAIL_N; i++) {
        const ui = u - (i + 1) * 0.028
        if (ui <= 0) break
        route.curve.getPointAt(ui, v.p)
        v.p.y = ROUTE_Y + BOX_HALF_H + 0.02
        const s = (0.2 - i * 0.026) * trailA
        v.s.set(s, s, 1)
        v.m.compose(v.p, state.camera.quaternion, v.s)
        tm.setMatrixAt(n++, v.m)
      }
    }
    if (n !== v.trailCount) {
      v.trailCount = n
      tm.count = n
      tm.visible = n > 0
    }
    if (n) {
      tm.instanceMatrix.needsUpdate = true
      tm.computeBoundingSphere() // keeps default frustum culling honest (6 instances — trivial)
    }

    /* 4 · marker: hovering pin + pulse ring; ring flashes at landing, then widens ×6 into the plaza ring */
    const pin = pinGroup.current
    pin.position.y = PIN_BASE + Math.sin(time * 1.6) * 0.03
    pin.rotation.y = time * 0.5
    const pinS = alive * (0.85 + 0.15 * smoothstep(0.42, 0.5, t))
    pin.scale.setScalar(Math.max(0.0001, pinS))
    pin.visible = pinS > 0.002
    mats.pin.opacity = alive
    mats.pinHead.opacity = alive
    const landFlash = window01(t, 0.49, 0.6) * 0.6
    const breathe = 0.82 + 0.18 * Math.sin(time * 2.6)
    const r = rings.current
    const ru = mats.rings.uniforms
    r.position.y = lerp(GROUND_Y + 0.006, 0.012, k)
    ru.uScaleA.value = lerp(1 + 0.05 * Math.sin(time * 2.6), 6, k)
    ru.uOpacityA.value = lerp(0.85 * breathe + landFlash, 0.3, k)
    // expanding pulse wave (loops every 1.8 s), only while the map is alive
    const ph = (time % 1.8) / 1.8
    ru.uScaleB.value = (1 + ph * 1.6) * (1 + 5 * k)
    ru.uOpacityB.value = (1 - ph) * (1 - ph) * 0.6 * alive * (0.35 + 0.65 * smoothstep(0.45, 0.52, t))

    /* 5 · office label (drei Html, mounted in range only): appears with the landing, leaves before the reveal */
    if (label.current) {
      const a = smoothstep(0.5, 0.56, t) * (1 - smoothstep(0.78, 0.82, t))
      if (Math.abs(a - v.labelA) > 1e-3) {
        v.labelA = a
        label.current.style.opacity = a.toFixed(3)
        label.current.style.transform = `translateY(${((1 - a) * 8).toFixed(1)}px)`
      }
    }
  })

  return (
    <group name="UzbekistanScene">
      {/* ---- map (sinks & dissolves in the reveal) ---- */}
      <group ref={mapGroup}>
        {geo ? (
          <>
            {/* castShadow stays ON: with the 44 u shadow frustum the country's self-shadow darkens its own walls (baseline look);
                turning it off (or shadowSize 8 in the preset) lights the walls and saves 2 shadow draws — a visible change, so not done */}
            <mesh ref={countryMesh} geometry={geo.country} material={[mats.opaque.sandTop, mats.opaque.sandSide]} castShadow receiveShadow />
            <mesh ref={neighbourMesh} geometry={geo.neighbours} material={mats.opaque.neighbour} position={[0, 0.02, 0]} />
            <lineSegments geometry={geo.lines} material={mats.lines} />
          </>
        ) : null}
        <mesh geometry={built.region} material={[mats.regionTop, mats.regionSide]} castShadow receiveShadow />
        <mesh geometry={built.rim} material={mats.rim} />
        <primitive object={city} />
        {/* labels lie on the plateau, north of the marker — readable from the t.5 / t.8 camera (south-east) */}
        <Text ref={regionText} font={FONT} fontSize={0.44} lineHeight={0.92} letterSpacing={0.02} color="#15171c" anchorX="center" anchorY="middle" textAlign="center" rotation={[-Math.PI / 2, 0, 0]} position={[0.85, GROUND_Y + 0.012, -1.5]}>
          {t.uzbekistan.region.replace(' ', '\n')}
        </Text>
        <Text ref={cityText} font={FONT} fontSize={0.35} letterSpacing={0.06} color="#15171c" anchorX="center" anchorY="middle" rotation={[-Math.PI / 2, 0, 0]} position={[0.85, GROUND_Y + 0.012, -0.5]}>
          {t.uzbekistan.city}
        </Text>
      </group>

      {/* ---- route (kept outside the sinking group: it fades by uniform, stays level with the box) ---- */}
      <group ref={preRouteGroup}>
        <GlowLine points={route.pre} radius={0.018} opacity={0.3} speed={0.6} pulses={4} tubularSegments={48} radialSegments={5} />
      </group>
      <group ref={routeGroup}>
        <GlowLine points={route.main} radius={0.03} opacity={1} speed={1.1} pulses={5} tubularSegments={96} radialSegments={6} />
      </group>
      <mesh ref={box} geometry={built.box} material={mats.box} castShadow />
      <primitive object={trailMesh} />

      {/* ---- Chirchiq marker: ring + pulse on the plaza (one mesh) + hovering pin ---- */}
      <mesh ref={rings} geometry={built.rings} material={mats.rings} position={[0, GROUND_Y + 0.006, 0]} />
      <group ref={pinGroup} position={[0, PIN_BASE, 0]}>
        <mesh geometry={built.pin} material={mats.pin} />
        <mesh geometry={built.pinHead} material={mats.pinHead} position={[0, 0.6, 0]} />
        {inRange ? (
          <Html position={[0, 0.95, 0]} center zIndexRange={[9, 1]} style={{ pointerEvents: 'none' }}>
            <div
              ref={label}
              style={{
                opacity: 0,
                whiteSpace: 'nowrap',
                padding: '6px 12px',
                borderRadius: 999,
                background: 'rgba(11,12,15,.78)',
                border: '1px solid rgba(255,106,0,.55)',
                color: '#f2efe9',
                fontFamily: 'Inter, sans-serif',
                fontWeight: 600,
                fontSize: 12,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                fontVariantNumeric: 'tabular-nums',
                backdropFilter: 'blur(6px)',
              }}
            >
              {t.uzbekistan.office}
            </div>
          </Html>
        ) : null}
      </group>

      {/* ---- daylight hand-off glow (fades over t 0–.06) ---- */}
      <sprite ref={sun} material={mats.sun} position={sunPos.toArray() as [number, number, number]} scale={[22, 22, 1]} />

      {/* ---- warm ambient dust over the whole map ---- */}
      <Particles count={400} spread={[36, 10, 28]} position={[-8, 4, 0]} color="#ffd2a8" size={0.8} opacity={0.45} drift={[0.03, 0.015, 0]} speed={0.05} seed={41} />

      {/* ---- hidden warm-up twins: the transparent fade clones get compiled with the world (never rendered) ---- */}
      <group visible={false}>
        <mesh geometry={built.dummy} material={mats.fade.sandTop} />
        <mesh geometry={built.dummy} material={mats.fade.sandSide} />
        <mesh geometry={built.dummy} material={mats.fade.neighbour} />
      </group>

      {geo || failed ? <Ready id={stage.id} /> : null}
    </group>
  )
}

/** Reports the scene ready only once the GeoJSON geometry exists (or the fetch failed — never block the preloader). */
function Ready({ id }: { id: string }) {
  useSceneReady(id)
  return null
}
