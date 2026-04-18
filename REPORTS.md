# Automated reports

Five GitHub Actions workflows keep this repo honest and interesting.

| Workflow | Trigger | What it produces |
|---|---|---|
| [`tests.yml`](./.github/workflows/tests.yml) | push · PR to `main` | Runs `node --test` on the engine. Blocks merge if broken. |
| [`benchmarks.yml`](./.github/workflows/benchmarks.yml) | push that touches `engine.js` | Regenerates [`BENCHMARKS.md`](./BENCHMARKS.md) with timing + clue stats. |
| [`daily.yml`](./.github/workflows/daily.yml) | cron 00:15 UTC daily | Pre-generates the next 14 days into [`Mama Vida/dailies.json`](./Mama%20Vida/dailies.json). |
| [`notes.yml`](./.github/workflows/notes.yml) | cron 00:30 UTC Mondays | Rotates 8 sweet notes from the pool into [`Mama Vida/notes.json`](./Mama%20Vida/notes.json). |
| [`lighthouse.yml`](./.github/workflows/lighthouse.yml) | after successful Pages deploy | Audits performance, accessibility, PWA — uploads report artifacts. |

## Where to look

- **Latest benchmark numbers** → [BENCHMARKS.md](./BENCHMARKS.md)
- **Today's + upcoming daily puzzles** → [`Mama Vida/dailies.json`](./Mama%20Vida/dailies.json)
- **This week's rotated sweet notes** → [`Mama Vida/notes.json`](./Mama%20Vida/notes.json)
- **The sweet-note source pool** → [`Mama Vida/notes-pool.json`](./Mama%20Vida/notes-pool.json)
- **Lighthouse reports** → Actions tab → pick a `lighthouse` run → Artifacts

## Difficulty curve for daily puzzles

| Day | Difficulty |
|---|---|
| Mon · Tue | easy |
| Wed · Thu | medium |
| Fri | hard |
| Sat | diabolical |
| Sun | medium (cooldown) |

Edit [`scripts/generate-dailies.js`](./Mama%20Vida/scripts/generate-dailies.js) to change the curve.

## Manually triggering any workflow

GitHub → **Actions** tab → click a workflow → **Run workflow** button (top right). Useful for:
- Regenerating benchmarks after engine changes
- Forcing a daily/notes refresh without waiting for the cron
- Re-running Lighthouse if you tweak performance

## How the app consumes these files

- **Daily button** → fetches `dailies.json` first. If today's puzzle is there, loads it directly. Otherwise falls back to seed-generating from the date (same result everywhere).
- **Win screen sweet note** → priority order: user's custom notes in Settings → weekly-rotated pool → built-in defaults.
- **Both JSON files** → served with `cache: 'no-cache'` and network-first in the service worker, so they stay fresh while the rest of the app remains offline-available.
