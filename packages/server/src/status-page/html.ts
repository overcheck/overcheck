import type {
  IncidentViewModel,
  MonitorGroupViewModel,
  MonitorViewModel,
  StatusPagePublicData,
  Window,
} from './public-data.js'
import { WINDOWS } from './public-data.js'

const OVERCHECK_BLUE = 'oklch(0.55 0.16 250)'

/** Escapes user-controlled text (monitor names, incident titles/updates, group/page
 * names) before it is interpolated into the HTML string — this module never uses a
 * templating engine's auto-escaping, so every dynamic string must pass through here. */
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

function markerStyle(vm: MonitorViewModel): string {
  const base = 'width:10px;height:10px;flex:none;background:' + vm.statusColor
  if (vm.markerShape === 'diamond') return `${base};border-radius:20%;transform:rotate(45deg)`
  if (vm.markerShape === 'square') return `${base};border-radius:3px`
  return `${base};border-radius:50%`
}

function renderMonitorRow(vm: MonitorViewModel): string {
  return `
    <div class="monitor-row">
      <div style="${markerStyle(vm)}"></div>
      <div class="monitor-name">${escapeHtml(vm.name)}</div>
      <div class="status-label-text" style="color:${vm.statusColor}">${escapeHtml(vm.statusLabel)}</div>
      <div class="uptime-block">
        <div class="uptime-label">${escapeHtml(vm.uptimeLabel)}</div>
        <div class="uptime-bar" style="background:${vm.tickGradient}"></div>
      </div>
      <div class="monitor-divider"></div>
      <div class="response-time-block">
        <div class="response-time-label">Response time</div>
        <svg class="response-time-chart" viewBox="0 0 220 48">
          ${vm.sparkline.areaD ? `<path d="${vm.sparkline.areaD}" fill="${vm.statusColor}" opacity="0.1"></path>` : ''}
          ${vm.sparkline.lineD ? `<path d="${vm.sparkline.lineD}" fill="none" stroke="${vm.statusColor}" stroke-width="2"></path>` : ''}
        </svg>
      </div>
      <div class="latest-rt">${escapeHtml(vm.latestResponseTimeDisplay)}</div>
      <div class="uptime-percentage">${escapeHtml(vm.uptimePercentDisplay)}</div>
    </div>`
}

function renderGroup(group: MonitorGroupViewModel): string {
  const header = group.name
    ? `<div class="group-header"><div class="group-label">${escapeHtml(group.name)}</div><div class="group-divider"></div></div>`
    : ''
  return `
    <div class="monitor-group">
      ${header}
      ${group.monitors.map(renderMonitorRow).join('')}
    </div>`
}

function renderIncident(incident: IncidentViewModel): string {
  const updates = incident.updates
    .map(
      (u) => `
        <div class="incident-update">
          <span class="incident-update-time">${escapeHtml(u.timeDisplay)}</span>
          <span class="incident-update-text">${escapeHtml(u.body)}</span>
        </div>`,
    )
    .join('')
  const affected = incident.affectedMonitorNames.map(escapeHtml).join(', ')
  return `
    <div class="incident-item">
      <div class="incident-left-bar" style="background:${incident.statusColor}"></div>
      <div class="incident-content">
        <div class="incident-header">
          <div class="incident-title">${escapeHtml(incident.title)}</div>
          <div class="incident-status-badge" style="color:${incident.statusColor}">${escapeHtml(incident.statusLabel)}</div>
        </div>
        <div class="incident-meta">
          <span>${affected}</span><span>·</span><span>${escapeHtml(incident.startedAtDisplay)}</span>
        </div>
        ${updates}
      </div>
    </div>`
}

function renderWindowToggle(current: Window, accentColor: string): string {
  return WINDOWS.map((w) => {
    const active = w === current
    const style = active
      ? `background:${accentColor};color:#fff`
      : 'background:transparent;color:oklch(0.45 0.01 250)'
    return `<a href="?window=${w}" class="window-button" style="${style}">${w}</a>`
  }).join('')
}

function renderLogo(data: StatusPagePublicData): string {
  if (data.logoUrl) {
    return `<img src="${escapeHtml(data.logoUrl)}" alt="" class="logo-swatch" style="object-fit:cover" />`
  }
  const initial = data.name.trim().charAt(0).toUpperCase() || '?'
  return `<div class="logo-swatch" style="background:${data.accentColor}">${escapeHtml(initial)}</div>`
}

const STYLE = `
  body { margin:0; background:#f0eee9; font-family:'IBM Plex Sans', system-ui, sans-serif; }
  .card { width:640px; max-width:100%; margin:32px auto; background:#fff; color:oklch(0.22 0.01 250);
    border:1px solid oklch(0.92 0.005 250); border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,.06); overflow:hidden; box-sizing:border-box; }
  @media (max-width:680px) { .card { margin:0; border-radius:0; border-left:none; border-right:none; } }
  .header { padding:28px 32px 22px; border-bottom:1px solid oklch(0.92 0.005 250); }
  .header-branding-row { display:flex; align-items:center; gap:10px; margin-bottom:22px; }
  .logo-swatch { width:26px; height:26px; border-radius:7px; display:flex; align-items:center; justify-content:center;
    color:#fff; font-weight:700; font-size:13px; flex:none; }
  .company-name { font-weight:600; font-size:15px; }
  .status-domain { margin-left:auto; font-size:11px; color:oklch(0.5 0.01 250); font-family:'IBM Plex Mono', monospace; }
  .header-verdict-row { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; flex-wrap:wrap; }
  .verdict-label { font-size:30px; font-weight:600; line-height:1.15; }
  .verdict-sub { font-size:13px; color:oklch(0.45 0.01 250); margin-top:6px; max-width:420px; }
  .verdict-time { font-size:11.5px; color:oklch(0.6 0.01 250); margin-top:10px; font-family:'IBM Plex Mono', monospace; }
  .window-selector { display:flex; background:oklch(0.96 0.003 250); border-radius:8px; padding:3px; gap:2px; }
  .window-button { border:none; text-decoration:none; font:500 11.5px 'IBM Plex Mono', monospace; padding:6px 12px;
    border-radius:6px; cursor:pointer; display:inline-block; }
  .monitors-section { padding:24px 32px 8px; }
  .monitor-group { margin-bottom:22px; }
  .group-header { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
  .group-label { font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:oklch(0.5 0.01 250); white-space:nowrap; }
  .group-divider { flex:1; height:1px; background:oklch(0.92 0.005 250); }
  .monitor-row { display:flex; align-items:center; gap:12px; padding:11px 0; border-bottom:1px solid oklch(0.95 0.003 250); }
  .monitor-name { font-size:13.5px; font-weight:500; width:150px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .status-label-text { font-size:11px; width:76px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .uptime-block { display:flex; flex-direction:column; gap:2px; flex:1; }
  .uptime-label { font-size:8.5px; letter-spacing:.04em; text-transform:uppercase; color:oklch(0.65 0.01 250); }
  .uptime-bar { height:16px; border-radius:3px; }
  .monitor-divider { width:1px; align-self:stretch; background:oklch(0.9 0.005 250); flex:none; }
  .response-time-block { display:flex; flex-direction:column; gap:2px; flex:none; }
  .response-time-label { font-size:8.5px; letter-spacing:.04em; text-transform:uppercase; color:oklch(0.65 0.01 250); }
  .response-time-chart { width:64px; height:16px; flex:none; display:block; }
  .latest-rt { font-family:'IBM Plex Mono', monospace; font-size:11px; width:48px; text-align:right; color:oklch(0.45 0.01 250); white-space:nowrap; }
  .uptime-percentage { font-family:'IBM Plex Mono', monospace; font-size:12px; font-weight:600; width:56px; text-align:right; color:oklch(0.35 0.01 250); white-space:nowrap; }
  .incidents-section { padding:20px 32px 24px; border-top:1px solid oklch(0.94 0.004 250); }
  .incidents-label { font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:oklch(0.5 0.01 250); margin-bottom:14px; }
  .incident-item { display:flex; gap:12px; padding-bottom:16px; margin-bottom:16px; border-bottom:1px solid oklch(0.95 0.003 250); }
  .incident-item:last-child { margin-bottom:0; border-bottom:none; }
  .incident-left-bar { width:3px; border-radius:2px; flex:none; align-self:stretch; }
  .incident-content { flex:1; min-width:0; }
  .incident-header { display:flex; justify-content:space-between; gap:10px; }
  .incident-title { font-size:13.5px; font-weight:600; }
  .incident-status-badge { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; white-space:nowrap; }
  .incident-meta { font-size:11.5px; color:oklch(0.5 0.01 250); margin-top:3px; display:flex; gap:4px; }
  .incident-update { font-size:12px; color:oklch(0.35 0.01 250); margin-top:8px; display:flex; gap:8px; }
  .incident-update-time { font-family:'IBM Plex Mono', monospace; color:oklch(0.6 0.01 250); flex:none; white-space:nowrap; }
  .incident-update-text { flex:1; line-height:1.4; }
  .footer { padding:16px 32px; text-align:center; border-top:1px solid oklch(0.94 0.004 250); }
  .footer-link { font-size:11.5px; color:${OVERCHECK_BLUE}; text-decoration:none; }
  .footer-link:hover { text-decoration:underline; }
`

export function renderStatusPageHtml(data: StatusPagePublicData, domain: string): string {
  const verdictColor = data.verdict.color
  const sub = data.verdict.affectedMonitorNames.length
    ? `${escapeHtml(data.verdict.affectedMonitorNames.join(', '))} ${data.verdict.affectedMonitorNames.length === 1 ? 'is' : 'are'} experiencing issues.`
    : 'All systems are operating normally.'
  const time = data.verdict.lastCheckedRelative
    ? `Last checked ${escapeHtml(data.verdict.lastCheckedRelative)}`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(data.name)} Status</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
<style>${STYLE}</style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="header-branding-row">
        ${renderLogo(data)}
        <div class="company-name">${escapeHtml(data.name)}</div>
        <div class="status-domain">${escapeHtml(domain)}</div>
      </div>
      <div class="header-verdict-row">
        <div class="verdict-block">
          <div class="verdict-label" style="color:${verdictColor}">${escapeHtml(data.verdict.label)}</div>
          <div class="verdict-sub">${sub}</div>
          ${time ? `<div class="verdict-time">${time}</div>` : ''}
        </div>
        <div class="window-selector">${renderWindowToggle(data.window, data.accentColor)}</div>
      </div>
    </div>
    <div class="monitors-section">
      ${data.groups.map(renderGroup).join('')}
    </div>
    <div class="incidents-section">
      <div class="incidents-label">Incident history</div>
      ${data.incidents.length ? data.incidents.map(renderIncident).join('') : '<div style="font-size:12px;color:oklch(0.5 0.01 250)">No incidents reported.</div>'}
    </div>
    <div class="footer">
      <a class="footer-link" href="https://overcheck.dev" target="_blank" rel="noopener">Powered by Overcheck</a>
    </div>
  </div>
</body>
</html>`
}

export function renderNotFoundHtml(slug: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><title>Status page not found</title></head>
<body style="font-family:sans-serif;text-align:center;padding:64px">
  <h1>Status page not found</h1>
  <p>No status page exists at "${escapeHtml(slug)}".</p>
</body>
</html>`
}
