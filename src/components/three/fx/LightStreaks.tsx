'use client'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useStageFrame } from '@/hooks/useStage'
import type { StageDef } from '@/lib/timeline'
import { seeded } from '@/lib/math'
import { TUNNEL_LENGTH, PORTAL_R } from '@/config/worldB'
import type { TunnelLive } from './TunnelShell'

const SPAN = TUNNEL_LENGTH + 10 // wrap range: z ∈ [−(L+8), 2]

const vert = /* glsl */ `
attribute vec4 aInst;   // r, theta, z0, length
attribute vec3 aSeed;   // speed mult, hue mix, width seed
uniform float uFlow;
uniform float uBoost;
uniform float uCamZ;
varying float vT;
varying float vX;
varying float vFade;
varying float vHue;
void main() {
  float r = aInst.x;
  float th = aInst.y;
  // streaks stretch with scroll velocity (motion-blur feel)
  float len = aInst.w * (1.0 + 1.6 * uBoost);
  // flow toward the camera (+z), wrapped inside the tube span; per-streak speed variation
  float z = -${(SPAN - 2).toFixed(1)} + mod(aInst.z + uFlow * (5.0 + 8.0 * aSeed.x), ${SPAN.toFixed(1)});
  vec3 rad = vec3(cos(th), sin(th), 0.0);
  vec3 tng = vec3(-sin(th), cos(th), 0.0);
  // plane tangent to the tube wall (normal = radial) → seen face-on from the axis; −tng winds the face INWARD
  // (normal −rad) so the camera on the axis sees the front side and the material can stay FrontSide
  float w = 0.05 + 0.06 * aSeed.z;
  vec3 p = rad * r - tng * (position.x * w) + vec3(0.0, 0.0, position.y * len);
  vT = position.y + 0.5;     // 0 = tail (−z) … 1 = head (+z, leading toward the camera)
  vX = position.x;
  vHue = aSeed.y;
  float dz = z - uCamZ;
  // fade: tube ends, crossing the camera plane (no near-plane pops), far depth
  vFade = smoothstep(0.0, -6.0, z) * smoothstep(-${SPAN.toFixed(1)}, -${(SPAN - 8).toFixed(1)}, z)
        * smoothstep(0.8, 3.0, abs(dz)) * (1.0 - smoothstep(60.0, 110.0, -dz));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`
const frag = /* glsl */ `
uniform float uBoost;
varying float vT;
varying float vX;
varying float vFade;
varying float vHue;
void main() {
  float across = 1.0 - smoothstep(0.0, 0.5, abs(vX));
  across *= across;
  // soft tail, hot head
  float along = smoothstep(0.0, 0.35, vT) * (1.0 - smoothstep(0.85, 1.0, vT));
  vec3 orange = vec3(1.0, 0.42, 0.0);
  vec3 white = vec3(1.0, 0.94, 0.86);
  vec3 col = mix(orange, white, smoothstep(0.4, 1.0, vT) * (0.45 + 0.55 * vHue));
  float a = across * along * vFade;
  // HDR 3.0 at the head so the bloom picks the streaks up (docs §14.13)
  gl_FragColor = vec4(col * 3.0 * (0.7 + 0.5 * uBoost), a);
}`

/**
 * LightStreaks — `count` thin elongated planes distributed in the tube volume, additive orange→white,
 * flowing toward the camera (offset by ∫speed·dt, wrapped). One InstancedBufferGeometry, attributes set once;
 * every motion lives in the vertex shader (no per-frame CPU work besides four uniforms).
 */
export function LightStreaks({ stage, live, count = 400 }: { stage: StageDef; live: TunnelLive; count?: number }) {
  const mesh = useRef<THREE.Mesh>(null!)
  const { geometry, material } = useMemo(() => {
    const n = Math.max(24, Math.round(count))
    const base = new THREE.PlaneGeometry(1, 1)
    const g = new THREE.InstancedBufferGeometry()
    g.index = base.index
    g.setAttribute('position', base.getAttribute('position'))
    g.setAttribute('uv', base.getAttribute('uv'))
    const inst = new Float32Array(n * 4)
    const seed = new Float32Array(n * 3)
    const rnd = seeded(2381)
    for (let i = 0; i < n; i++) {
      // keep the axis clear for the comet: r ∈ [1.6, 5.6], biased toward the wall
      const r = 1.6 + Math.sqrt(rnd()) * (PORTAL_R - 0.4 - 1.6)
      inst[i * 4] = r
      inst[i * 4 + 1] = rnd() * Math.PI * 2
      inst[i * 4 + 2] = rnd() * SPAN
      inst[i * 4 + 3] = 1.5 + rnd() * 4.5
      seed[i * 3] = rnd()
      seed[i * 3 + 1] = rnd()
      seed[i * 3 + 2] = rnd()
    }
    g.setAttribute('aInst', new THREE.InstancedBufferAttribute(inst, 4))
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 3))
    g.instanceCount = n
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -TUNNEL_LENGTH / 2), TUNNEL_LENGTH)
    const m = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      uniforms: { uFlow: { value: 0 }, uBoost: { value: 0 }, uCamZ: { value: 30 } },
    })
    return { geometry: g, material: m }
  }, [count])
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  useStageFrame(stage, () => {
    const u = material.uniforms
    u.uFlow.value = live.flow
    u.uBoost.value = live.boost
    u.uCamZ.value = live.camZ
  })
  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} />
}
