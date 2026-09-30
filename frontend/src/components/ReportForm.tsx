import { useState } from 'react'
import type { ReportInput, ReportType, Severity } from '../types'
import { api } from '../api/client'
import { MAP_BOUNDS, SEVERITY_LABELS, TYPE_LABELS } from '../lib/format'
import { XIcon } from './icons'

const TYPES = Object.keys(TYPE_LABELS) as ReportType[]

export default function ReportForm({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (report: object) => void
}) {
  const [type, setType] = useState<ReportType>('suspicious_activity')
  const [severity, setSeverity] = useState<Severity>('medium')
  const [description, setDescription] = useState('')
  const [latitude, setLatitude] = useState<number>((MAP_BOUNDS.minLat + MAP_BOUNDS.maxLat) / 2)
  const [longitude, setLongitude] = useState<number>((MAP_BOUNDS.minLng + MAP_BOUNDS.maxLng) / 2)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const randomizeLocation = () => {
    const spanLat = MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat
    const spanLng = MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng
    setLatitude(Number((MAP_BOUNDS.minLat + Math.random() * spanLat).toFixed(5)))
    setLongitude(Number((MAP_BOUNDS.minLng + Math.random() * spanLng).toFixed(5)))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const body: ReportInput = {
      type,
      severity,
      description: description.trim(),
      latitude,
      longitude,
    }
    if (description.trim().length < 5) {
      setError('Description must be at least 5 characters.')
      return
    }
    if (Number.isNaN(latitude) || latitude < -90 || latitude > 90) {
      setError('Latitude must be between -90 and 90.')
      return
    }
    if (Number.isNaN(longitude) || longitude < -180 || longitude > 180) {
      setError('Longitude must be between -180 and 180.')
      return
    }
    setSaving(true)
    try {
      const report = await api.createReport(body)
      onCreated(report)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit report.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Submit a demo report</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Anonymous report — no personal identifiers are stored.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">
            <XIcon size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="rf-type">Incident type</label>
              <select id="rf-type" className="input" value={type} onChange={(e) => setType(e.target.value as ReportType)}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="rf-sev">Severity</label>
              <select id="rf-sev" className="input" value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
                {(Object.keys(SEVERITY_LABELS) as Severity[]).map((s) => (
                  <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="rf-desc">What happened?</label>
            <textarea
              id="rf-desc"
              className="input h-24 resize-none"
              maxLength={1000}
              placeholder="Describe the incident e.g. smoke rising from the market stalls…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="label mb-1">Approximate location</label>
              <button type="button" onClick={randomizeLocation} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                Random demo location
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="rf-lat">Latitude</label>
                <input id="rf-lat" className="input" type="number" step="any" value={latitude} onChange={(e) => setLatitude(Number(e.target.value))} />
              </div>
              <div>
                <label className="label" htmlFor="rf-lng">Longitude</label>
                <input id="rf-lng" className="input" type="number" step="any" value={longitude} onChange={(e) => setLongitude(Number(e.target.value))} />
              </div>
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-3.5">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Submitting…' : 'Submit report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
