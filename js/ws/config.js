/* UI-only flag. Worker enforcement is authoritative; production defaults off. */
(function(){
 'use strict';
 const supplied=window.TORQ_WORKSHOP_CONFIG&&window.TORQ_WORKSHOP_CONFIG.enabled===true;
 window.TORQ_WORKSHOP_CONFIG=Object.freeze({enabled:supplied,defaultEnabled:false});
})();
