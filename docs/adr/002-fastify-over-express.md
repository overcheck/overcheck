# ADR-002: Fastify as the web framework

**Date:** 2026-07-07 · **Status:** accepted

## Context
CLAUDE.md's API-first rule requires every capability to be a documented REST endpoint with an OpenAPI spec, and the UI must be able to run entirely on that API.

## Decision
Use Fastify for the HTTP layer.

## Alternatives considered
- **Express** — largest ecosystem, but no built-in schema validation and OpenAPI generation needs extra glue (e.g. `express-openapi-validator`) bolted on after the fact.
- **Hono** — fast and modern, but its OpenAPI/Swagger story is less mature than Fastify's `@fastify/swagger`.

## Consequences
Route schemas double as request validation and OpenAPI source of truth, so the spec can't drift from the code. Adds Fastify's plugin model as a concept the team has to learn.
