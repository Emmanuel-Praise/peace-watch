import { useCallback, useEffect, useState } from 'react'
import type { QuarterHead, QuarterHeadStatus } from '../types'
import { api } from '../api/client'
import Badge from '../components/Badge'
import { EmptyState, ErrorState } from '../components/State'
import Spinner from '../components/Spinner'
import { QH_STATUS_LABELS, relativeTime } from '../lib/format'
import { CheckIcon, PlusIcon, UsersIcon, XIcon } from '../components/icons'
import QuarterHeadForm from '../components/QuarterHeadForm'

const STATUS_TONES: Record<QuarterHeadStatus, 'green' | 'amber' | 'red'> = {
  pending: 'amber',
  verified: 'green',
  rejected: 'red',
}

const TABS: { key: '' | QuarterHeadStatus; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Applications' },
  { key: 'verified', label: 'Verified' },
  { key: 'rejected', label: 'Rejected' },
]

export default function QuarterHeads() {
  const [heads, setHeads] = useState<QuarterHead[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'' | QuarterHeadStatus>('')
  const [formOpen, setFormOpen] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const load = useCallback(async (status?: QuarterHeadStatus) => {
    setError(null)
    try {
      const list = await api.getQuarterHeads(status || undefined)
      setHeads(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quarter heads.')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const pendingCount = heads?.filter((h) => h.status === 'pending').length ?? 0

  const changeStatus = async (id: number, status: QuarterHeadStatus) => {
    setBusyId(id)
    setErrorMsg(null)
    try {
      await api.setQuarterHeadStatus(id, status)
      await load(statusFilter || undefined)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update quarter head.')
    } finally {
      setBusyId(null)
    }
  }

  const actions = (h: QuarterHead) => (
    <div className="flex items-center gap-1.5">
      {h.status !== 'verified' && (
        <button
          type="button"
          disabled={busyId === h.id}
          onClick={() => changeStatus(h.id, 'verified')}
          className="btn-secondary px-2.5 py-1.5 text-xs"
          title="Verify — this head then receives their area's reports"
        >
          <CheckIcon size={13} />
          Verify
        </button>
      )}
      {h.status !== 'rejected' && (
        <button
          type="button"
          disabled={busyId === h.id}
          onClick={() => changeStatus(h.id, 'rejected')}
          className="btn-danger px-2.5 py-1.5 text-xs"
          title="Reject application"
        >
          <XIcon size={13} />
          Reject
        </button>
      )}
    </div>
  )

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 md:px-6 md:py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Quarter Heads</h1>
          <p className="mt-1 text-xs text-neutral-500">
            Area leaders. Only verified heads receive their area's reports on WhatsApp.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setFormOpen(true)}>
          <PlusIcon size={15} />
          Register
        </button>
      </div>

      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === t.key
                ? 'bg-neutral-900 text-white'
                : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100'
            }`}
            onClick={() => {
              setStatusFilter(t.key)
              load(t.key || undefined)
            }}
          >
            {t.label}
            {t.key === 'pending' && pendingCount > 0 && (
              <span
                className={`ml-1.5 rounded-full px-1.5 text-[10px] font-semibold ${
                  statusFilter === t.key ? 'bg-white/20' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {errorMsg && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{errorMsg}</p>
      )}

      <div className="card overflow-hidden">
        {error ? (
          <ErrorState message={error} onRetry={() => load(statusFilter || undefined)} />
        ) : heads === null ? (
          <Spinner label="Loading quarter heads…" />
        ) : heads.length === 0 ? (
          <EmptyState
            title="No quarter heads yet"
            hint="Registrations made here or via WhatsApp ('register as quarter head') appear here as applications."
          />
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden w-full md:table">
              <thead>
                <tr>
                  <th className="th w-12 num">#</th>
                  <th className="th">Name</th>
                  <th className="th">Area</th>
                  <th className="th w-32">WhatsApp</th>
                  <th className="th w-20">ID doc</th>
                  <th className="th w-32">Status</th>
                  <th className="th w-24">Applied</th>
                  <th className="th w-32"></th>
                </tr>
              </thead>
              <tbody>
                {heads.map((h) => (
                  <tr key={h.id} className={h.status === 'pending' ? 'bg-amber-50/50' : undefined}>
                    <td className="td num text-xs text-neutral-400">{h.id}</td>
                    <td className="td">
                      <div className="text-sm font-medium text-neutral-900">{h.name}</div>
                      {h.has_id_document && <div className="mt-0.5 text-[11px] text-neutral-400">ID document on file</div>}
                    </td>
                    <td className="td">
                      <div className="text-sm text-neutral-800">{h.quarter_name}</div>
                      {h.city && <div className="text-[11px] text-neutral-500">{h.city}</div>}
                    </td>
                    <td className="td num text-xs text-neutral-500">{h.wa_number_masked || '—'}</td>
                    <td className="td text-xs text-neutral-500">{h.has_id_document ? 'Yes' : '—'}</td>
                    <td className="td"><Badge label={QH_STATUS_LABELS[h.status]} tone={STATUS_TONES[h.status]} dot /></td>
                    <td className="td num whitespace-nowrap text-xs text-neutral-500">{relativeTime(h.created_at)}</td>
                    <td className="td">{actions(h)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <ul className="divide-y divide-neutral-200/70 md:hidden">
              {heads.map((h) => (
                <li key={h.id} className={`px-4 py-3.5 ${h.status === 'pending' ? 'bg-amber-50/50' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-neutral-900">{h.name}</div>
                      <div className="mt-0.5 text-xs text-neutral-500">
                        {h.quarter_name}{h.city ? `, ${h.city}` : ''} · <span className="num">{h.wa_number_masked}</span>
                      </div>
                    </div>
                    <Badge label={QH_STATUS_LABELS[h.status]} tone={STATUS_TONES[h.status]} dot />
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-neutral-400">
                    {h.has_id_document && <span>ID document on file</span>}
                    <span className="num">applied {relativeTime(h.created_at)}</span>
                  </div>
                  <div className="mt-3">{actions(h)}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-neutral-400">
        <UsersIcon size={13} />
        Registration also happens over WhatsApp when someone messages "register as quarter head".
      </p>

      {formOpen && (
        <QuarterHeadForm
          onClose={() => setFormOpen(false)}
          onCreated={() => load(statusFilter || undefined)}
        />
      )}
    </div>
  )
}
