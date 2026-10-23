/**
 * JSON-LD-array: conventional JSON to rdf-array through a mapping document.
 * See json-ld-array.md in the rdf-array project.
 *
 * Copyright (c) 2026 the rdf-array project.
 */
'use strict';

const {compileMapping} = require('./mapping');
const {toRDF} = require('./convert');
const {parseJSON} = require('./parse');
const nquads = require('./nquads');
const turtle = require('./turtle');
const terms = require('./terms');
const template = require('./template');

module.exports = {
  compileMapping,
  toRDF,
  parseJSON,
  toNQuads: nquads.serialize,
  toTurtle: turtle.serialize,
  terms,
  template
};
