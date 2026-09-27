import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diorama as D, yardLayout as L } from '../src/layout.ts';
import { blockBox, brickCells, fencePosts, hedgeSlots, rectBox, toWorld } from '../src/scene3d/world.ts';

test('3D positions come from the 2D layout: origin, scale and the block covering yard + Mac strip', () => {
  assert.deepEqual(toWorld(D.center.x, D.center.y), { x: 0, z: 0 });
  assert.deepEqual(toWorld(D.center.x + 40, D.center.y + 80), { x: 1, z: 2 });
  const block = blockBox(), yard = rectBox(L.ground);
  const macLeft = toWorld(L.mac.x, 0).x;
  assert.ok(block.x - block.width / 2 < macLeft, 'the Mac mansion sits on the block');
  assert.ok(block.x + block.width / 2 > yard.x + yard.width / 2 && block.z + block.depth / 2 > toWorld(0, L.gate.y).z, 'yard and gate sit on the block');
});

test('fence posts run along each slot, spanning its length', () => {
  for (const slot of L.slots) {
    const posts = fencePosts(slot);
    assert.equal(posts.length, D.fence.posts);
    const span = slot.vertical ? posts.at(-1)!.z - posts[0].z : posts.at(-1)!.x - posts[0].x;
    assert.ok(Math.abs(span - L.fence.length * D.unit) < 1e-9);
    assert.ok(posts.every(p => (slot.vertical ? p.x === posts[0].x : p.z === posts[0].z)));
  }
});

test('the house grows brick by brick in layers, capped, never below the slab', () => {
  assert.equal(brickCells(0).length, 0);
  const twelve = brickCells(12);
  assert.equal(twelve.length, 12);
  assert.ok(twelve.every(b => b.layer === 0));
  assert.equal(brickCells(13).at(-1)!.layer, 1);
  const cap = D.house.columns * D.house.rows * D.house.maxLayers;
  assert.equal(brickCells(cap + 50).length, cap);
  assert.ok(brickCells(40).every(b => b.y > D.house.slab));
  const house = rectBox(L.house);
  assert.ok(brickCells(12).every(b => Math.abs(b.x - house.x) < house.width / 2 + 0.5 && Math.abs(b.z - house.z) < house.depth / 2 + 0.5), 'bricks stay on the house footprint');
});

test('hedges fill only unfenced left slots, like the 2D yard', () => {
  assert.deepEqual(hedgeSlots(5).map(h => h.index), [5, 6]);
  assert.deepEqual(hedgeSlots(6).map(h => h.index), [6]);
  assert.deepEqual(hedgeSlots(7), []);
});
