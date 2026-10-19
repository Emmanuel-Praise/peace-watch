import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Report, ReportStatus, ReportType } from '../types'
import { api } from '../api/client'
import { PriorityBadge } from '../components/Badge'
import { EmptyState, ErrorState } from '../components/State'
import Spinner from '../components/Spinner'
import { TYPE_LABELS, formatCoords, relativeTime, sourceLabel } from '../lib/format'
import { PlusIcon, SearchIcon, TrashIcon } from '../components/icons'
import ReportForm from '../components/ReportForm'
import ReportDetailModal from '../components/ReportDetailModal'

const STATUS_OPTIONS: { value: ReportStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'under_review', label: 'Under review' },
  { value: 'verified', label: 'Verified' },
  { value: 'dismissed', label: 'Dismissed' },
]

function StatusSelect({ report, onChange }: { report: Report; onChange: (s: ReportStatus) => void }) {
  return (
    <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <select
        className="appearance-none rounded-full border border-neutral-200 bg-neutral-50 py-1 pl-3 pr-7 text-xs font-medium text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-white focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
        value={report.status}
        onChange={(e) => onChange(e.target.value as ReportStatus)}
      >
        {STATUS_OPTIONS.map((o) => (
          <option
            key={o.value}
            value={o.value}
            disabled={report.status === 'dismissed' && o.value !== 'dismissed'}
          >
            {o.label}
          </option>
        ))}
      </select>
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  )
}

function SourceChip({ source }: { source: string }) {
  return (
    <span className="rounded bg-neutral-100 px-1.5 text-[10px] font-medium text-neutral-500">
      {sourceLabel(source)}
    </span>
  )
}

export default function Reports() {
  const [reports, setReports] = useState<Report[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

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

  const detail = detailId != null ? reports?.find((r) => r.id === detailId) ?? null : null

  const filtered = useMemo(() => {
    if (!reports) return []
    const q = search.trim().toLowerCase()
    if (!q) return reports
    return reports.filter(
      (r) =>
        r.description.toLowerCase().includes(q) ||
        (r.location_name ?? '').toLowerCase().includes(q) ||
        TYPE_LABELS[r.type].toLowerCase().includes(q),
    )
  }, [reports, search])

  const changeStatus = async (id: number, status: ReportStatus) => {
    setBusyId(id)
    setErrorMsg(null)
    try {
      await api.updateReportStatus(id, status)
      await load(typeFilter || undefined, statusFilter || undefined)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update status.')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id: number) => {
    if (!window.confirm('Delete this report? This cannot be undone.')) return
    setBusyId(id)
    setErrorMsg(null)
    try {
      await api.deleteReport(id)
      if (detailId === id) setDetailId(null)
      await load(typeFilter || undefined, statusFilter || undefined)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete report.')
    } finally {
      setBusyId(null)
    }
  }

  const deleteButton = (r: Report) => (
    <button
      type="button"
      disabled={busyId === r.id}
      onClick={(e) => { e.stopPropagation(); remove(r.id) }}
      className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
      title="Delete report"
    >
      <TrashIcon size={15} />
    </button>
  )

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 md:px-6 md:py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="mt-1 text-xs text-neutral-500">
            Verified reports go to the quarter head of the area, on WhatsApp.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setFormOpen(true)}>
          <PlusIcon size={15} />
          Log a report
        </button>
      </div>

      {errorMsg && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{errorMsg}</p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <SearchIcon size={15} className="pointer-events-none absolute left-3 top-2.5 text-neutral-400" />
          <input
            className="input pl-9"
            placeholder="Search description or location…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input w-auto flex-none min-w-[9rem]"
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value)
            load(e.target.value || undefined, statusFilter || undefined)
          }}
        >
          <option value="">All types</option>
          {(Object.keys(TYPE_LABELS) as ReportType[]).map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
        <select
          className="input w-auto flex-none min-w-[8.5rem]"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            load(typeFilter || undefined, e.target.value || undefined)
          }}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="card overflow-hidden">
        {error ? (
          <ErrorState message={error} onRetry={() => load(typeFilter || undefined, statusFilter || undefined)} />
        ) : reports === null ? (
          <Spinner label="Loading reports…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No reports"
            hint={reports.length === 0 ? 'New WhatsApp and manual reports appear here.' : 'No matches for the current filters.'}
          />
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden w-full md:table">
              <thead>
                <tr>
                  <th className="th w-12 num">#</th>
                  <th className="th w-44">Incident</th>
                  <th className="th w-40">Status</th>
                  <th className="th">Description & location</th>
                  <th className="th w-28">Received</th>
                  <th className="th w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer transition-colors hover:bg-neutral-50/70"
                    onClick={() => setDetailId(r.id)}
                  >
                    <td className="td num text-xs text-neutral-400">{r.id}</td>
                    <td className="td">
                      <div className="text-sm font-medium text-neutral-900">{TYPE_LABELS[r.type]}</div>
                      <div className="mt-1"><PriorityBadge priority={r.priority} /></div>
                    </td>
                  <td className="td">
                    <StatusSelect report={r} onChange={(s) => changeStatus(r.id, s)} />
                  </td>
                  <td className="td">
                      <div className="max-w-md truncate text-sm text-neutral-700" title={r.description}>
                        {r.description}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                        <span>{r.location_name ?? formatCoords(r.latitude, r.longitude)}</span>
                        <SourceChip source={r.source} />
                      </div>
                    </td>
                    <td className="td num whitespace-nowrap text-xs text-neutral-500">{relativeTime(r.created_at)}</td>
                    <td className="td">{deleteButton(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <ul className="divide-y divide-neutral-200/70 md:hidden">
              {filtered.map((r) => (
                <li
                  key={r.id}
                  className="cursor-pointer px-4 py-3.5 active:bg-neutral-50"
                  onClick={() => setDetailId(r.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-neutral-900">{TYPE_LABELS[r.type]}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <PriorityBadge priority={r.priority} />
                        <SourceChip source={r.source} />
                      </div>
                    </div>
                    <span className="num shrink-0 text-xs text-neutral-400">#{r.id}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-neutral-600">{r.description}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-neutral-400">
                    <span className="truncate">{r.location_name ?? formatCoords(r.latitude, r.longitude)}</span>
                    <span className="num shrink-0">{relativeTime(r.created_at)}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                    <StatusSelect report={r} onChange={(s) => changeStatus(r.id, s)} />
                    {deleteButton(r)}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {formOpen && (
        <ReportForm
          onClose={() => setFormOpen(false)}
          onCreated={() => load(typeFilter || undefined, statusFilter || undefined)}
        />
      )}

      {detail && (
        <ReportDetailModal
          report={detail}
          onClose={() => setDetailId(null)}
          onChanged={() => load(typeFilter || undefined, statusFilter || undefined)}
        />
      )}
    </div>
  )
}
