import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
const directory = 'supabase/migrations';
const file = readdirSync(directory).find(x => x.endsWith('_contain_anonymous_public_routine_access.sql'))!;
const forward = readFileSync(directory + '/' + file, 'utf8');
const rollback = readFileSync('supabase/rollback/' + file.replace('.sql', '_rollback.sql'), 'utf8');
const inventory = JSON.parse(readFileSync('supabase/tests/fixtures/anonymous_routine_access_inventory.json', 'utf8'));
const application = inventory.routines.filter((r: any) => !r.extension);
const signature = (r: any) => 'public."' + r.name + '"(' + r.args + ')';
const revoke = (r: any) => 'REVOKE EXECUTE ON FUNCTION ' + signature(r) + ' FROM PUBLIC, anon, authenticated;';
const grant = (r: any, role: string) => 'GRANT EXECUTE ON FUNCTION ' + signature(r) + ' TO ' + role + ';';

test('every application overload removes both PUBLIC and direct anon execute', () => {
  assert.equal(application.length, 112);
  for (const r of application) assert.ok(forward.includes(revoke(r)), signature(r));
  assert.equal(application.filter((r: any) => r.anon).length, 105);
});
test('extension membership excludes all PostGIS and vector routines from ACL changes', () => {
  const extensions = inventory.routines.filter((r: any) => r.extension);
  assert.equal(extensions.length, 862);
  for (const r of extensions) assert.ok(!forward.includes(signature(r)));
  assert.doesNotMatch(forward, /ON ALL FUNCTIONS|ALTER EXTENSION|OWNER TO/);
});
test('authenticated execute is restricted to the explicit eight-routine allowlist', () => {
  assert.deepEqual([...inventory.authenticatedAllowlist].sort(), [
    'admin_set_profile_access', 'commit_sighting_submission', 'commit_sighting_submission_with_biopsies',
    'fix_missing_catalog_photo', 'fn_imports_commit_drone_photos', 'get_data_integrity_stats', 'is_admin', 'is_admin_user',
  ].sort());
  for (const r of application) assert.equal(forward.includes(grant(r, 'authenticated')), inventory.authenticatedAllowlist.includes(r.name));
});
test('RLS helpers and contributor policy dependencies retain authenticated execution', () => {
  for (const name of ['is_admin', 'is_admin_user']) assert.ok(forward.includes(grant(application.find((r: any) => r.name === name), 'authenticated')));
  assert.ok(inventory.dependencies.some((d: any) => d.name === 'is_admin_user' && d.dependent.includes('sighting_submissions')));
  assert.doesNotMatch(forward, /CREATE.*POLICY|ALTER TABLE|DROP TABLE|TRUNCATE TABLE/i);
});
test('staging-clear routines are denied to anonymous and authenticated browser roles', () => {
  for (const name of ['fn_imports_clear_staging','fn_imports_clear_staging_mantas','fn_imports_clear_staging_photos','fn_imports_clear_staging_sightings']) {
    const r = application.find((r: any) => r.name === name);
    assert.equal(r.definer, true);
    assert.ok(forward.includes(revoke(r)));
    assert.ok(!forward.includes(grant(r, 'authenticated')));
  }
});
test('guarded approval and user-management definitions remain unchanged', () => {
  for (const name of ['commit_sighting_submission', 'commit_sighting_submission_with_biopsies','admin_set_profile_access','fn_imports_commit_drone_photos']) {
    assert.doesNotMatch(forward, new RegExp('CREATE OR REPLACE FUNCTION public\\.' + name + '\\('));
    const baseline = inventory.applicationDefinitions.find((r: any) => r.proname === name).definition;
    assert.match(baseline, /auth.uid\(\)/);
    assert.match(baseline, /is_admin_user\(\)|is_active/);
  }
});
test('two current admin invoker helpers gain only a fail-closed active-admin guard', () => {
  const guard = "  if current_user not in ('postgres', 'service_role') and (auth.uid() is null or not public.is_admin_user()) then\n    raise exception using errcode = '42501', message = 'Active administrator access is required';\n  end if;\n";
  for (const name of inventory.guardedInvokerHelpers) {
    const prior = inventory.applicationDefinitions.find((r: any) => r.proname === name).definition;
    assert.ok(forward.includes(prior.replace(/\nbegin\n/, '\nbegin\n' + guard)));
    assert.ok(rollback.includes(prior));
    assert.doesNotMatch(prior, /SECURITY DEFINER/);
  }
});
test('rollback restores exact changed-role grants and preserves owner/service grants', () => {
  for (const r of application) {
    assert.ok(rollback.includes(revoke(r)));
    for (const role of ['PUBLIC','anon','authenticated']) assert.equal(rollback.includes(grant(r, role)), r.grants.some((g: any) => g.grantee === role));
  }
  assert.doesNotMatch(forward + rollback, /FROM service_role|FROM postgres/);
});
test('future defaults remove global PUBLIC and schema-specific browser grants', () => {
  assert.match(forward, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;/);
  assert.match(forward, /IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;/);
  assert.match(rollback, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;/);
  assert.match(rollback, /IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;/);
  assert.doesNotMatch(forward, /ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin/);
});
test('migration checks exact baseline before privilege changes and contains no data DML', () => {
  assert.ok(forward.includes(inventory.baselineFingerprint));
  assert.ok(forward.indexOf('RAISE EXCEPTION') < forward.indexOf('REVOKE EXECUTE'));
  let privilegeOnly = forward;
  for (const name of inventory.guardedInvokerHelpers) {
    const prior = inventory.applicationDefinitions.find((r: any) => r.proname === name).definition;
    const start = privilegeOnly.indexOf('CREATE OR REPLACE FUNCTION public.' + name);
    const end = privilegeOnly.indexOf('$function$', start + prior.indexOf('$function$') + 10) + 10;
    privilegeOnly = privilegeOnly.slice(0,start) + privilegeOnly.slice(end);
  }
  assert.doesNotMatch(privilegeOnly, /\b(?:INSERT INTO|UPDATE public\.|DELETE FROM|TRUNCATE TABLE|ALTER TABLE)\b/i);
});
