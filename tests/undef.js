/**
 * rdf-undef: a null in a list is an empty slot of the sequence.
 * `npm run test-undef`.
 */
const jsonld = require('..');
const assert = require('assert');

const E = 'http://ex.org/';
const P = E + 'p';
const XSD_INTEGER = 'http://www.w3.org/2001/XMLSchema#integer';
const CONTEXT = {
  l: {'@id': P, '@container': '@list'},
  t: {'@id': E + 't', '@container': '@list', '@type': XSD_INTEGER},
  p: P
};
const one = list => ({'@id': E + 's', [P]: {'@list': list}});

describe('slots', () => {
  describe('expand', () => {
    it('keeps a null in a @list', async () => {
      assert.deepStrictEqual(await jsonld.expand(one([1, null, 3])), [
        {'@id': E + 's', [P]: [{'@list': [{'@value': 1}, null, {'@value': 3}]}]}
      ]);
    });
    it('keeps a list of nothing but nulls', async () => {
      assert.deepStrictEqual(await jsonld.expand(one([null, null])), [
        {'@id': E + 's', [P]: [{'@list': [null, null]}]}
      ]);
    });
    it('keeps a null at any depth', async () => {
      const expected = [{'@id': E + 's', [P]: [{'@list': [
        {'@list': [null, {'@value': 1}]}, null
      ]}]}];
      assert.deepStrictEqual(await jsonld.expand(
        one([{'@list': [null, 1]}, null])), expected);
      assert.deepStrictEqual(await jsonld.expand(
        one([[null, 1], null])), expected);
    });
    it('keeps a null in a @container @list term', async () => {
      assert.deepStrictEqual(await jsonld.expand(
        {'@context': CONTEXT, '@id': E + 's', l: [[null, 1], null]}),
      [{'@id': E + 's', [P]: [{'@list': [
        {'@list': [null, {'@value': 1}]}, null
      ]}]}]);
    });
    it('still drops a null outside a list', async () => {
      assert.deepStrictEqual(await jsonld.expand(
        {'@id': E + 's', [P]: [1, null]}),
      [{'@id': E + 's', [P]: [{'@value': 1}]}]);
    });
    it('still drops a null value object', async () => {
      assert.deepStrictEqual(await jsonld.expand(
        one([{'@value': null}])),
      [{'@id': E + 's', [P]: [{'@list': []}]}]);
    });
  });

  describe('compact', () => {
    it('keeps a null, in a @list', async () => {
      const compacted = await jsonld.compact(
        one([1, null]), {p: P});
      assert.deepStrictEqual(compacted.p, {'@list': [1, null]});
    });
    it('keeps a null, in a @container @list term', async () => {
      const compacted = await jsonld.compact(
        one([[null], null]), {l: CONTEXT.l});
      assert.deepStrictEqual(compacted.l, [[null], null]);
    });
    it('lets a slot sit in a list of a typed term', async () => {
      const doc = {'@id': E + 's', [E + 't']: {'@list': [
        {'@value': '1', '@type': XSD_INTEGER}, null
      ]}};
      const compacted = await jsonld.compact(doc, {t: CONTEXT.t});
      assert.deepStrictEqual(compacted.t, ['1', null]);
    });
  });

  describe('flatten', () => {
    it('keeps a null', async () => {
      assert.deepStrictEqual(await jsonld.flatten(one([1, null]), null), [
        {'@id': E + 's', [P]: [{'@list': [{'@value': 1}, null]}]}
      ]);
    });
  });

  describe('toRDF', () => {
    it('makes a null an Undef element of the Sequence', async () => {
      const [{object}] = await jsonld.toRDF(one([null, {'@list': [null]}]));
      assert.deepStrictEqual(
        object.elements.map(element => element.termType),
        ['Undef', 'Sequence']);
      assert.strictEqual(object.elements[1].elements[0].termType, 'Undef');
    });
    it('writes it undef', async () => {
      assert.strictEqual(
        await jsonld.toRDF(one([null, 'a']), {format: 'application/n-quads'}),
        `<${E}s> <${P}> (undef "a") .\n`);
    });
  });

  describe('fromRDF', () => {
    const expected = [{'@id': E + 's', [P]: [{'@list': [
      null, {'@list': [null]}, {'@value': 'undef'}
    ]}]}];
    it('reads undef as a null in the @list', async () => {
      assert.deepStrictEqual(await jsonld.fromRDF(
        `<${E}s> <${P}> (undef (undef) "undef") .\n`), expected);
    });
    it('reads an Undef element of a dataset', async () => {
      assert.deepStrictEqual(
        await jsonld.fromRDF(await jsonld.toRDF(expected)), expected);
    });
    it('has no undef outside a sequence', async () => {
      await assert.rejects(jsonld.fromRDF(`<${E}s> <${P}> undef .\n(1)`),
        /N-Quads parse error on line 1/);
    });
  });

  describe('canonize', () => {
    it('writes a slot in the canonical form', async () => {
      assert.strictEqual(
        await jsonld.canonize(one([null, {'@id': '_:x'}, {'@list': [null]}])),
        `<${E}s> <${P}> (undef _:c14n0 (undef)) .\n`);
    });
    it('reads a slot from N-Quads', async () => {
      assert.strictEqual(
        await jsonld.canonize(`_:a <${P}> (UNDEF _:a) .\n`,
          {inputFormat: 'application/n-quads'}),
        `_:c14n0 <${P}> (undef _:c14n0) .\n`);
    });
    it('tells a slot from a shorter sequence', async () => {
      assert.notStrictEqual(
        await jsonld.canonize(one([null, 'a'])),
        await jsonld.canonize(one(['a'])));
    });
  });

  describe('arrayToRDF', () => {
    const nquads = data => jsonld.arrayToRDF(
      data, {prefixes: {ex: E}, propertyMap: {a: 'ex:p'}},
      {format: 'application/n-quads'});
    it('makes a null in an array a slot', async () => {
      assert.match(await nquads({a: [1, null, [null]]}),
        /\("?1.* undef \(undef\)\) \.\n$/);
    });
  });
});
