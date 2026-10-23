/**
 * A Turtle-array writer: Turtle with sequence terms `( e1 e2 ... )`. Blank
 * nodes referred to once are written inline as `[ ... ]`, unreferenced ones
 * as `[]` subjects, and prefixes are compacted from the mapping's `prefixes`.
 *
 * Copyright (c) 2026 the rdf-array project.
 */
'use strict';

const terms = require('./terms');

const {RDF, XSD} = terms;
const PN_LOCAL = /^(?:[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*)?$/;
const INLINE_WIDTH = 88;

const api = {};
module.exports = api;

class Writer {
  constructor(quads, prefixes) {
    this.prefixes = Object.entries(prefixes)
      .sort((a, b) => b[1].length - a[1].length);
    this.used = new Set();
    this.subjects = new Map();
    this.references = new Map();
    this.inlined = new Set();
    this.stack = new Set();
    for(const quad of quads) {
      const key = terms.toNTriples(quad.subject);
      let entry = this.subjects.get(key);
      if(!entry) {
        entry = {term: quad.subject, predicates: new Map()};
        this.subjects.set(key, entry);
      }
      const predicateKey = terms.toNTriples(quad.predicate);
      let predicate = entry.predicates.get(predicateKey);
      if(!predicate) {
        predicate = {term: quad.predicate, objects: []};
        entry.predicates.set(predicateKey, predicate);
      }
      predicate.objects.push(quad.object);
      this.countReferences(quad.object);
    }
  }

  countReferences(term) {
    if(term.termType === 'BlankNode') {
      const key = terms.toNTriples(term);
      this.references.set(key, (this.references.get(key) || 0) + 1);
    } else if(term.termType === 'Sequence') {
      term.elements.forEach(element => this.countReferences(element));
    }
  }

  /** A blank node referred to once, with triples of its own, not a cycle. */
  inlinable(term) {
    if(term.termType !== 'BlankNode') {
      return false;
    }
    const key = terms.toNTriples(term);
    return this.references.get(key) === 1 && this.subjects.has(key) &&
      !this.stack.has(key);
  }

  write() {
    const blocks = [];
    for(const [key, entry] of this.subjects) {
      if(entry.term.termType === 'BlankNode' &&
        this.references.get(key) === 1) {
        continue; // written inline where it is referred to
      }
      blocks.push(this.subjectBlock(entry, key));
    }
    // a blank node referred to once from inside its own description
    for(const [key, entry] of this.subjects) {
      if(entry.term.termType === 'BlankNode' &&
        this.references.get(key) === 1 && !this.inlined.has(key)) {
        blocks.push(this.subjectBlock(entry, key));
      }
    }
    const body = blocks.join('\n\n') + (blocks.length ? '\n' : '');
    return this.prefixLines() + body;
  }

  subjectBlock(entry, key) {
    const subject = entry.term.termType === 'BlankNode' &&
      !this.references.get(key) ? '[]' : this.term(entry.term, 0);
    const lines = this.predicateLines(entry, 4);
    if(lines.length === 1) {
      return `${subject} ${lines[0]} .`;
    }
    return `${subject} ${lines[0]} ;\n` +
      lines.slice(1).map(line => `    ${line}`).join(' ;\n') + ' .';
  }

  predicateLines(entry, indent) {
    const lines = [];
    for(const predicate of entry.predicates.values()) {
      const name = predicate.term.value === RDF + 'type' ?
        'a' : this.term(predicate.term, indent);
      const objects = predicate.objects.map(o => this.term(o, indent))
        .join(', ');
      lines.push(`${name} ${objects}`);
    }
    return lines;
  }

  term(term, indent) {
    switch(term.termType) {
      case 'NamedNode':
        return this.iri(term.value);
      case 'BlankNode': {
        if(!this.inlinable(term)) {
          return `_:${term.value}`;
        }
        const key = terms.toNTriples(term);
        this.stack.add(key);
        this.inlined.add(key);
        const lines = this.predicateLines(this.subjects.get(key), indent + 4);
        this.stack.delete(key);
        const flat = `[ ${lines.join(' ; ')} ]`;
        if(!flat.includes('\n') && flat.length + indent <= INLINE_WIDTH) {
          return flat;
        }
        const pad = ' '.repeat(indent + 4);
        return `[\n${lines.map(line => pad + line).join(' ;\n')}\n` +
          `${' '.repeat(indent)}]`;
      }
      case 'Literal':
        return this.literal(term);
      case 'Sequence':
        return term.elements.length === 0 ? '()' :
          `( ${term.elements.map(e => this.term(e, indent)).join(' ')} )`;
      default:
        return terms.toNTriples(term);
    }
  }

  iri(iri) {
    for(const [prefix, namespace] of this.prefixes) {
      if(iri.startsWith(namespace)) {
        const local = iri.slice(namespace.length);
        if(PN_LOCAL.test(local)) {
          this.used.add(prefix);
          return `${prefix}:${local}`;
        }
      }
    }
    return `<${iri}>`;
  }

  literal(term) {
    const datatype = term.datatype.value;
    const value = term.value;
    if(!term.language) {
      if(datatype === XSD + 'integer' && /^[+-]?\d+$/.test(value)) {
        return value;
      }
      if(datatype === XSD + 'decimal' && /^[+-]?\d*\.\d+$/.test(value)) {
        return value;
      }
      if(datatype === XSD + 'double' &&
        /^[+-]?(\d+\.\d*|\.\d+|\d+)[eE][+-]?\d+$/.test(value)) {
        return value;
      }
      if(datatype === XSD + 'boolean' &&
        (value === 'true' || value === 'false')) {
        return value;
      }
    }
    let quoted;
    const longString = /["\n]/.test(value) && !value.includes('"""') &&
      !value.endsWith('"') && !value.endsWith('\\');
    if(longString) {
      quoted = `"""${value.replace(/\\/g, '\\\\')}"""`;
    } else {
      quoted = `"${terms.escapeLiteral(value)}"`;
    }
    if(term.language) {
      return `${quoted}@${term.language}` +
        (term.direction ? `--${term.direction}` : '');
    }
    if(datatype !== XSD + 'string') {
      return `${quoted}^^${this.iri(datatype)}`;
    }
    return quoted;
  }

  prefixLines() {
    const lines = [];
    for(const [prefix, namespace] of this.prefixes) {
      if(this.used.has(prefix)) {
        lines.push(`@prefix ${prefix}: <${namespace}> .`);
      }
    }
    lines.sort();
    return lines.length ? lines.join('\n') + '\n\n' : '';
  }
}

/**
 * @param quads the quads to write.
 * @param prefixes prefix to namespace IRI, as in a mapping.
 */
api.serialize = (quads, prefixes = {}) => new Writer(quads, prefixes).write();
