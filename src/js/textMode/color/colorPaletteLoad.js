var ColorPaletteLoad = function() {
  this.importImage = null;
  this.paletteCanvas = null;

  this.colorPaletteDisplay = null;

  this.colorsAcross = 8;
  this.colorsAcrossValid = true;
  this.importColors = 16;

  this.colorMap = [];
  this.colors = [];
  this.importReady = false;
  this.importReadyCallback = false;
  this.importGeneration = 0;

  this.editor = null;

  this.loadMap = false;
  this.ase = null;
  this.aco = null;

  this.visible = false;

  this.callback = false;
  this.dialogReadyCallback = false;
  this.contentLoaded = false;
  this.contentInitialized = false;

  this.parentComponent = null;

  this.colorPaletteLoadFromURL = null;
  this.importImageObjectURL = null;

  this.name = '';

  this.projectDocument = null;
  this.projectGeneration = undefined;
}

ColorPaletteLoad.prototype = {
  init: function(editor, parentComponent) {
    this.editor = editor;

    if(typeof parentComponent != 'undefined') {
      this.parentComponent = parentComponent;
    }
  },

  captureProjectContext: function() {
    this.projectDocument = g_app.doc;
    this.projectGeneration = g_app.projectGeneration;
  },

  isCurrentProject: function(context) {
    context = context || {
      document: this.projectDocument,
      generation: this.projectGeneration
    };
    if(context.document === null) {
      return typeof context.generation != 'undefined' &&
        g_app.doc === null && context.generation === g_app.projectGeneration;
    }
    return !!context.document && (!g_app.isCurrentProject ||
      g_app.isCurrentProject(context.document, context.generation));
  },

  setImportReady: function(ready) {
    this.importReady = !!ready && this.colorsAcrossValid &&
      this.validateColorsAcross(this.colorsAcross) !== false &&
      Array.isArray(this.colors) && this.colors.length > 0;
    if(this.okButton && typeof this.okButton.setEnabled == 'function') {
      this.okButton.setEnabled(this.importReady);
    }
    if(typeof this.importReadyCallback == 'function') {
      this.importReadyCallback(this.importReady);
    }
  },

  isCurrentImport: function(context) {
    return context.importGeneration === this.importGeneration && this.isCurrentProject(context);
  },

  releaseImportImageObjectURL: function() {
    if(this.importImageObjectURL) {
      var url = window.URL || window.webkitURL;
      url.revokeObjectURL(this.importImageObjectURL);
      this.importImageObjectURL = null;
    }
  },

  resetImportSource: function() {
    this.importGeneration++;
    if(this.importImage) {
      this.importImage.onload = null;
      this.importImage.onerror = null;
    }
    this.releaseImportImageObjectURL();
    this.colors = [];
    this.colorMap = [];
    this.loadMap = false;
    this.name = '';
    this.colorsAcross = 8;
    this.colorsAcrossValid = true;
    $('#colorPaletteLoadColorsAcross').val(this.colorsAcross);
    $('#colorPaletteLoadColorsAcross').removeAttr('aria-invalid');
    this.setImportReady(false);
  },

  resetProjectState: function() {
    this.dialogReadyCallback = false;
    this.projectDocument = null;
    this.projectGeneration = undefined;
    this.visible = false;
    this.callback = false;
    this.resetImportSource();
  },

  show: function(args) {
    this.captureProjectContext();
    this.dialogReadyCallback = false;
    this.importReadyCallback = false;
    if(typeof args != 'undefined') {
      if(typeof args.dialogReadyCallback != 'undefined') {
        this.dialogReadyCallback = args.dialogReadyCallback;
      }
      if(typeof args.importReadyCallback != 'undefined') {
        this.importReadyCallback = args.importReadyCallback;
      }
    }
    this.resetImportSource();

    var _this = this;
    if(this.uiComponent == null) {

      if(this.parentComponent == null) {
        this.uiComponent = UI.create("UI.Dialog", 
          { "id": "colourPaletteLoadDialog", "title": "Color Palette Load", "width": 384 });
      } else {
        this.uiComponent = this.parentComponent;
      }

      this.colorPaletteLoadPanel = UI.create("UI.HTMLPanel");
      this.uiComponent.add(this.colorPaletteLoadPanel);
      this.colorPaletteLoadPanel.load('html/textMode/colorPaletteLoad.html', function() {
        _this.contentLoaded = true;
        if(!_this.isCurrentProject()) {
          return;
        }
        _this.htmlComponentLoaded();
        _this.initContent();
        _this.initEvents();
        _this.contentInitialized = true;

        if(_this.dialogReadyCallback != false) {
          _this.dialogReadyCallback();
        }
      });

      if(!this.parentComponent) {
        this.okButton = UI.create('UI.Button', { "text": "OK", "color": "primary", "enabled": false });
        this.uiComponent.addButton(this.okButton);
        this.okButton.on('click', function(event) {
          if(!_this.isCurrentProject()) {
            return;
          }
          if(_this.setPalette()) {
            UI.closeDialog();
          }
        });

        this.closeButton = UI.create('UI.Button', { "text": "Cancel", "color": "secondary" });
        this.uiComponent.addButton(this.closeButton);
        this.closeButton.on('click', function(event) {
          UI.closeDialog();
        });

        this.uiComponent.on('close', function() {
          _this.visible = false;
        });
      }


      if(this.parentComponent == null) {
        UI.showDialog("colourPaletteLoadDialog");
      }
      this.visible = true;
  
    } else {
      if(!this.isCurrentProject()) {
        return;
      }
      if(this.contentLoaded && !this.contentInitialized) {
        this.htmlComponentLoaded();
        this.initContent();
        this.initEvents();
        this.contentInitialized = true;
      } else if(this.contentLoaded) {
        this.initContent();
      }

      if(this.parentComponent == null) {
        UI.showDialog("colourPaletteLoadDialog");
      }

      this.visible = true;
  
      if(this.contentInitialized && _this.dialogReadyCallback != false &&
          _this.isCurrentProject()) {
        _this.dialogReadyCallback();
      }
    }

  },

  initContent: function() {
    if(this.colorPaletteDisplay == null) {
      this.colorPaletteDisplay = new ColorPaletteDisplay();
      this.colorPaletteDisplay.init(this.editor, { canvasElementId: 'colorPaletteLoadPreview' });
    }
    this.sortMethod = $('#colorPaletteLoadColorsSortMethod').val();
  },

  htmlComponentLoaded: function() {
    this.paletteCanvas = document.getElementById('colorPaletteLoadPreview');
  },

  initEvents: function() {
    var _this = this;

    $('#colorPaletteLoadURLButton').on('click', function(event) {
      var url = $('#colorPaletteLoadURL').val();
      _this.loadPaletteFromURL(url);
    });


    $('#colorPaletteFileChoose').on('click', function() {
      $('#colourPaletteFile').click();
    });

    $('#colorPaletteLoadLospec').on('click', function() {
      _this.loadLospecPalette();
    });


    $('#colorPaletteLoadColorsAcross').on('input change', function(event) {
      _this.setColorsAcross($('#colorPaletteLoadColorsAcross').val());
    });

/*
    $('#colorPaletteLoadColorsSortMethod').on('change', function(event) {
      _this.sortMethod = $('#colorPaletteLoadColorsSortMethod').val();
      _this.sortColors();
    });
*/
    $('#colorPaletteLoadUserColorCount').on('change', function(event) {
      var colorCount = parseInt($(this).val(), 10);
      if(!isNaN(colorCount)) {
        _this.setColorCount(colorCount);
      }

    });

    $('#colorPaletteLoadUserColorCount').on('keyup', function(event) {
      var colorCount = parseInt($(this).val(), 10);
      if(!isNaN(colorCount)) {
        _this.setColorCount(colorCount);
      }
    });

    document.getElementById('colourPaletteFile').addEventListener("change", function(e) {
      var file = document.getElementById('colourPaletteFile').files[0];
      _this.setImportFile(file);
    });

  },

  loadLospecPalette: function() {
    this.resetImportSource();
    if(this.colorPaletteLoadFromURL == null) {
      this.colorPaletteLoadFromURL = new ColorPaletteLoadFromURL();
    }

//    console.log('load palette from url' + url);
    var _this = this;
    var context = { document: this.projectDocument, generation: this.projectGeneration, importGeneration: this.importGeneration };
    this.colorPaletteLoadFromURL.show({
      callback: function(response) {
        if(_this.isCurrentImport(context)) {
          _this.createPaletteFromLoSpec(response.response);
        }
      }
    });

  },

  loadPaletteFromURL: function(url) {
    this.resetImportSource();
    if(this.colorPaletteLoadFromURL == null) {
      this.colorPaletteLoadFromURL = new ColorPaletteLoadFromURL();
    }

    console.log('load palette from url' + url);
    var _this = this;
    var context = { document: this.projectDocument, generation: this.projectGeneration, importGeneration: this.importGeneration };
    this.colorPaletteLoadFromURL.loadURL({
      url: url,
      callback: function(response) {
        if(_this.isCurrentImport(context)) {
          _this.createPaletteFromLoSpec(response.response);
        }
      }
    });

  },

  createPaletteFromLoSpec: function(data) {
    if(!this.isCurrentProject()) {
      return;
    }
    this.name = data.name;
    var author = data.author;
    var colors = [];
    
    for(var i = 0; i < data.colors.length; i++) {
      var color = parseInt(data.colors[i], 16);
      if(!isNaN(color)) {
        colors.push(color);
      }
    }
    
    if(colors.length > 0) {
      this.colors = colors;
      this.setAlpha();

      if(this.callback) {
        this.callback(this.colors);
      }

      if(this.visible) {
        this.setColorCount(colors.length);

        this.autoColorsAcross();
        this.updatePreviewPalette();
      }
    }
  },


  setPalette: function(args) {
    args = args || {};
    var colorsAcross = this.validateColorsAcross(this.colorsAcross);
    if(!this.isCurrentProject() || !this.importReady || !this.colors.length ||
        !this.colorsAcrossValid || colorsAcross === false) {
      return false;
    }
    var callback = false;
    
    callback = args.callback;

    var colorPaletteManager = this.editor.colorPaletteManager;

    var colorPaletteCreated = false;
    var colorPalette = colorPaletteManager.getCurrentColorPalette();

    if(colorPalette == null || (typeof args.createColorPalette != 'undefined' && args.createColorPalette)) {
      colorPaletteCreated = true;
      colorPalette = new ColorPalette();
    }

    var colorsDown = Math.ceil(this.colors.length / colorsAcross);
    colorPalette.setColors(this.colors, colorsAcross, colorsDown);

    if(colorPaletteCreated) {
      if(callback) {
        callback({
          colorPaletteCreated: true,
          colorPalette: colorPalette,          
          presetId: false,
          description: { "name": this.name }
//          description: { "name": tileSet.label },
//          mode: this.importArgs.mode

        });
      }
    } else {
      colorPalette.clearPaletteMaps();
      if(this.loadMap) {
        var colorMapId = colorPalette.setColorPaletteMap('Default Layout', this.colorMap);
        colorPalette.setCurrentColorMap(colorMapId);
      }
      colorPalette.paletteChanged();

      if(g_app.getMode() == 'color palette') {
        g_app.colorPaletteEditor.draw();
      }
    }
    return true;

  },

  validateColorsAcross: function(colorsAcross) {
    if(typeof colorsAcross == 'string' && colorsAcross.trim() == '') {
      return false;
    }
    colorsAcross = Number(colorsAcross);
    if(!Number.isFinite(colorsAcross) || !Number.isInteger(colorsAcross) ||
        colorsAcross < 1 || colorsAcross > 256) {
      return false;
    }
    return colorsAcross;
  },

  setColorsAcross: function(colorsAcross) {
    colorsAcross = this.validateColorsAcross(colorsAcross);
    this.colorsAcrossValid = colorsAcross !== false;
    if(!this.colorsAcrossValid) {
      $('#colorPaletteLoadColorsAcross').attr('aria-invalid', 'true');
      this.setImportReady(false);
      return false;
    }
    $('#colorPaletteLoadColorsAcross').removeAttr('aria-invalid');
    this.colorsAcross = colorsAcross;
    this.updatePreviewPalette();
    return true;
  },

  autoColorsAcross: function() {
    this.colorsAcross = 16;
    if(this.colors.length <= 8) {
      this.colorsAcross = 4;
    } else if(this.colors.length <= 16) {
      this.colorsAcross = 16;
    }
    this.colorsAcrossValid = true;
    $('#colorPaletteLoadColorsAcross').val(this.colorsAcross);
    $('#colorPaletteLoadColorsAcross').removeAttr('aria-invalid');
  },

  createColorMap: function() {
    var colorsAcross = this.validateColorsAcross(this.colorsAcross);
    if(!this.colorsAcrossValid || colorsAcross === false) {
      this.colorMap = [];
      return false;
    }
    var colorCount = this.importColors;
    var colorsDown = Math.ceil(this.importColors / colorsAcross);
    if(colorCount > this.colors.length) {
      colorCount = this.colors.length;
    }

    var index = 0;
    this.colorMap = [];
    for(var y = 0; y < colorsDown; y++) {
      this.colorMap[y] = [];
      for(var x = 0; x < colorsAcross; x++) {
        if(index < colorCount) {
          this.colorMap[y][x] = index;
        } else {
          this.colorMap[y][x] = this.editor.colorPaletteManager.noColor;
        }
        index++;
      }
    }
    return true;
  },


  setImportFile: function(file, callback) {
    this.resetImportSource();
    if(typeof file == 'undefined') {
      return;
    }

    this.captureProjectContext();

    if(typeof callback != 'undefined') {
      this.callback = callback;
    }

    var filename = file.name;
    this.name = filename;
    $('#colorPaletteFileChooseName').text(filename);
    var extension = filename.split('.').pop().toLowerCase();
    this.loadMap = false;

    if(extension == 'png' || extension == 'jpg' || extension == 'gif') {
      this.loadPNG(file);
    }

    if(extension == 'ase') {
      this.loadASE(file);
    }

    if(extension == 'aco') {
      this.loadACO(file);
    }

    if(extension == 'txt' || extension == 'hex') {
      this.loadTXT(file);
    }


    if(extension == 'vpl') {
      this.loadVPL(file);
    }

    if(extension == 'gpl') {
      this.loadGPL(file);
    }

    if(extension == 'act') {
      this.loadBinary(file);
    }

    if(extension == 'json') {
      this.loadJSON(file);
    }

  },

  loadPNG: function(file) {
    var image = new Image();
    this.importImage = image;

    var _this = this;
    var context = { document: this.projectDocument, generation: this.projectGeneration, importGeneration: this.importGeneration };
    this.importImage.onload = function() {
      if(_this.importImage === image && _this.isCurrentImport(context)) {
        _this.createPaletteFromImage();
        _this.releaseImportImageObjectURL();
      }
    }

    var url = window.URL || window.webkitURL;
    var src = url.createObjectURL(file);
    this.importImageObjectURL = src;
    image.onerror = function() {
      if(_this.importImage === image && _this.isCurrentImport(context)) {
        _this.releaseImportImageObjectURL();
        _this.setImportReady(false);
      }
    };
    image.src = src;

  },

  loadTXT: function(file) {
    var _this = this;
    var context = { document: this.projectDocument, generation: this.projectGeneration, importGeneration: this.importGeneration };

    var fileReader = new FileReader();
    fileReader.onload = function(e) {
      var colorText = e.target.result;
        if(_this.isCurrentImport(context)) {
        _this.createPaletteFromPaintTxt(colorText);
      }

    }
    fileReader.readAsText(file);
  },

  loadVPL: function(file) {
    var _this = this;
    var context = { document: this.projectDocument, generation: this.projectGeneration, importGeneration: this.importGeneration };

    var fileReader = new FileReader();
    fileReader.onload = function(e) {
      var colorText = e.target.result;
        if(_this.isCurrentImport(context)) {
        _this.createPaletteFromVPL(colorText);
      }

    }
    fileReader.readAsText(file);

  },

  loadGPL: function(file) {
    var _this = this;
    var context = { document: this.projectDocument, generation: this.projectGeneration, importGeneration: this.importGeneration };

    var fileReader = new FileReader();
    fileReader.onload = function(e) {
      var colorText = e.target.result;
        if(_this.isCurrentImport(context)) {
        _this.createPaletteFromGPL(colorText);
      }

    }
    fileReader.readAsText(file);
  },

  loadACO: function(file) {
    var _this = this;
    var context = { document: this.projectDocument, generation: this.projectGeneration, importGeneration: this.importGeneration };

    var fileReader = new FileReader();
    fileReader.onload = function(e) {
        if(_this.isCurrentImport(context)) {
        _this.createPaletteFromACO(new Uint8Array(e.target.result));
      }
    }
  //  fileReader.readAsText(file);
    fileReader.readAsArrayBuffer(file);


  },
  loadASE: function(file) {
    if(this.ase == null) {
      this.ase = new ASE();
    }

    var _this = this;
    var context = { document: this.projectDocument, generation: this.projectGeneration, importGeneration: this.importGeneration };

    var fileReader = new FileReader();
    fileReader.onload = function(e) {
        if(_this.isCurrentImport(context)) {
        _this.createPaletteFromASE(new Uint8Array(e.target.result));
      }
    }
  //  fileReader.readAsText(file);
    fileReader.readAsArrayBuffer(file);
  },

  loadBinary: function(file) {
    var _this = this;
    var context = { document: this.projectDocument, generation: this.projectGeneration, importGeneration: this.importGeneration };

    var fileReader = new FileReader();
    fileReader.onload = function(e) {
        if(_this.isCurrentImport(context)) {
        _this.createPaletteFromBinary(new Uint8Array(e.target.result));
      }
    }
    fileReader.readAsArrayBuffer(file);    
  },


  errorMessage: function(message) {
    $('#colorPaletteLoadError').text(message);
    if(message != '') {
      $('#colorPaletteLoadError').show();
    } else {
      $('#colorPaletteLoadError').hide();
    }

  },


  loadJSON: function(file) {
    var _this = this;
    var context = { document: this.projectDocument, generation: this.projectGeneration, importGeneration: this.importGeneration };

    var fileReader = new FileReader();
    fileReader.onload = function(e) {
      var colorText = e.target.result;
        if(_this.isCurrentImport(context)) {
        _this.createPaletteFromJSON(colorText);
      }

    }
    fileReader.readAsText(file);
  },

  setAlpha: function() {
    for(var i = 0; i < this.colors.length; i++) {
      var alpha = (0xff) >>> 0;
      var color = (this.colors[i]) >>> 0;
      this.colors[i] = ((alpha << 24) | color) >>> 0;
    }
    this.setImportReady(this.colors.length > 0);
  },

  createPaletteFromJSON: function(jsonString) {
    var colorJson = {};
    try {
      colorJson = $.parseJSON(jsonString);
      if(typeof colorJson.colorPalette != 'undefined') {
        colorJson = colorJson.colorPalette;
      }

      var colors = [];
      if(typeof colorJson.data != 'undefined') {
        for(var i = 0; i < colorJson.data.length; i++) {
          colors.push(colorJson.data[i]);
        }
      }

      if(typeof colorJson.maps != 'undefined' && colorJson.maps.length > 0) {
        this.loadMap = true;
        this.colorMap = [];
        var srcMap = colorJson.maps[0];


        for(var y = 0; y < srcMap.map.length; y++) {
          this.colorMap[y] = [];
          for(var x = 0; x < srcMap.map[y].length; x++) {
            this.colorMap[y][x] = srcMap.map[y][x];
          }
        }
      } else {
        this.loadMap = false;
      }

      if(colors.length > 0) {
        this.colors = colors;
        var colorsAcross = typeof colorJson.across != 'undefined'
          ? this.validateColorsAcross(colorJson.across)
          : false;
        if(colorsAcross === false) {
          this.autoColorsAcross();
        } else {
          this.colorsAcross = colorsAcross;
          this.colorsAcrossValid = true;
          $('#colorPaletteLoadColorsAcross').val(this.colorsAcross);
          $('#colorPaletteLoadColorsAcross').removeAttr('aria-invalid');
        }
        this.setImportReady(true);
        this.setColorCount(colors.length);

        if(this.callback) {
          this.callback(this.colors);
        }

        
        if(this.visible) {
          this.updatePreviewPalette();
        }
        this.errorMessage('');
      } else {
        this.errorMessage('No colors found');

      }
    } catch(err) {
      this.errorMessage('Sorry, unable to interpret file');
    }

  },

  createPaletteFromASE: function(data) {
    if(this.ase == null) {
      this.ase = new ASE();
    }

    var colors = this.ase.readPalette(data);
    if(colors === false) {
      //console.log('no colours');
      this.errorMessage('No colors found');
      return;
    }

    this.colors = colors;
    this.setAlpha();

    if(this.callback) {
      this.callback(this.colors);
    }


    if(this.visible) {
      this.setColorCount(colors.length);
      this.autoColorsAcross();
      this.updatePreviewPalette();
      this.errorMessage('');
    }
  },

  createPaletteFromACO: function(data) {
    if(this.aco == null) {
      this.aco = new ACO();
    }
    var colors = this.aco.readPalette(data);
    if(colors === false) {
//      console.log('no colours');
      this.errorMessage('No colors found');
      return;
    }

    this.colors = colors;
    this.setAlpha();

    if(this.callback) {
      this.callback(this.colors);
    }


    if(this.visible) {
      this.setColorCount(colors.length);

      this.autoColorsAcross();    
      this.updatePreviewPalette();
      this.errorMessage('');
    }

  },
  createPaletteFromImage: function() {
    var colorPaletteManager = null;
    if(this.editor) {
      colorPaletteManager = this.editor.colorPaletteManager;
    } else if(g_app && g_app.textModeEditor) {
      colorPaletteManager = g_app.textModeEditor.colorPaletteManager;
    }

    if(!colorPaletteManager) {
      console.log('couldnt find color palette manager');
      return;
    }
 
    var colors = colorPaletteManager.colorPaletteFromPaletteImg(this.importImage);

    this.colors = colors.colors;
    this.setAlpha();

    if(this.callback) {
      this.callback(this.colors);
    }

    if(this.visible) {
      if(colors.map !== false) {
        this.loadMap = true;
        this.colorMap = colors.map;
      } else {
        this.loadMap = false;
      }

      this.setColorCount(this.colors.length);

      var colorsAcross = this.validateColorsAcross(colors.colorsAcross);
      if(colorsAcross === false) {
        this.autoColorsAcross();
      } else {
        this.colorsAcross = colorsAcross;
        this.colorsAcrossValid = true;
        $('#colorPaletteLoadColorsAcross').val(this.colorsAcross);
        $('#colorPaletteLoadColorsAcross').removeAttr('aria-invalid');
      }
      this.updatePreviewPalette();
    }
  },

  createPaletteFromVPL: function(data) {
    var colors = [];
    data = data.replace("\r", "");
    var lines = data.split("\n");
    for(var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if(line.length > 0) {
        if(line[0] == '#') {
          // its a comment
        } else {
          parts = line.split(' ');
          if(parts.length >= 3) {
            var red = parseInt(parts[0], 16);
            var green = parseInt(parts[1], 16);
            var blue = parseInt(parts[2], 16);
            if(!isNaN(red) && !isNaN(green) && !isNaN(blue)) {
              var rgb = (red << 16) + (green << 8) + (blue);
              colors.push(rgb);
            }
          }

          /*
          if(line.length == 8) {
            // its ARGB
            var rgb = line.substring(2);
            var color = parseInt(rgb, 16);
            if(!isNaN(color)) {
              colors.push(color);
            }
          } else if(line.length == 6) {
            // its RGB
            var color = parseInt(line, 16);
            if(!isNaN(color)) {
              colors.push(color);
            }
          }
          */
        }
      }
    }
    if(colors.length > 0) {
      this.colors = colors;
      this.setAlpha();

      if(this.callback) {
        this.callback(this.colors);
      }
      
      if(this.visible) {
        this.setColorCount(colors.length);
        if(colors.length == 16) {

          this.colorsAcross = 8;
          this.colorsAcrossValid = true;
          $('#colorPaletteLoadColorsAcross').val(this.colorsAcross);
          $('#colorPaletteLoadColorsAcross').removeAttr('aria-invalid');

        } else {
          this.autoColorsAcross();
        }
        this.updatePreviewPalette();
      }
    }

  },

  createPaletteFromPaintTxt: function(data) {
    var colors = [];
    data = data.replace("\r", "");
    var lines = data.split("\n");
    for(var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if(line.length > 0) {
        if(line[0] == ';') {
          // its a comment
        } else {
          if(line.length == 8) {
            // its ARGB
            var rgb = line.substring(2);
            var color = parseInt(rgb, 16);
            if(!isNaN(color)) {
              colors.push(color);
            }
          } else if(line.length == 6) {
            // its RGB
            var color = parseInt(line, 16);
            if(!isNaN(color)) {
              colors.push(color);
            }
          }
        }
      }
    }
    if(colors.length > 0) {
      this.colors = colors;
      this.setAlpha();

      if(this.callback) {
        this.callback(this.colors);
      }

      if(this.visible) {
        this.setColorCount(colors.length);

        this.autoColorsAcross();
        this.updatePreviewPalette();
      }
    }
  },

/*
There is no version number written in the file. The file is 768 or 772 bytes long and contains 256 RGB colors. The first color in the table is index zero. There are three bytes per color in the order red, green, blue. If the file is 772 bytes long there are 4 additional bytes remaining. Two bytes for the number of colors to use. Two bytes for the color index with the transparency color to use. If loaded into the Colors palette, the colors will be installed in the color swatch list as RGB colors.
*/
  createPaletteFromBinary: function(data) {
    var colors = [];
    var colorLength = 3;
    for(var i = 0; i < data.length; i += colorLength) {
      var r = data[i];
      var g = data[i + 1];
      var b = data[i + 2];
      if(!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        var color = (r << 16) + (g << 8) + b;
        colors.push(color);
      }
    }

    if(colors.length > 0) {
      this.colors = colors;
      this.setAlpha();

      if(this.callback) {
        this.callback(this.colors);
      }

      if(this.visible) {
        this.setColorCount(colors.length);

        this.autoColorsAcross();
        this.updatePreviewPalette();
      }
    }

  },

  createPaletteFromGPL: function(data) {
    var colors = [];
    data = data.trim().replace("\r", "");
    var lines = data.split("\n");
    // should be magic at the start
    if(lines.length == 0) {
      return;
    }

    if(lines[0] != 'GIMP Palette') {
      //unknown format
      //console.log('unknown palette format: ' + lines[0]);
      this.errorMessage('Unknown palette format: ' + lines[0]);
      return;
    }

    for(var i = 1; i < lines.length; i++) {
      var line = lines[i].trim();
      if(line[0] == '#') {
        // is a comment
      } else {
        var parts = line.split(/[\s,\t\n]+/);
        if(parts.length >= 3) {
          var r = parseInt(parts[0]);
          var g = parseInt(parts[1]);
          var b = parseInt(parts[2]);
          
          if(!isNaN(r) && !isNaN(g) && !isNaN(b)) {
            var color = (r << 16) + (g << 8) + b;
            colors.push(color);
          }
        }
      }
    }

    if(colors.length > 0) {
      this.colors = colors;
      this.setAlpha();

      if(this.callback) {
        this.callback(this.colors);
      }


      if(this.visible) {
        this.autoColorsAcross();
        this.setColorCount(colors.length);

        this.updatePreviewPalette();
      }
    }


  },

  getColors: function() {
    return this.colors;
  },

  setColorCount: function(colorCount) {
    if(colorCount > 256) {
      colorCount = 256;
    }
    this.importColors = colorCount;
    $('#colorPaletteLoadUserColorCount').val(colorCount);

    this.updatePreviewPalette();
  },


  updatePreviewPalette: function() {
    if(!this.loadMap && !this.createColorMap()) {
      this.setImportReady(false);
      return false;
    }

    $('#colorPaletteLoadColorsAcross').val(this.colorsAcross);
    this.colorPaletteDisplay.setColors(this.colors, { colorCount: this.importColors, colorMap: this.colorMap });
    $('#colorPaletteLoadSettings').show();
    $('#colorPaletteLoadColorCount').html(this.colors.length);    
    this.setImportReady(this.colors.length > 0);
    return true;
  }

}
