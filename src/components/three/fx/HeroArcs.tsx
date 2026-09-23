'use client'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useFrame } from '@react-three/fiber'
import { useApp, scroll } from '@/lib/stores'
import { isRenderedInTree } from '@/lib/visibility'

/* Same energy-line shader as fx/GlowLine (head = 1, no morph), with the per-arc pulse speed moved from a
 * uniform into a per-vertex attribute so N arcs merge into ONE tube geometry / ONE draw call. */
const vert = /* glsl */ `
attribute float aSpeed;
varying float vU;
varying float vSpeed;
void main(){
  vU = uv.x;
  vSpeed = aSpeed;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const frag = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;
uniform float uPulses;
varying float vU;
varying float vSpeed;
void main(){
  // GlowLine with uHead = 1: the last 2% of the tube feathers out
  float built = 1.0 - smoothstep(0.98, 1.0, vU);
  float pulse = pow(0.5 + 0.5 * sin((vU * uPulses - uTime * vSpeed) * 6.2831), 6.0);
  float base = 0.28;
  float a = (base + pulse * 0.9) * built * uOpacity;
  gl_FragColor = vec4(uColor * (0.8 + pulse * 1.4), a);
}`

export interface HeroArcsProps {
  /** one polyline per arc (local space) */
  arcs: THREE.Vector3[][]
  /** pulse speed per arc (same length as `arcs`) */
  speeds: number[]
  radius?: number
  color?: string
  pulses?: number
  opacity?: number
  tubularSegments?: number
  radialSegments?: number
}

/**
 * Hero route arcs: all arcs merged into one TubeGeometry batch with a GlowLine-identical additive shader.
 * Pulse speed follows scroll velocity exactly like GlowLine (base + 0.5·|v|, frozen under reduced motion).
 */
export function HeroArcs({ arcs, speeds, radius = 0.012, color = '#ff6a00', pulses = 3, opacity = 0.4, tubularSegments = 32, radialSegments = 4 }: HeroArcsProps) {
  const mesh = useRef<THREE.Mesh>(null!)
  const geometry = useMemo(() => {
    const parts = arcs.map((pts, i) => {
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), tubularSegments, radius, radialSegments, false)
      const n = g.getAttribute('position').count
      g.setAttribute('aSpeed', new THREE.BufferAttribute(new Float32Array(n).fill(speeds[i] ?? 1), 1))
      return g
    })
    const merged = mergeGeometries(parts, false) ?? parts[0]
    for (const p of parts) if (p !== merged) p.dispose()
    merged.computeBoundingSphere()
    return merged
  }, [arcs, speeds, radius, tubularSegments, radialSegments])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uTime: { value: 0 },
          uOpacity: { value: opacity },
          uPulses: { value: pulses },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  useFrame((_, dt) => {
    if (!isRenderedInTree(mesh.current)) return
    const u = material.uniforms
    if (!useApp.getState().motionOff) u.uTime.value += Math.min(dt, 0.05) * (1 + 0.5 * Math.abs(scroll.velocity))
    u.uOpacity.value = opacity
  })
  return <mesh ref={mesh} geometry={geometry} material={material} />
}
