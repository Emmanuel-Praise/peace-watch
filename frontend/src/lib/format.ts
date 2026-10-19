import type { QuarterHeadStatus, ReportStatus, ReportType, Severity, Source } from '../types'

export const SOURCE_LABELS: Record<Source, string> = {
  manual: 'Dashboard',
  text: 'SMS',
  voice: 'Voice note',
  whatsapp: 'WhatsApp',
}

export function sourceLabel(source: string): string {
  return (
    SOURCE_LABELS[source as Source] ??
    ({ whatsapp_voice: 'WhatsApp · voice' }[source] ??
      source
        .split('_')
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(' '))
  )
}

export const QH_STATUS_LABELS: Record<QuarterHeadStatus, string> = {
  pending: 'Pending',
  verified: 'Verified',
  rejected: 'Rejected',
}

export function formatCoords(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null) return 'No location'
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
}

export const TYPE_LABELS: Record<ReportType, string> = {
  robbery: 'Robbery',
  theft: 'Theft',
  vandalism: 'Vandalism',
  fire: 'Fire',
  flood: 'Flood',
  suspicious_activity: 'Suspicious activity',
  medical_emergency: 'Medical emergency',
  violence: 'Violence',
  other: 'Other',
}

export const SEVERITY_LABELS: Record<Severity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  pending: 'Pending',
  under_review: 'Under review',
  verified: 'Verified',
  dismissed: 'Dismissed',
}

export function formatDateTime(value: string): string {
  const d = new Date(value.endsWith('Z') ? value : `${value}Z`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function relativeTime(value: string): string {
  const d = new Date(value.endsWith('Z') ? value : `${value}Z`)
  if (Number.isNaN(d.getTime())) return value
  const diffMs = Date.now() - d.getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}
