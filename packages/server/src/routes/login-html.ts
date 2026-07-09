import { Type, type Static } from '@sinclair/typebox'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Kysely } from 'kysely'
import {
  clearSessionCookie,
  createSession,
  extractSessionToken,
  hashToken,
  setSessionCookie,
  verifyPassword,
} from '../auth.js'
import type { Database } from '../db/client.js'
import { escapeHtml } from '../dashboard/html.js'

const DEFAULT_NEXT = '/dashboard'

/** Only ever redirect within this app — an unvalidated `?next=` would be an open redirect. */
function safeNext(next: unknown): string {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//')) {
    return DEFAULT_NEXT
  }
  return next
}

function renderLoginPageHtml(opts: { next: string; error?: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sign in — Overcheck</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    background:oklch(0.16 0.006 250); font-family:'IBM Plex Sans', system-ui, sans-serif; color:oklch(0.9 0.005 250); }
  .card { width:340px; max-width:calc(100vw - 32px); background:oklch(0.19 0.006 250);
    border:1px solid oklch(0.27 0.006 250); border-radius:8px; padding:28px 26px; box-sizing:border-box; }
  .brand { display:flex; align-items:center; gap:8px; margin-bottom:22px; }
  .brand-mark { width:20px; height:20px; border-radius:5px; background:oklch(0.55 0.16 250); flex:none; }
  .brand-name { font-weight:600; font-size:14px; }
  label { display:block; font-size:11.5px; font-weight:600; color:oklch(0.65 0.01 250); margin-bottom:6px; }
  input { width:100%; background:oklch(0.2 0.006 250); border:1px solid oklch(0.3 0.006 250);
    color:oklch(0.9 0.005 250); font:13px 'IBM Plex Sans', sans-serif; padding:8px 10px; border-radius:6px;
    outline:none; box-sizing:border-box; margin-bottom:16px; }
  button { width:100%; background:oklch(0.55 0.16 250); border:none; color:#fff; font:600 12.5px 'IBM Plex Sans', sans-serif;
    padding:9px 14px; border-radius:6px; cursor:pointer; }
  .error { font-size:11.5px; color:oklch(0.62 0.18 25); margin:-8px 0 16px; }
</style>
</head>
<body>
  <div class="card">
    <div class="brand"><div class="brand-mark"></div><div class="brand-name">Overcheck</div></div>
    <form method="POST" action="/login">
      <input type="hidden" name="next" value="${escapeHtml(opts.next)}" />
      ${opts.error ? `<div class="error">${escapeHtml(opts.error)}</div>` : ''}
      <label for="email">Email</label>
      <input id="email" name="email" type="email" required autofocus />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" required />
      <button type="submit">Sign in</button>
    </form>
  </div>
</body>
</html>`
}

const LoginFormBody = Type.Object({
  email: Type.String(),
  password: Type.String(),
  next: Type.Optional(Type.String()),
})
type LoginFormBodyT = Static<typeof LoginFormBody>

/**
 * Browser-facing login/logout, distinct from the JSON `/api/auth/login` used by the CLI.
 * Sets an HttpOnly session cookie (reusing the same `sessions` table and token as the
 * bearer-token flow) so server-rendered dashboard pages can authenticate a normal page load.
 */
export function registerLoginHtmlRoute(
  app: FastifyInstance,
  db: Kysely<Database>,
  sessionTtlHours: number,
  secureCookies: boolean,
): void {
  app.get(
    '/login',
    async (request: FastifyRequest<{ Querystring: { next?: string } }>, reply) => {
      reply.type('text/html')
      return renderLoginPageHtml({ next: safeNext(request.query.next) })
    },
  )

  app.post(
    '/login',
    { schema: { body: LoginFormBody } },
    async (request: FastifyRequest<{ Body: LoginFormBodyT }>, reply) => {
      const next = safeNext(request.body.next)
      const user = await db
        .selectFrom('users')
        .selectAll()
        .where('email', '=', request.body.email)
        .executeTakeFirst()

      if (!user || !verifyPassword(request.body.password, user.password_hash)) {
        reply.code(401).type('text/html')
        return renderLoginPageHtml({ next, error: 'Invalid email or password.' })
      }

      const token = await createSession(db, user.id, sessionTtlHours)
      setSessionCookie(reply, token, sessionTtlHours, secureCookies)
      return reply.redirect(next)
    },
  )

  app.post('/logout', async (request, reply) => {
    const token = extractSessionToken(request)
    if (token) {
      await db.deleteFrom('sessions').where('token_hash', '=', hashToken(token)).execute()
    }
    clearSessionCookie(reply, secureCookies)
    return reply.redirect('/login')
  })
}
