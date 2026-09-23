'use client'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useStageFrame, useSceneReady, useInRange } from '@/hooks/useStage'
import { useApp } from '@/lib/stores'
import { PROFILES } from '@/lib/quality'
import { audio } from '@/lib/audio'
import { range, window01, seeded } from '@/lib/math'
import { labelTexture } from '@/lib/textures'
import { useT } from '@/translations'
import { TujjorBox, BOX_SIZE, type TujjorBoxHandle } from '../models/TujjorBox'
import { Pallet, PALLET_TOP } from '../models/Pallet'
import { ConveyorBelt, BELT_TOP, BELT_WIDTH, type ConveyorBeltHandle } from '../models/ConveyorBelt'
import { ScannerArch, makeScanMaterial, type ScannerArchHandle } from '../models/ScannerArch'
import { SorterRobot, type SorterRobotHandle } from '../models/SorterRobot'
import { atlasBoxGeometry, box, cardboardAtlas, cyl, insideOut, makeGlowPucks, makePartsMaterial, mergeParts, type Part } from '../models/ConveyorParts'
import { Particles } from '../fx/Particles'
import type { SceneProps } from './types'
export { cameraAt, lights } from './ConveyorScene.camera'

const X0 = 4
const X1 = 34.8 // belt ends 1.2 u before the container door face (x=36) so the closing leaves never slice it (docs §04)
const TRAVEL = 30 // pallet x = X0 + TRAVEL·t
const SCALE_X = 9
const SCAN_X = 14
const ROBOT_X = 22
const STATION_X = [6, 14, 18, 22, 30]
const BELT_GAIN = 2.0 // world u/s per unit of the docs §14.10 speed factor (0.15 + 1.0·v)
const CABINET: [number, number, number] = [26.6, 0, -1.85]
const LAMP_X = [10, 24]

/** extra cargo riding the belt (offset from the hero pallet, size, yaw) — wraps inside x0..x1 */
const RIDERS: [number, number, number][] = [
  [-4.6, 0.42, 0.08],
  [-7.8, 0.34, -0.12],
  [3.6, 0.5, 0.05],
  [6.9, 0.38, -0.2],
  [10.4, 0.46, 0.14],
  [14.2, 0.36, -0.06],
]

// the old per-material constants: colour, roughness, metalness
const STEEL = ['#343943', 0.48, 0.72] as const
const DARK = ['#15171c', 0.68, 0.45] as const
const PANEL = ['#1c1f26', 0.55, 0.5] as const
const ORANGE = ['#ff6a00', 0.5, 0.25] as const
const CABLE = ['#0e0f12', 0.9, 0.05] as const
const CABLE_OR = ['#b04a00', 0.85, 0.05] as const
const LAMP = ['#23262d', 0.4, 0.8] as const
type M = readonly [string, number, number]
const B = (w: number, h: number, d: number, m: M, p: [number, number, number], extra: Partial<Part> = {}) => box(w, h, d, m[0], m[1], m[2], p, extra)
const C = (rt: number, rb: number, h: number, seg: number, m: M, p: [number, number, number], extra: Partial<Part> = {}) => cyl(rt, rb, h, seg, m[0], m[1], m[2], p, extra)

// glow puck slots
const PK_SCALE_LED = 0
const PK_CAB_STRIP = 1
const PK_LED0 = 2 // 6 cabinet LEDs
const PK_LAMP0 = 8 // 2 lamp cores
const PK_COUNT = 10
const SCALE_DISPLAY: [number, number, number] = [SCALE_X + 0.35, 1.3, -1.15]
const SCALE_TILT = -0.18

/** a plane part whose uvs address a rect of the plates atlas (u0,v0,u1,v1 in 0..1, v up) */
function atlasPlane(w: number, h: number, rect: [number, number, number, number], local: [number, number, number], position: [number, number, number], rotation?: [number, number, number]): Part {
  const geo = new THREE.PlaneGeometry(w, h).translate(...local)
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, rect[0] + uv.getX(i) * (rect[2] - rect[0]), rect[1] + uv.getY(i) * (rect[3] - rect[1]))
  return { geo, color: '#ffffff', rough: 0.6, metal: 0.18, position, rotation }
}

/**
 * §03 CONVEYOR — the pallet rides the belt x 4 → 36 through five stations: scale (x=9), scanner
 * arch (x=14), consolidation stamp (x=18), sorter robot (x=22), dispatch stamp (x=30).
 * The warehouse scene (visible ±1) supplies shelves/floor/lamps; this scene owns the line itself,
 * its surroundings (guard rails, cable tray, control cabinet, pendant lamps) and the two HUD stamps.
 * Draw calls: every static prop is one merged mesh, all signage one atlas mesh, all small emitters
 * one instanced puck mesh, riders one InstancedMesh; only the hero cargo and the robot cast shadows.
 */
export default function ConveyorScene({ stage }: SceneProps) {
  const tr = useT()
  const tier = useApp((s) => s.tier)
  const profile = PROFILES[tier]
  const inRange = useInRange(stage)

  const root = useRef<THREE.Group>(null!)
  const heroBox = useRef<TujjorBoxHandle>(null)
  const cargo = useRef<THREE.Group>(null!)
  const scanShell = useRef<THREE.Mesh>(null!)
  const belt = useRef<ConveyorBeltHandle>(null)
  const arch = useRef<ScannerArchHandle>(null)
  const robot = useRef<SorterRobotHandle>(null)
  const scaleScreen = useRef<THREE.Mesh>(null!)
  const hud0 = useRef<HTMLDivElement>(null)
  const hud1 = useRef<HTMLDivElement>(null)
  const st = useRef({ lastTime: 0, beltPhase: 0, scanSide: 0, hudIn: [0, 0], frame: -1 })

  /* ---------- static materials / textures / merged geometry (built once) ---------- */
  const built = useMemo(() => {
    /** weigh display frames: idle dashes → settling digits → 12.0 kg (the calculator default weight) */
    const opt = { w: 256, h: 96, font: '700 54px "Space Grotesk", "Inter", sans-serif', color: '#ff8a2a', bg: '#07080a' }
    const scaleFrames = ['-- . -', '04.8', '09.6', '12.0'].map((v) => labelTexture(v, opt))
    const parts = makePartsMaterial()
    const tilt = new THREE.Euler(SCALE_TILT, 0, 0)
    const disp = (o: [number, number, number]): [number, number, number] => {
      const v = new THREE.Vector3(...o).applyEuler(tilt)
      return [SCALE_DISPLAY[0] + v.x, SCALE_DISPLAY[1] + v.y, SCALE_DISPLAY[2] + v.z]
    }
    // guard rails: front x 5..12 (near the t0 camera), back x 27..35, robot cell fence behind the arm
    const rails: { x0: number; x1: number; z: number }[] = [
      { x0: 5, x1: 12.5, z: 1.15 },
      { x0: 26.5, x1: 35, z: -1.15 },
      { x0: 19.4, x1: 24.6, z: -3.05 },
    ]
    const posts: Part[] = []
    for (const r of rails) for (let x = r.x0; x <= r.x1 + 1e-3; x += 1.5) posts.push(C(0.025, 0.03, 0.9, 10, STEEL, [x, 0.45, r.z]))
    const hangers: Part[] = []
    for (let x = X0; x <= X1; x += 4) hangers.push(C(0.012, 0.012, 2.6, 6, DARK, [x, 2.3 + 1.3, -1.0]))
    const housing = new THREE.CylinderGeometry(0.34, 0.1, 0.26, 24, 1, true)
    const housingIn = insideOut(housing)
    const statics = mergeParts([
      /* weighing station x=9: load-cell plinth under the belt, side plates, display column behind */
      B(1.5, 0.2, BELT_WIDTH + 0.5, PANEL, [SCALE_X, 0.1, 0]),
      B(1.5, 0.012, BELT_WIDTH + 0.5, ORANGE, [SCALE_X, 0.205, 0]),
      ...[-1, 1].flatMap((sd) => [-0.55, 0.55].map((lx) => C(0.05, 0.06, 0.14, 12, STEEL, [SCALE_X + lx, 0.28, sd * (BELT_WIDTH / 2 + 0.1)]))),
      ...[-1, 1].map((sd) => B(1.4, 0.16, 0.04, PANEL, [SCALE_X, BELT_TOP + 0.02, sd * (BELT_WIDTH / 2 + 0.12)])),
      C(0.03, 0.035, 1.2, 10, STEEL, [SCALE_X + 0.35, 0.6, -1.15]),
      C(0.16, 0.18, 0.04, 16, DARK, [SCALE_X + 0.35, 0.02, -1.15]),
      B(0.56, 0.3, 0.09, PANEL, SCALE_DISPLAY, { rotation: [SCALE_TILT, 0, 0] }),
      B(0.56, 0.008, 0.002, ORANGE, disp([0, -0.12, 0.047]), { rotation: [SCALE_TILT, 0, 0] }),
      /* station signposts (front side) */
      ...STATION_X.flatMap((sx) => [
        C(0.14, 0.16, 0.04, 16, DARK, [sx, 0.02, 1.25]),
        C(0.022, 0.026, 1.56, 10, STEEL, [sx, 0.8, 1.25]),
        B(1.0, 0.26, 0.03, PANEL, [sx, 1.62, 1.25]),
        B(1.0, 0.012, 0.034, ORANGE, [sx, 1.62 + 0.136, 1.25]),
      ]),
      /* guard rails */
      ...posts,
      ...rails.flatMap((r) => [B(r.x1 - r.x0 + 0.1, 0.05, 0.05, ORANGE, [(r.x0 + r.x1) / 2, 0.86, r.z]), B(r.x1 - r.x0 + 0.1, 0.03, 0.03, STEEL, [(r.x0 + r.x1) / 2, 0.45, r.z])]),
      /* cable tray above the far rail + hangers + cable bundle + conduit drops */
      B(X1 - X0, 0.02, 0.28, PANEL, [(X0 + X1) / 2, 2.3, -1.0]),
      ...[-0.135, 0.135].map((z) => B(X1 - X0, 0.1, 0.01, PANEL, [(X0 + X1) / 2, 2.35, -1.0 + z])),
      ...[-0.07, 0.0, 0.07].map((z, i) => C(0.014, 0.014, X1 - X0, 6, i === 1 ? CABLE_OR : CABLE, [(X0 + X1) / 2, 2.335, -1.0 + z], { rotation: [0, 0, Math.PI / 2] })),
      ...hangers,
      ...[SCALE_X + 0.35, SCAN_X, ROBOT_X].map((cx) => C(0.016, 0.016, 1.4, 6, CABLE, [cx, 1.6, -1.0])),
      /* control cabinet (x≈26.5, behind the line) */
      B(1.0, 0.1, 0.5, DARK, [CABINET[0], 0.05, CABINET[2]]),
      B(0.92, 1.7, 0.44, PANEL, [CABINET[0], 0.95, CABINET[2]]),
      B(0.84, 1.6, 0.01, STEEL, [CABINET[0] + 0.02, 0.95, CABINET[2] + 0.225]),
      B(0.03, 0.22, 0.02, ORANGE, [CABINET[0] + 0.36, 0.95, CABINET[2] + 0.24]),
      B(0.96, 0.04, 0.48, DARK, [CABINET[0], 1.82, CABINET[2]]),
      C(0.016, 0.016, 0.44, 6, CABLE, [CABINET[0] + 0.2, 2.06, CABINET[2] - 0.1]),
      /* pendant lamps over the line (match the two warm spots in the light preset) */
      ...LAMP_X.flatMap((lx) => [
        C(0.01, 0.01, 1.6, 6, CABLE, [lx, 4.4, 0.3]),
        { geo: housing.clone(), color: LAMP[0], rough: LAMP[1], metal: LAMP[2], position: [lx, 3.58, 0.3] as [number, number, number] },
        { geo: housingIn.clone(), color: LAMP[0], rough: LAMP[1], metal: LAMP[2], position: [lx, 3.58, 0.3] as [number, number, number] },
        C(0.1, 0.08, 0.08, 16, LAMP, [lx, 3.72, 0.3]),
      ]),
    ])
    housing.dispose()
    housingIn.dispose()

    /* small emitters: one instanced puck mesh (+z face visible) */
    const pucks = makeGlowPucks(PK_COUNT)
    const d = new THREE.Object3D()
    const setPuck = (i: number, p: [number, number, number], s: [number, number, number], rot: [number, number, number] = [0, 0, 0]) => {
      d.position.set(...p)
      d.rotation.set(...rot)
      d.scale.set(...s)
      d.updateMatrix()
      pucks.setMatrixAt(i, d.matrix)
    }
    const scaleLedPos = disp([-0.22, 0.02, 0.047])
    setPuck(PK_SCALE_LED, scaleLedPos, [0.028, 0.028, 0.002], [SCALE_TILT, 0, 0])
    setPuck(PK_CAB_STRIP, [CABINET[0] - 0.1, 1.32, CABINET[2] + 0.232], [0.36, 0.012, 0.002])
    for (let i = 0; i < 6; i++) setPuck(PK_LED0 + i, [CABINET[0] - 0.3 + (i % 3) * 0.08, 1.2 - Math.floor(i / 3) * 0.08, CABINET[2] + 0.232], [0.03, 0.03, 0.01])
    LAMP_X.forEach((lx, i) => setPuck(PK_LAMP0 + i, [lx, 3.47, 0.3], [0.6, 0.6, 0.002], [Math.PI / 2, 0, 0]))
    const c = new THREE.Color()
    pucks.setColorAt(PK_SCALE_LED, c.set('#ff6a00').multiplyScalar(0.9))
    pucks.setColorAt(PK_CAB_STRIP, c.set('#ff6a00').multiplyScalar(0.9))
    for (let i = 0; i < 6; i++) pucks.setColorAt(PK_LED0 + i, c.setRGB(1, 0.42, 0).multiplyScalar(1.8))
    for (let i = 0; i < 2; i++) pucks.setColorAt(PK_LAMP0 + i, c.set('#ffc78a').multiplyScalar(2.5))
    pucks.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    const rnd = seeded(41)
    const ledPhase = Array.from({ length: 6 }, () => [rnd() * 6.28, 0.6 + rnd() * 2.2] as [number, number])

    /* painted hazard lines along the line (floor is the warehouse's) — one mesh */
    const hazardGeo = mergeGeometries(
      [-1.7, 1.7].map((z) =>
        new THREE.PlaneGeometry(X1 - X0 + 2, 0.06)
          .rotateX(-Math.PI / 2)
          .translate((X0 + X1) / 2, 0.006, z),
      ),
      false,
    )!
    const hazard = new THREE.MeshBasicMaterial({ color: '#ff6a00', toneMapped: false, transparent: true, opacity: 0.32, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false })

    /* extra cargo riding the belt: one InstancedMesh, single-texture cardboard atlas */
    const riderGeo = atlasBoxGeometry(BOX_SIZE[0], BOX_SIZE[1], BOX_SIZE[2])
    const riderMat = new THREE.MeshStandardMaterial({ map: cardboardAtlas(512), roughness: 0.9, metalness: 0 })
    const riders = new THREE.InstancedMesh(riderGeo, riderMat, RIDERS.length)
    riders.castShadow = false
    riders.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    riders.boundingSphere = new THREE.Sphere(new THREE.Vector3((X0 + X1) / 2, BELT_TOP + 0.3, 0), (X1 - X0) / 2 + 1)
    for (let i = 0; i < RIDERS.length; i++) {
      d.position.set(X0, BELT_TOP, 0)
      d.rotation.set(0, RIDERS[i][2], 0)
      d.scale.setScalar(0)
      d.updateMatrix()
      riders.setMatrixAt(i, d.matrix)
    }

    return {
      scaleFrames,
      parts,
      statics,
      pucks,
      ledPhase,
      hazardGeo,
      hazard,
      riders,
      d,
      c,
      // map set from the start so the texture swap never recompiles the program
      scaleScreen: new THREE.MeshBasicMaterial({ toneMapped: false, color: '#ffffff', map: scaleFrames[0] }),
      scan: makeScanMaterial('#ff8a2a'),
      plates: new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.18 }),
    }
  }, [])
  useEffect(
    () => () => {
      const b = built
      b.statics.dispose()
      b.parts.dispose()
      b.pucks.geometry.dispose()
      ;(b.pucks.material as THREE.Material).dispose()
      b.pucks.dispose()
      b.hazardGeo.dispose()
      b.hazard.dispose()
      b.riders.geometry.dispose()
      ;(b.riders.material as THREE.Material).dispose()
      b.riders.dispose()
      b.scaleScreen.dispose()
      b.scan.dispose()
      b.plates.dispose()
    },
    [built],
  )

  /** signage atlas: 5 station rows (label 512×128 + index 128×128) + the cabinet plate — rebuilt only when the locale changes */
  const plateTex = useMemo(() => {
    const W = 1024
    const H = 1024
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    const g = cv.getContext('2d')!
    g.fillStyle = '#15171c'
    g.fillRect(0, 0, W, H)
    g.textBaseline = 'middle'
    g.textAlign = 'center'
    tr.conveyor.stations.forEach((s, i) => {
      const y = i * 128
      g.fillStyle = '#f2efe9'
      g.font = '600 50px "Inter", sans-serif'
      g.fillText(s.toUpperCase(), 256, y + 64 + 2)
      g.fillStyle = '#ff6a00'
      g.fillRect(512, y, 128, 128)
      g.fillStyle = '#0b0c0f'
      g.font = '700 64px "Space Grotesk", "Inter", sans-serif'
      g.fillText(`0${i + 1}`, 576, y + 64 + 2)
    })
    // cabinet plate 512×96 at row 5
    g.fillStyle = '#f2efe9'
    g.font = '700 48px "Space Grotesk", "Inter", sans-serif'
    g.fillText('TUJJOR · LINE 01', 256, 640 + 48 + 2)
    const t = new THREE.CanvasTexture(cv)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [tr])
  useEffect(() => {
    built.plates.map = plateTex
    built.plates.needsUpdate = true
    return () => plateTex.dispose()
  }, [built, plateTex])
  /** all signage planes in one geometry (uv rects into the atlas) */
  const plateGeo = useMemo(() => {
    const row = (i: number): [number, number] => [1 - (i + 1) * 0.125, 1 - i * 0.125] // v0, v1 (v up, row 0 on top)
    const parts: Part[] = []
    STATION_X.forEach((sx, i) => {
      const [v0, v1] = row(i)
      for (const sd of [1, -1]) {
        const rot: [number, number, number] = [0, sd > 0 ? 0 : Math.PI, 0]
        parts.push(atlasPlane(0.76, 0.19, [0, v0, 0.5, v1], [0.08, 0, 0.017], [sx, 1.62, 1.25], rot))
        parts.push(atlasPlane(0.16, 0.16, [0.5, v0, 0.625, v1], [-0.4, 0, 0.017], [sx, 1.62, 1.25], rot))
      }
    })
    parts.push(atlasPlane(0.6, 0.11, [0, 1 - 0.625 - 96 / 1024, 0.5, 1 - 0.625], [0, 0, 0], [CABINET[0], 1.6, CABINET[2] + 0.232]))
    return mergeParts(parts)
  }, [])
  useEffect(() => () => plateGeo.dispose(), [plateGeo])
  useSceneReady(stage.id)

  /* ---------- choreography ---------- */
  useStageFrame(stage, ({ t, tu, velocity, dt, time, state }) => {
    const s = st.current
    const b = built
    const tdt = time - s.lastTime // 0 when motionOff (time frozen)
    s.lastTime = time
    // belt speed = (0.15 + 1.0·v)·gain (docs §14.10, signed) — never stops while motion is on
    const speed = (0.15 * (tdt > 0 ? 1 : 0) + 1.0 * velocity) * BELT_GAIN
    const dist = speed * Math.min(dt, 0.05)
    belt.current?.advance(dist)
    s.beltPhase += 0.15 * BELT_GAIN * tdt

    // hero pallet + box: on the belt only inside this stage (forklift before, container after)
    const onBelt = tu >= 0 && tu <= 1
    const x = X0 + TRAVEL * t
    cargo.current.visible = onBelt
    if (onBelt && heroBox.current) {
      cargo.current.position.set(x, BELT_TOP + 0.004, 0)
      // belt vibration while moving + a faint idle settle
      const shake = Math.sin(time * 38) * 0.0025 * Math.min(1, Math.abs(velocity) * 3) + Math.sin(time * 1.7) * 0.001
      heroBox.current.group.position.set(0, PALLET_TOP + BOX_SIZE[1] / 2 + shake, 0)
      heroBox.current.group.rotation.set(Math.sin(time * 41) * 0.002 * Math.abs(velocity), 0, Math.sin(time * 33) * 0.0015 * Math.abs(velocity))
    }

    // scanner: box crosses x=14 at t≈.333 — brighten + sweep while inside the gate, click on crossing
    const scan = window01(x, SCAN_X - 1.1, SCAN_X + 1.1)
    const camDx = state.camera.position.x - root.current.matrixWorld.elements[12] - SCAN_X
    arch.current?.update(time, onBelt ? scan : 0, x - SCAN_X, camDx)
    const su = b.scan.uniforms
    su.uTime.value = time
    su.uActive.value = onBelt ? scan : 0
    su.uSweep.value = (time * 1.4) % 1
    scanShell.current.visible = onBelt && scan > 0.01
    const side = x < SCAN_X ? -1 : 1
    if (onBelt && s.scanSide !== 0 && side !== s.scanSide) audio.click(1800)
    s.scanSide = onBelt ? side : 0

    // weigh station: digits settle while the pallet is over the platform
    const onScale = onBelt ? range(x, SCALE_X - 0.7, SCALE_X - 0.1) * (x < SCALE_X + 0.8 ? 1 : 0) : 0
    const frame = onScale <= 0.001 ? 0 : onScale < 0.4 ? 1 : onScale < 0.8 ? 2 : 3
    if (frame !== s.frame) {
      s.frame = frame
      const screen = scaleScreen.current.material as THREE.MeshBasicMaterial
      screen.map = b.scaleFrames[frame]
      // the weigh LED grows once the reading has settled
      const k = frame === 3 ? 1.4 : 1
      const pos = b.d.position
      b.pucks.getMatrixAt(PK_SCALE_LED, b.d.matrix)
      b.d.matrix.decompose(pos, b.d.quaternion, b.d.scale)
      b.d.scale.set(0.028 * k, 0.028 * k, 0.002)
      b.d.updateMatrix()
      b.pucks.setMatrixAt(PK_SCALE_LED, b.d.matrix)
      b.pucks.instanceMatrix.needsUpdate = true
    }

    // sorter robot runs on its own clock
    robot.current?.update(time)

    // extra riders wrap along the belt, drifting with the belt's base speed when scroll is idle
    const nRiders = Math.max(2, Math.round(RIDERS.length * PROFILES[useApp.getState().tier].density))
    const span = X1 - X0
    for (let i = 0; i < RIDERS.length; i++) {
      const [off, size, yaw] = RIDERS[i]
      const rel = (((TRAVEL * t + s.beltPhase + off) % span) + span) % span
      const show = i < nRiders && rel > 0.45 && rel < span - 0.45 // hidden while wrapping past the drums
      b.d.position.set(X0 + rel, BELT_TOP + 0.004 + size * 0.375, 0)
      b.d.rotation.set(0, yaw, 0)
      b.d.scale.setScalar(show ? size / BOX_SIZE[0] : 0)
      b.d.updateMatrix()
      b.riders.setMatrixAt(i, b.d.matrix)
    }
    b.riders.instanceMatrix.needsUpdate = true

    // control cabinet LEDs blink on their own periods
    for (let i = 0; i < 6; i++) {
      const [ph, per] = b.ledPhase[i]
      const on = Math.sin(time * per + ph) > 0.2 ? 1 : 0.15
      b.pucks.setColorAt(PK_LED0 + i, b.c.setRGB(1, 0.42, 0).multiplyScalar(on * 1.8))
    }
    if (b.pucks.instanceColor) b.pucks.instanceColor.needsUpdate = true

    // HUD stamps ride with the cargo (where the camera looks): КОНСОЛИДИРОВАН once the box has passed
    // the consolidation post (t .44–.50), ГОТОВ К ОТПРАВКЕ at the dispatch post (t .78–.84)
    const o0 = range(t, 0.44, 0.5) * (1 - range(tu, 1.05, 1.2))
    const o1 = range(t, 0.78, 0.84) * (1 - range(tu, 1.05, 1.2))
    if (hud0.current && o0 !== s.hudIn[0]) {
      hud0.current.style.opacity = String(o0)
      hud0.current.style.transform = `translateY(${(1 - o0) * 10}px) scale(${0.94 + o0 * 0.06})`
      s.hudIn[0] = o0
    }
    if (hud1.current && o1 !== s.hudIn[1]) {
      hud1.current.style.opacity = String(o1)
      hud1.current.style.transform = `translateY(${(1 - o1) * 10}px) scale(${0.94 + o1 * 0.06})`
      s.hudIn[1] = o1
    }
  })

  const shellSize: [number, number, number] = [BOX_SIZE[0] + 0.05, BOX_SIZE[1] + 0.05, BOX_SIZE[2] + 0.05]
  const hudStyle: React.CSSProperties = { opacity: 0, transition: 'none', willChange: 'opacity, transform' }
  return (
    <group ref={root} name="ConveyorScene">
      <ConveyorBelt ref={belt} x0={X0} x1={X1} density={profile.density} />

      {/* hero cargo: pallet + box, x = 4 + 30t — the two HUD stamps ride with it */}
      <group ref={cargo} position={[X0, BELT_TOP, 0]}>
        <Pallet />
        <TujjorBox ref={heroBox} mode="static" position={[0, PALLET_TOP + BOX_SIZE[1] / 2, 0]}>
          {/* scan shell wraps the box while it passes the gate */}
          <mesh ref={scanShell} material={built.scan} visible={false} renderOrder={6}>
            <boxGeometry args={shellSize} />
          </mesh>
        </TujjorBox>
        {inRange ? (
          <>
            <Html position={[0.35, 0.75, 0.3]} center zIndexRange={[9, 1]} style={{ pointerEvents: 'none' }}>
              <div ref={hud0} className="hud hud-bracket" style={hudStyle}>
                {tr.warehouse.hud[2]}
              </div>
            </Html>
            <Html position={[0.35, 0.75, 0.3]} center zIndexRange={[9, 1]} style={{ pointerEvents: 'none' }}>
              <div ref={hud1} className="hud hud-bracket" style={hudStyle}>
                {tr.warehouse.hud[3]}
              </div>
            </Html>
          </>
        ) : null}
      </group>

      {/* extra cargo riding the belt */}
      <primitive object={built.riders} />

      {/* every static prop of the line: scale station, signposts, guard rails, cable tray, cabinet, pendant lamps */}
      <mesh geometry={built.statics} material={built.parts} receiveShadow />
      {/* signage: station labels / indices + cabinet plate (one atlas) */}
      <mesh geometry={plateGeo} material={built.plates} />
      {/* small emitters: weigh LED, cabinet strip + LEDs, lamp cores */}
      <primitive object={built.pucks} />
      {/* weigh display screen (texture swaps) */}
      <group position={SCALE_DISPLAY} rotation={[SCALE_TILT, 0, 0]}>
        <mesh ref={scaleScreen} position={[0.03, 0.02, 0.047]} material={built.scaleScreen}>
          <planeGeometry args={[0.4, 0.15]} />
        </mesh>
      </group>

      <ScannerArch ref={arch} x={SCAN_X} beltTop={BELT_TOP} width={BELT_WIDTH} />
      <SorterRobot ref={robot} position={[ROBOT_X, 0, -1.35]} />

      {/* painted hazard lines along the line (floor is the warehouse's) */}
      <mesh geometry={built.hazardGeo} material={built.hazard} renderOrder={1} />

      {/* dust in the lamp cones */}
      <Particles count={360} spread={[34, 4, 8]} position={[20, 2.2, 0]} color="#ffb27a" size={0.8} opacity={0.5} seed={19} drift={[0.04, 0.03, 0]} />
    </group>
  )
}
