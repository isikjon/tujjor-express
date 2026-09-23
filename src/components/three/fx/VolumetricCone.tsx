'use client'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'

const vert = /* glsl */ `
varying float vH;
varying vec3 vN;
varying vec3 vV;
varying float vNoise;
uniform float uTime;
void main() {
  // cylinder uv.y runs 0 (bottom) → 1 (top)
  vH = uv.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  // slow angular shimmer so the cone never looks like a static decal
  vNoise = sin(uv.x * 12.566 + uTime * 0.9) * 0.5 + sin(uv.x * 25.13 - uTime * 1.7 + uv.y * 6.0) * 0.5;
  gl_Position = projectionMatrix * mv;
}`
const frag = /* glsl */ `
uniform float uIntensity;
uniform float uTime;
uniform vec3 uBase;
uniform vec3 uTop;
uniform float uEdge;
varying float vH;
varying vec3 vN;
varying vec3 vV;
varying float vNoise;
void main() {
  // vertical falloff: bright at the opening, dissolves before the rim.
  // clamp: interpolated uv.y can land a hair above 1.0 at the top ring → pow(negative) = NaN, and one NaN
  // pixel poisons the whole bloom mip chain (black frame as soon as the cone switches on)
  float h = clamp(vH, 0.0, 1.0);
  float vert = smoothstep(0.0, 0.06, h) * pow(1.0 - h, 1.6);
  // radial softness: the silhouette (normal ⟂ view) fades to zero → no hard cone edge
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float radial = pow(facing, uEdge);
  // breathing + shimmer
  float breathe = 0.92 + 0.08 * sin(uTime * 2.1);
  float shimmer = 0.85 + 0.15 * vNoise;
  float a = vert * radial * breathe * shimmer * uIntensity;
  vec3 col = mix(uBase, uTop, smoothstep(0.0, 0.7, h));
  // linear radiance for the composer (ACES + bloom); additive blend uses alpha as the weight
  gl_FragColor = vec4(col * (1.2 + 1.8 * (1.0 - h)), a);
}`

export interface VolumetricConeHandle {
  /** 0..1 light amount; `time` drives shimmer (pass useStageFrame.time so reduced motion freezes it) */
  set: (intensity: number, time: number) => void
}
interface Props {
  /** radius at the opening (bottom) and at the top */
  radiusBottom?: number
  radiusTop?: number
  height?: number
  /** colour at the opening / at the top */
  base?: string
  top?: string
  /** silhouette softness exponent (higher = softer edge) */
  edge?: number
  position?: [number, number, number]
  renderOrder?: number
}

/**
 * Fake volumetric light cone — an open cylinder with an additive shader (soft radial + vertical
 * falloff, angular shimmer). Two of them (wide+dim, narrow+hot) layer into a convincing shaft.
 * Zero per-frame CPU work; the parent writes intensity/time through the handle.
 * Shader budget: no loops, the only "noise" is one sin pair evaluated per VERTEX (vNoise), the
 * fragment does two pow() and one smoothstep — nothing is sampled more than once per pixel.
 */
export const VolumetricCone = forwardRef<VolumetricConeHandle, Props>(function VolumetricCone(
  { radiusBottom = 0.22, radiusTop = 0.9, height = 2.2, base = '#ffd2a8', top = '#ff6a00', edge = 1.8, position, renderOrder = 10 },
  ref,
) {
  const mesh = useRef<THREE.Mesh>(null!)
  const { geometry, material } = useMemo(() => {
    // open-ended, bottom = the box opening → cylinder is authored top-radius first
    // 32 radial segments: the additive soft-edge falloff hides the silhouette polygonisation completely
    const g = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 32, 6, true)
    g.translate(0, height / 2, 0)
    const m = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      uniforms: {
        uIntensity: { value: 0 },
        uTime: { value: 0 },
        uBase: { value: new THREE.Color(base) },
        uTop: { value: new THREE.Color(top) },
        uEdge: { value: edge },
      },
    })
    return { geometry: g, material: m }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  useImperativeHandle(
    ref,
    () => ({
      set: (intensity, time) => {
        material.uniforms.uIntensity.value = intensity
        material.uniforms.uTime.value = time
        if (mesh.current) mesh.current.visible = intensity > 0.002
      },
    }),
    [material],
  )
  // default frustum culling (bounding sphere of the translated cylinder) — the cone is a small, static object
  return <mesh ref={mesh} geometry={geometry} material={material} position={position} renderOrder={renderOrder} visible={false} />
})
