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
var hydrolysis = require('hydrolysis');
var linters = require('./lib/linters');

/**
 * Lint the file at path and return warnings.
 *
 * @param {string} href The root import to begin loading from.
 * @param {LoadOptions=} options Any additional options for the load.
 * @return {Promise<Array.<Object>>} A promise that resolves to a list of
 *     potential problems in `href`.
 */
var polylint = function polylint(path, options) {
  console.log("linting");
  if (!options) {
    options = {};
  }
  options.attachAST = true;
  options.filter = function(){
    return false;
  };
  options.redirect = "bower_components";
  return hydrolysis.Analyzer.analyze(path, options).then(function(analyzer){
    console.log("linted");
    var lintErrors = [];
    for (var linter in linters) {
      lintErrors = lintErrors.concat(linters[linter](analyzer));
    }
    return lintErrors;
  }).catch(function(err){
    throw err;
  });
};

module.exports = polylint;