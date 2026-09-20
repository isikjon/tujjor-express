// Extracts Central Asia (UZ, KZ, KG, TJ, TM, AF) from world-atlas countries-50m into a small GeoJSON for world C.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { feature } = require('topojson-client')
const topo = JSON.parse(readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8'))
const fc = feature(topo, topo.objects.countries)
const KEEP = new Set(['860', '398', '417', '762', '795', '4', '004'])
const out = { type: 'FeatureCollection', features: fc.features.filter((f) => KEEP.has(String(f.id))).map((f) => ({ type: 'Feature', id: String(Number(f.id)), properties: { name: f.properties.name }, geometry: f.geometry })) }
// round coordinates to 3 decimals to keep the file small
const round = (c) => (Array.isArray(c[0]) ? c.map(round) : [Math.round(c[0] * 1000) / 1000, Math.round(c[1] * 1000) / 1000])
for (const f of out.features) f.geometry.coordinates = round(f.geometry.coordinates)
mkdirSync('public/geo', { recursive: true })
writeFileSync('public/geo/central-asia-50m.json', JSON.stringify(out))
console.log('wrote public/geo/central-asia-50m.json', JSON.stringify(out).length, 'bytes', out.features.map((f) => f.properties.name).join(', '))
