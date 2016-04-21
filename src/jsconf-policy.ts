/**
 * @license
 * Copyright (c) 2015 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
// jshint node:true
// jshint esversion: 6
'use strict';


/**
 * @fileoverview
 * Defines classes representing JSConformance configurations and functions
 * for deriving them.
 * <p>
 * See <a href="https://docs.google.com/document/d/13Zx-p-GmgPIEig26dFV4Iy9u6wTOLem8o7ScaqT66lA/view">the
 * JSConformance docs</a> for background.
 * <p>
 * JSConformance checks that JavaScript meets a
 * <a href="https://github.com/google/closure-compiler/blob/master/src/com/google/javascript/jscomp/example_conformance_proto.textproto">set of requirements</a>
 * which are specified as a protocol buffer.
 * This port of JSConformance does not depend on protocol buffers.  Instead, it
 * will work with the output of {@code JSON.parse(jsonDumpOfConformanceProto)}.
 * <p>
 * This file uses the term "JSON value domain" which means JavaScript objects
 * that could be the output of {@code JSON.parse}.
 * Specifically, the JSON value domain includes all and only
 * <ul>
 *   <li>Primitive strings, booleans</li>
 *   <li>Primitive numbers except NaN, +/-Infinity</li>
 *   <li>The special value null</li>
 *   <li>Objects all of whose own properties are in the JSON value domain
 *   <li>Arrays with no holes all of whose elements are in the JSON value domain
 * </ul>
 *
 * @author Mike Samuel (mikesamuel@gmail.com)
 */


/**
 * The type of a requirement.  See also
 * <a href="https://docs.google.com/document/d/13Zx-p-GmgPIEig26dFV4Iy9u6wTOLem8o7ScaqT66lA/view"
 * >Requirement Types</a>.
 *
 * @enum{number}
 */

export enum Type {
  CUSTOM = 1,
  BANNED_DEPENDENCY,
  BANNED_NAME,
  BANNED_PROPERTY,
  BANNED_PROPERTY_READ,
  BANNED_PROPERTY_WRITE,
  RESTRICTED_NAME_CALL,
  RESTRICTED_METHOD_CALL,
  BANNED_CODE_PATTERN,
  BANNED_PROPERTY_CALL
}

/**
 * @param {*} typeName
 * @return {Type|null}
 */
function optionalType(typeName) {
  if (!typeName) { return null; }
  var type = Type[String(typeName)];
  if ('number' !== typeof type) {
    throw new Error('invalid type ' + type + ': ' + JSON.stringify(typeName));
  }
  return type;
}

/**
 * @param {*} x
 * @return {string|null} the string form of x if x is not nullish.
 */
function optionalString(x) {
  return x === null || x === undefined ? null : String(x);
}

/**
 * @param {*} x
 * @return {!Array.<string>|null}
 *    an array created by mapping elements of x to String(element)
 *    or null if x is falsey.
 */
function optionalStringArray(x) {
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
function optionalStringSet(x) {
  var strs = optionalStringArray(x);
  if (strs) {
    var o = Object.create(null);
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
function optionalRegExpArray(x) {
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

function optionalPathFilterFunction(opts) {
  var values = opts.values;
  var regexps = opts.regexps;
  var valueSet = optionalStringSet(values);
  var regexpArr = optionalRegExpArray(regexps);
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
interface RequirementSpec {
  error_message?: string;
  whitelist?: Array<string>;
  whitelist_regexp?: Array<string>;
  only_apply_to?: Array<string>;
  only_apply_to_regexp?: Array<string>;
  type?: Type;
  value?: Array<string>;
  js_module?: string;
  rule_id?: string;
}

/**
 * @param {!RequirementSpec} spec
 * @constructor
 */

interface PathFilterFunction{
  values: Array<string>;
  regexps: Array<string>;
}

export class Requirement {
  error_message: string;
  exclude: Function;
  include: Function;
  type: Type;
  js_module: string;
  rule_id: string;
  value: Array<string>;

  constructor(spec){
    /** @type {string|null} */
    this.error_message = optionalString(spec.error_message);
    /** @type {Function<string>:boolean|null} */
    this.exclude = optionalPathFilterFunction(
      { values: spec.whitelist,     regexps: spec.whitelist_regexp });
    /** @type {Function<string>:boolean|null} */
    this.include = optionalPathFilterFunction(
      { values: spec.only_apply_to, regexps: spec.only_apply_to_regexp });
    if (this.include && this.exclude) {
      throw new Error(
          'Requirement cannot specify both whtielist* and only_apply_to*: ' +
          JSON.stringify(spec));
    }
    /** @type {number|null} */
    this.type = optionalType(spec.type);
    /** @type {Object.<string, boolean>|null} */
    this.js_module = optionalString(spec.js_module);
    /** @type {string|null} */
    this.rule_id = optionalString(spec.rule_id);

    if ((this.type === Type.CUSTOM) !== (this.js_module !== null)) {
      throw new Error(
          'Only/all custom requirements may/must have a js_module: ' +
          JSON.stringify(spec));
    }

    /** @type {!Array.<string>} */
    this.value = optionalStringArray(spec.value) || [];
  }
}

/**
 * @constructor
 */
export class Policy {
  requirements: Array<Requirement>;
  constructor(requirements){
    this.requirements = requirements.slice();
  }

/**
 * @param {string} path
 * @return {!Array.<Requirement>}
 */
  applicableTo(path) {
    return this.requirements.filter(
      function (requirement) {
        return (
            (!requirement.include || requirement.include(path)) &&
            !(requirement.exclude && requirement.exclude(path))
        );
      }
    );
  }
}
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
export function fromRequirements(conformanceConfig) {
  var requirementSpecs = conformanceConfig.requirement;
  if (!Array.isArray(requirementSpecs)) {
    throw new Error(
      'missing requirement array: ' + JSON.stringify(conformanceConfig));
  }
  var requirements = requirementSpecs.map(function (requirementSpec) {
    return new Requirement(requirementSpec);
  });
  return new Policy(requirements);
}
