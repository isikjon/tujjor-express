'use client'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { scroll, useApp } from '@/lib/stores'
import { STAGE_BY_ID, localTU } from '@/lib/timeline'
import { easeInOutCubic } from '@/lib/easing'

/**
 * Camera-space DoorMask: two black door leaves at the near plane that swing open during
 * the first 20% of the globe stage — the container doors "open again" onto space.
 * Sized to the frustum every frame, so any camera pose works. renderOrder 999, no depth test.
 */
export function CameraMasks() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const group = useRef<THREE.Group>(null!)
  const left = useRef<THREE.Group>(null!)
  const right = useRef<THREE.Group>(null!)
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#000000', depthTest: false, depthWrite: false, toneMapped: false }), [])
  const seam = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff8a2a', depthTest: false, depthWrite: false, toneMapped: false, transparent: true, opacity: 0.9 }), [])
  const globe = STAGE_BY_ID.globe
  useFrame(() => {
    const g = group.current
    if (!g) return
    const home = useApp.getState().route === '/'
    const t = localTU(scroll.pd, globe)
    const open = t >= 0 && t <= 0.2 && home ? easeInOutCubic(t / 0.2) : t < 0 ? 0 : 1
    const show = home && t > -0.02 && t < 0.2
    g.visible = show
    if (!show) return
    // place in front of the camera and size to the frustum at z = -0.5
    const z = 0.5
    const h = 2 * z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.4
    const w = h * camera.aspect * 1.4
    g.position.copy(camera.position)
    g.quaternion.copy(camera.quaternion)
    g.translateZ(-z)
    const angle = open * THREE.MathUtils.degToRad(165)
    left.current.position.x = -w / 2
    right.current.position.x = w / 2
    left.current.rotation.y = -angle
    right.current.rotation.y = angle
    left.current.scale.set(w / 2, h, 1)
    right.current.scale.set(w / 2, h, 1)
  })
  return (
    <group ref={group} visible={false} renderOrder={999}>
      <group ref={left}>
        <mesh position={[0.5, 0, 0]} material={mat} renderOrder={999}>
          <planeGeometry args={[1, 1]} />
        </mesh>
        <mesh position={[0.995, 0, 0.001]} material={seam} renderOrder={1000}>
          <planeGeometry args={[0.01, 1]} />
        </mesh>
      </group>
      <group ref={right}>
        <mesh position={[-0.5, 0, 0]} material={mat} renderOrder={999}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      </group>
    </group>
  )
}
