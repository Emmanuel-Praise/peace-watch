import type {
  QuarterHead,
  QuarterHeadInput,
  QuarterHeadStatus,
  Report,
  ReportInput,
  ReportLocationInput,
  ReportStatus,
} from '../types'

// Always talk to the hosted backend. No local fallback: if this env var is
// missing (e.g. a misconfigured build) we fail loudly instead of silently
// reading/writing a local development database.
const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://peace-watch-backend.onrender.com/api'

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
  // Only send Content-Type for requests that actually carry a JSON body.
  // Headless GETs (reports, quarter heads…) then stay "simple requests"
  // and skip the CORS preflight (OPTIONS) round-trip entirely.
  const hasBody = init?.body != null
  const headers = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
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
  getReports: (params: { type?: string; status?: string; limit?: number } = {}) => {
    const q = new URLSearchParams()
    if (params.type) q.set('type', params.type)
    if (params.status) q.set('status', params.status)
    q.set('limit', String(params.limit ?? 100))
    const qs = q.toString()
    return request<Report[]>(`/reports${qs ? `?${qs}` : ''}`)
  },
  createReport: (body: ReportInput) =>
    request<Report>('/reports', { method: 'POST', body: JSON.stringify(body) }),
  updateReportStatus: (id: number, status: ReportStatus) =>
    request<Report>(`/reports/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteReport: (id: number) => request<void>(`/reports/${id}`, { method: 'DELETE' }),
  updateReportLocation: (id: number, body: ReportLocationInput) =>
    request<Report>(`/reports/${id}/location`, { method: 'PATCH', body: JSON.stringify(body) }),

  /** Verified quarter heads whose area matches this report (routing preview). */
  getMatchingHeads: (reportId: number) =>
    request<QuarterHead[]>(`/reports/${reportId}/matching-heads`),

  getQuarterHeads: (status?: QuarterHeadStatus) =>
    request<QuarterHead[]>(`/quarter-heads${status ? `?status=${status}` : ''}`),
  registerQuarterHead: (body: QuarterHeadInput) =>
    request<QuarterHead>('/quarter-heads', { method: 'POST', body: JSON.stringify(body) }),
  setQuarterHeadStatus: (id: number, status: QuarterHeadStatus) =>
    request<QuarterHead>(`/quarter-heads/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
}
