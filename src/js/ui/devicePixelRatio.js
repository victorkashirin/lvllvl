UI.getDevicePixelRatio = function() {
  var ratio = Number(window.devicePixelRatio);
  return isFinite(ratio) && ratio > 0 ? ratio : 1;
}

UI.devicePixelRatio = UI.getDevicePixelRatio();
UI.devicePixelRatioRevision = 0;
UI.devicePixelRatioListeners = [];
UI.devicePixelRatioMediaQuery = null;
UI.devicePixelRatioChangeHandler = null;
UI.devicePixelRatioRefreshScheduled = false;

UI.applyDevicePixelRatio = function(pixelRatio) {
  pixelRatio = Number(pixelRatio);
  if(!isFinite(pixelRatio) || pixelRatio <= 0) {
    pixelRatio = 1;
  }
  if(pixelRatio === UI.devicePixelRatio) {
    return null;
  }

  var change = {
    pixelRatio: pixelRatio,
    previousPixelRatio: UI.devicePixelRatio,
    revision: UI.devicePixelRatioRevision + 1
  };
  UI.devicePixelRatio = pixelRatio;
  UI.devicePixelRatioRevision = change.revision;
  return change;
}

UI.notifyDevicePixelRatioChange = function(change) {
  if(!change) {
    return false;
  }
  var listeners = UI.devicePixelRatioListeners.slice();
  for(var i = 0; i < listeners.length; i++) {
    try {
      listeners[i](change.pixelRatio, change.previousPixelRatio, change.revision);
    } catch(error) {
      if(typeof console != 'undefined' && typeof console.error == 'function') {
        console.error('Device pixel ratio listener failed', error);
      }
    }
  }
  return true;
}

UI.setDevicePixelRatio = function(pixelRatio) {
  return UI.notifyDevicePixelRatioChange(UI.applyDevicePixelRatio(pixelRatio));
}

UI.onDevicePixelRatioChange = function(listener) {
  UI.devicePixelRatioListeners.push(listener);
  return function() {
    var index = UI.devicePixelRatioListeners.indexOf(listener);
    if(index !== -1) {
      UI.devicePixelRatioListeners.splice(index, 1);
    }
  };
}

UI.refreshDevicePixelRatio = function() {
  var change = UI.applyDevicePixelRatio(UI.getDevicePixelRatio());
  UI.watchDevicePixelRatio();
  UI.resize();
  UI.notifyDevicePixelRatioChange(change);
  return change !== null;
}

UI.requestDevicePixelRatioRefresh = function() {
  if(UI.devicePixelRatioRefreshScheduled) {
    return;
  }
  if(typeof window.requestAnimationFrame != 'function') {
    UI.refreshDevicePixelRatio();
    return;
  }
  UI.devicePixelRatioRefreshScheduled = true;
  window.requestAnimationFrame(function() {
    UI.devicePixelRatioRefreshScheduled = false;
    UI.refreshDevicePixelRatio();
  });
}

UI.watchDevicePixelRatio = function() {
  if(!window.matchMedia) {
    return;
  }
  if(UI.devicePixelRatioMediaQuery && UI.devicePixelRatioChangeHandler) {
    if(UI.devicePixelRatioMediaQuery.removeEventListener) {
      UI.devicePixelRatioMediaQuery.removeEventListener('change', UI.devicePixelRatioChangeHandler);
    } else if(UI.devicePixelRatioMediaQuery.removeListener) {
      UI.devicePixelRatioMediaQuery.removeListener(UI.devicePixelRatioChangeHandler);
    }
  }
  UI.devicePixelRatioMediaQuery = window.matchMedia(
    '(resolution: ' + UI.getDevicePixelRatio() + 'dppx)');
  UI.devicePixelRatioChangeHandler = function() {
    UI.requestDevicePixelRatioRefresh();
  };
  if(UI.devicePixelRatioMediaQuery.addEventListener) {
    UI.devicePixelRatioMediaQuery.addEventListener('change', UI.devicePixelRatioChangeHandler);
  } else if(UI.devicePixelRatioMediaQuery.addListener) {
    UI.devicePixelRatioMediaQuery.addListener(UI.devicePixelRatioChangeHandler);
  }
}
