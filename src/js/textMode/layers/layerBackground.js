var LayerBackground = function() {
  this.editor = null;
  this.frames = [];
  this.currentFrame = 0;

  this.doc = null;

  this.canvas = null;
  this.context = null;

  this.previewCanvas = null;
  this.previewContext = null;  

  this.backgroundCanvas = null;

  this.width = 0;
  this.height = 0;
}

LayerBackground.prototype = {
  init: function(editor, layerId, layerRef) {
    this.editor = editor;
    this.layerId = layerId;
    this.layerRef = layerRef;
    this.connectToDoc();
  },


  getType: function() {
    return 'background';
  },

  // find the layer's data in the doc..
  connectToDoc: function() {
    var doc = this.editor.doc;
    var layers = doc.data.layers;
    for(var i = 0; i < layers.length; i++) {
      this.doc = layers[i];
    }
  },

  setDimensions: function(width, height) {
    this.width = width;
    this.height = height;
  },



  getCanvas: function() {
    if(this.canvas == null) {
      this.canvas = document.createElement('canvas');
    }

    var layerWidth = this.width;
    var layerHeight = this.height;

    if(this.canvas.width != layerWidth || this.canvas.height != layerHeight) {
      this.canvas.width = layerWidth;
      this.canvas.height = layerHeight;
    }

    return this.canvas;
  },


  updatePreview: function() {
    var previewWidth = this.width;
    var previewHeight = this.height;

    // Keep the preview inside the 60px layer row, including its 6px margins.
    var maxWidth = 80;
    var maxHeight = 48;
    if(previewWidth > maxWidth) {
      previewHeight = (maxWidth / previewWidth) * previewHeight;
      previewWidth = maxWidth;
    }

    if(previewHeight > maxHeight) {
      previewWidth = (maxHeight / previewHeight) * previewWidth;
      previewHeight = maxHeight;
    }

    previewWidth = Math.max(1, Math.round(previewWidth));
    previewHeight = Math.max(1, Math.round(previewHeight));

    if(this.previewCanvas.width != previewWidth || this.previewCanvas.height != previewHeight) {
      this.previewCanvas.width = previewWidth;
      this.previewCanvas.height = previewHeight;
    }
    this.previewContext = this.previewCanvas.getContext('2d');
    this.previewContext.drawImage(this.getCanvas(), 0, 0, this.previewCanvas.width, this.previewCanvas.height); 

  },

  setPreviewCanvasElementId: function(elementId) {
    this.previewCanvas = document.getElementById(elementId);
  },

  getColor: function() {
    return 4;
  },

  setColor: function(color, frame) {
    var theFrame = frame;
    if(typeof theFrame == 'undefined') {
      theFrame = this.currentFrame;
    }

    this.frames[theFrame] = color;200

  },

  draw: function(args) {
    var canvas = args.canvas;
    var context = canvas.getContext('2d');

    var colorPalette = this.editor.colorPaletteManager.getCurrentColorPalette();

    var backgroundColorIndex = this.getColor();//this.editor.tools.currentBackgroundColor;
    context.fillStyle= '#' + colorPalette.getHexString(backgroundColorIndex);
    context.fillRect(x, y, srcCanvas.width * this.scale, srcCanvas.height * this.scale);

  }

  
}
