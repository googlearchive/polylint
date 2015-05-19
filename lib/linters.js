/**
 * @license
 * Copyright (c) 2015 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
'use strict'
var dom5 = require('dom5');
var p = dom5.predicates;

var LintError = require('./lint-error');

function domModuleForId(id) {
  return p.AND(p.hasTagName('dom-module') ,p.hasAttrValue('id', id));
}

function domModuleTemplates(analyzer, id) {
  var domModules = analyzer.nodeWalkDocuments(domModuleForId(id));
  var templates = [];
  var isOuterTemplate = p.AND(
      p.hasTagName('template'),
      p.NOT(p.parentMatches(p.hasTagName('template')))
  );
  domModules.forEach(function(domModule){
    templates = templates.concat(dom5.nodeWalkAll(domModule, isOuterTemplate));
  });
  return templates;
}

function textNodesInDomModuleTemplates(analyzer, id) {
  var templates = domModuleTemplates(analyzer, id);
  var textNodes = [];
  templates.forEach(function(template){
    textNodes = textNodes.concat(dom5.nodeWalkAll(template, dom5.isTextNode));
  });
  return textNodes;
}

/**
 * Returns all the attributes for all elements definied in templates in
 * `dom-modules` with an attribute `id` matching the value of `is`
 * @param  {hydrolysis.Analyzer} analyzer [description]
 * @param  {string} is                    The id to search for
 * @return {Array.<Object>}               A list of all attributes
 */
function allAttributesForIs(analyzer, is) {
  var templates = domModuleTemplates(analyzer, is);
  var attrs = [];
  templates.forEach(function(template) {
    attrs = attrs.concat(dom5.treeMap(template, function(node) {
      if (node.attrs === undefined) {
        return [];
      }
      return node.attrs.map(function(attr){
        attr.node = node;
        return attr;
      });
    }));
  });
  return attrs;
}

function extractBindingExpression(text) {
  var match = text.match(/\{\{(.*)\}\}/) || text.match(/\[\[(.*)\]\]/)
  if (match && match.length == 2) {
    return match[1];
  }
  return undefined;
}

function isBindingExpression(text) {
  var bindingMatch = extractBindingExpression(text);
  return !!bindingMatch || false;
}

function textNodeBindingExpressions(analyzer, is) {
  var expressions = [];
  var textNodes = textNodesInDomModuleTemplates(analyzer, is);
  textNodes.forEach(function(textNode) {
    if (isBindingExpression(textNode.value)) {
      expressions.push({expression: textNode.value, node: textNode});
    }
  });
  return expressions;
}

function attributeBindingExpressions(analyzer, is) {
  var expressions = [];
  var attributes = allAttributesForIs(analyzer, is);
  attributes.forEach(function(attribute) {
    if (attribute.value && isBindingExpression(attribute.value)) {
      expressions.push({expression: attribute.value, node: attribute.node, name: attribute.name});
    }
  });
  return expressions;
}

function allBindingExpressions(analyzer, is) {
  return textNodeBindingExpressions(analyzer, is)
      .concat(attributeBindingExpressions(analyzer, is));
}

/**
 * Applies `mapfn` to the `anaylyzer`'s documents, returning a flattened
 * list of results.
 *
 * @param  {function} predicate A dom5 predicate.
 * @param  {function} mapfn     A function to return to mapping nodes.
 * @return {Array}              A flattened list of the values returned by mapfn.
 */
function nodeMap(analyzer, predicate, mapfn) {
  var nodes = analyzer.nodeWalkDocuments(predicate);
  var values = [];
  nodes.forEach(function(node) {
    var newValues = mapfn(node);
    values = values.concat(newValues);
  });
  return newValues;
}

function isProblematicAttribute(attr) {
  var isLabel = p.hasTagName("for");
  switch(attr.name.toLowerCase()) {
    case "class":
    case "style":
    case "href":
      return true;
    case "for":
      return isLabel(attr.node);
  }
  if (attr.name.indexOf("data-") == 0) {
    return true;
  }
  return false;
}

function lintErrorFromNode(node, message) {
  return new LintError(node.__ownerDocument, node.__locationDetail, message);
}

var linters = {
  findBindingToClass: function findBindingToClass(analyzer) {
    var badBindings = [];
    console.log("Find binding to class");
    analyzer.elements.forEach(function(element) {
      var attributes = attributeBindingExpressions(analyzer, element.is);
      attributes.forEach(function(attr){
        if (isProblematicAttribute(attr)) {
          var node = attr.node;
          console.log("Found bad binding");
          badBindings.push(lintErrorFromNode(node, "The expression " + attr.expression +
              " bound to the attribute '"+ attr.name +
              "' should use $= instead of =."));
        }
      });
    });
    return badBindings;
  },
  boundVariablesDeclared: function findBindingToClass(analyzer) {
    var badBindings = [];
    console.log("Find binding to class");
    analyzer.elements.forEach(function(element) {
      if (!element.is) return;
      var expressions = allBindingExpressions(analyzer, element.is);
      expressions.forEach(function(expression){
        var unwrapped = extractBindingExpression(expression.expression);
        console.log(unwrapped);
        var properties = element.properties || [];
        var foundDefinition = false;
        properties.forEach(function(property) {
          if (unwrapped == property.name) {
            foundDefinition = true;
          }
        });
        if (!foundDefinition) {
          var message;
          if (expression.name) {
            message = "Variable " + unwrapped + " bound to attribute '" +
                expression.name + " not found in 'properties' for element '" +
                element.is + "'";
          } else {
            message = "Variable " + unwrapped +
                " not found in 'properties' for element'" + element.is + "'";
          }
          badBindings.push(lintErrorFromNode(expression.node, message));
        }
      });
    });
    return badBindings;
  }
};

module.exports = linters;