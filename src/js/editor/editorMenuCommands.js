// Legacy menu action routing.
// Loaded after editor.js; keeps the legacy Editor global stable while its
// responsibilities are split into focused source files.

Object.assign(Editor.prototype, {
  // Temporary action host for commands that have not moved to their feature yet.
  // Command-owned menus dispatch in UI.MenuItem.click, never back through here.
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
        return this.textModeEditor.cropToSelection();
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
      case 'colorpaletteedit-redo':
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
        if(!this.textModeEditor.layers.canDeleteSelectedLayer()) {
          this.textModeEditor.layers.syncDeleteLayerControls();
          break;
        }
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
        var statsEnabled = !UI.getStatsEnabled();
        UI.setStatsEnabled(statsEnabled);
        UI('view-perfstats').setChecked(statsEnabled);
        UI('view-3dperfstats').setChecked(statsEnabled);
        UI('c64-view-perfstats').setChecked(statsEnabled);

        break;
      case 'help-commonactionshortcuts':
        window.open('./docs/common-action-shortcuts.html', 'common-action-shortcuts');
        break;
      case 'help-keyboardshortcuts':
        this.showKeyboardShortcuts();
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
});
