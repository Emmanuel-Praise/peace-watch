import { AlertTriangleIcon, InfoIcon } from './icons'

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
        <InfoIcon size={18} />
      </div>
      <p className="text-sm font-medium text-neutral-700">{title}</p>
      {hint && <p className="max-w-sm text-xs text-neutral-500">{hint}</p>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
        <AlertTriangleIcon size={18} />
      </div>
      <div>
        <p className="text-sm font-medium text-neutral-700">Something went wrong</p>
        <p className="mt-1 max-w-sm text-xs text-neutral-500">{message}</p>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary">
          Try again
        </button>
      )}
    </div>
  )
}
