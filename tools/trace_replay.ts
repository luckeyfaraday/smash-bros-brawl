/** Replay an exported input tape and write states for frame-by-frame inspection. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Simulation } from '../src/simulation';
import { Poses } from '../src/pose';
import { SIMULATION_ID, type FighterData, type MotionData, type FrameInput, type Input } from '../src/types';
import {validFighter,type FighterId} from '../src/roster';

try {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath)
    throw new Error('Usage: npm run trace:replay -- input.json output.json');
  if (resolve(inputPath) === resolve(outputPath)) throw new Error('Use a different output path to preserve the recording');
  const tape = JSON.parse(readFileSync(inputPath, 'utf8'));
  const ids=tape.options?.fighters??['mario','mario'];
  if(!Array.isArray(ids)||ids.length!==2||!ids.every(validFighter))throw new Error('Recording has invalid fighter selections');
  const fighters=ids.map((id:FighterId)=>({data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')) as FighterData,
    poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')) as MotionData)}));
  const {data,poses}=fighters[0];
  if (tape.version !== 1 || tape.simulation !== SIMULATION_ID || tape.initialState !== 'default')
    throw new Error(`Expected a version-1 recording for ${SIMULATION_ID} from the default training state`);
  if (tape.source?.sha256 !== data.source.sha256) throw new Error('Recording uses different fighter source data');
  if(tape.sources && (tape.sources.length!==2||fighters.some((f,i)=>tape.sources[i]?.sha256!==f.data.source.sha256)))
    throw new Error('Recording uses different opponent source data');
  if(ids[0]!==ids[1]&&!tape.sources)throw new Error('Mixed-fighter recording is missing opponent source data');
  if (!Array.isArray(tape.frames) || !tape.frames.length || !/^[0-9a-f]{8}$/.test(tape.expectedHash))
    throw new Error('Recording is missing its input frames or final state hash');
  if(tape.options && (!['training','battle'].includes(tape.options.mode)||!['cpu','local'].includes(tape.options.opponent)))
    throw new Error('Recording has invalid game options');
  const sim = new Simulation(data,poses,tape.options,fighters[1]);
  let firstMismatch: number | null = null;
  const frames = tape.frames.map((input: FrameInput, index: number) => {
    for(const player of [input,input?.opponent])if(player&&!['grab','side','downSpecial'].every(key=>player[key as keyof Input]===undefined||typeof player[key as keyof Input]==='boolean'))throw new Error(`Invalid action input at frame ${index+1}`);
    if (!input || !Number.isFinite(input.axis) || Math.abs(input.axis) > 1 || !Number.isFinite(input.vertical) || Math.abs(input.vertical)>1 ||
        !['jump', 'attack', 'run', 'down','shield','smash','special','neutral'].every(key => typeof input[key as keyof Input] === 'boolean'))
      throw new Error(`Invalid input at frame ${index + 1}`);
    if(input.opponent && (!Number.isFinite(input.opponent.axis)||Math.abs(input.opponent.axis)>1||!Number.isFinite(input.opponent.vertical)||Math.abs(input.opponent.vertical)>1||
      !['jump','attack','run','down','shield','smash','special','neutral'].every(key=>typeof input.opponent![key as keyof Input]==='boolean')))
      throw new Error(`Invalid opponent input at frame ${index+1}`);
    sim.step(input,input.opponent);
    if (sim.error) throw new Error(`Frame ${sim.frame}: ${sim.error}`);
    const hash = sim.hash();
    if (Array.isArray(tape.hashes) && tape.hashes[index] !== hash && firstMismatch === null) firstMismatch = sim.frame;
    return { input, hash, state: sim.snapshot() };
  });
  const matches = firstMismatch === null && sim.hash() === tape.expectedHash;
  const trace = { simulation: SIMULATION_ID, source: data.source,
    origin: 'Browser simulation trace; not a reference-game measurement',
    expectedHash: tape.expectedHash, actualHash: sim.hash(), matches, firstMismatch, frames };
  // Refuse to overwrite an existing trace or any other local file.
  writeFileSync(outputPath, JSON.stringify(trace, null, 2) + '\n', { flag: 'wx' });
  console.log(`${frames.length} frames, ${sim.hits} hits, ${sim.dummy.damage}% damage. ${matches ? 'Replay verified' : 'Replay mismatch'}: ${outputPath}`);
  if (!matches) process.exitCode = 1;
} catch (error) {
  console.error(String(error)); process.exitCode = 1;
}
