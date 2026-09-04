(function() {
  'use strict';

  var channel = 'lvllvl-music-scripting-v1';
  var executionTimeout = 2000;

  function workerMain() {
    'use strict';

    var arrayPush = Array.prototype.push;
    var maxCommands = 2000;
    var maxTableCells = 65536;
    var effects = Object.freeze({
      ne: 0,
      l: 17,
      pu: 1,
      pd: 2,
      pn: 3,
      v: 4,
      ad: 5,
      sr: 6,
      fon: 10,
      frc: 11,
      fc: 12,
      ft: 14,
      t: 15
    });
    var effectNumbers = Object.freeze({
      0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true,
      10: true, 11: true, 12: true, 14: true, 15: true, 17: true
    });

    function integer(value, minimum, maximum, name) {
      if(!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new TypeError(name + ' is outside the allowed range');
      }
      return value;
    }

    function shortString(value, name) {
      if(typeof value !== 'string' || value.length === 0 || value.length > 100) {
        throw new TypeError(name + ' is invalid');
      }
      return value;
    }

    function pitchToNumber(pitch) {
      if(typeof pitch === 'undefined') {
        pitch = 'c4';
      }
      if(typeof pitch !== 'string') {
        throw new TypeError('Pitch must be a number or note name');
      }
      if(pitch.length > 20) {
        throw new TypeError('Pitch is invalid');
      }
      pitch = pitch.toLowerCase().trim();
      var match = pitch.match(/^([a-g])(#?)(-?\d+)$/);
      if(!match) {
        throw new TypeError('Unknown pitch: ' + pitch);
      }
      var notes = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 8, b: 10 };
      return integer(
        notes[match[1]] + (match[2] ? 1 : 0) + parseInt(match[3], 10) * 12,
        0,
        95,
        'Pitch'
      );
    }

    self.onmessage = function(event) {
      var request = event.data || {};
      var token = request.token;
      var state = request.state || {};
      var commands = [];
      var tableCellCount = 0;

      function record(command) {
        if(commands.length >= maxCommands) {
          throw new Error('Music script produced too many commands');
        }
        arrayPush.call(commands, command);
      }

      function copyTable(table) {
        if(!Array.isArray(table) || table.length > 256) {
          throw new Error('Instrument table is invalid');
        }
        var copy = [];
        for(var rowIndex = 0; rowIndex < table.length; rowIndex++) {
          var row = table[rowIndex];
          if(!Array.isArray(row) || row.length > 16) {
            throw new Error('Instrument table row is invalid');
          }
          tableCellCount += row.length;
          if(tableCellCount > maxTableCells) {
            throw new Error('Music script instrument tables are too large');
          }
          var rowCopy = [];
          for(var columnIndex = 0; columnIndex < row.length; columnIndex++) {
            var value = row[columnIndex];
            if(!Number.isSafeInteger(value) || value < -65535 || value > 65535) {
              throw new Error('Instrument table value is outside the allowed range');
            }
            arrayPush.call(rowCopy, value);
          }
          arrayPush.call(copy, rowCopy);
        }
        return copy;
      }

      function findNamed(items, name, type) {
        if(typeof name === 'number' && Number.isInteger(name) && items[name]) {
          return name;
        }
        shortString(name, type);
        var normalized = name.toLowerCase();
        for(var i = 0; i < items.length; i++) {
          if(String(items[i].name).toLowerCase() === normalized) {
            return i;
          }
        }
        throw new Error(type + ' not found: ' + name);
      }

      function createPattern(patternId) {
        if(!Number.isInteger(patternId) || !state.patterns[patternId]) {
          throw new Error('Pattern is unavailable');
        }
        var patternLength = integer(state.patterns[patternId].length, 1, 65536, 'Pattern length');
        return Object.freeze({
          getLength: function() {
            return patternLength;
          },
          clear: function() {
            record({ type: 'clearPattern', patternId: patternId });
          },
          filterToNumber: function(filter) {
            return findNamed(state.filters, filter, 'Filter');
          },
          pitchToNumber: pitchToNumber,
          addNote: function(position, instrument, pitch, duration) {
            var normalizedPitch = typeof pitch === 'undefined' ? 48 : pitch;
            if(typeof normalizedPitch === 'string') {
              normalizedPitch = pitchToNumber(normalizedPitch);
            } else {
              normalizedPitch = integer(normalizedPitch, 0, 95, 'Pitch');
            }
            record({
              type: 'addNote',
              patternId: patternId,
              position: integer(position, 0, patternLength - 1, 'Pattern position'),
              instrument: findNamed(state.instruments, instrument, 'Instrument'),
              pitch: normalizedPitch,
              duration: integer(typeof duration === 'undefined' ? 1 : duration, 1, 256, 'Note duration')
            });
          },
          eraseNote: function(position) {
            record({
              type: 'eraseNote',
              patternId: patternId,
              position: integer(position, 0, patternLength - 1, 'Pattern position')
            });
          },
          addEffect: function(position, effect, effectParam, effectParam2) {
            if(typeof effect === 'string') {
              var effectName = shortString(effect, 'Effect').toLowerCase();
              if(!Object.prototype.hasOwnProperty.call(effects, effectName)) {
                throw new Error('Effect is invalid');
              }
              effect = effects[effectName];
            } else if(
              !Number.isSafeInteger(effect) ||
              !Object.prototype.hasOwnProperty.call(effectNumbers, effect)
            ) {
              throw new Error('Effect is invalid');
            }
            if(effect === 3) {
              effectParam = integer(typeof effectParam === 'undefined' ? 0 : effectParam, 0, 65535, 'Effect parameter');
              if(typeof effectParam2 === 'string') {
                effectParam2 = pitchToNumber(effectParam2);
              } else {
                effectParam2 = integer(typeof effectParam2 === 'undefined' ? 0 : effectParam2, 0, 95, 'Effect pitch');
              }
            } else if(effect === 10) {
              effectParam = findNamed(state.filters, effectParam, 'Filter');
              effectParam2 = integer(typeof effectParam2 === 'undefined' ? 0 : effectParam2, 0, 65535, 'Effect parameter');
            } else if(effect === 5 || effect === 6 || effect === 11) {
              effectParam = integer(typeof effectParam === 'undefined' ? 0 : effectParam, 0, 15, 'Effect parameter');
              effectParam2 = integer(typeof effectParam2 === 'undefined' ? 0 : effectParam2, 0, 15, 'Effect parameter');
            } else {
              effectParam = integer(typeof effectParam === 'undefined' ? 0 : effectParam, 0, 65535, 'Effect parameter');
              effectParam2 = integer(typeof effectParam2 === 'undefined' ? 0 : effectParam2, 0, 65535, 'Effect parameter');
            }
            record({
              type: 'addEffect',
              patternId: patternId,
              position: integer(position, 0, patternLength - 1, 'Pattern position'),
              effect: effect,
              effectParam: effectParam,
              effectParam2: effectParam2
            });
          },
          removeEffect: function(position) {
            record({
              type: 'removeEffect',
              patternId: patternId,
              position: integer(position, 0, patternLength - 1, 'Pattern position')
            });
          }
        });
      }

      function createInstrument(instrumentId) {
        if(!Number.isInteger(instrumentId) || !state.instruments[instrumentId]) {
          throw new Error('Instrument is unavailable');
        }
        return Object.freeze({
          setADSR: function(a, d, s, r) {
            record({
              type: 'setADSR',
              instrumentId: instrumentId,
              values: [
                integer(a, 0, 15, 'ADSR value'),
                integer(d, 0, 15, 'ADSR value'),
                integer(s, 0, 15, 'ADSR value'),
                integer(r, 0, 15, 'ADSR value')
              ]
            });
          },
          setWavetable: function(table) {
            record({ type: 'setWavetable', instrumentId: instrumentId, table: copyTable(table) });
          },
          setPulsetable: function(table) {
            record({ type: 'setPulsetable', instrumentId: instrumentId, table: copyTable(table) });
          },
          setFiltertable: function(table) {
            record({ type: 'setFiltertable', instrumentId: instrumentId, table: copyTable(table) });
          },
          play: function(pitch, duration) {
            record({
              type: 'playInstrument',
              instrumentId: instrumentId,
              pitch: integer(typeof pitch === 'undefined' ? 48 : pitch, 0, 95, 'Pitch'),
              duration: integer(typeof duration === 'undefined' ? 4 : duration, 1, 256, 'Duration')
            });
          }
        });
      }

      var Music = Object.freeze({
        setChannelEnabled: function(channelNumber, enabled) {
          if(typeof enabled !== 'undefined' && typeof enabled !== 'boolean') {
            throw new TypeError('Channel enabled state is invalid');
          }
          record({
            type: 'setChannelEnabled',
            channel: integer(channelNumber, 1, state.channelCount, 'Channel'),
            enabled: typeof enabled === 'undefined' ? true : enabled
          });
        },
        getCurrentPattern: function() {
          return createPattern(state.currentPatternId);
        },
        getPattern: function(name) {
          return createPattern(findNamed(state.patterns, name, 'Pattern'));
        },
        selectPattern: function(name) {
          var patternId = findNamed(state.patterns, name, 'Pattern');
          record({ type: 'selectPattern', patternId: patternId });
          return createPattern(patternId);
        },
        getInstrument: function(name) {
          return createInstrument(findNamed(state.instruments, name, 'Instrument'));
        }
      });

      try {
        var run = new Function(
          'Music',
          'fetch',
          'XMLHttpRequest',
          'WebSocket',
          'EventSource',
          'importScripts',
          '"use strict";\n' + String(request.content || '')
        );
        var unavailable = function() {
          throw new Error('Network access is not available to music scripts');
        };
        run(Music, unavailable, undefined, undefined, undefined, unavailable);
        self.postMessage({ token: token, success: true, commands: commands });
      } catch(error) {
        self.postMessage({
          token: token,
          success: false,
          error: String(error && error.message ? error.message : error).slice(0, 1000),
          stack: String(error && error.stack ? error.stack : '').slice(0, 4000)
        });
      }
    };
  }

  var workerUrl = URL.createObjectURL(new Blob([
    '(' + workerMain.toString() + ')();'
  ], { type: 'text/javascript' }));

  window.addEventListener('message', function(event) {
    var request = event.data || {};
    if(event.source !== parent || request.channel !== channel || request.type !== 'execute') {
      return;
    }

    var worker = new Worker(workerUrl);
    var token = String(request.id) + '-' + Math.random().toString(36).slice(2);
    var completed = false;
    var timeout = setTimeout(function() {
      if(completed) {
        return;
      }
      completed = true;
      worker.terminate();
      parent.postMessage({
        channel: channel,
        type: 'result',
        id: request.id,
        success: false,
        error: 'Music script exceeded the two-second execution limit.'
      }, '*');
    }, executionTimeout);

    worker.onmessage = function(workerEvent) {
      var result = workerEvent.data || {};
      if(completed || result.token !== token) {
        return;
      }
      completed = true;
      clearTimeout(timeout);
      worker.terminate();
      parent.postMessage({
        channel: channel,
        type: 'result',
        id: request.id,
        success: result.success === true,
        commands: result.commands,
        error: result.error,
        stack: result.stack
      }, '*');
    };

    worker.onerror = function() {
      if(completed) {
        return;
      }
      completed = true;
      clearTimeout(timeout);
      worker.terminate();
      parent.postMessage({
        channel: channel,
        type: 'result',
        id: request.id,
        success: false,
        error: 'The isolated music script failed to run.'
      }, '*');
    };

    worker.postMessage({
      token: token,
      content: request.content,
      state: request.state
    });
  });

  parent.postMessage({ channel: channel, type: 'ready' }, '*');
})();
