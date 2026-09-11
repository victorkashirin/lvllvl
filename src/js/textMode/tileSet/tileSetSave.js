var TileSetSave = function() {
  this.editor = null;
  this.tilesAcross = 16;
}

TileSetSave.prototype = {
  init: function(editor) {
    this.editor = editor;
  },

  resetProjectState: function() {
    this.tileSet = null;
  },

  show: function() {

    var _this = this;

    if(this.uiComponent == null) {
      this.uiComponent = UI.create("UI.Dialog", { "id": "saveTileSetDialog", "title": "Save Tileset", "width": 300, "height": 160 });

      this.htmlComponent = UI.create("UI.HTMLPanel");
      this.uiComponent.add(this.htmlComponent);
      this.htmlComponent.load('html/textMode/tileSetSave.html', function() {

        _this.initContent();
        _this.initEvents();
      });

      this.okButton = UI.create('UI.Button', { "text": "OK", "color": "primary" });
      this.uiComponent.addButton(this.okButton);
      this.okButton.on('click', function(event) {
        if(_this.save() !== false) {
          UI.closeDialog();
        }
      });

      this.closeButton = UI.create('UI.Button', { "text": "Cancel", "color": "secondary" });
      this.uiComponent.addButton(this.closeButton);
      this.closeButton.on('click', function(event) {
        UI.closeDialog();
      });
    } else {
      this.initContent();
    }

    UI.showDialog("saveTileSetDialog");
  },

  updateTilesAcross: function() {
    var maxTilesAcross = 256;
    var tilesAcross = Number($('#saveTileSetTilesAcross').val());
    if(Number.isFinite(tilesAcross) && Number.isInteger(tilesAcross) &&
        tilesAcross >= 1 && tilesAcross <= maxTilesAcross) {
      this.tilesAcross = tilesAcross;
      $('#saveTileSetTilesAcross').removeAttr('aria-invalid');
      $('#saveTileSetTilesAcrossError').hide().text('');
      return true;
    }
    $('#saveTileSetTilesAcross').attr('aria-invalid', 'true');
    $('#saveTileSetTilesAcrossError').text(
      'Tiles across must be a whole number from 1 to ' + maxTilesAcross + '.'
    ).show();
    return false;
  },

  updateExportFormat: function() {
    var format = $('#saveTileSetFormat').val();
    if(format == 'png') {
      $('#saveTilesSetTilesAcrossSection').show();
    } else {
      $('#saveTilesSetTilesAcrossSection').hide();
    }

  },

  initContent: function() {
    $('#saveTileSetTilesAcross').attr('max', 256);
    this.updateExportFormat();
    this.updateTilesAcross();
  },

  initEvents: function() {
    var _this = this;
    $('#saveTileSetTilesAcross').on('change', function() {
      _this.updateTilesAcross();
    });

    $('#saveTileSetFormat').on('change', function() {
      _this.updateExportFormat();
    });
  },



  save: function() {
    var filename = $('#saveTileSetAs').val();
    var format =  $('#saveTileSetFormat').val();

    var tileSet = this.editor.tileSetManager.getCurrentTileSet();

    switch(format) {
      case 'json':
        tileSet.saveAsJson(filename);
        break;
      case 'png':
        if(!this.updateTilesAcross()) {
          return false;
        }
        tileSet.exportPng({ filename: filename, tilesAcross: this.tilesAcross });
        break;

      case 'bin':
        tileSet.exportBinary(filename, {});
        break;

    }

    return true;

  }
}
