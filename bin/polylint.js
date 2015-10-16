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
var pathIsAbsolute = require('path-is-absolute');
var path = require('path');

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


/**
 * True iff a fatal error has been reported to the end user.
 * @type {boolean}
 */
var fatalFailureOccurred = false;


function prettyPrintWarning(warning) {
  if (warning.fatal) {
    fatalFailureOccurred = true;
  }
  var warningText = colors.red(warning.filename) + ":" +
                    warning.location.line + ":" + warning.location.column +
                    "\n    " + colors.gray(warning.message);
  console.log(warningText);
}

function handleExceptionFromPromise(err) {
  console.error('Uncaught exception: ', err.stack);
  fatalFailureOccurred = true;
}

process.on('uncaughtException', handleExceptionFromPromise);

process.on('unhandledRejection', function(reason, p) {
  console.error("Unhandled Rejection at: Promise ", p, " reason: ", reason);
  fatalFailureOccurred = true;
});

// Find the bower dir.
var parentDirs = [];
var foundBower = false;
while (!foundBower) {
  var candidatePath = path.resolve.apply(undefined, [options.root].concat(parentDirs).concat([options.bowerdir]));
  if (candidatePath == path.join('/', options.bowerdir)) {
    break;
  }
  try {
    fs.statSync(candidatePath);
    foundBower = true;
  } catch (err) {
    parentDirs.push('..');
  }
}
if (!foundBower) {
  options.bowerdir = undefined;
} else {
  options.bowerdir = path.join(path.join.apply(undefined, parentDirs), options.bowerdir);
}


var lintPromise = Promise.resolve(true);
for(var i = 0; i < inputs.length; i++) {
  // Check whether input is a root directory before picking a root and
  // a path to process.
  var input = inputs[i];

  // If root has been set by cwd and input is an absolute path that begins with the cwd path,
  // strip the root part of the input path to make the FS resolver not duplicate the root path
  if (!options.root && input.indexOf(root) === 0 && pathIsAbsolute(input)) {
    input = input.substring(root.length);
  }

  // Finally invoke the analyzer.
  lintPromise = lintPromise
    .then(function() {
      return polylint(
        input,
        {
          root: root,
          jsconfPolicy: jsconfPolicyPromise,
          redirect: options.bowerdir
        }
      );
    })
    .then(function(lintWarnings){
      lintWarnings.forEach(function(warning){
        // If specified, ignore errors from our transitive dependencies.
        if (options['no-recursion'] && input !== warning.filename) {
          return;
        }
        prettyPrintWarning(warning);
      });
    })
    .catch(handleExceptionFromPromise);
}

function exit() {
  process.exit(fatalFailureOccurred ? 1 : 0);
};

lintPromise
  .then(exit)
  .catch(function (err) {
    handleExceptionFromPromise(err);
    exit();
  });
