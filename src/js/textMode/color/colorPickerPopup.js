var ColorPickerPopup = function() {
  this.html = '<div>';
  this.html += '  <div id="colorPickerNoColor">';
  this.html += '    <div id="popupColor-1" class="colorPickerPopupColor colorPickerPopupNoColor" style="color: #ffffff; height: 20px; position: absolute; top: 2px; left: 54px"><i class="halflings halflings-remove"></i> Transparent</div>';
  this.html += '  </div>';

  this.html += '<div id="colorPickerECM">';

  this.html += '<div style="color: #ffffff; height: 30px; position: absolute; top: 0px; left: 54px; display: flex; align-items: center">';
  for(var i = 0; i < 4; i++) {
    var colorNumber = i + 1;
    var colorIndex = i;

    this.html += '<label class="rb-container" style="margin-right: 8px; margin-bottom: 0px; display: flex; align-items: center"> ';

    this.html += '<input type="radio" id="colorPickerECMColorIndex' + i + '" name="colorPickerECMColorIndex" value="' + colorIndex + '"'; 
    if(i === 0) {
      this.html += ' checked="checked" ';
    }
    this.html += '>';

    this.html += '<div id="colorPickerECMColorBlockIndex' + i + '" style="display: flex; width: 16px; height: 16px; margin-right: 6px; background-color: #884433"></div>';
    this.html += '<span class="rb-label">BG ' + colorNumber + '</span>';

    this.html += '<span class="checkmark"/>';
    this.html += '</label>';
  }

  this.html += '</div>';
  this.html += '</div>';

  this.html += '<div id="colorPickerCurrentColor" style="position: absolute; left: 2px; top: 2px; width: 50px; height: 24px; background-color: #ff0000"></div>';
  this.html += '<div id="colorPickerHoverColor" style="position: absolute; left: 2px; top: 26px; width: 50px; height: 24px; background-color: #00ff00"></div>';

  this.html += '  <canvas id="colorPickerCanvas" style="position: absolute; left: 54px"></canvas>';
  this.html += '  <div id="colorPickerInfo" style="color: #ffffff; margin: 2px; position: absolute; left: 2px; bottom: 2px"></div>';
  this.html += '  <div id="colorPickerKeyboardHint" style="display: none; color: #bbbbbb; position: absolute; right: 4px; bottom: 2px">Shift+Enter / Right-click BG</div>';
  this.html += '  <div id="colorPickerLabel1" style="display: none; position: absolute; color: #ffffff"></div>';
  this.html += '  <div id="colorPickerLabel2" style="display: none; position: absolute; color: #ffffff"></div>';
  this.html += '</div>';

  this.uiComponent = null;
  this.htmlComponent = null;

  this.canvas = null;
  this.context = null;
  this.highlightedColor = false;
  this.keyboardNoColorHighlighted = false;
  this.keyboardNoColorReturnColor = false;

  this.colorPickedCallback = null;
  this.secondaryColorPickedCallback = null;
  this.c64ECMColorSetCallback = null;
  this.c64ECMColorIndex = 0;

  this.mode = '';

  this.visible = false;

  this.colorPaletteDisplay =  null;
}

ColorPickerPopup.prototype = {
  resetProjectState: function() {
    this.highlightedColor = false;
    this.keyboardNoColorHighlighted = false;
    this.keyboardNoColorReturnColor = false;
    this.currentColor = false;
    this.colorPickedCallback = null;
    this.secondaryColorPickedCallback = null;
    this.c64ECMColorSetCallback = null;
    if(this.colorPaletteDisplay && typeof this.colorPaletteDisplay.resetProjectState == 'function') {
      this.colorPaletteDisplay.resetProjectState();
    }
    this.close();
  },

  init: function(editor) {
    var _this = this;
    this.editor = editor;

    this.uiComponent = UI.create("UI.Popup", { "id": "colorPickerPopup", "width": 300, "height": 300 });

    this.uiComponent.on('keydown', function(event) {
      _this.keyDown(event);
    });
    
    this.htmlComponent = UI.create("UI.HTMLPanel", { "html": this.html });
    this.uiComponent.add(this.htmlComponent);
    this.initEvents();
  },

  keyDown: function(event) {
    if(!this.colorPaletteDisplay) {
      return;
    }

    var dx = 0;
    var dy = 0;
    switch(event.key) {
      case 'ArrowLeft':
        dx = -1;
      break;
      case 'ArrowRight':
        dx = 1;
      break;
      case 'ArrowUp':
        dy = -1;
      break;
      case 'ArrowDown':
        dy = 1;
      break;
      case 'Enter':
        var color = this.colorPaletteDisplay.getHighlightColor();
        var noColorSelected = this.hasNone && this.keyboardNoColorHighlighted &&
          color === this.editor.colorPaletteManager.noColor;
        if(color !== false &&
            (color !== this.editor.colorPaletteManager.noColor || noColorSelected)) {
          var colorPicked = false;
          if(event.shiftKey && this.secondaryColorPickedCallback) {
            this.secondaryColorPickedCallback(color);
            colorPicked = true;
          } else if(!event.shiftKey && this.c64ECM && this.c64ECMColorSetCallback) {
            this.c64ECMColorSetCallback(this.c64ECMColorIndex, color);
            colorPicked = true;
          } else if(!event.shiftKey && this.colorPickedCallback) {
            this.colorPickedCallback(color);
            colorPicked = true;
          }
          if(colorPicked) {
            this.close();
          }
        }
        event.preventDefault();
        return;
      case 'Escape':
        this.close();
        event.preventDefault();
        return;
      default:
        return;
    }

    if(this.keyboardNoColorHighlighted) {
      if(dy > 0) {
        var returnColor = this.keyboardNoColorReturnColor;
        this.setKeyboardNoColorHighlighted(false);
        if(returnColor !== false && returnColor !== this.editor.colorPaletteManager.noColor) {
          this.colorPaletteDisplay.setHighlightColor(returnColor);
        } else {
          this.colorPaletteDisplay.moveHighlight(0, 0);
        }
      }
      event.preventDefault();
      return;
    }

    var previousColor = this.colorPaletteDisplay.getHighlightColor();
    var moved = this.colorPaletteDisplay.moveHighlight(dx, dy);
    if(!moved && dy < 0 && this.hasNone) {
      this.keyboardNoColorReturnColor = previousColor;
      this.setKeyboardNoColorHighlighted(true);
    }
    event.preventDefault();
  },

  setKeyboardNoColorHighlighted: function(highlighted) {
    this.keyboardNoColorHighlighted = highlighted;
    $('#popupColor-1').css('box-shadow', highlighted ?
      '0 0 0 1px #FFD400, 0 0 0 2px #000000' :
      'none');
    $('#popupColor-1').css('border-radius', highlighted ? '2px' : '0');
    if(highlighted && this.colorPaletteDisplay) {
      this.colorPaletteDisplay.setHighlightColor(this.editor.colorPaletteManager.noColor);
    }
  },

  updateInfo: function() {
    var html = '';

    if(this.highlightedColor !== this.editor.colorPaletteManager.noColor && typeof this.highlightedColor != 'undefined') {
      var colorPalette = this.editor.colorPaletteManager.getCurrentColorPalette();
      var rgbHexString = colorPalette.getHexString(this.highlightedColor);

      var highlightedColorHex = ("00" + this.highlightedColor.toString(16)).substr(-2);
      //html += 'Color: ';
      html += '<div style="display: inline-block; width: 20px">' + this.highlightedColor + '</div>';
      html += '<div style="display: inline-block; width: 30px">0x' + highlightedColorHex + '</div>';
      html += '<div style="display: inline-block; width: 60px">#' + rgbHexString + '</div>';



      $('#colorPickerHoverColor').css('background-color', '#' + rgbHexString);

    } else {
      $('#colorPickerHoverColor').css('background-color', '#000000');

    }

    $('#colorPickerInfo').html(html);
  },

  initEvents: function() {

    var _this = this;

    $('#popupColor-1').on('click', function(event) {
      _this.colorPickedCallback(-1);
      _this.close();
    });

    $('#popupColor-1').on('contextmenu', function(event) {
      event.preventDefault();
      if(_this.secondaryColorPickedCallback) {
        _this.secondaryColorPickedCallback(-1);
        _this.close();
      }
    });

    $('input[name=colorPickerECMColorIndex]').on('click', function() {
      var index = $('input[name=colorPickerECMColorIndex]:checked').val();
      index = parseInt(index, 10);
      if(!isNaN(index)) {
        _this.setC64ECMIndex(index);
      }
    });
  },

  updateC64ECMColors: function() {
//    var colorPaletteManager = this.editor.colorPaletteManager;
    var colorPalette = this.editor.colorPaletteManager.getCurrentColorPalette();
    for(var i = 0; i < 4; i++) {
      var color = this.editor.getC64ECMColor(i);
      var colorHex = colorPalette.getHexString(color);
      $('#colorPickerECMColorBlockIndex' + i).css('background-color', '#' + colorHex);      
    }
  },
  setC64ECMIndex: function(index) {
    this.c64ECMColorIndex = index;

    // get the current colour for the colour index..
    var layer = this.editor.layers.getSelectedLayerObject();
    if(layer && layer.getType() == 'grid') {
      this.colorPaletteDisplay.setSelectedColor(0, layer.getC64ECMColor(index));
    }

    this.colorPickedCallback(index);
  },

  initColorPaletteDisplay: function() {
    var _this = this;

    this.colorPaletteDisplay = new ColorPaletteDisplay();
    this.colorPaletteDisplay.init(this.editor, { "canvasElementId": "colorPickerCanvas", "maxSelectableColors": 1, "canSelectWithRightMouseButton": false, "highVisibilityHighlight": true });

    this.colorPaletteDisplay.on('colorselected', function(event) {
      var color = event.color;
      if(color === _this.editor.colorPaletteManager.noColor) {
        return;
      }

      if(event.colorIndex == 1) {
        if(_this.secondaryColorPickedCallback) {
          _this.secondaryColorPickedCallback(color);
          _this.close();
        }
      } else if(event.colorIndex == 0) {
        if(_this.c64ECM && _this.c64ECMColorSetCallback) {
          _this.c64ECMColorSetCallback(_this.c64ECMColorIndex, color);

        } else if(_this.colorPickedCallback) {
          _this.colorPickedCallback(color);
        }
        if(_this.colorPickedCallback || (_this.c64ECM && _this.c64ECMColorSetCallback)) {
          _this.close();
        }
      }
    });

    this.colorPaletteDisplay.on('highlightchanged', function(event) {
      if(event.color !== _this.editor.colorPaletteManager.noColor &&
          _this.keyboardNoColorHighlighted) {
        _this.setKeyboardNoColorHighlighted(false);
      }
      _this.highlightedColor = event.color;
      _this.updateInfo();
    });

  },

  show: function(x, y, args) {

    if(this.colorPaletteDisplay == null) {
      this.initColorPaletteDisplay();
    }

    var colorPalette = this.editor.colorPaletteManager.getCurrentColorPalette();

    this.colorPickedCallback = null;
    this.secondaryColorPickedCallback = null;
    this.c64ECMColorSetCallback = null;

    if(typeof args != 'undefined') {
      if(typeof args.colorPickedCallback != 'undefined') {
        this.colorPickedCallback = args.colorPickedCallback;
      }

      if(typeof args.secondaryColorPickedCallback != 'undefined') {
        this.secondaryColorPickedCallback = args.secondaryColorPickedCallback;
      }

      if(typeof args.c64ECMColorSetCallback != 'undefined') {
        this.c64ECMColorSetCallback = args.c64ECMColorSetCallback;
      }

      if(typeof args.type != 'undefined') {
        this.colorPaletteDisplay.setType(args.type);

      } else {
        this.colorPaletteDisplay.setType('');
      }
    }

    this.colorPaletteDisplay.canSelectWithRightMouseButton =
      typeof this.secondaryColorPickedCallback == 'function';
    this.colorPaletteDisplay.setSelectedColors([
      this.editor.colorPaletteManager.noColor,
      this.editor.colorPaletteManager.noColor
    ]);


    var colors = [];
    var colorCount = colorPalette.getColorCount();
    for(var i = 0; i < colorCount; i++) {
      colors.push(colorPalette.getHex(i));
    }

    var colorMap = colorPalette.getCurrentColorMap();
    var colorsAcross = 8;
    var colorsDown = 8;
    if(colorMap.length > 0 && colorMap[0].length > 0) {
      colorsAcross = colorMap[0].length;
      colorsDown = colorMap.length;
    }
    var colorWidth = 26;
    var colorHeight = 26;
    if(colorsAcross > 12 || colorsDown > 12) {
      colorWidth = 20;
      colorHeight = 20;
    }
    this.colorPaletteDisplay.setColorSize(colorWidth, colorHeight);
    this.colorPaletteDisplay.setColors(colors, { colorMap: colorPalette.getCurrentColorMap() });

    this.mode = '';
    if(args.mode !== 'undefined') {
      this.mode = args.mode;
    }

    this.currentColor = false;
    if(typeof args.currentColor != 'undefined') {
      this.currentColor = args.currentColor;
    }

    this.isCellBG = false;
    if(typeof args.isCellBG != 'undefined') {
      this.isCellBG = args.isCellBG;
    }

    this.screenMode = false;
    if(typeof args.screenMode != 'undefined') {
      this.screenMode = args.screenMode;
    }

    this.hasNone = false;
    this.c64ECM = false;

    if(this.isCellBG) {
      if(this.screenMode == TextModeEditor.Mode.C64ECM) {
        this.hasNone = false;
        this.c64ECM = true;

        this.c64ECMColorIndex = this.currentColor;

        if(this.currentColor === this.editor.colorPaletteManager.noColor) {
          this.c64ECMColorIndex = 0; // background colour
        } 

        $('#colorPickerECMColorIndex' + this.c64ECMColorIndex).prop('checked', true);
        // get the current colour for the colour index..
        this.currentColor = this.editor.getC64ECMColor(this.c64ECMColorIndex);

        this.updateC64ECMColors();

      } else {
        this.hasNone = true;
      }
    } else {
      if(typeof args.hasNone != 'undefined') {
        this.hasNone = args.hasNone;
      }
    }


    this.setKeyboardNoColorHighlighted(false);
    this.keyboardNoColorReturnColor = false;

    if(this.currentColor === this.editor.colorPaletteManager.noColor && this.hasNone) {
      this.colorPaletteDisplay.setSelectedColor(0, this.currentColor);
      this.setKeyboardNoColorHighlighted(true);
    } else if(this.currentColor !== false) {
      var currentColorHex = colorPalette.getHexString(this.currentColor);

      $('#colorPickerCurrentColor').css('background-color', '#' + currentColorHex);
      $('#colorPickerHoverColor').css('background-color', '#' + currentColorHex);

      this.colorPaletteDisplay.setSelectedColor(0, this.currentColor);
      this.colorPaletteDisplay.setHighlightColor(this.currentColor);
    } else {
      this.colorPaletteDisplay.setSelectedColor(0, this.editor.colorPaletteManager.noColor);
      this.colorPaletteDisplay.setHighlightColor(this.editor.colorPaletteManager.noColor);
      this.colorPaletteDisplay.moveHighlight(0, 0);
    }

    $('#colorPickerKeyboardHint').toggle(
      typeof this.secondaryColorPickedCallback == 'function');


    this.colorCount = colorPalette.getColorCount();

    if(this.c64ECM) {
      
      $('#colorPickerCanvas').css('top', '34px');
      $('#colorPickerNoColor').hide();      
      $('#colorPickerECM').show();

    } else if(this.hasNone) {

      $('#colorPickerCanvas').css('top', '28px');
      $('#colorPickerNoColor').show();      
      $('#colorPickerECM').hide();
    } else {
      $('#colorPickerCanvas').css('top', '2px');
      $('#colorPickerNoColor').hide();            
      $('#colorPickerECM').hide();
    }

/*
    if(this.canvasHeight < this.highlightColorGridPositionY + this.highlightColorHeight + 2) {
      this.canvasHeight = this.highlightColorGridPositionY + this.highlightColorHeight + 2;
    }
*/
    this.infoHeight = 24;

//    console.error('popup height');

    var colorPickerHeight = this.colorPaletteDisplay.getHeight();
    var colorPickerWidth = this.colorPaletteDisplay.getWidth();
    var currentColorWidth = 50;
    var currentColorHeight = 50;

    var popupWidth = colorPickerWidth + currentColorWidth + 6;
    var popupHeight = colorPickerHeight + this.infoHeight;
    if(popupHeight < currentColorHeight + 2) {
      popupHeight = currentColorHeight + 2;
    }

    if(this.hasNone) {
      popupHeight += 28;
    }

    if(this.c64ECM) {
      popupWidth += 90;
      popupHeight += 40;
    }

    if(popupWidth < 160) {
      popupWidth = 160;
    }

    this.uiComponent.setDimensions(popupWidth, popupHeight);
    UI.showPopup("colorPickerPopup", x, y);
    this.visible = true;
  },

  close: function() {
    if(this.visible) {
      UI.hidePopup();
    }
    this.visible = false;
  },

}
