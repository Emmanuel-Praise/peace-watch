import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Report, ReportStatus, ReportType } from '../types'
import { api } from '../api/client'
import Badge, { PriorityBadge } from '../components/Badge'
import { EmptyState, ErrorState } from '../components/State'
import Spinner from '../components/Spinner'
import { TYPE_LABELS, relativeTime, formatCoords } from '../lib/format'
import { SearchIcon, TrashIcon } from '../components/icons'
import ReportForm from '../components/ReportForm'
import IngestModal from '../components/IngestModal'
import ReportDetailModal from '../components/ReportDetailModal'

const STATUS_TONES: Record<ReportStatus, 'blue' | 'red' | 'green' | 'amber' | 'slate'> = {
  pending: 'slate',
  under_review: 'amber',
  verified: 'green',
  dismissed: 'red',
}

const STATUS_LABELS: Record<ReportStatus, string> = {
  pending: 'Pending',
  under_review: 'Under review',
  verified: 'Verified',
  dismissed: 'Dismissed',
}

function StatusSelect({ report, onChange }: { report: Report; onChange: (s: ReportStatus) => void }) {
  const [open, setOpen] = useState(false)
  const options = Object.keys(STATUS_LABELS) as ReportStatus[]
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-neutral-100"
      >
        <Badge label={STATUS_LABELS[report.status]} tone={STATUS_TONES[report.status]} />
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-neutral-500">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-neutral-300 bg-white py-1 shadow-xl">
            {options.map((o) => (
              <button
                key={o}
                type="button"
                disabled={report.status === 'dismissed' && o !== 'dismissed'}
                onClick={() => {
                  setOpen(false)
                  if (o !== report.status) onChange(o)
                }}
                className="block w-full px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {STATUS_LABELS[o]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function Reports() {
  const [reports, setReports] = useState<Report[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [ingestOpen, setIngestOpen] = useState(false)
  const [detail, setDetail] = useState<Report | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (type?: string, status?: string) => {
    setError(null)
    try {
      const list = await api.getReports({ type: type || undefined, status: status || undefined })
      setReports(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports.')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    if (!reports) return []
    const q = search.trim().toLowerCase()
    if (!q) return reports
    return reports.filter(
      (r) =>
        r.description.toLowerCase().includes(q) ||
        (r.ai_summary ?? '').toLowerCase().includes(q) ||
        (r.transcript ?? '').toLowerCase().includes(q) ||
        TYPE_LABELS[r.type].toLowerCase().includes(q),
    )
  }, [reports, search])

  const changeStatus = async (id: number, status: ReportStatus) => {
    setBusy(true)
    setErrorMsg(null)
    try {
      await api.updateReportStatus(id, status)
      await load(typeFilter || undefined, statusFilter || undefined)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update status.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: number) => {
    if (!window.confirm('Delete this report? This cannot be undone.')) return
    setBusy(true)
    setErrorMsg(null)
    try {
      await api.deleteReport(id)
      await load(typeFilter || undefined, statusFilter || undefined)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete report.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Incident reports</h2>
          <p className="text-xs text-neutral-500">Anonymous reports submitted via dashboard or incoming channels.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary" onClick={() => setIngestOpen(true)}>
            Live triage
          </button>
          <button type="button" className="btn-primary" onClick={() => setFormOpen(true)}>
            New report
          </button>
        </div>
      </div>

      {errorMsg && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{errorMsg}</p>
      )}

      <div className="card p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <SearchIcon size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-neutral-500" />
            <input
              className="input pl-8"
              placeholder="Search descriptions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="input w-44" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {(Object.keys(TYPE_LABELS) as ReportType[]).map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
          <select className="input w-44" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABELS) as ReportStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setTypeFilter('')
              setStatusFilter('')
              setSearch('')
              load()
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {error ? (
          <ErrorState message={error} onRetry={() => load()} />
        ) : reports === null ? (
          <Spinner label="Loading reports…" />
        ) : reports.length === 0 ? (
          <EmptyState title="No reports found" hint="Try clearing filters or submit a demo report." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr>
                  <th className="th w-14">ID</th>
                  <th className="th">Type</th>
                  <th className="th">Severity</th>
                  <th className="th">Status</th>
                  <th className="th">Description</th>
                  <th className="th">Reported</th>
                  <th className="th w-24"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="cursor-pointer transition-colors hover:bg-neutral-50" onClick={() => setDetail(r)}>
                    <td className="td text-neutral-500">#{r.id}</td>
                    <td className="td">
                      <div className="font-medium text-neutral-900">{TYPE_LABELS[r.type]}</div>
                      {r.cluster_id && (
                        <div className="mt-0.5 text-[11px] text-neutral-500">signal #{r.cluster_id}</div>
                      )}
                    </td>
                    <td className="td">
                      <PriorityBadge priority={r.priority} />
                    </td>
                    <td className="td">
                      <StatusSelect report={r} onChange={(s) => changeStatus(r.id, s)} />
                    </td>
                    <td className="td">
                      <div className="max-w-xs truncate text-xs text-neutral-500" title={r.description}>
                        {r.description}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-neutral-500">
                        <span>{formatCoords(r.latitude, r.longitude)}</span>
                        {r.source !== 'manual' && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-neutral-100 px-1 text-[10px] font-medium text-neutral-600">
                            {r.source === 'voice' ? 'voice' : 'text'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="td whitespace-nowrap text-xs text-neutral-500">{relativeTime(r.created_at)}</td>
                    <td className="td">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => remove(r.id)}
                          className="rounded p-1.5 text-neutral-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                          title="Delete report"
                        >
                          <TrashIcon size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen && (
        <ReportForm onClose={() => setFormOpen(false)} onCreated={() => load(typeFilter || undefined, statusFilter || undefined)} />
      )}

      {ingestOpen && (
        <IngestModal onClose={() => setIngestOpen(false)} onIngested={() => load(typeFilter || undefined, statusFilter || undefined)} />
      )}

      {detail && (
        <ReportDetailModal
          report={detail}
          onClose={() => setDetail(null)}
          onChanged={(updated) => {
            setDetail(updated)
            load(typeFilter || undefined, statusFilter || undefined)
          }}
        />
      )}
    </div>
  )
}