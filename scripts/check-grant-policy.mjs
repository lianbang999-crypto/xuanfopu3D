import assert from 'node:assert/strict';
import ontology from '../data/grant-ontology-v1.json' with { type: 'json' };
import { SFP_POS } from '../src/sfp-data.js';

const grants = [];
for (const position of SFP_POS) {
  for (const move of position.moves || []) {
    if (!move.bonus) continue;
    for (const roll of move.c || []) {
      grants.push({ position: position.id, roll, count: move.bonus, move: Boolean(move.to) });
    }
  }
}

const positionCount = new Set(grants.map((item) => item.position)).size;
const moveAndGrantCount = grants.filter((item) => item.move).length;
const pureGrantCount = grants.length - moveAndGrantCount;
const expected = ontology.coverage;

assert.equal(ontology.canonicalOperationPolicy.mode, 'self_continue');
assert.equal(ontology.canonicalOperationPolicy.recipient, 'same_player');
assert.equal(positionCount, expected.positionCount);
assert.equal(grants.length, expected.ruleCellCount);
assert.equal(pureGrantCount, expected.pureGrantCount);
assert.equal(moveAndGrantCount, expected.moveAndGrantCount);
assert.ok(grants.every((item) => Number.isInteger(item.count) && item.count >= 1 && item.count <= 4));

console.log(`赠掷规则校验通过：${positionCount} 位、${grants.length} 格（纯赠 ${pureGrantCount}，移位兼赠 ${moveAndGrantCount}）`);
