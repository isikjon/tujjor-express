import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { cardboardTextures } from '@/lib/textures'

/**
 * Draw-call helpers for the conveyor stage: many static props of *different* colours /
 * roughness / metalness / emissive are merged into ONE geometry with per-vertex
 * `color` (linear), `aRM` (roughness, metalness) and `aEmit` (emissive strength)
 * attributes, rendered by one MeshStandardMaterial (`makePartsMaterial`). The picture is
 * identical to separate MeshStandardMaterials (same BRDF, same lights); only the
 * per-vertex constants replace the per-material uniforms.
 */
export interface Part {
  geo: THREE.BufferGeometry
  color: THREE.ColorRepresentation
  rough: number
  metal: number
  /** emissive = color · emit (linear), added like MeshStandardMaterial.emissiveIntensity */
  emit?: number
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
}

const _c = new THREE.Color()
const _m = new THREE.Matrix4()
const _e = new THREE.Euler()
const _q = new THREE.Quaternion()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()

/** merge parts into one indexed geometry with color / aRM / aEmit attributes (part geometries are disposed) */
export function mergeParts(parts: Part[]): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = []
  for (const part of parts) {
    const g = part.geo.index ? part.geo.toNonIndexed() : part.geo
    if (g !== part.geo) part.geo.dispose()
    // drop attributes that differ between primitives so mergeGeometries accepts them
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k)
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    if (part.position || part.rotation || part.scale) {
      _p.set(...(part.position ?? [0, 0, 0]))
      _e.set(...(part.rotation ?? [0, 0, 0]))
      _q.setFromEuler(_e)
      _s.set(...(part.scale ?? [1, 1, 1]))
      _m.compose(_p, _q, _s)
      g.applyMatrix4(_m)
    }
    const n = g.attributes.position.count
    const col = new Float32Array(n * 3)
    const rm = new Float32Array(n * 2)
    const em = new Float32Array(n)
    _c.set(part.color)
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r
      col[i * 3 + 1] = _c.g
      col[i * 3 + 2] = _c.b
      rm[i * 2] = part.rough
      rm[i * 2 + 1] = part.metal
      em[i] = part.emit ?? 0
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.setAttribute('aRM', new THREE.BufferAttribute(rm, 2))
    g.setAttribute('aEmit', new THREE.BufferAttribute(em, 1))
    geos.push(g)
  }
  const merged = mergeGeometries(geos, false)!
  for (const g of geos) g.dispose()
  return merged
}

/** inside-out copy of a geometry (flipped winding + normals) so an open shell reads from both sides with FrontSide */
export function insideOut(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone()
  const pos = g.attributes.position
  const nor = g.attributes.normal
  const uv = g.attributes.uv
  for (let i = 0; i < pos.count; i += 3) {
    // swap vertices 1 and 2 of every triangle
    for (const a of [pos, nor, uv]) {
      if (!a) continue
      for (let k = 0; k < a.itemSize; k++) {
        const t = a.getComponent(i + 1, k)
        a.setComponent(i + 1, k, a.getComponent(i + 2, k))
        a.setComponent(i + 2, k, t)
      }
    }
  }
  if (nor) for (let i = 0; i < nor.count; i++) nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i))
  return g
}

/** one MeshStandardMaterial for merged parts: roughness / metalness / emissive come from the vertex attributes */
export function makePartsMaterial(opts: { envMapIntensity?: number; side?: THREE.Side } = {}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 1, metalness: 0, side: opts.side ?? THREE.FrontSide })
  if (opts.envMapIntensity !== undefined) mat.envMapIntensity = opts.envMapIntensity
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aRM;\nattribute float aEmit;\nvarying vec3 vRME;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvRME = vec3(aRM, aEmit);')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRME;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRME.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRME.y;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += vColor.rgb * vRME.z;')
  }
  mat.customProgramCacheKey = () => 'tj-conveyor-parts'
  return mat
}

/** a box part helper */
export const box = (w: number, h: number, d: number, color: THREE.ColorRepresentation, rough: number, metal: number, position?: [number, number, number], extra: Partial<Part> = {}): Part => ({
  geo: new THREE.BoxGeometry(w, h, d),
  color,
  rough,
  metal,
  position,
  ...extra,
})
/** a cylinder part helper (axis y) */
export const cyl = (rt: number, rb: number, h: number, seg: number, color: THREE.ColorRepresentation, rough: number, metal: number, position?: [number, number, number], extra: Partial<Part> = {}): Part => ({
  geo: new THREE.CylinderGeometry(rt, rb, h, seg),
  color,
  rough,
  metal,
  position,
  ...extra,
})

/**
 * Small HDR emitters (LEDs, lamp cores, status lights) as one InstancedMesh: a unit disc/puck
 * whose +z face is the visible side, coloured per instance (`setColorAt`, HDR floats allowed).
 */
export function makeGlowPucks(count: number): THREE.InstancedMesh {
  const geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 16).rotateX(Math.PI / 2)
  const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })
  const m = new THREE.InstancedMesh(geo, mat, count)
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3)
  m.castShadow = false
  m.receiveShadow = false
  return m
}

/** cardboard atlas (brand / arrows / plain faces of lib/textures in one 1024² map) for instanced mini boxes */
let atlasCache: { size: number; tex: THREE.Texture } | null = null
export function cardboardAtlas(size = 512): THREE.Texture {
  if (atlasCache && atlasCache.size === size) return atlasCache.tex
  const c = document.createElement('canvas')
  c.width = size * 2
  c.height = size * 2
  const g = c.getContext('2d')!
  const sets = [cardboardTextures(size, 0), cardboardTextures(size, 2), cardboardTextures(size, 1)]
  sets.forEach((s, i) => g.drawImage(s.map.image as CanvasImageSource, (i % 2) * size, Math.floor(i / 2) * size, size, size))
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  atlasCache = { size, tex: t }
  return t
}
/** box geometry whose faces sample the atlas: +x/−x arrows (quad 1), +y/−y/−z plain (quad 2), +z brand (quad 0) */
export function atlasBoxGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d)
  const uv = geo.attributes.uv
  // BoxGeometry face order: +x, −x, +y, −y, +z, −z — 4 vertices each
  const quad = [1, 1, 2, 2, 0, 2]
  for (let f = 0; f < 6; f++) {
    const qx = (quad[f] % 2) * 0.5
    const qy = 1 - Math.floor(quad[f] / 2) * 0.5 - 0.5
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v
      uv.setXY(i, qx + uv.getX(i) * 0.5, qy + uv.getY(i) * 0.5)
    }
  }
  return geo
}
