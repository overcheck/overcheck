import type { FastifyInstance } from 'fastify'

export type FormBody = Record<string, string | string[]>

function parseFormBody(raw: string): FormBody {
  const params = new URLSearchParams(raw)
  const result: FormBody = {}
  for (const [key, value] of params) {
    const existing = result[key]
    if (existing === undefined) result[key] = value
    else result[key] = Array.isArray(existing) ? [...existing, value] : [existing, value]
  }
  return result
}

/** Dashboard forms POST as plain `application/x-www-form-urlencoded` (no JS-driven
 * fetch/JSON) — Fastify has no built-in parser for that content type, and this app
 * hand-rolls the parse (via the built-in `URLSearchParams`) rather than adding
 * `@fastify/formbody`, consistent with the rest of the codebase's minimal-dependency style.
 * Repeated keys (e.g. multiple checked `alertChannelIds` checkboxes) become string arrays. */
export function registerFormBodyParser(app: FastifyInstance): void {
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => {
      try {
        done(null, parseFormBody(body as string))
      } catch (err) {
        done(err as Error, undefined)
      }
    },
  )
}

export function formString(body: FormBody, key: string): string {
  const value = body[key]
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

export function formStringArray(body: FormBody, key: string): string[] {
  const value = body[key]
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}
