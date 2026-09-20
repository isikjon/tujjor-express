'use client'
import { forwardRef, useMemo, useRef, useImperativeHandle } from 'react'
import * as THREE from 'three'
import { useApp } from '@/lib/stores'
import { PROFILES } from '@/lib/quality'
import { cardboardTextures } from '@/lib/textures'

/** Canonical box size (w × h × d) — the match-cut and every handoff rely on this. */
export const BOX_SIZE: [number, number, number] = [0.6, 0.45, 0.45]

export interface TujjorBoxHandle {
  group: THREE.Group
  /** 0 = closed, 1 = lid fully open (flaps rotate outward) */
  setLid: (v: number) => void
  /** 0 = assembled, 1 = fully exploded (panels move outward along their normals, lid rises) */
  setExplode: (v: number) => void
  /** inner glow intensity 0..1 (emissive core; pair with lightRig.points[0] for real light) */
  setGlow: (v: number) => void
}
interface Props {
  /** uniform scale multiplier */
  scale?: number
  /** kraft tint variation 0..3 */
  tint?: 0 | 1 | 2 | 3
  castShadow?: boolean
  receiveShadow?: boolean
  /** render the four top flaps as separate meshes (needed for lid / exploded) */
  flaps?: boolean
  /** initial values */
  lid?: number
  explode?: number
  glow?: number
  position?: [number, number, number]
  rotation?: [number, number, number]
  children?: React.ReactNode
}

const TINTS = ['#ffffff', '#f3e6d2', '#e9d5b8', '#fff3e4']

/**
 * The hero cargo box. Six panels (front/back/left/right/bottom) + four top flaps.
 * Front (+Z) carries the brand print; sides carry arrows; other faces plain kraft.
 * Panels are separate meshes so the exploded / open states are pure transforms (no morphing).
 */
export const TujjorBox = forwardRef<TujjorBoxHandle, Props>(function TujjorBox(
  { scale = 1, tint = 0, castShadow = true, receiveShadow = true, flaps = true, lid = 0, explode = 0, glow = 0, position, rotation, children },
  ref,
) {
  const tier = useApp((s) => s.tier)
  const texSize = PROFILES[tier].textureSize >= 1024 ? 1024 : 512
  const group = useRef<THREE.Group>(null!)
  const panels = useRef<Record<string, THREE.Mesh>>({})
  const flapRefs = useRef<THREE.Group[]>([])
  const core = useRef<THREE.Mesh>(null!)
  const state = useRef({ lid, explode, glow })

  const mats = useMemo(() => {
    const front = cardboardTextures(texSize, 0)
    const side = cardboardTextures(texSize, 2)
    const plain = cardboardTextures(texSize, 1)
    const color = new THREE.Color(TINTS[tint])
    const mk = (set: typeof front) =>
      new THREE.MeshStandardMaterial({
        map: set.map,
        normalMap: set.normalMap,
        normalScale: new THREE.Vector2(0.55, 0.55),
        roughnessMap: set.roughnessMap,
        roughness: 0.92,
        metalness: 0,
        color,
        envMapIntensity: 0.6,
      })
    const inner = new THREE.MeshStandardMaterial({ color: '#8f6a45', roughness: 1, metalness: 0, side: THREE.BackSide })
    const coreMat = new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0, toneMapped: false })
    return { front: mk(front), side: mk(side), plain: mk(plain), inner, coreMat }
  }, [texSize, tint])

  const [w, h, d] = BOX_SIZE
  const th = 0.012 // panel thickness

  const apply = () => {
    const { lid: L, explode: E, glow: G } = state.current
    const p = panels.current
    const push = E * 0.55
    if (p.front) p.front.position.z = d / 2 - th / 2 + push
    if (p.back) p.back.position.z = -d / 2 + th / 2 - push
    if (p.left) p.left.position.x = -w / 2 + th / 2 - push
    if (p.right) p.right.position.x = w / 2 - th / 2 + push
    if (p.bottom) p.bottom.position.y = -h / 2 + th / 2 - push * 0.8
    // flaps: hinge at outer edge; lid opening rotates outward up to ~150°, explode lifts them
    flapRefs.current.forEach((g, i) => {
      if (!g) return
      const open = L * THREE.MathUtils.degToRad(150) * (i < 2 ? 1 : 0.85)
      g.rotation.set(0, 0, 0)
      if (i === 0) g.rotation.z = open // left flap (hinge -x)
      if (i === 1) g.rotation.z = -open // right flap
      if (i === 2) g.rotation.x = -open // front flap (hinge +z)
      if (i === 3) g.rotation.x = open // back flap
      g.position.y = h / 2 - th / 2 + E * (0.9 + i * 0.12)
    })
    if (core.current) {
      const m = core.current.material as THREE.MeshBasicMaterial
      m.opacity = G * 0.95
      core.current.scale.setScalar(0.6 + G * 0.5)
      core.current.visible = G > 0.001
    }
  }
  useImperativeHandle(
    ref,
    () => ({
      get group() {
        return group.current
      },
      setLid: (v) => {
        state.current.lid = v
        apply()
      },
      setExplode: (v) => {
        state.current.explode = v
        apply()
      },
      setGlow: (v) => {
        state.current.glow = v
        apply()
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const setPanel = (k: string) => (m: THREE.Mesh | null) => {
    if (m) {
      panels.current[k] = m
      apply()
    }
  }
  const setFlap = (i: number) => (g: THREE.Group | null) => {
    if (g) {
      flapRefs.current[i] = g
      apply()
    }
  }
  const shadow = { castShadow, receiveShadow }
  const flapW = w / 2
  const flapD = d
  return (
    <group ref={group} scale={scale} position={position} rotation={rotation} name="TujjorBox">
      {/* front (+Z) brand face */}
      <mesh ref={setPanel('front')} position={[0, 0, d / 2 - th / 2]} material={mats.front} {...shadow}>
        <boxGeometry args={[w, h, th]} />
      </mesh>
      {/* back (-Z) */}
      <mesh ref={setPanel('back')} position={[0, 0, -d / 2 + th / 2]} rotation={[0, Math.PI, 0]} material={mats.plain} {...shadow}>
        <boxGeometry args={[w, h, th]} />
      </mesh>
      {/* left (-X) / right (+X) arrows */}
      <mesh ref={setPanel('left')} position={[-w / 2 + th / 2, 0, 0]} rotation={[0, -Math.PI / 2, 0]} material={mats.side} {...shadow}>
        <boxGeometry args={[d, h, th]} />
      </mesh>
      <mesh ref={setPanel('right')} position={[w / 2 - th / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]} material={mats.side} {...shadow}>
        <boxGeometry args={[d, h, th]} />
      </mesh>
      {/* bottom */}
      <mesh ref={setPanel('bottom')} position={[0, -h / 2 + th / 2, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.plain} {...shadow}>
        <boxGeometry args={[w, d, th]} />
      </mesh>
      {/* inner cavity (dark kraft, back faces) */}
      <mesh material={mats.inner} scale={[w - th * 2, h - th * 2, d - th * 2]}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      {/* top flaps (hinged at outer edges) */}
      {flaps ? (
        <>
          <group ref={setFlap(0)} position={[-w / 2, h / 2 - th / 2, 0]}>
            <mesh position={[flapW / 2, 0, 0]} material={mats.plain} {...shadow}>
              <boxGeometry args={[flapW, th, flapD]} />
            </mesh>
          </group>
          <group ref={setFlap(1)} position={[w / 2, h / 2 - th / 2, 0]}>
            <mesh position={[-flapW / 2, 0, 0]} material={mats.plain} {...shadow}>
              <boxGeometry args={[flapW, th, flapD]} />
            </mesh>
          </group>
          <group ref={setFlap(2)} position={[0, h / 2 - th / 2 + 0.002, d / 2]}>
            <mesh position={[0, 0, -d / 4]} material={mats.plain} {...shadow}>
              <boxGeometry args={[w, th, d / 2]} />
            </mesh>
          </group>
          <group ref={setFlap(3)} position={[0, h / 2 - th / 2 + 0.002, -d / 2]}>
            <mesh position={[0, 0, d / 4]} material={mats.plain} {...shadow}>
              <boxGeometry args={[w, th, d / 2]} />
            </mesh>
          </group>
        </>
      ) : (
        <mesh position={[0, h / 2 - th / 2, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.plain} {...shadow}>
          <boxGeometry args={[w, d, th]} />
        </mesh>
      )}
      {/* inner glow core (final scene). Real light comes from the constant-topology light rig (lightRig.points[0]). */}
      <mesh ref={core} material={mats.coreMat} visible={false}>
        <sphereGeometry args={[0.16, 16, 16]} />
      </mesh>
      {children}
    </group>
  )
})
