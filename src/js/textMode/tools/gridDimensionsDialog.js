var GridDimensionsDialog = function() {
  this.editor = null;

  this.canvas = null;

  this.currentWidth = 0;
  this.currentHeight = 0;

  this.dimensionsDialog = null;

  this.draggingScreen = false;

  this.bigger = true;
}


GridDimensionsDialog.prototype = {
  init: function(editor) {
    this.editor = editor;

  },


  initEvents: function() {
    var _this = this;

    if(this.canvas == null) {
      this.canvas = document.getElementById('settingsDimensionsOffsetCanvas');      
    }

    $('.dimensionsNumber').on('input change', function(e) {
      _this.updateDimensions();
    });

    this.canvas.addEventListener('mousedown', function(event) {
      _this.mouseDown(event);
    }, false);

    this.canvas.addEventListener('mousemove', function(event) {
      _this.mouseMove(event);
    }, false);

    this.canvas.addEventListener('mouseup', function(event) {
      _this.mouseUp(event);
    }, false);


    this.canvas.addEventListener("touchstart", function(event){
      _this.touchStart(event);

    }, false);

    this.canvas.addEventListener("touchmove", function(event){
      _this.touchMove(event);
      return false;
    }, false);

    this.canvas.addEventListener("touchend", function(event) {
      _this.touchEnd(event);
    }, false);



  },


  showDimensions: function() {
    var _this = this;


    if(this.dimensionsDialog == null) {
      var width = 330;
      var height = 465;

      if(UI.isMobile.any()) {
        width = 280;
        height = 550;
      }

      this.dimensionsDialog = UI.create("UI.Dialog", { "id": "dimensionsDialog", "title": "Dimensions", "width": width, "height": height });

      this.dimensionsHTML = UI.create("UI.HTMLPanel");
      this.dimensionsDialog.add(this.dimensionsHTML);
      this.dimensionsHTML.load('html/textMode/dimensionsDialog.html', function() {
        _this.initEvents();
        _this.initContent();
      });

      this.okButton = UI.create('UI.Button', { "text": "OK", "color": "primary" });
      this.dimensionsDialog.addButton(this.okButton);
      this.okButton.on('click', function(event) {
        var graphic = _this.editor.graphic;
        var dimensions = _this.getValidatedDimensions(graphic.getType() == 'sprite');
        _this.showValidationErrors(dimensions.errors);
        if(!dimensions.valid) {
          $(dimensions.firstInvalidSelector).focus();
          return;
        }

        // have to set tile dimensions first
        if(graphic.getType() == 'sprite') {      
      
          var layer = _this.editor.layers.getSelectedLayerObject();
          if(layer && layer.getType() == 'grid') {
            var tileSet = layer.getTileSet();
            var currentTileWidth = tileSet.getTileWidth();
            var currentTileHeight = tileSet.getTileHeight();

            var tileArgs = {
              width: dimensions.tileWidth,
              height: dimensions.tileHeight,
              offsetX: 0,
              offsetY: 0
            };

            if(tileArgs.width != currentTileWidth || tileArgs.height != currentTileHeight) {
              tileSet.setTileDimensions(tileArgs);

              // need to resize the layers..
            }
          }
        }

        var args = {
          width: dimensions.width,
          height: dimensions.height,
          offsetX: dimensions.offsetX,
          offsetY: dimensions.offsetY
        };


        _this.editor.graphic.setGridDimensions(args);//width, height, offsetX, offsetY);



        
        UI.closeDialog();
      });

      this.closeButton = UI.create('UI.Button', { "text": "Cancel", "color": "secondary" });
      this.dimensionsDialog.addButton(this.closeButton);
      this.closeButton.on('click', function(event) {
        UI.closeDialog();
      });
    } else {
      this.initContent();
    }

    UI.showDialog("dimensionsDialog");


  },



  initContent: function() {

    var graphic = this.editor.graphic;


    if(graphic.getType() == 'sprite') {
      $('#settingsDimensionsTile').show();
    } else {
      $('#settingsDimensionsTile').hide();
    }

    this.currentWidth = graphic.getGridWidth();
    this.currentHeight = graphic.getGridHeight();

    var tileWidth = 8;
    var tileHeight = 8;
    var layer = this.editor.layers.getSelectedLayerObject();
    if(layer && layer.getType() == 'grid') {
      var tileSet = layer.getTileSet();
      tileWidth = tileSet.getTileWidth();
      tileHeight = tileSet.getTileHeight();
    }


    $('#settingsDimensionsTileWidth').val(tileWidth);
    $('#settingsDimensionsTileHeight').val(tileHeight);

    $('#settingsDimensionsWidth').val(this.currentWidth);
    $('#settingsDimensionsHeight').val(this.currentHeight);
    $('#settingsDimensionsOffsetX').val(0);
    $('#settingsDimensionsOffsetY').val(0);

    this.updateDimensions();
//    $('#settingsDimensionsDepth').val(depth);
  },

  getValidatedDimensions: function(includeTileDimensions) {
    var maxTileDimension = typeof TileSet != 'undefined' && TileSet.MAX_TILE_DIMENSION
      ? TileSet.MAX_TILE_DIMENSION
      : 128;
    var fields = [
      { name: 'width', selector: '#settingsDimensionsWidth', label: 'Grid width', min: 1, max: 200 },
      { name: 'height', selector: '#settingsDimensionsHeight', label: 'Grid height', min: 1, max: 200 },
      { name: 'offsetX', selector: '#settingsDimensionsOffsetX', label: 'Offset X', min: -1000, max: 1000 },
      { name: 'offsetY', selector: '#settingsDimensionsOffsetY', label: 'Offset Y', min: -1000, max: 1000 }
    ];
    if(includeTileDimensions) {
      fields.push(
        { name: 'tileWidth', selector: '#settingsDimensionsTileWidth', label: 'Tile width', min: 1, max: maxTileDimension },
        { name: 'tileHeight', selector: '#settingsDimensionsTileHeight', label: 'Tile height', min: 1, max: maxTileDimension }
      );
    }

    var result = { valid: true, errors: {}, firstInvalidSelector: null };
    for(var i = 0; i < fields.length; i++) {
      var field = fields[i];
      var rawValue = $(field.selector).val();
      var value = Number(rawValue);
      if((typeof rawValue == 'string' && rawValue.trim() == '') ||
          !Number.isFinite(value) || !Number.isInteger(value) ||
          value < field.min || value > field.max) {
        result.valid = false;
        result.errors[field.selector] = field.label + ' must be a whole number from ' +
          field.min + ' to ' + field.max + '.';
        if(result.firstInvalidSelector == null) {
          result.firstInvalidSelector = field.selector;
        }
      } else {
        result[field.name] = value;
      }
    }
    return result;
  },

  showValidationErrors: function(errors) {
    var selectors = [
      '#settingsDimensionsWidth', '#settingsDimensionsHeight',
      '#settingsDimensionsOffsetX', '#settingsDimensionsOffsetY',
      '#settingsDimensionsTileWidth', '#settingsDimensionsTileHeight'
    ];
    for(var i = 0; i < selectors.length; i++) {
      var selector = selectors[i];
      var errorSelector = selector + 'Error';
      if(errors[selector]) {
        $(selector).attr('aria-invalid', 'true');
        $(errorSelector).text(errors[selector]).show();
      } else {
        $(selector).removeAttr('aria-invalid');
        $(errorSelector).hide().text('');
      }
    }
  },

  updateDimensions: function() {

    this.context = this.canvas.getContext('2d');
    var dimensions = this.getValidatedDimensions(this.editor.graphic.getType() == 'sprite');
    this.showValidationErrors(dimensions.errors);
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if(!dimensions.valid) {
      return false;
    }

    this.width = dimensions.width;
    this.height = dimensions.height;

    this.offsetX = dimensions.offsetX;
    this.offsetY = dimensions.offsetY;

    this.bigger = true;

    if(this.currentHeight > this.height) {
      this.bigger = false;
    }

    if(this.currentWidth > this.width) {
      this.bigger = false;
    }

    this.scale = this.canvas.width / this.width;


    if(this.canvas.height / this.height < this.scale) {
      this.scale = this.canvas.height / this.height;
    }


    // is the screen going smaller?
    if(this.canvas.height / this.currentHeight < this.scale) {
      this.bigger = false;
      this.scale = this.canvas.height / this.currentHeight;
    }

    if(this.canvas.width / this.currentWidth < this.scale) {
      this.bigger = false;
      this.scale = this.canvas.width / this.currentWidth;
    }

    var newScreenX = 0;
    var newScreenY = 0;

    // draw the new screen
    this.context.fillStyle = '#333333';
    this.context.fillRect(newScreenX, newScreenY, this.width * this.scale, this.height * this.scale);


    // draw the current screen
    this.currentScreenX = this.offsetX * this.scale;
    this.currentScreenY = this.offsetY * this.scale;
    this.currentScreenWidth = this.currentWidth * this.scale;
    this.currentScreenHeight = this.currentHeight * this.scale;
    this.context.fillStyle = '#999999';
    this.context.fillRect(this.currentScreenX, this.currentScreenY, this.currentScreenWidth, this.currentScreenHeight);

    if(!this.bigger) {
      this.context.strokeStyle = '#333333';

      this.context.beginPath();
      this.context.lineWidth = 2;
      this.context.rect(newScreenX, newScreenY, this.width * this.scale, this.height * this.scale);
      this.context.stroke();

    }

    return true;

  },

  toolStart: function(x, y, event) {
    this.mouseDownX = x;//event.pageX;
    this.mouseDownY = y;//event.pageY;

    this.mouseDownOffsetX = this.offsetX;
    this.mouseDownOffsetY = this.offsetY;

    if(x > this.currentScreenX && x < this.currentScreenX + this.currentScreenWidth) {
      if(y > this.currentScreenY && y < this.currentScreenY + this.currentScreenHeight) {
        console.log('mouse down on current screen');
        this.draggingScreen = true;
      }
    }

  },

  toolMove: function(x, y, event) {
    var mouseX = x;// event.pageX;
    var mouseY = y;//event.pageY;

    if(this.draggingScreen) {
      console.log('drag screen' + this.scale);
      var newOffsetX = Math.round(this.mouseDownOffsetX + (mouseX - this.mouseDownX) / this.scale);
      $('#settingsDimensionsOffsetX').val(newOffsetX);
      var newOffsetY = Math.round(this.mouseDownOffsetY + (mouseY - this.mouseDownY) / this.scale);
      $('#settingsDimensionsOffsetY').val(newOffsetY);
      this.updateDimensions();
    }

  },

  toolEnd: function(event) {
    this.draggingScreen = false;
  },


  touchStart: function(event) {
    event.preventDefault();

    var touches = event.touches;
    if(touches.length == 1) {
      var x = touches[0].pageX - $('#' + this.canvas.id).offset().left;
      var y = touches[0].pageY - $('#' + this.canvas.id).offset().top;

      this.toolStart(x, y, touches[0]);
      UI.captureMouse(this);
    }

  },
  

  touchMove: function(event) {
    var touches = event.touches;
    if(touches.length == 1) {
      var x = touches[0].pageX - $('#' + this.canvas.id).offset().left;
      var y = touches[0].pageY - $('#' + this.canvas.id).offset().top;

      this.toolMove(x, y, touches[0]);
    }

  },

  touchEnd: function(event) {
    this.toolEnd(event);
  },

  mouseDown: function(event) {
    var x = event.pageX - $('#' + this.canvas.id).offset().left;
    var y = event.pageY - $('#' + this.canvas.id).offset().top;

    this.toolStart(x, y, event);
    UI.captureMouse(this);

  },

  mouseMove: function(event) {

    var x = event.pageX - $('#' + this.canvas.id).offset().left;
    var y = event.pageY - $('#' + this.canvas.id).offset().top;

    this.toolMove(x, y, event);
  },

  mouseUp: function(event) {
    this.toolEnd(event);
  },

}
