var BlockSetManager = function() {
  this.currentBlockSetId = false;
  this.currentBlockSet = null;
  this.blockSets = {};

  this.blockSizeDialog = null;
  this.blockSizeDialogDocument = null;
  this.blockSizeDialogGeneration = undefined;
}

BlockSetManager.prototype = {

  init: function(editor) {
    this.editor = editor;
  },

  // Block sets are cached by path, but the same path is valid in every
  // project. Drop both the cache and the selected object at the project
  // boundary so a retained layer/tool cannot resolve records in the next
  // document.
  resetProjectState: function() {
    this.currentBlockSetId = false;
    this.currentBlockSet = null;
    this.blockSets = {};
    this.blockSet = null;
    this.blockSizeDialogCallback = null;
    this.blockSizeDialogDocument = null;
    this.blockSizeDialogGeneration = undefined;
  },

  captureBlockSizeDialogProject: function() {
    this.blockSizeDialogDocument = typeof g_app != 'undefined' ? g_app.doc : null;
    this.blockSizeDialogGeneration = typeof g_app != 'undefined' ? g_app.projectGeneration : undefined;
  },

  isCurrentBlockSizeDialogProject: function() {
    if(!this.blockSizeDialogDocument || typeof g_app == 'undefined') {
      return false;
    }
    if(typeof g_app.isCurrentProject == 'function') {
      return g_app.isCurrentProject(this.blockSizeDialogDocument, this.blockSizeDialogGeneration);
    }
    return g_app.doc === this.blockSizeDialogDocument;
  },

  initBlockSizeDialogContent: function() {
    var layer = this.editor.layers.getSelectedLayerObject();
    var blockWidth = 2;
    var blockHeight = 2;

    this.blockSet = this.editor.blockSetManager.getCurrentBlockSet();
    if(layer && layer.getType() == 'grid') {
      blockWidth = layer.getBlockWidth();
      blockHeight = layer.getBlockHeight();
    }

    $('#settingsBlockWidth').val(blockWidth);
    $('#settingsBlockHeight').val(blockHeight);
    $('#settingsBlockWidth, #settingsBlockHeight').removeAttr('aria-invalid');
    $('#settingsBlockWidthError, #settingsBlockHeightError').hide().text('');

    var colorPerMode = this.editor.getColorPerMode();

    if(colorPerMode === 'cell') {
      colorPerMode = 'block';
    }

    $('#settingsBlockColorMode').val(colorPerMode);
  },

  initBlockSizeDialog: function() {
    var _this = this;
    this.captureBlockSizeDialogProject();
    var projectDocument = this.blockSizeDialogDocument;
    var projectGeneration = this.blockSizeDialogGeneration;

    this.blockSizeDialog = UI.create("UI.Dialog", { "id": "blockSizeDialog", "title": styles.text.blockName + " Size", "width": 280, "height": 168 });

    this.blockSizeHTML = UI.create("UI.HTMLPanel");
    this.blockSizeDialog.add(this.blockSizeHTML);
    this.blockSizeHTML.load('html/textMode/blockSizeDialog.html', function() {
      if(!projectDocument || (typeof g_app.isCurrentProject == 'function' &&
          !g_app.isCurrentProject(projectDocument, projectGeneration))) {
        return;
      }
      _this.initBlockSizeDialogContent();
      UI.showDialog("blockSizeDialog");

    });

    this.okButton = UI.create('UI.Button', { "text": "OK", "color": "primary" });
    this.blockSizeDialog.addButton(this.okButton);
    this.okButton.on('click', function(event) {
      if(!_this.isCurrentBlockSizeDialogProject()) {
        UI.closeDialog();
        return;
      }
      var dimensions = _this.validateBlockDimensions(
        $('#settingsBlockWidth').val(), $('#settingsBlockHeight').val()
      );
      _this.showBlockDimensionErrors(dimensions);
      if(!dimensions.valid) {
        $(dimensions.firstInvalidSelector).focus();
        return;
      }
      var width = dimensions.width;
      var height = dimensions.height;
      var colorMode = $('#settingsBlockColorMode').val();

      if(typeof _this.blockSizeDialogCallback == 'function' &&
          _this.blockSizeDialogCallback(width, height, colorMode) === false) {
        return;
      }

      UI.closeDialog();
    });

    this.closeButton = UI.create('UI.Button', { "text": "Cancel", "color": "secondary" });
    this.blockSizeDialog.addButton(this.closeButton);
    this.closeButton.on('click', function(event) {
      UI.closeDialog();
    });
  },

  validateBlockDimensions: function(width, height) {
    var result = {
      valid: true,
      width: Number(width),
      height: Number(height),
      errors: {},
      firstInvalidSelector: null
    };
    var fields = [
      { name: 'width', selector: '#settingsBlockWidth', label: 'MetaTile width' },
      { name: 'height', selector: '#settingsBlockHeight', label: 'MetaTile height' }
    ];
    for(var i = 0; i < fields.length; i++) {
      var field = fields[i];
      var value = result[field.name];
      if(!Number.isFinite(value) || !Number.isInteger(value) || value < 1 || value > 64) {
        result.valid = false;
        result.errors[field.selector] = field.label + ' must be a whole number from 1 to 64.';
        if(result.firstInvalidSelector == null) {
          result.firstInvalidSelector = field.selector;
        }
      }
    }
    return result;
  },

  showBlockDimensionErrors: function(validation) {
    var selectors = ['#settingsBlockWidth', '#settingsBlockHeight'];
    for(var i = 0; i < selectors.length; i++) {
      var selector = selectors[i];
      if(validation.errors[selector]) {
        $(selector).attr('aria-invalid', 'true');
        $(selector + 'Error').text(validation.errors[selector]).show();
      } else {
        $(selector).removeAttr('aria-invalid');
        $(selector + 'Error').hide().text('');
      }
    }
  },


  showBlockSizeDialog: function(callback) {
    this.captureBlockSizeDialogProject();
    this.blockSizeDialogCallback = callback;
    if(this.blockSizeDialog == null) {
      this.initBlockSizeDialog();
    } else {
      if(!this.isCurrentBlockSizeDialogProject()) {
        return;
      }
      this.initBlockSizeDialogContent();
      UI.showDialog("blockSizeDialog");

    }
  },

  checkBlockMode: function(width, height) {
    var dimensions = this.validateBlockDimensions(width, height);
    if(!dimensions.valid) {
      return false;
    }
    width = dimensions.width;
    height = dimensions.height;
    // check blockset is compatible with block mode..
    var blockSet = this.getCurrentBlockSet();

    if(!blockSet) {
      console.log("NO BLOCK SET!!!");
      return false;
    }

    var blockCount = blockSet.getBlockCount();

    if(blockCount === 0) {
      console.log("CREATING A BLOCK");
      // need to create a block
      var t = this.editor.tileSetManager.blankCharacter;
      var fc = this.editor.currentTile.getColor();
      var bc = this.editor.colorPaletteManager.noColor;

      var data = [];
      for(var y = 0; y < height; y++) {
        data[y] = [];
        for(var x = 0; x < width; x++) {
          data[y].push({ fc: fc, bc: bc, t: t });

        }
      }

      var blockId = blockSet.createBlock({ bc: bc, fc: fc, data: data });
      this.editor.graphic.initFrameBlocks(blockId);

      this.editor.tools.drawTools.blockPalette.selectBlock();
      this.editor.sideBlockPalette.selectBlock();


      return true;
    } else {
      // are the blocks the wrong size?
      var blocks = blockSet.getBlocks();
      var sizeOk = true;
      for(var i = 0; i < blocks.length; i++) {
        if(blocks[i].data.length != height || blocks[i].data[0].length != width) {

          sizeOk = false;
          break;
        }
      }

      if(!sizeOk) {
        if(confirm('Not all blocks are the correct size, proceeding will resize them. Proceed?')) {
          for(var i = 0; i < blocks.length; i++) {
            if(blocks[i].data.length != height || blocks[i].data[0].length != width) {
              blockSet.setBlockDimensions(i, width, height);
            }
          }
          this.editor.graphic.initFrameBlocks(0);
          this.editor.tools.drawTools.blockPalette.selectBlock();
          this.editor.sideBlockPalette.selectBlock();

          return true;


        } else {
          return false;
        }
      }
    }

    return true;
  },


  createBlockSet: function(args) {
    args = args || {};
    var document = args.document || g_app.doc;
    if(!document) {
      return null;
    }
    var width = 2;
    var height = 2;
    var name = 'Block Set';
    console.error("shoulnd't get here...");

    if(typeof args.width != 'undefined') {
      width = args.width;
    }

    if(typeof args.height != 'undefined') {
      height = args.height;
    }

    if(typeof args.name != 'undefined') {
      name = args.name;
    }

    var blockSet = document.createDocRecord("/block sets", name, "block set", { width: width, height: height, blocks: [] });
    
    this.currentBlockSetId = blockSet.id;
    return blockSet;
  },

  setCurrentBlockSetFromId: function(blockSetId, document) {
    console.error('set current block set from id!!!');
    document = document || g_app.doc;
    if(!document) {
      return;
    }
    var blockSet = document.getDocRecordById(blockSetId, "/block sets");
    if(blockSet != null) {

      if(this.currentBlockSet == null) {
        this.currentBlockSet = new BlockSet();
      }
      console.log('set current block size to ' + blockSetId);
      this.currentBlockSetId = blockSetId;
      this.currentBlockSet.init(this.editor, '/block sets/' + blockSet.name, document);
    }


  },


  getCurrentBlockSet: function() {

    // maybe cache it?

    
    var tileSet = this.editor.tileSetManager.getCurrentTileSet();
    if(!tileSet) {
      return null;
    }
    var path = tileSet.getPath();
    var document = tileSet.document || g_app.doc;
    if(!document || (g_app.isCurrentProject && !g_app.isCurrentProject(document))) {
      return null;
    }


    var blockSetsPath = path + '/block sets';
    var blockSets = document.getDocRecord(blockSetsPath);
    if(!blockSets) {
      blockSets = document.createDocRecord(path, 'block sets', 'folder', {});
    }


//console.log(blockSets);

    var name = 'block set';
    var blockSetPath = blockSetsPath + '/' + name;
    var blockSet = document.getDocRecord(blockSetPath);
    if(!blockSet) {
      blockSet = document.createDocRecord(blockSetsPath, name, "block set", {  blocks: [] })
    }

//console.log(blockSet);

    return this.getBlockSet(blockSetPath, document);

  },


  getBlockSet: function(path, document) {

    // should be id in case path changes??

    document = document || g_app.doc;
    if(!document) {
      return null;
    }

    if(this.blockSets.hasOwnProperty(path)) {
      var cachedBlockSet = this.blockSets[path];
      if(cachedBlockSet.document === document) {
        return cachedBlockSet;
      }
      delete this.blockSets[path];
    }

    // create it in the doc if not exists
    var blockSet = document.getDocRecord(path);
    if(!blockSet) {
      var lastSlash = path.lastIndexOf('/');
      var blockSetsPath = path.substring(0, lastSlash);
      var name = path.substring(lastSlash + 1);
      console.log('create ' + blockSetsPath + ' - ' + name);

      var blockSets = document.getDocRecord(blockSetsPath);
      if(!blockSets) {
        var lastSlash = blockSetsPath.lastIndexOf('/');
        var tileSetPath = blockSetsPath.substring(0, lastSlash);

        blockSets = document.createDocRecord(tileSetPath, 'block sets', 'folder', {});
      }

      blockSet = document.createDocRecord(blockSetsPath, name, "block set", {  blocks: [] })
    }


    var blockSet = new BlockSet();
    blockSet.init(this.editor, path, document);
    this.blockSets[path] = blockSet;
    return blockSet;

  },


  getBlockSetOld: function(blockSetId, document) {

    if(blockSetId === false) {
      return null;
    }


    document = document || g_app.doc;
    if(!document || (g_app.isCurrentProject && !g_app.isCurrentProject(document))) {
      return null;
    }

    var blockSet = document.getDocRecordById(blockSetId, "/block sets");
    if(blockSet != null) {

      if(this.currentBlockSet == null) {
        this.currentBlockSet = new BlockSet();
      }

      if(this.currentBlockSet.getId() != blockSetId) {
        this.currentBlockSet.init(this.editor, '/block sets/' + blockSet.name, document);
      }

      return this.currentBlockSet;
    }

    return null;

/*
    if(this.blockSets.hasOwnProperty(blockSetId)) {
      return this.blockSets[blockSetId];
    }

    var blockSet = new BlockSet();
    blockSet.init(this.editor, blockSetId);
    this.blockSets[blockSetId] = blockSet;

    return blockSet;
*/

  }
}
