'use client'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * All network links in ONE mesh (same look as fx/GlowLine: additive energy tube with travelling pulses and a
 * 0..1 build-up head). Per-link head / opacity live in two uniform float arrays indexed by the `aLink` vertex
 * attribute, so the scene drives them by writing plain Float32Arrays — no per-link uniforms, no onBeforeRender.
 */
const vert = /* glsl */ `
attribute float aLink;
uniform float uHead[N_LINKS];
uniform float uAlpha[N_LINKS];
varying float vU;
varying float vHead;
varying float vAlpha;
void main(){
  vU = uv.x;
  int i = int(aLink + 0.5);
  vHead = uHead[i];
  vAlpha = uAlpha[i];
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const frag = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uSpeed;
uniform float uOpacity;
uniform float uPulses;
varying float vU;
varying float vHead;
varying float vAlpha;
void main(){
  // visible up to the head (0..1 build-up); energy pulses travelling along
  float built = 1.0 - smoothstep(vHead - 0.02, vHead, vU);
  float pulse = pow(0.5 + 0.5 * sin((vU * uPulses - uTime * uSpeed) * 6.2831), 6.0);
  float base = 0.28;
  float a = (base + pulse * 0.9) * built * vAlpha * uOpacity;
  gl_FragColor = vec4(uColor * (0.8 + pulse * 1.4), a);
}`

export interface NetworkLinksHandle {
  /** advance the pulse clock (seconds, already velocity-scaled by the caller) */
  tick: (dt: number) => void
}

interface Props {
  /** control points per link (Catmull-Rom); `index[k]` = the link's slot in the head / alpha arrays */
  curves: THREE.Vector3[][]
  index: number[]
  /** shared per-link state (length = number of slots), read by the shader every frame */
  head: Float32Array
  alpha: Float32Array
  radius: number
  color: string
  speed?: number
  pulses?: number
  /** global opacity multiplier (halo layer = 0.22 × 0.2) */
  opacity?: number
  tubularSegments?: number
  radialSegments?: number
  handleRef?: { current: NetworkLinksHandle | null }
}

export function NetworkLinks({ curves, index, head, alpha, radius, color, speed = 0.4, pulses = 3, opacity = 1, tubularSegments = 24, radialSegments = 4, handleRef }: Props) {
  const mesh = useRef<THREE.Mesh>(null!)
  const geometry = useMemo(() => {
    const parts = curves.map((pts, k) => {
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), tubularSegments, radius, radialSegments, false)
      const n = g.getAttribute('position').count
      g.setAttribute('aLink', new THREE.BufferAttribute(new Float32Array(n).fill(index[k]), 1))
      return g
    })
    const merged = mergeGeometries(parts, false)!
    parts.forEach((p) => p.dispose())
    merged.computeBoundingSphere()
    return merged
  }, [curves, index, radius, tubularSegments, radialSegments])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        defines: { N_LINKS: head.length },
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        // the tube's back faces DO contribute (additive, no depth write) — keep both sides, but rasterise them in a
        // single pass instead of three's default back-then-front two-draw split for DoubleSide (identical result)
        side: THREE.DoubleSide,
        forceSinglePass: true,
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uTime: { value: 0 },
          uSpeed: { value: speed },
          uOpacity: { value: opacity },
          uPulses: { value: pulses },
          uHead: { value: head },
          uAlpha: { value: alpha },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [head, alpha],
  )
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  useEffect(() => {
    if (!handleRef) return
    handleRef.current = {
      tick: (dt) => {
        material.uniforms.uTime.value += dt
      },
    }
    return () => {
      handleRef.current = null
    }
  }, [handleRef, material])
  return <mesh ref={mesh} geometry={geometry} material={material} />
}
