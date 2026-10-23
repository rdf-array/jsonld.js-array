/**
 * JSON-LD-array tests: the rows of json-ld-array.md §5 and §11.1, and the
 * errors of §3.4. Run with `npm run test-array`.
 */
/* eslint-disable quotes, quote-props, max-len */
const jsonld = require('..');
const assert = require('assert');

const S = 'http://schema.org/';
const EX = 'https://example.org/ns#';
const P = 'https://example.org/people/';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const PREFIXES = {schema: S, ex: EX, xsd: XSD, rdf: RDF, rdfs: RDFS};

const iri = v => `<${v}>`;
const lit = (v, datatype) => datatype ? `"${v}"^^<${datatype}>` : `"${v}"`;
const lang = (v, tag) => `"${v}"@${tag}`;
const seq = (...elements) => `(${elements.join(' ')})`;
const q = (s, p, o) => `${s} ${p} ${o} .`;
const a = iri(RDF + 'type');

const mapping = (propertyMap, extra = {}) =>
  ({prefixes: PREFIXES, base: P, unmappedKeys: 'error', propertyMap, ...extra});

async function nquads(data, m) {
  const text = await jsonld.arrayToRDF(data, m, {format: 'application/n-quads'});
  return text.split('\n').filter(Boolean).sort();
}

async function expectQuads(data, m, expected) {
  assert.deepStrictEqual(await nquads(data, m), [...expected].sort());
}

async function expectError(data, m, code) {
  await assert.rejects(jsonld.arrayToRDF(data, m), error => {
    assert.ok(error.name === 'jsonld.ArrayError' ||
      error.name === 'jsonld.ArrayMappingError', `unexpected ${error.name}: ${error.message}`);
    if(code) {
      assert.strictEqual(error.details.code, code, error.message);
    }
    return true;
  });
}

const LEADING_MAPPING = {
  "prefixes": PREFIXES,
  "base": P,
  "unmappedKeys": "error",
  "typeMap": {"Person": "schema:Person", "Organization": "schema:Organization"},
  "propertyMap": {
    "id": {"role": "identifier", "baseTemplate": "{}/"},
    "type": {"role": "type"},
    "name": "schema:name",
    "age": {"iri": "schema:age", "datatype": "xsd:integer"},
    "born": {"iri": "schema:birthDate", "datatype": "xsd:date"},
    "homepage": {"iri": "schema:url", "valueType": "identifier"},
    "tags": "ex:tags",
    "knows": {"iri": "schema:knows", "valueType": "identifier", "baseTemplate": "friends.ttl", "template": "#{}"},
    "address": {"iri": "schema:address", "propertyMap": {"city": "schema:addressLocality", "zip": "schema:postalCode"}}
  }
};

const LEADING_NAMED = {
  "prefixes": PREFIXES,
  "base": P,
  "unmappedKeys": "error",
  "typeMap": {"Person": "schema:Person", "Organization": "schema:Organization"},
  "propertyMap": "rootMap",
  "namedPropertyMaps": {
    "rootMap": {
      ...LEADING_MAPPING.propertyMap,
      "address": {"iri": "schema:address", "propertyMap": "addressMap"}
    },
    "addressMap": {"city": "schema:addressLocality", "zip": "schema:postalCode"}
  }
};

const LEADING_DATA = {
  "id": "alice", "type": "Person", "name": "Alice", "age": 42, "born": "1984-02-29",
  "homepage": "https://alice.example/", "tags": ["rdf", "json"], "knows": ["Bob", "Eve"],
  "address": {"city": "Paris", "zip": "75001"}
};

const ALICE = iri(P + 'alice');
const LEADING_QUADS = [
  q(ALICE, a, iri(S + 'Person')),
  q(ALICE, iri(S + 'name'), lit('Alice')),
  q(ALICE, iri(S + 'age'), lit('42', XSD + 'integer')),
  q(ALICE, iri(S + 'birthDate'), lit('1984-02-29', XSD + 'date')),
  q(ALICE, iri(S + 'url'), iri('https://alice.example/')),
  q(ALICE, iri(EX + 'tags'), seq(lit('rdf'), lit('json'))),
  q(ALICE, iri(S + 'knows'), seq(iri(P + 'alice/friends.ttl#Bob'), iri(P + 'alice/friends.ttl#Eve'))),
  q(ALICE, iri(S + 'address'), '_:b0'),
  q('_:b0', iri(S + 'addressLocality'), lit('Paris')),
  q('_:b0', iri(S + 'postalCode'), lit('75001'))
];

describe('JSON-LD-array', () => {
  describe('the leading example (§1)', () => {
    it('maps the inline form', async () => {
      await expectQuads(LEADING_DATA, LEADING_MAPPING, LEADING_QUADS);
    });

    it('maps the named-map form to the same quads', async () => {
      await expectQuads(LEADING_DATA, LEADING_NAMED, LEADING_QUADS);
    });

    it('writes Turtle-array', async () => {
      const turtle = await jsonld.arrayToRDF(LEADING_DATA, LEADING_MAPPING, {format: 'text/turtle'});
      assert.ok(turtle.startsWith('@prefix ex: <https://example.org/ns#> .\n@prefix schema: <http://schema.org/> .\n@prefix xsd:'), turtle);
      assert.ok(turtle.includes('<https://example.org/people/alice> a schema:Person ;\n'), turtle);
      assert.ok(turtle.includes('    schema:age 42 ;\n'), turtle);
      assert.ok(turtle.includes('    ex:tags ( "rdf" "json" ) ;\n'), turtle);
      assert.ok(turtle.includes('    schema:knows ( <https://example.org/people/alice/friends.ttl#Bob> <https://example.org/people/alice/friends.ttl#Eve> ) ;\n'), turtle);
      assert.ok(turtle.includes('    schema:address [ schema:addressLocality "Paris" ; schema:postalCode "75001" ] .\n'), turtle);
    });

    it('returns RDF/JS-shaped quads with sequence terms by default', async () => {
      const quads = await jsonld.arrayToRDF(LEADING_DATA, LEADING_MAPPING);
      const tags = quads.find(quad => quad.predicate.value === EX + 'tags');
      assert.strictEqual(tags.object.termType, 'Sequence');
      assert.strictEqual(tags.object.value, '("rdf" "json")');
      assert.deepStrictEqual(tags.object.elements.map(e => e.value), ['rdf', 'json']);
      assert.strictEqual(tags.graph.termType, 'DefaultGraph');
    });
  });

  describe('literals (§5.1)', () => {
    it('maps strings, integers, decimals, booleans, dates and languages', async () => {
      const m = mapping({
        "name": "schema:name",
        "age": "schema:age",
        "height": "schema:height",
        "score": {"iri": "ex:score", "datatype": "xsd:double"},
        "active": "ex:active",
        "born": {"iri": "schema:birthDate", "datatype": "xsd:date"},
        "title": {"iri": "schema:name", "language": "fr"},
        "nickname": "ex:nickname",
        "raw": {"iri": "ex:raw", "datatype": "rdf:JSON"}
      });
      const data = jsonld.array.parseJSON(JSON.stringify({
        name: "Alice", age: 42, height: 1.70, score: 0.5, active: true,
        born: "1984-02-29", title: "Bonjour", nickname: null, raw: {a: [1, 2]}
      }).replace('"height":1.7,', '"height":1.70,'));
      await expectQuads(data, m, [
        q('_:b0', iri(S + 'name'), lit('Alice')),
        q('_:b0', iri(S + 'age'), lit('42', XSD + 'integer')),
        q('_:b0', iri(S + 'height'), lit('1.70', XSD + 'decimal')),
        q('_:b0', iri(EX + 'score'), lit('5.0E-1', XSD + 'double')),
        q('_:b0', iri(EX + 'active'), lit('true', XSD + 'boolean')),
        q('_:b0', iri(S + 'birthDate'), lit('1984-02-29', XSD + 'date')),
        q('_:b0', iri(S + 'name'), lang('Bonjour', 'fr')),
        q('_:b0', iri(EX + 'raw'), `"{\\"a\\":[1,2]}"^^<${RDF}JSON>`)
      ]);
    });

    it('keeps a plain number\'s own spelling when there is no lexical form', async () => {
      await expectQuads({h: 1.5, e: 1e3, n: -2}, mapping({h: "ex:h", e: "ex:e", n: "ex:n"}), [
        q('_:b0', iri(EX + 'h'), lit('1.5', XSD + 'decimal')),
        q('_:b0', iri(EX + 'e'), lit('1000', XSD + 'integer')),
        q('_:b0', iri(EX + 'n'), lit('-2', XSD + 'integer'))
      ]);
    });

    it('turns an exponent into a decimal lexical form', async () => {
      const data = jsonld.array.parseJSON('{"e": 1.5e3, "f": 25e-3}');
      await expectQuads(data, mapping({e: "ex:e", f: "ex:f"}), [
        q('_:b0', iri(EX + 'e'), lit('1500', XSD + 'decimal')),
        q('_:b0', iri(EX + 'f'), lit('0.025', XSD + 'decimal'))
      ]);
    });

    it('refuses a fraction as xsd:integer', async () => {
      await expectError({n: 1.5}, mapping({n: {iri: "ex:n", datatype: "xsd:integer"}}), 'invalid literal');
    });
  });

  describe('nodes, identifiers and bases (§5.2)', () => {
    it('resolves an identifier against the base', async () => {
      await expectQuads({id: "alice", name: "Alice"}, mapping({id: {role: "identifier"}, name: "schema:name"}), [
        q(ALICE, iri(S + 'name'), lit('Alice'))
      ]);
    });

    it('expands an identifier template over a number', async () => {
      await expectQuads({id: 42, name: "Bob"}, mapping({id: {role: "identifier", template: "https://example.org/people/{}"}, name: "schema:name"}), [
        q(iri(P + '42'), iri(S + 'name'), lit('Bob'))
      ]);
    });

    it('percent-encodes template values', async () => {
      await expectQuads({id: "a b/c"}, mapping({id: {role: "identifier", template: "https://example.org/people/{}"}, ref: "ex:ref"}), [
      ]);
      const quads = await jsonld.arrayToRDF({id: "a b/c", ref: "x"}, mapping({id: {role: "identifier", template: "https://example.org/people/{}"}, ref: "ex:ref"}));
      assert.strictEqual(quads[0].subject.value, P + 'a%20b%2Fc');
    });

    it('maps identifier values and foreign keys through templates', async () => {
      await expectQuads({homepage: "https://alice.example/", editorId: 5}, mapping({
        homepage: {iri: "schema:url", valueType: "identifier"},
        editorId: {iri: "schema:editor", valueType: "identifier", template: "https://example.org/people/{}"}
      }), [
        q('_:b0', iri(S + 'url'), iri('https://alice.example/')),
        q('_:b0', iri(S + 'editor'), iri(P + '5'))
      ]);
    });

    it('lets a key set the base of its object (role base)', async () => {
      await expectQuads({id: "alice", docs: {base: "https://docs.example/alice/", main: "cv.html"}}, mapping({
        id: {role: "identifier"},
        docs: {iri: "ex:docs", propertyMap: {base: {role: "base"}, main: {iri: "ex:main", valueType: "identifier"}}}
      }), [
        q(ALICE, iri(EX + 'docs'), '_:b0'),
        q('_:b0', iri(EX + 'main'), iri('https://docs.example/alice/cv.html'))
      ]);
    });

    it('resolves the identifier against the enclosing base and the members against the new one', async () => {
      await expectQuads({id: "alice", ref: "x"}, mapping({
        id: {role: "identifier", baseTemplate: "{}/"},
        ref: {iri: "ex:ref", valueType: "identifier"}
      }), [
        q(ALICE, iri(EX + 'ref'), iri(P + 'alice/x'))
      ]);
    });

    it('rejects two identifier keys and two base-setting keys', async () => {
      await expectError({id: "a", alt: "b"}, mapping({id: {role: "identifier"}, alt: {role: "identifier"}}), 'two identifiers');
      await expectError({b1: "x/", b2: "y/"}, mapping({b1: {role: "base"}, b2: {role: "base"}}), 'two bases');
    });

    it('maps a type key through the type map, spreading arrays', async () => {
      const m = mapping({type: {role: "type"}}, {typeMap: {Person: "schema:Person", Organization: "schema:Organization"}});
      await expectQuads({type: "Person"}, m, [q('_:b0', a, iri(S + 'Person'))]);
      await expectQuads({type: ["Person", "Organization"]}, m, [
        q('_:b0', a, iri(S + 'Person')), q('_:b0', a, iri(S + 'Organization'))
      ]);
    });

    it('applies unmappedTypes to unknown type values', async () => {
      const m = extra => mapping({type: {role: "type"}}, {typeMap: {Person: "schema:Person"}, vocab: EX, ...extra});
      await expectError({type: "Alien"}, m({}), 'unmapped type');
      await expectQuads({type: "Alien"}, m({unmappedTypes: "ignore"}), []);
      await expectQuads({type: "Alien"}, m({unmappedTypes: "vocab"}), [q('_:b0', a, iri(EX + 'Alien'))]);
    });

    it('types nodes by structure with class', async () => {
      await expectQuads({name: "A", home: {city: "L"}}, mapping({
        name: "schema:name",
        home: {iri: "schema:address", class: "schema:PostalAddress", propertyMap: {city: "schema:addressLocality"}}
      }, {class: "schema:Person"}), [
        q('_:b0', a, iri(S + 'Person')),
        q('_:b0', iri(S + 'name'), lit('A')),
        q('_:b0', iri(S + 'address'), '_:b1'),
        q('_:b1', a, iri(S + 'PostalAddress')),
        q('_:b1', iri(S + 'addressLocality'), lit('L'))
      ]);
    });

    it('flattens a wrapper object onto the current node', async () => {
      await expectQuads({attributes: {name: "Alice"}}, mapping({attributes: {flatten: true}, name: "schema:name"}), [
        q('_:b0', iri(S + 'name'), lit('Alice'))
      ]);
    });

    it('treats a flattened array as an envelope of root nodes', async () => {
      // the envelope object is a node of its own (_:b0), with nothing to say
      await expectQuads({data: [{name: "A"}, {name: "B"}], meta: {page: 1}}, mapping({data: {flatten: true}, name: "schema:name"}, {unmappedKeys: "ignore"}), [
        q('_:b1', iri(S + 'name'), lit('A')),
        q('_:b2', iri(S + 'name'), lit('B'))
      ]);
    });

    it('spreads an array under an inverse property', async () => {
      await expectQuads({id: "p", children: [{name: "C1"}, {name: "C2"}]}, mapping({
        id: {role: "identifier"},
        children: {iri: "ex:parent", inverse: true, propertyMap: {name: "schema:name"}}
      }), [
        q('_:b0', iri(S + 'name'), lit('C1')),
        q('_:b0', iri(EX + 'parent'), iri(P + 'p')),
        q('_:b1', iri(S + 'name'), lit('C2')),
        q('_:b1', iri(EX + 'parent'), iri(P + 'p'))
      ]);
    });

    it('refuses a literal under an inverse property', async () => {
      await expectError({x: "lit"}, mapping({x: {iri: "ex:p", inverse: true}}), 'literal subject');
    });
  });

  describe('arrays are sequences (§5.3)', () => {
    it('maps arrays, empty, single, nested, of objects and of identifiers', async () => {
      await expectQuads({
        tags: ["rdf", "json"], none: [], one: ["rdf"], matrix: [[1, 2], [3, 4]],
        members: [{name: "A"}, {name: "B"}], codes: ["A1", "B2"], mixed: ["a", 1, null, {x: 1}]
      }, mapping({
        tags: "ex:tags", none: "ex:none", one: "ex:one", matrix: "ex:matrix",
        members: {iri: "ex:members", propertyMap: {name: "schema:name"}},
        codes: {iri: "ex:code", valueType: "identifier"},
        mixed: {iri: "ex:mixed", propertyMap: {x: "ex:x"}}
      }), [
        q('_:b0', iri(EX + 'tags'), seq(lit('rdf'), lit('json'))),
        q('_:b0', iri(EX + 'none'), '()'),
        q('_:b0', iri(EX + 'one'), seq(lit('rdf'))),
        q('_:b0', iri(EX + 'matrix'), seq(seq(lit('1', XSD + 'integer'), lit('2', XSD + 'integer')), seq(lit('3', XSD + 'integer'), lit('4', XSD + 'integer')))),
        q('_:b1', iri(S + 'name'), lit('A')),
        q('_:b2', iri(S + 'name'), lit('B')),
        q('_:b0', iri(EX + 'members'), seq('_:b1', '_:b2')),
        q('_:b0', iri(EX + 'code'), seq(iri(P + 'A1'), iri(P + 'B2'))),
        q('_:b3', iri(EX + 'x'), lit('1', XSD + 'integer')),
        q('_:b0', iri(EX + 'mixed'), seq(lit('a'), lit('1', XSD + 'integer'), '_:b3'))
      ]);
    });

    it('gives every element of an array the property\'s language', async () => {
      await expectQuads({names: ["Dog", "Hund"]}, mapping({names: {iri: "rdfs:label", language: "en"}}), [
        q('_:b0', iri(RDFS + 'label'), seq(lang('Dog', 'en'), lang('Hund', 'en')))
      ]);
    });
  });

  describe('dictionaries (§5.4)', () => {
    it('keyed by identifier', async () => {
      await expectQuads({people: {alice: {name: "Alice"}, bob: {name: "Bob"}}}, mapping({
        people: {iri: "ex:people", keyedBy: "identifier", propertyMap: {name: "schema:name"}}
      }), [
        q('_:b0', iri(EX + 'people'), ALICE),
        q(ALICE, iri(S + 'name'), lit('Alice')),
        q('_:b0', iri(EX + 'people'), iri(P + 'bob')),
        q(iri(P + 'bob'), iri(S + 'name'), lit('Bob'))
      ]);
    });

    it('keyed by language', async () => {
      await expectQuads({label: {en: "Dog", de: "Hund"}}, mapping({label: {iri: "rdfs:label", keyedBy: "language"}}), [
        q('_:b0', iri(RDFS + 'label'), lang('Dog', 'en')),
        q('_:b0', iri(RDFS + 'label'), lang('Hund', 'de'))
      ]);
    });

    it('keyed by a property, wrapping literal values', async () => {
      await expectQuads({prices: {EUR: 10, USD: 11}}, mapping({
        prices: {iri: "ex:price", keyedBy: {property: "ex:currency", valueProperty: "rdf:value"}}
      }), [
        q('_:b1', iri(RDF + 'value'), lit('10', XSD + 'integer')),
        q('_:b1', iri(EX + 'currency'), lit('EUR')),
        q('_:b0', iri(EX + 'price'), '_:b1'),
        q('_:b2', iri(RDF + 'value'), lit('11', XSD + 'integer')),
        q('_:b2', iri(EX + 'currency'), lit('USD')),
        q('_:b0', iri(EX + 'price'), '_:b2')
      ]);
    });

    it('keyed by type', async () => {
      await expectQuads({parts: {Wheel: {n: 4}, Seat: {n: 2}}}, mapping({
        parts: {iri: "ex:part", keyedBy: "type", typeMap: {Wheel: "ex:Wheel", Seat: "ex:Seat"}, propertyMap: {n: "ex:n"}}
      }), [
        q('_:b1', a, iri(EX + 'Wheel')),
        q('_:b1', iri(EX + 'n'), lit('4', XSD + 'integer')),
        q('_:b0', iri(EX + 'part'), '_:b1'),
        q('_:b2', a, iri(EX + 'Seat')),
        q('_:b2', iri(EX + 'n'), lit('2', XSD + 'integer')),
        q('_:b0', iri(EX + 'part'), '_:b2')
      ]);
    });

    it('keyed by a predicate template', async () => {
      await expectQuads({prices: {GBP: 10, EUR: 12}}, mapping({
        prices: {keyedBy: {predicate: {template: "https://example.org/ns#price-{}"}}}
      }), [
        q('_:b0', iri(EX + 'price-GBP'), lit('10', XSD + 'integer')),
        q('_:b0', iri(EX + 'price-EUR'), lit('12', XSD + 'integer'))
      ]);
    });
  });

  describe('scopes (§4, §5.5)', () => {
    const ORG = {
      name: "schema:name", city: "schema:addressLocality",
      org: {iri: "schema:worksFor", propertyMap: {name: "schema:legalName"}}
    };

    it('errors on a key outside its map under the default scope', async () => {
      await expectError({lat: 48.8}, mapping({geo: {iri: "schema:geo", propertyMap: {lat: "schema:latitude"}}}), 'unmapped key');
      await expectError({org: {name: "ACME", city: "Lyon"}}, mapping(ORG), 'unmapped key');
    });

    it('falls back to the root maps under scope root, and to enclosing maps under scope enclosing', async () => {
      for(const scope of ['root', 'enclosing']) {
        await expectQuads({org: {name: "ACME", city: "Lyon"}}, mapping(ORG, {unmappedKeys: {scope}}), [
          q('_:b0', iri(S + 'worksFor'), '_:b1'),
          q('_:b1', iri(S + 'legalName'), lit('ACME')),
          q('_:b1', iri(S + 'addressLocality'), lit('Lyon'))
        ]);
      }
    });

    it('differs between root and enclosing when an intermediate map defines the key', async () => {
      const m = scope => mapping({
        k: "ex:root",
        mid: {iri: "ex:mid", propertyMap: {k: "ex:mid-k", inner: {iri: "ex:inner", propertyMap: {}}}}
      }, {unmappedKeys: {scope}});
      await expectQuads({mid: {inner: {k: 1}}}, m('enclosing'), [
        q('_:b0', iri(EX + 'mid'), '_:b1'),
        q('_:b1', iri(EX + 'inner'), '_:b2'),
        q('_:b2', iri(EX + 'mid-k'), lit('1', XSD + 'integer'))
      ]);
      await expectQuads({mid: {inner: {k: 1}}}, m('root'), [
        q('_:b0', iri(EX + 'mid'), '_:b1'),
        q('_:b1', iri(EX + 'inner'), '_:b2'),
        q('_:b2', iri(EX + 'root'), lit('1', XSD + 'integer'))
      ]);
    });

    it('resolves named maps, recursively', async () => {
      await expectQuads({text: "root", replies: [{text: "child", replies: [{text: "grandchild", replies: []}]}]}, mapping("comment", {
        namedPropertyMaps: {comment: {text: "ex:text", replies: {iri: "ex:replies", propertyMap: "comment"}}}
      }), [
        q('_:b0', iri(EX + 'text'), lit('root')),
        q('_:b1', iri(EX + 'text'), lit('child')),
        q('_:b2', iri(EX + 'text'), lit('grandchild')),
        q('_:b2', iri(EX + 'replies'), '()'),
        q('_:b1', iri(EX + 'replies'), seq('_:b2')),
        q('_:b0', iri(EX + 'replies'), seq('_:b1'))
      ]);
    });

    it('rejects an unknown named map', async () => {
      await expectError({a: {b: 1}}, mapping({a: {iri: "ex:a", propertyMap: "nowhere"}}), 'unknown named map');
    });

    it('applies a type-scoped map to its node only', async () => {
      const m = mapping({
        shapes: {iri: "ex:shapes", propertyMap: {type: {role: "type"}}, typeMap: {
          Circle: {iri: "ex:Circle", propertyMap: {r: "ex:radius"}},
          Square: {iri: "ex:Square", propertyMap: {s: "ex:side"}}
        }},
        type: {role: "type"}, inner: "ex:inner"
      }, {typeMap: {Circle: {iri: "ex:Circle", propertyMap: {r: "ex:radius"}}}});
      await expectQuads({shapes: [{type: "Circle", r: 1}, {type: "Square", s: 2}]}, m, [
        q('_:b1', a, iri(EX + 'Circle')),
        q('_:b1', iri(EX + 'radius'), lit('1', XSD + 'integer')),
        q('_:b2', a, iri(EX + 'Square')),
        q('_:b2', iri(EX + 'side'), lit('2', XSD + 'integer')),
        q('_:b0', iri(EX + 'shapes'), seq('_:b1', '_:b2'))
      ]);
      await expectError({type: "Circle", inner: {r: 1}}, m, 'unmapped key');
    });

    it('reads an embedded propertyMap and an embedded mapping', async () => {
      await expectQuads({propertyMap: {n: "https://example.org/ns#n"}, n: 1}, {}, [
        q('_:b0', iri(EX + 'n'), lit('1', XSD + 'integer'))
      ]);
      await expectQuads({mapping: {prefixes: {ex: EX}, propertyMap: {n: "ex:n"}}, n: 1}, {}, [
        q('_:b0', iri(EX + 'n'), lit('1', XSD + 'integer'))
      ]);
    });

    it('ignores or vocab-expands unmapped keys as told', async () => {
      await expectQuads({a: 1, b: 2}, mapping({a: "ex:a"}, {unmappedKeys: "ignore"}), [
        q('_:b0', iri(EX + 'a'), lit('1', XSD + 'integer'))
      ]);
      await expectQuads({a: 1, b: 2}, mapping({a: "ex:a"}, {unmappedKeys: "vocab", vocab: S}), [
        q('_:b0', iri(EX + 'a'), lit('1', XSD + 'integer')),
        q('_:b0', iri(S + 'b'), lit('2', XSD + 'integer'))
      ]);
    });
  });

  describe('the conventions borrowed from RML (§11.1)', () => {
    const RECORD = {
      id: 7, first: "Ada", last: "Lovelace", street: "12 St James's Square", city: "London",
      bio: "Mathematician", lang: "en", editorId: 5, works: [101, 102], prices: {GBP: 10, EUR: 12},
      phones: [{number: "+44 20 7946 0000"}, {number: "+1 212 555 0100"}]
    };
    const ADA = iri(P + '7');
    const FLAT = mapping({
      first: "schema:givenName", last: "schema:familyName",
      bio: {iri: "schema:description", language: {from: "lang"}},
      editorId: {iri: "schema:editor", valueType: "identifier", template: "https://example.org/people/{}"},
      works: {iri: "schema:author", inverse: true, valueType: "identifier", template: "https://example.org/works/{}"},
      prices: {keyedBy: {predicate: {template: "https://example.org/ns#price-{}"}}},
      phones: {iri: "schema:contactPoint", class: "schema:ContactPoint", identifier: {template: "https://example.org/people/{../id}/phone/{#}"}, propertyMap: {number: "schema:telephone"}}
    }, {
      identifier: {template: "https://example.org/people/{id}"},
      class: "schema:Person",
      groups: {home: {iri: "schema:address", members: ["street", "city"], class: "schema:PostalAddress",
        identifier: {template: "address-of-{id}", termType: "blankNode"},
        propertyMap: {street: "schema:streetAddress", city: "schema:addressLocality"}}}
    });

    it('maps a flat record with object identifiers, groups, from, foreign keys, predicate templates and positions', async () => {
      await expectQuads(RECORD, FLAT, [
        q(ADA, a, iri(S + 'Person')),
        q(ADA, iri(S + 'address'), '_:address-of-7'),
        q('_:address-of-7', a, iri(S + 'PostalAddress')),
        q('_:address-of-7', iri(S + 'streetAddress'), lit("12 St James's Square")),
        q('_:address-of-7', iri(S + 'addressLocality'), lit('London')),
        q(ADA, iri(S + 'givenName'), lit('Ada')),
        q(ADA, iri(S + 'familyName'), lit('Lovelace')),
        q(ADA, iri(S + 'description'), lang('Mathematician', 'en')),
        q(ADA, iri(S + 'editor'), iri(P + '5')),
        q(iri('https://example.org/works/101'), iri(S + 'author'), ADA),
        q(iri('https://example.org/works/102'), iri(S + 'author'), ADA),
        q(ADA, iri(EX + 'price-GBP'), lit('10', XSD + 'integer')),
        q(ADA, iri(EX + 'price-EUR'), lit('12', XSD + 'integer')),
        q(iri(P + '7/phone/1'), a, iri(S + 'ContactPoint')),
        q(iri(P + '7/phone/1'), iri(S + 'telephone'), lit('+44 20 7946 0000')),
        q(iri(P + '7/phone/2'), a, iri(S + 'ContactPoint')),
        q(iri(P + '7/phone/2'), iri(S + 'telephone'), lit('+1 212 555 0100')),
        q(ADA, iri(S + 'contactPoint'), seq(iri(P + '7/phone/1'), iri(P + '7/phone/2')))
      ]);
    });

    it('writes stable blank nodes and groups in Turtle-array', async () => {
      const turtle = await jsonld.arrayToRDF(RECORD, FLAT, {format: 'text/turtle'});
      assert.ok(turtle.includes('<https://example.org/people/7> a schema:Person ;\n'), turtle);
      assert.ok(turtle.includes('    schema:address [\n        a schema:PostalAddress ;\n        schema:streetAddress "12 St James\'s Square" ;\n        schema:addressLocality "London"\n    ] ;\n'), turtle);
      assert.ok(turtle.includes('<https://example.org/works/101> schema:author <https://example.org/people/7> .'), turtle);
      assert.ok(turtle.includes('ex:price-GBP 10 ;'), turtle);
    });
  });

  describe('the mapping document (§3)', () => {
    it('rejects malformed mappings with jsonld.ArrayMappingError', async () => {
      for(const bad of [
        {propertyMap: {a: {datatype: "xsd:string"}}},
        {propertyMap: {a: {iri: "ex:a", role: "owner"}}},
        {propertyMap: {a: {iri: "ex:a", valueType: "iri"}}},
        {propertyMap: {a: {iri: "ex:a", bogus: 1}}},
        {unmappedKeys: "explode"},
        {unmappedKeys: {scope: "galaxy"}},
        {propertyMap: {a: {iri: "ex:a", keyedBy: "colour"}}}
      ]) {
        await assert.rejects(jsonld.arrayToRDF({a: 1}, bad), error => error.name === 'jsonld.ArrayMappingError');
      }
    });

    it('accepts a precompiled mapping', async () => {
      const compiled = jsonld.array.compileMapping(LEADING_MAPPING);
      assert.strictEqual(compiled.compiled, true);
      await expectQuads(LEADING_DATA, compiled, LEADING_QUADS);
    });

    it('reports the path of an unmapped key', async () => {
      await assert.rejects(jsonld.arrayToRDF({address: {street: "x"}}, LEADING_MAPPING), error => {
        assert.deepStrictEqual(error.details.path, ['address', 'street']);
        assert.ok(error.message.includes('/address/street'), error.message);
        return true;
      });
    });
  });
});
