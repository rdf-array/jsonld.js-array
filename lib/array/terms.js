/**
 * rdf-array terms for JSON-LD-array: the RDF/JS term shapes jsonld.js already
 * uses (plain objects with `termType` and `value`) plus the Sequence term,
 * `{termType: 'Sequence', elements: [...]}`, whose `value` is its N-Triples
 * style spelling `(e1 e2 ...)`, the spelling rdf-data-factory-array gives.
 *
 * Copyright (c) 2026 the rdf-array project.
 */
'use strict';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

const api = {RDF, XSD};
module.exports = api;

api.namedNode = value => ({termType: 'NamedNode', value});

api.blankNode = value => ({termType: 'BlankNode', value});

api.defaultGraph = () => ({termType: 'DefaultGraph', value: ''});

/**
 * A literal. `language` makes a language-tagged string (with `direction`, an
 * RDF 1.2 directional one); otherwise `datatype` defaults to xsd:string.
 */
api.literal = (value, {datatype, language, direction} = {}) => {
  const term = {
    termType: 'Literal',
    value: String(value),
    language: '',
    datatype: {termType: 'NamedNode', value: datatype || (XSD + 'string')}
  };
  if(language) {
    term.language = language;
    term.datatype.value =
      direction ? RDF + 'dirLangString' : RDF + 'langString';
    if(direction) {
      term.direction = direction;
    }
  }
  return term;
};

/**
 * A sequence term holding the given elements, in order.
 */
api.sequence = elements => {
  const term = {termType: 'Sequence', elements: [...elements]};
  term.value = api.toNTriples(term);
  return term;
};

api.quad = (subject, predicate, object) =>
  ({subject, predicate, object, graph: api.defaultGraph()});

const ESCAPES = {'"': '\\"', '\\': '\\\\', '\n': '\\n', '\r': '\\r'};

api.escapeLiteral = value => value.replace(/["\\\n\r]/g, c => ESCAPES[c]);

/**
 * The N-Triples style spelling of a term, sequences as `(e1 e2 ...)`.
 */
api.toNTriples = term => {
  switch(term.termType) {
    case 'NamedNode':
      return `<${term.value}>`;
    case 'BlankNode':
      return `_:${term.value}`;
    case 'Variable':
      return `?${term.value}`;
    case 'DefaultGraph':
      return '';
    case 'Literal': {
      const lexical = `"${api.escapeLiteral(term.value)}"`;
      if(term.language) {
        return `${lexical}@${term.language}` +
          (term.direction ? `--${term.direction}` : '');
      }
      if(term.datatype && term.datatype.value !== XSD + 'string') {
        return `${lexical}^^<${term.datatype.value}>`;
      }
      return lexical;
    }
    case 'Sequence':
      return `(${term.elements.map(api.toNTriples).join(' ')})`;
    case 'Quad':
      return `<<${api.toNTriples(term.subject)} ` +
        `${api.toNTriples(term.predicate)} ${api.toNTriples(term.object)}>>`;
    default:
      throw new Error(`Unknown term type: ${term.termType}`);
  }
};

api.isNode = term =>
  term && (term.termType === 'NamedNode' || term.termType === 'BlankNode');
