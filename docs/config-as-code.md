# Config-as-code

Monitors and alert channels can be declared in a YAML file and synced to a running Overcheck
instance with `@overcheck/cli`, instead of (or alongside) the API/UI. This is the same mechanism
you'd use to keep monitor definitions in git and apply them on deploy.

Status pages are not yet covered by `apply`/`export` — manage those via the API or UI for now.

## Install

```bash
npm install -g @overcheck/cli
```

Or run it from the repo during development:

```bash
npm run build -w packages/cli
node packages/cli/dist/index.js <command>
```

## Authentication

The CLI talks to the same REST API as the UI, using the same bearer API key.

```bash
export OVERCHECK_URL=https://monitor.example.com   # default: http://localhost:3000
export OVERCHECK_API_KEY=...                        # required
```

Both can also be passed as flags: `--url` and `--api-key`.

## `overcheck apply`

```bash
overcheck apply -f monitors.yaml
overcheck apply -f monitors.yaml --dry-run   # show the plan without applying it
```

`apply` reads the YAML file, fetches the current monitors and alert channels from the API, and
reconciles the difference:

- an entry with no matching resource (by `name`) is **created**
- an entry whose fields differ from the matching resource is **updated** (only the changed
  fields are sent — omitted optional fields are left alone, so partial YAML entries don't reset
  values you didn't set)
- a resource with no matching entry in the YAML is **deleted**
- everything else is left untouched

`name` is the key used to match YAML entries to existing resources — it must be unique within
each of `monitors` and `alertChannels`, and the API enforces uniqueness server-side too (a
duplicate name returns `409 Conflict`). Renaming an entry in YAML is treated as create + delete,
not a rename in place.

Run `apply` again with the same file and nothing happens — it's idempotent.

## `overcheck export`

```bash
overcheck export                        # prints YAML to stdout
overcheck export -o monitors.yaml       # writes to a file
```

Dumps the current monitors and alert channels as YAML in the same shape `apply` expects, so you
can bootstrap a YAML file from state created via the UI or API, or check current state into git.

## Schema reference

### `monitors`

A list of monitor entries. `name`, `type`, and `intervalSeconds` are always required; which of
the remaining fields are required depends on `type`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Unique. Used to match this entry to an existing monitor. |
| `type` | `http` \| `tcp` \| `ping` \| `keyword` | yes | |
| `intervalSeconds` | integer (≥10) | yes | Minimum check interval is 10 seconds. |
| `enabled` | boolean | no | Defaults to `true` on create. |
| `timeoutMs` | integer (≥1) | no | Defaults to `5000`. |
| `retries` | integer (≥0) | no | Defaults to `0`. |
| `degradedAfterMs` | integer (≥0) | no | Response time above this marks the check "degraded" rather than "up". Defaults to `2000`. |
| `httpUrl` | string | required for `http`, `keyword` | |
| `httpMethod` | string | no | Defaults to `GET`. |
| `httpExpectedStatus` | integer | no | Defaults to `200`. |
| `httpBodyContains` | string | required for `keyword` | Response body substring to match. |
| `host` | string | required for `tcp`, `ping` | |
| `port` | integer (1–65535) | required for `tcp` | |
| `alertChannels` | string[] | no | Names of `alertChannels` entries (in this file or already on the server) to assign to this monitor. Reconciled separately from the rest of the entry: unlike other fields, it's a full-replace of the monitor's assignments, applied after all monitors and alertChannels in the file have been created/updated, so a channel defined earlier in the same file can be referenced immediately. Omitting the field leaves existing assignments untouched; an empty list (`alertChannels: []`) clears them. |

### `alertChannels`

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Unique. Used to match this entry to an existing alert channel. |
| `type` | `slack` \| `webhook` \| `email` | yes | |
| `config` | object | yes | Shape depends on `type` (e.g. `webhookUrl` for `slack`/`webhook`). |
| `enabled` | boolean | no | Defaults to `true` on create. |

## Full example

```yaml
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
    retries: 1

  - name: db-primary
    type: tcp
    host: db.internal
    port: 5432
    intervalSeconds: 15

  - name: gateway-ping
    type: ping
    host: gateway.internal
    intervalSeconds: 20
    enabled: false

alertChannels:
  - name: oncall-slack
    type: slack
    config:
      webhookUrl: https://hooks.slack.com/services/T000/B000/XXXX

  - name: status-webhook
    type: webhook
    config:
      url: https://example.com/hooks/overcheck
    enabled: true
```

Applying this file with `overcheck apply -f monitors.yaml` creates four monitors and two alert
channels (or updates/deletes them to match, if they already exist under different settings).
