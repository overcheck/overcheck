# Overcheck Feature Spec — Mined from Real Demand (Uptime Kuma issue tracker, July 2026)

**Method:** Uptime Kuma's 690 open issues ranked by community reactions via GitHub API. Reaction counts below are actual, pulled 2026-07-06. This spec is demand-ordered, not invented.

## The headline finding

The top 3 most-demanded features, by a wide margin, are exactly Overcheck's thesis:

| Rank | Reactions | Issue | Request | Overcheck's answer |
|---|---|---|---|---|
| 1 | **764** | #118 (open since 2021) | **API functionality** | API-first core — every feature is an endpoint |
| 2 | **520** | #84 (open since 2021) | **Remote executors (multi-location checks)** | Probe agents; hosted probes = paid tier |
| 3 | **374** | #128 (open since 2021) | **Multi-user management** | Users + roles in v1 |
| 4 | 320 | #1888 | Configurable heartbeat history range | Trivial for us — Postgres, not SQLite |
| 5 | **228** | #959 | **PostgreSQL support** | Postgres-native from day one |
| 6 | **170** | #553 | **SSO (OIDC/SAML)** | OIDC in v1.x, SAML later |
| 7 | **100** | #1354 | **Config-file monitors (config-as-code)** | YAML monitors in Git, first-class |
| 8 | 97 | #2389 | Upcoming maintenance on status pages | Maintenance windows v1.x |
| 9 | 88 | #986 | Uptime % interval choice on status page | v1 |
| 10 | 86 | #637 | Response-time graph on status page | v1 |
| — | 82 | #1079 | SSL checks on arbitrary TCP ports | v1.x |
| — | 70 | #177 | Downtime duration in notifications | v1 (easy, loved) |
| — | 69 | #916 | Email subscriptions on status pages | v1.x |
| — | 66 | #1089 | Dependent/hierarchical monitors | v2 |
| — | 55 | #455 | Bulk edit | API makes this free |
| — | 49 | #2462 | Notifications on maintenance start/end | v1.x |
| — | 42 | #1813 | Slow-response (degraded) alerts | v1 — great differentiator |

**Read on the data:** ~2,150 reactions across the top 6 issues, all aligned with "teams + automation," all open for years. Kuma's maintainers have effectively conceded this segment.

## MVP v1 (open-source core) — build order

1. **Check engine:** HTTP(S), TCP, ping, keyword; intervals ≥10s; retries; degraded state (slow response) as first-class status (#1813)
2. **Postgres storage** (#959) with configurable retention (#1888)
3. **REST API for everything** (#118) — OpenAPI spec published; UI consumes the same API
4. **Config-as-code:** monitors declared in YAML, applied via `overcheck apply` CLI or API (#1354); UI edits can export back to YAML
5. **Multi-user:** email+password auth, roles = admin / editor / viewer (#128)
6. **Alerting:** Slack, generic webhook, email — with downtime duration (#177) and degraded alerts
7. **Status pages:** public, branded, per-group; uptime % with selectable window (#986); response-time graph (#637)
8. **Single `docker compose up` deploy**, seed data, 5-minute quickstart

## v1.x (fast follows, still free)
OIDC SSO (#553) · maintenance windows with status-page announcement (#2389, #2462) · SSL/TCP-port cert checks (#1079) · status-page email subscriptions (#916) · Prometheus metrics endpoint

## Paid tier (Overcheck Cloud) — things a free project structurally cannot run
- **Hosted multi-location probes** (#84 — 520 reactions of pre-validated demand): 3–5 global regions, consensus checks to kill false positives
- **Managed cloud instance** ($19–39/mo flat): zero self-hosting
- **AI incident diagnosis:** root-cause hypothesis + suggested fix posted to Slack on failure (Phase 4)
- Later: SAML/SCIM, audit logs, 20+ seat tier ($79–149)

## Explicitly NOT building
90+ notification providers (Kuma's moat, low value per provider) · mobile app · plugin system · clustering/HA in v1 · Docker container auto-discovery (#957) and host-metrics agents (#819) — different product category, revisit post-v1.

## Name — DECIDED 2026-07-06
**Overcheck.** Vetted against the market: no software product collisions found; overcheck.com is squatter-parked (~$6K — skip until revenue justifies); launching on **overcheck.dev**. GitHub org `overcheck` and npm scope `@overcheck` secured. Remaining: register overcheck.dev, USPTO classes 9 & 42 clearance before public launch. Rejected candidates and why: Vigil (established OSS monitoring tool, direct collision), Uptimely (multiple active monitoring products), Probewell (established instruments company), Pingdeck (domain taken), Statushawk (parked .com at broker prices).
