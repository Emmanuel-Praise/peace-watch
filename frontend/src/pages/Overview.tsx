import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Overview } from '../types'
import { api } from '../api/client'
import ClusterMap from '../components/ClusterMap'
import Badge, { PriorityBadge } from '../components/Badge'
import { EmptyState, ErrorState } from '../components/State'
import Spinner from '../components/Spinner'
import { relativeTime, TYPE_LABELS, formatCoords } from '../lib/format'
import { ActivityIcon, BellIcon, ClockIcon, MapPinIcon } from '../components/icons'

const POLL_INTERVAL_MS = 8000

function alertTone(status: string): 'blue' | 'green' | 'slate' | 'red' | 'amber' {
  if (status === 'new') return 'blue'
  if (status === 'acknowledged') return 'amber'
  if (status === 'resolved') return 'green'
  return 'slate'
}

function StatCard({
  label,
  value,
  icon,
  hint,
  accent,
}: {
  label: string
  value: number | string
  icon: React.ReactNode
  hint?: string
  accent: string
}) {
  return (
    <div className="card group px-4 py-3.5 transition-colors hover:border-neutral-300">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>{icon}</div>
        <div>
          <div className="text-2xl font-semibold tracking-tight text-neutral-900">{value}</div>
          <div className="text-xs text-neutral-500">{label}</div>
        </div>
      </div>
      {hint && <p className="mt-2 text-[11px] text-neutral-400">{hint}</p>}
    </div>
  )
}

function LiveBadge() {
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
      <span className="live-dot"><span className="live-dot-core" /></span>
      LIVE
    </span>
  )
}

export default function Overview() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const seenReportIds = useRef<Set<number>>(new Set())
  const [freshIds, setFreshIds] = useState<Set<number>>(new Set())

  const load = useCallback(async (initial = false) => {
    if (initial) {
      setLoading(true)
      setError(null)
    }
    try {
      const next = await api.getOverview()
      // Detect reports that appeared since the last poll → flash them as "new".
      const fresh = new Set<number>()
      for (const r of next.recent_reports) {
        if (!initial && !seenReportIds.current.has(r.id)) fresh.add(r.id)
      }
      seenReportIds.current = new Set(next.recent_reports.map((r) => r.id))
      setFreshIds(fresh)
      setData(next)
      setError(null)
    } catch (err) {
      if (initial) setError(err instanceof Error ? err.message : 'Failed to load overview.')
    } finally {
      if (initial) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(true)
    const t = window.setInterval(() => load(), POLL_INTERVAL_MS)
    return () => window.clearInterval(t)
  }, [load])

  if (loading && !data) return <Spinner label="Loading overview…" />
  if (error && !data) return <ErrorState message={error} onRetry={() => load(true)} />
  if (!data) return null

  const s = data.stats

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Situation overview</h2>
          <p className="text-xs text-neutral-500">Auto-refreshing every {POLL_INTERVAL_MS / 1000}s</p>
        </div>
        <LiveBadge />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active signals" value={s.active_signals} icon={<ActivityIcon size={18} />} hint="Clusters with reports in the last 24h" accent="bg-brand-100 text-brand-700" />
        <StatCard label="Reports today" value={s.reports_today} icon={<MapPinIcon size={18} />} hint={`${s.total_reports} reports in total`} accent="bg-emerald-100 text-emerald-700" />
        <StatCard label="High-risk signals" value={s.high_risk_signals} icon={<BellIcon size={18} />} hint="Clusters with high priority" accent="bg-red-100 text-red-700" />
        <StatCard label="Pending verification" value={s.pending_verification} icon={<ClockIcon size={18} />} hint="Reports awaiting operator review" accent="bg-brand-100 text-brand-700" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="card-title">Active signals by area</h2>
            <Link to="/map" className="text-xs font-medium text-brand-600 hover:text-brand-700">
              Open map →
            </Link>
          </div>
          {data.clusters.length === 0 ? (
            <EmptyState title="No signals yet" hint="Submit a demo report to see corroboration in action." />
          ) : (
            <ClusterMap clusters={data.clusters.filter((c) => c.status === 'active')} height={360} />
          )}
        </div>

        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="card-title">Recent incident reports</h2>
            <Link to="/reports" className="text-xs font-medium text-brand-600 hover:text-brand-700">
              View all
            </Link>
          </div>
          {data.recent_reports.length === 0 ? (
            <EmptyState title="No reports yet" />
          ) : (
            <ul className="divide-y divide-neutral-200">
              {data.recent_reports.map((r) => (
                <li
                  key={r.id}
                  className={`flex items-start justify-between gap-3 py-2.5 ${freshIds.has(r.id) ? 'animate-fade-up rounded-lg bg-brand-50 px-2 -mx-2 ring-1 ring-brand-200/70' : ''}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-neutral-900">
                        {TYPE_LABELS[r.type]}
                      </span>
                      <PriorityBadge priority={r.priority} />
                      {freshIds.has(r.id) && <Badge label="NEW" tone="green" />}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-neutral-500">{r.description}</p>
                    {r.ai_summary && r.ai_processed && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-brand-600/80">
                        AI · {r.ai_summary}
                      </p>
                    )}
                    <p className="mt-0.5 text-[11px] text-neutral-400">
                      {relativeTime(r.created_at)} · {formatCoords(r.latitude, r.longitude)}
                      {r.cluster_id ? ` · signal #${r.cluster_id}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="card-title">Recent alerts</h2>
          <Link to="/alerts" className="text-xs font-medium text-brand-600 hover:text-brand-700">
            View all
          </Link>
        </div>
        {data.recent_alerts.length === 0 ? (
          <EmptyState title="No alerts" hint="Alerts are raised when a signal reaches medium or high priority." />
        ) : (
          <ul className="divide-y divide-neutral-200">
            {data.recent_alerts.map((a) => (
              <li
                key={a.id}
                className={`flex items-start justify-between gap-3 py-2.5 ${a.status === 'new' ? 'rounded-lg bg-brand-50 px-2 -mx-2 ring-1 ring-brand-100' : ''}`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityBadge priority={a.priority} />
                    <span className="text-sm font-medium text-neutral-900">{a.title}</span>
                    <Badge label={a.status === 'new' ? 'New' : a.status === 'acknowledged' ? 'Acknowledged' : 'Resolved'} tone={alertTone(a.status)} />
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-500">{a.message}</p>
                </div>
                <span className="shrink-0 text-[11px] text-neutral-400">{relativeTime(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
