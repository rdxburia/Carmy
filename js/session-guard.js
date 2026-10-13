(function(){
 'use strict';
 function createSessionGuard(options){
  const cfg=options||{};
  const supabaseUrl=String(cfg.supabaseUrl||'').replace(/\/$/,'');
  const idleMs=Number(cfg.idleMs)||120000;
  const activityKey=String(cfg.activityKey||'carmy_last_activity');
  const getUser=typeof cfg.getUser==='function'?cfg.getUser:()=>null;
  const onIdle=typeof cfg.onIdle==='function'?cfg.onIdle:()=>{};
  const timeoutMessage=String(cfg.timeoutMessage||'Session expired. Please sign in again.');
  let lastWrite=0;
  let nativeFetch=null;
  function readActivity(){
   try{const value=Number(localStorage.getItem(activityKey)||0);return Number.isFinite(value)&&value>0?value:0}catch(_){return 0}
  }
  function writeActivity(force=false){
   const now=Date.now();
   if(!force&&now-lastWrite<5000)return;
   lastWrite=now;
   try{localStorage.setItem(activityKey,String(now))}catch(_){}
  }
  function isExpired(){
   const last=readActivity();
   return !last||Date.now()-last>idleMs;
  }
  function installFetchGuard(){
   if(window.__carmyIdleFetchGuardInstalled)return false;
   window.__carmyIdleFetchGuardInstalled=true;
   nativeFetch=window.fetch.bind(window);
   window.fetch=function(input,init){
    let url='';
    try{url=typeof input==='string'?input:(input&&input.url)||''}catch(_){}
    const isSupabaseRequest=!!supabaseUrl&&url.startsWith(supabaseUrl+'/')&&/\/(rest\/v1|storage\/v1|graphql\/v1|functions\/v1|auth\/v1)\//.test(url);
    const isLogoutRequest=/\/auth\/v1\/logout(?:\?|$)/.test(url);
    if(isSupabaseRequest&&!isLogoutRequest&&getUser()&&isExpired()){
     try{void onIdle()}catch(_){}
     return Promise.reject(new Error(timeoutMessage));
    }
    return nativeFetch(input,init);
   };
   return true;
  }
  return Object.freeze({readActivity,writeActivity,isExpired,installFetchGuard});
 }
 window.CarmySessionGuard=Object.freeze({create:createSessionGuard});
})();