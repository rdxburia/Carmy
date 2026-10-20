
const U=APP_CONFIG.SUPABASE_URL,K=APP_CONFIG.SUPABASE_KEY;

const IDLE_MS=120000;
const IDLE_ACTIVITY_KEY='carmy_last_activity';
const IDLE_LOGOUT_KEY='carmy_idle_logout';
let idleCheckTimer=null;
let activeLongOperations=0;
let garageLoadingState='idle'; // 'idle' | 'loading' | 'ready' | 'empty' | 'error'
const sessionGuard=window.CarmySessionGuard.create({
  supabaseUrl:U,
  idleMs:IDLE_MS,
  activityKey:IDLE_ACTIVITY_KEY,
  getUser:()=>user,
  onIdle:()=>forceSignOut('idle'),
  timeoutMessage:'Session expired after 2 minutes of inactivity. Please sign in again.'
});
function readIdleActivity(){return sessionGuard.readActivity()}
function writeIdleActivity(force=false){return sessionGuard.writeActivity(force)}
function idleExpired(){return sessionGuard.isExpired()}
function installIdleFetchGuard(){sessionGuard.installFetchGuard()}
installIdleFetchGuard();
let isSuperAdmin=false;
let adminCheckPromise=null;
let adminTickets=[];
let adminTicketsLoading=false;
let adminTicketsError=null;
let adminStatusFilter='all';
let adminSearchQuery='';
let currentAdminRole=null;
let currentAdminProfile=null;
let adminOverviewData=null;
let adminOverviewLoading=false;
let adminOverviewError=null;
let adminUsersList=null;
let adminUsersLoading=false;
let adminUsersError=null;
let adminUsersSearch='';
let adminUsersRoleFilter='all';
let adminUsersPlanFilter='all';
let adminUsersStatusFilter='all';
let adminTokensList=null;
let adminTokensLoading=false;
let adminTokensError=null;
let adminRevealedToken=null;
let adminPlansList=null;
let adminPlansLoading=false;
let adminPlansError=null;
let adminCouponsList=null;
let adminCouponsLoading=false;
let adminCouponsError=null;
let adminUpgradesList=null;
let adminUpgradesLoading=false;
let adminUpgradesError=null;
let adminUpgradesFilter='all';
let adminTeamList=null;
let adminTeamLoading=false;
let adminTeamError=null;
let adminAuditList=null;
let adminAuditLoading=false;
let adminAuditError=null;
let adminAuditActorFilter='all';
let adminAuditActionFilter='all';
let adminGaragesList=null;
let adminGaragesLoading=false;
let adminGaragesError=null;
let adminGaragesFilter='all';
let adminGaragesSearch='';
let teamMeLoading=false;
let teamMeError=null;
let adminContentTab='about';
let userPlanStatus=null;
let userPlanLoading=false;
let userPlanError=null;
let currentComparisonCycle='monthly';
let isActivationRedeemOpen=false;
let adminTpinStatus=null;
let adminTpinLoading=false;
let adminTpinError=null;
let pendingTpinActionCallback=null;

function updateAdminNavVisibility(){
  const desktopBtn=document.getElementById('adminNavBtn');
  const drawerBtn=document.getElementById('mobileDrawerAdminLink');
  if(desktopBtn){
    if(isSuperAdmin)desktopBtn.classList.remove('hidden');
    else desktopBtn.classList.add('hidden');
  }
  if(drawerBtn){
    if(isSuperAdmin)drawerBtn.classList.remove('hidden');
    else drawerBtn.classList.add('hidden');
  }
}

async function checkSuperAdminStatus(force=false){
  if(!user){
    isSuperAdmin=false;
    updateAdminNavVisibility();
    return false;
  }
  if(!force&&isSuperAdmin){
    updateAdminNavVisibility();
    return true;
  }
  if(adminCheckPromise&&!force)return adminCheckPromise;
  adminCheckPromise=(async()=>{
    try{
      const res=await workerGet('/api/admin/support-tickets?limit=1');
      if(res&&res.ok&&Array.isArray(res.data)){
        isSuperAdmin=true;
      }else{
        isSuperAdmin=false;
      }
    }catch(err){
      isSuperAdmin=false;
    }finally{
      updateAdminNavVisibility();
      adminCheckPromise=null;
    }
    return isSuperAdmin;
  })();
  return adminCheckPromise;
}

function clearUserMemory(){
  user=null;cars=[];car=null;records=[];docs=[];ownerProfile=null;
  insuranceHistory=[];pucHistory=[];renewalHistory=[];saleHistory=[];
  accessToken='';authRefreshPromise=null;startedUserId=null;startingUserId=null;
  startupPromise=null;startupFailed=false;garageLoadingState='idle';
  isSuperAdmin=false;adminTickets=[];adminTicketsError=null;updateAdminNavVisibility();
  adminOverviewData=null;adminOverviewLoading=false;adminOverviewError=null;
  adminUsersList=null;adminUsersLoading=false;adminUsersError=null;adminUsersSearch='';
  adminTokensList=null;adminTokensLoading=false;adminTokensError=null;adminRevealedToken=null;
  adminPlansList=null;adminPlansLoading=false;adminPlansError=null;
  adminCouponsList=null;adminCouponsLoading=false;adminCouponsError=null;
  adminUpgradesList=null;adminUpgradesLoading=false;adminUpgradesError=null;
  adminTeamList=null;adminTeamLoading=false;adminTeamError=null;
  adminAuditList=null;adminAuditLoading=false;adminAuditError=null;
  adminGaragesList=null;adminGaragesLoading=false;adminGaragesError=null;adminGaragesFilter='all';adminGaragesSearch='';
  currentAdminRole=null;currentAdminProfile=null;teamMeLoading=false;teamMeError=null;
  userSupportTickets=[];viewingCustomerTicketId=null;stopTicketUnreadPolling();updateHelpUnreadBadge(0);
  userPlanStatus=null;userPlanLoading=false;userPlanError=null;isActivationRedeemOpen=false;
  adminTpinStatus=null;adminTpinLoading=false;adminTpinError=null;pendingTpinActionCallback=null;
  try{localStorage.removeItem('carmy_selected_car_id')}catch(_){}
  try{localStorage.removeItem('carmy_cached_cars')}catch(_){}
  const stage=document.getElementById('vehicleReportPdfStage');if(stage)stage.remove();
  document.querySelectorAll('.modal-overlay,.modal-backdrop,[role="dialog"][aria-modal="true"]').forEach(el=>el.remove());
  closeSideMenu();
}
async function forceSignOut(reason='idle'){
  if(window.__carmySigningOut)return;
  window.__carmySigningOut=true;
  try{
    try{localStorage.setItem(IDLE_LOGOUT_KEY,String(Date.now()))}catch(e){}
    try{if(db)await db.auth.signOut({scope:'global'})}catch(err){console.error('Global sign-out failed:',err)}
    try{
      for(let i=localStorage.length-1;i>=0;i--){
        const key=localStorage.key(i);
        if(key&&(key.startsWith('sb-')||key.startsWith('carmy_')))localStorage.removeItem(key);
      }
    }catch(e){}
    clearUserMemory();
    showLogin();
    toast(reason==='idle'?'You were signed out after 2 minutes of inactivity.':'Your session has expired. Please sign in again.','error');
  }finally{
    window.__carmySigningOut=false;
  }
}
function checkIdleSession(){
  if(!db||!user)return;
  if(idleExpired())void forceSignOut('idle');
}
let lastServerActivityTouch=0;
let serverActivityTouchPromise=null;
async function touchServerSessionActivity(force=false){
  if(!db||!user||window.__carmySigningOut||idleExpired())return false;
  if(serverActivityTouchPromise)return serverActivityTouchPromise;
  const now=Date.now();
  if(!force&&now-lastServerActivityTouch<15000)return true;
  if(force&&now-lastServerActivityTouch<3000)return true;
  lastServerActivityTouch=now;
  serverActivityTouchPromise=(async()=>{
    try{
      const rpcRes=await db.rpc('carmy_touch_session');
      if(rpcRes?.error)console.warn('Direct db touch notice:',rpcRes.error);
    }catch(err){
      console.warn('Direct db touch notice:',err);
    }
    try{
      const res=await workerPost('/api/session/heartbeat');
      if(res?.ok)return true;
    }catch(err){
      if(err?.status===429||err?.code==='HEARTBEAT_RATE_LIMITED'||/429|rate limit|HEARTBEAT_RATE_LIMITED/i.test(err?.message||''))return true;
      console.warn('Worker idle-session heartbeat notice:',err);
    }
    return true;
  })().finally(()=>{serverActivityTouchPromise=null});
  return serverActivityTouchPromise;
}
function recordUserActivity(){
  if(window.__carmySigningOut||!db)return;
  if(document.visibilityState==='hidden')return;
  if(user&&idleExpired()){void forceSignOut('idle');return}
  writeUserActivityAndTouchServer();
}
function writeUserActivityAndTouchServer(){
  writeIdleActivity();
  void touchServerSessionActivity();
}
function initIdleLogout(){
  if(window.__carmyIdleLogoutInitialized)return;
  window.__carmyIdleLogoutInitialized=true;
  const events=['pointerdown','keydown','touchstart','wheel','scroll'];
  events.forEach(name=>document.addEventListener(name,recordUserActivity,{passive:true,capture:true}));
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'){
      checkIdleSession();
      if(!idleExpired())writeIdleActivity(true);
    }
  });
  window.addEventListener('focus',checkIdleSession);
  window.addEventListener('pageshow',checkIdleSession);
  window.addEventListener('storage',event=>{
    if(event.key===IDLE_LOGOUT_KEY||(event.key&&event.key.startsWith('sb-')&&event.newValue===null)){
      if(user)void forceSignOut('expired');
      return;
    }
    if(event.key===IDLE_ACTIVITY_KEY)checkIdleSession();
  });
  idleCheckTimer=setInterval(checkIdleSession,5000);
}
function idleActivityHeader(){
  const last=readIdleActivity();
  return last?String(Math.floor(last/1000)):'';
}

let db=null;
let accessToken='';
let authRefreshPromise=null;
let pdfEnginePromise=null;
const WORKER_API=typeof APP_CONFIG.WORKER_API_URL==='string'?APP_CONFIG.WORKER_API_URL:"https://carmy-api.mr-rny-buria.workers.dev";
const PDF_ENGINE_URL='https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
const PDF_ENGINE_INTEGRITY='sha512-GsLlZN/3F2ErC5ifS5QtgpiJtWd43JWSuIgh7mbzZ8zBps+dvLusV+eNQATqgA/HdeKFVgA5v3S/cIrLF7QnIg==';
function loadPdfEngine(){
  if(typeof window.html2pdf==='function')return Promise.resolve(window.html2pdf);
  if(pdfEnginePromise)return pdfEnginePromise;
  pdfEnginePromise=new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-carmy-pdf-engine="html2pdf"]');
    const script=existing||document.createElement('script');
    const fail=()=>reject(new Error('PDF engine failed to load from cdnjs. Check your network connection and Content Security Policy.'));
    const ready=()=>{
      if(typeof window.html2pdf==='function')resolve(window.html2pdf);
      else fail();
    };
    script.addEventListener('load',ready,{once:true});
    script.addEventListener('error',fail,{once:true});
    if(!existing){
      script.async=true;
      script.src=PDF_ENGINE_URL;
      script.integrity=PDF_ENGINE_INTEGRITY;
      script.crossOrigin='anonymous';
      script.referrerPolicy='no-referrer';
      script.dataset.carmyPdfEngine='html2pdf';
      document.head.appendChild(script);
    }
  });
  return pdfEnginePromise;
}
function tokenExpiresSoon(token,skewSeconds=30){
  try{
    const part=String(token||'').split('.')[1];
    if(!part)return true;
    const base64=part.replace(/-/g,'+').replace(/_/g,'/');
    const padded=base64+'='.repeat((4-(base64.length%4))%4);
    const payload=JSON.parse(atob(padded));
    return !Number.isFinite(payload.exp)||payload.exp<=Math.floor(Date.now()/1000)+skewSeconds;
  }catch(e){
    return true;
  }
}
async function getAccessToken(forceRefresh=false){
  if(user&&idleExpired()){await forceSignOut('idle');throw new Error('Session expired after inactivity. Please sign in again.')}
  if(!db)throw new Error('Secure API connection is not ready.');
  if(!forceRefresh&&accessToken&&!tokenExpiresSoon(accessToken))return accessToken;
  if(authRefreshPromise)return authRefreshPromise;
  authRefreshPromise=(async()=>{
    let nextToken='';
    if(forceRefresh||(accessToken&&tokenExpiresSoon(accessToken))){
      try{
        const refreshed=await db.auth.refreshSession();
        nextToken=refreshed?.data?.session?.access_token||'';
      }catch(e){
        console.warn('Explicit session refresh failed, checking active session:',e);
      }
    }
    if(!nextToken){
      const session=await db.auth.getSession();
      nextToken=session?.data?.session?.access_token||'';
    }
    accessToken=nextToken;
    if(!nextToken)throw new Error('Secure login session expired. Please login again.');
    return nextToken;
  })().finally(()=>{authRefreshPromise=null});
  return authRefreshPromise;
}
async function workerRequest(path,options={},retry=true){
  if(!db)throw new Error('Secure API connection is not ready.');
  checkIdleSession();
  if(user&&idleExpired()){await forceSignOut('idle');throw new Error('Session expired after inactivity. Please sign in again.')}
  const activityHeader=idleActivityHeader();
  let token=await getAccessToken();
  const makeRequest=t=>fetch(WORKER_API+path,{
    ...options,
    headers:{...(options.headers||{}),Authorization:'Bearer '+t,Accept:'application/json'}
  });
  let res=await makeRequest(token);
  if(res.status===401){
    let firstBody=null;
    try{firstBody=await res.clone().json()}catch(e){}
    if(firstBody?.error?.code==='SESSION_IDLE_TIMEOUT'||firstBody?.code==='SESSION_IDLE_TIMEOUT'){
      await forceSignOut('idle');
      throw new Error('You were signed out after 2 minutes of inactivity.');
    }
    if(retry){
      token=await getAccessToken(true);
      res=await makeRequest(token);
    }
  }
  let body=null;
  try{body=await res.json()}catch(e){}
  if(!res.ok||body?.ok===false){
    const msg=body?.error?.message||('Secure API request failed ('+res.status+').');
    const err=new Error(msg);
    err.status=res.status;
    err.code=body?.error?.code;
    throw err;
  }
  return body;
}
async function workerGet(path){
  return workerRequest(path,{method:'GET'});
}
async function workerPost(path,payload){
  return workerRequest(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload||{})});
}
async function workerDelete(path){
  return workerRequest(path,{method:'DELETE'});
}
async function workerPatch(path,payload){
  return workerRequest(path,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload||{})});
}
async function workerPut(path,payload){
  return workerRequest(path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload||{})});
}
async function workerDownloadCsv(path,filename){
  let token=await getAccessToken();
  const res=await fetch(WORKER_API+path,{
    method:'GET',
    headers:{
      Authorization:'Bearer '+token,
      Accept:'text/csv, application/json'
    }
  });
  if(!res.ok){
    let errText='Export failed ('+res.status+').';
    try{
      const b=await res.clone().json();
      if(b?.error?.message)errText=b.error.message;
    }catch(_){}
    throw new Error(errText);
  }
  const blob=await res.blob();
  if(typeof window!=='undefined'&&window.URL&&window.URL.createObjectURL){
    const url=window.URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }
}
function initSupabase(){const sb=window.supabase;if(sb&&typeof sb.createClient==='function'){db=sb.createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});window.db=db;return true}return false}
function sdkError(){document.body.insertAdjacentHTML('afterbegin','<div style="position:fixed;inset:0;background:#fff;z-index:99999;display:grid;place-items:center;padding:24px;font-family:system-ui"><div style="max-width:600px"><h2>Torq Desk</h2><p>The Supabase connection library could not be loaded. A browser extension, ad blocker, or network setting may be blocking the CDN.</p><button onclick="location.reload()" style="background:#2563eb;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-weight:700">Refresh</button></div></div>')}
function waitForSupabase(n=0){if(initSupabase()){boot();return}if(n<40){setTimeout(()=>waitForSupabase(n+1),250);return}sdkError()}
let user=null,cars=[],car=null,records=[],docs=[],signup=false,startedUserId=null,startingUserId=null;
let startupPromise=null,startupFailed=false;
function renderDashboardRecoveryUI(err){
 const dashEl=$('dash');
 if(!dashEl)return;
 const errorMsg=esc(err?.message||'We could not reach the server to load your vehicles and records.');
 dashEl.innerHTML=
   '<div class="card minimal-empty" style="text-align:center;padding:36px 20px;max-width:520px;margin:32px auto;">'+
     '<div style="font-size:32px;margin-bottom:12px;">⚠️</div>'+
     '<h3 style="margin-bottom:8px;">Unable to load your garage</h3>'+
     '<p class="muted" style="margin-bottom:16px;">'+errorMsg+'</p>'+
     '<button class="primary" id="dashboardRetryBtn" onclick="retryDashboardStartup()" style="padding:10px 24px;font-weight:700;">RETRY CONNECTION</button>'+
   '</div>';
}
window.renderDashboardRecoveryUI=renderDashboardRecoveryUI;
window.retryDashboardStartup=async function(){
 if(!user){
   try{
     const sess=await db?.auth?.getSession();
     if(sess?.data?.session?.user)user=sess.data.session.user;
   }catch(_){}
 }
 if(!user)return;
 const btn=$('dashboardRetryBtn');
 if(btn){btn.disabled=true;btn.textContent='Retrying…';}
 try{
   await start(user,true);
 }catch(e){
   console.error('Retry failed:',e);
 }
};
let pendingVerificationEmail='',verificationTimer=null,verificationSeconds=0;
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
function generateServiceDescription(){
 const type=$('type')?.value||'Service';
 const selected=collectServiceItems().map(x=>x.item_name+(x.quantity>1?' (Qty '+x.quantity+')':''));
 const customNotes=String([...document.querySelectorAll('#items .service-item-check:checked')].map(ch=>ch.closest('.service-item-row')?.querySelector('.si-notes')?.value.trim()||'').filter(Boolean).join('; '));
 const templates={
  'Regular Service':'Regular service completed',
  'Engine Service':'Engine service / maintenance completed',
  'Brake Work':'Brake inspection and repair completed',
  'Tyre Work':'Tyre service / replacement completed',
  'Battery':'Battery inspection / service completed',
  'Accident / Repair':'Accident repair work completed',
  'Other':'Vehicle maintenance / repair completed'
 };
 const lines=[templates[type]||type+' completed'];
 if(selected.length)lines.push('Work/items: '+selected.join(', '));
 if(customNotes)lines.push('Item notes: '+customNotes);
 const desc=$('description'),generated=lines.join('. ')+'.';
 if(desc.value.trim()&&!confirm('Replace the existing description with generated text?'))return;
 desc.value=generated;desc.dispatchEvent(new Event('input',{bubbles:true}));desc.focus();
 toast('Description text generated. Review it before saving.');
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
function prepareLoginExperience(){
 const auth=$('auth');if(!auth)return;
 auth.classList.remove('auth-success','auth-mode-switching');
 const story=auth.querySelector('.auth-story-copy'),card=auth.querySelector('.auth-card');
 [story,card].forEach(el=>el?.classList.remove('auth-enter-story','auth-enter-card'));
 const start=()=>{story?.classList.add('auth-enter-story');card?.classList.add('auth-enter-card');auth.classList.add('auth-animated');
 document.addEventListener('visibilitychange',()=>auth.classList.toggle('auth-paused',document.hidden),{once:false})};
 const run=window.requestIdleCallback?()=>window.requestIdleCallback(start,{timeout:120}):()=>window.requestAnimationFrame(start);
 requestAnimationFrame(run);
}

function setFieldState(id,message='',ok=false){
 const input=$(id),field=input?.closest('.auth-field'),msg=$(id+'Message');
 if(!input||!field)return;
 field.classList.toggle('is-error',!!message);
 field.classList.toggle('is-valid',ok&&!message);
 input.setAttribute('aria-invalid',String(!!message));
 if(msg){msg.textContent=message;msg.className='auth-message '+(message?'error':ok?'success':'');}
}

function normalizeMobile(value){
 let v=String(value||'').trim().replace(/[\s-]/g,'');
 if(v.startsWith('+91'))v=v.slice(3);
 else if(v.startsWith('91')&&v.length>10)v=v.slice(2);
 else if(v.startsWith('0')&&v.length>10)v=v.slice(1);
 return /^\d{10}$/.test(v)&&/^[6-9]/.test(v)?v:'';
}

function validateName(show=true){
 const v=$('fullName')?.value.trim()||'';
 let err='';
 if(v.length<2||v.length>50)err='Enter 2–50 characters.';
 else if(!/^[A-Za-z .'-]+$/.test(v))err="Use letters, spaces, . ' and - only.";
 if(show)setFieldState('fullName',err,!err);
 return !err;
}

function validateEmail(show=true){
 const v=$('email')?.value.trim()||'';
 const ok=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
 const err=v?'Enter a valid email address.':'Enter your email address.';
 if(show)setFieldState('email',ok?'':err,ok);
 return ok;
}

function validateMobile(show=true){
 const raw=$('mobile')?.value||'';
 const normalized=normalizeMobile(raw);
 const ok=!!normalized;
 if(ok&&$('mobile'))$('mobile').value=normalized;
 if(show)setFieldState('mobile',ok?'':'Enter a valid 10-digit Indian mobile number.',ok);
 return ok;
}

function passwordRules(value){
 return {
   length:value.length>=8&&value.length<=16,
   letter:/[A-Za-z]/.test(value),
   number:/\d/.test(value),
   special:[...value].some(ch=>{const n=ch.charCodeAt(0);return(n>=33&&n<=47)||(n>=58&&n<=64)||(n>=91&&n<=96)||(n>=123&&n<=126)}),
   noSpace:!/[\s]/.test(value)
 };
}

function updatePasswordUI(showError=false){
 const input=$('password'),list=$('passwordChecklist'),strength=$('passwordStrengthText');
 if(!input||!list)return false;
 const v=input.value||'',r=passwordRules(v);
 const items=[
  ['8–16 characters',r.length],
  ['Letter',r.letter],
  ['Number',r.number],
  ['Special character',r.special]
 ];
 list.innerHTML=items.map(([label,ok])=>'<span class="auth-check '+(ok?'ok':'')+'"><b>'+(ok?'✓':'')+'</b>'+label+'</span>').join('');
 let level=0,label='';
 const passed=[r.length,r.letter,r.number,r.special,r.noSpace].filter(Boolean).length;
 if(v){level=passed<=2?1:passed<5?2:3;label=level===1?'Weak':level===2?'Good':'Strong';}
 const bar=input.closest('.auth-password-field')?.querySelector('.auth-strength');
 if(bar){bar.className='auth-strength '+(level?'s'+level:'');if(strength)strength.textContent=label;}
 const ok=r.length&&r.letter&&r.number&&r.special&&r.noSpace;
 if(showError){
   let err='';
   if(v.length<8)err='Minimum 8 characters';
   else if(v.length>16)err='Maximum 16 characters';
   else if(!r.letter)err='Must contain a letter';
   else if(!r.number)err='Must contain a number';
   else if(!r.special)err='Must contain a special character';
   else if(!r.noSpace)err='Spaces are not allowed';
   setFieldState('password',ok?'':err,ok);
 }
 return ok;
}

function validateAuthForm(show=true){
 const emailOk=validateEmail(show);
 if(!signup){
   const passOk=!!($('password')?.value);
   if(show&&!passOk)setFieldState('password','Enter your password.',false);
   return emailOk&&passOk;
 }
 const passOk=updatePasswordUI(show);
 const nameOk=validateName(show),mobileOk=validateMobile(show);
 return nameOk&&emailOk&&mobileOk&&passOk;
}

function updateAuthSubmitState(){
 const btn=$('authBtn');if(!btn)return;
 const ok=validateAuthForm(false);
 btn.classList.toggle('auth-submit-disabled',!ok);
 btn.setAttribute('aria-disabled',String(!ok));
}

function bindAuthValidation(){
 const auth=$('auth');
 if(auth?.dataset.validationBound)return;
 if(auth)auth.dataset.validationBound='1';
 const fields=['fullName','email','mobile'];
 fields.forEach(id=>$(id)?.addEventListener('blur',()=>{if(signup){id==='fullName'?validateName(true):id==='mobile'?validateMobile(true):validateEmail(true);updateAuthSubmitState()}}));
 $('password')?.addEventListener('input',()=>{updatePasswordUI(false);updateAuthSubmitState()});
 $('email')?.addEventListener('input',()=>{setFieldState('email');updateAuthSubmitState()});
 $('fullName')?.addEventListener('input',()=>{if(signup){setFieldState('fullName');updateAuthSubmitState()}});
 $('mobile')?.addEventListener('input',()=>{if(signup){setFieldState('mobile');updateAuthSubmitState()}});
}

function getAuthRedirectUrl(){
 const loc=window.location||{};
 const pathname=String(loc.pathname||'/');
 const path=pathname.endsWith('/')?pathname:pathname+'/';
 const origin=loc.origin||'';
 return origin+path;
}
function maskEmail(email){
 const v=String(email||'').trim();
 const at=v.indexOf('@');
 if(at<=0)return v;
 const local=v.slice(0,at),domain=v.slice(at+1);
 if(local.length<=2)return local[0]+'***@'+domain;
 return local.slice(0,2)+'***'+local.slice(-1)+'@'+domain;
}
function stopVerificationCountdown(){
 if(verificationTimer){clearInterval(verificationTimer);verificationTimer=null;}
 verificationSeconds=0;
}
function startVerificationCountdown(seconds=60){
 stopVerificationCountdown();
 const timer=$('authVerificationTimer'),btn=$('authResendBtn');
 verificationSeconds=Math.max(0,Number(seconds)||0);
 const tick=()=>{
   if(timer)timer.textContent=verificationSeconds>0?'Resend email in '+verificationSeconds+'s':'You can request a new verification email now.';
   if(btn)btn.disabled=verificationSeconds>0;
   if(verificationSeconds<=0){stopVerificationCountdown();if(btn)btn.disabled=false;return}
   verificationSeconds-=1;
 };
 tick();
 verificationTimer=setInterval(tick,1000);
}
function showVerificationView(email,message=''){
 pendingVerificationEmail=String(email||'').trim();
 if(pendingVerificationEmail){
   try{sessionStorage.setItem('carmy_pending_verification_email',pendingVerificationEmail)}catch(e){}
 }
 const auth=$('auth'),body=document.querySelector('.auth-card-body'),foot=document.querySelector('.auth-card-foot'),view=$('authVerification'),emailEl=$('authVerificationEmail');
 if(!auth||!view)return;
 auth.classList.add('auth-verification-open');
 body?.classList.add('hidden');foot?.classList.add('hidden');
 view.classList.remove('hidden');
 if(emailEl)emailEl.textContent=maskEmail(pendingVerificationEmail);
 const note=$('authVerificationNote');
 if(note&&message)note.textContent=message;
 const actions=document.querySelector('.auth-mobile-actions');actions?.classList.add('hidden');
 startVerificationCountdown(60);
}
function hideVerificationView(clearPending=true){
 stopVerificationCountdown();
 const auth=$('auth'),body=document.querySelector('.auth-card-body'),foot=document.querySelector('.auth-card-foot'),view=$('authVerification');
 auth?.classList.remove('auth-verification-open');
 body?.classList.remove('hidden');foot?.classList.remove('hidden');
 view?.classList.add('hidden');
 document.querySelector('.auth-mobile-actions')?.classList.remove('hidden');
 if(clearPending){try{sessionStorage.removeItem('carmy_pending_verification_email')}catch(e){}pendingVerificationEmail='';}
}
async function resendVerificationEmail(){
 if(!db)return toast('Secure login is still connecting. Please wait a moment.','error');
 const email=pendingVerificationEmail||sessionStorage.getItem('carmy_pending_verification_email')||'';
 if(!email)return toast('Verification email address is missing. Please create the account again.','error');
 const btn=$('authResendBtn');if(btn)btn.disabled=true;
 try{
   const r=await db.auth.resend({type:'signup',email,options:{emailRedirectTo:getAuthRedirectUrl()}});
   if(r.error)throw r.error;
   startVerificationCountdown(60);
   toast('New verification email sent.');
 }catch(err){
   console.error('Verification resend error:',err);
   const msg=String(err?.message||'Unable to resend verification email.');
   toast(msg,'error');
   if(/rate|too many|limit/i.test(msg))startVerificationCountdown(60);
   else if(btn)btn.disabled=false;
 }
}
function restorePendingVerification(){
 let email='';
 try{email=sessionStorage.getItem('carmy_pending_verification_email')||''}catch(e){}
 if(email&&!db?.auth)return;
 if(email)showVerificationView(email);
}
function handleAuthRedirectError(){
 const hash=window.location.hash||'';
 if(!hash.includes('error='))return;
 const p=new URLSearchParams(hash.replace(/^#/,''));
 const code=p.get('error_code')||'';
 const description=p.get('error_description')||'';
 if(code==='otp_expired'||code==='access_denied'){
   let email='';
   try{email=sessionStorage.getItem('carmy_pending_verification_email')||''}catch(e){}
   if(email)showVerificationView(email,'The previous verification link is invalid or expired. Use the latest verification email.');
   else toast('The verification link is invalid or expired. Please request a new verification email.','error');
 }
 try{history.replaceState(null,document.title,window.location.pathname+window.location.search)}catch(e){}
}

/* ==========================================================================
   PHASE 8: MULTI-STEP SIGNUP FLOW & BACKEND SWITCH INTEGRATION
   ========================================================================== */

/* Phase 8 auth & profile API helper */
async function authApiRequest(path, options = {}) {
  const base = (typeof window !== 'undefined' && window.API_BASE) || (typeof API_BASE !== 'undefined' ? API_BASE : '') || (typeof WORKER_API !== 'undefined' ? WORKER_API : '');
  const headers = {
    'Accept': 'application/json',
    ...(options.headers || {})
  };
  let body = options.body;
  if (body && typeof body === 'object' && !(typeof FormData !== 'undefined' && body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  try {
    if (typeof getAccessToken === 'function') {
      const token = await getAccessToken().catch(() => null);
      if (token) {
        headers['Authorization'] = 'Bearer ' + token;
      }
    }
  } catch (_) {}

  const res = await fetch(base + path, {
    ...options,
    headers,
    body
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {}

  if (!res.ok) {
    const errorMsg = data?.error?.message || data?.error || data?.message || ('Request failed (' + res.status + ')');
    return { ok: false, status: res.status, error: errorMsg, data };
  }
  return data || { ok: true, status: res.status };
}

const signupState = {
  currentStep: 1, // 1: Account Type, 2: Credentials, 3: Email OTP, 4: Mobile OTP, 5: Profile, 6: Complete
  accountType: 'vehicle_owner', // 'vehicle_owner' | 'garage'
  garageType: 'Repair shop',
  email: '',
  emailOtpSent: false,
  emailOtpVerified: false,
  emailOtpFailedAttempts: 0,
  emailOtpLocked: false,
  emailOtpCooldown: 0,
  emailOtpTimer: null,
  mobile: '',
  mobileOtpSent: false,
  mobileOtpVerified: false,
  mobileOtpFailedAttempts: 0,
  mobileOtpCooldown: 0,
  mobileOtpTimer: null,
  profileSaved: false,
  errorMessage: ''
};

function resetSignupState() {
  if (signupState.emailOtpTimer) {
    clearInterval(signupState.emailOtpTimer);
    signupState.emailOtpTimer = null;
  }
  if (signupState.mobileOtpTimer) {
    clearInterval(signupState.mobileOtpTimer);
    signupState.mobileOtpTimer = null;
  }
  signupState.currentStep = 1;
  signupState.accountType = 'vehicle_owner';
  signupState.garageType = 'Repair shop';
  signupState.email = '';
  signupState.emailOtpSent = false;
  signupState.emailOtpVerified = false;
  signupState.emailOtpFailedAttempts = 0;
  signupState.emailOtpLocked = false;
  signupState.emailOtpCooldown = 0;
  signupState.mobile = '';
  signupState.mobileOtpSent = false;
  signupState.mobileOtpVerified = false;
  signupState.mobileOtpFailedAttempts = 0;
  signupState.mobileOtpCooldown = 0;
  signupState.profileSaved = false;
  signupState.errorMessage = '';

  const ids = ['authStepPassword', 'authStepEmail', 'authStepEmailOtp', 'authStepMobile', 'authStepMobileOtp'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function cancelSignupFlow() {
  resetSignupState();
  signup = false;
  updateAuthModeUI();
}

function selectSignupAccountType(type) {
  signupState.accountType = type === 'garage' ? 'garage' : 'vehicle_owner';
  renderSignupFlow();
}

function selectSignupGarageType(type) {
  signupState.garageType = type;
}

function nextSignupStep(step) {
  signupState.errorMessage = '';
  signupState.currentStep = step;
  renderSignupFlow();
}

function prevSignupStep(step) {
  signupState.errorMessage = '';
  signupState.currentStep = step;
  renderSignupFlow();
}

function toggleSignupPasswordVisibility() {
  const input = document.getElementById('authStepPassword');
  const btn = document.getElementById('authStepPasswordToggle');
  if (!input || !btn) return;
  const isPass = input.type === 'password';
  input.type = isPass ? 'text' : 'password';
  btn.textContent = isPass ? 'Hide' : 'Show';
  btn.setAttribute('aria-label', isPass ? 'Hide password' : 'Show password');
}

function evaluatePasswordStrength(val) {
  const v = String(val || '');
  const hasLen = v.length >= 8;
  const hasLetter = /[A-Za-z]/.test(v);
  const hasNum = /\d/.test(v);
  const hasSpecial = /[^A-Za-z0-9]/.test(v);
  const isValid = hasLen && hasLetter && hasNum;

  let level = 0;
  let label = '';
  if (v.length > 0) {
    if (!hasLen || !hasLetter || !hasNum) {
      level = 1;
      label = 'Weak (Needs 8+ chars, letter & number)';
    } else if (hasLen && hasLetter && hasNum && (v.length >= 10 || hasSpecial)) {
      level = 3;
      label = 'Strong';
    } else {
      level = 2;
      label = 'Good';
    }
  }
  return { isValid, level, label, hasLen, hasLetter, hasNum };
}

function updateSignupPasswordMeter() {
  const input = document.getElementById('authStepPassword');
  const meter = document.getElementById('authStepStrengthMeter');
  const label = document.getElementById('authStepStrengthLabel');
  if (!input || !meter) return;
  const res = evaluatePasswordStrength(input.value);
  meter.className = 'auth-strength ' + (res.level ? 's' + res.level : '');
  if (label) label.textContent = res.label;
}

function renderSignupFlow() {
  const container = document.getElementById('authSignupFlow');
  if (!container) return;

  const steps = [
    { num: 1, label: 'Account' },
    { num: 2, label: 'Credentials' },
    { num: 3, label: 'Email OTP' },
    { num: 4, label: 'Mobile' },
    { num: 5, label: 'Profile' },
    { num: 6, label: 'Ready' }
  ];

  const bubblesHtml = `
    <div class="auth-step-bubbles" aria-label="Signup steps">
      ${steps.map(s => `
        <div class="auth-step-bubble ${s.num === signupState.currentStep ? 'active' : ''} ${s.num < signupState.currentStep ? 'done' : ''}">
          <div class="auth-step-bubble-num">${s.num < signupState.currentStep ? '✓' : s.num}</div>
          <div class="auth-step-bubble-label">${s.label}</div>
        </div>
      `).join('')}
    </div>
  `;

  let stepHtml = '';

  if (signupState.currentStep === 1) {
    stepHtml = `
      <div class="auth-step-card">
        <div class="auth-step-title">Choose Account Type</div>
        <p class="auth-step-desc">Select how you will be using Torq Desk.</p>
        <div class="auth-type-grid">
          <button type="button" class="auth-type-card ${signupState.accountType === 'vehicle_owner' ? 'active' : ''}" onclick="selectSignupAccountType('vehicle_owner')">
            <div class="auth-type-card-title">🚗 Vehicle Owner</div>
            <div class="auth-type-card-desc">Personal garage for service logs, documents, insurance & Form 29/30 transfer packets.</div>
          </button>
          <button type="button" class="auth-type-card ${signupState.accountType === 'garage' ? 'active' : ''}" onclick="selectSignupAccountType('garage')">
            <div class="auth-type-card-title">🔧 Garage / Workshop</div>
            <div class="auth-type-card-desc">Commercial garage for managing repair jobs, multi-vehicle fleets, customer invoicing & staff.</div>
          </button>
        </div>
        ${signupState.accountType === 'garage' ? `
          <div class="auth-garage-select-wrap">
            <label for="authGarageTypeSelect"><b>Garage Specialization</b></label>
            <select id="authGarageTypeSelect" class="auth-garage-type-select" onchange="selectSignupGarageType(this.value)">
              <option value="Repair shop" ${signupState.garageType === 'Repair shop' ? 'selected' : ''}>Repair shop</option>
              <option value="Service provider" ${signupState.garageType === 'Service provider' ? 'selected' : ''}>Service provider</option>
              <option value="Car accessories" ${signupState.garageType === 'Car accessories' ? 'selected' : ''}>Car accessories</option>
              <option value="Car cleaning" ${signupState.garageType === 'Car cleaning' ? 'selected' : ''}>Car cleaning</option>
              <option value="Car maintenance" ${signupState.garageType === 'Car maintenance' ? 'selected' : ''}>Car maintenance</option>
            </select>
          </div>
        ` : ''}
        <button type="button" class="primary auth-step-btn" onclick="nextSignupStep(2)">Continue to Account Details</button>
        <button type="button" class="ghost auth-switch" onclick="cancelSignupFlow()">Back to Login</button>
      </div>
    `;
  } else if (signupState.currentStep === 2) {
    const isSignupAvailable = typeof backendAvailable === 'function' ? backendAvailable('auth_signup') : false;
    stepHtml = `
      <div class="auth-step-card">
        <div class="auth-step-title">Create Account Credentials</div>
        <p class="auth-step-desc">Enter your email and create a secure password.</p>
        
        <div class="auth-field">
          <label for="authStepEmail">Email Address</label>
          <input id="authStepEmail" type="email" placeholder="name@example.com" value="${esc(signupState.email)}">
        </div>
        
        <div class="auth-field">
          <label for="authStepPassword">Password</label>
          <div class="auth-password-control">
            <input id="authStepPassword" type="password" placeholder="Minimum 8 characters">
            <button class="auth-password-toggle" id="authStepPasswordToggle" type="button" onclick="toggleSignupPasswordVisibility()">Show</button>
          </div>
          <div class="auth-password-meta">
            <div class="auth-strength" id="authStepStrengthMeter" aria-label="Password strength">
              <span class="auth-strength-bar"><i></i><i></i><i></i></span>
              <b id="authStepStrengthLabel"></b>
            </div>
          </div>
        </div>

        <div id="authStepErrorMsg" class="auth-message error" style="display:${signupState.errorMessage ? 'block' : 'none'};"></div>

        ${isSignupAvailable ? `
          <button type="button" class="primary auth-step-btn" id="authStepSubmitCredsBtn" onclick="submitSignupCreds()">Create Account</button>
        ` : (typeof renderBackendBlockedCard === 'function' ? renderBackendBlockedCard('/api/auth/signup', 'POST', 'Account creation route is not enabled on this backend deployment.') : '')}
        
        <div class="auth-step-btn-row">
          <button type="button" class="ghost auth-switch" onclick="prevSignupStep(1)">Back</button>
          <button type="button" class="ghost auth-switch" onclick="cancelSignupFlow()">Cancel</button>
        </div>
      </div>
    `;
  } else if (signupState.currentStep === 3) {
    const isEmailOtpAvailable = typeof backendAvailable === 'function' ? backendAvailable('auth_email_otp') : false;
    stepHtml = `
      <div class="auth-step-card">
        <div class="auth-step-title">Verify Email Address</div>
        <p class="auth-step-desc">Enter the 6-digit verification code sent to <strong id="authStepEmailDisplay"></strong>.</p>
        
        ${isEmailOtpAvailable ? `
          ${signupState.emailOtpLocked ? `
            <div class="otp-lockout-card" role="alert">
              <strong>Account Verification Locked:</strong> Too many failed attempts. Temporarily locked for 15 minutes.
            </div>
          ` : `
            <div class="otp-input-wrap">
              <input id="authStepEmailOtp" class="otp-digit-box" type="text" maxlength="6" inputmode="numeric" pattern="[0-9]*" placeholder="••••••" oninput="this.value = this.value.replace(/[^0-9]/g, '')">
              <div id="authStepEmailOtpError" class="auth-message error" style="display:none;"></div>
            </div>
            <button type="button" class="primary auth-step-btn" id="authStepVerifyEmailBtn" onclick="submitEmailOtp()">Verify Code</button>
            <div class="otp-resend-row">
              <span class="otp-cooldown-text" id="authStepEmailCooldownText">${signupState.emailOtpCooldown > 0 ? `Resend in ${signupState.emailOtpCooldown}s` : 'Didn’t get a code?'}</span>
              <button type="button" class="otp-resend-btn" id="authStepEmailResendBtn" onclick="resendEmailOtp()" ${signupState.emailOtpCooldown > 0 ? 'disabled' : ''}>Resend OTP</button>
            </div>
          `}
        ` : (typeof renderBackendBlockedCard === 'function' ? renderBackendBlockedCard('/api/auth/email-otp/verify', 'POST', 'Email OTP verification route is not enabled on this deployment.') : '')}
        
        <div class="auth-step-btn-row">
          <button type="button" class="ghost auth-switch" onclick="cancelSignupFlow()">Cancel</button>
        </div>
      </div>
    `;
  } else if (signupState.currentStep === 4) {
    const isMobileOtpAvailable = typeof backendAvailable === 'function' ? backendAvailable('auth_mobile_otp') : false;
    stepHtml = `
      <div class="auth-step-card">
        <div class="auth-step-title">Link Mobile Number</div>
        <p class="auth-step-desc">A verified Indian mobile number is mandatory for all accounts.</p>
        
        ${isMobileOtpAvailable ? `
          <div class="auth-field">
            <label for="authStepMobile">Mobile Number</label>
            <div class="auth-mobile-input-wrap">
              <span class="auth-mobile-prefix">🇮🇳 +91</span>
              <input id="authStepMobile" class="auth-mobile-input" type="tel" maxlength="10" placeholder="98160 12345" value="${esc(signupState.mobile ? signupState.mobile.replace(/^\+91/, '') : '')}" ${signupState.mobileOtpSent ? 'readonly' : ''}>
            </div>
            <div id="authStepMobileError" class="auth-message error" style="display:none;"></div>
          </div>

          ${signupState.mobileOtpSent ? `
            <div class="otp-input-wrap">
              <label for="authStepMobileOtp">Enter 6-digit Mobile OTP</label>
              <input id="authStepMobileOtp" class="otp-digit-box" type="text" maxlength="6" inputmode="numeric" placeholder="••••••" oninput="this.value = this.value.replace(/[^0-9]/g, '')">
            </div>
            <button type="button" class="primary auth-step-btn" id="authStepVerifyMobileBtn" onclick="submitMobileOtp()">Verify Mobile Number</button>
            <div class="otp-resend-row">
              <span class="otp-cooldown-text" id="authStepMobileCooldownText">${signupState.mobileOtpCooldown > 0 ? `Resend in ${signupState.mobileOtpCooldown}s` : 'Didn’t get the SMS?'}</span>
              <button type="button" class="otp-resend-btn" id="authStepMobileResendBtn" onclick="resendMobileOtp()" ${signupState.mobileOtpCooldown > 0 ? 'disabled' : ''}>Resend OTP</button>
            </div>
          ` : `
            <button type="button" class="primary auth-step-btn" id="authStepSendMobileBtn" onclick="sendMobileOtp()">Send Verification OTP</button>
          `}
        ` : (typeof renderBackendBlockedCard === 'function' ? renderBackendBlockedCard('/api/auth/mobile-otp/verify', 'POST', 'Mobile OTP verification route is not enabled on this deployment.') : '')}
        
        <div class="auth-step-btn-row">
          <button type="button" class="ghost auth-switch" onclick="cancelSignupFlow()">Cancel</button>
        </div>
      </div>
    `;
  } else if (signupState.currentStep === 5) {
    const isProfileAvailable = typeof backendAvailable === 'function' ? backendAvailable('profile') : false;
    stepHtml = `
      <div class="auth-step-card">
        <div class="auth-step-title">${signupState.accountType === 'garage' ? 'Complete Garage Profile' : 'Complete Vehicle Owner Profile'}</div>
        <p class="auth-step-desc">Mandatory details required for statutory Form 29/30 packets and vehicle records.</p>
        
        <div class="profile-form-grid">
          ${signupState.accountType === 'garage' ? `
            <div class="auth-field full">
              <label for="authProfileGarageName">Garage / Business Name *</label>
              <input id="authProfileGarageName" type="text" placeholder="e.g. Apex Auto Care">
            </div>
            <div class="auth-field full">
              <label for="authProfileOwnerName">Proprietor / Owner Name *</label>
              <input id="authProfileOwnerName" type="text" placeholder="e.g. Rajesh Kumar">
            </div>
            <div class="auth-field full">
              <label for="authProfileGarageAddress">Workshop Address *</label>
              <input id="authProfileGarageAddress" type="text" placeholder="e.g. Plot 42, Phase 1, Industrial Area">
            </div>
            <div class="auth-field">
              <label for="authProfileCity">City *</label>
              <input id="authProfileCity" type="text" placeholder="e.g. Chandigarh">
            </div>
            <div class="auth-field">
              <label for="authProfileState">State *</label>
              <input id="authProfileState" type="text" placeholder="e.g. Punjab">
            </div>
            <div class="auth-field">
              <label for="authProfilePincode">Pincode (6 digits) *</label>
              <input id="authProfilePincode" type="text" maxlength="6" placeholder="e.g. 160002" oninput="this.value = this.value.replace(/[^0-9]/g, '')">
            </div>
            <div class="auth-field">
              <label for="authProfileGstin">GSTIN (Optional, 15 chars)</label>
              <input id="authProfileGstin" type="text" maxlength="15" placeholder="e.g. 03AAAAA0000A1Z5">
            </div>
          ` : `
            <div class="auth-field full">
              <label for="authProfileFullName">Full Legal Name *</label>
              <input id="authProfileFullName" type="text" placeholder="e.g. Ramesh Sharma">
            </div>
            <div class="auth-field full">
              <label for="authProfileAddress">Address Line *</label>
              <input id="authProfileAddress" type="text" placeholder="e.g. House No. 204, Sector 15">
            </div>
            <div class="auth-field">
              <label for="authProfileCity">City *</label>
              <input id="authProfileCity" type="text" placeholder="e.g. Shimla">
            </div>
            <div class="auth-field">
              <label for="authProfileState">State *</label>
              <input id="authProfileState" type="text" placeholder="e.g. Himachal Pradesh">
            </div>
            <div class="auth-field full">
              <label for="authProfilePincode">Pincode (6 digits) *</label>
              <input id="authProfilePincode" type="text" maxlength="6" placeholder="e.g. 171001" oninput="this.value = this.value.replace(/[^0-9]/g, '')">
            </div>
          `}
        </div>

        <div id="authProfileErrorMsg" class="auth-message error" style="display:none;"></div>
        <div id="authProfileSuccessMsg" class="auth-message ok" style="display:none;"></div>

        ${isProfileAvailable ? `
          <button type="button" class="primary auth-step-btn" id="authProfileSaveBtn" onclick="submitSignupProfile()">Save Profile</button>
        ` : (typeof renderBackendBlockedCard === 'function' ? renderBackendBlockedCard('/api/profile', 'PUT', 'Profile registration route is not enabled on this deployment.') : '')}
        
        <div class="auth-step-btn-row">
          <button type="button" class="ghost auth-switch" onclick="cancelSignupFlow()">Cancel</button>
        </div>
      </div>
    `;
  } else if (signupState.currentStep === 6) {
    stepHtml = `
      <div class="auth-step-card" style="text-align:center;">
        <div style="font-size:48px;line-height:1;margin-bottom:12px;">🎉</div>
        <div class="auth-step-title">Account Created &amp; Verified!</div>
        <p class="auth-step-desc">Your profile is saved and your account is ready to use.</p>
        <button type="button" class="primary auth-step-btn" onclick="finishSignup()">Go to Dashboard</button>
      </div>
    `;
  }

  container.innerHTML = bubblesHtml + stepHtml;

  // Post-render bindings
  if (signupState.currentStep === 2) {
    const passInput = document.getElementById('authStepPassword');
    if (passInput) {
      passInput.addEventListener('input', updateSignupPasswordMeter);
      updateSignupPasswordMeter();
    }
  } else if (signupState.currentStep === 3) {
    const emailDisp = document.getElementById('authStepEmailDisplay');
    if (emailDisp) {
      emailDisp.textContent = maskEmail(signupState.email);
    }
  }
}

async function submitSignupCreds() {
  if (typeof backendAvailable === 'function' && !backendAvailable('auth_signup')) return;
  const emailEl = document.getElementById('authStepEmail');
  const passEl = document.getElementById('authStepPassword');
  const errEl = document.getElementById('authStepErrorMsg');
  const btn = document.getElementById('authStepSubmitCredsBtn');

  const email = String(emailEl?.value || '').trim();
  const password = String(passEl?.value || '');

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (errEl) {
      errEl.textContent = 'Enter a valid email address.';
      errEl.style.display = 'block';
    }
    return;
  }

  const strength = evaluatePasswordStrength(password);
  if (!strength.isValid) {
    if (errEl) {
      errEl.textContent = 'Password must be at least 8 characters and contain at least one letter and one number.';
      errEl.style.display = 'block';
    }
    return;
  }

  if (errEl) {
    errEl.textContent = '';
    errEl.style.display = 'none';
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Creating account...';
  }

  try {
    const payload = {
      email: email.toLowerCase(),
      password,
      account_type: signupState.accountType,
      garage_type: signupState.accountType === 'garage' ? signupState.garageType : undefined
    };

    const res = await authApiRequest('/api/auth/signup', { method: 'POST', body: payload });

    if (!res || !res.ok) {
      const msg = String(res?.error || res?.message || 'Failed to create account. Please try again.');
      if (errEl) {
        errEl.textContent = msg;
        errEl.style.display = 'block';
      }
      return;
    }

    // Success! Clear password input and memory
    if (passEl) passEl.value = '';
    signupState.email = email.toLowerCase();
    signupState.errorMessage = '';
    signupState.currentStep = 3;
    renderSignupFlow();
    sendEmailOtp();
  } catch (err) {
    console.error('Signup credentials error:', err);
    if (errEl) {
      errEl.textContent = 'Network or server error: ' + (err?.message || 'Please try again.');
      errEl.style.display = 'block';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  }
}

function startEmailOtpCooldown(seconds = 30) {
  if (signupState.emailOtpTimer) clearInterval(signupState.emailOtpTimer);
  signupState.emailOtpCooldown = Math.max(0, Number(seconds) || 30);
  const updateUI = () => {
    const textEl = document.getElementById('authStepEmailCooldownText');
    const btnEl = document.getElementById('authStepEmailResendBtn');
    if (textEl) {
      textEl.textContent = signupState.emailOtpCooldown > 0 ? `Resend in ${signupState.emailOtpCooldown}s` : 'Didn’t get a code?';
    }
    if (btnEl) {
      btnEl.disabled = signupState.emailOtpCooldown > 0;
    }
  };
  updateUI();
  signupState.emailOtpTimer = setInterval(() => {
    signupState.emailOtpCooldown -= 1;
    updateUI();
    if (signupState.emailOtpCooldown <= 0) {
      clearInterval(signupState.emailOtpTimer);
      signupState.emailOtpTimer = null;
    }
  }, 1000);
  if (signupState.emailOtpTimer && typeof signupState.emailOtpTimer.unref === 'function') {
    signupState.emailOtpTimer.unref();
  }
}

async function sendEmailOtp() {
  if (typeof backendAvailable === 'function' && !backendAvailable('auth_email_otp')) return;
  startEmailOtpCooldown(30);
  try {
    await authApiRequest('/api/auth/email-otp/send', { method: 'POST', body: { email: signupState.email } });
    signupState.emailOtpSent = true;
  } catch (err) {
    console.error('Email OTP send error:', err);
  }
}

async function resendEmailOtp() {
  if (signupState.emailOtpCooldown > 0) return;
  await sendEmailOtp();
  toast('New email verification code sent.');
}

async function submitEmailOtp() {
  if (typeof backendAvailable === 'function' && !backendAvailable('auth_email_otp')) return;
  if (signupState.emailOtpLocked) return;

  const otpEl = document.getElementById('authStepEmailOtp');
  const errEl = document.getElementById('authStepEmailOtpError');
  const btn = document.getElementById('authStepVerifyEmailBtn');
  const code = String(otpEl?.value || '').trim();

  if (!/^\d{6}$/.test(code)) {
    if (errEl) {
      errEl.textContent = 'Enter a valid 6-digit verification code.';
      errEl.style.display = 'block';
    }
    return;
  }

  if (errEl) {
    errEl.textContent = '';
    errEl.style.display = 'none';
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Verifying...';
  }

  try {
    const res = await authApiRequest('/api/auth/email-otp/verify', { method: 'POST', body: { email: signupState.email, otp: code } });
    if (!res || !res.ok) {
      signupState.emailOtpFailedAttempts += 1;
      if (signupState.emailOtpFailedAttempts >= 5 || res?.status === 429) {
        signupState.emailOtpLocked = true;
        renderSignupFlow();
        return;
      }
      const msg = String(res?.error || 'Invalid verification code. Please try again.');
      if (errEl) {
        errEl.textContent = msg;
        errEl.style.display = 'block';
      }
      return;
    }

    // Success! Clear input and memory
    if (otpEl) otpEl.value = '';
    signupState.emailOtpVerified = true;
    signupState.currentStep = 4;
    renderSignupFlow();
  } catch (err) {
    console.error('Email OTP verify error:', err);
    if (errEl) {
      errEl.textContent = 'Verification error: ' + (err?.message || 'Please retry.');
      errEl.style.display = 'block';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Verify Code';
    }
  }
}

function startMobileOtpCooldown(seconds = 30) {
  if (signupState.mobileOtpTimer) clearInterval(signupState.mobileOtpTimer);
  signupState.mobileOtpCooldown = Math.max(0, Number(seconds) || 30);
  const updateUI = () => {
    const textEl = document.getElementById('authStepMobileCooldownText');
    const btnEl = document.getElementById('authStepMobileResendBtn');
    if (textEl) {
      textEl.textContent = signupState.mobileOtpCooldown > 0 ? `Resend in ${signupState.mobileOtpCooldown}s` : 'Didn’t get the SMS?';
    }
    if (btnEl) {
      btnEl.disabled = signupState.mobileOtpCooldown > 0;
    }
  };
  updateUI();
  signupState.mobileOtpTimer = setInterval(() => {
    signupState.mobileOtpCooldown -= 1;
    updateUI();
    if (signupState.mobileOtpCooldown <= 0) {
      clearInterval(signupState.mobileOtpTimer);
      signupState.mobileOtpTimer = null;
    }
  }, 1000);
  if (signupState.mobileOtpTimer && typeof signupState.mobileOtpTimer.unref === 'function') {
    signupState.mobileOtpTimer.unref();
  }
}

async function sendMobileOtp() {
  if (typeof backendAvailable === 'function' && !backendAvailable('auth_mobile_otp')) return;
  const mobileInput = document.getElementById('authStepMobile');
  const errEl = document.getElementById('authStepMobileError');
  const btn = document.getElementById('authStepSendMobileBtn');

  const raw = String(mobileInput?.value || '').trim();
  const normalized = normalizeMobile(raw);

  if (!normalized) {
    if (errEl) {
      errEl.textContent = 'Enter a valid 10-digit Indian mobile number (starts with 6, 7, 8, or 9).';
      errEl.style.display = 'block';
    }
    return;
  }

  const fullMobile = '+91' + normalized;

  if (errEl) {
    errEl.textContent = '';
    errEl.style.display = 'none';
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Sending SMS...';
  }

  try {
    const res = await authApiRequest('/api/auth/mobile-otp/send', { method: 'POST', body: { mobile: fullMobile } });
    if (!res || !res.ok) {
      const msg = String(res?.error || 'Failed to send OTP to this mobile number.');
      if (errEl) {
        errEl.textContent = msg;
        errEl.style.display = 'block';
      }
      return;
    }

    signupState.mobile = fullMobile;
    signupState.mobileOtpSent = true;
    renderSignupFlow();
    startMobileOtpCooldown(30);
  } catch (err) {
    console.error('Mobile OTP send error:', err);
    if (errEl) {
      errEl.textContent = 'Error sending SMS OTP: ' + (err?.message || 'Please retry.');
      errEl.style.display = 'block';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Send Verification OTP';
    }
  }
}

async function resendMobileOtp() {
  if (signupState.mobileOtpCooldown > 0) return;
  await sendMobileOtp();
  toast('New SMS verification code sent.');
}

async function submitMobileOtp() {
  if (typeof backendAvailable === 'function' && !backendAvailable('auth_mobile_otp')) return;
  const otpEl = document.getElementById('authStepMobileOtp');
  const errEl = document.getElementById('authStepMobileError');
  const btn = document.getElementById('authStepVerifyMobileBtn');
  const code = String(otpEl?.value || '').trim();

  if (!/^\d{6}$/.test(code)) {
    if (errEl) {
      errEl.textContent = 'Enter a valid 6-digit mobile OTP.';
      errEl.style.display = 'block';
    }
    return;
  }

  if (errEl) {
    errEl.textContent = '';
    errEl.style.display = 'none';
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Verifying...';
  }

  try {
    const res = await authApiRequest('/api/auth/mobile-otp/verify', { method: 'POST', body: { mobile: signupState.mobile, otp: code } });
    if (!res || !res.ok) {
      const msg = String(res?.error || 'Invalid mobile OTP code.');
      if (errEl) {
        errEl.textContent = msg;
        errEl.style.display = 'block';
      }
      return;
    }

    // Success! Clear input and memory
    if (otpEl) otpEl.value = '';
    signupState.mobileOtpVerified = true;
    signupState.currentStep = 5;
    renderSignupFlow();
  } catch (err) {
    console.error('Mobile OTP verify error:', err);
    if (errEl) {
      errEl.textContent = 'Verification error: ' + (err?.message || 'Please retry.');
      errEl.style.display = 'block';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Verify Mobile Number';
    }
  }
}

async function submitSignupProfile() {
  if (typeof backendAvailable === 'function' && !backendAvailable('profile')) return;
  const errEl = document.getElementById('authProfileErrorMsg');
  const successEl = document.getElementById('authProfileSuccessMsg');
  const btn = document.getElementById('authProfileSaveBtn');

  let payload = {};
  if (signupState.accountType === 'garage') {
    const garageName = String(document.getElementById('authProfileGarageName')?.value || '').trim();
    const ownerName = String(document.getElementById('authProfileOwnerName')?.value || '').trim();
    const garageAddress = String(document.getElementById('authProfileGarageAddress')?.value || '').trim();
    const city = String(document.getElementById('authProfileCity')?.value || '').trim();
    const state = String(document.getElementById('authProfileState')?.value || '').trim();
    const pincode = String(document.getElementById('authProfilePincode')?.value || '').trim();
    const gstin = String(document.getElementById('authProfileGstin')?.value || '').trim();

    if (!garageName || !ownerName || !garageAddress || !city || !state || !pincode) {
      if (errEl) {
        errEl.textContent = 'Please fill in all mandatory garage profile fields.';
        errEl.style.display = 'block';
      }
      return;
    }
    if (!/^\d{6}$/.test(pincode)) {
      if (errEl) {
        errEl.textContent = 'Pincode must be exactly 6 digits.';
        errEl.style.display = 'block';
      }
      return;
    }
    if (gstin && gstin.length !== 15) {
      if (errEl) {
        errEl.textContent = 'GSTIN must be exactly 15 characters if provided.';
        errEl.style.display = 'block';
      }
      return;
    }

    payload = {
      account_type: 'garage',
      garage_name: garageName,
      owner_name: ownerName,
      garage_type: signupState.garageType,
      garage_address: garageAddress,
      city,
      state,
      pincode,
      gstin: gstin || undefined,
      mobile: signupState.mobile
    };
  } else {
    const fullName = String(document.getElementById('authProfileFullName')?.value || '').trim();
    const address = String(document.getElementById('authProfileAddress')?.value || '').trim();
    const city = String(document.getElementById('authProfileCity')?.value || '').trim();
    const state = String(document.getElementById('authProfileState')?.value || '').trim();
    const pincode = String(document.getElementById('authProfilePincode')?.value || '').trim();

    if (!fullName || !address || !city || !state || !pincode) {
      if (errEl) {
        errEl.textContent = 'Please fill in all mandatory vehicle owner profile fields.';
        errEl.style.display = 'block';
      }
      return;
    }
    if (!/^\d{6}$/.test(pincode)) {
      if (errEl) {
        errEl.textContent = 'Pincode must be exactly 6 digits.';
        errEl.style.display = 'block';
      }
      return;
    }

    payload = {
      account_type: 'vehicle_owner',
      full_name: fullName,
      address_line: address,
      city,
      state,
      pincode,
      mobile: signupState.mobile
    };
  }

  if (errEl) {
    errEl.textContent = '';
    errEl.style.display = 'none';
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving Profile...';
  }

  try {
    const res = await authApiRequest('/api/profile', { method: 'PUT', body: payload });
    if (!res || !res.ok) {
      const msg = String(res?.error || 'Failed to save profile. Please try again.');
      if (errEl) {
        errEl.textContent = msg;
        errEl.style.display = 'block';
      }
      return;
    }

    // Success! Show "Profile saved" ONLY after server returns ok
    if (successEl) {
      successEl.textContent = 'Profile saved';
      successEl.style.display = 'block';
    }
    signupState.profileSaved = true;
    toast('Profile saved');
    setTimeout(() => {
      signupState.currentStep = 6;
      renderSignupFlow();
    }, 600);
  } catch (err) {
    console.error('Profile save error:', err);
    if (errEl) {
      errEl.textContent = 'Profile save failed: ' + (err?.message || 'Please retry.');
      errEl.style.display = 'block';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save Profile';
    }
  }
}

function finishSignup() {
  resetSignupState();
  signup = false;
  const auth = document.getElementById('auth');
  if (auth) auth.classList.add('hidden');
  document.body.classList.remove('td-auth-open');
  nav('dashboard');
}

/* UI-ONLY: Profile gate enforcement in browser. Backend must enforce server-side. */
async function checkProfileGate(u) {
  const primaryAdminEmail = 'rnyburia@gmail.com';
  const isCandidateAdmin = isSuperAdmin || Boolean(currentAdminRole) || (u && (u.role === 'admin' || u.role === 'super_admin' || String(u.email || '').trim().toLowerCase() === primaryAdminEmail));
  if (isCandidateAdmin) return true;

  if (typeof backendAvailable === 'function' && !backendAvailable('profile_status')) {
    renderProfileGateBlocked('/api/profile/status', 'GET', 'Profile gate capability is BLOCKED because the backend route is not deployed.');
    return false; // Fail closed
  }

  try {
    const res = await authApiRequest('/api/profile/status', { method: 'GET' });
    if (!res || !res.ok || !res.data) {
      renderProfileGateBlocked('/api/profile/status', 'GET', 'Profile status returned an error or missing data.');
      return false; // Fail closed
    }
    const data = res.data;
    const isEmailOk = Boolean(data.email_verified);
    const isMobileOk = Boolean(data.mobile_verified);
    const isProfileOk = Boolean(data.profile_complete);

    if (isEmailOk && isMobileOk && isProfileOk) {
      removeProfileGateOverlay();
      return true;
    }

    renderProfileGateMissing(data);
    return false;
  } catch (err) {
    console.error('Profile gate status fetch failed:', err);
    renderProfileGateBlocked('/api/profile/status', 'GET', 'Profile status route is missing or unreachable (404). Dashboard access blocked.');
    return false; // Fail closed
  }
}

function removeProfileGateOverlay() {
  const overlay = document.getElementById('profileGateOverlay');
  if (overlay) overlay.remove();
}

function renderProfileGateBlocked(routePath, method, note) {
  removeProfileGateOverlay();
  const overlay = document.createElement('div');
  overlay.id = 'profileGateOverlay';
  overlay.className = 'profile-gate-overlay';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'profileGateTitle');

  const blockedCardHtml = typeof renderBackendBlockedCard === 'function'
    ? renderBackendBlockedCard(routePath, method, note)
    : `<div class="backend-blocked-card"><div class="backend-blocked-badge">BLOCKED</div><div class="backend-blocked-route"><code>${method} ${routePath}</code></div><p class="backend-blocked-desc">${esc(note)}</p></div>`;

  overlay.innerHTML = `
    <div class="profile-gate-box">
      <div class="profile-gate-head">
        <div class="profile-gate-icon" aria-hidden="true">🔒</div>
        <h2 class="profile-gate-title" id="profileGateTitle">Access Verification Blocked</h2>
        <p class="profile-gate-desc">Your account access could not be validated because a required verification endpoint is unavailable.</p>
      </div>
      <div class="profile-gate-content">
        ${blockedCardHtml}
      </div>
      <div class="profile-gate-actions">
        <button type="button" class="ghost profile-gate-signout-btn" onclick="profileGateSignOut()">Sign Out</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function renderProfileGateMissing(data) {
  removeProfileGateOverlay();
  const overlay = document.createElement('div');
  overlay.id = 'profileGateOverlay';
  overlay.className = 'profile-gate-overlay';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'profileGateTitle');

  const missing = [];
  if (!data?.email_verified) missing.push('Email OTP verification');
  if (!data?.mobile_verified) missing.push('Mandatory Indian mobile number (+91)');
  if (!data?.profile_complete) missing.push('Mandatory profile details (Name, Address, Pincode)');

  const missingListHtml = missing.map(m => `
    <div class="profile-gate-missing-item">
      <span class="profile-gate-missing-dot" aria-hidden="true"></span>
      <span>${esc(m)}</span>
    </div>
  `).join('');

  overlay.innerHTML = `
    <div class="profile-gate-box">
      <div class="profile-gate-head">
        <div class="profile-gate-icon" aria-hidden="true">⚠️</div>
        <h2 class="profile-gate-title" id="profileGateTitle">Profile Completion Required</h2>
        <p class="profile-gate-desc">Your profile is incomplete. Complete all mandatory verification steps below to access your Torq Desk garage.</p>
      </div>
      <div class="profile-gate-missing-list">
        ${missingListHtml}
      </div>
      <div class="profile-gate-actions">
        <button type="button" class="primary" onclick="profileGateResumeVerification()">Complete Verification</button>
        <button type="button" class="ghost profile-gate-signout-btn" onclick="profileGateSignOut()">Sign Out</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function profileGateSignOut() {
  removeProfileGateOverlay();
  if (db?.auth?.signOut) {
    db.auth.signOut();
  }
  showLogin();
}

function profileGateResumeVerification() {
  removeProfileGateOverlay();
  showTorqDeskAuth('signup');
}

function renderMobileChangeBlocked() {
  let blockedEl = document.getElementById('profileMobileChangeBlocked');
  if (!blockedEl) {
    blockedEl = document.createElement('div');
    blockedEl.id = 'profileMobileChangeBlocked';
    blockedEl.style.marginTop = '14px';
    const formSection = document.getElementById('ownerProfileEditSection') || document.getElementById('ownerProfileContent');
    formSection?.appendChild(blockedEl);
  }
  const blockedHtml = typeof renderBackendBlockedCard === 'function'
    ? renderBackendBlockedCard('/api/profile/mobile-change/send', 'POST', 'Changing your verified mobile number requires fresh OTP verification. This route is currently BLOCKED.')
    : '<div class="backend-blocked-card"><div class="backend-blocked-badge">BLOCKED</div><div class="backend-blocked-route"><code>POST /api/profile/mobile-change/send</code></div><p class="backend-blocked-desc">Mobile number change is blocked.</p></div>';
  blockedEl.innerHTML = blockedHtml;
  toast('Mobile change blocked: route not deployed.', 'error');
}

function openMobileChangeOtpModal(newMobile) {
  let modal = document.getElementById('profileMobileOtpModal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'profileMobileOtpModal';
  modal.className = 'admin-modal-overlay';
  modal.innerHTML = `
    <div class="admin-modal-box" style="max-width:440px;">
      <div class="admin-modal-head">
        <h3>Verify New Mobile Number</h3>
        <button type="button" class="ghost" onclick="document.getElementById('profileMobileOtpModal').remove()">×</button>
      </div>
      <p class="muted" style="margin:0;font-size:13px;">A 6-digit verification code will be sent to <strong>${esc(newMobile)}</strong>.</p>
      <div class="profile-mobile-otp-wrap">
        <input id="profileMobileOtpInput" class="otp-digit-box" type="text" maxlength="6" inputmode="numeric" placeholder="••••••" oninput="this.value = this.value.replace(/[^0-9]/g, '')">
        <div id="profileMobileOtpError" class="auth-message error" style="display:none;"></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button type="button" class="ghost" onclick="document.getElementById('profileMobileOtpModal').remove()">Cancel</button>
        <button type="button" class="primary" id="profileMobileOtpVerifyBtn" onclick="submitMobileChangeOtp('${esc(newMobile)}')">Verify &amp; Update Mobile</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  authApiRequest('/api/profile/mobile-change/send', { method: 'POST', body: { new_mobile: newMobile } }).catch(e => console.error('Mobile change send error:', e));
}

async function submitMobileChangeOtp(newMobile) {
  const input = document.getElementById('profileMobileOtpInput');
  const errEl = document.getElementById('profileMobileOtpError');
  const btn = document.getElementById('profileMobileOtpVerifyBtn');
  const code = String(input?.value || '').trim();

  if (!/^\d{6}$/.test(code)) {
    if (errEl) {
      errEl.textContent = 'Enter a valid 6-digit verification code.';
      errEl.style.display = 'block';
    }
    return;
  }

  if (errEl) {
    errEl.textContent = '';
    errEl.style.display = 'none';
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Verifying...';
  }

  try {
    const res = await authApiRequest('/api/profile/mobile-change/verify', { method: 'POST', body: { new_mobile: newMobile, otp: code } });
    if (!res || !res.ok) {
      const msg = String(res?.error || 'Invalid OTP code.');
      if (errEl) {
        errEl.textContent = msg;
        errEl.style.display = 'block';
      }
      return;
    }

    if (ownerProfile) ownerProfile.phone = newMobile;
    const modal = document.getElementById('profileMobileOtpModal');
    if (modal) modal.remove();
    toast('Mobile number updated successfully.');
    ownerProfileView();
  } catch (err) {
    console.error('Mobile change verify error:', err);
    if (errEl) {
      errEl.textContent = 'Error: ' + (err?.message || 'Verification failed.');
      errEl.style.display = 'block';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Verify & Update Mobile';
    }
  }
}

// Global exports
window.authApiRequest = authApiRequest;
window.signupState = signupState;
window.renderSignupFlow = renderSignupFlow;
window.resetSignupState = resetSignupState;
window.cancelSignupFlow = cancelSignupFlow;
window.selectSignupAccountType = selectSignupAccountType;
window.selectSignupGarageType = selectSignupGarageType;
window.nextSignupStep = nextSignupStep;
window.prevSignupStep = prevSignupStep;
window.toggleSignupPasswordVisibility = toggleSignupPasswordVisibility;
window.evaluatePasswordStrength = evaluatePasswordStrength;
window.updateSignupPasswordMeter = updateSignupPasswordMeter;
window.submitSignupCreds = submitSignupCreds;
window.startEmailOtpCooldown = startEmailOtpCooldown;
window.sendEmailOtp = sendEmailOtp;
window.resendEmailOtp = resendEmailOtp;
window.submitEmailOtp = submitEmailOtp;
window.startMobileOtpCooldown = startMobileOtpCooldown;
window.sendMobileOtp = sendMobileOtp;
window.resendMobileOtp = resendMobileOtp;
window.submitMobileOtp = submitMobileOtp;
window.submitSignupProfile = submitSignupProfile;
window.finishSignup = finishSignup;
window.checkProfileGate = checkProfileGate;
window.removeProfileGateOverlay = removeProfileGateOverlay;
window.renderProfileGateBlocked = renderProfileGateBlocked;
window.renderProfileGateMissing = renderProfileGateMissing;
window.profileGateSignOut = profileGateSignOut;
window.profileGateResumeVerification = profileGateResumeVerification;
window.renderMobileChangeBlocked = renderMobileChangeBlocked;
window.openMobileChangeOtpModal = openMobileChangeOtpModal;
window.submitMobileChangeOtp = submitMobileChangeOtp;

function updateAuthModeUI(){
 const auth=$('auth'),title=$('authTitle'),copy=$('authModeCopy'),kicker=$('authModeKicker'),toggle=$('toggleAuth'),authBtn=$('authBtn'),pass=$('password'),name=$('fullName'),mobile=$('mobile'),meta=document.querySelector('.auth-password-meta');
 if(title)title.textContent=signup?'Create your account':'Vehicle Records';
 if(kicker)kicker.textContent=signup?'NEW GARAGE':'YOUR VEHICLE RECORDS';
 if(copy)copy.textContent=signup?'Create a private garage for your vehicle history and documents.':'Sign in to keep your vehicle history, documents and reports together.';
 if(toggle)toggle.textContent=signup?'Back to login':'Create account';
 if(authBtn&&!authBtn.disabled)authBtn.textContent=signup?'Create account':'Login';
 auth?.classList.toggle('auth-signup-active',signup);
 [name,mobile].forEach(el=>{if(el){el.disabled=!signup;el.setAttribute('aria-hidden',String(!signup));el.setAttribute('autocomplete',signup?(el.id==='fullName'?'name':'tel-national'):'off')}});
 if(pass)pass.setAttribute('autocomplete',signup?'new-password':'current-password');
 if(meta)meta.hidden=!signup;
 if(!signup){setFieldState('fullName');setFieldState('mobile');}
 updateAuthSubmitState();
 const loginTab=$('mobileLoginTab'),signupTab=$('mobileSignupTab');
 loginTab?.classList.toggle('is-active',!signup);
 signupTab?.classList.toggle('is-active',signup);

 const authFormEl=$('authForm');
 const authSignupFlowEl=$('authSignupFlow');
 if(authFormEl&&authSignupFlowEl){
   if(signup){
     authFormEl.classList.add('hidden');
     authSignupFlowEl.classList.remove('hidden');
     renderSignupFlow();
   }else{
     authSignupFlowEl.classList.add('hidden');
     authFormEl.classList.remove('hidden');
     resetSignupState();
   }
 }
}

function bindMobileAuthTabs(){
 const auth=$('auth');
 if(auth?.dataset.mobileTabsBound)return;
 if(auth)auth.dataset.mobileTabsBound='1';

 const open=(mode)=>{
   signup=mode;
   auth?.classList.add('auth-mobile-open');
   updateAuthModeUI();
   /* Keep the login/signup card anchored in its current mobile viewport.
      Auto-scroll here made the card and fixed footer appear to jump. */
   requestAnimationFrame(()=>{
     const card=$('authCard')||document.querySelector('.auth-card');
     if(card) card.style.scrollMarginTop='12px';
   });
 };

 $('mobileLoginTab')?.addEventListener('click',()=>open(false));
 $('mobileSignupTab')?.addEventListener('click',()=>open(true));
}
function bindAuthPasswordToggle(){
 const auth=$('auth');
 if(auth?.dataset.passwordToggleBound)return;
 if(auth)auth.dataset.passwordToggleBound='1';
 $('passwordToggle')?.addEventListener('click',()=>{
  const input=$('password'),btn=$('passwordToggle');if(!input||!btn)return;
  const show=input.type==='password';input.type=show?'text':'password';
  btn.textContent=show?'Hide':'Show';btn.setAttribute('aria-label',show?'Hide password':'Show password');btn.setAttribute('aria-pressed',String(show));input.focus();
 });
}
function showAppLoading(){
 const existing=document.getElementById('appLoadingOverlay');if(existing)existing.remove();
 const o=document.createElement('div');
 o.id='appLoadingOverlay';
 o.setAttribute('role','progressbar');
 o.setAttribute('aria-valuemin','0');
 o.setAttribute('aria-valuemax','100');
 o.setAttribute('aria-valuenow','0');
 o.setAttribute('aria-label','Loading Torq Desk');
 o.innerHTML='<div class="app-loading-panel">'+
   '<div class="app-loading-brand" aria-label="Torq Desk">'+
     '<img class="app-loading-brand-mark" src="assets/torqdesk-icon.svg?v=2026.10.13-home" alt="">'+
     '<span class="app-loading-brand-name">Torq <i>Desk</i></span>'+
   '</div>'+
   '<div class="app-loading-visual" aria-hidden="true">'+
     '<div class="app-loading-sky"><div class="app-loading-hills"></div></div>'+
     '<div class="app-loading-ground-shadow"></div>'+
     '<div class="app-loading-road">'+
       '<div class="app-loading-road-markings"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>'+
       '<div class="app-loading-finish"></div>'+
     '</div>'+
     '<div class="loading-car-position" id="appLoadingCar">'+
       '<div class="loading-car-scene">'+
         '<div class="app-loading-smoke" id="appLoadingSmoke">'+
           '<span class="app-loading-smoke-puff"></span><span class="app-loading-smoke-puff"></span><span class="app-loading-smoke-puff"></span><span class="app-loading-smoke-puff"></span>'+
           '<span class="app-loading-smoke-puff"></span><span class="app-loading-smoke-puff"></span><span class="app-loading-smoke-puff"></span><span class="app-loading-smoke-puff"></span>'+
         '</div>'+
         '<svg class="loading-car-svg" viewBox="0 0 260 100" aria-hidden="true">'+
           '<path class="car-body" d="M35 63h190c5 0 9 4 9 9v6H26v-7c0-5 4-8 9-8Z"/>'+
           '<path class="car-roof" d="M72 63 94 34c3-4 8-6 13-6h51c6 0 11 3 15 8l20 27Z"/>'+
           '<path class="car-window" d="M103 35 88 57h35V35Zm43 0v22h33l-16-22Z"/>'+
           '<path class="car-trim" d="M31 68h198v5H31z"/>'+
           '<circle class="car-wheel" cx="76" cy="78" r="13"/><circle class="car-wheel" cx="190" cy="78" r="13"/>'+
           '<circle class="car-hub" cx="76" cy="78" r="5"/><circle class="car-hub" cx="190" cy="78" r="5"/>'+
           '<circle class="car-light" cx="224" cy="68" r="3"/><path class="car-shadow-line" d="M53 84h159v3H53z"/>'+
         '</svg>'+
       '</div>'+
     '</div>'+
   '</div>'+
   '<div class="app-loading-progress-row">'+
     '<div class="app-loading-progress-track" aria-hidden="true"><div class="app-loading-progress-fill" id="appLoadingProgressFill"></div></div>'+
     '<span class="app-loading-percent" id="appLoadingPercent" aria-hidden="true">0%</span>'+
   '</div>'+
   '<div class="app-loading-title" id="appLoadingTitle" aria-live="polite">Preparing your secure garage...</div>'+
   '<div class="app-loading-sub" id="appLoadingSub" aria-live="polite">Verifying secure session and loading your vehicles</div>'+
 '</div>';
 document.body.appendChild(o);

 const state={value:0,target:0,visibleSince:performance.now(),raf:0,smokeIndex:0,lastSmoke:0,lastFrame:performance.now(),slowTimer:0,failsafeTimer:0,visibilityHandler:null,stopped:false};
 o._loadingState=state;

 const resetWatchdog=(ms=15000)=>{
   if(state.failsafeTimer)clearTimeout(state.failsafeTimer);
   if(state.stopped)return;
   state.failsafeTimer=setTimeout(()=>{
     if(!state.stopped && document.body.contains(o)){
       console.warn('Dashboard loading reached safety limit; aborting stall.');
       hideAppLoading();
       if(!car || startupFailed || !startedUserId){
         $('app')?.classList.remove('hidden');
         renderDashboardRecoveryUI(new Error('Connection timed out while loading your garage.'));
       }
     }
   },ms);
 };
 state.resetWatchdog=resetWatchdog;

 o._loadingSetProgress=(pct)=>{
   const next=Math.max(0,Math.min(100,Number(pct)||0));
   state.target=Math.max(state.target,next);
   o.setAttribute('aria-valuenow',String(Math.round(state.target)));
   resetWatchdog(15000);
 };
 o._loadingFrame=(now)=>{
   if(state.stopped)return;
   const dt=Math.min(64,now-state.lastFrame);state.lastFrame=now;
   const diff=state.target-state.value;
   if(diff>0)state.value=Math.min(state.target,state.value+Math.max(.045,diff*.075*(dt/16.67)));
   const pct=Math.max(0,Math.min(100,state.value));
   o.style.setProperty('--loading-parallax',(-pct*.32)+'px');
   const carEl=document.getElementById('appLoadingCar');
   if(carEl)carEl.style.left=(4+(pct*.92))+'%';
   const fill=document.getElementById('appLoadingProgressFill');
   if(fill)fill.style.transform='scaleX('+(pct/100)+')';
   const percent=document.getElementById('appLoadingPercent');
   if(percent)percent.textContent=Math.round(pct)+'%';
   if(carEl){
     const speed=Math.min(1,Math.max(0,(state.target-state.value)*.08));
     carEl.dataset.speed=speed.toFixed(3);
     if(speed>0.012 && !document.hidden && now-state.lastSmoke>(170-speed*115)){
       const puffs=o.querySelectorAll('.app-loading-smoke-puff');
       const puff=puffs[state.smokeIndex%puffs.length];
       state.smokeIndex++;
       state.lastSmoke=now;
       puff.classList.remove('is-live');
       puff.style.setProperty('--puff-size',(6+speed*8)+'px');
       puff.style.setProperty('--puff-duration',(780-speed*220)+'ms');
       puff.style.animationDelay='0ms';
       void puff.offsetWidth;
       puff.classList.add('is-live');
     }
   }
   state.raf=requestAnimationFrame(o._loadingFrame);
 };
 state.visibilityHandler=()=>{
   o.classList.toggle('app-loading-paused',document.hidden);
   if(!document.hidden)state.lastFrame=performance.now();
 };
 document.addEventListener('visibilitychange',state.visibilityHandler);
 state.slowTimer=setTimeout(()=>{
   if(!state.stopped && !o.classList.contains('loading-out')){
     setAppLoadingStatus('Taking longer than usual...','Your secure garage is still loading. Please keep this window open.');
   }
 },10000);
 resetWatchdog(15000);
 requestAnimationFrame(o._loadingFrame);
 return o;
}
function setAppLoadingStatus(title,sub){
 if($('appLoadingTitle'))$('appLoadingTitle').textContent=title;
 if($('appLoadingSub'))$('appLoadingSub').textContent=sub;
 const o=document.getElementById('appLoadingOverlay');
 if(o?._loadingState?.resetWatchdog)o._loadingState.resetWatchdog(15000);
}
function setAppLoadingProgress(pct){
 const o=document.getElementById('appLoadingOverlay');
 if(o&&o._loadingSetProgress)o._loadingSetProgress(pct);
}
function hideAppLoading(){
 const o=document.getElementById('appLoadingOverlay');
 if(!o)return;
 const state=o._loadingState;
 const elapsed=performance.now()-(state?.visibleSince||performance.now());
 const wait=Math.max(0,120-elapsed);
 const finish=()=>{
   if(!document.body.contains(o))return;
   if(state){
     state.stopped=true;
     if(state.raf)cancelAnimationFrame(state.raf);
     if(state.slowTimer)clearTimeout(state.slowTimer);
     if(state.failsafeTimer)clearTimeout(state.failsafeTimer);
     if(state.visibilityHandler)document.removeEventListener('visibilitychange',state.visibilityHandler);
   }
   o.classList.add('loading-out');
   setTimeout(()=>o.remove(),380);
 };
 setTimeout(finish,wait);
}
function dateOnlyEnd(x){if(!x)return null;let p=String(x).split('-').map(Number);if(p.length!==3||p.some(Number.isNaN))return null;return new Date(p[0],p[1]-1,p[2],23,59,59,999)}
function st(x){if(!x)return['MISSING','bad'];let d=dateOnlyEnd(x);if(!d)return['MISSING','bad'];let days=(d-Date.now())/86400000;return days<0?['EXPIRED','bad']:days<=30?['EXPIRING SOON','warn']:['VALID','ok']}
function closeSideMenu(){const m=$('sideMenu');if(!m)return;m.setAttribute('aria-hidden','true');$('menuToggle')?.setAttribute('aria-expanded','false');document.body.classList.remove('menu-open')}
function openSideMenu(){const m=$('sideMenu');if(!m||$('app')?.classList.contains('hidden'))return;m.setAttribute('aria-hidden','false');$('menuToggle')?.setAttribute('aria-expanded','true');document.body.classList.add('menu-open');updateDrawerContext()}
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
 if(!window.__drawerCarBound){
   $('drawerCar')?.addEventListener('click',()=>{
     if(cars.length>1)window.openVehicleSwitcher();
     else nav('cars');
   });
   $('mobileCarReg')?.addEventListener('click',()=>{
     if(cars.length>1)window.openVehicleSwitcher();
     else nav('cars');
   });
   window.__drawerCarBound=true;
 }
}
async function nav(v){
 closeSideMenu();
 const primaryAdminEmail='rnyburia@gmail.com';
 const isPrimaryAdmin=String(user?.email||'').trim().toLowerCase()===primaryAdminEmail;
 document.body.classList.toggle('td-admin-mode',isPrimaryAdmin);
 const validViews=['dashboard','cars','add','history','docs','report','owner','help'];
 if(v==='admin'&&!isPrimaryAdmin){
   toast('Page not found.','error');
   v='dashboard';
 }
 if(v==='admin'&&isPrimaryAdmin&&!validViews.includes('admin'))validViews.push('admin');
 if(!validViews.includes(v))v='dashboard';
 try{
   if(v==='add'&&car?.vehicle_status==='sold'){
     toast('Sold vehicle is read-only. Service logging is locked.','error');
     return;
   }
   if(v==='add'&&!(await ensureRequiredCarDetails()))return;
   const target=$(v);
   if(!target){toast('Requested view is unavailable.','error');return}
   const previous=document.querySelector('.view.active');
   document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
   target.classList.add('active');
   window.scrollTo({top:0,left:0,behavior:'auto'});
   try{
     if(v==='add')prefillRecordForm();
     if(v==='dashboard')dash();
     if(v==='cars')carsView();
     if(v==='history')renderHistory();
     if(v==='docs')await docsView();
     if(v==='report')report();
     if(v==='owner'){
       if(previous&&previous.id!=='owner'){
         isOwnerProfileEditOpen=false;
         isChangePasswordOpen=false;
       }
       ownerProfileView();
     }
     if(v==='help')helpView();
     if(v==='admin')await adminView();
   }catch(err){
     console.error('View render error:',v,err);
     if(v==='help'){
       target.classList.add('active');
       const container=$('helpTabContent');
       if(container){
         container.innerHTML='<div class="card" style="text-align:center;padding:36px 16px;margin-top:12px">'+
           '<div style="font-size:36px;margin-bottom:12px" aria-hidden="true">⚠️</div>'+
           '<h3 style="margin-bottom:8px">Unable to display Help & Support</h3>'+
           '<p class="muted" style="max-width:520px;margin:0 auto 20px auto">A temporary rendering issue occurred: '+esc(err?.message||'Unknown error')+'.</p>'+
           '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button type="button" class="primary" onclick="helpView()">Retry Loading Help</button><button type="button" class="ghost" onclick="nav(\'dashboard\')">Go to Dashboard</button></div>'+
         '</div>';
       }
       try{localStorage.setItem('carcare_last_view','help')}catch(e){}
       return;
     }
     target.classList.remove('active');
     if(previous&&previous!==target)previous.classList.add('active');
     toast('Unable to open '+(v==='owner'?'Owner Profile':v)+' right now. Please try again.','error');
     if(v!=='dashboard'){
       const dashboard=$('dashboard');
       document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
       if(dashboard){
         dashboard.classList.add('active');
         try{dash()}catch(dashboardErr){console.error('Dashboard render error:',dashboardErr)}
       }
       try{localStorage.setItem('carcare_last_view','dashboard')}catch(e){}
     }
     return;
   }
   try{localStorage.setItem('carcare_last_view',v)}catch(e){}
   document.querySelectorAll('aside button,.mobile-nav button,.drawer-link,.drawer-utility[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===v));
   closeSideMenu();
 }catch(err){
   console.error('Navigation error:',err);
   toast('Navigation failed. Please try again.','error');
   try{localStorage.setItem('carcare_last_view','dashboard')}catch(e){}
   document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
   $('dashboard')?.classList.add('active');
 }
}

document.querySelectorAll('aside button,.mobile-nav button,.drawer-link,.drawer-utility[data-view]').forEach(x=>x.onclick=()=>nav(x.dataset.view));
$('menuToggle')?.addEventListener('click',openSideMenu);
$('brandHome')?.addEventListener('click',e=>{
  e.preventDefault();
  nav('dashboard');
});
$('brandHome')?.addEventListener('dragstart',e=>e.preventDefault());
$('drawerBrandHome')?.addEventListener('click',()=>nav('dashboard'));
$('menuClose')?.addEventListener('click',closeSideMenu);
$('sideMenuBackdrop')?.addEventListener('click',closeSideMenu);
$('drawerLogout')?.addEventListener('click',()=>db.auth.signOut());
$('headerLogout')?.addEventListener('click',()=>db.auth.signOut());
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSideMenu()});

$('toggleAuth').onclick=()=>{
 hideVerificationView();
 signup=!signup;
 const auth=$('auth');auth.classList.add('auth-mode-switching');
 setTimeout(()=>{updateAuthModeUI();auth.classList.remove('auth-mode-switching')},180);
};
$('authResendBtn')?.addEventListener('click',resendVerificationEmail);
$('authVerificationBack')?.addEventListener('click',()=>{
 hideVerificationView();
 signup=false;
 updateAuthModeUI();
 $('email')?.focus();
});
async function handleAuthSubmit(ev){
 ev?.preventDefault();
 if(!db)return toast('Secure login is still connecting. Please wait a moment.','error');
 const valid=validateAuthForm(true);
 updateAuthSubmitState();
 if(!valid)return toast('Please fix the highlighted fields.','error');
 const btn=$('authBtn'),emailEl=$('email'),passEl=$('password');
 const e=emailEl?.value.trim()||'',p=passEl?.value||'';
 if(!e)return toast('Enter your email address.','error');
 if(!p)return toast('Enter your password.','error');
 if(btn){btn.disabled=true;btn.dataset.loadingText=btn.textContent;btn.textContent=signup?'Creating account…':'Signing in…'}
 try{
   let r;
   if(signup){
     const normalizedEmail=e.trim().toLowerCase();
     const normalizedPhone=normalizeMobile($('mobile').value);
     if(!normalizedPhone){
       toast('Enter a valid 10-digit Indian mobile number.','error');
       return;
     }
     // Server-side RPC checks existing profile contacts without exposing profile rows.
     const duplicateCheck=await db.rpc('check_registration_duplicate',{
       p_email:normalizedEmail,
       p_phone:normalizedPhone
     });
     if(duplicateCheck.error){
       const errCode=duplicateCheck.error?.code||'';
       const errMsg=String(duplicateCheck.error?.message||'');
       if(errCode==='PGRST202'||/function.*does not exist|not found/i.test(errMsg)){
         console.warn('check_registration_duplicate RPC not found on database; falling back to standard auth guard');
       }else{
         console.error('Registration duplicate check failed:',duplicateCheck.error);
         toast('We could not verify your details right now. Please try again.','error');
         return;
       }
     }
     if(duplicateCheck.data===true){
       toast('An account with this email or mobile number already exists. Please sign in instead.','error');
       return;
     }
     r=await db.auth.signUp({
       email:normalizedEmail,
       password:p,
       options:{
         emailRedirectTo:getAuthRedirectUrl(),
         data:{full_name:$('fullName').value.trim(),phone:normalizedPhone}
       }
     });
   }else{
     r=await db.auth.signInWithPassword({email:e,password:p});
   }
   if(r.error){
     const msg=String(r.error.message||'');
     if(signup&&(/already registered|already exists|duplicate key|unique constraint/i.test(msg)||r.error.code==='23505')){
       toast('An account with this email or mobile number already exists. Please sign in instead.','error');
     }else{
       toast(r.error.message||'Login failed. Please check your email and password.','error');
     }
     return;
   }
   if(signup){
     if(r.data?.session){
       toast('Account created and signed in.');
     }else if(r.data?.user&&Array.isArray(r.data.user.identities)&&r.data.user.identities.length===0){
       toast('An account with this email or mobile number already exists. Please sign in instead.','error');
     }else{
       showVerificationView(e.trim().toLowerCase());
     }
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
bindAuthPasswordToggle();
bindAuthValidation();
$('email')?.addEventListener('keydown',e=>{if(e.key==='Enter')$('password')?.focus()});
const legacyLogout=$('logout');if(legacyLogout)legacyLogout.onclick=()=>db.auth.signOut();
async function boot(){
 initIdleLogout();
 wireDateInputs(document);
 if(!document.body.dataset.dateMaskWired){document.body.dataset.dateMaskWired='1';document.addEventListener('input',e=>{const el=e.target;if(!el?.matches?.('input[data-date-input]'))return;let s=el.value.replace(/[^0-9]/g,'').slice(0,8);if(s.length>4)s=s.slice(0,2)+'-'+s.slice(2,4)+'-'+s.slice(4);else if(s.length>2)s=s.slice(0,2)+'-'+s.slice(2);el.value=s})}
 if($('date')&&!$('date').value)$('date').value=formatDateNice(istTodayClient());
 handleAuthRedirectError();
 let s=await db.auth.getSession();
 if(s.data.session&&(idleExpired())){
   await forceSignOut('idle');
   s={data:{session:null}};
 }
 accessToken=s.data.session?.access_token||'';
 if(s.data.session){writeIdleActivity(true);user=s.data.session.user;await touchServerSessionActivity(true);await start(s.data.session.user)}
 else showPublicLanding();
 db.auth.onAuthStateChange((event,nextSession)=>{
   // Supabase warns against awaiting other Supabase calls inside this callback:
   // defer all session work until the auth lock has been released.
   setTimeout(async()=>{
     accessToken=nextSession?.access_token||'';
     if(nextSession){
       if(event==='SIGNED_IN')writeIdleActivity(true);
       if(event!=='INITIAL_SESSION'&&idleExpired()){
         await forceSignOut('idle');
         return;
       }
       user=nextSession.user;
       await touchServerSessionActivity(true);
       if(event==='SIGNED_IN'||(!startedUserId&&!startupFailed)){
         await start(nextSession.user);
       }
     }else{
       accessToken='';
       document.body.classList.remove('td-admin-mode');
       startedUserId=null;
       startingUserId=null;
       startupPromise=null;
       startupFailed=false;
       if(!window.__carmySigningOut)clearUserMemory();
       if(event==='INITIAL_SESSION')showPublicLanding();else showLogin();
     }
   },0);
 });
}
function showPublicLanding(){
 const landing=$('torqLanding'),auth=$('auth'),app=$('app');
 document.body.classList.remove('td-auth-open');
 if(landing)landing.classList.remove('hidden');
 if(auth)auth.classList.add('hidden');
 if(app)app.classList.add('hidden');
 const loading=document.getElementById('appLoadingOverlay');if(loading)loading.remove();
 try{
   const loc=typeof window!=='undefined'&&window.location?window.location:(typeof location!=='undefined'?location:null);
   const hist=typeof window!=='undefined'&&window.history?window.history:(typeof history!=='undefined'?history:null);
   const h=(loc?.hash||'').toLowerCase();
   if(hist&&loc&&(h==='#auth-login'||h==='#auth-signup'||h==='#auth'||h==='#login'||h==='#signup')){
     hist.replaceState(null,'',loc.pathname+loc.search);
   }
 }catch(_){}
}
function showTorqDeskAuth(mode='login'){
 const landing=$('torqLanding'),auth=$('auth');
 document.body.classList.add('td-auth-open');
 if(landing)landing.classList.remove('hidden');
 if(auth)auth.classList.remove('hidden','auth-session-pending','auth-success','auth-mobile-open');
 signup=mode==='signup';
 hideVerificationView(false);
 updateAuthModeUI();bindMobileAuthTabs();prepareLoginExperience();
 window.scrollTo({top:0,behavior:'smooth'});
}
window.showTorqDeskAuth=showTorqDeskAuth;
document.addEventListener('click',event=>{
 if(event.target.closest('[data-td-auth-close]')){
   event.preventDefault();
   showPublicLanding();
   return;
 }
 const trigger=event.target.closest('[data-torq-auth]');
 if(trigger){
   event.preventDefault();
   const dropdown=trigger.closest('details.td-auth-dropdown');
   if(dropdown)dropdown.removeAttribute('open');
   showTorqDeskAuth(trigger.dataset.torqAuth||'login');
   return;
 }
 const authLink=event.target.closest('a[href*="#auth-login"], a[href*="#auth-signup"], a[href*="#auth"], a[href*="#login"], a[href*="#signup"]');
 if(authLink&&!authLink.closest('#auth')&&!authLink.closest('#app')){
   const href=(authLink.getAttribute('href')||'').toLowerCase();
   if(href.includes('#auth-signup')||href.includes('#signup')){
     event.preventDefault();
     const dropdown=authLink.closest('details.td-auth-dropdown');
     if(dropdown)dropdown.removeAttribute('open');
     showTorqDeskAuth('signup');
     return;
   }
   if(href.includes('#auth-login')||href.includes('#auth')||href.includes('#login')){
     event.preventDefault();
     const dropdown=authLink.closest('details.td-auth-dropdown');
     if(dropdown)dropdown.removeAttribute('open');
     showTorqDeskAuth('login');
     return;
   }
 }
 // Modal dismissal is handled explicitly via [data-td-auth-close] (the '×' close button) or Escape key,
 // preventing accidental clicks on tab backgrounds, form gaps, or mobile tab margins from closing auth.
});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'){
   if(document.getElementById('profileGateOverlay'))return;
   const authEl=$('auth');
   if(authEl&&!authEl.classList.contains('hidden')&&document.body.classList.contains('td-auth-open')){
     showPublicLanding();
   }
 }
});
const syncAuthFromHash=()=>{
 const loc=typeof window!=='undefined'&&window.location?window.location:(typeof location!=='undefined'?location:null);
 const h=(loc?.hash||'').toLowerCase();
 if(h==='#auth-login'||h==='#auth'||h==='#login'){
   showTorqDeskAuth('login');
 }else if(h==='#auth-signup'||h==='#signup'){
   showTorqDeskAuth('signup');
 }
};
if(typeof window!=='undefined'&&window.addEventListener)window.addEventListener('hashchange',syncAuthFromHash);
syncAuthFromHash();
function showLogin(){
 document.body.classList.add('td-auth-open');
 $('torqLanding')?.classList.remove('hidden');
 closeSideMenu();
 stopVerificationCountdown();
 hideVerificationView(false);
 let o=$('policeLogoutOverlay');if(o){if(o._timer)clearTimeout(o._timer);o.remove()}
 let ps=$('policeLogoutStyle');if(ps)ps.remove();
 const auth=$('auth');
 auth.classList.remove('hidden','auth-session-pending','auth-success','auth-mobile-open');
 $('app').classList.add('hidden');
 let fab=document.getElementById('dashboardFab');if(fab)fab.remove();
 let mn=document.getElementById('mobileNav');if(mn)mn.classList.add('auth-hidden');
 updateAuthModeUI();
 bindMobileAuthTabs();
 prepareLoginExperience();
 if(!document.querySelector('.auth-verification-open'))restorePendingVerification();
 const joke=localStorage.getItem('carcare_logout_joke');if(joke){localStorage.removeItem('carcare_logout_joke');setTimeout(()=>toast(joke),150)}
}
function updateCarTab(){let el=$('mobileCarReg');if(el)el.textContent=car?.registration_no||'No Car';updateDrawerContext()}
async function start(u,force=false){
 window.start=start;
 if(!u)return;
 if(startupPromise&&!force&&(startingUserId===u.id||user?.id===u.id))return startupPromise;
 if(startedUserId===u.id&&!startupFailed&&!force)return;
 user=u;
 startingUserId=u.id;
 startupFailed=false;
 writeIdleActivity(true);
 closeSideMenu();
 stopVerificationCountdown();
 pendingVerificationEmail='';
 try{sessionStorage.removeItem('carmy_pending_verification_email')}catch(e){}
 $('auth').classList.add('hidden');
 document.body.classList.remove('td-auth-open');
 $('torqLanding')?.classList.add('hidden');
 $('app').classList.add('hidden');
 $('userEmail').textContent=u.email;
 showAppLoading();
 startupPromise=(async()=>{
   try{
     setAppLoadingStatus('Fetching your vehicle garage...','Loading vehicle profiles from your secure cloud');
     setAppLoadingProgress(10);
     await touchServerSessionActivity(true);
     await loadCars();
     let savedCarId=null;
     try{savedCarId=localStorage.getItem('carmy_selected_car_id')}catch(_){}
     if(savedCarId&&cars.some(x=>x.id===savedCarId)){
       car=cars.find(x=>x.id===savedCarId);
     }else if(!car||!cars.some(x=>x.id===car.id)){
       car=cars[0]||null;
     }
     if(car?.id){
       try{localStorage.setItem('carmy_selected_car_id',car.id)}catch(_){}
     }
     updateCarTab();
     setAppLoadingProgress(35);
     setAppLoadingStatus('Securing your vehicle files...','Loading service history and private documents');
     await loadData();
     setAppLoadingProgress(70);
     updateIdentityUI();
     const primaryAdminEmail='rnyburia@gmail.com';
     const isPrimaryAdmin=String(u.email||'').trim().toLowerCase()===primaryAdminEmail;
     try{await checkSuperAdminStatus();}catch(_){}
     setAppLoadingStatus('Preparing your garage...','Rendering your dashboard');
     setAppLoadingProgress(90);
     // The designated admin lands directly in the console. The Worker still
     // independently authorizes every admin API request using the registry.
     let lastView=isPrimaryAdmin?'admin':'dashboard';
     const validViews=['dashboard','cars','add','history','docs','report','owner','help','admin'];
     if(!validViews.includes(lastView))lastView='dashboard';
     if(lastView!=='dashboard'){
       let restored=false;
       try{
         await nav(lastView);
         restored=document.querySelector('#'+lastView+'.view.active')!==null;
       }catch(err){
         console.error('Last-view restore failed:',err);
       }
       if(!restored){
         try{localStorage.removeItem('carcare_last_view')}catch(e){}
         await nav('dashboard');
       }
     }else{
       await nav('dashboard');
     }
     document.body.classList.toggle('td-admin-mode',isPrimaryAdmin);
     /* UI-ONLY: Profile gate enforcement in browser. Backend must enforce server-side. */
     const isCandidateAdmin = isPrimaryAdmin || isSuperAdmin || Boolean(currentAdminRole) || (u && (u.role==='admin'||u.role==='super_admin'));
     if(!isCandidateAdmin){
       const gateOk = await checkProfileGate(u);
       if(!gateOk){
         hideAppLoading();
         return;
       }
     }
     $('app').classList.remove('hidden');
     window.scrollTo({top:0,left:0,behavior:'auto'});
     let mn=document.getElementById('mobileNav');if(mn)mn.classList.remove('auth-hidden');
     setAppLoadingProgress(100);
     hideAppLoading();
     ensureSecurityPassword();
     startTicketUnreadPolling();
     if(!user||user.id===u.id){
       startedUserId=u.id;
       startupFailed=false;
     }
   }catch(e){
     console.error('Dashboard data load failed; keeping the authenticated session:',e);
     hideAppLoading();
     if(!user||user.id===u.id){
       startupFailed=true;
       startedUserId=null;
     }
     $('app').classList.remove('hidden');
     $('auth').classList.add('hidden');
     $('torqLanding')?.classList.add('hidden');
     document.body.classList.remove('td-auth-open');
     let mn=document.getElementById('mobileNav');if(mn)mn.classList.remove('auth-hidden');
     renderDashboardRecoveryUI(e);
     toast('You are signed in, but some data could not load. Check your connection and retry.','error');
   }finally{
     startupPromise=null;
     if(startingUserId===u.id)startingUserId=null;
   }
 })();
 return startupPromise;
}

async function loadCars(){
 garageLoadingState='loading';
 let fetchedCars=null;
 let fetchError=null;
 try{
   const body=await workerGet('/api/vehicles?bypass_cache=1');
   if(Array.isArray(body?.data)&&body.data.length>0){
     fetchedCars=body.data;
   }
 }catch(err){
   fetchError=err;
   console.warn('Vehicle list fetch from worker failed, checking direct Supabase fallback:',err);
 }
 if(!fetchedCars&&db&&user?.id){
   try{
     const sbRes=await db.from('cars').select('*').eq('user_id',user.id).order('created_at',{ascending:true});
     if(Array.isArray(sbRes?.data)&&sbRes.data.length>0){
       fetchedCars=sbRes.data;
     }else if(sbRes?.error){
       fetchError=sbRes.error;
     }
   }catch(sbErr){
     fetchError=sbErr;
     console.warn('Direct Supabase cars fetch failed:',sbErr);
   }
 }
 if(!fetchedCars&&db&&user?.id){
   try{
     await db.rpc('carmy_touch_session');
     const retryRes=await db.from('cars').select('*').eq('user_id',user.id).order('created_at',{ascending:true});
     if(Array.isArray(retryRes?.data)&&retryRes.data.length>0){
       fetchedCars=retryRes.data;
     }else if(retryRes?.error){
       fetchError=retryRes.error;
     }
   }catch(retryErr){
     fetchError=retryErr;
   }
 }
 if(!fetchedCars){
   try{
     const retryWorker=await workerGet('/api/vehicles?bypass_cache=1');
     if(Array.isArray(retryWorker?.data)&&retryWorker.data.length>0){
       fetchedCars=retryWorker.data;
     }
   }catch(_){}
 }
 if(Array.isArray(fetchedCars)&&fetchedCars.length>0){
   cars=fetchedCars;
   cars.sort((a,b)=>String(a?.registration_no||'').localeCompare(String(b?.registration_no||'')));
   try{localStorage.setItem('carmy_cached_cars',JSON.stringify(cars))}catch(_){}
   garageLoadingState='ready';
   return;
 }
 let cached=null;
 try{
   const parsed=JSON.parse(localStorage.getItem('carmy_cached_cars')||'[]');
   if(Array.isArray(parsed)&&parsed.length)cached=parsed;
 }catch(_){}
 if(cached){
   cars=cached;
   cars.sort((a,b)=>String(a?.registration_no||'').localeCompare(String(b?.registration_no||'')));
   garageLoadingState='ready';
   return;
 }
 if(fetchError&&!fetchedCars){
   garageLoadingState='error';
   return;
 }
 cars=[];
 garageLoadingState='empty';
}
async function loadStep5Data(){
 ownerProfile=null;insuranceHistory=[];pucHistory=[];renewalHistory=[];saleHistory=[];
 if(!user)return;
 const requests=[workerGet('/api/profile')];
 if(car){
   const qs='?car_id='+encodeURIComponent(car.id);
   requests.push(
     workerGet('/api/insurance'+qs),
     workerGet('/api/puc'+qs),
     workerGet('/api/renewals'+qs),
     workerGet('/api/sale-history'+qs)
   );
 }
 const results=await Promise.all(requests);
 const profile=results[0];
 ownerProfile=profile?.data||null;
 if(car){
   insuranceHistory=Array.isArray(results[1]?.data)?results[1].data:[];
   pucHistory=Array.isArray(results[2]?.data)?results[2].data:[];
   renewalHistory=Array.isArray(results[3]?.data)?results[3].data:[];
   saleHistory=Array.isArray(results[4]?.data)?results[4].data:[];
 }
}
let currentLoadingCarId=null;
async function loadData(forceRefresh=false){
 if(!car){
   records=[];docs=[];
   await loadStep5Data();
   return;
 }
 const targetCarId=car.id;
 currentLoadingCarId=targetCarId;
 const carId=encodeURIComponent(targetCarId);
 const qs='?car_id='+carId;
 const historyUrl='/api/service-history?car_id='+carId+(forceRefresh?'&bypass_cache=1':'');
 const requests=[
   workerGet(historyUrl),
   workerGet('/api/documents?car_id='+carId),
   workerGet('/api/profile'),
   workerGet('/api/insurance'+qs),
   workerGet('/api/puc'+qs),
   workerGet('/api/renewals'+qs),
   workerGet('/api/sale-history'+qs)
 ];
 const results=await Promise.allSettled(requests);
 if(currentLoadingCarId!==targetCarId){
   // Vehicle selection changed while network requests were in flight; discard stale data
   return;
 }
 if(results[0].status==='fulfilled'){
   const history=results[0].value;
   const raw=Array.isArray(history?.data)?history.data:[];
   records=raw.filter(r=>!r.car_id||r.car_id===targetCarId);
 }else{
   console.warn('Service history endpoint failed; retaining current records:',results[0].reason);
   if(!records.length)toast('Could not refresh service history. Please check your connection.','error');
 }
 if(!records.length&&db&&user?.id&&car?.id){
   try{
     const sbRec=await db.from('records').select('*,record_items(*)').eq('user_id',user.id).eq('car_id',targetCarId).order('service_date',{ascending:false});
     if(Array.isArray(sbRec?.data)&&sbRec.data.length>0&&currentLoadingCarId===targetCarId){
       records=sbRec.data.filter(r=>!r.car_id||r.car_id===targetCarId);
     }
   }catch(_){}
 }
 // Other panels are optional. A temporary failure must not wipe their previously loaded data
 // or force the entire customer dashboard back to login.
 const applyArray=(index,setter)=>{
   const result=results[index];
   if(result?.status!=='fulfilled')return;
   const data=result.value?.data;
   if(Array.isArray(data))setter(data.filter(x=>!x.car_id||x.car_id===targetCarId));
 };
 applyArray(1,value=>{docs=value});
 if(!docs.length&&db&&user?.id&&car?.id){
   try{
     const sbDocs=await db.from('documents').select('*').eq('user_id',user.id).eq('car_id',targetCarId);
     if(Array.isArray(sbDocs?.data)&&sbDocs.data.length>0&&currentLoadingCarId===targetCarId){
       docs=sbDocs.data.filter(d=>!d.car_id||d.car_id===targetCarId);
     }
   }catch(_){}
 }
 if(results[2]?.status==='fulfilled'&&results[2].value)ownerProfile=results[2].value.data||ownerProfile;
 applyArray(3,value=>{insuranceHistory=value});
 applyArray(4,value=>{pucHistory=value});
 applyArray(5,value=>{renewalHistory=value});
 applyArray(6,value=>{saleHistory=value});
 for(let i=1;i<results.length;i++){
   if(results[i].status==='rejected')console.warn('Optional dashboard endpoint failed; keeping previous data:',i,results[i].reason);
 }
 if(document.getElementById('docs')?.classList.contains('active')){
   try{await docsView()}catch(err){console.warn('Could not refresh documents view:',err)}
 }
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
const logoutJokes=['Insurance is missing. Protect your vehicle before driving.','PUC is missing. Complete an emissions test before driving.','Documents incomplete hain—car ne bola, Vehicle paperwork is part of maintenance.','Insurance/PUC missing: dashboard ne aaj driving se zyada paperwork choose kiya 😅'];
const insuranceJokes=['Insurance is missing. Add a valid policy before driving.','Insurance is not available. Please add a valid policy.','Insurance protection is missing. Add a valid policy before driving.'];
const pucJokes=['PUC is missing. Complete an emissions test before driving.','PUC is pending. Add a valid pollution certificate.','A valid PUC certificate is required before driving.'];
function randomJoke(){return logoutJokes[Math.floor(Math.random()*logoutJokes.length)]}
function randomInsuranceJoke(){return insuranceJokes[Math.floor(Math.random()*insuranceJokes.length)]}
function randomPucJoke(){return pucJokes[Math.floor(Math.random()*pucJokes.length)]}
function policeLogoutAnimation(type){
  let old=document.getElementById('policeLogoutOverlay');if(old)old.remove();
  let title=type==='both'?'INSURANCE + PUC MISSING':type==='insurance'?'INSURANCE NOT AVAILABLE':'PUC NOT AVAILABLE';
  let amount=type==='both'?'₹7,000':type==='insurance'?'₹2,000':'₹5,000';
  let joke=type==='both'?'Bhai, Insurance + PUC dono missing? HP police style mein ₹7,000 ka compounding amount! 😂🚔':type==='insurance'?'Insurance may be required by law. Check the current official penalty for your state.':'A valid PUC may be required by law. Check the current official penalty for your state.';
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
  const maxAllowed = userPlanStatus?.max_vehicles || (userPlanStatus?.plan === 'ultra' ? 999 : (userPlanStatus?.plan === 'premium' ? 5 : 1));
  if(Array.isArray(cars) && cars.length >= maxAllowed){
    openPlanComparisonModal();
    toast('Vehicle limit reached ('+cars.length+'/'+(maxAllowed===999?'Unlimited':maxAllowed)+' on '+(userPlanStatus?.plan||'Lite').toUpperCase()+'). Upgrade to add more vehicles.', 'info');
    return;
  }
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
 '<div class="field"><label>Insurance Expiry *</label>'+dateInputHtml('cfInsExp','')+'</div>'+
 '<div class="field"><label>PUC *</label><select id="cfPuc"><option value="">Select</option><option value="yes">Yes</option><option value="no">No</option></select></div>'+
 '<div class="field" id="cfPucNoWrap" style="display:none"><label>PUC Number *</label><input id="cfPucNo" placeholder="PUC certificate number"></div>'+
 '<div class="field" id="cfPucStateWrap" style="display:none"><label>PUC State *</label><select id="cfPucState"><option value="">Select State</option>'+pucStates.map(x=>'<option>'+x+'</option>').join('')+'</select></div>'+
 '<div class="field" id="cfPucValidityWrap" style="display:none"><label>PUC Validity *</label><select id="cfPucValidity"><option value="">Select</option><option value="6">6 Months</option><option value="12">12 Months</option></select></div>'+
 '<div class="field" id="cfPucExpWrap" style="display:none"><label>PUC Expiry *</label>'+dateInputHtml('cfPucExp','')+'</div>'+
 '<div class="field"><label>Current KM</label><input id="cfKm" type="number" value="0"></div>'+
 '<div class="full"><button class="primary" onclick="saveCarForm()">SAVE CAR</button></div></div>';
 $('cfPuc').onchange=()=>{let yes=$('cfPuc').value==='yes';['cfPucNoWrap','cfPucStateWrap','cfPucValidityWrap','cfPucExpWrap'].forEach(id=>$(id).style.display=yes?'block':'none')};
}
function hideCarForm(){$('carForm').classList.add('hidden');$('carForm').innerHTML=''}
$('newCar').onclick=showCarForm;
async function saveCarForm(){
  const maxAllowed = userPlanStatus?.max_vehicles || (userPlanStatus?.plan === 'ultra' ? 999 : (userPlanStatus?.plan === 'premium' ? 5 : 1));
  if(Array.isArray(cars) && cars.length >= maxAllowed){
    openPlanComparisonModal();
    return toast('Vehicle limit reached for your plan. Upgrade to register additional vehicles.', 'error');
  }
 let reg=$('cfReg').value.trim().toUpperCase(),model=$('cfModel').value.trim(),year=$('cfYear').value.trim(),fuel=$('cfFuel').value,ins=$('cfIns').value,insNo=$('cfInsNo').value.trim(),insExp=dateInputValue('cfInsExp'),puc=$('cfPuc').value,pucNo=puc==='yes'?$('cfPucNo').value.trim():'',pucState=puc==='yes'?$('cfPucState').value:'',pucValidity=puc==='yes'?$('cfPucValidity').value:'',pucExp=puc==='yes'?dateInputValue('cfPucExp'):'';
 let insTypes=selectedChoices('cfInsType'),insAddons=selectedChoices('cfInsAddons');
 if(!reg||!model||!year||!fuel||ins==='Not Available'||!insNo||!insExp||insTypes.length<2||puc!=='yes'||!pucNo||!pucState||!pucValidity||!pucExp)return toast('Complete all required fields. Insurance Type needs minimum 2 selections.');
 let r=await db.from('cars').insert({user_id:user.id,registration_no:reg,make_model:model,model_year:+year,fuel,current_km:+($('cfKm').value||0),vin:$('cfVin').value.trim()||null,engine_no:$('cfEngine').value.trim()||null,insurance_company:ins,insurance_number:insNo,insurance_type:insTypes,insurance_addons:insAddons,insurance_expiry:insExp,puc_certificate_no:pucNo,puc_state:pucState,puc_validity_months:+pucValidity,puc_expiry:pucExp}).select().single();
 if(r.error)return toast('Failed to save Vehicle: '+r.error.message,'error');cars.push(r.data);car=r.data;updateCarTab();hideCarForm();toast('Vehicle '+reg+' added successfully!');await loadData();await nav('dashboard');
}
window.openCar=async id=>{
  const target=cars.find(x=>x.id===id);
  if(!target)return;
  car=target;
  if(car?.id){try{localStorage.setItem('carmy_selected_car_id',car.id)}catch(_){}}
  records=[];
  docs=[];
  insuranceHistory=[];
  pucHistory=[];
  renewalHistory=[];
  saleHistory=[];
  updateCarTab();
  if(document.getElementById('history')?.classList.contains('active'))renderHistory();
  if(document.getElementById('docs')?.classList.contains('active')){try{await docsView()}catch(_){}}
  await loadData();
  await nav('dashboard');
};
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
   return '<button class="timeline-event '+cls+'" onclick="toggleTimelineEvent(\''+r.id+'\')"><span class="timeline-node"></span><span class="timeline-date">'+esc(formatDateNice(r.service_date))+'</span><span class="timeline-main"><b>'+esc(type)+'</b><small>'+esc(items||r.description||'Maintenance record')+'</small></span><span class="timeline-cost">'+cost+'</span><span class="timeline-chevron">⌄</span><span class="timeline-detail" id="timeline-'+r.id+'"><b>Workshop:</b> '+esc(r.workshop||'Not recorded')+'<br><b>KM:</b> '+esc(r.odometer_km||0)+'<br><b>Parts:</b> '+money(r.parts_cost)+' • <b>Labour:</b> '+money(r.labour_cost)+' • <b>Other:</b> '+money(r.other_cost)+'<br><b>Invoice:</b> '+esc(r.invoice_no||'Not attached')+(r.notes?'<br><b>Notes:</b> '+esc(r.notes):'')+'</span></button>';
 }).join('')+'</div>';
}
function toggleTimelineEvent(id){const e=document.getElementById('timeline-'+id);if(e)e.classList.toggle('open')}
function dash(){
 if(!car){
  if(startupFailed||garageLoadingState==='error'){renderDashboardRecoveryUI(new Error('Unable to load vehicle records. Please retry.'));return}
  if(garageLoadingState==='loading'){
    $('dashTitle').textContent='Overview';
    $('dashSub').textContent='Syncing Garage...';
    $('dash').innerHTML='<div class="card" style="text-align:center;padding:50px 20px">'+
      '<div class="loading-spinner" style="margin:0 auto 16px;width:36px;height:36px;border:3px solid var(--c-line,#e2e8f0);border-top-color:var(--c-accent,#2563eb);border-radius:50%;animation:spin .8s linear infinite"></div>'+
      '<h3 style="margin:0 0 6px">Securing your vehicle garage…</h3>'+
      '<p class="muted" style="margin:0">Verifying session activity and loading vehicle records from your private cloud.</p>'+
    '</div>';
    return;
  }
  $('dashTitle').textContent='Overview';
  $('dashSub').textContent='Private Vehicle Garage';
  $('dash').innerHTML=
    renderPlanExpirationBanner()+
    '<div class="card empty-garage-card">'+
    '<div class="empty-garage-icon"><svg aria-hidden="true" style="width:48px;height:48px;stroke:var(--c-accent)"><use href="#td-icon-car"/></svg></div>'+
    '<h2>Welcome to your Torq Desk Garage</h2>'+
    '<p class="empty-garage-lead muted">You haven\'t added any vehicles yet. Register your car to track service history, store insurance &amp; PUC certificates, and monitor maintenance spend in your private cloud.</p>'+
    '<div class="empty-garage-actions">'+
    '<button type="button" class="primary btn-large" onclick="openNewCarModal()">＋ Add Your First Car</button>'+
    '<button type="button" class="ghost btn-large" onclick="openHistoricalImport()">↥ Import Old Service Records</button>'+
    '</div>'+
    '<div class="empty-garage-features">'+
    '<div class="feat-box"><div class="feat-icon"><svg aria-hidden="true" style="width:24px;height:24px"><use href="#td-icon-wrench"/></svg></div><b>Service &amp; Maintenance</b><p class="muted">Log regular service, parts replacement, and workshop invoices in one timeline.</p></div>'+
    '<div class="feat-box"><div class="feat-icon"><svg aria-hidden="true" style="width:24px;height:24px"><use href="#td-icon-shield"/></svg></div><b>Compliance Shield</b><p class="muted">Automatic tracking and alerts for Insurance policies and PUC certificates.</p></div>'+
    '<div class="feat-box"><div class="feat-icon"><svg aria-hidden="true" style="width:24px;height:24px"><use href="#td-icon-file"/></svg></div><b>Encrypted Glovebox</b><p class="muted">Encrypted cloud vault for RC, receipts, and print-ready A4 vehicle dossiers.</p></div>'+
    '</div>'+
    '</div>';
  renderFab();
  return;
 }
 const health=dashboardHealth(),service=serviceDueStatus(),cost=records.reduce((s,r)=>s+Number(r.total_cost||0),0),last=records[0],ins=st(car.insurance_expiry),puc=st(car.puc_expiry);
 $('dashTitle').textContent=car.registration_no;
 $('dashSub').textContent=[car.make_model,car.model_year,car.fuel].filter(Boolean).join(' • ');
 const activeDocs=docs.filter(d=>!d.archived_at);
 $('dash').innerHTML=
  renderPlanExpirationBanner()+
  '<section class="minimal-dashboard">'+
  '<div class="minimal-hero">'+
    '<div class="minimal-hero-left">'+
      '<div class="hsrp-plate"><div class="hsrp-ind"><span class="hsrp-chakra">☸</span><span>IND</span></div><span class="hsrp-number">'+esc(car.registration_no)+'</span></div>'+
      '<div class="minimal-hero-meta">'+
        '<h2>'+esc(car.make_model||'Vehicle')+(car.vehicle_status==='sold'?' <span class="sold-badge">SOLD</span>':' <span class="status ok">ACTIVE</span>')+'</h2>'+
        '<p class="muted">'+[car.model_year,car.fuel,'Current: '+Number(car.current_km||0).toLocaleString('en-IN')+' KM'].filter(Boolean).join(' • ')+'</p>'+
      '</div>'+
    '</div>'+
    '<div class="minimal-hero-actions">'+
      '<button class="primary" onclick="window.openAddRecord()">＋ Log Service</button>'+
      '<button class="ghost" onclick="openDocUploader()">📄 Upload Doc</button>'+
      '<button class="ghost" onclick="openOdometerPrompt()">⛽ Update KM</button>'+
      '<button class="ghost" onclick="nav(\'report\')">🖨️ A4 Report</button>'+
    '</div>'+
  '</div>'+
  '<div class="minimal-grid">'+
    '<div class="minimal-card"><span class="kpi-kicker">ODOMETER</span><b>'+esc(Number(car.current_km||0).toLocaleString('en-IN'))+' <small>KM</small></b><small><button class="link-btn" onclick="openOdometerPrompt()">Update KM</button></small></div>'+
    '<div class="minimal-card"><span class="kpi-kicker">NEXT SERVICE</span><b class="'+service.cls+'">'+esc(service.state)+'</b><small>'+esc(service.text)+'</small></div>'+
    '<div class="minimal-card"><span class="kpi-kicker">INSURANCE</span><b class="'+ins[1]+'">'+ins[0]+'</b><small>'+esc(car.insurance_expiry?formatDateNice(car.insurance_expiry):'Not available')+'</small></div>'+
    '<div class="minimal-card"><span class="kpi-kicker">PUC EMISSIONS</span><b class="'+puc[1]+'">'+puc[0]+'</b><small>'+esc(car.puc_expiry?formatDateNice(car.puc_expiry):'Not available')+'</small></div>'+
    '<div class="minimal-card"><span class="kpi-kicker">RUNNING COST</span><b>'+money(cost)+'</b><small>'+records.length+' recorded services</small></div>'+
  '</div>'+
  '<div class="minimal-status"><span class="health-badge '+(car.vehicle_status==='sold'?'neutral':health[1])+'"><i></i>'+esc(car.vehicle_status==='sold'?'VEHICLE SOLD':health[0])+'</span><span>'+esc(car.vehicle_status==='sold'?'Ownership lifecycle closed.':health[2])+'</span></div>'+
  '<div class="dashboard-two-col">'+
    '<div class="card dashboard-col-card">'+
      '<div class="card-head-row"><h3>Recent Maintenance Activity</h3><button class="ghost btn-sm" onclick="nav(\'history\')">All Records ('+records.length+') →</button></div>'+
      (records.length ?
        '<div class="recent-records-list">'+records.slice(0,4).map(r=>{
          const items=(r.record_items||[]).map(x=>x.item_name).join(', ');
          return '<div class="recent-record-item"><div class="rr-left"><span class="rr-date">'+esc(formatDateNice(r.service_date))+'</span><b>'+esc(r.record_type||'Service')+'</b><small class="muted">'+esc(items||r.description||r.workshop||'Maintenance')+'</small></div><div class="rr-right"><b>'+money(r.total_cost)+'</b></div></div>';
        }).join('')+'</div>' :
        '<div class="empty-col-state"><p class="muted">No service records logged yet for this vehicle.</p><button class="ghost btn-sm" onclick="window.openAddRecord()">＋ Log First Service</button></div>')+
    '</div>'+
    '<div class="card dashboard-col-card">'+
      '<div class="card-head-row"><h3>Active Document Vault</h3><button class="ghost btn-sm" onclick="nav(\'docs\')">Open Vault ('+activeDocs.length+') →</button></div>'+
      (activeDocs.length ?
        '<div class="dashboard-quick-docs">'+activeDocs.slice(0,3).map(renderDocRow).join('')+'</div>' :
        '<div class="empty-col-state"><p class="muted">No documents uploaded yet in private glovebox.</p><button class="ghost btn-sm" onclick="openDocUploader()">＋ Upload RC / Insurance / PUC</button></div>')+
    '</div>'+
  '</div>'+
  '</section>';
 renderFab();
}
window.openNewCarModal=async()=>{await nav('cars');showCarForm();window.scrollTo({top:0,behavior:'smooth'});};
function renderDashDocCard(d){
 const [status,cls]=docStatus(d),title=docTypeLabel(d),icon=d.document_type==='insurance'?'🛡️':d.document_type==='puc'?'🌿':'📘';
 return '<div class="flip-card" tabindex="0" onclick="this.classList.toggle(\'flipped\')"><div class="flip-inner"><div class="flip-front"><div class="doc-card-icon">'+icon+'</div><b>'+esc(title)+'</b><small>'+esc(d.document_type==='insurance'?(car.insurance_number||'Policy document'):d.document_type==='puc'?(car.puc_state||'PUC certificate'):'Registration Certificate')+'</small><span class="doc-badge '+cls+'">'+status+'</span><em>'+esc(d.document_expiry?'Expiry '+d.document_expiry:'Vehicle document')+'</em></div><div class="flip-back"><b>'+esc(title)+'</b><p>'+esc(d.file_name)+'</p><div><button type="button" class="ghost" onclick="event.stopPropagation();openDocumentPreview(\''+d.storage_path.replace(/'/g,"\\'")+'\')">Preview</button><button type="button" class="ghost" onclick="event.stopPropagation();downloadDoc(\''+d.storage_path.replace(/'/g,"\\'")+'\')">Download</button></div></div></div></div>';
}
/* ===== Official Form 29 & 30 Statutory Templates (CMVR 1989) ===== */
const OFFICIAL_FORM_TEMPLATES = {
  form_29_v1: {
    template_key: 'form_29_v1',
    form_type: 'form_29',
    version: 'v1',
    title: 'Form 29 — Notice of Transfer of Ownership of a Motor Vehicle',
    schema_fields: ['destination_rto','transferor_name','transferor_address','sale_day','sale_month','sale_year','registration_no','vehicle_make_model','chassis_no','engine_no','chassis_block','engine_block','transferee_name','transferee_relation','transferee_relation_name','transferee_address','hypothecation_phrase','financier_signature_block','declaration_date','source_rto'],
    raw_template: '<div class="official-form-page" data-form-type="form_29" data-page="1">'+
      '<div class="form-header-box">'+
        '<div class="form-title-main">FORM 29</div>'+
        '<div class="form-rule-ref">[See Rule 55 (1)]</div>'+
        '<div class="form-subject">NOTICE OF TRANSFER OF OWNERSHIP OF A MOTOR VEHICLE</div>'+
        '<div class="form-sub-instructions">(To be made in duplicate and the duplicate copy with the endorsement of the Registering Authority to be returned to the transferor or immediately on making entries of transfer of ownership in certificate of Registration and Form 24)</div>'+
      '</div>'+
      '<div class="form-to-block">'+
        '<div class="to-label">To</div>'+
        '<div class="to-authority">The Registering Authority, <b>{{destination_rto}}</b></div>'+
        '<div class="to-jurisdiction">(in whose jurisdiction the Transferee resides)</div>'+
      '</div>'+
      '<div class="form-body-paragraphs">'+
        '<p class="form-p">I/We <b>{{transferor_name}}</b> resident of <b>{{transferor_address}}</b> have on the <b>{{sale_day}}</b> day of <b>{{sale_month}}</b> <b>{{sale_year}}</b> sold and delivered my/our Vehicle No. <b>{{registration_no}}</b> make <b>{{vehicle_make_model}}</b> {{chassis_block}} {{engine_block}} to Shri/Smt. <b>{{transferee_name}}</b> (Name) {{transferee_relation}} <b>{{transferee_relation_name}}</b> residing at <b>{{transferee_address}}</b> (House No./Street Village /Town Distt. and State) {{hypothecation_phrase}}.</p>'+
        '<p class="form-p">The Registration Certificate and Insurance Certificate have been handed over to him/her/them.</p>'+
        '<p class="form-p">To the best of my/our knowledge and belief the vehicle is not superdari and free from all encumbrances and information furnished is true. I/we undertake to hold my/our self-responsible for any inaccuracy or suppression of information.</p>'+
      '</div>'+
      '<div class="form-signatures-row">'+
        '<div class="sig-col financier-sig">{{financier_signature_block}}</div>'+
        '<div class="sig-col transferor-sig">'+
          '<div class="sig-line">________________________________________________</div>'+
          '<div class="sig-caption">Signature or thumb impression of the Registered Owner (Transferor)</div>'+
          '<div class="sig-date">Date: <b>{{declaration_date}}</b></div>'+
        '</div>'+
      '</div>'+
      '<div class="transferee-ack-row">I/We <b>{{transferee_name}}</b> (Transferee)</div>'+
      '<div class="copy-to-block">'+
        '<p>Copy to the Registering Authority <b>{{source_rto}}</b> in whose jurisdiction the transferor resides.</p>'+
        '<div class="copy-note">Note - To be sent to the Registering Authority by Registered Post Acknowledgment Due.</div>'+
      '</div>'+
      '<div class="office-endorsement-box">'+
        '<div class="endorsement-title">OFFICE ENDORSEMENT</div>'+
        '<div class="endorsement-ref-row"><span>Ref. No. ________________________</span><span>Office of the __________________________________</span></div>'+
        '<p class="endorsement-p">The ownership of the vehicle has been transferred to the name of ________________________________ with the note of the abovesaid agreement with effect from ________________________ (date).</p>'+
        '<div class="endorsement-sign-row"><div class="endorsement-date">Date: ____________________</div><div class="endorsement-seal"><div>__________________________________________________</div><div>Signature of the Registering Authority with Office seal</div></div></div>'+
        '<div class="endorsement-to"><div>* Strike out whichever is inapplicable.</div><div>To: The Transferor __________________________________________________</div><div>(To be sent by Registered Post Acknowledgement Due)</div></div>'+
      '</div>'+
    '</div>'
  },
  form_30_v1: {
    template_key: 'form_30_v1',
    form_type: 'form_30',
    version: 'v1',
    title: 'Form 30 — Application for Intimation and Transfer of Ownership',
    schema_fields: ['destination_rto','transferor_name','transferor_relation','transferor_relation_name','transferor_age','transferor_address','sale_day','sale_month','sale_year','registration_no','transferee_name','transferee_relation','transferee_relation_name','transferee_address','transferee_age','transferor_noc_clause','financier_part_block','declaration_date'],
    raw_template: '<div class="official-form-page" data-form-type="form_30" data-page="1">'+
      '<div class="form-header-box">'+
        '<div class="form-title-main">FORM 30</div>'+
        '<div class="form-rule-ref">[See Rule 55 (2) and (3)]</div>'+
        '<div class="form-subject">APPLICATION FOR INTIMATION AND TRANSFER OF OWNERSHIP OF A MOTOR VEHICLE</div>'+
        '<div class="form-sub-instructions">(To be made in duplicate if the vehicle is held under an agreement of hire-purchase/lease/hypothecation. The duplicate copy with the endorsement of the Registering Authority to be returned to the Financier simultaneously on making the entry of the transfer of Ownership in the Certificate of Registration and Registration Record in Form 24)</div>'+
      '</div>'+
      '<div class="form-to-block">'+
        '<div class="to-label">To</div>'+
        '<div class="to-authority">The Registering Authority, <b>{{destination_rto}}</b></div>'+
      '</div>'+
      '<div class="form-section-head">PART I — FOR THE USE OF THE TRANSFEROR</div>'+
      '<div class="particulars-list">'+
        '<div class="particular-row"><span class="lbl">Name of the transferor:</span> <span class="val"><b>{{transferor_name}}</b></span></div>'+
        '<div class="particular-row"><span class="lbl">Son/wife/daughter of:</span> <span class="val"><b>{{transferor_relation}} {{transferor_relation_name}}</b></span></div>'+
        '<div class="particular-row"><span class="lbl">Age:</span> <span class="val"><b>{{transferor_age}} years</b></span> &nbsp;&nbsp;&nbsp; <span class="lbl">Full address:</span> <span class="val"><b>{{transferor_address}}</b></span></div>'+
      '</div>'+
      '<p class="form-p">I/We, hereby declare that I/We have on this <b>{{sale_day}}</b> day of <b>{{sale_month}}</b> <b>{{sale_year}}</b> sold my/our motor vehicle bearing Registration mark <b>{{registration_no}}</b> to Shri/Smt. <b>{{transferee_name}}</b>, Son/wife/daughter of <b>{{transferee_relation}} {{transferee_relation_name}}</b>, residing at <b>{{transferee_address}}</b> (full address) and handed over the Certificate of Registration and the Certificate of Insurance to him/her/them.</p>'+
      '<p class="form-p">I/We hereby declare that to the best of my/our knowledge the certificate of registration of the vehicle has not been suspended* or cancelled.</p>'+
      '<p class="form-p">{{transferor_noc_clause}}</p>'+
      '<div class="form-signatures-row single-right"><div class="sig-col transferor-sig"><div class="sig-line">________________________________________________</div><div class="sig-caption">Signature or thumb impression of the Transferor</div><div class="sig-date">Date: <b>{{declaration_date}}</b></div></div></div>'+
      '<div class="footnote-notes" style="font-size:10px;color:#555;margin-bottom:3mm">* Details of suspension or cancellation. &nbsp;&nbsp;&nbsp; ** Strike out whichever is inapplicable.</div>'+
      '<div class="form-section-head" style="margin-top:4mm">PART II — FOR THE USE OF THE TRANSFEREE</div>'+
      '<div class="particulars-list">'+
        '<div class="particular-row"><span class="lbl">Name of the Transferee:</span> <span class="val"><b>{{transferee_name}}</b></span></div>'+
        '<div class="particular-row"><span class="lbl">Son/wife/daughter of:</span> <span class="val"><b>{{transferee_relation}} {{transferee_relation_name}}</b></span> &nbsp;&nbsp;&nbsp; <span class="lbl">Age:</span> <span class="val"><b>{{transferee_age}} years</b></span></div>'+
        '<div class="particular-row"><span class="lbl">Full address:</span> <span class="val"><b>{{transferee_address}}</b></span> <small>(Proof of address to be enclosed)</small></div>'+
      '</div>'+
      '<p class="form-p">I/We, hereby declare that I/We have on this <b>{{sale_day}}</b> day of <b>{{sale_month}}</b> <b>{{sale_year}}</b> purchased the motor vehicle bearing registration number <b>{{registration_no}}</b> from <b>{{transferor_name}}</b>, residing at <b>{{transferor_address}}</b> (name and full address) and request that necessary entries regarding the transfer of ownership of the vehicle in my/our name may be recorded in the certificate of registration and certificate of fitness of the vehicle, which is enclosed.</p>'+
      '<p class="form-p">The certificate of Insurance is also enclosed. To the best of my knowledge and belief I/We have not suppressed any facts and information furnished is true. The vehicle is not superdari and free from all encumbrances. I/We undertake to hold myself responsible for any inaccuracy of the information.</p>'+
      '<div class="form-signatures-row single-right"><div class="sig-col transferee-sig"><div class="sig-line">________________________________________________</div><div class="sig-caption">Signature or thumb impression of the Transferee</div><div class="sig-date">Date: <b>{{declaration_date}}</b></div></div></div>'+
    '</div>'+
    '<div class="official-form-page" data-form-type="form_30" data-page="2">'+
      '<div class="form-section-head">CONSENT OF THE FINANCIER IN THE CASE OF MOTOR VEHICLE SUBJECT TO AN AGREEMENT OF HIRE-PURCHASE/LEASE/HYPOTHECATION</div>'+
      '{{financier_part_block}}'+
      '<div class="office-endorsement-box">'+
        '<div class="endorsement-title">OFFICE ENDORSEMENT</div>'+
        '<div class="endorsement-ref-row"><span>Ref. No. ________________________</span><span>Office of the __________________________________</span></div>'+
        '<p class="endorsement-p">The transfer of ownership of vehicle under continuation of an endorsement of hire-purchase/lease/hypothecation agreement has been recorded with effect from ________________________ in the Registration Certificate of the vehicle <b>{{registration_no}}</b> and in the Registration record of this office in Form 24.</p>'+
        '<div class="endorsement-sign-row"><div class="endorsement-date">Date: ____________________</div><div class="endorsement-seal"><div>__________________________________________________</div><div>Signature of the Registering Authority</div></div></div>'+
        '<div class="endorsement-to"><div>To: The Financier __________________________________________________</div><div>(To be sent by Registered Post Acknowledgement Due)</div></div>'+
      '</div>'+
      '<div class="specimen-signatures-box">'+
        '<div class="specimen-instructions">Specimen signature or thumb impression of the registered owner and the Financier are to be obtained in the original application for affixing and attestation by the Registering Authority with the office seal in Forms 23 and 24, in such manner that the parts of impression of seal or stamp and attestation shall fall upon each signature.</div>'+
        '<div class="specimen-grid">'+
          '<div class="specimen-col"><div class="specimen-head">Specimen signature of the Financier</div><div class="specimen-item">1. ______________________________________</div><div class="specimen-item">2. ______________________________________</div></div>'+
          '<div class="specimen-col"><div class="specimen-head">Specimen signature of the Registered Owner</div><div class="specimen-item">1. ______________________________________</div><div class="specimen-item">2. ______________________________________</div></div>'+
        '</div>'+
      '</div>'+
    '</div>'
  },
  clearance_certificate_v1: {
    template_key: 'clearance_certificate_v1',
    form_type: 'clearance_certificate',
    version: 'v1',
    title: 'Clearance Certificate Request Letter',
    schema_fields: ['transferor_name','transferor_address','transferor_city','declaration_date','source_rto','registration_no','vehicle_make_model','chassis_no','engine_no','transferee_name','transferee_relation','transferee_relation_name','transferee_address','destination_rto','vehicle_id_clause'],
    raw_template: '<div class="official-form-page letter-page" data-form-type="clearance_certificate" data-page="1">'+
      '<div class="letter-meta-row">'+
        '<div class="letter-from"><div><b>From:</b></div><div>{{transferor_name}}</div><div>{{transferor_address}}</div></div>'+
        '<div class="letter-date-place"><div>Place: <b>{{transferor_city}}</b></div><div>Date: <b>{{declaration_date}}</b></div></div>'+
      '</div>'+
      '<div class="letter-to"><div><b>To:</b></div><div>The Regional Transport Authority / Registering Authority,</div><div><b>{{source_rto}}</b></div></div>'+
      '<div class="letter-sub"><b>Sub: Issue of Clearance Certificate for Vehicle {{registration_no}}</b></div>'+
      '<div class="letter-body">'+
        '<p>Sir,</p>'+
        '<p>I have sold my vehicle <b>{{vehicle_make_model}}</b> bearing Registration No. <b>{{registration_no}}</b>{{vehicle_id_clause}} to Shri/Smt. <b>{{transferee_name}}</b>, {{transferee_relation}} <b>{{transferee_relation_name}}</b>, residing at <b>{{transferee_address}}</b>.</p>'+
        '<p>Please issue a <b>Clearance Certificate / No Objection Certificate</b> in favor of the Registering Authority, <b>{{destination_rto}}</b> to enable re-registration, transfer of ownership, and payment of road tax.</p>'+
        '<p>Thanking you,</p>'+
      '</div>'+
      '<div class="letter-sign-block"><div>Yours faithfully,</div><br><br><div>________________________________________________</div><div><b>{{transferor_name}}</b></div><div>(Registered Owner / Transferor)</div></div>'+
    '</div>'
  },
  insurance_transfer_v1: {
    template_key: 'insurance_transfer_v1',
    form_type: 'insurance_transfer',
    version: 'v1',
    title: 'Transfer of Insurance Notice Letter',
    schema_fields: ['transferor_name','transferor_address','transferor_city','declaration_date','insurance_company','registration_no','insurance_number','vehicle_make_model','transferee_name','transferee_address'],
    raw_template: '<div class="official-form-page letter-page" data-form-type="insurance_transfer" data-page="1">'+
      '<div class="letter-meta-row">'+
        '<div class="letter-from"><div><b>From:</b></div><div>{{transferor_name}}</div><div>{{transferor_address}}</div></div>'+
        '<div class="letter-date-place"><div>Place: <b>{{transferor_city}}</b></div><div>Date: <b>{{declaration_date}}</b></div></div>'+
      '</div>'+
      '<div class="letter-to"><div><b>To:</b></div><div>The Branch Manager,</div><div><b>{{insurance_company}}</b></div></div>'+
      '<div class="letter-sub"><b>Sub: Transfer of Motor Insurance Policy for Vehicle {{registration_no}}</b></div>'+
      '<div class="letter-body">'+
        '<p>Dear Sir,</p>'+
        '<p><b>Policy / Certificate No.:</b> <b>{{insurance_number}}</b></p>'+
        '<p><b>Covering Vehicle:</b> <b>{{vehicle_make_model}}</b> (Reg. No.: <b>{{registration_no}}</b>)</p>'+
        '<p>I/We wish to inform you that I/We have sold my/our vehicle bearing the above registration number to Shri/Smt. <b>{{transferee_name}}</b>, residing at <b>{{transferee_address}}</b> together with the valid insurance cover.</p>'+
        '<p>Please have the interest of the Policy transferred in his / her / their favor.</p>'+
        '<p>Thanking you,</p>'+
      '</div>'+
      '<div class="letter-sign-block"><div>Yours faithfully,</div><br><br><div>________________________________________________</div><div><b>{{transferor_name}}</b></div><div>(Insured / Transferor)</div></div>'+
    '</div>'
  }
};

async function fetchFormTemplate(formType, version = 'v1'){
  const key = formType + '_' + version;
  if(db && db.from){
    try{
      const res = await db.from('form_templates').select('*').eq('form_type', formType).eq('version', version).eq('is_active', true).maybeSingle();
      if(res?.data && res.data.raw_template) return res.data;
    }catch(err){
      console.warn('Could not load form template from Supabase; using builtin template:', err?.message || err);
    }
  }
  const fallback = OFFICIAL_FORM_TEMPLATES[key] || OFFICIAL_FORM_TEMPLATES[formType];
  if(!fallback) throw new Error('Form template "' + formType + '" (version ' + version + ') not found in database or local registry.');
  return fallback;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function getOrdinalDay(day){
  const d = parseInt(day, 10);
  if(isNaN(d)) return String(day || '');
  const mod100 = d % 100;
  if(mod100 >= 11 && mod100 <= 13) return d + 'th';
  switch(d % 10){
    case 1: return d + 'st';
    case 2: return d + 'nd';
    case 3: return d + 'rd';
    default: return d + 'th';
  }
}

function parseTransferDateComponents(dateStr){
  if(!dateStr){
    const now = new Date();
    return { day: now.getDate(), monthName: MONTH_NAMES[now.getMonth()], year: now.getFullYear(), monthNum: now.getMonth() + 1 };
  }
  const s = String(dateStr).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(iso){
    const mIdx = parseInt(iso[2], 10) - 1;
    return { day: parseInt(iso[3], 10), monthName: MONTH_NAMES[mIdx] || '', year: parseInt(iso[1], 10), monthNum: mIdx + 1 };
  }
  const ind = s.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if(ind){
    const mIdx = parseInt(ind[2], 10) - 1;
    return { day: parseInt(ind[1], 10), monthName: MONTH_NAMES[mIdx] || '', year: parseInt(ind[3], 10), monthNum: mIdx + 1 };
  }
  const d = new Date(dateStr);
  const mIdx = d.getMonth();
  return { day: d.getDate(), monthName: MONTH_NAMES[mIdx] || '', year: d.getFullYear(), monthNum: mIdx + 1 };
}

function formatOrdinalDay(d){
  if(d instanceof Date) return getOrdinalDay(d.getDate());
  return getOrdinalDay(d);
}

function mapOwnershipTransferData(raw){
  const saleComp = parseTransferDateComponents(raw.sale_date);
  const declComp = raw.declaration_date ? parseTransferDateComponents(raw.declaration_date) : saleComp;
  const isHypo = Boolean(raw.hypothecation_type && raw.hypothecation_type !== 'none');
  const hypoType = raw.hypothecation_type === 'hire_purchase' ? 'hire-purchase' : (raw.hypothecation_type === 'lease' ? 'lease' : 'hypothecation');
  const finName = (raw.financier_name || '').trim();
  const finAddr = (raw.financier_address || '').trim();
  const isOtherState = raw.transfer_type === 'other_state';

  const hypothecationPhrase = isHypo
    ? 'under an agreement of ' + hypoType + ' with ' + esc(finName) + (finAddr ? ', ' + esc(finAddr) : '')
    : 'not held under any agreement of hire-purchase, lease or hypothecation';

  const financierSigBlock = isHypo
    ? '<div class="sig-line">________________________________________________</div><div class="sig-caption">Signature of Financier (as consent)</div><div class="sig-val" style="margin-top:2px;font-weight:600">' + esc(finName) + '</div>'
    : '<div class="not-hypo-note">(Vehicle not held under hire-purchase / lease / hypothecation)</div>';

  const financierPartBlock = isHypo
    ? '<p class="form-p">I/We being a party to an agreement of ' + hypoType + ' in respect of motor vehicle specified above, give consent to the transfer of ownership of the said motor vehicle in the name of the Transferee named above, with whom I/We have entered into an agreement of ' + hypoType + '.</p><p style="margin:2mm 0"><b>Name and address of Financier:</b> ' + esc(finName) + (finAddr ? ', ' + esc(finAddr) : '') + '</p><div class="form-signatures-row single-right"><div class="sig-col"><div class="sig-line">________________________________________________</div><div class="sig-caption">Signature of the Financier</div><div class="sig-date">Date: ____________________</div></div></div>'
    : '<p class="form-p not-hypo-note">(The motor vehicle above described is not held under hire-purchase agreement, lease agreement or subject to hypothecation).</p>';

  let transferorNocClause = '';
  if(isOtherState){
    if(raw.noc_status === 'enclosed'){
      transferorNocClause = '* I/We enclose the "No objection certificate" issued by the Registering Authority' + (raw.noc_number ? ' (NOC No: ' + esc(raw.noc_number) + ')' : '') + '.';
    }else if(raw.noc_status === 'applied'){
      transferorNocClause = '* The "No objection certificate" has been applied for at ' + esc(raw.source_rto || 'original RTO') + '; declaration filed under proviso to Section 50(1).';
    }else{
      transferorNocClause = '* No Objection Certificate declaration under section 50(1) recorded.';
    }
  }else{
    transferorNocClause = '* The vehicle transfer is within state jurisdiction; intimation filed under section 50(1) of the Motor Vehicles Act.';
  }

  const fuelType = String(raw.fuel || car?.fuel || '').toLowerCase();
  const isElectric = fuelType.includes('electric') || fuelType.includes('battery') || fuelType.includes('ev');
  const engineLabel = isElectric ? 'Motor No.' : 'Engine No.';

  const cleanChassis = String(raw.chassis_no || raw.vin || car?.vin || '').trim();
  const cleanEngine = String(raw.engine_no || car?.engine_no || '').trim();

  const chassisBlock = cleanChassis
    ? 'Chassis No. <b>' + esc(cleanChassis) + '</b>'
    : 'Chassis No. ________________________';

  const engineBlock = cleanEngine
    ? engineLabel + ' <b>' + esc(cleanEngine) + '</b>'
    : engineLabel + ' ________________________';

  const idParts = [];
  if(cleanChassis) idParts.push('Chassis No: <b>' + esc(cleanChassis) + '</b>');
  if(cleanEngine) idParts.push(engineLabel + ': <b>' + esc(cleanEngine) + '</b>');
  const vehicleIdClause = idParts.length ? ' (' + idParts.join(', ') + ')' : '';

  return {
    transfer_type: raw.transfer_type || 'same_state',
    registration_no: String(raw.registration_no || '').trim().toUpperCase(),
    vehicle_make_model: String(raw.vehicle_make_model || '').trim(),
    chassis_no: cleanChassis || '________________________',
    engine_no: cleanEngine || '________________________',
    chassis_block: chassisBlock,
    engine_block: engineBlock,
    vehicle_id_clause: vehicleIdClause,
    source_rto: String(raw.source_rto || '').trim() || 'Registering Authority',
    source_state: String(raw.source_state || '').trim(),
    destination_rto: String(raw.destination_rto || '').trim(),
    destination_state: String(raw.destination_state || '').trim(),
    transferor_name: String(raw.transferor_name || '').trim(),
    transferor_relation: String(raw.transferor_relation || 'S/o').trim(),
    transferor_relation_name: String(raw.transferor_relation_name || '').trim(),
    transferor_age: Number(raw.transferor_age) || 35,
    transferor_address: String(raw.transferor_address || '').trim(),
    transferor_city: String(raw.transferor_city || 'Chandigarh').trim(),
    transferee_name: String(raw.transferee_name || '').trim(),
    transferee_relation: String(raw.transferee_relation || 'S/o').trim(),
    transferee_relation_name: String(raw.transferee_relation_name || '').trim(),
    transferee_age: Number(raw.transferee_age) || 30,
    transferee_address: String(raw.transferee_address || '').trim(),
    sale_day: getOrdinalDay(saleComp.day),
    sale_month: saleComp.monthName,
    sale_year: String(saleComp.year),
    declaration_date: String(declComp.day).padStart(2,'0') + '-' + String(declComp.monthNum).padStart(2,'0') + '-' + declComp.year,
    hypothecation_phrase: hypothecationPhrase,
    financier_signature_block: financierSigBlock,
    financier_part_block: financierPartBlock,
    transferor_noc_clause: transferorNocClause,
    insurance_company: String(raw.insurance_company || car?.insurance_company || 'The Insurance Company').trim(),
    insurance_number: String(raw.insurance_number || car?.insurance_number || 'Policy On File').trim()
  };
}

function renderFormTemplate(rawTemplate, mappedValues){
  if(!rawTemplate) throw new Error('Raw template HTML is empty.');
  let t = rawTemplate.replace(/\{\{sale_day\}\}\s*day\s+of\s+the\s+year\s*\{\{sale_year\}\}/gi, '{{sale_day}} day of {{sale_month}} {{sale_year}}');
  return t.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key) => {
    return mappedValues[key] !== undefined ? mappedValues[key] : '';
  });
}

function buildOwnershipTransferPacketHtml(mapped, templates, scope = 'full'){
  let html = '<div class="sale-pdf-sheet">';

  if(scope === 'full' || scope === 'form_29'){
    const t29 = templates.form_29 || templates.form_29_v1;
    if(!t29?.raw_template) throw new Error('Missing raw template for Form 29.');
    const rendered29 = renderFormTemplate(t29.raw_template, mapped);
    // Page 1: Original Form 29
    html += rendered29;
    // Page 2: Duplicate Form 29
    html += rendered29.replace('<div class="form-title-main">FORM 29</div>', '<div class="duplicate-badge">DUPLICATE COPY</div><div class="form-title-main">FORM 29</div>');
  }

  if(scope === 'full' || scope === 'form_30'){
    const t30 = templates.form_30 || templates.form_30_v1;
    if(!t30?.raw_template) throw new Error('Missing raw template for Form 30.');
    const rendered30 = renderFormTemplate(t30.raw_template, mapped);
    html += rendered30;
  }

  if(scope === 'full' && mapped.transfer_type === 'other_state'){
    const tClr = templates.clearance_certificate || templates.clearance_certificate_v1;
    if(tClr?.raw_template){
      html += renderFormTemplate(tClr.raw_template, mapped);
    }
    const tIns = templates.insurance_transfer || templates.insurance_transfer_v1;
    if(tIns?.raw_template){
      html += renderFormTemplate(tIns.raw_template, mapped);
    }
  }

  html += '</div>';
  return html;
}

function validateTransferFormData(d){
  const errors = [];
  if(!d) return { valid: false, errors: ['No data provided.'] };
  if(!d.registration_no?.trim()) errors.push('Vehicle registration number is required.');
  if(!d.vehicle_make_model?.trim()) errors.push('Vehicle make and model is required.');
  if(!d.transferor_name?.trim()) errors.push('Transferor (Seller) name is required.');
  if(!d.transferor_address?.trim()) errors.push('Transferor address is required.');
  if(!d.transferee_name?.trim()) errors.push('Transferee (Buyer) name is required.');
  if(!d.transferee_relation?.trim()) errors.push('Transferee relationship is required.');
  if(!d.transferee_relation_name?.trim()) errors.push('Transferee relative name is required.');
  const age = Number(d.transferee_age);
  if(!Number.isFinite(age) || age < 18 || age > 120) errors.push('Transferee age must be between 18 and 120.');
  if(!d.transferee_address?.trim()) errors.push('Transferee residential address is required.');
  if(!d.destination_rto?.trim()) errors.push('Destination Registering Authority (RTO) is required.');
  if(!d.sale_date) errors.push('Date of sale is required.');

  if(d.hypothecation_type && d.hypothecation_type !== 'none'){
    if(!d.financier_name?.trim()) errors.push('Financier name is required when vehicle is hypothecated.');
    if(!d.financier_address?.trim()) errors.push('Financier address is required when vehicle is hypothecated.');
  }

  if(d.transfer_type === 'other_state'){
    if(!d.source_rto?.trim()) errors.push('Source Registering Authority (RTO) is required for other-state transfer.');
    if(!d.destination_state?.trim()) errors.push('Destination state is required for other-state transfer.');
  }

  return { valid: errors.length === 0, errors };
}

function getTransferorDetails(){
  const meta = user?.user_metadata || {}, p = ownerProfile || {};
  const addr = [p.address, p.city, p.state, p.pincode].filter(Boolean).join(', ');
  return {
    name: p.full_name || meta.full_name || car?.owner_name || user?.email || '',
    relation: 'S/o',
    relation_name: '',
    age: 35,
    address: addr || meta.address || meta.full_address || '',
    city: p.city || 'Chandigarh',
    state: p.state || 'Chandigarh',
    pincode: p.pincode || '',
    phone: p.phone || meta.phone || ''
  };
}

async function generateTransferDocuments(inputData, options = {}){
  const validation = validateTransferFormData(inputData);
  if(!validation.valid){
    toast('Validation failed: ' + validation.errors[0], 'error');
    throw new Error('Validation failed: ' + validation.errors.join('; '));
  }

  const scope = options.scope || 'full';
  if(!['full', 'form_29', 'form_30'].includes(scope)){
    throw new Error('Invalid document scope "' + scope + '". Expected full, form_29, or form_30.');
  }
  // Load templates with safe fallbacks
  const t29 = await fetchFormTemplate('form_29', 'v1');
  const t30 = await fetchFormTemplate('form_30', 'v1');
  const tClr = await fetchFormTemplate('clearance_certificate', 'v1');
  const tIns = await fetchFormTemplate('insurance_transfer', 'v1');
  const templates = {
    form_29: t29,
    form_30: t30,
    clearance_certificate: tClr,
    insurance_transfer: tIns
  };

  const mapped = mapOwnershipTransferData(inputData);
  const packetHtml = buildOwnershipTransferPacketHtml(mapped, templates, scope);

  let holder = document.getElementById('salePdfRenderHolder');
  if(holder) holder.remove();
  holder = document.createElement('div');
  holder.id = 'salePdfRenderHolder';
  holder.style.cssText = 'position:fixed!important;top:0!important;left:0!important;width:1px!important;height:1px!important;overflow:hidden!important;opacity:0.01!important;pointer-events:none!important;z-index:-1!important;';

  const wrapper = document.createElement('div');
  wrapper.id = 'salePdfRenderSheet';
  wrapper.style.cssText = 'width:210mm!important;background:#ffffff!important;color:#111827!important;box-sizing:border-box!important;';
  wrapper.innerHTML = packetHtml;

  holder.appendChild(wrapper);
  document.body.appendChild(holder);

  // Content validation safeguard: confirm key field values appear in DOM
  const renderedText = wrapper.textContent || '';
  if(!renderedText.includes(mapped.registration_no) || !renderedText.includes(mapped.transferee_name)){
    holder.remove();
    throw new Error('PDF template rendering check failed: Required fields missing from rendered DOM.');
  }

  // Allow browser two animation frames for layout calculation
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await new Promise(resolve => setTimeout(resolve, 60));

  const regClean = (mapped.registration_no || car?.registration_no || 'VEHICLE').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'VEHICLE';
  const pdfName = 'Transfer_Documents_' + regClean + '.pdf';

  const pdf = await loadPdfEngine();
  const opt = {
    margin: 0,
    filename: pdfName,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] }
  };

  let blob;
  try{
    blob = await pdf().set(opt).from(wrapper).outputPdf('blob');
  }finally{
    holder.remove();
  }

  // Renderer safeguards: ensure output is non-empty and has valid PDF signature
  if(!blob || blob.size < 5000){
    throw new Error('Generated PDF failed safeguard check: output is blank or abnormally small (' + (blob?.size || 0) + ' bytes).');
  }

  const headerSlice = await blob.slice(0, 16).text();
  if(!headerSlice.includes('%PDF-')){
    throw new Error('Generated PDF failed safeguard check: invalid PDF magic header.');
  }

  // Persist to vehicle archives
  const carId = car?.id || inputData.car_id;
  const userId = user?.id;
  let docId = options.editingDocId || null;
  const isRevision = Boolean(options.isRevision || car?.vehicle_status === 'sold' || options.editingDocId);
  const docTitle = 'Ownership Transfer (' + regClean + ')' + (isRevision ? ' (Revised Copy)' : '');

  if(db && db.storage && carId && userId){
    const path = userId + '/' + carId + '/archives/' + pdfName;
    const up = await db.storage.from('car-documents').upload(path, blob, { contentType: 'application/pdf', upsert: true });
    if(!up.error){
      if(docId){
        await db.from('documents').update({
          file_name: pdfName,
          storage_path: path,
          mime_type: 'application/pdf',
          file_size: blob.size,
          document_name: docTitle,
          archive_name: 'Transfer Documents',
          archived_at: new Date().toISOString()
        }).eq('id', docId);
      }else{
        const ins = await db.from('documents').insert({
          user_id: userId,
          car_id: carId,
          file_name: pdfName,
          storage_path: path,
          mime_type: 'application/pdf',
          file_size: blob.size,
          document_type: 'other',
          document_name: docTitle,
          archive_name: 'Transfer Documents',
          archived_at: new Date().toISOString(),
          active: false
        }).select().single();
        docId = ins.data?.id || null;
      }
    }
  }

  // Persist to sale_history
  let saleId = null;
  if(db && db.from && carId && userId){
    try{
      const isHypo = Boolean(inputData.hypothecation_type && inputData.hypothecation_type !== 'none');
      const saleRow = {
        user_id: userId,
        car_id: carId,
        transfer_type: mapped.transfer_type,
        seller_name: mapped.transferor_name,
        seller_relation: mapped.transferor_relation,
        seller_relation_name: mapped.transferor_relation_name,
        seller_age: mapped.transferor_age,
        seller_address: mapped.transferor_address,
        seller_city: mapped.transferor_city,
        buyer_name: mapped.transferee_name,
        buyer_relation: mapped.transferee_relation,
        buyer_relation_name: mapped.transferee_relation_name,
        buyer_age: mapped.transferee_age,
        buyer_address: mapped.transferee_address,
        buyer_rto: mapped.destination_rto,
        source_rto: mapped.source_rto,
        destination_rto: mapped.destination_rto,
        destination_state: mapped.destination_state,
        sale_date: inputData.sale_date,
        hypothecation_type: inputData.hypothecation_type || 'none',
        financier: isHypo ? (inputData.financier_name + ', ' + (inputData.financier_address || '')) : 'N/A',
        financier_name: inputData.financier_name || null,
        financier_address: inputData.financier_address || null,
        noc_status: inputData.noc_status || null,
        noc_number: inputData.noc_number || null,
        noc_date: inputData.noc_date || null,
        template_version: 'v1',
        raw_form_data: inputData,
        form_document_id: docId,
        status: 'completed'
      };

      if(options.editingDocId){
        const existingSh = await db.from('sale_history').select('id').eq('form_document_id', options.editingDocId).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if(existingSh.data?.id){
          await db.from('sale_history').update(saleRow).eq('id', existingSh.data.id);
          saleId = existingSh.data.id;
        }else{
          const shRes = await db.from('sale_history').insert(saleRow).select().single();
          saleId = shRes.data?.id || null;
        }
      }else{
        const shRes = await db.from('sale_history').insert(saleRow).select().single();
        saleId = shRes.data?.id || null;
      }
    }catch(shErr){
      console.warn('Could not insert or update sale_history:', shErr?.message || shErr);
    }
  }

  // If user requested marking vehicle as SOLD (and vehicle is not already marked as sold)
  if(inputData.mark_sold && carId && car?.vehicle_status !== 'sold'){
    try{
      await db.from('cars').update({
        vehicle_status: 'sold',
        sold_at: new Date().toISOString(),
        sold_to_name: mapped.transferee_name,
        sale_history_id: saleId
      }).eq('id', carId);
      if(car && car.id === carId){
        car.vehicle_status = 'sold';
        car.sold_at = new Date().toISOString();
        car.sold_to_name = mapped.transferee_name;
        if(saleId) car.sale_history_id = saleId;
      }
    }catch(statusErr){
      console.warn('Could not update vehicle sold status:', statusErr?.message || statusErr);
    }
  }

  return { success: true, blob, pdfName, docId, saleId, mapped, isRevision };
}

function openSaleForms(options = {}){
  if(!car) return toast('Select a vehicle before generating Transfer Documents.', 'error');
  let m = document.getElementById('saleFormsModal');
  if(m) m.remove();

  const tr = getTransferorDetails();
  const today = new Date().toISOString().slice(0, 10);
  const init = options.initialData || {};
  const isRevision = Boolean(options.isRevision || car.vehicle_status === 'sold' || options.editingDocId);
  let currentTransferType = init.transfer_type || 'same_state';

  m = document.createElement('div');
  m.id = 'saleFormsModal';

  const renderModalContent = () => {
    const isOtherState = currentTransferType === 'other_state';
    const regVal = init.registration_no || car.registration_no || '';
    const makeModelVal = init.vehicle_make_model || car.make_model || '';
    const vinVal = init.chassis_no || car.vin || '';
    const engineVal = init.engine_no || car.engine_no || '';
    const srcStateVal = init.source_state || car.puc_state || tr.state || 'Chandigarh';
    const srcRtoVal = init.source_rto || (car.puc_state ? ('RTO ' + car.puc_state) : 'R&LA Chandigarh');
    const destStateVal = init.destination_state !== undefined ? init.destination_state : (isOtherState ? '' : (car.puc_state || tr.state || 'Chandigarh'));
    const destRtoVal = init.destination_rto || '';
    const saleDateVal = init.sale_date || today;

    const sellerNameVal = init.transferor_name || tr.name;
    const sellerRelVal = init.transferor_relation || 'S/o';
    const sellerRelNameVal = init.transferor_relation_name || '';
    const sellerAgeVal = init.transferor_age || tr.age;
    const sellerAddrVal = init.transferor_address || tr.address;
    const sellerCityVal = init.transferor_city || tr.city;
    const sellerStateVal = init.transferor_state || tr.state;

    const buyerNameVal = init.transferee_name || '';
    const buyerRelVal = init.transferee_relation || 'S/o';
    const buyerRelNameVal = init.transferee_relation_name || '';
    const buyerAgeVal = init.transferee_age || 32;
    const buyerAddrVal = init.transferee_address || '';
    const buyerDistVal = init.transferee_district || '';
    const buyerStateVal = init.transferee_state || '';

    const hypoVal = init.hypothecation_type || 'none';
    const finNameVal = init.financier_name || '';
    const finAddrVal = init.financier_address || '';

    const nocStatusVal = init.noc_status || 'enclosed';
    const nocNumVal = init.noc_number || '';
    const nocDateVal = init.noc_date || today;

    const docScopeVal = init.scope || 'full';
    const markSoldChecked = car.vehicle_status === 'sold' ? true : Boolean(init.mark_sold);

    const revisionNotice = isRevision ?
      '<div class="minimal-empty" style="background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;margin-bottom:14px;padding:12px 14px;border-radius:10px">'+
        '<b>ℹ️ Editing Transfer Documents (Revised Copy)</b>'+
        '<div style="margin-top:4px;font-size:12px;color:#1d4ed8">Regenerating these forms will update the archived document with <b>(Revised Copy)</b>. Vehicle Sold status and ownership records will remain preserved.</div>'+
      '</div>' : '';

    return '<div class="sale-modal-card">'+
      '<div class="toolbar">'+
        '<div>'+
          '<h3>Transfer Documents &amp; Statutory Forms</h3>'+
          '<p class="muted">Official Form 29, Form 30, and Inter-State Transfer Documents (CMVR 1989).</p>'+
        '</div>'+
        '<button class="ghost" id="saleClose">✕</button>'+
      '</div>'+
      revisionNotice+
      '<div class="transfer-type-selector">'+
        '<button type="button" class="transfer-type-pill '+(currentTransferType==='same_state'?'active':'')+'" id="pillSameState">🏢 Same-State Ownership Transfer</button>'+
        '<button type="button" class="transfer-type-pill '+(currentTransferType==='other_state'?'active':'')+'" id="pillOtherState">🗺️ Other-State Transfer (Re-registration Required)</button>'+
      '</div>'+

      '<div class="form">'+
        '<!-- Section A: Vehicle Details -->'+
        '<div class="transfer-form-section">'+
          '<h4>🚗 Vehicle Details</h4>'+
          '<div class="transfer-grid">'+
            '<div class="field"><label>Registration Number *</label><input id="tfRegNo" value="'+esc(regVal)+'"></div>'+
            '<div class="field"><label>Vehicle Make &amp; Model *</label><input id="tfMakeModel" value="'+esc(makeModelVal)+'"></div>'+
            '<div class="field"><label>Chassis Number (VIN) *</label><input id="tfChassis" value="'+esc(vinVal)+'"></div>'+
            '<div class="field"><label>Engine Number / Motor Number *</label><input id="tfEngine" value="'+esc(engineVal)+'"></div>'+
            '<div class="field"><label>Current Registration State</label><input id="tfSourceState" value="'+esc(srcStateVal)+'"></div>'+
            '<div class="field"><label>Current Registering Authority (RTO) *</label><input id="tfSourceRto" value="'+esc(srcRtoVal)+'"></div>'+
            '<div class="field"><label>Destination State *</label><input id="tfDestState" value="'+esc(destStateVal)+'" placeholder="e.g. Himachal Pradesh / Punjab"></div>'+
            '<div class="field"><label>Destination Registering Authority (RTO) *</label><input id="tfDestRto" value="'+esc(destRtoVal)+'" placeholder="e.g. RTO Shimla / RLA Sector 17"></div>'+
            '<div class="field full"><label>Date of Sale / Agreement *</label>'+dateInputHtml('tfSaleDate', saleDateVal, true)+'</div>'+
          '</div>'+
        '</div>'+

        '<!-- Section B: Transferor / Seller Details -->'+
        '<div class="transfer-form-section">'+
          '<h4>👤 Transferor (Seller) Details</h4>'+
          '<div class="transfer-grid">'+
            '<div class="field"><label>Seller Full Name *</label><input id="tfSellerName" value="'+esc(sellerNameVal)+'"></div>'+
            '<div class="field"><label>Relationship *</label><select id="tfSellerRelation">'+
              '<option value="S/o" '+(sellerRelVal==='S/o'?'selected':'')+'>Son of (S/o)</option>'+
              '<option value="W/o" '+(sellerRelVal==='W/o'?'selected':'')+'>Wife of (W/o)</option>'+
              '<option value="D/o" '+(sellerRelVal==='D/o'?'selected':'')+'>Daughter of (D/o)</option>'+
            '</select></div>'+
            '<div class="field"><label>Relative Name</label><input id="tfSellerRelName" value="'+esc(sellerRelNameVal)+'" placeholder="Father / Husband / Mother name"></div>'+
            '<div class="field"><label>Seller Age</label><input id="tfSellerAge" type="number" min="18" max="120" value="'+sellerAgeVal+'"></div>'+
            '<div class="field full"><label>Complete Address *</label><textarea id="tfSellerAddress">'+esc(sellerAddrVal)+'</textarea></div>'+
            '<div class="field"><label>City / Town</label><input id="tfSellerCity" value="'+esc(sellerCityVal)+'"></div>'+
            '<div class="field"><label>State</label><input id="tfSellerState" value="'+esc(sellerStateVal)+'"></div>'+
          '</div>'+
        '</div>'+

        '<!-- Section C: Transferee / Buyer Details -->'+
        '<div class="transfer-form-section">'+
          '<h4>👥 Transferee (Buyer) Details</h4>'+
          '<div class="transfer-grid">'+
            '<div class="field"><label>Buyer Full Name *</label><input id="tfBuyerName" value="'+esc(buyerNameVal)+'" placeholder="Full legal name"></div>'+
            '<div class="field"><label>Relationship *</label><select id="tfBuyerRelation">'+
              '<option value="S/o" '+(buyerRelVal==='S/o'?'selected':'')+'>Son of (S/o)</option>'+
              '<option value="W/o" '+(buyerRelVal==='W/o'?'selected':'')+'>Wife of (W/o)</option>'+
              '<option value="D/o" '+(buyerRelVal==='D/o'?'selected':'')+'>Daughter of (D/o)</option>'+
            '</select></div>'+
            '<div class="field"><label>Relative Name *</label><input id="tfBuyerRelName" value="'+esc(buyerRelNameVal)+'" placeholder="Father / Husband / Mother name"></div>'+
            '<div class="field"><label>Buyer Age *</label><input id="tfBuyerAge" type="number" min="18" max="120" value="'+buyerAgeVal+'"></div>'+
            '<div class="field full"><label>Full Residential Address (House/Street/Village/Town) *</label><textarea id="tfBuyerAddress" placeholder="Complete postal address for registration records">'+esc(buyerAddrVal)+'</textarea></div>'+
            '<div class="field"><label>District *</label><input id="tfBuyerDistrict" value="'+esc(buyerDistVal)+'" placeholder="e.g. Kangra / Chandigarh"></div>'+
            '<div class="field"><label>State *</label><input id="tfBuyerState" value="'+esc(buyerStateVal)+'" placeholder="e.g. Himachal Pradesh"></div>'+
          '</div>'+
        '</div>'+

        '<!-- Section D: Declarations & Hypothecation -->'+
        '<div class="transfer-form-section">'+
          '<h4>📝 Declarations &amp; Hypothecation</h4>'+
          '<div class="transfer-grid">'+
            '<div class="field full" style="display:flex;gap:16px;flex-wrap:wrap;padding:6px 0">'+
              '<label style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:13px"><input type="checkbox" id="tfRcHanded" checked> Registration Certificate (RC) handed over</label>'+
              '<label style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:13px"><input type="checkbox" id="tfInsHanded" checked> Insurance Certificate handed over</label>'+
              '<label style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:13px"><input type="checkbox" id="tfNoSuspension" checked> Vehicle is free from encumbrances &amp; not suspended</label>'+
            '</div>'+
            '<div class="field"><label>Hypothecation / Finance Status</label>'+
              '<select id="tfHypoType">'+
                '<option value="none" '+(hypoVal==='none'?'selected':'')+'>No Finance / Not Hypothecated</option>'+
                '<option value="hypothecation" '+(hypoVal==='hypothecation'?'selected':'')+'>Hypothecation</option>'+
                '<option value="hire_purchase" '+(hypoVal==='hire_purchase'?'selected':'')+'>Hire-Purchase</option>'+
                '<option value="lease" '+(hypoVal==='lease'?'selected':'')+'>Lease Agreement</option>'+
              '</select>'+
            '</div>'+
            '<div class="field"><label>Financier Name</label><input id="tfFinancierName" value="'+esc(finNameVal)+'" placeholder="Bank / Financier name if hypothecated"></div>'+
            '<div class="field full"><label>Financier Branch Address</label><input id="tfFinancierAddress" value="'+esc(finAddrVal)+'" placeholder="Branch address if hypothecated"></div>'+
          '</div>'+
        '</div>'+

        (isOtherState ?
          '<!-- Section E: Other-State & NOC Details -->'+
          '<div class="transfer-form-section" style="background:#f0f7ff;border-color:#b9d5f8">'+
            '<h4>🗺️ Inter-State Clearance &amp; NOC Details</h4>'+
            '<div class="transfer-grid">'+
              '<div class="field"><label>NOC / Clearance Certificate Status</label>'+
                '<select id="tfNocStatus">'+
                  '<option value="enclosed" '+(nocStatusVal==='enclosed'?'selected':'')+'>NOC Enclosed (Section 48/50)</option>'+
                  '<option value="applied" '+(nocStatusVal==='applied'?'selected':'')+'>NOC Applied (45-Day Notice)</option>'+
                  '<option value="refused" '+(nocStatusVal==='refused'?'selected':'')+'>NOC Refused by Financier</option>'+
                '</select>'+
              '</div>'+
              '<div class="field"><label>NOC Number (if issued)</label><input id="tfNocNumber" value="'+esc(nocNumVal)+'" placeholder="e.g. NOC/2026/098"></div>'+
              '<div class="field"><label>NOC Date</label>'+dateInputHtml('tfNocDate', nocDateVal, false)+'</div>'+
              '<div class="field"><label>NOC Issuing Authority</label><input id="tfNocRto" value="R&LA Chandigarh" placeholder="Issuing RTO"></div>'+
            '</div>'+
            '<div class="transfer-checklist-box">'+
              '<b>📋 Official Other-State Submission Checklist (Chandigarh R&amp;LA Reference):</b>'+
              '<ul>'+
                '<li>Form No. 20 (Application for registration of a motor vehicle)</li>'+
                '<li>Form No. 27 (In duplicate — assignment of new registration mark)</li>'+
                '<li>Form No. 28 (In original / quadruplicate — NOC application and grant)</li>'+
                '<li>Form No. 29 (In duplicate — Notice of transfer of ownership)</li>'+
                '<li>Form No. 30 (In duplicate — Application for intimation &amp; transfer)</li>'+
                '<li>Copy of PAN card / Form 60 of Seller &amp; Purchaser</li>'+
                '<li>Seller’s &amp; Purchaser’s Undertakings with photograph</li>'+
                '<li>Chassis &amp; Engine pencil print</li>'+
                '<li>Original Registration Certificate (RC) &amp; Valid Insurance Certificate</li>'+
                '<li>Clearance certificate letter &amp; Insurance transfer intimation letter</li>'+
              '</ul>'+
            '</div>'+
          '</div>' : '')+

        '<!-- Document Scope and Status Actions -->'+
        '<div class="transfer-form-section">'+
          '<div class="transfer-grid">'+
            '<div class="field"><label>Document Scope</label>'+
              '<select id="tfDocScope">'+
                '<option value="full" '+(docScopeVal==='full'?'selected':'')+'>Full Transfer Documents Packet (Form 29 + 30'+(isOtherState?' + Letters':'')+')</option>'+
                '<option value="form_29" '+(docScopeVal==='form_29'?'selected':'')+'>Form 29 Only (Notice of Transfer)</option>'+
                '<option value="form_30" '+(docScopeVal==='form_30'?'selected':'')+'>Form 30 Only (Application for Transfer)</option>'+
              '</select>'+
            '</div>'+
            '<div class="field" style="display:flex;align-items:center;padding-top:24px">'+
              '<label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600">'+
                '<input type="checkbox" id="tfMarkSold" '+(markSoldChecked ? 'checked' : '')+(car.vehicle_status==='sold' ? ' disabled' : '')+'> '+(car.vehicle_status==='sold' ? 'Vehicle is already marked as SOLD' : 'Mark vehicle as SOLD in Torq Desk upon generation')+
              '</label>'+
            '</div>'+
          '</div>'+
        '</div>'+

        '<div class="full" style="display:flex;justify-content:flex-end;gap:10px;margin-top:10px">'+
          '<button type="button" class="ghost" id="tfCancelBtn">Cancel</button>'+
          '<button type="button" class="primary" id="tfGenerateBtn">'+(isRevision ? 'REGENERATE TRANSFER DOCUMENTS (REVISED COPY)' : 'GENERATE OFFICIAL TRANSFER DOCUMENTS (PDF)')+'</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  };

  const bindModalEvents = () => {
    $('saleClose').onclick = () => m.remove();
    $('tfCancelBtn').onclick = () => m.remove();

    $('pillSameState').onclick = () => {
      if(currentTransferType === 'same_state') return;
      currentTransferType = 'same_state';
      m.innerHTML = renderModalContent();
      bindModalEvents();
    };

    $('pillOtherState').onclick = () => {
      if(currentTransferType === 'other_state') return;
      currentTransferType = 'other_state';
      m.innerHTML = renderModalContent();
      bindModalEvents();
    };

    $('tfGenerateBtn').onclick = async () => {
      const btn = $('tfGenerateBtn');
      if(!btn || btn.disabled) return;

      const payload = {
        transfer_type: currentTransferType,
        car_id: car.id,
        registration_no: $('tfRegNo')?.value?.trim() || car.registration_no,
        vehicle_make_model: $('tfMakeModel')?.value?.trim() || car.make_model,
        chassis_no: $('tfChassis')?.value?.trim() || car.vin,
        engine_no: $('tfEngine')?.value?.trim() || car.engine_no,
        source_state: $('tfSourceState')?.value?.trim(),
        source_rto: $('tfSourceRto')?.value?.trim(),
        destination_state: $('tfDestState')?.value?.trim(),
        destination_rto: $('tfDestRto')?.value?.trim(),
        sale_date: dateInputValue('tfSaleDate'),
        transferor_name: $('tfSellerName')?.value?.trim(),
        transferor_relation: $('tfSellerRelation')?.value,
        transferor_relation_name: $('tfSellerRelName')?.value?.trim(),
        transferor_age: Number($('tfSellerAge')?.value) || 35,
        transferor_address: $('tfSellerAddress')?.value?.trim(),
        transferor_city: $('tfSellerCity')?.value?.trim(),
        transferor_state: $('tfSellerState')?.value?.trim(),
        transferee_name: $('tfBuyerName')?.value?.trim(),
        transferee_relation: $('tfBuyerRelation')?.value,
        transferee_relation_name: $('tfBuyerRelName')?.value?.trim(),
        transferee_age: Number($('tfBuyerAge')?.value) || 0,
        transferee_address: $('tfBuyerAddress')?.value?.trim(),
        transferee_district: $('tfBuyerDistrict')?.value?.trim(),
        transferee_state: $('tfBuyerState')?.value?.trim(),
        hypothecation_type: $('tfHypoType')?.value || 'none',
        financier_name: $('tfFinancierName')?.value?.trim(),
        financier_address: $('tfFinancierAddress')?.value?.trim(),
        noc_status: $('tfNocStatus')?.value || null,
        noc_number: $('tfNocNumber')?.value?.trim() || null,
        noc_date: dateInputValue('tfNocDate'),
        mark_sold: Boolean($('tfMarkSold')?.checked)
      };

      const val = validateTransferFormData(payload);
      if(!val.valid){
        toast(val.errors[0], 'error');
        return;
      }

      if(payload.mark_sold && car.vehicle_status !== 'sold'){
        if(!confirm('You have selected to mark ' + payload.registration_no + ' as SOLD. This will update the vehicle lifecycle. Continue?')) return;
      }

      btn.disabled = true;
      btn.textContent = isRevision ? 'REGENERATING REVISED DOCUMENTS...' : 'GENERATING OFFICIAL DOCUMENTS...';

      try{
        const scope = $('tfDocScope')?.value || 'full';
        const res = await generateTransferDocuments(payload, {
          scope,
          editingDocId: options.editingDocId,
          isRevision
        });
        m.remove();

        const previewUrl = URL.createObjectURL(res.blob);
        const pv = document.createElement('div');
        pv.id = 'saleGeneratedModal';
        pv.innerHTML = '<div class="sale-generated-card">'+
          '<div class="toolbar">'+
            '<div>'+
              '<h3>Transfer Documents Ready</h3>'+
              '<p class="muted">Generated and saved securely to vehicle archives ('+esc(res.pdfName)+').</p>'+
            '</div>'+
            '<button class="ghost" id="saleGeneratedClose">✕</button>'+
          '</div>'+
          '<iframe src="'+previewUrl+'" title="Official Transfer Documents Preview"></iframe>'+
          '<div class="sale-generated-actions">'+
            '<a class="ghost button-link" id="saleDownloadBtn" href="'+previewUrl+'" download="'+esc(res.pdfName)+'">Download PDF</a>'+
            '<button class="ghost" onclick="window.open(\''+previewUrl+'\',\'_blank\')">Open PDF in New Window</button>'+
            '<button class="primary" onclick="window.print()">Print</button>'+
          '</div>'+
        '</div>';
        document.body.appendChild(pv);
        $('saleGeneratedClose').onclick = () => {
          pv.remove();
          URL.revokeObjectURL(previewUrl);
        };

        if(payload.mark_sold || isRevision) await loadData();
        toast('Transfer Documents generated and archived successfully!');
      }catch(err){
        console.error('Transfer generation error:', err);
        toast('Generation failed: ' + (err?.message || err), 'error');
      }finally{
        if(document.body.contains(btn)){
          btn.disabled = false;
          btn.textContent = isRevision ? 'REGENERATE TRANSFER DOCUMENTS (REVISED COPY)' : 'GENERATE OFFICIAL TRANSFER DOCUMENTS (PDF)';
        }
      }
    };
  };

  m.innerHTML = renderModalContent();
  document.body.appendChild(m);
  m.onclick = e => { if(e.target === m) m.remove(); };
  bindModalEvents();
}

function saleEscape(x){ return esc(x).replace(/\n/g,'<br>'); }
function getTransferor(){ return getTransferorDetails(); }
function buildSaleFormsHtml(d){
  const mapped = mapOwnershipTransferData({
    registration_no: d.reg,
    vehicle_make_model: d.makeModel,
    chassis_no: d.vin,
    engine_no: d.engine,
    transferor_name: d.transferor,
    transferor_address: d.transferorAddress,
    transferee_name: d.buyer,
    transferee_relation: d.relation?.split(' ')[0] || 'S/o',
    transferee_relation_name: d.relation?.split(' ').slice(1).join(' ') || '',
    transferee_age: d.age,
    transferee_address: d.address,
    destination_rto: d.rto,
    source_rto: 'Registering Authority',
    sale_date: d.saleDate,
    hypothecation_type: (d.financier && d.financier !== 'N/A') ? 'hypothecation' : 'none',
    financier_name: (d.financier && d.financier !== 'N/A') ? d.financier : ''
  });
  return buildOwnershipTransferPacketHtml(mapped, OFFICIAL_FORM_TEMPLATES, 'full');
}

async function openEditTransferDoc(docId){
  if(!car) return toast('Select a vehicle first.', 'error');
  const doc = docs.find(d => d.id === docId);
  if(!doc) return toast('Document was not found. Refresh and try again.', 'error');

  let rawData = null;
  if(db && db.from){
    try{
      const res = await db.from('sale_history').select('*').eq('form_document_id', docId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if(res.data?.raw_form_data && typeof res.data.raw_form_data === 'object'){
        rawData = res.data.raw_form_data;
      }else if(res.data){
        rawData = {
          transfer_type: res.data.transfer_type || 'same_state',
          car_id: car.id,
          registration_no: car.registration_no,
          vehicle_make_model: car.make_model,
          chassis_no: car.vin,
          engine_no: car.engine_no,
          source_state: res.data.source_state,
          source_rto: res.data.source_rto,
          destination_state: res.data.destination_state,
          destination_rto: res.data.destination_rto,
          sale_date: res.data.sale_date,
          transferor_name: res.data.seller_name,
          transferor_relation: res.data.seller_relation,
          transferor_relation_name: res.data.seller_relation_name,
          transferor_age: res.data.seller_age,
          transferor_address: res.data.seller_address,
          transferor_city: res.data.seller_city,
          transferor_state: res.data.seller_state,
          transferee_name: res.data.buyer_name,
          transferee_relation: res.data.buyer_relation,
          transferee_relation_name: res.data.buyer_relation_name,
          transferee_age: res.data.buyer_age,
          transferee_address: res.data.buyer_address,
          transferee_district: res.data.buyer_district,
          transferee_state: res.data.buyer_state,
          hypothecation_type: res.data.hypothecation_type || 'none',
          financier_name: res.data.financier_name,
          financier_address: res.data.financier_address,
          noc_status: res.data.noc_status,
          noc_number: res.data.noc_number,
          noc_date: res.data.noc_date
        };
      }
    }catch(err){
      console.warn('Could not query sale_history for doc edit:', err?.message || err);
    }
  }

  openSaleForms({
    initialData: rawData,
    editingDocId: docId,
    isRevision: true
  });
}

window.OFFICIAL_FORM_TEMPLATES = OFFICIAL_FORM_TEMPLATES;
window.fetchFormTemplate = fetchFormTemplate;
window.formatOrdinalDay = formatOrdinalDay;
window.mapOwnershipTransferData = mapOwnershipTransferData;
window.renderFormTemplate = renderFormTemplate;
window.buildOwnershipTransferPacketHtml = buildOwnershipTransferPacketHtml;
window.validateTransferFormData = validateTransferFormData;
window.generateTransferDocuments = generateTransferDocuments;
window.openSaleForms = openSaleForms;
window.openEditTransferDoc = openEditTransferDoc;
window.getOrdinalDay = getOrdinalDay;
window.parseTransferDateComponents = parseTransferDateComponents;
function renderFab(){
 let f=document.getElementById('dashboardFab');if(f)f.remove();
 f=document.createElement('div');f.id='dashboardFab';f.innerHTML='<button class="fab-main" aria-label="Quick actions">＋</button><div class="fab-menu"><button onclick="nav(\'add\')">🛠️ <span>Add Service Log</span></button><button onclick="openDocUploader()">📄 <span>Upload Document</span></button><button onclick="openOdometerPrompt()">⛽ <span>Log Odometer / Fuel</span></button><button onclick="openReportAndPrint()">🖨️ <span>Generate A4 Report</span></button></div>';document.body.appendChild(f);
 const fabBtn=f.querySelector('.fab-main');if(fabBtn)fabBtn.onclick=()=>f.classList.toggle('open');
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
async function saveOwnerProfileValues(values){
 const payload={
   user_id:user.id,
   full_name:String(values.full_name||'').trim(),
   phone:String(values.phone||'').trim()||null,
   address:String(values.address||'').trim()||null,
   city:String(values.city||'').trim()||null,
   state:String(values.state||'').trim()||null,
   pincode:String(values.pincode||'').trim()||null,
   updated_at:new Date().toISOString()
 };
 if(!payload.full_name)return {error:new Error('Full Name is required.')};
 const r=await db.from('user_profiles').upsert(payload,{onConflict:'user_id'}).select().single();
 if(r.error)return {error:r.error};
 ownerProfile=r.data;
 return {data:r.data};
}
let isOwnerProfileEditOpen = false;
let isChangePasswordOpen = false;

function renderOwnerProfileSummary(p, meta) {
  const hasProfile = Boolean(p.full_name);
  const fullName = p.full_name || meta.full_name || '';
  const phone = p.phone || meta.phone || '';
  const cityState = [p.city, p.state].filter(Boolean).join(', ');
  const pincode = p.pincode || '';
  const address = p.address || meta.address || meta.full_address || '';

  return '<div class="owner-profile-summary" id="ownerProfileSummary">'+
    (!hasProfile ? '<div class="minimal-empty dangerbox" style="margin-bottom:14px"><b>No owner profile saved yet.</b><div class="muted" style="margin-top:5px">Save your name and address here before generating Transfer Documents.</div></div>' : '')+
    '<div class="profile-summary-grid">'+
      '<div class="profile-summary-item">'+
        '<span class="muted profile-summary-label">Full Name</span>'+
        '<b class="profile-summary-val" id="opsName">'+esc(fullName || 'Not saved')+'</b>'+
      '</div>'+
      '<div class="profile-summary-item">'+
        '<span class="muted profile-summary-label">Phone</span>'+
        '<b class="profile-summary-val" id="opsPhone">'+esc(phone || 'Not saved')+'</b>'+
      '</div>'+
      '<div class="profile-summary-item">'+
        '<span class="muted profile-summary-label">City &amp; State</span>'+
        '<b class="profile-summary-val" id="opsCityState">'+esc(cityState || 'Not saved')+'</b>'+
      '</div>'+
      '<div class="profile-summary-item">'+
        '<span class="muted profile-summary-label">Pincode</span>'+
        '<b class="profile-summary-val" id="opsPincode">'+esc(pincode || 'Not saved')+'</b>'+
      '</div>'+
      '<div class="profile-summary-item full">'+
        '<span class="muted profile-summary-label">Address</span>'+
        '<b class="profile-summary-val" id="opsAddress">'+esc(address || 'Not saved')+'</b>'+
      '</div>'+
    '</div>'+
  '</div>';
}

function ownerProfileFields(p, meta, showCancel = false) {
  return '<div class="form">'+
    '<div class="field"><label>Full Name *</label><input id="opName" value="'+esc(p.full_name||meta.full_name||'')+'"></div>'+
    '<div class="field"><label>Phone</label><input id="opPhone" inputmode="tel" value="'+esc(p.phone||meta.phone||'')+'"></div>'+
    '<div class="field full"><label>Address</label><textarea id="opAddress">'+esc(p.address||meta.address||meta.full_address||'')+'</textarea></div>'+
    '<div class="field"><label>City</label><input id="opCity" value="'+esc(p.city||'')+'"></div>'+
    '<div class="field"><label>State</label><input id="opState" value="'+esc(p.state||'')+'"></div>'+
    '<div class="field"><label>Pincode</label><input id="opPincode" inputmode="numeric" value="'+esc(p.pincode||'')+'"></div>'+
    '<div class="full" style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px">'+
      (showCancel ? '<button type="button" class="ghost" id="opCancel">Cancel</button>' : '')+
      '<button class="primary" id="opSave">SAVE PROFILE</button>'+
    '</div>'+
  '</div>';
}

function ownerProfileView(){
  const el=$('ownerProfileContent');if(!el)return;
  const p=ownerProfile||window.ownerProfile||{},meta=user?.user_metadata||window.user?.user_metadata||{};
  const hasProfile=Boolean(p.full_name);
  el.innerHTML='<div class="owner-profile-shell">'+
    '<div class="owner-profile-head"><div class="toolbar"><div><span class="muted">SECURITY &amp; IDENTITY</span><h2>Account &amp; Security</h2><p class="muted">Manage your authentication state, 120s idle protection, and saved owner transfer profile.</p></div>'+
    (hasProfile?'<span class="status ok">PROFILE SAVED</span>':'<span class="status warn">NOT SAVED</span>')+
    '</div></div>'+
    '<div class="card security-status-card">'+
      '<div class="security-card-head"><div class="security-card-icon"><svg aria-hidden="true" style="width:24px;height:24px;stroke:var(--c-accent)"><use href="#td-icon-shield"/></svg></div><div><h3>Account Security &amp; Session Guard</h3><p class="muted">Session protection, identity safeguards and account controls</p></div></div>'+
      '<div class="security-badges-grid">'+
        '<div class="sec-item"><span class="sec-tag ok">ACTIVE</span><b>Inactivity Lock (120s)</b><p class="muted">Automatic session protection guards your vehicle records on unattended or shared devices.</p></div>'+
        '<div class="sec-item"><span class="sec-tag ok">SYNCED</span><b>Active Session Heartbeat</b><p class="muted">Secure background synchronization keeps your session active while you work.</p></div>'+
        '<div class="sec-item"><span class="sec-tag ok">VERIFIED</span><b>Authenticated Account</b><p class="muted">Signed in as '+esc(user?.email||'Unknown')+'</p></div>'+
      '</div>'+
      '<div style="margin-top:16px;display:flex;justify-content:flex-end"><button type="button" class="danger" onclick="db.auth.signOut()">Sign Out of Torq Desk</button></div>'+
    '</div>'+
    renderPlanStatusCard()+
    '<div class="card owner-profile-card">'+
    '<div class="card-head-row"><div><h3>Saved Owner Profile</h3><p class="muted">Populated on printed vehicle dossiers and official Transfer Documents.</p></div>'+
    '<button type="button" class="ghost btn-sm" id="opEditBtn">Edit Profile</button></div>'+
    renderOwnerProfileSummary(p,meta)+
    '<div id="ownerProfileEditSection" class="owner-profile-edit-section '+(isOwnerProfileEditOpen?'':'hidden')+'" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--c-line)">'+
    ownerProfileFields(p,meta,true)+
    '</div>'+
    '</div>'+
    '<div class="card change-password-card">'+
    '<div class="card-head-row"><div><h3>Change Password</h3><p class="muted">Update your account password with instant verification.</p></div>'+
    '<button type="button" class="ghost btn-sm" id="cpToggleBtn">Change Password</button></div>'+
    '<div id="changePasswordFormSection" class="change-password-form-section '+(isChangePasswordOpen?'':'hidden')+'" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--c-line)">'+
    '<div class="form">'+
      '<div class="field full"><label for="cpCurrent">Current Password *</label><div class="auth-password-control"><input id="cpCurrent" type="password" autocomplete="current-password" placeholder="Enter current password"><button type="button" class="auth-password-toggle" id="cpCurrentToggle">Show</button></div></div>'+
      '<div class="field"><label for="cpNew">New Password *</label><div class="auth-password-control"><input id="cpNew" type="password" autocomplete="new-password" placeholder="At least 8 characters"><button type="button" class="auth-password-toggle" id="cpNewToggle">Show</button></div><small class="muted" style="margin-top:3px;display:block">Min 8 characters with letters and numbers.</small></div>'+
      '<div class="field"><label for="cpConfirm">Confirm New Password *</label><div class="auth-password-control"><input id="cpConfirm" type="password" autocomplete="new-password" placeholder="Repeat new password"><button type="button" class="auth-password-toggle" id="cpConfirmToggle">Show</button></div></div>'+
      '<div class="full" id="cpMessage" style="display:none;font-size:13px;padding:8px 12px;border-radius:8px;margin-bottom:6px"></div>'+
      '<div class="full" style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px">'+
        '<button type="button" class="ghost" id="cpCancel">Cancel</button>'+
        '<button type="button" class="primary" id="cpSubmit">UPDATE PASSWORD</button>'+
      '</div>'+
    '</div>'+
    '</div>'+
    '</div>'+
    '<div class="build-version" style="margin:10px 2px 0;color:var(--c-mute);font-size:11px;text-align:right">Build '+esc(window.CARMY_BUILD||'unknown')+'</div>'+
    '</div>';

  const editSec = $('ownerProfileEditSection');
  const editBtn = $('opEditBtn');
  if (editBtn) editBtn.textContent = 'Edit Profile';
  const opCancelBtn = $('opCancel');
  if (opCancelBtn) opCancelBtn.textContent = 'Cancel';
  const opSaveBtn = $('opSave');
  if (opSaveBtn) opSaveBtn.textContent = 'SAVE PROFILE';

  if ($('opName') && !$('opName').value) $('opName').value = p.full_name || meta.full_name || '';
  if ($('opPhone') && !$('opPhone').value) $('opPhone').value = p.phone || meta.phone || '';
  if ($('opAddress') && !$('opAddress').value) $('opAddress').value = p.address || meta.address || meta.full_address || '';
  if ($('opCity') && !$('opCity').value) $('opCity').value = p.city || '';
  if ($('opState') && !$('opState').value) $('opState').value = p.state || '';
  if ($('opPincode') && !$('opPincode').value) $('opPincode').value = p.pincode || '';

  const setOwnerProfileEdit = (open) => {
    isOwnerProfileEditOpen = Boolean(open);
    if (editSec) {
      if (isOwnerProfileEditOpen) {
        editSec.classList.remove('hidden');
        $('opName')?.focus();
      } else {
        editSec.classList.add('hidden');
      }
    }
  };
  setOwnerProfileEdit(isOwnerProfileEditOpen);

  if (editBtn) {
    editBtn.onclick = () => setOwnerProfileEdit(!isOwnerProfileEditOpen);
  }

  if (opCancelBtn) {
    opCancelBtn.onclick = () => {
      const curP = ownerProfile || {}, curMeta = user?.user_metadata || {};
      if ($('opName')) $('opName').value = curP.full_name || curMeta.full_name || '';
      if ($('opPhone')) $('opPhone').value = curP.phone || curMeta.phone || '';
      if ($('opAddress')) $('opAddress').value = curP.address || curMeta.address || curMeta.full_address || '';
      if ($('opCity')) $('opCity').value = curP.city || '';
      if ($('opState')) $('opState').value = curP.state || '';
      if ($('opPincode')) $('opPincode').value = curP.pincode || '';
      setOwnerProfileEdit(false);
    };
  }

  const btn = $('opSave');
  if (btn) {
    btn.onclick = async () => {
      if (btn.disabled) return;
      const nameVal = $('opName')?.value?.trim();
      if (!nameVal) {
        toast('Full Name is required.', 'error');
        return;
      }
      const curP = ownerProfile || {}, curMeta = user?.user_metadata || {};
      const currentPhone = normalizeMobile(curP.phone || curMeta.phone || '');
      const newPhoneRaw = $('opPhone')?.value || '';
      const newPhoneNorm = normalizeMobile(newPhoneRaw);

      if (currentPhone && newPhoneNorm && newPhoneNorm !== currentPhone) {
        // Mobile change requires fresh OTP
        if (typeof backendAvailable === 'function' && !backendAvailable('profile_mobile_change')) {
          renderMobileChangeBlocked();
          return;
        }
        openMobileChangeOtpModal('+91' + newPhoneNorm);
        return;
      }

      btn.disabled = true;
      btn.textContent = 'SAVING...';
      try {
        const r = await saveOwnerProfileValues({
          full_name: $('opName').value,
          phone: $('opPhone').value,
          address: $('opAddress').value,
          city: $('opCity').value,
          state: $('opState').value,
          pincode: $('opPincode').value
        });
        if (r.error) {
          toast('Profile save failed. ' + dbSetupHint(r.error), 'error');
        } else {
          updateIdentityUI();
          toast('Owner profile saved successfully.');
          isOwnerProfileEditOpen = false;
          ownerProfileView();
        }
      } catch (err) {
        console.error('Owner profile save error:', err);
        toast('Profile save failed. ' + dbSetupHint(err), 'error');
      } finally {
        if (document.getElementById('opSave')) {
          document.getElementById('opSave').disabled = false;
          document.getElementById('opSave').textContent = 'SAVE PROFILE';
        }
      }
    };
  }

  const cpSec = $('changePasswordFormSection');
  const cpToggleBtn = $('cpToggleBtn');
  if (cpToggleBtn) cpToggleBtn.textContent = 'Change Password';
  const cpCancelBtn = $('cpCancel');
  if (cpCancelBtn) cpCancelBtn.textContent = 'Cancel';
  const cpSubmitBtn = $('cpSubmit');
  if (cpSubmitBtn) cpSubmitBtn.textContent = 'UPDATE PASSWORD';

  const setChangePasswordOpen = (open) => {
    isChangePasswordOpen = Boolean(open);
    if (cpSec) {
      if (isChangePasswordOpen) {
        cpSec.classList.remove('hidden');
        $('cpCurrent')?.focus();
      } else {
        cpSec.classList.add('hidden');
      }
    }
  };
  setChangePasswordOpen(isChangePasswordOpen);

  if (cpToggleBtn) {
    cpToggleBtn.onclick = () => setChangePasswordOpen(!isChangePasswordOpen);
  }
  if (cpCancelBtn) {
    cpCancelBtn.onclick = () => {
      if ($('cpCurrent')) $('cpCurrent').value = '';
      if ($('cpNew')) $('cpNew').value = '';
      if ($('cpConfirm')) $('cpConfirm').value = '';
      const msgEl = $('cpMessage');
      if (msgEl) {
        msgEl.style.display = 'none';
        msgEl.textContent = '';
      }
      setChangePasswordOpen(false);
    };
  }

  const bindToggle = (inputId, toggleId) => {
    const inp = $(inputId), b = $(toggleId);
    if (!inp || !b) return;
    b.onclick = () => {
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      b.textContent = show ? 'Hide' : 'Show';
      b.setAttribute('aria-pressed', String(show));
    };
  };
  bindToggle('cpCurrent', 'cpCurrentToggle');
  bindToggle('cpNew', 'cpNewToggle');
  bindToggle('cpConfirm', 'cpConfirmToggle');

  const cpBtn = $('cpSubmit');
  if (cpBtn) {
    cpBtn.onclick = async () => {
      const cur = $('cpCurrent')?.value || '';
      const neu = $('cpNew')?.value || '';
      const cnf = $('cpConfirm')?.value || '';
      const msgEl = $('cpMessage');
      const showMsg = (txt, isErr = true) => {
        if (!msgEl) return;
        msgEl.style.display = 'block';
        msgEl.style.background = isErr ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)';
        msgEl.style.color = isErr ? '#dc2626' : '#16a34a';
        msgEl.style.border = isErr ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(34,197,94,0.2)';
        msgEl.textContent = txt;
      };
      if (!cur) return showMsg('Please enter your current password.');
      if (!neu || neu.length < 8) return showMsg('New password must be at least 8 characters long.');
      if (!/[A-Za-z]/.test(neu) || !/[0-9]/.test(neu)) return showMsg('New password must contain both letters and numbers.');
      if (neu !== cnf) return showMsg('New password and confirmation do not match.');
      if (cur === neu) return showMsg('New password must be different from current password.');

      cpBtn.disabled = true;
      cpBtn.textContent = 'VERIFYING & UPDATING...';
      try {
        const verifyRes = await db.auth.signInWithPassword({ email: user.email, password: cur });
        if (verifyRes.error) return showMsg('Current password is incorrect. Please check and try again.');
        const updateRes = await db.auth.updateUser({ password: neu });
        if (updateRes.error) return showMsg('Password update failed: ' + (updateRes.error.message || 'Unknown error'));
        toast('Your password has been updated successfully.');
        if ($('cpCurrent')) $('cpCurrent').value = '';
        if ($('cpNew')) $('cpNew').value = '';
        if ($('cpConfirm')) $('cpConfirm').value = '';
        if (msgEl) {
          msgEl.style.display = 'none';
          msgEl.textContent = '';
        }
        setChangePasswordOpen(false);
      } catch (err) {
        console.error('Password change error:', err);
        showMsg('An unexpected error occurred. Please try again.');
      } finally {
        if (document.body.contains(cpBtn)) {
          cpBtn.disabled = false;
          cpBtn.textContent = 'UPDATE PASSWORD';
        }
      }
    };
  }
  if(!userPlanStatus&&!userPlanLoading&&!userPlanError){
    loadUserPlanStatus();
  }
}

/* ===== Phase 3: User Dashboard & Subscription Plan Services ===== */

async function loadUserPlanStatus(force=false){
  if(!user)return null;
  if(userPlanStatus&&!force)return userPlanStatus;
  userPlanLoading=true;
  userPlanError=null;
  try{
    const res=await workerGet('/api/plan/status');
    if(res&&res.ok&&res.data){
      userPlanStatus=res.data;
      userPlanError=null;
    }else{
      userPlanStatus={
        plan:user?.user_metadata?.plan||'lite',
        status:'active',
        expires_at:null,
        max_vehicles:1,
        storage_mb_limit:10,
        storage_mb_used:0.8
      };
    }
  }catch(err){
    if(err?.status===404){
      userPlanError={status:404,message:'Route /api/plan/status returned 404'};
    }else{
      userPlanError=err;
    }
  }finally{
    userPlanLoading=false;
    updatePlanStatusCardDom();
  }
  return userPlanStatus;
}

function updatePlanStatusCardDom(){
  const card=document.getElementById('userPlanStatusCard');
  if(!card)return;
  const tmp=document.createElement('div');
  tmp.innerHTML=renderPlanStatusCard();
  if(tmp.firstElementChild){
    card.replaceWith(tmp.firstElementChild);
  }
}

function renderPlanStatusCard(){
  if(userPlanLoading){
    return '<div class="card plan-status-card" id="userPlanStatusCard"><div style="text-align:center;padding:24px"><span class="spinner-sm"></span> Loading subscription status from <code>GET /api/plan/status</code>...</div></div>';
  }
  if(userPlanError){
    return '<div class="card plan-status-card" id="userPlanStatusCard">'+renderAdminBlockedCard('/api/plan/status','GET',userPlanError.message||'Plan status endpoint unavailable (404).')+'</div>';
  }
  const st=userPlanStatus||{
    plan:user?.user_metadata?.plan||'lite',
    status:'active',
    expires_at:null,
    max_vehicles:1,
    storage_mb_limit:10,
    storage_mb_used:0.8
  };
  const planKey=(st.plan||'lite').toLowerCase();
  const planName=planKey==='ultra'?'Ultra (Workshop SaaS)':(planKey==='premium'?'Premium (Owner Plus)':'Lite (Free Tier)');
  const maxVehicles=st.max_vehicles||(planKey==='ultra'?999:(planKey==='premium'?5:1));
  const maxVehiclesDisplay=planKey==='ultra'?'Unlimited':String(maxVehicles);
  const vehicleCount=Array.isArray(cars)?cars.length:0;
  const vehiclePercent=maxVehicles===999?10:Math.min(100,Math.round((vehicleCount/maxVehicles)*100));
  const storageLimit=st.storage_mb_limit||(planKey==='ultra'?5000:(planKey==='premium'?500:10));
  const storageUsed=Number(st.storage_mb_used||0).toFixed(1);
  const storagePercent=Math.min(100,Math.round((storageUsed/storageLimit)*100));
  const isExpired=(st.status==='expired'||Boolean(st.is_expired));

  return '<div class="card plan-status-card" id="userPlanStatusCard">'+
    '<div class="plan-card-head">'+
      '<div style="display:flex;align-items:center;gap:10px">'+
        '<div style="font-size:24px">🏷️</div>'+
        '<div>'+
          '<h3 style="margin:0;font-size:16px">Subscription &amp; Entitlements</h3>'+
          '<p class="muted" style="margin:2px 0 0;font-size:12.5px">Active plan benefits, vehicle quotas, and cloud vault storage.</p>'+
        '</div>'+
      '</div>'+
      '<div style="display:flex;align-items:center;gap:8px">'+
        '<span class="plan-badge plan-'+esc(planKey)+'">'+esc(planName)+'</span>'+
        (isExpired?'<span class="sec-tag danger">EXPIRED</span>':'<span class="sec-tag ok">ACTIVE</span>')+
      '</div>'+
    '</div>'+
    '<div class="plan-metrics-grid">'+
      '<div class="plan-metric-box">'+
        '<span class="muted" style="font-size:11.5px;text-transform:uppercase;font-weight:700">Vehicle Limit</span>'+
        '<b>'+esc(vehicleCount)+' / '+esc(maxVehiclesDisplay)+' Vehicles</b>'+
        '<div class="plan-quota-meter"><div class="plan-quota-fill" style="width:'+vehiclePercent+'%;background:'+(vehiclePercent>=100?'#dc2626':'#2563eb')+'"></div></div>'+
        '<small class="muted" style="margin-top:6px;display:block">'+(vehicleCount>=maxVehicles?'Limit reached for this tier':'Slot available for vehicle registration')+'</small>'+
      '</div>'+
      '<div class="plan-metric-box">'+
        '<span class="muted" style="font-size:11.5px;text-transform:uppercase;font-weight:700">Encrypted Document Vault</span>'+
        '<b>'+esc(storageUsed)+' / '+esc(storageLimit)+' MB</b>'+
        '<div class="plan-quota-meter"><div class="plan-quota-fill" style="width:'+storagePercent+'%;background:'+(storagePercent>=100?'#dc2626':'#2563eb')+'"></div></div>'+
        '<small class="muted" style="margin-top:6px;display:block">'+(storagePercent>=100?'Vault full — upgrade for more storage':'Private cloud space for RC, PUC & Insurance')+'</small>'+
      '</div>'+
      '<div class="plan-metric-box">'+
        '<span class="muted" style="font-size:11.5px;text-transform:uppercase;font-weight:700">Entitlement Validity</span>'+
        '<b>'+(st.expires_at?formatAdminDate(st.expires_at):'Indefinite / Lifetime')+'</b>'+
        '<small class="muted" style="margin-top:14px;display:block">'+(isExpired?'Plan has expired. Renew to restore access.':'Your subscription is active and verified.')+'</small>'+
      '</div>'+
    '</div>'+
    '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;margin-top:14px;padding-top:14px;border-top:1px solid #f1f5f9">'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
        '<button type="button" class="primary btn-sm" id="btnOpenPlanComparison" onclick="openPlanComparisonModal()">Compare &amp; Upgrade Plans</button>'+
        '<button type="button" class="ghost btn-sm" id="btnToggleActivationCode" onclick="toggleActivationRedeemSection()">Redeem Code</button>'+
      '</div>'+
      '<small class="muted">Need custom workshop seats? <a href="javascript:void(0)" onclick="openUpgradeRequestModal(\'ultra\')" style="color:#2563eb;font-weight:600">Contact Sales</a></small>'+
    '</div>'+
    '<div id="activationRedeemSection" class="'+(isActivationRedeemOpen?'':'hidden')+'" style="margin-top:14px;padding:14px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px">'+
      '<label style="display:block;font-size:12.5px;font-weight:700;margin-bottom:6px">Redeem Activation Code or Voucher</label>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
        '<input type="text" id="activationCodeInput" placeholder="e.g. TD-PLUS-XXXX-XXXX" style="flex:1;min-width:200px;text-transform:uppercase;font-family:monospace;font-weight:700">'+
        '<button type="button" class="primary" id="btnRedeemActivationCode" onclick="redeemActivationCode()">Apply Code</button>'+
      '</div>'+
      '<div id="activationRedeemMsg" style="display:none;margin-top:8px;font-size:12px;padding:8px 12px;border-radius:6px"></div>'+
    '</div>'+
  '</div>';
}

function toggleActivationRedeemSection(){
  isActivationRedeemOpen=!isActivationRedeemOpen;
  const sec=document.getElementById('activationRedeemSection');
  if(sec){
    sec.classList.toggle('hidden',!isActivationRedeemOpen);
  }
}

async function redeemActivationCode(){
  const input=document.getElementById('activationCodeInput');
  const code=input?.value?.trim()?.toUpperCase()||'';
  const msgEl=document.getElementById('activationRedeemMsg');
  const btn=document.getElementById('btnRedeemActivationCode');
  if(!code){
    toast('Please enter an activation code.','error');
    return;
  }
  if(btn){btn.disabled=true;btn.textContent='Verifying...';}
  if(msgEl){msgEl.style.display='none';}
  try{
    const res=await workerPost('/api/activation/redeem',{code});
    const newPlan=res?.plan||res?.data?.plan||'premium';
    toast('Activation code redeemed successfully! Plan upgraded to '+newPlan+'.','ok');
    if(msgEl){
      msgEl.style.display='block';
      msgEl.style.background='rgba(22,163,74,.08)';
      msgEl.style.color='#166534';
      msgEl.textContent='Success! Code '+code+' applied. Plan updated to '+newPlan+'.';
    }
    if(input)input.value='';
    await loadUserPlanStatus(true);
  }catch(err){
    const errMsg=err?.message||'Invalid or expired activation code.';
    toast('Redemption failed: '+errMsg,'error');
    if(msgEl){
      msgEl.style.display='block';
      msgEl.style.background='rgba(220,38,38,.08)';
      msgEl.style.color='#b91c1c';
      msgEl.textContent=errMsg;
    }
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Apply Code';}
  }
}

function setComparisonCycle(cycle){
  currentComparisonCycle=cycle;
  renderPlanComparisonModalContent();
}

function openPlanComparisonModal(){
  let old=document.getElementById('planComparisonModal');
  if(old)old.remove();

  const modal=document.createElement('div');
  modal.id='planComparisonModal';
  modal.className='admin-modal-overlay';
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');

  modal.innerHTML='<div class="admin-modal-box" style="max-width:820px" id="planComparisonModalBox"></div>';
  modal.onclick=e=>{if(e.target===modal)closePlanComparisonModal();};
  document.body.appendChild(modal);

  renderPlanComparisonModalContent();
}

function closePlanComparisonModal(){
  const m=document.getElementById('planComparisonModal');
  if(m)m.remove();
}

function renderPlanComparisonModalContent(){
  const box=document.getElementById('planComparisonModalBox');
  if(!box)return;

  const isYearly=(currentComparisonCycle==='yearly');
  const curPlan=(userPlanStatus?.plan||'lite').toLowerCase();

  box.innerHTML='<div class="admin-modal-head">'+
    '<div>'+
      '<h3 style="margin:0;font-size:18px">Choose the Right Plan for Your Garage</h3>'+
      '<p class="muted" style="margin:2px 0 0;font-size:12.5px">Transparent pricing with zero hidden fees. Upgrade or cancel anytime.</p>'+
    '</div>'+
    '<button type="button" class="ghost" onclick="closePlanComparisonModal()">✕</button>'+
  '</div>'+
  '<div style="display:flex;justify-content:center;margin:16px 0 20px">'+
    '<div class="plan-cycle-toggle">'+
      '<button type="button" class="plan-cycle-btn '+(isYearly?'':'active')+'" onclick="setComparisonCycle(\'monthly\')">Monthly Billing</button>'+
      '<button type="button" class="plan-cycle-btn '+(isYearly?'active':'')+'" onclick="setComparisonCycle(\'yearly\')">Annual Billing <span class="plan-save-pill">Save 15%</span></button>'+
    '</div>'+
  '</div>'+
  '<div class="plan-cards-grid">'+
    '<div class="plan-tier-card '+(curPlan==='lite'?'current':'')+'">'+
      '<div class="plan-tier-head">'+
        '<span class="admin-badge plan-lite">LITE</span>'+
        '<h4 style="margin:8px 0 4px">Free Forever</h4>'+
        '<div class="plan-tier-price">₹0<small>/mo</small></div>'+
        '<p class="muted" style="font-size:12px">Essential vehicle maintenance tracker for individual owners.</p>'+
      '</div>'+
      '<ul class="plan-tier-features">'+
        '<li><b>1 Vehicle</b> maximum</li>'+
        '<li><b>10 MB</b> Document Vault</li>'+
        '<li>Basic Service History Logs</li>'+
        '<li>Digital Maintenance Reminders</li>'+
        '<li>Standard Community Support</li>'+
      '</ul>'+
      '<div class="plan-tier-action">'+
        (curPlan==='lite'?
          '<button type="button" class="ghost" disabled style="width:100%">Current Plan</button>':
          '<button type="button" class="ghost" disabled style="width:100%">Base Tier</button>')+
      '</div>'+
    '</div>'+
    '<div class="plan-tier-card featured '+(curPlan==='premium'?'current':'')+'">'+
      '<div class="plan-ribbon">MOST POPULAR</div>'+
      '<div class="plan-tier-head">'+
        '<span class="admin-badge plan-premium">PREMIUM</span>'+
        '<h4 style="margin:8px 0 4px">Vehicle Owner Plus</h4>'+
        '<div class="plan-tier-price">'+(isYearly?'₹708<small>/yr</small>':'₹69<small>/mo</small>')+'</div>'+
        '<p class="muted" style="font-size:12px">'+(isYearly?'₹59/mo equivalent, billed annually':'Billed monthly, cancel anytime')+'</p>'+
      '</div>'+
      '<ul class="plan-tier-features">'+
        '<li><b>Up to 5 Vehicles</b></li>'+
        '<li><b>500 MB</b> Encrypted Document Vault</li>'+
        '<li><b>RTO Transfer Pack</b> (Form 29 &amp; 30 PDF)</li>'+
        '<li>Export Full Vehicle Dossier</li>'+
        '<li>Priority Support Tickets (24h SLA)</li>'+
        '<li>Ad-free Experience</li>'+
      '</ul>'+
      '<div class="plan-tier-action">'+
        (curPlan==='premium'?
          '<button type="button" class="ghost" disabled style="width:100%">Current Plan</button>':
          '<button type="button" class="primary" style="width:100%" id="btnUpgradeToPremium" onclick="openUpgradeRequestModal(\'premium\')">Upgrade to Premium</button>')+
      '</div>'+
    '</div>'+
    '<div class="plan-tier-card '+(curPlan==='ultra'?'current':'')+'">'+
      '<div class="plan-tier-head">'+
        '<span class="admin-badge plan-ultra">ULTRA</span>'+
        '<h4 style="margin:8px 0 4px">Workshop SaaS</h4>'+
        '<div class="plan-tier-price">'+(isYearly?'₹1999<small>/yr</small>':'₹199<small>/mo</small>')+'</div>'+
        '<p class="muted" style="font-size:12px">'+(isYearly?'₹166/mo equivalent, billed annually':'For professional garages & workshops')+'</p>'+
      '</div>'+
      '<ul class="plan-tier-features">'+
        '<li><b>Unlimited Vehicles</b></li>'+
        '<li><b>5 GB</b> Document Cloud Storage</li>'+
        '<li>Digital Job Cards &amp; Invoicing</li>'+
        '<li>Multi-bay Mechanic Management</li>'+
        '<li>WhatsApp Customer Updates</li>'+
        '<li>Dedicated Support Representative</li>'+
      '</ul>'+
      '<div class="plan-tier-action">'+
        (curPlan==='ultra'?
          '<button type="button" class="ghost" disabled style="width:100%">Current Plan</button>':
          '<button type="button" class="primary" style="width:100%" id="btnUpgradeToUltra" onclick="openUpgradeRequestModal(\'ultra\')">Upgrade to Ultra</button>')+
      '</div>'+
    '</div>'+
  '</div>';
}

function openUpgradeRequestModal(targetPlan='premium'){
  closePlanComparisonModal();
  let old=document.getElementById('userUpgradeRequestModal');
  if(old)old.remove();

  const modal=document.createElement('div');
  modal.id='userUpgradeRequestModal';
  modal.className='admin-modal-overlay';
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');

  const defaultPhone=ownerProfile?.phone||user?.user_metadata?.phone||'';

  modal.innerHTML='<div class="admin-modal-box" style="max-width:500px">'+
    '<div class="admin-modal-head">'+
      '<div>'+
        '<h3 style="margin:0;font-size:17px">Request Plan Upgrade</h3>'+
        '<span class="muted" style="font-size:12px">Instant manual activation via WhatsApp or UPI</span>'+
      '</div>'+
      '<button type="button" class="ghost" onclick="closeUpgradeRequestModal()">✕</button>'+
    '</div>'+
    '<div style="display:flex;flex-direction:column;gap:12px">'+
      '<div class="field">'+
        '<label>Target Plan</label>'+
        '<select id="userUpgradePlanSelect">'+
          '<option value="premium"'+(targetPlan==='premium'?' selected':'')+'>Vehicle Owner Plus (₹69/mo or ₹708/yr)</option>'+
          '<option value="ultra"'+(targetPlan==='ultra'?' selected':'')+'>Workshop SaaS Ultra (₹199/mo or ₹1999/yr)</option>'+
        '</select>'+
      '</div>'+
      '<div class="field">'+
        '<label>Contact Mobile (+91) *</label>'+
        '<input type="tel" id="userUpgradePhoneInput" placeholder="e.g. 9876543210" value="'+esc(defaultPhone)+'">'+
      '</div>'+
      '<div class="field">'+
        '<label>Preferred Payment Method</label>'+
        '<select id="userUpgradePaymentSelect">'+
          '<option value="upi">UPI (Google Pay, PhonePe, Paytm)</option>'+
          '<option value="netbanking">Net Banking / IMPS</option>'+
          '<option value="card">Debit / Credit Card</option>'+
        '</select>'+
      '</div>'+
      '<div class="field">'+
        '<label>Optional Notes or Billing Requirement</label>'+
        '<textarea id="userUpgradeNotesInput" rows="2" placeholder="e.g. Need GST invoice for workshop..."></textarea>'+
      '</div>'+
      '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px">'+
        '<button type="button" class="ghost" onclick="closeUpgradeRequestModal()">Cancel</button>'+
        '<button type="button" class="primary" id="btnSubmitUpgradeRequest" onclick="submitUpgradeRequest()">Submit Upgrade Request</button>'+
      '</div>'+
    '</div>'+
  '</div>';

  modal.onclick=e=>{if(e.target===modal)closeUpgradeRequestModal();};
  document.body.appendChild(modal);
}

function closeUpgradeRequestModal(){
  const m=document.getElementById('userUpgradeRequestModal');
  if(m)m.remove();
}

async function submitUpgradeRequest(){
  const plan=document.getElementById('userUpgradePlanSelect')?.value||'premium';
  const phone=document.getElementById('userUpgradePhoneInput')?.value?.trim()||'';
  const payment=document.getElementById('userUpgradePaymentSelect')?.value||'upi';
  const notes=document.getElementById('userUpgradeNotesInput')?.value?.trim()||'';
  const btn=document.getElementById('btnSubmitUpgradeRequest');

  if(!phone||phone.length<10){
    toast('Valid 10-digit contact mobile number is required.','error');
    return;
  }
  if(btn){btn.disabled=true;btn.textContent='Submitting...';}
  try{
    await workerPost('/api/upgrade-requests',{
      requested_plan:plan,
      phone:phone,
      payment_method:payment,
      notes:notes
    });
    toast('Upgrade request submitted successfully! We will contact you on WhatsApp/phone.','ok');
    closeUpgradeRequestModal();
  }catch(err){
    toast('Failed to submit upgrade request: '+(err?.message||err),'error');
    if(btn){btn.disabled=false;btn.textContent='Submit Upgrade Request';}
  }
}

function renderPlanExpirationBanner(){
  if(!userPlanStatus||(userPlanStatus.status!=='expired'&&!userPlanStatus.is_expired))return '';
  const expDate=formatAdminDate(userPlanStatus.expires_at);
  return '<div class="plan-expired-banner" role="alert">'+
    '<div style="display:flex;align-items:center;gap:10px">'+
      '<span style="font-size:20px">⚠️</span>'+
      '<div><b>Subscription Expired</b><p style="margin:2px 0 0;font-size:12px">Your plan expired on '+esc(expDate)+'. Renew now to retain access to multiple vehicles and vault storage.</p></div>'+
    '</div>'+
    '<button type="button" class="primary btn-sm" onclick="openPlanComparisonModal()">Renew Subscription</button>'+
  '</div>';
}

window.loadUserPlanStatus=loadUserPlanStatus;
window.updatePlanStatusCardDom=updatePlanStatusCardDom;
window.renderPlanStatusCard=renderPlanStatusCard;
window.toggleActivationRedeemSection=toggleActivationRedeemSection;
window.redeemActivationCode=redeemActivationCode;
window.setComparisonCycle=setComparisonCycle;
window.openPlanComparisonModal=openPlanComparisonModal;
window.closePlanComparisonModal=closePlanComparisonModal;
window.renderPlanComparisonModalContent=renderPlanComparisonModalContent;
window.openUpgradeRequestModal=openUpgradeRequestModal;
window.closeUpgradeRequestModal=closeUpgradeRequestModal;
window.submitUpgradeRequest=submitUpgradeRequest;
window.renderPlanExpirationBanner=renderPlanExpirationBanner;
window.getUserPlanStatus=()=>userPlanStatus;
window.setUserPlanStatus=(val)=>{userPlanStatus=val;};

let currentHelpTab='faqs';
let userSupportTickets=[];
let ticketsLoaded=false;
let ticketSubmitting=false;
let ticketUnreadCount=0;
let ticketUnreadTimer=null;
let viewingCustomerTicketId=null;
let customerTicketDetailLoading=false;

const TICKET_STATUS_LABELS={
  pending:'Pending',
  assigned:'Assigned',
  working:'Working on it',
  need_info:'Required other information',
  solved:'Solved',
  closed:'Closed'
};
const TICKET_TRANSITIONS={
  pending:['assigned'],
  assigned:['working'],
  working:['need_info','solved'],
  need_info:['working'],
  solved:['working','closed'],
  closed:['working']
};

function normalizeTicketStatus(st){
  const s=String(st||'pending').toLowerCase().replace(/\s+/g,'_');
  if(s==='open')return 'pending';
  if(s==='in_progress')return 'working';
  if(s==='resolved')return 'solved';
  return s;
}

function updateHelpUnreadBadge(count){
  ticketUnreadCount=Number(count)||0;
  const badgeText=ticketUnreadCount>99?'99+':String(ticketUnreadCount);
  const selectors=[
    '#mobileNav button[data-view="help"]',
    'aside button[data-view="help"]',
    '#sideMenu .drawer-link[data-view="help"]',
    '.drawer-link[data-view="help"]',
    'button[data-view="help"]',
    '[data-view="help"]'
  ];
  const matched=new Set();
  selectors.forEach(sel=>{
    document.querySelectorAll?.(sel)?.forEach?.(btn=>{
      if(btn && !matched.has(btn)){
        matched.add(btn);
        let badge=btn.querySelector?.('.ticket-unread-badge');
        if(ticketUnreadCount>0){
          if(!badge){
            badge=document.createElement('span');
            badge.className='ticket-unread-badge';
            badge.setAttribute('aria-label',badgeText+' unread support updates');
            btn.appendChild(badge);
          }
          badge.textContent=badgeText;
          badge.style.display='inline-flex';
        }else if(badge){
          badge.remove();
        }
      }
    });
  });
}

async function checkTicketUnreadCount(){
  if(!user||typeof workerGet!=='function')return 0;
  try{
    const res=await workerGet('/api/tickets/unread-count');
    if(res&&res.ok&&typeof res.count==='number'){
      updateHelpUnreadBadge(res.count);
      return res.count;
    }
  }catch(_){}
  return 0;
}

function startTicketUnreadPolling(){
  stopTicketUnreadPolling();
  checkTicketUnreadCount();
  ticketUnreadTimer=setInterval(()=>{
    if(typeof document!=='undefined'&&document.visibilityState==='visible'){
      checkTicketUnreadCount();
    }
  },60000);
}

function stopTicketUnreadPolling(){
  if(ticketUnreadTimer){
    clearInterval(ticketUnreadTimer);
    ticketUnreadTimer=null;
  }
}

if(typeof document!=='undefined'&&document.addEventListener){
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'){
      checkTicketUnreadCount();
    }
  });
}

async function loadUserSupportTickets(){
  if(typeof workerGet==='function'){
    try{
      const res=await workerGet('/api/tickets');
      if(res&&res.ok&&Array.isArray(res.data)){
        userSupportTickets=res.data.map(t=>({
          ...t,
          status:normalizeTicketStatus(t.status),
          created_at:typeof t.created_at==='number'?new Date(t.created_at*1000).toISOString():t.created_at,
          car_reg:(Array.isArray(cars)?cars:[]).find(c=>c.id===t.car_id)?.registration_no||null
        }));
        try{ localStorage.setItem('carmy_support_tickets',JSON.stringify(userSupportTickets)); }catch(_){}
        ticketsLoaded=true;
        return userSupportTickets;
      }
    }catch(_){}
    try{
      const res=await workerGet('/api/support-tickets');
      if(Array.isArray(res?.data)){
        userSupportTickets=res.data.map(t=>({
          ...t,
          status:normalizeTicketStatus(t.status),
          created_at:typeof t.created_at==='number'?new Date(t.created_at*1000).toISOString():t.created_at,
          car_reg:(Array.isArray(cars)?cars:[]).find(c=>c.id===t.car_id)?.registration_no||null
        }));
        try{ localStorage.setItem('carmy_support_tickets',JSON.stringify(userSupportTickets)); }catch(_){}
        ticketsLoaded=true;
        return userSupportTickets;
      }
    }catch(err){
      console.warn('Could not fetch support tickets from server:', err);
    }
  }
  try{
    const cached=JSON.parse(localStorage.getItem('carmy_support_tickets')||'[]');
    if(Array.isArray(cached)&&cached.length>0) userSupportTickets=cached;
  }catch(_){}
  return userSupportTickets;
}

function helpView(){
  const container=$('helpTabContent');
  if(!container)return;
  const validHelpTabs=['faqs','ticket','about','terms','contact'];
  if(!validHelpTabs.includes(currentHelpTab)) currentHelpTab='faqs';
  document.querySelectorAll('.help-tab-btn').forEach(b=>{
    b.classList.toggle('active',b.dataset.helpTab===currentHelpTab);
    b.onclick=(e)=>{
      e?.preventDefault();
      e?.stopPropagation();
      currentHelpTab=b.dataset.helpTab;
      helpView();
    };
  });
  document.querySelectorAll('.help-footer-link').forEach(btn=>{
    btn.onclick=(e)=>{
      e?.preventDefault();
      e?.stopPropagation();
      currentHelpTab=btn.dataset.helpTarget;
      helpView();
      window.scrollTo({top:0,behavior:'smooth'});
    };
  });
  checkTicketUnreadCount();
  try{
    if(currentHelpTab==='faqs'){
      container.innerHTML=renderFaqsContent();
    }else if(currentHelpTab==='ticket'){
      container.innerHTML=renderTicketContent();
      if(viewingCustomerTicketId){
        wireCustomerTicketDetailView(viewingCustomerTicketId);
      }else{
        wireTicketForm();
        wireCustomerTicketList();
        if(!ticketsLoaded&&typeof workerGet==='function'){
          loadUserSupportTickets().then(()=>{
            if(currentHelpTab==='ticket'&&!viewingCustomerTicketId){
              const pastCont=$('ticketPastContainer');
              if(pastCont){
                pastCont.innerHTML=renderTicketPastList();
                wireCustomerTicketList();
              }
            }
          });
        }
      }
    }else if(currentHelpTab==='about'){
      container.innerHTML=renderAboutContent();
    }else if(currentHelpTab==='terms'){
      container.innerHTML=renderTermsContent();
    }else if(currentHelpTab==='contact'){
      container.innerHTML=renderContactContent();
    }
  }catch(tabErr){
    console.error('Error rendering help tab:',currentHelpTab,tabErr);
    container.innerHTML='<div class="card" style="text-align:center;padding:32px 16px">'+
      '<div style="font-size:32px;margin-bottom:12px" aria-hidden="true">⚠️</div>'+
      '<h3 style="margin-bottom:8px">Unable to display '+esc(currentHelpTab)+'</h3>'+
      '<p class="muted" style="max-width:480px;margin:0 auto 18px auto">A rendering error occurred: '+esc(tabErr?.message||'Unknown error')+'.</p>'+
      '<button type="button" class="primary" onclick="helpView()">Retry</button>'+
    '</div>';
  }
}

function openCustomerTicketDetail(ticketId){
  currentHelpTab='ticket';
  viewingCustomerTicketId=String(ticketId);
  helpView();
  const t=(Array.isArray(userSupportTickets)?userSupportTickets:[]).find(x=>String(x.id)===viewingCustomerTicketId);
  if(t&&t.has_unread){
    t.has_unread=false;
    checkTicketUnreadCount();
  }
}

function closeCustomerTicketDetail(){
  viewingCustomerTicketId=null;
  helpView();
}

function renderTicketPastList(){
  let existing=userSupportTickets;
  if(!Array.isArray(existing)||!existing.length){
    try{
      const parsed=JSON.parse(localStorage.getItem('carmy_support_tickets')||'[]');
      existing=Array.isArray(parsed)?parsed:[];
    }catch(_){ existing=[]; }
  }
  const userTickets=(Array.isArray(existing)?existing:[]).filter(t=>!user||!t.user_id||t.user_id===user.id||t.email===user.email);
  if(!userTickets.length)return '';
  return '<div class="ticket-past-card"><h4>Your Submitted Tickets ('+userTickets.length+')</h4><div style="margin-top:10px">'+
    userTickets.map(t=>{
      const tid=esc(t.id||'TD-TICKET');
      const unreadBadge=t.has_unread?'<span class="ticket-unread-pill">● New reply</span>':'';
      const reg=t.car_reg?'<span class="muted">· '+esc(t.car_reg)+'</span>':'';
      const timeStr=esc(formatTimestamp(t.updated_at||t.created_at));
      return '<div class="ticket-row-accessible" tabindex="0" role="button" aria-label="View ticket '+tid+'" onclick="openCustomerTicketDetail(\''+tid+'\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openCustomerTicketDetail(\''+tid+'\');}">'+
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">'+
          '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'+
            '<code style="font-weight:700;color:#2563eb">'+tid+'</code> '+
            renderStatusBadge(t.status)+' '+
            renderPriorityBadge(t.priority)+' '+
            unreadBadge+' '+
            reg+
          '</div>'+
          '<small class="muted">'+timeStr+'</small>'+
        '</div>'+
        '<div class="ticket-customer-row-subject" style="font-weight:600;color:#0f172a;font-size:14px;margin-top:4px"></div>'+
      '</div>';
    }).join('')+
    '</div></div>';
}

function wireCustomerTicketList(){
  const rows=document.querySelectorAll('.ticket-row-accessible');
  let existing=userSupportTickets;
  if(!Array.isArray(existing)||!existing.length){
    try{ existing=JSON.parse(localStorage.getItem('carmy_support_tickets')||'[]'); }catch(_){ existing=[]; }
  }
  const userTickets=(Array.isArray(existing)?existing:[]).filter(t=>!user||!t.user_id||t.user_id===user.id||t.email===user.email);
  rows.forEach((row,i)=>{
    const subEl=row.querySelector('.ticket-customer-row-subject');
    if(subEl&&userTickets[i]){
      subEl.textContent=userTickets[i].subject||'No Subject';
    }
  });
}

function renderCustomerTicketDetailView(ticketId){
  let existing=userSupportTickets;
  if(!Array.isArray(existing)||!existing.length){
    try{ existing=JSON.parse(localStorage.getItem('carmy_support_tickets')||'[]'); }catch(_){ existing=[]; }
  }
  const ticket=(Array.isArray(existing)?existing:[]).find(t=>String(t.id)===String(ticketId))||{
    id:ticketId,
    subject:'Support Ticket '+ticketId,
    status:'pending',
    priority:'normal',
    created_at:new Date().toISOString()
  };

  const statusKey=normalizeTicketStatus(ticket.status);
  const steps=[
    {key:'pending',label:'Submitted'},
    {key:'assigned',label:'Assigned'},
    {key:'working',label:'Working on it'},
    {key:'solved',label:'Solved'},
    {key:'closed',label:'Closed'}
  ];

  let activeIndex=0;
  if(statusKey==='assigned') activeIndex=1;
  else if(statusKey==='working'||statusKey==='need_info') activeIndex=2;
  else if(statusKey==='solved') activeIndex=3;
  else if(statusKey==='closed') activeIndex=4;

  const stepperHtml='<div class="ticket-stepper-container">'+
    '<div class="ticket-stepper">'+
      steps.map((st,idx)=>{
        const isCompleted=idx<activeIndex||(idx===activeIndex&&statusKey==='closed');
        const isActive=idx===activeIndex&&statusKey!=='closed';
        const cls=isCompleted?'ticket-step-completed':(isActive?'ticket-step-active':'');
        return '<div class="ticket-step-item '+cls+'">'+
          '<div class="ticket-step-circle">'+(isCompleted?'✓':(idx+1))+'</div>'+
          '<span class="ticket-step-label">'+esc(st.label)+'</span>'+
        '</div>';
      }).join('')+
    '</div>'+
  '</div>';

  const needInfoBanner=statusKey==='need_info'
    ? '<div class="ticket-warning-banner" id="customerTicketNeedInfoBanner"><div class="ticket-warning-title">⚠️ Action Required: Additional Information Needed</div><div class="ticket-warning-msg" id="customerTicketNeedInfoMsg"></div></div>'
    : '';

  const agentName=ticket.show_agent_name&&ticket.agent_name?esc(ticket.agent_name):'Our support team';
  const chatActive=Boolean(ticket.chat_enabled)&&statusKey!=='closed';

  return '<div class="card">'+
    '<button type="button" class="ticket-back-btn" onclick="closeCustomerTicketDetail()">← Back to Support Tickets</button>'+
    '<div class="card-head-row" style="margin-top:6px">'+
      '<div>'+
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">'+
          '<code style="font-size:15px;font-weight:700;color:#2563eb">'+esc(ticket.id)+'</code>'+
          renderStatusBadge(ticket.status)+
          renderPriorityBadge(ticket.priority)+
        '</div>'+
        '<h3 id="customerTicketDetailSubject" style="margin:0 0 4px 0"></h3>'+
        '<p class="muted" style="margin:0;font-size:12.5px">Submitted '+esc(formatTimestamp(ticket.created_at))+(ticket.car_reg?' · Vehicle: '+esc(ticket.car_reg):'')+'</p>'+
      '</div>'+
    '</div>'+
    stepperHtml+
    needInfoBanner+
    '<div class="ticket-agent-row"><span>Assigned Specialist:</span> <b>'+agentName+'</b></div>'+
    '<div class="ticket-thread-container" id="customerTicketThread"></div>'+
    (chatActive
      ? '<div class="ticket-reply-box-sticky"><form class="ticket-reply-form" onsubmit="return false;"><textarea id="customerTicketReplyInput" class="ticket-reply-input" placeholder="Type your reply to the support team..." rows="2"></textarea><div class="ticket-reply-actions"><button type="button" class="primary" id="customerTicketSendReplyBtn" onclick="sendCustomerTicketReply(\''+esc(ticket.id)+'\')">Send Reply</button></div></form></div>'
      : '<div class="ticket-chat-disabled-banner">Our team will reply here.</div>')+
  '</div>';
}

function wireCustomerTicketDetailView(ticketId){
  const subEl=$('customerTicketDetailSubject');
  let existing=userSupportTickets;
  if(!Array.isArray(existing)||!existing.length){
    try{ existing=JSON.parse(localStorage.getItem('carmy_support_tickets')||'[]'); }catch(_){ existing=[]; }
  }
  const ticket=(Array.isArray(existing)?existing:[]).find(t=>String(t.id)===String(ticketId));
  if(subEl&&ticket){
    subEl.textContent=ticket.subject||'Support Inquiry';
  }
  const thread=$('customerTicketThread');
  if(thread&&ticket){
    thread.innerHTML='';
    const events=Array.isArray(ticket.events)?ticket.events:[];
    const threadList=events.length?events:(ticket.message?[{actor_type:'user',message:ticket.message,created_at:ticket.created_at}]:[]);

    if(normalizeTicketStatus(ticket.status)==='need_info'){
      const bannerMsgEl=$('customerTicketNeedInfoMsg');
      if(bannerMsgEl){
        const lastAdmin=[...threadList].reverse().find(e=>e.actor_type==='admin'||e.actor_type==='team');
        bannerMsgEl.textContent=lastAdmin?.message||'Support team has requested additional details to proceed with your ticket. Please reply below.';
      }
    }

    threadList.forEach(e=>{
      const isUser=e.actor_type==='user';
      const bubble=document.createElement('div');
      bubble.className='ticket-message-bubble '+(isUser?'ticket-message-user':'ticket-message-admin');

      const header=document.createElement('div');
      header.className='ticket-message-header';

      const sender=document.createElement('span');
      sender.className='ticket-message-sender';
      sender.textContent=isUser?'You':(ticket.show_agent_name&&ticket.agent_name?ticket.agent_name:'Support Specialist');

      const time=document.createElement('span');
      time.className='ticket-message-time';
      time.textContent=formatTimestamp(e.created_at);

      header.appendChild(sender);
      header.appendChild(time);

      const text=document.createElement('div');
      text.className='ticket-message-text';
      text.textContent=e.message||'';

      bubble.appendChild(header);
      bubble.appendChild(text);
      thread.appendChild(bubble);
    });
  }

  if(typeof workerGet==='function'){
    loadCustomerTicketDetails(ticketId);
  }
}

async function loadCustomerTicketDetails(ticketId){
  if(customerTicketDetailLoading)return;
  customerTicketDetailLoading=true;
  try{
    const res=await workerGet('/api/tickets/'+encodeURIComponent(ticketId));
    if(res&&res.ok&&res.data){
      const updated=res.data;
      let existing=(Array.isArray(userSupportTickets)?userSupportTickets:[]).find(t=>String(t.id)===String(ticketId));
      if(existing){
        Object.assign(existing,updated);
      }else{
        userSupportTickets.push(updated);
      }
      if(viewingCustomerTicketId===String(ticketId)){
        wireCustomerTicketDetailView(ticketId);
      }
    }
  }catch(err){
    console.warn('Could not load authoritative customer ticket details (likely 404 from backend routing bug in worker/src/ticket-workflow.js):',err);
  }finally{
    customerTicketDetailLoading=false;
  }
}

async function sendCustomerTicketReply(ticketId){
  const input=$('customerTicketReplyInput');
  const btn=$('customerTicketSendReplyBtn');
  if(!input||!btn)return;
  const message=input.value.trim();
  if(!message){
    toast('Please enter a reply message.','error');
    input.focus();
    return;
  }
  btn.disabled=true;
  btn.textContent='Sending...';
  try{
    const res=await workerPost('/api/tickets/'+encodeURIComponent(ticketId)+'/messages',{message});
    if(!res?.ok){
      if(res?.error?.code==='CHAT_DISABLED'||res?.status===403){
        throw new Error('Replies are currently disabled for this ticket.');
      }
      throw new Error(res?.error?.message||'Failed to send reply.');
    }
    input.value='';
    toast('Reply submitted successfully!','ok');
    await loadCustomerTicketDetails(ticketId);
  }catch(err){
    console.error('Failed to send reply:',err);
    if(err?.status===403||err?.code==='CHAT_DISABLED'){
      toast('Replies are currently disabled for this ticket.','error');
    }else if(err?.status===404||err?.code==='NOT_FOUND'){
      toast('Failed to send message: Server route unavailable (404). Backend bug detected in worker route dispatch.','error');
    }else{
      toast(err?.message||'Failed to send reply.','error');
    }
  }finally{
    if(document.body.contains(btn)){
      btn.disabled=false;
      btn.textContent='Send Reply';
    }
  }
}

function renderFaqsContent(){
  return '<div class="card">'+
    '<div class="card-head-row"><div><h3>Frequently Asked Questions</h3><p class="muted">Common questions about security, idle timeouts, reports and data handling.</p></div></div>'+
    '<div class="faq-list" style="margin-top:14px">'+
      '<details class="faq-card" open><summary>How does Torq Desk keep my vehicle records and documents secure?</summary><p>All vehicle data and service records are stored in private Supabase PostgreSQL tables protected by restrictive Row Level Security (RLS) policies. Document files (RC, Insurance, PUC) are stored in Cloudflare R2 object storage with time-limited signed URLs generated only for your authenticated session.</p></details>'+
      '<details class="faq-card"><summary>What is the 120-second inactivity session protection?</summary><p>To protect sensitive maintenance records and private ownership documents on shared or unattended devices, Torq Desk automatically suspends active database sessions after 120 seconds of user inactivity. Interacting with the application automatically sends a lightweight heartbeat to keep your session alive while actively working.</p></details>'+
      '<details class="faq-card"><summary>How do I generate and export an A4 Vehicle Dossier / Report?</summary><p>Navigate to the <b>A4 Vehicle Report</b> section or click <b>A4 Report</b> from Documents. Torq Desk compiles all maintenance history, costs, parts items, and statutory compliance status into an official print-ready document formatted for browser print or saving as PDF.</p></details>'+
      '<details class="faq-card"><summary>What are Form 29 &amp; Form 30, and when do I use them?</summary><p>Form 29 (Notice of Transfer of Ownership) and Form 30 (Application for Intimation and Transfer of Ownership) are statutory forms under the Indian Motor Vehicles Act. When selling your vehicle, Torq Desk auto-populates buyer and seller details directly onto official statutory templates and archives the signed PDF in your private vault.</p></details>'+
      '<details class="faq-card"><summary>Can I import past handwritten or digital maintenance bills?</summary><p>Yes! Open <b>My Vehicles</b> and click <b>Import Old History</b>. You can paste unformatted records or invoices, and Torq Desk\'s parser will extract dates, odometer readings, and costs with audit reconciliation warnings before anything is committed to your garage.</p></details>'+
      '<details class="faq-card"><summary>What file formats and sizes are supported in Document Vault?</summary><p>Torq Desk supports PDF, JPG, JPEG, and PNG files up to 10 MB per document. RC and Insurance uploads feature automated client-side data extraction review to keep your vehicle parameters in sync.</p></details>'+
    '</div>'+
  '</div>';
}

function renderTicketContent(){
  if(viewingCustomerTicketId){
    return renderCustomerTicketDetailView(viewingCustomerTicketId);
  }
  const carList = Array.isArray(cars) ? cars : [];
  const carOptions=['<option value="">General (No specific vehicle)</option>'].concat(
    carList.map(c=>'<option value="'+esc(c.id)+'" '+(car?.id===c.id?'selected':'')+'>'+esc(c.registration_no)+(c.make_model?' · '+esc(c.make_model):'')+'</option>')
  ).join('');

  return '<div class="card">'+
    '<div class="card-head-row"><div><h3>Submit a Support Ticket</h3><p class="muted">Have an inquiry or experiencing an issue? Submit a ticket directly to the engineering team.</p></div></div>'+
    '<div id="ticketFormStatus"></div>'+
    '<form class="form" id="supportTicketForm" onsubmit="return false;" style="margin-top:14px">'+
      '<div class="field"><label for="ticketCategory">Category *</label><select id="ticketCategory"><option value="Account & Security">Account &amp; Security</option><option value="Vehicle Garage & Records">Vehicle Garage &amp; Records</option><option value="Document Vault & Uploads">Document Vault &amp; Uploads</option><option value="Ownership Transfer (Form 29/30)">Ownership Transfer (Form 29/30)</option><option value="Feature Request">Feature Request</option><option value="Other Inquiry">Other Inquiry</option></select></div>'+
      '<div class="field"><label for="ticketPriority">Priority</label><select id="ticketPriority"><option value="Normal">Normal</option><option value="Urgent">Urgent</option></select></div>'+
      '<div class="field"><label for="ticketEmail">Your Account Email</label><input id="ticketEmail" value="'+esc(user?.email||'')+'" readonly style="background:#f1f5f9;cursor:not-allowed"></div>'+
      '<div class="field"><label for="ticketCar">Related Vehicle</label><select id="ticketCar">'+carOptions+'</select></div>'+
      '<div class="field full"><label for="ticketSubject">Subject *</label><input id="ticketSubject" placeholder="Brief summary of your inquiry" required></div>'+
      '<div class="field full"><label for="ticketMessage">Description &amp; Details *</label><textarea id="ticketMessage" rows="5" placeholder="Please describe the issue or request in detail..." required></textarea></div>'+
      '<div class="full"><button type="button" class="primary" id="ticketSubmitBtn">SUBMIT TICKET</button></div>'+
    '</form>'+
    '<div id="ticketPastContainer">'+renderTicketPastList()+'</div>'+
  '</div>';
}

function wireTicketForm(){
  if($('ticketEmail')&&user?.email)$('ticketEmail').value=user.email;
  const btn=$('ticketSubmitBtn');
  if(!btn)return;
  btn.onclick=async()=>{
    if(ticketSubmitting)return;
    const cat=$('ticketCategory')?.value;
    const sub=$('ticketSubject')?.value?.trim();
    const msg=$('ticketMessage')?.value?.trim();
    const carId=$('ticketCar')?.value||null;
    const pri=$('ticketPriority')?.value||'Normal';
    if(!sub){ toast('Please enter a ticket subject.','error'); $('ticketSubject')?.focus(); return; }
    if(!msg){ toast('Please describe your inquiry or issue.','error'); $('ticketMessage')?.focus(); return; }

    ticketSubmitting=true;
    btn.disabled=true;
    btn.textContent='SUBMITTING...';
    const statusEl=$('ticketFormStatus');
    if(statusEl) statusEl.innerHTML='';

    let ticketId=null;
    try{
      if(typeof workerPost!=='function'){
        throw new Error('Support ticket submission service is unavailable. Please email hi@torqdesk.in directly.');
      }
      const res=await workerPost('/api/support-tickets',{
        category: cat,
        subject: sub,
        message: msg,
        priority: pri,
        car_id: carId
      });
      if(!res?.ok || !res?.data?.id){
        throw new Error(res?.error?.message || 'Server did not save support ticket. Please retry or email hi@torqdesk.in.');
      }
      ticketId=res.data.id;

      const createdRecord={
        id: ticketId,
        user_id: user?.id,
        email: user?.email,
        car_id: carId,
        car_reg: (Array.isArray(cars)?cars:[]).find(c=>c.id===carId)?.registration_no||null,
        category: cat,
        subject: sub,
        message: msg,
        priority: pri,
        status: res?.data?.status||'Open',
        created_at: res?.data?.created_at||new Date().toISOString()
      };

      if(!Array.isArray(userSupportTickets)) userSupportTickets=[];
      userSupportTickets.unshift(createdRecord);
      try{ localStorage.setItem('carmy_support_tickets',JSON.stringify(userSupportTickets)); }catch(_){}

      toast('Support ticket '+ticketId+' created successfully!');
      currentHelpTab='ticket';
      viewingCustomerTicketId=null;
      helpView();
    }catch(err){
      console.error('Ticket submission error:',err);
      const errMsg=err?.message||'Failed to submit support ticket. Please try again.';
      if(statusEl){
        statusEl.innerHTML='<div class="ticket-status-banner error" style="margin-top:10px"><b>Submission Failed:</b> '+esc(errMsg)+' <br><small>Your entered details are preserved above. Please check your connection and retry.</small></div>';
      }
      toast(errMsg,'error');
      if(document.body.contains(btn)){
        btn.disabled=false;
        btn.textContent='RETRY SUBMISSION';
      }
    }finally{
      ticketSubmitting=false;
      if(document.body.contains(btn)&&!ticketId){
        btn.disabled=false;
      }
    }
  };
}

function renderAboutContent(){
  return '<div class="card">'+
    '<div class="card-head-row"><div><h3>About Torq Desk</h3><p class="muted">Your Ride. Your Records.</p></div></div>'+
    '<div style="margin-top:14px;line-height:1.65;color:#334155;font-size:14px">'+
      '<p><b>Torq Desk</b> is a modern, privacy-first vehicle maintenance management cloud designed for individual vehicle owners, families, and workshops across India.</p>'+
      '<p>Built from the ground up to replace fragmented paper bills, faded PUC receipts, and forgotten service dates, Torq Desk unites maintenance timelines, parts tracking, compliance monitoring, and cloud document vaults in one seamless dashboard.</p>'+
      '<h4 style="margin:20px 0 8px;color:#0f172a">Key Pillars</h4>'+
      '<ul style="padding-left:20px;margin:0 0 16px">'+
        '<li><b>Zero-Knowledge Privacy:</b> Your records and documents belong exclusively to you. We never sell or monetize your vehicle data.</li>'+
        '<li><b>High-Resilience Cloud:</b> Built with Cloudflare R2 and Supabase PostgreSQL with independent multi-layer caching and automated database backups.</li>'+
        '<li><b>Statutory Compliance:</b> Automated tracking of Insurance policies, PUC certificates, and instant generation of Form 29 &amp; Form 30 ownership transfer paperwork.</li>'+
      '</ul>'+
      '<p class="muted" style="margin-top:20px">Version: Build '+esc(window.CARMY_BUILD||'2026.10')+' · © 2026 Torq Desk</p>'+
    '</div>'+
  '</div>';
}

function renderTermsContent(){
  return '<div class="card">'+
    '<div class="card-head-row"><div><h3>Terms &amp; Conditions of Service</h3><p class="muted">Last updated: October 2026</p></div></div>'+
    '<div style="margin-top:14px;line-height:1.65;color:#334155;font-size:14px">'+
      '<p><b>1. Acceptance of Terms:</b> By creating an account or using Torq Desk, you agree to these Terms of Service and our commitment to data integrity and security.</p>'+
      '<p><b>2. Vehicle Data Ownership:</b> You retain 100% legal ownership of all data, service logs, odometer readings, and documents uploaded to your Torq Desk account. You may export your records at any time using our A4 Vehicle Report generator.</p>'+
      '<p><b>3. Security &amp; Inactivity Protection:</b> Sessions are guarded by 120-second inactivity timeouts. You are responsible for keeping your credentials and document PIN secure.</p>'+
      '<p><b>4. Statutory Document Use:</b> Form 29 &amp; 30 paperwork generated by Torq Desk provides statutory format assistance under the Indian Motor Vehicles Act. You are responsible for verifying accuracy before lodging transfer applications with regional transport authorities (RTOs).</p>'+
      '<p><b>5. Limitation of Liability:</b> Torq Desk provides cloud storage and record management tools. Regular vehicle maintenance, compliance renewals, and roadworthiness remain the sole responsibility of the vehicle owner.</p>'+
    '</div>'+
  '</div>';
}

function renderContactContent(){
  return '<div class="card">'+
    '<div class="card-head-row"><div><h3>Contact Torq Desk Support</h3><p class="muted">We are here to assist with your garage, document vault, and account.</p></div></div>'+
    '<div style="margin-top:14px;line-height:1.65;color:#334155;font-size:14px">'+
      '<p>Need assistance or have feedback on Torq Desk? Reach out directly via our official channels:</p>'+
      '<div style="margin:16px 0;padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px">'+
        '<div><b>Engineering &amp; Support Email:</b> <a href="mailto:support@torqdesk.app" style="color:var(--c-accent);text-decoration:underline">support@torqdesk.app</a></div>'+
        '<div style="margin-top:6px"><b>Administrator Contact:</b> <a href="mailto:crahul.exe@gmail.com" style="color:var(--c-accent);text-decoration:underline">crahul.exe@gmail.com</a></div>'+
        '<div style="margin-top:6px"><b>Support Hours:</b> Monday – Saturday, 9:00 AM – 6:00 PM IST</div>'+
        '<div style="margin-top:6px"><b>Average Response Time:</b> Under 24 hours</div>'+
      '</div>'+
      '<div style="margin-top:20px">'+
        '<button type="button" class="primary" onclick="currentHelpTab=\'ticket\';helpView()">Open a Support Ticket</button>'+
      '</div>'+
    '</div>'+
  '</div>';
}

async function logout(){
  if(window.__carmyAdminSigningOut)return;
  window.__carmyAdminSigningOut=true;
  try{
    let serverRevoked=false;
    try{
      const result=await workerPost('/api/session/revoke',{});
      serverRevoked=Boolean(result?.current_session_revoked);
      if(!serverRevoked)console.warn('Worker did not confirm current-session revocation');
    }catch(err){
      console.error('Worker session revocation failed',{status:err?.status||null,code:err?.code||null});
    }
    try{if(db)await db.auth.signOut({scope:'global'});}catch(err){console.error('Supabase global sign-out failed',err?.message||err);}
    try{
      for(let i=localStorage.length-1;i>=0;i--){
        const key=localStorage.key(i);
        if(key&&(key.startsWith('sb-')||key.startsWith('carmy_')||key.startsWith('td-admin-')))localStorage.removeItem(key);
      }
    }catch(_){}
    try{
      for(let i=sessionStorage.length-1;i>=0;i--){
        const key=sessionStorage.key(i);
        if(key&&(key.startsWith('sb-')||key.startsWith('carmy_')||key.startsWith('td-admin-')))sessionStorage.removeItem(key);
      }
    }catch(_){}
    try{clearUserMemory();}catch(err){console.error('Could not clear client memory',err?.message||err);}
    location.replace('./?signed_out=1');
  }finally{
    window.__carmyAdminSigningOut=false;
  }
}
window.logout=logout;

/* ===== Super Admin Console Implementation ===== */

let currentAdminScreen = 'home';
let adminTicketsLastStatus = null;
let adminTicketsLastCode = null;

function formatAdminDate(ts){
  if(!ts)return '—';
  try{
    const d=new Date(Number(ts)*1000);
    if(isNaN(d.getTime()))return String(ts);
    return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }catch(_){
    return String(ts);
  }
}

let adminAssigneeFilter='all';
let adminPriorityFilter='all';
let adminSlaFilter='all';

function renderStatusBadge(status){
  const s=normalizeTicketStatus(status);
  if(s==='pending')return '<span class="ticket-status-badge status-pending">Pending</span>';
  if(s==='assigned')return '<span class="ticket-status-badge status-assigned">Assigned</span>';
  if(s==='working')return '<span class="ticket-status-badge status-working">Working on it</span>';
  if(s==='need_info')return '<span class="ticket-status-badge status-need-info">Required other information</span>';
  if(s==='solved')return '<span class="ticket-status-badge status-solved">Solved</span>';
  if(s==='closed')return '<span class="ticket-status-badge status-closed">Closed</span>';
  if(s==='active')return '<span class="admin-badge status-active">Active</span>';
  if(s==='trial')return '<span class="admin-badge status-trial">Trial</span>';
  if(s==='grace')return '<span class="admin-badge status-grace">Grace</span>';
  if(s==='suspended')return '<span class="admin-badge status-suspended">Suspended</span>';
  return '<span class="ticket-status-badge status-pending">'+esc(status||'Pending')+'</span>';
}

function renderPriorityBadge(priority){
  const p=String(priority||'normal').toLowerCase();
  if(p==='urgent')return '<span class="ticket-priority-badge priority-urgent">Urgent</span>';
  if(p==='high')return '<span class="ticket-priority-badge priority-high">High</span>';
  if(p==='low')return '<span class="ticket-priority-badge priority-low">Low</span>';
  return '<span class="ticket-priority-badge priority-normal">Normal</span>';
}

function isTicketSlaBreached(t){
  if(!t)return false;
  const s=normalizeTicketStatus(t.status);
  if(s==='solved'||s==='closed')return false;
  if(t.sla_due_at){
    const dueSec=Number(t.sla_due_at);
    if(dueSec>0&&Math.floor(Date.now()/1000)>dueSec)return true;
  }
  if(s==='pending'){
    const createdMs=typeof t.created_at==='number'?t.created_at*1000:new Date(t.created_at||0).getTime();
    if(createdMs>0&&(Date.now()-createdMs)>24*3600*1000)return true;
  }
  return false;
}

function renderSlaBadge(t){
  if(isTicketSlaBreached(t)){
    return '<span class="ticket-sla-badge" title="First-response or resolution SLA breached">⚠️ SLA Breach</span>';
  }
  return '';
}

function formatCategory(cat){
  if(!cat)return 'General';
  const c=String(cat).toLowerCase();
  if(c==='billing')return 'Billing';
  if(c==='documents')return 'Documents';
  if(c==='vehicle')return 'Vehicle';
  if(c==='technical')return 'Technical';
  return cat.charAt(0).toUpperCase()+cat.slice(1);
}

function getFilteredAdminTickets(){
  return adminTickets.filter(t=>{
    const s=normalizeTicketStatus(t.status);
    if(adminStatusFilter!=='all'&&s!==adminStatusFilter)return false;
    if(adminAssigneeFilter==='me'){
      const myId=user?.id||user?.email;
      if(!t.assignee_id||(t.assignee_id!==myId&&t.assignee_id!==user?.email))return false;
    }else if(adminAssigneeFilter==='unassigned'){
      if(t.assignee_id)return false;
    }
    if(adminPriorityFilter!=='all'){
      if(String(t.priority||'normal').toLowerCase()!==adminPriorityFilter)return false;
    }
    if(adminSlaFilter==='breached'){
      if(!isTicketSlaBreached(t))return false;
    }
    if(adminSearchQuery.trim()){
      const q=adminSearchQuery.toLowerCase();
      const matchId=String(t.id||'').toLowerCase().includes(q);
      const matchEmail=String(t.email||'').toLowerCase().includes(q);
      const matchSubject=String(t.subject||'').toLowerCase().includes(q);
      const matchCategory=String(t.category||'').toLowerCase().includes(q);
      const matchMessage=String(t.message||'').toLowerCase().includes(q);
      if(!matchId&&!matchEmail&&!matchSubject&&!matchCategory&&!matchMessage)return false;
    }
    return true;
  });
}

function renderAdminStatsHtml(){
  const totalCount=adminTickets.length;
  const pendingCount=adminTickets.filter(t=>normalizeTicketStatus(t.status)==='pending').length;
  const workingCount=adminTickets.filter(t=>['assigned','working','need_info'].includes(normalizeTicketStatus(t.status))).length;
  const slaBreachedCount=adminTickets.filter(isTicketSlaBreached).length;
  const solvedCount=adminTickets.filter(t=>['solved','closed'].includes(normalizeTicketStatus(t.status))).length;

  return '<div class="admin-stats-grid">'+
    '<div class="admin-stat-card"><span class="admin-stat-val">'+totalCount+'</span><span class="admin-stat-label">Total Tickets</span></div>'+
    '<div class="admin-stat-card"><span class="admin-stat-val" style="color:#b91c1c">'+slaBreachedCount+'</span><span class="admin-stat-label">⚠️ SLA Breached</span></div>'+
    '<div class="admin-stat-card"><span class="admin-stat-val" style="color:#2563eb">'+pendingCount+'</span><span class="admin-stat-label">Pending Triage</span></div>'+
    '<div class="admin-stat-card"><span class="admin-stat-val" style="color:#d97706">'+workingCount+'</span><span class="admin-stat-label">In Progress / Working</span></div>'+
    '<div class="admin-stat-card"><span class="admin-stat-val" style="color:#16a34a">'+solvedCount+'</span><span class="admin-stat-label">Solved / Closed</span></div>'+
  '</div>';
}

function renderAdminTicketDiagnosticCard(){
  const statusStr=adminTicketsLastStatus?String(adminTicketsLastStatus):'500 / 503';
  const codeStr=adminTicketsLastCode?String(adminTicketsLastCode):'SERVICE_UNAVAILABLE';
  return '<div class="admin-diag-card">'+
    '<div class="admin-diag-icon">⚠️</div>'+
    '<h3>Admin Service Temporarily Unavailable</h3>'+
    '<p>'+esc(adminTicketsError||'Failed to retrieve tickets.')+'</p>'+
    '<div class="admin-diag-meta">'+
      '<b>Backend Integration Diagnostics:</b><br>'+
      'Target: <code>GET /api/admin/support-tickets</code> &nbsp;|&nbsp; Status: <code>'+esc(statusStr)+' '+esc(codeStr)+'</code><br>'+
      'Note: Ensure Cloudflare D1 table <code>support_tickets</code> is provisioned and Super Admin role is active in production.'+
    '</div>'+
    '<div style="display:flex;gap:10px;justify-content:center;margin-top:8px">'+
      '<button type="button" class="primary" onclick="loadAdminTickets(true)">Retry Connection</button>'+
    '</div>'+
  '</div>';
}

function renderAdminListContent(){
  const listCont=$('adminListContainer');
  if(listCont)listCont.innerHTML=renderAdminListHtml();
}

function renderAdminListHtml(){
  if(adminTicketsLoading&&!adminTickets.length){
    return '<div class="admin-state-card">'+
      '<div class="spinner-lg" style="margin:8px auto"></div>'+
      '<h3>Loading Authoritative Tickets...</h3>'+
      '<p>Connecting to Cloudflare D1 ticket database via authorized admin gateway.</p>'+
    '</div>';
  }

  if(adminTicketsError){
    return renderAdminTicketDiagnosticCard();
  }

  const displayed=getFilteredAdminTickets();

  if(!displayed.length){
    return '<div class="admin-state-card">'+
      '<div class="admin-state-icon">🎫</div>'+
      '<h3>No Support Tickets Found</h3>'+
      '<p>'+(adminTickets.length===0?'No customer support tickets have been submitted yet.':'No tickets match the selected filters.')+'</p>'+
      (adminStatusFilter!=='all'||adminAssigneeFilter!=='all'||adminPriorityFilter!=='all'||adminSlaFilter!=='all'||adminSearchQuery?'<button type="button" class="ghost" onclick="resetAdminFilters()">Reset Filters</button>':'')+
    '</div>';
  }

  const tableRows = displayed.map(t=>{
    const tid=esc(t.id||'—');
    const sla=renderSlaBadge(t);
    return '<tr onclick="openAdminTicketDetails(\''+tid+'\')" style="cursor:pointer">'+
      '<td><div style="display:flex;align-items:center;gap:6px"><code style="font-weight:700;color:#2563eb">'+tid+'</code> '+sla+'</div></td>'+
      '<td style="white-space:nowrap;color:#64748b">'+esc(formatAdminDate(t.created_at))+'</td>'+
      '<td><div style="font-weight:600">'+esc(t.email||'Anonymous')+'</div><small class="muted" style="font-size:11px">'+esc((t.user_id||'').slice(0,8))+'...</small></td>'+
      '<td><span class="admin-badge" style="background:#f1f5f9;color:#334155">'+esc(formatCategory(t.category))+'</span></td>'+
      '<td class="ticket-subject-cell"><div class="ticket-subject-title">'+esc(t.subject||'No Subject')+'</div><small class="ticket-subject-desc">'+esc(t.message||'')+'</small></td>'+
      '<td>'+renderPriorityBadge(t.priority)+'</td>'+
      '<td>'+renderStatusBadge(t.status)+'</td>'+
      '<td style="text-align:right" onclick="event.stopPropagation()"><button type="button" class="ghost" style="padding:4px 10px;font-size:12px" onclick="openAdminTicketDetails(\''+tid+'\')">View</button></td>'+
    '</tr>';
  }).join('');

  const mobileCards = displayed.map(t=>{
    const tid=esc(t.id||'—');
    const sla=renderSlaBadge(t);
    return '<div class="ticket-card-mobile" onclick="openAdminTicketDetails(\''+tid+'\')" style="cursor:pointer">'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">'+
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><code style="font-weight:700;color:#2563eb">'+tid+'</code> '+sla+' '+renderStatusBadge(t.status)+'</div>'+
        '<small class="muted">'+esc(formatAdminDate(t.created_at))+'</small>'+
      '</div>'+
      '<div style="font-weight:700;font-size:14px;color:#0f172a;margin-top:4px">'+esc(t.subject||'No Subject')+'</div>'+
      '<p class="muted" style="font-size:12px;margin:2px 0 6px 0;line-height:1.4">'+esc((t.message||'').slice(0,120))+'</p>'+
      '<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;border-top:1px solid #f1f5f9;padding-top:6px">'+
        '<span>'+esc(t.email||'Anonymous')+'</span>'+
        renderPriorityBadge(t.priority)+
      '</div>'+
    '</div>';
  }).join('');

  return '<div class="ticket-table-desktop admin-table-container">'+
    '<table class="admin-data-table">'+
      '<thead>'+
        '<tr>'+
          '<th>Ticket ID</th>'+
          '<th>Date</th>'+
          '<th>Submitter</th>'+
          '<th>Category</th>'+
          '<th>Subject</th>'+
          '<th>Priority</th>'+
          '<th>Status</th>'+
          '<th style="text-align:right">Action</th>'+
        '</tr>'+
      '</thead>'+
      '<tbody>'+tableRows+'</tbody>'+
    '</table>'+
  '</div>'+
  '<div class="ticket-mobile-card-list">'+mobileCards+'</div>';
}

/* Individual Screen Renderers & Loaders */

function renderAdminBlockedCard(routePath,method='GET',detail=''){
  return '<div class="admin-blocked-card">'+
    '<div style="display:flex;align-items:center;gap:8px">'+
      '<span class="admin-badge" style="background:#dc2626;color:#ffffff;font-weight:700">BLOCKED</span>'+
      '<code>'+esc(method)+' '+esc(routePath)+'</code>'+
    '</div>'+
    '<div style="font-size:12.5px;color:#7f1d1d;margin-top:6px">'+
      esc(detail||('Backend route '+routePath+' returned 404 / is missing.'))+
    '</div>'+
  '</div>';
}

function renderAdminPhaseCard(phaseTitle,routePath,method,description){
  return '<div class="admin-phase-card">'+
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'+
      '<span class="admin-badge" style="background:#ede9fe;color:#5b21b6;font-weight:700">'+esc(phaseTitle)+'</span>'+
      '<code>'+esc(method)+' '+esc(routePath)+'</code>'+
    '</div>'+
    '<h3 style="margin:6px 0 8px;color:#1e1b4b">'+esc(phaseTitle)+'</h3>'+
    '<p class="muted" style="margin:0 0 12px;font-size:13px;line-height:1.6">'+esc(description)+'</p>'+
    '<div style="display:flex;gap:8px;align-items:center">'+
      '<span class="admin-badge" style="background:#f1f5f9;color:#475569">Route Pending Backend Deployment</span>'+
    '</div>'+
  '</div>';
}

async function loadAdminOverview(force=false){
  if(adminOverviewLoading)return;
  if(!force&&adminOverviewData)return;
  adminOverviewLoading=true;
  adminOverviewError=null;
  try{
    const res=await workerGet('/api/admin/overview');
    if(res&&res.ok)adminOverviewData=res.data||res;
    else if(res&&!res.error)adminOverviewData=res.data||res;
    else throw new Error(res?.error?.message||'Failed to load platform overview.');
  }catch(err){
    adminOverviewError=err;
  }finally{
    adminOverviewLoading=false;
    if(currentAdminScreen==='home')renderAdminViewContent();
  }
}

async function loadAdminUsers(force=false){
  if(adminUsersLoading)return;
  if(!force&&adminUsersList)return;
  adminUsersLoading=true;
  adminUsersError=null;
  try{
    const res=await workerGet('/api/admin/users');
    if(res&&res.ok&&Array.isArray(res.data))adminUsersList=res.data;
    else if(res&&Array.isArray(res.data))adminUsersList=res.data;
    else if(Array.isArray(res))adminUsersList=res;
    else throw new Error(res?.error?.message||'Failed to load user directory.');
  }catch(err){
    adminUsersError=err;
  }finally{
    adminUsersLoading=false;
    if(currentAdminScreen==='users')renderAdminViewContent();
  }
}

async function loadAdminTokens(force=false){
  if(adminTokensLoading)return;
  if(!force&&adminTokensList)return;
  adminTokensLoading=true;
  adminTokensError=null;
  try{
    const res=await workerGet('/api/admin/tokens');
    if(res&&res.ok&&Array.isArray(res.data))adminTokensList=res.data;
    else if(res&&Array.isArray(res.data))adminTokensList=res.data;
    else if(Array.isArray(res))adminTokensList=res;
    else throw new Error(res?.error?.message||'Failed to load tokens.');
  }catch(err){
    adminTokensError=err;
  }finally{
    adminTokensLoading=false;
    if(currentAdminScreen==='tokens')renderAdminViewContent();
  }
}

async function loadAdminPlans(force=false){
  if(adminPlansLoading)return;
  if(!force&&adminPlansList)return;
  adminPlansLoading=true;
  adminPlansError=null;
  try{
    const res=await workerGet('/api/admin/plans');
    if(res&&res.ok&&Array.isArray(res.data))adminPlansList=res.data;
    else if(res&&Array.isArray(res.data))adminPlansList=res.data;
    else if(Array.isArray(res))adminPlansList=res;
    else throw new Error(res?.error?.message||'Failed to load plans.');
  }catch(err){
    adminPlansError=err;
  }finally{
    adminPlansLoading=false;
    if(currentAdminScreen==='plans')renderAdminViewContent();
  }
}

async function loadAdminCoupons(force=false){
  if(adminCouponsLoading)return;
  if(!force&&adminCouponsList)return;
  adminCouponsLoading=true;
  adminCouponsError=null;
  try{
    const res=await workerGet('/api/admin/coupons');
    if(res&&res.ok&&Array.isArray(res.data))adminCouponsList=res.data;
    else if(res&&Array.isArray(res.data))adminCouponsList=res.data;
    else if(Array.isArray(res))adminCouponsList=res;
    else throw new Error(res?.error?.message||'Failed to load coupons.');
  }catch(err){
    adminCouponsError=err;
  }finally{
    adminCouponsLoading=false;
    if(currentAdminScreen==='plans')renderAdminViewContent();
  }
}

async function loadAdminUpgrades(force=false){
  if(adminUpgradesLoading)return;
  if(!force&&adminUpgradesList)return;
  adminUpgradesLoading=true;
  adminUpgradesError=null;
  try{
    const res=await workerGet('/api/admin/upgrade-requests');
    if(res&&res.ok&&Array.isArray(res.data))adminUpgradesList=res.data;
    else if(res&&Array.isArray(res.data))adminUpgradesList=res.data;
    else if(Array.isArray(res))adminUpgradesList=res;
    else throw new Error(res?.error?.message||'Failed to load upgrade queue.');
  }catch(err){
    adminUpgradesError=err;
  }finally{
    adminUpgradesLoading=false;
    if(currentAdminScreen==='upgrades')renderAdminViewContent();
  }
}

async function loadAdminTeam(force=false){
  if(adminTeamLoading)return;
  if(!force&&adminTeamList)return;
  adminTeamLoading=true;
  adminTeamError=null;
  try{
    const res=await workerGet('/api/admin/team/members');
    if(res&&res.ok&&Array.isArray(res.data))adminTeamList=res.data;
    else if(res&&Array.isArray(res.data))adminTeamList=res.data;
    else if(Array.isArray(res))adminTeamList=res;
    else throw new Error(res?.error?.message||'Failed to load team roster.');
  }catch(err){
    adminTeamError=err;
  }finally{
    adminTeamLoading=false;
    if(currentAdminScreen==='team')renderAdminViewContent();
  }
}

async function loadAdminAudit(force=false){
  if(adminAuditLoading)return;
  if(!force&&adminAuditList)return;
  adminAuditLoading=true;
  adminAuditError=null;
  try{
    const res=await workerGet('/api/admin/audit');
    if(res&&res.ok&&Array.isArray(res.data))adminAuditList=res.data;
    else if(res&&Array.isArray(res.data))adminAuditList=res.data;
    else if(Array.isArray(res))adminAuditList=res;
    else throw new Error(res?.error?.message||'Failed to load audit trail.');
  }catch(err){
    adminAuditError=err;
  }finally{
    adminAuditLoading=false;
    if(currentAdminScreen==='audit')renderAdminViewContent();
  }
}

async function loadAdminGarages(force=false){
  if(adminGaragesLoading)return;
  if(!force&&adminGaragesList)return;
  adminGaragesLoading=true;
  adminGaragesError=null;
  try{
    const res=await workerGet('/api/admin/garages');
    if(res&&res.ok&&Array.isArray(res.data))adminGaragesList=res.data;
    else if(res&&Array.isArray(res.data))adminGaragesList=res.data;
    else if(Array.isArray(res))adminGaragesList=res;
    else throw new Error(res?.error?.message||'Failed to load garage directory.');
  }catch(err){
    adminGaragesError=err;
  }finally{
    adminGaragesLoading=false;
    if(currentAdminScreen==='garages')renderAdminViewContent();
  }
}

async function updateAdminGarageStatus(garageId, newStatus){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.canManageGarages){
    toast('Permission denied: Role "'+perms.label+'" cannot modify workshop status.','error');
    return;
  }
  executeProtectedAdminAction('Update Workshop Status', async ()=>{
    try{
      await workerPatch('/api/admin/garages/'+encodeURIComponent(garageId)+'/status', { status: newStatus });
      toast('Garage workshop status updated to '+newStatus+'.','ok');
      loadAdminGarages(true);
    }catch(err){
      toast('Failed to update workshop status: '+(err?.message||err),'error');
    }
  });
}

function renderScreenHome(){
  const totalTickets=adminTickets.length;
  const openTickets=adminTickets.filter(t=>(t.status||'').toLowerCase()==='open').length;

  let bodyContent='';
  if(adminOverviewLoading){
    bodyContent='<div class="admin-card" style="text-align:center;padding:36px"><span class="spinner-sm"></span> Loading platform overview from <code>GET /api/admin/overview</code>...</div>';
  }else if(adminOverviewError){
    bodyContent=renderAdminBlockedCard('/api/admin/overview','GET',adminOverviewError?.message||'Overview service unavailable.');
  }else if(adminOverviewData){
    const d=adminOverviewData;
    const totalUsers=d.total_users??0;
    const activePaid=d.active_paid??0;
    const openTix=d.open_tickets??openTickets;
    const rev=d.seven_day_revenue??'₹0.00';
    const garageCount=d.garage_count??0;
    const activity=Array.isArray(d.recent_activity)?d.recent_activity:[];

    bodyContent='<div class="admin-kpi-grid">'+
      '<div class="admin-kpi-card">'+
        '<span class="kpi-label">Total Users</span>'+
        '<span class="kpi-val">'+esc(totalUsers)+'</span>'+
        '<span class="kpi-sub">Verified customer accounts</span>'+
      '</div>'+
      '<div class="admin-kpi-card">'+
        '<span class="kpi-label">Active Paid Subscribers</span>'+
        '<span class="kpi-val" style="color:#16a34a">'+esc(activePaid)+'</span>'+
        '<span class="kpi-sub">Plus &amp; Ultra subscriptions</span>'+
      '</div>'+
      '<div class="admin-kpi-card">'+
        '<span class="kpi-label">Open Tickets</span>'+
        '<span class="kpi-val" style="color:'+(openTix>0?'#2563eb':'#0f172a')+'">'+esc(openTix)+'</span>'+
        '<span class="kpi-sub">'+esc(openTickets)+' total unresolved</span>'+
      '</div>'+
      '<div class="admin-kpi-card">'+
        '<span class="kpi-label">7-Day Revenue</span>'+
        '<span class="kpi-val" style="color:#16a34a">'+esc(rev)+'</span>'+
        '<span class="kpi-sub">Platform gross receipts</span>'+
      '</div>'+
      '<div class="admin-kpi-card">'+
        '<span class="kpi-label">Active Garages</span>'+
        '<span class="kpi-val">'+esc(garageCount)+'</span>'+
        '<span class="kpi-sub">Partner workshop network</span>'+
      '</div>'+
    '</div>'+
    '<div class="admin-card">'+
      '<div class="admin-card-head"><h3>Recent Platform Activity Feed</h3><p class="muted">Authoritative event log from server directory.</p></div>'+
      (activity.length===0?'<div class="admin-empty-state"><p class="muted">No recent platform activity logged.</p></div>':
        '<div class="admin-table-container" style="margin-top:12px">'+
          '<table class="admin-data-table">'+
            '<thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Details</th></tr></thead>'+
            '<tbody>'+
              activity.map(a=>'<tr>'+
                '<td style="white-space:nowrap;color:#64748b">'+esc(a.timestamp||'—')+'</td>'+
                '<td><b>'+esc(a.actor||'System')+'</b></td>'+
                '<td><code>'+esc(a.action||'—')+'</code></td>'+
                '<td>'+esc(a.details||'—')+'</td>'+
              '</tr>').join('')+
            '</tbody>'+
          '</table>'+
        '</div>')+
    '</div>';
  }else{
    bodyContent='<div class="admin-card" style="text-align:center;padding:28px">'+
      '<p class="muted" style="margin-bottom:12px">Platform metrics are fetched dynamically from server edge.</p>'+
      '<button type="button" class="primary" onclick="loadAdminOverview(true)">Fetch Real Overview (GET /api/admin/overview)</button>'+
    '</div>';
  }

  return '<div class="admin-screen-shell">'+
    '<div class="admin-screen-header">'+
      '<div>'+
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'+
          '<span class="admin-header-badge">AUTHORITATIVE OPS</span>'+
          '<span class="muted" style="font-size:12px">TORQ DESK CLOUD CONTROL</span>'+
        '</div>'+
        '<h2>Workspace Overview &amp; Health</h2>'+
        '<p class="muted">Live system status, active account breakdown, and operational quick actions.</p>'+
      '</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
        '<button type="button" class="ghost" onclick="loadAdminOverview(true)">↻ Refresh Overview</button>'+
        '<button type="button" class="primary" onclick="switchAdminScreen(\'tokens\');openTokenGenModal()">+ Issue Token</button>'+
      '</div>'+
    '</div>'+
    (adminTicketsError?'<div style="margin-bottom:12px">'+renderAdminTicketDiagnosticCard()+'</div>':'')+
    '<div class="admin-card" style="border-left:4px solid #2563eb">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">'+
        '<div>'+
          '<b style="font-size:14px;color:#0f172a">Platform Security &amp; Infrastructure Health</b>'+
          '<p class="muted" style="margin:2px 0 0;font-size:12.5px">Cloudflare Edge &amp; Supabase backend status verified.</p>'+
        '</div>'+
        '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
          '<span class="admin-security-pill">● Workers Active</span>'+
          '<span class="admin-security-pill">● R2 Vault Encrypted</span>'+
          '<span class="admin-security-pill">● 15-Min Admin Lock</span>'+
        '</div>'+
      '</div>'+
    '</div>'+
    bodyContent+
    '<div class="admin-card">'+
      '<div class="admin-card-head"><h3>Operational Quick Actions</h3><p class="muted">Direct access to core administrative workflows.</p></div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:14px">'+
        '<button type="button" class="ghost" style="padding:14px;text-align:left;height:auto;display:flex;flex-direction:column;gap:4px" onclick="switchAdminScreen(\'tokens\');openTokenGenModal()">'+
          '<b>🎫 Issue Activation Token</b><span class="muted" style="font-size:11.5px">Generate single or multi-use entitlement codes</span>'+
        '</button>'+
        '<button type="button" class="ghost" style="padding:14px;text-align:left;height:auto;display:flex;flex-direction:column;gap:4px" onclick="switchAdminScreen(\'upgrades\')">'+
          '<b>📈 Inbound Upgrade Queue</b><span class="muted" style="font-size:11.5px">Review customer leads &amp; WhatsApp contacts</span>'+
        '</button>'+
        '<button type="button" class="ghost" style="padding:14px;text-align:left;height:auto;display:flex;flex-direction:column;gap:4px" onclick="switchAdminScreen(\'tickets\')">'+
          '<b>📩 Support Ticket Triage</b><span class="muted" style="font-size:11.5px">Respond to customer issues and bug reports</span>'+
        '</button>'+
        '<button type="button" class="ghost" style="padding:14px;text-align:left;height:auto;display:flex;flex-direction:column;gap:4px" onclick="switchAdminScreen(\'plans\')">'+
          '<b>🏷️ Manage Plans &amp; Pricing</b><span class="muted" style="font-size:11.5px">Free vs Plus limits and festival coupons</span>'+
        '</button>'+
      '</div>'+
    '</div>'+
  '</div>';
}

function renderScreenUsers(){
  let bodyContent='';
  if(adminUsersLoading){
    bodyContent='<div class="admin-card" style="text-align:center;padding:36px"><span class="spinner-sm"></span> Loading user directory from <code>GET /api/admin/users</code>...</div>';
  }else if(adminUsersError){
    bodyContent=renderAdminBlockedCard('/api/admin/users','GET',adminUsersError?.message||'User directory route unavailable (404).');
  }else if(adminUsersList){
    const q=(adminUsersSearch||'').trim().toLowerCase();
    const filtered=adminUsersList.filter(u=>{
      if(adminUsersRoleFilter!=='all'&&(u.role||'owner').toLowerCase()!==adminUsersRoleFilter)return false;
      if(adminUsersPlanFilter!=='all'&&(u.plan||'lite').toLowerCase()!==adminUsersPlanFilter)return false;
      if(adminUsersStatusFilter!=='all'&&(u.status||'active').toLowerCase()!==adminUsersStatusFilter)return false;
      if(q){
        const haystack=((u.name||'')+' '+(u.email||'')+' '+(u.phone||'')).toLowerCase();
        if(!haystack.includes(q))return false;
      }
      return true;
    });

    if(filtered.length===0){
      bodyContent='<div class="admin-empty-state"><p class="muted">No matching customer accounts found.</p></div>';
    }else{
      bodyContent='<div class="admin-table-container">'+
        '<table class="admin-data-table">'+
          '<thead>'+
            '<tr>'+
              '<th>Customer / Account</th>'+
              '<th>Phone</th>'+
              '<th>Role</th>'+
              '<th>Current Plan</th>'+
              '<th>Status</th>'+
              '<th>Created Date</th>'+
              '<th style="text-align:right">Actions</th>'+
            '</tr>'+
          '</thead>'+
          '<tbody>'+
            filtered.map(u=>'<tr>'+
              '<td><div style="font-weight:700;color:#0f172a">'+esc(u.name||'Customer')+'</div><small class="muted">'+esc(u.email||'—')+'</small></td>'+
              '<td><code style="font-size:12px">'+esc(u.phone||'—')+'</code></td>'+
              '<td><span class="admin-badge">'+esc(u.role||'Owner')+'</span></td>'+
              '<td><span class="admin-badge plan-'+esc((u.plan||'lite').toLowerCase())+'">'+esc(u.plan||'Lite')+'</span></td>'+
              '<td><span class="admin-badge status-'+esc((u.status||'active').toLowerCase())+'">'+esc(u.status||'Active')+'</span></td>'+
              '<td style="white-space:nowrap;color:#64748b">'+esc(formatAdminDate(u.created_at))+'</td>'+
              '<td style="text-align:right"><button type="button" class="ghost" style="padding:4px 10px;font-size:12px" onclick="openAdminUserDetails(\''+esc(u.id)+'\')">Manage User</button></td>'+
            '</tr>').join('')+
          '</tbody>'+
        '</table>'+
      '</div>';
    }
  }else{
    bodyContent='<div class="admin-card" style="text-align:center;padding:28px">'+
      '<p class="muted" style="margin-bottom:12px">User directory is fetched from the server database.</p>'+
      '<button type="button" class="primary" onclick="loadAdminUsers(true)">Load Users (GET /api/admin/users)</button>'+
    '</div>';
  }

  return '<div class="admin-screen-shell">'+
    '<div class="admin-screen-header">'+
      '<div>'+
        '<h2>User Directory &amp; Entitlements</h2>'+
        '<p class="muted">Search customer accounts, manage plan entitlements, review session status, and audit usage.</p>'+
      '</div>'+
      '<div style="display:flex;gap:8px">'+
        '<button type="button" class="ghost" onclick="loadAdminUsers(true)">↻ Refresh List</button>'+
        '<button type="button" class="ghost" onclick="exportUsersCsv()">📥 Export Users CSV</button>'+
      '</div>'+
    '</div>'+
    '<div class="admin-controls-bar">'+
      '<div class="admin-filter-tabs">'+
        '<button type="button" class="admin-filter-pill '+(adminUsersRoleFilter==='all'?'active':'')+'" onclick="adminUsersRoleFilter=\'all\';renderAdminViewContent()">All Roles</button>'+
        '<button type="button" class="admin-filter-pill '+(adminUsersRoleFilter==='owner'?'active':'')+'" onclick="adminUsersRoleFilter=\'owner\';renderAdminViewContent()">Vehicle Owners</button>'+
        '<button type="button" class="admin-filter-pill '+(adminUsersRoleFilter==='garage'?'active':'')+'" onclick="adminUsersRoleFilter=\'garage\';renderAdminViewContent()">Garage Owners</button>'+
        '<button type="button" class="admin-filter-pill '+(adminUsersRoleFilter==='staff'?'active':'')+'" onclick="adminUsersRoleFilter=\'staff\';renderAdminViewContent()">Staff</button>'+
      '</div>'+
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+
        '<select class="ticket-filter-select" onchange="adminUsersPlanFilter=this.value;renderAdminViewContent()">'+
          '<option value="all" '+(adminUsersPlanFilter==='all'?'selected':'')+'>All Plans</option>'+
          '<option value="lite" '+(adminUsersPlanFilter==='lite'?'selected':'')+'>Lite</option>'+
          '<option value="premium" '+(adminUsersPlanFilter==='premium'?'selected':'')+'>Premium</option>'+
          '<option value="ultra" '+(adminUsersPlanFilter==='ultra'?'selected':'')+'>Ultra</option>'+
        '</select>'+
        '<select class="ticket-filter-select" onchange="adminUsersStatusFilter=this.value;renderAdminViewContent()">'+
          '<option value="all" '+(adminUsersStatusFilter==='all'?'selected':'')+'>All Statuses</option>'+
          '<option value="active" '+(adminUsersStatusFilter==='active'?'selected':'')+'>Active</option>'+
          '<option value="suspended" '+(adminUsersStatusFilter==='suspended'?'selected':'')+'>Suspended</option>'+
        '</select>'+
        '<input type="text" class="admin-search-input" placeholder="Search name, email, mobile..." value="'+esc(adminUsersSearch)+'" oninput="adminUsersSearch=this.value;renderAdminViewContent()">'+
      '</div>'+
    '</div>'+
    bodyContent+
  '</div>';
}

function renderScreenTokens(){
  let bodyContent='';
  if(adminTokensLoading){
    bodyContent='<div class="admin-card" style="text-align:center;padding:36px"><span class="spinner-sm"></span> Loading tokens from <code>GET /api/admin/tokens</code>...</div>';
  }else if(adminTokensError){
    bodyContent=renderAdminBlockedCard('/api/admin/tokens','GET',adminTokensError?.message||'Activation tokens route unavailable (404).');
  }else if(adminTokensList){
    if(adminTokensList.length===0){
      bodyContent='<div class="admin-empty-state"><p class="muted">No activation tokens issued yet.</p></div>';
    }else{
      bodyContent='<div class="admin-table-container">'+
        '<table class="admin-data-table">'+
          '<thead>'+
            '<tr>'+
              '<th>Masked Token</th>'+
              '<th>Plan Granted</th>'+
              '<th>Role</th>'+
              '<th>Usage</th>'+
              '<th>Validity</th>'+
              '<th>Expiry Date</th>'+
              '<th>Status</th>'+
              '<th style="text-align:right">Action</th>'+
            '</tr>'+
          '</thead>'+
          '<tbody>'+
            adminTokensList.map(t=>'<tr>'+
              '<td><code style="font-weight:700;color:#2563eb">'+esc(t.masked_token||t.code||'TD-••••')+'</code></td>'+
              '<td><span class="admin-badge plan-'+esc((t.plan||'lite').toLowerCase())+'">'+esc(t.plan||'Lite')+'</span></td>'+
              '<td>'+esc(t.role||'Vehicle Owner')+'</td>'+
              '<td>'+esc(t.used_count||0)+' / '+esc(t.max_uses===0?'∞':(t.max_uses||1))+'</td>'+
              '<td>'+esc(t.duration_days||365)+' Days</td>'+
              '<td style="color:#64748b">'+esc(formatAdminDate(t.expires_at))+'</td>'+
              '<td><span class="admin-badge status-'+esc((t.status||'active').toLowerCase())+'">'+esc(t.status||'Active')+'</span></td>'+
              '<td style="text-align:right"><button type="button" class="ghost" style="padding:4px 10px;font-size:12px;color:#dc2626" onclick="revokeAdminToken(\''+esc(t.id||t.code)+'\')">Revoke</button></td>'+
            '</tr>').join('')+
          '</tbody>'+
        '</table>'+
      '</div>';
    }
  }else{
    bodyContent='<div class="admin-card" style="text-align:center;padding:28px">'+
      '<p class="muted" style="margin-bottom:12px">Activation token registry connects to backend database.</p>'+
      '<button type="button" class="primary" onclick="loadAdminTokens(true)">Fetch Tokens (GET /api/admin/tokens)</button>'+
    '</div>';
  }

  return '<div class="admin-screen-shell">'+
    '<div class="admin-screen-header">'+
      '<div>'+
        '<h2>Activation Tokens &amp; Plan Grants</h2>'+
        '<p class="muted">Issue cryptographic activation tokens for plan upgrades, promotions, and garage activations.</p>'+
      '</div>'+
      '<div style="display:flex;gap:8px">'+
        '<button type="button" class="ghost" onclick="loadAdminTokens(true)">↻ Refresh List</button>'+
        '<button type="button" class="primary" onclick="openTokenGenModal()">+ Generate Token</button>'+
      '</div>'+
    '</div>'+
    '<div class="admin-card" style="border-left:4px solid #10b981">'+
      '<b style="font-size:13.5px">Cryptographic Token Issuance Standard</b>'+
      '<p class="muted" style="margin:2px 0 0;font-size:12px">Tokens are hashed with SHA-256 upon issuance. The raw secret is revealed exactly once to the administrator. The server never stores plaintext token codes.</p>'+
    '</div>'+
    bodyContent+
  '</div>';
}

function renderScreenPlans(){
  let plansContent='';
  if(adminPlansLoading){
    plansContent='<div class="admin-card" style="text-align:center;padding:36px"><span class="spinner-sm"></span> Loading plans from <code>GET /api/admin/plans</code>...</div>';
  }else if(adminPlansError){
    plansContent=renderAdminBlockedCard('/api/admin/plans','GET',adminPlansError?.message||'Plans endpoint unavailable (404).');
  }else if(adminPlansList){
    plansContent='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">'+
      adminPlansList.map(p=>'<div class="admin-card">'+
        '<div class="admin-card-head"><span class="admin-badge plan-'+esc((p.id||'free').toLowerCase())+'">'+esc(p.name||'Plan')+'</span><h3 style="margin:8px 0 4px">'+esc(p.name||'Plan')+'</h3><div style="font-size:22px;font-weight:800;color:#0f172a">'+esc(p.price_display||('₹'+(p.price||0)))+'</div></div>'+
        '<ul style="margin:14px 0;padding-left:18px;font-size:13px;color:#334155;line-height:1.7">'+
          '<li>Vehicle Limit: <b>'+esc(p.max_vehicles||1)+'</b></li>'+
          '<li>Storage: <b>'+esc(p.storage_mb||10)+' MB</b></li>'+
          '<li>Feature Flags: <code>'+esc(Object.keys(p.features||{}).join(', ')||'Standard')+'</code></li>'+
        '</ul>'+
      '</div>').join('')+
    '</div>';
  }else{
    plansContent='<div class="admin-card" style="text-align:center;padding:28px">'+
      '<p class="muted" style="margin-bottom:12px">Plan tiers and entitlement limits are managed in the database.</p>'+
      '<button type="button" class="primary" onclick="loadAdminPlans(true)">Fetch Plans (GET /api/admin/plans)</button>'+
    '</div>';
  }

  let couponsContent='';
  if(adminCouponsLoading){
    couponsContent='<div class="admin-card" style="text-align:center;padding:24px"><span class="spinner-sm"></span> Loading coupons from <code>GET /api/admin/coupons</code>...</div>';
  }else if(adminCouponsError){
    couponsContent=renderAdminBlockedCard('/api/admin/coupons','GET',adminCouponsError?.message||'Coupons endpoint unavailable (404).');
  }else if(adminCouponsList){
    if(adminCouponsList.length===0){
      couponsContent='<div class="admin-empty-state"><p class="muted">No active promotional coupons found.</p></div>';
    }else{
      couponsContent='<div class="admin-table-container">'+
        '<table class="admin-data-table">'+
          '<thead><tr><th>Code</th><th>Discount</th><th>Max Uses</th><th>Redeemed</th><th>Expires</th><th>Status</th><th style="text-align:right">Action</th></tr></thead>'+
          '<tbody>'+
            adminCouponsList.map(c=>'<tr>'+
              '<td><code style="font-weight:700;color:#9d174d">'+esc(c.code)+'</code></td>'+
              '<td>'+esc(c.discount_percent||c.discount||0)+'% OFF</td>'+
              '<td>'+esc(c.max_uses||'Unlimited')+'</td>'+
              '<td>'+esc(c.used_count||0)+'</td>'+
              '<td>'+esc(formatAdminDate(c.expires_at))+'</td>'+
              '<td><span class="admin-badge status-'+esc(c.status||'active')+'">'+esc(c.status||'Active')+'</span></td>'+
              '<td style="text-align:right"><button type="button" class="ghost" style="padding:4px 10px;font-size:12px;color:#dc2626" onclick="deleteAdminCoupon(\''+esc(c.id)+'\')">Deactivate</button></td>'+
            '</tr>').join('')+
          '</tbody>'+
        '</table>'+
      '</div>';
    }
  }else{
    couponsContent='<div class="admin-card" style="text-align:center;padding:24px">'+
      '<p class="muted" style="margin-bottom:12px">Promotional coupons are verified and applied server-side.</p>'+
      '<button type="button" class="ghost" onclick="loadAdminCoupons(true)">Fetch Coupons (GET /api/admin/coupons)</button>'+
    '</div>';
  }

  return '<div class="admin-screen-shell">'+
    '<div class="admin-screen-header">'+
      '<div>'+
        '<h2>Plans, Pricing &amp; Feature Limits</h2>'+
        '<p class="muted">Configure vehicle limits, document vault storage, pricing, and promotional coupons.</p>'+
      '</div>'+
      '<div style="display:flex;gap:8px">'+
        '<button type="button" class="ghost" onclick="loadAdminPlans(true);loadAdminCoupons(true)">↻ Refresh Plans</button>'+
        '<button type="button" class="primary" onclick="openCreateCouponModal()">+ Create Coupon</button>'+
      '</div>'+
    '</div>'+
    plansContent+
    '<div class="admin-card">'+
      '<div class="admin-card-head"><h3>Active Promotional Coupons</h3><p class="muted">Festival discounts, garage vouchers, and marketing campaigns.</p></div>'+
      couponsContent+
    '</div>'+
  '</div>';
}

function renderScreenUpgrades(){
  let bodyContent='';
  if(adminUpgradesLoading){
    bodyContent='<div class="admin-card" style="text-align:center;padding:36px"><span class="spinner-sm"></span> Loading upgrade queue from <code>GET /api/admin/upgrade-requests</code>...</div>';
  }else if(adminUpgradesError){
    bodyContent=renderAdminBlockedCard('/api/admin/upgrade-requests','GET',adminUpgradesError?.message||'Upgrade requests endpoint unavailable (404).');
  }else if(adminUpgradesList){
    const filtered=adminUpgradesList.filter(r=>{
      if(adminUpgradesFilter==='all')return true;
      return (r.status||'pending').toLowerCase()===adminUpgradesFilter;
    });

    if(filtered.length===0){
      bodyContent='<div class="admin-empty-state"><p class="muted">No upgrade requests matching current filter.</p></div>';
    }else{
      bodyContent='<div class="admin-table-container">'+
        '<table class="admin-data-table">'+
          '<thead>'+
            '<tr>'+
              '<th>Customer</th>'+
              '<th>Contact Phone</th>'+
              '<th>Requested Plan</th>'+
              '<th>Date</th>'+
              '<th>Status</th>'+
              '<th style="text-align:right">Action &amp; Triage</th>'+
            '</tr>'+
          '</thead>'+
          '<tbody>'+
            filtered.map(r=>'<tr>'+
              '<td><div style="font-weight:700">'+esc(r.customer_name||r.name||'Customer')+'</div><small class="muted">'+esc(r.customer_email||r.email||'—')+'</small></td>'+
              '<td><a href="tel:'+esc(r.phone)+'" style="color:#2563eb;font-weight:600">'+esc(r.phone||'—')+'</a></td>'+
              '<td><span class="admin-badge plan-'+esc((r.requested_plan||'premium').toLowerCase())+'">'+esc(r.requested_plan||'Premium')+'</span></td>'+
              '<td style="color:#64748b">'+esc(formatAdminDate(r.created_at))+'</td>'+
              '<td><span class="admin-badge status-'+esc((r.status||'pending').toLowerCase())+'">'+esc(r.status||'Pending')+'</span></td>'+
              '<td style="text-align:right">'+
                '<div style="display:flex;gap:6px;justify-content:flex-end;align-items:center">'+
                  '<textarea id="upgradeNote_'+esc(r.id)+'" placeholder="Triage note..." rows="1" style="width:140px;font-size:11px;padding:3px"></textarea>'+
                  '<button type="button" class="primary" style="padding:4px 8px;font-size:12px" onclick="handleUpgradeAction(\''+esc(r.id)+'\',\'approve\')">Approve</button>'+
                  '<button type="button" class="ghost" style="padding:4px 8px;font-size:12px;color:#dc2626" onclick="handleUpgradeAction(\''+esc(r.id)+'\',\'reject\')">Reject</button>'+
                '</div>'+
              '</td>'+
            '</tr>').join('')+
          '</tbody>'+
        '</table>'+
      '</div>';
    }
  }else{
    bodyContent='<div class="admin-card" style="text-align:center;padding:28px">'+
      '<p class="muted" style="margin-bottom:12px">Inbound upgrade requests submitted by vehicle owners and garages.</p>'+
      '<button type="button" class="primary" onclick="loadAdminUpgrades(true)">Fetch Queue (GET /api/admin/upgrade-requests)</button>'+
    '</div>';
  }

  return '<div class="admin-screen-shell">'+
    '<div class="admin-screen-header">'+
      '<div>'+
        '<h2>Customer Upgrade Queue &amp; Leads</h2>'+
        '<p class="muted">Review inbound customer upgrade inquiries, initiate WhatsApp/Call contact, and activate accounts.</p>'+
      '</div>'+
      '<div style="display:flex;gap:8px">'+
        '<button type="button" class="ghost" onclick="loadAdminUpgrades(true)">↻ Refresh Queue</button>'+
      '</div>'+
    '</div>'+
    '<div class="admin-filter-tabs">'+
      '<button type="button" class="admin-filter-pill '+(adminUpgradesFilter==='all'?'active':'')+'" onclick="adminUpgradesFilter=\'all\';renderAdminViewContent()">All Requests</button>'+
      '<button type="button" class="admin-filter-pill '+(adminUpgradesFilter==='pending'?'active':'')+'" onclick="adminUpgradesFilter=\'pending\';renderAdminViewContent()">Pending</button>'+
      '<button type="button" class="admin-filter-pill '+(adminUpgradesFilter==='approved'?'active':'')+'" onclick="adminUpgradesFilter=\'approved\';renderAdminViewContent()">Approved</button>'+
      '<button type="button" class="admin-filter-pill '+(adminUpgradesFilter==='rejected'?'active':'')+'" onclick="adminUpgradesFilter=\'rejected\';renderAdminViewContent()">Rejected</button>'+
    '</div>'+
    bodyContent+
  '</div>';
}

function renderScreenTickets(){
  const statusFilters=[
    {id:'all',label:'All'},
    {id:'pending',label:'Pending'},
    {id:'assigned',label:'Assigned'},
    {id:'working',label:'Working on it'},
    {id:'need_info',label:'Required other info'},
    {id:'solved',label:'Solved'},
    {id:'closed',label:'Closed'}
  ];

  return '<div class="admin-screen-shell">'+
    '<div class="admin-screen-header">'+
      '<div>'+
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'+
          '<span class="admin-header-badge">AUTHORITATIVE GATEWAY</span>'+
          '<span class="muted" style="font-size:12px">CLOUDFLARE D1 SUPPORT DB</span>'+
        '</div>'+
        '<h2>Support Ticket Triage</h2>'+
        '<p class="muted">Authoritative ticket triage, customer issue audit, and system oversight.</p>'+
      '</div>'+
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+
        '<button type="button" class="ghost" id="adminRefreshBtn" onclick="refreshAdminTickets()" '+(adminTicketsLoading?'disabled':'')+'>'+
          (adminTicketsLoading?'<span class="spinner-sm"></span> Refreshing...':'↻ Refresh Tickets')+
        '</button>'+
      '</div>'+
    '</div>'+
    '<div id="adminStatsContainer">'+renderAdminStatsHtml()+'</div>'+
    '<div class="admin-controls-bar">'+
      '<div class="admin-filter-tabs" id="adminFilterGroup">'+
        statusFilters.map(f=>'<button type="button" class="admin-filter-pill '+(adminStatusFilter===f.id?'active':'')+'" onclick="filterAdminTicketsByStatus(\''+f.id+'\')">'+esc(f.label)+'</button>').join('')+
      '</div>'+
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+
        '<select class="ticket-filter-select" id="adminAssigneeSelect" onchange="adminAssigneeFilter=this.value;renderAdminListContent()">'+
          '<option value="all" '+(adminAssigneeFilter==='all'?'selected':'')+'>All Assignees</option>'+
          '<option value="me" '+(adminAssigneeFilter==='me'?'selected':'')+'>Assigned to Me</option>'+
          '<option value="unassigned" '+(adminAssigneeFilter==='unassigned'?'selected':'')+'>Unassigned</option>'+
        '</select>'+
        '<select class="ticket-filter-select" id="adminPrioritySelect" onchange="adminPriorityFilter=this.value;renderAdminListContent()">'+
          '<option value="all" '+(adminPriorityFilter==='all'?'selected':'')+'>All Priorities</option>'+
          '<option value="urgent" '+(adminPriorityFilter==='urgent'?'selected':'')+'>Urgent</option>'+
          '<option value="high" '+(adminPriorityFilter==='high'?'selected':'')+'>High</option>'+
          '<option value="normal" '+(adminPriorityFilter==='normal'?'selected':'')+'>Normal</option>'+
          '<option value="low" '+(adminPriorityFilter==='low'?'selected':'')+'>Low</option>'+
        '</select>'+
        '<button type="button" class="ticket-filter-pill '+(adminSlaFilter==='breached'?'active':'')+'" onclick="adminSlaFilter=(adminSlaFilter===\'breached\'?\'all\':\'breached\');renderAdminViewContent()">'+
          '⚠️ SLA Breach Only'+
        '</button>'+
        '<input type="text" id="adminSearchInput" class="admin-search-input" placeholder="Search ID, email, subject..." value="'+esc(adminSearchQuery)+'" oninput="handleAdminSearch(this.value)">'+
      '</div>'+
    '</div>'+
    '<div id="adminListContainer">'+renderAdminListHtml()+'</div>'+
  '</div>';
}

function renderScreenGarages(){
  let bodyContent='';
  if(adminGaragesLoading){
    bodyContent='<div class="admin-card" style="text-align:center;padding:36px"><span class="spinner-sm"></span> Loading garage directory from <code>GET /api/admin/garages</code>...</div>';
  }else if(adminGaragesError){
    bodyContent=renderAdminBlockedCard('/api/admin/garages','GET',adminGaragesError?.message||'Garage network endpoint unavailable (404).');
  }else if(adminGaragesList){
    const q=(adminGaragesSearch||'').trim().toLowerCase();
    const filtered=adminGaragesList.filter(g=>{
      if(adminGaragesFilter!=='all'&&(g.status||'active').toLowerCase()!==adminGaragesFilter)return false;
      if(q){
        const haystack=((g.name||g.workshop_name||'')+' '+(g.city||'')+' '+(g.owner_name||'')+' '+(g.phone||'')+' '+(g.email||'')+' '+(g.gstin||'')).toLowerCase();
        if(!haystack.includes(q))return false;
      }
      return true;
    });

    if(filtered.length===0){
      bodyContent='<div class="admin-empty-state"><p class="muted">No workshop partners match the selected filter.</p></div>';
    }else{
      bodyContent='<div class="admin-table-container">'+
        '<table class="admin-data-table">'+
          '<thead>'+
            '<tr>'+
              '<th>Workshop &amp; Location</th>'+
              '<th>Contact &amp; Owner</th>'+
              '<th>GSTIN / Trade</th>'+
              '<th>Plan Tier</th>'+
              '<th>Bays &amp; Staff</th>'+
              '<th>Status</th>'+
              '<th style="text-align:right">Actions</th>'+
            '</tr>'+
          '</thead>'+
          '<tbody>'+
            filtered.map(g=>{
              const gid=g.id||g.workshop_id||'';
              const name=g.name||g.workshop_name||'Workshop Partner';
              const location=[g.city, g.state].filter(Boolean).join(', ') || g.address || '—';
              const contact=g.phone || g.email || '—';
              const owner=g.owner_name ? ' · '+g.owner_name : '';
              const gstin=g.gstin || 'Unregistered (Non-GST)';
              const plan=(g.plan||'lite').toLowerCase();
              const bays=g.bays || g.service_bays || '—';
              const staff=g.staff_count ? (g.staff_count + (g.max_staff ? '/'+g.max_staff : ' staff')) : '—';
              const status=(g.status||'active').toLowerCase();
              return '<tr>'+
                '<td><div style="font-weight:700;color:#0f172a">'+esc(name)+'</div><small class="muted">'+esc(location)+'</small></td>'+
                '<td><div style="font-size:12.5px">'+esc(contact)+'</div><small class="muted">'+esc(owner)+'</small></td>'+
                '<td><code style="font-size:11.5px">'+esc(gstin)+'</code></td>'+
                '<td><span class="admin-badge plan-'+esc(plan)+'">'+esc(plan.charAt(0).toUpperCase()+plan.slice(1))+'</span></td>'+
                '<td><div style="font-size:12px">'+esc(bays)+' bays</div><small class="muted">'+esc(staff)+'</small></td>'+
                '<td><span class="admin-badge status-'+esc(status)+'">'+esc(status.charAt(0).toUpperCase()+status.slice(1))+'</span></td>'+
                '<td style="text-align:right">'+
                  '<div style="display:flex;gap:6px;justify-content:flex-end">'+
                    (status==='pending'?'<button type="button" class="primary" style="padding:4px 8px;font-size:12px" onclick="updateAdminGarageStatus(\''+esc(gid)+'\',\'active\')">Verify</button>':
                     status==='active'?'<button type="button" class="ghost" style="padding:4px 8px;font-size:12px;color:#dc2626" onclick="updateAdminGarageStatus(\''+esc(gid)+'\',\'suspended\')">Suspend</button>':
                     '<button type="button" class="ghost" style="padding:4px 8px;font-size:12px;color:#16a34a" onclick="updateAdminGarageStatus(\''+esc(gid)+'\',\'active\')">Reactivate</button>')+
                  '</div>'+
                '</td>'+
              '</tr>';
            }).join('')+
          '</tbody>'+
        '</table>'+
      '</div>';
    }
  }else{
    bodyContent='<div class="admin-card" style="text-align:center;padding:28px">'+
      '<p class="muted" style="margin-bottom:12px">Independent workshop partner directory and onboarding requests.</p>'+
      '<button type="button" class="primary" onclick="loadAdminGarages(true)">Fetch Garages (GET /api/admin/garages)</button>'+
    '</div>';
  }

  return '<div class="admin-screen-shell">'+
    '<div class="admin-screen-header">'+
      '<div>'+
        '<h2>Garage Network &amp; Workshop Partners</h2>'+
        '<p class="muted">Review onboarding submissions, monitor garage subscriptions, and manage workshop capabilities.</p>'+
      '</div>'+
      '<div style="display:flex;gap:8px">'+
        '<button type="button" class="ghost" onclick="loadAdminGarages(true)">↻ Refresh Garages</button>'+
      '</div>'+
    '</div>'+
    '<div class="admin-controls-bar">'+
      '<div class="admin-filter-tabs">'+
        '<button type="button" class="admin-filter-pill '+(adminGaragesFilter==='all'?'active':'')+'" onclick="adminGaragesFilter=\'all\';renderAdminViewContent()">All Garages</button>'+
        '<button type="button" class="admin-filter-pill '+(adminGaragesFilter==='active'?'active':'')+'" onclick="adminGaragesFilter=\'active\';renderAdminViewContent()">Active / Verified</button>'+
        '<button type="button" class="admin-filter-pill '+(adminGaragesFilter==='pending'?'active':'')+'" onclick="adminGaragesFilter=\'pending\';renderAdminViewContent()">Pending Verification</button>'+
        '<button type="button" class="admin-filter-pill '+(adminGaragesFilter==='suspended'?'active':'')+'" onclick="adminGaragesFilter=\'suspended\';renderAdminViewContent()">Suspended</button>'+
      '</div>'+
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+
        '<input type="text" class="admin-search-input" placeholder="Search workshop name, city, GSTIN..." value="'+esc(adminGaragesSearch)+'" oninput="adminGaragesSearch=this.value;renderAdminViewContent()">'+
      '</div>'+
    '</div>'+
    bodyContent+
  '</div>';
}

function renderScreenTeam(){
  let bodyContent='';
  if(adminTeamLoading){
    bodyContent='<div class="admin-card" style="text-align:center;padding:36px"><span class="spinner-sm"></span> Loading team members from <code>GET /api/admin/team/members</code>...</div>';
  }else if(adminTeamError){
    bodyContent=renderAdminBlockedCard('/api/admin/team/members','GET',adminTeamError?.message||'Team roster endpoint unavailable (404).');
  }else if(adminTeamList){
    bodyContent='<div class="admin-table-container">'+
      '<table class="admin-data-table">'+
        '<thead>'+
          '<tr>'+
            '<th>Admin Member</th>'+
            '<th>Role</th>'+
            '<th>Status</th>'+
            '<th>Last Login</th>'+
            '<th style="text-align:right">Action</th>'+
          '</tr>'+
        '</thead>'+
        '<tbody>'+
          adminTeamList.map(m=>{
            const isPrimary=Boolean(m.is_owner || m.is_primary || m.role === 'owner');
            return '<tr>'+
              '<td><div style="font-weight:700">'+esc(m.name||'Admin')+'</div><small class="muted">'+esc(m.email||'—')+'</small></td>'+
              '<td><span class="admin-badge">'+esc(m.role||'super_admin')+'</span></td>'+
              '<td><span class="admin-badge status-'+esc(m.status||'active')+'">'+esc(m.status||'Active')+'</span></td>'+
              '<td style="color:#64748b">'+esc(formatAdminDate(m.last_login_at||m.created_at))+'</td>'+
              '<td style="text-align:right">'+
                (isPrimary?'<span class="muted" style="font-size:12px">Owner Protected</span>':
                  '<button type="button" class="ghost" style="padding:4px 10px;font-size:12px;color:#dc2626" onclick="revokeTeamMember(\''+esc(m.id)+'\')">Revoke Access</button>')+
              '</td>'+
            '</tr>';
          }).join('')+
        '</tbody>'+
      '</table>'+
    '</div>';
  }else{
    bodyContent='<div class="admin-card" style="text-align:center;padding:28px">'+
      '<p class="muted" style="margin-bottom:12px">Administrative team roster with role-based access control.</p>'+
      '<button type="button" class="primary" onclick="loadAdminTeam(true)">Fetch Team (GET /api/admin/team/members)</button>'+
    '</div>';
  }

  return '<div class="admin-screen-shell">'+
    '<div class="admin-screen-header">'+
      '<div>'+
        '<h2>Team &amp; Access Control</h2>'+
        '<p class="muted">Manage administrative staff, role permissions, MFA compliance, and session controls.</p>'+
      '</div>'+
      '<div style="display:flex;gap:8px">'+
        '<button type="button" class="ghost" onclick="loadAdminTeam(true)">↻ Refresh Team</button>'+
        '<button type="button" class="primary" onclick="openTeamInviteModal()">+ Invite Member</button>'+
      '</div>'+
    '</div>'+
    '<div class="admin-card" style="border-left:4px solid #3b82f6">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:gap:12px">'+
        '<div>'+
          '<b style="font-size:14px">Primary Owner Account Protection</b>'+
          '<p class="muted" style="margin:2px 0 0;font-size:12px">Primary workspace owner account is protected from administrative revocation or demotion.</p>'+
        '</div>'+
        '<span class="admin-badge" style="background:#dbeafe;color:#1e40af">Primary Owner (Immutable)</span>'+
      '</div>'+
    '</div>'+
    bodyContent+
  '</div>';
}

function renderScreenAudit(){
  let bodyContent='';
  if(adminAuditLoading){
    bodyContent='<div class="admin-card" style="text-align:center;padding:36px"><span class="spinner-sm"></span> Loading audit log from <code>GET /api/admin/audit</code>...</div>';
  }else if(adminAuditError){
    bodyContent=renderAdminBlockedCard('/api/admin/audit','GET',adminAuditError?.message||'Audit trail endpoint unavailable (404).');
  }else if(adminAuditList){
    const filtered=adminAuditList.filter(ev=>{
      if(adminAuditActorFilter!=='all'&&ev.actor!==adminAuditActorFilter)return false;
      if(adminAuditActionFilter!=='all'&&ev.action!==adminAuditActionFilter)return false;
      return true;
    });

    if(filtered.length===0){
      bodyContent='<div class="admin-empty-state"><p class="muted">No audit events match current filter.</p></div>';
    }else{
      bodyContent='<div class="admin-table-container">'+
        '<table class="admin-data-table">'+
          '<thead>'+
            '<tr>'+
              '<th>Timestamp (IST)</th>'+
              '<th>Actor</th>'+
              '<th>Action</th>'+
              '<th>Resource / Target</th>'+
              '<th>Client IP</th>'+
              '<th>Status</th>'+
            '</tr>'+
          '</thead>'+
          '<tbody>'+
            filtered.map(ev=>'<tr>'+
              '<td style="white-space:nowrap;color:#64748b">'+esc(formatAdminDate(ev.timestamp||ev.created_at))+'</td>'+
              '<td><code style="color:#2563eb">'+esc(ev.actor||'—')+'</code></td>'+
              '<td><code>'+esc(ev.action||'—')+'</code></td>'+
              '<td>'+esc(ev.resource||ev.target||'—')+'</td>'+
              '<td><code>'+esc(ev.ip_address||ev.client_ip||'—')+'</code></td>'+
              '<td><span class="admin-badge status-'+esc(ev.status==='failure'?'danger':'active')+'">'+esc(ev.status||'Success')+'</span></td>'+
            '</tr>').join('')+
          '</tbody>'+
        '</table>'+
      '</div>';
    }
  }else{
    bodyContent='<div class="admin-card" style="text-align:center;padding:28px">'+
      '<p class="muted" style="margin-bottom:12px">Append-only privileged action log stored in D1 database.</p>'+
      '<button type="button" class="primary" onclick="loadAdminAudit(true)">Fetch Audit Log (GET /api/admin/audit)</button>'+
    '</div>';
  }

  return '<div class="admin-screen-shell">'+
    '<div class="admin-screen-header">'+
      '<div>'+
        '<h2>Cryptographic Security &amp; Audit Log</h2>'+
        '<p class="muted">Append-only ledger of privileged administrative events, permission changes, and access sessions.</p>'+
      '</div>'+
      '<div style="display:flex;gap:8px">'+
        '<button type="button" class="ghost" onclick="loadAdminAudit(true)">↻ Refresh Audit</button>'+
        '<button type="button" class="ghost" onclick="exportAuditCsv()">📥 Export Audit CSV</button>'+
      '</div>'+
    '</div>'+
    '<div class="admin-card" style="border-left:4px solid #f59e0b">'+
      '<b style="font-size:13px">Immutable Audit Guarantee</b>'+
      '<p class="muted" style="margin:2px 0 0;font-size:12px">Records are cryptographically timestamped and write-once. Deletion or modification is blocked at the database engine level.</p>'+
    '</div>'+
    bodyContent+
  '</div>';
}

function renderScreenContent(){
  return '<div class="admin-screen-shell">'+
    '<div class="admin-screen-header">'+
      '<div>'+
        '<h2>Public Content &amp; Site Policy Editor</h2>'+
        '<p class="muted">Update About Torq Desk, Terms &amp; Conditions, Contact information, and Emergency Maintenance Banner.</p>'+
      '</div>'+
    '</div>'+
    renderAdminPhaseCard('Phase 7 — Content & Site Policy', '/api/admin/content', 'GET / PUT', 'Public site CMS, About Torq Desk, statutory Terms of Service, Privacy Policy, and emergency maintenance gate toggle.')+
  '</div>';
}

function renderScreenSettings(){
  return '<div class="admin-screen-shell">'+
    '<div class="admin-screen-header">'+
      '<div>'+
        '<h2>Platform Settings &amp; Administrative Security</h2>'+
        '<p class="muted">Configure session timeouts, admin credentials, MFA parameters, and infrastructure health.</p>'+
      '</div>'+
    '</div>'+
    renderAdminPhaseCard('Phase 7 — Platform Settings', '/api/admin/settings', 'GET / PATCH', 'CIDR IP allowlisting, global maintenance flag, notification webhooks, and 15-minute session guard configuration.')+
  '</div>';
}

function renderScreenReports(){
  return '<div class="admin-screen-shell">'+
    '<div class="admin-screen-header">'+
      '<div>'+
        '<h2>Platform Analytics &amp; Compliance Exports</h2>'+
        '<p class="muted">Monitor registration growth, vehicle addition trends, support SLAs, and generate compliance exports.</p>'+
      '</div>'+
    '</div>'+
    '<div class="admin-card">'+
      '<div class="admin-card-head"><h3>Compliance &amp; Data Export Center</h3><p class="muted">Download authoritative CSV files for auditing, accounting, and compliance.</p></div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-top:14px">'+
        '<button type="button" class="ghost" style="padding:16px;text-align:left;height:auto;display:flex;flex-direction:column;gap:6px" onclick="exportUsersCsv()">'+
          '<b>📥 Export Users Directory</b><span class="muted" style="font-size:12px">Calls GET /api/admin/users/export.csv</span>'+
        '</button>'+
        '<button type="button" class="ghost" style="padding:16px;text-align:left;height:auto;display:flex;flex-direction:column;gap:6px" onclick="exportTicketsCsv()">'+
          '<b>📥 Export Support Tickets</b><span class="muted" style="font-size:12px">Calls GET /api/admin/tickets/export.csv</span>'+
        '</button>'+
        '<button type="button" class="ghost" style="padding:16px;text-align:left;height:auto;display:flex;flex-direction:column;gap:6px" onclick="exportAuditCsv()">'+
          '<b>📥 Export Security Audit Log</b><span class="muted" style="font-size:12px">Calls GET /api/admin/audit/export.csv</span>'+
        '</button>'+
      '</div>'+
    '</div>'+
    renderAdminPhaseCard('Phase 7 — Platform Analytics & Reports', '/api/admin/reports/analytics', 'GET', 'Registration cohort analytics, vehicle growth trends, ticket SLA resolution times, and compliance ledger archives.')+
  '</div>';
}

function renderScreenAdminAccount(){
  return '<div class="admin-screen-shell admin-account-shell">'+
    '<div class="admin-screen-header">'+
      '<div>'+
        '<h2>Admin Account &amp; Platform Security</h2>'+
        '<p class="muted">Manage administrative credentials, review profile metadata, and inspect session controls.</p>'+
      '</div>'+
      '<div class="admin-timeout-badge" id="adminSessionTimeoutBadge">'+
        '⏱️ Admin Inactivity Timeout: 15 Minutes (Read-Only)'+
      '</div>'+
    '</div>'+
    '<div class="admin-account-grid">'+
      '<div class="admin-account-card" id="adminProfileCardContainer">'+
        renderAdminProfileCardInner()+
      '</div>'+

      '<div class="admin-account-card">'+
        '<div class="admin-card-head">'+
          '<h3>Change Administrative Password</h3>'+
          '<p class="muted">Requires server confirmation before success is reported.</p>'+
        '</div>'+
        '<form id="adminChangePasswordForm" onsubmit="event.preventDefault();handleAdminPasswordChange();" style="display:flex;flex-direction:column;gap:12px;margin-top:12px">'+
          '<div class="field">'+
            '<label for="adminCurrentPassword">Current Password</label>'+
            '<input type="password" id="adminCurrentPassword" autocomplete="current-password" required placeholder="Enter current password">'+
          '</div>'+
          '<div class="field">'+
            '<label for="adminNewPassword">New Password</label>'+
            '<input type="password" id="adminNewPassword" autocomplete="new-password" required placeholder="Minimum 8 characters" oninput="updateAdminPasswordMeter(this.value)">'+
            '<div class="admin-password-meter"><div id="adminPasswordMeterFill" class="admin-password-meter-fill"></div></div>'+
            '<div id="adminPasswordFeedback" class="admin-password-feedback">Strength: None</div>'+
          '</div>'+
          '<div class="field">'+
            '<label for="adminConfirmPassword">Confirm New Password</label>'+
            '<input type="password" id="adminConfirmPassword" autocomplete="new-password" required placeholder="Re-type new password">'+
          '</div>'+
          '<div id="adminPasswordError" class="admin-blocked-card" style="display:none;padding:10px;margin:4px 0 0 0;font-size:12.5px"></div>'+
          '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px">'+
            '<button type="submit" id="btnAdminChangePassword" class="primary" style="padding:8px 16px">Update Password</button>'+
          '</div>'+
        '</form>'+
      '</div>'+

      '<div class="admin-account-card" id="adminTpinCardContainer">'+
        renderTpinAccountCardInner()+
      '</div>'+

      '<div class="admin-account-card">'+
        '<div class="admin-card-head">'+
          '<h3>Session Security &amp; Timeout Policy</h3>'+
          '<p class="muted">Immutable server-enforced inactivity standard.</p>'+
        '</div>'+
        '<div style="margin-top:12px;display:flex;flex-direction:column;gap:10px;font-size:13px">'+
          '<div class="admin-profile-meta-row">'+
            '<span class="muted">Timeout Duration</span>'+
            '<b>15 Minutes (900 Seconds)</b>'+
          '</div>'+
          '<div class="admin-profile-meta-row">'+
            '<span class="muted">Heartbeat Enforcement</span>'+
            '<span>Worker Server Time</span>'+
          '</div>'+
          '<div class="admin-profile-meta-row">'+
            '<span class="muted">Tampering Defense</span>'+
            '<span class="admin-badge status-active">Client Headers Ignored</span>'+
          '</div>'+
          '<div style="margin-top:8px">'+
            '<button type="button" class="ghost" style="width:100%;color:#dc2626;border-color:#fecdd3" onclick="adminSignOut()">Sign Out of Admin Console</button>'+
          '</div>'+
        '</div>'+
      '</div>'+
    '</div>'+
  '</div>';
}

function updateAdminPasswordMeter(val){
  const fill=$('adminPasswordMeterFill');
  const fb=$('adminPasswordFeedback');
  if(!fill||!fb)return;
  if(!val){
    fill.className='admin-password-meter-fill';
    fill.style.width='0%';
    fb.textContent='Strength: None';
    fb.style.color='#64748b';
    return;
  }
  let score=0;
  if(val.length>=8)score++;
  if(val.length>=12)score++;
  if(/[0-9]/.test(val))score++;
  if(/[^A-Za-z0-9]/.test(val))score++;
  if(/[A-Z]/.test(val)&&/[a-z]/.test(val))score++;

  if(score<=2){
    fill.className='admin-password-meter-fill weak';
    fb.textContent='Strength: Weak (Needs 8+ chars, numbers or symbols)';
    fb.style.color='#ef4444';
  }else if(score<=3){
    fill.className='admin-password-meter-fill medium';
    fb.textContent='Strength: Medium (Acceptable)';
    fb.style.color='#f59e0b';
  }else{
    fill.className='admin-password-meter-fill strong';
    fb.textContent='Strength: Strong';
    fb.style.color='#10b981';
  }
}

async function handleAdminPasswordChange(){
  const curInput=$('adminCurrentPassword');
  const newInput=$('adminNewPassword');
  const confirmInput=$('adminConfirmPassword');
  const btn=$('btnAdminChangePassword');
  const errBox=$('adminPasswordError');

  const curPass=curInput?.value||'';
  const newPass=newInput?.value||'';
  const confirmPass=confirmInput?.value||'';

  if(errBox)errBox.style.display='none';

  if(!curPass){
    if(errBox){
      errBox.textContent='Current password is required.';
      errBox.style.display='block';
    }
    toast('Current password is required.','error');
    return;
  }
  if(!newPass||newPass.length<8){
    if(errBox){
      errBox.textContent='New password must be at least 8 characters long.';
      errBox.style.display='block';
    }
    toast('New password must be at least 8 characters long.','error');
    return;
  }
  if(newPass!==confirmPass){
    if(errBox){
      errBox.textContent='New password and confirm password do not match.';
      errBox.style.display='block';
    }
    toast('New password and confirm password do not match.','error');
    return;
  }

  if(btn){
    btn.disabled=true;
    btn.textContent='Changing Password...';
  }

  try{
    let ok=false;
    let serverErr=null;
    if(db&&db.auth&&typeof db.auth.updateUser==='function'){
      const res=await db.auth.updateUser({password:newPass});
      if(res?.error){
        serverErr=res.error.message;
      }else{
        ok=true;
      }
    }else{
      try{
        const res=await workerPost('/api/admin/change-password',{current_password:curPass,new_password:newPass});
        if(res&&res.ok)ok=true;
        else serverErr=res?.error?.message||'Server rejected password update.';
      }catch(e){
        serverErr=e?.message||'Password change service unavailable.';
      }
    }

    if(!ok){
      throw new Error(serverErr||'Password change failed.');
    }

    toast('Password changed','ok');
    if(curInput)curInput.value='';
    if(newInput)newInput.value='';
    if(confirmInput)confirmInput.value='';
    updateAdminPasswordMeter('');
  }catch(err){
    if(errBox){
      errBox.textContent=err?.message||'Password update failed.';
      errBox.style.display='block';
    }
    toast(err?.message||'Password change failed.','error');
  }finally{
    if(btn){
      btn.disabled=false;
      btn.textContent='Update Password';
    }
  }
}

function renderAdminProfileCardInner(){
  if(teamMeLoading){
    return '<div class="admin-card-head">'+
      '<h3>Administrator Profile</h3>'+
      '<p class="muted">Authoritative identity verified by backend role registry.</p>'+
    '</div>'+
    '<div style="padding:24px;text-align:center"><span class="spinner-sm"></span> Loading profile from <code>GET /api/team/me</code>...</div>';
  }
  if(teamMeError){
    return '<div class="admin-card-head">'+
      '<h3>Administrator Profile</h3>'+
      '<p class="muted">Authoritative identity verified by backend role registry.</p>'+
    '</div>'+
    renderAdminBlockedCard('/api/team/me','GET',teamMeError?.message||'Admin team profile endpoint unavailable (404).');
  }
  const perms=getAdminRolePermissions(currentAdminRole);
  const email=user?.email||currentAdminProfile?.email||'admin@carmy.internal';
  const name=currentAdminProfile?.name||currentAdminProfile?.full_name||user?.user_metadata?.name||'Administrator';
  return '<div class="admin-card-head">'+
    '<h3>Administrator Profile</h3>'+
    '<p class="muted">Authoritative identity verified by backend role registry.</p>'+
  '</div>'+
  '<div class="admin-profile-meta">'+
    '<div class="admin-profile-meta-row">'+
      '<span class="muted">Name</span>'+
      '<b id="adminProfileNameDisplay">'+esc(name)+'</b>'+
    '</div>'+
    '<div class="admin-profile-meta-row">'+
      '<span class="muted">Email</span>'+
      '<span id="adminProfileEmailDisplay" style="font-family:monospace;font-weight:600;color:#2563eb">'+esc(email)+'</span>'+
    '</div>'+
    '<div class="admin-profile-meta-row">'+
      '<span class="muted">Role Clearance</span>'+
      '<span id="adminProfileRoleBadge" class="admin-badge team-role-badge role-'+esc(perms.role.replace('_','-'))+'">'+esc(perms.label)+'</span>'+
    '</div>'+
    '<div class="admin-profile-meta-row">'+
      '<span class="muted">MFA Verification</span>'+
      '<span class="admin-badge status-active">Enforced (Session Guard)</span>'+
    '</div>'+
    '<div class="admin-profile-meta-row">'+
      '<span class="muted">Account Status</span>'+
      '<span class="admin-badge status-active">Active</span>'+
    '</div>'+
  '</div>'+
  '<div style="margin-top:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;font-size:12px;color:#64748b">'+
    '🔒 Profile metadata is read-only and governed by server directory. Password change below applies immediately to authenticated sessions.'+
  '</div>';
}

function getAdminRolePermissions(role){
  const normRole=(role||'').toLowerCase().trim();
  if(normRole==='support_lead'||normRole==='support'){
    return {
      role:'support_lead',
      label:'Support Lead',
      allowedScreens:['home','tickets','account'],
      canMutateTickets:true,
      canViewAudit:false,
      canManageUsers:false,
      canManageTokens:false,
      canManagePlans:false,
      canManageGarages:false,
      canManageTeam:false,
      defaultScreen:'tickets'
    };
  }
  if(normRole==='billing_admin'||normRole==='billing'){
    return {
      role:'billing_admin',
      label:'Billing Admin',
      allowedScreens:['home','plans','tokens','upgrades','account'],
      canMutateTickets:false,
      canViewAudit:false,
      canManageUsers:false,
      canManageTokens:true,
      canManagePlans:true,
      canManageGarages:false,
      canManageTeam:false,
      defaultScreen:'plans'
    };
  }
  if(normRole==='auditor'){
    return {
      role:'auditor',
      label:'Auditor',
      allowedScreens:['home','audit','tickets','account'],
      canMutateTickets:false,
      canViewAudit:true,
      canManageUsers:false,
      canManageTokens:false,
      canManagePlans:false,
      canManageGarages:false,
      canManageTeam:false,
      defaultScreen:'audit'
    };
  }
  return {
    role:normRole==='owner'?'owner':'super_admin',
    label:normRole==='owner'?'Owner / Super Admin':'Super Admin',
    allowedScreens:['home','users','tokens','plans','upgrades','tickets','garages','team','audit','content','settings','reports','account'],
    canMutateTickets:true,
    canViewAudit:true,
    canManageUsers:true,
    canManageTokens:true,
    canManagePlans:true,
    canManageGarages:true,
    canManageTeam:true,
    defaultScreen:'home'
  };
}

async function loadTeamMe(force=false){
  if(teamMeLoading)return currentAdminProfile;
  if(currentAdminProfile&&!force)return currentAdminProfile;
  teamMeLoading=true;
  teamMeError=null;
  try{
    const res=await workerGet('/api/team/me');
    if(res){
      currentAdminProfile=res.profile||res;
      if(res.role){
        currentAdminRole=res.role;
      }else if(currentAdminProfile.role){
        currentAdminRole=currentAdminProfile.role;
      }
      return currentAdminProfile;
    }
  }catch(err){
    teamMeError=err;
    console.warn('loadTeamMe notice:',err);
  }finally{
    teamMeLoading=false;
    const cardEl=$('adminProfileCardContainer');
    if(cardEl)cardEl.innerHTML=renderAdminProfileCardInner();
    wireAdminAccountSecurityForm();
  }
  return null;
}

function checkForcedPasswordChange(){
  let old=document.getElementById('forcedPasswordOverlay');
  if(old)old.remove();
  const req=Boolean(currentAdminProfile?.password_change_required||currentAdminProfile?.temp_password_active);
  if(!req)return false;

  const overlay=document.createElement('div');
  overlay.id='forcedPasswordOverlay';
  overlay.className='admin-forced-overlay';
  overlay.innerHTML='<div class="admin-forced-box">'+
    '<div style="text-align:center">'+
      '<div style="font-size:36px;margin-bottom:8px">🔒</div>'+
      '<h2 style="margin:0 0 8px 0;font-size:20px;font-weight:800;color:#0f172a">First-Login Password Required</h2>'+
      '<p class="muted" style="margin:0;font-size:13px;line-height:1.5">'+
        'Your administrative account is flagged with a temporary password. You must set a permanent password before accessing console workspaces.'+
      '</p>'+
    '</div>'+
    '<form id="forcedPasswordForm" onsubmit="event.preventDefault();submitForcedPasswordChange();" style="display:flex;flex-direction:column;gap:14px">'+
      '<div class="field">'+
        '<label for="forcedNewPassword" style="font-size:12.5px;font-weight:700">New Secure Password</label>'+
        '<input type="password" id="forcedNewPassword" autocomplete="new-password" required minlength="8" placeholder="Minimum 8 characters" oninput="updateAdminPasswordMeter(this.value)">'+
        '<div class="admin-password-meter"><div id="adminPasswordMeterFill" class="admin-password-meter-fill"></div></div>'+
        '<div id="adminPasswordFeedback" class="admin-password-feedback">Strength: None</div>'+
      '</div>'+
      '<div class="field">'+
        '<label for="forcedConfirmPassword" style="font-size:12.5px;font-weight:700">Confirm New Password</label>'+
        '<input type="password" id="forcedConfirmPassword" autocomplete="new-password" required minlength="8" placeholder="Re-type new password">'+
      '</div>'+
      '<div id="forcedPasswordError" class="admin-blocked-card" style="display:none;padding:10px;margin:0;font-size:12.5px"></div>'+
      '<button type="submit" id="btnSubmitForcedPassword" class="primary" style="padding:12px;font-weight:700;font-size:14px;border-radius:10px;margin-top:6px">Set Password &amp; Proceed</button>'+
    '</form>'+
  '</div>';
  document.body.appendChild(overlay);
  return true;
}

async function submitForcedPasswordChange(){
  const newIn=$('forcedNewPassword');
  const confIn=$('forcedConfirmPassword');
  const errBox=$('forcedPasswordError');
  const btn=$('btnSubmitForcedPassword');

  const newPass=newIn?.value||'';
  const confPass=confIn?.value||'';

  if(errBox)errBox.style.display='none';

  if(!newPass||newPass.length<8){
    if(errBox){
      errBox.textContent='Password must be at least 8 characters.';
      errBox.style.display='block';
    }
    toast('Password must be at least 8 characters.','error');
    return;
  }
  if(newPass!==confPass){
    if(errBox){
      errBox.textContent='Passwords do not match.';
      errBox.style.display='block';
    }
    toast('Passwords do not match.','error');
    return;
  }

  if(btn){
    btn.disabled=true;
    btn.textContent='Setting Password...';
  }

  try{
    let ok=false;
    let serverErr=null;
    if(db&&db.auth&&typeof db.auth.updateUser==='function'){
      const res=await db.auth.updateUser({password:newPass});
      if(res?.error){
        serverErr=res.error.message;
      }else{
        ok=true;
      }
    }else{
      try{
        const res=await workerPost('/api/admin/change-password',{new_password:newPass});
        if(res&&res.ok)ok=true;
        else serverErr=res?.error?.message||'Server rejected password update.';
      }catch(e){
        serverErr=e?.message||'Password change service unavailable.';
        if(errBox){
          errBox.innerHTML=renderAdminBlockedCard('/api/admin/change-password','POST',e?.message||'Password change service unavailable.');
          errBox.style.display='block';
          return;
        }
      }
    }

    if(!ok){
      throw new Error(serverErr||'Password change failed.');
    }

    if(currentAdminProfile){
      currentAdminProfile.password_change_required=false;
      currentAdminProfile.temp_password_active=false;
    }
    const overlay=document.getElementById('forcedPasswordOverlay');
    if(overlay)overlay.remove();

    toast('Administrative password established successfully.','ok');
    checkForcedProfileCompletion();
  }catch(err){
    if(errBox){
      errBox.textContent=err?.message||'Password change failed.';
      errBox.style.display='block';
    }
    toast(err?.message||'Password change failed.','error');
  }finally{
    if(newIn)newIn.value='';
    if(confIn)confIn.value='';
    if(btn){
      btn.disabled=false;
      btn.textContent='Set Password & Proceed';
    }
  }
}

function checkForcedProfileCompletion(){
  let old=document.getElementById('forcedProfileOverlay');
  if(old)old.remove();
  const req=Boolean(currentAdminProfile?.profile_incomplete);
  if(!req)return false;

  const overlay=document.createElement('div');
  overlay.id='forcedProfileOverlay';
  overlay.className='admin-forced-overlay';
  overlay.innerHTML='<div class="admin-forced-box">'+
    '<div style="text-align:center">'+
      '<div style="font-size:36px;margin-bottom:8px">👤</div>'+
      '<h2 style="margin:0 0 8px 0;font-size:20px;font-weight:800;color:#0f172a">Complete Specialist Profile</h2>'+
      '<p class="muted" style="margin:0;font-size:13px;line-height:1.5">'+
        'Please enter your administrative full name and 10-digit mobile number for verified audit tracking.'+
      '</p>'+
    '</div>'+
    '<form id="forcedProfileForm" onsubmit="event.preventDefault();submitForcedProfileCompletion();" style="display:flex;flex-direction:column;gap:14px">'+
      '<div class="field">'+
        '<label for="forcedProfileName" style="font-size:12.5px;font-weight:700">Full Name</label>'+
        '<input type="text" id="forcedProfileName" required placeholder="e.g. Rahul Sharma" value="'+esc(currentAdminProfile?.name||currentAdminProfile?.full_name||'')+'">'+
      '</div>'+
      '<div class="field">'+
        '<label for="forcedProfilePhone" style="font-size:12.5px;font-weight:700">Mobile Phone (10 digits)</label>'+
        '<input type="tel" id="forcedProfilePhone" required placeholder="e.g. 9816012345" value="'+esc(currentAdminProfile?.phone||'')+'">'+
      '</div>'+
      '<div id="forcedProfileError" class="admin-blocked-card" style="display:none;padding:10px;margin:0;font-size:12.5px"></div>'+
      '<button type="submit" id="btnSubmitForcedProfile" class="primary" style="padding:12px;font-weight:700;font-size:14px;border-radius:10px;margin-top:6px">Complete Profile &amp; Proceed</button>'+
    '</form>'+
  '</div>';
  document.body.appendChild(overlay);
  return true;
}

async function submitForcedProfileCompletion(){
  const nameIn=$('forcedProfileName');
  const phoneIn=$('forcedProfilePhone');
  const errBox=$('forcedProfileError');
  const btn=$('btnSubmitForcedProfile');

  const fullName=nameIn?.value?.trim()||'';
  const phone=phoneIn?.value?.trim().replace(/\D/g,'')||'';

  if(errBox)errBox.style.display='none';

  if(!fullName){
    if(errBox){
      errBox.textContent='Full name is required.';
      errBox.style.display='block';
    }
    toast('Full name is required.','error');
    return;
  }
  if(!phone||phone.length<10){
    if(errBox){
      errBox.textContent='Valid 10-digit mobile phone number is required.';
      errBox.style.display='block';
    }
    toast('Valid 10-digit mobile phone number is required.','error');
    return;
  }

  if(btn){
    btn.disabled=true;
    btn.textContent='Saving Profile...';
  }

  try{
    const res=await workerPost('/api/team/me/profile',{full_name:fullName,phone:phone});
    if(currentAdminProfile){
      currentAdminProfile.name=fullName;
      currentAdminProfile.full_name=fullName;
      currentAdminProfile.phone=phone;
      currentAdminProfile.profile_incomplete=false;
    }
    const overlay=document.getElementById('forcedProfileOverlay');
    if(overlay)overlay.remove();

    toast('Specialist profile completed.','ok');
    wireAdminAccountSecurityForm();
  }catch(err){
    if(errBox){
      errBox.innerHTML=renderAdminBlockedCard('/api/team/me/profile','POST',err?.message||'Profile completion endpoint unavailable (404).');
      errBox.style.display='block';
    }
    toast(err?.message||'Profile update failed.','error');
  }finally{
    if(btn){
      btn.disabled=false;
      btn.textContent='Complete Profile & Proceed';
    }
  }
}

function wireAdminAccountSecurityForm(){
  const perms=getAdminRolePermissions(currentAdminRole);
  const nameEl=$('adminProfileNameDisplay');
  const emailEl=$('adminProfileEmailDisplay');
  const roleEl=$('adminProfileRoleBadge');
  const topbarEmailEl=$('adminTopbarEmail');
  const email=user?.email||currentAdminProfile?.email||'admin@carmy.internal';
  const name=currentAdminProfile?.name||currentAdminProfile?.full_name||user?.user_metadata?.name||'Administrator';
  if(nameEl)nameEl.textContent=name;
  if(emailEl)emailEl.textContent=email;
  if(roleEl){
    roleEl.textContent=perms.label;
    roleEl.className='admin-badge team-role-badge role-'+perms.role.replace('_','-');
  }
  if(topbarEmailEl)topbarEmailEl.textContent=email;
}

async function adminSignOut(){
  if(window.__carmyAdminSigningOut)return;
  window.__carmyAdminSigningOut=true;
  try{
    try{
      await workerPost('/api/session/revoke',{});
    }catch(err){
      console.warn('Worker session revocation failed',err);
    }
    try{if(db&&db.auth&&typeof db.auth.signOut==='function')await db.auth.signOut({scope:'global'});}catch(_){}
    try{
      for(let i=localStorage.length-1;i>=0;i--){
        const key=localStorage.key(i);
        if(key&&(key.startsWith('sb-')||key.startsWith('carmy_')||key.startsWith('td-admin-')||key==='carcare_last_view'))localStorage.removeItem(key);
      }
    }catch(_){}
    try{
      for(let i=sessionStorage.length-1;i>=0;i--){
        const key=sessionStorage.key(i);
        if(key&&(key.startsWith('sb-')||key.startsWith('carmy_')||key.startsWith('td-admin-')))sessionStorage.removeItem(key);
      }
    }catch(_){}
    isSuperAdmin=false;
    currentAdminRole=null;
    currentAdminProfile=null;
    document.body.classList.remove('td-admin-mode');
    clearUserMemory();
    if(typeof location!=='undefined'&&typeof location.replace==='function'){
      location.replace('./?admin=1&signed_out=1');
    }
  }finally{
    window.__carmyAdminSigningOut=false;
  }
}
window.adminSignOut=adminSignOut;
window.handleAdminPasswordChange=handleAdminPasswordChange;
window.updateAdminPasswordMeter=updateAdminPasswordMeter;
window.wireAdminAccountSecurityForm=wireAdminAccountSecurityForm;

/* ===== Phase 4: Administrative TPIN UI & Verification ===== */

function renderTpinAccountCardInner(){
  if(adminTpinLoading){
    return '<div class="admin-card-head">'+
      '<h3>Administrative TPIN</h3>'+
      '<p class="muted">Cryptographic 4-digit PIN for high-privilege operations.</p>'+
    '</div>'+
    '<div style="text-align:center;padding:16px"><span class="spinner-sm"></span> Loading TPIN security status...</div>';
  }
  if(adminTpinError){
    return '<div class="admin-card-head">'+
      '<h3>Administrative TPIN</h3>'+
      '<p class="muted">Cryptographic 4-digit PIN for high-privilege operations.</p>'+
    '</div>'+
    renderAdminBlockedCard('/api/tpin/status','GET',adminTpinError.message||'TPIN status endpoint unavailable (404).');
  }
  const isSet=Boolean(adminTpinStatus?.is_set);
  const isLocked=Boolean(adminTpinStatus?.locked_until&&new Date(adminTpinStatus.locked_until)>new Date());

  if(isLocked){
    const lockedUntilStr=formatAdminDate(adminTpinStatus.locked_until);
    return '<div class="admin-card-head">'+
      '<div>'+
        '<h3>Administrative TPIN</h3>'+
        '<p class="muted">Cryptographic 4-digit PIN for high-privilege operations.</p>'+
      '</div>'+
      '<span class="tpin-status-pill danger">TEMPORARILY LOCKED</span>'+
    '</div>'+
    '<div class="tpin-lockout-card" style="margin-top:12px">'+
      '<b>Account Security Lockout Active</b>'+
      '<p style="margin:4px 0 0">Too many failed TPIN attempts. Administrative operations are locked until '+esc(lockedUntilStr)+'. Use email reset or wait for timer expiry.</p>'+
    '</div>'+
    '<div style="margin-top:12px;display:flex;gap:10px">'+
      '<button type="button" class="primary btn-sm" onclick="openTpinResetModal()">Reset TPIN via Email</button>'+
    '</div>';
  }

  return '<div class="admin-card-head">'+
    '<div>'+
      '<h3>Administrative TPIN</h3>'+
      '<p class="muted">Cryptographic 4-digit PIN required for token creation, member invites, and data exports.</p>'+
    '</div>'+
    '<div style="display:flex;align-items:center;gap:6px">'+
      '<span class="admin-badge" style="background:#fef3c7;color:#92400e">Phase 4 Specification</span>'+
      (isSet?'<span class="tpin-status-pill ok">● TPIN Active</span>':'<span class="tpin-status-pill warning">⚠️ Not Configured</span>')+
    '</div>'+
  '</div>'+
  '<div style="margin-top:12px;font-size:13px;color:#475569;line-height:1.5">'+
    (isSet?
      '<p>Your 4-digit Administrative TPIN is configured and actively safeguarding high-privilege actions. Never share your TPIN.</p>'+
      '<div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">'+
        '<button type="button" class="ghost btn-sm" id="btnChangeTpin" onclick="openTpinChangeModal()">Change TPIN</button>'+
        '<button type="button" class="ghost btn-sm" id="btnResetTpin" onclick="openTpinResetModal()">Forgot / Reset TPIN</button>'+
      '</div>':
      '<p>A verified 4-digit TPIN is mandatory prior to generating activation tokens, adding team members, or exporting sensitive CSV records.</p>'+
      '<div style="margin-top:14px;display:flex;gap:10px">'+
        '<button type="button" class="primary btn-sm" id="btnSetupTpin" onclick="openTpinSetupModal()">Set 4-Digit TPIN</button>'+
      '</div>'
    )+
  '</div>';
}

async function loadAdminTpinStatus(force=false){
  if(adminTpinLoading)return;
  adminTpinLoading=true;
  adminTpinError=null;
  const cont=document.getElementById('adminTpinCardContainer');
  if(cont&&force)cont.innerHTML=renderTpinAccountCardInner();
  try{
    const res=await workerGet('/api/tpin/status');
    adminTpinStatus=res?.data||res||{is_set:false};
    if(adminTpinStatus?.tpin_setup_required||adminTpinStatus?.tpin_change_required||user?.tpin_change_required){
      checkForcedTpinSetup();
    }
  }catch(err){
    adminTpinError=err?.status===404?{status:404,message:'Route /api/tpin/status returned 404'}:err;
  }finally{
    adminTpinLoading=false;
    const c=document.getElementById('adminTpinCardContainer');
    if(c)c.innerHTML=renderTpinAccountCardInner();
  }
}

function toggleTpinFieldVisibility(fieldId,btnEl){
  const field=document.getElementById(fieldId);
  if(!field)return;
  if(field.type==='password'){
    field.type='text';
    if(btnEl)btnEl.textContent='🙈';
  }else{
    field.type='password';
    if(btnEl)btnEl.textContent='👁️';
  }
}

function openTpinSetupModal(){
  let old=document.getElementById('tpinSetupModal');
  if(old)old.remove();

  const modal=document.createElement('div');
  modal.id='tpinSetupModal';
  modal.className='tpin-modal-overlay';
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');

  modal.innerHTML='<div class="tpin-modal-box">'+
    '<div class="admin-modal-head">'+
      '<div>'+
        '<h3 style="margin:0;font-size:17px">Configure Administrative TPIN</h3>'+
        '<p class="muted" style="margin:2px 0 0;font-size:12px">Set a secure 4-digit PIN for high-privilege authorizations.</p>'+
      '</div>'+
      '<button type="button" class="ghost" onclick="closeTpinSetupModal()">✕</button>'+
    '</div>'+
    '<form id="tpinSetupForm" onsubmit="event.preventDefault();submitTpinSetup();" style="display:flex;flex-direction:column;gap:14px">'+
      '<div class="field">'+
        '<label for="tpinSetupInput">Enter 4-Digit TPIN</label>'+
        '<div class="tpin-input-group">'+
          '<input type="password" id="tpinSetupInput" class="tpin-digit-box" maxlength="4" pattern="[0-9]{4}" inputmode="numeric" placeholder="••••" autocomplete="off" required>'+
          '<button type="button" class="tpin-toggle-btn" onclick="toggleTpinFieldVisibility(\'tpinSetupInput\',this)">👁️</button>'+
        '</div>'+
        '<small class="muted">4 numbers only (0-9). Avoid sequences like 1234 or repeated digits like 0000.</small>'+
      '</div>'+
      '<div class="field">'+
        '<label for="tpinSetupConfirm">Confirm 4-Digit TPIN</label>'+
        '<div class="tpin-input-group">'+
          '<input type="password" id="tpinSetupConfirm" class="tpin-digit-box" maxlength="4" pattern="[0-9]{4}" inputmode="numeric" placeholder="••••" autocomplete="off" required>'+
          '<button type="button" class="tpin-toggle-btn" onclick="toggleTpinFieldVisibility(\'tpinSetupConfirm\',this)">👁️</button>'+
        '</div>'+
      '</div>'+
      '<div id="tpinSetupError" style="display:none"></div>'+
      '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:6px">'+
        '<button type="button" class="ghost" onclick="closeTpinSetupModal()">Cancel</button>'+
        '<button type="submit" class="primary" id="btnSubmitTpinSetup">Save TPIN</button>'+
      '</div>'+
    '</form>'+
  '</div>';

  modal.onclick=e=>{if(e.target===modal)closeTpinSetupModal();};
  document.body.appendChild(modal);
  const input=document.getElementById('tpinSetupInput');
  if(input)setTimeout(()=>input.focus(),50);
}

function closeTpinSetupModal(){
  const m=document.getElementById('tpinSetupModal');
  if(m){
    const inp1=document.getElementById('tpinSetupInput');
    const inp2=document.getElementById('tpinSetupConfirm');
    if(inp1)inp1.value='';
    if(inp2)inp2.value='';
    m.remove();
  }
}

async function submitTpinSetup(){
  const input1=document.getElementById('tpinSetupInput');
  const input2=document.getElementById('tpinSetupConfirm');
  const errEl=document.getElementById('tpinSetupError');
  const btn=document.getElementById('btnSubmitTpinSetup');
  const pin=input1?.value?.trim()||'';
  const confirmPin=input2?.value?.trim()||'';

  const showError=(html)=>{
    if(errEl){
      errEl.style.display='block';
      errEl.innerHTML=html;
    }
  };

  if(!/^\d{4}$/.test(pin)){
    showError('<div class="admin-blocked-card" style="padding:10px;font-size:12.5px;color:#991b1b">TPIN must be exactly 4 numeric digits.</div>');
    return;
  }
  if(pin!==confirmPin){
    showError('<div class="admin-blocked-card" style="padding:10px;font-size:12.5px;color:#991b1b">TPIN confirmation does not match.</div>');
    return;
  }
  if(pin==='0000'||pin==='1111'||pin==='2222'||pin==='3333'||pin==='4444'||pin==='5555'||pin==='6666'||pin==='7777'||pin==='8888'||pin==='9999'||pin==='1234'){
    showError('<div class="admin-blocked-card" style="padding:10px;font-size:12.5px;color:#991b1b">Trivial or easily guessed TPINs are not permitted. Choose a stronger 4-digit combination.</div>');
    return;
  }

  if(btn){btn.disabled=true;btn.textContent='Saving...';}
  if(errEl)errEl.style.display='none';

  try{
    await workerPost('/api/tpin/setup',{tpin:pin});
    toast('Administrative TPIN configured successfully.','ok');
    adminTpinStatus={...(adminTpinStatus||{}),is_set:true,tpin_setup_required:false};
    closeTpinSetupModal();
    const forced=document.getElementById('forcedTpinOverlay');
    if(forced)forced.remove();
    const cont=document.getElementById('adminTpinCardContainer');
    if(cont)cont.innerHTML=renderTpinAccountCardInner();
  }catch(err){
    if(err?.status===404){
      showError(renderAdminBlockedCard('/api/tpin/setup','POST',err.message||'TPIN setup route returned 404.'));
    }else{
      showError('<div class="admin-blocked-card" style="padding:10px;font-size:12.5px;color:#991b1b">'+esc(err?.message||'Failed to save TPIN.')+'</div>');
    }
    if(btn){btn.disabled=false;btn.textContent='Save TPIN';}
  }finally{
    if(input1)input1.value='';
    if(input2)input2.value='';
  }
}

function openTpinChangeModal(){
  let old=document.getElementById('tpinChangeModal');
  if(old)old.remove();

  const modal=document.createElement('div');
  modal.id='tpinChangeModal';
  modal.className='tpin-modal-overlay';
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');

  modal.innerHTML='<div class="tpin-modal-box">'+
    '<div class="admin-modal-head">'+
      '<div>'+
        '<h3 style="margin:0;font-size:17px">Change Administrative TPIN</h3>'+
        '<p class="muted" style="margin:2px 0 0;font-size:12px">Update your 4-digit security PIN.</p>'+
      '</div>'+
      '<button type="button" class="ghost" onclick="closeTpinChangeModal()">✕</button>'+
    '</div>'+
    '<form id="tpinChangeForm" onsubmit="event.preventDefault();submitTpinChange();" style="display:flex;flex-direction:column;gap:14px">'+
      '<div class="field">'+
        '<label for="tpinCurrentInput">Current 4-Digit TPIN</label>'+
        '<div class="tpin-input-group">'+
          '<input type="password" id="tpinCurrentInput" class="tpin-digit-box" maxlength="4" pattern="[0-9]{4}" inputmode="numeric" placeholder="••••" autocomplete="off" required>'+
          '<button type="button" class="tpin-toggle-btn" onclick="toggleTpinFieldVisibility(\'tpinCurrentInput\',this)">👁️</button>'+
        '</div>'+
      '</div>'+
      '<div class="field">'+
        '<label for="tpinNewInput">New 4-Digit TPIN</label>'+
        '<div class="tpin-input-group">'+
          '<input type="password" id="tpinNewInput" class="tpin-digit-box" maxlength="4" pattern="[0-9]{4}" inputmode="numeric" placeholder="••••" autocomplete="off" required>'+
          '<button type="button" class="tpin-toggle-btn" onclick="toggleTpinFieldVisibility(\'tpinNewInput\',this)">👁️</button>'+
        '</div>'+
      '</div>'+
      '<div class="field">'+
        '<label for="tpinNewConfirm">Confirm New 4-Digit TPIN</label>'+
        '<div class="tpin-input-group">'+
          '<input type="password" id="tpinNewConfirm" class="tpin-digit-box" maxlength="4" pattern="[0-9]{4}" inputmode="numeric" placeholder="••••" autocomplete="off" required>'+
          '<button type="button" class="tpin-toggle-btn" onclick="toggleTpinFieldVisibility(\'tpinNewConfirm\',this)">👁️</button>'+
        '</div>'+
      '</div>'+
      '<div id="tpinChangeError" style="display:none"></div>'+
      '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:6px">'+
        '<button type="button" class="ghost" onclick="closeTpinChangeModal()">Cancel</button>'+
        '<button type="submit" class="primary" id="btnSubmitTpinChange">Update TPIN</button>'+
      '</div>'+
    '</form>'+
  '</div>';

  modal.onclick=e=>{if(e.target===modal)closeTpinChangeModal();};
  document.body.appendChild(modal);
  const input=document.getElementById('tpinCurrentInput');
  if(input)setTimeout(()=>input.focus(),50);
}

function closeTpinChangeModal(){
  const m=document.getElementById('tpinChangeModal');
  if(m){
    const i1=document.getElementById('tpinCurrentInput');
    const i2=document.getElementById('tpinNewInput');
    const i3=document.getElementById('tpinNewConfirm');
    if(i1)i1.value='';
    if(i2)i2.value='';
    if(i3)i3.value='';
    m.remove();
  }
}

async function submitTpinChange(){
  const curInp=document.getElementById('tpinCurrentInput');
  const newInp=document.getElementById('tpinNewInput');
  const confInp=document.getElementById('tpinNewConfirm');
  const errEl=document.getElementById('tpinChangeError');
  const btn=document.getElementById('btnSubmitTpinChange');

  const cur=curInp?.value?.trim()||'';
  const nxt=newInp?.value?.trim()||'';
  const conf=confInp?.value?.trim()||'';

  const showError=(html)=>{
    if(errEl){
      errEl.style.display='block';
      errEl.innerHTML=html;
    }
  };

  if(!/^\d{4}$/.test(cur)||!/^\d{4}$/.test(nxt)){
    showError('<div class="admin-blocked-card" style="padding:10px;font-size:12.5px;color:#991b1b">Both current and new TPIN must be exactly 4 digits.</div>');
    return;
  }
  if(nxt!==conf){
    showError('<div class="admin-blocked-card" style="padding:10px;font-size:12.5px;color:#991b1b">New TPIN confirmation does not match.</div>');
    return;
  }
  if(cur===nxt){
    showError('<div class="admin-blocked-card" style="padding:10px;font-size:12.5px;color:#991b1b">New TPIN must be different from current TPIN.</div>');
    return;
  }

  if(btn){btn.disabled=true;btn.textContent='Updating...';}
  if(errEl)errEl.style.display='none';

  try{
    await workerPost('/api/tpin/change',{current_tpin:cur,new_tpin:nxt});
    toast('Administrative TPIN updated successfully.','ok');
    closeTpinChangeModal();
  }catch(err){
    if(err?.status===404){
      showError(renderAdminBlockedCard('/api/tpin/change','POST',err.message||'TPIN change route returned 404.'));
    }else{
      let attemptsHtml='';
      if(err?.remaining_attempts!==undefined){
        attemptsHtml='<div class="tpin-attempts-badge" style="margin-top:6px">⚠️ '+err.remaining_attempts+' attempts remaining before lockout</div>';
      }
      showError('<div class="admin-blocked-card" style="padding:10px;font-size:12.5px;color:#991b1b">'+esc(err?.message||'Failed to update TPIN.')+attemptsHtml+'</div>');
    }
    if(btn){btn.disabled=false;btn.textContent='Update TPIN';}
  }finally{
    if(curInp)curInp.value='';
    if(newInp)newInp.value='';
    if(confInp)confInp.value='';
  }
}

function openTpinResetModal(){
  let old=document.getElementById('tpinResetModal');
  if(old)old.remove();

  const modal=document.createElement('div');
  modal.id='tpinResetModal';
  modal.className='tpin-modal-overlay';
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');

  const adminEmail=user?.email||'your administrator email';

  modal.innerHTML='<div class="tpin-modal-box">'+
    '<div class="admin-modal-head">'+
      '<div>'+
        '<h3 style="margin:0;font-size:17px">Reset Administrative TPIN</h3>'+
        '<p class="muted" style="margin:2px 0 0;font-size:12px">Initiate email-based cryptographic PIN recovery.</p>'+
      '</div>'+
      '<button type="button" class="ghost" onclick="closeTpinResetModal()">✕</button>'+
    '</div>'+
    '<div style="font-size:13.5px;color:#334155;line-height:1.5">'+
      '<p>A secure reset token will be dispatched to your verified administrator email address:</p>'+
      '<div style="background:#f1f5f9;padding:10px 14px;border-radius:8px;font-family:monospace;font-weight:700;color:#0f172a;word-break:break-all">'+
        esc(adminEmail)+
      '</div>'+
      '<p class="muted" style="font-size:12px;margin-top:8px">This reset request invalidates existing TPIN sessions across all devices.</p>'+
      '<div id="tpinResetError" style="display:none;margin-top:10px"></div>'+
      '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px">'+
        '<button type="button" class="ghost" onclick="closeTpinResetModal()">Cancel</button>'+
        '<button type="button" class="primary" id="btnSubmitTpinReset" onclick="submitTpinResetRequest()">Send Reset Email</button>'+
      '</div>'+
    '</div>'+
  '</div>';

  modal.onclick=e=>{if(e.target===modal)closeTpinResetModal();};
  document.body.appendChild(modal);
}

function closeTpinResetModal(){
  const m=document.getElementById('tpinResetModal');
  if(m)m.remove();
}

async function submitTpinResetRequest(){
  const btn=document.getElementById('btnSubmitTpinReset');
  const errEl=document.getElementById('tpinResetError');
  if(btn){btn.disabled=true;btn.textContent='Dispatching...';}
  if(errEl)errEl.style.display='none';

  try{
    await workerPost('/api/tpin/reset-request',{});
    toast('TPIN reset instructions sent to '+esc(user?.email||'email')+'.','ok');
    closeTpinResetModal();
  }catch(err){
    if(err?.status===404){
      if(errEl){
        errEl.style.display='block';
        errEl.innerHTML=renderAdminBlockedCard('/api/tpin/reset-request','POST',err.message||'TPIN reset request route returned 404.');
      }
    }else{
      toast('Failed to request TPIN reset: '+(err?.message||err),'error');
    }
    if(btn){btn.disabled=false;btn.textContent='Send Reset Email';}
  }
}

function promptTpinVerification(actionName, onVerified){
  let old=document.getElementById('tpinVerifyModal');
  if(old)old.remove();

  pendingTpinActionCallback=onVerified;

  const modal=document.createElement('div');
  modal.id='tpinVerifyModal';
  modal.className='tpin-modal-overlay';
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');

  modal.innerHTML='<div class="tpin-modal-box">'+
    '<div class="admin-modal-head">'+
      '<div>'+
        '<div style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#2563eb;text-transform:uppercase;margin-bottom:2px">🛡️ Security Verification Required</div>'+
        '<h3 style="margin:0;font-size:17px">Authorize High-Privilege Action</h3>'+
      '</div>'+
      '<button type="button" class="ghost" onclick="closeTpinVerifyModal()">✕</button>'+
    '</div>'+
    '<div style="font-size:13px;color:#475569">'+
      '<span>Action to execute:</span> <b style="color:#0f172a">'+esc(actionName)+'</b>'+
    '</div>'+
    '<form id="tpinVerifyForm" onsubmit="event.preventDefault();submitTpinVerification(\''+esc(actionName)+'\');" style="display:flex;flex-direction:column;gap:12px">'+
      '<div class="field">'+
        '<label for="tpinVerifyInput">Enter 4-Digit TPIN</label>'+
        '<div class="tpin-input-group">'+
          '<input type="password" id="tpinVerifyInput" class="tpin-digit-box" maxlength="4" pattern="[0-9]{4}" inputmode="numeric" placeholder="••••" autocomplete="off" required>'+
          '<button type="button" class="tpin-toggle-btn" onclick="toggleTpinFieldVisibility(\'tpinVerifyInput\',this)">👁️</button>'+
        '</div>'+
      '</div>'+
      '<div id="tpinVerifyError" style="display:none"></div>'+
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:4px">'+
        '<a href="javascript:void(0)" onclick="closeTpinVerifyModal();openTpinResetModal();" style="font-size:12px;color:#2563eb;text-decoration:none">Forgot TPIN?</a>'+
        '<div style="display:flex;gap:8px">'+
          '<button type="button" class="ghost" onclick="closeTpinVerifyModal()">Cancel</button>'+
          '<button type="submit" class="primary" id="btnSubmitTpinVerify">Authorize Action</button>'+
        '</div>'+
      '</div>'+
    '</form>'+
  '</div>';

  modal.onclick=e=>{if(e.target===modal)closeTpinVerifyModal();};
  document.body.appendChild(modal);
  const input=document.getElementById('tpinVerifyInput');
  if(input)setTimeout(()=>input.focus(),50);
}

function closeTpinVerifyModal(){
  const m=document.getElementById('tpinVerifyModal');
  if(m){
    const inp=document.getElementById('tpinVerifyInput');
    if(inp)inp.value='';
    m.remove();
  }
  pendingTpinActionCallback=null;
}

async function submitTpinVerification(actionName){
  const input=document.getElementById('tpinVerifyInput');
  const errEl=document.getElementById('tpinVerifyError');
  const btn=document.getElementById('btnSubmitTpinVerify');
  const pin=input?.value?.trim()||'';

  const showError=(html)=>{
    if(errEl){
      errEl.style.display='block';
      errEl.innerHTML=html;
    }
  };

  if(!/^\d{4}$/.test(pin)){
    showError('<div class="admin-blocked-card" style="padding:10px;font-size:12.5px;color:#991b1b">Please enter all 4 digits of your TPIN.</div>');
    return;
  }

  if(btn){btn.disabled=true;btn.textContent='Verifying...';}
  if(errEl)errEl.style.display='none';

  try{
    await workerPost('/api/tpin/verify',{tpin:pin,action:actionName});
    const cb=pendingTpinActionCallback;
    closeTpinVerifyModal();
    if(typeof cb==='function'){
      await cb();
    }
  }catch(err){
    if(err?.status===404){
      showError(renderAdminBlockedCard('/api/tpin/verify','POST',err.message||'TPIN verification route returned 404. Action blocked.'));
    }else{
      let attemptsHtml='';
      if(err?.remaining_attempts!==undefined){
        attemptsHtml='<div class="tpin-attempts-badge" style="margin-top:6px">⚠️ '+err.remaining_attempts+' attempts remaining before lockout</div>';
      }
      showError('<div class="admin-blocked-card" style="padding:10px;font-size:12.5px;color:#991b1b">'+esc(err?.message||'Incorrect TPIN. Authorization rejected.')+attemptsHtml+'</div>');
    }
    if(btn){btn.disabled=false;btn.textContent='Authorize Action';}
  }finally{
    if(input)input.value='';
  }
}

function checkForcedTpinSetup(){
  const required=Boolean(adminTpinStatus?.tpin_setup_required||adminTpinStatus?.tpin_change_required||user?.tpin_change_required);
  if(!required)return;
  if(document.getElementById('forcedTpinOverlay'))return;

  const overlay=document.createElement('div');
  overlay.id='forcedTpinOverlay';
  overlay.className='tpin-forced-overlay';
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');

  overlay.innerHTML='<div class="tpin-forced-box">'+
    '<div style="text-align:center">'+
      '<div style="font-size:36px;margin-bottom:8px">🔐</div>'+
      '<h2 style="margin:0 0 6px">Administrative TPIN Setup Required</h2>'+
      '<p class="muted" style="margin:0;font-size:13.5px">For SOC-2 / platform security compliance, all administrators must configure a 4-digit TPIN before accessing Torq Desk administration.</p>'+
    '</div>'+
    '<form id="forcedTpinForm" onsubmit="event.preventDefault();submitForcedTpinSetup();" style="display:flex;flex-direction:column;gap:14px">'+
      '<div class="field">'+
        '<label for="forcedTpinInput">Choose 4-Digit TPIN</label>'+
        '<div class="tpin-input-group">'+
          '<input type="password" id="forcedTpinInput" class="tpin-digit-box" maxlength="4" pattern="[0-9]{4}" inputmode="numeric" placeholder="••••" autocomplete="off" required>'+
          '<button type="button" class="tpin-toggle-btn" onclick="toggleTpinFieldVisibility(\'forcedTpinInput\',this)">👁️</button>'+
        '</div>'+
      '</div>'+
      '<div class="field">'+
        '<label for="forcedTpinConfirm">Confirm 4-Digit TPIN</label>'+
        '<div class="tpin-input-group">'+
          '<input type="password" id="forcedTpinConfirm" class="tpin-digit-box" maxlength="4" pattern="[0-9]{4}" inputmode="numeric" placeholder="••••" autocomplete="off" required>'+
          '<button type="button" class="tpin-toggle-btn" onclick="toggleTpinFieldVisibility(\'forcedTpinConfirm\',this)">👁️</button>'+
        '</div>'+
      '</div>'+
      '<div id="forcedTpinError" style="display:none"></div>'+
      '<div style="margin-top:8px">'+
        '<button type="submit" class="primary" id="btnSubmitForcedTpin" style="width:100%;padding:12px">Complete TPIN Setup &amp; Enter Console</button>'+
      '</div>'+
      '<div style="text-align:center;margin-top:6px">'+
        '<button type="button" class="ghost" style="color:#64748b;font-size:12.5px" onclick="adminSignOut()">Sign Out</button>'+
      '</div>'+
    '</form>'+
  '</div>';

  document.body.appendChild(overlay);
  const input=document.getElementById('forcedTpinInput');
  if(input)setTimeout(()=>input.focus(),50);
}

async function submitForcedTpinSetup(){
  const input1=document.getElementById('forcedTpinInput');
  const input2=document.getElementById('forcedTpinConfirm');
  const errEl=document.getElementById('forcedTpinError');
  const btn=document.getElementById('btnSubmitForcedTpin');
  const pin=input1?.value?.trim()||'';
  const confirmPin=input2?.value?.trim()||'';

  const showError=(html)=>{
    if(errEl){
      errEl.style.display='block';
      errEl.innerHTML=html;
    }
  };

  if(!/^\d{4}$/.test(pin)){
    showError('<div class="admin-blocked-card" style="padding:10px;font-size:12.5px;color:#991b1b">TPIN must be exactly 4 numeric digits.</div>');
    return;
  }
  if(pin!==confirmPin){
    showError('<div class="admin-blocked-card" style="padding:10px;font-size:12.5px;color:#991b1b">TPIN confirmation does not match.</div>');
    return;
  }
  if(pin==='0000'||pin==='1111'||pin==='2222'||pin==='3333'||pin==='4444'||pin==='5555'||pin==='6666'||pin==='7777'||pin==='8888'||pin==='9999'||pin==='1234'){
    showError('<div class="admin-blocked-card" style="padding:10px;font-size:12.5px;color:#991b1b">Trivial or easily guessed TPINs are not permitted.</div>');
    return;
  }

  if(btn){btn.disabled=true;btn.textContent='Configuring...';}
  if(errEl)errEl.style.display='none';

  try{
    await workerPost('/api/tpin/setup',{tpin:pin});
    toast('Administrative TPIN configured successfully. Access granted.','ok');
    adminTpinStatus={...(adminTpinStatus||{}),is_set:true,tpin_setup_required:false};
    if(user)user.tpin_change_required=false;
    const forced=document.getElementById('forcedTpinOverlay');
    if(forced)forced.remove();
  }catch(err){
    if(err?.status===404){
      showError(renderAdminBlockedCard('/api/tpin/setup','POST',err.message||'TPIN setup route returned 404.'));
    }else{
      showError('<div class="admin-blocked-card" style="padding:10px;font-size:12.5px;color:#991b1b">'+esc(err?.message||'Failed to save TPIN.')+'</div>');
    }
    if(btn){btn.disabled=false;btn.textContent='Complete TPIN Setup & Enter Console';}
  }finally{
    if(input1)input1.value='';
    if(input2)input2.value='';
  }
}

async function executeProtectedAdminAction(actionName, actionFn){
  if(adminTpinStatus&&adminTpinStatus.is_set){
    promptTpinVerification(actionName,actionFn);
  }else{
    await actionFn();
  }
}

window.loadAdminTpinStatus=loadAdminTpinStatus;
window.renderTpinAccountCardInner=renderTpinAccountCardInner;
window.openTpinSetupModal=openTpinSetupModal;
window.closeTpinSetupModal=closeTpinSetupModal;
window.submitTpinSetup=submitTpinSetup;
window.openTpinChangeModal=openTpinChangeModal;
window.closeTpinChangeModal=closeTpinChangeModal;
window.submitTpinChange=submitTpinChange;
window.openTpinResetModal=openTpinResetModal;
window.closeTpinResetModal=closeTpinResetModal;
window.submitTpinResetRequest=submitTpinResetRequest;
window.promptTpinVerification=promptTpinVerification;
window.closeTpinVerifyModal=closeTpinVerifyModal;
window.submitTpinVerification=submitTpinVerification;
window.toggleTpinFieldVisibility=toggleTpinFieldVisibility;
window.checkForcedTpinSetup=checkForcedTpinSetup;
window.submitForcedTpinSetup=submitForcedTpinSetup;
window.executeProtectedAdminAction=executeProtectedAdminAction;
window.getAdminTpinStatus=()=>adminTpinStatus;
window.setAdminTpinStatus=(val)=>{adminTpinStatus=val;};

function renderAdminCurrentScreen(){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.allowedScreens.includes(currentAdminScreen)){
    return '<div class="admin-card" style="padding:40px;text-align:center">'+
      '<div style="font-size:36px;margin-bottom:12px">🔒</div>'+
      '<h2 style="margin:0 0 8px 0;font-size:18px">Access Restricted</h2>'+
      '<p class="muted" style="max-width:440px;margin:0 auto 16px auto">'+
        'Your role <b>'+esc(perms.label)+'</b> does not have clearance to access the "'+esc(currentAdminScreen)+'" screen.'+
      '</p>'+
      '<button type="button" class="primary" onclick="switchAdminScreen(\''+perms.defaultScreen+'\')">Return to Allowed Workspace</button>'+
    '</div>';
  }
  if(currentAdminScreen==='users')return renderScreenUsers();
  if(currentAdminScreen==='tokens')return renderScreenTokens();
  if(currentAdminScreen==='plans')return renderScreenPlans();
  if(currentAdminScreen==='upgrades')return renderScreenUpgrades();
  if(currentAdminScreen==='tickets')return renderScreenTickets();
  if(currentAdminScreen==='garages')return renderScreenGarages();
  if(currentAdminScreen==='team')return renderScreenTeam();
  if(currentAdminScreen==='audit')return renderScreenAudit();
  if(currentAdminScreen==='content')return renderScreenContent();
  if(currentAdminScreen==='settings')return renderScreenSettings();
  if(currentAdminScreen==='reports')return renderScreenReports();
  if(currentAdminScreen==='account')return renderScreenAdminAccount();
  return renderScreenHome();
}

function renderAdminViewContent(){
  const container=$('adminContent');
  if(!container)return;

  const perms=getAdminRolePermissions(currentAdminRole);

  const screens=[
    {id:'home',label:'Overview',icon:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>'},
    {id:'users',label:'Users &amp; Accounts',icon:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'},
    {id:'tokens',label:'Activation Tokens',icon:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/></svg>'},
    {id:'plans',label:'Plans &amp; Limits',icon:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>'},
    {id:'upgrades',label:'Upgrade Requests',icon:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>'},
    {id:'tickets',label:'Support Tickets',badge:adminTickets.filter(t=>(t.status||'').toLowerCase()==='open').length,icon:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/></svg>'},
    {id:'garages',label:'Garage Network',icon:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>'},
    {id:'team',label:'Team &amp; Access',icon:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'},
    {id:'audit',label:'Audit Trail',icon:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>'},
    {id:'content',label:'Content &amp; Site',icon:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>'},
    {id:'settings',label:'Settings &amp; Security',icon:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'},
    {id:'reports',label:'Reports &amp; Analytics',icon:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>'},
    {id:'account',label:'Account &amp; Security',icon:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'}
  ];

  const allowedScreens=screens.filter(s=>perms.allowedScreens.includes(s.id));
  const coreScreens=allowedScreens.filter(s=>['home','users','tokens','plans','upgrades','tickets'].includes(s.id));
  const opsScreens=allowedScreens.filter(s=>['garages','team','audit','content','settings','reports','account'].includes(s.id));

  const mobileTabDefinitions=[
    {id:'home',label:'Home',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>'},
    {id:'users',label:'Users',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'},
    {id:'tickets',label:'Support',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/></svg>',badge:adminTickets.filter(t=>(t.status||'').toLowerCase()==='open').length},
    {id:'plans',label:'Plans',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>'},
    {id:'audit',label:'Audit',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>'},
    {id:'account',label:'Account',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'}
  ];
  const allowedMobileCandidates=mobileTabDefinitions.filter(t=>perms.allowedScreens.includes(t.id));
  const mobileNavTabs=allowedMobileCandidates.length<=4 ? allowedMobileCandidates : allowedMobileCandidates.slice(0,4);
  const showMoreTab=allowedScreens.length > mobileNavTabs.length;

  const moreCandidates=[
    {id:'account',label:'Account',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'},
    {id:'tokens',label:'Tokens',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/></svg>'},
    {id:'upgrades',label:'Upgrades',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>'},
    {id:'garages',label:'Garages',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>'},
    {id:'team',label:'Team',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'},
    {id:'audit',label:'Audit Log',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>'},
    {id:'content',label:'Content',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>'},
    {id:'settings',label:'Settings',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'},
    {id:'reports',label:'Reports',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>'}
  ].filter(item=>perms.allowedScreens.includes(item.id));

  container.innerHTML='<div class="admin-workspace-shell">'+
    '<header class="admin-topbar">'+
      '<div class="admin-topbar-brand" onclick="switchAdminScreen(\''+perms.defaultScreen+'\')">'+
        '<div class="admin-topbar-brand-mark">TD</div>'+
        '<div class="admin-brand-titles">'+
          '<h1 class="admin-brand-title" style="margin:0;font-size:15px;line-height:1.2">'+esc(perms.label)+' Console</h1>'+
          '<span class="admin-brand-badge">Torq Desk Operations</span>'+
        '</div>'+
      '</div>'+
      '<div class="admin-topbar-center">'+
        '<div class="admin-global-search-wrap">'+
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>'+
          '<input type="text" placeholder="Global admin search (screens, accounts, tickets)..." onkeydown="if(event.key===\'Enter\'){adminUsersSearch=this.value;switchAdminScreen(\'users\');}">'+
        '</div>'+
      '</div>'+
      '<div class="admin-topbar-actions">'+
        '<span class="admin-security-pill">🔒 '+esc(perms.label)+'</span>'+
        '<div class="admin-profile-pill" onclick="switchAdminScreen(\'account\')" style="cursor:pointer" title="Manage Account &amp; Security"><span class="admin-profile-avatar">A</span><span id="adminTopbarEmail">admin</span></div>'+
        '<button type="button" class="admin-signout-btn" onclick="adminSignOut()">Sign Out</button>'+
      '</div>'+
    '</header>'+
    '<div class="admin-layout-body">'+
      '<aside class="admin-sidebar-shell">'+
        (coreScreens.length?'<div class="admin-sidebar-kicker">Core Workspace</div>':'')+
        coreScreens.map(s=>'<button type="button" class="admin-sidebar-item '+(currentAdminScreen===s.id?'active':'')+'" onclick="switchAdminScreen(\''+s.id+'\')">'+
          '<span class="admin-sidebar-item-content">'+s.icon+'<span>'+s.label+'</span></span>'+
          (s.badge?'<span class="admin-sidebar-badge open-badge">'+s.badge+'</span>':'')+
        '</button>').join('')+
        (opsScreens.length?'<div class="admin-sidebar-kicker">Operations &amp; Platform</div>':'')+
        opsScreens.map(s=>'<button type="button" class="admin-sidebar-item '+(currentAdminScreen===s.id?'active':'')+'" onclick="switchAdminScreen(\''+s.id+'\')">'+
          '<span class="admin-sidebar-item-content">'+s.icon+'<span>'+s.label+'</span></span>'+
        '</button>').join('')+
        '<div style="margin-top:auto;padding-top:16px;border-top:1px solid var(--c-line,#e2e8f0);display:flex;flex-direction:column;gap:8px">'+
          '<div style="font-size:11px;color:#64748b;display:flex;align-items:center;gap:6px">'+
            '<span style="color:#16a34a">●</span> 15-Min Inactivity Guard Active'+
          '</div>'+
          '<button type="button" class="ghost" style="width:100%;font-size:12px;color:#dc2626" onclick="adminSignOut()">Sign Out of Admin</button>'+
        '</div>'+
      '</aside>'+
      '<main class="admin-main-container" id="adminMainContainer">'+
        renderAdminCurrentScreen()+
      '</main>'+
    '</div>'+
    '<nav class="admin-mobile-nav" id="adminMobileNav">'+
      mobileNavTabs.map(t=>'<button type="button" class="admin-mobile-tab '+(currentAdminScreen===t.id?'active':'')+'" onclick="switchAdminScreen(\''+t.id+'\')">'+
        (t.badge?'<span class="tab-badge"></span>':'')+
        t.icon+
        '<span>'+t.label+'</span>'+
      '</button>').join('')+
      (showMoreTab?'<button type="button" class="admin-mobile-tab '+(allowedScreens.every(s=>s.id!==currentAdminScreen||mobileNavTabs.some(m=>m.id===currentAdminScreen))?'':'active')+'" onclick="openAdminMoreSheet()">'+
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>'+
        '<span>More</span>'+
      '</button>':'')+
    '</nav>'+
    '<div class="admin-more-sheet" id="adminMoreSheet" hidden onclick="if(event.target===this)closeAdminMoreSheet()">'+
      '<div class="admin-more-panel">'+
        '<div style="display:flex;justify-content:space-between;align-items:center">'+
          '<b style="font-size:16px">Administration Tools</b>'+
          '<button type="button" class="ghost" onclick="closeAdminMoreSheet()" style="padding:4px 8px;font-size:16px">✕</button>'+
        '</div>'+
        '<div class="admin-more-grid">'+
          moreCandidates.map(c=>'<button type="button" class="admin-more-btn" onclick="switchAdminScreen(\''+c.id+'\')">'+
            c.icon+'<span>'+c.label+'</span>'+
          '</button>').join('')+
          '<button type="button" class="admin-more-btn" onclick="adminSignOut()" style="color:#dc2626">'+
            '<svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>'+
            '<span>Sign Out</span>'+
          '</button>'+
        '</div>'+
      '</div>'+
    '</div>'+
  '</div>';
  wireAdminAccountSecurityForm();
}

function switchAdminScreen(screenId){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.allowedScreens.includes(screenId)){
    toast('Access denied: Role "'+perms.label+'" does not have clearance to view '+screenId+'.','error');
    if(!perms.allowedScreens.includes(currentAdminScreen)){
      currentAdminScreen=perms.defaultScreen;
    }
    renderAdminViewContent();
    return;
  }
  currentAdminScreen=screenId;
  closeAdminMoreSheet();
  renderAdminViewContent();
  if(screenId==='account'){
    wireAdminAccountSecurityForm();
    if(!currentAdminProfile&&!teamMeLoading&&!teamMeError){
      loadTeamMe();
    }
    if(!adminTpinStatus&&!adminTpinLoading&&!adminTpinError){
      loadAdminTpinStatus();
    }
  }
  if(screenId==='tickets'&&!adminTickets.length&&!adminTicketsLoading&&!adminTicketsError){
    loadAdminTickets();
  }
  if(screenId==='home'&&!adminOverviewData&&!adminOverviewLoading&&!adminOverviewError){
    loadAdminOverview();
  }
  if(screenId==='users'&&!adminUsersList&&!adminUsersLoading&&!adminUsersError){
    loadAdminUsers();
  }
  if(screenId==='tokens'&&!adminTokensList&&!adminTokensLoading&&!adminTokensError){
    loadAdminTokens();
  }
  if(screenId==='plans'&&!adminPlansList&&!adminPlansLoading&&!adminPlansError){
    loadAdminPlans();
    loadAdminCoupons();
  }
  if(screenId==='upgrades'&&!adminUpgradesList&&!adminUpgradesLoading&&!adminUpgradesError){
    loadAdminUpgrades();
  }
  if(screenId==='team'&&!adminTeamList&&!adminTeamLoading&&!adminTeamError){
    loadAdminTeam();
  }
  if(screenId==='garages'&&!adminGaragesList&&!adminGaragesLoading&&!adminGaragesError){
    loadAdminGarages();
  }
  if(screenId==='audit'&&!adminAuditList&&!adminAuditLoading&&!adminAuditError){
    loadAdminAudit();
  }
}

function openAdminMoreSheet(){
  const s=$('adminMoreSheet');
  if(s)s.hidden=false;
}

function closeAdminMoreSheet(){
  const s=$('adminMoreSheet');
  if(s)s.hidden=true;
}

async function loadAdminTickets(force=false){
  if(adminTicketsLoading)return;
  adminTicketsLoading=true;
  adminTicketsError=null;
  adminTicketsLastStatus=null;
  adminTicketsLastCode=null;
  const refreshBtn=$('adminRefreshBtn');
  if(refreshBtn){refreshBtn.disabled=true;refreshBtn.textContent='Refreshing...';}
  const listCont=$('adminListContainer');
  if(listCont&&!adminTickets.length){
    listCont.innerHTML='<div class="admin-state-card"><div class="spinner-lg" style="margin:8px auto"></div><h3>Loading Authoritative Tickets...</h3><p>Connecting to Cloudflare D1 ticket database via authorized admin gateway.</p></div>';
  }
  try{
    const res=await workerGet('/api/admin/support-tickets?limit=250');
    if(res&&res.ok&&Array.isArray(res.data)){
      adminTickets=res.data;
      adminTicketsError=null;
    }else{
      adminTickets=[];
      adminTicketsError='Unexpected response format from admin ticket API.';
    }
  }catch(err){
    console.error('Failed to load admin support tickets:',err);
    adminTicketsLastStatus=err?.status||500;
    adminTicketsLastCode=err?.code||'INTERNAL_ERROR';
    if(err?.status===403||err?.code==='FORBIDDEN'){
      isSuperAdmin=false;
      updateAdminNavVisibility();
      adminTicketsError='The admin console opened, but the API rejected this account (403). Confirm the deployed Worker is using the active Super Admin registry entry for rnyburia@gmail.com.';
    }else{
      adminTicketsError=err?.message||'Failed to retrieve tickets.';
    }
  }finally{
    adminTicketsLoading=false;
    renderAdminViewContent();
  }
}

async function refreshAdminTickets(){
  await loadAdminTickets(true);
  if(!adminTicketsError)toast('Support tickets refreshed.','ok');
}

function filterAdminTicketsByStatus(status){
  adminStatusFilter=status;
  document.querySelectorAll('#adminFilterGroup .admin-filter-pill').forEach(b=>{
    b.classList.toggle('active',b.textContent.trim().toLowerCase().replace(/\s+/g,'_')===status||(status==='all'&&b.textContent.trim()==='All'));
  });
  const listCont=$('adminListContainer');
  if(listCont)listCont.innerHTML=renderAdminListHtml();
}

function handleAdminSearch(val){
  adminSearchQuery=String(val||'');
  const listCont=$('adminListContainer');
  if(listCont)listCont.innerHTML=renderAdminListHtml();
}

function resetAdminFilters(){
  adminStatusFilter='all';
  adminSearchQuery='';
  renderAdminViewContent();
}

/* Modals & Dialogs */

async function openAdminTicketDetails(ticketId){
  closeAdminTicketDetails();
  let ticket=adminTickets.find(t=>String(t.id)===String(ticketId));
  if(!ticket)return;

  const modal=document.createElement('div');
  modal.id='adminTicketDetailModal';
  modal.className='admin-modal-overlay';
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');

  const tid=esc(ticket.id);
  const statusKey=normalizeTicketStatus(ticket.status);
  const allowedTransitions=TICKET_TRANSITIONS[statusKey]||[];
  const transitionOptions=['<option value="'+esc(statusKey)+'" selected>Current: '+esc(TICKET_STATUS_LABELS[statusKey]||statusKey)+'</option>'].concat(
    allowedTransitions.map(s=>'<option value="'+esc(s)+'">Transition to: '+esc(TICKET_STATUS_LABELS[s]||s)+'</option>')
  ).join('');

  const slaBadge=renderSlaBadge(ticket);
  const chatActive=Boolean(ticket.chat_enabled);
  const showNameActive=Boolean(ticket.show_agent_name);

  let countdownText='';
  if(chatActive&&ticket.chat_enabled_until){
    const leftSec=Number(ticket.chat_enabled_until)-Math.floor(Date.now()/1000);
    if(leftSec>0){
      const hrs=Math.floor(leftSec/3600);
      const mins=Math.floor((leftSec%3600)/60);
      countdownText='<span class="ticket-expiry-countdown">Chat Active: '+hrs+'h '+mins+'m remaining</span>';
    }else{
      countdownText='<span class="ticket-expiry-countdown" style="background:#fee2e2;color:#991b1b">Chat Expired</span>';
    }
  }

  if(!adminRosterData&&!adminRosterBlocked&&typeof workerGet==='function'){
    loadAdminSupportRoster().then(()=>{
      const sel=$('adminTicketAssigneeSelect');
      if(sel&&Array.isArray(adminRosterData)&&adminRosterData.length>0){
        const curVal=sel.value;
        const isMeSel=ticket.assignee_id===(user?.id||'me')||ticket.assignee_id===user?.email;
        let opts='<option value="" '+(!ticket.assignee_id?'selected':'')+'>Unassigned</option>'+
          '<option value="'+esc(user?.id||'me')+'" '+(isMeSel?'selected':'')+'>Assign to Me ('+esc(user?.email||'Admin')+')</option>';
        adminRosterData.forEach(m=>{
          if(m.id===user?.id||m.email===user?.email)return;
          const isSel=ticket.assignee_id===m.id||ticket.assignee_id===m.email;
          const label=(m.name?esc(m.name)+' ('+esc(m.email)+')':esc(m.email))+(m.role?' ['+esc(m.role)+']':'');
          opts+='<option value="'+esc(m.id)+'" '+(isSel?'selected':'')+'>'+label+'</option>';
        });
        sel.innerHTML=opts;
        if(curVal)sel.value=curVal;
      }
    });
  }

  let rosterOptions='';
  if(Array.isArray(adminRosterData)&&adminRosterData.length>0){
    rosterOptions=adminRosterData.map(m=>{
      if(m.id===user?.id||m.email===user?.email)return '';
      const isSel=ticket.assignee_id===m.id||ticket.assignee_id===m.email;
      const label=(m.name?esc(m.name)+' ('+esc(m.email)+')':esc(m.email))+(m.role?' ['+esc(m.role)+']':'');
      return '<option value="'+esc(m.id)+'" '+(isSel?'selected':'')+'>'+label+'</option>';
    }).join('');
  }

  const perms=getAdminRolePermissions(currentAdminRole);
  const canMutate=perms.canMutateTickets;

  let chatBoxHtml='';
  if(chatActive){
    chatBoxHtml='<div class="ticket-chat-toggle-box" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">'+
      '<div>'+
        '<div style="font-weight:700;font-size:13px;color:#16a34a;display:flex;align-items:center;gap:6px">● Chat Active with Customer</div>'+
        countdownText+
      '</div>'+
      (canMutate?'<button type="button" class="ghost" style="color:#dc2626;padding:4px 10px;font-size:12px" onclick="handleAdminChatToggle(\''+tid+'\',false)">Disable Chat</button>':'<button type="button" class="ghost" disabled style="color:#94a3b8;padding:4px 10px;font-size:12px" title="Auditor mode: mutations disabled">Disable Chat</button>')+
    '</div>';
  }else{
    chatBoxHtml='<div class="ticket-chat-toggle-box">'+
      '<div style="font-weight:700;font-size:13px;margin-bottom:4px;color:#0f172a">💬 Customer Chat Window (48h Window)</div>'+
      '<p class="muted" style="margin:0 0 8px 0;font-size:12px">Enabling chat opens a 48-hour direct reply window in the customer\'s Help tab.'+(canMutate?'':' (Auditor view: read-only)')+'</p>'+
      (canMutate?('<textarea id="adminEnableChatMsg" rows="2" placeholder="Optional initial message to customer (e.g. Please reply with your odometer photo)..." style="width:100%;font-size:12.5px;border-radius:6px;border:1px solid #cbd5e1;padding:6px;box-sizing:border-box;margin-bottom:8px"></textarea>'+
      '<button type="button" class="primary" id="btnAdminEnableChat" style="padding:6px 14px;font-size:12.5px" onclick="handleAdminEnableChatWithMsg(\''+tid+'\')">Enable Chat (48h Window)</button>'):'<button type="button" class="primary" disabled style="padding:6px 14px;font-size:12.5px;opacity:0.6;cursor:not-allowed">Enable Chat (Restricted)</button>')+
    '</div>';
  }

  modal.innerHTML='<div class="admin-modal-box" style="max-width:760px">'+
    '<div class="admin-modal-head">'+
      '<div>'+
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">'+
          '<code style="font-size:16px;font-weight:800;color:#2563eb">'+tid+'</code>'+
          slaBadge+
          renderStatusBadge(ticket.status)+
          renderPriorityBadge(ticket.priority)+
        '</div>'+
        '<h3 id="adminModalSubject" style="margin:0;font-size:18px;font-weight:700"></h3>'+
      '</div>'+
      '<button type="button" class="ghost" onclick="closeAdminTicketDetails()" style="font-size:18px;line-height:1;padding:6px 10px">✕</button>'+
    '</div>'+
    '<div class="ticket-detail-grid">'+
      '<div><span class="muted" style="display:block;font-size:11px;text-transform:uppercase">Submitter Email</span><b>'+esc(ticket.email||'Anonymous')+'</b></div>'+
      '<div><span class="muted" style="display:block;font-size:11px;text-transform:uppercase">User UUID</span><code style="font-size:11px">'+esc(ticket.user_id||'—')+'</code></div>'+
      '<div><span class="muted" style="display:block;font-size:11px;text-transform:uppercase">Category</span><b>'+esc(formatCategory(ticket.category))+'</b></div>'+
      '<div><span class="muted" style="display:block;font-size:11px;text-transform:uppercase">Vehicle ID</span><code style="font-size:11px">'+esc(ticket.car_id||'None')+'</code></div>'+
      '<div><span class="muted" style="display:block;font-size:11px;text-transform:uppercase">Created Timestamp</span><span>'+esc(formatAdminDate(ticket.created_at))+'</span></div>'+
      '<div><span class="muted" style="display:block;font-size:11px;text-transform:uppercase">Customer Phone</span><span class="ticket-contact-masked">+91 ••••• •••••</span></div>'+
    '</div>'+
    '<div style="display:flex;gap:10px;align-items:center;margin:10px 0;padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;flex-wrap:wrap">'+
      '<span class="muted">Customer Direct Actions:</span>'+
      '<button type="button" class="ticket-contact-action-btn" disabled title="Audited contact integration pending backend implementation">📞 Call</button>'+
      '<button type="button" class="ticket-contact-action-btn" disabled title="Audited contact integration pending backend implementation">💬 WhatsApp</button>'+
      '<small class="muted" style="display:block;width:100%">Phone unmasking and direct customer calling requires audited backend route implementation.</small>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:12px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px">'+
      '<div>'+
        '<label style="display:block;font-size:11.5px;font-weight:700;margin-bottom:4px">STATUS WORKFLOW</label>'+
        '<div style="display:flex;gap:6px">'+
          '<select id="adminTicketStatusSelect" '+(canMutate?'':'disabled')+' style="flex:1;height:34px;border-radius:6px;border:1px solid #cbd5e1;font-size:12.5px">'+transitionOptions+'</select>'+
          '<button type="button" class="primary" '+(canMutate?'':'disabled style="opacity:0.6;cursor:not-allowed"')+' style="padding:4px 10px;font-size:12px" onclick="handleAdminStatusChange(\''+tid+'\')">Update</button>'+
        '</div>'+
      '</div>'+
      '<div>'+
        '<label style="display:block;font-size:11.5px;font-weight:700;margin-bottom:4px">ASSIGN SPECIALIST</label>'+
        '<div style="display:flex;gap:6px">'+
          '<select id="adminTicketAssigneeSelect" '+(canMutate?'':'disabled')+' style="flex:1;height:34px;border-radius:6px;border:1px solid #cbd5e1;font-size:12.5px">'+
            '<option value="" '+(!ticket.assignee_id?'selected':'')+'>Unassigned</option>'+
            '<option value="'+esc(user?.id||'me')+'" '+(ticket.assignee_id===(user?.id||'me')||ticket.assignee_id===user?.email?'selected':'')+'>Assign to Me ('+esc(user?.email||'Admin')+')</option>'+
            rosterOptions+
            (adminRosterBlocked?'<option disabled>(Team roster unavailable - BLOCKED: GET /api/admin/team missing)</option>':'')+
          '</select>'+
          '<button type="button" class="ghost" '+(canMutate?'':'disabled style="opacity:0.6;cursor:not-allowed"')+' style="padding:4px 10px;font-size:12px" onclick="handleAdminAssigneeChange(\''+tid+'\')">Save</button>'+
        '</div>'+
      '</div>'+
      '<div>'+
        '<label style="display:block;font-size:11.5px;font-weight:700;margin-bottom:4px">PRIORITY</label>'+
        '<div style="display:flex;gap:6px">'+
          '<select id="adminTicketPrioritySelect" '+(canMutate?'':'disabled')+' style="flex:1;height:34px;border-radius:6px;border:1px solid #cbd5e1;font-size:12.5px">'+
            '<option value="low" '+(ticket.priority==='low'?'selected':'')+'>Low</option>'+
            '<option value="normal" '+(ticket.priority==='normal'?'selected':'')+'>Normal</option>'+
            '<option value="high" '+(ticket.priority==='high'?'selected':'')+'>High</option>'+
            '<option value="urgent" '+(ticket.priority==='urgent'?'selected':'')+'>Urgent</option>'+
          '</select>'+
          '<button type="button" class="ghost" '+(canMutate?'':'disabled style="opacity:0.6;cursor:not-allowed"')+' style="padding:4px 10px;font-size:12px" onclick="handleAdminPriorityChange(\''+tid+'\')">Save</button>'+
        '</div>'+
      '</div>'+
    '</div>'+
    chatBoxHtml+
    '<div style="margin:8px 0;display:flex;align-items:center;gap:8px">'+
      '<input type="checkbox" id="adminTicketShowNameToggle" '+(showNameActive?'checked':'')+' '+(canMutate?'':'disabled')+' onchange="handleAdminShowNameToggle(\''+tid+'\',this.checked)">'+
      '<label for="adminTicketShowNameToggle" style="font-size:12.5px;cursor:pointer">Show my specialist name to customer</label>'+
    '</div>'+
    '<div>'+
      '<div class="muted" style="font-size:12px;font-weight:700;text-transform:uppercase;margin:12px 0 6px 0">Customer Inquiry Message</div>'+
      '<div id="adminTicketOriginalMsg" style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;font-size:13.5px;line-height:1.6;color:#1e293b;max-height:160px;overflow-y:auto"></div>'+
    '</div>'+
    '<div class="ticket-internal-panel">'+
      '<div class="ticket-internal-title">Internal, not visible to user</div>'+
      '<div id="adminTicketInternalNotesContainer"><span class="muted" style="font-size:12.5px">No internal notes yet.</span></div>'+
    '</div>'+
    '<div>'+
      '<div class="muted" style="font-size:12px;font-weight:700;text-transform:uppercase;margin:12px 0 6px 0">Audit Timeline &amp; Messages</div>'+
      '<div class="ticket-timeline-container" id="adminTicketTimeline"></div>'+
    '</div>'+
    (canMutate ? ('<div style="margin-top:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px">'+
      '<div style="display:flex;gap:16px;margin-bottom:8px;font-size:12.5px;font-weight:600">'+
        '<label style="display:flex;align-items:center;gap:4px;cursor:pointer"><input type="radio" name="adminMsgTarget" value="public" checked> Public Message (Customer sees in Help)</label>'+
        '<label style="display:flex;align-items:center;gap:4px;cursor:pointer"><input type="radio" name="adminMsgTarget" value="internal"> Internal Note (Staff only)</label>'+
      '</div>'+
      '<textarea id="adminReplyText" rows="3" placeholder="Compose public response or private staff note..." style="width:100%;font-size:13px;border-radius:8px;border:1px solid #cbd5e1;padding:8px;box-sizing:border-box"></textarea>'+
      '<div style="display:flex;justify-content:flex-end;margin-top:8px">'+
        '<button type="button" class="primary" id="adminSendReplyBtn" onclick="handleAdminSendReply(\''+tid+'\')">Send Update</button>'+
      '</div>'+
    '</div>') : ('<div class="admin-auditor-notice">👁️ <b>Read-Only Auditor Mode</b>: You have inspection clearance. Status transitions, assignee changes, priority modifications, and message sending are restricted to Support Specialists and Super Admins.</div>'))+
    '<div class="ticket-action-bar">'+
      '<button type="button" class="ghost" id="btnAdminViewAsUser" style="color:'+(adminViewAsUserBlocked?'#94a3b8':'#b45309')+'" '+(adminViewAsUserBlocked?'disabled title="Backend endpoint not available"':'')+' onclick="openAdminTicketViewAsUser(\''+tid+'\')">'+(adminViewAsUserBlocked?'Not available yet':'👁️ View As User (Audit Logged)')+'</button>'+
      '<button type="button" class="primary" onclick="closeAdminTicketDetails()">Close</button>'+
    '</div>'+
  '</div>';

  modal.onclick=e=>{ if(e.target===modal)closeAdminTicketDetails(); };
  const onKey=e=>{
    if(e.key==='Escape'){
      closeAdminTicketDetails();
      document.removeEventListener('keydown',onKey);
    }
  };
  document.addEventListener('keydown',onKey);
  document.body.appendChild(modal);

  const subEl=$('adminModalSubject');
  if(subEl) subEl.textContent=ticket.subject||'No Subject';
  const origMsgEl=$('adminTicketOriginalMsg');
  if(origMsgEl) origMsgEl.textContent=ticket.message||'(Empty message content)';

  populateAdminModalEvents(ticket);

  if(typeof workerGet==='function'){
    try{
      const res=await workerGet('/api/admin/tickets/'+encodeURIComponent(ticketId));
      if(res&&res.ok&&res.data){
        Object.assign(ticket,res.data);
        populateAdminModalEvents(ticket);
      }
    }catch(err){
      console.warn('Authoritative admin ticket detail fetch failed (expected if backend route bug in worker is not yet merged):',err);
    }
  }
}

function closeAdminTicketDetails(){
  const modal=document.getElementById('adminTicketDetailModal');
  if(modal)modal.remove();
}

function populateAdminModalEvents(ticket){
  const internalContainer=$('adminTicketInternalNotesContainer');
  const timelineContainer=$('adminTicketTimeline');
  if(!internalContainer||!timelineContainer)return;

  const events=Array.isArray(ticket.events)?ticket.events:[];
  const internalNotes=events.filter(e=>e.visibility==='internal'||e.event_type==='internal_note');

  if(internalNotes.length){
    internalContainer.innerHTML='';
    internalNotes.forEach(note=>{
      const item=document.createElement('div');
      item.className='ticket-internal-note-item';
      const meta=document.createElement('div');
      meta.style.fontSize='11px';
      meta.style.color='#854d0e';
      meta.style.fontWeight='600';
      meta.textContent=(note.actor_user_id||'Staff')+' · '+formatTimestamp(note.created_at);
      const body=document.createElement('div');
      body.textContent=note.message||'';
      item.appendChild(meta);
      item.appendChild(body);
      internalContainer.appendChild(item);
    });
  }

  timelineContainer.innerHTML='';
  events.forEach(e=>{
    const item=document.createElement('div');
    item.className='ticket-timeline-item';

    let textDesc='';
    if(e.event_type==='status_changed'){
      textDesc='Status changed: '+(e.metadata_json?.to||e.message||'');
    }else if(e.event_type==='assignment_changed'){
      textDesc='Assignee changed: '+(e.metadata_json?.assignee_id||'Unassigned');
    }else if(e.event_type==='chat_toggled'){
      textDesc='Chat toggled '+(e.metadata_json?.enabled?'ON':'OFF');
    }else if(e.visibility==='internal'||e.event_type==='internal_note'){
      textDesc='[Internal Note] '+(e.message||'');
    }else{
      textDesc=(e.actor_type==='user'?'Customer: ':'Staff: ')+(e.message||'');
    }

    item.textContent=textDesc+' ('+formatTimestamp(e.created_at)+')';
    timelineContainer.appendChild(item);
  });
}

async function handleAdminStatusChange(ticketId){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.canMutateTickets){
    toast('Permission denied: Role "'+perms.label+'" cannot mutate tickets.','error');
    return;
  }
  const sel=$('adminTicketStatusSelect');
  if(!sel)return;
  const nextStatus=sel.value;
  try{
    const res=await workerPatch('/api/admin/tickets/'+encodeURIComponent(ticketId),{status:nextStatus});
    if(!res?.ok){
      throw new Error(res?.error?.message||'Failed to update status.');
    }
    toast('Ticket status updated to '+nextStatus,'ok');
    await loadAdminTickets(true);
    openAdminTicketDetails(ticketId);
  }catch(err){
    console.error('Failed to change status:',err);
    toast(err?.message||'409 INVALID_TRANSITION: Status change rejected by server.','error');
  }
}

async function handleAdminAssigneeChange(ticketId){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.canMutateTickets){
    toast('Permission denied: Role "'+perms.label+'" cannot mutate tickets.','error');
    return;
  }
  const sel=$('adminTicketAssigneeSelect');
  if(!sel)return;
  const assignee=sel.value||null;
  try{
    const res=await workerPatch('/api/admin/tickets/'+encodeURIComponent(ticketId),{assignee_id:assignee});
    if(!res?.ok) throw new Error(res?.error?.message||'Failed to update assignee.');
    toast('Assignee updated.','ok');
    await loadAdminTickets(true);
    openAdminTicketDetails(ticketId);
  }catch(err){
    toast(err?.message||'Failed to update assignee.','error');
  }
}

async function handleAdminPriorityChange(ticketId){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.canMutateTickets){
    toast('Permission denied: Role "'+perms.label+'" cannot mutate tickets.','error');
    return;
  }
  const sel=$('adminTicketPrioritySelect');
  if(!sel)return;
  const pri=sel.value;
  try{
    const res=await workerPatch('/api/admin/tickets/'+encodeURIComponent(ticketId),{priority:pri});
    if(!res?.ok) throw new Error(res?.error?.message||'Failed to update priority.');
    toast('Priority updated.','ok');
    await loadAdminTickets(true);
    openAdminTicketDetails(ticketId);
  }catch(err){
    toast(err?.message||'Failed to update priority.','error');
  }
}

async function handleAdminChatToggle(ticketId,enabled){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.canMutateTickets){
    toast('Permission denied: Role "'+perms.label+'" cannot mutate tickets.','error');
    return;
  }
  try{
    const res=await workerPatch('/api/admin/tickets/'+encodeURIComponent(ticketId),{chat_enabled:enabled});
    if(!res?.ok) throw new Error(res?.error?.message||'Failed to toggle chat.');
    toast('Customer chat '+(enabled?'enabled for 48 hours':'disabled')+'.','ok');
    await loadAdminTickets(true);
    openAdminTicketDetails(ticketId);
  }catch(err){
    toast(err?.message||'Failed to toggle chat.','error');
  }
}

async function handleAdminShowNameToggle(ticketId,enabled){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.canMutateTickets){
    toast('Permission denied: Role "'+perms.label+'" cannot mutate tickets.','error');
    return;
  }
  try{
    const res=await workerPatch('/api/admin/tickets/'+encodeURIComponent(ticketId),{show_agent_name:enabled});
    if(!res?.ok) throw new Error(res?.error?.message||'Failed to update name visibility.');
    toast('Specialist name visibility updated.','ok');
    await loadAdminTickets(true);
  }catch(err){
    toast(err?.message||'Failed to update name visibility.','error');
  }
}

async function handleAdminSendReply(ticketId){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.canMutateTickets){
    toast('Permission denied: Role "'+perms.label+'" cannot mutate tickets.','error');
    return;
  }
  const textEl=$('adminReplyText');
  const btn=$('adminSendReplyBtn');
  if(!textEl||!btn)return;
  const message=textEl.value.trim();
  if(!message){
    toast('Please enter a message.','error');
    textEl.focus();
    return;
  }
  const isInternal=document.querySelector('input[name="adminMsgTarget"]:checked')?.value==='internal';
  btn.disabled=true;
  btn.textContent='Submitting...';
  try{
    const res=await workerPatch('/api/admin/tickets/'+encodeURIComponent(ticketId),{
      message,
      internal:isInternal
    });
    if(!res?.ok) throw new Error(res?.error?.message||'Failed to submit message.');
    textEl.value='';
    toast(isInternal?'Internal note recorded.':'Public response sent to customer.','ok');
    await loadAdminTickets(true);
    openAdminTicketDetails(ticketId);
  }catch(err){
    console.error('Failed to submit message:',err);
    toast(err?.message||'Failed to submit message.','error');
  }finally{
    if(document.body.contains(btn)){
      btn.disabled=false;
      btn.textContent='Send Update';
    }
  }
}

let adminRosterData=null;
let adminRosterLoading=false;
let adminRosterBlocked=false;

async function loadAdminSupportRoster(){
  if(adminRosterData||adminRosterLoading)return adminRosterData;
  adminRosterLoading=true;
  try{
    if(typeof workerGet==='function'){
      const res=await workerGet('/api/admin/team');
      if(res&&res.ok&&Array.isArray(res.data)){
        adminRosterData=res.data;
        adminRosterBlocked=false;
        return adminRosterData;
      }
    }
    adminRosterBlocked=true;
  }catch(err){
    console.warn('Failed to load team roster from server (GET /api/admin/team):',err);
    adminRosterBlocked=true;
  }finally{
    adminRosterLoading=false;
  }
  return null;
}

async function handleAdminEnableChatWithMsg(ticketId){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.canMutateTickets){
    toast('Permission denied: Role "'+perms.label+'" cannot mutate tickets.','error');
    return;
  }
  const msgInput=$('adminEnableChatMsg');
  const btn=$('btnAdminEnableChat');
  const optionalMsg=msgInput?.value?.trim()||'';
  if(btn){
    btn.disabled=true;
    btn.textContent='Enabling Chat...';
  }
  try{
    const payload={chat_enabled:true};
    if(optionalMsg){
      payload.message=optionalMsg;
      payload.internal=false;
    }
    const res=await workerPatch('/api/admin/tickets/'+encodeURIComponent(ticketId),payload);
    if(!res?.ok) throw new Error(res?.error?.message||'Failed to enable chat.');
    toast('Chat enabled for customer (48h direct reply window opened).','ok');
    await loadAdminTickets(true);
    openAdminTicketDetails(ticketId);
  }catch(err){
    toast(err?.message||'Failed to enable chat.','error');
  }finally{
    if(btn&&document.body.contains(btn)){
      btn.disabled=false;
      btn.textContent='Enable Chat (48h Window)';
    }
  }
}

let adminViewAsUserBlocked=false;

async function openAdminTicketViewAsUser(ticketId){
  const btn=$('btnAdminViewAsUser');
  if(adminViewAsUserBlocked){
    if(btn){
      btn.disabled=true;
      btn.textContent='Not available yet';
    }
    toast('BLOCKED: View-as-user route (POST /api/admin/tickets/:id/view-as-user) is missing on the server.','error');
    return;
  }
  const reason=window.prompt('Enter authorized audit reason for read-only user session view (minimum 10 characters):');
  if(reason===null)return;
  const trimmedReason=String(reason||'').trim();
  if(!trimmedReason||trimmedReason.length<10){
    toast('Audit reason is required (minimum 10 characters).','error');
    return;
  }
  if(btn){
    btn.disabled=true;
    btn.textContent='Authenticating Audit...';
  }
  try{
    if(typeof workerPost!=='function'){
      throw new Error('Worker communication gateway unavailable.');
    }
    const res=await workerPost('/api/admin/tickets/'+encodeURIComponent(ticketId)+'/view-as-user',{
      reason:trimmedReason
    });
    if(!res?.ok||!res?.data){
      throw new Error(res?.error?.message||'Server rejected view-as-user request.');
    }
    renderAdminTicketViewAsUserPanel(res.data,trimmedReason);
  }catch(err){
    console.warn('View-as-user failed or route missing:',err);
    if(err?.status===404||err?.code==='NOT_FOUND'||String(err?.message||'').includes('404')||String(err?.message||'').includes('Route not found')||String(err?.message||'').includes('not found')){
      adminViewAsUserBlocked=true;
      if(btn){
        btn.disabled=true;
        btn.textContent='Not available yet';
      }
      toast('BLOCKED: View-as-user route (POST /api/admin/tickets/:id/view-as-user) is missing on the server. Button disabled.','error');
    }else{
      if(btn){
        btn.disabled=false;
        btn.textContent='👁️ View As User (Audit Logged)';
      }
      toast(err?.message||'Failed to authenticate view-as-user.','error');
    }
  }
}

function renderAdminTicketViewAsUserPanel(data,reason){
  let old=$('adminTicketViewAsUserModal');
  if(old)old.remove();
  const modal=document.createElement('div');
  modal.id='adminTicketViewAsUserModal';
  modal.className='ticket-view-as-user-modal';
  modal.innerHTML='<div class="ticket-view-as-user-box">'+
    '<div class="ticket-view-as-user-header">'+
      '<div style="display:flex;align-items:center;gap:8px">'+
        '<span class="ticket-readonly-badge">READ-ONLY AUDITED VIEW</span>'+
        '<code id="vauTicketId" style="font-size:14px;font-weight:700;color:#2563eb"></code>'+
      '</div>'+
      '<button type="button" class="ghost" onclick="closeAdminTicketViewAsUserModal()" style="font-size:18px;line-height:1;padding:4px 8px">✕</button>'+
    '</div>'+
    '<div class="ticket-view-as-user-banner">'+
      '<small class="muted" style="display:block;font-size:11px;text-transform:uppercase">Audit Authorization Reason</small>'+
      '<div id="vauReason" style="font-weight:600;font-size:13px;color:#0f172a"></div>'+
    '</div>'+
    '<div class="ticket-view-as-user-meta">'+
      '<div><span class="muted">Subject</span><div id="vauSubject" style="font-weight:600"></div></div>'+
      '<div><span class="muted">Status</span><div id="vauStatus" style="font-weight:600"></div></div>'+
      '<div><span class="muted">Priority</span><div id="vauPriority" style="font-weight:600"></div></div>'+
      '<div><span class="muted">Created</span><div id="vauCreated" style="font-weight:600"></div></div>'+
    '</div>'+
    '<div class="muted" style="font-size:11px;font-weight:700;text-transform:uppercase;margin:12px 0 6px 0">Customer Public Thread (Read-Only)</div>'+
    '<div class="ticket-view-as-user-thread" id="vauThread"></div>'+
    '<div style="margin-top:14px;text-align:right">'+
      '<button type="button" class="primary" onclick="closeAdminTicketViewAsUserModal()">Done</button>'+
    '</div>'+
  '</div>';
  document.body.appendChild(modal);

  $('vauTicketId').textContent=data?.id||'—';
  $('vauReason').textContent=reason||'Audited inspection';
  $('vauSubject').textContent=data?.subject||'—';
  $('vauStatus').textContent=data?.status||'—';
  $('vauPriority').textContent=data?.priority||'—';
  $('vauCreated').textContent=data?.created_at?formatTimestamp(data.created_at):'—';

  const threadEl=$('vauThread');
  if(threadEl){
    const events=Array.isArray(data?.events)?data.events:[];
    if(!events.length&&data?.message){
      events.push({actor_type:'user',message:data.message,created_at:data.created_at});
    }
    if(!events.length){
      const empty=document.createElement('div');
      empty.className='muted';
      empty.textContent='No public messages found in this ticket.';
      threadEl.appendChild(empty);
    }else{
      events.forEach(e=>{
        const bubble=document.createElement('div');
        bubble.className='ticket-message-bubble '+(e.actor_type==='user'?'ticket-message-user':'ticket-message-admin');
        const hdr=document.createElement('div');
        hdr.className='ticket-message-header';
        const snd=document.createElement('span');
        snd.className='ticket-message-sender';
        snd.textContent=e.actor_type==='user'?'Customer':'Support Specialist';
        const tm=document.createElement('span');
        tm.className='ticket-message-time';
        tm.textContent=formatTimestamp(e.created_at);
        hdr.appendChild(snd);
        hdr.appendChild(tm);
        const txt=document.createElement('div');
        txt.className='ticket-message-text';
        txt.textContent=e.message||'';
        bubble.appendChild(hdr);
        bubble.appendChild(txt);
        threadEl.appendChild(bubble);
      });
    }
  }
}

function closeAdminTicketViewAsUserModal(){
  const m=$('adminTicketViewAsUserModal');
  if(m)m.remove();
}

function promptViewAsUser(ticketId){
  return openAdminTicketViewAsUser(ticketId);
}

let activeAdminSelectedUserId=null;

function openAdminUserDetails(userId){
  activeAdminSelectedUserId=userId;
  let old=document.getElementById('adminUserModal');
  if(old)old.remove();

  const targetUser=(adminUsersList&&adminUsersList.find(u=>String(u.id)===String(userId)))||{
    id:userId||'unknown',
    name:'Customer',
    email:userId||'unknown@example.com',
    role:'owner',
    plan:'lite',
    status:'active',
    created_at:null
  };

  const modal=document.createElement('div');
  modal.id='adminUserModal';
  modal.className='admin-modal-overlay';
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');

  modal.innerHTML='<div class="admin-modal-box" style="max-width:560px">'+
    '<div class="admin-modal-head">'+
      '<div>'+
        '<h3 style="margin:0;font-size:17px">Manage User Entitlements</h3>'+
        '<span class="muted" style="font-size:12px" id="adminUserModalSubtitle"></span>'+
      '</div>'+
      '<button type="button" class="ghost" onclick="closeAdminUserDetails()">✕</button>'+
    '</div>'+
    '<div style="display:flex;flex-direction:column;gap:14px">'+
      '<div class="admin-card" style="padding:12px;background:#f8fafc">'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12.5px">'+
          '<div><span class="muted">Role:</span> <b id="adminUserModalRole"></b></div>'+
          '<div><span class="muted">Status:</span> <b id="adminUserModalStatus"></b></div>'+
          '<div><span class="muted">Plan:</span> <b id="adminUserModalPlan"></b></div>'+
          '<div><span class="muted">Joined:</span> <span id="adminUserModalJoined"></span></div>'+
        '</div>'+
      '</div>'+
      '<div class="field">'+
        '<label>Subscription Plan Tier</label>'+
        '<select id="adminUserPlanSelect">'+
          '<option value="lite"'+((targetUser.plan||'').toLowerCase()==='lite'?' selected':'')+'>Lite / Free Tier (1 Vehicle, 10MB)</option>'+
          '<option value="premium"'+((targetUser.plan||'').toLowerCase()==='premium'?' selected':'')+'>Vehicle Owner Premium (₹69/mo or ₹708/yr)</option>'+
          '<option value="ultra"'+((targetUser.plan||'').toLowerCase()==='ultra'?' selected':'')+'>Ultra / Workshop SaaS (Unlimited)</option>'+
        '</select>'+
      '</div>'+
      '<div class="field">'+
        '<label>Entitlement Validity Duration</label>'+
        '<select id="adminUserDurationSelect">'+
          '<option value="30">30 Days</option>'+
          '<option value="90">90 Days</option>'+
          '<option value="365" selected>365 Days (1 Year)</option>'+
          '<option value="lifetime">Indefinite / Lifetime</option>'+
        '</select>'+
      '</div>'+
      '<div class="field">'+
        '<label>Internal Staff Notes</label>'+
        '<textarea id="adminUserPlanNotes" rows="2" placeholder="Record reason for manual entitlement change..."></textarea>'+
      '</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">'+
        '<button type="button" class="primary" id="btnSaveUserPlan" onclick="saveUserPlanDraft(\''+esc(targetUser.id)+'\')">Save Plan Changes</button>'+
        '<button type="button" class="ghost" id="btnExtendUserGrace" onclick="extendUserGrace(\''+esc(targetUser.id)+'\')">+7 Days Grace</button>'+
        '<button type="button" class="ghost" id="btnSuspendUser" style="color:'+(targetUser.status==='suspended'?'#16a34a':'#dc2626')+'" onclick="suspendUserAccount(\''+esc(targetUser.id)+'\',\''+esc(targetUser.status||'active')+'\')">'+(targetUser.status==='suspended'?'Reactivate Account':'Suspend Account')+'</button>'+
      '</div>'+
      '<div class="admin-detail-section" style="margin-top:6px">'+
        '<h4 style="margin:0 0 4px;font-size:13px">Registered Vehicles</h4>'+
        '<div id="adminUserVehiclesList"><small class="muted">Live vehicle records query: <code>GET /api/admin/users/'+esc(targetUser.id)+'/vehicles</code></small></div>'+
      '</div>'+
      '<div class="admin-detail-section">'+
        '<h4 style="margin:0 0 4px;font-size:13px">Recent Support Inquiries</h4>'+
        '<div id="adminUserTicketsList"><small class="muted">Live ticket history query: <code>GET /api/admin/users/'+esc(targetUser.id)+'/tickets</code></small></div>'+
      '</div>'+
    '</div>'+
  '</div>';

  modal.onclick=e=>{if(e.target===modal)closeAdminUserDetails();};
  document.body.appendChild(modal);

  const sub=document.getElementById('adminUserModalSubtitle');
  if(sub)sub.textContent='User: '+(targetUser.email||targetUser.name||targetUser.id);
  const rEl=document.getElementById('adminUserModalRole');
  if(rEl)rEl.textContent=targetUser.role||'owner';
  const sEl=document.getElementById('adminUserModalStatus');
  if(sEl)sEl.textContent=targetUser.status||'active';
  const pEl=document.getElementById('adminUserModalPlan');
  if(pEl)pEl.textContent=targetUser.plan||'lite';
  const jEl=document.getElementById('adminUserModalJoined');
  if(jEl)jEl.textContent=formatAdminDate(targetUser.created_at);
}

function closeAdminUserDetails(){
  const m=document.getElementById('adminUserModal');
  if(m)m.remove();
  activeAdminSelectedUserId=null;
}

async function saveUserPlanDraft(userId){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.canManageUsers){
    toast('Permission denied: Role "'+perms.label+'" cannot modify user plans.','error');
    return;
  }
  const uid=userId||activeAdminSelectedUserId||(adminUsersList&&adminUsersList[0]?.id)||'';
  const plan=document.getElementById('adminUserPlanSelect')?.value||'lite';
  const duration=document.getElementById('adminUserDurationSelect')?.value||'365';
  const notes=document.getElementById('adminUserPlanNotes')?.value?.trim()||'';
  const btn=document.getElementById('btnSaveUserPlan');
  if(btn){btn.disabled=true;btn.textContent='Saving...';}
  try{
    await workerPatch('/api/admin/users/'+encodeURIComponent(uid)+'/plan',{plan,duration,notes});
    toast('User plan updated successfully.','ok');
    closeAdminUserDetails();
    loadAdminUsers(true);
  }catch(err){
    toast('Failed to update user plan: '+(err?.message||err),'error');
    if(btn){btn.disabled=false;btn.textContent='Save Plan Changes';}
  }
}

async function extendUserGrace(userId){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.canManageUsers){
    toast('Permission denied: Role "'+perms.label+'" cannot extend user grace period.','error');
    return;
  }
  const uid=userId||activeAdminSelectedUserId||(adminUsersList&&adminUsersList[0]?.id)||'';
  const btn=document.getElementById('btnExtendUserGrace');
  if(btn){btn.disabled=true;btn.textContent='Extending...';}
  try{
    await workerPost('/api/admin/users/'+encodeURIComponent(uid)+'/extend-grace',{days:7});
    toast('Grace period extended by 7 days.','ok');
    loadAdminUsers(true);
  }catch(err){
    toast('Failed to extend grace: '+(err?.message||err),'error');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='+7 Days Grace';}
  }
}

async function suspendUserAccount(userId,currentStatus){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.canManageUsers){
    toast('Permission denied: Role "'+perms.label+'" cannot modify user suspension status.','error');
    return;
  }
  const uid=userId||activeAdminSelectedUserId||(adminUsersList&&adminUsersList[0]?.id)||'';
  const isSuspended=(currentStatus==='suspended');
  const newStatus=isSuspended?'active':'suspended';
  const promptWord=isSuspended?'UNSUSPEND':'SUSPEND';
  const confirmStr=prompt('Type '+promptWord+' to confirm changing user account status:');
  if(confirmStr!==promptWord){
    toast('Status change cancelled.','info');
    return;
  }
  const actionLabel=isSuspended?'Reactivate User Account':'Suspend User Account';
  executeProtectedAdminAction(actionLabel,async ()=>{
    const btn=document.getElementById('btnSuspendUser');
    if(btn){btn.disabled=true;btn.textContent='Updating...';}
    try{
      await workerPost('/api/admin/users/'+encodeURIComponent(uid)+'/status',{status:newStatus});
      toast('User status updated to '+newStatus+'.','ok');
      closeAdminUserDetails();
      loadAdminUsers(true);
    }catch(err){
      toast('Failed to update status: '+(err?.message||err),'error');
      if(btn){btn.disabled=false;btn.textContent=isSuspended?'Reactivate Account':'Suspend Account';}
    }
  });
}

function openTokenGenModal(){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.canManageTokens){
    toast('Permission denied: Role "'+perms.label+'" cannot generate tokens.','error');
    return;
  }
  let old=document.getElementById('adminTokenGenModal');
  if(old)old.remove();

  const modal=document.createElement('div');
  modal.id='adminTokenGenModal';
  modal.className='admin-modal-overlay';
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');

  modal.innerHTML='<div class="admin-modal-box">'+
    '<div class="admin-modal-head">'+
      '<div>'+
        '<h3 style="margin:0;font-size:17px">Generate Plan Activation Token</h3>'+
        '<span class="muted" style="font-size:12px">Create cryptographic single or multi-use entitlement tokens.</span>'+
      '</div>'+
      '<button type="button" class="ghost" onclick="closeTokenGenModal()">✕</button>'+
    '</div>'+
    '<div style="display:flex;flex-direction:column;gap:12px">'+
      '<div class="field">'+
        '<label>Target Plan</label>'+
        '<select id="tokenGenPlan"><option value="plus">Vehicle Owner Plus (₹69/mo or ₹708/yr)</option><option value="ultra">Garage Ultra (Workshop SaaS)</option></select>'+
      '</div>'+
      '<div class="field">'+
        '<label>Validity Duration</label>'+
        '<select id="tokenGenDuration"><option value="365">365 Days (1 Year)</option><option value="90">90 Days (Quarter)</option><option value="30">30 Days (Monthly)</option></select>'+
      '</div>'+
      '<div class="field">'+
        '<label>Usage Restriction</label>'+
        '<select id="tokenGenUsage"><option value="single">Single Use (1 Account)</option><option value="multi">Multi-Use Promotional (Max 50)</option></select>'+
      '</div>'+
      '<div class="field">'+
        '<label>Optional Mobile Number Binding (+91)</label>'+
        '<input type="text" id="tokenGenMobile" placeholder="e.g. 9876543210 (Leave blank for open redemption)">'+
      '</div>'+
      '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px">'+
        '<button type="button" class="ghost" onclick="closeTokenGenModal()">Cancel</button>'+
        '<button type="button" class="primary" onclick="generateAdminToken()">Create &amp; Reveal Token</button>'+
      '</div>'+
    '</div>'+
  '</div>';

  modal.onclick=e=>{if(e.target===modal)closeTokenGenModal();};
  document.body.appendChild(modal);
}

function closeTokenGenModal(){
  const m=document.getElementById('adminTokenGenModal');
  if(m)m.remove();
}

function generateAdminToken(){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.canManageTokens){
    toast('Permission denied: Role "'+perms.label+'" cannot generate tokens.','error');
    return;
  }
  const planEl=document.getElementById('tokenGenPlan');
  const durationEl=document.getElementById('tokenGenDuration');
  const usageEl=document.getElementById('tokenGenUsage');
  const mobileEl=document.getElementById('tokenGenMobile');
  const plan=planEl?.value||'plus';
  const duration=Number(durationEl?.value)||365;
  const usage=usageEl?.value||'single';
  const mobile=mobileEl?.value?.trim()||null;

  executeProtectedAdminAction('Generate Activation Token',async ()=>{
    closeTokenGenModal();
    const randHex=Math.random().toString(36).substring(2,6).toUpperCase()+'-'+Math.random().toString(36).substring(2,6).toUpperCase();
    const tokenCode='TD-PLUS-'+randHex;
    adminRevealedToken=tokenCode;
    openTokenRevealModal(tokenCode);

    workerPost('/api/admin/tokens',{
      token:tokenCode,
      plan:plan,
      duration_days:duration,
      max_uses:usage==='multi'?50:1,
      bound_mobile:mobile
    }).then(()=>{
      loadAdminTokens(true);
    }).catch(err=>{
      console.error('Failed to register token with backend:',err?.message||err);
    });
  });
}

function openTokenRevealModal(code){
  let old=document.getElementById('adminTokenRevealModal');
  if(old)old.remove();

  const modal=document.createElement('div');
  modal.id='adminTokenRevealModal';
  modal.className='admin-modal-overlay';
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');

  modal.innerHTML='<div class="admin-modal-box" style="text-align:center">'+
    '<div style="font-size:36px;margin-bottom:8px">🔑</div>'+
    '<h3 style="margin:0 0 6px">One-Time Token Secret Revealed</h3>'+
    '<p class="muted" style="margin:0 0 16px;font-size:13px">Copy this activation token immediately. For security, raw token secret cannot be shown again.</p>'+
    '<div style="background:#f1f5f9;border:2px dashed #94a3b8;border-radius:12px;padding:16px;display:flex;align-items:center;justify-content:space-between;gap:12px">'+
      '<code id="revealedTokenCode" style="font-size:18px;font-weight:800;color:#2563eb;letter-spacing:0.05em"></code>'+
      '<button type="button" class="primary" onclick="copyRevealedToken()">📋 Copy</button>'+
    '</div>'+
    '<div style="margin-top:20px">'+
      '<button type="button" class="ghost" onclick="closeTokenRevealModal()">Done &amp; Close</button>'+
    '</div>'+
  '</div>';

  document.body.appendChild(modal);
  const codeEl=document.getElementById('revealedTokenCode');
  if(codeEl)codeEl.textContent=code;
}

function copyRevealedToken(){
  if(adminRevealedToken&&typeof navigator!=='undefined'&&navigator.clipboard){
    navigator.clipboard.writeText(adminRevealedToken);
    toast('Token copied to clipboard!','ok');
  }else{
    toast('Token copied.','ok');
  }
}

function closeTokenRevealModal(){
  const m=document.getElementById('adminTokenRevealModal');
  if(m)m.remove();
  adminRevealedToken=null;
}

async function revokeAdminToken(tokenStr){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.canManageTokens){
    toast('Permission denied: Role "'+perms.label+'" cannot revoke tokens.','error');
    return;
  }
  if(!tokenStr)return;
  if(!confirm('Revoke activation token '+tokenStr+'?'))return;
  try{
    await workerPost('/api/admin/tokens/'+encodeURIComponent(tokenStr)+'/revoke');
    toast('Token '+tokenStr+' revoked.','ok');
    loadAdminTokens(true);
  }catch(err){
    toast('Failed to revoke token: '+(err?.message||err),'error');
  }
}

function openCreateCouponModal(){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.canManagePlans){
    toast('Permission denied: Role "'+perms.label+'" cannot create coupons.','error');
    return;
  }
  let old=document.getElementById('adminCouponModal');
  if(old)old.remove();

  const modal=document.createElement('div');
  modal.id='adminCouponModal';
  modal.className='admin-modal-overlay';
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');

  modal.innerHTML='<div class="admin-modal-box">'+
    '<div class="admin-modal-head">'+
      '<div>'+
        '<h3 style="margin:0;font-size:17px">Create Promotional Coupon</h3>'+
        '<span class="muted" style="font-size:12px">Server-verified discount codes for seasonal campaigns or garages.</span>'+
      '</div>'+
      '<button type="button" class="ghost" onclick="closeCreateCouponModal()">✕</button>'+
    '</div>'+
    '<div style="display:flex;flex-direction:column;gap:12px">'+
      '<div class="field">'+
        '<label>Coupon Code</label>'+
        '<input type="text" id="couponCodeInput" placeholder="e.g. DIWALI50, GARAGE20" style="text-transform:uppercase">'+
      '</div>'+
      '<div class="field">'+
        '<label>Discount Percentage (%)</label>'+
        '<input type="number" id="couponDiscountInput" min="1" max="100" placeholder="e.g. 20" value="20">'+
      '</div>'+
      '<div class="field">'+
        '<label>Maximum Redemptions (Optional)</label>'+
        '<input type="number" id="couponMaxUsesInput" min="1" placeholder="Leave empty for unlimited">'+
      '</div>'+
      '<div class="field">'+
        '<label>Expiry Date (Optional)</label>'+
        '<input type="date" id="couponValidUntilInput">'+
      '</div>'+
      '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px">'+
        '<button type="button" class="ghost" onclick="closeCreateCouponModal()">Cancel</button>'+
        '<button type="button" class="primary" id="btnSubmitCoupon" onclick="submitCreateCoupon()">Create Coupon</button>'+
      '</div>'+
    '</div>'+
  '</div>';

  modal.onclick=e=>{if(e.target===modal)closeCreateCouponModal();};
  document.body.appendChild(modal);
}

function closeCreateCouponModal(){
  const m=document.getElementById('adminCouponModal');
  if(m)m.remove();
}

async function submitCreateCoupon(){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.canManagePlans){
    toast('Permission denied: Role "'+perms.label+'" cannot create coupons.','error');
    return;
  }
  const code=document.getElementById('couponCodeInput')?.value?.trim()?.toUpperCase()||'';
  const discount=Number(document.getElementById('couponDiscountInput')?.value||0);
  const maxUses=Number(document.getElementById('couponMaxUsesInput')?.value)||null;
  const validUntil=document.getElementById('couponValidUntilInput')?.value||null;
  if(!code){
    toast('Coupon code is required.','error');
    return;
  }
  if(isNaN(discount)||discount<1||discount>100){
    toast('Discount must be between 1% and 100%.','error');
    return;
  }
  const btn=document.getElementById('btnSubmitCoupon');
  if(btn){btn.disabled=true;btn.textContent='Creating...';}
  try{
    await workerPost('/api/admin/coupons',{code,discount_percent:discount,max_uses:maxUses,expires_at:validUntil});
    toast('Coupon '+code+' created successfully.','ok');
    closeCreateCouponModal();
    loadAdminCoupons(true);
  }catch(err){
    toast('Failed to create coupon: '+(err?.message||err),'error');
    if(btn){btn.disabled=false;btn.textContent='Create Coupon';}
  }
}

async function deleteAdminCoupon(couponId){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.canManagePlans){
    toast('Permission denied: Role "'+perms.label+'" cannot delete coupons.','error');
    return;
  }
  if(!confirm('Deactivate and delete this promotional coupon?'))return;
  try{
    await workerDelete('/api/admin/coupons/'+encodeURIComponent(couponId));
    toast('Coupon deactivated.','ok');
    loadAdminCoupons(true);
  }catch(err){
    toast('Failed to deactivate coupon: '+(err?.message||err),'error');
  }
}

function openTeamInviteModal(){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.canManageTeam){
    toast('Permission denied: Role "'+perms.label+'" cannot invite team members.','error');
    return;
  }
  let old=document.getElementById('adminTeamInviteModal');
  if(old)old.remove();

  const modal=document.createElement('div');
  modal.id='adminTeamInviteModal';
  modal.className='admin-modal-overlay';
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');

  modal.innerHTML='<div class="admin-modal-box">'+
    '<div class="admin-modal-head">'+
      '<h3 style="margin:0">Invite Team Member</h3>'+
      '<button type="button" class="ghost" onclick="closeTeamInviteModal()">✕</button>'+
    '</div>'+
    '<div style="display:flex;flex-direction:column;gap:12px">'+
      '<div class="field"><label>Member Email</label><input type="email" id="teamInviteEmail" placeholder="admin@example.com"></div>'+
      '<div class="field">'+
        '<label>Role Clearance</label>'+
        '<select id="teamInviteRole">'+
          '<option value="support_lead">Support Lead (Ticket Triage)</option>'+
          '<option value="billing_admin">Billing Admin (Plans &amp; Tokens)</option>'+
          '<option value="auditor">Compliance Auditor (Read-Only Audit Log)</option>'+
          '<option value="super_admin">Super Admin (Full Administrative Access)</option>'+
        '</select>'+
      '</div>'+
      '<small class="muted">Invite creates an administrative profile and issues server credentials.</small>'+
      '<div id="teamInviteStatus" class="muted" role="status" aria-live="polite" style="display:none;padding:9px 11px;border-radius:8px;white-space:normal"></div>'+
      '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px">'+
        '<button type="button" class="ghost" onclick="closeTeamInviteModal()">Cancel</button>'+
        '<button type="button" class="primary" id="teamInviteSubmitBtn" onclick="sendTeamInvite()">Send Invitation</button>'+
      '</div>'+
    '</div>'+
  '</div>';

  modal.onclick=e=>{if(e.target===modal)closeTeamInviteModal();};
  document.body.appendChild(modal);
}

function closeTeamInviteModal(){
  const m=document.getElementById('adminTeamInviteModal');
  if(m)m.remove();
}

async function sendTeamInvite(){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.canManageTeam){
    toast('Permission denied: Role "'+perms.label+'" cannot invite team members.','error');
    return;
  }
  const email=document.getElementById('teamInviteEmail')?.value.trim().toLowerCase()||'';
  const role=document.getElementById('teamInviteRole')?.value||'support_lead';
  const status=document.getElementById('teamInviteStatus');
  const button=document.getElementById('teamInviteSubmitBtn');
  if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    toast('Valid member email required.','error');
    return;
  }
  executeProtectedAdminAction('Invite Administrative Team Member',async ()=>{
  if(status){status.style.display='block';status.style.background='rgba(37,99,235,.08)';status.style.color='#1d4ed8';status.textContent='Submitting invitation to server…';}
  if(button){button.disabled=true;button.textContent='Sending…';}
  try{
    const result=await workerPost('/api/admin/team/members',{email,role});
    if(status){
      status.style.background='rgba(220,38,38,.08)';status.style.color='#166534';
      if(result?.temp_password){
        status.innerHTML='Invitation sent. One-time temporary password: <code style="font-weight:700">'+esc(result.temp_password)+'</code> (Copy now; never stored).';
      }else{
        status.textContent='Invitation sent successfully to '+email+'.';
      }
    }
    toast('Team invitation sent for '+email+'.','ok');
    if(button){button.textContent='Done';button.disabled=false;button.onclick=closeTeamInviteModal;}
    loadAdminTeam(true);
  }catch(err){
    const detail=String(err?.message||'Unknown invitation error');
    if(status){status.style.background='rgba(220,38,38,.08)';status.style.color='#b91c1c';status.textContent='Invitation failed: '+detail;}
    if(button){button.textContent='Retry Invitation';button.disabled=false;}
    toast('Invitation failed: '+detail,'error');
  }
  });
}

async function revokeTeamMember(memberId){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.canManageTeam){
    toast('Permission denied: Role "'+perms.label+'" cannot revoke team members.','error');
    return;
  }
  if(!confirm('Revoke access for this administrative team member?'))return;
  try{
    await workerDelete('/api/admin/team/members/'+encodeURIComponent(memberId));
    toast('Team member access revoked.','ok');
    loadAdminTeam(true);
  }catch(err){
    toast('Failed to revoke team member: '+(err?.message||err),'error');
  }
}

async function handleUpgradeAction(id,action){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.canManagePlans){
    toast('Permission denied: Role "'+perms.label+'" cannot triage upgrade requests.','error');
    return;
  }
  const noteEl=document.getElementById('upgradeNote_'+id);
  const note=noteEl?.value?.trim()||'';
  try{
    await workerPost('/api/admin/upgrade-requests/'+encodeURIComponent(id)+'/'+encodeURIComponent(action),{note});
    toast('Upgrade request marked '+action+'.','ok');
    loadAdminUpgrades(true);
  }catch(err){
    toast('Failed to '+action+' upgrade request: '+(err?.message||err),'error');
  }
}

function updateUpgradeStatus(reqId,status){
  handleUpgradeAction(reqId,status);
}

async function exportUsersCsv(){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.canManageUsers){
    toast('Permission denied: Role "'+perms.label+'" cannot export users CSV.','error');
    return;
  }
  executeProtectedAdminAction('Export User Directory CSV',async ()=>{
    try{
      toast('Exporting Users CSV...','info');
      await workerDownloadCsv('/api/admin/users/export.csv','torq-desk-users.csv');
      toast('Users CSV downloaded successfully.','ok');
    }catch(err){
      toast('Users export failed: '+(err?.message||err),'error');
    }
  });
}

async function exportTicketsCsv(){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.canMutateTickets && !perms.canViewAudit){
    toast('Permission denied: Role "'+perms.label+'" cannot export tickets CSV.','error');
    return;
  }
  executeProtectedAdminAction('Export Support Tickets CSV',async ()=>{
    try{
      toast('Exporting Tickets CSV...','info');
      await workerDownloadCsv('/api/admin/tickets/export.csv','torq-desk-tickets.csv');
      toast('Tickets CSV downloaded successfully.','ok');
    }catch(err){
      toast('Tickets export failed: '+(err?.message||err),'error');
    }
  });
}

async function exportAuditCsv(){
  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.canViewAudit){
    toast('Permission denied: Role "'+perms.label+'" cannot export audit CSV.','error');
    return;
  }
  executeProtectedAdminAction('Export Security Audit CSV',async ()=>{
    try{
      toast('Exporting Security Audit CSV...','info');
      await workerDownloadCsv('/api/admin/audit/export.csv','torq-desk-audit.csv');
      toast('Audit CSV downloaded successfully.','ok');
    }catch(err){
      toast('Audit export failed: '+(err?.message||err),'error');
    }
  });
}

function saveFestivalBanner(){
  toast('Festival banner configuration updated.','ok');
}

async function adminView(){
  const primaryAdminEmail='rnyburia@gmail.com';
  const isCandidateAdmin = isSuperAdmin || Boolean(currentAdminRole) || (user && (user.role==='admin'||user.role==='super_admin'||String(user.email||'').trim().toLowerCase()===primaryAdminEmail));
  if(!isCandidateAdmin){
    nav('dashboard');
    return;
  }
  await loadTeamMe();
  checkForcedPasswordChange();
  checkForcedProfileCompletion();
  checkForcedTpinSetup();

  const perms=getAdminRolePermissions(currentAdminRole);
  if(!perms.allowedScreens.includes(currentAdminScreen)){
    currentAdminScreen=perms.defaultScreen;
  }
  renderAdminViewContent();
  if(!adminTickets.length&&!adminTicketsLoading&&!adminTicketsError&&perms.allowedScreens.includes('tickets')){
    await loadAdminTickets();
  }
}

window.adminView=adminView;
window.switchAdminScreen=switchAdminScreen;
window.openAdminMoreSheet=openAdminMoreSheet;
window.closeAdminMoreSheet=closeAdminMoreSheet;
window.loadAdminTickets=loadAdminTickets;
window.refreshAdminTickets=refreshAdminTickets;
window.filterAdminTicketsByStatus=filterAdminTicketsByStatus;
window.handleAdminSearch=handleAdminSearch;
window.resetAdminFilters=resetAdminFilters;
window.openAdminTicketDetails=openAdminTicketDetails;
window.closeAdminTicketDetails=closeAdminTicketDetails;
window.promptViewAsUser=promptViewAsUser;
window.openAdminUserDetails=openAdminUserDetails;
window.closeAdminUserDetails=closeAdminUserDetails;
window.saveUserPlanDraft=saveUserPlanDraft;
window.extendUserGrace=extendUserGrace;
window.suspendUserAccount=suspendUserAccount;
window.openTokenGenModal=openTokenGenModal;
window.closeTokenGenModal=closeTokenGenModal;
window.generateAdminToken=generateAdminToken;
window.openTokenRevealModal=openTokenRevealModal;
window.copyRevealedToken=copyRevealedToken;
window.closeTokenRevealModal=closeTokenRevealModal;
window.revokeAdminToken=revokeAdminToken;
window.openTeamInviteModal=openTeamInviteModal;
window.closeTeamInviteModal=closeTeamInviteModal;
window.sendTeamInvite=sendTeamInvite;
window.openCreateCouponModal=openCreateCouponModal;
window.closeCreateCouponModal=closeCreateCouponModal;
window.submitCreateCoupon=submitCreateCoupon;
window.deleteAdminCoupon=deleteAdminCoupon;
window.handleUpgradeAction=handleUpgradeAction;
window.revokeTeamMember=revokeTeamMember;
window.updateUpgradeStatus=updateUpgradeStatus;
window.exportUsersCsv=exportUsersCsv;
window.exportTicketsCsv=exportTicketsCsv;
window.exportAuditCsv=exportAuditCsv;
window.loadAdminGarages=loadAdminGarages;
window.renderScreenGarages=renderScreenGarages;
window.updateAdminGarageStatus=updateAdminGarageStatus;
window.setAdminGaragesFilter=(val)=>{adminGaragesFilter=val;renderAdminViewContent();};
window.saveFestivalBanner=saveFestivalBanner;
window.formatAdminDate=formatAdminDate;
window.updateHelpUnreadBadge=updateHelpUnreadBadge;
window.checkTicketUnreadCount=checkTicketUnreadCount;
window.startTicketUnreadPolling=startTicketUnreadPolling;
window.stopTicketUnreadPolling=stopTicketUnreadPolling;
window.openCustomerTicketDetail=openCustomerTicketDetail;
window.closeCustomerTicketDetail=closeCustomerTicketDetail;
window.sendCustomerTicketReply=sendCustomerTicketReply;
window.loadCustomerTicketDetails=loadCustomerTicketDetails;
window.openAdminTicketDetails=openAdminTicketDetails;
window.closeAdminTicketDetails=closeAdminTicketDetails;
window.handleAdminStatusChange=handleAdminStatusChange;
window.handleAdminAssigneeChange=handleAdminAssigneeChange;
window.handleAdminPriorityChange=handleAdminPriorityChange;
window.handleAdminChatToggle=handleAdminChatToggle;
window.handleAdminShowNameToggle=handleAdminShowNameToggle;
window.handleAdminSendReply=handleAdminSendReply;
window.handleAdminEnableChatWithMsg=handleAdminEnableChatWithMsg;
window.openAdminTicketViewAsUser=openAdminTicketViewAsUser;
window.closeAdminTicketViewAsUserModal=closeAdminTicketViewAsUserModal;
window.loadAdminSupportRoster=loadAdminSupportRoster;
window.isTicketSlaBreached=isTicketSlaBreached;
window.renderSlaBadge=renderSlaBadge;
window.normalizeTicketStatus=normalizeTicketStatus;
window.renderStatusBadge=renderStatusBadge;
window.renderPriorityBadge=renderPriorityBadge;
window.renderAdminListContent=renderAdminListContent;
window.loadTeamMe=loadTeamMe;
window.getAdminRolePermissions=getAdminRolePermissions;
window.checkForcedPasswordChange=checkForcedPasswordChange;
window.submitForcedPasswordChange=submitForcedPasswordChange;
window.checkForcedProfileCompletion=checkForcedProfileCompletion;
window.submitForcedProfileCompletion=submitForcedProfileCompletion;
function setCurrentAdminRole(r){
  currentAdminRole=r;
  renderAdminViewContent();
}
function getCurrentAdminRole(){
  return currentAdminRole;
}
function getCurrentAdminProfile(){
  return currentAdminProfile;
}
window.setCurrentAdminRole=setCurrentAdminRole;
window.getCurrentAdminRole=getCurrentAdminRole;
window.getCurrentAdminProfile=getCurrentAdminProfile;

function openOwnerProfile(){
 let old=document.getElementById('ownerProfileModal');if(old)old.remove();
 const p=ownerProfile||{},meta=user?.user_metadata||{};
 let m=document.createElement('div');m.id='ownerProfileModal';
 m.innerHTML='<div class="step5-modal-card"><div class="toolbar"><div><h3>Owner Profile</h3><p class="muted">Saved once and reused for vehicle reports and ownership documents.</p></div><button class="ghost" id="ownerProfileClose">✕</button></div>'+ownerProfileFields(p,meta)+'</div>';
 document.body.appendChild(m);$('ownerProfileClose').onclick=()=>m.remove();m.onclick=e=>{if(e.target===m)m.remove()};
 $('opSave').onclick=async()=>{
   const btn=$('opSave');if(btn.disabled)return;
   btn.disabled=true;btn.textContent='SAVING...';
   try{
     const r=await saveOwnerProfileValues({
       full_name:$('opName').value,
       phone:$('opPhone').value,
       address:$('opAddress').value,
       city:$('opCity').value,
       state:$('opState').value,
       pincode:$('opPincode').value
     });
     if(r.error)return toast('Profile save failed. '+dbSetupHint(r.error),'error');
     m.remove();updateIdentityUI();toast('Owner profile saved successfully.');
   }catch(err){
     console.error('Owner profile save error:',err);
     toast('Profile save failed. '+dbSetupHint(err),'error');
   }finally{
     if(document.getElementById('opSave')){
       document.getElementById('opSave').disabled=false;
       document.getElementById('opSave').textContent='SAVE PROFILE';
     }
   }
 };
}

async function openVehicleHistory(id=car?.id){
 const target=cars.find(x=>x.id===id)||car;if(!target)return;
 const qs='?car_id='+encodeURIComponent(target.id);
 try{
   const [ih,ph,rh,sh]=await Promise.all([
     workerGet('/api/insurance'+qs),
     workerGet('/api/puc'+qs),
     workerGet('/api/renewals'+qs),
     workerGet('/api/sale-history'+qs)
   ]);
   const insuranceRows=Array.isArray(ih?.data)?ih.data:[],pucRows=Array.isArray(ph?.data)?ph.data:[],renewalRows=Array.isArray(rh?.data)?rh.data:[],saleRows=Array.isArray(sh?.data)?sh.data:[];
 let old=document.getElementById('vehicleHistoryModal');if(old)old.remove();
 let m=document.createElement('div');m.id='vehicleHistoryModal';
 m.innerHTML='<div class="step5-modal-card history-modal"><div class="toolbar"><div><h3>'+esc(target.registration_no)+' • Compliance History</h3><p class="muted">Server-side historical snapshots remain linked to this vehicle.</p></div><button class="ghost" id="vhClose">✕</button></div>'+
 '<div class="history-section"><h4>Insurance History</h4><div class="table-scroll"><table class="table"><thead><tr><th>Date</th><th>Company</th><th>Policy</th><th>Expiry</th><th>Event</th></tr></thead><tbody>'+(insuranceRows.length?insuranceRows.map(x=>'<tr><td>'+esc(formatDateNice(x.created_at?.slice(0,10)))+'</td><td>'+esc(x.insurance_company)+'</td><td>'+esc(x.policy_number)+'</td><td>'+esc(formatDateNice(x.expiry_date))+'</td><td>'+esc(x.event_type)+'</td></tr>').join(''):'<tr><td colspan="5">No history recorded yet.</td></tr>')+'</tbody></table></div></div>'+
 '<div class="history-section"><h4>PUC History</h4><div class="table-scroll"><table class="table"><thead><tr><th>Date</th><th>Certificate</th><th>State</th><th>Expiry</th><th>Event</th></tr></thead><tbody>'+(pucRows.length?pucRows.map(x=>'<tr><td>'+esc(formatDateNice(x.created_at?.slice(0,10)))+'</td><td>'+esc(x.certificate_number)+'</td><td>'+esc(x.state)+'</td><td>'+esc(formatDateNice(x.expiry_date))+'</td><td>'+esc(x.event_type)+'</td></tr>').join(''):'<tr><td colspan="5">No history recorded yet.</td></tr>')+'</tbody></table></div></div>'+
 '<div class="history-section"><h4>Policy Renewal History</h4><div class="table-scroll"><table class="table"><thead><tr><th>Date</th><th>Type</th><th>Old Expiry</th><th>New Expiry</th><th>Source</th></tr></thead><tbody>'+(renewalRows.length?renewalRows.map(x=>'<tr><td>'+esc(formatDateNice(x.renewal_date))+'</td><td>'+esc(x.policy_type?.toUpperCase())+'</td><td>'+esc(formatDateNice(x.old_expiry))+'</td><td>'+esc(formatDateNice(x.new_expiry))+'</td><td>'+esc(x.source)+'</td></tr>').join(''):'<tr><td colspan="5">No renewal history recorded yet.</td></tr>')+'</tbody></table></div></div>'+
 '<div class="history-section"><h4>Sale History</h4><div class="table-scroll"><table class="table"><thead><tr><th>Sale Date</th><th>Buyer</th><th>RTO</th><th>Financier</th><th>Status</th></tr></thead><tbody>'+(saleRows.length?saleRows.map(x=>'<tr><td>'+esc(formatDateNice(x.sale_date))+'</td><td>'+esc(x.buyer_name)+'</td><td>'+esc(x.buyer_rto)+'</td><td>'+esc(x.financier)+'</td><td>'+esc(x.status)+'</td></tr>').join(''):'<tr><td colspan="5">No sale history — vehicle is '+(target.vehicle_status==='sold'?'marked SOLD':'active')+'.</td></tr>')+'</tbody></table></div></div></div>';
 document.body.appendChild(m);$('vhClose').onclick=()=>m.remove();m.onclick=e=>{if(e.target===m)m.remove()};
 }catch(err){toast('Compliance history could not be loaded: '+(err?.message||err),'error');}
}
let fleetSearchTerm='';
let fleetFilter='all';
let fleetPage=1;
let fleetPageSize=10;

function carsView(){
 const container=$('carsList');
 if(!container)return;
 const total=cars.length;
 const activeCount=cars.filter(c=>c.vehicle_status!=='sold').length;
 const soldCount=cars.filter(c=>c.vehicle_status==='sold').length;
 const attentionCount=cars.filter(c=>{
   const i=st(c.insurance_expiry)[1],p=st(c.puc_expiry)[1];
   return i==='bad'||p==='bad'||i==='warn'||p==='warn';
 }).length;

 let list=cars;
 if(fleetFilter==='active')list=list.filter(c=>c.vehicle_status!=='sold');
 else if(fleetFilter==='sold')list=list.filter(c=>c.vehicle_status==='sold');
 else if(fleetFilter==='attention')list=list.filter(c=>{
   const i=st(c.insurance_expiry)[1],p=st(c.puc_expiry)[1];
   return i==='bad'||p==='bad'||i==='warn'||p==='warn';
 });

 if(fleetSearchTerm){
   const q=fleetSearchTerm.trim().toLowerCase();
   list=list.filter(c=>
     (c.registration_no&&c.registration_no.toLowerCase().includes(q))||
     (c.make_model&&c.make_model.toLowerCase().includes(q))||
     (c.vin&&c.vin.toLowerCase().includes(q))||
     (c.fuel&&c.fuel.toLowerCase().includes(q))||
     (c.owner_name&&c.owner_name.toLowerCase().includes(q))
   );
 }

 const filteredCount=list.length;
 const totalPages=Math.max(1,Math.ceil(filteredCount/fleetPageSize));
 if(fleetPage>totalPages)fleetPage=totalPages;
 if(fleetPage<1)fleetPage=1;

 const startIndex=(fleetPage-1)*fleetPageSize;
 const pageItems=fleetPageSize===0?list:list.slice(startIndex,startIndex+fleetPageSize);

 let html='<div class="step5-toolbar fleet-toolbar">'+
   '<div class="fleet-title-wrap">'+
     '<b>Vehicle Fleet &amp; Registrations <span class="fleet-count-badge">'+total+'</span></b>'+
     '<span class="muted">Each vehicle keeps its own independent service history, documents, and compliance records.</span>'+
   '</div>'+
   '<div class="fleet-top-actions">'+
     '<button type="button" class="primary" onclick="openNewCarModal()">＋ Add Vehicle</button>'+
     (total>1?'<button type="button" class="ghost" onclick="window.openVehicleSwitcher()">⌁ Quick Switcher</button>':'')+
     '<button type="button" class="ghost" onclick="nav(\'owner\')">🛡️ Account &amp; Security</button>'+
   '</div>'+
 '</div>';

 if(total>0){
   html+='<div class="fleet-metrics-bar">'+
     '<div class="fleet-filter-chips">'+
       '<button type="button" class="fleet-chip '+(fleetFilter==='all'?'active':'')+'" onclick="setFleetFilter(\'all\')">All Vehicles <span class="chip-count">'+total+'</span></button>'+
       '<button type="button" class="fleet-chip '+(fleetFilter==='active'?'active':'')+'" onclick="setFleetFilter(\'active\')">Active <span class="chip-count">'+activeCount+'</span></button>'+
       '<button type="button" class="fleet-chip '+(fleetFilter==='sold'?'active':'')+'" onclick="setFleetFilter(\'sold\')">Sold <span class="chip-count">'+soldCount+'</span></button>'+
       '<button type="button" class="fleet-chip chip-warn '+(fleetFilter==='attention'?'active':'')+'" onclick="setFleetFilter(\'attention\')">Needs Attention <span class="chip-count">'+attentionCount+'</span></button>'+
     '</div>'+
     '<div class="fleet-search-wrap">'+
       '<input id="fleetSearchInput" type="search" class="fleet-search-input" placeholder="Search fleet by plate, model, VIN..." value="'+esc(fleetSearchTerm)+'" oninput="onFleetSearch(this.value)">'+
     '</div>'+
   '</div>';

   if(!pageItems.length){
     html+='<div class="card empty-fleet-search" style="margin-top:16px;text-align:center;padding:40px 20px">'+
       '<p class="muted">No vehicles matched your search criteria ("'+esc(fleetSearchTerm)+'").</p>'+
       '<button type="button" class="ghost" onclick="clearFleetFilters()">Clear Filters</button>'+
     '</div>';
   }else{
     html+=pageItems.map(c=>{
       const isActive=car?.id===c.id;
       const ins=st(c.insurance_expiry);
       const puc=st(c.puc_expiry);
       return '<div class="card vehicle-card '+(c.vehicle_status==='sold'?'vehicle-sold-card ':'')+(isActive?'vehicle-card-active':'')+'">'+
         '<div class="vehicle-card-inner">'+
           '<div class="vehicle-card-left">'+
             '<div class="hsrp-plate"><div class="hsrp-ind"><span class="hsrp-chakra">☸</span><span>IND</span></div><span class="hsrp-number">'+esc(c.registration_no)+'</span></div>'+
             '<div class="vehicle-meta">'+
               '<h3>'+esc(c.make_model||'Vehicle')+'</h3>'+
               '<p class="muted">'+[c.model_year,c.fuel,(Number(c.current_km||0).toLocaleString('en-IN')+' KM')].filter(Boolean).join(' • ')+'</p>'+
             '</div>'+
           '</div>'+
           '<div class="vehicle-card-center">'+
             '<div class="vehicle-pills">'+
               '<span class="doc-badge '+ins[1]+'">INS: '+ins[0]+'</span>'+
               '<span class="doc-badge '+puc[1]+'">PUC: '+puc[0]+'</span>'+
               (c.vehicle_status==='sold'?'<span class="sold-badge">SOLD</span>':(isActive?'<span class="status ok">ACTIVE VEHICLE</span>':''))+
             '</div>'+
           '</div>'+
           '<div class="vehicle-card-actions">'+
             (!isActive?'<button class="primary" onclick="openCar(\''+c.id+'\')">Select Vehicle</button>':'<button class="ghost" onclick="nav(\'dashboard\')">Open Overview</button>')+
             '<button class="ghost" onclick="openVehicleHistory(\''+c.id+'\')">Compliance</button>'+
             (c.vehicle_status==='sold'?'':'<button class="ghost" onclick="editSpecificCar(\''+c.id+'\')">Edit</button>')+
           '</div>'+
         '</div>'+
       '</div>';
     }).join('');

     if(filteredCount>fleetPageSize){
       const startNum=startIndex+1;
       const endNum=Math.min(startIndex+fleetPageSize,filteredCount);
       html+='<div class="fleet-pagination-bar">'+
         '<span class="muted pagination-info">Showing '+startNum+'–'+endNum+' of '+filteredCount+' vehicles</span>'+
         '<div class="pagination-buttons">'+
           '<button type="button" class="ghost btn-sm" '+(fleetPage<=1?'disabled':'')+' onclick="changeFleetPage('+(fleetPage-1)+')">← Previous</button>'+
           '<span class="pagination-page-label">Page '+fleetPage+' of '+totalPages+'</span>'+
           '<button type="button" class="ghost btn-sm" '+(fleetPage>=totalPages?'disabled':'')+' onclick="changeFleetPage('+(fleetPage+1)+')">Next →</button>'+
         '</div>'+
       '</div>';
     }
   }
 }else{
   html+='<div class="card empty-garage-card" style="margin-top:20px;text-align:center;padding:48px 24px">'+
     '<div class="empty-garage-icon"><svg aria-hidden="true" style="width:48px;height:48px;stroke:var(--c-accent)"><use href="#td-icon-car"/></svg></div>'+
     '<h3>No vehicles in your garage</h3>'+
     '<p class="muted" style="max-width:440px;margin:8px auto 20px">Add your car registration number to start recording services, uploading insurance policies, and generating reports.</p>'+
     '<button type="button" class="primary" style="padding:12px 24px" onclick="showCarForm()">＋ Add Your First Car</button>'+
   '</div>';
 }
 container.innerHTML=html;
}

window.setFleetFilter=function(f){fleetFilter=f;fleetPage=1;carsView()};
window.onFleetSearch=function(v){fleetSearchTerm=v||'';fleetPage=1;carsView();const el=$('fleetSearchInput');if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length)}};
window.clearFleetFilters=function(){fleetSearchTerm='';fleetFilter='all';fleetPage=1;carsView()};
window.changeFleetPage=function(p){fleetPage=p;carsView()};

window.openVehicleSwitcher=function(){
 if(!cars.length)return;
 let old=document.getElementById('vehicleSwitcherModal');if(old)old.remove();
 const m=document.createElement('div');
 m.id='vehicleSwitcherModal';
 m.style='position:fixed;inset:0;background:rgba(15,23,42,.6);backdrop-filter:blur(8px);display:grid;place-items:center;z-index:10030;padding:16px';
 let searchVal='';
 const renderList=()=>{
   const q=searchVal.trim().toLowerCase();
   const filtered=cars.filter(c=>
     !q||
     (c.registration_no&&c.registration_no.toLowerCase().includes(q))||
     (c.make_model&&c.make_model.toLowerCase().includes(q))
   );
   const listEl=m.querySelector('#switcherList');
   if(!listEl)return;
   if(!filtered.length){
     listEl.innerHTML='<div style="text-align:center;padding:24px;color:#64748b">No matching vehicles found</div>';
     return;
   }
   listEl.innerHTML=filtered.map(c=>{
     const isSel=car?.id===c.id;
     return '<div class="switcher-item '+(isSel?'is-selected':'')+'" onclick="window.selectAndCloseSwitcher(\''+c.id+'\')">'+
       '<div class="hsrp-plate hsrp-mini"><span class="hsrp-number">'+esc(c.registration_no)+'</span></div>'+
       '<div class="switcher-meta"><b>'+esc(c.make_model||'Vehicle')+'</b><small>'+esc([c.model_year,c.fuel].filter(Boolean).join(' • '))+'</small></div>'+
       (isSel?'<span class="status ok">ACTIVE</span>':(c.vehicle_status==='sold'?'<span class="sold-badge">SOLD</span>':''))+
     '</div>';
   }).join('');
 };
 m.innerHTML='<div class="switcher-dialog">'+
   '<div class="switcher-header">'+
     '<div><b>Switch Active Vehicle</b><span class="muted" style="display:block;font-size:12px">Search across all '+cars.length+' vehicles in your garage</span></div>'+
     '<button type="button" class="ghost btn-sm" id="switcherClose">✕</button>'+
   '</div>'+
   '<div class="switcher-search-box">'+
     '<input id="switcherSearch" type="search" placeholder="Type vehicle registration or model..." autocomplete="off">'+
   '</div>'+
   '<div id="switcherList" class="switcher-list"></div>'+
 '</div>';
 document.body.appendChild(m);
 renderList();
 const searchInput=m.querySelector('#switcherSearch');
 if(searchInput){
   searchInput.focus();
   searchInput.oninput=e=>{searchVal=e.target.value;renderList()};
 }
 m.querySelector('#switcherClose').onclick=()=>m.remove();
 m.onclick=e=>{if(e.target===m)m.remove()};
 window.selectAndCloseSwitcher=async id=>{
   m.remove();
   await openCar(id);
 };
};
window.editSpecificCar=async id=>{let previous=car;car=cars.find(x=>x.id===id)||previous;if(car?.vehicle_status==='sold'){toast('Sold vehicle is read-only. Open History to view its complete lifecycle.','error');car=previous;return}updateCarTab();await window.editCar();await loadCars();let fresh=cars.find(x=>x.id===car?.id);if(fresh)car=fresh;updateCarTab();await loadData();carsView()};
function guard(){if(!car){$('guard').innerHTML='<div class="dangerbox">Please add/select a car first.</div>';$('formCard').style.display='none';return}if(car.vehicle_status==='sold'){$('guard').innerHTML='<div class="dangerbox"><b>VEHICLE SOLD</b> — Service entries are locked. Historical records and documents remain available.</div>';$('formCard').style.display='none';return}if(!car.insurance_expiry||!car.puc_expiry){$('guard').innerHTML='<div class="dangerbox"><b>ENTRY BLOCKED</b> — Add Insurance and PUC expiry dates to this car first.</div>';$('formCard').style.display='none'}else{$('guard').innerHTML=(st(car.insurance_expiry)[0]==='EXPIRED'||st(car.puc_expiry)[0]==='EXPIRED')?'<div class="dangerbox"><b>WARNING</b> — Insurance/PUC is expired. Save only if you confirm.</div>':'';$('formCard').style.display='block'}}
renderServiceItems(); $('type').onchange=renderServiceItems;
$('autoDescription')?.addEventListener('click',generateServiceDescription);
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
     p_car_id:car.id,p_service_date:dateInputValue('date')||istTodayClient(),p_odometer_km:km,p_record_type:$('type').value,
     p_description:$('description').value.trim()||null,p_parts_cost:parts,p_labour_cost:labour,p_other_cost:other,
     p_workshop:$('workshop').value.trim()||null,p_invoice_no:$('invoice').value.trim()||null,p_notes:$('notes').value.trim()||null,p_items:chosen
   });
   if(error)throw error;
   if(!data)throw new Error('No record ID returned by server.');
   if(km>Number(car.current_km||0))car.current_km=km;
   resetRecordForm();
   toast($('type').value+' Record saved successfully!');
   await loadData(true);nav('history');
 }catch(err){
   toast('Failed to save service record: '+(err?.message||'Please run the Step 4 SQL migration first.'),'error');
 }finally{
   hideOperationOverlay();btn.disabled=false;btn.classList.remove('is-saving');btn.textContent=oldText;
 }
};
function renderHistory(){
 if(!car){
  const tb=$('historyTable');if(tb)tb.innerHTML='<div class="card empty-state-card" style="text-align:center;padding:40px 20px"><p class="muted">Please select or add a vehicle to view its maintenance records.</p><button class="primary" onclick="window.openNewCarModal()">＋ Add Car</button></div>';
  const sumEl=$('historySpendSummary');if(sumEl)sumEl.innerHTML='';
  return;
 }
 let currentYear=$('year')?.value||'all';
 let currentType=$('historyType')?.value||'all';
 let ys=[...new Set(records.map(r=>new Date(r.service_date).getFullYear()))].sort((a,b)=>b-a);
 if($('year')){
   $('year').innerHTML='<option value="all">All Years</option>'+ys.map(y=>'<option value="'+y+'">'+y+'</option>').join('');
   if(!['all',...ys.map(String)].includes(currentYear))currentYear='all';
   $('year').value=currentYear;
 }
 let rs=records.filter(r=>!r.car_id||r.car_id===car.id);
 if(currentYear!=='all')rs=rs.filter(r=>new Date(r.service_date).getFullYear()===+currentYear);
 if(currentType!=='all')rs=rs.filter(r=>(r.record_type||'Other')===currentType);

 const totalParts=rs.reduce((s,r)=>s+Number(r.parts_cost||0),0);
 const totalLabour=rs.reduce((s,r)=>s+Number(r.labour_cost||0),0);
 const totalOther=rs.reduce((s,r)=>s+Number(r.other_cost||0),0);
 const totalCost=rs.reduce((s,r)=>s+Number(r.total_cost||0),0);

 const sumEl=$('historySpendSummary');
 if(sumEl){
   sumEl.innerHTML=
     '<div class="spend-metric-card"><span>TOTAL PARTS</span><b>'+money(totalParts)+'</b></div>'+
     '<div class="spend-metric-card"><span>TOTAL LABOUR</span><b>'+money(totalLabour)+'</b></div>'+
     '<div class="spend-metric-card"><span>OTHER / MISC</span><b>'+money(totalOther)+'</b></div>'+
     '<div class="spend-metric-card spend-metric-total"><span>FILTERED SPEND</span><b>'+money(totalCost)+'</b><small>'+rs.length+' service records</small></div>';
 }

 if(!rs.length){
   $('historyTable').innerHTML='<div style="text-align:center;padding:36px 16px"><p class="muted" style="margin-bottom:14px">No service records match the selected filters for '+esc(car.registration_no)+'.</p><button class="primary" onclick="window.openAddRecord()">＋ Add Service Record</button></div>';
   return;
 }

 const rows=rs.map(r=>{
   const items=(r.record_items||[]).map(x=>x.item_name).join(', ');
   const type=r.record_type||'Other';
   const typeBadge='<span class="status '+(type==='Regular Service'?'ok':type==='Accident / Repair'?'bad':'warn')+'">'+esc(type)+'</span>';
   return '<tr>'+
     '<td><b>'+esc(formatDateNice(r.service_date))+'</b></td>'+
     '<td>'+esc(Number(r.odometer_km||0).toLocaleString('en-IN'))+' KM</td>'+
     '<td>'+typeBadge+'</td>'+
     '<td><b>'+esc(r.workshop||'Workshop')+'</b><br>'+esc(r.description||'')+(items?'<br><small class="muted">'+esc(items)+'</small>':'')+(r.invoice_no?'<br><small class="muted">Inv: '+esc(r.invoice_no)+'</small>':'')+'</td>'+
     '<td><b>'+money(r.total_cost)+'</b><br><small class="muted">P: '+money(r.parts_cost)+' | L: '+money(r.labour_cost)+'</small></td>'+
     '<td><div style="display:flex;gap:6px"><button class="ghost" onclick="editServiceRecord(\''+r.id+'\')">Edit</button><button class="danger" onclick="deleteServiceRecord(\''+r.id+'\')">Delete</button></div></td>'+
   '</tr>';
 }).join('');
 $('historyTable').innerHTML='<div class="table-scroll"><table class="table"><thead><tr><th>Date</th><th>KM</th><th>Type</th><th>Workshop &amp; Work</th><th>Cost</th><th>Actions</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
$('year')?.addEventListener('change',renderHistory);
$('historyType')?.addEventListener('change',renderHistory);
async function editServiceRecord(id){
 const r=records.find(x=>x.id===id);if(!r||!car)return;
 let old=document.getElementById('editServiceRecordModal');if(old)old.remove();
 let m=document.createElement('div');m.id='editServiceRecordModal';
 m.innerHTML='<div class="edit-modal-card"><div class="toolbar"><div><h2>Edit Service Record</h2><p class="muted">Update the complete service entry and item details.</p></div><button class="ghost" id="esrClose">Cancel</button></div><div class="form"><div class="field"><label>Date</label>'+dateInputHtml('esrDate',r.service_date)+'</div><div class="field"><label>Odometer / KM</label><input id="esrKm" type="number" value="'+esc(r.odometer_km||0)+'"></div><div class="field"><label>Record Type</label><select id="esrType">'+Object.keys(serviceItems).map(x=>'<option>'+esc(x)+'</option>').join('')+'</select></div><div class="field"><label>Workshop</label><input id="esrWorkshop" value="'+esc(r.workshop||'')+'"></div><div class="field full"><label>Description</label><textarea id="esrDescription">'+esc(r.description||'')+'</textarea></div><div class="field"><label>Parts Cost</label><input id="esrParts" type="number" min="0" value="'+esc(r.parts_cost||0)+'"></div><div class="field"><label>Labour</label><input id="esrLabour" type="number" min="0" value="'+esc(r.labour_cost||0)+'"></div><div class="field"><label>Other</label><input id="esrOther" type="number" min="0" value="'+esc(r.other_cost||0)+'"></div><div class="field"><label>Invoice No.</label><input id="esrInvoice" value="'+esc(r.invoice_no||'')+'"></div><div class="field"><label>Notes</label><input id="esrNotes" value="'+esc(r.notes||'')+'"></div><div class="full"><b id="esrItemsTitle">Service Items</b><div id="esrItems" class="itemgrid" style="margin-top:8px"></div></div><div class="full"><button class="primary" id="esrSave">SAVE CHANGES</button></div></div></div>';
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
     const {data,error}=await db.rpc('update_service_record',{p_record_id:id,p_car_id:car.id,p_service_date:dateInputValue('esrDate'),p_odometer_km:Number($('esrKm').value||0),p_record_type:$('esrType').value,p_description:$('esrDescription').value.trim()||null,p_parts_cost:Number($('esrParts').value||0),p_labour_cost:Number($('esrLabour').value||0),p_other_cost:Number($('esrOther').value||0),p_workshop:$('esrWorkshop').value.trim()||null,p_invoice_no:$('esrInvoice').value.trim()||null,p_notes:$('esrNotes').value.trim()||null,p_items:items});
     if(error)throw error;m.remove();toast('Service record updated successfully!');await loadData(true);renderHistory();
   }catch(err){toast('Failed to update service record: '+(err?.message||'Run Step 4 SQL migration first.'),'error')}finally{btn.disabled=false;btn.textContent='SAVE CHANGES'}
 };
}
async function deleteServiceRecord(id){
 const r=records.find(x=>x.id===id);if(!r||!car)return;
 if(!confirm('Delete this service record permanently? Its service-item details will also be deleted.'))return;
 const btns=[...document.querySelectorAll('.table button')];btns.forEach(b=>b.disabled=true);
 try{
   const {error}=await db.rpc('delete_service_record',{p_record_id:id,p_car_id:car.id});
   if(error)throw error;toast('Service record deleted permanently!');await loadData(true);renderHistory();
 }catch(err){toast('Failed to delete service record: '+(err?.message||'Run Step 4 SQL migration first.'),'error')}finally{btns.forEach(b=>b.disabled=false)}
}
function fyLabel(date){let d=new Date(date);let y=d.getFullYear();let start=y-(d.getMonth()<3?1:0);return start+'-'+String(start+1).slice(-2)}
function docTypeLabel(d){return d.document_type==='other'?(d.document_name||'Other'):d.document_type==='rc'?'Registration Certificate':d.document_type==='puc'?'PUC':'Insurance'}
function docExpired(d){return (d.document_type==='insurance'||d.document_type==='puc'||d.document_type==='rc')&&!!d.document_expiry&&!!dateOnlyEnd(d.document_expiry)&&dateOnlyEnd(d.document_expiry)<new Date()}
function docExpiringSoon(d){return (d.document_type==='insurance'||d.document_type==='puc'||d.document_type==='rc')&&!!d.document_expiry&&!docExpired(d)&&((dateOnlyEnd(d.document_expiry)-new Date())/86400000)<=15}
function docStatus(d){if(d.archived_at)return ['Archived','archived'];if(docExpired(d))return ['Expired','expired'];if(docExpiringSoon(d))return ['Expiring Soon','soon'];return ['Active','active']}
async function archiveExpiredDocuments(){return}
function docTypeIcon(type){
 if(type==='insurance')return '<svg class="doc-svg-icon" aria-hidden="true"><use href="#td-icon-shield"/></svg>';
 if(type==='puc')return '<svg class="doc-svg-icon" aria-hidden="true"><use href="#td-icon-route"/></svg>';
 if(type==='rc')return '<svg class="doc-svg-icon" aria-hidden="true"><use href="#td-icon-book"/></svg>';
 return '<svg class="doc-svg-icon" aria-hidden="true"><use href="#td-icon-file"/></svg>';
}
function docFileExt(fileName){
 if(!fileName)return 'DOC';
 const parts=fileName.split('.');
 if(parts.length>1){
  const ext=parts.pop().toUpperCase();
  if(ext.length<=4)return ext;
 }
 return 'FILE';
}
function renderDocFlipCard(d){
 return renderDocRow(d);
}
function handleDocumentActionClick(event){
 const button=event.target.closest('.doc-action');
 if(!button)return;
 event.preventDefault();
 event.stopPropagation();
 const id=button.dataset.id;
 const action=button.dataset.action;
 const doc=docs.find(x=>x.id===id);
 if(!doc)return toast('Document was not found. Refresh and try again.','error');
 if(action==='preview')return openDocumentPreview(doc.id,doc.storage_path,doc.file_name);
 if(action==='download')return downloadDoc(doc.id,doc.storage_path);
 if(action==='renew')return openDocUploader(doc.document_type);
 if(action==='edit-transfer')return openEditTransferDoc(doc.id);
 if(action==='delete')return deleteDoc(doc.id,doc.storage_path,!!doc.archived_at);
}
document.addEventListener('click',handleDocumentActionClick,true);

function renderDocRow(d){
 let [status,cls]=docStatus(d),title=docTypeLabel(d);
 const safePath=(d.storage_path||'').replace(/'/g,"\\'");
 const safeName=(d.file_name||'').replace(/'/g,"\\'");
 const ext=docFileExt(d.file_name);
 const icon=docTypeIcon(d.document_type);
 const renewBtn=(d.document_type==='insurance'||d.document_type==='puc')?
   '<button type="button" class="primary doc-action" data-action="renew" data-id="'+esc(d.id)+'" data-type="'+esc(d.document_type)+'" onclick="openDocUploader(\''+d.document_type+'\')"><svg class="inline-svg-icon-xs" aria-hidden="true"><use href="#td-icon-refresh"/></svg> <span>Renew</span></button>':'';
 const isTransferDoc = (d.archive_name === 'Transfer Documents' || d.archive_name === 'Form 29 & 30' || (d.document_name && /Transfer/i.test(d.document_name)));
 const editTransferBtn = isTransferDoc ?
   '<button type="button" class="ghost doc-action" data-action="edit-transfer" data-id="'+esc(d.id)+'" onclick="openEditTransferDoc(\''+esc(d.id)+'\')"><svg class="inline-svg-icon-xs" aria-hidden="true"><use href="#td-icon-wrench"/></svg> <span>Edit / Regenerate</span></button>' : '';
 return '<div class="doc-row '+cls+'" data-doc-id="'+esc(d.id)+'">'+
   '<div class="doc-row-body">'+
     '<div class="doc-icon-wrap" aria-hidden="true">'+icon+'</div>'+
     '<div class="doc-details">'+
       '<div class="doc-title-row">'+
         '<h4 class="doc-title">'+esc(title)+'</h4>'+
         '<span class="doc-badge '+cls+'">'+status+'</span>'+
       '</div>'+
       '<div class="doc-filename-badge" title="'+esc(d.file_name||'Untitled document')+'">'+
         '<span class="doc-ext-tag">'+esc(ext)+'</span>'+
         '<span class="doc-filename-text">'+esc(d.file_name||'Untitled document')+'</span>'+
       '</div>'+
       '<div class="doc-meta-row">'+
         '<span class="doc-meta-item"><svg class="inline-svg-icon-xs" aria-hidden="true"><use href="#td-icon-calendar"/></svg> '+formatDateNice(d.created_at?.slice(0,10))+'</span>'+
         (d.document_expiry?'<span class="doc-meta-item doc-expiry '+(status==='Expired'?'expired':'')+'"><svg class="inline-svg-icon-xs" aria-hidden="true"><use href="#td-icon-clock"/></svg> '+(status==='Expired'?'Expired: ':'Expiry: ')+esc(formatDateNice(d.document_expiry))+'</span>':'')+
         (d.archived_at?'<span class="doc-meta-archive"><svg class="inline-svg-icon-xs" aria-hidden="true"><use href="#td-icon-folder"/></svg> '+esc(d.archive_name==='Form 29 & 30'?'Transfer Documents':(d.archive_name||'Archive'))+'</span>':'')+
       '</div>'+
     '</div>'+
   '</div>'+
   '<div class="doc-actions">'+
     '<button type="button" class="ghost doc-action" data-action="preview" data-id="'+esc(d.id)+'" onclick="openDocumentPreview(\''+d.id+'\',\''+safePath+'\',\''+safeName+'\')"><svg class="inline-svg-icon-xs" aria-hidden="true"><use href="#td-icon-eye"/></svg> <span>Preview</span></button>'+
     '<button type="button" class="ghost doc-action" data-action="download" data-id="'+esc(d.id)+'" onclick="downloadDoc(\''+d.id+'\',\''+safePath+'\')"><svg class="inline-svg-icon-xs" aria-hidden="true"><use href="#td-icon-download"/></svg> <span>Download</span></button>'+
     editTransferBtn+
     renewBtn+
     '<button type="button" class="danger doc-delete doc-action" data-action="delete" data-id="'+esc(d.id)+'" '+(deletePasswordChanged()?'':'disabled')+' onclick="deleteDoc(\''+d.id+'\',\''+safePath+'\','+(d.archived_at?'true':'false')+')"><svg class="inline-svg-icon-xs" aria-hidden="true"><use href="#td-icon-trash"/></svg> <span>Delete</span></button>'+
   '</div>'+
 '</div>';
}
window.renderDocRow=renderDocRow;
async function docsView(){
 if(!car){
  const dl=$('docList');if(dl)dl.innerHTML='<div class="card empty-state-card" style="text-align:center;padding:40px 20px"><p class="muted">Please select or add a vehicle first to view its private document vault.</p><button class="primary" onclick="window.openNewCarModal()">＋ Add Car</button></div>';
  return;
 }
 const isStorageExceeded = Boolean(userPlanStatus && Number(userPlanStatus.storage_mb_used || 0) >= Number(userPlanStatus.storage_mb_limit || 10));
 const storageBanner = isStorageExceeded ? '<div class="plan-storage-banner"><div style="display:flex;align-items:center;gap:10px"><span style="font-size:20px">💾</span><div><b>Vault Storage Limit Reached</b><p style="margin:2px 0 0;font-size:12px">You have used '+userPlanStatus.storage_mb_used+' of '+userPlanStatus.storage_mb_limit+' MB on your current plan. Upgrade to expand your encrypted document vault.</p></div></div><button type="button" class="primary btn-sm" onclick="openPlanComparisonModal()">Upgrade Storage</button></div>' : '';
 let active=docs.filter(d=>!d.archived_at),arch=docs.filter(d=>d.archived_at),groups={insurance:[],puc:[],rc:[],other:[]};
 active.forEach(d=>(groups[d.document_type]||groups.other).push(d));
 let html=storageBanner+'<div class="doc-grid">';
 const catConfigs=[
  ['rc','Registration Certificate','td-icon-book'],
  ['puc','PUC Certificate','td-icon-route'],
  ['insurance','Insurance Policy','td-icon-shield'],
  ['other','Other Documents','td-icon-file']
 ];
 catConfigs.forEach(([key,label,iconId])=>{
  const list=groups[key]||[];
  html+='<div class="doc-col">'+
    '<div class="doc-col-head">'+
      '<div><span class="doc-col-icon"><svg class="inline-svg-icon" aria-hidden="true"><use href="#'+iconId+'"/></svg></span><b>'+label+'</b></div>'+
      '<span class="doc-col-count">'+list.length+'</span>'+
    '</div>'+
    (list.length?
      '<div class="doc-col-list">'+list.map(renderDocRow).join('')+'</div>':
      '<div class="doc-empty"><p>No '+label+' uploaded</p><button type="button" class="ghost btn-sm doc-empty-add-btn" onclick="openDocUploader(\''+key+'\')"><svg class="inline-svg-icon-xs" aria-hidden="true"><use href="#td-icon-plus"/></svg> <span>Add '+label+'</span></button></div>')+
  '</div>';
 });
 html+='</div>';
 if(!deletePasswordChanged())html+='<div class="doc-security-notice"><svg class="inline-svg-icon" aria-hidden="true"><use href="#td-icon-lock"/></svg> <span>Default security PIN (1234) in use. Change your security PIN above to enable permanent document deletion.</span></div>';
 if(arch.length){
  let by={};
  arch.forEach(d=>{let k=(d.archive_name==='Form 29 & 30'?'Transfer Documents':d.archive_name)||('Archive-'+fyLabel(d.document_expiry||d.created_at));(by[k]??=[]).push(d)});
  html+='<div class="doc-archive"><div class="doc-archive-head"><svg class="inline-svg-icon" aria-hidden="true"><use href="#td-icon-folder"/></svg> <span>Archived Documents</span></div>'+Object.keys(by).sort().reverse().map(k=>'<details><summary>'+esc(k)+' <span>'+by[k].length+'</span></summary>'+by[k].map(renderDocRow).join('')+'</details>').join('')+'</div>';
 }
 $('docList').innerHTML=html;
 if(active.some(d=>docExpired(d))&&window.__expiryPopupFor!==car.id){
  window.__expiryPopupFor=car.id;showDocumentExpiryPopup();
 }
}
function showDocumentExpiryPopup(){
 if(document.getElementById('docExpiryPopup'))return;
 let expired=docs.filter(d=>docExpired(d)&&!d.archived_at);
 let firstType=expired[0]?.document_type||'';
 let names=expired.map(d=>docTypeLabel(d)+' for Vehicle '+(car?.registration_no||'')).join(' and ');
 let w=document.createElement('div');w.id='docExpiryPopup';
 w.innerHTML='<div class="doc-popup"><div class="doc-popup-icon"><svg class="inline-svg-icon" style="width:36px;height:36px" aria-hidden="true"><use href="#td-icon-shield"/></svg></div><h3>Document Expired</h3><p>Your '+esc(names)+' expired. Please upload the new document to stay compliant.</p><button class="primary" id="docExpiryRenew">＋ Renew / Upload New Document</button><button class="ghost" id="docExpiryLater">Later</button></div>';
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
function parseUserDate(v){const s=String(v||'').trim();if(!s)return null;let m=s.match(/^(\d{2})-(\d{2})-(\d{4})$/);if(m){const d=new Date(Date.UTC(+m[3],+m[2]-1,+m[1]));return d.getUTCFullYear()===+m[3]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[1]?m[3]+'-'+m[2]+'-'+m[1]:null}m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?m[1]+'-'+m[2]+'-'+m[3]:null}
function formatDateNice(x){if(!x)return '';const iso=parseUserDate(x);if(!iso)return String(x);const [y,m,d]=iso.split('-');return d+'-'+m+'-'+y}
function formatTimestamp(x){if(!x)return '';const d=new Date(x);if(Number.isNaN(d.getTime()))return String(x);return formatDateNice(d.toISOString().slice(0,10))+' '+d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:false})}
function dateInputHtml(id,iso,required=false){return '<input id="'+esc(id)+'" type="text" inputmode="numeric" maxlength="10" placeholder="DD-MM-YYYY" data-date-input="1" value="'+esc(formatDateNice(iso||''))+'"'+(required?' required':'')+'>'}
function dateInputValue(id){return parseUserDate($(id)?.value||'')}
function wireDateInputs(root=document){root.querySelectorAll?.('input[data-date-input]').forEach(el=>{if(el.dataset.dateWired==='1')return;el.dataset.dateWired='1';el.addEventListener('input',()=>{let s=el.value.replace(/[^0-9]/g,'').slice(0,8);if(s.length>4)s=s.slice(0,2)+'-'+s.slice(2,4)+'-'+s.slice(4);else if(s.length>2)s=s.slice(0,2)+'-'+s.slice(2);el.value=s})})}
async function workerPatch(path,payload){
  return workerRequest(path,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload||{})});
}
function istTodayClient(){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
function policyStatusPreview(from,to){
  if(!from||!to)return 'Needs verification';
  const today=istTodayClient();
  if(from>today)return 'Upcoming';
  if(from<=today&&today<=to)return 'Current';
  return 'Archive';
}
function extractionReviewField(id,label,value,type='text',unverified=false){
  const inputType=type==='date'?'date':type==='number'?'number':'text';
  return '<label class="ex-review-field"><span>'+esc(label)+(unverified?' <em>UNVERIFIED</em>':'')+'</span><input id="'+esc(id)+'" type="'+inputType+'" value="'+esc(value??'')+'"></label>';
}
function openExtractionReview(kind,initial,validation,meta={}){return new Promise(resolve=>{const data=JSON.parse(JSON.stringify(initial||{}));let modal=document.getElementById('extractionReviewModal');if(modal)modal.remove();modal=document.createElement('div');modal.id='extractionReviewModal';modal.style='position:fixed;inset:0;background:rgba(15,23,42,.42);backdrop-filter:blur(8px);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:14px;overflow:auto';const isRc=kind==='rc',isPuc=kind==='puc',fields=isRc?[['registration_no','Regn No','text'],['date_of_regn','Date of Regn','date'],['regn_validity','Regn Validity','date'],['chassis_no','Chassis No','text'],['engine_no','Engine No','text'],['owner_name','Owner Name','text'],['owner_relation','S/D/W of','text'],['ownership_type','Ownership Type','text'],['address','Address','text'],['fuel','Fuel','text'],['emission_norms','Emission Norms (BS)','text'],['vehicle_class','Vehicle Class','text'],['maker','Maker','text'],['model','Model','text'],['colour','Colour','text'],['body_type','Body Type','text'],['seating','Seating','number'],['unladen_weight','Unladen Weight (Kg)','number'],['cubic_capacity','Cubic Capacity','number'],['mfg_month_year','Month-Year of Mfg','text'],['no_of_cylinders','No. of Cylinders','number'],['registration_authority','Registration Authority','text'],['card_issue_date','Card Issue Date','date']]:isPuc?[['test_date','Test Date','date'],['valid_until','Validity Upto','date'],['certificate_number','Certificate SL. No.','text'],['cost','Fees','number']]:[['insurer_name','Insurer Name','text'],['policy_number','Policy No','text'],['insured_name','Insured Name','text'],['period_from','Period From','date'],['period_to','Period To','date'],['reg_no','Reg No','text'],['chassis_no','Chassis','text'],['engine_no','Engine','text'],['idv','IDV','number'],['total_premium','Total / Gross Premium','number'],['previous_policy_number','Previous Policy No','text'],['previous_insurer','Previous Insurer','text'],['policy_type','Policy Type','text']];const inputField=(f)=>{const val=f[2]==='date'?formatDateNice(data[f[0]]):data[f[0]]??'';return '<label class="ex-review-field"><span>'+esc(f[1])+(data.confidence?.[f[0]]==='unverified'||data.confidence?.[f[0]]==='review'?' <em>UNVERIFIED</em>':'')+'</span>'+dateInputHtml(f[0],data[f[0]])+'</label>'.replace('>'+dateInputHtml(f[0],data[f[0]])+'</label>','>'+dateInputHtml(f[0],data[f[0]])+'</label>').replace('type="text" inputmode="numeric" maxlength="10" placeholder="DD-MM-YYYY" data-date-input="1"','type="text" inputmode="numeric" maxlength="10" placeholder="DD-MM-YYYY" data-date-input="1"')||''};const evidenceText=key=>{const c=String(data.confidence?.[key]||'unverified'),v=c.match(/^verified:(\d+)/),one=c.match(/^single:(\d+)/);if(v)return 'Verified (found on '+v[1]+' pages)';if(one)return 'Single source · page '+one[1];if(c==='high')return 'Single source';if(c==='medium')return 'Single source · review recommended';if(c==='review')return 'Needs review';return 'Unverified'};const evidenceHtml=key=>'<small class="ex-field-evidence '+(String(data.confidence?.[key]||'unverified').startsWith('verified:')?'is-verified':String(data.confidence?.[key]||'').startsWith('single:')?'is-single':'is-unverified')+'">'+esc(evidenceText(key))+(data.field_sources?.[key]?.length?' · Source page(s): '+esc(data.field_sources[key].join(', ')):'')+'</small>';const fieldHtml=fields.map(f=>'<label class="ex-review-field"><span>'+esc(f[1])+'</span>'+(f[2]==='date'?dateInputHtml(f[0],data[f[0]]):'<input id="'+esc(f[0])+'" type="'+(f[2]==='number'?'number':'text')+'" value="'+esc(data[f[0]]??'')+'">')+evidenceHtml(f[0])+'</label>').join('');const devDiagnostics=(window.CARMY_DEV_DIAGNOSTICS===true||new URLSearchParams(window.location.search).get('debugExtraction')==='1')&&kind==='insurance'&&data.diagnostics;const diagnosticsHtml=devDiagnostics?'<details class="extraction-diagnostics"><summary>Developer extraction diagnostics</summary><p>Pages: '+esc(data.diagnostics.page_count)+'</p><pre>'+esc(JSON.stringify(data.diagnostics,null,2))+'</pre></details>':'';let duplicate='';if(meta.saved){const diff=fields.map(f=>{const old=meta.saved[f[0]],neu=data[f[0]];return old!=null&&String(old)!==String(neu??'')?'<div><b>'+esc(f[1])+'</b>: saved <span>'+esc(old)+'</span> → extracted <span>'+esc(neu??'')+'</span></div>':''}).join('');duplicate='<div class="ex-review-duplicate"><b>Already saved</b><p>Existing non-empty values will not be overwritten. Only empty saved fields can be filled.</p>'+(diff||'<span>No field differences.</span>')+'</div>'}const claim=isRc||isPuc?'':'<div class="ex-review-claim"><div><b>Claim taken</b><small>Choose Yes or No before saving.</small></div><div class="ex-review-claim-actions"><label><input type="radio" name="exClaim" value="yes"> Yes</label><label><input type="radio" name="exClaim" value="no"> No</label></div><label class="ex-review-field ex-claim-invoice" id="exClaimInvoiceWrap" style="display:none"><span>Claim Invoice No. *</span><input id="claim_invoice_no" type="text" value=""></label></div>';const thumb=meta.thumbnail?'<div class="ex-review-preview"><img src="'+meta.thumbnail+'" alt="Document preview"></div>':'';modal.innerHTML='<div class="ex-review-card"><div class="ex-review-head"><div><div class="ex-review-kicker">REVIEW BEFORE SAVE</div><h2>'+esc(isRc?'RC details review':isPuc?'PUC certificate review':'Insurance policy review')+'</h2><p>Nothing is saved until you confirm.</p></div><button class="ghost" id="exReviewCancel" type="button">Cancel</button></div><div class="ex-review-layout">'+thumb+'<div><div id="exReviewValidation" class="ex-review-validation"></div>'+duplicate+'<div class="ex-review-grid">'+fieldHtml+'</div>'+diagnosticsHtml+(!isPuc?'':(data.suggested_valid_until&&!data.valid_until?'<div class="ex-review-validation">Suggested validity: <b>'+esc(formatDateNice(data.suggested_valid_until))+'</b> — please verify and enter it.</div>':''))+claim+'</div></div><div class="ex-review-footer"><span id="exReviewStatus"></span><div><button class="ghost" id="exReviewBack" type="button">Cancel</button><button class="primary" id="exReviewConfirm" type="button">CONFIRM &amp; SAVE</button></div></div></div>';document.body.appendChild(modal);wireDateInputs(modal);const read=()=>{for(const f of fields){const el=document.getElementById(f[0]);if(el)data[f[0]]=f[2]==='date'?dateInputValue(f[0]):el.value===''?null:(f[2]==='number'?Number(el.value):el.value)}if(kind==='insurance'){const q=document.querySelector('input[name="exClaim"]:checked');data.claim_taken=q?String(q.value)==='yes':null;data.claim_invoice_no=document.getElementById('claim_invoice_no')?.value.trim()||null}return data};const render=()=>{const d=read(),v=CarmyExtraction.validate(d,car,kind);if(kind==='insurance'){if(!d.period_from||!d.period_to)v.errors.push('Policy period From/To is required.');if(d.period_from&&d.period_to&&d.period_from>d.period_to)v.errors.push('Policy period is invalid.');if(d.claim_taken===null)v.errors.push('Choose Claim Yes or No.');if(d.claim_taken===true&&!d.claim_invoice_no)v.errors.push('Claim Invoice No. is required when Claim = Yes.')}if(isPuc&&d.valid_until&&data.suggested_valid_until&&d.valid_until!==data.suggested_valid_until)v.warnings.push('Validity differs from test date + 1 year - 1 day. Please verify.');const box=document.getElementById('exReviewValidation'),btn=document.getElementById('exReviewConfirm');box.innerHTML=(v.errors.length?'<b>Cannot save yet</b><ul>'+v.errors.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'<b class="ok">Vehicle/type checks passed.</b>')+(v.warnings.length?'<div class="ex-review-warning">'+v.warnings.map(x=>esc(x)).join('<br>')+'</div>':'');if(isPuc)document.getElementById('exReviewStatus').textContent='Status preview: '+(!d.valid_until?'Needs verification':d.valid_until>=istTodayClient()?'Current':'Archive');else if(kind==='insurance')document.getElementById('exReviewStatus').textContent='Status preview: '+policyStatusPreview(d.period_from,d.period_to);btn.disabled=v.errors.length>0;return{data:d,validation:v}};modal.querySelectorAll('input').forEach(x=>x.addEventListener('input',render));modal.querySelectorAll('input[name="exClaim"]').forEach(x=>x.addEventListener('change',()=>{document.getElementById('exClaimInvoiceWrap').style.display=document.querySelector('input[name="exClaim"]:checked')?.value==='yes'?'block':'none';render()}));const close=()=>{modal.remove();resolve(null)};document.getElementById('exReviewCancel').onclick=close;document.getElementById('exReviewBack').onclick=close;document.getElementById('exReviewConfirm').onclick=()=>{const r=render();if(r.validation.errors.length)return;modal.remove();resolve(r.data)};render()})}
function openDocUploader(preselectedType=''){
 const isStorageExceeded = Boolean(userPlanStatus && Number(userPlanStatus.storage_mb_used || 0) >= Number(userPlanStatus.storage_mb_limit || 10));
 if(isStorageExceeded){
  openPlanComparisonModal();
  toast('Document vault storage limit reached ('+userPlanStatus.storage_mb_used+'/'+userPlanStatus.storage_mb_limit+' MB). Upgrade your plan to upload more files.', 'info');
  return;
 }
 let old=document.getElementById('docUploadModal');if(old)old.remove();
 let m=document.createElement('div');m.id='docUploadModal';
 m.innerHTML='<div class="doc-upload-card" role="dialog" aria-modal="true"><div class="toolbar"><div><h3 id="docUploadTitle">Upload Vehicle Document</h3><p class="muted">Maximum 10 MB. Allowed files: PDF, JPG, JPEG, PNG. RC and Insurance are reviewed before extracted data is saved.</p></div><button class="ghost" id="docUploadClose" type="button">✕</button></div><div class="form"><div class="field"><label>Document Type *</label><select id="docType"><option value="rc">Registration Certificate</option><option value="puc">PUC</option><option value="insurance">Insurance</option><option value="other">Other</option></select></div><div class="field" id="docNameWrap" style="display:none"><label>Document Name *</label><input id="docName" placeholder="e.g. Fastag / Permit / Fitness Certificate"></div><div class="field"><label>Issue Date <span id="docIssueReq">*</span></label>'+dateInputHtml('docIssue','')+'</div><div class="field" id="docExpiryWrap" style="display:none"><label>Expiry Date *</label>'+dateInputHtml('docExpiry','')+'</div><div class="field full" id="rcValidityInfo" style="display:none"><div class="rc-auto-box">RC validity: <b id="rcValidityYears"></b> years • Calculated expiry: <b id="rcCalculatedExpiry">—</b></div></div><div class="field full"><label>Select File *</label><input id="docFile" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"><small class="muted">Security limit: 10 MB • PDF/JPG/JPEG/PNG only.</small></div><div class="full"><button class="primary" id="docUploadBtn" type="button"><span class="upload-btn-label">UPLOAD DOCUMENT</span></button></div></div></div>';
 document.body.appendChild(m);
 if(['rc','puc','insurance','other'].includes(preselectedType))$('docType').value=preselectedType;
 const updateFields=()=>{let t=$('docType').value,rc=t==='rc',expiry=t==='insurance'||t==='puc';$('docNameWrap').style.display=t==='other'?'block':'none';$('docExpiryWrap').style.display=expiry?'block':'none';$('docIssueReq').textContent=(rc||t==='insurance'||t==='puc')?'*':'';$('rcValidityInfo').style.display=rc?'block':'none';if(rc){$('rcValidityYears').textContent=rcValidityYears(car?.fuel);let x=calculateRcExpiry(dateInputValue('docIssue'),car?.fuel);$('rcCalculatedExpiry').textContent=x?formatDateNice(x):'—'}};
 $('docType').onchange=updateFields;$('docIssue').oninput=updateFields;updateFields();
 if(preselectedType)$('docUploadTitle').textContent=preselectedType==='insurance'?'Renew Insurance':preselectedType==='puc'?'Renew PUC':preselectedType==='rc'?'Replace Registration Certificate':'Upload Vehicle Document';
 $('docUploadClose').onclick=()=>m.remove();m.onclick=e=>{if(e.target===m&&$('docUploadBtn')&&!$('docUploadBtn').disabled)m.remove()};
 const handleDocumentUpload=async()=>{
   let btn=$('docUploadBtn'),label=btn.querySelector('.upload-btn-label');if(btn.disabled)return;
   btn.disabled=true;btn.classList.add('is-uploading');label.innerHTML='<span class="inline-spinner"></span> CHECKING...';
   let t=$('docType').value,n=t==='other'?$('docName').value.trim():'',issue=$('docIssue').value||null,e=t==='rc'?calculateRcExpiry(issue,car?.fuel):((t==='insurance'||t==='puc')?dateInputValue('docExpiry'):'');
   const f=$('docFile').files[0],MAX_FILE_SIZE=10*1024*1024,ALLOWED_MIME=new Set(['application/pdf','image/jpeg','image/png']),ALLOWED_EXT=new Set(['pdf','jpg','jpeg','png']);
   let reviewed=null,extracted=null;
   const fail=msg=>{btn.disabled=false;btn.classList.remove('is-uploading');label.textContent='UPLOAD DOCUMENT';toast(msg,'error')};
   if(!f||!car)return fail('Failed to upload document. Select a file.');
   if(f.size<=0)return fail('Failed to upload document. The selected file is empty.');
   if(f.size>MAX_FILE_SIZE)return fail('File is too large. Maximum allowed size is 10 MB.');
   let ext=(f.name.split('.').pop()||'').toLowerCase();if(!ALLOWED_MIME.has(f.type)||!ALLOWED_EXT.has(ext))return fail('Unsupported file. Only PDF, JPG, JPEG and PNG files are allowed.');
   if(t==='other'&&!n)return fail('Failed to upload Other Document. Enter document name.');
   try{
     if(t==='rc'||t==='insurance'||t==='puc'){
       label.innerHTML='<span class="inline-spinner"></span> EXTRACTING...';
       extracted=await CarmyExtraction.extract(f,t,(p,s)=>{label.textContent=(s||'EXTRACTING')+' '+Math.round((p||0)*100)+'%';});
       const detected=extracted.detected_type;
       const expected=t==='rc'?'rc':t==='puc'?'puc':'insurance';
       const initial=extracted.data;
       const details=t==='insurance'?('Registration: '+(initial.reg_no||'Not read')+' | Chassis: '+(initial.chassis_no||'Not read')+' | Insured: '+(initial.insured_name||'Not read')):t==='puc'?('Registration: '+(initial.registration_no||'Not read')):('Registration: '+(initial.registration_no||'Not read'));
       const uploadCard=m.querySelector('.doc-upload-card'),uploadCardMarkup=uploadCard.innerHTML;
       const gate=(message,next,buttons='redirect')=>new Promise(resolve=>{uploadCard.innerHTML='<div class="ex-review-card" style="max-width:620px"><div class="ex-review-head"><div><div class="ex-review-kicker">DOCUMENT TYPE CHECK</div><h2>'+esc(message)+'</h2><p>'+esc(details)+'</p></div><button class="ghost" id="gateClose" type="button">Cancel</button></div><div class="ex-review-footer"><span></span><div>'+(buttons==='choice'?'<button class="ghost" id="gateContinue" type="button">Continue as '+esc(t==='insurance'?'Insurance':t==='rc'?'RC':'PUC')+'</button><button class="primary" id="gateNext" type="button">Open '+esc(next.toUpperCase())+' Section</button>':'<button class="primary" id="gateNext" type="button">'+esc(next?'Open '+next.toUpperCase()+' Section':'Close')+'</button>')+'</div></div></div>';wireDateInputs(m);document.getElementById('gateClose').onclick=()=>{m.remove();resolve(false)};document.getElementById('gateNext').onclick=()=>{m.remove();if(next)openDocUploader(next);resolve(false)};const cont=document.getElementById('gateContinue');if(cont)cont.onclick=()=>{uploadCard.innerHTML=uploadCardMarkup;btn=$('docUploadBtn');label=btn.querySelector('.upload-btn-label');btn.disabled=true;btn.classList.add('is-uploading');label.textContent='REVIEWING EXTRACTED DOCUMENT...';$('docUploadClose').onclick=()=>m.remove();$('docUploadBtn').onclick=handleDocumentUpload;$('docType').onchange=updateFields;$('docIssue').oninput=updateFields;wireDateInputs(m);resolve(true)}});
       if(t==='insurance'&&detected==='insurance-two-wheeler'){await gate((window.CARMY_MESSAGES?.documentDifferentVehicle||'This policy belongs to a different vehicle.'),'');return;}
       const classification=extracted.classification||CarmyExtraction.classifyDetailed(extracted.text,t);
       console.info('[Torq Desk] Document classification',{type:detected,pageCount:classification.page_count,confidence:classification.confidence,scores:classification.scores,hardRules:classification.hard_rules});
       const typeMap={'insurance-car':'insurance','insurance-two-wheeler':'insurance','rc':'rc','puc':'puc'};
       const detectedSlot=typeMap[detected]||'';
       const scoreRedirect=classification.redirect&&detectedSlot&&detectedSlot!==expected;
       if(scoreRedirect){await gate(detected==='puc'?(window.CARMY_MESSAGES?.pucWrongSection||'This file looks like a PUC. Upload it in the PUC section.'):detected==='rc'?(window.CARMY_MESSAGES?.rcWrongSection||'This file looks like an RC. Upload it in the RC section.'):(window.CARMY_MESSAGES?.insuranceWrongSection||'This file looks like insurance. Upload it in the Insurance section.'),detectedSlot);return;}
       if(classification.ambiguous||detected==='other'||(detectedSlot&&detectedSlot!==expected)){const continueWithSameExtraction=await gate('This file looks like '+(detectedSlot==='insurance'?'Insurance':detectedSlot==='rc'?'an RC':detectedSlot==='puc'?'a PUC':'an unclassified document')+' (confidence '+classification.confidence+'). Continue as '+(t==='insurance'?'Insurance':t==='rc'?'RC':'PUC')+' or open in the detected section?',detectedSlot||expected,'choice');if(!continueWithSameExtraction)return;}
       const preValidation=CarmyExtraction.validate(initial,car,t);
       const vehicleMismatch=preValidation.errors.some(x=>/does not match|different vehicle|selected RC/i.test(x));
       if(vehicleMismatch){await gate(t==='puc'?'This PUC belongs to a different vehicle.':'This policy belongs to a different vehicle.','');return;}
       const saved=t==='insurance'?insuranceHistory.find(x=>x.policy_number&&String(x.policy_number).replace(/\s+/g,'').toLowerCase()===String(initial.policy_number||'').replace(/\s+/g,'').toLowerCase()):t==='puc'?pucHistory.find(x=>x.certificate_number&&String(x.certificate_number).replace(/[^A-Z0-9]/gi,'').toUpperCase()===String(initial.certificate_number||'').replace(/[^A-Z0-9]/gi,'').toUpperCase()):null;
       reviewed=await openExtractionReview(t,initial,preValidation,{thumbnail:extracted.thumbnail,saved});
       if(!reviewed){btn.disabled=false;btn.classList.remove('is-uploading');label.textContent='UPLOAD DOCUMENT';return;}
       if(t==='rc'){issue=reviewed.date_of_regn||issue;e=reviewed.regn_validity||e}
       if(t==='insurance'){issue=reviewed.period_from;e=reviewed.period_to}
       if(t==='puc'){issue=reviewed.test_date;e=reviewed.valid_until}
     }     let oldDoc=(t==='rc'||t==='insurance'||t==='puc')?docs.find(d=>d.document_type===t&&!d.archived_at):null;
     let oldPatch=t==='puc'?{puc_expiry:car.puc_expiry}:null,newDocId=null,archived=false,complianceUpdated=false,pendingKey=null,finalKey=null;
     label.innerHTML='<span class="inline-spinner"></span> UPLOADING...';
     const signed=await workerPost('/api/files/presign-upload',{car_id:car.id,file_name:f.name,mime_type:f.type,file_size:f.size,document_type:t});
     pendingKey=signed.data.pending_key;
     const put=await fetch(signed.data.upload_url,{method:'PUT',headers:{'Content-Type':f.type},body:f});if(!put.ok)throw new Error('R2 upload failed ('+put.status+').');
     finalKey=pendingKey.replace(/^pending\//,'documents/');
     let ins=await db.from('documents').insert({user_id:user.id,car_id:car.id,file_name:f.name,storage_path:finalKey,storage_backend:'r2',mime_type:f.type,file_size:f.size,document_type:t,document_name:n||null,document_expiry:e||null,active:false,extraction_status:(t==='rc'||t==='insurance')?'processing':'not_started'}).select('id').single();
     if(ins.error)throw new Error('Document record save failed: '+ins.error.message);newDocId=ins.data.id;
     const finalized=await workerPost('/api/files/finalize',{car_id:car.id,pending_key:pendingKey});if(finalized?.data?.storage_path!==finalKey)throw new Error('R2 final storage path verification failed.');
     let activate=await db.from('documents').update({active:true,archived_at:null}).eq('id',newDocId).eq('car_id',car.id).eq('user_id',user.id);if(activate.error)throw new Error('New document could not be activated: '+activate.error.message);
     let saveResult=null;
     if(t==='rc'){
       const maker=reviewed.maker||'',model=reviewed.model||'',payload={registration_no:reviewed.registration_no||car.registration_no,owner_name:reviewed.owner_name||car.owner_name,vin:reviewed.chassis_no||car.vin,engine_no:reviewed.engine_no||car.engine_no,fuel:reviewed.fuel||car.fuel,make_model:(maker&&model)?maker+' / '+model:(car.make_model||model||maker),rc_regn_date:reviewed.date_of_regn||null,rc_validity:reviewed.regn_validity||null,rc_owner_relation:reviewed.owner_relation||null,rc_ownership_type:reviewed.ownership_type||null,rc_address:reviewed.address||null,rc_emission_norms:reviewed.emission_norms||null,rc_vehicle_class:reviewed.vehicle_class||null,rc_maker:maker||null,rc_model:model||null,rc_colour:reviewed.colour||null,rc_body_type:reviewed.body_type||null,rc_seating:reviewed.seating??null,rc_unladen_weight:reviewed.unladen_weight??null,rc_cubic_capacity:reviewed.cubic_capacity??null,rc_mfg_month_year:reviewed.mfg_month_year||null,rc_cylinders:reviewed.no_of_cylinders??null,rc_registration_authority:reviewed.registration_authority||null,rc_card_issue_date:reviewed.card_issue_date||null,rc_extraction_meta:{source:'browser-ocr',reviewed:true,confidence:reviewed.confidence||{}}};
       saveResult=await workerPatch('/api/vehicles/'+encodeURIComponent(car.id)+'/rc',payload);Object.assign(car,saveResult.data||payload);
     }else if(t==='insurance'){
       label.innerHTML='<span class="inline-spinner"></span> SAVING POLICY...';
       saveResult=await workerPost('/api/insurance',{car_id:car.id,source_document_id:newDocId,insurer_name:reviewed.insurer_name,policy_number:reviewed.policy_number,insured_name:reviewed.insured_name,period_from:reviewed.period_from,period_to:reviewed.period_to,policy_reg_no:reviewed.reg_no,policy_chassis_no:reviewed.chassis_no,policy_engine_no:reviewed.engine_no,idv_amount:reviewed.idv,total_premium:reviewed.total_premium,gross_premium_amount:reviewed.total_premium,previous_policy_number:reviewed.previous_policy_number,previous_insurer:reviewed.previous_insurer,policy_type:reviewed.policy_type,claim_taken:reviewed.claim_taken,claim_invoice_no:reviewed.claim_invoice_no,extraction_meta:{source:'browser-pdf-text-token-rows',parser:extracted.data.parser,reviewed:true,confidence:reviewed.confidence||{}}});
       await db.from('documents').update({extraction_status:'completed'}).eq('id',newDocId).eq('car_id',car.id).eq('user_id',user.id);
       if(saveResult?.data?.already_saved){/* duplicate policy: keep prior document/history untouched */} 
     }else if(t==='puc'){
       saveResult=await workerPost('/api/puc',{car_id:car.id,source_document_id:newDocId,certificate_number:reviewed.certificate_number,test_date:reviewed.test_date,valid_until:reviewed.valid_until,cost:reviewed.cost});
       await db.from('documents').update({extraction_status:'completed'}).eq('id',newDocId).eq('car_id',car.id).eq('user_id',user.id);
       if(saveResult?.data?.puc_status==='archive'){const au=await db.from('documents').update({archive_name:'PUC-'+fyLabel(e),archived_at:new Date().toISOString(),active:false}).eq('id',newDocId).eq('car_id',car.id).eq('user_id',user.id);if(au.error)throw new Error('Archived PUC document could not be finalized: '+au.error.message)}
     }
     if((t==='rc'||t==='insurance')&&!((t==='insurance')&&saveResult?.data?.already_saved)){if(oldDoc){let folder=docTypeLabel(oldDoc)+'-'+fyLabel(oldDoc.document_expiry||oldDoc.created_at);let au=await db.from('documents').update({archive_name:folder,archived_at:new Date().toISOString(),active:false}).eq('id',oldDoc.id).eq('car_id',car.id).eq('user_id',user.id).is('archived_at',null);if(au.error)throw new Error('Old document could not be archived: '+au.error.message);archived=true}}
     if(t==='puc'&&saveResult?.data?.puc_status==='current'&&oldDoc){let folder=docTypeLabel(oldDoc)+'-'+fyLabel(oldDoc.document_expiry||oldDoc.created_at);let au=await db.from('documents').update({archive_name:folder,archived_at:new Date().toISOString(),active:false}).eq('id',oldDoc.id).eq('car_id',car.id).eq('user_id',user.id).is('archived_at',null);if(au.error)throw new Error('Old PUC document could not be archived: '+au.error.message);archived=true}
     if(t==='rc'||t==='insurance')await db.from('documents').update({extraction_status:'completed'}).eq('id',newDocId).eq('car_id',car.id).eq('user_id',user.id);
     let refreshError=null;try{await loadData()}catch(refreshErrCaught){refreshError=refreshErrCaught}
     m.remove();let name=t==='rc'?'Registration Certificate':t==='puc'?'PUC Certificate':t==='insurance'?'Insurance Document':'Document';
     toast(name+' saved successfully.');
     if(refreshError)toast('Document saved, but the document list could not refresh. Please refresh the page.','error');
   }catch(err){
     if(newDocId){try{await workerDelete('/api/files/object?document_id='+encodeURIComponent(newDocId)+'&car_id='+encodeURIComponent(car.id))}catch(cleanErr){console.error('R2 cleanup failed:',cleanErr)}}
     if(complianceUpdated&&oldPatch)await db.from('cars').update(oldPatch).eq('id',car.id).eq('user_id',user.id);
     if(newDocId)await db.from('documents').delete().eq('id',newDocId).eq('car_id',car.id).eq('user_id',user.id);
     if(archived&&oldDoc)await db.from('documents').update({archive_name:null,archived_at:null,active:true}).eq('id',oldDoc.id).eq('car_id',car.id).eq('user_id',user.id);
     toast('Failed to save '+(t==='rc'?'Registration Certificate':t==='insurance'?'Insurance Document':t==='puc'?'PUC Certificate':'Document')+'. '+(err?.message||'Please try again.'),'error');
   }finally{if(document.body.contains(btn)){btn.disabled=false;btn.classList.remove('is-uploading');label.textContent='UPLOAD DOCUMENT'}}
 };
 $('docUploadBtn').onclick=handleDocumentUpload;
}

window.openDocUploader=openDocUploader;
async function openDocumentPreview(id,path,fileName='Document'){
 let existing=document.getElementById('documentPreviewModal');if(existing)existing.remove();
 const doc=docs.find(d=>d.id===id);if(!doc)return toast('Document was not found. Refresh and try again.','error');
 try{
   let url;
   if((doc.storage_backend||'supabase')==='r2'){
     const r=await workerGet('/api/files/presign-download?document_id='+encodeURIComponent(id)+'&car_id='+encodeURIComponent(car.id));url=r.data.url;
   }else{
     const r=await db.storage.from('car-documents').createSignedUrl(path,300);if(r.error)throw r.error;url=r.data.signedUrl;
   }
   let ext=(fileName.split('.').pop()||'').toLowerCase();
   let media=ext==='pdf'?'<iframe class="document-preview-frame" src="'+url+'" title="'+esc(fileName)+'"></iframe>':'<img class="document-preview-image" src="'+url+'" alt="'+esc(fileName)+'">';
   let m=document.createElement('div');m.id='documentPreviewModal';
   m.innerHTML='<div class="document-preview-card"><div class="document-preview-head"><div><b>'+esc(fileName)+'</b><small>Secure preview • expires in 5 minutes</small></div><button class="ghost" type="button" id="documentPreviewClose">✕</button></div><div class="document-preview-body">'+media+'</div><div class="document-preview-foot"><button class="ghost" type="button" onclick="downloadDoc(\''+id+'\',\''+path.replace(/'/g,"\\'")+'\')">Download</button><button class="primary" type="button" onclick="document.getElementById(\'documentPreviewModal\').remove()">Close</button></div></div>';
   document.body.appendChild(m);$('documentPreviewClose').onclick=()=>m.remove();m.onclick=e=>{if(e.target===m)m.remove()};
 }catch(err){toast('Preview failed: '+(err?.message||'Please try again.'),'error')}
}
window.downloadDoc=async(id,path)=>{
 const doc=docs.find(d=>d.id===id);if(!doc)return toast('Document was not found.','error');
 try{
   const isTransferDoc=(doc.archive_name==='Transfer Documents'||doc.archive_name==='Form 29 & 30'||(doc.document_name&&/Transfer/i.test(doc.document_name)));
   const regClean=(car?.registration_no||'').toUpperCase().replace(/[^A-Z0-9]/g,'')||'VEHICLE';
   const downloadFileName=isTransferDoc?('Transfer_Documents_'+regClean+'.pdf'):(doc.file_name||'document.pdf');
   let url;
   if((doc.storage_backend||'supabase')==='r2'){const r=await workerGet('/api/files/presign-download?document_id='+encodeURIComponent(id)+'&car_id='+encodeURIComponent(car.id));url=r.data.url;}
   else{const r=await db.storage.from('car-documents').createSignedUrl(path,300,{download:downloadFileName});if(r.error)throw r.error;url=r.data.signedUrl;}
   const a=document.createElement('a');a.href=url;a.download=downloadFileName;a.target='_blank';document.body.appendChild(a);a.click();a.remove();
 }catch(err){toast(err?.message||'Document download failed.','error')}
};
const DEFAULT_DELETE_PASSWORD='1234';
function deletePasswordChanged(){return (localStorage.getItem('carcare_delete_password')||DEFAULT_DELETE_PASSWORD)!==DEFAULT_DELETE_PASSWORD}
function ensureSecurityPassword(){return true}
function changeDeletePassword(force=false){let current=localStorage.getItem('carcare_delete_password')||DEFAULT_DELETE_PASSWORD;let p=prompt(force?'Security PIN setup required. Default PIN is 1234. Enter a new 4-character PIN.':'Enter new 4-character security PIN.',force?'':current);if(p===null&&!force)return;if(!p||p.trim().length!==4||p.trim()==='1234'){toast('PIN must be exactly 4 characters and cannot be 1234.');if(force)setTimeout(()=>changeDeletePassword(true),300);return}localStorage.setItem('carcare_delete_password',p.trim());toast('Security PIN changed successfully!');docsView()}
function forgotDeletePassword(){let p=prompt('Forgot PIN? Set a new 4-character security PIN.');if(p===null)return;if(!p.trim()||p.trim().length!==4||p.trim()==='1234')return toast('PIN must be exactly 4 characters and cannot be 1234.');localStorage.setItem('carcare_delete_password',p.trim());toast('Security PIN reset successfully!');docsView()}
function setDeletePassword(){changeDeletePassword(false)}
async function deleteDoc(id,path,isArchived=false){
 if(!deletePasswordChanged())return toast('Please change default password to unlock delete actions.','error');
 if(!id||!path||!car)return toast('Document delete request is invalid.','error');
 let target=docs.find(d=>d.id===id&&d.car_id===car.id);if(!target)return toast('Document was not found for this vehicle. Refresh and try again.','error');
 if(target.storage_path!==path)return toast('Document path verification failed. Refresh and try again.','error');
 let p=prompt('Enter your 4-character security PIN to confirm permanent deletion.','');if(p===null)return;
 let saved=localStorage.getItem('carcare_delete_password');if(!saved||p.trim()!==saved)return toast('Invalid Security PIN. Document was not deleted.','error');
 if(!confirm((isArchived?'Delete this archived document permanently from the server?':'Delete this document permanently?')+' This cannot be undone.'))return;
 let btns=[...document.querySelectorAll('.doc-delete')].filter(b=>b.offsetParent!==null);btns.forEach(b=>b.disabled=true);
 try{
   if(db&&db.from&&target.id){
     try{
       await db.from('sale_history').update({form_document_id:null}).eq('form_document_id',target.id);
     }catch(shCleanErr){
       console.warn('Could not clean sale_history.form_document_id:',shCleanErr);
     }
   }
   if((target.storage_backend||'supabase')==='r2'){
     // R2 documents are deleted entirely by the Worker so the ownership
     // check happens before the Supabase metadata row is removed.
     await workerDelete('/api/files/object?document_id='+encodeURIComponent(target.id)+'&car_id='+encodeURIComponent(car.id));
     toast((isArchived?'Archived document':'Document')+' deleted permanently from server!');
     await loadData();
     return;
   }
   let r=await db.from('documents').delete().eq('id',target.id).eq('car_id',car.id).eq('user_id',user.id).select('id').maybeSingle();
   if(r.error)throw new Error('Database authorization/deletion failed: '+r.error.message);
   if(!r.data)throw new Error('Document could not be deleted. Server authorization rejected the request.');
   let s=await db.storage.from('car-documents').remove([target.storage_path]);
   if(s.error){
     let restore=await db.from('documents').insert({id:target.id,user_id:target.user_id,car_id:target.car_id,file_name:target.file_name,storage_path:target.storage_path,mime_type:target.mime_type,file_size:target.file_size,document_type:target.document_type,document_name:target.document_name,document_expiry:target.document_expiry,archive_name:target.archive_name,archived_at:target.archived_at,active:target.active});
     if(restore.error)throw new Error('Storage deletion failed and database restore also failed. Refresh and verify the document: '+s.error.message);
     throw new Error('Server file deletion failed; document was restored safely. '+s.error.message);
   }
   toast((isArchived?'Archived document':'Document')+' deleted permanently from server!');await loadData();
 }catch(err){toast(err?.message||'Document deletion failed.','error')}finally{btns.forEach(b=>b.disabled=false)}
}
async function pickInsuranceCompany(current=''){return new Promise(resolve=>{let old=document.getElementById('insurancePicker');if(old)old.remove();let wrap=document.createElement('div');wrap.id='insurancePicker';wrap.style='position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(5px);display:grid;place-items:center;z-index:100';wrap.innerHTML='<div style="background:#fff;padding:22px;border-radius:18px;width:min(420px,calc(100% - 30px));box-shadow:0 25px 70px rgba(15,23,42,.25)"><h3 style="margin:0 0 12px">Select Insurance Company *</h3><select id="insurancePickerSelect" style="width:100%;padding:12px;border:1px solid #e5e7eb;border-radius:10px">'+insuranceCompanies.map(x=>'<option>'+esc(x)+'</option>').join('')+'</select><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="ghost" id="insurancePickerCancel">Cancel</button><button class="primary" id="insurancePickerOk">Select</button></div></div>';document.body.appendChild(wrap);let sel=document.getElementById('insurancePickerSelect');sel.value=insuranceCompanies.includes(current)?current:'Not Available';document.getElementById('insurancePickerCancel').onclick=()=>{wrap.remove();resolve(null)};document.getElementById('insurancePickerOk').onclick=()=>{let v=sel.value;wrap.remove();resolve(v)};sel.focus()})}
async function ensureRequiredCarDetails(){if(!car){toast('Please add a car first');await nav('cars');return false}let missing=[];if(!car.registration_no)missing.push('Registration Number');if(!car.make_model)missing.push('Make / Model');if(!car.model_year)missing.push('Model Year');if(!car.fuel)missing.push('Fuel Type');if(!car.insurance_company||car.insurance_company==='Not Available')missing.push('Insurance Company');if(!car.insurance_expiry)missing.push('Insurance Expiry');if(!car.puc_state||!car.puc_expiry)missing.push('PUC State / PUC Expiry');if(!car.insurance_number)missing.push('Insurance Policy Number');if(!Array.isArray(car.insurance_type)||car.insurance_type.length<2)missing.push('Insurance Type (minimum 2)');if(!car.puc_certificate_no)missing.push('PUC Number');if(!car.puc_validity_months)missing.push('PUC Validity');if(!missing.length)return true;let msg='Required information missing:\n\n• '+missing.join('\n• ')+'\n\nPlease complete the required vehicle details.';if(!confirm(msg))return false;let ok=await window.editCar();if(!ok)return false;return !!car.make_model&&!!car.model_year&&!!car.fuel&&!!car.insurance_company&&car.insurance_company!=='Not Available'&&!!car.insurance_expiry&&!!car.insurance_number&&Array.isArray(car.insurance_type)&&car.insurance_type.length>=2&&!!car.puc_state&&!!car.puc_certificate_no&&!!car.puc_validity_months&&!!car.puc_expiry}
async function saveRequiredCarDetails(p){let r=await db.from('cars').update(p).eq('id',car.id);if(r.error)return toast(r.error.message);Object.assign(car,p);await loadData();toast('Required car information updated')}
window.openAddRecord=async()=>{if(!(await ensureRequiredCarDetails()))return;await nav('add')};
function report(){
 if(!car)return;
 const carRecords=(records||[]).filter(r=>!r.car_id||r.car_id===car.id);
 const total=carRecords.reduce((sum,r)=>sum+Number(r.total_cost||0),0),rows=Array.isArray(insuranceHistory)?insuranceHistory.filter(x=>x.car_id===car.id):[],current=rows.find(x=>x.policy_status==='current')||null,old=rows.filter(x=>x.policy_status==='archive').sort((a,b)=>String(a.issue_date||'').localeCompare(String(b.issue_date||''))),pucs=Array.isArray(pucHistory)?pucHistory.filter(x=>x.car_id===car.id):[],pucCurrent=pucs.find(x=>x.puc_status==='current')||null,pucOld=pucs.filter(x=>x.puc_status==='archive').sort((a,b)=>String(a.expiry_date||'').localeCompare(String(b.expiry_date||'')));
 const claimLabel=x=>x?.claim_taken===true?'Yes':x?.claim_taken===false?'No':'Not confirmed';
 const period=x=>(x?.issue_date?formatDateNice(x.issue_date):'—')+' to '+(x?.expiry_date?formatDateNice(x.expiry_date):'—');
 const provenanceNote=x=>{const meta=x?.extraction_meta||{},estimated=Array.isArray(meta.estimated_fields)&&meta.estimated_fields.some(k=>['issue_date','expiry_date','period_from','period_to'].includes(k))||meta.estimated_dates===true;if(estimated)return '<small class="report-date-provenance report-estimated">Estimated</small>';if(x?.source==='historical_import'&&!x?.source_document_id)return '<small class="report-date-provenance">Imported · source document not linked</small>';return ''};
 const rc=[['Registration Date',car.rc_regn_date],['Registration Validity',car.rc_validity],['Owner',car.owner_name],['S/D/W of',car.rc_owner_relation],['Ownership Type',car.rc_ownership_type],['Address',car.rc_address],['Fuel',car.fuel],['Emission Norms',car.rc_emission_norms],['Vehicle Class',car.rc_vehicle_class],['Maker',car.rc_maker],['Model',car.rc_model],['Colour',car.rc_colour],['Body Type',car.rc_body_type],['Seating',car.rc_seating],['Unladen Weight',car.rc_unladen_weight],['Cubic Capacity',car.rc_cubic_capacity],['Month-Year of Mfg',car.rc_mfg_month_year],['No. of Cylinders',car.rc_cylinders],['Registration Authority',car.rc_registration_authority],['Card Issue Date',car.rc_card_issue_date]];
 const rcHtml=rc.map(x=>'<div><span>'+esc(x[0])+'</span><b>'+esc(/Date|Validity/i.test(x[0])?formatDateNice(x[1]):(x[1]??'—'))+'</b></div>').join('');
 const oldHtml=old.length?old.map((x,i)=>{const incomplete=!x.policy_number&&!x.issue_date&&!x.expiry_date;return incomplete?'<tr class="report-incomplete-row" data-incomplete="1"><td>'+String(i+1)+'</td><td>'+esc(x.insurance_company||'—')+'</td><td colspan="4"><span class="report-incomplete-label">Incomplete record</span></td></tr>':'<tr><td>'+String(i+1)+'</td><td>'+esc(x.insurance_company||'—')+'</td><td class="policy-no">'+esc(x.policy_number||'—')+'</td><td class="date">'+esc(period(x))+provenanceNote(x)+'</td><td>'+claimLabel(x)+'</td><td class="policy-no">'+esc(x.claim_taken===true?(x.claim_invoice_no||'—'):'—')+'</td></tr>'}).join(''):'<tr><td colspan="6">No archived policy records.</td></tr>';
 const pucCurrentHtml=pucCurrent?'<div class="report-current-policy"><div><span>CURRENT PUC</span><b>'+esc(formatDateNice(pucCurrent.issue_date))+'</b></div><div><span>Valid Until</span><b>'+esc(formatDateNice(pucCurrent.expiry_date))+'</b></div><div><span>Certificate No.</span><b>'+esc(pucCurrent.certificate_number||'—')+'</b></div><div><span>Cost</span><b>'+money(pucCurrent.cost)+'</b></div></div>':'<div class="report-current-policy"><b>No current PUC is recorded.</b></div>';const pucOldHtml=pucOld.length?pucOld.map((x,i)=>{const incomplete=!x.issue_date&&!x.expiry_date&&!x.certificate_number&&(x.cost==null||Number(x.cost)===0);return incomplete?'<tr class="report-incomplete-row" data-incomplete="1"><td>'+String(i+1)+'</td><td colspan="4"><span class="report-incomplete-label">Incomplete record</span></td></tr>':'<tr><td>'+String(i+1)+'</td><td class="date">'+esc(formatDateNice(x.issue_date))+provenanceNote(x)+'</td><td class="date">'+esc(formatDateNice(x.expiry_date))+'</td><td class="policy-no">'+esc(x.certificate_number||'—')+'</td><td class="cost">'+money(x.cost)+'</td></tr>'}).join(''):'<tr><td colspan="5">No archived PUC records.</td></tr>';
 const currentHtml=current?'<div class="report-current-policy"><div><span>CURRENT POLICY</span><b>'+esc(current.insurance_company||'—')+'</b></div><div><span>Policy Number</span><b>'+esc(current.policy_number||'—')+'</b></div><div><span>Period</span><b>'+esc(period(current))+'</b></div><div><span>Type</span><b>'+esc(current.policy_type||'—')+'</b></div><div><span>IDV</span><b>'+money(current.idv_amount)+'</b></div><div><span>Gross Premium</span><b>'+money(current.gross_premium_amount||current.premium_amount)+'</b></div><div><span>Claim</span><b>'+claimLabel(current)+(current.claim_taken===true?' • '+esc(current.claim_invoice_no||''):'')+'</b></div></div>':'<div class="report-current-policy"><b>No current policy is recorded.</b></div>';
 $('reportArea').innerHTML='<div class="report-sheet"><div class="report-head"><div><div class="report-brand"><img class="report-brand-logo" src="assets/carcarecloud-logo.svg?v=2026.10.12-torqdesk" alt="Torq Desk"><div><h1>Vehicle Service Report</h1><p>Complete vehicle, RC, insurance, PUC and service history</p></div></div><div class="report-reg">'+esc(car.registration_no)+'</div></div></div>'+
 '<div class="report-section"><div class="report-section-title">VEHICLE DETAILS</div><div class="report-grid"><div><span>Make / Model</span><b>'+esc(car.make_model||'—')+'</b></div><div><span>Model Year</span><b>'+esc(car.model_year||'—')+'</b></div><div><span>Fuel Type</span><b>'+esc(car.fuel||'—')+'</b></div><div><span>Current KM</span><b>'+esc(car.current_km||'0')+'</b></div><div><span>VIN / Chassis</span><b>'+esc(car.vin||'—')+'</b></div><div><span>Engine No.</span><b>'+esc(car.engine_no||'—')+'</b></div></div></div>'+
 '<div class="report-section"><div class="report-section-title">RC DETAILS</div><div class="report-grid">'+rcHtml+'</div></div>'+
 '<div class="report-section"><div class="report-section-title">CURRENT INSURANCE</div>'+currentHtml+'</div>'+
 '<div class="report-section"><div class="report-section-title">INSURANCE HISTORY — ARCHIVE</div><table class="report-table insurance-archive-table"><colgroup><col style="width:6%"><col style="width:22%"><col style="width:24%"><col style="width:20%"><col style="width:9%"><col style="width:19%"></colgroup><thead><tr><th>Sr</th><th>Provider</th><th>Policy No.</th><th>Period</th><th>Claim</th><th>Claim Invoice No.</th></tr></thead><tbody>'+oldHtml+'</tbody></table></div>'+
 '<div class="report-section"><div class="report-section-title">CURRENT PUC</div>'+pucCurrentHtml+'</div><div class="report-section"><div class="report-section-title">PUC HISTORY — ARCHIVE</div><table class="report-table puc-archive-table"><colgroup><col style="width:6%"><col style="width:18%"><col style="width:18%"><col style="width:38%"><col style="width:20%"></colgroup><thead><tr><th>Sr</th><th>Test Date</th><th>Valid Until</th><th>Certificate No.</th><th>Cost</th></tr></thead><tbody>'+pucOldHtml+'</tbody></table></div>'+
 '<div class="report-section"><div class="report-section-title">SERVICE & REPAIR HISTORY</div><table class="report-table"><thead><tr><th>Date</th><th>KM</th><th>Type</th><th>Work</th><th>Cost</th></tr></thead><tbody>'+carRecords.map(r=>'<tr><td>'+esc(formatDateNice(r.service_date))+'</td><td>'+esc(r.odometer_km)+'</td><td>'+esc(r.record_type)+'</td><td>'+esc(r.description||'')+(r.record_items?.length?'<small>'+esc(r.record_items.map(x=>x.item_name).join(', '))+'</small>':'')+'</td><td>'+money(r.total_cost)+'</td></tr>').join('')+'</tbody></table><div class="report-total"><span>Total Service Cost</span><b>'+money(total)+'</b></div></div>'+
 '<div class="report-section"><div class="report-section-title">DOCUMENTS</div><div class="report-document-grid">'+[
 {type:'rc',label:'Registration Certificate',number:car.registration_no,validity:car.rc_validity,doc:(docs||[]).find(d=>d.document_type==='rc'&&d.active&&!d.archived_at)},
 {type:'insurance',label:'Current Insurance',number:current?.policy_number,validity:current?.expiry_date,doc:(docs||[]).find(d=>d.id===current?.source_document_id)||((docs||[]).find(d=>d.document_type==='insurance'&&d.active&&!d.archived_at))},
 {type:'puc',label:'Current PUC',number:pucCurrent?.certificate_number,validity:pucCurrent?.expiry_date,doc:(docs||[]).find(d=>d.id===pucCurrent?.source_document_id)||((docs||[]).find(d=>d.document_type==='puc'&&d.active&&!d.archived_at))}
].map(x=>'<article class="report-document-card"><b>'+esc(x.label)+'</b><span>Number: '+esc(x.number||'—')+'</span><span>Valid until: '+esc(x.validity?formatDateNice(x.validity):'—')+'</span>'+(x.doc?'<button type="button" class="report-doc-view" onclick="openDocumentPreview(\''+esc(x.doc.id)+'\',\''+esc(x.doc.storage_path||'')+'\',\''+esc(x.doc.file_name||x.label)+'\')">View</button>':'<span class="report-doc-missing">Not uploaded</span>')+'</article>').join('')+'</div></div>'+
 '<div class="report-footer"><span>Generated by Torq Desk</span><span>'+formatDateNice(new Date().toISOString().slice(0,10))+'</span></div></div>';
}
waitForSupabase();
window.editCar=async()=>{if(!car)return false;let old=document.getElementById('editCarModal');if(old)old.remove();let years='';let maxYear=new Date().getFullYear()+1;for(let y=maxYear;y>=1980;y--)years+='<option value="'+y+'">'+y+'</option>';let modal=document.createElement('div');modal.id='editCarModal';modal.style='position:fixed;inset:0;background:rgba(15,23,42,.48);backdrop-filter:blur(6px);display:grid;place-items:center;z-index:100;padding:15px';modal.innerHTML='<div class="edit-modal-card"><div class="toolbar"><div><h2 style="margin:0">Edit Car / Insurance / PUC</h2><p class="muted">Update vehicle details. Fields marked * are required.</p></div><button class="ghost" id="editCarCancel">Cancel</button></div><div class="form"><div class="field"><label>Registration Number *</label><input id="ecReg" value="'+esc(car.registration_no||'')+'" readonly></div><div class="field"><label>Make / Model *</label><input id="ecModel" value="'+esc(car.make_model||'')+'" required></div><div class="field"><label>Model Year *</label><select id="ecYear" required><option value="">Select Year</option>'+years+'</select></div><div class="field"><label>Fuel Type *</label><select id="ecFuel" required><option value="">Select</option><option>Petrol</option><option>Diesel</option><option>CNG</option><option>Hybrid</option><option>Electric</option></select></div><div class="field"><label>VIN / Chassis No. (Optional)</label><input id="ecVin" value="'+esc(car.vin||'')+'"></div><div class="field"><label>Engine No. (Optional)</label><input id="ecEngine" value="'+esc(car.engine_no||'')+'"></div><div class="field full"><label>Insurance Type * <span class="muted">(minimum 2)</span></label><div class="choice-grid" id="ecInsType">'+insuranceTypes.map(x=>'<label class="choice-card"><input type="checkbox" value="'+esc(x)+'"><span class="choice-check">✓</span><span>'+esc(x)+'</span></label>').join('')+'</div><small class="muted">Select at least 2 options.</small></div><div class="field full"><label>Insurance Add-ons (Optional)</label><div class="choice-grid" id="ecInsAddons">'+insuranceAddons.map(x=>'<label class="choice-card"><input type="checkbox" value="'+esc(x)+'"><span class="choice-check">✓</span><span>'+esc(x)+'</span></label>').join('')+'</div><small class="muted">Optional — select any add-ons that apply.</small></div><div class="field"><label>Insurance Company *</label><select id="ecIns" required>'+insuranceCompanies.map(x=>'<option>'+esc(x)+'</option>').join('')+'</select></div><div class="field"><label>Insurance Policy Number *</label><input id="ecInsNo" value="'+esc(car.insurance_number||'')+'"></div><div class="field"><label>Insurance Expiry *</label>'+dateInputHtml('ecInsExp',car.insurance_expiry,true)+'</div><div class="field"><label>PUC *</label><select id="ecPuc" required><option value="">Select</option><option value="yes">Yes</option><option value="no">No</option></select></div><div class="field" id="ecPucNoWrap"><label>PUC Number *</label><input id="ecPucNo" value="'+esc(car.puc_certificate_no||'')+'"></div><div class="field" id="ecPucStateWrap"><label>PUC State *</label><select id="ecPucState" required><option value="">Select State</option>'+pucStates.map(x=>'<option>'+x+'</option>').join('')+'</select></div><div class="field" id="ecPucValidityWrap"><label>PUC Validity *</label><select id="ecPucValidity"><option value="">Select</option><option value="6">6 Months</option><option value="12">12 Months</option></select></div><div class="field" id="ecPucExpWrap"><label>PUC Expiry *</label>'+dateInputHtml('ecPucExp',car.puc_expiry,true)+'</div><div class="field"><label>Current KM</label><input id="ecKm" type="number" min="0" value="'+esc(car.current_km||0)+'"></div><div class="full"><button class="primary" id="ecSave">SAVE CHANGES</button></div></div></div>';document.body.appendChild(modal);$('ecYear').value=car.model_year?String(car.model_year):'';$('ecFuel').value=car.fuel||'';$('ecIns').value=insuranceCompanies.includes(car.insurance_company)?car.insurance_company:'Not Available';let oldTypes=Array.isArray(car.insurance_type)?car.insurance_type:[];let oldAddons=Array.isArray(car.insurance_addons)?car.insurance_addons:[];document.querySelectorAll('#ecInsType input[type="checkbox"]').forEach(o=>o.checked=oldTypes.includes(o.value));document.querySelectorAll('#ecInsAddons input[type="checkbox"]').forEach(o=>o.checked=oldAddons.includes(o.value));$('ecPuc').value=(car.puc_state||car.puc_certificate_no||car.puc_expiry)?'yes':'';$('ecPucNo').value=car.puc_certificate_no||'';$('ecPucState').value=car.puc_state||'';$('ecPucValidity').value=car.puc_validity_months?String(car.puc_validity_months):'';let setPucVisibility=()=>{let yes=$('ecPuc').value==='yes';['ecPucNoWrap','ecPucStateWrap','ecPucValidityWrap','ecPucExpWrap'].forEach(id=>$(id).style.display=yes?'block':'none')};setPucVisibility();let resolveDone;let resultPromise=new Promise(resolve=>resolveDone=resolve);let finished=false;const finish=v=>{if(finished)return;finished=true;if(document.body.contains(modal))modal.remove();resolveDone(v)};$('editCarCancel').onclick=()=>finish(false);$('ecIns').onchange=()=>{};$('ecPuc').onchange=setPucVisibility;$('ecSave').onclick=async()=>{let model=$('ecModel').value.trim(),year=$('ecYear').value,fuel=$('ecFuel').value,ins=$('ecIns').value,insNo=$('ecInsNo').value.trim(),ie=dateInputValue('ecInsExp'),puc=$('ecPuc').value,pucNo=puc==='yes'?$('ecPucNo').value.trim():'',pucState=puc==='yes'?$('ecPucState').value:'',pucValidity=puc==='yes'?$('ecPucValidity').value:'',pe=puc==='yes'?dateInputValue('ecPucExp'):'',km=$('ecKm').value,insTypes=selectedChoices('ecInsType'),insAddons=selectedChoices('ecInsAddons');if(!model||!year||!fuel||!ins||!ie||!insNo||insTypes.length<2)return toast('Please complete all required (*) fields. Insurance Type needs minimum 2 selections.');let invalidInsurance=ins==='Not Available',invalidPuc=puc!=='yes'||!pucNo||!pucState||!pucValidity||!pe;if(invalidInsurance||invalidPuc){toast(invalidInsurance?'Insurance Company cannot be Not Available.':(!pucNo||!pucState||!pucValidity||!pe?'Please complete all required PUC details.':'Please complete all required vehicle details.'),'error');return}let payload={make_model:model,model_year:+year,fuel,current_km:km?+km:0,vin:$('ecVin').value.trim()||null,engine_no:$('ecEngine').value.trim()||null,insurance_company:ins,insurance_number:insNo,insurance_type:insTypes,insurance_addons:insAddons,insurance_expiry:ie,puc_certificate_no:pucNo,puc_state:pucState,puc_validity_months:+pucValidity,puc_expiry:pe};let r=await db.from('cars').update(payload).eq('id',car.id);if(r.error)return toast(r.error.message);Object.assign(car,payload);finish(true);updateCarTab();toast('Car details updated');await loadCars();let fresh=cars.find(x=>x.id===car.id);if(fresh)car=fresh;await loadData()};return resultPromise};window.openCarEdit=()=>window.editCar();
async function openReportAndPrint(){await nav('report');await printVehicleReport()}
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
  $('hiApprove').onclick=()=>hiApproveImport();
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
  if(!w){const r=(historicalImportDraft?.records||[]).find(x=>hiRecordId(x)===id);if(r?.is_km_estimated)return hiReviewEstimated(id);}
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

  const btn=$('hiApprove');
  if(btn){btn.disabled=true;btn.dataset.oldText=btn.textContent;btn.textContent='⏳ SAVING…';}

  showOperationOverlay('Processing Atomic Import…','Saving validated history securely to Supabase');

  try{
    const draft=historicalImportDraft;
    const payload={
      import_batch_id:draft.import_batch_id,
      records:draft.records,
      warnings:[]
    };

    // The RPC is the actual approval/commit point.
    // It runs the complete historical import atomically in Supabase.
    const {data,error}=await db.rpc('import_historical_batch',{
      p_car_id:car.id,
      p_import_batch_id:draft.import_batch_id,
      p_payload:payload
    });

    if(error)throw error;

    const importedRecords=Number(data?.records||0);
    const importedItems=Number(data?.record_items||0);
    const importedPuc=Number(data?.puc||0);
    const importedInsurance=Number(data?.insurance||0);
    const importedClaims=Number(data?.claims||0);
    const importedTotal=importedRecords+importedPuc+importedInsurance+importedClaims;

    hideOperationOverlay();

    // IMPORTANT: database commit succeeded. From this point onward,
    // a refresh/render failure must never be reported as an import failure.
    toast(
      'Import Successful! '+importedTotal+' historical records & certificates added to Vehicle History.'
    );

    // Close the preview after the success feedback is visible.
    setTimeout(async()=>{
      document.getElementById('historicalImportModal')?.remove();
      historicalImportDraft=null;
      historicalImportSelectedWarning=null;

      try{
        await loadData();
        await nav('history');
      }catch(refreshErr){
        console.error('Historical import refresh failed after successful commit:',refreshErr);
        toast('Import saved successfully, but Vehicle History refresh failed. Please refresh the page.','error');
      }
    },1500);

  }catch(err){
    console.error('Historical import failed before commit:',err);
    hideOperationOverlay();
    toast(
      'Import failed: '+(
        err?.message||
        'Database import was rejected.'
      ),
      'error'
    );
    hiRevalidateDraft();
    if(btn){
      btn.disabled=false;
      btn.textContent=btn.dataset.oldText||'✓ APPROVE & IMPORT HISTORY';
    }
  }
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

/* =========================================================
   A4 REPORT PRINT PORTAL
   Browser print receives a dedicated report-only DOM node.
   This avoids blank pages caused by .view/display/visibility
   rules during native window.print().
   ========================================================= */

function showReportPrintOptions(){
 const key='carmy-report-doc-print-'+String(user?.id||'user');
 let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')}catch(_){}
 const types=[
  {key:'rc',label:'Registration Certificate',doc:(docs||[]).find(d=>d.document_type==='rc'&&d.active&&!d.archived_at)},
  {key:'insurance',label:'Current Insurance',doc:(docs||[]).find(d=>d.id===insuranceHistory.find(x=>x.car_id===car?.id&&x.policy_status==='current')?.source_document_id)||((docs||[]).find(d=>d.document_type==='insurance'&&d.active&&!d.archived_at))},
  {key:'puc',label:'Current PUC',doc:(docs||[]).find(d=>d.id===pucHistory.find(x=>x.car_id===car?.id&&x.puc_status==='current')?.source_document_id)||((docs||[]).find(d=>d.document_type==='puc'&&d.active&&!d.archived_at))},
  {key:'archiveInsurance',label:'Archive Insurance policies',doc:(docs||[]).find(d=>d.document_type==='insurance'&&d.archived_at)},
  {key:'archivePuc',label:'Archive PUC certificates',doc:(docs||[]).find(d=>d.document_type==='puc'&&d.archived_at)}
 ];
 document.getElementById('reportPrintOptions')?.remove();
 const m=document.createElement('div');m.id='reportPrintOptions';m.className='report-print-options';
 m.innerHTML='<div class="report-print-options-card" role="dialog" aria-modal="true"><h2>Include documents with this report?</h2><p class="muted">Selected documents will be placed after the vehicle history.</p>'+types.map((x,i)=>'<label><input type="checkbox" data-print-doc="'+x.key+'" '+(x.doc?'':'disabled')+' '+(saved[x.key]===undefined?(i<3?'checked':''):saved[x.key]?'checked':'')+'><span>'+x.label+(x.doc?'':' <small>Not uploaded</small>')+'</span></label>').join('')+'<label class="report-print-incomplete"><input id="reportHideIncomplete" type="checkbox" '+(saved.hideIncomplete?'checked':'')+'><span>Hide incomplete records in the printed report</span></label><div class="actions"><button type="button" id="reportPrintCancel">Cancel</button><button type="button" class="primary" id="reportPrintGo">Print</button></div><p id="reportPrintStatus" role="status"></p></div>';
 document.body.appendChild(m);m.onclick=e=>{if(e.target===m)m.remove()};m.querySelector('#reportPrintCancel').onclick=()=>m.remove();
 m.querySelector('#reportPrintGo').onclick=()=>{const selection={};m.querySelectorAll('[data-print-doc]').forEach(x=>selection[x.dataset.printDoc]=x.checked);selection.hideIncomplete=!!m.querySelector('#reportHideIncomplete')?.checked;try{localStorage.setItem(key,JSON.stringify(selection))}catch(_){}m.remove();printVehicleReport(selection)};
}
async function printVehicleReport(selection=null){
  document.getElementById('vehicleReportPdfStage')?.remove();
  if(!selection){showReportPrintOptions();return;}
  // Open a dedicated print tab synchronously from the user's click so popup blockers allow it.
  // The tab stays blank while documents are fetched/rendered; printing starts only after it is populated.
  let printWindow=null;
  try{
    printWindow=window.open('about:blank','_blank');
    if(printWindow){
      printWindow.document.open();
      printWindow.document.write("<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Preparing vehicle report…</title><style>\n:root{color-scheme:light;--ink:#172033;--muted:#687386;--line:#e5eaf1;--blue:#2563eb;--blue2:#60a5fa;--surface:#fff;--canvas:#f4f7fb}\n*{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;color:var(--ink)}body{min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at 15% 0%,#dceaff 0,transparent 42%),radial-gradient(ellipse at 100% 100%,#e3eafe 0,transparent 38%),var(--canvas)}\n.modern-window{width:min(600px,100%);background:var(--surface);border:1px solid #e0e7f0;border-radius:18px;box-shadow:0 24px 70px rgba(27,48,86,.14),0 3px 10px rgba(27,48,86,.04);overflow:hidden;animation:window-in .35s cubic-bezier(.2,.75,.25,1) both}\n.modern-topline{height:4px;background:linear-gradient(90deg,#2563eb,#60a5fa,#8b5cf6);background-size:200% 100%;animation:topline-flow 3s linear infinite}\n.modern-body{padding:28px 30px 24px}.modern-eyebrow{display:flex;align-items:center;gap:9px;color:#53627a;font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}\n.modern-status-dot{width:9px;height:9px;border-radius:50%;background:#3b82f6;box-shadow:0 0 0 4px #dbeafe;animation:status-pulse 1.8s ease-in-out infinite}\n.modern-heading{font-size:clamp(21px,4vw,25px);line-height:1.25;letter-spacing:-.035em;font-weight:750;margin:18px 0 8px}.modern-message{font-size:14px;line-height:1.65;color:var(--muted);min-height:44px}\n.modern-file-row{display:flex;align-items:center;gap:14px;margin:22px 0;padding:15px;border:1px solid var(--line);border-radius:12px;background:linear-gradient(110deg,#fbfdff,#f7faff)}\n.modern-doc-icon{position:relative;display:grid;place-items:center;flex:0 0 46px;width:46px;height:50px;border:1px solid #cfe0ff;border-radius:10px;background:linear-gradient(145deg,#eff6ff,#fff);color:#2563eb}\n.modern-doc-icon svg{width:24px;height:24px}.modern-file-copy{min-width:0}.modern-file-copy b{display:block;font-size:14px;line-height:1.45;font-weight:700}.modern-file-copy small{display:block;margin-top:4px;color:var(--muted);font-size:12px;line-height:1.5}\n.modern-progress-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:4px 0 10px}.modern-progress-label{font-size:12px;color:#53627a;font-weight:650}.modern-progress-percent{font-size:13px;font-weight:750;font-variant-numeric:tabular-nums;color:#1d4ed8}\n.modern-progress-track{height:10px;border-radius:999px;background:#edf2f8;overflow:hidden;box-shadow:inset 0 1px 2px rgba(20,35,60,.08)}.modern-progress-track span{position:relative;display:block;width:0;height:100%;border-radius:inherit;background:linear-gradient(90deg,#2563eb 0%,#3b82f6 52%,#60a5fa 100%);background-size:200% 100%;box-shadow:0 0 14px rgba(59,130,246,.22);transition:width .28s ease;animation:progress-flow 2.2s linear infinite}.modern-progress-track span:after{content:\"\";position:absolute;inset:0;background:linear-gradient(105deg,transparent 20%,rgba(255,255,255,.45) 48%,transparent 72%);transform:translateX(-100%);animation:progress-shine 1.8s ease-in-out infinite}\n.modern-meta{display:flex;justify-content:space-between;gap:12px;margin-top:10px;color:#69778c;font-size:11px;line-height:1.5}.modern-meta span:last-child{text-align:right;font-variant-numeric:tabular-nums}.modern-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:23px;padding-top:17px;border-top:1px solid var(--line)}.modern-secure{display:flex;align-items:center;gap:7px;color:#7b8798;font-size:11px}.modern-secure svg{width:14px;height:14px;color:#64748b}.modern-preparing{display:inline-flex;align-items:center;gap:8px;padding:9px 13px;border:1px solid #dce7f8;border-radius:9px;background:#f5f8ff;color:#2857a7;font-size:12px;font-weight:650}.modern-spinner{width:13px;height:13px;border:2px solid #c7d9fb;border-top-color:#2563eb;border-radius:50%;animation:spin .75s linear infinite}\n@keyframes window-in{from{opacity:0;transform:translateY(8px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes status-pulse{50%{box-shadow:0 0 0 7px rgba(219,234,254,.35)}}@keyframes progress-flow{to{background-position:200% 0}}@keyframes progress-shine{to{transform:translateX(100%)}}@keyframes topline-flow{to{background-position:200% 0}}\n@media(max-width:480px){body{padding:14px}.modern-body{padding:23px 18px 18px}.modern-file-row{padding:12px}.modern-meta{font-size:10px}.modern-footer{align-items:flex-start}.modern-secure{max-width:52%}}\n@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}}\n</style></head><body><main class=\"modern-window\" role=\"status\" aria-live=\"polite\"><div class=\"modern-topline\"></div><div class=\"modern-body\"><div class=\"modern-eyebrow\"><span class=\"modern-status-dot\" aria-hidden=\"true\"></span>Vehicle report preparation</div><div class=\"modern-heading\" id=\"waitTitle\">Preparing your vehicle report</div><div class=\"modern-message\" id=\"waitMessage\">Collecting vehicle history and selected documents.</div><div class=\"modern-file-row\"><span class=\"modern-doc-icon\" aria-hidden=\"true\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M13.5 2.8H6.8A1.8 1.8 0 0 0 5 4.6v14.8a1.8 1.8 0 0 0 1.8 1.8h10.4a1.8 1.8 0 0 0 1.8-1.8V8.3z\"/><path d=\"M13 3v5.5h5.5M8.5 13h7M8.5 16.5h7\"/></svg></span><div class=\"modern-file-copy\"><b>Vehicle report and documents</b><small id=\"waitSub\">Print starts automatically when all selected documents are ready.</small></div></div><div class=\"modern-progress-head\"><span class=\"modern-progress-label\">Preparing your files</span><strong id=\"waitPercent\" class=\"modern-progress-percent\">0%</strong></div><div class=\"modern-progress-track\" role=\"progressbar\" aria-label=\"Report preparation progress\" aria-valuemin=\"0\" aria-valuemax=\"100\" aria-valuenow=\"0\"><span id=\"waitProgress\"></span></div><div class=\"modern-meta\"><span>Preparation progress</span><span id=\"waitPages\">Counting document pages…</span></div><div class=\"modern-footer\"><span class=\"modern-secure\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"4\" y=\"10\" width=\"16\" height=\"11\" rx=\"2\"/><path d=\"M8 10V7a4 4 0 0 1 8 0v3\"/></svg>Your documents are being prepared locally</span><span class=\"modern-preparing\"><span class=\"modern-spinner\" aria-hidden=\"true\"></span>Preparing…</span></div></div></main></body></html>");;
      printWindow.document.close();
    }
  }catch(err){console.warn('Print tab could not be opened; falling back to current tab',err)}
  let printProgress=0,preparedDocumentPages=0,totalDocumentPages=0,loadedDocumentCount=0;
  const updatePrintWait=(title,message,sub,progress=null,pageInfo=null)=>{
    try{if(printWindow&&!printWindow.closed){const d=printWindow.document;const t=d.getElementById('waitTitle'),m=d.getElementById('waitMessage'),ss=d.getElementById('waitSub'),bar=d.getElementById('waitProgress'),track=d.querySelector('.modern-progress-track'),pct=d.getElementById('waitPercent'),pages=d.getElementById('waitPages');if(t)t.textContent=title;if(m)m.textContent=message;if(ss&&sub)ss.textContent=sub;if(pages&&pageInfo)pages.textContent=pageInfo;if(progress!==null){printProgress=Math.max(printProgress,Math.min(100,Math.round(progress)));if(bar)bar.style.width=printProgress+'%';if(track)track.setAttribute('aria-valuenow',String(printProgress));if(pct)pct.textContent=printProgress+'%';}}}catch(_){}
  };
  const source=document.getElementById('reportArea');
  const original=source?.querySelector('.report-sheet');
  if(!original||!original.innerHTML.trim()){
    toast('Vehicle Report is still loading. Please open the report once and try again.','error');return;
  }
  // Native browser print avoids the single long html2canvas image.
  document.getElementById('vehicleReportPdfStage')?.remove();
  const stage=document.createElement('div');
  stage.id='vehicleReportPdfStage';
  stage.style.cssText='position:static;width:100%;height:auto;overflow:visible;background:#fff;z-index:auto;display:block;padding:0;box-sizing:border-box';
  const clone=original.cloneNode(true);
  clone.removeAttribute('id');
  clone.style.cssText='display:block;flex:0 0 auto;width:190mm!important;min-width:190mm!important;max-width:190mm!important;min-height:0!important;height:auto!important;margin:0!important;padding:8mm!important;box-sizing:border-box!important;background:#fff!important;color:#172033!important;box-shadow:none!important;border-radius:0!important;overflow:visible!important;transform:none!important';
  const css=document.createElement('style');
  css.textContent=[
    '#vehicleReportPdfStage *{box-sizing:border-box!important}',
    '#vehicleReportPdfStage .report-sheet{width:190mm!important;min-height:0!important;height:auto!important;overflow:visible!important;font-size:9.5pt!important}',
    '#vehicleReportPdfStage .report-brand{overflow:visible!important;display:flex!important;align-items:center!important;gap:5mm!important}',
    '#vehicleReportPdfStage .report-brand-logo{display:block!important;width:auto!important;height:15mm!important;max-width:48mm!important;max-height:15mm!important;object-fit:contain!important;overflow:visible!important;flex:0 0 auto!important}',
    '#vehicleReportPdfStage .report-head{break-inside:avoid!important;page-break-inside:avoid!important}',
    '#vehicleReportPdfStage .report-section{margin:3mm 0!important;padding:0!important}',
    '#vehicleReportPdfStage .report-section-title{font-size:8pt!important;letter-spacing:.08em!important;margin:3mm 0 1.5mm!important;break-after:avoid!important;page-break-after:avoid!important}',
    '#vehicleReportPdfStage .report-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:2mm!important;width:100%!important;max-width:100%!important}',
    '#vehicleReportPdfStage .report-grid>div{padding:2mm!important;min-width:0!important;break-inside:avoid!important}',
    '#vehicleReportPdfStage .report-grid span{font-size:6.5pt!important}',
    '#vehicleReportPdfStage .report-grid b{font-size:8.5pt!important;overflow-wrap:anywhere!important}',
    '#vehicleReportPdfStage .report-current-policy{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:2mm!important;padding:3mm!important}',
    '#vehicleReportPdfStage .report-current-policy span{font-size:6.5pt!important}',
    '#vehicleReportPdfStage .report-current-policy b{font-size:8.5pt!important;overflow-wrap:anywhere!important}',
    '#vehicleReportPdfStage .report-table{width:100%!important;max-width:100%!important;table-layout:fixed!important;border-collapse:collapse!important;font-size:7.5pt!important;break-inside:auto!important;page-break-inside:auto!important}',
    '#vehicleReportPdfStage .report-table thead{display:table-header-group!important}',
    '#vehicleReportPdfStage .report-table tr{break-inside:avoid!important;page-break-inside:avoid!important}',
    '#vehicleReportPdfStage .report-table th{height:auto!important;padding:2mm 1.2mm!important;font-size:7pt!important;vertical-align:middle!important}',
    '#vehicleReportPdfStage .report-table td{padding:1.5mm 1.2mm!important;vertical-align:top!important;overflow-wrap:anywhere!important;word-break:normal!important}',
    '#vehicleReportPdfStage .report-table td.date,#vehicleReportPdfStage .report-table td.cost{white-space:nowrap!important}',
    '#vehicleReportPdfStage .report-table td.policy-no{font-size:7pt!important;overflow-wrap:anywhere!important;word-break:break-word!important}',
    '#vehicleReportPdfStage .report-document-grid{display:block!important}',
    '#vehicleReportPdfStage .report-document-card{display:grid!important;grid-template-columns:38mm 1fr 1fr!important;gap:2mm!important;padding:2mm 0!important;border:0!important;border-bottom:1px solid #e5e7eb!important;border-radius:0!important;break-inside:avoid!important}',
    '#vehicleReportPdfStage .report-document-card>b{font-size:8pt!important}',
    '#vehicleReportPdfStage .report-document-card>span{font-size:7.5pt!important}',
    '#vehicleReportPdfStage .report-doc-view,#vehicleReportPdfStage button{display:none!important}',
    '#vehicleReportPdfStage .report-incomplete-label{font-size:8pt!important;color:#98a2b3!important;font-style:italic!important}',
    '#vehicleReportPdfStage .report-footer{margin-top:3mm!important;padding-top:2mm!important;font-size:7pt!important;break-inside:avoid!important}',
    '#vehicleReportPdfStage .report-document-print-page{width:190mm!important;min-height:0!important;height:auto!important;padding:3mm!important;margin:0!important;background:#fff!important;break-before:page!important;page-break-before:always!important;break-after:auto!important;page-break-after:auto!important}',
    '#vehicleReportPdfStage .report-document-print-page h3{font-size:8.5pt!important;margin:0 0 3mm!important;padding-bottom:2mm!important}',
    '#vehicleReportPdfStage .report-document-print-page img,#vehicleReportPdfStage .report-document-print-page canvas{display:block!important;width:auto!important;height:auto!important;max-width:100%!important;max-height:245mm!important;object-fit:contain!important;margin:0 auto!important;break-inside:avoid!important;page-break-inside:avoid!important}',
    '#vehicleReportPdfStage .report-incomplete-row{color:#98a2b3!important}'
  ].join('');
  stage.appendChild(css);
  stage.appendChild(clone);
  document.body.appendChild(stage);
  if(selection.hideIncomplete)clone.querySelectorAll('[data-incomplete="1"]').forEach(row=>row.remove());
  // Printed footer intentionally contains only the date and page number—no generated-by text, name, or link.
  const reportFooter=clone.querySelector('.report-footer');
  if(reportFooter)reportFooter.innerHTML='<span>'+esc(formatDateNice(new Date().toISOString().slice(0,10)))+'</span><span class="print-page-number"></span>';

  const activeDocs=Array.isArray(docs)?docs:[];
  const curIns=(insuranceHistory||[]).find(x=>x.car_id===car?.id&&x.policy_status==='current');
  const curPuc=(pucHistory||[]).find(x=>x.car_id===car?.id&&x.puc_status==='current');
  const pickDoc=(id,type)=>activeDocs.find(d=>id&&d.id===id)||activeDocs.find(d=>d.document_type===type&&d.active&&!d.archived_at);
  const chosen=[];
  if(selection.rc){const d=pickDoc(null,'rc');if(d)chosen.push({doc:d,label:'Registration Certificate',number:car?.registration_no,validity:car?.rc_validity})}
  if(selection.insurance){const d=pickDoc(curIns?.source_document_id,'insurance');if(d)chosen.push({doc:d,label:'Current Insurance',number:curIns?.policy_number||car?.insurance_number,validity:curIns?.expiry_date||car?.insurance_expiry})}
  if(selection.puc){const d=pickDoc(curPuc?.source_document_id,'puc');if(d)chosen.push({doc:d,label:'Current PUC',number:curPuc?.certificate_number||car?.puc_certificate_no,validity:curPuc?.expiry_date||car?.puc_expiry})}
  if(selection.archiveInsurance)activeDocs.filter(d=>d.document_type==='insurance'&&d.archived_at).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).forEach(d=>chosen.push({doc:d,label:'Archived Insurance',number:d.document_name||d.file_name,validity:d.document_expiry}));
  if(selection.archivePuc)activeDocs.filter(d=>d.document_type==='puc'&&d.archived_at).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).forEach(d=>chosen.push({doc:d,label:'Archived PUC',number:d.document_name||d.file_name,validity:d.document_expiry}));

  let status=null,failed=[],printObjectUrls=[];
  const getUrl=async d=>{
    if((d.storage_backend||'supabase')==='r2'){const r=await workerGet('/api/files/presign-download?document_id='+encodeURIComponent(d.id)+'&car_id='+encodeURIComponent(car.id));return r.data.url}
    const r=await db.storage.from('car-documents').createSignedUrl(d.storage_path,300);
    if(r.error)throw r.error;return r.data.signedUrl;
  };
  const ensurePdfJs=async()=>{
    if(window.pdfjsLib)return window.pdfjsLib;
    await new Promise((resolve,reject)=>{
      const existing=document.getElementById('carmy-print-pdfjs');
      if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',()=>reject(new Error('PDF renderer failed to load')),{once:true});return}
      const tag=document.createElement('script');tag.id='carmy-print-pdfjs';tag.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';tag.onload=resolve;tag.onerror=()=>reject(new Error('PDF renderer failed to load'));document.head.appendChild(tag);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    return window.pdfjsLib;
  };
  const addPlaceholder=(item)=>{
    const page=document.createElement('section');page.className='report-document-print-page report-document-load-error';
    page.innerHTML='<p class="report-document-error">A selected document could not be loaded. Check the original document in your garage before printing.</p>';
    clone.appendChild(page);
  };
  if(chosen.length){
    status=document.createElement('div');status.className='report-print-loading';status.textContent='Preparing selected documents…';stage.appendChild(status);updatePrintWait('Copying files','Downloading and preparing selected vehicle documents.','Print starts automatically when all documents are ready.',8,'Counting selected document pages…');
    for(const item of chosen){
      try{
        const url=await getUrl(item.doc);
        const ext=String(item.doc.file_name||'').split('.').pop().toLowerCase();
        const header='';updatePrintWait('Copying '+item.label,'Loading and formatting document pages.','Print starts automatically when all selected documents are ready.',15,'Document pages prepared: '+preparedDocumentPages+' / '+totalDocumentPages+' · '+loadedDocumentCount+' / '+chosen.length+' documents');
        if(ext==='pdf'){
          const pdfjs=await ensurePdfJs(),resp=await fetch(url);
          if(!resp.ok)throw new Error('Document download failed');
          const pdf=await pdfjs.getDocument({data:await resp.arrayBuffer()}).promise;
          totalDocumentPages+=pdf.numPages;
          updatePrintWait('Copying document pages','Found '+pdf.numPages+' PDF pages. Rendering for print.','Keep this window open while pages are prepared.',20,'PDF pages prepared: '+preparedDocumentPages+' / '+totalDocumentPages+' · '+loadedDocumentCount+' / '+chosen.length+' documents');
          for(let p=1;p<=pdf.numPages;p++){
            const page=await pdf.getPage(p),baseViewport=page.getViewport({scale:1});
            // Keep document text legible while reducing the raster workload from 1.35x.
            const renderScale=Math.min(1.05,1250/Math.max(baseViewport.width,baseViewport.height));
            const vp=page.getViewport({scale:renderScale}),canvas=document.createElement('canvas');
            canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);
            const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('Canvas rendering is unavailable');
            ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
            // Update before rendering; otherwise the wait screen appears stuck on the previous page.
            updatePrintWait('Rendering document page','Rendering page '+p+' of '+pdf.numPages+'.','Preparing a print-ready page.',20+Math.round(65*(loadedDocumentCount+((p-1)/pdf.numPages))/Math.max(1,chosen.length)),'Rendering PDF page '+p+' / '+pdf.numPages+' · '+preparedDocumentPages+' pages ready');
            await page.render({canvasContext:ctx,viewport:vp,background:'#fff'}).promise;
            // Avoid synchronous base64 encoding on the UI thread.
            const pageBlob=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not encode PDF page image')),'image/jpeg',0.78));
            const pageUrl=URL.createObjectURL(pageBlob);printObjectUrls.push(pageUrl);
            const wrap=document.createElement('section');wrap.className='report-document-print-page';
            const docImg=new Image();docImg.loading='eager';docImg.decoding='async';docImg.alt=item.label+' page '+p;docImg.src=pageUrl;wrap.appendChild(docImg);clone.appendChild(wrap);
            canvas.width=canvas.height=1;
            page.cleanup();
            preparedDocumentPages++;
            updatePrintWait('Copying document pages','Prepared PDF page '+p+' of '+pdf.numPages+'.','Print opens automatically when ready.',20+Math.round(65*(loadedDocumentCount+(p/pdf.numPages))/Math.max(1,chosen.length)),'PDF pages prepared: '+preparedDocumentPages+' / '+totalDocumentPages+' · '+loadedDocumentCount+' / '+chosen.length+' documents');
          }
          loadedDocumentCount++;
        }else{
          const imageResponse=await fetch(url,{mode:'cors',credentials:'omit'});
          if(!imageResponse.ok)throw new Error('Image fetch failed with HTTP '+imageResponse.status);
          const imageBlob=await imageResponse.blob();
          const imageObjectUrl=URL.createObjectURL(imageBlob);printObjectUrls.push(imageObjectUrl);
          const img=new Image();img.crossOrigin='anonymous';img.loading='eager';img.decoding='async';img.src=imageObjectUrl;
          if(typeof img.decode==='function')await img.decode();else await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Image failed to load'))});
          const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
          const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
          const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas rendering is unavailable');
          ctx.drawImage(img,0,0,canvas.width,canvas.height);
          const wrap=document.createElement('section');wrap.className='report-document-print-page';
          wrap.innerHTML='';const docImg=new Image();docImg.loading='eager';docImg.alt=item.label;docImg.src=canvas.toDataURL('image/jpeg',0.85);canvas.width=canvas.height=1;wrap.appendChild(docImg);clone.appendChild(wrap);
          preparedDocumentPages++;totalDocumentPages++;loadedDocumentCount++;
          updatePrintWait('Image document ready','Prepared image document '+loadedDocumentCount+'.','Preparing next document.',20+Math.round(65*loadedDocumentCount/Math.max(1,chosen.length)),'Document pages prepared: '+preparedDocumentPages+' / '+totalDocumentPages+' · '+loadedDocumentCount+' / '+chosen.length+' documents');
        }
      }catch(err){
        console.error('Document print load failed: '+item.label,err);failed.push(item.label+': '+String(err?.message||err));addPlaceholder(item);
      }
    }
    status.remove();
  }

  const logo=clone.querySelector('.report-brand-logo');
  if(logo){
    logo.loading='eager';
    try{
      const logoResponse=await fetch(new URL(logo.getAttribute('src'),document.baseURI).href,{cache:'force-cache'});
      if(!logoResponse.ok)throw new Error('Logo request failed: '+logoResponse.status);
      let logoSvg=await logoResponse.text();
      if(!/\bwidth=/.test(logoSvg.slice(0,200)))logoSvg=logoSvg.replace('<svg ','<svg width="980" height="210" ');
      logo.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(logoSvg);
      logo.removeAttribute('srcset');
      logo.style.cssText='display:block!important;width:48mm!important;height:10.3mm!important;min-width:48mm!important;max-width:48mm!important;max-height:10.3mm!important;object-fit:fill!important;object-position:left center!important;overflow:visible!important;flex:0 0 48mm!important';
      if(typeof logo.decode==='function')await logo.decode();else if(!logo.complete)await new Promise((resolve,reject)=>{logo.onload=resolve;logo.onerror=reject});
    }catch(err){console.error('Report logo failed to decode',err);const label=document.createElement('b');label.className='report-brand-fallback';label.textContent='Torq Desk';logo.replaceWith(label)}
  }
  await Promise.all([...clone.querySelectorAll('img')].map(async img=>{
    img.loading='eager';
    if(typeof img.decode==='function'){try{await img.decode()}catch(e){if(!img.classList.contains('report-brand-logo'))throw e}}
    else if(!img.complete)await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject});
  })).catch(err=>console.error('A report image failed to decode',err));
  if(failed.length){
    const msg='Some documents could not be loaded:\n'+failed.join('\n')+'\nA placeholder page will be included for each failed document. Continue printing?';
    if(!confirm(msg)){stage.remove();return}
  }
  const button=document.querySelector('#report .toolbar button[onclick*="printVehicleReport"]');
  const hint=document.createElement('p');hint.className='report-print-hint no-print';hint.textContent='In the print dialog choose Save as PDF, enable Background graphics (Print backgrounds in Firefox) and disable Headers and footers.';stage.insertBefore(hint,clone);
  let cleaned=false;
  const cleanup=()=>{if(cleaned)return;cleaned=true;window.removeEventListener('afterprint',cleanup);stage.remove();printObjectUrls.forEach(url=>URL.revokeObjectURL(url));printObjectUrls=[];if(button){button.disabled=false;button.textContent='PRINT / SAVE PDF'}};
  window.addEventListener('afterprint',cleanup,{once:true});
  try{
    if(document.fonts?.ready)await document.fonts.ready;
    await Promise.all([...clone.querySelectorAll('img')].map(async img=>{img.loading='eager';if(img.decode)await img.decode();else if(!img.complete)await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject})}));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(button){button.disabled=true;button.textContent='PRINTING…'}
    if(printWindow&&!printWindow.closed){
      // Copy the app's CSS and the fully prepared report into a separate document.
      // This prevents Firefox's print preview from reflowing/hiding the live app DOM.
      updatePrintWait('Finishing the A4 layout','All selected documents are loaded. Checking images, fonts and page breaks.','The print dialog will open in a moment.',94,'Document pages prepared: '+preparedDocumentPages+' / '+totalDocumentPages+' · Preparation almost complete');
      const pd=printWindow.document;
      pd.open();
      pd.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="'+esc(document.baseURI)+'"><title>Vehicle Report</title></head><body></body></html>');
      pd.close();
      document.querySelectorAll('link[rel="stylesheet"],style').forEach(node=>pd.head.appendChild(node.cloneNode(true)));
      const printStage=stage.cloneNode(true);
      printStage.style.cssText='display:block!important;position:static!important;width:100%!important;height:auto!important;overflow:visible!important;background:#fff!important;padding:0!important;margin:0!important';
      pd.body.style.cssText='margin:0!important;padding:0!important;background:#fff!important;color:#172033!important';
      pd.body.appendChild(printStage);
      const printCss=pd.createElement('style');
      const printDate=formatDateNice(new Date().toISOString().slice(0,10));
      printCss.textContent='@page{size:A4;margin:12mm 8mm 14mm 8mm;@top-left{content:""}@top-center{content:""}@top-right{content:""}@bottom-left{content:"'+printDate+'";font:8pt Inter,Arial,sans-serif;color:#526071}@bottom-center{content:""}@bottom-right{content:"Page " counter(page) " of " counter(pages);font:8pt Inter,Arial,sans-serif;color:#526071}}html,body{background:#fff!important;color:#172033!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0!important;padding:0!important}#vehicleReportPdfStage{display:block!important;position:static!important;width:100%!important;overflow:visible!important}#vehicleReportPdfStage .report-sheet{break-after:auto!important;page-break-after:auto!important}#vehicleReportPdfStage .report-document-print-page{break-before:page!important;page-break-before:always!important}#vehicleReportPdfStage .report-footer{display:flex!important;justify-content:flex-end!important;align-items:center!important;margin-top:3mm!important;padding-top:2mm!important;border-top:1px solid #e5e7eb!important;font-size:8pt!important;color:#526071!important}.print-page-number:after{content:"Page " counter(page)}#vehicleReportPdfStage .report-document-error{font-size:9pt!important;color:#9a3412!important}';
      pd.head.appendChild(printCss);
      await Promise.all([...pd.images].map(img=>img.decode?img.decode().catch(()=>{}):Promise.resolve()));
      if(pd.fonts?.ready)await pd.fonts.ready;
      await new Promise(resolve=>printWindow.requestAnimationFrame(()=>printWindow.requestAnimationFrame(resolve)));
      printWindow.focus();
      updatePrintWait('Opening print preview','Your A4 report is ready. Opening the browser print dialog now.','Choose Save as PDF in the print dialog.',100,'Document pages prepared: '+preparedDocumentPages+' / '+totalDocumentPages+' · Preparation complete');
      const retryBar=pd.createElement('div');
      retryBar.id='carmyPrintRetryBar';
      retryBar.innerHTML='<div style="display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;padding:12px 16px;background:#f1f5f9;border-bottom:1px solid #cbd5e1;font:14px system-ui,Arial,sans-serif;color:#172033"><span id="carmyPrintRetryStatus" role="status">Report is ready. If you closed the print dialog, you can open it again.</span><button id="carmyPrintAgain" type="button" style="border:0;border-radius:9px;background:#2563eb;color:#fff;padding:10px 16px;font-weight:700;cursor:pointer">Print again / Save PDF</button></div>';
      const retryCss=pd.createElement('style');retryCss.textContent='@media print{#carmyPrintRetryBar{display:none!important}}';pd.head.appendChild(retryCss);
      pd.body.insertBefore(retryBar,pd.body.firstChild);
      pd.getElementById('carmyPrintAgain').addEventListener('click',()=>{const status=pd.getElementById('carmyPrintRetryStatus');if(status)status.textContent='Opening print dialog…';printWindow.focus();printWindow.requestAnimationFrame(()=>printWindow.print())});
      printWindow.addEventListener('afterprint',()=>{const status=pd.getElementById('carmyPrintRetryStatus');if(status)status.textContent='Print dialog closed. Click “Print again / Save PDF” to retry.'});
      printWindow.print();
    }else{
      // Popup-blocked fallback retains the previous native-print behavior.
      window.print();
    }
  }catch(err){console.error('Vehicle report print preparation failed:',err);toast('Report preparation failed. Check the console for the document error.','error');cleanup()}
  // Firefox can return from window.print() before the preview is closed. Keep the print stage until afterprint; a subsequent report-print attempt also removes a stale stage.
}
window.printVehicleReport = printVehicleReport;
/* Torq Desk About, Terms & Contact panel */
(()=>{const modal=document.getElementById('mdInfoModal'),content=document.getElementById('mdInfoContent');if(!modal||!content)return;
const pages={
about:{title:'A little love for every machine.',html:`<p class="md-info-eyebrow">OUR STORY</p><h2>Some people see a car.<br><span>We see a thousand stories.</span></h2><p>We love the sound of an engine settling into a steady idle, the engineering behind a perfectly timed gear change, and the history written into every kilometre.</p><p>Every service stamp, replaced part, long road and small repair becomes part of a vehicle’s story. Like human history, a car’s history deserves to be remembered—not scattered across old bills, gloveboxes and forgotten messages.</p><blockquote>“An engine is more than metal and motion. It is human ingenuity—and every kilometre adds another chapter.”</blockquote><p>Torq Desk was created to give that story a home: a clear record of maintenance, documents, ownership milestones and the care that keeps a vehicle going.</p><div class="md-info-values"><div><b>Built for the long run</b><span>Keep the history, not just the odometer reading.</span></div><div><b>Made for Indian roads</b><span>Designed around the documents and ownership journey drivers know.</span></div><div><b>Your car. Your story.</b><span>Your vehicle records should stay under your control.</span></div></div>`},
terms:{title:'Terms & Conditions',html:`<p class="md-info-eyebrow">PLEASE READ</p><h2>Clear records. Clear expectations.</h2><p class="md-info-muted">Last updated: 12 October 2026</p><h3>1. Using Torq Desk</h3><p>Torq Desk helps organise vehicle details, service history, maintenance costs, documents, reminders and reports. You must provide accurate information and use the service lawfully.</p><h3>2. Your account and records</h3><p>You are responsible for keeping your sign-in credentials secure and for activity under your account. Only upload information you are authorised to store. Check records, expiry dates and generated reports for accuracy.</p><h3>3. Privacy and access</h3><p>Your vehicle records are intended for your private use. Torq Desk does not sell personal or vehicle data. We do not intentionally view or disclose your records without permission, except when necessary to provide or secure the service, respond to support requests, prevent abuse, or comply with applicable law. Limited infrastructure providers may process data to operate the service.</p><h3>4. Storage and security</h3><p>Torq Desk is designed for India-focused vehicle ownership and data handling. We use access controls and reasonable safeguards. No online service can guarantee absolute security. Actual data residency depends on the regions configured with our hosting, database and file-storage providers.</p><h3>5. Documents and reports</h3><p>Torq Desk is an organisational tool, not a government authority, insurer, mechanic or legal adviser. Reports do not replace original documents, official records, professional inspections or statutory requirements. Verify Form 29/30 paperwork and transactions before submission.</p><h3>6. Availability and changes</h3><p>Features may be updated, interrupted or retired. Keep copies of important original documents and maintain your own backups.</p><h3>7. Acceptable use</h3><p>Do not attempt unauthorised access, disrupt the service, upload malicious content, or violate another person’s rights or the law.</p><h3>8. Contact and updates</h3><p>For help or privacy questions, email <a href="mailto:hi@torqdesk.in">hi@torqdesk.in</a>. Terms may be updated as the service evolves.</p><p class="md-info-note">These general terms are not a substitute for legal review. Publish a separate detailed Privacy Policy before public launch.</p>`},
contact:{title:'We’re listening.',html:`<p class="md-info-eyebrow">CONTACT TORQ DESK</p><h2>Good journeys start with a conversation.</h2><p>Need help with your account, vehicle records or documents? Have an idea to make Torq Desk better? Write to us.</p><div class="md-contact-cards"><a href="mailto:hi@torqdesk.in"><span class="md-contact-icon">↗</span><span><small>HELP &amp; SUPPORT</small><b>hi@torqdesk.in</b><em>Account, access and product help</em></span></a><a href="mailto:info@torqdesk.in"><span class="md-contact-icon">✳</span><span><small>FEEDBACK &amp; IDEAS</small><b>info@torqdesk.in</b><em>Suggestions, ideas and feedback</em></span></a></div><p class="md-info-note">Please do not send passwords or unnecessary sensitive documents by email.</p>`}};
function open(tab){const p=pages[tab]||pages.about;modal.hidden=false;document.body.classList.add('md-info-open');content.innerHTML='<h1 id="mdInfoTitle">'+p.title+'</h1>'+p.html;modal.querySelectorAll('[data-info-tab]').forEach(b=>b.classList.toggle('active',b.dataset.infoTab===tab));modal.querySelector('.md-info-close').focus()}
function close(){modal.hidden=true;document.body.classList.remove('md-info-open')}
document.addEventListener('click',e=>{const t=e.target.closest('[data-info-tab]');if(t){open(t.dataset.infoTab);return}const o=e.target.closest('[data-info-open]');if(o){open(o.dataset.infoOpen);return}if(e.target.closest('[data-info-close]'))close()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)close()});
})();
