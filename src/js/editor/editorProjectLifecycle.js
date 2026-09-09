// Project document creation, reset, and initialization.
// Loaded after editor.js; keeps the legacy Editor global stable while its
// responsibilities are split into focused source files.

Object.assign(Editor.prototype, {
  createDocument: function() {
    var doc = new Document({ documentSession: this.services.createDocumentSession() });
    doc.init(this);
    return doc;
  },

  isCurrentProject: function(doc, generation) {
    if(!doc || this.doc !== doc) {
      return false;
    }

    return typeof generation == 'undefined' || generation === this.projectGeneration;
  },

  beginProjectTransition: function() {
    this.closeProject();
    this.openingProject = true;
    return this.projectGeneration;
  },

  resetEditorDocumentState: function(editor) {
    if(!editor) {
      return;
    }

    if(typeof editor.doc != 'undefined') {
      editor.doc = null;
    }
    if(typeof editor.path != 'undefined') {
      editor.path = false;
    }
    if(typeof editor.currentFile != 'undefined') {
      editor.currentFile = null;
    }

    // Keep the editor widgets alive, but remove their old source session.
    // CodeEditor emits change when its value changes; with doc cleared above
    // that event cannot write into the detached project.
    if(editor.codeEditor && typeof editor.codeEditor.setValue == 'function') {
      editor.codeEditor.setValue('');
    }
    if(editor.codeEditor && typeof editor.codeEditor.clearAnnotations == 'function') {
      editor.codeEditor.clearAnnotations();
    }
  },


  openProject: function(args) {
    args = args || {};
    var _this = this;
    var generation = this.beginProjectTransition();
    var projectId = args.projectId;
    var projectName = args.projectName;
    var path = args.currentPath;
    var projectNavVisible = args.projectNavVisible;
    var githubOwner = args.githubOwner;
    var githubRepository = args.githubRepository;

    // whether to check github for updates.
//    var githubCheck = args.githubCheck;
    var doc = this.createDocument();
    this.doc = doc;
    doc.projectGuard = function() {
      return _this.isCurrentProject(doc, generation);
    };
    this.createDocumentStructure(doc);

    var openArgs = Object.assign({}, args, {
      isCurrent: function() {
        return _this.isCurrentProject(doc, generation);
      }
    });
    doc.projectGuard = openArgs.isCurrent;
    doc.openBrowserStorageProject(openArgs, function(result) {
      if(!_this.isCurrentProject(doc, generation)) {
        return;
      }
      if(result && result.success === false) {
        _this.openingProject = false;
        return;
      }

      _this.fileManager.filename = projectName;
      _this.fileManager.saveTo = 'browserStorage';
      _this.fileManager.googleDriveFileId = false;
      _this.fileManager.setIsNew(false);
      var settings = doc.getDocRecord('/settings');
      if(settings) {
        settings.data.filename = projectName;
      }

      _this.projectNavigator.refreshTree();

      // if path has been passed in args, check it's valid
      // if valid, then show it
      var pathSet = false;
      if(typeof path != 'undefined' && path !== false) {
        // does the path exist?
        var record = doc.getDocRecord(path);
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
        var dir = doc.dir('/screens');
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
    this.projectGeneration++;
    this.openingProject = false;

    // The image importer is an asynchronously loaded overlay rather than a
    // normal dialog. Close it explicitly at the project boundary so its
    // retained image/worker state cannot survive into the next project.
    if(this.services && this.services.imageImportCoordinator &&
        typeof this.services.imageImportCoordinator.isActive == 'function' &&
        this.services.imageImportCoordinator.isActive() &&
        typeof this.closeImageImport == 'function') {
      void this.closeImageImport();
    }

    // Dialogs and popups can retain callbacks into the old document.  Close
    // them after invalidating the generation so any close handlers are unable
    // to commit stale edits into the next project.
    if(typeof UI !== 'undefined') {
      if(typeof UI.closeAllDialogs == 'function') {
        UI.closeAllDialogs();
      }
      if(typeof UI.hidePopup == 'function') {
        UI.hidePopup();
      }
    }

    if(this.services && this.services.commands) {
      this.services.commands.cleanup({ source: 'project-transition' });
    }

    if(this.fileManager && typeof this.fileManager.resetProjectState == 'function') {
      this.fileManager.resetProjectState();
    }

    if(this.textModeEditor) {
      if(this.textModeEditor.colorPaletteManager) {
        this.textModeEditor.colorPaletteManager.reset();
        this.textModeEditor.colorPaletteManager.clearProjectMenu();
      }
      if(this.textModeEditor.tileSetManager) {
        this.textModeEditor.tileSetManager.reset();
        this.textModeEditor.tileSetManager.clearProjectMenu();
      }
      var resetProjectObject = function(object) {
        if(object && typeof object.resetProjectState == 'function') {
          object.resetProjectState();
        }
      };
      resetProjectObject(this.textModeEditor.tools);
      resetProjectObject(this.textModeEditor.spriteFramesMobile);
      resetProjectObject(this.textModeEditor.animationPreview);
      resetProjectObject(this.textModeEditor.gridInfo);
      resetProjectObject(this.textModeEditor.colorEditor);
      resetProjectObject(this.textModeEditor.colorPalettePanel);
      resetProjectObject(this.textModeEditor.colorPaletteEdit);
      resetProjectObject(this.textModeEditor.tilePaletteEditor);
      resetProjectObject(this.textModeEditor.tileEditor);
      resetProjectObject(this.textModeEditor.tileEditorMobile);
      resetProjectObject(this.textModeEditor.blockEditor);
      resetProjectObject(this.textModeEditor.replaceColorDialog);
      resetProjectObject(this.textModeEditor.replaceCharacterDialog);
      resetProjectObject(this.textModeEditor.chooseColorsDialog);
      resetProjectObject(this.textModeEditor.chooseCharactersDialog);
      resetProjectObject(this.textModeEditor.tilePickerPopup);
      resetProjectObject(this.textModeEditor.tools && this.textModeEditor.tools.drawTools &&
        this.textModeEditor.tools.drawTools.tilePalette);
      resetProjectObject(this.textModeEditor.tools && this.textModeEditor.tools.drawTools &&
        this.textModeEditor.tools.drawTools.blockPalette);
      resetProjectObject(this.textModeEditor.sideTilePalette);
      resetProjectObject(this.textModeEditor.sideBlockPalette);
      resetProjectObject(this.textModeEditor.tilePaletteMobile);
      resetProjectObject(this.textModeEditor.currentTile &&
        this.textModeEditor.currentTile.tilePaletteChooserMobile);
      this.textModeEditor.doc = null;
      this.textModeEditor.projectDocument = null;
      this.textModeEditor.projectGeneration = undefined;
      this.textModeEditor.path = false;
      this.textModeEditor.editorMode = 'tile';
      this.textModeEditor.screenMode = TextModeEditor.Mode.TEXTMODE;
      this.textModeEditor.shiftDown = false;
      this.textModeEditor.altDown = false;
      this.textModeEditor.ctrlDown = false;
      this.textModeEditor.cmdDown = false;
      this.textModeEditor.history = null;
      this.textModeEditor.histories = {};
      if(this.textModeEditor.currentTile && typeof this.textModeEditor.currentTile.resetProjectState == 'function') {
        this.textModeEditor.currentTile.resetProjectState();
      }
      if(this.textModeEditor.frames && typeof this.textModeEditor.frames.resetProjectState == 'function') {
        this.textModeEditor.frames.resetProjectState();
      }
      if(this.textModeEditor.graphic) {
        if(typeof this.textModeEditor.graphic.resetProjectState == 'function') {
          this.textModeEditor.graphic.resetProjectState();
        } else {
          this.textModeEditor.graphic.doc = null;
          this.textModeEditor.graphic.frames = [];
          this.textModeEditor.graphic.frameCount = 0;
          this.textModeEditor.graphic.currentFrame = 0;
        }
      }
      if(this.textModeEditor.grid3d && typeof this.textModeEditor.grid3d.resetProjectState == 'function') {
        this.textModeEditor.grid3d.resetProjectState();
      }
      if(this.textModeEditor.grid && typeof this.textModeEditor.grid.resetProjectState == 'function') {
        this.textModeEditor.grid.resetProjectState();
      }
      if(this.textModeEditor.gridView2d && typeof this.textModeEditor.gridView2d.resetProjectState == 'function') {
        this.textModeEditor.gridView2d.resetProjectState();
      }
      if(this.textModeEditor.blockSetManager && typeof this.textModeEditor.blockSetManager.resetProjectState == 'function') {
        this.textModeEditor.blockSetManager.resetProjectState();
      }
      if(this.textModeEditor.backgroundImage && typeof this.textModeEditor.backgroundImage.resetProjectState == 'function') {
        this.textModeEditor.backgroundImage.resetProjectState();
      }
      if(this.textModeEditor.importC64Formats && typeof this.textModeEditor.importC64Formats.resetProjectState == 'function') {
        this.textModeEditor.importC64Formats.resetProjectState();
      }
      if(this.textModeEditor.importC64SpriteFormats && typeof this.textModeEditor.importC64SpriteFormats.resetProjectState == 'function') {
        this.textModeEditor.importC64SpriteFormats.resetProjectState();
      }
      if(this.textModeEditor.importSpriteImage && typeof this.textModeEditor.importSpriteImage.resetProjectState == 'function') {
        this.textModeEditor.importSpriteImage.resetProjectState();
      }
      if(this.textModeEditor.referenceImageDialog && typeof this.textModeEditor.referenceImageDialog.resetProjectState == 'function') {
        this.textModeEditor.referenceImageDialog.resetProjectState();
      }
      if(this.textModeEditor.referenceImageDialogMobile && typeof this.textModeEditor.referenceImageDialogMobile.resetProjectState == 'function') {
        this.textModeEditor.referenceImageDialogMobile.resetProjectState();
      }
      if(this.textModeEditor.layers) {
        if(typeof this.textModeEditor.layers.resetProjectState == 'function') {
          this.textModeEditor.layers.resetProjectState();
        }
        this.textModeEditor.layers.layers = [];
        this.textModeEditor.layers.layerObjects = Object.create(null);
        this.textModeEditor.layers.layerRefs = [];
        this.textModeEditor.layers.selectedLayerId = false;
      }
    }

    if(this.assemblerEditor && typeof this.assemblerEditor.resetProjectState == 'function') {
      this.assemblerEditor.resetProjectState();
    }
    if(this.assembler && typeof this.assembler.resetProjectState == 'function') {
      this.assembler.resetProjectState();
    }
    if(this.scripting && typeof this.scripting.resetProjectState == 'function') {
      this.scripting.resetProjectState();
    }
    this.resetEditorDocumentState(this.assemblerEditor);
    this.resetEditorDocumentState(this.scriptEditor);
    this.resetEditorDocumentState(this.jsonEditor);
    this.resetEditorDocumentState(this.textEditor);
    this.resetEditorDocumentState(this.colorPaletteEditor);
    this.resetEditorDocumentState(this.tileSetEditor);
    if(this.colorPaletteEditor && typeof this.colorPaletteEditor.resetProjectState == 'function') {
      this.colorPaletteEditor.resetProjectState();
    }
    if(this.tileSetEditor && typeof this.tileSetEditor.resetProjectState == 'function') {
      this.tileSetEditor.resetProjectState();
    }
    if(this.music && typeof this.music.resetProjectState == 'function') {
      this.music.resetProjectState();
    }
    this.resetEditorDocumentState(this.music);
    this.resetEditorDocumentState(this.hexEditor);
    if(this.hexEditor) {
      this.hexEditor.data = false;
    }
    if(this.c64Debugger && typeof this.c64Debugger.resetProjectState == 'function') {
      this.c64Debugger.resetProjectState();
    }
    if(this.assemblerEditor && this.assemblerEditor.debuggerCompact &&
        this.assemblerEditor.debuggerCompact !== this.c64Debugger &&
        typeof this.assemblerEditor.debuggerCompact.resetProjectState == 'function') {
      this.assemblerEditor.debuggerCompact.resetProjectState();
    }

    if(this.github && typeof this.github.setRepositoryDetails == 'function') {
      this.github.setRepositoryDetails(false, false);
    }

    if(this.projectNavigator && typeof this.projectNavigator.resetProjectState == 'function') {
      this.projectNavigator.resetProjectState();
    }
    if(this.projectNavigatorMobile && typeof this.projectNavigatorMobile.resetProjectState == 'function') {
      this.projectNavigatorMobile.resetProjectState();
    }

    this.doc = null;
    if(this.projectNavigator) {
      this.projectNavigator.refresh(null);
      this.projectNavigator.currentPath = false;
    }

    // A project switch is a privacy boundary. Queue the clear behind any
    // autosave currently being committed so an old snapshot cannot reappear
    // after this transition.
    if(this.fileManager && typeof this.fileManager.clearAutosave == 'function') {
      this.fileManager.clearAutosave();
    }

  },


  newProject: function(args, callback) {
    args = args || {};
    var _this = this;

    var generation = this.beginProjectTransition();
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


    var doc = this.createDocument();
    this.doc = doc;
    doc.projectGuard = function() {
      return _this.isCurrentProject(doc, generation);
    };

    // load the colour palette and tile set
    var colorPalettePresetId = 'c64_colodore';
    var colorPaletteName = 'Color Palette';

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
      this.openingProject = false;
      if(callback) {
        callback();
      }
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

    graphicArgs.document = doc;
    graphicArgs.projectGeneration = generation;
    this.textModeEditor.createDoc(graphicArgs, function() {
        if(!_this.isCurrentProject(doc, generation)) {
          return;
        }
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
              tileSet: tileSet,
              document: doc,
              projectGeneration: generation

            }, function(newDocRecord) {
//              g_app.projectNavigator.refreshTreeNode(parentDocRecord, parentNode);
//              g_app.projectNavigator.treeRoot.refreshChildren();
//              g_app.projectNavigator.selectNodeWithId(newDocRecord.id);
              if(!_this.isCurrentProject(doc, generation)) {
                return;
              }
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
              if(!_this.isCurrentProject(doc, generation)) {
                return;
              }
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
            _this.projectNavigator.currentEditor = _this.c64Debugger;
            _this.setMode('c64');
            break;
        }

        // reenable draw
        _this.textModeEditor.graphic.setDrawEnabled(true);


        if(callback) {

          callback();

//          console.error('callback');
        }

        _this.openingProject = false;

//      });
    });
  },
});
