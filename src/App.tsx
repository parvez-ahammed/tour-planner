import { useEffect, useMemo, useRef, useState } from 'react'
import type { Route, TripState } from '@/types'
import { ROUTE_COLORS, cheapestRouteId, newLeg, newRoute, uid } from '@/lib/trip'
import RoutePanel from '@/components/RoutePanel'
import Summary from '@/components/Summary'
import TripGraph from '@/components/TripGraph'
import { Button } from '@/components/ui/button'
import { RotateCcw, X, ClipboardPaste, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildAiPrompt, planToJson, parsePlan, planFromHash, shareUrl } from '@/lib/io'

const STORAGE_KEY = 'tour-planner.v3'

function seed(): TripState {
  const a: Route = {
    ...newRoute('Return via Prague', ROUTE_COLORS[0]),
    notes: 'Book Krakow flight early — cheaper midweek.',
    legs: [
      { ...newLeg('Krakow'), mode: 'plane', time: '08:15', fare: 90, stay: 120, nights: 3 },
      { ...newLeg('Slovakia'), mode: 'bus', time: '12:00', fare: 25, stay: 80, nights: 2 },
      { ...newLeg('Prague'), mode: 'train', time: '09:30', fare: 30, stay: 140, nights: 3 },
    ],
    returnMode: 'plane',
    returnTime: '18:45',
    returnFare: 110,
  }
  const b: Route = {
    ...newRoute('Return via Vienna', ROUTE_COLORS[1]),
    legs: [
      { ...newLeg('Krakow'), mode: 'plane', time: '08:15', fare: 90, stay: 120, nights: 3 },
      { ...newLeg('Slovakia'), mode: 'bus', time: '12:00', fare: 25, stay: 80, nights: 2 },
      { ...newLeg('Prague'), mode: 'train', time: '09:30', fare: 30, stay: 140, nights: 3 },
      { ...newLeg('Vienna'), mode: 'train', time: '14:00', fare: 20, stay: 130, nights: 2 },
    ],
    returnMode: 'plane',
    returnTime: '20:10',
    returnFare: 95,
  }
  return {
    home: 'Oslo',
    currency: '€',
    travelers: 1,
    startDate: '2026-08-03',
    routes: [a, b],
    activeId: a.id,
  }
}

// Backfill fields added in later versions so older saved plans don't break.
function normalize(s: any): TripState {
  return {
    home: s.home ?? 'Home',
    currency: s.currency ?? '€',
    travelers: s.travelers ?? 1,
    startDate: s.startDate ?? '',
    activeId: s.activeId ?? s.routes?.[0]?.id ?? '',
    routes: (s.routes ?? []).map((r: any) => ({
      id: r.id,
      name: r.name ?? 'Option',
      color: r.color ?? ROUTE_COLORS[0],
      notes: r.notes ?? '',
      returnMode: r.returnMode ?? 'plane',
      returnTime: r.returnTime ?? '',
      returnFare: r.returnFare ?? 0,
      legs: (r.legs ?? []).map((l: any) => ({
        id: l.id,
        to: l.to ?? '',
        mode: l.mode ?? 'train',
        time: l.time ?? '',
        fare: l.fare ?? 0,
        stay: l.stay ?? 0,
        nights: l.nights ?? 0,
      })),
    })),
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
      className="relative grid h-screen grid-cols-[var(--sb)_minmax(0,1fr)_360px] max-[1080px]:h-auto max-[1080px]:grid-cols-1"
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
          <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" /> sample
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <TripGraph state={state} />
        </div>
        <p className="text-center text-[11px] text-muted-foreground">
          One map, all routes. Selected route is bold; others dimmed. Solid = outbound, dashed =
          return. Drag any city to rearrange · scroll to zoom.
        </p>
      </main>

      <Summary
        home={state.home}
        currency={state.currency}
        travelers={travelers}
        startDate={state.startDate}
        routes={state.routes}
        activeId={state.activeId}
        cheapestId={cheapestId}
        onActivate={(id) => patch({ activeId: id })}
      />
    </div>

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
