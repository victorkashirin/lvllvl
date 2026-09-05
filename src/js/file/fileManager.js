var FileManager = function(dependencies) {
  this.editor = null;
  this.persistence = dependencies && dependencies.persistence ? dependencies.persistence : null;


  this.filename = 'Untitled';
  this.saveTo = 'browserStorage';
  this.googleDriveFileId = false;

  this.saveInProgress = false;
  this.gDriveSaveInProgress = false;

  this.isNew = false;


  this.saveAsDialog = null;
  this.saveAsTemplateDialog = null;
  this.downloadAsDialog = null;
  this.newDialog = null;

  this.importCharPad = null;


  this.dropImage = null;

  this.saveButton = null;

  this.desktopFileManager = null;

}

FileManager.prototype = {
  init: function(editor) {
    this.editor = editor;
    if(!this.persistence && editor.services) {
      this.persistence = editor.services.persistence;
    }

    if(g_app.isDesktopApp()) {
      this.desktopFileManager = new DesktopFileManager(this.editor);
    }

    var _this = this;
    UI.on('ready', function(){
      _this.initLoadForm();
      _this.initSaveAsDialog();
//      _this.initSaveAsTemplateDialog();
      _this.initDownloadAsDialog();
//      _this.initNewDialog();
    });
  },

  /*
  initNewDialog: function() {
    var _this = this;

    var width = 260;
    var height = 160;

    if(UI.isMobile.any()) {
      height = 220;
      width = 270;
    }
    this.newDialog = UI.create("UI.Dialog", { "id": "newDialog", "title": "New", "width": width, "height": height });

    this.newHTML = UI.create("UI.HTMLPanel");
    this.newDialog.add(this.newHTML);
    this.newHTML.load('html/newDialog.html', function() {

    });

    this.okButton = UI.create('UI.Button', { "text": "OK", "color": "primary" });
    this.okButton.on('click', function(event) { 
      var mode = $('#newDialogMode').val();//$('input[name=newMode]:checked').val();
      var width = parseInt($('#newDialogWidth').val(), 10);
      var height = parseInt($('#newDialogHeight').val(), 10);

      if(isNaN(width)) {
        width = 40;
      }

      if(isNaN(height)) {
        height = 25;
      }
      var args = {};
      args.mode = mode;
      args.width = width;
      args.height = height;

      _this.newProject(args);

      UI.closeDialog();
    });

    this.closeButton = UI.create('UI.Button', { "text": "Cancel", "color": "secondary" });
    this.closeButton.on('click', function(event) {
      UI.closeDialog();
    });

    this.newDialog.addButton(this.okButton);
    this.newDialog.addButton(this.closeButton);

  },
*/

  initSaveAsDialog: function() {
    var _this = this;

    var width = 380;
    var height = 230;

    if(UI.isMobile.any()) {
      width = 330;
      height = 280;
    }
    this.saveAsDialog = UI.create("UI.Dialog", { "id": "saveProjectAsDialog", "title": "Save As", "width": width, "height": height });

    this.saveAsHTML = UI.create("UI.HTMLPanel");
    this.saveAsDialog.add(this.saveAsHTML);
    this.saveAsDialog.on('close', function() {
      g_app.setAllowKeyShortcuts(true);
      UI.setAllowBrowserEditOperations(false);
      _this.saveInProgress = false;
      _this.saveButton.setEnabled(true);

    });

    this.saveAsHTML.load('html/project/saveProjectAsDialog.html', function() {
      $('#saveProjectAs').focus();
      $('#saveProjectAs').select();

      $('#saveProjectAsDialog .submitOnEnter').on('keypress', function(e) {
        if(e.keyCode == 13) {
          _this.submitForm();
        }
      });

      $('input[name=saveMethod]').on('click', function() {
        var saveMethod = $('input[name=saveMethod]:checked').val();
        _this.setSaveMethod(saveMethod);
      });

    });

    this.saveButton = UI.create('UI.Button', { "text": "Save", "color": "primary" });
    this.saveAsDialog.addButton(this.saveButton);
    this.saveButton.on('click', function(event) {
      _this.submitForm();
    });

    this.closeButton = UI.create('UI.Button', { "text": "Cancel", "color": "secondary" });
    this.saveAsDialog.addButton(this.closeButton);
    this.closeButton.on('click', function(event) {
      UI.closeDialog();
    });

  },

  submitForm: function() {
    var _this = this;
    var args = {};
    args.filename = $('#saveProjectAs').val(); 
    args.saveMethod = 'browserStorage';

    this.saveInProgress = true;
    this.saveButton.setEnabled(false);

    this.saveAs(args, function(result) {
      _this.saveInProgress = false;
      _this.saveButton.setEnabled(true);
      if(result.success) {
        UI.closeDialog();
      }
    });

  },

  connectToGDrive: function() {
    g_app.reportRemoteProviderError('google-drive', new Error('Google Drive is disabled.'));
  },

  checkGDriveAccess: function() {
    $('#saveAsConnectToGDriveButtonSection').hide();
  },

  setSaveMethod: function(saveMethod) {
    this.saveMethod = 'browserStorage';
    $('#saveAsConnectToGDriveButtonSection').hide();
  },

  initDownloadAsDialog: function() {
    var _this = this;

    var width = 400;
    var height = 120;

    if(UI.isMobile.any()) {
      width = 330;
      height = 140;
    }

    this.downloadAsDialog = UI.create("UI.Dialog", { "id": "downloadAsDialog", "title": "Download As", "width": width, "height": height });

    this.downloadAsHTML = UI.create("UI.HTMLPanel");
    this.downloadAsDialog.add(this.downloadAsHTML);
    this.downloadAsHTML.load('html/downloadAsDialog.html', function() {

    });

    this.downloadOkButton = UI.create('UI.Button', { "text": "Download", "color": "primary" });
    this.downloadAsDialog.addButton(this.downloadOkButton);
    this.downloadOkButton.on('click', function(event) {
         
      var args = {};
      args.filename = $('#downloadAs').val(); 
      args.saveMethod = 'download';
      args.setSaveMethod = false;
//      if(_this.saveAs(args)) {
      if(_this.downloadAs(args)) {
        UI.closeDialog();
      }
    });

    this.downloadCloseButton = UI.create('UI.Button', { "text": "Cancel", "color": "secondary" });
    this.downloadAsDialog.addButton(this.downloadCloseButton);
    this.downloadCloseButton.on('click', function(event) {
      UI.closeDialog();
    });
  },  

  /*
  initSaveAsTemplateDialog: function() {
    var _this = this;

    var width = 430;
    var height = 180;

    if(UI.isMobile.any()) {
      width = 200;
      height = 140;
    }

    this.saveAsTemplateDialog = UI.create("UI.Dialog", { "id": "saveAsTemplateDialog", "title": "Save As Template", "width": width, "height": height });

    this.saveAsTemplateHTML = UI.create("UI.HTMLPanel");
    this.saveAsTemplateDialog.add(this.saveAsTemplateHTML);
    this.saveAsTemplateHTML.load('html/saveAsTemplateDialog.html', function() {

    });

    this.okButton = UI.create('UI.Button', { "text": "Save", "color": "primary" });
    this.saveAsTemplateDialog.addButton(this.okButton);
    this.okButton.on('click', function(event) {      
      var args = {};
      args.filename = $('#saveAsTemplate').val(); 
//      _this.saveAs(filename, args);
      if(_this.saveAsTemplate(args)) {
        UI.closeDialog();
      }
    });

    this.closeButton = UI.create('UI.Button', { "text": "Cancel", "color": "secondary" });
    this.saveAsTemplateDialog.addButton(this.closeButton);
    this.closeButton.on('click', function(event) {
      UI.closeDialog();
    });
  },
  */
  
  initLoadForm: function() {
    var html = '<form id="loadDataForm"  style="position: absolute; top: -40px">';
    html += '<input type="file" name="data" size="10" id="loadData" accept=".json,.prg,.ctm,.spd,.c,.zip,.png,.jpg"/>';
    html += '</form>';
    $('body').append(html);

    var _this = this;
    document.getElementById('loadData').addEventListener("change", function(e) {

      var file = document.getElementById('loadData').files[0];
      _this.openFile(file);
    }, false);
  },


  openFile: function(file) {
    var filename = file.name;
    var extension = '';
    var dotPos = filename.lastIndexOf('.');
    if(dotPos != -1) {
      extension = filename.substr(dotPos + 1);
      extension = extension.toLowerCase().trim();
    }
    var fileReader = new FileReader();

    var _this = this;

    switch(extension) {
      case 'jpg':
      case 'png':
        if(this.dropImage == null) {
          this.dropImage = new DropImage();
          //this.dropImage.init()
        }
        this.dropImage.start(file);
        break;

      case 'aco':
      case 'act':
      case 'ase':
      case 'gpl':
      case 'txt':
      case 'hex':
      case 'vpl':
        this.loadColorPalette(file);
        break;

      case 'mp4':
      case 'mov':
        console.log('drag movie!');
        break;
    
      case 'zip':
        g_app.doc = g_app.createDocument();
        g_app.createDocumentStructure( g_app.doc);

        g_app.doc.loadZipFile(file, function() {

        });
        break;
      case 'json':
        fileReader.onload = function(e) {
          _this.loadLocalFile(e.target.result);
          document.getElementById('loadDataForm').reset();  
        }
        fileReader.readAsText(file);
        break;
      case 'ctm':
        fileReader.onload = function(e) {
          var byteArray = new Uint8Array(e.target.result);
          _this.loadCTMFile(byteArray);
          document.getElementById('loadDataForm').reset();  
        }
        fileReader.readAsArrayBuffer(file);
        break;
      case 'c':
        fileReader.onload = function(e) {
          _this.loadCFile(e.target.result);
          document.getElementById('loadDataForm').reset();  
        }
        fileReader.readAsText(file);
        break;
    
      case 'spd':
        fileReader.onload = function(e) {
          var byteArray = new Uint8Array(e.target.result);

          _this.loadSPDFile(byteArray);
          document.getElementById('loadDataForm').reset();  
        }
        fileReader.readAsArrayBuffer(file);
        break;      
      case 'prg':
        /*
        fileReader.onload = function(e) {
          var byteArray = new Uint8Array(e.target.result);
          _this.loadPRGFile(byteArray);
          document.getElementById('loadDataForm').reset();  
        }
        fileReader.readAsArrayBuffer(file);
        */
        this.loadPRGFile(file);
        document.getElementById('loadDataForm').reset();  

        break;
      case 'c64':
        this.loadC64Snapshot(file);
        document.getElementById('loadDataForm').reset();  
        break;
      case 'd64':
        fileReader.onload = function(e) {
          var byteArray = new Uint8Array(e.target.result);
          _this.loadD64File(file.name, byteArray);
          document.getElementById('loadDataForm').reset();  
        }
        fileReader.readAsArrayBuffer(file);
        break;
      case 'crt':
        this.loadCRTFile(file);
        document.getElementById('loadDataForm').reset();  
        break;
      case 'nes':
        fileReader.onload = function(e) {
          var byteArray = new Uint8Array(e.target.result);
          _this.loadNESFile(byteArray);
          document.getElementById('loadDataForm').reset();  
        }
        fileReader.readAsArrayBuffer(file);
        break;
      case 'bas':
        this.loadBasFile(file);
        document.getElementById('loadDataForm').reset();  
        break;
        
      }

  },


  loadColorPalette: function(file) {
    console.log('load colour palette!!');
    if(g_app.doc !== null) {
      if(g_app.textModeEditor.colorPaletteManager.colorPaletteLoad && g_app.textModeEditor.colorPaletteManager.colorPaletteLoad.visible) {
        g_app.textModeEditor.colorPaletteManager.colorPaletteLoad.setImportFile(file);
        return;
      }

      if(g_app.textModeEditor.colorPaletteEdit && g_app.textModeEditor.colorPaletteEdit.visible) {
        g_app.textModeEditor.colorPaletteEdit.dropFile(file);
        return;
      }


      // show the load colour palette dialog
      g_app.textModeEditor.colorPaletteManager.showLoad({
        dialogReadyCallback: function() {
          g_app.textModeEditor.colorPaletteManager.colorPaletteLoad.setImportFile(file);
        }
      });
    } else {
      // need to create the doc
      var args = {};
      args.mode = 'textmode';
      args.width = 40;
      args.height = 25;
      

      g_app.newProject(args, function() {
        // show the load colour palette dialog
        g_app.textModeEditor.colorPaletteManager.showLoad({
          dialogReadyCallback: function() {          
            g_app.textModeEditor.colorPaletteManager.colorPaletteLoad.setImportFile(file);
          }
        });

      });      
    }
  },
  loadNESFile: function(byteArray) {
    g_app.doc = g_app.createDocument();

    var _this = this;
    g_app.newProject({}, function() {

      g_app.projectNavigator.refreshTree();
      g_app.setMode('nes');
      g_app.nesDebugger.loadROM(byteArray);
    });
  },

  loadC64Snapshot: function(file) {
//    g_app.setMode('c64');

    if(g_app.doc !== null) {
      // already doc open
      if(g_app.getMode() == 'assembler') {
        g_app.assemblerEditor.debuggerCompact.loadPRGFile(file);
        g_app.assemblerEditor.debuggerCompact.loadSnapshotFile(file);

      } else {
        g_app.setMode('c64');
        g_app.c64Debugger.loadSnapshotFile(file);

      }

    } else {
      // need to create a doc
      g_app.newProject({}, function() {

        g_app.projectNavigator.refreshTree();
        g_app.setMode('c64');
//        g_app.c64Debugger.loadPRGFile(file);
        g_app.c64Debugger.loadSnapshotFile(file);

      });
    }

    
  },

  loadBasFile: function(file) {
    if(g_app.doc !== null) {
      // already doc open
      g_app.setMode('c64');
      g_app.c64Debugger.loadBASFile(file);

    } else {
      // need to create a doc
      g_app.newProject({}, function() {
        g_app.projectNavigator.refreshTree();
        g_app.setMode('c64');
        g_app.c64Debugger.loadBASFile(file);
      });
    }

    

  },

  loadPRGFile: function(file) {

    if(g_app.doc !== null) {
      // already doc open
      if(g_app.getMode() == 'assembler') {
        g_app.assemblerEditor.debuggerCompact.loadPRGFile(file);
      } else {
        g_app.setMode('c64');
        g_app.c64Debugger.loadPRGFile(file);
      }

    } else {
      // need to create a doc
      g_app.newProject({}, function() {

        g_app.projectNavigator.refreshTree();
        g_app.setMode('c64');
        g_app.c64Debugger.loadPRGFile(file);
      });
    }
  },

  loadCRTFile: function(file) {
    var _this = this;

    if(g_app.doc !== null) {
      // already doc open

      if(g_app.getMode() == 'assembler') {
        g_app.assemblerEditor.debuggerCompact.insertCRT(file);
      } else {
        g_app.setMode('c64');
//        g_app.c64Debugger.setPRG({ prg: byteArray });
        g_app.c64Debugger.insertCRT(file);
      }

    } else {
      // need to create a doc
      g_app.newProject({}, function() {

        g_app.projectNavigator.refreshTree();
        g_app.setMode('c64');
        g_app.c64Debugger.insertCRT(file);
      });
    }
  },


  loadD64File: function(filename, byteArray) {

    var _this = this;

    if(g_app.doc !== null) {
      // already doc open

      if(g_app.getMode() == 'assembler') {
        g_app.assemblerEditor.debuggerCompact.attachD64AsByteArray(filename, byteArray);
      } else {
        g_app.setMode('c64');
        g_app.c64Debugger.autostartD64 = true;
        g_app.c64Debugger.attachD64AsByteArray(filename, byteArray);
      }

    } else {
      // need to create a doc
      g_app.newProject({}, function() {

        g_app.projectNavigator.refreshTree();
        g_app.setMode('c64');
        g_app.c64Debugger.autostartD64 = true;
        g_app.c64Debugger.attachD64AsByteArray(filename, byteArray);
      });
    }
  },

      
  loadCFile: function(content) {
    if(this.importC == null) {
      this.importC = new ImportC();
      this.importC.init(g_app.textModeEditor);
    }
    g_app.doc = g_app.createDocument();

    var _this = this;
    g_app.newProject({}, function() {
      _this.importC.read(content);

      g_app.projectNavigator.refreshTree();

      var dir = g_app.doc.dir('/screens');
      var firstScreen = dir[0].name;
      g_app.textModeEditor.loadScreen('/screens/' + firstScreen);
      _this.importC.doImport();

      g_app.setMode('2d');    

    });
  },

  loadCTMFile: function(byteArray) {

    if(this.importCharPad == null) {
      this.importCharPad = new ImportCharPad();
      this.importCharPad.init(g_app.textModeEditor);
    }
    g_app.doc = g_app.createDocument();

    var _this = this;
    g_app.newProject({}, function() {
      _this.importCharPad.readCharPad(byteArray);

      g_app.projectNavigator.refreshTree();

      var dir = g_app.doc.dir('/screens');
      var firstScreen = dir[0].name;
      g_app.textModeEditor.loadScreen('/screens/' + firstScreen);
      _this.importCharPad.doImport();

      g_app.setMode('2d');    

    });

  },

  loadSPDFile: function(byteArray) {

    if(this.importSpritePad == null) {
      this.importSpritePad = new ImportSpritePad();
      this.importSpritePad.init(g_app.textModeEditor);
    }
    g_app.doc = g_app.createDocument();

    var _this = this;
    g_app.newProject({}, function() {
      
      g_app.projectNavigator.createSpriteRecord({}, function() {
        _this.importSpritePad.readSpritePad(byteArray);

        g_app.projectNavigator.refreshTree();

        var dir = g_app.doc.dir('/sprites');
        var firstScreen = dir[0].name;

//        g_app.textModeEditor.loadScreen('/sprites/' + firstScreen);

        g_app.projectNavigator.showDocRecord('/sprites/' + firstScreen);
        _this.importSpritePad.doImport();

        g_app.setMode('2d');    
      });

    });

  },


  loadLocalFile: function(contents) {
    //if(g_app.doc == null) {
    g_app.doc = g_app.createDocument();
    //}
    
    g_app.doc.loadLocalFile(contents, function() {

      // get the last view from the settings.

      g_app.projectNavigator.refreshTree();

      var dir = g_app.doc.dir('/screens');
      var firstScreen = dir[0].name;
      g_app.textModeEditor.loadScreen('/screens/' + firstScreen);

//      g_app.textModeEditor.loadScreen('/screens/Untitled Screen');

      var settings = g_app.doc.getDocRecord('/settings');
      if(settings) {
        if(typeof settings.data.currentFGColor != 'undefined') {
          g_app.textModeEditor.currentTile.setColor(settings.data.currentFGColor);
        }

        if(typeof settings.data.currentBGColor != 'undefined') {
          g_app.textModeEditor.currentTile.setBGColor(settings.data.currentBGColor);
        }

        if(typeof settings.data.selectedLayerId != 'undefined') {
          g_app.textModeEditor.layers.selectLayer(settings.data.selectedLayerId);
        }
      }
      g_app.setMode('2d');    

      g_app.textModeEditor.tools.drawTools.tilePalette.resize();

    });
    
  },

  openLocalFile: function() {
    document.getElementById('loadData').click();
  },



  getBrowserStorageFileId: function(filename) {
    var directory = localStorage.getItem("directory");
    if(typeof directory == 'undefined' || !directory) {
      return false;
    }
    directory = $.parseJSON(directory);

    var index = false;

    for(var i = 0; i < directory.length; i++) {
      if(directory[i].filename == filename) {
        // found existing...
        return directory[i].fileId;
      }
    } 

    return false;
  },

  loadBrowserStorageProject: function(fileId) {
    var contents = localStorage.getItem(fileId);
    if(!contents) {
      alert('Unable to load file');
      return;
    }
    this.loadLocalFile(contents);
  },

  loadBrowserStorageTemplate: function(fileId) {
    var contents = localStorage.getItem(fileId);
    if(!contents) {
      alert('Unable to load file');
      return;
    }
  
    var data = $.parseJSON(contents);
    var args = { template: data.children };
    g_app.newProject(args);  
  },

  // recursively delete files
  removeBrowserStorageFiles: function(fileList, fileIndex, callback) {

    if(fileIndex >= fileList.length) {
      callback();
    } else {
      var key = fileList[fileIndex++];

      if(true) {
        var _this = this;
        this.persistence.removeRaw(key).catch(function() {}).then(function() {
          _this.removeBrowserStorageFiles(fileList, fileIndex, callback);
        });
      } else {
        this.removeBrowserStorageFiles(fileList, fileIndex, callback);
      }
    }
  },

  checkCacheExpiry: function(callback) {
    var _this = this;
    this.persistence.readRaw('cachedir').then(function(result) {
      var cacheEntries = result;
      if(typeof cacheEntries === 'undefined' || !cacheEntries) {
        cacheEntries = [];
      }

      var timeNow = _this.persistence.clock();
      var newCacheEntries = [];
      var toRemoveKeys = [];
      for(var i = 0; i < cacheEntries.length; i++) {
        var key = cacheEntries[i].key;
        if(key !== 'undefined') {
          if(cacheEntries[i].expiryDate < timeNow) {
            toRemoveKeys.push(cacheEntries[i].key);
          } else {
            newCacheEntries.push(cacheEntries[i]);
          }
        }
      }


      _this.persistence.writeRaw('cachedir', newCacheEntries).then(function() {
        _this.removeBrowserStorageFiles(toRemoveKeys, 0, function() {
          if(typeof callback != 'undefined') {
            callback();
          }
        });
      }).catch(function(error) {
        if(typeof callback != 'undefined') callback(error);
      });

    }).catch(function(error) {
      if(typeof callback != 'undefined') callback(error);
    });

  },

  cacheFile: function(key, file, expirySeconds, callback) {
    var _this = this;


    this.persistence.readRaw('cachedir').then(function(result) {
      var cacheEntries = result;
      if(typeof cacheEntries === 'undefined' || !cacheEntries) {
        cacheEntries = [];
      }

      var keyIndex = false;
      for(var i = 0; i < cacheEntries.length; i++) {
        if(cacheEntries[i].key == key) {
          // found it
          keyIndex = i;
          break;
        }
      }

      var expiryDate = _this.persistence.clock() + expirySeconds * 1000;

      var cacheDirEntry = {
        key: key,
        expiryDate: expiryDate
      }

      if(keyIndex !== false) {
        cacheEntries[keyIndex] = cacheDirEntry;
      } else {
        cacheEntries.push(cacheDirEntry);
      }
      _this.persistence.writeRaw('cachedir', cacheEntries).then(function() {
        return _this.persistence.writeRaw(key, file);
      }).then(function() {
          // success!
          if(typeof callback != 'undefined') {
            callback(null);
          }
      }).catch(function(error) {
        if(typeof callback != 'undefined') callback(error);
      });
    }).catch(function(error) {
      if(typeof callback != 'undefined') callback(error);
    });
  },

  getCacheFile: function(key, callback) {
    var _this = this;
    this.checkCacheExpiry(function() {
      _this.persistence.readRaw(key).then(function(result) {
        if(typeof result == 'undefined') {
          callback(null);
          return;
        }
        callback(result);
      }).catch(function() {
        callback(null);
      });
    });


  },



  autosave: function(callback) {
    var doc = g_app.doc.data;
    var currentEditor = g_app.projectNavigator.getCurrentEditor();
    var thumbnailCanvas = null;
    var thumbnailData = null;

    try {
      if(currentEditor && typeof currentEditor.getThumbnailCanvas !== 'undefined') {
        thumbnailCanvas = currentEditor.getThumbnailCanvas();
        if(thumbnailCanvas) {
          thumbnailData = thumbnailCanvas.toDataURL();
        }
      }
    } catch(error) {
      // A thumbnail is optional; never let a tainted or unavailable canvas
      // prevent the recovery data itself from being saved.
      console.warn('Unable to create autosave thumbnail', error);
    }

    var _this = this;
    var snapshot = {
      data: doc,
      thumbnailData: thumbnailData
    };

    return this.persistence.saveAutosave(snapshot).then(function() {
      _this.clearBrowserStorageError('Autosave');
      var result = { success: true };
      if(typeof callback != 'undefined') {
        callback(result);
      }
      return result;
    }).catch(function(error) {
      _this.showBrowserStorageError('Autosave', error);
      var result = { success: false, error: error };
      if(typeof callback != 'undefined') {
        callback(result);
      }
      return result;
    });
  },


  getAutosaveSummary: function(callback) {
    this.persistence.getAutosaveSummary().then(function(result) {
      callback(result);
    }).catch(function(error) {
      callback({ success: false, error: error });
    });
  },



  // load a cached version
  loadCachedData: function(args, callback) {
    g_app.doc = g_app.createDocument();
    g_app.doc.data = args.data;
    var view = false;
    if(typeof args.view !== 'undefined') {
      view = args.view;
    }

    g_app.projectNavigator.refreshTree();
    var dir = g_app.doc.dir('/screens');

    if(dir && dir.length > 0) {
      var firstScreen = dir[0].name;
  //    g_app.textModeEditor.loadScreen('/screens/' + firstScreen);
      if(view === false) {
        view = '/screens/' + firstScreen;
      }

      view = view.trim();
      if(view.length > 0 && view[0] != '/') {
        view = '/' + view;
      }
    }

    var record = g_app.doc.getDocRecord(view);
    if(!record) {
      // uh oh, the view doesn't exist...
      view = false;
    }

    if(view) {
      g_app.projectNavigator.showDocRecord(view);
    } else {
      g_app.setMode('none');
    }

    if(typeof callback != 'undefined') {
      callback();
    }

  },

  loadAutosave: function() {
    this.persistence.loadAutosaveSnapshot().then(function(snapshot) {
      var result = snapshot && snapshot.data ? snapshot.data : null;
      if(result !== null && typeof result != 'undefined') {

        g_app.doc = g_app.createDocument();
        g_app.doc.data = result;

        g_app.projectNavigator.refreshTree();

        var dir = g_app.doc.dir('/screens');
        var firstScreen = dir[0].name;
        g_app.textModeEditor.loadScreen('/screens/' + firstScreen);

        var settings = g_app.doc.getDocRecord('/settings');
        if(settings) {
          if(typeof settings.data.currentFGColor != 'undefined') {
            g_app.textModeEditor.currentTile.setColor(settings.data.currentFGColor);
          }

          if(typeof settings.data.currentBGColor != 'undefined') {
            g_app.textModeEditor.currentTile.setBGColor(settings.data.currentBGColor);
          }

          if(typeof settings.data.selectedLayerId != 'undefined') {
            g_app.textModeEditor.layers.selectLayer(settings.data.selectedLayerId);
          }
        }
        g_app.setMode('2d');    
      }
    }).catch(function(error) {
      g_app.fileManager.showBrowserStorageError('Autosave recovery', error);
    });
  },

  setProjectName: function(projectName) {
    this.filename = projectName;
  },

  showBrowserStorageError: function(operation, error) {
    var message = operation + ' failed. Your unsaved work is still open. ' +
      'Free some browser storage, use Download As to make a backup, then retry.';
    if(error && error.message) {
      message += ' (' + error.message + ')';
    }

    console.error(message, error);

    var errorPanel = document.getElementById('browserStorageSaveError');
    if(!errorPanel) {
      errorPanel = document.createElement('div');
      errorPanel.id = 'browserStorageSaveError';
      errorPanel.setAttribute('role', 'alert');
      errorPanel.style.position = 'fixed';
      errorPanel.style.left = '12px';
      errorPanel.style.right = '12px';
      errorPanel.style.bottom = '12px';
      errorPanel.style.zIndex = '100000';
      errorPanel.style.padding = '12px';
      errorPanel.style.color = '#fff';
      errorPanel.style.background = '#9c2424';
      errorPanel.style.border = '1px solid #ff8a8a';
      document.body.appendChild(errorPanel);
    }

    errorPanel.textContent = message;
    errorPanel.setAttribute('data-storage-operation', operation);
    errorPanel.style.display = 'block';
  },

  clearBrowserStorageError: function(operation) {
    var errorPanel = document.getElementById('browserStorageSaveError');
    if(errorPanel && (typeof operation == 'undefined' ||
      errorPanel.getAttribute('data-storage-operation') == operation)) {
      errorPanel.style.display = 'none';
    }
  },

  getProjectName: function() {
    return this.filename;
  },

  getFilename: function() {
    return this.filename;
  },

  getIsNew: function() {
    return this.isNew;
  },

  setIsNew: function(isNew) {
    this.isNew = isNew;
  },

  showSaveAs: function() {

    $('#saveAsForm').show();
    $('#saveAsGDriveProgress').hide();


    $('#saveProjectAs').val(this.getFilename());
    this.setSaveMethod('browserStorage');
    $('#saveMethod_browserStorage').prop('checked', true);

    /*
    if(UI.isMobile.any()) {
      $('#saveAsMethod').hide();
    } else {
      $('#saveAsMethod').show();      
    }
    */

    this.checkGDriveAccess();
    
    UI.showDialog("saveProjectAsDialog");
    this.saveInProgress = false;
    this.saveButton.setEnabled(true);


    g_app.setAllowKeyShortcuts(false);
    UI.setAllowBrowserEditOperations(true);

    $('#saveProjectAs').focus();
    $('#saveProjectAs').select();    


    this.saveAsDialog.fitContent();
  },

  showSaveAsTemplate: function() {
    UI.showDialog("saveAsTemplateDialog");
    this.saveAsDialog.fitContent();
  },


  showDownload: function() {
    UI.showDialog("downloadAsDialog");

//    this.saveAsDialog.fitContent();

  },


  showNewDialog: function() {
    /*
    UI.showDialog("newDialog");
    this.newDialog.fitContent();
    */
    var newProjectDialog = g_app.getNewProjectDialog();
    newProjectDialog.show();         
  },



  // user has chosen to save
  saveAs: function(args, callback) {


    var filename = 'Untitled';
    var method = 'browserStorage';

    if(typeof args != 'undefined') {
      if(typeof args.filename != 'undefined') {
        filename = args.filename;
      }

      if(typeof args.saveMethod != 'undefined') {
        method = args.saveMethod;
      }
    }


    var _this = this;


    if(method == 'browserStorage') {
      this.getProjectId({ name: filename, type: 'project', saveTo: method }, function(result) {
        if(!result.success && result.error) {
          callback(result);
          return;
        }
        if(result.success) {
          if(!confirm('A project with this name already exists, do you want to overwrite?')) {
            callback({ success: false });
            return;          
          }
        } 

        // The versioned save replaces an existing project only after the new
        // contents have committed, so Save As never deletes the recovery copy.
        _this.save({ filename: filename, saveTo: method, saveAs: true }, callback);
      });

      return;
    }

    if(method == 'googleDrive') {

      
      if(!g_app.gdrive.checkIsSignedIn()) {
        alert('Please connect to Google Drive first by clicking the \'Connect To Google Drive\' button');
        return;
      }

      var _this = this;

      // check if already exists
      g_app.gdrive.listProjects({ name: filename }, function(projects) {
        var foundId = false;
        _this.googleDriveFileId = false;
        for(var i = 0; i < projects.length; i++) {
          var mimeType = projects[i].mimeType;
          if(projects[i].name == filename || projects[i].name == filename + '.zip') {
            foundId = projects[i].id;
            break;
          }
        }

        if(foundId !== false) {
          if(!confirm('A project with this name already exists, do you want to overwrite?')) {
            callback({ success: false });

            return;
          }
          // overwrite it..
          _this.googleDriveFileId = foundId;
        }
        
        $('#saveAsForm').hide();
        $('#saveAsGDriveProgress').show();

        _this.setIsNew(false); 
        _this.save({ filename: filename, saveTo: method, showProgress: false }, function(result) {

          callback(result);
        });
      });
    }


  },


  

  save: function(args, callback) {

    // if not yet saved, prompt for a filename
    if(this.getIsNew() && (!args || args.saveAs !== true)) {
      this.showSaveAs();
      return;      
    }

    var filename = this.filename;
    var saveTo = this.saveTo;
    var showProgress = true;

    if(typeof args != 'undefined') {
      if(typeof args.filename != 'undefined') {
        filename = args.filename;
      }

      if(typeof args.saveTo != 'undefined') {
        saveTo = args.saveTo;
      }

      if(typeof args.showProgress != 'undefined') {
        showProgress = args.showProgress;
      }
    }

    if(saveTo == 'browserStorage') {
      // call persist storage if it exists
      if(typeof persistStorage != 'undefined') {
        Promise.resolve(persistStorage()).catch(function(error) {
          console.warn('Unable to request persistent browser storage', error);
        });
      }

      var _this = this;
      return g_app.doc.saveToBrowserStorage({filename: filename }, function(result) {
        if(result.success) {
          _this.filename = filename;
          _this.saveTo = saveTo;
          _this.setIsNew(false);
          _this.clearBrowserStorageError();
        }

        if(typeof callback !== 'undefined') {
          callback(result);
        }
      });
    }


    if(saveTo == 'googleDrive') {
      var _this = this;

      if(this.gDriveSaveInProgress) {
        if(typeof callback !== 'undefined') {
          callback({ success: false, error: new Error('Google Drive save already in progress') });
        }
        return;
      }
      this.gDriveSaveInProgress = true;
      try {
        g_app.gdrive.saveProject({
          fileId: this.googleDriveFileId,
          filename: filename,
          showProgress: showProgress
        }, function(result) {
          _this.gDriveSaveInProgress = false;
          if(!result || result.success === false || typeof result.name != 'string') {
            if(typeof callback !== 'undefined') {
              callback(result && result.success === false ? result : {
                success: false,
                error: result && result.error ? result.error : new Error('Google Drive save failed')
              });
            }
            return;
          }
          _this.filename = result.name;
          _this.saveTo = saveTo;
          _this.setIsNew(false);
          var dotPos = _this.filename.lastIndexOf('.');
          if(dotPos !== -1) {
            _this.filename.substr(0, dotPos);
          }
          _this.googleDriveFileId = result.id;
          if(typeof callback !== 'undefined') {
            callback({ success: true });
          }
        });
      } catch(err) {
        _this.gDriveSaveInProgress = false;
        console.warn('Google Drive save failed');
        if(typeof callback !== 'undefined') {
          callback({ success: false, error: new Error('Google Drive save failed') });
        }
      }
    }
  },

  downloadAs: function(args) {
    var filename = args.filename;

    g_app.doc.downloadAs(filename, {});

    return true;
  },

  deleteBrowserStorageProject: function(args, callback) {
    var projectId = args.projectId;
    var _this = this;
    var promise = this.persistence.deleteProject(projectId).then(function() {
      var result = { success: true };
      if(typeof callback != 'undefined') callback(result);
      return result;
    }).catch(function(error) {
      _this.showBrowserStorageError('Deleting project', error);
      var result = { success: false, error: error };
      if(typeof callback != 'undefined') callback(result);
      return result;
    });
    return promise;

  },

  getRepositoryTreeFiles: function(results, treeFiles, localFileList, index, callback) {
    var treeFile = treeFiles[index];


    var localFileIndex = false;
    for(var i = 0; i < localFileList.length; i++) {
      if(localFileList[i].path == treeFile.path && localFileList[i].sha == treeFile.sha) {
        localFileIndex = i;
        break;
      }
    }

    if(localFileIndex === false) {
      // no local copy of file..
      index++;
      if(index >= treeFiles.length) {
        callback();
      } else {
        this.getRepositoryTreeFiles(results, treeFiles, localFileList, index, callback);
      }
      return;
    }  

    var fileId = localFileList[localFileIndex].id;

    var isJson = true;
    if(treeFile.path.indexOf('asm/') === 0
       || treeFile.path.indexOf('scripts/') === 0
       || treeFile.path.indexOf('build/') === 0
       || treeFile.path.indexOf('config/') == 0) {
         isJson = false;
       }
    
    var _this = this;
    this.getBrowserFile({ fileId: fileId }, function(response) {

      var data = false;
      
      if(isJson && isString(response.content)) {
        data = $.parseJSON(response.content);
      } else {
        data = response.content;
      }

      results[treeFile.path] = {
        id: fileId,
        data: data
      }

      index++;
      if(index >= treeFiles.length) {
        callback();
      } else {
        _this.getRepositoryTreeFiles(results, treeFiles, localFileList, index, callback);
      }
    });

  },

  getRepositoryFiles: function(repositoryId, treeFiles, callback) {

    var results = {};
    var _this = this;

    var args = {};
    args.name = repositoryId;
    args.type = 'repository';
    this.getProjectId(args, function(response) {
      if(response.success === false) {
        callback({});
        return;
      } else {
        var projectId = response.projectId;

        _this.getProjectFiles({ projectId: projectId}, function(files) {


//          _this.getRepositoryTreeFiles(results, treeFiles, files.files, 0, function() {
          _this.getRepositoryTreeFiles(results, treeFiles, [], 0, function() {  
            callback(results);
          });
          
              
        });
      }

    });
  },


  saveProjectRepositoryDetails: function(args, callback) {
    var name = this.filename;
    var owner = args.owner;
    var repository = args.repository;
    var _this = this;
    var promise = this.persistence.updateProjectRepository(name, owner, repository).then(function() {
      return { success: true };
    }).catch(function(error) {
      _this.showBrowserStorageError('Saving repository details', error);
      return { success: false, error: error };
    });

    if(typeof callback !== 'undefined') {
      promise.then(callback);
    }
    return promise;
  },

  updateFileSHA: function(repositoryId, treeFiles, files, callback) {
    var projectName = this.filename;
    var _this = this;
    // nned to find the project id 
    this.getProjectId({ name: projectName }, function(result) {
      if(!result.success) {
        callback({ success: false, error: result.error || new Error('Project not found.') });
        return;
      }
      var projectId = result.projectId;
      _this.getProjectFiles({projectId: projectId }, function(result) {
        if(!result.success) {
          callback(result);
          return;
        }
        var files = result.files;

        for(var i = 0; i < treeFiles.length; i++) {
          var filePath = '/' + treeFiles[i].path;
          var sha = treeFiles[i].sha;
          for(var j = 0; j < files.length; j++) {
            if(filePath == files[j].path) {
              files[j].sha = sha;
              break;
            }
          }
        }

        _this.persistence.commitProjectManifest(projectId, files).then(function() {
          callback({ success: true });
        }).catch(function(error) {
          _this.showBrowserStorageError('Saving repository file status', error);
          callback({ success: false, error: error });
        });


      });

    });

  },

  // make sure a name is unique
  getUniqueProjectName: function(name, callback) {
    var projectName = name;

    // get the list of projects to make sure name is unique
    this.getProjectList({ type: 'project' }, function(result) {
      if(!result.success) {
        callback({ success: false, error: result.error });
        return;
      }
      var projects = result.projects;
      var nameFound = true;
      var newName = projectName;
      var nameAttempt = 0;
      while(nameFound) {
        nameFound = false;
        for(var i = 0; i < projects.length; i++) {
          if(projects[i].type == 'project' && projects[i].name == newName) {
            nameFound = true;
            nameAttempt++;
            newName = projectName + '-' + nameAttempt;
            break;
          }
        }
      }
      callback({ success: true, name: newName });
    });
  },


  // Save project-list metadata with the same error contract as file writes.
  saveProject: function(args, callback) {
    var promise = this.persistence.saveProjectMetadata(args).then(function(result) {
      return { success: true, projectId: result.projectId };
    }).catch(function(error) {
      return { success: false, error: error };
    });

    if(typeof callback != 'undefined') {
      promise.then(callback);
    }
    return promise;
  },


  // delete files in the to delete list
  deleteToDeleteList: function(callback, depth) {
    var newDepth = 0;
    if(typeof depth != 'undefined') {
      newDepth = depth;
    }
    if(this.toDeleteList.length == 0 || newDepth > 10000) {
      callback();
      return;
    }
    var project = this.toDeleteList[this.toDeleteList.length - 1];
    var _this = this;
    this.deleteBrowserStorageProject({ projectId: project.id }, function() {
//      this.toDeleteList.length = this.toDeleteList.length - 1;

      if(_this.toDeleteList.length > 0) {
        _this.toDeleteList.length = _this.toDeleteList.length - 1;
        _this.deleteToDeleteList(callback, newDepth++);
      } else {
        callback();
      }
    });
  },


  clearRepositoriesCache: function(callback) {
//    alert('clear repositories cache');
    var _this = this;
    this.getProjectList({ "type": "repository" }, function(results) {
      if(results.success) {
        _this.toDeleteList = results.projects;
        _this.deleteToDeleteList(function() {
            callback();
        });
      }
    });
  },


  getProjectThumbnails: function(callback) {
    if(this.projectThumbnailsLoaded >= this.projectList.length) {
      callback({ success: true, projects: this.projectList });
      this.projectList = [];
      return;
    }

    var _this = this;
    var project = this.projectList[this.projectThumbnailsLoaded];
    var projectId = project.id;

    this.persistence.readThumbnail(projectId).then(function(result) {
      if(_this.projectThumbnailsLoaded < _this.projectList.length) {
        _this.projectList[_this.projectThumbnailsLoaded].thumbnailData = result;
      }
      _this.projectThumbnailsLoaded++;
      _this.getProjectThumbnails(callback);
    }).catch(function(error) {
      callback({ success: false, error: error, projects: [] });
    });
  },


  getProjectList: function(args, callback) {
    var type = 'project';
    var thumbnails = true;

    if(typeof args.type != 'undefined') {
      type = args.type;
    }

    if(typeof args.thumbnails != 'undefined') {
      thumbnails = args.thumbnails;
    }

    var _this = this;

    this.persistence.listProjects(type).then(function(projects) {

      _this.projectList = [];
      if(projects !== 'undefined' && projects != null && typeof projects.length !== 'undefined') {
        for(var i = 0; i < projects.length; i++) _this.projectList.push(projects[i]);
      }

      if(thumbnails) {
        // project thumbnails wanted as well.
        _this.projectThumbnailsLoaded = 0;
        _this.getProjectThumbnails(callback);
      } else {
         callback({ success: true, projects: _this.projectList });
      }
    }).catch(function(error) {
      _this.showBrowserStorageError('Recovering an interrupted save', error);
      callback({ success: false, error: error, projects: [] });
    });

  },



  getProjectId: function(args, callback) {
    var name = args.name;
    var type = 'project';
    if(typeof args.type != 'undefined') {
      type = args.type;
    }

    this.getProjectList({ type: type }, function(result) {
      if(!result.success) {
        callback({ success: false, error: result.error });
        return;
      }

      var projects = result.projects;

      for(var i = 0; i < projects.length; i++) {
        if(projects[i].type == type && projects[i].name == name) {
          callback({ success: true, projectId: projects[i].id });
          return;
        }
      }

      callback({ success: false });
    });

  },

  getBrowserFile: function(args, callback) {
    var fileId = args.fileId;

    var promise = this.persistence.loadBlob(fileId).then(function(result) {
      return { success: true, content: result };
    }).catch(function(error) {
      return { success: false, error: error };
    });

    if(typeof callback != 'undefined') {
      promise.then(callback);
    }
    return promise;
  },

  // get the list of files in the project..
  getProjectFiles: function(args, callback) {
    var projectId = args.projectId;

    var promise = this.persistence.getProjectManifest(projectId).then(function(record) {
      return {
        success: true,
        files: record.files,
        versionKey: record.versionKey
      };
    }).catch(function(error) {
      return { success: false, error: error, files: [] };
    });

    if(typeof callback != 'undefined') {
      promise.then(callback);
    }
    return promise;
  },


  renameProject: function(args, callback) {
    var projectId = args.projectId;
    var name = args.name;

    var _this = this;
    var promise = this.persistence.renameProject(projectId, name).then(function() {
      return { success: true };
    }).catch(function(error) {
      _this.showBrowserStorageError('Renaming project', error);
      return { success: false, error: error };
    });

    if(typeof callback != 'undefined') {
      promise.then(callback);
    }
    return promise;
  },



  // recursively called to open files in this.filesToOpen array

  // this is used by downloadAsZip function
  openFilesFromBrowser: function(callback) {
    if(this.filesToOpen.length == 0) {
      // no files to open...
      callback({});
      return;
    }
    var _this = this;
    var file = this.filesToOpen[this.filesOpenedCount];
    var path = file.path;
    var fileId = file.id;

    this.getBrowserFile( { fileId: fileId }, function(result) {

      if(typeof file.deleted == 'undefined' || file.deleted !== true) {
        _this.openedFiles.push({
          path: path,
          content: result.content
        });
      }
//      console.log(result.content);

      _this.filesOpenedCount++;

      if(_this.filesOpenedCount >= _this.filesToOpen.length) {
        _this.filesOpenedCount = 0;
        _this.filesToOpen = [];

        callback({
        });
      } else {
        _this.openFilesFromBrowser(callback);
      }
    });
  },


  // download zip from start page..
  downloadZip: function(args) {
    var zip = new JSZip();
    var zipFolders = {};

    var files = args.files;
    var projectFilename = args.filename;

    for(var i = 0; i < files.length; i++) {
      var type = 'file';
      var extension = '';
      var dotPos = files[i].path.lastIndexOf('.');
      if(dotPos != -1) {
        extension = files[i].path.substr(dotPos + 1);
      }

      if(extension == '' && files[i].content == '') {
        // prob a folder
        type = 'folder';
      }

      var path = files[i].path.split('/');
      var folderPath = '';
      var parentFolder = zip;

      var folderPathLength = path.length - 1;
      // only include last if its a folder
      if(type == 'folder') {
        folderPathLength++;
      }

      for(var j = 0; j < folderPathLength; j++) {
        if(j != 0) {
          folderPath += '/';
        }
        folderPath += path[j];

        if(typeof zipFolders[folderPath] == 'undefined') {
          parentFolder = parentFolder.folder(path[j]);
          zipFolders[folderPath] = parentFolder;
        } else {
          parentFolder = zipFolders[folderPath];
        }
      }

      // if its not a folder, add it to the zip
      if(type != 'folder') {
        var filename = path[path.length - 1];
        var extension = '';
        var pos = filename.lastIndexOf('.');
        if(pos !== -1) {
          extension = filename.substr(pos + 1).toLowerCase();
        }

        var content = '';
        if(extension == 'prg' || extension == 'bin') {
          // binary file..
          parentFolder.file(filename, files[i].content, { base64: true });
        } else {
          if(typeof files[i].content !== 'string') {
            content = JSON.stringify(files[i].content);
          } else {
            content = files[i].content;
          }
          parentFolder.file(filename, content);
        }
      }
    }

    zip.generateAsync({
      type:"blob" ,
      compression: "DEFLATE",
      compressionOptions: {
          level: 9
      }
      
    }).then(function (blob) {
      /*
      if(typeof callback != 'undefined') {
        callback(blob);
      }
      */
      download(blob, projectFilename + ".zip", "application/zip");
    });   


    
  },

  downloadProject: function(args) {
    var projectId = args.projectId;
    var _this = this;
    var filename = args.filename;

    // get the list of files in the project
    this.getProjectFiles({ projectId: projectId }, function(result) {
      _this.filesToOpen = result.files;
      _this.filesOpenedCount = 0;
      _this.openedFiles = [];

      console.log(result.files);
      _this.openFilesFromBrowser(function(result) {
        console.log(_this.openedFiles);
        _this.downloadZip({filename: filename, files: _this.openedFiles});


      });

    });

  },

}




/* ----------------------------------------------------------------------------------------------  */


var ImportOld = function() {
  this.editor = null;

}

ImportOld.prototype = {
  init: function(editor) {
    this.editor = editor;
  },

  getGuid: function() {

    var guid = generateUUID();
    return guid;
  },


  read: function(data) {
//    var data =  $.parseJSON(content);
    console.log(data);


    var gridWidth = 40;
    var gridHeight = 25;
    var tileHeight = 8;
    var tileWidth = 8;
    var tileSetId = this.getGuid();
    var colorPaletteId = this.getGuid();
    var colorPerMode = 'cell';
    var screenMode = 'textmode';

    for(var i = 0; i < data.children.length; i++) {
      data.children[i].id = this.getGuid();


      if(data.children[i].name == 'screens') {      
      }


      if(data.children[i].name == 'color palettes') {

        data.children[i].children[0].id = colorPaletteId;        
      }

      if(data.children[i].name == 'tile sets') {
        data.children[i].children[0].id = tileSetId;
        tileWidth = data.children[i].children[0].data.width;
        tileHeight = data.children[i].children[0].data.height;

        // check blocks..
        for(var j = 0; j < data.children[i].children[0].children.length; j++) {
          if(data.children[i].children[0].children[j].name == 'block sets') {
            for(var k = 0; k < data.children[i].children[0].children[j].children.length; k++) {
              if(data.children[i].children[0].children[j].children[k].type == 'block set') {
                var blockSet = data.children[i].children[0].children[j].children[k].data;
                for(var blockIndex = 0; blockIndex < blockSet.blocks.length; blockIndex++) {
                  var blockData = blockSet.blocks[blockIndex].data;
                  for(var y = 0; y < blockData.length; y++) {
                    for(var x = 0; x < blockData[y].length; x++) {
                      blockData[y][x].t = blockData[y][x].c;
                      delete blockData[y][x].c;
                    }
                  }
                }
              }

            }
          }

        }

      }
    }

    var screenData = {};

    screenData.children = [];
    screenData.data = {};
    screenData.id = this.getGuid();
    screenData.type = "graphic";


    for(var i = 0; i < data.children.length; i++) {
      if(data.children[i].name == 'screens') {
        var screenDataOld = data.children[i].children[0];

        screenData.name = screenDataOld.name;
        screenMode = screenDataOld.screenMode;

        if(typeof screenDataOld.colorPerMode != 'undefined') {
          colorPerMode = screenDataOld.colorPerMode;
        }
        if(screenMode == 'monochrome') {
          screenMode = 'textmode';
        }

        var framesOld = screenDataOld.data.frames;
        var layersOld = screenDataOld.data.layers;

        gridWidth = screenDataOld.data.width;
        gridHeight = screenDataOld.data.height;

        var frames = [];
        var layers = [];

        for(var j = 0; j < layersOld.length; j++) {

          var layerOld = layersOld[j];
          var layerId = this.getGuid();//layerOld.layerId;
          var type = layerOld.type;
          if(type == 'background') {
            //type = 'grid';
          }


          var blockMode = false;
          var cellHeight = tileHeight;
          var cellWidth = tileWidth;

          var layer = {
            blockMode: blockMode,
            cellHeight: tileHeight,
            cellWidth: tileWidth,
            colorPaletteId: colorPaletteId,
            colorPerMode: colorPerMode,
            compositeOperation: layerOld.compositeOperation,
            gridHeight: gridHeight,
            gridWidth: gridWidth,
            label: layerOld.label,
            layerId: layerId,
            opacity: layerOld.opacity,
            screenMode: screenMode,
            tileSetId: tileSetId,
            type: type,          
            visible: layerOld.visible,          
            frames: []

          };

          if(type !== 'background') {
            layers.push(layer);
          }

        }

        var firstLayer = true;

        for(var j = 0; j < framesOld.length; j++) {
          frames.push({ duration: framesOld[j].duration });
          for(var k = 0; k < layersOld.length; k++) {
            var gridData = [];
            var backgroundColor = -1;
            var borderColor = -1;

            if(layersOld[k].type == 'background') {
              backgroundColor = framesOld[j].bgColor;
              borderColor = framesOld[j].borderColor;

              for(var y = 0; y < gridHeight; y++) {
                gridData[y] = [];
                for(var x = 0; x < gridWidth; x++) {

                  var cellData = {
                    t: 32,
                    fc: 0,
                    bc: -1,
                    fh: 0,
                    fv: 0

                  };

                  gridData[y].push(cellData);

                }
              }

            } else {
              var gridZ = layersOld[k].gridZ;
              var gridDataOld = framesOld[j].data[gridZ];
            
              for(var y = 0; y < gridDataOld.length; y++) {
                gridData[y] = [];
                for(var x = 0; x < gridDataOld[y].length; x++) {
                  var cellData = {};
                  for(var key in gridDataOld[y][x]) {
                    if(key == 'c') {
                      cellData['t'] = gridDataOld[y][x]['c'];
                    } else {
                      cellData[key] = gridDataOld[y][x][key];
                    }
                  }
                  gridData[y][x] = cellData;
                }
              }          


              var frameData = {
                data: gridData
              };

              frameData.bgColor = framesOld[j].bgColor;
              frameData.borderColor = framesOld[j].borderColor;
              frameData.c64Multi1Color = framesOld[j].c64Multi1Color;
              frameData.c64Multi2Color = framesOld[j].c64Multi2Color;

              layers[k-1].frames.push(frameData);



            }



          }
        }

        screenData.data.width = tileWidth * gridWidth;
        screenData.data.height = tileHeight * gridHeight;
        screenData.data.frames = frames;
        screenData.data.layers = layers;


        data.children[i].children[0] = screenData;
      }
    }

  }
}
