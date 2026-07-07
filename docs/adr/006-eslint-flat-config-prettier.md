# ADR-006: ESLint flat config + typescript-eslint + Prettier

**Date:** 2026-07-07 · **Status:** accepted

## Context
The project starts fresh in 2026 with no legacy config to carry forward, and needs consistent lint/format across the workspace root and all packages.

## Decision
Use ESLint 9's flat config (`eslint.config.js`) with `typescript-eslint`'s recommended rules, and Prettier for formatting (no ESLint formatting rules).

## Alternatives considered
- **Legacy `.eslintrc` cascade** — still supported but deprecated in favor of flat config; no reason to start a new project on the old format.
- **ESLint-based formatting (e.g. `eslint-plugin-prettier`)** — runs Prettier through ESLint, slower and conflates two different jobs (linting vs formatting).

## Consequences
One `eslint.config.js` at the root covers all workspace packages. `npm run lint` and `npm run format` are separate, fast commands.
