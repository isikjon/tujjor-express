'use client'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, Bloom, DepthOfField, Noise, Vignette, ToneMapping, SMAA } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode, type BloomEffect, type DepthOfFieldEffect } from 'postprocessing'
import { useApp } from '@/lib/stores'
import { PROFILES } from '@/lib/quality'
import { perfOverrides as ov } from '@/lib/perf'
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
    gl.toneMapping = (ov.postfx ?? profile.bloom) ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = 1
  }, [gl, profile.bloom])

  useFrame(() => {
    if (bloom.current) bloom.current.intensity = liveLights.bloom * fxLive.bloomMul
    if (dof.current) {
      const d = cameraLive.focusDistance
      dof.current.cocMaterial.worldFocusDistance = d
      dof.current.cocMaterial.worldFocusRange = Math.max(2, d * 0.9)
    }
    radial.strength = useDof && useRadial ? fxLive.radialBlur : 0
  })

  // resolved flags (profiler overrides win)
  const usePost = ov.postfx ?? profile.bloom
  const useBloom = ov.bloom ?? profile.bloom
  const useDof = ov.dof ?? profile.dof
  const useRadial = ov.radial ?? profile.radialBlur
  const useNoise = ov.noise ?? true
  const useVignette = ov.vignette ?? true
  const useSmaa = ov.smaa ?? profile.smaa
  const ms = ov.msaa ?? profile.msaa
  if (!usePost) return null
  return (
    <EffectComposer multisampling={ms} resolutionScale={1} enableNormalPass={false}>
      {useBloom ? <Bloom ref={bloom} mipmapBlur luminanceThreshold={0.85} luminanceSmoothing={0.2} intensity={0.6} radius={0.7} resolutionScale={ov.bloomScale ?? profile.bloomScale} /> : <></>}
      {useDof ? <DepthOfField ref={dof} worldFocusDistance={4} worldFocusRange={4} bokehScale={2.2} resolutionScale={0.5} /> : <></>}
      {useDof && useRadial ? <primitive object={radial} /> : <></>}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {/* grain and vignette after tone mapping: soft-light noise on HDR values (> 1) produced coloured speckle */}
      {useNoise ? <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.35} /> : <></>}
      {useVignette ? <Vignette eskil={false} offset={0.22} darkness={0.55} /> : <></>}
      {useSmaa ? <SMAA /> : <></>}
    </EffectComposer>
  )
}
