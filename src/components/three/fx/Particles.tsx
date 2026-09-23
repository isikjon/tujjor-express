'use client'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useApp } from '@/lib/stores'
import { PROFILES } from '@/lib/quality'
import { glowSprite } from '@/lib/textures'
import { seeded } from '@/lib/math'
import { perfOverrides } from '@/lib/perf'
import { isRenderedInTree } from '@/lib/visibility'

const vert = /* glsl */ `
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
uniform vec3 uDrift;
uniform float uSpread;
attribute float aSeed;
attribute float aSize;
attribute vec3 aVel;
varying float vAlpha;
void main() {
  vec3 p = position;
  float t = uTime * (0.4 + aSeed * 0.6);
  // gentle drift + per-particle velocity, wrapped inside the spread box
  p += aVel * uTime + uDrift * uTime * (0.5 + aSeed);
  p += vec3(sin(t + aSeed * 6.283) * 0.15, cos(t * 0.8 + aSeed * 3.1) * 0.12, sin(t * 0.6 + aSeed * 9.4) * 0.15);
  p = mod(p + uSpread * 0.5, uSpread) - uSpread * 0.5;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  gl_PointSize = aSize * uSize * uPixelRatio * (12.0 / max(dist, 0.5));
  vAlpha = smoothstep(0.0, 4.0, dist) * (0.35 + 0.65 * aSeed);
}`
const frag = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  vec4 s = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(uColor, s.a * vAlpha * uOpacity);
}`

export interface ParticlesProps {
  /** particle count at density 1 (scaled by quality tier) */
  count?: number
  /** size of the wrapping box (particles wrap inside) */
  spread?: [number, number, number]
  color?: string
  size?: number
  opacity?: number
  /** constant drift direction (units/s) */
  drift?: [number, number, number]
  /** random per-particle speed magnitude */
  speed?: number
  position?: [number, number, number]
  seed?: number
  /** visible flag (cheap toggle) */
  visible?: boolean
  /** time multiplier for velocity-driven scenes; set by parent each frame through ref if needed */
  timeScale?: number
}

/**
 * GPU-animated point cloud (all motion in the vertex shader; zero CPU work per frame).
 * Used for warehouse dust, orbital dust, tunnel particles, studio atmosphere, rising embers.
 */
export function Particles({ count = 600, spread = [20, 10, 20], color = '#ffb27a', size = 1, opacity = 0.7, drift = [0, 0.05, 0], speed = 0.08, position, seed = 1, visible = true, timeScale = 1 }: ParticlesProps) {
  // allocate the full count once; the rendered subset follows the tier smoothly via draw range
  const n = Math.max(20, count)
  const points = useRef<THREE.Points>(null!)
  const drawn = useRef(0)
  const { geometry, material } = useMemo(() => {
    const rnd = seeded(seed)
    const pos = new Float32Array(n * 3)
    const seeds = new Float32Array(n)
    const sizes = new Float32Array(n)
    const vel = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rnd() - 0.5) * spread[0]
      pos[i * 3 + 1] = (rnd() - 0.5) * spread[1]
      pos[i * 3 + 2] = (rnd() - 0.5) * spread[2]
      seeds[i] = rnd()
      sizes[i] = 0.5 + rnd() * 1.2
      vel[i * 3] = (rnd() - 0.5) * speed
      vel[i * 3 + 1] = (rnd() - 0.5) * speed
      vel[i * 3 + 2] = (rnd() - 0.5) * speed
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    g.setAttribute('aVel', new THREE.BufferAttribute(vel, 3))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.hypot(spread[0], spread[1], spread[2]))
    const m = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: size },
        uPixelRatio: { value: 1 },
        uMap: { value: glowSprite() },
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity },
        uDrift: { value: new THREE.Vector3(...drift) },
        uSpread: { value: new THREE.Vector3(...spread) },
      },
    })
    return { geometry: g, material: m }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, seed])
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  useFrame((state, dt) => {
    if (!points.current || !isRenderedInTree(points.current)) return
    const target = Math.max(20, Math.floor(n * (perfOverrides.particles ?? PROFILES[useApp.getState().tier].particles)))
    if (drawn.current !== target) {
      // ease the count (≈ 12% per frame) so a tier change never pops
      const next = Math.abs(target - drawn.current) < 4 ? target : drawn.current + Math.round((target - drawn.current) * 0.12)
      drawn.current = next
      geometry.setDrawRange(0, next)
    }
    const u = material.uniforms
    if (!useApp.getState().motionOff) u.uTime.value += Math.min(dt, 0.05) * timeScale
    u.uPixelRatio.value = state.gl.getPixelRatio()
    u.uOpacity.value = opacity
    u.uSize.value = size
  })
  return <points ref={points} geometry={geometry} material={material} position={position} visible={visible} frustumCulled={false} />
}
