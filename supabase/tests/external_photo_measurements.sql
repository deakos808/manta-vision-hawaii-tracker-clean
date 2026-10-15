select assert_true((select is_photogrammetry is null from photos where file_name2='historical.jpg'),'historical flag remains NULL');
select assert_true((select count(*)=1 and min(size_m)=4 from manta_sizes),'historical sizes unchanged');
select test_commit(jsonb_build_array(test_photo('dw',3.12),test_photo('dw',3.16),test_photo('dw',3.14))) as id \gset
select assert_true((select size_dw_m=3.14 from mantas where pk_manta_id=:id),'three DW mean');
select assert_true((select count(*)=3 and bool_and(measurement_type='width' and size_m=standardized_dw_m and measurement_method is null and measurement_evidence->>'source'='external') from manta_sizes where fk_manta_id=:id),'external DW values/source/method');
select assert_true((select count(*)=3 from manta_sizes s join photos p on p.pk_photo_id=s.source_photo_id where s.fk_manta_id=:id and p.fk_manta_id=:id and p.photo_view='dorsal' and p.is_photogrammetry),'photo association and independent view');
select assert_true((select bool_and(not (measurement_evidence ?| array['points','scaleCm','scalePx','discPx','conversion','dlCm','dwCm'])) from manta_sizes where fk_manta_id=:id),'no fabricated geometry or duplicate metric values');
select test_commit(jsonb_build_array(test_photo('dw',3.12),test_photo('dw',3.16),test_photo('dl',1.55))) as mixed \gset
select assert_true((select size_dw_m=3.14 from mantas where pk_manta_id=:mixed),'mixed metrics never averaged together');
select assert_true((select size_m=1.55 and standardized_dw_m is null from manta_sizes where fk_manta_id=:mixed and measurement_type='length'),'external DL has no fabricated DW');
select test_commit(jsonb_build_array(test_photo('dl',1.55)),4.2) as dl \gset
select assert_true((select size_dw_m=4.2 from mantas where pk_manta_id=:dl),'DL-only preserves manual summary');
select test_commit(jsonb_build_array(test_photo('dw',3.12)-'measure',test_photo('dw',3.12,'false')-'measure',test_photo('dw',3.12,'null')-'measure',test_photo('dw',3.12)-'measure'-'isPhotogrammetry')) as flags \gset
select assert_true((select count(*)=4 and count(*) filter(where is_photogrammetry)=1 and count(*) filter(where not is_photogrammetry)=1 and count(*) filter(where is_photogrammetry is null)=2 from photos where fk_manta_id=:flags),'true false null absent semantics');
select assert_true((select count(*)=0 from manta_sizes where fk_manta_id=:flags),'designation alone creates no Size_ID');
select test_commit(jsonb_build_array(jsonb_set(test_photo('dw',3),'{measure}','{"dlCm":100,"dwCm":230,"scaleCm":10,"scalePx":10,"discPx":100}'))) as laser \gset
select assert_true((select size_m=1 and standardized_dw_m=2.3 and measurement_method='paired_laser' and measurement_type='length' and measurement_evidence->'conversion'->>'ratio'='2.3' from manta_sizes where fk_manta_id=:laser),'in-app legacy branch unchanged');
select assert_true((select size_dw_m=2.3 from mantas where pk_manta_id=:laser),'in-app mean unchanged');
select assert_true(test_reject(test_photo('dw',0)),'zero rejects');
select assert_true(test_reject(test_photo('dw',-1)),'negative rejects');
select assert_true(test_reject(test_photo('bogus',3)),'unknown metric rejects');
select assert_true(test_reject(jsonb_set(test_photo('dw',3),'{measure,units}','"cm"')),'unnormalized units reject');
select assert_true(test_reject(jsonb_set(test_photo('dw',3),'{measure,valueMeters}','"3.12"')),'string value rejects');
select assert_true(test_reject(jsonb_set(test_photo('dw',3),'{measure,points}','[]')),'external fake points reject');
select assert_true(test_reject(jsonb_set(test_photo('dw',3),'{isPhotogrammetry}','"true"')),'string designation rejects');
select assert_true(not has_function_privilege('authenticated','public.commit_sighting_submission(uuid)','execute'),'Phase A commit ACL remains revoked');
select test_commit(jsonb_build_array(test_photo('dw',3.2) || '{"storageBucket":"manta-images","path":"fixture/prepared.jpg","originalPath":"fixture/original.jpg","editTransform":{"version":"rotate-crop-v1","rotationDegrees":0,"originalWidth":500,"originalHeight":292,"exifOrientation":1,"rotatedWidth":500,"rotatedHeight":292,"crop":{"x":0,"y":0,"width":500,"height":292},"outputWidth":500,"outputHeight":292}}'::jsonb)) as provenance \gset
select assert_true((select is_photogrammetry and original_storage_path='fixture/original.jpg' and storage_path='fixture/prepared.jpg' from photos where fk_manta_id=:provenance),'provenance branch preserves flag and original');
select assert_true((select measurement_evidence->>'photoUuid'=p.pk_photo_uuid::text and s.source_photo_id=p.pk_photo_id from manta_sizes s join photos p on p.pk_photo_id=s.source_photo_id where s.fk_manta_id=:provenance),'provenance UUID and permanent photo association');
select count(*) as before_sightings from sightings \gset
select assert_true(test_reject(test_photo('dw',-99)),'invalid request aborts transaction');
select assert_true((select count(*)=:before_sightings from sightings),'failed request leaves no scientific inserts');

select test_commit_sources(jsonb_build_array(test_photo('dw',3.12),test_photo('dw',3.16)), '9.0') as separated \gset
select assert_true((select size_dw_m=3.14 from mantas where pk_manta_id=:separated),'estimate excluded from measured mean');
select assert_true((select count(*)=1 and bool_and(size_m=9 and standardized_dw_m is null and source_photo_id is null and measurement_evidence->>'source'='contributor_visual_estimate') from manta_sizes where fk_manta_id=:separated and measurement_method='visual_estimate'),'estimate persists with explicit provenance, no photo or measured DW');
select test_commit_sources('[]','3.0') as estimate_only \gset
select assert_true((select size_dw_m is null from mantas where pk_manta_id=:estimate_only),'last DW removed: estimate never becomes measured summary');
select test_commit_sources(jsonb_build_array(test_photo('dl',1.55)), '3.0') as dl_estimate \gset
select assert_true((select size_dw_m is null from mantas where pk_manta_id=:dl_estimate),'DL does not populate DW or replace estimate');
select assert_true((select size_m=3 and standardized_dw_m is null from manta_sizes where fk_manta_id=:dl_estimate and measurement_method='visual_estimate'),'DL retains independent estimate');
select test_commit_sources('[]',null,'4.0') as unknown \gset
select assert_true((select measurement_method='legacy_unknown' and measurement_type is null and standardized_dw_m is null and size_m=4 from manta_sizes where fk_manta_id=:unknown),'revisited legacy size retains unknown source without invented metric');
