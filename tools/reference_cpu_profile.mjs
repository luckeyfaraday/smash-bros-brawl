import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// This attaches only to targets in the browser launched by the reference probe.
// Nested CDP sessions use the still-supported Target transport because Playwright
// does not expose worker sessions through newCDPSession(page).
export async function startCpuProfiles(browser, output) {
  const cdp = await browser.newBrowserCDPSession();
  let serial = 0;
  const pending = new Map();
  const receive = ({ message }) => {
    const reply = JSON.parse(message), task = pending.get(reply.id);
    if (!task) return;
    pending.delete(reply.id); clearTimeout(task.timer);
    if (reply.error) task.reject(new Error(reply.error.message));
    else task.resolve(reply.result);
  };
  cdp.on('Target.receivedMessageFromTarget', receive);
  const send = (sessionId, method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 30000);
    pending.set(id, { resolve, reject, timer });
    cdp.send('Target.sendMessageToTarget', { sessionId, message:JSON.stringify({id,method,params}) }).catch(error => {
      clearTimeout(timer); pending.delete(id); reject(error);
    });
  });
  const { targetInfos } = await cdp.send('Target.getTargets');
  const targets = await Promise.all(targetInfos.filter(t => ['page','worker'].includes(t.type)).map(async (target,index) => {
    const entry = { type:target.type, url:target.url, targetId:target.targetId, file:`cpu-${index}.cpuprofile` };
    try {
      const { sessionId } = await cdp.send('Target.attachToTarget', {targetId:target.targetId,flatten:false});
      entry.sessionId = sessionId;
      await send(sessionId,'Profiler.enable');
      await send(sessionId,'Profiler.setSamplingInterval',{interval:10000});
      await send(sessionId,'Profiler.start');
      entry.started = true;
    } catch(error) { entry.error = String(error); }
    return entry;
  }));
  console.log(`CPU profiler: ${targets.filter(t=>t.started).length}/${targets.length} targets started`);
  return { targets, async stop() {
    const results = await Promise.all(targets.map(async entry => {
      try {
        if(entry.started) {
          const { profile } = await send(entry.sessionId,'Profiler.stop');
          await writeFile(join(output,entry.file),JSON.stringify(profile));
          entry.summary = summarizeCpuProfile(profile);
        }
      } catch(error) { entry.error = String(error); }
      finally {
        if(entry.sessionId) await cdp.send('Target.detachFromTarget',{sessionId:entry.sessionId}).catch(()=>{});
      }
      delete entry.sessionId;
      return entry;
    }));
    cdp.off('Target.receivedMessageFromTarget',receive);
    await cdp.detach();
    return { samplingIntervalUs:10000, qualification:'Sampled profile; profiling can alter timing, and Wasm symbols may be unavailable', targets:results };
  } };
}

export function summarizeCpuProfile(profile) {
  const nodes = new Map(profile.nodes.map(node=>[node.id,node]));
  const totals = new Map();
  let observedUs=0;
  for(let i=0;i<(profile.samples?.length || 0);i++) {
    const frame = nodes.get(profile.samples[i])?.callFrame;
    if(!frame) continue;
    const duration = profile.timeDeltas?.[i] || 0;
    observedUs += duration;
    const key = JSON.stringify([frame.functionName,frame.url,frame.lineNumber,frame.columnNumber]);
    const item = totals.get(key) || { ...frame, selfUs:0, samples:0 };
    item.selfUs += duration; item.samples++;
    totals.set(key,item);
  }
  return { durationUs:profile.endTime-profile.startTime, observedUs,
    topSelf:[...totals.values()].sort((a,b)=>b.selfUs-a.selfUs).slice(0,25) };
}
