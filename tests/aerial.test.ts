import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Simulation, STAGE } from '../src/simulation';
import { Poses } from '../src/pose';
import { LANDING_LAG_FLAG, ScriptVM } from '../src/script';
import { attackTimeline } from '../src/moves';
import { neutralInput, type FighterData, type MotionData, type Input } from '../src/types';

const data: FighterData = JSON.parse(readFileSync('public/assets/mario/data.json', 'utf8'));
const motion: MotionData = JSON.parse(readFileSync('public/assets/mario/motion.json', 'utf8'));
const make = () => new Simulation(data, new Poses(motion));
const attack = () => ({ ...neutralInput(), attack: true });
const idle = (sim: Simulation, frames: number) => {
  for (let i = 0; i < frames; i++) sim.step(neutralInput());
};
function inAir(x = -40) {
  const sim = make();
  Object.assign(sim.player, { x, y: 100, grounded: false, state: 'air', clip: 'Fall', jumps: 1 });
  return sim;
}
function landAt(age: number) {
  const sim = inAir();
  if (age > 0) { sim.step(attack()); idle(sim, age - 1); }
  sim.player.y = 0.01; sim.player.vy = -0.2;
  sim.step(age === 0 ? attack() : neutralInput());
  return sim;
}

test('neutral aerial executes the original early/late hitboxes and landing flag windows', () => {
  const vm = new ScriptVM(data.moves.AttackAirN.commands);
  vm.advance(1); assert.equal(vm.hitboxes.size, 0); assert.equal(vm.variables.has(LANDING_LAG_FLAG), false);
  vm.advance(2); assert.equal(vm.hitboxes.size, 2); assert.equal(vm.variables.has(LANDING_LAG_FLAG), true);
  assert.equal(vm.hitboxes.get(0)?.damage, 10); assert.equal(vm.hitboxes.get(0)?.radius, 4);
  assert.equal(vm.hitboxes.get(0)?.bone, 17);
  vm.advance(4); assert.equal(vm.hitboxes.get(0)?.damage, 10);
  vm.advance(5); assert.equal(vm.hitboxes.get(0)?.damage, 5); assert.equal(vm.hitboxes.get(0)?.radius, 3);
  assert.equal(vm.hitboxes.get(0)?.bone, 16); assert.equal(vm.hitboxes.get(1)?.damage, 5);
  vm.advance(28); assert.equal(vm.hitboxes.size, 2);
  vm.advance(29); assert.equal(vm.hitboxes.size, 0); assert.equal(vm.variables.has(LANDING_LAG_FLAG), true);
  vm.advance(32); assert.equal(vm.variables.has(LANDING_LAG_FLAG), true);
  vm.advance(33); assert.equal(vm.variables.has(LANDING_LAG_FLAG), false); assert.equal(vm.error, null);
});

test('the same attack input selects jab on the ground and neutral aerial in the air', () => {
  const ground = make(); ground.step(attack()); assert.equal(ground.player.clip, 'Attack11');
  const air = inAir(); air.step(attack());
  assert.equal(air.player.state, 'aerial'); assert.equal(air.player.clip, 'AttackAirN');
  assert.equal(air.player.age, 0); assert.equal(air.player.poseFrame, 0);
  assert.equal(air.comboQueued, false); assert.equal(air.player.jumps, 1);
});

test('an early contact deals 10%; replacing hitboxes for the late phase does not rehit', () => {
  const sim = inAir(-6);
  Object.assign(sim.dummy, { y: 100, grounded: false, state: 'air', clip: 'Fall' });
  sim.step(attack()); idle(sim, 2);
  assert.equal(sim.hits, 1); assert.equal(sim.dummy.damage, 10);
  assert.equal(sim.player.age, 2); assert.equal(sim.player.hitlag, 6);
  const pose = sim.player.poseFrame, y = sim.player.y;
  idle(sim, 6); assert.equal(sim.player.poseFrame, pose); assert.equal(sim.player.y, y);
  // Keep the victim in range through the replacement to exercise hit suppression.
  for (let i = 0; i < 9; i++) {
    sim.dummy.x = sim.player.x + 8; sim.dummy.y = sim.player.y;
    sim.step(neutralInput());
  }
  assert.equal(sim.script?.hitboxes.get(0)?.damage, 5);
  assert.equal(sim.hits, 1); assert.equal(sim.dummy.damage, 10);
});

test('first contact during the late phase deals 5%', () => {
  const sim = inAir(-6);
  Object.assign(sim.dummy, { x: 40, y: 100, grounded: false, state: 'air', clip: 'Fall' });
  sim.step(attack()); idle(sim, 4); assert.equal(sim.hits, 0);
  sim.dummy.x = sim.player.x + 8; sim.dummy.y = sim.player.y;
  sim.step(neutralInput());
  assert.equal(sim.player.age, 5); assert.equal(sim.dummy.damage, 5);
  assert.equal(sim.lastHit?.move, 'AttackAirN');
});

test('floor contact uses the landing flag on both its set and clear boundaries', () => {
  for (const frame of [0, 1, 2, 28, 29, 32, 33, 34]) {
    const sim = landAt(frame), needsLag = frame >= 2 && frame < 33;
    assert.equal(sim.player.grounded, true, `time ${frame}`);
    assert.equal(sim.player.clip, needsLag ? 'LandingAirN' : 'Wait1', `time ${frame}`);
    assert.equal(sim.landingDuration(sim.player), needsLag ? 10 : 3);
    assert.equal(sim.player.age, 0); assert.equal(sim.script, null); assert.equal(sim.comboQueued, false);
  }
});

test('landing clears aerial hitboxes before grounded collision checks', () => {
  const sim = inAir(-6); sim.step(attack()); sim.step(neutralInput());
  sim.player.y = 0.01; sim.player.vy = -0.2;
  sim.step(neutralInput());
  assert.equal(sim.player.clip, 'LandingAirN'); assert.equal(sim.script, null);
  assert.equal(sim.hits, 0); assert.equal(sim.dummy.damage, 0);
});

test('aerial landing plays the original animation over ten ticks and blocks early actions', () => {
  const sim = landAt(5);
  assert.equal(sim.player.poseFrame, 0);
  for (let frame = 1; frame < 10; frame++) {
    sim.step({ ...attack(), jump: true, axis: 1 });
    assert.equal(sim.player.state, 'landing'); assert.equal(sim.player.jumps, 0);
  }
  assert.equal(sim.player.poseFrame, motion.clips.LandingAirN.count - 1);
  sim.step({ ...attack(), jump: true, axis: 1 });
  assert.equal(sim.player.state, 'walk'); assert.equal(sim.script, null);
  sim.step(neutralInput()); sim.step({ ...neutralInput(), jump: true });
  assert.equal(sim.player.state, 'jumpSquat');
});

test('drift and fast fall work without canceling the aerial or spending an extra jump', () => {
  const sim = inAir(); sim.step(attack());
  sim.step({ ...attack(), axis: 1, jump: true, down: true });
  assert.equal(sim.player.clip, 'AttackAirN'); assert.equal(sim.player.jumps, 1);
  assert.ok(sim.player.vx > 0); assert.equal(sim.player.fastfall, true);
  assert.equal(sim.player.vy, -data.attributes['Fastfall Terminal Velocity']);
  assert.equal(sim.player.poseFrame, 1);
  sim.step(neutralInput()); sim.step(attack());
  assert.equal(sim.player.age, 3, 'pressing attack again must not restart the move');
});

test('a completed aerial returns to falling and restores access to the remaining air jump', () => {
  const sim = inAir(); sim.player.y = STAGE.blastTop - 10;
  sim.step(attack()); idle(sim, 45);
  assert.equal(sim.player.clip, 'AttackAirN'); assert.equal(sim.player.age, 45);
  sim.step(neutralInput()); assert.equal(sim.player.clip, 'Fall'); assert.equal(sim.script, null);
  sim.step({ ...neutralInput(), jump: true });
  assert.equal(sim.player.clip, 'JumpAerialF'); assert.equal(sim.player.jumps, 2);
});

test('respawning discards the aerial and a script error cannot disappear into a landing transition', () => {
  const sim = inAir(); sim.player.y = STAGE.blastBottom - 1;
  sim.step(attack()); assert.equal(sim.player.state, 'idle'); assert.equal(sim.script, null);
  const faulty = structuredClone(data);
  faulty.moves.AttackAirN.commands = [{ id: 'DEAD', name: 'unsupported', offset: 0, params: [] }];
  const bad = new Simulation(faulty, new Poses(motion));
  Object.assign(bad.player, { y: 0.01, vy: -1, grounded: false, state: 'air', clip: 'Fall' });
  bad.step(attack());
  assert.match(bad.script?.error ?? '', /Unsupported command/);
  assert.equal(bad.player.state, 'aerial'); assert.equal(bad.player.grounded, false);
  assert.equal(bad.script?.hitboxes.size, 0);
});

test('the aerial timeline includes both damage phases and original attack/landing poses', () => {
  const timeline = attackTimeline(data, motion, 'AttackAirN'), poses = new Poses(motion);
  assert.equal(timeline.length, 46);
  assert.deepEqual(timeline.filter(f => f.damage === 10).map(f => f.frame), [2, 3, 4]);
  assert.equal(timeline.filter(f => f.damage === 5).length, 24);
  assert.equal(timeline[32].landingLag, true); assert.equal(timeline[33].landingLag, false);
  for (const clip of ['AttackAirN', 'LandingAirN']) {
    assert.ok(motion.clips[clip]);
    for (let frame = 0; frame < motion.clips[clip].count; frame++)
      for (const h of data.hurtboxes)
        assert.ok(Object.values(poses.point(clip, frame, h.bone, h.offset, -1, 0, 0)).every(Number.isFinite));
  }
});

test('the saved short-hop aerial and fast-fall recording matches every frame', () => {
  const tape = JSON.parse(readFileSync('tests/fixtures/mario-neutral-aerial.json', 'utf8'));
  const sim = make(); let landing = false;
  tape.frames.forEach((input: Input, index: number) => {
    sim.step(input);
    assert.equal(sim.hash(), tape.hashes[index], `aerial recording differs at frame ${sim.frame}`);
    if (sim.player.clip === 'LandingAirN') landing = true;
  });
  assert.equal(landing, true); assert.equal(sim.hits, 1); assert.equal(sim.dummy.damage, 10);
  assert.equal(sim.player.state, 'idle'); assert.equal(sim.hash(), tape.expectedHash);
});
