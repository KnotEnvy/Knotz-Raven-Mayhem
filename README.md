# Knotz Raven Mayhem

Knotz Raven Mayhem is now a Phaser + TypeScript + Vite arcade shooter built from the original raven click-target prototype. The release-track version keeps the raven hunter fantasy and expands it into a 1990s cabinet-style run game with a proper attract screen, armory, staged waves, bosses, bonus rounds, unlocks, persistent local progression, and a polished game-over loop.

## Current Game Loop

- Start from the animated arcade attract screen.
- Pick or unlock guns, aim mods, and permanent stat upgrades in the armory.
- Tune music, SFX, motion, and screen shake from Options.
- Enter a run and clear escalating raven stages with stage-clear interstitials between rounds.
- Shoot enemies, chain combos, collect powerups, and survive missed ravens.
- Boss stages introduce the Raven King as a high-health gate.
- Death awards coins based on score, stage reached, accuracy, boss kills, and drops, then points directly to useful armory actions.
- Coins persist in local storage and feed the next armory upgrade cycle.

## Stack

- Phaser 3 for the game canvas, scene flow, sprites, animation, camera shake, and effects.
- TypeScript for game data, save state, progression, and scene code.
- Vite for local development and static production builds.
- DOM overlays for the arcade landing page, HUD, stage-clear flow, pause menu, armory, records, options, credits, and game-over GUI.
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
npm run balance:report
npm run typecheck
npm run build
npm run release:check
npm run release:smoke
npm run release:verify
```

The Vite config uses `base: './'`, so `dist/` can be deployed as static GitHub Pages output for the project URL.

## Release Readiness

- Balance and economy constants live in `src/game/data/tuning.ts` so spawn overflow, player stats, powerup behavior, combo pacing, and reward payouts can be tuned without digging through scene code.
- Mobile and presentation constants live in `src/game/data/tuning.ts` for touch hit forgiveness, powerup collection radius, starfield density, and particle caps.
- Final manual QA should use `DOCS/RELEASE-QA-CHECKLIST.md` after `npm run release:verify`.
- `npm run release:verify` runs the balance report, production build, `dist/` asset checks, and an HTTP smoke test from a simulated GitHub Pages subpath.
- `DOCS/BALANCE-NOTES.md` records the current economy baseline and the tuning entry points for manual playtest adjustments.
- `DOCS/DEPLOYMENT-RUNBOOK.md` documents the GitHub Actions CI and manual GitHub Pages deployment path.
- Current v1 release scope is local records and local progression only; online leaderboard and account features are deferred unless explicitly brought into scope.

## Controls

- Mouse / touch pointer: aim.
- Click / tap: fire, collect powerups, and interact with targets.
- Space or P: pause and resume, or continue from stage-clear screens.
- Esc: pause, or quit to menu while paused.

## Content Implemented

- 9 named stages with different spawn pools, palettes, speeds, rewards, and a Jackpot Alley bonus round.
- 11 enemy definitions including fast, golden, armored, mini, shield, splitter, dive, wraith, brute, and boss ravens.
- 4 guns: Quarter Pistol, Burst Rifle, Scattergun, and Arc Laser.
- 4 aim mods with stat identity; live reticle color, scale, cooldown, and firing feedback now follow the equipped gun.
- 4 permanent upgrades: cooldown, combo window, starting lives, and payout scaling.
- 6 powerups: slow-mo, multi-shot, score boost, extra life, overdrive, and coin rush.
- Local records for high score, best stage, best combo, lifetime kills, unlocked gear, and coins.
- Persistent options for music volume, SFX volume, screen shake, and reduced motion.
- Procedural arcade audio with stage-aware music motifs, weapon-specific shots, enemy-specific hits, powerup cues, boss warning/defeat stings, stage clear, and game over.
- Between-stage summaries with rewards, accuracy, combo highlights, next-stage preview, bonus warnings, and new enemy warnings.
- Death sequence before the final score screen plus armory recommendations on game over.
- Stage-specific procedural background set dressing for graveyard, boardwalk, tower, junkyard, carnival, Raven King's Nest, bonus alley, viaduct, and clocktower runs.

## Asset Direction

The original `raven.png`, `boom.png`, `boom.wav`, and `boom.mp3` are copied into `public/assets/` and used as the seed visual/audio set. The current release candidate adds procedural stage set dressing in Phaser, cabinet-style HUD framing in CSS, stage-aware procedural music, and dedicated procedural event SFX. Future production asset work should add normalized sprite sheets, dedicated boss art, richer UI cabinet art, and optional recorded sound/music through the manifest/data layer instead of hardcoding filenames in scenes.
