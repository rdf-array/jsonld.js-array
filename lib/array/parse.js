/**
 * JSON parsing that keeps the lexical form of numbers, so that `1.70` stays
 * `1.70` in an xsd:decimal. Numbers come back as Number objects carrying a
 * `lexical` property; the converter accepts those and plain numbers alike.
 * The lexical form is available where JSON.parse gives the reviver the source
 * text (Node 21+, Chrome 114+); elsewhere it is the number's own spelling.
 *
 * Copyright (c) 2026 the rdf-array project.
 */
'use strict';

const api = {};
module.exports = api;

api.parseJSON = text => JSON.parse(text, (key, value, context) => {
  if(typeof value === 'number') {
    const number = new Number(value);
    number.lexical = (context && typeof context.source === 'string') ?
      context.source : String(value);
    return number;
  }
  return value;
});

/**
 * The numeric value and lexical form of a number, plain or from `parseJSON`.
 */
api.describeNumber = value => {
  if(value instanceof Number) {
    return {number: value.valueOf(), lexical: value.lexical || String(value)};
  }
  return {number: value, lexical: String(value)};
};

/**
 * The JSON kind of a value: 'null', 'array', 'object', 'string', 'number' or
 * 'boolean'.
 */
api.kindOf = value => {
  if(value === null || value === undefined) {
    return 'null';
  }
  if(Array.isArray(value)) {
    return 'array';
  }
  if(value instanceof Number) {
    return 'number';
  }
  const type = typeof value;
  if(type === 'object') {
    return 'object';
  }
  return type;
};
