'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Html, Text } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useStageFrame, useSceneReady, useInRange } from '@/hooks/useStage'
import { scroll, useApp, useNetwork } from '@/lib/stores'
import { PROFILES } from '@/lib/quality'
import { cameraOffsets, type CameraCtx } from '@/lib/camera'
import { audio } from '@/lib/audio'
import { easeOutBack, easeOutCubic } from '@/lib/easing'
import { damp, range } from '@/lib/math'
import { localTU } from '@/lib/timeline'
import { useT } from '@/translations'
import { CENTER_POS, CENTER_RING_R, NETWORK_LINKS, NETWORK_NODES, NETWORK_NODE_BY_ID, NODE_LINKS, POP_DUR, type NetworkNodeDef, type NetworkNodeId } from '@/config/network'
import { TujjorBox, BOX_SIZE, type TujjorBoxHandle } from '../models/TujjorBox'
import { Podium } from '../models/Podium'
import { NetworkNodes, makeNodeMats, type NetworkNodesHandle } from '../models/NetworkNode'
import { Particles } from '../fx/Particles'
import { GridFloor } from '../fx/GridFloor'
import { NetworkLinks, type NetworkLinksHandle } from '../fx/NetworkLinks'
import { contactShadowLayer } from '../fx/contactShadowLayer'
import type { SceneProps } from './types'
import { cameraAt } from './NetworkScene.camera'
export { cameraAt, lights } from './NetworkScene.camera'

const FONT = '/fonts/space-grotesk-700.woff'
const ORANGE = new THREE.Color('#ff6a00')
const N_LINKS = NETWORK_LINKS.length
/**
 * The podium's contact-shadow camera only sees this layer (same convention as Calculator / Tracking / Final):
 * opt-in casters = the box proxy + the tilted gyro ring (the only hub part whose arc crosses the 3×3 shadow plane).
 * Nodes, links, hub ring/ticks, labels, ONE LINE, grid and particles never touch its pixels → they skip the pass.
 */
const SHADOW_LAYER = 3
/** HDR rim multipliers (bloom threshold .85 — only the hovered/selected node blooms) */
const RIM_IDLE = 2.2
const RIM_HOT = 3.4
const RIM_DIM = 1.5
/** link opacities: idle / hovered node's links / the rest while something is hovered */
const LINK_IDLE = 0.75
const LINK_HOT = 1
const LINK_DIM = 0.35

/** Curved link between two anchor points: 4 control points with a gentle lift, ends pulled back to the disc rims. */
function linkPoints(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3[] {
  const len = a.distanceTo(b)
  const lift = 0.16 + len * 0.02
  const p1 = new THREE.Vector3().lerpVectors(a, b, 0.33)
  const p2 = new THREE.Vector3().lerpVectors(a, b, 0.66)
  p1.y += lift
  p2.y += lift
  return [a.clone(), p1, p2, b.clone()]
}

/**
 * §09 NETWORK — the studio box at the origin; the camera pulls back from its brand face (match-cut)
 * and the logistics graph unfolds around it with a staggered scale-pop: 6 marketplaces on an arc to
 * the left, the route chain to the right (China warehouse → Uzbekistan → Chirchiq → Business / Customer).
 * Glass-token nodes (layer 1) + energy links; hover = camera nudge toward the node + highlight, click =
 * <Html> card. The orange ONE-LINE floor line and the studio grid for all world-D stations live here.
 */
export default function NetworkScene({ stage }: SceneProps) {
  const tier = useApp((s) => s.tier)
  const profile = PROFILES[tier]
  const inRange = useInRange(stage)
  const selected = useNetwork((s) => s.selected)
  const t = useT()

  const box = useRef<TujjorBoxHandle>(null)
  const hub = useRef<THREE.Group>(null!)
  const spinA = useRef<THREE.Group>(null!)
  const spinB = useRef<THREE.Group>(null!)
  const nodes = useRef<NetworkNodesHandle>(null)
  const linksHandle = useRef<NetworkLinksHandle | null>(null)
  const halosHandle = useRef<NetworkLinksHandle | null>(null)
  const hubLabel = useRef<THREE.Group>(null!)
  const root = useRef<THREE.Group>(null!)

  /* ---------- static build (once) ---------- */
  const mats = useMemo(() => makeNodeMats(), [])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  const hubMats = useMemo(
    () => ({
      ring: new THREE.MeshBasicMaterial({ color: ORANGE.clone().multiplyScalar(2.6), toneMapped: false }),
      ringB: new THREE.MeshBasicMaterial({ color: '#f2efe9', transparent: true, opacity: 0.3, depthWrite: false }),
      tick: new THREE.MeshBasicMaterial({ color: ORANGE.clone().multiplyScalar(1.8), toneMapped: false }),
      line: new THREE.MeshBasicMaterial({ color: ORANGE.clone().multiplyScalar(2.4), toneMapped: false }),
      lineHalo: new THREE.MeshBasicMaterial({ color: ORANGE, toneMapped: false, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending }),
      /** contact-shadow proxy of the closed box (never drawn by the main / light cameras — SHADOW_LAYER only) */
      proxy: new THREE.MeshBasicMaterial({ color: '#000000' }),
    }),
    [],
  )
  useEffect(() => () => Object.values(hubMats).forEach((m) => m.dispose()), [hubMats])
  // restrict the podium's contact-shadow depth pass to SHADOW_LAYER (re-applied whenever the Podium remounts it)
  useEffect(() => contactShadowLayer(root.current, SHADOW_LAYER), [inRange, tier])
  /** tick marks around the centre ring — one instanced mesh, matrices set once */
  const tickCount = 36
  const tickMatrices = useMemo(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const p = new THREE.Vector3()
    const s = new THREE.Vector3(1, 1, 1)
    const arr: THREE.Matrix4[] = []
    for (let i = 0; i < tickCount; i++) {
      const a = (i / tickCount) * Math.PI * 2
      p.set(Math.cos(a) * CENTER_RING_R, 0, Math.sin(a) * CENTER_RING_R)
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a)
      s.set(1, i % 6 === 0 ? 2.2 : 1, 1)
      arr.push(m.clone().compose(p, q, s))
    }
    return arr
  }, [])
  /** link curves (local space) */
  const links = useMemo(() => {
    const center = new THREE.Vector3(...CENTER_POS)
    const posOf = (id: NetworkNodeId | 'center', other: NetworkNodeId | 'center'): THREE.Vector3 => {
      if (id === 'center') {
        const o = NETWORK_NODES.find((n) => n.id === other)!
        const d = new THREE.Vector3(o.position[0] - center.x, 0, o.position[2] - center.z).normalize()
        return center.clone().addScaledVector(d, CENTER_RING_R)
      }
      const n = NETWORK_NODES.find((x) => x.id === id)!
      const oPos = other === 'center' ? center : new THREE.Vector3(...NETWORK_NODES.find((x) => x.id === other)!.position)
      const d = new THREE.Vector3(oPos.x - n.position[0], 0, oPos.z - n.position[2]).normalize()
      return new THREE.Vector3(...n.position).addScaledVector(d, n.r * 0.55)
    }
    return NETWORK_LINKS.map((l) => ({ ...l, points: linkPoints(posOf(l.from, l.to), posOf(l.to, l.from)) }))
  }, [])
  /** per-link live state written in useStageFrame, read directly by the merged link shaders (uniform arrays) */
  const linkHead = useMemo(() => new Float32Array(N_LINKS), [])
  const linkAlpha = useMemo(() => new Float32Array(N_LINKS).fill(LINK_IDLE), [])
  const linkCurves = useMemo(() => ({ all: links.map((l) => l.points), allIdx: links.map((_, i) => i), main: links.filter((l) => l.main).map((l) => l.points), mainIdx: links.map((l, i) => (l.main ? i : -1)).filter((i) => i >= 0) }), [links])

  /* ---------- per-frame scratch (no allocations in the loop) ---------- */
  const tmp = useMemo(
    () => ({
      v: new THREE.Vector3(),
      scale: new Float32Array(NETWORK_NODES.length).fill(1),
      hubScale: 0,
      // last frame's inputs — the loop is skipped when none of them moved and every damped value has settled
      t: -1,
      tu: -1,
      time: -1,
      hov: null as NetworkNodeId | null,
      sel: null as NetworkNodeId | null,
      settling: true,
    }),
    [],
  )
  useSceneReady(stage.id)

  /* ---------- interaction (3D side; the DOM list mirrors it through the same store) ---------- */
  const nearLocal = () => {
    const tu = localTU(scroll.pd, stage)
    return tu >= 0 && tu <= 1.05
  }
  const onOver = (i: number, e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (!nearLocal()) return
    useNetwork.getState().setHovered(NETWORK_NODES[i].id)
    useApp.getState().setCursor('explore')
  }
  const onOut = (i: number, e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const s = useNetwork.getState()
    if (s.hovered === NETWORK_NODES[i].id) s.setHovered(null)
    useApp.getState().setCursor('default')
  }
  const onClick = (i: number, e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (!nearLocal()) return
    const id = NETWORK_NODES[i].id
    const s = useNetwork.getState()
    s.setSelected(s.selected === id ? null : id)
    audio.click(1400)
  }

  useStageFrame(stage, ({ t: tt, tu, dt, time, state }) => {
    const net = useNetwork.getState()
    const active = tu >= -0.05 && tu <= 1.08
    // leaving the stage drops hover / selection (once) so the card and camera nudge never linger
    if (!active && (net.hovered || net.selected)) {
      net.setHovered(null)
      net.setSelected(null)
      if (useApp.getState().cursor === 'explore') useApp.getState().setCursor('default')
    }
    const hov = active ? (net.hovered as NetworkNodeId | null) : null
    const sel = active ? (net.selected as NetworkNodeId | null) : null
    const focus = hov ?? sel

    // ---- nothing moved (scroll, clock, hover / selection) and every damped value has settled → skip the frame
    // (the clock only stands still with reduced motion; otherwise the idle bob / spin keeps running by design)
    if (tt === tmp.t && tu === tmp.tu && time === tmp.time && hov === tmp.hov && sel === tmp.sel && !tmp.settling) return
    tmp.t = tt
    tmp.tu = tu
    tmp.time = time
    tmp.hov = hov
    tmp.sel = sel
    let settling = false

    // ---- link pulse clock: base + 0.5·|v| (docs §14.10), frozen with reduced motion
    if (!useApp.getState().motionOff) {
      const adv = Math.min(dt, 0.05) * (1 + 0.5 * Math.abs(scroll.velocity))
      linksHandle.current?.tick(adv)
      halosHandle.current?.tick(adv)
    }

    // ---- centre box: exact match-cut pose at t=0, then a soft studio hover ----
    const b = box.current
    const idle = range(tt, 0.08, 0.35)
    if (b) {
      b.group.position.set(0, CENTER_POS[1] + Math.sin(time * 1.3) * 0.025 * idle, 0)
      b.group.rotation.set(Math.sin(time * 0.5) * 0.015 * idle, Math.sin(time * 0.35) * 0.06 * idle, 0)
    }
    // ---- hub rings: scale-pop, then slow counter-rotation ----
    const hs = easeOutBack(range(tt, 0.02, 0.14))
    if (Math.abs(hs - tmp.hubScale) > 1e-4) {
      tmp.hubScale = hs
      hub.current.scale.setScalar(Math.max(1e-4, hs))
      hub.current.visible = hs > 0.001
      hubLabel.current.visible = hs > 0.001
      hubLabel.current.scale.setScalar(Math.max(1e-4, hs))
    }
    spinA.current.rotation.y = time * 0.12
    spinB.current.rotation.y = -time * 0.08
    spinB.current.rotation.x = Math.PI / 2 + 0.22 + Math.sin(time * 0.3) * 0.05

    // ---- nodes: staggered scale-pop (t), hover scale (damped), y-billboard toward the camera ----
    const h = nodes.current
    if (h) {
      const cam = state.camera.position
      const wm = root.current.matrixWorld // nodes are authored in local space; the camera lives in world space
      for (let i = 0; i < NETWORK_NODES.length; i++) {
        const n = NETWORK_NODES[i]
        const popS = easeOutBack(range(tt, n.pop, n.pop + POP_DUR))
        const isFocus = focus === n.id
        const want = isFocus ? 1.15 : 1
        const prev = tmp.scale[i]
        tmp.scale[i] = damp(prev, want, 10, dt)
        if (Math.abs(tmp.scale[i] - want) > 1e-4) settling = true
        const s = popS * tmp.scale[i]
        const bob = Math.sin(time * 1.1 + i * 0.9) * 0.035 * popS
        // face the camera around Y only (discs stay upright)
        tmp.v.set(n.position[0], 0, n.position[2]).applyMatrix4(wm)
        const yaw = Math.atan2(cam.x - tmp.v.x, cam.z - tmp.v.z)
        h.set(i, n.position[0], n.position[1] + bob, n.position[2], yaw, s)
        // emissive / dim state
        const pulse = Math.sin(time * 2 + i) * 0.08
        h.setRim(i, isFocus ? RIM_HOT : focus ? RIM_DIM : RIM_IDLE + pulse)
        h.setDim(i, isFocus || !focus ? 1 : 0.45)
      }
      h.commit()
    }
    // ---- links: build-up follows the unfold; hovered node's links glow, the rest dim ----
    const hotLinks = focus ? NODE_LINKS[focus] : null
    for (let i = 0; i < N_LINKS; i++) {
      const l = NETWORK_LINKS[i]
      linkHead[i] = easeOutCubic(range(tt, l.build, l.build + 0.12))
      const wantA = hotLinks ? (hotLinks.includes(i) ? LINK_HOT : LINK_DIM) : LINK_IDLE
      linkAlpha[i] = damp(linkAlpha[i], wantA, 8, dt)
      if (Math.abs(linkAlpha[i] - wantA) > 1e-4) settling = true
    }
    tmp.settling = settling
    // ---- camera nudge: 0.4 u from the camera target toward the hovered node (world dir = local dir) ----
    if (hov) {
      const app = useApp.getState()
      const ctx: CameraCtx = {
        aspect: state.size.width / Math.max(1, state.size.height),
        isPortrait: state.size.height > state.size.width,
        isShort: state.size.height < 500,
        isMobile: app.isMobile,
        isCoarse: app.isTouch,
        offset: 0,
        motionOff: app.motionOff,
      }
      const pose = cameraAt(tt, ctx)
      const n = NETWORK_NODE_BY_ID[hov]
      tmp.v.set(n.position[0] - pose.target[0], n.position[1] - pose.target[1], n.position[2] - pose.target[2]).normalize().multiplyScalar(0.4)
      cameraOffsets.hover[0] = tmp.v.x
      cameraOffsets.hover[1] = tmp.v.y
      cameraOffsets.hover[2] = tmp.v.z
      cameraOffsets.hoverActive = true
    } else if (cameraOffsets.hoverActive) {
      cameraOffsets.hoverActive = false
    }
  })

  const setSelected = useNetwork((s) => s.setSelected)
  const cardFor = (n: NetworkNodeDef) =>
    inRange && selected === n.id ? <NodeCard node={n} text={t.network.cards[n.id]} closeLabel={t.nav.close} onClose={() => setSelected(null)} /> : null
  const card = (_: unknown, i: number) => cardFor(NETWORK_NODES[i])

  return (
    <group name="NetworkScene" ref={root}>
      {/* ONE LINE — the orange floor line from the hub to the final podium (x 0 → 80), shared by all studio stations */}
      <mesh position={[40, 0.005, 0]} material={hubMats.line}>
        <boxGeometry args={[80, 0.01, 0.03]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[40, 0.004, 0]} material={hubMats.lineHalo}>
        <planeGeometry args={[80, 0.5]} />
      </mesh>
      <GridFloor size={160} cell={1} fade={40} opacity={0.5} position={[40, 0, 0]} />

      {/* centre hub: studio box on a podium, HDR ring with ticks + a tilted bone gyro ring */}
      <Podium radius={1.15} inRange={inRange} position={[0, 0, 0]} />
      <TujjorBox ref={box} mode="static" position={CENTER_POS} rotation={[0, 0, 0]} tint={0}>
        {/* closed box seen from below = its bottom face → one proxy cube replaces the 10 panel/flap meshes in the contact-shadow pass */}
        <mesh ref={(m) => m?.layers.set(SHADOW_LAYER)} material={hubMats.proxy}>
          <boxGeometry args={BOX_SIZE} />
        </mesh>
      </TujjorBox>
      <group ref={hub} position={CENTER_POS} scale={0} visible={false}>
        <group ref={spinA}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={hubMats.ring}>
            <torusGeometry args={[CENTER_RING_R, 0.018, 10, 128]} />
          </mesh>
          <instancedMesh
            args={[undefined, undefined, tickCount]}
            material={hubMats.tick}
            ref={(m) => {
              if (!m) return
              tickMatrices.forEach((mat, i) => m.setMatrixAt(i, mat))
              m.instanceMatrix.needsUpdate = true
            }}
          >
            <boxGeometry args={[0.012, 0.05, 0.05]} />
          </instancedMesh>
        </group>
        <group ref={spinB} rotation={[Math.PI / 2 + 0.22, 0, 0]}>
          {/* the tilted ring's arc crosses the podium's shadow plane corners → keep it in the contact-shadow pass */}
          <mesh material={hubMats.ringB} ref={(m) => m?.layers.enable(SHADOW_LAYER)}>
            <torusGeometry args={[CENTER_RING_R + 0.2, 0.006, 6, 128]} />
          </mesh>
        </group>
      </group>
      <group ref={hubLabel} position={[0, 1.55, 0]} scale={0} visible={false}>
        <Text font={FONT} fontSize={0.3} letterSpacing={0.14} color="#f2efe9" anchorX="center" anchorY="bottom">
          {t.network.nodes.center}
        </Text>
        <Text font={FONT} fontSize={0.1} letterSpacing={0.22} color="#ffb070" fillOpacity={0.8} anchorX="center" anchorY="top" position={[0, -0.08, 0]}>
          HUB · ONE BOX · ONE LINE
        </Text>
      </group>

      {/* nodes — 5 instanced meshes + 2 merged anchors for all 11 tokens; labels stay troika Text */}
      <NetworkNodes ref={nodes} nodes={NETWORK_NODES} mats={mats} onPointerOver={onOver} onPointerOut={onOut} onClick={onClick} card={card} />

      {/* links — energy tubes with slow pulses (speed .4), all in one mesh; the main chain gets a wide soft halo mesh.
          4-sided tubes read ~8 % thinner than the old 5-sided ones (inscribed polygon), so the radii are scaled by 1.08. */}
      <NetworkLinks curves={linkCurves.all} index={linkCurves.allIdx} head={linkHead} alpha={linkAlpha} radius={0.0173} color="#ff8a2a" speed={0.4} pulses={3} opacity={1} tubularSegments={24} radialSegments={4} handleRef={linksHandle} />
      <NetworkLinks curves={linkCurves.main} index={linkCurves.mainIdx} head={linkHead} alpha={linkAlpha} radius={0.065} color="#ff6a00" speed={0.4} pulses={3} opacity={0.2 * 0.22} tubularSegments={24} radialSegments={4} handleRef={halosHandle} />

      {/* studio atmosphere */}
      <Particles count={Math.round(500 * Math.max(0.25, profile.particles))} spread={[36, 8, 26]} position={[6, 3.5, 2]} color="#f2efe9" size={0.6} opacity={0.3} drift={[0.02, 0.03, 0]} seed={9} />
    </group>
  )
}

/** Selected-node info card (drei <Html>, mounted only in range). Glass panel to the right of the disc. */
function NodeCard({ node, text, closeLabel, onClose }: { node: NetworkNodeDef; text: string; closeLabel: string; onClose: () => void }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const r = requestAnimationFrame(() => setOn(true))
    return () => cancelAnimationFrame(r)
  }, [])
  return (
    <Html position={[node.r + 0.3, 0.05, 0]} zIndexRange={[9, 1]} style={{ pointerEvents: 'auto' }}>
      <div
        role="dialog"
        aria-label={node.label}
        className="glass rounded-2xl p-4"
        style={{
          width: 'min(260px, 70vw)',
          transform: `translateY(-50%) translateX(${on ? 0 : -8}px)`,
          opacity: on ? 1 : 0,
          transition: 'opacity .35s var(--ease-out-expo), transform .5s var(--ease-out-expo)',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="hud text-[9px] text-orange">{node.sub}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            data-cursor="open"
            className="-mr-1 -mt-1 flex h-7 w-7 items-center justify-center rounded-full text-bone/60 transition-colors hover:bg-bone/10 hover:text-bone"
          >
            <span aria-hidden className="font-display text-[16px] leading-none">
              ×
            </span>
          </button>
        </div>
        <p className="font-display mt-1 text-[16px] font-bold leading-tight text-bone">{node.label}</p>
        <p className="mt-2 text-[13px] leading-relaxed text-bone/75">{text}</p>
      </div>
    </Html>
  )
}
