/**
 * The JSON-LD-array processor: walks conventional JSON under a mapping and
 * emits rdf-array quads (RDF/JS-shaped plain objects, sequences included).
 * The rules are those of json-ld-array.md §3.4 and §3.5.
 *
 * Copyright (c) 2026 the rdf-array project.
 */
'use strict';

const canonicalize = require('canonicalize');
const JsonLdError = require('../JsonLdError');
const url = require('../url');
const terms = require('./terms');
const template = require('./template');
const {compileMapping, compileEmbedded} = require('./mapping');
const {kindOf, describeNumber} = require('./parse');

const {RDF, XSD} = terms;
const ERROR = 'jsonld.ArrayError';
const RESERVED_ROOT = new Set(['propertyMap', 'mapping']);
const RESERVED = new Set(['propertyMap']);

const api = {};
module.exports = api;

const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object, key);

const fail = (message, details = {}) =>
  new JsonLdError(message, ERROR, details);

const where = path => path.length ? ` at /${path.join('/')}` : ' at the root';

/**
 * The string a scalar contributes to a template or an identifier: a number's
 * lexical form, a boolean's `true`/`false`, a string itself.
 */
const describeScalar = value => {
  const kind = kindOf(value);
  if(kind === 'number') {
    return describeNumber(value).lexical;
  }
  if(kind === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
};

/**
 * Plain JSON again, for rdf:JSON literals: numbers from `parseJSON` unwrapped.
 */
const plainJSON = value => {
  switch(kindOf(value)) {
    case 'number':
      return describeNumber(value).number;
    case 'array':
      return value.map(plainJSON);
    case 'object': {
      const out = {};
      for(const [k, v] of Object.entries(value)) {
        out[k] = plainJSON(v);
      }
      return out;
    }
    default:
      return value;
  }
};

/**
 * A decimal lexical form for a JSON number: its own spelling unless that uses
 * an exponent, which xsd:decimal has not.
 */
const decimalLexical = lexical => {
  const match = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(lexical);
  if(!match) {
    return lexical;
  }
  const sign = match[1];
  const exponent = parseInt(match[4], 10);
  let digits = match[2] + (match[3] || '');
  let point = match[2].length + exponent;
  if(point <= 0) {
    digits = '0'.repeat(1 - point) + digits;
    point = 1;
  }
  if(point > digits.length) {
    digits += '0'.repeat(point - digits.length);
  }
  const integer = digits.slice(0, point).replace(/^0+(?=\d)/, '');
  const fraction = digits.slice(point).replace(/0+$/, '');
  return sign + integer + (fraction ? `.${fraction}` : '');
};

/**
 * JSON-LD's canonical lexical form of an xsd:double.
 */
const doubleLexical = number =>
  number.toExponential(15).replace(/(\d)0*e\+?/, '$1E');

const toArray = value => Array.isArray(value) ? value : [value];

class Processor {
  constructor(mapping, options) {
    this.mapping = mapping;
    this.options = options;
    this.quads = [];
    this.counter = 0;
    this.stable = new Map();
    this._rootMap = undefined;
    this._rootTypeMap = undefined;
  }

  emit(subject, predicate, object) {
    this.quads.push(terms.quad(subject, predicate, object));
  }

  fresh() {
    return terms.blankNode(`b${this.counter++}`);
  }

  stableBlankNode(label) {
    if(!this.stable.has(label)) {
      this.stable.set(label, terms.blankNode(label));
    }
    return this.stable.get(label);
  }

  resolvePropertyMap(ref, path) {
    if(ref === null || ref === undefined) {
      return null;
    }
    if(typeof ref === 'string') {
      const map = this.mapping.namedPropertyMaps[ref];
      if(!map) {
        throw fail(`There is no named property map "${ref}"${where(path)}.`,
          {code: 'unknown named map', name: ref, path});
      }
      return map;
    }
    return ref;
  }

  resolveTypeMap(ref, path) {
    if(ref === null || ref === undefined) {
      return null;
    }
    if(typeof ref === 'string') {
      const map = this.mapping.namedTypeMaps[ref];
      if(!map) {
        throw fail(`There is no named type map "${ref}"${where(path)}.`,
          {code: 'unknown named map', name: ref, path});
      }
      return map;
    }
    return ref;
  }

  rootMap() {
    if(this._rootMap === undefined) {
      this._rootMap = this.resolvePropertyMap(this.mapping.propertyMap, []);
    }
    return this._rootMap;
  }

  rootTypeMap() {
    if(this._rootTypeMap === undefined) {
      this._rootTypeMap = this.resolveTypeMap(this.mapping.typeMap, []);
    }
    return this._rootTypeMap;
  }

  rootContext(path = []) {
    const m = this.mapping;
    return {
      positionMap: this.rootMap(),
      typeMap: this.rootTypeMap(),
      enclosing: [],
      enclosingTypeMaps: [],
      base: m.base,
      parentObject: null,
      index: undefined,
      definition: {class: m.class, identifier: m.identifier, groups: m.groups},
      path
    };
  }

  /**
   * Rule 5: the root value is a node, one node per element, or nothing.
   */
  root(data) {
    const kind = kindOf(data);
    if(kind === 'object') {
      this.node(data, this.rootContext());
    } else if(kind === 'array') {
      data.forEach((element, i) => {
        if(kindOf(element) === 'object') {
          this.node(element, {...this.rootContext([i]), index: i + 1});
        }
      });
    }
  }

  /**
   * Rule 3's lookup: the type maps, the position map, then the fallback the
   * `unmappedKeys.scope` allows.
   */
  lookupKey(key, ctx, typeMaps) {
    for(const map of typeMaps) {
      if(map && hasOwn(map, key)) {
        return map[key];
      }
    }
    if(ctx.positionMap && hasOwn(ctx.positionMap, key)) {
      return ctx.positionMap[key];
    }
    return this.fallbackKey(key, ctx);
  }

  fallbackKey(key, ctx) {
    const scope = this.mapping.unmappedKeys.scope;
    if(scope === 'root') {
      const root = this.rootMap();
      return root && hasOwn(root, key) ? root[key] : undefined;
    }
    if(scope === 'enclosing') {
      for(const map of ctx.enclosing) {
        if(map && hasOwn(map, key)) {
          return map[key];
        }
      }
    }
    return undefined;
  }

  lookupType(name, ctx) {
    const chain = [ctx.typeMap];
    const scope = this.mapping.unmappedTypes.scope;
    if(scope === 'root') {
      chain.push(this.rootTypeMap());
    } else if(scope === 'enclosing') {
      chain.push(...ctx.enclosingTypeMaps, this.rootTypeMap());
    }
    for(const map of chain) {
      if(map && hasOwn(map, name)) {
        return map[name];
      }
    }
    return undefined;
  }

  /**
   * What an unmapped key does: an error, nothing, or a `vocab` property.
   */
  unmappedKey(key, path) {
    const policy = this.mapping.unmappedKeys;
    if(policy.otherwise === 'ignore') {
      return null;
    }
    if(policy.otherwise === 'vocab') {
      if(!this.mapping.vocab) {
        throw fail(`"unmappedKeys" says "vocab" but the mapping has no vocab.`,
          {code: 'no vocab', key, path});
      }
      return {iri: this.mapping.vocab + key, termType: 'iri'};
    }
    throw fail(`Unmapped key "${key}"${where(path)}.`,
      {code: 'unmapped key', key, path});
  }

  /**
   * The classes of an object's type values, through the type maps.
   */
  classesOf(values, ctx, path) {
    const classes = [];
    const typeDefinitions = [];
    for(const value of values) {
      if(kindOf(value) === 'null') {
        continue;
      }
      if(kindOf(value) !== 'string') {
        throw fail(`A type value must be a string${where(path)}.`,
          {code: 'invalid type value', path});
      }
      const definition = this.lookupType(value, ctx);
      if(definition) {
        classes.push(definition.iri);
        typeDefinitions.push(definition);
        continue;
      }
      const policy = this.mapping.unmappedTypes;
      if(policy.otherwise === 'ignore') {
        continue;
      }
      if(policy.otherwise === 'vocab') {
        if(!this.mapping.vocab) {
          throw fail(`"unmappedTypes" says "vocab" but the mapping has no ` +
            `vocab.`, {code: 'no vocab', path});
        }
        classes.push(this.mapping.vocab + value);
        continue;
      }
      throw fail(`Unmapped type value "${value}"${where(path)}.`,
        {code: 'unmapped type', value, path});
    }
    return {classes, typeDefinitions};
  }

  /**
   * An identifier term from a value and, optionally, a template.
   */
  identifierTerm({value, tmpl, termType, scope, base, path}) {
    let text;
    if(tmpl !== undefined) {
      text = template.expand(tmpl, scope,
        {encode: termType !== 'blankNode', describe: describeScalar});
      if(text === null) {
        return null;
      }
    } else {
      const kind = kindOf(value);
      if(kind === 'null') {
        return null;
      }
      if(kind !== 'string' && kind !== 'number' && kind !== 'boolean') {
        throw fail(`An identifier value must be a string or a number` +
          `${where(path)}.`, {code: 'invalid identifier', path});
      }
      text = describeScalar(value);
    }
    if(termType === 'blankNode') {
      return this.stableBlankNode(text);
    }
    return terms.namedNode(url.prependBase(base, text));
  }

  /**
   * Rules 1 to 4 for one JSON object; returns its subject term.
   *
   * @param presets {subject, classes, typeMaps, groups} set by a dictionary
   *   entry or a flattened wrapper.
   */
  node(object, ctx, presets = {}) {
    const m = this.mapping;
    const path = ctx.path;
    const isRoot = ctx.parentObject === null && !presets.subject;
    if(hasOwn(object, 'propertyMap')) {
      ctx = {
        ...ctx,
        positionMap: this.resolvePropertyMap(
          compileEmbedded(m, plainJSON(object.propertyMap), `${where(path)}`),
          path)
      };
    }
    const reserved = isRoot ? RESERVED_ROOT : RESERVED;
    const keys = Object.keys(object).filter(key => !reserved.has(key));

    // the type keys and the type maps their values select
    const typeKeys = [];
    for(const key of keys) {
      const definition = this.lookupKey(key, ctx, presets.typeMaps || []);
      if(definition && definition.role === 'type') {
        typeKeys.push(key);
      }
    }
    const classes = [...(presets.classes || [])];
    const typeDefinitions = [];
    for(const key of typeKeys) {
      const found = this.classesOf(toArray(object[key]), ctx, [...path, key]);
      classes.push(...found.classes);
      typeDefinitions.push(...found.typeDefinitions);
    }
    const typeMaps = [
      ...(presets.typeMaps || []),
      ...typeDefinitions.map(d => this.resolvePropertyMap(d.propertyMap, path))
        .filter(Boolean)
    ];

    // the definitions of the present keys; the identifier and base keys
    const definitions = new Map();
    let identifierKey = null;
    let baseKey = null;
    for(const key of keys) {
      const definition = this.lookupKey(key, ctx, typeMaps);
      if(!definition) {
        continue;
      }
      definitions.set(key, definition);
      if(definition.role === 'identifier') {
        if(identifierKey !== null) {
          throw fail(`Two identifier keys in one object, "${identifierKey}" ` +
            `and "${key}"${where(path)}.`, {code: 'two identifiers', path});
        }
        identifierKey = key;
      }
      const setsBase = definition.role === 'base' ||
        (definition.role === 'identifier' &&
          definition.baseTemplate !== undefined);
      if(setsBase) {
        if(baseKey !== null && baseKey !== key) {
          throw fail(`Two base-setting keys in one object, "${baseKey}" and ` +
            `"${key}"${where(path)}.`, {code: 'two bases', path});
        }
        baseKey = key;
      }
    }

    // the keys other definitions consume
    const consumed = new Set();
    const consumeTemplate = tmpl => {
      if(tmpl !== undefined && tmpl !== null) {
        for(const key of template.siblingReferences(tmpl)) {
          consumed.add(key);
        }
      }
    };
    const consumeIdentifier = identifier => {
      if(identifier) {
        if(identifier.from) {
          consumed.add(identifier.from);
        }
        consumeTemplate(identifier.template);
      }
    };
    for(const definition of definitions.values()) {
      consumeTemplate(definition.template);
      consumeTemplate(definition.baseTemplate);
      for(const attribute of ['datatype', 'language', 'iri']) {
        const v = definition[attribute];
        if(v && typeof v === 'object' && v.from) {
          consumed.add(v.from);
        }
      }
    }
    const objectIdentifier = presets.subject ?
      null : (ctx.definition && ctx.definition.identifier);
    consumeIdentifier(objectIdentifier);
    const groups = [...(presets.groups || [])];
    if(ctx.definition && ctx.definition.groups) {
      groups.push(...Object.values(ctx.definition.groups));
    }
    for(const definition of typeDefinitions) {
      if(definition.groups) {
        groups.push(...Object.values(definition.groups));
      }
    }
    for(const group of groups) {
      group.members.forEach(member => consumed.add(member));
      consumeIdentifier(group.identifier);
    }

    const scope = {
      own: undefined, members: object, parent: ctx.parentObject,
      index: ctx.index
    };

    // rule 2: the subject
    let subject = presets.subject || null;
    if(!subject && identifierKey !== null) {
      const definition = definitions.get(identifierKey);
      const value = object[identifierKey];
      subject = this.identifierTerm({
        value, tmpl: definition.template, termType: definition.termType,
        scope: {...scope, own: value}, base: ctx.base,
        path: [...path, identifierKey]
      });
    }
    if(!subject && objectIdentifier) {
      const value = objectIdentifier.from ?
        object[objectIdentifier.from] : undefined;
      subject = this.identifierTerm({
        value, tmpl: objectIdentifier.template,
        termType: objectIdentifier.termType, scope: {...scope, own: value},
        base: ctx.base, path
      });
    }
    if(!subject) {
      subject = this.fresh();
    }

    // rule 2: the base for the object's other members
    let base = ctx.base;
    if(baseKey !== null) {
      const definition = definitions.get(baseKey);
      const value = object[baseKey];
      if(kindOf(value) !== 'null') {
        const text = definition.baseTemplate !== undefined ?
          template.expand(definition.baseTemplate, {...scope, own: value},
            {describe: describeScalar}) :
          describeScalar(value);
        if(text !== null) {
          base = url.prependBase(ctx.base, text);
        }
      }
    }

    // the classes
    if(ctx.definition && ctx.definition.class) {
      classes.push(...ctx.definition.class);
    }
    for(const iri of classes) {
      this.emit(subject, terms.namedNode(RDF + 'type'), terms.namedNode(iri));
    }

    const nctx = {
      object, subject, base, path,
      parentObject: ctx.parentObject, index: ctx.index,
      positionMap: ctx.positionMap, enclosing: ctx.enclosing,
      typeMap: ctx.typeMap, enclosingTypeMaps: ctx.enclosingTypeMaps,
      typeMaps
    };

    // groups: virtual properties built from sibling keys
    for(const group of groups) {
      const present = group.members.filter(
        member => hasOwn(object, member) && kindOf(object[member]) !== 'null');
      if(present.length === 0) {
        continue;
      }
      let groupNode = null;
      if(group.identifier) {
        const value = group.identifier.from ?
          object[group.identifier.from] : undefined;
        groupNode = this.identifierTerm({
          value, tmpl: group.identifier.template,
          termType: group.identifier.termType, scope: {...scope, own: value},
          base, path
        });
      }
      if(!groupNode) {
        groupNode = this.fresh();
      }
      this.emit(subject, terms.namedNode(group.iri), groupNode);
      for(const iri of group.class || []) {
        this.emit(groupNode, terms.namedNode(RDF + 'type'),
          terms.namedNode(iri));
      }
      const groupMap = this.resolvePropertyMap(group.propertyMap, path);
      const gctx = {
        ...nctx, subject: groupNode, positionMap: groupMap,
        enclosing: [ctx.positionMap, ...ctx.enclosing].filter(Boolean),
        typeMaps: []
      };
      for(const key of present) {
        let definition = groupMap && hasOwn(groupMap, key) ?
          groupMap[key] : this.fallbackKey(key, gctx);
        if(!definition) {
          definition = this.unmappedKey(key, [...path, key]);
          if(!definition) {
            continue;
          }
        }
        this.property(groupNode, key, object[key], definition, gctx);
      }
    }

    // rules 3 and 4: the other keys
    for(const key of keys) {
      if(typeKeys.includes(key)) {
        continue;
      }
      let definition = definitions.get(key);
      if(key === identifierKey || key === baseKey) {
        // a role key with an iri also maps its value as a literal
        if(definition.iri === undefined) {
          continue;
        }
        definition = {
          ...definition, role: undefined, template: undefined,
          baseTemplate: undefined, valueType: undefined
        };
      }
      if(!definition) {
        if(consumed.has(key)) {
          continue;
        }
        definition = this.unmappedKey(key, [...path, key]);
        if(!definition) {
          continue;
        }
      }
      this.property(subject, key, object[key], definition, nctx);
    }
    return subject;
  }

  /**
   * The predicate of a definition: a constant, or taken from a sibling member.
   */
  predicate(definition, nctx, path) {
    const iri = definition.iri;
    if(typeof iri === 'string') {
      return terms.namedNode(iri);
    }
    const value = nctx.object[iri.from];
    if(kindOf(value) !== 'string') {
      throw fail(`The member "${iri.from}" that gives the predicate` +
        `${where(path)} is not a string.`, {code: 'invalid predicate', path});
    }
    return terms.namedNode(
      url.prependBase(nctx.base, this.mapping.expandIri(value)));
  }

  /**
   * A constant, or the value of a sibling member (`{from: key}`).
   */
  fromMember(attribute, nctx, path, expand) {
    if(attribute === undefined || attribute === null) {
      return undefined;
    }
    if(typeof attribute === 'string') {
      return attribute;
    }
    const value = nctx.object[attribute.from];
    if(kindOf(value) === 'null') {
      return undefined;
    }
    if(kindOf(value) !== 'string') {
      throw fail(`The member "${attribute.from}"${where(path)} is not a ` +
        `string.`, {code: 'invalid from', path});
    }
    return expand ? this.mapping.expandIri(value) : value;
  }

  /**
   * The base for a property's values: the object's base, or the property's
   * own `baseTemplate` expanded over the object's members.
   */
  valueBase(definition, nctx) {
    if(definition.baseTemplate === undefined || definition.role) {
      return nctx.base;
    }
    const text = template.expand(definition.baseTemplate, {
      own: undefined, members: nctx.object, parent: nctx.parentObject,
      index: nctx.index
    }, {describe: describeScalar});
    return text === null ? nctx.base : url.prependBase(nctx.base, text);
  }

  link(subject, predicate, term, definition, path) {
    if(definition.inverse) {
      if(!terms.isNode(term)) {
        throw fail(`An inverse property needs a node or an identifier value, ` +
          `not a literal${where(path)}.`, {code: 'literal subject', path});
      }
      this.emit(term, predicate, subject);
    } else {
      this.emit(subject, predicate, term);
    }
  }

  /**
   * Rule 4 for one key of an object.
   */
  property(subject, key, value, definition, nctx) {
    const kind = kindOf(value);
    if(kind === 'null') {
      return;
    }
    const path = [...nctx.path, key];
    const valueBase = this.valueBase(definition, nctx);
    const childContext = index => ({
      positionMap: this.resolvePropertyMap(definition.propertyMap, path),
      typeMap: this.resolveTypeMap(definition.typeMap, path),
      enclosing: [nctx.positionMap, ...nctx.enclosing].filter(Boolean),
      enclosingTypeMaps: [nctx.typeMap, ...nctx.enclosingTypeMaps]
        .filter(Boolean),
      base: valueBase,
      parentObject: nctx.object,
      index,
      definition,
      path: index === undefined ? path : [...path, index - 1]
    });

    if(definition.flatten) {
      if(kind === 'object') {
        // the object's keys are keys of the current node
        this.node(value, {
          ...childContext(nctx.index),
          positionMap: definition.propertyMap ?
            this.resolvePropertyMap(definition.propertyMap, path) :
            nctx.positionMap,
          typeMap: definition.typeMap ?
            this.resolveTypeMap(definition.typeMap, path) : nctx.typeMap,
          enclosing: nctx.enclosing,
          enclosingTypeMaps: nctx.enclosingTypeMaps,
          parentObject: nctx.parentObject,
          path
        }, {subject, typeMaps: nctx.typeMaps});
      } else if(kind === 'array') {
        // an envelope: its elements are root nodes
        value.forEach((element, i) => {
          if(kindOf(element) === 'object') {
            this.node(element, {
              ...this.rootContext([...path, i]),
              positionMap: definition.propertyMap ?
                this.resolvePropertyMap(definition.propertyMap, path) :
                this.rootMap(),
              typeMap: definition.typeMap ?
                this.resolveTypeMap(definition.typeMap, path) :
                this.rootTypeMap(),
              base: valueBase,
              index: i + 1,
              definition
            });
          }
        });
      } else {
        throw fail(`"${key}" is flattened but its value is neither an object ` +
          `nor an array${where(path)}.`, {code: 'invalid flatten', path});
      }
      return;
    }

    if(definition.keyedBy) {
      if(kind !== 'object') {
        throw fail(`"${key}" is a dictionary (keyedBy) but its value is not ` +
          `an object${where(path)}.`, {code: 'invalid dictionary', path});
      }
      this.dictionary(subject, value, definition, nctx, valueBase, path,
        childContext);
      return;
    }

    const predicate = this.predicate(definition, nctx, path);
    if(this.isJsonLiteral(definition, nctx, path)) {
      this.link(subject, predicate, this.literal(value, definition, nctx, path),
        definition, path);
      return;
    }
    if(kind === 'array') {
      if(definition.inverse) {
        // an array under an inverse property spreads
        value.forEach((element, i) => {
          const term = this.value(element, definition, nctx, valueBase, i + 1,
            [...path, i], childContext);
          if(term) {
            this.link(subject, predicate, term, definition, path);
          }
        });
        return;
      }
      this.emit(subject, predicate,
        this.sequence(value, definition, nctx, valueBase, path, childContext));
      return;
    }
    const term = this.value(value, definition, nctx, valueBase, undefined, path,
      childContext);
    if(term) {
      this.link(subject, predicate, term, definition, path);
    }
  }

  sequence(array, definition, nctx, valueBase, path, childContext) {
    const elements = [];
    array.forEach((element, i) => {
      const term = this.value(element, definition, nctx, valueBase, i + 1,
        [...path, i], childContext);
      if(term) {
        elements.push(term);
      }
    });
    return terms.sequence(elements);
  }

  /**
   * One value under a definition: a node, a sequence, an identifier or a
   * literal; `null` for nothing.
   */
  value(value, definition, nctx, valueBase, index, path, childContext) {
    if(kindOf(value) !== 'null' && this.isJsonLiteral(definition, nctx, path)) {
      return this.literal(value, definition, nctx, path);
    }
    switch(kindOf(value)) {
      case 'null':
        return null;
      case 'array':
        return this.sequence(value, definition, nctx, valueBase, path,
          childContext);
      case 'object':
        return this.node(value, childContext(index));
      default:
        if(definition.valueType === 'identifier') {
          return this.identifierTerm({
            value, tmpl: definition.template, termType: definition.termType,
            scope: {
              own: value, members: nctx.object, parent: nctx.parentObject,
              index
            },
            base: valueBase, path
          });
        }
        return this.literal(value, definition, nctx, path);
    }
  }

  /**
   * Whether a definition makes rdf:JSON literals, which take whole values.
   */
  isJsonLiteral(definition, nctx, path) {
    return definition.datatype !== undefined &&
      this.fromMember(definition.datatype, nctx, path, true) === RDF + 'JSON';
  }

  literal(value, definition, nctx, path) {
    const datatype = this.fromMember(definition.datatype, nctx, path, true);
    const language = this.fromMember(definition.language, nctx, path, false);
    const kind = kindOf(value);
    if(datatype === RDF + 'JSON') {
      return terms.literal(canonicalize(plainJSON(value)), {datatype});
    }
    if(language) {
      if(kind !== 'string') {
        throw fail(`A language-tagged value must be a string${where(path)}.`,
          {code: 'invalid literal', path});
      }
      return terms.literal(value, {language, direction: definition.direction});
    }
    if(kind === 'string') {
      return terms.literal(value, datatype ? {datatype} : {});
    }
    if(kind === 'boolean') {
      return terms.literal(value ? 'true' : 'false',
        {datatype: datatype || (XSD + 'boolean')});
    }
    const {number, lexical} = describeNumber(value);
    const integerLike = /^-?\d+$/.test(lexical);
    if(!datatype) {
      return integerLike ?
        terms.literal(lexical, {datatype: XSD + 'integer'}) :
        terms.literal(decimalLexical(lexical), {datatype: XSD + 'decimal'});
    }
    if(datatype === XSD + 'integer') {
      if(!Number.isInteger(number)) {
        throw fail(`"${lexical}" is not an xsd:integer${where(path)}.`,
          {code: 'invalid literal', path});
      }
      return terms.literal(
        integerLike ? lexical : BigInt(number).toString(), {datatype});
    }
    if(datatype === XSD + 'decimal') {
      return terms.literal(decimalLexical(lexical), {datatype});
    }
    if(datatype === XSD + 'double' || datatype === XSD + 'float') {
      return terms.literal(doubleLexical(number), {datatype});
    }
    return terms.literal(lexical, {datatype});
  }

  /**
   * A `keyedBy` dictionary: one value of the property per entry.
   */
  dictionary(subject, object, definition, nctx, valueBase, path, childContext) {
    const keyedBy = definition.keyedBy;
    const predicate = keyedBy.kind === 'predicate' ?
      null : this.predicate(definition, nctx, path);
    for(const [entryKey, entryValue] of Object.entries(object)) {
      const kind = kindOf(entryValue);
      if(kind === 'null') {
        continue;
      }
      const entryPath = [...path, entryKey];
      const scope = {
        own: entryKey, members: nctx.object, parent: nctx.parentObject,
        index: nctx.index
      };
      const entryContext = () =>
        ({...childContext(undefined), path: entryPath});
      switch(keyedBy.kind) {
        case 'identifier': {
          if(kind !== 'object') {
            throw fail(`The entry "${entryKey}" of a dictionary keyed by ` +
              `identifier must be an object${where(entryPath)}.`,
            {code: 'invalid dictionary', path: entryPath});
          }
          const node = this.identifierTerm({
            value: entryKey, tmpl: definition.template,
            termType: definition.termType, scope, base: valueBase,
            path: entryPath
          });
          const term = this.node(entryValue, entryContext(), {subject: node});
          this.link(subject, predicate, term, definition, entryPath);
          break;
        }
        case 'language': {
          if(kind !== 'string') {
            throw fail(`The entry "${entryKey}" of a dictionary keyed by ` +
              `language must be a string${where(entryPath)}.`,
            {code: 'invalid dictionary', path: entryPath});
          }
          this.link(subject, predicate, terms.literal(entryValue,
            {language: entryKey, direction: definition.direction}),
          definition, entryPath);
          break;
        }
        case 'type': {
          if(kind !== 'object') {
            throw fail(`The entry "${entryKey}" of a dictionary keyed by ` +
              `type must be an object${where(entryPath)}.`,
            {code: 'invalid dictionary', path: entryPath});
          }
          const context = entryContext();
          const found = this.classesOf([entryKey], context, entryPath);
          const typeMaps = found.typeDefinitions
            .map(d => this.resolvePropertyMap(d.propertyMap, entryPath))
            .filter(Boolean);
          const groups = found.typeDefinitions
            .flatMap(d => d.groups ? Object.values(d.groups) : []);
          const term = this.node(entryValue, context,
            {classes: found.classes, typeMaps, groups});
          this.link(subject, predicate, term, definition, entryPath);
          break;
        }
        case 'property': {
          let node;
          if(kind === 'object') {
            node = this.node(entryValue, entryContext());
          } else {
            node = this.fresh();
            const term = kind === 'array' ?
              this.sequence(entryValue, definition, nctx, valueBase, entryPath,
                childContext) :
              this.value(entryValue, definition, nctx, valueBase, undefined,
                entryPath, childContext);
            if(term) {
              this.emit(node, terms.namedNode(keyedBy.valueProperty), term);
            }
          }
          this.emit(node, terms.namedNode(keyedBy.property),
            terms.literal(entryKey));
          this.link(subject, predicate, node, definition, entryPath);
          break;
        }
        case 'predicate': {
          const iri = template.expand(keyedBy.template, scope,
            {describe: describeScalar});
          if(iri === null) {
            continue;
          }
          const entryPredicate =
            terms.namedNode(url.prependBase(valueBase, iri));
          const term = kind === 'array' ?
            this.sequence(entryValue, definition, nctx, valueBase, entryPath,
              childContext) :
            this.value(entryValue, definition, nctx, valueBase, undefined,
              entryPath, childContext);
          if(term) {
            this.link(subject, entryPredicate, term, definition, entryPath);
          }
          break;
        }
      }
    }
  }
}

api.Processor = Processor;

/**
 * Converts conventional JSON to rdf-array quads.
 *
 * @param data the parsed JSON (plain, or from `parseJSON`).
 * @param mapping the mapping document, or a compiled mapping.
 * @param options processing options (none yet).
 * @return {quads, prefixes}
 */
api.toRDF = (data, mapping, options = {}) => {
  let compiled = mapping && mapping.compiled ? mapping : null;
  if(kindOf(data) === 'object' && hasOwn(data, 'mapping')) {
    // an embedded mapping at the data root stands in for the document
    compiled = compileMapping(plainJSON(data.mapping));
  }
  if(!compiled) {
    compiled = compileMapping(mapping || {});
  }
  const processor = new Processor(compiled, options);
  processor.root(data);
  return {quads: processor.quads, prefixes: compiled.prefixes};
};
