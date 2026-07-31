export type ModeId = 'plane' | 'train' | 'bus' | 'car' | 'ferry' | 'walk'

// One way to travel a hop: a mode at a time for a fare. A leg can hold several
// (e.g. morning vs evening flight, same Prague→Oslo) and you pick one.
export interface Departure {
  id: string
  mode: ModeId
  time: string // 24h "HH:MM", '' if unset
  fare: number
}

export interface Leg {
  id: string
  to: string
  stay: number
  nights: number
  departures: Departure[]
  pick: string // id of the chosen departure
}

export interface Route {
  id: string
  name: string
  color: string
  legs: Leg[]
  returnDepartures: Departure[]
  returnPick: string
  notes: string
}

export interface TripState {
  home: string
  currency: string
  travelers: number
  startDate: string // ISO "YYYY-MM-DD", '' if unset
  routes: Route[]
  activeId: string
}

export interface Totals {
  transport: number
  stay: number
  total: number
}
