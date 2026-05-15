# Knotz Raven Mayhem Subagent Roster

Use these subagent roles to parallelize Beta-release work. Each subagent should keep changes scoped to its ownership area, run the listed checks, and report exact files changed plus remaining risks.

## 1. Content Expansion Agent

**Mission:** Add more stage, enemy, powerup, scoring, and bonus-level content while keeping the game readable.

**Owns:**

- `src/game/data/stages.ts`
- `src/game/data/enemies.ts`
- `src/game/data/tuning.ts`
- New content-facing types in `src/game/types.ts`
- Balance notes when content changes materially

**Responsibilities:**

- Add new named stages beyond the current six-stage arc.
- Add enemy archetypes with staged introductions, not sudden difficulty spikes.
- Add powerups, score effects, and bonus-level concepts.
- Keep values data-driven where possible.
- Run `npm run balance:report` after content or economy changes.

**Definition of done:**

- New content appears in real stage pools or bonus flow.
- Enemy/powerup behavior is visually readable.
- Difficulty ramp is explained in `DOCS/BALANCE-NOTES.md` if the baseline changes.
- `npm run release:verify` passes.

## 2. Mobile Performance Agent

**Mission:** Make the game feel reliable on real phone-sized screens and touch input.

**Owns:**

- `src/styles.css`
- `src/game/data/tuning.ts`
- Mobile-sensitive rendering/effects in `src/game/scenes/GameScene.ts`
- Mobile checklist updates in `DOCS/RELEASE-QA-CHECKLIST.md`

**Responsibilities:**

- Tune HUD density, touch target sizing, pause affordance, hit radius, and particle caps.
- Verify that UI does not cover active targets at 390x844 and similar viewports.
- Reduce motion or effect load where mobile performance suffers.
- Preserve the arcade feel while protecting the playfield.

**Definition of done:**

- Real touch input is playable.
- HUD and controls fit without overlap.
- Effects remain readable without excessive frame pressure.
- `npm run release:verify` passes.

## 3. Run Flow And Progression Agent

**Mission:** Improve the run loop around stage transitions and post-run progression.

**Owns:**

- `src/ui/app.ts`
- `src/ui/events.ts`
- `src/game/scenes/GameScene.ts`
- `src/game/scenes/AttractScene.ts`
- `src/game/save.ts` when progression state changes are required

**Responsibilities:**

- Add between-stage session UI before the next stage starts.
- Show stage rewards, stats, next-stage preview, and enemy/boss warnings.
- Improve game-over flow so players are pushed toward armory upgrades naturally.
- Keep Run It Back available, but make spending coins feel like the primary progression path.

**Definition of done:**

- Stage clear no longer feels abrupt.
- Game over clearly communicates earned coins and next best armory action.
- Save data remains stable for returning players.
- `npm run release:verify` passes.

## 4. Combat Feel And Weapon FX Agent

**Mission:** Make guns, crosshairs, cooldowns, and projectile feedback feel much stronger.

**Owns:**

- `src/game/data/weapons.ts`
- `src/game/scenes/GameScene.ts`
- `src/game/systems/ArcadeAudio.ts`
- Related UI/CSS for cooldown or weapon feedback

**Responsibilities:**

- Rework crosshairs so they follow gun identity instead of purchasable cosmetic skins.
- Improve Burst Rifle and Scattergun readability with visible pellets, traces, muzzle fan effects, or exaggerated crosshair states.
- Convey cooldowns vividly with meters, recharge animation, cabinet lights, or failed-trigger feedback.
- Keep effects readable on mobile and during dense waves.

**Definition of done:**

- Each gun has distinct visual and audio identity.
- Cooldown state is obvious without trial-and-error clicking.
- Shot patterns are visually understandable.
- `npm run release:verify` passes.

## 5. Release QA And Deployment Agent

**Mission:** Keep the project deployable while gameplay teams add content.

**Owns:**

- `.github/workflows/ci.yml`
- `.github/workflows/pages.yml`
- `scripts/check-release.mjs`
- `scripts/smoke-dist.mjs`
- `DOCS/DEPLOYMENT-RUNBOOK.md`
- `DOCS/RELEASE-QA-CHECKLIST.md`

**Responsibilities:**

- Keep `npm run release:verify` green.
- Confirm GitHub Pages Source stays set to `GitHub Actions`.
- Confirm deploys use the `Deploy GitHub Pages` workflow and `workflow_dispatch` event.
- Run or coordinate the final release checklist.
- Track published-build issues separately from local dev issues.

**Definition of done:**

- CI is green on the release commit.
- Manual Pages workflow deploys the current `dist` artifact.
- Published URL first-loads with fresh and returning saves.
- Release caveats are documented before handoff or launch.

## Coordination Rules

- Avoid editing another subagent's owned files unless the change is required for your slice.
- Use `npm run release:verify` before handing off a completed slice.
- Update `handoff.json` and the relevant docs when major design decisions change.
- Treat manual playtest findings as product input, not noise; reflect balance changes in `DOCS/BALANCE-NOTES.md`.
