/**
 * rdf-array: the shared JSON-LD-array tests of json-ld-api-contrib
 * (https://github.com/rdf-array/json-ld-api-contrib, tests/array-manifest.jsonld).
 * `npm run fetch-json-ld-api-contrib` checks the suite out into test-suites/; run with
 * `npm run test-contrib`, or point JSONLD_API_CONTRIB at another checkout.
 *
 * The toRdf and fromRdf manifests of the same suite are not run here: this fork leaves
 * jsonld.toRDF and jsonld.fromRDF as they were, with @list as rdf:first/rdf:rest ladders.
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
