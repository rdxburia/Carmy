'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'document-extraction.js'), 'utf8');
const sandbox = { window: {}, document: {}, console, Intl, Date, Math, Number, String, Object, Array, Set, Map, JSON, RegExp, Promise, Uint8Array, ArrayBuffer, Blob, URL };
vm.createContext(sandbox);
new vm.Script(source, { filename: 'js/document-extraction.js' }).runInContext(sandbox);
const extraction = sandbox.window.CarmyExtraction;

test('embedded-font garbled policy text triggers OCR retry', () => {
  const garbled = 'FHEI B\\NA Nbdbroc Gdsurodib Iampody Cgmgtbh Zrgvotb Ior Zoikonb Zacgiy';
  assert.equal(extraction.shouldOcrPage(garbled), true);
});

test('readable policy schedule text avoids unnecessary OCR', () => {
  const readable = 'Reliance General Insurance Company Limited\nPolicy Number: 996392523110035330\nPeriod of Insurance: From 03-09-2025 to 02-09-2026\nVehicle Registration No: CH01BT6268\nEngine No / Chassis No: G4LAJM922371 / MALA851CLJM866196\nTotal IDV: 300,549.00\nTotal Premium Payable: 10,484.00';
  assert.equal(extraction.shouldOcrPage(readable), false);
});

test('OCR text is selected when its semantic quality is better than embedded PDF text', () => {
  const embedded = 'FHEI B\\NA Nbdbroc Gdsurodib Iampody Cgmgtbh Zrgvotb Ior Zoikonb Zacgiy';
  const ocr = 'Reliance General Insurance Company Limited Policy Number 996392523110035330 Period of Insurance Vehicle Registration Total Premium';
  const selected = extraction.choosePageText(embedded, ocr);
  assert.match(selected.source, /^ocr/);
  assert.match(selected.text, /Policy Number/);
  assert.ok(selected.ocr_quality > selected.text_quality);
});

test('policy fields are extracted across all 12 pages, not only page one', () => {
  const pages = Array.from({ length: 12 }, (_, i) => 'Terms and conditions page ' + (i + 1));
  pages[0] = 'Reliance General Insurance Company Limited\nPrivate Car Package Policy';
  pages[3] = 'Policy Number: 996392523110035330\nInsured Name: POONAM';
  pages[6] = 'Period of Insurance: From 03-09-2025 to 02-09-2026';
  pages[8] = 'Vehicle Registration No: CH01BT6268';
  pages[10] = 'Engine No / Chassis No: G4LAJM922371 / MALA851CLJM866196\nTotal IDV: 300,549.00\nTotal Premium Payable: 10,484.00';
  const result = extraction.parseInsurance([], pages.join('\f'));
  assert.equal(result.diagnostics.page_count, 12);
  assert.equal(result.policy_number, '996392523110035330');
  assert.equal(result.insured_name, 'POONAM');
  assert.equal(result.period_from, '2025-09-03');
  assert.equal(result.period_to, '2026-09-02');
  assert.equal(result.reg_no, 'CH01BT6268');
  assert.equal(result.engine_no, 'G4LAJM922371');
  assert.equal(result.chassis_no, 'MALA851CLJM866196');
  assert.equal(result.idv, 300549);
  assert.equal(result.total_premium, 10484);
  assert.ok(result.diagnostics.fields.policy_number.source_pages.includes(4));
  assert.ok(result.diagnostics.fields.idv.source_pages.includes(11));
  assert.ok(result.diagnostics.pages.every(p => p.page >= 1 && p.page <= 12));
});

test('conflicting policy fields across pages are surfaced for review', () => {
  const pages = Array.from({ length: 4 }, () => 'Terms and conditions');
  pages[0] = 'Reliance General Insurance Company Limited\nPolicy Number: 996392523110035330';
  pages[1] = 'Policy Number: 111111111111111111';
  pages[2] = 'Period of Insurance: From 03-09-2025 to 02-09-2026';
  pages[3] = 'Total IDV: 300,549.00\nTotal Premium Payable: 10,484.00';
  const result = extraction.parseInsurance([], pages.join('\f'));
  assert.ok(result.diagnostics.warnings.some(w => /policy_number has conflicting values/.test(w)));
  assert.ok(result.diagnostics.fields.policy_number.candidates.length >= 2);
});
