import { getCache, putCache, invalidateCache } from "./cache.js";
import { supabaseRest } from "./supabase.js";

function istToday(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
function addDays(iso,days){const d=new Date(String(iso)+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function clean(v){const s=String(v??"").trim();return s||null}
function eqKey(v){return clean(v)?.toLowerCase().replace(/\s+/g,"")||null}
function err(message,status=400,code="BAD_REQUEST"){const e=new Error(message);e.status=status;e.code=code;return e}
function validIsoDate(v){if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(v||'')))return false;const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v}
function key(v){return clean(v)?.toUpperCase().replace(/[^A-Z0-9]/g,'')||null}

async function ownedCar(env,user,token,carId){
  const rows=await supabaseRest(env,"cars?select=*&id=eq."+encodeURIComponent(carId)+"&user_id=eq."+encodeURIComponent(user.id)+"&limit=1",{method:"GET"},token);
  return rows?.[0]||null;
}
async function validDocument(env,user,token,documentId,carId){
  if(!documentId)return true;
  const rows=await supabaseRest(env,"documents?select=id&id=eq."+encodeURIComponent(documentId)+"&car_id=eq."+encodeURIComponent(carId)+"&user_id=eq."+encodeURIComponent(user.id)+"&limit=1",{method:"GET"},token);
  return !!rows?.[0];
}

function decorateLifecycle(rows){
  const today=istToday();
  const dated=rows.filter(x=>x.issue_date&&x.expiry_date);
  const current=dated.filter(x=>x.issue_date<=today&&today<=x.expiry_date).sort((a,b)=>String(b.issue_date).localeCompare(String(a.issue_date)))[0]||null;
  const ordered=[...dated].sort((a,b)=>String(a.issue_date).localeCompare(String(b.issue_date)));
  const gaps=new Map();
  for(let i=1;i<ordered.length;i++){
    const prev=ordered[i-1],cur=ordered[i],gap=cur.issue_date>addDays(prev.expiry_date,1);
    gaps.set(cur.id,gap?Math.max(0,Math.round((new Date(cur.issue_date)-new Date(addDays(prev.expiry_date,1)))/86400000)+1):0);
  }
  return rows.map(row=>{
    let status="archive";if(row.issue_date&&row.issue_date>today)status="upcoming";if(current?.id===row.id)status="current";
    const gd=gaps.get(row.id)||0;
    return {...row,policy_status:status,coverage_gap:gd>0,coverage_gap_days:gd};
  });
}
export async function listInsuranceHistory(env,user,userToken,carId=null){
  const key=carId?"insurance:"+user.id+":"+carId:"insurance:"+user.id;
  const cached=await getCache(env,key);if(cached)return decorateLifecycle(cached);
  const filters=["user_id=eq."+encodeURIComponent(user.id),"order=issue_date.desc,created_at.desc"];
  if(carId)filters.push("car_id=eq."+encodeURIComponent(carId));
  const data=await supabaseRest(env,"insurance_history?select=*&"+filters.join("&"),{method:"GET"},userToken);
  await putCache(env,key,user.id,"insurance",data);return decorateLifecycle(data);
}

async function recompute(env,user,token,carId){
  const rows=await supabaseRest(env,"insurance_history?select=id,issue_date,expiry_date,policy_status,policy_number,insurance_company&car_id=eq."+encodeURIComponent(carId)+"&user_id=eq."+encodeURIComponent(user.id)+"&order=issue_date.asc.nullslast,created_at.asc",{method:"GET"},token);
  const today=istToday(),dated=rows.filter(x=>x.issue_date&&x.expiry_date);
  const covering=dated.filter(x=>x.issue_date<=today&&x.expiry_date>=today).sort((a,b)=>String(b.issue_date).localeCompare(String(a.issue_date)));
  const current=covering[0]||null;
  const gaps=new Map();
  for(let i=1;i<dated.length;i++){const prev=dated[i-1],cur=dated[i],gap=cur.issue_date>addDays(prev.expiry_date,1);gaps.set(cur.id,gap?Math.max(0,Math.round((new Date(cur.issue_date)-new Date(addDays(prev.expiry_date,1)))/86400000)+1):0)}
  for(const row of rows){
    let status="archive";if(row.issue_date&&row.issue_date>today)status="upcoming";if(current?.id===row.id)status="current";
    const gd=gaps.get(row.id)||0;
    await supabaseRest(env,"insurance_history?id=eq."+encodeURIComponent(row.id)+"&car_id=eq."+encodeURIComponent(carId)+"&user_id=eq."+encodeURIComponent(user.id),{method:"PATCH",body:JSON.stringify({policy_status:status,coverage_gap:gd>0,coverage_gap_days:gd})},token);
  }
  if(current)await supabaseRest(env,"cars?id=eq."+encodeURIComponent(carId)+"&user_id=eq."+encodeURIComponent(user.id),{method:"PATCH",body:JSON.stringify({insurance_company:current.insurance_company||null,insurance_number:current.policy_number||null,insurance_expiry:current.expiry_date||null})},token);
  return current?.id||null;
}

export async function createInsurancePolicy(env,user,userToken,input){
  const carId=clean(input?.car_id),policyNumber=clean(input?.policy_number),from=clean(input?.period_from),to=clean(input?.period_to);
  if(!carId||!policyNumber||!from||!to)throw err("Car, policy number and policy period are required.");
  if(!validIsoDate(from)||!validIsoDate(to))throw err("Enter valid policy dates in YYYY-MM-DD format.");
  if(to<=from)throw err("Policy end date must be later than policy start date.");
  const owned=await ownedCar(env,user,userToken,carId);
  if(!owned)throw err("Vehicle ownership verification failed.",403,"FORBIDDEN");
  const policyReg=clean(input?.policy_reg_no),policyChassis=clean(input?.policy_chassis_no);
  const rcReg=clean(owned.registration_no),rcChassis=clean(owned.vin);
  if(policyReg&&rcReg&&key(policyReg)!==key(rcReg))throw err("This insurance policy registration number does not match the vehicle RC.");
  if(policyChassis&&rcChassis&&key(policyChassis)!==key(rcChassis))throw err("This insurance policy chassis number does not match the vehicle RC.");
  const documentId=clean(input?.source_document_id);if(!(await validDocument(env,user,userToken,documentId,carId)))throw err("Source document ownership verification failed.",403,"FORBIDDEN");
  const existing=await supabaseRest(env,"insurance_history?select=id,policy_number&car_id=eq."+encodeURIComponent(carId)+"&user_id=eq."+encodeURIComponent(user.id)+"&policy_number=not.is.null",{method:"GET"},userToken);
  const duplicate=existing.find(x=>eqKey(x.policy_number)===eqKey(policyNumber));
  if(duplicate){
    const rows=await supabaseRest(env,"insurance_history?select=*&id=eq."+encodeURIComponent(duplicate.id)+"&car_id=eq."+encodeURIComponent(carId)+"&user_id=eq."+encodeURIComponent(user.id)+"&limit=1",{method:"GET"},userToken);
    const saved=rows?.[0]||duplicate,patch={};
    const fill=(k,v)=>{if((saved[k]==null||String(saved[k]).trim()==="")&&v!=null&&String(v).trim()!=="")patch[k]=v};
    fill("insurance_company",clean(input?.insurer_name));fill("source_document_id",documentId);fill("issue_date",from);fill("expiry_date",to);fill("policy_reg_no",clean(input?.policy_reg_no));fill("policy_chassis_no",clean(input?.policy_chassis_no));fill("policy_engine_no",clean(input?.policy_engine_no));fill("insured_name",clean(input?.insured_name));fill("idv_amount",input?.idv_amount??input?.idv);fill("gross_premium_amount",input?.gross_premium_amount??input?.total_premium);fill("premium_amount",input?.gross_premium_amount??input?.total_premium);fill("previous_policy_number",clean(input?.previous_policy_number));fill("previous_insurer",clean(input?.previous_insurer));fill("policy_type",clean(input?.policy_type));fill("extraction_meta",input?.extraction_meta&&typeof input.extraction_meta==="object"?input.extraction_meta:null);
    const incomingClaim=input?.claim_taken===true?true:input?.claim_taken===false?false:null,incomingInvoice=clean(input?.claim_invoice_no);
    if(saved.claim_taken==null&&incomingClaim!==null)patch.claim_taken=incomingClaim;
    if((saved.claim_invoice_no==null||String(saved.claim_invoice_no).trim()==="")&&incomingInvoice)patch.claim_invoice_no=incomingInvoice;
    if(Object.keys(patch).length)await supabaseRest(env,"insurance_history?id=eq."+encodeURIComponent(duplicate.id)+"&car_id=eq."+encodeURIComponent(carId)+"&user_id=eq."+encodeURIComponent(user.id),{method:"PATCH",body:JSON.stringify(patch)},userToken);
    await invalidateCache(env,"insurance:"+user.id+":"+carId);
    return {policy_id:duplicate.id,current_policy_id:await recompute(env,user,userToken,carId),already_saved:true,duplicate:true,filled_fields:Object.keys(patch)};
  }
  const claimTaken=input?.claim_taken===true?true:input?.claim_taken===false?false:null,claimInvoice=clean(input?.claim_invoice_no);
  if(claimTaken===true&&!claimInvoice)throw err("Claim invoice number is required when Claim = Yes.");
  const base={user_id:user.id,car_id:carId,insurance_company:clean(input?.insurer_name),policy_number:policyNumber,insurance_type:[],insurance_addons:[],issue_date:from,expiry_date:to,event_type:"snapshot",source:"browser-extraction",premium_amount:input?.gross_premium_amount??input?.total_premium??null,gross_premium_amount:input?.gross_premium_amount??input?.total_premium??null,policy_reg_no:clean(input?.policy_reg_no),policy_chassis_no:clean(input?.policy_chassis_no),policy_engine_no:clean(input?.policy_engine_no),insured_name:clean(input?.insured_name),idv_amount:input?.idv_amount??input?.idv??null,previous_policy_number:clean(input?.previous_policy_number),previous_insurer:clean(input?.previous_insurer),policy_type:clean(input?.policy_type),policy_status:"archive",coverage_gap:false,coverage_gap_days:0,incomplete:false,source_document_id:documentId||null,extraction_meta:input?.extraction_meta&&typeof input.extraction_meta==="object"?input.extraction_meta:{},claim_taken:claimTaken,claim_invoice_no:claimInvoice};
  const inserted=await supabaseRest(env,"insurance_history",{method:"POST",body:JSON.stringify(base)},userToken),policy=Array.isArray(inserted)?inserted[0]:inserted;
  if(!policy?.id)throw err("Insurance policy could not be saved.",500,"SAVE_FAILED");
  if(base.previous_policy_number&&base.previous_insurer){
    const refs=await supabaseRest(env,"insurance_history?select=id&car_id=eq."+encodeURIComponent(carId)+"&user_id=eq."+encodeURIComponent(user.id)+"&policy_number=eq."+encodeURIComponent(base.previous_policy_number)+"&limit=1",{method:"GET"},userToken);
    if(!refs?.length)await supabaseRest(env,"insurance_history",{method:"POST",body:JSON.stringify({user_id:user.id,car_id:carId,insurance_company:base.previous_insurer,policy_number:base.previous_policy_number,insurance_type:[],insurance_addons:[],issue_date:null,expiry_date:null,event_type:"snapshot",source:"from previous-policy reference",premium_amount:null,gross_premium_amount:null,policy_reg_no:null,policy_chassis_no:null,policy_engine_no:null,insured_name:null,idv_amount:null,previous_policy_number:null,previous_insurer:null,policy_type:null,policy_status:"archive",coverage_gap:false,coverage_gap_days:0,incomplete:true,source_document_id:documentId||null,extraction_meta:{stub:true},claim_taken:null,claim_invoice_no:null})},userToken);
  }
  const currentId=await recompute(env,user,userToken,carId);
  await invalidateCache(env,"insurance:"+user.id+":"+carId);
  return {policy_id:policy.id,current_policy_id:currentId};
}