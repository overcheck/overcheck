# ADR-004: node-pg-migrate for schema migrations

**Date:** 2026-07-07 · **Status:** accepted

## Context
The "docker compose up and it just works" quickstart goal requires migrations to run automatically at boot, independent of whichever query library is in use.

## Decision
Use `node-pg-migrate`, run programmatically via its `runner()` API from `src/index.ts` on startup.

## Alternatives considered
- **Umzug** — flexible but storage-agnostic (needs adapters); more setup than we need for a single Postgres target.
- **An ORM's bundled migrator** — rejected alongside ADR-003; would couple migrations to the query-layer choice.

## Consequences
Migrations are plain `.js` files with `up`/`down` exports, independently testable and reviewable as SQL-adjacent diffs. Running them at boot means a bad migration blocks server startup — visible immediately rather than silently skipped.
