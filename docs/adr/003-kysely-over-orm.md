# ADR-003: Kysely as the query layer, not an ORM

**Date:** 2026-07-07 · **Status:** accepted

## Context
CLAUDE.md leaves seams for probe agents and multi-tenant cloud mode — schema evolution needs to stay easy to reason about, not hidden behind an ORM's abstractions.

## Decision
Use Kysely, a type-safe SQL query builder, on top of `pg`.

## Alternatives considered
- **Prisma** — great DX, but its own migration engine and schema DSL would compete with `node-pg-migrate` and add a second source of truth for the schema.
- **Raw `pg` with no query builder** — simplest, but loses compile-time type safety on queries as the schema grows.

## Consequences
Queries stay close to SQL and are fully typed against hand-written table types. Migrations remain plain SQL, decoupled from the query layer.
