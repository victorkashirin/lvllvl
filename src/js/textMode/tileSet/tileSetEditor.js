var TileSetEditor = function() {
  this.doc = null;
  this.projectDocument = null;
  this.projectGeneration = undefined;

  this.uiComponent = null;
  this.tilePaletteDisplay = null;

}

TileSetEditor.prototype = {
  init: function() {

  },

  resetProjectState: function() {
    this.doc = null;
    this.path = false;
    this.projectDocument = null;
    this.projectGeneration = undefined;
    if(this.tilePaletteDisplay && typeof this.tilePaletteDisplay.resetProjectState == 'function') {
      this.tilePaletteDisplay.resetProjectState();
    }
  },

  buildInterface: function(parentPanel) {
    if(this.uiComponent != null) {
      return;
    }

    this.uiComponent = UI.create("UI.Panel", { "id": "tileSetEditor" } );
    parentPanel.add(this.uiComponent);

    var html = '<canvas id="tileSetEditorCanvas"></canvas>';
    var htmlPanel = UI.create("UI.HTMLPanel", { "html": html });

    this.uiComponent.add(htmlPanel);

    var _this = this;
    UI.on('ready', function() {
      _this.initContent();
    });

  },

  initContent: function() {
    if(this.tilePaletteDisplay == null) {
      this.tilePaletteDisplay = new TilePaletteDisplay();
      this.tilePaletteDisplay.init(g_app.textModeEditor, 
        { "mode": "multiple", "canvasElementId": "tileSetEditorCanvas" });
    }

  },


  redraw: function() {
    console.log('path = ' + this.path);
    this.load(this.path);
  },

  load: function(path) {
    var tileSetManager = g_app.textModeEditor.tileSetManager;
    this.projectDocument = g_app.doc;
    this.projectGeneration = g_app.projectGeneration;
    if(!this.projectDocument || (g_app.isCurrentProject &&
        !g_app.isCurrentProject(this.projectDocument, this.projectGeneration))) {
      return;
    }
    this.path = path;

    var record = g_app.doc.getDocRecord(path);
    if(record != null) {

      this.doc = record;
      tileSetManager.setCurrentTileSetFromId(this.doc.id);
//      this.tilePaletteDisplay.setToCurrentPalette();
      this.tilePaletteDisplay.initCharPalette({});
      this.tilePaletteDisplay.draw({ redrawTiles: true });

    }

  }
}
