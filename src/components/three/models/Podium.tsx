'use client'
import { useMemo } from 'react'
import * as THREE from 'three'
import { ContactShadows } from '@react-three/drei'
import { useApp } from '@/lib/stores'
import { PROFILES } from '@/lib/quality'

/** Studio podium disc with a thin orange ring and (in-range only) contact shadows. Top surface at y=0. */
export function Podium({ radius = 2.2, inRange = true, ring = true, position }: { radius?: number; inRange?: boolean; ring?: boolean; position?: [number, number, number] }) {
  const tier = useApp((s) => s.tier)
  const mats = useMemo(
    () => ({
      top: new THREE.MeshStandardMaterial({ color: '#f2efe9', roughness: 0.6, metalness: 0 }),
      side: new THREE.MeshStandardMaterial({ color: '#c9c4bb', roughness: 0.7, metalness: 0 }),
      ring: new THREE.MeshBasicMaterial({ color: '#ff6a00', toneMapped: false, transparent: true, opacity: 0.85 }),
    }),
    [],
  )
  return (
    <group position={position}>
      <mesh position={[0, -0.06, 0]} material={[mats.side, mats.top, mats.side]} receiveShadow>
        <cylinderGeometry args={[radius, radius, 0.12, 64]} />
      </mesh>
      {ring ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} material={mats.ring}>
          <ringGeometry args={[radius * 0.96, radius * 0.975, 96]} />
        </mesh>
      ) : null}
      {inRange && PROFILES[tier].contactShadows ? <ContactShadows position={[0, 0.003, 0]} opacity={0.55} scale={radius * 2.6} blur={2.2} far={2.5} resolution={256} frames={Infinity} color="#000000" /> : null}
    </group>
  )
}
