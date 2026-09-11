"""Regenerate the playable fighters' movesets and browser payloads from local PACs."""
import contextlib
import copy
import argparse
import io
import json
import hashlib
from pathlib import Path
from fitdump import report, ArcPac, SakuraiDat, CommandStream

ROOT = Path(__file__).resolve().parents[1]


def build(fighter):
    out = ROOT / "fitdump"
    with contextlib.redirect_stdout(io.StringIO()):
        report(str(ROOT / f"extract/fighter/{fighter}/Fit{fighter.title()}.pac"), str(out))
    data = json.loads((out / f"Fit{fighter.title()}_data.json").read_text())
    names = ("Attack11", "Attack12", "Attack13", "AttackAirN", "AttackS4S")
    if fighter == "link":
        names += ("AttackS4S2",)
    if fighter in ("mario", "link"):
        names += ("SpecialHi", "SpecialAirHi")
        names += ("SpecialN", "SpecialAirN") if fighter == "mario" else tuple(prefix + phase for prefix in ("SpecialN", "SpecialAirN") for phase in ("Start", "Loop", "End"))
        if fighter == "link":
            names += ("SpecialHiStart",)
    if fighter == "kirby":
        names = ("Attack11", "Attack12", "Attack100Start", "Attack100", "AttackAirN", "AttackS4S",
                 "SpecialHi", "SpecialHi2", "SpecialHi3", "SpecialHi4", "SpecialAirHi", "SpecialAirHi2", "SpecialAirHi3", "SpecialAirHi4")
        names += tuple(prefix + phase for prefix in ('SpecialN', 'SpecialAirN') for phase in ('Start','Loop','End','Swallow','Spit'))
        names += ('EatWait','EatWalkMiddle','EatJump1','EatJump2','EatLanding','EatTurn')
        names += ('SpecialNDrink',)
    if fighter == "pikachu":
        names = ("Attack11", "AttackAirN", "AttackS4Start", "AttackS4S",
                 "SpecialHiStart", "SpecialAirHiStart", "SpecialHiEnd", "SpecialAirHiEnd", "SpecialN", "SpecialAirN")
    names += ("Wait1", "Squat", "SquatWait", "SquatRv", "SquatWaitItem")
    names += ("AttackS3S", "AttackHi3", "AttackLw3", "AttackDash")
    names += tuple(prefix + suffix for prefix in ("AttackAir", "LandingAir") for suffix in ("F", "B", "Hi", "Lw"))
    names += ("AttackS4Start", "AttackS4Hold", "AttackHi4Start", "AttackHi4Hold", "AttackHi4", "AttackLw4Start", "AttackLw4Hold", "AttackLw4")
    if fighter in ("mario", "kirby"):
        names += ("AttackS4Hi", "AttackS4Lw")
    if fighter != "link":
        names += ("AttackS3Hi", "AttackS3Lw")
    grabs = ('Catch','CatchDash','CatchTurn','CatchWait','CatchAttack','CatchCut','ThrowB','ThrowF','ThrowHi','ThrowLw')
    names += grabs
    names += ('SpecialS1','SpecialS2','SpecialAirS1','SpecialAirS2') if fighter=='link' else ('SpecialSStart','SpecialSHold','SpecialSReady','SpecialS','SpecialSEnd','SpecialAirSStart','SpecialAirSHold','SpecialAirSReady','SpecialAirSEnd') if fighter=='pikachu' else ('SpecialS','SpecialAirS')
    names += tuple('Special'+air+'Lw'+phase for air in ('','Air') for phase in ('Start','Hold','Light','Heavy')) if fighter=='mario' else ('SpecialLw1','SpecialLw2','SpecialAirLw1','SpecialAirLw2') if fighter=='kirby' else ('SpecialLw','SpecialLwHit','SpecialAirLw','SpecialAirLwHit') if fighter=='pikachu' else ('SpecialLw','SpecialAirLw')
    names += ('LightGet','LightThrowDrop','LightThrowF','LightThrowB','LightThrowHi','LightThrowLw','LightThrowDash','LightThrowAirF','LightThrowAirB','LightThrowAirHi','LightThrowAirLw')
    names += ('EscapeN','EscapeF','EscapeB','EscapeAir','CliffAttackQuick','CliffAttackSlow','CliffEscapeQuick','CliffEscapeSlow')
    names += ('DamageFall', 'DamageFlyHi', 'DamageFlyN', 'DamageFlyLw', 'DamageFlyTop', 'DamageFlyRoll', 'DownBoundU', 'DownWaitU', 'DownDamageU', 'DownStandU', 'DownAttackU', 'DownForwardU', 'DownBackU', 'DownBoundD', 'DownWaitD', 'DownDamageD', 'DownStandD', 'DownAttackD', 'DownForwardD', 'DownBackD', 'Passive', 'PassiveStandF', 'PassiveStandB')
    moves = {name: next(s for s in data["subactions"] if s["name"] == name) for name in names}
    # Pass raw commands to the VM; the diagnostic frame annotations are not used.
    payload = {
        "schemaVersion": 3, "id": fighter, "source": data["source"],
        "attributes": {a["name"]: a["value"] for a in data["attributes"] if a["table"] == "attributes"},
        "hurtboxes": data["misc"]["hurtboxes"],
        "environment": data["misc"]["environment"],
        "moves": {name: {"commands": move["main"]} for name, move in moves.items()},
        "limitations": ["Common fighter state machine is reimplemented, not decompiled",
                        "Knockback and hitstun are provisional and need Dolphin comparison",
                        "Jab input buffering and held-input transitions need Dolphin comparison",
                        "Aerial landing transitions and animation rates need Dolphin comparison",
                        "Jab, directional tilts, dash attack, all five aerials and three chargeable smashes are enabled; fuller movesets remain",
                        "Smash startup, hold and release use original clips; input transitions and charge scaling are reconstructed",
                        "Tilt selection, dash kinetic movement and common recovery transitions are reconstructed; hitbox trip chance is retained in raw scripts but tripping response is not implemented"]
    }
    payload['side']={'kind':{'mario':'cape','link':'boomerang','kirby':'hammer','pikachu':'skull'}[fighter]}
    payload['downSpecial']={'kind':{'mario':'flood','link':'bomb','kirby':'stone','pikachu':'thunder'}[fighter]}
    payload['limitations'].append('Down-special and light item-throw motion/scripts are original. Charge saving, water movement/push, bomb fuse/throw kinetics and item interactions, Stone common defense/transitions and Thunder travel/self-contact are reconstructed.')
    def down_article(slot, identity, subactions):
        arc=ArcPac((ROOT/f'extract/fighter/{fighter}/Fit{fighter.title()}.pac').read_bytes())
        dat=SakuraiDat(next(arc.resolve(e) for e in arc.entries if e.etype==1 and e.index==0))
        header=dat.section_by_name['data']['data_offset'];offset=dat.read_u32(header+124+slot*4)
        if dat.read_u32(offset)!=identity:raise ValueError('Down-special article identity changed')
        flags,main=dat.read_u32(offset+16),dat.read_u32(offset+24)
        result={}
        for index,title in subactions:
            if dat.read_str(dat.read_u32(flags+index*8+4))!=title:raise ValueError('Down-special article mapping changed')
            result[title]=CommandStream(dat).parse_list(dat.read_u32(main+index*4),set(),dat.external_names)
        extra=dat.read_u32(offset+52)
        return {'articleOffset':offset,'commands':result,'rawParameters':[dat.read_u32(extra+i*4) for i in range(8)]}
    if fighter=='mario':
        payload['downSpecial']['pump']=down_article(7,3,[(2,'Light'),(3,'Heavy')])
        payload['downSpecial']['water']=down_article(8,4,[(0,'Regular')])
        # Express the pump's native mouth joint in its animated attachment frame.
        pump=json.loads((ROOT/'public/assets/mario/pump-motion.json').read_text())
        have=next(i for i,b in enumerate(pump['bones']) if b['name']=='HaveN')
        mouth=next(i for i,b in enumerate(pump['bones']) if b['name']=='PnMouthN')
        def mouth_point(frame):
            a=frame[have*16:have*16+16];p=frame[mouth*16+12:mouth*16+15]
            rows=[[a[c*4+r] for c in range(3)]+[p[r]-a[12+r]] for r in range(3)]
            for col in range(3):
                pivot=max(range(col,3),key=lambda r:abs(rows[r][col]));rows[col],rows[pivot]=rows[pivot],rows[col]
                divisor=rows[col][col]
                if abs(divisor)<1e-10:raise ValueError('Singular pump attachment')
                rows[col]=[v/divisor for v in rows[col]]
                for r in range(3):
                    if r!=col:
                        factor=rows[r][col];rows[r]=[v-factor*w for v,w in zip(rows[r],rows[col])]
            return [row[3] for row in rows]
        payload['downSpecial']['nozzle']={k.removeprefix('WpnMarioPumpD03SpecialLw'):[mouth_point(f) for f in v['frames']] for k,v in pump['clips'].items() if k!='Bind'}
    elif fighter=='kirby':
        payload['downSpecial']['stone']={key:data['subactions'][index]['main'] for key,index in [('ground',504),('air',505)]}
        if [data['subactions'][i]['name'] for i in [504,505]]!=['DummySpecialLwToGround','DummySpecialLwToAir']:raise ValueError('Stone transition scripts changed')
    elif fighter=='pikachu':payload['downSpecial']['thunder']=down_article(7,3,[(0,'Regular')])
    elif fighter=='link':
        path=ROOT/'extract/item/linkbomb/ItmLinkBombParam.pac';arc=ArcPac(path.read_bytes());dat=SakuraiDat(arc.resolve(arc.entries[0]));header=dat.section_by_name['animParam']['data_offset']
        flags,main=dat.read_u32(header),dat.read_u32(header+28)
        if dat.read_u32(header+4)!=7 or dat.read_str(dat.read_u32(flags+4*8+4))!='Born':raise ValueError('Bomb explosion subaction changed')
        commands=CommandStream(dat).parse_list(dat.read_u32(main+4*4),set(),dat.external_names)
        if [c['id'] for c in commands]!=['0615','1A00','1408'] or commands[0]['params'][1]['value']!=5:raise ValueError('Bomb explosion commands changed')
        payload['downSpecial']['bomb']={'source':{'file':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()},'commands':[commands[0]],'originalCommands':commands}
        payload['limitations'].append('Bomb explosion hit data is original. Screenshake and undecoded 1408 effect data are retained in originalCommands; explosion rendering and common item movement are reconstructed.')
    payload['limitations'].append('Side-special animations, attack scripts and article models are original. Cape reflection geometry and scaling, boomerang flight/wind, Skull Bash charge/kinetics and common air/ground transitions are reconstructed.')
    if fighter=='link':
        arc=ArcPac((ROOT/'extract/fighter/link/FitLink.pac').read_bytes())
        dat=SakuraiDat(next(arc.resolve(e) for e in arc.entries if e.etype==1 and e.index==0))
        header=dat.section_by_name['data']['data_offset'];article=dat.read_u32(header+124+11*4)
        flags,main=dat.read_u32(article+16),dat.read_u32(article+24)
        if dat.read_u32(article)!=1:raise ValueError('Boomerang identity changed')
        scripts={}
        for index,expected in [(1,'Fly'),(2,'Turn')]:
            if dat.read_str(dat.read_u32(flags+index*8+4))!=expected:raise ValueError('Boomerang subaction changed')
            scripts[expected]=CommandStream(dat).parse_list(dat.read_u32(main+index*4),set(),dat.external_names)
        extra=dat.read_u32(article+52)
        payload['side']['boomerang']={'fly':scripts['Fly'],'turn':scripts['Turn'],'rawParameters':[dat.read_u32(extra+i*4) for i in range(20)]}
        def side_commands(commands):
            result=[]
            for original in commands:
                c=copy.deepcopy(original)
                if c['id']=='0C20':
                    if [(p['type'],p['value']) for p in c['params']]!=[(0,1),(0,29)]:raise ValueError('Unknown boomerang event changed')
                    continue
                if 'children' in c:c['children']=side_commands(c['children'])
                result.append(c)
            return result
        for name in ('SpecialS1','SpecialAirS1'):
            payload['moves'][name]['originalCommands']=payload['moves'][name]['commands']
            payload['moves'][name]['commands']=side_commands(payload['moves'][name]['commands'])
        payload['limitations'].append('Link side special event 0C20(1,29) is retained in originalCommands but remains undecoded and is omitted from execution.')
    # The shared capture-cut routine is a common-engine callback. Preserve it
    # as source evidence; this browser implements interruption/escape centrally.
    for name in grabs:
        original = payload['moves'][name]['commands']
        payload['moves'][name]['originalCommands'] = original
        payload['moves'][name]['commands'] = [c for c in original if c.get('external') != 'gameAnimCmd_CaptureCutCommon']
    payload['limitations'].append('Grabs and throws use original collision scripts and animations. Capture attachment, escape, tether deployment and common launch response are reconstructed; shared thrown-animation retargeting lacks original per-body correction.')
    if fighter in ("mario", "link"):
        payload["limitations"].append("Up-special steering, kinetic transitions, helpless fall and landing rules are reconstructed; Link's aerial lift is provisional")
        arc = ArcPac((ROOT / f"extract/fighter/{fighter}/Fit{fighter.title()}.pac").read_bytes())
        dat = SakuraiDat(next(arc.resolve(e) for e in arc.entries if e.etype == 1 and e.index == 0))
        header = dat.section_by_name["data"]["data_offset"]
        entry, subaction, expected, words = (6, 0, "Regular", 8) if fighter == "mario" else (15, 1, "Fly", 9)
        article = dat.read_u32(header + 124 + entry * 4)
        flags, main = dat.read_u32(article + 16), dat.read_u32(article + 24)
        name = dat.read_str(dat.read_u32(flags + subaction * 8 + 4))
        if dat.read_u32(article) != (1 if fighter == "mario" else 3) or name != expected:
            raise ValueError(f"{fighter} ranged article identity changed")
        commands = CommandStream(dat).parse_list(dat.read_u32(main + subaction * 4), set(), dat.external_names)
        hits = [c for c in commands if c['id'] == '0615']
        if len(hits) != (3 if fighter == 'mario' else 1) or any(c['params'][1]['value'] != 5 for c in hits):
            raise ValueError(f"{fighter} ranged collision script changed")
        extra = dat.read_u32(article + 52)
        payload['ranged'] = {'kind': 'fireball' if fighter == 'mario' else 'arrow', 'articleOffset': article,
            'name': name, 'commands': commands, 'rawParameters': [dat.read_u32(extra + i * 4) for i in range(words)],
            'action': next(a for a in data['actions'] if a['table'] == 'actions' and a['index'] == 0x112)}
        payload['limitations'].append('Neutral-special animations and projectile hit scripts are original; firing origins, charge scaling, kinetic parameter mapping and common movement/phase transitions are reconstructed. Cape reflection is playable with reconstructed common parameters; absorption remains unfinished.')
    if fighter == "mario":
        # This exact event is still unknown in both BrawlCrate and brawllib_rs.
        # Retain the source; omit only this known operand from the browser copy.
        # The VM still rejects any other unknown gameplay instruction.
        def recovery_commands(commands):
            result = []
            for command in commands:
                c = copy.deepcopy(command)
                if c["id"] == "0900":
                    if [(p["type"], p["value"]) for p in c["params"]] != [(0, 2)]:
                        raise ValueError("Mario recovery's unknown event changed")
                    continue
                if "children" in c:
                    c["children"] = recovery_commands(c["children"])
                result.append(c)
            return result
        for name in ("SpecialHi", "SpecialAirHi"):
            move = payload["moves"][name]
            move["originalCommands"] = move["commands"]
            move["commands"] = recovery_commands(move["commands"])
        payload["limitations"].append("Mario's original recovery root motion is used; undecoded event 0900(2) is preserved in originalCommands and omitted from execution")
    if fighter == "pikachu":
        arc = ArcPac((ROOT / 'extract/fighter/pikachu/FitPikachu.pac').read_bytes())
        dat = SakuraiDat(next(arc.resolve(e) for e in arc.entries if e.etype == 1 and e.index == 0))
        header = dat.section_by_name['data']['data_offset']
        articles = {}
        for entry, phase, identity, damages in ((5, 'air', 1, [9]), (6, 'ground', 2, [6, 5])):
            article = dat.read_u32(header + 124 + entry * 4)
            flags, main = dat.read_u32(article + 16), dat.read_u32(article + 24)
            name = dat.read_str(dat.read_u32(flags + 4))
            commands = CommandStream(dat).parse_list(dat.read_u32(main), set(), dat.external_names)
            if dat.read_u32(article) != identity or name != 'Regular' or [c['params'][1]['value'] for c in commands if c['id'] == '0615'] != damages:
                raise ValueError('Pikachu Thunder Jolt article identity or damage changed')
            extra = dat.read_u32(article + 52)
            articles[phase] = {'articleOffset': article, 'name': name, 'commands': commands, 'rawParameters': [dat.read_u32(extra + i * 4) for i in range(5)]}
        motion = json.loads((ROOT / 'public/assets/pikachu/jolt-ground-motion.json').read_text())
        bone = next(i for i, b in enumerate(motion['bones']) if b['index'] == 3 and b['name'] == 'tama')
        articles['ground']['hitTrack'] = [f[bone*16+12:bone*16+15] for f in motion['clips']['WpnPikachuDengeki']['frames']]
        payload['ranged'] = {'kind': 'jolt', 'commands': articles['air']['commands'], 'rawParameters': articles['air']['rawParameters'], 'jolt': articles}
        payload['limitations'].append('Thunder Jolt uses original ground/air animations, article models and hit scripts. Launch origin, kinetic parameter mapping, surface traversal and phase repetition are reconstructed; layered electricity and material animation are approximated.')
        payload["jabRepeat"] = True
        payload["limitations"].append("Single-jab repetition uses the source auto-jab flag with provisional common-state timing")
        # Quick Attack's two hit scripts are called by action 0x117, rather
        # than a named subaction. Preserve that action for engine comparison.
        action = next(a for a in data["actions"] if a["table"] == "actions" and a["index"] == 0x117)
        def hit_scripts(commands):
            for c in commands:
                if c["id"] == "0600":
                    yield c
                yield from hit_scripts(c.get("children", []))
        unique = {c["offset"]: c for c in hit_scripts(action["events"])}
        hits = sorted(unique.values(), key=lambda c: c["offset"])
        if len(hits) != 2 or [c["params"][1]["value"] for c in hits] != [3, 2]:
            raise ValueError("Pikachu Quick Attack action hit branches changed")
        payload["quickAttack"] = {"action": action, "bursts": [{"commands": [c]} for c in hits]}
        payload["limitations"].append("Quick Attack uses original startup/end clips, counter event and separate action hitboxes; burst speed, duration, direction threshold, landing/cancel rules and collision sweep are reconstructed")
    if fighter == "kirby":
        # Select the first named inhale subactions; later duplicates belong to
        # common held states and copied abilities. Keep every original command.
        def inhale_commands(commands):
            result=[]
            for command in commands:
                c=copy.deepcopy(command)
                if c['id']=='0610':
                    if len(c['params'])!=17 or c['params'][2]['value']!=400:
                        raise ValueError('Kirby inhale uninteractive collision changed')
                    continue  # Item capture is not enabled in the two-fighter room.
                if c['id']=='0615' and c['params'][0]['raw']==26214403:
                    if c['params'][1]['value']!=6 or c['params'][14]['raw']!=0x4f0083:
                        raise ValueError('Kirby secondary inhale collision changed')
                    continue  # Retained secondary entity collision; not reconstructed.
                if 'children' in c: c['children']=inhale_commands(c['children'])
                result.append(c)
            return result
        for name in names:
            if name.startswith(('SpecialN','SpecialAirN','Eat')):
                move=payload['moves'][name];move['originalCommands']=move['commands'];move['commands']=inhale_commands(move['commands'])
        payload['inhale']={'sourceSubactions':[462,463,464,466,471,491], 'spitDamage':10}
        payload['limitations'].append('Inhale uses original capture volumes, pull volume, animation and spit timing/damage. Item capture and the secondary 6% entity collision are retained in originalCommands but not executed. Capture transitions, struggle escape, holding movement and spit-star kinetics are reconstructed.')
        payload['copies'] = {}
        for copied, indices in {'mario':[571,572], 'link':list(range(740,746)), 'pikachu':[522,523]}.items():
            prefix = 'Copy' + copied.title()
            for index in indices:
                sub = data['subactions'][index]
                if sub['name'] not in ('SpecialN','SpecialAirN','SpecialNStart','SpecialNLoop','SpecialNEnd','SpecialAirNStart','SpecialAirNLoop','SpecialAirNEnd'):
                    raise ValueError('Kirby copy subaction mapping changed')
                payload['moves'][prefix+sub['name']] = {'commands':sub['main'],'sourceSubaction':index}
            copy_path = ROOT / f'extract/fighter/kirby/FitKirby{copied.title()}.pac'
            copy_arc = ArcPac(copy_path.read_bytes())
            copy_dat = SakuraiDat(next(copy_arc.resolve(e) for e in copy_arc.entries if e.etype == 1 and e.index == 0))
            copy_header = copy_dat.section_by_name['data']['data_offset']
            def copy_article(slot, subaction, expected, identity, damages, words):
                offset = copy_dat.read_u32(copy_header+(4+slot)*4)
                flags, main = copy_dat.read_u32(offset+16), copy_dat.read_u32(offset+24)
                name = copy_dat.read_str(copy_dat.read_u32(flags+subaction*8+4))
                commands = CommandStream(copy_dat).parse_list(copy_dat.read_u32(main+subaction*4),set(),copy_dat.external_names)
                if copy_dat.read_u32(offset)!=identity or name!=expected or [c['params'][1]['value'] for c in commands if c['id']=='0615']!=damages:
                    raise ValueError(f'Kirby {copied} article mapping changed: {offset}, {identity}, {name}')
                extra = copy_dat.read_u32(offset+52)
                return {'articleOffset':offset,'name':name,'commands':commands,'rawParameters':[copy_dat.read_u32(extra+i*4) for i in range(words)]}
            if copied=='pikachu':
                articles={'air':copy_article(0,0,'Regular',1,[9],5),'ground':copy_article(1,0,'Regular',2,[6,5],5)}
                motion=json.loads((ROOT/'public/assets/kirby/copy-pikachu/jolt-ground-motion.json').read_text())
                bone=next(i for i,b in enumerate(motion['bones']) if b['index']==3 and b['name']=='tama')
                articles['ground']['hitTrack']=[f[bone*16+12:bone*16+15] for f in motion['clips']['WpnPikachuDengeki']['frames']]
                ranged={'kind':'jolt',**articles['air'],'jolt':articles}
            else:
                article=copy_article(0,0,'Regular',1,[5,5,5],8) if copied=='mario' else copy_article(1,1,'Fly',3,[5],9)
                ranged={'kind':'fireball' if copied=='mario' else 'arrow',**article}
            payload['copies'][copied]={'prefix':prefix,'sourceSubactions':indices,'source':{'file':str(copy_path.relative_to(ROOT)),'sha256':hashlib.sha256(copy_path.read_bytes()).hexdigest()},'ranged':ranged}
        payload['limitations'].append('Kirby copies Mario, Link and Pikachu using original copied fighter scripts, animations, article hit data and hat assets. Swallow release, copy selection/discard, copied projectile origins, kinetics and hat attachment are reconstructed; random copy loss on damage and hat secondary animation remain unfinished.')
        # Kirby extra header 43 points to the detached Final Cutter article.
        # Layout: BrawlLib/SSBB/Types/FighterDefinition.cs, Article.
        arc = ArcPac((ROOT / "extract/fighter/kirby/FitKirby.pac").read_bytes())
        dat = SakuraiDat(next(arc.resolve(e) for e in arc.entries if e.etype == 1 and e.index == 0))
        header = dat.section_by_name["data"]["data_offset"]
        article = dat.read_u32(header + 124 + 43 * 4)
        flags, main = dat.read_u32(article + 16), dat.read_u32(article + 24)
        name = dat.read_str(dat.read_u32(flags + 4))
        if dat.read_u32(article) != 2 or name != "FinalCutterRegular":
            raise ValueError("Kirby Final Cutter article layout changed")
        wave = CommandStream(dat).parse_list(dat.read_u32(main), set(), dat.external_names)
        if [c["params"][1]["value"] for c in wave if c["id"] == "0615"] != [5, 6]:
            raise ValueError("Kirby Final Cutter wave hitboxes changed")
        extra = dat.read_u32(article + 52)
        payload["finalCutter"] = {"articleOffset": article, "name": name, "commands": wave,
            "rawParameters": [dat.read_u32(extra + i * 4) for i in range(4)]}
        payload["limitations"].append("Final Cutter uses original root motion, phases and wave scripts/model; phase transitions, steering, sustained descent and projectile kinetics are reconstructed. Its enabled wave profile does not set the reflection flag; absorption is not implemented.")
        payload["airJumps"] = data["misc"]["multijump"]["hop_velocities"]
        # One original rapid-jab cycle. The common controller owns repetition
        # and release; retain the raw loop envelope for later engine comparison.
        rapid = payload["moves"]["Attack100"]
        commands = rapid["commands"]
        if commands[0]["id"] != "0004" or commands[0]["params"][0]["value"] != -1 or [c["id"] for c in commands[-3:]] != ["0100", "0003", "0005"]:
            raise ValueError("Kirby rapid-jab loop envelope changed")
        rapid["originalCommands"] = commands
        rapid["commands"] = commands[1:-3]
        payload["limitations"].append("Rapid jab repeats an original pulse cycle with provisional common-state timing; Flow 03 remains undecoded")
    target = ROOT / f"public/assets/{fighter}/data.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    print(f"Built {fighter}: {len(payload['hurtboxes'])} hurtboxes, {len(payload['moves'])} attack scripts")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--fighter', choices=('mario', 'link', 'kirby', 'pikachu', 'all'), default='all')
    args = ap.parse_args()
    for fighter in ('mario', 'link', 'kirby', 'pikachu') if args.fighter == 'all' else (args.fighter,):
        build(fighter)


if __name__ == "__main__":
    main()
