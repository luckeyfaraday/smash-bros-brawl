import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Simulation, STAGE } from '../src/simulation';
import { Poses } from '../src/pose';
import { JAB_FLAGS, ScriptVM } from '../src/script';
import { JABS, attackTimeline } from '../src/moves';
import { neutralInput, type FighterData, type MotionData, type Input } from '../src/types';

const data: FighterData = JSON.parse(readFileSync('public/assets/mario/data.json', 'utf8'));
const motion: MotionData = JSON.parse(readFileSync('public/assets/mario/motion.json', 'utf8'));
const make = () => new Simulation(data, new Poses(motion));
const attack = () => ({ ...neutralInput(), attack: true });
const idle = (sim: Simulation, frames: number) => {
  for (let i = 0; i < frames; i++) sim.step(neutralInput());
};

test('Attack12 uses the extracted hit, combo and held-input flag timings', () => {
  const vm = new ScriptVM(data.moves.Attack12.commands);
  vm.advance(0); assert.equal(vm.hitboxes.size, 0);
  vm.advance(1); assert.equal(vm.hitboxes.size, 3); assert.equal(vm.hitboxes.get(0)?.damage, 2);
  vm.advance(3); assert.equal(vm.hitboxes.size, 0);
  vm.advance(4); assert.equal(vm.variables.has(JAB_FLAGS.combo), false);
  vm.advance(5); assert.equal(vm.variables.has(JAB_FLAGS.combo), true);
  vm.advance(8); assert.equal(vm.variables.has(JAB_FLAGS.auto), false);
  vm.advance(9); assert.equal(vm.variables.has(JAB_FLAGS.auto), true);
  vm.advance(17); assert.equal(vm.interruptible, false);
  vm.advance(18); assert.equal(vm.interruptible, true); assert.equal(vm.error, null);
});

test('Attack13 resizes only hitbox 0 at 8, clears at 10 and permits interruption at 29', () => {
  const vm = new ScriptVM(data.moves.Attack13.commands);
  vm.advance(5); assert.equal(vm.hitboxes.size, 0);
  vm.advance(6); assert.equal(vm.hitboxes.size, 3); assert.equal(vm.hitboxes.get(0)?.damage, 4);
  assert.equal(vm.hitboxes.get(0)?.radius, 5);
  const beforeResize = vm.snapshot();
  vm.advance(8); assert.equal(vm.hitboxes.get(0)?.radius, 3.6);
  assert.equal(vm.hitboxes.get(1)?.radius, 2.5); assert.equal(vm.hitboxes.get(2)?.radius, 2.5);
  assert.equal(beforeResize.hitboxes[0].radius, 5, 'saved frame must not change retroactively');
  vm.advance(9); assert.equal(vm.hitboxes.size, 3);
  vm.advance(10); assert.equal(vm.hitboxes.size, 0);
  vm.advance(28); assert.equal(vm.interruptible, false);
  vm.advance(29); assert.equal(vm.interruptible, true); assert.equal(vm.error, null);
});

test('malformed hitbox resize commands fail closed', () => {
  const original = data.moves.Attack13.commands.find(c => c.id === '0602')!;
  for (const params of [original.params.slice(0, 1), [original.params[0], { type: 1, raw: -1, value: -1 }]]) {
    const vm = new ScriptVM([{ ...original, params }]);
    vm.advance(0); assert.match(vm.error!, /Unsupported hitbox resize/);
  }
});

test('a press during hitlag waits for the combo flag and is consumed by one follow-up', () => {
  const sim = make(); sim.player.x = -6;
  sim.step(attack()); sim.step(neutralInput());
  assert.equal(sim.player.hitlag, 4);
  sim.step(attack()); assert.equal(sim.comboQueued, true);
  assert.equal(sim.player.clip, 'Attack11'); assert.equal(sim.player.age, 1);
  idle(sim, 3); assert.equal(sim.player.age, 1); assert.equal(sim.player.hitlag, 0);
  idle(sim, 5); assert.equal(sim.player.age, 6); assert.equal(sim.player.clip, 'Attack11');
  sim.step(neutralInput()); assert.equal(sim.player.clip, 'Attack12'); assert.equal(sim.player.age, 0);
  assert.equal(sim.comboQueued, false); assert.equal(sim.script?.variables.size, 0);
  const clips = new Set<string>();
  for (let i = 0; i < 35; i++) { sim.step(neutralInput()); clips.add(sim.player.clip); }
  assert.equal(clips.has('Attack13'), false, 'one tap must not queue both later attacks');
  assert.equal(sim.player.state, 'idle');
});

test('held input waits for the auto flag after a connected punch; a whiff does not auto-chain', () => {
  const hit = make(); hit.player.x = -6;
  for (let i = 0; i < 14; i++) hit.step(attack());
  assert.equal(hit.player.clip, 'Attack11'); assert.equal(hit.player.age, 9);
  hit.step(attack()); assert.equal(hit.player.clip, 'Attack12'); assert.equal(hit.player.age, 0);
  const miss = make(); miss.player.x = -40;
  const clips = new Set<string>();
  for (let i = 0; i < 60; i++) { miss.step(attack()); clips.add(miss.player.clip); }
  assert.equal(miss.hits, 0); assert.equal(clips.has('Attack12'), false);
});

test('fresh follow-up taps chain on a whiff and respect both combo gates', () => {
  const sim = make(); sim.player.x = -40;
  sim.step(attack()); sim.step(neutralInput()); sim.step(attack());
  idle(sim, 4); assert.equal(sim.player.clip, 'Attack11'); assert.equal(sim.player.age, 6);
  sim.step(neutralInput()); assert.equal(sim.player.clip, 'Attack12');
  sim.step(attack()); idle(sim, 4);
  assert.equal(sim.player.clip, 'Attack12'); assert.equal(sim.player.age, 5);
  sim.step(neutralInput()); assert.equal(sim.player.clip, 'Attack13');
  idle(sim, 30); assert.equal(sim.player.state, 'idle'); assert.equal(sim.hits, 0);
});

test('all three hits connect once, in both facing directions', () => {
  for (const facing of [1, -1]) {
    const sim = make(); sim.player.x *= facing; sim.dummy.x *= facing;
    sim.player.facing = facing; sim.dummy.facing = -facing;
    const hits: [string, number][] = [];
    for (let i = 0; i < 90; i++) {
      const previous = sim.hits;
      sim.step({ ...neutralInput(), axis: i < 10 ? facing : 0, attack: [10, 13, 23].includes(i) });
      if (sim.hits !== previous) hits.push([sim.lastHit!.move, sim.lastHit!.damage]);
    }
    assert.deepEqual(hits, [['Attack11', 3], ['Attack12', 2], ['Attack13', 4]]);
    assert.equal(sim.dummy.damage, 9); assert.equal(sim.player.state, 'idle'); assert.equal(sim.script, null);
  }
});

test('finisher recovery blocks early movement/jumps and has no fourth buffered jab', () => {
  const sim = make();
  for (let i = 0; i < 37; i++)
    sim.step({ ...neutralInput(), axis: i < 10 ? 1 : 0, attack: [10, 13, 23].includes(i) });
  assert.equal(sim.player.clip, 'Attack13'); assert.equal(sim.player.age, 6);
  for (let i = 0; i < 27; i++) sim.step({ ...attack(), jump: true, axis: -1 });
  assert.equal(sim.player.clip, 'Attack13'); assert.equal(sim.player.age, 29);
  assert.equal(sim.player.grounded, true); assert.equal(sim.player.facing, 1); assert.equal(sim.comboQueued, false);
  sim.step(neutralInput()); assert.equal(sim.player.state, 'idle');
  sim.step({ ...neutralInput(), jump: true }); assert.equal(sim.player.state, 'jumpSquat');
});

test('leaving the platform discards a queued follow-up and its collision state', () => {
  const sim = make(); sim.player.x = STAGE.right - 2; sim.player.vx = 0.7;
  sim.step(attack()); sim.step(neutralInput()); sim.step(attack());
  assert.equal(sim.comboQueued, true);
  idle(sim, 4);
  assert.equal(sim.player.grounded, false); assert.equal(sim.script, null); assert.equal(sim.comboQueued, false);
});

test('timelines and all jab collision poses come from the enabled raw scripts and original clips', () => {
  const poses = new Poses(motion);
  for (const [index, name] of JABS.entries()) {
    const frames = attackTimeline(data, motion, name);
    assert.deepEqual(frames.filter(f => f.active).map(f => f.frame), index === 2 ? [6, 7, 8, 9] : [1, 2]);
    assert.equal(frames.find(f => f.combo)?.frame, index === 0 ? 6 : index === 1 ? 5 : undefined);
    const vm = new ScriptVM(data.moves[name].commands);
    for (const frame of frames) {
      vm.advance(frame.frame);
      for (const box of [...data.hurtboxes, ...vm.hitboxes.values()])
        assert.ok(Object.values(poses.point(name, frame.frame, box.bone, box.offset, 1, 0, 0)).every(Number.isFinite));
    }
  }
});

test('the saved combo input recording matches its per-frame regression hashes and expected hits', () => {
  const fixture = JSON.parse(readFileSync('tests/fixtures/mario-jab-combo.json', 'utf8'));
  const sim = make();
  const hits: { frame: number; move: string; damage: number }[] = [];
  fixture.frames.forEach((input: Input, index: number) => {
    const before = sim.hits; sim.step(input);
    assert.equal(sim.hash(), fixture.hashes[index], `recording differs at simulation frame ${sim.frame}`);
    if (sim.hits !== before) hits.push({ frame: sim.frame, move: sim.lastHit!.move, damage: sim.lastHit!.damage });
  });
  assert.deepEqual(hits, [{ frame: 12, move: 'Attack11', damage: 3 },
    { frame: 23, move: 'Attack12', damage: 2 }, { frame: 37, move: 'Attack13', damage: 4 }]);
  assert.equal(sim.hash(), fixture.expectedHash); assert.equal(sim.dummy.damage, 9);
});
