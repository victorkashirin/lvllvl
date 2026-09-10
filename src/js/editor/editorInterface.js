// Editor interface construction and responsive layout.
// Loaded after editor.js; keeps the legacy Editor global stable while its
// responsibilities are split into focused source files.

Object.assign(Editor.prototype, {
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

  showKeyboardShortcuts: function() {
    if(this.services && this.services.shortcutSettings) {
      this.services.shortcutSettings.show();
    }
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
      menu.addItem({ "label": "New Project...", "id": "file-new", "commandId": "project.new" });//, "shortcut": { "key": 'N', "cmd": true } });
//      menu.addItem({ "label": "Open Project...", "id": "file-open" });
//      menu.addItem({ "label": "Home", "id": "home-page" });
//      menu.addSeparator({  });

      if(SHOWUNFINISHED && g_paramEditor != 'assembler') {
        menu.addItem({ "label": "Project Explorer" + "...", "id": "show-project-explorer", "commandId": "view.projectExplorer", "shortcut": { "cmd": true, "key": "P" } });
        menu.addSeparator({  });
      }

      menu.addItem({ "label": "Save", "id": "file-save", "commandId": "project.save", "shortcut": { "key": 'S', "cmd": true } });
      menu.addItem({ "label": "Save As...", "id": "file-saveas", "commandId": "project.saveas", "shortcut": { "key": 'S',  "cmd": true, "shift": true } });

      menu.addItem({ "label": "Download Project...", "id": "file-download", "commandId": "project.download", "shortcut": { "key": 'D',  "shift": true, "cmd": true, "shift": true } });
      //menu.addItem({ "label": "C64", "id": "edit-c64", "shortcut": { "cmd": true, "key": "L"} });

      menu.addSeparator({  });
      menu.addItem({ "label": "Create A Template Link...", "id": "file-templateLink", "commandId": "project.templateLink" });

//      menu.addSeparator({  });
//      menu.addItem({ "label": "Go To Home Screen", "id": "project-home" });

  //    menu.addItem({ "label": "Save As Template...", "id": "file-saveastemplate" });

      menu = _this.menuBar.addMenu({"label": "Edit", "className": 'ui-menu-tilemode ui-menu-3d' });

      menu.addItem({ "label": "Undo", "id": "edit-undo", "commandId": "edit.undo", "shortcut": { "cmd": true, "key": "Z" } });
      menu.addItem({ "label": "Redo", "id": "edit-redo", "commandId": "edit.redo", "shortcut": { "cmd": true, "shift": true, "key": "Z" } });
      menu.addSeparator({  });
      menu.addItem({ "label": "Cut", "id": "edit-cut", "commandId": "edit.cut", "shortcut": { "cmd": true, "key": "X" } });
      menu.addItem({ "label": "Copy", "id": "edit-copy", "commandId": "edit.copy", "shortcut": { "cmd": true, "key": "C" } });
      menu.addItem({ "label": "Copy as Image To Clipboard", "id": "edit-copyimage", "commandId": "edit.copyimage", "shortcut": { "cmd": true, "key": "I" } });
      menu.addItem({ "label": "Paste", "id": "edit-paste", "commandId": "edit.paste", "shortcut": { "cmd": true, "key": "V" } });
      menu.addItem({ "label": "Clear All", "id": "edit-clearall", "commandId": "edit.clearall", "shortcut": { "key": "Del" } });
      menu.addItem({ "label": "Clear...", "id": "edit-clear", "commandId": "edit.clear" });
      menu.addItem({ "label": "Select All", "id": "edit-selectall", "commandId": "edit.selectAll", "shortcut": { "cmd": true, "key": "A" } });
      menu.addItem({ "label": "Deselect", "id": "edit-deselect", "commandId": "edit.deselect", "shortcut": { "cmd": true, "key": "D" } });
      menu.addSeparator({  });
      menu.addItem({ "label": "Flip H", "id": "edit-fliph", "commandId": "edit.fliph" });//, "shortcut": { "key": "F" } });
      menu.addItem({ "label": "Flip V", "id": "edit-flipv", "commandId": "edit.flipv" });//, "shortcut": { "key": "G" } });

      menu.addItem({ "label": "Replace Color" + "...", "id": "edit-replaceColor", "commandId": "edit.replaceColor"});
      menu.addItem({ "label": "Replace Tile" + "...", "id": "edit-replaceCharacter", "commandId": "edit.replaceCharacter"});
      menu.addItem({ "label": "Clear Hidden Tiles" + "...", "id": "edit-clearHiddenTiles", "commandId": "edit.clearHiddenTiles"});


      menu = _this.menuBar.addMenu({"label": "Edit", "className": 'ui-menu-colorpalette' });
      menu.addItem({ "label": "Undo", "id": "colorpaletteedit-undo", "commandId": "edit.undo", "shortcut": { "cmd": true, "key": "Z" } });
      menu.addItem({ "label": "Redo", "id": "colorpaletteedit-redo", "commandId": "edit.redo", "shortcut": { "cmd": true, "shift": true, "key": "Z" } });

      /*
      menu.addSeparator({  });
      menu.addItem({ "label": "Toggle Editor Mode", "id": "edit-toggleMode"});
      */

      menu = _this.menuBar.addMenu({"label": "Export", "className": 'ui-menu-tilemode' });
      menu.addSeparator({ "label": "Visual Formats" });
      menu.addItem({ "label": "GIF / PNG...", "id": "export-image", "commandId": "export.image" });
      menu.addItem({ "label": "GIF / Video (legacy)...", "id": "export-gif", "commandId": "export.gif" });

      menu.addItem({ "label": "Sprite Sheet (PNG)...", "id": "export-png", "commandId": "export.png" });



      menu.addItem({ "label": "SVG...", "id": "export-svg", "commandId": "export.svg" });

      menu.addSeparator({ "label": "C64 Formats" });
      menu.addItem({ "label": "C64 PRG / D64...", "id": "export-prg", "commandId": "export.prg" });
      menu.addItem({ "label": "C64 Player Source / PRG (experimental)...", "id": "export-c64", "commandId": "export.c64" });

      menu.addItem({ "label": "C64 Assembly Source" + "...", "id": "export-c64assembly", "commandId": "export.c64assembly" });
      menu.addItem({ "label": "Mega65 Assembly Source" + "...", "id": "export-mega65assembly", "commandId": "export.mega65assembly" });
      menu.addItem({ "label": "X16 Assembly Source" + "...", "id": "export-x16assembly", "commandId": "export.x16assembly" });
      //menu.addItem({ "label": "C64 PRG Advanced...", "id": "export-prgadvanced" });
      menu.addItem({ "label": "SEQ...", "id": "export-seq", "commandId": "export.seq" });
      menu.addItem({ "label": "PETSCII C...", "id": "export-petsciic", "commandId": "export.petsciic" });
      menu.addItem({ "label": ".PET...", "id": "export-pet", "commandId": "export.pet" });
      menu.addItem({ "label": "CharPad V5...", "id": "export-charpad", "commandId": "export.charpad" });

      menu.addItem({ "label": "SpritePad...", "id": "export-spritepad", "commandId": "export.spritepad" });

      if(SHOWUNFINISHED) {
        menu.addSeparator({ "label": "X16 Formats" });
        menu.addItem({ "label": "X16 Basic" + "...", "id": "export-x16basic", "commandId": "export.x16basic" });
      }

      menu.addSeparator({ "label": "Dev Formats" });
      menu.addItem({ "label": "JSON...", "id": "export-json", "commandId": "export.json" });
      menu.addItem({ "label": "Binary Data" + "...", "id": "export-binary", "commandId": "export.binary" });
      menu.addItem({ "label": "TXT...", "id": "export-txt", "commandId": "export.txt" });

      menu = _this.menuBar.addMenu({"label": "Export", "className": 'ui-menu-3d' });
      menu.addSeparator({ "label": "Visual Formats" });
      menu.addItem({ "label": "GIF" + "...", "id": "export-3d-gif", "commandId": "export.3d-gif" });
      menu.addItem({ "label": "OBJ" + "...", "id": "export-obj", "commandId": "export.obj" });
      menu.addItem({ "label": "MagicaVoxel" + "...", "id": "export-magicavoxel", "commandId": "export.magicavoxel" });


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
        "commandId": "import.image",
        "shortcut": { "alt": true, "shift": true, "key": "I" }
      });
//      menu.addItem({ "label": "Video...", "id": "import-video" });

//      menu.addItem({ "label": "ANSI File...", "id": "import-ansi" });

//      menu.addItem({ "label": "PRG...", "id": "import-prg" });
//      menu.addItem({ "label": "VICE Snapshot...", "id": "import-vice" });
      menu.addItem({ "label": "C64 Formats" + "...", "id": "import-c64formats", "commandId": "import.c64formats" });
      menu.addItem({ "label": "C64 Formats" + "...", "id": "import-c64spriteformats", "commandId": "import.c64spriteformats" });
      menu.addItem({ "label": "Image" + "...", "id": "import-spriteimage", "commandId": "import.spriteimage" });

      menu = _this.menuBar.addMenu({"label": "Screen", "className": 'ui-menu-tilemode ui-menu-screen' });
      menu.addItem({ "label": "Dimensions" + "...", "id": "file-dimensions", "commandId": "project.dimensions" });
      menu.addItem({ "label": "Crop To Selection", "id": "screen-crop", "commandId": "textMode.screen.crop"});
//      menu.addItem({ "label": "3D Mode", "id": "3d-mode" });


      menu.addSeparator({ "label": "Mode" });
      menu.addItem({"label": "Text Mode", "id": "mode-textmode", "commandId": "textMode.mode.textmode", "checked": true });
      menu.addItem({"label": "C64 Standard Character Mode", "id": "mode-c64standard", "commandId": "textMode.mode.c64standard"});
      menu.addItem({"label": "C64 Multicolor Character Mode", "id": "mode-c64multicolor", "commandId": "textMode.mode.c64multicolor"});
      menu.addItem({"label": "C64 Extended BG Color Mode", "id": "mode-c64ecm", "commandId": "textMode.mode.c64ecm"});
      menu.addItem({"label": "Vector Mode", "id": "mode-vector", "commandId": "textMode.mode.vector"});
//      menu.addItem({"label": "NES", "id": "mode-nes"});
      menu.addItem({"label": "Indexed Color", "id": "mode-indexed", "commandId": "textMode.mode.indexed"});
      menu.addItem({"label": "RGB Color", "id": "mode-rgb", "commandId": "textMode.mode.rgb"});


      if(SHOWUNFINISHED) {
        menu.addItem({"label": "NES", "id": "mode-nes", "commandId": "textMode.mode.nes"});
      }

      /*
      menu.addItem({"label": "NES", "id": "mode-nes"});
      menu.addItem({"label": "Indexed Color", "id": "mode-indexed"});
      menu.addItem({"label": "NES", "id": "mode-rgb"});
      */
      menu.addSeparator({ "label": "Tile Orientation" });
      menu.addItem({"label": "Allow Tile Flip", "id": "mode-tileflip", "commandId": "textMode.mode.tileflip"});
      menu.addItem({"label": "Allow Tile Rotate", "id": "mode-tilerotate", "commandId": "textMode.mode.tilerotate"});
      menu.addItem({"label": "Has Tile Materials", "id": "mode-tilematerials", "commandId": "textMode.mode.tilematerials"});


      menu.addSeparator({ "label": styles.text.blockName + " Mode" });
      menu.addItem({"label": styles.text.blockName + " Mode", "id": "mode-blockmode", "commandId": "textMode.mode.blockmode"});
      menu.addItem({"label": styles.text.blockName + " Size" + "...", "id": "mode-blocksize", "commandId": "textMode.mode.blocksize"});
      UI('mode-blocksize').setEnabled(false);


      menu.addSeparator({ "label": "Color Mode" });
      menu.addItem({"label": "Color Per Cell", "id": "colorpermode-cell", "commandId": "textMode.colorMode.cell", "checked": true });
      menu.addItem({"label": "Color Per Tile", "id": "colorpermode-character", "commandId": "textMode.colorMode.character"});
      menu.addItem({"label": "Color Per " + styles.text.blockName, "id": "colorpermode-block", "commandId": "textMode.colorMode.block"});
      UI('colorpermode-block').setEnabled(false);

      menu.addSeparator({ "label": "Reference Image" });
      menu.addItem({ "label": "Set Reference Image" + "...", "id": "screen-referenceimage", "commandId": "textMode.referenceImage", "shortcut": { "cmd": true, "alt": true, "key": "I"} });

      menu = _this.menuBar.addMenu({"label": "Sprite", "className": 'ui-menu-tilemode ui-menu-sprite' });
      menu.addItem({ "label": "Dimensions" + "...", "id": "file-spritedimensions", "commandId": "project.dimensions" });


      menu.addSeparator({ "label": "Mode" });
      menu.addItem({"label": "Monochrome", "id": "mode-spritetextmode", "commandId": "textMode.mode.textmode", "checked": true });
      menu.addItem({"label": "C64 Multicolor", "id": "mode-spritec64multicolor", "commandId": "textMode.mode.c64multicolor"});
      menu.addItem({"label": "NES", "id": "mode-spritenes", "commandId": "textMode.mode.nes"});
      menu.addItem({"label": "Indexed", "id": "mode-spriteindexed", "commandId": "textMode.mode.indexed"});

      menu = _this.menuBar.addMenu({"label": "Layers", "className": 'ui-menu-tilemode' });
      menu.addItem({"label": "New Layer" + "...", "id": "layers-new", "commandId": "textMode.layers.new", "shortcut": { "cmd": true, "key": "L"}  });   // { "cmd": true, "shift": true, "key": "N" }
      menu.addSeparator({ });
      menu.addItem({"label": "Layer Properties" + "...", "id": "layers-properties", "commandId": "textMode.layers.properties"});
      menu.addItem({"label": "Delete Layer", "id": "layers-delete", "commandId": "textMode.layers.delete"});
      menu.addItem({"label": "Bring Forward", "id": "layers-moveUp", "commandId": "textMode.layers.moveUp", "shortcut": {"cmd": true, "key": "]"} });
      menu.addItem({"label": "Send Backward", "id": "layers-moveDown", "commandId": "textMode.layers.moveDown", "shortcut": {"cmd": true, "key": "["} });
      menu.addItem({"label": "Toggle Layer Visibility", "id": "layers-toggle", "commandId": "textMode.layers.toggle", "shortcut": { "cmd": true, "key": "\\" }});
      menu.addItem({"label": "Select Above", "id": "layers-selectAbove", "commandId": "textMode.layers.selectAbove", "shortcut": {"alt": true, "key": "]"} });
      menu.addItem({"label": "Select Below", "id": "layers-selectBelow", "commandId": "textMode.layers.selectBelow", "shortcut": {"alt": true, "key": "["} });
/*
      menu.addSeparator({ });
      menu.addItem({"label": "Merge...", "id": "layers-merge"});
      menu.addItem({"label": "To Frames...", "id": "layers-toframes"});
//      menu.addItem({"label": "From Frames...", "id": "layers-fromframes"});
*/

      _this.tileSetMenu = _this.menuBar.addMenu({"label": "Tiles", "className": 'ui-menu-tilemode ui-menu-screen ui-menu-3d' });
      _this.tileSetMenu.addItem({ "label": "Show Tile Editor", "id": "charactersets-edit", "commandId": "textMode.tiles.edit", "shortcut": { "cmd": true, "key": "E" } });
      _this.tileSetMenu.addSeparator({ "label": "Current Tile Set" });
      _this.tileSetMenu.addItem({ "label": "Choose A Tile Set" + "...", "id": "charactersets-preset", "commandId": "textMode.tiles.preset" });
      _this.tileSetMenu.addItem({ "label": "Load / Import Tile Set" + "...", "id": "charactersets-load", "commandId": "textMode.tiles.load" });
//      _this.tileSetMenu.addItem({ "label": "Load / Import Tile Set" + "...", "id": "charactersets-load" });
      _this.tileSetMenu.addItem({ "label": "Save Tile Set" + "...", "id": "charactersets-save", "commandId": "textMode.tiles.save" });
      _this.tileSetMenu.addSeparator({ "label": "Project Tile Sets" });
      _this.tileSetMenu.addItem({ "label": "Create a Tile Set...", "id": "tileset-new", "commandId": "textMode.tiles.new" });


      //tileset
      menu = _this.menuBar.addMenu({"label": "Tiles", "className": 'ui-menu-tileset' });
      menu.addItem({ "label": "Choose A Character Set" + "...", "id": "tileset-preset", "commandId": "textMode.tiles.preset" });
      menu.addItem({ "label": "Load / Import Tile Set" + "...", "id": "tileset-load", "commandId": "textMode.tiles.load" });
      menu.addItem({ "label": "Save Tile Set" + "...", "id": "tileset-save", "commandId": "textMode.tiles.save" });


      _this.colorPaletteMenu = _this.menuBar.addMenu({"label": "Colors", "className": 'ui-menu-tilemode ui-menu-3d' });
      _this.colorPaletteMenu.addItem({ "label": "Show Color Editor", "id": "color-edit", "commandId": "application.color-edit", "shortcut": { "cmd": true, "shift": true, "key": "E" } });
      _this.colorPaletteMenu.addSeparator({ });
      _this.colorPaletteMenu.addItem({ "label": "Choose A Color Palette" + "...", "id": "colors-preset", "commandId": "textMode.colors.preset" });
      _this.colorPaletteMenu.addItem({ "label": "Edit Color Palette" + "...", "id": "color-editcolorpalette", "commandId": "application.color-editcolorpalette" });
//      menu.addItem({ "label": "Edit/Create Palette...", "id": "colors-edit" });
      _this.colorPaletteMenu.addItem({ "label": "Load Color Palette" + "...", "id": "colors-load", "commandId": "textMode.colors.load" });
      _this.colorPaletteMenu.addItem({ "label": "Save Color Palette" + "...", "id": "colors-save", "commandId": "textMode.colors.save" });
      _this.colorPaletteMenu.addSeparator({ "label": "Project Tile Sets" });
      _this.colorPaletteMenu.addItem({ "label": "Create a Color Palette...", "id": "colorpalette-new", "commandId": "textMode.colors.new" });

      menu = _this.menuBar.addMenu({"label": "Import / Export", "className": 'ui-menu-colorpalette' });
      menu.addItem({ "label": "Choose A Color Palette" + "...", "id": "colorpalette-preset", "commandId": "textMode.colors.preset" });
      menu.addItem({ "label": "Load Color Palette" + "...", "id": "colorpalette-load", "commandId": "textMode.colors.load" });
      menu.addItem({ "label": "Save Color Palette" + "...", "id": "colorpalette-save", "commandId": "textMode.colors.save" });


      menu = _this.menuBar.addMenu({"label": "View", "className": 'ui-menu-tilemode' });
      menu.addItem({ "label": "Zoom In", "id": "view-zoomin", "commandId": "view.zoomin", "shortcut": { "cmd": true, "key": "=" } });
      menu.addItem({ "label": "Zoom Out", "id": "view-zoomout", "commandId": "view.zoomout", "shortcut": { "cmd": true, "key": "-" } });
      menu.addItem({ "label": "Fit On Screen", "id": "view-fitonscreen", "commandId": "view.fitonscreen", "shortcut": { "cmd": true, "key": "0" } });
      menu.addItem({ "label": "Actual Pixels", "id": "view-actualpixels", "commandId": "view.actualpixels", "shortcut": { "cmd": true, "key": "1" } });
      menu.addSeparator({  });
      menu.addItem({ "label": "Grid Lines", "id": "edit-showgrid", "commandId": "view.grid", "checked": true, "shortcut": { "cmd": true, "key": "G" } });

      menu.addItem({ "label": "Border", "id": "edit-showborder", "commandId": "edit.showborder", "checked": true, "shortcut": { "cmd": true, "key": "H" } });
      menu.addItem({ "label": "Background", "id": "edit-showbackground", "commandId": "edit.showbackground", "checked": true, "shortcut": { "cmd": true, "key": "B" } });
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
     menu.addItem({ "label": "Cursor Tile Is Transparent", "id": "cursor-tile-transparent", "commandId": "application.cursor-tile-transparent" });





//     if(SHOWUNFINISHED) {
      menu.addSeparator({  });
      menu.addItem({ "label": "Scripting" + "...", "id": "edit-scripting", "commandId": "edit.scripting", "shortcut": { "cmd": true, "key": "R" } });
//     }
//      menu.addItem({ "label": "Project View" + "...", "id": "view-project", "shortcut": { "cmd": true, "key": "P" } });



      menu = _this.menuBar.addMenu({"label": "Interface", "className": 'ui-menu-tilemode' });
      menu.addItem({ "label": "Zen Mode", "id": "view-zenmode", "commandId": "view.zenmode", "checked": false, "shortcut": { "alt": true, "shift": true, "key": "Z" } });
      menu.addSeparator({  });
      menu.addItem({ "label": "Tools Panel", "id": "view-tools", "commandId": "view.tools" });
      menu.addSeparator({  });

//      menu.addItem({ "label": "Info Panel", "id": "view-infopanel" });
//      menu.addSeparator({  });
      menu.addItem({ "label": "Layers Panel", "id": "view-layerspanel", "commandId": "view.layerspanel" });
      menu.addItem({ "label": "Tile Palette Panel Side", "id": "view-tilepalettepanelside", "commandId": "view.tilepalettepanelside" });
      menu.addItem({ "label": "Meta Tile Palette Panel Side", "id": "view-metatilepalettepanelside", "commandId": "view.metatilepalettepanelside" });
      menu.addItem({ "label": "Color Palette Panel", "id": "view-palettepanel", "commandId": "view.palettepanel" });
      menu.addSeparator({  });
      menu.addItem({ "label": "Tile Palette Panel Bottom", "id": "view-tilepalettepanelbottom", "commandId": "view.tilepalettepanelbottom" });
      menu.addItem({ "label": "Meta Tile Palette Panel Bottom", "id": "view-metatilepalettepanelbottom", "commandId": "view.metatilepalettepanelbottom" });
      menu.addItem({ "label": "Animation Panel", "id": "view-animationpanel", "commandId": "view.animationpanel" });

      menu.addSeparator({  });
      menu.addItem({ "label": "Perf Stats", "id": "view-perfstats", "commandId": "view.performanceStats" });
      menu.addSeparator({  });
      menu.addItem({ "label": "Mobile Mode", "id": "settings-mobilemode", "commandId": "settings.mobilemode" });

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
      menu.addItem({ "label": "Show / Hide Grid", "id": "view-3dgrid", "commandId": "view.grid", "shortcut": { "cmd": true, "key": "G" } });
      menu.addSeparator({  });
      menu.addItem({ "label": "Perf Stats", "id": "view-3dperfstats", "commandId": "view.performanceStats" });


      menu = _this.menuBar.addMenu({"label": "View", "className": 'ui-menu-music  ui-menu-colorpalette ui-menu-tileset ui-menu-script' });
      menu.addItem({ "label": "Project View" + "...", "id": "view-project-explorer", "commandId": "view.projectExplorer", "shortcut": { "cmd": true, "key": "P" } });


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
      menu.addItem({ "label": "Colors", "id": "c64-view-toggle-colors" });
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

      menu = _this.menuBar.addMenu({
        "label": "Help",
        "className": 'ui-menu-tilemode ui-menu-3d ui-menu-colorpalette ui-menu-tileset ui-menu-script'
      });

      menu.addItem({ "label": "Common Actions" + "...", "id": "help-commonactionshortcuts", "commandId": "help.commonActions" });

      menu.addItem({ "label": "Keyboard Shortcuts" + "...", "id": "help-keyboardshortcuts", "commandId": "help.keyboardReference" });

      if(SHOWUNFINISHED) {
        menu.addItem({ "label": "Scripting API" + "...", "id": "help-scriptingapi", "commandId": "help.scriptingapi" });
      }

      menu.addSeparator({ });
      menu.addItem({ "label": "About lvllvl plus" + "...", "id": "help-about", "commandId": "help.about" });

      _this.menuBar.on('itemclick', function(id, source) {
        _this.menuClick(id, source);
      });
      if(_this.services && _this.services.shortcutCatalog) {
        _this.services.shortcutCatalog.connectMenuBar(_this.menuBar);
      }

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
});
