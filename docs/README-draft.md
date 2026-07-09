# Overcheck

**Self-hosted uptime monitoring built for teams and automation — API-first, config-as-code, Postgres-backed.**

Uptime Kuma is wonderful until your team grows. Then you hit the walls: no API, no config files, one user account, SQLite. Overcheck starts where those walls are.

```bash
# up and monitoring in under 5 minutes
git clone https://github.com/overcheck/overcheck && cd overcheck
docker compose up -d
```

## Why Overcheck

|  | Overcheck | Uptime Kuma | Better Stack / hosted |
|---|---|---|---|
| REST API for everything | ✅ first-class | ❌ ([#118](https://github.com/louislam/uptime-kuma/issues/118), open since 2021) | ✅ |
| Monitors as code (YAML in Git) | ✅ | ❌ | partial |
| Multi-user with roles | ✅ | ❌ single user | ✅ |
| PostgreSQL | ✅ native | ❌ SQLite | n/a |
| Multi-location checks | ✅ probes (cloud) | ❌ single location | ✅ |
| Self-hostable, open source | ✅ AGPL | ✅ | ❌ |
| Price for a small team | $0 self-hosted / $29 cloud | $0 | $100–200+/mo |

## Monitors as code

```yaml
# monitors.yaml — version-controlled, applied on deploy
monitors:
  - name: marketing-site
    type: http
    httpUrl: https://example.com
    intervalSeconds: 60
    degradedAfterMs: 800   # alert on slow, not just down
    alertChannels: [oncall-slack]

  - name: api-health
    type: keyword
    httpUrl: https://api.example.com/health
    httpBodyContains: '"status":"ok"'
    intervalSeconds: 30

alertChannels:
  - name: oncall-slack
    type: slack
    config:
      webhookUrl: https://hooks.slack.com/services/T000/B000/XXXX
```

```bash
overcheck apply -f monitors.yaml   # or POST /api/v1/monitors — same thing
```

## What's in the box

- **Checks:** HTTP(S), TCP, ping, keyword — with retries, degraded state, and downtime-duration in every alert
- **Teams:** admin / editor / viewer roles; OIDC SSO on the roadmap
- **Alerting:** Slack, email, webhooks
- **Status pages:** branded, public, per-group monitors, response-time graphs, selectable
  24h/7d/30d/90d uptime windows, incident history — server-rendered at `/status/:slug`, no
  client-side framework
- **API:** everything the UI does, documented with OpenAPI. The UI is just an API client.

Check history is kept for `CHECK_RETENTION_DAYS` (default 90 days, up from 30 — the status
page's 90-day uptime bar needs that much history). Lower it if disk is tight on a
high-frequency-monitor deployment; see [config-as-code.md](config-as-code.md#check-retention).

## Overcheck Cloud (optional, funds the project)

Self-hosting is free forever. Cloud adds what self-hosting can't:
- **Global probes** — checks from 5 regions with consensus, so a blip at your datacenter isn't a false page at 3 AM
- **Zero-ops hosting** — $29/mo flat, no per-monitor pricing games
- **AI incident diagnosis** *(coming)* — "here's why it broke and the likely fix," in Slack, before you've opened a terminal

## Project status

Early. Built in the open by [Baratek](https://baratek.com), funded by consulting, not VC — which means no rug-pulls and no pivot-to-enterprise ghosting. Roadmap is the issue tracker; the most-upvoted issue gets built next.

**Star the repo to follow along. File an issue to shape v1.**

---
License: AGPL-3.0 (core) · [overcheck.dev](https://overcheck.dev) · [Docs] · [Live demo] · [Roadmap]
