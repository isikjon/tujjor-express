// Copies DRACO / Basis decoders from three into /public so GLB assets can be loaded compressed.
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
const root = process.cwd()
const pairs = [
  ['node_modules/three/examples/jsm/libs/draco/gltf', 'public/draco'],
  ['node_modules/three/examples/jsm/libs/basis', 'public/basis'],
]
for (const [from, to] of pairs) {
  const src = join(root, from)
  const dst = join(root, to)
  if (!existsSync(src)) continue
  mkdirSync(dst, { recursive: true })
  cpSync(src, dst, { recursive: true })
}
