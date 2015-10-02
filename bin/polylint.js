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
var jsconf_policy = require('../lib/jsconf-policy');
var colors = require('colors/safe');
var cliArgs = require("command-line-args");
var fs = require('fs');

var cli = cliArgs([
  {
    name: "help",
    type: Boolean,
    alias: "h",
    description: "Print usage."
  },
  {
    name: "bowerdir",
    type: String,
    alias: "b",
    description: "Bower components directory. Defaults to 'bower_components'",
    defaultValue: "bower_components"
  },
  {
    name: "verbose",
    type: Boolean,
    alias: "v",
    description: "Writes verbose logging."
  },
  {
    name: "debug",
    type: Boolean,
    alias: "g",
    description: "Writes debugging trace."
  },
  {
    name: "policy",
    type: String,
    alias: "p",
    description: "Your jsconf.json policy file.",
    defaultValue: null
  },
  {
    name: "root",
    type: String,
    defaultValue: '',
    alias: "r",
    description: (
      "Root directory against which URLs in inputs are resolved."
        + "  If not specified, then the current working directory is used."
    )
  },
  {
    name: "input",
    type: String,
    alias: "i",
    defaultOption: true,
    multiple: true,
    description: (
      "Polymer source files."
        + "  If a directory is specified, it is used as the root"
        + " for resolving relative URLs in the next input."
    )
  },
  {
    name: "no-recursion",
    type: Boolean,
    description: (
      "Only report errors on specified input files, not from their dependencies."
    )
  }
]);

var usage = cli.getUsage({
  header: "polylint checks Polymer apps for problematic code patterns",
  title: "polylint"
});

var options = cli.parse();

if (options.help) {
  console.log(usage);
  process.exit(0);
}

// Check options and dump usage if we find problems.
var inputsOk = true;

var inputs = options.input;
var policyPath = options.policy;

if (!inputs || !inputs.length) {
  console.error('Missing input polymer path');
  inputsOk = false;
}

if (!inputsOk) {
  console.log(usage);
  process.exit(-1);
}

var jsconfPolicyPromise = Promise.resolve(null);
if (options.policy) {
  jsconfPolicyPromise = new Promise(function (fulfill, reject) {
    fs.readFile(
      options.policy,
      { encoding: 'utf8' },
      function (err, fileContent) {
        if (err) {
          reject(err);
        } else {
          try {
            fulfill(jsconf_policy.fromRequirements(JSON.parse(fileContent)));
          } catch (ex) {
            reject(ex);
          }
        }
      });
  });
}


var root = options.root || process.cwd();
// Make sure resolution has a path segment to drop.
// According to URL rules,
// resolving index.html relative to /foo/ produces /foo/index.html, but
// resolving index.html relative to /foo produces /index.html
// is different from resolving index.html relative to /foo/
// This removes any ambiguity between URL resolution rules and file path
// resolution which might lead to confusion.
if (root !== '' && !/[\/\\]$/.test(root)) {
  root += '/';
}


function prettyPrintWarning(warning) {
  var warning = colors.red(warning.filename) + ":" +
                warning.location.line + ":" + warning.location.column +
                "\n    " + colors.gray(warning.message);
  console.log(warning);
}


// Pair inputs with root directories so that for the command line
//     polylint.js foo/ foo/foo.html bar.html other/ main.html
// we kick off three analyses:
// 1. root='foo/'    path='foo.html'
// 2. root='',       path='bar.html'
// 3. root='other/', path='main.html'
(function processInput(inputIndex) {
  if (inputIndex === inputs.length) {
    // We're done.
    return;  // TODO: exit with a signal indicating whether errors occurred.
  }

  // Check whether input is a root directory before picking a root and
  // a path to process.
  var input = inputs[inputIndex];

  // Finally invoke the analyzer.
  polylint(
    input,
    {
      root: root,
      jsconfPolicy: jsconfPolicyPromise,
      redirect: options.bowerdir
    })
    .then(function(lintWarnings){
      lintWarnings.forEach(function(warning){
        // If specified, ignore errors from our transitive dependencies.
        if (options['no-recursion'] &&
            inputs.indexOf(warning.filename) === -1) {
          return;
        }
        prettyPrintWarning(warning);
      });

      // Process any remaining inputs.
      processInput(inputIndex + 1);
    })
    .catch(function(err){
      console.error(err.stack);
    });
}(0));
