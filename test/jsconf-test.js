/**
 * @license
 * Copyright (c) 2015 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

var jsconf = require('../lib/jsconf.js');
var policy = require('../lib/jsconf-policy.js');

var assert = require('assert');
var espree = require('espree');

var EXTERNS = [
  "/** @constructor */ var Window;",
  "/** @type {Window} */ var window;",
  "var Object;",
  "/** @constructor */ var Arguments;",
  "Arguments.prototype.callee;",
  "Arguments.prototype.caller;",
  "/** @type {Arguments} */ var arguments;",
  "/** @constructor ",
  " * @param {*=} opt_message",
  " * @param {*=} opt_file",
  " * @param {*=} opt_line",
  " * @return {!Error}",
  "*/",
  "var Error;",
  "var alert;",
  "var unknown;",
  "/** @constructor */ var ObjectWithNoProps;"
].join('\n');

var DEFAULT_CONFORMANCE = {
  requirement: [
    {
      type: "BANNED_NAME",
      value: 'eval',
      error_message: 'eval is not allowed'
    },

    {
      type: "BANNED_PROPERTY",
      value: 'Arguments.prototype.callee',
      error_message: 'Arguments.prototype.callee is not allowed'
    }
  ]
};


/**
 * Filter from actual any fields not in expected, except for a
 * specific subset.
 * This makes tests less brittle when warnings API is added to.
 */
function filterWarning(actual, expected) {
  var filtered = {};
  for (var k in actual) {
    if (Object.hasOwnProperty.call(actual, k) &&
        (Object.hasOwnProperty.call(expected, k) ||
         WARNING_FIELD_REQUIRED[k] === true)) {
      filtered[k] = actual[k];
    }
  }
  return filtered;
}
var WARNING_FIELD_REQUIRED = {
  message: true,
  filename: true,
  column: false,
  line: false,
  fatal: false
};



function assertJsConformanceWarnings(configuration, inputs, var_args_warnings) {
  var jsConfPolicy = policy.fromRequirements(configuration);
  
  var pathsToScripts = {};
  inputs.forEach(function (input) {
    var path = input.path;
    var ast = input.ast || espree.parse(input.src);
    var scriptList = pathsToScripts[path] || (pathsToScripts[path] = []);
    scriptList.push({
      path: path,
      ast: ast
    });
  });

  var expectedWarnings = Array.prototype.slice.call(arguments, 2);
  var actualWarnings = jsconf.lint(pathsToScripts, jsConfPolicy, {});

  // Require that conformance warnings be fatal.
  actualWarnings.forEach(function (actualWarning) {
    assert(actualWarning.fatal, JSON.stringify(actualWarning));
  });

  var nActualWarnings = actualWarnings.length;
  if (nActualWarnings === expectedWarnings.length) {
    for (var i = 0; i < nActualWarnings; ++i) {
      actualWarnings[i] = filterWarning(actualWarnings[i], expectedWarnings[i]);
    }
  }

  assert.deepEqual(
    actualWarnings,
    expectedWarnings,
    'warnings');
}


describe(
  'jsconf-test',
  function () {
    it(
      'violation1',
      function () {
        var configuration = {
          requirement: [
            {
              type: "BANNED_NAME",
              value: 'eval',
              error_message: 'eval is not allowed'
            }
          ]
        };
        assertJsConformanceWarnings(
          configuration,
          [
            {
              path: 'foo',
              src: 'eval()'
            }
          ],
          {
            message: 'eval is not allowed',
            filename: 'foo'
          });
      });
  }
);
