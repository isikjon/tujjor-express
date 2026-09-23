'use client'
import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { ContactShadows } from '@react-three/drei'
import { WORLD_OFFSET } from '@/lib/timeline'
import { useApp } from '@/lib/stores'
import { TujjorBox, type TujjorBoxHandle } from '../models/TujjorBox'
import { Particles } from '../fx/Particles'
import { GridFloor } from '../fx/GridFloor'
import { PROFILES } from '@/lib/quality'

/** World E: calm studio backdrop for /services, /business, /tracking, /contacts — the box idles, particles drift. */
export function InnerPageScene() {
  const box = useRef<TujjorBoxHandle>(null)
  const tier = useApp((s) => s.tier)
  const t = useRef(0)
  useFrame((_, dt) => {
    if (useApp.getState().route === '/') return
    if (!useApp.getState().motionOff) t.current += Math.min(dt, 0.05)
    const g = box.current?.group
    if (g) {
      g.rotation.y = Math.sin(t.current * 0.25) * 0.35 + 0.4
      g.position.y = 0.6 + Math.sin(t.current * 0.8) * 0.03
      g.rotation.x = Math.sin(t.current * 0.4) * 0.05
    }
  })
  const route = useApp((s) => s.route)
  const visible = route !== '/'
  return (
    <group position={[WORLD_OFFSET.E, 0, 0]} visible={visible}>
      <TujjorBox ref={box} mode="static" position={[0, 0.6, 0]} rotation={[0, 0.4, 0]} />
      <GridFloor size={80} cell={1} fade={22} opacity={0.7} />
      {PROFILES[tier].contactShadows && <ContactShadows position={[0, 0.001, 0]} opacity={0.6} scale={8} blur={2.4} far={2} frames={1} color="#000000" />}
      <Particles count={400} spread={[14, 8, 14]} color="#ffb27a" size={0.9} opacity={0.5} seed={77} />
      {/* faint route line behind the box */}
      <mesh position={[0, 1.4, -4]} rotation={[0, 0, -0.12]}>
        <planeGeometry args={[18, 0.01]} />
        <meshBasicMaterial color="#ff6a00" transparent opacity={0.35} toneMapped={false} />
      </mesh>
    </group>
  )
}
export const innerLights = undefined
export { THREE }
