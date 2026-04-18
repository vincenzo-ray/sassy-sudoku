// Engine test suite — run with: node --test test/
// Covers: pure utilities, symbol picking, puzzle uniqueness across all sizes × difficulties.
// No dependencies — uses Node's built-in test runner (Node 18+).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SIZE_CONFIG, THEMES, DEV_THEMES, DEFAULT_NOTES,
  deepCopy, mulberry32, shuffle, popcount,
  fmtTime, todayKey, formatDateKey,
  boxIdx, countSolutions, generatePuzzle, pickSymbols,
} from '../engine.js';

// --- utilities ---------------------------------------------------------------

test('mulberry32 is deterministic given the same seed', () => {
  const a = mulberry32(12345);
  const b = mulberry32(12345);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});

test('mulberry32 diverges across different seeds', () => {
  const a = mulberry32(1), b = mulberry32(2);
  assert.notEqual(a(), b());
});

test('popcount counts set bits', () => {
  assert.equal(popcount(0), 0);
  assert.equal(popcount(0b101), 2);
  assert.equal(popcount(0b11111111), 8);
  assert.equal(popcount(0b111111111), 9);
});

test('shuffle with same seed is deterministic', () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const a = shuffle(arr, mulberry32(42));
  const b = shuffle(arr, mulberry32(42));
  assert.deepEqual(a, b);
});

test('shuffle preserves elements', () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const out = shuffle(arr, mulberry32(7));
  assert.deepEqual([...out].sort((x, y) => x - y), arr);
});

test('fmtTime renders seconds as mm:ss or h:mm:ss', () => {
  assert.equal(fmtTime(0), '00:00');
  assert.equal(fmtTime(59), '00:59');
  assert.equal(fmtTime(60), '01:00');
  assert.equal(fmtTime(3599), '59:59');
  assert.equal(fmtTime(3600), '1:00:00');
  assert.equal(fmtTime(3661), '1:01:01');
  assert.equal(fmtTime(-10), '00:00'); // clamps negative
});

test('todayKey formats YYYYMMDD', () => {
  const key = todayKey(new Date('2026-04-18T12:00:00Z'));
  assert.match(key, /^\d{8}$/);
});

test('formatDateKey renders YYYY-MM-DD', () => {
  assert.equal(formatDateKey('20260418'), '2026-04-18');
  assert.equal(formatDateKey(''), '');
});

test('boxIdx maps 9×9 boxes in row-major order', () => {
  assert.equal(boxIdx(0, 0, 3, 3, 9), 0);
  assert.equal(boxIdx(0, 8, 3, 3, 9), 2);
  assert.equal(boxIdx(3, 3, 3, 3, 9), 4);
  assert.equal(boxIdx(8, 8, 3, 3, 9), 8);
});

test('boxIdx maps 6×6 boxes (2×3)', () => {
  // 6/3 = 2 cols of boxes, so box 0 = rows 0-1 cols 0-2, box 1 = rows 0-1 cols 3-5, box 2 = rows 2-3 cols 0-2
  assert.equal(boxIdx(0, 0, 2, 3, 6), 0);
  assert.equal(boxIdx(0, 3, 2, 3, 6), 1);
  assert.equal(boxIdx(2, 0, 2, 3, 6), 2);
  assert.equal(boxIdx(5, 5, 2, 3, 6), 5);
});

// --- themes & symbols --------------------------------------------------------

test('THEMES includes all four typographic options', () => {
  for (const t of ['numbers', 'roman', 'letters', 'zodiac']) {
    assert.ok(THEMES[t], `missing theme ${t}`);
    assert.ok(THEMES[t].length >= 9, `${t} needs ≥9 symbols, got ${THEMES[t].length}`);
  }
});

test('DEV_THEMES is the typographic rotation', () => {
  assert.deepEqual(DEV_THEMES, ['numbers', 'roman', 'letters', 'zodiac']);
});

test('pickSymbols returns N distinct symbols for known themes', () => {
  assert.deepEqual(pickSymbols('numbers', '', 9), ['1','2','3','4','5','6','7','8','9']);
  assert.deepEqual(pickSymbols('roman', '', 4), ['I','II','III','IV']);
  assert.equal(pickSymbols('letters', '', 9).length, 9);
  assert.equal(pickSymbols('zodiac', '', 9).length, 9);
});

test('pickSymbols falls back when theme name is unknown', () => {
  const out = pickSymbols('nonexistent', '', 9);
  assert.equal(out.length, 9);
});

test('pickSymbols applies custom overrides first', () => {
  const out = pickSymbols('numbers', 'A,B,C', 5);
  assert.deepEqual(out.slice(0, 3), ['A', 'B', 'C']);
  assert.equal(out.length, 5);
});

test('pickSymbols deduplicates across sources', () => {
  const out = pickSymbols('numbers', 'A,A,A,B', 4);
  assert.equal(new Set(out).size, out.length);
});

test('DEFAULT_NOTES is non-empty', () => {
  assert.ok(DEFAULT_NOTES.length > 0);
});

// --- puzzle generator × every size/difficulty --------------------------------

for (const n of [4, 6, 9]) {
  for (const diff of ['easy', 'medium', 'hard', 'diabolical']) {
    test(`generatePuzzle ${n}×${n} ${diff} has exactly one solution`, { timeout: 60_000 }, () => {
      const rng = mulberry32(1234 + n * 10 + (diff.length));
      const { puzzle, solution } = generatePuzzle(n, diff, rng);

      // dimensions
      assert.equal(puzzle.length, n);
      assert.equal(solution.length, n);
      for (const row of puzzle) assert.equal(row.length, n);
      for (const row of solution) assert.equal(row.length, n);

      // puzzle values (where non-zero) match solution
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (puzzle[r][c]) assert.equal(puzzle[r][c], solution[r][c]);
          assert.ok(solution[r][c] >= 1 && solution[r][c] <= n);
        }
      }

      // solution is a valid sudoku
      const { boxR, boxC } = SIZE_CONFIG[n];
      for (let r = 0; r < n; r++) {
        const row = new Set(), col = new Set();
        for (let c = 0; c < n; c++) { row.add(solution[r][c]); col.add(solution[c][r]); }
        assert.equal(row.size, n, `row ${r} not complete`);
        assert.equal(col.size, n, `col ${r} not complete`);
      }
      for (let br = 0; br < n; br += boxR) {
        for (let bc = 0; bc < n; bc += boxC) {
          const seen = new Set();
          for (let r = 0; r < boxR; r++) for (let c = 0; c < boxC; c++) seen.add(solution[br+r][bc+c]);
          assert.equal(seen.size, n, `box at (${br},${bc}) not complete`);
        }
      }

      // puzzle has exactly one solution
      const count = countSolutions(deepCopy(puzzle), n, boxR, boxC, 2);
      assert.equal(count, 1, `puzzle must have exactly one solution; found ${count}`);
    });
  }
}

test('easy 9×9 falls within reasonable clue range', () => {
  const { puzzle } = generatePuzzle(9, 'easy', mulberry32(42));
  let clues = 0;
  for (const row of puzzle) for (const v of row) if (v) clues++;
  assert.ok(clues >= 35 && clues <= 60, `easy 9×9 clue count out of range: ${clues}`);
});
