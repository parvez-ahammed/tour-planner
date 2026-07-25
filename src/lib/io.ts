import type { ModeId, Route, TripState } from '@/types'
import { MODES, ROUTE_COLORS, newLeg, newRoute, num } from '@/lib/trip'

const MODE_IDS = MODES.map((m) => m.id)
const asMode = (v: unknown): ModeId =>
  MODE_IDS.includes(v as ModeId) ? (v as ModeId) : 'train'
const asTime = (v: unknown): string =>
  typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v.trim()) ? v.trim() : ''

/** Portable plan shape — no internal ids/colors. What the AI reads and writes. */
export interface PlanExport {
  home: string
  currency: string
  travelers: number
  startDate: string
  routes: {
    name: string
    notes: string
    legs: { to: string; mode: ModeId; time: string; fare: number; stay: number; nights: number }[]
    returnMode: ModeId
    returnTime: string
    returnFare: number
  }[]
}

export function planToJson(state: TripState): string {
  const plan: PlanExport = {
    home: state.home,
    currency: state.currency,
    travelers: state.travelers || 1,
    startDate: state.startDate || '',
    routes: state.routes.map((r) => ({
      name: r.name,
      notes: r.notes || '',
      legs: r.legs.map((l) => ({
        to: l.to,
        mode: l.mode,
        time: l.time,
        fare: num(l.fare),
        stay: num(l.stay),
        nights: num(l.nights),
      })),
      returnMode: r.returnMode,
      returnTime: r.returnTime,
      returnFare: num(r.returnFare),
    })),
  }
  return JSON.stringify(plan, null, 2)
}

export function buildAiPrompt(state: TripState): string {
  return `I'm planning a multi-city loop trip — I start and end in the same city and visit places in between (a Traveling-Salesperson-style route). I want to compare a few route options by total cost.

Task: fill in realistic transport fares, departure times, and per-stop accommodation costs for the cities below — and/or add the extra route options I describe to you. All prices in ${state.currency || '€'}.

Return ONLY a JSON object (no prose, no markdown fences) matching EXACTLY this schema:

{
  "home": "string — the start = end city",
  "currency": "string",
  "travelers": 1,
  "startDate": "YYYY-MM-DD — date I leave home; use \\"\\" if unknown",
  "routes": [
    {
      "name": "string — a short label for this option",
      "notes": "string — any tips, booking advice, links; use \\"\\" if none",
      "legs": [
        {
          "to": "string — city you travel to",
          "mode": "one of: plane | train | bus | car | ferry",
          "time": "departure time, 24-hour HH:MM (e.g. 08:15); use \\"\\" if unknown",
          "fare": 0,
          "stay": 0,
          "nights": 0
        }
      ],
      "returnMode": "plane | train | bus | car | ferry",
      "returnTime": "HH:MM",
      "returnFare": 0
    }
  ]
}

Rules:
- The trip always returns to "home" after the last leg — that final hop is returnMode/returnTime/returnFare.
- "time" matters: the same leg at a different departure time can have a different fare, so vary them realistically.
- "fare" is the transport cost of that hop; "stay" is total accommodation cost at that stop; "nights" is how many nights I sleep there.
- Keep every route starting from "home" and returning to "home".

My current draft (improve it, keep the format):
${planToJson(state)}`
}

export type ParseResult =
  | { ok: true; state: TripState }
  | { ok: false; error: string }

export function parsePlan(text: string): ParseResult {
  let raw: unknown
  try {
    // tolerate accidental ```json fences
    const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    raw = JSON.parse(cleaned)
  } catch {
    return { ok: false, error: 'Not valid JSON. Paste the JSON object your AI returned.' }
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Expected a JSON object.' }
  const p = raw as Partial<PlanExport>
  if (!Array.isArray(p.routes) || p.routes.length === 0)
    return { ok: false, error: 'JSON has no "routes" array.' }

  const routes: Route[] = p.routes.map((r, i) => {
    const base = newRoute(
      typeof r?.name === 'string' && r.name.trim() ? r.name : `Option ${i + 1}`,
      ROUTE_COLORS[i % ROUTE_COLORS.length],
    )
    const legsSrc = Array.isArray(r?.legs) ? r.legs : []
    const legs = (legsSrc.length ? legsSrc : [{}]).map((l: any) => ({
      ...newLeg(typeof l?.to === 'string' ? l.to : ''),
      mode: asMode(l?.mode),
      time: asTime(l?.time),
      fare: num(l?.fare),
      stay: num(l?.stay),
      nights: Math.max(0, Math.round(num(l?.nights))),
    }))
    return {
      ...base,
      notes: typeof r?.notes === 'string' ? r.notes : '',
      legs,
      returnMode: asMode(r?.returnMode),
      returnTime: asTime(r?.returnTime),
      returnFare: num(r?.returnFare),
    }
  })

  const startDate =
    typeof (p as { startDate?: string }).startDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test((p as { startDate?: string }).startDate!.trim())
      ? (p as { startDate?: string }).startDate!.trim()
      : ''

  const state: TripState = {
    home: typeof p.home === 'string' && p.home.trim() ? p.home : 'Home',
    currency: typeof p.currency === 'string' && p.currency.trim() ? p.currency.slice(0, 3) : '€',
    travelers: Math.max(1, Math.min(99, num((p as { travelers?: number }).travelers) || 1)),
    startDate,
    routes,
    activeId: routes[0].id,
  }
  return { ok: true, state }
}

/** Base64 (unicode-safe) of the plan JSON, for a shareable #p=... link. */
export function encodePlanParam(state: TripState): string {
  const json = planToJson(state)
  return 'p=' + encodeURIComponent(btoa(unescape(encodeURIComponent(json))))
}

export function shareUrl(state: TripState): string {
  const base = `${location.origin}${location.pathname}`
  return `${base}#${encodePlanParam(state)}`
}

/** Parse a plan out of a location.hash like "#p=..." — returns null if absent/invalid. */
export function planFromHash(hash: string): TripState | null {
  try {
    const m = /[#&]?p=([^&]+)/.exec(hash || '')
    if (!m) return null
    const json = decodeURIComponent(escape(atob(decodeURIComponent(m[1]))))
    const r = parsePlan(json)
    return r.ok ? r.state : null
  } catch {
    return null
  }
}
