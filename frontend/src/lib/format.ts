import type { AlertStatus, ReportStatus, ReportType, Severity, Source } from '../types'

export const SOURCE_LABELS: Record<Source, string> = {
  manual: 'Manual',
  text: 'Text message',
  voice: 'Voice note',
  whatsapp: 'WhatsApp',
}

export const LANGUAGE_LABELS: Record<string, string> = {
  auto: 'Auto-detect',
  en: 'English',
  fr: 'French',
  pidgin: 'Cameroonian Pidgin',
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

export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
}

export const PRIORITY_COLORS: Record<string, { fill: string; text: string; dot: string }> = {
  low: { fill: '#2563eb', text: 'text-blue-700', dot: 'bg-blue-600' },
  medium: { fill: '#a57145', text: 'text-brand-700', dot: 'bg-brand-500' },
  high: { fill: '#dc2626', text: 'text-red-600', dot: 'bg-red-600' },
}

/** Map bounding box used for the incident map (demo region). */
export const MAP_BOUNDS = {
  minLat: 5.4,
  maxLat: 6.1,
  minLng: -0.45,
  maxLng: 0.35,
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

export function isToday(value: string): boolean {
  const d = new Date(value.endsWith('Z') ? value : `${value}Z`)
  const now = new Date()
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  )
}