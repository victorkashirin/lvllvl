var MobileMenu = function() {
  this.editor = null;

  this.uiComponent = null;

  this.menuPosition = 0;

  this.touchStartX = 0;
  this.touchStartY = 0;

  this.touchStartScrollY = 0;

  this.moveHorizonal = false;
  this.moveVertical = false;
  this.touchActive = false;

  this.touchVelocity = null;
  this.previouslyFocusedElement = null;
  this.inertElements = [];
}

MobileMenu.prototype = {
  init: function(editor) {
    this.editor = editor;

    this.touchVelocity = new TouchVelocity();
  },

  initEvents: function() {
    var _this = this;
    $('.mobileMenuItem').on('click', function(event) {
      var value = $(this).attr('data-value');
      _this.menuItemSelected(value);
    });


  },

  getFocusableElements: function() {
    if(!this.uiComponent) {
      return [];
    }

    var elements = this.uiComponent.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
      'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    return Array.prototype.filter.call(elements, function(element) {
      return element.getClientRects().length > 0;
    });
  },

  setBackgroundInert: function(inert) {
    if(inert) {
      if(this.inertElements.length > 0) {
        return;
      }

      var children = document.body.children;
      for(var i = 0; i < children.length; i++) {
        var element = children[i];
        if(element === this.uiComponent || element === this.uiComponentHolder) {
          continue;
        }

        this.inertElements.push({
          element: element,
          wasInert: element.hasAttribute('inert')
        });
        element.setAttribute('inert', '');
      }
      return;
    }

    for(var i = 0; i < this.inertElements.length; i++) {
      var inertElement = this.inertElements[i];
      if(!inertElement.wasInert && inertElement.element.isConnected) {
        inertElement.element.removeAttribute('inert');
      }
    }
    this.inertElements = [];
  },

  getMenuHTML: function() {
    var menuItems = [
      { "className": "screen-menu-item", "label": "Dimensions", "id": "dimensions", "icon": '<img  height="25" src="icons/svg/glyphicons-basic-69-ruler.svg"/>' },
      { "label": "Screen Mode", "id": "screenmode", "icon": '<img  height="25" src="icons/svg/glyphicons-basic-87-tv.svg"/>' },

      { "label": "Reference Image", "id": "referenceimage", "icon": '<img  height="25" src="icons/svg/glyphicons-halflings-15-picture.svg"/>' },

      { "className": "screen-menu-item", "label": "Choose A Character Set", "id": "tilesetpreset", "icon": '<img height="25" src="icons/svg/glyphicons-basic-422-book-library.svg"/>' },
      { "label": "Choose A Colour Palette", "id": "colorpalettepreset", "icon": '<img height="25" src="icons/svg/glyphicons-basic-444-sampler.svg"/>' },
      { "className": "screen-menu-item", "label": "Import Image / Video", "id": "importimage", "icon": '<img  height="25" src="icons/svg/glyphicons-basic-399-import.svg">' },
      { "label": "Export Image", "id": "exportimage", "icon": '<img  height="25" src="icons/svg/glyphicons-basic-199-save.svg">' },
      { "className": "screen-menu-item", "label": "Export Tileset", "id": "exporttileset", "icon": '<img  height="25" src="icons/svg/glyphicons-basic-199-save.svg">' },

      { "label": "Toggle Grid", "id": "togglegrid", "icon": '<img height="25" src="icons/material/grid_on-24px.svg"/>' },
      { "label": "Toggle Show Previous Frame", "id": "toggleprev" },
      { "label": "Show Expanded Controls", "id": "minimalinterface" },
      { "label": "Switch to Desktop Mode", "id": "desktopview" },
      { "label": "About lvllvl plus", "id": "about" },
    ];

    if(SHOWUNFINISHED) {
      menuItems.unshift({
        "label": "Project Explorer",
        "id": "projectexplorer",
        "icon": '<img height="25" src="icons/svg/glyphicons-basic-21-home.svg">'
      });
    }

    var html = '';

    html += '<div class="mobile-menu-header">';
    html += '<button type="button" class="ui-button ui-button-info" id="mobileMenuSave"><img height="25" src="icons/svg/glyphicons-basic-199-save.svg" alt=""><span class="ui-text" data-textid="Save">' + TextStore.get("Save") + '</span></button>';
    html += '<button type="button" class="ui-button ui-button-info" id="mobileMenuSaveAs"><img height="25" src="icons/svg/glyphicons-basic-200-save-as.svg" alt=""><span class="ui-text" data-textid="Save As">' + TextStore.get("Save As") + '</span>...</button>';
    html += '</div>';
    html += '<div id="mobile-menu-content">';
    for(var i = 0; i < menuItems.length; i++) {
      var className = menuItems[i].className;
      html += '<div';
      if(typeof className != 'undefined') {
        html += ' class="' + className + '"';
      }
      html += '>';

      html += '<button type="button" class="mobile-menu-item" data-id="' + SafeHTML.escape(menuItems[i].id) + '">';
      html += '<span class="rippleJS-manual" aria-hidden="true"></span>';
      html += '<span class="mobile-menu-icon" aria-hidden="true">';
      if(menuItems[i].icon) {
        html += menuItems[i].icon;
      }
      html += '</span>';
      html += '<span class="ui-text" data-textid="' + SafeHTML.escape(menuItems[i].label) + '" id="mobile-menu-item-' + SafeHTML.escape(menuItems[i].id) + '">';
      html += SafeHTML.escape(TextStore.get(menuItems[i].label));
      html += '</span>';
      
      html += '</button>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  },

  updateDimensions: function() {
    var oldWidth = this.menuWidth || 0;
    var screenWidth = UI.getScreenWidth();
    this.menuWidth = Math.min(330, Math.max(0, screenWidth - 48));
    this.menuHeight = UI.getScreenHeight();

    if(!this.uiComponent) {
      return;
    }

    $('#mobile-menu').css('width', this.menuWidth + 'px');
    if($('#mobile-menu').is(':visible')) {
      if(this.menuPosition < 0 && oldWidth > 0) {
        this.menuPosition = this.menuWidth * (this.menuPosition / oldWidth);
      }
      $('#mobile-menu').css('left', this.menuPosition + 'px');
    } else {
      $('#mobile-menu').css('left', '-' + this.menuWidth + 'px');
    }
  },

  show: function() {
    var _this = this;
    var menuWasVisible = $('#mobile-menu').is(':visible');
    if(!menuWasVisible) {
      this.previouslyFocusedElement = document.activeElement;
    }
    this.updateDimensions();

    if(this.uiComponent == null) {
      this.uiComponentHolder = document.createElement('div');
      this.uiComponentHolder.setAttribute('id', 'mobile-menu-holder');
      this.uiComponentHolder.setAttribute('style', 'position: fixed; z-index: 90; top: 0; bottom: 0; left: 0; right:0; background-color: black; opacity: 0.6; display: none');
      document.body.append(this.uiComponentHolder);
      $('#mobile-menu-holder').on('click', function(e) {
        _this.hideMenu();
      });


      this.uiComponent = document.createElement('div');
      this.uiComponent.setAttribute('id', 'mobile-menu');
      this.uiComponent.setAttribute('role', 'dialog');
      this.uiComponent.setAttribute('aria-modal', 'true');
      this.uiComponent.setAttribute('aria-label', 'Application menu');
      this.uiComponent.setAttribute('aria-hidden', 'true');
      this.uiComponent.setAttribute('style', 'position: fixed; z-index: 100; display: none');
      document.body.append(this.uiComponent);

      $('#mobile-menu').css('top', '0');
      $('#mobile-menu').css('bottom', '0');
      $('#mobile-menu').css('overflow', 'auto');
      $('#mobile-menu').css('left', '-' + this.menuWidth + 'px');
      $('#mobile-menu').css('width', this.menuWidth + 'px');
      $('#mobile-menu').css('background-color', '#222222');

      var menuHtml = this.getMenuHTML();
      $('#mobile-menu').html(menuHtml);
      this.updateDimensions();

      g_app.displayUserDetails();

      $('.mobile-menu-item').on('click', function(e) {
        e.preventDefault();
        var id = $(this).attr('data-id');
        _this.hideMenu(id);
      });

      $('.mobile-menu-header').on('contextmenu', function(e) {
        e.preventDefault();
      });

      $('.mobile-menu-header').on('touchstart', function(e) {
        _this.touchStart(e);
      });
      $('.mobile-menu-header').on('touchmove', function(e) {
        _this.touchMove(e);
      });
      $('.mobile-menu-header').on('touchend', function(e) {
        _this.touchEnd(e);
      });
      $('.mobile-menu-header').on('touchcancel', function() {
        _this.touchCancel();
      });




      $('.mobile-menu-item').on('contextmenu', function(e) {
   //     e.preventDefault();
      });

      $('.mobile-menu-item').on('touchstart', function(e) {
        _this.touchStart(e);
      });

      $('.mobile-menu-item').on('touchmove', function(e) {
        _this.touchMove(e);
      });


      $('.mobile-menu-item').on('touchend', function(e) {
        _this.touchEnd(e);
      });
      $('.mobile-menu-item').on('touchcancel', function() {
        _this.touchCancel();
      });


      $('#mobile-menu-content').on('scroll', function(e) {
        var scroll = $(this).scrollTop();

        var diff = (_this.touchStartScrollY - scroll);
        if(diff < 0) {
          diff = - diff;
        }

        if(diff > 5) {
          _this.moveVertical = true;
        }

      });


      $('#mobileMenuSave').on('click', function() {
        _this.hideMenu('save');
      });

      $('#mobileMenuSaveAs').on('click', function() {
        _this.hideMenu('saveas');
      });

      document.addEventListener('keydown', function(e) {
        if(!$('#mobile-menu').is(':visible')) {
          return;
        }

        if(e.key == 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          _this.hideMenu();
          return;
        }

        if(e.key == 'Tab') {
          var focusableElements = _this.getFocusableElements();
          if(focusableElements.length == 0) {
            e.preventDefault();
            return;
          }

          var firstElement = focusableElements[0];
          var lastElement = focusableElements[focusableElements.length - 1];
          var activeElement = document.activeElement;
          if(e.shiftKey && (activeElement === firstElement || !_this.uiComponent.contains(activeElement))) {
            e.preventDefault();
            lastElement.focus();
          } else if(!e.shiftKey && (activeElement === lastElement || !_this.uiComponent.contains(activeElement))) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }, true);

      window.addEventListener('resize', function() {
        _this.updateDimensions();
      });

    }

    if(this.editor.graphic.getType() == 'sprite') {
      $('#mobile-menu-content .screen-menu-item').hide();
    } else {
      $('#mobile-menu-content .screen-menu-item').show();
    }

    if(this.editor.getGridVisible()) {
      this.setMenuItemText('togglegrid', "Hide Grid");
    } else {
      this.setMenuItemText('togglegrid', "Show Grid");
    }

    if(this.editor.frames.showPrevFrame) {
      this.setMenuItemText('toggleprev', "Hide Prev Frame");
    } else {
      this.setMenuItemText('toggleprev', "Show Prev Frame");

    }
    if(g_app.getMobileInterfaceType() == 'full') {
      this.setMenuItemText('minimalinterface', 'Use Compact Layout');
    } else {
      this.setMenuItemText('minimalinterface', 'Show Expanded Controls');
    }
//    $('#mobile-menu-holder').fadeIn(100);
    $('#mobile-menu').show();
    $('#mobile-menu-holder').show();
    $('#mobile-menu').attr('aria-hidden', 'false');
    $('#mobileMenuBarHamburger').attr('aria-expanded', 'true');
    this.setBackgroundInert(true);
    if(!menuWasVisible) {
      $('#mobileMenuSave').trigger('focus');
    }

    var duration = 300 * (-this.menuPosition/this.menuWidth);


    $('#mobile-menu').stop(true, false).animate({
      left: '0px'
    }, {
      duration: 300,
      step: function(now, tween) {
        var position = $('#mobile-menu').position();
        var left = position.left;

        var complete = (_this.menuWidth + left) / _this.menuWidth;
        var opacity = 0.6 * complete;
        $('#mobile-menu-holder').css('opacity', opacity);

      },

      complete: function() {
        UI.browserPushState({ type: "mobile-menu" }, "lvllvl Menu", window.location.href);
        _this.menuPosition = 0;
      }
    });

    /*
    $('#mobile-menu').animate({
      left: '0px'
    }, 300, function() {
      _this.menuPosition = 0;

    });
*/

//    UI.showDialog("mobileMenu");  
  },

  setMenuItemText: function(id, text) {
    $('#mobile-menu-item-' + id).text(text);
  },

  setMenuPosition: function(position) {
    this.menuPosition = position;
    $('#mobile-menu').css('left', position + 'px');

    var complete = (this.menuWidth + this.menuPosition) / this.menuWidth;
    var opacity = 0.6 * complete;
    $('#mobile-menu-holder').css('opacity', opacity);

  },

  showRipple: function() {
//    this.touchAt.target = document.getElementById(this.touchAt.elementId);
    var element = getHolderWithRippleJsClass(this.touchAt, 'rippleJS-manual');
    startRipple('touchstart', this.touchAt, element);
  },

  touchStart: function(e) {
    this.touchVelocity.touchStart(e);
    this.touchActive = true;

    var touches = e.touches;

    this.touchStartScrollY = $('#mobile-menu-content').scrollTop();

    if(touches.length > 0) {
      var x = touches[0].pageX;
      var y = touches[0].pageY;      

      this.touchStartX = x;
      this.touchStartY = y;      


      this.touchAt = {
        offsetX: touches[0].offsetX,
        offsetY: touches[0].offsetY,
        clientX: touches[0].clientX,
        clientY: touches[0].clientY,
        target: touches[0].target
      }

      var _this = this;
      //
      // check if movingn or menu selection
      setTimeout(function() {
        if(_this.touchActive && !_this.moveHorizonal && !_this.moveVertical) {
          _this.showRipple();
        }
        
      }, 170);
    }
  },

  touchMove: function(e) {
    this.touchVelocity.touchMove(e);

    var touches = e.touches;


    if(touches.length > 0) {
      var x = touches[0].pageX;
      var y = touches[0].pageY; 

      if(this.moveVertical) {
        return;
      }     

      var diffX = x - this.touchStartX;
      var hDist = -16;
      if(diffX < hDist) {
        this.moveHorizonal = true;
      }

      if(this.moveHorizonal) {
        diffX = x - this.touchStartX - hDist;
        if(diffX > 0) {
          diffX = 0;
        }
        this.setMenuPosition(diffX);
      }
    
    }

  },

  touchEnd: function(e) {
    this.touchVelocity.touchEnd(e);

    var movedHorizonal = this.moveHorizonal;
    var movedVertical = this.moveVertical;
    this.touchActive = false;
    this.moveHorizonal = false;  
    this.moveVertical = false;  

    // A normal tap is handled by the button's click event. Reopening the menu
    // here queues an extra animation ahead of the requested action.
    if(!movedHorizonal || movedVertical) {
      return;
    }

    var closeDistance = this.menuWidth / 3.5;
    if(closeDistance > 95) {
      closeDistance = 95;
    }

    var velocity = this.touchVelocity.getVelocity();

    if(-this.menuPosition > closeDistance || velocity.vx < -1.5) {
      this.hideMenu(false, velocity);
    } else {
      this.show();
    }

  },

  touchCancel: function() {
    this.touchActive = false;
    this.moveHorizonal = false;
    this.moveVertical = false;
  },

  hideMenu: function(id, velocity) {
    var _this = this;

    var duration = 300 ;//* (this.menuWidth + this.menuPosition) / this.menuWidth;

    // get the current position
    var position = $('#mobile-menu').position();
    var left = position.left;
    var destPosition = -this.menuWidth;

    var distance = left - destPosition;

    if(typeof velocity != 'undefined') {
      duration = -distance / velocity.vx;
      if(duration > 300) {
        duration = 300;
      }

    }


//    $('#mobile-menu-holder').fadeOut(100);
    $('#mobile-menu').stop(true, false).animate({
      left: '-' + this.menuWidth + 'px'
    }, duration, function() {
      var focusTarget = _this.previouslyFocusedElement;
      if(_this.uiComponent.contains(document.activeElement)) {
        document.activeElement.blur();
      }
      $('#mobile-menu').hide();
      $('#mobile-menu').attr('aria-hidden', 'true');
      $('#mobileMenuBarHamburger').attr('aria-expanded', 'false');
      $('#mobile-menu-holder').fadeOut(10);
      _this.menuPosition = -_this.menuWidth;
      _this.setBackgroundInert(false);
      if(typeof id != 'undefined' && id !== false) {
        _this.menuItemSelected(id);
      }

      if(focusTarget && focusTarget.isConnected && $(focusTarget).is(':visible') &&
          (document.activeElement === document.body || document.activeElement === null)) {
        focusTarget.focus();
      }
      _this.previouslyFocusedElement = null;
    });
  },

  menuItemSelected: function(item) {
    if(this.moveHorizonal) {
      return;
    }
    UI.closeDialog();
    switch(item) {

      case 'projectexplorer':
        g_app.showProjectNavigator();
      break;

      case 'dimensions':        
        this.editor.showDimensionsDialog();      
      break;
      case 'screenmode':
        this.editor.showScreenModeDialog();
      break;
      case 'referenceimage':
        this.editor.showReferenceImageDialog();
      break;
      case 'tilesetpreset':
        this.editor.tileSetManager.showChoosePreset({});        
      break;
      case 'colorpalettepreset':
        this.editor.colorPaletteManager.showChoosePreset({});
      break;
      case 'save':
        g_app.fileManager.save();
      break;
      case 'saveas':
        g_app.fileManager.showSaveAs();

      break;

      case 'savetogithub':
        g_app.github.save(); 
      break;

      case 'download':
        g_app.fileManager.showDownload();

      break;
      case 'exportimage':
        this.editor.exportImage();
        break;
      case 'exportpng':
        this.editor.exportPng();      
      break;
      case 'exportgif':
        this.editor.exportGif();
      break;
      case 'exporttileset':
        this.editor.exportTileset();
      break;      
      case 'importimage':
        g_app.openImageImport(undefined, 'mobile-menu');
      break;
      case 'togglegrid':
//        this.editor.grid.toggleGrid();
        this.editor.setGridVisible(!this.editor.getGridVisible());
      break;
      case 'toggleprev':
        this.editor.frames.setShowPrevFrame(!this.editor.frames.showPrevFrame);
      break;
      case 'minimalinterface':
        if(g_app.getMobileInterfaceType() == 'full') {
          g_app.mobileReduceInterface();
        } else {
          g_app.mobileRestoreInterface();
        }
        break;
      case 'desktopview':
        if(confirm("Are you sure you want to switch to desktop mode?")) {
          g_app.setDeviceType('desktop');
        }
      break;
      case 'about':
        g_app.showAboutDialog();
      break;
    }

  }
}
