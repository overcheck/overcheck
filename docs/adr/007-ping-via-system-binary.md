# ADR-007: ping monitors shell out to the system `ping` binary

**Date:** 2026-07-07 · **Status:** accepted

## Context
Feature-spec lists "ping" as a monitor type distinct from TCP. Real ICMP echo normally needs a raw socket, which needs root or `CAP_NET_RAW` — at odds with the "5-minute install, no special Docker flags" quality bar. Treating "ping" as an alias for a TCP connect was considered, but two monitor types doing the identical check is confusing when a user has to pick one in the UI/YAML.

## Decision
Shell out to the system `ping` binary (`ping -c 1 -W <timeoutSeconds> <host>`) via `child_process.execFile`, parsing the round-trip time from its output. The call is wrapped behind an injectable `PingRunner` function so tests substitute a fake instead of depending on real ICMP.

## Alternatives considered
- **Raw ICMP via a library (e.g. `net-ping`, `raw-socket`)** — genuinely "real" ping, but requires root/`CAP_NET_RAW`, which most container setups don't grant by default.
- **Alias to a TCP connect check** — fully portable, but misrepresents the feature and duplicates the TCP monitor type.

## Consequences
Works in any Linux container that ships a `ping` binary with the usual setuid/capability bits (true of common Debian/Alpine base images) without extra Docker flags. If a restrictive environment blocks even that, the check fails with a clear error message — no silent fallback to a different check semantics. Revisit if this proves unreliable across common deploy targets.
