import type * as THREE from 'three'

/** True when the object and all its ancestors are visible (cheap upward walk; scene depth is ≤ 8). */
export function isRenderedInTree(obj: THREE.Object3D | null): boolean {
  let o: THREE.Object3D | null = obj
  while (o) {
    if (!o.visible) return false
    o = o.parent
  }
  return true
}
