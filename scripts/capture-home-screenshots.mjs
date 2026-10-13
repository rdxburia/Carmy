import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const base = process.env.TORQ_PREVIEW_URL || 'http://127.0.0.1:4173/Carmy/';
const outDir = process.env.TORQ_SCREENSHOT_DIR || 'artifacts/torqdesk-home';
await fs.mkdir(outDir,{recursive:true});
const viewports = [
  {width:360,height:800,name:'360'},
  {width:390,height:844,name:'390'},
  {width:768,height:1024,name:'768'},
  {width:1366,height:900,name:'1366'}
];
const results=[];
const browser=await chromium.launch({headless:true});
try{
 for(const viewport of viewports){
  const context=await browser.newContext({viewport,deviceScaleFactor:1});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push({type:'pageerror',message:error.message}));
  page.on('console',message=>{if(message.type()==='error')errors.push({type:'console',message:message.text()});});
  page.on('requestfailed',request=>{const url=request.url();if(url.startsWith(base)||url.includes('/Carmy/'))errors.push({type:'requestfailed',url,error:request.failure()?.errorText||'unknown'});});
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('.td-home-hero').waitFor({state:'visible',timeout:20000});
  await page.waitForTimeout(500);
  for(const audience of ['owners','workshops']){
   await page.locator('[data-audience-select="'+audience+'"]').click();
   await page.waitForFunction(value=>document.querySelector('[data-preview-panel="'+value+'"]')?.dataset.active==='true',audience,{timeout:5000});
   await page.waitForTimeout(250);
   const metrics=await page.evaluate(()=>({
    viewportWidth:innerWidth,documentWidth:document.documentElement.scrollWidth,
    horizontalOverflow:document.documentElement.scrollWidth>innerWidth,
    headingVisible:!![...document.querySelectorAll('[data-audience-panel="'+(location.hash==='#workshops'?'workshops':'owners')+'"] h1')].some(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0}),
    activePreviewVisible:(()=>{const e=document.querySelector('[data-preview-panel="'+(location.hash==='#workshops'?'workshops':'owners')+'"]');if(!e)return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0})()
   }));
   const name='home-'+audience+'-'+viewport.name;
   await page.screenshot({path:path.join(outDir,name+'-first-screen.png'),fullPage:false,animations:'disabled'});
   await page.screenshot({path:path.join(outDir,name+'-full-page.png'),fullPage:true,animations:'disabled'});
   results.push({viewport:viewport.name,audience,metrics,errors:[...errors]});
  }
  await context.close();
 }
}finally{await browser.close();}
await fs.writeFile(path.join(outDir,'visual-check-report.json'),JSON.stringify({base,generatedAt:new Date().toISOString(),screenshots:results},null,2));
const failures=results.filter(r=>r.metrics.horizontalOverflow||!r.metrics.activePreviewVisible||r.errors.length);
console.log(JSON.stringify({outDir,count:results.length*2,viewportRuns:results.length,failures:failures.length,results},null,2));
if(failures.length)process.exitCode=1;
