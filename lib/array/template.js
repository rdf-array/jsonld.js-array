/**
 * JSON-LD-array templates: strings with references in braces, after
 * RFC 6570's simple string expansion.
 *
 *   {}        the own value of the member whose definition carries the template
 *   {key}     the value of the member named `key` of the object the template
 *             describes (the member's siblings when the template is on a key)
 *   {../key}  the value of the member named `key` of the enclosing object
 *   {#}       the 1-based position of the element in the array that holds it
 *
 * Substituted values are percent-encoded as IRI components (R2RML's IRI-safe
 * rule) unless the expansion is a blank node label.
 *
 * Copyright (c) 2026 the rdf-array project.
 */
'use strict';

const api = {};
module.exports = api;

const REFERENCE = /\{([^{}]*)\}/g;

/**
 * Percent-encodes every character that is not unreserved in an IRI
 * (ALPHA / DIGIT / "-" / "." / "_" / "~" and the non-ASCII `ucschar`s).
 */
api.iriSafe = value => {
  let out = '';
  for(const char of value) {
    const code = char.codePointAt(0);
    if(code > 127 || /[A-Za-z0-9\-._~]/.test(char)) {
      out += char;
    } else {
      out += '%' + code.toString(16).toUpperCase().padStart(2, '0');
    }
  }
  return out;
};

/**
 * The scalar value a reference denotes, or `undefined` when it has none.
 *
 * @param scope {own, members, parent, index}: the own value, the members of
 *   the object the template describes, the enclosing object's members and
 *   the 1-based position in the enclosing array.
 */
api.lookup = (reference, scope) => {
  if(reference === '') {
    return scope.own;
  }
  if(reference === '#') {
    return scope.index;
  }
  if(reference.startsWith('../')) {
    const parent = scope.parent;
    return parent ? parent[reference.slice(3)] : undefined;
  }
  return scope.members ? scope.members[reference] : undefined;
};

/**
 * The sibling keys a template reads, so they count as consumed.
 */
api.siblingReferences = template => {
  const keys = [];
  for(const match of String(template).matchAll(REFERENCE)) {
    const reference = match[1];
    if(reference !== '' && reference !== '#' && !reference.startsWith('../')) {
      keys.push(reference);
    }
  }
  return keys;
};

/**
 * Expands a template. Returns `null` when a reference has no value, so that
 * no term is produced for it.
 *
 * @param template the template string.
 * @param scope see `lookup`.
 * @param options.encode false to substitute values as they are (blank node
 *   labels); true (default) to percent-encode them as IRI components.
 * @param options.describe a function turning a value into the string that is
 *   substituted (a number's lexical form, for instance).
 */
api.expand = (template, scope, {encode = true, describe} = {}) => {
  let missing = false;
  const expanded = String(template).replace(REFERENCE, (_, reference) => {
    const value = api.lookup(reference, scope);
    if(value === undefined || value === null) {
      missing = true;
      return '';
    }
    const text = describe ? describe(value) : String(value);
    return encode ? api.iriSafe(text) : text;
  });
  return missing ? null : expanded;
};
