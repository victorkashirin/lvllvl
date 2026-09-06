var SHOWUNFINISHED = false;
var g_urlParams = new URLSearchParams(window.location.search);
if(g_urlParams.has('features') && g_urlParams.get('features') == 'all') {
  SHOWUNFINISHED = true;
}

var g_paramEditor = '';
if(g_urlParams.has('editor')) {
  g_paramEditor = g_urlParams.get('editor');
}


// http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/21963136#21963136

var lut = [];

for ( var i = 0; i < 256; i ++ ) {
  lut[ i ] = ( i < 16 ? '0' : '' ) + ( i ).toString( 16 );
}

function generateUUID() {

  var d0 = Math.random() * 0xffffffff | 0;
  var d1 = Math.random() * 0xffffffff | 0;
  var d2 = Math.random() * 0xffffffff | 0;
  var d3 = Math.random() * 0xffffffff | 0;
  var uuid = lut[ d0 & 0xff ] + lut[ d0 >> 8 & 0xff ] + lut[ d0 >> 16 & 0xff ] + lut[ d0 >> 24 & 0xff ] + '-' +
    lut[ d1 & 0xff ] + lut[ d1 >> 8 & 0xff ] + '-' + lut[ d1 >> 16 & 0x0f | 0x40 ] + lut[ d1 >> 24 & 0xff ] + '-' +
    lut[ d2 & 0x3f | 0x80 ] + lut[ d2 >> 8 & 0xff ] + '-' + lut[ d2 >> 16 & 0xff ] + lut[ d2 >> 24 & 0xff ] +
    lut[ d3 & 0xff ] + lut[ d3 >> 8 & 0xff ] + lut[ d3 >> 16 & 0xff ] + lut[ d3 >> 24 & 0xff ];

  // .toUpperCase() here flattens concatenated strings to save heap memory space.
  return uuid.toUpperCase();

};

function base64ToBuffer( str ) {

  var b = atob( str );
  var buf = new Uint8Array( b.length );

  for ( var i = 0, l = buf.length; i < l; i ++ ) {
    buf[ i ] = b.charCodeAt( i );
  }
  return buf;
}

var Editor = function() {
  this.mode = false;


  this.newProjectDialog = null;

  this.mobileInterfaceType = 'reduced';
  this.mobileLayout = Object.freeze({
    framesHeight: 50,
    menuBarHeight: 46,
    paletteHeight: 50,
    toolSettingsHeight: 40,
    toolsPanelWidth: 70
  });
  this.projectSplitPanel = null;
  this.mainSplitPanel = null;
  this.menuBar = null;
  this.zenMode = false;
  this.zenModeState = null;
  this.zenModeEdges = {};
  this.zenModeRevealTimers = {};
  this.zenModeMessageTimer = null;

  this.textModeEditor = null;
  this.music = null;
  this.assemblerEditor = null;
  this.colorPaletteEditor = null;
  this.tileSetEditor = null;
  this.scriptEditor = null;
  this.jsonEditor = null;
  this.textEditor = null;

  this.hexEditor = null;

  this.createTemplateLink = null;

  this.c64Debugger = null;
  this.dbgFont = null;

  this.features = {};
  this.featureRegistry = null;
  this.services = null;

  this.projectNavigator = null;
  this.projectNavigatorMobile = null;
  this.fileManager = null;

  this.doc = null;

  this.menuItems = {};
  this.confirmLeave = true;

  this.aboutDialog = null;
  this.buildInfo = Object.freeze({
    version: 'unknown',
    buildDate: 'unknown'
  });


  // allow code editor to turn off key shortcuts
  this.allowKeyShortcuts = true;

  this.deviceType = 'desktop';

  this.githubClient = null;
  this.gistClient = null;
  this.githubLogoutDialog = null;  

  this.gdrive = null;

  this.state = {
    user: {},
    isLoggedIn: false
  }
  this.repositories = [];

  this.openingProject = false;

  this.fontSize = 14;

  this.isElectron = false;

}

Editor.prototype = {


  // init is the first thing called after the page loads
  init: function(args) {
    this.setEnabled('textmode3d', true);

    if(typeof args != 'undefined') {
      if(typeof args.features != 'undefined') {
        this.featureRegistry = args.features;
      }
      if(typeof args.services != 'undefined') {
        this.services = args.services;
      }
      if(typeof args.buildInfo != 'undefined' && args.buildInfo != null) {
        this.buildInfo = args.buildInfo;
      }
      if(typeof args.type != 'undefined') {
        this.isElectron = args.type == 'electron';
      }
    }

    if(UI.isMobile.any()) {
      this.deviceType = 'mobile';
    } else {
      this.deviceType = 'desktop';
    }

    if(!this.services || !this.services.remoteProviderFacades) {
      throw new Error('Remote provider facades are not configured');
    }
    this.githubClient = this.services.remoteProviderFacades.githubClient;
    this.github = this.services.remoteProviderFacades.github;
    this.gist = this.services.remoteProviderFacades.gist;
    this.gdrive = this.services.remoteProviderFacades.googleDrive;

    this.loadGlobalPrefs();

    this.buildInterface();

    this.fileManager = new FileManager({ persistence: this.services.persistence });
    this.fileManager.init(this);

    this.textDialog = new TextDialog();

    this.startPage.processURL();
    
  },

  createDocument: function() {
    var doc = new Document({ documentSession: this.services.createDocumentSession() });
    doc.init(this);
    return doc;
  },


  getNewProjectDialog: function() {
    if(this.newProjectDialog == null) {
      this.newProjectDialog = new NewProjectDialog();
      this.newProjectDialog.init();
    }

    return this.newProjectDialog;
  },

  getGuid: function() {
//    var settings = this.doc.getDocRecord("/settings");

    guid = generateUUID();
    return guid;
    
  },

  isOnline: function() {
    return typeof navigator == 'undefined' || navigator.onLine !== false;

  },

  isRemoteProviderEnabled: function(providerId) {
    return Boolean(this.services && this.services.remoteProviders &&
      this.services.remoteProviders.isEnabled(providerId));

  },


  setPref: function(key, value) {
    
    if (typeof(Storage) !== "undefined") {    
      localStorage.setItem(key, value);
    }
  },

  getPref: function(key) {
    if (typeof(Storage) !== "undefined") {
      return localStorage.getItem(key);
    }
  },

  loadGlobalPrefs: function() {

    // font size
    this.fontSize = parseInt(g_app.getPref('codeeditor.fontsize'), 10);
    if(this.fontSize == null || isNaN(this.fontSize) || this.fontSize <= 0) {
      this.fontSize = 14;
    } else {
      this.fontSize = parseInt(this.fontSize)
    }

    this.setFontSize(this.fontSize);

  },

  setUser: function(user) {
    this.state.isLoggedIn = false;
    this.state.user = {};
    this.displayUserDetails();
  },


  openProject: function(args) {
    var projectId = args.projectId;
    var projectName = args.projectName;
    var path = args.currentPath;
    var projectNavVisible = args.projectNavVisible;
    var githubOwner = args.githubOwner;
    var githubRepository = args.githubRepository;

    // whether to check github for updates.
//    var githubCheck = args.githubCheck;
    this.openingProject = true;

    this.doc = this.createDocument();
    this.createDocumentStructure(this.doc);

    var _this = this;
    this.doc.openBrowserStorageProject(args, function(result) {
      if(result && result.success === false) {
        _this.openingProject = false;
        return;
      }

      _this.fileManager.filename = projectName;
      var settings = g_app.doc.getDocRecord('/settings');      
      settings.data.filename = projectName;

      _this.projectNavigator.refreshTree();

      // if path has been passed in args, check it's valid
      // if valid, then show it
      var pathSet = false;
      if(typeof path != 'undefined' && path !== false) {        
        // does the path exist?
        var record = _this.doc.getDocRecord(path);
        if(record) {
          if(_this.projectNavigator.showDocRecord(path) !== false) {
            pathSet = true;
          }
        }
      }

      // path hasn't been specified, so find a default path
      if(!pathSet) {
        // need a default document..
        // get the first screen
        var dir = _this.doc.dir('/screens');
        if(dir && dir.length > 0) {
          var firstScreen = dir[0].name;
          _this.setMode('2d');          
          _this.textModeEditor.loadScreen('/screens/' + firstScreen);
          pathSet = true;
        }
      }

      if(!pathSet) {
        // uh oh
        g_app.setMode('none');
      }


      if(typeof projectNavVisible != 'undefined' && projectNavVisible) {
        _this.projectNavigator.setVisible(projectNavVisible);
      }

      // set the repository details..
      _this.github.setRepositoryDetails(githubOwner, githubRepository);
      _this.openingProject = false;

    });
  },

  confirmLogout: function() {
    this.reportRemoteProviderError('github', new Error('GitHub is disabled.'));
  },

  displayUserDetails: function() {
    var ids = ['start-username', 'start-user-info', 'menuUserInfo', 'mobileMenuUserInfo'];
    for(var i = 0; i < ids.length; i++) {
      var target = document.getElementById(ids[i]);
      if(target) {
        target.replaceChildren();
      }
    }
  },

  removeRepository: function(owner, repository, callback) {
    this.reportRemoteProviderError('github', new Error('GitHub is disabled.'));
    if(typeof callback == 'function') {
      callback({ success: false });
    }
  },

  getRepositoryList: function() {
    this.repositories = [];
    if(this.startPage) {
      this.startPage.updateRepositories();
    }
  },

  setEnabled: function(feature, enabled) {
    this.features[feature] = enabled;
  },

  getEnabled: function(feature) {
    if(typeof this.features[feature] == 'undefined') {
      return true;
    }

    return this.features[feature];

  },

  getBuildInfo: function() {
    return this.buildInfo;
  },

  showAboutDialog: function() {
    if(this.aboutDialog == null) {
      var buildInfo = this.getBuildInfo();
      this.aboutDialog = UI.create("UI.Dialog", {
        "id": "aboutDialog",
        "title": "About lvllvl plus",
        "width": 400,
        "height": 340
      });

      var html = '';
      html += '<div style="padding: 22px; text-align: center">';
      html += '<img src="images/logo40.png" width="40" height="40" alt="">';
      html += '<div style="color: #eeeeee; font-size: 24px; margin-top: 5px">lvllvl <span style="color: #7fb8ed; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase">plus</span></div>';
      html += '<p style="color: #aaaaaa; line-height: 1.45; margin: 12px 0 18px">A browser-based editor for tile graphics, text-mode art, and retro-computer formats.</p>';
      html += '<div style="background: #191919; border: 1px solid #333333; border-radius: 4px; display: inline-block; line-height: 1.7; padding: 8px 18px">';
      html += '<div><span style="color: #888888">Version</span>&nbsp;&nbsp;<strong style="color: #dddddd">' + SafeHTML.escape(buildInfo.version) + '</strong></div>';
      html += '<div><span style="color: #888888">Build date</span>&nbsp;&nbsp;<strong style="color: #dddddd">' + SafeHTML.escape(buildInfo.buildDate) + ' UTC</strong></div>';
      html += '</div>';
      html += '<div style="margin-top: 18px"><a href="https://github.com/victorkashirin/lvllvl" target="_blank" rel="noopener noreferrer">View lvllvl plus on GitHub</a></div>';
      html += '</div>';

      this.aboutDialog.add(UI.create("UI.HTMLPanel", { "html": html }));
      var closeButton = UI.create('UI.Button', { "text": "Close", "color": "secondary" });
      this.aboutDialog.addButton(closeButton);
      closeButton.on('click', function() {
        UI.closeDialog();
      });
    }

    UI.showDialog("aboutDialog");
  },

  activateFeature: function(feature, context) {
    if(this.featureRegistry == null) {
      return Promise.reject(new Error('No feature registry is configured'));
    }
    return this.featureRegistry.activate(feature, context);
  },

  closeImageImport: function() {
    if(!this.services || !this.services.imageImportCoordinator) {
      return Promise.resolve(false);
    }
    return this.services.imageImportCoordinator.close();
  },

  openImageImport: function(args, source) {
    return this.services.imageImportCoordinator.open(args);
  },

  reportFeatureError: function(feature, error) {
    console.error('Could not load ' + feature, error);

    var message = document.getElementById('featureLoadError');
    if(message == null) {
      message = document.createElement('div');
      message.id = 'featureLoadError';
      message.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;' +
        'z-index:100000;padding:12px;background:#8b1e1e;color:#fff;border-radius:3px';
      document.body.appendChild(message);
    }
    message.textContent = 'Could not load ' + feature + '. Check your connection and try again.';
  },

  reportRemoteProviderError: function(providerId, error) {
    console.warn('Remote provider unavailable: ' + providerId, error);
    var message = document.getElementById('remoteProviderError');
    if(message == null) {
      message = document.createElement('div');
      message.id = 'remoteProviderError';
      message.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;' +
        'z-index:100000;padding:12px;background:#5f4b18;color:#fff;border-radius:3px';
      document.body.appendChild(message);
    }
    message.textContent = 'GitHub, Gist, and Google Drive are temporarily disabled while secure credential handling is prepared.';
  },

  clearFeatureError: function() {
    var message = document.getElementById('featureLoadError');
    if(message != null) {
      message.parentNode.removeChild(message);
    }
  },

  initModeEvents: function() {
    var _this = this;

    $(window).on('beforeunload', function(event){
      
      if(g_app.confirmLeave) {
        event.preventDefault();
        return "Are you sure you want to leave this page?"
      }
    });


    UI.on('update', function() {
      _this.update();
    });

    UI.on('keydown', function(event) {
      
      _this.keyDown(event);
    });

    UI.on('keyup', function(event) {
      _this.keyUp(event);
    });

    UI.on('keypress', function(event) {

      
      _this.keyPress(event);
    });


  },

  createZenModeInterface: function() {
    if(document.getElementById('zenModeEdges') !== null) {
      return;
    }

    var _this = this;
    var holder = document.createElement('div');
    holder.id = 'zenModeEdges';

    var addEdge = function(edge) {
      var element = document.createElement('div');
      element.id = 'zenModeEdge' + edge.charAt(0).toUpperCase() + edge.slice(1);
      element.className = 'zen-mode-edge zen-mode-edge-' + edge;
      element.setAttribute('data-zen-edge', edge);
      element.setAttribute('aria-hidden', 'true');
      holder.appendChild(element);
      _this.zenModeEdges[edge] = element;

      element.addEventListener('pointerenter', function() {
        _this.revealZenModeEdge(edge);
      });
      element.addEventListener('pointerleave', function() {
        _this.scheduleZenModeEdgeHide(edge);
      });
    };

    addEdge('top');
    addEdge('left');
    addEdge('right');
    addEdge('bottom');

    var status = document.createElement('div');
    status.id = 'zenModeStatus';
    status.className = 'zen-mode-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    holder.appendChild(status);
    document.body.appendChild(holder);

    var bindPanel = function(id, edge) {
      var element = document.getElementById(id);
      if(element === null) {
        return;
      }
      element.addEventListener('pointerenter', function() {
        _this.cancelZenModeEdgeHide(edge);
      });
      element.addEventListener('pointerleave', function() {
        _this.scheduleZenModeEdgeHide(edge);
      });
    };

    var bindSplitPanel = function(splitPanel, panel, edge) {
      if(splitPanel) {
        bindPanel(splitPanel.id + panel, edge);
      }
    };

    bindSplitPanel(this.projectPanel, 'north', 'top');
    bindSplitPanel(this.tabSplitPanel, 'north', 'top');
    bindSplitPanel(this.projectPanel, 'west', 'left');
    bindSplitPanel(this.mainSplitPanel, 'west', 'left');
    bindSplitPanel(this.textModeEditor.textModeEditorPanel, 'west', 'left');
    bindSplitPanel(this.textModeEditor.textModeEditorPanel, 'east', 'right');
    bindSplitPanel(UI('textEditorMobileSplitPanel'), 'north', 'top');
    bindSplitPanel(UI('textEditorContent'), 'south', 'bottom');
    bindSplitPanel(UI('gridSplitPanel'), 'south', 'bottom');
  },

  captureZenModePanel: function(splitPanel, panel, defaultSize) {
    if(!splitPanel || !splitPanel[panel]) {
      return null;
    }

    var size = splitPanel[panel + 'Size'];
    var savedSize = splitPanel[panel + 'SizeSave'];
    var barSize = splitPanel[panel + 'BarSize'];
    var savedBarSize = splitPanel[panel + 'BarSizeSave'];
    var visible = typeof size == 'number' && size > 0;
    var revealSize = visible ? size : savedSize;
    var revealBarSize = visible ? barSize : savedBarSize;

    if(typeof revealSize != 'number' || isNaN(revealSize) || revealSize <= 0) {
      revealSize = defaultSize;
    }
    if(typeof revealBarSize != 'number' || isNaN(revealBarSize)) {
      revealBarSize = 0;
    }

    return {
      splitPanel: splitPanel,
      panel: panel,
      element: document.getElementById(splitPanel.id + panel),
      overlayVisible: false,
      stacked: false,
      visible: visible,
      size: size,
      savedSize: savedSize,
      barSize: barSize,
      savedBarSize: savedBarSize,
      revealSize: revealSize,
      revealBarSize: revealBarSize,
      resizeHidden: panel == 'south' ? splitPanel.southResizeHidden : false
    };
  },

  setZenModePanelOverlayVisible: function(state, visible, edge, offset) {
    if(state === null || state.element === null) {
      return;
    }

    var element = state.element;
    if(!visible) {
      state.overlayVisible = false;
      element.classList.remove('zen-mode-panel-overlay');
      element.classList.remove('zen-mode-panel-overlay-' + edge);
      element.style.removeProperty('--zen-mode-panel-size');
      element.style.removeProperty('--zen-mode-panel-offset');
      element.style.display = 'none';
      return;
    }

    state.overlayVisible = true;
    element.style.setProperty('--zen-mode-panel-size', state.revealSize + 'px');
    element.style.setProperty('--zen-mode-panel-offset', (offset || 0) + 'px');
    element.classList.add('zen-mode-panel-overlay');
    element.classList.add('zen-mode-panel-overlay-' + edge);
    element.style.display = 'block';

    var panelComponent = state.splitPanel[state.panel];
    if(panelComponent && typeof panelComponent.resize == 'function') {
      panelComponent.resize();
    }
  },

  setZenModePanelStackOffset: function(state, edge, offset) {
    if(state === null || state.element === null || !state.visible) {
      return;
    }

    if(!offset) {
      state.stacked = false;
      state.element.classList.remove('zen-mode-panel-stacked');
      state.element.classList.remove('zen-mode-panel-stacked-' + edge);
      state.element.style.removeProperty('--zen-mode-stack-offset');
      return;
    }

    state.stacked = true;
    state.element.style.setProperty('--zen-mode-stack-offset', offset + 'px');
    state.element.classList.add('zen-mode-panel-stacked');
    state.element.classList.add('zen-mode-panel-stacked-' + edge);
  },

  syncZenModePanelBar: function(state, visible, barSize, resizeHidden) {
    var panel = state.panel;
    var bar = $('#' + state.splitPanel.id + panel + 'bar');
    if(panel == 'north' || panel == 'south') {
      bar.css('height', barSize + 'px');
    } else {
      bar.css('width', barSize + 'px');
    }

    if(visible && barSize > 0 && !resizeHidden) {
      bar.show();
    } else {
      bar.hide();
    }
  },

  setZenModePanelVisible: function(state, visible) {
    if(state === null) {
      return;
    }

    var splitPanel = state.splitPanel;
    var panel = state.panel;
    var sizeProperty = panel + 'Size';

    if(visible) {
      if(splitPanel[sizeProperty] == 0) {
        splitPanel[panel + 'SizeSave'] = state.revealSize;
        splitPanel[panel + 'BarSizeSave'] = state.revealBarSize;
        splitPanel.setPanelVisible(panel, true);
      }
      splitPanel[panel + 'BarSize'] = state.revealBarSize;
      splitPanel.resizeThePanel({ panel: panel, size: state.revealSize });
      this.syncZenModePanelBar(state, true, state.revealBarSize, state.resizeHidden);
      return;
    }

    if(splitPanel[sizeProperty] != 0) {
      splitPanel.setPanelVisible(panel, false);
    }
  },

  restoreZenModePanel: function(state) {
    if(state === null) {
      return;
    }

    var splitPanel = state.splitPanel;
    var panel = state.panel;
    var sizeProperty = panel + 'Size';

    if(splitPanel[sizeProperty] != 0) {
      splitPanel.setPanelVisible(panel, false);
    }

    if(state.visible) {
      splitPanel[panel + 'SizeSave'] = state.size;
      splitPanel[panel + 'BarSizeSave'] = state.barSize;
      splitPanel.setPanelVisible(panel, true);
      splitPanel[panel + 'BarSize'] = state.barSize;
      splitPanel.resizeThePanel({ panel: panel, size: state.size });
    }

    splitPanel[panel + 'SizeSave'] = state.savedSize;
    splitPanel[panel + 'BarSizeSave'] = state.savedBarSize;
    if(panel == 'south') {
      splitPanel.southResizeHidden = state.resizeHidden;
    }
    this.syncZenModePanelBar(state, state.visible, state.barSize, state.resizeHidden);
  },

  cancelZenModeEdgeHide: function(edge) {
    if(this.zenModeRevealTimers[edge]) {
      clearTimeout(this.zenModeRevealTimers[edge]);
      this.zenModeRevealTimers[edge] = null;
    }
  },

  scheduleZenModeEdgeHide: function(edge) {
    if(!this.zenMode) {
      return;
    }

    var _this = this;
    this.cancelZenModeEdgeHide(edge);
    this.zenModeRevealTimers[edge] = setTimeout(function() {
      _this.zenModeRevealTimers[edge] = null;
      if(_this.isZenModeEdgeHovered(edge)) {
        return;
      }
      if(edge == 'top' && _this.menuBar && _this.menuBar.menuShownId !== false) {
        _this.scheduleZenModeEdgeHide(edge);
        return;
      }
      _this.hideZenModeEdge(edge);
    }, 350);
  },

  getZenModeEdgePanels: function(edge) {
    if(this.zenModeState === null) {
      return [];
    }

    if(edge == 'top') {
      return [this.zenModeState.menu, this.zenModeState.tabs, this.zenModeState.topStrip];
    }
    if(edge == 'left') {
      return [this.zenModeState.tools, this.zenModeState.projectNavigator];
    }
    if(edge == 'right') {
      return [this.zenModeState.right];
    }
    if(edge == 'bottom') {
      return [this.zenModeState.bottom, this.zenModeState.gridInfo];
    }
    return [];
  },

  isZenModeEdgeHovered: function(edge) {
    if(this.zenModeEdges[edge] && this.zenModeEdges[edge].matches(':hover')) {
      return true;
    }

    var panels = this.getZenModeEdgePanels(edge);
    for(var i = 0; i < panels.length; i++) {
      if(
        panels[i] &&
        (panels[i].overlayVisible || panels[i].stacked) &&
        panels[i].element.matches(':hover')
      ) {
        return true;
      }
    }
    return false;
  },

  revealZenModeEdge: function(edge) {
    if(!this.zenMode || this.zenModeState === null) {
      return;
    }

    this.cancelZenModeEdgeHide(edge);
    if(this.zenModeEdges[edge]) {
      this.zenModeEdges[edge].classList.add('zen-mode-edge-active');
    }

    if(edge == 'top') {
      this.setZenModePanelOverlayVisible(this.zenModeState.menu, true, edge, 0);
      var topStackOffset = this.zenModeState.menu.revealSize;
      if(this.zenModeState.tabs.visible) {
        this.setZenModePanelOverlayVisible(
          this.zenModeState.tabs,
          true,
          edge,
          this.zenModeState.menu.revealSize
        );
        topStackOffset += this.zenModeState.tabs.revealSize;
      }
      this.setZenModePanelStackOffset(this.zenModeState.topStrip, edge, topStackOffset);
    } else if(edge == 'left') {
      if(this.mode == '2d' || this.mode == '3d') {
        this.setZenModePanelOverlayVisible(this.zenModeState.tools, true, edge);
      } else {
        this.setZenModePanelOverlayVisible(this.zenModeState.projectNavigator, true, edge);
      }
    } else if(edge == 'right') {
      this.setZenModePanelOverlayVisible(this.zenModeState.right, true, edge);
    } else if(edge == 'bottom') {
      this.setZenModePanelOverlayVisible(this.zenModeState.bottom, true, edge);
      this.setZenModePanelStackOffset(
        this.zenModeState.gridInfo,
        edge,
        this.zenModeState.bottom.revealSize
      );
    }
  },

  hideZenModeEdge: function(edge) {
    if(!this.zenMode || this.zenModeState === null) {
      return;
    }

    if(this.zenModeEdges[edge]) {
      this.zenModeEdges[edge].classList.remove('zen-mode-edge-active');
    }

    if(edge == 'top') {
      this.setZenModePanelStackOffset(this.zenModeState.topStrip, edge, 0);
      this.setZenModePanelOverlayVisible(this.zenModeState.tabs, false, edge);
      this.setZenModePanelOverlayVisible(this.zenModeState.menu, false, edge);
    } else if(edge == 'left') {
      this.setZenModePanelOverlayVisible(this.zenModeState.tools, false, edge);
      this.setZenModePanelOverlayVisible(this.zenModeState.projectNavigator, false, edge);
    } else if(edge == 'right') {
      this.setZenModePanelOverlayVisible(this.zenModeState.right, false, edge);
    } else if(edge == 'bottom') {
      this.setZenModePanelStackOffset(this.zenModeState.gridInfo, edge, 0);
      this.setZenModePanelOverlayVisible(this.zenModeState.bottom, false, edge);
    }
  },

  showZenModeStatus: function() {
    var status = document.getElementById('zenModeStatus');
    if(status === null) {
      return;
    }

    status.textContent = 'Zen Mode  ·  Alt+Shift+Z to exit';
    status.classList.add('zen-mode-status-visible');
    if(this.zenModeMessageTimer) {
      clearTimeout(this.zenModeMessageTimer);
    }
    this.zenModeMessageTimer = setTimeout(function() {
      status.classList.remove('zen-mode-status-visible');
    }, 1800);
  },

  setZenMode: function(enabled) {
    enabled = enabled === true;
    if(enabled == this.zenMode) {
      return true;
    }
    if(enabled && this.isMobile()) {
      return false;
    }

    if(enabled) {
      this.createZenModeInterface();
      this.zenModeState = {
        menu: this.captureZenModePanel(this.projectPanel, 'north', 30),
        tabs: this.captureZenModePanel(this.tabSplitPanel, 'north', 34),
        projectNavigator: this.captureZenModePanel(this.projectPanel, 'west', 180),
        scripting: this.captureZenModePanel(this.mainSplitPanel, 'west', 360),
        tools: this.captureZenModePanel(this.textModeEditor.textModeEditorPanel, 'west', this.textModeEditor.desktopToolsWidth),
        right: this.captureZenModePanel(this.textModeEditor.textModeEditorPanel, 'east', 340),
        topStrip: this.captureZenModePanel(UI('textEditorMobileSplitPanel'), 'north', 30),
        bottom: this.captureZenModePanel(UI('textEditorContent'), 'south', 220),
        gridInfo: this.captureZenModePanel(UI('gridSplitPanel'), 'south', 24)
      };

      this.menuBar.setHiddenShortcutsEnabled(true);
      this.zenMode = true;
      document.body.classList.add('zen-mode');
      this.setZenModePanelVisible(this.zenModeState.bottom, false);
      this.setZenModePanelVisible(this.zenModeState.right, false);
      this.setZenModePanelVisible(this.zenModeState.tools, false);
      this.setZenModePanelVisible(this.zenModeState.scripting, false);
      this.setZenModePanelVisible(this.zenModeState.projectNavigator, false);
      this.setZenModePanelVisible(this.zenModeState.tabs, false);
      this.setZenModePanelVisible(this.zenModeState.menu, false);
      if(UI.exists('view-zenmode')) {
        UI('view-zenmode').setChecked(true);
      }
      this.showZenModeStatus();
      return true;
    }

    this.zenMode = false;
    for(var edge in this.zenModeRevealTimers) {
      if(this.zenModeRevealTimers.hasOwnProperty(edge)) {
        this.cancelZenModeEdgeHide(edge);
      }
    }
    if(this.zenModeMessageTimer) {
      clearTimeout(this.zenModeMessageTimer);
      this.zenModeMessageTimer = null;
    }
    this.menuBar.hideMenu();
    document.body.classList.remove('zen-mode');
    var zenStatus = document.getElementById('zenModeStatus');
    if(zenStatus !== null) {
      zenStatus.classList.remove('zen-mode-status-visible');
    }
    for(var edgeName in this.zenModeEdges) {
      if(this.zenModeEdges.hasOwnProperty(edgeName)) {
        this.zenModeEdges[edgeName].classList.remove('zen-mode-edge-active');
      }
    }

    this.setZenModePanelOverlayVisible(this.zenModeState.menu, false, 'top');
    this.setZenModePanelOverlayVisible(this.zenModeState.tabs, false, 'top');
    this.setZenModePanelOverlayVisible(this.zenModeState.projectNavigator, false, 'left');
    this.setZenModePanelOverlayVisible(this.zenModeState.scripting, false, 'left');
    this.setZenModePanelOverlayVisible(this.zenModeState.tools, false, 'left');
    this.setZenModePanelOverlayVisible(this.zenModeState.right, false, 'right');
    this.setZenModePanelOverlayVisible(this.zenModeState.bottom, false, 'bottom');
    this.setZenModePanelStackOffset(this.zenModeState.topStrip, 'top', 0);
    this.setZenModePanelStackOffset(this.zenModeState.gridInfo, 'bottom', 0);

    this.restoreZenModePanel(this.zenModeState.menu);
    this.restoreZenModePanel(this.zenModeState.tabs);
    this.restoreZenModePanel(this.zenModeState.projectNavigator);
    this.restoreZenModePanel(this.zenModeState.scripting);
    this.restoreZenModePanel(this.zenModeState.tools);
    this.restoreZenModePanel(this.zenModeState.right);
    this.restoreZenModePanel(this.zenModeState.bottom);
    this.menuBar.setHiddenShortcutsEnabled(false);
    this.zenModeState = null;
    if(UI.exists('view-zenmode')) {
      UI('view-zenmode').setChecked(false);
    }
    if(this.textModeEditor) {
      this.textModeEditor.syncInterfaceMenuChecks();
    }
    return true;
  },

  toggleZenMode: function() {
    return this.setZenMode(!this.zenMode);
  },

  // really setting whether the editors get keyboard events..
  setAllowKeyShortcuts: function(allow) {
    this.allowKeyShortcuts = allow;

    switch(this.mode) { 
      case 'assembler':
        this.assemblerEditor.willReceiveKeyboardEvents(allow);
        break;
      case 'c64':
        this.c64Debugger.blurMachine();
        break;
    }
  },

  keyDown: function(event) {


    if(event.keyCode == 89 && (event.metaKey || event.ctrlKey))  {
      // ctrl-y
      this.redo();
    }

    if(!this.allowKeyShortcuts) {
      return;
    }

    switch(this.mode) {
      case '3d':
      case '2d':
        this.textModeEditor.keyDown(event);
      break;
      case 'music':
        this.music.keyDown(event);
      break;
      case 'c64':
        this.c64Debugger.keyDown(event);
      break;
      case 'color palette':
        this.colorPaletteEditor.colorPaletteEdit.keyDown(event);
      break;
      case 'assembler':
        this.assemblerEditor.keyDown(event);
      break;      
    }
  },

  keyUp: function(event) {


    if(!this.allowKeyShortcuts) {
      return;
    }

    switch(this.mode) {
      case '3d':
      case '2d':
        this.textModeEditor.keyUp(event);
      break;
      case 'music':
        this.music.keyUp(event);
      break;
      case 'c64':
        this.c64Debugger.keyUp(event);
      break;
      case 'color palette':
        this.colorPaletteEditor.colorPaletteEdit.keyUp(event);
      break;
      case 'assembler':
        this.assemblerEditor.keyUp(event);
      break;

    }
  },

  keyPress: function(event) {

    
    if(!this.allowKeyShortcuts) {
      return;
    }


    switch(this.mode) {
      case '3d':
      case '2d':
        this.textModeEditor.keyPress(event);
      break;
      case 'music':
        this.music.keyPress(event);
      break;
      case 'color palette':
        this.colorPaletteEditor.colorPaletteEdit.keyPress(event);
      break;      
    }
  },

  setDeviceType: function(deviceType) {
    var isMobile = deviceType == 'mobile';

    if(deviceType != 'desktop' && !isMobile) {
      return;
    }

    if(isMobile && this.zenMode) {
      this.setZenMode(false);
    }

    this.deviceType = deviceType;
    UI.setMobileMode(isMobile);

    if(deviceType == 'desktop') {
      UI('menubar').setVisible(true);
      UI('mobileMenuBar').setVisible(false);
      UI('projectSplitPanel').resizeThePanel({panel: 'north', size: 30});
      UI('tabSplitPanel').setPanelVisible('north', true);
    }

    if(isMobile) {
      UI('menubar').setVisible(false);
      UI('mobileMenuBar').setVisible(true);

      UI('projectSplitPanel').resizeThePanel({
        panel: 'north',
        size: this.mobileLayout.menuBarHeight
      });

      UI('tabSplitPanel').setPanelVisible('north', false);

    }


    if(this.textModeEditor) {
      this.textModeEditor.setDeviceType(deviceType);
    }
  },

  isDesktopApp: function() {
    
    return this.isElectron;
  },

  isMobile: function() {
    return this.deviceType == 'mobile';
  },

  getMode: function() {
    return this.mode;    
  },


  setMode: function(mode) {
    if(this.zenMode && mode != this.mode) {
      this.setZenMode(false);
    }
    if(this.services && this.services.imageImportCoordinator &&
        this.services.imageImportCoordinator.isActive()) {
      void this.closeImageImport();
    }
    this.mode = mode;

    if(g_app.isMobile()) {
      $('#mobileMenuUndoRedo').show();
    }

//    console.error("SET MODE!!!!: " + mode);

    switch(mode) {
      
      case 'start':
        if(this.projectPanel) { 
          this.projectPanel.setPanelVisible('north', false);
        }
        this.startPage.show();
        UI.setWebGLEnabled(false);
        this.mainPanel.showOnly('startPage');

        break;


      case '3d':
        this.projectPanel.setPanelVisible('north', true);
        UI.setWebGLEnabled(true);
        this.contentPanel.showOnly('textModeEditor');
        this.textModeEditor.setType('3d');
        this.mainPanel.showOnly('projectSplitPanel');

        this.menuBar.showOnly('ui-menu-tilemode');

        $('.ui-menu-screen').show();
        $('.ui-menu-sprite').hide();          
        this.textModeEditor.currentTile.setSouthPanelSize();

        this.menuBar.showOnly('ui-menu-3d');


        UI('gridPanel').showOnly('grid3d');
        this.textModeEditor.gridView3d.uiComponent.resize();
        this.textModeEditor.setEditorMode('tile');        


        if(g_app.isMobile()) {
          $('.drawToolMobileSide2d').hide();
          $('.drawToolMobileSide3d').show();

          $('#toolIconHolderMobile').css('bottom', '94px');
          $('#toolIconsScrollBottom').css('bottom', '94px');
          $('#drawToolMobileColors').css('height', '80px');
        }
        break;
      case '2d':
        if(this.projectPanel) { 
          this.projectPanel.setPanelVisible('north', true);
        }

        if(g_app.isMobile()) {
          $('#mobileMenuCurrentTools').show();
        }
        
        UI.setWebGLEnabled(false);
        this.mainPanel.showOnly('projectSplitPanel');
        this.contentPanel.showOnly('textModeEditor');
        this.textModeEditor.setType('2d');
        UI('gridPanel').showOnly('grid2d');
        UI('gridView2d').resize(); 

        this.menuBar.showOnly('ui-menu-tilemode');

        if(this.textModeEditor.graphic && this.textModeEditor.graphic.getType() == 'sprite') {
          $('.ui-menu-screen').hide();
          $('.ui-menu-sprite').show();
        } else {
          $('.ui-menu-screen').show();
          $('.ui-menu-sprite').hide();          
        }
        this.textModeEditor.tools.drawTools.tilePalette.drawTilePalette();
        this.textModeEditor.frames.updateFrameInfo();

        if(g_app.isMobile()) {
          this.textModeEditor.tools.drawTools.checkMobileToolScroll();
        }

        if(g_app.isMobile()) {
          $('.drawToolMobileSide2d').show();
          $('.drawToolMobileSide3d').hide();
          $('#toolIconHolderMobile').css('bottom', '194px');
          $('#toolIconsScrollBottom').css('bottom', '194px');
          $('#drawToolMobileColors').css('height', '180px');

        } else {
          this.textModeEditor.updateEastInfoPanel();          
        }


        break;
      case 'color palette':
        if(this.projectPanel) {
          this.projectPanel.setPanelVisible('north', true);
        }
        UI.setWebGLEnabled(false);
        this.mainPanel.showOnly('projectSplitPanel');
        this.contentPanel.showOnly('colorPaletteEditor');
        this.menuBar.showOnly('ui-menu-colorpalette');

//        UI('gridView2d').resize(); 
      break;

      case 'tile set':
        if(this.projectPanel) {
          this.projectPanel.setPanelVisible('north', true);
        }
        UI.setWebGLEnabled(false);
        this.mainPanel.showOnly('projectSplitPanel');
        this.contentPanel.showOnly('tileSetEditor');
        this.menuBar.showOnly('ui-menu-tileset');

      break;
    
      case 'script':
        if(this.projectPanel) {
          this.projectPanel.setPanelVisible('north', true);
        }
        UI.setWebGLEnabled(false);
        this.mainPanel.showOnly('projectSplitPanel');
        this.scriptEditor.show();
        this.contentPanel.showOnly('scriptEditor');
        this.menuBar.showOnly('ui-menu-script');
      break;

      case 'json':
          if(this.projectPanel) {
            this.projectPanel.setPanelVisible('north', true);
          }
          UI.setWebGLEnabled(false);
          
          this.jsonEditor.show();
          this.mainPanel.showOnly('projectSplitPanel');
          this.contentPanel.showOnly('jsonEditor');
          this.menuBar.showOnly('ui-menu-script');
          break;
      case 'text':
        if(this.projectPanel) {
          this.projectPanel.setPanelVisible('north', true);
        }
        UI.setWebGLEnabled(false);
        this.textEditor.show();
        this.mainPanel.showOnly('projectSplitPanel');
        this.contentPanel.showOnly('textEditor');
        this.menuBar.showOnly('ui-menu-script');
        break;
      case 'hex':
        if(this.projectPanel) {
          this.projectPanel.setPanelVisible('north', true);
        }
        UI.setWebGLEnabled(false);
        this.mainPanel.showOnly('projectSplitPanel');
        this.contentPanel.showOnly('hexEditor');
        this.menuBar.showOnly('ui-menu-script');
      break;

      case 'music':

        if(this.projectPanel) { 
          this.projectPanel.setPanelVisible('north', true);
        }
        UI.setWebGLEnabled(false);
//        this.music.show('/music/Untitled Music');


        this.mainPanel.showOnly('projectSplitPanel');
        this.contentPanel.showOnly('musicEditor');
        this.menuBar.showOnly('ui-menu-music');

        UI('musicEditor').resize();

        break;
      case 'assembler':

        if(g_app.isMobile()) {
          $('#mobileMenuCurrentTools').hide();
        }
//        this.mainPanel.showOnly('mainSplitPanel');
        if(this.projectPanel) { 
          this.projectPanel.setPanelVisible('north', true);
        }
        UI.setWebGLEnabled(false);

        this.mainPanel.showOnly('projectSplitPanel');
        this.mainSplitPanel.setPanelVisible('north', true);

        this.menuBar.showOnly('ui-menu-c64-assembler');

        this.showAssembler();
        break;
      case 'c64':
        if(this.projectPanel) { 
          this.projectPanel.setPanelVisible('north', true);
        }

        if(g_app.isMobile()) {
          $('#mobileMenuUndoRedo').hide();
        }
  
        UI.setWebGLEnabled(false);
        this.mainPanel.showOnly('projectSplitPanel');
        this.contentPanel.showOnly('c64debuggerPanel');
        this.menuBar.showOnly('ui-menu-c64');

        this.c64Debugger.show();
        break;

      default:
          if(this.projectPanel) { 
            this.projectPanel.setPanelVisible('north', true);
          }
          if(g_app.isMobile()) {
            $('#mobileMenuUndoRedo').hide();
          }
    
          UI.setWebGLEnabled(false);
          this.mainPanel.showOnly('projectSplitPanel');
          this.contentPanel.showOnly('noEditorPanel');
          break;

    }

    if(this.menuBar) {
      if(mode == 'assembler') {
          // TODO: prob should be in on focus of text editor
          this.menuBar.setShortcutEnabled({ "cmd": true, "key": "Z" } , false);
          this.menuBar.setShortcutEnabled({ "cmd": true, "shift": true,  "key": "Z" } , false);
          this.menuBar.setShortcutEnabled({ "cmd": true, "key": "X" } , false);
          this.menuBar.setShortcutEnabled({ "cmd": true, "key": "C" } , false);
          this.menuBar.setShortcutEnabled({ "cmd": true, "key": "V" } , false);      
      } else {
          // TODO: prob should be in on focus of text editor
          this.menuBar.setShortcutEnabled({ "cmd": true, "key": "Z" } , true);
          this.menuBar.setShortcutEnabled({ "cmd": true, "shift": true,  "key": "Z" } , true);
          this.menuBar.setShortcutEnabled({ "cmd": true, "key": "X" } , true);
          this.menuBar.setShortcutEnabled({ "cmd": true, "key": "C" } , true);
          this.menuBar.setShortcutEnabled({ "cmd": true, "key": "V" } , true);

      }
    }
  },

  debugMessage: function(message) {

  },

/*

main panel contains split panel
main split panel north is menu
*/

  mobileMenuBarLoaded: function() {

    var _this = this;
    $('#mobileMenuBarHamburger').on('click', function(event) {
      event.preventDefault();
      _this.textModeEditor.showMobileMenu();
    });

    $('#mobileMenuBarUndo').on('click', function(event) {
      event.preventDefault();
      _this.undo();
    });

    $('#mobileMenuBarRedo').on('click', function(event) {
      event.preventDefault();
      _this.redo();
    });

  },


  getMobileInterfaceType: function() {
    return this.mobileInterfaceType;
  },

  mobileReduceInterface: function() {
    // hamburger and undo/redo
//    this.projectPanel.setPanelVisible('north', false);

    this.mobileInterfaceType = 'reduced';

    this.textModeEditor.mobileReduceInterface();


    /*
    var restoreElement = document.getElementById('mobileRestoreButton');
    if(!restoreElement) {
      var restoreElement = document.createElement('div');
      restoreElement.setAttribute('id', 'mobileRestoreButton');
      restoreElement.setAttribute('style', 'position: absolute; top: 8px; left: 8px; width: 20px; height: 20px; z-index: 1000');
      document.body.appendChild(restoreElement);
      SafeHTML.setHTML(restoreElement, '<i class="halflings halflings-chevron-left"></i>');
      restoreElement.addEventListener('click', function() {
        g_app.mobileRestoreInterface();
      }); 
    } else {
      restoreElement.setAttribute('style', 'display: block');
    }
    */

  },

  mobileRestoreInterface: function() {
    // hamburger and undo/redo
//    this.projectPanel.setPanelVisible('north', true);
    
    this.mobileInterfaceType = 'full';

    /*
    var restoreElement = document.getElementById('mobileRestoreButton');
    if(restoreElement) {
      restoreElement.setAttribute('style', 'display: none');
    }
    */

    this.textModeEditor.mobileRestoreInterface();

  },

  buildInterface: function() {
    var isMobile = this.isMobile();
    this.mainPanel = UI.create("UI.Panel", { "id": "mainPanel" });
    UI.add(this.mainPanel);

    this.projectPanel = UI.create("UI.SplitPanel", { "id": "projectSplitPanel" });
    this.mainPanel.add(this.projectPanel);

    this.mainSplitPanel = UI.create("UI.SplitPanel", { "id": "mainSplitPanel" });
    this.projectPanel.add(this.mainSplitPanel);

    var _this = this;
    UI.on('ready', function() {


      var menuBarHidden = false;
      var menuBarHeight = 30;
      if(isMobile) {
        menuBarHidden = true;
        menuBarHeight = _this.mobileLayout.menuBarHeight;
      }


      _this.menuBar = UI.create("UI.MenuBar", { "id": "menubar", "visible": !menuBarHidden });

      _this.menuBarHolder = UI.create("UI.Panel", { "id": "menuBarHolder" });

      _this.menuSplit = UI.create("UI.SplitPanel", { "id": "menuSplit", "visible": !menuBarHidden })

      var html = '<div id="menuUserInfo" style="text-align: right"></div>';
      _this.userInfoPanel = UI.create("UI.HTMLPanel", { "html": html});
      _this.menuSplit.addEast(_this.userInfoPanel, 280, false);


      
      _this.menuSplit.add(_this.menuBar);


      //_this.menuBarHolder.add(_this.menuBar);
      _this.projectPanel.addNorth(_this.menuBarHolder, menuBarHeight, false);

//      _this.menuBarHolder.add(_this.menuBar);
      _this.menuBarHolder.add(_this.menuSplit);

      _this.mobileMenuBar = UI.create("UI.HTMLPanel", { "id": "mobileMenuBar", "visible": menuBarHidden});
      _this.menuBarHolder.add(_this.mobileMenuBar);

      _this.mobileMenuBar.load('html/textMode/mobileMenuBar.html', function() {
        _this.mobileMenuBarLoaded();
      });

      
      _this.initModeEvents();

      var menu = null;
      menu = _this.menuBar.addMenu({"label": "Project", "className": 'ui-menu-music ui-menu-tilemode ui-menu-3d ui-menu-colorpalette ui-menu-tileset ui-menu-script ui-menu-c64-assembler' });
      menu.addItem({ "label": "New Project...", "id": "file-new" });//, "shortcut": { "key": 'N', "cmd": true } });
//      menu.addItem({ "label": "Open Project...", "id": "file-open" });
//      menu.addItem({ "label": "Home", "id": "home-page" });
//      menu.addSeparator({  });

      if(SHOWUNFINISHED && g_paramEditor != 'assembler') {
        menu.addItem({ "label": "Project Explorer" + "...", "id": "show-project-explorer", "shortcut": { "cmd": true, "key": "P" } });
        menu.addSeparator({  });
      }

      menu.addItem({ "label": "Save", "id": "file-save", "shortcut": { "key": 'S', "cmd": true } });
      menu.addItem({ "label": "Save As...", "id": "file-saveas", "shortcut": { "key": 'S',  "cmd": true, "shift": true } });

      menu.addItem({ "label": "Download Project...", "id": "file-download", "shortcut": { "key": 'D',  "shift": true, "cmd": true, "shift": true } });
      //menu.addItem({ "label": "C64", "id": "edit-c64", "shortcut": { "cmd": true, "key": "L"} });

      menu.addSeparator({  });
      menu.addItem({ "label": "Create A Template Link...", "id": "file-templateLink" });

//      menu.addSeparator({  });
//      menu.addItem({ "label": "Go To Home Screen", "id": "project-home" });

  //    menu.addItem({ "label": "Save As Template...", "id": "file-saveastemplate" });

      menu = _this.menuBar.addMenu({"label": "Edit", "className": 'ui-menu-tilemode ui-menu-3d' });
 
      menu.addItem({ "label": "Undo", "id": "edit-undo", "shortcut": { "cmd": true, "key": "Z" } });
      menu.addItem({ "label": "Redo", "id": "edit-redo", "shortcut": { "cmd": true, "shift": true, "key": "Z" } });
      menu.addSeparator({  });
      menu.addItem({ "label": "Cut", "id": "edit-cut", "shortcut": { "cmd": true, "key": "X" } });
      menu.addItem({ "label": "Copy", "id": "edit-copy", "shortcut": { "cmd": true, "key": "C" } });
      menu.addItem({ "label": "Copy as Image To Clipboard", "id": "edit-copyimage", "shortcut": { "cmd": true, "key": "I" } });
      menu.addItem({ "label": "Paste", "id": "edit-paste", "shortcut": { "cmd": true, "key": "V" } });
      menu.addItem({ "label": "Clear All", "id": "edit-clearall", "shortcut": { "key": "Del" } });
      menu.addItem({ "label": "Clear...", "id": "edit-clear" });
      menu.addItem({ "label": "Select All", "id": "edit-selectall", "shortcut": { "cmd": true, "key": "A" } });
      menu.addItem({ "label": "Deselect", "id": "edit-deselect", "shortcut": { "cmd": true, "key": "D" } });
      menu.addSeparator({  });
      menu.addItem({ "label": "Flip H", "id": "edit-fliph" });//, "shortcut": { "key": "F" } });
      menu.addItem({ "label": "Flip V", "id": "edit-flipv" });//, "shortcut": { "key": "G" } });

      menu.addItem({ "label": "Replace Colour" + "...", "id": "edit-replaceColor"});
      menu.addItem({ "label": "Replace Tile" + "...", "id": "edit-replaceCharacter"});
      menu.addItem({ "label": "Clear Hidden Tiles" + "...", "id": "edit-clearHiddenTiles"});


      menu = _this.menuBar.addMenu({"label": "Edit", "className": 'ui-menu-colorpalette' });
      menu.addItem({ "label": "Undo", "id": "colorpaletteedit-undo", "shortcut": { "cmd": true, "key": "Z" } });
      menu.addItem({ "label": "Redo", "id": "colorpaletteedit-redo", "shortcut": { "cmd": true, "shift": true, "key": "Z" } });

      /*
      menu.addSeparator({  });
      menu.addItem({ "label": "Toggle Editor Mode", "id": "edit-toggleMode"});
      */

      menu = _this.menuBar.addMenu({"label": "Export", "className": 'ui-menu-tilemode' });
      menu.addSeparator({ "label": "Visual Formats" });
      menu.addItem({ "label": "GIF / PNG...", "id": "export-image" });

      menu.addItem({ "label": "Sprite Sheet (PNG)...", "id": "export-png" });



      menu.addItem({ "label": "SVG...", "id": "export-svg" });

      menu.addSeparator({ "label": "C64 Formats" });
      menu.addItem({ "label": "C64 PRG / D64...", "id": "export-prg" });
      
      menu.addItem({ "label": "C64 Assembly Source" + "...", "id": "export-c64assembly" });
      menu.addItem({ "label": "Mega65 Assembly Source" + "...", "id": "export-mega65assembly" });
      menu.addItem({ "label": "X16 Assembly Source" + "...", "id": "export-x16assembly" });
      //menu.addItem({ "label": "C64 PRG Advanced...", "id": "export-prgadvanced" });
      menu.addItem({ "label": "SEQ...", "id": "export-seq" });
      menu.addItem({ "label": "PETSCII C...", "id": "export-petsciic" });
      menu.addItem({ "label": ".PET...", "id": "export-pet" });
      menu.addItem({ "label": "CharPad V5...", "id": "export-charpad" });

      menu.addItem({ "label": "SpritePad...", "id": "export-spritepad" });

      if(SHOWUNFINISHED) {
        menu.addSeparator({ "label": "X16 Formats" });
        menu.addItem({ "label": "X16 Basic" + "...", "id": "export-x16basic" });
      }

      menu.addSeparator({ "label": "Dev Formats" });
      menu.addItem({ "label": "JSON...", "id": "export-json" });
      menu.addItem({ "label": "Binary Data" + "...", "id": "export-binary" });
      menu.addItem({ "label": "TXT...", "id": "export-txt" });

      menu = _this.menuBar.addMenu({"label": "Export", "className": 'ui-menu-3d' });
      menu.addSeparator({ "label": "Visual Formats" });
      menu.addItem({ "label": "PNG...", "id": "export-3d-png" });
      menu.addItem({ "label": "GIF" + "...", "id": "export-3d-gif" });
      menu.addItem({ "label": "OBJ" + "...", "id": "export-obj" });
      menu.addItem({ "label": "MagicaVoxel" + "...", "id": "export-magicavoxel" });


      menu = _this.menuBar.addMenu({"label": "Edit", "className": 'ui-menu-music' });
      menu.addItem({ "label": "Undo", "id": "edit-musicundo", "shortcut": { "cmd": true, "key": "Z" } });
      menu.addItem({ "label": "Redo", "id": "edit-musicredo", "shortcut": { "cmd": true, "shift": true, "key": "Z" } });
      menu.addSeparator({  });
      menu.addItem({ "label": "Cut", "id": "edit-musiccut", "shortcut": { "cmd": true, "key": "X" } });
      menu.addItem({ "label": "Copy", "id": "edit-musiccopy", "shortcut": { "cmd": true, "key": "C" } });
      menu.addItem({ "label": "Paste", "id": "edit-musicpaste", "shortcut": { "cmd": true, "key": "V" } });
//      menu.addItem({ "label": "Clear All", "id": "edit-clearall", "shortcut": { "key": "Del" } });
//      menu.addItem({ "label": "Clear...", "id": "edit-clear" });
      menu.addItem({ "label": "Select All", "id": "edit-musicselectall", "shortcut": { "cmd": true, "key": "A" } });
      menu.addItem({ "label": "Deselect", "id": "edit-musicdeselect", "shortcut": { "cmd": true, "key": "D" } });



      menu = _this.menuBar.addMenu({"label": "Export", "className": 'ui-menu-music' });
      menu.addItem({ "label": "SID...", "id": "export-sid" });
      //menu.addItem({ "label": "SID...", "id": "export-sid" });
      menu.addItem({ "label": "PRG / BIN...", "id": "export-sidprg" });
      menu.addItem({ "label": "GoatTracker 2...", "id": "export-goattracker" });

//      menu.addItem({ "label": "WAV...", "id": "export-wav" });



/*
      menu.addSeparator({ "label": "3d Formats" });
      menu.addItem({ "label": "Export .obj...", "id": "export-obj" });
      menu.addItem({ "label": "Export MagicaVoxel (.vox)...", "id": "export-vox" });
      menu.addItem({ "label": "Export Qubicle Binary (.qb)...", "id": "export-qb" });

      menu.addSeparator({ "label": "Music Formats" });
      menu.addItem({ "label": "SID...", "id": "export-sid" });
      menu.addItem({ "label": "GoatTracker 2...", "id": "export-gt" });
      menu.addItem({ "label": "WAV...", "id": "export-wav" });
*/


      menu = _this.menuBar.addMenu({"label": "Import", "className": 'ui-menu-tilemode' });
      menu.addSeparator({ "label": "2d Formats" });
      menu.addItem({
        "label": "Image / Video" + "...",
        "id": "import-image",
        "shortcut": { "alt": true, "shift": true, "key": "I" }
      });
//      menu.addItem({ "label": "Video...", "id": "import-video" });

//      menu.addItem({ "label": "ANSI File...", "id": "import-ansi" });

//      menu.addItem({ "label": "PRG...", "id": "import-prg" });
//      menu.addItem({ "label": "VICE Snapshot...", "id": "import-vice" });
      menu.addItem({ "label": "C64 Formats" + "...", "id": "import-c64formats" });
      menu.addItem({ "label": "C64 Formats" + "...", "id": "import-c64spriteformats" });
      menu.addItem({ "label": "Image" + "...", "id": "import-spriteimage" });

      menu = _this.menuBar.addMenu({"label": "Screen", "className": 'ui-menu-tilemode ui-menu-screen' });
      menu.addItem({ "label": "Dimensions" + "...", "id": "file-dimensions" });
      menu.addItem({ "label": "Crop To Selection", "id": "screen-crop"});
//      menu.addItem({ "label": "3D Mode", "id": "3d-mode" });


      menu.addSeparator({ "label": "Mode" });
      menu.addItem({"label": "Text Mode", "id": "mode-textmode", "checked": true });
      menu.addItem({"label": "C64 Standard Character Mode", "id": "mode-c64standard"});
      menu.addItem({"label": "C64 Multicolour Character Mode", "id": "mode-c64multicolor"});
      menu.addItem({"label": "C64 Extended BG Colour Mode", "id": "mode-c64ecm"});
      menu.addItem({"label": "Vector Mode", "id": "mode-vector"});
//      menu.addItem({"label": "NES", "id": "mode-nes"});
      menu.addItem({"label": "Indexed Colour", "id": "mode-indexed"});
      menu.addItem({"label": "RGB Colour", "id": "mode-rgb"});


      if(SHOWUNFINISHED) {
        menu.addItem({"label": "NES", "id": "mode-nes"});
      }

      /*
      menu.addItem({"label": "NES", "id": "mode-nes"});
      menu.addItem({"label": "Indexed Colour", "id": "mode-indexed"});
      menu.addItem({"label": "NES", "id": "mode-rgb"});
      */
      menu.addSeparator({ "label": "Tile Orientation" });
      menu.addItem({"label": "Allow Tile Flip", "id": "mode-tileflip"});
      menu.addItem({"label": "Allow Tile Rotate", "id": "mode-tilerotate"});
      menu.addItem({"label": "Has Tile Materials", "id": "mode-tilematerials"});


      menu.addSeparator({ "label": styles.text.blockName + " Mode" });
      menu.addItem({"label": styles.text.blockName + " Mode", "id": "mode-blockmode"});
      menu.addItem({"label": styles.text.blockName + " Size" + "...", "id": "mode-blocksize"});
      UI('mode-blocksize').setEnabled(false);


      menu.addSeparator({ "label": "Colour Mode" });
      menu.addItem({"label": "Colour Per Cell", "id": "colorpermode-cell", "checked": true });
      menu.addItem({"label": "Colour Per Tile", "id": "colorpermode-character"});
      menu.addItem({"label": "Colour Per " + styles.text.blockName, "id": "colorpermode-block"});
      UI('colorpermode-block').setEnabled(false);

      menu.addSeparator({ "label": "Reference Image" });
      menu.addItem({ "label": "Set Reference Image" + "...", "id": "screen-referenceimage", "shortcut": { "cmd": true, "key": "I"} });

      menu = _this.menuBar.addMenu({"label": "Sprite", "className": 'ui-menu-tilemode ui-menu-sprite' });
      menu.addItem({ "label": "Dimensions" + "...", "id": "file-spritedimensions" });
      
      
      menu.addSeparator({ "label": "Mode" });
      menu.addItem({"label": "Monochrome", "id": "mode-spritetextmode", "checked": true });
      menu.addItem({"label": "C64 Multicolour", "id": "mode-spritec64multicolor"});
      menu.addItem({"label": "NES", "id": "mode-spritenes"});
      menu.addItem({"label": "Indexed", "id": "mode-spriteindexed"});


      menu.addSeparator({ "label": "Help" });
      menu.addItem({"label": "Help" + "!", "id": "mode-help"});

      menu = _this.menuBar.addMenu({"label": "Scene", "className": 'ui-menu-3d' });
      menu.addItem({"label": "Dimensions...", "id": "dimensions3d", "checked": true });


      menu = _this.menuBar.addMenu({"label": "Layers", "className": 'ui-menu-tilemode' });
      menu.addItem({"label": "New Layer" + "...", "id": "layers-new", "shortcut": { "cmd": true, "key": "L"}  });   // { "cmd": true, "shift": true, "key": "N" }
      menu.addSeparator({ });
      menu.addItem({"label": "Layer Properties" + "...", "id": "layers-properties"});
      menu.addItem({"label": "Delete Layer", "id": "layers-delete"});
      menu.addItem({"label": "Bring Forward", "id": "layers-moveUp", "shortcut": {"cmd": true, "key": "]"} });
      menu.addItem({"label": "Send Backward", "id": "layers-moveDown", "shortcut": {"cmd": true, "key": "["} });
      menu.addItem({"label": "Toggle Layer Visibility", "id": "layers-toggle", "shortcut": { "cmd": true, "key": "\\" }});
      menu.addItem({"label": "Select Above", "id": "layers-selectAbove", "shortcut": {"alt": true, "key": "]"} });
      menu.addItem({"label": "Select Below", "id": "layers-selectBelow", "shortcut": {"alt": true, "key": "["} });
/*
      menu.addSeparator({ });
      menu.addItem({"label": "Merge...", "id": "layers-merge"});
      menu.addItem({"label": "To Frames...", "id": "layers-toframes"});
//      menu.addItem({"label": "From Frames...", "id": "layers-fromframes"});
*/

      _this.tileSetMenu = _this.menuBar.addMenu({"label": "Tiles", "className": 'ui-menu-tilemode ui-menu-screen ui-menu-3d' });
      _this.tileSetMenu.addItem({ "label": "Show Tile Editor", "id": "charactersets-edit", "shortcut": { "cmd": true, "key": "E" } });
      _this.tileSetMenu.addSeparator({ "label": "Current Tile Set" });
      _this.tileSetMenu.addItem({ "label": "Choose A Tile Set" + "...", "id": "charactersets-preset" });
      _this.tileSetMenu.addItem({ "label": "Load / Import Tile Set" + "...", "id": "charactersets-load" });
//      _this.tileSetMenu.addItem({ "label": "Load / Import Tile Set" + "...", "id": "charactersets-load" });
      _this.tileSetMenu.addItem({ "label": "Save Tile Set" + "...", "id": "charactersets-save" });
      _this.tileSetMenu.addSeparator({ "label": "Project Tile Sets" });
      _this.tileSetMenu.addItem({ "label": "Create a Tile Set...", "id": "tileset-new" });


      //tileset
      menu = _this.menuBar.addMenu({"label": "Tiles", "className": 'ui-menu-tileset' });
      menu.addItem({ "label": "Choose A Character Set" + "...", "id": "tileset-preset" });
      menu.addItem({ "label": "Load / Import Tile Set" + "...", "id": "tileset-load" });
      menu.addItem({ "label": "Save Tile Set" + "...", "id": "tileset-save" });


      _this.colorPaletteMenu = _this.menuBar.addMenu({"label": "Colours", "className": 'ui-menu-tilemode ui-menu-3d' });
      _this.colorPaletteMenu.addItem({ "label": "Show Colour Editor", "id": "color-edit", "shortcut": { "cmd": true, "shift": true, "key": "E" } });
      _this.colorPaletteMenu.addSeparator({ });      
      _this.colorPaletteMenu.addItem({ "label": "Choose A Colour Palette" + "...", "id": "colors-preset" });
      _this.colorPaletteMenu.addItem({ "label": "Edit Colour Palette" + "...", "id": "color-editcolorpalette" });
//      menu.addItem({ "label": "Edit/Create Palette...", "id": "colors-edit" });
      _this.colorPaletteMenu.addItem({ "label": "Load Colour Palette" + "...", "id": "colors-load" });
      _this.colorPaletteMenu.addItem({ "label": "Save Colour Palette" + "...", "id": "colors-save" });
      _this.colorPaletteMenu.addSeparator({ "label": "Project Tile Sets" });
      _this.colorPaletteMenu.addItem({ "label": "Create a Colour Palette...", "id": "colorpalette-new" });

      menu = _this.menuBar.addMenu({"label": "Import / Export", "className": 'ui-menu-colorpalette' });
      menu.addItem({ "label": "Choose A Colour Palette" + "...", "id": "colorpalette-preset" });
      menu.addItem({ "label": "Load Colour Palette" + "...", "id": "colorpalette-load" });
      menu.addItem({ "label": "Save Colour Palette" + "...", "id": "colorpalette-save" });


      menu = _this.menuBar.addMenu({"label": "View", "className": 'ui-menu-tilemode' });
      menu.addItem({ "label": "Zoom In", "id": "view-zoomin", "shortcut": { "cmd": true, "key": "=" } });
      menu.addItem({ "label": "Zoom Out", "id": "view-zoomout", "shortcut": { "cmd": true, "key": "-" } });
      menu.addItem({ "label": "Fit On Screen", "id": "view-fitonscreen", "shortcut": { "cmd": true, "key": "0" } });
      menu.addItem({ "label": "Actual Pixels", "id": "view-actualpixels", "shortcut": { "cmd": true, "key": "1" } });
      menu.addSeparator({  });
      menu.addItem({ "label": "Grid Lines", "id": "edit-showgrid", "checked": true, "shortcut": { "cmd": true, "key": "G" } });

      menu.addItem({ "label": "Border", "id": "edit-showborder", "checked": true, "shortcut": { "cmd": true, "key": "H" } });
      menu.addItem({ "label": "Background", "id": "edit-showbackground", "checked": true, "shortcut": { "cmd": true, "key": "B" } });
      /*
      menu.addItem({ "label": "Show/Hide Background Image", "id": "edit-showbackgroundimage", "shortcut": { "cmd": true, "key": "I" } });
      menu.addItem({ "label": "Set Background Image...", "id": "edit-setbackgroundimage" });
      */

      /*
     menu.addSeparator({ "label": "Layout" });
     menu.addItem({ "label": "Tile Palette Bottom", "id": "layout-palette-bottom" });
     menu.addItem({ "label": "Tile Palette Side", "id": "layout-palette-side" });
     menu.addItem({ "label": "Minimal", "id": "layout-minimal" });
      */

     menu.addSeparator({  });
     menu.addItem({ "label": "Cursor Tile Is Transparent", "id": "cursor-tile-transparent" });





//     if(SHOWUNFINISHED) { 
      menu.addSeparator({  });
      menu.addItem({ "label": "Scripting" + "...", "id": "edit-scripting", "shortcut": { "cmd": true, "key": "R" } });
//     }
//      menu.addItem({ "label": "Project View" + "...", "id": "view-project", "shortcut": { "cmd": true, "key": "P" } });



//      menu = _this.menuBar.addMenu({"label": 'Settings'});
//      menu.addItem({ "label": "C64 PRG Code...", "id": "settings-prgcode" });
//      menu.addItem({ "label": "Import Shader Code...", "id": "settings-importshader" });

      menu = _this.menuBar.addMenu({"label": "Interface", "className": 'ui-menu-tilemode' });
      menu.addItem({ "label": "Zen Mode", "id": "view-zenmode", "checked": false, "shortcut": { "alt": true, "shift": true, "key": "Z" } });
      menu.addSeparator({  });
      menu.addItem({ "label": "Tools Panel", "id": "view-tools" });
      menu.addSeparator({  });

//      menu.addItem({ "label": "Info Panel", "id": "view-infopanel" });
//      menu.addSeparator({  });
      menu.addItem({ "label": "Layers Panel", "id": "view-layerspanel" });
      menu.addItem({ "label": "Tile Palette Panel Side", "id": "view-tilepalettepanelside" });
      menu.addItem({ "label": "Meta Tile Palette Panel Side", "id": "view-metatilepalettepanelside" });
      menu.addItem({ "label": "Colour Palette Panel", "id": "view-palettepanel" });
      menu.addSeparator({  });
      menu.addItem({ "label": "Tile Palette Panel Bottom", "id": "view-tilepalettepanelbottom" });
      menu.addItem({ "label": "Meta Tile Palette Panel Bottom", "id": "view-metatilepalettepanelbottom" });
      menu.addItem({ "label": "Animation Panel", "id": "view-animationpanel" });

      menu.addSeparator({  });
      menu.addItem({ "label": "Perf Stats", "id": "view-perfstats" });
      menu.addSeparator({  });
      menu.addItem({ "label": "Export GIF / " + "Video (old version)" + "...", "id": "export-gif" });
      menu.addItem({ "label": "Export C64 (new)...", "id": "export-c64" });
      menu.addSeparator({  });
      menu.addItem({ "label": "Mobile Mode", "id": "settings-mobilemode" });

      // ------------------------------------------------------------
      menu = _this.menuBar.addMenu({"label": "C64", "className": 'ui-menu-c64 ui-menu-c64-assembler' });
      
//      menu.addSeparator({ "label": "Model"  });
//      menu.addItem({ "label": "PAL", "id": "c64debugger-model-pal", "checked": true });
//      menu.addItem({ "label": "NTSC", "id": "c64debugger-model-ntsc" });

      menu.addSeparator({  });

      menu.addItem({ "label": "Show Raster Position", "id": "c64debugger-viewraster" });
      menu.addItem({ "label": "Show Grid", "id": "c64debugger-grid", "shortcut": { "cmd": true, "key": "G" } });
      menu.addItem({ "label": "Mouse Info", "id": "c64debugger-mouse", "shortcut": { "cmd": true, "key": "I" } });
      menu.addSeparator({  });
      menu.addItem({ "label": "Load PRG...", "id": "c64debugger-loadprg" });
      menu.addItem({ "label": "Attach D64...", "id": "c64debugger-attachd64" });
      menu.addItem({ "label": "Autostart D64...", "id": "c64-autostartd64" });
      menu.addItem({ "label": "Insert CRT...", "id": "c64-insertcrt" });
      menu.addSeparator({  });
      menu.addItem({ "label": "Download Snapshot", "id": "c64-downloadsnapshot" });
//      menu.addSeparator({  });
      //menu.addItem({ "label": "Settings...", "id": "c64-settings" });
      menu.addSeparator({ "label": "PRG Start Settings"  });
      menu.addItem({ "label": "Load/Run", "id": "c64debugger-prgloadrun" });
      menu.addItem({ "label": "Inject into RAM", "id": "c64debugger-prginject", "checked": true });
      menu.addItem({ "label": "Random Delay", "id": "c64debugger-randomdelay", "checked": true });

      menu.addSeparator({  });
      menu.addItem({ "label": "Reset Machine", "id": "c64debugger-reset" });

      menu = _this.menuBar.addMenu({"label": "Sound", "className": 'ui-menu-c64' });
      menu.addItem({ "label": "Sound Playback", "id": "c64debugger-sound", "checked": true });
      menu.addSeparator({ "label": "SID Model" });
      menu.addItem({ "label": "6581", "id": "c64debugger-sound6581", "checked": true });
      menu.addItem({ "label": "8580", "id": "c64debugger-sound8580" });


      menu = _this.menuBar.addMenu({"label": "Joystick", "className": 'ui-menu-c64 ui-menu-c64-assembler' });
      menu.addItem({ "label": "Port 1", "id": "c64debugger-joystick1" });
      menu.addItem({ "label": "Port 2", "id": "c64debugger-joystick2" });
      menu.addItem({ "label": "Swap Joysticks", "id": "c64debugger-joystickswap", "shortcut": { "cmd": true, "key": "J"} });
      menu.addItem({ "label": "Joystick Settings...", "id": "c64debugger-joysticksettings" });
      menu.addSeparator({ "label": "1351 Mouse" });
      menu.addItem({ "label": "Port 1", "id": "c64debugger-mouse1" });
      menu.addItem({ "label": "Port 2", "id": "c64debugger-mouse2" });

      menu = _this.menuBar.addMenu({"label": "Size", "className": 'ui-menu-c64 ui-menu-c64-assembler' });
      menu.addItem({ "label": "100%", "id": "c64debugger-size-1" });
      menu.addItem({ "label": "200%", "id": "c64debugger-size-2" });
      menu.addItem({ "label": "300%", "id": "c64debugger-size-3" });
      menu.addItem({ "label": "400%", "id": "c64debugger-size-4" });
      menu.addItem({ "label": "Fit Pixel Multiple", "id": "c64debugger-size-fitpixel" });
      menu.addItem({ "label": "Fit", "id": "c64debugger-size-fit" });


      menu = _this.menuBar.addMenu({"label": "Speed", "className": 'ui-menu-c64' });
      menu.addItem({ "label": "25%", "id": "c64debugger-speed-25" });
      menu.addItem({ "label": "50%", "id": "c64debugger-speed-50" });
      menu.addItem({ "label": "100%", "id": "c64debugger-speed-100", "checked": true });
      menu.addItem({ "label": "150%", "id": "c64debugger-speed-150" });
      menu.addItem({ "label": "200%", "id": "c64debugger-speed-200" });
      menu.addItem({ "label": "300%", "id": "c64debugger-speed-300" });

      menu = _this.menuBar.addMenu({"label": "View", "className": 'ui-menu-3d' });
      menu.addItem({ "label": "Show / Hide Grid", "id": "view-3dgrid", "shortcut": { "cmd": true, "key": "G" } });
      menu.addSeparator({  });
      menu.addItem({ "label": "Perf Stats", "id": "view-3dperfstats" });


      menu = _this.menuBar.addMenu({"label": "View", "className": 'ui-menu-music  ui-menu-colorpalette ui-menu-tileset ui-menu-script' });
      menu.addItem({ "label": "Project View" + "...", "id": "view-project-explorer", "shortcut": { "cmd": true, "key": "P" } });


      menu = _this.menuBar.addMenu({"label": "View", "className": 'ui-menu-c64-assembler' });
      menu.addSeparator({ "label": "Font" });
      menu.addItem({ "label": "Increase Font Size", "id": "view-increase-font-size", "shortcut": { "cmd": true, "key": "=" } });
      menu.addItem({ "label": "Decrease Font Size", "id": "view-decrease-font-size", "shortcut": { "cmd": true, "key": "-" } });
      menu.addItem({ "label": "Reset Font Size", "id": "view-reset-font-size", "shortcut": { "cmd": true, "key": "0" } });
      menu.addItem({ "label": "Show Invisible Characters", "id": "view-toggle-invisible-characters" });//, "shortcut": { "cmd": true, "key": "9" } });
      menu.addItem({ "label": "Autocomplete", "id": "view-toggle-autocomplete" });
      menu.addItem({ "label": "Tab indentation ", "id": "view-toggle-tabindentation" });
      menu.addSeparator({ "label": "Theme" });
      menu.addItem({ "label": "Light", "id": "view-theme-chrome" });
      menu.addItem({ "label": "Dark", "id": "view-theme-tomorrow-night" });



      menu = _this.menuBar.addMenu({"label": "View", "className": 'ui-menu-c64' });

      menu.addItem({ "label": "Disassembly", "id": "c64-view-toggle-disassembly" });
      menu.addItem({ "label": "Scripting", "id": "c64-view-toggle-scripting" });
      menu.addItem({ "label": "BASIC", "id": "c64-view-toggle-basic" });
      menu.addItem({ "label": "Colours", "id": "c64-view-toggle-colors" });
      menu.addItem({ "label": "Memory", "id": "c64-view-toggle-memory" });
      menu.addItem({ "label": "Character Set", "id": "c64-view-toggle-charset" });
      menu.addItem({ "label": "Sprites", "id": "c64-view-toggle-sprites" });
      menu.addItem({ "label": "Bitmap", "id": "c64-view-toggle-bitmap" });
      menu.addItem({ "label": "SID", "id": "c64-view-toggle-sid" });
      menu.addItem({ "label": "Drive", "id": "c64-view-toggle-drive" });
      menu.addItem({ "label": "Docs", "id": "c64-view-toggle-docs" });
      menu.addItem({ "label": "Calculator", "id": "c64-view-toggle-calc" });
      menu.addSeparator({});
      menu.addItem({ "label": "Increase Font Size", "id": "c64-view-increase-font-size", "shortcut": { "cmd": true, "key": "=" } });
      menu.addItem({ "label": "Decrease Font Size", "id": "c64-view-decrease-font-size", "shortcut": { "cmd": true, "key": "-" } });
      menu.addItem({ "label": "Reset Font Size", "id": "c64-view-reset-font-size", "shortcut": { "cmd": true, "key": "0" } });
      menu.addSeparator({ });
      menu.addItem({ "label": "Perf Stats", "id": "c64-view-perfstats" });


      menu = _this.menuBar.addMenu({"label": "Assembler", "className": 'ui-menu-c64' });
      menu.addItem({ "label": "Show Assembler", "id": "c64-view-toggle-assembler" });
      menu.addSeparator({  });
      menu.addItem({ "label": "Show Invisible Characters", "id": "c64-view-toggle-invisible-characters", "shortcut": { "cmd": true, "key": "9" } });
      menu.addItem({ "label": "Autocomplete", "id": "c64-view-toggle-autocomplete" });
      menu.addItem({ "label": "Use Tab indentation ", "id": "c64-view-toggle-tabindentation" });
      menu.addSeparator({ "label": "Theme" });
      menu.addItem({ "label": "Light", "id": "c64-view-theme-chrome" });
      menu.addItem({ "label": "Dark", "id": "c64-view-theme-tomorrow-night" });


      menu = _this.menuBar.addMenu({"label": "Share", "className": 'ui-menu-c64 ui-menu-c64-share' });

      menu.addItem({ "label": "Export PRG/D64/CRT as a HTML Page...", "id": "c64-export-html-page" });
//      menu.addItem({ "label": "Download HTML Page", "id": "c64-share-html" });

      menu = _this.menuBar.addMenu({"label": "Help", "className": 'ui-menu-tilemode' });

      menu.addItem({ "label": "Common Actions" + "...", "id": "help-commonactionshortcuts" });

      menu.addItem({ "label": "Mouse / Keyboard shortcuts" + "...", "id": "help-keyboardshortcuts" });

      if(SHOWUNFINISHED) {
        menu.addItem({ "label": "Scripting API" + "...", "id": "help-scriptingapi" });
      }

      menu.addSeparator({ });
      menu.addItem({ "label": "About lvllvl plus" + "...", "id": "help-about" });

      _this.menuBar.on('itemclick', function(id, source) {
        _this.menuClick(id, source);
      });

//      _this.setMode('start'); 

      _this.uiNumber = new UINumber();
      _this.uiNumber.init();

      // hide all the panels at first
      _this.mainPanel.showOnly('startPage');

      _this.textModeEditor.loadPreferences();
      _this.displayUserDetails();
      _this.createZenModeInterface();


    });


    this.tabSplitPanel = UI.create("UI.SplitPanel", { "id": "tabSplitPanel" });
    this.tabPanel = UI.create("UI.TabPanel", {});

    this.tabPanel.on('tabfocus', function(key, tabPanel) {

      var tabIndex = _this.tabPanel.getTabIndex(key);
      if(tabIndex >= 0) {
        var tabData = _this.tabPanel.getTabData(tabIndex);
        var path = tabData.path;
        if(typeof path != 'undefined') {
          g_app.projectNavigator.selectDocRecord(path);  
        }
      }
//      var path = key;
//      g_app.projectNavigator.selectDocRecord(path);

    });

    this.tabPanel.on('notabs', function(tabPanel) {
      g_app.setMode('none');
    });


    var tabPanelHidden = true;
    if(isMobile) {
      tabPanelHidden = true;
    }
    this.tabSplitPanel.addNorth(this.tabPanel, 34, false, tabPanelHidden);


    this.contentPanel = UI.create("UI.Panel", { "id": "appContent" } );

    this.tabSplitPanel.add(this.contentPanel);
    this.mainSplitPanel.add(this.tabSplitPanel);

    this.startPage = new StartPage();
    this.startPage.init();
    this.startPage.buildInterface(this.mainPanel);//this.contentPanel);



    this.textModeEditor = new TextModeEditor();
    this.textModeEditor.init(this.services);
    this.textModeEditor.buildInterface(this.contentPanel);

    this.colorPaletteEditor = new ColorPaletteEditor();
    this.colorPaletteEditor.init();
    this.colorPaletteEditor.buildInterface(this.contentPanel);

    this.tileSetEditor = new TileSetEditor();
    this.tileSetEditor.init();
    this.tileSetEditor.buildInterface(this.contentPanel);

    this.scriptEditor = new ScriptEditor();
    this.scriptEditor.init({ parentPanel: this.contentPanel });
    // interface gets built when its shown
//    this.scriptEditor.buildInterface(this.contentPanel);

    this.jsonEditor = new JSONEditor();
    this.jsonEditor.init({ parentPanel: this.contentPanel });
//    this.jsonEditor.buildInterface(this.contentPanel);

    this.textEditor = new TextEditor();
    this.textEditor.init({ parentPanel: this.contentPanel });
//    this.textEditor.buildInterface(this.contentPanel);
    
    this.hexEditor = new HexEditor();
    this.hexEditor.init();
    this.hexEditor.buildInterface(this.contentPanel);
    this.createTemplateLink = new CreateTemplateLink();
    this.createTemplateLink.init();

    this.assembler = new Assembler();
    this.assembler.init();

    this.assemblerEditor = new AssemblerEditor();
    this.assemblerEditor.init();
    this.assemblerEditor.buildInterface(this.contentPanel);


    this.music = new Music();
    this.music.init();
    this.music.buildInterface(this.contentPanel);


    this.c64Debugger = new C64Debugger();
    this.c64Debugger.init();
    this.c64Debugger.buildInterface(this.contentPanel);


    this.dbgFont = new DbgFont();
    this.dbgFont.init();

    this.setFontSize(this.fontSize);
    this.scripting = new Scripting();
    
    this.scriptingPanel = UI.create("UI.Panel", {"id": "scriptingPanel"});
    this.scripting.init({ "parentPanel": this.scriptingPanel });
//    this.scripting.buildInterface(this.scriptingPanel);

    this.mainSplitPanel.addWest(this.scriptingPanel, 360, true, true);//, true);


    this.projectNavigator = new ProjectNavigator();
    this.projectNavigator.init(this);
    this.projectNavigatorPanel = UI.create("UI.Panel", { "id": "projectNavigatorPanel" });
    this.projectNavigator.buildInterface(this.projectNavigatorPanel);

    this.projectPanel.addWest(this.projectNavigatorPanel, 180, true, true);


  },

  toggleMobileView: function() {
    this.tabSplitPanel.setPanelVisible('north', true);
    this.projectPanel.setPanelVisible('north', true);

  },


  setTabPanelVisible: function() {
    this.tabSplitPanel.setPanelVisible('north', true);
  },

  // just update the tab..
  setCurrentDocRecord: function(docRecord) {
//    this.tabPanel.setTabLabel(0, docRecord.name);
  },

  menuClick: function(menuItem, source) {
    var _this = this;
    switch(menuItem) {
      case 'file-new':
        var newProjectDialog = g_app.getNewProjectDialog();
        newProjectDialog.show();      
//        g_app.fileManager.showNewDialog();
      break;
      case 'file-open':
        this.fileManager.openLocalFile();
      break;
      case 'file-spritedimensions':
      case 'file-dimensions':
//        this.fileManager.showDimensions();

        this.textModeEditor.showDimensionsDialog();
      break;
      case 'screen-crop':
        this.textModeEditor.cropToSelection();
        break;
      case '3d-mode':
        this.setMode('3d');
      break;
      case 'file-save':
        this.fileManager.save();
      break;

      case 'file-saveas':
        this.fileManager.showSaveAs();
      break;

      case 'file-saveastemplate':
        this.fileManager.showSaveAsTemplate();
      break;

      case 'file-download':
        this.fileManager.showDownload();
      break;

      case 'file-new':
        this.fileManager.showNew();
      break;

      case 'file-templateLink':
        this.createTemplateLink.show();
      break;

      case 'edit-undo':
      case 'edit-musicundo':
      case 'colorpaletteedit-undo':
        this.undo();
      break;
      case 'edit-redo':
      case 'edit-musicredo':
      case 'colorpaletteedit-undo':
        this.redo();
      break;

      case 'edit-cut':
      case 'edit-musiccut':
        if(this.mode == '3d' || this.mode == '2d') {
          if(this.textModeEditor.getEditorMode() == 'pixel') {
            this.textModeEditor.tools.drawTools.pixelSelect.cut();
          } else {  
            this.textModeEditor.tools.drawTools.select.cut();
          }
        } 
        if(this.mode == 'music') {
          this.music.cut();
        }
        break;

      case 'edit-copy':
      case 'edit-musiccopy':
        if(this.mode == '3d' || this.mode == '2d') {
          if(this.textModeEditor.getEditorMode() == 'pixel') {
            this.textModeEditor.tools.drawTools.pixelSelect.copy();
          } else {  
            this.textModeEditor.tools.drawTools.select.copy();

            if(this.textModeEditor.tools.drawTools.select.getEnabled()) {
              //this.textModeEditor.copyAsImage();
            }
          }
        } 

        if(this.mode == 'music') {
          this.music.copy();
        }
        break;

      case 'c64debugger-mouse':
      case 'edit-copyimage':
        if(this.mode == 'c64') {
          this.c64Debugger.showMouseInfo(!this.c64Debugger.mouseInfo);
        } else {
          this.textModeEditor.copyAsImage();
        }
        break;
      case 'edit-paste':
      case 'edit-musicpaste':
        if(this.mode == '3d' || this.mode == '2d') {
          if(this.textModeEditor.getEditorMode() == 'pixel') {
            this.textModeEditor.tools.drawTools.pixelSelect.paste();
          } else {  

            this.textModeEditor.tools.drawTools.select.paste();
          }
        } 
        if(this.mode == 'music') {
          this.music.paste();
        }
        break;
      case 'edit-clearall':
        if(this.mode == '3d' || this.mode == '2d') {
          this.textModeEditor.tools.drawTools.select.clearAll();
        } 
        if(this.mode == 'music') {
          this.music.clear();
        }
      break;

      case 'edit-clear':
        if(this.mode == '3d' || this.mode == '2d') {
          this.textModeEditor.tools.drawTools.select.clear();
        } 
        break;
      case 'edit-musicclear':
        this.music.clear();
      break;

      case 'edit-fliph':
        if(this.textModeEditor.graphic.getType() == 'sprite') {
          this.textModeEditor.tools.drawTools.pixelDraw.flipH();
        } else {
          this.textModeEditor.tools.drawTools.select.flipH();
        }
        break;
      case 'edit-flipv':
        if(this.textModeEditor.graphic.getType() == 'sprite') {
          this.textModeEditor.tools.drawTools.pixelDraw.flipV();
        } else {
          this.textModeEditor.tools.drawTools.select.flipV();
        }
        break;

      case 'edit-selectall':
        if(this.mode == '3d' || this.mode == '2d') {
          if(this.textModeEditor.getEditorMode() == 'pixel') {
            this.textModeEditor.tools.drawTools.pixelSelect.selectAll();
          } else {  

            this.textModeEditor.tools.drawTools.select.selectAll();
          }
        } 

        if(this.mode == 'music') {
          this.music.selectAll();
        }
        break;
      case 'edit-deselect':
        if(this.mode == '2d') {
          if(this.textModeEditor.getEditorMode() == 'pixel') {
            this.textModeEditor.tools.drawTools.pixelSelect.unselectAll();
          } else {  

            this.textModeEditor.tools.drawTools.select.unselectAll();
          }
        } 

        if(this.mode == '3d' ) {
          this.textModeEditor.grid3d.selection.unselectAll();
        }
      case 'edit-musicdeselect':
        this.music.clearSelect();
      break;


      case 'edit-replaceColor':
        this.textModeEditor.replaceColor();
      break;

      case 'edit-replaceCharacter':
        this.textModeEditor.replaceCharacter();
      break;

      case 'edit-clearHiddenTiles':
        this.textModeEditor.clearHiddenTiles();
      break;

      case 'edit-c64':
        this.setMode('c64');
      break;

      case 'edit-toggleMode':
        var editorMode = this.textModeEditor.getEditorMode();
        if(editorMode != 'pixel') {
          this.textModeEditor.setEditorMode('pixel');
        } else {
          this.textModeEditor.setEditorMode('tile');
        }
      break;


      case 'view-3dgrid':
        this.textModeEditor.setGridVisible(!this.textModeEditor.getGridVisible());
        break;


      case 'edit-showborder':
        this.textModeEditor.grid.toggleBorder();
      break;


      case 'edit-showbackground':
//        this.textModeEditor.grid.toggleBackground();
        this.textModeEditor.layers.toggleBackground();
      break;

      case 'edit-showbackgroundimage':
        this.textModeEditor.grid.toggleBackgroundImage();
      break;

      case 'edit-setbackgroundimage':
        this.textModeEditor.backgroundImage.start();
      break;

      case 'screen-referenceimage':
        this.textModeEditor.showReferenceImageDialog();
      break;
      case 'edit-scripting':
        this.scripting.toggleVisible();      
      break;

      case 'export-png':
        this.textModeEditor.exportPng();
      break;

      case 'export-svg':
        this.textModeEditor.exportSvg();
      break;

      case 'export-image':
        this.textModeEditor.exportImage();        
        break;
      case 'export-gif':
        this.textModeEditor.exportGif();
//        this.textModeEditor.exportGif.start();
      break;

      case 'export-petsciic':
        this.textModeEditor.doExport('petsciic');
      break;

      case 'export-pet':
        this.textModeEditor.doExport('pet');
      break;

      case 'export-3d-gif':
        this.textModeEditor.export3dAsGif();
        break;

      case 'export-charpad':
        this.textModeEditor.doExport('charpad');
      break;

      case 'export-spritepad':
        this.textModeEditor.doExport('spritepad');
      break;

      case 'export-c64assembly':
        this.textModeEditor.doExport('c64assembly');
      break;
      case 'export-mega65assembly':
        this.textModeEditor.doExport('mega65assembly');
      break;
      case 'export-x16assembly':
        this.textModeEditor.doExport('x16assembly');
      break;


      case 'export-x16basic':
        this.textModeEditor.doExport('x16basic');
      break;

      case 'export-txt':
        this.textModeEditor.doExport('txt');
        break;
      case 'export-json':
        this.textModeEditor.doExport('json');
      break;

      case 'export-binary':
        this.textModeEditor.doExport('binary');//exportBinaryData.start();
      break;
      
      case 'export-seq':
        this.textModeEditor.doExport('seq');
      break;

      case 'export-prg':
        this.textModeEditor.toPrg.start();
      break;

      case 'export-c64':
        this.textModeEditor.exportC64.start();
        break;

      case 'export-magicavoxel':
        this.textModeEditor.doExport('vox');
      break;

      case 'export-obj':
        this.textModeEditor.doExport('obj');
      break;


      case 'export-sid':
        this.music.exportAsType('sid');
      break;

      case 'export-goattracker':
        this.music.exportAsType('goattracker');
      break;

      case 'export-wav':
        this.music.exportAsType('wav');      
      break;

      case 'export-sidprg':
        this.music.exportAsType('prg');      
      break;


      case 'import-image':
        this.openImageImport(undefined, source || 'menu');
      break;

      case 'import-c64formats':
        this.textModeEditor.importC64Formats.start();
      break;

      case 'import-c64spriteformats':
        this.textModeEditor.importC64SpriteFormats.start();
        break;
      case 'import-spriteimage':
        this.textModeEditor.startImportSpriteImage();
        break;

      case 'mode-spritetextmode':
      case 'mode-textmode':
        this.textModeEditor.setScreenMode(TextModeEditor.Mode.TEXTMODE);
      break;


      case 'mode-c64standard':
        this.textModeEditor.setScreenMode(TextModeEditor.Mode.C64STANDARD);
        break

      case 'mode-c64ecm':
        this.textModeEditor.setScreenMode(TextModeEditor.Mode.C64ECM);
      break;

      case 'mode-vector':
        this.textModeEditor.setScreenMode(TextModeEditor.Mode.VECTOR);
        this.textModeEditor.setHasTileFlip(true);
        this.textModeEditor.setHasTileRotate(true);
      break;

      case 'mode-spritec64multicolor':
      case 'mode-c64multicolor':
        this.textModeEditor.setScreenMode(TextModeEditor.Mode.C64MULTICOLOR);
      break;

      case 'mode-spritenes':
      case 'mode-nes':
        this.textModeEditor.setScreenMode('nes');
        this.textModeEditor.colorPaletteManager.colorSubPalettes.check();
      break;
      case 'mode-indexed':
      case 'mode-spriteindexed':
        this.textModeEditor.setScreenMode(TextModeEditor.Mode.INDEXED);
        break;

      case 'mode-rgb':
      case 'mode-spritergb':
        this.textModeEditor.setScreenMode(TextModeEditor.Mode.RGB);
        break;

      case 'mode-multicolor':
        this.textModeEditor.setScreenMode('multicolor');
      break;

      case 'mode-tileflip':
        this.textModeEditor.setHasTileFlip(!this.textModeEditor.getHasTileFlip());
        break;
      case 'mode-tilerotate':
        this.textModeEditor.setHasTileRotate(!this.textModeEditor.getHasTileRotate());
        break;
      case 'mode-tilematerials':
          this.textModeEditor.setHasTileMaterials(!this.textModeEditor.getHasTileMaterials());
          break;

      case 'mode-blockmode':
        if(this.textModeEditor.getBlockModeEnabled()) {
          this.textModeEditor.setBlockModeEnabled(false);
        } else {
          this.textModeEditor.setBlockModeEnabled(true);
          
        }

        if(this.textModeEditor.getBlockModeEnabled()) {
          UI('mode-blockmode').setChecked(true);
          UI('mode-blocksize').setEnabled(true);
          UI('colorpermode-cell').setEnabled(false);
        } else {
          UI('mode-blockmode').setChecked(false);
          UI('mode-blocksize').setEnabled(false);
          UI('colorpermode-cell').setEnabled(true);
        }
      break;

      case 'mode-blocksize':
        this.textModeEditor.showBlockSizeDialog();
      break;

      case 'colorpermode-cell':
        this.textModeEditor.setColorPerMode('cell');
      break;

      case 'colorpermode-character':
        this.textModeEditor.setColorPerMode('character');
      break;

      case 'colorpermode-block':
        this.textModeEditor.setColorPerMode('block');
      break;

      case 'layers-new':
        this.textModeEditor.layers.showNewLayerDialog();
      break;

      case 'layers-properties':
        this.textModeEditor.layers.editLayer();      
      break;

      case 'layers-delete':
        if(confirm('Are you sure you want to delete this layer?')) {

          this.textModeEditor.layers.deleteLayer();      
        }
      break;

      case 'layers-moveUp':
        this.textModeEditor.layers.moveLayer(1);    
      break;

      case 'layers-moveDown':
        this.textModeEditor.layers.moveLayer(-1);      
      break;

      case 'layers-toggle':
        this.textModeEditor.layers.toggleVisible();
      break;

      case 'layers-selectAbove':
        this.textModeEditor.layers.moveSelect(1);          
      break;
      
      case 'layers-selectBelow':      
        this.textModeEditor.layers.moveSelect(-1);          
      break;

      case 'layers-merge':
        this.textModeEditor.layers.showLayerMerge();
      break;

      case 'layers-toframes':
        this.textModeEditor.layers.showLayersToFrames();
      break;

      case 'layers-fromframes':
        this.textModeEditor.layers.showFramesToLayers();
      break;

      case 'charactersets-edit':
        this.textModeEditor.showTileEditor();

      break;
      case 'charactersets-preset':
      case 'tileset-preset':

        this.textModeEditor.tileSetManager.showChoosePreset({});
        break;
      case 'charactersets-load':
      case 'tileset-load':
        this.textModeEditor.tileSetManager.showImport({});
      break;
      case 'charactersets-save':
      case 'tileset-save':
      this.textModeEditor.tileSetManager.showSave();
      break;
      case 'tileset-new':
        this.textModeEditor.tileSetManager.showNewTileSetDialog();
      break;
      case 'colorpalette-new':
        this.textModeEditor.colorPaletteManager.showNewColorPaletteDialog();
      break;
      case 'color-edit':
        this.textModeEditor.toggleColorEditor();
      break;
      case 'colors-preset':
      case 'colorpalette-preset':
        this.textModeEditor.colorPaletteManager.showChoosePreset({});
      break;
      case 'color-editcolorpalette':
        this.textModeEditor.editColorPalette();
      break;
      /*
      case 'colors-edit':
        this.textModeEditor.editColorPalette();
      break;
      */

      case 'colors-load':
      case 'colorpalette-load':
        this.textModeEditor.colorPaletteManager.showLoad({});
      break;
      case 'colors-save':
      case 'colorpalette-save':
        this.textModeEditor.colorPaletteManager.showSave();
      break;
      case 'view-increase-font-size':
      case 'c64-view-increase-font-size':
      case 'view-zoomin':
        if(this.mode == 'assembler' || this.mode == 'c64') {
          this.changeFontSize(1);
        } else {
          this.textModeEditor.zoom(1);
        }
        break;
      case 'view-decrease-font-size':
      case 'c64-view-decrease-font-size':
      case 'view-zoomout':
        if(this.mode == 'assembler' || this.mode == 'c64') {
          this.changeFontSize(-1);          
        } else {
          this.textModeEditor.zoom(-1);
        }
        break;
      case 'view-theme-chrome':
        this.assemblerEditor.setTheme('chrome');          
        break;
      case 'view-theme-tomorrow-night':
        this.assemblerEditor.setTheme('tomorrow_night');
        break;  
      case 'view-fitonscreen':
      case 'view-reset-font-size':
      case 'c64-view-reset-font-size':
          if(this.mode == 'assembler' || this.mode == 'c64') {
          this.resetFontSize();          
        } else {
          this.textModeEditor.fitOnScreen();
        }
        break;
      case 'view-toggle-invisible-characters':
        this.assemblerEditor.toggleInvisibles();
        break;
      
      case 'view-toggle-autocomplete':
        this.assemblerEditor.toggleAutocomplete();
        break;

      case 'view-toggle-tabindentation':
        this.assemblerEditor.toggleTabIndentation();
        break;


      case 'c64-view-toggle-drive':
        var show = !UI(menuItem).getChecked();
        this.c64Debugger.showPanel(menuItem, show);
        break;
  
      case 'c64-view-toggle-invisible-characters':
        this.c64Debugger.assemblerEditor.toggleInvisibles();
        break;

      case 'c64-view-toggle-autocomplete':
        this.c64Debugger.assemblerEditor.toggleAutocomplete();
        break;
      case 'c64-view-theme-chrome':
        this.c64Debugger.assemblerEditor.setTheme('chrome');          
        break;
      case 'c64-view-theme-tomorrow-night':
        this.c64Debugger.assemblerEditor.setTheme('tomorrow_night');
        break;  
      case 'c64-view-toggle-tabindentation':
        this.c64Debugger.assemblerEditor.toggleTabIndentation();
        break;
    
      case 'c64-view-toggle-assembler':
      case 'c64-view-toggle-disassembly':
      case 'c64-view-toggle-scripting':
      case 'c64-view-toggle-colors':
      case 'c64-view-toggle-basic':
      case 'c64-view-toggle-memory':      
      case 'c64-view-toggle-charset':
      case 'c64-view-toggle-sprites':
      case 'c64-view-toggle-bitmap':
      case 'c64-view-toggle-sid':
      case 'c64-view-toggle-drive':
      case 'c64-view-toggle-docs':
      case 'c64-view-toggle-calc':
        var show = !UI(menuItem).getChecked();
        this.c64Debugger.showPanel(menuItem, show);
        break;

        
//      case '':
//        break;
      case 'view-actualpixels':
        this.textModeEditor.actualPixels();
        break;

      case 'home-page':
        document.location = '/';
        break;
      case 'view-project':
      case 'view-project-explorer':
      case 'show-project-explorer':
        this.projectNavigator.toggleVisible();      

        //this.mainPanel.showOnly('mainSplitPanel');
        /*
        this.mainPanel.showOnly('projectSplitPanel');
        this.mainSplitPanel.setPanelVisible('north', true);
        this.showAssembler();
        */

        break;

      case 'settings-prgcode':
        this.textModeEditor.editC64PRGCode();
        break;

      case 'settings-importshader':
        this.textModeEditor.editImportShader();
        break;

      case 'settings-mobilemode':
        if(confirm('Are you sure you want to switch to mobile mode?')) {
          this.setDeviceType('mobile');
        }
        break;
      case 'cursor-tile-transparent':
        this.textModeEditor.toggleCursorTileTransparent();
        break;

      case 'layout-palette-bottom':
        this.textModeEditor.setLayout('bottom');
        break;
      case 'layout-palette-side':
        this.textModeEditor.setLayout('side');
        break;
      case 'layout-minimal':
        this.textModeEditor.setLayout('minimal');
        break;

      case 'view-zenmode':
        this.toggleZenMode();
        break;

      case 'view-tools':
        this.textModeEditor.setToolsVisible(!this.textModeEditor.getToolsVisible());
        break;

      case 'view-infopanel':
        this.textModeEditor.setInfoPanelVisible(!this.textModeEditor.getInfoPanelVisible());
        break;
      case 'view-layerspanel':
          this.textModeEditor.setLayersPanelVisible(!this.textModeEditor.getLayersPanelVisible());
          break;
      case 'view-palettepanel':
          this.textModeEditor.setColorPalettePanelVisible(!this.textModeEditor.getColorPalettePanelVisible());
          break;

      case 'view-tilepalettepanelside':
        this.textModeEditor.setTilePalettePanelVisible('side', !this.textModeEditor.getTilePalettePanelVisible('side'));
        break;
      case 'view-metatilepalettepanelside':
        this.textModeEditor.setSideBlockPanelVisible(!this.textModeEditor.getSideBlockPanelVisible());
        break;
  
      case 'view-tilepalettepanelbottom':
        this.textModeEditor.setTilePalettePanelVisible('bottom', !this.textModeEditor.getTilePalettePanelVisible('bottom'));
        break;
      case 'view-metatilepalettepanelbottom':
        this.textModeEditor.setBottomBlockPanelVisible(!this.textModeEditor.getBottomBlockPanelVisible());
        break;

      case 'view-animationpanel':
        this.textModeEditor.setAnimationPanelVisible(!this.textModeEditor.getAnimationPanelVisible());
        break;
  
      case 'c64-view-perfstats':
      case 'view-perfstats':
      case 'view-3dperfstats':
        if(UI.getStatsEnabled()) {
          UI.setStatsEnabled(false);
          UI('view-perfstats').setChecked(false);

        } else {
          UI.setStatsEnabled(true);
          UI('view-perfstats').setChecked(true);
        }
        
        break;
      case 'help-commonactionshortcuts':
        window.open('./docs/common-action-shortcuts.html', 'common-action-shortcuts');
        break;
      case 'help-keyboardshortcuts':
        window.open('./docs/keyboard-shortcuts.html', 'keyboard-shortcuts');
      break;
      case 'help-scriptingapi':
        window.open('./docs/api.html', 'scripting-api');
      break;
      case 'help-about':
        this.showAboutDialog();
      break;

      case 'c64debugger-sound':
        c64.sound.toggleAudio();
        break;

      case 'c64debugger-sound6581':
        c64.sound.setModel('6581');
        break;
      case 'c64debugger-sound8580':
        c64.sound.setModel('8580');
        break;

      case 'c64-export-html-page':
        this.c64Debugger.exportAsHTMLPage();
        break;
      case 'c64debugger-loadprg':
        if(this.mode == 'assembler') {
          if(this.assemblerEditor.debuggerCompact) {  
            this.assemblerEditor.debuggerCompact.choosePRG();
          }
        }

        if(this.mode == 'c64') {
          this.c64Debugger.choosePRG();
        }
        break;
      case 'c64debugger-attachd64':
        if(this.mode == 'assembler') {
          if(this.assemblerEditor.debuggerCompact) {  
            this.assemblerEditor.debuggerCompact.chooseD64(false);
          }
        }        

        if(this.mode == 'c64') {
          this.c64Debugger.chooseD64(false);
        }
        break;
      case 'c64-autostartd64':
        if(this.mode == 'c64') {
          this.c64Debugger.chooseD64(true);
        }
        break;
      case 'c64-insertcrt':
        if(this.mode == 'c64') {
          this.c64Debugger.chooseCRT();
        }
        break;  
      case 'c64-downloadsnapshot':
        if(this.mode == 'c64') {
          this.c64Debugger.downloadSnapshot();
        }
        break;
      case 'c64-settings':
        if(this.mode == 'c64') {
//          this.c64Debugger.showSettings();
        }
        break;
      case 'c64debugger-prgloadrun':
        if(this.mode == 'c64') {          
          this.c64Debugger.setPRGLoadMethod('loadrun');
        }

        if(this.mode == 'assembler') {
          if(this.assemblerEditor.debuggerCompact) {
            this.assemblerEditor.debuggerCompact.setPRGLoadMethod('loadrun');
          }
        }
        break;
      case 'c64debugger-prginject':
        if(this.mode == 'c64') {
          this.c64Debugger.setPRGLoadMethod('inject');
        }

        if(this.mode == 'assembler') {
          if(this.assemblerEditor.debuggerCompact) {
            this.assemblerEditor.debuggerCompact.setPRGLoadMethod('inject');
          }
        }

        break;
      case 'c64debugger-randomdelay':
        if(this.mode == 'c64') {
          this.c64Debugger.toggleRandomDelay();
        }
        break;
      case 'c64debugger-reset':
        if(this.mode == 'assembler') {
          if(this.assemblerEditor.debuggerCompact) {  
            this.assemblerEditor.debuggerCompact.machineReset();
          }
        }        

        if(this.mode == 'c64') {
          this.c64Debugger.machineReset();
        }
        break;
      case 'c64debugger-model-pal':
        if(this.mode == 'c64') {
          this.c64Debugger.setModel('pal');
        }
        break;

      case 'c64debugger-model-ntsc':
        if(this.mode == 'c64') {
          this.c64Debugger.setModel('ntsc');
        }
        break;
      
      case 'c64debugger-viewraster':
        if(this.mode == 'assembler') {
          if(this.assemblerEditor.debuggerCompact) {  
            this.assemblerEditor.debuggerCompact.toggleShowRaster();
          }
        }        

        if(this.mode == 'c64') {
          this.c64Debugger.toggleShowRaster();
        }
        break;
      case 'edit-showgrid':  
      case 'c64debugger-grid':
        if(this.mode == 'c64') {
          this.c64Debugger.showGrid(!this.c64Debugger.grid);
        } else {
          this.textModeEditor.setGridVisible(!this.textModeEditor.getGridVisible());
        }
        break;
      case 'c64debugger-joystick1':
      case 'c64debugger-joystick2':
        var port = 0;
        var enabled = true;

        if(menuItem == 'c64debugger-joystick1') {
          enabled = UI('c64debugger-joystick1').getChecked();
          port = 1;
        } else if(menuItem == 'c64debugger-joystick2') {
          enabled = UI('c64debugger-joystick2').getChecked();
          port = 2;
        }

        c64.joystick.setPortEnabled(port, !enabled);
        break;
      case 'c64debugger-joysticksettings':
        c64.joystick.showSettingsDialog();
        break;
      case 'c64debugger-joystickswap':
        c64.joystick.swap();
        break;

      case 'c64debugger-mouse1':
      case 'c64debugger-mouse2':
        var port = 0;
        var enabled = true;

        if(menuItem == 'c64debugger-mouse1') {
          enabled = UI('c64debugger-mouse1').getChecked();
          port = 1;
        } else if(menuItem == 'c64debugger-mouse2') {
          enabled = UI('c64debugger-mouse2').getChecked();
          port = 2;
        }

        c64.joystick.setMousePortEnabled(port, !enabled);

        break;

      case 'c64debugger-size-1':
      case 'c64debugger-size-2':
      case 'c64debugger-size-3':
      case 'c64debugger-size-4':
            var size = 1;
        if(menuItem == 'c64debugger-size-1') {
          size = 1;
        } else if(menuItem == 'c64debugger-size-2') {
          size = 2;
        } else if(menuItem == 'c64debugger-size-3') {
          size = 3;
        } else if(menuItem == 'c64debugger-size-4') {
          size = 4;
        }

        if(this.mode == 'assembler') {
          if(this.assemblerEditor.debuggerCompact) {  
            this.assemblerEditor.debuggerCompact.setSize(size);
          }
        }

        if(this.mode == 'c64') {
          this.c64Debugger.setSize(size);
        }
        break;

      case 'c64debugger-speed-25':
      case 'c64debugger-speed-50':
      case 'c64debugger-speed-100':
      case 'c64debugger-speed-150':
      case 'c64debugger-speed-200':
      case 'c64debugger-speed-300':
        var speed = 100;
        switch(menuItem) {
          case 'c64debugger-speed-25':
            speed = 25;
            break;
          case 'c64debugger-speed-50':
            speed = 50;
            break;
          case 'c64debugger-speed-100':
            speed = 100;
            break;
          case 'c64debugger-speed-150':
            speed = 150;
            break;
          case 'c64debugger-speed-200':
            speed = 200;
            break;
          case 'c64debugger-speed-300':
            speed = 300;
            break;
  
        }
        if(this.mode == 'c64') {
          this.c64Debugger.setSpeed(speed);
        }
        break;

      case 'c64debugger-size-fit':
        if(this.mode == 'assembler') {
          if(this.assemblerEditor.debuggerCompact) {  
            this.assemblerEditor.debuggerCompact.setSize('fit');
          }
        }

        if(this.mode == 'c64') {
          this.c64Debugger.setSize('fit');
        }
        break;
      case 'c64debugger-size-fitpixel':
        if(this.mode == 'assembler') {
          if(this.assemblerEditor.debuggerCompact) {  
            this.assemblerEditor.debuggerCompact.setSize('fitpixel');
          }
        }

        if(this.mode == 'c64') {
          this.c64Debugger.setSize('fitpixel');
        }
        break;
        
    }

    if(menuItem.indexOf('tileset-select-') !== -1) {
      var tileSetId = menuItem.substring('tileset-select-'.length);
      this.textModeEditor.tileSetManager.selectTileSet(tileSetId);
    }


    if(menuItem.indexOf('colorpalette-select-') !== -1) {
      var colorPaletteId = menuItem.substring('colorpalette-select-'.length);
      this.textModeEditor.colorPaletteManager.selectColorPalette(colorPaletteId);
    }


  },

  showProjectNavigator: function() {
    if(this.isMobile()) {
      if(this.projectNavigatorMobile == null) {
        this.projectNavigatorMobile = new ProjectNavigatorMobile();
        this.projectNavigatorMobile.init();
      }


      this.projectNavigatorMobile.show();

    }
  },

  getFontSize: function() {
    return this.fontSize;
  },

  setFontSize: function(fontSize) {
    this.fontSize = fontSize;
//    this.editor.setFontSize(this.fontSize);
    g_app.setPref("codeeditor.fontsize", this.fontSize);

    // set the font for all the code editors..
    if(this.assemblerEditor) {
      this.assemblerEditor.setFontSize(this.fontSize);
    }

    if(this.c64Debugger) {
      this.c64Debugger.setFontSize(this.fontSize);
    }

  },


  changeFontSize: function(direction) {
    var fontSize = this.fontSize + direction;
    if(isNaN(fontSize) || fontSize <= 0) {
      return;
    }

    this.setFontSize(fontSize);

  },

  resetFontSize: function() {
    this.setFontSize(14);
  },

  undo: function() {

    if(this.textModeEditor.colorPaletteEdit && this.textModeEditor.colorPaletteEdit.visible) {
      this.textModeEditor.colorPaletteEdit.undo();
      return;
    }

    if(this.mode == '3d' || this.mode == '2d') {
      this.textModeEditor.history.undo();
    } 
    if(this.mode == 'music') {
      this.music.history.undo();
    }
    if(this.mode == 'color palette') {
      this.colorPaletteEditor.colorPaletteEdit.undo()
    }

    if(this.mode == 'assembler') {
      this.assemblerEditor.undo();
    }

    if(this.mode == 'c64') {
      this.c64Debugger.undo();
    }
  },

  redo: function() {

    if(this.textModeEditor.colorPaletteEdit && this.textModeEditor.colorPaletteEdit.visible) {
      this.textModeEditor.colorPaletteEdit.redo();
      return;
    }

    if(this.mode == '3d' || this.mode == '2d') {
      this.textModeEditor.history.redo();
    } 
    if(this.mode == 'music') {
      this.music.history.redo();
    }
    if(this.mode == 'color palette') {
      this.colorPaletteEditor.colorPaletteEdit.redo()
    }

    if(this.mode == 'assembler') {
      this.assemblerEditor.redo();
    }

    if(this.mode == 'c64') {
      this.c64Debugger.redo();
    }

  },


  createDocumentStructure: function(doc) {
    doc.createDocRecord('/', 'color palettes', 'folder', {});
    doc.createDocRecord('/', 'tile sets', 'folder', {});
    doc.createDocRecord('/', 'screens', 'folder', {});
    doc.createDocRecord('/', 'sprites', 'folder', {});
    doc.createDocRecord('/', 'music', 'folder', {});
    doc.createDocRecord('/', 'asm', 'folder', {});
    doc.createDocRecord('/asm', 'inc', 'folder', {});
    doc.createDocRecord('/asm', 'bin', 'folder', {});
    doc.createDocRecord('/', 'scripts', 'folder', {});
    doc.createDocRecord('/', 'build', 'folder', {});
    doc.createDocRecord('/', '3d scenes', 'folder', {});
    doc.createDocRecord('/', 'config', 'folder', {});
  },



  closeProject: function() {
    this.doc = null;
    this.projectNavigator.refresh(null);
    this.projectNavigator.currentPath = false;

  },

  
  newProject: function(args, callback) {
    var _this = this;

    this.closeProject();
    this.fileManager.setIsNew(true);

    var mode = 'monochrome';
    var editor = 'screen';

    if(typeof args.editor  != 'undefined') {
      editor = args.editor;
    }

    if(editor == '') {
      editor = 'screen';
    }

    if(typeof args.mode != 'undefined') {
      mode = args.mode;
    }


    this.doc = this.createDocument();

    // load the colour palette and tile set
    var colorPalettePresetId = 'c64_colodore';
    var colorPaletteName = 'Colour Palette';

    if(typeof args.colorPalettePresetId !== 'undefined') {
      if(args.colorPalettePresetId) {
        colorPalettePresetId = args.colorPalettePresetId;
      }
    }

    if(typeof args.colorPaletteName != 'undefined') {
      colorPaletteName = args.colorPaletteName;
    }



    var colorPalette = null;

    if(typeof args.colorPalette != 'undefined' && args.colorPalette) {
      colorPalettePresetId = false;
      colorPalette = args.colorPalette;
    }

    var tileSetName = 'Tile Set';
    var tileSetPresetId = 'petscii';
    if(typeof args.tileSetPresetId != 'undefined') {
      if(args.tileSetPresetId) {
        tileSetPresetId = args.tileSetPresetId;
      }
    }

    var tileSet = null;
    if(typeof args.tileSetCreated != 'undefined' && args.tileSetCreated) {
      tileSet = args.tileSet;
    }

    if(typeof args.tileSetName != 'undefined') {
      tileSetName = args.tileSetName;
    }

    var gridWidth = 40;
    var gridHeight = 25;

    if(mode == 'nes') {
      gridWidth = 32;
      gridHeight = 30;
      colorPalettePresetId = 'nes';
    }


    if(typeof args.width != 'undefined') {
      gridWidth = args.width;
    }

    if(typeof args.height != 'undefined') {
      gridHeight = args.height;
    }

    if(typeof args.template != 'undefined') {
      // templates not really used??

      // new from a template
      var template = args.template;
      for(var i = 0; i < template.length; i++) {
        this.doc.data.children.push(template[i]);
      }


      var screenName = 'Untitled Screen';
      this.textModeEditor.open('/screens/' + screenName);
      this.textModeEditor.setLayoutType('textmode');

      this.setMode('2d');
      
      this.textModeEditor.setScreenMode(mode);
      this.textModeEditor.fitOnScreen({ minScale: 1 });
      this.textModeEditor.colorPaletteManager.colorPaletteUpdated();
      this.projectNavigator.refresh();
      this.textModeEditor.frames.frameTimeline.resize();
      this.textModeEditor.grid.setUpdateEnabled(true);
      this.textModeEditor.grid.update();
      this.textModeEditor.layers.updateAllLayerPreviews();
      return;
    } else {
      this.createDocumentStructure(this.doc);
      this.doc.createDocRecord('/asm', 'main.asm', 'asm', c64Asm_example);
      this.doc.createDocRecord('/asm/inc', 'macros.asm', 'asm', c64Asm_macro);
      this.doc.createDocRecord('/scripts', 'screen.js', 'script', "");
      this.doc.createDocRecord('/scripts', 'assembler.js', 'script', "");
      this.doc.createDocRecord('/scripts', 'c64.js', 'script', "");
      this.doc.createDocRecord('/config', 'assembler.json', 'json', '{\n  "assembler": "acme",\n  "arguments": "--format cbm",\n  "files": "main.asm",\n  "output": "out.prg",\n  "target": "c64"\n }');
      this.doc.createDocRecord('/config', 'c64.json', 'json', "{\n}");
    }

    if(this.music) {
      this.music.startNew({ "name": "Untitled Music", "defaultInstruments": true });
    }

    var graphicName = 'Untitled Screen';
    this.textModeEditor.graphic.setDrawEnabled(false);
    var graphicArgs = {
      name: graphicName,
      gridWidth: gridWidth,
      gridHeight: gridHeight,
      colorPalettePresetId: colorPalettePresetId,
      colorPalette: colorPalette,
      colorPaletteName: colorPaletteName,
      tileSetPresetId: tileSetPresetId,
      tileSet: tileSet,
      tileSetName: tileSetName
    };

    if(typeof args.screenMode != 'undefined') {
      graphicArgs.screenMode = args.screenMode;
    }

    if(typeof args.canFlipTile != 'undefined') {
      graphicArgs.canFlipTile = args.canFlipTile;
    }

    if(typeof args.canRotateTile != 'undefined') {
      graphicArgs.canRotateTile = args.canRotateTile;
    }
    
    this.textModeEditor.createDoc(graphicArgs, function() {    
        switch(editor) {
          case '3d':
            var gridDepth = 25;

            g_app.textModeEditor.grid3d.createDoc({
              parentPath: '/3d scenes',
              name: graphicName,
              gridWidth: gridWidth,
              gridHeight: gridHeight,
              gridDepth: gridDepth,
              colorPalettePresetId: colorPalettePresetId,
              colorPalette: colorPalette,
              tileSetPresetId: tileSetPresetId,
              tileSet: tileSet
      
            }, function(newDocRecord) {
//              g_app.projectNavigator.refreshTreeNode(parentDocRecord, parentNode);
//              g_app.projectNavigator.treeRoot.refreshChildren();
//              g_app.projectNavigator.selectNodeWithId(newDocRecord.id);
              g_app.projectNavigator.showDocRecord('/3d scenes/' + graphicName);
              
            });      
      
            break;

          default: 
          case 'screen':
            _this.setMode('2d');

//            var textModeEditor = _this.textModeEditor;
            _this.projectNavigator.refresh();

            _this.projectNavigator.showDocRecord('/screens/' + graphicName);
            _this.textModeEditor.graphic.setDrawEnabled(true);
            _this.textModeEditor.graphic.invalidateAllCells();
            _this.textModeEditor.graphic.redraw({allCells: true});
            _this.textModeEditor.layers.updateAllLayerPreviews();    

/*
            // open the new doc, should really just use project navigator show doc record?
            //textModeEditor.open('/screens/' + graphicName);

            
//            textModeEditor.setLayoutType('textmode');
          
            // select the first layer
            var firstLayerId = textModeEditor.layers.getLayerId(0);
            textModeEditor.layers.selectLayer(firstLayerId);
            textModeEditor.fitOnScreen({ minScale: 1 });
            textModeEditor.colorPaletteManager.colorPaletteUpdated();


            // if it's a c64 colour palette, select the default c64 colours
            if(colorPalette.indexOf('c64_') === 0) { 
              textModeEditor.currentTile.setColor(14);
              textModeEditor.currentTile.setBGColor(textModeEditor.colorPaletteManager.noColor);
            } else {
              textModeEditor.currentTile.setColor(1);
              textModeEditor.currentTile.setBGColor(textModeEditor.colorPaletteManager.noColor);          
            }

            _this.projectNavigator.refresh();

            textModeEditor.frames.frameTimeline.resize();

            textModeEditor.graphic.setDrawEnabled(true);
            textModeEditor.graphic.invalidateAllCells();
            textModeEditor.graphic.redraw({allCells: true});
            textModeEditor.layers.updateAllLayerPreviews();
            
            textModeEditor.tools.drawTools.setDrawTool('pen');
            textModeEditor.colorPaletteManager.colorPaletteUpdated();

            // need to set to first non blank (unless all are blank)
//            textModeEditor.currentTile.setCharacters([[ 0 ]]);
            textModeEditor.currentTile.setToFirstBlankTile();

            // need to redraw the tile palette
            //textModeEditor.tileSetManager.redrawCharacters();
            textModeEditor.tools.drawTools.tilePalette.resize();
*/            
            break;
          case 'sprite':
//              _this.textModeEditor.open('/screens/' + graphicName);
//              _this.setMode('2d');

//return;              
            _this.projectNavigator.createSpriteRecord({ 'name': "Untitled Sprite" }, function(spriteRecord) {
              _this.projectNavigator.refresh();
              _this.projectNavigator.showDocRecord('/sprites/Untitled Sprite');
              g_app.textModeEditor.setBackgroundColor(g_app.textModeEditor.colorPaletteManager.noColor);

              _this.textModeEditor.graphic.setDrawEnabled(true);
              _this.textModeEditor.graphic.invalidateAllCells();
              _this.textModeEditor.graphic.redraw({allCells: true});
              _this.textModeEditor.layers.updateAllLayerPreviews();    

            });
            break;
          case 'music': 
//            _this.setMode('music');
            _this.projectNavigator.refresh();
            _this.projectNavigator.showDocRecord('/music/Untitled Music');
            break;
          case 'assembler':

            _this.projectNavigator.refresh();

            _this.projectNavigator.showDocRecord('/asm/main.asm');
//            _this.setMode('assembler');
            break;
          case 'c64':
            _this.projectNavigator.refresh();
            _this.setMode('c64');
            break;          
        }

        // reenable draw
        _this.textModeEditor.graphic.setDrawEnabled(true);


        if(callback) {

          callback();

//          console.error('callback');
        }

//      });
    });
  },

  autosave: function() {
    if(this.doc) {
      g_app.fileManager.autosave();
    }
  },


  showAssembler: function() {
    UI.setWebGLEnabled(false);
    this.assemblerEditor.show();
    this.contentPanel.showOnly('assembler');    
  },

  update: function() {
    if(this.mode === false) {
      return;      
    }


    if(this.mode == '3d' || this.mode == '2d') {
      this.textModeEditor.update();
    }

    if(this.mode == 'assembler') {
      this.assemblerEditor.update();
    }

    if(this.mode == 'music') {
      this.music.update();
    }

    if(this.mode == 'c64') {
      this.c64Debugger.update();
    }
    // api callbacks
    if(TextMode.update) {
      TextMode.update();
    }
  }
}
