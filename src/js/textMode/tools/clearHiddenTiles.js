var ClearHiddenTilesDialog = function() {
  this.uiComponent = null;

  this.replaceWithTile = false;
  this.replaceTileWithCanvas = null;
}

ClearHiddenTilesDialog.prototype = {
  init: function(editor) {
    this.editor = editor;
  },

  show: function() {
    if(this.uiComponent == null) {

      var _this = this;
      this.uiComponent = UI.create("UI.Dialog", { "id": "clearHiddenTilesDialog", "title": "Clear Hidden Tiles", "width": 300, "height": 200 });

      this.htmlComponent = UI.create("UI.HTMLPanel");
      this.uiComponent.add(this.htmlComponent);
      this.htmlComponent.load('html/textMode/clearHiddenTiles.html', function() {
        _this.initContent();
        _this.initEvents();
      });


      this.okButton = UI.create('UI.Button', { "text": "OK", "color": "primary" });
      this.uiComponent.addButton(this.okButton);
      this.okButton.on('click', function(event) {
        _this.doReplaceTile();
        UI.closeDialog();
      });

      this.closeButton = UI.create('UI.Button', { "text": "Cancel", "color": "secondary" });
      this.uiComponent.addButton(this.closeButton);
      this.closeButton.on('click', function(event) {
        UI.closeDialog();
      });
    }

    UI.showDialog("clearHiddenTilesDialog");


  },

  initContent: function() {
  },

  setReplaceWithTile: function(tile) {
    this.replaceWithTile = tile;
    this.drawReplaceCharacter();

  },

  initEvents: function() {

    var _this = this;

/*
    $('#replaceHiddenWithCharacterCanvas').on('click', function(event) {

      var args = {};
      args.characterPickedCallback = function(character) {
        _this.setReplaceWithTile(character);
      }

      args.mode = 'single';
      args.selected = 0;

      var x = event.pageX;
      var y = event.pageY;
      _this.editor.tileSetManager.showCharacterPicker(x, y, args);

    });

    */

  },


  drawReplaceCharacter: function() {
    var tileSet = this.editor.tileSetManager.getCurrentTileSet();
    var charWidth = tileSet.getTileWidth();
    var charHeight = tileSet.getTileHeight();
    var scale = 2;
    if(charHeight > 10) {
      scale = 1;      
    }

    console.log('scale = ' + scale);

//    this.replaceCharacterCanvas.width = charWidth * scale;
//    this.replaceCharacterCanvas.height = charHeight * scale;

    
    this.replaceTileContext = this.replaceTileCanvas.getContext('2d');

    this.replaceTileContext.clearRect(0, 0, this.replaceTileCanvas.width, this.replaceTileCanvas.height);

    var imageData = this.replaceTileContext.getImageData(0, 0, this.replaceTileCanvas.width, this.replaceTileCanvas.height);
    var args = {};
    args['scale'] = scale * this.canvasScale;
    args['imageData'] = imageData;
    args['character'] = this.replaceTile;
    args['colorRGB'] = 0xffffff;
    args['bgColorRGB'] = 0x333333;

//      args['color'] = 2;
    args['x'] = 0;
    args['y'] = 0;

    tileSet.drawCharacter(args);

    this.replaceTileContext.putImageData(imageData, 0, 0);


    this.replaceTileWithContext = this.replaceTileWithCanvas.getContext('2d');

    this.replaceTileWithContext.clearRect(0, 0, this.replaceTileWithCanvas.width, this.replaceTileWithCanvas.height);

    var imageData = this.replaceTileWithContext.getImageData(0, 0, this.replaceTileWithCanvas.width, this.replaceTileWithCanvas.height);
    var args = {};
    args['scale'] = scale * this.canvasScale;
    args['imageData'] = imageData;
    args['character'] = this.replaceWithTile;
    args['colorRGB'] = 0xffffff;
    args['bgColorRGB'] = 0x333333;

//      args['color'] = 2;
    args['x'] = 0;
    args['y'] = 0;

    tileSet.drawCharacter(args);

    this.replaceTileWithContext.putImageData(imageData, 0, 0);

  },

  doReplaceTile: function() {
    var layer = this.editor.layers.getSelectedLayerObject();
    if(!layer || layer.getType() != 'grid') {
      return false;
    }

    this.frames = $('input[name=clearHiddenTilesFrame]:checked').val();

    var fromX = 0;
    var toX = layer.getGridWidth();
    var fromY = 0;
    var toY = layer.getGridHeight();

    var fromFrame = 0;
    var toFrame = this.editor.graphic.getFrameCount();

    if(this.frames == 'current') {
      fromFrame = this.editor.graphic.getCurrentFrame();
      toFrame = this.editor.graphic.getCurrentFrame() + 1;
    }  

    var args = {};
    this.editor.history.startEntry('Replace Tiles');

    var backgroundColor = layer.getBackgroundColor();
    var tileSet = layer.getTileSet();
    var blankTileId = tileSet.getBlankCharacter();
    var noColor =  this.editor.colorPaletteManager.noColor;

    for(var frameIndex = fromFrame; frameIndex < toFrame; frameIndex++) {
      for(var y = fromY; y < toY; y++) {
        for(var x = fromX; x < toX; x++) {


          var cellData = layer.getCell({ x: x, y: y, frame: frameIndex });

          if(cellData.fc == cellData.bc || (cellData.bc == noColor && cellData.fc == backgroundColor)) {

            var args = {};
            args.x = x;
            args.y = y;
            args.frame = frameIndex;
            
            for(var key in cellData) {
              if(cellData.hasOwnProperty(key)) {
                args[key] = cellData[key];
              }
            }
            args.t = blankTileId;
            layer.setCell(args);
          }
        }
      }
    }

    this.editor.history.endEntry();
    this.editor.graphic.invalidateAllCells();
    this.editor.graphic.redraw();
  }
}
