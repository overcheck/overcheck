# Overcheck Product Roadmap

**Name:** Overcheck (decided 2026-07-06) · **Owner:** Fadi / Baratek LLC · **Time budget:** 10–20 hrs/week alongside consulting
**Thesis:** Self-hosted monitoring built for teams and automation (API-first, config-as-code, multi-user, Postgres), with a paid layer built on things a free project can't sustain: hosted multi-location probes, AI incident diagnosis, and a managed cloud tier at $20–40/month.

---

## Phase 0 — Foundation (Weeks 1–2, ~15 hrs)

**Goal: lock the wedge and the identity before writing code.**

1. ✅ **Demand mined.** Uptime Kuma's top-upvoted issues cataloged via GitHub API — see feature-spec.md. Demand is pre-validated; don't invent features.
2. ✅ **README drafted** (README-draft.md): positioning line, comparison table, install command. The README is the storefront.
3. **Name + assets:** ✅ Overcheck chosen and vetted · ✅ GitHub org `overcheck` claimed · ✅ npm scope `@overcheck` claimed · ⬜ register overcheck.dev · ⬜ USPTO classes 9 & 42 check (required before public launch)
4. ✅ Architecture decisions locked (see CLAUDE.md): TypeScript/Node, Postgres-only, single Docker deploy, API-first, YAML config-as-code, AGPL-3.0 core with proprietary cloud/probe code, seams left for probes/multi-tenant/AI diagnosis.

**Exit criteria:** README done ✅, orgs claimed ✅, feature list written ✅, domain registered ⬜, repo scaffolded ⬜.

---

## Phase 1 — Build the MVP core (Months 1–3, ~150–200 hrs)

**Goal: a self-hosted v1 a stranger can install in 5 minutes and a team can actually use.**

**In scope (and nothing else):**
- HTTP(S), TCP, ping, and keyword checks with configurable intervals
- Monitors defined via YAML file *and* REST API *and* minimal web UI
- Multi-user auth with basic roles (admin / editor / viewer)
- Alerting: Slack, generic webhook, email (three channels only — Kuma has 90+, that's their moat, not ours)
- Public status pages (branded, per-group)
- Incident timeline (open/resolve, notes) — Kuma's documented gap
- Clean dashboard (uptime %, response-time chart, current status)

**Explicit cuts:** mobile app, 87 other notification providers, plugins, HA/clustering, SSO (design for it, ship later), Prometheus exporter (fast follow).

**Working rhythm:**
- Weeks 1–6: core engine + API + storage
- Weeks 7–10: UI + status pages + alerting
- Weeks 11–12: docs, install polish, seed data, demo instance
- **From week 4: dogfood in production on Baratek/client infrastructure.** Real usage is QA and the first case study.

**Exit criteria:** you'd honestly recommend it to another consultant; 5-minute install verified on a clean VPS by someone who isn't you.

---

## Phase 2 — Launch (Month 4, ~30 hrs)

**Goal: put Overcheck in front of the communities that distribute dev tools, and listen.**

1. Final README polish + short demo video/GIF + hosted live demo at overcheck.dev
2. Honest comparison page: "vs. Uptime Kuma" (respectful — their users are our users), "vs. Better Stack pricing"
3. Launch sequence, one per week: Show HN → r/selfhosted → Product Hunt → dev.to write-up ("Why I built monitoring for teams, not homelabs")
4. Respond to every issue and comment within 24h for the first month. Early issues = strangers writing the roadmap for free.

**Success signals by end of month 4:** 300–1,000 GitHub stars, real installs, 10+ issues/discussions from strangers.
**Reassess trigger:** under ~100 stars and no organic traction after two launches → diagnose positioning vs. product with real data before more code. Fix, relaunch once, then consider pivot.

---

## Phase 3 — Community + First Revenue (Months 5–8)

**Goal: visible momentum on community asks; Overcheck Cloud live; first paying customers.**

- Ship top community requests weekly-ish; visible momentum is marketing.
- **Build the paid tier v1:**
  - Managed cloud version (multi-tenant), $19–39/month flat — the "I'm done self-hosting" escape hatch
  - Hosted multi-location probes (3–5 regions) with consensus checking, cloud-tier only
- Offer founding-user pricing to the most active community members first.
- Content cadence: one technical post/month from real usage ("What monitoring 12 client servers taught me"). Feeds SEO for Overcheck *and* Baratek consulting.

**Success signals by month 8:** first 5–20 paying customers, $200–800 MRR, issues still flowing.

---

## Phase 4 — AI Diagnosis + Compounding (Months 9–12)

**Goal: ship the moat feature; harden for small companies; hit honest yardsticks.**

- **AI incident diagnosis (paid):** on failure, analyze check history, response bodies/headers, cert/DNS state → root-cause hypothesis + suggested fix posted to Slack. Start with HTTP/cert/DNS failure classes.
- Team hardening: audit log, SAML groundwork, $79–149 team tier
- 12-month scorecard: 1,000+ stars, $500–2,000 MRR = on track; decide double-down vs steady-state
- Monthly technical post cadence held all year (12 posts)

**Honest yardsticks (bootstrapped-SaaS medians):** median time to $10K MRR is 12–18 months from first paying customer — mid-2027 is the realistic horizon for meaningful income. The floor: even if revenue stalls, Overcheck is a tool used in paid client work and a public artifact that wins consulting deals. Downside capped; consulting stays primary throughout.

---

## Standing weekly rhythm (all phases)
- ~70% build · 20% content/community · 10% ops
- Never build a post-launch feature no user asked for; the issue tracker is the roadmap
- Consulting hours remain untouchable — they fund all of this

## Business housekeeping
1. Product revenue flows through Baratek LLC — no new entity. Wave income category **"Product/SaaS Revenue"** from dollar one; ~30% tax reserve.
2. **September CPA agenda:** (a) product/SaaS revenue vs the QBI/SSTB picture, (b) **Ohio sales tax on SaaS — resolve before first paid subscription**, (c) S-Corp election timing math.
3. USPTO clearance on "Overcheck" (classes 9 & 42) before public launch.
4. Repo, domain, and cloud accounts registered to Baratek (fadi@baratek.com), not personal accounts — clean IP ownership.
