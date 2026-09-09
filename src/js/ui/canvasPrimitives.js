// Canvas roles:
// - display canvases use CanvasSurface and are sized in CSS pixels at exact DPR;
// - source rasters use intrinsic artwork dimensions and never DPR;
// - backing rasters follow a display surface and its DPR revision;
// - export rasters use document/export dimensions and never monitor DPR.
// PixelArtBlitter maps intrinsic bitmap sources onto the final display backing
// lattice. GlyphPreview owns the same policy for small bitmap/vector previews.
UI.CanvasSurface = function(canvas) {
  this.canvas = canvas || null;
  this.metrics = null;

  this.setCanvas = function(nextCanvas) {
    if(this.canvas !== nextCanvas) {
      this.canvas = nextCanvas;
      this.metrics = null;
    }
  }

  this.resize = function(args) {
    if(!this.canvas) {
      throw new Error('CanvasSurface requires a canvas');
    }

    var cssWidth = Number(args.cssWidth);
    var cssHeight = Number(args.cssHeight);
    var pixelRatio = typeof args.pixelRatio == 'undefined'
      ? UI.devicePixelRatio
      : Number(args.pixelRatio);

    if(!isFinite(cssWidth) || cssWidth <= 0
      || !isFinite(cssHeight) || cssHeight <= 0) {
      throw new RangeError('CanvasSurface CSS dimensions must be finite and positive');
    }
    if(!isFinite(pixelRatio) || pixelRatio <= 0) {
      throw new RangeError('CanvasSurface pixel ratio must be finite and positive');
    }

    var backingWidth = Math.round(cssWidth * pixelRatio);
    var backingHeight = Math.round(cssHeight * pixelRatio);
    var cssWidthValue = cssWidth + 'px';
    var cssHeightValue = cssHeight + 'px';
    var previousMetrics = this.metrics;
    var ratioChanged = previousMetrics !== null
      && previousMetrics.pixelRatio !== pixelRatio;
    var pixelRatioRevision = typeof UI.devicePixelRatioRevision == 'number'
      ? UI.devicePixelRatioRevision
      : 0;
    var revisionChanged = previousMetrics !== null
      && previousMetrics.pixelRatioRevision !== pixelRatioRevision;
    var force = args.force === true;
    var backingWidthChanged = force || this.canvas.width !== backingWidth;
    var backingHeightChanged = force || this.canvas.height !== backingHeight;
    var backingResized = backingWidthChanged || backingHeightChanged;
    var cssWidthChanged = this.canvas.style.width !== cssWidthValue;
    var cssHeightChanged = this.canvas.style.height !== cssHeightValue;
    var cssResized = cssWidthChanged || cssHeightChanged;

    if(cssWidthChanged) {
      this.canvas.style.width = cssWidthValue;
    }
    if(cssHeightChanged) {
      this.canvas.style.height = cssHeightValue;
    }
    if(backingWidthChanged) {
      this.canvas.width = backingWidth;
    }
    if(backingHeightChanged) {
      this.canvas.height = backingHeight;
    }

    this.metrics = UI.CanvasSurface.createMetrics({
      cssWidth: cssWidth,
      cssHeight: cssHeight,
      pixelRatio: pixelRatio,
      pixelRatioRevision: pixelRatioRevision,
      backingWidth: backingWidth,
      backingHeight: backingHeight,
      resized: cssResized || backingResized,
      backingResized: backingResized,
      ratioChanged: ratioChanged,
      cacheInvalidated: ratioChanged || revisionChanged
    });

    return this.metrics;
  }

  this.getMetrics = function() {
    return this.metrics;
  }

  this.isPixelRatioCurrent = function() {
    return this.metrics !== null
      && this.metrics.pixelRatio === UI.devicePixelRatio
      && this.metrics.pixelRatioRevision === UI.devicePixelRatioRevision;
  }

  this.getBackingContext = function(args) {
    args = args || {};
    var context = args.noSmoothing
      ? UI.getContextNoSmoothing(this.canvas)
      : this.canvas.getContext('2d', args.contextAttributes || args);
    context.setTransform(1, 0, 0, 1, 0, 0);
    return context;
  }

  this.getLogicalContext = function(args) {
    args = args || {};
    var context = args.noSmoothing
      ? UI.getContextNoSmoothing(this.canvas)
      : this.canvas.getContext('2d', args.contextAttributes || args);
    var pixelRatio = this.metrics ? this.metrics.pixelRatio : UI.devicePixelRatio;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    return context;
  }
}

UI.CanvasSurface.backingEdge = function(cssPosition, pixelRatio) {
  cssPosition = Number(cssPosition);
  pixelRatio = Number(pixelRatio);
  if(!isFinite(cssPosition) || !isFinite(pixelRatio) || pixelRatio <= 0) {
    throw new RangeError('CanvasSurface edge values must be finite with a positive pixel ratio');
  }
  return Math.round(cssPosition * pixelRatio);
}

UI.CanvasSurface.backingRect = function(cssX, cssY, cssWidth, cssHeight, pixelRatio) {
  cssX = Number(cssX);
  cssY = Number(cssY);
  cssWidth = Number(cssWidth);
  cssHeight = Number(cssHeight);
  if(!isFinite(cssX) || !isFinite(cssY)
    || !isFinite(cssWidth) || cssWidth < 0
    || !isFinite(cssHeight) || cssHeight < 0) {
    throw new RangeError('CanvasSurface rectangle values must be finite with non-negative dimensions');
  }
  var left = UI.CanvasSurface.backingEdge(cssX, pixelRatio);
  var top = UI.CanvasSurface.backingEdge(cssY, pixelRatio);
  var right = UI.CanvasSurface.backingEdge(cssX + cssWidth, pixelRatio);
  var bottom = UI.CanvasSurface.backingEdge(cssY + cssHeight, pixelRatio);
  return Object.freeze({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  });
}

UI.CanvasSurface.createMetrics = function(values) {
  values.backingEdge = function(cssPosition) {
    return UI.CanvasSurface.backingEdge(cssPosition, values.pixelRatio);
  };
  values.backingRect = function(cssX, cssY, cssWidth, cssHeight) {
    return UI.CanvasSurface.backingRect(
      cssX, cssY, cssWidth, cssHeight, values.pixelRatio);
  };
  return Object.freeze(values);
}

UI.CanvasPreview = function(canvas, holderSelector, onDevicePixelRatioChange) {
  this.canvas = canvas;
  this.holderSelector = holderSelector;
  this.surface = new UI.CanvasSurface(canvas);
  this.removeDevicePixelRatioListener = null;
  if(typeof onDevicePixelRatioChange == 'function') {
    var _this = this;
    this.removeDevicePixelRatioListener = UI.onDevicePixelRatioChange(function() {
      if(!_this.surface.isPixelRatioCurrent()) {
        onDevicePixelRatioChange();
      }
    });
  }
}

UI.CanvasPreview.prototype.resize = function() {
  var element = $(this.holderSelector);
  if(!element || element.length === 0) {
    return null;
  }
  var position = element.offset();
  if(!position) {
    return null;
  }
  var width = element.width();
  var height = element.height();
  if(width <= 0 || height <= 0) {
    return null;
  }
  return Object.freeze({
    left: position.left,
    top: position.top,
    width: width,
    height: height,
    metrics: this.surface.resize({ cssWidth: width, cssHeight: height })
  });
}

UI.CanvasPreview.prototype.getBackingContext = function(noSmoothing) {
  return this.surface.getBackingContext({ noSmoothing: noSmoothing === true });
}

UI.CanvasPreview.prototype.dispose = function() {
  if(this.removeDevicePixelRatioListener) {
    this.removeDevicePixelRatioListener();
    this.removeDevicePixelRatioListener = null;
  }
}

UI.PixelArtBlitter = function() {
  this.rasterCanvas = null;
  this.rasterContext = null;
  this.rasterImageData = null;
  this.rasterColumns = null;
}

UI.PixelArtBlitter.prototype.draw = function(context, bounds, image,
  sx, sy, sw, sh, dx, dy, dw, dh) {
    if(sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) {
      return;
    }
    var transform = context.getTransform();
    var scaleX = dw / sw;
    var scaleY = dh / sh;

    // This sampler is for the viewport's axis-aligned positive DPR transform.
    // Preserve native canvas behaviour for other callers and fractional source
    // rectangles, which require filtering rather than discrete pixel reads.
    if(transform.a <= 0 || transform.d <= 0 || transform.b !== 0 || transform.c !== 0
      || !Number.isInteger(sx) || !Number.isInteger(sy)
      || !Number.isInteger(sw) || !Number.isInteger(sh)) {
      context.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
      return;
    }

    var physicalScaleX = scaleX * transform.a;
    var physicalScaleY = scaleY * transform.d;
    var physicalOriginX = transform.e + (dx - sx * scaleX) * transform.a;
    var physicalOriginY = transform.f + (dy - sy * scaleY) * transform.d;
    var epsilon = 1e-9;

    // Integer physical magnification with an integer physical origin has an
    // unambiguous nearest-neighbour result, so retain the zero-readback path.
    if(!bounds && Number.isInteger(physicalScaleX) && Number.isInteger(physicalScaleY)
      && Number.isInteger(physicalOriginX) && Number.isInteger(physicalOriginY)) {
      context.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
      return;
    }

    var sourceLeft = Math.max(0, sx);
    var sourceTop = Math.max(0, sy);
    var sourceRight = Math.min(image.width, sx + sw);
    var sourceBottom = Math.min(image.height, sy + sh);
    var targetCanvas = context.canvas;
    if(!targetCanvas) {
      context.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
      return;
    }
    var targetWidth = targetCanvas.width;
    var targetHeight = targetCanvas.height;
    var left = Math.max(0, Math.ceil(physicalOriginX + sourceLeft * physicalScaleX - 0.5 - epsilon));
    var top = Math.max(0, Math.ceil(physicalOriginY + sourceTop * physicalScaleY - 0.5 - epsilon));
    var right = Math.min(targetWidth,
      Math.ceil(physicalOriginX + sourceRight * physicalScaleX - 0.5 - epsilon));
    var bottom = Math.min(targetHeight,
      Math.ceil(physicalOriginY + sourceBottom * physicalScaleY - 0.5 - epsilon));
    if(bounds) {
      left = Math.max(left,
        Math.ceil(transform.e + bounds.x * transform.a - 0.5 - epsilon));
      top = Math.max(top,
        Math.ceil(transform.f + bounds.y * transform.d - 0.5 - epsilon));
      right = Math.min(right,
        Math.ceil(transform.e + (bounds.x + bounds.width) * transform.a - 0.5 - epsilon));
      bottom = Math.min(bottom,
        Math.ceil(transform.f + (bounds.y + bounds.height) * transform.d - 0.5 - epsilon));
    }
    var width = right - left;
    var height = bottom - top;
    if(width <= 0 || height <= 0) {
      // An offscreen source can still clear the clip in modes such as copy or
      // destination-in. Preserve that native compositing behaviour without reads.
      context.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
      return;
    }

    if(this.rasterCanvas == null) {
      this.rasterCanvas = document.createElement('canvas');
      this.rasterContext = UI.getContextNoSmoothing(this.rasterCanvas);
    }
    if(this.rasterImageData == null || this.rasterCanvas.width != width || this.rasterCanvas.height != height) {
      this.rasterCanvas.width = width;
      this.rasterCanvas.height = height;
      this.rasterImageData = this.rasterContext.createImageData(width, height);
    }
    var output = new Uint32Array(this.rasterImageData.data.buffer);
    if(this.rasterColumns == null || this.rasterColumns.length < width) {
      this.rasterColumns = new Int32Array(width);
    }
    var columns = this.rasterColumns;
    for(var x = 0; x < width; x++) {
      columns[x] = Math.floor((left + x + 0.5 - physicalOriginX) / physicalScaleX + epsilon);
    }
    var readX = columns[0];
    var readWidth = columns[width - 1] - readX + 1;
    var lastSourceY = Math.floor((bottom - 0.5 - physicalOriginY) / physicalScaleY + epsilon);
    var sourceContext = image.getContext('2d');
    var readY = -1;
    var readBottom = -1;
    var previousY = -1;
    var input = null;
    for(var y = 0; y < height; y++) {
      var sourceY = Math.floor((top + y + 0.5 - physicalOriginY) / physicalScaleY + epsilon);
      var row = y * width;
      if(sourceY === previousY) {
        output.copyWithin(row, row - width, row);
        continue;
      }
      // Read only the required source footprint, in bounded row bands. Zooming
      // out must not allocate an ImageData for the entire large source image.
      if(sourceY >= readBottom) {
        readY = sourceY;
        readBottom = Math.min(readY + 64, lastSourceY + 1);
        var pixels = sourceContext.getImageData(readX, readY, readWidth, readBottom - readY);
        input = new Uint32Array(pixels.data.buffer);
      }
      var sourceRow = (sourceY - readY) * readWidth - readX;
      for(var x = 0; x < width; x++) {
        output[row + x] = input[sourceRow + columns[x]];
      }
      previousY = sourceY;
    }
    this.rasterContext.putImageData(this.rasterImageData, 0, 0);
    // The scratch raster is already in backing pixels. Temporarily remove the
    // DPR transform so one integer-positioned blit preserves its exact lattice,
    // as well as the caller's opacity, composite mode and clip.
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(this.rasterCanvas, left, top);
    context.restore();
}

// A display-only preview for intrinsic bitmap sources and vector glyphs. The
// source remains independent of the monitor; only the visible surface follows
// DPR. This keeps small previews from each inventing a sizing and resampling
// policy while leaving export canvases at their document-defined resolution.
UI.GlyphPreview = function(canvas) {
  this.canvas = canvas;
  this.surface = new UI.CanvasSurface(canvas);
  this.pixelArtBlitter = new UI.PixelArtBlitter();
  this.sourceCanvas = null;
  this.lastDraw = null;
  this.cssWidth = 0;
  this.cssHeight = 0;
  var _this = this;
  this.removeDevicePixelRatioListener = UI.onDevicePixelRatioChange(function() {
    if(_this.cssWidth > 0 && _this.cssHeight > 0
      && !_this.surface.isPixelRatioCurrent()) {
      _this.resize(_this.cssWidth, _this.cssHeight);
      _this.redraw();
    }
  });
}

UI.GlyphPreview.prototype.resize = function(cssWidth, cssHeight) {
  this.cssWidth = Number(cssWidth);
  this.cssHeight = Number(cssHeight);
  return this.surface.resize({
    cssWidth: this.cssWidth,
    cssHeight: this.cssHeight,
    pixelRatio: UI.devicePixelRatio
  });
}

UI.GlyphPreview.prototype.getDestinationCssRect = function(args, sourceWidth, sourceHeight) {
  var metrics = this.surface.getMetrics();
  if(!metrics) {
    throw new Error('GlyphPreview must be resized before drawing');
  }
  if(args.destinationCss) {
    return {
      x: args.destinationCss.x,
      y: args.destinationCss.y,
      width: args.destinationCss.width,
      height: args.destinationCss.height
    };
  }

  var scale = Math.min(metrics.cssWidth / sourceWidth, metrics.cssHeight / sourceHeight);
  if(args.fit == 'integer-contain') {
    scale = scale >= 1 ? Math.floor(scale) : scale;
  }
  if(typeof args.scale == 'number' && isFinite(args.scale) && args.scale > 0) {
    scale = args.scale;
  }
  var widthCss = sourceWidth * scale;
  var heightCss = sourceHeight * scale;
  return {
    x: (metrics.cssWidth - widthCss) / 2,
    y: (metrics.cssHeight - heightCss) / 2,
    width: widthCss,
    height: heightCss
  };
}

UI.GlyphPreview.prototype.getDestinationRect = function(args, sourceWidth, sourceHeight) {
  var metrics = this.surface.getMetrics();
  var cssRect = this.getDestinationCssRect(args, sourceWidth, sourceHeight);
  return metrics.backingRect(cssRect.x, cssRect.y, cssRect.width, cssRect.height);
}

UI.GlyphPreview.prototype.prepareContext = function(backgroundColor) {
  var metrics = this.surface.getMetrics();
  var context = this.surface.getBackingContext({ noSmoothing: true });
  context.clearRect(0, 0, metrics.backingWidth, metrics.backingHeight);
  if(backgroundColor !== false && typeof backgroundColor != 'undefined') {
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, metrics.backingWidth, metrics.backingHeight);
  }
  return context;
}

UI.GlyphPreview.prototype.drawBitmap = function(args) {
  if(!args || !args.sourceCanvas || args.sourceCanvas.width <= 0 || args.sourceCanvas.height <= 0) {
    return false;
  }
  this.lastDraw = { type: 'bitmap', args: args };
  var sourceX = typeof args.sourceX == 'number' ? args.sourceX : 0;
  var sourceY = typeof args.sourceY == 'number' ? args.sourceY : 0;
  var sourceWidth = typeof args.sourceWidth == 'number' ? args.sourceWidth : args.sourceCanvas.width;
  var sourceHeight = typeof args.sourceHeight == 'number' ? args.sourceHeight : args.sourceCanvas.height;
  var destination = this.getDestinationRect(args, sourceWidth, sourceHeight);
  var context = this.prepareContext(args.backgroundColor);
  this.pixelArtBlitter.draw(context, false, args.sourceCanvas,
    sourceX, sourceY, sourceWidth, sourceHeight,
    destination.x, destination.y, destination.width, destination.height);
  return true;
}

UI.GlyphPreview.prototype.drawVector = function(args) {
  if(!args || typeof args.draw != 'function' || args.sourceWidth <= 0 || args.sourceHeight <= 0) {
    return false;
  }
  this.lastDraw = { type: 'vector', args: args };
  var metrics = this.surface.getMetrics();
  var destinationCss = this.getDestinationCssRect(args, args.sourceWidth, args.sourceHeight);
  var destination = {
    x: destinationCss.x * metrics.pixelRatio,
    y: destinationCss.y * metrics.pixelRatio,
    width: destinationCss.width * metrics.pixelRatio,
    height: destinationCss.height * metrics.pixelRatio
  };
  var context = this.prepareContext(args.backgroundColor);
  args.draw({
    canvas: this.canvas,
    context: context,
    x: destination.x,
    y: destination.y,
    width: destination.width,
    height: destination.height,
    scale: Math.min(destination.width / args.sourceWidth,
      destination.height / args.sourceHeight)
  });
  return true;
}

UI.GlyphPreview.prototype.drawTile = function(args) {
  if(!args || !args.tileSet) {
    return false;
  }
  var tileSet = args.tileSet;
  var tileWidth = tileSet.getTileWidth();
  var tileHeight = tileSet.getTileHeight();
  var drawArgs = {};
  for(var key in args) {
    if(args.hasOwnProperty(key)
      && key != 'tileSet'
      && key != 'backgroundColor'
      && key != 'fit'
      && key != 'scale'
      && key != 'vector'
      && key != 'destinationCss') {
      drawArgs[key] = args[key];
    }
  }
  drawArgs.character = args.character;
  drawArgs.select = false;
  drawArgs.highlight = false;
  drawArgs.backgroundIsTransparent = true;

  var isVector = (typeof tileSet.getType == 'function' && tileSet.getType() == 'vector')
    || args.vector === true;
  if(isVector) {
    return this.drawVector({
      sourceWidth: tileWidth,
      sourceHeight: tileHeight,
      fit: args.fit,
      scale: args.scale,
      destinationCss: args.destinationCss,
      backgroundColor: args.backgroundColor,
      draw: function(destination) {
        drawArgs.x = destination.x / destination.scale;
        drawArgs.y = destination.y / destination.scale;
        drawArgs.scale = destination.scale;
        drawArgs.context = destination.context;
        tileSet.drawCharacter(drawArgs);
      }
    });
  }

  if(!this.sourceCanvas) {
    this.sourceCanvas = document.createElement('canvas');
  }
  if(this.sourceCanvas.width != tileWidth) {
    this.sourceCanvas.width = tileWidth;
  }
  if(this.sourceCanvas.height != tileHeight) {
    this.sourceCanvas.height = tileHeight;
  }
  var sourceContext = UI.getContextNoSmoothing(this.sourceCanvas);
  sourceContext.clearRect(0, 0, tileWidth, tileHeight);
  var imageData = sourceContext.getImageData(0, 0, tileWidth, tileHeight);
  drawArgs.x = 0;
  drawArgs.y = 0;
  drawArgs.scale = 1;
  drawArgs.imageData = imageData;
  drawArgs.context = sourceContext;
  tileSet.drawCharacter(drawArgs);
  sourceContext.putImageData(imageData, 0, 0);
  return this.drawBitmap({
    sourceCanvas: this.sourceCanvas,
    fit: args.fit,
    scale: args.scale,
    destinationCss: args.destinationCss,
    backgroundColor: args.backgroundColor
  });
}

UI.GlyphPreview.prototype.redraw = function() {
  if(!this.lastDraw) {
    return false;
  }
  var lastDraw = this.lastDraw;
  if(lastDraw.type == 'bitmap') {
    return this.drawBitmap(lastDraw.args);
  }
  return this.drawVector(lastDraw.args);
}

UI.GlyphPreview.prototype.clear = function() {
  this.lastDraw = null;
  var metrics = this.surface.getMetrics();
  if(metrics) {
    this.surface.getBackingContext().clearRect(0, 0,
      metrics.backingWidth, metrics.backingHeight);
  }
}

UI.GlyphPreview.prototype.dispose = function() {
  if(this.removeDevicePixelRatioListener) {
    this.removeDevicePixelRatioListener();
    this.removeDevicePixelRatioListener = null;
  }
  this.lastDraw = null;
  this.sourceCanvas = null;
}
