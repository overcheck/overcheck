# ADR-009: static API-key auth via @fastify/bearer-auth

**Date:** 2026-07-07 · **Status:** accepted

## Context
The REST API needs auth now, but real multi-user auth (email+password, roles) is CLAUDE.md's item 5, a later milestone. Something is needed in the meantime so the API isn't wide open, without building throwaway user-management code that item 5 will replace anyway.

## Decision
A single static API key, set via `API_KEY` env var, checked with `@fastify/bearer-auth` (`Authorization: Bearer <key>`) on everything under `/api/*`. `/health` and `/api/docs` stay unauthenticated (liveness probes and documentation viewing aren't sensitive).

## Alternatives considered
- **Hand-rolled `onRequest` hook comparing a header to `config.apiKey`** — trivial, but `@fastify/bearer-auth` is a maintained official plugin doing the exact same thing with constant-time comparison, for one dependency.
- **Building real auth now** — explicitly out of order per CLAUDE.md's build sequence; would be throwaway work once item 5 lands.

## Consequences
Every request needs one shared secret — fine for a single self-hosted operator, not fine once multi-user roles matter; this is a deliberate placeholder, not the final auth model. Revisit and remove entirely once email+password + roles ships.
