// Puzzle generator benchmark — writes BENCHMARKS.md at repo root.
// Run with: node scripts/bench.js
//
// For each (size × difficulty) combo, generates N puzzles and records:
//   - generation time (mean, median, p95)
//   - final clue count (min, max, mean)
//   - uniqueness verification (pass/fail)

import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SIZE_CONFIG, generatePuzzle, mulberry32, countSolutions, deepCopy,
} from '../engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '..', '..', 'BENCHMARKS.md');

const N = 30;
const SIZES = [4, 6, 9];
const DIFFICULTIES = ['easy', 'medium', 'hard', 'diabolical'];

function stats(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  return { mean, median, p95, min: sorted[0], max: sorted.at(-1) };
}

function countClues(puzzle) {
  let c = 0;
  for (const row of puzzle) for (const v of row) if (v) c++;
  return c;
}

console.log(`Running ${N} iterations per (size × difficulty) combo...\n`);

const rows = [];
const header = ['Size', 'Difficulty', 'N', 'Mean (ms)', 'Median (ms)', 'P95 (ms)', 'Clues (min–max)', 'Unique?'];

for (const size of SIZES) {
  for (const diff of DIFFICULTIES) {
    const times = [];
    const clueCounts = [];
    let allUnique = true;

    for (let i = 0; i < N; i++) {
      const seed = (Date.now() + i * 7919 + size * 101 + diff.length) | 0;
      const rng = mulberry32(seed);
      const t0 = performance.now();
      const { puzzle } = generatePuzzle(size, diff, rng);
      const dt = performance.now() - t0;
      times.push(dt);
      clueCounts.push(countClues(puzzle));

      const { boxR, boxC } = SIZE_CONFIG[size];
      if (countSolutions(deepCopy(puzzle), size, boxR, boxC, 2) !== 1) allUnique = false;
    }

    const t = stats(times);
    const c = stats(clueCounts);
    const row = [
      `${size}×${size}`,
      diff,
      String(N),
      t.mean.toFixed(1),
      t.median.toFixed(1),
      t.p95.toFixed(1),
      `${c.min}–${c.max}`,
      allUnique ? '✓' : '✗',
    ];
    rows.push(row);
    console.log(`  ${row.join(' · ')}`);
  }
}

// --- render as markdown ------------------------------------------------------

const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)));
const pad = (s, w) => String(s).padEnd(w);

const renderRow = (r) => '| ' + r.map((c, i) => pad(c, widths[i])).join(' | ') + ' |';
const sep = '|' + widths.map(w => '-'.repeat(w + 2)).join('|') + '|';

const md = [
  '# Generator benchmarks',
  '',
  `_Last run: ${new Date().toISOString()}. Sample size: ${N} puzzles per combo._`,
  '',
  'Timing for `generatePuzzle(size, difficulty, rng)` including uniqueness verification',
  'during cell removal. Measured on a GitHub Actions `ubuntu-latest` runner — your',
  'hardware will vary.',
  '',
  renderRow(header),
  sep,
  ...rows.map(renderRow),
  '',
  '**Columns**',
  '- `Mean/Median/P95` — generation wall time across N runs',
  '- `Clues (min–max)` — number of given cells in the final puzzle',
  '- `Unique?` — every puzzle verified to have exactly one solution',
  '',
  '_Re-generated automatically on push via [`.github/workflows/benchmarks.yml`](./.github/workflows/benchmarks.yml)._',
  '',
].join('\n');

writeFileSync(OUT_PATH, md);
console.log(`\n✓ wrote ${OUT_PATH}`);
