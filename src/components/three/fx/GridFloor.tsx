'use client'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useApp } from '@/lib/stores'
import { isRenderedInTree } from '@/lib/visibility'

const vert = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`
const frag = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uAccent;
uniform float uCell;
uniform float uFade;
uniform float uTime;
uniform float uOpacity;
uniform vec3 uCenter;
varying vec3 vWorld;
float gridLine(vec2 p, float w){
  vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
  float l = min(g.x, g.y);
  return 1.0 - smoothstep(0.0, w, l);
}
void main(){
  vec2 p = vWorld.xz / uCell;
  float fine = gridLine(p, 1.0) * 0.35;
  float coarse = gridLine(p / 5.0, 1.2) * 0.9;
  float d = distance(vWorld.xz, uCenter.xz);
  float fade = 1.0 - smoothstep(uFade * 0.25, uFade, d);
  // slow pulse ring travelling outward
  float ring = smoothstep(0.02, 0.0, abs(fract(d / uFade - uTime * 0.08) - 0.5) - 0.48) * 0.25;
  vec3 col = uColor * (fine + coarse) + uAccent * ring * fade;
  float a = (fine + coarse + ring) * fade * uOpacity;
  gl_FragColor = vec4(col, a);
}`

interface Props {
  size?: number
  cell?: number
  fade?: number
  color?: string
  accent?: string
  opacity?: number
  position?: [number, number, number]
}
/** Shader coordinate grid that dissolves toward the horizon — the logistics 'map' floor of the hero / studio. */
export function GridFloor({ size = 120, cell = 1, fade = 40, color = '#2a2f3a', accent = '#ff6a00', opacity = 1, position = [0, 0, 0] }: Props) {
  const mesh = useRef<THREE.Mesh>(null!)
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uAccent: { value: new THREE.Color(accent) },
          uCell: { value: cell },
          uFade: { value: fade },
          uTime: { value: 0 },
          uOpacity: { value: opacity },
          uCenter: { value: new THREE.Vector3(...position) },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  useFrame((_, dt) => {
    if (!isRenderedInTree(mesh.current)) return
    if (!useApp.getState().motionOff) material.uniforms.uTime.value += Math.min(dt, 0.05)
    material.uniforms.uOpacity.value = opacity
    mesh.current.getWorldPosition(material.uniforms.uCenter.value)
  })
  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} position={position} material={material} renderOrder={-1}>
      <planeGeometry args={[size, size]} />
    </mesh>
  )
}
