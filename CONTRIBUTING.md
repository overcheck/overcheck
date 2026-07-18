# Contributing to Overcheck

Thanks for taking a look. Overcheck is early — issues and PRs from strangers are exactly what
shapes the v1 roadmap.

## Running it locally

```bash
git clone https://github.com/overcheck/overcheck && cd overcheck
npm install
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

Or run just Postgres via Docker and the server from source (there's no `.env` auto-loading, so
`DATABASE_URL` needs to be exported before `npm run dev`):

```bash
docker compose up -d postgres
export DATABASE_URL=postgres://overcheck:overcheck@localhost:5432/overcheck
npm run dev
```

## Running tests

Tests run against a real Postgres database (no mocked DB layer) — start it first:

```bash
docker compose up -d postgres
npm test                # server package (default `npm test`)
npm run test -w packages/cli
```

The server test suite creates its own `overcheck_test` database and runs migrations
automatically against `TEST_DATABASE_URL` (defaults to
`postgres://overcheck:overcheck@localhost:5432/overcheck_test`, matching the compose defaults).

## Before opening a PR

```bash
npm run lint
npm run format:check    # or `npm run format` to auto-fix
npm run typecheck
npm test
```

CI runs the same checks (lint, typecheck, server tests against a real Postgres service
container, CLI tests, and a build) on every push and PR — see `.github/workflows/ci.yml`.

## Code style

- Prettier (no semicolons, single quotes, 100-char print width) and ESLint (flat config,
  `typescript-eslint` recommended rules) are enforced in CI, not just suggested — `npm run
format` / `npm run lint` before pushing.
- Every non-obvious architectural choice gets a one-line ADR in `docs/adr/` (see the existing
  ones for the format). If your PR makes a real design decision — a new dependency, a new
  storage pattern, a tradeoff that isn't self-evident from the code — add one.

## Review process

All PRs are reviewed and merged by the maintainer (currently a single person). Small, focused
PRs get reviewed faster than large ones. If you're planning a bigger change, open an issue first
to align on approach before writing a lot of code.

## AI-assisted contributions

AI-assisted contributions (Claude, Copilot, or similar) are welcome — Overcheck's own
implementation is built this way. The bar is the same as for any PR: you, the human submitting
it, need to understand what the code does, be able to explain and defend the design choices in
review, and have actually run it. Don't submit generated code you haven't read or tested. If a
PR is substantially AI-generated, say so in the description — that's normal here, not a red
flag, but reviewers should know what they're reading.

## Reporting bugs / requesting features

Open a GitHub issue. Include repro steps for bugs (or a failing test, if you can). The roadmap
is driven by the issue tracker — the most-upvoted issue gets built next.

## Reporting security vulnerabilities

Do not open a public issue — see [SECURITY.md](SECURITY.md).
