import { useState } from 'react'
import type { ReportInput, ReportType, Severity } from '../types'
import { api } from '../api/client'
import { SEVERITY_LABELS, TYPE_LABELS } from '../lib/format'
import { XIcon } from './icons'

const TYPES = Object.keys(TYPE_LABELS) as ReportType[]

export default function ReportForm({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [type, setType] = useState<ReportType>('other')
  const [severity, setSeverity] = useState<Severity>('medium')
  const [description, setDescription] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (description.trim().length < 5) {
      setError('Description must be at least 5 characters.')
      return
    }
    const latitude = lat.trim() === '' ? null : Number(lat)
    const longitude = lng.trim() === '' ? null : Number(lng)
    if (lat.trim() !== '' && (Number.isNaN(latitude!) || latitude! < -90 || latitude! > 90)) {
      setError('Latitude must be between -90 and 90.')
      return
    }
    if (lng.trim() !== '' && (Number.isNaN(longitude!) || longitude! < -180 || longitude! > 180)) {
      setError('Longitude must be between -180 and 180.')
      return
    }
    setSaving(true)
    setError(null)
    const body: ReportInput = {
      type,
      severity,
      description: description.trim(),
      latitude,
      longitude,
    }
    try {
      await api.createReport(body)
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit report.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-neutral-200 bg-white shadow-xl sm:max-w-md sm:rounded-xl" onMouseDown={(e) => e.stopPropagation()}>
        <span className="mx-auto mt-2.5 block h-1 w-10 rounded-full bg-neutral-200 sm:hidden" />
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-neutral-900">Log a report</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">
            <XIcon size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="rf-type">Type</label>
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
              placeholder="e.g. smoke rising from the market stalls…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="label mb-1">Coordinates (optional)</label>
            <div className="grid grid-cols-2 gap-3">
              <input className="input" placeholder="Latitude" type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} />
              <input className="input" placeholder="Longitude" type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} />
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-3.5">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
