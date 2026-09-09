var TilePaletteChooserMobile = function() {
  this.editor = null;

  this.tilePaletteDisplay = null;
  this.charRecentIndex = 0;

  this.uiComponent = null;

  this.highlightCharacter = false;

  this.previewCanvas = null;
  this.glyphPreview = null;

  this.mapType = false;

  this.mode = "single";

  this.id = "Choose";


  this.closeHandler = false;

}

TilePaletteChooserMobile.prototype = {
  resetProjectState: function() {
    this.charRecentIndex = 0;
    this.highlightCharacter = false;
    this.mapType = false;
    this.closeHandler = false;
    if(this.tilePaletteDisplay && typeof this.tilePaletteDisplay.resetProjectState == 'function') {
      this.tilePaletteDisplay.resetProjectState();
    }
    if(this.glyphPreview) {
      this.glyphPreview.clear();
    }
  },

  init: function(editor, args) {
    this.editor = editor;

    if(typeof args != 'undefined') {
      if(typeof args.mode != 'undefined') {
        this.mode = args.mode;
      }

      if(typeof args.id != 'undefined') {
        this.id = args.id;
      }
    }
  },


  on: function(eventName, f) {
    if(eventName == 'close') {
      this.closeHandler = f;
    }
  },

  show: function(args) {

    if(this.uiComponent == null) {
      var _this = this;

      this.uiComponent = UI.create("UI.MobilePanel", { "id": "tilePaletteMobile" + this.id, "title": "Choose Tile", "fullScreen": true, "maxWidth": 640, "maxHeight": 800 });

      var html = '';
      html += '<div class="panelFill" id="tilePaletteMobileDialog' + this.id + '">';
      var canvasBackground = 'background-color: #222222';

      html += '<div style="position: absolute; left: 10px; top: 14px; width: 100px; height: 100px">';
      html += '<canvas id="tilePaletteMobileCanvasPreview' + this.id + '" style="' + canvasBackground + '"></canvas>';
      html += '</div>';

      html += '<div id="tilePaletteMobileTileOrientation" style="position: absolute; left: 140px; top: 10px; width: 100px; height: 100px">';
      html += '<span id="tilePaletteMobileTileFlipControls">';
      html += '  <div class="ui-button" style="margin-top: 0px" id="tilePaletteMobileFlipH">Flip H</div>';
      html += '  <div class="ui-button" style="margin-top: 6px" id="tilePaletteMobileFlipV">Flip V</div>';
      html += '</span>';
      html += '<span id="tilePaletteMobileTileRotateControls">';
      html += '  <div class="ui-button" style="margin-top: 6px" id="tilePaletteMobileRotate">Rotate</div>';
      html += '</span>';
      html += '</div>';


//      html += '<div style="position: absolute; left: 170px; top: 10px; right: 10px; height: 100px">';
      html += '<div id="tilePaletteMobileTileInfoPanel" style="position: absolute; left: 290px; top: 10px; right: 10px; height: 100px">';
      html += '  <div style="font-size: 22px" id="tilePaletteMobileInfo' + this.id + '"></div>';
      html += '  <div class="ui-button" style="margin-top: 20px" id="tilePaletteMobileEdit' + this.id + '">Edit Tile</div>';
      html += '</div>';


      html += '<div style="position: absolute; left: 0px; right: 0px; top: 134px; bottom: 45px; text-align: center; overflow-y: auto; overflow-x: hidden" id="tilePaletteMobileCanvasHolder' + this.id + '"><canvas id="tilePaletteMobileCanvas' + this.id + '" style="' + canvasBackground + '"></canvas></div>';

      html += '<div style="position: absolute; left: 10px; right: 10px; bottom: 5px; height: 40px;  display: flex;  align-items: center; justify-content: space-between;">';
      //html += '<label for="charPaletteSortOrderMobile' + this.id + '"></label> ';
      html += '<select id="charPaletteSortOrderMobile' + this.id + '" style="min-width: calc(80% - 140px)">';
      html += '</select>';

      html += '<div class="ui-button" id="charPaletteMobileClearSelection' + this.id + '" style="margin-left: 8px;">Clear Selection</div>';


      html += '<div class="ui-button" id="charPaletteMobilePrevPage' + this.id + '" style="margin-left: 8px;">&lt;</div>';
      html += '<span id="charPaletteMobilePageInfo' + this.id + '"></span>';
      html += '<div class="ui-button" id="charPaletteMobileNextPage' + this.id + '" style="margin-left: 8px;">&gt;</div>';

      html += '</div>';



      html += '</div>';
      var htmlPanel = UI.create("UI.HTMLPanel", { "id": "tilePaletteMobileHTML" + this.id, "html": html });
      this.uiComponent.add(htmlPanel);

      if(this.mode == 'multiple') {
        this.okButton = UI.create('UI.Button', { "text": "OK" });
        this.uiComponent.addButton(this.okButton);
        this.okButton.on('click', function(event) {
          if(_this.closeHandler) {
            _this.closeHandler();
          }

          UI.closeDialog();
        });
        $('#charPaletteMobileClearSelection' + this.id).show();
      } else {
        $('#charPaletteMobileClearSelection' + this.id).hide();
      }


      this.uiComponent.on('close', function() {
        /*
        if(_this.closeHandler !== false) {
          _this.closeHandler();
        }
        */
      });


      this.previewCanvas = document.getElementById('tilePaletteMobileCanvasPreview' + this.id);
      this.glyphPreview = new UI.GlyphPreview(this.previewCanvas);

      this.tilePaletteDisplay = new TilePaletteDisplay();
      this.tilePaletteDisplay.init(this.editor, {canvasElementId: "tilePaletteMobileCanvas" + this.id, 
        blockStacking: "vertical", 
        "mode": this.mode,
        "colors": "monochrome",
        "charMargin": 3 });
      this.tilePaletteDisplay.draw({ redrawTiles: true });

      var _this = this;
      this.tilePaletteDisplay.on('charactertouch', function(character) {
        _this.setCharacter(character);
      });

      this.tilePaletteDisplay.on('charactertouchend', function(character) {
        if(_this.mode === "single") {
          _this.commitCharacter(character);
        }
      });

      // MobilePanel is also used when a regular desktop browser switches to
      // mobile mode. TilePaletteDisplay reports mouse selection separately
      // from touch selection, so handle that path explicitly as well.
      this.tilePaletteDisplay.on('characterselected', function(character) {
        _this.setCharacter(character);
        if(_this.mode === "single") {
          _this.commitCharacter(character);
        }
      });

      this.initEvents();
    }



    UI.showDialog("tilePaletteMobile" + this.id);


    this.initContent();
  },

  commitCharacter: function(character) {
    this.editor.currentTile.setCharacters([[character]]);
    UI.closeDialog();

    if(this.editor.tilePaletteMobile) {
      this.editor.tilePaletteMobile.revealTile(character);
    }
  },

  initTilePaletteDisplay: function() {

    var tileSet = this.editor.tileSetManager.getCurrentTileSet();
    
    var tileWidth = tileSet.getTileWidth();
    var tileHeight = tileSet.getTileHeight();

    // the onscreen preview of the selected tile.
    this.previewWidth = 100;
    this.previewHeight = 100;
    this.glyphPreview.resize(this.previewWidth, this.previewHeight);



    // layout for tiles
    if(this.mapType !== false) {
      this.setCharPaletteMapType(this.mapType);
    }

    var dialogWidth = $('#tilePaletteMobileDialog' + this.id).width();
    var dialogHeight = $('#tilePaletteMobileCanvasHolder' + this.id).height();
    

    console.log('dialog dimensions = ' + dialogWidth + ',' + dialogHeight);

    var tilesAcross = 16;
    var tilesDown = 16;

    this.tilePaletteDisplay.setColumnWidthMax(16);
    this.tilePaletteDisplay.setColumnHeightMax(16);

    var page = this.tilePaletteDisplay.getPage();
    var maxPages = this.tilePaletteDisplay.getMaxPages();
    if(page >= maxPages) {
      page = 0;
      this.tilePaletteDisplay.setPage(page);

    }

//    this.tilePaletteDisplay.setScale(1);

    // default tile palette scale is 2?
    var scale = 2;


    // this.tilePaletteDisplay.getScale();

    if(tileWidth >= 16 || tileHeight >= 16) {
      // ok, want to try to fit at least 16 across, might need to adjust scale
      var testWidth = tilesAcross * tileWidth;

      var scales = [ 2, 1, 0.5, 0.25, 0.125 ];
      var scaleIndex = 0;
      for(scaleIndex = 0; scaleIndex < scales.length; scaleIndex++) {
        scale = scales[scaleIndex];
        if(testWidth * scale < dialogWidth) {
          // scale is ok
          break;
        }
      }
    }


    this.tilePaletteDisplay.setScale(scale);

    if(tileHeight * scale * tilesDown > dialogHeight) {
      scale = 1;
      this.tilePaletteDisplay.setScale(scale);
    }

    console.log('tile palette scale is ' + scale);



    var hSpacing = Math.floor((dialogWidth - (tilesAcross * tileWidth * scale)) / (tilesAcross + 1) );
    var vSpacing = Math.floor((dialogHeight - (tilesDown * tileHeight * scale)) / (tilesDown  + 1) );

    console.log('h spacing = ' + hSpacing + ', v spacing = ' + vSpacing);

    var margin = hSpacing;
    if(margin > vSpacing) {
      margin = vSpacing;
    }

    if(margin <= 0) {
      margin = 1;
    }

/*
    if(margin > 8) {
      margin = 8;
    }
*/

    console.log('margin = ' + margin);

    this.tilePaletteDisplay.setTileMargin(margin);

    if(typeof args != 'undefined') {
      if(typeof args.character != 'undefined') {
        this.setCharacter(args.character);
        this.tilePaletteDisplay.setSelected([args.character]);
      }

      if(typeof args.characters != 'undefined') {
        this.tilePaletteDisplay.setSelected(args.characters);
      }
    }
    // should set padding...
    this.tilePaletteDisplay.draw({ redrawTiles: true });

    this.editor.tileSetManager.tileSetUpdated({ "updateSortMethods": true });
    this.editor.tileSetManager.updateSortMethods();
    this.updatePageInfo();

    var currentTile = this.editor.currentTile.getCharacters();

    if(currentTile && currentTile.length > 0) {
      this.setCharacter(currentTile[0][0]);
    }

    this.drawSelectedTilePreview();
    
  },

  updatePageInfo: function() {

    var info = '';
    var page = this.tilePaletteDisplay.getPage() + 1;
    var maxPages = this.tilePaletteDisplay.getMaxPages();
    info += page + '/' + maxPages;
    $('#charPaletteMobilePageInfo' + this.id).html(info);
  },


  nextPage: function() {
    var page = this.tilePaletteDisplay.getPage() + 1;

    var maxPages = this.tilePaletteDisplay.getMaxPages();
    if(page < maxPages) {
      this.tilePaletteDisplay.setPage(page);
      this.tilePaletteDisplay.draw({ redrawTiles: true });
    }
    this.updatePageInfo();
  },

  prevPage: function() {
    var page = this.tilePaletteDisplay.getPage() - 1;

    if(page >= 0) {
      this.tilePaletteDisplay.setPage(page);
      this.tilePaletteDisplay.draw({ redrawTiles: true });
    }
    this.updatePageInfo();

  },


  initContent: function() {

    this.initTilePaletteDisplay();

    var hasFlip = this.editor.getHasTileFlip();
    var hasRotate = this.editor.getHasTileRotate();

    if(this.mode == 'single' && (hasFlip || hasRotate)) {
      $('#tilePaletteMobileTileOrientation').show();
      $('#tilePaletteMobileTileInfoPanel').css('left', '290px');

      if(hasFlip) {
        $('#tilePaletteMobileTileFlipControls').show();
      } else {
        $('#tilePaletteMobileTileFlipControls').hide();
      }

      if(hasRotate) {
        $('#tilePaletteMobileTileRotateControls').show();
      } else {
        $('#tilePaletteMobileTileRotateControls').hide();
      }

    } else {
      $('#tilePaletteMobileTileOrientation').hide();
      $('#tilePaletteMobileTileInfoPanel').css('left', '170px');

    }

  },

  initEvents: function() {
    var _this = this;
    $('#tilePaletteMobileEdit' + this.id).on('click', function() {
//      _this.editor.tileEditor.toggleVisible();      
      UI.closeDialog();
      _this.editor.showTileEditor({ character: _this.highlightCharacter });
    });

    $('#charPaletteSortOrderMobile' + this.id).on('change', function(event) {
      var value = $(this).val();
      _this.setCharPaletteMapType(value);
    });

    $('#charPaletteMobileClearSelection' + this.id).on('click', function(event) {
      _this.tilePaletteDisplay.setSelected([]);
    });

    $('#charPaletteMobilePrevPage' + this.id).on('click', function(event) {
      _this.prevPage();
    });

    $('#charPaletteMobileNextPage' + this.id).on('click', function(event) {
      _this.nextPage();
    });

    $('#tilePaletteMobileFlipH').on('click', function() {
      _this.editor.currentTile.flipH2d();
      _this.drawSelectedTilePreview();
    });

    $('#tilePaletteMobileFlipV').on('click', function() {
      _this.editor.currentTile.flipV2d();
      _this.drawSelectedTilePreview();

    });

    $('#tilePaletteMobileRotate').on('click', function() {
      _this.editor.currentTile.rotate2d();
      _this.drawSelectedTilePreview();
    });



  },

  setCharPaletteMapType: function(type) {
    this.mapType = type;
    this.tilePaletteDisplay.setCharPaletteMapType(this.mapType);
  },  

  getSelectedCharacters: function() {
    return this.tilePaletteDisplay.getSelectedCharacters();
  },


  // draw the offscreen selected tile canvas onto the onscreen tile preview
  drawSelectedTilePreview: function() {
    var tileSet = this.editor.tileSetManager.getCurrentTileSet();
    if(!tileSet || !this.glyphPreview) {
      return;
    }
    var colorPalette = this.editor.colorPaletteManager.getCurrentColorPalette();
    var args = {
      tileSet: tileSet,
      character: this.highlightCharacter,
      backgroundColor: '#222222'
    };
    if(this.editor.getColorPerMode() == 'character') {
      var fgColor = tileSet.getTileColor(this.highlightCharacter);
      var bgColor = tileSet.getCharacterBGColor(this.highlightCharacter);
      args.color = fgColor;
      args.colorRGB = colorPalette.getHex(fgColor);
      if(bgColor != this.editor.colorPaletteManager.noColor) {
        args.bgColorRGB = colorPalette.getHex(bgColor);
      }
    } else {
      args.color = this.editor.currentTile.color;
      args.bgColor = this.editor.currentTile.bgColor;
    }
    if(this.editor.getHasTileFlip()) {
      args.flipH = this.editor.currentTile.flipH;
      args.flipV = this.editor.currentTile.flipV;
    }
    if(this.editor.getHasTileRotate()) {
      args.rotZ = this.editor.currentTile.rotZ;
    }
    this.glyphPreview.drawTile(args);
  },

  setCharacter: function(character) {
    this.highlightCharacter = character;
    this.drawSelectedTilePreview();

    var characterHex = ("00" + character.toString(16)).substr(-2);
    var html = '';
    html += character + " (0x" + characterHex + ")";

    $('#tilePaletteMobileInfo' + this.id).html(html);

  }
}
