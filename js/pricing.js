(() => {
 'use strict';
 const config=window.TORQ_PRICING;
 const grid=document.querySelector('[data-td-plans]');
 if(!config||!grid)return;
 let audience='owners',period='monthly';
 const audienceButtons=[...document.querySelectorAll('[data-audience]')],periodButtons=[...document.querySelectorAll('[data-period]')];
 const money=value=>value===null?'Custom':value===0?'₹0':new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(value);
 function render(){const plans=config[audience]||[];grid.innerHTML=plans.map(p=>{const price=p[period];const featured=!!p.recommended&&audience==='owners';const save=period==='yearly'&&p.monthly&&p.yearly!==null?Math.max(0,Math.round((1-p.yearly/(p.monthly*12))*100)):0;return '<article class="td-card td-plan td-reveal '+(featured?'recommended':'')+'">'+(featured?'<span class="td-pill">Recommended</span>':'')+'<span class="td-pill">'+p.tag+'</span><h3>'+p.name+'</h3><div class="td-price">'+money(price)+'<small>'+(price===null?'':price===0?' / forever':period==='monthly'?' / month':' / year')+'</small></div>'+(save>0?'<span class="td-pill">Save '+save+'% vs monthly</span>':'')+'<ul>'+p.features.map(f=>'<li>'+f+'</li>').join('')+'</ul><a class="td-btn '+(featured?'':'secondary')+'" href="'+p.href+'">'+p.cta+'</a></article>';}).join('');grid.querySelectorAll('.td-reveal').forEach(el=>el.classList.add('is-visible'));const note=document.querySelector('[data-td-pricing-note]');if(note)note.textContent=config.placeholder?'All prices and plan limits shown here are placeholders for planning. Paid plans are not available yet. Features marked * may not be available in the current build.':'Pricing';}
 audienceButtons.forEach(b=>b.addEventListener('click',()=>{audience=b.dataset.audience;audienceButtons.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();}));
 periodButtons.forEach(b=>b.addEventListener('click',()=>{period=b.dataset.period;periodButtons.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();}));
 render();
})();