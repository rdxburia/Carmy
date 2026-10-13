(() => {
 'use strict';
 const menu=document.querySelector('[data-td-menu]');
 const nav=document.querySelector('[data-td-nav]');
 if(menu&&nav){menu.addEventListener('click',()=>{const open=nav.classList.toggle('is-open');menu.setAttribute('aria-expanded',String(open));});nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('is-open');menu.setAttribute('aria-expanded','false');}));}
 let installPrompt=null;
 const actionBar=document.querySelector('.td-actions');
 if(actionBar&&!actionBar.querySelector('[data-td-install]')){const install=document.createElement('button');install.type='button';install.className='td-btn secondary';install.dataset.tdInstall='';install.textContent='Install';install.hidden=true;install.addEventListener('click',async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;install.hidden=true;});actionBar.append(install);}
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;const install=document.querySelector('[data-td-install]');if(install)install.hidden=false;});
 window.addEventListener('appinstalled',()=>{const install=document.querySelector('[data-td-install]');if(install)install.hidden=true;});
 if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js',{scope:'./'}).then(reg=>{const announce=()=>{if(reg.waiting&&confirm('A new Torq Desk version is ready. Update now?'))reg.waiting.postMessage({type:'SKIP_WAITING'});};if(reg.waiting)announce();reg.addEventListener('updatefound',()=>{const worker=reg.installing;if(worker)worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)announce();});});}).catch(error=>console.warn('Offline shell registration failed.',error)));}
 const items=[...document.querySelectorAll('.td-reveal')];
 if('IntersectionObserver' in window&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-visible');io.unobserve(e.target);}}),{threshold:.12});items.forEach((el,i)=>{el.style.transitionDelay=(Math.min(i%5,4)*60)+'ms';io.observe(el);});}else items.forEach(el=>el.classList.add('is-visible'));
 document.addEventListener('visibilitychange',()=>{document.querySelectorAll('.td-road').forEach(el=>el.style.animationPlayState=document.hidden?'paused':'running');});
})();