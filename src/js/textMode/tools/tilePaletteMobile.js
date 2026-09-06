// the tile chooser at the bottom of the screen
var TilePaletteMobile = function() {

  this.editor = null;

  this.uiComponent = null;

  this.canvas = null;
  this.context = null;

  this.paletteCanvas = null;
  this.paletteContext = null;

  this.scale = 1;
  this.tileVPadding = 1;
  this.tileHPadding = 1;  

  this.paletteTiles = [];

  this.tileWidth = 8;
  this.tileHeight = 8;
  this.blockWidth = 1;
  this.blockHeight = 1;

  this.touchOnTile = false;
  this.highlightTouchOnTile = false;
  
  this.touchVelocity = null;
  this.xScroll = 0;

  this.velocityTween = null;
  this.lastTouchEnd = 0;

  this.mouseIsDown = false;
  this.mouseStartX = 0;
  this.mouseStartScrollX = 0;
  this.mouseDidDrag = false;

//  this.canvasMaxWidth = 4400;
}


TilePaletteMobile.prototype = {

  setPaletteTiles: function() {
    var tileSet = this.editor.tileSetManager.getCurrentTileSet();
    if(!tileSet) {
      return;
    }

    if(this.editor.graphic.getType() == 'sprite') {
      
    } else {
      this.paletteTiles = [];

      if(this.editor.tools.drawTools.tool == 'block') {
        var blockSet = this.editor.blockSetManager.getCurrentBlockSet();  
        this.tileCount = blockSet.getBlockCount();
        for(var i = 0; i < this.tileCount; i++) {
          this.paletteTiles.push({
            b: i
          });
        }

      } else {

        this.tileCount = tileSet.getTileCount();
        for(var i = 0; i < this.tileCount; i++) {
          this.paletteTiles.push({
            t: i
          });
        }
      }


    }


  },



  init: function(editor, args) {
    this.editor = editor;
    this.touchVelocity = new TouchVelocity();

  },

  setCurrentTileVisible: function(visible) {
    this.splitpanel.setPanelVisible('west', visible);
  },

  buildInterface: function(parentPanel) {

    this.splitpanel  = UI.create("UI.SplitPanel");

    var html = '';

    html = '<div id="tilePaletteMobileHolder" style="position: absolute; top: 0; bottom: 0; left: 0; right: 0; overflow-x: auto; overflow-y: hidden">';
    html += '<canvas id="tilePaletteMobileCanvas" style="background-color: black"></canvas>';
    html += '</div>';
    this.uiComponent = UI.create("UI.HTMLPanel", { "html": html });
    this.splitpanel.add(this.uiComponent);

    this.currentTilePanel = UI.create("UI.Panel");
    this.splitpanel.addWest(this.currentTilePanel, 70, false);

    var html = '';
    html += '<canvas id="tilePaletteMobileCurrentTile" style="padding: 6px 6px 6px 8px" ></canvas>';

    var currentTileHTML = UI.create("UI.HTMLPanel", { html:html });
    this.currentTilePanel.add(currentTileHTML);

    parentPanel.add(this.splitpanel);

    var _this = this;
    UI.on('ready', function() {
      _this.initCurrentTileContent();
      _this.initEvents();
    });
  },



  initCurrentTileContent: function() {
    var canvasId = 'tilePaletteMobileCurrentTile';
    var tileCanvas = document.getElementById(canvasId);

    var width = 48;
    var height = 48;
    var scale = Math.floor(UI.devicePixelRatio);

    tileCanvas.width = width * scale;
    tileCanvas.height = height * scale;

    tileCanvas.style.width = width + 'px';
    tileCanvas.style.height = height + 'px';
    

    var _this = this;
    tileCanvas.addEventListener("click", function(event){
      _this.editor.currentTile.chooseCharacterMobile(event);
    }, false);

    $('#' + canvasId).on('contextmenu', function(event) {
      var characters = _this.editor.currentTile.getCharacters();
      if(characters.length > 0 && characters[0].length > 0) {
        _this.editor.showTileEditor({ character: characters[0][0]});
      }
      event.preventDefault();
    });

//    this.checkMobileToolScroll();
  },

  initEvents: function() {
    var _this = this;

    this.canvas = document.getElementById('tilePaletteMobileCanvas');
    if(!this.canvas) {
      return;
    }

    $('#tilePaletteMobileCanvas').on('contextmenu', function(event) {
      event.preventDefault();

      if(_this.touchOnTile !== false) {
        _this.editor.showTileEditor({ character: _this.touchOnTile});        
      }

    });

    this.canvas.addEventListener("touchstart", function(event){
      _this.touchStart(event);

    }, false);

    this.canvas.addEventListener("touchmove", function(event){
      _this.touchMove(event);
      
    }, false);

    this.canvas.addEventListener("touchend", function(event) {
      _this.touchEnd(event);

    }, false);

    this.canvas.addEventListener("wheel", function(event) {
      var wheel = normalizeWheel(event);
      var delta = Math.abs(wheel.pixelX) > Math.abs(wheel.pixelY)
        ? wheel.pixelX
        : wheel.pixelY;
      if(delta == 0) {
        return;
      }

      event.preventDefault();
      _this.stopVelocityTween();
      _this.setXScroll(_this.xScroll - delta);
      _this.draw({ redrawTileset: false });
    }, { passive: false });

    this.canvas.addEventListener("mousedown", function(event) {
      if(event.button != 0) {
        return;
      }

      _this.stopVelocityTween();
      _this.mouseIsDown = true;
      _this.mouseStartX = event.pageX;
      _this.mouseStartScrollX = _this.xScroll;
      _this.mouseDidDrag = false;
    }, false);

    document.addEventListener("mousemove", function(event) {
      if(!_this.mouseIsDown) {
        return;
      }

      var deltaX = event.pageX - _this.mouseStartX;
      if(!_this.mouseDidDrag && Math.abs(deltaX) < 4) {
        return;
      }

      event.preventDefault();
      _this.mouseDidDrag = true;
      _this.setXScroll(_this.mouseStartScrollX + deltaX);
      _this.draw({ redrawTileset: false });
    }, false);

    document.addEventListener("mouseup", function() {
      _this.mouseIsDown = false;
    }, false);

    // A desktop browser can switch into the mobile layout without gaining a
    // touch input source. Keep the touch gestures, but also make an ordinary
    // mouse click select the tile under the pointer.
    this.canvas.addEventListener("click", function(event) {
      if(_this.mouseDidDrag || Date.now() - _this.lastTouchEnd < 500) {
        return;
      }

      var x = event.pageX - $('#' + _this.canvas.id).offset().left;
      var y = event.pageY - $('#' + _this.canvas.id).offset().top;
      var tile = _this.tileFromXY(x, y);
      if(_this.selectTile(tile)) {
        _this.touchOnTile = tile;
        _this.draw({ redrawTileset: false });
      }
    }, false);

  },



  /*
  isTileSelected: function(tile) {
    var selectedTiles = this.editor.currentTile.getCharacters();
    console.log("SELECTED TILES:");
    console.log(selectedTiles);
    if(selectedTiles.length > 0 && selectedTiles[0].length > 0) {
      return selectedTiles[0][0] == tile;
    }
    return false;
  },
  */


  tileFromXY: function(x, y) {
    x = x - this.tileHPadding * this.scale - this.xScroll;
    var tile = Math.floor(x / (  (this.tileWidth * this.blockWidth + this.tileHPadding) * this.scale ));

    if(isNaN(tile) || tile >= this.tileCount || tile < 0) {
      return false;
    }


    return tile;
//    this.editor.currentTile.setCharacters([[tile]]);
  },

  touchStart: function(event) {
    this.touchVelocity.touchStart(event);  
    this.stopVelocityTween();

    event.preventDefault();
    var touches = event.touches;
    if(touches.length == 1) {
      var x = touches[0].pageX - $('#' + this.canvas.id).offset().left;
      var y = touches[0].pageY - $('#' + this.canvas.id).offset().top;

      this.highlightTouchOnTile = true;
      this.touchOnTile = this.tileFromXY(x, y);


      this.touchStartX = x;
      this.touchStartScollX = this.xScroll;

      this.scrollLeftStart = this.xScroll;//$('#tilePaletteMobileHolder').scrollLeft();
      this.draw();
    }
  },

  touchMove: function(event) {
    this.touchVelocity.touchMove(event);    

    event.preventDefault();
    var touches = event.touches;
    if(touches.length == 1) {
      var x = touches[0].pageX - $('#' + this.canvas.id).offset().left;
      var y = touches[0].pageY - $('#' + this.canvas.id).offset().top;


      this.xScroll = this.touchStartScollX + ( x - this.touchStartX);

      if(this.xScroll > 0) {
        this.xScroll = 0;
      }


      if(this.xScroll < -this.xScrollMax) {
        this.xScroll = -this.xScrollMax;
      }

      this.touchOnTile = this.tileFromXY(x, y);
      this.draw({ redrawTileset: false });

    }
  },

  setXScroll: function(xScroll) {
    this.xScroll = xScroll;
    if(this.xScroll > 0) {
      this.xScroll = 0;
    }
    if(this.xScroll < -this.xScrollMax) {
      this.xScroll = -this.xScrollMax;
    }

  },

  stopVelocityTween: function() {
    if(this.velocityTween !== null) {
      this.velocityTween.stop();
      this.velocityTween = null;
    }
  },

  revealTile: function(tile) {
    if(typeof tile != 'number' || isNaN(tile) || tile < 0) {
      return false;
    }

    // Refresh the palette first so its scale and viewport reflect the layout
    // restored after the chooser closes.
    this.draw({ redrawTileset: false });
    if(tile >= this.tileCount) {
      return false;
    }

    var tileHolderWidth = (this.tileWidth * this.blockWidth + this.tileHPadding) * this.scale;
    var tileLeft = this.tileHPadding * this.scale + tile * tileHolderWidth;
    var tileRight = tileLeft + this.tileWidth * this.blockWidth * this.scale;
    var viewportLeft = -this.xScroll;
    var viewportRight = viewportLeft + this.canvas.width;
    var nextScroll = this.xScroll;

    if(tileLeft < viewportLeft) {
      nextScroll = -(tileLeft - this.tileHPadding * this.scale);
    } else if(tileRight > viewportRight) {
      nextScroll = -(tileRight - this.canvas.width + this.tileHPadding * this.scale);
    }

    this.setXScroll(nextScroll);
    this.draw({ redrawTileset: false });
    return true;
  },

  startVelocityTween: function(velocity) {

    var start = { vx: velocity.vx }; // Start at (0, 0)
    var lastTime = getTimestamp();
    var _this = this;

    this.velocityTween = new TWEEN.Tween(start) 
            .to({ vx: 0 }, 800) // Move to (300, 200) in 1 second.
            .easing(TWEEN.Easing.Quadratic.Out) // Use an easing function to make the animation smooth.
            .onUpdate(function() {
              var time = getTimestamp();
              var dt = time - lastTime;
              lastTime = time;
              var dx = dt * start.vx;
              _this.setXScroll(_this.xScroll + dx);
              _this.draw({ redrawTileset: false });
            })
            .onComplete(function() {
              _this.velocityTween = null;
            })
            .start(); // Start the tween immediately.    
  },
  touchEnd: function(event) {

    event.preventDefault();
    this.lastTouchEnd = Date.now();
    this.scrollLeftEnd = this.xScroll;//$('#tilePaletteMobileHolder').scrollLeft();
    var scrollDiff = this.scrollLeftEnd - this.scrollLeftStart;


    if(scrollDiff < 10 && scrollDiff > -10) {
      // prob wanted to select tile, not scroll
      this.selectTile(this.touchOnTile);
    } else {
      this.touchVelocity.touchEnd(event);    
      var velocity = this.touchVelocity.getVelocity();
      if(velocity.vx < -0.07 || velocity.vx > 0.07) {
        this.startVelocityTween(velocity);
      }
  
    }



    this.highlightTouchOnTile = false;
//    this.touchOnTile = false;
    this.draw({ redrawTileset: false });
  },

  selectTile: function(tile) {
    if(tile === false) {
      return false;
    }

    if(this.editor.tools.drawTools.tool == 'block') {
      this.editor.currentTile.setBlock(tile);
    } else {
      this.editor.currentTile.setCharacters([[tile]]);
    }
    return true;
  },


  
  drawPalette: function() {
    var blocks = false;
    var screenMode = TextModeEditor.Mode.TEXTMODE;
    var tileSet = this.editor.tileSetManager.getCurrentTileSet();
    var blockSet =  this.editor.blockSetManager.getCurrentBlockSet();
    var currentTile = this.editor.currentTile;
    var colorPaletteManager = this.editor.colorPaletteManager;


    
    if(g_app.mode == '2d') {
      var layer = this.editor.layers.getSelectedLayerObject();    
      if(!layer || layer.getType() !== 'grid') {
        return false;
      }

      screenMode = layer.getScreenMode();
    }


    if(this.paletteCanvas == null) {
      this.paletteCanvas = document.createElement('canvas');
    }




    this.blockWidth = 1;
    this.blockHeight = 1;
    if(this.editor.tools.drawTools.tool == 'block') {
      blocks = blockSet.getBlocks();
      var maxBlockWidth = 0;
      var maxBlockHeight = 0;
      for(var i = 0; i < blocks.length; i++) {
        var blockData = blocks[i].data;
        if(blockData.length > 0) {

          var blockWidth = blockData[0].length;// * this.canvasScale;
          var blockHeight = blockData.length;// * this.canvasScale;

          if(blockWidth > maxBlockWidth) {
            maxBlockWidth = blockWidth;
          }

          if(blockHeight > maxBlockHeight) {
            maxBlockHeight = blockHeight;
          }
        }
      }

      this.blockWidth = maxBlockWidth;
      this.blockHeight = maxBlockHeight;
    }



    var xScroll = this.xScroll;
    this.tileWidth = tileSet.getTileWidth();
    this.tileHeight = tileSet.getTileHeight();


    this.tileHPadding = 1;
    this.tileVPadding = 1;

    if(screenMode == TextModeEditor.Mode.VECTOR) {
      this.tileHPadding = 2;
      this.tileVPadding = 2;
    }

    this.scale = Math.max(1, Math.floor( this.canvas.height / (this.tileHeight * this.blockHeight) ));

    if(screenMode == TextModeEditor.Mode.VECTOR) {
      this.tileHeight = this.canvas.height - 2;
      this.tileWidth = this.tileHeight;      
      this.scale = 1;
    }

    var tileHolderWidth = (this.tileWidth * this.blockWidth + this.tileHPadding )* this.scale;

    if(!isFinite(tileHolderWidth) || tileHolderWidth <= 0) {
      return false;
    }


    // max x scroll is the width of palette when drawn at scale minus what is displayed
    this.xScrollMax = tileHolderWidth * this.paletteTiles.length - this.canvas.width;
    if(this.xScrollMax < 0) {
      this.xScrollMax = 0;
    }

    if(-xScroll > this.xScrollMax) {
      xScroll = -this.xScrollMax;
    }

    if(-xScroll < 0) {
      xScroll = 0;
    }


    var tilesDisplayed = Math.ceil(this.canvas.width / tileHolderWidth);
    var startAtIndex = Math.floor(-xScroll / (tileHolderWidth));
    var endAtIndex = startAtIndex + tilesDisplayed + 1;
    if(endAtIndex > this.paletteTiles.length) {
      endAtIndex = this.paletteTiles.length;
    }
    tilesDisplayed = endAtIndex - startAtIndex;

    // need to work out the offset to display the onscreen canvas
    this.offscreenOffsetX = startAtIndex * tileHolderWidth + xScroll;

    
    this.offscreenHeight = this.canvas.height;
    this.offscreenWidth = tilesDisplayed * (tileHolderWidth / this.scale);

    if(!isFinite(this.offscreenWidth) || this.offscreenWidth <= 0 ||
        !isFinite(this.offscreenHeight) || this.offscreenHeight <= 0) {
      return false;
    }

    if(
      this.paletteCanvas.width < this.offscreenWidth 
      || this.paletteCanvas.height < this.offscreenHeight
      || this.paletteContext == null
      ) {
        this.paletteCanvas.width = this.offscreenWidth;
        this.paletteCanvas.height = this.offscreenHeight;
        this.paletteContext = this.paletteCanvas.getContext('2d');

        this.paletteContext.clearRect(0, 0, this.paletteCanvas.width, this.paletteCanvas.height);    
        this.paletteImageData = this.paletteContext.getImageData(0, 0, this.paletteCanvas.width, this.paletteCanvas.height);
    }

    if(screenMode == TextModeEditor.Mode.VECTOR) {
      this.paletteContext.clearRect(0, 0, this.paletteCanvas.width, this.paletteCanvas.height);
    }

    var args = {};
    args['screenMode'] = screenMode;

    if(screenMode === TextModeEditor.Mode.INDEXED) {
      args['transparentColorIndex'] = layer.getTransparentColorIndex();
    }

    args['imageData'] = this.paletteImageData;
    args['context'] = this.paletteContext;
    //args['colorRGB']  = ColorUtils.hexStringToInt(styles.textMode.tilePaletteFg);//0xffffff;

    args['color'] = currentTile.getColor();
    args['bgColor'] = currentTile.getBGColor();
    if(screenMode == TextModeEditor.Mode.C64ECM) {
      args['bgColor'] = this.editor.getC64ECMColor(args['bgColor']);
    }

    if(args['bgColor'] === this.editor.colorPaletteManager.noColor) {
      args['bgColorRGB'] = ColorUtils.hexStringToInt(styles.textMode.tilePaletteBg); 
    }
    //args['bgColorRGB'] = ColorUtils.hexStringToInt(styles.textMode.tilePaletteBg);//0x333333;
    var defaultBgColorRGB = ColorUtils.hexStringToInt(styles.textMode.tilePaletteBg);//0x333333;


    if(screenMode == TextModeEditor.Mode.C64MULTICOLOR) {
      args['bgColorRGB'] = '#ff0000';

      args['backgroundColor'] = layer.getBackgroundColor();
      args['c64Multi1Color'] = layer.getC64Multi1Color();
      args['c64Multi2Color'] = layer.getC64Multi2Color();
      
    }

    var colorPerMode = this.editor.getColorPerMode();
    var colorPalette = colorPaletteManager.getCurrentColorPalette();
    if(!colorPalette) {
      return false;
    }


    if(screenMode == TextModeEditor.Mode.VECTOR) {
      args['scale'] = this.tileHeight / tileSet.getTileHeight();
    } else {
      args['scale'] = 1;
    }


    
    for(var i = 0; i < tilesDisplayed; i++) {
      var x = this.tileHPadding + i * (this.tileWidth * this.blockWidth + this.tileHPadding);
      var y = this.tileVPadding;
      var index = i + startAtIndex;
      if(index < 0 || index >= this.paletteTiles.length) {
        break;
      }

      
      if(this.editor.tools.drawTools.tool == 'block') {       
        var b = this.paletteTiles[index].b;
        var blockData = blocks[b].data;


        // is x greater than the canvas size
        /*
        if(x + bx * this.tileWidth > this.canvasMaxWidth) {
          break;
        }
        */

        for(var by = 0; by < blockData.length; by++) {
          for(var bx = 0; bx < blockData[by].length; bx++) {
            var t = blockData[by][bx].t;
            args['character'] = t;

            if(colorPerMode == 'character') {
              var fgColor = tileSet.getTileColor(t);
              var bgColor = tileSet.getCharacterBGColor(t);
              args['colorRGB'] = colorPalette.getHex(fgColor);
              args['color'] = fgColor;
              if(bgColor != this.editor.colorPaletteManager.noColor) {
                args['bgColorRGB'] = colorPalette.getHex(bgColor);
              } else {
                args['bgColorRGB'] = defaultBgColorRGB;
              }
            }
            args['x'] = x + bx * this.tileWidth;
            args['y'] = y + by * this.tileHeight;

            //args['scale'] = 1;

            tileSet.drawCharacter(args);

          }
        }
      } else {
        var t =  this.paletteTiles[index].t;

        // is x greater than the canvas size
        if(x + this.tileWidth > this.paletteCanvas.width) {
          console.log('x greater than canvas size');
          break;
        }

        args['character'] = t;

        if(colorPerMode == 'character') {
          var fgColor = tileSet.getTileColor(t);
          var bgColor = tileSet.getCharacterBGColor(t);
          args['colorRGB'] = colorPalette.getHex(fgColor);
          args['color'] = fgColor;
          if(bgColor != this.editor.colorPaletteManager.noColor) {
            args['bgColorRGB'] = colorPalette.getHex(bgColor);
          } else {
            args['bgColorRGB'] = defaultBgColorRGB;
          }
        }
        args['x'] = x / args['scale'];
        args['y'] = y / args['scale'];

        tileSet.drawCharacter(args);
      }
    }

    if(screenMode !== TextModeEditor.Mode.VECTOR) {
      this.paletteContext.putImageData(this.paletteImageData, 0, 0);
    }


    return true;
  },


  resize: function() {
    var width = $('#tilePaletteMobileHolder').width();
    var height = $('#tilePaletteMobileHolder').height();

    this.canvas.width = width;
    this.canvas.height = height;

    this.context = UI.getContextNoSmoothing(this.canvas);
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  },

  draw: function(args) {

    var tool = this.editor.tools.drawTools.tool;

    var redrawTileset = true;
    if(typeof args != 'undefined') {
      if(typeof args.redrawTileset != 'undefined') {
        redrawTileset = args.redrawTileset;
      }
    }

    if(this.paletteCanvas == null) {
      redrawTileset = true;
    }

    this.resize();

    // Desktop-to-mobile layout changes resize the still-hidden mobile palette
    // before TextModeEditor has made its compact panels visible. Canvas
    // getImageData/drawImage reject a zero-sized source, so wait for the resize
    // that gives the palette real dimensions.
    if(this.canvas.width <= 0 || this.canvas.height <= 0) {
      return;
    }

    if(redrawTileset) {
      this.setPaletteTiles();
    }

    if(!this.drawPalette() || !this.paletteCanvas ||
        this.paletteCanvas.width <= 0 || this.paletteCanvas.height <= 0 ||
        !isFinite(this.offscreenWidth) || this.offscreenWidth <= 0 ||
        !isFinite(this.offscreenHeight) || this.offscreenHeight <= 0) {
      return;
    }


    var srcX = 0;
    var srcY = 0;
    

    var srcWidth = this.offscreenWidth;//this.paletteCanvas.width;
    var srcHeight = this.offscreenHeight;//this.paletteCanvas.height;

    var dstX = 0;//this.xScroll;
    var dstY = 0;
    /*
    var dstWidth = this.canvas.width;
    var dstHeight = this.canvas.height;



    this.scale = 1;// dstHeight / srcHeight;

    if(this.scale > 1) {
      this.scale = Math.floor(this.scale);
    }

    if(this.scale == 0) {
      this.scale = 1;  
    }
    

    dstWidth = srcWidth * this.scale;
    dstHeight = srcHeight * this.scale;
    */

    dstWidth = srcWidth * this.scale;// this.canvas.width;
    dstHeight = srcHeight * this.scale; //this.canvas.height;
    dstX = this.offscreenOffsetX;

//    this.xScrollMax = (this.paletteCanvas.width * this.scale) - this.canvas.width;    

    this.context.drawImage(this.paletteCanvas, 
      srcX, srcY, srcWidth, srcHeight,
      dstX, dstY, dstWidth, dstHeight);




  /*  

    var srcX = 0;
    var srcY = 0;

    var srcWidth = this.paletteCanvas.width;
    var srcHeight = this.paletteCanvas.height;

    var dstX = this.xScroll;
    var dstY = 0;
    var dstWidth = this.canvas.width;
    var dstHeight = this.canvas.height;

    this.scale = dstHeight / srcHeight;

    if(this.scale > 1) {
      this.scale = Math.floor(this.scale);
    }

    if(this.scale == 0) {
      this.scale = 1;  
    }

    dstWidth = srcWidth * this.scale;
    dstHeight = srcHeight * this.scale;

    this.xScrollMax = (this.paletteCanvas.width * this.scale) - this.canvas.width;    

    this.context.drawImage(this.paletteCanvas, 
      srcX, srcY, srcWidth, srcHeight,
      dstX, dstY, dstWidth, dstHeight);

*/

    // ---------------------------------------      

    if(this.editor.tools.drawTools.tool == 'block') {
      // draw rects around selected
      var selectedBlock = this.editor.currentTile.getBlock();

      this.context.fillStyle = styles.tilePalette.selectOutline;
      this.context.strokeStyle = styles.tilePalette.selectOutline;

      this.context.beginPath();
      this.context.lineWidth = 2;
      var tileX = this.tileHPadding * this.scale + selectedBlock * this.scale * (this.tileWidth * this.blockWidth + this.tileHPadding) + this.xScroll;
      var tileY = this.tileVPadding * this.scale;

      var tileWidth = this.tileWidth * this.blockWidth * this.scale;
      var tileHeight = this.tileHeight * this.blockHeight * this.scale; 
      this.context.rect(tileX, 
                        tileY, 
                        tileWidth,  
                        tileHeight);      
      this.context.stroke();

    } else {

      // draw rects around selected
      var selectedTiles = this.editor.currentTile.getCharacters();

      this.context.fillStyle = styles.tilePalette.selectOutline;
      this.context.strokeStyle = styles.tilePalette.selectOutline;

      this.context.beginPath();
      this.context.lineWidth = 2;
      for(var i = 0; i < selectedTiles.length; i++) {
        for(var j = 0; j < selectedTiles[i].length; j++) {
          var tile = selectedTiles[i][j];
          var tileX = this.tileHPadding * this.scale + tile * this.scale * (this.tileWidth + this.tileHPadding) + this.xScroll;
          var tileY = this.tileVPadding * this.scale;

          var tileWidth = this.tileWidth * this.scale;
          var tileHeight = this.tileHeight * this.scale; 
          this.context.rect(tileX, 
                            tileY, 
                            tileWidth,  
                            tileHeight);      
        }
      }
      this.context.stroke();
    } 



    if(this.touchOnTile !== false && this.highlightTouchOnTile) {
      this.context.fillStyle = styles.tilePalette.highlightOutline;
      this.context.strokeStyle = styles.tilePalette.highlightOutline;

      this.context.beginPath();
      this.context.lineWidth = 2;
      var tile = this.touchOnTile;
        var tileX = this.tileHPadding * this.scale + tile * this.scale * (this.tileWidth * this.blockWidth + this.tileHPadding) + this.xScroll;
        var tileY = this.tileVPadding * this.scale;

        var tileWidth = this.tileWidth * this.blockWidth * this.scale;
        var tileHeight = this.tileHeight * this.blockHeight * this.scale; 
        this.context.rect(tileX, 
                          tileY, 
                          tileWidth,  
                          tileHeight);      
      this.context.stroke();
    }


  }
}
