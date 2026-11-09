import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const forward = read('../migrations/20261109162349_contain_legacy_import_support_table_access.sql');
const rollback = read('../rollback/20261109162349_contain_legacy_import_support_table_access_rollback.sql');
const fixture = read('./legacy_import_support_dependencies.sql');
const containment = read('./legacy_import_support_containment.sql');
const names = ["import_logs", "mprf_manta_map", "mprf_sighting_map", "photos_filenames_cleaned_integer_ids", "stg_jonathan_whiteny_biopsies"];
test('forward contains exactly the five reviewed table revocations', () => {
 assert.deepEqual(forward.trim().split(/;\s*/).filter(Boolean).sort(), names.map(n => `REVOKE ALL PRIVILEGES ON TABLE public.${n}\nFROM anon, authenticated`).sort());
});
test('emergency rollback restores only seven authenticated privileges', () => {
 const sql = rollback.replace(/^--.*$/gm, '').trim();
 assert.deepEqual(sql.split(/;\s*/).filter(Boolean).sort(), names.map(n => `GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER\nON TABLE public.${n} TO authenticated`).sort());
 assert.match(rollback, /EMERGENCY ONLY/);
});
test('disposable test covers forward rollback reapply and integrity', () => {
 assert.equal((containment.match(/\\ir ..\/migrations\//g) || []).length, 2);
 assert.equal((containment.match(/\\ir ..\/rollback\//g) || []).length, 1);
 for (const word of ['content fingerprint', 'exact service ACL', 'definition owner RLS PK constraints triggers policies', 'rollback exact original ACL']) assert.ok(containment.includes(word));
});
test('dependency probes retain role denial, trusted execution, FK checks and explicit legacy limitations', () => {
 for (const word of ['SET LOCAL ROLE', 'has_function_privilege', 'successful log insert', 'rejects orphan FK', 'exact routine definitions and ACLs', 'exact view definitions and ACLs', 'ten legacy paths remain blocked']) assert.ok(fixture.includes(word));
});
const definitions = [{"start": "CREATE OR REPLACE FUNCTION public.batch_update_photos_from_filenames()\n RETURNS void\n LANGUAGE plpgsql\n", "sha": "5a9935fc6fb8af2fdbe61748f3f4ff068d68d3755c9dea00751289a2bf9a9167"}, {"start": "CREATE OR REPLACE FUNCTION public.fn_imports_commit_catalog_cols(p_columns text[], p_src_file text DEFAULT NULL::text, p_file_sha256 text DEFAULT NULL::text)\n RETURNS json\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\n", "sha": "c7f98071b043b775022162ff76f8ab17fdf0d585a1ff3425b09dc2d9c8df44b4"}, {"start": "CREATE OR REPLACE FUNCTION public.fn_imports_commit_catalog_cols_updates_only(p_columns text[], p_src_file text DEFAULT NULL::text, p_file_sha256 text DEFAULT NULL::text)\n RETURNS json\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\n", "sha": "8de1e6152a222fafe2a2311179e202aede1c771b44ee712b193f1ec2ccda1815"}, {"start": "CREATE OR REPLACE FUNCTION public.fn_imports_commit_manta_sizes(p_src_file text DEFAULT NULL::text)\n RETURNS TABLE(rows_staged integer, rows_inserted integer, rows_skipped integer, rows_bad integer, rows_missing_fk integer)\n LANGUAGE plpgsql\n", "sha": "feef6629533625f3bc20888bc903c5036666a46c80024cf9424204a7cb4c71a1"}, {"start": "CREATE OR REPLACE FUNCTION public.fn_imports_commit_mantas_by_pair_disambiguate(p_src_file text DEFAULT NULL::text)\n RETURNS json\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\n", "sha": "832af0d0e76708537f5e7fe0172a106d1cc618d0a89f1c5d0e274f2bc517feac"}, {"start": "CREATE OR REPLACE FUNCTION public.fn_imports_commit_mantas_by_pair_updates_only(p_src_file text DEFAULT NULL::text)\n RETURNS json\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\n", "sha": "dc3a01fbb645a351625fcfdf858309f65710ae3257ab72b40086ef8221a130d1"}, {"start": "CREATE OR REPLACE FUNCTION public.fn_imports_commit_mantas_updates_only()\n RETURNS json\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\n", "sha": "6d8fb9a4ad8c80388a25b4b1f26a7f771af83ce74c71b8a8ea310bff60ad9888"}, {"start": "CREATE OR REPLACE FUNCTION public.fn_imports_commit_mantas_updates_only(p_src_file text DEFAULT NULL::text)\n RETURNS json\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\n", "sha": "586cd140d6431de38a713dd4e5299d866a9bfc1f4722187ea21512ebe257d7d2"}, {"start": "CREATE OR REPLACE FUNCTION public.fn_imports_commit_mprf_mantas(p_batch uuid)\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\n", "sha": "e414ae0200399fa2dcee3e3540eb1fa21af4de4e3c356691a7561b222ac7881b"}, {"start": "CREATE OR REPLACE FUNCTION public.fn_imports_commit_mprf_sightings(p_batch uuid)\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\n", "sha": "49dbade2e998254cf922abbdc9a7e136485381877ded42245367268a1bc382aa"}, {"start": "CREATE OR REPLACE FUNCTION public.fn_imports_commit_photos(p_src_file text DEFAULT NULL::text, p_allow_insert boolean DEFAULT false)\n RETURNS TABLE(rows_staged integer, rows_updated integer, rows_inserted integer, rows_skipped integer)\n LANGUAGE plpgsql\n", "sha": "514f84a6f8c1e81a2a27320e02be3c67e5da8500a0869785226f21e33acaa9f2"}, {"start": "CREATE OR REPLACE FUNCTION public.fn_imports_commit_photos_updates_only()\n RETURNS json\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\n", "sha": "79ba57700cc6da3ae5b57fa24a84d02285c2641bae981a252e0be769e9ad940f"}, {"start": "CREATE OR REPLACE FUNCTION public.fn_imports_commit_photos_updates_only(p_src_file text DEFAULT NULL::text)\n RETURNS json\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\n", "sha": "fb2f563973ab8a0accba75e3502b4aba17c5744e208a31134d7c799522095198"}, {"start": "CREATE OR REPLACE FUNCTION public.fn_imports_commit_sightings_updates_only(p_src_file text DEFAULT NULL::text)\n RETURNS json\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\n", "sha": "4226225a1fd98443db357c6905dfabcc76b8796a1b77e8150ea13fedd19f1742"}];
test('all 14 interface bodies exactly match the captured live definitions', () => {
 assert.equal(definitions.length, 14);
 for (const item of definitions) {
  const start = fixture.indexOf(item.start);
  assert.ok(start >= 0);
  const end = fixture.indexOf('$function$\n;', start + item.start.length);
  assert.ok(end > start);
  const body = fixture.slice(start, end + '$function$\n'.length);
  assert.equal(createHash('sha256').update(body).digest('hex'), item.sha);
 }
});
test('routed legacy Import page remains non-operational', () => {
 const source = read('../../src/pages/admin/ImportPage.tsx');
 assert.match(source, /Legacy metadata import and staging actions are temporarily unavailable/);
 assert.doesNotMatch(source, /\.rpc\(|StagingCsvPanel|ImportCsvPanel/);
});

test('differential comparison includes outputs, error context, and normalized target changes', () => {
 for (const word of ['b.error_context=ctx', 'b.error_schema=err_schema', 'b.error_table=err_table', 'b.error_column=err_column', 'b.returned_value IS NOT DISTINCT FROM returned', 'comparable_snapshot(b.after_targets)', 'comparable_snapshot(b.before_targets)']) assert.ok(fixture.includes(word));
 for (const word of ['direct_service_probe(\'forward\')','direct_service_probe(\'reapply\')','direct service SELECT','direct service INSERT','direct service UPDATE','direct service DELETE','service DML leaves no mutation','DIFFERENTIAL_JSON=']) assert.ok(containment.includes(word));
});
