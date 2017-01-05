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
// jshint esversion: 6
'use strict';
import {polylint} from './polylint';
import * as jsconf_policy from './jsconf-policy';
import * as cliArgs from "command-line-args";
import * as fs from 'fs';
import * as path from 'path';
import * as logging from 'plylog'
import pathIsAbsolute = require('path-is-absolute');

//Trying to import this the TS leads to some really strange errors
var colors = require('colors/safe');

var argumentDefinitions = require('./args').argumentDefinitions;
var logger = logging.getLogger('lint.cli');

const cli = cliArgs(argumentDefinitions);

var usage = cli.getUsage({
  header: "polylint checks Polymer apps for problematic code patterns",
  title: "polylint"
});

export function run(env, args, stdout) {
  return new Promise(function(resolve, reject) {
    var cliOptions;
    try {
      cliOptions = cli.parse();
    } catch (e) {
      console.log(usage);
      resolve();
      return;
    }

    // If the "--quiet"/"-q" flag is ever present, set our global logging to quiet mode.
    if (cliOptions.quiet) {
      logging.setQuiet();
    }

    // If the "--verbose"/"-v" flag is ever present, set our global logging to verbose mode.
    if (cliOptions.verbose) {
      logging.setVerbose();
    }

    logger.debug('got args:', { args: args });
    var options = cli.parse();
    logger.debug('parsed options:', options);

    if (options.help) {
      console.log(usage);
      resolve();
    } else {
      return runWithOptions(options);
    }
  });
}

export function runWithOptions(options) {
  return new Promise(function(resolve, reject) {
    // Check options and dump usage if we find problems.
    var inputsOk = true;
    var inputs = options.input;
    var policyPath = options.policy;

    if (!inputs || !inputs.length) {
      if (options['config-file'] && options['config-field']) {
        const field = options['config-field'];
        try {
          //TODO: This any is bad, but no other types work. Defn for readFileSync on fs may need updating.
          let contents:any = fs.readFileSync(options['config-file']);
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
          logger.error(
              "No input specified and no '" + field + "' found in '" +
              options['config-file'] + "'!"
          );
          inputsOk = false;
        }
      }
    }

    if (options.stdin && inputs.length !== 1) {
      logger.error('Only one input supported in stdin mode');
      inputsOk = false;
    }

    if (!inputsOk) {
      logger.info(usage);
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
      const warningText = colors.red(warning.filename) + ":" +
                        warning.location.line + ":" + warning.location.column +
                        "\n    " + colors.gray(warning.message);
      logger.warn(warningText);
    }

    process.on('uncaughtException', function(err) {
      logger.error('Uncaught exception: ', err);
      fatalFailureOccurred = true;
    });

    process.on('unhandledRejection', function(reason, p) {
      logger.error("Unhandled Rejection at: Promise ", p, " reason: ", reason);
      fatalFailureOccurred = true;
    });

    // Find the bower dir.
    var parentDirs = [];
    var foundBower = false;
    while (!foundBower) {
      const candidatePath = path.resolve.apply(undefined, [options.root].concat(parentDirs).concat([options.bowerdir]));
      if (candidatePath == path.join('/', options.bowerdir)) {
        break;
      }
      try {
        fs.statSync(candidatePath);
        foundBower = true;
      } catch (err) {
        const currDir = path.resolve.apply(undefined, parentDirs);
        parentDirs.push('..');
        const parentDir = path.resolve.apply(undefined, parentDirs);
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


    var lintPromise: Promise<boolean|void|{}> = Promise.resolve(true);
    var content;

    if (options.stdin) {
      content = "";
      lintPromise = lintPromise.then(function(){
        return new Promise(function(resolve, reject) {
          process.stdin.setEncoding('utf8');
          process.stdin.on('readable', function() {
            const chunk = process.stdin.read();
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
        (lintWarnings as any[]).forEach(function(warning){
          // If specified, ignore errors from our transitive dependencies.
          if (options['no-recursion'] && input !== warning.filename) {
            return;
          }
          prettyPrintWarning(warning);
        });
      })
      .catch(function(err){
        logger.error('Error occured while linting', err);
        fatalFailureOccurred = true;
      });
    });

    var exit = function(){
        process.exit(fatalFailureOccurred ? 1 : 0);
    };

    resolve(lintPromise.then(exit));
  });
}
