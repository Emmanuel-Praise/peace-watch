import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Cluster, ClusterDetail, ClusterPriority } from '../types'
import { api } from '../api/client'
import ClusterMap from '../components/ClusterMap'
import Badge, { PriorityBadge } from '../components/Badge'
import { EmptyState, ErrorState } from '../components/State'
import Spinner from '../components/Spinner'
import { relativeTime, TYPE_LABELS } from '../lib/format'

const PRIORITIES: Array<{ value: ClusterPriority | ''; label: string }> = [
  { value: '', label: 'All priorities' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

export default function MapPage() {
  const [params, setParams] = useSearchParams()
  const [clusters, setClusters] = useState<Cluster[] | null>(null)
  const [detail, setDetail] = useState<ClusterDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [priority, setPriority] = useState<ClusterPriority | ''>('')
  const [activeOnly, setActiveOnly] = useState(false)

  const requestedId = params.get('cluster')
  const selectedId = requestedId ? Number(requestedId) : null

  const load = useCallback(async () => {
    setError(null)
    try {
      const list = await api.getClusters()
      setClusters(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load clusters.')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const loadDetail = useCallback(async (id: number | null) => {
    if (id == null) {
      setDetail(null)
      return
    }
    try {
      setDetail(await api.getCluster(id))
    } catch {
      setDetail(null)
    }
  }, [])

  useEffect(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (selectedId) next.set('cluster', String(selectedId))
      else next.delete('cluster')
      return next
    })
    loadDetail(selectedId)
  }, [selectedId, loadDetail, setParams])

  const filtered = useMemo(() => {
    if (!clusters) return []
    return clusters.filter((c) => {
      if (priority && c.priority !== priority) return false
      if (activeOnly && c.status !== 'active') return false
      return true
    })
  }, [clusters, priority, activeOnly])

  const onSelect = (c: Cluster | null) => {
    if (!c) {
      setParams({}, { replace: true })
      return
    }
    setParams({ cluster: String(c.id) }, { replace: true })
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Signals map</h2>
          <p className="text-xs text-neutral-500">
            Anonymous incident locations grouped into corroborated signals. Click a signal for details.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <select className="input w-40" value={priority} onChange={(e) => setPriority(e.target.value as ClusterPriority | '')}>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <label className="flex select-none items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="h-3.5 w-3.5 accent-brand-600"
            />
            Active only
          </label>
        </div>
      </div>

      {error ? (
        <div className="card">
          <ErrorState message={error} onRetry={load} />
        </div>
      ) : clusters === null ? (
        <div className="card">
          <Spinner label="Loading signals…" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {filtered.length === 0 ? (
              <div className="card">
                <EmptyState title="No signals match the filters" hint="Adjust the filters above." />
              </div>
            ) : (
              <ClusterMap clusters={filtered} selectedId={selectedId} onSelect={onSelect} height={520} />
            )}
          </div>

          <div className="space-y-4">
            {detail ? (
              <div className="card p-4">
                <div className="flex items-center justify-between">
                  <h3 className="card-title">Signal #{detail.id}</h3>
                  <PriorityBadge priority={detail.priority} />
                </div>
                <dl className="mt-3 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-neutral-500">Reports</dt>
                    <dd className="font-medium text-neutral-900">{detail.report_count}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-neutral-500">Status</dt>
                    <dd className="font-medium text-neutral-900 capitalize">{detail.status}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-neutral-500">Types</dt>
                    <dd className="text-neutral-700">
                      {detail.types.map((t) => TYPE_LABELS[t] ?? t).join(', ')}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-neutral-500">Approx. radius</dt>
                    <dd className="font-medium text-neutral-900">{detail.radius_km.toFixed(1)} km</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-neutral-500">Last report</dt>
                    <dd className="font-medium text-neutral-900">{relativeTime(detail.last_report_at)}</dd>
                  </div>
                </dl>

                <div className="mt-4 border-t border-neutral-200 pt-3">
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                    Member reports
                  </h4>
                  <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {detail.reports.map((r) => (
                      <li key={r.id} className="rounded-lg border border-neutral-200 bg-neutral-50 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-neutral-900">{TYPE_LABELS[r.type]}</span>
                          <Badge label={r.status.replace('_', ' ')} tone={r.status === 'verified' ? 'green' : r.status === 'dismissed' ? 'red' : r.status === 'under_review' ? 'amber' : 'slate'} />
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{r.description}</p>
                        <p className="mt-1 text-[11px] text-neutral-500">{relativeTime(r.created_at)}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="card p-4">
                <h3 className="card-title">Signal details</h3>
                <p className="mt-2 text-xs leading-relaxed text-neutral-500">
                  Select a signal on the map to inspect its member reports. Signals group similar, nearby reports —
                  review member reports before taking action.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}