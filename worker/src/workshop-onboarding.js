import { error, json } from "./response.js";
export async function createWorkshopOnboarding(request, env, origin) {
 let input; try { input=await request.json(); } catch { return error("Please submit a valid form.",400,origin,"INVALID_JSON"); }
 const str=(v,n=300)=>typeof v==="string"?v.trim().slice(0,n):"";
 const workshop_name=str(input.workshop_name,160), owner_name=str(input.owner_name,120), email=str(input.email,254).toLowerCase(), phone=str(input.phone,20), city=str(input.city,100), state=str(input.state,100);
 const allowed=new Set(["General service","Mechanical repairs","Electrical / diagnostics","Car wash / detailing","Tyres / alignment","Bodywork / paint"]);
 const services=Array.isArray(input.services)?[...new Set(input.services.map(v=>str(v,60)).filter(Boolean))].slice(0,12):[];
 if(workshop_name.length<2||owner_name.length<2||!/^\S+@\S+\.\S+$/.test(email)||phone.replace(/\D/g,"").length<10||phone.replace(/\D/g,"").length>15||!city||!state||!services.length||services.some(s=>!allowed.has(s))||input.consent!==true) return error("Please check the required fields and consent.",400,origin,"VALIDATION_ERROR");
 const staff_count=Number(input.staff_count), service_bays=Number(input.service_bays);
 if(!Number.isInteger(staff_count)||staff_count<1||staff_count>500||!Number.isInteger(service_bays)||service_bays<1||service_bays>100) return error("Staff count or service bays is outside the allowed range.",400,origin,"VALIDATION_ERROR");
 if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY) return error("Onboarding backend is not configured.",503,origin,"BACKEND_NOT_CONFIGURED");
 const row={workshop_name,owner_name,email,phone,city,state,address:str(input.address,300)||null,pincode:/^\d{6}$/.test(str(input.pincode,6))?str(input.pincode,6):null,staff_count,service_bays,services,gstin:/^[0-9A-Za-z]{15}$/.test(str(input.gstin,15))?str(input.gstin,15).toUpperCase():null,job_card_process:["paper","spreadsheet","software","none"].includes(input.job_card_process)?input.job_card_process:"paper",notes:str(input.notes,1500)||null,consent:true,source:"website"};
 const response=await fetch(env.SUPABASE_URL+"/rest/v1/ws_onboarding_applications",{method:"POST",headers:{apikey:env.SUPABASE_SECRET_KEY,Authorization:"Bearer "+env.SUPABASE_SECRET_KEY,"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify(row)});
 const body=await response.json().catch(()=>null);
 if(response.status===409||body?.code==="23505")return error("An application with this email or mobile number already exists. Please contact Torq Desk to update it.",409,origin,"DUPLICATE_APPLICATION");
 if(!response.ok){console.error("Workshop onboarding insert failed",response.status,body?.code||"");return error("We could not save your application right now. Please try again later.",500,origin,"DATABASE_WRITE_FAILED");}
 const saved=Array.isArray(body)?body[0]:body;
 return json({ok:true,data:{id:saved.id,created_at:saved.created_at,status:saved.status}},201,origin);
}