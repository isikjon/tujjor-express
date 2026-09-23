'use client'
import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useStageFrame, useSceneReady, useInRange } from '@/hooks/useStage'
import { useApp } from '@/lib/stores'
import { STUDIO_X } from '@/lib/timeline'
import { clamp, damp, lerp, range, smoothstep } from '@/lib/math'
import { easeInOutCubic, easeOutBack, easeOutCubic } from '@/lib/easing'
import { audio } from '@/lib/audio'
import { useT } from '@/translations'
import { useExploded } from '@/components/sections/ExplodedCopy'
import { TujjorBox, type TujjorBoxHandle } from '../models/TujjorBox'
import { Podium } from '../models/Podium'
import { Particles } from '../fx/Particles'
import { PlateSet, PLATE_H, makePlateMaterials, usePlateGeometry, type PlateSetHandle } from '../models/AdvantagePlate'
import { contactShadowLayer } from '../fx/contactShadowLayer'
import type { SceneProps } from './types'
export { cameraAt, lights } from './BoxExplodedScene.camera'

/* ------------------------------------------------------------------ layout */
const X = STUDIO_X.exploded // 20 — everything lives around this station
const BOX_Y = 0.45 // box centre (scale 2 → 1.2 × 0.9 × 0.9, bottom on the podium)
const BOX_SCALE = 2
const EXPLODE_MAX = 0.7 // TujjorBox explode amount at full spread (panels +0.77 u, flaps crown at y ≈ 2.2–2.7)
const YAW0 = -0.55 // brand face toward the arriving camera (Network t1); +90° over t 0–.2
const RING_R = 1.6
/** the ring opens toward the t.5 camera (pos 27,4,10 → yaw atan2(7,10)) */
const RING_YAW = Math.atan2(7, 10)
const RING_SPAN = THREE.MathUtils.degToRad(200)
const N = 6
/** plate heights: an arch, 1.2 u at the ends → 1.8 u in the middle */
const PLATE_Y = [1.22, 1.55, 1.8, 1.8, 1.55, 1.22]
/** interaction window (docs §14.7) */
const INT_FROM = 0.25
const INT_TO = 0.55
/** selection is dropped once the scroll leaves this wider window */
const CLEAR_LO = 0.15
const CLEAR_HI = 0.72
/**
 * The podium's contact-shadow camera only sees this layer (same convention as Calculator / Tracking / Final):
 * opt-in casters = the box panels / flaps / cavity and the plate faces. Floor, ticks, rig, icons, rims and
 * particles never mark its pixels (below the camera, beyond `far`, edge-on or covered) → they skip the pass.
 */
const SHADOW_LAYER = 3

const ringAngle = (i: number) => RING_YAW + ((i - (N - 1) / 2) / (N - 1)) * RING_SPAN
/** plates face the camera side: 40% radial, 60% toward the ring centre direction */
const faceYaw = (i: number) => RING_YAW + (ringAngle(i) - RING_YAW) * 0.4
/** stagger: rise .24→.55 (first plate first), fall .58→.86 (last plate first) */
const plateProgress = (tE: number, i: number) => smoothstep(0.24 + i * 0.022, 0.44 + i * 0.022, tE) * (1 - smoothstep(0.58 + (N - 1 - i) * 0.016, 0.78 + (N - 1 - i) * 0.016, tE))

/** true when the pointer event actually originated on a DOM control (Html card, copy list) — the raycast is then ignored */
const fromDom = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
  const el = e.nativeEvent?.target as Element | null
  return !!el && typeof el.closest === 'function' && !!el.closest('button, a, input, select, textarea, [data-html-card]')
}

const labelStyle: CSSProperties = { opacity: 0, transform: 'translateY(6px)', willChange: 'opacity, transform', textShadow: '0 1px 8px rgba(0,0,0,.6)' }
const Z_RANGE: [number, number] = [9, 1]

/**
 * §10 BOX EXPLODED — the big studio box on its podium. t 0–.2 quarter turn · t .2–.55 exploded view:
 * flaps open and rise, panels push out, six advantage plates rise from inside into an arch facing the camera
 * · t .55–.85 everything reassembles · t .85–1 idle. Plates are interactive while t ∈ [.25,.55] (docs §14.7);
 * hover/selection is shared with the DOM list through `useExploded`.
 */
export default function BoxExplodedScene({ stage }: SceneProps) {
  const inRange = useInRange(stage)
  const tier = useApp((s) => s.tier)
  const t = useT()
  const root = useRef<THREE.Group>(null!)
  const box = useRef<TujjorBoxHandle>(null)
  // restrict the podium's contact-shadow depth pass to SHADOW_LAYER (re-applied whenever the Podium remounts it);
  // the shared box's panels + flaps + cavity are the casters (exploded silhouette → no static proxy possible)
  useEffect(() => contactShadowLayer(root.current, SHADOW_LAYER), [inRange, tier])
  useEffect(() => {
    box.current?.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.visible) o.layers.enable(SHADOW_LAYER)
    })
  }, [])
  const plates = useRef<THREE.Group[]>([])
  const plateSet = useRef<PlateSetHandle>(null)
  const labels = useRef<HTMLDivElement[]>([])
  const geo = usePlateGeometry(N)
  const mats = useMemo(() => makePlateMaterials(N), [])
  /** static bounds of the plate ring (box centre → arch top, ring radius + overshoot) for the instanced meshes */
  const plateBounds = useMemo(() => new THREE.Sphere(new THREE.Vector3(X, 1.3, 0), 3.2), [])

  // per-plate live values (damped) + one-shot memory — mutated in the frame loop only
  const mem = useRef({
    hover: new Float32Array(N),
    dim: new Float32Array(N).fill(1),
    labelO: new Float32Array(N).fill(-1),
    explode: 0,
    lid: 0,
    /** damped offset between the scroll t and the held choreography t (non-zero only around a selection) */
    hold: 0,
    interactive: false,
    pointerHover: -1,
    whooshed: false,
    /** last frame's inputs — the loop is skipped when nothing moved and every damped value has settled */
    t: -1,
    tu: -1,
    time: -1,
    hovered: null as number | null,
    selected: null as number | null,
    settling: true,
    /** per-plate icon material state actually written (dim, hot) */
    matD: new Float32Array(N).fill(-1),
    matH: new Float32Array(N).fill(-1),
  })

  /* ------------------------------------------------------------ studio dressing (built once) */
  const studio = useMemo(() => {
    // floor ticks: 72 radial dashes around the podium, every 6th longer — a turntable scale
    const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.004, 0.018), new THREE.MeshBasicMaterial({ color: '#f2efe9', transparent: true, opacity: 0.28, toneMapped: false }), 72)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const pos = new THREE.Vector3()
    const scl = new THREE.Vector3()
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2
      const long = i % 6 === 0
      const len = long ? 0.2 : 0.09
      const r = 2.95 + len / 2
      pos.set(X + Math.cos(a) * r, 0.004, Math.sin(a) * r)
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a)
      scl.set(len, 1, long ? 1.4 : 1)
      ticks.setMatrixAt(i, m.compose(pos, q, scl))
    }
    ticks.instanceMatrix.needsUpdate = true
    ticks.computeBoundingSphere()
    // studio light bars: dark housings + hanging rods (one merged mesh) and two emissive strips
    const bars: { pos: [number, number, number]; yaw: number; len: number }[] = [
      { pos: [X - 2, 3.8, -5.5], yaw: -0.35, len: 4.2 },
      { pos: [X + 3, 6.5, 3], yaw: 0.6, len: 3 },
    ]
    const parts: THREE.BufferGeometry[] = []
    for (const b of bars) {
      const housing = new THREE.BoxGeometry(b.len + 0.1, 0.12, 0.16).toNonIndexed()
      housing.rotateY(b.yaw)
      housing.translate(b.pos[0], b.pos[1] + 0.09, b.pos[2])
      parts.push(housing)
      for (const s of [-1, 1]) {
        const rod = new THREE.CylinderGeometry(0.008, 0.008, 4, 6).toNonIndexed()
        const dx = Math.cos(b.yaw) * s * (b.len / 2 - 0.3)
        const dz = -Math.sin(b.yaw) * s * (b.len / 2 - 0.3)
        rod.translate(b.pos[0] + dx, b.pos[1] + 2.15, b.pos[2] + dz)
        parts.push(rod)
      }
    }
    const rig = mergeGeometries(parts, false)!
    parts.forEach((p) => p.dispose())
    return {
      ticks,
      rig,
      bars,
      rigMat: new THREE.MeshStandardMaterial({ color: '#1a1d24', roughness: 0.55, metalness: 0.7 }),
      stripMat: new THREE.MeshBasicMaterial({ color: '#fff4e6', toneMapped: false }),
      floorMat: new THREE.MeshStandardMaterial({ color: '#0f1115', roughness: 0.88, metalness: 0.12 }),
    }
  }, [])
  useSceneReady(stage.id)

  // dispose plate materials + studio dressing on unmount (plate geometries are disposed by usePlateGeometry)
  useEffect(
    () => () => {
      mats.all.forEach((x) => x.dispose())
      studio.ticks.geometry.dispose()
      ;(studio.ticks.material as THREE.Material).dispose()
      studio.rig.dispose()
      studio.rigMat.dispose()
      studio.stripMat.dispose()
      studio.floorMat.dispose()
    },
    [mats, studio],
  )

  /* ------------------------------------------------------------ pointer handlers (3D side of the interaction) */
  const setCursor = useApp.getState().setCursor
  const over = (i: number, e: ThreeEvent<PointerEvent>) => {
    if (!mem.current.interactive || fromDom(e)) return
    e.stopPropagation()
    mem.current.pointerHover = i
    const st = useExploded.getState()
    if (st.hovered !== i) audio.click(1400)
    st.setHovered(i)
    setCursor('explore')
  }
  const out = (i: number) => {
    if (mem.current.pointerHover !== i) return
    mem.current.pointerHover = -1
    const st = useExploded.getState()
    if (st.hovered === i) st.setHovered(null)
    setCursor('default')
  }
  const click = (i: number, e: ThreeEvent<MouseEvent>) => {
    if (!mem.current.interactive || fromDom(e)) return
    e.stopPropagation()
    const st = useExploded.getState()
    st.setSelected(st.selected === i ? null : i)
  }

  /* ------------------------------------------------------------ choreography */
  useStageFrame(stage, ({ t, tu, dt, time }) => {
    const b = box.current
    const m = mem.current
    if (!b) return
    const st = useExploded.getState()
    const selected = st.selected
    const hovered = st.hovered

    // ---- nothing moved (scroll, clock, hover / selection) and every damped value has settled → skip the frame
    // (the clock only stands still with reduced motion; otherwise the idle sway / bob keeps running by design)
    if (t === m.t && tu === m.tu && time === m.time && hovered === m.hovered && selected === m.selected && !m.settling) return
    m.t = t
    m.tu = tu
    m.time = time
    m.hovered = hovered
    m.selected = selected
    let settling = false

    // selection lifetime: dropped when the scroll leaves the wider window (docs §14.7)
    if (selected !== null && (tu < CLEAR_LO || tu > CLEAR_HI)) st.setSelected(null)
    // while a plate is selected the explode state holds: its driving t is clamped to [.30,.55] (docs §14.7).
    // The offset is damped so releasing the selection eases the choreography back to the scroll instead of snapping.
    m.hold = damp(m.hold, selected !== null ? clamp(t, 0.3, INT_TO) - t : 0, 12, dt)
    const tE = selected !== null ? clamp(t + m.hold, 0.3, INT_TO) : t + m.hold

    // interaction window → raycast layer toggled only on change
    const interactive = tE >= INT_FROM && tE <= INT_TO && tu >= 0 && tu <= 1
    if (interactive !== m.interactive) {
      m.interactive = interactive
      plateSet.current?.setInteractive(interactive)
      if (!interactive && m.pointerHover >= 0) {
        if (hovered === m.pointerHover) st.setHovered(null)
        m.pointerHover = -1
        setCursor('default')
      }
    }

    // one whoosh as the box bursts open (t crosses .2 going forward)
    if (tu < 0.12) m.whooshed = false
    else if (!m.whooshed && t >= 0.2) {
      m.whooshed = true
      audio.whoosh(0.6, 1.15)
    }

    // --- box: quarter turn (t 0–.2), explode / lid (t .2–.55), reassemble (.55–.85), idle sway
    const explodeT = smoothstep(0.2, INT_TO, tE) * (1 - smoothstep(INT_TO, 0.85, tE))
    const lidT = smoothstep(0.22, 0.48, tE) * (1 - smoothstep(0.6, 0.86, tE))
    m.explode = damp(m.explode, explodeT, 9, dt) // damping smooths the jump when a selection is dropped
    m.lid = damp(m.lid, lidT, 9, dt)
    if (Math.abs(m.explode - explodeT) > 1e-4 || Math.abs(m.lid - lidT) > 1e-4 || Math.abs(m.hold - (selected !== null ? clamp(t, 0.3, INT_TO) - t : 0)) > 1e-4) settling = true
    const E = m.explode
    b.setExplode(E * EXPLODE_MAX)
    b.setLid(m.lid)
    b.setGlow(E * 0.85)
    const turn = easeInOutCubic(range(t, 0, 0.2))
    const sway = Math.sin(time * 0.3) * 0.03 * (1 - E * 0.6)
    b.group.rotation.y = YAW0 + (Math.PI / 2) * turn + sway
    b.group.position.set(X, BOX_Y, 0)

    // --- plates: rise from inside the box into the arch, hover lift / dim, idle bob
    const anyHot = hovered !== null || selected !== null
    const ringSway = Math.sin(time * 0.25) * 0.05
    const ps = plateSet.current
    for (let i = 0; i < N; i++) {
      const g = plates.current[i]
      if (!g) continue
      const pr = plateProgress(tE, i)
      const hot = hovered === i || selected === i
      const wantH = hot ? 1 : 0
      const wantD = anyHot && !hot ? 0.4 : 1
      m.hover[i] = damp(m.hover[i], wantH, 10, dt)
      m.dim[i] = damp(m.dim[i], wantD, 10, dt)
      if (Math.abs(m.hover[i] - wantH) > 1e-4 || Math.abs(m.dim[i] - wantD) > 1e-4) settling = true
      const h = m.hover[i]
      const d = m.dim[i]
      g.visible = pr > 0.002
      if (g.visible) {
        const a = ringAngle(i) + ringSway
        const out = easeOutBack(pr) // slight overshoot → the plates settle into the ring
        const rad = RING_R * Math.max(0, out)
        const lift = easeOutCubic(pr)
        const bob = Math.sin(time * 1.4 + i * 1.3) * 0.025 * pr
        g.position.set(X + Math.sin(a) * rad, lerp(BOX_Y, PLATE_Y[i], lift) + Math.sin(pr * Math.PI) * 0.22 + bob + 0.15 * h, Math.cos(a) * rad)
        g.rotation.set(-1.1 * (1 - lift), faceYaw(i) + ringSway + (1 - lift) * Math.PI * 0.5, 0)
        g.scale.setScalar(lerp(0.2, 1, lift) * (1 + 0.06 * h))
        g.updateMatrix() // mirrored into the instanced face / rim below (three recomputes it again in updateMatrixWorld — trivial)
        // icon materials: dim to 40% when another plate is hot; the accent glow follows the hover value
        if (Math.abs(d - m.matD[i]) > 1e-4 || Math.abs(h - m.matH[i]) > 1e-4) {
          m.matD[i] = d
          m.matH[i] = h
          mats.dark[i].opacity = d
          mats.accent[i].opacity = d
          mats.accent[i].emissiveIntensity = 1 + 0.6 * h
        }
      }
      if (ps) {
        ps.setMatrix(i, g.matrix, g.visible)
        ps.setState(i, d, h)
      }
      // Html label: fades in during the last part of the rise, dims with the plate (style writes, no React)
      const el = labels.current[i]
      if (el) {
        const o = g.visible ? range(pr, 0.6, 0.95) * d : 0
        if (Math.abs(o - m.labelO[i]) > 0.004) {
          m.labelO[i] = o
          el.style.opacity = o.toFixed(3)
          el.style.transform = `translateY(${((1 - o) * 6).toFixed(1)}px)`
        }
      }
    }
    ps?.commit()
    m.settling = settling
  })

  return (
    <group name="BoxExplodedScene" ref={root}>
      {/* studio floor + podium + turntable ticks */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[X, -0.02, 0]} material={studio.floorMat} receiveShadow>
        <circleGeometry args={[16, 64]} />
      </mesh>
      <Podium radius={2.4} inRange={inRange} position={[X, 0, 0]} />
      <primitive object={studio.ticks} />

      {/* the box (scale 2) — flaps as separate meshes for the lid / explode transforms */}
      <TujjorBox ref={box} scale={BOX_SCALE} tint={0} flaps position={[X, BOX_Y, 0]} rotation={[0, YAW0, 0]} />

      {/* six advantage plates (hidden inside the box until they rise): instanced faces / rims + per-plate icons */}
      <PlateSet
        ref={plateSet}
        geo={geo}
        mats={mats}
        bounds={plateBounds}
        groupRef={(i, g) => {
          if (!g) return
          g.rotation.order = 'YXZ' // tilt about the plate's own X, then yaw
          g.position.set(X, BOX_Y, 0)
          plates.current[i] = g
        }}
        onPointerOver={over}
        onPointerOut={out}
        onClick={click}
        shadowLayer={SHADOW_LAYER}
      >
        {(i) => (
          <>
            {inRange ? (
              <Html position={[0, -PLATE_H / 2 - 0.12, 0]} center zIndexRange={Z_RANGE} style={{ pointerEvents: 'none' }}>
                <div
                  ref={(el) => {
                    labels.current[i] = el as HTMLDivElement
                  }}
                  className="hud text-[10px]"
                  style={labelStyle}
                >
                  <span className="mr-2 text-orange">{String(i + 1).padStart(2, '0')}</span>
                  {t.exploded.items[i].t}
                </div>
              </Html>
            ) : null}
            {inRange ? <PlateCard index={i} /> : null}
          </>
        )}
      </PlateSet>

      {/* studio light rig: housings + rods (dark) and two emissive strips */}
      <mesh geometry={studio.rig} material={studio.rigMat} />
      {studio.bars.map((b, i) => (
        <mesh key={i} position={b.pos} rotation={[0, b.yaw, 0]} material={studio.stripMat}>
          <boxGeometry args={[b.len, 0.035, 0.05]} />
        </mesh>
      ))}

      {/* studio atmosphere */}
      <Particles count={300} spread={[9, 5, 9]} position={[X, 2.4, 0]} color="#ffd2b0" size={0.75} opacity={0.5} speed={0.05} drift={[0, 0.03, 0]} seed={11} />
    </group>
  )
}

/** Description card for the selected plate (clickable Html, ≤ 90 chars). Subscribes per plate so only the affected plate re-renders. */
function PlateCard({ index }: { index: number }) {
  const t = useT()
  const isSel = useExploded((s) => s.selected === index)
  const setSelected = useExploded((s) => s.setSelected)
  if (!isSel) return null
  const it = t.exploded.items[index]
  return (
    <Html position={[0, PLATE_H / 2 + 0.1, 0]} zIndexRange={Z_RANGE} style={{ pointerEvents: 'auto' }}>
      <div data-html-card className="glass w-[240px] -translate-x-1/2 -translate-y-full rounded-md px-4 py-3 text-left" style={{ animation: 'tj-card-in .28s cubic-bezier(.16,1,.3,1) both' }}>
        <div className="flex items-start justify-between gap-3">
          <p className="hud text-[10px] text-orange">
            {String(index + 1).padStart(2, '0')} · {it.t}
          </p>
          <button
            type="button"
            aria-label="×"
            data-cursor="open"
            onClick={() => setSelected(null)}
            className="-mr-1 -mt-1 flex h-6 w-6 items-center justify-center rounded-sm text-bone/50 transition-colors hover:text-bone focus-visible:ring-2 focus-visible:ring-orange"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 text-[13px] leading-snug text-bone/85">{it.d}</p>
        <style>{`@keyframes tj-card-in{from{opacity:0;transform:translate(-50%,calc(-100% + 8px))}to{opacity:1;transform:translate(-50%,-100%)}}`}</style>
      </div>
    </Html>
  )
}
