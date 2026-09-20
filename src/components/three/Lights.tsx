'use client'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { scroll, useApp } from '@/lib/stores'
import { PROFILES } from '@/lib/quality'
import { STAGES, WORLD_OFFSET, stageAt, stageIndex, localT } from '@/lib/timeline'
import { BASE_PRESET, lerp3, lerpColor, liveLights, type LightPreset } from '@/lib/lights'
import { lightRegistry } from './registry'
import { useIntroState } from './IntroSequence'

const XFADE = 0.012 // progress window over which presets blend at a (non-cut) boundary

/**
 * Constant-topology light rig + procedural studio environment (no HDR files, no CDN).
 * Every frame: find the current stage preset (and blend with the neighbour near a boundary),
 * then write intensities/colors/positions. Nothing is ever toggled visible → no shader recompiles.
 */
export function Lights() {
  const tier = useApp((s) => s.tier)
  const profile = PROFILES[tier]
  const scene = useThree((s) => s.scene)
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const key = useRef<THREE.DirectionalLight>(null!)
  const keyTarget = useRef<THREE.Object3D>(null!)
  const spots = useRef<THREE.SpotLight[]>([])
  const spotTargets = useRef<THREE.Object3D[]>([])
  const points = useRef<THREE.PointLight[]>([])
  const fog = useMemo(() => new THREE.FogExp2(BASE_PRESET.fog.color, BASE_PRESET.fog.density), [])
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), c: new THREE.Color() }), [])
  const introOverride = useIntroState()

  useFrame(() => {
    if (!scene.fog) scene.fog = fog
    const p = scroll.pd
    const stage = stageAt(p)
    const home = useApp.getState().route === '/'
    const a = (home && lightRegistry[stage.id]) || BASE_PRESET
    const offA = home ? WORLD_OFFSET[stage.world] : WORLD_OFFSET.E
    // neighbour blend
    let b: LightPreset = a
    let offB = offA
    let mix = 0
    const i = stageIndex(stage.id)
    const t = localT(p, stage)
    if (home) {
      if (t < XFADE / (stage.end - stage.start) && i > 0 && !STAGES[i - 1].cutAtEnd) {
        const prev = STAGES[i - 1]
        b = lightRegistry[prev.id] || BASE_PRESET
        offB = WORLD_OFFSET[prev.world]
        mix = 0.5 - (t * (stage.end - stage.start)) / XFADE / 2
      } else if (t > 1 - XFADE / (stage.end - stage.start) && i < STAGES.length - 1 && !stage.cutAtEnd) {
        const next = STAGES[i + 1]
        b = lightRegistry[next.id] || BASE_PRESET
        offB = WORLD_OFFSET[next.world]
        mix = 0.5 - ((1 - t) * (stage.end - stage.start)) / XFADE / 2
      }
    }
    mix = Math.max(0, Math.min(1, mix))
    const io = introOverride.current
    const dim = io.active ? io.lightScale : 1

    // hemisphere
    hemi.current.intensity = THREE.MathUtils.lerp(a.hemi.intensity, b.hemi.intensity, mix) * dim
    hemi.current.color.copy(lerpColor(a.hemi.sky, b.hemi.sky, mix, tmp.c))
    hemi.current.groundColor.copy(lerpColor(a.hemi.ground, b.hemi.ground, mix, tmp.c))
    // key
    key.current.intensity = THREE.MathUtils.lerp(a.key.intensity, b.key.intensity, mix) * dim
    key.current.color.copy(lerpColor(a.key.color ?? '#ffffff', b.key.color ?? '#ffffff', mix, tmp.c))
    lerp3(a.key.position, b.key.position, mix, tmp.v)
    key.current.position.set(tmp.v.x + THREE.MathUtils.lerp(offA, offB, mix), tmp.v.y, tmp.v.z)
    lerp3(a.key.target, b.key.target, mix, tmp.v)
    keyTarget.current.position.set(tmp.v.x + THREE.MathUtils.lerp(offA, offB, mix), tmp.v.y, tmp.v.z)
    // spots
    for (let s = 0; s < 4; s++) {
      const L = spots.current[s]
      const T = spotTargets.current[s]
      if (!L || !T) continue
      const sa = a.spots[s]
      const sb = b.spots[s]
      L.intensity = THREE.MathUtils.lerp(sa.intensity, sb.intensity, mix) * dim
      L.color.copy(lerpColor(sa.color ?? '#ffffff', sb.color ?? '#ffffff', mix, tmp.c))
      L.angle = THREE.MathUtils.lerp(sa.angle ?? 0.6, sb.angle ?? 0.6, mix)
      L.penumbra = THREE.MathUtils.lerp(sa.penumbra ?? 0.6, sb.penumbra ?? 0.6, mix)
      L.distance = THREE.MathUtils.lerp(sa.distance ?? 40, sb.distance ?? 40, mix)
      lerp3(sa.position, sb.position, mix, tmp.v)
      L.position.set(tmp.v.x + THREE.MathUtils.lerp(offA, offB, mix), tmp.v.y, tmp.v.z)
      lerp3(sa.target, sb.target, mix, tmp.v)
      T.position.set(tmp.v.x + THREE.MathUtils.lerp(offA, offB, mix), tmp.v.y, tmp.v.z)
    }
    // points (point 0 = 'glow', may be overridden live by scenes through liveLights.pointOverride)
    for (let s = 0; s < 2; s++) {
      const L = points.current[s]
      if (!L) continue
      const pa = a.points[s]
      const pb = b.points[s]
      L.intensity = THREE.MathUtils.lerp(pa.intensity, pb.intensity, mix) * dim
      L.color.copy(lerpColor(pa.color ?? '#ff8a2a', pb.color ?? '#ff8a2a', mix, tmp.c))
      L.distance = THREE.MathUtils.lerp(pa.distance ?? 12, pb.distance ?? 12, mix)
      lerp3(pa.position, pb.position, mix, tmp.v)
      L.position.set(tmp.v.x + THREE.MathUtils.lerp(offA, offB, mix), tmp.v.y, tmp.v.z)
    }
    // fog + env + bloom
    fog.density = THREE.MathUtils.lerp(a.fog.density, b.fog.density, mix)
    fog.color.copy(lerpColor(a.fog.color, b.fog.color, mix, tmp.c))
    liveLights.fogDensity = fog.density
    liveLights.fogColor.copy(fog.color)
    liveLights.bloom = THREE.MathUtils.lerp(a.bloom, b.bloom, mix)
    scene.environmentIntensity = THREE.MathUtils.lerp(a.env, b.env, mix) * dim
    if (scene.background instanceof THREE.Color) scene.background.copy(fog.color)
  })

  const shadowSize = profile.shadowMap
  return (
    <>
      <hemisphereLight ref={hemi} intensity={0.35} color="#3a3f4b" groundColor="#0b0c0f" />
      <directionalLight
        ref={key}
        intensity={2}
        position={[4, 8, 6]}
        castShadow={shadowSize > 0}
        shadow-mapSize={[shadowSize || 1, shadowSize || 1]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-near={0.5}
        shadow-camera-far={80}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
      >
        <object3D ref={keyTarget} attach="target" />
      </directionalLight>
      {[0, 1, 2, 3].map((i) => (
        <spotLight
          key={i}
          ref={(el) => {
            if (el) spots.current[i] = el
          }}
          intensity={0}
          angle={0.6}
          penumbra={0.6}
          distance={40}
          decay={1.6}
        >
          <object3D
            ref={(el) => {
              if (el) spotTargets.current[i] = el
            }}
            attach="target"
          />
        </spotLight>
      ))}
      {[0, 1].map((i) => (
        <pointLight
          key={i}
          ref={(el) => {
            if (el) points.current[i] = el
          }}
          intensity={0}
          distance={12}
          decay={2}
          color="#ff8a2a"
        />
      ))}
      {/* Procedural studio environment: soft white key from above, cool fill, orange rim. */}
      <Environment resolution={tier === 'low' ? 64 : 128} frames={1} environmentIntensity={0.8}>
        <color attach="background" args={['#0e1014']} />
        <Lightformer form="rect" intensity={3} color="#fff4ea" position={[0, 6, -4]} scale={[8, 3, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.2} color="#dfe6f2" position={[-7, 2, 2]} scale={[2, 6, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={2.4} color="#ff6a00" position={[7, 1.5, -1]} scale={[1.2, 5, 1]} target={[0, 0, 0]} />
        <Lightformer form="ring" intensity={0.8} color="#ffffff" position={[0, -6, 0]} scale={4} target={[0, 0, 0]} />
      </Environment>
    </>
  )
}
