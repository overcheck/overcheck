import { MONITOR_TYPES, STATUS_FILTERS } from './view-models.js'
import type {
  AlertChannelFormViewModel,
  AlertChannelsListViewModel,
  MonitorDetailViewModel,
  MonitorFormViewModel,
  MonitorRowViewModel,
  MonitorsListViewModel,
  SidebarViewModel,
  StatusFilter,
  StatusPageFormViewModel,
  StatusPageRowViewModel,
  StatusPagesListViewModel,
  TypeFilter,
} from './view-models.js'

/** Escapes user-controlled text before interpolation into an HTML string — this module
 * never uses a templating engine's auto-escaping, so every dynamic string must pass
 * through here (mirrors status-page/html.ts's escapeHtml, kept local so the dashboard has
 * no dependency on the status-page module for an unrelated reason). */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#039;'
    }
  })
}

function markerStyle(
  shape: 'circle' | 'diamond' | 'square' | 'none',
  color: string,
  size: number,
): string {
  const base = `width:${size}px;height:${size}px;flex:none;background:${color}`
  if (shape === 'diamond') return `${base};border-radius:20%;transform:rotate(45deg)`
  if (shape === 'square') return `${base};border-radius:3px`
  if (shape === 'none') return `${base};border-radius:50%;opacity:0.3`
  return `${base};border-radius:50%`
}

const STYLE = `
  * { box-sizing:border-box; }
  body { margin:0; background:oklch(0.16 0.006 250); font-family:'IBM Plex Sans', system-ui, sans-serif; color:oklch(0.9 0.005 250); }
  a { color:inherit; }
  .app { display:flex; height:100vh; width:100%; }
  .sidebar { width:208px; flex:none; background:oklch(0.13 0.006 250); border-right:1px solid oklch(0.26 0.006 250);
    display:flex; flex-direction:column; padding:16px 12px; }
  .brand { display:flex; align-items:center; gap:8px; padding:6px 8px 20px; }
  .brand-mark { width:20px; height:20px; border-radius:5px; background:oklch(0.55 0.16 250); flex:none; }
  .brand-name { font-weight:600; font-size:14px; letter-spacing:.01em; }
  .nav-item { display:flex; align-items:center; gap:9px; padding:8px 10px; border-radius:6px; text-decoration:none;
    font-size:13px; font-weight:500; margin-bottom:2px; }
  .nav-item.active { background:oklch(0.55 0.16 250 / 0.15); color:oklch(0.78 0.1 250); }
  .nav-item:not(.active) { color:oklch(0.65 0.01 250); }
  .nav-icon { width:14px; text-align:center; font-family:'IBM Plex Mono', monospace; font-size:12px; }
  .account { margin-top:auto; padding:10px; border-top:1px solid oklch(0.24 0.006 250); }
  .account-label { font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:oklch(0.5 0.01 250); margin-bottom:6px; }
  .account-row { display:flex; align-items:center; gap:8px; }
  .avatar { width:22px; height:22px; border-radius:50%; background:oklch(0.4 0.03 250); display:flex; align-items:center;
    justify-content:center; font-size:10px; font-weight:600; color:oklch(0.85 0.01 250); flex:none; }
  .account-name { font-size:12.5px; font-weight:500; }
  .account-role { font-size:10.5px; color:oklch(0.55 0.01 250); text-transform:capitalize; font-family:'IBM Plex Mono', monospace; }
  .logout-form { margin-top:8px; }
  .logout-btn { background:transparent; border:none; color:oklch(0.5 0.01 250); font:500 10.5px 'IBM Plex Sans', sans-serif;
    cursor:pointer; padding:0; text-decoration:underline; }
  .main { flex:1; min-width:0; display:flex; flex-direction:column; overflow:hidden; }
  .header { flex:none; border-bottom:1px solid oklch(0.24 0.006 250); }
  .header-row { display:flex; align-items:center; gap:14px; }
  .page-title { font-size:16px; font-weight:600; }
  .count-label { font-size:11.5px; color:oklch(0.55 0.01 250); font-family:'IBM Plex Mono', monospace; }
  .btn-primary { background:oklch(0.55 0.16 250); border:none; color:#fff; font:600 12.5px 'IBM Plex Sans', sans-serif;
    padding:7px 14px; border-radius:6px; cursor:pointer; text-decoration:none; display:inline-block; white-space:nowrap; }
  .btn-neutral { background:oklch(0.22 0.006 250); border:1px solid oklch(0.3 0.006 250); color:oklch(0.85 0.01 250);
    font:500 12px 'IBM Plex Sans', sans-serif; padding:6px 12px; border-radius:6px; cursor:pointer; text-decoration:none; display:inline-block; }
  .btn-danger { background:transparent; border:1px solid oklch(0.4 0.16 25); color:oklch(0.62 0.18 25);
    font:500 12px 'IBM Plex Sans', sans-serif; padding:6px 12px; border-radius:6px; cursor:pointer; text-decoration:none; display:inline-block; }
  .search-input { background:oklch(0.19 0.006 250); border:1px solid oklch(0.28 0.006 250); color:oklch(0.9 0.005 250);
    font:12.5px 'IBM Plex Sans', sans-serif; padding:6px 10px; border-radius:6px; width:200px; outline:none; }
  .pill { border:1px solid oklch(0.3 0.006 250); background:transparent; color:oklch(0.65 0.01 250);
    font:500 11.5px 'IBM Plex Mono', monospace; padding:5px 10px; border-radius:5px; cursor:pointer; white-space:nowrap;
    text-decoration:none; display:inline-block; }
  .pill.active { border-color:oklch(0.55 0.16 250); background:oklch(0.55 0.16 250 / 0.15); color:oklch(0.75 0.1 250); }
  .divider-v { width:1px; height:20px; background:oklch(0.26 0.006 250); margin:0 2px; }
  .filters { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .scroll { flex:1; overflow-y:auto; }
  table.data { width:100%; border-collapse:collapse; font-size:12.5px; }
  table.data th { text-align:left; font-size:10.5px; font-weight:600; text-transform:uppercase; letter-spacing:.05em;
    color:oklch(0.5 0.01 250); border-bottom:1px solid oklch(0.24 0.006 250); padding:9px 8px; }
  table.data th a { text-decoration:none; }
  table.data td { padding:9px 8px; border-bottom:1px solid oklch(0.21 0.006 250); vertical-align:middle; }
  table.data tr.row-link:hover { background:oklch(0.19 0.006 250); }
  .mono { font-family:'IBM Plex Mono', monospace; }
  .type-badge { text-transform:uppercase; font-size:10.5px; color:oklch(0.6 0.01 250); }
  .chip { font-size:10px; background:oklch(0.22 0.006 250); border:1px solid oklch(0.3 0.006 250); color:oklch(0.65 0.01 250);
    padding:2px 6px; border-radius:4px; margin:0 4px 4px 0; display:inline-block; }
  .empty { padding:32px 8px; color:oklch(0.5 0.01 250); font-size:12.5px; }
  .paused-row { opacity:0.5; }
  .paused-badge { font-size:9.5px; text-transform:uppercase; letter-spacing:.04em; color:oklch(0.55 0.01 250);
    border:1px solid oklch(0.3 0.006 250); border-radius:3px; padding:1px 5px; margin-left:6px; }
  .back-link { font-size:11.5px; color:oklch(0.55 0.01 250); text-decoration:none; display:inline-block; margin-bottom:12px; }
  .detail-title-row { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
  .detail-name { font-size:17px; font-weight:600; white-space:nowrap; }
  .status-label { font-size:12px; font-weight:600; }
  .section-label { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.05em; color:oklch(0.5 0.01 250); }
  .segmented { display:flex; background:oklch(0.2 0.006 250); border-radius:6px; padding:2px; gap:2px; }
  .segmented a, .segmented button { border:none; background:transparent; color:oklch(0.65 0.01 250); font:500 11px 'IBM Plex Mono', monospace;
    padding:5px 10px; border-radius:5px; cursor:pointer; text-decoration:none; }
  .segmented a.active, .segmented button.active { background:oklch(0.55 0.16 250); color:#fff; }
  .chart-card { background:oklch(0.19 0.006 250); border:1px solid oklch(0.27 0.006 250); border-radius:8px; padding:14px 16px; margin-bottom:22px; }
  .form-body { max-width:560px; }
  .callout { background:oklch(0.19 0.006 250); border:1px solid oklch(0.27 0.006 250); border-radius:8px; padding:8px 12px;
    margin-bottom:18px; font-size:11.5px; color:oklch(0.6 0.01 250); font-family:'IBM Plex Mono', monospace; }
  .field { margin-bottom:16px; }
  .field-label { font-size:11.5px; font-weight:600; color:oklch(0.65 0.01 250); margin-bottom:6px; display:block; }
  .field input, .field select { width:100%; background:oklch(0.2 0.006 250); border:1px solid oklch(0.3 0.006 250);
    color:oklch(0.9 0.005 250); font:13px 'IBM Plex Sans', sans-serif; padding:8px 10px; border-radius:6px; outline:none; }
  .field.mono input { font-family:'IBM Plex Mono', monospace; }
  .field-error { font-size:11px; color:oklch(0.62 0.18 25); margin-top:4px; }
  .field-row { display:flex; gap:10px; }
  .field-row-2 { display:flex; gap:10px; }
  .field-row-2 > .field { flex:1; }
  .grid-2x2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; }
  .toggle-pills { display:flex; gap:6px; flex-wrap:wrap; }
  .toggle-pill { border:1px solid oklch(0.3 0.006 250); background:transparent; color:oklch(0.65 0.01 250);
    font:500 12px 'IBM Plex Sans', sans-serif; padding:6px 12px; border-radius:16px; cursor:pointer; text-decoration:none; display:inline-block; }
  .toggle-pill.active { border-color:oklch(0.55 0.16 250); background:oklch(0.55 0.16 250 / 0.15); color:oklch(0.75 0.1 250); }
  .actions-row { display:flex; gap:10px; }
  .flash { background:oklch(0.19 0.006 250); border:1px solid oklch(0.27 0.006 250); border-radius:8px; padding:8px 12px;
    margin:0 26px 12px; font-size:11.5px; color:oklch(0.8 0.01 250); }
  .confirm-card { max-width:420px; margin:64px auto; background:oklch(0.19 0.006 250); border:1px solid oklch(0.27 0.006 250);
    border-radius:8px; padding:24px; text-align:center; }
`

function headTags(title: string): string {
  return `<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} — Overcheck</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
<style>${STYLE}</style>`
}

function renderSidebar(sidebar: SidebarViewModel): string {
  const navItem = (
    key: SidebarViewModel['activeNav'],
    href: string,
    icon: string,
    label: string,
  ): string =>
    `<a class="nav-item ${sidebar.activeNav === key ? 'active' : ''}" href="${href}"><span class="nav-icon">${icon}</span>${label}</a>`
  return `
    <div class="sidebar">
      <div class="brand"><div class="brand-mark"></div><div class="brand-name">Overcheck</div></div>
      ${navItem('monitors', '/dashboard/monitors', '&#9636;', 'Monitors')}
      ${navItem('alert-channels', '/dashboard/alert-channels', '&#9684;', 'Alert channels')}
      ${navItem('status-pages', '/dashboard/status-pages', '&#9673;', 'Status pages')}
      <div class="account">
        <div class="account-label">Signed in as</div>
        <div class="account-row">
          <div class="avatar">${escapeHtml(sidebar.initials)}</div>
          <div>
            <div class="account-name">${escapeHtml(sidebar.displayName)}</div>
            <div class="account-role">${escapeHtml(sidebar.role)}</div>
          </div>
        </div>
        <form class="logout-form" method="POST" action="/logout">
          <button type="submit" id="sign-out" class="logout-btn">Sign out</button>
        </form>
      </div>
    </div>`
}

function renderLayout(
  title: string,
  sidebar: SidebarViewModel,
  body: string,
  flash?: string,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>${headTags(title)}</head>
<body>
  <div class="app">
    ${renderSidebar(sidebar)}
    <div class="main">
      ${flash ? `<div class="flash">${escapeHtml(flash)}</div>` : ''}
      ${body}
    </div>
  </div>
</body>
</html>`
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter((e): e is [string, string] => !!e[1])
  if (entries.length === 0) return ''
  return (
    '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  )
}

function sortHeader(
  label: string,
  column: 'name' | 'type' | 'uptime' | 'response',
  vm: MonitorsListViewModel,
): string {
  const active = vm.sortColumn === column
  const nextDir = active && vm.sortDirection === 'asc' ? 'desc' : 'asc'
  const arrow = active ? (vm.sortDirection === 'asc' ? ' ▲' : ' ▼') : ''
  const href = qs({
    search: vm.search,
    status: vm.statusFilter === 'all' ? undefined : vm.statusFilter,
    type: vm.typeFilter === 'all' ? undefined : vm.typeFilter,
    sort: column,
    dir: nextDir,
  })
  return `<th><a href="/dashboard/monitors${href}">${escapeHtml(label)}${arrow}</a></th>`
}

function filterPillsHref(
  vm: MonitorsListViewModel,
  overrides: Partial<{ status: string; type: string }>,
): string {
  const status = overrides.status ?? (vm.statusFilter === 'all' ? undefined : vm.statusFilter)
  const type = overrides.type ?? (vm.typeFilter === 'all' ? undefined : vm.typeFilter)
  return qs({
    search: vm.search,
    status,
    type,
    sort: vm.sortColumn === 'name' ? undefined : vm.sortColumn,
    dir: vm.sortDirection === 'asc' ? undefined : vm.sortDirection,
  })
}

function renderMonitorRow(m: MonitorRowViewModel): string {
  return `
    <tr class="row-link ${m.paused ? 'paused-row' : ''}" onclick="location.href='${m.detailUrl}'">
      <td><div style="${markerStyle(m.markerShape, m.statusColor, 9)}"></div></td>
      <td><a href="${m.detailUrl}" style="text-decoration:none;font-weight:500;color:inherit">${escapeHtml(m.name)}</a>${m.paused ? '<span class="paused-badge">Paused</span>' : ''}</td>
      <td class="type-badge mono">${escapeHtml(m.type)}</td>
      <td class="mono" style="color:${m.statusColor}">${escapeHtml(m.uptimeDisplay)}</td>
      <td class="mono" style="color:oklch(0.75 0.005 250)">${escapeHtml(m.responseDisplay)}</td>
      <td class="mono" style="color:oklch(0.55 0.01 250);font-size:11px">${escapeHtml(m.intervalDisplay)}</td>
      <td>${m.alertChannelNames.map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join('')}</td>
    </tr>`
}

export function renderMonitorsListPage(vm: MonitorsListViewModel): string {
  const statusPills = STATUS_FILTERS.map((s: StatusFilter) => {
    const active = vm.statusFilter === s
    const label = s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)
    const href = active
      ? filterPillsHref(vm, { status: undefined })
      : filterPillsHref(vm, { status: s })
    return `<a class="pill ${active ? 'active' : ''}" href="/dashboard/monitors${href}">${escapeHtml(label)}</a>`
  }).join('')

  const typePills = (['all', ...MONITOR_TYPES] as TypeFilter[])
    .map((t) => {
      const active = vm.typeFilter === t
      const label = t === 'all' ? 'All types' : t
      const href = active
        ? filterPillsHref(vm, { type: undefined })
        : filterPillsHref(vm, { type: t })
      return `<a class="pill ${active ? 'active' : ''}" href="/dashboard/monitors${href}">${escapeHtml(label)}</a>`
    })
    .join('')

  const body = `
    <div class="header" style="padding:20px 26px 10px">
      <div class="header-row" style="margin-bottom:16px">
        <div class="page-title">Monitors</div>
        <div class="count-label">${escapeHtml(vm.countLabel)}</div>
        ${vm.newMonitorUrl ? `<a class="btn-primary" style="margin-left:auto" href="${vm.newMonitorUrl}">+ New monitor</a>` : ''}
      </div>
      <form class="filters" method="GET" action="/dashboard/monitors">
        <input type="hidden" name="status" value="${escapeHtml(vm.statusFilter === 'all' ? '' : vm.statusFilter)}" />
        <input type="hidden" name="type" value="${escapeHtml(vm.typeFilter === 'all' ? '' : vm.typeFilter)}" />
        <input type="hidden" name="sort" value="${escapeHtml(vm.sortColumn)}" />
        <input type="hidden" name="dir" value="${escapeHtml(vm.sortDirection)}" />
        <input class="search-input" type="text" name="search" value="${escapeHtml(vm.search)}" placeholder="Search monitors…" />
        <button type="submit" class="btn-neutral">Search</button>
      </form>
      <div class="filters" style="margin-top:8px">
        ${statusPills}
        <div class="divider-v"></div>
        ${typePills}
      </div>
    </div>
    <div class="scroll" style="padding:0 26px">
      <table class="data">
        <thead>
          <tr>
            <th></th>
            ${sortHeader('Name', 'name', vm)}
            ${sortHeader('Type', 'type', vm)}
            ${sortHeader('Uptime 24h', 'uptime', vm)}
            ${sortHeader('Response', 'response', vm)}
            <th>Interval</th>
            <th>Alert channels</th>
          </tr>
        </thead>
        <tbody>
          ${vm.rows.map(renderMonitorRow).join('')}
        </tbody>
      </table>
      ${
        vm.isFreshWorkspace
          ? `<div class="empty">No monitors yet.${vm.newMonitorUrl ? ` <a href="${vm.newMonitorUrl}">Create your first monitor</a>.` : ''}</div>`
          : vm.noResults
            ? '<div class="empty">No monitors match the current filters.</div>'
            : ''
      }
    </div>`

  return renderLayout('Monitors', vm.sidebar, body)
}

export function renderMonitorDetailPage(vm: MonitorDetailViewModel): string {
  const windowLinks = (['24h', '7d', '30d'] as const)
    .map((w) => {
      const active = vm.window === w
      return `<a href="/dashboard/monitors/${vm.id}?window=${w}" class="${active ? 'active' : ''}">${w}</a>`
    })
    .join('')

  const actions = vm.canWrite
    ? `<div style="margin-left:auto;display:flex;gap:8px">
        ${vm.editUrl ? `<a class="btn-neutral" href="${vm.editUrl}">Edit</a>` : ''}
        ${vm.pauseUrl ? `<form method="POST" action="${vm.pauseUrl}"><button type="submit" class="btn-neutral">Pause</button></form>` : ''}
        ${vm.resumeUrl ? `<form method="POST" action="${vm.resumeUrl}"><button type="submit" class="btn-neutral">Resume</button></form>` : ''}
        ${vm.deleteConfirmUrl ? `<a class="btn-danger" href="${vm.deleteConfirmUrl}">Delete</a>` : ''}
      </div>`
    : ''

  const checksRows = vm.recentChecks
    .map(
      (c) => `
      <tr>
        <td class="mono" style="color:oklch(0.6 0.01 250)">${escapeHtml(c.checkedAtDisplay)}</td>
        <td style="color:${c.statusColor};font-weight:600">${escapeHtml(c.status)}</td>
        <td class="mono" style="color:oklch(0.75 0.005 250)">${escapeHtml(c.responseDisplay)}</td>
        <td style="color:oklch(0.62 0.18 25);font-size:11.5px">${escapeHtml(c.error)}</td>
      </tr>`,
    )
    .join('')

  const body = `
    <div class="header" style="padding:18px 26px">
      <a class="back-link" href="${vm.backUrl}">&larr; Monitors</a>
      <div class="detail-title-row">
        <div style="${markerStyle(vm.markerShape, vm.statusColor, 11)}"></div>
        <div class="detail-name">${escapeHtml(vm.name)}</div>
        <span class="type-badge mono" style="background:oklch(0.22 0.006 250);padding:2px 7px;border-radius:4px">${escapeHtml(vm.type)}</span>
        <span class="status-label" style="color:${vm.statusColor}">${escapeHtml(vm.statusLabel)}</span>
        ${vm.paused ? '<span class="paused-badge">Paused</span>' : ''}
        ${actions}
      </div>
    </div>
    <div class="scroll" style="padding:20px 26px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div class="section-label">Response time</div>
        <div class="segmented">${windowLinks}</div>
      </div>
      <div class="chart-card">
        <svg viewBox="0 0 640 120" style="width:100%;height:120px;display:block">
          <line x1="0" y1="30" x2="640" y2="30" stroke="oklch(0.28 0.006 250)" stroke-width="1"></line>
          <line x1="0" y1="60" x2="640" y2="60" stroke="oklch(0.28 0.006 250)" stroke-width="1"></line>
          <line x1="0" y1="90" x2="640" y2="90" stroke="oklch(0.28 0.006 250)" stroke-width="1"></line>
          ${vm.chart.areaD ? `<path d="${vm.chart.areaD}" fill="${vm.statusColor}" opacity="0.12"></path>` : ''}
          ${vm.chart.lineD ? `<path d="${vm.chart.lineD}" fill="none" stroke="${vm.statusColor}" stroke-width="2"></path>` : ''}
        </svg>
      </div>
      <div class="section-label" style="margin-bottom:10px">Recent checks</div>
      <table class="data">
        <thead><tr><th>Timestamp</th><th>Status</th><th>Response</th><th>Error</th></tr></thead>
        <tbody>${checksRows}</tbody>
      </table>
    </div>`

  return renderLayout(vm.name, vm.sidebar, body)
}

const TYPE_META: Record<
  string,
  { showUrl: boolean; showHostPort: boolean; showPort: boolean; showKeyword: boolean }
> = {
  http: { showUrl: true, showHostPort: false, showPort: false, showKeyword: false },
  keyword: { showUrl: true, showHostPort: false, showPort: false, showKeyword: true },
  tcp: { showUrl: false, showHostPort: true, showPort: true, showKeyword: false },
  ping: { showUrl: false, showHostPort: true, showPort: false, showKeyword: false },
}

// Switching type only re-renders the form with different conditional fields visible — it
// must not submit/save, so these are plain GET links (carrying the in-progress field
// values through the querystring) rather than a submit button inside the save form, same
// no-JS navigation pattern as the status page's `?window=` toggle.
function typeSwitchHref(vm: MonitorFormViewModel, type: string): string {
  return (
    vm.formGetUrl +
    qs({
      type,
      name: vm.values.name,
      url: vm.values.url,
      host: vm.values.host,
      port: vm.values.port,
      keyword: vm.values.keyword,
      intervalSeconds: vm.values.intervalSeconds,
      timeoutSeconds: vm.values.timeoutSeconds,
      retries: vm.values.retries,
      degradedAfterMs: vm.values.degradedAfterMs,
      channels: vm.values.alertChannelIds.join(','),
    })
  )
}

export function renderMonitorFormPage(vm: MonitorFormViewModel): string {
  const meta = TYPE_META[vm.values.type]
  const typeButtons = (['http', 'tcp', 'ping', 'keyword'] as const)
    .map(
      (t) =>
        `<a href="${typeSwitchHref(vm, t)}" class="toggle-pill ${vm.values.type === t ? 'active' : ''}" style="border-radius:6px;text-transform:uppercase;font-family:'IBM Plex Mono',monospace">${t}</a>`,
    )
    .join('')

  const channelToggles = vm.allChannels
    .map((c) => {
      const active = vm.values.alertChannelIds.includes(c.id)
      return `<label class="toggle-pill ${active ? 'active' : ''}">
        <input type="checkbox" name="alertChannelIds" value="${c.id}" ${active ? 'checked' : ''} style="display:none" onchange="this.closest('label').classList.toggle('active')" />
        ${escapeHtml(c.name)}
      </label>`
    })
    .join('')

  const body = `
    <div class="header" style="padding:18px 26px">
      <a class="back-link" href="${vm.backUrl}">&larr; Monitors</a>
      <div class="page-title">${escapeHtml(vm.headerLabel)}</div>
    </div>
    <div class="scroll form-body" style="padding:22px 26px">
      <div class="callout">Maps 1:1 to this monitor's entry in monitors.yaml</div>
      <form method="POST" action="${vm.actionUrl}">
        <div class="field">
          <label class="field-label" for="name">Name</label>
          <input id="name" name="name" value="${escapeHtml(vm.values.name)}" />
          ${vm.errors.name ? `<div class="field-error">${escapeHtml(vm.errors.name)}</div>` : ''}
        </div>
        <div class="field">
          <label class="field-label">Type</label>
          <div style="display:flex;gap:6px">${typeButtons}</div>
        </div>
        ${
          meta.showUrl
            ? `<div class="field mono">
                <label class="field-label" for="url">URL</label>
                <input id="url" name="url" value="${escapeHtml(vm.values.url)}" placeholder="https://example.com/health" />
                ${vm.errors.url ? `<div class="field-error">${escapeHtml(vm.errors.url)}</div>` : ''}
              </div>`
            : ''
        }
        ${
          meta.showHostPort
            ? `<div class="field-row" style="margin-bottom:16px">
                <div class="field mono" style="flex:1;margin-bottom:0">
                  <label class="field-label" for="host">Host</label>
                  <input id="host" name="host" value="${escapeHtml(vm.values.host)}" />
                  ${vm.errors.host ? `<div class="field-error">${escapeHtml(vm.errors.host)}</div>` : ''}
                </div>
                ${
                  meta.showPort
                    ? `<div class="field mono" style="width:110px;margin-bottom:0">
                        <label class="field-label" for="port">Port</label>
                        <input id="port" name="port" value="${escapeHtml(vm.values.port)}" />
                      </div>`
                    : ''
                }
              </div>`
            : ''
        }
        ${
          meta.showKeyword
            ? `<div class="field mono">
                <label class="field-label" for="keyword">Keyword to match</label>
                <input id="keyword" name="keyword" value="${escapeHtml(vm.values.keyword)}" />
              </div>`
            : ''
        }
        <div class="grid-2x2">
          <div class="field mono" style="margin-bottom:0">
            <label class="field-label" for="intervalSeconds">Interval (sec)</label>
            <input id="intervalSeconds" name="intervalSeconds" value="${escapeHtml(vm.values.intervalSeconds)}" />
          </div>
          <div class="field mono" style="margin-bottom:0">
            <label class="field-label" for="timeoutSeconds">Timeout (sec)</label>
            <input id="timeoutSeconds" name="timeoutSeconds" value="${escapeHtml(vm.values.timeoutSeconds)}" />
          </div>
          <div class="field mono" style="margin-bottom:0">
            <label class="field-label" for="retries">Retries</label>
            <input id="retries" name="retries" value="${escapeHtml(vm.values.retries)}" />
          </div>
          <div class="field mono" style="margin-bottom:0">
            <label class="field-label" for="degradedAfterMs">Degraded after (ms)</label>
            <input id="degradedAfterMs" name="degradedAfterMs" value="${escapeHtml(vm.values.degradedAfterMs)}" />
          </div>
        </div>
        <div class="field">
          <label class="field-label">Alert channels</label>
          <div class="toggle-pills">${channelToggles}</div>
        </div>
        <div class="actions-row">
          <button type="submit" id="save-monitor" class="btn-primary" style="border:none">Save monitor</button>
          <a class="btn-neutral" href="${vm.backUrl}">Cancel</a>
        </div>
      </form>
    </div>`

  return renderLayout(vm.headerLabel, vm.sidebar, body)
}

export function renderAlertChannelsListPage(vm: AlertChannelsListViewModel): string {
  const rows = vm.rows
    .map(
      (c) => `
      <tr>
        <td><a href="${c.editUrl}" style="text-decoration:none;font-weight:500;color:inherit">${escapeHtml(c.name)}</a></td>
        <td class="type-badge mono">${escapeHtml(c.type)}</td>
        <td style="color:oklch(0.65 0.01 250);font-size:11.5px">${escapeHtml(c.monitorsText)}</td>
        <td style="text-align:right">${
          c.testUrl
            ? `<form method="POST" action="${c.testUrl}"><button type="submit" class="btn-neutral" style="font-size:11px;padding:5px 10px">Send test alert</button></form>`
            : ''
        }</td>
      </tr>`,
    )
    .join('')

  const body = `
    <div class="header" style="padding:20px 26px">
      <div class="header-row">
        <div class="page-title">Alert channels</div>
        ${vm.newChannelUrl ? `<a class="btn-primary" style="margin-left:auto" href="${vm.newChannelUrl}">+ New channel</a>` : ''}
      </div>
    </div>
    <div class="scroll" style="padding:16px 26px">
      <table class="data">
        <thead><tr><th>Name</th><th>Type</th><th>Monitors using it</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`

  return renderLayout('Alert channels', vm.sidebar, body, vm.flash)
}

export function renderAlertChannelFormPage(vm: AlertChannelFormViewModel): string {
  const typeButtons = (['slack', 'email', 'webhook'] as const)
    .map((t) => {
      const href = vm.formGetUrl + qs({ type: t, name: vm.values.name, target: vm.values.target })
      return `<a href="${href}" class="toggle-pill ${vm.values.type === t ? 'active' : ''}" style="border-radius:6px;text-transform:uppercase;font-family:'IBM Plex Mono',monospace">${t}</a>`
    })
    .join('')

  const body = `
    <div class="header" style="padding:18px 26px">
      <a class="back-link" href="${vm.backUrl}">&larr; Alert channels</a>
      <div class="page-title">${escapeHtml(vm.headerLabel)}</div>
    </div>
    <div class="scroll form-body" style="padding:22px 26px;max-width:480px">
      <form method="POST" action="${vm.actionUrl}">
        <div class="field">
          <label class="field-label" for="name">Name</label>
          <input id="name" name="name" value="${escapeHtml(vm.values.name)}" />
          ${vm.errors.name ? `<div class="field-error">${escapeHtml(vm.errors.name)}</div>` : ''}
        </div>
        <div class="field">
          <label class="field-label">Type</label>
          <div style="display:flex;gap:6px">${typeButtons}</div>
        </div>
        <div class="field mono">
          <label class="field-label" for="target">${escapeHtml(vm.targetLabel)}</label>
          <input id="target" name="target" value="${escapeHtml(vm.values.target)}" placeholder="${escapeHtml(vm.targetPlaceholder)}" />
          ${vm.errors.target ? `<div class="field-error">${escapeHtml(vm.errors.target)}</div>` : ''}
        </div>
        <div class="actions-row">
          <button type="submit" id="save-channel" class="btn-primary" style="border:none">Save channel</button>
          <a class="btn-neutral" href="${vm.backUrl}">Cancel</a>
        </div>
      </form>
    </div>`

  return renderLayout(vm.headerLabel, vm.sidebar, body)
}

function renderStatusPageRow(p: StatusPageRowViewModel): string {
  const nameCell = p.editUrl
    ? `<a href="${p.editUrl}" style="text-decoration:none;font-weight:500;color:inherit">${escapeHtml(p.name)}</a>`
    : escapeHtml(p.name)
  return `
    <tr>
      <td>${nameCell}</td>
      <td class="mono">${escapeHtml(p.slug)}</td>
      <td class="mono">${p.monitorCount}</td>
      <td><a href="${p.publicUrl}" target="_blank" rel="noopener" class="mono" style="color:oklch(0.65 0.01 250)">${escapeHtml(p.publicUrl)}</a></td>
      <td style="text-align:right">
        <div style="display:flex;gap:8px;justify-content:flex-end">
          ${p.editUrl ? `<a class="btn-neutral" href="${p.editUrl}">Edit</a>` : ''}
          ${p.deleteConfirmUrl ? `<a class="btn-danger" href="${p.deleteConfirmUrl}">Delete</a>` : ''}
        </div>
      </td>
    </tr>`
}

export function renderStatusPagesListPage(vm: StatusPagesListViewModel): string {
  const body = `
    <div class="header" style="padding:20px 26px">
      <div class="header-row">
        <div class="page-title">Status pages</div>
        ${vm.newStatusPageUrl ? `<a class="btn-primary" style="margin-left:auto" href="${vm.newStatusPageUrl}">+ New status page</a>` : ''}
      </div>
    </div>
    <div class="scroll" style="padding:16px 26px">
      <table class="data">
        <thead><tr><th>Name</th><th>Slug</th><th>Monitors</th><th>Public page</th><th></th></tr></thead>
        <tbody>${vm.rows.map(renderStatusPageRow).join('')}</tbody>
      </table>
      ${
        vm.isFreshWorkspace
          ? `<div class="empty">No status pages yet.${vm.newStatusPageUrl ? ` <a href="${vm.newStatusPageUrl}">Create your first status page</a>.` : ''}</div>`
          : ''
      }
    </div>`

  return renderLayout('Status pages', vm.sidebar, body)
}

export function renderStatusPageFormPage(vm: StatusPageFormViewModel): string {
  const monitorRows = vm.allMonitors
    .map((m) => {
      const checked = vm.values.monitorIds.includes(m.id)
      const groupName = vm.values.groupNames[m.id] ?? ''
      return `
      <tr>
        <td><input type="checkbox" name="monitorIds" value="${m.id}" ${checked ? 'checked' : ''} /></td>
        <td>${escapeHtml(m.name)}</td>
        <td><input type="text" name="groupName_${m.id}" value="${escapeHtml(groupName)}" placeholder="Optional group" /></td>
      </tr>`
    })
    .join('')

  const body = `
    <div class="header" style="padding:18px 26px">
      <a class="back-link" href="${vm.backUrl}">&larr; Status pages</a>
      <div class="page-title">${escapeHtml(vm.headerLabel)}</div>
    </div>
    <div class="scroll form-body" style="padding:22px 26px">
      <form method="POST" action="${vm.actionUrl}">
        <div class="field">
          <label class="field-label" for="name">Name</label>
          <input id="name" name="name" value="${escapeHtml(vm.values.name)}" />
          ${vm.errors.name ? `<div class="field-error">${escapeHtml(vm.errors.name)}</div>` : ''}
        </div>
        <div class="field mono">
          <label class="field-label" for="slug">Slug</label>
          <input id="slug" name="slug" value="${escapeHtml(vm.values.slug)}" placeholder="my-status-page" />
          ${vm.errors.slug ? `<div class="field-error">${escapeHtml(vm.errors.slug)}</div>` : ''}
        </div>
        <div class="field-row-2">
          <div class="field mono">
            <label class="field-label" for="logoUrl">Logo URL</label>
            <input id="logoUrl" name="logoUrl" value="${escapeHtml(vm.values.logoUrl)}" placeholder="https://example.com/logo.png" />
          </div>
          <div class="field mono">
            <label class="field-label" for="accentColor">Accent color</label>
            <input id="accentColor" name="accentColor" value="${escapeHtml(vm.values.accentColor)}" placeholder="oklch(0.55 0.16 250)" />
          </div>
        </div>
        <div class="field">
          <label class="field-label">Monitors</label>
          <table class="data">
            <thead><tr><th></th><th>Monitor</th><th>Group name</th></tr></thead>
            <tbody>${monitorRows}</tbody>
          </table>
        </div>
        <div class="actions-row">
          <button type="submit" id="save-status-page" class="btn-primary" style="border:none">Save status page</button>
          <a class="btn-neutral" href="${vm.backUrl}">Cancel</a>
        </div>
      </form>
    </div>`

  return renderLayout(vm.headerLabel, vm.sidebar, body)
}

export function renderDeleteConfirmPage(
  sidebar: SidebarViewModel,
  entityName: string,
  confirmActionUrl: string,
  cancelUrl: string,
): string {
  const body = `
    <div class="scroll" style="padding:26px">
      <div class="confirm-card">
        <div style="font-size:14px;font-weight:600;margin-bottom:8px">Delete "${escapeHtml(entityName)}"?</div>
        <div style="font-size:12.5px;color:oklch(0.6 0.01 250);margin-bottom:20px">This cannot be undone.</div>
        <div class="actions-row" style="justify-content:center">
          <form method="POST" action="${confirmActionUrl}">
            <button type="submit" class="btn-danger" style="background:oklch(0.4 0.16 25 / 0.15)">Delete</button>
          </form>
          <a class="btn-neutral" href="${cancelUrl}">Cancel</a>
        </div>
      </div>
    </div>`
  return renderLayout('Confirm delete', sidebar, body)
}
