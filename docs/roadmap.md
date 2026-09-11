# Roadmap

The scope is Mario, Link, Kirby and Pikachu on Final Destination. These priorities
describe direction, not delivery dates.

## Implemented

- Local/CPU battles, stock and time rules, menus, pause and rematch.
- Ground/aerial attacks, specials, grabs, throws, shields and dodges.
- Ledges, floor knockdowns and techs.
- Keyboard/gamepad input and touch controls for a subset of moves.
- Training, deterministic recording/replay and collision inspection.
- Static builds with animation files sized for Cloudflare Pages.

## Next priorities

1. Measure knockback, hitstun, floor techs and contact ordering against controlled
   original-engine sequences, keeping evidence for reconstructed rules.
2. Refine stage contact, body locking, wall/ceiling techs and ledge behavior
   within the current roster and stage.
3. Improve CPU decisions, loading/rendering performance and combat feedback.
4. Expand asset-independent regression coverage for fresh-clone checks.

## Current limits

Mario uses extracted AI scripts with reconstructed native decisions. Other
fighters use a simpler deterministic CPU. Random copy loss, complete audio/effects
and parts of the common physics/state logic remain unfinished.

Additional stages and fighters, story mode, online multiplayer and a general
item roster are outside the current scope. The separate Dolphin reference
experiment is paused.

[Implementation notes](implementation-notes.md) and feature-specific validation
documents record exact behavior, source provenance and known differences.
Proposals should explain how they fit this scope and how they can be tested.
