var ExportSvg = function() {
  this.exportPort = null;
  this.uiComponent = null;
  this.htmlComponent = null;
  this.visible = false;
}

ExportSvg.prototype = {
  init: function(exportPort) {
    this.exportPort = exportPort;
  },

  getSVGData: function() {
    return this.exportPort.getSVGData();
  },

  initContent: function() {
    $('#exportSVGAs').val('Untitled');
  },

  show: function() {
    var _this = this;

    if(this.uiComponent == null) {
      this.uiComponent = UI.create("UI.Dialog", {
        "id": "exportSVGDialog",
        "title": "Export SVG",
        "width": 300,
        "height": 120
      });

      this.htmlComponent = UI.create("UI.HTMLPanel");
      this.uiComponent.add(this.htmlComponent);

      this.htmlComponent.load('html/textMode/exportSvg.html', function() {
        _this.initContent();
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
    }

    UI.showDialog("exportSVGDialog");
    this.visible = true;
  },

  exportSVG: function(args) {
    var filename = typeof args.filename == 'undefined' ? 'Untitled' : args.filename;
    return this.exportPort.export(filename).catch(this.exportPort.reportError);
  }
}
