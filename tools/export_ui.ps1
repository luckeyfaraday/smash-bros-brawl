param([string]$Source="$PSScriptRoot/../extract/system/common5_en.pac",[string]$Out="$PSScriptRoot/../public/assets/ui")
# Original Brawl title and selection artwork. Run with 32-bit Windows PowerShell.
$ErrorActionPreference='Stop'
$lib=(Resolve-Path "$PSScriptRoot/../.tools/brawlcrate/BrawlLib.dll").Path
[void][Reflection.Assembly]::LoadFrom($lib)
Add-Type -ReferencedAssemblies @($lib,'System.Drawing','System.Core','System.Windows.Forms') -TypeDefinition @'
using System; using System.IO; using System.Linq; using System.Collections.Generic; using BrawlLib.SSBB.ResourceNodes;
public static class GameUiExporter {
 static IEnumerable<ResourceNode> Walk(ResourceNode n) { yield return n; foreach(ResourceNode c in n.Children) foreach(var d in Walk(c)) yield return d; }
 public static void Export(string source,string output,string[] names,string[] files) {
  Directory.CreateDirectory(output);
  using(var root=NodeFactory.FromFile(null,source)) {
   var textures=Walk(root).OfType<TEX0Node>().ToArray();
   for(int i=0;i<names.Length;i++) {
    var texture=textures.First(n=>n.Name==names[i]);
    using(var image=texture.GetImage(0)) {
     // Reconstruct browser text materials from the original channels: glyph
     // intensity for the fill, and the raw ready texture for its dark outline.
     // Preserve raw TEX0 exports alongside the derived coverage masks.
     image.Save(Path.Combine(output,files[i]+".png"),System.Drawing.Imaging.ImageFormat.Png);
     if(files[i].StartsWith("name-") || files[i]=="ready-to-fight" || files[i]=="press-any-button") {
      using(var mask=new System.Drawing.Bitmap(image.Width,image.Height)) {
       for(int y=0;y<image.Height;y++) for(int x=0;x<image.Width;x++) {
        int coverage=image.GetPixel(x,y).R;
        if(files[i]=="ready-to-fight") coverage=Math.Max(0,(coverage-34)*255/221);
        mask.SetPixel(x,y,System.Drawing.Color.FromArgb(coverage,255,255,255));
       }
       mask.Save(Path.Combine(output,files[i]+"-mask.png"),System.Drawing.Imaging.ImageFormat.Png);
      }
     }
    }
    Console.WriteLine(files[i]+": "+texture.TreePath+" ("+texture.Width+"x"+texture.Height+")");
   }
  }
 }
}
'@
$title=(Resolve-Path "$PSScriptRoot/../extract/menu/titleloop/title_en.brres").Path
$selection=@{
 'MenSelchrFaceB.001'='mario';'MenSelchrFaceB.021'='link';'MenSelchrFaceB.051'='kirby';'MenSelchrFaceB.071'='pikachu';
 'MenSelchrChrNm.001'='name-mario';'MenSelchrChrNm.021'='name-link';'MenSelchrChrNm.051'='name-kirby';'MenSelchrChrNm.071'='name-pikachu';
 'MenSelchrReady01_2'='ready-to-fight';'MenSelchrCoin'='coin';
 'MenSelmapPrevbase.02'='stage-final-destination';'MenSelmapFrontStname.02'='stage-name';
 'MenSelchrCard.1'='player-one';'MenSelchrCard.2'='player-two';'MenSelchrCard.9'='player-cpu'
}
$logo=@{
 'enTitleFrontfont_dodai'='logo-metal';'enTitleFrontfont_White'='logo-letters';
 'enTitleFrontfont_White2'='logo-brawl-mask';'enTitleFrontfont_brawl'='logo-brawl';
 'enTitleFrontfont_dodai_shadow'='logo-shadow';'press_any_button'='press-any-button'
}
[GameUiExporter]::Export((Resolve-Path $Source).Path,[IO.Path]::GetFullPath($Out),[string[]]@($selection.Keys),[string[]]@($selection.Values))
[GameUiExporter]::Export($title,[IO.Path]::GetFullPath($Out),[string[]]@($logo.Keys),[string[]]@($logo.Values))
@{sources=@(
 @{source='system/common5_en.pac';sha256=(Get-FileHash $Source -Algorithm SHA256).Hash.ToLowerInvariant();textures=$selection},
 @{source='menu/titleloop/title_en.brres';sha256=(Get-FileHash $title -Algorithm SHA256).Hash.ToLowerInvariant();textures=$logo}
)} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$Out/source.json" -Encoding UTF8
