---
description: End-of-session wrap-up — update project status and capture decisions
---

Do the following, in order:

1. Update the "Current status" section at the top of CLAUDE.md (repo root):
   - Add a dated entry (YYYY-MM-DD) summarizing what changed this session.
   - State clearly what the next task is, referencing the relevant milestone/prompt in docs/execution-playbook.md.
   - Remove or compress status entries older than the last 3 sessions — keep the section short.

2. Check for undocumented decisions: if this session made any architectural or library choice that isn't yet recorded in docs/adr/, list them and write a short ADR for each using docs/adr/template.md. One-liners are fine.

3. Flag anything blocked or ambiguous that Fadi needs to resolve before the next session (external accounts, credentials, product decisions). If nothing, say so.

4. Confirm the test suite still passes (`npm test`). If it doesn't, say so loudly — do not update the status section to claim progress on broken tests.

Keep the whole wrap-up terse. This is bookkeeping, not prose.
