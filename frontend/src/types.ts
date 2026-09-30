export type ReportType =
  | 'robbery'
  | 'theft'
  | 'vandalism'
  | 'fire'
  | 'flood'
  | 'suspicious_activity'
  | 'medical_emergency'
  | 'violence'
  | 'other'

export type Severity = 'low' | 'medium' | 'high'
export type ReportStatus = 'pending' | 'under_review' | 'verified' | 'dismissed'
export type ClusterPriority = 'low' | 'medium' | 'high'
export type ClusterStatus = 'active' | 'monitoring'
export type AlertStatus = 'new' | 'acknowledged' | 'resolved'
export type Source = 'manual' | 'text' | 'voice' | 'whatsapp'

export interface ReportDetails {
  people?: number | null
  vehicles?: string[]
  weapons?: string[]
  activity?: string
  injuries?: string
  property_damage?: string
  emergency_services?: string[]
  notes?: string
}

export interface Report {
  id: number
  type: ReportType
  severity: Severity
  priority: string
  description: string
  latitude: number | null
  longitude: number | null
  status: ReportStatus
  occurred_at: string
  created_at: string
  cluster_id: number | null
  transcript: string | null
  ai_summary: string | null
  details: ReportDetails | null
  location_name: string | null
  source: Source
  ai_processed: boolean
  ai_error: string | null
  detected_language: string | null
  anonymous_id_sha256: string | null
}

export interface Cluster {
  id: number
  priority: ClusterPriority
  status: ClusterStatus
  center_lat: number
  center_lng: number
  radius_km: number
  report_count: number
  independent_report_count: number
  created_at: string
  updated_at: string
  last_report_at: string
  types: ReportType[]
}

export interface ClusterDetail extends Cluster {
  reports: Report[]
}

export interface Alert {
  id: number
  cluster_id: number
  priority: ClusterPriority
  title: string
  message: string
  status: AlertStatus
  channel: string
  created_at: string
  acknowledged_at: string | null
  resolved_at: string | null
  cluster_lat: number
  cluster_lng: number
}

export interface OverviewStats {
  active_signals: number
  reports_today: number
  high_risk_signals: number
  pending_verification: number
  total_reports: number
}

export interface Overview {
  stats: OverviewStats
  recent_reports: Report[]
  recent_alerts: Alert[]
  clusters: Cluster[]
}

export interface AIStatus {
  openrouter_configured: boolean
  openrouter_model: string | null
  nvidia_configured: boolean
  nvidia_model: string | null
  whisper_configured: boolean
}

export interface SystemStatus {
  app_name: string
  version: string
  database: string
  database_connected: boolean
  whatsapp_connected: boolean
  whatsapp_status: string
  ai?: AIStatus
}

export interface ClusterConfig {
  radius_km: number
  time_window_hours: number
  min_reports: number
  active_hours: number
}

export interface ReportInput {
  type: ReportType
  severity: Severity
  description: string
  latitude: number
  longitude: number
  occurred_at?: string
}

export interface ReclusterResult {
  clusters: number
  reports_assigned: number
  created_alerts: number
}

export interface IngestOutcome {
  processed: boolean
  model: string | null
  error: string | null
}

export interface ClusterRef {
  id: number | null
  priority: ClusterPriority | null
  independent_report_count: number | null
  report_count: number | null
}

export interface IngestResult {
  report: Report
  ai: IngestOutcome
  cluster: ClusterRef | null
  source: Source
  message: string
}

export interface IngestInput {
  text: string
  anonymous_id?: string
  sent_at?: string
  language?: 'auto' | 'en' | 'fr' | 'pidgin'
}

export interface ReportLocationInput {
  latitude: number
  longitude: number
}