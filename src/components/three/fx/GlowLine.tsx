'use client'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useApp, scroll } from '@/lib/stores'

const vert = /* glsl */ `
attribute vec3 aPosFlat;
uniform float uMorph;
uniform float uRotY;
varying float vU;
void main(){
  vU = uv.x;
  // optional sphere→flat morph (globe): position = sphere-space, aPosFlat = flat-space
  float c = cos(uRotY), s = sin(uRotY);
  vec3 ps = vec3(c * position.x + s * position.z, position.y, -s * position.x + c * position.z);
  vec3 p = mix(ps, aPosFlat, uMorph);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`
const frag = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uSpeed;
uniform float uHead;
uniform float uOpacity;
uniform float uPulses;
varying float vU;
void main(){
  // visible up to uHead (0..1 build-up); energy pulses travelling along
  float built = 1.0 - smoothstep(uHead - 0.02, uHead, vU);
  float pulse = pow(0.5 + 0.5 * sin((vU * uPulses - uTime * uSpeed) * 6.2831), 6.0);
  float base = 0.28;
  float a = (base + pulse * 0.9) * built * uOpacity;
  gl_FragColor = vec4(uColor * (0.8 + pulse * 1.4), a);
}`

export interface GlowLineProps {
  /** points in local space (sphere-space for globe) */
  points: THREE.Vector3[]
  /** optional flat-space points (same count) for the globe morph */
  flatPoints?: THREE.Vector3[]
  radius?: number
  color?: string
  /** 0..1 build progress */
  head?: number
  speed?: number
  pulses?: number
  opacity?: number
  /** shared uniforms object so the parent can drive uMorph/uRotY (globe) */
  morphRef?: { current: { morph: number; rotY: number } }
  tubularSegments?: number
  radialSegments?: number
}
/**
 * Glowing energy line (TubeGeometry + additive shader): route arcs, network links, tracking path.
 * Speed follows scroll velocity: base + 0.5·|v| (docs §14.10). Supports the globe morph via aPosFlat.
 */
export function GlowLine({ points, flatPoints, radius = 0.05, color = '#ff6a00', head = 1, speed = 1, pulses = 6, opacity = 1, morphRef, tubularSegments, radialSegments = 6 }: GlowLineProps) {
  const mesh = useRef<THREE.Mesh>(null!)
  const geometry = useMemo(() => {
    const seg = tubularSegments ?? Math.max(8, points.length * 2)
    const curve = new THREE.CatmullRomCurve3(points)
    const g = new THREE.TubeGeometry(curve, seg, radius, radialSegments, false)
    if (flatPoints && flatPoints.length === points.length) {
      const fcurve = new THREE.CatmullRomCurve3(flatPoints)
      const fg = new THREE.TubeGeometry(fcurve, seg, radius, radialSegments, false)
      g.setAttribute('aPosFlat', fg.getAttribute('position').clone())
      fg.dispose()
    } else {
      g.setAttribute('aPosFlat', g.getAttribute('position').clone())
    }
    g.computeBoundingSphere()
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, flatPoints, radius, radialSegments, tubularSegments])
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
          uSpeed: { value: speed },
          uHead: { value: head },
          uOpacity: { value: opacity },
          uPulses: { value: pulses },
          uMorph: { value: 0 },
          uRotY: { value: 0 },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  useFrame((_, dt) => {
    if (!mesh.current.visible) return
    const u = material.uniforms
    if (!useApp.getState().motionOff) u.uTime.value += Math.min(dt, 0.05) * (1 + 0.5 * Math.abs(scroll.velocity))
    u.uHead.value = head
    u.uOpacity.value = opacity
    u.uSpeed.value = speed
    if (morphRef) {
      u.uMorph.value = morphRef.current.morph
      u.uRotY.value = morphRef.current.rotY
    }
  })
  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} />
}
