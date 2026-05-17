# CLAUDE.md - AI Assistant Guide for Knotz Raven Mayhem

## Project Overview

Knotz Raven Mayhem is a Phaser 3 + TypeScript + Vite arcade shooter deployed as a static GitHub Pages game at:

https://knotenvy.github.io/Knotz-Raven-Mayhem/

The original raven click-target prototype has been rebuilt into a staged cabinet-style run game with an attract screen, armory, records, options, credits, bosses, bonus pacing, local progression, procedural audio, and release verification scripts.

## Current Stack

- Phaser 3 owns the game canvas, scenes, sprites, input, cameras, and playfield effects.
- TypeScript owns game data, save normalization, progression, and scene code.
- Vite builds the static site with `base: './'` for project-path GitHub Pages deployment.
- DOM overlays in `src/ui/app.ts` render text-heavy UI surfaces such as menus, HUD, pause, stage clear, armory, records, options, credits, and game over.
- The public release shell lives in `index.html` and `public/`.

## Important Files

```text
src/main.ts                         Phaser boot entry
src/game/scenes/BootScene.ts        asset loading
src/game/scenes/AttractScene.ts     attract screen, armory, records, options, credits
src/game/scenes/GameScene.ts        active run gameplay, spawning, combat, stage flow
src/game/systems/RunState.ts        run state model
src/game/systems/WaveDirector.ts    stage spawning
src/game/systems/ArcadeAudio.ts     procedural music and SFX
src/game/save.ts                    localStorage save normalization and rewards
src/game/data/*.ts                  enemies, stages, weapons, upgrades, tuning, assets
src/ui/app.ts                       DOM overlay renderer
src/ui/events.ts                    UI and scene command bridge
scripts/check-release.mjs           static dist and release-shell verifier
scripts/smoke-dist.mjs              served dist smoke from /Knotz-Raven-Mayhem/
DOCS/RELEASE-QA-CHECKLIST.md        final manual QA checklist
DOCS/BALANCE-NOTES.md               economy and tuning baseline
DOCS/DEPLOYMENT-RUNBOOK.md          GitHub Actions Pages deployment path
handoff.json                        current handoff state
```

## Release Shell

`index.html` now carries the production title, description, canonical URL, Open Graph tags, Twitter card tags, theme color, and mobile/iOS web app tags.

`public/` includes:

- `favicon.svg`
- `favicon-16x16.png`
- `favicon-32x32.png`
- `apple-touch-icon.png`
- `icons/icon-192.png`
- `icons/icon-512.png`
- `manifest.webmanifest`
- `robots.txt`
- `sitemap.xml`
- `social-preview.png`
- seed runtime assets under `public/assets/`

Do not reintroduce root-relative asset links. Static links should work from the `/Knotz-Raven-Mayhem/` project path.

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

`npm run release:verify` is the main local gate. It runs the balance report, TypeScript build, Vite production build, static dist verifier, release-shell asset checks, and served dist smoke.

## Deployment Notes

GitHub Pages must use Source: `GitHub Actions`.

Deployments are handled through the manual `Deploy GitHub Pages` workflow using the `workflow_dispatch` event on `master`. The classic branch/folder source can serve stale or mismatched output for this Vite build.

## Current Remaining Release Work

- Complete `DOCS/RELEASE-QA-CHECKLIST.md` end to end.
- Finish full-arc balance sign-off from real play sessions.
- Validate mobile/touch feel on real devices.
- Optionally replace or expand final production visuals and recorded audio.

Treat the between-stage flow, game-over-to-armory flow, idle cabinet demo, field-drain stage endings, and pooling pass as accepted baseline behavior unless new bugs are reported.
