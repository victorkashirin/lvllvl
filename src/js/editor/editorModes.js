// Editor mode, focus, and keyboard behavior.
// Loaded after editor.js; keeps the legacy Editor global stable while its
// responsibilities are split into focused source files.

Object.assign(Editor.prototype, {
  initModeEvents: function() {
    var _this = this;

    $(window).on('beforeunload', function(event){

      if(g_app.confirmLeave) {
        event.preventDefault();
        return "Are you sure you want to leave this page?"
      }
    });


    UI.on('update', function() {
      _this.update();
    });

    UI.on('keydown', function(event) {

      _this.keyDown(event);
    });

    UI.on('keyup', function(event) {
      _this.keyUp(event);
    });

    UI.on('keypress', function(event) {


      _this.keyPress(event);
    });

  },

  createZenModeInterface: function() {
    if(document.getElementById('zenModeEdges') !== null) {
      return;
    }

    var _this = this;
    var holder = document.createElement('div');
    holder.id = 'zenModeEdges';

    var addEdge = function(edge) {
      var element = document.createElement('div');
      element.id = 'zenModeEdge' + edge.charAt(0).toUpperCase() + edge.slice(1);
      element.className = 'zen-mode-edge zen-mode-edge-' + edge;
      element.setAttribute('data-zen-edge', edge);
      element.setAttribute('aria-hidden', 'true');
      holder.appendChild(element);
      _this.zenModeEdges[edge] = element;

      element.addEventListener('pointerenter', function() {
        _this.revealZenModeEdge(edge);
      });
      element.addEventListener('pointerleave', function() {
        _this.scheduleZenModeEdgeHide(edge);
      });
    };

    addEdge('top');
    addEdge('left');
    addEdge('right');
    addEdge('bottom');

    var status = document.createElement('div');
    status.id = 'zenModeStatus';
    status.className = 'zen-mode-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    holder.appendChild(status);
    document.body.appendChild(holder);

    var bindPanel = function(id, edge) {
      var element = document.getElementById(id);
      if(element === null) {
        return;
      }
      element.addEventListener('pointerenter', function() {
        _this.cancelZenModeEdgeHide(edge);
      });
      element.addEventListener('pointerleave', function() {
        _this.scheduleZenModeEdgeHide(edge);
      });
    };

    var bindSplitPanel = function(splitPanel, panel, edge) {
      if(splitPanel) {
        bindPanel(splitPanel.id + panel, edge);
      }
    };

    bindSplitPanel(this.projectPanel, 'north', 'top');
    bindSplitPanel(this.tabSplitPanel, 'north', 'top');
    bindSplitPanel(this.projectPanel, 'west', 'left');
    bindSplitPanel(this.mainSplitPanel, 'west', 'left');
    bindSplitPanel(this.textModeEditor.textModeEditorPanel, 'west', 'left');
    bindSplitPanel(this.textModeEditor.textModeEditorPanel, 'east', 'right');
    bindSplitPanel(UI('textEditorMobileSplitPanel'), 'north', 'top');
    bindSplitPanel(UI('textEditorContent'), 'south', 'bottom');
    bindSplitPanel(UI('gridSplitPanel'), 'south', 'bottom');
  },

  captureZenModePanel: function(splitPanel, panel, defaultSize) {
    if(!splitPanel || !splitPanel[panel]) {
      return null;
    }

    var size = splitPanel[panel + 'Size'];
    var savedSize = splitPanel[panel + 'SizeSave'];
    var barSize = splitPanel[panel + 'BarSize'];
    var savedBarSize = splitPanel[panel + 'BarSizeSave'];
    var visible = typeof size == 'number' && size > 0;
    var revealSize = visible ? size : savedSize;
    var revealBarSize = visible ? barSize : savedBarSize;

    if(typeof revealSize != 'number' || isNaN(revealSize) || revealSize <= 0) {
      revealSize = defaultSize;
    }
    if(typeof revealBarSize != 'number' || isNaN(revealBarSize)) {
      revealBarSize = 0;
    }

    return {
      splitPanel: splitPanel,
      panel: panel,
      element: document.getElementById(splitPanel.id + panel),
      overlayVisible: false,
      stacked: false,
      visible: visible,
      size: size,
      savedSize: savedSize,
      barSize: barSize,
      savedBarSize: savedBarSize,
      revealSize: revealSize,
      revealBarSize: revealBarSize,
      resizeHidden: panel == 'south' ? splitPanel.southResizeHidden : false
    };
  },

  setZenModePanelOverlayVisible: function(state, visible, edge, offset) {
    if(state === null || state.element === null) {
      return;
    }

    var element = state.element;
    if(!visible) {
      state.overlayVisible = false;
      element.classList.remove('zen-mode-panel-overlay');
      element.classList.remove('zen-mode-panel-overlay-' + edge);
      element.style.removeProperty('--zen-mode-panel-size');
      element.style.removeProperty('--zen-mode-panel-offset');
      element.style.display = 'none';
      return;
    }

    state.overlayVisible = true;
    element.style.setProperty('--zen-mode-panel-size', state.revealSize + 'px');
    element.style.setProperty('--zen-mode-panel-offset', (offset || 0) + 'px');
    element.classList.add('zen-mode-panel-overlay');
    element.classList.add('zen-mode-panel-overlay-' + edge);
    element.style.display = 'block';

    var panelComponent = state.splitPanel[state.panel];
    if(panelComponent && typeof panelComponent.resize == 'function') {
      panelComponent.resize();
    }
  },

  setZenModePanelStackOffset: function(state, edge, offset) {
    if(state === null || state.element === null || !state.visible) {
      return;
    }

    if(!offset) {
      state.stacked = false;
      state.element.classList.remove('zen-mode-panel-stacked');
      state.element.classList.remove('zen-mode-panel-stacked-' + edge);
      state.element.style.removeProperty('--zen-mode-stack-offset');
      return;
    }

    state.stacked = true;
    state.element.style.setProperty('--zen-mode-stack-offset', offset + 'px');
    state.element.classList.add('zen-mode-panel-stacked');
    state.element.classList.add('zen-mode-panel-stacked-' + edge);
  },

  syncZenModePanelBar: function(state, visible, barSize, resizeHidden) {
    var panel = state.panel;
    var bar = $('#' + state.splitPanel.id + panel + 'bar');
    if(panel == 'north' || panel == 'south') {
      bar.css('height', barSize + 'px');
    } else {
      bar.css('width', barSize + 'px');
    }

    if(visible && barSize > 0 && !resizeHidden) {
      bar.show();
    } else {
      bar.hide();
    }
  },

  setZenModePanelVisible: function(state, visible) {
    if(state === null) {
      return;
    }

    var splitPanel = state.splitPanel;
    var panel = state.panel;
    var sizeProperty = panel + 'Size';

    if(visible) {
      if(splitPanel[sizeProperty] == 0) {
        splitPanel[panel + 'SizeSave'] = state.revealSize;
        splitPanel[panel + 'BarSizeSave'] = state.revealBarSize;
        splitPanel.setPanelVisible(panel, true);
      }
      splitPanel[panel + 'BarSize'] = state.revealBarSize;
      splitPanel.resizeThePanel({ panel: panel, size: state.revealSize });
      this.syncZenModePanelBar(state, true, state.revealBarSize, state.resizeHidden);
      return;
    }

    if(splitPanel[sizeProperty] != 0) {
      splitPanel.setPanelVisible(panel, false);
    }
  },

  restoreZenModePanel: function(state) {
    if(state === null) {
      return;
    }

    var splitPanel = state.splitPanel;
    var panel = state.panel;
    var sizeProperty = panel + 'Size';

    if(splitPanel[sizeProperty] != 0) {
      splitPanel.setPanelVisible(panel, false);
    }

    if(state.visible) {
      splitPanel[panel + 'SizeSave'] = state.size;
      splitPanel[panel + 'BarSizeSave'] = state.barSize;
      splitPanel.setPanelVisible(panel, true);
      splitPanel[panel + 'BarSize'] = state.barSize;
      splitPanel.resizeThePanel({ panel: panel, size: state.size });
    }

    splitPanel[panel + 'SizeSave'] = state.savedSize;
    splitPanel[panel + 'BarSizeSave'] = state.savedBarSize;
    if(panel == 'south') {
      splitPanel.southResizeHidden = state.resizeHidden;
    }
    this.syncZenModePanelBar(state, state.visible, state.barSize, state.resizeHidden);
  },

  cancelZenModeEdgeHide: function(edge) {
    if(this.zenModeRevealTimers[edge]) {
      clearTimeout(this.zenModeRevealTimers[edge]);
      this.zenModeRevealTimers[edge] = null;
    }
  },

  scheduleZenModeEdgeHide: function(edge) {
    if(!this.zenMode) {
      return;
    }

    var _this = this;
    this.cancelZenModeEdgeHide(edge);
    this.zenModeRevealTimers[edge] = setTimeout(function() {
      _this.zenModeRevealTimers[edge] = null;
      if(_this.isZenModeEdgeHovered(edge)) {
        return;
      }
      if(edge == 'top' && _this.menuBar && _this.menuBar.menuShownId !== false) {
        _this.scheduleZenModeEdgeHide(edge);
        return;
      }
      _this.hideZenModeEdge(edge);
    }, 350);
  },

  getZenModeEdgePanels: function(edge) {
    if(this.zenModeState === null) {
      return [];
    }

    if(edge == 'top') {
      return [this.zenModeState.menu, this.zenModeState.tabs, this.zenModeState.topStrip];
    }
    if(edge == 'left') {
      return [this.zenModeState.tools, this.zenModeState.projectNavigator];
    }
    if(edge == 'right') {
      return [this.zenModeState.right];
    }
    if(edge == 'bottom') {
      return [this.zenModeState.bottom, this.zenModeState.gridInfo];
    }
    return [];
  },

  isZenModeEdgeHovered: function(edge) {
    if(this.zenModeEdges[edge] && this.zenModeEdges[edge].matches(':hover')) {
      return true;
    }

    var panels = this.getZenModeEdgePanels(edge);
    for(var i = 0; i < panels.length; i++) {
      if(
        panels[i] &&
        (panels[i].overlayVisible || panels[i].stacked) &&
        panels[i].element.matches(':hover')
      ) {
        return true;
      }
    }
    return false;
  },

  revealZenModeEdge: function(edge) {
    if(!this.zenMode || this.zenModeState === null) {
      return;
    }

    this.cancelZenModeEdgeHide(edge);
    if(this.zenModeEdges[edge]) {
      this.zenModeEdges[edge].classList.add('zen-mode-edge-active');
    }

    if(edge == 'top') {
      this.setZenModePanelOverlayVisible(this.zenModeState.menu, true, edge, 0);
      var topStackOffset = this.zenModeState.menu.revealSize;
      if(this.zenModeState.tabs.visible) {
        this.setZenModePanelOverlayVisible(
          this.zenModeState.tabs,
          true,
          edge,
          this.zenModeState.menu.revealSize
        );
        topStackOffset += this.zenModeState.tabs.revealSize;
      }
      this.setZenModePanelStackOffset(this.zenModeState.topStrip, edge, topStackOffset);
    } else if(edge == 'left') {
      if(this.mode == '2d' || this.mode == '3d') {
        this.setZenModePanelOverlayVisible(this.zenModeState.tools, true, edge);
      } else {
        this.setZenModePanelOverlayVisible(this.zenModeState.projectNavigator, true, edge);
      }
    } else if(edge == 'right') {
      this.setZenModePanelOverlayVisible(this.zenModeState.right, true, edge);
    } else if(edge == 'bottom') {
      this.setZenModePanelOverlayVisible(this.zenModeState.bottom, true, edge);
      this.setZenModePanelStackOffset(
        this.zenModeState.gridInfo,
        edge,
        this.zenModeState.bottom.revealSize
      );
    }
  },

  hideZenModeEdge: function(edge) {
    if(!this.zenMode || this.zenModeState === null) {
      return;
    }

    if(this.zenModeEdges[edge]) {
      this.zenModeEdges[edge].classList.remove('zen-mode-edge-active');
    }

    if(edge == 'top') {
      this.setZenModePanelStackOffset(this.zenModeState.topStrip, edge, 0);
      this.setZenModePanelOverlayVisible(this.zenModeState.tabs, false, edge);
      this.setZenModePanelOverlayVisible(this.zenModeState.menu, false, edge);
    } else if(edge == 'left') {
      this.setZenModePanelOverlayVisible(this.zenModeState.tools, false, edge);
      this.setZenModePanelOverlayVisible(this.zenModeState.projectNavigator, false, edge);
    } else if(edge == 'right') {
      this.setZenModePanelOverlayVisible(this.zenModeState.right, false, edge);
    } else if(edge == 'bottom') {
      this.setZenModePanelStackOffset(this.zenModeState.gridInfo, edge, 0);
      this.setZenModePanelOverlayVisible(this.zenModeState.bottom, false, edge);
    }
  },

  showZenModeStatus: function() {
    var status = document.getElementById('zenModeStatus');
    if(status === null) {
      return;
    }

    status.textContent = 'Zen Mode  ·  Alt+Shift+Z to exit';
    status.classList.add('zen-mode-status-visible');
    if(this.zenModeMessageTimer) {
      clearTimeout(this.zenModeMessageTimer);
    }
    this.zenModeMessageTimer = setTimeout(function() {
      status.classList.remove('zen-mode-status-visible');
    }, 1800);
  },

  setZenMode: function(enabled) {
    enabled = enabled === true;
    if(enabled != this.zenMode && this.overviewMode) {
      this.setOverviewMode(false);
    }
    if(enabled == this.zenMode) {
      return true;
    }
    if(enabled && this.isMobile()) {
      return false;
    }

    if(enabled) {
      this.createZenModeInterface();
      this.zenModeState = {
        menu: this.captureZenModePanel(this.projectPanel, 'north', 30),
        tabs: this.captureZenModePanel(this.tabSplitPanel, 'north', 34),
        projectNavigator: this.captureZenModePanel(this.projectPanel, 'west', 180),
        scripting: this.captureZenModePanel(this.mainSplitPanel, 'west', 360),
        tools: this.captureZenModePanel(this.textModeEditor.textModeEditorPanel, 'west', this.textModeEditor.desktopToolsWidth),
        right: this.captureZenModePanel(this.textModeEditor.textModeEditorPanel, 'east', 340),
        topStrip: this.captureZenModePanel(UI('textEditorMobileSplitPanel'), 'north', 30),
        bottom: this.captureZenModePanel(UI('textEditorContent'), 'south', 220),
        gridInfo: this.captureZenModePanel(UI('gridSplitPanel'), 'south', 24)
      };

      this.menuBar.setHiddenShortcutsEnabled(true);
      this.zenMode = true;
      document.body.classList.add('zen-mode');
      this.setZenModePanelVisible(this.zenModeState.bottom, false);
      this.setZenModePanelVisible(this.zenModeState.right, false);
      this.setZenModePanelVisible(this.zenModeState.tools, false);
      this.setZenModePanelVisible(this.zenModeState.scripting, false);
      this.setZenModePanelVisible(this.zenModeState.projectNavigator, false);
      this.setZenModePanelVisible(this.zenModeState.tabs, false);
      this.setZenModePanelVisible(this.zenModeState.menu, false);
      if(UI.exists('view-zenmode')) {
        UI('view-zenmode').setChecked(true);
      }
      this.showZenModeStatus();
      return true;
    }

    this.zenMode = false;
    for(var edge in this.zenModeRevealTimers) {
      if(this.zenModeRevealTimers.hasOwnProperty(edge)) {
        this.cancelZenModeEdgeHide(edge);
      }
    }
    if(this.zenModeMessageTimer) {
      clearTimeout(this.zenModeMessageTimer);
      this.zenModeMessageTimer = null;
    }
    this.menuBar.hideMenu();
    document.body.classList.remove('zen-mode');
    var zenStatus = document.getElementById('zenModeStatus');
    if(zenStatus !== null) {
      zenStatus.classList.remove('zen-mode-status-visible');
    }
    for(var edgeName in this.zenModeEdges) {
      if(this.zenModeEdges.hasOwnProperty(edgeName)) {
        this.zenModeEdges[edgeName].classList.remove('zen-mode-edge-active');
      }
    }

    this.setZenModePanelOverlayVisible(this.zenModeState.menu, false, 'top');
    this.setZenModePanelOverlayVisible(this.zenModeState.tabs, false, 'top');
    this.setZenModePanelOverlayVisible(this.zenModeState.projectNavigator, false, 'left');
    this.setZenModePanelOverlayVisible(this.zenModeState.scripting, false, 'left');
    this.setZenModePanelOverlayVisible(this.zenModeState.tools, false, 'left');
    this.setZenModePanelOverlayVisible(this.zenModeState.right, false, 'right');
    this.setZenModePanelOverlayVisible(this.zenModeState.bottom, false, 'bottom');
    this.setZenModePanelStackOffset(this.zenModeState.topStrip, 'top', 0);
    this.setZenModePanelStackOffset(this.zenModeState.gridInfo, 'bottom', 0);

    this.restoreZenModePanel(this.zenModeState.menu);
    this.restoreZenModePanel(this.zenModeState.tabs);
    this.restoreZenModePanel(this.zenModeState.projectNavigator);
    this.restoreZenModePanel(this.zenModeState.scripting);
    this.restoreZenModePanel(this.zenModeState.tools);
    this.restoreZenModePanel(this.zenModeState.right);
    this.restoreZenModePanel(this.zenModeState.bottom);
    this.menuBar.setHiddenShortcutsEnabled(false);
    this.zenModeState = null;
    if(UI.exists('view-zenmode')) {
      UI('view-zenmode').setChecked(false);
    }
    if(this.textModeEditor) {
      this.textModeEditor.syncInterfaceMenuChecks();
    }
    return true;
  },

  toggleZenMode: function() {
    return this.setZenMode(!this.zenMode);
  },

  isOverviewShortcut: function(event) {
    return (event.key == 'Tab' || event.keyCode == 9)
      && !event.altKey
      && !event.ctrlKey
      && !event.metaKey
      && !event.shiftKey;
  },

  canStartOverviewMode: function(event) {
    if(this.mode != '2d' || this.isMobile() || !this.textModeEditor) {
      return false;
    }

    var drawTools = this.textModeEditor.tools
      && this.textModeEditor.tools.drawTools;
    if(drawTools && drawTools.isTyping()) {
      return false;
    }

    var target = event.target;
    if(target) {
      var focusable = target.closest
        ? target.closest('a, button, input, select, textarea, [contenteditable], [tabindex]')
        : null;
      if(target.isContentEditable || focusable !== null) {
        return false;
      }
    }

    var gridView = this.textModeEditor.gridView2d;
    return Boolean(gridView && gridView.mouseInCanvas);
  },

  handleOverviewZoomShortcut: function(event) {
    var commandDown = UI.os == 'Mac OS' ? event.metaKey : event.ctrlKey;
    if(!this.overviewMode
      || !commandDown
      || event.altKey) {
      return false;
    }

    var key = typeof event.key == 'string' ? event.key : '';
    var keyCode = event.keyCode;
    if(key == '=' || key == '+'
      || (key === '' && (keyCode == 187 || keyCode == 107))) {
      event.preventDefault();
      this.textModeEditor.zoom(1);
      return true;
    }
    if(key == '-'
      || (key === '' && (keyCode == 189 || keyCode == 109 || keyCode == 173))) {
      event.preventDefault();
      this.textModeEditor.zoom(-1);
      return true;
    }
    if(!event.shiftKey
      && (key == '0' || (key === '' && (keyCode == 48 || keyCode == 96)))) {
      event.preventDefault();
      this.textModeEditor.fitOnScreen();
      return true;
    }
    if(!event.shiftKey
      && (key == '1' || (key === '' && (keyCode == 49 || keyCode == 97)))) {
      event.preventDefault();
      this.textModeEditor.actualPixels();
      return true;
    }

    return false;
  },

  setOverviewMode: function(enabled) {
    enabled = enabled === true;
    if(enabled == this.overviewMode) {
      return true;
    }
    if(enabled && (this.isMobile() || this.mode != '2d')) {
      return false;
    }

    var textModeEditor = this.textModeEditor;
    var gridView = textModeEditor && textModeEditor.gridView2d;
    if(!gridView) {
      return false;
    }

    if(enabled) {
      var gridSplitPanel = UI('gridSplitPanel');
      this.overviewModeState = {
        panels: [
          this.captureZenModePanel(this.projectPanel, 'north', 30),
          this.captureZenModePanel(this.tabSplitPanel, 'north', 34),
          this.captureZenModePanel(this.projectPanel, 'west', 180),
          this.captureZenModePanel(this.mainSplitPanel, 'west', 360),
          this.captureZenModePanel(textModeEditor.textModeEditorPanel, 'west', textModeEditor.desktopToolsWidth),
          this.captureZenModePanel(textModeEditor.textModeEditorPanel, 'east', 340),
          this.captureZenModePanel(UI('textEditorMobileSplitPanel'), 'north', 30),
          this.captureZenModePanel(UI('textEditorMobileSplitPanel'), 'south', this.mobileLayout.framesHeight),
          this.captureZenModePanel(UI('textEditorContent'), 'south', 220),
          this.captureZenModePanel(gridSplitPanel, 'west', 300),
          this.captureZenModePanel(gridSplitPanel, 'south', 24)
        ],
        scale: gridView.scale,
        cameraX: gridView.camera.position.x,
        cameraY: gridView.camera.position.y
      };

      if(this.zenMode) {
        this.hideZenModeEdge('top');
        this.hideZenModeEdge('left');
        this.hideZenModeEdge('right');
        this.hideZenModeEdge('bottom');
      }
      this.menuBar.hideMenu();
      this.overviewMode = true;
      document.body.classList.add('overview-mode');
      gridView.setArtworkOnly(true, false);

      for(var panelIndex = this.overviewModeState.panels.length - 1;
        panelIndex >= 0; panelIndex--) {
        this.setZenModePanelVisible(this.overviewModeState.panels[panelIndex], false);
      }

      var overviewScale = parseFloat(this.getPref('textmode.overviewScale'));
      if(isNaN(overviewScale) || !isFinite(overviewScale) || overviewScale <= 0) {
        overviewScale = 1;
      }
      gridView.setScale(overviewScale, false);
      gridView.setCameraPosition(0, 0);
      gridView.render();
      return true;
    }

    this.overviewMode = false;
    document.body.classList.remove('overview-mode');
    var state = this.overviewModeState;
    this.overviewModeState = null;
    if(state === null) {
      return true;
    }

    var selectedOverviewScale = gridView.getScale();
    if(!isNaN(selectedOverviewScale)
      && isFinite(selectedOverviewScale)
      && selectedOverviewScale > 0) {
      this.setPref('textmode.overviewScale', selectedOverviewScale);
    }

    for(var restoreIndex = 0; restoreIndex < state.panels.length; restoreIndex++) {
      this.restoreZenModePanel(state.panels[restoreIndex]);
    }

    gridView.setArtworkOnly(false, false);
    gridView.setScale(state.scale);
    gridView.setCameraPosition(state.cameraX, state.cameraY);
    gridView.render();
    return true;
  },

  // really setting whether the editors get keyboard events..
  setAllowKeyShortcuts: function(allow) {
    if(this.allowKeyShortcuts != allow && this.services && this.services.commands) {
      this.services.commands.cleanup({ source: 'input-policy' });
    }
    this.allowKeyShortcuts = allow;

    switch(this.mode) {
      case 'assembler':
        this.assemblerEditor.willReceiveKeyboardEvents(allow);
        break;
      case 'c64':
        this.c64Debugger.blurMachine();
        break;
    }
  },

  keyDown: function(event) {

    if(!this.allowKeyShortcuts) {
      return;
    }

    var commandServiceActive = this.services && this.services.commands;
    if(!commandServiceActive && this.handleOverviewZoomShortcut(event)) {
      return;
    }

    if(!commandServiceActive
      && !event.repeat
      && this.isOverviewShortcut(event)
      && (this.overviewMode || this.canStartOverviewMode(event))) {
      event.preventDefault();
      this.setOverviewMode(!this.overviewMode);
      return;
    }

    switch(this.mode) {
      case '3d':
      case '2d':
        this.textModeEditor.keyDown(event);
      break;
      case 'music':
        this.music.keyDown(event);
      break;
      case 'c64':
        this.c64Debugger.keyDown(event);
      break;
      case 'color palette':
        this.colorPaletteEditor.colorPaletteEdit.keyDown(event);
      break;
      case 'assembler':
        this.assemblerEditor.keyDown(event);
      break;
    }
  },

  keyUp: function(event) {


    if(!this.allowKeyShortcuts) {
      return;
    }

    switch(this.mode) {
      case '3d':
      case '2d':
        this.textModeEditor.keyUp(event);
      break;
      case 'music':
        this.music.keyUp(event);
      break;
      case 'c64':
        this.c64Debugger.keyUp(event);
      break;
      case 'color palette':
        this.colorPaletteEditor.colorPaletteEdit.keyUp(event);
      break;
      case 'assembler':
        this.assemblerEditor.keyUp(event);
      break;

    }
  },

  keyPress: function(event) {


    if(!this.allowKeyShortcuts) {
      return;
    }


    switch(this.mode) {
      case '3d':
      case '2d':
        this.textModeEditor.keyPress(event);
      break;
      case 'music':
        this.music.keyPress(event);
      break;
      case 'color palette':
        this.colorPaletteEditor.colorPaletteEdit.keyPress(event);
      break;
    }
  },

  setDeviceType: function(deviceType) {
    var isMobile = deviceType == 'mobile';

    if(deviceType != 'desktop' && !isMobile) {
      return;
    }

    if(deviceType != this.deviceType && this.services && this.services.commands) {
      this.services.commands.cleanup({ source: 'device-type' });
    }

    if(deviceType != this.deviceType && this.overviewMode) {
      this.setOverviewMode(false);
    }

    if(isMobile && this.zenMode) {
      this.setZenMode(false);
    }

    this.deviceType = deviceType;
    UI.setMobileMode(isMobile);

    if(deviceType == 'desktop') {
      UI('menubar').setVisible(true);
      UI('mobileMenuBar').setVisible(false);
      UI('projectSplitPanel').resizeThePanel({panel: 'north', size: 30});
      UI('tabSplitPanel').setPanelVisible('north', true);
    }

    if(isMobile) {
      UI('menubar').setVisible(false);
      UI('mobileMenuBar').setVisible(true);

      UI('projectSplitPanel').resizeThePanel({
        panel: 'north',
        size: this.mobileLayout.menuBarHeight
      });

      UI('tabSplitPanel').setPanelVisible('north', false);

    }


    if(this.textModeEditor) {
      this.textModeEditor.setDeviceType(deviceType);
    }
  },

  isDesktopApp: function() {

    return this.isElectron;
  },

  isMobile: function() {
    return this.deviceType == 'mobile';
  },

  getMode: function() {
    return this.mode;
  },


  setMode: function(mode) {
    if(this.overviewMode && mode != this.mode) {
      this.setOverviewMode(false);
    }
    if(this.zenMode && mode != this.mode) {
      this.setZenMode(false);
    }
    if(this.services && this.services.imageImportCoordinator &&
        this.services.imageImportCoordinator.isActive()) {
      void this.closeImageImport();
    }
    if(mode != this.mode && this.services && this.services.commands) {
      this.services.commands.cleanup({ source: 'editor-mode' });
    }
    this.mode = mode;

    if(g_app.isMobile()) {
      $('#mobileMenuUndoRedo').show();
    }

//    console.error("SET MODE!!!!: " + mode);

    switch(mode) {

      case 'start':
        if(this.projectPanel) {
          this.projectPanel.setPanelVisible('north', false);
        }
        this.startPage.show();
        UI.setWebGLEnabled(false);
        this.mainPanel.showOnly('startPage');

        break;


      case '3d':
        this.projectPanel.setPanelVisible('north', true);
        UI.setWebGLEnabled(true);
        this.contentPanel.showOnly('textModeEditor');
        this.textModeEditor.setType('3d');
        this.mainPanel.showOnly('projectSplitPanel');

        this.menuBar.showOnly('ui-menu-tilemode');

        this.menuBar.setClassVisible('ui-menu-screen', true);
        this.menuBar.setClassVisible('ui-menu-sprite', false);
        this.textModeEditor.currentTile.setSouthPanelSize();

        this.menuBar.showOnly('ui-menu-3d');


        UI('gridPanel').showOnly('grid3d');
        this.textModeEditor.gridView3d.uiComponent.resize();
        this.textModeEditor.setEditorMode('tile');


        if(g_app.isMobile()) {
          $('.drawToolMobileSide2d').hide();
          $('.drawToolMobileSide3d').show();

          $('#toolIconHolderMobile').css('bottom', '94px');
          $('#toolIconsScrollBottom').css('bottom', '94px');
          $('#drawToolMobileColors').css('height', '80px');
        }
        break;
      case '2d':
        if(this.projectPanel) {
          this.projectPanel.setPanelVisible('north', true);
        }

        if(g_app.isMobile()) {
          $('#mobileMenuCurrentTools').show();
        }

        UI.setWebGLEnabled(false);
        this.mainPanel.showOnly('projectSplitPanel');
        this.contentPanel.showOnly('textModeEditor');
        this.textModeEditor.setType('2d');
        UI('gridPanel').showOnly('grid2d');
        UI('gridView2d').resize();

        this.menuBar.showOnly('ui-menu-tilemode');

        if(this.textModeEditor.graphic && this.textModeEditor.graphic.getType() == 'sprite') {
          this.menuBar.setClassVisible('ui-menu-screen', false);
          this.menuBar.setClassVisible('ui-menu-sprite', true);
        } else {
          this.menuBar.setClassVisible('ui-menu-screen', true);
          this.menuBar.setClassVisible('ui-menu-sprite', false);
        }
        this.textModeEditor.tools.drawTools.tilePalette.drawTilePalette();
        this.textModeEditor.frames.updateFrameInfo();

        if(g_app.isMobile()) {
          this.textModeEditor.tools.drawTools.checkMobileToolScroll();
        }

        if(g_app.isMobile()) {
          $('.drawToolMobileSide2d').show();
          $('.drawToolMobileSide3d').hide();
          $('#toolIconHolderMobile').css('bottom', '194px');
          $('#toolIconsScrollBottom').css('bottom', '194px');
          $('#drawToolMobileColors').css('height', '180px');

        } else {
          this.textModeEditor.updateEastInfoPanel();
        }


        break;
      case 'color palette':
        if(this.projectPanel) {
          this.projectPanel.setPanelVisible('north', true);
        }
        UI.setWebGLEnabled(false);
        this.mainPanel.showOnly('projectSplitPanel');
        this.contentPanel.showOnly('colorPaletteEditor');
        this.menuBar.showOnly('ui-menu-colorpalette');

//        UI('gridView2d').resize();
      break;

      case 'tile set':
        if(this.projectPanel) {
          this.projectPanel.setPanelVisible('north', true);
        }
        UI.setWebGLEnabled(false);
        this.mainPanel.showOnly('projectSplitPanel');
        this.contentPanel.showOnly('tileSetEditor');
        this.menuBar.showOnly('ui-menu-tileset');

      break;

      case 'script':
        if(this.projectPanel) {
          this.projectPanel.setPanelVisible('north', true);
        }
        UI.setWebGLEnabled(false);
        this.mainPanel.showOnly('projectSplitPanel');
        this.scriptEditor.show();
        this.contentPanel.showOnly('scriptEditor');
        this.menuBar.showOnly('ui-menu-script');
      break;

      case 'json':
          if(this.projectPanel) {
            this.projectPanel.setPanelVisible('north', true);
          }
          UI.setWebGLEnabled(false);

          this.jsonEditor.show();
          this.mainPanel.showOnly('projectSplitPanel');
          this.contentPanel.showOnly('jsonEditor');
          this.menuBar.showOnly('ui-menu-script');
          break;
      case 'text':
        if(this.projectPanel) {
          this.projectPanel.setPanelVisible('north', true);
        }
        UI.setWebGLEnabled(false);
        this.textEditor.show();
        this.mainPanel.showOnly('projectSplitPanel');
        this.contentPanel.showOnly('textEditor');
        this.menuBar.showOnly('ui-menu-script');
        break;
      case 'hex':
        if(this.projectPanel) {
          this.projectPanel.setPanelVisible('north', true);
        }
        UI.setWebGLEnabled(false);
        this.mainPanel.showOnly('projectSplitPanel');
        this.contentPanel.showOnly('hexEditor');
        this.menuBar.showOnly('ui-menu-script');
      break;

      case 'music':

        if(this.projectPanel) {
          this.projectPanel.setPanelVisible('north', true);
        }
        UI.setWebGLEnabled(false);
//        this.music.show('/music/Untitled Music');


        this.mainPanel.showOnly('projectSplitPanel');
        this.contentPanel.showOnly('musicEditor');
        this.menuBar.showOnly('ui-menu-music');

        UI('musicEditor').resize();

        break;
      case 'assembler':

        if(g_app.isMobile()) {
          $('#mobileMenuCurrentTools').hide();
        }
//        this.mainPanel.showOnly('mainSplitPanel');
        if(this.projectPanel) {
          this.projectPanel.setPanelVisible('north', true);
        }
        UI.setWebGLEnabled(false);

        this.mainPanel.showOnly('projectSplitPanel');
        this.mainSplitPanel.setPanelVisible('north', true);

        this.menuBar.showOnly('ui-menu-c64-assembler');

        this.showAssembler();
        break;
      case 'c64':
        if(this.projectPanel) {
          this.projectPanel.setPanelVisible('north', true);
        }

        if(g_app.isMobile()) {
          $('#mobileMenuUndoRedo').hide();
        }

        UI.setWebGLEnabled(false);
        this.mainPanel.showOnly('projectSplitPanel');
        this.contentPanel.showOnly('c64debuggerPanel');
        this.menuBar.showOnly('ui-menu-c64');

        this.c64Debugger.show();
        break;

      default:
          if(this.projectPanel) {
            this.projectPanel.setPanelVisible('north', true);
          }
          if(g_app.isMobile()) {
            $('#mobileMenuUndoRedo').hide();
          }

          UI.setWebGLEnabled(false);
          this.mainPanel.showOnly('projectSplitPanel');
          this.contentPanel.showOnly('noEditorPanel');
          break;

    }

    if((mode == '2d' || mode == '3d') && this.textModeEditor && this.textModeEditor.frames) {
      this.textModeEditor.frames.syncFrameControls();
    }

    if(this.menuBar) {
      if(mode == 'assembler') {
          // TODO: prob should be in on focus of text editor
          this.menuBar.setShortcutEnabled({ "cmd": true, "key": "Z" } , false);
          this.menuBar.setShortcutEnabled({ "cmd": true, "shift": true,  "key": "Z" } , false);
          this.menuBar.setShortcutEnabled({ "cmd": true, "key": "X" } , false);
          this.menuBar.setShortcutEnabled({ "cmd": true, "key": "C" } , false);
          this.menuBar.setShortcutEnabled({ "cmd": true, "key": "V" } , false);
      } else {
          // TODO: prob should be in on focus of text editor
          this.menuBar.setShortcutEnabled({ "cmd": true, "key": "Z" } , true);
          this.menuBar.setShortcutEnabled({ "cmd": true, "shift": true,  "key": "Z" } , true);
          this.menuBar.setShortcutEnabled({ "cmd": true, "key": "X" } , true);
          this.menuBar.setShortcutEnabled({ "cmd": true, "key": "C" } , true);
          this.menuBar.setShortcutEnabled({ "cmd": true, "key": "V" } , true);

      }
    }
  },
});
