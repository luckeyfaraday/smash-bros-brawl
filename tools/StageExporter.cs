using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Xml;
using System.Security.Cryptography;
using BrawlLib.SSBB.ResourceNodes;
using BrawlLib.Modeling.Collada;

public static class StageExporter
{
    static IEnumerable<ResourceNode> Nodes(ResourceNode n)
    {
        yield return n;
        foreach (ResourceNode child in n.Children)
            foreach (ResourceNode item in Nodes(child)) yield return item;
    }
    public static void Export(string input, string output, string dataPath)
    {
        Directory.CreateDirectory(output);
        using (ResourceNode archive = NodeFactory.FromFile(null, input))
        {
            var nodes = Nodes(archive).ToArray();
            var platform = nodes.OfType<MDL0Node>().Single(m => m.Name == "StgFinal00stage");
            var dae = Path.Combine(output, "final-destination.dae");
            Collada.Serialize(platform, dae);
            var xml = new XmlDocument(); xml.Load(dae);
            foreach (XmlNode n in xml.SelectNodes("//*[local-name()='init_from']")) n.InnerText = n.InnerText.Trim();
            foreach (XmlNode n in xml.SelectNodes("//*[not(*)]"))
                if (n.InnerText.Length > 0) n.InnerText = n.InnerText.Trim();
            xml.Save(dae);
            foreach (var tex in nodes.OfType<TEX0Node>())
                using (var bmp = tex.GetImage(0))
                    bmp.Save(Path.Combine(output, tex.Name + ".png"), System.Drawing.Imaging.ImageFormat.Png);
            var collision = nodes.OfType<CollisionObject>().Single();
            if (!collision.Independent) throw new Exception("Expected independent stage collision");
            var planes = collision._planes.Select(p => new {
                left = new[] { p.PointLeft.X, p.PointLeft.Y },
                right = new[] { p.PointRight.X, p.PointRight.Y },
                type = p.Type.ToString(), characters = p.CollidableByCharacters,
                leftLedge = p.IsLeftLedge, rightLedge = p.IsRightLedge,
                fallThrough = p.IsFallThrough
            }).ToArray();
            var positions = nodes.OfType<MDL0Node>().Single(m => m.Name == "stagePosition");
            positions.Populate();
            var points = positions.AllBones.ToDictionary(b => b.Name,
                b => new[] { b.Matrix[12], b.Matrix[13], b.Matrix[14] });
            string hash;
            using (var stream = File.OpenRead(input))
            using (var digest = SHA256.Create()) hash = BitConverter.ToString(digest.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
            var data = new { id = "final-destination", name = "Final Destination",
                source = new { file = "stage/melee/STGFINAL.PAC", sha256 = hash },
                model = "StgFinal00stage", planes = planes, positions = points };
            Directory.CreateDirectory(Path.GetDirectoryName(dataPath));
            var json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue }.Serialize(data);
            File.WriteAllText(dataPath, json);
            File.WriteAllText(Path.Combine(output, "stage.json"), json);
            Console.WriteLine("Exported Final Destination: " + planes.Length + " collision planes, " + platform.PolygonList.Count + " mesh objects");
        }
    }
}
