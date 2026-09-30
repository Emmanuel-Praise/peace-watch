import { useCallback, useEffect, useState } from 'react'
import type { Alert, AlertStatus } from '../types'
import { api } from '../api/client'
import { PriorityBadge } from '../components/Badge'
import { EmptyState, ErrorState } from '../components/State'
import Spinner from '../components/Spinner'
import { relativeTime } from '../lib/format'
import { CheckIcon, RefreshIcon } from '../components/icons'
import { Link } from 'react-router-dom'

const STATUS_BAR: Record<AlertStatus, { ring: string; step: number }> = {
  new: { ring: 'bg-blue-400', step: 1 },
  acknowledged: { ring: 'bg-brand-500', step: 2 },
  resolved: { ring: 'bg-emerald-500', step: 3 },
}

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const load = useCallback(async (status?: string) => {
    setError(null)
    try {
      setAlerts(await api.getAlerts({ status: status || undefined }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alerts.')
    }
  }, [])

  useEffect(() => {
    load(statusFilter || undefined)
  }, [load, statusFilter])

  const changeStatus = async (alert: Alert, target: AlertStatus) => {
    setBusyId(alert.id)
    setErrorMsg(null)
    try {
      await api.updateAlertStatus(alert.id, target)
      await load(statusFilter || undefined)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update alert.')
    } finally {
      setBusyId(null)
    }
  }

  const canAcknowledge = (a: Alert) => a.status === 'new'
  const canResolve = (a: Alert) => a.status === 'new' || a.status === 'acknowledged'

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Alerts</h2>
          <p className="text-xs text-neutral-500">
            Raised when a signal reaches medium or high priority. No alert claims a report is confirmed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input w-44" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </div>

      {errorMsg && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{errorMsg}</p>
      )}

      {error ? (
        <div className="card">
          <ErrorState message={error} onRetry={() => load(statusFilter || undefined)} />
        </div>
      ) : alerts === null ? (
        <div className="card">
          <Spinner label="Loading alerts…" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No alerts"
            hint="Alerts appear here automatically when corroborated reports form a medium or high priority signal."
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {alerts.map((a) => {
            const bar = STATUS_BAR[a.status]
            return (
              <li key={a.id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <PriorityBadge priority={a.priority} />
                    <h3 className={`text-sm font-semibold ${a.status === 'new' ? 'text-neutral-900' : 'text-neutral-900'}`}>{a.title}</h3>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500">
                      signal #{a.cluster_id}
                    </span>
                  </div>
                  <span className="text-[11px] text-neutral-500">{relativeTime(a.created_at)}</span>
                </div>

                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-500">{a.message}</p>

                <div className="mt-3 flex items-center gap-3 border-t border-neutral-200 pt-3">
                  <div className="flex items-center gap-1.5">
                    {(['new', 'acknowledged', 'resolved'] as AlertStatus[]).map((s, i) => (
                      <div key={s} className="flex items-center">
                        {i > 0 && <div className={`h-0.5 w-6 ${bar.step > i ? 'bg-neutral-200' : 'bg-neutral-100'}`} />}
                        <div className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium ${bar.step > i ? 'text-neutral-700' : 'text-neutral-500'}`}>
                          <span className={`h-2 w-2 rounded-full ${bar.step <= i ? 'bg-neutral-100' : bar.ring}`} />
                          {s}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    {canAcknowledge(a) && (
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        onClick={() => changeStatus(a, 'acknowledged')}
                        className="btn-secondary"
                      >
                        Acknowledge
                      </button>
                    )}
                    {canResolve(a) && (
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        onClick={() => changeStatus(a, 'resolved')}
                        className="btn-primary"
                      >
                        <CheckIcon size={14} />
                        {a.status === 'new' ? 'Resolve' : 'Mark resolved'}
                      </button>
                    )}
                    {a.status === 'resolved' && (
                      <span className="text-xs text-neutral-500">
                        Resolved {a.resolved_at ? relativeTime(a.resolved_at) : ''}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-neutral-500">
                  <RefreshIcon size={12} />
                  Location{' '}
                  {a.cluster_lat !== 0 ? (
                    <span className="font-mono">
                      {a.cluster_lat.toFixed(4)}, {a.cluster_lng.toFixed(4)}
                    </span>
                  ) : (
                    'unknown'
                  )}
                  <span>·</span>
                  <Link to={`/map?cluster=${a.cluster_id}`} className="font-medium text-brand-600 hover:text-brand-700">
                    View on map
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}