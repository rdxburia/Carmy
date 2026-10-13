(() => {
 'use strict';
 const menu=document.querySelector('[data-td-menu]');
 const nav=document.querySelector('[data-td-nav]');
 if(menu&&nav){menu.addEventListener('click',()=>{const open=nav.classList.toggle('is-open');menu.setAttribute('aria-expanded',String(open));});nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('is-open');menu.setAttribute('aria-expanded','false');}));}
 const items=[...document.querySelectorAll('.td-reveal')];
 if('IntersectionObserver' in window&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-visible');io.unobserve(e.target);}}),{threshold:.12});items.forEach((el,i)=>{el.style.transitionDelay=(Math.min(i%5,4)*60)+'ms';io.observe(el);});}else items.forEach(el=>el.classList.add('is-visible'));
 document.addEventListener('visibilitychange',()=>{document.querySelectorAll('.td-road').forEach(el=>el.style.animationPlayState=document.hidden?'paused':'running');});
})();