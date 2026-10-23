/* eslint-disable max-len */
// Examples for the JSON-LD-array playground, taken from json-ld-array.md.
// Each has a title, JSON data and a mapping, both as text so that the number
// spellings (1.70) survive.
window.JSONLD_ARRAY_EXAMPLES = [
  {
    title: 'Leading example, inline maps (§1)',
    data: `{ "id": "alice", "type": "Person", "name": "Alice", "age": 42,
  "born": "1984-02-29", "homepage": "https://alice.example/",
  "tags": ["rdf", "json"], "knows": ["Bob", "Eve"],
  "address": { "city": "Paris", "zip": "75001" } }`,
    mapping: `{
  "prefixes": {
    "schema": "http://schema.org/",
    "ex":     "https://example.org/ns#",
    "xsd":    "http://www.w3.org/2001/XMLSchema#"
  },
  "base": "https://example.org/people/",
  "unmappedKeys": "error",
  "typeMap": { "Person": "schema:Person", "Organization": "schema:Organization" },
  "propertyMap": {
    "id":       { "role": "identifier", "baseTemplate": "{}/" },
    "type":     { "role": "type" },
    "name":     "schema:name",
    "age":      { "iri": "schema:age", "datatype": "xsd:integer" },
    "born":     { "iri": "schema:birthDate", "datatype": "xsd:date" },
    "homepage": { "iri": "schema:url", "valueType": "identifier" },
    "tags":     "ex:tags",
    "knows":    { "iri": "schema:knows", "valueType": "identifier",
                  "baseTemplate": "friends.ttl", "template": "#{}" },
    "address":  { "iri": "schema:address",
                  "propertyMap": { "city": "schema:addressLocality",
                                   "zip":  "schema:postalCode" } }
  }
}`
  },
  {
    title: 'Leading example, named maps (§1)',
    data: `{ "id": "alice", "type": "Person", "name": "Alice", "age": 42,
  "born": "1984-02-29", "homepage": "https://alice.example/",
  "tags": ["rdf", "json"], "knows": ["Bob", "Eve"],
  "address": { "city": "Paris", "zip": "75001" } }`,
    mapping: `{
  "prefixes": { "schema": "http://schema.org/", "ex": "https://example.org/ns#",
                "xsd": "http://www.w3.org/2001/XMLSchema#" },
  "base": "https://example.org/people/",
  "unmappedKeys": "error",
  "typeMap": { "Person": "schema:Person", "Organization": "schema:Organization" },
  "propertyMap": "rootMap",
  "namedPropertyMaps": {
    "rootMap": {
      "id":       { "role": "identifier", "baseTemplate": "{}/" },
      "type":     { "role": "type" },
      "name":     "schema:name",
      "age":      { "iri": "schema:age", "datatype": "xsd:integer" },
      "born":     { "iri": "schema:birthDate", "datatype": "xsd:date" },
      "homepage": { "iri": "schema:url", "valueType": "identifier" },
      "tags":     "ex:tags",
      "knows":    { "iri": "schema:knows", "valueType": "identifier",
                    "baseTemplate": "friends.ttl", "template": "#{}" },
      "address":  { "iri": "schema:address", "propertyMap": "addressMap" }
    },
    "addressMap": {
      "city": "schema:addressLocality",
      "zip":  "schema:postalCode"
    }
  }
}`
  },
  {
    title: 'Literals (§5.1)',
    data: `{ "name": "Alice", "age": 42, "height": 1.70, "score": 0.5, "active": true,
  "born": "1984-02-29", "title": "Bonjour", "nickname": null,
  "raw": { "a": [1, 2] } }`,
    mapping: `{
  "prefixes": { "schema": "http://schema.org/", "ex": "https://example.org/ns#",
                "xsd": "http://www.w3.org/2001/XMLSchema#",
                "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#" },
  "propertyMap": {
    "name":     "schema:name",
    "age":      "schema:age",
    "height":   "schema:height",
    "score":    { "iri": "ex:score", "datatype": "xsd:double" },
    "active":   "ex:active",
    "born":     { "iri": "schema:birthDate", "datatype": "xsd:date" },
    "title":    { "iri": "schema:name", "language": "fr" },
    "nickname": "ex:nickname",
    "raw":      { "iri": "ex:raw", "datatype": "rdf:JSON" }
  }
}`
  },
  {
    title: 'Arrays are sequences (§5.3)',
    data: `{ "tags": ["rdf", "json"], "none": [], "one": ["rdf"],
  "matrix": [[1, 2], [3, 4]],
  "members": [ { "name": "A" }, { "name": "B" } ],
  "codes": ["A1", "B2"],
  "names": ["Dog", "Hund"],
  "mixed": ["a", 1, null, { "x": 1 }] }`,
    mapping: `{
  "prefixes": { "schema": "http://schema.org/", "ex": "https://example.org/ns#",
                "rdfs": "http://www.w3.org/2000/01/rdf-schema#" },
  "base": "https://example.org/people/",
  "propertyMap": {
    "tags":    "ex:tags",
    "none":    "ex:none",
    "one":     "ex:one",
    "matrix":  "ex:matrix",
    "members": { "iri": "ex:members", "propertyMap": { "name": "schema:name" } },
    "codes":   { "iri": "ex:code", "valueType": "identifier" },
    "names":   { "iri": "rdfs:label", "language": "en" },
    "mixed":   { "iri": "ex:mixed", "propertyMap": { "x": "ex:x" } }
  }
}`
  },
  {
    title: 'Dictionaries are repeated properties (§5.4)',
    data: `{ "people": { "alice": { "name": "Alice" }, "bob": { "name": "Bob" } },
  "label":  { "en": "Dog", "de": "Hund" },
  "prices": { "EUR": 10, "USD": 11 },
  "parts":  { "Wheel": { "n": 4 }, "Seat": { "n": 2 } },
  "fees":   { "GBP": 3, "EUR": 4 } }`,
    mapping: `{
  "prefixes": { "schema": "http://schema.org/", "ex": "https://example.org/ns#",
                "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
                "rdfs": "http://www.w3.org/2000/01/rdf-schema#" },
  "base": "https://example.org/people/",
  "propertyMap": {
    "people": { "iri": "ex:people", "keyedBy": "identifier",
                "propertyMap": { "name": "schema:name" } },
    "label":  { "iri": "rdfs:label", "keyedBy": "language" },
    "prices": { "iri": "ex:price",
                "keyedBy": { "property": "ex:currency", "valueProperty": "rdf:value" } },
    "parts":  { "iri": "ex:part", "keyedBy": "type",
                "typeMap": { "Wheel": "ex:Wheel", "Seat": "ex:Seat" },
                "propertyMap": { "n": "ex:n" } },
    "fees":   { "keyedBy": { "predicate": { "template": "https://example.org/ns#fee-{}" } } }
  }
}`
  },
  {
    title: 'Scopes: strict, root or enclosing (§4.1)',
    data: `{ "name": "Alice",
  "org": { "name": "ACME", "city": "Lyon",
           "inner": { "name": "deep", "city": "Nice" } } }`,
    mapping: `{
  "prefixes": { "schema": "http://schema.org/", "ex": "https://example.org/ns#" },
  "unmappedKeys": { "scope": "enclosing", "otherwise": "error" },
  "propertyMap": {
    "name": "schema:name",
    "city": "schema:addressLocality",
    "org":  { "iri": "schema:worksFor",
              "propertyMap": { "name": "schema:legalName",
                               "inner": { "iri": "ex:inner", "propertyMap": {} } } }
  }
}`
  },
  {
    title: 'A recursive named map (comments)',
    data: `{ "text": "root",
  "replies": [ { "text": "child",
                 "replies": [ { "text": "grandchild", "replies": [] } ] },
               { "text": "second", "replies": [] } ] }`,
    mapping: `{
  "prefixes": { "ex": "https://example.org/ns#" },
  "propertyMap": "comment",
  "namedPropertyMaps": {
    "comment": {
      "text":    "ex:text",
      "replies": { "iri": "ex:replies", "propertyMap": "comment" }
    }
  }
}`
  },
  {
    title: 'Type-scoped maps (shapes)',
    data: `{ "shapes": [ { "type": "Circle", "r": 1 },
             { "type": "Square", "s": 2 } ] }`,
    mapping: `{
  "prefixes": { "ex": "https://example.org/ns#" },
  "propertyMap": {
    "shapes": {
      "iri": "ex:shapes",
      "propertyMap": { "type": { "role": "type" } },
      "typeMap": {
        "Circle": { "iri": "ex:Circle", "propertyMap": { "r": "ex:radius" } },
        "Square": { "iri": "ex:Square", "propertyMap": { "s": "ex:side" } }
      }
    }
  }
}`
  },
  {
    title: 'A flat record with the RML conventions (§11.1)',
    data: `{ "id": 7, "first": "Ada", "last": "Lovelace",
  "street": "12 St James's Square", "city": "London",
  "bio": "Mathematician", "lang": "en",
  "editorId": 5, "works": [101, 102],
  "prices": { "GBP": 10, "EUR": 12 },
  "phones": [ { "number": "+44 20 7946 0000" },
              { "number": "+1 212 555 0100" } ] }`,
    mapping: `{
  "prefixes": { "schema": "http://schema.org/", "ex": "https://example.org/ns#" },
  "identifier": { "template": "https://example.org/people/{id}" },
  "class": "schema:Person",
  "groups": {
    "home": { "iri": "schema:address", "members": ["street", "city"],
              "class": "schema:PostalAddress",
              "identifier": { "template": "address-of-{id}", "termType": "blankNode" },
              "propertyMap": { "street": "schema:streetAddress",
                               "city": "schema:addressLocality" } }
  },
  "propertyMap": {
    "first":    "schema:givenName",
    "last":     "schema:familyName",
    "bio":      { "iri": "schema:description", "language": { "from": "lang" } },
    "editorId": { "iri": "schema:editor", "valueType": "identifier",
                  "template": "https://example.org/people/{}" },
    "works":    { "iri": "schema:author", "inverse": true, "valueType": "identifier",
                  "template": "https://example.org/works/{}" },
    "prices":   { "keyedBy": { "predicate": { "template": "https://example.org/ns#price-{}" } } },
    "phones":   { "iri": "schema:contactPoint", "class": "schema:ContactPoint",
                  "identifier": { "template": "https://example.org/people/{../id}/phone/{#}" },
                  "propertyMap": { "number": "schema:telephone" } }
  }
}`
  },
  {
    title: 'An envelope and ignored keys',
    data: `{ "data": [ { "name": "A" }, { "name": "B" } ],
  "meta": { "page": 1, "total": 2 } }`,
    mapping: `{
  "prefixes": { "schema": "http://schema.org/" },
  "unmappedKeys": "ignore",
  "propertyMap": {
    "data": { "flatten": true },
    "name": "schema:name"
  }
}`
  },
  {
    title: 'An embedded mapping (§4.3)',
    data: `{ "mapping": {
    "prefixes": { "ex": "https://example.org/ns#" },
    "propertyMap": { "n": "ex:n", "inner": { "iri": "ex:inner" } }
  },
  "n": 1,
  "inner": { "propertyMap": { "m": "https://example.org/ns#m" }, "m": 2 } }`,
    mapping: ``
  }
];
