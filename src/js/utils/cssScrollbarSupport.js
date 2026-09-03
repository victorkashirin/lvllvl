var supportsCssScrollbars = (function() {
  var cachedResult;

  return function() {
    if(typeof cachedResult !== 'undefined') {
      return cachedResult;
    }

    var id = 'lvllvl-css-scrollbar-test';
    var style = document.createElement('style');
    var testElement = document.createElement('div');
    var parent = document.body || document.documentElement;

    style.textContent = '#' + id + '{overflow:scroll;width:40px;height:40px;}'
      + '#' + id + '::-webkit-scrollbar{width:10px;}';
    testElement.id = id;
    testElement.setAttribute('aria-hidden', 'true');
    testElement.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';

    parent.appendChild(style);
    parent.appendChild(testElement);
    cachedResult = 'scrollWidth' in testElement && testElement.scrollWidth === 30;
    parent.removeChild(testElement);
    parent.removeChild(style);

    return cachedResult;
  };
})();
