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
var CaseMap = function CaseMap() {
	this._caseMap = {};
};

CaseMap.prototype = {
  dashToCamelCase: function(dash) {
    var mapped = this._caseMap[dash];
    if (mapped) {
      return mapped;
    }
    // TODO(sjmiles): is rejection test actually helping perf?
    if (dash.indexOf('-') < 0) {
      this._caseMap[dash] = dash;
      return this._caseMap[dash];
    }
    this._caseMap[dash] = dash.replace(/-([a-z])/g, 
      function(m) {
        return m[1].toUpperCase(); 
      }
    );
    return this._caseMap[dash];
  },

  camelToDashCase: function(camel) {
    var mapped = this._caseMap[camel];
    if (mapped) {
      return mapped;
    }
    this._caseMap[camel] = camel.replace(/([a-z][A-Z])/g, 
      function (g) { 
        return g[0] + '-' + g[1].toLowerCase() ;
      }
    );
    return this._caseMap[camel];
  }
};

module.exports = CaseMap;