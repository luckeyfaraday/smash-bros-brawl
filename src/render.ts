import * as THREE from 'three';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { Simulation, STAGE, shielding } from './simulation';
import type { FighterController } from './fighter';
import { ROSTER, fighterIds, type FighterId } from './roster';
import {STAGE_PLANES,stageBody} from './stage-contact';
import {CUTTER_RULES} from './final-cutter';
import {SMASH_RULES} from './smash';
import {ArticleRenderer} from './article-renderer';
import {INHALE_RULES,type CaptureState} from './inhale';

export class ArenaRenderer {
  revision=0;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(33, 1, .1, 800);
  readonly overlays = new THREE.Group();
  private stageOutline:THREE.LineSegments;
  private actors: THREE.Group[] = [];
  private bones: Map<string, THREE.Object3D>[] = [];
  private meshes: Map<string, THREE.Object3D>[] = [];
  private templates = new Map<string,THREE.Object3D>();
  private modelCache = [new Map<string,THREE.Object3D>(),new Map<string,THREE.Object3D>()];
  private modelKeys:string[]=[];
  private shadows: THREE.Mesh[] = [];
  private shields: THREE.Mesh[] = [];
  private linkSparks:THREE.Group[]=[];
  private markers: THREE.Sprite[] = [];
  private rebirthPlatforms: THREE.Mesh[] = [];
  private electricBursts: THREE.Group[] = [];
  private recoveryEffects:THREE.Group[]=[];
  private quickTrails:THREE.LineSegments[]=[];
  private quickGlows:THREE.Mesh[]=[];
  private cutterBlades:THREE.Group[]=[];
  private cutterTemplate!:THREE.Object3D;
  private cutterWaves:THREE.Object3D[]=[];
  private spheres: THREE.Mesh[] = [];
  private lines: THREE.Line[] = [];
  private sphereIndex = 0;
  private lineIndex = 0;
  private sphereGeometry = new THREE.SphereGeometry(1, 12, 8);
  private hitMaterial = new THREE.MeshBasicMaterial({color:0xff8568,transparent:true,opacity:.48,depthTest:false});
  private hurtMaterial = new THREE.MeshBasicMaterial({color:0x91e1c2,transparent:true,opacity:.09,wireframe:true,depthTest:false});
  private lineMaterial = new THREE.LineBasicMaterial({color:0xf0e5b3,depthTest:false,transparent:true,opacity:.8});
  private currentMatrices: THREE.Matrix4[][] = [[],[]];
  private temp = new THREE.Matrix4();
  private articles=new ArticleRenderer(this.scene,this.camera);
  constructor(readonly container: HTMLElement) {
    // Paused frame inspection and screenshots must retain the last rendered image.
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x213247);
    this.container.prepend(this.renderer.domElement);
    this.scene.fog=new THREE.Fog(0x213247,180,470);
    this.scene.add(new THREE.HemisphereLight(0xe2eeff,0x46536c,2.3));
    const light=new THREE.DirectionalLight(0xfff1dd,2.7);light.position.set(-40,70,55);this.scene.add(light);
    const rim=new THREE.DirectionalLight(0x99c5ff,2);rim.position.set(25,30,-30);this.scene.add(rim);
    this.scene.add(this.overlays);
    const boundaryPoints:number[]=[],boundaryColors:number[]=[];
    for(const plane of STAGE_PLANES){
      const color=new THREE.Color(plane.type==='Floor'?0xa5efc9:plane.type==='Ceiling'?0xf1a878:0xd9cb88);
      for(const p of [plane.a,plane.b]){boundaryPoints.push(p.x,p.y,0);boundaryColors.push(color.r,color.g,color.b);}
    }
    const boundaryGeometry=new THREE.BufferGeometry();boundaryGeometry.setAttribute('position',new THREE.Float32BufferAttribute(boundaryPoints,3));
    boundaryGeometry.setAttribute('color',new THREE.Float32BufferAttribute(boundaryColors,3));
    this.stageOutline=new THREE.LineSegments(boundaryGeometry,new THREE.LineBasicMaterial({vertexColors:true,depthTest:false,transparent:true,opacity:.9}));
    this.stageOutline.renderOrder=12;this.stageOutline.visible=false;this.scene.add(this.stageOutline);
    this.camera.position.set(0,42,145);this.camera.lookAt(0,12,0);
    new ResizeObserver(()=>this.resize()).observe(container);this.resize();
  }
  resize() {
    const {width,height}=this.container.getBoundingClientRect();
    if(width<=0||height<=0)return;
    this.camera.aspect=width/height;
    // Keep the fighters visible on narrow screens without distorting the scene.
    this.camera.position.z=this.camera.aspect<1.1?175:145;
    this.camera.updateProjectionMatrix();this.renderer.setSize(width,height);this.revision++;
  }
  /** Render the loaded stage for its menu thumbnail using the same materials. */
  stagePreview():string {
    const size=this.renderer.getSize(new THREE.Vector2()),position=this.camera.position.clone(),rotation=this.camera.quaternion.clone(),aspect=this.camera.aspect;
    const visibility=this.scene.children.map(node=>[node,node.visible] as const);
    try{
      for(const node of this.scene.children)node.visible=node instanceof THREE.Light||node.name==='final-destination';
      this.camera.aspect=2;this.camera.position.set(0,42,270);this.camera.lookAt(0,-15,0);this.camera.updateProjectionMatrix();
      this.renderer.setSize(640,320);this.renderer.render(this.scene,this.camera);
      return this.renderer.domElement.toDataURL('image/png');
    }finally{
      for(const [node,visible] of visibility)node.visible=visible;
      this.camera.aspect=aspect;this.camera.position.copy(position);this.camera.quaternion.copy(rotation);this.camera.updateProjectionMatrix();
      this.renderer.setSize(size.x,size.y);this.revision++;
    }
  }
  async load() {
    const manager=new THREE.LoadingManager();
    const texturesReady=new Promise<void>((resolve,reject)=>{
      manager.onLoad=()=>resolve();
      manager.onError=url=>reject(new Error(`Unable to load model asset: ${url}`));
    });
    const loader=new ColladaLoader(manager);
    const modelKeys=fighterIds.flatMap(id=>[id,`${id}-opponent`]);
    const [models,stage,sky,cutter]=await Promise.all([
      Promise.all(modelKeys.map(key=>loader.loadAsync(`/assets/${key}/${key.split('-')[0]}.dae`))),
      loader.loadAsync('/assets/final-destination/final-destination.dae'),
      new THREE.TextureLoader(manager).loadAsync('/assets/final-destination/space01.png'),
      loader.loadAsync('/assets/kirby/final-cutter.dae'),
      this.articles.load(manager),
      texturesReady]);
    if(!cutter)throw new Error('Final Cutter model could not be decoded');
    this.cutterTemplate=cutter.scene;this.cutterTemplate.scale.setScalar(1);
    this.cutterTemplate.traverse(o=>{
      if(!(o instanceof THREE.Mesh))return;
      o.frustumCulled=false;
      const material=(m:THREE.Material)=>new THREE.MeshBasicMaterial({map:m instanceof THREE.MeshPhongMaterial?m.map:null,color:0x9cdcff,side:THREE.DoubleSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
      o.material=Array.isArray(o.material)?o.material.map(material):material(o.material);
    });
    if(!stage)throw new Error('Final Destination model could not be decoded');
    stage.scene.scale.setScalar(1);
    stage.scene.position.y=-STAGE.sourceFloor;
    stage.scene.name='final-destination';
    stage.scene.traverse(o=>{
      if(!(o instanceof THREE.Mesh))return;
      o.frustumCulled=false;
      for(const m of Array.isArray(o.material)?o.material:[o.material]) {
        m.side=THREE.DoubleSide;
        if(!(m instanceof THREE.MeshPhongMaterial))continue;
        const texture=m.map?.image instanceof HTMLImageElement ? m.map.image.src.split('/').pop() : undefined;
        // This is the Wii's projected fighter-shadow receiver. Its exported
        // placeholder texture contains a Mario silhouette, not platform color.
        if(texture==='TShadow1.png')o.visible=false;
        m.shininess=12;m.specular.setHex(0x202b38);
        // COLLADA carries only diffuse color and loses these layered materials.
        // Approximate the original glass and luminous strips in Three.js.
        if(texture==='glass01.png') {m.transparent=true;m.opacity=.22;m.depthWrite=false;}
        if(texture && /^(line|obi)\d+\.png$/.test(texture)) {
          m.transparent=true;m.blending=THREE.AdditiveBlending;m.depthWrite=false;
          m.emissiveMap=m.map;m.emissive.setHex(0xffffff);m.emissiveIntensity=.6;
        }
      }
    });
    this.scene.add(stage.scene);
    sky.colorSpace=THREE.SRGBColorSpace;
    // Static original nebula texture until the animated sky is reconstructed.
    this.scene.background=sky;
    this.scene.fog=null;
    // BrawlLib marks the interchange file as centimeters. Gameplay uses its native units.
    for(const [index,asset] of models.entries()) {
    if(!asset)throw new Error(`Fighter model could not be decoded: ${modelKeys[index]}`);
    this.templates.set(modelKeys[index],asset.scene);
    asset.scene.scale.setScalar(1);
    asset.scene.traverse(o=>{
      if (!(o instanceof THREE.Mesh)) return;
      o.frustumCulled=false;
      const materials=Array.isArray(o.material)?o.material:[o.material];
      for (const m of materials) {
        m.side=THREE.DoubleSide;
        if (m instanceof THREE.MeshPhongMaterial) {
          m.shininess=8; m.specular.setHex(0x151515);
          // ColladaComposer defaults to repeating and ignores sampler2D's
          // CLAMP values. Kirby's face UVs extend beyond the eye/mouth images.
          if(modelKeys[index].startsWith('kirby')&&m.map&&m.map.image instanceof HTMLImageElement&&/PlyKirby5K(Eye|Mouth)/.test(m.map.image.src)){
            m.map.wrapS=THREE.ClampToEdgeWrapping;m.map.wrapT=THREE.ClampToEdgeWrapping;m.map.needsUpdate=true;
          }
        }
      }
    });
    }
    for (let i=0;i<2;i++) {
      const actor=new THREE.Group();
      this.scene.add(actor);this.actors.push(actor);
      const shadow=new THREE.Mesh(new THREE.CircleGeometry(5,32),new THREE.MeshBasicMaterial({color:0x142735,transparent:true,opacity:.38,depthWrite:false}));
      shadow.rotation.x=-Math.PI/2;shadow.position.y=.1;this.scene.add(shadow);this.shadows.push(shadow);
      const shield=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),new THREE.MeshBasicMaterial({color:i===0?0xff6b70:0x79b5ff,transparent:true,opacity:.28,depthWrite:false}));
      this.scene.add(shield);this.shields.push(shield);
      const spark=new THREE.Group(),material=new THREE.MeshBasicMaterial({color:0xffe3a0,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
      spark.add(new THREE.Mesh(new THREE.RingGeometry(1.6,1.9,24),material));
      for(let ray=0;ray<8;ray++){
        const spoke=new THREE.Mesh(new THREE.PlaneGeometry(.18,1.6),material),angle=ray*Math.PI/4;
        spoke.position.set(Math.sin(angle)*3,Math.cos(angle)*3,0);spoke.rotation.z=-angle;spark.add(spoke);
      }
      this.scene.add(spark);this.linkSparks.push(spark);
      const label=document.createElement('canvas');label.width=64;label.height=48;
      const context=label.getContext('2d')!;context.fillStyle=i===0?'#ce5962':'#558ccc';context.beginPath();context.roundRect(2,2,60,40,9);context.fill();
      context.fillStyle='#fff';context.font='bold 25px sans-serif';context.textAlign='center';context.fillText(i===0?'P1':'P2',32,30);
      const marker=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(label),depthTest:false}));marker.scale.set(6,4.5,1);this.scene.add(marker);this.markers.push(marker);
      const rebirth=new THREE.Mesh(new THREE.CylinderGeometry(8,8,1,32),new THREE.MeshBasicMaterial({color:0xa7efcd,transparent:true,opacity:.45}));
      this.scene.add(rebirth);this.rebirthPlatforms.push(rebirth);
      const burst=new THREE.Group();burst.visible=false;
      const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=64;
      const glowContext=glowCanvas.getContext('2d')!,gradient=glowContext.createRadialGradient(32,32,0,32,32,32);
      gradient.addColorStop(0,'rgba(255,255,228,.95)');gradient.addColorStop(.25,'rgba(246,239,136,.65)');
      gradient.addColorStop(.6,'rgba(124,206,255,.2)');gradient.addColorStop(1,'rgba(124,206,255,0)');
      glowContext.fillStyle=gradient;glowContext.fillRect(0,0,64,64);
      const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(glowCanvas),blending:THREE.AdditiveBlending,depthWrite:false}));
      burst.add(glow);
      const bolts=new THREE.BufferGeometry();
      // Three source volumes, eight rays each, three two-point segments per ray.
      bolts.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(3*8*3*2*3),3).setUsage(THREE.DynamicDrawUsage));
      burst.add(new THREE.LineSegments(bolts,new THREE.LineBasicMaterial({color:0xfff9b4,transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false})));
      this.scene.add(burst);this.electricBursts.push(burst);
      const recovery=new THREE.Group();
      const ribbon=new THREE.BufferGeometry();
      ribbon.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(16*6*3),3).setUsage(THREE.DynamicDrawUsage));
      const trailColors=[];
      for(let segment=0;segment<16;segment++)for(const n of [segment,segment,segment+1,segment,segment+1,segment+1]){
        const brightness=(1-n/16)**1.3;trailColors.push(brightness,brightness,brightness);
      }
      ribbon.setAttribute('color',new THREE.Float32BufferAttribute(trailColors,3));
      recovery.add(new THREE.Mesh(ribbon,new THREE.MeshBasicMaterial({color:0xc5eeff,vertexColors:true,transparent:true,opacity:.6,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false})));
      const coinGeometry=new THREE.CylinderGeometry(.65,.65,.18,12);
      const coinMaterial=new THREE.MeshBasicMaterial({color:0xffd46b});
      for(let n=0;n<7;n++)recovery.add(new THREE.Mesh(coinGeometry,coinMaterial));
      this.scene.add(recovery);this.recoveryEffects.push(recovery);
      const trailGeometry=new THREE.BufferGeometry();
      trailGeometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(7*3*2*3),3).setUsage(THREE.DynamicDrawUsage));
      const trail=new THREE.LineSegments(trailGeometry,new THREE.LineBasicMaterial({color:0xfff3ab,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
      trail.visible=false;this.scene.add(trail);this.quickTrails.push(trail);
      const glowGeometry=new THREE.BufferGeometry();glowGeometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(7*6*3),3).setUsage(THREE.DynamicDrawUsage));
      const quickGlow=new THREE.Mesh(glowGeometry,new THREE.MeshBasicMaterial({color:0x8fdcff,transparent:true,opacity:.4,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));
      quickGlow.visible=false;this.scene.add(quickGlow);this.quickGlows.push(quickGlow);
      // The hand-held blade is an effect in the source. Approximate that effect
      // with a curved blade attached to the original RHaveN animation bone.
      const blade=new THREE.Group(),shape=new THREE.Shape();
      shape.moveTo(-.7,0);shape.lineTo(-1.1,8);shape.quadraticCurveTo(-.8,12,2.5,14);
      shape.quadraticCurveTo(1.1,10,1.7,7);shape.lineTo(.7,0);shape.closePath();
      const metal=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.45,bevelEnabled:false}),new THREE.MeshPhongMaterial({color:0xe9f8ff,emissive:0x537a8a,side:THREE.DoubleSide}));
      blade.add(metal);
      const hilt=new THREE.Mesh(new THREE.BoxGeometry(3.4,.65,1),new THREE.MeshPhongMaterial({color:0xe9b95b}));blade.add(hilt);
      blade.matrixAutoUpdate=false;blade.visible=false;this.scene.add(blade);this.cutterBlades.push(blade);
    }
  }
  private selectModel(index:number,id:FighterId,alternate:boolean,controller:FighterController) {
    const key=id+(alternate?'-opponent':'');
    if(this.modelKeys[index]===key)return;
    let model=this.modelCache[index].get(key);
    if(!model){model=clone(this.templates.get(key)!);this.modelCache[index].set(key,model);}
    this.actors[index].clear();this.actors[index].add(model);this.modelKeys[index]=key;
    const bones=new Map<string,THREE.Object3D>(),meshes=new Map<string,THREE.Object3D>();
    model.traverse(o=>{
      if(o instanceof THREE.Bone){bones.set(o.name,o);o.matrixAutoUpdate=false;}
      if(/^polygon\d+$/.test(o.name))meshes.set(o.name,o);
    });
    this.bones[index]=bones;this.meshes[index]=meshes;
    this.currentMatrices[index]=controller.poses.motion.bones.map(()=>new THREE.Matrix4());
  }
  private applyActor(controller:FighterController, index: number, alternate:boolean,capture:CaptureState|null) {
    const f=controller.f,poses=controller.poses,id=controller.data.id??'mario';
    this.selectModel(index,id,alternate,controller);
    const actor=this.actors[index];if(!actor)return;
    actor.position.set(f.x,f.y,0);actor.rotation.y=f.facing*Math.PI/2;
    const captured=capture?.victim===index?capture:null;
    actor.scale.setScalar(captured?.phase==='pull'?Math.max(.12,1-captured.age/INHALE_RULES.pullFrames):1);
    actor.visible=f.state!=='ko'&&!controller.stoneFormed()&&(!captured||captured.phase==='pull')&&(!f.invincible||f.invincible%8>1);
    // Mario's default cap/face visibility groups. The damage face replaces the
    // normal face; yellow eyes and capless hair variants are mutually exclusive.
    if(id==='mario') {
    for(const n of [4,5,11,12,13]) {const o=this.meshes[index].get(`polygon${n}`);if(o)o.visible=false;}
    const hurt=f.state==='hitstun'||['tumble','knockdown','downWait','downDamage'].includes(f.state);
    for(const n of [6,7]) {const o=this.meshes[index].get(`polygon${n}`);if(o)o.visible=hurt;}
    for(const n of [8,9,10]) {const o=this.meshes[index].get(`polygon${n}`);if(o)o.visible=!hurt;}
    } else if(id==='link') {
      // Hand-held sword/shield, normal eyes, and the default equipment bag.
      // Back-mounted duplicates and Final Smash eyes are alternate visibility groups.
      for(const n of [9,10,13,20,30,32,33]){const o=this.meshes[index].get(`polygon${n}`);if(o)o.visible=false;}
      const swordBack=controller.heldBomb()||!!controller.itemThrow||!!controller.side&&!!controller.script?.modelVisibility.get(1)||!!controller.ranged?.swordBack||!!controller.grab&&f.clip!=='ThrowHi',shieldBack=controller.heldBomb()||!!controller.itemThrow||!!controller.downSpecial&&!!controller.script?.modelVisibility.get(2)||!!controller.ranged?.shieldBack;
      for(const n of [21,22,23]){const o=this.meshes[index].get(`polygon${n}`);if(o)o.visible=!swordBack;}
      for(const n of [32,33]){const o=this.meshes[index].get(`polygon${n}`);if(o)o.visible=swordBack;}
      for(const [n,visible] of [[26,!shieldBack],[30,shieldBack]] as const){const o=this.meshes[index].get(`polygon${n}`);if(o)o.visible=visible;}
    } else if(id==='kirby') {
      const inflated=f.clip.startsWith('JumpAerialF')||f.clip==='FallAerial'||!!controller.inhale&&controller.script?.modelVisibility.get(1)===1;
      for(const n of [0,1,2]){const o=this.meshes[index].get(`polygon${n}`);if(o)o.visible=inflated;}
      for(const n of [3,4,5]){const o=this.meshes[index].get(`polygon${n}`);if(o)o.visible=!inflated;}
      for(const n of [6,7,8,9]){const o=this.meshes[index].get(`polygon${n}`);if(o)o.visible=false;}
    } else if(id==='pikachu') {
      // The alternate costume adds a cap before the two Final Smash eye meshes.
      for(const n of alternate?[4,5]:[3,4]){const o=this.meshes[index].get(`polygon${n}`);if(o)o.visible=false;}
    }
    const frame=poses.frame(f.clip,f.poseFrame,['Wait1','WaitItem','SquatWait','SquatWaitItem','Run','WalkMiddle','Fall','FallSpecial','FallAerial','CliffWait','FuraFura'].includes(f.clip));
    const info=poses.motion.bones,matrices=this.currentMatrices[index];
    info.forEach((_,i)=>matrices[i].fromArray(frame,i*16));
    info.forEach((b,i)=>{
      const node=this.bones[index].get(b.name);if(!node)return;
      const parentIndex=info.findIndex(p=>p.index===b.parent);
      if(parentIndex>=0)node.matrix.multiplyMatrices(this.temp.copy(matrices[parentIndex]).invert(),matrices[i]);
      else node.matrix.copy(matrices[i]);
      node.matrixWorldNeedsUpdate=true;
    });
    const shadow=this.shadows[index];shadow.position.x=f.x;shadow.visible=!f.ledgeSide && f.y>=0 && f.x>=STAGE.left && f.x<=STAGE.right;
    shadow.scale.setScalar(Math.max(.35,1-f.y/100));
    if(f.state==='ko'||captured)shadow.visible=false;
    const shield=this.shields[index];shield.visible=shielding(f);shield.position.set(f.x,f.y+7,0);
    shield.scale.setScalar(controller.shieldRadius());
    const spark=this.linkSparks[index],flash=controller.hylianFlash,bounce=controller.linkBounce;
    spark.visible=id==='link'&&f.state!=='ko'&&!!(flash||bounce?.cooldown);
    if(spark.visible){
      const hit=controller.script?.hitboxes.values().next().value;
      const center=flash?.point??(hit?poses.point(f.clip,f.poseFrame,hit.bone,hit.offset,f.facing,f.x,f.y):{x:f.x,y:f.y,z:0});
      const life=flash?flash.ticks/12:(bounce?.cooldown??0)/6;
      spark.position.set(center.x,center.y,center.z+1);spark.quaternion.copy(this.camera.quaternion);spark.scale.setScalar(1.5-life*.5);
      const material=(spark.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
      material.opacity=life;material.color.setHex(flash?0xffe3a0:0xc1efff);
    }
    const head=poses.motion.bones.find(b=>b.name===(id==='kirby'?'BodyN':'HeadN'))??poses.motion.bones.find(b=>b.name==='NeckN');
    const marker=this.markers[index];marker.visible=f.state!=='ko'&&(!captured||captured.phase==='star');
    const headY=head?poses.point(f.clip,f.poseFrame,head.index,[0,4,0],f.facing,f.x,f.y).y:f.y+ROSTER[id].markerHeight;
    marker.position.set(f.x,f.ledgeSide?headY+4:f.y+ROSTER[id].markerHeight,0);
    const rebirth=this.rebirthPlatforms[index];rebirth.visible=f.state==='respawn';rebirth.position.set(f.x,f.y-.5,0);
    this.drawElectricSmash(controller,index);
    this.drawRecovery(controller,index);
    this.drawQuickAttack(controller,index);
    const blade=this.cutterBlades[index];blade.visible=!!controller.cutter&&actor.visible;
    if(blade.visible){actor.updateMatrix();blade.matrix.multiplyMatrices(actor.matrix,matrices[40]);blade.matrixWorldNeedsUpdate=true;}
  }
  private drawCutterWaves(sim:Simulation,collision:boolean) {
    for(const [index,wave] of sim.waves.entries()) {
      let model=this.cutterWaves[index];
      if(!model){
        model=clone(this.cutterTemplate);model.traverse(o=>{if(o instanceof THREE.Mesh)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();});
        this.scene.add(model);this.cutterWaves.push(model);
      }
      model.visible=true;model.position.set(wave.x,wave.y+.1,0);model.rotation.y=wave.facing*Math.PI/2;
      model.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])m.opacity=.65*Math.min(1,(CUTTER_RULES.waveLife-wave.age)/5);});
      if(collision)for(const hit of wave.script.hitboxes.values())this.sphere(wave.point(hit),hit.radius,true);
    }
    for(let i=sim.waves.length;i<this.cutterWaves.length;i++)this.cutterWaves[i].visible=false;
  }
  private drawQuickAttack(controller:FighterController,index:number) {
    const f=controller.f,skull=controller.side?.kind==='skull'&&controller.side.trail?controller.side:null;
    const q=controller.quickAttack??(skull?{phase:skull.phase,trail:skull.trail!}:null),trail=this.quickTrails[index],glow=this.quickGlows[index];
    trail.visible=!!q&&q.trail.length>1&&(q.phase==='burst'||f.age<9);
    glow.visible=trail.visible;
    if(!trail.visible||!q)return;
    const hit=skull?controller.poses.point('SpecialS',f.poseFrame,0,[0,4,3],f.facing,0,0):controller.poses.point('SpecialAirHiStart',14,32,[0,0,0],f.facing,0,0);
    const positions=trail.geometry.getAttribute('position') as THREE.BufferAttribute;let vertex=0;
    const glowPositions=glow.geometry.getAttribute('position') as THREE.BufferAttribute;let glowVertex=0;
    for(let n=1;n<q.trail.length;n++) {
      const a=q.trail[n-1],b=q.trail[n];
      // A deterministic jagged streak records the clipped path and its turn.
      const jitter=((f.age*7+n*3)%5-2)*.35;
      const points=[[a.x,a.y],[a.x+(b.x-a.x)*.33-jitter,a.y+(b.y-a.y)*.33+jitter],
        [a.x+(b.x-a.x)*.66+jitter,a.y+(b.y-a.y)*.66-jitter],[b.x,b.y]];
      for(let k=1;k<4;k++)for(const p of [points[k-1],points[k]])positions.setXYZ(vertex++,p[0]+hit.x,p[1]+hit.y,hit.z+1);
      const dx=b.x-a.x,dy=b.y-a.y,length=Math.sqrt(dx*dx+dy*dy)||1,width=.45;
      const nx=-dy/length*width,ny=dx/length*width;
      for(const p of [[a.x+nx,a.y+ny],[a.x-nx,a.y-ny],[b.x-nx,b.y-ny],[a.x+nx,a.y+ny],[b.x-nx,b.y-ny],[b.x+nx,b.y+ny]])glowPositions.setXYZ(glowVertex++,p[0]+hit.x,p[1]+hit.y,hit.z+.7);
    }
    positions.needsUpdate=true;trail.geometry.setDrawRange(0,vertex);trail.geometry.computeBoundingSphere();
    (trail.material as THREE.LineBasicMaterial).opacity=q.phase==='burst'?.85:Math.max(0,.75-f.age*.08);
    glowPositions.needsUpdate=true;glow.geometry.setDrawRange(0,glowVertex);glow.geometry.computeBoundingSphere();
    (glow.material as THREE.MeshBasicMaterial).opacity=(trail.material as THREE.LineBasicMaterial).opacity*.5;
  }
  private drawRecovery(controller:FighterController,index:number) {
    const f=controller.f,effects=this.recoveryEffects[index],hits=controller.script?.hitboxes.size??0;
    effects.visible=f.state==='special';
    if(!effects.visible)return;
    const sword=effects.children[0] as THREE.Mesh;
    sword.visible=controller.data.id==='link'&&hits>0;
    if(sword.visible) {
      // A short translucent trail follows the original sword poses. This is a
      // browser approximation of the effect, independent of collision geometry.
      const positions=sword.geometry.getAttribute('position') as THREE.BufferAttribute;
      const inner:THREE.Vector3[]=[],outer:THREE.Vector3[]=[];
      for(let n=0;n<=4;n++) {
        const frame=Math.max(0,f.poseFrame-n);
        for(const [out,offset] of [[inner,7],[outer,10.5]] as const){
          const p=controller.poses.point(f.clip,frame,29,[offset,1,-2],f.facing,f.x-f.vx*n,f.y-f.vy*n);
          out.push(new THREE.Vector3(p.x,p.y,p.z));
        }
      }
      const near=new THREE.CatmullRomCurve3(inner).getPoints(16),far=new THREE.CatmullRomCurve3(outer).getPoints(16);
      let vertex=0;
      for(let n=0;n<16;n++)for(const p of [near[n],far[n],far[n+1],near[n],far[n+1],near[n+1]])positions.setXYZ(vertex++,p.x,p.y,p.z);
      positions.needsUpdate=true;sword.geometry.setDrawRange(0,vertex);sword.geometry.computeBoundingSphere();
    }
    for(let n=1;n<effects.children.length;n++) {
      const coin=effects.children[n];
      coin.visible=controller.data.id==='mario'&&controller.hasHit&&hits>0;
      if(!coin.visible)continue;
      const age=(f.age+n*2)%12;
      coin.position.set(f.x+f.facing*(5+(n-4)*1.6),f.y+9+age*.6,2+(n%3));
      coin.rotation.set(Math.PI/2,age*.4,n*.6);
      coin.scale.setScalar(1-age/18);
    }
  }
  private drawElectricSmash(controller:FighterController,index:number) {
    const f=controller.f,burst=this.electricBursts[index],hits=[...controller.script?.hitboxes.values()??[]];
    const skullCharge=controller.side?.kind==='skull'&&controller.side.phase==='hold';
    const charging=controller.smashCharge?.phase==='hold'||skullCharge,glow=burst.children[0] as THREE.Sprite;
    burst.visible=charging||controller.data.id==='pikachu'&&hits.length>0&&((f.state==='smash'&&['AttackS4S','AttackLw4'].includes(f.clip))||['AttackAirF','AttackAirLw','LandingAirLw'].includes(f.clip)||controller.quickAttack?.phase==='burst'||controller.downSpecial?.phase==='hit');
    if(!burst.visible)return;
    burst.children[1].visible=!charging;
    glow.material.color.set(charging?0x9acbff:0xffffff);glow.material.opacity=1;
    if(charging){
      const power=skullCharge?controller.side!.charge/120:controller.smashCharge!.charge/SMASH_RULES.maximum,pulse=(f.age%12)/12;
      glow.position.set(f.x,f.y+ROSTER[controller.data.id??'mario'].markerHeight*.42,3);
      glow.scale.setScalar(12+power*12+pulse*2);glow.material.opacity=.3+power*.3;return;
    }
    // Approximate the electric burst around the original active volumes. Its
    // shape depends on pose time, so pause, hitlag and replay hold the same image.
    const centers=hits.map(h=>controller.poses.point(f.clip,f.poseFrame,h.bone,h.offset,f.facing,f.x,f.y));
    const center=centers[0],quick=controller.quickAttack?.phase==='burst',radius=hits[0].radius*(quick?2.5:1);
    burst.children[0].position.set(center.x,center.y,center.z+(quick?4:0));
    burst.children[0].scale.set(4*radius,4*radius,1);
    const vertices:number[]=[];
    for(const [n,c] of centers.entries())for(let ray=0;ray<8;ray++) {
      const angle=ray*Math.PI/4,dx=Math.cos(angle),dy=Math.sin(angle);
      const wobble=(((f.age*17+ray*13+n*7)%11)-5)*.13;
      const points=[[c.x,c.y,c.z+.5],[c.x+dx*radius*.6-dy*wobble,c.y+dy*radius*.6+dx*wobble,c.z+1],
        [c.x+dx*radius*.9+dy*wobble,c.y+dy*radius*.9-dx*wobble,c.z+.5],[c.x+dx*radius*1.25,c.y+dy*radius*1.25,c.z]];
      for(let j=1;j<points.length;j++)vertices.push(...points[j-1],...points[j]);
    }
    const bolts=burst.children[1] as THREE.LineSegments;
    const positions=bolts.geometry.getAttribute('position') as THREE.BufferAttribute;
    positions.array.set(vertices);positions.needsUpdate=true;
    bolts.geometry.setDrawRange(0,vertices.length/3);bolts.geometry.computeBoundingSphere();
  }
  private sphere(p: {x:number;y:number;z:number}, radius: number, hit: boolean) {
    let mesh=this.spheres[this.sphereIndex++];
    if(!mesh) {mesh=new THREE.Mesh(this.sphereGeometry);mesh.renderOrder=10;this.overlays.add(mesh);this.spheres.push(mesh);}
    mesh.visible=true;mesh.material=hit?this.hitMaterial:this.hurtMaterial;
    mesh.position.set(p.x,p.y,p.z);mesh.scale.setScalar(radius);
  }
  private line(a: {x:number;y:number;z:number},b: {x:number;y:number;z:number}) {
    let line=this.lines[this.lineIndex++];
    if(!line){line=new THREE.Line(new THREE.BufferGeometry(),this.lineMaterial);line.renderOrder=11;this.overlays.add(line);this.lines.push(line);}
    line.visible=true;line.geometry.setFromPoints([new THREE.Vector3(a.x,a.y,a.z),new THREE.Vector3(b.x,b.y,b.z)]);
  }
  draw(sim: Simulation, collision: boolean, skeleton: boolean, stageGeometry=false) {
    this.stageOutline.visible=stageGeometry;
    const first=sim.player.state==='ko'?sim.dummy:sim.player;
    const second=sim.dummy.state==='ko'?first:sim.dummy;
    const bothOut=first.state==='ko'&&second.state==='ko';
    // Ledge actions keep translation in the pose until completion. Track that
    // visible position so the camera does not jump when the root is transferred.
    const visibleX=(f:typeof first)=>f.x+(['ledgeAttack','ledgeRoll'].includes(f.state)?sim.actors.find(c=>c.f===f)!.poses.root(f.clip,f.poseFrame,f.facing).x:0);
    const firstX=visibleX(first),secondX=visibleX(second);
    const middleX=bothOut?0:(firstX+secondX)/2;
    const highest=bothOut?0:Math.max(first.y,second.y,0);
    const lowest=bothOut?0:Math.min(first.y,second.y,0);
    const targetY=(highest+lowest)/2+12;
    const visibleHeight=Math.max(50,highest-lowest+48,(Math.abs(firstX-secondX)+38)/this.camera.aspect);
    const distance=Math.max(185,Math.min(600,visibleHeight/(2*Math.tan(THREE.MathUtils.degToRad(33/2)))));
    // Look toward the occupied edge so the platform's foreground rim does not
    // obscure the hanging fighter. Keep the other fighter within the frame.
    const halfWidth=distance*Math.tan(THREE.MathUtils.degToRad(33/2))*this.camera.aspect-20;
    const f=first.ledgeSide?first:second.ledgeSide?second:first;
    const other=f===first?second:first;
    const focusPoses=sim.actors.find(c=>c.f===f)!.poses;
    const focus=f.ledgeSide?f.state==='ledgeCatch'?Math.min(1,f.age/12):
      ['ledgeClimb','ledgeJump','ledgeAttack','ledgeRoll'].includes(f.state)?Math.min(1,(focusPoses.motion.clips[f.clip].count-f.age)/12):1:0;
    const fX=visibleX(f),otherX=visibleX(other);
    const ledgeX=Math.max(otherX-halfWidth,Math.min(otherX+halfWidth,fX));
    const targetX=middleX+(ledgeX-middleX)*focus;
    const cameraX=middleX+(fX-middleX)*focus;
    this.camera.position.set(cameraX,targetY+distance*.19,distance);
    this.camera.lookAt(targetX,targetY,0);
    this.sphereIndex=0;this.lineIndex=0;
    [sim.player,sim.dummy].forEach((f,index)=>{
      const controller=sim.actors[index],poses=controller.poses;
      this.applyActor(controller,index,index===1&&sim.actors[0].data.id===controller.data.id,sim.capture);
      if(sim.capture?.victim===index&&sim.capture.phase!=='pull')return;
      if(f.state==='ko')return;
      if(stageGeometry&&!f.ledgeSide){
        const body=stageBody(controller.data,poses,f.clip,f.poseFrame,f.facing);
        for(let i=0;i<body.length;i++){
          const a=body[i],b=body[(i+1)%body.length];
          this.line({x:f.x+a.x,y:f.y+a.y,z:0},{x:f.x+b.x,y:f.y+b.y,z:0});
        }
      }
      if(collision)for(const h of controller.data.hurtboxes) {
        if(!h.enabled||!controller.hurtboxEnabled(h.bone))continue;
        const a=poses.point(f.clip,f.poseFrame,h.bone,h.offset,f.facing,f.x,f.y);
        const b=poses.point(f.clip,f.poseFrame,h.bone,h.stretch,f.facing,f.x,f.y);
        // Sample along the capsule to display its full extent, including its end caps.
        for(let t=0;t<=1;t+=.5)this.sphere({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t},h.radius,false);
      }
      if(skeleton)for(const bone of poses.motion.bones) {
        if(bone.parent<0)continue;
        this.line(poses.point(f.clip,f.poseFrame,bone.index,[0,0,0],f.facing,f.x,f.y),
          poses.point(f.clip,f.poseFrame,bone.parent,[0,0,0],f.facing,f.x,f.y));
      }
    });
    if(collision)for(const actor of sim.actors)for(const h of actor.script?.hitboxes.values()??[]) {
      const f=actor.f;this.sphere(actor.poses.point(f.clip,f.poseFrame,h.bone,h.offset,f.facing,f.x,f.y),h.radius,true);
    }
    this.drawCutterWaves(sim,collision);
    this.articles.draw(sim);
    if(collision)for(const p of sim.projectiles)for(const hit of p.script.hitboxes.values())this.sphere(p.point(hit),hit.radius,true);
    for(let i=this.sphereIndex;i<this.spheres.length;i++)this.spheres[i].visible=false;
    for(let i=this.lineIndex;i<this.lines.length;i++)this.lines[i].visible=false;
    this.renderer.render(this.scene,this.camera);
  }
}
