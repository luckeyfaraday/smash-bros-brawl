param(
    [string]$BrawlLib = "$PSScriptRoot\..\.tools\brawlcrate\BrawlLib.dll",
    [string]$Stage = "$PSScriptRoot\..\extract\stage\melee\STGFINAL.PAC",
    [string]$Out = "$PSScriptRoot\..\public\assets\final-destination",
    [string]$Data = "$PSScriptRoot\..\src\data\final-destination.json"
)
$ErrorActionPreference='Stop'
$libPath=(Resolve-Path -LiteralPath $BrawlLib).Path
[void][Reflection.Assembly]::LoadFrom($libPath)
[void][Reflection.Assembly]::LoadWithPartialName('System.Web.Extensions')
Add-Type -Path "$PSScriptRoot\StageExporter.cs" -ReferencedAssemblies @($libPath,'System.Web.Extensions','System.Drawing','System.Core','System.Windows.Forms','System.Xml')
[StageExporter]::Export((Resolve-Path -LiteralPath $Stage).Path,[IO.Path]::GetFullPath($Out),[IO.Path]::GetFullPath($Data))
