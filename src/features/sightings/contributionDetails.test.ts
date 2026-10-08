import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {mergeContributions, type Contribution} from './contributions';
import {contributionPage, aggregatePhotoCounts, modernCatalogLinks, historicalCatalogLinks, payloadPhotos, loadContributionPhotos, loadContributionDetail, loadContributionCatalog, loadContributionPage, detailFields} from './contributionDetails';
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
for(const size of [25,50,100]) test(`pagination ${size} keeps full summary`,()=>{
 const items=Array.from({length:827},(_,i)=>({...row,key:String(i)}));const page=contributionPage(items,1,size);
 assert.equal(page.items.length,size);assert.equal(page.items[0].key,String(size));assert.equal(items.length,827);assert.equal(page.pages,Math.ceil(827/size));
});
test('payload photo uses durable path/URL, view and flags; HEIC remains graceful',()=>{
 const {client}=mock();const out=payloadPhotos(client,{mantas:[{photos:[{name:'original.heic',path:'prepared.jpg',previewUrl:'blob:stale',view:'ventral',isBestVentral:true},{name:'raw.heic',url:'https://example.invalid/raw.heic'}]}]});
 assert.equal(out[0].url,'https://example.invalid/manta-images/prepared.jpg');assert.equal(out[0].heic,false);assert.equal(out[0].bestVentral,true);assert.equal(out[1].heic,true);
});
test('Photos for uncommitted row reads only owner payload',async()=>{
 const {client,calls}=mock({sighting_submissions:[{id:'s1',submitted_by:'owner',payload:{mantas:[{photos:[{url:'https://example.invalid/p.jpg',view:'dorsal'}]}]}}]});
 assert.equal((await loadContributionPhotos(client,'owner',row)).length,1);assert.deepEqual(calls[0].filters,[['submitted_by','owner'],['id','s1']]);
 await assert.rejects(loadContributionPhotos(client,'other',row));
});
test('historical Photos queries only selected sighting and preserves full path',async()=>{
 const {client,calls}=mock({photos:[{pk_photo_id:3,fk_sighting_id:10,file_name2:'3.jpg',storage_path:'manta-images/photos/3/3.jpg',photo_view:'ventral'}]});
 const p=await loadContributionPhotos(client,'owner',{...row,source:'historical'});assert.equal(p[0].url,'https://example.invalid/manta-images/photos/3/3.jpg');assert.deepEqual(calls[0].filters,[['fk_sighting_id',10]]);
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
 assert.match(modals,/Historical sighting record/);assert.match(page,/photos != null && photos > 0/);assert.match(page,/overflow-x-auto/);assert.match(page,/useState\(50\)/);
});

test('existing durable URL wins over legacy path with unspecified bucket',()=>{
 const {client}=mock();const p=payloadPhotos(client,{mantas:[{photos:[{url:'https://example.invalid/temp-images/photo.jpg',path:'photo.jpg',previewUrl:'blob:stale'}]}]});
 assert.equal(p[0].url,'https://example.invalid/temp-images/photo.jpg');
});
