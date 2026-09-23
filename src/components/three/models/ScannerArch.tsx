'use client'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { brandPlate } from '@/lib/textures'
import { box, cyl, makeGlowPucks, makePartsMaterial, mergeParts } from './ConveyorParts'

const scanVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
/**
 * 'scan' shader: a bright horizontal line at uSweep + fine scanlines + faint grid, additive.
 * Used for the laser curtain in the arch and for the shell that wraps the box while it is scanned.
 */
const scanFrag = /* glsl */ `
uniform float uTime;
uniform float uActive;
uniform float uSweep;
uniform vec3 uColor;
varying vec2 vUv;
void main(){
  float line = exp(-abs(vUv.y - uSweep) * 34.0);
  float scan = 0.5 + 0.5 * sin(vUv.y * 260.0 + uTime * 40.0);
  float grid = smoothstep(0.96, 1.0, abs(sin(vUv.x * 60.0))) * 0.5;
  float edge = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x) * smoothstep(0.0, 0.04, vUv.y) * smoothstep(1.0, 0.96, vUv.y);
  float a = (line * 1.5 + scan * 0.10 + grid * 0.12 + 0.05) * uActive * edge;
  gl_FragColor = vec4(uColor * (0.9 + line * 2.2), a);
}`
/** FrontSide by default — callers flip the plane toward the camera instead of paying for both faces */
export function makeScanMaterial(color = '#ff6a00', side: THREE.Side = THREE.FrontSide) {
  return new THREE.ShaderMaterial({
    vertexShader: scanVert,
    fragmentShader: scanFrag,
    transparent: true,
    depthWrite: false,
    side,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uActive: { value: 0 }, uSweep: { value: 0.5 }, uColor: { value: new THREE.Color(color) } },
  })
}

export interface ScannerArchHandle {
  /**
   * time = animation clock; scan = 0..1 how strongly the box is being scanned right now;
   * dx = box centre x relative to the arch (the laser fan tracks it while scan > 0);
   * camDx = camera x relative to the arch (the additive planes face the camera side)
   */
  update: (time: number, scan: number, dx?: number, camDx?: number) => void
}
const FAN_LEN = 1.05 // hinge at the sensor head → just under the belt surface
const FAN_MAX = 0.62 // rad, max tracking tilt of the fan
const H = 1.75
const STEEL = '#2c3038'
const DARK = '#15171c'

/**
 * Scanner gate at x (docs §03): two steel posts + top beam, sensor head with orange slit, side
 * sensors, 'SCAN · 01' plate and a vertical laser curtain (scan shader) across the belt.
 * Idle: the curtain breathes faintly; while the box passes it brightens and sweeps fast.
 * 4 draw calls idle (frame, plate, slit + status pucks, curtain) + the fan while scanning.
 */
export const ScannerArch = forwardRef<ScannerArchHandle, { x: number; beltTop: number; width: number }>(function ScannerArch({ x, beltTop, width }, ref) {
  const curtain = useMemo(() => makeScanMaterial('#ff6a00'), [])
  const fanMat = useMemo(() => makeScanMaterial('#ff8a2a'), [])
  const fan = useRef<THREE.Group>(null!)
  const fanPlane = useRef<THREE.Mesh>(null!)
  const curtainPlane = useRef<THREE.Mesh>(null!)
  const hz = width / 2 + 0.28
  const built = useMemo(() => {
    const parts = makePartsMaterial()
    const frame = mergeParts([
      ...[-1, 1].flatMap((s) => [
        box(0.14, H, 0.14, STEEL, 0.5, 0.7, [0, H / 2, s * hz]),
        box(0.3, 0.04, 0.3, DARK, 0.7, 0.4, [0, 0.02, s * hz]),
        // side sensor pods facing the belt (+ their dark glossy pane)
        box(0.18, 0.28, 0.06, DARK, 0.7, 0.4, [0, beltTop + 0.35, s * hz - s * 0.1]),
        box(0.12, 0.2, 0.01, '#0d1017', 0.15, 0.2, [0, beltTop + 0.35, s * hz - s * 0.135]),
        // orange safety band
        box(0.145, 0.06, 0.145, '#ff6a00', 0.5, 0.3, [0, 0.5, s * hz]),
      ]),
      // top beam + sensor head
      box(0.18, 0.16, hz * 2 + 0.14, STEEL, 0.5, 0.7, [0, H + 0.08, 0]),
      box(0.32, 0.2, 0.5, DARK, 0.7, 0.4, [0, H - 0.1, 0]),
      // conduit clamped to the −z post
      cyl(0.016, 0.016, H - 0.1, 6, DARK, 0.7, 0.4, [0.09, H / 2, -hz]),
      box(0.1, 0.03, 0.05, STEEL, 0.5, 0.7, [0.06, 0.5, -hz]),
      box(0.1, 0.03, 0.05, STEEL, 0.5, 0.7, [0.06, 1.3, -hz]),
    ])
    const plate = new THREE.MeshStandardMaterial({ map: brandPlate('SCAN · 01', 512, 128, '#15171c', '#ff6a00'), roughness: 0.6, metalness: 0.2 })
    // pucks: 0 = slit under the head (0.03 × 0.006 × 0.42), 1 = status light (r .018)
    const pucks = makeGlowPucks(2)
    const d = new THREE.Object3D()
    d.position.set(0, H - 0.205, 0)
    d.scale.set(0.03, 0.006, 0.42)
    d.updateMatrix()
    pucks.setMatrixAt(0, d.matrix)
    d.position.set(0.17, H - 0.06, 0.18)
    d.scale.setScalar(0.036)
    d.updateMatrix()
    pucks.setMatrixAt(1, d.matrix)
    pucks.setColorAt(0, new THREE.Color(1, 0.54, 0.16).multiplyScalar(2.5))
    pucks.setColorAt(1, new THREE.Color('#ff6a00').multiplyScalar(1.5))
    return { parts, frame, plate, pucks, d, c: new THREE.Color() }
  }, [hz, beltTop])
  useEffect(
    () => () => {
      built.frame.dispose()
      built.parts.dispose()
      built.plate.dispose()
      built.pucks.geometry.dispose()
      ;(built.pucks.material as THREE.Material).dispose()
      built.pucks.dispose()
      curtain.dispose()
      fanMat.dispose()
    },
    [built, curtain, fanMat],
  )
  useImperativeHandle(
    ref,
    () => ({
      update: (time, scan, dx = 0, camDx = 1) => {
        const u = curtain.uniforms
        u.uTime.value = time
        u.uActive.value = 0.22 + scan * 0.9
        // idle: slow breathing sweep; scanning: fast triangle sweep
        const idle = 0.5 + 0.42 * Math.sin(time * 1.6)
        const fast = Math.abs(((time * 2.2) % 2) - 1)
        u.uSweep.value = THREE.MathUtils.lerp(idle, fast, scan)
        // single-sided additive planes: face whichever side of the gate the camera is on
        const face = camDx >= 0 ? Math.PI / 2 : -Math.PI / 2
        if (curtainPlane.current) curtainPlane.current.rotation.y = face
        // laser fan: hinged at the head, tracks the box along x with a barcode-reader jitter
        if (fan.current) {
          const on = scan > 0.01 && Math.abs(dx) < 3
          fan.current.visible = on
          if (on) {
            fanPlane.current.rotation.y = face
            const track = THREE.MathUtils.clamp(Math.atan2(dx, FAN_LEN), -FAN_MAX, FAN_MAX)
            // the fan hangs along −y; Rz(θ) sends (0,−1,0) → (sin θ, −cos θ, 0), so +θ tilts the tip toward +x
            fan.current.rotation.z = track + Math.sin(time * 11) * 0.06 * scan
            const f = fanMat.uniforms
            f.uTime.value = time
            f.uActive.value = scan * 1.2
            f.uSweep.value = 0.5 + 0.5 * Math.sin(time * 7.5)
          }
        }
        // slit brightens while scanning, status light blinks
        const b = built
        b.pucks.setColorAt(0, b.c.setRGB(1, 0.54, 0.16).multiplyScalar(2.5 + scan * 1.5))
        const blink = 0.5 + 0.5 * Math.sin(time * 6)
        b.d.position.set(0.17, H - 0.06, 0.18)
        b.d.scale.setScalar(0.036 * (0.8 + 0.4 * (scan > 0.05 ? blink : 0.3)))
        b.d.updateMatrix()
        b.pucks.setMatrixAt(1, b.d.matrix)
        b.pucks.instanceMatrix.needsUpdate = true
        if (b.pucks.instanceColor) b.pucks.instanceColor.needsUpdate = true
      },
    }),
    [curtain, fanMat, built],
  )
  return (
    <group position={[x, 0, 0]} name="ScannerArch">
      <mesh geometry={built.frame} material={built.parts} receiveShadow />
      <mesh position={[0.1, H + 0.08, 0]} rotation={[0, Math.PI / 2, 0]} material={built.plate}>
        <planeGeometry args={[0.72, 0.13]} />
      </mesh>
      <primitive object={built.pucks} />
      {/* laser curtain across the belt (YZ plane, faces the camera side) */}
      <mesh ref={curtainPlane} position={[0, beltTop + 0.55, 0]} rotation={[0, Math.PI / 2, 0]} material={curtain} renderOrder={5}>
        <planeGeometry args={[width + 0.3, 1.1]} />
      </mesh>
      {/* laser fan: a thin additive blade hinged under the sensor head, only while a box is in the gate */}
      <group ref={fan} position={[0, H - 0.21, 0]} visible={false}>
        <mesh ref={fanPlane} position={[0, -FAN_LEN / 2, 0]} rotation={[0, Math.PI / 2, 0]} material={fanMat} renderOrder={7}>
          <planeGeometry args={[width + 0.1, FAN_LEN]} />
        </mesh>
      </group>
    </group>
  )
})
