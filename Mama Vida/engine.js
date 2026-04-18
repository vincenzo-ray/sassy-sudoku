// ============================================================
// Sassy Sudoku — pure engine
// Sudoku solver, generator, themes, and small pure utilities.
// No DOM, no storage, no state. Safe to unit-test.
// ============================================================

export const SIZE_CONFIG = {
  4: { boxR: 2, boxC: 2, clues: { easy: 10, medium: 8,  hard: 6,  diabolical: 5  } },
  6: { boxR: 2, boxC: 3, clues: { easy: 22, medium: 18, hard: 14, diabolical: 12 } },
  9: { boxR: 3, boxC: 3, clues: { easy: 40, medium: 32, hard: 26, diabolical: 22 } },
};

export const THEMES = {
  numbers: ['1','2','3','4','5','6','7','8','9'],
  roman:   ['I','II','III','IV','V','VI','VII','VIII','IX'],
  letters: ['a','b','c','d','e','f','g','h','i'],
  zodiac:  ['♈','♉','♊','♋','♌','♍','♎','♏','♐'],
  sassy:   ['💋','👠','💄','👗','💍','🌹','🎀','💎','👑'],
  romance: ['❤️','💋','🌹','💐','💍','💎','💝','💫','🍓'],
  stars:   ['⭐','✨','🌟','💫','🌙','☀️','🔥','💖','🎵'],
  fruits:  ['🍓','🍒','🍑','🥝','🍌','🍇','🫐','🍎','🥭'],
  pastel:  ['🌸','🌷','🌼','🌻','💐','🪷','🌺','🪻','🌿'],
};

export const DEV_THEMES = ['numbers', 'roman', 'letters', 'zodiac'];

export const DEFAULT_NOTES = [
  "You did it.",
  "For you. Always.",
  "I knew you would.",
  "Beautiful work.",
  "That was gorgeous.",
  "Love you.",
  "Hope this one made you smile.",
  "All yours.",
];

// ----- Pure utilities --------------------------------------------------------

export const deepCopy = (v) => JSON.parse(JSON.stringify(v));

export function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function popcount(n) {
  let c = 0;
  while (n) { c += n & 1; n >>>= 1; }
  return c;
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const pad = (x) => String(x).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDateKey(k) {
  if (!k || k.length !== 8) return k;
  return `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
}

// ----- Sudoku core -----------------------------------------------------------

function newEmptyBoard(n) {
  return Array.from({ length: n }, () => new Array(n).fill(0));
}

export function boxIdx(r, c, boxR, boxC, n) {
  const cols = n / boxC;
  return Math.floor(r / boxR) * cols + Math.floor(c / boxC);
}

function computeMasks(board, n, boxR, boxC) {
  const rows = new Array(n).fill(0);
  const cols = new Array(n).fill(0);
  const boxes = new Array(n).fill(0);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const v = board[r][c];
    if (v) {
      const bit = 1 << (v - 1);
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[boxIdx(r, c, boxR, boxC, n)] |= bit;
    }
  }
  return { rows, cols, boxes };
}

// Count solutions up to `limit` — used by the puzzle generator to ensure uniqueness.
export function countSolutions(board, n, boxR, boxC, limit = 2) {
  const { rows, cols, boxes } = computeMasks(board, n, boxR, boxC);
  const full = (1 << n) - 1;
  let count = 0;
  function bt() {
    if (count >= limit) return;
    let bestR = -1, bestC = -1, bestMask = 0, bestCnt = n + 1;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (board[r][c]) continue;
        const used = rows[r] | cols[c] | boxes[boxIdx(r, c, boxR, boxC, n)];
        const avail = (~used) & full;
        const cnt = popcount(avail);
        if (cnt === 0) return;
        if (cnt < bestCnt) { bestR = r; bestC = c; bestMask = avail; bestCnt = cnt; if (cnt === 1) break; }
      }
      if (bestCnt === 1) break;
    }
    if (bestR === -1) { count++; return; }
    let m = bestMask;
    while (m) {
      const bit = m & -m; m ^= bit;
      const v = 31 - Math.clz32(bit) + 1;
      board[bestR][bestC] = v;
      rows[bestR] |= bit; cols[bestC] |= bit; boxes[boxIdx(bestR, bestC, boxR, boxC, n)] |= bit;
      bt();
      rows[bestR] ^= bit; cols[bestC] ^= bit; boxes[boxIdx(bestR, bestC, boxR, boxC, n)] ^= bit;
      board[bestR][bestC] = 0;
      if (count >= limit) return;
    }
  }
  bt();
  return count;
}

function generateSolved(n, boxR, boxC, rng) {
  const board = newEmptyBoard(n);
  const { rows, cols, boxes } = computeMasks(board, n, boxR, boxC);
  const full = (1 << n) - 1;
  function bt(pos) {
    if (pos === n * n) return true;
    let bestR = -1, bestC = -1, bestMask = 0, bestCnt = n + 1;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (board[r][c]) continue;
      const used = rows[r] | cols[c] | boxes[boxIdx(r, c, boxR, boxC, n)];
      const avail = (~used) & full;
      const cnt = popcount(avail);
      if (cnt === 0) return false;
      if (cnt < bestCnt) { bestR = r; bestC = c; bestMask = avail; bestCnt = cnt; }
    }
    if (bestR === -1) return true;
    const vals = [];
    let m = bestMask;
    while (m) { const bit = m & -m; m ^= bit; vals.push(31 - Math.clz32(bit) + 1); }
    for (const v of shuffle(vals, rng)) {
      const bit = 1 << (v - 1);
      board[bestR][bestC] = v;
      rows[bestR] |= bit; cols[bestC] |= bit; boxes[boxIdx(bestR, bestC, boxR, boxC, n)] |= bit;
      if (bt(pos + 1)) return true;
      rows[bestR] ^= bit; cols[bestC] ^= bit; boxes[boxIdx(bestR, bestC, boxR, boxC, n)] ^= bit;
      board[bestR][bestC] = 0;
    }
    return false;
  }
  bt(0);
  return board;
}

// Generate a puzzle with a guaranteed unique solution.
// Returns `{ solution, puzzle }` — both are n×n arrays of ints (0 = empty).
export function generatePuzzle(n, difficulty, rng) {
  const { boxR, boxC, clues } = SIZE_CONFIG[n];
  const targetClues = clues[difficulty] ?? clues.medium;
  const solution = generateSolved(n, boxR, boxC, rng);
  const puzzle = deepCopy(solution);
  const positions = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) positions.push([r, c]);
  const order = shuffle(positions, rng);
  let remaining = n * n;
  for (const [r, c] of order) {
    if (remaining <= targetClues) break;
    if (puzzle[r][c] === 0) continue;
    const saved = puzzle[r][c];
    puzzle[r][c] = 0;
    const tmp = deepCopy(puzzle);
    const cnt = countSolutions(tmp, n, boxR, boxC, 2);
    if (cnt !== 1) puzzle[r][c] = saved;
    else remaining--;
  }
  return { solution, puzzle };
}

// Resolve a theme name + custom-symbols string to an array of length N.
// Dedupes and falls back: custom → theme → sassy → digits.
export function pickSymbols(theme, customRaw, n) {
  const custom = (customRaw || '').split(',').map(x => x.trim()).filter(Boolean);
  const base = THEMES[theme] || THEMES.sassy;
  const out = [];
  const push = (x) => { if (x && !out.includes(x)) out.push(x); };
  for (const x of custom)       { push(x); if (out.length === n) return out; }
  for (const x of base)         { push(x); if (out.length === n) return out; }
  for (const x of THEMES.sassy) { push(x); if (out.length === n) return out; }
  for (let i = 1; i <= n; i++)  { push(String(i)); }
  return out.slice(0, n);
}
