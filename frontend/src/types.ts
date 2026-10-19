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
export type Source = 'manual' | 'text' | 'voice' | 'whatsapp'
export type QuarterHeadStatus = 'pending' | 'verified' | 'rejected'

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
  details: Record<string, unknown> | null
  location_name: string | null
  source: Source
  ai_processed: boolean
  ai_error: string | null
  detected_language: string | null
  anonymous_id_sha256: string | null
}

export interface ReportInput {
  type: ReportType
  severity: Severity
  description: string
  latitude: number | null
  longitude: number | null
}

export interface ReportLocationInput {
  latitude: number
  longitude: number
}

export interface QuarterHead {
  id: number
  name: string
  wa_number_masked: string
  quarter_name: string
  city: string | null
  latitude: number | null
  longitude: number | null
  has_id_document: boolean
  notes: string | null
  status: QuarterHeadStatus
  created_at: string
  verified_at: string | null
}

export interface QuarterHeadInput {
  name: string
  wa_number: string
  quarter_name: string
  city?: string | null
  notes?: string | null
}
