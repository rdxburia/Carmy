'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {FILES,FIXTURE_DIR,analyzeFile}=require('../scripts/debug-document-classifier.cjs');
for(const fixture of FILES){
 test('real file classification: '+fixture.name,async()=>{
  const file=path.join(FIXTURE_DIR,fixture.name);
  assert.ok(fs.existsSync(file),'Missing private local fixture: '+file+'. Place the original file here; never commit it.');
  const result=await analyzeFile(file,fixture.slot);
  assert.equal(result.result.type,fixture.expected,'Expected '+fixture.expected+'; got '+result.result.type+'. Scores='+JSON.stringify(result.result.scores)+'; rules='+JSON.stringify(result.result.hard_rules));
  assert.ok(result.pageCount>=1,'Page count must be logged');
  assert.equal(result.pageLengths.length,fixture.name.endsWith('.pdf')&&result.ocrUsed?1:result.pageCount,'Page-length output must correspond to extracted pages (OCR fallback is first-page only, matching the browser fallback)');
 });
}
