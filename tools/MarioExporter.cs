using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Xml;
using BrawlLib.SSBB.ResourceNodes;
using BrawlLib.Modeling.Collada;

// Uses the unmodified BrawlCrate release to decode MDL0/TEX0/CHR0.
// World matrices are sampled at integer animation frames using BrawlLib's
// skeletal evaluator, preserving its scaling rules for both rendering/collision.
public static class MarioExporter
{
    static void NormalizeCollada(string path) {
        var xml = new XmlDocument(); xml.Load(path);
        foreach (XmlNode node in xml.SelectNodes("//*[local-name()='init_from']")) node.InnerText = node.InnerText.Trim();
        foreach (XmlNode node in xml.SelectNodes("//*[not(*)]")) if (node.InnerText.Length > 0) node.InnerText = node.InnerText.Trim();
        xml.Save(path);
    }
    static void ExportArticle(ResourceNode archive, string name, string file, string output, string[] textures, string[] animationNames) {
        var model = Descendants(archive).OfType<MDL0Node>().Single(n => n.Name == name);
        var path = Path.Combine(output, file + ".dae"); Collada.Serialize(model, path); NormalizeCollada(path);
        foreach (var textureName in textures) {
            var tex = Descendants(archive).OfType<TEX0Node>().First(n => n.Name == textureName);
            using (var bmp = tex.GetImage(0)) bmp.Save(Path.Combine(output, textureName + ".png"), System.Drawing.Imaging.ImageFormat.Png);
        }
        var bones = model.AllBones.ToArray();
        var info = bones.Select(b => new { name = b.Name, index = b.BoneIndex, parent = b.Parent is MDL0BoneNode ? ((MDL0BoneNode)b.Parent).BoneIndex : -1, billboard = b.BillboardSetting.ToString() }).ToArray();
        var clips = new Dictionary<string, object>();
        foreach (var clip in new[] { "Bind" }.Concat(animationNames)) {
            var anim = clip == "Bind" ? null : Descendants(archive).OfType<CHR0Node>().Single(n => n.Name == clip);
            int count = anim == null ? 1 : anim.FrameCount;
            var frames = new List<float[]>();
            for (int f = 0; f < count; f++) {
                model.ApplyCHR(anim, anim == null ? 0 : f + 1);
                var values = new float[bones.Length * 16];
                for (int b = 0; b < bones.Length; b++) for (int j = 0; j < 16; j++) values[b * 16 + j] = bones[b].Matrix[j];
                frames.Add(values);
            }
            clips[clip] = new { count = count, loop = anim != null && anim.Loop, frames = frames };
        }
        var serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        File.WriteAllText(Path.Combine(output, file + "-motion.json"), serializer.Serialize(new { bones = info, clips = clips }));
    }
    static IEnumerable<ResourceNode> Descendants(ResourceNode n)
    {
        yield return n;
        foreach (ResourceNode child in n.Children)
            foreach (ResourceNode item in Descendants(child)) yield return item;
    }

    public static void Export(string modelPath, string motionPath, string output, bool modelOnly)
    {
        Directory.CreateDirectory(output);
        using (ResourceNode archive = NodeFactory.FromFile(null, modelPath))
        using (ResourceNode motion = NodeFactory.FromFile(null, motionPath))
        {
            var modelName = Path.GetFileNameWithoutExtension(modelPath);
            var model = Descendants(archive).OfType<MDL0Node>().Single(n => n.Name == modelName);
            var fighterName = new string(modelName.Substring(3).TakeWhile(char.IsLetter).ToArray()).ToLowerInvariant();
            Collada.Serialize(model, Path.Combine(output, fighterName + ".dae"));
            // BrawlLib writes COLLADA 1.5 nested <init_from><ref> values.
            // Normalize these for Three's COLLADA 1.4 loader, including leaf whitespace.
            var xml = new XmlDocument();
            var daePath = Path.Combine(output, fighterName + ".dae");
            xml.Load(daePath);
            foreach (XmlNode node in xml.SelectNodes("//*[local-name()='init_from']"))
                node.InnerText = node.InnerText.Trim();
            foreach (XmlNode node in xml.SelectNodes("//*[not(*)]"))
                if (node.InnerText.Length > 0) node.InnerText = node.InnerText.Trim();
            xml.Save(daePath);
            foreach (var tex in Descendants(archive).OfType<TEX0Node>())
                using (var bmp = tex.GetImage(0))
                    bmp.Save(Path.Combine(output, tex.Name + ".png"), System.Drawing.Imaging.ImageFormat.Png);
            if (modelOnly) return;
            var bones = model.AllBones.ToArray();
            var translation = bones.First(b => b.Name == "TransN");
            var locomotion = new HashSet<string>(new[] { "Run", "Dash", "WalkSlow", "WalkMiddle", "WalkFast", "EatWalkSlow", "EatWalkMiddle", "EatWalkFast" });
            var followsTranslation = bones.Select(b => {
                ResourceNode node = b;
                while (node is MDL0BoneNode) {
                    if (node == translation) return true;
                    node = node.Parent;
                }
                return false;
            }).ToArray();
            var boneInfo = bones.Select(b => new {
                name = b.Name, index = b.BoneIndex,
                parent = b.Parent is MDL0BoneNode ? ((MDL0BoneNode)b.Parent).BoneIndex : -1
            }).ToArray();
            var wanted = new HashSet<string>(new[] {
                "Wait1", "Squat", "SquatWait", "SquatRv", "SquatWaitItem", "WalkSlow", "WalkMiddle", "WalkFast", "Run", "Dash", "JumpSquat",
                "JumpF", "JumpB", "JumpAerialF", "Fall", "Landing", "Attack11", "Attack12", "Attack13", "DamageN1",
                "AttackAirN", "LandingAirN", "AttackAirF", "AttackAirB", "AttackAirHi", "AttackAirLw",
                "LandingAirF", "LandingAirB", "LandingAirHi", "LandingAirLw", "CliffCatch", "CliffWait",
                "CliffClimbQuick", "CliffClimbSlow", "CliffJumpQuick1", "CliffJumpQuick2",
                "CliffJumpSlow1", "CliffJumpSlow2", "AttackS4S", "GuardOn", "GuardOff", "GuardDamage", "FuraFura",
                "AttackS3S", "AttackHi3", "AttackLw3", "AttackDash",
                "AttackS4Start", "AttackS4Hold", "AttackHi4Start", "AttackHi4Hold", "AttackHi4", "AttackLw4Start", "AttackLw4Hold", "AttackLw4", "CapturePulledHi", "CaptureCut"
            });
            wanted.UnionWith(fighterName == "link" ? new[] {"SpecialS1", "SpecialS2", "SpecialAirS1", "SpecialAirS2"} : fighterName == "pikachu" ? new[] {"SpecialSStart", "SpecialSHold", "SpecialSReady", "SpecialS", "SpecialSEnd", "SpecialAirSStart", "SpecialAirSHold", "SpecialAirSReady", "SpecialAirSEnd"} : new[] {"SpecialS", "SpecialAirS"});
            wanted.UnionWith(fighterName == "mario" ? new[] {"SpecialLwStart", "SpecialLwHold", "SpecialLwLight", "SpecialLwHeavy", "SpecialAirLwStart", "SpecialAirLwHold", "SpecialAirLwLight", "SpecialAirLwHeavy"} : fighterName == "kirby" ? new[] {"SpecialLw1", "SpecialLw2", "SpecialAirLw1", "SpecialAirLw2"} : fighterName == "pikachu" ? new[] {"SpecialLw", "SpecialLwHit", "SpecialAirLw", "SpecialAirLwHit"} : new[] {"SpecialLw", "SpecialAirLw"});
            wanted.UnionWith(new[] {"LightGet", "WaitItem", "ItemHandHave", "LightThrowDrop", "LightThrowF", "LightThrowB", "LightThrowHi", "LightThrowLw", "LightThrowDash", "LightThrowAirF", "LightThrowAirB", "LightThrowAirHi", "LightThrowAirLw"});
            wanted.UnionWith(new[] {"DamageFall", "DamageFlyHi", "DamageFlyN", "DamageFlyLw", "DamageFlyTop", "DamageFlyRoll", "DownBoundU", "DownWaitU", "DownDamageU", "DownStandU", "DownAttackU", "DownForwardU", "DownBackU", "DownBoundD", "DownWaitD", "DownDamageD", "DownStandD", "DownAttackD", "DownForwardD", "DownBackD", "Passive", "PassiveStandF", "PassiveStandB"});
            wanted.UnionWith(new[] {"EscapeN", "EscapeF", "EscapeB", "EscapeAir", "CliffAttackQuick", "CliffAttackSlow", "CliffEscapeQuick", "CliffEscapeSlow"});
            wanted.UnionWith(new[] {"Catch", "CatchDash", "CatchTurn", "CatchWait", "CatchAttack", "CatchCut", "ThrowF", "ThrowB", "ThrowHi", "ThrowLw", "CaptureWaitHi", "CaptureDamageHi", "ThrownF", "ThrownB", "ThrownHi", "ThrownLw"});
            if (fighterName != "link") wanted.UnionWith(new[] {"AttackS3Hi", "AttackS3Lw"});
            if (fighterName == "mario" || fighterName == "kirby") wanted.UnionWith(new[] {"AttackS4Hi", "AttackS4Lw"});
            if (fighterName == "link") wanted.Add("AttackS4S2");
            if (fighterName == "mario" || fighterName == "pikachu") wanted.UnionWith(new[] {"SpecialN", "SpecialAirN"});
            if (fighterName == "link") wanted.UnionWith(new[] {"SpecialNStart", "SpecialNLoop", "SpecialNEnd", "SpecialAirNStart", "SpecialAirNLoop", "SpecialAirNEnd"});
            if (fighterName == "mario" || fighterName == "link") {
                wanted.UnionWith(new[] { "SpecialHi", "SpecialAirHi", "FallSpecial", "LandingFallSpecial" });
                if (fighterName == "link") wanted.Add("SpecialHiStart");
            }
            if (fighterName == "pikachu") {
                wanted.Remove("Attack12"); wanted.Remove("Attack13");
                wanted.Add("AttackS4Start");
                wanted.UnionWith(new[] { "SpecialHiStart", "SpecialAirHiStart", "SpecialHiEnd", "SpecialAirHiEnd", "FallSpecial", "LandingFallSpecial" });
            }
            if (fighterName == "kirby") {
                wanted.Remove("Attack13");
                wanted.UnionWith(new[] {"SpecialNStart", "SpecialNLoop", "SpecialNEnd", "SpecialNSwallow", "SpecialNSpit", "SpecialNDrink", "SpecialAirNStart", "SpecialAirNLoop", "SpecialAirNEnd", "SpecialAirNSwallow", "SpecialAirNSpit", "EatWait", "EatWalkMiddle", "EatJump1", "EatJump2", "EatLanding", "EatTurn"});
                wanted.UnionWith(new[] {"Attack100Start", "Attack100", "JumpAerialF2", "JumpAerialF3", "JumpAerialF4", "JumpAerialF5", "FallAerial"});
                wanted.UnionWith(new[] {"SpecialHi", "SpecialHi2", "SpecialHi3", "SpecialHi4", "SpecialAirHi", "SpecialAirHi2", "SpecialAirHi3", "SpecialAirHi4", "FallSpecial", "LandingFallSpecial"});
            }
            var clips = new Dictionary<string, object>();
            foreach (var anim in Descendants(motion).OfType<CHR0Node>().Where(a => wanted.Contains(a.Name)))
            {
                var frames = new List<float[]>();
                var rootMotion = new List<float[]>();
                bool transfersRoot = anim.Name.StartsWith("Down") || anim.Name.StartsWith("Passive") || anim.Name.StartsWith("Escape") || anim.Name.StartsWith("SpecialLw") || anim.Name.StartsWith("SpecialAirLw") || anim.Name.StartsWith("LightThrow") || anim.Name.StartsWith("SmashThrow") || anim.Name.StartsWith("Catch") || (anim.Name.StartsWith("Throw") && !anim.Name.StartsWith("Thrown")) || anim.Name.StartsWith("AttackS4") || anim.Name.StartsWith("AttackHi4") || anim.Name.StartsWith("AttackLw4") || anim.Name.StartsWith("AttackS3") || anim.Name == "AttackHi3" || anim.Name == "AttackLw3" || anim.Name == "AttackDash" || anim.Name.StartsWith("SpecialHi") || anim.Name == "SpecialAirHi" || (fighterName == "kirby" && anim.Name.StartsWith("SpecialAirHi"));
                for (int f = 0; f < anim.FrameCount; f++)
                {
                    // BrawlLib takes one-based frames; zero is the bind pose.
                    model.ApplyCHR(anim, f + 1);
                    if (transfersRoot) rootMotion.Add(new[] { translation.Matrix[12], translation.Matrix[13], translation.Matrix[14] });
                    var values = new float[bones.Length * 16];
                    for (int b = 0; b < bones.Length; b++)
                        for (int j = 0; j < 16; j++)
                        {
                            float value = bones[b].Matrix[j];
                            // The simulation supplies locomotion. Keep the walk/run
                            // skeleton in place so its root track cannot double movement.
                            if ((locomotion.Contains(anim.Name) || transfersRoot) && followsTranslation[b] && j >= 12 && j <= 14)
                                value -= translation.Matrix[j];
                            values[b * 16 + j] = value;
                        }
                    frames.Add(values);
                }
                clips[anim.Name] = new { count = anim.FrameCount, loop = anim.Loop, frames = frames, rootMotion = transfersRoot ? rootMotion : null };
                Console.WriteLine(anim.Name + ": " + anim.FrameCount + " frames");
            }
            if (wanted.Where(name => name.StartsWith("SpecialN") || name.StartsWith("SpecialAirN")).Any(name => !clips.ContainsKey(name)))
                throw new Exception("Required neutral special animations were not found");
            if (new[] { "Wait1", "Attack11", "Attack12", "Attack13", "AttackAirN", "LandingAirN",
                "AttackS4Start", "AttackS4Hold", "AttackHi4Start", "AttackHi4Hold", "AttackHi4", "AttackLw4Start", "AttackLw4Hold", "AttackLw4",
                "AttackAirF", "AttackAirB", "AttackAirHi", "AttackAirLw", "LandingAirF", "LandingAirB", "LandingAirHi", "LandingAirLw",
                "EscapeN", "EscapeF", "EscapeB", "EscapeAir", "CliffAttackQuick", "CliffAttackSlow", "CliffEscapeQuick", "CliffEscapeSlow",
                "CliffCatch", "CliffWait", "CliffClimbQuick", "CliffClimbSlow", "CliffJumpQuick1",
                "CliffJumpQuick2", "CliffJumpSlow1", "CliffJumpSlow2", "AttackS4S", "GuardOn", "GuardOff", "GuardDamage", "FuraFura", "AttackS3S", "AttackHi3", "AttackLw3", "AttackDash" }.Where(name =>
                    (fighterName != "kirby" || name != "Attack13") &&
                    (fighterName != "pikachu" || (name != "Attack12" && name != "Attack13"))).Any(name => !clips.ContainsKey(name)) ||
                    (fighterName == "pikachu" && new[] { "AttackS4Start", "SpecialHiStart", "SpecialAirHiStart", "SpecialHiEnd", "SpecialAirHiEnd", "FallSpecial", "LandingFallSpecial" }.Any(name => !clips.ContainsKey(name))) ||
                    ((fighterName == "mario" || fighterName == "link") &&
                        new[] { "SpecialHi", "SpecialAirHi", "FallSpecial", "LandingFallSpecial" }.Any(name => !clips.ContainsKey(name))) ||
                    (fighterName == "link" && !clips.ContainsKey("SpecialHiStart")) ||
                    (fighterName == "kirby" && new[] {"SpecialHi", "SpecialHi2", "SpecialHi3", "SpecialHi4", "SpecialAirHi", "SpecialAirHi2", "SpecialAirHi3", "SpecialAirHi4", "FallSpecial", "LandingFallSpecial"}.Any(name => !clips.ContainsKey(name))) ||
                    (fighterName != "link" && new[] {"AttackS3Hi", "AttackS3Lw"}.Any(name => !clips.ContainsKey(name))) ||
                    ((fighterName == "mario" || fighterName == "kirby") && new[] {"AttackS4Hi", "AttackS4Lw"}.Any(name=>!clips.ContainsKey(name))))
                throw new Exception("Required " + fighterName + " animations were not found");
            if (new[] {"DamageFall", "DamageFlyHi", "DamageFlyN", "DamageFlyLw", "DamageFlyTop", "DamageFlyRoll", "DownBoundU", "DownWaitU", "DownDamageU", "DownStandU", "DownAttackU", "DownForwardU", "DownBackU", "DownBoundD", "DownWaitD", "DownDamageD", "DownStandD", "DownAttackD", "DownForwardD", "DownBackD", "Passive", "PassiveStandF", "PassiveStandB"}.Any(name => !clips.ContainsKey(name))) throw new Exception("Required knockdown motions were not found");
            // Thrown animations belong to the thrower and use a shared skeleton.
            // Sample each one on this victim model so mixed matchups use the
            // thrower's sequence, rather than the victim's unrelated throw.
            foreach (var thrower in new[] { "Mario", "Link", "Kirby", "Pikachu" }) {
                var otherPath = Path.Combine(Path.GetDirectoryName(Path.GetDirectoryName(modelPath)), thrower.ToLowerInvariant(), "Fit" + thrower + "MotionEtc.pac");
                using (var other = NodeFactory.FromFile(null, otherPath))
                using (var otherModelArchive = NodeFactory.FromFile(null, Path.Combine(Path.GetDirectoryName(otherPath), "Fit" + thrower + "00.pac"))) {
                  var throwerModel = Descendants(otherModelArchive).OfType<MDL0Node>().Single(n => n.Name == "Fit" + thrower + "00");
                  var throwBone = throwerModel.AllBones.First(b => b.Name == "ThrowN");
                  var victimHip = bones.First(b => b.Name == "HipN");
                  foreach (var suffix in new[] { "F", "B", "Hi", "Lw" }) {
                    var anim = Descendants(other).OfType<CHR0Node>().Single(n => n.Name == "Thrown" + suffix);
                    var throwAnim = Descendants(other).OfType<CHR0Node>().Single(n => n.Name == "Throw" + suffix);
                    var frames = new List<float[]>();
                    for (int f = 0; f < anim.FrameCount; f++) {
                        model.ApplyCHR(anim, f + 1);
                        throwerModel.ApplyCHR(throwAnim, Math.Min(f + 1, throwAnim.FrameCount));
                        // Thrown poses are local to the thrower's rotating
                        // ThrowN joint. Bake that orientation around HipN;
                        // simulation supplies the joint's world translation.
                        var rotation = new float[9];
                        for (int col = 0; col < 3; col++) {
                            double norm = 0;
                            for (int row = 0; row < 3; row++) norm += throwBone.Matrix[col * 4 + row] * throwBone.Matrix[col * 4 + row];
                            float length = (float)Math.Sqrt(norm);
                            for (int row = 0; row < 3; row++) rotation[col * 3 + row] = throwBone.Matrix[col * 4 + row] / length;
                        }
                        var values = new float[bones.Length * 16];
                        for (int b = 0; b < bones.Length; b++) {
                            for (int col = 0; col < 4; col++) for (int row = 0; row < 3; row++) {
                                float value = col == 3 ? victimHip.Matrix[12 + row] : 0;
                                for (int k = 0; k < 3; k++) value += rotation[k * 3 + row] * (bones[b].Matrix[col * 4 + k] - (col == 3 ? victimHip.Matrix[12 + k] : 0));
                                values[b * 16 + col * 4 + row] = value;
                            }
                            values[b * 16 + 15] = 1;
                        }
                        frames.Add(values);
                    }
                    clips["Thrown" + thrower + suffix] = new { count = anim.FrameCount, loop = false, frames = frames, rootMotion = (object)null };
                  }
                }
            }
            if (fighterName == "kirby") foreach (var copyName in new[] { "Mario", "Link", "Pikachu" }) {
                using (var copyArchive = NodeFactory.FromFile(null, Path.Combine(Path.GetDirectoryName(modelPath), "FitKirby" + copyName + "00.pac"))) {
                    foreach (var anim in Descendants(copyArchive).OfType<CHR0Node>().Where(a => a.Name.StartsWith("SpecialN") || a.Name.StartsWith("SpecialAirN"))) {
                        var frames = new List<float[]>();
                        for (int f = 0; f < anim.FrameCount; f++) {
                            model.ApplyCHR(anim, f + 1);
                            var values = new float[bones.Length * 16];
                            for (int b = 0; b < bones.Length; b++) for (int j = 0; j < 16; j++) values[b * 16 + j] = bones[b].Matrix[j];
                            frames.Add(values);
                        }
                        var name = "Copy" + copyName + anim.Name;
                        clips[name] = new { count = anim.FrameCount, loop = anim.Loop, frames = frames, rootMotion = (object)null };
                        Console.WriteLine(name + ": " + anim.FrameCount + " frames");
                    }
                    var copyOutput = Path.Combine(output, "copy-" + copyName.ToLowerInvariant()); Directory.CreateDirectory(copyOutput);
                    ExportArticle(copyArchive, "WpnKirby" + copyName + "Cap", "hat", copyOutput, new[] { copyName == "Mario" ? "WpnKirby_marioCap" : "WpnKirby" + copyName + "Cap" }, new string[0]);
                    if (copyName == "Mario") ExportArticle(copyArchive, "WpnMarioFireball", "fireball", copyOutput, new[] {"fire", "noise"}, new[] {"WpnMarioFireball"});
                    if (copyName == "Link") {
                        ExportArticle(copyArchive, "WpnLinkBow", "bow", copyOutput, new[] {"al_BowA"}, new[] {"WpnKirbyLinkBowD00SpecialNStart", "WpnKirbyLinkBowD00SpecialNLoop", "WpnKirbyLinkBowD00SpecialNEnd", "WpnKirbyLinkBowD00SpecialAirNStart", "WpnKirbyLinkBowD00SpecialAirNLoop", "WpnKirbyLinkBowD00SpecialAirNEnd"});
                        ExportArticle(copyArchive, "WpnLinkBowArrow", "arrow", copyOutput, new[] {"al_arrow"}, new string[0]);
                    }
                    if (copyName == "Pikachu") {
                        ExportArticle(copyArchive, "WpnPikachuDengekidama", "jolt-air", copyOutput, new[] {"denkidamaA", "denkidamaB", "denkidamaC"}, new[] {"WpnPikachuDengekidama"});
                        ExportArticle(copyArchive, "WpnPikachuDengeki", "jolt-ground", copyOutput, new[] {"spark01", "spark02", "tama.1", "tama.2", "tama.3", "tama.4"}, new[] {"WpnPikachuDengeki"});
                    }
                }
            }
            // Kirby's moveset bone references use model indexes + 400.
            var result = new { schemaVersion = 1, matrixLayout = "column-major", scriptBoneOffset = fighterName == "kirby" ? 400 : 0, bones = boneInfo, clips = clips };
            var serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
            File.WriteAllText(Path.Combine(output, "motion.json"), serializer.Serialize(result));
            if (fighterName == "mario") {
                ExportArticle(archive, "WpnMarioPump", "pump", output, new[] {"Pump001", "PumpEVtank"}, new[] {"WpnMarioPumpD03SpecialLwStart", "WpnMarioPumpD03SpecialLwHold", "WpnMarioPumpD03SpecialLwLight", "WpnMarioPumpD03SpecialLwHeavy", "WpnMarioPumpD03SpecialLwWait", "WpnMarioPumpD03SpecialLwEnd"});
                ExportArticle(motion, "WpnMarioPumpWater", "water", output, new[] {"FB", "waterInd", "waterMask", "waterSpec"}, new[] {"WpnMarioPumpWaterRegular"});
                ExportArticle(motion, "WpnMarioFireball", "fireball", output, new[] {"fire", "noise"}, new[] {"WpnMarioFireball"});
                ExportArticle(motion, "WpnMarioMantle", "cape", output, new[] {"ItmMarioManto1"}, new[] {"WpnMarioMantleD01SpecialS", "WpnMarioMantleD01SpecialAirS"});
            }
            if (fighterName == "pikachu") {
                ExportArticle(motion, "WpnPikachuKaminari", "thunder", output, new[] {"kaminari.1", "kaminari.2", "kaminari.3", "kaminari.4"}, new string[0]);
                ExportArticle(motion, "WpnPikachuDengekidama", "jolt-air", output, new[] {"denkidamaA", "denkidamaB", "denkidamaC"}, new[] {"WpnPikachuDengekidama"});
                ExportArticle(motion, "WpnPikachuDengeki", "jolt-ground", output, new[] {"spark01", "spark02", "tama.1", "tama.2", "tama.3", "tama.4"}, new[] {"WpnPikachuDengeki"});
            }
            if (fighterName == "link") {
                using (var bombArchive = NodeFactory.FromFile(null, Path.Combine(Path.GetDirectoryName(Path.GetDirectoryName(Path.GetDirectoryName(modelPath))), "item/linkbomb/ItmLinkBombBrres.pac")))
                    ExportArticle(bombArchive, "ItmLinkBomb", "bomb", output, new[] {"ItmLinkBombHi1", "al_bomb"}, new[] {"ItmLinkBomb"});
                ExportArticle(motion, "WpnLinkBoomerang", "boomerang", output, new[] {"WpnLinkBoomerang"}, new[] {"WpnLinkBoomerang"});
                ExportArticle(motion, "WpnLinkClawshot", "clawshot", output, new[] {"al_HS"}, new[] {"WpnLinkClawshotWait"});
                ExportArticle(motion, "WpnLinkClawshotHead", "clawshot-head", output, new[] {"al_HS_tip"}, new[] {"WpnLinkClawshotHeadWait", "WpnLinkClawshotHeadOpen", "WpnLinkClawshotHeadClose"});
                ExportArticle(motion, "WpnLinkClawshotHand", "clawshot-hand", output, new[] {"al_HS"}, new[] {"WpnLinkClawshotHandShoot", "WpnLinkClawshotHandBack"});
                ExportArticle(motion, "WpnLinkBow", "bow", output, new[] {"al_BowA"}, new[] {"WpnLinkBowD00SpecialNStart", "WpnLinkBowD00SpecialNLoop", "WpnLinkBowD00SpecialNEnd", "WpnLinkBowD00SpecialAirNStart", "WpnLinkBowD00SpecialAirNLoop", "WpnLinkBowD00SpecialAirNEnd"});
                ExportArticle(motion, "WpnLinkBowArrow", "arrow", output, new[] {"al_arrow"}, new string[0]);
            }
            if (fighterName == "kirby") {
                ExportArticle(motion, "WpnKirbyStone100t", "stone-weight", output, new[] {"PlyKirby5KStn100tB", "PlyKirby5KStn100tEV", "PlyKirby5KStn100tEVB", "PlyKirby5KStn100tG", "PlyKirby5KStn100tT"}, new string[0]);
                ExportArticle(motion, "WpnKirbyStoneDosun", "stone-thwomp", output, new[] {"PlyKirby5KStnDsnB", "PlyKirby5KStnDsnS"}, new string[0]);
                ExportArticle(motion, "WpnKirbyStoneHammer", "stone-block", output, new[] {"PlyKirby5KStnHmmrB", "PlyKirby5KStnHmmrEV", "PlyKirby5KStnHmmrEVB", "PlyKirby5KStnHmmrTB"}, new string[0]);
                ExportArticle(motion, "WpnKirbyStoneKirby", "stone-kirby", output, new[] {"PlyKirby5KStnKbyB", "PlyKirby5KStnKbyS", "PlyKirby5KStnKbyS2"}, new string[0]);
                ExportArticle(motion, "WpnKirbyStonePPon", "stone-rock", output, new[] {"PlyKirby5KStnPPonA", "PlyKirby5KStnPPonB"}, new string[0]);
                ExportArticle(motion, "WpnKirbyHammer", "hammer", output, new[] {"ItmKirbyHmmrB0", "ItmKirbyHmmrG0", "ItmKirbyHmmrS0"}, new[] {"WpnKirbyHammerD01SpecialS", "WpnKirbyHammerD01SpecialAirS"});
                ExportArticle(motion, "WpnKirbyStarMissile", "spit-star", output, new[] {"ItmCommonWStarB0", "StarGlow", "StarGlow2"}, new string[0]);
                var cutter = Descendants(motion).OfType<MDL0Node>().Single(n => n.Name == "WpnKirbyFinalcutter");
                var cutterPath = Path.Combine(output, "final-cutter.dae");
                Collada.Serialize(cutter, cutterPath);
                var cutterXml = new XmlDocument(); cutterXml.Load(cutterPath);
                foreach (XmlNode node in cutterXml.SelectNodes("//*[local-name()='init_from']")) node.InnerText = node.InnerText.Trim();
                foreach (XmlNode node in cutterXml.SelectNodes("//*[not(*)]"))
                    if (node.InnerText.Length > 0) node.InnerText = node.InnerText.Trim();
                cutterXml.Save(cutterPath);
                var cutterTextures = Descendants(motion).OfType<TEX0Node>().Where(t => t.Name == "zanzou_a" || t.Name == "zanzou_b").ToArray();
                if (cutterTextures.Length != 2) throw new Exception("Required Final Cutter textures were not found");
                foreach (var tex in cutterTextures)
                    using (var bmp = tex.GetImage(0)) bmp.Save(Path.Combine(output, tex.Name + ".png"), System.Drawing.Imaging.ImageFormat.Png);
            }
            Console.WriteLine("Exported " + bones.Length + " bones to " + output);
        }
    }
}
