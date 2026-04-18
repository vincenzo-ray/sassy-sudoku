// Weekly sweet-notes rotation.
// Picks 8 notes from notes-pool.json for the current ISO week,
// writes them to notes.json. Deterministic per week so the same week
// always produces the same selection.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mulberry32, shuffle } from '../engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const POOL_PATH = resolve(__dirname, '..', 'notes-pool.json');
const OUT_PATH  = resolve(__dirname, '..', 'notes.json');

const HOW_MANY = 8;

function isoWeek(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return { year: date.getUTCFullYear(), week };
}

const pool = JSON.parse(readFileSync(POOL_PATH, 'utf8'));
const notes = Array.isArray(pool) ? pool : pool.notes;
if (!Array.isArray(notes) || notes.length === 0) {
  console.error('notes-pool.json is empty or malformed');
  process.exit(1);
}

const { year, week } = isoWeek();
const seed = year * 100 + week;
const rng = mulberry32(seed);
const chosen = shuffle(notes, rng).slice(0, Math.min(HOW_MANY, notes.length));

const out = {
  week: `${year}-W${String(week).padStart(2, '0')}`,
  seed,
  rotated_at: new Date().toISOString(),
  notes: chosen,
};

writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');

console.log(`✓ ${OUT_PATH}`);
console.log(`  week: ${out.week}  (seed ${seed})`);
console.log(`  selected ${chosen.length}/${notes.length}:`);
for (const n of chosen) console.log(`    · ${n}`);
