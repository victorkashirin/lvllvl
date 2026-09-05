var Graphic = function() {
  this.editor = null;

  this.frames = [];
  this.frameCount = 0;
  this.currentFrame = 0;

  // if not set per layer..
  this.tileSetId = false;
  this.colorPaletteId = false;
  this.gridWidth = 40;
  this.gridHeight = 25;

  this.cellWidth = 8;
  this.cellHeight = 8;

  this.depth = 1;

  // for the last draw, was only the visible cells drawn
  this.onlyViewBoundsDrawn = true;


  // used by drawFrame
  this.tempCanvas = null;
  this.shapesCanvas = null;

  this.drawEnabled = true;

  this.doc = null;

  //this.type = 'sprite';
  this.type = 'screen';

  this.thumbnailCanvas = null;

}

Graphic.prototype = {
  init: function(editor) {
    this.editor = editor;
  },

  connectToDoc: function() {
    var doc = this.editor.doc;

    if(doc.data.frames == null) {
      doc.data.frames = [];
    }

    this.doc = doc;
    this.frames = doc.data.frames;
    this.frameCount = this.frames.length;
    this.editor.layers.load();
  },



  getFrameRanges: function() {
    if(typeof this.doc.data.frameRanges === 'undefined') {
      this.doc.data.frameRanges = [
        {
          start: 0,
          end: this.getFrameCount()
        }
      ];
    }

    return this.doc.data.frameRanges;
  },

  setFrameRanges: function(frameRanges) {
    this.doc.data.frameRanges = frameRanges;
  },

  /*
  hasTileOrientation: function() {
    return false;
  },
  */

  getHasTileMaterials: function() {
    var hasTileMaterials = this.doc.data.hasTileMaterials;
    if(typeof hasTileMaterials === 'undefined') {
      return false;
    }

    return hasTileMaterials;
  },


  setHasTileMaterials: function(hasTileMaterials) {
    this.doc.data.hasTileMaterials = hasTileMaterials;
  },

  getHasTileFlip: function() {
    var layer = this.editor.layers.getSelectedLayerObject();
    if(layer && layer.getType() == 'grid') {
      return layer.getHasTileFlip();
    }

    return false;
  },

  setHasTileFlip: function(hasFlip) {

    var layer = this.editor.layers.getSelectedLayerObject();
    if(!layer || layer.getType() != 'grid') {
      return;
    }

    layer.setHasTileFlip(hasFlip);

  },


  getHasTileRotate: function() {
    var layer = this.editor.layers.getSelectedLayerObject();
    if(layer && layer.getType() == 'grid') {
      return layer.getHasTileRotate();
    }
    return false;
  },

  setHasTileRotate: function(hasRotate) {

    var layer = this.editor.layers.getSelectedLayerObject();
    if(!layer || layer.getType() != 'grid') {
      return;
    }

    layer.setHasTileRotate(hasRotate);

  },



  loadJSON: function(json) {
    var frames = json.frames;
    var layers = json.layers;
    var name = json.name;

    var gridWidth = layers[0].gridWidth;
    var gridHeight = layers[0].gridHeight;

    this.doc.data.frames = frames;
    this.frames = this.doc.data.frames;

    this.setGridDimensions({
      width: gridWidth,
      height: gridHeight
    });

    var layerObject = this.editor.layers.getSelectedLayerObject();
    layerObject.setFromJSON(layers[0]);

    if(layers.length > 0) {
      for(var i = 1; i < layers.length; i++) {
        var layerId = this.editor.layers.newLayer({
          label: layers[i].label,
          type: "grid"
        });
        layerObject = this.editor.layers.getLayerObject(layerId);
        layerObject.setFromJSON(layers[i]);

      }
    }
  },

  getJSON: function(args) {
    var fromFrame = 0;
    var toFrame = this.getFrameCount();
    var includeLayers = 'all';
    var direction = 'bottomtotop';

    if(typeof args != 'undefined') {
      if(typeof args.fromFrame != 'undefined') {
        fromFrame = args.fromFrame;
      }

      if(typeof args.toFrame != 'undefined') {
        toFrame = args.toFrame;
      }

      if(typeof args.layers != 'undefined') {
        includeLayers = args.layers;
      }

      if(typeof args.direction != 'undefined') {
        direction = args.direction;
      }
    }

    var data = {};
    var value = [];
    data.frames = [];
    for(var i = fromFrame; i < toFrame; i++) {    
      data.frames.push(this.frames[i]);
    }

    data.frameRanges = this.doc.data.frameRanges;

    data.layers = [];


    var layers = this.editor.layers.getLayers();
    for(var i = 0; i < layers.length; i++) {
      var layer = this.editor.layers.getLayerObject(layers[i].layerId);
      if(layer) {
        data.layers.push(layer.getJSON(args));
      }
    }


    data.name = this.doc.name;

    return data;
  },



  getType: function() {
    return this.type;

  },

  getThumbnailCanvas: function() {
    var width = 90;
    var height = 90;
    if(this.thumbnailCanvas == null) {
      this.thumbnailCanvas = document.createElement('canvas');
    }

    try {
      console.log("GET THUMBNAIL CANVAS!!!!!!");

      

      var context = this.thumbnailCanvas.getContext('2d');
      context.imageSmoothingEnabled = false;
      context.webkitImageSmoothingEnabled = false;
      context.mozImageSmoothingEnabled = false;
      context.msImageSmoothingEnabled = false;
      context.oImageSmoothingEnabled = false;

      var thumbnailWidth = 86;
      var thumbnailHeight = 86;
      var scale = 1;
      
  //    this.editor.gridView2d.canvas

      /*
      this.drawFrame({
        canvas: this.thumbnailCanvas,
        scale: scale,
        context: context
      });
  */
      context.clearRect(0, 0, width, height);
      context.fillStyle = '#040404';
      context.fillRect(0, 0, width, height);   
  /*
      this.drawFrame({
        canvas: this.thumbnailCanvas,
        scale: scale,
        context: context
      });
  */

      var width = this.getGraphicWidth();
      var height = this.getGraphicHeight();

      scale = thumbnailWidth / width;
      console.log(scale);
      if(scale < 0.1) {
        scale = 0.1;
      }
      scale = 1;

      this.drawFrame({
        canvas: this.thumbnailCanvas,
        scale: scale,
        context: context
      });


    //  context.drawImage(this.canvas, offsetX, offsetY, scaledWidth, scaledHeight);

    /*
      var srcCanvas = this.editor.gridView2d.canvas;
      var srcX = 0;
      var srcY = 0;
      var srcWidth = srcCanvas.width;
      var srcHeight = srcCanvas.height;

      var dstX = 0;
      var dstY = 0;
      var dstWidth = thumbnailWidth;
      var dstHeight = thumbnailHeight;

      context.drawImage(srcCanvas, 
        srcX, srcY, srcWidth, srcHeight,
        dstX, dstY, dstWidth, dstHeight);
*/        

    } catch(err) {
      console.error(err);
    }
    return this.thumbnailCanvas;
  },


  // shortcut methods to the current layer methods
  getC64Multi1Color: function(frameIndex) {
    var frame = frameIndex;
    if(typeof frame == 'undefined') {
      frame = this.currentFrame;
    }

    var layer = this.editor.layers.getSelectedLayerObject();
    var color = false;

    if(this.frames && frame !== false && frame < this.frames.length && layer && layer.getC64Multi1Color) {
      color = layer.getC64Multi1Color(frame);
      if(typeof color != 'undefined') {
        return color;
      }
    }
    return 0;
  },


  getC64Multi2Color: function(frameIndex) {
    var frame = frameIndex;
    if(typeof frame == 'undefined') {
      frame = this.currentFrame;
    }

    var layer = this.editor.layers.getSelectedLayerObject();
    var color = false;

    if(this.frames && frame !== false && frame < this.frames.length && layer && layer.getC64Multi2Color) {
      color = layer.getC64Multi2Color(frame);
      if(typeof color != 'undefined') {
        return color;
      }
    }
    return 0;
  },


  getBackgroundColor: function(frameIndex) {
    var frame = frameIndex;
    if(typeof frame == 'undefined') {
      frame = this.currentFrame;
    }

    var layer = this.editor.layers.getSelectedLayerObject();
    var bgColor = false;

    if(this.frames && frame !== false && frame < this.frames.length && layer && layer.getBackgroundColor) {
      bgColor = layer.getBackgroundColor(frame);
      if(typeof bgColor != 'undefined') {
        return bgColor;
      }
    }

    // do default
    var colorPalette = this.editor.colorPaletteManager.getCurrentColorPalette();
    bgColor = colorPalette.getDefaultBackgroundColor();
    return bgColor;
  },

  setBackgroundColor: function(color, update) {
    if(!this.frames || this.currentFrame === false) {
      return;
    }

    var layer = this.editor.layers.getSelectedLayerObject();

    if(this.currentFrame !== false && this.currentFrame < this.frames.length && layer && layer.setBackgroundColor) {
      layer.setBackgroundColor(color, this.currentFrame);
    } 

  },

  getBorderColor: function(frameIndex) {
    var frame = frameIndex;
    if(typeof frame == 'undefined') {
      frame = this.currentFrame;
    }

    var layer = this.editor.layers.getSelectedLayerObject();
    var borderColor = false;

    if(this.frames && frame !== false && frame < this.frames.length && layer && layer.getBorderColor) {
      borderColor = layer.getBorderColor(frame);
      if(typeof borderColor != 'undefined') {
        return borderColor;
      }
    }

    // do default
    var colorPalette = layer.getColorPalette();
    borderColor = colorPalette.getDefaultBorderColor();
    return borderColor;
  },

  setBorderColor: function(color, update) {
    if(!this.frames || this.currentFrame === false) {
      return;
    }

    var layer = this.editor.layers.getSelectedLayerObject();

    if(this.currentFrame !== false && this.currentFrame < this.frames.length && layer && layer.setBorderColor) {
      layer.setBorderColor(color, this.currentFrame);
    } 
  },



  insertFrame: function(frame, duration, frameData, layerFrameData) {


    if(typeof frame == 'undefined') {
      frame = this.currentFrame;
    }
    if(typeof duration == 'undefined') {
      duration = this.frames[this.currentFrame].duration;
    }

    var frameObject = frameData;

    if(typeof frameObject == 'undefined') {
      frameObject = {
        duration: duration
      };
    }

    this.frames.splice(frame + 1, 0, frameObject);

    var layers = this.editor.layers.layers;
    for(var i = 0; i < layers.length; i++) {
      if(layers[i].type == 'grid') {
        var layerGrid = this.editor.layers.getLayerObject(layers[i].layerId);
        var frameData = null;

        if(typeof layerFrameData != 'undefined') {
          for(var j = 0; j < layerFrameData.length; j++) {
            if(layerFrameData[j].layerId == layers[i].layerId) {
              frameData = layerFrameData[j].gridData;
            }
          }
        }


        layerGrid.insertFrame(frame, frameData);
      }
    }

    // fix the frame ranges (for sprites)
    var frameRanges = this.getFrameRanges();
    var afterInsertPoint = false;
    for(var i = 0; i < frameRanges.length; i++) {
      if(!afterInsertPoint && (frame + 1) >= frameRanges[i].start && (frame + 1) <= frameRanges[i].end) {
        afterInsertPoint = true;
        frameRanges[i].end++;
      } else if(afterInsertPoint) {
        frameRanges[i].start++;
        frameRanges[i].end++;
      }
    }

  
    this.frameCount++;
    this.fixFrameRanges();

    this.editor.history.startEntry('insertframe');
    this.editor.history.addAction('insertframe', { position: frame });
    this.editor.history.endEntry();



    return frame + 1;

  },



  duplicateFrame: function(frame) {
    if(typeof frame == 'undefined') {
      frame = this.currentFrame;
    }

    var newFrame = frame+1;

    this.editor.history.startEntry('Duplicate');
    this.editor.history.setNewEntryEnabled(false);

    this.insertFrame(frame);
    this.setCurrentFrame(newFrame);



    var layers = this.editor.layers.layers;
    for(var i = 0; i < layers.length; i++) {
      if(layers[i].type == 'grid') {
        var layerGrid = this.editor.layers.getLayerObject(layers[i].layerId);
        layerGrid.duplicateFrame(frame, newFrame);
      }
    }

    this.editor.history.setNewEntryEnabled(true);

    this.editor.history.endEntry();

    if(g_newSystem) {
      this.editor.gridView2d.draw();
    } else {
      this.editor.grid.update();
    }


    return newFrame;
  },


  // pass in the view bounds as pixels
  setViewBounds: function(minX, minY, maxX, maxY) {

    this.viewMinX = minX;
    this.viewMaxX = maxX;
    this.viewMinY = minY;
    this.viewMaxY = maxY;

    this.viewBounds = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    }

    var layers = this.editor.layers.layers;
    for(var i = 0; i < layers.length; i++) {
      if(layers[i].type == 'grid') {
        var layerGrid = this.editor.layers.getLayerObject(layers[i].layerId);
        layerGrid.setViewBounds(minX, minY, maxX, maxY);
      }
    }
  },


  getViewBounds: function() {
    return this.viewBounds;
  },

  deleteFrame: function(frame) {

    if(typeof frame == 'undefined') {
      frame = this.currentFrame;
    }

    if(this.frameCount <= 1) {
      return false;
    }



    var frameData = this.frames.splice(frame, 1);

    var layerFrameData = [];

    var layers = this.editor.layers.layers;
    for(var i = 0; i < layers.length; i++) {
      if(layers[i].type == 'grid') {
        var layerGrid = this.editor.layers.getLayerObject(layers[i].layerId);
        var gridData = layerGrid.getFrameData(frame);


        layerFrameData.push({ layerId: layers[i].layerId, gridData: gridData });
        layerGrid.deleteFrame(frame);
      }
    }

    // fix the frame ranges
    var frameRanges = this.getFrameRanges();
    var afterInsertPoint = false;
    for(var i = 0; i < frameRanges.length; i++) {
//      if(frameRanges[i].start < frame) {

      if(!afterInsertPoint && (frame + 1) > frameRanges[i].start && (frame ) < frameRanges[i].end) {

        afterInsertPoint = true;
        frameRanges[i].end--;
      } else if(afterInsertPoint) {
        frameRanges[i].start--;
        frameRanges[i].end--;
      }
    }


    var newFrameCount = this.frameCount - 1;
    this.setFrameCount(newFrameCount);

    this.fixFrameRanges();

    this.editor.history.startEntry('deleteframe');
    this.editor.history.addAction('deleteframe', { position: frame, frameData: frameData[0], layerFrameData: layerFrameData });
    this.editor.history.endEntry();

    return true;
  },


  // make sure no frame ranges of zero length
  // make sure no gaps
  // sort
  fixFrameRanges: function() {
    var frameRanges = this.getFrameRanges();

    // remove any ranges of zero length
    for(var i = 0; i < frameRanges.length; i++) {
      if(frameRanges[i].start == frameRanges[i].end) {
        // ok need to delete it
        frameRanges.splice(i, 1);
      }
    }

    frameRanges.sort(function(a, b) {
      return a.start - b.start;
    });

    var frameCount = this.getFrameCount();

    if(frameRanges.length == 0) {
      frameRanges.push({
        start: 0,
        end: frameCount
      });
    }


    var lastEnd = 0;
    // remove any ranges of zero length
    for(var i = 0; i < frameRanges.length; i++) {
      if(frameRanges[i].start !== lastEnd) {
        frameRanges[i].start = lastEnd;
      }
      lastEnd = frameRanges[i].end;
    }

    frameRanges[frameRanges.length - 1].end = frameCount;


  },

  setFrameCount: function(frameCount) {


/*
    // copy the background color from the last frame
    var bgColor = 0;
    if(this.frames.length > 0) {
      bgColor = this.frames[this.frames.length - 1].bgColor;
    } else {
      var colorPalette = this.editor.colorPaletteManager.getCurrentColorPalette();
      if(colorPalette != null) {
        bgColor = colorPalette.getDefaultBackgroundColor();
      }
    }
*/

    while(frameCount > this.frames.length) {
      this.frames.push({ duration: 12 });
    }



    if(frameCount < this.frameCount) {
      this.frames.length = frameCount;
    }


    var layers = this.editor.layers.layers;
    for(var i = 0; i < layers.length; i++) {
      if(layers[i].type == 'grid') {
        var layerGrid = this.editor.layers.getLayerObject(layers[i].layerId);
        layerGrid.setFrameCount(frameCount);
      }
    }    

    this.frameCount = frameCount;
  },


  setCurrentFrame: function(frame) {

    if(this.currentFrame === frame) {
      return;
    }

    this.currentFrame = frame;
    var layers = this.editor.layers.layers;
    for(var i = 0; i < layers.length; i++) {
      if(layers[i].type == 'grid') {
        var layerGrid = this.editor.layers.getLayerObject(layers[i].layerId);
        layerGrid.setCurrentFrame(frame);
      }
    }    

    this.redraw();
  },

  getCurrentFrame: function() {
    return this.currentFrame;
  },

  
  getFrameCount: function() {
    return this.frameCount;
  },

  setFrameDuration: function(duration, frame) {
    var theFrame = this.currentFrame;

    if(typeof frame !== 'undefined') {
      theFrame = frame;
    }

    if(theFrame < 0 || theFrame >= this.frameCount) {
      return;
    }

    this.frames[theFrame].duration = duration;

  },

  getFrameDuration: function(frame) {
    return this.frames[frame].duration;
  },


  getGridWidth: function() {

    return this.gridWidth;
  },

  getGridHeight: function() {
    return this.gridHeight;
  },


  getGraphicWidth: function() {
    if(this.doc) {
      return this.doc.data.width;//  this.gridWidth * this.cellWidth;
    } else {
      return 1;
    }
  },

  getGraphicHeight: function() {
    if(this.doc) {
      return this.doc.data.height;//this.gridHeight * this.cellHeight;
    } else {
      return 1;
    }
  },


  setCellDimensionsFromTiles: function() {
    var cellWidth = 8;
    var cellHeight = 8;
    var gridWidth = this.gridWidth;
    var gridHeight = this.gridHeight;

    var layers = this.editor.layers.layers;
    for(var i = 0; i < layers.length; i++) {
      if(layers[i].type == 'grid') {
        var layerGrid = this.editor.layers.getLayerObject(layers[i].layerId);
        var tileSet = layerGrid.getTileSet();
        gridWidth = layerGrid.getGridWidth();
        gridHeight = layerGrid.getGridHeight();
        layerGrid.setGridDimensions({width: gridWidth, height: gridHeight, cellWidth: tileSet.getTileWidth(), cellHeight: tileSet.getTileHeight() });
        cellWidth = layerGrid.getCellWidth();
        cellHeight = layerGrid.getCellHeight();
      }
    }


    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
    this.cellWidth = cellWidth;
    this.cellHeight = cellHeight;

    this.doc.data.width = this.gridWidth * this.cellWidth;
    this.doc.data.height = this.gridHeight * this.cellHeight;

  },
  setGridDimensions: function(args) {
    var width = this.gridWidth;
    var height = this.gridHeight;

    // what to offset current grid by
    var offsetX = 0;
    var offsetY = 0;

    if(typeof args != 'undefined') {
      if(typeof args.width != 'undefined') {
        width = args.width;
      }
      if(typeof args.height != 'undefined') {
        height = args.height;
      }
      if(typeof args.offsetX != 'undefined') {
        offsetX = args.offsetX;
      }
      if(typeof args.offsetY != 'undefined') {
        offsetY = args.offsetY;
      }

    }

    this.gridWidth = width;
    this.gridHeight = height;


    var layers = this.editor.layers.layers;
    for(var i = 0; i < layers.length; i++) {
      if(layers[i].type == 'grid') {
        var layerGrid = this.editor.layers.getLayerObject(layers[i].layerId);
        layerGrid.setGridDimensions({ width: width, height: height, offsetX: offsetX, offsetY: offsetY });
        this.cellWidth = layerGrid.getCellWidth();
        this.cellHeight = layerGrid.getCellHeight();
      }
    }

    this.doc.data.width = width * this.cellWidth;
    this.doc.data.height = height * this.cellHeight;

    this.invalidateAllCells();
    this.redraw({ allCells: true });
    if(this.type == 'sprite') {
      this.editor.tools.drawTools.tilePalette.drawTilePalette();
    }
  },



  invalidateAllCells: function() {
    var layers = this.editor.layers.layers;
    for(var i = 0; i < layers.length; i++) {
      if(layers[i].type == 'grid') {
        var layerGrid = this.editor.layers.getLayerObject(layers[i].layerId);
        layerGrid.invalidateAllCells();
      }
    }

  },

  // Return an exact, non-overlapping union. Damage from separate visible
  // layers may cover the same pixels; drawing those rectangles independently
  // would composite translucent layers more than once.
  mergePixelRegions: function(regions) {
    if(!regions || regions.length < 2) { return regions || []; }
    var yEdges = [];
    var edgeSeen = Object.create(null);
    var starts = Object.create(null), ends = Object.create(null);
    for(var i = 0; i < regions.length; i++) {
      if(regions[i].minX >= regions[i].maxX || regions[i].minY >= regions[i].maxY) { continue; }
      var startKey = String(regions[i].minY), endKey = String(regions[i].maxY);
      if(!edgeSeen[startKey]) { edgeSeen[startKey] = true; yEdges.push(regions[i].minY); }
      if(!edgeSeen[endKey]) { edgeSeen[endKey] = true; yEdges.push(regions[i].maxY); }
      if(!starts[startKey]) { starts[startKey] = []; }
      if(!ends[endKey]) { ends[endKey] = []; }
      starts[startKey].push(i);
      ends[endKey].push(i);
    }
    yEdges.sort(function(a, b) { return a - b; });

    var merged = [];
    var active = Object.create(null);
    var activeRegions = [], activePositions = Object.create(null);
    for(var edgeIndex = 0; edgeIndex < yEdges.length - 1; edgeIndex++) {
      var minY = yEdges[edgeIndex], maxY = yEdges[edgeIndex + 1];
      var edgeKey = String(minY);
      var ending = ends[edgeKey] || [];
      for(var endingIndex = 0; endingIndex < ending.length; endingIndex++) {
        var endingRegion = ending[endingIndex];
        var position = activePositions[endingRegion];
        if(typeof position === 'undefined') { continue; }
        var lastActive = activeRegions.pop();
        if(position < activeRegions.length) {
          activeRegions[position] = lastActive;
          activePositions[lastActive] = position;
        }
        delete activePositions[endingRegion];
      }
      var starting = starts[edgeKey] || [];
      for(var startingIndex = 0; startingIndex < starting.length; startingIndex++) {
        var startingRegion = starting[startingIndex];
        activePositions[startingRegion] = activeRegions.length;
        activeRegions.push(startingRegion);
      }
      var intervals = [];
      for(var regionIndex = 0; regionIndex < activeRegions.length; regionIndex++) {
        var region = regions[activeRegions[regionIndex]];
        intervals.push({ minX: region.minX, maxX: region.maxX });
      }
      intervals.sort(function(a, b) { return a.minX - b.minX || a.maxX - b.maxX; });
      var horizontal = [];
      for(var intervalIndex = 0; intervalIndex < intervals.length; intervalIndex++) {
        var interval = intervals[intervalIndex];
        var last = horizontal.length ? horizontal[horizontal.length - 1] : false;
        if(last && interval.minX <= last.maxX) {
          last.maxX = Math.max(last.maxX, interval.maxX);
        } else {
          horizontal.push({ minX: interval.minX, maxX: interval.maxX });
        }
      }

      var nextActive = Object.create(null);
      for(var horizontalIndex = 0; horizontalIndex < horizontal.length; horizontalIndex++) {
        var span = horizontal[horizontalIndex];
        var key = span.minX + ':' + span.maxX;
        var rectangle = active[key];
        if(rectangle && rectangle.maxY === minY) {
          rectangle.maxY = maxY;
        } else {
          rectangle = { minX: span.minX, minY: minY, maxX: span.maxX, maxY: maxY };
          merged.push(rectangle);
        }
        nextActive[key] = rectangle;
      }
      active = nextActive;
    }
    return merged;
  },

  // Invalidate only cells whose rendered glyph depends on one of tileIds.
  // Pixel bounds are returned because layers may use different cell sizes.
  invalidateTiles: function(tileIds, tileSet) {
    if(!tileIds || tileIds.length === 0) { return false; }
    var dirtyPixels = false;
    var previewDirty = false;
    var layers = this.editor.layers.layers;
    for(var i = 0; i < layers.length; i++) {
      if(layers[i].type !== 'grid') { continue; }
      var layerGrid = this.editor.layers.getLayerObject(layers[i].layerId);
      if(!layerGrid || !layerGrid.invalidateTiles
          || (tileSet && layerGrid.getTileSet() !== tileSet)) {
        continue;
      }
      var bounds = layerGrid.invalidateTiles(tileIds);
      if(!bounds) { continue; }
      if(bounds.currentRegions && bounds.currentRegions.length) {
        previewDirty = true;
      }
      if(!layers[i].visible) { continue; }
      var cellWidth = layerGrid.getCellWidth();
      var cellHeight = layerGrid.getCellHeight();
      var cellRegions = bounds.regions || [bounds];
      if(!dirtyPixels) {
        dirtyPixels = {
          minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity,
          regions: [], layerRegions: Object.create(null)
        };
      }
      if(bounds.currentRegions && bounds.currentRegions.length) {
        dirtyPixels.layerRegions[layers[i].layerId] = bounds.currentRegions;
      }
      for(var regionIndex = 0; regionIndex < cellRegions.length; regionIndex++) {
        var region = cellRegions[regionIndex];
        // Vector paths may extend halfway into adjacent cells. LayerGrid uses
        // the same padding for its internal clip, so keep the outer viewport
        // damage clip from cutting those repaired pixels back off.
        var vector = layerGrid.getMode && layerGrid.getMode() === TextModeEditor.Mode.VECTOR;
        var paddingX = vector ? cellWidth / 2 : 0;
        var paddingY = vector ? cellHeight / 2 : 0;
        var pixels = {
          minX: Math.max(0, region.minX * cellWidth - paddingX),
          minY: Math.max(0, region.minY * cellHeight - paddingY),
          maxX: Math.min(layerGrid.getWidth(), region.maxX * cellWidth + paddingX),
          maxY: Math.min(layerGrid.getHeight(), region.maxY * cellHeight + paddingY)
        };
        dirtyPixels.regions.push(pixels);
      }
    }
    if(dirtyPixels) {
      dirtyPixels.regions = this.mergePixelRegions(dirtyPixels.regions);
      for(var dirtyIndex = 0; dirtyIndex < dirtyPixels.regions.length; dirtyIndex++) {
        var dirtyRegion = dirtyPixels.regions[dirtyIndex];
        dirtyPixels.minX = Math.min(dirtyPixels.minX, dirtyRegion.minX);
        dirtyPixels.minY = Math.min(dirtyPixels.minY, dirtyRegion.minY);
        dirtyPixels.maxX = Math.max(dirtyPixels.maxX, dirtyRegion.maxX);
        dirtyPixels.maxY = Math.max(dirtyPixels.maxY, dirtyRegion.maxY);
      }
    }
    if(previewDirty && this.editor.layers.requestLayerPreviewUpdate) {
      this.editor.layers.requestLayerPreviewUpdate();
    }
    return dirtyPixels;
  },

  // either set for screen and all layers or just the current selected layer.
  initFrameBlocks: function(blockId) {
    var layers = this.editor.layers.layers;
    for(var i = 0; i < layers.length; i++) {
      if(layers[i].type == 'grid') {
        var layerGrid = this.editor.layers.getLayerObject(layers[i].layerId);
        layerGrid.initFrameBlocks(blockId);
      }
    }
  },

  setBlockDimensions: function(width, height) {
    var layers = this.editor.layers.layers;
    for(var i = 0; i < layers.length; i++) {
      if(layers[i].type == 'grid') {
        var layerGrid = this.editor.layers.getLayerObject(layers[i].layerId);
        layerGrid.setBlockDimensions(width, height);
      }
    }

  },

  setOnlyViewBoundsDrawn: function(onlyViewBoundsDrawn) {
    this.onlyViewBoundsDrawn = onlyViewBoundsDrawn;
  },

  // have only the view bounds been drawn
  getOnlyViewBoundsDrawn: function() {
    return this.onlyViewBoundsDrawn;
  },


  setDrawEnabled: function(enabled) {
    this.drawEnabled = enabled;
  },

  getDrawEnabled: function() {
    return this.drawEnabled;
  },

  redraw: function(args) {
    
    if(this.drawEnabled) {

      if(!this.doc) {
        return;
      }
      // assume everything is drawn..
      this.onlyViewBoundsDrawn = false;

      if(g_newSystem) {
        //this.drawFrame(args);
        this.editor.gridView2d.draw(args);
      } else {
        this.editor.grid.grid2d.update(args);
        this.editor.layers.requestLayerPreviewUpdate();
      }
    }
  },


  drawFrame: function(args) {

    var frame = this.getCurrentFrame();
    if(typeof args.frame != 'undefined') {    
      frame = args.frame;
    }    

    // draw just the graphic, or also draw cursor, selection, shapes, etc
    var graphicOnly = false;
    if(args.graphicOnly) {
      graphicOnly = args.graphicOnly;
    }

    var canvas = args.canvas;
    var context = args.context;
    // The editor viewport supplies a deterministic bitmap sampler. Exports and
    // other callers keep their own context's drawing/scaling behaviour.
    var drawImage = args.drawImage || context.drawImage.bind(context);

    var srcX = 0;
    var srcY = 0;
    var dstX = 0;
    var dstY = 0;
    var srcWidth = this.getGraphicWidth();
    var srcHeight = this.getGraphicHeight();

    if(typeof args.srcX != 'undefined') {
      srcX = args.srcX;
      srcY = args.srcY;
    }

    if(typeof args.srcWidth != 'undefined') {
      srcWidth = args.srcWidth;
      srcHeight = args.srcHeight;
    }

    if(typeof args.dstX != 'undefined') {
      dstX = args.dstX;
      dstY = args.dstY;
    } else {
      args.dstX = dstX;
      args.dstY = dstY;
    }


    var drawAtX = false;
    var drawAtY = false;
    if(typeof args.drawAtX !== 'undefined') {
      drawAtX = args.drawAtX;
      drawAtY = args.drawAtY;
    }

    var shapes = false;

    var scale = 1;
    if(typeof args.scale != 'undefined') {
      scale = args.scale;
    }

    if(typeof args.dstWidth == 'undefined') {
      args.dstWidth = srcWidth * scale;
      args.dstHeight = srcHeight * scale;
    }


    if(typeof args.shapes != 'undefined') {
      shapes = args.shapes;
    }

    var whichLayers = 'visible';

    var allCells = false;
    if(typeof args.allCells != 'undefined') {
      allCells = args.allCells;
    }

    var drawBackground = this.editor.layers.isBackgroundVisible();
    if(typeof args.drawBackground != 'undefined') {
      drawBackground = args.drawBackground;
    }

    // dont want to update the layer canvas if we're not updating the currently displayed frame
    // eg sprite animation preview
    var updateLayerCanvas = true;
    if(typeof args.updateLayerCanvas != 'undefined') {
      updateLayerCanvas = args.updateLayerCanvas;
    }

    if(!updateLayerCanvas) {
      if(this.tempCanvas == null) {
        this.tempCanvas = document.createElement('canvas');
      }
      this.tempCanvas.width = screenWidth;
      this.tempCanvas.height = screenHeight;
      this.tempContext = this.tempCanvas.getContext('2d');
    }
    
    if(typeof args.layers != 'undefined') {
      whichLayers = args.layers;
    }

    // does the previous frame need to be drawn?
    var drawPreviousFrame = false;
    if(typeof args.drawPreviousFrame != 'undefined') {
      drawPreviousFrame = args.drawPreviousFrame;
    } else {
      drawPreviousFrame = this.editor.frames.getShowPrevFrame();
    }

    
    var prevFrame = frame - 1;
    if(prevFrame < 0) {
      prevFrame += this.getFrameCount();
    }

    if(prevFrame === frame) {
      // prev frame and current frame are the same, so dont draw it..
      drawPreviousFrame = false;
    }

//    console.log('prev = ' + prevFrame);

    //var previousFrameSrcCanvas = null;
    /*
    if(drawPreviousFrame) {
      // previous screen is grid2d
      var gridView2d = this.editor.gridView2d;

      gridView2d.setupPreviousFrame();
      previousFrameSrcCanvas = gridView2d.previousScreen.canvas;

      this.editor.graphic.invalidateAllCells();
    }    
    */


    // are we drawing everything or just what is in the view?
    var drawBounds = {
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height
    };


    /*
    if(!allCells) {
      if(this.editor.graphic.getOnlyViewBoundsDrawn() || animatedTilesOnly) {
        var viewBounds = this.editor.graphic.getViewBounds();
        drawBounds.x = viewBounds.x;
        drawBounds.y = viewBounds.y;
        drawBounds.width = viewBounds.width;
        drawBounds.height = viewBounds.height;
      }
    }
    */


//    context.clearRect(drawBounds.x, drawBounds.y, drawBounds.width, drawBounds.height);

    //context.clearRect(dstX, dstY, dstWidth, dstHeight);

//    context.fillStyle = 'black';
//    context.fillRect(dstX, dstY, dstWidth, dstHeight);

    // loop through the layers to draw them
    var layers = this.editor.layers.layers;
    for(var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      var layerObject = false;
  
      // get the origin of the layer in screen coords
      var originX = dstX - srcX * scale;
      var originY = dstY - srcY * scale;

      if(drawAtX !== false) {
        originX = drawAtX;
        originY = drawAtY;
      }


//      console.log(originX + ',' + originY);


      if( ( (layer.visible && whichLayers == 'visible') 
            || (whichLayers == 'all') || (whichLayers == layer.layerId) )
            && (layer.type == 'grid' || layer.type == 'image')) {
        // we're drawing this layer.
        var layerObject = null;
        var layerCanvas = null;

        var drawLayerOffsetX = 0;
        var drawLayerOffsetY = 0;
        var drawLayerWidth = 0;
        var drawLayerHeight = 0;

        layerObject = this.editor.layers.getLayerObject(layer.layerId);
        var tileRegions = false;
        if(updateLayerCanvas && !allCells) {
          if(args.dirtyPixels && args.dirtyPixels.layerRegions
              && args.dirtyPixels.layerRegions[layer.layerId]) {
            tileRegions = args.dirtyPixels.layerRegions[layer.layerId];
          }
        }

        var layerWidth = layerObject.getWidth();
        var layerHeight = layerObject.getHeight();


        // if also drawing previous frame, dont draw the background of the current frame
        var drawLayerBackground = drawBackground;
        if(layerObject && layerObject.isCurrentLayer() && drawPreviousFrame) {
          drawLayerBackground = false;
          
        }

        // grid is the only layer type supported at the moment...
        if(layer.type == 'grid') {

          // dont want to update the layer canvas if 
          // something is requesting a frame other than the current one
          if(updateLayerCanvas) {
            layerCanvas = layerObject.getCanvas();
          } else {
            layerCanvas = this.tempCanvas;
          }


          if(layerObject.getMode() == TextModeEditor.Mode.VECTOR) {

            var drawFromX = srcX;
            var drawFromY = srcY;
            var drawToX = srcX + srcWidth;
            var drawToY = srcY + srcHeight;

            if(drawFromX < 0) {
              drawLayerOffsetX = -drawFromX * scale;
              drawFromX = 0;
            }

            if(drawFromY < 0) {
              drawLayerOffsetY = -drawFromY * scale;              
              drawFromY = 0;
            }

            if(drawToX > layerWidth) {
              drawToX = layerWidth;
            }

            if(drawToY > layerHeight) {
              drawToY = layerHeight;
            }

            var drawArgs = {
              canvas: layerCanvas,  
              frame: frame, 
              drawBackground: drawLayerBackground,
              allCells: allCells,
              shapes: false,
              cursor: false,
              scale: scale,
              drawFromX: drawFromX,
              drawFromY: drawFromY,
              drawToX: drawToX,
              drawToY: drawToY
            };


            // draw the layer
            drawArgs.allCells = allCells;
            drawArgs.eraseCursor = false;
            drawArgs.cursor = false;
            drawArgs.dragPaste = false;
            drawArgs.eraseDragPaste = false;
            drawArgs.shapes = false;
            drawArgs.typingCursor = false;
            drawArgs.eraseTypingCursor = false;


            var drawArgs2 = {
              canvas: layerCanvas,  
              frame: frame, 
              drawBackground: drawLayerBackground,
              allCells: allCells,
              shapes: false,
              cursor: false,
              scale: scale,
              drawFromX: drawFromX,
              drawFromY: drawFromY,
              drawToX: drawToX,
              drawToY: drawToY
            };

            var offset = false;

            if(allCells) {
              
              drawArgs2.bgOnly = true;
              drawArgs2.fgOnly = false;
              offset = layerObject.drawVector(drawArgs2);

              drawArgs2.bgOnly = false;
              drawArgs2.fgOnly = true;
              
              offset = layerObject.drawVector(drawArgs2);
            } else {
              drawArgs2.bgOnly = true;
              drawArgs2.fgOnly = false;
              offset = tileRegions && layerObject.drawTileRegions
                ? layerObject.drawTileRegions(drawArgs2, tileRegions, false)
                : layerObject.drawVector(drawArgs2);

              drawArgs2.bgOnly = false;
              drawArgs2.fgOnly = true;
              offset = tileRegions && layerObject.drawTileRegions
                ? layerObject.drawTileRegions(drawArgs2, tileRegions, true)
                : layerObject.drawVector(drawArgs2);
              if(!tileRegions && layerObject.getTileDirtyRegions
                  && layerObject.getTileDirtyRegions().length
                  && layerObject.drawTileRegions) {
                drawArgs2.bgOnly = true;
                drawArgs2.fgOnly = false;
                layerObject.drawTileRegions(drawArgs2, layerObject.getTileDirtyRegions(), false);
                drawArgs2.bgOnly = false;
                drawArgs2.fgOnly = true;
                offset = layerObject.drawTileRegions(drawArgs2, layerObject.getTileDirtyRegions(), true);
              }
            }

            if(!graphicOnly && layerObject.isCurrentLayer()) {
              if(this.editor.tools.drawTools.select.isInPasteMove()) {
                // draw the paste move

                drawArgs.shapes = false;
                drawArgs.eraseCursor = false;
                drawArgs.cursor = false;
                drawArgs.dragPaste = false;
                drawArgs.eraseDragPaste = true;
                drawArgs.allCells = false;
                layerObject.drawVector(drawArgs);

                drawArgs.shapes = false;
                drawArgs.eraseCursor = false;
                drawArgs.cursor = false;
                drawArgs.dragPaste = true;
                drawArgs.eraseDragPaste = false;
                drawArgs.allCells = false;
                layerObject.drawVector(drawArgs);                              
              }
            }


            drawLayerOffsetX += offset.offsetX + dstX;
            drawLayerOffsetY += offset.offsetY + dstY;


            drawLayerWidth = (drawToX - drawFromX) * scale;
            drawLayerHeight = (drawToY - drawFromY) * scale;
            
          } else {
            // non vector

            // tell the layer to draw itself
            var bitmapDrawArgs = {
              canvas: layerCanvas,
              frame: frame,
              allCells: allCells,
              drawBackground: drawLayerBackground
            };
            if(tileRegions && layerObject.drawTileRegions) {
              layerObject.drawTileRegions(bitmapDrawArgs, tileRegions, true);
            } else {
              layerObject.draw(bitmapDrawArgs);
              if(layerObject.getTileDirtyRegions
                  && layerObject.getTileDirtyRegions().length
                  && layerObject.drawTileRegions) {
                layerObject.drawTileRegions(bitmapDrawArgs,
                  layerObject.getTileDirtyRegions(), true);
              }
            }
          }
        }                  

        // take the opacity into account
        var opacity = 1;
        if(typeof layer.opacity != 'undefined') {
          opacity = layer.opacity;
        }


        // if the current layer is a grid layer and need to draw onion skin frame
        if(layerObject && layerObject.isCurrentLayer() && drawPreviousFrame && layer.type == 'grid') {
          if(drawBackground) {
            context.globalAlpha = opacity;
            var colorPalette = layerObject.getColorPalette();
            var bgColor = layerObject.getBackgroundColor();

            if(bgColor !== this.editor.colorPaletteManager.noColor) {
              context.fillStyle= '#' + colorPalette.getHexString(bgColor);  

              
              context.fillRect(originX, originY, 
                layerWidth * scale, layerHeight * scale);
                
            }
          }
          context.globalAlpha = 0.3;

          // Each layer owns its previous-frame raster and dependency cache.

          var prevFrameCanvas = layerObject.getPrevFrameCanvas();


          if(layerObject.getMode() == TextModeEditor.Mode.VECTOR) {
            var drawFromX = srcX;
            var drawFromY = srcY;
            var drawToX = srcX + srcWidth;
            var drawToY = srcY + srcHeight;
            var drawPrevLayerOffsetX = 0;
            var drawPrevLayerOffsetY = 0;

            if(drawFromX < 0) {
              drawPrevLayerOffsetX = -drawFromX * scale;
              drawFromX = 0;
            }

            if(drawFromY < 0) {
              drawPrevLayerOffsetY = -drawFromY * scale;              
              drawFromY = 0;
            }

            if(drawToX > layerWidth) {
              drawToX = layerWidth;
            }

            if(drawToY > layerHeight) {
              drawToY = layerHeight;
            }

            var drawArgs = {
              canvas: prevFrameCanvas,  
              frame: prevFrame, 
              allCells: allCells,
              drawBackground: false,
              shapes: false,
              cursor: false,
              scale: scale,
              drawFromX: drawFromX,
              drawFromY: drawFromY,
              drawToX: drawToX,
              drawToY: drawToY,
              draw: 'prevgrid'
            };

            var offset = layerObject.drawPrevFrame(drawArgs);

            drawPrevLayerOffsetX += offset.offsetX + dstX;
            drawPrevLayerOffsetY += offset.offsetY + dstY;


            drawPrevLayerWidth = (drawToX - drawFromX) * scale;
            drawPrevLayerHeight = (drawToY - drawFromY) * scale;

            context.drawImage(prevFrameCanvas, 
              0, 0, drawPrevLayerWidth, drawPrevLayerHeight,
              drawPrevLayerOffsetX, drawPrevLayerOffsetY, drawPrevLayerWidth, drawPrevLayerHeight
            );

          } else {

            layerObject.drawPrevFrame({
              canvas: prevFrameCanvas,
              frame: prevFrame,
              drawBackground: drawBackground
            });

            drawImage(prevFrameCanvas,
              0, 0, layerWidth, layerHeight,
              originX, originY, layerWidth * scale, layerHeight * scale);
          }

//          context.drawImage(previousFrameSrcCanvas, originX, originY, layerWidth * scale, layerHeight * scale);

        }

        // set the opacity and composite operation
        context.globalAlpha = opacity;
        if(typeof layer.compositeOperation != 'undefined') {
          context.globalCompositeOperation = layer.compositeOperation;
        } else {
          context.globalCompositeOperation = 'source-over';
        }


        var shapePreview = false;
        if(!graphicOnly && shapes && layer.type == 'grid' && layerObject.isCurrentLayer()) {
          shapePreview = this.editor.tools.drawTools.shapes.drawPreview(layerObject, {
            srcX: srcX, srcY: srcY, srcWidth: srcWidth, srcHeight: srcHeight,
            scale: scale, frame: frame, drawBackground: drawLayerBackground
          });
        }

        if(layer.type == 'grid' || layer.type == 'image') {
          if(layerCanvas) {

            if(layerObject.getMode() == TextModeEditor.Mode.VECTOR) {

              var drawWidth = layerCanvas.width;
              var drawHeight = layerCanvas.height;

              // right border is at originX + layerWidth * scale

              if(drawLayerOffsetX + drawWidth > originX + layerWidth * scale) {
                drawWidth = (originX + layerWidth * scale) - drawLayerOffsetX;
              }

              if(drawLayerOffsetY + drawHeight > originY + layerHeight * scale) {
                drawHeight = (originY + layerHeight * scale) - drawLayerOffsetY;
              }

              if(shapePreview) {
                // Partition destination pixels, not fractional cell edges:
                // antialiasing a hole and then blitting into it leaves seams.
                var previewLeft = Math.floor(drawLayerOffsetX + shapePreview.sourceX);
                var previewTop = Math.floor(drawLayerOffsetY + shapePreview.sourceY);
                var previewRight = Math.ceil(drawLayerOffsetX + shapePreview.sourceX + shapePreview.width);
                var previewBottom = Math.ceil(drawLayerOffsetY + shapePreview.sourceY + shapePreview.height);
                context.save();
                context.beginPath();
                context.rect(0, 0, canvas.width, canvas.height);
                context.rect(previewLeft, previewTop, previewRight - previewLeft, previewBottom - previewTop);
                context.clip('evenodd');
              }
              context.drawImage(layerCanvas,
                                 0, 0, drawWidth, drawHeight,
                                 drawLayerOffsetX, drawLayerOffsetY, drawWidth, drawHeight);
              if(shapePreview) {
                context.restore();
                context.save();
                context.beginPath();
                context.rect(previewLeft, previewTop, previewRight - previewLeft, previewBottom - previewTop);
                context.clip();
                // Identical source origin, destination phase and document-edge
                // crop for both rasters. Only the integer preview clip differs.
                context.drawImage(shapePreview.canvas,
                  0, 0, drawWidth, drawHeight,
                  drawLayerOffsetX, drawLayerOffsetY, drawWidth, drawHeight);
                context.restore();
              }
              /*
              context.drawImage(layerCanvas, 
                drawLayerOffsetX, drawLayerOffsetY,
                drawWidth, drawHeight
              );
              */
            } else {
              // only draw visible part of canvas
              drawImage(layerCanvas,
                srcX, srcY, srcWidth, srcHeight,
                dstX, dstY, srcWidth * scale, srcHeight * scale
              );
            }



            
            /*
            context.drawImage(layerCanvas, 
              drawBounds.x, drawBounds.y, drawBounds.width, drawBounds.height,
              drawBounds.x, drawBounds.y, drawBounds.width, drawBounds.height
            );
            */
          }
        } else {
          context.drawImage(layer.canvas, 0, 0);
        }


        if(shapePreview && !shapePreview.vector) {
          drawImage(shapePreview.canvas, shapePreview.sourceX, shapePreview.sourceY,
            shapePreview.width, shapePreview.height,
            originX + shapePreview.x * scale, originY + shapePreview.y * scale,
            shapePreview.width * scale, shapePreview.height * scale);
        }

        // draw the borders if necessary, dont draw border for sprites
        var borderVisible = this.editor.grid.border.visible && this.getType() != 'sprite';    
        if(originX > 0 || originY > 0 || originX + layerWidth * scale < canvas.width || originY + layerHeight * scale < canvas.height) {
          
          if(borderVisible && layer.visible && layer.type == 'grid') {
            var layerObject = this.editor.layers.getLayerObject(layer.layerId);    
            if(layerObject && typeof layerObject.getBorderColor != 'undefined') {
              var colorPalette = layerObject.getColorPalette();    
              var borderWidth = 8 * 4;// tileSet.charWidth * 4;
              var borderColor = layerObject.getBorderColor();
    
              if(borderColor != this.editor.colorPaletteManager.noColor) {
                context.fillStyle = '#' + colorPalette.getHexString(borderColor);;
    
                    // might need to draw borders
                if(originX + (borderWidth * scale) > 0) {
                  // left border
                  context.fillRect(
                    originX - borderWidth * scale, 
                    originY - 2, 
                    borderWidth * scale, 
                    layerHeight * scale + 4
                  );
                }
                if(originX + layerWidth * scale < canvas.width) {
                  // right border
                  context.fillRect(
                    originX + layerWidth * scale, 
                    originY - 2, 
                    borderWidth * scale, 
                    layerHeight * scale + 4
                  );
                }

                if(originY + (borderWidth * scale) > 0) {
                  // top border
                  context.fillRect(
                    originX - borderWidth * scale, 
                    originY - borderWidth * scale, 
                    (layerWidth + 2 * borderWidth) * scale, 
                    borderWidth * scale
                  );
                }

                // bottom border
                context.fillRect(
                  originX - borderWidth * scale, 
                  originY + layerHeight * scale, 
                  (layerWidth + 2 * borderWidth) * scale, 
                  borderWidth * scale
                );

              }
            }
          }        
        }

      }

      if(layerObject !== false && layerObject.isCurrentLayer()) {
        // its the current layer..draw selection and shapes
        // need to draw shapes?
        // draw shapes if in shapes mode and grid correct size

        var drawTools = this.editor.tools.drawTools;

        if(layer.type == 'grid') {

          // if select is active, selection isn't drawn in the grid, need to draw it here
          // dont want to draw it if in paste move
          if(drawTools.select.isActive() && drawTools.select.isMovingSelectionContents()) {

            if(!drawTools.select.isInPasteMove()) {
              // not really shapes canvas, its the selection canvas
              if(this.shapesCanvas === null) {
                this.shapesCanvas = document.createElement('canvas');
              }

              var layerCanvas = layerObject.getCanvas();

              if(this.shapesCanvas.width != layerCanvas.width || this.shapesCanvas.height != layerCanvas.height) {
                this.shapesCanvas.width = layerCanvas.width;
                this.shapesCanvas.height = layerCanvas.height;
              }

              layerObject.draw({ 
                canvas: this.shapesCanvas, 
                allCells: true, 
                draw: 'selection', 
                frame: frame 
              });

              
              drawImage(this.shapesCanvas,
                0, 0, this.shapesCanvas.width, this.shapesCanvas.height,
                originX, originY, this.shapesCanvas.width * scale, this.shapesCanvas.height * scale);
                
            }

          }

          // draw the movable pasted area
          if(drawTools.select.isInPasteMove()) {
            context.translate(originX, originY);
            drawTools.select.drawClipboardImage(context, scale, drawImage);
            context.translate(-originX, -originY);
          }


          var pixelSelect = drawTools.pixelSelect;

          if(pixelSelect.isActive()) {
            var selection = pixelSelect.getSelection();
            if(selection.maxX > selection.minX && selection.maxY > selection.minY) {
              var layerHeight = layerObject.getHeight();

              pixelSelect.drawSelection();

              var sx = selection.minX;
              var sy = selection.minY;
              var sWidth = selection.maxX - selection.minX;
              var sHeight = selection.maxY - selection.minY;
              var dx = selection.minX + pixelSelect.selectionOffsetX;
              // reverseY                    var dy = layerHeight - selection.maxY - pixelSelect.selectionOffsetY;
              var dy = selection.minY + pixelSelect.selectionOffsetY;
              drawImage(pixelSelect.canvas, sx, sy, sWidth, sHeight,
                originX + dx * scale, originY + dy * scale, sWidth * scale, sHeight * scale);
            }
          }


          // draw the movable pasted area
          if(pixelSelect.isInPasteMove()) {
            pixelSelect.drawPastedPixels();
            var sx = 0;
            var sy = 0;
            var sWidth = pixelSelect.getPasteWidth();
            var sHeight = pixelSelect.getPasteHeight();
            var dx = pixelSelect.pasteOffsetX;
            var dy = pixelSelect.pasteOffsetY;

            drawImage(pixelSelect.canvas, sx, sy, sWidth, sHeight,
              originX + dx * scale, originY + dy * scale, sWidth * scale, sHeight * scale);
          }
        }
      } 
      
    }    
  }



}
