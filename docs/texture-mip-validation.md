# Texture mip allocation correction

Status: source patch and isolated C++/WebGPU tests pass. **The running Brawl core
has not been rebuilt with this fix.** Its missing-mip errors remain present.

The observed gameplay error was an upload to mip 1 of a texture allocated with
only one level. The producer retained `TextureConfig.levels` in CPU storage but
omitted it when creating the corresponding GPU texture. The worker also omitted
`mipLevelCount`, which defaults to one.

## Changes

- `patches/dolphin/0001-texture-mip-count.patch` adds the mip count to the final
  unused word of the existing 32-byte CreateTexture command. Both immediate
  construction and `EnsureBridgeId` pass the configured count. Dummy textures
  continue to default to one layer and one level. Record size and opcode stay the
  same, and ring rejection still returns zero for a later retry.
- `tools/reference-patches/hardware-mip-count.json` reads that word when allocating
  the GPU texture. Zero from a legacy core retains the old one-level behavior.
  This compatibility fallback does not fix missing uploads from the legacy core.
- Render attachments explicitly select mip 0 with one level. Sampled views retain
  their full mip chain. By default, a view includes all remaining mip levels;
  see [GPUTexture.createView](https://developer.mozilla.org/en-US/docs/Web/API/GPUTexture/createView).

The consumer patch is separate from the deployed canvas-size patch and is not
enabled on the local game server. A new core and combined, identified worker
variant must be tested together before deployment. Sampler state fidelity,
layered render targets and the broader hardware renderer remain separate issues.

## Source identity

`tools/prepare_texture_source.py` verifies the available patch bytes against the
local source lock, replays the relevant patches into a new directory, then checks
the three reconstructed source files against their locked vendor hashes. It
forces LF output to avoid Windows Git line-ending settings changing those hashes.
It prepares only these source files, not a complete Dolphin checkout or build.

The reconstructed source series is
`e02ac8bf047b940e1ec77c4f4d897c12351791d281af1ef6bc96a88feb748cea`.
The running binary's build record instead identifies
`e7943c7fdbbf5176d90332cc545c8fc536e49aca24bcf150f266daafa5cfb86e`.
The tests establish the local source contract; they do not establish that this
source reproduces the existing binary. A full candidate build must retain its
own source/toolchain identity and pass boot, restore and rendering comparisons.

## Reproduce the isolated tests

Use new output directories. The native harness uses `g++` on PATH, or the existing
Ubuntu WSL installation on this machine. It does not require Emscripten.

```powershell
python tools/prepare_texture_source.py --output .tools/texture-source-mips-verified --patch patches/dolphin/0001-texture-mip-count.patch
python tools/verify_texture_producer.py --source .tools/texture-source-mips-verified --output artifacts/reference/texture-mip-producer-verified
node tools/verify_texture_gpu.mjs --records artifacts/reference/texture-mip-producer-verified/records.json --output artifacts/reference/texture-mip-gpu
```

The C++ harness compiles the actual reconstructed command struct, declaration,
texture constructor, lazy-creation method and command-emission method. Ring
allocation and unrelated Dolphin types are test doubles. The seven cases cover
single-level textures, non-power-of-two arrays, Brawl's six-level allocation,
delayed creation, retry after ring rejection, dummy defaults and zero defaults.
The emitted command records are hashed and passed directly to the GPU test.

The GPU test extracts the actual CreateTexture handler and attachment view
expressions from the identified worker variant. Chrome executes them against a
real WebGPU device, uploads distinct pixel values to every mip/layer, and reads
them through a compute shader. It also checks color/depth attachment views and
legacy zero-count records. Negative controls reproduce the original missing-mip
upload and the invalid attachment view containing multiple mip levels.

Evidence: `artifacts/reference/texture-mip-producer-verified/` and
`artifacts/reference/texture-mip-gpu/`. Seven producer cases and 26 subresource
readbacks passed on Chrome 152.0.7977.77, AMD GCN-5, with zero unexpected GPU
errors and both expected negative controls observed. This covers texture creation,
upload storage and shader-visible mip/layer selection; it is not an original-game
rendering comparison or a full-core compile.

## Remaining integration

The original space constraint cleared on September 8, with about 31 GiB free on
C:. An isolated WSL toolchain now has the pinned Emscripten/Rust compiler revisions,
the complete locked source tree and a compiled Naga bridge. See the
[core build guide](reference-core-build.md) for the build and candidate test flow.
After building, validate actual Brawl uploads
and sampled textures, preserve the surface-size correction, rerun the saved
Training scene and fresh boot, and check that the mip errors disappear without
new rendering differences. Do not infer game fidelity from these isolated tests.
