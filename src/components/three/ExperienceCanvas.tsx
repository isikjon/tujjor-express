'use client'
import { Suspense, useEffect, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AdaptiveEvents, Preload } from '@react-three/drei'
import { usePathname } from 'next/navigation'
import { useApp } from '@/lib/stores'
import { stepProgress } from '@/hooks/useLenis'
import { PROFILES } from '@/lib/quality'
import { CameraRig } from './CameraRig'
import { Lights } from './Lights'
import { Effects } from './Effects'
import { QualityController } from './QualityController'
import { HomeScenes } from './HomeScenes'
import { InnerPageScene } from './scenes/InnerPageScene'
import { PageTransitionScene } from './scenes/PageTransitionScene'
import { IntroSequence } from './IntroSequence'
import { DebugOverlay } from './DebugOverlay'
import { StageEvents } from './StageEvents'
import { CameraMasks } from './CameraMasks'

function ProgressStep() {
  useFrame((_, dt) => stepProgress(Math.min(dt, 0.05)), -100)
  return null
}
function FirstFrame() {
  const mark = useApp((s) => s.markSceneReady)
  useFrame(() => {
    if (!useApp.getState().readyScenes.has('__frame__')) mark('__frame__')
  })
  return null
}
function VisibilityPause() {
  const set = useThree((s) => s.setFrameloop)
  useEffect(() => {
    const on = () => set(document.hidden ? 'never' : 'always')
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [set])
  return null
}
function ContextGuard({ onLost }: { onLost: () => void }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const el = gl.domElement
    const lost = (e: Event) => {
      e.preventDefault()
    }
    const restored = () => onLost()
    el.addEventListener('webglcontextlost', lost)
    el.addEventListener('webglcontextrestored', restored)
    return () => {
      el.removeEventListener('webglcontextlost', lost)
      el.removeEventListener('webglcontextrestored', restored)
    }
  }, [gl, onLost])
  return null
}

/**
 * The one persistent WebGL canvas for the whole site (fixed, 100lvh, behind all HTML).
 * Home: 13 story scenes. Inner pages: world E. Route changes never recreate the context.
 */
export function ExperienceCanvas() {
  const tier = useApp((s) => s.tier)
  const pathname = usePathname()
  const setRoute = useApp((s) => s.setRoute)
  const [key, setKey] = useState(0)
  const debug = useApp((s) => s.debug)
  useEffect(() => {
    setRoute(pathname)
  }, [pathname, setRoute])
  const profile = PROFILES[tier]

  return (
    <div aria-hidden="true" className="pointer-events-none fixed left-0 top-0 z-0 h-[100lvh] w-full">
      <Canvas
        key={key}
        dpr={[1, profile.dpr]}
        shadows={profile.shadowMap > 0 ? { type: THREE.PCFSoftShadowMap } : false}
        camera={{ fov: 34, near: 0.1, far: 400, position: [0, 1.4, 4.2] }}
        gl={{
          antialias: false,
          powerPreference: 'high-performance',
          alpha: false,
          stencil: false,
          depth: true,
          toneMapping: THREE.NoToneMapping,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
        resize={{ debounce: { scroll: 0, resize: 250 } }}
        eventSource={typeof document !== 'undefined' ? document.body : undefined}
        eventPrefix="client"
        style={{ pointerEvents: 'none' }}
        frameloop="always"
        onCreated={({ gl, scene, raycaster }) => {
          scene.background = new THREE.Color('#0b0c0f')
          gl.setClearColor('#0b0c0f', 1)
          // only objects that opted in (layers.enable(1)) are raycast — keeps pointer moves cheap
          raycaster.layers.set(1)
        }}
      >
        <color attach="background" args={['#0b0c0f']} />
        <ProgressStep />
        <ContextGuard onLost={() => setKey((k) => k + 1)} />
        <QualityController />
        <VisibilityPause />
        <AdaptiveEvents />
        <CameraRig />
        <StageEvents />
        <Lights />
        <CameraMasks />
        <Suspense fallback={null}>
          <HomeScenes />
          <InnerPageScene />
          <PageTransitionScene />
          <IntroSequence />
          <Preload all />
        </Suspense>
        <Effects />
        <FirstFrame />
        {debug ? <DebugOverlay /> : null}
      </Canvas>
    </div>
  )
}
