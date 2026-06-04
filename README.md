# TatraTrails

English-first trail-conditions board for the High Tatras. Increment 1 = the map foundation.

## Local setup
1. Copy the API-key template and add your key:
   ```powershell
   Copy-Item js/config.example.js js/config.js
   ```
   Get a free key at https://developer.mapy.com, then edit `js/config.js`.
   **Domain-restrict the key** in the Mapy dashboard (it ships in client-side JS).
2. Run the unit tests:
   ```powershell
   node --test
   ```
3. Serve the site locally (any static server), e.g.:
   ```powershell
   python -m http.server 8000
   ```
   then open http://localhost:8000

## Deploy
Pushes to `master` deploy to GitHub Pages via `.github/workflows/pages.yml`.
Set a repository **Actions secret** `MAPY_API_KEY` (Settings → Secrets and variables → Actions),
and enable Pages (Settings → Pages → Source: GitHub Actions). The workflow writes `js/config.js`
from the secret at build time, so the real key is never committed.

## Attribution
Map tiles © Seznam.cz a.s. and others (Mapy.com). Later increments add trail data from
OpenStreetMap (© OpenStreetMap contributors, ODbL) and closure rules from TANAP (tanap.org).
