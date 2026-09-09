var TileMaterials = function() {
  this.editor = null;
  
  this.prefix = '';
  this.tileMaterialsCanvas = null;
  this.tileMaterialsSurface = null;
  this.removeDevicePixelRatioListener = null;
}

TileMaterials.prototype = {
  init: function(editor, prefix) {
    this.editor = editor;
    if(typeof prefix != 'undefined') {
      this.prefix = prefix;
    }
    if(!this.removeDevicePixelRatioListener) {
      var _this = this;
      this.removeDevicePixelRatioListener = UI.onDevicePixelRatioChange(function() {
        if(_this.tileMaterialsCanvas) {
          _this.drawTileMaterials();
        }
      });
    }
  },

  getHTML: function() {
    var materialsHTML = '<div class="panelFill" style="color: white">';

    materialsHTML += '  <div style="padding-left: 2px;" class="tileMaterialControls">';
    materialsHTML += '    <div style="margin: 4px 0 2px 0; font-size: 10px; font-weight: normal; color: #999999">Tile Material</div>';
    materialsHTML += '    <canvas id="' + this.prefix + 'tileMaterialsCanvas"></canvas>';
    materialsHTML += '  </div>';
    materialsHTML += '</div>';

    return materialsHTML;
  },

  buildInterface: function(parent) {
    var materialsHTML = this.getHTML();
    var materialsPanel = UI.create("UI.HTMLPanel", { html: materialsHTML });
    parent.add(materialsPanel);

    var _this = this;
    UI.on('ready', function() {
      _this.initEvents();
    });

  },

  initEvents: function() {
    var _this = this;
    
    if(this.tileMaterialsCanvas == null) {
      this.tileMaterialsCanvas = document.getElementById(this.prefix + 'tileMaterialsCanvas');
    }
    
    this.tileMaterialsCanvas.addEventListener('mousedown', function(event) {
      _this.materialsMouseDown(event);
    }, false);

    this.tileMaterialsCanvas.addEventListener('mousemove', function(event) {
      _this.materialsMouseMove(event);
    }, false);

    this.tileMaterialsCanvas.addEventListener('mouseup', function(event) {
      _this.materialsMouseUp(event);
    }, false);

  },


  materialsMouseDown: function(event) {
    var x = event.pageX - $('#' + this.tileMaterialsCanvas.id).offset().left;
    var y = event.pageY - $('#' + this.tileMaterialsCanvas.id).offset().top;

    var xPos = Math.floor((x - this.materialSpacing) / (this.materialWidth + this.materialSpacing));
    var yPos = Math.floor((y - this.materialSpacing) / (this.materialHeight + this.materialSpacing));

    var material = xPos + yPos * 8;
    if(material >= 0 && material < 16) {
      this.editor.currentTile.setMaterial(material);
    }

  },

  materialsMouseMove: function(event) {
    var x = event.pageX - $('#' + this.tileMaterialsCanvas.id).offset().left;
    var y = event.pageY - $('#' + this.tileMaterialsCanvas.id).offset().top;


  },

  materialsMouseUp: function(event) {
    var x = event.pageX - $('#' + this.tileMaterialsCanvas.id).offset().left;
    var y = event.pageY - $('#' + this.tileMaterialsCanvas.id).offset().top;


  },

  drawTileMaterials: function() {
    if(this.tileMaterialsCanvas == null) {
      this.tileMaterialsCanvas = document.getElementById(this.prefix + 'tileMaterialsCanvas');
    }
    if(!this.tileMaterialsCanvas) {
      return false;
    }

    var tileSet = this.editor.tileSetManager.getCurrentTileSet();

    this.materialWidth = 16;
    this.materialHeight = 16;
    this.materialSpacing = 1;
    var canvasWidth = 8 * (this.materialWidth + this.materialSpacing) + this.materialSpacing;
    var canvasHeight = 2 * (this.materialHeight + this.materialSpacing) + this.materialSpacing;


    if(!this.tileMaterialsSurface) {
      this.tileMaterialsSurface = new UI.CanvasSurface(this.tileMaterialsCanvas);
    }
    this.tileMaterialsSurface.resize({ cssWidth: canvasWidth, cssHeight: canvasHeight });
    this.tileMaterialsContext = this.tileMaterialsSurface.getLogicalContext();


    this.tileMaterialsContext.fillStyle = '#222222';
    this.tileMaterialsContext.fillRect(0, 0, canvasWidth, canvasHeight);

    var currentTile = this.editor.currentTile;

    for(var y = 0; y < 2; y++) {
      for(var x = 0; x < 8; x++) {
        var material = x + y * 8;

        var xPos = this.materialSpacing + x * (this.materialWidth + this.materialSpacing);
        var yPos = this.materialSpacing + y * (this.materialHeight + this.materialSpacing);
        var width = this.materialWidth;
        var height = this.materialHeight;

        var selected = false;
        if(currentTile.useCells) {
          for(var j = 0; j < currentTile.cells.length; j++) {
            for(var i = 0; i < currentTile.cells[j].length; i++) {
              var tileId = currentTile.cells[j][i].t;
              if(tileId != this.editor.tileSetManager.noTile) {
                if(tileSet.getTileMaterial(tileId) == material) {
                  selected = true;
                }
              }
            }
          }

        } else {
          var tiles = currentTile.getTiles();

          for(var j = 0; j < tiles.length; j++) {
            for(var i = 0; i < tiles[j].length; i++) {
              var tileId = tiles[j][i];
              if(tileId != this.editor.tileSetManager.noTile) {
                if(tileSet.getTileMaterial(tileId) == material) {
                  selected = true;
                }
              }
            }
          }
        }

        if(selected) {
          this.tileMaterialsContext.fillStyle = '#cccccc';
        } else {
          this.tileMaterialsContext.fillStyle = '#121212';
        }
        this.tileMaterialsContext.fillRect(xPos, yPos, width, height);

        var fontPx = 16;
        var font = fontPx + "px \"Courier New\", Courier, monospace";
    
        this.tileMaterialsContext.font = font;
        if(selected) {
          this.tileMaterialsContext.fillStyle = '#121212';
        } else {
          this.tileMaterialsContext.fillStyle = '#cccccc';
        }

        // draw all the characters in the same spot
        for(var i = 0; i < 128; i++) {
          var c = material.toString(16).toUpperCase();
          var textMeasure = this.tileMaterialsContext.measureText(c);

          var textX = xPos + (width - textMeasure.width) / 2;
          var textY = yPos + 12;
          this.tileMaterialsContext.fillText(c, textX, textY);
        }
      }
    }
    return true;
  }


}
