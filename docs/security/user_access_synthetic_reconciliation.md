# Synthetic user-access reconciliation

Status: local-only validation completed on 2026-08-16. Nothing in this document authorizes production migration, Edge deployment, or account changes.

## Production fingerprint supplied for reconciliation

The proposed migration now aborts unless `profiles` has RLS enabled but not forced, exactly the five named policies supplied by Mark, the documented policy commands/predicates, the expected broad grants for `anon`, `authenticated`, and `service_role`, the documented `is_admin_user()` behavior/configuration, and the documented `handle_new_user()` behavior/trigger/configuration. It also aborts if `role` or `is_active` contains nulls or if an unsupported role exists.

The fingerprint is intentionally stricter than a generic existence check. The migration never drops an unknown policy or changes an unknown grantee. Before production approval, run the same aggregate-only fingerprint query once more and confirm that each documented “broad” table grant is the standard seven-table-privilege `GRANT ALL` set expected by the migration.

## Reconciled access model

- Preserve `profiles_select_own`, allowing an authenticated user—including an inactive user—to read only their own live role and active status for clear access messaging.
- Remove the four direct browser admin SELECT/INSERT/UPDATE/DELETE policies. The consolidated server function uses its server-only service client for inventory, while mutations use the checked RPC.
- Revoke all table privileges from `anon` and `authenticated`, then grant only `SELECT` to `authenticated`. `service_role` grants remain unchanged.
- Harden `is_admin_user()` in place with `search_path = ''`, fully qualified relations, exact `role = 'admin'`, and exact `is_active is true`. Revoke PUBLIC/anon execution and grant only authenticated/service-role execution because other existing RLS policies may depend on it.
- Harden the existing `handle_new_user()` in place so its existing Auth trigger continues to work. It uses `search_path = ''`, fully qualified relations, and creates every new profile as active `user`. No browser or API role receives EXECUTE.
- Make `profiles.role` and `profiles.is_active` `NOT NULL` only after the opening validation proves there are no nulls. No automatic production backfill is performed.
- Keep both existing Auth foreign keys, the extra unique `id` constraint, and all other redundant constraints unchanged. They belong to a later schema-cleanup task.
- Keep the permanent two-active-admin floor with no in-app override. Break-glass recovery requires separately authorized Supabase project-owner/Dashboard access.

## Disposable environment and results

A uniquely named Supabase stack used API/database ports 56321/56322 and contained only a synthetic reconstruction of the supplied baseline. No production schema export, row, identity, email, UUID, storage object, or secret was copied into it.

Validated successfully:

- Baseline fingerprint acceptance and deliberate policy-drift rejection.
- Migration application and reapplication.
- Active-admin inventory and pending/missing-profile status classification through the local Edge Function.
- Regular, inactive-admin, inactive-user, and missing-profile rejection.
- Default active-user profile creation for new Auth users.
- Required reasons, strict roles, self-demotion/self-suspension rejection, and two-admin minimum.
- Promote-third-admin then demote another, suspend, and reactivate flows.
- No partial profile change when audit insertion fails; success audit entries commit transactionally.
- Browser roles cannot directly mutate profiles and can read only their own profile.
- No setup/recovery link or token pattern in Edge responses or no-value scans of disposable Auth/Edge logs.
- Paired rollback restores the synthetic policy, grant, function, and nullability baseline.
- `supabase db lint --local` reported no schema errors.

Limitations:

- Supabase CLI 2.51.0 does not provide the newer `db advisors` command, so only its available database linter ran.
- The local Mailpit image repeatedly exited during startup and was excluded. Invitation/recovery API paths were exercised with success-or-controlled-delivery-failure handling, but actual email delivery and captured email redirect content were not verified.
- The local Kong layer rewrote preflight CORS headers to `Access-Control-Allow-Origin: *` even though the Edge container held the exact configured origin. This wildcard is not approved. The function’s own no-wildcard allowlist remains covered by deterministic source-contract tests; exact production gateway behavior still requires a non-production deployment preview or another approved environment.

## Proposed Auth redirect/origin entries

Production:

- `https://mantatracker.com`
- `https://www.mantatracker.com`
- Password redirect path on each approved origin: `/set-password`

Local launcher/development:

- Origin: `http://127.0.0.1:8080`
- Password redirect: `http://127.0.0.1:8080/set-password`

The local origin is established by `vite.config.ts`, the Electron launcher, and the Chrome fallback launcher. `http://localhost:8080`, wildcard origins, and wildcard Vercel Preview redirects are not proposed.

## Remaining approval boundary

Before preparing a clean integration branch from current `origin/main`, Mark should review the migration/rollback and accept the two local test limitations above. Before any production application, reconfirm the aggregate policy/function/grant fingerprint, configure exact environment origins separately, and validate exact CORS plus email redirects in an approved non-production hosted environment.
