import type { AuthUser, UserRole } from '../auth.js'
import type { CheckStatus } from '../check-engine/types.js'
import { STATUS_COLOR, STATUS_LABEL } from '../status-page/aggregation.js'
import { markerShapeFor } from '../status-page/public-data.js'
import type { Window } from '../status-page/public-data.js'
import type {
  ApiAlertChannel,
  ApiMonitor,
  ApiStatusPage,
  DashboardApi,
  StatusPageWriteBody,
} from './client.js'
import { canWrite } from './role-helpers.js'
import { sortMonitorRows, type SortColumn, type SortDirection } from './sorting.js'

const NO_DATA_COLOR = 'oklch(0.9 0.005 250)'

export interface SidebarViewModel {
  displayName: string
  initials: string
  role: UserRole
  activeNav: 'monitors' | 'alert-channels' | 'status-pages'
}

export function buildSidebarViewModel(
  user: AuthUser,
  activeNav: SidebarViewModel['activeNav'],
): SidebarViewModel {
  const localPart = user.email.split('@')[0] ?? user.email
  const displayName = localPart
  const initials = localPart.slice(0, 2).toUpperCase() || '??'
  return { displayName, initials, role: user.role, activeNav }
}

export const MONITOR_TYPES = ['http', 'tcp', 'ping', 'keyword'] as const
export const STATUS_FILTERS = ['all', 'up', 'degraded', 'down'] as const
export type StatusFilter = (typeof STATUS_FILTERS)[number]
export type TypeFilter = 'all' | (typeof MONITOR_TYPES)[number]

export interface MonitorRowViewModel {
  id: number
  name: string
  type: string
  status: CheckStatus | null
  statusColor: string
  markerShape: 'circle' | 'diamond' | 'square' | 'none'
  // Raw values, used by sortMonitorRows (SortableMonitorRow); *Display are the formatted
  // strings html.ts renders.
  uptimePercent: number | null
  responseTimeMs: number | null
  uptimeDisplay: string
  responseDisplay: string
  intervalDisplay: string
  alertChannelNames: string[]
  detailUrl: string
  paused: boolean
}

export interface MonitorsListViewModel {
  sidebar: SidebarViewModel
  canWrite: boolean
  newMonitorUrl?: string
  search: string
  statusFilter: StatusFilter
  typeFilter: TypeFilter
  sortColumn: SortColumn
  sortDirection: SortDirection
  countLabel: string
  rows: MonitorRowViewModel[]
  noResults: boolean
  isFreshWorkspace: boolean
}

export interface MonitorsListQuery {
  search?: string
  status?: string
  type?: string
  sort?: string
  dir?: string
}

function normalizeStatusFilter(value: string | undefined): StatusFilter {
  return (STATUS_FILTERS as readonly string[]).includes(value ?? '')
    ? (value as StatusFilter)
    : 'all'
}

function normalizeTypeFilter(value: string | undefined): TypeFilter {
  return (MONITOR_TYPES as readonly string[]).includes(value ?? '') ? (value as TypeFilter) : 'all'
}

function normalizeSortColumn(value: string | undefined): SortColumn {
  return value === 'type' || value === 'uptime' || value === 'response' ? value : 'name'
}

export async function buildMonitorsListViewModel(
  api: DashboardApi,
  user: AuthUser,
  query: MonitorsListQuery,
): Promise<MonitorsListViewModel> {
  const search = (query.search ?? '').trim()
  const statusFilter = normalizeStatusFilter(query.status)
  const typeFilter = normalizeTypeFilter(query.type)
  const sortColumn = normalizeSortColumn(query.sort)
  const sortDirection: SortDirection = query.dir === 'desc' ? 'desc' : 'asc'

  const [monitorsRes, summaryRes, channelsRes] = await Promise.all([
    api.listMonitors(),
    api.getStatusSummary('24h'),
    api.listAlertChannels(),
  ])
  const monitors = monitorsRes.data
  const summaryByMonitorId = new Map(summaryRes.data.map((s) => [s.monitorId, s]))
  const channelsById = new Map(channelsRes.data.map((c) => [c.id, c]))

  const monitorChannels = await Promise.all(monitors.map((m) => api.getMonitorAlertChannels(m.id)))
  const channelIdsByMonitorId = new Map(
    monitors.map((m, i) => [m.id, monitorChannels[i].data.alertChannelIds]),
  )

  let rows: MonitorRowViewModel[] = monitors.map((m) => {
    const summary = summaryByMonitorId.get(m.id)
    const status = summary?.status ?? null
    const color = status ? STATUS_COLOR[status] : NO_DATA_COLOR
    return {
      id: m.id,
      name: m.name,
      type: m.type,
      status,
      statusColor: color,
      markerShape: markerShapeFor(status),
      uptimePercent: summary?.uptimePercent ?? null,
      responseTimeMs: summary?.responseTimeMs ?? null,
      uptimeDisplay: summary?.uptimePercent == null ? '—' : `${summary.uptimePercent.toFixed(2)}%`,
      responseDisplay:
        status === 'down'
          ? 'timeout'
          : summary?.responseTimeMs == null
            ? '—'
            : `${Math.round(summary.responseTimeMs)}ms`,
      intervalDisplay: `${m.intervalSeconds}s`,
      alertChannelNames: (channelIdsByMonitorId.get(m.id) ?? [])
        .map((id) => channelsById.get(id)?.name)
        .filter((name): name is string => name !== undefined),
      detailUrl: `/dashboard/monitors/${m.id}`,
      paused: !m.enabled,
    }
  })

  if (search) {
    const q = search.toLowerCase()
    rows = rows.filter((r) => r.name.toLowerCase().includes(q))
  }
  if (statusFilter !== 'all') rows = rows.filter((r) => r.status === statusFilter)
  if (typeFilter !== 'all') rows = rows.filter((r) => r.type === typeFilter)

  rows = sortMonitorRows(rows, sortColumn, sortDirection)

  return {
    sidebar: buildSidebarViewModel(user, 'monitors'),
    canWrite: canWrite(user.role),
    newMonitorUrl: canWrite(user.role) ? '/dashboard/monitors/new' : undefined,
    search,
    statusFilter,
    typeFilter,
    sortColumn,
    sortDirection,
    countLabel: `${rows.length} of ${monitors.length}`,
    rows,
    noResults: rows.length === 0,
    isFreshWorkspace: monitors.length === 0,
  }
}

export interface MonitorDetailViewModel {
  sidebar: SidebarViewModel
  canWrite: boolean
  id: number
  name: string
  type: string
  status: CheckStatus | null
  statusLabel: string
  statusColor: string
  markerShape: 'circle' | 'diamond' | 'square' | 'none'
  paused: boolean
  window: Window
  chart: { lineD: string; areaD: string }
  recentChecks: {
    checkedAtDisplay: string
    status: CheckStatus
    statusColor: string
    responseDisplay: string
    error: string
  }[]
  editUrl?: string
  pauseUrl?: string
  resumeUrl?: string
  deleteConfirmUrl?: string
  backUrl: string
}

function formatUtcDateTime(iso: string): string {
  const d = new Date(iso)
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const day = d.getUTCDate()
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  const ss = String(d.getUTCSeconds()).padStart(2, '0')
  return `${month} ${day}, ${hh}:${mm}:${ss} UTC`
}

export async function buildMonitorDetailViewModel(
  api: DashboardApi,
  user: AuthUser,
  monitorId: number,
  window: Window,
): Promise<MonitorDetailViewModel | null> {
  const [monitorRes, checkResultsRes] = await Promise.all([
    api.getMonitor(monitorId),
    api.getCheckResults(monitorId, window),
  ])
  if (!monitorRes.ok) return null
  const monitor = monitorRes.data

  const summaryRes = await api.getStatusSummary(window)
  const status = summaryRes.data.find((s) => s.monitorId === monitorId)?.status ?? null
  const statusColor = status ? STATUS_COLOR[status] : NO_DATA_COLOR
  const statusLabel = status ? STATUS_LABEL[status] : 'No data'

  const write = canWrite(user.role)
  return {
    sidebar: buildSidebarViewModel(user, 'monitors'),
    canWrite: write,
    id: monitor.id,
    name: monitor.name,
    type: monitor.type,
    status,
    statusLabel,
    statusColor,
    markerShape: markerShapeFor(status),
    paused: !monitor.enabled,
    window,
    chart: checkResultsRes.data.chart,
    recentChecks: checkResultsRes.data.recentChecks.map((c) => ({
      checkedAtDisplay: formatUtcDateTime(c.checkedAt),
      status: c.status,
      statusColor: STATUS_COLOR[c.status],
      responseDisplay: c.responseTimeMs == null ? 'timeout' : `${Math.round(c.responseTimeMs)}ms`,
      error: c.errorMessage ?? '',
    })),
    editUrl: write ? `/dashboard/monitors/${monitor.id}/edit` : undefined,
    pauseUrl: write && monitor.enabled ? `/dashboard/monitors/${monitor.id}/pause` : undefined,
    resumeUrl: write && !monitor.enabled ? `/dashboard/monitors/${monitor.id}/resume` : undefined,
    deleteConfirmUrl: write ? `/dashboard/monitors/${monitor.id}/delete/confirm` : undefined,
    backUrl: '/dashboard/monitors',
  }
}

export interface MonitorFormFieldValues {
  name: string
  type: 'http' | 'tcp' | 'ping' | 'keyword'
  url: string
  host: string
  port: string
  keyword: string
  intervalSeconds: string
  timeoutSeconds: string
  retries: string
  degradedAfterMs: string
  alertChannelIds: number[]
}

export interface MonitorFormViewModel {
  sidebar: SidebarViewModel
  headerLabel: string
  actionUrl: string
  formGetUrl: string
  isEdit: boolean
  values: MonitorFormFieldValues
  errors: { name?: string; url?: string; host?: string }
  allChannels: ApiAlertChannel[]
  backUrl: string
}

export const DEFAULT_MONITOR_FORM_VALUES: MonitorFormFieldValues = {
  name: '',
  type: 'http',
  url: '',
  host: '',
  port: '',
  keyword: '',
  intervalSeconds: '60',
  timeoutSeconds: '10',
  retries: '2',
  degradedAfterMs: '500',
  alertChannelIds: [],
}

export function monitorToFormValues(monitor: ApiMonitor): MonitorFormFieldValues {
  return {
    name: monitor.name,
    type: monitor.type,
    url: monitor.httpUrl ?? '',
    host: monitor.host ?? '',
    port: monitor.port ? String(monitor.port) : '',
    keyword: monitor.httpBodyContains ?? '',
    intervalSeconds: String(monitor.intervalSeconds),
    timeoutSeconds: String(Math.round(monitor.timeoutMs / 1000)),
    retries: String(monitor.retries),
    degradedAfterMs: String(monitor.degradedAfterMs),
    alertChannelIds: [],
  }
}

export interface AlertChannelRowViewModel {
  id: number
  name: string
  type: string
  monitorsText: string
  editUrl: string
  testUrl?: string
}

export interface AlertChannelsListViewModel {
  sidebar: SidebarViewModel
  canWrite: boolean
  newChannelUrl?: string
  rows: AlertChannelRowViewModel[]
  flash?: string
}

export async function buildAlertChannelsListViewModel(
  api: DashboardApi,
  user: AuthUser,
  flash?: string,
): Promise<AlertChannelsListViewModel> {
  const [channelsRes, monitorsRes] = await Promise.all([
    api.listAlertChannels(),
    api.listMonitors(),
  ])
  const monitors = monitorsRes.data
  const monitorChannels = await Promise.all(monitors.map((m) => api.getMonitorAlertChannels(m.id)))

  const monitorNamesByChannelId = new Map<number, string[]>()
  monitors.forEach((m, i) => {
    for (const channelId of monitorChannels[i].data.alertChannelIds) {
      const existing = monitorNamesByChannelId.get(channelId) ?? []
      existing.push(m.name)
      monitorNamesByChannelId.set(channelId, existing)
    }
  })

  const write = canWrite(user.role)
  return {
    sidebar: buildSidebarViewModel(user, 'alert-channels'),
    canWrite: write,
    newChannelUrl: write ? '/dashboard/alert-channels/new' : undefined,
    rows: channelsRes.data.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      monitorsText: (monitorNamesByChannelId.get(c.id) ?? []).join(', ') || '—',
      editUrl: `/dashboard/alert-channels/${c.id}/edit`,
      testUrl: write ? `/dashboard/alert-channels/${c.id}/test` : undefined,
    })),
    flash,
  }
}

export interface AlertChannelFormFieldValues {
  name: string
  type: 'slack' | 'webhook' | 'email'
  target: string
}

export interface AlertChannelFormViewModel {
  sidebar: SidebarViewModel
  headerLabel: string
  actionUrl: string
  formGetUrl: string
  isEdit: boolean
  values: AlertChannelFormFieldValues
  errors: { name?: string; target?: string }
  targetLabel: string
  targetPlaceholder: string
  backUrl: string
}

export const DEFAULT_ALERT_CHANNEL_FORM_VALUES: AlertChannelFormFieldValues = {
  name: '',
  type: 'slack',
  target: '',
}

// Must match the config field names each sender in alerting/senders/*.ts actually reads
// (see alerting/types.ts: SlackChannelConfig.webhookUrl, WebhookChannelConfig.url,
// EmailChannelConfig.to) — this is the only place the dashboard writes `config` from a form.
const TARGET_CONFIG_KEY: Record<AlertChannelFormFieldValues['type'], string> = {
  slack: 'webhookUrl',
  webhook: 'url',
  email: 'to',
}

export const TARGET_FIELD_META: Record<
  AlertChannelFormFieldValues['type'],
  { label: string; placeholder: string }
> = {
  slack: { label: 'Webhook URL', placeholder: 'https://hooks.slack.com/…' },
  email: { label: 'Email address', placeholder: 'ops@company.com' },
  webhook: { label: 'Webhook URL', placeholder: 'https://…' },
}

export function alertChannelToFormValues(channel: ApiAlertChannel): AlertChannelFormFieldValues {
  const key = TARGET_CONFIG_KEY[channel.type]
  const target = typeof channel.config[key] === 'string' ? (channel.config[key] as string) : ''
  return { name: channel.name, type: channel.type, target }
}

export function alertChannelFormValuesToConfig(
  values: AlertChannelFormFieldValues,
): Record<string, unknown> {
  return { [TARGET_CONFIG_KEY[values.type]]: values.target }
}

export interface StatusPageRowViewModel {
  id: number
  name: string
  slug: string
  monitorCount: number
  publicUrl: string
  editUrl?: string
  deleteConfirmUrl?: string
}

export interface StatusPagesListViewModel {
  sidebar: SidebarViewModel
  canWrite: boolean
  newStatusPageUrl?: string
  rows: StatusPageRowViewModel[]
  isFreshWorkspace: boolean
}

export async function buildStatusPagesListViewModel(
  api: DashboardApi,
  user: AuthUser,
): Promise<StatusPagesListViewModel> {
  const res = await api.listStatusPages()
  const pages = res.data
  const write = canWrite(user.role)

  return {
    sidebar: buildSidebarViewModel(user, 'status-pages'),
    canWrite: write,
    newStatusPageUrl: write ? '/dashboard/status-pages/new' : undefined,
    rows: pages.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      monitorCount: p.monitors.length,
      publicUrl: `/status/${p.slug}`,
      editUrl: write ? `/dashboard/status-pages/${p.id}/edit` : undefined,
      deleteConfirmUrl: write ? `/dashboard/status-pages/${p.id}/delete/confirm` : undefined,
    })),
    isFreshWorkspace: pages.length === 0,
  }
}

export interface StatusPageFormFieldValues {
  name: string
  slug: string
  logoUrl: string
  accentColor: string
  monitorIds: number[]
  groupNames: Record<number, string>
}

export interface StatusPageFormViewModel {
  sidebar: SidebarViewModel
  headerLabel: string
  actionUrl: string
  isEdit: boolean
  values: StatusPageFormFieldValues
  errors: { name?: string; slug?: string }
  allMonitors: { id: number; name: string }[]
  backUrl: string
}

export const DEFAULT_STATUS_PAGE_FORM_VALUES: StatusPageFormFieldValues = {
  name: '',
  slug: '',
  logoUrl: '',
  accentColor: '',
  monitorIds: [],
  groupNames: {},
}

export function statusPageToFormValues(page: ApiStatusPage): StatusPageFormFieldValues {
  return {
    name: page.name,
    slug: page.slug,
    logoUrl: page.logoUrl ?? '',
    accentColor: page.accentColor,
    monitorIds: page.monitors.map((m) => m.monitorId),
    groupNames: Object.fromEntries(page.monitors.map((m) => [m.monitorId, m.groupName ?? ''])),
  }
}

export function statusPageFormValuesToWriteBody(
  values: StatusPageFormFieldValues,
): StatusPageWriteBody {
  return {
    name: values.name.trim(),
    slug: values.slug.trim(),
    ...(values.logoUrl.trim() && { logoUrl: values.logoUrl.trim() }),
    ...(values.accentColor.trim() && { accentColor: values.accentColor.trim() }),
    monitors: values.monitorIds.map((monitorId) => {
      const groupName = values.groupNames[monitorId]?.trim()
      return groupName ? { monitorId, groupName } : { monitorId }
    }),
  }
}
