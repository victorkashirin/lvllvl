var BlockPalette = function() {

  this.canvas = null;
  this.canvasSurface = null;
  this.pixelArtBlitter = null;
  this.renderCanvas = null;
  this.renderContext = null;
  this.displayContext = null;

  this.scale = 2;
  this.blocksAcross = 4;
  this.blockSpacing = 2;

  this.highlightBlock = false;
  this.highlightBlockX = false;
  this.highlightBlockY = false;

  this.selectedBlock = false;
  this.selectedBlockX = false;
  this.selectedBlockY = false;

  this.editBlockId = false;

  this.mouseDownOnBlock = false;

  this.blockSpacing = 2;
  this.blockPositions = [];

  this.prefix = '';
}

BlockPalette.prototype = {
  resetProjectState: function() {
    this.blockSet = null;
    this.selectedBlock = false;
    this.selectedBlockX = false;
    this.selectedBlockY = false;
    this.highlightBlock = false;
    this.highlightBlockX = false;
    this.highlightBlockY = false;
    this.editBlockId = false;
    this.mouseDownOnBlock = false;
    this.blockPositions = [];
    if(this.displayContext && this.canvas) {
      try {
        this.displayContext.clearRect(0, 0, this.canvas.width, this.canvas.height);
      } catch(error) {}
    }
  },

  init: function(editor, args) {
    this.editor = editor;

    if(!this.removeDevicePixelRatioListener) {
      var _this = this;
      this.removeDevicePixelRatioListener = UI.onDevicePixelRatioChange(function() {
        if(_this.canvasSurface && !_this.canvasSurface.isPixelRatioCurrent()) {
          _this.drawBlockPalette();
        }
      });
    }

    if(typeof args != 'undefined') {
      if(typeof args.prefix != 'undefined') {
        this.prefix = args.prefix;
      }
    }


  },



  start: function() {
    console.log('start block palette!');
    this.drawBlockPalette();
  },

  buildInterface: function(parentPanel) {
    var _this = this;

    var blockPalettePanel = UI.create("UI.Panel", { "id": this.prefix + "blockPalette" });
    parentPanel.add(blockPalettePanel);

    var blockSplitPanel = UI.create("UI.SplitPanel");
    blockPalettePanel.add(blockSplitPanel);

    var controlsHTML = '';

    controlsHTML += '<span id="' + this.prefix + 'blockPaletteBlockInfo" style="display: inline-block; width: 80px; margin-left: 4px;  overflow: hidden; white-space: nowrap; text-overflow: ellipsis">0</span>';

    controlsHTML += '<span style="margin-right: 20px">';
    controlsHTML += '<label for="blockPaletteBlockCount">Meta Tile Count</label>:&nbsp;';
    controlsHTML += '<span id="' + this.prefix + 'blockPaletteBlockCount" style="margin-right: 10px">0</span>';
    controlsHTML += '<div class="ui-button" id="' + this.prefix + 'blockPaletteBlockCountDec">-</div>';
    controlsHTML += '&nbsp;'
    controlsHTML += '<div class="ui-button" id="' + this.prefix + 'blockPaletteBlockCountInc">+</div>';
    controlsHTML += '</span>';
    

    var blockPaletteControls = UI.create("UI.HTMLPanel", { "id": this.prefix + "blockPaletteControls", "html": controlsHTML });
    blockSplitPanel.addSouth(blockPaletteControls, 26, false);


    var html = '';
    html += '<div class="panelFill" id="' + this.prefix + 'blockPalette" style="overflow-x: hidden; overflow-y: auto;">';
    html += '  <div class="title" style="background-color: #111111; height: 18px; overflow: none; white-space: nowrap">';
    html += '    <div style="position: absolute; font-size: 10px; top: 2px; left: 6px; right: 30px; overflow: hidden; white-space: nowrap">';
    html += '    Meta Tiles';
    html += '    </div>';
    html += '    <div style="position: absolute; top: 2px; right: 2px; width: 20px">';
    html += '      <div id="' + this.prefix + 'blockPaletteCloseButton" class="ui-button ui-panel-close-button ui-button-danger" style="padding: 1px 4px"><img src="icons/svg/glyphicons-basic-599-menu-close.svg"></div>';
    html += '    </div>';
    html += '  </div>';

    html += '  <canvas id="' + this.prefix + 'blockPaletteCanvas" style="position: absolute; top: 18px; left: 0; background-color: #111111"></canvas>';
    html += '</div>';

    var blockPalette = UI.create("UI.HTMLPanel", { "id": this.prefix + "blockPaletteBlocks", "html": html});
    blockSplitPanel.add(blockPalette);


    parentPanel.on('resize', function() {
      _this.drawBlockPalette();
    });

    UI.on('ready', function() {
      _this.initEvents();
    });

  },

  initEvents: function() {
    var _this = this;

    $('#' + this.prefix + 'blockPaletteCloseButton').on('click', function() {
      if(_this.prefix == 'side') {
        _this.editor.setSideBlockPanelVisible(false);
      } else {
        _this.editor.setBottomBlockPanelVisible(false);
      }
    });
    
    $('#' + this.prefix + 'createBlock').on('click', function() {
      _this.createBlock();
    });

    $('#' + this.prefix + 'blockPaletteBlockCountInc').on('click', function() {
      _this.blockCountChange(1);
      
    });


    $('#' + this.prefix + 'blockPaletteBlockCountDec').on('click', function() {
      _this.blockCountChange(-1);

    });


    this.canvas = document.getElementById(this.prefix + 'blockPaletteCanvas');
    this.canvasSurface = new UI.CanvasSurface(this.canvas);
    this.pixelArtBlitter = new UI.PixelArtBlitter();
    this.renderCanvas = document.createElement('canvas');


    this.canvas.addEventListener('dblclick', function(event) {
      _this.doubleClick(event);
    }, false);


    this.canvas.addEventListener('mousedown', function(event) {
      _this.mouseDown(event);
    }, false);

    this.canvas.addEventListener('mousemove', function(event) {
      _this.mouseMove(event);
    }, false);

    this.canvas.addEventListener('mouseleave', function(event) {
      _this.mouseLeave(event);
    }, false);

    this.canvas.addEventListener('mouseup', function(event) {
      _this.mouseUp(event);
    }, false);

  },

  editBlock: function(blockId) {
    var _this = this;
    this.blockSet = this.editor.blockSetManager.getCurrentBlockSet();

    var args = {};
    args.blockId = blockId;

    args.blockData = this.blockSet.getBlockData(blockId);

    args.callback = function(args, blockData) {
      _this.blockSet.setBlock(blockId, blockData);
      _this.drawBlockPalette();
      _this.selectBlock(blockId);
      _this.editor.graphic.redraw({ allCells: true });
    }
    this.editor.blockEditor.show(args);

  },

  blockCountChange: function(amount) {
    if(this.editor.tools.drawTools.tool != 'block') {
      // need to switch tools
      this.editor.tools.drawTools.setDrawTool('block');
    }

    if(amount > 0) {
      this.createBlock();
    } else if(amount < 0) {
      this.blockSet = this.editor.blockSetManager.getCurrentBlockSet();
      var blockCount = this.blockSet.getBlockCount();
      blockCount += amount;
      if(blockCount < 0) {
        return;
      }
      var layer = this.editor.layers.getSelectedLayerObject();
      if(layer && layer.getBlockModeEnabled()) {
        // need at least one block
        if(blockCount < 1) {
          return;
        }
      }

      this.blockSet.setBlockCount(blockCount);
      while(this.selectedBlock >= blockCount) {
        this.selectedBlock--;
      }
      if(this.selectedBlock < 0) {
        this.selectedBlock = false;
      }

      this.drawBlockPalette();
      

    }

  },  

  updateBlockCountHTML: function() {
    var blockSet = this.editor.blockSetManager.getCurrentBlockSet();
    var blockCount = blockSet.getBlockCount();
    $('#' + this.prefix + 'blockPaletteBlockCount').html(blockCount);

  },

  createBlock: function() {
    var _this = this;
    this.blockSet = this.editor.blockSetManager.getCurrentBlockSet();

    var args = {};
    args.block = false;
    args.blockWidth = 4;
    args.blockHeight = 4;
    args.callback = function(args, blockData) {
      var blockId = _this.blockSet.createBlock(blockData);

      if(blockId !== false) {
        // select the new block

        _this.selectBlock(blockId);
      }
      _this.drawBlockPalette();

    }
    this.editor.blockEditor.show(args);
  },


  blockPaletteXYToBlock: function(x, y) {
    for(var i = 0; i < this.blockPositions.length; i++) {
      if(x > this.blockPositions[i].left && x < this.blockPositions[i].right && y > this.blockPositions[i].top && y < this.blockPositions[i].bottom) {
        return i;
      }
    }
    return false;
  },


  doubleClick: function(event) {
    if(this.selectedBlock !== false) {
      this.editBlock(this.selectedBlock);      
    }
  },
  mouseLeave: function(event) {
    this.setBlockInfo(this.selectedBlock);
  },

  mouseDown: function(event) {
    if(this.highlightBlock !== false) {
      this.mouseDownOnBlock = this.highlightBlock;
      if(this.highlightBlock === this.mouseDownOnBlock) {
        if(this.editor.tools.drawTools.tool != 'block') {
          // need to switch tools
          this.editor.tools.drawTools.setDrawTool('block');
        }
        this.selectBlock(this.highlightBlock);
      }
    }

  },

  mouseMove: function(event) {
//    var x = event.offsetX;
//    var y = event.offsetY;

    var x = event.pageX - $('#' + this.prefix + 'blockPaletteCanvas').offset().left;
    var y = event.pageY - $('#' + this.prefix + 'blockPaletteCanvas').offset().top;


    var redrawBlockPalette = false;

    var tileSet = this.editor.tileSetManager.getCurrentTileSet();

    var prevHighlightBlock = this.highlightBlock;
    this.highlightBlock = this.blockPaletteXYToBlock(x, y);

    if(this.highlightBlock !== prevHighlightBlock) {
      this.setBlockInfo(this.highlightBlock);
      this.drawBlockPalette();
    }
  },

  mouseUp: function(event) {
  },


  setBlockInfo: function(blockId) {
    if(blockId === false) {
      return;
    }
    var blockHex = ("00" + blockId.toString(16)).substr(-2);
    var html = '';
    html += blockId + " (0x" + blockHex + ")";

    $('#' + this.prefix + 'blockPaletteBlockInfo').html(html);

  },

  selectBlock: function(blockId) {

    if(typeof blockId !== 'undefined') {
      this.selectedBlock = blockId;
    } else {
      if(this.selectedBlock === false) {
        return;
      }
    }

    this.drawBlockPalette();

    this.setBlockInfo(this.selectedBlock);
    this.editor.currentTile.setBlock(this.selectedBlock);

  },


  getSelectedBlockId: function() {
    return this.selectedBlock;
  },

  canvasDimensions: function(screenMode) {
    if(!this.editor.blockSetManager) {
      return;
    }
    this.blockSet = this.editor.blockSetManager.getCurrentBlockSet();

    if(this.blockSet === null) {
      return;
    }

//    var blockWidth = this.blockSet.getWidth();
//    var blockHeight = this.blockSet.getHeight();

    var tileSet = this.editor.tileSetManager.getCurrentTileSet();
    var charWidth = tileSet.charWidth;
    var charHeight = tileSet.charHeight;

    var blocks = this.blockSet.getBlocks();

    var canvasWidth = 500;//this.canvas.width;//this.blocksAcross * ((blockWidth * charWidth)) * this.scale + (this.blocksAcross + 2) * this.blockSpacing;
    var canvasHeight = 200;


    canvasWidth = $('#' + this.prefix + 'blockPalette').width();

    if(isNaN(canvasWidth) || canvasWidth < 200) {
      canvasWidth = 200;
    }

    this.canvasScale = UI.devicePixelRatio;
    var blockXPos = 0;
    var blockYPos = 0;
    var blockRowHeight = 0;

//    canvasWidth = canvasWidth * this.canvasScale;


    for(var i = 0; i < blocks.length; i++) {
      var blockData = blocks[i].data;
      if(blockData.length > 0) {

        var blockWidth = blockData[0].length * charWidth * this.scale;// * this.canvasScale;
        var blockHeight = blockData.length * charHeight * this.scale;// * this.canvasScale;

        if(blockXPos + blockWidth > canvasWidth) {
          // next row
          blockXPos = 0;
          blockYPos += blockRowHeight + this.blockSpacing;
          blockRowHeight = 0;

        }

        if(blockHeight > blockRowHeight) {
          blockRowHeight = blockHeight;
        }

        // add the block width to current x pos
        blockXPos += blockWidth + this.blockSpacing;// blockData[0].length * charWidth * this.scale * this.canvasScale + this.blockSpacing;
      }
    }


    canvasHeight = blockYPos + blockRowHeight;
    if(canvasHeight == 0) {
      canvasHeight = charHeight;  
    }


    if(this.canvas == null) {
      this.canvas = document.getElementById(this.prefix + 'blockPaletteCanvas');
    }

    if(isNaN(canvasWidth) || canvasWidth <= 0) {
      console.log('invalid block palette canvas width');
      canvasWidth = 8;
    }

    if(isNaN(canvasHeight) || canvasHeight <= 0) {
      console.log('invalid block palette canvas height');
      canvasHeight = 8;
    }

    if(!this.canvasSurface) {
      this.canvasSurface = new UI.CanvasSurface(this.canvas);
      this.pixelArtBlitter = new UI.PixelArtBlitter();
      this.renderCanvas = document.createElement('canvas');
    }
    this.surfaceMetrics = this.canvasSurface.resize({
      cssWidth: canvasWidth,
      cssHeight: canvasHeight,
      pixelRatio: UI.devicePixelRatio
    });
    this.canvasScale = this.surfaceMetrics.pixelRatio;
    this.displayContext = this.canvasSurface.getLogicalContext({ noSmoothing: true });

    if(this.renderCanvas.width !== canvasWidth || this.renderCanvas.height !== canvasHeight) {
      this.renderCanvas.width = canvasWidth;
      this.renderCanvas.height = canvasHeight;
      this.renderContext = null;
    }
    if(this.renderContext === null) {
      this.renderContext = UI.getContextNoSmoothing(this.renderCanvas);
    }
  },

  moveSelection: function(dx, dy) { 
    if(this.selectedBlock !== false) {
      var blockPosition = this.blockPositions[this.selectedBlock];
      var blockGridX = blockPosition.gridX + dx;  
      var blockGridY = blockPosition.gridY + dy;

      var blockId = false;
      for(var i = 0; i < this.blockPositions.length; i++) {
        if(this.blockPositions[i].gridX == blockGridX && this.blockPositions[i].gridY == blockGridY) {
          blockId = i;
          break;
        }
      }

      if(blockId !== false) {
        this.selectBlock(blockId);
      }


    }


  },

  keyDown: function(event) {

    if(g_app.services && g_app.services.commands) {
      return;
    }

    switch(event.keyCode) {

      case keys.textMode.tilePaletteLeft.keyCode:
        if(keys.textMode.tilePaletteLeft.shift == event.shiftKey) {
          this.moveSelection(-1, 0);
        }
      break;
      case keys.textMode.tilePaletteRight.keyCode:
        if(keys.textMode.tilePaletteRight.shift == event.shiftKey) {
          this.moveSelection(1, 0);
        }
      break;
      case keys.textMode.tilePaletteUp.keyCode:
        if(keys.textMode.tilePaletteRight.shift == event.shiftKey) {
          this.moveSelection(0, -1);      
        }
      break;
      case keys.textMode.tilePaletteDown.keyCode:
        if(keys.textMode.tilePaletteDown.shift == event.shiftKey) {
          this.moveSelection(0, 1);      
        }
      break;

    }

  },

  keyUp: function(event) {

  },

  keyPress: function(event) {

  },

  drawBlockPalette: function() {
    if(!this.editor.blockSetManager || !this.editor.tools) {
      return;
    }

    var layer = this.editor.layers.getSelectedLayerObject();
    if(!layer || layer.getType() != 'grid') {
      return;
    }
    var screenMode = layer.getScreenMode();


    if(this.editor.tools.drawTools.tool != 'block') {
//      return;
    }
    // make sure canvas is the right size.
    this.canvasDimensions(screenMode);

    this.blockSet = this.editor.blockSetManager.getCurrentBlockSet();

    if(this.blockSet === null) {
      return;
    }

//    var blockWidth = this.blockSet.getWidth();
//    var blockHeight = this.blockSet.getHeight();

    var tileSet = this.editor.tileSetManager.getCurrentTileSet();
    var charWidth = tileSet.charWidth;
    var charHeight = tileSet.charHeight;

    var blocks = this.blockSet.getBlocks();


    var canvasWidth = this.surfaceMetrics.cssWidth;
    var canvasHeight = this.surfaceMetrics.cssHeight;
    var drawContext = screenMode == TextModeEditor.Mode.VECTOR
      ? this.displayContext : this.renderContext;

    if(canvasWidth === 0 || canvasHeight === 0) {
      return;
    }
    if(drawContext !== this.displayContext) {
      this.displayContext.clearRect(0, 0, canvasWidth, canvasHeight);
    }
    drawContext.clearRect(0, 0, canvasWidth, canvasHeight);
    if(screenMode != TextModeEditor.Mode.VECTOR) {
      this.imageData = drawContext.getImageData(0, 0, canvasWidth, canvasHeight);
    }

    var colorPerMode = this.editor.getColorPerMode();
    var colorPalette = this.editor.colorPaletteManager.getCurrentColorPalette();
    if(!colorPalette) {
      return;
    }


    args = {};
    args['imageData'] = this.imageData;
    args['colorRGB']  = ColorUtils.hexStringToInt(styles.textMode.tilePaletteFg);//0xffffff;
    args['bgColorRGB'] = ColorUtils.hexStringToInt(styles.textMode.tilePaletteBg);//0x333333;
    var defaultBgColorRGB = args['bgColorRGB'];

    if(screenMode == TextModeEditor.Mode.C64MULTICOLOR) {
      defaultBgColorRGB = colorPalette.getHex(layer.getBackgroundColor());
      args['backgroundColor'] = layer.getBackgroundColor();
      args['c64Multi1Color'] = layer.getC64Multi1Color();
      args['c64Multi2Color'] = layer.getC64Multi2Color();

    }


    var blockXPos = 0;
    var blockYPos = 0;


    var blockGridX = 0;
    var blockGridY = 0;

    var blockRowHeight = 0;

    this.blockPositions = [];
    this.blockGrid = [];
    this.blockGrid.push([]);

    var fc = this.editor.currentTile.getColor();
    var bc = this.editor.currentTile.getBGColor();


    for(var i = 0; i < blocks.length; i++) {
      var blockData = blocks[i].data;

      var blockColorMode = blocks[i].colorMode;
      var blockFc = blocks[i].fc;
      var blockBc = blocks[i].bc;



      if(blockData.length > 0) {

        var blockWidth = blockData[0].length * charWidth * this.scale;
        var blockHeight = blockData.length * charHeight * this.scale;

        if(blockXPos + blockWidth > canvasWidth) {
          // next row
          blockXPos = 0;
          blockYPos += blockRowHeight + this.blockSpacing;
          blockRowHeight = 0;

          blockGridX = 0;
          blockGridY++;

          if(blockYPos > canvasHeight) {
            return;
          }
        }


        if(blockHeight > blockRowHeight) {
          blockRowHeight = blockHeight;
        }
   
        this.blockPositions.push({ gridX: blockGridX, gridY: blockGridY,
          top: blockYPos, left: blockXPos,
          bottom: blockYPos + blockHeight, right: blockXPos + blockWidth });

        for(var y = 0; y < blockData.length; y++) {
          for(var x = 0; x < blockData[y].length; x++) {

            var c = blockData[y][x].t;

            if(colorPerMode == 'character') {
              var fgColor = tileSet.getTileColor(c);
              var bgColor = tileSet.getCharacterBGColor(c);
              args['colorRGB'] = colorPalette.getHex(fgColor);
              args['color'] = fgColor;
              args['bgColor'] = bgColor;


              /*
              if(bgColor != this.editor.colorPaletteManager.noColor) {
                args['bgColorRGB'] = colorPalette.getHex(bgColor);
              } else {
                args['bgColorRGB'] = defaultBgColorRGB;
              }
              */
            } else if(colorPerMode == 'block') {
              args['color'] = blockFc;
              args['bgColor'] = blockBc;
            } else {

              if(blockColorMode == 'percell') {
                args['color'] = blockData[y][x].fc;
                args['bgColor'] = blockData[y][x].bc;
              }

              if(blockColorMode == 'perblock') {
                args['color'] = blockFc;
                args['bgColor'] = blockBc;
              }

              if(blockColorMode == 'none') {
                args['colorRGB'] = 0xdddddd;
                args['bgColor'] = this.editor.colorPaletteManager.noColor;
              }
            }

            if(screenMode == TextModeEditor.Mode.C64ECM) {
              var bgColorIndex = Math.floor(c / 64) % 4;
              var ecmGroup = Math.floor(c / 256);
              c = (c % 64) + ecmGroup * 256;

              args['bgColor'] = layer.getC64ECMColor(bgColorIndex);//args['bgColor']);
            }

            if(args['bgColor'] != this.editor.colorPaletteManager.noColor) {
              args['bgColorRGB'] = defaultBgColorRGB;
            }
            args['character'] = c;
            args['x'] = blockXPos + x * charWidth * this.scale;
            args['y'] = blockYPos + y * charHeight * this.scale;
            args['scale'] = this.scale;
  //          args['select'] = i === this.selectedBlock;
  //          args['highlight'] = (i === this.highlightBlock) && ( i !== this.selectedBlock);

            if(screenMode == TextModeEditor.Mode.VECTOR) {
              args['context'] = drawContext;
              args['x'] = blockXPos / this.scale + x * charWidth;
              args['y'] = blockYPos / this.scale + y * charHeight;
              } else {
              args['x'] = blockXPos + x * charWidth * this.scale;
              args['y'] = blockYPos + y * charHeight * this.scale;
                
            }
            tileSet.drawCharacter(args);

          }
        }

        // add the block width to current x pos
        /*
        if(screenMode == TextModeEditor.Mode.VECTOR) {
          blockXPos += blockData[0].length * charWidth + this.blockSpacing;
        } else {
          */
          blockXPos += blockData[0].length * charWidth * this.scale + this.blockSpacing;
        //}
        blockYPos += 0;

        blockGridX++;
      }
    }

    if(screenMode != TextModeEditor.Mode.VECTOR) {
      drawContext.putImageData(this.imageData, 0, 0);
      this.pixelArtBlitter.draw(this.displayContext, false, this.renderCanvas,
        0, 0, canvasWidth, canvasHeight, 0, 0, canvasWidth, canvasHeight);
    }


    // draw the highlight/selected rects

    if(this.highlightBlock !== false) {
      this.displayContext.fillStyle = styles.tilePalette.highlightOutline;
      this.displayContext.strokeStyle = styles.tilePalette.highlightOutline;

      this.displayContext.beginPath();
      this.displayContext.lineWidth = 3;
      this.displayContext.rect(this.blockPositions[this.highlightBlock].left,
        this.blockPositions[this.highlightBlock].top,
        this.blockPositions[this.highlightBlock].right - this.blockPositions[this.highlightBlock].left,
        this.blockPositions[this.highlightBlock].bottom - this.blockPositions[this.highlightBlock].top);
  
      this.displayContext.stroke();
    }


    if(this.selectedBlock !== false) {

      this.displayContext.fillStyle = styles.tilePalette.selectOutline;
      this.displayContext.strokeStyle = styles.tilePalette.selectOutline;

      this.displayContext.beginPath();
      this.displayContext.lineWidth = 3;
      this.displayContext.rect(this.blockPositions[this.selectedBlock].left,
        this.blockPositions[this.selectedBlock].top,
        this.blockPositions[this.selectedBlock].right - this.blockPositions[this.selectedBlock].left,
        this.blockPositions[this.selectedBlock].bottom - this.blockPositions[this.selectedBlock].top);
      this.displayContext.stroke();
    }

    this.updateBlockCountHTML();
  }

}
