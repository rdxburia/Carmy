import { error, json } from "./response.js";
const encoder=new TextEncoder();
function b64(bytes){let s="";for(const b of new Uint8Array(bytes))s+=String.fromCharCode(b);return btoa(s);}
async function hashMpin(pin,saltBytes){const key=await crypto.subtle.importKey("raw",encoder.encode(pin),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:saltBytes,iterations:210000,hash:"SHA-256"},key,256);return b64(bits);}
export async function createWorkshopOnboarding(request,env,origin){
 let input;try{input=await request.json();}catch{return error("Please submit a valid form.",400,origin,"INVALID_JSON");}
 const str=(v,n=300)=>typeof v==="string"?v.trim().slice(0,n):"";
 const workshop_name=str(input.workshop_name,160),owner_name=str(input.owner_name,120),email=str(input.email,254).toLowerCase(),phone=str(input.phone,20),city=str(input.city,100),state=str(input.state,100),address=str(input.address,300),pincode=str(input.pincode,6),pin=str(input.owner_mpin,4);
 const allowedServices=new Set(["Multi-brand","EV","Diesel","Petrol","Two-wheeler","Premium cars"]);
 const specializations=Array.isArray(input.specializations)?[...new Set(input.specializations.map(v=>str(v,40)).filter(Boolean))].slice(0,10):[];
 const team=Array.isArray(input.team)?input.team.slice(0,20).map(x=>({name:str(x?.name,120),role:["Senior Mechanic","Mechanic","Service Advisor","Technician","Cashier","Workshop Manager"].includes(x?.role)?x.role:"Mechanic"})).filter(x=>x.name):[];
 const gstin=str(input.gstin,15).toUpperCase(),pan=str(input.pan,10).toUpperCase(),udyam_no=str(input.udyam_no,30).toUpperCase();
 if(workshop_name.length<2||owner_name.length<2||!/^\S+@\S+\.\S+$/.test(email)||phone.replace(/\D/g,"").length<10||phone.replace(/\D/g,"").length>15||!city||!state||address.length<3||!/^[0-9]{6}$/.test(pincode)||!specializations.length||specializations.some(s=>!allowedServices.has(s))||input.consent!==true)return error("Please complete all required account and workshop fields.",400,origin,"VALIDATION_ERROR");
 if(!/^[0-9]{4}$/.test(pin)||pin==="0000")return error("Choose a private 4-digit MPIN other than 0000.",400,origin,"INVALID_MPIN");
 const staff_count=Number(input.staff_count),service_bays=Number(input.service_bays);
 if(!Number.isInteger(staff_count)||staff_count<1||staff_count>500||!Number.isInteger(service_bays)||service_bays<1||service_bays>100)return error("Staff count or service bays is outside the allowed range.",400,origin,"VALIDATION_ERROR");
 if(gstin&&!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin))return error("GSTIN format is invalid. It is not verified against government records.",400,origin,"INVALID_GSTIN");
 if(pan&&!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan))return error("PAN format is invalid.",400,origin,"INVALID_PAN");
 if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)return error("Onboarding backend is not configured.",503,origin,"BACKEND_NOT_CONFIGURED");
 const salt=crypto.getRandomValues(new Uint8Array(16)),owner_mpin_salt=b64(salt),owner_mpin_hash=await hashMpin(pin,salt);
 const row={workshop_name,owner_name,email,phone,city,state,address,pincode,staff_count,service_bays,services:specializations,gstin:gstin||null,pan:pan||null,udyam_no:udyam_no||null,job_card_process:"none",notes:str(input.notes,1500)||null,consent:true,source:"website",whatsapp_updates:input.whatsapp_updates===true,owner_mpin_salt,owner_mpin_hash,operating_hours:input.operating_hours&&typeof input.operating_hours==="object"?{opens:str(input.operating_hours.opens,5),closes:str(input.operating_hours.closes,5)}:{},specializations,team,logo_filename:null,status:"pending_approval"};
 const response=await fetch(env.SUPABASE_URL+"/rest/v1/ws_onboarding_applications",{method:"POST",headers:{apikey:env.SUPABASE_SECRET_KEY,Authorization:"Bearer "+env.SUPABASE_SECRET_KEY,"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify(row)});
 const body=await response.json().catch(()=>null);
 if(response.status===409||body?.code==="23505")return error("An application with this email or mobile number already exists. Please contact Torq Desk to update it.",409,origin,"DUPLICATE_APPLICATION");
 if(!response.ok){console.error("Workshop onboarding insert failed",response.status,body?.code||"");return error("We could not save your application right now. Please try again later.",500,origin,"DATABASE_WRITE_FAILED");}
 const saved=Array.isArray(body)?body[0]:body;
 return json({ok:true,data:{id:saved.id,created_at:saved.created_at,status:saved.status||"pending_approval"}},201,origin);
}