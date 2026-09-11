import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GameInput} from '../src/game-input';

Object.defineProperty(globalThis,'navigator',{configurable:true,value:{getGamepads:()=>[]}});

test('a keyboard tap between ticks reaches local P2 after P1 has been read',()=>{
  const input=new GameInput();input.pressKey('Enter');input.keys.delete('Enter');
  assert.equal(input.read(0,true).jump,false);assert.equal(input.read(1,true).jump,true);
  input.endFrame();assert.equal(input.read(1,true).jump,false);
});

test('a fast touch tap is consumed once and held movement survives until release',()=>{
  const input=new GameInput();input.pressTouch(1,'jump');input.touch.delete(1);input.pressTouch(2,'right');
  assert.equal(input.read(0,false).jump,true);assert.equal(input.read(0,false).axis,1);
  input.endFrame();assert.equal(input.read(0,false).jump,false);assert.equal(input.read(0,false).axis,1);
  input.touch.delete(2);assert.equal(input.read(0,false).axis,0);
});

test('pause clears pending taps and every held input',()=>{
  const input=new GameInput();input.pressKey('KeyJ');input.pressTouch(1,'jump');input.pressKey('ArrowLeft');
  input.clear();assert.equal(input.read(0,false).attack,false);assert.equal(input.read(0,false).jump,false);assert.equal(input.read(1,true).axis,0);
});
