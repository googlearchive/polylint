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
// jshint -W079
var Promise = global.Promise || require('es6-promise').Promise;
// jshint +W079

var argumentDefinitions = [
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
      "Root directory against which URLs in inputs are resolved." +
      "  If not specified, then the current working directory is used."
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
    )
  },
  {
    name: "config-file",
    type: String,
    defaultValue: "bower.json",
    description: (
      "If inputs are specified, look for `config-field` in this JSON file."
    )
  },
  {
    name: "config-field",
    type: String,
    defaultValue: "main",
    description: (
      "If config-file is used for inputs, this field determines which " +
      "file(s) are linted."
    )
  },
  {
    name: "stdin",
    type: Boolean,
    defaultValue: false,
    description: (
      "If true, the file from `input` will be replaced by the contents of stdin." +
      " If true, only one value will be accepted for input."
    )
  },
  {
    name: "no-recursion",
    type: Boolean,
    description: (
      "Only report errors on specified input files, not from their dependencies."
    )
  }
];

var cli = cliArgs(argumentDefinitions);

var usage = cli.getUsage({
  header: "polylint checks Polymer apps for problematic code patterns",
  title: "polylint"
});

function run(env, args, stdout) {
  return new Promise(function(resolve, reject) {
    var options = cli.parse();

    if (options.help) {
      console.log(usage);
      resolve();
    } else {
      return runWithOptions(options);
    }
  });
}

function runWithOptions(options) {
  return new Promise(function(resolve, reject) {
    // Check options and dump usage if we find problems.
    var inputsOk = true;

    var inputs = options.input;
    var policyPath = options.policy;

    if (!inputs || !inputs.length) {
      if (options['config-file'] && options['config-field']) {
        var field = options['config-field'];
        try {
          var contents = fs.readFileSync(options['config-file']);
          contents = JSON.parse(contents);
          if (contents[field] === undefined) {
            inputs = [];
            inputsOk = false;
          } else if (Array.isArray(contents[field])) {
            inputs = contents[field];
          } else {
            inputs = [contents[field]];
          }
        } catch (err) {
          console.error(
              "No input specified and no '" + field + "' found in '" +
              options['config-file'] + "'!"
          );
          inputsOk = false;
        }
      }
    }

    if (options.stdin && inputs.length !== 1) {
      console.error('Only one input supported in stdin mode');
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
      root += path.sep;
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

    process.on('uncaughtException', function(err) {
      console.error('Uncaught exception: ', err);
      fatalFailureOccurred = true;
    });

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
        var currDir = path.resolve.apply(undefined, parentDirs);
        parentDirs.push('..');
        var parentDir = path.resolve.apply(undefined, parentDirs);
        if (currDir == parentDir) {
          // we've reach the root directory
          break;
        }
      }
    }
    if (!foundBower) {
      options.bowerdir = undefined;
    } else {
      options.bowerdir = path.join(path.join.apply(undefined, parentDirs), options.bowerdir);
    }


    var lintPromise = Promise.resolve(true);
    var content;

    if (options.stdin) {
      content = "";
      lintPromise = lintPromise.then(function(){
        return new Promise(function(resolve, reject) {
          process.stdin.setEncoding('utf8');
          process.stdin.on('readable', function() {
            var chunk = process.stdin.read();
            if (chunk !== null) {
              content += chunk;
            }
          });
          process.stdin.on('end', function() {
            resolve(true);
          });
        });
      });
    } else {
      content = undefined;
    }

    inputs.forEach(function(input) {
      // If root has been set by cwd and input is an absolute path that begins with the cwd path,
      // strip the root part of the input path to make the FS resolver not duplicate the root path
      if (!options.root && input.indexOf(root) === 0 && pathIsAbsolute(input)) {
        input = input.substring(root.length);
      }

      // Finally invoke the analyzer.
      lintPromise = lintPromise.then(function() {
        return polylint(
          input,
          {
            root: root,
            jsconfPolicy: jsconfPolicyPromise,
            redirect: options.bowerdir,
            content: content
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
      .catch(function(err){
        console.error(err.stack);
        fatalFailureOccurred = true;
      });
    });

    var exit = function(){
        process.exit(fatalFailureOccurred ? 1 : 0);
    };

    resolve(lintPromise.then(exit));
  });
}

module.exports = {
  run: run,
  runWithOptions: runWithOptions,
  argumentDefinitions: argumentDefinitions,
};
