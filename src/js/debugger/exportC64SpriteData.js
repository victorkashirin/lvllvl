var ExportC64SpriteData = function () {
  this.editor = null;
  this.textEditor = null;
  this.lineIncrement = 10;
  this.lineNumber = 10;
  this.outputValid = false;
  this.outputSignature = null;
}

ExportC64SpriteData.prototype = {
  init: function(editor) {
    this.editor = editor;
  },


  show: function() {
    var _this = this;

    if(this.uiComponent == null) {
      this.uiComponent = UI.create("UI.Dialog", { "id": "exportC64SpriteDataDialog", "title": "Export Sprite Data", "width": 800, "height": 600 });

      this.htmlComponent = UI.create("UI.HTMLPanel");
      this.uiComponent.add(this.htmlComponent);
      this.htmlComponent.load('html/c64/exportC64SpriteData.html', function() {
        _this.initContent();
        _this.initEvents();
      });

      this.displayButton = UI.create('UI.Button', { "imageSrc": "icons/svg/glyphicons-basic-614-copy.svg", "text": "Copy To Clipboard", "color": "primary", "enabled": false });
      this.uiComponent.addButton(this.displayButton);
      this.displayButton.on('click', function(event) {
        //UI.closeDialog();
        _this.copyToClipboard();
      });


      this.closeButton = UI.create('UI.Button', { "text": "Close", "color": "secondary" });
      this.uiComponent.addButton(this.closeButton);
      this.closeButton.on('click', function(event) {
        UI.closeDialog();
      });

    } else {
      this.initContent();
    }

    UI.showDialog("exportC64SpriteDataDialog");
  },

  initContent: function() {
    if(this.textEditor == null) {
      this.textEditor = ace.edit("exportC64SpriteDataSource");
      this.textEditor.getSession().setTabSize(2);
      this.textEditor.getSession().setUseSoftTabs(true);
      this.textEditor.on('focus', function() {
        g_app.setAllowKeyShortcuts(false);
        UI.setAllowBrowserEditOperations(true);
      });

      this.textEditor.on('blur', function() {
        g_app.setAllowKeyShortcuts(true);
        UI.setAllowBrowserEditOperations(false);
      });
      var mode = 'ace/mode/assembly_6502';
      if(this.mode == 'javascript') {
        mode = 'ace/mode/javascript';
      }
      this.textEditor.getSession().setMode(mode);//"ace/mode/assembly_6502");
      this.textEditor.setShowInvisibles(false);
    }
    this.exportData();

  },

  download: function() {
    if(!this.isOutputFresh()) {
      return false;
    }
    var filename = $('#exportSpriteDataAs').val();
    var content = this.textEditor.getValue();
    download(content, filename, "application/txt");
    return true;
  },

  copyToClipboard: function() {
    if(!this.isOutputFresh()) {
      return false;
    }
    var sel = this.textEditor.selection.toJSON(); // save selection
    this.textEditor.selectAll();
    this.textEditor.focus();
    document.execCommand('copy');
    this.textEditor.selection.fromJSON(sel); // restore selection  
    return true;
  },

  initEvents: function() {
    var _this = this;
    $('#exportSpriteDataFrom, #exportSpriteDataTo, #exportSpriteLineNumber')
      .on('input change', function() {
        _this.exportData();
      });
    $('#exportC64SpriteDataDownload').on('click', function() {
      _this.download();
    });

  },

  getInputSignature: function() {
    return [
      String($('#exportSpriteDataFrom').val()).trim(),
      String($('#exportSpriteDataTo').val()).trim(),
      String($('#exportSpriteLineNumber').val()).trim()
    ].join('|');
  },

  setOutputValid: function(valid, message) {
    this.outputValid = valid;
    this.outputSignature = valid ? this.getInputSignature() : null;
    if(this.textEditor && !valid) {
      this.textEditor.setValue('', -1);
    }
    if(this.displayButton) {
      this.displayButton.setEnabled(valid);
    }
    $('#exportC64SpriteDataDownload').toggleClass('ui-button-disabled', !valid)
      .attr('aria-disabled', valid ? 'false' : 'true');
    $('#exportSpriteDataError').text(message || '');
  },

  isOutputFresh: function() {
    return this.outputValid && this.outputSignature === this.getInputSignature();
  },


  exportData: function() {
    this.setOutputValid(false, 'Enter a hexadecimal From and To address.');
    var fromText = String($('#exportSpriteDataFrom').val()).trim();
    var toText = String($('#exportSpriteDataTo').val()).trim();
    var lineText = String($('#exportSpriteLineNumber').val()).trim();
    if(!/^[0-9a-f]+$/i.test(fromText) || !/^[0-9a-f]+$/i.test(toText)) {
      return false;
    }
    if(!/^\d+$/.test(lineText)) {
      this.setOutputValid(false, 'First line number must be a positive whole number.');
      return false;
    }
    var exportFrom = Number.parseInt(fromText, 16);
    var exportTo = Number.parseInt(toText, 16);
    var lineNumber = Number(lineText);
    if(exportFrom < 0 || exportFrom > 0xffff || exportTo < 0 || exportTo > 0x10000) {
      this.setOutputValid(false, 'Addresses must be between $0000 and $10000.');
      return false;
    }
    if(exportTo <= exportFrom) {
      this.setOutputValid(false, 'To address must be greater than From address.');
      return false;
    }
    if(lineNumber < 1 || lineNumber > 63999) {
      this.setOutputValid(false, 'First line number must be from 1 to 63999.');
      return false;
    }
    var bytesPerLine = 8;
    var lineCount = Math.ceil((exportTo - exportFrom) / bytesPerLine);
    var lastLineNumber = lineNumber + (lineCount - 1) * this.lineIncrement;
    if(lastLineNumber > 63999) {
      this.setOutputValid(false,
        'The selected range would exceed BASIC line number 63999.');
      return false;
    }

    this.generateBasic({
      lineNumber: lineNumber,
      from: exportFrom,
      to: exportTo
    });
    this.setOutputValid(true, '');
    return true;
  },

  getLine: function(statement) {
    var line = this.lineNumber + " " + statement + "\n";
    this.lineNumber += this.lineIncrement;
    return line;
  },

  toHex: function(value, digits) {
    if(digits == 2) {
      return ("00" + value.toString(16)).substr(-2).toUpperCase(); 
    }
    return ("0000" + value.toString(16)).substr(-4).toUpperCase(); 
  },

  generateBasic: function(args) {
    var bytesPerLine = 8;
    
    var from = args.from;
    var to = args.to;

    this.lineNumber = args.lineNumber;
    var lines = '';

    var data = [];
    for(var i = from; i < to; i++) {
      data.push(c64_vicReadAbsolute(i));
      if(data.length % bytesPerLine == 0) {
        if(data.length != 0) {
          lines += this.getLine('DATA ' + data.join(','));
          data = [];
        }
      }
    }

    if(data.length != 0) {
      lines += this.getLine('DATA ' + data.join(','));
      data = [];
    }

    this.textEditor.setValue(lines, -1);


  }

}
