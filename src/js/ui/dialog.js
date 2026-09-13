
// TODO; fix this.

UI.DialogResizeMouseDown = function(event, whichedge, id) {
  var dialog = UI.components[id];

  dialog.mouseDownX = event.pageX;
  dialog.mouseDownY = event.pageY;

  dialog.mouseDownDialogWidth = dialog.width;
  dialog.mouseDownDialogHeight = dialog.height;
  dialog.mouseDownDialogX = dialog.left;
  dialog.mouseDownDialogY = dialog.top;

  dialog.mouseDownOn = whichedge;

  var cursor = 'default';
  switch(whichedge) {
    case 'northresize':
      cursor = 'n-resize';
      break;
    case 'northeastresize':
      cursor = 'ne-resize';
      break;
    case 'eastresize':
      cursor = 'e-resize';
      break;
    case 'southeastresize':
      cursor = 'se-resize';
      break;
    case 'southresize':
      cursor = 's-resize';
      break;
    case 'southwestresize':
      cursor = 'sw-resize';
      break;
    case 'westresize':
      cursor = 'w-resize';
      break;
    case 'northwestresize':
      cursor = 'nw-resize';
      break;
  }

  UI.captureMouse(dialog, { cursor: cursor });

  return false;


}


UI.DialogTitleMouseDown = function(event, id) {

  var dialog = UI.components[id];
  dialog.mouseDownX = event.pageX;
  dialog.mouseDownY = event.pageY;

  dialog.mouseDownOn = 'titlebar';


  dialog.mouseDownDialogX = dialog.left;
  dialog.mouseDownDialogY = dialog.top;

  UI.captureMouse(dialog, {cursor: 'move' });

  return false;
  
  
}

/*
UI.DialogTitleMouseUp = function(id) {
  var dialog = UI.components[id];
  var xdiff = UI.mouseX - dialog.mouseDownX;
  var ydiff = UI.mouseY - dialog.mouseDownY;

  dialog.top = dialog.top + ydiff;
  dialog.left = dialog.left + xdiff;

  $('#' + dialog.id).css('top', dialog.top + 'px');
  $('#' + dialog.id).css('left', dialog.left + 'px');

  return false;
}
*/


var g_dialogZIndex = 1000;
var g_dialogStack = new Array();
var removeDialogFromLegacyStack = function(dialog) {
  var dialogIndex = g_dialogStack.lastIndexOf(dialog);
  if(dialogIndex !== -1) {
    g_dialogStack.splice(dialogIndex, 1);
  }
};
UI.Dialog = function(args) {


  this.init = function(args) {
    this.element = null;
    this.args = args;

    this.top = 10;
    this.left = 10;

    this.width = 900;
    if(args.width) {
      this.width = args.width;
    }
    this.height = 560;
    if(args.height) {
      this.height = args.height;
    }

    // Keep the requested size separate from the rendered size. A dialog may
    // need to shrink to fit the current viewport, but that temporary clamp
    // must not become its new size when it is shown again on a larger screen.
    this.preferredWidth = this.width;
    this.preferredHeight = this.height;
    this.fullScreen = typeof args.fullScreen != 'undefined' && args.fullScreen;
    this.maxWidth = typeof args.maxWidth != 'undefined' ? args.maxWidth : false;
    this.maxHeight = typeof args.maxHeight != 'undefined' ? args.maxHeight : false;

    this.showCloseButton = args.showCloseButton !== false;
    this.closeOnEscape = args.closeOnEscape !== false;

    if(this.fullScreen) {

      var screenWidth = UI.getScreenWidth();
      var screenHeight = UI.getScreenHeight();

      this.width = screenWidth - 10;// - 30;
      this.height = screenHeight - 10;

      if(typeof args.maxWidth != 'undefined' && this.width > args.maxWidth) {
        this.width = args.maxWidth;      
      }

      if(typeof args.maxHeight != 'undefined' && this.height > args.maxHeight) {
        this.height = args.maxHeight;
      }

      this.preferredWidth = this.width;
      this.preferredHeight = this.height;

    }

    this.mouseDownX = 0;
    this.mouseDownY = 0;
    this.mouseDownOn = false;


    this.components = new Array();
    this.buttons = new Array();


    this.closeButton = UI.create("UI.Button", 
      {"imageSrc": "icons/svg/glyphicons-basic-599-menu-close.svg", "imageAlt": "Close", "text": "", "style": "padding: 1px 4px", "cssclass": "ui-button ui-dialog-close-button ui-button-danger" });

    this.isOpen = false;
    this.mount();

    //TODO: do this better..
    $(this.element).find('.ui-mouseevents').on('mouseenter', function(event) {
      var id = $(this).attr('id');

      // remove the -content from id
      id = id.replace('-content', '');

      if(UI.components.hasOwnProperty(id)) {
        var component = UI.components[id];
        UI.mouseInComponent = component;
        if(typeof component.mouseEnter !== 'undefined') {
          component.mouseEnter(event);
        }

      }
    });

    $(this.element).find('.ui-mouseevents').on('mouseleave', function(event) {
      var id = $(this).attr('id');

      id = id.replace('-content', '');

      if(UI.components.hasOwnProperty(id)) {
        var component = UI.components[id];
        UI.mouseInComponent = null;

        if(typeof component.mouseLeave !== 'undefined') {
          component.mouseLeave(event);
        }
      }
    });


  }

  // Dialog owners construct on first use. Closed dialogs wait in the hidden
  // store (not as direct body children) so canvases, form values and
  // directly bound event handlers survive reopening.
  this.mount = function() {
    this.getElement();
    if(this.element.parentNode !== document.body) {
      document.body.append(this.backgroundElement, this.element);
    }
  }

  this.add = function(component) {
    this.components.push(component);

    this.element.querySelector('#' + this.id + '-content').append(component.getElement());
  }

  this.addButton = function(button) {
    var buttonsElement = this.element.querySelector('#' + this.id + '-buttons');
    if( (UI.os == 'Mac OS' || UI.isMobile.any()) && typeof buttonsElement.prepend != 'undefined') {
      this.buttons.unshift(button);
      buttonsElement.prepend(button.getElement());
    } else {
//      this.buttons.push(button);
      this.buttons.push(button);
      buttonsElement.append(button.getElement());

    }

  }


  this.resizeDialog = function(xdiff, ydiff) {
    var screenWidth = UI.getScreenWidth();
    var screenHeight = UI.getScreenHeight();

/*    
    dialog.mouseDownWidth = dialog.width;
    dialog.mouseDownHeight = dialog.height;
    dialog.mouseDownX = dialog.left;
    dialog.mouseDownY = dialog.top;
*/
    
    if(this.mouseDownOn == 'eastresize' || this.mouseDownOn == 'northeastresize' || this.mouseDownOn == 'southeastresize') {
      var newWidth = this.mouseDownDialogWidth + xdiff;

      if(newWidth < 160) {
        newWidth = 160;
      }

      if(this.left + newWidth < screenWidth - 12) {
        this.width = newWidth;
      } else {
        this.width = screenWidth - 12 - this.left;
      }
      $('#' + this.id).css('width', this.width);
    }


    if(this.mouseDownOn == 'westresize' || this.mouseDownOn == 'northwestresize' || this.mouseDownOn == 'southwestresize') {
      var newLeft = this.mouseDownDialogX + xdiff;

      if(newLeft > 8) {
      } else {
        xdiff = - this.mouseDownDialogX + 8;

      }
      this.left = this.mouseDownDialogX + xdiff;
      this.width = this.mouseDownDialogWidth - xdiff;

      $('#' + this.id).css('left', this.left);
      $('#' + this.id).css('width', this.width);
    }
 
    if(this.mouseDownOn == 'northresize' || this.mouseDownOn == 'northeastresize' || this.mouseDownOn == 'northwestresize') {
      var newTop = this.mouseDownDialogY + ydiff;

      if(newTop > 8) {
      } else {
        ydiff = -this.mouseDownDialogY + 8;
      }

      this.top = this.mouseDownDialogY + ydiff;
      this.height = this.mouseDownDialogHeight - ydiff;

      $('#' + this.id).css('height', this.height);
      $('#' + this.id).css('top', this.top);
    
    }

    if(this.mouseDownOn == 'southresize' || this.mouseDownOn == 'southeastresize' || this.mouseDownOn == 'southwestresize') {

      var newHeight = this.mouseDownDialogHeight + ydiff;

      if(newHeight < 80) {
        newHeight = 80;
      }

      if(this.top + newHeight < screenHeight - 12) {
        this.height = newHeight;
      } else {
        this.height = screenHeight - 12 - this.top;
      }
      $('#' + this.id).css('height', this.height);
    }

    if(this.mouseDownOn == 'eastresize' || this.mouseDownOn == 'northeastresize' || this.mouseDownOn == 'southeastresize' ||
       this.mouseDownOn == 'westresize' || this.mouseDownOn == 'northwestresize' || this.mouseDownOn == 'southwestresize') {
      this.preferredWidth = this.width;
    }

    if(this.mouseDownOn == 'northresize' || this.mouseDownOn == 'northeastresize' || this.mouseDownOn == 'northwestresize' ||
       this.mouseDownOn == 'southresize' || this.mouseDownOn == 'southeastresize' || this.mouseDownOn == 'southwestresize') {
      this.preferredHeight = this.height;
    }

    this.notifyResize();
  }

  this.notifyResize = function() {
    this.trigger('resize');
    for(var i = 0; i < this.components.length; i++) {
      if(typeof this.components[i].resize != 'undefined') {
        this.components[i].resize();
      }
    }
  }

  /**
   * <p>Set the width of the dialog</p>
   *
   * @method setWidth
   * @param width {Number} The new width of the dialog
   */
  this.setWidth = function(width) {
    this.preferredWidth = width;
    this.width = width;
    $('#' + this.id).css('width', this.width);
  }

  /**
   * <p>Set the height of the dialog</p>
   *
   * @method setHeight
   * @param height {Number} The new height of the dialog
   */
  this.setHeight = function(height) {
    this.preferredHeight = height;
    this.height = height;
    $('#' + this.id).css('height', this.height);
  }

  /**
   * Fit the dialog to the current viewport without changing its preferred
   * size. Desktop dialogs are centred with a consistent margin; mobile-sized
   * dialogs retain space for the application header.
   */
  this.resizeToViewport = function(notify) {
    var windowHeight = UI.getScreenHeight();
    var windowWidth = UI.getScreenWidth();
    var isMobile = UI.isMobile.any();
    var horizontalMargin = isMobile ? 5 : 16;
    var topMargin = isMobile ? 40 : 16;
    var bottomMargin = isMobile ? 10 : 16;
    var horizontalFrameSize = 8;
    var verticalFrameSize = 8;

    var dialogElement = document.getElementById(this.id);
    if(dialogElement) {
      var dialogStyle = window.getComputedStyle(dialogElement);
      horizontalFrameSize = parseFloat(dialogStyle.paddingLeft) + parseFloat(dialogStyle.paddingRight) +
        parseFloat(dialogStyle.borderLeftWidth) + parseFloat(dialogStyle.borderRightWidth);
      verticalFrameSize = parseFloat(dialogStyle.paddingTop) + parseFloat(dialogStyle.paddingBottom) +
        parseFloat(dialogStyle.borderTopWidth) + parseFloat(dialogStyle.borderBottomWidth);
    }

    var preferredWidth = this.preferredWidth;
    var preferredHeight = this.preferredHeight;

    if(this.fullScreen) {
      preferredWidth = windowWidth - 10 - horizontalFrameSize;
      preferredHeight = windowHeight - 10 - verticalFrameSize;

      if(this.maxWidth !== false && preferredWidth > this.maxWidth) {
        preferredWidth = this.maxWidth;
      }
      if(this.maxHeight !== false && preferredHeight > this.maxHeight) {
        preferredHeight = this.maxHeight;
      }
    }

    var availableWidth = Math.max(0, windowWidth - horizontalMargin * 2 - horizontalFrameSize);
    var availableHeight = Math.max(0, windowHeight - topMargin - bottomMargin - verticalFrameSize);

    this.width = Math.min(preferredWidth, availableWidth);
    this.height = Math.min(preferredHeight, availableHeight);

    var outerWidth = this.width + horizontalFrameSize;
    var outerHeight = this.height + verticalFrameSize;
    this.left = Math.max(horizontalMargin, Math.floor((windowWidth - outerWidth) / 2));
    this.top = isMobile
      ? topMargin
      : Math.max(topMargin, Math.floor((windowHeight - outerHeight) / 2));

    $('#' + this.id).css({
      'height': this.height + 'px',
      'left': this.left + 'px',
      'top': this.top + 'px',
      'width': this.width + 'px'
    });

    if(notify !== false) {
      this.notifyResize();
    }
  }

  this.mouseDown = function(event) {
    this.trigger('mousedown', event);
  }

  this.mouseMove = function(event) {

    var mouseX = event.pageX;
    var mouseY = event.pageY;

    var xdiff = event.pageX - this.mouseDownX;
    var ydiff = event.pageY - this.mouseDownY;

    var screenWidth = UI.getScreenWidth();
    var screenHeight = UI.getScreenHeight();


    if(this.mouseDownOn == 'titlebar') {
      
      

      if(this.mouseDownDialogY + ydiff > 4) {
        if(this.mouseDownDialogY + this.height + ydiff < screenHeight - 12) {
          this.top = this.mouseDownDialogY + ydiff;
        } else {
          this.top = screenHeight - 12 - this.height;
        }
      } else {
        this.top = 4;
      }
      $('#' + this.id).css('top', this.top + 'px');

      if(this.mouseDownDialogX + xdiff > 4 ) {
        if(this.mouseDownDialogX + this.width + xdiff < screenWidth - 12) {
          this.left = this.mouseDownDialogX + xdiff;
        } else {
          this.left = screenWidth - 12 - this.width;
        }
      } else {
        this.left = 4;
      }

      $('#' + this.id).css('left', this.left + 'px');

//      this.mouseDownX = mouseX;
//      this.mouseDownY = mouseY;

      return;
    } else if(this.mouseDownOn !== false) {
      this.resizeDialog(xdiff, ydiff);
//      this.mouseDownX = mouseX;
//      this.mouseDownY = mouseY;
      return;
    }


    this.trigger('mousemove', event);
  }
  
  this.mouseUp = function(event) {
    var xdiff = event.pageX - this.mouseDownX;
    var ydiff = event.pageY - this.mouseDownY;


    if(this.mouseDownOn == 'titlebar') {
      /*
      this.top = this.top + ydiff;
      this.left = this.left + xdiff;

      $('#' + this.id).css('top', this.top + 'px');
      $('#' + this.id).css('left', this.left + 'px');
      */
      this.mouseDownOn = false;
      return;
    } else if(this.mouseDownOn !== false) {
//      this.resizeDialog(xdiff, ydiff);
      this.mouseDownOn = false;
      return;
    }

    this.trigger('mouseup', event);
    this.mouseDownOn = false;
  }

  this.title = "New Window";
  if(args.title) {
    this.title = args.title;
  }

  this.getElement = function() {
    if(this.element) {
      // has already been created..
      return this.element;
    }

    this.backgroundElement = document.createElement('div');
    this.backgroundElement.setAttribute('id', this.id + '-background');
//    this.backgroundElement.setAttribute('style', 'display: none;  position: absolute; top: 0; left: 0; bottom: 0; right: 0');
    this.backgroundElement.setAttribute('class', 'ui-dialog-background');
    this.backgroundElement.setAttribute('aria-hidden', 'true');

    this.element = document.createElement('div');
    this.element.setAttribute('id', this.id);
    this.element.setAttribute('data-ui-event-token', UI.markupEventToken);
    this.element.setAttribute('class', 'ui-dialog');
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-labelledby', this.id + 'titleheading');
    this.element.setAttribute('tabindex', '-1');
    this.element.style.display = 'none';
    this.element.style.width = this.width + 'px';
    this.element.style.height = this.height + 'px';
    this.element.style.top = this.top + 'px';
    this.element.style.left = this.left + 'px';

    SafeHTML.setHTML(this.element, this.getInnerHTML());

    return this.element;
  }

  this.getResizeHandlesHTML = function() {
    var edges = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
    var html = '';
    for(var i = 0; i < edges.length; i++) {
      var edge = edges[i];
      html += '  <div id="' + this.id + edge + 'resize" class="ui-dialog-resize-handle ui-dialog-resize-' + edge + '" data-ui-dialog-edge="' + edge + 'resize" data-ui-component-id="' + this.id + '"></div>';
    }
    return html;
  }

  this.getInnerHTML = function() {
    var html = '';

    html += this.getResizeHandlesHTML();

    html += '  <div id="' + this.id + 'titlebar" class="ui-dialog-titlebar">';
    html += '    <div id="' + this.id + 'titlebaricon" class="ui-dialog-titlebar-icon">o</div>'; 
    html += '    <h2 id="' + this.id + 'titleheading" class="ui-dialog-titlebar-heading" data-ui-dialog-title="' + this.id + '" >';
    html += SafeHTML.escape(this.title);
    html += '    </h2>';
    if(this.showCloseButton) {
      html += '    <div id="' + this.id + 'titlebarclose" data-ui-dialog-close="' + this.id + '" class="ui-dialog-titlebar-close">';
      html += this.closeButton.getHTML();
      html += '    </div>';
    }
    html += '  </div>';

    html += '  <div id="' + this.id + '-content" class="ui-dialog-content ui-mouseevents" ';
    html += '>';

    for(var i = 0; i < this.components.length; i++ ) {
      html += this.components[i].getHTML();
    }

    html += '  </div>';

    html += '  <div id="' + this.id + '-buttons" class="ui-dialog-buttons" >';
    for(var i = 0; i < this.buttons.length; i++) {
      html += '&nbsp;&nbsp;' + this.buttons[i].getHTML();
    }
    html += '  </div>';

    return html;
  }

  this.getHTML = function() {
    var html = '';

    html += '<div id="' + this.id + '-background" class="ui-dialog-background"></div>';
    html += '<div id="' + this.id + '"' + UI.getMarkupEventAttribute() + ' class="ui-dialog" role="dialog" aria-modal="true" aria-labelledby="' + this.id + 'titleheading" tabindex="-1" style="display: none; width: ' + this.width + 'px; height: ' + this.height + 'px; top: ' + this.top + 'px; left: ' + this.left + 'px">';

    html += this.getResizeHandlesHTML();

    html += '  <div id="' + this.id + 'titlebar" class="ui-dialog-titlebar">';
    html += '    <div id="' + this.id + 'titlebaricon" class="ui-dialog-titlebar-icon">o</div>'; 
    html += '    <h2 id="' + this.id + 'titleheading" class="ui-dialog-titlebar-heading" data-ui-dialog-title="' + this.id + '" >';
    html += SafeHTML.escape(this.title);
    html += '    </h2>';
    if(this.showCloseButton) {
      html += '    <div id="' + this.id + 'titlebarclose" data-ui-dialog-close="' + this.id + '" class="ui-dialog-titlebar-close">';
      html += this.closeButton.getHTML();
      html += '</div>';
    }
    html += '  </div>';

    html += '  <div id="' + this.id + 'content" class="ui-dialog-content" ';
    html += '>';

    for(var i = 0; i < this.components.length; i++ ) {
      html += this.components[i].getHTML();
    }

    html += '  </div>';

    html += '  <div id="' + this.id + 'buttons" class="ui-dialog-buttons" >';
    for(var i = 0; i < this.buttons.length; i++) {
      html += '&nbsp;&nbsp;' + this.buttons[i].getHTML();
    }
    html += '  </div>';
    html += '</div>';

    return html;
  }

  this.fitContent = function() {
    //TODO: add this
  }

  /**
   * <p>Set the title for the dialog</p>
   *
   * @method setText
   * @param text {String}  The text for the title
   */
  this.setTitle = function(title) {
    this.title = title;
    $(this.element).find('.ui-dialog-titlebar-heading').text(title);
  }

  /**
   * <p>Show the dialog if it is not visible </p>
   *
   * @method show
   */
  this.show = function() {
    if(this.isOpen) return false;
    this.previousFocus = document.activeElement;
    this.mount();
    this.isOpen = true;
    this.resizeToViewport(false);

    $('#' + this.id  + '-background').css('z-index', g_dialogZIndex);
    //$('#' + this.id + '-background').show();
    $('#' + this.id + '-background').fadeIn(200);
   
    g_dialogZIndex++;
    $('#' + this.id).css('z-index', g_dialogZIndex);
    $('#' + this.id).fadeIn(100);
    //$('#' + this.id).show();

    this.notifyResize();

    g_dialogZIndex++;

    
    // TODO: doing this also in UI ??
    g_dialogStack.push(this);
    this.element.focus({ preventScroll: true });
    return true;
  }

  /**
   * <p>Close the dialog</p>
   *
   * @method close
   */
  this.close = function(args) {
    if(!this.isOpen) return false;
    var restoreFocus = !args || args.restoreFocus !== false;
    this.trigger('close');

    this.isOpen = false;
    var store = UI.hiddenStore();
    $(this.backgroundElement).stop(true, true).hide();
    $(this.element).stop(true, true).hide();
    store.append(this.backgroundElement, this.element);
    if(restoreFocus && this.previousFocus && this.previousFocus.isConnected) {
      this.previousFocus.focus({ preventScroll: true });
    }

    removeDialogFromLegacyStack(this);

/*
    var id = this.id;
    $('#' + id).remove();
*/

    return true;
  }
}


UI.DialogClose = function(id) {
//  UI.components[id].close();
  UI.closeDialog();
}

UI.registerComponentType("UI.Dialog", UI.Dialog);
