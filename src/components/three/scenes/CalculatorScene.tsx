'use client'
// STUB — replaced by the scene workflow
import { useSceneReady } from '@/hooks/useStage'
import type { SceneProps } from './types'
export { cameraAt, lights } from './CalculatorScene.camera'
export default function CalculatorScene({ stage }: SceneProps) {
  useSceneReady(stage.id)
  return <group name="CalculatorScene" />
}
