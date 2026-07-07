# ADR-010: session-token auth with scrypt password hashing (retires ADR-009)

**Date:** 2026-07-07 · **Status:** accepted

## Context
ADR-009's static `API_KEY` was an explicit placeholder pending feature-spec item 5: email+password auth with admin/editor/viewer roles. The API is bearer-token-based (CLI and future UI both use `Authorization: Bearer <token>`), so the replacement needs to keep that shape while adding per-user identity, revocable sessions, and role checks.

## Decision
Passwords hashed with `node:crypto`'s built-in `scryptSync` (`salt:hash`, base64, compared with `timingSafeEqual`) — no new dependency, no native build step. Login/registration issue an opaque 256-bit random token; only its SHA-256 hash is stored, in a `sessions` table with an `expires_at` (`SESSION_TTL_HOURS`, default 168h). Every request re-validates the token against that table; logout deletes the row. `POST /api/auth/register` only succeeds while `users` is empty (bootstraps the first admin); all further users are created via admin-only `POST /api/users`. `requireRole(min)` is a Fastify preHandler ranking viewer < editor < admin.

## Alternatives considered
- **JWT session tokens** — no DB lookup per request, but no instant revocation on logout/role change without an extra denylist, which defeats the point.
- **bcrypt/argon2 for passwords** — better-studied for this exact purpose, but both need native or WASM bindings, adding a Docker build step this project's "5-minute quickstart" goal doesn't need.
- **Keep `API_KEY` for CLI/automation alongside user sessions** — not in feature-spec item 5's scope; would be throwaway/duplicate auth paths to maintain.

## Consequences
Every authenticated request costs one indexed DB lookup, acceptable for a self-hosted single instance. Logout and role changes take effect immediately. This retires ADR-009's static key entirely — `@fastify/bearer-auth` is removed. The CLI's `--api-key` flag now has nothing to authenticate against; giving it a login flow is a follow-up, not part of this change.
