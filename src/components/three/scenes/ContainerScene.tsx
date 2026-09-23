'use client'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Html } from '@react-three/drei'
import { useInRange, useSceneReady, useStageFrame } from '@/hooks/useStage'
import { useApp } from '@/lib/stores'
import { PROFILES } from '@/lib/quality'
import { audio } from '@/lib/audio'
import { clamp, lerp, range, smoothstep, window01 } from '@/lib/math'
import { easeInOutCubic, easeOutBack } from '@/lib/easing'
import { concreteTextures, corrugatedNormal, glowSprite } from '@/lib/textures'
import { CONTAINER_NO } from '@/config/worldB'
import { Container, CONTAINER_SIZE, type ContainerHandle } from '../models/Container'
import { TujjorBox, BOX_SIZE, type TujjorBoxHandle } from '../models/TujjorBox'
import { Pallet, PALLET_TOP } from '../models/Pallet'
import { Particles } from '../fx/Particles'
import type { SceneProps } from './types'
export { cameraAt, lights } from './ContainerScene.camera'

/* ─── layout (local space of world A) ─────────────────────────────────────────────────────── */
const [L, H, W] = CONTAINER_SIZE
const TH = 0.04 // shell thickness of the shared Container model
const CX = 42.4 // container floor centre → door face at x = 36.3 (the shared belt's end drum / rails reach x 36.18: nothing may poke through the shut leaves)
const DOOR_X = CX - L / 2
const BELT_TOP = 0.55 // conveyor belt surface (feeds the door at x≈36)
const FLOOR_Y = 0.09 // top of the container roller floor
const PLATE_X0 = 35.95 // dock-leveler hinge (at the belt end)
const PLATE_X1 = 37.4 // where the plate meets the rollers
const PLATE_LEN = Math.hypot(PLATE_X1 - PLATE_X0, BELT_TOP - FLOOR_Y)
const PLATE_ANGLE = Math.atan2(FLOOR_Y - BELT_TOP, PLATE_X1 - PLATE_X0)
// retracted, the plate tip must stay 6 cm inside the belt side of the door leaves' inner face
const PLATE_RETRACT = PLATE_X0 + PLATE_LEN - (DOOR_X - 0.06)
const CARGO_X0 = 34
const CARGO_X1 = 39.5
const DOOR_OPEN_RAD = THREE.MathUtils.degToRad(165)
const ROLLERS = 22
const DOCK: [number, number, number] = [32.85, 0, -2.3] // dock platform origin
const POST: [number, number, number] = [DOCK[0] + 0.35, DOCK[1] + 0.5, DOCK[2] - 0.7] // lamp post foot
const LAMP_X = 40 // ceiling bulkhead lamp (the real light is lights.points[0])

/** height of the rolling surface under x: belt → dock plate → rollers */
const surfaceY = (x: number) => (x <= PLATE_X0 ? BELT_TOP : x >= PLATE_X1 ? FLOOR_Y : lerp(BELT_TOP, FLOOR_Y, (x - PLATE_X0) / (PLATE_X1 - PLATE_X0)))

/* ─── colours (vertex-painted into the merged static meshes) ─────────────────────────────── */
const C = {
  frame: '#2a2d35',
  lining: '#1a1d24',
  dark: '#15171c',
  rubber: '#111214',
  bone: '#d9d4ca',
  steel: '#6a6e76',
}

/* ─── geometry merge helpers ─────────────────────────────────────────────────────────────── */
interface Part {
  geo: THREE.BufferGeometry
  pos?: [number, number, number]
  rot?: [number, number, number]
  /** vertex colour (only for painted merges) */
  color?: string
}
const tmpM = new THREE.Matrix4()
const tmpE = new THREE.Euler()
const tmpQ = new THREE.Quaternion()
const tmpP = new THREE.Vector3()
const tmpS = new THREE.Vector3(1, 1, 1)
const tmpC = new THREE.Color()

function paint(g: THREE.BufferGeometry, c: THREE.Color) {
  const n = g.getAttribute('position').count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
}

/** Transform (+ paint) every part and merge them into ONE non-indexed geometry = one draw call. Parts are disposed. */
function mergeParts(parts: Part[], painted = false): THREE.BufferGeometry {
  const list = parts.map(({ geo, pos, rot, color }) => {
    const g = geo.index ? geo.toNonIndexed() : geo
    if (g !== geo) geo.dispose()
    tmpE.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0)
    tmpM.compose(tmpP.set(pos?.[0] ?? 0, pos?.[1] ?? 0, pos?.[2] ?? 0), tmpQ.setFromEuler(tmpE), tmpS)
    g.applyMatrix4(tmpM)
    if (painted) paint(g, tmpC.set(color ?? '#ffffff'))
    return g
  })
  const merged = mergeGeometries(list, false) ?? list[0]
  if (merged !== list[0]) list.forEach((g) => g.dispose())
  return merged
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
const cyl = (rt: number, rb: number, h: number, seg: number) => new THREE.CylinderGeometry(rt, rb, h, seg)

/* ─── lamp halos: both glow sprites as ONE camera-facing quad pair (a sprite = a draw each) ──── */
const haloVert = /* glsl */ `
attribute vec3 aCenter; attribute float aSize; varying vec2 vUv;
void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(aCenter, 1.0); mv.xy += position.xy * aSize; gl_Position = projectionMatrix * mv; }`
const haloFrag = /* glsl */ `
uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
void main(){ vec4 s = texture2D(uMap, vUv); gl_FragColor = vec4(uColor * s.rgb, s.a * uOpacity); }`
/** two unit quads whose vertices carry their world centre + size; billboarded in the vertex shader */
function haloGeometry(halos: { pos: [number, number, number]; size: number }[]): THREE.BufferGeometry {
  const parts = halos.map(({ pos, size }) => {
    const g = new THREE.PlaneGeometry(1, 1).toNonIndexed()
    const n = g.getAttribute('position').count
    const c = new Float32Array(n * 3)
    const sz = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      c[i * 3] = pos[0]
      c[i * 3 + 1] = pos[1]
      c[i * 3 + 2] = pos[2]
      sz[i] = size
    }
    g.setAttribute('aCenter', new THREE.BufferAttribute(c, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1))
    return g
  })
  const merged = mergeGeometries(parts, false) ?? parts[0]
  // the quads are placed by the shader — give the culler the real extent
  merged.boundingSphere = new THREE.Sphere(new THREE.Vector3(...halos[0].pos), 1)
  for (const h of halos) merged.boundingSphere.expandByPoint(new THREE.Vector3(...h.pos).addScalar(h.size))
  for (const h of halos) merged.boundingSphere.expandByPoint(new THREE.Vector3(...h.pos).addScalar(-h.size))
  merged.boundingBox = null
  return merged
}

/* ─── the sodium light: door slit + floor pool in ONE additive plane pair / one draw ──────── */
const lightVert = /* glsl */ `
attribute float aFade; varying vec2 vUv; varying float vFade;
void main(){ vUv = uv; vFade = aFade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const lightFrag = /* glsl */ `
uniform float uGap; uniform float uTime; uniform vec3 uColor; uniform float uIntSlit; uniform float uIntPool;
varying vec2 vUv; varying float vFade;
void main(){
  float dx = abs(vUv.x - 0.5) * 2.0;             // 0 at the centre seam … 1 at the frame
  float gap = max(uGap, 0.012);                  // opening half-width (fraction), never fully 0 → seam leak
  float inside = 1.0 - smoothstep(gap - 0.05, gap + 0.015, dx);
  float wrap = exp(-max(0.0, dx - gap) * 12.0) * 0.3;   // light wrap past the leaf edges
  float shape = min(inside + wrap, 1.0);         // clamped: peak radiance = intensity (§14.13: slit 3.0)
  float y = clamp(vUv.y, 0.0, 1.0);              // MSAA can extrapolate uv past the edge → keep every term finite (a NaN here blacks out the bloom chain)
  float vert = smoothstep(0.0, 0.06, y) * (1.0 - smoothstep(0.94, 1.0, y));
  float q = 1.0 - y;
  float along = mix(1.0, q * q * (0.8 + 0.2 * q), vFade); // floor pool dies away from the door (≈ q^2.2, no pow)
  float flick = 0.95 + 0.05 * sin(uTime * 6.0 + y * 4.0) * sin(uTime * 2.3);
  float a = shape * vert * along * flick * mix(uIntSlit, uIntPool, vFade);
  // the pool keeps its authored look (it was blended SrcAlpha/One, i.e. radiance a²); the slit is linear
  float rad = mix(a, a * a, vFade);
  gl_FragColor = vec4(uColor * rad, min(a, 1.0));
}`

/**
 * §04 CONTAINER — the pallet rolls off the belt, down the dock plate and into the branded 40ft
 * container; the camera follows it in, overtakes it and turns around; the doors close and the
 * box becomes a silhouette against the narrowing slit of sodium light. Cut to black at the end.
 *
 * Choreography (local t):
 *  0–.45  cargo x 34 → 39.5 (ease-out from belt speed), y follows belt → plate → rollers, pitch from the plate slope
 *  .34–.47 dock plate retracts into the belt (out of the doors' sweep)
 *  .43–.50 arrival bump against the pallet stops
 *  .45–.80 doors close (smoothstep) — slit plane + floor pool narrow with the leaf angle
 *  .80     door thud (once); .82 seal tag pops, HUD "TJEU 447120 3 · SEALED"
 *
 * Perf layout: the shared Container is mounted WITHOUT its interior (its closed BackSide lining
 * walled off the doorway from inside); the scene owns an open 4-face lining, one instanced roller
 * floor, and every static prop is merged per material (interior statics, door leaves, dock, yard
 * props, far containers, lamps) — ~20 draws for the whole set instead of ~42.
 */
export default function ContainerScene({ stage }: SceneProps) {
  const tier = useApp((s) => s.tier)
  const profile = PROFILES[tier]
  const inRange = useInRange(stage)

  const container = useRef<ContainerHandle>(null)
  const cargo = useRef<THREE.Group>(null!)
  const boxRef = useRef<TujjorBoxHandle>(null)
  const plate = useRef<THREE.Group>(null!)
  const leftLeaf = useRef<THREE.Group>(null!)
  const rightLeaf = useRef<THREE.Group>(null!)
  const seal = useRef<THREE.Group>(null!)
  const hud = useRef<HTMLDivElement>(null)
  const thudDone = useRef(false)
  const lastHud = useRef(-1)

  /* materials (all at mount) */
  const mats = useMemo(() => {
    const con = concreteTextures(512) // apron/dock are never the hero → 512 is plenty
    // clone shared textures before touching `repeat` (other scenes use the same memoised maps)
    const cMap = con.map.clone()
    const cRough = con.roughnessMap.clone()
    const cNorm = con.normalMap.clone()
    for (const t of [cMap, cRough, cNorm]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.repeat.set(5, 5)
      t.needsUpdate = true
    }
    const ribbed = corrugatedNormal(256, 24).clone()
    ribbed.wrapS = ribbed.wrapT = THREE.RepeatWrapping
    ribbed.repeat.set(3, 1)
    ribbed.needsUpdate = true
    const farNorm = corrugatedNormal(256, 12).clone()
    farNorm.wrapS = farNorm.wrapT = THREE.RepeatWrapping
    farNorm.repeat.set(4, 1)
    farNorm.needsUpdate = true
    // same corrugation the shared model's lining used (6 waves per uv width)
    const liningNorm = corrugatedNormal(512, 18).clone()
    liningNorm.wrapS = liningNorm.wrapT = THREE.RepeatWrapping
    liningNorm.repeat.set(6, 1)
    liningNorm.needsUpdate = true
    const lightMat = new THREE.ShaderMaterial({
      vertexShader: lightVert,
      fragmentShader: lightFrag,
      uniforms: { uGap: { value: 1 }, uTime: { value: 0 }, uColor: { value: new THREE.Color('#ffb070') }, uIntSlit: { value: 3 }, uIntPool: { value: 0.9 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      premultipliedAlpha: true, // ONE/ONE: the fragment's rgb IS the added radiance (SrcAlpha/One would square it)
    })
    return {
      concrete: new THREE.MeshStandardMaterial({ map: cMap, roughnessMap: cRough, normalMap: cNorm, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.95, metalness: 0.05, color: '#8c8a86' }),
      dock: new THREE.MeshStandardMaterial({ map: cMap, roughnessMap: cRough, roughness: 0.9, metalness: 0.05, color: '#75736f' }),
      /** dock plate: steel deck + its graphite rails/hinge in one vertex-painted mesh */
      steel: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.85, normalMap: ribbed, normalScale: new THREE.Vector2(0.35, 0.35) }),
      lining: new THREE.MeshStandardMaterial({ color: C.lining, roughness: 0.8, metalness: 0.4, normalMap: liningNorm, normalScale: new THREE.Vector2(0.5, 0.5) }),
      /** vertex-painted graphite steelwork (kick rails, rings, stops, door leaf linings + bars, plate rails) */
      metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.6 }),
      /** roller floor (instanced) — its own material: sharing one material between an InstancedMesh and plain meshes makes three draw the plain ones with a stale program state */
      roller: new THREE.MeshStandardMaterial({ color: C.frame, roughness: 0.6, metalness: 0.6 }),
      /** vertex-painted matte yard props (rubber bumpers/chocks, painted edge line, lamp post) */
      matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.15 }),
      farContainer: new THREE.MeshStandardMaterial({ color: C.lining, roughness: 0.7, metalness: 0.5, normalMap: farNorm, normalScale: new THREE.Vector2(0.6, 0.6) }),
      lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb070').multiplyScalar(2.5), toneMapped: false }),
      sealGlow: new THREE.MeshBasicMaterial({ color: '#ff8a2a', toneMapped: false }),
      halo: new THREE.ShaderMaterial({
        vertexShader: haloVert,
        fragmentShader: haloFrag,
        uniforms: { uMap: { value: glowSprite() }, uColor: { value: new THREE.Color('#ffb070') }, uOpacity: { value: 0.45 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      light: lightMat,
    }
  }, [])

  /* merged static geometry (one draw per material) */
  const ringCount = Math.round(44 * Math.max(0.5, profile.density))
  const geos = useMemo(() => {
    /* ── interior lining: 4 open faces (±Z walls, roof, +X end), normals inward — the doorway stays open ── */
    const wallL = L - TH * 2
    const wallH = H - TH
    const wallW = W - TH * 2
    const lining = mergeParts([
      { geo: new THREE.PlaneGeometry(wallL, wallH), pos: [CX, H / 2, -(W / 2 - TH)] },
      { geo: new THREE.PlaneGeometry(wallL, wallH), pos: [CX, H / 2, W / 2 - TH], rot: [0, Math.PI, 0] },
      { geo: new THREE.PlaneGeometry(wallL, wallW), pos: [CX, H - TH, 0], rot: [Math.PI / 2, 0, 0] },
      { geo: new THREE.PlaneGeometry(wallW, wallH), pos: [CX + L / 2 - TH, H / 2, 0], rot: [0, -Math.PI / 2, 0] },
    ])

    /* ── interior steelwork: kick rails, lamp housing, lashing rings, pallet stops ── */
    const stopShape = new THREE.Shape()
    stopShape.moveTo(0, 0)
    stopShape.lineTo(0, 0.09) // vertical face toward the incoming pallet
    stopShape.lineTo(0.06, 0.09)
    stopShape.lineTo(0.18, 0)
    stopShape.closePath()
    const stopGeo = () => new THREE.ExtrudeGeometry(stopShape, { depth: 0.3, bevelEnabled: false }).translate(0, 0, -0.15)
    const interior: Part[] = [
      { geo: box(L - 0.3, 0.07, 0.06), pos: [CX + 0.1, 0.075, -(W / 2 - 0.09)], color: C.frame },
      { geo: box(L - 0.3, 0.07, 0.06), pos: [CX + 0.1, 0.075, W / 2 - 0.09], color: C.frame },
      { geo: cyl(0.14, 0.16, 0.06, 16), pos: [LAMP_X, H - TH - 0.03, 0], color: C.frame },
      { geo: stopGeo(), pos: [CARGO_X1 + 0.62, FLOOR_Y, -0.28], color: C.rubber },
      { geo: stopGeo(), pos: [CARGO_X1 + 0.62, FLOOR_Y, 0.28], color: C.rubber },
    ]
    const perWall = Math.ceil(ringCount / 4)
    let i = 0
    for (let side = -1; side <= 1; side += 2)
      for (const y of [0.32, 1.65])
        for (let k = 0; k < perWall && i < ringCount; k++, i++) {
          const x = DOOR_X + 0.9 + (k / Math.max(1, perWall - 1)) * (L - 1.8)
          // torus in XY = flat against the ±Z wall
          interior.push({ geo: new THREE.TorusGeometry(0.045, 0.011, 4, 12), pos: [x, y, side * (W / 2 - 0.07)], color: C.frame })
        }
    const interiorGeo = mergeParts(interior, true)

    /* ── door leaves (interior side): graphite lining + 2 lock bars each, hinged at ±W/2 ── */
    const leaf = (s: 1 | -1) =>
      mergeParts(
        [
          { geo: box(0.012, H - 0.12, W / 2 - 0.06), pos: [0.028, H / 2, (s * W) / 4], color: C.lining },
          { geo: box(0.03, H - 0.4, 0.05), pos: [0.05, H / 2, s * 0.3], color: C.frame },
          { geo: box(0.03, H - 0.4, 0.05), pos: [0.05, H / 2, s * 0.9], color: C.frame },
        ],
        true,
      )
    const leafL = leaf(1)
    const leafR = leaf(-1)
    const sealStrip = box(0.01, H - 0.1, 0.02).translate(0.03, H / 2, -W / 2 + 0.035)
    const sealPin = mergeParts([{ geo: cyl(0.012, 0.012, 0.1, 8), rot: [Math.PI / 2, 0, 0], color: C.frame }], true)
    const sealTag = box(0.03, 0.05, 0.05).translate(0.02, -0.03, 0)

    /* ── dock leveler plate: steel deck + rails + hinge, one mesh ── */
    const plate = mergeParts(
      [
        { geo: box(PLATE_LEN, 0.03, 1.1), pos: [PLATE_LEN / 2, -0.012, 0], color: C.steel }, // top 3 mm above the belt plane when retracted
        { geo: box(PLATE_LEN, 0.04, 0.03), pos: [PLATE_LEN / 2, 0.02, -0.53], color: C.frame },
        { geo: box(PLATE_LEN, 0.04, 0.03), pos: [PLATE_LEN / 2, 0.02, 0.53], color: C.frame },
        { geo: cyl(0.035, 0.035, 1.16, 10), rot: [Math.PI / 2, 0, 0], color: C.frame },
      ],
      true,
    )

    /* ── outside: dock platform + ramp (concrete, one mesh), yard props (one painted mesh), far containers (one mesh) ── */
    const rampShape = new THREE.Shape()
    rampShape.moveTo(0, 0)
    rampShape.lineTo(2.2, 0)
    rampShape.lineTo(0, 0.5)
    rampShape.closePath()
    const ramp = new THREE.ExtrudeGeometry(rampShape, { depth: 5.7, bevelEnabled: false })
    ramp.rotateY(Math.PI / 2) // extrusion (+z) → +x, profile (+x) → −z
    const dock = mergeParts([
      { geo: box(5.7, 0.5, 2.6), pos: [DOCK[0], DOCK[1] + 0.25, DOCK[2]] },
      { geo: ramp, pos: [DOCK[0] - 2.85, DOCK[1], DOCK[2] - 1.3] },
    ])

    const chockShape = new THREE.Shape() // quarter-round wedge profile in (x,y), extruded along z
    chockShape.moveTo(0, 0)
    chockShape.lineTo(0.34, 0)
    chockShape.quadraticCurveTo(0.2, 0.02, 0.1, 0.12)
    chockShape.lineTo(0.04, 0.19)
    chockShape.lineTo(0, 0.19)
    chockShape.closePath()
    const chock = () => new THREE.ExtrudeGeometry(chockShape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 }).translate(0, 0, -0.11)
    const props = mergeParts(
      [
        // painted edge line along the dock's +X face top
        { geo: box(0.12, 0.004, 2.6), pos: [DOCK[0] + 2.79, DOCK[1] + 0.505, DOCK[2]], color: C.bone },
        // rubber bumpers
        { geo: box(0.14, 0.32, 0.26), pos: [DOCK[0] + 2.92, DOCK[1] + 0.3, DOCK[2] - 0.8], color: C.rubber },
        { geo: box(0.14, 0.32, 0.26), pos: [DOCK[0] + 2.92, DOCK[1] + 0.3, DOCK[2] + 0.8], color: C.rubber },
        // lamp post on the dock
        { geo: cyl(0.16, 0.2, 0.12, 12), pos: [POST[0], POST[1] + 0.06, POST[2]], color: C.dark },
        { geo: cyl(0.045, 0.06, 3.7, 10), pos: [POST[0], POST[1] + 1.9, POST[2]], color: C.dark },
        { geo: cyl(0.035, 0.035, 0.9, 8), pos: [POST[0], POST[1] + 3.66, POST[2] + 0.45], rot: [Math.PI / 2, 0, 0], color: C.dark },
        { geo: box(0.36, 0.14, 0.6), pos: [POST[0], POST[1] + 3.6, POST[2] + 0.9], color: C.dark },
        // wheel chocks left on the apron in the foreground
        { geo: chock(), pos: [35.1, 0, 2.0], rot: [0, 0.5, 0], color: C.rubber },
        { geo: chock(), pos: [35.55, 0, 2.35], rot: [0, -1.9, 0], color: C.rubber },
      ],
      true,
    )
    const far = mergeParts([
      { geo: box(12.2, 2.6, 2.4), pos: [50, 1.3, -7.5], rot: [0, 0.12, 0] },
      { geo: box(12.2, 2.6, 2.4), pos: [50.7, 3.9, -7.6], rot: [0, 0.1, 0] },
      { geo: box(12.2, 2.6, 2.4), pos: [55, 1.3, 2.5], rot: [0, -1.35, 0] },
    ])
    // emissive lamp faces: interior bulkhead disc + the dock lamp panel (same HDR colour → one mesh)
    const lamps = mergeParts([
      { geo: cyl(0.1, 0.11, 0.03, 16), pos: [LAMP_X, H - TH - 0.07, 0] },
      { geo: box(0.28, 0.02, 0.5), pos: [POST[0], POST[1] + 3.52, POST[2] + 0.9] },
    ])

    /* ── sodium light: vertical slit plane in the doorway (aFade 0) + its pool on the roller floor (aFade 1) ── */
    const slit = new THREE.PlaneGeometry(W - 0.12, H - 0.1)
    slit.setAttribute('aFade', new THREE.BufferAttribute(new Float32Array(slit.getAttribute('position').count).fill(0), 1))
    const pool = new THREE.PlaneGeometry(W - 0.2, 4.4)
    pool.setAttribute('aFade', new THREE.BufferAttribute(new Float32Array(pool.getAttribute('position').count).fill(1), 1))
    const light = mergeParts([
      { geo: slit, pos: [DOOR_X + 0.05, H / 2, 0], rot: [0, Math.PI / 2, 0] },
      { geo: pool, pos: [DOOR_X + 2.3, FLOOR_Y + 0.003, 0], rot: [-Math.PI / 2, 0, -Math.PI / 2] },
    ])
    const apron = new THREE.PlaneGeometry(30, 28).rotateX(-Math.PI / 2).translate(43, -0.01, 0)
    const halos = haloGeometry([
      { pos: [LAMP_X, H - TH - 0.15, 0], size: 0.9 },
      { pos: [POST[0], POST[1] + 3.45, POST[2] + 0.9], size: 2.2 },
    ])

    return { lining, interior: interiorGeo, leafL, leafR, sealStrip, sealPin, sealTag, plate, dock, props, far, lamps, light, apron, halos }
  }, [ringCount])

  /* roller floor: one instanced rod (across the container, 0.52 m pitch), matrices set once */
  const roller = useMemo(() => {
    const g = cyl(0.03, 0.03, W - 0.4, 8)
    g.rotateX(Math.PI / 2)
    return g
  }, [])

  /* dispose everything we built (materials at unmount, geometries whenever the density rebuilds them) */
  useEffect(() => () => void Object.values(geos).forEach((g) => g.dispose()), [geos])
  useEffect(() => () => roller.dispose(), [roller])
  useEffect(
    () => () => {
      for (const m of Object.values(mats)) {
        const mm = m as THREE.Material & { map?: THREE.Texture | null; normalMap?: THREE.Texture | null; roughnessMap?: THREE.Texture | null }
        if (mm.map && mm.map !== glowSprite()) mm.map.dispose()
        mm.normalMap?.dispose()
        mm.roughnessMap?.dispose()
        m.dispose()
      }
    },
    [mats],
  )

  /* roller floor instance matrices (static, once) */
  const rollers = useRef<THREE.InstancedMesh>(null!)
  useEffect(() => {
    const m = rollers.current
    if (!m) return
    for (let i = 0; i < ROLLERS; i++) {
      tmpM.makeTranslation(DOOR_X + 0.4 + i * 0.52, 0.06, 0)
      m.setMatrixAt(i, tmpM)
    }
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [])

  useSceneReady(stage.id)

  useStageFrame(stage, ({ t, tu, time, velocity }) => {
    const c = container.current
    const b = boxRef.current
    if (!c || !b) return
    const inStage = tu >= 0
    // the ConveyorScene owns the pallet until the boundary; from t=0 it is ours
    cargo.current.visible = inStage

    /* ── cargo: roll in, descending the dock plate onto the rollers ── */
    const u = range(t, 0, 0.45)
    const x = lerp(CARGO_X0, CARGO_X1, 1 - (1 - u) * (1 - u)) // ease-out ≈ belt speed at t0, stops at the chocks
    const yb = surfaceY(x - 0.6)
    const yf = surfaceY(x + 0.6)
    const moving = 1 - range(t, 0.4, 0.45)
    // roller rumble: 0.52 m roller pitch + a little velocity-driven shiver
    const rumble = Math.sin((x / 0.52) * Math.PI * 2) * 0.004 * moving
    cargo.current.position.set(x, (yb + yf) / 2 + rumble, 0)
    cargo.current.rotation.set(0, 0, Math.atan2(yf - yb, 1.2))
    // arrival bump: the pallet meets the stops, the box tips forward and settles
    const bump = window01(t, 0.43, 0.5, 0.35)
    const idle = Math.sin(time * 1.7) * 0.004 * (0.5 + 0.5 * Math.abs(velocity))
    b.group.rotation.set(0, 0, -0.06 * bump + idle * moving)
    b.group.position.y = PALLET_TOP + BOX_SIZE[1] / 2 + 0.01 * bump

    /* ── dock plate retracts into the belt before the doors sweep ── */
    const retract = easeInOutCubic(range(t, 0.34, 0.47))
    plate.current.rotation.z = PLATE_ANGLE * (1 - retract)
    plate.current.position.x = PLATE_X0 - PLATE_RETRACT * retract

    /* ── doors close .45–.80 ── */
    const closed = smoothstep(0.45, 0.8, t)
    c.setDoors(closed)
    const a = DOOR_OPEN_RAD * (1 - closed)
    leftLeaf.current.rotation.y = -a
    rightLeaf.current.rotation.y = a
    // projected opening seen from inside: half-width = W/2·(1 − cos a), 0 when shut, full past 90°
    const gap = clamp(1 - Math.cos(a), 0, 1)
    const lu = mats.light.uniforms
    lu.uGap.value = gap
    lu.uTime.value = time
    // the slit brightens as it narrows to a seam (the eye adapts to the dark), the pool follows.
    // Radiance stays ≈1 while the opening is wide and peaks at 2.2 on the final seam: the composer's
    // soft-light grain + ACES turn any large area above ≈1.2 linear into cyan/magenta speckle (§14.13 asks for 3.0 — see report)
    lu.uIntSlit.value = 1 + 1.2 * smoothstep(0.8, 1, closed)
    lu.uIntPool.value = 0.9 * (0.6 + 0.6 * closed)

    /* ── thud once when the leaves meet (re-armed when scrolling back up) ── */
    if (t >= 0.795 && !thudDone.current) {
      thudDone.current = true
      audio.thud()
    }
    if (t < 0.7) thudDone.current = false

    /* ── seal tag + HUD ── */
    const sealIn = easeOutBack(range(t, 0.82, 0.9))
    seal.current.scale.setScalar(Math.max(0.001, sealIn))
    seal.current.visible = sealIn > 0.001
    if (hud.current) {
      const o = Math.round(range(t, 0.82, 0.87) * 100) / 100
      if (o !== lastHud.current) {
        lastHud.current = o
        hud.current.style.opacity = String(o)
        hud.current.style.transform = `translateY(${(1 - o) * 8}px)`
      }
    }
  })

  return (
    <group name="ContainerScene">
      {/* ── the 40ft container, doors on −X at x=36 (shell only — the interior is ours, see below) ── */}
      <Container ref={container} position={[CX, 0, 0]} closed={0} interior={false} />

      {/* ── interior: open graphite lining (no door face), steelwork, roller floor ── */}
      <mesh geometry={geos.lining} material={mats.lining} />
      <mesh geometry={geos.interior} material={mats.metal} />
      <instancedMesh ref={rollers} args={[roller, mats.roller, ROLLERS]} />

      {/* interior door linings (follow the shared model's hinges): graphite inside, seal strip where the leaves meet */}
      <group ref={leftLeaf} position={[DOOR_X, 0, -W / 2]}>
        <mesh geometry={geos.leafL} material={mats.metal} />
        {/* bolt seal on the lock bar — pops in once the doors are shut */}
        <group ref={seal} position={[0.06, 1.38, W / 2 - 0.09]} visible={false}>
          <mesh geometry={geos.sealPin} material={mats.metal} />
          <mesh geometry={geos.sealTag} material={mats.sealGlow} />
        </group>
      </group>
      <group ref={rightLeaf} position={[DOOR_X, 0, W / 2]}>
        <mesh geometry={geos.leafR} material={mats.metal} />
        <mesh geometry={geos.sealStrip} material={mats.sealGlow} />
      </group>

      {/* ── sodium light: slit in the door opening + its pool on the roller floor (one additive draw) ── */}
      <mesh geometry={geos.light} material={mats.light} renderOrder={2} />

      {/* ── lamps: bulkhead disc inside + dock lamp panel, and their halos ── */}
      <mesh geometry={geos.lamps} material={mats.lamp} />
      <mesh geometry={geos.halos} material={mats.halo} renderOrder={1} />

      {/* ── cargo: pallet + hero box (brand face +Z toward the camera side) ── */}
      <group ref={cargo} position={[CARGO_X0, BELT_TOP, 0]}>
        <Pallet />
        <TujjorBox ref={boxRef} mode="static" tint={0} position={[0, PALLET_TOP + BOX_SIZE[1] / 2, 0]} />
      </group>

      {/* ── dock leveler plate: hinged at the belt end, bridges down to the rollers, retracts before the doors close ── */}
      <group ref={plate} position={[PLATE_X0, BELT_TOP, 0]} rotation={[0, 0, PLATE_ANGLE]}>
        <mesh geometry={geos.plate} material={mats.steel} castShadow receiveShadow />
      </group>

      {/* ── outside: concrete apron, dock platform + ramp, yard props, far containers ── */}
      <mesh geometry={geos.apron} material={mats.concrete} receiveShadow />
      <mesh geometry={geos.dock} material={mats.dock} castShadow receiveShadow />
      <mesh geometry={geos.props} material={mats.matte} castShadow />
      <mesh geometry={geos.far} material={mats.farContainer} />

      {/* ── dust: inside (in the sodium light) and outside under the dock lamp — Particles applies the tier factor itself ── */}
      <Particles count={100} spread={[9, 2.2, 2]} position={[42, 1.25, 0]} color="#ffc58a" size={0.5} opacity={0.5} drift={[0.02, 0.01, 0]} speed={0.04} seed={41} />
      <Particles count={160} spread={[10, 5, 8]} position={[33, 2.6, -1]} color="#ffb27a" size={0.8} opacity={0.4} seed={42} />

      {/* HUD anchored to the shut doors: appears at t .82 */}
      {inRange ? (
        <Html position={[DOOR_X + 0.1, 1.95, -0.1]} center zIndexRange={[9, 1]} style={{ pointerEvents: 'none' }}>
          <div
            ref={hud}
            style={{
              opacity: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              background: 'rgba(21,23,28,0.78)',
              border: '1px solid rgba(242,239,233,0.14)',
              borderRadius: 2,
              color: '#f2efe9',
              fontFamily: 'Inter, system-ui, sans-serif',
              fontWeight: 600,
              fontSize: 11,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 3, background: '#ff6a00', boxShadow: '0 0 8px #ff8a2a' }} />
            <span>{CONTAINER_NO} · SEALED</span>
          </div>
        </Html>
      ) : null}
    </group>
  )
}
