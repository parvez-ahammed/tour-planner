import type { Departure, Leg, ModeId, Route, Totals } from '@/types'

export const MODES: { id: ModeId; label: string; icon: string }[] = [
  { id: 'plane', label: 'Plane', icon: '✈' },
  { id: 'train', label: 'Train', icon: '🚆' },
  { id: 'bus', label: 'Bus', icon: '🚌' },
  { id: 'car', label: 'Car', icon: '🚗' },
  { id: 'ferry', label: 'Ferry', icon: '⛴' },
  { id: 'walk', label: 'Walk', icon: '🚶' },
]

export const modeMeta = (id: ModeId) => MODES.find((m) => m.id === id) ?? MODES[0]

export const ROUTE_COLORS = ['#3b6ff5', '#7c3aed', '#0d9488', '#c2410c', '#be185d', '#0891b2']

let counter = 0
export const uid = (p = 'id') => `${p}_${(counter++).toString(36)}_${Math.floor(performance.now())}`

export const newDeparture = (mode: ModeId = 'train'): Departure => ({
  id: uid('dep'),
  mode,
  time: '',
  fare: 0,
})

export const newLeg = (to = ''): Leg => {
  const d = newDeparture('train')
  return { id: uid('leg'), to, stay: 0, nights: 0, departures: [d], pick: d.id }
}

export const newRoute = (name: string, color: string): Route => {
  const rd = newDeparture('plane')
  return {
    id: uid('route'),
    name,
    color,
    legs: [newLeg()],
    returnDepartures: [rd],
    returnPick: rd.id,
    notes: '',
  }
}

/** The chosen departure (falls back to the first, or a train stub if somehow empty). */
export const picked = (departures: Departure[], pick: string): Departure =>
  departures.find((d) => d.id === pick) ?? departures[0] ?? newDeparture()

/** Id of the lowest-fare departure — used to badge "cheapest". */
export const cheapestDepId = (departures: Departure[]): string =>
  departures.length
    ? departures.reduce((a, b) => (num(b.fare) < num(a.fare) ? b : a)).id
    : ''

export const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : 0
}

/** City labels in order, home first (index 0). */
export const routeCities = (home: string, route: Route): string[] => [
  home,
  ...route.legs.map((l) => l.to.trim() || '?'),
]

export interface Hop {
  from: string
  to: string
  mode: ModeId
  time: string
  fare: number
  isReturn: boolean
}

export const routeHops = (home: string, route: Route): Hop[] => {
  const cities = routeCities(home, route)
  const hops: Hop[] = []
  for (let i = 0; i < route.legs.length; i++) {
    const d = picked(route.legs[i].departures, route.legs[i].pick)
    hops.push({
      from: cities[i],
      to: cities[i + 1],
      mode: d.mode,
      time: d.time,
      fare: num(d.fare),
      isReturn: false,
    })
  }
  const rd = picked(route.returnDepartures, route.returnPick)
  hops.push({
    from: cities[cities.length - 1],
    to: home,
    mode: rd.mode,
    time: rd.time,
    fare: num(rd.fare),
    isReturn: true,
  })
  return hops
}

export const routeTotals = (route: Route, travelers = 1): Totals => {
  const t = Math.max(1, travelers || 1)
  const legFares = route.legs.reduce(
    (s, l) => s + num(picked(l.departures, l.pick).fare),
    0,
  )
  const returnFare = num(picked(route.returnDepartures, route.returnPick).fare)
  const transport = (legFares + returnFare) * t
  const stay = route.legs.reduce((s, l) => s + num(l.stay), 0)
  return { transport, stay, total: transport + stay }
}

export const cheapestRouteId = (routes: Route[], travelers = 1): string | null =>
  routes.length
    ? routes.reduce((best, r) =>
        routeTotals(r, travelers).total < routeTotals(best, travelers).total ? r : best,
      ).id
    : null

export const fmt = (n: number, currency = '€'): string => {
  const v = Math.round(num(n) * 100) / 100
  const s = Number.isInteger(v) ? String(v) : v.toFixed(2)
  return `${currency}${s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

/** Normalized key so "Oslo" and "oslo " share one graph node. */
export const cityKey = (name: string) => name.trim().toLowerCase() || '?'

export const routeNights = (route: Route): number =>
  route.legs.reduce((s, l) => s + num(l.nights), 0)

/** startDate + days → Date, or null if startDate unset/invalid. */
export const addDays = (iso: string, days: number): Date | null => {
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() + days)
  return d
}

export const fmtDate = (d: Date | null): string =>
  d ? d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : ''

/**
 * Arrival date at each stop and the return date, given a home departure date.
 * arrival[i] = start + nights spent at all earlier stops; return = start + all nights.
 */
export const routeSchedule = (route: Route, startDate: string) => {
  const arrivals: (Date | null)[] = []
  let acc = 0
  for (let i = 0; i < route.legs.length; i++) {
    arrivals.push(addDays(startDate, acc))
    acc += num(route.legs[i].nights)
  }
  return { arrivals, returnDate: addDays(startDate, acc), totalNights: acc }
}
