(function(global, jquery) {
  'use strict';

  if(!jquery || !global.SafeHTML) {
    throw new Error('The jQuery HTML policy requires jQuery and SafeHTML');
  }

  var originalHtmlPrefilter = jquery.htmlPrefilter;
  jquery.htmlPrefilter = function(html) {
    var normalized = originalHtmlPrefilter ? originalHtmlPrefilter(html) : html;
    return global.SafeHTML.sanitizeForJQuery(normalized);
  };
})(window, window.jQuery);
