# ADR-008: typebox + @fastify/swagger for validation and OpenAPI docs

**Date:** 2026-07-07 · **Status:** accepted

## Context
Every REST endpoint needs input validation and must appear in an auto-generated OpenAPI spec (CLAUDE.md's API-first rule). ADR-002 already chose Fastify partly for this; building it out required picking a schema library and bumped Fastify itself from ^4.28.1 to ^5.10.0, since current `@fastify/swagger`/`@fastify/bearer-auth` majors target Fastify v5's plugin API — a low-risk bump this early, before the app has real users.

## Decision
Use `@sinclair/typebox` to write route schemas (`Type.Object(...)`), which are plain JSON Schema at runtime — Fastify's bundled ajv validates them directly, no extra plugin required. Register `@fastify/swagger` + `@fastify/swagger-ui` to generate the OpenAPI spec and serve interactive docs at `/api/docs`. Route handlers use Fastify's own per-route generics (`FastifyRequest<{ Body: Static<typeof Schema> }>`) for TS types rather than `@fastify/type-provider-typebox` — the type-provider only saves threading one generic through function signatures and wasn't worth the added dependency.

## Alternatives considered
- **Zod** — popular, but needs `zod-to-json-schema` (or `fastify-type-provider-zod`) to bridge to Fastify's ajv-based validation/OpenAPI generation; typebox produces JSON Schema natively.
- **Hand-written JSON Schema objects** — no extra dependency, but no static TS types and far more verbose for ~10 endpoints across 3 resources.

## Consequences
One schema per resource drives validation, response shape, and OpenAPI docs simultaneously — no separate DTO layer to keep in sync. Cross-field rules (e.g. "httpUrl required when type is http/keyword") aren't expressible in a flat typebox object and are checked in handler code instead, matching the same call already made for the DB schema (ADR isn't duplicated here — see the inline comment in `routes/monitors.ts`).
