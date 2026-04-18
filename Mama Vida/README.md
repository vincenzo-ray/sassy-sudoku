# Sassy Sudoku

A small, installable sudoku PWA. Vanilla HTML/CSS/JS, native ES modules, no build step.

## Files

```
Mama Vida/
├── index.html       markup
├── styles.css       all styling
├── engine.js        pure sudoku logic (solver, generator, themes)
├── app.js           state, rendering, UI, boot
├── sw.js            service worker (offline-first)
├── manifest.json    PWA manifest
├── icon.svg         app icon
└── sudoku.py        original Streamlit prototype (kept as reference)
```

## Run locally

ES modules require an HTTP server (not `file://`):

```sh
cd "Mama Vida"
python3 -m http.server 5173
# http://localhost:5173
```

## Save-mid-game

Every placement, note, hint, undo, and redo writes the full game state to
`localStorage`. On next launch the app restores everything and shows a
welcome-back banner with where she left off. Per-device, per-browser. Clearing
browser data wipes the save.

## Deploy

Auto-deploys to GitHub Pages on every push to `main` via
`../.github/workflows/pages.yml`. URL after first deploy:
`https://<user>.github.io/<repo>/`

When shipping changes to `styles.css` / `app.js` / `engine.js`, bump the
`VERSION` constant in `sw.js` so returning users pull fresh assets instead of
the offline cache.

## Features

- 4×4 / 6×6 / 9×9 boards with proper subgrid boundaries
- Unique-solution generator (bitmask backtracking + uniqueness verification)
- Four difficulty tiers: easy, medium, hard, diabolical
- Themes: numbers, roman, letters, zodiac, sassy, romance, stars, fruits, pastel
- Custom symbols (comma-separated; overrides theme)
- Pencil notes, undo, redo, erase, hint, pause, timer
- Conflict highlighting, related-cell / same-value highlights
- Daily puzzle + streak tracking
- Best-times per mode, last-7-dailies grid
- Shareable puzzle URLs
- Dark mode · haptics on mobile · optional sound · offline-first · reduced-motion

## Keyboard

| key | action |
|---|---|
| arrows | move selection |
| 1–N | place value |
| P | pencil / notes |
| Z / Y | undo / redo |
| H | hint |
| Del / Backspace / 0 | erase |
| Space | pause |

## Removing the dev theme-cycle button

While evaluating themes, the header shows a dashed `dev · … ↻` button. Once the
preferred theme is picked (set it as default in Settings), delete from
`index.html`:

```html
<button class="dev-btn" id="btnCycleTheme" ...>dev · numbers ↻</button>
```

The handler in `app.js` safely no-ops if the element is missing.

---

Author: **vm**
