/**
 * Give icon-only controls accessible names after a panel template is loaded.
 *
 * Tool panels are mounted side-by-side (desktop + mobile, tile + pixel), so
 * this only adds aria attributes and never creates ids. Names are derived
 * from data-label / title / data-shortcut-label / data-type attributes that
 * the templates already carry; purely decorative images get alt="".
 */
UI.enhancePanelAccessibility = function(root) {
  if(!root || !root.querySelectorAll) {
    return;
  }

  var toolTypeLabels = {
    pen: 'Pencil', erase: 'Eraser', fill: 'Fill bucket', eyedropper: 'Eyedropper',
    line: 'Line', rect: 'Rectangle', oval: 'Oval', select: 'Marquee select',
    move: 'Move', hand: 'Hand', zoom: 'Zoom', type: 'Type', pixel: 'Pixel',
    block: 'Meta tile', charpixel: 'Character pixel', linesegment: 'Line segments',
    rotate: 'Rotate', draw: 'Draw', cut: 'Cut', copy: 'Copy', paste: 'Paste'
  };

  // Most specific first: cellBackgroundColor also matches backgroundColor.
  var wellLabels = [
    [/tileEditorMobileMultiColor/i, 'Tile color'],
    [/tileEditorMultiColor/i, 'Tile color'],
    [/cellBackgroundColor/i, 'Cell background color'],
    [/foregroundColor/i, 'Cell foreground color'],
    [/borderColor/i, 'Frame border color'],
    [/backgroundColor/i, 'Frame background color'],
    [/c64Multi1Color/i, 'C64 multi color 1'],
    [/c64Multi2Color/i, 'C64 multi color 2'],
    [/subPaletteColor/i, 'Sub palette color'],
    [/multiColor/i, 'Multi color']
  ];

  function wellLabel(element) {
    var className = element.getAttribute ? (element.getAttribute('class') || '') : '';
    // Some swatches (tileEditorMultiColor) carry no class, so match the id too.
    var identity = className + ' ' + (element.getAttribute ? (element.getAttribute('id') || '') : '');
    for(var i = 0; i < wellLabels.length; i++) {
      if(wellLabels[i][0].test(identity)) {
        var label = wellLabels[i][1];
        var index = element.getAttribute('data-index');
        if(index !== null && index !== '') {
          label += ' ' + (parseInt(index, 10) + 1);
        }
        return label;
      }
    }
    return '';
  }

  function labelFromAttributes(element) {
    var label = element.getAttribute('data-label') || element.getAttribute('title') || '';
    if(label) {
      return label;
    }
    var labelled = element.querySelector('[data-shortcut-label], img[title]');
    if(labelled) {
      label = labelled.getAttribute('data-shortcut-label') || labelled.getAttribute('title') || '';
    }
    if(label) {
      return label;
    }
    var toolType = element.getAttribute('data-type') || element.getAttribute('data-toolType') || '';
    if(toolType && toolTypeLabels[toolType]) {
      return toolTypeLabels[toolType];
    }
    return '';
  }

  var controls = root.querySelectorAll(
    '.ui-button, .drawTool, .pixelDrawTool, .drawToolMobile, ' +
    '.drawToolMobileSide, .pixelDrawToolMobileSide, .pixelTool, ' +
    '.colorPaletteTool, .mobileRadio, .tileEditorC64ColorType'
  );
  for(var i = 0; i < controls.length; i++) {
    var control = controls[i];
    if(control.hasAttribute('aria-label') || control.hasAttribute('aria-labelledby')) {
      continue;
    }
    var label = labelFromAttributes(control);
    if(!label && control.textContent) {
      var text = control.textContent.replace(/\s+/g, ' ').trim();
      if(text && text.length <= 40) {
        label = text;
      }
    }
    if(label) {
      control.setAttribute('aria-label', label);
      if(control.tagName === 'DIV' && !control.hasAttribute('role')) {
        control.setAttribute('role', 'button');
      }
    }
  }

  var wells = root.querySelectorAll(
    '.borderColor, .backgroundColor, .foregroundColor, .cellBackgroundColor, ' +
    '.borderColorMobile, .backgroundColorMobile, .foregroundColorMobile, ' +
    '.cellBackgroundColorMobile, .colorSetting, .pixelToolSubPaletteColor, ' +
    '.tileEditorSubPaletteColor, .tileEditorMobileSubPaletteColor, .tileEditorC64Color, ' +
    '#tileEditorMultiColor, #tileEditorMobileMultiColor'
  );
  for(var w = 0; w < wells.length; w++) {
    var well = wells[w];
    if(well.hasAttribute('aria-label') || well.hasAttribute('aria-labelledby')) {
      continue;
    }
    var name = wellLabel(well);
    if(name) {
      well.setAttribute('aria-label', name);
      if(well.tagName === 'DIV' && !well.hasAttribute('role')) {
        well.setAttribute('role', 'button');
      }
    }
  }

  var images = root.querySelectorAll('img:not([alt])');
  for(var m = 0; m < images.length; m++) {
    var img = images[m];
    img.setAttribute('alt', img.getAttribute('title') || '');
  }

  var fields = root.querySelectorAll('input, select, textarea');
  for(var f = 0; f < fields.length; f++) {
    var field = fields[f];
    if(field.hasAttribute('aria-label') || field.hasAttribute('aria-labelledby')) {
      continue;
    }
    if(field.labels && field.labels.length > 0) {
      continue;
    }
    var fieldLabel = field.getAttribute('data-label') || field.getAttribute('title') || '';
    if(fieldLabel) {
      field.setAttribute('aria-label', fieldLabel);
    }
  }
};

UI.HTMLPanel = function() {

  this.init = function(args) {
    this.html = '';
    if(args.html) {
      this.html = args.html;
    }

    this.style = null;
    if(args.style) {
      this.style = args.style;
    }

    this.visible = true;
    if(typeof(args.visible) != 'undefined') {
      this.visible = args.visible;
      if(!this.visible) {
        this.style += ';display: none';
      }
    }


  } 


  this.setHTML = function(html) {
    this.html = html;
    $('#' + this.id).html(html);
  }

  this.htmlLoaded = function(response, callback) {
    var _this = this;

//    this.html = response;

    var panelElement = document.getElementById(_this.id);
    if(!panelElement) {
      return;
    }
    SafeHTML.setTemplateHTML(panelElement, response);
    UI.enhancePanelAccessibility(panelElement);

    if(typeof UI.number != 'undefined') {
      UI.number.initControls('#' + _this.id + ' .number');
    } else {
      console.error('weird error');        
    }

    if(typeof UI.slider != 'undefined') {
      UI.slider.initControls('#' + _this.id);
    } else {
      console.error('weird error');        
    }

    $('#' + _this.id + ' .nodrag').on('touchmove', function(e) {
      e.preventDefault();
    });

    if(typeof callback != 'undefined') {
      callback();
    }
    _this.trigger('loaded');
  }

  this.load = function(url, callback) {
    var htmlPanel = this;
    var _this = this;
    if(typeof g_htmlCache != 'undefined' && typeof g_htmlCache[url] != 'undefined') {
      this.htmlLoaded(g_htmlCache[url], callback);
    } else {
      $.get(url + '?9', function(response) {
        _this.htmlLoaded(response, callback);
      });
    }
  }

  this.resize = function() {
    this.trigger('resize');
  }

  this.getElement = function() {
    var element = document.createElement("div");
    element.setAttribute("id", this.id);
    element.setAttribute("class", "ui-html-panel ui-mouseevents");
    if(!this.visible) {
      element.setAttribute('style', 'display: none;');

    }
    
    if(typeof this.html != 'undefined' && this.html !== '') {
      SafeHTML.setHTML(element, this.html);
      UI.enhancePanelAccessibility(element);
    }

    return element;
  }

  this.getHTML = function() {
    var html = '';
    html += '<div id="' + this.id + '" class="ui-html-panel ui-mouseevents" ';
    if(this.style != null) {
      html += ' style="' + this.style + '" ';
    }
    html += '>';
    if(this.html) {
      html += this.html;
    }
    html += '</div>';
    return html;
  }

  this.mouseEnter = function(event) {    
    this.trigger('mouseenter', event);
  }
  this.mouseLeave = function(event) {
    this.trigger('mouseleave', event);
  }

  this.mouseMove = function(event) {
    this.trigger('mousemove', event);
  }

  this.doubleClick = function(event) {
    this.trigger('dblclick', event);
  }

  this.mouseDown = function(event) {
    this.trigger('mousedown', event);
  }

  this.mouseUp = function(event) {
    this.trigger('mouseup', event);

  }

  this.mouseWheel = function(event) {
    this.trigger('mousewheel', event);
  }

  this.contextMenu = function(event) {
    this.trigger('contextmenu', event);
  }


}

UI.registerComponentType("UI.HTMLPanel", UI.HTMLPanel);
