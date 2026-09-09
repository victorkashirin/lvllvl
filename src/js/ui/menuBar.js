UI.MenuItem = function() {
  this.init = function(args) {

    this.id = UI.getID('menu-item');
    this.enabled = true;
    this.visible = true;

    this.menuBar = false;
    if(typeof args.menuBar !== 'undefined') {
      this.menuBar = args.menuBar;
    }

    this.menu = false;
    if(typeof args.menu !== 'undefined') {
      this.menu = args.menu;
    }

    this.commandId = typeof args.commandId === 'undefined' ? null : args.commandId;
    this.shortcutLabel = null;

    if(typeof args.label === 'undefined') {
      this.label = '';
    } else {
      this.label = args.label;
    }

    this.visible = true;
    if(typeof(args.visible) != 'undefined') {
      this.visible = args.visible;
      if(!this.visible) {
        this.style += ';display: none';
      }
    }



    if(typeof args.type === 'undefined') {
      this.type = "item";
    } else {
      this.type = args.type;
    }

    if(typeof args.checked !== 'undefined') {
      this.checked = args.checked;
    } else {
      this.checked = false;
    }

    if(typeof args.shortcut === 'undefined') {
      this.shortcut = false;
    } else {
      this.shortcut = Object.assign({}, args.shortcut);
      if(typeof this.shortcut.cmd == 'undefined') {
        this.shortcut.cmd = false;
      }
      if(typeof this.shortcut.shift == 'undefined') {
        this.shortcut.shift = false;
      }
      if(typeof this.shortcut.ctrl == 'undefined') {
        this.shortcut.ctrl = false;
      }
      if(typeof this.shortcut.alt == 'undefined') {
        this.shortcut.alt = false;
      }
       

      if(typeof this.shortcut.key !== 'undefined') {
        if(this.shortcut.key.length == 1) {
          this.shortcut.keyLowerCase = this.shortcut.key.toLowerCase();
          this.shortcut.charCode = this.shortcut.key.toLowerCase().charCodeAt(0);
        }
      }
      if(this.menuBar) {
        this.menuBar.addShortcut(this.shortcut, this);
      }
    }
  }


  this.getShortcutHTML = function() {
    if(this.shortcutLabel !== null) {
      return this.shortcutLabel;
    }
    var shortcutHtml = '';
    if(this.shortcut !== false) {
      var shortcutHtml = '';
      var shortcut = this.shortcut;
      if(typeof shortcut.ctrl !== 'undefined' && shortcut.ctrl === true) {
        shortcutHtml += 'Ctrl';
      }

      if(typeof shortcut.cmd !== 'undefined' && shortcut.cmd === true) {
        if(UI.os == 'Mac OS') {
          shortcutHtml += 'Cmd';
        } else {
          shortcutHtml += 'Ctrl';
        }
      }

      if(typeof shortcut.alt !== 'undefined' && shortcut.alt === true) {
        if(shortcutHtml != '') {
          shortcutHtml += '+';
        }
        shortcutHtml += 'Alt';
      }

      if(typeof shortcut.shift !== 'undefined' && shortcut.shift === true) {
        if(shortcutHtml != '') {
          shortcutHtml += '+';
        }
        shortcutHtml += 'Shift';
      }

      if(typeof shortcut.key !== 'undefined' ) {
        if(shortcutHtml != '') {
          shortcutHtml += '+';
        }
        shortcutHtml += shortcut.key;             
      }
    }
    return shortcutHtml;
  }

  this.setShortcutText = function(shortcutLabel) {
    this.shortcutLabel = shortcutLabel;
    var element = this.element && this.element.querySelector('.ui-menu-item-shortcut');
    if(element) {
      element.textContent = shortcutLabel === '' ? '' : '\u00a0\u00a0\u00a0\u00a0' + shortcutLabel;
    }
  }


  this.setVisible = function(visible) {
    this.visible = visible;
    if(this.visible) {
      $(this.element).show();
    } else {
      $(this.element).hide();
    }
  }

  this.setChecked = function(checked) {
    this.checked = checked;
    if(this.checked) {
      $(this.element).find('[id$="-checkmark"]').html('<div class="ui-menu-item-checkmark"></div>');
    } else {
      $(this.element).find('[id$="-checkmark"]').html('');
    }
  }

  this.getChecked = function() {
    return this.checked;
  }

  this.setEnabled = function(enabled) {

    this.enabled = enabled;
    $(this.element).attr('aria-disabled', String(!enabled))
      .toggleClass('ui-menu-item', enabled)
      .toggleClass('ui-menu-item-disabled', !enabled);
  }

  this.setLabel = function(label) {
    this.label = label;
    $(this.element).find('.ui-menu-item-label').text(label);
  }

  this.getElement = function() {
    if(this.element) {
      return this.element;
    }
    var element = this.element = document.createElement('div');
    element.setAttribute('id', this.id);

    element.setAttribute('style', 'clear: both');
    if(!this.visible) {
      element.setAttribute('style', 'display: none;');
    }

    var html = '';
    if(this.type == 'separator') {
      element.setAttribute('class', 'ui-menu-item-separator');
      element.setAttribute('role', 'separator');
      html = SafeHTML.escape(this.label);
    } else {
      element.setAttribute('class', this.enabled ? 'ui-menu-item' : 'ui-menu-item-disabled');
      element.setAttribute('role', 'menuitem');
      element.setAttribute('tabindex', '-1');
      element.setAttribute('aria-disabled', String(!this.enabled));
      html += '<div style="display: inline-block; width: 14px" id="' + this.id + '-checkmark">';
      if(this.checked) {
        html += '<div class="ui-menu-item-checkmark"></div>';;
      }
      html += '</div>';
      var escapedLabel = SafeHTML.escape(this.label);
      html += '<div class="ui-menu-item-label ui-text" data-textid="' + escapedLabel + '">' + escapedLabel + '</div>';;
      var shortcutHtml = this.getShortcutHTML();

      html += '<div class="ui-menu-item-shortcut">';
      if(shortcutHtml != '') {
        html += '&nbsp;&nbsp;&nbsp;&nbsp;' + SafeHTML.escape(shortcutHtml);
      }
      html += '</div>';
    }

    SafeHTML.setHTML(element, html);

    var menuItem = this;
    element.onclick = function(event) {
      var element = event.target;
      menuItem.click(event);
    }
    return element;    
  }

  this.click = function(event, source) {
    if(this.menuBar !== false) {
      this.menuBar.hideMenu();
    }

    if(this.enabled) {
      if(this.commandId !== null && this.menuBar.commandService) {
        this.menuBar.commandService.execute(this.commandId, { source: source || 'menu' });
      } else {
        this.menuBar.trigger('itemclick', this.uiID, source);
      }
      this.trigger('click', this.uiID);

      if(this.menu !== false) {
        this.menu.flash();
      }
    }

  }

  this.isShortcutAvailable = function() {
    if(!this.enabled || !this.visible) {
      return false;
    }
    if(this.menu === false) {
      return true;
    }
    return this.menuBar.isMenuShortcutAvailable(this.menu);
  }
}
UI.registerComponentType("UI.MenuItem", UI.MenuItem);
UI.Menu = function() {
  this.menuItems = [];
  this.element = null;

  this.addItem = function(args) {

    args.menuBar = this.menuBar;
    args.menu = this;

    var menuItem = UI.create("UI.MenuItem", args);
    this.menuItems.push(menuItem);

    if(this.element) {
      this.element.append(menuItem.getElement());
    }

    return menuItem;

  }

  this.getItem = function(id) {
    for(var i = 0; i < this.menuItems.length; i++) {
      if(this.menuItems[i].uiID == id) {
        return this.menuItems[i];
      }
    }
    return null;
  }

  this.hasItem = function(id) {
    for(var i = 0; i < this.menuItems.length; i++) {
      if(this.menuItems.uiID == id) {
        return true;
      }
    }
    return false;
  }
  this.removeItem = function(id) {
    var itemIndex = -1;
    for(var i = 0; i < this.menuItems.length; i++) {
      if(this.menuItems[i].uiID == id || this.menuItems[i].id == id) {
        itemIndex = i;
        break;
      }
    }

    if(itemIndex == -1) {
      return false;
    }

    var menuItem = this.menuItems[itemIndex];
    this.menuItems.splice(itemIndex, 1);

    if(menuItem.element && menuItem.element.parentNode) {
      menuItem.element.parentNode.removeChild(menuItem.element);
    }

    if(this.menuBar && this.menuBar.shortcuts) {
      this.menuBar.shortcuts = this.menuBar.shortcuts.filter(function(shortcut) {
        return shortcut.menuItem !== menuItem;
      });
    }

    if(menuItem.uiID !== null && typeof menuItem.uiID != 'undefined' &&
        UI.ids[menuItem.uiID] === menuItem) {
      UI.removeID(menuItem.uiID);
    }
    if(menuItem.id && UI.components[menuItem.id] === menuItem) {
      delete UI.components[menuItem.id];
    }

    return menuItem;
  }

  this.getItems = function(args) {
    return this.menuItems;
  }

  this.flash = function() {
    $('#' + this.menuBarItemId).addClass('ui-menubar-item-hover');
    var _this = this;
    setTimeout(function() {
      $('#' + _this.menuBarItemId).removeClass('ui-menubar-item-hover');

    }, 120);
  }

  this.addSeparator = function(args) {
    args.menuBar = this.menuBar;
    args.type = "separator";
    var menuItem = UI.create("UI.MenuItem", args);
    this.menuItems.push(menuItem);

    if(this.element) {
      this.element.append(menuItem.getElement());
    }

    return menuItem;

/*
    if(typeof args.id === 'undefined') {
      args.id = this.id + "_" + this.menuItems.length;
    }

    if(typeof args.label === 'undefined') {
      args.label = '';
    }
    var menuItem = { label: args.label, id: args.id, type: "separator" };
    this.menuItems.push(menuItem);
*/
  }

  this.getElement = function() {
    if(this.element == null) {
      this.element = document.createElement('div');
      this.element.setAttribute('id', this.id);
      this.element.setAttribute('class', 'ui-menu');
      this.element.setAttribute('role', 'menu');
      this.element.setAttribute('aria-labelledby', this.menuBarItemId);
      for(var i = 0; i < this.menuItems.length; i++) {
        this.element.append(this.menuItems[i].getElement());
      }
      var menu = this;
      this.element.onkeydown = function(event) {
        menu.menuBar.menuKeyDown(event, menu);
      };
    }
    return this.element;
  }


  this.getHTML = function() {

    var html = '';
    html += '<div class="ui-menu" id="ui-menu-' + this.id + '">';
    for(var i = 0; i < this.menuItems.length; i++) {
      switch(this.menuItems[i].type) {
        case "item":
          html += '<div class="ui-menu-item" id="ui-menu-item-'  + SafeHTML.escape(this.menuItems[i].id) + '">' + SafeHTML.escape(this.menuItems[i].label);
          if(this.menuItems[i].shortcut !== false) {
            var shortcutHtml = '';
            var shortcut = this.menuItems[i].shortcut;
            if(typeof shortcut.ctrl !== 'undefined' && shortcut.ctrl === true) {
              shortcutHtml += 'Ctrl';
            }

            if(typeof shortcut.cmd !== 'undefined' && shortcut.cmd === true) {
              // cmd on osx, ctrl otherwise 
              if(UI.os == 'Mac OS') {
                shortcutHtml += 'Cmd';
              } else {
                shortcutHtml += 'Ctrl';
              }
            }

            if(typeof shortcut.shift !== 'undefined' && shortcut.shift === true) {
              if(shortcutHtml != '') {
                shortcutHtml += '+';
              }
              shortcutHtml += 'Shift';
            }
            if(typeof shortcut.key !== 'undefined' ) {
              if(shortcutHtml != '') {
                shortcutHtml += '+';
              }
              shortcutHtml += shortcut.key;             
            }
            html += '&nbsp;&nbsp;' + SafeHTML.escape(shortcutHtml);
          }
          html += '</div>';
          break;
        case "separator":
          html += '<div class="ui-menu-item-separator" id="' + SafeHTML.escape(this.menuItems[i].id) + '">' + SafeHTML.escape(this.menuItems[i].label) + '</div>';
          break;
      }


    }
    html += '</div>';

    return html;

  }

}

UI.MenuBar = function() {
  this.menus = [];

  this.shortcuts = [];
  this.hiddenShortcutMenus = null;

  this.menuShownId = false;
  this.menuBarItemShownId = false;  
  this.element = null;
  this.commandService = null;

  this.init = function(args) {
    UI.menuComponents.push(this);

    this.visible = true;
    if(typeof(args.visible) != 'undefined') {
      this.visible = args.visible;
      if(!this.visible) {
        this.style += ';display: none';
      }
    }

  }

  this.addShortcut = function(shortcut, menuItem) {
    this.shortcuts.push({ shortcut: shortcut, "menuItem": menuItem, enabled: true });
  }


  this.setShortcutEnabled = function(shortcut, enabled) {
    shortcut = Object.assign({}, shortcut);
    if(typeof shortcut.cmd == 'undefined') {
      shortcut.cmd = false;
    }
    if(typeof shortcut.shift == 'undefined') {
      shortcut.shift = false;
    }
    if(typeof shortcut.ctrl == 'undefined') {
      shortcut.ctrl = false;
    }
    if(typeof shortcut.alt == 'undefined') {
      shortcut.alt = false;
    }

    for(var i = 0; i < this.shortcuts.length; i++) {
      var registered = this.shortcuts[i].shortcut;
      var registeredCtrl = registered.ctrl || (registered.cmd && UI.os !== 'Mac OS');
      var registeredMeta = registered.cmd && UI.os === 'Mac OS';
      var requestedCtrl = shortcut.ctrl || (shortcut.cmd && UI.os !== 'Mac OS');
      var requestedMeta = shortcut.cmd && UI.os === 'Mac OS';
      if(registered.key == shortcut.key
        && registered.shift == shortcut.shift
        && registeredMeta == requestedMeta
        && registeredCtrl == requestedCtrl
        && registered.alt == shortcut.alt) {
        this.shortcuts[i].enabled = enabled;
      }

    }

  }

  // Zen mode collapses the menu bar itself, but commands belonging to the
  // currently active editor must continue to work. Remember that active menu
  // set before the bar is hidden so shortcuts from other editors stay dormant.
  this.setHiddenShortcutsEnabled = function(enabled) {
    if(!enabled) {
      this.hiddenShortcutMenus = null;
      return;
    }

    this.hiddenShortcutMenus = {};
    for(var i = 0; i < this.menus.length; i++) {
      var menuBarItem = document.getElementById(this.menus[i].menuBarItemId);
      if(menuBarItem !== null && menuBarItem.getClientRects().length > 0) {
        this.hiddenShortcutMenus[this.menus[i].menuBarItemId] = true;
      }
    }
  }

  this.isMenuShortcutAvailable = function(menu) {
    var menuBarItem = document.getElementById(menu.menuBarItemId);
    if(menuBarItem !== null && menuBarItem.getClientRects().length > 0) {
      return true;
    }

    return this.hiddenShortcutMenus !== null &&
      this.hiddenShortcutMenus[menu.menuBarItemId] === true;
  }
/*
  this.enableShortcut = function(shortcut) {
    for(var i = 0; i < this.shortcuts.length; i++) {
      if(this.shortcuts[i].shortcut.key == shortcut.key 
        && this.shortcuts[i].shortcut.shift == shortcut.shift
        && this.shortcuts[i].shortcut.cmd == shortcut.cmd
        && this.shortcuts[i].shortcut.ctrl == shortcut.ctrl) {
        this.shortcuts[i].enabled = true;
      }

    }
    
  }
*/
  this.addMenu = function(args) {
    var menu = new UI.Menu();
    menu.id = UI.getSemanticID('menu', (args.className || 'main').split(' ')[0].replace('ui-menu-', '') + '-' + args.label);
    menu.menuBarItemId = menu.id + '-trigger';
    menu.label = args.label;
    menu.menuBar = this;
    menu.className = typeof args.className === 'string' ? args.className : '';

    this.menus.push(menu);

    if(UI.ready) {
      var thisElement = this.getElement();
      var menuBarItemElement = document.createElement('div');
      menuBarItemElement.setAttribute('id', menu.menuBarItemId);
      var classNames = 'ui-menubar-item ui-text';
      if(typeof args.className) {
        classNames += ' ' + args.className;
      }
      menuBarItemElement.setAttribute('class', classNames);

      menu.triggerElement = menuBarItemElement;
      menuBarItemElement.setAttribute('role', 'menuitem');
      menuBarItemElement.setAttribute('tabindex', '0');
      menuBarItemElement.setAttribute('aria-haspopup', 'menu');
      menuBarItemElement.setAttribute('aria-expanded', 'false');
      menuBarItemElement.setAttribute('data-textid', menu.label);
      menuBarItemElement.textContent = menu.label;
      thisElement.append(menuBarItemElement);

      var menuBar = this;
      menuBarItemElement.onclick = function(event) {
        var element = event.target;
        menuBar.showMenu(element.id);
      }

      menuBarItemElement.onmouseover = function(event) {
        var element = event.target;//srcElement;

        if(menuBar.menuBarItemShownId !== false  && menuBar.menuBarItemShownId !== element.id) {
          menuBar.showMenu(element.id);
        }        
      }

      menuBarItemElement.onkeydown = function(event) {
        menuBar.triggerKeyDown(event, menu);
      };
    }

    return menu;
  }


  this.showOnly = function(className) {
    this.activeClassName = className;
    this.filterMenus();
  }

  this.setClassVisible = function(className, visible) {
    if(!this.hiddenClasses) this.hiddenClasses = {};
    this.hiddenClasses[className] = !visible;
    this.filterMenus();
  }

  this.filterMenus = function() {
    this.hideMenu();
    for(var i = 0; i < this.menus.length; i++) {
      var menu = this.menus[i];
      if(!menu.triggerElement) {
        continue;
      }
      var classes = menu.className.split(/\s+/);
      var hidden = classes.some(function(name) { return this.hiddenClasses && this.hiddenClasses[name]; }, this);
      if((!this.activeClassName || classes.indexOf(this.activeClassName) !== -1) && !hidden) {
        this.getElement().append(menu.triggerElement);
      } else {
        menu.triggerElement.remove();
      }
    }
  }

  this.getElement = function() {
    if(this.element == null) {
      this.element = document.createElement('div');
      this.element.setAttribute("id", this.id);
      this.element.setAttribute("class", "ui-menubar-panel ui-mouseevents");
      this.element.setAttribute('role', 'menubar');
      this.element.setAttribute('aria-label', 'Application');    
      if(!this.visible) {
        this.element.setAttribute('style', 'display: none;');
      }
      this.homeLink = document.createElement("a");
      this.homeLink.setAttribute("href", "./");
      this.element.append(this.homeLink);

      this.logo = document.createElement("img");
      this.logo.setAttribute("src", "images/logo16t.png");
      this.logo.setAttribute('alt', 'Home');
      this.logo.setAttribute("height", "16");
      this.logo.setAttribute("style", "padding: 3px 3px 3px 5px");
      this.logo.setAttribute("class", "ui-menu-icon");
      this.homeLink.append(this.logo);
    }


    return this.element;
  }

  this.getHTML = function() {
    var html = '';
    html += '<div class="ui-menubar" style="';
    if(!this.visible) {
      html += ' display: none; ';
    }
    html += '" id="' + this.id + '">';

    for(var i = 0; i < this.menus.length; i++) {
      html += '<div class="ui-menubar-item" id="ui-menubar-item-' + SafeHTML.escape(this.menus[i].id) + '">' + SafeHTML.escape(this.menus[i].label);
      html += '</div>';
    }
    html += '</div>';

    var menuHtml = '';
    for(var i = 0; i < this.menus.length; i++) {
      menuHtml += this.menus[i].getHTML();
    }
    $('body').append(menuHtml);

    var menuBar = this;
    UI.on('ready', function() {
      menuBar.initEvents();
    });
    return html;

  }


  this.keyDown = function(event) {

    var keyCode = event.keyCode;
    var c = String.fromCharCode(keyCode);//

    if(keyCode == 93) {
      // cmd key
      c = '';
    }
    c = c.toLowerCase();

    if(keyCode == 189) {
      c = '-';
    }
    if(keyCode == 187) {
      c = '=';
    }

    if(keyCode == 109) {
      c = '-';
    }
    if(keyCode == 173) {
      c = '-';
    }
    if(keyCode == 219) {
      c = '[';
    }

    if(keyCode == 221) {
      c = ']';
    }


    if(keyCode == 220) {
      c = '\\';
    }

    if(keyCode == 91) {
      // command key?
      c = '';
    }
    // if not mac need to use control
    var cmdDown = event.metaKey;
    var ctrlDown = event.ctrlKey;
    var shiftDown = event.shiftKey;
    var altDown = event.altKey;

    for(var i = 0; i < this.shortcuts.length; i++) {
      var shortcut = this.shortcuts[i].shortcut;
      var legacyModes = this.shortcuts[i].menuItem.legacyShortcutModes;
      if(Array.isArray(legacyModes)
        && (legacyModes.length === 0 || typeof g_app == 'undefined'
          || legacyModes.indexOf(g_app.mode) === -1)) {
        continue;
      }
      var expectedCtrl = shortcut.ctrl || (shortcut.cmd && UI.os !== 'Mac OS');
      var expectedMeta = shortcut.cmd && UI.os === 'Mac OS';

      if(this.shortcuts[i].enabled && this.shortcuts[i].menuItem.isShortcutAvailable() &&
          c == shortcut.keyLowerCase) {
        if(expectedMeta == cmdDown && shortcut.shift == shiftDown
           && expectedCtrl == ctrlDown
           && shortcut.alt == altDown) {

          this.shortcuts[i].menuItem.click(undefined, 'keyboard');
          event.preventDefault();
          return true;
        }
      }
    }
    return false;    
  }

  this.keyUp = function(event) {

    var keyCode = event.keyCode;
    var c = String.fromCharCode(keyCode).toLowerCase();
    if(keyCode == 189) {
      c = '-';
    }
    if(keyCode == 109) {
      c = '-';
    }
    if(keyCode == 173) {
      c = '-';
    }

    if(keyCode == 187) {
      c = '=';
    }

    // if not mac need to use control
    var cmdDown = event.metaKey;
    var ctrlDown = event.ctrlKey;
    var shiftDown = event.shiftKey;
    var altDown = event.altKey;

    for(var i = 0; i < this.shortcuts.length; i++) {
      var shortcut = this.shortcuts[i].shortcut;
      var legacyModes = this.shortcuts[i].menuItem.legacyShortcutModes;
      if(Array.isArray(legacyModes)
        && (legacyModes.length === 0 || typeof g_app == 'undefined'
          || legacyModes.indexOf(g_app.mode) === -1)) {
        continue;
      }
      var expectedCtrl = shortcut.ctrl || (shortcut.cmd && UI.os !== 'Mac OS');
      var expectedMeta = shortcut.cmd && UI.os === 'Mac OS';

      if(this.shortcuts[i].enabled && this.shortcuts[i].menuItem.isShortcutAvailable() &&
          c == shortcut.keyLowerCase) {
        if(expectedMeta == cmdDown && shortcut.shift == shiftDown
           && expectedCtrl == ctrlDown
           && shortcut.alt == altDown ) {
          event.preventDefault();
          return true;
        }
      }
    }
    return false;
  }

  this.keyPress = function(event) {
    return this.keyUp(event);
  }



  this.hideMenu = function() {
    if(this.menuBarItemShownId !== false) {
      $('#' + this.menuBarItemShownId).removeClass('ui-menubar-item-selected')
        .attr('aria-expanded', 'false').removeAttr('aria-controls');
    }
    if(this.menuShownId !== false) {
      var popup = document.getElementById(this.menuShownId);
      if(popup) {
        $(popup).stop(true, true).hide();
        UI.hiddenStore().append(popup);
      }
    }
    $('#ui-menu-background').hide();
//    UI.releaseMouse();
    this.menuBarItemShownId = false;
    this.menuShownId = false;
  }

  this.showMenu = function(menuBarItemId) {
    var index = false;
    var id = '';
    for(var i = 0; i < this.menus.length; i++) {
      if(this.menus[i].menuBarItemId == menuBarItemId) {
        index = i;
        id = this.menus[i].id;

      }
    }

    if(index === false || !this.menus[index].triggerElement.isConnected) {
      return;
    }

    this.hideMenu();

    this.menuBarItemShownId = menuBarItemId;
    this.menuShownId = id;
    document.body.append(this.menus[index].getElement());
    $('#' + menuBarItemId).attr('aria-expanded', 'true').attr('aria-controls', id);
    $('#ui-menu-background').show();

    var menuBar = this;
    var backgroundElement = document.getElementById('ui-menu-background');
    backgroundElement.onclick = function() {
      menuBar.hideMenu();
    }
//    UI.captureMouse(this, { "addLayer": false });

    var menuBarItemPosition = $('#' + menuBarItemId).offset();

    var menuPosition = {};
    menuPosition.left = menuBarItemPosition.left;
    menuPosition.top = menuBarItemPosition.top + 25;

    $('#' + menuBarItemId).addClass('ui-menubar-item-selected');

    $('#' + id).css('top', menuPosition.top + 'px');
    $('#' + id).css('left', menuPosition.left + 'px');
    $('#' + id).fadeIn(20);
  }

  this.triggerKeyDown = function(event, menu) {
    if(['ArrowDown', 'ArrowUp', 'Enter', ' '].indexOf(event.key) !== -1) {
      event.preventDefault();
      event.stopPropagation();
      this.showMenu(menu.menuBarItemId);
      var items = this.focusableMenuItems(menu);
      var item = event.key === 'ArrowUp' ? items[items.length - 1] : items[0];
      if(item) item.getElement().focus();
    } else if(['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(event.key) !== -1) {
      event.preventDefault();
      event.stopPropagation();
      var menus = this.menus.filter(function(candidate) { return candidate.triggerElement.isConnected; });
      var index = menus.indexOf(menu);
      index = event.key === 'Home' ? 0 : event.key === 'End' ? menus.length - 1 :
        (index + (event.key === 'ArrowLeft' ? -1 : 1) + menus.length) % menus.length;
      menus[index].triggerElement.focus();
    }
  }

  this.focusableMenuItems = function(menu) {
    return menu.menuItems.filter(function(item) { return item.type !== 'separator' && item.visible && item.enabled; });
  }

  this.menuKeyDown = function(event, menu) {
    var items = this.focusableMenuItems(menu);
    var index = items.findIndex(function(item) { return item.element === document.activeElement; });
    if(['ArrowDown', 'ArrowUp', 'Home', 'End'].indexOf(event.key) !== -1 && items.length) {
      index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 :
        (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
      items[index].getElement().focus();
    } else if(event.key === 'Enter' || event.key === ' ') {
      if(index !== -1) {
        menu.triggerElement.focus();
        items[index].click(event);
      }
    } else if(event.key === 'Escape' || event.key === 'Tab') {
      this.hideMenu();
      menu.triggerElement.focus();
      if(event.key === 'Tab') return;
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  this.initMenuBarItemEvents = function(id) {
    var menuBar = this;
    $('#ui-menubar-item-' + id).on('click', function() {
      menuBar.showMenu(id);
    });

    $('#ui-menubar-item-' + id).on('mouseover', function() {
      if(menuBar.menuShownId !== ''  && menuBar.menuShownId !== id) {
        menuBar.showMenu(id);
      }
    });
  }

  this.menuClick = function(id) {

  }

  this.initEvents = function() {
    var menuBar = this;    
    for(var i = 0; i < this.menus.length; i++) {
      var id =  this.menus[i].id;
      this.initMenuBarItemEvents(id);
    }

    $('.ui-menu-item').on('click', function() {
      menuBar.hideMenu();
      var id = $(this).attr('id');
      menuBar.menuClick(id);
    });   

    $('#ui-menu-background').on('click', function() {
      menuBar.hideMenu();
    });
  }
}

UI.registerComponentType("UI.MenuBar", UI.MenuBar);
