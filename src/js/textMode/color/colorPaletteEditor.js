var ColorPaletteEditor = function() {
  this.doc = null;
  this.projectDocument = null;
  this.projectGeneration = undefined;
  this.uiComponent = null;
  this.colorPaletteEdit = null;
}

ColorPaletteEditor.prototype = {
  init: function() {

  },

  resetProjectState: function() {
    this.doc = null;
    this.path = false;
    this.projectDocument = null;
    this.projectGeneration = undefined;
    if(this.colorPaletteEdit && typeof this.colorPaletteEdit.resetProjectState == 'function') {
      this.colorPaletteEdit.resetProjectState();
    }
  },

  buildInterface: function(parentPanel) {
    if(this.uiComponent != null) {
      return;
    }

    this.uiComponent = UI.create("UI.Panel", { "id": "colorPaletteEditor" } );
    parentPanel.add(this.uiComponent);

    this.colorPaletteEdit = new ColorPaletteEdit();
    this.colorPaletteEdit.init(g_app.textModeEditor);
    this.colorPaletteEdit.buildInterface(this.uiComponent);
    

//    var htmlPanel = UI.create("UI.HTMLPanel", { "html": '<div style="color: white; background-color: red">colorpalette editor</div>' });

//    this.uiComponent.add(htmlPanel);

  },

  draw: function() {
    this.load(this.path);
//    this.colorPaletteEdit.drawPalette();
  },

  
  load: function(path) {
    var colorPaletteManager = g_app.textModeEditor.colorPaletteManager;
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

      colorPaletteManager.setCurrentColorPaletteFromId(this.doc.id);
      this.colorPaletteEdit.setAutosave(true);
      this.colorPaletteEdit.setToCurrentPalette();

    }


  }
}
