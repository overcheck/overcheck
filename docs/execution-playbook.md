# Overcheck Execution Playbook — Phases, Exit Criteria & Claude Code Prompts

How to read this: each phase has **Goals**, a **Done when** checklist (don't move on until it's true), and **Claude Code prompts** to copy-paste. Rule of thumb for tools:
- **Claude Code** = anything that touches the repo: writing code, tests, docs, debugging, refactors, docker, CI.
- **Claude chat (Overcheck project)** = anything that touches words, money, or judgment: launch copy, pricing, positioning, blog posts, CPA prep, "should I" questions.

---

## PHASE 0 — Foundation (this week, ~3 hrs remaining)

**Goals:** repo exists, name assets locked, environment ready.

Done when:
- [x] Name decided: Overcheck (vetted against market 2026-07-06)
- [x] GitHub org `overcheck` claimed
- [x] npm scope `@overcheck` claimed
- [ ] overcheck.dev registered to Baratek
- [ ] USPTO classes 9 & 42 clearance check (required before PUBLIC launch, not before coding)
- [ ] Private repo `overcheck/overcheck` created with CLAUDE.md at root, docs/ containing roadmap.md, feature-spec.md, README-draft.md, execution-playbook.md
- [ ] Claude Code installed, opened in the repo, and it correctly summarizes the project when asked

**Claude Code prompt #0 (sanity check the handoff):**
> Read CLAUDE.md and docs/feature-spec.md. Summarize the v1 scope and build order back to me in 10 bullets. Flag anything ambiguous or contradictory before we write code.

---

## PHASE 1 — MVP Core (Months 1–3, ~12 weekly hrs of build)

### Milestone 1.1 — Skeleton + check engine (Weeks 1–3)
**Goals:** running project, HTTP/TCP/ping/keyword checks executing on schedule, results in Postgres.

Done when:
- [ ] `docker compose up` starts app + Postgres clean on a fresh machine
- [ ] Checks run at configured intervals with retries; up/degraded/down states recorded
- [ ] Test suite covers the check engine (success, timeout, keyword miss, degraded threshold)

**Prompt 1.1a:**
> Scaffold the project per CLAUDE.md: TypeScript Node backend, PostgreSQL via docker compose, vitest for tests, ESLint+Prettier. Create the folder structure, DB migration setup, and a health endpoint. Write an ADR in docs/adr/ for each major library choice.

**Prompt 1.1b:**
> Implement the check engine from docs/feature-spec.md item 1: HTTP(S), TCP, ping, and keyword monitors with configurable interval, timeout, retries, and a degraded_after response-time threshold. Statuses: up/degraded/down. Persist results to Postgres with retention config. Write thorough tests including timeout and flapping scenarios.

### Milestone 1.2 — API + config-as-code (Weeks 4–6)
**Goals:** the differentiators. Everything doable via REST; monitors as YAML.

Done when:
- [ ] Full CRUD for monitors/alerts/status-pages via REST, OpenAPI spec auto-generated
- [ ] `overcheck apply -f monitors.yaml` CLI syncs declarative config (create/update/delete)
- [ ] Start dogfooding: real client endpoints monitored from a $5 VPS

**Prompt 1.2a:**
> Build the REST API layer per feature-spec item 3: CRUD for monitors, alert channels, and status pages, with API-key auth, input validation, and auto-generated OpenAPI docs at /api/docs. The future web UI must be able to run entirely on this API.

**Prompt 1.2b:**
> Implement config-as-code per feature-spec item 4: a YAML schema for monitors and alerts, plus a CLI command `overcheck apply -f file.yaml` (published as @overcheck/cli) that diffs desired vs actual state through the REST API and reconciles. Include an `overcheck export` command. Document the schema with examples.

### Milestone 1.3 — Users, alerts, status pages, UI (Weeks 7–10)
Done when:
- [ ] Login with admin/editor/viewer roles enforced across the API
- [ ] Slack + email + webhook alerts fire with downtime duration; degraded alerts work
- [ ] Public status page renders uptime %, response-time graph, incident history
- [ ] Minimal clean web dashboard (list, detail, create/edit) consuming the public API

**Prompt 1.3a:**
> Implement multi-user auth per feature-spec item 5: email+password, sessions, roles admin/editor/viewer enforced as API middleware. Add user management endpoints and tests for permission boundaries.

**Prompt 1.3b:**
> Implement alerting per feature-spec item 6: Slack webhook, SMTP email, and generic webhook channels. Every alert includes monitor name, new state, and duration of downtime on recovery. Add per-monitor channel assignment and a test/preview endpoint.

**Prompt 1.3c:**
> Build the public status page and the internal dashboard per feature-spec item 7. Keep it fast and clean, no heavy framework bloat. Status page: branded header, per-group monitors, uptime % with 24h/7d/30d/90d selector, response-time chart, incident timeline.

### Milestone 1.4 — Polish + 5-minute install (Weeks 11–12)
Done when:
- [ ] A stranger (not you — recruit one from a dev Discord) goes zero → monitoring in under 5 minutes using only the README
- [ ] Seed/demo data, sensible defaults, helpful error messages
- [ ] CI runs tests + lint on every push; versioned release with changelog

**Prompt 1.4:**
> Do a new-user experience pass: audit the path from git clone to first monitor. Fix friction: defaults, docker compose UX, first-run setup, error messages. Then set up GitHub Actions CI (test, lint, build, release with changelog) and write the quickstart section of the README against reality.

**Chat (Overcheck project) during Phase 1:** monthly blog post drafts from what you're building; logo feedback; any scope-cut decisions.

---

## PHASE 2 — Launch (Month 4, ~30 hrs, mostly words not code)

**Goals:** public repo, three community launches, listening machine running.

Done when:
- [ ] USPTO clearance confirmed (hard gate before going public)
- [ ] README final (comparison table, GIF demo, live demo at overcheck.dev)
- [ ] "Why I built this" post published (dev.to/personal blog)
- [ ] Show HN posted (Tue–Thu morning US time), then r/selfhosted, then Product Hunt — one per week
- [ ] Every comment/issue answered <24h for 4 weeks
- [ ] Scorecard after: stars, unique installs, stranger-filed issues

**Claude Code prompt 2a:**
> Pre-launch audit: act as a skeptical HN commenter reviewing this repo. Find everything that would embarrass us — broken quickstart, missing LICENSE/CONTRIBUTING/SECURITY files, ugly first-run, unclear README claims. Produce a fix list, then fix the code items.

**Chat prompts:** draft the Show HN title+text, the r/selfhosted post (community-native tone, not marketing), the PH tagline, and the launch blog post. Bring back the comments you get — we'll mine them for the roadmap.

**Decision gate:** <100 stars and no organic traction after two launches → come back to chat with the data; we diagnose positioning vs product before more code gets written.

---

## PHASE 3 — Community + First Revenue (Months 5–8)

**Goals:** visible momentum on community asks; Overcheck Cloud live; first paying customers.

Done when:
- [ ] Top 3 community-requested features shipped (let the issue tracker rank them)
- [ ] OIDC SSO + maintenance windows shipped (v1.x list)
- [ ] Overcheck Cloud: multi-tenant hosted version, Stripe billing, $19–39/mo flat
- [ ] Hosted probes in 3 regions with consensus checking, cloud-tier only
- [ ] 5–20 paying customers ($200–800 MRR); founding-user pricing offered to top community members
- [ ] Ohio SaaS sales tax resolved with CPA BEFORE first paid subscription

**Prompt 3a:**
> Design then implement multi-tenant mode per the seams noted in CLAUDE.md: tenant isolation strategy (write an ADR comparing row-level vs schema-per-tenant for our scale), signup flow, and Stripe subscription integration with a $29/mo flat plan. Security review the isolation.

**Prompt 3b:**
> Implement the probe agent: a lightweight runner deployable to remote regions that pulls check assignments over an authenticated API, executes them, and reports results. Add consensus logic: a monitor is only DOWN if a majority of assigned probes agree. Include probe health monitoring itself.

**Chat:** pricing page copy, founding-user email, September CPA agenda.

---

## PHASE 4 — AI Diagnosis + Compounding (Months 9–12)

**Goals:** ship the moat feature; harden for small companies; hit honest yardsticks.

Done when:
- [ ] AI diagnosis v1: on failure, analyze check history, response bodies/headers, cert/DNS state → root-cause hypothesis + suggested fix posted to Slack (paid; start with HTTP/cert/DNS failure classes)
- [ ] Team hardening: audit log, SAML groundwork, $79–149 team tier
- [ ] 12-month scorecard: 1,000+ stars, $500–2,000 MRR = on track; decide double-down vs steady-state
- [ ] Monthly technical post cadence held all year (12 posts)

**Prompt 4a:**
> Implement the diagnosis pipeline per CLAUDE.md seams: on state change to down/degraded, gather evidence (recent check results, response snippets, cert and DNS info), call the LLM with a structured diagnostic prompt, and post a concise hypothesis + suggested fix to the incident's alert channels. Make providers pluggable, cap token spend per incident, and log accuracy feedback (was this diagnosis helpful y/n) for iteration.

**Chat:** the 12-month review — real numbers vs yardsticks, and the double-down decision. Also: does product income change the S-Corp math (with CPA).

---

## Standing weekly rhythm (all phases)
- ~70% Claude Code building · 20% content/community · 10% ops
- End each Code session with: *"Update CLAUDE.md's 'Current status' section with what changed and what's next."* — keeps every future session instantly oriented
- Never build a post-launch feature no user asked for; the issue tracker is the roadmap
- Consulting hours remain untouchable — they fund all of this
