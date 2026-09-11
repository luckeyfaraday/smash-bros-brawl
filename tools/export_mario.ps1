param(
    [string]$BrawlLib = "$PSScriptRoot\..\.tools\brawlcrate\BrawlLib.dll",
    [string]$Model = "$PSScriptRoot\..\extract\fighter\mario\FitMario00.pac",
    [string]$Motion = "$PSScriptRoot\..\extract\fighter\mario\FitMarioMotionEtc.pac",
    [string]$Out = "$PSScriptRoot\..\public\assets\mario",
    [switch]$ModelOnly
)
$ErrorActionPreference = 'Stop'
# Run with 32-bit Windows PowerShell: the BrawlCrate release is x86 .NET Framework.
$libPath = (Resolve-Path -LiteralPath $BrawlLib).Path
[void][Reflection.Assembly]::LoadFrom($libPath)
[void][Reflection.Assembly]::LoadWithPartialName('System.Web.Extensions')
Add-Type -Path "$PSScriptRoot\MarioExporter.cs" -ReferencedAssemblies @($libPath, 'System.Web.Extensions', 'System.Drawing', 'System.Core', 'System.Windows.Forms', 'System.Xml')
[MarioExporter]::Export((Resolve-Path $Model).Path, (Resolve-Path $Motion).Path, [IO.Path]::GetFullPath($Out),[bool]$ModelOnly)
