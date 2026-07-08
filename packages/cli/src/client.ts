import type { CliConfig } from './config.js'

export interface MonitorResource {
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

export interface AlertChannelResource {
  id: number
  name: string
  type: 'slack' | 'webhook' | 'email'
  config: Record<string, unknown>
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly method: string,
    public readonly path: string,
    body: unknown,
  ) {
    super(`${method} ${path} failed with ${status}: ${JSON.stringify(body)}`)
    this.name = 'ApiError'
  }
}

export class OvercheckClient {
  constructor(private readonly config: CliConfig) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.config.url}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    if (response.status === 204) return undefined as T

    const payload = await response.json().catch(() => undefined)
    if (!response.ok) throw new ApiError(response.status, method, path, payload)
    return payload as T
  }

  listMonitors(): Promise<MonitorResource[]> {
    return this.request('GET', '/api/monitors')
  }

  createMonitor(body: Record<string, unknown>): Promise<MonitorResource> {
    return this.request('POST', '/api/monitors', body)
  }

  updateMonitor(id: number, body: Record<string, unknown>): Promise<MonitorResource> {
    return this.request('PATCH', `/api/monitors/${id}`, body)
  }

  deleteMonitor(id: number): Promise<void> {
    return this.request('DELETE', `/api/monitors/${id}`)
  }

  listAlertChannels(): Promise<AlertChannelResource[]> {
    return this.request('GET', '/api/alert-channels')
  }

  createAlertChannel(body: Record<string, unknown>): Promise<AlertChannelResource> {
    return this.request('POST', '/api/alert-channels', body)
  }

  updateAlertChannel(id: number, body: Record<string, unknown>): Promise<AlertChannelResource> {
    return this.request('PATCH', `/api/alert-channels/${id}`, body)
  }

  deleteAlertChannel(id: number): Promise<void> {
    return this.request('DELETE', `/api/alert-channels/${id}`)
  }

  getMonitorAlertChannels(monitorId: number): Promise<{ alertChannelIds: number[] }> {
    return this.request('GET', `/api/monitors/${monitorId}/alert-channels`)
  }

  putMonitorAlertChannels(
    monitorId: number,
    alertChannelIds: number[],
  ): Promise<{ alertChannelIds: number[] }> {
    return this.request('PUT', `/api/monitors/${monitorId}/alert-channels`, { alertChannelIds })
  }
}
