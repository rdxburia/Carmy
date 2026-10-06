
const U=APP_CONFIG.SUPABASE_URL,K=APP_CONFIG.SUPABASE_KEY;
let db=null;
function initSupabase(){const sb=window.supabase;if(sb&&typeof sb.createClient==='function'){db=sb.createClient(U,K);return true}return false}
function sdkError(){document.body.insertAdjacentHTML('afterbegin','<div style="position:fixed;inset:0;background:#fff;z-index:99999;display:grid;place-items:center;padding:24px;font-family:system-ui"><div style="max-width:600px"><h2>CarCare Cloud</h2><p>Supabase connection library load nahi hui. Browser extension/ad-blocker ya network CDN ko block kar raha ho sakta hai.</p><button onclick="location.reload()" style="background:#2563eb;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-weight:700">Refresh</button></div></div>')}
function waitForSupabase(n=0){if(initSupabase()){boot();return}if(n<40){setTimeout(()=>waitForSupabase(n+1),250);return}sdkError()}
let user=null,cars=[],car=null,records=[],docs=[],signup=false,startedUserId=null;
let ownerProfile=null,insuranceHistory=[],pucHistory=[],renewalHistory=[],saleHistory=[];
const serviceItems={
'Regular Service':['Engine Oil','Oil Filter','Air Filter','AC / Cabin Filter','Brake Oil / Brake Fluid','Coolant','Spark Plugs','Brake Pads','Front Brake Disc','Rear Drum Brake / Brake Shoes','Wheel Alignment','Wheel Balancing','Drive Belt','Battery Check','AC Service / AC Gas','Suspension Check','Steering Check','General Inspection'],
'Engine Service':['Engine Oil','Oil Filter','Air Filter','Spark Plugs','Drive Belt','Timing Belt / Timing Chain','Clutch Work','Flywheel / Pressure Plate','Engine Mount','Valve / Head Work','Engine Overhaul','Turbocharger Work','Injector / Fuel System','Coolant System','Other Engine Work'],
'Brake Work':['Brake Pads','Front Brake Disc','Rear Drum Brake / Brake Shoes','Brake Caliper','Brake Cylinder','Brake Fluid / Brake Bleeding','Brake Hose','Hand Brake / Parking Brake','ABS / Brake Sensor','Brake Inspection','Other Brake Work'],
'Tyre Work':['Front Tyre','Rear Tyre','All Tyres Changed','Spare Tyre','Wheel Alignment','Wheel Balancing','Tyre Rotation','Puncture Repair','Tyre Valve','Wheel / Rim Work','Tyre Pressure Check','Other Tyre Work'],
'Battery':['Battery Replacement','Battery Check','Battery Charging','Battery Terminal / Cable','Alternator Check','Starter Motor Check','Battery Warranty','Other Battery Work'],
'Accident / Repair':['Body Repair','Bumper Repair / Replacement','Bonnet / Fender / Door Repair','Headlight / Taillight','Windshield / Glass','Paint Work','Dent Removal','AC / Cooling Damage','Suspension Damage','Steering Damage','Electrical Repair','Insurance Claim Repair','Towing / Recovery','Other Accident Repair'],
'Other':['Inspection / Diagnosis','Electrical Work','AC / Cooling Work','Suspension Work','Steering Work','Exhaust Work','General Repair','Other']
};
function renderServiceItems(existing=[]){
 const type=$('type')?.value;
 const list=serviceItems[type]||[];
 const byName=new Map((existing||[]).map(x=>[x.item_name,x]));
 $('serviceItemsTitle').textContent=type+' Items';
 $('items').innerHTML=list.length?list.map((x,i)=>{
   const v=byName.get(x)||{};
   const key='si'+i;
   return '<div class="service-item-row"><label class="item"><input type="checkbox" class="service-item-check" data-name="'+esc(x)+'" '+(v.item_name?'checked':'')+'> '+esc(x)+'</label><div class="service-item-detail '+(v.item_name?'show':'')+'"><input class="si-qty" type="number" min="0" step="0.01" placeholder="Qty" value="'+esc(v.quantity??1)+'"><input class="si-brand" placeholder="Brand / Make" value="'+esc(v.brand||'')+'"><input class="si-part" placeholder="Part No." value="'+esc(v.part_number||'')+'"><input class="si-cost" type="number" min="0" step="0.01" placeholder="Part Cost" value="'+esc(v.cost??0)+'"><input class="si-labour" type="number" min="0" step="0.01" placeholder="Item Labour" value="'+esc(v.labour??0)+'"><input class="si-warranty" placeholder="Warranty" value="'+esc(v.warranty||'')+'"><input class="si-notes" placeholder="Item Notes" value="'+esc(v.notes||'')+'"></div></div>';
 }).join(''):'<div class="muted">No predefined items for this type.</div>';
 $('serviceItemsBlock').style.display=list.length?'block':'none';
 document.querySelectorAll('#items .service-item-check').forEach(ch=>{
   ch.onchange=()=>ch.closest('.service-item-row')?.querySelector('.service-item-detail')?.classList.toggle('show',ch.checked);
 });
}
function collectServiceItems(){
 return [...document.querySelectorAll('#items .service-item-check:checked')].map(ch=>{
   const row=ch.closest('.service-item-row'),name=ch.dataset.name;
   const val=sel=>row.querySelector(sel)?.value??'';
   return {item_name:name,quantity:Number(val('.si-qty')||1),brand:val('.si-brand').trim()||null,part_number:val('.si-part').trim()||null,cost:Number(val('.si-cost')||0),labour:Number(val('.si-labour')||0),warranty:val('.si-warranty').trim()||null,notes:val('.si-notes').trim()||null};
 }).filter(x=>x.quantity>=0&&x.cost>=0&&x.labour>=0);
}
function resetRecordForm(){
 ['description','workshop','invoice','notes'].forEach(id=>{$(id).value=''});
 $('parts').value='0';$('labour').value='0';$('other').value='0';$('total').value='0';
 $('date').value=new Date().toISOString().slice(0,10);
 $('km').value=Number(car?.current_km||0);
 $('type').value='Regular Service';renderServiceItems();
}
function prefillRecordForm(){
 if(!$('date').value)$('date').value=new Date().toISOString().slice(0,10);
 if(car&&(!$('km').value||Number($('km').value)===0))$('km').value=Number(car.current_km||0);
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
function closeSideMenu(){const m=$('sideMenu');if(!m)return;m.classList.remove('open');m.setAttribute('aria-hidden','true');$('menuToggle')?.setAttribute('aria-expanded','false');document.body.classList.remove('menu-open')}
function openSideMenu(){const m=$('sideMenu');if(!m)return;m.classList.add('open');m.setAttribute('aria-hidden','false');$('menuToggle')?.setAttribute('aria-expanded','true');document.body.classList.add('menu-open');updateDrawerContext()}
function updateIdentityUI(){
 const owner=(ownerProfile?.full_name||user?.user_metadata?.full_name||'').trim();
 const display=owner||'Owner';
 const top=$('userEmail');if(top)top.textContent=display;
 const u=$('drawerUser');if(u)u.textContent=display;
}
function updateDrawerContext(){
 let reg=$('drawerCarReg'),model=$('drawerCarModel');
 if(reg)reg.textContent=car?.registration_no||'No Vehicle';
 if(model)model.textContent=car?(car.make_model||'Vehicle')+' • '+(car.fuel||''):'Select a vehicle';
 updateIdentityUI();
}
async function nav(v){
 if(v==='add'&&car?.vehicle_status==='sold'){toast('Sold vehicle is read-only. Service logging is locked.','error');return}
 if(v==='add'&&!(await ensureRequiredCarDetails()))return;
 document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
 const target=$(v);if(!target)return;
 target.classList.add('active');
 document.querySelectorAll('aside button,.mobile-nav button,.drawer-link,.drawer-utility[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===v));
 if(v==='add')prefillRecordForm();
 if(v==='dashboard')dash();
 if(v==='cars')carsView();
 if(v==='history')renderHistory();
 if(v==='docs')docsView();
 if(v==='report')report();
 if(v==='owner')ownerProfileView();
 closeSideMenu();
}
document.querySelectorAll('aside button,.mobile-nav button,.drawer-link,.drawer-utility[data-view]').forEach(x=>x.onclick=()=>nav(x.dataset.view));
$('menuToggle')?.addEventListener('click',openSideMenu);
$('brandHome')?.addEventListener('click',()=>nav('dashboard'));
$('brandHome')?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();nav('dashboard')}});
$('menuClose')?.addEventListener('click',closeSideMenu);
$('sideMenuBackdrop')?.addEventListener('click',closeSideMenu);
$('drawerLogout')?.addEventListener('click',()=>db.auth.signOut());
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSideMenu()});

$('toggleAuth').onclick=()=>{signup=!signup;$('authTitle').textContent=signup?'Create account':'Private Car Manager';$('authBtn').textContent=signup?'Create account':'Login';$('toggleAuth').textContent=signup?'Back to login':'Create account'};
async function handleAuthSubmit(ev){
 ev?.preventDefault();
 if(!db)return toast('Secure login is still connecting. Please wait a moment.','error');
 const btn=$('authBtn'),emailEl=$('email'),passEl=$('password');
 const e=emailEl?.value.trim()||'',p=passEl?.value||'';
 if(!e)return toast('Enter your email address.','error');
 if(!p)return toast('Enter your password.','error');
 if(btn){btn.disabled=true;btn.dataset.loadingText=btn.textContent;btn.textContent=signup?'Creating account…':'Signing in…'}
 try{
   const r=signup
     ? await db.auth.signUp({email:e,password:p})
     : await db.auth.signInWithPassword({email:e,password:p});
   if(r.error){toast(r.error.message||'Login failed. Please check your email and password.','error');return}
   if(signup){
     toast(r.data?.session?'Account created and signed in.':'Account created. Check your email if confirmation is enabled.');
   }
 }catch(err){
   console.error('Authentication error:',err);
   toast('Login failed: '+(err?.message||'Please try again.'),'error');
 }finally{
   if(btn){btn.disabled=false;btn.textContent=btn.dataset.loadingText|| (signup?'Create account':'Login')}
 }
}
$('authBtn').onclick=handleAuthSubmit;
$('password')?.addEventListener('keydown',e=>{if(e.key==='Enter')handleAuthSubmit(e)});
$('email')?.addEventListener('keydown',e=>{if(e.key==='Enter')$('password')?.focus()});
const legacyLogout=$('logout');if(legacyLogout)legacyLogout.onclick=()=>db.auth.signOut();
async function boot(){let s=await db.auth.getSession();if(s.data.session)start(s.data.session.user);else showLogin();db.auth.onAuthStateChange((_e,s)=>{if(s)start(s.user);else{startedUserId=null;showLogin()}})}
function showLogin(){let o=$('policeLogoutOverlay');if(o){if(o._timer)clearTimeout(o._timer);o.remove()}let ps=$('policeLogoutStyle');if(ps)ps.remove();$('auth').classList.remove('hidden');$('app').classList.add('hidden');let fab=document.getElementById('dashboardFab');if(fab)fab.remove();let mn=document.getElementById('mobileNav');if(mn)mn.classList.add('auth-hidden');const joke=localStorage.getItem('carcare_logout_joke');if(joke){localStorage.removeItem('carcare_logout_joke');setTimeout(()=>toast(joke),150)}}
function updateCarTab(){let el=$('mobileCarReg');if(el)el.textContent=car?.registration_no||'No Car';updateDrawerContext()}
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
   updateIdentityUI();
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
async function loadStep5Data(){
 ownerProfile=null;insuranceHistory=[];pucHistory=[];renewalHistory=[];saleHistory=[];
 if(!user)return;
 const profile=await db.from('user_profiles').select('*').eq('user_id',user.id).maybeSingle();
 if(!profile.error)ownerProfile=profile.data||null;else console.warn('user_profiles load failed:',profile.error.message);
 if(!car)return;
 const [ih,ph,rh,sh]=await Promise.all([
   db.from('insurance_history').select('*').eq('car_id',car.id).order('created_at',{ascending:false}),
   db.from('puc_history').select('*').eq('car_id',car.id).order('created_at',{ascending:false}),
   db.from('policy_renewals').select('*').eq('car_id',car.id).order('renewal_date',{ascending:false}),
   db.from('sale_history').select('*').eq('car_id',car.id).order('sale_date',{ascending:false})
 ]);
 if(!ih.error)insuranceHistory=ih.data||[];
 if(!ph.error)pucHistory=ph.data||[];
 if(!rh.error)renewalHistory=rh.data||[];
 if(!sh.error)saleHistory=sh.data||[];
}
async function loadData(){
 if(!car){records=[];docs=[];await loadStep5Data();dash();renderHistory();report();guard();return}
 let r=await db.from('records').select('*,record_items(*)').eq('car_id',car.id).order('service_date',{ascending:false});
 if(r.error)throw new Error('Service history could not be loaded: '+r.error.message);
 records=r.data||[];
 let d=await db.from('documents').select('*').eq('car_id',car.id).order('created_at',{ascending:false});
 if(d.error)throw new Error('Vehicle documents could not be loaded: '+d.error.message);
 docs=d.data||[];
 await loadStep5Data();
 dash();renderHistory();await docsView();report();guard()
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
 '<div class="field full"><label>Insurance Type * <span class="muted">(minimum 2)</span></label><div class="choice-grid" id="cfInsType">'+insuranceTypes.map(x=>'<label class="choice-card"><input type="checkbox" value="'+esc(x)+'"><span class="choice-check">✓</span><span>'+esc(x)+'</span></label>').join('')+'</div><small class="muted">Select any 2 or more insurance types by clicking the cards.</small></div>'+
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
function serviceIntervalFor(type){
 const map={'Regular Service':{km:10000,months:6},'Engine Service':{km:15000,months:12},'Brake Work':{km:10000,months:6},'Tyre Work':{km:10000,months:6},'Battery':{km:20000,months:12},'Accident / Repair':{km:10000,months:6},'Other':{km:10000,months:6}};
 return map[type]||map['Regular Service'];
}
function serviceDueStatus(){
 if(!records.length)return {state:'NO HISTORY',cls:'neutral',text:'Add the first service record to start KM + time tracking.'};
 const last=records[0],iv=serviceIntervalFor(last.record_type),currentKm=Number(car.current_km||0),lastKm=Number(last.odometer_km||0);
 const kmSince=Math.max(0,currentKm-lastKm),lastDate=dateOnlyEnd(last.service_date),now=Date.now();
 const days=lastDate?Math.max(0,(now-lastDate)/86400000):0,monthsSince=days/30.4375;
 const kmDue=kmSince>=iv.km,timeDue=monthsSince>=iv.months;
 if(kmDue||timeDue)return {state:'SERVICE DUE',cls:'danger',text:(kmDue?'KM interval reached ('+Math.round(kmSince).toLocaleString('en-IN')+' km since last service).':'Time interval reached ('+monthsSince.toFixed(1)+' months since last service).')};
 const kmLeft=Math.max(0,iv.km-kmSince),daysLeft=Math.max(0,iv.months*30.4375-days);
 if(kmLeft<=1000||daysLeft<=30)return {state:'SERVICE DUE SOON',cls:'warn',text:Math.round(kmLeft).toLocaleString('en-IN')+' km / '+Math.ceil(daysLeft)+' days remaining'};
 return {state:'SERVICE OK',cls:'ok',text:Math.round(kmLeft).toLocaleString('en-IN')+' km or '+Math.floor(daysLeft/30)+' months remaining'};
}
function dashboardHealth(){
 const ins=st(car.insurance_expiry),puc=st(car.puc_expiry),service=serviceDueStatus();
 if(ins[0]==='EXPIRED'||puc[0]==='EXPIRED'||ins[0]==='MISSING'||puc[0]==='MISSING')return ['ACTION REQUIRED','danger','Insurance / PUC needs attention'];
 if(service.state==='SERVICE DUE')return ['SERVICE DUE','danger',service.text];
 if(service.state==='SERVICE DUE SOON')return ['SERVICE DUE SOON','warn',service.text];
 if(!records.length)return ['ALL SYSTEMS GREEN','ok','Vehicle compliance is currently valid'];
 return ['ALL SYSTEMS GREEN','ok','Insurance, PUC and service schedule look healthy'];
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
 if(!car){$('dash').innerHTML='<div class="card minimal-empty"><h3>No vehicle selected</h3><p class="muted">Add your first car to start managing its records.</p></div>';return}
 const health=dashboardHealth(),service=serviceDueStatus(),cost=records.reduce((s,r)=>s+Number(r.total_cost||0),0),last=records[0],ins=st(car.insurance_expiry),puc=st(car.puc_expiry);
 $('dashTitle').textContent=car.registration_no;
 $('dashSub').textContent=[car.make_model,car.model_year,car.fuel].filter(Boolean).join(' • ');
 $('dash').innerHTML=
 '<section class="minimal-dashboard">'+
 '<div class="minimal-hero"><div><span class="panel-kicker">VEHICLE OVERVIEW</span><h2>'+esc(car.registration_no)+(car.vehicle_status==='sold'?' <span class="sold-badge">SOLD</span>':'')+'</h2><p>'+esc(car.make_model||'Vehicle')+' • '+esc(car.model_year||'—')+' • '+esc(car.fuel||'—')+'</p></div><div class="minimal-km"><span>CURRENT KM</span><b>'+esc(Number(car.current_km||0).toLocaleString('en-IN'))+'</b></div></div>'+
 '<div class="minimal-grid">'+
 '<div class="minimal-card"><span>INSURANCE</span><b class="'+ins[1]+'">'+ins[0]+'</b><small>'+esc(car.insurance_expiry||'Not available')+'</small></div>'+
 '<div class="minimal-card"><span>PUC</span><b class="'+puc[1]+'">'+puc[0]+'</b><small>'+esc(car.puc_expiry||'Not available')+'</small></div>'+
 '<div class="minimal-card"><span>SERVICE</span><b class="'+service.cls+'">'+esc(service.state)+'</b><small>'+esc(service.text)+'</small></div>'+
 '<div class="minimal-card"><span>LIFETIME COST</span><b>'+money(cost)+'</b><small>Recorded maintenance</small></div>'+
 '</div>'+
 '<div class="minimal-status"><span class="health-badge '+(car.vehicle_status==='sold'?'neutral':health[1])+'"><i></i>'+esc(car.vehicle_status==='sold'?'VEHICLE SOLD':health[0])+'</span><span>'+esc(car.vehicle_status==='sold'?'Ownership lifecycle closed.':health[2])+'</span></div>'+
 '<div class="minimal-last"><div><span class="panel-kicker">LAST SERVICE</span><h3>'+esc(last?.service_date||'No service record')+'</h3><p>'+esc(last?.description||'No service record yet')+'</p></div><button class="ghost" onclick="nav(\'history\')">VIEW HISTORY</button></div>'+
 '</section>';
 renderFab();
}
function renderDashDocCard(d){
 const [status,cls]=docStatus(d),title=docTypeLabel(d),icon=d.document_type==='insurance'?'🛡️':d.document_type==='puc'?'🌿':'📘';
 return '<div class="flip-card" tabindex="0" onclick="this.classList.toggle(\'flipped\')"><div class="flip-inner"><div class="flip-front"><div class="doc-card-icon">'+icon+'</div><b>'+esc(title)+'</b><small>'+esc(d.document_type==='insurance'?(car.insurance_number||'Policy document'):d.document_type==='puc'?(car.puc_state||'PUC certificate'):'Registration Certificate')+'</small><span class="doc-badge '+cls+'">'+status+'</span><em>'+esc(d.document_expiry?'Expiry '+d.document_expiry:'Vehicle document')+'</em></div><div class="flip-back"><b>'+esc(title)+'</b><p>'+esc(d.file_name)+'</p><div><button class="ghost" onclick="event.stopPropagation();openDocumentPreview(\''+d.storage_path.replace(/'/g,"\\'")+'\')">Preview</button><button class="ghost" onclick="event.stopPropagation();downloadDoc(\''+d.storage_path.replace(/'/g,"\\'")+'\')">Download</button></div></div></div></div>';
}
function openSaleForms(){
 if(!car)return toast('Select a vehicle before generating Form 29 & 30.','error');
 if(car.vehicle_status==='sold')return toast('This vehicle is already marked SOLD.','error');
 if(!ownerProfile?.full_name){if(confirm('Owner Profile is not saved yet. Form 29/30 need your name and address. Fill Owner Profile now?'))openOwnerProfile();return}
 let m=document.getElementById('saleFormsModal');if(m)m.remove();
 const meta=user?.user_metadata||{},today=new Date().toISOString().slice(0,10);
 m=document.createElement('div');m.id='saleFormsModal';
 m.innerHTML='<div class="sale-modal-card"><div class="toolbar"><div><h3>Sell Vehicle / Generate Form 29 &amp; 30</h3><p class="muted">Buyer and RTO details required for the transfer documents.</p></div><button class="ghost" id="saleClose">✕</button></div><div class="form"><div class="field"><label>Buyer Full Name *</label><input id="buyerName"></div><div class="field"><label>Buyer Relation *</label><select id="buyerRelation"><option value="">Select</option><option>S/o</option><option>W/o</option><option>D/o</option></select></div><div class="field"><label>Relation Name *</label><input id="buyerRelationName" placeholder="Father / Husband / Mother name"></div><div class="field"><label>Buyer Age *</label><input id="buyerAge" type="number" min="18" max="120"></div><div class="field full"><label>Buyer Full Address *</label><textarea id="buyerAddress"></textarea></div><div class="field"><label>Buyer Jurisdiction RTO *</label><input id="buyerRto" placeholder="e.g. RTO Shimla"></div><div class="field"><label>Date of Sale / Agreement *</label><input id="saleDate" type="date" value="'+today+'"></div><div class="field"><label>Financier Name</label><input id="saleFinancier" value="N/A" placeholder="N/A if not hypothecated"></div><div class="field full"><div class="sale-vehicle-summary"><b>'+esc(car.registration_no)+'</b> · '+esc(car.make_model||'')+' · '+esc(car.fuel||'')+'<br>Transferor: '+esc(getTransferor().name||'Not available')+'</div></div><div class="full"><button class="primary" id="generateSaleForms">GENERATE FORM 29 &amp; 30</button></div></div></div>';
 document.body.appendChild(m);m.onclick=e=>{if(e.target===m)m.remove()};$('saleClose').onclick=()=>m.remove();
 $('generateSaleForms').onclick=generateSaleForms;
}
function saleEscape(x){return esc(x).replace(/\n/g,'<br>')}
function getTransferor(){
 const meta=user?.user_metadata||{},p=ownerProfile||{};
 const addr=[p.address,p.city,p.state,p.pincode].filter(Boolean).join(', ');
 return {name:p.full_name||meta.full_name||car.owner_name||user?.email||'',address:addr||meta.address||meta.full_address||''};
}
async function generateSaleForms(){
 const btn=$('generateSaleForms');if(!btn)return;
 const buyerName=$('buyerName').value.trim(),relation=$('buyerRelation').value,relationName=$('buyerRelationName').value.trim(),age=Number($('buyerAge').value),address=$('buyerAddress').value.trim(),rto=$('buyerRto').value.trim(),saleDate=$('saleDate').value,financier=$('saleFinancier').value.trim()||'N/A';
 if(!buyerName||!relation||!relationName||!age||age<18||!address||!rto||!saleDate)return toast('Please complete all required buyer and RTO details.','error');
 if(!confirm('This will generate Form 29 & 30 AND mark '+car.registration_no+' as SOLD. Service logging will be locked and this cannot be undone from the app. Continue?'))return;
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
   const saleRpc=await db.rpc('complete_vehicle_sale',{p_car_id:car.id,p_buyer_name:buyerName,p_buyer_relation:relation,p_buyer_relation_name:relationName,p_buyer_age:age,p_buyer_address:address,p_buyer_rto:rto,p_sale_date:saleDate,p_financier:financier,p_form_document_id:ins.data.id});
   if(saleRpc.error){await db.from('documents').delete().eq('id',ins.data.id).eq('car_id',car.id).eq('user_id',user.id);await db.storage.from('car-documents').remove([path]);throw new Error('Vehicle sale could not be completed. '+dbSetupHint(saleRpc.error))}
   car.vehicle_status='sold';car.sold_at=new Date().toISOString();car.sold_to_name=buyerName;car.sale_history_id=saleRpc.data;
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
 f=document.createElement('div');f.id='dashboardFab';f.innerHTML='<button class="fab-main" aria-label="Quick actions">＋</button><div class="fab-menu"><button onclick="nav(\'add\')">🛠️ <span>Add Service Log</span></button><button onclick="openDocUploader()">📄 <span>Upload Document</span></button><button onclick="openOdometerPrompt()">⛽ <span>Log Odometer / Fuel</span></button><button onclick="openReportAndPrint()">🖨️ <span>Generate A4 Report</span></button></div>';document.body.appendChild(f);
 f.querySelector('.fab-main').onclick=()=>f.classList.toggle('open');
 f.querySelectorAll('.fab-menu button').forEach(b=>b.addEventListener('click',()=>f.classList.remove('open')));
 document.addEventListener('click',e=>{if(f.isConnected&&!f.contains(e.target))f.classList.remove('open')});
}
async function openOdometerPrompt(){
 let v=prompt('Enter current odometer KM:',String(car?.current_km||''));
 if(v===null)return;let km=Number(v);if(!Number.isFinite(km)||km<0)return toast('Invalid odometer value.','error');
 if(km<Number(car.current_km||0))return toast('Odometer cannot be lower than the current vehicle KM.','error');
 let r=await db.from('cars').update({current_km:km}).eq('id',car.id);
 if(r.error)return toast('Failed to update odometer: '+r.error.message,'error');
 car.current_km=km;dash();toast('Odometer updated for '+car.registration_no+'!');
}
function openOwnerProfile(){
 let old=document.getElementById('ownerProfileModal');if(old)old.remove();
 const p=ownerProfile||{},meta=user?.user_metadata||{};
 let m=document.createElement('div');m.id='ownerProfileModal';
 m.innerHTML='<div class="step5-modal-card"><div class="toolbar"><div><h3>Owner Profile</h3><p class="muted">Saved once and reused for vehicle reports and ownership documents.</p></div><button class="ghost" id="ownerProfileClose">✕</button></div><div class="form"><div class="field"><label>Full Name *</label><input id="opName" value="'+esc(p.full_name||meta.full_name||'')+'"></div><div class="field"><label>Phone</label><input id="opPhone" inputmode="tel" value="'+esc(p.phone||meta.phone||'')+'"></div><div class="field full"><label>Address</label><textarea id="opAddress">'+esc(p.address||meta.address||meta.full_address||'')+'</textarea></div><div class="field"><label>City</label><input id="opCity" value="'+esc(p.city||'')+'"></div><div class="field"><label>State</label><input id="opState" value="'+esc(p.state||'')+'"></div><div class="field"><label>Pincode</label><input id="opPincode" inputmode="numeric" value="'+esc(p.pincode||'')+'"></div><div class="full"><button class="primary" id="opSave">SAVE PROFILE</button></div></div></div>';
 document.body.appendChild(m);$('ownerProfileClose').onclick=()=>m.remove();m.onclick=e=>{if(e.target===m)m.remove()};
 $('opSave').onclick=async()=>{
   const btn=$('opSave');if(btn.disabled)return;
   const payload={user_id:user.id,full_name:$('opName').value.trim(),phone:$('opPhone').value.trim()||null,address:$('opAddress').value.trim()||null,city:$('opCity').value.trim()||null,state:$('opState').value.trim()||null,pincode:$('opPincode').value.trim()||null,updated_at:new Date().toISOString()};
   if(!payload.full_name)return toast('Full Name is required.','error');
   btn.disabled=true;btn.textContent='SAVING...';
   const r=await db.from('user_profiles').upsert(payload,{onConflict:'user_id'}).select().single();
   btn.disabled=false;btn.textContent='SAVE PROFILE';
   if(r.error)return toast('Profile save failed. '+dbSetupHint(r.error),'error');
   ownerProfile=r.data;m.remove();toast('Owner profile saved successfully.');
 };
}
async function openVehicleHistory(id=car?.id){
 const target=cars.find(x=>x.id===id)||car;if(!target)return;
 const [ih,ph,rh,sh]=await Promise.all([
   db.from('insurance_history').select('*').eq('car_id',target.id).order('created_at',{ascending:false}),
   db.from('puc_history').select('*').eq('car_id',target.id).order('created_at',{ascending:false}),
   db.from('policy_renewals').select('*').eq('car_id',target.id).order('renewal_date',{ascending:false}),
   db.from('sale_history').select('*').eq('car_id',target.id).order('sale_date',{ascending:false})
 ]);
 const insuranceRows=ih.error?[]:(ih.data||[]),pucRows=ph.error?[]:(ph.data||[]),renewalRows=rh.error?[]:(rh.data||[]),saleRows=sh.error?[]:(sh.data||[]);
 let old=document.getElementById('vehicleHistoryModal');if(old)old.remove();
 let m=document.createElement('div');m.id='vehicleHistoryModal';
 m.innerHTML='<div class="step5-modal-card history-modal"><div class="toolbar"><div><h3>'+esc(target.registration_no)+' • Compliance History</h3><p class="muted">Server-side historical snapshots remain linked to this vehicle.</p></div><button class="ghost" id="vhClose">✕</button></div>'+
 '<div class="history-section"><h4>Insurance History</h4><div class="table-scroll"><table class="table"><thead><tr><th>Date</th><th>Company</th><th>Policy</th><th>Expiry</th><th>Event</th></tr></thead><tbody>'+(insuranceRows.length?insuranceRows.map(x=>'<tr><td>'+esc(x.created_at?.slice(0,10))+'</td><td>'+esc(x.insurance_company)+'</td><td>'+esc(x.policy_number)+'</td><td>'+esc(x.expiry_date)+'</td><td>'+esc(x.event_type)+'</td></tr>').join(''):'<tr><td colspan="5">No history recorded yet.</td></tr>')+'</tbody></table></div></div>'+
 '<div class="history-section"><h4>PUC History</h4><div class="table-scroll"><table class="table"><thead><tr><th>Date</th><th>Certificate</th><th>State</th><th>Expiry</th><th>Event</th></tr></thead><tbody>'+(pucRows.length?pucRows.map(x=>'<tr><td>'+esc(x.created_at?.slice(0,10))+'</td><td>'+esc(x.certificate_number)+'</td><td>'+esc(x.state)+'</td><td>'+esc(x.expiry_date)+'</td><td>'+esc(x.event_type)+'</td></tr>').join(''):'<tr><td colspan="5">No history recorded yet.</td></tr>')+'</tbody></table></div></div>'+
 '<div class="history-section"><h4>Policy Renewal History</h4><div class="table-scroll"><table class="table"><thead><tr><th>Date</th><th>Type</th><th>Old Expiry</th><th>New Expiry</th><th>Source</th></tr></thead><tbody>'+(renewalRows.length?renewalRows.map(x=>'<tr><td>'+esc(x.renewal_date)+'</td><td>'+esc(x.policy_type?.toUpperCase())+'</td><td>'+esc(x.old_expiry)+'</td><td>'+esc(x.new_expiry)+'</td><td>'+esc(x.source)+'</td></tr>').join(''):'<tr><td colspan="5">No renewal history recorded yet.</td></tr>')+'</tbody></table></div></div>'+
 '<div class="history-section"><h4>Sale History</h4><div class="table-scroll"><table class="table"><thead><tr><th>Sale Date</th><th>Buyer</th><th>RTO</th><th>Financier</th><th>Status</th></tr></thead><tbody>'+(saleRows.length?saleRows.map(x=>'<tr><td>'+esc(x.sale_date)+'</td><td>'+esc(x.buyer_name)+'</td><td>'+esc(x.buyer_rto)+'</td><td>'+esc(x.financier)+'</td><td>'+esc(x.status)+'</td></tr>').join(''):'<tr><td colspan="5">No sale history — vehicle is '+(target.vehicle_status==='sold'?'marked SOLD':'active')+'.</td></tr>')+'</tbody></table></div></div></div>';
 document.body.appendChild(m);$('vhClose').onclick=()=>m.remove();m.onclick=e=>{if(e.target===m)m.remove()};
}
function carsView(){
 $('carsList').innerHTML='<div class="step5-toolbar"><div><b>Owner & Vehicle Records</b><span class="muted">Profile, compliance history and sold lifecycle are stored in the cloud.</span></div><button class="ghost" onclick="openOwnerProfile()">👤 Owner Profile</button></div>'+
 (cars.length?cars.map(c=>'<div class="card '+(c.vehicle_status==='sold'?'vehicle-sold-card':'')+'"><div class="toolbar"><div><h3>'+esc(c.registration_no)+' '+(c.vehicle_status==='sold'?'<span class="sold-badge">SOLD</span>':'')+'</h3><div class="muted">'+esc(c.make_model||'')+' • '+esc(c.model_year||'')+' • '+esc(c.fuel||'')+'</div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="ghost" onclick="openCar(\''+c.id+'\')">Open Car</button><button class="ghost" onclick="openVehicleHistory(\''+c.id+'\')">History</button>'+(c.vehicle_status==='sold'?'':'<button class="primary" onclick="editSpecificCar(\''+c.id+'\')">Edit</button>')+'</div></div></div>').join(''):'<div class="card">No cars yet.</div>');
}
window.editSpecificCar=async id=>{let previous=car;car=cars.find(x=>x.id===id)||previous;if(car?.vehicle_status==='sold'){toast('Sold vehicle is read-only. Open History to view its complete lifecycle.','error');car=previous;return}updateCarTab();await window.editCar();await loadCars();let fresh=cars.find(x=>x.id===car?.id);if(fresh)car=fresh;updateCarTab();await loadData();carsView()};
function guard(){if(!car){$('guard').innerHTML='<div class="dangerbox">Please add/select a car first.</div>';$('formCard').style.display='none';return}if(car.vehicle_status==='sold'){$('guard').innerHTML='<div class="dangerbox"><b>VEHICLE SOLD</b> — Service entries are locked. Historical records and documents remain available.</div>';$('formCard').style.display='none';return}if(!car.insurance_expiry||!car.puc_expiry){$('guard').innerHTML='<div class="dangerbox"><b>ENTRY BLOCKED</b> — Add Insurance and PUC expiry dates to this car first.</div>';$('formCard').style.display='none'}else{$('guard').innerHTML=(st(car.insurance_expiry)[0]==='EXPIRED'||st(car.puc_expiry)[0]==='EXPIRED')?'<div class="dangerbox"><b>WARNING</b> — Insurance/PUC is expired. Save only if you confirm.</div>':'';$('formCard').style.display='block'}}
renderServiceItems(); $('type').onchange=renderServiceItems;
['parts','labour','other'].forEach(id=>$(id).oninput=()=>{$('total').value=Number($('parts').value||0)+Number($('labour').value||0)+Number($('other').value||0)});
$('save').onclick=async()=>{
 if(!car)return;
 if(car.vehicle_status==='sold')return toast('Sold vehicle is read-only. Service logging is locked.','error');
 if(!car.insurance_expiry||!car.puc_expiry)return toast('Insurance and PUC are required','error');
 if(st(car.insurance_expiry)[0]==='EXPIRED'||st(car.puc_expiry)[0]==='EXPIRED')if(!confirm('WARNING — Insurance/PUC is expired. Continue?'))return;
 const btn=$('save');if(btn.disabled)return;
 const km=Number($('km').value||0),parts=Number($('parts').value||0),labour=Number($('labour').value||0),other=Number($('other').value||0);
 if(!Number.isFinite(km)||km<0||!Number.isFinite(parts)||parts<0||!Number.isFinite(labour)||labour<0||!Number.isFinite(other)||other<0)return toast('Enter valid KM and cost values.','error');
 const chosen=collectServiceItems();
 btn.disabled=true;btn.classList.add('is-saving');const oldText=btn.textContent;btn.textContent='SAVING...';
 const overlay=showOperationOverlay('Saving service record','Saving service + item details together');
 try{
   const {data,error}=await db.rpc('save_service_record',{
     p_car_id:car.id,p_service_date:$('date').value||new Date().toISOString().slice(0,10),p_odometer_km:km,p_record_type:$('type').value,
     p_description:$('description').value.trim()||null,p_parts_cost:parts,p_labour_cost:labour,p_other_cost:other,
     p_workshop:$('workshop').value.trim()||null,p_invoice_no:$('invoice').value.trim()||null,p_notes:$('notes').value.trim()||null,p_items:chosen
   });
   if(error)throw error;
   if(!data)throw new Error('No record ID returned by server.');
   if(km>Number(car.current_km||0))car.current_km=km;
   resetRecordForm();
   toast($('type').value+' Record saved successfully!');
   await loadData();nav('history');
 }catch(err){
   toast('Failed to save service record: '+(err?.message||'Please run the Step 4 SQL migration first.'),'error');
 }finally{
   hideOperationOverlay();btn.disabled=false;btn.classList.remove('is-saving');btn.textContent=oldText;
 }
};
function renderHistory(){
 if(!car)return;
 let current=$('year').value||'all',ys=[...new Set(records.map(r=>new Date(r.service_date).getFullYear()))].sort((a,b)=>b-a);
 $('year').innerHTML='<option value="all">All</option>'+ys.map(y=>'<option value="'+y+'">'+y+'</option>').join('');
 if(!['all',...ys.map(String)].includes(current))current='all';$('year').value=current;
 let rs=current==='all'?records:records.filter(r=>new Date(r.service_date).getFullYear()===+current);
 const rows=rs.map(r=>{
   const items=(r.record_items||[]).map(x=>x.item_name).join(', ');
   return '<tr><td>'+esc(r.service_date)+'</td><td>'+esc(r.odometer_km)+'</td><td>'+esc(r.record_type)+'</td><td>'+esc(r.description||'')+'<br><small class="muted">'+esc(items)+'</small></td><td>'+money(r.total_cost)+'</td><td><button class="ghost" onclick="editServiceRecord(\''+r.id+'\')">Edit</button> <button class="danger" onclick="deleteServiceRecord(\''+r.id+'\')">Delete</button></td></tr>';
 }).join('');
 $('historyTable').innerHTML='<div class="table-scroll"><table class="table"><tr><th>Date</th><th>KM</th><th>Type</th><th>Work</th><th>Cost</th><th>Actions</th></tr>'+rows+'</table></div><p><b>Year Total: '+money(rs.reduce((s,r)=>s+Number(r.total_cost||0),0))+'</b></p>';
}

$('year').onchange=renderHistory;
async function editServiceRecord(id){
 const r=records.find(x=>x.id===id);if(!r||!car)return;
 let old=document.getElementById('editServiceRecordModal');if(old)old.remove();
 let m=document.createElement('div');m.id='editServiceRecordModal';
 m.innerHTML='<div class="edit-modal-card"><div class="toolbar"><div><h2>Edit Service Record</h2><p class="muted">Update the complete service entry and item details.</p></div><button class="ghost" id="esrClose">Cancel</button></div><div class="form"><div class="field"><label>Date</label><input id="esrDate" type="date" value="'+esc(r.service_date||'')+'"></div><div class="field"><label>Odometer / KM</label><input id="esrKm" type="number" value="'+esc(r.odometer_km||0)+'"></div><div class="field"><label>Record Type</label><select id="esrType">'+Object.keys(serviceItems).map(x=>'<option>'+esc(x)+'</option>').join('')+'</select></div><div class="field"><label>Workshop</label><input id="esrWorkshop" value="'+esc(r.workshop||'')+'"></div><div class="field full"><label>Description</label><textarea id="esrDescription">'+esc(r.description||'')+'</textarea></div><div class="field"><label>Parts Cost</label><input id="esrParts" type="number" min="0" value="'+esc(r.parts_cost||0)+'"></div><div class="field"><label>Labour</label><input id="esrLabour" type="number" min="0" value="'+esc(r.labour_cost||0)+'"></div><div class="field"><label>Other</label><input id="esrOther" type="number" min="0" value="'+esc(r.other_cost||0)+'"></div><div class="field"><label>Invoice No.</label><input id="esrInvoice" value="'+esc(r.invoice_no||'')+'"></div><div class="field"><label>Notes</label><input id="esrNotes" value="'+esc(r.notes||'')+'"></div><div class="full"><b id="esrItemsTitle">Service Items</b><div id="esrItems" class="itemgrid" style="margin-top:8px"></div></div><div class="full"><button class="primary" id="esrSave">SAVE CHANGES</button></div></div></div>';
 document.body.appendChild(m);
 $('esrType').value=r.record_type||'Other';
 const renderEditItems=()=>{
   const list=serviceItems[$('esrType').value]||[],existing=new Map((r.record_items||[]).map(x=>[x.item_name,x]));
   $('esrItemsTitle').textContent=$('esrType').value+' Items';
   $('esrItems').innerHTML=list.map((x,i)=>{const v=existing.get(x)||{};return '<div class="service-item-row"><label class="item"><input type="checkbox" class="esr-check" data-name="'+esc(x)+'" '+(v.item_name?'checked':'')+'> '+esc(x)+'</label><div class="service-item-detail '+(v.item_name?'show':'')+'"><input class="esr-qty" type="number" min="0" step="0.01" placeholder="Qty" value="'+esc(v.quantity??1)+'"><input class="esr-brand" placeholder="Brand / Make" value="'+esc(v.brand||'')+'"><input class="esr-part" placeholder="Part No." value="'+esc(v.part_number||'')+'"><input class="esr-cost" type="number" min="0" step="0.01" placeholder="Part Cost" value="'+esc(v.cost??0)+'"><input class="esr-labour" type="number" min="0" step="0.01" placeholder="Item Labour" value="'+esc(v.labour??0)+'"><input class="esr-warranty" placeholder="Warranty" value="'+esc(v.warranty||'')+'"><input class="esr-notes" placeholder="Item Notes" value="'+esc(v.notes||'')+'"></div></div>'}).join('');
   document.querySelectorAll('#esrItems .esr-check').forEach(ch=>ch.onchange=()=>ch.closest('.service-item-row')?.querySelector('.service-item-detail')?.classList.toggle('show',ch.checked));
 };
 $('esrType').onchange=renderEditItems;renderEditItems();$('esrClose').onclick=()=>m.remove();
 $('esrSave').onclick=async()=>{
   const btn=$('esrSave');if(btn.disabled)return;btn.disabled=true;btn.textContent='SAVING...';
   const items=[...document.querySelectorAll('#esrItems .esr-check:checked')].map(ch=>{const row=ch.closest('.service-item-row'),v=s=>row.querySelector(s)?.value??'';return {item_name:ch.dataset.name,quantity:Number(v('.esr-qty')||1),brand:v('.esr-brand').trim()||null,part_number:v('.esr-part').trim()||null,cost:Number(v('.esr-cost')||0),labour:Number(v('.esr-labour')||0),warranty:v('.esr-warranty').trim()||null,notes:v('.esr-notes').trim()||null}});
   try{
     const {data,error}=await db.rpc('update_service_record',{p_record_id:id,p_car_id:car.id,p_service_date:$('esrDate').value,p_odometer_km:Number($('esrKm').value||0),p_record_type:$('esrType').value,p_description:$('esrDescription').value.trim()||null,p_parts_cost:Number($('esrParts').value||0),p_labour_cost:Number($('esrLabour').value||0),p_other_cost:Number($('esrOther').value||0),p_workshop:$('esrWorkshop').value.trim()||null,p_invoice_no:$('esrInvoice').value.trim()||null,p_notes:$('esrNotes').value.trim()||null,p_items:items});
     if(error)throw error;m.remove();toast('Service record updated successfully!');await loadData();renderHistory();
   }catch(err){toast('Failed to update service record: '+(err?.message||'Run Step 4 SQL migration first.'),'error')}finally{btn.disabled=false;btn.textContent='SAVE CHANGES'}
 };
}
async function deleteServiceRecord(id){
 const r=records.find(x=>x.id===id);if(!r||!car)return;
 if(!confirm('Delete this service record permanently? Its service-item details will also be deleted.'))return;
 const btns=[...document.querySelectorAll('.table button')];btns.forEach(b=>b.disabled=true);
 try{
   const {error}=await db.rpc('delete_service_record',{p_record_id:id,p_car_id:car.id});
   if(error)throw error;toast('Service record deleted permanently!');await loadData();renderHistory();
 }catch(err){toast('Failed to delete service record: '+(err?.message||'Run Step 4 SQL migration first.'),'error')}finally{btns.forEach(b=>b.disabled=false)}
}
function fyLabel(date){let d=new Date(date);let y=d.getFullYear();let start=y-(d.getMonth()<3?1:0);return start+'-'+String(start+1).slice(-2)}
function docTypeLabel(d){return d.document_type==='other'?(d.document_name||'Other'):d.document_type==='rc'?'Registration Certificate':d.document_type==='puc'?'PUC':'Insurance'}
function docExpired(d){return (d.document_type==='insurance'||d.document_type==='puc'||d.document_type==='rc')&&!!d.document_expiry&&!!dateOnlyEnd(d.document_expiry)&&dateOnlyEnd(d.document_expiry)<new Date()}
function docExpiringSoon(d){return (d.document_type==='insurance'||d.document_type==='puc'||d.document_type==='rc')&&!!d.document_expiry&&!docExpired(d)&&((dateOnlyEnd(d.document_expiry)-new Date())/86400000)<=15}
function docStatus(d){if(d.archived_at)return ['Archived','archived'];if(docExpired(d))return ['Expired','expired'];if(docExpiringSoon(d))return ['Expiring Soon','soon'];return ['Active','active']}
async function archiveExpiredDocuments(){return}
function renderDocFlipCard(d){
 const [status,cls]=docStatus(d),title=docTypeLabel(d),icon=d.document_type==='insurance'?'🛡️':d.document_type==='puc'?'🌿':d.document_type==='rc'?'📘':'📄';
 const meta=d.document_type==='insurance'?(car.insurance_number||'Policy number not recorded'):d.document_type==='puc'?((car.puc_state||'State')+' • '+(car.puc_validity_months?car.puc_validity_months+' months':'Validity not recorded')):d.document_type==='rc'?'Registration Certificate':(d.document_name||'Vehicle document');
 const pathArg=JSON.stringify(d.storage_path),nameArg=JSON.stringify(d.file_name),idArg=JSON.stringify(d.id),typeArg=JSON.stringify(d.document_type);
 const renew=(d.document_type==='insurance'||d.document_type==='puc')?'<button class="primary" onclick="event.stopPropagation();openDocUploader('+typeArg+')">Renew</button>':'';
 return `<div class="flip-card doc-flip-card" tabindex="0"><div class="flip-inner"><div class="flip-front"><div class="doc-card-top"><span class="doc-card-icon">${icon}</span><span class="doc-badge ${cls}">${status}</span></div><b>${esc(title)}</b><small>${esc(meta)}</small><em>${esc(d.document_expiry?'Expiry '+d.document_expiry:'No expiry required')}</em></div><div class="flip-back"><b>${esc(title)}</b><small>${esc(d.file_name)}</small><div class="doc-flip-actions"><button class="ghost" onclick="event.stopPropagation();openDocumentPreview(${pathArg},${nameArg})">Preview</button><button class="ghost" onclick="event.stopPropagation();downloadDoc(${pathArg})">Download</button>${renew}${!d.archived_at?'<button class="danger doc-delete" '+(deletePasswordChanged()?'':'disabled')+' onclick="event.stopPropagation();deleteDoc('+idArg+','+pathArg+')">Delete</button>':''}</div></div></div></div>`;
}
function renderDocRow(d){
 let [status,cls]=docStatus(d),title=docTypeLabel(d);
 return '<div class="doc-row '+cls+'"><div class="doc-icon">'+(d.document_type==='insurance'?'🛡️':d.document_type==='puc'?'🌿':d.document_type==='rc'?'📘':'📄')+'</div><div class="doc-main"><b>'+esc(title)+'</b><span>'+esc(d.file_name)+'</span><small>Uploaded: '+new Date(d.created_at).toLocaleDateString()+'</small>'+(d.document_expiry?'<span class="doc-expiry">'+(status==='Expired'?'Expired on':'Expiry')+' '+esc(d.document_expiry)+'</span>':'')+'<span class="doc-badge '+cls+'">'+status+'</span>'+(d.archived_at?'<em>Archive: '+esc(d.archive_name||'Year Wise')+'</em>':'')+'</div><div class="doc-actions"><button class="ghost" onclick="openDocumentPreview(\''+d.storage_path.replace(/'/g,"\\'")+'\',\''+d.file_name.replace(/'/g,"\\'")+'\')">Preview</button><button class="ghost" onclick="downloadDoc(\''+d.storage_path.replace(/'/g,"\\'")+'\')">Download</button><button class="danger doc-delete" '+(deletePasswordChanged()?'':'disabled')+' onclick="deleteDoc(\''+d.id+'\',\''+d.storage_path.replace(/'/g,"\\'")+'\','+(d.archived_at?'true':'false')+')">Delete</button></div></div>'}
async function docsView(){if(!car)return;let active=docs.filter(d=>!d.archived_at),arch=docs.filter(d=>d.archived_at),groups={insurance:[],puc:[],rc:[],other:[]};active.forEach(d=>(groups[d.document_type]||groups.other).push(d));let html='<div class="doc-grid">';[['rc','Registration Certificate','📘'],['puc','PUC','🌿'],['insurance','Insurance','🛡️'],['other','Other Documents','📄']].forEach(([key,label,icon])=>{html+='<div class="doc-col"><div class="doc-col-head"><div><span class="doc-col-icon">'+icon+'</span><b>'+label+'</b></div><span>'+groups[key].length+'</span></div>'+(groups[key].length?'<div class="doc-flip-grid">'+groups[key].map(renderDocFlipCard).join('')+'</div>':'<div class="doc-empty">No '+label+' document</div>')+'</div>'});html+='</div>';if(!deletePasswordChanged())html+='<div class="doc-security-notice">🔒 Please change default password to unlock delete actions.</div>';if(arch.length){let by={};arch.forEach(d=>{let k=d.archive_name||('Archive-'+fyLabel(d.document_expiry||d.created_at));(by[k]??=[]).push(d)});html+='<div class="doc-archive"><div class="doc-archive-head">📁 Archived Documents</div>'+Object.keys(by).sort().reverse().map(k=>'<details><summary>'+esc(k)+' <span>'+by[k].length+'</span></summary>'+by[k].map(renderDocRow).join('')+'</details>').join('')+'</div>'}$('docList').innerHTML=html;if(active.some(d=>docExpired(d))&&window.__expiryPopupFor!==car.id){window.__expiryPopupFor=car.id;showDocumentExpiryPopup()}}
function showDocumentExpiryPopup(){
 if(document.getElementById('docExpiryPopup'))return;
 let expired=docs.filter(d=>docExpired(d)&&!d.archived_at);
 let firstType=expired[0]?.document_type||'';
 let names=expired.map(d=>docTypeLabel(d)+' for Vehicle '+(car?.registration_no||'')).join(' and ');
 let w=document.createElement('div');w.id='docExpiryPopup';
 w.innerHTML='<div class="doc-popup"><div class="doc-popup-icon">⚠️</div><h3>Document Expired</h3><p>Your '+esc(names)+' expired. Please upload the new document to stay compliant.</p><button class="primary" id="docExpiryRenew">＋ Renew / Upload New Document</button><button class="ghost" id="docExpiryLater">Later</button></div>';
 document.body.appendChild(w);
 $('docExpiryRenew').onclick=()=>{w.remove();openDocUploader(firstType)};
 $('docExpiryLater').onclick=()=>w.remove();
}
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
 m.innerHTML='<div class="doc-upload-card" role="dialog" aria-modal="true"><div class="toolbar"><div><h3 id="docUploadTitle">Upload Vehicle Document</h3><p class="muted">Maximum 10 MB. Allowed files: PDF, JPG, JPEG, PNG. Insurance/PUC expiry is entered manually; RC expiry is calculated from Issue Date + vehicle fuel type.</p></div><button class="ghost" id="docUploadClose" type="button">✕</button></div><div class="form"><div class="field"><label>Document Type *</label><select id="docType"><option value="rc">Registration Certificate</option><option value="puc">PUC</option><option value="insurance">Insurance</option><option value="other">Other</option></select></div><div class="field" id="docNameWrap" style="display:none"><label>Document Name *</label><input id="docName" placeholder="e.g. Fastag / Permit / Fitness Certificate"></div><div class="field"><label>Issue Date <span id="docIssueReq">*</span></label><input id="docIssue" type="date"></div><div class="field" id="docExpiryWrap" style="display:none"><label>Expiry Date *</label><input id="docExpiry" type="date"></div><div class="field full" id="rcValidityInfo" style="display:none"><div class="rc-auto-box">RC validity: <b id="rcValidityYears"></b> years • Calculated expiry: <b id="rcCalculatedExpiry">—</b></div></div><div class="field full"><label>Select File *</label><input id="docFile" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"><small class="muted">Security limit: 10 MB • PDF/JPG/JPEG/PNG only.</small></div><div class="full"><button class="primary" id="docUploadBtn" type="button"><span class="upload-btn-label">UPLOAD DOCUMENT</span></button></div></div></div>';
 document.body.appendChild(m);
 if(['rc','puc','insurance','other'].includes(preselectedType))$('docType').value=preselectedType;
 const updateFields=()=>{
   let t=$('docType').value,rc=t==='rc',expiry=t==='insurance'||t==='puc';
   $('docNameWrap').style.display=t==='other'?'block':'none';
   $('docExpiryWrap').style.display=expiry?'block':'none';
   $('docIssueReq').textContent=(rc||t==='insurance'||t==='puc')?'*':'';
   $('rcValidityInfo').style.display=rc?'block':'none';
   if(rc){$('rcValidityYears').textContent=rcValidityYears(car?.fuel);let x=calculateRcExpiry($('docIssue').value,car?.fuel);$('rcCalculatedExpiry').textContent=x?formatDateNice(x):'—'}
 };
 $('docType').onchange=updateFields;$('docIssue').oninput=updateFields;updateFields();if(preselectedType)$('docUploadTitle').textContent=preselectedType==='insurance'?'Renew Insurance':preselectedType==='puc'?'Renew PUC':preselectedType==='rc'?'Replace Registration Certificate':'Upload Vehicle Document';
 $('docUploadClose').onclick=()=>m.remove();
 m.onclick=e=>{if(e.target===m&&$('docUploadBtn')&&!$('docUploadBtn').disabled)m.remove()};
 $('docUploadBtn').onclick=async()=>{
   let btn=$('docUploadBtn'),label=btn.querySelector('.upload-btn-label');if(btn.disabled)return;
   btn.disabled=true;btn.classList.add('is-uploading');label.innerHTML='<span class="inline-spinner"></span> UPLOADING...';
   let t=$('docType').value,n=t==='other'?$('docName').value.trim():'',issue=$('docIssue').value||null;
   let e=(t==='rc')?calculateRcExpiry(issue,car?.fuel):((t==='insurance'||t==='puc')?$('docExpiry').value:'');
   let f=$('docFile').files[0];
   const MAX_FILE_SIZE=10*1024*1024;
   const ALLOWED_MIME=new Set(['application/pdf','image/jpeg','image/png']);
   const ALLOWED_EXT=new Set(['pdf','jpg','jpeg','png']);
   const fail=(msg)=>{btn.disabled=false;btn.classList.remove('is-uploading');label.textContent='UPLOAD DOCUMENT';toast(msg,'error')};
   if(!f||!car)return fail('Failed to upload document. Select a file.');
   if(f.size<=0)return fail('Failed to upload document. The selected file is empty.');
   if(f.size>MAX_FILE_SIZE)return fail('File is too large. Maximum allowed size is 10 MB.');
   let ext=(f.name.split('.').pop()||'').toLowerCase();
   if(!ALLOWED_MIME.has(f.type)||!ALLOWED_EXT.has(ext))return fail('Unsupported file. Only PDF, JPG, JPEG and PNG files are allowed.');
   if(t==='other'&&!n)return fail('Failed to upload Other Document. Enter document name.');
   if((t==='rc'||t==='insurance'||t==='puc')&&!issue)return fail('Failed to upload '+(t==='rc'?'Registration Certificate':t==='insurance'?'Insurance Document':'PUC Certificate')+'. Issue Date is required.');
   if((t==='insurance'||t==='puc')&&!e)return fail('Failed to upload '+(t==='insurance'?'Insurance Document':'PUC Certificate')+'. Expiry date is required.');
   let oldDoc=(t==='rc'||t==='insurance'||t==='puc')?docs.find(d=>d.document_type===t&&!d.archived_at):null;
   let oldPatch=t==='insurance'?{insurance_expiry:car.insurance_expiry}:t==='puc'?{puc_expiry:car.puc_expiry}:null;
   let path=user.id+'/'+car.id+'/active/'+t+'/'+crypto.randomUUID()+'-'+f.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-180);
   let storageUploaded=false,newDocId=null,archived=false,activated=false,complianceUpdated=false;
   try{
     let u=await db.storage.from('car-documents').upload(path,f,{contentType:f.type,upsert:false});
     if(u.error)throw new Error('Secure file upload failed: '+u.error.message);
     storageUploaded=true;
     // Insert as inactive first so Step 2's one-active-per-type index remains compatible.
     let ins=await db.from('documents').insert({user_id:user.id,car_id:car.id,file_name:f.name,storage_path:path,mime_type:f.type,file_size:f.size,document_type:t,document_name:n||null,document_expiry:e||null,active:false}).select('id').single();
     if(ins.error)throw new Error('Document record save failed: '+ins.error.message);
     newDocId=ins.data.id;
     if(oldDoc){
       let folder=docTypeLabel(oldDoc)+'-'+fyLabel(oldDoc.document_expiry||oldDoc.created_at);
       let au=await db.from('documents').update({archive_name:folder,archived_at:new Date().toISOString(),active:false}).eq('id',oldDoc.id).eq('car_id',car.id).eq('user_id',user.id).is('archived_at',null);
       if(au.error)throw new Error('Old document could not be archived: '+au.error.message);
       archived=true;
     }
     let activate=await db.from('documents').update({active:true,archived_at:null}).eq('id',newDocId).eq('car_id',car.id).eq('user_id',user.id);
     if(activate.error)throw new Error('New document could not be activated: '+activate.error.message);
     activated=true;
     if(t==='insurance'||t==='puc'){
       let patch=t==='insurance'?{insurance_expiry:e}:{puc_expiry:e};
       let cr=await db.from('cars').update(patch).eq('id',car.id).eq('user_id',user.id);
       if(cr.error)throw new Error('Document saved, but vehicle compliance date could not be synced: '+cr.error.message);
       Object.assign(car,patch);complianceUpdated=true;
     }
     let refreshError=null;
     try{await loadData()}catch(refreshErrCaught){refreshError=refreshErrCaught}
     // The upload transaction is complete at this point. Close only after success;
     // a list-refresh problem must not roll back a successfully saved document.
     m.remove();
     let name=t==='rc'?'Registration Certificate':t==='puc'?'PUC Certificate':t==='insurance'?'Insurance Document':'Document';
     toast(t==='rc'?('Registration Certificate uploaded successfully! Valid until '+formatDateNice(e)+'.'):name+' uploaded successfully!');
     if(refreshError)toast('Document saved, but the document list could not refresh. Please refresh the page.','error');
   }catch(err){
     // Best-effort rollback keeps a failed replacement from leaving a ghost file/record or wrong compliance date.
     if(complianceUpdated&&oldPatch)await db.from('cars').update(oldPatch).eq('id',car.id).eq('user_id',user.id);
     if(newDocId)await db.from('documents').delete().eq('id',newDocId).eq('car_id',car.id).eq('user_id',user.id);
     if(archived&&oldDoc)await db.from('documents').update({archive_name:null,archived_at:null,active:true}).eq('id',oldDoc.id).eq('car_id',car.id).eq('user_id',user.id);
     if(storageUploaded)await db.storage.from('car-documents').remove([path]);
     toast('Failed to upload '+(t==='rc'?'Registration Certificate':t==='insurance'?'Insurance Document':t==='puc'?'PUC Certificate':'Document')+'. '+(err?.message||'Please try again.'),'error');
   }finally{
     if(document.body.contains(btn)){btn.disabled=false;btn.classList.remove('is-uploading');label.textContent='UPLOAD DOCUMENT'}
   }
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
 if(!id||!path||!car)return toast('Document delete request is invalid.','error');
 let target=docs.find(d=>d.id===id&&d.car_id===car.id);
 if(!target)return toast('Document was not found for this vehicle. Refresh and try again.','error');
 if(target.storage_path!==path)return toast('Document path verification failed. Refresh and try again.','error');
 let p=prompt('Enter your 4-character security PIN to confirm permanent deletion.','');
 if(p===null)return;
 let saved=localStorage.getItem('carcare_delete_password');
 if(!saved||p.trim()!==saved)return toast('Invalid Security PIN. Document was not deleted.','error');
 if(!confirm((isArchived?'Delete this archived document permanently from the server?':'Delete this document permanently?')+' This cannot be undone.'))return;
 let btns=[...document.querySelectorAll('.doc-delete')].filter(b=>b.offsetParent!==null);
 btns.forEach(b=>b.disabled=true);
 try{
   // Database RLS verifies both document ownership and parent vehicle ownership.
   // Storage RLS independently verifies user + vehicle folder ownership.
   let r=await db.from('documents').delete().eq('id',target.id).eq('car_id',car.id).eq('user_id',user.id).select('id').maybeSingle();
   if(r.error)throw new Error('Database authorization/deletion failed: '+r.error.message);
   if(!r.data)throw new Error('Document could not be deleted. Server authorization rejected the request.');
   let s=await db.storage.from('car-documents').remove([target.storage_path]);
   if(s.error){
     // Restore the DB row if the file could not be removed, so a failed delete is retryable.
     let restore=await db.from('documents').insert({
       id:target.id,user_id:target.user_id,car_id:target.car_id,file_name:target.file_name,
       storage_path:target.storage_path,mime_type:target.mime_type,file_size:target.file_size,
       document_type:target.document_type,document_name:target.document_name,document_expiry:target.document_expiry,
       archive_name:target.archive_name,archived_at:target.archived_at,active:target.active
     });
     if(restore.error)throw new Error('Storage deletion failed and the database restore also failed. Do not retry repeatedly; refresh and verify the document: '+s.error.message);
     throw new Error('Server file deletion failed; document was restored safely. '+s.error.message);
   }
   toast((isArchived?'Archived document':'Document')+' deleted permanently from server!');
   await loadData();
 }catch(err){
   toast(err?.message||'Document deletion failed.','error');
 }finally{
   btns.forEach(b=>b.disabled=false);
 }
}
async function pickInsuranceCompany(current=''){return new Promise(resolve=>{let old=document.getElementById('insurancePicker');if(old)old.remove();let wrap=document.createElement('div');wrap.id='insurancePicker';wrap.style='position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(5px);display:grid;place-items:center;z-index:100';wrap.innerHTML='<div style="background:#fff;padding:22px;border-radius:18px;width:min(420px,calc(100% - 30px));box-shadow:0 25px 70px rgba(15,23,42,.25)"><h3 style="margin:0 0 12px">Select Insurance Company *</h3><select id="insurancePickerSelect" style="width:100%;padding:12px;border:1px solid #e5e7eb;border-radius:10px">'+insuranceCompanies.map(x=>'<option>'+esc(x)+'</option>').join('')+'</select><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="ghost" id="insurancePickerCancel">Cancel</button><button class="primary" id="insurancePickerOk">Select</button></div></div>';document.body.appendChild(wrap);let sel=document.getElementById('insurancePickerSelect');sel.value=insuranceCompanies.includes(current)?current:'Not Available';document.getElementById('insurancePickerCancel').onclick=()=>{wrap.remove();resolve(null)};document.getElementById('insurancePickerOk').onclick=()=>{let v=sel.value;wrap.remove();resolve(v)};sel.focus()})}
async function ensureRequiredCarDetails(){if(!car){toast('Please add a car first');await nav('cars');return false}let missing=[];if(!car.registration_no)missing.push('Registration Number');if(!car.make_model)missing.push('Make / Model');if(!car.model_year)missing.push('Model Year');if(!car.fuel)missing.push('Fuel Type');if(!car.insurance_company||car.insurance_company==='Not Available')missing.push('Insurance Company');if(!car.insurance_expiry)missing.push('Insurance Expiry');if(!car.puc_state||!car.puc_expiry)missing.push('PUC State / PUC Expiry');if(!car.insurance_number)missing.push('Insurance Policy Number');if(!Array.isArray(car.insurance_type)||car.insurance_type.length<2)missing.push('Insurance Type (minimum 2)');if(!car.puc_certificate_no)missing.push('PUC Number');if(!car.puc_validity_months)missing.push('PUC Validity');if(!missing.length)return true;let msg='Required information missing:\n\n• '+missing.join('\n• ')+'\n\nPlease complete the required vehicle details.';if(!confirm(msg))return false;let ok=await window.editCar();if(!ok)return false;return !!car.make_model&&!!car.model_year&&!!car.fuel&&!!car.insurance_company&&car.insurance_company!=='Not Available'&&!!car.insurance_expiry&&!!car.insurance_number&&Array.isArray(car.insurance_type)&&car.insurance_type.length>=2&&!!car.puc_state&&!!car.puc_certificate_no&&!!car.puc_validity_months&&!!car.puc_expiry}
async function saveRequiredCarDetails(p){let r=await db.from('cars').update(p).eq('id',car.id);if(r.error)return toast(r.error.message);Object.assign(car,p);await loadData();toast('Required car information updated')}
window.openAddRecord=async()=>{if(!(await ensureRequiredCarDetails()))return;await nav('add')};
function report(){if(!car)return;let total=records.reduce((s,r)=>s+Number(r.total_cost||0),0),types=(car.insurance_type||[]).join(' • ')||'—',addons=(car.insurance_addons||[]).join(', ')||'None';$('reportArea').innerHTML='<div class="report-sheet"><div class="report-head"><div><div class="report-kicker">CARCARE CLOUD</div><h1>Vehicle Service Report</h1><p>Complete vehicle, insurance, PUC and service history</p></div><div class="report-reg">'+esc(car.registration_no)+'</div></div><div class="report-section"><div class="report-section-title">VEHICLE DETAILS</div><div class="report-grid"><div><span>Make / Model</span><b>'+esc(car.make_model||'—')+'</b></div><div><span>Model Year</span><b>'+esc(car.model_year||'—')+'</b></div><div><span>Fuel Type</span><b>'+esc(car.fuel||'—')+'</b></div><div><span>Current KM</span><b>'+esc(car.current_km||'0')+'</b></div><div><span>VIN / Chassis</span><b>'+esc(car.vin||'—')+'</b></div><div><span>Engine No.</span><b>'+esc(car.engine_no||'—')+'</b></div></div></div><div class="report-two"><div class="report-panel"><div class="report-section-title">INSURANCE</div><div class="report-line"><span>Company</span><b>'+esc(car.insurance_company||'—')+'</b></div><div class="report-line"><span>Policy Number</span><b>'+esc(car.insurance_number||'—')+'</b></div><div class="report-line"><span>Type</span><b>'+esc(types)+'</b></div><div class="report-line"><span>Add-ons</span><b>'+esc(addons)+'</b></div><div class="report-line"><span>Expiry</span><b>'+esc(car.insurance_expiry||'—')+'</b></div></div><div class="report-panel"><div class="report-section-title">PUC</div><div class="report-line"><span>Certificate Number</span><b>'+esc(car.puc_certificate_no||'—')+'</b></div><div class="report-line"><span>State</span><b>'+esc(car.puc_state||'—')+'</b></div><div class="report-line"><span>Validity</span><b>'+esc(car.puc_validity_months?car.puc_validity_months+' Months':'—')+'</b></div><div class="report-line"><span>Expiry</span><b>'+esc(car.puc_expiry||'—')+'</b></div></div></div><div class="report-section"><div class="report-section-title">SERVICE & REPAIR HISTORY</div><table class="report-table"><thead><tr><th>Date</th><th>KM</th><th>Type</th><th>Work</th><th>Cost</th></tr></thead><tbody>'+records.map(r=>'<tr><td>'+esc(r.service_date)+'</td><td>'+esc(r.odometer_km)+'</td><td>'+esc(r.record_type)+'</td><td>'+esc(r.description||'')+(r.record_items?.length?'<small>'+esc(r.record_items.map(x=>x.item_name).join(', '))+'</small>':'')+'</td><td>'+money(r.total_cost)+'</td></tr>').join('')+'</tbody></table><div class="report-total"><span>Total Service Cost</span><b>'+money(total)+'</b></div></div><div class="report-footer"><span>Generated by CarCare Cloud</span><span>'+new Date().toLocaleDateString()+'</span></div></div>'}
waitForSupabase();
window.editCar=async()=>{if(!car)return false;let old=document.getElementById('editCarModal');if(old)old.remove();let years='';let maxYear=new Date().getFullYear()+1;for(let y=maxYear;y>=1980;y--)years+='<option value="'+y+'">'+y+'</option>';let modal=document.createElement('div');modal.id='editCarModal';modal.style='position:fixed;inset:0;background:rgba(15,23,42,.48);backdrop-filter:blur(6px);display:grid;place-items:center;z-index:100;padding:15px';modal.innerHTML='<div class="edit-modal-card"><div class="toolbar"><div><h2 style="margin:0">Edit Car / Insurance / PUC</h2><p class="muted">Update vehicle details. Fields marked * are required.</p></div><button class="ghost" id="editCarCancel">Cancel</button></div><div class="form"><div class="field"><label>Registration Number *</label><input id="ecReg" value="'+esc(car.registration_no||'')+'" readonly></div><div class="field"><label>Make / Model *</label><input id="ecModel" value="'+esc(car.make_model||'')+'" required></div><div class="field"><label>Model Year *</label><select id="ecYear" required><option value="">Select Year</option>'+years+'</select></div><div class="field"><label>Fuel Type *</label><select id="ecFuel" required><option value="">Select</option><option>Petrol</option><option>Diesel</option><option>CNG</option><option>Hybrid</option><option>Electric</option></select></div><div class="field"><label>VIN / Chassis No. (Optional)</label><input id="ecVin" value="'+esc(car.vin||'')+'"></div><div class="field"><label>Engine No. (Optional)</label><input id="ecEngine" value="'+esc(car.engine_no||'')+'"></div><div class="field full"><label>Insurance Type * <span class="muted">(minimum 2)</span></label><div class="choice-grid" id="ecInsType">'+insuranceTypes.map(x=>'<label class="choice-card"><input type="checkbox" value="'+esc(x)+'"><span class="choice-check">✓</span><span>'+esc(x)+'</span></label>').join('')+'</div><small class="muted">Select at least 2 options.</small></div><div class="field full"><label>Insurance Add-ons (Optional)</label><div class="choice-grid" id="ecInsAddons">'+insuranceAddons.map(x=>'<label class="choice-card"><input type="checkbox" value="'+esc(x)+'"><span class="choice-check">✓</span><span>'+esc(x)+'</span></label>').join('')+'</div><small class="muted">Optional — select any add-ons that apply.</small></div><div class="field"><label>Insurance Company *</label><select id="ecIns" required>'+insuranceCompanies.map(x=>'<option>'+esc(x)+'</option>').join('')+'</select></div><div class="field"><label>Insurance Policy Number *</label><input id="ecInsNo" value="'+esc(car.insurance_number||'')+'"></div><div class="field"><label>Insurance Expiry *</label><input id="ecInsExp" type="date" value="'+esc(car.insurance_expiry||'')+'" required></div><div class="field"><label>PUC *</label><select id="ecPuc" required><option value="">Select</option><option value="yes">Yes</option><option value="no">No</option></select></div><div class="field" id="ecPucNoWrap"><label>PUC Number *</label><input id="ecPucNo" value="'+esc(car.puc_certificate_no||'')+'"></div><div class="field" id="ecPucStateWrap"><label>PUC State *</label><select id="ecPucState" required><option value="">Select State</option>'+pucStates.map(x=>'<option>'+x+'</option>').join('')+'</select></div><div class="field" id="ecPucValidityWrap"><label>PUC Validity *</label><select id="ecPucValidity"><option value="">Select</option><option value="6">6 Months</option><option value="12">12 Months</option></select></div><div class="field" id="ecPucExpWrap"><label>PUC Expiry *</label><input id="ecPucExp" type="date" value="'+esc(car.puc_expiry||'')+'" required></div><div class="field"><label>Current KM</label><input id="ecKm" type="number" min="0" value="'+esc(car.current_km||0)+'"></div><div class="full"><button class="primary" id="ecSave">SAVE CHANGES</button></div></div></div>';document.body.appendChild(modal);$('ecYear').value=car.model_year?String(car.model_year):'';$('ecFuel').value=car.fuel||'';$('ecIns').value=insuranceCompanies.includes(car.insurance_company)?car.insurance_company:'Not Available';let oldTypes=Array.isArray(car.insurance_type)?car.insurance_type:[];let oldAddons=Array.isArray(car.insurance_addons)?car.insurance_addons:[];document.querySelectorAll('#ecInsType input[type="checkbox"]').forEach(o=>o.checked=oldTypes.includes(o.value));document.querySelectorAll('#ecInsAddons input[type="checkbox"]').forEach(o=>o.checked=oldAddons.includes(o.value));$('ecPuc').value=(car.puc_state||car.puc_certificate_no||car.puc_expiry)?'yes':'';$('ecPucNo').value=car.puc_certificate_no||'';$('ecPucState').value=car.puc_state||'';$('ecPucValidity').value=car.puc_validity_months?String(car.puc_validity_months):'';let setPucVisibility=()=>{let yes=$('ecPuc').value==='yes';['ecPucNoWrap','ecPucStateWrap','ecPucValidityWrap','ecPucExpWrap'].forEach(id=>$(id).style.display=yes?'block':'none')};setPucVisibility();let resolveDone;let resultPromise=new Promise(resolve=>resolveDone=resolve);let finished=false;const finish=v=>{if(finished)return;finished=true;if(document.body.contains(modal))modal.remove();resolveDone(v)};$('editCarCancel').onclick=()=>finish(false);$('ecIns').onchange=()=>{};$('ecPuc').onchange=setPucVisibility;$('ecSave').onclick=async()=>{let model=$('ecModel').value.trim(),year=$('ecYear').value,fuel=$('ecFuel').value,ins=$('ecIns').value,insNo=$('ecInsNo').value.trim(),ie=$('ecInsExp').value,puc=$('ecPuc').value,pucNo=puc==='yes'?$('ecPucNo').value.trim():'',pucState=puc==='yes'?$('ecPucState').value:'',pucValidity=puc==='yes'?$('ecPucValidity').value:'',pe=puc==='yes'?$('ecPucExp').value:'',km=$('ecKm').value,insTypes=selectedChoices('ecInsType'),insAddons=selectedChoices('ecInsAddons');if(!model||!year||!fuel||!ins||!ie||!insNo||insTypes.length<2)return toast('Please complete all required (*) fields. Insurance Type needs minimum 2 selections.');let invalidInsurance=ins==='Not Available',invalidPuc=puc!=='yes'||!pucNo||!pucState||!pucValidity||!pe;if(invalidInsurance||invalidPuc){toast(invalidInsurance?'Insurance Company cannot be Not Available.':(!pucNo||!pucState||!pucValidity||!pe?'Please complete all required PUC details.':'Please complete all required vehicle details.'),'error');return}let payload={make_model:model,model_year:+year,fuel,current_km:km?+km:0,vin:$('ecVin').value.trim()||null,engine_no:$('ecEngine').value.trim()||null,insurance_company:ins,insurance_number:insNo,insurance_type:insTypes,insurance_addons:insAddons,insurance_expiry:ie,puc_certificate_no:pucNo,puc_state:pucState,puc_validity_months:+pucValidity,puc_expiry:pe};let r=await db.from('cars').update(payload).eq('id',car.id);if(r.error)return toast(r.error.message);Object.assign(car,payload);finish(true);updateCarTab();toast('Car details updated');await loadCars();let fresh=cars.find(x=>x.id===car.id);if(fresh)car=fresh;await loadData()};return resultPromise};window.openCarEdit=()=>window.editCar();
async function openReportAndPrint(){await nav('report');setTimeout(()=>window.print(),350)}
window.openReportAndPrint=openReportAndPrint;


/* ===== Historical Import — Preview, Validation & Atomic Import ===== */
let historicalImportDraft=null;
let historicalImportSelectedWarning=null;

function openHistoricalImport(){
  let old=document.getElementById('historicalImportModal');if(old)old.remove();
  const m=document.createElement('div');m.id='historicalImportModal';m.className='history-import-modal';
  m.innerHTML='<div class="history-import-card history-import-final-card"><div class="history-import-head"><div><span class="panel-kicker">HISTORICAL DATA</span><h2>Import Old History — Preview Mode</h2><p class="muted">Nothing is saved until all warnings are resolved and you approve the import.</p></div><button class="ghost" id="hiClose">✕</button></div><div class="history-import-grid history-import-final-grid"><div class="history-import-left"><div class="hi-left-toolbar"><label>PARSED RECORDS</label><span id="hiRecordCount" class="hi-toolbar-count">0 records</span></div><div id="hiRecords" class="history-import-list hi-record-list"><div class="history-import-empty"><b>Preview will appear here</b><span>Paste your history below and click BUILD PREVIEW.</span></div></div><label>RAW HISTORY</label><textarea id="hiRaw" class="history-import-text" placeholder="Paste your old service, PUC, insurance and claim history here…"></textarea><div class="history-import-note">Original dates, KM, invoice numbers, vendors and source wording are preserved. Any user-approved correction is explicitly marked as adjusted.</div><button class="primary" id="hiParse">BUILD PREVIEW</button></div><div class="history-import-right"><div id="hiResolver" class="hi-resolver"><div class="history-import-empty"><b>Warning resolver</b><span>Select a warning from the left list.</span></div></div></div></div><div id="hiStatus" class="history-import-status"></div><div class="history-import-actions"><button class="ghost" id="hiCloseBottom">CLOSE</button><button class="primary" id="hiApprove" disabled>🔒 APPROVE &amp; IMPORT HISTORY</button></div></div>';
  document.body.appendChild(m);
  $('hiClose').onclick=()=>m.remove();
  $('hiCloseBottom').onclick=()=>m.remove();
  $('hiParse').onclick=()=>buildHistoricalPreview($('hiRaw').value);
  m.onclick=e=>{if(e.target===m)m.remove()};
}

function hiDate(s){
  if(!s)return null;
  let raw=String(s).trim().replace(/\*/g,'');
  let m=raw.match(/^(\d{1,2})[\\/-](\d{1,2})[\\/-](\d{4})$/);
  if(m)return m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0');
  m=raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m)return m[1]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[3]).padStart(2,'0');
  m=raw.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if(m){const months={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};const mo=months[m[1].toLowerCase()];if(mo)return m[3]+'-'+String(mo).padStart(2,'0')+'-'+String(m[2]).padStart(2,'0')}
  const parsed=Date.parse(raw);
  if(!Number.isNaN(parsed)){const d=new Date(parsed);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  return null;
}
function hiMoney(s){if(s===undefined||s===null)return 0;let m=String(s).replace(/,/g,'').match(/[\d]+(?:\.\d+)?/);return m?Number(m[0]):0}
function hiNum(s){let m=String(s||'').replace(/,/g,'').match(/[\d]+(?:\.\d+)?/);return m?Number(m[0]):null}
function hiLines(raw){return String(raw||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean)}
function hiFindDate(line){
  const s=String(line||'');
  let m=s.match(/(\d{1,2}[\\/-]\d{1,2}[\\/-]\d{4})/);if(m)return hiDate(m[1]);
  m=s.match(/([A-Za-z]+\s+\d{1,2},\s*\d{4})/);if(m)return hiDate(m[1]);
  m=s.match(/\b(\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/);if(m)return hiDate(m[1]);
  return null;
}
function hiPolicyPeriod(s){
  const hits=[...String(s||'').matchAll(/(\d{1,2}[\\/-]\d{1,2}[\\/-]\d{4})/g)].map(x=>hiDate(x[1])).filter(Boolean);
  return {issue:hits[0]||null,expiry:hits[1]||null};
}

function hiParseRecords(raw){
  const lines=hiLines(raw),out=[],warnings=[];
  let section='',current=null;
  const addWarning=w=>{if(w&&!warnings.some(x=>x.message===w.message))warnings.push(w)};
  const push=()=>{
    if(!current)return;
    if(!current.date){current=null;return;}
    if(current.kind==='record'||current.kind==='claim'){
      const itemSum=(current.items||[]).reduce((sum,x)=>sum+Number(x.cost||0),0);
      const invoice=Number(current.original_invoice_total??current.total_cost??0);
      current.original_invoice_total=invoice||null;
      if(!Number(current.parts_cost||0)&&itemSum>0&&!current.explicit_parts)current.parts_cost=itemSum;
      const subtotal=Number(current.parts_cost||0)+Number(current.labour_cost||0)+Number(current.other_cost||0);
      current.reconciliation_adjustment=invoice?invoice-subtotal:0;
      if(invoice&&Math.abs(current.reconciliation_adjustment)>0.01){
        current.audit_note='Original invoice ₹'+invoice.toLocaleString('en-IN')+' differs from itemized subtotal ₹'+subtotal.toLocaleString('en-IN')+'. Pending user resolution.';
        addWarning({type:'financial',recordId:hiRecordId(current),message:'Financial gap: original invoice ₹'+invoice.toLocaleString('en-IN')+' vs itemized subtotal ₹'+subtotal.toLocaleString('en-IN')+'.',recordId:hiRecordId(current)});
      }else current.audit_note=null;
    }
    current.source='historical_import';
    current.import_batch_id=historicalImportDraft?.import_batch_id||null;
    out.push(current);current=null;
  };
  const newCurrent=(kind,recordType)=>{
    push();
    current={kind,date:null,odometer_km:null,is_km_estimated:false,record_type:recordType||'Other',subcategory:null,workshop:null,invoice_number:null,description:null,parts_cost:0,labour_cost:0,other_cost:0,total_cost:0,original_invoice_total:null,reconciliation_adjustment:0,audit_note:null,items:[],odometer_resolution:null,odometer_adjusted:false};
    if(kind==='claim')current.record_type='Accident / Repair';
    if(kind==='insurance')current.record_type='Insurance Policy';
    if(kind==='puc')current.record_type='PUC';
  };
  for(const l of lines){
    const clean=l.replace(/^\*+\s*|\s*\*+$/g,'').trim();
    if(/^CARMY\s*-\s*RAW HISTORICAL VEHICLE DATA/i.test(clean)||/^VEHICLE\s*:/i.test(clean)||/^IMPORTANT\s*:/i.test(clean)||/^DATA INTEGRITY RULES/i.test(clean)||/^={3,}$/i.test(clean)||/^\d+\.\s*(PERIODIC|VEHICLE INSURANCE|INSURANCE CLAIMS|PUC RECORDS|REGULAR SERVICE)/i.test(clean)){if(/^DATA INTEGRITY RULES/i.test(clean))push();continue;}
    if(/^SERVICE\s*#?\s*\d+/i.test(clean)){section='service';newCurrent('record','Regular Service');continue;}
    if(/^BATTERY(?: REPLACEMENT)?$/i.test(clean)){section='battery';newCurrent('record','Other');current.subcategory='Battery Replacement';continue;}
    if(/^TYRE\s*REPLACEMENT$/i.test(clean)||/^TYRES?$/i.test(clean)){section='tyre';newCurrent('record','Other');current.subcategory='Tyre Replacement';continue;}
    if(/^PUC\s*\d+/i.test(clean)){section='puc';newCurrent('puc','PUC');continue;}
    if(/^PUC(?: RECORDS?| HISTORY)?$/i.test(clean)){section='puc';push();continue;}
    if(/^POLICY\s*#?\s*\d+/i.test(clean)){section='insurance';newCurrent('insurance','Insurance Policy');continue;}
    if(/^VEHICLE INSURANCE HISTORY$/i.test(clean)||/^INSURANCE HISTORY$/i.test(clean)){section='insurance';push();continue;}
    if(/^CLAIM\s*#?\s*\d+/i.test(clean)){section='claim';newCurrent('claim','Accident / Repair');continue;}
    if(/^INSURANCE CLAIMS?(?: LOG)?$/i.test(clean)){section='claim';push();continue;}
    if(/^(?:\d+\.\s*)?OTHER\s*[-:]/i.test(clean)){section='repair';newCurrent('record','Other');const mm=clean.match(/OTHER\s*[-:]\s*(.+)$/i);if(mm)current.subcategory=mm[1].trim();continue;}
    if(/^REPAIR\s*#?\s*\d+/i.test(clean)){section='repair';newCurrent('record','Other');continue;}
    if(/^PERSONAL OUT-OF-POCKET REPAIRS?\s*&?\s*PARTS REPLACEMENTS?$/i.test(clean)||/^PERSONAL OUT-OF-POCKET EXPENSES$/i.test(clean)){section='repair';push();continue;}
    if(section==='puc'&&current){
      const cells=clean.replace(/^\||\|$/g,'').split('|').map(x=>x.replace(/\*/g,'').trim());
      if(cells.length>=6&&hiFindDate(cells[0])){current.date=hiDate(cells[0]);current.odometer_km=hiNum(cells[1]);current.is_km_estimated=/est/i.test(cells[1]);current.puc_number=cells[2];current.state=(cells[3].match(/\b[A-Z]{2}\b/)||['',''])[1]||cells[3];current.valid_till=hiDate(cells[4]);current.cost=hiMoney(cells[5]);current.total_cost=current.cost;push();continue;}
    }
    if(!current)continue;
    let m;
    if(/^DATE\s*:/i.test(clean)){const d=hiFindDate(clean);if(d){if(current.date)push();if(!current)newCurrent(section==='claim'?'claim':section==='insurance'?'insurance':section==='puc'?'puc':'record',section==='claim'?'Accident / Repair':section==='insurance'?'Insurance Policy':section==='puc'?'PUC':section==='service'?'Regular Service':section==='battery'?'Other':section==='tyre'?'Other':'Other');current.date=d;continue;}}
    if(/^POLICY PERIOD\s*:/i.test(clean)){const p=hiPolicyPeriod(clean);if(p.issue)current.date=p.issue;if(p.expiry)current.valid_till=p.expiry;continue;}
    if(/^ODOMETER\s*:/i.test(clean)){const km=(clean.match(/ODOMETER\s*:\s*([0-9,]+)/i)||[])[1];if(km)current.odometer_km=hiNum(km);continue;}
    if(/^ODOMETER STATUS\s*:/i.test(clean)){if(/estimated/i.test(clean))current.is_km_estimated=true;continue;}
    m=clean.match(/^INVOICE\s*(?:NO\.?|NUMBER)?\s*:\s*(.+)$/i);if(m){current.invoice_number=m[1].trim();continue;}
    m=clean.match(/^(?:SERVICE CENTER|WORKSHOP|VENDOR|GARAGE)\s*:\s*(.+)$/i);if(m){current.workshop=m[1].trim();continue;}
    m=clean.match(/^CATEGORY\s*:\s*(.+)$/i);if(m){current.record_type=m[1].trim();continue;}
    m=clean.match(/^SUBCATEGORY\s*:\s*(.+)$/i);if(m){current.subcategory=m[1].trim();continue;}
    m=clean.match(/^(?:WORK|WORK DONE|DESCRIPTION|REASON)\s*:\s*(.+)$/i);if(m){current.description=m[1].trim();continue;}
    m=clean.match(/^INSURANCE COMPANY\s*:\s*(.+)$/i);if(m){current.company=m[1].trim();continue;}
    m=clean.match(/^POLICY NO\s*:\s*(.+)$/i);if(m){current.policy_number=m[1].trim();continue;}
    m=clean.match(/^POLICY TYPE\s*:\s*(.+)$/i);if(m){current.policy_type=m[1].trim();continue;}
    m=clean.match(/^ISSUED\s*:\s*(.+)$/i);if(m){current.issued_date=hiDate(m[1]);if(!current.date)current.date=current.issued_date;continue;}
    m=clean.match(/^LINKED CLAIM\s*:\s*(.+)$/i);if(m){current.linked_claim=m[1].trim();const lm=current.linked_claim.match(/claim\s*#?\s*(\d+)/i);if(lm)current.linked_claim_number=lm[1];continue;}
    m=clean.match(/^PREMIUM\s*:\s*₹?\s*([0-9,]+(?:\.\d+)?)/i);if(m){current.premium=hiMoney(m[1]);current.total_cost=current.premium;continue;}
    m=clean.match(/^(?:VALID UNTIL|VALID TILL|EXPIRY DATE|VALIDITY)\s*:\s*(.+)$/i);if(m){current.valid_till=hiDate(m[1]);continue;}
    m=clean.match(/^PUC CERTIFICATE NO\s*:\s*(.+)$/i);if(m){current.puc_number=m[1].trim();continue;}
    m=clean.match(/^STATE\s*:\s*(.+)$/i);if(m){current.state=m[1].trim();continue;}
    m=clean.match(/^COST PER TYRE\s*:\s*₹?\s*([0-9,]+(?:\.\d+)?)/i);if(m){current.cost_per_tyre=hiMoney(m[1]);continue;}
    m=clean.match(/^TOTAL COST\s*:\s*₹?\s*([0-9,]+(?:\.\d+)?)/i);if(m){current.total_cost=hiMoney(m[1]);continue;}
    m=clean.match(/^TOTAL CLAIM\s*:\s*₹?\s*([0-9,]+(?:\.\d+)?)/i);if(m){current.total_cost=hiMoney(m[1]);continue;}
    m=clean.match(/^TOTAL PREMIUM\s*:\s*₹?\s*([0-9,]+(?:\.\d+)?)/i);if(m){current.total_cost=hiMoney(m[1]);current.premium=current.total_cost;continue;}
    m=clean.match(/^PARTS COST\s*:\s*₹?\s*([0-9,]+(?:\.\d+)?)/i);if(m){current.parts_cost=hiMoney(m[1]);current.explicit_parts=true;continue;}
    m=clean.match(/^PARTS\s*:\s*₹?\s*([0-9,]+(?:\.\d+)?)/i);if(m){current.parts_cost=hiMoney(m[1]);current.explicit_parts=true;continue;}
    m=clean.match(/^PARTS\s*:\s*(.+)$/i);if(m){current.parts_changed=m[1].trim();continue;}
    m=clean.match(/^LABOUR(?: CHARGES| COST)?\s*:\s*₹?\s*([0-9,]+(?:\.\d+)?)/i);if(m){current.labour_cost=hiMoney(m[1]);continue;}
    m=clean.match(/^(?:MISCELLANEOUS \/ TAXES \/ ROUNDING|GST \/ TAXES \/ ROUNDING)\s*:\s*₹?\s*([0-9,]+(?:\.\d+)?)/i);if(m){current.other_cost=hiMoney(m[1]);continue;}
    m=clean.match(/^COST\s*:\s*₹?\s*([0-9,]+(?:\.\d+)?)/i);if(m&&current.kind==='puc'){current.cost=hiMoney(m[1]);current.total_cost=current.cost;continue;}
    m=clean.match(/^PAID BY\s*:\s*(.+)$/i);if(m){current.paid_by=m[1].trim();continue;}
    if(/^[-•]\s*/.test(clean)){const item=clean.replace(/^[-•]\s*/,'').trim(),itemMoney=item.match(/:\s*₹?\s*([0-9,]+(?:\.\d+)?)\s*$/);if(itemMoney){const name=item.replace(/\s*:\s*₹?\s*[0-9,]+(?:\.\d+)?\s*$/,'').trim();current.items.push({name,cost:hiMoney(itemMoney[1])});}else if(current.record_type==='Other'||current.kind==='record')current.description=current.description?current.description+'; '+item:item;continue;}
    const itemMatch=clean.match(/^(.+?)\s*:\s*₹?\s*([0-9,]+(?:\.\d+)?)\s*$/i);
    if(itemMatch){const key=itemMatch[1].trim();if(!/^(DATE|ODOMETER|INVOICE|SERVICE CENTER|WORKSHOP|VENDOR|CATEGORY|SUBCATEGORY|TOTAL COST|TOTAL CLAIM|TOTAL PREMIUM|PARTS|PARTS COST|LABOUR|PREMIUM|COST|POLICY NO|POLICY TYPE|ISSUED|LINKED CLAIM|VALID UNTIL|VALID TILL|EXPIRY DATE|MISCELLANEOUS \/ TAXES \/ ROUNDING|GST \/ TAXES \/ ROUNDING|COST PER TYRE)$/i.test(key))current.items.push({name:key,cost:hiMoney(itemMatch[2])});}
  }
  push();
  return {records:out,warnings};
}

function hiRecordId(r){return [r.kind,r.date,r.invoice_number||r.policy_number||r.puc_number||r.subcategory||r.record_type].join('|')}
function hiRevalidateDraft(){
  if(!historicalImportDraft)return;
  const rs=historicalImportDraft.records||[];
  rs.sort((a,b)=>String(a.date||'9999-99-99').localeCompare(String(b.date||'9999-99-99')));
  const warnings=[];
  const add=(w)=>{if(!warnings.some(x=>x.id===w.id))warnings.push(w)};
  for(let i=0;i<rs.length;i++){
    const r=rs[i];
    if((r.kind==='record'||r.kind==='claim')&&r.original_invoice_total!=null){
      const subtotal=Number(r.parts_cost||0)+Number(r.labour_cost||0)+Number(r.other_cost||0);
      r.reconciliation_adjustment=Number(r.original_invoice_total)-subtotal;
      if(Math.abs(r.reconciliation_adjustment)>0.01&&!r.financial_resolution){
        add({id:'fin:'+hiRecordId(r),type:'financial',recordId:hiRecordId(r),message:'Financial gap: original invoice ₹'+Number(r.original_invoice_total).toLocaleString('en-IN')+' vs itemized subtotal ₹'+subtotal.toLocaleString('en-IN')+'.'});
      }
    }
  }
  const dated=rs.filter(r=>r.date&&r.odometer_km!=null&&(r.kind==='record'||r.kind==='claim')&&!r.is_km_estimated).slice().sort((a,b)=>a.date.localeCompare(b.date));
  for(let i=1;i<dated.length;i++){
    const prev=dated[i-1],now=dated[i];
    if(Number(now.odometer_km)<Number(prev.odometer_km)&&now.odometer_resolution!=='raw_preserved'){
      add({id:'km:'+hiRecordId(now),type:'odometer',recordId:hiRecordId(now),previousId:hiRecordId(prev),message:'Odometer decreased: '+Number(now.odometer_km).toLocaleString('en-IN')+' km on '+now.date+' is below '+Number(prev.odometer_km).toLocaleString('en-IN')+' km on '+prev.date+'.'});
    }
  }
  historicalImportDraft.warnings=warnings;
  const el=$('hiStatus');
  if(el)el.innerHTML='<div><b>📊 '+rs.length+' Records Found</b><span>'+warnings.length+' Warning'+(warnings.length===1?'':'s')+' Pending</span></div><div class="hi-status-est">🏷️ '+rs.filter(x=>x.is_km_estimated).length+' Estimated KM</div>';
  const btn=$('hiApprove');if(btn){btn.disabled=warnings.length!==0;btn.innerHTML=warnings.length?'🔒 APPROVE &amp; IMPORT HISTORY':'✓ APPROVE &amp; IMPORT HISTORY';}
  renderHistoricalRecords();
  renderHistoricalResolver();
}

function hiRenderRow(r,index){
  const type=r.kind==='puc'?'PUC':r.kind==='claim'?'Insurance Claim':r.record_type;
  const detail=r.subcategory||r.description||r.company||r.state||'—';
  const km=r.odometer_km==null?'—':Number(r.odometer_km).toLocaleString('en-IN')+(r.is_km_estimated?' · EST':'');
  let cost='—';if(r.kind==='insurance')cost=r.premium!=null?'₹'+Number(r.premium||0).toLocaleString('en-IN'):'—';else if(r.total_cost!=null&&Number(r.total_cost)>0)cost='₹'+Number(r.total_cost||0).toLocaleString('en-IN');else if(r.cost!=null)cost='₹'+Number(r.cost||0).toLocaleString('en-IN');
  const id=hiRecordId(r),hasWarning=(historicalImportDraft?.warnings||[]).some(w=>w.recordId===id);
  return '<button type="button" class="history-import-row '+(hasWarning?'hi-warning-row ':'')+(historicalImportSelectedWarning?.recordId===id?'hi-selected-row':'')+'" onclick="hiSelectRecord(\''+esc(id).replace(/'/g,"&#39;")+'\')"><div><b>'+esc(r.date||'No date')+'</b><small>'+esc(type)+'</small><small>'+esc(detail)+'</small></div><div><b>'+esc(km)+'</b><small>'+esc(r.workshop||r.company||r.state||'—')+'</small></div><div><b>'+esc(cost)+'</b><small>'+esc(r.invoice_number||r.policy_number||r.puc_number||'')+'</small></div><span class="hi-badge '+(hasWarning?'hi-warn':r.is_km_estimated?'hi-est':'')+'">'+(hasWarning?'⚠ Warning':r.is_km_estimated?'Estimated KM':'Valid')+'</span></button>';
}

function renderHistoricalRecords(){
  const el=$('hiRecords');if(!el)return;
  const rs=historicalImportDraft?.records||[];
  $('hiRecordCount').textContent=rs.length+' record'+(rs.length===1?'':'s');
  el.innerHTML=rs.length?rs.map((r,i)=>hiRenderRow(r,i)).join(''):'<div class="history-import-empty"><b>No structured records detected</b><span>Unsupported formats remain untouched.</span></div>';
}

function hiSelectRecord(id){
  const w=(historicalImportDraft?.warnings||[]).find(x=>x.recordId===id);
  historicalImportSelectedWarning=w||null;
  renderHistoricalRecords();renderHistoricalResolver();
}

function hiResolveRawOdometer(){
  const w=historicalImportSelectedWarning;if(!w)return;
  const r=(historicalImportDraft.records||[]).find(x=>hiRecordId(x)===w.recordId);if(!r)return;
  r.odometer_resolution='raw_preserved';
  r.audit_note='Odometer warning acknowledged by user. Original raw odometer '+Number(r.odometer_km).toLocaleString('en-IN')+' km preserved exactly as supplied.';
  historicalImportSelectedWarning=null;hiRevalidateDraft();
}
function hiOverrideOdometer(){
  const w=historicalImportSelectedWarning;if(!w)return;
  const r=(historicalImportDraft.records||[]).find(x=>hiRecordId(x)===w.recordId);if(!r)return;
  const v=Number($('hiKmOverride')?.value);
  if(!Number.isFinite(v)||v<0)return toast('Enter a valid odometer value.','error');
  const old=r.odometer_km;r.odometer_km=v;r.odometer_adjusted=true;r.odometer_resolution='manual_override';
  r.audit_note=(r.audit_note?r.audit_note+' ':'')+'Odometer adjusted by user from '+Number(old).toLocaleString('en-IN')+' km to '+v.toLocaleString('en-IN')+' km.';
  historicalImportSelectedWarning=null;hiRevalidateDraft();
}
function hiResolveFinancial(action){
  const w=historicalImportSelectedWarning;if(!w)return;
  const r=(historicalImportDraft.records||[]).find(x=>hiRecordId(x)===w.recordId);if(!r)return;
  const original=Number(r.original_invoice_total||0);
  const subtotal=Number(r.parts_cost||0)+Number(r.labour_cost||0)+Number(r.other_cost||0);
  const diff=original-subtotal;
  if(Math.abs(diff)<=0.01){r.financial_resolution='reconciled';historicalImportSelectedWarning=null;hiRevalidateDraft();return;}
  if(action==='misc'){r.other_cost=Number(r.other_cost||0)+diff;r.financial_resolution='add_misc_tax';}
  if(action==='labour'){r.labour_cost=Number(r.labour_cost||0)+diff;r.financial_resolution='adjust_labour';}
  if(action==='itemized'){r.financial_resolution='accept_itemized_subtotal';}
  r.reconciliation_adjustment=Number(r.original_invoice_total)-Number(r.parts_cost||0)-Number(r.labour_cost||0)-Number(r.other_cost||0);
  r.audit_note='Financial reconciliation resolved by user action: '+action+'. Original invoice total ₹'+original.toLocaleString('en-IN')+' preserved in audit metadata.';
  historicalImportSelectedWarning=null;hiRevalidateDraft();
}
function hiReviewEstimated(id){
  const r=(historicalImportDraft.records||[]).find(x=>hiRecordId(x)===id);if(!r)return;
  historicalImportSelectedWarning={id:'est:'+id,type:'estimated',recordId:id,message:'Estimated KM is preserved and does not block import.'};
  renderHistoricalRecords();renderHistoricalResolver();
}
function renderHistoricalResolver(){
  const el=$('hiResolver');if(!el)return;
  const w=historicalImportSelectedWarning;
  if(!w){el.innerHTML='<div class="history-import-empty"><b>⚠ RESOLVE WARNING</b><span>Click a highlighted warning record on the left.</span></div>';return;}
  const r=(historicalImportDraft?.records||[]).find(x=>hiRecordId(x)===w.recordId);if(!r){el.innerHTML='<div class="history-import-empty"><b>No record selected</b></div>';return;}
  if(w.type==='estimated'){
    el.innerHTML='<div class="hi-resolver-head"><span>KM REVIEW</span><h3>Estimated Odometer</h3><p>'+esc(r.date)+' · '+esc(r.record_type)+'</p></div><div class="hi-resolver-card"><div class="hi-resolver-issue">🏷️ '+Number(r.odometer_km).toLocaleString('en-IN')+' km is marked ESTIMATED.</div><label class="hi-radio"><input type="radio" checked> Keep as ESTIMATED</label><label class="hi-radio"><input type="radio" onclick="hiConvertEstimated(\''+esc(w.recordId).replace(/'/g,"&#39;")+'\')"> Convert to exact value</label><div class="hi-field-row"><input id="hiExactKm" type="number" min="0" placeholder="Enter exact KM"><button class="ghost" onclick="hiConvertEstimated()">Apply</button></div></div>';return;
  }
  if(w.type==='odometer'){
    el.innerHTML='<div class="hi-resolver-head"><span>⚠ RESOLVE WARNING</span><h3>Odometer Discrepancy</h3><p>'+esc(r.date)+' · '+esc(r.record_type)+'</p></div><div class="hi-resolver-card"><div class="hi-resolver-issue">'+esc(w.message)+'</div><button class="primary hi-full-btn" onclick="hiResolveRawOdometer()">✓ Keep Raw KM as Preserved</button><div class="hi-divider">OR</div><div class="hi-field-row"><input id="hiKmOverride" type="number" min="0" value="'+Number(r.odometer_km)+'"><button class="ghost" onclick="hiOverrideOdometer()">Apply Override</button></div><small class="muted">Manual override is explicitly marked as adjusted; original value is retained in the audit note.</small></div>';return;
  }
  const original=Number(r.original_invoice_total||0),subtotal=Number(r.parts_cost||0)+Number(r.labour_cost||0)+Number(r.other_cost||0),diff=original-subtotal;
  el.innerHTML='<div class="hi-resolver-head"><span>⚠ RESOLVE WARNING</span><h3>Financial Reconciliation</h3><p>'+esc(r.date)+' · '+esc(r.record_type)+'</p></div><div class="hi-resolver-card"><div class="hi-resolver-issue">Original invoice: <b>₹'+original.toLocaleString('en-IN')+'</b><br>Itemized subtotal: <b>₹'+subtotal.toLocaleString('en-IN')+'</b><br>Difference: <b>₹'+Math.abs(diff).toLocaleString('en-IN')+'</b></div><label class="hi-radio"><input type="radio" name="hiFinFix" onclick="hiResolveFinancial(\'misc\')"> Add difference to Misc / GST / Rounding</label><label class="hi-radio"><input type="radio" name="hiFinFix" onclick="hiResolveFinancial(\'labour\')"> Adjust Labour Charges</label><label class="hi-radio"><input type="radio" name="hiFinFix" onclick="hiResolveFinancial(\'itemized\')"> Accept itemized subtotal as final total</label><small class="muted">Original invoice total remains stored in audit metadata.</small></div>';
}
function hiConvertEstimated(id){
  const rid=id||historicalImportSelectedWarning?.recordId,r=(historicalImportDraft?.records||[]).find(x=>hiRecordId(x)===rid);if(!r)return;
  const v=Number($('hiExactKm')?.value);
  if(!Number.isFinite(v)||v<0)return toast('Enter the exact KM first.','error');
  r.odometer_km=v;r.is_km_estimated=false;r.odometer_adjusted=true;r.odometer_resolution='manual_override';r.audit_note=(r.audit_note?r.audit_note+' ':'')+'Estimated KM converted to exact user-supplied value '+v.toLocaleString('en-IN')+' km.';
  historicalImportSelectedWarning=null;hiRevalidateDraft();
}
async function hiApproveImport(){
  if(!historicalImportDraft||historicalImportDraft.warnings?.length)return toast('Resolve all warnings before approval.','error');
  if(!db||!car)return toast('Secure database connection is not ready.','error');
  const btn=$('hiApprove');if(btn)btn.disabled=true;
  showOperationOverlay('Importing historical history…','Atomic batch is being committed to Supabase');
  try{
    const payload={import_batch_id:historicalImportDraft.import_batch_id,records:historicalImportDraft.records,warnings:[]};
    const {data,error}=await db.rpc('import_historical_batch',{p_car_id:car.id,p_import_batch_id:historicalImportDraft.import_batch_id,p_payload:payload});
    if(error)throw error;
    await loadData();await nav('history');
    document.getElementById('historicalImportModal')?.remove();
    historicalImportDraft=null;historicalImportSelectedWarning=null;
    toast('Historical history imported successfully.');
  }catch(err){
    console.error('Historical import failed:',err);
    toast('Import failed: '+(err?.message||'Database function not installed or import was rejected.'),'error');
    hiRevalidateDraft();
  }finally{hideOperationOverlay();}
}
function buildHistoricalPreview(raw){
  if(!car)return toast('Select a vehicle before importing history.','error');
  if(!String(raw||'').trim())return toast('Paste historical data first.','error');
  const batch='batch_'+new Date().toISOString().replace(/\D/g,'').slice(0,15);
  historicalImportDraft={import_batch_id:batch,source:'historical_import',raw_text:raw,created_at:new Date().toISOString()};
  const parsed=hiParseRecords(raw);
  parsed.records.sort((a,b)=>String(a.date||'9999-99-99').localeCompare(String(b.date||'9999-99-99')));
  historicalImportDraft.records=parsed.records;
  historicalImportDraft.warnings=[];
  historicalImportSelectedWarning=null;
  hiRevalidateDraft();
}
window.openHistoricalImport=openHistoricalImport;
window.hiSelectRecord=hiSelectRecord;
window.hiResolveRawOdometer=hiResolveRawOdometer;
window.hiOverrideOdometer=hiOverrideOdometer;
window.hiResolveFinancial=hiResolveFinancial;
window.hiConvertEstimated=hiConvertEstimated;
window.hiApproveImport=hiApproveImport;
function dbSetupHint(err,file='step5_profile_history_sale.sql'){const m=String(err?.message||err||'');return /does not exist|schema cache|PGRST20\d|42P01|42883|Could not find the (table|function)/i.test(m)?'Database setup incomplete: run supabase/'+file+' in Supabase SQL Editor (after Steps 1-4), then refresh. ('+m+')':m}