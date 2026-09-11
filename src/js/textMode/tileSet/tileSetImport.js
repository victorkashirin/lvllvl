//var checkerboardCanvas = this.editor.checkerboardPattern.getCanvas(previewWidth, previewHeight);
//this.previewContext.drawImage(checkerboardCanvas, 0, 0, previewWidth, previewHeight, 0, 0, previewWidth, previewHeight);



var TileSetImport = function() {
  this.editor = null;
  this.uiComponent = null;  

  this.loadFormat = false;
  this.importReady = false;
  this.importReadyCallback = false;
  this.importGeneration = 0;
  this.onscreenCanvas = null;
  this.loadImage = null;
  this.loadImageCanvas = null;
  this.loadImageData = null;
  this.loadImageObjectURL = null;

  this.indexedColorCanvas = null;
  this.indexedColorPalette = [];


  this.previewScale = 2;

  this.importArgs = {
    scale: 2,
    startChar: 0,
    tileCount: 256,
    characterWidth: 8,
    characterHeight: 8,
    characterHSpacing: 4,
    characterVSpacing: 4,   
    charactersAcross: 32,
    characterHOffset: 0,
    characterVOffset: 0,
    tileSetInvert: false,
    tileSetDirection: 'across',
    characterDataOffset: 0,
    tileData: null
  };


  this.imageLib = new ImageLib();

  this.backgroundCanvas = null;

  this.mouseDownInCanvas = false;

  this.label = '';

  this.loader = null;
  this.loaded = 0;

  this.importCharPad = null;

  this.font = null;
  this.uncd = null;
  this.glyphCanvas = null;

  this.colours = 'source';

  this.palette = [];
  this.paletteMap = {};

  this.parentComponent = null;

  this.tileSet = null;

  this.projectDocument = null;
  this.projectGeneration = undefined;
  this.contentLoaded = false;
  this.contentInitialized = false;
}

TileSetImport.prototype = {
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
    this.importReady = !!ready;
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

  isImportReady: function() {
    if(!this.importReady || !this.loadFormat) {
      return false;
    }
    if(this.loadFormat == 'image') {
      return !!this.loadImageData && this.loadImageData.width > 0 && this.loadImageData.height > 0;
    }
    if(this.loadFormat == 'binary') {
      return !!this.importArgs.tileData && this.importArgs.tileData.length > 0;
    }
    if(this.loadFormat == 'json') {
      return !!this.importArgs.jsonData;
    }
    if(this.loadFormat == 'charpad') {
      return !!this.importCharPad && !!this.importArgs.tileData && this.importArgs.tileData.length > 0;
    }
    if(this.loadFormat == 'font') {
      return !!this.font;
    }
    return false;
  },

  releaseLoadImageObjectURL: function() {
    if(this.loadImageObjectURL) {
      var url = window.URL || window.webkitURL;
      url.revokeObjectURL(this.loadImageObjectURL);
      this.loadImageObjectURL = null;
    }
  },

  resetImportSource: function() {
    this.importGeneration++;
    if(this.loadImage) {
      this.loadImage.onload = null;
      this.loadImage.onerror = null;
    }
    this.releaseLoadImageObjectURL();
    this.loadFormat = false;
    this.loadImageData = null;
    this.label = '';
    this.font = null;
    this.uncd = null;
    this.importCharPad = null;
    this.importArgs.tileData = null;
    this.importArgs.jsonData = null;
    this.importArgs.srcImageData = null;
    this.importArgs.dstImageData = null;
    this.setImportReady(false);
  },

  resetProjectState: function() {
    this.dialogReadyCallback = false;
    this.projectDocument = null;
    this.projectGeneration = undefined;
    this.resetImportSource();
    this.loadImage = null;
    this.tileSet = null;
  },

  start: function(args) {
    this.captureProjectContext();
    
    var _this = this;

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


    if(this.uiComponent == null) {
      var width = 800;
      var height = 600;

      if(this.parentComponent == null) {
        this.uiComponent = UI.create("UI.Dialog", { "id": "tileSetImportDialog", "title": "Load / Import Tile Set", "width": width, "height": height });
      } else {
        this.uiComponent = this.parentComponent;
      }

      this.htmlComponent = UI.create("UI.HTMLPanel");
      this.uiComponent.add(this.htmlComponent);
      this.htmlComponent.load('html/textMode/tileSetImport.html', function() {
        _this.contentLoaded = true;
        if(!_this.isCurrentProject()) {
          return;
        }
        _this.initContent();
        _this.initEvents();
        _this.contentInitialized = true;
        if(_this.dialogReadyCallback !== false) {
          _this.dialogReadyCallback();
        }
    
      });


      if(this.parentComponent == null) {
        this.okButton = UI.create('UI.Button', { "text": "OK", "color": "primary", "enabled": false });
        this.uiComponent.addButton(this.okButton);
        this.okButton.on('click', function(event) {
          if(!_this.isCurrentProject()) {
            return;
          }
          if(_this.importTileSet()) {
            UI.closeDialog();
          }
        });

        this.closeButton = UI.create('UI.Button', { "text": "Cancel", "color": "secondary" });
        this.uiComponent.addButton(this.closeButton);
        this.closeButton.on('click', function(event) {
          UI.closeDialog();

        });
      }

    } else {
      if(this.contentLoaded && !this.contentInitialized && this.isCurrentProject()) {
        this.initContent();
        this.initEvents();
        this.contentInitialized = true;
      }
      if(this.contentInitialized && this.isCurrentProject() &&
          this.dialogReadyCallback !== false) {
        this.dialogReadyCallback();
      }  
    }

    if(this.parentComponent == null) {
      UI.showDialog("tileSetImportDialog");
    }

  },

  initContent: function() {

  },

  initEvents: function() {
    var _this = this;

    document.getElementById('loadTileSetFile').addEventListener("change", function(e) {
      var file = document.getElementById('loadTileSetFile').files[0];
      _this.chooseTileSetFile(file);
    });

    $('#loadTileSetMode').on('change', function() {
      _this.setLoadParameters();
    });

    $('#loadTileSetCanvas').on('mousedown', function(event) {
      _this.mouseDownCanvas(event);
    });

    $('input[name=loadTileSetResize]').on('click', function() {
      _this.setLoadParameters();
    });
    $('#loadTileSetWidth').on('change', function() {
      _this.setLoadParameters();
    });

    $('#loadTileSetHeight').on('change', function() {
      _this.setLoadParameters();
    });

    $('#loadTileSetFileOffset').on('change', function() {
      _this.setLoadParameters();
    });

    $('#loadTileSetFileOffset').on('keyup', function() {
      _this.setLoadParameters();
    });

    $('#loadTileSetHOffset').on('change', function() {
      _this.setLoadParameters();
    });

    $('#loadTileSetHOffset').on('keyup', function() {
      _this.setLoadParameters();
    });

    $('#loadTileSetCount').on('change', function() {
      _this.setLoadParameters();
    });

    $('#loadTileSetCount').on('keyup', function() {
      _this.setLoadParameters();
    });

    $('#loadTileSetStartChar').on('change', function() {
      _this.setLoadParameters();
    });

    $('#loadTileSetCount').on('keyup', function() {
      _this.setLoadParameters();
    });


    $('#loadTileSetVOffset').on('change', function() {
      _this.setLoadParameters();
    });

    $('#loadTileSetVOffset').on('keyup', function() {
      _this.setLoadParameters();
    });


    $('#loadTileSetHSpacing').on('change', function() {
      _this.setLoadParameters();
    });

    $('#loadTileSetHSpacing').on('keyup', function() {
      _this.setLoadParameters();
    });

    $('#loadTileSetVSpacing').on('change', function() {
      _this.setLoadParameters();
    });

    $('#loadTileSetVSpacing').on('keyup', function() {
      _this.setLoadParameters();
    });


    $('#loadTileSetAcross').on('change', function() {
      _this.setLoadParameters();
    });

    $('#loadTileSetWidth').on('keyup', function() {
      _this.setLoadParameters();
    });

    $('#loadTileSetHeight').on('keyup', function() {
      _this.setLoadParameters();
    });

    $('#loadTileSetAcross').on('keyup', function() {
      _this.setLoadParameters();
    });

    $('#loadTileSetInvert').on('click', function() {
      _this.setLoadParameters();      
    });

    $('#loadTileSetMulticolor').on('click', function() {
      _this.setLoadParameters();      
    });

    $('input[name=loadTileSetDirection]').on('click', function() {
      _this.setLoadParameters();      
    });
    $('#loadTileSetPreviewSize').on('change', function() {
//      _this.previewScale = parseInt($('input[name=loadTileSetPreviewSize]:checked').val(), 10);
      _this.previewScale = parseInt($('#loadTileSetPreviewSize').val(), 10);
      _this.previewTileSet();
    });    


    $('#loadTileSetColors').on('change', function() {
      _this.setColorsOption();
    });

    $('#loadTileSetChooseFile').on('click', function() {
      $('#tileSetImportForm')[0].reset();
      
      $('#loadTileSetFile').click();
    });


    $('#loadFontGenerate').on('click', function() {
      _this.generateFontTileset();
    });


  },


  mouseDownCanvas: function(event) {
    UI.captureMouse(this);
    this.mouseDownAtX = event.pageX;
    this.mouseDownAtY = event.pageY;
    this.mouseLastX = event.pageX;
    this.mouseLastY = event.pageY;

    this.mouseDownHOffset = parseInt($('#loadTileSetHOffset').val(), 10);
    this.mouseDownVOffset = parseInt($('#loadTileSetVOffset').val(), 10);
    this.mouseDownFileOffset = parseInt($('#loadTileSetFileOffset').val(), 10);

    this.mouseDownInCanvas = true;
  },

  mouseMove: function(event) {
    var x = event.pageX;
    var y = event.pageY;

    var diffX = Math.floor((x - this.mouseDownAtX) / this.previewScale);
    var diffY = Math.floor((y - this.mouseDownAtY) / this.previewScale);

    if(this.mouseDownInCanvas) {

      if(this.loadFormat == 'image') {
        var hOffset = this.mouseDownHOffset + diffX;
        var vOffset = this.mouseDownVOffset + diffY;
        $('#loadTileSetHOffset').val(hOffset);
        $('#loadTileSetVOffset').val(vOffset);
        this.setLoadParameters();
      } else if(this.loadFormat == 'binary') {
        var fileOffset = this.mouseDownFileOffset;

        if(event.shiftKey || event.altKey) {
          fileOffset -= diffX;
        } else {
          fileOffset -= diffX * 8;
          fileOffset -= diffY * 8 * 16;
        }
        if(fileOffset < 0) {
          fileOffset = 0;
        }
        $('#loadTileSetFileOffset').val(fileOffset);        
        this.setLoadParameters();

      }

    }


  },


  mouseUp: function(event) {

    this.mouseDownInCanvas = false;

  },


  // use the image to set the parameters
  setParametersFromImage: function() {
    var imageWidth = this.loadImage.naturalWidth;
    var imageHeight = this.loadImage.naturalHeight;

    $('#loadTileSetWidth').val(8);
    $('#loadTileSetHeight').val(8);
    $('#loadTileSetCount').val(256);
    $('#loadTileSetStartChar').val(1);
    $('#loadTileSetAcross').val(16);
    $('#loadTileSetHOffset').val(0);
    $('#loadTileSetVOffset').val(0);
    $('#loadTileSetHSpacing').val(0);

  },

  chooseTileSetFile: function(file) {
    this.resetImportSource();
    if(typeof file == 'undefined') {
      return;
    }

    this.captureProjectContext();
    var projectContext = {
      document: this.projectDocument,
      generation: this.projectGeneration,
      importGeneration: this.importGeneration
    };

    var _this = this;
    var filename = file.name;
    var dotPos = filename.lastIndexOf('.');
    var extension = filename.split('.').pop().toLowerCase();

    this.tilename = file.name;

    $('#loadTileSetFileName').text(filename);

    this.label = filename;
    if(dotPos !== -1) {
      this.label = filename.substr(0, dotPos);
    }
    if(this.onscreenCanvas == null) {
      this.onscreenCanvas = document.getElementById('loadTileSetCanvas');
    }

    this.loadFormat = 'binary';

    // try to work out format from extension
    switch(extension) {
      case 'vector':
        this.loadFormat = 'font';
        break;

      case 'ttf':
      case 'otf':
        this.loadFormat = 'font';
        break;

      case 'png':
      case 'gif':
      case 'jpg':
      case 'jpeg':
        this.loadFormat = 'image';
        break;
      case 'json':
        this.loadFormat = 'json';
        break;
      case 'ctm':
        this.loadFormat = 'charpad';
        break;
      default:
        this.loadFormat = 'binary';
    }

    $('#loadTileSetSettings').show();

//    if(extension == 'png' || extension == 'gif' || extension == 'jpg' || extension == 'jpeg') {
    if(this.loadFormat == 'image') {
      this.setLoadParameters(false);

      $('#loadTileSetParameters').show();
      $('#loadTileSetParametersStatic').hide();

      $('#loadTileSetImageSettings').show();
      $('#loadTileSetBinarySettings').hide();
      $('#loadTileSetFontSettings').hide();


      if(!this.loadImageCanvas) {
        this.loadImageCanvas = document.createElement('canvas');
      }

      var image = new Image();
      this.loadImage = image;

      var url = window.URL || window.webkitURL;
      var src = url.createObjectURL(file);
      this.loadImageObjectURL = src;
      var _this = this;

      this.loadImage.onload = function() {
        if(_this.loadImage !== image || !_this.isCurrentImport(projectContext)) {
          return;
        }
        _this.resize = false;//parseInt($('input[name=loadTileSetResize]:checked').val(), 10);

        var imageWidth = image.naturalWidth;
        var imageHeight = image.naturalHeight;
        if(imageWidth <= 0 || imageHeight <= 0) {
          _this.releaseLoadImageObjectURL();
          return;
        }

        _this.loadImageCanvas.width = imageWidth;
        _this.loadImageCanvas.height = imageHeight; 
        _this.loadImageContext = UI.getContextNoSmoothing(_this.loadImageCanvas);

        _this.loadImageContext.drawImage(image, 0, 0);

        _this.loadImageData = _this.loadImageContext.getImageData(0, 0, imageWidth, imageHeight);    

        if(_this.importArgs.mode == 'indexed') {
          //_this.generateColorPalette();                     
          _this.setupIndexedColor();

        } 

        _this.setParametersFromImage();

        // set the parameters and redraw
        _this.setLoadParameters(true);
        _this.setImportReady(true);
        _this.releaseLoadImageObjectURL();
//        _this.previewTileSet();
      }
      image.onerror = function() {
        if(_this.loadImage === image && _this.isCurrentImport(projectContext)) {
          _this.releaseLoadImageObjectURL();
          _this.setImportReady(false);
        }
      };
      image.src = src;
    } else if(this.loadFormat == 'font') {

      $('#loadTileSetParameters').hide();
      $('#loadTileSetParametersStatic').hide();

      $('#loadTileSetImageSettings').hide();
      $('#loadTileSetBinarySettings').hide();
      $('#loadTileSetFontSettings').show();

      var _this = this;
      var fileReader = new FileReader();
      fileReader.onload = function(e) {
        if(!_this.isCurrentImport(projectContext)) {
          return;
        }
//        var byteArray = new Uint8Array(e.target.result);
//        _this.readCharPad(byteArray);
        _this.readFont(e.target.result);
        
      };
      fileReader.readAsArrayBuffer(file);


    } else if(this.loadFormat == 'json') {
      this.setLoadParameters(false);

      $('#loadTileSetParameters').hide();
      $('#loadTileSetParametersStatic').show();

      $('#loadTileSetImageSettings').hide();
      $('#loadTileSetBinarySettings').hide();
      $('#loadTileSetFontSettings').hide();

      // load as json
      var fileReader = new FileReader();
      fileReader.onload = function(e) {
        if(!_this.isCurrentImport(projectContext)) {
          return;
        }
        _this.readJson(e.target.result);
//        var colorText = e.target.result;
//        _this.createPaletteFromJSON(colorText);

      }
      fileReader.readAsText(file);

    } else if(this.loadFormat == 'charpad') {
      // load as a binary file
      $('#loadTileSetParameters').show();
      $('#loadTileSetParametersStatic').hide();

      $('#loadTileSetImageSettings').hide();
      $('#loadTileSetBinarySettings').hide();
      $('#loadTileSetFontSettings').hide();

      var _this = this;
      var fileReader = new FileReader();
      fileReader.onload = function(e) {
        if(!_this.isCurrentImport(projectContext)) {
          return;
        }
        var byteArray = new Uint8Array(e.target.result);
        _this.readCharPad(byteArray);
        
//        var result = _this.importCharPad.readCharPad(byteArray);
//        _this.showCharPad();
      };
      fileReader.readAsArrayBuffer(file);
  

    } else {
      this.setLoadParameters(false);

      if(extension == '64c') {
        $('#loadTileSetFileOffset').val(2);        
        this.importArgs.characterDataOffset = 2;
      }


      // load as a binary file
      $('#loadTileSetParameters').show();
      $('#loadTileSetParametersStatic').hide();

      $('#loadTileSetImageSettings').hide();
      $('#loadTileSetBinarySettings').show();
      $('#loadTileSetFontSettings').hide();

      var _this = this;      
      var fileReader = new FileReader();
      fileReader.onload = function(e) {
        if(!_this.isCurrentImport(projectContext)) {
          return;
        }
        _this.importArgs.tileData = new Uint8Array(e.target.result);
        _this.previewTileSet();
        _this.setImportReady(_this.importArgs.tileData.length > 0);
      }
      fileReader.readAsArrayBuffer(file);
    }
  },


  setLoadParameters: function(refreshPreview) {
      if(!this.isCurrentProject()) {
        return;
      }
      if(typeof refreshPreview == 'undefined') {
        refreshPreview = true;
      }


      var mode = $('#loadTileSetMode').val();
      if(mode != this.importArgs.mode ) {
        this.importArgs.mode = mode;
        if(mode == 'indexed') {
          $('#loadTileSetColorsControl').show();
          //this.generateColorPalette();
          this.setupIndexedColor();
        } else {
          $('#loadTileSetColorsControl').hide();
        }
      }

      
      var resize = parseInt($('input[name=loadTileSetResize]:checked').val(), 10);
      if(!isNaN(resize)) {
        if(this.resize != resize && this.loadImage) {
          this.resize = resize;



          var scale = resize / 100;

          var imageWidth = Math.floor(this.loadImage.naturalWidth * scale);
          var imageHeight = Math.floor(this.loadImage.naturalHeight * scale);          
          this.loadImageCanvas.width = imageWidth;//Math.floor(imageWidth * scale);
          this.loadImageCanvas.height = imageHeight; //Math.floor(imageHeight * scale);

          this.loadImageContext = UI.getContextNoSmoothing(this.loadImageCanvas);
  
          this.loadImageContext.drawImage(this.loadImage, 0, 0, imageWidth, imageHeight);
  
          this.loadImageData = this.loadImageContext.getImageData(0, 0, imageWidth, imageHeight);    

          this.importArgs.pixelSpacing = 1;

          if(mode == 'indexed') {
            this.setupIndexedColor();          
          }
          
        }

        if(!this.loadImage) {
          this.importArgs.pixelSpacing = Math.floor(100 / this.resize);
        }

//        this.resize = resize;
//        this.importArgs.pixelSpacing = Math.floor(100 / this.resize);

      }

      var width = parseInt($('#loadTileSetWidth').val(), 10);

      if(!isNaN(width)) {
        this.importArgs.characterWidth = width;
      }

      var height = parseInt($('#loadTileSetHeight').val(), 10);
      if(!isNaN(height)) {
        this.importArgs.characterHeight = height;
      }

      var spacing = parseInt($('#loadTileSetHSpacing').val(), 10);
      if(!isNaN(spacing)) {
        this.importArgs.characterHSpacing = spacing;
      }

      var spacing = parseInt($('#loadTileSetVSpacing').val(), 10);
      if(!isNaN(spacing)) {
        this.importArgs.characterVSpacing = spacing;
      }

      var across = parseInt($('#loadTileSetAcross').val(), 10);
      if(!isNaN(across)) {
        this.importArgs.charactersAcross = across;
      }

      var fileOffset = parseInt($('#loadTileSetFileOffset').val(), 10);
      if(!isNaN(fileOffset)) {
        this.importArgs.characterDataOffset = fileOffset;
      }

      var hOffset = parseInt($('#loadTileSetHOffset').val(), 10);
      if(!isNaN(hOffset)) {
        this.importArgs.characterHOffset = hOffset;
      }

      var vOffset = parseInt($('#loadTileSetVOffset').val(), 10);
      if(!isNaN(vOffset)) {
        this.importArgs.characterVOffset = vOffset;
      }

      var tileCount = parseInt($('#loadTileSetCount').val(), 10);
      if(!isNaN(tileCount)) {
        this.importArgs.tileCount = tileCount;
      }

      var startChar = parseInt($('#loadTileSetStartChar').val(), 10);
      if(!isNaN(startChar)) {
        this.startChar = startChar - 1;
      }

      this.importArgs.tileSetInvert = $('#loadTileSetInvert').is(':checked');

//      this.tileSetMulticolor = $('#loadTileSetMulticolor').is(':checked');

      this.importArgs.tileSetDirection = $('input[name=loadTileSetDirection]:checked').val();

      if(this.onscreenCanvas && refreshPreview) {
        this.previewTileSet();
      }
  },

  createBackgroundCanvas: function() {

    var previewWidth = this.onscreenCanvas.width;
    var previewHeight = this.onscreenCanvas.height

    if(this.backgroundCanvas == null) {
      this.backgroundCanvas = document.createElement('canvas');
    }

    if(this.backgroundContext == null || this.backgroundCanvas.width != previewWidth || this.backgroundCanvas.height != previewHeight) {
      this.backgroundCanvas.width = previewWidth;
      this.backgroundCanvas.height = previewHeight;
      this.backgroundContext = this.backgroundCanvas.getContext('2d');


      // checkerboard..
      // draw the background image
      this.backgroundContext.fillStyle = '#cccccc';
      this.backgroundContext.fillRect(0, 0, this.backgroundCanvas.width, this.backgroundCanvas.height); 

      var blockSize = 5;
      var blocksAcross = Math.ceil(this.backgroundCanvas.width / blockSize);
      var blocksDown = Math.ceil(this.backgroundCanvas.height / blockSize);

      this.backgroundContext.fillStyle = '#bbbbbb';
      for(var y = 0; y < blocksDown; y++) {
        for(var x = 0; x < blocksAcross; x++) {
          if((x + y) % 2) {
            this.backgroundContext.fillRect(x * blockSize, y * blockSize, 
              blockSize, blockSize); 

          }
        }
      }
    }


    var gridColorR = 240;
    var gridColorG = 40;
    var gridColorB = 240;
    var width = this.backgroundCanvas.width;
    var height = this.backgroundCanvas.height;
    var scale = this.previewScale;
    var backgroundImageData = this.backgroundContext.getImageData(0, 0, width, height);

    // draw the grid...
    var gridVSpacing = (this.importArgs.characterHeight * scale + this.gridLineWidth);
    for(var y = 0; y < height; y += gridVSpacing) {
      for(var x = 0; x < width; x++) {
        for(var w = 0; w < this.gridLineWidth; w++) {
          var dstPos = (x + (y + w) * width) * 4;
          backgroundImageData.data[dstPos] = gridColorR;
          backgroundImageData.data[dstPos + 1] = gridColorG;
          backgroundImageData.data[dstPos + 2] = gridColorB;
          backgroundImageData.data[dstPos + 3] = 255;
        }
      }
    }

    var gridHSpacing = (this.importArgs.characterWidth * scale + this.gridLineWidth);

    for(var y = 0; y < height; y ++) {
      for(var x = 0; x < width; x += gridHSpacing) {
        for(var w = 0; w < this.gridLineWidth; w++) {
          var dstPos = (x + w + (y) * width) * 4;
          backgroundImageData.data[dstPos] = gridColorR;
          backgroundImageData.data[dstPos + 1] = gridColorG;
          backgroundImageData.data[dstPos + 2] = gridColorB;
          backgroundImageData.data[dstPos + 3] = 255;
        }
      }
    }    


    this.backgroundContext.putImageData(backgroundImageData, 0, 0);


  },
 
  readCharPad: function(byteArray) {
    if(!this.isCurrentProject()) {
      return false;
    }
    if(!byteArray || byteArray.length < 4 || byteArray[0] != 67 || byteArray[1] != 84 || byteArray[2] != 77) {
      this.setImportReady(false);
      return false;
    }
    this.importCharPad = new ImportCharPad();
    this.importCharPad.init(this.editor);
    this.importCharPad.readCharPad(byteArray);
    this.importArgs.tileData = this.importCharPad.getCharData();
    this.setLoadParameters(true);
    this.setImportReady(!!this.importArgs.tileData && this.importArgs.tileData.length > 0);
    return this.importReady;

  },

  getFontNumGlyphs: function() {
    return this.font.maxp.numGlyphs;
  },

  readFont: function(buffer) {
    if(!this.isCurrentProject()) {
      return false;
    }
    console.log("READ FONT!!!");
    try {
      this.font = Typr.parse(buffer)[0];
    } catch(err) {
      this.font = null;
      this.setImportReady(false);
      return false;
    }
    if(!this.font) {
      this.setImportReady(false);
      return false;
    }
    console.log(this.font);
    
    
    this.uncd = new Array(this.getFontNumGlyphs());
    for(var i=0; i<130000; i++)  {
      var gid = Typr.U.codeToGlyph(this.font, i);  
      if(gid==0) {
        continue;
      }

      if(this.uncd[gid]==null) {
        this.uncd[gid]=[i];
      } else {
        this.uncd[gid].push(i);
      }
    }
   
    console.log(this.uncd);
    this.importArgs.characterWidth = 60;
    this.importArgs.characterHeight = 60;

    this.previewFontTileSet();
    this.setImportReady(!!this.font);
    return this.importReady;

    // offset to draw..
//    off=0;  gid=0;    

  },

  getTileSet: function() {
    if(!this.isCurrentProject()) {
      return null;
    }
    var tileSet = this.editor.tileSetManager.getCurrentTileSet();
    if(tileSet == null) {
      if(this.tileSet == null) {
        this.tileSet = new TileSet();
      }
      tileSet = this.tileSet;
    }

    return tileSet;
  },

  generateFontTileset: function() {
    this.previewTileSet();
  },
  // sample of font drawing:
  // https://photopea.github.io/Typr.js/demo/index.html
  // https://photopea.github.io/Typr.js/

  // not called??
  drawFontPreview: function() {
    var tileSet = this.getTileSet();


    var tileWidth = parseInt($('#loadFontTileSetWidth').val());
    var tileHeight = parseInt($('#loadFontTileSetHeight').val());
    var fontSize = parseInt($('#loadFontFontSize').val());
    var tileOffsetX = parseInt($('#loadFontTileSetXOffset').val());
    var tileOffsetY = parseInt($('#loadFontTileSetYOffset').val());
    var firstChar = parseInt($('#loadFontFirstChar').val());
    var tileCount = parseInt($('#loadFontTileCount').val());    
    var tilesPerRow = 16;


    console.log('tile> :' + tileWidth + ',' + tileHeight + ',' + fontSize);

 
    if(isNaN(tileWidth) || isNaN(tileHeight) || isNaN(fontSize)) {
      console.log('return');
      return;
    }

    tileSet.readVectorData({
      font: this.font,
      fontSize: fontSize,
      tileWidth: tileWidth,
      tileHeight: tileHeight,
      tileHOffset: tileOffsetX,
      tileVOffset: tileOffsetY,
      tileCount: tileCount,
      firstChar: firstChar
    });
    var dstContext = this.onscreenCanvas.getContext('2d');
    dstContext.putImageData(this.importArgs.dstImageData, 0, 0);

    return;


  },

  validateJsonData: function(jsonData) {
    if(!jsonData || typeof jsonData != 'object' || Array.isArray(jsonData)) {
      return false;
    }
    var width = Number(jsonData.width);
    var height = Number(jsonData.height);
    var maxDimension = typeof TileSet != 'undefined' && TileSet.MAX_TILE_DIMENSION
      ? TileSet.MAX_TILE_DIMENSION : 128;
    if(!Number.isInteger(width) || width < 1 || width > maxDimension ||
        !Number.isInteger(height) || height < 1 || height > maxDimension ||
        !Array.isArray(jsonData.tiles) || jsonData.tiles.length < 1 ||
        jsonData.tiles.length > 4096) {
      return false;
    }

    var pixelsPerTile = width * height;
    for(var tileIndex = 0; tileIndex < jsonData.tiles.length; tileIndex++) {
      var tile = jsonData.tiles[tileIndex];
      if(!tile || typeof tile != 'object' || !Array.isArray(tile.data) ||
          tile.data.length < 1) {
        return false;
      }
      for(var frameIndex = 0; frameIndex < tile.data.length; frameIndex++) {
        var frame = tile.data[frameIndex];
        if(!Array.isArray(frame) || frame.length !== pixelsPerTile) {
          return false;
        }
        for(var pixelIndex = 0; pixelIndex < frame.length; pixelIndex++) {
          if(typeof frame[pixelIndex] != 'number' ||
              !Number.isFinite(frame[pixelIndex])) {
            return false;
          }
        }
      }
      if(typeof tile.props != 'undefined' &&
          (!tile.props || typeof tile.props != 'object' || Array.isArray(tile.props))) {
        return false;
      }
      if(tile.props && tile.props.animated) {
        if(!Number.isInteger(Number(tile.props.frames)) ||
            Number(tile.props.frames) !== tile.data.length ||
            !Number.isFinite(Number(tile.props.ticksPerFrame)) ||
            Number(tile.props.ticksPerFrame) <= 0) {
          return false;
        }
      }
    }

    if(jsonData.type == 'vector') {
      if(!Array.isArray(jsonData.vectorData) ||
          jsonData.vectorData.length !== jsonData.tiles.length ||
          !Number.isFinite(Number(jsonData.unitsPerEm)) ||
          Number(jsonData.unitsPerEm) <= 0 ||
          !Number.isFinite(Number(jsonData.ascent)) ||
          !Number.isFinite(Number(jsonData.descent))) {
        return false;
      }
      for(var vectorIndex = 0; vectorIndex < jsonData.vectorData.length; vectorIndex++) {
        var vector = jsonData.vectorData[vectorIndex];
        if(!vector || typeof vector != 'object' || typeof vector.path != 'string') {
          return false;
        }
      }
    }

    if(typeof jsonData.sortMethods != 'undefined' &&
        !Array.isArray(jsonData.sortMethods)) {
      return false;
    }
    if(typeof jsonData.paletteLayouts != 'undefined') {
      if(!Array.isArray(jsonData.paletteLayouts)) {
        return false;
      }
      for(var layoutIndex = 0; layoutIndex < jsonData.paletteLayouts.length; layoutIndex++) {
        var layout = jsonData.paletteLayouts[layoutIndex];
        if(!layout || typeof layout != 'object') {
          return false;
        }
        if(typeof layout.map != 'undefined') {
          if(!layout.map || typeof layout.map != 'object' ||
              !Array.isArray(layout.map.data)) {
            return false;
          }
          for(var rowIndex = 0; rowIndex < layout.map.data.length; rowIndex++) {
            if(!Array.isArray(layout.map.data[rowIndex])) {
              return false;
            }
          }
        }
      }
    }

    if(typeof jsonData.blockSet != 'undefined') {
      if(!Array.isArray(jsonData.blockSet)) {
        return false;
      }
      for(var blockIndex = 0; blockIndex < jsonData.blockSet.length; blockIndex++) {
        var block = jsonData.blockSet[blockIndex];
        if(!block || typeof block != 'object' || !Array.isArray(block.tileData) ||
            block.tileData.length < 1) {
          return false;
        }
        for(var blockRowIndex = 0; blockRowIndex < block.tileData.length;
            blockRowIndex++) {
          var blockRow = block.tileData[blockRowIndex];
          if(!Array.isArray(blockRow) || blockRow.length < 1) {
            return false;
          }
          for(var blockColumnIndex = 0; blockColumnIndex < blockRow.length;
              blockColumnIndex++) {
            var blockCell = blockRow[blockColumnIndex];
            if(!blockCell || typeof blockCell != 'object' ||
                !Number.isInteger(Number(blockCell.t)) || Number(blockCell.t) < 0 ||
                Number(blockCell.t) >= jsonData.tiles.length) {
              return false;
            }
          }
        }
      }
    }

    jsonData.width = width;
    jsonData.height = height;
    return true;
  },

  readJson: function(jsonString) {
    if(!this.isCurrentProject()) {
      return false;
    }
    this.importArgs.jsonData = null;
    this.setImportReady(false);
    var jsonData = {};
    try {
      jsonData = $.parseJSON(jsonString);
    } catch(err) {
      console.log(err.message);
      return false;
    }
    if(!this.validateJsonData(jsonData)) {
      alert("Sorry, could not interpret the JSON file");
      return false;
    }

    var tileCount = jsonData.tiles.length;

    this.importArgs.jsonData = jsonData;
    $('#loadTileSetWidth').val(jsonData.width);
    $('#loadTileSetHeight').val(jsonData.height);
    $('#loadTileSetCount').val(tileCount);

    $('#loadTileSetWidthStatic').html(jsonData.width);
    $('#loadTileSetHeightStatic').html(jsonData.height);
    $('#loadTileSetCountStatic').html(tileCount);

    this.setLoadParameters(true);
    this.setImportReady(true);
    return true;
//    this.previewTileSet();
  },

  previewFontTileSet: function() {
    var tileWidth = 32;
    var tileHeight = 32;

    this.importArgs.dstCharacterSpacing = 2;
    this.importArgs.characterWidth = 32;
    this.importArgs.characterHeight = 32;
    this.importArgs.dstCharactersAcross = 32;
    this.importArgs.dstCharactersDown = 32;

    this.onscreenCanvas.width = this.importArgs.dstCharacterSpacing + (this.previewScale * this.importArgs.characterWidth + this.importArgs.dstCharacterSpacing) * this.importArgs.dstCharactersAcross;
    this.onscreenCanvas.height = this.importArgs.dstCharacterSpacing + (this.previewScale * this.importArgs.characterHeight + this.importArgs.dstCharacterSpacing) * this.importArgs.dstCharactersDown;

    var dstContext = this.onscreenCanvas.getContext('2d');
    dstContext.clearRect(0, 0, this.onscreenCanvas.width, this.onscreenCanvas.height);    

    var index = 0;
    var across = 32;
    var down = 32;

    var fontScale = tileHeight  / this.font.head.unitsPerEm;

    for(var i = 0; i < this.uncd.length; i++) {
      var y = tileHeight * Math.floor(i / across);
      var x = tileWidth * (i % across);

      if(typeof this.uncd[i] != 'undefined') {
        var glyphIndex = this.uncd[i][0];
        glyphIndex = i;
        var path = Typr.U.glyphToPath(this.font, glyphIndex);
        dstContext.save();
    
      //  dstContext.clearRect(0, 0, tileWidth, tileHeight);
    
        dstContext.translate( x, y );  
    
        dstContext.scale(fontScale,-fontScale);
        dstContext.beginPath();
        Typr.U.pathToContext(path, dstContext);
        dstContext.fillStyle = '#ffffff';    //  
        dstContext.fill();
    
        dstContext.restore();

        if(i > 1024) {
          return;
        }
      }
      
    }
    /*
    glyphIndex = c + firstChar;//1772;
    var path = Typr.U.glyphToPath(font, glyphIndex);
    ctx.save();

    ctx.clearRect(0, 0, tileWidth, tileHeight);

    ctx.translate( tileHOffset, tileVOffset  + fontSize);  

    ctx.scale(fontScale,-fontScale);
    ctx.beginPath();
    Typr.U.pathToContext(path, ctx);
    ctx.fillStyle = '#ffffff';    //  
    ctx.fill();

    ctx.restore();
    */

  },

  setupIndexedColor: function() {

    var srcImageData = this.loadImageData;
    if(!srcImageData) {
      return;
    }

    this.palette = [];
    this.paletteMap = {};

    // make first colour transparent
    this.palette.push(0);
    this.paletteMap['c0'] = { "index": 0, "count": 0 };

    var srcWidth = srcImageData.width;
    var srcHeight = srcImageData.height;

    var colorCount = 0;
    for(var y = 0; y < srcHeight; y++) {
      for(var x = 0; x < srcWidth; x++) {        
        var srcPos = (x + y * srcWidth) * 4;

        var r = srcImageData.data[srcPos] & 0xff;
        var g = srcImageData.data[srcPos + 1] & 0xff;
        var b = srcImageData.data[srcPos + 2] & 0xff;
        var a = srcImageData.data[srcPos + 3] & 0xff;

        var rgb =  (r << 16) | (g << 8) | b;
        var argb = ( (a << 24) | (rgb >>> 0)) >>> 0;
        var index = false;
        if(typeof this.paletteMap['c' + argb] != 'undefined') {
          index = this.paletteMap['c' + argb].index;
          this.paletteMap['c' + argb].count++;
        } else {
          index = this.palette.length;
          this.palette[index] = argb;
          this.paletteMap['c' + argb] = { "index": index, "count": 1 };
          colorCount++;
          if(colorCount > 255) {
            console.log('too many colors!');
            y = srcHeight + 1;
            x = srcWidth + 1;
            break;
          }
        }
      }
    }


    console.log('ciolour counr = ' + colorCount);

    var html = '';
    var selectedOption = false;
    if(colorCount < 256) {
      selectedOption = 'source';
      html += '<option value="source">Source Image</option>';
    }

    var colorOptions = [64,32,16,8];

    for(var i = 0; i < colorOptions.length; i++) {
      if(colorCount > colorOptions[i]) {
        if(selectedOption === false) {
          selectedOption = colorOptions[i];
        }
        html += '<option value="' + colorOptions[i] + '">Source Image (' + colorOptions[i] + ' Colors)</option>';
      }
    }

    var colorPalette = this.editor.colorPaletteManager.getCurrentColorPalette();  
    if(colorPalette) {
      html += '<option value="0">Current Palette</option>';
    }

    $('#loadTileSetColors').html(html);
    $('#loadTileSetColors').val(selectedOption);

    this.setLoadParameters();
    this.setColorsOption();


  },


  setColorsOption: function() {
    /*
    var resize = this.resize;
    if(resize === false) {
      resize = parseInt($('input[name=loadTileSetResize]:checked').val(), 10);
    }
    */
    var scale = this.resize / 100;
 
    var colorCount = $('#loadTileSetColors').val();

    var imageWidth = Math.floor(this.loadImage.naturalWidth * scale);
    var imageHeight = Math.floor(this.loadImage.naturalHeight * scale);

    if(this.indexedColorCanvas == null) {
      this.indexedColorCanvas = document.createElement('canvas');
    }

    this.indexedColorCanvas.width = imageWidth;//this.loadImage.naturalWidth;
    this.indexedColorCanvas.height = imageHeight;//this.loadImage.naturalHeight;
    var context = UI.getContextNoSmoothing(this.indexedColorCanvas);
    
    context.drawImage(this.loadImage,  0, 0, this.loadImage.naturalWidth, this.loadImage.naturalHeight, 0, 0, imageWidth, imageHeight,);


    if(colorCount != "source") {
      colorCount = parseInt(colorCount, 10);

      if(!isNaN(colorCount)) {
        var imageData = context.getImageData(0, 0, imageWidth, imageHeight);


        this.indexedColorPalette = [];
        this.palette = [];

        this.paletteMap = {};

        // first colour is transparent
        this.palette.push(0);
        this.paletteMap['c0'] = { "index": 0, "count": 0 };


        if(colorCount != 0) {
          var palette = ImageUtils.createColorPaletteFromImage(colorCount, this.indexedColorCanvas);
          for(var i = 0 ; i < palette.length; i+= 4) {
            var r = palette[i];
            var g = palette[i + 1];
            var b = palette[i + 2];
            this.indexedColorPalette.push([r,g,b,255]);

            var a = 255;
            var rgb =  (r << 16) | (g << 8) | b;
            var argb = ( (a << 24) | (rgb >>> 0)) >>> 0;
            
            var index = this.palette.length;
            this.palette[index] = argb;
            this.paletteMap['c' + argb] = { "index": index, "count": 1 };
      

          }
        } else {
          var colorPalette = this.editor.colorPaletteManager.getCurrentColorPalette();  
          if(colorPalette) {
            var paletteColorCount = colorPalette.getColorCount();       
            for(var i = 0; i < paletteColorCount; i++) {
              this.indexedColorPalette.push(colorPalette.getRGBA(i));              
            } 
          }
        }

        this.imageLib.palette = this.indexedColorPalette;
        this.imageLib.setImageData(imageData);
      
        imageData = this.imageLib.reduceNearest();

        context.putImageData(imageData, 0, 0);
      }
    }


    this.previewImageTileSet();
  },

  previewImageTileSet: function() {
    if(!this.isCurrentProject()) {
      return;
    }
    var tileSet = this.getTileSet();
    if(!tileSet) {
      return;
    }

    var scale = this.resize / 100;

    var imageWidth = Math.floor(this.loadImage.naturalWidth * scale);
    var imageHeight = Math.floor(this.loadImage.naturalHeight * scale);


    var tileWidth = this.importArgs.characterWidth;
    var tileHeight = this.importArgs.characterHeight;

    var tileHSpacing = this.importArgs.characterHSpacing;
    var tileVSpacing = this.importArgs.characterVSpacing;


    var tilesAcross = this.importArgs.charactersAcross;
    var tilesDown = 100;//this.importArgs.charactersAcross;
    
    var hOffset = this.importArgs.characterHOffset;
    var vOffset = this.importArgs.characterVOffset;    

//    _this.loadImageContext = _this.loadImageCanvas.getContext('2d');

    if(this.importArgs.mode == 'indexed' && this.indexedColorCanvas != null) {
      this.loadImageContext.drawImage(this.indexedColorCanvas, 0, 0);
    } else {
      this.loadImageContext.drawImage(this.loadImage, 0, 0, this.loadImage.naturalWidth, this.loadImage.naturalHeight,
        0, 0, imageWidth, imageHeight);
    }

    var srcImageData = this.loadImageContext.getImageData(
      0, 0, 
      imageWidth, 
      imageHeight);

    var dstImageData = this.loadImageContext.getImageData(
      0, 0, 
      imageWidth, 
      imageHeight);


    // textmode?
    var onVal = 255;
    var offVal = 0;

    for(var y = 0; y < imageHeight; y++) {
      for(var x = 0; x < imageWidth; x++) {
        var srcPos = (y * imageWidth + x) * 4;
        var r = srcImageData.data[srcPos];
        var g = srcImageData.data[srcPos + 1];
        var b = srcImageData.data[srcPos + 2];

        if(this.importArgs.mode == 'textmode') {
          if(r + g + b > 200) {
            r = onVal;
            g = onVal;
            b = onVal;            
          } else {
            r = offVal;
            g = offVal;
            b = offVal;

          }
          srcImageData.data[srcPos] = r;
          srcImageData.data[srcPos + 1] = g;
          srcImageData.data[srcPos + 2] = b;        
        }
        
        r = Math.floor(r / 10) + 80;
        g = Math.floor(g / 10) ;
        b = Math.floor(b / 10) + 80;          
        dstImageData.data[srcPos] = r;
        dstImageData.data[srcPos + 1] = g;
        dstImageData.data[srcPos + 2] = b;
      }
    }



    this.importArgs.dstImageData = dstImageData;// dstContext.getImageData(0, 0, imageWidth, imageHeight);
    this.importArgs.scale = 1;//this.previewScale;
    this.importArgs.palette = this.palette;
    this.importArgs.paletteMap = this.paletteMap;    
    this.importArgs.srcImageData = srcImageData;

    this.importArgs.dstPosIsSrcPos = true;
    
    tileSet.readImageData(this.importArgs);
    this.importArgs.dstPosIsSrcPos = false;


    this.loadImageContext.putImageData(dstImageData, 0, 0);

    // prepare the destination image data
    this.onscreenCanvas.width = imageWidth * this.previewScale;
    this.onscreenCanvas.height = imageHeight * this.previewScale;
    var onscreenContext = UI.getContextNoSmoothing(this.onscreenCanvas);

    onscreenContext.drawImage(this.loadImageCanvas, 0, 0, imageWidth * this.previewScale, imageHeight * this.previewScale);

    onscreenContext.strokeStyle = '#881188';
    onscreenContext.strokeWidth = 1;
    
    var x = hOffset + tileHSpacing;
    onscreenContext.beginPath();

    if(tileHSpacing == 0) {
      while(x > 0) {
        x -= (tileWidth  + tileHSpacing);
      }
      while(x < imageWidth) {
        onscreenContext.moveTo(x * this.previewScale + 0.5, 0);
        onscreenContext.lineTo(x * this.previewScale + 0.5, imageHeight * this.previewScale);
        x += tileWidth + tileHSpacing;
      }
    }

    var y = vOffset + tileVSpacing;

    if(tileVSpacing == 0) {
      while(y > 0) {
        y -= (tileHeight + tileVSpacing);
      }
      while(y < imageHeight) {

        onscreenContext.moveTo(0, y * this.previewScale + 0.5);
        onscreenContext.lineTo(imageWidth * this.previewScale, y * this.previewScale + 0.5);
        y += tileHeight + tileVSpacing;
      }
    }

    onscreenContext.stroke();


    /*
    var dstContext = UI.getContextNoSmoothing(this.loadTileSetCanvas);
    dstContext.fillStyle = 'black';
    dstContext.fillRect(0, 0, imageWidth, imageHeight);
//    dstContext.drawImage(this.backgroundCanvas, 0, 0);
    
    this.importArgs.dstImageData = dstContext.getImageData(0, 0, imageWidth, imageHeight);
    this.importArgs.scale = this.previewScale;
    this.importArgs.palette = this.palette;
    this.importArgs.paletteMap = this.paletteMap;
    
    this.importArgs.srcImageData = imageData;

    this.importArgs.dstPosIsSrcPos = true;
    tileSet.readImageData(this.importArgs);
    this.importArgs.dstPosIsSrcPos = false;

//    dstContext.putImageData(this.importArgs.dstImageData, 0, 0);


    // prepare the destination image data
    this.loadTileSetCanvas.width = imageWidth * this.previewScale;
    this.loadTileSetCanvas.height = imageHeight * this.previewScale;
    var dstContext = UI.getContextNoSmoothing(this.loadTileSetCanvas);

    dstContext.drawImage(this.loadImageCanvas, 0, 0, imageWidth * this.previewScale, imageHeight * this.previewScale);
*/
  },

  previewImageTileSetOld: function() {
    /*
    _this.loadImageCanvas.width = imageWidth;
    _this.loadImageCanvas.height = imageHeight;
    _this.loadImageContext = _this.loadImageCanvas.getContext('2d');

    _this.loadImageContext.drawImage(_this.loadImage, 0, 0);

    _this.loadImageData = _this.loadImageContext.getImageData(0, 0, imageWidth, imageHeight);    
    */

    console.log('preview image tileset');
    var imageWidth = this.loadImage.naturalWidth;
    var imageHeight = this.loadImage.naturalHeight;
    var tileWidth = this.importArgs.characterWidth;
    var tileHeight = this.importArgs.characterHeight;
    var tileCount = this.importArgs.tileCount;

    var tilesAcross = this.importArgs.charactersAcross;
    var tilesDown = 100;//this.importArgs.charactersAcross;
    
    var hOffset = this.importArgs.characterHOffset;
    var vOffset = this.importArgs.characterVOffset;

    var tileCounter = 0;


    this.loadImageContext.drawImage(this.loadImage, 0, 0);

    var tileHSpacing = this.importArgs.characterHSpacing;
    var tileVSpacing = this.importArgs.characterVSpacing;

    var imageData = this.loadImageContext.getImageData(
      0, 0, 
      imageWidth, 
      imageHeight);


    // textmode?
    if(this.importArgs.mode == 'textmode') {

      var onVal = 255;
      var offVal = 0;

      for(var y = 0; y < imageHeight; y++) {
        for(var x = 0; x < imageWidth; x++) {
          var srcPos = (y * imageWidth + x) * 4;
          var r = imageData.data[srcPos];
          var g = imageData.data[srcPos + 1];
          var b = imageData.data[srcPos + 2];

          if(r + g + b > 200) {
            r = onVal;
            g = onVal;
            b = onVal;            
          } else {
            r = offVal;
            g = offVal;
            b = offVal;

          }

          imageData.data[srcPos] = r;
          imageData.data[srcPos + 1] = g;
          imageData.data[srcPos + 2] = b;          
  
        }
      }

    }

    var xInSpacing = false;
    var xInTile = false;
    var xOffset = 0;

    var yInSpacing = false;
    var yInTile = false;
    var yOffset = 0;

    var xTile = 0; 
    var yTile = 0;

    

    yOffset = vOffset;

    if(yOffset == 0) {
      if(tileVSpacing == 0) {
        yInTile = tileHeight;      
        yTile++;
      } else {
        yInSpacing = tileVSpacing;
      }
    } else if(yOffset > 0) {
      yInTile = false;
      yInSpacing = false;
    } else {
      // yOffset is < 0
      var tilePlusSpacing = tileHeight + tileVSpacing;
      var margin = -yOffset;
      yTile = Math.ceil(margin / tilePlusSpacing);
      var leftOver = margin % tilePlusSpacing;

      if(leftOver >= tileVSpacing) {
        // in tile
        leftOver = leftOver - tileVSpacing;
        yInSpacing = false;
        yInTile = tileWidth - leftOver;
      } else {
        // in spacing
        yInTile = false;
        yInSpacing = tileVSpacing - leftOver;
      }
      yOffset = 0;

    }

    var rowStartTileCount = tileCounter;

    for(var y = 0; y < imageHeight; y++) {

      xInSpacing = false;
      xInTile = false;
      xTile = 0;
      xOffset = hOffset;

      if(xOffset == 0) {
        if(tileHSpacing == 0) {
          xInTile = tileWidth;
          
          xTile++;
          tileCounter++;
        } else {
          xInSpacing = tileHSpacing;
        }
      } else if(xOffset > 0) {
        xInTile = false;
        xInSpacing = false;
      } else {
        var tilePlusSpacing = tileWidth + tileHSpacing;
        var margin = -xOffset;

        xTile = Math.ceil( (margin - tileHSpacing) / tilePlusSpacing);
        if( (margin - tileHSpacing) % tilePlusSpacing == 0) {
          // just reached front edge of tile..
          xTile++;
        }

        if(xTile > 0 && yInTile == tileHeight) {
          tileCounter += xTile - 1;
        }
        var leftOver = margin % tilePlusSpacing;

        if(leftOver >= tileHSpacing) {
          // in tile
          leftOver = leftOver - tileHSpacing;
          xInSpacing = false;
          xInTile = tileWidth - leftOver;
          if(leftOver == 0) {
            if(yInTile == tileHeight) {
//              tileCounter++
            }
          }
        } else {
          // in spacing
          xInTile = false;
          xInSpacing = tileHSpacing - leftOver;
        }
        xOffset = 0;
      }
      

      if(yInTile == tileHeight) {
        rowStartTileCount = tileCounter;
      }

      tileCounter = rowStartTileCount;
      
      for(var x = 0; x < imageWidth; x++) {
        
        var srcPos = (y * imageWidth + x) * 4;
        if(tileCounter > tileCount || xOffset > 0 || yOffset > 0 || xInTile === false || yInTile === false || xTile > tilesAcross || yTile > tilesDown) {
          var r = imageData.data[srcPos];
          var g = imageData.data[srcPos + 1];
          var b = imageData.data[srcPos + 2];

          r = Math.floor(r / 10) + 80;
          g = Math.floor(g / 10) ;
          b = Math.floor(b / 10) + 80;

          imageData.data[srcPos] = r;
          imageData.data[srcPos + 1] = g;
          imageData.data[srcPos + 2] = b;

          if(xOffset > 0) {
            xOffset--;
            if(xOffset <= 0) {
              if(tileHSpacing == 0) {
                xInTile = tileWidth;
                xTile++;
                if(xTile <= tilesAcross && yInTile !== false) {
                  tileCounter++
                }
              } else {
                xInSpacing = tileHSpacing;
              }
            }
          } else {
            if(xInSpacing !== false) {
              xInSpacing--;
              if(xInSpacing <= 0) {
                xInSpacing = false;
                xInTile = tileWidth;
                xTile++;
                if(xTile <= tilesAcross && yInTile !== false) {
                  tileCounter++
                }
              }
            }
          }
        } else {
          // pixel included!



          xInTile --;
          if(xInTile <= 0) {
            if(tileHSpacing == 0) {
              xInTile = tileWidth;
              xTile++;
              if(xTile <= tilesAcross) {

                tileCounter++
              }
            } else {
              xInTile = false;
              xInSpacing = tileHSpacing;
            }
          }
        }
      }

      if(yInTile === false || yOffset > 0) {
        if(yOffset > 0) {
          yOffset--;
          if(yOffset <= 0) {
            if(tileVSpacing == 0) {
              yInTile = tileHeight;
              yTile++;
            } else {
              yInSpacing = tileVSpacing;
            }
          }
        } else {
          yInSpacing--;
          if(yInSpacing <= 0) {
            yInSpacing = false;
            yInTile = tileHeight;
            yTile++;
          }
        }
      } else {
        yInTile--;
        if(yInTile <= 0) {
          if(tileVSpacing == 0) {
            yInTile = tileHeight;
            yTile++;

          } else {
            yInTile = false;
            yInSpacing = tileVSpacing;
          }
        }
      }


    }   
    
    this.loadImageContext.putImageData(imageData, 0, 0);

    // prepare the destination image data
    this.onscreenCanvas.width = imageWidth * this.previewScale;
    this.onscreenCanvas.height = imageHeight * this.previewScale;
    var dstContext = UI.getContextNoSmoothing(this.onscreenCanvas);

    dstContext.drawImage(this.loadImageCanvas, 0, 0, imageWidth * this.previewScale, imageHeight * this.previewScale);

    if(this.importArgs.characterHSpacing == 0) {
      // draw vertical grid lines
    }

    if(this.importArgs.characterVSpacing == 0) {
      // draw horizontal grid lines
    }
  },

  previewTileSet: function() {
    if(!this.isCurrentProject()) {
      return;
    }
    var tileSet = this.getTileSet();
    if(!tileSet) {
      return;
    }
    

    if(this.loadFormat == 'image') {
      this.previewImageTileSet();
      return;
    }

    this.gridLineWidth = 2;

    // make args belong to the object?
    this.importArgs.dstCharacterSpacing = this.gridLineWidth;
    this.importArgs.dstCharactersAcross = 16;
    this.importArgs.dstCharactersDown = Math.ceil(this.importArgs.tileCount / this.importArgs.dstCharactersAcross);

    var monochromeThreshold = 200;

    var gridColorR = 240;
    var gridColorG = 40;
    var gridColorB = 240;
    var gridColor = (gridColorR << 16) + (gridColorG << 8) + (gridColorB);
    var gridColorHexString = ("000000" + gridColor.toString(16)).substr(-6);  

    if(this.loadFormat == 'font') {
      var tileWidth = parseInt($('#loadFontTileSetWidth').val());
      var tileHeight = parseInt($('#loadFontTileSetHeight').val());    

      this.importArgs.characterWidth = tileWidth;
      this.importArgs.characterHeight = tileHeight;
    }

    // prepare the destination image data
    this.onscreenCanvas.width = this.importArgs.dstCharacterSpacing + (this.previewScale * this.importArgs.characterWidth + this.importArgs.dstCharacterSpacing) * this.importArgs.dstCharactersAcross;
    this.onscreenCanvas.height = this.importArgs.dstCharacterSpacing + (this.previewScale * this.importArgs.characterHeight + this.importArgs.dstCharacterSpacing) * this.importArgs.dstCharactersDown;

    var dstContext = this.onscreenCanvas.getContext('2d');

    this.createBackgroundCanvas();
    dstContext.drawImage(this.backgroundCanvas, 0, 0);
    this.importArgs.dstImageData = dstContext.getImageData(0, 0, this.onscreenCanvas.width, this.onscreenCanvas.height);
    this.importArgs.scale = this.previewScale;
    this.importArgs.palette = this.palette;
    this.importArgs.paletteMap = this.paletteMap;

    /*
    if(this.loadFormat == 'image') {
      this.importArgs.srcImageData = this.loadImageData;

      tileSet.readImageData(this.importArgs);
      dstContext.putImageData(this.importArgs.dstImageData, 0, 0);

    }
    */


    if(this.loadFormat == 'json') {
//      tileSet.readJsonData(this.importArgs);

      tileSet.readJsonDataV1(this.importArgs);
      dstContext.putImageData(this.importArgs.dstImageData, 0, 0);      
    }

    if(this.loadFormat == 'charpad') {
//      tileSet.readCharPad(this.importArgs);
      this.importArgs.tileData = this.importCharPad.getCharData();

      console.log(this.importArgs);
      tileSet.readBinaryData(this.importArgs);
      dstContext.putImageData(this.importArgs.dstImageData, 0, 0);
    }

    if(this.loadFormat == 'binary') {

      tileSet.readBinaryData(this.importArgs);
      dstContext.putImageData(this.importArgs.dstImageData, 0, 0);

    }


    /*

    if(this.loadFormat == 'font') {
//      this.drawFontPreview();

      var tileWidth = parseInt($('#loadFontTileSetWidth').val());
      var tileHeight = parseInt($('#loadFontTileSetHeight').val());
      var fontSize = parseInt($('#loadFontFontSize').val());
      var tileOffsetX = parseInt($('#loadFontTileSetXOffset').val());
      var tileOffsetY = parseInt($('#loadFontTileSetYOffset').val());
      var firstChar = parseInt($('#loadFontFirstChar').val());
      var tileCount = parseInt($('#loadFontTileCount').val());

      var tilesPerRow = 16;

      console.log('tile> :' + tileWidth + ',' + tileHeight + ',' + fontSize);


      if(isNaN(tileWidth) || isNaN(tileHeight) || isNaN(fontSize)) {
        return;
      }

      tileSet.readVectorData({
        font: this.font,
        fontSize: fontSize,
        tileWidth: tileWidth,
        tileHeight: tileHeight,
        tileHOffset: tileOffsetX,
        tileVOffset: tileOffsetY,
        dstImageData: this.importArgs.dstImageData,
        firstChar: firstChar,
        tileCount: tileCount
      });
      dstContext.putImageData(this.importArgs.dstImageData, 0, 0);

    }

    */
  },


  generateColorPalette: function() {
    var srcImageData = this.loadImageData;
    if(!srcImageData) {
      return;
    }

    this.palette = [];
    this.paletteMap = {};

    // make first colour transparent
    this.palette.push(0);
    this.paletteMap['c0'] = { "index": 0, "count": 0 };

    var srcWidth = srcImageData.width;
    var srcHeight = srcImageData.height;

    var colourCount = 0;
    for(var y = 0; y < srcHeight; y++) {
      for(var x = 0; x < srcWidth; x++) {        
        var srcPos = (x + y * srcWidth) * 4;

        var r = srcImageData.data[srcPos] & 0xff;
        var g = srcImageData.data[srcPos + 1] & 0xff;
        var b = srcImageData.data[srcPos + 2] & 0xff;
        var a = srcImageData.data[srcPos + 3] & 0xff;

        var rgb =  (r << 16) | (g << 8) | b;
        var argb = ( (a << 24) | (rgb >>> 0)) >>> 0;
        var index = false;
        if(typeof this.paletteMap['c' + argb] != 'undefined') {
          index = this.paletteMap['c' + argb].index;
          this.paletteMap['c' + argb].count++;
        } else {
          index = this.palette.length;
          this.palette[index] = argb;
          this.paletteMap['c' + argb] = { "index": index, "count": 1 };
          colourCount++;
          if(colourCount > 255) {
            console.log('too many colors!');
            return;
          }
        }
      }
    }


  },

  importTileSet: function(args) {
    args = args || {};
    if(!this.isCurrentProject() || !this.isImportReady()) {
      return false;
    }
    var callback = false;
    var colorPalette = null;

    callback = args.callback;

    var tileSetCreated = false;
    var tileSet = this.editor.tileSetManager.getCurrentTileSet();

    if(tileSet == null || (typeof args.createTileSet != 'undefined' && args.createTileSet)) {
      tileSet = new TileSet();
      tileSet.document = this.projectDocument;
      tileSet.projectGeneration = this.projectGeneration;
      tileSetCreated = true;
    }

    if(this.loadFormat == 'image') {


      this.importArgs.srcImageData = this.loadImageData;
      this.importArgs.scale = 1;
      this.importArgs.palette = this.palette;
      this.importArgs.paletteMap = this.paletteMap;
      this.importArgs.dstImageData = null;

      var layer = this.editor.layers.getSelectedLayerObject();
      if(layer && layer.getType() == 'grid') {
        switch(this.importArgs.mode) {
          case 'indexed':
            layer._setMode(TextModeEditor.Mode.INDEXED);
            break;
          case 'rgb':
            layer._setMode(TextModeEditor.Mode.RGB);
            break;
          case 'textmode':
            // set the mode without setting the tileset
            if(layer.getMode() != TextModeEditor.Mode.TEXTMODE) {
              layer._setMode(TextModeEditor.Mode.TEXTMODE);
            }
            break;
        }
      }

      if(this.importArgs.mode == 'indexed') {
        //indexedColorCanvas

        colorPalette = this.editor.colorPaletteManager.getCurrentColorPalette();
        if(!colorPalette) {
          colorPalette = new ColorPalette();
        }
        var colorsAcross = 8;
        var colorsDown = Math.ceil(this.importArgs.palette.length / colorsAcross);
        colorPalette.setColors(this.importArgs.palette, colorsAcross, colorsDown);
        var context = this.indexedColorCanvas.getContext('2d');
        this.importArgs.srcImageData = context.getImageData(0, 0, this.indexedColorCanvas.width, this.indexedColorCanvas.height);
        
      }

      

      tileSet.readImageData(this.importArgs);      

      tileSet.setType('ascii');
      tileSet.setLabel(this.label);
      tileSet.setSortMethods();
    }

    if(this.loadFormat == 'binary') {
      this.importArgs.scale = 1;
      this.importArgs.dstImageData = null;
      tileSet.readBinaryData(this.importArgs);
      tileSet.setType('ascii');
      tileSet.setLabel(this.label);
      tileSet.setSortMethods();
    }

    if(this.loadFormat == 'charpad') {
      this.importArgs.scale = 1;
      this.importArgs.dstImageData = null;

      tileSet.readBinaryData(this.importArgs);
      tileSet.setType('ascii');
      tileSet.setLabel(this.label);
      tileSet.setSortMethods();
    }
    if(this.loadFormat == 'json') {
      this.importArgs.scale = 1;
      this.importArgs.dstImageData = null;
      //tileSet.readJsonData(this.importArgs);
      tileSet.readJsonDataV1(this.importArgs);
    }

    if(this.loadFormat == 'font') {
      //      this.drawFontPreview();

      var tileWidth = parseInt($('#loadFontTileSetWidth').val());
      var tileHeight = parseInt($('#loadFontTileSetHeight').val());
      var fontSize = parseFloat($('#loadFontFontSize').val());
      var tileOffsetX = parseFloat($('#loadFontTileSetXOffset').val());
      var tileOffsetY = parseFloat($('#loadFontTileSetYOffset').val());
      var firstChar = parseInt($('#loadFontFirstChar').val());
      var tileCount = parseInt($('#loadFontTileCount').val());
      var tilesPerRow = 16;

      if(isNaN(tileWidth) || isNaN(tileHeight) || isNaN(fontSize)) {
        return false;
      }

      tileSet.readVectorData({
        font: this.font,
        fontSize: fontSize,
        tileWidth: tileWidth,
        tileHeight: tileHeight,
        tileHOffset: tileOffsetX,
        tileVOffset: tileOffsetY,
        tileCount: tileCount,
        firstChar: firstChar
      });
    }    


    if(tileSetCreated) { 
      // call the callback
      if(callback != false) {
        callback({
          tileSetCreated: true,
          tileSet: tileSet,
          type: tileSet.getType(),
          presetId: false,
          description: { "name": tileSet.label },
          mode: this.importArgs.mode,
          colorPalette: colorPalette

        });
      }

    } else {
      this.editor.tileSetManager.tileSetUpdated({ updateBlankCells: true, updateSortMethods: true});
      tileSet.refreshFromImageData();

      if(g_app.getMode() == 'tile set') {
        g_app.tileSetEditor.redraw();
      } else {
        this.editor.tools.drawTools.tilePalette.drawTilePalette();
        this.editor.sideTilePalette.drawTilePalette();
        this.editor.graphic.setCellDimensionsFromTiles();
        this.editor.graphic.redraw({ allCells: true });
        
      }
    }
    return true;
  }


}
