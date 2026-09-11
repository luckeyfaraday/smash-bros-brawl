import type {MotionData} from './types';

export interface MotionManifest extends Omit<MotionData,'clips'> {
  clipFiles:string[];
}

export async function fetchJSON<T>(path:string):Promise<T>{
  const response=await fetch(path);
  if(!response.ok)throw new Error(`Asset load failed: ${path} (${response.status})`);
  return response.json();
}

/** Development exports contain clips directly; production builds use a manifest. */
export async function fetchMotion(path:string):Promise<MotionData>{
  const motion=await fetchJSON<MotionData|MotionManifest>(path);
  if(!('clipFiles' in motion))return motion;
  const {clipFiles,...metadata}=motion;
  const base=path.slice(0,path.lastIndexOf('/')+1);
  const chunks=await Promise.all(clipFiles.map(file=>fetchJSON<MotionData['clips']>(base+file)));
  return {...metadata,clips:Object.assign({},...chunks)};
}
