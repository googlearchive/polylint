/**
 * @license
 * Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

// jshint node:true
var assert = require('chai').assert;
var cli = require('../lib/cli');
var sinon = require('sinon');

suite('Linter CLI', function() {
  var opts;

  before(function() {
    opts = {
      input: ['sample/my-element-collection.html'],
      bowerdir: 'bower_components',
      root: process.cwd()
    };
    sinon.stub(process, 'exit');
  });

  after(function() {
    process.exit.restore();
  });

  suite('ignore', function() {
    test('ignores specified paths', function(done) {
      opts.input = ['sample/imports/missing-dependency.html'];
      opts.ignore = ['sample/iamreallynonexistent.html'];
      cli.runWithOptions(opts).then(function() {
        assert.equal(process.exit.calledWithExactly(0), true);
        done();
      }).catch(function(err) {
        done(err);
      });
    });
  });
});
