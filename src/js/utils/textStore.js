// https://developer.mozilla.org/en-US/docs/Mozilla/Localization/Web_Localizability/Localization_formats
// https://www.transifex.com/blog/2016/common-localization-file-formats/


// ui-text
// data-text
var TextStore = { };

TextStore.language = "en";//"ja";//en-gb";


TextStore.setLanguage = function(language) {
  this.language = language;

  $('.ui-text').each(function() {
    var textId = $(this).attr('data-textid');

    //console.log(textId);
    $(this).html(TextStore.get(textId));
  });

}

TextStore.get = function(stringId) {

  var translation = TextStore.content[stringId];
  if(typeof translation === 'undefined') {
    return stringId;
  }

  var language = TextStore.language;
  var translationText = translation[language];
  if(typeof translationText !== 'undefined') {
    return  translationText;
  }

//  if(language == 'en-gb' || language == 'en-us') {
  // default to english
  translationText = translation['en'];
  if(typeof translationText !== 'undefined') {
    return translationText;
  }
  //}

  return stringId;

}


TextStore.content = {
  // menu
  "Project": {
    "en": "Project",
    "ja": "プロジェクト",    
    "fr": "",
    "de": "",
    "it": "",
    "zh": ""
  },
  "Save": {
    "en": "Save",
    "ja": "保存する",  
  },
  "Save As...": {
    "ja": "名前を付けて保存"

  },
  "Save Project To GitHub...": {
    "ja": "GitHubに保存"

  },
  "Save To GitHub": {

  },
  "Commit Changes To GitHub...": {
    "ja": "GitHubへの変更のコミット"

  },
  "Download Project...": {
    "ja": "ダウンロード"

  },
  "Go To Home Screen": {
    "ja": "ホーム画面へ"

  },

  "Edit": {
    "ja": "エディット"

  },

  "Undo": {
    "ja": "元に戻す"

  },

  "Redo": {

  },
  "Cut": {

  },
  "Copy": {

  },
  "Paste": {

  },
  "Clear All": {

  },
  "Clear...": {

  },

  "Select All": {

  },

  "Deselect": {

  },

  "Export": {

  },

  "Export PNG": {

  },

  "Export GIF": {

  },

  "Export Tileset": {

  },

  "Toggle Grid": {

  },

  "Toggle Show Previous Frame": {

  },

  "Visual Formats": {

  },

  "C64 Formats": {

  },

  "C64 Assembly Source...": {

  },

  "Dev Formats": {

  },

  "Binary Data...": {

  },

  "Import": {

  },

  "2d Formats": {

  },

  "Import Image / Video": {

  },

  "Image / Video...": {

  },

  "Screen": {

  },

  "Dimensions": {

  },

  "Screen Mode": {

  },

  "Mode": {

  },

  "Text mode": {

  },

  "C64 Multicolor": {

  },

  "Indexed Color": {

  },

  "Block Mode": {

  },

  "Block Size": {

  },

  "Color Mode": {

  },

  "Color Per Cell": {

  },

  "Color Per Tile": {

  },
  "Color Per Block": {

  },
  "Reference Image": {

  },
  "Set Reference Image": {

  },
  "Sprite": {

  },
  "Monochrome": {

  },
  "Help": {

  },
  "Layers": {

  },
  "New Layer": {

  },
  "Layer Properties": {

  },
  "Delete Layer": {

  },
  "Bring Forward": {

  },
  "Send Backward": {

  },
  "Toggle Layer Visibility": {

  },
  "Select Above": {

  },
  "Select Below": {

  },
  "Tiles": {

  },
  "Show Tile Editor": {

  },
  "Choose A Character Set": {

  },
  "Choose A Tile Set": {

  },
  "Load / Import Tile Set": {

  },
  "Save Tile Set": {

  },
  "Colors": {
    "en-gb": "Colors",
    "en-us": "Colors"
  },
  "Show Color Editor": {
    "en-gb": "Show Color Editor",
    "en-us": "Show Color Editor"    
  },
  "Choose A Color Palette": {
    "en-gb": "Choose A Color Palette",
    "en-us": "Choose A Color Palette"    
  },
  "Edit Color Palette": {
    "en-gb": "Edit Color Palette",
    "en-us": "Edit Color Palette"
  },
  "Load Color Palette": {
    "en-gb": "Load Color Palette",
    "en-us": "Load Color Palette"
  },
  "Save Color Palette": {
    "en-gb": "Save Color Palette",
    "en-us": "Save Color Palette"
  },
  "View": {

  },
  "Zoom In": {

  },
  "Zoom Out": {

  },
  "Fit On Screen": {

  },
  "Actual Pixels": {

  },
  "Show / Hide Grid": {

  },
  "Show / Hide Border": {

  },
  "Show / Hide Background": {

  },
  "Scripting": {

  },
  "Project View": {

  },
  "Mouse / Keyboard shortcuts": {

  },
  "Scripting API": {

  },
  "Video": {

  },

  "Color": {
    "en-us": "Color",
    "en-gb": "Color",
    "ja": ""
  },

  // start page.html
  "New Project": {
    "ja": "新しいプロジェクト"

  },
  "Load From GitHub Repository": {
    "ja": "GitHubリポジトリからロードする"

  },
  "Open Local File": {
    "ja": "ローカルファイルを開く"
  },
  "Sign In With GitHub": {
    "ja": ""
  },
  "Sign Out": {

  },


  // drawTools.html
  "Tile Tools": {

  },
  "Cell": {

  },
  "Frame": {

  },
  "Pencil": {

  },
  "Blank": {

  },
  "Fill Bucket": {

  },
  "Eyedropper": {

  },
  "Line": {

  },
  "Rect": {

  },
  "Oval": {

  },
  "Marquee": {

  },
  "Type": {

  },
  "Pixel": {

  },
  "Block": {

  },
  "Zoom": {

  },
  "Hand": {

  },
  "Move": {

  }
}