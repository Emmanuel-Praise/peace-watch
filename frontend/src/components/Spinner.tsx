export default function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-brand-400" />
      <span className="text-sm text-neutral-500">{label}</span>
    </div>
  )
}
