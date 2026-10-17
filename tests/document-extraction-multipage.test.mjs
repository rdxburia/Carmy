import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../js/document-extraction.js", import.meta.url), "utf8");
const sandbox = { window: {}, document: {}, console, Intl, Date, Math, Number, String, Object, Array, Set, Map, JSON, RegExp, Promise, Uint8Array, ArrayBuffer, Blob: globalThis.Blob, URL: globalThis.URL };
vm.createContext(sandbox);
new vm.Script(source, { filename: "js/document-extraction.js" }).runInContext(sandbox);
const extraction = sandbox.window.CarmyExtraction;

test("multi-page policy helpers are exported and detect garbled text", () => {
  assert.equal(typeof extraction.pageTextQuality, "function");
  assert.equal(typeof extraction.shouldOcrPage, "function");
  assert.equal(typeof extraction.chooseBetterPageText, "function");
  const garbled = "FHEI B\\NA Nbdbroc Gdsurodib Iampody Cgmgtbh Ibrtgegiotb ae Gdsurodib ium Zacgiy Yifbhucb";
  assert.equal(extraction.shouldOcrPage(garbled), true, "garbled PDF text should trigger OCR fallback");
  const clean = "RELIANCE GENERAL INSURANCE Policy Number 996392523110035330 Period of Insurance Vehicle Registration No. CH01BT6268 Total Premium";
  assert.equal(extraction.shouldOcrPage(clean), false, "clean policy text should not need OCR fallback");
});

test("OCR candidate replaces garbled native text only when its quality is better", () => {
  const garbled = "FHEI B\\NA Nbdbroc Gdsurodib Iampody Cgmgtbh Ibrtgegiotb ae Gdsurodib ium Zacgiy Yifbhucb";
  const readable = "RELIANCE GENERAL INSURANCE Policy Number 996392523110035330 Period of Insurance Vehicle Registration No. CH01BT6268 Total Premium";
  const choice = extraction.chooseBetterPageText(garbled, readable);
  assert.equal(choice.used_ocr, true);
  assert.equal(choice.text, readable);
  const reverse = extraction.chooseBetterPageText(readable, garbled);
  assert.equal(reverse.used_ocr, false);
  assert.equal(reverse.text, readable);
});

test("policy parser reads fields across pages and preserves source page provenance", () => {
  const pages = [
    [
      { text: "RELIANCE PRIVATE CAR PACKAGE POLICY - POLICY SCHEDULE" },
      { text: "Policy Number: 996392523110035330" },
      { text: "Insured Name: MR EXAMPLE CUSTOMER" },
      { text: "Period of Insurance: From 00:00 Hrs on 03-09-2025 to 23:59 Hrs of 02-09-2026" },
      { text: "Registration No. CH01BT6268" },
      { text: "Engine No. / Chassis No. G4LAJM922371 / MALA851CLJM866196" },
      { text: "Total IDV 300,549.00" },
      { text: "Total Premium Payable 10,484.00" }
    ],
    [
      { text: "RELIANCE GENERAL INSURANCE COMPANY LIMITED" },
      { text: "Policy Number: 996392523110035330" },
      { text: "Terms and Conditions" }
    ]
  ];
  const result = extraction.parseInsurance(pages, pages.map(p => p.map(x => x.text).join("\n")).join("\f"));
  assert.equal(result.policy_number, "996392523110035330");
  assert.equal(result.period_from, "2025-09-03");
  assert.equal(result.period_to, "2026-09-02");
  assert.equal(result.reg_no, "CH01BT6268");
  assert.equal(result.chassis_no, "MALA851CLJM866196");
  assert.equal(result.engine_no, "G4LAJM922371");
  assert.equal(result.idv, 300549);
  assert.equal(result.total_premium, 10484);
  assert.ok(result.diagnostics.pages.length === 2, "all pages must be represented in diagnostics");
  assert.ok(result.diagnostics.fields.policy_number.source_pages.includes(1), "field must retain source page");
});

test("policy parser flags conflicting values rather than hiding the conflict", () => {
  const pages = [
    [{ text: "Policy Schedule" }, { text: "Policy Number: 996392523110035330" }, { text: "Period of Insurance From 03-09-2025 to 02-09-2026" }],
    [{ text: "Policy Number: 996392523110035331" }, { text: "Terms and Conditions" }]
  ];
  const result = extraction.parseInsurance(pages, pages.map(p => p.map(x => x.text).join("\n")).join("\f"));
  assert.ok(result.diagnostics.warnings.some(w => w.includes("policy_number has conflicting values")), JSON.stringify(result.diagnostics.warnings));
});


test("OCR-spaced policy number, hyphenated registration and month-name dates normalize correctly", () => {
  const page = [
    { text: "HDFC ERGO General Insurance Company Limited" },
    { text: "Certificate of Insurance cum Policy Schedule" },
    { text: "Policy No. 2311 1010 5887 2900 000" },
    { text: "Period of Insurance From 24 Jun, 2021 00:01 hrs To 23 Jun, 2022 Midnight" },
    { text: "Registration No. TN-09-BT-1094" },
    { text: "Total Premium 6435" }
  ];
  const result = extraction.parseInsurance([page], page.map(x => x.text).join("\n"));
  assert.equal(result.policy_number, "2311101058872900000");
  assert.equal(result.period_from, "2021-06-24");
  assert.equal(result.period_to, "2022-06-23");
  assert.equal(result.reg_no, "TN09BT1094");
});
