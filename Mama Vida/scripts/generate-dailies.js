// Daily puzzle pre-generator.
// Writes Mama Vida/dailies.json with puzzles for the next 14 days.
// Applies a weekly difficulty curve (Mon easy → Sat diabolical, Sun medium cooldown).
// Deterministic: each day's seed is the YYYYMMDD integer, so re-runs produce the same puzzle.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generatePuzzle, mulberry32 } from '../engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DAILIES_PATH = resolve(__dirname, '..', 'dailies.json');

const DAYS_AHEAD = 14;
const KEEP_PAST_DAYS = 30;

const DIFFICULTY_BY_DOW = {
  0: 'medium',     // Sunday — cooldown
  1: 'easy',       // Monday
  2: 'easy',       // Tuesday
  3: 'medium',     // Wednesday
  4: 'medium',     // Thursday
  5: 'hard',       // Friday
  6: 'diabolical', // Saturday
};

function keyOf(d) {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

// --- load existing ------------------------------------------------------------
let existing = { generated_at: null, puzzles: {} };
try {
  existing = JSON.parse(readFileSync(DAILIES_PATH, 'utf8'));
  existing.puzzles = existing.puzzles || {};
} catch {
  // file doesn't exist yet or is empty — start fresh
}

// --- generate forward --------------------------------------------------------
const today = new Date();
today.setUTCHours(0, 0, 0, 0);

let added = 0;
for (let i = 0; i < DAYS_AHEAD; i++) {
  const d = new Date(today);
  d.setUTCDate(today.getUTCDate() + i);
  const key = keyOf(d);

  if (existing.puzzles[key]) continue; // already generated, preserve

  const difficulty = DIFFICULTY_BY_DOW[d.getUTCDay()];
  const seed = parseInt(key, 10);
  const rng = mulberry32(seed);
  const { solution, puzzle } = generatePuzzle(9, difficulty, rng);

  existing.puzzles[key] = {
    size: 9,
    difficulty,
    seed,
    puzzle: puzzle.flat(),
    solution: solution.flat(),
  };
  added++;
  console.log(`+ ${key} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()]}, ${difficulty})`);
}

// --- prune old entries --------------------------------------------------------
const cutoff = new Date(today);
cutoff.setUTCDate(cutoff.getUTCDate() - KEEP_PAST_DAYS);
const cutoffKey = keyOf(cutoff);
let pruned = 0;
for (const k of Object.keys(existing.puzzles)) {
  if (k < cutoffKey) { delete existing.puzzles[k]; pruned++; }
}
if (pruned) console.log(`- pruned ${pruned} puzzles older than ${cutoffKey}`);

existing.generated_at = new Date().toISOString();
existing.curve = DIFFICULTY_BY_DOW;

// --- write --------------------------------------------------------------------
const serialized = JSON.stringify(existing, null, 2) + '\n';
writeFileSync(DAILIES_PATH, serialized);

console.log(`\n✓ ${DAILIES_PATH}`);
console.log(`  added: ${added}, total stored: ${Object.keys(existing.puzzles).length}`);
