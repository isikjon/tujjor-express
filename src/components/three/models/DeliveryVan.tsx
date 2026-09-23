'use client'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { brandPlate } from '@/lib/textures'
import { Particles } from '../fx/Particles'

/**
 * Procedural Tujjor delivery van (panel van, 1.9 W × 2.3 H × 5.2 L, 1 unit = 1 m).
 * Local frame: origin on the ground under the body centre, forward = −X (rear = +X), the sliding
 * cargo door is on the +Z side. Body = one bevelled extrusion of the side profile (rounded roof,
 * sloped windscreen, wheel arches, door aperture) + layered trim: orange belt line and roof edge,
 * TUJJOR EXPRESS plates, dark glass, wheels with rims, emissive head / tail lights.
 * Every static part is merged per material (10 meshes); the sliding door keeps its 4 parts; the
 * tyres and rims are rotationally symmetric so they live in two static meshes and only the four
 * hub + spoke sets spin. 20 draw calls, 4 shadow casters (shell, bumpers, door, tyres).
 * Sway/bounce go on `body`; the outer `group` is placed on the road by the scene.
 */
export const VAN_SIZE: [number, number, number] = [5.2, 2.3, 1.9]
/** cargo bay point (box centre when loaded) in van-local space */
export const VAN_BAY: [number, number, number] = [-0.3, 0.79, 0.15]
/** centre of the side-door aperture in van-local space */
export const VAN_DOOR: [number, number, number] = [-0.3, 1.34, 0.95]
const WHEEL_R = 0.42
const WHEELS: [number, number][] = [
  [-1.7, 0.83],
  [-1.7, -0.83],
  [1.7, 0.83],
  [1.7, -0.83],
]

export interface DeliveryVanHandle {
  group: THREE.Group
  /** body group — the scene writes sway / bounce here */
  body: THREE.Group
  /** 0 = closed, 1 = fully open (slides toward the rear) */
  setDoor: (open: number) => void
  /** advance the wheels by a travelled distance (metres, signed) */
  roll: (dist: number) => void
  /** dust puff strength 0..1 (rear wheels) */
  setDust: (k: number) => void
  /** headlights + tail lights 0..1 */
  setLights: (k: number) => void
}
interface Props {
  position?: [number, number, number]
  rotation?: [number, number, number]
  dust?: boolean
}

/** axis-aligned box placed at (x, y, z), optionally rotated (quaternion applied before the translation) */
function bx(w: number, h: number, d: number, x: number, y: number, z: number, q?: THREE.Quaternion) {
  const g = new THREE.BoxGeometry(w, h, d)
  if (q) g.applyQuaternion(q)
  g.translate(x, y, z)
  return g
}
function merge(list: THREE.BufferGeometry[]) {
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g))
  const out = mergeGeometries(flat, false) ?? flat[0]
  for (const g of list) if (g !== out) g.dispose()
  for (const g of flat) if (g !== out) g.dispose()
  return out
}

export const DeliveryVan = forwardRef<DeliveryVanHandle, Props>(function DeliveryVan({ position, rotation, dust = true }, ref) {
  const group = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const door = useRef<THREE.Group>(null!)
  const hubs = useRef<THREE.Mesh[]>([])
  const dustGroup = useRef<THREE.Group>(null!)
  const spin = useRef(0)
  const lightK = useRef(-1)

  const { mats, geo } = useMemo(() => {
    /* ---------- materials ---------- */
    const paint = new THREE.MeshStandardMaterial({ color: '#f4f2ee', roughness: 0.32, metalness: 0.08, envMapIntensity: 1.1 })
    const trim = new THREE.MeshStandardMaterial({ color: '#1c1e23', roughness: 0.62, metalness: 0.25 })
    const bumper = new THREE.MeshStandardMaterial({ color: '#2b2e34', roughness: 0.75, metalness: 0.15 })
    const glass = new THREE.MeshStandardMaterial({ color: '#0e1216', roughness: 0.1, metalness: 0.55, envMapIntensity: 1.4 })
    const orange = new THREE.MeshStandardMaterial({ color: '#ff6a00', roughness: 0.42, metalness: 0.2 })
    const rubber = new THREE.MeshStandardMaterial({ color: '#141517', roughness: 0.95, metalness: 0 })
    const rim = new THREE.MeshStandardMaterial({ color: '#c4c8cf', roughness: 0.28, metalness: 0.85 })
    const hub = new THREE.MeshStandardMaterial({ color: '#4a4e57', roughness: 0.5, metalness: 0.7 })
    const inner = new THREE.MeshStandardMaterial({ color: '#2a2c31', roughness: 0.92, metalness: 0.05, side: THREE.BackSide })
    const floor = new THREE.MeshStandardMaterial({ color: '#4a4d55', roughness: 0.9, metalness: 0.1 })
    const head = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff1d6').multiplyScalar(2.5), toneMapped: false })
    const tail = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3b1f').multiplyScalar(1.6), toneMapped: false })
    const plateTex = brandPlate('TUJJOR EXPRESS', 1024, 256, '#f4f2ee', '#ff6a00')
    const plate = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.34, metalness: 0.08 })

    /* ---------- body profile (side silhouette in XY, extruded along Z) ---------- */
    const s = new THREE.Shape()
    s.moveTo(2.6, 0.45)
    s.lineTo(2.6, 2.1)
    s.quadraticCurveTo(2.6, 2.3, 2.38, 2.3) // rear roof corner
    s.lineTo(-1.35, 2.3)
    s.quadraticCurveTo(-1.62, 2.3, -1.7, 2.1) // windscreen header
    s.lineTo(-2.05, 1.36) // windscreen foot
    s.quadraticCurveTo(-2.45, 1.3, -2.6, 1.12) // bonnet
    s.lineTo(-2.6, 0.45)
    s.lineTo(-2.15, 0.45)
    s.absarc(-1.7, 0.45, 0.45, Math.PI, 0, true) // front arch
    s.lineTo(1.25, 0.45)
    s.absarc(1.7, 0.45, 0.45, Math.PI, 0, true) // rear arch
    s.lineTo(2.6, 0.45)
    // side-door aperture (goes through the width; the −Z side is plugged by a panel)
    const hole = new THREE.Path()
    hole.moveTo(-1.0, 0.6)
    hole.lineTo(0.4, 0.6)
    hole.lineTo(0.4, 2.08)
    hole.lineTo(-1.0, 2.08)
    hole.closePath()
    s.holes.push(hole)
    const shell = new THREE.ExtrudeGeometry(s, { depth: 1.82, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelOffset: -0.04, bevelSegments: 3, curveSegments: 14, steps: 1 })
    shell.translate(0, 0, -0.91)
    shell.computeVertexNormals()

    // windscreen: box whose local +Y follows the slope (−2.05,1.36) → (−1.7,2.1)
    const d = new THREE.Vector2(0.35, 0.74).normalize()
    const glassQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(-d.x, d.y))

    /* ---------- static parts merged per material ---------- */
    // shell + −Z plug for the door aperture (the extrusion hole goes through)
    const paintGeo = merge([shell, bx(1.44, 1.56, 0.06, -0.3, 1.34, -0.92)])
    const trimGeo = merge([
      bx(4.5, 0.24, 1.5, 0, 0.34, 0), // underbody / chassis
      bx(0.02, 1.6, 0.02, 2.612, 1.35, 0), // rear door seam
      bx(0.02, 0.26, 1.3, -2.612, 0.76, 0), // grille
      ...[-1, 1].flatMap((sz) => [
        bx(0.05, 0.2, 0.42, -2.6, 0.98, sz * 0.66), // head-light housings
        bx(0.12, 0.22, 0.07, -1.85, 1.74, sz * 1.06), // mirrors
        bx(0.03, 0.03, 0.14, -1.85, 1.74, sz * 0.99),
        bx(3.5, 0.05, 0.05, 0.4, 2.34, sz * 0.62), // roof rails
      ]),
      bx(3.5, 0.03, 0.035, 0.75, 2.13, 0.965), // sliding-door rails
      bx(3.5, 0.03, 0.035, 0.75, 0.6, 0.965),
    ])
    const bumperGeo = merge([bx(0.16, 0.24, 1.94, -2.6, 0.52, 0), bx(0.16, 0.24, 1.94, 2.6, 0.52, 0)])
    const glassGeo = merge([
      bx(0.02, 0.86, 1.7, -1.886, 1.735, 0, glassQuat), // windscreen
      ...[-1, 1].flatMap((sz) => [bx(0.62, 0.58, 0.02, -1.42, 1.78, sz * 0.955), bx(0.02, 0.44, 0.66, 2.605, 1.85, sz * 0.44)]), // cab side + rear door windows
    ])
    const orangeGeo = merge([
      bx(0.02, 0.1, 0.34, -2.625, 0.98, 0), // badge
      bx(3.8, 0.035, 0.035, 0.45, 2.285, 0.925), // roof edges
      bx(3.8, 0.035, 0.035, 0.45, 2.285, -0.925),
      bx(4.5, 0.07, 0.02, 0.3, 1.2, -0.962), // belt line: full on −Z, split around the door on +Z
      bx(0.95, 0.07, 0.02, -1.52, 1.2, 0.962),
      bx(2.1, 0.07, 0.02, 1.5, 1.2, 0.962),
    ])
    const headGeo = merge([bx(0.02, 0.14, 0.34, -2.63, 0.98, 0.66), bx(0.02, 0.14, 0.34, -2.63, 0.98, -0.66)])
    const tailGeo = merge([bx(0.02, 0.5, 0.1, 2.615, 1.15, 0.86), bx(0.02, 0.5, 0.1, 2.615, 1.15, -0.86)])
    const plateL = new THREE.PlaneGeometry(2.4, 0.6)
    plateL.rotateY(Math.PI)
    plateL.translate(0.8, 1.66, -0.966)
    const plateR = new THREE.PlaneGeometry(1.9, 0.475)
    plateR.translate(1.55, 1.66, 0.966)
    const plateGeo = merge([plateL, plateR])
    const innerGeo = bx(1.7, 1.62, 1.86, -0.3, 1.34, 0) // cargo bay lining (BackSide)
    const axle = new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8)
    axle.rotateZ(Math.PI / 2)
    axle.translate(2.35, 0.3, -0.6)
    const floorGeo = merge([bx(1.66, 0.03, 1.82, -0.3, 0.56, 0), axle]) // floor plank + rear axle stub
    // tyres and rims are bodies of revolution about the axle: static, one mesh each
    const tyres = merge(
      WHEELS.map(([x, z]) => {
        const g = new THREE.TorusGeometry(0.31, 0.11, 10, 28)
        g.translate(x, WHEEL_R, z)
        return g
      }),
    )
    const rims = merge(
      WHEELS.map(([x, z]) => {
        const g = new THREE.CylinderGeometry(0.215, 0.215, 0.2, 20)
        g.rotateX(Math.PI / 2)
        g.translate(x, WHEEL_R, z)
        return g
      }),
    )
    // hub cap + 5 spokes per wheel (the only spinning part), in wheel-local space
    const hubGeo = [1, -1].map((side) => {
      const cap = new THREE.CylinderGeometry(0.075, 0.075, 0.03, 12)
      cap.rotateX(Math.PI / 2)
      cap.translate(0, 0, side * 0.1)
      const spokes = [0, 1, 2, 3, 4].map((k) => {
        const g = new THREE.BoxGeometry(0.05, 0.36, 0.015)
        g.rotateZ((k / 5) * Math.PI * 2)
        g.translate(0, 0, side * 0.105)
        return g
      })
      return merge([cap, ...spokes])
    })
    // door parts (dynamic group)
    const doorPanel = new THREE.BoxGeometry(1.44, 1.56, 0.03)
    const doorGlass = bx(0.95, 0.5, 0.01, 0, 0.44, 0.017)
    const doorBelt = bx(1.44, 0.07, 0.015, 0, -0.14, 0.02)
    const doorHandle = bx(0.16, 0.035, 0.03, -0.55, -0.02, 0.035)
    return {
      mats: { paint, trim, bumper, glass, orange, rubber, rim, hub, inner, floor, head, tail, plate },
      geo: { paintGeo, trimGeo, bumperGeo, glassGeo, orangeGeo, headGeo, tailGeo, plateGeo, innerGeo, floorGeo, tyres, rims, hubGeo, doorPanel, doorGlass, doorBelt, doorHandle },
    }
  }, [])
  useEffect(
    () => () => {
      for (const m of Object.values(mats)) m.dispose()
      for (const g of Object.values(geo)) if (Array.isArray(g)) g.forEach((x) => x.dispose())
      else g.dispose()
    },
    [mats, geo],
  )

  const setDoor = (open: number) => {
    const g = door.current
    if (!g) return
    const pop = THREE.MathUtils.smoothstep(open, 0, 0.25)
    g.position.set(-0.3 + open * 1.3, 1.34, 0.955 + pop * 0.075)
  }
  const roll = (dist: number) => {
    if (dist === 0) return
    spin.current -= dist / WHEEL_R
    for (const w of hubs.current) if (w) w.rotation.z = spin.current
  }
  const setDust = (k: number) => {
    const g = dustGroup.current
    if (!g) return
    for (const c of g.children) {
      const pts = c as THREE.Points
      const m = pts.material as THREE.ShaderMaterial
      if (m?.uniforms?.uOpacity) m.uniforms.uOpacity.value = 0.6 * k
      pts.visible = k > 0.02
    }
  }
  const setLights = (k: number) => {
    if (k === lightK.current) return
    lightK.current = k
    mats.head.color.set('#fff1d6').multiplyScalar(0.3 + 2.2 * k)
    mats.tail.color.set('#ff3b1f').multiplyScalar(0.25 + 1.35 * k)
  }
  useImperativeHandle(
    ref,
    () => ({
      get group() {
        return group.current
      },
      get body() {
        return body.current
      },
      setDoor,
      roll,
      setDust,
      setLights,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return (
    <group ref={group} position={position} rotation={rotation} name="DeliveryVan">
      <group ref={body}>
        {/* body shell + door plug */}
        <mesh geometry={geo.paintGeo} material={mats.paint} castShadow receiveShadow />
        {/* cargo bay interior + floor plank / axle */}
        <mesh geometry={geo.innerGeo} material={mats.inner} />
        <mesh geometry={geo.floorGeo} material={mats.floor} />
        {/* chassis, seam, grille, light housings, mirrors, roof + door rails */}
        <mesh geometry={geo.trimGeo} material={mats.trim} />
        <mesh geometry={geo.bumperGeo} material={mats.bumper} castShadow />
        <mesh geometry={geo.glassGeo} material={mats.glass} />
        <mesh geometry={geo.orangeGeo} material={mats.orange} />
        {/* head lights (emissive, bloom) + tail lights */}
        <mesh geometry={geo.headGeo} material={mats.head} />
        <mesh geometry={geo.tailGeo} material={mats.tail} />
        {/* brand plates on both sides */}
        <mesh geometry={geo.plateGeo} material={mats.plate} />
        {/* sliding door (+Z): panel, window, belt segment, handle */}
        <group ref={door} position={[-0.3, 1.34, 0.955]}>
          <mesh geometry={geo.doorPanel} material={mats.paint} castShadow />
          <mesh geometry={geo.doorGlass} material={mats.glass} />
          <mesh geometry={geo.doorBelt} material={mats.orange} />
          <mesh geometry={geo.doorHandle} material={mats.trim} />
        </group>
        {/* wheels: static tyres + rims, spinning hub caps + spokes */}
        <mesh geometry={geo.tyres} material={mats.rubber} castShadow />
        <mesh geometry={geo.rims} material={mats.rim} />
        {WHEELS.map(([x, z], i) => (
          <mesh
            key={i}
            geometry={geo.hubGeo[z > 0 ? 0 : 1]}
            material={mats.hub}
            position={[x, WHEEL_R, z]}
            ref={(m) => {
              if (m) hubs.current[i] = m
            }}
          />
        ))}
      </group>
      {/* dust puffs behind the rear wheels (opacity driven by the scene through setDust) */}
      {dust ? (
        <group ref={dustGroup}>
          <Particles count={70} spread={[1.8, 0.9, 1.0]} position={[2.2, 0.35, 0.8]} color="#a89880" size={3.2} opacity={0} drift={[0.9, 0.35, 0]} speed={0.35} seed={17} />
          <Particles count={70} spread={[1.8, 0.9, 1.0]} position={[2.2, 0.35, -0.8]} color="#a89880" size={3.2} opacity={0} drift={[0.9, 0.35, 0]} speed={0.35} seed={23} />
        </group>
      ) : null}
    </group>
  )
})
