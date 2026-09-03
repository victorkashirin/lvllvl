(function(root) {
  "use strict";

  var apiBase = "https://api.github.com";
  var jsonMediaType = "application/vnd.github+json";
  var rawMediaType = "application/vnd.github.raw+json";

  function encodeSegment(value) {
    return encodeURIComponent(String(value));
  }

  function encodePath(value) {
    return String(value || "")
      .split("/")
      .map(encodeSegment)
      .join("/");
  }

  function encodeBase64(value) {
    var bytes = new TextEncoder().encode(String(value));
    var binary = "";
    for (var offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + 8192));
    }
    return btoa(binary);
  }

  function responseHeaders(headers) {
    var result = {};
    headers.forEach(function(value, name) {
      result[name.toLowerCase()] = value;
    });
    return result;
  }

  function withCallback(promise, callback) {
    if (typeof callback !== "function") return promise;
    return promise.then(function(response) {
      callback(null, response);
      return response;
    }, function(error) {
      callback(error);
      throw error;
    });
  }

  function Requester(auth) {
    this.token = auth && auth.token ? auth.token : "";
  }

  Requester.prototype.request = function(method, endpoint, data, options, callback) {
    options = options || {};
    var url = new URL(endpoint, apiBase);
    var requestOptions = {
      method: method,
      headers: {
        Accept: options.raw ? rawMediaType : jsonMediaType,
        "X-GitHub-Api-Version": "2022-11-28"
      }
    };

    if (this.token) requestOptions.headers.Authorization = "Bearer " + this.token;

    if (method === "GET" && data) {
      Object.keys(data).forEach(function(name) {
        if (data[name] !== undefined && data[name] !== null && data[name] !== "") {
          url.searchParams.set(name, data[name]);
        }
      });
    } else if (data !== undefined && data !== null) {
      requestOptions.headers["Content-Type"] = "application/json";
      requestOptions.body = JSON.stringify(data);
    }

    var promise = fetch(url.toString(), requestOptions).then(async function(response) {
      var body;
      if (response.status === 204) {
        body = true;
      } else if (options.raw) {
        body = await response.text();
      } else {
        var text = await response.text();
        body = text ? JSON.parse(text) : null;
      }

      var result = {
        data: body,
        headers: responseHeaders(response.headers),
        status: response.status,
        statusText: response.statusText
      };

      if (!response.ok) {
        var message = body && body.message ? body.message : response.statusText;
        var error = new Error(message || "GitHub API request failed");
        error.response = result;
        error.status = response.status;
        throw error;
      }

      return result;
    });

    return withCallback(promise, callback);
  };

  function Repository(owner, name, auth) {
    Requester.call(this, auth);
    this.path = "/repos/" + encodeSegment(owner) + "/" + encodeSegment(name);
  }
  Repository.prototype = Object.create(Requester.prototype);
  Repository.prototype.constructor = Repository;

  Repository.prototype.getDetails = function(callback) {
    return this.request("GET", this.path, null, null, callback);
  };

  Repository.prototype.listBranches = function(callback) {
    return this.request("GET", this.path + "/branches", null, null, callback);
  };

  Repository.prototype.getRef = function(ref, callback) {
    return this.request("GET", this.path + "/git/ref/" + encodePath(ref), null, null, callback);
  };

  Repository.prototype.createRef = function(options, callback) {
    return this.request("POST", this.path + "/git/refs", options, null, callback);
  };

  Repository.prototype.createBranch = function(oldBranch, newBranch, callback) {
    var repository = this;
    return this.getRef("heads/" + oldBranch).then(function(response) {
      return repository.createRef({
        ref: "refs/heads/" + newBranch,
        sha: response.data.object.sha
      }, callback);
    });
  };

  Repository.prototype.getCommit = function(sha, callback) {
    return this.request("GET", this.path + "/git/commits/" + encodeSegment(sha), null, null, callback);
  };

  Repository.prototype.getTree = function(tree, callback) {
    var parts = String(tree).split("?", 2);
    var query = parts[1] ? Object.fromEntries(new URLSearchParams(parts[1])) : null;
    return this.request(
      "GET",
      this.path + "/git/trees/" + encodeSegment(parts[0]),
      query,
      null,
      callback
    );
  };

  Repository.prototype.getBlob = function(sha, callback) {
    return this.request(
      "GET",
      this.path + "/git/blobs/" + encodeSegment(sha),
      null,
      { raw: true },
      callback
    );
  };

  Repository.prototype.getBlobAsBase64 = function(sha, callback) {
    return this.request("GET", this.path + "/git/blobs/" + encodeSegment(sha), null, null, callback);
  };

  Repository.prototype.getContents = function(ref, filename, raw, callback) {
    if (typeof raw === "function") {
      callback = raw;
      raw = false;
    }
    return this.request(
      "GET",
      this.path + "/contents/" + encodePath(filename),
      { ref: ref },
      { raw: Boolean(raw) },
      callback
    );
  };

  Repository.prototype.getSha = function(ref, filename, callback) {
    return this.getContents(ref, filename, false, callback);
  };

  Repository.prototype.postBlob = function(blob, callback) {
    return this.request("POST", this.path + "/git/blobs", blob, null, callback);
  };

  Repository.prototype.createBlob = function(content, callback) {
    return this.postBlob({ content: encodeBase64(content), encoding: "base64" }, callback);
  };

  Repository.prototype.createTree = function(tree, baseTree, callback) {
    return this.request("POST", this.path + "/git/trees", {
      tree: tree,
      base_tree: baseTree
    }, null, callback);
  };

  Repository.prototype.commit = function(parent, tree, message, callback) {
    return this.request("POST", this.path + "/git/commits", {
      message: message,
      tree: tree,
      parents: [parent]
    }, null, callback);
  };

  Repository.prototype.updateHead = function(ref, commit, force, callback) {
    if (typeof force === "function") {
      callback = force;
      force = false;
    }
    return this.request("PATCH", this.path + "/git/refs/" + encodePath(ref), {
      sha: commit,
      force: Boolean(force)
    }, null, callback);
  };

  function User(username, auth) {
    Requester.call(this, auth);
    this.username = username;
  }
  User.prototype = Object.create(Requester.prototype);
  User.prototype.constructor = User;

  User.prototype.getProfile = function(callback) {
    var endpoint = this.username ? "/users/" + encodeSegment(this.username) : "/user";
    return this.request("GET", endpoint, null, null, callback);
  };

  User.prototype.createRepo = function(options, callback) {
    return this.request("POST", "/user/repos", options, null, callback);
  };

  function Gist(id, auth) {
    Requester.call(this, auth);
    this.id = id || "";
  }
  Gist.prototype = Object.create(Requester.prototype);
  Gist.prototype.constructor = Gist;

  Gist.prototype.read = function(callback) {
    return this.request("GET", "/gists/" + encodeSegment(this.id), null, null, callback);
  };

  Gist.prototype.create = function(options, callback) {
    var gist = this;
    return this.request("POST", "/gists", options, null, callback).then(function(response) {
      gist.id = response.data.id;
      return response;
    });
  };

  function GitHub(auth) {
    this.auth = auth || {};
  }

  GitHub.prototype.getRepo = function(owner, name) {
    return new Repository(owner, name, this.auth);
  };

  GitHub.prototype.getUser = function(username) {
    return new User(username, this.auth);
  };

  GitHub.prototype.getGist = function(id) {
    return new Gist(id, this.auth);
  };

  root.GitHub = GitHub;
})(typeof window !== "undefined" ? window : globalThis);
