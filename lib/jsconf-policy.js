/**
 * @license
 * Copyright (c) 2015 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
// jshint esnext:true


/**
 * @enum{number}
 */
const Type = {
  CUSTOM: 1,
  BANNED_DEPENDENCY: 2,
  BANNED_NAME: 3,
  BANNED_PROPERTY: 4,
  BANNED_PROPERTY_READ: 5,
  BANNED_PROPERTY_WRITE: 6,
  RESTRICTED_NAME_CALL: 7,
  RESTRICTED_METHOD_CALL: 8,
  BANNED_CODE_PATTERN: 9,
  BANNED_PROPERTY_CALL: 10
};

/**
 * @param {*} typeName
 * @return {Type|null}
 */
function OptionalType(typeName) {
  if (!typeName) { return null; }
  const type = Type[String(typeName)];
  if ('number' !== typeof type) {
    throw new Error('invalid type ' + type + ': ' + JSON.stringify(typeName));
  }
  return type;
}

/**
 * @param {*} x
 * @return {string|null} the string form of x if x is not nullish.
 */
function OptionalString(x) {
  return x === null || x === undefined ? null : String(x);
}

/**
 * @param {*} x
 * @return {!Array.<string>|null}
 *    an array created by mapping elements of x to String(element)
 *    or null if x is falsey.
 */
function OptionalStringArray(x) {
  if (x) {
    var arr = [];
    for (var i = 0, n = x.length; i < n; ++i) {
      arr[i] = String(x[i]);
    }
    return arr;
  }
  return null;
}

/**
 * @param {*} x
 * @return {Object.<string,boolean>|null}
 */
function OptionalStringSet(x) {
  const strs = OptionalStringArray(x);
  if (strs) {
    const o = Object.create(null);
    for (var i = 0, n = strs.length; i < n; ++i) {
      o[strs[i]] = true;
    }
    return o;
  }
  return null;
}

/**
 * @param {*} x
 * @return {!Array.<RegExp>|null}
 *    an array created by mapping elements of x to RegExp instances
 *    or null if x is falsey.
 */
function OptionalRegExpArray(x) {
  if (x) {
    var arr = [];
    for (var i = 0, n = x.length; i < n; ++i) {
      var el = x[i];
      if (!(el instanceof RegExp)) {
        var javaSource = String(el);
        // Make a best effort to map Java's java.util.regex.Pattern format
        // to JavaScript RegExps.
        // Known problematic cases:
        // 1. JavaScript does not support lookbehind. (?<!..)
        // 2. JavaScript does not support embedded flag regions: (?i:...)
        var flags = '';
        // In java, (?i) specifies the case-insensitivity flag.
        var flagPrefixMatch = javaSource.match(/^\(\?([gimsu])+\)/);
        if (flagPrefixMatch) {
          flags = flagPrefixMatch[1];
          javaSource = javaSource.substring(flagPrefixMatch[0].length);
        }
        var source = javaSource;
        try {
          el = new RegExp(source, flags);
        } catch (e) {
          console.error(e);
          throw new Error(
              'Failed to convert Java-style regex to JavaScript: ' +
              javaSource + ' : ' + e);
        }
      }
      arr[i] = el;
    }
    return arr;
  }
  return null;
}

function OptionalPathFilterFunction(opts) {
  const values = opts.values;
  const regexps = opts.regexps;
  const valueSet = OptionalStringSet(values);
  const regexpArr = OptionalRegExpArray(regexps);
  if (!(valueSet || regexpArr)) {
    return null;
  }
  return function (path) {
    var pathWithUnixPathSegmentSeparators = String(path);
    if (pathWithUnixPathSegmentSeparators.indexOf('/') < 0 &&
        pathWithUnixPathSegmentSeparators.indexOf('\\') >= 0) {
      // This heuristically massages paths to unix style newlines.
      // CAVEAT: Any regex patterns that want to match paths with
      // back-slashes in them may fail as a result.
      pathWithUnixPathSegmentSeparators = pathWithUnixPathSegmentSeparators
        .replace(/\\/g, '/');
    }

    if (valueSet) {
      // Try each path prefix in pathWith...
      var pathPrefix = pathWithUnixPathSegmentSeparators;
      do {
        if (valueSet[pathPrefix] === true) {
          return true;
        }
        var lastPathIndex = pathPrefix.length - 1;
        if (lastPathIndex >= 0 && pathPrefix.charAt(lastPathIndex) === '/') {
          pathPrefix = pathPrefix.substring(0, lastPathIndex);
        } else {
          var lastSlash = pathPrefix.lastIndexOf('/');
          if (lastSlash < 0) { break; }
          pathPrefix = pathPrefix.substring(0, lastSlash + 1);
        }
      } while (pathPrefix);
    }

    if (regexpArr) {
      return regexpArr.some(function (re) {
        if (re.global) { re.lastIndex = 0; }
        return re.test(pathWithUnixPathSegmentSeparators);
      });
    }

    return false;
  };
}

/**
 * @typedef {
 *   error_message: ?string,
 *   whitelist: ?Array.<string>,
 *   whitelist_regexp: ?Array.<string>,
 *   only_apply_to: ?Array.<string>,
 *   only_apply_to_regexp: ?Array.<string>,
 *   type: ?type,
 *   value: ?Array.<string>,
 *   js_module: ?string,
 *   rule_id: ?string,
 * }
 */
var RequirementSpec;

/**
 * @param {!RequirementSpec} spec
 * @constructor
 */
function Requirement(spec) {
  /** @type {string|null} */
  this.error_message = OptionalString(spec.error_message);
  /** @type {Function<string>:boolean|null} */
  this.exclude = OptionalPathFilterFunction(
    { values: spec.whitelist,     regexps: spec.whitelist_regexp });
  /** @type {Function<string>:boolean|null} */
  this.include = OptionalPathFilterFunction(
    { values: spec.only_apply_to, regexps: spec.only_apply_to_regexp });
  if (this.include && this.exclude) {
    throw new Error(
        'Requirement cannot specify both whtielist* and only_apply_to*: ' +
        JSON.stringify(spec));
  }
  /** @type {number|null} */
  this.type = OptionalType(spec.type);
  /** @type {Object.<string, boolean>|null} */
  this.js_module = OptionalString(spec.js_module);
  /** @type {string|null} */
  this.rule_id = OptionalString(spec.rule_id);

  if ((this.type === Type.CUSTOM) ^ (this.js_module !== null)) {
    throw new Error(
        'Only/all custom requirements may/must have a js_module: ' +
        JSON.stringify(spec));
  }

  /** @type {!Array.<string>} */
  this.value = OptionalStringArray(spec.value) || [];
}

/**
 * @constructor
 */
function Policy(requirements) {
  this.requirements = requirements.slice();
}
/**
 * @param {string} path
 * @return {!Array.<Requirement>}
 */
Policy.prototype.applicableTo = function (path) {
  return this.requirements.filter(
    function (requirement) {
      return (
          (!requirement.include || requirement.include(path)) &&
          !(requirement.exclude && requirement.exclude(path))
      );
    }
  );
};

/**
 * A policy derived from JSConformance requirements.
 *
 * @param {!{requirement: Array.<RequirementSpec>}}
 *   An object following the conventions of
 *   http://tinyurl.com/jsconformance-docs .
 *   Values for this parameter may be obtained by parsing the
 *   JSON representation of
 *   https://github.com/google/closure-compiler/blob/master
 *   /src/com/google/javascript/jscomp/conformance.proto
 * @return {Policy} A policy that allows finding the set of requirements to
 *    apply to a given file.
 */
function fromRequirements(conformanceConfig) {
  const requirementSpecs = conformanceConfig.requirement;
  if (!Array.isArray(requirementSpecs)) {
    throw new Error(
      'missing requirement array: ' + JSON.stringify(conformanceConfig));
  }
  const requirements = requirementSpecs.map(function (requirementSpec) {
    return new Requirement(requirementSpec);
  });
  return new Policy(requirements);
}


module.exports = {
  fromRequirements: fromRequirements,
  Type: Type,
  Policy: Policy,
  Requirement: Requirement
};
