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
src/game/systems/ArcadeAudio.ts     procedural music sequencer and SFX (WebAudio bus graph)
src/game/systems/Quality.ts         graphics tiers (Auto/High/Balanced/Low) and auto step-down
src/game/fx/TextureFactory.ts       boot-time baked raven variants, portraits and FX textures
src/game/fx/BackdropThemes.ts       Canvas painters for every stage backdrop layer
src/game/fx/Backdrop.ts             parallax runtime, ambient particles, weather and landmarks
src/game/fx/CabinetPipeline.ts      desktop post process (bloom, scanlines, aberration, grain)
src/game/fx/Particles.ts            pooled emitter-based VFX (sparks, feathers, rings, flares)
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

## Presentation Architecture

The only shipped art is the seed `raven.png`/`boom.png`; everything else is generated at load time:

- `BootScene` bakes textures with Canvas 2D (`bakeAllTextures`) and waits for the bundled fonts before any Phaser text is created. Raven variants are painted per enemy (body color, rim light, glow, eye, per-type accessory) into `raven-<id>` sheets with `flap-<id>` animations. Sprites must be scaled by `def.scale * visualMultiplier / ravenBakeScale(id)`.
- `StageBackdrop` builds a sky texture plus horizontally tileable layer textures from `BackdropThemes`, scrolls them as `TileSprite`s, and redraws only the ground grid each frame. It rebuilds on stage change and (debounced) on resize; `maintain()` keeps running while paused.
- `FxParticles` owns a fixed set of emitters whose per-burst settings come from `onEmit`/`onUpdate` callbacks. Do not go back to one tween per spark.
- `CabinetPipeline` is a camera post pipeline used only when the quality profile has `postFx`. It must never bend the image (no barrel/curvature): hit tests use raw pointer coordinates.
- `resolveQualityProfile(settings)` decides tier. Auto picks High for fine-pointer desktops and Balanced for touch/small screens, and `GameScene.monitorFrameRate` steps Auto down for the session if FPS stays low. `?quality=high|balanced|low` overrides for QA.
- Audio: SFX and music buses feed a compressor and a limiter; music is scheduled on the AudioContext clock with a lookahead timer. `setIntensity()` follows the combo multiplier. Levels were balanced with offline renders so hits sit well above the music bed; re-measure if you add voices.

Invariants:

- Phaser text with glow shadows needs `padding` (see `glowPadding`) or the glow clips into a visible box.
- Pooled popup text is restyled with a single rasterization (`style.setStyle(..., false)` then one `setText`/`updateText`).
- The HUD shows `snapshot.liveGrade` (grade over resolved ravens) so on-screen birds do not read as failures; the final stage grade still uses `stageGrade`.
- Changing Graphics re-bakes raven sheets in `AttractScene.applyGraphicsSettings`; destroy sprites using those textures first.

Dev-only QA hooks (stripped from production builds): `window.__knotzGame` exposes the Phaser game, and `?stage=N` starts a run on stage N.

## Release Shell

`index.html` now carries the production title, description, canonical URL, Open Graph tags, Twitter card tags, theme color, and mobile/iOS web app tags.

`public/` includes:

- `licenses/` (SIL OFL texts for the bundled Bungee and Chakra Petch fonts, linked from Credits)
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
npm run art:capsule
npm run audit:mobile
npm run balance:report
npm run typecheck
npm run build
npm run release:check
npm run release:smoke
npm run release:verify
```

`npm run release:verify` is the main local gate. It runs the balance report, TypeScript build, Vite production build, static dist verifier, release-shell asset checks, and served dist smoke.

`npm run art:capsule` regenerates `public/social-preview.png` (1200x630) by rendering `scripts/social-preview.html` with headless Chrome/Edge. Edit that HTML to change the capsule art; it composes the real sprite sheets from `public/assets/`.

Bundled fonts live in `src/assets/fonts/` and are referenced relatively from `src/styles.css`, so Vite hashes them into `dist/assets/`.

`npm run audit:mobile` drives the dev server (default `http://127.0.0.1:5173/`, override with `AUDIT_URL`) through every UI surface at six phone/tablet/desktop sizes using headless Chrome/Edge, screenshots into the gitignored `audit-shots/`, and flags unreachable/clipped/undersized tap targets. Run it after any HUD or overlay CSS change.

Gameplay HUD invariant: `src/ui/app.ts` builds the HUD DOM once and patches values via `data-hud` refs because GameScene dispatches HUD state every frame. Never switch the hud screen back to per-dispatch `innerHTML` rendering — that destroys buttons mid-touch on mobile and caused touch freezes.

## Deployment Notes

GitHub Pages must use Source: `GitHub Actions`.

Deployments are handled through the manual `Deploy GitHub Pages` workflow using the `workflow_dispatch` event on `master`. The classic branch/folder source can serve stale or mismatched output for this Vite build.

## Current Remaining Release Work

- Complete `DOCS/RELEASE-QA-CHECKLIST.md` end to end.
- Finish full-arc balance sign-off from real play sessions.
- Validate mobile/touch feel on real devices.
- Optionally replace or expand final production visuals and recorded audio.

Treat the between-stage flow, game-over-to-armory flow, idle cabinet demo, field-drain stage endings, and pooling pass as accepted baseline behavior unless new bugs are reported.
