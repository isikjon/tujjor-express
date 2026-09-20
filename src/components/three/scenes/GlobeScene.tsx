'use client'
// STUB — replaced by the scene workflow
import { useSceneReady } from '@/hooks/useStage'
import type { SceneProps } from './types'
export { cameraAt, lights } from './GlobeScene.camera'
export default function GlobeScene({ stage }: SceneProps) {
  useSceneReady(stage.id)
  return <group name="GlobeScene" />
}
