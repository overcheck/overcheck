# Overcheck

**Self-hosted uptime monitoring built for teams and automation — API-first, config-as-code, Postgres-backed.**

[![Overcheck demo](https://img.youtube.com/vi/H6YmxNRI8KQ/hqdefault.jpg)](https://youtu.be/H6YmxNRI8KQ)

Uptime Kuma is wonderful until your team grows. Then you hit the walls: no API, no config files, one user account. Overcheck starts where those walls are.

## Quickstart

```bash
git clone https://github.com/overcheck/overcheck && cd overcheck
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000) — a fresh instance drops you straight into
"Create the admin account." Set an email and password (8+ characters), and you're signed in on
the dashboard. From there, **+ New monitor** walks you through your first HTTP, TCP, ping, or
keyword check. Every write in the dashboard goes through the same REST API a script would use, so
nothing here is dashboard-only.

Contributing or want to build from source instead of pulling the published image?

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

Monitors and alert channels can also be managed via the REST API (docs at `/api/docs`), or
declared in YAML and applied with `@overcheck/cli`:

```bash
overcheck apply -f monitors.yaml
```

See [docs/config-as-code.md](docs/config-as-code.md) for the full YAML schema and CLI usage.

## Why Overcheck

|  | Overcheck | Uptime Kuma | Gatus |
|---|---|---|---|
| REST API (mutable, CRUD) | ✅ first-class | ❌ internal Socket.IO API, not supported for third-party use; REST covers only badges/push/metrics ([#118](https://github.com/louislam/uptime-kuma/issues/118), open since 2021) | ❌ config is YAML-only (live-reload); API is read-only + external status push — no monitor CRUD |
| Config-as-code | ✅ YAML + `overcheck apply` | ❌ | ✅ YAML-native — arguably more mature than ours; it's the *only* way to configure Gatus |
| Multi-user + roles | ✅ admin/editor/viewer | ❌ no roles; multi-user in infancy (users can't share monitors) | ❌ no users/roles — single shared access behind Basic/OIDC login |
| Postgres | ✅ Postgres-native, only supported backend | SQLite default; MariaDB supported (2.0+) | ✅ supported (alongside SQLite/in-memory) |
| Multi-location checks | roadmap (Overcheck Cloud, not yet built) | ❌ single location | ❌ single instance |
| Self-hosted, open source | ✅ AGPL-3.0 | ✅ MIT | ✅ Apache-2.0 |
| Price for a small team | $0 self-hosted / cloud planned | $0 | $0 |

Gatus and Uptime Kuma are both good tools solving different problems — Gatus especially if you
want pure YAML-in-Git with no database of its own. Overcheck's bet is a real API and multi-user
roles on top of config-as-code, for teams that outgrow a single YAML file redeployed by hand.

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
overcheck apply -f monitors.yaml   # or POST /api/monitors — same thing
```

## What's in the box

- **Checks:** HTTP(S), TCP, ping, keyword — with retries, degraded state, and downtime-duration in every alert
- **Teams:** admin / editor / viewer roles; OIDC SSO on the roadmap
- **Alerting:** Slack, email, webhooks
- **Status pages:** branded, public, per-group monitors, response-time graphs, selectable
  24h/7d/30d/90d uptime windows, incident history — server-rendered at `/status/:slug`, no
  client-side framework
- **API:** everything the UI does, documented with OpenAPI — interactive docs at `/api/docs`. The UI is just an API client.

Check history is kept for `CHECK_RETENTION_DAYS` (default 90 days, up from 30 — the status
page's 90-day uptime bar needs that much history). Lower it if disk is tight on a
high-frequency-monitor deployment; see [config-as-code.md](docs/config-as-code.md#check-retention).

## Project status

Early. The roadmap is the issue tracker: the most-upvoted issue gets built next.

Architecture, review, and all merge decisions are human-owned — see [docs/adr/](docs/adr/) for
the record.

**Star the repo to follow along. File an issue to shape what's next.**

---
License: [AGPL-3.0](LICENSE) (core) · [Config-as-code docs](docs/config-as-code.md) · [Roadmap](https://github.com/overcheck/overcheck/issues)
