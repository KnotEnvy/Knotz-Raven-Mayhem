# Knotz Raven Mayhem Deployment Runbook

This repo is prepared for static GitHub Pages deployment from the Vite `dist/` output. The release path is local records only for v1; online leaderboards and account features are deferred.

## Pre-Deploy Gates

Run these locally before starting a public deploy:

```bash
npm install
npm run release:verify
```

`release:verify` runs the deterministic balance report, the production build, the static `dist/` verifier, and an HTTP smoke test that serves the built files from a simulated GitHub Pages subpath.

## Manual QA

Complete `DOCS/RELEASE-QA-CHECKLIST.md` against a production preview or Pages deployment candidate. Record any failures with browser, viewport, save state, and reproduction steps.

The final deploy should not proceed until these areas are checked:

- Fresh save and returning save behavior.
- Menu, armory, records, options, credits, pause, and game-over navigation.
- Every weapon, crosshair, upgrade, enemy family, powerup, and boss stage.
- Desktop and mobile viewport layout.
- Reduced motion and screen shake settings.

## GitHub Actions

- `.github/workflows/ci.yml` runs `npm run release:verify` on pushes and pull requests targeting `master`.
- `.github/workflows/pages.yml` deploys `dist/` to GitHub Pages manually through `workflow_dispatch`.

## GitHub Pages Deployment

1. In GitHub, open Settings -> Pages and set Source to `GitHub Actions`. Do not use the classic branch/folder Pages source for this Vite build.
2. Merge or push the final release branch to `master`.
3. Confirm the `Release Verification` workflow is green.
4. In GitHub, open Actions, select `Deploy GitHub Pages`, and choose `Run workflow` on `master`.
5. Confirm the run shows the `workflow_dispatch` event. That manual event is the intended deployment trigger for `.github/workflows/pages.yml`.
6. After deployment, open the workflow-provided Pages URL.
7. Run the published-build checks from `DOCS/RELEASE-QA-CHECKLIST.md`.

If the Pages site shows a blank white screen after a successful build, first confirm the repository is using the `GitHub Actions` Pages source. The classic branch/folder source can serve stale or mismatched files after the Vite stack migration.

## Rollback

If a public deployment fails after publishing, redeploy the last known-good commit from the `Deploy GitHub Pages` workflow, or revert the release commit and rerun the workflow.
