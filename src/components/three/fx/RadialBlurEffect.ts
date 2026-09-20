'use client'
import { Effect, BlendFunction } from 'postprocessing'
import { Uniform, Vector2 } from 'three'

const fragment = /* glsl */ `
uniform float uStrength;
uniform vec2 uCenter;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (uStrength <= 0.0005) { outputColor = inputColor; return; }
  vec2 dir = uv - uCenter;
  vec4 sum = inputColor;
  const int N = 8;
  for (int i = 1; i <= N; i++) {
    float k = float(i) / float(N);
    sum += texture2D(inputBuffer, uv - dir * uStrength * k);
  }
  outputColor = sum / float(N + 1);
}`

/** Zoom/radial blur used only inside the speed tunnel; strength follows |scroll velocity|. */
export class RadialBlurEffect extends Effect {
  constructor() {
    super('RadialBlurEffect', fragment, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ['uStrength', new Uniform(0)],
        ['uCenter', new Uniform(new Vector2(0.5, 0.5))],
      ]),
    })
  }
  set strength(v: number) {
    this.uniforms.get('uStrength')!.value = v
  }
  get strength(): number {
    return this.uniforms.get('uStrength')!.value as number
  }
}
