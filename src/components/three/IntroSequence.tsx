'use client'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import gsap from 'gsap'
import { useApp } from '@/lib/stores'
import { audio } from '@/lib/audio'
import type { CameraPose } from '@/lib/camera'
import { easeOutExpo } from '@/lib/easing'

export const INTRO_DURATION = 1.6

/**
 * Shared intro state (mutable, read in useFrame by the rig, lights and HeroScene).
 *  t          seconds since intro start
 *  progress   0..1
 *  lightScale multiplier for the whole light rig (darkness → full)
 *  boxYaw     extra yaw applied by HeroScene to the box during the intro
 *  pose       camera pose while the intro owns the camera (null once handed to the rig)
 */
export const introState = {
  active: false,
  t: 0,
  progress: 0,
  lightScale: 1,
  boxYaw: 0,
  boxReveal: 1,
  pose: null as CameraPose | null,
}
const ref = { current: introState }
export const useIntroState = () => ref

export function shouldSkipIntro(): boolean {
  if (typeof window === 'undefined') return true
  try {
    if (window.sessionStorage.getItem('tj_intro') === '1') return true
  } catch {
    /* ignore */
  }
  return useApp.getState().motionOff || useApp.getState().route !== '/'
}

/** Orange beam that sweeps through the dark at t≈0.1 s and reveals the box. */
export function IntroSequence() {
  const phase = useApp((s) => s.phase)
  const setPhase = useApp((s) => s.setPhase)
  const beam = useRef<THREE.Mesh>(null!)
  const beamMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }), [])
  const glowMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff6a00', transparent: true, opacity: 0, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }), [])
  const glow = useRef<THREE.Mesh>(null!)

  useEffect(() => {
    if (phase !== 'intro') return
    if (shouldSkipIntro()) {
      setPhase('live')
      return
    }
    introState.active = true
    introState.t = 0
    introState.progress = 0
    introState.lightScale = 0
    introState.boxYaw = 0
    introState.boxReveal = 0
    audio.whoosh(0.9, 1.4)
    const tl = gsap.to(introState, {
      t: INTRO_DURATION,
      duration: INTRO_DURATION,
      ease: 'none',
      onComplete: finish,
    })
    const end = () => finish()
    function finish() {
      if (!introState.active) return
      introState.active = false
      introState.pose = null
      introState.lightScale = 1
      introState.boxReveal = 1
      try {
        window.sessionStorage.setItem('tj_intro', '1')
      } catch {
        /* ignore */
      }
      setPhase('live')
    }
    // any interaction ends the intro instantly (never trap the user)
    window.addEventListener('wheel', end, { passive: true, once: true })
    window.addEventListener('touchstart', end, { passive: true, once: true })
    window.addEventListener('keydown', end, { once: true })
    window.addEventListener('pointerdown', end, { once: true })
    return () => {
      tl.kill()
      window.removeEventListener('wheel', end)
      window.removeEventListener('touchstart', end)
      window.removeEventListener('keydown', end)
      window.removeEventListener('pointerdown', end)
    }
  }, [phase, setPhase])

  useFrame(() => {
    if (!introState.active) {
      if (beam.current) beam.current.visible = false
      if (glow.current) glow.current.visible = false
      return
    }
    const t = introState.t
    introState.progress = t / INTRO_DURATION
    // beam sweep 0.10 → 0.45 s, left → right at -12°, brightest mid-way
    const bt = (t - 0.1) / 0.35
    if (beam.current) {
      beam.current.visible = bt > 0 && bt < 1
      beam.current.position.set(-9 + 18 * bt, 1.2 - 2.2 * bt, 0.9)
      beamMat.opacity = Math.sin(Math.min(1, Math.max(0, bt)) * Math.PI) * 0.95
    }
    if (glow.current) {
      const g = Math.sin(Math.min(1, Math.max(0, bt)) * Math.PI)
      glow.current.visible = g > 0.01
      glowMat.opacity = g * 0.35
      glow.current.position.copy(beam.current.position)
    }
    // lights fade up 0.35 → 1.05 s
    introState.lightScale = easeOutExpo(Math.min(1, Math.max(0, (t - 0.35) / 0.7)))
    introState.boxReveal = introState.lightScale
    // box turns +35° between 0.8 and 1.35 s
    introState.boxYaw = THREE.MathUtils.degToRad(35) * easeOutExpo(Math.min(1, Math.max(0, (t - 0.8) / 0.55)))
    // camera: push-in from z 4.5 → 3.6 (0 → 1.35 s); after 1.35 s the rig takes over and re-frames to the hero pose
    if (t < 1.35) {
      const k = easeOutExpo(t / 1.35)
      introState.pose = { position: [0.15, 0.95, 4.5 - 0.9 * k], target: [0, 0.75, 0], fov: 32 }
    } else {
      introState.pose = null
    }
  })

  return (
    <group>
      <mesh ref={beam} rotation={[0, 0, THREE.MathUtils.degToRad(-12)]} material={beamMat} visible={false} renderOrder={10}>
        <planeGeometry args={[30, 0.02]} />
      </mesh>
      <mesh ref={glow} rotation={[0, 0, THREE.MathUtils.degToRad(-12)]} material={glowMat} visible={false} renderOrder={9}>
        <planeGeometry args={[30, 0.5]} />
      </mesh>
    </group>
  )
}
