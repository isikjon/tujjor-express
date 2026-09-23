// Builds the static export for shared PHP/Apache hosting and zips it.
//   npm run package:static            → dist/tujjor-express-static-YYYY-MM-DD.zip
//   npm run package:static -- --no-zip
// Steps: move src/app/api aside (Node route handlers cannot be exported; deploy/api/track.php
// replaces them) → STATIC_EXPORT=1 next build → out/ + deploy files → verify → zip.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execSync, spawnSync } from 'node:child_process'

const root = process.cwd()
const API_SRC = join(root, 'src/app/api')
const API_TMP = join(root, '.static-export-tmp/api')
const OUT = join(root, 'out')
const noZip = process.argv.includes('--no-zip')

const restore = () => {
  if (existsSync(API_TMP)) {
    if (existsSync(API_SRC)) rmSync(API_SRC, { recursive: true })
    renameSync(API_TMP, API_SRC)
    rmSync(join(root, '.static-export-tmp'), { recursive: true, force: true })
  }
}
// a crashed earlier run may have left the API folder aside
restore()
process.on('exit', restore)
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(130))

mkdirSync(join(root, '.static-export-tmp'), { recursive: true })
renameSync(API_SRC, API_TMP)
// stale dev-server type stubs still reference the API route
rmSync(join(root, '.next/dev/types'), { recursive: true, force: true })
rmSync(OUT, { recursive: true, force: true })

const build = spawnSync('npx', ['next', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, STATIC_EXPORT: '1', NEXT_PUBLIC_PERF_HUD: '' },
})
restore()
if (build.status !== 0) process.exit(build.status ?? 1)

// deploy files: .htaccess (root, geo, api/data) + PHP tracking endpoint + example data
cpSync(join(root, 'deploy/htaccess'), join(OUT, '.htaccess'))
cpSync(join(root, 'deploy/geo.htaccess'), join(OUT, 'geo/.htaccess'))
mkdirSync(join(OUT, 'api/data'), { recursive: true })
cpSync(join(root, 'deploy/api/track.php'), join(OUT, 'api/track.php'))
cpSync(join(root, 'deploy/api/data/htaccess'), join(OUT, 'api/data/.htaccess'))
cpSync(join(root, 'deploy/api/data/tracking.example.json'), join(OUT, 'api/data/tracking.example.json'))
cpSync(join(root, 'deploy/README-HOSTING.txt'), join(OUT, 'README-HOSTING.txt'))
rmSync(join(OUT, 'basis/README.md'), { force: true })

// verify
const must = ['index.html', '404.html', 'services/index.html', 'business/index.html', 'tracking/index.html', 'contacts/index.html', '.htaccess', 'api/track.php', 'sitemap.xml', 'robots.txt', 'manifest.webmanifest', 'geo/central-asia-50m.json', 'draco/draco_decoder.wasm', 'basis/basis_transcoder.wasm']
const missing = must.filter((f) => !existsSync(join(OUT, f)))
if (missing.length) {
  console.error('Missing in out/: ' + missing.join(', '))
  process.exit(1)
}
const html = readFileSync(join(OUT, 'index.html'), 'utf8')
if (html.includes('perf-hud') || /data-perf-hud/.test(html)) console.warn('warning: perf HUD markup found in index.html')

const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p] })
const files = walk(OUT)
const bytes = files.reduce((s, f) => s + statSync(f).size, 0)
console.log(`\nout/: ${files.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB`)

if (noZip) process.exit(0)
mkdirSync(join(root, 'dist'), { recursive: true })
const stamp = new Date().toISOString().slice(0, 10)
const zip = join(root, 'dist', `tujjor-express-static-${stamp}.zip`)
rmSync(zip, { force: true })
execSync(`cd "${OUT}" && zip -qr -X "${zip}" . -x '.DS_Store' -x '*/.DS_Store'`, { stdio: 'inherit' })
console.log(`zip: ${zip} (${(statSync(zip).size / 1024 / 1024).toFixed(1)} MB)`)
