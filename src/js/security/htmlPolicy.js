(function(global) {
  'use strict';

  if(!global.DOMPurify) {
    throw new Error('DOMPurify must load before the application HTML policy');
  }

  var allowedTags = [
    'a', 'b', 'br', 'button', 'canvas', 'col', 'colgroup', 'div', 'fieldset',
    'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'input',
    'label', 'li', 'ol', 'optgroup', 'option', 'p', 'pre', 'select', 'small',
    'span', 'strong', 'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead',
    'tr', 'u', 'ul'
  ];
  var allowedAttributes = [
    'accept', 'alt', 'border', 'checked', 'class', 'cols', 'colspan', 'disabled',
    'draggable', 'for', 'height', 'href', 'id', 'inputmode', 'label', 'max',
    'maxlength', 'min', 'multiple', 'name', 'placeholder', 'readonly', 'rel',
    'role', 'rows', 'rowspan', 'selected', 'size', 'spellcheck', 'src', 'step',
    'style', 'tabindex', 'target', 'title', 'type', 'valign', 'value', 'width'
  ];
  var baseConfig = {
    ALLOWED_ATTR: allowedAttributes,
    ALLOWED_TAGS: allowedTags,
    ALLOW_ARIA_ATTR: true,
    ALLOW_DATA_ATTR: true,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    KEEP_CONTENT: true,
    RETURN_TRUSTED_TYPE: false
  };
  var templateConfig = {};
  for(var baseConfigKey in baseConfig) {
    if(Object.prototype.hasOwnProperty.call(baseConfig, baseConfigKey)) {
      templateConfig[baseConfigKey] = baseConfig[baseConfigKey];
    }
  }
  templateConfig.ALLOWED_TAGS = allowedTags.concat(['style']);
  var svgConfig = {
    ALLOWED_ATTR: [
      'd', 'fill', 'height', 'shape-rendering', 'transform', 'viewBox', 'width',
      'x', 'xmlns', 'y'
    ],
    ALLOWED_TAGS: ['g', 'path', 'rect', 'svg'],
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: false,
    RETURN_TRUSTED_TYPE: false
  };
  var urlAttributes = {
    action: true,
    formaction: true,
    href: true,
    poster: true,
    src: true,
    'xlink:href': true
  };
  var unsafeStyle = /(?:@import|behavior\s*:|-moz-binding|expression\s*\(|url\s*\()/i;

  function isAllowedUrl(value, tagName) {
    var normalized = String(value).replace(/[\u0000-\u0020\u007f-\u009f]/g, '').trim();
    if(normalized.indexOf('\\') !== -1) {
      return false;
    }
    if(normalized === '' || normalized.charAt(0) === '#') {
      return true;
    }
    if(normalized.charAt(0) === '/') {
      return normalized.charAt(1) !== '/';
    }
    if(/^(?:\.\.?\/|[^:/?#]+(?:[/?#]|$))/i.test(normalized)) {
      return true;
    }
    if(/^https?:/i.test(normalized) || /^mailto:/i.test(normalized)) {
      return true;
    }
    if((tagName === 'img' || tagName === 'source') && /^blob:/i.test(normalized)) {
      return true;
    }
    if(
      tagName === 'img' &&
      /^data:image\/(?:gif|jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(normalized)
    ) {
      return true;
    }
    return false;
  }

  global.DOMPurify.addHook('uponSanitizeAttribute', function(node, data) {
    var attributeName = data.attrName.toLowerCase();
    var tagName = node.nodeName.toLowerCase();
    if(attributeName.indexOf('on') === 0 || attributeName === 'srcdoc') {
      data.keepAttr = false;
      return;
    }
    if(attributeName === 'style' && unsafeStyle.test(data.attrValue)) {
      data.keepAttr = false;
      return;
    }
    if(urlAttributes[attributeName] && !isAllowedUrl(data.attrValue, tagName)) {
      data.keepAttr = false;
    }
  });

  global.DOMPurify.addHook('afterSanitizeAttributes', function(node) {
    if(node.getAttribute && node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });

  function normalizeMarkup(value) {
    return String(value == null ? '' : value);
  }

  function sanitizeString(value, allowStyleElements) {
    return global.DOMPurify.sanitize(
      normalizeMarkup(value),
      allowStyleElements ? templateConfig : baseConfig
    );
  }

  function sanitizeSvgString(value) {
    return global.DOMPurify.sanitize(normalizeMarkup(value), svgConfig);
  }

  function normalizeRasterDataUrl(value) {
    var normalized = String(value == null ? '' : value).trim();
    if(!/^data:image\/(?:gif|jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(normalized)) {
      return null;
    }
    return normalized;
  }

  function validateScriptUrl(value) {
    var url = new URL(String(value), document.baseURI);
    if(url.origin !== location.origin) {
      throw new TypeError('Only same-origin application scripts may be loaded dynamically');
    }
    return url.href;
  }

  var htmlPolicy = null;
  var templatePolicy = null;
  var svgPolicy = null;
  if(global.trustedTypes) {
    htmlPolicy = global.trustedTypes.createPolicy('lvllvl-html', {
      createHTML: function(value) {
        return sanitizeString(value, false);
      }
    });
    templatePolicy = global.trustedTypes.createPolicy('lvllvl-template', {
      createHTML: function(value) {
        return sanitizeString(value, true);
      }
    });
    svgPolicy = global.trustedTypes.createPolicy('lvllvl-svg', {
      createHTML: sanitizeSvgString
    });
    global.trustedTypes.createPolicy('default', {
      createHTML: function(value) {
        return sanitizeString(value, false);
      },
      createScriptURL: validateScriptUrl
    });
  }

  global.SafeHTML = Object.freeze({
    escape: function(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },
    sanitizeString: function(value) {
      return sanitizeString(value, false);
    },
    sanitizeForJQuery: function(value) {
      return htmlPolicy ? normalizeMarkup(value) : sanitizeString(value, false);
    },
    createSVG: function(value) {
      value = normalizeMarkup(value);
      return svgPolicy ? svgPolicy.createHTML(value) : sanitizeSvgString(value);
    },
    setRasterBackgroundImage: function(element, value) {
      if(!element) {
        return false;
      }

      element.style.backgroundImage = '';
      var normalized = normalizeRasterDataUrl(value);
      if(!normalized) {
        return false;
      }

      element.style.backgroundImage = 'url("' + normalized + '")';
      return true;
    },
    setHTML: function(element, value) {
      value = normalizeMarkup(value);
      element.innerHTML = htmlPolicy ? htmlPolicy.createHTML(value) : sanitizeString(value, false);
    },
    setTemplateHTML: function(element, value) {
      value = normalizeMarkup(value);
      element.innerHTML = templatePolicy ? templatePolicy.createHTML(value) : sanitizeString(value, true);
    }
  });
})(window);
