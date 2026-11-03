# jsonld.js-array: JSON-LD-array in jsonld.js

What this fork adds, where it lives, and what it does not do. The specification is
[json-ld-array.md](https://github.com/rdf-array/rdf-array), rendered at
<https://rdf-array.github.io/rdf-array/docs/json-ld-array.html>; its §3.6 (output), §3.7 (errors, with this
implementation's codes) and §12 describe this implementation. The playground is published at
<https://rdf-array.github.io/jsonld.js-array/> by `.github/workflows/pages.yml`.

## API

- `jsonld.arrayToRDF(data, mapping, options)` returns a Promise of RDF/JS-shaped quads
  (`{subject, predicate, object, graph}` with plain-object terms; a sequence is
  `{termType: 'Sequence', elements, value}` whose `value` is the N-Triples-style `(e1 e2 …)`), or,
  with `options.format`, the text of `'application/n-quads'` (N-Quads-array) or `'text/turtle'`
  (Turtle-array; `options.prefixes` adds to the mapping's prefixes).
- `jsonld.array` is the toolkit: `compileMapping(doc)` validates a mapping once for reuse,
  `toRDF(data, mapping)` is the synchronous core returning `{quads, prefixes}`, `parseJSON(text)`
  parses JSON keeping the lexical form of numbers (Number objects with a `lexical` property),
  `toNQuads(quads)`, `toTurtle(quads, prefixes)`, `terms` (term constructors and `toNTriples`),
  `template` (expansion and the IRI-safe encoding).
- A `mapping` member at the data root stands in for the mapping document; a `propertyMap` member in
  any data object is that object's position map (§4.3 of the specification).
- Errors are `jsonld.ArrayMappingError` (the mapping) and `jsonld.ArrayError` (the data), with
  `details.code` (`unmapped key`, `unmapped type`, `two identifiers`, `two bases`,
  `unknown named map`, `literal subject`, `invalid literal`, …) and `details.path`, the keys and
  indices from the root to the value.

## JSON-LD's own algorithms

A `@list` is one sequence term, a nested `@list` a nested sequence. No JSON-LD algorithm here mentions `rdf:first`,
`rdf:rest` or `rdf:nil`, which are ordinary IRIs.

- `jsonld.toRDF` gives `{termType: 'Sequence', elements, value}` for a `@list`, and with
  `format: 'application/n-quads'` writes it `( … )`. An element that is a relative IRI is left out, as a relative IRI
  object is.
- `jsonld.fromRDF` reads `( … )` in N-Quads-array, or a Sequence in a dataset, as `{"@list": [ … ]}`. A ladder is ordinary
  triples and stays ordinary nodes. A sequence as a subject is an error (`details.code`: `sequence subject`), since a
  JSON-LD node has nowhere to put it.
- `jsonld.canonize` refuses a sequence (`details.code`: `sequence in canonicalization`), from JSON-LD or from N-Quads:
  RDFC-1.0 has no sequence term and would hash its spelling with the blank nodes inside it left unrelabelled. So a
  document with a `@list` cannot be canonicalized until there is an algorithm for sequences.
- `jsonld.frame`, `expand`, `compact` and `flatten` work on JSON-LD and did not change.

`npm test` runs the rest of the upstream harness against [json-ld-api-array](https://github.com/rdf-array/json-ld-api-array),
with the framing and RDF canonicalization suites unchanged: 1503 pass, 100 are skipped, as upstream skips them, and 2 fail
for reasons not about lists. fromRdf `0027` has a comment line that rdf-canonize's N-Quads reader rejects, and fromRdf
`0028` has `useNativeTypes` keep an `@type` of `xsd:string`.

## Files

- `lib/array/terms.js`: the terms, sequences included, and their N-Triples spelling.
- `lib/array/template.js`: templates (`{}`, `{key}`, `{../key}`, `{#}`) and percent-encoding.
- `lib/array/mapping.js`: compiling and validating a mapping; prefixed names; named maps.
- `lib/array/parse.js`: lexical-preserving JSON parsing and the JSON kind of a value.
- `lib/array/convert.js`: the processor, rules 1–5 and the bases.
- `lib/array/nquads.js`, `lib/array/turtle.js`: the writers.
- `lib/jsonld.js`: the two additions to the API, `arrayToRDF` and `array`, and `canonize`'s refusal of a sequence.
- `lib/toRdf.js`, `lib/fromRdf.js`: a `@list` is one sequence term and a sequence term is a `@list`.
- `lib/NQuads.js`: N-Quads-array over rdf-canonize's reader and writer.
- `tests/array.js`: the rows of the specification's tables as mocha tests (`npm run test-array`).
- `tests/contrib.js`: the 55 shared JSON-LD-array tests of
  [json-ld-api-contrib](https://github.com/rdf-array/json-ld-api-contrib) (`tests/array-manifest.jsonld`),
  fetched into `test-suites/` (`npm run test-contrib`); inputs are read with `jsonld.array.parseJSON`, so
  numbers keep their lexical form. The suite's toRdf and fromRdf manifests run as well, 74 tests in all.
- `tests/isomorphic.js`: dataset comparison with blank nodes inside sequences, for the expectations RDFC-1.0
  cannot hash; `tests/test.js` uses it when an expectation or result holds a sequence.
- `playground/`: `index.html` and `examples.js`, served by `serve.js` (`npm run playground`,
  which builds `dist/jsonld.min.js` first).

## What is implemented

Everything in §3 to §5 of the specification: the value kinds (§2), the top-level attributes,
`unmappedKeys` and `unmappedTypes` with their `scope` (`none`, `root`, `enclosing`) and `otherwise`
(`error`, `ignore`, `vocab`), inline and named property and type maps with recursion, every property
definition attribute (`iri`, `role` identifier/type/base, `template`, `baseTemplate`, `termType`,
`datatype`, `language`, `direction`, `valueType: "identifier"`, `inverse`, `flatten` on objects and
arrays, `keyedBy` identifier/language/type/property, `typeMap`, `propertyMap`), the embedded forms,
and the number rules (integer, decimal, the double canonical form, exponents expanded for decimals).
Of the §11 proposals, all are implemented: an `identifier` attribute on the root and on definitions
(with `template` and `from`), `class` by structure, `groups` (virtual properties from sibling keys),
`{ "from": key }` for `datatype`, `language` and `iri`, `keyedBy: { "predicate": { "template" } }`,
stable blank nodes through `termType: "blankNode"`, and the `{../key}` and `{#}` references.

## Decisions taken while implementing

These sharpen the specification and should go back into it.

1. **Which base a `baseTemplate` sets.** On a key whose role is `identifier` (or on a `role: "base"`
   key) it sets the base of the object's other members, `{}` being the member's value; on a
   definition with an `iri`, a property, it sets the base of that property's values, expanded over
   the object's members. The specification's rule 2 read as if any key with a `baseTemplate` set
   the object's base, which would have made `knows` in §1 impossible.
2. **A role key with an `iri`** maps its value as a literal as well (an `id` can be both the node's
   name and `ex:localId "alice"`).
3. **Strictness and role keys.** Under `scope: "none"` a nested object's map must declare its own
   `id` and `type` role keys; nothing is inherited. The specification's §5 rows that relied on root
   definitions being visible below (`members`, `children`, `shapes`, `parts`) were given their
   `propertyMap`s.
4. **An envelope's root object is still a node**: it takes a blank node identifier and emits
   nothing; the elements of the flattened array are root nodes after it.
5. **`rdf:JSON` takes the whole value**, object, array or scalar, as one literal in the canonical
   JSON form (RFC 8785, through the `canonicalize` package jsonld.js already uses).
6. **Dictionaries keyed by identifier** accept a `template` on the definition, `{}` being the entry
   key, so numeric keys can be made into IRIs as values can.
7. **The Turtle-array writer** writes a blank node referred to once inline as `[ … ]`, an
   unreferenced blank node subject as `[]`, and everything else by label; prefixes come from the
   mapping and are compacted only for simple local names. Blank node labels from templates are
   written as given; a label with characters outside `[A-Za-z0-9_-]` would not be valid N-Quads.
8. **Number lexical forms** survive only where `JSON.parse` hands the reviver the source text
   (Node 21+, Chrome 114+); elsewhere `parseJSON` falls back to the number's own spelling.
9. **Blank node numbering** is `_:b0`, `_:b1`, … in order of creation, which the tests rely on.

## Not done

- No reverse direction (rdf-array to JSON), and no interaction between a JSON-LD-array mapping and
  JSON-LD's own `expand`, `compact`, `toRDF` or `fromRDF`.
- Named maps outside the root, by the specification's own decision.
- Templates do not reach into a different object than the one they describe, its parent and its
  position (no RML-LV-style views).
- The playground is a page of three panes; it keeps nothing and shares nothing.

## Running

```bash
npm install
npm test                    # the W3C suites: json-ld-api-array, framing, RDF canonicalization
npm run test-array          # 49 mocha tests from the specification's tables, and of toRDF and fromRDF
npm run test-contrib        # the json-ld-api-contrib JSON-LD-array, toRdf and fromRdf tests
npm run lint                # ESLint, jsonld.js's configuration
npm run playground          # builds dist/ and serves http://localhost:8080/playground/
```
