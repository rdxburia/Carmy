'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {FILES,FIXTURE_DIR,analyze}=require('../scripts/debug-insurance-extraction.cjs');
for(const fixture of FILES){
 test('real insurance PDF cross-page extraction: '+fixture.name,async()=>{
  const file=path.join(FIXTURE_DIR,fixture.name);
  assert.ok(fs.existsSync(file),'Missing private fixture '+file+'. Copy the real PDF here; never commit it.');
  const result=await analyze(file);
  assert.equal(result.page_count,result.page_meta.length,'Every PDF page must be read');
  for(const [field,expected] of Object.entries(fixture.expected)){
   assert.equal(result.extraction[field],expected,field+' mismatch; candidates='+JSON.stringify(result.extraction.diagnostics.fields[field]));
  }
  assert.ok(result.extraction.diagnostics.pages.every(p=>p.role&&p.text_length>=0),'Each page must have a role and text length');
 });
}
