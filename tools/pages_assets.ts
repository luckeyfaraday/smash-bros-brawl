import {createHash} from 'node:crypto';
import {existsSync,readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {MotionData} from '../src/types';
import type {MotionManifest} from '../src/assets';
import {fighterIds} from '../src/roster';

const CHUNK_BYTES=20*1024*1024;
const PAGES_FILE_BYTES=25*1024*1024;

/** Keep whole clips and every numeric sample; bound serialized UTF-8 bytes. */
export function splitMotion(motion:MotionData,maxBytes=CHUNK_BYTES){
  const {clips,...metadata}=motion;
  const chunks:{name:string;json:string}[]=[];
  let entries:string[]=[],bytes=2;
  const flush=()=>{
    if(!entries.length)return;
    const json=`{${entries.join(',')}}`;
    const hash=createHash('sha256').update(json).digest('hex').slice(0,16);
    chunks.push({name:`motion-clips-${hash}.json`,json});
    entries=[];bytes=2;
  };
  for(const [name,clip] of Object.entries(clips)){
    const entry=`${JSON.stringify(name)}:${JSON.stringify(clip)}`;
    const size=Buffer.byteLength(entry);
    if(size+2>maxBytes)throw new Error(`Animation clip ${name} exceeds the ${maxBytes}-byte chunk limit`);
    if(bytes+size+(entries.length?1:0)>maxBytes)flush();
    bytes+=size+(entries.length?1:0);entries.push(entry);
  }
  flush();
  const manifest:MotionManifest={...metadata,clipFiles:chunks.map(chunk=>chunk.name)};
  return {manifest,chunks};
}

function buildFiles(folder:string):string[]{
  return readdirSync(folder,{withFileTypes:true}).flatMap(entry=>{
    const path=join(folder,entry.name);
    return entry.isDirectory()?buildFiles(path):[path];
  });
}

export function preparePagesAssets(){
  // Only the disposable Vite output is rewritten. Offline tools retain the exports.
  const output=resolve('dist');
  const missing=fighterIds.filter(id=>!existsSync(join(output,'assets',id,'motion.json')));
  if(missing.length)throw new Error(`Missing fighter assets: ${missing.join(', ')}. Follow docs/getting-started.md to prepare local game assets, then run npm run build again. For source-only checks, use npm run check.`);
  for(const id of fighterIds){
    const path=join(output,'assets',id,'motion.json');
    if(statSync(path).size<=CHUNK_BYTES)continue;
    const motion:MotionData=JSON.parse(readFileSync(path,'utf8'));
    const {manifest,chunks}=splitMotion(motion);
    for(const chunk of chunks)writeFileSync(join(dirname(path),chunk.name),chunk.json);
    // Publish the manifest only after all its chunks have been written.
    writeFileSync(path,JSON.stringify(manifest));
    console.log(`${id}: ${Object.keys(motion.clips).length} clips in ${chunks.length} files`);
  }
  const files=buildFiles(output);
  if(files.length>20000)throw new Error(`Pages supports 20,000 files; this build contains ${files.length}`);
  const oversized=files.filter(path=>statSync(path).size>PAGES_FILE_BYTES);
  if(oversized.length)throw new Error(`Files exceed the Pages 25 MiB limit:\n${oversized.join('\n')}`);
  const largest=Math.max(...files.map(path=>statSync(path).size));
  console.log(`Pages assets ready: ${files.length} files; largest ${(largest/1024/1024).toFixed(2)} MiB`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)preparePagesAssets();
