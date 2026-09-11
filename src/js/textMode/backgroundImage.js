var BackgroundImage = function() {
  this.editor = null;

  this.scale = 1;
  this.canvas = null;
  this.context = null;

  this.bgImage = null;

  this.x = 0;
  this.y = 0;
  this.drawWidth = 0;
  this.drawHeight = 0;

  this.projectDocument = null;
  this.projectGeneration = undefined;
  this.objectURL = null;

}


BackgroundImage.prototype = {


  init: function(editor) {
    this.editor = editor;
  },

  captureProjectContext: function() {
    this.projectDocument = g_app.doc;
    this.projectGeneration = g_app.projectGeneration;
  },

  isCurrentProject: function(projectContext) {
    var document = projectContext ? projectContext.document : this.projectDocument;
    var generation = projectContext ? projectContext.generation : this.projectGeneration;
    return !!document && (!g_app.isCurrentProject ||
      g_app.isCurrentProject(document, generation));
  },

  releaseDraftObjectURL: function() {
    if(this.objectURL && window.URL && typeof window.URL.revokeObjectURL == 'function') {
      window.URL.revokeObjectURL(this.objectURL);
    }
    this.objectURL = null;
  },

  initializeDraft: function() {
    this.releaseDraftObjectURL();
    var applied = this.editor.grid && typeof this.editor.grid.getBackgroundImage == 'function'
      ? this.editor.grid.getBackgroundImage()
      : null;
    this.bgImage = applied ? applied.image : null;
    this.x = applied ? applied.x : 0;
    this.y = applied ? applied.y : 0;
    this.drawWidth = applied ? applied.drawWidth : 0;
    this.drawHeight = applied ? applied.drawHeight : 0;
    this.scale = 100;
    if(applied && this.bgImage) {
      var baseSize = this.getBaseDrawSize(this.bgImage);
      if(baseSize.width > 0) {
        this.scale = applied.drawWidth / baseSize.width * 100;
      }
    }
  },

  discardDraft: function() {
    this.releaseDraftObjectURL();
    this.bgImage = null;
    this.x = 0;
    this.y = 0;
    this.drawWidth = 0;
    this.drawHeight = 0;
    if(this.okButton) {
      this.okButton.setEnabled(false);
    }
  },

  resetProjectState: function() {
    this.projectDocument = null;
    this.projectGeneration = undefined;
    this.releaseDraftObjectURL();
    this.bgImage = null;
    this.x = 0;
    this.y = 0;
    this.drawWidth = 0;
    this.drawHeight = 0;
    this.context = null;
  },


  start: function() {
    var _this = this;
    this.captureProjectContext();
    this.initializeDraft();
    var projectContext = {
      document: this.projectDocument,
      generation: this.projectGeneration
    };

    if(this.uiComponent == null) {
      this.uiComponent = UI.create("UI.Dialog", { "id": "backgroundImageDialog", "title": "Background Image", "width": 640 });

      this.htmlComponent = UI.create("UI.HTMLPanel");
      this.uiComponent.add(this.htmlComponent);
      this.htmlComponent.load('html/textMode/backgroundImage.html', function() {
        if(!_this.isCurrentProject(projectContext)) {
          return;
        }
        _this.initContent();
        _this.initEvents();
      });

      this.okButton = UI.create('UI.Button', { "text": "OK", "enabled": false });
      this.uiComponent.addButton(this.okButton);
      this.okButton.on('click', function(event) {
        if(_this.setBackgroundImage()) {
          UI.closeDialog();
          _this.discardDraft();
        }
      });

      this.closeButton = UI.create('UI.Button', { "text": "Cancel" });
      this.uiComponent.addButton(this.closeButton);
      this.closeButton.on('click', function(event) {
        UI.closeDialog();
        _this.discardDraft();
      });
      this.uiComponent.on('close', function() {
        _this.discardDraft();
      });
    } else {
      this.initContent();
    }

    UI.showDialog("backgroundImageDialog");
  },  


  initContent: function() {
    console.log('setup canvas!!!');
    var tileSet = this.editor.tileSetManager.getCurrentTileSet();

    if(!this.canvas) {
      this.canvas = document.getElementById('bgImageCanvas');
    }

    this.canvas.width = tileSet.charWidth * this.editor.grid.width;
    this.canvas.height = tileSet.charHeight * this.editor.grid.height;

    this.context = this.canvas.getContext("2d");
    this.context.imageSmoothingEnabled = false;
    this.context.webkitImageSmoothingEnabled = false;
    this.context.mozImageSmoothingEnabled = false;
    this.context.msImageSmoothingEnabled = false;
    this.context.oImageSmoothingEnabled = false;

    $('#bgImageSourceFile').val('');
    $('#bgImageX').val(this.x);
    $('#bgImageY').val(this.y);
    $('#bgImageScale').val(Math.round(this.scale * 100) / 100);
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if(this.bgImage) {
      this.showImage();
    } else if(this.okButton) {
      this.okButton.setEnabled(false);
    }


  },

  initEvents: function() {
    var _this = this;



    var mouseDownAtX = 0;
    var mouseDownAtY = 0;
    var mouseDown = false;
    var currentOffsetX = 0;
    var currentOffsetY = 0;

    $('#bgImageX').on('input change', function() {
      _this.showImage();
    });

    $('#bgImageY').on('input change', function() {
      _this.showImage();
    });

    $('#bgImageScale').on('input change', function() {
      _this.showImage();
    });

    $('#bgImageCanvas').on('mousedown', function(e) {
      mouseDownAtX = e.clientX;
      mouseDownAtY = e.clientY;
      currentOffsetX = parseInt($('#bgImageX').val());
      currentOffsetY = parseInt($('#bgImageY').val());

      mouseDown = true;
    });

    $('#bgImageCanvas').on('mousemove', function(e) {
      if(mouseDown) {
        var x = e.clientX;
        var y = e.clientY;

        var diffX = x - mouseDownAtX;
        var diffY = y - mouseDownAtY;

        var newOffsetX = currentOffsetX + diffX;
        $('#bgImageX').val(newOffsetX);

        var newOffsetY = currentOffsetY + diffY;
        $('#bgImageY').val(newOffsetY);

        _this.showImage();        
      }
    });

    $('#bgImageCanvas').on('mouseup', function(e) {
//      console.log(e);
      mouseDown = false;
    });

    $('#bgImageScaleDecrease').on('click', function() {
      var scale = parseInt($('#bgImageScale').val());
      scale -= 5;
      if(scale > 0) {
        $('#bgImageScale').val(scale);
      }
      _this.showImage();        

    });

    $('#bgImageScaleIncrease').on('click', function() {
      var scale = parseInt($('#bgImageScale').val());
      scale += 5;
      if(scale > 0) {
        $('#bgImageScale').val(scale);
      }
      _this.showImage();        

    });


    document.getElementById('bgImageSourceFile').addEventListener("change", function(e) {
      var file = document.getElementById('bgImageSourceFile').files[0];
      _this.chooseImage(file);
    });


  },


  setBackgroundImage: function() {
    if(!this.showImage() || !this.hasValidDraft()) {
      return false;
    }
    return this.editor.grid.setBackgroundImage(
      this.bgImage, this.x, this.y, this.drawWidth, this.drawHeight
    );
  },

  chooseImage: function(file) {
    if(!file) {
      return;
    }
    this.captureProjectContext();
    this.releaseDraftObjectURL();
    this.bgImage = new Image();
    this.drawWidth = 0;
    this.drawHeight = 0;
    if(this.okButton) {
      this.okButton.setEnabled(false);
    }

//    this.initCanvas();


    var url = window.URL || window.webkitURL;
    var src = url.createObjectURL(file);
    this.objectURL = src;
    this.bgImage.src = src;

    var _this = this;
    this.bgImage.onload = function() {
      if(!_this.isCurrentProject()) {
        return;
      }
      _this.showImage();
    }
    this.bgImage.onerror = function() {
      _this.drawWidth = 0;
      _this.drawHeight = 0;
      if(_this.okButton) {
        _this.okButton.setEnabled(false);
      }
    };
  },

  getBaseDrawSize: function(image) {
    var naturalWidth = Number(image && image.naturalWidth);
    var naturalHeight = Number(image && image.naturalHeight);
    if(!Number.isFinite(naturalWidth) || naturalWidth <= 0 ||
        !Number.isFinite(naturalHeight) || naturalHeight <= 0) {
      return { width: 0, height: 0 };
    }
    var fitScale = Math.min(1, 320 / naturalWidth, 200 / naturalHeight);
    return {
      width: naturalWidth * fitScale,
      height: naturalHeight * fitScale
    };
  },

  hasValidDraft: function() {
    return !!this.bgImage && Number(this.bgImage.naturalWidth) > 0 &&
      Number(this.bgImage.naturalHeight) > 0 && Number.isFinite(this.x) &&
      Number.isFinite(this.y) && Number.isFinite(this.drawWidth) &&
      this.drawWidth > 0 && Number.isFinite(this.drawHeight) && this.drawHeight > 0;
  },


  showImage: function() {

    if(!this.isCurrentProject() || !this.bgImage || !this.context) {
      return;
    }

    var baseSize = this.getBaseDrawSize(this.bgImage);
    var drawWidth = baseSize.width;
    var drawHeight = baseSize.height;
    var scaleValue = $('#bgImageScale').val();
    var xValue = $('#bgImageX').val();
    var yValue = $('#bgImageY').val();
    var scale = Number(scaleValue);

    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.x = Number(xValue);
    this.y = Number(yValue);
    if((typeof scaleValue == 'string' && scaleValue.trim() == '') ||
        (typeof xValue == 'string' && xValue.trim() == '') ||
        (typeof yValue == 'string' && yValue.trim() == '') ||
        !Number.isFinite(scale) || scale <= 0 || scale > 10000 ||
        !Number.isFinite(this.x) || !Number.isFinite(this.y) ||
        drawWidth <= 0 || drawHeight <= 0) {
      this.drawWidth = 0;
      this.drawHeight = 0;
      if(this.okButton) {
        this.okButton.setEnabled(false);
      }
      return false;
    }


  //  console.log('scale = ' + scale);
    drawWidth = drawWidth * scale / 100;
    drawHeight = drawHeight * scale / 100;

    this.drawWidth = drawWidth;
    this.drawHeight = drawHeight;

//    console.log('x = ' + x + 'y = ' + y);

    this.context.drawImage(this.bgImage, this.x, this.y, this.drawWidth, this.drawHeight);
    if(this.okButton) {
      this.okButton.setEnabled(true);
    }
    return true;


  },

}
