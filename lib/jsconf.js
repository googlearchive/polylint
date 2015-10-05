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

var estraverse = require('estraverse');
var policy = require('./jsconf-policy');


/** @constructor */
function ParsedScript() {}
/**
 * @see https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API
 * @type Node!
 */
ParsedScript.prototype.ast = {};
/** @type HTMLScriptElement? */
ParsedScript.prototype.script = null;



// To simplify matching JavaScript trees, we turn a set of requirements into a
// Trie-like structure.
// {
//   nodeTypeNameToTrie: {
//     'Identifier': {
//       requirements: [ aTestFunction ],
//       descendants: [],
//     },
//     'AssignmentExpression': {
//       requirements: [],
//       descendants: {
//         'left': {
//           nodeTypeNameToTrie: ...
//         }
//       }
//     }
//   },
//   childPropertyPath: null  // Always/only null in root.
// }
//
// nodeTypeNameToTrie relates the typeName field of an AST node to Trie nodes
// which consist of
//   requirements: a list of test functions that accept the AST node,
//   descendants: maps child property paths to tries that apply to sub-ASTs.
// A child property path is a non-empty dotted property path where '.' separates
// property names, and property names are looked up left to right.
// A child property path of 'children.1' means that the sub-AST is
// (rootASTNode.children[1])

// Some filters might need to check multiple descendants of a given node, but
// this structure does not support that.  When translating a requirement to
// a trie, we simply choose the path which leaves the test function with the
// least amount of remaining work to do.

/** @typedef {string} */
var ChildPropertyPath;

/**
 * Node types.
 *
 * This was produced by running
 * <pre>
 * $ curl https://raw.githubusercontent.com/estree/estree/master/spec.md \
 *   | grep 'type: "' \
 *   | perl -pe 's/^\s+type: (".*?");/  $1: $1,/'
 * </pre>
 *
 * @enum{string}
 */
var NodeTypeName = {
  "Program": "Program",
  "EmptyStatement": "EmptyStatement",
  "BlockStatement": "BlockStatement",
  "ExpressionStatement": "ExpressionStatement",
  "IfStatement": "IfStatement",
  "LabeledStatement": "LabeledStatement",
  "BreakStatement": "BreakStatement",
  "ContinueStatement": "ContinueStatement",
  "WithStatement": "WithStatement",
  "SwitchStatement": "SwitchStatement",
  "ReturnStatement": "ReturnStatement",
  "ThrowStatement": "ThrowStatement",
  "TryStatement": "TryStatement",
  "WhileStatement": "WhileStatement",
  "DoWhileStatement": "DoWhileStatement",
  "ForStatement": "ForStatement",
  "ForInStatement": "ForInStatement",
  "DebuggerStatement": "DebuggerStatement",
  "FunctionDeclaration": "FunctionDeclaration",
  "VariableDeclaration": "VariableDeclaration",
  "VariableDeclarator": "VariableDeclarator",
  "ThisExpression": "ThisExpression",
  "ArrayExpression": "ArrayExpression",
  "ObjectExpression": "ObjectExpression",
  "Property": "Property",
  "FunctionExpression": "FunctionExpression",
  "SequenceExpression": "SequenceExpression",
  "UnaryExpression": "UnaryExpression",
  "BinaryExpression": "BinaryExpression",
  "AssignmentExpression": "AssignmentExpression",
  "UpdateExpression": "UpdateExpression",
  "LogicalExpression": "LogicalExpression",
  "ConditionalExpression": "ConditionalExpression",
  "CallExpression": "CallExpression",
  "NewExpression": "NewExpression",
  "MemberExpression": "MemberExpression",
  "SwitchCase": "SwitchCase",
  "CatchClause": "CatchClause",
  "Identifier": "Identifier",
  "Literal": "Literal"
};

/**
 * A node in a trie that switches on node type names.
 * @param {ChildPropertyPath?} childPropertyPath
 * @constructor
 */
function ASTTypeTrie(childPropertyPath) {
  /** @type {Object<NodeTypeName, ASTTypeTrieEdge>} */
  this.nodeTypeNameToEdge = Object.create(null);
  /** @type {ChildPropertyPath?} */
  this.childPropertyPath = childPropertyPath;
}
/**
 * @param {function (Node)} testFunction
 * @param {NodeTypeName} nodeTypeName
 * @param {...{childPropertyPath: ChildPropertyPath, nodeTypeName: NodeTypeName}} var_args
 */
ASTTypeTrie.prototype.add = function (testFunction, nodeTypeName, var_args) {
  /** @type {ASTTypeTrie} */
  var astTypeTrie = this;
  var currentNodeTypeName = nodeTypeName;

  for (var i = 2, n = arguments.length; i < n; ++i) {
    var edge = astTypeTrie.getEdge(currentNodeTypeName);

    var position = arguments[i];
    var childPropertyPath = position.childPropertyPath;
    if (!childPropertyPath) {
      // Child property paths cannot be empty because '' is ambiguous between
      // [''] and [].
      throw new TypeError('Child property path ' + childPropertyPath);
    }
    if (!Object.hasOwnProperty.call(edge.descendants, childPropertyPath)) {
      edge.descendants[childPropertyPath] = new ASTTypeTrie(childPropertyPath);
    }
    astTypeTrie = edge.descendants[childPropertyPath];
    
    currentNodeTypeName = position.nodeTypeName;
  }

  astTypeTrie.getEdge(currentNodeTypeName).requirements.push(testFunction);
};

/**
 * @param {NodeTypeName} nodeTypeName
 * @return {ASTTypeEdge!}
 */
ASTTypeTrie.prototype.getEdge = function (nodeTypeName) {
  if (!Object.hasOwnProperty.call(this.nodeTypeNameToEdge, NodeTypeName)) {
    this.nodeTypeNameToEdge[nodeTypeName] = new ASTTypeTrieEdge();
  }
  return this.nodeTypeNameToEdge[nodeTypeName];
};

/**
 * Append all requirements applicable to the given node to the given array.
 *
 * @param {Node} astNode
 * @param {Array.<{ edge: ASTTypeTrieEdge, edgeNode: Node}!>!} out
 */
ASTTypeTrie.prototype.lookup = function (astNode, out) {
  var nodeType = astNode.type;
  var nodeTypeNameToEdge = this.nodeTypeNameToEdge;
  if (Object.hasOwnProperty.call(nodeTypeNameToEdge, nodeType)) {
    nodeTypeNameToEdge[nodeType].lookup(astNode, out);
  }
};

/**
 * A portion of an AST trie corresponding to a particular node type.
 * @constructor
 */
function ASTTypeTrieEdge() {
  /** @type {Array.<function(Node)>} */
  this.requirements = [];
  /** @type {Object<ChildPropertyPath, ASTTypeTrie>} */
  this.descendants = Object.create(null);
}

ASTTypeTrieEdge.prototype.lookup = function (astNode, out) {
  if (this.requirements.length) {
    out.push({ edge: this, edgeNode: astNode });
  }
  var descendants = this.descendants;
  for (var childPropertyPath in descendants) {
    if (Object.hasOwnProperty.call(descendants, childPropertyPath)) {
      var childPropertyPathParts = childPropertyPath.split('.');
      var subAstNode = astNode;
      for (var i = 0, n = childPropertyPathParts; i < n; ++i) {
        subAstNode = astNode[childPropertyPathParts[i]];
        if (!subAstNode) { break; }
      }
      if (subAstNode) {
        descendants[childPropertyPath].lookup(subAstNode, out);
      }
    }
  }
};



/**
 * @param {Array<policy.Requirement!>!} requirements
 * @return ASTTypeTrie!
 */
function translateRequirements(requirements, reportViolation) {
  var trie = new ASTTypeTrie(null);
  requirements.forEach(function (requirement) {
    switch (requirements.type) {
    case policy.BANNED_NAME:
      trie.add(
        function (astNode, _, parent) {
          if (parent) {
            switch (parent.type) {
            case NodeTypeName.LabeledStatement:
            case NodeTypeName.BreakStatement:
            case NodeTypeName.ContinueStatement:
              // Don't treat statement labels as equivalent
              // to variable or keyword operator uses.
              return;
            }
          }
          if (requirement.value.indexOf(astNode.name) >= 0) {
            reportViolation(astNode, requirement.error_message);
          }
        },
        NodeTypeName.Identifier);
      break;
      // TODO: handle other types.
    }
  });
  return trie;
}


/**
 * @param {string} path
 * @param {ASTTypeTrie!} typeTrie
 * @param {ParsedScript!} script
 */
function lintScript(path, typeTrie, reportViolation, script) {
  // We use estraverse to walk the tree and feed nodes to the trie.
  estraverse.traverse(
    script.ast,
    {
      enter: function (node, parent) {
        if (!Object.hasOwnProperty.call(NodeTypeName, node.type)) {
          // Issue a fatal warning if we see an unrecognized node type
          // so that we fail-fast when the language is extended.
          reportViolation(node, 'Unrecognized node type ' + node.type);
        } else {
          var edgesAndAstNodes = [];
          typeTrie.lookup(node, edgesAndAstNodes);
          edgesAndAstNodes.forEach(function (edgeAndAstNode) {
            var edge = edgeAndAstNode.edge;
            var edgeNode = edgeAndAstNode.edgeNode;
            edge.requirements.forEach(function (requirement) {
              requirement(edgeNode, node, parent);
            });
          });
        }
      }
    });
}

/**
 * @param {Object.<string, Array.<ParsedScript>>!} pathsToScripts
 *    Relates URLs or file-system paths to SpiderMonkey style ASTs.
 * @param {policy.Policy!} policy
 * @param {{ verbose: boolean, debug: boolean }!} options
 */
function lint(pathsToScripts, policy, options) {
  var warnings = [];

  function reportViolation(path, astNode, message) {
    if (!message) { throw new Error(); }
    warnings.push({
      filename: (astNode.loc && astNode.loc.source) || path,
      location: {
        line: (astNode.loc && astNode.loc.start.line),
        column: (astNode.loc && astNode.loc.start.column)
      },
      message: message,
      fatal: true
    });
  }

  for (var path in pathsToScripts) {
    if (!Object.hasOwnProperty.call(pathsToScripts, path)) {
      continue;
    }
    // Filter the requirements by the script path.
    var requirements = policy.applicableTo(path);
    if (requirements.length) {
      var reporter = reportViolation.bind(null, path);
      // Build a type trie.
      var typeTrie = translateRequirements(requirements, reporter);
      // Check each script in the file.
      pathsToScripts[path].forEach(
        lintScript.bind(null, path, typeTrie, reporter));
    }
  }
  return warnings;
}

module.exports = {
  lint: lint
};
