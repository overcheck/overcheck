import type { FastifyInstance, FastifyRequest } from 'fastify'
import { extractSessionToken } from '../auth.js'
import { dashboardApi, type MonitorWriteBody } from '../dashboard/client.js'
import {
  renderAlertChannelFormPage,
  renderAlertChannelsListPage,
  renderDeleteConfirmPage,
  renderMonitorDetailPage,
  renderMonitorFormPage,
  renderMonitorsListPage,
} from '../dashboard/html.js'
import {
  alertChannelFormValuesToConfig,
  alertChannelToFormValues,
  buildAlertChannelsListViewModel,
  buildMonitorDetailViewModel,
  buildMonitorsListViewModel,
  buildSidebarViewModel,
  DEFAULT_ALERT_CHANNEL_FORM_VALUES,
  DEFAULT_MONITOR_FORM_VALUES,
  monitorToFormValues,
  TARGET_FIELD_META,
  type AlertChannelFormFieldValues,
  type MonitorFormFieldValues,
} from '../dashboard/view-models.js'
import { canWrite } from '../dashboard/role-helpers.js'
import type { Window } from '../status-page/public-data.js'
import { WINDOWS } from '../status-page/public-data.js'
import { formString, formStringArray, type FormBody } from '../utils/form-body.js'

function isWindow(value: unknown): value is Window {
  return typeof value === 'string' && (WINDOWS as string[]).includes(value)
}

function notFoundPage(): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Not found</title></head>
<body style="font-family:sans-serif;text-align:center;padding:64px"><h1>Not found</h1></body></html>`
}

function monitorFormValuesFromQuery(query: Record<string, unknown>): MonitorFormFieldValues | null {
  if (typeof query.type !== 'string') return null
  const channels =
    typeof query.channels === 'string' && query.channels
      ? query.channels.split(',').map(Number)
      : []
  return {
    name: typeof query.name === 'string' ? query.name : '',
    type: (['http', 'tcp', 'ping', 'keyword'] as const).includes(query.type as never)
      ? (query.type as MonitorFormFieldValues['type'])
      : 'http',
    url: typeof query.url === 'string' ? query.url : '',
    host: typeof query.host === 'string' ? query.host : '',
    port: typeof query.port === 'string' ? query.port : '',
    keyword: typeof query.keyword === 'string' ? query.keyword : '',
    intervalSeconds: typeof query.intervalSeconds === 'string' ? query.intervalSeconds : '60',
    timeoutSeconds: typeof query.timeoutSeconds === 'string' ? query.timeoutSeconds : '10',
    retries: typeof query.retries === 'string' ? query.retries : '2',
    degradedAfterMs: typeof query.degradedAfterMs === 'string' ? query.degradedAfterMs : '500',
    alertChannelIds: channels,
  }
}

function monitorFormValuesFromBody(body: FormBody): MonitorFormFieldValues {
  return {
    name: formString(body, 'name'),
    type: (['http', 'tcp', 'ping', 'keyword'] as const).includes(formString(body, 'type') as never)
      ? (formString(body, 'type') as MonitorFormFieldValues['type'])
      : 'http',
    url: formString(body, 'url'),
    host: formString(body, 'host'),
    port: formString(body, 'port'),
    keyword: formString(body, 'keyword'),
    intervalSeconds: formString(body, 'intervalSeconds'),
    timeoutSeconds: formString(body, 'timeoutSeconds'),
    retries: formString(body, 'retries'),
    degradedAfterMs: formString(body, 'degradedAfterMs'),
    alertChannelIds: formStringArray(body, 'alertChannelIds')
      .map(Number)
      .filter((n) => !Number.isNaN(n)),
  }
}

function validateMonitorFormValues(values: MonitorFormFieldValues): {
  name?: string
  url?: string
  host?: string
} {
  const errors: { name?: string; url?: string; host?: string } = {}
  if (!values.name.trim()) errors.name = 'Name is required.'
  if ((values.type === 'http' || values.type === 'keyword') && !values.url.trim()) {
    errors.url = 'URL is required.'
  }
  if ((values.type === 'tcp' || values.type === 'ping') && !values.host.trim()) {
    errors.host = 'Host is required.'
  }
  return errors
}

function monitorFormValuesToWriteBody(values: MonitorFormFieldValues): MonitorWriteBody {
  const body: MonitorWriteBody = {
    name: values.name.trim(),
    type: values.type,
    intervalSeconds: Number(values.intervalSeconds) || 60,
    timeoutMs: (Number(values.timeoutSeconds) || 10) * 1000,
    retries: Number(values.retries) || 0,
    degradedAfterMs: Number(values.degradedAfterMs) || 0,
  }
  if (values.type === 'http' || values.type === 'keyword') body.httpUrl = values.url.trim()
  if (values.type === 'keyword') body.httpBodyContains = values.keyword.trim()
  if (values.type === 'tcp' || values.type === 'ping') body.host = values.host.trim()
  if (values.type === 'tcp' && values.port) body.port = Number(values.port)
  return body
}

function alertChannelFormValuesFromQuery(
  query: Record<string, unknown>,
): AlertChannelFormFieldValues | null {
  if (typeof query.type !== 'string') return null
  return {
    name: typeof query.name === 'string' ? query.name : '',
    type: (['slack', 'email', 'webhook'] as const).includes(query.type as never)
      ? (query.type as AlertChannelFormFieldValues['type'])
      : 'slack',
    target: typeof query.target === 'string' ? query.target : '',
  }
}

function alertChannelFormValuesFromBody(body: FormBody): AlertChannelFormFieldValues {
  return {
    name: formString(body, 'name'),
    type: (['slack', 'email', 'webhook'] as const).includes(formString(body, 'type') as never)
      ? (formString(body, 'type') as AlertChannelFormFieldValues['type'])
      : 'slack',
    target: formString(body, 'target'),
  }
}

/**
 * Server-rendered internal dashboard. Every route here talks to the API exclusively through
 * `dashboardApi()` (Fastify in-process `app.inject()` against the real `/api/...` routes) —
 * no direct DB access — so every action shown on a page maps to a real, independently
 * testable endpoint with its own `requireRole()` enforcement.
 */
export function registerDashboardHtmlRoutes(app: FastifyInstance): void {
  function apiFor(request: FastifyRequest) {
    const token = extractSessionToken(request)
    if (!token) throw new Error('dashboard route reached without a session token')
    return dashboardApi(app, token)
  }

  app.get('/dashboard', async (_request, reply) => reply.redirect('/dashboard/monitors'))

  // ---- Monitors ----

  app.get(
    '/dashboard/monitors',
    async (
      request: FastifyRequest<{
        Querystring: {
          search?: string
          status?: string
          type?: string
          sort?: string
          dir?: string
        }
      }>,
      reply,
    ) => {
      const vm = await buildMonitorsListViewModel(apiFor(request), request.user, request.query)
      reply.type('text/html')
      return renderMonitorsListPage(vm)
    },
  )

  app.get(
    '/dashboard/monitors/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { window?: string } }>,
      reply,
    ) => {
      const id = Number(request.params.id)
      const window: Window = isWindow(request.query.window) ? request.query.window : '24h'
      const vm = await buildMonitorDetailViewModel(apiFor(request), request.user, id, window)
      if (!vm) {
        reply.code(404).type('text/html')
        return notFoundPage()
      }
      reply.type('text/html')
      return renderMonitorDetailPage(vm)
    },
  )

  app.get('/dashboard/monitors/new', async (request, reply) => {
    if (!canWrite(request.user.role)) {
      reply.code(404).type('text/html')
      return notFoundPage()
    }
    const api = apiFor(request)
    const channelsRes = await api.listAlertChannels()
    const values =
      monitorFormValuesFromQuery(request.query as Record<string, unknown>) ??
      DEFAULT_MONITOR_FORM_VALUES
    reply.type('text/html')
    return renderMonitorFormPage({
      sidebar: buildSidebarViewModel(request.user, 'monitors'),
      headerLabel: 'New monitor',
      actionUrl: '/dashboard/monitors/new',
      formGetUrl: '/dashboard/monitors/new',
      isEdit: false,
      values,
      errors: {},
      allChannels: channelsRes.data,
      backUrl: '/dashboard/monitors',
    })
  })

  app.post(
    '/dashboard/monitors/new',
    async (request: FastifyRequest<{ Body: FormBody }>, reply) => {
      if (!canWrite(request.user.role)) {
        reply.code(404).type('text/html')
        return notFoundPage()
      }
      const api = apiFor(request)
      const values = monitorFormValuesFromBody(request.body)
      const errors = validateMonitorFormValues(values)

      if (Object.keys(errors).length === 0) {
        const created = await api.createMonitor(monitorFormValuesToWriteBody(values))
        if (created.ok) {
          if (values.alertChannelIds.length > 0) {
            await api.putMonitorAlertChannels(created.data.id, values.alertChannelIds)
          }
          return reply.redirect(`/dashboard/monitors/${created.data.id}`)
        }
        if (created.status === 409) errors.name = 'That name is already in use.'
        else errors.name = errors.name ?? 'Could not save monitor — check the fields above.'
      }

      const channelsRes = await api.listAlertChannels()
      reply.code(422).type('text/html')
      return renderMonitorFormPage({
        sidebar: buildSidebarViewModel(request.user, 'monitors'),
        headerLabel: 'New monitor',
        actionUrl: '/dashboard/monitors/new',
        formGetUrl: '/dashboard/monitors/new',
        isEdit: false,
        values,
        errors,
        allChannels: channelsRes.data,
        backUrl: '/dashboard/monitors',
      })
    },
  )

  app.get(
    '/dashboard/monitors/:id/edit',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      if (!canWrite(request.user.role)) {
        reply.code(404).type('text/html')
        return notFoundPage()
      }
      const id = Number(request.params.id)
      const api = apiFor(request)
      const [monitorRes, channelsRes, monitorChannelsRes] = await Promise.all([
        api.getMonitor(id),
        api.listAlertChannels(),
        api.getMonitorAlertChannels(id),
      ])
      if (!monitorRes.ok) {
        reply.code(404).type('text/html')
        return notFoundPage()
      }
      const queryValues = monitorFormValuesFromQuery(request.query as Record<string, unknown>)
      const values = queryValues ?? {
        ...monitorToFormValues(monitorRes.data),
        alertChannelIds: monitorChannelsRes.data.alertChannelIds,
      }
      reply.type('text/html')
      return renderMonitorFormPage({
        sidebar: buildSidebarViewModel(request.user, 'monitors'),
        headerLabel: 'Edit monitor',
        actionUrl: `/dashboard/monitors/${id}/edit`,
        formGetUrl: `/dashboard/monitors/${id}/edit`,
        isEdit: true,
        values,
        errors: {},
        allChannels: channelsRes.data,
        backUrl: `/dashboard/monitors/${id}`,
      })
    },
  )

  app.post(
    '/dashboard/monitors/:id/edit',
    async (request: FastifyRequest<{ Params: { id: string }; Body: FormBody }>, reply) => {
      if (!canWrite(request.user.role)) {
        reply.code(404).type('text/html')
        return notFoundPage()
      }
      const id = Number(request.params.id)
      const api = apiFor(request)
      const values = monitorFormValuesFromBody(request.body)
      const errors = validateMonitorFormValues(values)

      if (Object.keys(errors).length === 0) {
        const updated = await api.updateMonitor(id, monitorFormValuesToWriteBody(values))
        if (updated.ok) {
          await api.putMonitorAlertChannels(id, values.alertChannelIds)
          return reply.redirect(`/dashboard/monitors/${id}`)
        }
        if (updated.status === 409) errors.name = 'That name is already in use.'
        else errors.name = errors.name ?? 'Could not save monitor — check the fields above.'
      }

      const channelsRes = await api.listAlertChannels()
      reply.code(422).type('text/html')
      return renderMonitorFormPage({
        sidebar: buildSidebarViewModel(request.user, 'monitors'),
        headerLabel: 'Edit monitor',
        actionUrl: `/dashboard/monitors/${id}/edit`,
        formGetUrl: `/dashboard/monitors/${id}/edit`,
        isEdit: true,
        values,
        errors,
        allChannels: channelsRes.data,
        backUrl: `/dashboard/monitors/${id}`,
      })
    },
  )

  app.post(
    '/dashboard/monitors/:id/pause',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      if (!canWrite(request.user.role)) {
        reply.code(404).type('text/html')
        return notFoundPage()
      }
      const id = Number(request.params.id)
      await apiFor(request).updateMonitor(id, { enabled: false })
      return reply.redirect(`/dashboard/monitors/${id}`)
    },
  )

  app.post(
    '/dashboard/monitors/:id/resume',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      if (!canWrite(request.user.role)) {
        reply.code(404).type('text/html')
        return notFoundPage()
      }
      const id = Number(request.params.id)
      await apiFor(request).updateMonitor(id, { enabled: true })
      return reply.redirect(`/dashboard/monitors/${id}`)
    },
  )

  app.get(
    '/dashboard/monitors/:id/delete/confirm',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      if (!canWrite(request.user.role)) {
        reply.code(404).type('text/html')
        return notFoundPage()
      }
      const id = Number(request.params.id)
      const monitorRes = await apiFor(request).getMonitor(id)
      if (!monitorRes.ok) {
        reply.code(404).type('text/html')
        return notFoundPage()
      }
      reply.type('text/html')
      return renderDeleteConfirmPage(
        buildSidebarViewModel(request.user, 'monitors'),
        monitorRes.data.name,
        `/dashboard/monitors/${id}/delete`,
        `/dashboard/monitors/${id}`,
      )
    },
  )

  app.post(
    '/dashboard/monitors/:id/delete',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      if (!canWrite(request.user.role)) {
        reply.code(404).type('text/html')
        return notFoundPage()
      }
      const id = Number(request.params.id)
      await apiFor(request).deleteMonitor(id)
      return reply.redirect('/dashboard/monitors')
    },
  )

  // ---- Alert channels ----

  app.get(
    '/dashboard/alert-channels',
    async (request: FastifyRequest<{ Querystring: { flash?: string } }>, reply) => {
      const vm = await buildAlertChannelsListViewModel(
        apiFor(request),
        request.user,
        request.query.flash,
      )
      reply.type('text/html')
      return renderAlertChannelsListPage(vm)
    },
  )

  app.get('/dashboard/alert-channels/new', async (request, reply) => {
    if (!canWrite(request.user.role)) {
      reply.code(404).type('text/html')
      return notFoundPage()
    }
    const values =
      alertChannelFormValuesFromQuery(request.query as Record<string, unknown>) ??
      DEFAULT_ALERT_CHANNEL_FORM_VALUES
    reply.type('text/html')
    return renderAlertChannelFormPage({
      sidebar: buildSidebarViewModel(request.user, 'alert-channels'),
      headerLabel: 'New channel',
      actionUrl: '/dashboard/alert-channels/new',
      formGetUrl: '/dashboard/alert-channels/new',
      isEdit: false,
      values,
      errors: {},
      targetLabel: TARGET_FIELD_META[values.type].label,
      targetPlaceholder: TARGET_FIELD_META[values.type].placeholder,
      backUrl: '/dashboard/alert-channels',
    })
  })

  app.post(
    '/dashboard/alert-channels/new',
    async (request: FastifyRequest<{ Body: FormBody }>, reply) => {
      if (!canWrite(request.user.role)) {
        reply.code(404).type('text/html')
        return notFoundPage()
      }
      const values = alertChannelFormValuesFromBody(request.body)
      const errors: { name?: string; target?: string } = {}
      if (!values.name.trim()) errors.name = 'Name is required.'

      if (Object.keys(errors).length === 0) {
        const created = await apiFor(request).createAlertChannel({
          name: values.name.trim(),
          type: values.type,
          config: alertChannelFormValuesToConfig(values),
        })
        if (created.ok) return reply.redirect('/dashboard/alert-channels')
        if (created.status === 409) errors.name = 'That name is already in use.'
        else errors.name = 'Could not save channel — check the fields above.'
      }

      reply.code(422).type('text/html')
      return renderAlertChannelFormPage({
        sidebar: buildSidebarViewModel(request.user, 'alert-channels'),
        headerLabel: 'New channel',
        actionUrl: '/dashboard/alert-channels/new',
        formGetUrl: '/dashboard/alert-channels/new',
        isEdit: false,
        values,
        errors,
        targetLabel: TARGET_FIELD_META[values.type].label,
        targetPlaceholder: TARGET_FIELD_META[values.type].placeholder,
        backUrl: '/dashboard/alert-channels',
      })
    },
  )

  app.get(
    '/dashboard/alert-channels/:id/edit',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      if (!canWrite(request.user.role)) {
        reply.code(404).type('text/html')
        return notFoundPage()
      }
      const id = Number(request.params.id)
      const channelRes = await apiFor(request).getAlertChannel(id)
      if (!channelRes.ok) {
        reply.code(404).type('text/html')
        return notFoundPage()
      }
      const values =
        alertChannelFormValuesFromQuery(request.query as Record<string, unknown>) ??
        alertChannelToFormValues(channelRes.data)
      reply.type('text/html')
      return renderAlertChannelFormPage({
        sidebar: buildSidebarViewModel(request.user, 'alert-channels'),
        headerLabel: 'Edit channel',
        actionUrl: `/dashboard/alert-channels/${id}/edit`,
        formGetUrl: `/dashboard/alert-channels/${id}/edit`,
        isEdit: true,
        values,
        errors: {},
        targetLabel: TARGET_FIELD_META[values.type].label,
        targetPlaceholder: TARGET_FIELD_META[values.type].placeholder,
        backUrl: '/dashboard/alert-channels',
      })
    },
  )

  app.post(
    '/dashboard/alert-channels/:id/edit',
    async (request: FastifyRequest<{ Params: { id: string }; Body: FormBody }>, reply) => {
      if (!canWrite(request.user.role)) {
        reply.code(404).type('text/html')
        return notFoundPage()
      }
      const id = Number(request.params.id)
      const values = alertChannelFormValuesFromBody(request.body)
      const errors: { name?: string; target?: string } = {}
      if (!values.name.trim()) errors.name = 'Name is required.'

      if (Object.keys(errors).length === 0) {
        const updated = await apiFor(request).updateAlertChannel(id, {
          name: values.name.trim(),
          type: values.type,
          config: alertChannelFormValuesToConfig(values),
        })
        if (updated.ok) return reply.redirect('/dashboard/alert-channels')
        if (updated.status === 409) errors.name = 'That name is already in use.'
        else errors.name = 'Could not save channel — check the fields above.'
      }

      reply.code(422).type('text/html')
      return renderAlertChannelFormPage({
        sidebar: buildSidebarViewModel(request.user, 'alert-channels'),
        headerLabel: 'Edit channel',
        actionUrl: `/dashboard/alert-channels/${id}/edit`,
        formGetUrl: `/dashboard/alert-channels/${id}/edit`,
        isEdit: true,
        values,
        errors,
        targetLabel: TARGET_FIELD_META[values.type].label,
        targetPlaceholder: TARGET_FIELD_META[values.type].placeholder,
        backUrl: '/dashboard/alert-channels',
      })
    },
  )

  app.post(
    '/dashboard/alert-channels/:id/test',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      if (!canWrite(request.user.role)) {
        reply.code(404).type('text/html')
        return notFoundPage()
      }
      const id = Number(request.params.id)
      const result = await apiFor(request).testAlertChannel(id)
      const flash = result.data.success
        ? 'Test alert sent successfully.'
        : `Test alert failed: ${result.data.error ?? 'unknown error'}`
      return reply.redirect(`/dashboard/alert-channels?flash=${encodeURIComponent(flash)}`)
    },
  )
}
