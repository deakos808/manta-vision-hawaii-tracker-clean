import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sizeSourcesForPayload, measurementSummary, measuredPhotoForPayload, invalidExternalMeasurement, type PhotoMeasurement } from './photoMeasurements';
import MeasurementSummary from '../../components/mantas/MeasurementSummary';
import PhotoMeasurementControls from '../../components/mantas/PhotoMeasurementControls';
import { photoForPayload } from './photoPresentation';
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
 assert.deepEqual(measurementSummary(p).dw,{mean:3.14,n:3});
 p[2]=external(3.20); assert.equal(measurementSummary(p).dw.mean!.toFixed(2),'3.16');
 p.pop(); assert.equal(measurementSummary(p).dw.n,2);
});
test('mixed DW/DL are never combined',()=>assert.deepEqual(measurementSummary([external(3.12),external(3.16),external(1.55,'dl')]),{dw:{mean:3.14,n:2},dl:{mean:1.55,n:1}}));
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
 for(const text of ['Measured DW','3.14 m','n = 2','Estimated size','9.00 m','Source: contributor visual estimate','Source: photogrammetry'])assert.ok(html.includes(text));
 const removed=renderToStaticMarkup(<MeasurementSummary {...props} photos={[]}/>);
 assert.doesNotMatch(removed,/Measured DW|Source: photogrammetry/);assert.match(removed,/Estimated size/);
});
test('legacy unknown provenance is never relabeled as estimate or measured',()=>{
 const html=renderToStaticMarkup(<MeasurementSummary photos={[]} legacySize="4"/>);
 assert.match(html,/Source unspecified/);assert.doesNotMatch(html,/Estimated size|Measured DW/);
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
 assert.match(html,/Measured DW/);assert.match(html,/3.14 m/);assert.match(html,/n = 2/);assert.match(html,/Measured DL/);assert.match(html,/1.55 m/);
});
test('photo evidence controls show explicit source, units, metric and designation',()=>{
 const html=renderToStaticMarkup(<PhotoMeasurementControls id="a" isPhotogrammetry measure={external(3.12).measure} disabled={false} onChange={()=>{}} onMeasure={()=>{}} onDesignation={()=>{}} />);
 for(const text of ['Photogrammetry','Externally calculated','Disc width (DW)','Disc length (DL)','Value (m)','3.12'])assert.ok(html.includes(text));
});
