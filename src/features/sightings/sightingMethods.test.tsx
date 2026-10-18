import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MantasList from "../../components/mantas/MantasList";
import { readSightingMethods } from "./sightingMethods";

test("missing, legacy and malformed methods default false without inference", () => {
  const defaults = { pairedLaser: false, biopsySampling: false, tagDeployment: false };
  for (const value of [undefined, null, {}, { size: 3, total_tags: 1 }, { pairedLaser: "true" }]) {
    assert.deepEqual(readSightingMethods(value), defaults);
  }
  assert.deepEqual(readSightingMethods({ tagDeployment: true }), { ...defaults, tagDeployment: true });
});

test("summary hides and restores size and biopsy without mutating scientific data", () => {
  const mantas = [{
    id: "manta-a", name: "Kai", size: "3.67",
    photos: [{ id: "photo-a", measure: { dlCm: 160, dwCm: 367 } }],
    biopsy: { collected: true, sampleId: "sample-a" },
  }];
  const before = structuredClone(mantas);
  const render = (on: boolean) => renderToStaticMarkup(React.createElement(MantasList, {
    mantas: mantas as any, setMantas: () => assert.fail("render must not change mantas"),
    onEdit: () => {}, onSuggestIdentity: () => {}, onRemove: () => {}, openMatch: () => {},
    totalPhotosAll: 1, sightingDate: "2026-10-04",
    showSize: on, allowBiopsyEntry: on, allowMatching: false,
  }));
  const visible = render(true);
  assert.match(visible, /Measurements/);
  assert.match(visible, /3\.67 m/);
  assert.match(visible, /Biopsy collected for/);
  const hidden = render(false);
  assert.doesNotMatch(hidden, /Size \(m\)|Biopsy collected for/);
  assert.match(hidden, /Measurements/); // Photo evidence remains visible independently of sighting method.
  assert.equal(render(true), visible);
  assert.deepEqual(mantas, before);
});

test("both payloads persist methods; review defaults old payloads; toggles only set methods", () => {
  const page = readFileSync(new URL("../../pages/AddSightingPage.tsx", import.meta.url), "utf8");
  const payloads = [...page.matchAll(/const payload(?::any)? = \{([\s\S]*?)\n    \};/g)];
  assert.equal(payloads.length, 1);
  const reviewPayload = page.match(/function currentReviewPayload\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
  assert.match(reviewPayload, /\bmethods\b/);
  for (const [, body] of payloads) assert.match(body, /\bmethods\b/);
  assert.match(page, /setMethods\(readSightingMethods\(p.methods\)\)/);
  assert.match(page, /setMethods\(\(current\) => \(\{ \.\.\.current, \[key\]: checked \}\)\)/);
  assert.match(page, /allowBiopsyEntry=\{methods.biopsySampling && access.isActive/);
  assert.equal((page.match(/showSize=\{methods.pairedLaser\}/g) || []).length, 3);
});

test("photo evidence stays in workbench; independent estimate and summary belong to sighting list", () => {
  const modal = readFileSync(new URL("../../components/mantas/UnifiedMantaModal.tsx", import.meta.url), "utf8");
  const list = readFileSync(new URL("../../components/mantas/MantasList.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(modal, /<MeasurementSummary|id="estimated-size"/);
  assert.match(list, /Visually estimated DW \(m\) — optional/);
  assert.match(list, /<MeasurementSummary/);
  assert.match(modal, /PhotoMeasurementControls/);
  assert.match(modal, /measureOpen &&/);
});

test("tag method round-trips as a boolean only", () => {
  const methods = readSightingMethods({ tagDeployment: true, tagId: "not-a-model" });
  assert.deepEqual(JSON.parse(JSON.stringify({ methods })), {
    methods: { pairedLaser: false, biopsySampling: false, tagDeployment: true },
  });
});

test("setup confirmation is local, once per new sighting, with review excluded", () => {
  const page = readFileSync(new URL("../../pages/AddSightingPage.tsx", import.meta.url), "utf8");
  assert.ok(page.includes("useState(() => !addOpen)"));
  assert.ok(page.includes("editMethodsOpen || (addOpen && !methodsConfirmed && !isReview)"));
  assert.ok(page.includes("setMethodsConfirmed(true)"));
  const payloads = [...page.matchAll(/const payload(?::any)? = \{([\s\S]*?)\n    \};/g)];
  for (const [, body] of payloads) assert.doesNotMatch(body, /methodsConfirmed|editMethodsOpen/);
  assert.doesNotMatch(page, /<fieldset[^>]*>[\s\S]*?<legend[^>]*>Methods/);
  assert.ok(page.includes("onClick={() => setEditMethodsOpen(true)}"));
});

test("methods dialog stacks over photo intake and Continue accepts no selections", () => {
  const page = readFileSync(new URL("../../pages/AddSightingPage.tsx", import.meta.url), "utf8");
  assert.ok(page.includes("z-[300001]"));
  assert.ok(page.includes("z-[300002]"));
  assert.match(page, /<Button type="button" className="w-full" onClick=[\s\S]*?>Continue<\/Button>/);
  assert.ok(page.includes('|| "None"'));
});

test("manta rows use one conditional identity action, concise decisions and accessible icons", () => {
  const render = (m: object) => renderToStaticMarkup(<MantasList mantas={[{id:'m',name:'A',photos:[],...m}] as React.ComponentProps<typeof MantasList>['mantas']}
    setMantas={()=>{}} onEdit={()=>{}} onSuggestIdentity={()=>{}} onRemove={()=>{}} openMatch={()=>{}} totalPhotosAll={0}
    sightingDate="2026-10-18" showSize allowBiopsyEntry={false} allowMatching />);
  const unknown=render({});assert.match(unknown,/>Unknown</);assert.match(unknown,/Suggest Identity/);assert.doesNotMatch(unknown,/Match Photo|>Identification</);
  const best=render({photos:[{view:'ventral',isBestVentral:true}]});
  assert.match(best,/Match Photo/);assert.doesNotMatch(best,/Suggest Identity/);
  assert.match(render({photos:[{view:'ventral'}]}),/Suggest Identity/);
  assert.match(render({noMatch:true}),/New — pending Admin review/);
  assert.match(render({matchedCatalogId:733,identificationProposal:{catalogName:'Left Spot',method:'contributor_known'}}),/Left Spot · Catalog #733/);
  assert.match(unknown,/aria-label="Edit manta"/);assert.match(unknown,/aria-label="Remove manta"/);
  assert.doesNotMatch(unknown,/>Edit<|>Delete</);
});
