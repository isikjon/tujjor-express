'use client'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { Text } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const FONT = '/fonts/space-grotesk-700.woff'
const ORANGE = new THREE.Color('#ff6a00')
const BONE = '#f2efe9'
const HALO_A = 0.07
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const RIM_INIT = 2.2
const DIM_INIT = 1

/** troika Text mesh: `fillOpacity` is a per-render uniform (no re-layout), safe to drive from useFrame. */
type TroikaText = THREE.Mesh & { fillOpacity: number }

export interface NetworkNodeDefLite {
  id: string
  label: string
  sub: string
  position: [number, number, number]
  /** disc radius */
  r: number
}

export interface NetworkNodesHandle {
  /** node i transform: centre (incl. bob), y-billboard yaw, pop×hover scale — written per frame, committed once */
  set: (i: number, x: number, y: number, z: number, yaw: number, s: number) => void
  /** rim / core emissive multiplier (HDR; 2.2 idle, ≥3 blooms) */
  setRim: (i: number, k: number) => void
  /** halo + label opacity (dim others while one node is hovered) */
  setDim: (i: number, a: number) => void
  /** flag the instance buffers after the per-frame writes (only what changed) */
  commit: () => void
}

export interface NetworkNodeMats {
  glass: THREE.MeshStandardMaterial
  tick: THREE.MeshBasicMaterial
  core: THREE.MeshStandardMaterial
  stem: THREE.MeshBasicMaterial
  floorRing: THREE.MeshBasicMaterial
  rim: THREE.MeshBasicMaterial
  halo: THREE.MeshBasicMaterial
}
/** Shared materials for all nodes (create once per scene, pass down). Per-node rim / halo state lives in instanceColor. */
export function makeNodeMats(): NetworkNodeMats {
  return {
    // "glass" per contract: no transmission — bone tint, low roughness, 35% opacity
    glass: new THREE.MeshStandardMaterial({ color: '#f2efe9', transparent: true, opacity: 0.35, roughness: 0.15, metalness: 0.05, envMapIntensity: 1.4, depthWrite: false }),
    // flat rings: the disc y-billboards toward the camera, the floor ring is only ever seen from above → FrontSide
    // (DoubleSide on a transparent material costs a second draw per mesh in three ≥ r150)
    tick: new THREE.MeshBasicMaterial({ color: BONE, transparent: true, opacity: 0.32, depthWrite: false }),
    core: new THREE.MeshStandardMaterial({ color: '#15171c', roughness: 0.35, metalness: 0.85, envMapIntensity: 1.2 }),
    stem: new THREE.MeshBasicMaterial({ color: BONE, transparent: true, opacity: 0.16, depthWrite: false }),
    floorRing: new THREE.MeshBasicMaterial({ color: ORANGE, toneMapped: false, transparent: true, opacity: 0.4, depthWrite: false }),
    // HDR rim: colour × per-instance scalar (instanceColor carries the 2.2 / 3.4 / 1.5 multiplier)
    rim: new THREE.MeshBasicMaterial({ color: ORANGE, toneMapped: false }),
    // additive halo: instanceColor scalar = dim factor (colour scale ≡ opacity scale under additive blending)
    halo: new THREE.MeshBasicMaterial({ color: ORANGE, toneMapped: false, transparent: true, opacity: HALO_A, depthWrite: false, blending: THREE.AdditiveBlending }),
  }
}

/**
 * Unit-radius node geometries (r = 1, thicknesses authored for r ≈ .5 and scaled uniformly by the instance
 * scale s·r — ±10 % thickness across the .46–.55 radii, invisible at the network's camera distances).
 * Pop space: disc normal = +z (the y-billboard yaw of the instance turns it toward the camera).
 */
function buildGeometries() {
  const K = 2 // = 1 / 0.5 — authoring radius scale
  const disc = new THREE.CylinderGeometry(1, 1, 0.05 * K, 48)
  disc.rotateX(Math.PI / 2)
  // HDR rim torus + the emissive centre dot share one material → one merged geometry
  const torus = new THREE.TorusGeometry(1, 0.014 * K, 8, 72)
  const dot = new THREE.SphereGeometry(0.032 * K, 10, 10)
  dot.translate(0, 0, 0.04 * K)
  const rim = mergeGeometries([torus, dot], false)!
  torus.dispose()
  dot.dispose()
  const halo = new THREE.RingGeometry(1.04, 1.6, 56)
  halo.translate(0, 0, -0.03 * K)
  const tick = new THREE.RingGeometry(0.74, 0.76, 64)
  tick.translate(0, 0, 0.03 * K)
  const core = new THREE.CylinderGeometry(0.3, 0.3, 0.07 * K, 32)
  core.rotateX(Math.PI / 2)
  for (const g of [disc, rim, halo, tick, core]) g.computeBoundingSphere()
  return { disc, rim, halo, tick, core }
}

/** Static anchors (stem + floor ring per node, rotationally symmetric about y → independent of the billboard yaw), merged. */
function buildAnchors(nodes: NetworkNodeDefLite[]) {
  const stems: THREE.BufferGeometry[] = []
  const rings: THREE.BufferGeometry[] = []
  for (const n of nodes) {
    const [x, y, z] = n.position
    const stemH = Math.max(0.05, y - n.r - 0.08)
    const s = new THREE.CylinderGeometry(0.006, 0.006, stemH, 6)
    s.translate(x, stemH / 2, z)
    stems.push(s)
    const r = new THREE.RingGeometry(n.r * 0.42, n.r * 0.46, 40)
    r.rotateX(-Math.PI / 2)
    r.translate(x, 0.008, z)
    rings.push(r)
  }
  const stem = mergeGeometries(stems, false)!
  const ring = mergeGeometries(rings, false)!
  for (const g of [...stems, ...rings]) g.dispose()
  stem.computeBoundingSphere()
  ring.computeBoundingSphere()
  return { stem, ring }
}

interface Props {
  nodes: NetworkNodeDefLite[]
  mats: NetworkNodeMats
  onPointerOver?: (i: number, e: ThreeEvent<PointerEvent>) => void
  onPointerOut?: (i: number, e: ThreeEvent<PointerEvent>) => void
  onClick?: (i: number, e: ThreeEvent<MouseEvent>) => void
  /** per-node extra content in pop space (the selected-node <Html> card) */
  card?: (n: NetworkNodeDefLite, i: number) => ReactNode
}

/**
 * The network's node cluster — every node is a floating glass "token" facing the camera: bone glass disc, HDR
 * orange rim torus + emissive centre, graphite metal core, faint additive halo, thin technical tick ring;
 * anchored to the studio grid by a hair-thin stem + orange floor ring. Label above, caption below.
 * All N nodes share 5 InstancedMeshes (disc / rim / halo / tick / core) + 2 merged static anchor meshes;
 * only the troika labels stay per node. The disc InstancedMesh is the only raycast target (layer 1, instanceId).
 * All per-frame changes go through the handle (no React state).
 */
export const NetworkNodes = forwardRef<NetworkNodesHandle, Props>(function NetworkNodes({ nodes, mats, onPointerOver, onPointerOut, onClick, card }, ref) {
  const N = nodes.length
  const geo = useMemo(buildGeometries, [])
  const anchors = useMemo(() => buildAnchors(nodes), [nodes])
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose())
    },
    [geo],
  )
  useEffect(
    () => () => {
      anchors.stem.dispose()
      anchors.ring.dispose()
    },
    [anchors],
  )
  const disc = useRef<THREE.InstancedMesh>(null!)
  const rim = useRef<THREE.InstancedMesh>(null!)
  const halo = useRef<THREE.InstancedMesh>(null!)
  const tick = useRef<THREE.InstancedMesh>(null!)
  const core = useRef<THREE.InstancedMesh>(null!)
  const pops = useRef<THREE.Group[]>([])
  const labels = useRef<(TroikaText | null)[]>([])
  const subs = useRef<(TroikaText | null)[]>([])

  /** the cluster's static bounds (nodes only bob ±.035 and scale ≤ 1.15) — set once instead of per-frame recomputes */
  const bounds = useMemo(() => {
    const box = new THREE.Box3()
    for (const n of nodes) box.expandByPoint(new THREE.Vector3(...n.position))
    const s = new THREE.Sphere()
    box.getBoundingSphere(s)
    s.radius += 1.9 * 1.2 + 0.1
    return s
  }, [nodes])

  const st = useMemo(() => {
    // per-instance CPU copies of what the GPU buffers hold: the matrices (so a re-created / re-initialised mesh
    // gets the CURRENT transforms, not the hidden 1e-4 ones) and the rim / dim scalars (change detection)
    const mats = new Float32Array(N * 16)
    const hidden = new THREE.Matrix4().makeScale(1e-4, 1e-4, 1e-4)
    for (let i = 0; i < N; i++) hidden.toArray(mats, i * 16)
    return {
      m: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      p: new THREE.Vector3(),
      s: new THREE.Vector3(),
      c: new THREE.Color(),
      mats,
      rim: new Float32Array(N).fill(RIM_INIT),
      dim: new Float32Array(N).fill(DIM_INIT),
      matDirty: false,
      rimDirty: false,
      haloDirty: false,
    }
  }, [N])
  /**
   * One-time GPU buffer initialisation per InstancedMesh object. The callbacks are stable (useCallback) so React
   * does not re-invoke them on every NetworkNodes re-render (the scene passes fresh handler closures each time);
   * `userData.init` additionally guards StrictMode / remount re-attachments. Whenever a buffer IS (re)written the
   * matching CPU cache is written from the same source, so the cache and the GPU never disagree.
   */
  const setup = useCallback(
    (m: THREE.InstancedMesh | null) => {
      if (!m) return false
      m.boundingSphere = bounds
      m.frustumCulled = true
      if (m.userData.init) return false
      m.userData.init = true
      for (let i = 0; i < N; i++) m.setMatrixAt(i, st.m.fromArray(st.mats, i * 16))
      m.instanceMatrix.needsUpdate = true
      return true
    },
    [st, bounds, N],
  )
  const setupColor = useCallback(
    (m: THREE.InstancedMesh | null, cache: Float32Array, v: number) => {
      if (!setup(m) || !m) return
      cache.fill(v)
      for (let i = 0; i < N; i++) m.setColorAt(i, st.c.setScalar(v))
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    },
    [setup, st, N],
  )
  const refs = useMemo(
    () => ({
      disc: (m: THREE.InstancedMesh | null) => {
        if (!m) return
        disc.current = m
        setup(m)
        m.layers.enable(1)
      },
      rim: (m: THREE.InstancedMesh | null) => {
        if (!m) return
        rim.current = m
        setupColor(m, st.rim, RIM_INIT)
      },
      halo: (m: THREE.InstancedMesh | null) => {
        if (!m) return
        halo.current = m
        setupColor(m, st.dim, DIM_INIT)
      },
      tick: (m: THREE.InstancedMesh | null) => {
        if (!m) return
        tick.current = m
        setup(m)
      },
      core: (m: THREE.InstancedMesh | null) => {
        if (!m) return
        core.current = m
        setup(m)
      },
    }),
    [setup, setupColor, st],
  )

  useImperativeHandle(
    ref,
    () => ({
      set: (i, x, y, z, yaw, s) => {
        const g = pops.current[i]
        const r = nodes[i].r
        st.p.set(x, y, z)
        st.q.setFromAxisAngle(Y_AXIS, yaw)
        st.s.setScalar(Math.max(1e-4, s * r))
        st.m.compose(st.p, st.q, st.s)
        st.m.toArray(st.mats, i * 16)
        disc.current.setMatrixAt(i, st.m)
        rim.current.setMatrixAt(i, st.m)
        halo.current.setMatrixAt(i, st.m)
        tick.current.setMatrixAt(i, st.m)
        core.current.setMatrixAt(i, st.m)
        st.matDirty = true
        if (g) {
          g.position.set(x, y, z)
          g.rotation.y = yaw
          g.scale.setScalar(Math.max(1e-4, s))
          g.visible = s > 0.001
        }
      },
      setRim: (i, k) => {
        if (Math.abs(k - st.rim[i]) < 1e-3) return
        st.rim[i] = k
        rim.current.setColorAt(i, st.c.setScalar(k))
        st.rimDirty = true
      },
      setDim: (i, a) => {
        if (Math.abs(a - st.dim[i]) < 1e-3) return
        st.dim[i] = a
        halo.current.setColorAt(i, st.c.setScalar(a))
        st.haloDirty = true
        const l = labels.current[i]
        const sb = subs.current[i]
        if (l) l.fillOpacity = 0.4 + 0.6 * a
        if (sb) sb.fillOpacity = 0.35 + 0.4 * a
      },
      commit: () => {
        if (st.matDirty) {
          st.matDirty = false
          disc.current.instanceMatrix.needsUpdate = true
          rim.current.instanceMatrix.needsUpdate = true
          halo.current.instanceMatrix.needsUpdate = true
          tick.current.instanceMatrix.needsUpdate = true
          core.current.instanceMatrix.needsUpdate = true
        }
        if (st.rimDirty && rim.current.instanceColor) {
          st.rimDirty = false
          rim.current.instanceColor.needsUpdate = true
        }
        if (st.haloDirty && halo.current.instanceColor) {
          st.haloDirty = false
          halo.current.instanceColor.needsUpdate = true
        }
      },
    }),
    [nodes, st],
  )

  const idOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => (typeof e.instanceId === 'number' ? e.instanceId : -1)
  /** stable `args` tuples (a fresh array with different elements would make R3F rebuild the InstancedMesh) */
  const args = useMemo(
    () => ({
      disc: [geo.disc, mats.glass, N] as [THREE.BufferGeometry, THREE.Material, number],
      rim: [geo.rim, mats.rim, N] as [THREE.BufferGeometry, THREE.Material, number],
      halo: [geo.halo, mats.halo, N] as [THREE.BufferGeometry, THREE.Material, number],
      tick: [geo.tick, mats.tick, N] as [THREE.BufferGeometry, THREE.Material, number],
      core: [geo.core, mats.core, N] as [THREE.BufferGeometry, THREE.Material, number],
    }),
    [geo, mats, N],
  )

  return (
    <group name="NetworkNodes">
      {/* anchors: stems + floor rings (do not scale with the pop) */}
      <mesh geometry={anchors.stem} material={mats.stem} />
      <mesh geometry={anchors.ring} material={mats.floorRing} />
      {/* glass disc — the only raycast target */}
      <instancedMesh
        ref={refs.disc}
        args={args.disc}
        onPointerOver={(e) => {
          const i = idOf(e)
          if (i >= 0) onPointerOver?.(i, e)
        }}
        onPointerOut={(e) => {
          const i = idOf(e)
          if (i >= 0) onPointerOut?.(i, e)
        }}
        onClick={(e) => {
          const i = idOf(e)
          if (i >= 0) onClick?.(i, e)
        }}
      />
      {/* HDR rim + centre dot (instanceColor = HDR multiplier) */}
      <instancedMesh ref={refs.rim} args={args.rim} />
      {/* soft additive halo behind the disc (instanceColor = dim) */}
      <instancedMesh ref={refs.halo} args={args.halo} />
      {/* technical tick ring */}
      <instancedMesh ref={refs.tick} args={args.tick} />
      {/* graphite core */}
      <instancedMesh ref={refs.core} args={args.core} />
      {/* labels + cards: one light group per node in pop space (position / yaw / scale mirrored from the instance) */}
      {nodes.map((n, i) => (
        <group
          key={n.id}
          ref={(g) => {
            pops.current[i] = g!
          }}
          position={n.position}
          scale={1e-4}
          visible={false}
        >
          <Text
            ref={(el: TroikaText | null) => {
              labels.current[i] = el
            }}
            font={FONT}
            fontSize={0.28}
            letterSpacing={0.04}
            color={BONE}
            anchorX="center"
            anchorY="bottom"
            position={[0, n.r + 0.16, 0]}
          >
            {n.label}
          </Text>
          <Text
            ref={(el: TroikaText | null) => {
              subs.current[i] = el
            }}
            font={FONT}
            fontSize={0.1}
            letterSpacing={0.18}
            color="#ffb070"
            fillOpacity={0.75}
            anchorX="center"
            anchorY="top"
            position={[0, -n.r - 0.12, 0]}
          >
            {n.sub}
          </Text>
          {card?.(n, i)}
        </group>
      ))}
    </group>
  )
})
