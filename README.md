# GT7 Setup Lab

GT7 Setup Lab: a free, installable web app that generates a starting tuning setup for Gran Turismo 7. Enter car data, installed parts, tyres, surface, circuit and driving style, plan ECU, restrictor and ballast to hit a PP target, then fine-tune with live feedback. Offline PWA, English and Italian.

Current version: **0.0.0** (see CHANGELOG.md).

> Unofficial project. Not affiliated with Sony Interactive Entertainment or Polyphony Digital. Gran Turismo is a trademark of its respective owners.

## What it is
A heuristic starting point for tuning, not a simulation of GT7's physics. Setups are meant to be tested and refined. PP are estimated with a model that corrects itself from the PP you read in the game. Check each car's real min/max values in the Tuning Shop and enter them under "Ranges for your model".

## Publish on GitHub Pages
1. Create a repository (public, unless you have a plan that allows Pages on private repositories) and upload the files of this folder to its root.
2. Settings > Pages > Deploy from a branch > `main` / root.
3. Open the Pages URL in Chrome on Android and choose "Install app".

## Releasing a new version
1. Change `APP_VERSION` in `index.html` (one place only). The service worker takes its cache name from it, so installed copies update on their own.
2. Add an entry to `CHANGELOG.md`.
3. Commit and tag the release, for example `git tag v0.1.0 && git push --tags`.

## Files
`index.html` (the whole app), `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`.

Add your own `setup-lab-banner.png` (header image) to the same folder. The two icon files included here are placeholders: overwrite them with your own PNGs of the same names and sizes (192x192 and 512x512).
