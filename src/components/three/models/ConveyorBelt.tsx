'use client'
import { forwardRef, useEffect, useImperativeHandle, useMemo } from 'react'
import * as THREE from 'three'
import { corrugatedNormal } from '@/lib/textures'
import { seeded } from '@/lib/math'
import { box, makePartsMaterial, mergeParts } from './ConveyorParts'

/** Belt surface height and usable width (docs §03). */
export const BELT_TOP = 0.55
export const BELT_WIDTH = 1.4
const BELT_W = 1.2 // rubber strip width (rollers protrude 0.12 each side under the rails)
const ROLLER_R = 0.055
const DRUM_R = 0.12
const CHEVRON = 0.5 // world units per chevron
const TILE_CHEV = 4 // chevrons per texture tile (grain repeats every 2 u)

export interface ConveyorBeltHandle {
  /** move the belt by `dist` world units (+x): scrolls the rubber, spins rollers + drums */
  advance: (dist: number) => void
}
interface Props {
  x0?: number
  x1?: number
  /** PROFILES[tier].density — halves the roller count on low tiers */
  density?: number
}

const srgb = (v: number) => {
  const c = Math.max(0, Math.min(1, v))
  return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255)
}
const sstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * Belt tile: the chevron / rubber-grain / worn-edge pattern that used to be computed per pixel
 * is baked once into a small RGBA tile (alpha = chevron mask for the emissive term).
 * The tile spans TILE_CHEV chevrons along x and the full strip width along y.
 */
function makeBeltTile(): THREE.DataTexture {
  const W = 128 * TILE_CHEV
  const H = 308
  const data = new Uint8Array(W * H * 4)
  const base = new THREE.Color('#1b1c20')
  const rnd = seeded(5)
  // grain cells (7 per chevron × 48 across) — the old shader hash, precomputed per cell
  const gx = 7 * TILE_CHEV
  const gy = 48
  const grain = new Float32Array(gx * gy)
  for (let i = 0; i < grain.length; i++) grain[i] = rnd()
  for (let py = 0; py < H; py++) {
    const y = (py + 0.5) / H
    const ay = Math.abs(y - 0.5)
    const edge = 1 - sstep(0, 0.014, Math.abs(ay - 0.455))
    for (let px = 0; px < W; px++) {
      const x = ((px + 0.5) / W) * TILE_CHEV
      const c = (x + ay * 1.25) % 1
      const chev = (1 - sstep(0.025, 0.075, Math.abs(c - 0.5))) * (ay <= 0.41 ? 1 : 0)
      const g = grain[Math.min(gy - 1, Math.floor(y * gy)) * gx + Math.min(gx - 1, Math.floor(x * 7))]
      const k = 0.86 + g * 0.28
      let r = base.r * k + 0.06 * edge
      let gg = base.g * k + 0.06 * edge
      let b = base.b * k + 0.06 * edge
      const m = chev * 0.55
      r += (0.62 - r) * m
      gg += (0.25 - gg) * m
      b += (0.03 - b) * m
      const o = (py * W + px) * 4
      data[o] = srgb(r)
      data[o + 1] = srgb(gg)
      data[o + 2] = srgb(b)
      data[o + 3] = Math.round(chev * 255)
    }
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.ClampToEdgeWrapping
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.generateMipmaps = true
  t.anisotropy = 4
  t.needsUpdate = true
  return t
}

/**
 * Rubber belt material: MeshStandardMaterial (keeps the light rig) with the baked chevron tile as
 * its map — ONE texture sample, no loops. The map offset scrolls the chevrons along x (docs §14.10:
 * belt speed = 0.15 + 1.0·velocity, signed); the tile's alpha drives the faint orange emissive.
 */
function makeBeltMaterial(len: number) {
  const map = makeBeltTile()
  map.repeat.set(len / (CHEVRON * TILE_CHEV), 1)
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', map, roughness: 0.82, metalness: 0.06 })
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nfloat tjChev = 0.0;')
      .replace('#include <map_fragment>', 'vec4 tjMap = texture2D( map, vMapUv );\ndiffuseColor.rgb *= tjMap.rgb;\ntjChev = tjMap.a;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.42, 0.0) * tjChev * 0.16;')
  }
  mat.customProgramCacheKey = () => 'tj-conveyor-belt'
  return { mat, map }
}

/**
 * Belt conveyor x0 → x1 at z=0. 5 draw calls: belt strip (baked chevron map), rubber body +
 * return strand (one mesh), rollers + end drums (one InstancedMesh), legs/feet/braces (one
 * InstancedMesh of a merged leg pair) and the six rail bars (one merged mesh).
 * Everything static is built once; `advance()` only touches the map offset + roller/drum rotation.
 */
export const ConveyorBelt = forwardRef<ConveyorBeltHandle, Props>(function ConveyorBelt({ x0 = 4, x1 = 36, density = 1 }, ref) {
  const len = x1 - x0
  const cx = (x0 + x1) / 2

  const built = useMemo(() => {
    const parts = makePartsMaterial()
    const rollerNormal = corrugatedNormal(256, 6)
    const rollerMat = new THREE.MeshStandardMaterial({
      color: '#9aa0aa',
      roughness: 0.32,
      metalness: 0.85,
      normalMap: rollerNormal,
      normalScale: new THREE.Vector2(0.5, 0.5),
    })
    const belt = makeBeltMaterial(len)
    const dummy = new THREE.Object3D()

    // rollers — instanced at the full 0.4 u pitch; instance order = [drum A, drum B, even rollers…, odd rollers…]
    // so `count` can drop to the 0.8 u pitch on low tiers without rebuilding
    const all: number[] = []
    for (let x = x0 + 0.2; x < x1 - 0.1; x += 0.4) all.push(x)
    const xs = [...all.filter((_, i) => i % 2 === 0), ...all.filter((_, i) => i % 2 === 1)]
    const nEven = Math.ceil(all.length / 2)
    const rollerGeo = new THREE.CylinderGeometry(ROLLER_R, ROLLER_R, BELT_W + 0.24, 14, 1)
    const rollers = new THREE.InstancedMesh(rollerGeo, rollerMat, xs.length + 2)
    rollers.castShadow = false
    rollers.receiveShadow = true
    const drumScale = new THREE.Vector3(DRUM_R / ROLLER_R, BELT_W / (BELT_W + 0.24), DRUM_R / ROLLER_R)
    const drumX = [x0, x1]
    const setRollers = (angle: number, drum: number) => {
      for (let i = 0; i < 2; i++) {
        dummy.position.set(drumX[i], BELT_TOP - DRUM_R, 0)
        dummy.rotation.set(Math.PI / 2, drum, 0)
        dummy.scale.copy(drumScale)
        dummy.updateMatrix()
        rollers.setMatrixAt(i, dummy.matrix)
      }
      dummy.scale.setScalar(1)
      for (let i = 0; i < xs.length; i++) {
        dummy.position.set(xs[i], BELT_TOP - ROLLER_R - 0.005, 0)
        dummy.rotation.set(Math.PI / 2, angle, 0)
        dummy.updateMatrix()
        rollers.setMatrixAt(i + 2, dummy.matrix)
      }
      rollers.instanceMatrix.needsUpdate = true
    }
    setRollers(0, 0)
    rollers.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

    // legs + feet + brace every 2 u: one merged leg pair, instanced along x
    const legXs: number[] = []
    for (let x = x0; x <= x1 + 1e-3; x += 2) legXs.push(x)
    const legPair = mergeParts([
      ...[-1, 1].flatMap((s) => [
        box(0.06, 0.5, 0.06, '#20232a', 0.62, 0.6, [0, 0.25, s * (BELT_WIDTH / 2 + 0.02)]),
        box(0.16, 0.02, 0.16, '#3a3f48', 0.45, 0.75, [0, 0.01, s * (BELT_WIDTH / 2 + 0.02)]),
      ]),
      box(0.05, 0.05, BELT_WIDTH + 0.04, '#20232a', 0.62, 0.6, [0, 0.2, 0]),
    ])
    const legs = new THREE.InstancedMesh(legPair, parts, legXs.length)
    legXs.forEach((x, i) => {
      dummy.position.set(x, 0, 0)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      legs.setMatrixAt(i, dummy.matrix)
    })
    legs.castShadow = false
    legs.receiveShadow = true

    // side rails: top flush with the belt + lower stringer, both sides, one mesh
    const railZ = BELT_WIDTH / 2 + 0.05
    const railGeo = mergeParts(
      [-1, 1].flatMap((s) => [
        box(len + 0.36, 0.1, 0.06, '#3a3f48', 0.45, 0.75, [cx, BELT_TOP - 0.05, s * railZ]),
        box(len + 0.36, 0.012, 0.07, '#20232a', 0.62, 0.6, [cx, BELT_TOP + 0.003, s * railZ]),
        box(len, 0.05, 0.05, '#20232a', 0.62, 0.6, [cx, 0.32, s * railZ]),
      ]),
    )
    // rubber body under the strip + return strand: one mesh
    const rubberGeo = mergeParts([box(len, 0.05, BELT_W, '#121316', 0.92, 0.02, [cx, BELT_TOP - 0.028, 0]), box(len, 0.02, BELT_W, '#121316', 0.92, 0.02, [cx, 0.34, 0])])
    const spin = { angle: 0, drum: 0 }
    return { parts, rollerMat, belt, rollers, legs, railGeo, rubberGeo, xs, nEven, setRollers, spin }
  }, [x0, x1, len, cx])

  // tier: halve the roller pitch on low tiers (no rebuild)
  built.rollers.count = 2 + (density >= 0.7 ? built.xs.length : built.nEven)

  useEffect(
    () => () => {
      const b = built
      b.rollers.geometry.dispose()
      b.rollers.dispose()
      b.legs.geometry.dispose()
      b.legs.dispose()
      b.railGeo.dispose()
      b.rubberGeo.dispose()
      b.belt.map.dispose()
      b.belt.mat.dispose()
      b.parts.dispose()
      b.rollerMat.dispose()
    },
    [built],
  )

  useImperativeHandle(
    ref,
    () => ({
      advance: (dist: number) => {
        if (dist === 0) return
        const b = built
        // wrap the accumulators so precision never drifts on long sessions
        b.belt.map.offset.x = (b.belt.map.offset.x - dist / (CHEVRON * TILE_CHEV)) % 1
        // a point on top of a roller moves +x when the roller turns by a negative angle about +z
        b.spin.angle = (b.spin.angle - dist / ROLLER_R) % (Math.PI * 2)
        b.spin.drum = (b.spin.drum - dist / DRUM_R) % (Math.PI * 2)
        b.setRollers(b.spin.angle, b.spin.drum)
      },
    }),
    [built],
  )

  return (
    <group name="ConveyorBelt">
      {/* rubber strip: baked chevron map, scrolled through the map offset */}
      <mesh position={[cx, BELT_TOP, 0]} rotation={[-Math.PI / 2, 0, 0]} material={built.belt.mat} receiveShadow>
        <planeGeometry args={[len, BELT_W]} />
      </mesh>
      <mesh geometry={built.rubberGeo} material={built.parts} receiveShadow />
      <primitive object={built.rollers} />
      <mesh geometry={built.railGeo} material={built.parts} receiveShadow />
      <primitive object={built.legs} />
    </group>
  )
})
