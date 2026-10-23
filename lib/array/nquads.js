/**
 * N-Quads-array: N-Quads whose terms may be sequences, `(e1 e2 ...)`.
 *
 * Copyright (c) 2026 the rdf-array project.
 */
'use strict';

const terms = require('./terms');

const api = {};
module.exports = api;

api.serializeQuad = quad => {
  const graph = quad.graph && quad.graph.termType !== 'DefaultGraph' ?
    ` ${terms.toNTriples(quad.graph)}` : '';
  const t = terms.toNTriples;
  return `${t(quad.subject)} ${t(quad.predicate)} ${t(quad.object)}${graph} .`;
};

api.serialize = quads =>
  quads.map(api.serializeQuad).join('\n') + (quads.length ? '\n' : '');
