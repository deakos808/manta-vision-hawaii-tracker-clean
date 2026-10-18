import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { sizeSourcesForPayload, measurementSummary, measuredPhotoForPayload, invalidExternalMeasurement, type PhotoMeasurement } from './photoMeasurements';
import MeasurementSummary from '../../components/mantas/MeasurementSummary';
import PhotoMeasurementControls from '../../components/mantas/PhotoMeasurementControls';
import { designatedBestPhoto, photoForPayload } from './photoPresentation';
const external = (value: number, metric: 'dw'|'dl' = 'dw') => ({ measure: {source:'external' as const, metric, valueMeters:value, units:'m' as const} });
for (const view of ['dorsal','ventral','other']) for (const flag of [null,false,true]) test(`${view} and photogrammetry ${flag} round trip independently`, () => {
 const p = { url:'fixture.jpg', id:'photo', view, isPhotogrammetry:flag, ...external(3.12) };
 assert.deepEqual(JSON.parse(JSON.stringify(photoForPayload(measuredPhotoForPayload(p)))),p);
});
test('historical unspecified remains absent',()=>assert.equal('isPhotogrammetry' in measuredPhotoForPayload({}), false));
test('designation without measurement remains valid',()=>assert.deepEqual(measuredPhotoForPayload({isPhotogrammetry:true} as any),{isPhotogrammetry:true}));
test('blank external entry omits measurement, keeps designation',()=>{ const photo: {isPhotogrammetry:boolean;measure:PhotoMeasurement} = {isPhotogrammetry:true,measure:{source:'external',metric:'dw',valueMeters:null,units:'m'}}; assert.deepEqual(measuredPhotoForPayload(photo),{isPhotogrammetry:true}); });
test('external has no fabricated geometry',()=>assert.deepEqual(Object.keys(external(3).measure).sort(),['metric','source','units','valueMeters']));
test('three DW values and edits recalculate immediately',()=>{
 const p=[external(3.12),external(3.16),external(3.14)];
 const summary = measurementSummary(p).dw;
 assert.equal(summary.mean,3.14); assert.equal(summary.n,3); assert.ok(Math.abs(summary.sd! - .02) < 1e-12);
 p[2]=external(3.20); assert.equal(measurementSummary(p).dw.mean!.toFixed(2),'3.16');
 p.pop(); assert.equal(measurementSummary(p).dw.n,2);
});
test('mixed DW/DL are never combined',()=>assert.deepEqual(measurementSummary([external(3.12),external(3.16),external(1.55,'dl')]),{dw:{mean:3.14,n:2,sd:Math.sqrt(((3.12-3.14)**2+(3.16-3.14)**2))},dl:{mean:1.55,n:1}}));
test('in-app centimeters normalize to meters; external meters stay meters',()=>assert.equal(measurementSummary([{measure:{dlCm:100,dwCm:230,discPx:10,scalePx:10,scaleCm:10}},external(2.3)]).dw.mean,2.3));
test('estimate and legacy values survive DW addition, edit, removal and DL-only evidence',()=>{
 for(const photos of [[external(3.14)],[external(3.20)],[],[external(1.55,'dl')]]) {
  const saved=JSON.parse(JSON.stringify({...sizeSourcesForPayload(photos,'3.0','4.0'),photos}));
  assert.equal(saved.estimatedSize,'3.0');assert.equal(saved.size,'4.0');
  assert.deepEqual(measurementSummary(saved.photos),measurementSummary(photos));
 }
});
test('estimate never enters mean; both sources render and last DW removal leaves estimate only',()=>{
 const props={photos:[external(3.12),external(3.16)],estimatedSize:'9.0'};
 const html=renderToStaticMarkup(<MeasurementSummary {...props}/>);
 for(const text of ['Measurements','3.14 m','>2</dd>','Estimated size','9.00 m','Source: contributor visual estimate','Externally calculated DW'])assert.ok(html.includes(text));
 const removed=renderToStaticMarkup(<MeasurementSummary {...props} photos={[]}/>);
 assert.doesNotMatch(removed,/Measurements|Externally calculated DW/);assert.match(removed,/Estimated size/);
});
test('legacy unknown provenance is never relabeled as estimate or measured',()=>{
 const html=renderToStaticMarkup(<MeasurementSummary photos={[]} legacySize="4"/>);
 assert.match(html,/Source unspecified/);assert.doesNotMatch(html,/Estimated size|Measurements/);
});
test('invalid measurements do not enter means and block saving',()=>{
 for(const v of [0,-1,NaN,Infinity]) {assert.equal(invalidExternalMeasurement(external(v)),true);assert.equal(measurementSummary([external(v)]).dw.n,0);}
});
test('pending edit JSON preserves photo association and known-ID independently',()=>{
 const m={matchedCatalogId:733,identificationProposal:{method:'contributor_known'},photos:[{id:'a',isPhotogrammetry:true,...external(3.12)},{id:'b',...external(1.55,'dl')}]};
 assert.deepEqual(JSON.parse(JSON.stringify(m)),m);
});
test('Admin and contributor summary shows both means and counts',()=>{
 const html=renderToStaticMarkup(<MeasurementSummary photos={[external(3.12),external(3.16),external(1.55,'dl')]} />);
 assert.match(html,/Measurements/);assert.match(html,/3.14 m/);assert.match(html,/>2<\/dd>/);assert.match(html,/Measured DL/);assert.match(html,/1.55 m/);
});
test('photo evidence controls show explicit source, units, metric and designation',()=>{
 const html=renderToStaticMarkup(<PhotoMeasurementControls id="a" isPhotogrammetry measure={external(3.12).measure} disabled={false} onChange={()=>{}} onMeasure={()=>{}} />);
 for(const text of ['Edit Size Measurement a','Edit size a','Externally calculated','Disc width (DW)','Disc length (DL)','Value (m)','3.12'])assert.ok(html.includes(text));
});

test('DW sample SD is unavailable for zero or one measurement', () => {
 assert.equal(measurementSummary([]).dw.sd, null);
 assert.deepEqual(measurementSummary([external(3.12)]).dw, {mean:3.12,n:1,sd:null});
 const html=renderToStaticMarkup(<MeasurementSummary photos={[external(3.12)]}/>);
 assert.match(html,/<dt[^>]*>SD<\/dt><dd[^>]*>—<\/dd>/);
});
test('DW variation updates after editing and removing photo evidence', () => {
 const photos=[external(2),external(3),external(4)];
 assert.deepEqual(measurementSummary(photos).dw,{mean:3,n:3,sd:1});
 photos[2]=external(6);
 assert.ok(Math.abs(measurementSummary(photos).dw.sd! - Math.sqrt(13/3)) < 1e-12);
 photos.pop();
 assert.deepEqual(measurementSummary(photos).dw,{mean:2.5,n:2,sd:Math.sqrt(.5)});
 photos.pop(); assert.equal(measurementSummary(photos).dw.sd,null);
});
test('incomplete external, DL-only and estimates contribute no DW', () => {
 assert.equal(measurementSummary([{},external(1.5,'dl'),{measure:{source:'external',metric:'dw',units:'m',valueMeters:null}}]).dw.n,0);
});

test('compact DW row keeps provenance and statistical explanation in closed native details', () => {
 const photos=[{measure:{dlCm:100,dwCm:230,discPx:10,scalePx:10,scaleCm:10}},external(3),external(4)];
 const html=renderToStaticMarkup(<MeasurementSummary photos={photos}/>);
 assert.match(html,/<details><summary/); assert.doesNotMatch(html,/<details open/);
 const details=html.match(/<details>[\s\S]*?<\/details>/)![0];
 assert.match(details,/Photo 1: 2.30 m/);assert.match(details,/Measured in MantaTracker/);
 assert.match(details,/Photo 2: 3.00 m · Externally calculated DW/);
 assert.match(details,/sample SD/);assert.doesNotMatch(details,/photogrammetry/);
 const main=html.replace(details,'');
 assert.doesNotMatch(main,/sample SD|Source:|Variation|Externally calculated/);
 for(const label of ['N','Mean DW','SD']) assert.match(main,new RegExp('>'+label+'<'));
});
test('three-photo compact summary formats existing mean and SD',()=>{
 const html=renderToStaticMarkup(<MeasurementSummary photos={[external(2),external(3),external(4)]}/>);
 assert.match(html,/>3<\/dd>/);assert.match(html,/>3.00 m<\/dd>/);assert.match(html,/>1.00 m<\/dd>/);
});

test('view changes preserve overlapping designations/evidence and clear invalid Best flags', () => {
 const modal=readFileSync('src/components/mantas/UnifiedMantaModal.tsx','utf8');
 const functions=modal.slice(modal.indexOf('  function setView('),modal.indexOf('  // Photo evidence'));
 const measure=external(3.1).measure;
 let photos=[{id:'a',view:'ventral',isBestVentral:true,isBestDorsal:false,isPhotogrammetry:true,isInjury:true,measure},{id:'b',view:'ventral',isBestVentral:false,isBestDorsal:false,isInjury:null}];
 const context={setPhotos:(update: (value: typeof photos)=>typeof photos)=>{photos=update(photos)}};
 vm.createContext(context);vm.runInContext(ts.transpile(functions),context);
 const run=(code:string)=>vm.runInContext(code,context);
 run('setBestVentral("b")');assert.equal(photos.filter(p=>p.isBestVentral).length,1);assert.equal(photos[1].isBestVentral,true);
 run('setView("a","dorsal"); setView("b","dorsal");setBestDorsal("a");setBestDorsal("b")');
 assert.equal(photos.filter(p=>p.isBestDorsal).length,1);
 run('setView("b","other")');assert.equal(photos[1].isBestVentral,false);assert.equal(photos[1].isBestDorsal,false);
 assert.equal(photos[0].isPhotogrammetry,true);assert.equal(photos[0].isInjury,true);assert.equal(photos[0].measure,measure);
 assert.equal(photos[1].isInjury,null);
});
test('nullable injury round trips independently of view and photogrammetry', () => {
 for(const view of ['ventral','dorsal','other']) for(const isPhotogrammetry of [true,false,null]) for(const isInjury of [true,false,null]) {
   const photo={id:'photo',url:'fixture.jpg',view,isPhotogrammetry,isInjury,...external(3.12)};
   assert.deepEqual(JSON.parse(JSON.stringify(photoForPayload(measuredPhotoForPayload(photo)))),photo);
 }
 const historical={id:'old',url:'fixture.jpg',view:'other'};
 assert.equal('isInjury' in photoForPayload(historical),false);
});
test('measurement options remain available without changing saved evidence on designation changes',()=>{
 const html=renderToStaticMarkup(<PhotoMeasurementControls id="p" isPhotogrammetry={false} measure={external(3.12).measure} disabled={false} onChange={()=>{}} onMeasure={()=>{}}/>);
 assert.doesNotMatch(html,/Measure Size/);assert.match(html,/DW: 3.12/);
 const details=html.match(/<details>[\s\S]*?<\/details>/)![0];
 assert.match(details,/Measurement source/);assert.match(details,/Externally calculated/);
 assert.doesNotMatch(html.replace(details,''),/Measurement source|Designation not specified|Source:/);
});

test('Mantas Added uses explicit draft/permanent Best designations without substituting first photos',()=>{
 assert.equal(designatedBestPhoto([{id:'first',view:'ventral'},{id:'chosen',view:'ventral',isBestVentral:true}],'ventral')?.id,'chosen');
 assert.equal(designatedBestPhoto([{id:'first',photo_view:'dorsal'},{id:'chosen',photo_view:'dorsal',is_best_manta_dorsal_photo:true}],'dorsal')?.id,'chosen');
 assert.equal(designatedBestPhoto([{view:'ventral'}],'ventral'),undefined);
 assert.equal(designatedBestPhoto([{view:'dorsal',isBestVentral:true}],'ventral'),undefined);
 assert.equal(designatedBestPhoto([{view:'ventral',isBestVentral:false,is_best_manta_ventral_photo:true}],'ventral'),undefined);
});

test('contextual Size editor preserves DL-only labels and shows units/source without a permanent options row',()=>{
 const render=(measure:PhotoMeasurement)=>renderToStaticMarkup(<PhotoMeasurementControls id="compact" isPhotogrammetry measure={measure} disabled={false} onChange={()=>{}} onMeasure={()=>{}}/>);
 const dl=render(external(1.55,'dl').measure);
 const main=dl.slice(0,dl.indexOf('<details'));
 assert.match(main,/DL: 1.55 m/);assert.doesNotMatch(main,/DW:/);
 assert.match(dl,/aria-label="Edit size compact"/);assert.match(dl,/Measurement source/);assert.match(dl,/Value \(m\)/);
 assert.doesNotMatch(dl,/More measurement options/);
 const inApp=render({dlCm:100,dwCm:230,scaleCm:60,scalePx:100,discPx:200});
 assert.match(inApp.slice(0,inApp.indexOf('<details')),/DW: 2.30 m/);
 assert.match(inApp.slice(inApp.indexOf('<details')),/DL: <!-- -->1.00|DL: 1.00/);
});

test('Best Ventral and Dorsal toggle off independently and preserve unrelated photo records',()=>{
 const modal=readFileSync('src/components/mantas/UnifiedMantaModal.tsx','utf8');
 const functions=modal.slice(modal.indexOf('  function setView('),modal.indexOf('  // Photo evidence'));
 const unrelated={id:'other',view:'other',isInjury:true,injuryModifiers:['predation']};
 let photos: {id:string;view:string;isBestVentral?:boolean;isBestDorsal?:boolean}[]=[{id:'v1',view:'ventral',isBestVentral:true},{id:'v2',view:'ventral'},{id:'d1',view:'dorsal',isBestDorsal:true},unrelated];
 const context=vm.createContext({setPhotos:(update: (value: typeof photos)=>typeof photos)=>{photos=update(photos)}});
 vm.runInContext(ts.transpile(functions),context);
 vm.runInContext('setBestVentral("v1",false);setBestDorsal("d1",false)',context);
 assert.equal(photos.filter(p=>p.isBestVentral).length,0);assert.equal(photos.filter(p=>p.isBestDorsal).length,0);
 vm.runInContext('setBestVentral("v1",true);setBestVentral("v2",true);setBestDorsal("d1",true)',context);
 assert.equal(photos.filter(p=>p.isBestVentral).length,1);assert.equal(photos[1].isBestVentral,true);assert.equal(photos[2].isBestDorsal,true);
 assert.equal(photos[3],unrelated);
});
test('photogrammetry uses a pencil for saved evidence and Measure Size only without a valid measurement',()=>{
 const render=(isPhotogrammetry:boolean,measure?:PhotoMeasurement)=>renderToStaticMarkup(<PhotoMeasurementControls id="state" isPhotogrammetry={isPhotogrammetry} measure={measure} disabled={false} onChange={()=>{}} onMeasure={()=>{}}/>);
 assert.match(render(true),/Measure Size/);
 const measured=render(true,external(2.4).measure);assert.match(measured,/DW: 2.40 m/);assert.match(measured,/Edit Size Measurement state/);assert.doesNotMatch(measured,/>Measure Size</);
 const off=render(false,external(2.4).measure);assert.match(off,/DW: 2.40 m/);assert.doesNotMatch(off,/Edit Size Measurement|>Measure Size</);
});

test('DL evidence is disclosed without a separate visible DL summary or fabricated DW statistics', () => {
 const html=renderToStaticMarkup(<MeasurementSummary photos={[external(1.55,'dl')]}/>);
 const details=html.match(/<details>[\s\S]*?<\/details>/)![0];
 assert.match(details,/Measured DL/);assert.match(details,/1.55 m/);
 assert.doesNotMatch(html.replace(details,''),/Measured DL|<dl|<dd/);
 assert.equal(renderToStaticMarkup(<MeasurementSummary photos={[]}/>),'');
});
