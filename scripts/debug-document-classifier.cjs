#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const vm=require('node:vm');
const pdfjsLib=require('pdfjs-dist/legacy/build/pdf.js');
const ROOT=path.resolve(__dirname,'..');
const FIXTURE_DIR=path.join(ROOT,'tests','fixtures','local');
const FILES=[
 {name:'VPC2073741000100.pdf',slot:'insurance',expected:'insurance'},
 {name:'Policy_907050787_3518834116615.pdf',slot:'insurance',expected:'insurance'},
 {name:'PolicySchedule (86).pdf',slot:'insurance',expected:'insurance'},
 {name:'d8387d90-2947-471d-bd5e-48a4a87574b6.pdf',slot:'insurance',expected:'insurance-two-wheeler'},
 {name:'Adobe_Scan_Oct_9__2026.pdf',slot:'puc',expected:'puc'},
 {name:'RC.jpeg',slot:'rc',expected:'rc'}
];
function clean(v){return String(v??'').replace(/[‐‑‒–—]/g,'-').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim()}
function rows(items){
 const a=[];
 for(const q of items.filter(x=>clean(x.str))){
  const y=+q.transform[5],x=+q.transform[4];let r=a.find(z=>Math.abs(z.y-y)<=3);
  if(!r){r={y,items:[]};a.push(r)}
  r.items.push({t:clean(q.str),x,w:+(q.width||0)});
 }
 for(const r of a){r.items.sort((a,b)=>a.x-b.x);r.text=r.items.map(x=>x.t).join(' ')}
 return a.sort((a,b)=>b.y-a.y);
}
function loadClassifier(){
 const source=fs.readFileSync(path.join(ROOT,'js','document-extraction.js'),'utf8');
 const sandbox={window:{},document:{},console,Intl,Date,Math,Number,String,Object,Array,Set,Map,JSON,RegExp,Promise,Uint8Array,ArrayBuffer,Blob:global.Blob,URL:global.URL};
 vm.createContext(sandbox);new vm.Script(source,{filename:'js/document-extraction.js'}).runInContext(sandbox);
 return sandbox.window.CarmyExtraction;
}
function ocrImage(file){return execFileSync('tesseract',[file,'stdout','-l','eng','--psm','6'],{encoding:'utf8',maxBuffer:20*1024*1024})}
function ocrPdfPage(file,pageNo){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'carmy-puc-'));
 try{const prefix=path.join(tmp,'page');execFileSync('pdftoppm',['-f',String(pageNo),'-l',String(pageNo),'-r','220','-png','-singlefile',file,prefix],{stdio:'ignore'});return ocrImage(prefix+'.png')}
 finally{fs.rmSync(tmp,{recursive:true,force:true})}
}
async function analyzeFile(file,slot){
 const ext=path.extname(file).toLowerCase();let pageTexts=[],text='',pageCount=1,ocrUsed=false,ocrPages=[];
 if(ext==='.pdf'){
  const data=new Uint8Array(fs.readFileSync(file));
  const doc=await pdfjsLib.getDocument({data,useSystemFonts:true,isEvalSupported:false}).promise;pageCount=doc.numPages;
  for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n),content=await page.getTextContent();let pageText=rows(content.items).map(r=>r.text).join('\n');if(pageText.replace(/\s/g,'').length<30){pageText=ocrPdfPage(file,n);ocrUsed=true;ocrPages.push(n)}pageTexts.push(pageText)}
  text=pageTexts.join('\n\f\n');
 }else if(['.jpg','.jpeg','.png'].includes(ext)){text=ocrImage(file);pageTexts=[text];ocrUsed=true;ocrPages=[1]}
 else throw new Error('Unsupported fixture type: '+ext);
 const result=loadClassifier().classifyDetailed(text,slot,{pageCount});
 return {file:path.basename(file),slot,pageCount,pageLengths:pageTexts.map(x=>x.length),ocrUsed,ocrPages,result,text,classifier:loadClassifier()};
}
function printResult(r){
 console.log('\n=== FILE: '+r.file+' ===');console.log('Page count: '+r.pageCount);
 console.log('Per-page extracted text lengths: '+r.pageLengths.map((n,i)=>'p'+(i+1)+'='+n).join(', '));
 console.log('OCR fallback used: '+(r.ocrUsed?'YES on page(s) '+r.ocrPages.join(', '):'NO'));
 console.log('Matched signals (type | weight | label | matched text):');
 for(const s of r.result.matchedSignals)console.log('  '+s.type.toUpperCase()+' | +'+s.weight+' | '+s.label+' | '+JSON.stringify(s.match));
 console.log('Total scores: Insurance='+r.result.scores.insurance+', PUC='+r.result.scores.puc+', RC='+r.result.scores.rc);
 console.log('Hard rules: '+JSON.stringify(r.result.hard_rules));
 console.log('FINAL: '+r.result.type.toUpperCase()+' | confidence='+r.result.confidence);
}
async function main(){
 let failed=false;
 for(const f of FILES){
  const file=path.join(FIXTURE_DIR,f.name);
  if(!fs.existsSync(file)){console.log('\n=== FILE: '+f.name+' ===\nNOT TESTED: missing local fixture at '+file);failed=true;continue}
  try{const r=await analyzeFile(file,f.slot);printResult(r);if(r.result.type!==f.expected){console.log('EXPECTED: '+f.expected.toUpperCase()+' | ACTUAL: '+r.result.type.toUpperCase()+' — FAIL');failed=true}else console.log('EXPECTED CLASSIFICATION: MATCH')}
  catch(e){console.error('\n=== FILE: '+f.name+' ===\nERROR: '+(e.stack||e));failed=true}
 }
 if(failed)process.exitCode=1;
}
if(require.main===module)main();
module.exports={FILES,FIXTURE_DIR,analyzeFile,loadClassifier};
