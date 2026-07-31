import type { Departure, ModeId, Route, TripState } from '@/types'
import { MODES, ROUTE_COLORS, newDeparture, newLeg, newRoute, num, picked } from '@/lib/trip'

const MODE_IDS = MODES.map((m) => m.id)
const asMode = (v: unknown): ModeId =>
  MODE_IDS.includes(v as ModeId) ? (v as ModeId) : 'train'
const asTime = (v: unknown): string =>
  typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v.trim()) ? v.trim() : ''

interface DepExport {
  mode: ModeId
  time: string
  fare: number
}

/** Portable plan shape — no internal ids/colors. What the AI reads and writes.
 *  The chosen departure is at mode/time/fare; extra time options go in `alternatives`. */
export interface PlanExport {
  home: string
  currency: string
  travelers: number
  startDate: string
  routes: {
    name: string
    notes: string
    legs: {
      to: string
      stay: number
      nights: number
      mode: ModeId
      time: string
      fare: number
      alternatives?: DepExport[]
    }[]
    returnMode: ModeId
    returnTime: string
    returnFare: number
    returnAlternatives?: DepExport[]
  }[]
}

const others = (departures: Departure[], pick: string): DepExport[] =>
  departures
    .filter((d) => d.id !== pick)
    .map((d) => ({ mode: d.mode, time: d.time, fare: num(d.fare) }))

/** The portable plan object (no ids/colors). Used both for the human-readable
 *  JSON and for the compact, minified form that goes in a share link. */
export function planToPlan(state: TripState): PlanExport {
  return {
    home: state.home,
    currency: state.currency,
    travelers: state.travelers || 1,
    startDate: state.startDate || '',
    routes: state.routes.map((r) => {
      const rd = picked(r.returnDepartures, r.returnPick)
      const rAlts = others(r.returnDepartures, r.returnPick)
      return {
        name: r.name,
        notes: r.notes || '',
        legs: r.legs.map((l) => {
          const pd = picked(l.departures, l.pick)
          const alts = others(l.departures, l.pick)
          return {
            to: l.to,
            stay: num(l.stay),
            nights: num(l.nights),
            mode: pd.mode,
            time: pd.time,
            fare: num(pd.fare),
            ...(alts.length ? { alternatives: alts } : {}),
          }
        }),
        returnMode: rd.mode,
        returnTime: rd.time,
        returnFare: num(rd.fare),
        ...(rAlts.length ? { returnAlternatives: rAlts } : {}),
      }
    }),
  }
}

/** Pretty JSON for humans — the "Copy current plan" / AI-prompt draft. */
export function planToJson(state: TripState): string {
  return JSON.stringify(planToPlan(state), null, 2)
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
          "stay": 0,
          "nights": 0,
          "mode": "one of: plane | train | bus | car | ferry | walk",
          "time": "departure time, 24-hour HH:MM (e.g. 08:15); use \\"\\" if unknown",
          "fare": 0,
          "alternatives": [
            { "mode": "plane|train|bus|car|ferry|walk", "time": "HH:MM", "fare": 0 }
          ]
        }
      ],
      "returnMode": "plane | train | bus | car | ferry | walk",
      "returnTime": "HH:MM",
      "returnFare": 0,
      "returnAlternatives": [
        { "mode": "plane|train|bus|car|ferry|walk", "time": "HH:MM", "fare": 0 }
      ]
    }
  ]
}

Rules:
- The trip always returns to "home" after the last leg — that final hop is returnMode/returnTime/returnFare.
- "time" matters: the same hop at a different departure time can have a different fare. Put the option I'd probably take at mode/time/fare, and list OTHER times for the same hop in "alternatives" (or "returnAlternatives" for the trip home). Omit them if there's only one option.
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

  // chosen (mode/time/fare) + optional alternatives[] → a departures[] with a pick
  const toDepartures = (chosen: any, alts: any): { departures: Departure[]; pick: string } => {
    const mk = (mode: any, time: any, fare: any): Departure => {
      const d = newDeparture(asMode(mode))
      d.time = asTime(time)
      d.fare = num(fare)
      return d
    }
    const first = mk(chosen?.mode, chosen?.time, chosen?.fare)
    const rest = (Array.isArray(alts) ? alts : []).map((a: any) => mk(a?.mode, a?.time, a?.fare))
    return { departures: [first, ...rest], pick: first.id }
  }

  const routes: Route[] = p.routes.map((r, i) => {
    const base = newRoute(
      typeof r?.name === 'string' && r.name.trim() ? r.name : `Option ${i + 1}`,
      ROUTE_COLORS[i % ROUTE_COLORS.length],
    )
    const legsSrc = Array.isArray(r?.legs) ? r.legs : []
    const legs = (legsSrc.length ? legsSrc : [{}]).map((l: any) => {
      const { departures, pick } = toDepartures(l, l?.alternatives)
      return {
        ...newLeg(typeof l?.to === 'string' ? l.to : ''),
        stay: num(l?.stay),
        nights: Math.max(0, Math.round(num(l?.nights))),
        departures,
        pick,
      }
    })
    const ret = toDepartures(
      { mode: (r as any)?.returnMode, time: (r as any)?.returnTime, fare: (r as any)?.returnFare },
      (r as any)?.returnAlternatives,
    )
    return {
      ...base,
      notes: typeof r?.notes === 'string' ? r.notes : '',
      legs,
      returnDepartures: ret.departures,
      returnPick: ret.pick,
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

/** Base64url (unicode-safe) of the MINIFIED plan JSON, for a shareable #p=... link.
 *  Two things keep it short: no pretty-print whitespace, and url-safe base64 so the
 *  param needs no percent-encoding (every +, / or = would otherwise become 3 chars). */
export function encodePlanParam(state: TripState): string {
  const json = JSON.stringify(planToPlan(state)) // compact — no indentation
  const b64 = btoa(unescape(encodeURIComponent(json)))
  const urlSafe = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return 'p=' + urlSafe
}

export function shareUrl(state: TripState): string {
  const base = `${location.origin}${location.pathname}`
  return `${base}#${encodePlanParam(state)}`
}

/** Parse a plan out of a location.hash like "#p=..." — returns null if absent/invalid.
 *  Accepts both the new base64url form AND legacy links (percent-encoded standard
 *  base64 of the pretty JSON), so old shared URLs keep working. */
export function planFromHash(hash: string): TripState | null {
  try {
    const m = /[#&]?p=([^&]+)/.exec(hash || '')
    if (!m) return null
    // legacy links were percent-encoded — harmless no-op on the new url-safe form
    let s = decodeURIComponent(m[1])
    // url-safe → standard base64, then restore any stripped padding
    s = s.replace(/-/g, '+').replace(/_/g, '/')
    while (s.length % 4) s += '='
    const json = decodeURIComponent(escape(atob(s)))
    const r = parsePlan(json)
    return r.ok ? r.state : null
  } catch {
    return null
  }
}
