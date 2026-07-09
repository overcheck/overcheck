import type { UserRole } from '../auth.js'

/**
 * Viewers see everything read-only: every write action (create/edit/delete/pause/test) is
 * omitted from the rendered page entirely, not just disabled — role enforcement itself
 * already happens server-side in the API (`requireRole`), so this is display logic only.
 * Admin and editor are intentionally undifferentiated per the design handoff.
 */
export function canWrite(role: UserRole): boolean {
  return role !== 'viewer'
}
