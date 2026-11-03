/*
 * Copyright (c) 2017-2023 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const JsonLdError = require('./JsonLdError');
const graphTypes = require('./graphTypes');
const types = require('./types');

const {
  REGEX_BCP47,
  addValue: _addValue
} = require('./util');

const {
  handleEvent: _handleEvent
} = require('./events');

// constants
const {
  // RDF,
  RDF_TYPE,
  // RDF_PLAIN_LITERAL,
  // RDF_XML_LITERAL,
  RDF_JSON_LITERAL,
  // RDF_OBJECT,
  // RDF_LANGSTRING,

  // XSD,
  XSD_BOOLEAN,
  XSD_DOUBLE,
  XSD_INTEGER,
  XSD_STRING,
} = require('./constants');

const api = {};
module.exports = api;

/**
 * Converts an RDF dataset to JSON-LD.
 *
 * @param dataset the RDF dataset.
 * @param options the RDF serialization options.
 *
 * @return a Promise that resolves to the JSON-LD output.
 */
api.fromRDF = async (
  dataset,
  options
) => {
  const {
    useRdfType = false,
    useNativeTypes = false,
    rdfDirection = null
  } = options;
  // FIXME: use Maps?
  const defaultGraph = {};
  const graphMap = {'@default': defaultGraph};
  if(rdfDirection) {
    if(rdfDirection === 'compound-literal') {
      throw new JsonLdError(
        'Unsupported rdfDirection value.',
        'jsonld.InvalidRdfDirection',
        {value: rdfDirection});
    } else if(rdfDirection !== 'i18n-datatype') {
      throw new JsonLdError(
        'Unknown rdfDirection value.',
        'jsonld.InvalidRdfDirection',
        {value: rdfDirection});
    }
  }

  for(const quad of dataset) {
    // TODO: change 'name' to 'graph'
    const name = (quad.graph.termType === 'DefaultGraph') ?
      '@default' : quad.graph.value;
    if(!(name in graphMap)) {
      graphMap[name] = {};
    }
    if(name !== '@default' && !(name in defaultGraph)) {
      defaultGraph[name] = {'@id': name};
    }

    const nodeMap = graphMap[name];

    // rdf-array: a sequence has no identifier to put in an @id
    if(quad.subject.termType === 'Sequence') {
      throw new JsonLdError(
        'A sequence cannot be the subject of a JSON-LD node.',
        'jsonld.InvalidRdfSubject',
        {code: 'sequence subject', value: quad.subject.value});
    }

    // get subject, predicate, object
    const s = _nodeId(quad.subject);
    const p = quad.predicate.value;
    const o = quad.object;

    if(!(s in nodeMap)) {
      nodeMap[s] = {'@id': s};
    }
    const node = nodeMap[s];

    const objectNodeId = _nodeId(o);
    const objectIsNode = !!objectNodeId;
    if(objectIsNode && !(objectNodeId in nodeMap)) {
      nodeMap[objectNodeId] = {'@id': objectNodeId};
    }

    if(p === RDF_TYPE && !useRdfType && objectIsNode) {
      _addValue(node, '@type', objectNodeId, {propertyIsArray: true});
      continue;
    }

    const value = _RDFToObject(o, useNativeTypes, rdfDirection, options);
    _addValue(node, p, value, {propertyIsArray: true});
  }

  const result = [];
  const subjects = Object.keys(defaultGraph).sort();
  for(const subject of subjects) {
    const node = defaultGraph[subject];
    if(subject in graphMap) {
      const graph = node['@graph'] = [];
      const graphObject = graphMap[subject];
      const graphSubjects = Object.keys(graphObject).sort();
      for(const graphSubject of graphSubjects) {
        const node = graphObject[graphSubject];
        // only add full subjects to top-level
        if(!graphTypes.isSubjectReference(node)) {
          graph.push(node);
        }
      }
    }
    // only add full subjects to top-level
    if(!graphTypes.isSubjectReference(node)) {
      result.push(node);
    }
  }

  return result;
};

/**
 * Converts an RDF triple object to a JSON-LD object.
 *
 * @param o the RDF triple object to convert.
 * @param useNativeTypes true to output native types, false not to.
 * @param rdfDirection text direction mode [null, i18n-datatype]
 * @param options top level API options
 *
 * @return the JSON-LD object.
 */
function _RDFToObject(o, useNativeTypes, rdfDirection, options) {
  // convert NamedNode/BlankNode object to JSON-LD
  const nodeId = _nodeId(o);
  if(nodeId) {
    return {'@id': nodeId};
  }

  // rdf-array: a sequence term is a @list, a nested sequence a nested @list
  if(o.termType === 'Sequence') {
    return {
      '@list': o.elements.map(element =>
        _RDFToObject(element, useNativeTypes, rdfDirection, options))
    };
  }

  // convert literal to JSON-LD
  const rval = {'@value': o.value};

  // add language
  if(o.language) {
    if(!o.language.match(REGEX_BCP47)) {
      if(options.eventHandler) {
        _handleEvent({
          event: {
            type: ['JsonLdEvent'],
            code: 'invalid @language value',
            level: 'warning',
            message: '@language value must be valid BCP47.',
            details: {
              language: o.language
            }
          },
          options
        });
      }
    }
    rval['@language'] = o.language;
  } else {
    let type = o.datatype.value;
    if(!type) {
      type = XSD_STRING;
    }
    if(type === RDF_JSON_LITERAL) {
      type = '@json';
      try {
        rval['@value'] = JSON.parse(rval['@value']);
      } catch(e) {
        throw new JsonLdError(
          'JSON literal could not be parsed.',
          'jsonld.InvalidJsonLiteral',
          {code: 'invalid JSON literal', value: rval['@value'], cause: e});
      }
    }
    // use native types for certain xsd types
    if(useNativeTypes) {
      if(type === XSD_BOOLEAN) {
        if(rval['@value'] === 'true' || rval['@value'] === '1') {
          rval['@value'] = true;
        } else if(rval['@value'] === 'false' || rval['@value'] === '0') {
          rval['@value'] = false;
        } else {
          rval['@type'] = type;
        }
      } else if(type === XSD_INTEGER) {
        if(types.isNumeric(rval['@value'])) {
          const i = parseInt(rval['@value'], 10);
          if(i.toFixed(0) === rval['@value']) {
            rval['@value'] = i;
          }
        } else {
          rval['@type'] = type;
        }
      } else if(type === XSD_DOUBLE) {
        if(types.isNumeric(rval['@value'])) {
          rval['@value'] = parseFloat(rval['@value']);
        } else {
          rval['@type'] = type;
        }
      } else {
        rval['@type'] = type;
      }
    } else if(rdfDirection === 'i18n-datatype' &&
      type.startsWith('https://www.w3.org/ns/i18n#')) {
      const [, language, direction] = type.split(/[#_]/);
      if(language.length > 0) {
        rval['@language'] = language;
        if(!language.match(REGEX_BCP47)) {
          if(options.eventHandler) {
            _handleEvent({
              event: {
                type: ['JsonLdEvent'],
                code: 'invalid @language value',
                level: 'warning',
                message: '@language value must be valid BCP47.',
                details: {
                  language
                }
              },
              options
            });
          }
        }
      }
      rval['@direction'] = direction;
    } else if(type !== XSD_STRING) {
      rval['@type'] = type;
    }
  }

  return rval;
}

/**
 * Return id for a term. Handles BlankNodes and NamedNodes. Adds a '_:' prefix
 * for BlanksNodes.
 *
 * @param term a term object.
 *
 * @return the Node term id or null.
 */
function _nodeId(term) {
  if(term.termType === 'NamedNode') {
    return term.value;
  } else if(term.termType === 'BlankNode') {
    return '_:' + term.value;
  }
  return null;
}
