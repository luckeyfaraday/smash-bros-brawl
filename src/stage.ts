import data from './data/final-destination.json' with { type: 'json' };

const floors=data.planes.filter(p=>p.characters && p.type==='Floor');
const sourceFloor=floors[0].left[1];
if(floors.some(p=>p.left[1]!==sourceFloor || p.right[1]!==sourceFloor))
  throw new Error('Final Destination requires a flat floor');

// Normalize the original stage's 0.64 floor to the simulation's y=0. Apply the
// same translation to its model and bounds, preserving the original dimensions.
export const STAGE=Object.freeze({
  id:data.id, name:data.name, sourceFloor,
  left:Math.min(...floors.flatMap(p=>[p.left[0],p.right[0]])),
  right:Math.max(...floors.flatMap(p=>[p.left[0],p.right[0]])),
  floor:0,
  blastX:data.positions.Dead1N[0],
  blastBottom:data.positions.Dead1N[1]-sourceFloor,
  blastTop:data.positions.Dead0N[1]-sourceFloor,
});
export const STAGE_SOURCE=data;
export const LEDGES=floors.flatMap(p=>[
  ...(p.leftLedge?[{side:-1 as const,x:p.left[0],y:p.left[1]-sourceFloor,inward:1}]:[]),
  ...(p.rightLedge?[{side:1 as const,x:p.right[0],y:p.right[1]-sourceFloor,inward:-1}]:[]),
]);
