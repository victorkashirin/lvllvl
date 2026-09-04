(function() {
  'use strict';

  if(UI.isMobile.any()) {
    var link = document.createElement('link');
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('href', 'css/ui-mobile.css?v={v}');
    document.getElementsByTagName('head')[0].appendChild(link);

    $(function() {
      $('body').addClass('mobileMode');
    });
  }
})();
