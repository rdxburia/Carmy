(() => {
 'use strict';
 if(!('serviceWorker' in navigator)||location.protocol==='file:')return;
 window.addEventListener('load',async()=>{
  try{
   const registration=await navigator.serviceWorker.register('sw.js',{scope:'./'});
   if(registration.waiting)window.dispatchEvent(new CustomEvent('torqdesk:update-available'));
   registration.addEventListener('updatefound',()=>{const worker=registration.installing;if(!worker)return;worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)window.dispatchEvent(new CustomEvent('torqdesk:update-available'));});});
  }catch(error){console.warn('Torq Desk offline shell could not be registered.',error);}
 });
})();