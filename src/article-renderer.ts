import * as THREE from 'three';
import {ColladaLoader} from 'three/addons/loaders/ColladaLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import type {MotionData} from './types';
import type {Simulation} from './simulation';
import {tetherTip} from './grab';
import {STONE_FORMS,DOWN_RULES} from './down-special';

type Kind='fireball'|'bow'|'arrow'|'copy-bow'|'jolt-air'|'jolt-ground'|'spit-star'|'hat-mario'|'hat-link'|'hat-pikachu'|'clawshot'|'clawshot-head'|'clawshot-hand'|'cape'|'hammer'|'boomerang'|'pump'|'water'|'bomb'|'thunder'|typeof STONE_FORMS[number];
type Instance={root:THREE.Group;model:THREE.Object3D;nodes:Map<string,THREE.Bone>;matrices:THREE.Matrix4[];kind:Kind;wind?:THREE.LineSegments;explosion?:THREE.Mesh<THREE.SphereGeometry,THREE.MeshBasicMaterial>};
/** Original article geometry and CHR0 poses, sharing the fighter's coordinate system. */
export class ArticleRenderer {
  private sources=new Map<Kind,{model:THREE.Object3D;motion:MotionData}>();
  private held:Instance[][]=[];
  private flying=new Map<number,Instance>();
  private pool:Partial<Record<Kind,Instance[]>>={};
  private sideArticles:Instance[][]=[];
  private downArticles:Instance[][]=[];
  private thunderTextures:THREE.Texture[]=[];
  private tethers:Instance[][]=[];
  private hats:Instance[][]=[];
  private star!:Instance;
  private suction:THREE.LineSegments[]=[];
  private temp=new THREE.Matrix4();
  constructor(private scene:THREE.Scene,private camera:THREE.Camera){}
  async load(manager:THREE.LoadingManager){
    const loader=new ColladaLoader(manager);
    const [waterMap,waterMask]=await Promise.all(['waterSpec','waterMask'].map(name=>new THREE.TextureLoader(manager).loadAsync(`/assets/mario/${name}.png`)));
    await Promise.all((['fireball','bow','arrow','copy-bow','jolt-air','jolt-ground','spit-star','hat-mario','hat-link','hat-pikachu','clawshot','clawshot-head','clawshot-hand','cape','hammer','boomerang','pump','water','bomb','thunder',...STONE_FORMS] as Kind[]).map(async kind=>{
      this.pool[kind]=[];
      const base=kind.startsWith('hat-')?`/assets/kirby/copy-${kind.slice(4)}/hat`:kind==='copy-bow'?'/assets/kirby/copy-link/bow':`/assets/${['fireball','cape','pump','water'].includes(kind)?'mario':kind.startsWith('jolt')||kind==='thunder'?'pikachu':kind==='spit-star'||kind==='hammer'||kind.startsWith('stone-')?'kirby':'link'}/${kind}`;
      const [asset,response]=await Promise.all([loader.loadAsync(`${base}.dae`),fetch(`${base}-motion.json`)]);
      if(!asset||!response.ok)throw new Error(`Unable to load ${kind} assets`);
      const model=asset.scene;model.scale.setScalar(1);
      model.traverse(o=>{
        if(!(o instanceof THREE.Mesh))return;o.frustumCulled=false;
        const material=(m:THREE.Material)=>kind.startsWith('jolt')?new THREE.MeshBasicMaterial({map:m instanceof THREE.MeshPhongMaterial?m.map:null,color:0xc2deff,vertexColors:!!o.geometry.getAttribute('color'),opacity:m.name==='glow'?.35:.85,side:THREE.DoubleSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}):kind==='fireball'?new THREE.MeshBasicMaterial({map:m instanceof THREE.MeshPhongMaterial?m.map:null,color:m.name==='G_frea'?0x000000:m.name==='K_fire'?0xffc578:0xff721a,vertexColors:!!o.geometry.getAttribute('color'),opacity:m.name==='K_fire'?.8:.3,side:THREE.DoubleSide,transparent:true,depthWrite:false,blending:m.name==='G_frea'?THREE.NormalBlending:THREE.AdditiveBlending}):m;
        o.material=Array.isArray(o.material)?o.material.map(material):material(o.material);
        if(kind==='bomb'){
          const fuse=(m:THREE.Material)=>m.name==='ItmLinkBomb_mat21'?new THREE.MeshBasicMaterial({map:m instanceof THREE.MeshPhongMaterial?m.map:null,color:0xffdc8e,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}):m;
          o.material=Array.isArray(o.material)?o.material.map(fuse):fuse(o.material);
        }
        if(kind==='water'||kind==='thunder'){
          const shader=(m:THREE.Material)=>new THREE.MeshBasicMaterial({map:kind==='water'?waterMap:m instanceof THREE.MeshPhongMaterial?m.map:null,alphaMap:kind==='water'?waterMask:null,color:kind==='water'?0x82dfff:0xeaf6ff,side:THREE.DoubleSide,transparent:true,opacity:kind==='water'?.7:.95,depthWrite:false,blending:THREE.AdditiveBlending});
          o.material=Array.isArray(o.material)?o.material.map(shader):shader(o.material);
        }
        if(kind==='spit-star'){
          const starMaterial=(m:THREE.Material)=>new THREE.MeshBasicMaterial({map:m instanceof THREE.MeshPhongMaterial?m.map:null,color:0xffdf94,vertexColors:!!o.geometry.getAttribute('color'),transparent:true,opacity:.8,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,depthWrite:false});
          o.material=Array.isArray(o.material)?o.material.map(starMaterial):starMaterial(o.material);
        }
        for(const m of Array.isArray(o.material)?o.material:[o.material])m.side=THREE.DoubleSide;
      });
      this.sources.set(kind,{model,motion:await response.json()});
    }));
    for(let i=0;i<2;i++){
      this.held.push([this.create('bow'),this.create('arrow'),this.create('copy-bow')]);
      this.hats.push(['hat-mario','hat-link','hat-pikachu'].map(kind=>this.create(kind as Kind)));
      this.tethers.push(['clawshot','clawshot-head','clawshot-hand'].map(kind=>this.create(kind as Kind)));
      this.sideArticles.push(['cape','hammer','boomerang'].map(kind=>this.create(kind as Kind)));
      this.downArticles.push(['pump',...STONE_FORMS].map(kind=>this.create(kind as Kind)));
    }
    this.thunderTextures=await Promise.all([1,2,3,4].map(n=>new THREE.TextureLoader(manager).loadAsync(`/assets/pikachu/kaminari.${n}.png`)));
    this.star=this.create('spit-star');
    for(let i=0;i<2;i++){
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(4*6*2*3),3).setUsage(THREE.DynamicDrawUsage));
      const lines=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xffd8ef,transparent:true,opacity:.6,depthWrite:false,blending:THREE.AdditiveBlending}));
      lines.frustumCulled=false;lines.visible=false;this.scene.add(lines);this.suction.push(lines);
    }
  }
  private create(kind:Kind):Instance{
    const source=this.sources.get(kind)!,model=clone(source.model),root=new THREE.Group(),nodes=new Map<string,THREE.Bone>();
    model.traverse(o=>{if(o instanceof THREE.Bone){nodes.set(o.name,o);o.matrixAutoUpdate=false;}});
    if(kind==='thunder')model.traverse(o=>{if(o instanceof THREE.Mesh)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();});
    root.add(model);root.visible=false;this.scene.add(root);
    let wind:THREE.LineSegments|undefined;
    if(kind==='boomerang'){
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(2*32*2*3),3).setUsage(THREE.DynamicDrawUsage));
      wind=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xd9fff2,transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false}));wind.frustumCulled=false;wind.visible=false;root.add(wind);
    }
    let explosion:Instance['explosion'];
    if(kind==='bomb'){
      explosion=new THREE.Mesh(new THREE.SphereGeometry(1,20,12),new THREE.MeshBasicMaterial({color:0xffd47b,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}));explosion.visible=false;root.add(explosion);
    }
    return {root,model,nodes,matrices:source.motion.bones.map(()=>new THREE.Matrix4()),kind,wind,explosion};
  }
  private pose(instance:Instance,clip:string,age:number,loop=false,chainLength?:number){
    const motion=this.sources.get(instance.kind)!.motion,animation=motion.clips[clip],frame=animation.frames[loop?Math.floor(age)%animation.count:Math.min(Math.floor(age),animation.count-1)];
    motion.bones.forEach((_,i)=>instance.matrices[i].fromArray(frame,i*16));
    if(chainLength!==undefined)for(const [i,bone] of motion.bones.entries())if(bone.name.startsWith('HookShot'))instance.matrices[i].elements[14]*=chainLength/30.1074123;
    if(instance.kind==='fireball'||instance.kind==='bomb'||instance.kind.startsWith('jolt'))for(const [i,bone] of motion.bones.entries())if(bone.billboard==='Standard'||bone.billboard==='StandardPerspective'){
      const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();instance.matrices[i].decompose(position,rotation,scale);
      rotation.copy(instance.root.quaternion).invert().multiply(this.camera.quaternion);instance.matrices[i].compose(position,rotation,scale);
    }
    if(['water','thunder'].includes(instance.kind))for(const [i,bone] of motion.bones.entries())if(bone.billboard==='YPerspective'){
      const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();instance.matrices[i].decompose(position,rotation,scale);
      const camera=this.camera.position,origin=instance.root.position,yaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.atan2(camera.x-origin.x,camera.z-origin.z));
      const animated=rotation.clone();rotation.copy(instance.root.quaternion).invert().multiply(yaw).multiply(animated);instance.matrices[i].compose(position,rotation,scale);
    }
    motion.bones.forEach((b,i)=>{
      const node=instance.nodes.get(b.name);if(!node)return;
      const parent=motion.bones.findIndex(p=>p.index===b.parent);
      if(parent>=0)node.matrix.multiplyMatrices(this.temp.copy(instance.matrices[parent]).invert(),instance.matrices[i]);else node.matrix.copy(instance.matrices[i]);
      node.matrixWorldNeedsUpdate=true;
    });
  }
  draw(sim:Simulation){
    const capture=sim.capture;this.star.root.visible=capture?.phase==='star';
    if(capture?.phase==='star'){
      const f=sim.actors[capture.victim].f,root=this.star.root;root.position.set(f.x,f.y,0);
      // The source star's face lies in YZ. Face it toward the camera and
      // spin around its local normal, like the fighter's side-facing model.
      root.rotation.set(0,capture.facing*Math.PI/2,0);root.rotateX(capture.age*.15);this.pose(this.star,'Bind',0);
    }
    for(const [i,controller] of sim.actors.entries()){
      const [standardBow,arrow,copyBow]=this.held[i],f=controller.f,r=controller.ranged,bow=controller.copied==='link'?copyBow:standardBow;
      const [chain,head,hand]=this.tethers[i],tether=controller.script?.tether;
      for(const part of this.tethers[i])part.root.visible=controller.data.id==='link'&&controller.grab?.phase==='reach'&&!!tether?.visible;
      if(chain.root.visible){
        const bones=controller.poses.motion.bones,handBone=bones.find(b=>b.name==='RHaveN')!;
        const from=controller.poses.point(f.clip,f.poseFrame,handBone.index,[0,0,0],f.facing,f.x,f.y),to=tetherTip(controller);
        const direction=new THREE.Vector3(to.x-from.x,to.y-from.y,to.z-from.z),length=direction.length();direction.normalize();
        const x=new THREE.Vector3(0,1,0).cross(direction).normalize(),y=direction.clone().cross(x);
        const rotation=new THREE.Matrix4().makeBasis(x,y,direction);
        for(const part of [chain,head]){part.root.matrixAutoUpdate=true;part.root.position.set(part===head?to.x:from.x,part===head?to.y:from.y,part===head?to.z:from.z);part.root.quaternion.setFromRotationMatrix(rotation);}
        this.pose(chain,'WpnLinkClawshotWait',0,false,length);
        this.pose(head,tether?.returning?'WpnLinkClawshotHeadClose':'WpnLinkClawshotHeadOpen',5);
        this.pose(hand,tether?.hand?'WpnLinkClawshotHandBack':'WpnLinkClawshotHandShoot',Math.max(0,f.age-11));
        const actor=new THREE.Matrix4().makeRotationY(f.facing*Math.PI/2);actor.setPosition(f.x,f.y,0);
        hand.root.matrixAutoUpdate=false;hand.root.matrix.copy(actor).multiply(new THREE.Matrix4().fromArray(controller.poses.frame(f.clip,f.poseFrame),bones.indexOf(handBone)*16));hand.root.matrixWorldNeedsUpdate=true;
      }
      standardBow.root.visible=false;copyBow.root.visible=false;
      for(const instance of this.sideArticles[i]){
        const side=controller.side;instance.root.visible=!!side?.article&&instance.kind===side.kind&&f.state!=='ko';
        if(!instance.root.visible)continue;
        const clip=instance.kind==='cape'?`WpnMarioMantleD01${f.clip}`:instance.kind==='hammer'?`WpnKirbyHammerD01${f.clip}`:'Bind';
        this.pose(instance,clip,f.poseFrame);
        const bones=controller.poses.motion.bones,hand=bones.findIndex(b=>b.name==='RHaveN');
        const actor=new THREE.Matrix4().makeRotationY(f.facing*Math.PI/2);actor.setPosition(f.x,f.y,0);
        const anchor=this.sources.get(instance.kind)!.motion.bones.findIndex(b=>b.name.endsWith('_HaveN'));
        instance.root.matrixAutoUpdate=false;instance.root.matrix.copy(actor).multiply(new THREE.Matrix4().fromArray(controller.poses.frame(f.clip,f.poseFrame),hand*16)).multiply(this.temp.copy(instance.matrices[anchor]).invert());instance.root.matrixWorldNeedsUpdate=true;
      }
      for(const hat of this.hats[i]){
        hat.root.visible=hat.kind===`hat-${controller.copied}`&&!controller.stoneFormed()&&!['ko','spitStar'].includes(f.state)&&sim.capture?.victim!==i;
        if(!hat.root.visible)continue;
        // Copy caps are built around Kirby's body origin; HeadItmN is the
        // higher attachment for ordinary items and makes these caps float.
        const head=controller.poses.motion.bones.findIndex(b=>b.name==='BodyN');
        const headMatrix=new THREE.Matrix4().fromArray(controller.poses.frame(f.clip,f.poseFrame,['Wait1','Run','WalkMiddle','Fall','FallSpecial','FallAerial','CliffWait','FuraFura'].includes(f.clip)),head*16);
        const actor=new THREE.Matrix4().makeRotationY(f.facing*Math.PI/2);actor.setPosition(f.x,f.y,0);
        this.pose(hat,'Bind',0);hat.root.matrixAutoUpdate=false;hat.root.matrix.copy(actor).multiply(headMatrix);hat.root.matrixWorldNeedsUpdate=true;
      }
      for(const instance of this.downArticles[i]){
        const s=controller.downSpecial;
        instance.root.visible=!!s&&(instance.kind==='pump'?s.kind==='flood':controller.stoneFormed()&&instance.kind===STONE_FORMS[s.form])&&f.state!=='ko';
        if(!instance.root.visible)continue;
        if(instance.kind==='pump'){
          const phase=s!.phase==='start'?'Start':s!.phase==='charge'?'Hold':s!.charge>=DOWN_RULES.floodCharge?'Heavy':'Light';
          this.pose(instance,`WpnMarioPumpD03SpecialLw${phase}`,f.poseFrame,phase==='Hold');
          const bones=controller.poses.motion.bones,waist=bones.findIndex(b=>b.name==='WaistNb'),anchor=this.sources.get('pump')!.motion.bones.findIndex(b=>b.name==='HaveN');
          const actor=new THREE.Matrix4().makeRotationY(f.facing*Math.PI/2);actor.setPosition(f.x,f.y,0);
          instance.root.matrixAutoUpdate=false;instance.root.matrix.copy(actor).multiply(new THREE.Matrix4().fromArray(controller.poses.frame(f.clip,f.poseFrame),waist*16)).multiply(this.temp.copy(instance.matrices[anchor]).invert());instance.root.matrixWorldNeedsUpdate=true;
        }else{
          instance.root.matrixAutoUpdate=true;instance.root.position.set(f.x,f.y,0);instance.root.rotation.set(0,f.facing*Math.PI/2,0);this.pose(instance,'Bind',0);
        }
      }
      const inhale=controller.inhale,wind=this.suction[i];wind.visible=!!inhale&&(inhale.phase==='loop'||inhale.phase==='start'&&f.age>=17);
      if(wind.visible){
        const mouth=controller.poses.point(f.clip,f.poseFrame,412,[0,0,0],f.facing,f.x,f.y),positions=wind.geometry.getAttribute('position') as THREE.BufferAttribute;
        let vertex=0;for(let strand=0;strand<4;strand++)for(let segment=0;segment<6;segment++)for(const end of [0,1]){
          const u=(segment+end)/6,flow=(u-f.age*.045+strand*.19+100)%1,angle=strand*Math.PI/2+flow*2;
          positions.setXYZ(vertex++,mouth.x+f.facing*(1+flow*20),mouth.y+Math.sin(angle)*flow*5,Math.cos(angle)*flow*5);
        }positions.needsUpdate=true;
      }
      bow.root.visible=!!r?.bow&&f.state!=='ko';arrow.root.visible=!!r?.arrow&&f.state!=='ko';
      if(!r||r.kind!=='arrow')continue;
      const actor=new THREE.Matrix4().makeRotationY(f.facing*Math.PI/2);actor.setPosition(f.x,f.y,0);
      for(const instance of [bow,arrow]){
        if(!instance.root.visible)continue;
        const bowClip=instance.kind==='copy-bow'?`WpnKirbyLinkBowD00${f.clip.replace('CopyLink','')}`:`WpnLinkBowD00${f.clip}`;
        this.pose(instance,instance.kind==='arrow'?'Bind':bowClip,f.poseFrame,r.phase==='hold');
        const bones=controller.poses.motion.bones,hand=bones.findIndex(b=>b.name===(instance.kind==='arrow'?'LHaveN':'RHaveN'));
        const handMatrix=new THREE.Matrix4().fromArray(controller.poses.frame(f.clip,f.poseFrame),hand*16);
        // The source article's HaveN joint binds to the fighter's hand. Keep
        // its animated deformation while aligning that joint in world space.
        const anchor=this.temp.copy(instance.matrices[1]).invert();
        instance.root.matrixAutoUpdate=false;instance.root.matrix.copy(actor).multiply(handMatrix).multiply(anchor);instance.root.matrixWorldNeedsUpdate=true;
      }
    }
    const active=new Set([...sim.projectiles,...sim.boomerangs,...sim.downProjectiles,...sim.bombs].map(p=>p.id));
    for(const [id,instance] of this.flying)if(!active.has(id)){instance.root.visible=false;this.pool[instance.kind]!.push(instance);this.flying.delete(id);}
    for(const p of [...sim.projectiles,...sim.boomerangs,...sim.downProjectiles,...sim.bombs]){
      const kind:Kind=p.kind==='jolt'?`jolt-${p.phase}`:p.kind;
      let instance=this.flying.get(p.id);
      if(instance&&instance.kind!==kind){instance.root.visible=false;this.pool[instance.kind]!.push(instance);this.flying.delete(p.id);instance=undefined;}
      if(!instance){instance=this.pool[kind]!.pop()??this.create(kind);this.flying.set(p.id,instance);}
      const root=instance.root;root.visible=true;root.matrixAutoUpdate=true;root.position.set(p.x,p.y,0);root.rotation.set(0,p.facing*Math.PI/2,0);
      root.scale.setScalar(1);instance.model.position.set(0,0,0);instance.model.visible=true;
      if(p.kind==='bomb'){
        const exploding=p.phase==='explode';instance.model.visible=!exploding;instance.explosion!.visible=exploding;
        this.pose(instance,'ItmLinkBomb',p.age);
        if(exploding){instance.explosion!.scale.setScalar(8+4*Math.min(1,p.phaseAge/2));instance.explosion!.material.opacity=.8*(1-p.phaseAge/DOWN_RULES.bombLife);}
        else if(p.heldBy!==null){
          const actor=sim.actors[p.heldBy],f=actor.f,bones=actor.poses.motion.bones,hand=bones.findIndex(b=>b.name===(actor.data.id==='pikachu'?'HaveN':'RHaveN'));
          root.visible=actor.script?.itemVisible!==false;
          const matrix=new THREE.Matrix4().makeRotationY(f.facing*Math.PI/2);matrix.setPosition(f.x,f.y,0);
          root.matrixAutoUpdate=false;root.matrix.copy(matrix).multiply(new THREE.Matrix4().fromArray(actor.poses.frame(f.clip,f.poseFrame,['WaitItem','Run','WalkMiddle','Fall'].includes(f.clip)),hand*16)).multiply(this.temp.copy(instance.matrices[1]).invert());root.matrixWorldNeedsUpdate=true;
        }else root.rotateX(p.phaseAge*.12);
        continue;
      }
      if(p.kind==='water'){
        root.rotateX(-Math.atan2(p.vy,Math.abs(p.vx)));this.pose(instance,'WpnMarioPumpWaterRegular',p.age);continue;
      }
      if(p.kind==='thunder'){
        const length=Math.max(8,Math.abs(p.sourceY-p.y));root.scale.y=length/40;root.position.y=Math.min(p.y,p.sourceY);
        this.pose(instance,'Bind',0);
        instance.model.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshBasicMaterial)m.map=this.thunderTextures[Math.floor(p.age/2)%4];});continue;
      }
      if(p.kind==='boomerang'){
        this.pose(instance,'WpnLinkBoomerang',p.age,true);instance.model.position.set(0,0,0);const wind=instance.wind!;wind.visible=p.phase==='turn';
        if(wind.visible){const positions=wind.geometry.getAttribute('position') as THREE.BufferAttribute;let vertex=0;
          for(let strand=0;strand<2;strand++)for(let n=0;n<32;n++)for(const end of [0,1]){
            const u=(n+end)/32,angle=u*Math.PI*5+p.age*.45+strand*Math.PI,radius=1+u*6;
            positions.setXYZ(vertex++,Math.cos(angle)*radius,Math.sin(angle)*radius,-u*15);
          }positions.needsUpdate=true;
        }continue;
      }
      if(p.kind==='jolt'){
        const t=new THREE.Vector3(p.tangent.x,p.tangent.y,0),n=new THREE.Vector3(p.normal.x,p.normal.y,0);
        root.quaternion.setFromRotationMatrix(this.temp.makeBasis(n.clone().cross(t),n,t));
        this.pose(instance,p.phase==='air'?'WpnPikachuDengekidama':'WpnPikachuDengeki',p.poseFrame);
        const [x,y,z]=p.localCenter;instance.model.position.set(-x,-y,-z);continue;
      }
      root.rotateX(-Math.atan2(p.vy,Math.abs(p.vx)));
      this.pose(instance,p.kind==='fireball'?'WpnMarioFireball':'Bind',p.age,p.kind==='fireball');
      // The arrow bind pose is offset along the shaft; center its mesh on the
      // projectile's collision origin. Held arrows keep their original offset.
      instance.model.position.z=p.kind==='arrow'?-12.86:0;
    }
  }
}
