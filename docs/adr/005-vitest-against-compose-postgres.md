# ADR-005: vitest against the docker-compose Postgres, no testcontainers

**Date:** 2026-07-07 · **Status:** accepted

## Context
Tests need a real Postgres to exercise the DB layer and health check. The dev environment already provisions one via `docker-compose.yml`.

## Decision
Use vitest, with tests running against a second database (`overcheck_test`) in the same compose Postgres instance rather than spinning up isolated containers per run.

## Alternatives considered
- **testcontainers-node** — full isolation per test run, but adds a dependency and requires Docker-from-Docker in CI for one test suite; premature at this stage.
- **In-memory/mocked Postgres (e.g. pg-mem)** — fast, but risks divergence from real Postgres behavior on the exact things worth testing (constraints, migrations).

## Consequences
Tests require `docker compose up` to be running first — documented in the README/quickstart. Revisit testcontainers if CI parallelism later causes cross-run interference on the shared test DB.
