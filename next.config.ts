import type { NextConfig } from 'next'
import path from 'node:path'

/**
 * STATIC_EXPORT=1 → `output: 'export'` (plain HTML/JS/CSS in `out/` for shared PHP/Apache hosting,
 * packaged by `npm run package:static`). Pages are emitted as `services/index.html` (trailingSlash) so
 * any web server serves them without rewrites; route comparisons go through `usePath()`. Response
 * headers are not supported in export mode — `deploy/htaccess` carries the same cache policy.
 */
const isStatic = process.env.STATIC_EXPORT === '1'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: { root: path.resolve(__dirname) },
  transpilePackages: ['three'],
  experimental: { optimizePackageImports: ['@react-three/drei'] },
  ...(isStatic
    ? { output: 'export', trailingSlash: true, images: { unoptimized: true } }
    : {
        headers: async () => [
          {
            source: '/(fonts|draco|basis|geo)/(.*)',
            headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
          },
        ],
      }),
}

export default nextConfig
