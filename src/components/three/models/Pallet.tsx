'use client'
import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Euro pallet 1.2 × 0.15 × 0.8 (top at y=0.15). 2 draws: boards+base merged (light wood), 3 blocks merged (dark). */
let shared: { light: THREE.BufferGeometry; dark: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial; darkMat: THREE.MeshStandardMaterial } | null = null
function getShared() {
  if (shared) return shared
  const boards = [-0.3, 0, 0.3].map((z) => new THREE.BoxGeometry(1.2, 0.04, 0.18).translate(0, 0.13, z))
  const base = new THREE.BoxGeometry(1.2, 0.04, 0.8).translate(0, 0.02, 0)
  const light = mergeGeometries([...boards, base])!
  const blocks = [-0.5, 0, 0.5].map((x) => new THREE.BoxGeometry(0.14, 0.09, 0.8).translate(x, 0.065, 0))
  const dark = mergeGeometries(blocks)!
  shared = {
    light,
    dark,
    mat: new THREE.MeshStandardMaterial({ color: '#8a6a45', roughness: 0.95, metalness: 0 }),
    darkMat: new THREE.MeshStandardMaterial({ color: '#5e4730', roughness: 1, metalness: 0 }),
  }
  return shared
}
export function Pallet({ position, rotation, scale = 1, castShadow = true }: { position?: [number, number, number]; rotation?: [number, number, number]; scale?: number; castShadow?: boolean }) {
  const s = useMemo(() => getShared(), [])
  return (
    <group position={position} rotation={rotation} scale={scale} name="Pallet">
      <mesh geometry={s.light} material={s.mat} castShadow={castShadow} receiveShadow />
      <mesh geometry={s.dark} material={s.darkMat} castShadow={castShadow} />
    </group>
  )
}
export const PALLET_TOP = 0.15
