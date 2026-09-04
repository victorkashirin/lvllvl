var ExportSvg = function() {
  this.editor = null;

  this.uiComponent = null;
  this.htmlComponent = null;
  this.visible = false;
}

ExportSvg.prototype = {
  init: function(editor) {
    this.editor = editor;
  },


  isSupportedScreenMode: function(screenMode) {
    return screenMode == TextModeEditor.Mode.VECTOR
      || screenMode == TextModeEditor.Mode.TEXTMODE
      || screenMode == TextModeEditor.Mode.C64STANDARD
      || screenMode == TextModeEditor.Mode.C64ECM;
  },


  hasColor: function(colorIndex) {
    return colorIndex !== false
      && typeof colorIndex != 'undefined'
      && colorIndex !== this.editor.colorPaletteManager.noColor;
  },


  getColor: function(colorPalette, colorIndex) {
    var color = colorPalette.getRGBA(colorIndex);
    return 'rgb(' + color[0] + ',' + color[1] + ',' + color[2] + ')';
  },


  getCellColors: function(layer, tileSet, cellData) {
    var foregroundColor = cellData.fc;
    var backgroundColor = cellData.bc;
    var colorPerMode = layer.getColorPerMode();

    if(colorPerMode == 'character') {
      foregroundColor = tileSet.getTileColor(cellData.t);
      backgroundColor = tileSet.getCharacterBGColor(cellData.t);
    } else if(colorPerMode == 'block'
      && layer.getBlockModeEnabled()
      && cellData.b !== false
      && typeof cellData.b != 'undefined') {
      var blockSet = layer.getBlockSet();
      foregroundColor = blockSet.getBlockColor(cellData.b);
      backgroundColor = blockSet.getBlockBGColor(cellData.b);
    }

    if(layer.getScreenMode() == TextModeEditor.Mode.C64ECM) {
      if(cellData.t >= 64 || !this.hasColor(backgroundColor)) {
        backgroundColor = layer.getC64ECMColor(Math.floor(cellData.t / 64) % 4);
      } else if(backgroundColor < 4) {
        backgroundColor = layer.getC64ECMColor(backgroundColor);
      }
    }

    return {
      foreground: foregroundColor,
      background: backgroundColor
    };
  },


  getRasterPixel: function(tileSet, tileIndex, x, y, cellData, layer, tileWidth, tileHeight) {
    var srcX = x;
    var srcY = y;

    if(layer.getHasTileFlip()) {
      if(cellData.fh) {
        srcX = tileWidth - srcX - 1;
      }

      if(cellData.fv) {
        srcY = tileHeight - srcY - 1;
      }
    }

    if(layer.getHasTileRotate() && tileWidth == tileHeight) {
      var rotation = parseInt(cellData.rz, 10) || 0;
      rotation = ((rotation % 4) + 4) % 4;

      if(rotation != 0) {
        var tempX = srcX;
        var tempY = srcY;

        if(rotation == 1) {
          srcY = tileWidth - tempX - 1;
          srcX = tempY;
        } else if(rotation == 2) {
          srcX = tileWidth - tempX - 1;
          srcY = tileHeight - tempY - 1;
        } else if(rotation == 3) {
          srcY = tempX;
          srcX = tileHeight - tempY - 1;
        }
      }
    }

    return tileSet.getPixel(tileIndex, srcX, srcY, 'current') > 0;
  },


  getRasterPath: function(tileSet, tileIndex, cellData, layer, tileWidth, tileHeight) {
    var path = '';

    for(var y = 0; y < tileHeight; y++) {
      var x = 0;
      while(x < tileWidth) {
        if(!this.getRasterPixel(tileSet, tileIndex, x, y, cellData, layer, tileWidth, tileHeight)) {
          x++;
          continue;
        }

        var runStart = x;
        while(x < tileWidth
          && this.getRasterPixel(tileSet, tileIndex, x, y, cellData, layer, tileWidth, tileHeight)) {
          x++;
        }

        var runWidth = x - runStart;
        path += 'M' + runStart + ' ' + y
          + 'h' + runWidth + 'v1h-' + runWidth + 'z';
      }
    }

    return path;
  },


  getSVGData: function() {
    var layer = this.editor.layers.getSelectedLayerObject();

    if(!layer || layer.getType() != 'grid') {
      return false;
    }

    var screenMode = layer.getScreenMode();
    if(!this.isSupportedScreenMode(screenMode)) {
      return false;
    }

    var gridWidth = layer.getGridWidth();
    var gridHeight = layer.getGridHeight();
    var tileSet = layer.getTileSet();
    var colorPalette = layer.getColorPalette();
    var isVector = screenMode == TextModeEditor.Mode.VECTOR;
    var cellWidth = isVector ? 32 : layer.getCellWidth();
    var cellHeight = isVector ? 32 : layer.getCellHeight();
    var svgWidth = cellWidth * gridWidth;
    var svgHeight = cellHeight * gridHeight;
    var data = '<?xml version="1.0" standalone="no"?>';
    data += '<svg xmlns="http://www.w3.org/2000/svg" width="' + svgWidth
      + '" height="' + svgHeight + '" viewBox="0 0 ' + svgWidth + ' ' + svgHeight + '"';

    if(!isVector) {
      data += ' shape-rendering="crispEdges"';
    }
    data += '>';

    var layerBackground = layer.getBackgroundColor();
    if(this.hasColor(layerBackground)) {
      data += '<rect width="100%" height="100%" fill="'
        + this.getColor(colorPalette, layerBackground) + '"/>';
    }

    var fontScale = isVector ? tileSet.getFontScale() : 1;
    var vectorScale = isVector ? cellWidth * fontScale : 1;
    var scaledAscent = isVector ? tileSet.getFontAscent() * vectorScale : 0;

    for(var y = 0; y < gridHeight; y++) {
      for(var x = 0; x < gridWidth; x++) {
        var cellData = layer.getCell({ x: x, y: y });
        if(cellData === false) {
          continue;
        }

        var colors = this.getCellColors(layer, tileSet, cellData);
        var xPosition = x * cellWidth;
        var yPosition = y * cellHeight;

        if(this.hasColor(colors.background)) {
          data += '<rect x="' + xPosition + '" y="' + yPosition
            + '" width="' + cellWidth + '" height="' + cellHeight
            + '" fill="' + this.getColor(colorPalette, colors.background) + '"/>';
        }

        if(!this.hasColor(colors.foreground)) {
          continue;
        }

        if(isVector) {
          var vectorPath = tileSet.getSVGPath(cellData.t);
          if(vectorPath !== false && vectorPath.indexOf('lyph glyph-name') !== 0) {
            data += '<g transform="translate(' + xPosition + ' ' + (yPosition + scaledAscent)
              + ') scale(' + vectorScale + ' -' + vectorScale + ')">';
            data += '<path d="' + vectorPath + '" fill="'
              + this.getColor(colorPalette, colors.foreground) + '"/>';
            data += '</g>';
          }
        } else {
          var rasterPath = this.getRasterPath(
            tileSet,
            cellData.t,
            cellData,
            layer,
            cellWidth,
            cellHeight
          );

          if(rasterPath != '') {
            data += '<path transform="translate(' + xPosition + ' ' + yPosition + ')" d="'
              + rasterPath + '" fill="' + this.getColor(colorPalette, colors.foreground) + '"/>';
          }
        }
      }
    }

    data += '</svg>';
    return data;
  },


  initContent: function() {
    $('#exportSVGAs').val('Untitled');
  },
  
  show: function() {
    var _this = this;

    if(this.uiComponent == null) {

      this.uiComponent = UI.create("UI.Dialog", { "id": "exportSVGDialog", "title": "Export SVG", "width": 300, "height": 120 });

      this.htmlComponent = UI.create("UI.HTMLPanel");
      this.uiComponent.add(this.htmlComponent);

      this.htmlComponent.load('html/textMode/exportSvg.html', function() {
        _this.initContent();
      });

      this.okButton = UI.create('UI.Button', { "imageSrc": "icons/svg/glyphicons-basic-199-save.svg", "text": "Download", "color": "primary" });
      this.uiComponent.addButton(this.okButton);
      this.okButton.on('click', function(event) {
        var filename = $('#exportSVGAs').val();
        _this.exportSVG({ filename: filename });
      });
  
      this.closeButton = UI.create('UI.Button', { "text": "Close", "color": "secondary" });
      this.uiComponent.addButton(this.closeButton);
      this.closeButton.on('click', function(event) {
        UI.closeDialog();
      });
  
      this.uiComponent.on('close', function() {
        _this.visible = false;
      });

    }

    UI.showDialog("exportSVGDialog");
    this.visible = true;


  },

  exportSVG: function(args) {

    var filename = 'Untitled';
    if(typeof args.filename != 'undefined') {
      filename = args.filename;
    }

    var layer = this.editor.layers.getSelectedLayerObject();

    if(!layer || layer.getType() != 'grid') {
      alert('Please choose a grid layer');
      return;
    }

    var data = this.getSVGData();
    if(data === false) {
      alert('SVG export is not available for this screen mode');
      return;
    }

    if(!/\.svg$/i.test(filename)) {
      filename += ".svg";
    }

    download(data, filename, "image/svg+xml");


  }
}
