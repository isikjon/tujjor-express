'use client'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import gsap from 'gsap'
import { useApp } from '@/lib/stores'
import { TujjorBox, type TujjorBoxHandle } from '../models/TujjorBox'

/**
 * Page transition: the box sweeps across the camera (camera-space, so it works from any pose),
 * timed with the HTML line wipe in TransitionOverlay.
 */
export function PageTransitionScene() {
  const transitioning = useApp((s) => s.transitioning)
  const box = useRef<TujjorBoxHandle>(null)
  const holder = useRef<THREE.Group>(null!)
  const camera = useThree((s) => s.camera)
  const anim = useRef({ x: 3, y: -0.4, rot: 0, on: false })

  useEffect(() => {
    if (!transitioning) return
    const a = anim.current
    a.on = true
    a.x = 3.2
    a.y = -0.5
    a.rot = -0.6
    const tl = gsap.timeline({ onComplete: () => (a.on = false) })
    tl.to(a, { x: -3.2, y: 0.35, rot: 0.9, duration: 1.15, ease: 'power3.inOut' })
    return () => {
      tl.kill()
      a.on = false
    }
  }, [transitioning])

  useFrame(() => {
    const a = anim.current
    const g = holder.current
    if (!g) return
    g.visible = a.on
    if (!a.on) return
    // place in front of the camera
    g.position.copy(camera.position)
    g.quaternion.copy(camera.quaternion)
    g.translateZ(-2.2)
    g.translateX(a.x)
    g.translateY(a.y)
    const bg = box.current?.group
    if (bg) {
      bg.rotation.set(a.rot * 0.5, a.rot, a.rot * 0.3)
    }
  })
  return (
    <group ref={holder} visible={false}>
      <TujjorBox ref={box} scale={1.4} castShadow={false} receiveShadow={false} />
    </group>
  )
}
