# CLAUDE.md — Project Brief for Overcheck

## Current status (update after every work session)
- 2026-07-06: Name locked: **Overcheck**. GitHub org `overcheck` and npm org `@overcheck` claimed. Domain overcheck.dev to be registered (overcheck.com is squatter-parked at ~$6K — skipping until revenue justifies). USPTO clearance check still pending — do before public launch. Next: create repo, run playbook prompt 1.1a.

## What this is
Overcheck: open-source, self-hosted uptime monitoring built for **teams and automation**, with a paid cloud tier. Owned by Baratek LLC (Fadi, solo founder, Cleveland OH). Built alongside consulting at 10–20 hrs/week. Strategy, demand data, and scope are settled — see `roadmap.md`, `feature-spec.md`, `README-draft.md` in /docs. Do not re-open idea evaluation; execute.

## Positioning (settled)
"Uptime Kuma is great until your team grows." Wedge = the top community demands Kuma has left unbuilt since 2021, verified via GitHub API (July 2026): REST API for everything (764 reactions), multi-location probes (520), multi-user (374), Postgres (228), SSO (170), config-as-code (100). Paid tier = what a volunteer project can't operate: hosted global probes, managed cloud ($19–39/mo flat), AI incident diagnosis.

## Architecture decisions (settled — don't relitigate without new evidence)
- TypeScript / Node.js backend; PostgreSQL only (no SQLite); single `docker compose up` deploy
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
