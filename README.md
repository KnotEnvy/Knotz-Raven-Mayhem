# Knotz Raven Mayhem

Knotz Raven Mayhem is now a Phaser + TypeScript + Vite arcade shooter built from the original raven click-target prototype. The release-track version keeps the raven hunter fantasy and expands it into a 1990s cabinet-style run game with a proper attract screen, armory, staged waves, bosses, unlocks, persistent local progression, and a polished game-over loop.

## Current Game Loop

- Start from the animated arcade attract screen.
- Pick or unlock guns, crosshairs, and permanent stat upgrades in the armory.
- Tune music, SFX, motion, and screen shake from Options.
- Enter a run and clear escalating raven stages.
- Shoot enemies, chain combos, collect powerups, and survive missed ravens.
- Boss stages introduce the Raven King as a high-health gate.
- Death awards coins based on score, stage reached, accuracy, boss kills, and drops.
- Coins persist in local storage and feed the next armory upgrade cycle.

## Stack

- Phaser 3 for the game canvas, scene flow, sprites, animation, camera shake, and effects.
- TypeScript for game data, save state, progression, and scene code.
- Vite for local development and static production builds.
- DOM overlays for the arcade landing page, HUD, pause menu, armory, records, options, credits, and game-over GUI.
- Procedural WebAudio cabinet music and sound effects layered with the original boom sample.

## Project Structure

```text
src/
  game/
    data/       # enemies, stages, weapons, upgrades, asset keys
    scenes/     # Boot, Attract, Gameplay
    systems/    # run state, progression, wave director
    save.ts     # localStorage save and reward handling
    types.ts    # public game data contracts
  ui/
    app.ts      # DOM overlay rendering
    events.ts   # scene/UI event bridge
  main.ts
  styles.css
public/assets/  # shipped raven, explosion, and boom audio assets
```

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

The Vite config uses `base: './'`, so `dist/` can be deployed as static GitHub Pages output for the project URL.

## Controls

- Mouse / touch pointer: aim.
- Click / tap: fire, collect powerups, and interact with targets.
- Space or P: pause and resume.
- Esc: pause, or quit to menu while paused.

## Content Implemented

- 6 named stages with different spawn pools, palettes, speeds, and rewards.
- 9 enemy definitions including fast, golden, armored, mini, shield, splitter, dive, and boss ravens.
- 4 guns: Quarter Pistol, Burst Rifle, Scattergun, and Arc Laser.
- 4 crosshairs with stat identity.
- 4 permanent upgrades: cooldown, combo window, starting lives, and payout scaling.
- 5 powerups: slow-mo, multi-shot, score boost, extra life, and overdrive.
- Local records for high score, best stage, best combo, lifetime kills, unlocked gear, and coins.
- Persistent options for music volume, SFX volume, screen shake, and reduced motion.
- Procedural arcade audio for menu confirms, shots, hits, misses, powerups, stage clear, boss warning, and game over.
- Death sequence before the final score screen.

## Asset Direction

The original `raven.png`, `boom.png`, `boom.wav`, and `boom.mp3` are copied into `public/assets/` and used as the seed visual/audio set. Future production asset work should add normalized sprite sheets, stage backgrounds, UI art, and more sound/music through the manifest/data layer instead of hardcoding filenames in scenes.
