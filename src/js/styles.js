var ShortcutCatalogMetadata = (function() {
  var textTools = Object.freeze([
    Object.freeze({ id: 'textMode.tool.pencil', title: 'Pencil', key: 'N', tile: 'pen', pixel: 'pen' }),
    Object.freeze({ id: 'textMode.tool.erase', title: 'Eraser', key: 'L', tile: 'erase', pixel: 'erase' }),
    Object.freeze({ id: 'textMode.tool.fill', title: 'Fill Bucket', key: 'K', tile: 'fill', pixel: 'fill' }),
    Object.freeze({ id: 'textMode.tool.eyedropper', title: 'Eyedropper', key: 'I', tile: 'eyedropper', pixel: 'eyedropper' }),
    Object.freeze({ id: 'textMode.tool.marquee', title: 'Marquee', key: 'M', tile: 'select', pixel: 'select' }),
    Object.freeze({ id: 'textMode.tool.shape', title: 'Cycle Shape Tool', key: 'U', tile: 'shape', pixel: 'shape' }),
    Object.freeze({ id: 'textMode.tool.zoom', title: 'Zoom Tool', key: 'Z', tile: 'zoom', pixel: 'zoom' }),
    Object.freeze({ id: 'textMode.tool.hand', title: 'Hand Tool', key: 'H', tile: 'hand', pixel: 'hand' }),
    Object.freeze({ id: 'textMode.tool.move', title: 'Move Tool', key: 'V', tile: 'move', pixel: 'move' }),
    Object.freeze({ id: 'textMode.tool.pixel', title: 'Pixel Tool', key: 'P', tile: 'pixel' }),
    Object.freeze({ id: 'textMode.tool.characterPixel', title: 'Character Pixel Tool', key: 'O', tile: 'charpixel' }),
    Object.freeze({ id: 'textMode.tool.type', title: 'Type Tool', key: 'T', tile: 'type' }),
    Object.freeze({ id: 'textMode.tool.block', title: 'Meta Tile Tool', key: 'B', tile: 'block' })
  ]);

  var pixelSubtools = Object.freeze([
    Object.freeze({ id: 'textMode.pixelTool.draw', title: 'Pixel Pencil', key: 'N', modifiers: Object.freeze({ shift: true }), tool: 'draw' }),
    Object.freeze({ id: 'textMode.pixelTool.erase', title: 'Pixel Eraser', key: 'L', modifiers: Object.freeze({ shift: true }), tool: 'erase' }),
    Object.freeze({ id: 'textMode.pixelTool.eyedropper', title: 'Pixel Eyedropper', key: 'I', modifiers: Object.freeze({ shift: true }), tool: 'eyedropper' }),
    Object.freeze({ id: 'textMode.pixelTool.select', title: 'Pixel Marquee', key: 'M', modifiers: Object.freeze({ shift: true }), tool: 'select' }),
    Object.freeze({ id: 'textMode.pixelTool.shape', title: 'Cycle Pixel Shape Tool', key: 'U', modifiers: Object.freeze({ shift: true }), tool: 'shape' })
  ]);

  var paletteTools = Object.freeze([
    Object.freeze({ id: 'colorPalette.tool.pencil', title: 'Pencil', key: 'N', tool: 'pen' }),
    Object.freeze({ id: 'colorPalette.tool.erase', title: 'Eraser', key: 'L', tool: 'erase' }),
    Object.freeze({ id: 'colorPalette.tool.eyedropper', title: 'Eyedropper', key: 'I', tool: 'eyedropper' }),
    Object.freeze({ id: 'colorPalette.tool.move', title: 'Move Tool', key: 'V', tool: 'move' }),
    Object.freeze({ id: 'colorPalette.tool.marquee', title: 'Marquee', key: 'M', tool: 'select' })
  ]);

  var aliases = Object.freeze({
    'draw.pen': Object.freeze({ commandId: 'textMode.tool.pencil' }),
    'draw.erase': Object.freeze({ commandId: 'textMode.tool.erase', label: 'Blank' }),
    'draw.fill': Object.freeze({ commandId: 'textMode.tool.fill' }),
    'draw.eyedropper': Object.freeze({ commandId: 'textMode.tool.eyedropper' }),
    'draw.line': Object.freeze({ commandId: 'textMode.tool.shape', label: 'Line' }),
    'draw.rect': Object.freeze({ commandId: 'textMode.tool.shape', label: 'Rect' }),
    'draw.oval': Object.freeze({ commandId: 'textMode.tool.shape', label: 'Oval' }),
    'draw.select': Object.freeze({ commandId: 'textMode.tool.marquee' }),
    'draw.charpixel': Object.freeze({ commandId: 'textMode.tool.characterPixel', label: 'Char Pixel' }),
    'draw.type': Object.freeze({ commandId: 'textMode.tool.type', label: 'Type' }),
    'draw.pixel': Object.freeze({ commandId: 'textMode.tool.pixel', label: 'Pixel' }),
    'draw.block': Object.freeze({ commandId: 'textMode.tool.block', label: 'Meta Tile' }),
    'draw.zoom': Object.freeze({ commandId: 'textMode.tool.zoom', label: 'Zoom' }),
    'draw.hand': Object.freeze({ commandId: 'textMode.tool.hand', label: 'Hand' }),
    'draw.move': Object.freeze({ commandId: 'textMode.tool.move', label: 'Move' }),
    'draw.pixelzoom': Object.freeze({ commandId: 'textMode.tool.zoom', label: 'Zoom' }),
    'draw.pixelhand': Object.freeze({ commandId: 'textMode.tool.hand', label: 'Hand' }),
    'draw.pixelmove': Object.freeze({ commandId: 'textMode.tool.move', label: 'Move' }),
    'pixelMode.pen': Object.freeze({ commandId: 'textMode.tool.pencil', label: 'Pencil' }),
    'pixelMode.erase': Object.freeze({ commandId: 'textMode.tool.erase', label: 'Blank' }),
    'pixelMode.fill': Object.freeze({ commandId: 'textMode.tool.fill' }),
    'pixelMode.eyedropper': Object.freeze({ commandId: 'textMode.tool.eyedropper' }),
    'pixelMode.line': Object.freeze({ commandId: 'textMode.tool.shape', label: 'Line' }),
    'pixelMode.rect': Object.freeze({ commandId: 'textMode.tool.shape', label: 'Rect' }),
    'pixelMode.oval': Object.freeze({ commandId: 'textMode.tool.shape', label: 'Oval' }),
    'pixelMode.pixelselect': Object.freeze({ commandId: 'textMode.tool.marquee' }),
    'pixelMode.charpixel': Object.freeze({ commandId: null, label: 'Char Pixel', shortcut: 'O' }),
    'pixelMode.type': Object.freeze({ commandId: null, label: 'Type', shortcut: 'T' }),
    'pixelMode.pixel': Object.freeze({ commandId: null, label: 'Pixel', shortcut: 'P' }),
    'pixelMode.block': Object.freeze({ commandId: null, label: 'Block', shortcut: 'B' }),
    'pixelMode.zoom': Object.freeze({ commandId: 'textMode.tool.zoom', label: 'Zoom' }),
    'pixelMode.hand': Object.freeze({ commandId: 'textMode.tool.hand', label: 'Hand' }),
    'pixelMode.move': Object.freeze({ commandId: 'textMode.tool.move', label: 'Move' }),
    'pixel.draw': Object.freeze({ commandId: 'textMode.pixelTool.draw', label: 'Pencil' }),
    'pixel.pen': Object.freeze({ commandId: 'textMode.pixelTool.draw', label: 'Pencil' }),
    'pixel.erase': Object.freeze({ commandId: 'textMode.pixelTool.erase', label: 'Blank' }),
    'pixel.fill': Object.freeze({ commandId: null, label: 'Fill Bucket', shortcut: 'Shift+K' }),
    'pixel.eyedropper': Object.freeze({ commandId: 'textMode.pixelTool.eyedropper', label: 'Eyedropper' }),
    'pixel.line': Object.freeze({ commandId: 'textMode.pixelTool.shape', label: 'Line' }),
    'pixel.rect': Object.freeze({ commandId: 'textMode.pixelTool.shape', label: 'Rect' }),
    'pixel.oval': Object.freeze({ commandId: 'textMode.pixelTool.shape', label: 'Oval' }),
    'pixel.select': Object.freeze({ commandId: 'textMode.pixelTool.select', label: 'Marquee' }),
    'pixel.charpixel': Object.freeze({ commandId: null, label: 'Char Pixel', shortcut: 'Shift+O' }),
    'pixel.type': Object.freeze({ commandId: null, label: 'Type', shortcut: 'Shift+T' }),
    'pixel.pixel': Object.freeze({ commandId: null, label: 'Pixel', shortcut: 'Shift+P' }),
    'pixel.block': Object.freeze({ commandId: null, label: 'Block', shortcut: 'Shift+B' }),
    'pixel.zoom': Object.freeze({ commandId: null, label: 'Zoom', shortcut: 'Shift+Z' }),
    'pixel.hand': Object.freeze({ commandId: null, label: 'Hand', shortcut: 'Shift+H' }),
    'pixel.move': Object.freeze({ commandId: null, label: 'Move', shortcut: 'Shift+V' }),
    'palette.pen': Object.freeze({ commandId: 'colorPalette.tool.pencil' }),
    'palette.erase': Object.freeze({ commandId: 'colorPalette.tool.erase', label: 'Blank' }),
    'palette.eyedropper': Object.freeze({ commandId: 'colorPalette.tool.eyedropper' }),
    'palette.move': Object.freeze({ commandId: 'colorPalette.tool.move', label: 'Move' }),
    'palette.select': Object.freeze({ commandId: 'colorPalette.tool.marquee', label: 'Marquee' })
  });

  var definitionsById = {};
  textTools.concat(pixelSubtools, paletteTools).forEach(function(definition) {
    definitionsById[definition.id] = definition;
  });
  Object.freeze(definitionsById);

  var formatDefaultShortcut = function(definition) {
    if(!definition) {
      return false;
    }
    var prefix = definition.modifiers && definition.modifiers.shift ? 'Shift+' : '';
    return prefix + definition.key;
  };

  var getToolPresentation = function(scope, toolId) {
    var alias = aliases[scope + '.' + toolId];
    if(!alias) {
      return null;
    }
    var definition = alias.commandId ? definitionsById[alias.commandId] : null;
    return Object.freeze({
      commandId: alias.commandId,
      label: alias.label || (definition ? definition.title : toolId),
      shortcut: alias.shortcut || (definition ? formatDefaultShortcut(definition) : false)
    });
  };

  return Object.freeze({
    aliases: aliases,
    paletteTools: paletteTools,
    pixelSubtools: pixelSubtools,
    textTools: textTools,
    getToolAlias: function(scope, toolId) {
      return aliases[scope + '.' + toolId] || null;
    },
    getToolDefinition: function(commandId) {
      return definitionsById[commandId] || null;
    },
    getToolPresentation: getToolPresentation,
    formatToolLabel: function(scope, toolId, translate) {
      var presentation = getToolPresentation(scope, toolId);
      if(!presentation) {
        return toolId;
      }
      var label = typeof translate == 'function' ? translate(presentation.label) : presentation.label;
      return label + (presentation.shortcut ? ' (' + presentation.shortcut + ')' : '');
    }
  });
})();

globalThis.ShortcutCatalogMetadata = ShortcutCatalogMetadata;

// dynamic styling
// https://developer.mozilla.org/en-US/docs/Web/API/CSS_Object_Model/Using_dynamic_styling_information


var Icons = {};

Icons.get = function(type) {
  console.log('get icon for ' + type);
  switch(type) {
    case 'graphic':
      return 'icons/svg/glyphicons-basic-37-file.svg';
    case 'asm':
      return 'icons/svg/glyphicons-basic-37-file.svg';
    default:
      return 'icons/svg/glyphicons-basic-37-file.svg';
  }
}
var toolShortcutKey = function(commandId) {
  return ShortcutCatalogMetadata.getToolDefinition(commandId).key;
};
var keys = {
  textMode: {
    play: { keyCode: 32, shift: false },

    toolsPencil: { key: toolShortcutKey('textMode.tool.pencil') },
    toolsErase: { key: toolShortcutKey('textMode.tool.erase') },
    toolsBucket: { key: toolShortcutKey('textMode.tool.fill') },
    toolsEyedropper: { key: toolShortcutKey('textMode.tool.eyedropper') },
    toolsPixel: { key: toolShortcutKey('textMode.tool.pixel') },
    toolsCharPixel: { key: toolShortcutKey('textMode.tool.characterPixel') },
    toolsMarquee: { key: toolShortcutKey('textMode.tool.marquee') },
    toolsShape: { key: toolShortcutKey('textMode.tool.shape') },
    toolsZoom: { key: toolShortcutKey('textMode.tool.zoom') },
    toolsType: { key: toolShortcutKey('textMode.tool.type') },
    toolsHand: { key: toolShortcutKey('textMode.tool.hand') },
    toolsMove: { key: toolShortcutKey('textMode.tool.move') },
    toolsBlock: { key: toolShortcutKey('textMode.tool.block') },

    drawCharacter: { key: 'C' },
    drawFGColor: { key: 'F' },
    drawBGColor: { key: 'G' },


    cursorUp: { },


    // selection
    selectDrawWithSelection: { key: 'D' },
    selectFlipSelectionH: { key: 'F' },
    selectFlipSelectionV: { key: 'G' },
    selectFillSelection: { key: 'C' },

    drawCharacter: { key: false }, //'C' },
    drawFGColor: { key: false }, //'F' },
    drawBGColor: { key: false }, //'G' },

    drawTileFlipH: { key: 'F' },
    drawTileFlipV: { key: 'G' },

    lineSegmentHorizontal: { key: 'F' },
    lineSegmentVertical: { key: 'G' },


    c64MultiFG: { key: '2' },
    c64MultiBG: { key: '1' },
    c64MultiMC1: { key: '3' },
    c64MultiMC2: { key: '4' },

    tilePaletteLeft: { keyCode: 65, shift: false },       // a
    tilePaletteRight: { keyCode: 68, shift: false },      // d
    tilePaletteUp: { keyCode: 87, shift: false },         // w
    tilePaletteDown: { keyCode: 83, shift: false },       // s
    characterRecentNext: { keyCode: 69, shift: false },        // e
    characterRecentPrev: { keyCode: 81, shift: false },        // q
    characterRotate: { keyCode: 82, shift: false },            // r
    showTilePicker: { key: '/' },

    colorPaletteLeft: { keyCode: 65, shift: true },       // a
    colorPaletteRight: { keyCode: 68, shift: true },      // d
    colorPaletteUp: { keyCode: 87, shift: true },         // w
    colorPaletteDown: { keyCode: 83, shift: true },       // s
    colorPaletteRecentNext: { keyCode: 69, shift: true },
    colorPaletteRecentPrev: { keyCode: 81, shift: true },
    switchColors: { key: 'x' },
    showColorPicker: { key: '?' },

    framesNext: { key: '.' },
    framesPrev: { key: ',' }

//    tilePaletteCycle: 
  }
};

var styles = {
  text: {
    blockName: 'Meta Tile'
  },
  ui: {
    scrollbarWidth: 10,
    scrollbarHolder: '#111111',
    scrollbar: '#555555',
  },

  textMode: {
    tilePaletteFg: '#d0d0d0',
    tilePaletteBg: '#222222',

    gridView2dBackground: '#010101',

    gridView2dPixelGridLine: '#555555',
    gridView2dPixelGridLineWidth: 0.2,


    gridView2dGridLine: '#888888',
    gridView2dGridLineWidth: 0.3,

    gridView2dGridBlockLine: '#ffffff',
    gridView2dGridBlockLineWidth: 0.3,

    gridView2dSelectLineDark: '#444444',//#444444',
    gridView2dSelectLineLight: '#dddddd',//#dd0000'


    typingKeyboardKeyHighlight: '#aaaaaa',
    typingKeyboardLines: '#333333',//#444444',
    typingKeyboardBackground: '#eeeeee',

    currentTileBackground: '#222222',

    tileEditorGridBg: '#000000',
    tileEditorGridFg: '#ffffff',
    tileEditorGridLines: '#aaaaaa', //'#444444',
    tileEditorGridBorder: '#c9c9c9',


    popupTextColor: '#eeeeee'
//    popupBackground: '#111111'
  },

  tilePalette: {
    selectOutline: '#1ea0ff',
    highlightOutline: '#888888'
  },

  colorPalette: {
    highlightOutline: '#ff0000'
  },

  music: {
    selectFill:    '#7777ff',
    selectOutline: '#bbbbff',

    rulerBackground: '#222222',
    rulerLines: '#666666',
    rulerBarLines: '#aaaaaa',

    oscilloscopeBackground: '#111111',
    oscilloscopeLines: '#eeeeee',

    effectsBackground: '#555555',
    effectsText: '#333333',
    effectsFill: '#aaaaaa',
    effectsOutline: '#333333',
    effectsCursor: '#0000ff',
    effectsCursorOutline: '#00ff00',

    cursorOutline: '#0000ff',

    pianoRollBlackKey: '#000000',
    pianoRollWhiteKey: '#ffffff',
    pianoRollKeyOutline: '#222222',
    pianoRollHighlightedNote: '#aaaaff',
    pianoRollSelectedNote: '#7777aa',

    noteOutline: '#cccccc',
    ghostNoteOutline: '#dddddd',
    selectedNoteOutline: '#aaaaff',


    gridBackground: '#333333',
    gridBlackNotes: '#1b1b1b',
    gridWhiteNotes: '#333333',
    gridLines: '#444444',
    gridOctaveLines: '#595959',
    gridBarLines: '#9a9a9a',
    gridBeatLines: '#666666'

  }
}
