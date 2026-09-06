(function() {
  'use strict';

  UI.setMobileMode = function(enabled) {
    if(!document.body) {
      $(function() {
        UI.setMobileMode(enabled);
      });
      return;
    }

    document.body.classList.toggle('mobileMode', enabled);
  };

  UI.setMobileMode(UI.isMobile.any());
})();
