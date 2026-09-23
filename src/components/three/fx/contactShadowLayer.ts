import type * as THREE from 'three'

/**
 * Contact shadows are rendered by a dedicated orthographic camera (Podium → SoftContactShadow) that only
 * sees objects on CONTACT_SHADOW_LAYER. Scenes opt in the few meshes whose contact shadow is visible
 * (`obj.layers.enable(CONTACT_SHADOW_LAYER)`); everything else is skipped by that depth pass.
 */
export const CONTACT_SHADOW_LAYER = 3

/** Legacy helper kept for scenes that call it: (re)assigns the podium's shadow camera to `layer`. */
export function contactShadowLayer(root: THREE.Object3D | null, layer: number = CONTACT_SHADOW_LAYER) {
  if (!root) return
  root.traverse((o) => {
    if ((o as THREE.OrthographicCamera).isOrthographicCamera) o.layers.set(layer)
  })
}
