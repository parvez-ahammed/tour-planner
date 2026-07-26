import { useEffect, useMemo, useRef, useState } from 'react'
import type { Route, TripState } from '@/types'
import {
  ROUTE_COLORS,
  cheapestRouteId,
  fmt,
  newDeparture,
  newLeg,
  newRoute,
  routeTotals,
  uid,
} from '@/lib/trip'
import type { Departure } from '@/types'
import RoutePanel from '@/components/RoutePanel'
import Summary from '@/components/Summary'
import TripGraph from '@/components/TripGraph'
import { Button } from '@/components/ui/button'
import { RotateCcw, X, ClipboardPaste, PanelLeftOpen, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildAiPrompt, planToJson, parsePlan, planFromHash, shareUrl } from '@/lib/io'

const STORAGE_KEY = 'tour-planner.v3'

function seed(): TripState {
  // one departure per leg
  const leg = (to: string, mode: any, time: string, fare: number, stay: number, nights: number) => {
    const l = newLeg(to)
    const d = l.departures[0]
    d.mode = mode
    d.time = time
    d.fare = fare
    l.stay = stay
    l.nights = nights
    return l
  }
  const dep = (mode: any, time: string, fare: number): Departure => {
    const d = newDeparture(mode)
    d.time = time
    d.fare = fare
    return d
  }

  const a: Route = {
    ...newRoute('Return via Prague', ROUTE_COLORS[0]),
    notes: 'Evening Prague→Oslo flight is cheaper — pick it under the return leg.',
    legs: [
      leg('Krakow', 'plane', '08:15', 90, 120, 3),
      leg('Slovakia', 'bus', '12:00', 25, 80, 2),
      leg('Prague', 'train', '09:30', 30, 140, 3),
    ],
    // two ways home from Prague: pricey morning vs cheap evening — evening picked
    returnDepartures: (() => {
      const morning = dep('plane', '08:00', 150)
      const evening = dep('plane', '20:45', 90)
      return [evening, morning]
    })(),
    returnPick: '', // set below
  }
  a.returnPick = a.returnDepartures[0].id // evening

  const b: Route = {
    ...newRoute('Return via Vienna', ROUTE_COLORS[1]),
    legs: [
      leg('Krakow', 'plane', '08:15', 90, 120, 3),
      leg('Slovakia', 'bus', '12:00', 25, 80, 2),
      leg('Prague', 'train', '09:30', 30, 140, 3),
      leg('Vienna', 'train', '14:00', 20, 130, 2),
    ],
    returnDepartures: [dep('plane', '20:10', 95)],
    returnPick: '',
  }
  b.returnPick = b.returnDepartures[0].id

  return {
    home: 'Oslo',
    currency: '€',
    travelers: 1,
    startDate: '2026-08-03',
    routes: [a, b],
    activeId: a.id,
  }
}

// Backfill fields added in later versions so older saved plans don't break —
// including converting the old single mode/time/fare per leg into a departures[].
function normalize(s: any): TripState {
  const depsFrom = (src: any, fallbackMode: string): { departures: Departure[]; pick: string } => {
    if (Array.isArray(src?.departures) && src.departures.length) {
      const departures = src.departures.map((d: any) => ({
        id: d.id ?? uid('dep'),
        mode: d.mode ?? fallbackMode,
        time: d.time ?? '',
        fare: d.fare ?? 0,
      }))
      const pick = departures.some((d: Departure) => d.id === src.pick) ? src.pick : departures[0].id
      return { departures, pick }
    }
    const d: Departure = {
      id: uid('dep'),
      mode: src?.mode ?? fallbackMode,
      time: src?.time ?? '',
      fare: src?.fare ?? 0,
    }
    return { departures: [d], pick: d.id }
  }

  return {
    home: s.home ?? 'Home',
    currency: s.currency ?? '€',
    travelers: s.travelers ?? 1,
    startDate: s.startDate ?? '',
    activeId: s.activeId ?? s.routes?.[0]?.id ?? '',
    routes: (s.routes ?? []).map((r: any) => {
      const ret =
        Array.isArray(r.returnDepartures) && r.returnDepartures.length
          ? depsFrom({ departures: r.returnDepartures, pick: r.returnPick }, 'plane')
          : depsFrom(
              { mode: r.returnMode, time: r.returnTime, fare: r.returnFare },
              'plane',
            )
      return {
        id: r.id,
        name: r.name ?? 'Option',
        color: r.color ?? ROUTE_COLORS[0],
        notes: r.notes ?? '',
        returnDepartures: ret.departures,
        returnPick: ret.pick,
        legs: (r.legs ?? []).map((l: any) => {
          const { departures, pick } = depsFrom(l, 'train')
          return {
            id: l.id ?? uid('leg'),
            to: l.to ?? '',
            stay: l.stay ?? 0,
            nights: l.nights ?? 0,
            departures,
            pick,
          }
        }),
      }
    }),
  }
}

function load(): TripState {
  // a shared link wins — open someone else's plan directly
  const shared = planFromHash(location.hash)
  if (shared) return shared
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const s = JSON.parse(raw)
      if (s && Array.isArray(s.routes) && s.routes.length) return normalize(s)
    }
  } catch {
    /* corrupt — fall through to seed */
  }
  return seed()
}

export default function App() {
  const [state, setState] = useState<TripState>(load)
  const [copied, setCopied] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [sidebarW, setSidebarW] = useState(520)
  const [collapsed, setCollapsed] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const dragging = useRef(false)

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current) return
      setSidebarW(Math.min(760, Math.max(360, e.clientX)))
    }
    const up = () => {
      dragging.current = false
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* storage blocked — non-fatal */
    }
  }, [state])

  const travelers = state.travelers || 1
  const cheapestId = useMemo(
    () => cheapestRouteId(state.routes, travelers),
    [state.routes, travelers],
  )
  // headline numbers for the Compare button
  const { cheapestTotal, savings } = useMemo(() => {
    const totals = state.routes.map((r) => routeTotals(r, travelers).total).sort((a, b) => a - b)
    return {
      cheapestTotal: totals[0] ?? 0,
      savings: totals.length > 1 ? totals[totals.length - 1] - totals[0] : 0,
    }
  }, [state.routes, travelers])

  const patch = (p: Partial<TripState>) => setState((s) => ({ ...s, ...p }))
  const patchRoute = (id: string, p: Partial<Route>) =>
    setState((s) => ({ ...s, routes: s.routes.map((r) => (r.id === id ? { ...r, ...p } : r)) }))

  const addRoute = () =>
    setState((s) => {
      const color = ROUTE_COLORS[s.routes.length % ROUTE_COLORS.length]
      const r = newRoute(`Option ${s.routes.length + 1}`, color)
      return { ...s, routes: [...s.routes, r], activeId: r.id }
    })

  const deleteRoute = (id: string) =>
    setState((s) => {
      const routes = s.routes.filter((r) => r.id !== id)
      return { ...s, routes, activeId: s.activeId === id ? routes[0]?.id ?? '' : s.activeId }
    })

  const duplicateRoute = (id: string) =>
    setState((s) => {
      const idx = s.routes.findIndex((r) => r.id === id)
      if (idx < 0) return s
      const src = s.routes[idx]
      const clone: Route = {
        ...src,
        id: uid('route'),
        name: `${src.name} (copy)`,
        color: ROUTE_COLORS[s.routes.length % ROUTE_COLORS.length],
        legs: src.legs.map((l) => ({ ...l, id: uid('leg') })),
      }
      const routes = [...s.routes.slice(0, idx + 1), clone, ...s.routes.slice(idx + 1)]
      return { ...s, routes, activeId: clone.id }
    })

  const reset = () => {
    if (confirm('Reset to the Oslo sample trip? Current routes will be lost.')) setState(seed())
  }

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {
        /* clipboard unavailable — user can still select manually */
      }
      ta.remove()
    }
    setCopied(key)
    window.setTimeout(() => setCopied(null), 1500)
  }

  const shareLink = () => copy(shareUrl(state), 'share')

  const selectDeparture = (routeId: string, legRef: string, depId: string) =>
    setState((s) => ({
      ...s,
      routes: s.routes.map((r) => {
        if (r.id !== routeId) return r
        if (legRef === 'return') return { ...r, returnPick: depId }
        return { ...r, legs: r.legs.map((l) => (l.id === legRef ? { ...l, pick: depId } : l)) }
      }),
    }))

  const doImport = () => {
    const r = parsePlan(importText)
    if (r.ok) {
      setState(r.state)
      setImportOpen(false)
      setImportText('')
      setImportError(null)
    } else {
      setImportError(r.error)
    }
  }

  return (
    <>
    <div
      className="relative grid h-screen grid-cols-[var(--sb)_minmax(0,1fr)] max-[1080px]:h-auto max-[1080px]:grid-cols-1"
      style={{ ['--sb' as string]: collapsed ? '0px' : `${sidebarW}px` }}
    >
      {/* keep column 1 occupied when collapsed so the graph/summary don't shift left */}
      {collapsed && <div aria-hidden className="overflow-hidden" />}
      {!collapsed && (
        <RoutePanel
        onCollapse={() => setCollapsed(true)}
        home={state.home}
        currency={state.currency}
        travelers={travelers}
        startDate={state.startDate}
        routes={state.routes}
        activeId={state.activeId}
        cheapestId={cheapestId}
        onHome={(v) => patch({ home: v })}
        onCurrency={(v) => patch({ currency: v || '€' })}
        onTravelers={(n) => patch({ travelers: Math.max(1, Math.min(99, n || 1)) })}
        onStartDate={(v) => patch({ startDate: v })}
        onActivate={(id) => patch({ activeId: id })}
        onAddRoute={addRoute}
        onDeleteRoute={deleteRoute}
        onDuplicateRoute={duplicateRoute}
        onRenameRoute={(id, name) => patchRoute(id, { name })}
        onPatchRoute={patchRoute}
        onCopyPrompt={() => copy(buildAiPrompt(state), 'prompt')}
        onCopyJson={() => copy(planToJson(state), 'json')}
        onShareLink={shareLink}
        onOpenImport={() => {
          setImportError(null)
          setImportText('')
          setImportOpen(true)
        }}
        copied={copied}
        />
      )}

      {/* drag handle to resize the sidebar (desktop only) */}
      {!collapsed && (
        <div
          onMouseDown={() => {
            dragging.current = true
            document.body.style.userSelect = 'none'
          }}
          title="Drag to resize"
          className="absolute top-0 z-30 hidden h-screen w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-primary/30 min-[1081px]:block"
          style={{ left: sidebarW }}
        />
      )}

      {/* reopen button when collapsed */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="absolute left-3 top-3 z-40 flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium shadow-md hover:bg-accent"
        >
          <PanelLeftOpen className="h-4 w-4" /> Routes
        </button>
      )}

      <main className="flex flex-col gap-2 bg-background p-4 max-[1080px]:h-[70vh]">
        <div className={cn('flex flex-wrap items-center gap-2', collapsed && 'pl-24')}>
          <span className="mr-1 text-xs font-medium text-muted-foreground">Routes:</span>
          {state.routes.map((r) => {
            const active = r.id === state.activeId
            return (
              <button
                key={r.id}
                onClick={() => patch({ activeId: r.id })}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'bg-card text-foreground'
                    : 'border-border bg-transparent text-muted-foreground hover:bg-card',
                )}
                style={active ? { borderColor: r.color } : undefined}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                {r.name}
              </button>
            )
          })}
          <Button size="sm" className="ml-auto" onClick={() => setCompareOpen(true)}>
            <BarChart3 className="h-3.5 w-3.5" /> Compare costs
            <span className="tnum ml-1 rounded bg-primary-foreground/20 px-1.5 py-0.5 text-[11px] font-semibold">
              {savings > 0 ? `save ${fmt(savings, state.currency)}` : fmt(cheapestTotal, state.currency)}
            </span>
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" /> sample
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <TripGraph state={state} onSelectDeparture={selectDeparture} />
        </div>
        <p className="text-center text-[11px] text-muted-foreground">
          One map, all routes. Selected route is bold; others dimmed. Solid = outbound, dashed =
          return. Drag any city to rearrange · scroll to zoom.
        </p>
      </main>
    </div>

    {compareOpen && (
      <div
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/40 p-4 sm:p-8"
        onClick={() => setCompareOpen(false)}
      >
        <div
          className="my-auto w-full max-w-xl overflow-hidden rounded-xl border border-border bg-card shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h3 className="font-display text-base font-semibold">Cost comparison</h3>
            <button
              className="rounded p-1 text-muted-foreground hover:bg-muted"
              onClick={() => setCompareOpen(false)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[80vh] overflow-y-auto p-5">
            <Summary
              home={state.home}
              currency={state.currency}
              travelers={travelers}
              startDate={state.startDate}
              routes={state.routes}
              activeId={state.activeId}
              cheapestId={cheapestId}
              onActivate={(id) => patch({ activeId: id })}
              bare
            />
          </div>
        </div>
      </div>
    )}

    {importOpen && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
        onClick={() => setImportOpen(false)}
      >
        <div
          className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-1 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold">Paste your plan JSON</h3>
            <button
              className="rounded p-1 text-muted-foreground hover:bg-muted"
              onClick={() => setImportOpen(false)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Paste the JSON your AI returned. It replaces the current routes — colors, layout and
            the graph are rebuilt automatically.
          </p>
          <textarea
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value)
              setImportError(null)
            }}
            placeholder='{ "home": "Oslo", "currency": "€", "routes": [ ... ] }'
            spellCheck={false}
            className="tnum h-56 w-full resize-none rounded-md border border-input bg-background p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
          />
          {importError && (
            <p className="mt-2 text-xs font-medium text-destructive">{importError}</p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={doImport} disabled={!importText.trim()}>
              <ClipboardPaste className="h-3.5 w-3.5" /> Load plan
            </Button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
