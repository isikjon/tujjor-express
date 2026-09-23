import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'scripts/**']),
  {
    // React Three Fiber code mutates three.js objects (refs, memoised vectors, uniforms) inside useFrame
    // by design — the React Compiler purity rules do not apply to the render loop.
    files: ['src/components/three/**/*.{ts,tsx}', 'src/hooks/useStage.ts', 'src/hooks/useLenis.tsx'],
    rules: {
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
    },
  },
])

export default eslintConfig
