'use client'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { Html, Text } from '@react-three/drei'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useStageFrame, useSceneReady, useInRange } from '@/hooks/useStage'
import { useApp, useTracking, TRACK_STATUSES } from '@/lib/stores'
import { STUDIO_X } from '@/lib/timeline'
import { clamp, damp, lerp, range, smoothstep } from '@/lib/math'
import { easeOutBack, easeOutCubic } from '@/lib/easing'
import { audio } from '@/lib/audio'
import { useT } from '@/translations'
import { MiniBox } from '../models/MiniBox'
import { BOX_SIZE } from '../models/TujjorBox'
import { Podium } from '../models/Podium'
import { Particles } from '../fx/Particles'
import { GlowLine } from '../fx/GlowLine'
import { contactShadowLayer } from '../fx/contactShadowLayer'
import type { SceneProps } from './types'
export { cameraAt, lights } from './TrackingScene.camera'

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */
const X0 = STUDIO_X.tracking // 60 — studio station centre (local space of world D)
const N = TRACK_STATUSES.length // 7 stations
const SPAN = 10 // route spans x 55 … 65
const ORANGE = '#ff6a00'
const BONE = '#f2efe9'
const BOX_LIFT = 0.22 // mini-box centre above the route line (bottom floats ≈ 0.11 u above it)
const BOX_K = 0.3 / BOX_SIZE[0] // MiniBox size 0.3 → scale of the shared BOX_SIZE
/** layer the two podiums' contact-shadow cameras render: only the visible casters are on it */
const SHADOW_LAYER = 3

/** Station i on the route: gentle S in z (front → back), a soft arch in y (.6 at both ends, 1.2 in transit). */
function stationPoint(i: number): THREE.Vector3 {
  const u = i / (N - 1)
  return new THREE.Vector3(X0 - SPAN / 2 + u * SPAN, 0.6 + 0.6 * Math.sin(u * Math.PI), 0.9 * Math.sin(u * Math.PI * 2))
}

/** Radial greyscale gradient (green channel → alphaMap): soft floor pool / contact blob. */
function radialAlpha(size: number, stops: [number, string][]): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [o, col] of stops) grad.addColorStop(o, col)
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(c)
}

/* reusable temporaries — never allocate per frame */
const _m = new THREE.Matrix4()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _c = new THREE.Color()
const _pt = new THREE.Vector3()
const Q_ID = new THREE.Quaternion()
const Q_FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)

type NodeState = 'done' | 'current' | 'future' | 'waiting'

/**
 * §12 TRACKING — a curved route with 7 station nodes across the studio at x = 60. The mini-box rides the
 * line to the current status (demo animates 0 → 3); with no status it waits at the first station under a
 * breathing ring. The glow line builds up to the box, stations light up bone (done) / orange (current) / dim (future).
 * Choreography: t .04–.4 stations rise from the floor one after another as the camera arrives; t .3–.6 hold
 * (panel); labels leave after the stage ends. Tracking state is read from the store each frame — no subscriptions.
 */
export default function TrackingScene({ stage }: SceneProps) {
  const t = useT()
  const inRange = useInRange(stage)
  const setCursor = useApp((s) => s.setCursor)

  /* ---- refs ---- */
  const root = useRef<THREE.Group>(null!)
  const discs = useRef<THREE.InstancedMesh>(null!) // disc + bevel lip merged (vertex-coloured)
  const cores = useRef<THREE.InstancedMesh>(null!)
  const rings = useRef<THREE.InstancedMesh>(null!)
  const stems = useRef<THREE.InstancedMesh>(null!)
  const feet = useRef<THREE.InstancedMesh>(null!)
  const pulses = useRef<THREE.InstancedMesh>(null!) // 2 expanding rings, opacity folded into instanceColor (additive)
  const boxGroup = useRef<THREE.Group>(null!)
  const blob = useRef<THREE.Mesh>(null!)
  const glowGroup = useRef<THREE.Group>(null!)
  const labels = useRef<(HTMLDivElement | null)[]>([])
  const hover = useRef(-1)
  const inst = useRef([discs, cores, rings, stems, feet])
  /* per-frame scratch state (mutable, no React) */
  const st = useRef({
    reveal: new Float32Array(N),
    labelO: new Float32Array(N).fill(-1),
    labelState: new Array<NodeState | null>(N).fill(null),
    lastCur: -2,
    lastHover: -2,
    lastPos: -1,
    lastLt: -1,
    lastLeave: -1,
    revealAll: 0,
    pulseColor: new THREE.Color(ORANGE),
    labelCur: -3,
    labelHov: -3,
    labelsFresh: true,
    lastPi: -1,
    lean: 0,
    glow: { head: 0, opacity: 0 },
    ticked: -1,
  })

  /* ---- route geometry (once) ---- */
  const route = useMemo(() => {
    const stations = Array.from({ length: N }, (_, i) => stationPoint(i))
    const curve = new THREE.CatmullRomCurve3(stations, false, 'centripetal')
    // getPointAt() is arc-length parametrised while control point i sits at curve param i/(N−1):
    // precompute each station's arc-length fraction so integer positions land exactly on the nodes.
    const DIV = 600
    const lengths = curve.getLengths(DIV)
    const total = lengths[DIV]
    const stationS = stations.map((_, i) => lengths[Math.round((i / (N - 1)) * DIV)] / total)
    // dense samples for the GlowLine (it rebuilds a CatmullRom from them → same shape as `curve`)
    const dense = curve.getSpacedPoints(96)
    const floorPts = dense.map((p) => new THREE.Vector3(p.x, 0.012, p.z))
    // faint bone base line + its floor projection: ONE geometry, per-vertex alpha (1 vs .1/.32) × material opacity
    const baseGeo = new THREE.TubeGeometry(curve, 180, 0.008, 5, false)
    const floorGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(floorPts), 120, 0.005, 4, false)
    for (const [g, a] of [
      [baseGeo, 1],
      [floorGeo, 0.1 / 0.32],
    ] as [THREE.BufferGeometry, number][]) {
      g.deleteAttribute('uv')
      g.deleteAttribute('normal')
      const n = g.getAttribute('position').count
      const col = new Float32Array(n * 4)
      for (let i = 0; i < n; i++) col.set([1, 1, 1, a], i * 4)
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4))
    }
    const lineGeo = mergeGeometries([baseGeo, floorGeo], false)!
    baseGeo.dispose()
    floorGeo.dispose()
    return { stations, curve, stationS, dense, lineGeo }
  }, [])

  const geos = useMemo(() => {
    // station disc + its bevel lip merged into one vertex-coloured geometry (segment counts sized for ≈40 px on screen)
    const disc = new THREE.CylinderGeometry(0.17, 0.145, 0.04, 28)
    const bevel = new THREE.TorusGeometry(0.162, 0.012, 6, 28)
    bevel.rotateX(-Math.PI / 2)
    bevel.translate(0, 0.02, 0)
    for (const [g, hex] of [
      [disc, '#1c1f27'],
      [bevel, '#3b404b'],
    ] as [THREE.BufferGeometry, string][]) {
      g.deleteAttribute('uv')
      const n = g.getAttribute('position').count
      const col = new Float32Array(n * 3)
      _c.set(hex)
      for (let i = 0; i < n; i++) _c.toArray(col, i * 3)
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    }
    const discGeo = mergeGeometries([disc, bevel], false)!
    disc.dispose()
    bevel.dispose()
    // shadow proxy for the 6-material MiniBox (one draw in the shadow / contact-shadow passes)
    const proxy = new THREE.BoxGeometry(BOX_SIZE[0] * BOX_K, BOX_SIZE[1] * BOX_K, BOX_SIZE[2] * BOX_K)
    return {
      disc: discGeo,
      core: new THREE.CylinderGeometry(0.07, 0.07, 0.012, 20),
      ring: new THREE.TorusGeometry(0.27, 0.007, 4, 36),
      stem: new THREE.CylinderGeometry(0.007, 0.011, 1, 6),
      foot: new THREE.RingGeometry(0.1, 0.13, 28),
      pulse: new THREE.RingGeometry(0.2, 0.235, 40),
      blob: new THREE.PlaneGeometry(0.9, 0.9),
      floor: new THREE.CircleGeometry(16, 48),
      proxy,
    }
  }, [])
  const mats = useMemo(() => {
    const poolAlpha = radialAlpha(256, [
      [0, '#ffffff'],
      [0.45, '#8a8a8a'],
      [1, '#000000'],
    ])
    const blobAlpha = radialAlpha(128, [
      [0, '#ffffff'],
      [0.35, '#666666'],
      [1, '#000000'],
    ])
    return {
      floor: new THREE.MeshStandardMaterial({ color: '#12141a', roughness: 0.95, metalness: 0, transparent: true, alphaMap: poolAlpha, depthWrite: false }),
      // base line + floor projection (vertex alpha carries the .32 / .1 split)
      line: new THREE.MeshBasicMaterial({ color: BONE, toneMapped: false, transparent: true, opacity: 0, depthWrite: false, vertexColors: true }),
      disc: new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.3, metalness: 0.8 }),
      stem: new THREE.MeshStandardMaterial({ color: '#2c3038', roughness: 0.4, metalness: 0.85 }),
      // per-instance HDR colour (instanceColor) encodes the node state
      core: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
      ring: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      foot: new THREE.MeshBasicMaterial({ color: BONE, toneMapped: false, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }),
      // additive: colour × alpha is all that reaches the framebuffer, so the per-ring opacity lives in instanceColor
      pulse: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      tether: new THREE.MeshBasicMaterial({ color: '#ff8a2a', toneMapped: false, transparent: true, opacity: 0.55, depthWrite: false }),
      blob: new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.32, alphaMap: blobAlpha, depthWrite: false }),
      word: new THREE.MeshBasicMaterial({ color: BONE, toneMapped: false, transparent: true, opacity: 0.12, depthWrite: false }),
      // draws nothing in the colour pass; 1 draw in the key-light shadow map + each contact-shadow pass
      proxy: new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
      poolAlpha,
      blobAlpha,
    }
  }, [])
  useEffect(
    () => () => {
      for (const g of Object.values(geos)) g.dispose()
      route.lineGeo.dispose()
      for (const m of Object.values(mats)) m.dispose()
    },
    [geos, mats, route],
  )
  useSceneReady(stage.id)

  // the podiums' contact-shadow cameras only see SHADOW_LAYER (re-applied whenever ContactShadows remounts)
  const tier = useApp((s) => s.tier)
  useEffect(() => contactShadowLayer(root.current, SHADOW_LAYER), [inRange, tier])

  /* GlowLine reads head/opacity from props each frame; onBeforeRender runs after that and wins (no React state per frame). */
  useEffect(() => {
    const g = glowGroup.current
    if (!g) return
    const meshes = g.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh)
    const glow = st.current.glow
    meshes.forEach((m, i) => {
      const mul = i === 0 ? 1 : 0.22 // bright core + soft halo
      m.layers.enable(SHADOW_LAYER)
      m.onBeforeRender = () => {
        const u = (m.material as THREE.ShaderMaterial).uniforms
        u.uHead.value = glow.head
        u.uOpacity.value = glow.opacity * mul
      }
    })
    return () => {
      for (const m of meshes) m.onBeforeRender = () => {}
    }
  }, [])

  /* initial instance colours (all future) so the first compiled program already has USE_INSTANCING_COLOR */
  useEffect(() => {
    for (const im of [cores.current, rings.current]) {
      if (!im) continue
      for (let i = 0; i < N; i++) im.setColorAt(i, _c.set(BONE).multiplyScalar(0.12))
      if (im.instanceColor) im.instanceColor.needsUpdate = true
    }
    const pm = pulses.current
    if (pm) {
      for (let j = 0; j < 2; j++) {
        pm.setColorAt(j, _c.set(0, 0, 0))
        pm.setMatrixAt(j, _m.compose(_p.set(0, 0, 0), Q_FLAT, _s.setScalar(1e-4)))
      }
      if (pm.instanceColor) pm.instanceColor.needsUpdate = true
      pm.instanceMatrix.needsUpdate = true
    }
  }, [])

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    hover.current = e.instanceId ?? -1
    setCursor('explore')
  }
  const onOut = () => {
    hover.current = -1
    setCursor('default')
  }

  useStageFrame(stage, ({ t: lt, tu, dt, time }) => {
    const s = st.current
    const trk = useTracking.getState()
    const pos = trk.position
    const { stations, stationS, curve } = route

    /* 1 · reveal — stations rise one after another as the camera arrives (t .04–.4); everything is hidden in pre-roll.
       All of it depends on t only → skipped entirely while the scroll position is unchanged. */
    const ltChanged = lt !== s.lastLt
    if (ltChanged) {
      s.lastLt = lt
      let revealChanged = false
      let anyVisible = false
      let sumReveal = 0
      for (let i = 0; i < N; i++) {
        const a = 0.04 + i * 0.045
        const r = clamp(easeOutBack(range(lt, a, a + 0.13)), 0, 1.12)
        if (Math.abs(r - s.reveal[i]) > 1e-4) {
          s.reveal[i] = r
          revealChanged = true
        }
        if (r > 0.001) anyVisible = true
        sumReveal += Math.min(1, r)
      }
      s.revealAll = sumReveal / N
      if (revealChanged) {
        for (let i = 0; i < N; i++) {
          const p = stations[i]
          const r = s.reveal[i]
          const ro = Math.min(1, r)
          // disc (+ lip) / core / ring scale in at the station point
          _s.setScalar(Math.max(1e-4, r))
          _m.compose(_p.copy(p), Q_ID, _s)
          discs.current.setMatrixAt(i, _m)
          _m.compose(_p.set(p.x, p.y + 0.026, p.z), Q_ID, _s)
          cores.current.setMatrixAt(i, _m)
          _m.compose(_p.copy(p), Q_FLAT, _s)
          rings.current.setMatrixAt(i, _m)
          // stem grows from the floor up to the disc
          const h = Math.max(1e-4, p.y * easeOutCubic(ro))
          _m.compose(_p.set(p.x, h / 2, p.z), Q_ID, _s.set(1, h, 1))
          stems.current.setMatrixAt(i, _m)
          _m.compose(_p.set(p.x, 0.006, p.z), Q_FLAT, _s.setScalar(Math.max(1e-4, ro)))
          feet.current.setMatrixAt(i, _m)
        }
        for (const im of inst.current) {
          im.current.instanceMatrix.needsUpdate = true
          im.current.computeBoundingSphere()
        }
      }
      const lineIn = smoothstep(0.02, 0.3, lt)
      mats.line.opacity = 0.32 * lineIn
      for (const im of inst.current) im.current.visible = anyVisible
    }
    const revealAll = s.revealAll

    /* 2 · station state: current = nearest node to the box; −1 = unknown (waiting at the first station) */
    const cur = pos < 0 ? -1 : clamp(Math.round(pos), 0, N - 1)
    const hov = hover.current
    if (cur !== s.lastCur || hov !== s.lastHover) {
      for (let i = 0; i < N; i++) {
        const state: NodeState = cur < 0 ? (i === 0 ? 'waiting' : 'future') : i < cur ? 'done' : i === cur ? 'current' : 'future'
        const hl = i === hov ? 1.6 : 1
        // core (opaque emissive top) — HDR values feed the bloom
        if (state === 'current') _c.set(ORANGE).multiplyScalar(2.6 * hl)
        else if (state === 'done') _c.set(BONE).multiplyScalar(1.0 * hl)
        else if (state === 'waiting') _c.set('#ffb070').multiplyScalar(0.7 * hl)
        else _c.set(BONE).multiplyScalar(0.12 * hl)
        cores.current.setColorAt(i, _c)
        // outer ring (additive) — quieter
        if (state === 'current') _c.set(ORANGE).multiplyScalar(1.7 * hl)
        else if (state === 'done') _c.set(BONE).multiplyScalar(0.38 * hl)
        else if (state === 'waiting') _c.set('#ffb070').multiplyScalar(0.45 * hl)
        else _c.set(BONE).multiplyScalar(0.1 * hl)
        rings.current.setColorAt(i, _c)
      }
      if (cores.current.instanceColor) cores.current.instanceColor.needsUpdate = true
      if (rings.current.instanceColor) rings.current.instanceColor.needsUpdate = true
      // pulse colour: orange at a known station, faint warm bone while waiting
      s.pulseColor.set(cur < 0 ? '#ffb070' : ORANGE)
      // soft tick when the box reaches a new station (never on the initial unknown state)
      if (cur >= 0 && s.lastCur >= 0 && cur !== s.lastCur && cur !== s.ticked) {
        s.ticked = cur
        audio.click(cur > s.lastCur ? 1400 : 1000)
      }
      s.lastCur = cur
      s.lastHover = hov
    }

    /* 3 · mini-box: waits at station 1 (breathing) or rides the curve to `position` with a hover bob and a lean into motion */
    const vel = dt > 0 ? (pos - s.lastPos) / dt : 0
    s.lastPos = pos
    const moving = pos >= 0 && Math.abs(vel) > 1e-3
    s.lean = damp(s.lean, moving ? clamp(-vel * 0.28, -0.32, 0.32) : 0, 6, dt)
    // arc-length fraction of the box along the curve (integer positions land exactly on the station nodes)
    let sBox = 0
    if (pos < 0) {
      _pt.copy(stations[0])
    } else {
      const k = clamp(Math.floor(pos), 0, N - 2)
      sBox = lerp(stationS[k], stationS[k + 1], clamp(pos - k, 0, 1))
      curve.getPointAt(sBox, _pt)
    }
    const bob = pos < 0 ? Math.sin(time * 1.6) * 0.015 : Math.sin(time * 2.2) * 0.03
    const r0 = Math.min(1, s.reveal[0])
    boxGroup.current.position.set(_pt.x, _pt.y + bob, _pt.z)
    boxGroup.current.rotation.set(Math.sin(time * 0.6) * 0.02, Math.sin(time * 0.4) * 0.08, s.lean)
    const breathe = pos < 0 ? 1 + Math.sin(time * 1.6) * 0.025 : 1
    boxGroup.current.scale.setScalar(Math.max(1e-4, r0 * breathe))
    boxGroup.current.visible = r0 > 0.001
    // contact blob on the floor under the box (fainter the higher it flies)
    blob.current.position.set(_pt.x, 0.016, _pt.z)
    mats.blob.opacity = 0.34 * r0 * (1 - (_pt.y - 0.6) * 0.45)
    blob.current.visible = r0 > 0.001

    /* 4 · pulse rings at the current station (or the waiting ring at station 1): two expanding rings half a cycle apart */
    const pi = cur < 0 ? 0 : cur
    const ps = stations[pi]
    const rate = cur < 0 ? (trk.loading ? 1.2 : 0.42) : 0.6
    const rp = Math.min(1, s.reveal[pi])
    const amp = cur < 0 ? 0.42 : 0.75
    const pm = pulses.current
    if (pi !== s.lastPi) {
      // the rings expand to ≈ 0.61 u around the station: keep a generous bounding sphere there for frustum culling
      s.lastPi = pi
      pm.boundingSphere ??= new THREE.Sphere()
      pm.boundingSphere.center.copy(ps)
      pm.boundingSphere.radius = 0.7
    }
    for (let j = 0; j < 2; j++) {
      const ph = (time * rate + j * 0.5) % 1
      _s.setScalar(Math.max(1e-4, (0.7 + ph * 1.9) * rp))
      pm.setMatrixAt(j, _m.compose(_p.set(ps.x, ps.y + 0.03 + j * 0.004, ps.z), Q_FLAT, _s))
      pm.setColorAt(j, _c.copy(s.pulseColor).multiplyScalar(amp * rp * (1 - ph) * (1 - ph) * 0.9))
    }
    pm.instanceMatrix.needsUpdate = true
    if (pm.instanceColor) pm.instanceColor.needsUpdate = true
    pm.visible = rp > 0.001

    /* 5 · glow line builds up to the box; hidden while the status is unknown */
    const head = pos < 0 ? 0 : Math.max(0.015, sBox)
    s.glow.head = head
    s.glow.opacity = revealAll
    const gVisible = head > 0.001 && revealAll > 0.001
    for (const c of glowGroup.current.children) c.visible = gVisible

    /* 6 · labels (Html, in range only): chrome follows the node state (style writes only on change), fade with the reveal, leave once the stage is over */
    const leave = 1 - range(tu, 1.02, 1.1)
    const labelsDirty = ltChanged || leave !== s.lastLeave || cur !== s.labelCur || hov !== s.labelHov || s.labelsFresh
    if (!labelsDirty) return
    s.lastLeave = leave
    s.labelCur = cur
    s.labelHov = hov
    s.labelsFresh = false
    for (let i = 0; i < N; i++) {
      const el = labels.current[i]
      if (!el) continue
      const ls: NodeState = i === hov ? 'current' : cur < 0 ? (i === 0 ? 'waiting' : 'future') : i < cur ? 'done' : i === cur ? 'current' : 'future'
      if (ls !== s.labelState[i]) {
        s.labelState[i] = ls
        el.style.color = ls === 'current' ? '#ff8a2a' : ls === 'future' ? 'rgba(242,239,233,.5)' : BONE
        el.style.borderColor = ls === 'current' ? 'rgba(255,106,0,.7)' : ls === 'done' ? 'rgba(242,239,233,.3)' : ls === 'waiting' ? 'rgba(255,176,112,.35)' : 'rgba(242,239,233,.12)'
      }
      const base = ls === 'current' ? 1 : ls === 'done' ? 0.85 : ls === 'waiting' ? 0.75 : 0.5
      const o = Math.min(1, s.reveal[i]) * leave * base
      if (Math.abs(o - s.labelO[i]) > 0.004) {
        s.labelO[i] = o
        el.style.opacity = o.toFixed(3)
      }
    }
  })

  const first = route.stations[0]
  const last = route.stations[N - 1]
  /** ref callback: store + put the object on the contact-shadow layer */
  const sl =
    <T extends THREE.Object3D>(r?: React.MutableRefObject<T>) =>
    (m: T | null) => {
      if (!m) return
      if (r) r.current = m
      m.layers.enable(SHADOW_LAYER)
    }

  return (
    <group name="TrackingScene" ref={root}>
      {/* studio floor pool — soft-edged disc that catches the key light's shadows */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[X0, -0.02, 0]} geometry={geos.floor} material={mats.floor} receiveShadow renderOrder={-1} />
      {/* floor word — faint decal behind the route (static troika text, ASCII only) */}
      <Text font="/fonts/space-grotesk-700.woff" fontSize={1.7} letterSpacing={0.1} anchorX="center" anchorY="middle" rotation={[-Math.PI / 2, 0, 0]} position={[X0 + 0.6, 0.01, -3.6]}>
        TRACKING
        <primitive object={mats.word} attach="material" />
      </Text>

      {/* start / end podiums */}
      <Podium radius={1.2} inRange={inRange} position={[first.x, 0, first.z]} />
      <Podium radius={1.2} inRange={inRange} position={[last.x, 0, last.z]} />

      {/* route: faint bone base line + its floor projection (one mesh) + the orange energy line (core + halo) built up to the box */}
      <mesh ref={sl()} geometry={route.lineGeo} material={mats.line} />
      <group ref={glowGroup}>
        <GlowLine points={route.dense} radius={0.022} color="#ffb070" head={0} opacity={0} speed={0.45} pulses={4} tubularSegments={192} radialSegments={4} />
        <GlowLine points={route.dense} radius={0.075} color={ORANGE} head={0} opacity={0} speed={0.45} pulses={4} tubularSegments={192} radialSegments={4} />
      </group>

      {/* 7 station nodes — instanced: disc + bevel lip, emissive core, outer ring, stem, floor foot */}
      <instancedMesh
        ref={(m) => {
          discs.current = m!
          m?.layers.enable(1)
          m?.layers.enable(SHADOW_LAYER)
        }}
        args={[geos.disc, mats.disc, N]}
        castShadow
        receiveShadow
        onPointerOver={onOver}
        onPointerOut={onOut}
      />
      <instancedMesh ref={cores} args={[geos.core, mats.core, N]} />
      <instancedMesh ref={sl(rings)} args={[geos.ring, mats.ring, N]} />
      <instancedMesh ref={sl(stems)} args={[geos.stem, mats.stem, N]} castShadow />
      <instancedMesh ref={sl(feet)} args={[geos.foot, mats.foot, N]} />
      {/* current-station pulse (two rings, half a cycle apart) — one InstancedMesh */}
      <instancedMesh ref={sl(pulses)} args={[geos.pulse, mats.pulse, 2]} />

      {/* the cargo — mini-box hovering over the line with a thin orange tether down to it */}
      <group ref={boxGroup}>
        <MiniBox ref={(m) => void (m && (m.castShadow = false))} size={0.3} position={[0, BOX_LIFT, 0]} emissive={0.08} />
        {/* shadow proxy for the 6-material MiniBox */}
        <mesh ref={sl()} geometry={geos.proxy} material={mats.proxy} position={[0, BOX_LIFT, 0]} castShadow />
        <mesh position={[0, 0.075, 0]} material={mats.tether}>
          <cylinderGeometry args={[0.004, 0.004, 0.12, 4]} />
        </mesh>
      </group>
      <mesh ref={sl(blob)} geometry={geos.blob} material={mats.blob} rotation={[-Math.PI / 2, 0, 0]} />

      {/* station labels — English status; alternate above / below the disc so they never collide in perspective */}
      {inRange
        ? route.stations.map((p, i) => (
            <Html key={TRACK_STATUSES[i]} position={[p.x, p.y + (i % 2 === 0 ? 0.62 : -0.34), p.z]} center zIndexRange={[9, 1]} style={{ pointerEvents: 'none' }}>
              <div
                ref={(el) => {
                  labels.current[i] = el
                  // fresh element after a remount → re-apply chrome and opacity on the next frame
                  st.current.labelState[i] = null
                  st.current.labelO[i] = -1
                  st.current.labelsFresh = true
                }}
                style={{
                  opacity: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  whiteSpace: 'nowrap',
                  padding: '5px 11px 5px 9px',
                  borderRadius: 999,
                  background: 'rgba(11,12,15,.78)',
                  border: '1px solid rgba(242,239,233,.12)',
                  color: 'rgba(242,239,233,.5)',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 600,
                  fontSize: 11,
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                  fontVariantNumeric: 'tabular-nums',
                  backdropFilter: 'blur(6px)',
                  WebkitBackdropFilter: 'blur(6px)',
                  transition: 'color .3s, border-color .3s',
                }}
              >
                <span style={{ fontSize: 9, opacity: 0.7 }}>{String(i + 1).padStart(2, '0')}</span>
                <span>{t.tracking.statuses[TRACK_STATUSES[i]]}</span>
              </div>
            </Html>
          ))
        : null}

      {/* studio dust */}
      <Particles count={300} spread={[16, 5, 10]} position={[X0, 2.4, 0]} color="#ffd6b0" size={0.7} opacity={0.35} seed={17} speed={0.05} drift={[0, 0.03, 0]} />
    </group>
  )
}
