import type { HttpMonitor, PingMonitor, TcpMonitor } from '../../src/check-engine/types.js'

let nextId = 1

export function makeHttpMonitor(overrides: Partial<HttpMonitor> = {}): HttpMonitor {
  return {
    id: nextId++,
    name: 'http monitor',
    type: 'http',
    enabled: true,
    intervalSeconds: 10,
    timeoutMs: 200,
    retries: 0,
    degradedAfterMs: 2000,
    httpUrl: 'http://127.0.0.1:1/',
    httpMethod: 'GET',
    httpExpectedStatus: 200,
    httpBodyContains: null,
    ...overrides,
  }
}

export function makeTcpMonitor(overrides: Partial<TcpMonitor> = {}): TcpMonitor {
  return {
    id: nextId++,
    name: 'tcp monitor',
    type: 'tcp',
    enabled: true,
    intervalSeconds: 10,
    timeoutMs: 200,
    retries: 0,
    degradedAfterMs: 2000,
    host: '127.0.0.1',
    port: 1,
    ...overrides,
  }
}

export function makePingMonitor(overrides: Partial<PingMonitor> = {}): PingMonitor {
  return {
    id: nextId++,
    name: 'ping monitor',
    type: 'ping',
    enabled: true,
    intervalSeconds: 10,
    timeoutMs: 200,
    retries: 0,
    degradedAfterMs: 2000,
    host: '127.0.0.1',
    ...overrides,
  }
}
