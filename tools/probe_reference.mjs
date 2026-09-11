import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { cpus, platform, release, totalmem } from 'node:os';
import { parseArgs } from 'node:util';
import { workerFile, sha256, parseReferencePatch, applyReferencePatch } from './reference_patch.mjs';
import { startCpuProfiles } from './reference_cpu_profile.mjs';
import { loadReferenceCandidate, verifyReferenceCheckpoint } from './reference_candidate.mjs';

const { values: args } = parseArgs({ options: {
  seconds: { type: 'string', default: '90' }, output: { type: 'string' },
  url: { type: 'string', default: 'http://127.0.0.1:5180/' },
  control: { type: 'string' }, 'load-state': { type: 'string' },
  patch: { type: 'string' },
  candidate: { type: 'string' }, 'allow-state-migration': { type: 'boolean' },
  'cpu-profile': { type: 'boolean' },
  headed: { type: 'boolean' }, 'press-start': { type: 'boolean' }, help: { type: 'boolean' }
} });
if (args.help) {
  console.log('Usage: npm run reference:probe -- [--seconds 90] [--headed] [--press-start]\n' +
    '  [--output NEW_DIRECTORY] [--control ACTIONS.json] [--load-state CHECKPOINT.sav]\n' +
    '  [--url http://127.0.0.1:5180/?settings] [--patch PATCH.json] [--cpu-profile]\n' +
    '  [--candidate DIRECTORY] [--allow-state-migration]\nSee docs/reference-validation.md.');
  process.exit(0);
}
const seconds = Number(args.seconds);
if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 3600)
  throw new Error('--seconds must be between 0 and 3600');
const root = fileURLToPath(new URL('../', import.meta.url));
const control = args.control ? resolve(args.control) : null;
const loadState = args['load-state'] ? resolve(args['load-state']) : null;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = resolve(args.output ?? `artifacts/reference/${stamp}`);
const headed = Boolean(args.headed);
const url = new URL(args.url);
const candidate = args.candidate ? await loadReferenceCandidate(resolve(args.candidate)) : null;
if (candidate) {
  const requested = url.searchParams.get('coreid')?.replace(/^sha256:/, '');
  if (requested && requested !== candidate.metadata.coreId.slice(7)) throw new Error('URL and candidate identities differ');
  url.searchParams.set('coreid', candidate.metadata.coreId.slice(7));
} else if (url.searchParams.has('coreid')) throw new Error('A coreid selector requires --candidate DIRECTORY');
if (args['allow-state-migration'] && (!candidate || !loadState))
  throw new Error('--allow-state-migration requires a candidate and a checkpoint');
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  throw new Error('The reference probe only mounts discs into a local HTTP runtime');
for (const [key, value] of Object.entries({core:'upstream', video:'software', fastsw:'0', wasmjit:'0',
  cpu:'single', disable:'meleeloop,meleecall,osinterrupt', speed:'1', presenter:'webgpu',
  metrics:'1', pacing:'tick', nogamepad:'1'}))
  if (!url.searchParams.has(key)) url.searchParams.set(key, value);
if (url.searchParams.get('core') !== 'upstream') throw new Error('This probe requires the executable upstream core');
await mkdir(dirname(output), { recursive: true });
await mkdir(output); // Refuse to overwrite earlier evidence.
const snapshot = JSON.parse(await readFile(join(root, '.tools/reference-runtime/snapshot.json'), 'utf8'));
const disc = JSON.parse(await readFile(join(root, '.tools/brawl-reference.json'), 'utf8'));
const report = { url: url.href, headed, coreId: candidate?.metadata.coreId ?? snapshot.coreId, disc, browser: '',
  machine: { os: `${platform()} ${release()}`, cpu: cpus()[0]?.model, memoryBytes: totalmem() },
  scope: 'Boot/input diagnostic only; wall-timed inputs, not a gameplay or fidelity qualification',
  samples: [], inputs: [], keyboardEvents: [], checkpoints: [], errors: [], rendererMessages: [] };
if (candidate) report.candidate = { evidenceSha256: candidate.evidenceSha256, build: candidate.metadata };
const log = [];
let browser, page;
let cpuProfiles;
let start;
let monotonicStart;
const completed = new Set();
const allowedKeys = new Set(['KeyX', 'KeyZ', 'KeyV', 'KeyB', 'Enter', 'KeyQ', 'KeyE', 'KeyC',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyI', 'KeyK', 'KeyJ', 'KeyL']);
async function save() {
  if (page && !page.isClosed()) {
    const events = await page.evaluate(() => window.__referenceKeyboardEvents?.splice(0) || []).catch(() => []);
    report.keyboardEvents.push(...events);
    report.unplannedKeyboardEvents = report.keyboardEvents.filter(event => !event.action).length;
  }
  await writeFile(join(output, 'report.json.tmp'), JSON.stringify(report, null, 2));
  await rename(join(output, 'report.json.tmp'), join(output, 'report.json'));
  await writeFile(join(output, 'console.log'), log.join('\n'));
}
async function state() {
  return page.evaluate(() => {
    const frame = window.__lastFrameInfo || {};
    return { mode: window.__host?.mode, running: window.__host?.running,
      canvas: { width: document.querySelector('#screen')?.width, height: document.querySelector('#screen')?.height },
      coreFrame: frame.frame, coreFps: frame.coreFps, gameSpeed: frame.gameSpeed,
      coreTicks: frame.coreTicks, coreTicksPerSecond: frame.coreTicksPerSecond, cpuCoreName: frame.cpuCoreName,
      loadedCheckpointGeneration: window.__host?.adapter?.loadedCheckpointGeneration,
      loadedCheckpointTicks: window.__host?.adapter?.loadedCheckpointTicks,
      frameProfileStats: frame.frameProfileStats, causalTelemetry: frame.causalTelemetry,
      jit: { state: frame.ppcWasmHelperStats?.match(/\bjit:(off|warmup|on|disabled)\b/)?.[1],
        compiledBlocks: frame.ppcWasmBlockCompileCount, executedBlocks: frame.ppcWasmBlockRunCount },
      ppcPc: frame.ppcPc, coreState: frame.coreState, coreStatus: frame.coreStatus,
      status: document.querySelector('#statusPill')?.textContent, helpers: frame.ppcWasmHelperStats };
  });
}
async function press(action) {
  const before = await state();
  const elapsed = (Date.now() - start) / 1000;
  await page.evaluate(id => { window.__referenceAction = id; }, action.id);
  try {
    for (const key of action.keys) await page.keyboard.down(key);
    await page.waitForTimeout(action.holdMs ?? 750);
  } finally {
    for (const key of action.keys) await page.keyboard.up(key);
    await page.evaluate(() => { window.__referenceAction = null; });
  }
  report.inputs.push({ ...action, elapsed, before, after: await state() });
  console.log(`Input ${action.id}: ${action.keys.join('+')}`);
}
async function checkpoint(id) {
  const before = await state();
  const result = await page.evaluate(() => window.__saveStateFile());
  if (!result.saved || !result.b64) throw new Error(`Save state failed: ${result.error}`);
  const bytes = Buffer.from(result.b64, 'base64');
  const file = `${id}.sav`;
  await writeFile(join(output, file), bytes, { flag: 'wx' });
  const metadata = { file, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    coreId: report.coreId, discSha256: disc.sha256, url: url.href, before, after: await state(),
    qualification: 'Captured in this browser core; not verified against native Dolphin' };
  await writeFile(join(output, `${id}.json`), JSON.stringify(metadata, null, 2), { flag: 'wx' });
  report.checkpoints.push(metadata);
  console.log(`Saved checkpoint: ${file} (${bytes.length} bytes)`);
}
async function actions() {
  if (!control) return [];
  let list;
  try { list = JSON.parse(await readFile(control, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  if (!Array.isArray(list)) throw new Error('Control file must contain an array');
  const ids = new Set();
  for (const action of list) {
    if (!action || typeof action.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(action.id) || ids.has(action.id))
      throw new Error('Each control action needs a unique lowercase id');
    ids.add(action.id);
    if (!['press', 'save', 'stop'].includes(action.kind)) throw new Error(`Unknown action: ${action.kind}`);
    if (action.kind === 'press' && (!Array.isArray(action.keys) || !action.keys.length ||
      action.keys.some(key => !allowedKeys.has(key)) ||
      !Number.isFinite(action.holdMs ?? 750) || (action.holdMs ?? 750) < 50 || (action.holdMs ?? 750) > 5000))
      throw new Error(`Invalid keys or holdMs for ${action.id}`);
    if (!Number.isFinite(action.at ?? 0) || (action.at ?? 0) < 0) throw new Error(`Invalid time for ${action.id}`);
  }
  return list.filter(action => !completed.has(action.id) && (action.at ?? 0) <= (Date.now() - start) / 1000);
}
try {
  const corePrefix = candidate?.prefix ?? '/cores/dolphin/';
  const coreResponse = await fetch(new URL(corePrefix + 'dolphin-core-upstream.wasm', url),
    { signal: AbortSignal.timeout(30000) });
  if (!coreResponse.ok) throw new Error(`Core HTTP ${coreResponse.status}`);
  report.servedCoreId = 'sha256:' + createHash('sha256').update(
    Buffer.from(await coreResponse.arrayBuffer())).digest('hex');
  if (report.servedCoreId !== report.coreId) throw new Error('Served core differs from the expected build');
  if (candidate) {
    const glue = await fetch(new URL(corePrefix + 'dolphin-core-upstream.js', url), { signal: AbortSignal.timeout(30000) });
    if (!glue.ok || sha256(Buffer.from(await glue.arrayBuffer())) !== sha256(candidate.files.get('dolphin-core-upstream.js')))
      throw new Error('Served candidate JavaScript differs from the build evidence');
  }
  const workerResponse = await fetch(new URL(workerFile, url), { signal: AbortSignal.timeout(30000) });
  if (!workerResponse.ok) throw new Error(`Worker HTTP ${workerResponse.status}`);
  report.worker = { servedSha256: sha256(Buffer.from(await workerResponse.arrayBuffer())),
    snapshotSha256: snapshot.files[workerFile],
    serverPatchSha256: workerResponse.headers.get('X-Brawl-Patch-Sha256') };
  browser = await chromium.launch({ channel: 'chrome', headless: !headed,
    args: ['--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required'] });
  report.browser = browser.version();
  page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  if (args.patch) {
    const patchBytes = await readFile(resolve(args.patch));
    const patch = parseReferencePatch(patchBytes);
    report.patch = { name: patch.name, file: patch.file, applied: false,
      specificationSha256: createHash('sha256').update(patchBytes).digest('hex') };
    await writeFile(join(output, 'patch.json'), patchBytes);
    await page.context().route('**/src/upstream-discio-worker.js*', async route => {
      try {
        const response = await route.fetch();
        const original = await response.body();
        const { body, metadata } = applyReferencePatch(original, patch);
        Object.assign(report.patch, metadata, { applied: true });
        await route.fulfill({ response, body });
      } catch (error) {
        report.errors.push(`Worker patch: ${error}`);
        await route.abort('failed');
      }
    });
  }
  await page.addInitScript(() => {
    window.__referenceKeyboardEvents = [];
    for (const type of ['keydown', 'keyup']) document.addEventListener(type, event => {
      window.__referenceKeyboardEvents.push({ type, code: event.code, repeat: event.repeat,
        timestamp: Date.now(), action: window.__referenceAction || null });
    }, true);
  });
  page.on('console', message => {
    const text = message.text();
    log.push(`[${message.type()}] ${text}`);
    if (/\[webgpu-exec\] VALIDATION:/.test(text)) report.rendererMessages.push(text);
  });
  page.on('pageerror', error => { log.push(`[pageerror] ${error.stack}`); report.errors.push(error.message); });
  await page.goto(url.href);
  await page.waitForFunction(() => window.__host?.adapter, undefined, { timeout: 30000 });
  report.selectedCore = await page.evaluate(() => window.__host.upstreamCoreBuild);
  if (report.selectedCore?.coreId !== report.coreId)
    throw new Error('Browser selected a different core identity');
  if (!await page.evaluate(() => crossOriginIsolated)) throw new Error('Runtime is not cross-origin isolated');
  console.log('Mounting the local Brawl RVZ in browser WORKERFS');
  report.machine.gpu = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    const info = adapter?.info;
    return info ? { vendor: info.vendor, architecture: info.architecture, device: info.device,
      description: info.description, fallback: adapter.isFallbackAdapter } : null;
  });
  await page.setInputFiles('#romInput', join(root, '.tools/brawl-reference.rvz'));
  await page.waitForFunction(() => window.__host?.mode === 'dolphin' && window.__host?.game?.gameId === 'RSBE01',
    undefined, { timeout: 120000 });
  report.game = await page.evaluate(() => window.__host.game);
  if (args.patch && !report.patch.applied) throw new Error('Requested worker patch was not applied');
  if (!report.game.fullCore || !report.game.coreBoot?.accepted)
    throw new Error('Disc metadata mounted without booting the executable core');
  await page.evaluate(async () => { await window.__audio.setMuted(true); window.__host.setAudioMuted(true); });
  console.log('Mounted original disc', JSON.stringify({gameId:report.game.gameId, title:report.game.name, coreBoot:report.game.coreBoot}));
  await page.locator('#screen').click();
  report.inputEnvironment = await page.evaluate(() => ({
    gamepadPollingDisabled: new URLSearchParams(location.search).get('nogamepad') === '1',
    detectedGamepads: Array.from(navigator.getGamepads?.() || []).filter(Boolean)
      .map(pad => ({ id: pad.id, mapping: pad.mapping, index: pad.index }))
  }));
  if (loadState) {
    if (!loadState.endsWith('.sav')) throw new Error('--load-state must name a .sav checkpoint');
    const metadata = JSON.parse(await readFile(loadState.slice(0, -4) + '.json', 'utf8'));
    const bytes = await readFile(loadState);
    const compatibility = verifyReferenceCheckpoint(metadata, bytes, report.coreId, disc.sha256,
      Boolean(args['allow-state-migration']));
    report.checkpointCompatibility = compatibility;
    // mountFile accepts the boot while the CPU is still Starting. LoadStateFile
    // rejects that state; wait for original-game video before restoring.
    await page.waitForFunction(() => window.__lastFrameInfo?.frame >= 3, undefined, { timeout: 60000 });
    const generation = await page.evaluate(() => window.__host.adapter.loadedCheckpointGeneration || 0);
    await page.setInputFiles('#ulStateInput', loadState);
    await page.waitForFunction(() => /^Save state (loaded|load failed)|^Upload state failed/.test(
      document.querySelector('#statusPill')?.textContent ?? ''), undefined, { timeout: 30000 });
    const restored = await state();
    if (!restored.status.startsWith('Save state loaded')) throw new Error(restored.status);
    await page.waitForFunction(previous => window.__host.adapter.loadedCheckpointGeneration > previous,
      generation, { timeout: 30000 });
    report.restored = { checkpoint: metadata, response: await state(),
      qualification: 'Core after-load callback observed; compare subsequent screenshots to establish rendering' };
    console.log(`Core restored checkpoint: ${loadState}`);
  }
  if (args['cpu-profile']) cpuProfiles = await startCpuProfiles(browser, output);
  start = Date.now();
  monotonicStart = performance.now();
  let inputSent = false;
  let stopped = false;
  while ((Date.now() - start) / 1000 < seconds) {
    const elapsed = Math.round((Date.now() - start) / 1000);
    // Optional bounded title-screen input. Runs are otherwise passive.
    if (args['press-start'] && !inputSent && elapsed >= 15) {
      await press({ id: 'title-start', keys: ['Enter'], holdMs: 750 });
      await page.waitForTimeout(750);
      await press({ id: 'title-a', keys: ['KeyX'], holdMs: 750 });
      inputSent = true;
    }
    for (const action of await actions()) {
      if (action.kind === 'press') await press(action);
      if (action.kind === 'save') await checkpoint(action.id);
      completed.add(action.id);
      if (action.kind === 'stop') { stopped = true; break; }
      await page.waitForTimeout(250);
    }
    const current = await state();
    const capturedAt = Math.round((Date.now() - start) / 1000);
    const screenshot = `screen-${String(capturedAt).padStart(3,'0')}.png`;
    report.samples.push({ elapsed: capturedAt, elapsedSeconds: (performance.now() - monotonicStart) / 1000,
      screenshot, ...current });
    await page.screenshot({ path: join(output, screenshot + '.tmp'), type: 'png' });
    await rename(join(output, screenshot + '.tmp'), join(output, screenshot));
    await save();
    console.log(JSON.stringify({elapsed, mode:current.mode, frame:current.coreFrame, fps:current.coreFps, status:current.status}));
    if (stopped) break;
    await page.waitForTimeout(5000);
  }
  report.rendererDiagnostics = await page.evaluate(() => window.__host.adapter.request('rendererDiagnostics'));
  if (cpuProfiles) { report.cpuProfiles = await cpuProfiles.stop(); cpuProfiles = null; }
  report.rendererHealth = {
    observedErrorCount: Math.max(0, ...report.samples.map(sample => sample.causalTelemetry?.webgpu?.errorCount || 0)),
    validationMessages: report.rendererMessages.length,
    qualification: 'Observed diagnostics only; zero errors would not establish rendering fidelity'
  };
  report.completedAt = new Date().toISOString();
} catch (error) {
  report.errors.push(String(error));
  console.error(String(error));
  await page?.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  if (cpuProfiles) report.cpuProfiles = await cpuProfiles.stop().catch(error => ({error:String(error)}));
  await save(); await browser?.close();
  console.log(`Evidence saved: ${output}`);
}
