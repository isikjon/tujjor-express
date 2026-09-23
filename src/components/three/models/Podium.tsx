'use client'
import { useMemo } from 'react'
import * as THREE from 'three'
import { useApp } from '@/lib/stores'
import { PROFILES } from '@/lib/quality'
import { SoftContactShadow } from '../fx/SoftContactShadow'

/**
 * Studio podium disc with a thin orange ring and (in-range only) a contact shadow.
 * Top surface at y=0. 2 draws (side+top as one geometry with 2 groups, ring) + the layer-3 contact shadow
 * (scenes opt meshes in with `obj.layers.enable(CONTACT_SHADOW_LAYER)`).
 */
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
  // cylinder without the bottom cap: groups 0 = side, 1 = top
  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(radius, radius, 0.12, 48, 1, false)
    // drop the bottom cap group (index 2) — never visible
    const groups = g.groups.slice(0, 2)
    const bottom = g.groups[2]
    const index = g.getIndex()!
    const arr = index.array.slice(0, bottom.start)
    g.setIndex(new THREE.BufferAttribute(arr, 1))
    g.clearGroups()
    groups.forEach((gr) => g.addGroup(gr.start, gr.count, gr.materialIndex))
    return g
  }, [radius])
  return (
    <group position={position}>
      <mesh position={[0, -0.06, 0]} geometry={geo} material={[mats.side, mats.top]} receiveShadow />
      {ring ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} material={mats.ring}>
          <ringGeometry args={[radius * 0.96, radius * 0.975, 96]} />
        </mesh>
      ) : null}
      {inRange && PROFILES[tier].contactShadows ? <SoftContactShadow position={[0, 0.003, 0]} opacity={0.55} scale={radius * 2.6} blur={2.2} far={2.5} resolution={256} interval={2} /> : null}
    </group>
  )
}
