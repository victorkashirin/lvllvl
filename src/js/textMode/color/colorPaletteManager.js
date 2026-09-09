var ColorPaletteManager = function() {
  this.editor = null;
  this.currentColorPalette = null;
  this.colorPaletteChoosePreset = null;
  this.colorPaletteChoosePresetMobile = null;  
  this.colorPaletteSave = null;
  this.colorPaletteLoad = null;

  this.defaultColors = [0x000000,0xffffff,0x68372B,0x70A4B2,0x6F3D86,0x588D43,0x352879,0xB8C76F,0x6F4F25,0x433900,0x9A6759,0x444444,0x6C6C6C,0x9AD284,0x6C5EB5,0x959595];

  this.colorPicker = null;
  this.colorPickerMobile = null;

  this.colorSubPalettes = null;

  this.canvas = null;
  this.colorPalettes = [];
  this.colorPaletteCache = {};

  this.noColor = -1;  


  this.colorLimit = 256;
}

ColorPaletteManager.prototype = {
  init: function(editor) {
    this.editor = editor;
//    this.useDefaultColorPalette();

    this.colorSubPalettes = new ColorSubPalettes();
    this.colorSubPalettes.init(editor);
  },

  clear: function() {
    //this.colorPalettes = [];
    this.colorPaletteCache = {};
    this.currentColorPalette = null;
  },

  showNewColorPaletteDialog: function() {
    var _this = this;
    if(this.newColorPaletteDialog == null) {
      var width = 320;
      var height = 296;
      this.newColorPaletteDialog = UI.create("UI.Dialog", { "id": "newColorPaletteDialog", "title": "New Color Palette", "width": width, "height": height });

      this.newColorPaletteHTML = UI.create("UI.HTMLPanel");
      this.newColorPaletteDialog.add(this.newColorPaletteHTML);
      this.newColorPaletteHTML.load('html/textMode/newColorPalette.html', function() {    
        _this.initNewColorPaletteDialogContent();
      });


      var okButton = UI.create('UI.Button', { "text": "OK", "color": "primary" });
      okButton.on('click', function(event) {

        _this.newColorPaletteSubmit();
        UI.closeDialog();
      });
 
      var closeButton = UI.create('UI.Button', { "text": "Cancel", "color": "secondary" });
      closeButton.on('click', function(event) {
        UI.closeDialog();
      });

      this.newColorPaletteDialog.addButton(okButton);
      this.newColorPaletteDialog.addButton(closeButton);
      UI.showDialog("newColorPaletteDialog");
    } else {
      UI.showDialog("newColorPaletteDialog");
      this.initNewColorPaletteDialogContent();      
    }

    // work out whats being created

  },

  initNewColorPaletteDialogContent: function() {
    $('#newColorPaletteName').val('Color Palette');
    $('#newColorPaletteName').focus();
    $('#newColorPaletteName').select();    

  },

  newColorPaletteSubmit: function() {
    var name = $('#newColorPaletteName').val();
    var colorCount = 2;//$('#newTileSetCount').val();
    
    var newColorPaletteId = this.createColorPalette({ name: name }); 

    this.selectColorPalette(newColorPaletteId);
    /*
    // get the current layer
    var layer = this.editor.layers.getSelectedLayerObject();
    if(layer != null && layer.getType() == 'grid') {
      layer.setColorPalette(newColorPaletteId);
    }
    
    this.updateColorPaletteMenu();

*/
    g_app.projectNavigator.reloadTreeBranch('/color palettes');
    g_app.projectNavigator.treeRoot.refreshChildren();
  },


  updateColorPaletteMenu: function() {
    var colorPaletteMenu = g_app.colorPaletteMenu;

    if(!colorPaletteMenu) {
      return;
    }

    var colorPalettes = g_app.doc ? g_app.doc.dir('/color palettes') : [];
    var activePaletteMenuItems = {};
    for(var i = 0; i < colorPalettes.length; i++) {
      activePaletteMenuItems['colorpalette-select-' + colorPalettes[i].id] = true;
    }

    // Menu instances live longer than a document. Remove project-owned
    // entries before checking the selected layer, so a mode without a grid
    // layer cannot leave the previous project's palettes behind.
    var currentMenuItems = colorPaletteMenu.getItems();
    for(var i = currentMenuItems.length - 1; i >= 0; i--) {
      var menuItemId = currentMenuItems[i].uiID;
      if(typeof menuItemId == 'string' &&
          menuItemId.indexOf('colorpalette-select-') === 0 &&
          !activePaletteMenuItems[menuItemId]) {
        colorPaletteMenu.removeItem(menuItemId);
      }
    }

    if(!g_app.doc) {
      return;
    }

    // get the current layer
    var layer = this.editor.layers.getSelectedLayerObject();
    if(layer == null || layer.getType() != 'grid') {
      return;
    }

    var selectedColorPalette = layer.getColorPalette();

    for(var i = 0; i < colorPalettes.length; i++) {
//      var tileSetData = tileSets[i].data;
      
//      if(tileWidth === tileSetData.width && tileHeight === tileSetData.height) {
      // can use this colour palette??
      if(true) {
        // tile set dimensions ok..
        var name = colorPalettes[i].name;
        var id = colorPalettes[i].id;
        var menuId = 'colorpalette-select-' + id;
        var menuItem = colorPaletteMenu.getItem(menuId);
        if(menuItem) {
          menuItem.setLabel(name);
        } else {
          menuItem = colorPaletteMenu.addItem({ "label": name, "id": menuId });
        }

        if(selectedColorPalette && id == selectedColorPalette.getId()) {
          menuItem.setChecked(true);
        } else {
          menuItem.setChecked(false);
        }
      }
    }
  },

  selectColorPalette: function(colorPaletteId) {
    // get the current layer
    var layer = this.editor.layers.getSelectedLayerObject();
    if(layer != null && layer.getType() == 'grid') {
      layer.setColorPalette(colorPaletteId);

      this.editor.graphic.redraw({ allCells: true });
    }
    this.updateColorPaletteMenu();
    this.setCurrentColorPaletteFromId(colorPaletteId)

  },

  getCurrentColorPaletteId: function() {
    if(!this.currentColorPalette) {
      return false;
    }

    return this.currentColorPalette.colorPaletteId;
  },

  createColorPalette: function(args) {

    args = args || {};
    var document = args.document || g_app.doc;
    if(!document) {
      return false;
    }

    var name = 'color palette';
    if(typeof args.name != 'undefined') {
      name = args.name
    }

    var colorPaletteId = false;
    if(typeof args.id !== 'undefined') {
      colorPaletteId = args.id;
    }

    // make sure the name is unique
    var testName = name;
    var count = 0;
    while(document.getDocRecord('/color palettes/' + testName)) {
      count++;
      testName = name + '_' + count
    }
    name = testName;

    //var colorPaletteId = g_app.getGuid();
    var colorPalette = document.createDocRecord(
                "/color palettes", 
                name, 
                "color palette", 
                {  },
                colorPaletteId);
    
    return colorPalette.id;
  },

  syncColorPickers: function() {
    // kind of hack to sync colour pickers

deprecated('syncColorPickers');
return;





  },


  reset: function() {
    for(var i = 0; i < this.colorPalettes.length; i++) {
      this.colorPalettes[i].clear();
    }

    this.colorPalettes = [];
    this.colorPaletteCache = {};
    this.currentColorPalette = null;

    if(this.colorSubPalettes && typeof this.colorSubPalettes.resetProjectState == 'function') {
      this.colorSubPalettes.resetProjectState();
    }
    if(this.colorPaletteLoad && typeof this.colorPaletteLoad.resetProjectState == 'function') {
      this.colorPaletteLoad.resetProjectState();
    }
    if(this.colorPaletteSave && typeof this.colorPaletteSave.resetProjectState == 'function') {
      this.colorPaletteSave.resetProjectState();
    }
    if(this.colorPaletteChoosePreset && typeof this.colorPaletteChoosePreset.resetProjectState == 'function') {
      this.colorPaletteChoosePreset.resetProjectState();
    }
    if(this.colorPaletteChoosePresetMobile && typeof this.colorPaletteChoosePresetMobile.resetProjectState == 'function') {
      this.colorPaletteChoosePresetMobile.resetProjectState();
    }
    if(this.colorPicker && typeof this.colorPicker.resetProjectState == 'function') {
      this.colorPicker.resetProjectState();
    }
    if(this.colorPickerMobile && typeof this.colorPickerMobile.resetProjectState == 'function') {
      this.colorPickerMobile.resetProjectState();
    }
  },

  clearProjectMenu: function() {
    var colorPaletteMenu = g_app.colorPaletteMenu;
    if(!colorPaletteMenu) {
      return;
    }
    var currentMenuItems = colorPaletteMenu.getItems();
    for(var i = currentMenuItems.length - 1; i >= 0; i--) {
      var menuItemId = currentMenuItems[i].uiID;
      if(typeof menuItemId == 'string' && menuItemId.indexOf('colorpalette-select-') === 0) {
        colorPaletteMenu.removeItem(menuItemId);
      }
    }
  },
/*
  useDefaultColorPalette: function() {

    this.currentColorPalette = new ColorPalette();
    this.currentColorPalette.init(this.editor);
    for(var i = 0; i < this.defaultColors.length; i++) {
      this.currentColorPalette.addColor(this.defaultColors[i]);
    }

    this.colorPalettes.push(this.currentColorPalette);
  },
*/


  getColorPalette: function(colorPaletteId, document) {
    document = document || g_app.doc;
    if(!document) {
      return null;
    }

    if(this.colorPaletteCache.hasOwnProperty(colorPaletteId)) {
      var cachedPalette = this.colorPaletteCache[colorPaletteId];
      // Legacy palette objects without an owner cannot safely be reused after
      // a project transition, even if their id happens to match.
      if(cachedPalette.document === document) {
        return cachedPalette;
      }
      delete this.colorPaletteCache[colorPaletteId];
    }

    var colorPaletteRecord = document.getDocRecordById(colorPaletteId, "/color palettes");

    var colorPalette = null;

    if(colorPaletteRecord) {
      var colorPalette = new ColorPalette();
      colorPalette.init(this.editor, colorPaletteRecord.name, colorPaletteId, document,
        document === g_app.doc ? g_app.projectGeneration : undefined);
      colorPalette.setColorsFromDoc();

      this.colorPaletteCache[colorPaletteId] = colorPalette;
    }

//    this.colorPaletteCache[colorPaletteId] = colorPalette;
    return colorPalette;
  },

  addColorPaletteToDoc: function(args, callback) {

    args = args || {};
    var document = args.document || g_app.doc;
    var generation = args.projectGeneration;
    var isCurrent = function() {
      return !g_app.isCurrentProject || g_app.isCurrentProject(document, generation);
    };
    if(!document || !isCurrent()) {
      return;
    }

    if(typeof args.colorPaletteId != 'undefined' && args.colorPaletteId != '') {
      // color already exists in doc, its doc id has been passed in..prob should check tho..
      if(typeof callback != 'undefined' && isCurrent()) {
        callback(args.colorPaletteId);
      }
      return;
    }


    if(typeof args.preset != 'undefined' && args.preset !== false) {
      // adding from a preset
      this.addColorPaletteFromPreset(args, callback);
      return;
    } 

    // uh oh..need to create new colour palette
    var paletteName = "Color Palette";
    if(typeof args.colorPaletteName != 'undefined') {
      paletteName = args.colorPaletteName;
    }

    var colorPaletteId = this.createColorPalette({ name: paletteName, document: document });

    var colorPalette = new ColorPalette();
    colorPalette.init(this.editor, paletteName, colorPaletteId, document, generation);
    colorPalette.projectGeneration = generation;

    if(typeof args.colorPalette != 'undefined') {
      colorPalette.copyPalette(args.colorPalette);
    }
    this.colorPaletteCache[colorPaletteId] = colorPalette;
    if(typeof callback != 'undefined' && isCurrent()) {
      callback(colorPaletteId);
    }

    //callback(arg)


  },


  addColorPaletteFromPreset: function(args, callback) {
    args = args || {};
    var document = args.document || g_app.doc;
    var generation = args.projectGeneration;
    var isCurrent = function() {
      return !g_app.isCurrentProject || g_app.isCurrentProject(document, generation);
    };
    if(!document || !isCurrent()) {
      return;
    }
    var preset = args.preset;
    var colorPaletteName = 'Color Palette';
    if(typeof args.colorPaletteName != 'undefined') {
      colorPaletteName = args.colorPaletteName;
    }
    var colorPaletteId = this.createColorPalette({ name: colorPaletteName, document: document });


    var colorPalette = new ColorPalette();
    colorPalette.init(this.editor, preset, colorPaletteId, document, generation);
    colorPalette.projectGeneration = generation;

    this.colorPaletteCache[colorPaletteId] = colorPalette;


    this.choosePreset(preset, {
      colorPalette: colorPalette,
      document: document,
      projectGeneration: generation,
      callback: function() {
        if(isCurrent() && typeof callback != 'undefined') {
          callback(colorPaletteId);
        }
      }
    });


  },

  // set the current colour palette to a preset
  usePresetColorPalette: function(preset, callback) {

    var colorPalette = this.currentColorPalette;

    // A retained palette object may belong to the project that was just
    // closed. Treat it as empty before applying a preset to the new project.
    if(colorPalette &&
        (!colorPalette.document || (g_app.isCurrentProject &&
        !g_app.isCurrentProject(colorPalette.document, colorPalette.projectGeneration)))) {
      colorPalette = null;
      this.currentColorPalette = null;
    }

    // if no colour palette, then create one
    if(colorPalette == null) {
      if(!g_app.doc) {
        return;
      }
      var colorPaletteId = this.createColorPalette({ name: preset, document: g_app.doc });
      colorPalette = new ColorPalette();
      colorPalette.init(this.editor, preset, colorPaletteId, g_app.doc, g_app.projectGeneration);
      this.currentColorPalette = colorPalette;

      this.colorPaletteCache[colorPaletteId] = colorPalette;
    }

    this.choosePreset(preset, {
      callback: callback,
      colorPalette: colorPalette,
      document: colorPalette.document,
      projectGeneration: colorPalette.projectGeneration
    });

  },
  showColorSubPalettePicker: function(x, y, args) {
    this.colorSubPalettes.closePicker();
    this.colorSubPalettes.showPicker(x, y, args);
  },

  showColorPickerMobile: function(args) {
    if(this.colorPickerMobile == null) {
      this.colorPickerMobile = new ColorPickerMobile();
      this.colorPickerMobile.init(this.editor);
    }

    this.colorPickerMobile.show(args);

  },

  showColorPicker: function(x, y, args) {
    if(this.colorPicker == null) {
      this.colorPicker = new ColorPickerPopup();
      this.colorPicker.init(this.editor);
    }  
    this.colorPicker.close();
    this.colorPicker.show(x, y, args);
  },

  closeColorPicker: function() {
    if(this.colorPicker) {
      this.colorPicker.close();
    }
  },

  setCurrentColorPaletteFromId: function(colorPaletteId) {
    var currentBelongsToProject = !g_app.doc ||
      (this.currentColorPalette && this.currentColorPalette.document === g_app.doc);
    if(this.currentColorPalette !== null &&
        currentBelongsToProject &&
        this.currentColorPalette.getId() == colorPaletteId) {
      // already set..
      return;
    }



    this.currentColorPalette = this.getColorPalette(colorPaletteId, g_app.doc);
    if(!this.currentColorPalette) {
      return;
    }
    this.colorPaletteUpdated();


  },

  getCurrentColorPalette: function() {
    return this.currentColorPalette;
  },

  getBorderColor: function() {
    return this.borderColor;
  },


  showChoosePreset: function(args) {
    var _this = this;
    
    args.callback = function(presetId, args) {
      _this.choosePreset(presetId, args);
    }

    if(g_app.isMobile()) {
      if(this.colorPaletteChoosePresetMobile == null) {
        this.colorPaletteChoosePresetMobile = new ColorPaletteChoosePresetMobile();
        this.colorPaletteChoosePresetMobile.init(this.editor);
      }
      this.colorPaletteChoosePresetMobile.show(args);

    } else {
      var dialog = this.getChoosePresetDialog();
      dialog.show(args);
    }
  },

  getChoosePresetDialog: function() {
    if(this.colorPaletteChoosePreset == null) {
      this.colorPaletteChoosePreset = new ColorPaletteChoosePreset();
      this.colorPaletteChoosePreset.init(this.editor);
    }
    return this.colorPaletteChoosePreset;

  },

  choosePreset: function(preset, args) {
    var _this = this;
    args = args || {};
    // Capture the project even for callers that only request the current
    // palette. Otherwise a delayed image load can apply an old preset to the
    // palette selected in a newly opened project.
    var projectDocument = args.document ||
      (args.colorPalette && args.colorPalette.document) || g_app.doc;
    var projectGeneration = typeof args.projectGeneration !== 'undefined' ?
      args.projectGeneration : g_app.projectGeneration;
    args.document = projectDocument;
    args.projectGeneration = projectGeneration;
    var url = 'palettes/' + preset + '.png';



    if(url !== false) {
      var img = new Image();
      img.onload = function() {

        if(projectDocument && g_app.isCurrentProject &&
            !g_app.isCurrentProject(projectDocument, projectGeneration)) {
          return;
        }

        var colors = _this.colorPaletteFromPaletteImg(img, args);
//            { brightness: _this.brightness, saturation: _this.saturation, contrast: _this.contrast});
        var colorsAcross = Math.floor(img.naturalWidth / 8);
        var colorsDown = Math.floor(img.naturalHeight / 8);

        var colorPalette = null;

        if(typeof args != 'undefined' && typeof args.colorPalette != 'undefined') {
          colorPalette = args.colorPalette;
        } else {
          colorPalette = _this.getCurrentColorPalette();// _this.editor.colorPaletteManager.getCurrentColorPalette();
        }

//        colorPalette.setName(preset); 
    
        if(!colorPalette) {
          return;
        }
        colorPalette.setColors(colors.colors, colorsAcross, colorsDown);

        if(colorPalette.name.indexOf('c64') != -1) {
          colorPalette.setIsC64Palette(true);
        }
        colorPalette.setSortOrderMethod('default');
        

        if(typeof args != 'undefined' && typeof args.callback !== 'undefined' && args.callback != null) {
          args.callback();
        }

      }
      img.src = url;      
    }
  },  


  getColorPaletteLoader: function() {
    if(this.colorPaletteLoad == null) {
      this.colorPaletteLoad = new ColorPaletteLoad();
      this.colorPaletteLoad.init(this.editor);
    }

    return this.colorPaletteLoad;

  },


  showLoad: function(args) {
    args.tab = 'load';
    this.showChoosePreset(args);
  },

  showSave: function(args) {
    if(this.colorPaletteSave == null) {
      this.colorPaletteSave = new ColorPaletteSave();
      this.colorPaletteSave.init(this.editor);
    }

    this.colorPaletteSave.show(args);
  },


  colorPaletteFromPaletteImg: function(image, args) {
    var map = false;
    var brightness = 0;
    var saturation = 0;
    var contrast = 0;

    // internal format has colours in grid of 8pixel squares 
    var format = 'internal';


    if(typeof args != 'undefined') {
      if(typeof args.brightness != 'undefined') {
        brightness = args.brightness;
      }

      if(typeof args.saturation != 'undefined') {
        saturation = args.saturation;
      }

      if(typeof args.contrast != 'undefined') {
        contrast = args.contrast;
      }

      if(typeof args.format != 'undefined') {
        format = args.format;
      }
    }


    if(!this.canvas) {
      this.canvas = document.createElement('canvas');

    }
    this.canvas.width = image.naturalWidth;
    this.canvas.height = image.naturalHeight;


    var context = this.canvas.getContext('2d')
    context.drawImage(image, 0, 0);
    var imageData = context.getImageData(0, 0, this.canvas.width, this.canvas.height);

    if(brightness != 0) {
      ImageUtils.adjustBrightness(imageData, brightness);
    }

    if(saturation != 0) {
      ImageUtils.adjustSaturation(imageData, saturation);      
    }

    if(contrast != 0) {
      ImageUtils.adjustContrast(imageData, contrast);      
    }

    var colors = [];
    var includedColors = {};


    // work out the format...
    var lastColor = 0;
    for(var y = 0; y < this.canvas.height; y++) {

      for(var x = 0; x < this.canvas.width; x += 8) {
        for(var xSub = x; xSub < x + 8; xSub++) {
          var srcPos = ((y * this.canvas.width) + xSub) * 4;


          var r = imageData.data[srcPos];
          var g = imageData.data[srcPos + 1];
          var b = imageData.data[srcPos + 2];
          var a = imageData.data[srcPos + 3];//imageData.data[srcPos + 3];

          var color = (a << 24) + (r << 16) + (g << 8) + (b);
          color = color >>> 0;

          if(xSub != x) {
            // colour needs to be same as last colour
            if(color != lastColor) {
              // not internal format...
              format = 'png';
              x = this.canvas.width;
              y = this.canvas.height;
              break;
            }
          }
          lastColor = color;
        }

      }
    }

    var xIncrement = 1;
    var yIncrement = 1;

    if(format == 'internal') {
      xIncrement = 8;
      yIncrement = 8;
      map = [];
    }

    var mapY = 0;
    var mapX = 0;
    for(var y = 0; y < this.canvas.height; y += yIncrement) {
      if(map !== false) {
        map[mapY] = [];
        mapX = 0;
      }
      for(var x = 0; x < this.canvas.width; x += xIncrement) {
        if(map !== false) {
          // initialise
          map[mapY][mapX] = this.editor.colorPaletteManager.noColor;
        }

        var srcPos = ((y * this.canvas.width) + x) * 4;

        var r = imageData.data[srcPos];
        var g = imageData.data[srcPos + 1];
        var b = imageData.data[srcPos + 2];
        var a = imageData.data[srcPos + 3];

//        var color = r + (g << 8) + (b << 16);
        var color = (a << 24) + (r << 16) + (g << 8) + (b);
        color = color >>> 0;

/*
        if(a === 0) {
          color = this.editor.colorPaletteManager.noColor;
        }
*/

        if(format == 'internal' || !includedColors.hasOwnProperty(color)) {
          includedColors[color] = true;

          if(format == 'internal') {
            if(a !== 0) {
              var colorIndex = colors.length;
              map[mapY][mapX] = colorIndex;
              colors.push(color);
            }

          } else {
            colors.push(color);
          }
          if(colors.length  > this.colorLimit) {
            // uh oh, passed the limit
            y = this.canvas.height;
            x = this.canvas.width;
            break;
          }
        } else {
        }

        mapX++;

      }

      mapY++;
    }

    if(colors.length > this.colorLimit) {
      // use image utils to get colour limit colours..
      var palette = ImageUtils.createColorPaletteFromImage(this.colorLimit, image);// = function(colors, image) {    

      colors = [];
      for(var i =0 ; i < palette.length; i+= 4) {
        var a = 255;
        var color = (a << 24) + (palette[i] << 16) + (palette[i + 1] << 8) + (palette[i + 2]);
        colors.push(color);
      }

    }


    // work out colours across
    if(format == 'internal') {
      colorsAcross = Math.floor(image.naturalWidth / 8);
    } else {
      if(colors.length <= 8) {
        colorsAcross = 4;
      } else if(colors.length <= 16) {
        colorsAcross = 8;
      } else {
        colorsAcross = 16;
      }
    }

    if(colorsAcross > colors.length) {
      colorsAcross = colors.length;
    }

    return { colors: colors, colorsAcross: colorsAcross, map: map };
  },

  colorPaletteUpdated: function() {

    this.editor.colorPalettePanel.colorPaletteUpdate();


    // make sure current colour selections arent over the limits.
    var colorPalette = this.getCurrentColorPalette();
    if(!colorPalette) {
      return;
    }

    var currentColor = this.editor.currentTile.getColor();
    if(currentColor >= colorPalette.getColorCount()) {
      currentColor = 1;
    }
    this.editor.currentTile.setColor(currentColor, { force: true, update: false });

    currentColor = this.editor.currentTile.getBGColor();
    if(currentColor != this.noColor) {
      if(currentColor >= colorPalette.getColorCount()) {
        currentColor = 0;
      }
    }
    this.editor.currentTile.setBGColor(currentColor, { force: true, update: false });



  },

  // returns sort order
  sortColors: function(srcColors, args) {

    var sortMethod = 'hue';

    if(typeof args != 'undefined' && typeof args.sortMethod != 'undefined') {
      sortMethod = args.sortMethod;
    }


    if(sortMethod == 'source' || sortMethod == 'default') {
      var sortOrder = [];
      for(var i = 0; i < srcColors.length; i++) {
        sortOrder.push(i);
      }
      return sortOrder;
    }




    var colors = [];
    for(var i = 0; i < srcColors.length; i++) {
      var color = {};

      color.index = i;

      color.a = (srcColors[i] >>> 24) & 0xff;
      color.r = (srcColors[i] >>> 16) & 0xff;
      color.g = (srcColors[i] >>> 8) & 0xff;
      color.b = (srcColors[i] >>> 0)& 0xff;  

      var c = {};
      c.values = [color.r, color.g, color.b, color.a];

      color.hsv = Colour.converters[Colour.RGBA][Colour.HSVA](c);
      color.laba = Colour.converters[Colour.RGBA][Colour.LABA](c);

      color.hsl = this.rgb2hsl(color.r, color.g, color.b);

      colors.push(color);
    }

    var hueGroups = 16;
    var _this = this;

    switch(sortMethod) {
      case 'hls':
        var _this = this;
        colors.sort(function(a, b) {
          // sort all grays + whites together
          var hueA = (a.r == a.g && a.g == a.b) ? -1 : _this.hueGroup(a.hsl.h, hueGroups);
          var hueB = (b.r == b.g && b.g == b.b) ? -1 : _this.hueGroup(b.hsl.h, hueGroups);


          var hueDiff = hueB - hueA;
          if (hueDiff) return -hueDiff;

          var lumDiff = _this.lumGroup(+b.hsl.l.toFixed(2)) - _this.lumGroup(+a.hsl.l.toFixed(2));
          if (lumDiff) return -lumDiff;

          var satDiff = _this.satGroup(+b.hsl.s.toFixed(2)) - _this.satGroup(+a.hsl.s.toFixed(2));
          if (satDiff) return -satDiff;
        });
      break;

      case 'hue':
        colors.sort(function(a, b) {
          var diff = 0;
          var diff = a.hsv.values[0] - b.hsv.values[0];
          if(diff > 0.1 || diff < 0.1) {
            return diff;
          }

          diff = a.hsv.values[1] - b.hsv.values[1];

          if(diff > 0.1 || diff < -0.1) {
            return diff;
          }

          diff = a.hsv.values[2] - b.hsv.values[2];
          return diff;

        });
        case 'red':
        // distance from red? 
          //var redHsl = this.rgb2hsl(255, 0, 0);
          colors.sort(function(a, b) {
//            var distA = (255 - a.r) * (255 - a.r) + (0 - a.g) * (0 - a.g) + (0 - a.b) * (0- a.b);
//            var distB = (255 - b.r) * (255 - b.r) + (0 - b.g) * (0 - b.g) + (0 - b.b) * (0- b.b);

//            var distA = (redHsl.h - a.hsl.h) * (redHsl.h - a.hsl.h);
//            var distB = (redHsl.h - b.hsl.h) * (redHsl.h - b.hsl.h);
            var distA = _this.distEuclidean([255, 0, 0], [a.r, a.g, a.b]);
            var distB = _this.distEuclidean([255, 0, 0], [b.r, b.g, b.b]);

            return distA - distB;
          });

        break;
        case 'green':
        // distance from red?
          colors.sort(function(a, b) {
            var distA = _this.distEuclidean([0, 255, 0], [a.r, a.g, a.b]);
            var distB = _this.distEuclidean([0, 255, 0], [b.r, b.g, b.b]);

            return distA - distB;
          });
        break;
        case 'blue':
          colors.sort(function(a, b) {
            var distA = _this.distEuclidean([0, 0, 255], [a.r, a.g, a.b]);
            var distB = _this.distEuclidean([0, 0, 255], [b.r, b.g, b.b]);

            return distA - distB;
          });
        break;
    }

    var sortOrder = [];
    for(var i = 0; i < colors.length; i++) {
      sortOrder.push(colors[i].index);
    }

    return sortOrder;
  },

  // http://rgb2hsl.nichabi.com/javascript-function.php
  rgb2hsl: function(r, g, b) {
    var max, min, h, s, l, d;
    r /= 255;
    g /= 255;
    b /= 255;
    max = Math.max(r, g, b);
    min = Math.min(r, g, b);
    l = (max + min) / 2;
    if (max == min) {
      h = s = 0;
    } else {
      d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break
      }
      h /= 6;
    }
//    h = Math.floor(h * 360)
//    s = Math.floor(s * 100)
//    l = Math.floor(l * 100)
    return {
      h: h,
      s: s,
      l: this.rgb2lum(r,g,b),
    };
  },


  // http://alienryderflex.com/hsp.html
  rgb2lum: function(r,g,b) {
    // Rec. 709 (sRGB) luma coef
    var Pr = .2126,
      Pg = .7152,
      Pb = .0722;
    return Math.sqrt(
      Pr * r*r +
      Pg * g*g +
      Pb * b*b
    );
  },


  // perceptual Euclidean color distance
  distEuclidean: function(rgb0, rgb1) {
    // Rec. 709 (sRGB) luma coef
    var Pr = .2126,
      Pg = .7152,
      Pb = .0722;

    var rd = 255,
      gd = 255,
      bd = 255;

    var euclMax = Math.sqrt(Pr*rd*rd + Pg*gd*gd + Pb*bd*bd);

    var rd = rgb1[0]-rgb0[0],
      gd = rgb1[1]-rgb0[1],
      bd = rgb1[2]-rgb0[2];

    return Math.sqrt(Pr*rd*rd + Pg*gd*gd + Pb*bd*bd) / euclMax;
  },

  // perceptual Manhattan color distance
  distManhattan: function(rgb0, rgb1) {
    // Rec. 709 (sRGB) luma coef
    var Pr = .2126,
      Pg = .7152,
      Pb = .0722;

    var rd = 255,
      gd = 255,
      bd = 255;

    var manhMax = Pr*rd + Pg*gd + Pb*bd;

    var rd = Math.abs(rgb1[0]-rgb0[0]),
      gd = Math.abs(rgb1[1]-rgb0[1]),
      bd = Math.abs(rgb1[2]-rgb0[2]);

    return (Pr*rd + Pg*gd + Pb*bd) / manhMax;
  },


  hueGroup: function(hue, segs) {
    var seg = 1/segs,
      haf = seg/2;

    if (hue >= 1 - haf || hue <= haf)
      return 0;

    for (var i = 1; i < segs; i++) {
      var mid = i*seg;
      if (hue >= mid - haf && hue <= mid + haf)
        return i;
    }
  },

  satGroup: function(sat) {
    return sat;
  },

  lumGroup: function(lum) {
    return lum;
  },




}
