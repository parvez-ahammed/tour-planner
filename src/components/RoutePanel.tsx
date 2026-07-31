import { useState } from 'react'
import {
  Trash2,
  Plus,
  X,
  Sparkles,
  ClipboardPaste,
  Check,
  Copy,
  CopyPlus,
  PanelLeftClose,
  Link2,
  GripVertical,
  Circle,
  CircleDot,
  ChevronDown,
} from 'lucide-react'
import type { Leg, ModeId, Route } from '@/types'
import {
  MODES,
  cheapestDepId,
  fmt,
  modeMeta,
  newDeparture,
  newLeg,
  picked,
  routeTotals,
} from '@/lib/trip'
import type { Departure } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface Props {
  home: string
  currency: string
  travelers: number
  startDate: string
  routes: Route[]
  activeId: string
  cheapestId: string | null
  onHome: (v: string) => void
  onCurrency: (v: string) => void
  onTravelers: (n: number) => void
  onStartDate: (v: string) => void
  onActivate: (id: string) => void
  onAddRoute: () => void
  onDeleteRoute: (id: string) => void
  onDuplicateRoute: (id: string) => void
  onRenameRoute: (id: string, name: string) => void
  onPatchRoute: (id: string, patch: Partial<Route>) => void
  onCopyPrompt: () => void
  onCopyJson: () => void
  onOpenImport: () => void
  onShareLink: () => void
  onCollapse: () => void
  copied: string | null
}

export default function RoutePanel(p: Props) {
  const [aiOpen, setAiOpen] = useState(false)
  return (
    <aside className="flex h-full flex-col gap-4 overflow-y-auto overflow-x-hidden border-r border-border bg-card px-4 py-5">
      <header className="flex items-center gap-2.5">
        <span className="text-xl text-primary">◆</span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg font-semibold leading-tight">Tour Planner</h1>
          <p className="truncate text-xs text-muted-foreground">Compare loop routes by cost</p>
        </div>
        <button
          onClick={p.onCollapse}
          title="Hide sidebar"
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </header>

      <div className="flex flex-wrap gap-2">
        <div className="flex min-w-[120px] flex-1 flex-col gap-1.5">
          <Label>Home (start = end)</Label>
          <Input value={p.home} onChange={(e) => p.onHome(e.target.value)} placeholder="Oslo" />
        </div>
        <div className="flex w-12 shrink-0 flex-col gap-1.5">
          <Label>Cur.</Label>
          <Input
            value={p.currency}
            onChange={(e) => p.onCurrency(e.target.value.slice(0, 3))}
            placeholder="€"
          />
        </div>
        <div className="flex w-[86px] shrink-0 flex-col gap-1.5">
          <Label>Travelers</Label>
          <div className="flex h-9 items-center rounded-md border border-input bg-card">
            <button
              className="h-full px-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => p.onTravelers(p.travelers - 1)}
              aria-label="Fewer travelers"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              value={p.travelers}
              onChange={(e) => p.onTravelers(parseInt(e.target.value, 10))}
              className="tnum w-full min-w-0 bg-transparent text-center text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <button
              className="h-full px-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => p.onTravelers(p.travelers + 1)}
              aria-label="More travelers"
            >
              +
            </button>
          </div>
        </div>
        <div className="flex w-[140px] shrink-0 flex-col gap-1.5">
          <Label>Start date</Label>
          <Input
            type="date"
            value={p.startDate}
            onChange={(e) => p.onStartDate(e.target.value)}
            className="[&::-webkit-calendar-picker-indicator]:opacity-60"
          />
        </div>
      </div>

      {/* AI-assisted flow — collapsed by default to save space */}
      <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5">
        <button
          onClick={() => setAiOpen((o) => !o)}
          className="flex w-full items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-primary"
        >
          <Sparkles className="h-3.5 w-3.5" /> Plan with your own AI
          <ChevronDown
            className={cn('ml-auto h-4 w-4 transition-transform', aiOpen && 'rotate-180')}
          />
        </button>
        {aiOpen && (
          <div className="px-2.5 pb-2.5">
            <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
              Copy the prompt, paste it into ChatGPT / Claude / Gemini, then paste the JSON it
              returns back here to visualize &amp; tweak.
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                onClick={p.onCopyPrompt}
                className="flex-1"
                title={
                  'Copies a ready-made prompt — the schema plus your current draft. Give it to any AI ' +
                  '(ChatGPT / Claude / Gemini) and it fills in realistic fares, times & costs and returns ' +
                  'your travel plan formatted to this exact schema. Then use “Paste plan” to load it back. ' +
                  'Prefer to do it yourself? Skip the AI and just paste your own plan JSON.'
                }
              >
                {p.copied === 'prompt' ? <Check className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                {p.copied === 'prompt' ? 'Copied!' : 'Copy AI prompt'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={p.onOpenImport}
                className="flex-1"
                title="Paste plan JSON (what the AI returned, or your own) to load and visualize it here."
              >
                <ClipboardPaste className="h-3.5 w-3.5" /> Paste plan
              </Button>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={p.onCopyJson}
                className="flex-1"
                title="Copy your current plan as JSON — hand it to an AI to tweak, keep as a backup, or share as text."
              >
                {p.copied === 'json' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {p.copied === 'json' ? 'Copied!' : 'Copy current plan'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={p.onShareLink}
                className="flex-1"
                title="Copy a link with the whole plan encoded in the URL — send it to a travel buddy."
              >
                {p.copied === 'share' ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Link copied
                  </>
                ) : (
                  <>
                    <Link2 className="h-3.5 w-3.5" /> Copy share link
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Route options
        </h2>
        <Button variant="outline" size="sm" onClick={p.onAddRoute}>
          <Plus className="h-3.5 w-3.5" /> Route
        </Button>
      </div>

      <div className="flex flex-col gap-2.5">
        {p.routes.map((route) => (
          <RouteCard
            key={route.id}
            route={route}
            home={p.home}
            currency={p.currency}
            travelers={p.travelers}
            open={route.id === p.activeId}
            cheapest={route.id === p.cheapestId}
            canDelete={p.routes.length > 1}
            onActivate={() => p.onActivate(route.id)}
            onRename={(name) => p.onRenameRoute(route.id, name)}
            onPatch={(patch) => p.onPatchRoute(route.id, patch)}
            onDelete={() => p.onDeleteRoute(route.id)}
            onDuplicate={() => p.onDuplicateRoute(route.id)}
          />
        ))}
      </div>

      <p className="mt-auto flex items-center gap-1.5 pt-2 text-[11px] text-muted-foreground">
        <Check className="h-3.5 w-3.5 text-success" /> Auto-saved in this browser — reopen anytime
        to continue.
      </p>
    </aside>
  )
}

function RouteCard({
  route,
  home,
  currency,
  travelers,
  open,
  cheapest,
  canDelete,
  onActivate,
  onRename,
  onPatch,
  onDelete,
  onDuplicate,
}: {
  route: Route
  home: string
  currency: string
  travelers: number
  open: boolean
  cheapest: boolean
  canDelete: boolean
  onActivate: () => void
  onRename: (name: string) => void
  onPatch: (patch: Partial<Route>) => void
  onDelete: () => void
  onDuplicate: () => void
}) {
  const totals = routeTotals(route, travelers)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const setLeg = (id: string, patch: Partial<Leg>) =>
    onPatch({ legs: route.legs.map((l) => (l.id === id ? { ...l, ...patch } : l)) })
  const prevOf = (idx: number) => (idx === 0 ? home : route.legs[idx - 1].to.trim() || '?')
  const moveLeg = (from: number, to: number) => {
    if (from === to || to < 0 || to >= route.legs.length) return
    const legs = [...route.legs]
    const [m] = legs.splice(from, 1)
    legs.splice(to, 0, m)
    onPatch({ legs })
  }

  // per-leg departure editing
  const patchLeg = (legId: string, fn: (l: Leg) => Leg) =>
    onPatch({ legs: route.legs.map((l) => (l.id === legId ? fn(l) : l)) })
  const setDep = (legId: string, depId: string, patch: Partial<Departure>) =>
    patchLeg(legId, (l) => ({
      ...l,
      departures: l.departures.map((d) => (d.id === depId ? { ...d, ...patch } : d)),
    }))
  const addDep = (legId: string) =>
    patchLeg(legId, (l) => ({
      ...l,
      departures: [...l.departures, newDeparture(picked(l.departures, l.pick).mode)],
    }))
  const removeDep = (legId: string, depId: string) =>
    patchLeg(legId, (l) => {
      if (l.departures.length <= 1) return l
      const departures = l.departures.filter((d) => d.id !== depId)
      return { ...l, departures, pick: l.pick === depId ? departures[0].id : l.pick }
    })
  const setPick = (legId: string, depId: string) =>
    patchLeg(legId, (l) => ({ ...l, pick: depId }))

  // return-leg departure editing
  const setRDep = (depId: string, patch: Partial<Departure>) =>
    onPatch({
      returnDepartures: route.returnDepartures.map((d) =>
        d.id === depId ? { ...d, ...patch } : d,
      ),
    })
  const addRDep = () =>
    onPatch({
      returnDepartures: [
        ...route.returnDepartures,
        newDeparture(picked(route.returnDepartures, route.returnPick).mode),
      ],
    })
  const removeRDep = (depId: string) => {
    if (route.returnDepartures.length <= 1) return
    const rd = route.returnDepartures.filter((d) => d.id !== depId)
    onPatch({
      returnDepartures: rd,
      returnPick: route.returnPick === depId ? rd[0].id : route.returnPick,
    })
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border bg-card transition-shadow',
        open ? 'shadow-md' : 'shadow-sm',
      )}
      style={open ? { borderColor: route.color } : undefined}
    >
      <button
        onClick={onActivate}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <span
          className="h-3 w-3 shrink-0 rounded-sm"
          style={{ background: route.color }}
        />
        <input
          value={route.name}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onRename(e.target.value)}
          className="min-w-0 flex-1 truncate rounded bg-transparent px-1 py-0.5 text-sm font-semibold hover:bg-muted focus:bg-muted focus:outline-none"
        />
        <span className="tnum flex shrink-0 items-center gap-1.5 font-display text-sm font-semibold">
          {fmt(totals.total, currency)}
          {cheapest && (
            <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-success">
              best
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="border-t border-border/60 px-3 pb-3 pt-2">
          <p className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Stops · drag to reorder · pick a departure per hop
          </p>

          {route.legs.map((leg, idx) => (
            <div
              key={leg.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIdx !== null) moveLeg(dragIdx, idx)
                setDragIdx(null)
              }}
              className={cn(
                'border-b border-dashed border-border py-2',
                dragIdx === idx && 'opacity-40',
              )}
            >
              {/* stop row: where you go + stay. Wraps the stay/nights group below
                  the city on narrow screens so the city field never gets crushed. */}
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
                <span
                  draggable
                  onDragStart={() => setDragIdx(idx)}
                  onDragEnd={() => setDragIdx(null)}
                  title="Drag to reorder"
                  className="flex w-4 shrink-0 cursor-grab justify-center text-muted-foreground active:cursor-grabbing"
                >
                  <GripVertical className="h-4 w-4" />
                </span>
                <span className="w-9 shrink-0 truncate text-right text-[11px] text-muted-foreground">
                  {prevOf(idx)} →
                </span>
                <Input
                  value={leg.to}
                  placeholder="City"
                  onChange={(e) => setLeg(leg.id, { to: e.target.value })}
                  className="h-8 min-w-[104px] flex-1 text-sm"
                />
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 text-xs" title="Accommodation cost">
                    🛏
                  </span>
                  <InlineMoney
                    className="w-[56px] shrink-0"
                    title="Accommodation / stay"
                    value={leg.stay}
                    currency={currency}
                    onChange={(v) => setLeg(leg.id, { stay: v })}
                  />
                  <span className="shrink-0 text-xs" title="Nights here">
                    🌙
                  </span>
                  <InlineMoney
                    className="w-[40px] shrink-0"
                    title="Nights here"
                    value={leg.nights}
                    currency=""
                    onChange={(v) => setLeg(leg.id, { nights: Math.max(0, Math.round(v)) })}
                  />
                  {route.legs.length > 1 ? (
                    <button
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Remove stop"
                      onClick={() => onPatch({ legs: route.legs.filter((l) => l.id !== leg.id) })}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : (
                    <span className="w-5 shrink-0" />
                  )}
                </div>
              </div>

              {/* departure options for this hop */}
              <DepartureList
                departures={leg.departures}
                pick={leg.pick}
                currency={currency}
                onSet={(depId, patch) => setDep(leg.id, depId, patch)}
                onAdd={() => addDep(leg.id)}
                onRemove={(depId) => removeDep(leg.id, depId)}
                onPick={(depId) => setPick(leg.id, depId)}
              />
            </div>
          ))}

          <Button
            variant="dashed"
            size="sm"
            className="mt-2 w-full"
            onClick={() => onPatch({ legs: [...route.legs, newLeg()] })}
          >
            <Plus className="h-3.5 w-3.5" /> Add stop
          </Button>

          {/* return home — may have several departures too */}
          <div className="mt-2 border-t border-dashed border-border pt-2.5">
            <div className="flex items-center gap-1.5">
              <span className="w-4 shrink-0" />
              <span className="w-9 shrink-0 truncate text-right text-[11px] text-muted-foreground">
                {route.legs[route.legs.length - 1]?.to.trim() || '?'} →
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {home} <span className="font-normal text-muted-foreground">(return)</span>
              </span>
            </div>
            <DepartureList
              departures={route.returnDepartures}
              pick={route.returnPick}
              currency={currency}
              onSet={setRDep}
              onAdd={addRDep}
              onRemove={removeRDep}
              onPick={(depId) => onPatch({ returnPick: depId })}
            />
          </div>

          {/* notes */}
          <textarea
            value={route.notes}
            onChange={(e) => onPatch({ notes: e.target.value })}
            placeholder="Notes — booking tips, links, reminders…"
            rows={2}
            className="mt-2.5 w-full resize-none rounded-md border border-input bg-card p-2 text-xs outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          />

          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={onDuplicate}>
              <CopyPlus className="h-3.5 w-3.5" /> Duplicate
            </Button>
            {canDelete && (
              <Button variant="destructive" size="sm" className="flex-1" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DepartureList({
  departures,
  pick,
  currency,
  onSet,
  onAdd,
  onRemove,
  onPick,
}: {
  departures: Departure[]
  pick: string
  currency: string
  onSet: (depId: string, patch: Partial<Departure>) => void
  onAdd: () => void
  onRemove: (depId: string) => void
  onPick: (depId: string) => void
}) {
  const cheap = cheapestDepId(departures)
  const many = departures.length > 1
  return (
    <div className="ml-6 mt-1.5 flex flex-col gap-1">
      {departures.map((d) => (
        <div key={d.id} className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => onPick(d.id)}
            title={pick === d.id ? 'Chosen' : 'Use this departure'}
            className="shrink-0"
          >
            {pick === d.id ? (
              <CircleDot className="h-4 w-4 text-primary" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            )}
          </button>
          <ModeSelect
            className="w-12 shrink-0"
            value={d.mode}
            // walking has no fare — zero it so a stale price can't linger in the total
            onChange={(mode) => onSet(d.id, mode === 'walk' ? { mode, fare: 0 } : { mode })}
          />
          <TimeInput
            className="w-[58px] shrink-0"
            value={d.time}
            onChange={(time) => onSet(d.id, { time })}
          />
          {d.mode === 'walk' ? (
            <span
              className="flex h-8 w-[64px] shrink-0 items-center justify-center rounded-md border border-dashed border-input text-[11px] italic text-muted-foreground"
              title="Walking is free — no fare"
            >
              free
            </span>
          ) : (
            <InlineMoney
              className="w-[64px] shrink-0"
              title="Fare"
              value={d.fare}
              currency={currency}
              onChange={(v) => onSet(d.id, { fare: v })}
            />
          )}
          {many && d.id === cheap && (
            <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-success">
              cheapest
            </span>
          )}
          {many && (
            <button
              onClick={() => onRemove(d.id)}
              title="Remove this option"
              className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      <button
        onClick={onAdd}
        className="w-fit pl-6 text-[11px] font-medium text-primary hover:underline"
      >
        + add time / option
      </button>
    </div>
  )
}

function ModeSelect({
  value,
  onChange,
  className,
}: {
  value: ModeId
  onChange: (v: ModeId) => void
  className?: string
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ModeId)}>
      <SelectTrigger
        className={cn('h-8 justify-center px-1.5', className)}
        aria-label={`Transport: ${modeMeta(value).label}`}
        title={modeMeta(value).label}
      >
        <span className="text-base leading-none">{modeMeta(value).icon}</span>
        <span className="sr-only">{modeMeta(value).label}</span>
      </SelectTrigger>
      <SelectContent>
        {MODES.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.icon} {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// 24-hour HH:MM masked text input (native type=time follows browser locale and can
// show AM/PM — this always stays 24h). Auto-inserts the colon as you type.
function TimeInput({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  const handle = (raw: string) => {
    let d = raw.replace(/\D/g, '').slice(0, 4)
    if (d.length >= 3) d = d.slice(0, 2) + ':' + d.slice(2)
    onChange(d)
  }
  return (
    <input
      inputMode="numeric"
      value={value}
      placeholder="HH:MM"
      title="Departure time (24-hour)"
      maxLength={5}
      onChange={(e) => handle(e.target.value)}
      className={cn(
        'tnum h-8 rounded-md border border-input bg-card px-1 text-center text-xs outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring',
        className,
      )}
    />
  )
}

function InlineMoney({
  value,
  currency,
  onChange,
  className,
  title,
}: {
  value: number
  currency: string
  onChange: (v: number) => void
  className?: string
  title?: string
}) {
  return (
    <div
      title={title}
      className={cn(
        'flex h-8 items-center rounded-md border border-input bg-card pl-1.5 focus-within:ring-2 focus-within:ring-ring',
        className,
      )}
    >
      <span className="text-[10px] text-muted-foreground">{currency}</span>
      <input
        type="number"
        min={0}
        value={value === 0 ? '' : value}
        placeholder="0"
        onChange={(e) => onChange(e.target.value === '' ? 0 : parseFloat(e.target.value))}
        className="tnum w-full min-w-0 bg-transparent px-1 text-xs outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </div>
  )
}
