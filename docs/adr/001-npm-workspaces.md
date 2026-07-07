# ADR-001: npm workspaces for the monorepo

**Date:** 2026-07-07 · **Status:** accepted

## Context
`@overcheck/cli` and the server will ship as separate npm packages under the `@overcheck` scope, with a web UI package to follow. We need a monorepo layout now rather than re-scaffolding later.

## Decision
Use npm workspaces (`"workspaces": ["packages/*"]` in the root `package.json`). No pnpm/yarn.

## Alternatives considered
- **pnpm workspaces** — faster installs, but requires contributors to install pnpm globally; no benefit yet at this scale.
- **Single package, no workspace** — simplest, but the CLI would need to be split out later anyway.

## Consequences
Contributors only need Node + npm. Adds `-w packages/<name>` to workspace-scoped commands. Revisit if install/CI times become painful across many packages.
