/**
 * @license
 * Copyright (c) 2015 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

var policy = require('../lib/jsconf-policy');
var assert = require('assert');
var fs = require('fs');

describe(
  'policy.fromRequirements("closure_conformance.json")',
  function () {
    var closure_conformance_json = JSON.parse(
      fs.readFileSync('./sample/jsconf/closure_conformance.json', { encoding: 'UTF-8' }));
    var p = policy.fromRequirements(closure_conformance_json);
    it(
      'requirements.length',
      function () {
        assert(p instanceof policy.Policy);
        assert(p.requirements.length === 40);
      }
    );
    it(
      'applicableTo("javascript/closure/dom/safe.js")',
      function () {
        var closureDomSafeRequirements = p.applicableTo(
          'javascript/closure/dom/safe.js');
        assert(closureDomSafeRequirements.length === 34);
      }
    );
    it(
      'applicableTo("Post.*bootstrap_module whitelist_regexp")',
      function () {
        var bm_init = p.applicableTo('Post/foo/bootstrap_module/init.js');
        assert(bm_init.length === 39);
      }
    );
    it(
      'applicableTo("not/mentioned/in/any/path/matcher.js")',
      function () {
        var nm_init = p.applicableTo('not/mentioned/in/any/path/matcher.js');
        assert(nm_init.length === 40);
      }
    );
  }
);
