import { getCache, putCache } from "./cache.js";
import { supabaseRest } from "./supabase.js";

export async function listVehicles(env,user,userToken){
  const key="vehicles:"+user.id;const cached=await getCache(env,key);if(cached)return cached;
  const data=await supabaseRest(env,"cars?select=*&user_id=eq."+encodeURIComponent(user.id)+"&order=created_at.asc",{method:"GET"},userToken);
  await putCache(env,key,user.id,"vehicles",data);return data;
}
export async function getVehicle(env,user,userToken,vehicleId){
  const key="vehicle:"+user.id+":"+vehicleId;const cached=await getCache(env,key);if(cached)return cached;
  const data=await supabaseRest(env,"cars?select=*&id=eq."+encodeURIComponent(vehicleId)+"&user_id=eq."+encodeURIComponent(user.id)+"&limit=1",{method:"GET"},userToken);
  const vehicle=data?.[0]||null;if(vehicle)await putCache(env,key,user.id,"vehicle",vehicle);return vehicle;
}
export async function patchVehicleRc(env,user,userToken,vehicleId,input){
  const fields=["registration_no","owner_name","vin","engine_no","fuel","make_model","rc_regn_date","rc_validity","rc_owner_relation","rc_ownership_type","rc_address","rc_emission_norms","rc_vehicle_class","rc_maker","rc_model","rc_colour","rc_body_type","rc_seating","rc_unladen_weight","rc_cubic_capacity","rc_mfg_month_year","rc_cylinders","rc_registration_authority","rc_card_issue_date","rc_extraction_meta"];
  const patch={};for(const k of fields)if(Object.prototype.hasOwnProperty.call(input||{},k))patch[k]=input[k];
  if(!Object.keys(patch).length)throw Object.assign(new Error("No RC fields supplied."),{status:400,code:"BAD_REQUEST"});
  const rows=await supabaseRest(env,"cars?id=eq."+encodeURIComponent(vehicleId)+"&user_id=eq."+encodeURIComponent(user.id),{method:"PATCH",body:JSON.stringify(patch)},userToken);
  const car=Array.isArray(rows)?rows[0]||null:null;if(!car)throw Object.assign(new Error("Vehicle not found."),{status:404,code:"NOT_FOUND"});
  return car;
}