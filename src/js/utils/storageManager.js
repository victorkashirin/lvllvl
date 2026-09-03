/** Check if storage is persisted already.
  @returns {Promise<boolean>} Promise resolved with true if current origin is
  using persistent storage, false if not, and undefined if the API is not
  present.
*/
async function isStoragePersisted() {
  return await navigator.storage && navigator.storage.persisted ?
    navigator.storage.persisted() :
    undefined;
}

/** Tries to convert to persisted storage.
  @returns {Promise<boolean>} Promise resolved with true if successfully
  persisted the storage, false if not, and undefined if the API is not present.
*/
async function persistStorage(callback) {

  if (!navigator.storage || !navigator.storage.persisted) {

    if(typeof callback != 'undefined') {
      callback('never');
    }

    return "never";
  }

  var persisted = await navigator.storage.persisted();
  if (persisted) {
    if(typeof callback != 'undefined') {
      callback('persisted');
    }

    return "persisted";
  }
      
  var persisted = await navigator.storage.persist();

  if(persisted) {
    if(typeof callback != 'undefined') {
      callback('persisted');
    }

    return "persisted";
  }


  if(typeof callback != 'undefined') {
    callback('never');
  }

  return "never";

}

/** Queries available disk quota.
  @see https://developer.mozilla.org/en-US/docs/Web/API/StorageEstimate
  @returns {Promise<{quota: number, usage: number}>} Promise resolved with
  {quota: number, usage: number} or undefined.
*/
async function showEstimatedQuota() {
  return await navigator.storage && navigator.storage.estimate ?
    navigator.storage.estimate() :
    undefined;
}

/** Tries to persist storage without ever prompting user.
  @returns {Promise<string>}
    "never" In case persisting is not ever possible. Caller don't bother
      asking user for permission.
    "prompt" In case persisting would be possible if prompting user first.
    "persisted" In case this call successfully silently persisted the storage,
      or if it was already persisted.
*/
async function tryPersistWithoutPromtingUser(callback) {
  if (!navigator.storage || !navigator.storage.persisted) {
    callback('never');
    return "never";
  }
  let persisted = await navigator.storage.persisted();
  if (persisted) {
    callback('persisted');
    return "persisted";
  }
  if (!navigator.permissions || !navigator.permissions.query) {
    callback('prompt');
    return "prompt"; // It MAY be successful to prompt. Don't know.
  }
  const permission = await navigator.permissions.query({
    name: "persistent-storage"
  });
  if (permission.status === "granted") {
    persisted = await navigator.storage.persist();
    if (persisted) {
      callback('persisted');
      return "persisted";
    } else {
      throw new Error("Failed to persist");
    }
  }
  if (permission.status === "prompt") {
    callback('prompt');
    return "prompt";
  }
  callback('never');
  return "never";
}

// localForage is intentionally shipped without its Promise polyfill. Keep its
// callback API at this boundary and expose real Promises to the application so
// every caller gets the same synchronous-throw and asynchronous-error handling.
var BrowserStorage = {
  VERSION_POINTER_FORMAT: 'lvllvl-version-pointer-v1',
  PROJECT_SAVE_JOURNAL_KEY: '__lvllvlProjectSaveJournal',
  AUTOSAVE_KEY: '__lvllvlAutosave',

  call: function(method, args) {
    return new Promise(function(resolve, reject) {
      var completed = false;
      var callback = function(error, value) {
        if(completed) {
          return;
        }
        completed = true;

        if(error) {
          reject(error);
        } else {
          resolve(value);
        }
      };

      try {
        localforage[method].apply(localforage, args.concat(callback));
      } catch(error) {
        callback(error);
      }
    });
  },

  withCallback: function(promise, callback) {
    if(typeof callback == 'undefined') {
      return promise;
    }

    return promise.then(function(value) {
      callback(null, value);
      return value;
    }, function(error) {
      callback(error);
      // Callback-style callers have received the failure. Resolve their
      // otherwise-unused return value to avoid an unhandled rejection.
      return undefined;
    });
  },

  getItem: function(key, callback) {
    return this.withCallback(this.call('getItem', [key]), callback);
  },

  setItem: function(key, value, callback) {
    return this.withCallback(this.call('setItem', [key, value]), callback);
  },

  removeItem: function(key, callback) {
    return this.withCallback(this.call('removeItem', [key]), callback);
  },

  createVersionKey: function(key) {
    var suffix = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    if(typeof crypto != 'undefined' && typeof crypto.randomUUID == 'function') {
      suffix = crypto.randomUUID();
    }
    return key + '-version-' + suffix;
  },

  isVersionPointer: function(value) {
    return value !== null &&
      typeof value == 'object' &&
      value.format === this.VERSION_POINTER_FORMAT &&
      typeof value.activeVersion == 'string';
  },

  getVersionedRecord: function(key) {
    var _this = this;
    return this.getItem(key).then(function(pointer) {
      if(!_this.isVersionPointer(pointer)) {
        return {
          legacy: true,
          pointer: pointer,
          value: pointer,
          versionKey: null
        };
      }

      return _this.getItem(pointer.activeVersion).then(function(value) {
        if(value === null || typeof value == 'undefined') {
          throw new Error('The saved version for "' + key + '" is incomplete.');
        }

        return {
          legacy: false,
          pointer: pointer,
          value: value,
          versionKey: pointer.activeVersion
        };
      });
    });
  },

  getVersionedItem: function(key) {
    return this.getVersionedRecord(key).then(function(record) {
      return record.value;
    });
  },

  commitVersioned: function(key, value, versionKey) {
    var _this = this;
    var nextVersionKey = versionKey || this.createVersionKey(key);

    return this.getItem(key).then(function(previousPointer) {
      return _this.setItem(nextVersionKey, value).then(function() {
        var pointer = {
          format: _this.VERSION_POINTER_FORMAT,
          activeVersion: nextVersionKey
        };

        return _this.setItem(key, pointer).then(function() {
          return {
            key: key,
            pointer: pointer,
            previousPointer: previousPointer,
            versionKey: nextVersionKey
          };
        }).catch(function(error) {
          // If publishing the pointer failed, discard only a version that is
          // definitely still unreachable. A failed verification keeps it for
          // journal recovery rather than risking deletion of active data.
          return _this.getItem(key).then(function(currentPointer) {
            if(!_this.isVersionPointer(currentPointer) ||
              currentPointer.activeVersion != nextVersionKey) {
              return _this.removeItem(nextVersionKey).catch(function() {});
            }
          }).catch(function() {}).then(function() {
            throw error;
          });
        });
      });
    });
  },

  cleanupPreviousVersion: function(commit) {
    if(this.isVersionPointer(commit.previousPointer) &&
      commit.previousPointer.activeVersion != commit.versionKey) {
      return this.removeItem(commit.previousPointer.activeVersion).catch(function() {});
    }
    return Promise.resolve();
  }
};
