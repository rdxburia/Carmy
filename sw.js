/* Torq Desk PWA shell. Never cache API, auth, POST or other non-GET responses. */
const CACHE_NAME='torq-desk-shell-v2';
const BASE='/Carmy/';
const SHELL=[BASE,BASE+'index.html',BASE+'offline.html',BASE+'features.html',BASE+'how-it-works.html',BASE+'pricing.html',BASE+'for-workshops.html',BASE+'faq.html',BASE+'about.html',BASE+'terms.html',BASE+'privacy.html',BASE+'contact.html',BASE+'css/public-site.css',BASE+'css/tokens.css',BASE+'js/public-site.js',BASE+'js/session-guard.js',BASE+'js/session-guard.js?v=2026.10.13-workshop-m0',BASE+'js/pricing-config.js',BASE+'js/pricing.js',BASE+'assets/torqdesk-logo.svg',BASE+'assets/torqdesk-icon.svg',BASE+'favicon.svg',BASE+'manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('torq-desk-shell-')&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('message',event=>{if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 if(url.pathname.startsWith(BASE+'api/')||url.pathname.includes('/auth/')||url.pathname.includes('/rest/v1/')||url.pathname.includes('/storage/'))return;
 if(request.headers.has('authorization'))return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).then(response=>{if(response.ok&&url.origin===self.location.origin){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));}return response;}).catch(async()=> (await caches.match(request))||(await caches.match(BASE+'index.html'))||(await caches.match(BASE+'offline.html'))));
  return;
 }
 if(url.pathname.startsWith(BASE+'css/')||url.pathname.startsWith(BASE+'js/')||url.pathname.startsWith(BASE+'assets/')||url.pathname.startsWith(BASE+'icons/')||url.pathname===BASE+'manifest.webmanifest'||url.pathname===BASE+'favicon.svg'){
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));}return response;})));
 }
});