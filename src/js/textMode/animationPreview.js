var AnimationPreview = function() {
  this.editor = null;
  this.visible = false;

  this.currentCanvasElementId = '';
  this.canvasElementId = '';
  this.canvasHolderElementId = '';
  this.screenCanvas = null;
  this.screenContext = null;
  this.frameCache = [];
  this.frameCacheLimit = 3;

  this.lastFrameTime = 0;
  this.currentFrame = 0;

  this.scale = 1;
  this.scaleFit = false;

  this.fromFrame = 0;
  this.toFrame = 0;

}

AnimationPreview.prototype = {
  init: function(editor) {
    this.editor = editor;
  },

  buildInterface: function(parentPanel) {
    var _this = this;

    var html = '';

    html += '<div class="panelFill">';
    html += '  <div style="position: absolute; top: 10px; left: 0; right: 0; bottom: 40px" id="animationPreviewHolder">';
    html += '    <canvas id="animationPreviewCanvas" style=""></canvas>';
    html += '  </div>';


    html += '<div style="position: absolute; bottom: 0px; height: 40px; left: 0; right: 0">';


    html += '<div>';
    html += '  <select id="animationFrameRange">';
    html += '    <option value="" selected="selected">All Frames</option>';
    html += '  </select>';

    html += '</div>';

    html += '<div class="ui-button">Play</div>';
    html += '<select id="animationPreviewScale">';
    html += '<option value="0" selected="selected">Fit</option>';
    html += '<option value="1">100%</option>';
    html += '<option value="2">200%</option>';
    html += '<option value="3">300%</option>';
    html += '<option value="4">400%</option>';
    html += '<option value="5">500%</option>';
    html += '<option value="6">600%</option>';
    html += '</select>';
    html += '</div>';


    html += '</div>';

    this.uiComponent = UI.create("UI.HTMLPanel", { "html": html });

    this.uiComponent.on('resize', function() {
      _this.resize();
    });
    parentPanel.add(this.uiComponent);

    this.canvasElementId = 'animationPreviewCanvas';
    this.canvasHolderElementId = 'animationPreviewHolder';

    
    UI.on('ready', function() {

      var value = parseInt($('#animationPreviewScale').val());
      _this.setScale(value);

      $('#animationPreviewScale').on('change', function() {
        var value = parseInt($(this).val());
        _this.setScale(value);
      });
      _this.resize();
      _this.initEvents();
    });
  },

  show: function() {
    this.visible = true;
    this.resize();
  },

  hide: function() {
    this.visible = false;
  },

  getVisible: function() {
    return this.visible;
  },
  
  initEvents: function() {
    var _this = this;

    $('#animationFrameRange').on('change', function() {
      var value = $(this).val();
      _this.setFrameRange(value);
    });

  },

  updateFrameRanges: function() {
    var currentValue = $('#animationFrameRange').val();

    if(currentValue !== '') {
      currentValue = parseInt(currentValue, 10);
    }

    var html = '';
    html += '<option value="">All Frames</option>';
    var frameRanges = this.editor.graphic.getFrameRanges();
    for(var i = 0; i < frameRanges.length; i++) {
      var rangeNumber = i + 1;
      var name = 'Range ' + rangeNumber;
      html += '<option value="' + i + '" ';
      if(i === currentValue) {
        html += ' selected="selected" ';
      }
      html += '>' + name + '</option>';
    } 

    $('#animationFrameRange').html(html);
    var value = $('#animationFrameRange').val();
    this.setFrameRange(value);
  },

  setFrameRange: function(value) {
    if(value !== '') {
      value = parseInt(value, 10);
      if(isNaN(value)) {
        return;
      }
    }

    this.frameRange = value;
    var frameRanges = this.editor.graphic.getFrameRanges();
    this.fromFrame = 0;
    this.toFrame = this.editor.graphic.getFrameCount();

    if(value !== '' && value >= 0 && value < frameRanges.length) {
      this.fromFrame = frameRanges[value].start;
      this.toFrame = frameRanges[value].end;
    }

    var frameChanged = this.currentFrame < this.fromFrame || this.currentFrame >= this.toFrame;
    if(frameChanged) {
      this.currentFrame = this.fromFrame;
    }

    var selectValue = $('#animationFrameRange').val();
    if(selectValue !== '') {
      selectValue = parseInt(selectValue, 10);
    }

    if(selectValue !== value) {
      $('#animationFrameRange').val(value);
    }

    this.editor.spriteFrames.drawRange({ rangesChanged: false });
    this.editor.spriteFrames.draw({ framesChanged: false });

    if(frameChanged) {
      this.draw();
    }

  },

  getFrameRange: function() {
    return this.frameRange;
  },

  setScale: function(scale) {
    this.scaleFit = scale == 0;    
    this.scale = scale;
    this.draw();
  },

  setCanvasElementId: function(canvasElementId, canvasHolderElementId) {
    this.canvasElementId = canvasElementId;
    this.canvasHolderElementId = canvasHolderElementId;
  },

  sizeCanvas: function() {

    var element = $('#' + this.canvasHolderElementId);
    if(this.canvas == null || this.canvasElementId != this.currentCanvasElementId) {
      this.canvas = document.getElementById(this.canvasElementId);
      this.currentCanvasElementId = this.canvasElementId;
    }


    var position = element.offset();
    if(position) {
      this.left = position.left;
      this.top = position.top;

      this.width = element.width();
      this.height = element.height();
    }



    if(this.width != this.canvas.style.width || this.height != this.canvas.style.height) {
      if(this.width != 0 && this.height != 0) {

        this.canvasScale = Math.floor(UI.devicePixelRatio);
        
        this.canvas.style.width = this.width + 'px';
        this.canvas.style.height = this.height + 'px';

        this.canvas.width = this.width * this.canvasScale;
        this.canvas.height = this.height * this.canvasScale;
      }
    }

    this.context = this.canvas.getContext('2d');
//    this.context.scale(this.scale, this.scale);

    this.context.imageSmoothingEnabled = false;
    this.context.webkitImageSmoothingEnabled = false;
    this.context.mozImageSmoothingEnabled = false;
    this.context.msImageSmoothingEnabled = false;
    this.context.oImageSmoothingEnabled = false;


  },

  resize: function() {
    if(!this.visible) {
      return;
    }


    this.sizeCanvas();
    this.draw();
  },

  statesEqual: function(a, b) {
    return a && b && a.length === b.length && a.every(function(value, index) {
      return value === b[index];
    });
  },

  getFrameRenderState: function(frame) {
    var layers = this.editor.layers.layers;
    var drawBackground = this.editor.layers.isBackgroundVisible();
    var state = [
      frame,
      this.editor.graphic.getGraphicWidth(),
      this.editor.graphic.getGraphicHeight(),
      drawBackground,
      layers,
      layers.length
    ];

    for(var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      state.push(layer, layer.layerId, layer.type, layer.visible,
        layer.opacity, layer.compositeOperation);
      if(!layer.visible || (layer.type !== 'grid' && layer.type !== 'image')) {
        continue;
      }

      var layerObject = this.editor.layers.getLayerObject(layer.layerId);
      state.push(layerObject);
      if(!layerObject) { continue; }

      if(layer.type === 'grid' && layerObject.getFrameRenderState) {
        var layerState = layerObject.getFrameRenderState(frame, drawBackground);
        for(var stateIndex = 0; stateIndex < layerState.length; stateIndex++) {
          state.push(layerState[stateIndex]);
        }
        state.push(layerObject.getFrameContentRevision
          ? layerObject.getFrameContentRevision(frame) : 0);

        // Selective tile animation intentionally does not advance the global
        // tile-set revision. Key only the glyph revisions this frame uses.
        var tileSet = layerObject.getTileSet && layerObject.getTileSet();
        var usage = layerObject.getTileUsage && layerObject.getTileUsage(frame);
        if(tileSet && usage) {
          var tileIds = Object.keys(usage).sort(function(a, b) { return Number(a) - Number(b); });
          state.push(tileIds.length);
          for(var tileIndex = 0; tileIndex < tileIds.length; tileIndex++) {
            var tileId = tileIds[tileIndex];
            state.push(tileId, tileSet.tileRenderRevisions
              ? tileSet.tileRenderRevisions[tileId] || 0 : 0);
          }
        }
      } else if(layer.type === 'image') {
        var doc = layerObject.doc || layer;
        state.push(doc, doc.imageData, doc.width, doc.height,
          layerObject.image, layerObject.imageCanvas,
          layerObject.imageCanvas && layerObject.imageCanvas.width,
          layerObject.imageCanvas && layerObject.imageCanvas.height);
      }
    }
    return state;
  },

  getCachedFrame: function(state) {
    for(var i = 0; i < this.frameCache.length; i++) {
      if(this.statesEqual(this.frameCache[i].state, state)) {
        var entry = this.frameCache.splice(i, 1)[0];
        this.frameCache.unshift(entry);
        return entry;
      }
    }
    return null;
  },

  isFrameCached: function(frame) {
    var state = this.getFrameRenderState(frame);
    for(var i = 0; i < this.frameCache.length; i++) {
      if(this.statesEqual(this.frameCache[i].state, state)) { return true; }
    }
    return false;
  },

  createFrameCacheEntry: function(frame) {
    var entry = null;
    for(var i = 0; i < this.frameCache.length; i++) {
      if(this.frameCache[i].frame === frame) {
        entry = this.frameCache.splice(i, 1)[0];
        break;
      }
    }
    if(!entry && this.frameCache.length >= this.frameCacheLimit) {
      entry = this.frameCache.pop();
    }
    if(!entry) {
      entry = { canvas: document.createElement('canvas'), state: null };
    }
    entry.frame = frame;
    this.frameCache.unshift(entry);
    return entry;
  },

  draw: function() {
    if(!this.visible) {
      return;
    }

    var screenWidth =  this.editor.graphic.getGraphicWidth();
    var screenHeight = this.editor.graphic.getGraphicHeight();

    var state = this.getFrameRenderState(this.currentFrame);
    var entry = this.getCachedFrame(state);
    if(!entry) {
      entry = this.createFrameCacheEntry(this.currentFrame);
      this.screenCanvas = entry.canvas;
      if(this.screenCanvas.width != screenWidth) {
        this.screenCanvas.width = screenWidth;
      }
      if(this.screenCanvas.height != screenHeight) {
        this.screenCanvas.height = screenHeight;
      }
      this.screenContext = this.screenCanvas.getContext('2d');
      this.screenContext.imageSmoothingEnabled = false;
      this.screenContext.webkitImageSmoothingEnabled = false;
      this.screenContext.mozImageSmoothingEnabled = false;
      this.screenContext.msImageSmoothingEnabled = false;
      this.screenContext.oImageSmoothingEnabled = false;
      this.screenContext.clearRect(0, 0, this.screenCanvas.width, this.screenCanvas.height);

      try {
        this.editor.grid.grid2d.drawFrame({
          allCells: true,
          updateLayerCanvas: false,
          drawPreviousFrame: false,
          drawOverlays: false,
          canvas: this.screenCanvas,
          context: this.screenContext,
          frame: this.currentFrame,
          layers: 'visible'
        });
        entry.state = state;
      } catch(error) {
        entry.state = null;
        throw error;
      }
    } else {
      this.screenCanvas = entry.canvas;
      this.screenContext = this.screenCanvas.getContext('2d');
    }

    var scale = this.scale * this.canvasScale;
    if(scale === 0) {
      var hScale = Math.floor((this.canvas.width - 10) / screenWidth);
      var vScale = Math.floor((this.canvas.height - 10) / screenHeight);
      if(vScale > hScale) {
        scale = hScale;
      } else {
        scale = vScale;
      }
    }

    var width = this.screenCanvas.width * scale;
    var height = this.screenCanvas.height * scale;

    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.drawImage(this.screenCanvas, (this.canvas.width - width) / 2, (this.canvas.height - height) / 2,  
                           this.screenCanvas.width * scale, 
                           this.screenCanvas.height * scale);

/*this.borderWidth * this.scale, this.borderHeight * this.scale, 
      this.screenCanvas.width * this.scale, this.screenCanvas.height * this.scale);
*/

  },


  update: function() {
    if(this.editor.frames.playFrames) {
      // playing so just do the same frames...
      var frame = this.editor.graphic.getCurrentFrame();
      if(frame !== this.currentFrame || !this.isFrameCached(frame)) {
        this.currentFrame = frame;
        this.draw();        
      }

    } else {
      this.playDirection = 1;

      var time = getTimestamp();   

      var frameCount = this.editor.graphic.getFrameCount();

      // what is the start and end of the current frame range
      var frameRanges = this.editor.graphic.getFrameRanges();
      this.fromFrame = 0;
      this.toFrame = frameCount;

      if(this.frameRange !== '' && this.frameRange >= 0 && this.frameRange < frameRanges.length) {
        this.fromFrame = frameRanges[this.frameRange].start;
        this.toFrame = frameRanges[this.frameRange].end;
      }


      if(this.currentFrame >= this.toFrame) {
        this.currentFrame = this.fromFrame;

        if(frameCount == 0) {
          return;
        }
      } 

      if( time - this.lastFrameTime > this.editor.graphic.frames[this.currentFrame].duration * FRAMERATE) {

        var frame = this.currentFrame;

        frame += this.playDirection;

        if(frame >= this.toFrame) {
          frame = this.fromFrame;
        }      

        var frameChanged = frame !== this.currentFrame;
        this.currentFrame = frame;
        this.lastFrameTime = time;      
        if(frameChanged || !this.isFrameCached(frame)) {
          this.draw();
        }

      }
    
    }
  }

}
