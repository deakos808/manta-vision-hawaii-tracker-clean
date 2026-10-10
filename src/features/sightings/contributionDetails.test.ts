import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {mergeContributions, type Contribution} from './contributions';
import {contributionBatches, aggregatePhotoCounts, modernCatalogLinks, historicalCatalogLinks, payloadPhotos, loadContributionPhotos, loadContributionDetail, loadContributionCatalog, loadContributionPage, detailFields} from './contributionDetails';
const row: Contribution={source:'submission',key:'submission-s1',submissionId:'s1',sightingId:10,island:'Hawaii',date:'2026-10-07',submittedAt:null,location:'Bay',mantas:2,photos:3,status:'Pending'};
function mock(tables: Record<string,any[]>={}) {
 const calls:any[]=[];
 const client:any={storage:{from:(bucket:string)=>({getPublicUrl:(path:string)=>({data:{publicUrl:`https://example.invalid/${bucket}/${path}`}})})},from(table:string){
   const call:any={table,filters:[]}; calls.push(call);let data=tables[table]??[];
   const q:any={select:(fields:string)=>{call.fields=fields;return q;},eq:(key:string,v:any)=>{call.filters.push([key,v]);data=data.filter(r=>r[key]===v);return q;},in:(key:string,v:any[])=>{call.filters.push([key,v]);data=data.filter(r=>v.includes(r[key]));return q;},order:()=>q,range:async(from:number,to:number)=>({data:data.slice(from,to+1),error:null}),single:async()=>({data:data[0],error:data.length===1?null:Error('not found')})};return q;
 }};return {client,calls};
}
test('Island and named Location remain separate, with no coordinate fallback',()=>{
 const s:any={id:'s1',status:'pending',island:'Hawaii',latitude:'19.5',longitude:'-156',photo_count:3};
 const result=mergeContributions([s],['Name'],[{pk_sighting_id:2,photographer:'Name',island:'Maui',sitelocation:'Bay',location:'Other',sighting_date:'2020-01-01',total_mantas:1}]);
 assert.equal(result.items[0].island,'Maui');assert.equal(result.items[0].location,'Bay');
 const modern=result.items.find(i=>i.source==='submission')!;assert.equal(modern.location,'—');assert.equal(modern.island,'Hawaii');assert.equal(modern.photos,3);
 assert.equal(mergeContributions([{...s,location_unknown:'true'}],[],[]).items[0].location,'Unknown');
});
test('photo counts aggregate by direct sighting FK',()=>assert.deepEqual([...aggregatePhotoCounts([{fk_sighting_id:2},{fk_sighting_id:2},{fk_sighting_id:3}])],[[2,2],[3,1]]));
test('modern Match uses explicit payload decision',()=>assert.deepEqual(modernCatalogLinks([{matchedCatalogId:8,noMatch:false}],row,[]),[{label:'Match',id:8}]));
test('accepted New uses correlated permanent manta ID, not position',()=>assert.deepEqual(modernCatalogLinks([{id:'b',noMatch:true,matchedCatalogId:99}],{...row,status:'Accepted'},[{submission_manta_id:'a',fk_catalog_id:4},{submission_manta_id:'b',fk_catalog_id:5}]),[{label:'New',id:5}]));
test('uncommitted New has no fake link and unresolved means Pending decision',()=>{
 assert.deepEqual(modernCatalogLinks([{noMatch:true},{}],row,[]),[{label:'New — pending approval'},{label:'Pending decision'}]);
 assert.deepEqual(modernCatalogLinks([{noMatch:true}],{...row,status:'Rejected'},[]),[{label:'New — not committed'}]);
});
test('historical catalog deduplicates individuals without inventing Match/New',()=>assert.deepEqual(historicalCatalogLinks([{fk_catalog_id:4},{fk_catalog_id:5},{fk_catalog_id:4}]),[{label:'Catalog',id:4},{label:'Catalog',id:5}]));
test('incremental history starts at 50 and appends ordered, disjoint batches through all 827',()=>{
 const items=Array.from({length:827},(_,i)=>({...row,key:String(i)}));
 const first=contributionBatches(items,50);assert.equal(first.items.length,50);assert.equal(first.hasMore,true);
 const second=contributionBatches(items,100);assert.equal(second.items.length,100);assert.equal(second.batches.length,2);
 assert.deepEqual(second.batches[0],first.batches[0]);assert.equal(second.batches[1][0].key,'50');
 for(let count=50;count<=850;count+=50){
   const visible=contributionBatches(items,count);
   assert.deepEqual(visible.items,items.slice(0,count));assert.equal(items.length,827);
   assert.ok(visible.batches.every(batch=>batch.length<=50));
 }
 assert.equal(contributionBatches(items,850).hasMore,false);
 assert.equal(contributionBatches(items,850).items.length,827);
});
test('empty and short histories have no further loading',()=>{
 for(const length of [0,1,49,50]){
   const visible=contributionBatches(Array.from({length},()=>row),50);
   assert.equal(visible.items.length,length);assert.equal(visible.hasMore,false);
 }
});
test('payload photo uses durable path/URL, view and flags; HEIC remains graceful',()=>{
 const {client}=mock();const out=payloadPhotos(client,{mantas:[{photos:[{name:'original.heic',path:'prepared.jpg',previewUrl:'blob:stale',view:'ventral',isBestVentral:true},{name:'raw.heic',url:'https://example.invalid/raw.heic'}]}]});
 assert.equal(out[0].url,'manta-images/prepared.jpg');assert.equal(out[0].heic,false);assert.equal(out[0].bestVentral,true);assert.equal(out[1].heic,true);
});
test('Photos for uncommitted row reads only owner payload',async()=>{
 const {client,calls}=mock({sighting_submissions:[{id:'s1',submitted_by:'owner',payload:{mantas:[{photos:[{url:'https://example.invalid/p.jpg',view:'dorsal'}]}]}}]});
 assert.equal((await loadContributionPhotos(client,'owner',row)).length,1);assert.deepEqual(calls[0].filters,[['submitted_by','owner'],['id','s1']]);
 await assert.rejects(loadContributionPhotos(client,'other',row));
});
test('historical Photos queries only selected sighting and preserves full path',async()=>{
 const {client,calls}=mock({photos:[{pk_photo_id:3,fk_sighting_id:10,file_name2:'3.jpg',storage_path:'manta-images/photos/3/3.jpg',photo_view:'ventral'}]});
 const p=await loadContributionPhotos(client,'owner',{...row,source:'historical'});assert.equal(p[0].url,'manta-images/photos/3/3.jpg');assert.deepEqual(calls[0].filters,[['fk_sighting_id',10]]);
});
test('More queries selected owner payload or selected permanent sighting without mutation',async()=>{
 const {client,calls}=mock({sighting_submissions:[{id:'s1',submitted_by:'owner',payload:{notes:'original'}}],sightings:[{pk_sighting_id:10,notes:'historical'}]});
 assert.equal((await loadContributionDetail(client,'owner',row)).payload.notes,'original');assert.equal((await loadContributionDetail(client,'owner',{...row,source:'historical'})).notes,'historical');
 assert.equal(calls.length,2);assert.deepEqual(detailFields({notes:'historical'},'historical'),[['Notes','historical']]);
});
test('Catalog opens only one ID, never whole catalog',async()=>{
 const {client,calls}=mock({catalog_with_photo_view:[{pk_catalog_id:5,name:'Manta',best_catalog_ventral_path:'photos/5/5.jpg'}],catalog:[{pk_catalog_id:5,last_size_m:3}]});
 const c=await loadContributionCatalog(client,5);assert.equal(c.name,'Manta');assert.equal(c.last_size_m,3);assert.ok(calls.every(q=>q.filters[0][0]==='pk_catalog_id'&&q.filters[0][1]===5));
});
test('visible-page queries batch photo IDs and manta catalogs, and scope submissions to owner',async()=>{
 const {client,calls}=mock({photos:[{pk_photo_id:1,fk_sighting_id:11},{pk_photo_id:2,fk_sighting_id:11},{pk_photo_id:3,fk_sighting_id:999}],mantas:[{pk_manta_id:1,fk_sighting_id:11,fk_catalog_id:7}],sighting_submissions:[{id:'s1',submitted_by:'owner',mantas:[{matchedCatalogId:8}]}],catalog:[{pk_catalog_id:7,name:'Seven'},{pk_catalog_id:8,name:'Eight'}]});
 const result=await loadContributionPage(client,'owner',[row,{...row,key:'historical-11',source:'historical',sightingId:11}]);
 assert.equal(result['historical-11'].photos,2);assert.equal(result[row.key].photos,3);assert.equal(result['historical-11'].catalog[0].name,'Seven');
 assert.equal(calls.length,4);assert.equal(calls.find(q=>q.table==='photos').fields,'pk_photo_id,fk_sighting_id');assert.ok(calls.find(q=>q.table==='sighting_submissions').filters.some(([k,v]:any[])=>k==='submitted_by'&&v==='owner'));
});
test('modals are read-only and table has zero-photo/no-link guard',()=>{
 const modals=readFileSync('src/features/sightings/ContributionModals.tsx','utf8');const page=readFileSync('src/pages/MyContributionsPage.tsx','utf8');
 assert.doesNotMatch(modals,/<input|<select|<textarea|\.insert\(|\.update\(|\.delete\(|AddSightingPage|Edit Crop|Save Changes/);
 assert.match(modals,/Historical sighting record/);assert.match(page,/photos != null && photos > 0/);assert.match(page,/overflow-x-auto/);assert.match(page,/useState\(CONTRIBUTION_BATCH_SIZE\)/);
 assert.doesNotMatch(page,/Rows per page|>Previous<|>Next<|Page \{/);
 assert.match(page,/IntersectionObserver/);assert.match(page,/Load more/);
 assert.match(page,/staleTime: Infinity/);assert.match(page,/visible.batches.map/);
});

test('existing durable URL wins over legacy path with unspecified bucket',()=>{
 const {client}=mock();const p=payloadPhotos(client,{mantas:[{photos:[{url:'https://example.invalid/temp-images/photo.jpg',path:'photo.jpg',previewUrl:'blob:stale'}]}]});
 assert.equal(p[0].url,'https://example.invalid/temp-images/photo.jpg');
});


test('appended historical range alone is enriched and its Photos, More and Catalog loaders work',async()=>{
 const items=Array.from({length:100},(_,i)=>({...row,source:'historical' as const,key:`historical-${i+1}`,sightingId:i+1}));
 const appended=contributionBatches(items,100).batches[1];
 const {client,calls}=mock({
   photos:[{pk_photo_id:8,fk_sighting_id:51,storage_path:'photos/8/8.jpg'}],
   mantas:[{pk_manta_id:7,fk_sighting_id:51,fk_catalog_id:9}],
   sightings:[{pk_sighting_id:51,notes:'Historical record'}],
   catalog:[{pk_catalog_id:9,name:'Nine',last_size_m:3}],
   catalog_with_photo_view:[{pk_catalog_id:9,name:'Nine'}],
 });
 const details=await loadContributionPage(client,'owner',appended);
 assert.equal(details['historical-51'].photos,1);
 assert.deepEqual(details['historical-51'].catalog,[{label:'Catalog',id:9,name:'Nine'}]);
 assert.deepEqual(calls.find(c=>c.table==='photos').filters,[['fk_sighting_id',Array.from({length:50},(_,i)=>i+51)]]);
 assert.equal((await loadContributionPhotos(client,'owner',appended[0])).length,1);
 assert.equal((await loadContributionDetail(client,'owner',appended[0])).notes,'Historical record');
 assert.equal((await loadContributionCatalog(client,9)).name,'Nine');
});
test('incremental display never changes all-history summary',()=>{
 const owned:any={id:'pending',status:'pending',sighting_date:'2026-10-07',manta_count:2,photo_count:4};
 const historical=Array.from({length:826},(_,i)=>({pk_sighting_id:i+1,photographer:'Fixture',sighting_date:'2024-05-02',island:'Maui',sitelocation:'Bay',location:null,total_mantas:1}));
 const summary=mergeContributions([owned],['Fixture'],historical);
 for(const count of [50,100,150,850]){
   contributionBatches(summary.items,count);
   assert.equal(summary.total,827);assert.equal(summary.latest,'2026-10-07');assert.equal(summary.pending,1);
 }
});

test('historical legacy filename is display metadata and never a Storage key', async () => {
 const filename='remote:pk490_Maui mask.jpg\vsize:500,424\vJPEG:Secure/legacy';
 const {client}=mock({photos:[{pk_photo_id:6128,fk_sighting_id:10,file_name2:filename,storage_bucket:'manta-images',storage_path:'photos/6128/6128.jpg',thumbnail_url:'https://example.invalid/wrong.jpg'}]});
 client.storage.from=()=>({getPublicUrl(){throw Error('public delivery disabled');}});
 const photos=await loadContributionPhotos(client,'owner',{...row,source:'historical'});
 assert.equal(photos[0].url,'manta-images/photos/6128/6128.jpg');assert.equal(photos[0].name,filename);
});
test('Phoenix catalog detail uses the durable path instead of its public thumbnail',async()=>{
 const {client}=mock({catalog_with_photo_view:[{pk_catalog_id:1,name:'Phoenix',best_catalog_ventral_path:'photos/6128/6128.jpg',best_catalog_ventral_thumb_url:'https://example.invalid/wrong.jpg'}],catalog:[{pk_catalog_id:1,last_size_m:3}]});
 client.storage.from=()=>({getPublicUrl(){throw Error('public delivery disabled');}});
 assert.equal((await loadContributionCatalog(client,1)).image,'manta-images/photos/6128/6128.jpg');
});
