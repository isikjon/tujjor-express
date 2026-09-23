'use client'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useStageFrame } from '@/hooks/useStage'
import type { StageDef } from '@/lib/timeline'
import { TUNNEL_LENGTH, PORTAL_R } from '@/config/worldB'

/**
 * Mutable per-frame state shared by the tunnel fx (written once per frame by TunnelScene,
 * read by each fx component's own useStageFrame → zero React traffic, zero allocations).
 * All values are in TUNNEL-LOCAL space (tube axis = −Z, mouth at z=0, end at z=−150).
 */
export interface TunnelLive {
  /** accumulated flow distance ∫(1 + 2·|v|)dt — drives every scrolling pattern; never frozen unless motionOff */
  flow: number
  /** camera z in tunnel-local space (30 − 175·t) */
  camZ: number
  /** |scroll velocity| 0..1 */
  boost: number
  /** stage-local time (stops under motionOff) */
  time: number
}
export const mkTunnelLive = (): TunnelLive => ({ flow: 0, camZ: 30, boost: 0, time: 0 })

/** Noise texture: NOISE_PERIOD lattice cells per repeat, NOISE_SUB texels per cell (hermite-smoothed value noise baked once). */
const NOISE_PERIOD = 64
const NOISE_SUB = 8
const NOISE_SIZE = NOISE_PERIOD * NOISE_SUB // 512

/**
 * Bake three independent periodic value-noise fields (R, G, B) — the same hermite-interpolated lattice noise the
 * shader used to evaluate procedurally (grime / energy bands / speed streaks), now ONE texture fetch each per pixel
 * instead of 4 hashes + 3 mixes per lookup. Tiles seamlessly (RepeatWrapping) because the lattice wraps at NOISE_PERIOD.
 */
function bakeNoiseTexture() {
  const n = NOISE_PERIOD
  const lattice = new Float32Array(n * n * 3)
  let s = 2381 >>> 0
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  for (let i = 0; i < lattice.length; i++) lattice[i] = rnd()
  const data = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4)
  const at = (x: number, y: number, c: number) => lattice[(((y % n) + n) % n) * n * 3 + (((x % n) + n) % n) * 3 + c]
  for (let y = 0; y < NOISE_SIZE; y++) {
    const fy = y / NOISE_SUB
    const iy = Math.floor(fy)
    let ty = fy - iy
    ty = ty * ty * (3 - 2 * ty)
    for (let x = 0; x < NOISE_SIZE; x++) {
      const fx = x / NOISE_SUB
      const ix = Math.floor(fx)
      let tx = fx - ix
      tx = tx * tx * (3 - 2 * tx)
      const o = (y * NOISE_SIZE + x) * 4
      for (let c = 0; c < 3; c++) {
        const a = at(ix, iy, c), b = at(ix + 1, iy, c), d = at(ix, iy + 1, c), e = at(ix + 1, iy + 1, c)
        const v = (a + (b - a) * tx) * (1 - ty) + (d + (e - d) * tx) * ty
        data[o + c] = Math.round(v * 255)
      }
      data[o + 3] = 255
    }
  }
  const tex = new THREE.DataTexture(data, NOISE_SIZE, NOISE_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

const vert = /* glsl */ `
varying vec2 vUv;
varying float vZ;
void main() {
  vUv = uv;
  // mesh is a Y-axis cylinder rotated +90° about X and centred at z = −L/2: local y ↦ tunnel z
  vZ = position.y - ${(TUNNEL_LENGTH / 2).toFixed(1)};
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const frag = /* glsl */ `
uniform float uFlow;
uniform float uCamZ;
uniform float uBoost;
uniform float uTime;
uniform sampler2D uNoise;
varying vec2 vUv;
varying float vZ;
// baked periodic value noise (period ${NOISE_PERIOD} lattice units): one fetch replaces the procedural vnoise()
#define NOISE(p) texture2D(uNoise, (p) * ${(1 / NOISE_PERIOD).toFixed(6)})
void main() {
  float a = vUv.x;          // 0..1 around the tube (integer frequencies keep the seam invisible)
  float z = vZ;             // 0 (mouth) .. −150 (end)
  // fade to black at both ends: the portal reads as a hole from above, the end cap owns the finale
  float ends = smoothstep(0.0, 14.0, -z) * smoothstep(0.0, 9.0, ${TUNNEL_LENGTH.toFixed(1)} + z);
  // the light travels with the camera: walls brighten around the camera plane
  float dz = z - uCamZ;
  float near = exp(-abs(dz) / 26.0);
  // graphite base with panel grime
  float grime = NOISE(vec2(a * 40.0, z * 0.25)).r;
  vec3 col = vec3(0.012, 0.014, 0.022) * (0.6 + 0.8 * grime);
  // panel seams: 48 radial lines + ring seams every 2.5 u (cool steel highlight, brighter near the camera)
  float radial = smoothstep(0.02, 0.0, abs(fract(a * 48.0) - 0.5) - 0.47);
  float ring = smoothstep(0.03, 0.0, abs(fract(z / 2.5) - 0.5) - 0.46);
  col += vec3(0.05, 0.06, 0.085) * (radial + ring * 0.6) * (0.3 + near);
  // flowing noise bands: broad energy clouds sweeping toward the camera (+z)
  float bands = smoothstep(0.55, 0.95, NOISE(vec2(a * 6.0, z * 0.06 - uFlow * 0.35)).g);
  col += vec3(0.25, 0.09, 0.02) * bands * (0.25 + 0.75 * near);
  // orange energy rails: 12 lines along the tube with pulses racing toward the camera (HDR ≤ 3 for bloom)
  float lane = floor(a * 12.0);
  float rail = smoothstep(0.035, 0.0, abs(fract(a * 12.0 + 0.5) - 0.5));
  float ps = 0.5 + 0.5 * sin((z * 0.08 + uFlow * 0.9 + lane * 0.37) * 6.2831);
  float ps2 = ps * ps;
  float pulse = ps2 * ps2 * ps2; // = pow(ps, 6.0) without pow()
  float railI = rail * (0.25 + 2.75 * pulse) * (0.3 + 0.7 * near) * (1.0 + 0.6 * uBoost);
  col += vec3(1.0, 0.42, 0.0) * railI;
  // fine speed streaks that only appear with scroll velocity
  float sl = smoothstep(0.75, 1.0, NOISE(vec2(a * 160.0, z * 0.5 - uFlow * 4.0)).b) * uBoost;
  col += vec3(1.0, 0.6, 0.3) * sl * 0.8;
  // slow breathing of the whole wall so nothing is ever static
  col *= 0.92 + 0.08 * sin(uTime * 0.7 + z * 0.05);
  gl_FragColor = vec4(col * ends, 1.0);
}`

/**
 * TunnelShell — the corridor wall: open cylinder r=6, tunnel-local z 0..−150, BackSide, custom shader
 * (graphite panels + flowing noise bands + orange energy rails whose speed follows scroll velocity).
 * Outputs linear radiance (the composer owns tone mapping). Noise is baked into one 512² texture (3 fetches/pixel).
 */
export function TunnelShell({ stage, live }: { stage: StageDef; live: TunnelLive }) {
  const mesh = useRef<THREE.Mesh>(null!)
  const { geometry, material, noise } = useMemo(() => {
    const g = new THREE.CylinderGeometry(PORTAL_R, PORTAL_R, TUNNEL_LENGTH, 96, 30, true)
    const noise = bakeNoiseTexture()
    const m = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      side: THREE.BackSide,
      uniforms: { uFlow: { value: 0 }, uCamZ: { value: 30 }, uBoost: { value: 0 }, uTime: { value: 0 }, uNoise: { value: noise } },
    })
    return { geometry: g, material: m, noise }
  }, [])
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
      noise.dispose()
    },
    [geometry, material, noise],
  )
  useStageFrame(stage, () => {
    const u = material.uniforms
    u.uFlow.value = live.flow
    u.uCamZ.value = live.camZ
    u.uBoost.value = live.boost
    u.uTime.value = live.time
  })
  // cylinder axis Y → tunnel −Z: rotate +90° about X, centre at z = −L/2
  return <mesh ref={mesh} geometry={geometry} material={material} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -TUNNEL_LENGTH / 2]} frustumCulled={false} />
}
