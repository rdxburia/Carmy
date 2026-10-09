(function(){
  'use strict';
  var el=document.querySelector('meta[name="carmy-build"]');
  var version=el&&el.content?el.content:'unknown';
  window.CARMY_BUILD=version;
  if(window.console&&typeof window.console.info==='function'){
    window.console.info('[CarCareCloud] Build '+version);
  }
})();
