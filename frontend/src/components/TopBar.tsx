import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import type { SystemStatus } from '../types'
import { api } from '../api/client'
import { PlusIcon } from './icons'

const TITLES: Record<string, string> = {
  '/': 'Overview',
  '/reports': 'Reports',
  '/alerts': 'Alerts',
  '/map': 'Map',
  '/settings': 'Settings',
}

export default function TopBar({
  onNewReport,
}: {
  onNewReport?: () => void
}) {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [online, setOnline] = useState<boolean | null>(null)
  const location = useLocation()

  const load = useCallback(async () => {
    try {
      const s = await api.getSystem()
      setStatus(s)
      setOnline(s.database_connected)
    } catch {
      setOnline(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const title = TITLES[location.pathname] ?? 'Overview'

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">{title}</h1>
        <p className="text-xs text-neutral-500">Command centre · live feed</p>
      </div>

      <div className="flex items-center gap-4">
        <div
          className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
            online === false
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
          title={online === false ? 'API not reachable' : status ? `${status.database} · ${status.app_name} v${status.version}` : 'Checking…'}
        >
          {online === false ? (
            <span className="h-2 w-2 rounded-full bg-red-500" />
          ) : (
            <span className="live-dot"><span className="live-dot-core" /></span>
          )}
          {online === false ? 'API offline' : 'All systems operational'}
        </div>

        {onNewReport && (
          <button type="button" onClick={onNewReport} className="btn-primary">
            <PlusIcon size={15} />
            Demo report
          </button>
        )}

        <div className="flex items-center gap-2.5 border-l border-neutral-200 pl-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
            OP
          </div>
          <div className="hidden sm:block">
            <div className="text-xs font-medium text-neutral-900">Operator</div>
            <div className="text-[11px] text-neutral-500">Command centre</div>
          </div>
        </div>
      </div>
    </header>
  )
}
