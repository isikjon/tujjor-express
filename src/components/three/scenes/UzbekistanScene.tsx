'use client'
// STUB — replaced by the scene workflow
import { useSceneReady } from '@/hooks/useStage'
import type { SceneProps } from './types'
export { cameraAt, lights } from './UzbekistanScene.camera'
export default function UzbekistanScene({ stage }: SceneProps) {
  useSceneReady(stage.id)
  return <group name="UzbekistanScene" />
}
