
const U=APP_CONFIG.SUPABASE_URL,K=APP_CONFIG.SUPABASE_KEY;
let db=null;
function initSupabase(){const sb=window.supabase;if(sb&&typeof sb.createClient==='function'){db=sb.createClient(U,K);return true}return false}
function sdkError(){document.body.insertAdjacentHTML('afterbegin','<div style="position:fixed;inset:0;background:#fff;z-index:99999;display:grid;place-items:center;padding:24px;font-family:system-ui"><div style="max-width:600px"><h2>CarCare Cloud</h2><p>Supabase connection library load nahi hui. Browser extension/ad-blocker ya network CDN ko block kar raha ho sakta hai.</p><button onclick="location.reload()" style="background:#2563eb;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-weight:700">Refresh</button></div></div>')}
function waitForSupabase(n=0){if(initSupabase()){boot();return}if(n<40){setTimeout(()=>waitForSupabase(n+1),250);return}sdkError()}
let user=null,cars=[],car=null,records=[],docs=[],signup=false,startedUserId=null;
const serviceItems={
'Regular Service':['Engine Oil','Oil Filter','Air Filter','AC / Cabin Filter','Brake Oil / Brake Fluid','Coolant','Spark Plugs','Brake Pads','Front Brake Disc','Rear Drum Brake / Brake Shoes','Wheel Alignment','Wheel Balancing','Drive Belt','Battery Check','AC Service / AC Gas','Suspension Check','Steering Check','General Inspection'],
'Engine Service':['Engine Oil','Oil Filter','Air Filter','Spark Plugs','Drive Belt','Timing Belt / Timing Chain','Clutch Work','Flywheel / Pressure Plate','Engine Mount','Valve / Head Work','Engine Overhaul','Turbocharger Work','Injector / Fuel System','Coolant System','Other Engine Work'],
'Brake Work':['Brake Pads','Front Brake Disc','Rear Drum Brake / Brake Shoes','Brake Caliper','Brake Cylinder','Brake Fluid / Brake Bleeding','Brake Hose','Hand Brake / Parking Brake','ABS / Brake Sensor','Brake Inspection','Other Brake Work'],
'Tyre Work':['Front Tyre','Rear Tyre','All Tyres Changed','Spare Tyre','Wheel Alignment','Wheel Balancing','Tyre Rotation','Puncture Repair','Tyre Valve','Wheel / Rim Work','Tyre Pressure Check','Other Tyre Work'],
'Battery':['Battery Replacement','Battery Check','Battery Charging','Battery Terminal / Cable','Alternator Check','Starter Motor Check','Battery Warranty','Other Battery Work'],
'Accident / Repair':['Body Repair','Bumper Repair / Replacement','Bonnet / Fender / Door Repair','Headlight / Taillight','Windshield / Glass','Paint Work','Dent Removal','AC / Cooling Damage','Suspension Damage','Steering Damage','Electrical Repair','Insurance Claim Repair','Towing / Recovery','Other Accident Repair'],
'Other':['Inspection / Diagnosis','Electrical Work','AC / Cooling Work','Suspension Work','Steering Work','Exhaust Work','General Repair','Other']
};
function renderServiceItems(){
 const type=$('type').value;
 const list=serviceItems[type]||[];
 $('serviceItemsTitle').textContent=type+' Items';
 $('items').innerHTML=list.length?list.map(x=>'<label class="item"><input type="checkbox" value="'+esc(x)+'"> '+esc(x)+'</label>').join(''):'<div class="muted">No predefined items for this type.</div>';
 $('serviceItemsBlock').style.display=list.length?'block':'none';
}
const $=id=>document.getElementById(id),esc=x=>String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])),money=x=>'₹'+Number(x||0).toLocaleString('en-IN');
let toastTimer=null;
function toast(x,type='success'){
 const el=$('toast'); if(!el)return;
 el.className='toast '+(type==='error'?'toast-error':'toast-success');
 el.innerHTML='<span class="toast-icon">'+(type==='error'?'✕':'✓')+'</span><span>'+esc(x)+'</span>';
 el.style.display='flex';
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.style.display='none'},3200);
}
function showOperationOverlay(title='Saving',subtitle='Please wait…'){
 let o=document.getElementById('operationOverlay');if(o)o.remove();
 o=document.createElement('div');o.id='operationOverlay';
 o.innerHTML='<div class="operation-card"><div class="operation-spinner"></div><div class="operation-title">'+esc(title)+'</div><div class="operation-sub">'+esc(subtitle)+'</div></div>';
 document.body.appendChild(o);return o;
}
function hideOperationOverlay(){let o=document.getElementById('operationOverlay');if(o)o.remove()}
function showAppLoading(){
 let o=document.getElementById('appLoadingOverlay');if(o)o.remove();
 o=document.createElement('div');o.id='appLoadingOverlay';
 o.innerHTML='<div class="app-loading-panel"><div class="app-loading-brand">CAR<span>CARE</span> CLOUD</div><div class="app-loading-visual"><div class="app-loading-glow"></div><svg class="loading-car-svg" viewBox="0 0 260 100" aria-hidden="true"><path class="car-body" d="M35 63h190c5 0 9 4 9 9v6H26v-7c0-5 4-8 9-8Z"/><path class="car-roof" d="M72 63 94 34c3-4 8-6 13-6h51c6 0 11 3 15 8l20 27Z"/><path class="car-window" d="M103 35 88 57h35V35Zm43 0v22h33l-16-22Z"/><circle class="car-wheel" cx="76" cy="78" r="13"/><circle class="car-wheel" cx="190" cy="78" r="13"/><circle class="car-hub" cx="76" cy="78" r="5"/><circle class="car-hub" cx="190" cy="78" r="5"/></svg><div class="road-line"></div></div><div class="app-loading-title" id="appLoadingTitle">Fetching your vehicle garage...</div><div class="app-loading-sub" id="appLoadingSub">Verifying secure session and loading your vehicles</div><div class="app-loading-dots"><span></span><span></span><span></span></div></div>';
 document.body.appendChild(o);return o;
}
function setAppLoadingStatus(title,sub){if($('appLoadingTitle'))$('appLoadingTitle').textContent=title;if($('appLoadingSub'))$('appLoadingSub').textContent=sub}
function hideAppLoading(){let o=document.getElementById('appLoadingOverlay');if(o){o.classList.add('loading-out');setTimeout(()=>o.remove(),380)}}
function dateOnlyEnd(x){if(!x)return null;let p=String(x).split('-').map(Number);if(p.length!==3||p.some(Number.isNaN))return null;return new Date(p[0],p[1]-1,p[2],23,59,59,999)}
function st(x){if(!x)return['MISSING','bad'];let d=dateOnlyEnd(x);if(!d)return['MISSING','bad'];let days=(d-Date.now())/86400000;return days<0?['EXPIRED','bad']:days<=30?['EXPIRING SOON','warn']:['VALID','ok']}
async function nav(v){if(v==='add'&&!(await ensureRequiredCarDetails()))return;document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));$(v).classList.add('active');document.querySelectorAll('aside button,.mobile-nav button').forEach(x=>x.classList.toggle('active',x.dataset.view===v));if(v==='dashboard')dash();if(v==='cars')carsView();if(v==='history')history();if(v==='docs')docsView();if(v==='report')report()}
document.querySelectorAll('aside button,.mobile-nav button').forEach(x=>x.onclick=()=>nav(x.dataset.view));
$('toggleAuth').onclick=()=>{signup=!signup;$('authTitle').textContent=signup?'Create account':'Private Car Manager';$('authBtn').textContent=signup?'Create account':'Login';$('toggleAuth').textContent=signup?'Back to login':'Create account'};
$('authBtn').onclick=async ev=>{ev.preventDefault();if(!db)return toast('Connecting to secure login...');let e=$('email').value.trim(),p=$('password').value;if(!e||!p)return toast('Enter email and password');let r=signup?await db.auth.signUp({email:e,password:p}):await db.auth.signInWithPassword({email:e,password:p});if(r.error)return toast(r.error.message);if(signup)toast('Account created. Check email if confirmation is enabled.')};
$('logout').onclick=()=>db.auth.signOut();
async function boot(){let s=await db.auth.getSession();if(s.data.session)start(s.data.session.user);else showLogin();db.auth.onAuthStateChange((_e,s)=>{if(s)start(s.user);else{startedUserId=null;showLogin()}})}
function showLogin(){let o=$('policeLogoutOverlay');if(o){if(o._timer)clearTimeout(o._timer);o.remove()}let ps=$('policeLogoutStyle');if(ps)ps.remove();$('auth').classList.remove('hidden');$('app').classList.add('hidden');let fab=document.getElementById('dashboardFab');if(fab)fab.remove();let mn=document.getElementById('mobileNav');if(mn)mn.classList.add('auth-hidden');const joke=localStorage.getItem('carcare_logout_joke');if(joke){localStorage.removeItem('carcare_logout_joke');setTimeout(()=>toast(joke),150)}}
function updateCarTab(){let el=$('mobileCarReg');if(el)el.textContent=car?.registration_no||'No Car'}
async function start(u){
 if(startedUserId===u.id)return;
 startedUserId=u.id;user=u;
 $('auth').classList.add('hidden');
 $('app').classList.add('hidden');
 $('userEmail').textContent=u.email;
 showAppLoading();
 try{
   setAppLoadingStatus('Fetching your vehicle garage...','Loading vehicle profiles from your secure cloud');
   await loadCars();
   if(!car||!cars.some(x=>x.id===car.id))car=cars[0];
   updateCarTab();
   setAppLoadingStatus('Securing your vehicle files...','Loading service history and private documents');
   await loadData();
   setAppLoadingStatus('Checking vehicle compliance...','Calculating Insurance & PUC status');
   if(car){dash();guard()}else{dash()}
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   $('app').classList.remove('hidden');
   $('app').classList.add('app-ready');
   let mn=document.getElementById('mobileNav');if(mn)mn.classList.remove('auth-hidden');
   hideAppLoading();
   ensureSecurityPassword();
 }catch(e){
   hideAppLoading();
   $('app').classList.add('hidden');
   $('auth').classList.remove('hidden');
   toast('Dashboard load failed: '+(e?.message||e),'error');
   startedUserId=null;
 }
}
async function loadCars(){
 let r=await db.from('cars').select('*').order('registration_no');
 if(r.error)throw new Error('Vehicle profiles could not be loaded: '+r.error.message);
 cars=r.data||[];
}
async function loadData(){
 if(!car){records=[];docs=[];dash();history();report();guard();return}
 let r=await db.from('records').select('*,record_items(*)').eq('car_id',car.id).order('service_date',{ascending:false});
 if(r.error)throw new Error('Service history could not be loaded: '+r.error.message);
 records=r.data||[];
 let d=await db.from('documents').select('*').eq('car_id',car.id).order('created_at',{ascending:false});
 if(d.error)throw new Error('Vehicle documents could not be loaded: '+d.error.message);
 docs=d.data||[];
 dash();history();await docsView();report();guard()
}
const insuranceTypes=['Third Party','Comprehensive','Zero Depreciation','Own Damage','Standalone Own Damage'];
const insuranceAddons=['Roadside Assistance','Engine Protection','Consumables Cover','Key Replacement','Tyre Protect','Return to Invoice','NCB Protect'];
function insuranceChoiceGroup(id,items,selected=[]){
 return '<div class="choice-grid" id="'+id+'">'+items.map(x=>'<label class="choice-card"><input type="checkbox" value="'+esc(x)+'" '+(selected.includes(x)?'checked':'')+'><span class="choice-check">✓</span><span>'+esc(x)+'</span></label>').join('')+'</div>';
}
function selectedChoices(id){
 return [...document.querySelectorAll('#'+id+' input[type="checkbox"]:checked')].map(x=>x.value);
}
const insuranceCompanies=['Not Available','Acko General Insurance','Bajaj General Insurance','Cholamandalam MS General Insurance','Generali Central Insurance','Go Digit General Insurance','HDFC ERGO General Insurance','ICICI Lombard General Insurance','IFFCO Tokio General Insurance','Zurich Kotak General Insurance','Kshema General Insurance','Liberty General Insurance','Magma General Insurance','National Insurance Company','Navi General Insurance','Raheja QBE General Insurance','Reliance General Insurance','Royal Sundaram General Insurance','SBI General Insurance','Shriram General Insurance','Tata AIG General Insurance','The New India Assurance','The Oriental Insurance','United India Insurance','Universal Sompo General Insurance','Zuno General Insurance'];
const pucStates=['AP','AR','AS','BR','CG','GA','GJ','HR','HP','JH','KA','KL','MP','MH','MN','ML','MZ','NL','OD','PB','RJ','SK','TN','TS','TR','UP','UK','WB','AN','CH','DN','DL','JK','LA','LD','PY'];
const logoutJokes=['Insurance nahi? Car boli: mujhe risk management bhi chahiye 😄','PUC nahi? Car ka suggestion: pehle pollution check, phir full speed! 😂','Documents incomplete hain—car ne bola, “Bhai paperwork bhi maintenance hai!” 😄','Insurance/PUC missing: dashboard ne aaj driving se zyada paperwork choose kiya 😅'];
const insuranceJokes=['Insurance missing hai — car boli: pehle mujhe insured karo, phir road trip! 😄','Insurance available nahi hai. Car ka kehna hai: risk lo mat, insurance karao! 🚗🛡️','Car ready hai, bas insurance protection missing hai. Pehle insurance karao! 😅'];
const pucJokes=['PUC nahi hai — car boli: pehle pollution check, phir full speed! 😂','PUC pending hai. Car ka message: mujhe clean-air certificate dilwao! 😄','PUC ke bina ride nahi — pehle PUC karao, phir safar enjoy karo! 🚗💨'];
function randomJoke(){return logoutJokes[Math.floor(Math.random()*logoutJokes.length)]}
function randomInsuranceJoke(){return insuranceJokes[Math.floor(Math.random()*insuranceJokes.length)]}
function randomPucJoke(){return pucJokes[Math.floor(Math.random()*pucJokes.length)]}
function policeLogoutAnimation(type){
  let old=document.getElementById('policeLogoutOverlay');if(old)old.remove();
  let title=type==='both'?'INSURANCE + PUC MISSING':type==='insurance'?'INSURANCE NOT AVAILABLE':'PUC NOT AVAILABLE';
  let amount=type==='both'?'₹7,000':type==='insurance'?'₹2,000':'₹5,000';
  let joke=type==='both'?'Bhai, Insurance + PUC dono missing? HP police style mein ₹7,000 ka compounding amount! 😂🚔':type==='insurance'?'Insurance nahi? HP first-offence compounding ₹2,000 — police boli, pehle insurance karao! 😂🚔':'PUC nahi? HP first-offence compounding ₹5,000 — police boli, pehle PUC karao! 😂🚔';
  let o=document.createElement('div');o.id='policeLogoutOverlay';o.innerHTML='<div class="police-light blue"></div><div class="police-light red"></div><div class="police-box"><div class="police-badge">🚨</div><div class="police-title">'+title+'</div><div class="police-sub">VEHICLE ACCESS STOPPED</div><div class="police-fine">'+amount+'</div><div class="police-joke">'+esc(joke)+'</div><div class="police-note">Valid Insurance & PUC required to continue</div><button class="police-try" id="policeTryAgain">TRY AGAIN / GO TO LOGIN</button></div>';
  o.style='position:fixed;inset:0;z-index:999999;background:#050914;color:#fff;display:grid;place-items:center;overflow:hidden;font-family:inherit';
  let s=document.createElement('style');s.id='policeLogoutStyle';s.textContent='#policeLogoutOverlay:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 30% 50%,rgba(30,110,255,.32),transparent 35%),radial-gradient(circle at 70% 50%,rgba(255,30,50,.32),transparent 35%);animation:policePulse .55s infinite alternate}#policeLogoutOverlay .police-light{position:absolute;top:0;width:50%;height:12px;filter:blur(5px);animation:policeFlash .55s infinite alternate}.police-light.blue{left:0;background:#168cff;box-shadow:0 0 45px 18px #168cff}.police-light.red{right:0;background:#ff2038;box-shadow:0 0 45px 18px #ff2038;animation-delay:.275s}.police-box{position:relative;text-align:center;width:min(560px,90vw);padding:42px 24px;border:1px solid rgba(255,255,255,.18);border-radius:24px;background:rgba(7,13,27,.92);box-shadow:0 30px 100px rgba(0,0,0,.65);animation:policeIn .45s ease-out}.police-badge{font-size:58px;animation:policeShake .45s infinite alternate}.police-title{font-size:clamp(26px,6vw,48px);font-weight:950;letter-spacing:1px;margin-top:10px}.police-sub{font-size:14px;font-weight:800;letter-spacing:3px;color:#ff4054;margin-top:8px}.police-fine{display:inline-block;margin-top:18px;padding:10px 16px;border:1px solid rgba(255,255,255,.25);border-radius:12px;background:rgba(255,40,55,.12);font-size:20px;font-weight:900;letter-spacing:.5px}.police-joke{font-size:18px;font-weight:750;margin:22px auto 12px;max-width:500px}.police-note{font-size:13px;color:#aeb9cf}.police-try{margin-top:24px;border:0;border-radius:12px;padding:13px 22px;background:#fff;color:#111827;font-weight:900;cursor:pointer;box-shadow:0 8px 25px rgba(0,0,0,.25)}.police-try:hover{transform:translateY(-1px)}@keyframes policeFlash{from{opacity:.3}to{opacity:1}}@keyframes policePulse{from{opacity:.45}to{opacity:1}}@keyframes policeShake{from{transform:rotate(-4deg)}to{transform:rotate(4deg)}}@keyframes policeIn{from{transform:scale(.8);opacity:0}to{transform:scale(1);opacity:1}}';
  document.head.appendChild(s);document.body.appendChild(o);
  const goLogin=async()=>{if(o._timer)clearTimeout(o._timer);o.remove();s.remove();try{await db.auth.signOut()}finally{showLogin()}};
  $('policeTryAgain').onclick=goLogin;
  o._timer=setTimeout(goLogin,5000);
}
async function forceLogoutWithJoke(msg){localStorage.setItem('carcare_logout_joke',msg);await db.auth.signOut()}
function showCarForm(){
 $('carForm').classList.remove('hidden');
 $('carForm').innerHTML='<div class="toolbar"><div><h3>Add Car</h3><p class="muted">Save complete vehicle, insurance and PUC details.</p></div><button class="ghost" onclick="hideCarForm()">Cancel</button></div><div class="form">'+
 '<div class="field"><label>Registration Number *</label><input id="cfReg"></div>'+
 '<div class="field"><label>Make / Model *</label><input id="cfModel" placeholder="Hyundai Grand i10"></div>'+
 '<div class="field"><label>Model Year *</label><input id="cfYear" type="number" placeholder="2018"></div>'+
 '<div class="field"><label>Fuel Type *</label><select id="cfFuel"><option value="">Select</option><option>Petrol</option><option>Diesel</option><option>CNG</option><option>Hybrid</option><option>Electric</option></select></div>'+
 '<div class="field"><label>VIN / Chassis No. (Optional)</label><input id="cfVin"></div>'+
 '<div class="field"><label>Engine No. (Optional)</label><input id="cfEngine"></div>'+
 '<div class="field full"><label>Insurance Type * <span class="muted">(minimum 2)</span></label><div class="choice-grid" id="cfInsType">'+insuranceTypes.map(x=>'<label class="choice-card"><input type="checkbox" value="'+esc(x)+'"><span class="choice-check">✓</span><span>'+esc(x)+'</span></label>').join('')+'</div><small class="muted">Select any 2 or more insurance types by clicking the cards.</small><small class="muted">Select at least 2 options.</small></div>'+
 '<div class="field full"><label>Insurance Add-ons (Optional)</label><div class="choice-grid" id="cfInsAddons">'+insuranceAddons.map(x=>'<label class="choice-card"><input type="checkbox" value="'+esc(x)+'"><span class="choice-check">✓</span><span>'+esc(x)+'</span></label>').join('')+'</div><small class="muted">Optional — select any add-ons that apply.</small></div>'+
 '<div class="field"><label>Insurance Company *</label><select id="cfIns">'+insuranceCompanies.map(x=>'<option>'+esc(x)+'</option>').join('')+'</select></div>'+
 '<div class="field"><label>Insurance Policy Number *</label><input id="cfInsNo" placeholder="Policy number"></div>'+
 '<div class="field"><label>Insurance Expiry *</label><input id="cfInsExp" type="date"></div>'+
 '<div class="field"><label>PUC *</label><select id="cfPuc"><option value="">Select</option><option value="yes">Yes</option><option value="no">No</option></select></div>'+
 '<div class="field" id="cfPucNoWrap" style="display:none"><label>PUC Number *</label><input id="cfPucNo" placeholder="PUC certificate number"></div>'+
 '<div class="field" id="cfPucStateWrap" style="display:none"><label>PUC State *</label><select id="cfPucState"><option value="">Select State</option>'+pucStates.map(x=>'<option>'+x+'</option>').join('')+'</select></div>'+
 '<div class="field" id="cfPucValidityWrap" style="display:none"><label>PUC Validity *</label><select id="cfPucValidity"><option value="">Select</option><option value="6">6 Months</option><option value="12">12 Months</option></select></div>'+
 '<div class="field" id="cfPucExpWrap" style="display:none"><label>PUC Expiry *</label><input id="cfPucExp" type="date"></div>'+
 '<div class="field"><label>Current KM</label><input id="cfKm" type="number" value="0"></div>'+
 '<div class="full"><button class="primary" onclick="saveCarForm()">SAVE CAR</button></div></div>';
 $('cfPuc').onchange=()=>{let yes=$('cfPuc').value==='yes';['cfPucNoWrap','cfPucStateWrap','cfPucValidityWrap','cfPucExpWrap'].forEach(id=>$(id).style.display=yes?'block':'none')};
}
function hideCarForm(){$('carForm').classList.add('hidden');$('carForm').innerHTML=''}
$('newCar').onclick=showCarForm;
async function saveCarForm(){
 let reg=$('cfReg').value.trim().toUpperCase(),model=$('cfModel').value.trim(),year=$('cfYear').value.trim(),fuel=$('cfFuel').value,ins=$('cfIns').value,insNo=$('cfInsNo').value.trim(),insExp=$('cfInsExp').value,puc=$('cfPuc').value,pucNo=puc==='yes'?$('cfPucNo').value.trim():'',pucState=puc==='yes'?$('cfPucState').value:'',pucValidity=puc==='yes'?$('cfPucValidity').value:'',pucExp=puc==='yes'?$('cfPucExp').value:'';
 let insTypes=selectedChoices('cfInsType'),insAddons=selectedChoices('cfInsAddons');
 if(!reg||!model||!year||!fuel||ins==='Not Available'||!insNo||!insExp||insTypes.length<2||puc!=='yes'||!pucNo||!pucState||!pucValidity||!pucExp)return toast('Complete all required fields. Insurance Type needs minimum 2 selections.');
 let r=await db.from('cars').insert({user_id:user.id,registration_no:reg,make_model:model,model_year:+year,fuel,current_km:+($('cfKm').value||0),vin:$('cfVin').value.trim()||null,engine_no:$('cfEngine').value.trim()||null,insurance_company:ins,insurance_number:insNo,insurance_type:insTypes,insurance_addons:insAddons,insurance_expiry:insExp,puc_certificate_no:pucNo,puc_state:pucState,puc_validity_months:+pucValidity,puc_expiry:pucExp}).select().single();
 if(r.error)return toast('Failed to save Vehicle: '+r.error.message,'error');cars.push(r.data);car=r.data;updateCarTab();hideCarForm();toast('Vehicle '+reg+' added successfully!');await loadData();nav('dashboard');
}
window.openCar=async id=>{car=cars.find(x=>x.id===id);updateCarTab();await loadData();nav('dashboard')};
function vehicleBodyType(model=''){
 let m=model.toLowerCase();
 if(/suv|bolero|scorpio|thar|creta|venue|nexon|xuv|fortuner|harrier|seltos|brezza|sonet|ecosport|duster|jimny/.test(m))return 'SUV';
 if(/sedan|city|verna|virtus|slavia|ciaz|dzire|aura|aspire|rapid|octavia|superb|camry|altis/.test(m))return 'SEDAN';
 if(/ev|electric|nexon ev|tiago ev|comet|ioniq|seal|e6/.test(m))return 'EV';
 return 'HATCHBACK';
}
function vehicleAvatar(type,fuel){
 const icon=type==='SUV'?'🚙':type==='SEDAN'?'🚘':type==='EV'?'⚡':'🚗';
 return '<div class="garage-avatar '+type.toLowerCase()+'"><div class="avatar-glow"></div><div class="avatar-car">'+icon+'</div><span>'+esc(type)+' • '+esc(fuel||'—')+'</span></div>';
}
function dashboardHealth(){
 const ins=st(car.insurance_expiry),puc=st(car.puc_expiry);
 const hasRecords=records.length>0;
 const last=records[0];
 let serviceDue=false;
 if(last?.service_date){
   const days=(Date.now()-new Date(last.service_date+'T23:59:59'))/86400000;
   serviceDue=days>=150;
 }
 if(ins[0]==='EXPIRED'||puc[0]==='EXPIRED'||ins[0]==='MISSING'||puc[0]==='MISSING')return ['ACTION REQUIRED','danger','Insurance / PUC needs attention'];
 if(serviceDue)return ['SERVICE DUE SOON','warn','Your maintenance history suggests a service check'];
 if(!hasRecords)return ['ALL SYSTEMS GREEN','ok','Vehicle compliance is currently valid'];
 return ['ALL SYSTEMS GREEN','ok','Insurance, PUC and service history look healthy'];
}
function maintenanceCostPerKm(){
 const km=Number(car.current_km||0),cost=records.reduce((s,r)=>s+Number(r.total_cost||0),0);
 return km>0?cost/km:null;
}
function yearlySpendData(){
 const y=new Date().getFullYear(), rows=records.filter(r=>new Date(r.service_date).getFullYear()===y);
 let regular=0,major=0,other=0;
 rows.forEach(r=>{
   const c=Number(r.total_cost||0);
   if(r.record_type==='Regular Service')regular+=c;
   else if(['Engine Service','Brake Work','Tyre Work','Accident / Repair','Battery'].includes(r.record_type))major+=c;
   else other+=c;
 });
 return {year:y,regular,major,other,total:regular+major+other};
}
function dashTimeline(){
 if(!records.length)return '<div class="timeline-empty">No service events yet. Your future maintenance timeline will appear here.</div>';
 return '<div class="maintenance-timeline">'+records.slice(0,12).map((r,i)=>{
   const type=r.record_type||'Other';
   const cls=type==='Regular Service'?'regular':(['Tyre Work','Brake Work'].includes(type)?'brake':type==='Accident / Repair'?'accident':'other');
   const items=(r.record_items||[]).map(x=>x.item_name).join(', ');
   const cost=money(r.total_cost);
   return '<button class="timeline-event '+cls+'" onclick="toggleTimelineEvent(\''+r.id+'\')"><span class="timeline-node"></span><span class="timeline-date">'+esc(r.service_date)+'</span><span class="timeline-main"><b>'+esc(type)+'</b><small>'+esc(items||r.description||'Maintenance record')+'</small></span><span class="timeline-cost">'+cost+'</span><span class="timeline-chevron">⌄</span><span class="timeline-detail" id="timeline-'+r.id+'"><b>Workshop:</b> '+esc(r.workshop||'Not recorded')+'<br><b>KM:</b> '+esc(r.odometer_km||0)+'<br><b>Parts:</b> '+money(r.parts_cost)+' • <b>Labour:</b> '+money(r.labour_cost)+' • <b>Other:</b> '+money(r.other_cost)+'<br><b>Invoice:</b> '+esc(r.invoice_no||'Not attached')+(r.notes?'<br><b>Notes:</b> '+esc(r.notes):'')+'</span></button>';
 }).join('')+'</div>';
}
function toggleTimelineEvent(id){const e=document.getElementById('timeline-'+id);if(e)e.classList.toggle('open')}
function dash(){
 if(!car){$('dash').innerHTML='<div class="card">Add your first car.</div>';return}
 const body=vehicleBodyType(car.make_model), health=dashboardHealth(), cost=records.reduce((s,r)=>s+Number(r.total_cost||0),0),last=records[0],ins=st(car.insurance_expiry),puc=st(car.puc_expiry),cpk=maintenanceCostPerKm(),spend=yearlySpendData(),max=Math.max(spend.total,1);
 $('dashTitle').textContent=car.registration_no;
 $('dashSub').textContent=[car.make_model,car.model_year,car.fuel].filter(Boolean).join(' • ');
 const docsActive=docs.filter(d=>!d.archived_at).filter(d=>['rc','insurance','puc'].includes(d.document_type)).slice(0,6);
 $('dash').innerHTML=
 '<section class="garage-hero"><div class="garage-hero-info"><div class="eyebrow">YOUR VEHICLE GARAGE</div><h2>'+esc(car.registration_no)+'</h2><p>'+esc(car.make_model||'Vehicle')+' • '+esc(car.model_year||'—')+' • '+esc(car.fuel||'—')+'</p><div class="health-badge '+health[1]+'"><i></i>'+health[0]+'</div><small>'+esc(health[2])+'</small></div>'+
 vehicleAvatar(body,car.fuel)+
 '<div class="digital-cluster"><span>CURRENT ODOMETER</span><strong>'+esc(Number(car.current_km||0).toLocaleString('en-IN'))+'</strong><em>KM</em></div></section>'+
 '<div class="dashboard-grid dashboard-stats"><div class="glass-stat"><span>LIFETIME COST</span><b>'+money(cost)+'</b><small>All recorded maintenance</small></div><div class="glass-stat"><span>INSURANCE</span><b class="'+ins[1]+'">'+ins[0]+'</b><small>'+esc(car.insurance_expiry||'Missing')+'</small></div><div class="glass-stat"><span>PUC</span><b class="'+puc[1]+'">'+puc[0]+'</b><small>'+esc(car.puc_expiry||'Missing')+'</small></div></div>'+
 '<div class="dashboard-grid dashboard-analytics"><div class="glass-panel"><div class="panel-heading"><div><span class="panel-kicker">MAINTENANCE EFFICIENCY</span><h3>Cost per KM</h3></div><span class="gauge-value">'+(cpk!==null?'₹'+cpk.toFixed(2):'—')+'<small>/ KM</small></span></div><div class="radial-gauge" style="--gauge:'+Math.min((cpk||0)/10*100,100)+'%"><div><b>'+(cpk!==null?Math.round(Math.max(0,100-Math.min(cpk/10*100,100))):'—')+'</b><span>efficiency</span></div></div><p class="muted">Based on recorded maintenance cost and current odometer.</p></div>'+
 '<div class="glass-panel"><div class="panel-heading"><div><span class="panel-kicker">YEAR '+spend.year+'</span><h3>Spend Breakdown</h3></div><b>'+money(spend.total)+'</b></div><div class="spend-bars"><div><span>Regular Service</span><b>'+money(spend.regular)+'</b><i style="width:'+(spend.regular/max*100)+'%"></i></div><div><span>Major Repairs</span><b>'+money(spend.major)+'</b><i style="width:'+(spend.major/max*100)+'%"></i></div><div><span>Other</span><b>'+money(spend.other)+'</b><i style="width:'+(spend.other/max*100)+'%"></i></div></div><small class="muted">Insurance premium is not included because no premium amount is currently stored.</small></div></div>'+
 '<div class="glass-panel timeline-panel"><div class="panel-heading"><div><span class="panel-kicker">SERVICE HISTORY</span><h3>Maintenance Timeline</h3></div><button class="ghost" onclick="nav(\'history\')">View all</button></div>'+dashTimeline()+'</div>'+
 '<div class="glass-panel glovebox-panel"><div class="panel-heading"><div><span class="panel-kicker">DIGITAL GLOVEBOX</span><h3>Vehicle Documents</h3></div><button class="ghost" onclick="nav(\'docs\')">Open Documents</button></div><div class="dashboard-doc-grid">'+(docsActive.length?docsActive.map(renderDashDocCard).join(''):'<div class="timeline-empty">No active RC / Insurance / PUC documents.</div>')+'</div></div>'+
 '<div class="dashboard-bottom-grid"><div class="glass-panel"><b>Vehicle Identity</b><p>'+esc(car.make_model||'—')+' • '+esc(car.fuel||'—')+'</p><p>VIN: '+esc(car.vin||'—')+'<br>Engine: '+esc(car.engine_no||'—')+'</p></div><div class="glass-panel"><b>Last Service</b><h3>'+esc(last?.service_date||'No records')+'</h3><p>'+esc(last?.description||'No service record yet')+'</p></div></div>';
 renderFab();
}
function renderDashDocCard(d){
 const [status,cls]=docStatus(d),title=docTypeLabel(d),icon=d.document_type==='insurance'?'🛡️':d.document_type==='puc'?'🌿':'📘';
 return '<div class="flip-card" tabindex="0"><div class="flip-inner"><div class="flip-front"><div class="doc-card-icon">'+icon+'</div><b>'+esc(title)+'</b><small>'+esc(d.document_type==='insurance'?(car.insurance_number||'Policy document'):d.document_type==='puc'?(car.puc_state||'PUC certificate'):'Registration Certificate')+'</small><span class="doc-badge '+cls+'">'+status+'</span><em>'+esc(d.document_expiry?'Expiry '+d.document_expiry:'Vehicle document')+'</em></div><div class="flip-back"><b>'+esc(title)+'</b><p>'+esc(d.file_name)+'</p><div><button class="ghost" onclick="event.stopPropagation();openDoc(\''+d.storage_path.replace(/'/g,"\\'")+'\')">Preview</button><button class="ghost" onclick="event.stopPropagation();downloadDoc(\''+d.storage_path.replace(/'/g,"\\'")+'\')">Download</button>+(d.document_type==='insurance'||d.document_type==='puc'?'<button class="primary" onclick="event.stopPropagation();openDocUploader(\\''+d.document_type+'\\')">Renew</button>':'')</div></div></div></div>';
}
function openSaleForms(){
 if(!car)return toast('Select a vehicle before generating Form 29 & 30.','error');
 let m=document.getElementById('saleFormsModal');if(m)m.remove();
 const meta=user?.user_metadata||{},today=new Date().toISOString().slice(0,10);
 m=document.createElement('div');m.id='saleFormsModal';
 m.innerHTML='<div class="sale-modal-card"><div class="toolbar"><div><h3>Sell Vehicle / Generate Form 29 &amp; 30</h3><p class="muted">Buyer and RTO details required for the transfer documents.</p></div><button class="ghost" id="saleClose">✕</button></div><div class="form"><div class="field"><label>Buyer Full Name *</label><input id="buyerName"></div><div class="field"><label>Buyer Relation *</label><select id="buyerRelation"><option value="">Select</option><option>S/o</option><option>W/o</option><option>D/o</option></select></div><div class="field"><label>Relation Name *</label><input id="buyerRelationName" placeholder="Father / Husband / Mother name"></div><div class="field"><label>Buyer Age *</label><input id="buyerAge" type="number" min="18" max="120"></div><div class="field full"><label>Buyer Full Address *</label><textarea id="buyerAddress"></textarea></div><div class="field"><label>Buyer Jurisdiction RTO *</label><input id="buyerRto" placeholder="e.g. RTO Shimla"></div><div class="field"><label>Date of Sale / Agreement *</label><input id="saleDate" type="date" value="'+today+'"></div><div class="field"><label>Financier Name</label><input id="saleFinancier" value="N/A" placeholder="N/A if not hypothecated"></div><div class="field full"><div class="sale-vehicle-summary"><b>'+esc(car.registration_no)+'</b> · '+esc(car.make_model||'')+' · '+esc(car.fuel||'')+'<br>Transferor: '+esc(meta.full_name||car.owner_name||user?.email||'Not available')+'</div></div><div class="full"><button class="primary" id="generateSaleForms">GENERATE FORM 29 &amp; 30</button></div></div></div>';
 document.body.appendChild(m);m.onclick=e=>{if(e.target===m)m.remove()};$('saleClose').onclick=()=>m.remove();
 $('generateSaleForms').onclick=generateSaleForms;
}
function saleEscape(x){return esc(x).replace(/\n/g,'<br>')}
function getTransferor(){
 const meta=user?.user_metadata||{};
 return {name:meta.full_name||car.owner_name||user?.email||'',address:meta.address||meta.full_address||''};
}
async function generateSaleForms(){
 const btn=$('generateSaleForms');if(!btn)return;
 const buyerName=$('buyerName').value.trim(),relation=$('buyerRelation').value,relationName=$('buyerRelationName').value.trim(),age=Number($('buyerAge').value),address=$('buyerAddress').value.trim(),rto=$('buyerRto').value.trim(),saleDate=$('saleDate').value,financier=$('saleFinancier').value.trim()||'N/A';
 if(!buyerName||!relation||!relationName||!age||age<18||!address||!rto||!saleDate)return toast('Please complete all required buyer and RTO details.','error');
 btn.disabled=true;btn.textContent='GENERATING...';
 const tr=getTransferor(),relationText=relation+' '+relationName;
 const data={reg:car.registration_no,makeModel:car.make_model||'',vin:car.vin||'Not available',engine:car.engine_no||'Not available',transferor:tr.name||'Not available',transferorAddress:tr.address||'Not available',buyer:buyerName,relation:relationText,age,address,rto,saleDate,financier};
 try{
   const wrapper=document.createElement('div');wrapper.id='salePdfPreview';wrapper.setAttribute('aria-hidden','true');wrapper.innerHTML=buildSaleFormsHtml(data);document.body.appendChild(wrapper);
   const pdfName='Form_29_30_'+buyerName.replace(/[^a-zA-Z0-9_-]/g,'_')+'_'+new Date(saleDate).getFullYear()+'.pdf';
   if(typeof html2pdf==='undefined')throw new Error('PDF engine did not load. Please refresh and try again.');
   const opt={margin:0,filename:pdfName,image:{type:'jpeg',quality:.98},html2canvas:{scale:2,useCORS:true,backgroundColor:'#fff'},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}};
   const blob=await html2pdf().set(opt).from(wrapper).outputPdf('blob');
   wrapper.remove();
   const path=user.id+'/'+car.id+'/archives/'+pdfName;
   const up=await db.storage.from('car-documents').upload(path,blob,{contentType:'application/pdf',upsert:false});
   if(up.error)throw new Error('Archive upload failed: '+up.error.message);
   const ins=await db.from('documents').insert({user_id:user.id,car_id:car.id,file_name:pdfName,storage_path:path,mime_type:'application/pdf',file_size:blob.size,document_type:'other',document_name:'Form 29 & 30 (Sale Document)',archive_name:'Form 29 & 30',archived_at:new Date().toISOString(),active:false});
   if(ins.error){await db.storage.from('car-documents').remove([path]);throw new Error('Archive record save failed: '+ins.error.message)}
   const previewUrl=URL.createObjectURL(blob);
   const pv=document.createElement('div');pv.id='saleGeneratedModal';pv.innerHTML='<div class="sale-generated-card"><div class="toolbar"><div><h3>Form 29 &amp; 30 Ready</h3><p class="muted">Saved securely to vehicle archives.</p></div><button class="ghost" id="saleGeneratedClose">✕</button></div><iframe src="'+previewUrl+'" title="Form 29 and Form 30 preview"></iframe><div class="sale-generated-actions"><button class="ghost" onclick="window.open(\''+previewUrl+'\',\'_blank\')">Open PDF</button><button class="primary" onclick="window.print()">Print</button></div></div>';
   document.body.appendChild(pv);$('saleGeneratedClose').onclick=()=>{pv.remove();URL.revokeObjectURL(previewUrl)};mClose('saleFormsModal');await loadData();toast('Form 29 & 30 generated and saved to Archives for '+car.registration_no+'!');
 }catch(e){let w=document.getElementById('salePdfPreview');if(w)w.remove();toast('Failed to generate Form 29 & 30. '+(e?.message||e),'error')}finally{if(document.body.contains(btn)){btn.disabled=false;btn.textContent='GENERATE FORM 29 & 30'}}
}
function mClose(id){let x=document.getElementById(id);if(x)x.remove()}
function buildSaleFormsHtml(d){
 return '<div class="sale-pdf-sheet">'+
 '<div class="form-page"><div class="official-head"><b>FORM 29</b><span>[See rule 55(1)]</span><h1>NOTICE OF TRANSFER OF OWNERSHIP OF A MOTOR VEHICLE</h1></div><p>To, The Registering Authority, <b>'+saleEscape(d.rto)+'</b></p><p>I/We, the registered owner <b>'+saleEscape(d.transferor)+'</b>, hereby give notice that the motor vehicle bearing registration number <b>'+saleEscape(d.reg)+'</b>, make/model <b>'+saleEscape(d.makeModel)+'</b>, chassis number <b>'+saleEscape(d.vin)+'</b> and engine number <b>'+saleEscape(d.engine)+'</b> has been transferred to <b>'+saleEscape(d.buyer)+'</b>, '+saleEscape(d.relation)+', aged <b>'+d.age+'</b> years, residing at <b>'+saleEscape(d.address)+'</b>.</p><p>Date of transfer / sale: <b>'+saleEscape(d.saleDate)+'</b>.</p><p>The transferee shall make the necessary application for transfer of ownership before the competent registering authority.</p><div class="legal-spacer"></div><div class="signature-grid"><div>Signature / Thumb Impression of Registered Owner (Transferor)<br><br>____________________________</div><div>Signature of Financier (if applicable)<br><br>____________________________<br>'+saleEscape(d.financier)+'</div></div><div class="rto-box"><b>FOR OFFICE USE / ENDORSEMENT</b><br><br>Received / verified by Registering Authority: __________________________<br>Date: ____________________   Seal: ____________________</div></div>'+
 '<div class="form-page"><div class="official-head"><b>FORM 30</b><span>[See Rule 55(2) and (3)]</span><h1>APPLICATION FOR INTIMATION AND TRANSFER OF OWNERSHIP OF A MOTOR VEHICLE</h1></div><h2>PART I — TRANSFEROR DECLARATION</h2><p>I, <b>'+saleEscape(d.transferor)+'</b>, being the registered owner of vehicle <b>'+saleEscape(d.reg)+'</b>, make/model <b>'+saleEscape(d.makeModel)+'</b>, chassis number <b>'+saleEscape(d.vin)+'</b> and engine number <b>'+saleEscape(d.engine)+'</b>, declare that ownership is being transferred on <b>'+saleEscape(d.saleDate)+'</b>.</p><h2>PART II — TRANSFEREE DECLARATION</h2><p>I, <b>'+saleEscape(d.buyer)+'</b>, '+saleEscape(d.relation)+', aged <b>'+d.age+'</b> years, residing at <b>'+saleEscape(d.address)+'</b>, declare that I have acquired the above vehicle and request transfer of ownership through <b>'+saleEscape(d.rto)+'</b>.</p><h2>CONSENT OF FINANCIER</h2><p>Financier: <b>'+saleEscape(d.financier)+'</b></p><div class="legal-spacer small"></div><div class="specimen-grid"><div><b>Specimen signatures of Registered Owner</b><br><br>1. ______________________<br><br>2. ______________________</div><div><b>Specimen signatures of Financier / Transferee</b><br><br>1. ______________________<br><br>2. ______________________</div></div><div class="rto-box"><b>FOR OFFICE USE</b><br><br>RTO endorsement / remarks: __________________________________________<br><br>Signature &amp; Seal: ______________________________</div></div></div>';
}
function renderFab(){
 let f=document.getElementById('dashboardFab');if(f)f.remove();
 f=document.createElement('div');f.id='dashboardFab';f.innerHTML='<button class="fab-main" aria-label="Quick actions">＋</button><div class="fab-menu"><button onclick="nav(\'add\')">🛠️ <span>Add Service Log</span></button><button onclick="openDocUploader()">📄 <span>Upload Document</span></button><button onclick="openOdometerPrompt()">⛽ <span>Log Odometer / Fuel</span></button><button onclick="window.print()">🖨️ <span>Generate A4 Report</span></button></div>';document.body.appendChild(f);
 f.querySelector('.fab-main').onclick=()=>f.classList.toggle('open');
}
async function openOdometerPrompt(){
 let v=prompt('Enter current odometer KM:',String(car?.current_km||''));
 if(v===null)return;let km=Number(v);if(!Number.isFinite(km)||km<0)return toast('Invalid odometer value.','error');
 if(km<Number(car.current_km||0))return toast('Odometer cannot be lower than the current vehicle KM.','error');
 let r=await db.from('cars').update({current_km:km}).eq('id',car.id);
 if(r.error)return toast('Failed to update odometer: '+r.error.message,'error');
 car.current_km=km;dash();toast('Odometer updated for '+car.registration_no+'!');
}
function carsView(){$('carsList').innerHTML=cars.length?cars.map(c=>'<div class="card"><div class="toolbar"><div><h3>'+esc(c.registration_no)+'</h3><div class="muted">'+esc(c.make_model||'')+' • '+esc(c.model_year||'')+' • '+esc(c.fuel||'')+'</div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="ghost" onclick="openCar(\''+c.id+'\')">Open Car</button><button class="primary" onclick="editSpecificCar(\''+c.id+'\')">Edit</button></div></div></div>').join(''):'<div class="card">No cars yet.</div>'}
window.editSpecificCar=async id=>{let previous=car;car=cars.find(x=>x.id===id)||previous;updateCarTab();await window.editCar();await loadCars();let fresh=cars.find(x=>x.id===car?.id);if(fresh)car=fresh;updateCarTab();await loadData();carsView()};
function guard(){if(!car){$('guard').innerHTML='<div class="dangerbox">Please add/select a car first.</div>';$('formCard').style.display='none';return}if(!car.insurance_expiry||!car.puc_expiry){$('guard').innerHTML='<div class="dangerbox"><b>ENTRY BLOCKED</b> — Add Insurance and PUC expiry dates to this car first.</div>';$('formCard').style.display='none'}else{$('guard').innerHTML=(st(car.insurance_expiry)[0]==='EXPIRED'||st(car.puc_expiry)[0]==='EXPIRED')?'<div class="dangerbox"><b>WARNING</b> — Insurance/PUC is expired. Save only if you confirm.</div>':'';$('formCard').style.display='block'}}
renderServiceItems(); $('type').onchange=renderServiceItems;
['parts','labour','other'].forEach(id=>$(id).oninput=()=>{$('total').value=Number($('parts').value||0)+Number($('labour').value||0)+Number($('other').value||0)});
$('save').onclick=async()=>{if(!car)return;if(!car.insurance_expiry||!car.puc_expiry)return toast('Insurance and PUC are required');if(st(car.insurance_expiry)[0]==='EXPIRED'||st(car.puc_expiry)[0]==='EXPIRED')if(!confirm('WARNING — Insurance/PUC is expired. Continue?'))return;let row={user_id:user.id,car_id:car.id,service_date:$('date').value||new Date().toISOString().slice(0,10),odometer_km:+($('km').value||0),record_type:$('type').value,description:$('description').value,parts_cost:+($('parts').value||0),labour_cost:+($('labour').value||0),other_cost:+($('other').value||0),workshop:$('workshop').value,invoice_no:$('invoice').value,notes:$('notes').value};let r=await db.from('records').insert(row).select().single();if(r.error)return toast('Failed to save Regular Service Record: '+r.error.message,'error');let chosen=[...document.querySelectorAll('#items input:checked')].map(x=>({record_id:r.data.id,item_name:x.value}));if(chosen.length){let q=await db.from('record_items').insert(chosen);if(q.error)return toast('Failed to save Regular Service items: '+q.error.message,'error')}if(row.odometer_km>Number(car.current_km||0)){await db.from('cars').update({current_km:row.odometer_km}).eq('id',car.id);car.current_km=row.odometer_km}toast(row.record_type+' Record saved successfully!');await loadData();nav('history')};
function history(){if(!car)return;let current=$('year').value||'all';let ys=[...new Set(records.map(r=>new Date(r.service_date).getFullYear()))];ys.sort((a,b)=>b-a);$('year').innerHTML='<option value="all">All</option>'+ys.map(y=>'<option value="'+y+'">'+y+'</option>').join('');if(!['all',...ys.map(String)].includes(current))current='all';$('year').value=current;let rs=current==='all'?records:records.filter(r=>new Date(r.service_date).getFullYear()===+current);$('historyTable').innerHTML='<table class="table"><tr><th>Date</th><th>KM</th><th>Type</th><th>Work</th><th>Cost</th></tr>'+rs.map(r=>'<tr><td>'+esc(r.service_date)+'</td><td>'+esc(r.odometer_km)+'</td><td>'+esc(r.record_type)+'</td><td>'+esc(r.description||'')+'<br><small class="muted">'+esc((r.record_items||[]).map(x=>x.item_name).join(', '))+'</small></td><td>'+money(r.total_cost)+'</td></tr>').join('')+'</table><p><b>Year Total: '+money(rs.reduce((s,r)=>s+Number(r.total_cost||0),0))+'</b></p>'}
$('year').onchange=history;
function fyLabel(date){let d=new Date(date);let y=d.getFullYear();let start=y-(d.getMonth()<3?1:0);return start+'-'+String(start+1).slice(-2)}
function docTypeLabel(d){return d.document_type==='other'?(d.document_name||'Other'):d.document_type==='rc'?'Registration Certificate':d.document_type==='puc'?'PUC':'Insurance'}
function docExpired(d){return (d.document_type==='insurance'||d.document_type==='puc'||d.document_type==='rc')&&!!d.document_expiry&&!!dateOnlyEnd(d.document_expiry)&&dateOnlyEnd(d.document_expiry)<new Date()}
function docExpiringSoon(d){return (d.document_type==='insurance'||d.document_type==='puc'||d.document_type==='rc')&&!!d.document_expiry&&!docExpired(d)&&((dateOnlyEnd(d.document_expiry)-new Date())/86400000)<=15}
function docStatus(d){if(d.archived_at)return ['Archived','archived'];if(docExpired(d))return ['Expired','expired'];if(docExpiringSoon(d))return ['Expiring Soon','soon'];return ['Active','active']}
async function archiveExpiredDocuments(){return}
function renderDocFlipCard(d){
 const [status,cls]=docStatus(d),title=docTypeLabel(d),icon=d.document_type==='insurance'?'🛡️':d.document_type==='puc'?'🌿':d.document_type==='rc'?'📘':'📄';
 const meta=d.document_type==='insurance'?(car.insurance_number||'Policy number not recorded'):d.document_type==='puc'?((car.puc_state||'State')+' • '+(car.puc_validity_months?car.puc_validity_months+' months':'Validity not recorded')):d.document_type==='rc'?'Registration Certificate':(d.document_name||'Vehicle document');
 return '<div class="flip-card doc-flip-card" tabindex="0"><div class="flip-inner"><div class="flip-front"><div class="doc-card-top"><span class="doc-card-icon">'+icon+'</span><span class="doc-badge '+cls+'">'+status+'</span></div><b>'+esc(title)+'</b><small>'+esc(meta)+'</small><em>'+esc(d.document_expiry?'Expiry '+d.document_expiry:'No expiry required')+'</em></div><div class="flip-back"><b>'+esc(title)+'</b><small>'+esc(d.file_name)+'</small><div class="doc-flip-actions"><button class="ghost" onclick="event.stopPropagation();openDoc(\''+d.storage_path.replace(/'/g,"\\'")+'\')">Preview</button><button class="ghost" onclick="event.stopPropagation();downloadDoc(\''+d.storage_path.replace(/'/g,"\\'")+'\')">Download</button>'+(!d.archived_at?'<button class="danger doc-delete" '+(deletePasswordChanged()?'':'disabled')+' onclick="event.stopPropagation();deleteDoc(\''+d.id+'\',\''+d.storage_path.replace(/'/g,"\\'")+'\')">Delete</button>':'')+'</div></div></div></div>';
}
function renderDocRow(d){
 let [status,cls]=docStatus(d),title=docTypeLabel(d);
 return '<div class="doc-row '+cls+'"><div class="doc-icon">'+(d.document_type==='insurance'?'🛡️':d.document_type==='puc'?'🌿':d.document_type==='rc'?'📘':'📄')+'</div><div class="doc-main"><b>'+esc(title)+'</b><span>'+esc(d.file_name)+'</span><small>Uploaded: '+new Date(d.created_at).toLocaleDateString()+'</small>'+(d.document_expiry?'<span class="doc-expiry">'+(status==='Expired'?'Expired on':'Expiry')+' '+esc(d.document_expiry)+'</span>':'')+'<span class="doc-badge '+cls+'">'+status+'</span>'+(d.archived_at?'<em>Archive: '+esc(d.archive_name||'Year Wise')+'</em>':'')+'</div><div class="doc-actions"><button class="ghost" onclick="openDocumentPreview(\''+d.storage_path.replace(/'/g,"\\'")+'\',\''+d.file_name.replace(/'/g,"\\'")+'\')">Preview</button><button class="ghost" onclick="downloadDoc(\''+d.storage_path.replace(/'/g,"\\'")+'\')">Download</button><button class="danger doc-delete" '+(deletePasswordChanged()?'':'disabled')+' onclick="deleteDoc(\''+d.id+'\',\''+d.storage_path.replace(/'/g,"\\'")+'\','+(d.archived_at?'true':'false')+')">Delete</button></div></div>'}
async function docsView(){if(!car)return;let active=docs.filter(d=>!d.archived_at),arch=docs.filter(d=>d.archived_at),groups={insurance:[],puc:[],rc:[],other:[]};active.forEach(d=>(groups[d.document_type]||groups.other).push(d));let html='<div class="doc-grid">';[['rc','Registration Certificate','📘'],['puc','PUC','🌿'],['insurance','Insurance','🛡️'],['other','Other Documents','📄']].forEach(([key,label,icon])=>{html+='<div class="doc-col"><div class="doc-col-head"><div><span class="doc-col-icon">'+icon+'</span><b>'+label+'</b></div><span>'+groups[key].length+'</span></div>'+(groups[key].length?'<div class="doc-flip-grid">'+groups[key].map(renderDocFlipCard).join('')+'</div>':'<div class="doc-empty">No '+label+' document</div>')+'</div>'});html+='</div>';if(!deletePasswordChanged())html+='<div class="doc-security-notice">🔒 Please change default password to unlock delete actions.</div>';if(arch.length){let by={};arch.forEach(d=>{let k=d.archive_name||('Archive-'+fyLabel(d.document_expiry||d.created_at));(by[k]??=[]).push(d)});html+='<div class="doc-archive"><div class="doc-archive-head">📁 Archived Documents</div>'+Object.keys(by).sort().reverse().map(k=>'<details><summary>'+esc(k)+' <span>'+by[k].length+'</span></summary>'+by[k].map(renderDocRow).join('')+'</details>').join('')+'</div>'}$('docList').innerHTML=html;if(active.some(d=>docExpired(d)))showDocumentExpiryPopup()}
function showDocumentExpiryPopup(){if(document.getElementById('docExpiryPopup'))return;let expired=docs.filter(d=>docExpired(d)&&!d.archived_at);let firstType=expired[0]?.document_type||'';let names=expired.map(d=>docTypeLabel(d)+' for Vehicle '+(car?.registration_no||'')).join(' and ');let w=document.createElement('div');w.id='docExpiryPopup';w.innerHTML='<div class="doc-popup"><div class="doc-popup-icon">⚠️</div><h3>Document Expired</h3><p>Your '+esc(names)+' expired. Please upload the new document to stay compliant.</p><button class="primary" onclick="document.getElementById(\'docExpiryPopup\').remove();openDocUploader(firstType)">＋ Upload New Document</button><button class="ghost" onclick="document.getElementById(\'docExpiryPopup\').remove()">Later</button></div>';document.body.appendChild(w)}
function rcValidityYears(fuel){
 const f=String(fuel||'').toLowerCase();
 return f==='diesel'?10:15;
}
function calculateRcExpiry(issueDate,fuel){
 if(!issueDate)return null;
 const p=String(issueDate).split('-').map(Number);if(p.length!==3||p.some(Number.isNaN))return null;
 const d=new Date(p[0],p[1]-1,p[2]);
 const years=rcValidityYears(fuel);d.setFullYear(d.getFullYear()+years);d.setDate(d.getDate()-1);
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
function formatDateNice(x){
 if(!x)return '';
 const d=new Date(x+'T00:00:00');
 return Number.isNaN(d.getTime())?x:d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
}
function openDocUploader(preselectedType=''){
 let old=document.getElementById('docUploadModal');if(old)old.remove();
 let m=document.createElement('div');m.id='docUploadModal';
 m.innerHTML=`<div class="doc-upload-card" role="dialog" aria-modal="true"><div class="toolbar"><div><h3 id="docUploadTitle">Upload Vehicle Document</h3><p class="muted">Insurance/PUC expiry is entered manually. RC expiry is calculated automatically from Issue Date + vehicle fuel type.</p></div><button class="ghost" id="docUploadClose" type="button">✕</button></div><div class="form"><div class="field"><label>Document Type *</label><select id="docType"><option value="rc">Registration Certificate</option><option value="puc">PUC</option><option value="insurance">Insurance</option><option value="other">Other</option></select></div><div class="field" id="docNameWrap" style="display:none"><label>Document Name *</label><input id="docName" placeholder="e.g. Fastag / Permit / Fitness Certificate"></div><div class="field"><label>Issue Date <span id="docIssueReq">*</span></label><input id="docIssue" type="date"></div><div class="field" id="docExpiryWrap" style="display:none"><label>Expiry Date *</label><input id="docExpiry" type="date"></div><div class="field full" id="renewInsuranceFields" style="display:none"><div class="form"><div class="field"><label>Insurance Company *</label><select id="renewInsCompany">${insuranceCompanies.map(x=>'<option>'+esc(x)+'</option>').join('')}</select></div><div class="field"><label>Policy Number *</label><input id="renewInsNo"></div></div></div><div class="field full" id="renewPucFields" style="display:none"><div class="form"><div class="field"><label>PUC Number *</label><input id="renewPucNo"></div><div class="field"><label>PUC State *</label><select id="renewPucState"><option value="">Select State</option>${pucStates.map(x=>'<option>'+x+'</option>').join('')}</select></div><div class="field"><label>PUC Validity *</label><select id="renewPucValidity"><option value="">Select</option><option value="6">6 Months</option><option value="12">12 Months</option></select></div></div></div><div class="field full" id="rcValidityInfo" style="display:none"><div class="rc-auto-box">RC validity: <b id="rcValidityYears"></b> years • Calculated expiry: <b id="rcCalculatedExpiry">—</b></div></div><div class="field full"><label>Select File *</label><input id="docFile" type="file" accept=".pdf,.jpg,.jpeg,.png"></div><div class="full"><button class="primary" id="docUploadBtn" type="button"><span class="upload-btn-label">UPLOAD DOCUMENT</span></button></div></div></div>`;
 document.body.appendChild(m);
 if(['rc','puc','insurance','other'].includes(preselectedType))$('docType').value=preselectedType;
 const updateFields=()=>{
   let t=$('docType').value,rc=t==='rc',expiry=t==='insurance'||t==='puc';
   $('docNameWrap').style.display=t==='other'?'block':'none';
   $('docExpiryWrap').style.display=expiry?'block':'none';
   $('renewInsuranceFields').style.display=t==='insurance'?'block':'none';
   $('renewPucFields').style.display=t==='puc'?'block':'none';
   if(t==='insurance'){$('renewInsCompany').value=car?.insurance_company||'';$('renewInsNo').value=car?.insurance_number||''}
   if(t==='puc'){$('renewPucNo').value=car?.puc_certificate_no||'';$('renewPucState').value=car?.puc_state||'';$('renewPucValidity').value=car?.puc_validity_months?String(car.puc_validity_months):''}
   $('docIssueReq').textContent=(rc||t==='insurance'||t==='puc')?'*':'';
   $('rcValidityInfo').style.display=rc?'block':'none';
   if(rc){$('rcValidityYears').textContent=rcValidityYears(car?.fuel);let x=calculateRcExpiry($('docIssue').value,car?.fuel);$('rcCalculatedExpiry').textContent=x?formatDateNice(x):'—'}
 };
 $('docType').onchange=updateFields;$('docIssue').oninput=updateFields;updateFields();
 if(preselectedType)$('docUploadTitle').textContent=preselectedType==='insurance'?'Renew Insurance':preselectedType==='puc'?'Renew PUC':preselectedType==='rc'?'Replace Registration Certificate':'Upload Vehicle Document';
 $('docUploadClose').onclick=()=>m.remove();
 m.onclick=e=>{if(e.target===m&&$('docUploadBtn')&&!$('docUploadBtn').disabled)m.remove()};
 $('docUploadBtn').onclick=async()=>{
   let btn=$('docUploadBtn'),label=btn.querySelector('.upload-btn-label');if(btn.disabled)return;
   btn.disabled=true;btn.classList.add('is-uploading');label.innerHTML='<span class="inline-spinner"></span> UPLOADING...';
   let t=$('docType').value,n=t==='other'?$('docName').value.trim():'',issue=$('docIssue').value||null;
   let e=t==='rc'?calculateRcExpiry(issue,car?.fuel):((t==='insurance'||t==='puc')?$('docExpiry').value:'');
   let renewInsCompany=t==='insurance'?$('renewInsCompany').value.trim():'';
   let renewInsNo=t==='insurance'?$('renewInsNo').value.trim():'';
   let renewPucNo=t==='puc'?$('renewPucNo').value.trim():'';
   let renewPucState=t==='puc'?$('renewPucState').value:'';
   let renewPucValidity=t==='puc'?$('renewPucValidity').value:'';
   let f=$('docFile').files[0];
   const reset=()=>{btn.disabled=false;btn.classList.remove('is-uploading');label.textContent='UPLOAD DOCUMENT'};
   if(!f||!car){reset();return toast('Failed to upload document. Select a file.','error')}
   if(t==='other'&&!n){reset();return toast('Failed to upload Other Document. Enter document name.','error')}
   if((t==='rc'||t==='insurance'||t==='puc')&&!issue){reset();return toast('Issue Date is required.','error')}
   if(t==='insurance'&&(!e||!renewInsCompany||!renewInsNo)){reset();return toast('Insurance company, policy number and expiry are required.','error')}
   if(t==='puc'&&(!e||!renewPucNo||!renewPucState||!renewPucValidity)){reset();return toast('PUC number, state, validity and expiry are required.','error')}
   try{
     let old=(t==='rc'||t==='insurance'||t==='puc')?docs.find(d=>d.document_type===t&&!d.archived_at):null;
     let path=user.id+'/'+car.id+'/active/'+t+'/'+crypto.randomUUID()+'-'+f.name.replace(/[^a-zA-Z0-9._-]/g,'_');
     let u=await db.storage.from('car-documents').upload(path,f);if(u.error)throw new Error(u.error.message);
     let ins=await db.from('documents').insert({user_id:user.id,car_id:car.id,file_name:f.name,storage_path:path,mime_type:f.type,file_size:f.size,document_type:t,document_name:n||null,document_expiry:e||null,active:true});
     if(ins.error){await db.storage.from('car-documents').remove([path]);throw new Error(ins.error.message)}
     if(old){
       let folder=docTypeLabel(old)+'-'+fyLabel(old.document_expiry||old.created_at);
       let au=await db.from('documents').update({archive_name:folder,archived_at:new Date().toISOString(),active:false}).eq('id',old.id).eq('car_id',car.id);
       if(au.error)throw new Error('New document saved, but old document could not be archived: '+au.error.message);
     }
     if(t==='insurance'||t==='puc'){
       let patch=t==='insurance'?{insurance_expiry:e,insurance_company:renewInsCompany,insurance_number:renewInsNo}:{puc_expiry:e,puc_certificate_no:renewPucNo,puc_state:renewPucState,puc_validity_months:+renewPucValidity};
       let cr=await db.from('cars').update(patch).eq('id',car.id).eq('user_id',user.id);
       if(cr.error)throw new Error('Document saved, but vehicle compliance data could not be synced: '+cr.error.message);
       Object.assign(car,patch);
     }
     m.remove();
     toast(t==='rc'?('Registration Certificate uploaded successfully! Valid until '+formatDateNice(e)+'.'):(t==='insurance'?'Insurance renewed successfully!':'PUC renewed successfully!'));
     try{await loadData()}catch(refreshErr){toast('Document saved, but list refresh failed: '+(refreshErr?.message||'Please refresh the page.'),'error')}
   }catch(err){toast('Failed to save document. '+(err?.message||'Please try again.'),'error')}
   finally{if(document.body.contains(btn))reset()}
 };
}
window.openDocUploader=openDocUploader;

async function openDocumentPreview(path,fileName='Document'){
 let existing=document.getElementById('documentPreviewModal');if(existing)existing.remove();
 let r=await db.storage.from('car-documents').createSignedUrl(path,300);
 if(r.error)return toast('Preview failed: '+r.error.message,'error');
 let url=r.data.signedUrl;
 let ext=(fileName.split('.').pop()||'').toLowerCase();
 let media=ext==='pdf'
   ? '<iframe class="document-preview-frame" src="'+url+'" title="'+esc(fileName)+'"></iframe>'
   : '<img class="document-preview-image" src="'+url+'" alt="'+esc(fileName)+'">';
 let m=document.createElement('div');m.id='documentPreviewModal';
 m.innerHTML='<div class="document-preview-card"><div class="document-preview-head"><div><b>'+esc(fileName)+'</b><small>Secure preview • expires in 5 minutes</small></div><button class="ghost" type="button" id="documentPreviewClose">✕</button></div><div class="document-preview-body">'+media+'</div><div class="document-preview-foot"><button class="ghost" type="button" onclick="downloadDoc(\''+path.replace(/'/g,"\\'")+'\')">Download</button><button class="primary" type="button" onclick="document.getElementById(\'documentPreviewModal\').remove()">Close</button></div></div>';
 document.body.appendChild(m);
 $('documentPreviewClose').onclick=()=>m.remove();
 m.onclick=e=>{if(e.target===m)m.remove()};
}
window.downloadDoc=async path=>{let r=await db.storage.from('car-documents').createSignedUrl(path,300,{download:true});if(r.error)return toast(r.error.message);window.open(r.data.signedUrl,'_blank')};
const DEFAULT_DELETE_PASSWORD='1234';
function deletePasswordChanged(){return (localStorage.getItem('carcare_delete_password')||DEFAULT_DELETE_PASSWORD)!==DEFAULT_DELETE_PASSWORD}
function ensureSecurityPassword(){return true}
function changeDeletePassword(force=false){let current=localStorage.getItem('carcare_delete_password')||DEFAULT_DELETE_PASSWORD;let p=prompt(force?'Security PIN setup required. Default PIN is 1234. Enter a new 4-character PIN.':'Enter new 4-character security PIN.',force?'':current);if(p===null&&!force)return;if(!p||p.trim().length!==4||p.trim()==='1234'){toast('PIN must be exactly 4 characters and cannot be 1234.');if(force)setTimeout(()=>changeDeletePassword(true),300);return}localStorage.setItem('carcare_delete_password',p.trim());toast('Security PIN changed successfully!');docsView()}
function forgotDeletePassword(){let p=prompt('Forgot PIN? Set a new 4-character security PIN.');if(p===null)return;if(!p.trim()||p.trim().length!==4||p.trim()==='1234')return toast('PIN must be exactly 4 characters and cannot be 1234.');localStorage.setItem('carcare_delete_password',p.trim());toast('Security PIN reset successfully!');docsView()}
function setDeletePassword(){changeDeletePassword(false)}
async function deleteDoc(id,path,isArchived=false){
 if(!deletePasswordChanged())return toast('Please change default password to unlock delete actions.','error');
 let p=prompt('Enter your 4-character security PIN to confirm permanent deletion.','');
 if(p===null)return;
 let saved=localStorage.getItem('carcare_delete_password');
 if(p.trim()!==saved)return toast('Invalid Security PIN. Document was not deleted.','error');
 if(!confirm((isArchived?'Delete this archived document permanently from the server?':'Delete this document permanently?')+' This cannot be undone.'))return;
 let s=await db.storage.from('car-documents').remove([path]);
 if(s.error)return toast('Server file deletion failed: '+s.error.message,'error');
 let r=await db.from('documents').delete().eq('id',id).eq('car_id',car.id);
 if(r.error)return toast('Database record deletion failed after file removal: '+r.error.message,'error');
 toast((isArchived?'Archived document':'Document')+' deleted permanently from server!');
 await loadData();
}
async function pickInsuranceCompany(current=''){return new Promise(resolve=>{let old=document.getElementById('insurancePicker');if(old)old.remove();let wrap=document.createElement('div');wrap.id='insurancePicker';wrap.style='position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(5px);display:grid;place-items:center;z-index:100';wrap.innerHTML='<div style="background:#fff;padding:22px;border-radius:18px;width:min(420px,calc(100% - 30px));box-shadow:0 25px 70px rgba(15,23,42,.25)"><h3 style="margin:0 0 12px">Select Insurance Company *</h3><select id="insurancePickerSelect" style="width:100%;padding:12px;border:1px solid #e5e7eb;border-radius:10px">'+insuranceCompanies.map(x=>'<option>'+esc(x)+'</option>').join('')+'</select><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="ghost" id="insurancePickerCancel">Cancel</button><button class="primary" id="insurancePickerOk">Select</button></div></div>';document.body.appendChild(wrap);let sel=document.getElementById('insurancePickerSelect');sel.value=insuranceCompanies.includes(current)?current:'Not Available';document.getElementById('insurancePickerCancel').onclick=()=>{wrap.remove();resolve(null)};document.getElementById('insurancePickerOk').onclick=()=>{let v=sel.value;wrap.remove();resolve(v)};sel.focus()})}
async function ensureRequiredCarDetails(){if(!car){toast('Please add a car first');await nav('cars');return false}let missing=[];if(!car.registration_no)missing.push('Registration Number');if(!car.make_model)missing.push('Make / Model');if(!car.model_year)missing.push('Model Year');if(!car.fuel)missing.push('Fuel Type');if(!car.insurance_company||car.insurance_company==='Not Available')missing.push('Insurance Company');if(!car.insurance_expiry)missing.push('Insurance Expiry');if(!car.puc_state||!car.puc_expiry)missing.push('PUC State / PUC Expiry');if(!car.insurance_number)missing.push('Insurance Policy Number');if(!Array.isArray(car.insurance_type)||car.insurance_type.length<2)missing.push('Insurance Type (minimum 2)');if(!car.puc_certificate_no)missing.push('PUC Number');if(!car.puc_validity_months)missing.push('PUC Validity');if(!missing.length)return true;let msg='Required information missing:\n\n• '+missing.join('\n• ')+'\n\nPlease complete the required vehicle details.';if(!confirm(msg))return false;let ok=await window.editCar();if(!ok)return false;return !!car.make_model&&!!car.model_year&&!!car.fuel&&!!car.insurance_company&&car.insurance_company!=='Not Available'&&!!car.insurance_expiry&&!!car.insurance_number&&Array.isArray(car.insurance_type)&&car.insurance_type.length>=2&&!!car.puc_state&&!!car.puc_certificate_no&&!!car.puc_validity_months&&!!car.puc_expiry}
async function saveRequiredCarDetails(p){let r=await db.from('cars').update(p).eq('id',car.id);if(r.error)return toast(r.error.message);Object.assign(car,p);await loadData();toast('Required car information updated')}
window.openAddRecord=async()=>{if(!(await ensureRequiredCarDetails()))return;await nav('add')};
function report(){if(!car)return;let total=records.reduce((s,r)=>s+Number(r.total_cost||0),0),types=(car.insurance_type||[]).join(' • ')||'—',addons=(car.insurance_addons||[]).join(', ')||'None';$('reportArea').innerHTML='<div class="report-sheet"><div class="report-head"><div><div class="report-kicker">CARCARE CLOUD</div><h1>Vehicle Service Report</h1><p>Complete vehicle, insurance, PUC and service history</p></div><div class="report-reg">'+esc(car.registration_no)+'</div></div><div class="report-section"><div class="report-section-title">VEHICLE DETAILS</div><div class="report-grid"><div><span>Make / Model</span><b>'+esc(car.make_model||'—')+'</b></div><div><span>Model Year</span><b>'+esc(car.model_year||'—')+'</b></div><div><span>Fuel Type</span><b>'+esc(car.fuel||'—')+'</b></div><div><span>Current KM</span><b>'+esc(car.current_km||'0')+'</b></div><div><span>VIN / Chassis</span><b>'+esc(car.vin||'—')+'</b></div><div><span>Engine No.</span><b>'+esc(car.engine_no||'—')+'</b></div></div></div><div class="report-two"><div class="report-panel"><div class="report-section-title">INSURANCE</div><div class="report-line"><span>Company</span><b>'+esc(car.insurance_company||'—')+'</b></div><div class="report-line"><span>Policy Number</span><b>'+esc(car.insurance_number||'—')+'</b></div><div class="report-line"><span>Type</span><b>'+esc(types)+'</b></div><div class="report-line"><span>Add-ons</span><b>'+esc(addons)+'</b></div><div class="report-line"><span>Expiry</span><b>'+esc(car.insurance_expiry||'—')+'</b></div></div><div class="report-panel"><div class="report-section-title">PUC</div><div class="report-line"><span>Certificate Number</span><b>'+esc(car.puc_certificate_no||'—')+'</b></div><div class="report-line"><span>State</span><b>'+esc(car.puc_state||'—')+'</b></div><div class="report-line"><span>Validity</span><b>'+esc(car.puc_validity_months?car.puc_validity_months+' Months':'—')+'</b></div><div class="report-line"><span>Expiry</span><b>'+esc(car.puc_expiry||'—')+'</b></div></div></div><div class="report-section"><div class="report-section-title">SERVICE & REPAIR HISTORY</div><table class="report-table"><thead><tr><th>Date</th><th>KM</th><th>Type</th><th>Work</th><th>Cost</th></tr></thead><tbody>'+records.map(r=>'<tr><td>'+esc(r.service_date)+'</td><td>'+esc(r.odometer_km)+'</td><td>'+esc(r.record_type)+'</td><td>'+esc(r.description||'')+(r.record_items?.length?'<small>'+esc(r.record_items.map(x=>x.item_name).join(', '))+'</small>':'')+'</td><td>'+money(r.total_cost)+'</td></tr>').join('')+'</tbody></table><div class="report-total"><span>Total Service Cost</span><b>'+money(total)+'</b></div></div><div class="report-footer"><span>Generated by CarCare Cloud</span><span>'+new Date().toLocaleDateString()+'</span></div></div>'}
waitForSupabase();
window.editCar=async()=>{if(!car)return false;let old=document.getElementById('editCarModal');if(old)old.remove();let years='';let maxYear=new Date().getFullYear()+1;for(let y=maxYear;y>=1980;y--)years+='<option value="'+y+'">'+y+'</option>';let modal=document.createElement('div');modal.id='editCarModal';modal.style='position:fixed;inset:0;background:rgba(15,23,42,.48);backdrop-filter:blur(6px);display:grid;place-items:center;z-index:100;padding:15px';modal.innerHTML='<div class="edit-modal-card"><div class="toolbar"><div><h2 style="margin:0">Edit Car / Insurance / PUC</h2><p class="muted">Update vehicle details. Fields marked * are required.</p></div><button class="ghost" id="editCarCancel">Cancel</button></div><div class="form"><div class="field"><label>Registration Number *</label><input id="ecReg" value="'+esc(car.registration_no||'')+'" readonly></div><div class="field"><label>Make / Model *</label><input id="ecModel" value="'+esc(car.make_model||'')+'" required></div><div class="field"><label>Model Year *</label><select id="ecYear" required><option value="">Select Year</option>'+years+'</select></div><div class="field"><label>Fuel Type *</label><select id="ecFuel" required><option value="">Select</option><option>Petrol</option><option>Diesel</option><option>CNG</option><option>Hybrid</option><option>Electric</option></select></div><div class="field"><label>VIN / Chassis No. (Optional)</label><input id="ecVin" value="'+esc(car.vin||'')+'"></div><div class="field"><label>Engine No. (Optional)</label><input id="ecEngine" value="'+esc(car.engine_no||'')+'"></div><div class="field full"><label>Insurance Type * <span class="muted">(minimum 2)</span></label><div class="choice-grid" id="ecInsType">'+insuranceTypes.map(x=>'<label class="choice-card"><input type="checkbox" value="'+esc(x)+'"><span class="choice-check">✓</span><span>'+esc(x)+'</span></label>').join('')+'</div><small class="muted">Select at least 2 options.</small><small class="muted">Select at least 2 options.</small></div><div class="field full"><label>Insurance Add-ons (Optional)</label><div class="choice-grid" id="ecInsAddons">'+insuranceAddons.map(x=>'<label class="choice-card"><input type="checkbox" value="'+esc(x)+'"><span class="choice-check">✓</span><span>'+esc(x)+'</span></label>').join('')+'</div><small class="muted">Optional — select any add-ons that apply.</small></div><div class="field"><label>Insurance Company *</label><select id="ecIns" required>'+insuranceCompanies.map(x=>'<option>'+esc(x)+'</option>').join('')+'</select></div><div class="field"><label>Insurance Policy Number *</label><input id="ecInsNo" value="'+esc(car.insurance_number||'')+'"></div><div class="field"><label>Insurance Expiry *</label><input id="ecInsExp" type="date" value="'+esc(car.insurance_expiry||'')+'" required></div><div class="field"><label>PUC *</label><select id="ecPuc" required><option value="">Select</option><option value="yes">Yes</option><option value="no">No</option></select></div><div class="field" id="ecPucNoWrap"><label>PUC Number *</label><input id="ecPucNo" value="'+esc(car.puc_certificate_no||'')+'"></div><div class="field" id="ecPucStateWrap"><label>PUC State *</label><select id="ecPucState" required><option value="">Select State</option>'+pucStates.map(x=>'<option>'+x+'</option>').join('')+'</select></div><div class="field" id="ecPucValidityWrap"><label>PUC Validity *</label><select id="ecPucValidity"><option value="">Select</option><option value="6">6 Months</option><option value="12">12 Months</option></select></div><div class="field" id="ecPucExpWrap"><label>PUC Expiry *</label><input id="ecPucExp" type="date" value="'+esc(car.puc_expiry||'')+'" required></div><div class="field"><label>Current KM</label><input id="ecKm" type="number" min="0" value="'+esc(car.current_km||0)+'"></div><div class="full"><button class="primary" id="ecSave">SAVE CHANGES</button></div></div></div>';document.body.appendChild(modal);$('ecYear').value=car.model_year?String(car.model_year):'';$('ecFuel').value=car.fuel||'';$('ecIns').value=insuranceCompanies.includes(car.insurance_company)?car.insurance_company:'Not Available';let oldTypes=Array.isArray(car.insurance_type)?car.insurance_type:[];let oldAddons=Array.isArray(car.insurance_addons)?car.insurance_addons:[];document.querySelectorAll('#ecInsType input[type="checkbox"]').forEach(o=>o.checked=oldTypes.includes(o.value));document.querySelectorAll('#ecInsAddons input[type="checkbox"]').forEach(o=>o.checked=oldAddons.includes(o.value));$('ecPuc').value=(car.puc_state||car.puc_certificate_no||car.puc_expiry)?'yes':'';$('ecPucNo').value=car.puc_certificate_no||'';$('ecPucState').value=car.puc_state||'';$('ecPucValidity').value=car.puc_validity_months?String(car.puc_validity_months):'';let setPucVisibility=()=>{let yes=$('ecPuc').value==='yes';['ecPucNoWrap','ecPucStateWrap','ecPucValidityWrap','ecPucExpWrap'].forEach(id=>$(id).style.display=yes?'block':'none')};setPucVisibility();let resolveDone;let resultPromise=new Promise(resolve=>resolveDone=resolve);let finished=false;const finish=v=>{if(finished)return;finished=true;if(document.body.contains(modal))modal.remove();resolveDone(v)};$('editCarCancel').onclick=()=>finish(false);$('ecIns').onchange=()=>{};$('ecPuc').onchange=setPucVisibility;$('ecSave').onclick=async()=>{let model=$('ecModel').value.trim(),year=$('ecYear').value,fuel=$('ecFuel').value,ins=$('ecIns').value,insNo=$('ecInsNo').value.trim(),ie=$('ecInsExp').value,puc=$('ecPuc').value,pucNo=puc==='yes'?$('ecPucNo').value.trim():'',pucState=puc==='yes'?$('ecPucState').value:'',pucValidity=puc==='yes'?$('ecPucValidity').value:'',pe=puc==='yes'?$('ecPucExp').value:'',km=$('ecKm').value,insTypes=selectedChoices('ecInsType'),insAddons=selectedChoices('ecInsAddons');if(!model||!year||!fuel||!ins||!ie||!insNo||insTypes.length<2)return toast('Please complete all required (*) fields. Insurance Type needs minimum 2 selections.');let invalidInsurance=ins==='Not Available',invalidPuc=puc!=='yes'||!pucNo||!pucState||!pucValidity||!pe;if(invalidInsurance||invalidPuc){toast(invalidInsurance?'Insurance Company cannot be Not Available.':(!pucNo||!pucState||!pucValidity||!pe?'Please complete all required PUC details.':'Please complete all required vehicle details.'),'error');return}let payload={make_model:model,model_year:+year,fuel,current_km:km?+km:0,vin:$('ecVin').value.trim()||null,engine_no:$('ecEngine').value.trim()||null,insurance_company:ins,insurance_number:insNo,insurance_type:insTypes,insurance_addons:insAddons,insurance_expiry:ie,puc_certificate_no:pucNo,puc_state:pucState,puc_validity_months:+pucValidity,puc_expiry:pe};let r=await db.from('cars').update(payload).eq('id',car.id);if(r.error)return toast(r.error.message);Object.assign(car,payload);finish(true);updateCarTab();toast('Car details updated');await loadCars();let fresh=cars.find(x=>x.id===car.id);if(fresh)car=fresh;await loadData()};return resultPromise};window.openCarEdit=()=>window.editCar();
window.openDocumentRenewal=(type)=>openDocUploader(type);
