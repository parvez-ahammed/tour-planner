import type { Route } from '@/types'
import { fmt, fmtDate, num, routeCities, routeSchedule, routeTotals } from '@/lib/trip'
import { cn } from '@/lib/utils'

interface Props {
  home: string
  currency: string
  travelers: number
  startDate: string
  routes: Route[]
  activeId: string
  cheapestId: string | null
  onActivate: (id: string) => void
}

export default function Summary({
  home,
  currency,
  travelers,
  startDate,
  routes,
  activeId,
  cheapestId,
  onActivate,
}: Props) {
  const rows = routes
    .map((r) => ({ route: r, totals: routeTotals(r, travelers) }))
    .sort((a, b) => a.totals.total - b.totals.total)
  const cheapest = rows.find((r) => r.route.id === cheapestId)
  const dearest = rows[rows.length - 1]
  const maxTotal = Math.max(...rows.map((r) => r.totals.total), 1)
  const spread = cheapest && dearest ? dearest.totals.total - cheapest.totals.total : 0

  return (
    <aside className="flex h-full flex-col gap-4 overflow-y-auto overflow-x-hidden border-l border-border bg-card px-4 py-5">
      <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Cost comparison
      </h2>
      {travelers > 1 && (
        <p className="-mt-2 text-[11px] text-muted-foreground">
          Transport fares × <strong className="text-foreground">{travelers}</strong> travelers ·
          accommodation as entered
        </p>
      )}

      {spread > 0 && cheapest && dearest && (
        <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3">
          <div className="tnum font-display text-2xl font-bold text-success">
            {fmt(spread, currency)}
          </div>
          <p className="text-xs leading-snug text-success/90">
            saved by <strong>{cheapest.route.name}</strong> vs {dearest.route.name}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {rows.map(({ route, totals }) => {
          const best = route.id === cheapestId
          return (
            <button
              key={route.id}
              onClick={() => onActivate(route.id)}
              className={cn(
                'rounded-lg border bg-card p-3 text-left transition-shadow hover:shadow-md',
                route.id === activeId && 'shadow-md',
                best && 'border-success/40 bg-success/5',
              )}
              style={route.id === activeId ? { borderColor: route.color } : undefined}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ background: route.color }}
                  />
                  {route.name}
                  {best && (
                    <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-success">
                      cheapest
                    </span>
                  )}
                </span>
                <span className="tnum font-display text-base font-bold">
                  {fmt(totals.total, currency)}
                </span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                <span
                  style={{
                    width: `${(totals.transport / maxTotal) * 100}%`,
                    background: route.color,
                  }}
                />
                <span
                  style={{
                    width: `${(totals.stay / maxTotal) * 100}%`,
                    background: `color-mix(in srgb, ${route.color} 34%, white)`,
                  }}
                />
              </div>
              <div className="tnum mt-1.5 flex justify-between text-[11px] text-muted-foreground">
                <span>✈ {fmt(totals.transport, currency)} transport</span>
                <span>🛏 {fmt(totals.stay, currency)} stay</span>
              </div>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-4">
        {rows.map(({ route, totals }) => {
          const sched = routeSchedule(route, startDate)
          return (
            <div key={route.id} className="border-t border-border/60 pt-3">
              <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: route.color }} />
                <strong>{route.name}</strong>
                <span className="tnum ml-auto text-[11px] font-medium text-muted-foreground">
                  {sched.totalNights} nights
                  {startDate && sched.returnDate && (
                    <>
                      {' · '}
                      {fmtDate(sched.arrivals[0])} – {fmtDate(sched.returnDate)}
                    </>
                  )}
                </span>
              </div>
              <p className="mb-2 pl-4 text-[11px] text-muted-foreground">
                {routeCities(home, route).join(' → ')} → {home}
              </p>
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {route.legs.map((leg, i) => (
                    <tr key={leg.id} className="border-b border-border/50">
                      <td className="py-1.5 text-muted-foreground">
                        {i === 0 ? home : route.legs[i - 1].to.trim() || '?'} →{' '}
                        {leg.to.trim() || '?'}
                        <span className="tnum ml-1 text-[10px] opacity-70">
                          {leg.time && `· ${leg.time}`}
                          {sched.arrivals[i] && ` · ${fmtDate(sched.arrivals[i])}`}
                          {num(leg.nights) > 0 && ` · ${num(leg.nights)}n`}
                        </span>
                      </td>
                      <td className="tnum py-1.5 text-right">{fmt(leg.fare, currency)}</td>
                      <td className="tnum py-1.5 text-right text-muted-foreground">
                        {num(leg.stay) > 0 ? `🛏 ${fmt(leg.stay, currency)}` : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-b border-border/50">
                    <td className="py-1.5 italic text-muted-foreground">
                      {route.legs[route.legs.length - 1]?.to.trim() || '?'} → {home}
                      <span className="tnum ml-1 text-[10px] opacity-70">
                        {route.returnTime && `· ${route.returnTime}`}
                        {sched.returnDate && ` · ${fmtDate(sched.returnDate)}`}
                      </span>
                    </td>
                    <td className="tnum py-1.5 text-right">{fmt(route.returnFare, currency)}</td>
                    <td className="py-1.5 text-right text-muted-foreground">—</td>
                  </tr>
                  <tr>
                    <td className="pt-2 font-display font-bold">Total</td>
                    <td className="tnum pt-2 text-right font-display font-bold" colSpan={2}>
                      {fmt(totals.total, currency)}
                    </td>
                  </tr>
                </tbody>
              </table>
              {route.notes.trim() && (
                <p className="mt-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground">
                  📝 {route.notes}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
