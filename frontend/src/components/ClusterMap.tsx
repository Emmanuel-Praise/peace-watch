import { useMemo, useState } from 'react'
import type { Cluster } from '../types'
import { MAP_BOUNDS, PRIORITY_COLORS, relativeTime, TYPE_LABELS } from '../lib/format'

const W = 640
const H = 420
const PAD = 42

interface Point {
  x: number
  y: number
}

export default function ClusterMap({
  clusters,
  selectedId,
  onSelect,
  height = 380,
}: {
  clusters: Cluster[]
  selectedId?: number | null
  onSelect?: (cluster: Cluster | null) => void
  height?: number
}) {
  const [hover, setHover] = useState<Cluster | null>(null)

  const points = useMemo(() => {
    const map = new Map<number, Point>()
    for (const c of clusters) {
      map.set(c.id, {
        x: PAD + ((c.center_lng - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng)) * (W - PAD * 2),
        y: H - PAD - ((c.center_lat - MAP_BOUNDS.minLat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) * (H - PAD * 2),
      })
    }
    return map
  }, [clusters])

  const gridLines = useMemo(() => {
    const xs: number[] = []
    const ys: number[] = []
    for (let i = PAD; i <= W - PAD; i += 74) xs.push(i)
    for (let i = PAD; i <= H - PAD; i += 60) ys.push(i)
    return { xs, ys }
  }, [])

  const tooltip = hover
    ? `X: ${hover.center_lng.toFixed(4)}  Y: ${hover.center_lat.toFixed(4)}`
    : null

  return (
    <div className="relative overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ height }}
        className="block w-full"
        role="img"
        aria-label="Incident cluster map"
      >
        <defs>
          <radialGradient id="glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={PRIORITY_COLORS.high.fill} stopOpacity="0.06" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width={W} height={H} fill="#ffffff" />
        <rect x="0" y="0" width={W} height={H} fill="url(#glow)" />
        <rect x={PAD - 12} y={PAD - 12} width={W - PAD * 2 + 24} height={H - PAD * 2 + 24} rx="14" fill="#fafaf9" stroke="#e7e5e4" />

        {gridLines.xs.map((x) => (
          <line key={`v${x}`} x1={x} y1={PAD - 12} x2={x} y2={H - PAD + 12} stroke="#e7e5e4" strokeDasharray="3 6" strokeWidth="1" />
        ))}
        {gridLines.ys.map((y) => (
          <line key={`h${y}`} x1={PAD - 12} y1={y} x2={W - PAD + 12} y2={y} stroke="#e7e5e4" strokeDasharray="3 6" strokeWidth="1" />
        ))}

        <text x={PAD - 12} y={PAD - 24} fontSize="11" fill="#78716c" fontFamily="Inter, sans-serif" letterSpacing="2">
          MONITORED AREA
        </text>

        {/* Compass */}
        <g transform={`translate(${W - PAD - 18}, ${PAD + 8})`} opacity="0.55">
          <path d="M0 -10 L3 0 L0 10 L-3 0 Z" fill="#a8a29e" />
          <text y="16" textAnchor="middle" fontSize="9" fill="#a8a29e">N</text>
        </g>

        {clusters.map((c) => {
          const p = points.get(c.id)
          if (!p) return null
          const color = PRIORITY_COLORS[c.priority]?.fill ?? '#a57145'
          const r = Math.min(10 + c.report_count * 3, 24)
          const isSelected = selectedId === c.id
          const isHovered = hover?.id === c.id
          return (
            <g
              key={c.id}
              transform={`translate(${p.x}, ${p.y})`}
              className="cursor-pointer"
              onMouseEnter={() => setHover(c)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect?.(c)}
            >
              <circle
                r={r + (isSelected ? 5 : isHovered ? 4 : 0)}
                fill={color}
                fillOpacity={c.status === 'monitoring' ? 0.12 : 0.25}
                stroke={color}
                strokeWidth="1.5"
              />
              <circle r={r} fill={color} fillOpacity={c.status === 'monitoring' ? 0.5 : 0.95} stroke="#ffffff" strokeWidth="1.5" />
              <text
                textAnchor="middle"
                dy="4"
                fontSize="11"
                fontWeight="600"
                fill="#ffffff"
              >
                {c.report_count}
              </text>
            </g>
          )
        })}

        {tooltip && (
          <text x="12" y={H - 14} fontSize="11" fill="#a8a29e" fontFamily="monospace">
            {tooltip}
          </text>
        )}
      </svg>

      {/* Hover card */}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-56 rounded-lg border border-neutral-300 bg-white p-3 shadow-xl"
          style={{ top: 12, right: 12 }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-900">Signal #{hover.id}</span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: PRIORITY_COLORS[hover.priority].fill }}
            >
              {hover.priority.toUpperCase()}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-neutral-700">
            {hover.report_count} similar report{hover.report_count === 1 ? '' : 's'}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {hover.types.map((t) => TYPE_LABELS[t] ?? t).join(', ')}
          </p>
          <p className="mt-1 text-[11px] text-neutral-500">
            Last report {relativeTime(hover.last_report_at)} · {hover.status}
          </p>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 rounded-md border border-neutral-300 bg-white/95 px-3 py-2">
        <div className="flex items-center gap-3 text-[11px] text-neutral-700">
          {(['high', 'medium', 'low'] as const).map((p) => (
            <span key={p} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PRIORITY_COLORS[p].fill }} />
              {p}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-neutral-500">
            <span className="h-2.5 w-2.5 rounded-full border border-neutral-400" />
            monitoring
          </span>
        </div>
      </div>
    </div>
  )
}
