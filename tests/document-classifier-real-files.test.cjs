'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {FILES,FIXTURE_DIR,analyzeFile,loadClassifier}=require('../scripts/debug-document-classifier.cjs');
for(const fixture of FILES){
 test('real file classification: '+fixture.name,async()=>{
  const file=path.join(FIXTURE_DIR,fixture.name);
  assert.ok(fs.existsSync(file),'Missing private local fixture: '+file+'. Place the original file here; never commit it.');
  const result=await analyzeFile(file,fixture.slot);
  assert.equal(result.result.type,fixture.expected,'Expected '+fixture.expected+'; got '+result.result.type+'. Scores='+JSON.stringify(result.result.scores)+'; rules='+JSON.stringify(result.result.hard_rules));
  if(fixture.name==='VPC2073741000100.pdf'){
   const fields=loadClassifier().parseInsurance([],result.text);
   assert.equal(fields.policy_number,'VPC2073741000100','Royal Sundaram policy number should be extracted');
   assert.equal(fields.insured_name,'Mrs POONAM','Royal Sundaram insured name should be extracted from document text');
   assert.equal(fields.chassis_no,'MALA851CLJM866196','Royal Sundaram chassis number should be extracted from document text');
  }
  assert.ok(result.pageCount>=1,'Page count must be logged');
  assert.equal(result.pageLengths.length,result.pageCount,'Page-length output must include every PDF page, including OCR fallback pages');
 });
}
