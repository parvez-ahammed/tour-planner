import type { Edge, Node } from '@xyflow/react'
import type { TripState } from '@/types'
import { cityKey, modeMeta, routeHops, fmt } from './trip'

export interface CityNodeData {
  label: string
  isHome: boolean
  [key: string]: unknown
}

export interface OffsetEdgeData {
  color: string
  offset: number
  // centered slot ordinal among edges sharing this city pair (…-1, 0, +1…);
  // the label uses it to fan its pill apart from its twins, orientation-aware.
  labelOrd: number
  label: string
  isReturn: boolean
  dim: boolean
  active: boolean
  routeName: string
  // a ghost is an unpicked alternative departure on the active route; click to pick it
  ghost?: boolean
  routeId?: string
  legRef?: string // leg id, or 'return'
  departureId?: string
  [key: string]: unknown
}

export type PosMap = Record<string, { x: number; y: number }>

/** Unique cities across all routes, home first. */
export function collectCities(state: TripState) {
  const seen = new Map<string, { key: string; label: string; isHome: boolean }>()
  const homeKey = cityKey(state.home)
  seen.set(homeKey, { key: homeKey, label: state.home || 'Home', isHome: true })
  for (const route of state.routes) {
    for (const leg of route.legs) {
      const k = cityKey(leg.to)
      if (k === '?') continue
      if (!seen.has(k)) seen.set(k, { key: k, label: leg.to.trim(), isHome: false })
    }
  }
  return [...seen.values()]
}

/** Circular layout: home centered, other cities on a ring around it. */
export function layout(cities: ReturnType<typeof collectCities>, existing: PosMap): PosMap {
  const out: PosMap = { ...existing }
  const others = cities.filter((c) => !c.isHome)
  const R = 230
  const cx = 0
  const cy = 0
  cities.forEach((c) => {
    if (out[c.key]) return // preserve dragged position
    if (c.isHome) {
      out[c.key] = { x: cx, y: cy }
    } else {
      const i = others.indexOf(c)
      const a = (-90 + (360 / Math.max(others.length, 1)) * i) * (Math.PI / 180)
      out[c.key] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }
    }
  })
  // drop stale keys not in current city set
  const live = new Set(cities.map((c) => c.key))
  for (const k of Object.keys(out)) if (!live.has(k)) delete out[k]
  return out
}

export function buildNodes(state: TripState, pos: PosMap): Node<CityNodeData>[] {
  return collectCities(state).map((c) => ({
    id: c.key,
    type: 'city',
    position: pos[c.key] ?? { x: 0, y: 0 },
    data: { label: c.label, isHome: c.isHome },
  }))
}

const GAP = 26
const SHARED_COLOR = '#94a3b8' // slate — an edge several routes travel identically

interface MergedEdge {
  key: string
  fromKey: string
  toKey: string
  pairKey: string
  label: string
  isReturn: boolean
  routes: Set<string>
}

interface PreEdge {
  id: string
  fromKey: string
  toKey: string
  pairKey: string
  data: OffsetEdgeData
}

export function buildEdges(state: TripState): Edge<OffsetEdgeData>[] {
  const colorOf = new Map(state.routes.map((r) => [r.id, r.color]))
  const activeColor = colorOf.get(state.activeId)
  const multiRoute = state.routes.length > 1

  // --- picked edges: merge hops identical in from,to,mode,time,fare across routes ---
  const merged = new Map<string, MergedEdge>()
  for (const route of state.routes) {
    for (const hop of routeHops(state.home, route)) {
      const fromKey = cityKey(hop.from)
      const toKey = cityKey(hop.to)
      if (fromKey === '?' || toKey === '?' || fromKey === toKey) continue
      const key = `${fromKey}|${toKey}|${hop.mode}|${hop.time}|${hop.fare}`
      const existing = merged.get(key)
      if (existing) {
        existing.routes.add(route.id)
        existing.isReturn = existing.isReturn && hop.isReturn
      } else {
        const time = hop.time ? `${hop.time} ` : ''
        // walking is free — show just the icon (and time), no price
        const price = hop.mode === 'walk' ? '' : ` ${fmt(hop.fare, state.currency)}`
        merged.set(key, {
          key,
          fromKey,
          toKey,
          pairKey: [fromKey, toKey].sort().join('~'),
          label: `${time}${modeMeta(hop.mode).icon}${price}`,
          isReturn: hop.isReturn,
          routes: new Set([route.id]),
        })
      }
    }
  }

  const pre: PreEdge[] = [...merged.values()].map((m) => {
    const active = m.routes.has(state.activeId)
    const shared = m.routes.size > 1
    const color = shared
      ? active && activeColor
        ? activeColor
        : SHARED_COLOR
      : colorOf.get([...m.routes][0]) ?? SHARED_COLOR
    return {
      id: m.key,
      fromKey: m.fromKey,
      toKey: m.toKey,
      pairKey: m.pairKey,
      data: {
        color,
        offset: 0,
        labelOrd: 0,
        label: m.label,
        isReturn: m.isReturn,
        active,
        dim: multiRoute && !active,
        routeName: shared ? 'shared' : '',
      },
    }
  })

  // Only the PICKED departure per hop is drawn — unselected time options stay in
  // the sidebar so the map shows exactly what the total is computed from.

  // --- fan every edge sharing a city pair so they don't overlap ---
  const pairCount = new Map<string, number>()
  for (const e of pre) pairCount.set(e.pairKey, (pairCount.get(e.pairKey) ?? 0) + 1)
  const slotSeen = new Map<string, number>()

  return pre.map((e) => {
    const total = pairCount.get(e.pairKey) ?? 1
    const slot = slotSeen.get(e.pairKey) ?? 0
    slotSeen.set(e.pairKey, slot + 1)
    const center = slot - (total - 1) / 2
    e.data.offset = center * GAP
    e.data.labelOrd = center
    return { id: e.id, source: e.fromKey, target: e.toKey, type: 'offset', data: e.data }
  })
}
