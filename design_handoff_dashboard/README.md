# Handoff: Overcheck Monitors Dashboard

## Overview
The internal, authenticated dashboard for Overcheck (an uptime monitoring tool). This is where a team configures and watches their own monitors and alert channels — distinct from the public Status Page (see the sibling `design_handoff_status_page` package), which is what *their customers* see. Covers: monitor list/filter/sort, a monitor detail view with response-time chart and check history, a monitor create/edit form, an alert-channels list, and a channel create/edit form. Also models a `viewer` role that hides all mutating actions.

## About the Design Files
The file in this bundle (`Dashboard.dc.html`) is a **design reference built in HTML**, not production code. It's a working prototype (real client-side state, filtering/sorting, mock generated chart data) meant to show intended look, layout, and behavior — not to be copied into the app verbatim.

**Task:** recreate this design in the target codebase's existing environment (its existing frontend framework and component patterns), or — if no frontend exists yet — choose the most appropriate framework and implement it there. The prototype's inline `oklch()` styling, mock in-memory data, and single-file structure are prototyping conveniences, not implementation requirements.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and interaction behavior below are final — recreate pixel-close using the target stack's own component/styling system.

## Screens / Views

All five screens share a persistent left sidebar (`208px` wide, flex:none, background `oklch(0.13 0.006 250)`, right border `1px solid oklch(0.26 0.006 250)`, `16px 12px` padding):
- Logo row: `20×20px` accent-blue (`oklch(0.55 0.16 250)`) rounded-square (5px radius) + "Overcheck" wordmark (14px/600).
- Nav items "Monitors" and "Alert channels" (13px/500, `8px 10px` padding, `6px` radius, `9px` gap to a monospace glyph icon `▤`/`◔`). Active item: bg `oklch(0.55 0.16 250 / 0.15)`, text `oklch(0.78 0.1 250)`. Inactive: transparent bg, `oklch(0.65 0.01 250)` text.
- Bottom-pinned account block (`margin-top:auto`, top border, `10px` padding): "SIGNED IN AS" label (10px uppercase, `.06em` tracking, `oklch(0.5 0.01 250)`), then a 22px circular avatar (initials "JD", `oklch(0.4 0.03 250)` bg) + username "jordan" (12.5px/500) + role label below it (10.5px, monospace, capitalized, `oklch(0.55 0.01 250)`) — role is `admin | editor | viewer`.

Main content area is `flex:1`, column layout, `overflow:hidden` with an inner scrollable region per screen. Background throughout: `oklch(0.16 0.006 250)` (near-black, cool neutral). Body text color `oklch(0.9 0.005 250)`.

---

### 1. Monitors (list)
**Purpose:** see all monitors at a glance, filter/sort/search, jump into a monitor or create a new one.

**Layout:**
- Header bar (`20px 26px 10px`, bottom border):
  - Row 1: "Monitors" title (16px/600), a monospace count label like "8 of 8" (11.5px, `oklch(0.55 0.01 250)`), and — right-aligned, `admin`/`editor` only — a "+ New monitor" primary button (accent-blue bg `oklch(0.55 0.16 250)`, white text, 600/12.5px, `7px 14px` padding, `6px` radius).
  - Row 2: search input (200px wide, placeholder "Search monitors…", dark input styling: bg `oklch(0.19 0.006 250)`, border `oklch(0.28 0.006 250)`, 12.5px text, `6px` radius) + status filter pills (All/Up/Degraded/Down) + a `1px` vertical divider + type filter pills (All types/http/tcp/ping/keyword). Pills: monospace 11.5px/500, `5px 10px` padding, `5px` radius, 1px border; active state uses accent-blue border/bg-tint/text, inactive uses neutral gray border and `oklch(0.65 0.01 250)` text.
- Table (scrollable, `0 26px` padding), CSS grid columns `22px 1.4fr 70px 90px 90px 90px 1fr`, `10px` gap:
  - Sticky header row (10.5px, 600, uppercase, `.05em` tracking, `oklch(0.5 0.01 250)`, bottom border): a blank marker column, then **Name**, **Type**, **Uptime 24h**, **Response** (these three are clickable sort headers — clicking appends a ▲/▼ arrow and toggles direction; re-clicking the active one flips direction), plus static **Interval** and **Alert channels** columns.
  - Each row (`9px 8px` padding, bottom border, hover bg `oklch(0.19 0.006 250)`, cursor pointer → opens detail):
    - Status marker: 9×9px shape+color (see Design Tokens — same up/degraded/down encoding as the Status Page).
    - Name (13px equivalent/500).
    - Type: uppercase monospace 10.5px, `oklch(0.6 0.01 250)`.
    - Uptime %: monospace, colored to match status.
    - Response time: monospace, `oklch(0.75 0.005 250)` (or "timeout" literal when down).
    - Interval: monospace 11px, `oklch(0.55 0.01 250)` (e.g. "60s").
    - Alert channel chips: small pill tags (10px, bg `oklch(0.22 0.006 250)`, border `oklch(0.3 0.006 250)`, `oklch(0.65 0.01 250)` text, `2px 6px` padding, `4px` radius), one per channel assigned to that monitor.
  - Empty state: "No monitors match the current filters." (12.5px, `oklch(0.5 0.01 250)`, `32px 8px` padding) when filters/search produce zero rows.
- **Sort behavior is two-tier and must be preserved:** rows are always grouped by severity first (down, then degraded, then up), and the clicked column header only controls the ordering *within* each severity group. A monitor can never rank above a worse-status monitor just because of name/type/uptime/response sort.

**Content used:** 8 mock monitors (Public API, Webhooks Dispatcher, Primary DB, Replica DB, Redis Cache, Queue Worker, Nightly ETL, Edge CDN) spanning http/tcp/ping/keyword types and up/degraded/down statuses; 3 mock alert channels (#incidents Slack, ops@… email, PagerDuty webhook).

---

### 2. Monitor detail
**Purpose:** inspect one monitor's live status, response-time trend, and recent check log; edit, pause/resume, or delete it.

**Layout:**
- Header (`18px 26px`, bottom border): "← Monitors" back-link (11.5px, `oklch(0.55 0.01 250)`, cursor pointer) above a wrapping flex row: status marker (11×11px), monitor name (17px/600), uppercase monospace type badge (pill, bg `oklch(0.22 0.006 250)`), colored status label (12px/600, e.g. "Degraded"), monospace "for {duration}" (11.5px, e.g. "for 22m"). Right-aligned (admin/editor only): **Edit**, **Pause/Resume**, and **Delete** buttons — Edit/Pause use neutral outlined style, Delete uses a red outline/text (`oklch(0.4 0.16 25)` border, `oklch(0.62 0.18 25)` text) on transparent bg.
- Scrollable body (`20px 26px`):
  - "RESPONSE TIME" section label (11px/600 uppercase) + a right-aligned segmented window toggle (24h/7d/30d — same segmented-control visual language as the Status Page's toggle, sized to this dark theme: track bg `oklch(0.2 0.006 250)`, `2px` padding/gap, active button solid accent-blue bg + white text, inactive transparent + `oklch(0.65 0.01 250)` text, monospace 11px/500).
  - Chart card (bg `oklch(0.19 0.006 250)`, border, `8px` radius, `14px 16px` padding): inline SVG line chart, `640×120` viewBox, 3 horizontal gridlines, filled area (status color @ 12% opacity) + 2px stroked line (status color) plotting mock response-time series for the selected window.
  - "RECENT CHECKS" section label, then a grid table (`170px 90px 90px 1fr` columns): Timestamp (monospace) / Status (colored, 600 weight) / Response (monospace) / Error (red `oklch(0.62 0.18 25)`, 11.5px — populated only on bad checks, e.g. "Connection timed out after 10s" or "Response time exceeded 500ms threshold"). 6 mock rows.

---

### 3. Monitor form (create / edit)
**Purpose:** define or edit a monitor's check configuration.

**Layout:**
- Header (`18px 26px`, bottom border): "← Monitors" back-link, then title "New monitor" or "Edit monitor" (16px/600).
- Scrollable body (`22px 26px`, max-width `560px`):
  - Info callout: "Maps 1:1 to this monitor's entry in monitors.yaml" (monospace 11.5px, `oklch(0.6 0.01 250)`, card-style bg/border, `8px 12px` padding) — signals this dashboard is a UI layer over a config file, not an opaque DB record.
  - **Name** — full-width text input, inline validation error below in red (`oklch(0.62 0.18 25)`, 11px) when empty on save attempt.
  - **Type** — 4 segmented buttons (http/tcp/ping/keyword), same active/inactive styling pattern as list-screen filter pills, monospace uppercase 12px labels.
  - Conditional fields based on selected type:
    - `http`/`keyword` → **URL** input (monospace, placeholder "https://example.com/health", required — validation error if empty).
    - `tcp`/`ping` → **Host** input, plus (tcp only) a **Port** input alongside it (110px wide).
    - `keyword` only (in addition to URL) → **Keyword to match** input.
  - 2×2 grid: **Interval (sec)**, **Timeout (sec)**, **Retries**, **Degraded after (ms)** — all numeric monospace inputs.
  - **Alert channels** — pill-style multi-select toggles (one per existing channel, 16px pill radius, same active/inactive color treatment), toggled by clicking.
  - Actions: "Save monitor" primary button (accent-blue) + "Cancel" secondary/outline button (returns to list without saving).
  - All text inputs share one visual pattern: bg `oklch(0.2 0.006 250)`, border `oklch(0.3 0.006 250)`, `8px 10px` padding, `6px` radius, no focus ring drawn in the mock (add one for real accessibility).

---

### 4. Alert channels (list)
**Purpose:** see all configured notification channels, test them, or create a new one.

**Layout:**
- Header (`20px 26px`, bottom border): "Alert channels" title (16px/600) + right-aligned "+ New channel" primary button (admin/editor only).
- Table (`16px 26px` padding), grid columns `1fr 90px 1fr 100px`: header row (Name / Type / Monitors using it / blank) then one row per channel — name is clickable (opens edit form), type is uppercase monospace, "monitors using it" lists the comma-joined monitor names (or "—" if unused), and (admin/editor only) a right-aligned "Send test alert" button (neutral outline, 11px/500, no-op in the mock).

---

### 5. Alert channel form (create / edit)
**Purpose:** define or edit one notification channel.

**Layout:**
- Header (`18px 26px`, bottom border): "← Alert channels" back-link, title "New channel"/"Edit channel" (16px/600).
- Scrollable body (`22px 26px`, max-width `480px`): **Name** text input; **Type** segmented buttons (slack/email/webhook); a target field whose label/placeholder changes with type — "Webhook URL" (`https://hooks.slack.com/…`) for slack, "Email address" (`ops@company.com`) for email, "Webhook URL" (`https://…`) for webhook. Actions: "Save channel" primary + "Cancel" secondary.

## Interactions & Behavior
- **Navigation:** sidebar items and back-links switch screens client-side; no page reloads. "Monitors" nav item is highlighted active across list/detail/form screens; "Alert channels" is active across the channels list/form.
- **Row click → detail:** clicking any monitor row opens its detail screen, resetting the response-time window to 24h.
- **Search:** filters the list by case-insensitive substring match on monitor name, live as you type.
- **Status/type filter pills:** single-select each, combine with search and with each other (AND logic).
- **Column sort:** clicking Name/Type/Uptime 24h/Response toggles ascending/descending on that column as the *secondary* sort key; severity (down > degraded > up) is always primary and non-overridable (see Screen 1 layout note) — carry this rule into the real implementation exactly, it's a deliberate product decision so the worst problems always float to the top regardless of what column the user is eyeballing.
- **Pause/Resume:** toggles a `paused` boolean on the monitor (mock only flips the button label — real implementation should also reflect paused state visually in the list, e.g. a muted/grayed row, which is NOT yet designed — flag to team).
- **Delete:** removes the monitor immediately and returns to the list — **no confirmation dialog in this mock**. Recommend adding a confirm step in the real implementation; treat its absence here as a prototyping gap, not an intentional decision.
- **Save validation (monitor form):** Name required; URL required when type is http/keyword. Errors show inline below the field on failed save attempt; they clear as soon as the user edits that field again. No other fields are validated in the mock (e.g. no numeric-range checks on interval/timeout/retries/degraded-after) — flag to team whether real implementation needs stricter validation.
- **Channel form save:** no validation at all in the mock — flag to team.
- **Role gating (`admin | editor | viewer`):** the `viewer` role hides every mutating control across all screens — "+ New monitor", Edit/Pause/Delete on detail, "+ New channel", "Send test alert", and (implicitly, since the form screens are unreachable without those entry points) the create/edit forms. `admin` and `editor` currently behave identically in this mock — if they're meant to differ (e.g. editor can't delete, or can't manage channels), that distinction is not yet designed and should be confirmed with the team before implementation.
- **Response-time window toggle (detail screen):** switches between 24h/7d/30d, recomputing the chart's plotted series (mock: slices/resamples a 30-point synthetic series). No effect on the check-history table below it.

## State Management
- Current screen: `list | detail | form | channels | channelForm`.
- Selected monitor id (for detail/edit).
- Search string, status filter, type filter, sort key + direction — all list-screen only, reset is not automatic when leaving/returning to the list in this mock (confirm desired behavior with team).
- Response-time window selection — detail-screen only, resets to `24h` each time a monitor is opened.
- Monitor collection and channel collection — held in memory in the mock; real implementation reads/writes `monitors.yaml` (see the in-form callout) plus whatever persists channel config.
- In-progress edit buffers for the monitor form and channel form (draft fields + validation error strings), discarded on Cancel.
- Role (`admin | editor | viewer`) — mock exposes this as a top-level toggle for demonstration; real implementation derives it from the authenticated user's actual permissions.

## Design Tokens
- **Status colors (fixed, matches the Status Page — keep both surfaces consistent):** up `oklch(0.6 0.14 150)` green (circle marker), degraded `oklch(0.7 0.16 70)` amber (diamond marker: 20% radius + 45° rotate), down `oklch(0.56 0.19 25)` red (rounded-square marker, 3px radius). Never rely on color alone — shape differs per status too.
- **Accent (interactive/brand):** `oklch(0.55 0.16 250)` blue — primary buttons, active nav/tab/filter states, logo mark.
- **Destructive:** border `oklch(0.4 0.16 25)`, text `oklch(0.62 0.18 25)` (Delete button, form error text, bad-check rows).
- **Neutrals (cool, dark theme):** background `oklch(0.16 0.006 250)`; sidebar/card backgrounds `oklch(0.13–0.22 0.006 250)` range; borders `oklch(0.21–0.3 0.006 250)` range; text runs from `oklch(0.9 0.005 250)` (primary) down to `oklch(0.5 0.01 250)` (tertiary/labels).
- **Typography:** `IBM Plex Sans` (UI labels, buttons, names) + `IBM Plex Mono` (all timestamps, numeric data, type/status codes, form fields with technical values) — same pairing and rationale as the Status Page. Loaded via Google Fonts, weights 400/500/600/700 (Sans) and 400/500/600 (Mono).
- **Spacing scale used:** 2, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 26px.
- **Radii:** 3–8px (buttons/cards/inputs), 16px (channel-toggle pills), 20%+45° rotate (diamond marker), 50% (circle marker/avatar).
- **Font sizes:** 10, 10.5, 11, 11.5, 12, 12.5, 13, 14, 16, 17px.

## Assets
None external. Avatar is a plain colored circle with initials ("JD") — real implementation should swap in the authenticated user's actual avatar/initials. No icons beyond monospace glyph characters (`▤ ◔ ← ▲ ▼`) used as lightweight nav/sort indicators — consider whether the target codebase's icon set should replace these for consistency with the rest of the product.

## Files
- `Dashboard.dc.html` — the finalized design, self-contained and interactive (open directly in a browser). This is a Design Component file (streaming HTML template + a small JS logic class) built with Claude; the markup/inline-styles are the source of truth for the spacing and color values above, and the logic class shows exactly how sorting, filtering, validation, and form-field visibility are derived — useful as a reference even though the implementation language/framework will differ.
- See also the sibling `design_handoff_status_page/` package for the public-facing Status Page this dashboard's data ultimately feeds.
</content>
