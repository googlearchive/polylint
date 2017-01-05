/**
 * @license
 * Copyright (c) 2015 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

export const argumentDefinitions = [
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
    name: 'quiet',
    description: 'silence output',
    type: Boolean,
    alias: 'q',
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
