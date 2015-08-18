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
var dom5 = require('dom5');
var p = dom5.predicates;

var LintError = require('./lint-error');
var CaseMap = require('./case-map');
var ExpressionParser = require('./expressions').ExpressionParser;

var caseMap = new CaseMap();
var expressionParser = new ExpressionParser();

function getDomModules(analyzer, id) {
  if (!analyzer.__domModuleCahce) {
    analyzer.__domModuleCache = {};
  }
  if (analyzer.__domModuleCache[id]) {
    return analyzer.__domModuleCache[id];
  }
  analyzer.__domModuleCache[id] =
      analyzer.nodeWalkAllDocuments(domModuleForId(id));
  return analyzer.__domModuleCache[id];
}

function domModuleForId(id) {
  return p.AND(p.hasTagName('dom-module'),p.hasAttrValue('id', id));
}

var isTemplate = p.hasTagName('template');
var parentIsTemplate = p.parentMatches(isTemplate);
var twoTemplateAncestors = p.parentMatches(p.AND(isTemplate, parentIsTemplate));

function domModuleTemplates(analyzer, id) {
  var domModules = getDomModules(analyzer,id);
  if (!domModules[0]) {
    return [];
  }
  var templates = [];
  var isOuterTemplate = p.AND(
      isTemplate,
      p.NOT(parentIsTemplate)
  );
  return dom5.nodeWalkAll(domModules[0], isOuterTemplate);
}

function textNodesInDomModuleTemplates(analyzer, id) {
  var templates = domModuleTemplates(analyzer, id);
  var textNodes = [];
  templates.forEach(function(template){
    textNodes = textNodes.concat(dom5.nodeWalkAll(template, p.AND(
      dom5.isTextNode,
      p.NOT(twoTemplateAncestors))));
  });
  return textNodes;
}

/**
 * Returns all the attributes for all elements defined in templates in
 * `dom-modules` with an attribute `id` matching the value of `is`
 * @param  {hydrolysis.Analyzer} analyzer [description]
 * @param  {string} is                    The id to search for
 * @return {Array.<Object>}               A list of all attributes
 */
function allAttributesInDomModule(analyzer, is) {
  var templates = domModuleTemplates(analyzer, is);
  var attrs = [];
  templates.forEach(function(template) {
    attrs = attrs.concat(dom5.treeMap(template, function(node) {
      if (twoTemplateAncestors(node)) {
        return [];
      }
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


function extractBadBindingExpression(text) {
  // 4 cases, {{}, {}}, [[], []]
  var match = text.match(/\{\{([^\}]*)\}(?!\})/) ||
              text.match(/\[\[([^\]]*)\](?!\])/);
  if (!match) {
    var reversed = text.split('').reverse().join('');
    match = reversed.match(/\}\}([^\{]*)\{(?!\{)/) ||
            reversed.match(/\]\]([^\[]*)\[(?!\[)/);
  }
  if (match) {
    return text;
  }
  return undefined;
}

function isBindingExpression(text) {
  var bindingMatch = expressionParser.extractBindingExpression(text);
  return !!bindingMatch || false;
}

function textNodeBindingExpressions(analyzer, is) {
  var expressions = [];
  var textNodes = textNodesInDomModuleTemplates(analyzer, is);
  textNodes.forEach(function(textNode) {
    if (isBindingExpression(textNode.value)) {
      expressions.push({
        expression: textNode.value,
        node: textNode,
        parsed: expressionParser.parseExpression(textNode.value)
      });
    }
  });
  return expressions;
}

function attributeBindingExpressions(analyzer, is) {
  var expressions = [];
  var attributes = allAttributesInDomModule(analyzer, is);
  attributes.forEach(function(attribute) {
    if (attribute.value && isBindingExpression(attribute.value)) {
      expressions.push({
        attribute: attribute,
        expression: attribute.value,
        node: attribute.node,
        name: attribute.name,
        parsed: expressionParser.parseExpression(attribute.value)
      });
    }
  });
  return expressions;
}

function allBindingExpressions(analyzer, is) {
  return textNodeBindingExpressions(analyzer, is)
      .concat(attributeBindingExpressions(analyzer, is));
}

function isBadBindingExpression(text) {
  var bindingMatch = extractBadBindingExpression(text);
  return !!bindingMatch || false;
}

function textNodeBadBindingExpressions(analyzer, is) {
  var expressions = [];
  var textNodes = textNodesInDomModuleTemplates(analyzer, is);
  textNodes.forEach(function(textNode) {
    if (isBadBindingExpression(textNode.value)) {
      expressions.push({
        expression: textNode.value,
        node: textNode,
        parsed: expressionParser.extractBindingExpression(textNode.value)
      });
    }
  });
  return expressions;
}

function attributeBadBindingExpressions(analyzer, is) {
  var expressions = [];
  var attributes = allAttributesInDomModule(analyzer, is);
  attributes.forEach(function(attribute) {
    if (attribute.value && isBadBindingExpression(attribute.value)) {
      expressions.push({
        attribute: attribute,
        expression: attribute.value,
        node: attribute.node,
        name: attribute.name,
        unwrapped: expressionParser.extractBindingExpression(attribute.value)
      });
    }
  });
  return expressions;
}


function badBindingExpressions(analyzer, is) {
  return textNodeBadBindingExpressions(analyzer, is)
      .concat(attributeBadBindingExpressions(analyzer, is));
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
  if (attr.name.indexOf("data-") === 0) {
    return true;
  }
  return false;
}

function lintErrorFromNode(node, message) {
  return new LintError(node.__ownerDocument, node.__locationDetail, message);
}

function lintErrorFromJavascript(htmlNode, javascriptNode, href, message) {
  var jsLoc = javascriptNode.loc.start;
  var newLoc = {
    line: jsLoc.line,
    column: jsLoc.column
  };
  if (href == htmlNode.__ownerDocument) {
    newLoc.line += htmlNode.__locationDetail.line - 1;
    newLoc.column += htmlNode.__locationDetail.column;
  }
  return new LintError(href, newLoc, message);
}

var isCustomElement = p.hasMatchingTagName(/(.+-)+.+/);

var linters = {
  boundVariablesDeclared: function findBindingToClass(analyzer) {
    var undeclaredBindings = [];
    analyzer.elements.forEach(function(element) {
      if (!element.is) return;
      // Find implicit bindings
      var attributeExpressions = attributeBindingExpressions(analyzer, element.is);

      var implicitExpressions = {};
      attributeExpressions.forEach(function(attributeExpression){
        var node = attributeExpression.node;
        var parsed = attributeExpression.parsed;
        var element = analyzer.elementsByTagName[node.tagName];
        if (!element) {
          return;
        }
        var attr = attributeExpression.attribute;
        parsed.keys.forEach(function(key){
          if (!implicitExpressions[key]) {
            implicitExpressions[key] = [];
          }
          implicitExpressions[key].push(attributeExpression);
        });
      });
      var implicitBindings = {};
      Object.keys(implicitExpressions).forEach(function(expression){
        var expressions = implicitExpressions[expression];
        if (expressions.length <= 1) {
          // Allow the binding, but require it to be defined.
          return;
        }
        implicitBindings[expression] = true;
      });

      var textExpressions = textNodeBindingExpressions(analyzer, element.is);
      var expressions = attributeExpressions.concat(textExpressions);
      expressions.forEach(function(expression){
        var parsed = expression.parsed;
        var properties = element.properties || [];
        parsed.methods.forEach(function(method){
          // True if the method patches a property.
          var foundDefinition = false;
          // True if the matched property is a method
          var foundMethod = false;
          properties.forEach(function(property) {
            if (method == property.name) {
              foundMethod = property.type == 'Function';
              foundDefinition = true;
            }
          });
          if (!foundDefinition || !foundMethod) {
            var message;
            if (!foundMethod && foundDefinition) {
              message = "Computed Binding using property '" + method + "', " +
                "which is not a function for element' " + element.is + "'";
            } else {
              message = "Method '" + method + "' not found for element' " +
                element.is + "'";
            }
            undeclaredBindings.push(lintErrorFromNode(expression.node, message));
          }
        });
        parsed.keys.forEach(function(key){
          if (key === '') {
            return;
          }
          if (implicitBindings[key]) {
            return;
          }
          var foundDefinition = false;
          properties.forEach(function(property) {
            if (key == property.name) {
              foundDefinition = true;
            }
          });
          if (!foundDefinition) {
            var message;
            if (expression.name) {
              message = "Property '" + key + "' bound to attribute '" +
                  expression.name + "' not found in 'properties' for element '" +
                  element.is + "'";
            } else {
              message = "Property " + key +
                  " not found in 'properties' for element'" + element.is + "'";
            }
            undeclaredBindings.push(lintErrorFromNode(expression.node, message));
          }
        });
      });
    });
    return undeclaredBindings;
  },
  domModuleAfterPolymer: function domModuleAfterPolymer(analyzer, path) {
    var unorderedModules = [];
    var customElements = analyzer.nodeWalkDocuments(isCustomElement);
    var loadedDoc = analyzer.getLoadedAst(path);
    analyzer.elements.forEach(function(element){
      // Ignore Polymer.Base since it's special.
      if (element.is == "Polymer.Base") return;
      var domModules = getDomModules(analyzer, element.is);
      if (!domModules[0]) {
        return;
      }
      if (domModules.length > 1) {
        domModules.forEach(function(domModule) {
          unorderedModules.push(lintErrorFromNode(domModule, "dom-module " +
            "has a repeated value for id " + element.is + "."));
        });
        return;
      }
      var scriptContent = dom5.getTextContent(element.scriptElement);
      var scriptFinderPredicate = p.hasTextValue(scriptContent);
      var script = dom5.nodeWalk(loadedDoc, scriptFinderPredicate);
      var otherDomModule = dom5.nodeWalkPrior(script, domModuleForId(element.is));
      if (!otherDomModule) {
        var originalDomModule = domModules[0];
        unorderedModules.push(lintErrorFromNode(originalDomModule, "dom-module " +
          "for " + element.is +
          " should be a parent of it or earlier in the document."));
      }
    });
    return unorderedModules;
  },
  elementNotDefined: function elementNotDefined(analyzer) {
    var undefinedElements = [];
    var customElements = analyzer.nodeWalkAllDocuments(isCustomElement);
    customElements.forEach(function(element){
      if (analyzer.elementsByTagName[element.tagName] === undefined) {
        if (element.tagName == "dom-module") {
          /** 
           * dom-module gets created without using Polymer's syntactic sugar.
           * Consequently, we definitely don't want to warn if it doesn't exist 
           */
          return;
        }
        undefinedElements.push(lintErrorFromNode(element, "<" + element.tagName + "> is undefined."));
      }
    });
    return undefinedElements;
  },
  nativeAttributeBinding: function nativeAttributeBinding(analyzer) {
    var badBindings = [];
    analyzer.elements.forEach(function(element) {
      var attributes = attributeBindingExpressions(analyzer, element.is);
      attributes.forEach(function(attr){
        if (isProblematicAttribute(attr)) {
          var node = attr.node;
          badBindings.push(lintErrorFromNode(node, "The expression " + attr.expression +
              " bound to the attribute '"+ attr.name +
              "' should use $= instead of =."));
        }
      });
    });
    return badBindings;
  },
  observerNotFunction: function observerNotFunction(analyzer, path) {
    var badObservers = [];
    // TODO(ajo): get rid of this horrible N^2.
    analyzer.elements.forEach(function(element){
      element.properties.forEach(function(property){
        if (property.observer) {
          var foundObserver = false;
          var observer = property.observer;
          var observerNode = property.observerNode;
          element.properties.forEach(function(property){
            if (foundObserver) return;
            if (property.name == observer) {
              foundObserver = true;
              if (property.type === "Function") return;
              badObservers.push(lintErrorFromJavascript(
                element.scriptElement,
                property.javascriptNode,
                element.contentHref,
                "Observer '" + observer + "' is not a function."));
            }
          });
          if (!foundObserver) {
              badObservers.push(lintErrorFromJavascript(
                element.scriptElement,
                observerNode,
                element.contentHref,
                "Observer '" + observer + "' is undefined."));
          }
        }
      });
    }.bind(this));
    return badObservers;
  },
  unbalancedDelimiters: function unbalancedDelimiters(analyzer) {
    var undeclaredBindings = [];
    analyzer.elements.forEach(function(element) {
      if (!element.is) return;
      var expressions = badBindingExpressions(analyzer, element.is);
      expressions.forEach(function(expression){
        var message = "Expression " + expression.expression + " has unbalanced delimiters";  
        undeclaredBindings.push(lintErrorFromNode(expression.node, message));
      });
    });
    return undeclaredBindings;
  }
};

module.exports = linters;