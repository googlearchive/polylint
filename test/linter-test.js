/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

// jshint node:true
var assert = require('chai').assert;
var path = require('path');

function findWarnings(warningList, filename) {
  var warnings = [];
  for (var i = 0; i < warningList.length; i++) {
    var warning = warningList[i];
    if (warning.filename.indexOf(filename) >= 0) {
      warnings.push(warning);
    }
  }
  return warnings;
}

var testTarget = 'sample/my-element-collection.html';

suite('Linter', function() {
  var polylint = require('../lib/polylint');
  var warnings;
  before(function(done) {
    polylint(testTarget, {root: path.join(__dirname, '..')}).then(function(linterWarnings){
      warnings = linterWarnings;
     console.log(warnings);
      done();
    }).catch(function(err){
      console.log(err.stack);
    });
  });

  test('bind-to-class', function() {
    var w = findWarnings(warnings, 'bind-to-class');
    assert.equal(w.length, 1);
    var warning = w[0];
    assert.equal(warning.location.line, 12);
    // TODO(ajo): Attributes need more detailed location info.
    // assert.equal(warning.location.column, 18);
  });

  test('bind-to-data', function() {
    var w = findWarnings(warnings, 'bind-to-data');
    assert.equal(w.length, 1);
    var warning = w[0];
    assert.equal(warning.location.line, 12);
    // TODO(ajo): Attributes need more detailed location info.
    // assert.equal(warning.location.column, 18);
  });

  test('bound-variables-declared', function() {
    var w = findWarnings(warnings, 'bound-variables-declared');
    assert.equal(w.length, 1);
    var warning = w[0];
    assert.equal(warning.location.line, 12);
    assert.equal(warning.location.column, 11);
    assert.include(warning.message, 'myVar');
  });

  test('compound-binding', function() {
    var w = findWarnings(warnings, 'compound-binding');
    assert.equal(w.length, 1);
    var warning = w[0];
    assert.equal(warning.location.line, 14);
    assert.equal(warning.location.column, 11);
    assert.include(warning.message, 'nestedz');
  });

  test('computed-binding', function() {
    var w = findWarnings(warnings, 'computed-binding');
    assert.equal(w.length, 2);
    assert.include(w[0].message, 'notAFunction');
    assert.include(w[1].message, 'notDefined');
  });

  test('dom-module-after-polymer', function() {
    var w = findWarnings(warnings, 'dom-module-after-polymer');
    assert.equal(w.length, 1);
    var warning = w[0];
    assert.equal(warning.location.line, 16);
    assert.equal(warning.location.column, 1);
    assert.include(warning.message, 'module');
  });

  test('element-not-defined', function() {
    var w = findWarnings(warnings, 'element-not-defined');
    assert.equal(w.length, 2);
    var first = w[0];
    var second = w[1];
    assert.equal(first.location.line, 13);
    assert.equal(first.location.column, 1);
    assert.include(first.message, 'who-defined-this');
    assert.equal(second.location.line, 15);
    assert.equal(second.location.column, 1);
    assert.include(second.message, 'not-me');
  });

  test('implicit-properties', function() {
    var w = findWarnings(warnings, 'implicit-properties');
    assert.equal(w.length, 2);
    var first = w[0];
    var second = w[1];
    assert.equal(first.location.line, 15);
    assert.equal(first.location.column, 3);
    assert.include(first.message, 'stringProp1');
    assert.equal(second.location.line, 16);
    assert.equal(second.location.column, 3);
    assert.include(second.message, 'stringProp2');
  });

  test('number-literal', function() {
    var w = findWarnings(warnings, 'number-literals');
    assert.equal(w.length, 0);
  });

  // TODO(ajo): Parse observers in observers: []
  test('observer-not-function', function() {
    var w = findWarnings(warnings, 'observer-not-function');
    assert.equal(w.length, 4);
    // An observer declared in observers that is a number
    var first = w[0];
    // An observer declared in observers that doesn't exist
    var second = w[1];
    // An observer that exists but is string-valued declared in properties
    var third = w[2];
    // An observer in properties that doesn't exist
    var fourth = w[3];
    assert.equal(first.location.line, 33);
    assert.equal(first.location.column, 7);
    assert.include(first.message, '_computeValue');
    assert.equal(second.location.line, 34);
    assert.equal(second.location.column, 7);
    assert.include(second.message, '_computeValuez');
    assert.equal(third.location.line, 36);
    assert.equal(third.location.column, 5);
    assert.include(third.message, '_brokenObserverChanged');
    assert.equal(fourth.location.line, 29);
    assert.equal(fourth.location.column, 19);
    assert.include(fourth.message, '_brokenObserver2Changed');
  });

  test('string-literals', function() {
    var w = findWarnings(warnings, 'string-literals');
    assert.equal(w.length, 0);
  });

  test('unbalanced-delimiters', function() {
    var w = findWarnings(warnings, 'unbalanced-delimiters');
    assert.equal(w.length, 4);
    w.forEach(function(warning){
      assert.isAbove(warning.location.line, 11);
      assert.isBelow(warning.location.line, 16);
      assert.isAbove(warning.location.column, 10);
      assert.isBelow(warning.location.column, 20);
    });
  });

  test('a11y attributes', function() {
    var w = findWarnings(warnings, 'a11y-attributes');
    assert.equal(w.length, 1);
    // aria-label is bound to a property with $=
    var first = w[0];
    assert.equal(first.location.line, 12);
    assert.include(first.message, 'aria-label');
  });

  test('whitespace', function() {
    var w = findWarnings(warnings, 'whitespace');
    assert.equal(w.length, 1);
    var first = w[0];
    assert.equal(first.location.line, 13);
    assert.include(first.message, 'whiteSpaceNamez');
  });

});
