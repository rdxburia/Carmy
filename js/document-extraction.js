/* Browser-only extraction: pdf.js + Tesseract.js. */
(function(){
const PDF='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',PDFW='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',TESS='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';let pl,tl;
const clean=v=>String(v??'').replace(/[‐‑‒–—]/g,'-').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim(),norm=v=>clean(v).toUpperCase(),alnum=v=>norm(v).replace(/[^A-Z0-9]/g,'')||null;
const MONTHS={JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};
function load(src,id){return new Promise((ok,no)=>{let s=document.getElementById(id);if(s){if(s.dataset.ready==='1')return ok();s.addEventListener('load',ok,{once:true});s.addEventListener('error',no,{once:true});return}s=document.createElement('script');s.id=id;s.src=src;s.async=true;s.onload=()=>{s.dataset.ready='1';ok()};s.onerror=no;document.head.appendChild(s)})}
async function pdf(){if(window.pdfjsLib)return window.pdfjsLib;if(!pl)pl=load(PDF,'carmy-pdfjs').then(()=>{window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFW;return window.pdfjsLib});return pl}
async function tess(){if(window.Tesseract)return window.Tesseract;if(!tl)tl=load(TESS,'carmy-tesseract').then(()=>window.Tesseract);return tl}
function validDate(y,m,d){y=+y;m=+m;d=+d;const x=new Date(Date.UTC(y,m-1,d));return y>0&&m>0&&m<13&&d>0&&x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d?y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'):null}
function date(v){const s=clean(v).replace(/\b(?:HRS?|MIDNIGHT).*$/i,'');let m=s.match(/(\d{1,2})[-/. ]([A-Za-z]{3})[-/. ](\d{4})/);if(m&&MONTHS[m[2].toUpperCase()])return validDate(m[3],MONTHS[m[2].toUpperCase()],m[1]);m=s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);if(m)return validDate(m[3],m[2],m[1]);m=s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);return m?validDate(m[1],m[2],m[3]):null}
function money(v){const n=Number(String(v??'').replace(/[₹Rs,\s]/gi,''));return Number.isFinite(n)?n:null}
function policyNo(v){const s=clean(v).replace(/\s+/g,'');return /^\d{4}\/\d{8}\/\d{3}\/\d{2}$/.test(s)||/^\d{18}$/.test(s)||/^VPC\d+$/.test(s)||/^[A-Z0-9][A-Z0-9/\-]{6,29}$/.test(s)?s:null}
function chassis(v){const s=alnum(v);return s&&s.length===17&&!/[IOQ]/.test(s)?s:null}
function engine(v){const s=alnum(v);return s&&s.length>=6&&s.length<=24?s:null}
function reg(v){let s=norm(v).replace(/[^A-Z0-9]/g,'');if(s.length<8)return null;s=[...s].map((c,i)=>i<2?({'0':'O','1':'I','2':'Z','5':'S','8':'B'}[c]||c):i<4?({'O':'0','Q':'0','D':'0','I':'1','L':'1','Z':'2','S':'5','B':'8'}[c]||c):c).join('');const m=s.match(/^([A-Z]{2})(\d{2})([A-Z]{1,3})(\d{4})$/);return m?m[1]+m[2]+m[3]+m[4]:null}
function insurer(t){
 t=norm(t);
 const rules=[
 [/CHOLAMANDALAM\s*MS|CHOLAMANDALAM/,'Cholamandalam MS General Insurance Co. Ltd.'],
 [/RELIANCE\s+GENERAL/,'Reliance General Insurance Co. Ltd.'],
 [/ROYAL\s+SUNDARAM/,'Royal Sundaram General Insurance Co. Limited'],
 [/HDFC\s*ERGO/,'HDFC ERGO General Insurance Co. Ltd.'],
 [/ICICI\s+LOMBARD/,'ICICI Lombard General Insurance Co. Ltd.'],
 [/BAJAJ\s+ALLIANZ|BAJAJ\s+GENERAL/,'Bajaj Allianz General Insurance Co. Ltd.'],
 [/NEW\s+INDIA/,'The New India Assurance Co. Ltd.'],
 [/NATIONAL\s+INSURANCE/,'National Insurance Company Limited'],
 [/ORIENTAL\s+INSURANCE/,'The Oriental Insurance Co. Ltd.'],
 [/UNITED\s+INDIA/,'United India Insurance Co. Ltd.'],
 [/TATA\s+AIG/,'Tata AIG General Insurance Co. Ltd.'],
 [/SBI\s+GENERAL/,'SBI General Insurance Co. Ltd.'],
 [/GO\s+DIGIT|DIGIT\s+INSURANCE/,'Go Digit General Insurance Ltd.'],
 [/ACKO/,'ACKO General Insurance Ltd.'],
 [/IFFCO\s+TOKIO/,'IFFCO-TOKIO General Insurance Co. Ltd.'],
 [/UNIVERSAL\s+SOMPO/,'Universal Sompo General Insurance Co. Ltd.']
 ];
 const found=[];
 for(const [re,name] of rules){const m=re.exec(t);if(m)found.push({index:m.index,name})}
 found.sort((a,b)=>a.index-b.index);
 return found[0]?.name||null;
}
function rows(items){const a=[];for(const q of items.filter(x=>clean(x.str))){const y=+q.transform[5],x=+q.transform[4];let r=a.find(z=>Math.abs(z.y-y)<=3);if(!r){r={y,items:[]};a.push(r)}r.items.push({t:clean(q.str),x,w:+(q.width||0)})}for(const r of a){r.items.sort((a,b)=>a.x-b.x);r.text=r.items.map(x=>x.t).join(' ')}return a.sort((a,b)=>a.y-b.y)}
async function ocr(file,progress,rc=false){const b=await createImageBitmap(file),c=document.createElement('canvas');c.width=b.width;c.height=b.height;c.getContext('2d').drawImage(b,0,0);return ocrCanvas(c,progress,rc)}
async function ocrPdfPage(doc,progress,rc=false,pageNumber=1){const p=await doc.getPage(pageNumber),v=p.getViewport({scale:2}),c=document.createElement('canvas');c.width=v.width;c.height=v.height;await p.render({canvasContext:c.getContext('2d'),viewport:v}).promise;return ocrCanvas(c,progress,rc)}
function rowsFromText(text){return String(text||'').split(/\r?\n/).map((line,i)=>({y:i*12,items:[{t:clean(line),x:0,w:line.length}],text:clean(line)})).filter(r=>r.text)}
async function pdfData(file,progress){const p=await pdf(),d=await p.getDocument({data:await file.arrayBuffer()}).promise,ps=[],pageMeta=[];for(let i=1;i<=d.numPages;i++){const pg=await d.getPage(i),tc=await pg.getTextContent();let rs=rows(tc.items),pageText=rs.map(r=>r.text).join('\n'),ocrUsed=false;if(pageText.replace(/\s/g,'').length<30){const o=await ocrPdfPage(d,progress,false,i);rs=rowsFromText(o.text);pageText=o.text;ocrUsed=true}ps.push(rs);pageMeta.push({page:i,text_length:pageText.length,ocr_used:ocrUsed});progress?.(i/d.numPages*.5,'READING PDF')}return{d,ps,pageMeta}}
async function thumb(d){try{const p=await d.getPage(1),v=p.getViewport({scale:1.1}),c=document.createElement('canvas');c.width=v.width;c.height=v.height;await p.render({canvasContext:c.getContext('2d'),viewport:v}).promise;return c.toDataURL('image/jpeg',.72)}catch{return null}}
async function ocrCanvas(c,progress,rc=false){const T=await tess();const scale=Math.min(1,3200/c.width),src=c,base=document.createElement('canvas');base.width=c.width*scale;base.height=c.height*scale;const g=base.getContext('2d');g.filter='grayscale(1) contrast(1.28)';g.drawImage(src,0,0,base.width,base.height);c=base;const zones=rc?[{x:0,w:1},{x:0,w:.6},{x:.4,w:.6}]:[{x:0,w:1}],out=[];for(let i=0;i<zones.length;i++){const z=zones[i],zC=document.createElement('canvas');zC.width=c.width*z.w;zC.height=c.height;zC.getContext('2d').drawImage(c,c.width*z.x,0,zC.width,zC.height,0,0,zC.width,zC.height);const r=await T.recognize(zC,'eng',{config:'--psm 6',logger:m=>progress?.(.5+(i+(m.progress||0))/zones.length*.5,rc?'RC OCR':'OCR')});out.push(r.data.text||'')}return{text:out.join('\n'),thumbnail:c.toDataURL('image/jpeg',.75)}}
function rowValue(rs,label,pat){for(const r of rs){const m=r.text.match(label);if(!m)continue;let p=m.index+m[0].length,pos=0;for(const c of r.items){const s=pos;pos+=c.t.length+1;if(s+c.t.length<=p)continue;const x=c.t.match(pat);if(x)return x[0]}}return null}
function rowCapture(rs,re){for(const r of rs){const m=r.text.match(re);if(m)return clean(m[1])}return null}
function below(rs,label,pat,window=100){const words=(label.source.match(/[A-Za-z]+/g)||[]).map(x=>x.toUpperCase());for(let i=0;i<rs.length;i++){if(!label.test(rs[i].text))continue;const anchors=rs[i].items.filter(q=>words.some(w=>q.t.toUpperCase().startsWith(w)));const x=(anchors[anchors.length-1]||rs[i].items[rs[i].items.length-1]).x;for(let j=i+1;j<Math.min(i+4,rs.length);j++){const near=rs[j].items.filter(q=>Math.abs(q.x-x)<window).sort((a,b)=>Math.abs(a.x-x)-Math.abs(b.x-x));for(const q of near){const z=q.t.match(pat);if(z)return z[0]}const joined=near.sort((a,b)=>a.x-b.x).map(q=>q.t).join(' '),m=joined.match(pat);if(m)return m[0]}}return null}
function parseInsurance(ps,text){
 const pageRows=Array.isArray(ps)?ps:[];
 const pageTexts=pageRows.length?pageRows.map(rs=>Array.isArray(rs)?rs.map(r=>r.text).join('\n'):String(rs||'')):String(text||'').split(/\f/);
 const roles=pageTexts.map((raw,i)=>{const t=norm(raw);let role='support/marketing/garage list';if(/TERMS\s*(?:AND|&)\s*CONDITIONS|EXCLUSIONS|DEFINITIONS|POLICY\s+WORDING/i.test(t))role='terms and conditions';else if(/PREFERRED\s+(?:NETWORK|CASHLESS)|GARAGE\s+LOCATOR|LIST\s+OF\s+(?:PREFERRED\s+)?GARAGES|CUSTOMER\s+SUPPORT|CUSTOMER\s+CARE\s+HELPLINE/i.test(t)&&!/POLICY\s+NO|POLICY\s+NUMBER/i.test(t))role='customer support / marketing / garage list';else if(/GST\s+INVOICE|GROSS\s+PREMIUM/i.test(t)&&/GSTIN|TAXABLE\s+PREMIUM/i.test(t))role='GST invoice';else if(/RISK\s+ASSUMPTION|PREVIOUS\s+POLICY\s+DETAILS|PREVIOUS\s+INSURER/i.test(t))role='risk assumption / cover letter';else if(/CERTIFICATE\s+(?:OF\s+INSURANCE|CUM\s+POLICY\s+SCHEDULE)|POLICY\s+SCHEDULE/i.test(t))role='certificate and policy schedule';else if(/POLICY\s+(?:NO|NUMBER)|PERIOD\s+OF\s+INSURANCE|VALID\s+FROM/i.test(t))role=i===0?'policy cover / first page':'policy cover / policy page';return{page:i+1,role,text_length:raw.length,ocr_used:!!pageRows[i]?.ocr_used}});
 const relevant=(i)=>!['customer support / marketing / garage list','terms and conditions'].includes(roles[i]?.role);
 const candidates={insurer_name:[],policy_number:[],insured_name:[],period_from:[],period_to:[],reg_no:[],chassis_no:[],engine_no:[],idv:[],total_premium:[],previous_policy_number:[],previous_insurer:[],policy_type:[]};
 const warnings=[],add=(field,value,page,source,weight=1)=>{if(value===null||value===undefined||String(value).trim()==='')return;candidates[field].push({value:typeof value==='string'?clean(value):value,page,source,weight})};
 const known=[
  [/ROYAL\s+SUNDARAM\s+GENERAL\s+INSURANCE(?:\s+CO\.?\s+LIMITED|\s+COMPANY\s+LIMITED)?/i,'Royal Sundaram General Insurance Co. Limited'],
  [/RELIANCE\s+GENERAL\s+INSURANCE(?:\s+COMPANY\s+LIMITED|\s+CO\.?\s+LTD\.?)?/i,'Reliance General Insurance Co. Ltd.'],
  [/CHOLAMANDALAM\s+MS\s+GENERAL\s+INSURANCE\s+CO\.?\s+LTD\.?/i,'Cholamandalam MS General Insurance Co. Ltd.'],
  [/NATIONAL\s+INSURANCE\s+COMPANY\s+LIMITED/i,'National Insurance Company Limited'],
  [/THE\s+NEW\s+INDIA\s+ASSURANCE\s+CO\.?\s+LTD\.?/i,'The New India Assurance Co. Ltd.'],
  [/THE\s+ORIENTAL\s+INSURANCE\s+CO\.?\s+LTD\.?/i,'The Oriental Insurance Co. Ltd.'],
  [/UNITED\s+INDIA\s+INSURANCE\s+CO\.?\s+LTD\.?/i,'United India Insurance Co. Ltd.'],
  [/HDFC\s*ERGO\s+GENERAL\s+INSURANCE(?:\s+CO\.?\s+LTD\.?)?/i,'HDFC ERGO General Insurance Co. Ltd.'],
  [/ICICI\s+LOMBARD\s+GENERAL\s+INSURANCE(?:\s+CO\.?\s+LTD\.?)?/i,'ICICI Lombard General Insurance Co. Ltd.'],
  [/BAJAJ\s+(?:ALLIANZ|GENERAL)\s+INSURANCE(?:\s+CO\.?\s+LTD\.?)?/i,'Bajaj Allianz General Insurance Co. Ltd.'],
  [/TATA\s+AIG\s+GENERAL\s+INSURANCE(?:\s+CO\.?\s+LTD\.?)?/i,'Tata AIG General Insurance Co. Ltd.']
 ];
 const numeric=/[0-9][0-9,]*(?:\.[0-9]{1,2})?/;
 const dates=/\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{1,2}[-/.][A-Z]{3}[-/.]\d{4}/i;
 const valAfter=(raw,label,pattern)=>{const m=raw.match(label);if(!m)return null;const rest=raw.slice(m.index+m[0].length,Math.min(raw.length,m.index+m[0].length+220));const v=rest.match(pattern);return v?v[0]:null};
 const near=(rs,label,pattern)=>rowValue(rs,label,pattern)||below(rs,label,pattern,220);
 const addPeriod=(i,raw)=>{
  let m=raw.match(/Period\s+of\s+Own\s+Damage\s*:?\s*(\d{1,2}[-/.][A-Z]{3}[-/.]\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{4})[\s\S]{0,90}?\bTo\b[\s\S]{0,30}?(\d{1,2}[-/.][A-Z]{3}[-/.]\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{4})/i);
  if(!m)m=raw.match(/Period\s+of\s+Insurance\s*:?\s*From[\s\S]{0,100}?\b(?:on\s+)?(\d{1,2}[‐\-/.]\d{1,2}[‐\-/.]\d{4})[\s\S]{0,120}?\bto\b[\s\S]{0,50}?(\d{1,2}[‐\-/.]\d{1,2}[‐\-/.]\d{4})/i);
  if(!m)m=raw.match(/Valid\s+From\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})[\s\S]{0,120}?Valid\s+Till(?:\s*\([^)]*\))?\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})/i);
  if(m){add('period_from',date(m[1]),i+1,'policy period label',5);add('period_to',date(m[2]),i+1,'policy period label',5)}
 };
 const nearLabel=(raw,label,pat)=>valAfter(raw,label,pat);
 for(let i=0;i<pageTexts.length;i++){
  const raw=pageTexts[i]||'',rs=pageRows[i]||[],t=norm(raw);
  // Insurer evidence is scored per occurrence and per page; previous-policy blocks never vote for the issuer.
  for(const line of raw.split(/\n/)){
   if(/PREVIOUS\s+(?:POLICY|INSURER)|FULL\s+NAME\s+OF\s+PREVIOUS\s+INSURER/i.test(line))continue;
   for(const [re,name] of known){if(!re.test(line))continue;const strong=/SERVICE\s+BRANCH\s+ADDRESS|REGISTERED\s+OFFICE|CORPORATE\s+OFFICE|IRDAI\s+REGISTRATION|CIN\s*:|^\s*FOR\s+/i.test(line);add('insurer_name',name,i+1,strong?'issuer header/footer/signature':'issuer mention',strong?6:1)}
  }
  if(!relevant(i))continue;
  // Read each relevant page independently; no early exit after the first match.
  let m=raw.match(/^\s*Policy\s*(?:No\.?|Number)\s*:?\s*([A-Z0-9][A-Z0-9\/-]{6,30})/im);
  if(m&&!/PREVIOUS/i.test(raw.slice(Math.max(0,m.index-20),m.index)))add('policy_number',policyNo(m[1]),i+1,'policy number label',5);
  m=raw.match(/(?:Insured(?:'s)?\s+Name|Name\s+of\s+the\s+Insured)\s*:?\s*([A-Z][A-Z .'-]{1,50}?)(?=\s+(?:Insured\s+Date|Previous\s+Insurer|Period\s+of|Policy\s+No|Policy\s+Number|Address|Proposal|Date\s+of|Mobile|Email)|\n|$)/im);
  if(m)add('insured_name',clean(m[1]).replace(/\s+\.$/,''),i+1,'insured name label',4);
  addPeriod(i,raw);
  m=raw.match(/(?:Vehicle\s+Registration\s+No\.?|Registration\s+No\.?|Regn\.?\s+No\.?)\s*:?\s*([A-Z]{2}\s*\d{2}\s*[A-Z]{1,3}\s*\d{4})/i);
  if(m)add('reg_no',reg(m[1]),i+1,'vehicle registration label',4);
  m=raw.match(/(?:Chassis\s+No\.?|VIN\/Chassis\s+No\.?)\s*:?\s*([A-Z0-9]{17})/i);
  if(!m)m=raw.match(/(?:Chassis\s+No\.?|VIN\/Chassis\s+No\.?)[^\n]{0,120}\n[^\n]{0,160}?([A-Z0-9]{17})/i);
  if(m)add('chassis_no',chassis(m[1]),i+1,'chassis label/column',4);
  m=raw.match(/Engine(?:\/Motor)?\s+No\.?\s*[:\-]\s*([A-Z0-9]{6,24})/i);
  if(!m){const pair=raw.match(/Engine\s+No\.?\s*\/\s*Chassis\s+No\.?\s*([A-Z0-9]{6,24})\s*\/\s*([A-Z0-9]{17})/i);if(pair)m=[pair[0],pair[1]]}
  if(!m){const v=near(rs,/Engine\s+No/i,/[A-Z0-9]{10,24}/);if(v)m=[v,v]}
  if(m)add('engine_no',engine(m[1]),i+1,'engine label/column',4);
  m=raw.match(/(?:Total\s+IDV(?:\s*\(Rs\.?\))?|Vehicle\s+IDV|Insured'?s\s+Declared\s+Value(?:\s*\(IDV\))?)\s*:?\s*(?:₹|Rs\.?)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  if(!m){const v=near(rs,/Total\s+IDV|Vehicle\s+IDV|Insured'?s\s+Declared\s+Value/i,numeric);if(v)m=[v,v]}
  if(m)add('idv',money(m[1]),i+1,'IDV label/table',4);
  m=raw.match(/(?:Gross\s+Premium(?:\s+Paid)?|Total\s+Premium(?:\s+Payable)?|Premium\s+Amount\s*\(Rs\.?\))\s*:?\s*(?:₹|Rs\.?)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  if(!m){const v=near(rs,/Gross\s+Premium|Total\s+Premium|Premium\s+Amount/i,numeric);if(v)m=[v,v]}
  if(m)add('total_premium',money(m[1]),i+1,/GST\s+INVOICE/i.test(t)?'GST invoice gross premium':'premium schedule label',/Gross\s+Premium|Total\s+Premium\s+Payable/i.test(m[0])?5:3);
  m=raw.match(/\bPrevious\s+Policy\s+No\.?\s*:?\s*([A-Z0-9\/-]{8,30})/i);
  if(m)add('previous_policy_number',policyNo(m[1]),i+1,'previous policy number label',5);
  m=raw.match(/(?:Previous\s+Policy\s+Insurance\s+Co\.?|Previous\s+Insurer|Full\s+Name\s+of\s+previous\s+insurer)\s*:?\s*([A-Z][A-Z .'-]{3,80}?)(?=\s+(?:Total\s+Deductible|Period|Policy\s+No|Previous\s+Policy\s+Type|Date)|\n|$)/im);
  if(m){const found=known.find(([re])=>re.test(m[1]));add('previous_insurer',found?.[1]&&known.find(([re])=>re.test(m[1]))?.[1]?known.find(([re])=>re.test(m[1]))[1]:clean(m[1]).replace(/\.$/,''),i+1,'previous insurer block',5)}
  if(/PACKAGE\s+POLICY/i.test(t)&&!/PREVIOUS\s+POLICY\s+TYPE\s*:?\s*PACKAGE/i.test(t))add('policy_type','Package',i+1,'policy title',5);
 }
 const normalize=(field,v)=>field==='period_from'||field==='period_to'?date(v)||String(v):field==='idv'||field==='total_premium'?String(Number(v)):field==='policy_number'||field==='previous_policy_number'?alnum(v):field==='reg_no'||field==='chassis_no'||field==='engine_no'?alnum(v):norm(v).replace(/[.\s]+$/,'');
 const chosen={},confidence={},fieldSources={},fieldCandidates={};
 for(const field of Object.keys(candidates)){
  const list=candidates[field],groups=new Map();
  for(const c of list){const k=normalize(field,c.value);if(!k)continue;let g=groups.get(k);if(!g){g={value:c.value,pages:new Set(),weight:0,candidates:[]};groups.set(k,g)}g.pages.add(c.page);g.weight+=c.weight;g.candidates.push(c)}
  const ordered=[...groups.values()].sort((a,b)=>b.pages.size-a.pages.size||b.weight-a.weight||Math.min(...a.pages)-Math.min(...b.pages));
  const best=ordered[0];
  chosen[field]=best?.value??null;
  confidence[field]=best?(best.pages.size>=2?'verified:'+best.pages.size:'single:'+Math.min(...best.pages)):'unverified';
  fieldSources[field]=best?[...best.pages].sort((a,b)=>a-b):[];
  fieldCandidates[field]=list.map(c=>({value:c.value,page:c.page,source:c.source,weight:c.weight}));
  if(ordered.length>1&&field!=='insurer_name'&&normalize(field,ordered[0].value)!==normalize(field,ordered[1].value))warnings.push(field+' has conflicting values across pages: '+ordered.map(g=>String(g.value)+' (pages '+[...g.pages].join(', ')+')').join('; '));
 }
 // Issuer selection is weighted by independent pages and header/footer/signature evidence, excluding previous-policy lines.
 const issuerGroups=new Map();
 for(const c of candidates.insurer_name){const k=normalize('insurer_name',c.value);let g=issuerGroups.get(k);if(!g){g={value:c.value,pages:new Set(),weight:0,candidates:[]};issuerGroups.set(k,g)}g.pages.add(c.page);g.weight+=c.weight;g.candidates.push(c)}
 const issuer=[...issuerGroups.values()].sort((a,b)=>b.weight-a.weight||b.pages.size-a.pages.size)[0];
 chosen.insurer_name=issuer?.value||null;
 confidence.insurer_name=issuer?(issuer.pages.size>=2?'verified:'+issuer.pages.size:'single:'+Math.min(...issuer.pages)):'unverified';
 fieldSources.insurer_name=issuer?[...issuer.pages].sort((a,b)=>a-b):[];
 fieldCandidates.insurer_name=candidates.insurer_name.map(c=>({value:c.value,page:c.page,source:c.source,weight:c.weight}));
 if(chosen.policy_number&&fieldSources.policy_number.length<2)warnings.push('Policy number was not independently repeated on at least two pages. Verify it before saving.');
 if(chosen.period_from&&chosen.period_to){const from=new Date(chosen.period_from+'T00:00:00Z');from.setUTCFullYear(from.getUTCFullYear()+1);from.setUTCDate(from.getUTCDate()-1);const expected=from.toISOString().slice(0,10);if(expected!==chosen.period_to)warnings.push('Policy end date differs from one-year-minus-one-day expectation ('+expected+').')}
 const d={...chosen,parser:'whole-document-cross-page',confidence,field_sources:fieldSources,field_candidates:fieldCandidates,diagnostics:{page_count:pageTexts.length,pages:roles,fields:Object.fromEntries(Object.keys(candidates).map(k=>[k,{candidates:fieldCandidates[k],chosen:chosen[k],source_pages:fieldSources[k],status:confidence[k]}])),warnings}};
 return d;
}
function parsePuc(text){const t=norm(text),d={test_date:null,valid_until:null,certificate_number:null,cost:null,registration_no:null,suggested_valid_until:null,confidence:{}};const set=(k,v)=>{d[k]=v??null;d.confidence[k]=v?'high':'unverified'};set('registration_no',reg(t.match(/(?:REG(?:ISTRATION)?\s*(?:NO|NUMBER)|VEHICLE\s*(?:REGISTRATION|NO))[^A-Z0-9]{0,20}([A-Z]{2}[ -]?\d{2}[ -]?[A-Z]{1,3}[ -]?\d{4})/i)?.[1]));const c=t.match(/(?:CERTIFICATE\s*(?:SL\.?\s*NO\.?|NO\.?|NUMBER)|PUC\s*(?:NO|NUMBER))[^A-Z0-9]{0,20}([A-Z0-9 ]{8,32}?)(?=\s+(?:REGISTRATION|REGN|VEHICLE|DATE|TEST|VALIDITY|FEES|COST|FUEL|PUC\s+CODE)|$)/i);set('certificate_number',c?.[1]?.replace(/\s+/g,'').replace(/[^A-Z0-9]/g,'')||null);const ds=[...t.matchAll(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}\b/g)].map(x=>date(x[0])).filter(Boolean);set('test_date',ds[0]);set('valid_until',ds[1]);set('cost',money(t.match(/(?:FEES?|COST|AMOUNT)[^0-9]{0,20}(?:RS\.?|₹)?\s*([0-9]+(?:\.[0-9]{1,2})?)/i)?.[1]));if(d.test_date){const x=new Date(d.test_date+'T00:00:00Z');x.setUTCFullYear(x.getUTCFullYear()+1);x.setUTCDate(x.getUTCDate()-1);d.suggested_valid_until=x.toISOString().slice(0,10);if(d.valid_until!==d.suggested_valid_until)d.confidence.valid_until='review'}return d}
function levenshtein(a,b){a=alnum(a)||'';b=alnum(b)||'';const q=[...Array(b.length+1)].map((_,i)=>i);for(let i=1;i<=a.length;i++){let p=q[0];q[0]=i;for(let j=1;j<=b.length;j++){const z=q[j];q[j]=Math.min(q[j]+1,q[j-1]+1,p+(a[i-1]===b[j-1]?0:1));p=z}}return q[b.length]}
function validate(d,car,type){const o={ok:true,errors:[],warnings:[]},eq=(a,b)=>alnum(a)===alnum(b);if(type==='insurance'){if(!d.insurer_name)o.errors.push('Issuing insurer could not be verified.');if(!d.policy_number)o.errors.push('Policy number could not be extracted.');if(!d.insured_name)o.errors.push('Insured name could not be verified.');if(d.idv==null)o.errors.push('IDV could not be verified.');if(d.total_premium==null)o.errors.push('Gross / total premium could not be verified.');if(car?.registration_no&&!d.reg_no)o.errors.push('Policy registration number could not be verified.');if(car?.registration_no&&d.reg_no&&!eq(d.reg_no,car.registration_no)){if(levenshtein(d.reg_no,car.registration_no)<=1)o.warnings.push('The policy registration differs by one character from the selected RC. Please compare the original document; no value was changed automatically.');else o.errors.push('Policy registration number does not match the selected RC.')}if(car?.vin&&!d.chassis_no)o.errors.push('Policy chassis number could not be verified.');if(car?.engine_no&&!d.engine_no)o.errors.push('Policy engine number could not be verified.');if(car?.vin&&d.chassis_no&&!eq(d.chassis_no,car.vin)){if(levenshtein(d.chassis_no,car.vin)<=1)o.warnings.push('The policy chassis differs by one character from the selected RC. Please compare the original document; no value was changed automatically.');else o.errors.push('Policy chassis number does not match the selected RC.')}if(car?.engine_no&&d.engine_no&&!eq(d.engine_no,car.engine_no)){if(levenshtein(d.engine_no,car.engine_no)<=1)o.warnings.push('The policy engine number differs by one character from the selected RC. Please compare the original document; no value was changed automatically.');else o.errors.push('Policy engine number does not match the selected RC.')}if(!d.period_from||!d.period_to)o.errors.push('Policy period From/To is required.')}else if(type==='puc'){if(car?.registration_no&&!d.registration_no)o.errors.push('PUC registration number could not be verified.');if(car?.registration_no&&d.registration_no&&!eq(d.registration_no,car.registration_no))o.errors.push('This PUC belongs to a different vehicle.');if(!d.test_date)o.errors.push('PUC test date could not be verified.');if(!d.valid_until)o.errors.push('PUC validity could not be verified.');if(!d.certificate_number)o.errors.push('PUC certificate number could not be verified.');if(d.test_date&&d.valid_until){const x=new Date(d.test_date+'T00:00:00Z');x.setUTCFullYear(x.getUTCFullYear()+1);x.setUTCDate(x.getUTCDate()-1);if(x.toISOString().slice(0,10)!==d.valid_until)o.warnings.push('PUC validity differs from test date + 1 year - 1 day. Please verify.')}}else{if(car?.registration_no&&!d.registration_no)o.errors.push('RC registration number could not be verified.');if(car?.registration_no&&d.registration_candidates?.length&&!d.registration_candidates.some(x=>eq(x,car.registration_no)))o.errors.push('RC registration number does not match this vehicle.');if(car?.vin&&d.chassis_no&&!eq(d.chassis_no,car.vin)){if(levenshtein(d.chassis_no,car.vin)<=2)o.warnings.push('OCR may have misread the chassis number. Saved vehicle value can be used after confirmation.');else o.errors.push('RC chassis number does not match this vehicle.')}if(car?.engine_no&&d.engine_no&&!eq(d.engine_no,car.engine_no)){if(levenshtein(d.engine_no,car.engine_no)<=2)o.warnings.push('OCR may have misread the engine number. Saved vehicle value can be used after confirmation.');else o.errors.push('RC engine number does not match this vehicle.')}}o.ok=!o.errors.length;return o}
function parseRC(text){const t=norm(text),lines=t.split(/\n+/).map(clean).filter(Boolean),pick=(r,p)=>{const i=lines.findIndex(x=>r.test(x));for(let j=Math.max(0,i);j<Math.min(i+3,lines.length);j++){const m=lines[j].match(p);if(m)return m[1]||m[0]}return null},cs=[...t.matchAll(/\b[A-Z0-9]{8,12}\b/g)].map(x=>reg(x[0])).filter(Boolean),r=pick(/REGN?\s*NO/i,/([A-Z]{2}[0-9]{2}[A-Z]{1,3}[0-9]{4})/i)||cs[0]||null;const d={registration_no:r,registration_candidates:[...new Set(cs)],date_of_regn:date(t.match(/DATE\s+OF\s+REGN\.?[^0-9]*(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})/i)?.[1]),regn_validity:date(t.match(/REGN\.?\s+VALIDITY[^0-9]*(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})/i)?.[1]),chassis_no:chassis(t.match(/CHASSIS\s*NO\.?\s*([A-Z0-9]{17})/i)?.[1]),engine_no:engine(t.match(/ENGINE(?:\/MOTOR)?\s*NO\.?\s*([A-Z0-9]{6,24})/i)?.[1]),owner_name:(t.match(/OWNER\s*NAME\s*[:\-]?\s*([A-Z][A-Z .'-]{1,50}?)(?=\s+(?:SON\/WIFE|S\/D\/W|OWNERSHIP|FUEL|EMISSION)|$)/i)||[])[1]||null,owner_relation:clean((t.match(/(?:D\/O|S\/O|W\/O)\s+[A-Z][A-Z .'-]{2,40}?\s*(?=OWNERSHIP|FUEL|EMISSION|$)/i)||[])[0]||null),ownership_type:/\bINDIVIDUAL\b/i.test(t)?'INDIVIDUAL':null,address:null,fuel:(t.match(/\b(PETROL|DIESEL|CNG|LPG|ELECTRIC|HYBRID)\b/i)||[])[1]||null,emission_norms:(t.match(/BHARAT\s+STAGE\s*[IVX0-9]+/i)||[])[0]||null,vehicle_class:null,maker:(t.match(/\b(HYUNDAI|MARUTI|SUZUKI|TATA|MAHINDRA|HONDA|TOYOTA|RENAULT|FORD|VOLKSWAGEN|SKODA|KIA)\b/i)||[])[1]||null,model:(t.match(/\b(GRAND\s+I10|I10|SWIFT|BALENO|CRETA|VENUE)\b/i)||[])[1]||null,colour:(t.match(/\b(STAR\s+DUST|WHITE|BLACK|RED|BLUE|GREY|SILVER)\b/i)||[])[1]||null,body_type:null,seating:null,unladen_weight:null,cubic_capacity:null,mfg_month_year:null,no_of_cylinders:null,registration_authority:null,card_issue_date:null,confidence:{}};for(const k of Object.keys(d))if(k!=='registration_candidates'&&k!=='confidence')d.confidence[k]=d[k]!=null?'high':'unverified';return d}
async function extract(file,type,onProgress){let text='',ps=[],thumbnail=null,pageMeta=[];if(file.type==='application/pdf'){const x=await pdfData(file,onProgress);ps=x.ps;pageMeta=x.pageMeta||[];text=ps.map(r=>r.map(q=>q.text).join('\n')).join('\n\f\n');thumbnail=await thumb(x.d);if(type==='puc'){const p0=parsePuc(text);if(!p0.test_date||!p0.certificate_number||!p0.cost||!p0.registration_no){for(let i=0;i<x.d.numPages;i++){if((pageMeta[i]?.text_length||0)>30)continue;const o=await ocrPdfPage(x.d,onProgress,false,i+1);const oRows=rowsFromText(o.text);ps[i]=oRows;pageMeta[i]={page:i+1,text_length:o.text.length,ocr_used:true};}text=ps.map(r=>r.map(q=>q.text).join('\n')).join('\n\f\n')}}}else{const o=await ocr(file,onProgress,type==='rc');text=o.text;thumbnail=o.thumbnail;ps=[rowsFromText(text)];pageMeta=[{page:1,text_length:text.length,ocr_used:true}]}const classification=classifyDetailed(text,type,{pageCount:ps.length||1}),detected=classification.type,data=type==='insurance'?parseInsurance(ps,text):type==='puc'?parsePuc(text):parseRC(text);if(type==='insurance'&&data?.diagnostics){data.diagnostics.pages=data.diagnostics.pages.map((p,i)=>({...p,ocr_used:!!pageMeta[i]?.ocr_used}));}return{kind:type,detected_type:detected,classification,data,text,thumbnail,page_meta:pageMeta,diagnostics:data?.diagnostics||null}}
function classifyDetailed(text,slot='',meta={}){
 const t=norm(text),len=t.length;
 const pageCount=Math.max(1,Number(meta.pageCount)||((text.match(/\f/g)||[]).length+1));
 const scores={insurance:0,puc:0,rc:0},matchedSignals=[];
 const add=(type,label,pattern,points)=>{const re=new RegExp(pattern,'i'),m=t.match(re);if(m){scores[type]+=points;matchedSignals.push({type,label,weight:points,match:clean(m[0]).slice(0,120)});return true}return false};
 const policyPattern=/\bPolicy\s*(?:No\.?|Number)\s*[:#.-]?\s*[A-Z0-9][A-Z0-9\/-]{6,30}\b/i.test(t);
 const periodPattern=/Period\s+of\s+Insurance/i.test(t)||(/Valid\s+From/i.test(t)&&/Valid\s+Till/i.test(t));
 const financialPattern=/\bIDV\b|\b(?:Total|Gross)\s+Premium\b|\bIRDAI\b/i.test(t);
 const insuranceHardRule=policyPattern&&periodPattern&&financialPattern;
 const pucTitle=/Pollution\s+Under\s+Control\s+Certificate/i.test(t);
 const emissionTable=/(?:\bCO\b\s*(?:%|PPM)?\s*[:=]?\s*\d[\d.]*)[\s\S]{0,300}(?:\bHC\b\s*(?:PPM)?\s*[:=]?\s*\d[\d.]*)[\s\S]{0,300}(?:\bRPM\b\s*[:=]?\s*\d[\d.]*)/i.test(t)
  ||/(?:\bHC\b\s*(?:PPM)?\s*[:=]?\s*\d[\d.]*)[\s\S]{0,300}(?:\bCO\b\s*(?:%|PPM)?\s*[:=]?\s*\d[\d.]*)[\s\S]{0,300}(?:\bRPM\b\s*[:=]?\s*\d[\d.]*)/i.test(t);
 // Deterministic insurance rule takes priority over any legal PUC wording.
 add('insurance','Policy number','\\bPolicy\\s*(?:No\\.?|Number)\\b',4);
 add('insurance','Period / Valid From+Till','Period\\s+of\\s+Insurance|Valid\\s+From[\\s\\S]{0,100}Valid\\s+Till',4);
 add('insurance','IDV','\\bIDV\\b',2);
 add('insurance','Premium','Total\\s+Premium|Gross\\s+Premium',3);
 add('insurance','Certificate of Insurance / Policy Schedule','Certificate\\s+of\\s+Insurance|Policy\\s+Schedule',4);
 add('insurance','IRDAI / UIN','\\bIRDAI\\b|\\bUIN\\b',2);
 add('insurance','Own Damage / Third Party Liability / NCB','Own\\s+Damage|Third\\s+Party\\s+Liability|\\bNCB\\b',2);
 if(insurer(t)){scores.insurance+=5;matchedSignals.push({type:'insurance',label:'Recognized insurer',weight:5,match:insurer(t)})}
 add('puc','PUC certificate title','Pollution\\s+Under\\s+Control\\s+Certificate',7);
 add('puc','Certificate SL No','Certificate\\s+SL\\.?\\s*No\\.?',4);
 add('puc','Form 59','\\bForm\\s*59\\b',3);
 add('puc','PUC Code','\\bPUC\\s+Code\\b',3);
 add('puc','Validity upto','Validity\\s+upto',3);
 if(emissionTable){scores.puc+=4;matchedSignals.push({type:'puc',label:'Emission readings table',weight:4,match:'CO + HC + RPM readings with numeric values'})}
 add('rc','Registration Certificate / Form 23A','Registration\\s+Certificate|Certificate\\s+of\\s+Registration|Form\\s*23A',5);
 add('rc','Regn No / Registration No','Regn\\.?\\s+No\\.?|Registration\\s+No\\.?',2);
 add('rc','Chassis No','Chassis\\s+No\\.?',2);
 add('rc','Engine/Motor No','Engine(?:/Motor)?\\s+No\\.?',2);
 add('rc','Owner Name','Owner\\s+Name',2);
 add('rc','Date of Regn','Date\\s+of\\s+Regn',2);
 const twoWheeler=/\bTVS\s+JUPITER\b|\bRELIANCE\s+TWO\s+WHEELER\s+POLICY\b|\bMAKE\s*\/\s*MODEL\s*&?\s*VARIANT\b[\s\S]{0,120}\b(?:MOTORCYCLE|SCOOTER|MOPED)\b/i.test(t)&&/POLICY|INSURANCE/i.test(t);
 if(twoWheeler){scores.insurance+=3;matchedSignals.push({type:'insurance',label:'Two-wheeler policy signal',weight:3,match:'Two-wheeler model/class with policy wording'})}
 const slotType=slot==='insurance'?'insurance':slot==='rc'?'rc':slot==='puc'?'puc':'';
 const ordered=Object.entries(scores).sort((a,b)=>b[1]-a[1]),top=ordered[0],second=ordered[1];
 const pucSignals=matchedSignals.filter(x=>x.type==='puc'&&x.label!=='PUC certificate title').length;
 let detected;
 if(insuranceHardRule)detected='insurance';
 else if(pucTitle&&pucSignals>=2&&(pageCount<=2||pucSignals>=3))detected='puc';
 else detected=top[1]>=5&&top[1]-second[1]>=2?top[0]:'other';
 if(twoWheeler&&detected==='insurance')detected='insurance-two-wheeler';
 const confidence=insuranceHardRule?'high':(top[1]>=12&&top[1]-second[1]>=5?'high':top[1]>=7?'medium':'low');
 const slotScore=slotType?scores[slotType]:0;
 const redirect=!!slotType&&detected!=='other'&&detected!=='insurance-two-wheeler'&&detected!==slotType&&slotScore<4&&top[1]-slotScore>=5;
 return{type:detected,scores,matchedSignals,confidence,slot_score:slotScore,redirect,ambiguous:!insuranceHardRule&&(detected==='other'||(top[1]-second[1]<3)),page_count:pageCount,hard_rules:{insurance:insuranceHardRule,puc_title:pucTitle,puc_signals:pucSignals,multi_page:pageCount>2}};
}
function classify(text,slot='',meta={}){return classifyDetailed(text,slot,meta).type}
window.CarmyExtraction={extract,parseRC,parseInsurance:parseInsurance,parsePuc,validate,reg,date,canonicalInsurer:insurer,classifyDocument:classify,classifyDetailed};
})();