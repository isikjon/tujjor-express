'use client'
import { forwardRef, useMemo } from 'react'
import * as THREE from 'three'
import { cardboardAtlas, cardboardTextures, type CardboardVariant } from '@/lib/textures'
import { BOX_SIZE } from './TujjorBox'

interface Props {
  size?: number
  emissive?: number
  position?: [number, number, number]
  castShadow?: boolean
  /** true = ONE atlas material (1 draw) instead of the 6-material array (6 draws); default true */
  flat?: boolean
}
/** Lightweight single-mesh Tujjor box (same cardboard, brand face +Z) for cargo indicators / comets / tracking. */
export const MiniBox = forwardRef<THREE.Mesh, Props>(function MiniBox({ size = 0.25, emissive = 0, position, castShadow = true, flat = true }, ref) {
  const k = size / BOX_SIZE[0]
  const { geometry, material } = useMemo(() => {
    const g = new THREE.BoxGeometry(BOX_SIZE[0] * k, BOX_SIZE[1] * k, BOX_SIZE[2] * k)
    if (!flat) {
      const f = cardboardTextures(512, 0)
      const s = cardboardTextures(512, 2)
      const p = cardboardTextures(512, 1)
      const mk = (t: typeof f) => new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 0.9, emissive: '#ff6a00', emissiveIntensity: emissive })
      return { geometry: g, material: [mk(s), mk(s), mk(p), mk(p), mk(f), mk(p)] as THREE.Material[] }
    }
    const atlas = cardboardAtlas(512)
    const faceVariant: CardboardVariant[] = [2, 2, 3, 1, 0, 1]
    const uv = g.getAttribute('uv') as THREE.BufferAttribute
    for (let face = 0; face < 6; face++) {
      const [u0, u1] = atlas.tile(faceVariant[face])
      for (let i = 0; i < 4; i++) {
        const idx = face * 4 + i
        uv.setX(idx, u0 + uv.getX(idx) * (u1 - u0))
      }
    }
    uv.needsUpdate = true
    const material = new THREE.MeshStandardMaterial({ map: atlas.map, normalMap: atlas.normalMap, roughnessMap: atlas.roughnessMap, roughness: 0.9, emissive: '#ff6a00', emissiveIntensity: emissive })
    return { geometry: g, material }
  }, [k, emissive, flat])
  return <mesh ref={ref} geometry={geometry} material={material} position={position} castShadow={castShadow} />
})
