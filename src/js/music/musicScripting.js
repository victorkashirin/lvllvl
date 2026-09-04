var MUSIC_SCRIPTING_SANDBOX_CHANNEL = 'lvllvl-music-scripting-v1';
var MUSIC_SCRIPTING_MAX_SOURCE_LENGTH = 262144;
var MUSIC_SCRIPTING_MAX_PENDING_REQUESTS = 4;
var MUSIC_SCRIPTING_REQUEST_TIMEOUT = 5000;
var MUSIC_SCRIPTING_MAX_COMMANDS = 2000;
var MUSIC_SCRIPTING_MAX_TABLE_CELLS = 65536;
var MUSIC_SCRIPTING_EFFECT_NAMES = Object.freeze({
  ne: 0, l: 17, pu: 1, pd: 2, pn: 3, v: 4,
  ad: 5, sr: 6, fon: 10, frc: 11, fc: 12, ft: 14, t: 15
});
var MUSIC_SCRIPTING_EFFECT_NUMBERS = Object.freeze({
  0: true, 1: true, 2: true, 3: true, 4: true, 5: true,
  6: true, 10: true, 11: true, 12: true, 14: true, 15: true, 17: true
});

var MusicScripting = function() {
  this.music = null;
  this.scriptEditor = null;

  this.currentTab = 0;
  this.tabs = [
  ];

  this.sandboxFrame = null;
  this.sandboxReady = false;
  this.sandboxQueue = [];
  this.sandboxRequests = Object.create(null);
  this.nextSandboxRequestId = 1;

}



MusicScripting.prototype = {

  initExamples: function() {

    this.drumScript = "var pattern = Music.getCurrentPattern();\n\npattern.clear();\n\nvar drumPattern = [\n\t\"bass drum\",\n  \"\",\n  \"bongo\",\n  \"\",\n  \"snare\",\n  \"\",\n  \"bongo\",\n  \"\",\n\t\"bass drum\",\n  \"bongo\",\n  \"bass drum\",\n  \"\",\n  \"snare\",\n  \"\",\n  \"bongo\",\n  \"\"\n];\n\nvar patternLength = pattern.getLength();\n\nfor(var i = 0; i < patternLength; i++) {\n  var instrument = drumPattern[i % drumPattern.length];\n  if(instrument !== \"\") {\n  \tpattern.addNote(i, instrument, \"c4\", 1);\n  }\n}\n";

    this.scaleScript = 'var pattern = Music.getCurrentPattern();\n';
    this.scaleScript += 'pattern.clear();\n\n';

    this.scaleScript += 'var pitch = pattern.pitchToNumber("c2");\n\n';

    this.scaleScript += 'for(var i = 0; i < 25; i++) {\n';
    this.scaleScript += '  pattern.addNote(i, "Bass", pitch + i, 1);\n';
    this.scaleScript += '}';


    this.portamentoScript = 'var pattern = Music.getCurrentPattern();\n\n';

    this.portamentoScript += 'for(var i = 0; i < 16; i++) {\n';
    this.portamentoScript += '  if(i < 8) {\n';
    this.portamentoScript += '    pattern.addEffect(i, "pu", 600);\n';
    this.portamentoScript += '  } else {\n';
    this.portamentoScript += '    pattern.addEffect(i, "pd", 600);\n';
    this.portamentoScript += '  }\n';
    this.portamentoScript += '}\n';


    this.instrumentScript = 'var instrument = Music.getInstrument("Bass");\n';

    this.instrumentScript += 'instrument.setADSR(0x9, 0xf, 0x9, 0xa);\n\n';

    this.instrumentScript += 'instrument.setWavetable(\n';
    this.instrumentScript += '  [\n';
    this.instrumentScript += '    [0x41,0x0],   // pulse\n';
    this.instrumentScript += '    [0x21,0x0],   // sawtooth\n';
    this.instrumentScript += '    [0x11,0xc],   // triangle, relative pitch 0xc\n';
    this.instrumentScript += '    [0x81,0x0],   // noise\n';
    this.instrumentScript += '    [0xff,0x1]    // loop to row 1\n';
    this.instrumentScript += '  ]\n';
    this.instrumentScript += ');\n\n';

    this.instrumentScript += 'instrument.setPulsetable(\n';
    this.instrumentScript += '  [\n';
    this.instrumentScript += '    [0x80,0x10],  // pulse width 10\n';
    this.instrumentScript += '    [0x20,0x40],  // for 0x20 ticks, increase width by 0x40\n';
    this.instrumentScript += '    [0x40,0xe0],  // for 0x40 ticks, decrease width by 0x20\n';
    this.instrumentScript += '    [0x40,0x20],  // for 0x40 ticks, increase width by 0x20\n';
    this.instrumentScript += '    [0xff, 0x3]   // loop to row 3\n';
    this.instrumentScript += '  ]\n';
    this.instrumentScript += ');\n\n';

    this.instrumentScript += 'instrument.setFiltertable(\n';
    this.instrumentScript += '  [\n';
    this.instrumentScript += '    [0x90, 0xf7],\n';
    this.instrumentScript += '    [0x00, 0x00],\n';
    this.instrumentScript += '    [0x01, 0x01],\n';
    this.instrumentScript += '    [0x02, 0x00],\n';
    this.instrumentScript += '    [0xff, 0x03]\n';    
    this.instrumentScript += '  ]\n';
    this.instrumentScript += ');\n\n';
    this.instrumentScript += 'instrument.play();\n';


    this.randomScript = "// random music created by\n// a repeating sequence of steps \n// each step defines what may happen at that step\n\n\n// the pattern\nvar pattern = Music.getCurrentPattern();\npattern.clear();\n\n\n// offset all notes by this number of semitones\nvar pitchOffset = 0;\n\n// the steps\nvar steps = [\n  // 1\n  {\n    noteProbability: 0.9,\n    instruments: [\"bass drum\", \"electric piano\", \"c64 lead\", \"flute\"],\n    notes: [\"c3\", \"d3\", \"e3\", \"f3\", \"g3\", \"a3\", \"b3\",\"c4\", \"d4\", \"e4\", \"f4\", \"g4\", \"a4\", \"b4\"],\n    noteLengths: [1,2,4,8],\n    \n    effectProbability: 0.5,\n    effect: [\"pu\", \"pd\"],\n    effectParam: [200, 400, 800, 1200]\n  },\n  \n  // 2\n  {\n    noteProbability: 0.7,\n    instruments: [\"electric piano\", \"electric guitar\"],\n    notes: [\"c3\", \"d3\", \"e3\", \"f3\", \"g3\", \"a3\", \"b3\", \"c4\", \"d4\", \"e4\", \"f4\", \"f#4\"],\n    noteLengths: [1,2]\n  },\n  \n  // 3\n  {\n    noteProbability: 0.8,\n    instruments: [\"electric piano\"],\n    notes: [\"c3\", \"e3\", \"g3\"],\n    noteLengths: [1,2],\n    effectProbability: 0.5,\n    effect: [\"pd\"],\n    effectParam: [200]\n  },\n  \n  // 4\n  {\n    noteProbability: 0.3,\n    instruments: [\"flute\"],\n    notes: [\"c3\", \"d3\", \"e3\", \"f3\", \"g3\", \"a3\", \"b3\"],\n    noteLengths: [1]\n  },\n  \n  // 5\n  {\n    noteProbability: 0.9,\n    \n    // only make patterns with a snare 50% of the time\n    instruments: (Math.random() > 0.5) ? [\"snare\"] : [\"Electric Piano\"],\n    notes: [\"c3\"],\n    noteLengths: [1]\n  },\n  \n  // 6\n  {\n    noteProbability: 0.7,\n    instruments: [\"electric piano\"],\n    notes: [\"c3\", \"d3\", \"e3\", \"f3\", \"g3\", \"a3\", \"b3\", \"c4\", \"d4\", \"e4\", \"f4\", \"f#4\"],\n    noteLengths: [1]\n  },\n  \n  // 7\n  {\n    noteProbability: 0.8,\n    instruments: [\"electric piano\",\"flute\"],\n    notes: [\"c3\", \"e3\", \"g3\"],\n    noteLengths: [1,2],\n    \n    effectProbability: 0.3,\n    effect: [\"v\"],\n    effectParam: [3],\n    effectParam2: [64]\n  },\n  \n  // 8\n  {\n    noteProbability: 0.3,\n    instruments: [\"flute\"],\n    notes: [\"c3\", \"d3\", \"e3\", \"f3\", \"g3\", \"a3\", \"b3\"],\n    noteLengths: [1]\n  } \n  \n];\n\nfunction chooseRandom(itemArray) {\n  var index = Math.floor(Math.random() * itemArray.length);\n  return itemArray[index];\n  \n}\n\n\n// the script to create the music from the steps\nvar patternLength = pattern.getLength();\nfor(var i = 0; i < patternLength; i+= 0) {\n  var step = steps[i % steps.length];\n  if(Math.random() > (1-step.noteProbability)) {\n    var pitch = chooseRandom(step.notes);    \n    var pitchNumber = pattern.pitchToNumber(pitch) + pitchOffset;\n        \n    var noteLength = chooseRandom(step.noteLengths);\n    var instrument = chooseRandom(step.instruments);\n    \n    pattern.addNote(i, instrument, pitchNumber, noteLength);\n\n    if(typeof step.effect != 'undefined') {\n      for(var j = 0; j < noteLength; j++) {\n        if(Math.random() > (1-step.effectProbability)) {\n          var effect = chooseRandom(step.effect);                    \n          var effectParam = chooseRandom(step.effectParam);\n          var effectParam2 = 0;\n          \n          if(typeof step.effectParam2 != 'undefined') {\n            effectParam2 = chooseRandom(step.effectParam2);\n          }\n          pattern.addEffect(i + j, effect, effectParam, effectParam2);\n        }\n      }\n    }\n\n    i += noteLength;\n  } else {\n    i++;\n  }\n}";
    


  },

  init: function(music) {
    this.initExamples();
    this.music = music;
    this.tabs = [
      { 'tabName': 'Script', 'code': '' }
    ];

    var musicScripting = this;

    music.editor.requireScripts([
      'lib/codemirror/codemirror.js'], function() {
        music.editor.requireScripts(
          ['lib/codemirror/mode/javascript/javascript.js',
          'lib/codemirror/addon/scroll/simplescrollbars.js',
          'lib/codemirror/addon/search/search.js',
          'lib/codemirror/addon/search/searchcursor.js',
          'lib/codemirror/addon/dialog/dialog.js',
          'lib/jshint/jshint.js'
          ], function() {


            if(musicScripting.scriptEditor == null) {
              var musicScript = document.getElementById('musicScript');
              musicScripting.scriptEditor = CodeMirror.fromTextArea(musicScript, {
                mode: "javascript",
                lineNumbers: true,
                tabSize: 2
              });     

              musicScripting.scriptEditor.setOption('mode', 'javascript');
              musicScripting.scriptEditor.getDoc().setValue('var pattern = Music.getCurrentPattern();\n'); 
              musicScripting.scriptEditor.focus();
            }

            musicScripting.redrawTabs();


            $('#musicScriptingExecute').on('click', function() {
              musicScripting.execute();
            });

            $('#musicScriptingClose').on('click', function() {
              musicScripting.music.editor.hideDialog();
            });

            $('#musicScriptDrum').on('click', function() {
              musicScripting.scriptEditor.getDoc().setValue(musicScripting.drumScript);
            });


            $('#musicScriptingToJSON').on('click', function() {
              var code = musicScripting.scriptEditor.getDoc().getValue();
              var js = JSON.stringify(code) + ';';
              $('#musicScriptOutput').val(js);
            });


            $('#musicScriptScale').on('click', function() {
              musicScripting.scriptEditor.getDoc().setValue(musicScripting.scaleScript);
            });

            $('#musicScriptRandom').on('click', function() {
              musicScripting.scriptEditor.getDoc().setValue(musicScripting.randomScript);

            });

            $('#musicScriptPortamento').on('click', function() {
              musicScripting.scriptEditor.getDoc().setValue(musicScripting.portamentoScript);
            });

            $('#musicScriptInstrument').on('click', function() {
              musicScripting.scriptEditor.getDoc().setValue(musicScripting.instrumentScript);

            });

/*
            $('#musicScriptingAddTab').on('click', function() {
              musicScripting.addTab();
            });
*/

            $('#musicScriptingPlay').on('click', function() {
              if(musicScripting.music.sidPlayer.playing) {
                musicScripting.music.stopMusic();
              } else {
                musicScripting.music.playMusic();
              }
            });
        });
    });

  }, 

  redrawTabs: function() {
    var html = '';

    for(var i = 0; i < this.tabs.length; i++) {
      //instrumentActiveTab
      html += '<div tabIndex="' + i + '" id="musicScriptingTab' + i + '" style="display: inline-block; width: 100px; margin-right: 4px" class="instrumentTab ';
      if(i == this.currentTab) {
        html += " instrumentActiveTab ";
      }
      html += '">' + this.tabs[i].tabName + '</div>';
    }
    html += '<div tabIndex="-1" style="display: inline-block; width: 10px; text-align: center" id="musicScriptingAddTab" class="instrumentTab">+</div>';

    $('#musicScriptingTabs').html(html);


    var musicScripting = this;
    $('#musicScriptingAddTab').on('click', function() {
      musicScripting.addTab();
    });    

    $('#musicScriptingTabs .instrumentTab').on('click', function() {
      var index = parseInt($(this).attr('tabIndex'));
      musicScripting.selectTab(index);
    });
  },

  selectTab: function(tabIndex) {
    if(tabIndex >= 0) {
      $('#musicScriptingTabs .instrumentTab').removeClass('instrumentActiveTab');
      $('#musicScriptingTab' + tabIndex).addClass('instrumentActiveTab');

      this.tabs[this.currentTab].code = this.scriptEditor.getDoc().getValue();
      console.log(this.tabs[this.currentTab].code);

      this.currentTab = tabIndex;
      this.scriptEditor.getDoc().setValue(this.tabs[this.currentTab].code); 

    }

  },

  addTab: function() {
    this.tabs.push( { 'tabName': 'Script ' + this.tabs.length, 'code': 'var pattern = Music.getCurrentPattern();\n' } );
    //this.currentTab = this.tabs.length - 1;
    this.redrawTabs();
    this.selectTab(this.tabs.length - 1);
  },

  start: function() {

    this.music.editor.showDialog('musicScriptingDialog');
/*
    if(this.scriptEditor == null) {
      var musicScript = document.getElementById('musicScript');
      this.scriptEditor = CodeMirror.fromTextArea(musicScript, {
        mode: "javascript",
        lineNumbers: true,
        tabSize: 2
      });     

      this.scriptEditor.setOption('mode', 'javascript');
      this.scriptEditor.getDoc().setValue('var pattern = this.getCurrentPattern();\n'); 
      this.scriptEditor.focus();
    }
*/
    if(this.scriptEditor) {
      this.scriptEditor.focus();
    }

  },

  setChannelEnabled: function(channel, enabled) {
    if(isNaN(parseInt(channel))) {
      this.logError('setChannelEnabled: channel must be a number');
      return;
    }

    if(channel < 1 || channel > this.music.tracks.length) {
      this.logError('setChannelEnabled: channel must be between 1 and ' + this.music.tracks.length);
      return;
    }

    if(typeof enabled == 'undefined') {
      enabled = true;
    }

    if(enabled !== false) {
      enabled = true;
    }
    $('#channel' + channel).prop('checked', enabled);
    this.music.trackView.setChannels();
  },

  getCurrentPattern: function() {
    var pattern = new PatternScripting();
    pattern.init(this.music, this.music.patternView.patternID);
    return pattern;

  },

  getPattern: function(name) {
    for(var i = 0; i < this.music.patterns.length; i++) {
      if(this.music.patterns[i].name.toLowerCase() == name.toLowerCase()) {
        var pattern = new PatternScripting();
        pattern.init(this.music, i);
        return pattern;
      }
    }

    throw new ScriptingException('pattern not found ' + name);
  },


  selectPattern: function(name) {
    for(var i = 0; i < this.music.patterns.length; i++) {
      if(this.music.patterns[i].name.toLowerCase() == name.toLowerCase()) {
        return this.selectPatternById(i);
      }
    }

    throw new ScriptingException('pattern not found ' + name);
  },

  selectPatternById: function(patternId) {
    var tracks = this.music.tracks;
    for(var trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
      for(var patternIndex = 0; patternIndex < tracks[trackIndex].length; patternIndex++) {
        if(tracks[trackIndex][patternIndex] == patternId) {
          this.music.trackView.selectPattern(trackIndex, patternIndex);
        }
      }
    }

    var pattern = new PatternScripting();
    pattern.init(this.music, patternId);
    return pattern;
  },

  getInstrument: function(instrumentName) {

    var instrumentID = instrumentName;

    if(!Number.isInteger(instrumentName)) {
      var foundInstrument = false;
      for(var i = 0; i < this.music.instruments.instruments.length; i++) {
        if(this.music.instruments.instruments[i].name.toLowerCase() == instrumentName.toLowerCase()) {
          foundInstrument = true;
          instrumentID = i;
          break;
        }
      }
      if(!foundInstrument) {
//        alert('Unknown Instrument:' + instrument);
        return null;
      }

      var instrument = new InstrumentScripting();
      instrument.init(this.music, instrumentID);

      return instrument;
    }

  },

  logError: function(message) {
    var errors = $('#musicScriptOutput').val();
    errors += message + '\n';
    $('#musicScriptOutput').val(errors);
  },

  getSandboxState: function() {
    var patterns = [];
    for(var i = 0; i < this.music.patterns.length; i++) {
      patterns.push({
        name: String(this.music.patterns[i].name).slice(0, 100),
        length: this.music.patterns[i].getLength()
      });
    }

    var instruments = [];
    for(var j = 0; j < this.music.instruments.instruments.length; j++) {
      instruments.push({ name: String(this.music.instruments.instruments[j].name).slice(0, 100) });
    }

    var filters = [];
    if(this.music.filters && this.music.filters.filters) {
      for(var k = 0; k < this.music.filters.filters.length; k++) {
        filters.push({ name: String(this.music.filters.filters[k].name).slice(0, 100) });
      }
    }

    return {
      currentPatternId: this.music.patternView.patternID,
      channelCount: this.music.tracks.length,
      patterns: patterns,
      instruments: instruments,
      filters: filters
    };
  },

  ensureSandbox: function() {
    if(this.sandboxFrame) {
      return;
    }

    var musicScripting = this;
    this.sandboxFrame = document.createElement('iframe');
    this.sandboxFrame.setAttribute('sandbox', 'allow-scripts');
    this.sandboxFrame.setAttribute('aria-hidden', 'true');
    this.sandboxFrame.style.display = 'none';
    this.sandboxFrame.src = 'music-scripting-sandbox.html?v={v}';

    window.addEventListener('message', function(event) {
      if(event.source !== musicScripting.sandboxFrame.contentWindow) {
        return;
      }
      var data = event.data || {};
      if(data.channel !== MUSIC_SCRIPTING_SANDBOX_CHANNEL) {
        return;
      }
      if(data.type === 'ready') {
        musicScripting.sandboxReady = true;
        while(musicScripting.sandboxQueue.length > 0) {
          var queuedMessage = musicScripting.sandboxQueue.shift();
          if(Object.prototype.hasOwnProperty.call(musicScripting.sandboxRequests, queuedMessage.id)) {
            musicScripting.sandboxFrame.contentWindow.postMessage(queuedMessage, '*');
          }
        }
        return;
      }
      if(data.type !== 'result' || !Object.prototype.hasOwnProperty.call(musicScripting.sandboxRequests, data.id)) {
        return;
      }
      var request = musicScripting.sandboxRequests[data.id];
      delete musicScripting.sandboxRequests[data.id];
      clearTimeout(request.timeout);
      request.callback(data);
    });

    document.body.appendChild(this.sandboxFrame);
  },

  runInSandbox: function(content, callback) {
    if(typeof content !== 'string' || content.length > MUSIC_SCRIPTING_MAX_SOURCE_LENGTH) {
      callback({ success: false, error: 'Music scripts must be smaller than 256 KiB.' });
      return;
    }
    if(Object.keys(this.sandboxRequests).length >= MUSIC_SCRIPTING_MAX_PENDING_REQUESTS) {
      callback({ success: false, error: 'Too many music scripts are already running.' });
      return;
    }
    this.ensureSandbox();
    var id = this.nextSandboxRequestId++;
    var musicScripting = this;
    var message = {
      channel: MUSIC_SCRIPTING_SANDBOX_CHANNEL,
      type: 'execute',
      id: id,
      content: content,
      state: this.getSandboxState()
    };
    this.sandboxRequests[id] = {
      callback: callback,
      timeout: setTimeout(function() {
        if(!Object.prototype.hasOwnProperty.call(musicScripting.sandboxRequests, id)) {
          return;
        }
        delete musicScripting.sandboxRequests[id];
        for(var queueIndex = musicScripting.sandboxQueue.length - 1; queueIndex >= 0; queueIndex--) {
          if(musicScripting.sandboxQueue[queueIndex].id === id) {
            musicScripting.sandboxQueue.splice(queueIndex, 1);
          }
        }
        callback({ success: false, error: 'The music scripting sandbox did not respond.' });
      }, MUSIC_SCRIPTING_REQUEST_TIMEOUT)
    };

    if(this.sandboxReady) {
      this.sandboxFrame.contentWindow.postMessage(message, '*');
    } else {
      this.sandboxQueue.push(message);
    }
  },

  validateSandboxCommands: function(commands) {
    if(!Array.isArray(commands) || commands.length > MUSIC_SCRIPTING_MAX_COMMANDS) {
      throw new Error('The sandbox returned an invalid command list.');
    }

    var music = this.music;

    function integer(value, minimum, maximum, name) {
      if(!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new Error(name + ' is outside the allowed range.');
      }
      return value;
    }

    function patternId(value) {
      return integer(value, 0, music.patterns.length - 1, 'Pattern');
    }

    function instrumentId(value) {
      return integer(value, 0, music.instruments.instruments.length - 1, 'Instrument');
    }

    function position(value, id) {
      return integer(value, 0, music.patterns[id].getLength() - 1, 'Pattern position');
    }

    function shortString(value, name) {
      if(typeof value !== 'string' || value.length === 0 || value.length > 100) {
        throw new Error(name + ' is invalid.');
      }
      return value;
    }

    function namedId(value, items, name) {
      if(Number.isSafeInteger(value)) {
        return integer(value, 0, items.length - 1, name);
      }
      var normalized = shortString(value, name).toLowerCase();
      for(var itemIndex = 0; itemIndex < items.length; itemIndex++) {
        if(String(items[itemIndex].name).toLowerCase() === normalized) {
          return itemIndex;
        }
      }
      throw new Error(name + ' was not found.');
    }

    function pitchNumber(value, name) {
      if(Number.isSafeInteger(value)) {
        return integer(value, 0, 95, name);
      }
      var normalized = shortString(value, name).toLowerCase().trim();
      var match = normalized.match(/^([a-g])(#?)(-?\d+)$/);
      if(!match) {
        throw new Error(name + ' is invalid.');
      }
      var notes = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 8, b: 10 };
      var valueAsNumber = notes[match[1]] + (match[2] ? 1 : 0) + parseInt(match[3], 10) * 12;
      return integer(valueAsNumber, 0, 95, name);
    }

    var tableCellCount = 0;
    function table(value) {
      if(!Array.isArray(value) || value.length > 256) {
        throw new Error('Instrument table is invalid.');
      }
      var copy = [];
      for(var rowIndex = 0; rowIndex < value.length; rowIndex++) {
        var row = value[rowIndex];
        if(!Array.isArray(row) || row.length > 16) {
          throw new Error('Instrument table row is invalid.');
        }
        tableCellCount += row.length;
        if(tableCellCount > MUSIC_SCRIPTING_MAX_TABLE_CELLS) {
          throw new Error('Music script instrument tables are too large.');
        }
        var rowCopy = [];
        for(var columnIndex = 0; columnIndex < row.length; columnIndex++) {
          rowCopy.push(integer(row[columnIndex], -65535, 65535, 'Instrument table value'));
        }
        copy.push(rowCopy);
      }
      return copy;
    }

    var validated = [];
    for(var i = 0; i < commands.length; i++) {
      var command = commands[i];
      if(!command || Object.getPrototypeOf(command) !== Object.prototype || typeof command.type !== 'string') {
        throw new Error('The sandbox returned an invalid command.');
      }
      var id;
      switch(command.type) {
        case 'setChannelEnabled':
          if(typeof command.enabled !== 'undefined' && typeof command.enabled !== 'boolean') {
            throw new Error('Channel enabled state is invalid.');
          }
          validated.push({
            type: command.type,
            channel: integer(command.channel, 1, music.tracks.length, 'Channel'),
            enabled: typeof command.enabled === 'undefined' ? true : command.enabled
          });
        break;
        case 'clearPattern':
          validated.push({ type: command.type, patternId: patternId(command.patternId) });
        break;
        case 'addNote':
          id = patternId(command.patternId);
          validated.push({
            type: command.type,
            patternId: id,
            position: position(command.position, id),
            instrument: namedId(command.instrument, music.instruments.instruments, 'Instrument'),
            pitch: pitchNumber(command.pitch, 'Pitch'),
            duration: integer(command.duration, 1, 256, 'Note duration')
          });
        break;
        case 'eraseNote':
        case 'removeEffect':
          id = patternId(command.patternId);
          validated.push({ type: command.type, patternId: id, position: position(command.position, id) });
        break;
        case 'addEffect':
          id = patternId(command.patternId);
          var effect = command.effect;
          var normalizedEffect = typeof effect === 'string' ? effect.toLowerCase() : '';
          if(Object.prototype.hasOwnProperty.call(MUSIC_SCRIPTING_EFFECT_NAMES, normalizedEffect)) {
            effect = MUSIC_SCRIPTING_EFFECT_NAMES[normalizedEffect];
          } else if(
            !Number.isSafeInteger(effect) ||
            !Object.prototype.hasOwnProperty.call(MUSIC_SCRIPTING_EFFECT_NUMBERS, effect)
          ) {
            throw new Error('Effect is invalid.');
          }
          var effectParam = typeof command.effectParam === 'undefined' ? 0 : command.effectParam;
          var effectParam2 = typeof command.effectParam2 === 'undefined' ? 0 : command.effectParam2;
          if(effect === 3) {
            effectParam = integer(effectParam, 0, 65535, 'Effect parameter');
            effectParam2 = pitchNumber(effectParam2, 'Effect pitch');
          } else if(effect === 10) {
            if(typeof command.effectParam === 'undefined') {
              throw new Error('Filter effect requires a filter.');
            }
            effectParam = namedId(effectParam, music.filters.filters, 'Filter');
            effectParam2 = integer(effectParam2, 0, 65535, 'Effect parameter');
          } else if(effect === 5 || effect === 6 || effect === 11) {
            effectParam = integer(effectParam, 0, 15, 'Effect parameter');
            effectParam2 = integer(effectParam2, 0, 15, 'Effect parameter');
          } else {
            effectParam = integer(effectParam, 0, 65535, 'Effect parameter');
            effectParam2 = integer(effectParam2, 0, 65535, 'Effect parameter');
          }
          validated.push({
            type: command.type,
            patternId: id,
            position: position(command.position, id),
            effect: effect,
            effectParam: effectParam,
            effectParam2: effectParam2
          });
        break;
        case 'selectPattern':
          validated.push({ type: command.type, patternId: patternId(command.patternId) });
        break;
        case 'setADSR':
          instrumentId(command.instrumentId);
          if(!Array.isArray(command.values) || command.values.length !== 4) {
            throw new Error('ADSR values are invalid.');
          }
          validated.push({
            type: command.type,
            instrumentId: command.instrumentId,
            values: command.values.map(function(value) {
              return integer(value, 0, 15, 'ADSR value');
            })
          });
        break;
        case 'setWavetable':
        case 'setPulsetable':
        case 'setFiltertable':
          validated.push({
            type: command.type,
            instrumentId: instrumentId(command.instrumentId),
            table: table(command.table)
          });
        break;
        case 'playInstrument':
          validated.push({
            type: command.type,
            instrumentId: instrumentId(command.instrumentId),
            pitch: typeof command.pitch === 'undefined' ? 48 : integer(command.pitch, 0, 95, 'Pitch'),
            duration: typeof command.duration === 'undefined' ? 4 : integer(command.duration, 1, 256, 'Duration')
          });
        break;
        default:
          throw new Error('The sandbox requested an unsupported command.');
      }
    }
    return validated;
  },

  applySandboxCommands: function(commands) {
    var patterns = Object.create(null);
    var instruments = Object.create(null);
    var music = this.music;

    function getPattern(patternId) {
      if(!Object.prototype.hasOwnProperty.call(patterns, patternId)) {
        patterns[patternId] = new PatternScripting();
        patterns[patternId].init(music, patternId);
      }
      return patterns[patternId];
    }

    function getInstrument(instrumentId) {
      if(!Object.prototype.hasOwnProperty.call(instruments, instrumentId)) {
        instruments[instrumentId] = new InstrumentScripting();
        instruments[instrumentId].init(music, instrumentId);
      }
      return instruments[instrumentId];
    }

    for(var i = 0; i < commands.length; i++) {
      var command = commands[i];
      var pattern;
      var instrument;
      switch(command.type) {
        case 'setChannelEnabled':
          this.setChannelEnabled(command.channel, command.enabled);
        break;
        case 'clearPattern':
          pattern = getPattern(command.patternId);
          pattern.clear();
        break;
        case 'addNote':
          pattern = getPattern(command.patternId);
          pattern.addNote(command.position, command.instrument, command.pitch, command.duration);
        break;
        case 'eraseNote':
          pattern = getPattern(command.patternId);
          pattern.eraseNote(command.position);
        break;
        case 'addEffect':
          pattern = getPattern(command.patternId);
          pattern.addEffect(command.position, command.effect, command.effectParam, command.effectParam2);
        break;
        case 'removeEffect':
          pattern = getPattern(command.patternId);
          pattern.removeEffect(command.position);
        break;
        case 'selectPattern':
          this.selectPatternById(command.patternId);
        break;
        case 'setADSR':
        case 'setWavetable':
        case 'setPulsetable':
        case 'setFiltertable':
        case 'playInstrument':
          instrument = getInstrument(command.instrumentId);
          if(command.type === 'setADSR') {
            instrument.setADSR.apply(instrument, command.values);
          } else if(command.type === 'setWavetable') {
            instrument.setWavetable(command.table);
          } else if(command.type === 'setPulsetable') {
            instrument.setPulsetable(command.table);
          } else if(command.type === 'setFiltertable') {
            instrument.setFiltertable(command.table);
          } else {
            instrument.play(command.pitch, command.duration);
          }
        break;
      }
    }
  },

  execute: function() {

    var content = this.scriptEditor.getDoc().getValue();

    $('#musicScriptOutput').val('');
    JSHINT(content);
    console.log('errors = ');
    console.log(JSHINT.errors);
    console.log(JSHINT.data());

//    this.logError(JSHINT.errors);
//    this.logError(JSHINT.data());
    for(var i = 0; i < JSHINT.errors.length; i++) {
      this.logError('Error on line ' + JSHINT.errors[i].line + ':' + JSHINT.errors[i].reason);
      return;
    }

    if(content != '') {
      var musicScripting = this;
      this.runInSandbox(content, function(result) {
        if(!result.success) {
          musicScripting.logError(result.error || 'Music script execution failed.');
          if(result.stack) {
            musicScripting.logError(result.stack);
          }
          return;
        }

        try {
          var commands = musicScripting.validateSandboxCommands(result.commands);
          musicScripting.applySandboxCommands(commands);
          musicScripting.music.patternView.drawPattern();
          musicScripting.music.patternView.music.updatePattern(
            musicScripting.music.patternView.patternID,
            musicScripting.music.patternView.channel
          );
          musicScripting.logError('Execution Finished.');
        } catch(error) {
          musicScripting.logError(error.message || String(error));
        }
      });
    }
  }
}


InstrumentScripting = function() {
  this.instrumentID = 0;
}

InstrumentScripting.prototype = {
  init: function(music, instrumentID) {
    this.music = music;
    this.instrumentID = instrumentID;
  },

  setADSR: function(a, d, s, r) {
    this.music.instruments.instruments[this.instrumentID].attack = a;
    this.music.instruments.instruments[this.instrumentID].decay = d;
    this.music.instruments.instruments[this.instrumentID].sustain = s;
    this.music.instruments.instruments[this.instrumentID].release = r;    

  },
  setWavetable: function(wavetable) {
    console.log('instrument id = ' + this.instrumentID);
    this.music.instruments.instruments[this.instrumentID].type='advanced';
    this.music.instruments.instruments[this.instrumentID].wavetable = wavetable;
  },


  setPulsetable: function(pulsetable) {
    console.log('instrument id = ' + this.instrumentID);
    this.music.instruments.instruments[this.instrumentID].type='advanced';
    this.music.instruments.instruments[this.instrumentID].pulsetable = pulsetable;
  },

  setFiltertable: function(filtertable) {
    console.log('instrument id = ' + this.instrumentID);
    this.music.instruments.instruments[this.instrumentID].type='advanced';
    this.music.instruments.instruments[this.instrumentID].filtertable = filtertable;
  },

  play: function(pitch, duration) {
    if(typeof pitch == 'undefined') {
      pitch = 48;
    }

    if(typeof duration == 'undefined') {
      duration = 4;
    }

    this.music.updateSid();
    this.music.sidPlayer.testInstrumentSetup();


    this.music.sidPlayer.testInstrumentStart(pitch, false, this.instrumentID);

    var instruments = this;
    setTimeout(function() { 
      instruments.music.sidPlayer.testInstrumentStop();
    }, 600);

  },

}

PatternScripting = function() {
  this.patternID = 0;
}

PatternScripting.prototype = {
  init: function(music, patternID) {
    this.music = music;
    this.patternID = patternID;
  },

  getLength: function() {
    var pattern = this.music.patterns[this.patternID];
    return pattern.getLength();    
  },

  clear: function() {
    var pattern = this.music.patterns[this.patternID];

    pattern.clear();

  },

  logError: function(message) {
    var errors = $('#musicScriptOutput').val();
    errors += message + '\n';
    $('#musicScriptOutput').val(errors);
  },

  filterToNumber: function(filter) {
    for(var i = 0; i < this.music.filters.filters.length; i++) {
      if(this.music.filters.filters[i].name.toLowerCase() == filter.toLowerCase()) {
        return i;
      }
    }
    return false;
  },

  pitchToNumber: function(pitch) {
    if(typeof pitch == 'undefined') {
      pitch = 'c4';
    }

    pitch = pitch.toLowerCase().trim();
    var note = pitch[0];
    var isSharp = pitch[1] == '#';
    var octave = pitch.substring(1);
    if(isSharp) {
      octave = octave.substring(1);
    }

    var notes = {
      'c': 0,
      'd': 2,
      'e': 4,
      'f': 5,
      'g': 7,
      'a': 8,
      'b': 10
    };

    if(!notes.hasOwnProperty(note)) {
      this.logError('Unknown pitch: ' + pitch);
      return false;
    }
    pitch = notes[note];
    if(isSharp) {
      pitch++;
    }
    pitch += octave * 12;

    return pitch;
  },

  addNote: function(position, instrument, pitch, duration) {
    var pattern = this.music.patterns[this.patternID];

    if(typeof position == 'undefined' || typeof instrument == 'undefined') {
      this.logError('addNote arguments: addNote(position, instrument, pitch, duration)');
      return;
    }

    if(typeof pitch == 'undefined') {
      pitch = 'c4';
    }

    if(typeof duration == 'undefined') {
      duration = 1;
    }

    if(position >= pattern.getLength()) {

      this.logError('Cannot add note in position: ' + position + ', pattern length is ' + pattern.getLength());
//      console.log('pattern length is ' + pattern.getLength());
      return;      
    }


    if(!Number.isInteger(pitch)) {
      pitch = this.pitchToNumber(pitch);
      if(pitch === false) {
        return;
      }
//      return;

    }

    if(!Number.isInteger(instrument)) {
      var foundInstrument = false;
      for(var i = 0; i < this.music.instruments.instruments.length; i++) {
        if(this.music.instruments.instruments[i].name.toLowerCase() == instrument.toLowerCase()) {
          foundInstrument = true;
          instrument = i;
          break;
        }
      }
      if(!foundInstrument) {
        this.logError('Unknown instrument: ' + instrument);
        return;
//        alert('Unknown Instrument:' + instrument);
      }
    }

    pattern.addNote(position, instrument, pitch, duration);

  },

  eraseNote: function(position) {
    var pattern = this.music.patterns[this.patternID];

    pattern.eraseNote(position);    
  },

  addEffect: function(position, effect, effectParam, effectParam2) {
    var pattern = this.music.patterns[this.patternID];

    var effects = {
      'ne': 0,
      'l': 17, 
      'pu': 1,
      'pd': 2,
      'pn': 3,
      'v': 4,
      'ad': 5,
      'sr': 6,
      'fon': 10,
      'frc': 11,
      'fc': 12,
      'ft': 14,
      't': 15
    };
    if(!Number.isInteger(effect)) {
      effect = effect.toLowerCase();
      if(effects.hasOwnProperty(effect)) {
        effect = effects[effect];
      } else {
        this.logError('Unknown effect: ' + effect);
//        alert('Unknown effect ' + effect);
        return;
      }
    } else {
      var foundEffect = false;
      for(var key in effects) {
        if(effects.hasOwnProperty(key)) {
          if(effects[key] == effect) {
            foundEffect = true;
            break;
          }
        }
      }
      if(!foundEffect) {
        this.logError('Unknown effect: ' + effect);
//        alert('Unknown Effect: ' + effect);
        return;
      }
    }

    if(position >= pattern.getLength()) {
//      console.log('pattern length is ' + pattern.getLength());
      this.logError('Cannot add effect in position: ' + position + ', pattern length is ' + pattern.getLength());

      return;
    }

    if(effect == 3 && typeof effectParam2 != 'undefined' && !Number.isInteger(effectParam2)) {
      // portamento to note
      effectParam2 = this.pitchToNumber(effectParam2);
    }

    if(effect == 10 && typeof effectParam != 'undefined' && !Number.isInteger(effectParam)) {
      // filter on
      effectParam = this.filterToNumber(effectParam);
    }

    if(effect == 5 || effect == 6) {
      // set attack decay, sustain release
      effectParam = (effectParam << 4) + effectParam2;
    }
    if(effect == 11) {
      // set resonance, channels
      effectParam = (effectParam << 4) + effectParam2;
    }

    pattern.addEffect(position, effect, effectParam, effectParam2);
    console.log(pattern);

  },
  removeEffect: function(position) {
    var pattern = this.music.patterns[this.patternID];

    pattern.removeEffect(position);

  }
}
