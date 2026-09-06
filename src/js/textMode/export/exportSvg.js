var ExportSvg = function() {
  this.exportPort = null;
  this.uiComponent = null;
  this.htmlComponent = null;
  this.area = 'document';
  this.includeBackground = true;
  this.scale = 1;
  this.visible = false;
}

ExportSvg.prototype = {
  init: function(exportPort) {
    this.exportPort = exportPort;
  },

  getSVGData: function() {
    return this.exportPort.getSVGData(this.getOptions());
  },

  getOptions: function() {
    return {
      area: this.area,
      includeBackground: this.includeBackground,
      scale: this.scale
    };
  },

  initContent: function() {
    var hasSelection = this.exportPort.getDimensions('selection') !== false;
    if(!hasSelection) {
      this.area = 'document';
    }
    $('#exportSVGAs').val(this.exportPort.getDefaultFilename());
    $('#exportSVGAreaRow').toggle(hasSelection);
    $("input[name='exportSVGArea'][value='" + this.area + "']").prop('checked', true);
    $("input[name='exportSVGScale'][value='" + this.scale + "']").prop('checked', true);
    $('#exportSVGBackground').val(this.includeBackground ? 'document' : 'transparent');
    this.uiComponent.setHeight(hasSelection ? 240 : 200);
    this.updateDimensions();
  },

  initEvents: function() {
    var _this = this;
    $("input[name='exportSVGArea']").on('change', function() {
      _this.area = $(this).val();
      _this.updateDimensions();
    });
    $("input[name='exportSVGScale']").on('change', function() {
      _this.scale = parseInt($(this).val(), 10);
      _this.updateDimensions();
    });
    $('#exportSVGBackground').on('change', function() {
      _this.includeBackground = $(this).val() === 'document';
    });
  },

  updateDimensions: function() {
    var dimensions = this.exportPort.getDimensions(this.area);
    if(dimensions === false) {
      $('#exportSVGDimensions').text('Unavailable');
      return;
    }
    $('#exportSVGDimensions').text(
      (dimensions.width * this.scale) + ' \u00d7 ' + (dimensions.height * this.scale) + ' px'
    );
  },

  show: function() {
    var _this = this;

    if(this.uiComponent == null) {
      this.uiComponent = UI.create("UI.Dialog", {
        "id": "exportSVGDialog",
        "title": "Export SVG",
        "width": 340,
        "height": 200
      });

      this.htmlComponent = UI.create("UI.HTMLPanel");
      this.uiComponent.add(this.htmlComponent);

      this.htmlComponent.load('html/textMode/exportSvg.html', function() {
        _this.initEvents();
        _this.initContent();
      });

      this.copyButton = UI.create('UI.Button', {
        "imageSrc": "icons/svg/glyphicons-basic-614-copy.svg",
        "text": "Copy SVG",
        "color": "secondary"
      });
      this.uiComponent.addButton(this.copyButton);
      this.copyButton.on('click', function() {
        _this.copySVG();
      });

      this.okButton = UI.create('UI.Button', {
        "imageSrc": "icons/svg/glyphicons-basic-199-save.svg",
        "text": "Download",
        "color": "primary"
      });
      this.uiComponent.addButton(this.okButton);
      this.okButton.on('click', function() {
        var filename = $('#exportSVGAs').val();
        _this.exportSVG({ filename: filename });
      });

      this.closeButton = UI.create('UI.Button', { "text": "Close", "color": "secondary" });
      this.uiComponent.addButton(this.closeButton);
      this.closeButton.on('click', function() {
        UI.closeDialog();
      });

      this.uiComponent.on('close', function() {
        _this.visible = false;
      });
    } else {
      this.initContent();
    }

    UI.showDialog("exportSVGDialog");
    this.visible = true;
  },

  exportSVG: function(args) {
    var filename = typeof args.filename == 'undefined' ? 'Untitled' : args.filename;
    var options = this.getOptions();
    if(typeof args.scale != 'undefined') {
      options.scale = args.scale;
    }
    return this.exportPort.export(filename, options).catch(this.exportPort.reportError);
  },

  copySVG: function() {
    var _this = this;
    return this.exportPort.copy(this.getOptions()).then(function(result) {
      if(result !== false) {
        _this.copyButton.setText('Copied');
        setTimeout(function() {
          _this.copyButton.setText('Copy SVG');
        }, 1500);
      }
      return result;
    }).catch(this.exportPort.reportError);
  }
}
