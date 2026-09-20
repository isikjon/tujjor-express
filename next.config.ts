import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: { root: path.resolve(__dirname) },
  transpilePackages: ['three'],
  experimental: { optimizePackageImports: ['@react-three/drei'] },
  headers: async () => [
    {
      source: '/(fonts|draco|basis|geo)/(.*)',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    },
  ],
}

export default nextConfig
