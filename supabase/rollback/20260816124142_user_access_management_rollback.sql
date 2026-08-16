-- Manual rollback for the unapplied 20260816124142 proposal.
-- Review against a schema-only production inventory before use.
drop trigger if exists create_default_application_profile on auth.users;
drop function if exists private.create_default_profile_for_auth_user();
drop function if exists public.admin_set_profile_access(uuid, text, boolean, text);
drop policy if exists "active admins can read user access audit" on public.user_access_audit;
drop table if exists public.user_access_audit;
drop policy if exists "profile owners and active admins can read profiles" on public.profiles;
revoke select on table public.profiles from authenticated;
drop function if exists private.current_user_is_active_admin();

-- Deliberately does not recreate unknown pre-existing profiles policies or grants.
-- Restore those only from an approved, reviewed schema-only baseline.
notify pgrst, 'reload schema';
