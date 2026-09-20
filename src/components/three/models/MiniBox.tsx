'use client'
import { forwardRef, useMemo } from 'react'
import * as THREE from 'three'
import { cardboardTextures } from '@/lib/textures'
import { BOX_SIZE } from './TujjorBox'

/** Lightweight single-mesh Tujjor box (same cardboard, brand face +Z) for cargo indicators / comets / tracking. */
export const MiniBox = forwardRef<THREE.Mesh, { size?: number; emissive?: number; position?: [number, number, number] }>(function MiniBox({ size = 0.25, emissive = 0, position }, ref) {
  const mats = useMemo(() => {
    const f = cardboardTextures(512, 0)
    const s = cardboardTextures(512, 2)
    const p = cardboardTextures(512, 1)
    const mk = (t: typeof f) => new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 0.9, emissive: '#ff6a00', emissiveIntensity: emissive })
    // order: +x, -x, +y, -y, +z, -z
    return [mk(s), mk(s), mk(p), mk(p), mk(f), mk(p)]
  }, [emissive])
  const k = size / BOX_SIZE[0]
  return (
    <mesh ref={ref} material={mats} position={position} castShadow>
      <boxGeometry args={[BOX_SIZE[0] * k, BOX_SIZE[1] * k, BOX_SIZE[2] * k]} />
    </mesh>
  )
})
