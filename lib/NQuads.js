/*
 * Copyright (c) 2017 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

// TODO: move `NQuads` to its own package
const {NQuads} = require('rdf-canonize');
const terms = require('./array/terms');

// rdf-array: N-Quads-array. rdf-canonize reads and writes every term but the
// sequence, `(e1 e2 ...)`, so a sequence's leaves still go through it.
const SUBJECT = {termType: 'NamedNode', value: 's:'};
const PREDICATE = {termType: 'NamedNode', value: 'p:'};
const GRAPH = {termType: 'DefaultGraph', value: ''};
const PREFIX = '<s:> <p:> ';
const SUFFIX = ' .\n';

const TOKEN = new RegExp([
  '<[^>]*>',
  '_:[^\\s()]*[^\\s().]',
  '"(?:[^"\\\\]|\\\\.)*"(?:\\^\\^<[^>]*>|@[a-zA-Z0-9-]+)?',
  '[().]'
].join('|') + '|\\S+', 'g');

function _tokenize(line) {
  return line.match(TOKEN) || [];
}

// reads the term at tokens[at.i], moving at.i past it
function _readTerm(tokens, at) {
  const token = tokens[at.i++];
  if(token === '(') {
    const elements = [];
    while(tokens[at.i] !== ')') {
      if(at.i >= tokens.length) {
        throw new Error('unterminated sequence');
      }
      elements.push(_readTerm(tokens, at));
    }
    at.i++;
    return terms.sequence(elements);
  }
  if(token === undefined || token === ')' || token === '.') {
    throw new Error(`unexpected ${token}`);
  }
  return NQuads.parse(`${PREFIX}${token}${SUFFIX}`)[0].object;
}

function _readQuad(line) {
  const tokens = _tokenize(line);
  const at = {i: 0};
  const subject = _readTerm(tokens, at);
  const predicate = _readTerm(tokens, at);
  const object = _readTerm(tokens, at);
  let graph = GRAPH;
  if(tokens[at.i] !== '.') {
    graph = _readTerm(tokens, at);
  }
  if(tokens[at.i] !== '.' || at.i !== tokens.length - 1) {
    throw new Error('no end of statement');
  }
  if(subject.termType === 'Literal' || predicate.termType !== 'NamedNode' ||
    !['NamedNode', 'BlankNode', 'DefaultGraph'].includes(graph.termType)) {
    throw new Error('a term in a position it cannot have');
  }
  return {subject, predicate, object, graph};
}

function _writeTerm(term) {
  if(term.termType === 'Sequence') {
    return `(${term.elements.map(_writeTerm).join(' ')})`;
  }
  return NQuads.serializeQuadComponents(SUBJECT, PREDICATE, term, GRAPH)
    .slice(PREFIX.length, -SUFFIX.length);
}

module.exports = {
  /**
   * Parses N-Quads-array, keeping the first of duplicate quads.
   *
   * @param {string} input - The N-Quads-array input to parse.
   *
   * @returns {Array} - An RDF dataset (an array of quads).
   */
  parse(input) {
    if(!input.includes('(')) {
      return NQuads.parse(input);
    }
    const dataset = [];
    const seen = new Set();
    input.split(/\r\n|\n|\r/).forEach((line, index) => {
      if(/^[ \t]*$/.test(line)) {
        return;
      }
      let quad;
      try {
        quad = _readQuad(line);
      } catch(e) {
        throw new Error(`N-Quads parse error on line ${index + 1}.`);
      }
      const key = [quad.subject, quad.predicate, quad.object, quad.graph]
        .map(terms.toNTriples).join(' ');
      if(!seen.has(key)) {
        seen.add(key);
        dataset.push(quad);
      }
    });
    return dataset;
  },

  /**
   * Converts an RDF dataset to sorted N-Quads-array.
   *
   * @param {Array} dataset - The Array of quads RDF dataset to convert.
   *
   * @returns {string} - The N-Quads-array string.
   */
  serialize(dataset) {
    return dataset.map(({subject, predicate, object, graph}) => {
      const name = graph.termType === 'DefaultGraph' ?
        '' : ` ${_writeTerm(graph)}`;
      const start =
        `${_writeTerm(subject)} ${_writeTerm(predicate)} ${_writeTerm(object)}`;
      return `${start}${name} .\n`;
    }).sort().join('');
  }
};
