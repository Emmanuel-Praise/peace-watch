import { useState } from 'react'
import { api } from '../api/client'
import { XIcon } from './icons'

export default function QuarterHeadForm({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [waNumber, setWaNumber] = useState('')
  const [quarterName, setQuarterName] = useState('')
  const [city, setCity] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) {
      setError('Full name is required.')
      return
    }
    const digits = waNumber.replace(/[^\d+]/g, '')
    if (digits.length < 5) {
      setError('A WhatsApp number (at least 5 digits) is required.')
      return
    }
    if (quarterName.trim().length < 2) {
      setError('The quarter/area name is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.registerQuarterHead({
        name: name.trim(),
        wa_number: digits,
        quarter_name: quarterName.trim(),
        city: city.trim() || null,
        notes: notes.trim() || null,
      })
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-neutral-200 bg-white shadow-xl sm:max-w-md sm:rounded-xl" onMouseDown={(e) => e.stopPropagation()}>
        <span className="mx-auto mt-2.5 block h-1 w-10 rounded-full bg-neutral-200 sm:hidden" />
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Register quarter head</h2>
            <p className="mt-0.5 text-xs text-neutral-500">Starts as an application, pending verification.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">
            <XIcon size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 px-5 py-4">
          <div>
            <label className="label" htmlFor="qh-name">Full name</label>
            <input id="qh-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Joseph Moko" />
          </div>
          <div>
            <label className="label" htmlFor="qh-wa">WhatsApp number</label>
            <input id="qh-wa" className="input" value={waNumber} onChange={(e) => setWaNumber(e.target.value)} placeholder="+237 6 00 00 00 00" />
            <p className="mt-1 text-[11px] text-neutral-400">Shown as ***last 3 digits on the list; used for report forwarding.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="qh-quarter">Quarter / area</label>
              <input id="qh-quarter" className="input" value={quarterName} onChange={(e) => setQuarterName(e.target.value)} placeholder="e.g. Mokolo" />
            </div>
            <div>
              <label className="label" htmlFor="qh-city">Town / city</label>
              <input id="qh-city" className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Yaoundé" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="qh-notes">Notes (optional)</label>
            <textarea id="qh-notes" className="input h-16 resize-none" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-3.5">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Register'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
