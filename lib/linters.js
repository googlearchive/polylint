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

function getDomModule(analyzer, id) {
  if (!analyzer.__domModuleCahce) {
    analyzer.__domModuleCache = {};
  }
  if (analyzer.__domModuleCache[id]) {
    return analyzer.__domModuleCache[id];
  }
  analyzer.__domModuleCache[id] =
      analyzer.nodeWalkDocuments(domModuleForId(id));
  return analyzer.__domModuleCache[id];
}

function domModuleForId(id) {
  return p.AND(p.hasTagName('dom-module'),p.hasAttrValue('id', id));
}

function domModuleTemplates(analyzer, id) {
  var domModule = getDomModule(analyzer,id);
  if (!domModule) {
    return [];
  }
  var templates = [];
  var isOuterTemplate = p.AND(
      p.hasTagName('template'),
      p.NOT(p.parentMatches(p.hasTagName('template')))
  );
  return dom5.nodeWalkAll(domModule, isOuterTemplate);
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
  var match = text.match(/\{\{(.*)\}\}/) || text.match(/\[\[(.*)\]\]/);
  if (match && match.length === 2) {
    return match[1];
  }
  return undefined;
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
  var attributes = allAttributesInDomModule(analyzer, is);
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

function isBadBindingExpression(text) {
  var bindingMatch = extractBadBindingExpression(text);
  return !!bindingMatch || false;
}

function textNodeBadBindingExpressions(analyzer, is) {
  var expressions = [];
  var textNodes = textNodesInDomModuleTemplates(analyzer, is);
  textNodes.forEach(function(textNode) {
    if (isBadBindingExpression(textNode.value)) {
      expressions.push({expression: textNode.value, node: textNode});
    }
  });
  return expressions;
}

function attributeBadBindingExpressions(analyzer, is) {
  var expressions = [];
  var attributes = allAttributesInDomModule(analyzer, is);
  attributes.forEach(function(attribute) {
    if (attribute.value && isBadBindingExpression(attribute.value)) {
      expressions.push({expression: attribute.value, node: attribute.node, name: attribute.name});
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
  findBindingToClass: function findBindingToClass(analyzer) {
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
  boundVariablesDeclared: function findBindingToClass(analyzer) {
    var undeclaredBindings = [];
    analyzer.elements.forEach(function(element) {
      if (!element.is) return;
      var expressions = allBindingExpressions(analyzer, element.is);
      expressions.forEach(function(expression){
        var unwrapped = extractBindingExpression(expression.expression);
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
            message = "Variable '" + unwrapped + "' bound to attribute '" +
                expression.name + "' not found in 'properties' for element '" +
                element.is + "'";
          } else {
            message = "Variable " + unwrapped +
                " not found in 'properties' for element'" + element.is + "'";
          }
          undeclaredBindings.push(lintErrorFromNode(expression.node, message));
        }
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
      var domModule = getDomModule(analyzer, element.is);
      if (!domModule) {
        return;
      }
      var scriptContent = dom5.getTextContent(element.scriptElement);
      var scriptFinderPredicate = p.hasTextValue(scriptContent);
      var script = dom5.nodeWalk(loadedDoc, scriptFinderPredicate);
      var otherDomModule = dom5.nodeWalkPrior(script, domModuleForId(element.is));
      if (!otherDomModule) {
        console.log(element.is);
        var originalDomModule = getDomModule(analyzer, element.is);
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