/**
 * rdf-array: are two datasets the same but for their blank node labels? For the
 * expectations that hold sequences, which rdf-canonize's RDFC-1.0 cannot hash.
 * Blank nodes are coloured by the quads they stand in, then matched by trying
 * the labels that share a colour.
 */
const {toNTriples} = require('../lib/array/terms');

const blankNodes = (term, found) => {
  if(term.termType === 'BlankNode') {
    found.add(term.value);
  } else if(term.termType === 'Sequence') {
    term.elements.forEach(element => blankNodes(element, found));
  }
  return found;
};

const parts = ({subject, predicate, object, graph}) =>
  [subject, predicate, object, graph];

const spell = (term, label) => {
  if(term.termType === 'BlankNode') {
    return label(term.value);
  }
  if(term.termType === 'Sequence') {
    return `(${term.elements.map(element => spell(element, label)).join(' ')})`;
  }
  return toNTriples(term);
};

const spellQuad = (quad, label) =>
  parts(quad).map(term => spell(term, label)).join(' ');

function colours(dataset) {
  const nodes = new Set();
  dataset.forEach(quad =>
    parts(quad).forEach(term => blankNodes(term, nodes)));
  let colour = new Map([...nodes].map(node => [node, '']));
  for(let round = 0; round <= nodes.size; round++) {
    const next = new Map();
    for(const node of nodes) {
      const uses = dataset
        .filter(quad => parts(quad).some(
          term => blankNodes(term, new Set()).has(node)))
        .map(quad => spellQuad(quad, label =>
          label === node ? '_:self' : `_:{${colour.get(label)}}`))
        .sort();
      next.set(node, uses.join('\n'));
    }
    colour = next;
  }
  return colour;
}

function isomorphic(a, b) {
  if(a.length !== b.length) {
    return false;
  }
  const colourA = colours(a);
  const colourB = colours(b);
  const signature = colour => [...colour.values()].sort().join('\n\n');
  if(signature(colourA) !== signature(colourB)) {
    return false;
  }
  const target = new Set(b.map(quad => spellQuad(quad, label => `_:${label}`)));
  const nodes = [...colourA.keys()];
  const match = (i, map, used) => {
    if(i === nodes.length) {
      return a.every(quad =>
        target.has(spellQuad(quad, label => `_:${map.get(label)}`)));
    }
    for(const [candidate, colour] of colourB) {
      if(colour === colourA.get(nodes[i]) && !used.has(candidate)) {
        map.set(nodes[i], candidate);
        used.add(candidate);
        if(match(i + 1, map, used)) {
          return true;
        }
        used.delete(candidate);
      }
    }
    return false;
  };
  return match(0, new Map(), new Set());
}

module.exports = {isomorphic};
