# overcheck

Self-hosted uptime monitoring built for teams and automation — API-first, config-as-code,
Postgres-backed.

## Quickstart

```bash
git clone https://github.com/overcheck/overcheck && cd overcheck
docker compose up -d
```

Monitors and alert channels can be managed via the REST API (docs at `/api/docs`), or declared in
YAML and applied with `@overcheck/cli`:

```bash
overcheck apply -f monitors.yaml
```

See [docs/config-as-code.md](docs/config-as-code.md) for the full YAML schema and CLI usage.
