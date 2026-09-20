import type { ComponentType } from 'react'
import type { CameraFn } from '@/lib/camera'
import type { LightPreset } from '@/lib/lights'
import type { StageDef } from '@/lib/timeline'

/**
 * SCENE CONTRACT (docs/DESIGN.md §8)
 * - A scene is a default-exported component rendered inside `<group position={[WORLD_OFFSET[world],0,0]}>`.
 *   Author everything in LOCAL space (x=0 is the world origin). Studio stations inside world D add STUDIO_X.
 * - A scene exports `cameraAt(t, ctx)` in LOCAL space too; the rig adds the world offset.
 *   cameraAt(0) MUST equal the previous stage's cameraAt(1) unless the previous stage has `cutAtEnd`.
 * - A scene exports `lights: LightPreset` (LOCAL positions) — the constant-topology light rig
 *   interpolates presets between stages; there are NO lights inside scenes (except emissive meshes).
 * - Scenes never touch the camera, never create an EffectComposer, never subscribe to React state in useFrame.
 *   Use `useStageFrame` (zero work outside ±1 stage) and `useInRange` (mount <Html> only when near).
 * - All materials/geometry are created in useMemo at mount (no lazy creation on first visibility);
 *   call `useSceneReady(stage.id)` once heavy memos are done.
 * - No transmission / clearcoat / refraction materials. Instancing for anything repeated.
 */
export interface SceneProps {
  stage: StageDef
}
export interface SceneModule {
  default: ComponentType<SceneProps>
  cameraAt: CameraFn
  lights: LightPreset
}
