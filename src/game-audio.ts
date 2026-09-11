/** Small synthesized menu and match cues. No external audio service or assets. */
export class GameAudio {
  enabled=true;
  private context:AudioContext|null=null;
  unlock(){
    if(!this.enabled)return;
    try{this.context??=new AudioContext();void this.context.resume().catch(()=>{});}catch{/* Audio is optional. */}
  }
  play(kind:'select'|'start'|'count'|'hit'|'ko'|'win'){
    const ctx=this.context;if(!this.enabled||!ctx||ctx.state!=='running')return;
    const notes=kind==='win'?[440,554,659,880]:kind==='start'?[330,440,660]:kind==='ko'?[220,110]:[kind==='select'?550:kind==='count'?440:125];
    for(const [i,frequency] of notes.entries()){
      const oscillator=ctx.createOscillator(),gain=ctx.createGain(),at=ctx.currentTime+i*.09;
      oscillator.type=kind==='hit'?'triangle':'sine';oscillator.frequency.setValueAtTime(frequency,at);
      if(kind==='hit')oscillator.frequency.exponentialRampToValueAtTime(50,at+.08);
      gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(kind==='hit'?.07:.045,at+.007);gain.gain.exponentialRampToValueAtTime(.001,at+.13);
      oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start(at);oscillator.stop(at+.15);
      oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    }
  }
}
