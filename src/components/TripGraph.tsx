import { useEffect, useMemo, useRef } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { TripState } from '@/types'
import {
  buildEdges,
  buildNodes,
  collectCities,
  layout,
  type CityNodeData,
  type OffsetEdgeData,
  type PosMap,
} from '@/lib/graph'
import { cn } from '@/lib/utils'

/* ---------- custom node: a city pill ---------- */
function CityNode({ data }: NodeProps<Node<CityNodeData>>) {
  return (
    <div
      className={cn(
        'rounded-full px-4 py-2 text-sm font-semibold shadow-sm border select-none',
        data.isHome
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-card text-foreground border-border',
      )}
    >
      {data.isHome && <span className="mr-1 opacity-80">★</span>}
      {data.label}
      {data.isHome && (
        <span className="ml-1.5 text-[10px] font-medium opacity-80">start · end</span>
      )}
      <Handle
        type="source"
        position={Position.Top}
        className="!opacity-0 !left-1/2 !top-1/2"
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Top}
        className="!opacity-0 !left-1/2 !top-1/2"
        isConnectable={false}
      />
    </div>
  )
}

/* ---------- custom edge: fanned, colored, labeled ---------- */
function OffsetEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps<Edge<OffsetEdgeData>>) {
  const d = data as OffsetEdgeData
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const cx = (sourceX + targetX) / 2 + nx * d.offset
  const cy = (sourceY + targetY) / 2 + ny * d.offset
  const path = `M ${sourceX},${sourceY} Q ${cx},${cy} ${targetX},${targetY}`
  const opacity = d.ghost ? 0.5 : d.dim ? 0.2 : 1

  // Direction arrowhead placed along the curve (t≈0.62), pointing toward target.
  // Mid-edge so it stays clear of both nodes and reads even when edges are dimmed.
  const t = 0.62
  const ax = (1 - t) * (1 - t) * sourceX + 2 * (1 - t) * t * cx + t * t * targetX
  const ay = (1 - t) * (1 - t) * sourceY + 2 * (1 - t) * t * cy + t * t * targetY
  const tanx = 2 * (1 - t) * (cx - sourceX) + 2 * t * (targetX - cx)
  const tany = 2 * (1 - t) * (cy - sourceY) + 2 * t * (targetY - cy)
  const ang = (Math.atan2(tany, tanx) * 180) / Math.PI

  return (
    <>
      {/* fat invisible hit area so ghost alternatives are easy to click */}
      {d.ghost && (
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={18}
          style={{ cursor: 'pointer' }}
        />
      )}
      <path
        d={path}
        fill="none"
        stroke={d.color}
        strokeWidth={d.active ? 3 : d.ghost ? 1.5 : 2}
        strokeDasharray={d.ghost ? '3 4' : d.isReturn ? '7 5' : undefined}
        style={{ opacity, cursor: d.ghost ? 'pointer' : undefined }}
      />
      <path
        d="M -6,-5 L 6,0 L -6,5 Z"
        transform={`translate(${ax},${ay}) rotate(${ang})`}
        fill={d.color}
        style={{ opacity }}
      />
      <foreignObject
        x={cx - 62}
        y={cy - 16}
        width={124}
        height={32}
        style={{ opacity, overflow: 'visible', pointerEvents: 'none' }}
      >
        <div
          className={
            'tnum mx-auto w-fit rounded-md border px-1.5 py-0.5 text-[11px] font-semibold shadow-sm ' +
            (d.ghost ? 'border-dashed bg-card/90' : 'bg-card')
          }
          style={{ borderColor: d.color }}
        >
          {d.label}
          {d.ghost && <span className="ml-1 opacity-60">tap to pick</span>}
        </div>
      </foreignObject>
    </>
  )
}

const nodeTypes = { city: CityNode }
const edgeTypes = { offset: OffsetEdge }

interface GraphProps {
  state: TripState
  onSelectDeparture: (routeId: string, legRef: string, departureId: string) => void
}

function Flow({ state, onSelectDeparture }: GraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CityNodeData>>([])
  const posRef = useRef<PosMap>({})
  const wrapRef = useRef<HTMLDivElement>(null)
  const { fitView } = useReactFlow()

  // Refit when the canvas itself resizes (sidebar collapse/resize, window resize).
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => fitView({ padding: 0.28, duration: 200 }))
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [fitView])

  // Signature of the city set + labels + home — rebuild nodes only when it changes,
  // preserving any positions the user dragged.
  const signature = useMemo(
    () => collectCities(state).map((c) => `${c.key}:${c.label}`).join('|'),
    [state],
  )

  useEffect(() => {
    setNodes((prev) => {
      const dragged: PosMap = {}
      prev.forEach((n) => (dragged[n.id] = n.position))
      const cities = collectCities(state)
      const merged = layout(cities, { ...posRef.current, ...dragged })
      posRef.current = merged
      return buildNodes(state, merged)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  // Refit whenever the set of cities changes. Delay lets React Flow measure node
  // sizes first, otherwise it fits to zero-sized nodes and mis-frames.
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.28, duration: 300 }), 180)
    return () => clearTimeout(t)
  }, [signature, nodes.length, fitView])

  const edges = useMemo(() => buildEdges(state), [state])

  return (
    <div ref={wrapRef} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgeClick={(_e, edge) => {
          const gd = edge.data as OffsetEdgeData | undefined
          if (gd?.ghost && gd.routeId && gd.legRef && gd.departureId)
            onSelectDeparture(gd.routeId, gd.legRef, gd.departureId)
        }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
        fitViewOptions={{ padding: 0.28 }}
        onInit={(inst) => inst.fitView({ padding: 0.28 })}
        minZoom={0.3}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#d3dae2" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

export default function TripGraph({ state, onSelectDeparture }: GraphProps) {
  return (
    <ReactFlowProvider>
      <Flow state={state} onSelectDeparture={onSelectDeparture} />
    </ReactFlowProvider>
  )
}
