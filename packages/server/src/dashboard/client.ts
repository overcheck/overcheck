import type { FastifyInstance } from 'fastify'
import type { UserRole } from '../auth.js'
import type { Window } from '../status-page/public-data.js'

export interface ApiMonitor {
  id: number
  name: string
  type: 'http' | 'tcp' | 'ping' | 'keyword'
  enabled: boolean
  intervalSeconds: number
  timeoutMs: number
  retries: number
  degradedAfterMs: number
  httpUrl: string | null
  httpMethod: string
  httpExpectedStatus: number
  httpBodyContains: string | null
  host: string | null
  port: number | null
  createdAt: string
  updatedAt: string
}

export interface MonitorStatusSummary {
  monitorId: number
  status: 'up' | 'degraded' | 'down' | null
  uptimePercent: number | null
  responseTimeMs: number | null
}

export interface MonitorCheckResults {
  chart: { lineD: string; areaD: string }
  recentChecks: {
    checkedAt: string
    status: 'up' | 'degraded' | 'down'
    responseTimeMs: number | null
    errorMessage: string | null
  }[]
}

export interface ApiAlertChannel {
  id: number
  name: string
  type: 'slack' | 'webhook' | 'email'
  config: Record<string, unknown>
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface MonitorWriteBody {
  name: string
  type: 'http' | 'tcp' | 'ping' | 'keyword'
  intervalSeconds: number
  timeoutMs?: number
  retries?: number
  degradedAfterMs?: number
  httpUrl?: string
  httpBodyContains?: string
  host?: string
  port?: number
  enabled?: boolean
}

export interface AlertChannelWriteBody {
  name: string
  type: 'slack' | 'webhook' | 'email'
  config: Record<string, unknown>
  enabled?: boolean
}

export interface ApiResult<T> {
  ok: boolean
  status: number
  data: T
}

/**
 * The only place dashboard code talks to the API surface. Every read and write the
 * dashboard needs is issued via Fastify's in-process `app.inject()` against the real
 * `/api/...` routes, carrying the same bearer token backing the user's session cookie — so
 * every dashboard action literally goes through the existing `requireRole()`, validation,
 * and error handling instead of duplicating it.
 */
export function dashboardApi(app: FastifyInstance, token: string) {
  const authHeader = { authorization: `Bearer ${token}` }

  async function call<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    payload?: object,
  ): Promise<ApiResult<T>> {
    const response = await app.inject({
      method,
      url,
      headers: authHeader,
      payload: payload as Record<string, unknown> | undefined,
    })
    const data = response.body ? (JSON.parse(response.body) as T) : (undefined as T)
    return {
      ok: response.statusCode >= 200 && response.statusCode < 300,
      status: response.statusCode,
      data,
    }
  }

  return {
    listMonitors: () => call<ApiMonitor[]>('GET', '/api/monitors'),
    getMonitor: (id: number) => call<ApiMonitor>('GET', `/api/monitors/${id}`),
    getStatusSummary: (window: Window) =>
      call<MonitorStatusSummary[]>('GET', `/api/monitors/status-summary?window=${window}`),
    getCheckResults: (id: number, window: Window) =>
      call<MonitorCheckResults>('GET', `/api/monitors/${id}/check-results?window=${window}`),
    createMonitor: (body: MonitorWriteBody) => call<ApiMonitor>('POST', '/api/monitors', body),
    updateMonitor: (id: number, body: Partial<MonitorWriteBody>) =>
      call<ApiMonitor>('PATCH', `/api/monitors/${id}`, body),
    deleteMonitor: (id: number) => call<undefined>('DELETE', `/api/monitors/${id}`),
    getMonitorAlertChannels: (id: number) =>
      call<{ alertChannelIds: number[] }>('GET', `/api/monitors/${id}/alert-channels`),
    putMonitorAlertChannels: (id: number, alertChannelIds: number[]) =>
      call<{ alertChannelIds: number[] }>('PUT', `/api/monitors/${id}/alert-channels`, {
        alertChannelIds,
      }),
    listAlertChannels: () => call<ApiAlertChannel[]>('GET', '/api/alert-channels'),
    getAlertChannel: (id: number) => call<ApiAlertChannel>('GET', `/api/alert-channels/${id}`),
    createAlertChannel: (body: AlertChannelWriteBody) =>
      call<ApiAlertChannel>('POST', '/api/alert-channels', body),
    updateAlertChannel: (id: number, body: Partial<AlertChannelWriteBody>) =>
      call<ApiAlertChannel>('PATCH', `/api/alert-channels/${id}`, body),
    deleteAlertChannel: (id: number) => call<undefined>('DELETE', `/api/alert-channels/${id}`),
    testAlertChannel: (id: number) =>
      call<{ success: boolean; error?: string }>('POST', `/api/alert-channels/${id}/test`),
  }
}

export type DashboardApi = ReturnType<typeof dashboardApi>
export type { UserRole }
