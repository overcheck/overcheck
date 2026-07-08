export type MonitorType = 'http' | 'tcp' | 'ping' | 'keyword'
export type CheckStatus = 'up' | 'degraded' | 'down'

interface MonitorBase {
  id: number
  name: string
  enabled: boolean
  intervalSeconds: number
  timeoutMs: number
  retries: number
  degradedAfterMs: number
}

export interface HttpMonitor extends MonitorBase {
  type: 'http' | 'keyword'
  httpUrl: string
  httpMethod: string
  httpExpectedStatus: number
  httpBodyContains: string | null
}

export interface TcpMonitor extends MonitorBase {
  type: 'tcp'
  host: string
  port: number
}

export interface PingMonitor extends MonitorBase {
  type: 'ping'
  host: string
}

export type Monitor = HttpMonitor | TcpMonitor | PingMonitor

export interface ExecutorResult {
  ok: boolean
  responseTimeMs: number
  error?: string
}

export type Executor = (monitor: Monitor) => Promise<ExecutorResult>

export interface CheckOutcome {
  status: CheckStatus
  responseTimeMs: number
  errorMessage: string | null
}

export interface StateTransition {
  previousStatus: CheckStatus | null
  newStatus: CheckStatus
  errorMessage: string | null
  downtimeDurationMs: number | null
}
