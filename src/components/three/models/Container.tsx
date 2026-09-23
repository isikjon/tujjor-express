'use client'
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import * as THREE from 'three'
import { brandPlate, corrugatedNormal, labelTexture } from '@/lib/textures'
import { CONTAINER_NO } from '@/config/worldB'

/** 40ft container: 12.2 × 2.6 × 2.4 (x = length). Doors on the −X face, hinged at the outer edges. Local origin = floor centre. */
export const CONTAINER_SIZE: [number, number, number] = [12.2, 2.6, 2.4]

export interface ContainerHandle {
  group: THREE.Group
  /** 0 = open (−165°), 1 = closed */
  setDoors: (closed: number) => void
}
interface Props {
  position?: [number, number, number]
  rotation?: [number, number, number]
  /** initial door state, 1 = closed */
  closed?: number
  /** render the interior (roller floor, slit light) — only needed when the camera goes inside */
  interior?: boolean
  castShadow?: boolean
}

/**
 * Branded orange container (docs §04/§08). Exterior Orange with corrugated steel normal map,
 * TUJJOR EXPRESS plate, number `TJEU 447120 3`; interior Graphite-2 steel with Orange only on
 * the door seals. Two door leaves with lock bars.
 */
export const Container = forwardRef<ContainerHandle, Props>(function Container({ position, rotation, closed = 0, interior = true, castShadow = true }, ref) {
  const group = useRef<THREE.Group>(null!)
  const leftDoor = useRef<THREE.Group>(null!)
  const rightDoor = useRef<THREE.Group>(null!)
  const [L, H, W] = CONTAINER_SIZE
  const mats = useMemo(() => {
    const normal = corrugatedNormal(512, 18)
    normal.repeat.set(6, 1)
    const wall = new THREE.MeshStandardMaterial({ color: '#ff6a00', roughness: 0.55, metalness: 0.35, normalMap: normal, normalScale: new THREE.Vector2(0.9, 0.9) })
    const endNormal = corrugatedNormal(512, 8)
    const end = new THREE.MeshStandardMaterial({ color: '#f26400', roughness: 0.55, metalness: 0.35, normalMap: endNormal, normalScale: new THREE.Vector2(0.9, 0.9) })
    const inner = new THREE.MeshStandardMaterial({ color: '#1a1d24', roughness: 0.8, metalness: 0.4, normalMap: normal, normalScale: new THREE.Vector2(0.5, 0.5), side: THREE.BackSide })
    const frame = new THREE.MeshStandardMaterial({ color: '#2a2d35', roughness: 0.6, metalness: 0.6 })
    const seal = new THREE.MeshBasicMaterial({ color: '#ff8a2a', toneMapped: false })
    const plate = new THREE.MeshStandardMaterial({ map: brandPlate('TUJJOR EXPRESS', 1024, 256, '#ff6a00', '#ffffff'), roughness: 0.5, metalness: 0.3 })
    const number = new THREE.MeshStandardMaterial({ map: labelTexture(CONTAINER_NO, { w: 512, h: 96, font: '700 44px "Space Grotesk", sans-serif', color: '#ffffff', bg: 'transparent' }), transparent: true, roughness: 0.5 })
    const floor = new THREE.MeshStandardMaterial({ color: '#3a3128', roughness: 0.9, metalness: 0.1 })
    return { wall, end, inner, frame, seal, plate, number, floor }
  }, [])
  const setDoors = (c: number) => {
    const a = THREE.MathUtils.degToRad(165) * (1 - c)
    if (leftDoor.current) leftDoor.current.rotation.y = -a
    if (rightDoor.current) rightDoor.current.rotation.y = a
  }
  useImperativeHandle(ref, () => ({ get group() { return group.current }, setDoors }), [])
  const th = 0.04
  // interior lining = 5 faces (no door face) so the doorway is open from inside; roller floor = 1 instanced mesh; posts merged
  const built = useMemo(() => {
    const lining = new THREE.BoxGeometry(L - th * 2, H - th, W - th * 2)
    // drop the −X face (group index 1 in BoxGeometry order +x,−x,+y,−y,+z,−z)
    const idx = lining.getIndex()!
    const g = lining.groups
    const keep: number[] = []
    g.forEach((gr, i) => {
      if (i === 1) return
      for (let k = gr.start; k < gr.start + gr.count; k++) keep.push(idx.getX(k))
    })
    lining.setIndex(keep)
    lining.clearGroups()
    lining.translate(0, H / 2, 0)
    const posts = mergeGeometries(
      [-1, 1].flatMap((sx) => [-1, 1].map((sz) => new THREE.BoxGeometry(0.12, H + 0.04, 0.12).translate((sx * L) / 2, H / 2, (sz * W) / 2))),
    )!
    const roller = new THREE.CylinderGeometry(0.03, 0.03, W - 0.4, 8).rotateX(Math.PI / 2)
    return { lining, posts, roller }
  }, [L, H, W])
  const rollers = useRef<THREE.InstancedMesh>(null!)
  const setRollers = (m: THREE.InstancedMesh | null) => {
    if (!m || rollers.current === m) return
    rollers.current = m
    const mat = new THREE.Matrix4()
    for (let i = 0; i < 22; i++) {
      mat.makeTranslation(-L / 2 + 0.4 + i * 0.52, 0.06, 0)
      m.setMatrixAt(i, mat)
    }
    m.instanceMatrix.needsUpdate = true
  }
  return (
    <group ref={group} position={position} rotation={rotation} name="Container">
      {/* shell: 5 faces (no door face) */}
      <mesh position={[0, H / 2, W / 2]} material={mats.wall} castShadow={castShadow} receiveShadow>
        <boxGeometry args={[L, H, th]} />
      </mesh>
      <mesh position={[0, H / 2, -W / 2]} material={mats.wall} castShadow={castShadow} receiveShadow>
        <boxGeometry args={[L, H, th]} />
      </mesh>
      <mesh position={[0, H, 0]} material={mats.wall} castShadow={castShadow}>
        <boxGeometry args={[L, th, W]} />
      </mesh>
      <mesh position={[L / 2, H / 2, 0]} material={mats.end} castShadow={castShadow}>
        <boxGeometry args={[th, H, W]} />
      </mesh>
      <mesh position={[0, 0.02, 0]} material={mats.floor} receiveShadow>
        <boxGeometry args={[L, 0.04, W]} />
      </mesh>
      {interior ? (
        <>
          <mesh geometry={built.lining} material={mats.inner} />
          {/* roller floor strip: rods across the width (z), one instanced draw */}
          <instancedMesh ref={setRollers} args={[built.roller, mats.frame, 22]} />
        </>
      ) : null}
      {/* corner posts (merged) */}
      <mesh geometry={built.posts} material={mats.frame} castShadow={castShadow} />
      {/* brand plate + number on +Z side */}
      <mesh position={[0, H * 0.55, W / 2 + th / 2 + 0.005]} material={mats.plate}>
        <planeGeometry args={[4.4, 1.1]} />
      </mesh>
      <mesh position={[L / 2 - 1.6, H - 0.35, W / 2 + th / 2 + 0.005]} material={mats.number}>
        <planeGeometry args={[2.2, 0.41]} />
      </mesh>
      <mesh position={[0, H * 0.55, -W / 2 - th / 2 - 0.005]} rotation={[0, Math.PI, 0]} material={mats.plate}>
        <planeGeometry args={[4.4, 1.1]} />
      </mesh>
      {/* doors on −X face, hinged at ±W/2 */}
      <group ref={leftDoor} position={[-L / 2, 0, -W / 2]}>
        <mesh position={[0, H / 2, W / 4]} material={mats.end} castShadow={castShadow}>
          <boxGeometry args={[th, H - 0.08, W / 2 - 0.03]} />
        </mesh>
        <mesh position={[-0.04, H / 2, W / 4]} material={mats.frame}>
          <boxGeometry args={[0.03, H - 0.4, 0.05]} />
        </mesh>
        <mesh position={[0.025, H / 2, W / 2 - 0.02]} material={mats.seal}>
          <boxGeometry args={[0.01, H - 0.1, 0.02]} />
        </mesh>
      </group>
      <group ref={rightDoor} position={[-L / 2, 0, W / 2]}>
        <mesh position={[0, H / 2, -W / 4]} material={mats.end} castShadow={castShadow}>
          <boxGeometry args={[th, H - 0.08, W / 2 - 0.03]} />
        </mesh>
        <mesh position={[-0.04, H / 2, -W / 4]} material={mats.frame}>
          <boxGeometry args={[0.03, H - 0.4, 0.05]} />
        </mesh>
      </group>
      <DoorInit setDoors={setDoors} closed={closed} />
    </group>
  )
})
function DoorInit({ setDoors, closed }: { setDoors: (c: number) => void; closed: number }) {
  // apply the initial door state once refs exist
  useMemo(() => queueMicrotask(() => setDoors(closed)), [setDoors, closed])
  return null
}
