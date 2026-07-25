export type ModeId = 'plane' | 'train' | 'bus' | 'car' | 'ferry'

export interface Leg {
  id: string
  to: string
  mode: ModeId
  time: string // 24h departure "HH:MM", '' if unset
  fare: number
  stay: number
  nights: number
}

export interface Route {
  id: string
  name: string
  color: string
  legs: Leg[]
  returnMode: ModeId
  returnTime: string
  returnFare: number
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
