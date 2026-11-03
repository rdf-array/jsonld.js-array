/**
 * rdf-array: the shared JSON-LD-array tests of json-ld-api-contrib
 * (https://github.com/rdf-array/json-ld-api-contrib, tests/array-manifest.jsonld).
 * `npm run fetch-json-ld-api-contrib` checks the suite out into test-suites/; run with
 * `npm run test-contrib`, or point JSONLD_API_CONTRIB at another checkout.
 *
 * The suite's toRdf and fromRdf manifests run too: a @list is one sequence term.
 */
const jsonld = require('..');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = process.env.JSONLD_API_CONTRIB ||
  path.join(__dirname, '..', 'test-suites', 'json-ld-api-contrib');
const TESTS = path.join(ROOT, 'tests');
const ARRAY_TEST = 'ra:JsonLdArrayToRdfTest';

const readJson = file => JSON.parse(fs.readFileSync(path.join(TESTS, file), 'utf8'));
const lines = text => text.split('\n').filter(Boolean).sort();

describe('json-ld-api-contrib: JSON-LD-array', () => {
  if(!fs.existsSync(path.join(TESTS, 'array-manifest.jsonld'))) {
    it('needs the suite checked out', () => {
      assert.fail(`${TESTS} not found: run npm run fetch-json-ld-api-contrib`);
    });
    return;
  }
  const manifest = readJson('array-manifest.jsonld');
  const tests = manifest.sequence.filter(test => test['@type'].includes(ARRAY_TEST));

  it('has tests', () => assert.ok(tests.length > 0));

  for(const test of tests) {
    it(`${test['@id']} ${test.name}`, async () => {
      // the processor's own JSON parser, which keeps the lexical form of numbers (1.70, 1.5e3)
      const input = jsonld.array.parseJSON(fs.readFileSync(path.join(TESTS, test.input), 'utf8'));
      const mapping = readJson(test.mapping);
      if(test['@type'].includes('jld:NegativeEvaluationTest')) {
        await assert.rejects(jsonld.arrayToRDF(input, mapping), error => {
          assert.strictEqual(error.details && error.details.code, test.expectErrorCode, error.message);
          return true;
        });
      } else {
        const actual = await jsonld.arrayToRDF(input, mapping, {format: 'application/n-quads'});
        const expected = fs.readFileSync(path.join(TESTS, test.expect), 'utf8');
        assert.deepStrictEqual(lines(actual), lines(expected));
      }
    });
  }
});

describe('json-ld-api-contrib: toRdf and fromRdf', () => {
  const positive = name => readJson(`${name}-manifest.jsonld`).sequence
    .filter(test => test['@type'].includes('jld:PositiveEvaluationTest'));
  const base = test => {
    const {baseIri} = readJson('toRdf-manifest.jsonld');
    return baseIri + test.input;
  };

  for(const test of positive('toRdf')) {
    it(`toRdf ${test['@id']} ${test.name}`, async () => {
      const input = readJson(test.input);
      const actual = await jsonld.toRDF(input, {base: base(test), format: 'application/n-quads'});
      const expected = fs.readFileSync(path.join(TESTS, test.expect), 'utf8');
      const canonical = text =>
        jsonld.canonize(text, {inputFormat: 'application/n-quads'});
      assert.strictEqual(await canonical(actual), await canonical(expected));
    });
  }

  for(const test of positive('fromRdf')) {
    it(`fromRdf ${test['@id']} ${test.name}`, async () => {
      const input = fs.readFileSync(path.join(TESTS, test.input), 'utf8');
      const actual = await jsonld.fromRDF(input, {format: 'application/n-quads'});
      const byId = (a, b) => a['@id'].localeCompare(b['@id']);
      assert.deepStrictEqual(actual.sort(byId), readJson(test.expect).sort(byId));
    });
  }
});
