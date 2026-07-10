# overcheck

Self-hosted uptime monitoring built for teams and automation — API-first, config-as-code,
Postgres-backed.

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
