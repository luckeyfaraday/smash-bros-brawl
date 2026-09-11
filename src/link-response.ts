import type {Point} from './pose';

export const LINK_SHIELD_FLAG=0x12000041;
export const LINK_REBOUND_FLAG=0x12000040;
// Reconstructed common responses. Activation and attack windows are supplied
// by Link's original scripts; these kinetic/contact values are not decoded.
export const LINK_RESPONSE={lift:2.5,rehitDelay:6,followupDamage:8,flashFrames:12};
export type LinkBounce={count:number;cooldown:number};
export type ShieldFlash={ticks:number;point:Point};
// Capsule fitted to polygon26 (TateM) in the original Link model. It follows
// the animated shield, rather than granting protection to the whole fighter.
export const HYLIAN_SHIELD={bone:71,a:[.7015,-1,-.4768],b:[.7015,.5,-.4768],radius:2.35};
