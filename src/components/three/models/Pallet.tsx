'use client'
import { useMemo } from 'react'
import * as THREE from 'three'

/** Euro pallet 1.2 × 0.15 × 0.8 (top at y=0.15). Cheap: 3 top boards merged into one geometry + 3 blocks. */
export function Pallet({ position, rotation, scale = 1 }: { position?: [number, number, number]; rotation?: [number, number, number]; scale?: number }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8a6a45', roughness: 0.95, metalness: 0 }), [])
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: '#5e4730', roughness: 1, metalness: 0 }), [])
  return (
    <group position={position} rotation={rotation} scale={scale} name="Pallet">
      {[-0.3, 0, 0.3].map((z) => (
        <mesh key={z} position={[0, 0.13, z]} material={mat} castShadow receiveShadow>
          <boxGeometry args={[1.2, 0.04, 0.18]} />
        </mesh>
      ))}
      {[-0.5, 0, 0.5].map((x) => (
        <mesh key={x} position={[x, 0.065, 0]} material={dark} castShadow>
          <boxGeometry args={[0.14, 0.09, 0.8]} />
        </mesh>
      ))}
      <mesh position={[0, 0.02, 0]} material={mat} receiveShadow>
        <boxGeometry args={[1.2, 0.04, 0.8]} />
      </mesh>
    </group>
  )
}
export const PALLET_TOP = 0.15
