const TONE_DOTS: Record<string, string> = {
  blue: 'bg-neutral-400',
  green: 'bg-emerald-600',
  amber: 'bg-amber-500',
  red: 'bg-red-600',
  slate: 'bg-neutral-400',
}

export default function Badge({
  label,
  tone,
  dot = false,
}: {
  label: string
  tone: 'blue' | 'green' | 'amber' | 'red' | 'slate'
  dot?: boolean
}) {
  const ring: Record<string, string> = {
    blue: 'bg-neutral-50 text-neutral-700 ring-neutral-300',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    slate: 'bg-neutral-50 text-neutral-500 ring-neutral-200',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${ring[tone]}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOTS[tone]}`} />}
      {label}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: string }) {
  const tone = priority === 'high' ? 'red' : priority === 'medium' ? 'amber' : 'blue'
  return <Badge label={priority} tone={tone} dot />
}
