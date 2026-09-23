import { keyframes, type CameraFn } from '@/lib/camera'
import { mkPreset, type LightPreset } from '@/lib/lights'

/**
 * §04 CONTAINER — camera choreography (local space of world A; container door face at x=36.3,
 * interior x 36.3..48.5, z ±1.2). Boundary poses are canonical (docs §2); the stage ends with a cut.
 *
 * t0    outside, three-quarter view of the open doors (= Conveyor t1)
 * t.15  approaching the door opening, the pallet rolls ahead of us
 * t.22  through the doorway (z .8 keeps us clear of the +Z corner post — the straight line
 *       from t.15 to t.45 would clip the wall, so the doorway pass is an explicit key)
 * t.33  beside / above the box as we overtake it on the +Z side — the lookAt swings around
 *       the cargo (target stays on the box, so the pan is an arc, never a flip)
 * t.45  behind the box, looking back at the door opening
 * t.80–1 hold: the box is a silhouette against the narrowing slit; doors shut at .80
 * All poses portrait:'fov' (enclosed space, no dolly-out).
 */
export const cameraAt: CameraFn = keyframes([
  { t: 0, pose: { position: [33, 1.6, 3.5], target: [36, 0.9, 0], fov: 38, portrait: 'fov' } },
  { t: 0.15, pose: { position: [34.5, 1.5, 1.6], target: [37, 0.9, 0], fov: 38, portrait: 'fov' } },
  { t: 0.22, pose: { position: [36.2, 1.55, 0.8], target: [37.6, 0.85, 0], fov: 38, portrait: 'fov' } },
  { t: 0.33, pose: { position: [39.0, 1.75, 0.95], target: [38.9, 0.75, -0.15], fov: 38, portrait: 'fov' } },
  { t: 0.45, pose: { position: [41.5, 1.5, 0.6], target: [39, 0.9, 0], fov: 38, portrait: 'fov' } },
  { t: 0.8, pose: { position: [41.5, 1.5, 0.6], target: [36, 1.3, 0], fov: 38, portrait: 'fov' } },
  { t: 1, pose: { position: [41.5, 1.5, 0.6], target: [36, 1.3, 0], fov: 38, portrait: 'fov' } },
])

/**
 * Lights: a low warm key from the dock side (its shadow through the doorway narrows with the
 * doors), a constant sodium point inside the container (the ceiling bulkhead lamp), a second
 * point on the dock lamp post outside. Spots off. Fog .035 (world A), bloom .7.
 */
export const lights: LightPreset = mkPreset({
  hemi: { sky: '#262a33', ground: '#07080a', intensity: 0.22 },
  key: { position: [28, 5.5, 3], target: [40, 0.5, 0], intensity: 1.1, color: '#ffd6ad', shadowSize: 8 }, // tight frustum: box, pallet, plate, container, dock edge
  spots: [
    { position: [0, 10, 0], target: [0, 0, 0], intensity: 0 },
    { position: [0, 10, 0], target: [0, 0, 0], intensity: 0 },
    { position: [0, 10, 0], target: [0, 0, 0], intensity: 0 },
    { position: [0, 10, 0], target: [0, 0, 0], intensity: 0 },
  ],
  points: [
    { position: [40, 2.2, 0], intensity: 6, color: '#ffb070', distance: 8 },
    { position: [33.2, 4.05, -2.1], intensity: 3.5, color: '#ffb070', distance: 11 },
  ],
  fog: { color: '#0b0c0f', density: 0.035 },
  env: 0.55,
  bloom: 0.7,
})
