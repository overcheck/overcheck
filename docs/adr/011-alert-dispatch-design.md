# ADR-011: in-process alert dispatch, no state table or queue

**Date:** 2026-07-08 · **Status:** accepted

## Context
Feature-spec item 6 needs Slack/webhook/email alerts fired on monitor state transitions,
each carrying the monitor name, new state, and downtime duration on recovery, plus
per-monitor channel assignment and a test/preview endpoint. The check engine already
writes one `check_results` row per check on a fixed interval per monitor
(`check-engine/scheduler.ts`).

## Decision
No incidents/state table. `insertCheckResultAndDetectTransition()`
(`check-engine/repository.ts`) reads the monitor's most recent prior `check_results` row
before inserting the new one and diffs status; the first-ever check has no prior row and
is treated as a baseline, not a transition. On recovery to `up`, downtime duration is the
gap between the new row and the most recent prior `up` row — an approximation bounded by
check interval, not a tracked incident window.

Per-monitor assignment is a plain junction table, `monitor_alert_channels` (composite PK
on `monitor_id`/`alert_channel_id`), not a config field on either side.

Dispatch is synchronous and in-process: `CheckScheduler.runCheckCycle()` awaits the
transition-aware insert, then — only on a real transition — awaits an injected
`dispatchAlerts(monitor, transition)` (default: a no-op, so every existing
`new CheckScheduler(db)` call site is unaffected). The real dispatcher
(`alerting/dispatch.ts`) queries the monitor's enabled assigned channels and fans out with
`Promise.allSettled`, catching and logging each channel's failure so one bad channel never
blocks another or delays the next check cycle. `sendToChannel()` — the same function used
here and by the `POST /alert-channels/:id/test` preview endpoint — throws on failure; the
dispatcher swallows that, the test endpoint surfaces it as `502 { success: false, error }`.

Senders: `fetch()` + `AbortController` timeouts for Slack/webhook (same pattern as
`check-engine/executors/http.ts`), `nodemailer` for email using server-wide SMTP config
(env vars) plus a per-channel recipient.

## Alternatives considered
- **Dedicated incidents/state table** — gives exact incident boundaries and would support
  a future status-page incident history, but adds a second source of truth for "is this
  monitor currently down" alongside `check_results`; not needed for v1's alerting-only ask.
- **Job queue for dispatch** — decouples slow sends (SMTP, rate-limited webhooks) from the
  check cycle and gives retries, but adds an operational dependency the "5-minute
  quickstart" goal doesn't have room for yet; self-hosted check intervals (≥10s) tolerate a
  blocking send.
- **Retry-on-failure in the dispatcher** — would mask flaky channels the operator should
  fix; a bare-metal send-once with a clear error (via the test endpoint) is simpler for v1.

## Consequences
Downtime duration precision is bounded by check interval — sparse checks understate
transition-to-transition duration. High-volume self-hosted instances with many monitors
alerting near-simultaneously will serialize each monitor's own dispatch (channels for one
monitor fan out concurrently, but each monitor's cycle blocks on its own dispatch); revisit
with a queue if that becomes a real bottleneck. Adding a new channel type is a new sender
file plus one `switch` arm in `sendToChannel`, no schema change (channel `config` stays a
free-form jsonb column).
