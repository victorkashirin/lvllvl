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
  this.overviewMode = false;
  this.overviewModeState = null;

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
  // Incremented whenever the active document changes.  Asynchronous loads,
  // preset imports, and saves use this generation to ignore stale callbacks
  // from a project that is no longer visible.
  this.projectGeneration = 0;

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
