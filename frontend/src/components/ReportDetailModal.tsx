import { useState } from 'react'
import type { Report, ReportDetails, ReportStatus } from '../types'
import { api } from '../api/client'
import Badge, { PriorityBadge } from './Badge'
import {
  BotIcon,
  CheckIcon,
  GlobeIcon,
  MapPinIcon,
  PinIcon,
  ShieldIcon,
  XIcon,
} from './icons'
import { formatCoords, formatDateTime, SOURCE_LABELS } from '../lib/format'

const QUALITY_TONE = {
  blue: 'border-neutral-200 bg-neutral-50 text-neutral-800',
  amber: 'border-brand-200 bg-brand-50 text-brand-700',
}

function Chip({ label, value }: { label: string; value?: string | number }) {
  if (value == null || value === '' || value === 0) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-700">
      {label}: <span className="font-semibold text-neutral-900">{value}</span>
    </span>
  )
}

function DetailsBlock({ details }: { details: ReportDetails }) {
  const chips: Array<[string, string | number | undefined]> = [
    ['People', details.people ?? undefined],
    ['Activity', details.activity],
    ['Injuries', details.injuries],
    ['Property damage', details.property_damage],
  ]
  const extras: Array<{ label: string; values?: string[] }> = [
    { label: 'Vehicles', values: details.vehicles },
    { label: 'Weapons', values: details.weapons },
    { label: 'Emergency services', values: details.emergency_services },
  ]
  const hasAnything =
    chips.some(([, v]) => v != null && v !== '') ||
    extras.some((e) => e.values && e.values.length > 0)

  if (!hasAnything) return null
  return (
    <div className="flex flex-wrap items-start gap-1.5">
      {chips.map(([label, v]) => v != null && v !== '' ? <Chip key={label} label={label} value={v} /> : null)}
      {extras.map((e) =>
        e.values && e.values.length > 0 ? (
          <Chip key={e.label} label={e.label} value={e.values.join(', ')} />
        ) : null,
      )}
    </div>
  )
}

function LocationPinForm({
  report,
  onPinned,
}: {
  report: Report
  onPinned: (r: Report) => void
}) {
  const [lat, setLat] = useState(report.latitude ?? '')
  const [lng, setLng] = useState(report.longitude ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const latN = Number(lat)
    const lngN = Number(lng)
    if (Number.isNaN(latN) || latN < -90 || latN > 90 || latN === 0) {
      setError('Latitude must be between -90 and 90 (non-zero).')
      return
    }
    if (Number.isNaN(lngN) || lngN < -180 || lngN > 180 || lngN === 0) {
      setError('Longitude must be between -180 and 180 (non-zero).')
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
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-neutral-500">
        <PinIcon size={13} className="text-brand-600" />
        Pin approximate location to enable corroboration
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-32" placeholder="Latitude" type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} />
        <input className="input w-32" placeholder="Longitude" type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} />
        <button type="button" className="btn-primary" disabled={busy} onClick={submit}>
          {busy ? 'Saving…' : 'Save location'}
        </button>
      </div>
      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
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

  const statusTone: Record<ReportStatus, 'blue' | 'green' | 'amber' | 'red' | 'slate'> = {
    pending: 'slate',
    under_review: 'amber',
    verified: 'green',
    dismissed: 'red',
  }

  const locationMissing = current.latitude == null || current.longitude == null
  const aiDegraded = !current.ai_processed

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-neutral-200 bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-neutral-200 px-5 py-3.5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-neutral-900">Report #{current.id}</h2>
              <PriorityBadge priority={current.priority} />
              <Badge label={SOURCE_LABELS[current.source] ?? current.source} tone="slate" />
            </div>
            <p className="mt-0.5 text-xs text-neutral-500">
              {formatDateTime(current.created_at)} · {current.detected_language ? `spoken language: ${current.detected_language}` : null}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">
            <XIcon size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label className="label mb-1">Description</label>
            <p className="text-sm leading-relaxed text-neutral-700">{current.description}</p>
          </div>

          <div className={`rounded-md border px-3 py-2.5 ${aiDegraded ? QUALITY_TONE.amber : QUALITY_TONE.blue}`}>
            <div className="flex items-center gap-2">
              <BotIcon size={15} />
              <span className="text-xs font-semibold">
                {aiDegraded ? 'AI extraction unavailable' : 'AI summary'}
              </span>
              {!aiDegraded && <span className="text-[11px] text-neutral-500">believed location/summary — not verified</span>}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-current">
              {current.ai_summary ?? 'No AI summary.'}
            </p>
            {current.ai_error && (
              <p className="mt-1 text-[11px] text-brand-600">Reason: {current.ai_error}</p>
            )}
          </div>

          {current.details && <DetailsBlock details={current.details} />}

          {current.transcript && (
            <div>
              <label className="label mb-1">Original transcript</label>
              <p className="rounded-lg bg-neutral-100 px-3 py-2 text-xs leading-relaxed text-neutral-500">
                “{current.transcript}”
              </p>
              <p className="mt-1 text-[10px] text-neutral-400">
                Source audio is deleted immediately after transcription. PII (phones, emails) is scrubbed.
              </p>
            </div>
          )}

          <div>
            <label className="label mb-1">Location</label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-neutral-700">
                <GlobeIcon size={14} className="text-neutral-500" />
                {current.location_name ?? 'Approximate location not named'}
              </span>
              {!locationMissing && (
                <span className="flex items-center gap-1.5 text-xs text-neutral-500">
                  <MapPinIcon size={14} className="text-neutral-500" />
                  {formatCoords(current.latitude, current.longitude)}
                </span>
              )}
            </div>
            {!locationMissing ? (
              <p className="mt-1 text-[10px] text-neutral-400">
                Coordinates are estimates only. Pin a more accurate spot below.
              </p>
            ) : null}
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

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-neutral-50 p-3 text-xs">
            <div>
              <dt className="text-neutral-500">Status</dt>
              <dd className="mt-0.5"><Badge label={current.status.replace('_', ' ')} tone={statusTone[current.status]} /></dd>
            </div>
            <div>
              <dt className="text-neutral-500">Type</dt>
              <dd className="mt-0.5 font-medium capitalize text-neutral-900">{current.type.replace('_', ' ')}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Reported</dt>
              <dd className="mt-0.5 text-neutral-700">{formatDateTime(current.created_at)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Corroboration</dt>
              <dd className="mt-0.5 text-neutral-700">
                {current.cluster_id ? (
                  <>
                    <span className="font-medium text-neutral-900">signal #{current.cluster_id}</span>
                    {current.anonymous_id_sha256 ? ' · anonymous source counted once' : ''}
                  </>
                ) : locationMissing ? (
                  <span className="text-neutral-500">awaiting location to join a signal</span>
                ) : (
                  <span className="text-neutral-500">not yet clustered</span>
                )}
              </dd>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-[11px] text-neutral-500">
            <ShieldIcon size={14} className="shrink-0 text-emerald-600" />
            Reports are never automatically marked “confirmed”. An operator reviews before acting.
            {current.anonymous_id_sha256 && (
              <span className="text-neutral-400">Reporter fingerprint: {current.anonymous_id_sha256.slice(0, 10)}…</span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-3">
          <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            <CheckIcon size={13} />
            No phone numbers or personal identifiers stored
          </span>
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}