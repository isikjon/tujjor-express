'use client'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, Bloom, DepthOfField, Noise, Vignette, ToneMapping, SMAA } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode, type BloomEffect, type DepthOfFieldEffect } from 'postprocessing'
import { useApp } from '@/lib/stores'
import { PROFILES } from '@/lib/quality'
import { liveLights } from '@/lib/lights'
import { cameraLive } from './CameraRig'
import { RadialBlurEffect } from './fx/RadialBlurEffect'

/** Live overrides scenes may write. Scenes must reset them when leaving their range. */
export const fxLive = { bloomMul: 1, radialBlur: 0 }

/**
 * Clean premium image: mipmap bloom (intensity per stage), DoF (Ultra/High) focused on the camera target,
 * radial blur (tunnel only), subtle film noise, vignette, ACES tone mapping owned by the composer.
 * No chromatic aberration. On Low (no composer) the renderer tone-maps itself.
 */
export function Effects() {
  const tier = useApp((s) => s.tier)
  const profile = PROFILES[tier]
  const gl = useThree((s) => s.gl)
  const bloom = useRef<BloomEffect>(null)
  const dof = useRef<DepthOfFieldEffect>(null)
  const radial = useMemo(() => new RadialBlurEffect(), [])

  useEffect(() => {
    gl.toneMapping = profile.bloom ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = 1
  }, [gl, profile.bloom])

  useFrame(() => {
    if (bloom.current) bloom.current.intensity = liveLights.bloom * fxLive.bloomMul
    if (dof.current) {
      const d = cameraLive.focusDistance
      dof.current.cocMaterial.worldFocusDistance = d
      dof.current.cocMaterial.worldFocusRange = Math.max(2, d * 0.9)
    }
    radial.strength = profile.dof ? fxLive.radialBlur : 0
  })

  if (!profile.bloom) return null
  const ms = tier === 'ultra' || tier === 'high' ? 4 : tier === 'balanced' ? 2 : 0
  return (
    <EffectComposer multisampling={ms} resolutionScale={1} enableNormalPass={false}>
      <Bloom ref={bloom} mipmapBlur luminanceThreshold={0.85} luminanceSmoothing={0.2} intensity={0.6} radius={0.7} resolutionScale={profile.bloomScale} />
      {profile.dof ? <DepthOfField ref={dof} worldFocusDistance={4} worldFocusRange={4} bokehScale={2.2} resolutionScale={0.5} /> : <></>}
      {profile.dof ? <primitive object={radial} /> : <></>}
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.35} />
      <Vignette eskil={false} offset={0.22} darkness={0.55} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {profile.smaa ? <SMAA /> : <></>}
    </EffectComposer>
  )
}
