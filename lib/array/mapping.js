/**
 * Compiles a JSON-LD-array mapping document: prefixed names are expanded,
 * shorthands normalized, attributes validated. Named maps are compiled once
 * and referred to by name; references are resolved when used, so maps may
 * refer to one another and to themselves.
 *
 * Copyright (c) 2026 the rdf-array project.
 */
'use strict';

const JsonLdError = require('../JsonLdError');
const {RDF} = require('./terms');

const api = {};
module.exports = api;

const ERROR = 'jsonld.ArrayMappingError';
const ROLES = new Set(['identifier', 'type', 'base']);
const TERM_TYPES = new Set(['iri', 'blankNode']);
const SCOPES = new Set(['none', 'root', 'enclosing']);
const OTHERWISE = new Set(['error', 'ignore', 'vocab']);
const KEYED_BY = new Set(['identifier', 'language', 'type']);
const DEFINITION_ATTRIBUTES = new Set([
  'iri', 'role', 'template', 'baseTemplate', 'termType', 'datatype',
  'language', 'direction', 'valueType', 'inverse', 'flatten', 'keyedBy',
  'typeMap', 'propertyMap', 'class', 'identifier', 'groups'
]);

const fail = (message, details = {}) =>
  new JsonLdError(message, ERROR, {code: 'invalid mapping', ...details});

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Compiles a mapping that is embedded in the data as a `mapping` member
 * (the root) or a `propertyMap` member (any object).
 */
api.compileEmbedded = (mapping, value, where) => {
  if(typeof value === 'string') {
    return value;
  }
  return mapping.compilePropertyMap(value, where);
};

function requireString(value, where) {
  if(typeof value !== 'string') {
    throw fail(`"${where}" must be a string.`, {where});
  }
  return value;
}

function compilePolicy(value, where, defaults) {
  if(value === undefined) {
    return {...defaults};
  }
  let policy;
  if(typeof value === 'string') {
    policy = {scope: 'none', otherwise: value};
  } else if(isObject(value)) {
    policy = {
      scope: value.scope === undefined ? 'none' : value.scope,
      otherwise: value.otherwise === undefined ? 'error' : value.otherwise
    };
  } else {
    throw fail(`"${where}" must be a string or an object.`, {where});
  }
  if(!SCOPES.has(policy.scope)) {
    throw fail(`"${where}.scope" must be "none", "root" or "enclosing".`,
      {where});
  }
  if(!OTHERWISE.has(policy.otherwise)) {
    throw fail(`"${where}.otherwise" must be "error", "ignore" or "vocab".`,
      {where});
  }
  return policy;
}

class Compiler {
  constructor(prefixes) {
    this.prefixes = prefixes;
  }

  /**
   * Expands a prefixed name through the mapping's prefixes; anything else is
   * taken as an IRI as written.
   */
  expandIri(value, where) {
    if(typeof value !== 'string') {
      throw fail(`"${where}" must be an IRI or a prefixed name.`, {where});
    }
    const match = /^([A-Za-z][A-Za-z0-9+.-]*):(.*)$/s.exec(value);
    if(match && Object.prototype.hasOwnProperty.call(this.prefixes, match[1])) {
      return this.prefixes[match[1]] + match[2];
    }
    return value;
  }

  classes(value, where) {
    if(value === undefined || value === null) {
      return null;
    }
    const list = Array.isArray(value) ? value : [value];
    return list.map(iri => this.expandIri(iri, where));
  }

  identifier(value, where) {
    if(value === undefined || value === null) {
      return null;
    }
    if(!isObject(value)) {
      throw fail(`"${where}" must be an object with a template or a from.`,
        {where});
    }
    const identifier = {};
    if(value.template !== undefined) {
      identifier.template = requireString(value.template, `${where}.template`);
    }
    if(value.from !== undefined) {
      identifier.from = requireString(value.from, `${where}.from`);
    }
    if(!identifier.template && !identifier.from) {
      throw fail(`"${where}" needs a template or a from.`, {where});
    }
    identifier.termType = this.termType(value.termType, `${where}.termType`);
    return identifier;
  }

  termType(value, where) {
    if(value === undefined) {
      return 'iri';
    }
    if(!TERM_TYPES.has(value)) {
      throw fail(`"${where}" must be "iri" or "blankNode".`, {where});
    }
    return value;
  }

  /**
   * A constant IRI, or `{from: key}` taking the value from a sibling member.
   */
  iriOrFrom(value, where, {expand = true} = {}) {
    if(typeof value === 'string') {
      return expand ? this.expandIri(value, where) : value;
    }
    if(isObject(value) && typeof value.from === 'string') {
      return {from: value.from};
    }
    throw fail(`"${where}" must be a string or {"from": key}.`, {where});
  }

  propertyMapRef(value, where) {
    if(value === undefined || value === null) {
      return null;
    }
    if(typeof value === 'string') {
      return value;
    }
    return this.propertyMap(value, where);
  }

  typeMapRef(value, where) {
    if(value === undefined || value === null) {
      return null;
    }
    if(typeof value === 'string') {
      return value;
    }
    return this.typeMap(value, where);
  }

  propertyMap(map, where) {
    if(!isObject(map)) {
      throw fail(`"${where}" must be an object of key to definition.`, {where});
    }
    const compiled = {};
    for(const [key, definition] of Object.entries(map)) {
      compiled[key] = this.definition(definition, `${where}.${key}`);
    }
    return compiled;
  }

  typeMap(map, where) {
    if(!isObject(map)) {
      throw fail(`"${where}" must be an object of type value to class.`,
        {where});
    }
    const compiled = {};
    for(const [name, definition] of Object.entries(map)) {
      const here = `${where}.${name}`;
      if(typeof definition === 'string') {
        compiled[name] = {iri: this.expandIri(definition, here)};
      } else if(isObject(definition)) {
        compiled[name] = {
          iri: this.expandIri(definition.iri, `${here}.iri`),
          propertyMap: this.propertyMapRef(
            definition.propertyMap, `${here}.propertyMap`),
          groups: this.groups(definition.groups, `${here}.groups`)
        };
      } else {
        throw fail(`"${here}" must be a class IRI or an object.`,
          {where: here});
      }
    }
    return compiled;
  }

  groups(value, where) {
    if(value === undefined || value === null) {
      return null;
    }
    if(!isObject(value)) {
      throw fail(`"${where}" must be an object of group name to definition.`,
        {where});
    }
    const compiled = {};
    for(const [name, group] of Object.entries(value)) {
      const here = `${where}.${name}`;
      if(!isObject(group) || !Array.isArray(group.members)) {
        throw fail(`"${here}" needs an iri and a members array.`,
          {where: here});
      }
      compiled[name] = {
        iri: this.expandIri(group.iri, `${here}.iri`),
        members: group.members.map(m => requireString(m, `${here}.members`)),
        class: this.classes(group.class, `${here}.class`),
        identifier: this.identifier(group.identifier, `${here}.identifier`),
        propertyMap: this.propertyMapRef(
          group.propertyMap, `${here}.propertyMap`)
      };
    }
    return compiled;
  }

  definition(value, where) {
    if(typeof value === 'string') {
      return {iri: this.expandIri(value, where)};
    }
    if(!isObject(value)) {
      throw fail(`"${where}" must be a property IRI or a definition object.`,
        {where});
    }
    for(const attribute of Object.keys(value)) {
      if(!DEFINITION_ATTRIBUTES.has(attribute)) {
        throw fail(`"${where}" has an unknown attribute "${attribute}".`,
          {where, attribute});
      }
    }
    const d = {};
    if(value.iri !== undefined) {
      d.iri = this.iriOrFrom(value.iri, `${where}.iri`);
    }
    if(value.role !== undefined) {
      if(!ROLES.has(value.role)) {
        throw fail(`"${where}.role" must be "identifier", "type" or "base".`,
          {where});
      }
      d.role = value.role;
    }
    if(value.template !== undefined) {
      d.template = requireString(value.template, `${where}.template`);
    }
    if(value.baseTemplate !== undefined) {
      d.baseTemplate = requireString(
        value.baseTemplate, `${where}.baseTemplate`);
    }
    d.termType = this.termType(value.termType, `${where}.termType`);
    if(value.datatype !== undefined) {
      d.datatype = this.iriOrFrom(value.datatype, `${where}.datatype`);
    }
    if(value.language !== undefined) {
      d.language = this.iriOrFrom(value.language, `${where}.language`,
        {expand: false});
    }
    if(value.direction !== undefined) {
      if(value.direction !== 'ltr' && value.direction !== 'rtl') {
        throw fail(`"${where}.direction" must be "ltr" or "rtl".`, {where});
      }
      d.direction = value.direction;
    }
    if(value.valueType !== undefined) {
      if(value.valueType !== 'identifier') {
        throw fail(`"${where}.valueType" must be "identifier" (or be absent ` +
          `for a literal).`, {where});
      }
      d.valueType = 'identifier';
    }
    if(value.inverse !== undefined) {
      d.inverse = value.inverse === true;
    }
    if(value.flatten !== undefined) {
      d.flatten = value.flatten === true;
    }
    if(value.keyedBy !== undefined) {
      d.keyedBy = this.keyedBy(value.keyedBy, `${where}.keyedBy`);
    }
    d.typeMap = this.typeMapRef(value.typeMap, `${where}.typeMap`);
    d.propertyMap = this.propertyMapRef(
      value.propertyMap, `${where}.propertyMap`);
    d.class = this.classes(value.class, `${where}.class`);
    d.identifier = this.identifier(value.identifier, `${where}.identifier`);
    d.groups = this.groups(value.groups, `${where}.groups`);
    if(d.iri === undefined && !d.role && !d.flatten &&
      !(d.keyedBy && d.keyedBy.kind === 'predicate')) {
      throw fail(`"${where}" needs an iri (or a role, flatten, or a keyedBy ` +
        `predicate).`, {where});
    }
    if(d.role && d.role !== 'identifier' && d.template !== undefined) {
      throw fail(`"${where}" has a template but is not an identifier.`,
        {where});
    }
    return d;
  }

  keyedBy(value, where) {
    if(typeof value === 'string') {
      if(!KEYED_BY.has(value)) {
        throw fail(`"${where}" must be "identifier", "language", "type" ` +
          `or an object.`, {where});
      }
      return {kind: value};
    }
    if(!isObject(value)) {
      throw fail(`"${where}" must be a string or an object.`, {where});
    }
    if(value.predicate !== undefined) {
      if(!isObject(value.predicate) ||
        typeof value.predicate.template !== 'string') {
        throw fail(`"${where}.predicate" must be {"template": ...}.`, {where});
      }
      return {kind: 'predicate', template: value.predicate.template};
    }
    if(value.property !== undefined) {
      return {
        kind: 'property',
        property: this.expandIri(value.property, `${where}.property`),
        valueProperty: value.valueProperty === undefined ?
          RDF + 'value' :
          this.expandIri(value.valueProperty, `${where}.valueProperty`)
      };
    }
    throw fail(`"${where}" needs a property or a predicate.`, {where});
  }
}

/**
 * Compiles a mapping document.
 *
 * @param doc the mapping document (a parsed JSON object).
 * @return the compiled mapping.
 */
api.compileMapping = doc => {
  if(!isObject(doc)) {
    throw fail('The mapping must be a JSON object.');
  }
  const prefixes = doc.prefixes || {};
  if(!isObject(prefixes)) {
    throw fail('"prefixes" must be an object of prefix to IRI.');
  }
  for(const [prefix, iri] of Object.entries(prefixes)) {
    if(typeof iri !== 'string') {
      throw fail(`The prefix "${prefix}" must map to an IRI string.`, {prefix});
    }
  }
  const compiler = new Compiler(prefixes);
  const mapping = {
    prefixes,
    base: doc.base === undefined ? null : requireString(doc.base, 'base'),
    vocab: doc.vocab === undefined ? null : requireString(doc.vocab, 'vocab'),
    unmappedKeys: compilePolicy(doc.unmappedKeys, 'unmappedKeys',
      {scope: 'none', otherwise: 'error'}),
    namedPropertyMaps: {},
    namedTypeMaps: {},
    propertyMap: null,
    typeMap: null,
    identifier: null,
    class: null,
    groups: null
  };
  mapping.unmappedTypes = compilePolicy(
    doc.unmappedTypes, 'unmappedTypes', mapping.unmappedKeys);
  for(const [name, map] of Object.entries(doc.namedPropertyMaps || {})) {
    mapping.namedPropertyMaps[name] =
      compiler.propertyMap(map, `namedPropertyMaps.${name}`);
  }
  for(const [name, map] of Object.entries(doc.namedTypeMaps || {})) {
    mapping.namedTypeMaps[name] =
      compiler.typeMap(map, `namedTypeMaps.${name}`);
  }
  mapping.propertyMap = compiler.propertyMapRef(doc.propertyMap, 'propertyMap');
  mapping.typeMap = compiler.typeMapRef(doc.typeMap, 'typeMap');
  mapping.identifier = compiler.identifier(doc.identifier, 'identifier');
  mapping.class = compiler.classes(doc.class, 'class');
  mapping.groups = compiler.groups(doc.groups, 'groups');
  mapping.expandIri = iri => compiler.expandIri(iri, 'iri');
  mapping.compilePropertyMap = (map, where) => compiler.propertyMap(map, where);
  mapping.compiled = true;
  return mapping;
};
