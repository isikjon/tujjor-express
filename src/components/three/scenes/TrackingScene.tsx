'use client'
// STUB — replaced by the scene workflow
import { useSceneReady } from '@/hooks/useStage'
import type { SceneProps } from './types'
export { cameraAt, lights } from './TrackingScene.camera'
export default function TrackingScene({ stage }: SceneProps) {
  useSceneReady(stage.id)
  return <group name="TrackingScene" />
}
