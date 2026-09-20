'use client'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useStageFrame, useSceneReady } from '@/hooks/useStage'
import { useApp } from '@/lib/stores'
import { PROFILES } from '@/lib/quality'
import { easeOutCubic } from '@/lib/easing'
import { range } from '@/lib/math'
import { introState } from '../IntroSequence'
import { TujjorBox, type TujjorBoxHandle } from '../models/TujjorBox'
import { Pallet, PALLET_TOP } from '../models/Pallet'
import { Particles } from '../fx/Particles'
import { GridFloor } from '../fx/GridFloor'
import { GlowLine } from '../fx/GlowLine'
import { corrugatedNormal } from '@/lib/textures'
import type { SceneProps } from './types'
export { cameraAt, lights } from './HeroScene.camera'

const BOX_H = 0.45

/**
 * §01 HERO — the box floats above its pallet in a dark logistics space: shader grid, thin orange
 * route arcs, pins, far containers, particles. At t .85–1 it settles onto the pallet (hand-off to
 * the warehouse). During the intro it turns +35° and reveals with the light rig.
 */
export default function HeroScene({ stage }: SceneProps) {
  const tier = useApp((s) => s.tier)
  const profile = PROFILES[tier]
  const box = useRef<TujjorBoxHandle>(null)
  const arcs = useRef<THREE.Group>(null!)
  const pins = useRef<THREE.Group>(null!)

  const arcPoints = useMemo(() => {
    const mk = (a: THREE.Vector3, b: THREE.Vector3, lift: number) => {
      const pts: THREE.Vector3[] = []
      for (let i = 0; i <= 24; i++) {
        const t = i / 24
        pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, Math.sin(t * Math.PI) * lift, 0)))
      }
      return pts
    }
    return [
      mk(new THREE.Vector3(-14, 0.2, -10), new THREE.Vector3(9, 0.2, -4), 2.6),
      mk(new THREE.Vector3(-9, 0.2, 5), new THREE.Vector3(14, 0.2, -9), 1.8),
      mk(new THREE.Vector3(12, 0.2, 8), new THREE.Vector3(-12, 0.2, -12), 3.2),
      mk(new THREE.Vector3(-16, 0.2, -2), new THREE.Vector3(2, 0.2, -16), 1.4),
    ]
  }, [])
  const pinData = useMemo(
    () => [
      [-6, -4],
      [5, 3],
      [-3, 6],
      [9, -7],
      [3, -9],
      [-9, 5],
    ],
    [],
  )
  const containerMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#1a1d24', roughness: 0.7, metalness: 0.5, normalMap: corrugatedNormal(256, 10), normalScale: new THREE.Vector2(0.6, 0.6) }),
    [],
  )
  const edgeMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff6a00', toneMapped: false, transparent: true, opacity: 0.55 }), [])
  useSceneReady(stage.id)

  useStageFrame(stage, ({ t, tu, time }) => {
    const b = box.current
    if (!b) return
    // hover + breathing, then settle onto the pallet at t .85–1
    const settle = easeOutCubic(range(t, 0.85, 1))
    const breathe = Math.sin(time * 2.5) * 0.03 * (1 - settle)
    const y = THREE.MathUtils.lerp(0.9, PALLET_TOP + BOX_H / 2, settle) + breathe
    b.group.position.set(0, y, 0)
    const yaw = 0.35 + Math.sin(time * 0.3) * 0.05 * (1 - settle) + (introState.active ? introState.boxYaw : 0)
    b.group.rotation.set(Math.sin(time * 0.45) * 0.02 * (1 - settle), yaw, 0)
    // intro reveal: hide until the light ramp begins
    b.group.visible = !introState.active || introState.boxReveal > 0.001
    // arcs & pins fade out during the first 12% of the warehouse stage (tu > 1)
    const fade = 1 - range(tu, 1.0, 1.17)
    arcs.current.visible = fade > 0.001
    pins.current.visible = fade > 0.001
    arcs.current.scale.setScalar(1)
    pins.current.children.forEach((c, i) => {
      c.scale.setScalar(fade * (0.9 + 0.1 * Math.sin(time * 2 + i)))
    })
  })

  return (
    <group name="HeroScene">
      <TujjorBox ref={box} position={[0, 0.9, 0]} rotation={[0, 0.35, 0]} />
      <Pallet position={[0, 0, 0]} rotation={[0, 0.35, 0]} />
      <GridFloor size={140} cell={1} fade={38} opacity={1} />
      <group ref={arcs}>
        {arcPoints.map((pts, i) => (
          <GlowLine key={i} points={pts} radius={0.012} opacity={0.4} speed={0.35 + i * 0.1} pulses={3} tubularSegments={48} radialSegments={4} />
        ))}
      </group>
      <group ref={pins}>
        {pinData.map(([x, z], i) => (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, 0.5, 0]}>
              <cylinderGeometry args={[0.01, 0.01, 1, 4]} />
              <meshBasicMaterial color="#ff6a00" toneMapped={false} transparent opacity={0.6} />
            </mesh>
            <mesh position={[0, 1.05, 0]}>
              <sphereGeometry args={[0.05, 8, 8]} />
              <meshBasicMaterial color="#ff8a2a" toneMapped={false} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
              <ringGeometry args={[0.18, 0.22, 24]} />
              <meshBasicMaterial color="#ff6a00" toneMapped={false} transparent opacity={0.35} side={THREE.DoubleSide} />
            </mesh>
          </group>
        ))}
      </group>
      {/* far containers — the loading dock silhouette (stay through the warehouse) */}
      {[
        [-14, -12, 0.2],
        [-10, -16, -0.3],
        [12, -14, 0.5],
      ].map(([x, z, r], i) => (
        <group key={i} position={[x, 1.3, z]} rotation={[0, r, 0]}>
          <mesh material={containerMat} castShadow receiveShadow>
            <boxGeometry args={[6, 2.6, 2.4]} />
          </mesh>
          <mesh position={[0, -1.29, 1.21]} material={edgeMat}>
            <boxGeometry args={[6, 0.02, 0.02]} />
          </mesh>
        </group>
      ))}
      <Particles count={Math.round(600 * Math.max(0.25, profile.particles))} spread={[24, 9, 24]} position={[0, 3, 0]} color="#ffb27a" size={0.9} opacity={0.6} seed={3} />
    </group>
  )
}
