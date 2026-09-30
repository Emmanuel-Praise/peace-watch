import { useCallback, useEffect, useState } from 'react'
import type { ClusterConfig, SystemStatus } from '../types'
import { api } from '../api/client'
import { ErrorState } from '../components/State'
import Spinner from '../components/Spinner'
import Badge from '../components/Badge'
import { BotIcon, DatabaseIcon, MessageIcon, RefreshIcon, ShieldIcon } from '../components/icons'

function StatusRow({ label, good, note }: { label: string; good: boolean; note?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm text-neutral-700">{label}</span>
      <span className="flex items-center gap-2">
        {note && <span className="text-[11px] text-neutral-500">{note}</span>}
        <span className={`flex items-center gap-1.5 text-xs font-medium ${good ? 'text-emerald-600' : 'text-red-600'}`}>
          <span className={`h-2 w-2 rounded-full ${good ? 'bg-emerald-500' : 'bg-red-500'}`} />
          {good ? 'Connected' : 'Not configured'}
        </span>
      </span>
    </div>
  )
}

function MissingKeyCard({
  name,
  envVar,
  help,
  link,
}: {
  name: string
  envVar: string
  help: string
  link?: string
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-3">
      <div>
        <p className="text-xs font-semibold text-brand-700">{name} missing</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-500">{help}</p>
        <code className="mt-1.5 inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-700">
          {envVar}
        </code>
      </div>
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary shrink-0 text-xs"
        >
          Get key ↗
        </a>
      )}
    </div>
  )
}

export default function Settings() {
  const [system, setSystem] = useState<SystemStatus | null>(null)
  const [config, setConfig] = useState<ClusterConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [s, c] = await Promise.all([api.getSystem(), api.getConfig()])
      setSystem(s)
      setConfig(c)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings.')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const run = async (action: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(action)
    setNotice(null)
    try {
      await fn()
      setNotice(success)
      await load()
    } catch (err) {
      setNotice(`Action failed: ${err instanceof Error ? err.message : 'unknown error'}`)
    } finally {
      setBusy(null)
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!system || !config) return <Spinner label="Loading settings…" />

  const ai = system.ai

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Settings</h2>
        <p className="text-xs text-neutral-500">System status, integrations, corroboration parameters and demo controls.</p>
      </div>

      {notice && (
        <p className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-700">{notice}</p>
      )}

      <div className="card p-4">
        <h3 className="card-title flex items-center gap-2">
          <ShieldIcon size={16} className="text-brand-600" />
          System status
        </h3>
        <div className="mt-2 divide-y divide-neutral-200">
          <div className="flex items-center justify-between py-2.5">
            <span className="text-sm text-neutral-700">API · {system.app_name} v{system.version}</span>
            <span className="text-xs text-neutral-500">{system.database}</span>
          </div>
          <StatusRow label="Database connection" good={system.database_connected} />
          <div className="flex items-center justify-between py-2.5">
            <span className="flex items-center gap-2 text-sm text-neutral-700">
              <MessageIcon size={15} className="text-neutral-500" />
              WhatsApp channel
            </span>
            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-medium text-neutral-500">
              Step 3 · endpoint ready
            </span>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="flex items-center gap-2 text-sm text-neutral-700">
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500">SP</span>
              Speech-to-text · faster-whisper (base)
            </span>
            <span className="text-[11px] text-neutral-500">runs on-device</span>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="card-title flex items-center gap-2">
          <BotIcon size={16} className="text-brand-600" />
          AI integrations
        </h3>
        <p className="mt-1 text-xs text-neutral-500">
          Keys live in <code className="rounded bg-neutral-100 px-1">backend/.env</code> and are never exposed to the browser.
          The fallback provider takes over automatically if the primary fails or rate-limits.
        </p>
        <div className="mt-3 divide-y divide-neutral-200">
          <StatusRow
            label="OpenRouter (primary) — incident extraction"
            good={ai?.openrouter_configured ?? false}
            note={ai?.openrouter_model ?? undefined}
          />
          <StatusRow
            label="NVIDIA NIM (fallback)"
            good={ai?.nvidia_configured ?? false}
            note={ai?.nvidia_model ?? undefined}
          />
          <StatusRow
            label="faster-whisper (local speech-to-text)"
            good={ai?.whisper_configured ?? true}
            note="on-device"
          />
        </div>

        {!(ai?.openrouter_configured ?? false) && (
          <div className="mt-3">
            <MissingKeyCard
              name="OPENROUTER_API_KEY"
              envVar="OPENROUTER_API_KEY=sk-or-v1-…"
              help="Primary AI extraction. Free keys at openrouter.ai/keys — reports are still saved without it, just unclassified."
              link="https://openrouter.ai/keys"
            />
          </div>
        )}
        {!(ai?.nvidia_configured ?? false) && (
          <div className="mt-3">
            <MissingKeyCard
              name="NVIDIA_API_KEY"
              envVar="NVIDIA_API_KEY=nvapi-…"
              help="Optional fallback provider. Free credits at build.nvidia.com — keeps AI extraction alive when OpenRouter rate-limits."
              link="https://build.nvidia.com"
            />
          </div>
        )}
        {(ai?.openrouter_configured ?? false) || (ai?.nvidia_configured ?? false) ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-700">
            <Badge label="LIVE" tone="green" />
            AI extraction is active — ingested messages are classified automatically.
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-xs text-brand-700">
            Running in degraded mode: reports are saved, but no AI classification, summary or location extraction.
          </div>
        )}
      </div>

      <div className="card p-4">
        <h3 className="card-title flex items-center gap-2">
          <DatabaseIcon size={16} className="text-brand-600" />
          Corroboration parameters
        </h3>
        <p className="mt-1 text-xs text-neutral-500">
          Same-area, same-time reports are grouped into signals. Priority rises with report volume and severity.
        </p>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <div className="flex justify-between border-b border-neutral-200 pb-2 text-sm">
            <dt className="text-neutral-500">Matching radius</dt>
            <dd className="font-medium text-neutral-900">{config.radius_km} km</dd>
          </div>
          <div className="flex justify-between border-b border-neutral-200 pb-2 text-sm">
            <dt className="text-neutral-500">Time window</dt>
            <dd className="font-medium text-neutral-900">{config.time_window_hours} hours</dd>
          </div>
          <div className="flex justify-between border-b border-neutral-200 pb-2 text-sm">
            <dt className="text-neutral-500">Minimum reports</dt>
            <dd className="font-medium text-neutral-900">{config.min_reports}</dd>
          </div>
          <div className="flex justify-between border-b border-neutral-200 pb-2 text-sm">
            <dt className="text-neutral-500">Active window</dt>
            <dd className="font-medium text-neutral-900">{config.active_hours} hours</dd>
          </div>
        </dl>
        <div className="mt-3 rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-500">
          Nothing is ever marked “confirmed” automatically. Alert status is updated by an operator.
        </div>
      </div>

      <div className="card p-4">
        <h3 className="card-title">Demo controls</h3>
        <p className="mt-1 text-xs text-neutral-500">
          Use the “Live triage” button on the Reports page to run the full AI pipeline: sample text in
          English, French or Pidgin, or a recorded voice note.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={busy !== null}
            onClick={() =>
              run(
                'seed',
                async () => {
                  const r = await api.seedDemo()
                  if (r.skipped) throw new Error('Demo data already exists. Reset first to reseed.')
                },
                'Sample data seeded successfully.',
              )
            }
          >
            {busy === 'seed' ? 'Seeding…' : 'Seed sample data'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy !== null}
            onClick={() => run('recompute', api.recomputeClusters, 'Clusters recomputed.')}
          >
            <RefreshIcon size={14} />
            {busy === 'recompute' ? 'Recomputing…' : 'Recompute clusters'}
          </button>
          <button
            type="button"
            className="btn-danger"
            disabled={busy !== null}
            onClick={() => {
              if (!window.confirm('Delete all reports, clusters and alerts? This cannot be undone.')) return
              run('reset', api.resetDemo, 'All demo data cleared.')
            }}
          >
            {busy === 'reset' ? 'Clearing…' : 'Clear demo data'}
          </button>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="card-title">About</h3>
        <div className="mt-2 space-y-3 text-xs leading-relaxed text-neutral-500">
          <p>
            <strong className="text-neutral-900">Peace-Watch</strong> is a community early-warning platform. Reports are
            intentionally anonymous — no phone numbers or personal identifiers are stored.
          </p>
          <p className="text-neutral-400">Build 0.2.0 · Step 2 (AI incident processing + corroboration).</p>
        </div>
      </div>
    </div>
  )
}
