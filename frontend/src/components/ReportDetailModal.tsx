import { useEffect, useState } from 'react'
import type { QuarterHead, Report, ReportStatus } from '../types'
import { api, ApiError } from '../api/client'
import Badge from './Badge'
import { EmptyState } from './State'
import { SOURCE_LABELS, TYPE_LABELS, formatCoords, formatDateTime } from '../lib/format'
import { MapPinIcon, UsersIcon, XIcon } from './icons'

const STATUS_TONES: Record<ReportStatus, 'green' | 'amber' | 'red' | 'slate'> = {
  pending: 'slate',
  under_review: 'amber',
  verified: 'green',
  dismissed: 'red',
}

function LocationPinForm({
  report,
  onPinned,
}: {
  report: Report
  onPinned: (r: Report) => void
}) {
  const [lat, setLat] = useState(report.latitude == null ? '' : String(report.latitude))
  const [lng, setLng] = useState(report.longitude == null ? '' : String(report.longitude))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const latN = Number(lat)
    const lngN = Number(lng)
    if (Number.isNaN(latN) || latN < -90 || latN > 90) {
      setError('Latitude must be between -90 and 90.')
      return
    }
    if (Number.isNaN(lngN) || lngN < -180 || lngN > 180) {
      setError('Longitude must be between -180 and 180.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const updated = await api.updateReportLocation(report.id, { latitude: latN, longitude: lngN })
      onPinned(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pin location.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      <input className="input w-32" placeholder="Latitude" type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} />
      <input className="input w-32" placeholder="Longitude" type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} />
      <button type="button" className="btn-secondary" disabled={busy} onClick={submit}>
        {busy ? 'Saving…' : 'Save location'}
      </button>
      {error && <p className="w-full text-[11px] text-red-600">{error}</p>}
    </div>
  )
}

function RoutingSection({ report }: { report: Report }) {
  const [heads, setHeads] = useState<QuarterHead[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setHeads(null)
    api.getMatchingHeads(report.id)
      .then(setHeads)
      .catch((err) => setError(err instanceof ApiError ? err.detail : 'Failed to load routing.'))
  }, [report.id, report.latitude, report.location_name])

  return (
    <div>
      <label className="label mb-1 flex items-center gap-1.5">
        <UsersIcon size={13} />
        Routed to quarter heads
      </label>
      {heads === null ? (
        <p className="text-xs text-neutral-400">{error ?? 'Checking area…'}</p>
      ) : heads.length === 0 ? (
        <EmptyState
          title="No matching quarter heads"
          hint="Verified quarter heads whose area name matches this report's location are notified automatically."
        />
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
          {heads.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-neutral-900">{h.name}</div>
                <div className="text-[11px] text-neutral-500">
                  {h.quarter_name}{h.city ? `, ${h.city}` : ''} · {h.wa_number_masked}
                </div>
              </div>
              <Badge label="Verified" tone="green" />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function ReportDetailModal({
  report,
  onClose,
  onChanged,
}: {
  report: Report
  onClose: () => void
  onChanged: (r: Report) => void
}) {
  const [current, setCurrent] = useState<Report>(report)

  const setStatus = async (status: ReportStatus) => {
    try {
      const updated = await api.updateReportStatus(current.id, status)
      setCurrent(updated)
      onChanged(updated)
    } catch (err) {
      // surfaced by the parent page for delete/status ops; keep modal open
      console.error(err)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div className="flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-neutral-200 bg-white shadow-xl sm:max-w-xl sm:rounded-xl" onMouseDown={(e) => e.stopPropagation()}>
        <span className="mx-auto mt-2.5 block h-1 w-10 shrink-0 rounded-full bg-neutral-200 sm:hidden" />
        <div className="flex items-start justify-between border-b border-neutral-200 px-5 py-3.5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-neutral-900">{TYPE_LABELS[current.type]}</h2>
              <Badge label={`#${current.id}`} tone="slate" />
              <Badge label={`From ${SOURCE_LABELS[current.source] ?? current.source}`} tone="slate" />
            </div>
            <p className="mt-0.5 text-xs text-neutral-500">{formatDateTime(current.created_at)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">
            <XIcon size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Status:</span>
            <Badge
              label={current.status === 'under_review' ? 'Under review' : current.status[0].toUpperCase() + current.status.slice(1)}
              tone={STATUS_TONES[current.status]}
            />
            {current.priority && <Badge label={current.priority.toUpperCase()} tone={current.priority === 'high' ? 'red' : current.priority === 'medium' ? 'amber' : 'blue'} />}
          </div>

          <div>
            <label className="label mb-1">Description</label>
            <p className="text-sm leading-relaxed text-neutral-700">{current.description}</p>
          </div>

          <div>
            <label className="label mb-1 flex items-center gap-1.5">
              <MapPinIcon size={13} />
              Location
            </label>
            <p className="text-xs text-neutral-700">
              {current.location_name ?? 'No area name'} · {formatCoords(current.latitude, current.longitude)}
            </p>
            <div className="mt-2">
              <LocationPinForm
                report={current}
                onPinned={(updated) => {
                  setCurrent(updated)
                  onChanged(updated)
                }}
              />
            </div>
          </div>

          <RoutingSection report={current} />
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-neutral-200 px-5 py-3">
          <div className="flex items-center gap-2">
            {current.status !== 'verified' && (
              <button type="button" className="btn-secondary" onClick={() => setStatus('verified')}>Approve</button>
            )}
            {current.status !== 'dismissed' && (
              <button type="button" className="btn-danger" onClick={() => setStatus('dismissed')}>Dismiss</button>
            )}
          </div>
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
