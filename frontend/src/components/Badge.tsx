export default function Badge({
  label,
  tone,
}: {
  label: string
  tone: 'blue' | 'green' | 'amber' | 'red' | 'slate'
}) {
  const tones: Record<string, string> = {
    blue: 'bg-neutral-100 text-neutral-700 ring-neutral-300',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    amber: 'bg-brand-50 text-brand-700 ring-brand-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    slate: 'bg-neutral-50 text-neutral-500 ring-neutral-200',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {label}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: string }) {
  const tone = priority === 'high' ? 'red' : priority === 'medium' ? 'amber' : 'blue'
  return <Badge label={priority.toUpperCase()} tone={tone} />
}
