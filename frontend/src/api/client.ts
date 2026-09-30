import type {
  Alert,
  AlertStatus,
  Cluster,
  ClusterConfig,
  ClusterDetail,
  ClusterPriority,
  IngestInput,
  IngestResult,
  Overview,
  Report,
  ReportInput,
  ReportLocationInput,
  ReclusterResult,
  ReportStatus,
  SystemStatus,
} from '../types'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8001/api'

export class ApiError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  const isForm = typeof FormData !== 'undefined' && init?.body instanceof FormData
  // Only send Content-Type for requests that actually carry a JSON body.
  // Headless GETs (overview, alerts, reports…) then stay "simple requests"
  // and skip the CORS preflight (OPTIONS) round-trip entirely.
  const hasBody = init?.body != null
  const headers = {
    ...(isForm ? {} : hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(init?.headers ?? {}),
  }
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers,
      ...init,
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the API. Is the backend running?')
  }

  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`
    try {
      const body = await response.json()
      if (typeof body?.detail === 'string') detail = body.detail
      else if (Array.isArray(body?.detail)) detail = body.detail.map((d: { msg?: string }) => d.msg ?? 'Invalid input').join('; ')
    } catch {
      /* keep default message */
    }
    throw new ApiError(response.status, detail)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const api = {
  getOverview: () => request<Overview>('/overview'),
  getSystem: () => request<SystemStatus>('/system'),
  getConfig: () => request<ClusterConfig>('/config'),

  getReports: (params: { type?: string; status?: string; cluster_id?: number; limit?: number } = {}) => {
    const q = new URLSearchParams()
    if (params.type) q.set('type', params.type)
    if (params.status) q.set('status', params.status)
    if (params.cluster_id != null) q.set('cluster_id', String(params.cluster_id))
    q.set('limit', String(params.limit ?? 100))
    const qs = q.toString()
    return request<Report[]>(`/reports${qs ? `?${qs}` : ''}`)
  },
  createReport: (body: ReportInput) =>
    request<Report>('/reports', { method: 'POST', body: JSON.stringify(body) }),
  updateReportStatus: (id: number, status: ReportStatus) =>
    request<Report>(`/reports/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteReport: (id: number) => request<void>(`/reports/${id}`, { method: 'DELETE' }),

  getClusters: (params: { active?: boolean; priority?: ClusterPriority } = {}) => {
    const q = new URLSearchParams()
    if (params.active != null) q.set('active', String(params.active))
    if (params.priority) q.set('priority', params.priority)
    const qs = q.toString()
    return request<Cluster[]>(`/clusters${qs ? `?${qs}` : ''}`)
  },
  getCluster: (id: number) => request<ClusterDetail>(`/clusters/${id}`),
  recomputeClusters: () => request<ReclusterResult>('/clusters/recompute', { method: 'POST' }),

  getAlerts: (params: { status?: string; priority?: string } = {}) => {
    const q = new URLSearchParams()
    if (params.status) q.set('status', params.status)
    if (params.priority) q.set('priority', params.priority)
    const qs = q.toString()
    return request<Alert[]>(`/alerts${qs ? `?${qs}` : ''}`)
  },
  updateAlertStatus: (id: number, status: AlertStatus) =>
    request<Alert>(`/alerts/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  ingestText: (body: IngestInput) =>
    request<IngestResult>('/ingest', { method: 'POST', body: JSON.stringify(body) }),
  ingestAudio: (file: Blob, opts: { anonymous_id?: string; sent_at?: string; language?: string; filename?: string } = {}) => {
    const form = new FormData()
    form.append('audio', file, opts.filename ?? 'recording.wav')
    if (opts.anonymous_id) form.append('anonymous_id', opts.anonymous_id)
    if (opts.sent_at) form.append('sent_at', opts.sent_at)
    form.append('language', opts.language ?? 'auto')
    return request<IngestResult>('/ingest/audio', { method: 'POST', body: form })
  },
  updateReportLocation: (id: number, body: ReportLocationInput) =>
    request<Report>(`/reports/${id}/location`, { method: 'PATCH', body: JSON.stringify(body) }),

  seedDemo: (force = false) =>
    request<{ seeded: number; skipped: boolean }>(`/demo/seed?force=${force}`, { method: 'POST' }),
  resetDemo: () =>
    request<{ reports: number; clusters: number; alerts: number }>('/demo/reset', { method: 'POST' }),
}