# CLAUDE.md — Project Brief for Overcheck

## Current status (update after every work session)
- 2026-07-07: Milestone 1.3a done: multi-user auth (email+password, sessions, roles admin/editor/viewer) per feature-spec item 5. Static `API_KEY` bearer auth (ADR-009) fully retired — replaced with opaque session tokens (scrypt-hashed passwords, sha256-hashed tokens in a new `sessions` table, migration 1700000000004) per ADR-010. `POST /api/auth/register` bootstraps the first admin (open only while `users` is empty, closed after); `/api/auth/login`, `/logout`, `/me`; admin-only `/api/users` CRUD with a last-admin lockout guard and self-service GET/PATCH (email/password, not role). `requireRole()` preHandler gates monitors/alert-channels/status-pages (GET=viewer+, writes=editor+) and user management (admin, except self). CLI untouched and still builds/typechecks — it authenticates via the same `Authorization: Bearer` header, just needs a token from login now instead of a static key; giving it a `login` command is a follow-up, not done here. 61 server tests (added auth/users/permission-boundary suites) + 15 CLI tests pass; repo-wide lint/format clean; manually smoke-tested register→login→role-boundary flow against a live server. Next: give the CLI a login flow, or move to Milestone 1.3b (alerting) per execution-playbook.md.
- 2026-07-07: Milestone 1.2b done: `@overcheck/cli` (`overcheck apply -f file.yaml` / `overcheck export`), YAML schema for monitors + alert channels, docs at docs/config-as-code.md. Reconciliation matches by `name`, now enforced unique server-side for monitors and alert channels (migration 1700000000003 + 409 on conflict) — status pages stay out of apply/export scope for now (slug-based, separate). Verified end-to-end against a live server: create/update/delete/no-op all behave correctly, export round-trips cleanly through apply. All 42 server tests + 15 CLI tests pass; repo-wide lint/format clean. Next: Milestone 1.3a (multi-user auth) per execution-playbook.md, or start dogfooding on real client infra per the 1.2 exit criteria.
- 2026-07-06: Name locked: **Overcheck**. GitHub org `overcheck` and npm org `@overcheck` claimed. Domain overcheck.dev to be registered (overcheck.com is squatter-parked at ~$6K — skipping until revenue justifies). USPTO clearance check still pending — do before public launch. Next: create repo, run playbook prompt 1.1a.

## What this is
Overcheck: open-source, self-hosted uptime monitoring built for **teams and automation**, with a paid cloud tier. Owned by Baratek LLC (Fadi, solo founder, Cleveland OH). Built alongside consulting at 10–20 hrs/week. Strategy, demand data, and scope are settled — see `roadmap.md`, `feature-spec.md`, `README-draft.md` in /docs. Do not re-open idea evaluation; execute.

## Positioning (settled)
"Uptime Kuma is great until your team grows." Wedge = the top community demands Kuma has left unbuilt since 2021, verified via GitHub API (July 2026): REST API for everything (764 reactions), multi-location probes (520), multi-user (374), Postgres (228), SSO (170), config-as-code (100). Paid tier = what a volunteer project can't operate: hosted global probes, managed cloud ($19–39/mo flat), AI incident diagnosis.

## Architecture decisions (settled — don't relitigate without new evidence)
- TypeScript / Node.js backend; PostgreSQL only (no SQLite); single `docker compose up` deploy
- Node.js: 24.x (Active LTS)
- **API-first:** every capability is a REST endpoint with OpenAPI spec; the web UI is just an API client
- Monitors definable in YAML (`overcheck apply -f monitors.yaml`) and via API and UI; YAML is first-class
- Auth: email+password with roles (admin/editor/viewer) in v1; OIDC in v1.x
- License: AGPL-3.0 core; cloud/probe code proprietary
- npm packages publish under the `@overcheck` scope (e.g. `@overcheck/cli`)
- Leave seams for: probe agents (remote check runners), multi-tenant cloud mode, pluggable diagnosis hooks. Do NOT build these in v1.

## v1 scope (from feature-spec.md — build in this order)
1. Check engine: HTTP(S), TCP, ping, keyword; retries; intervals ≥10s; degraded state (slow-response) as first-class status
2. Postgres storage + configurable retention
3. REST API + OpenAPI docs
4. YAML config-as-code + CLI apply
5. Multi-user auth + roles
6. Alerts: Slack, email, generic webhook (downtime duration + degraded-state alerts included in every alert)
7. Status pages: public, branded, response-time graph, selectable uptime window
8. 5-minute quickstart: docker compose, seed data

## Explicitly out of scope for v1
90+ notification providers, mobile app, plugins, HA/clustering, Docker auto-discovery, host-metrics agents, SAML/SCIM.

## v1.x scope (fast follows, still free — not v1, not "maybe never")
OIDC SSO · maintenance windows with status-page announcements · SSL/TCP-port cert checks · status-page email subscriptions · Prometheus metrics endpoint · YAML round-trip export (UI edits → YAML)

## Quality bar
- A stranger must go zero → monitoring in 5 minutes on a clean VPS
- Every architectural choice gets a one-line ADR in /docs/adr/
- Tests on the check engine and API; UI can be thinner early

## Milestones & the honest yardsticks
- Month 3: v1 done, dogfooding on Baratek client infra
- Month 4: launch (README polish → Show HN → r/selfhosted → Product Hunt). Success = 300–1,000 stars, organic installs, stranger-filed issues. <100 stars after two launch attempts = reassess positioning before more code.
- Months 5–8: ship top community asks; build cloud tier + hosted probes
- Months 9–12: AI diagnosis (paid); target $500–2,000 MRR by month 12. Median path to $10K MRR is 12–18 months from first paying customer — do not panic early.

## Business rules
- All revenue through Baratek LLC. Wave category "Product/SaaS Revenue," 30% tax reserve.
- Resolve Ohio SaaS sales tax with CPA (Sept meeting) BEFORE first paid subscription.
- Repo/domain/cloud accounts owned by Baratek (fadi@baratek.com), not personal.
- USPTO trademark clearance for "Overcheck" (classes 9 & 42) before public launch.

## Working style Fadi expects
Direct recommendations over option lists. Name tradeoffs honestly. Small shippable increments. Never add post-launch features nobody asked for — the issue tracker is the roadmap.
