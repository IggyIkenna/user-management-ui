# user-management-ui — ARCHIVED (2026-04-20)

This repository has been folded into `unified-trading-system-ui` as part of
**Phase 6** of
[`plans/active/ui_unification_v2_sanitisation_2026_04_20.plan.md`](../unified-trading-pm/plans/active/ui_unification_v2_sanitisation_2026_04_20.plan.md).

The 14 admin surfaces that used to live here now live at
`unified-trading-system-ui/app/(ops)/admin/` behind the same role-gated layout
that guards the rest of the ops console.

## Where things moved

| Was (user-management-ui)                   | Is now (unified-trading-system-ui)                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| `app/(platform)/admin/page.tsx`            | `app/(ops)/admin/page.tsx` (merged — main UI's dashboard layout is the target)   |
| `app/(platform)/users/*`                   | `app/(ops)/admin/users/*` (users/page.tsx is main UI's; detail + modify + offboard migrated) |
| `app/(platform)/apps/*`                    | `app/(ops)/admin/apps/*`                                                         |
| `app/(platform)/audit-log/page.tsx`        | `app/(ops)/admin/audit-log/page.tsx`                                             |
| `app/(platform)/firebase-users/page.tsx`   | `app/(ops)/admin/firebase-users/page.tsx`                                        |
| `app/(platform)/github/page.tsx`           | `app/(ops)/admin/github/page.tsx`                                                |
| `app/(platform)/groups/page.tsx`           | `app/(ops)/admin/groups/page.tsx`                                                |
| `app/(platform)/health-checks/page.tsx`    | `app/(ops)/admin/health-checks/page.tsx`                                         |
| `app/(platform)/notifications/page.tsx`    | `app/(ops)/admin/notifications/page.tsx`                                         |
| `app/(platform)/onboard/page.tsx`          | `app/(ops)/admin/onboard/page.tsx`                                               |
| `app/(platform)/questionnaires/page.tsx`   | `app/(ops)/admin/questionnaires/page.tsx`                                        |
| `app/(platform)/requests/page.tsx`         | `app/(ops)/admin/requests/page.tsx`                                              |
| `app/(platform)/templates/page.tsx`        | `app/(ops)/admin/templates/page.tsx`                                             |
| `app/(platform)/settings/page.tsx`         | **skipped** — main UI already has a settings surface                             |
| `lib/api/*`                                | `lib/admin/api/*`                                                                |
| `lib/firebase.ts`                          | `lib/admin/firebase.ts` (shim over main UI's `lib/auth/firebase-config`)         |
| `lib/providers.tsx`                        | `lib/admin/providers.tsx`                                                        |
| `lib/query-client.ts`                      | **skipped** — main UI has one at `lib/query-client.ts`                           |
| `lib/stores/user-store.ts`                 | `lib/admin/stores/user-store.ts`                                                 |
| `hooks/use-auth.tsx`                       | `hooks/admin/use-auth.tsx` (shim re-exporting main UI's `useAuth`)               |
| `server/providers.js`                      | `server/admin/providers.js` (Slack + Google + M365 + AWS IAM providers preserved) |
| `server/seed-firestore.js`                 | `server/admin/seed-firestore.js`                                                 |
| `server/secret-manager.js`                 | `server/admin/secret-manager.js`                                                 |
| `scripts/bootstrap-admin-user.mjs`         | `scripts/admin/bootstrap-admin-user.mjs` (now seeds `admin_permissions`)         |
| `scripts/provision-presentation-users.mjs` | `scripts/admin/provision-presentation-users.mjs`                                 |
| `scripts/grant-app-entitlement.mjs`        | `scripts/admin/grant-app-entitlement.mjs`                                        |

## New admin-permission model

The fold-in introduced a scoped admin-permission gate: `lib/auth/admin-permissions.ts`
exports `hasAdminPermission(user, permission)` and the 10-element permission catalogue.
Destructive admin actions (modify user, offboard, sync applications, etc.) call the
gate; bootstrap admins (ikenna + femi seed users) carry the full permission set via
updated `scripts/admin/bootstrap-admin-user.mjs`. Scoped admins are granted
narrower permission subsets via the modify-user page.

SSOT for the model: `unified-trading-pm/codex/14-playbooks/cross-cutting/admin-permissions.md`.

## Post-fold-in cleanup (HUMAN)

The following tasks are outside agent scope and need a human hand:

- GitHub archive this repository (Settings → Archive repository).
- Remove `user-management-ui` from `workspace-manifest.json`.
- Remove `user-management-ui` from `.cursor/workspace-configs/*.code-workspace`.
- Remove any GHA workflow references in other repos that poll / test against
  user-management-ui.
- Un-publish the repo's Cloud Run service if one was ever deployed (doc check
  via `gcloud run services list` against `central-element-323112`).

## Why not delete?

Git history + issue history are the audit trail for the admin surface's
evolution. Archiving preserves both read-only; deleting loses both.
