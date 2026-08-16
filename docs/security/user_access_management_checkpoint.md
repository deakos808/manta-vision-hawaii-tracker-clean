# User access management checkpoint

Status: local implementation checkpoint. The Edge Function and database migration are proposed and unapplied. No production connection, account change, deployment, or migration occurred.

## Evidence boundary

- Proven from committed code: session restoration already waited before routing, but profile lookup failures were converted to a regular user; the Admin Roles page wrote `profiles` directly and offered profile-only deletion; legacy functions allowed unsafe listing/password-management patterns; invitations could return setup links.
- Provided live reconciliation (not independently re-queried here): 7 Auth accounts, 6 profiles, 6 matching identifiers, 1 unconfirmed/unbanned Auth account without a profile, 2 active admins, 4 active users, and 0 inactive profiles.
- Production remains unverified in this task: deployed function versions, Auth redirect allowlist, current `profiles` policies/grants, token lifetime, mail delivery configuration, and whether all protected data policies check `is_active`.
- The unmatched Auth account is deliberately untouched and will appear as **Needs reconciliation** after the server checkpoint is separately deployed.

## Behavior changes in this checkpoint

| Area | Current behavior | Risk | Proposed behavior | Affected scope | Rollback | Test plan |
|---|---|---|---|---|---|---|
| Protected routes | Missing/error profiles became normal users; inactive was not loaded. | Fail-open application access and unclear errors. | Load `role` and `is_active`; fail closed with distinct inactive, missing-profile, unauthorized, and error messages. | All authenticated users and protected routes. | Revert the frontend files. | Deterministic route-state tests and build. |
| Intended route | Submit handler always navigated to dashboard. | Users lose intended protected destination. | Validate and preserve internal path, query, and fragment. | Sign-in flow. | Revert sign-in/routing changes. | Internal/open-redirect tests. |
| Admin inventory | Browser read/wrote profiles directly and displayed full IDs. | UI-only authorization and confusing Auth/profile state. | JWT-validated server inventory; separate Auth status, role, active status, and reconciliation state; no ID column. | `/admin/roles`, `profiles`, Auth inventory. | Restore old page only after restoring equivalent safe server control. | Source-contract tests plus isolated UI review after approved local deployment. |
| Role/status changes | Direct browser updates and profile-only deletion. | Self-lockout, last-admin loss, deletion mismatch, weak audit. | Transactional RPC, reason and confirmation, self-protection, permanent two-active-admin floor, audit row in same transaction; suspend/reactivate replaces deletion. | Active admins and `profiles`. | Paired rollback SQL restores the documented baseline. | Pure policy, live synthetic Edge, and transactional SQL tests passed locally. |
| Invitations | Could create/recover accounts and expose setup links. | Link leakage, ambiguous operation, role/profile partial state. | Invite-only operation, always regular user, hardened existing Auth trigger, email delivery only, descriptive display name. | New invited users, Auth, `profiles`. | Paired rollback restores the documented trigger function. | Default profile and no-link contracts passed synthetically; Mailpit delivery remains unverified. |
| Recovery/passwords | Admin password assignment endpoint existed. | Administrators could know or set another user’s password. | Assignment endpoint retired; recovery sends email and returns no link. | Existing Auth accounts. | Do not restore password assignment; recovery endpoint can be reverted independently. | Static no-link/no-password tests. |
| Audit | No dedicated server-authoritative user-access log. | Privileged and failed actions are difficult to reconstruct. | `user_access_audit` records invitations, recovery, role/status changes, and rejected privileged actions without secrets. | Administrators and security reviewers. | Drop table using paired rollback after retention review. | SQL constraints and server-source tests; DB transaction test pending. |

## Server authorization design

`admin-user-management` accepts only `list`, `invite`, `send_recovery`, and `update_access`. It validates the bearer token with Supabase Auth, reads the acting `profiles` row with the service client, and requires exact `role = admin` plus `is_active = true`. Metadata is used only for a display name. Role/status mutation then calls an authenticated `SECURITY DEFINER` RPC that repeats the authoritative database checks using `auth.uid()`.

The function requires server-only `SUPABASE_SERVICE_ROLE_KEY` and explicit `ALLOWED_ORIGINS`, `PASSWORD_REDIRECT_URL`, and `ALLOWED_REDIRECT_ORIGINS`. The password URL must be HTTPS (except loopback development), must end at `/set-password`, and must match the environment-specific origin allowlist. No fallback production project URL is embedded.

Supabase access tokens can remain valid until expiry after a status change. Consequently, the Edge Function and `profiles` RLS re-read active status on every privileged/database request. Before migration approval, every other protected table policy must be checked and updated to call the same live active-user predicate; frontend hiding alone is insufficient.

## Proposed migration and rollback

- Proposal: `supabase/migrations/20260816124142_user_access_management.sql`
- Manual rollback: `supabase/rollback/20260816124142_user_access_management_rollback.sql`
- The proposal now asserts the documented production policy names/definitions, grants, RLS state, function definitions/grants, trigger, and aggregate data quality before changing anything. Any drift aborts the migration.
- Four browser-admin DML/inventory policies are removed; `profiles_select_own` remains. The rollback restores the documented prior policies, grants, functions, and nullability.
- The migration was created with `supabase migration new` and must not be applied until separately approved.

## Required pre-deployment validation

1. Restore a schema-only local Supabase environment with synthetic Auth users and profiles.
2. Verify admin list/invite/update/suspend/reactivate, regular/inactive/missing-profile rejection, invalid roles, self-change rejection, and the two-admin floor.
3. Force an audit insert failure and confirm the profile update rolls back; force default-profile creation failure and confirm Auth invitation creation rolls back.
4. Confirm the unmatched production account is only displayed as **Needs reconciliation** and is not changed.
5. Verify local and production Auth redirect allowlists separately; verify no response or log contains action links.
6. Inventory every protected table/storage policy and require live active-profile authorization where suspended users must lose access.
7. Deploy the migration before the new Edge Function, then deploy the frontend; retain a reviewed rollback window.

## Decisions and remaining approval boundary

- Mark approved `https://mantatracker.com` and `https://www.mantatracker.com`; repository launcher evidence establishes the local origin as `http://127.0.0.1:8080`. Values belong in environment configuration, never Git.
- The two-active-admin floor is permanent with no in-app override. Break-glass recovery uses separately authorized Supabase project-owner/Dashboard access.
- Decide how the existing unmatched Auth account should eventually be reconciled; this checkpoint makes no change.
- Review the completed synthetic reconciliation and its local Kong/Mailpit limitations before any integration branch, migration, or function deployment.
