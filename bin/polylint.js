#!/usr/bin/env node
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
'use strict';
var polylint = require('../polylint');
var colors = require('colors/safe');

var root = process.cwd();
var path = process.argv[2];
if (!path) {
  console.error("Usage: polylint <filename>");
  process.exit(1);
}

function prettyPrintWarning(warning) {
  var warning = colors.red(warning.filename) + ":" +
                warning.location.line + ":" + warning.location.column +
                "\n    " + colors.gray(warning.message);
  console.log(warning);
}

polylint(path, {root: root}).then(function(lintWarnings){
  lintWarnings.forEach(function(warning){
    prettyPrintWarning(warning);
  })
}).catch(function(err){
  console.log(err.stack);
});