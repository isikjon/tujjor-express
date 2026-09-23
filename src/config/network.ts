/**
 * Stage 09 — NETWORK (docs §09). Node graph shared by the 3D scene and the DOM list (NetworkCopy),
 * so keyboard focus / tap on a <button> and pointer hover on a mesh drive the same ids.
 * Positions are LOCAL to world D (studio x = 0). Pure data — no three / React imports.
 */
export const NETWORK_NODE_IDS = ['1688', 'Taobao', 'Alibaba', 'Pinduoduo', 'JD', 'Poizon', 'chinaWarehouse', 'uzbekistan', 'chirchiq', 'business', 'customer'] as const
export type NetworkNodeId = (typeof NETWORK_NODE_IDS)[number]

export interface NetworkNodeDef {
  id: NetworkNodeId
  /** Latin display label (troika Text — ASCII only) */
  label: string
  /** small technical caption under the disc (ASCII + ·) */
  sub: string
  position: [number, number, number]
  /** disc radius */
  r: number
  /** unfold start (local t); the scale-pop lasts POP_DUR */
  pop: number
  kind: 'market' | 'hub' | 'end'
}

/** Marketplace arc: 6 nodes on a circle of R=4.4 centred at x=−2.6, bulging left to x≈−7, z ±4.1. */
const ARC_R = 4.4
const ARC_CX = -2.6
const marketY = [1.3, 1.9, 2.4, 2.2, 1.6, 1.2]
const marketLabels: NetworkNodeId[] = ['1688', 'Taobao', 'Alibaba', 'Pinduoduo', 'JD', 'Poizon']
const markets: NetworkNodeDef[] = marketLabels.map((id, i) => {
  const a = (-70 + (140 * i) / 5) * (Math.PI / 180)
  return {
    id,
    label: id,
    sub: 'MARKETPLACE',
    position: [Math.round((ARC_CX - ARC_R * Math.cos(a)) * 100) / 100, marketY[i], Math.round(ARC_R * Math.sin(a) * 100) / 100],
    r: 0.46,
    pop: 0.06 + i * 0.025,
    kind: 'market',
  }
})

export const NETWORK_NODES: NetworkNodeDef[] = [
  ...markets,
  { id: 'chinaWarehouse', label: 'China warehouse', sub: 'CONSOLIDATION', position: [4, 1.4, 0], r: 0.55, pop: 0.12, kind: 'hub' },
  { id: 'uzbekistan', label: 'Uzbekistan', sub: 'CUSTOMS · ROUTE', position: [7.5, 1.6, 0], r: 0.55, pop: 0.16, kind: 'hub' },
  { id: 'chirchiq', label: 'Chirchiq', sub: 'PICKUP POINT', position: [10.5, 1.4, 0], r: 0.55, pop: 0.2, kind: 'hub' },
  { id: 'business', label: 'Business', sub: 'B2B', position: [13.5, 1.8, -2], r: 0.5, pop: 0.24, kind: 'end' },
  { id: 'customer', label: 'Customer', sub: 'B2C', position: [13.5, 1.2, 2], r: 0.5, pop: 0.25, kind: 'end' },
]
export const NETWORK_NODE_BY_ID = Object.fromEntries(NETWORK_NODES.map((n) => [n.id, n])) as Record<NetworkNodeId, NetworkNodeDef>

/** Duration (local t) of one node's scale-pop. */
export const POP_DUR = 0.09

/** Centre hub: the studio box + rotating ring. */
export const CENTER_POS: [number, number, number] = [0, 0.6, 0]
export const CENTER_RING_R = 1.6

/** Links. 'center' is the ring edge facing the other endpoint. Order = draw direction (uHead builds from `from` to `to`). */
export interface NetworkLinkDef {
  from: NetworkNodeId | 'center'
  to: NetworkNodeId | 'center'
  /** build start (local t) */
  build: number
  /** main route chain gets a soft halo line */
  main?: boolean
}
export const NETWORK_LINKS: NetworkLinkDef[] = [
  ...marketLabels.map((id, i): NetworkLinkDef => ({ from: id, to: 'center', build: 0.1 + i * 0.025 })),
  { from: 'center', to: 'chinaWarehouse', build: 0.1, main: true },
  { from: 'chinaWarehouse', to: 'uzbekistan', build: 0.14, main: true },
  { from: 'uzbekistan', to: 'chirchiq', build: 0.18, main: true },
  { from: 'chirchiq', to: 'business', build: 0.22, main: true },
  { from: 'chirchiq', to: 'customer', build: 0.23, main: true },
]
/** Links touching a node (indices into NETWORK_LINKS). */
export const NODE_LINKS: Record<NetworkNodeId, number[]> = Object.fromEntries(
  NETWORK_NODE_IDS.map((id) => [id, NETWORK_LINKS.map((l, i) => (l.from === id || l.to === id ? i : -1)).filter((i) => i >= 0)]),
) as Record<NetworkNodeId, number[]>
