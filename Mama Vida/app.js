// ============================================================
// Sassy Sudoku — app shell
// State, rendering, input, dialogs, persistence, boot.
// ============================================================

import {
  SIZE_CONFIG, THEMES, DEV_THEMES, DEFAULT_NOTES,
  deepCopy, mulberry32, fmtTime, todayKey, formatDateKey,
  boxIdx, generatePuzzle, pickSymbols,
} from './engine.js';

// ----- Small DOM helpers -----------------------------------------------------
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ============================================================
// STORAGE
// ============================================================
const LS_GAME     = 'sassy-sudoku-game-v3';
const LS_SETTINGS = 'sassy-sudoku-settings-v3';
const LS_STATS    = 'sassy-sudoku-stats-v2';
const LS_ONBOARD  = 'sassy-sudoku-onboarded-v2';

function defaultSettings() {
  return {
    theme: 'sassy', dark: false,
    maxMistakes: 3, maxHints: 3,
    autoCheck: true, hiRelated: true, hiSame: true, autoRemoveNotes: false,
    sound: false, haptic: true,
    customSymbols: '',
    notes: DEFAULT_NOTES.join('\n'),
    size: 9, difficulty: 'easy',
  };
}
function loadSettings() {
  try { const s = JSON.parse(localStorage.getItem(LS_SETTINGS) || 'null'); if (s) return { ...defaultSettings(), ...s }; } catch {}
  return defaultSettings();
}
function saveSettings(s) { localStorage.setItem(LS_SETTINGS, JSON.stringify(s)); }
function loadStats() {
  try { return JSON.parse(localStorage.getItem(LS_STATS) || 'null') || { best: {}, solved: 0, dailies: {} }; }
  catch { return { best: {}, solved: 0, dailies: {} }; }
}
function saveStats(s) { localStorage.setItem(LS_STATS, JSON.stringify(s)); }

function saveGame() {
  if (!state.board) return;
  const g = {
    size: state.size, difficulty: state.difficulty, theme: state.theme,
    symbols: state.symbols,
    solution: state.solution, given: state.given, board: state.board,
    notes: state.notes.map(row => row.map(s => [...s])),
    hinted: state.hinted,
    mistakes: state.mistakes, hintsUsed: state.hintsUsed,
    maxMistakes: state.maxMistakes, maxHints: state.maxHints,
    score: state.score, elapsed: state.elapsed,
    daily: state.daily,
    history: state.history, future: state.future,
    won: state.won, lost: state.lost, revealed: state.revealed,
  };
  localStorage.setItem(LS_GAME, JSON.stringify(g));
}
function loadGame() {
  try {
    const g = JSON.parse(localStorage.getItem(LS_GAME) || 'null');
    if (!g || !g.board) return null;
    g.notes = g.notes.map(row => row.map(arr => new Set(arr)));
    g.hinted = g.hinted || {};
    g.future = g.future || [];
    return g;
  } catch { return null; }
}
function clearGame() { localStorage.removeItem(LS_GAME); }

// ============================================================
// STATE
// ============================================================
// Cache of weekly-rotated sweet notes fetched from notes.json.
// Filled async on boot; falls back to DEFAULT_NOTES if unreachable.
let rotatedNotesCache = null;
async function loadRotatedNotes() {
  try {
    const resp = await fetch('./notes.json', { cache: 'no-cache' });
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data.notes) && data.notes.length) rotatedNotesCache = data.notes;
    }
  } catch { /* offline — stick with DEFAULT_NOTES */ }
}

const state = {
  size: 9, difficulty: 'easy', theme: 'sassy',
  symbols: THEMES.sassy,
  solution: null, given: null, board: null,
  notes: null, hinted: {},
  selected: null, pencilMode: false,
  mistakes: 0, maxMistakes: 3,
  hintsUsed: 0, maxHints: 3,
  score: 0, elapsed: 0,
  running: false, paused: false, won: false, lost: false, revealed: false,
  history: [], future: [],
  daily: null, settings: null,
  _timerId: null, _lastTick: 0,
};

// ============================================================
// AUDIO & HAPTICS
// ============================================================
let audioCtx = null;
function ensureAudio() {
  if (!state.settings || !state.settings.sound) return null;
  if (audioCtx) return audioCtx;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { audioCtx = null; }
  return audioCtx;
}
function beep(freq = 440, dur = 0.06, type = 'sine', gain = 0.05) {
  const ctx = ensureAudio(); if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.value = 0;
  o.connect(g); g.connect(ctx.destination);
  const t0 = ctx.currentTime;
  g.gain.linearRampToValueAtTime(gain, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function playSound(kind) {
  if (!state.settings || !state.settings.sound) return;
  switch (kind) {
    case 'place':  beep(620, 0.05, 'sine', 0.05); break;
    case 'wrong':  beep(180, 0.1, 'sawtooth', 0.05); break;
    case 'erase':  beep(320, 0.04, 'triangle', 0.04); break;
    case 'hint':   beep(520, 0.05, 'sine', 0.05); setTimeout(() => beep(780, 0.06, 'sine', 0.05), 70); break;
    case 'win':    [523, 659, 784].forEach((f, i) => setTimeout(() => beep(f, 0.12, 'sine', 0.06), i * 110)); break;
  }
}
function vibrate(p) {
  if (!state.settings || !state.settings.haptic) return;
  if (reducedMotion()) return;
  if (navigator.vibrate) navigator.vibrate(p);
}
const hapticTap  = () => vibrate(10);
const hapticOops = () => vibrate([18, 30, 18]);

// ============================================================
// GAME ACTIONS
// ============================================================
function newGame({ size, difficulty, theme, daily = null, seed = null } = {}) {
  const s = state.settings;
  size       = size       ?? s.size;
  difficulty = difficulty ?? s.difficulty;
  theme      = theme      ?? s.theme;
  const rng = mulberry32(seed ?? (Math.random() * 2 ** 31 | 0));
  const { solution, puzzle } = generatePuzzle(size, difficulty, rng);
  const chosen = pickSymbols(theme, s.customSymbols, size);

  Object.assign(state, {
    size, difficulty, theme, symbols: chosen,
    solution, given: deepCopy(puzzle), board: deepCopy(puzzle),
    notes: Array.from({ length: size }, () => Array.from({ length: size }, () => new Set())),
    hinted: {}, selected: null, pencilMode: false,
    mistakes: 0, maxMistakes: s.maxMistakes | 0,
    hintsUsed: 0, maxHints: s.maxHints | 0,
    score: 0, elapsed: 0,
    running: true, paused: false, won: false, lost: false, revealed: false,
    history: [], future: [], daily,
  });
  s.size = size; s.difficulty = difficulty; s.theme = theme;
  saveSettings(s);

  hidePauseVeil();
  hideWelcome();
  closeAllDialogs();
  startTimer();
  renderAll();
  saveGame();
}

function snapshotCurrent() {
  return {
    board: deepCopy(state.board),
    notes: state.notes.map(row => row.map(s => [...s])),
    hinted: { ...state.hinted },
    given: deepCopy(state.given),
    mistakes: state.mistakes,
    hintsUsed: state.hintsUsed,
    score: state.score,
  };
}
function applySnapshot(h) {
  state.board = h.board;
  state.notes = h.notes.map(row => row.map(arr => new Set(arr)));
  state.hinted = h.hinted || {};
  state.given = h.given;
  state.mistakes = h.mistakes;
  state.hintsUsed = h.hintsUsed;
  state.score = h.score;
}
function pushHistory() {
  state.history.push(snapshotCurrent());
  if (state.history.length > 300) state.history.shift();
  state.future = [];
}
function undo() {
  if (!state.history.length) return;
  state.future.push(snapshotCurrent());
  applySnapshot(state.history.pop());
  renderAll(); saveGame();
}
function redo() {
  if (!state.future.length) return;
  state.history.push(snapshotCurrent());
  applySnapshot(state.future.pop());
  renderAll(); saveGame();
}

function selectCell(r, c) {
  if (state.paused) return;
  if (state.selected && state.selected.r === r && state.selected.c === c && !state.given[r][c]) {
    state.pencilMode = !state.pencilMode;
    renderActions();
    return;
  }
  state.selected = { r, c };
  renderBoard();
  renderKeypad();
}

function placeValue(v) {
  if (state.paused || state.won || state.lost) return;
  if (!state.selected) { toast('Pick a cell'); return; }
  const { r, c } = state.selected;
  if (state.given[r][c]) { hapticOops(); return; }
  if (state.pencilMode) {
    pushHistory();
    const set = state.notes[r][c];
    if (set.has(v)) set.delete(v); else set.add(v);
    state.board[r][c] = 0;
    hapticTap();
    renderBoard(); renderKeypad(); saveGame();
    return;
  }
  if (state.board[r][c] === v) return;
  pushHistory();
  state.board[r][c] = v;
  state.notes[r][c].clear();
  if (state.settings.autoRemoveNotes) autoStripNotes(r, c, v);

  const isRight = state.solution[r][c] === v;
  if (!isRight) {
    state.mistakes++;
    state.score = Math.max(0, state.score - 5);
    flashError(r, c);
    playSound('wrong'); hapticOops();
    if (state.maxMistakes > 0 && state.mistakes >= state.maxMistakes) {
      renderAll();
      loseGame();
      return;
    }
  } else {
    state.score += 10;
    flashCell(r, c);
    playSound('place'); hapticTap();
  }
  renderAll();
  saveGame();
  if (isBoardSolved()) winGame();
}

function eraseCell() {
  if (state.paused || state.won || state.lost) return;
  if (!state.selected) return;
  const { r, c } = state.selected;
  if (state.given[r][c]) return;
  if (state.board[r][c] === 0 && state.notes[r][c].size === 0) return;
  pushHistory();
  state.board[r][c] = 0;
  state.notes[r][c].clear();
  playSound('erase'); hapticTap();
  renderAll(); saveGame();
}

function autoStripNotes(r, c, v) {
  const n = state.size;
  const { boxR, boxC } = SIZE_CONFIG[n];
  const r0 = Math.floor(r / boxR) * boxR, c0 = Math.floor(c / boxC) * boxC;
  for (let i = 0; i < n; i++) { state.notes[r][i].delete(v); state.notes[i][c].delete(v); }
  for (let rr = r0; rr < r0 + boxR; rr++) for (let cc = c0; cc < c0 + boxC; cc++) state.notes[rr][cc].delete(v);
}

function useHint() {
  if (state.paused || state.won || state.lost) return;
  if (state.maxHints > 0 && state.hintsUsed >= state.maxHints) { toast('No hints left'); return; }
  let target = null;
  if (state.selected) {
    const { r, c } = state.selected;
    if (!state.given[r][c] && state.board[r][c] !== state.solution[r][c]) target = { r, c };
  }
  if (!target) {
    const options = [];
    for (let r = 0; r < state.size; r++) for (let c = 0; c < state.size; c++)
      if (!state.given[r][c] && state.board[r][c] !== state.solution[r][c]) options.push({ r, c });
    if (!options.length) return;
    target = options[Math.floor(Math.random() * options.length)];
  }
  pushHistory();
  const v = state.solution[target.r][target.c];
  state.board[target.r][target.c] = v;
  state.given[target.r][target.c] = v;
  state.hinted[target.r + ',' + target.c] = true;
  state.notes[target.r][target.c].clear();
  state.hintsUsed++;
  playSound('hint'); hapticTap();
  renderAll(); saveGame();
  setTimeout(() => flashCell(target.r, target.c), 0);
  if (isBoardSolved()) winGame();
}

function revealSolution() {
  state.revealed = true;
  for (let r = 0; r < state.size; r++) for (let c = 0; c < state.size; c++)
    state.board[r][c] = state.solution[r][c];
  state.lost = true;
  stopTimer();
  $('#loseDlg').close();
  renderAll(); saveGame();
}
function giveOneMoreLife() {
  if (!state.lost) return;
  state.lost = false;
  state.maxMistakes = state.maxMistakes > 0 ? state.maxMistakes + 1 : 0;
  $('#loseDlg').close();
  startTimer();
  renderAll(); saveGame();
}
function isBoardSolved() {
  for (let r = 0; r < state.size; r++) for (let c = 0; c < state.size; c++)
    if (state.board[r][c] !== state.solution[r][c]) return false;
  return true;
}
function progressPct() {
  const n = state.size;
  let correct = 0, total = n * n;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
    if (state.board[r][c] === state.solution[r][c]) correct++;
  return Math.round((correct / total) * 100);
}

function winGame() {
  if (state.won) return;
  state.won = true;
  stopTimer();
  const timeBonus = Math.max(0, 600 - Math.floor(state.elapsed));
  const noMistakeBonus = state.maxMistakes > 0 ? Math.max(0, (state.maxMistakes - state.mistakes) * 20) : 0;
  state.score += timeBonus + noMistakeBonus;
  const stats = loadStats();
  stats.solved = (stats.solved || 0) + 1;
  const key = `${state.size}-${state.difficulty}`;
  if (stats.best[key] == null || state.elapsed < stats.best[key]) stats.best[key] = Math.floor(state.elapsed);
  if (state.daily) stats.dailies[state.daily] = { time: Math.floor(state.elapsed), mistakes: state.mistakes, hints: state.hintsUsed };
  saveStats(stats);
  saveGame();
  renderAll();
  playSound('win');
  vibrate([20, 40, 20]);
  setTimeout(() => { showWin(); if (!reducedMotion()) celebrate(); }, 320);
}

function loseGame() {
  state.lost = true;
  stopTimer();
  saveGame();
  renderAll();
  hapticOops();
  $('#loseDlg').showModal();
}

// ============================================================
// RENDER
// ============================================================
function renderAll() { renderHUD(); renderBoard(); renderKeypad(); renderActions(); renderProgress(); updateDevBtn(); }

function renderHUD() {
  $('#hudMode').textContent = `${state.size} × ${state.size} · ${state.difficulty}${state.daily ? ' · daily' : ''}`;
  $('#hudTime').textContent = fmtTime(state.elapsed);
  const mist = $('#hudMistakes');
  if (state.maxMistakes > 0) {
    mist.textContent = `${state.mistakes}/${state.maxMistakes}`;
    mist.classList.toggle('warn', state.mistakes >= state.maxMistakes - 1);
  } else {
    mist.textContent = `${state.mistakes}`;
    mist.classList.remove('warn');
  }
  $('#hintCount').textContent = state.maxHints > 0 ? ` ${Math.max(0, state.maxHints - state.hintsUsed)}` : ' ∞';
  $('#brandSub').textContent = state.daily ? `Daily · ${formatDateKey(state.daily)}` : 'A sudoku, for you';
}
function renderProgress() { $('#progressFill').style.width = `${progressPct()}%`; }

function renderBoard() {
  const n = state.size;
  const { boxR, boxC } = SIZE_CONFIG[n];
  const board = $('#board');
  board.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
  board.style.gridTemplateRows    = `repeat(${n}, 1fr)`;
  board.className = `board sz${n} theme-${state.theme}`;

  let relR = -1, relC = -1, relBox = -1, sameVal = 0;
  if (state.selected) {
    relR = state.selected.r; relC = state.selected.c;
    relBox = boxIdx(relR, relC, boxR, boxC, n);
    sameVal = state.board[relR][relC] || 0;
  }

  board.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const div = document.createElement('div');
      div.className = 'cell';
      if (c > 0 && c % boxC === 0) div.classList.add('bl');
      if (r > 0 && r % boxR === 0) div.classList.add('bt');

      const v = state.board[r][c];
      const given = !!state.given[r][c];
      const wasHinted = state.hinted[r + ',' + c];
      const isRevealedCell = state.revealed && !given && !wasHinted;

      if (wasHinted)      div.classList.add('hinted');
      else if (given)     div.classList.add('given');
      if (isRevealedCell) div.classList.add('revealed');

      if (state.settings.hiRelated && state.selected) {
        if (r === relR || c === relC || boxIdx(r, c, boxR, boxC, n) === relBox)
          div.classList.add('related');
      }
      if (state.settings.hiSame && sameVal && v === sameVal && !(r === relR && c === relC))
        div.classList.add('same-value');
      if (state.selected && state.selected.r === r && state.selected.c === c)
        div.classList.add('selected');

      if (v && !given) {
        const wrongByCheck = state.settings.autoCheck && v !== state.solution[r][c];
        const conflict     = hasConflict(r, c, v);
        if (wrongByCheck || conflict) { div.classList.add('err'); div.classList.add('err-bg'); }
      }

      div.dataset.r = r; div.dataset.c = c;
      div.setAttribute('role', 'gridcell');
      div.setAttribute('aria-label', `row ${r + 1} col ${c + 1}${v ? ' value ' + state.symbols[v - 1] : ''}`);

      if (v) {
        const s = document.createElement('span');
        s.className = 'val';
        s.textContent = state.symbols[v - 1];
        div.appendChild(s);
      } else if (state.notes[r][c].size) {
        const notes = document.createElement('div');
        notes.className = 'notes';
        notes.style.gridTemplateColumns = `repeat(${boxC}, 1fr)`;
        notes.style.gridTemplateRows    = `repeat(${boxR}, 1fr)`;
        for (let k = 1; k <= n; k++) {
          const span = document.createElement('span');
          span.textContent = state.notes[r][c].has(k) ? state.symbols[k - 1] : '';
          notes.appendChild(span);
        }
        div.appendChild(notes);
      }
      frag.appendChild(div);
    }
  }
  board.appendChild(frag);
}
function hasConflict(r, c, v) {
  const n = state.size;
  const { boxR, boxC } = SIZE_CONFIG[n];
  for (let i = 0; i < n; i++) {
    if (i !== c && state.board[r][i] === v) return true;
    if (i !== r && state.board[i][c] === v) return true;
  }
  const r0 = Math.floor(r / boxR) * boxR, c0 = Math.floor(c / boxC) * boxC;
  for (let rr = r0; rr < r0 + boxR; rr++) for (let cc = c0; cc < c0 + boxC; cc++)
    if ((rr !== r || cc !== c) && state.board[rr][cc] === v) return true;
  return false;
}

function renderKeypad() {
  const n = state.size;
  const kp = $('#keypad');
  kp.className = `keypad theme-${state.theme}`;
  kp.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
  const counts = new Array(n + 1).fill(0);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (state.board[r][c]) counts[state.board[r][c]]++;
  kp.innerHTML = '';
  for (let v = 1; v <= n; v++) {
    const b = document.createElement('button');
    b.className = 'key';
    const remaining = n - counts[v];
    if (remaining <= 0) b.classList.add('done');
    b.innerHTML = `${state.symbols[v - 1]}<span class="count">${Math.max(0, remaining)}</span>`;
    b.dataset.v = v;
    b.addEventListener('click', () => placeValue(v));
    kp.appendChild(b);
  }
}

function renderActions() {
  $('#actPencil').classList.toggle('active', state.pencilMode);
  const frozen = state.won || state.lost;
  $('#actUndo').toggleAttribute('disabled', state.history.length === 0 || frozen);
  $('#actRedo').toggleAttribute('disabled', state.future.length === 0 || frozen);
  $('#actErase').toggleAttribute('disabled', frozen);
  const noHintsLeft = state.maxHints > 0 && state.hintsUsed >= state.maxHints;
  $('#actHint').toggleAttribute('disabled', noHintsLeft || frozen);
}

function updateDevBtn() {
  const btn = $('#btnCycleTheme');
  if (!btn) return;
  const isDev = DEV_THEMES.includes(state.theme);
  btn.textContent = isDev ? `dev · ${state.theme} ↻` : 'dev · cycle ↻';
}
function cycleDevTheme() {
  const cur = DEV_THEMES.indexOf(state.theme);
  const next = DEV_THEMES[(cur + 1) % DEV_THEMES.length];
  state.theme = next;
  state.symbols = pickSymbols(next, state.settings.customSymbols, state.size);
  state.settings.theme = next;
  saveSettings(state.settings);
  renderAll();
  saveGame();
  toast(next);
}

function flashCell(r, c) {
  if (reducedMotion()) return;
  const el = $(`.cell[data-r="${r}"][data-c="${c}"]`);
  if (el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 280); }
}
function flashError(r, c) {
  if (reducedMotion()) return;
  const el = $(`.cell[data-r="${r}"][data-c="${c}"]`);
  if (el) { el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 420); }
}

// ============================================================
// TIMER
// ============================================================
function startTimer() {
  stopTimer();
  if (state.won || state.lost || state.paused) return;
  state.running = true;
  state._lastTick = performance.now();
  state._timerId = setInterval(() => {
    if (!state.running || state.paused) return;
    const now = performance.now();
    const dt = (now - state._lastTick) / 1000;
    state._lastTick = now;
    state.elapsed += dt;
    renderHUD();
  }, 1000);
}
function stopTimer() {
  state.running = false;
  if (state._timerId) { clearInterval(state._timerId); state._timerId = null; }
}
function togglePause() {
  if (state.won || state.lost) return;
  if (state.paused) resumeGame();
  else pauseGame();
}
function pauseGame()  { if (state.paused) return; state.paused = true;  stopTimer(); showPauseVeil(); }
function resumeGame() { state.paused = false; hidePauseVeil(); startTimer(); }
function showPauseVeil() { $('#pauseVeil').classList.add('on'); }
function hidePauseVeil() { $('#pauseVeil').classList.remove('on'); }

// ============================================================
// TOAST / CELEBRATE
// ============================================================
function toast(msg) {
  const host = $('#toastHost');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  host.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .25s ease, transform .25s ease';
    t.style.opacity = '0'; t.style.transform = 'translateY(6px)';
    setTimeout(() => t.remove(), 260);
  }, 1500);
}
function celebrate() {
  const symbols = ['💋', '🌹', '✦'];
  const el = document.createElement('div');
  el.className = 'celebrate';
  for (let i = 0; i < 10; i++) {
    const s = document.createElement('span');
    s.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    s.style.left = (Math.random() * 100) + 'vw';
    s.style.animationDelay = (Math.random() * 0.8) + 's';
    s.style.fontSize = (14 + Math.random() * 8) + 'px';
    el.appendChild(s);
  }
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

// ============================================================
// DIALOGS
// ============================================================
function showWin() {
  $('#winTime').textContent  = fmtTime(state.elapsed);
  $('#winMist').textContent  = state.maxMistakes > 0 ? `${state.mistakes}/${state.maxMistakes}` : String(state.mistakes);
  $('#winHints').textContent = state.maxHints > 0 ? `${state.hintsUsed}/${state.maxHints}` : String(state.hintsUsed);
  $('#winSub').textContent   = state.daily
    ? `${state.size} × ${state.size} · daily ${formatDateKey(state.daily)}`
    : `${state.size} × ${state.size} · ${state.difficulty}`;
  // Priority: user's custom notes (Settings) > weekly-rotated pool (notes.json) > built-in defaults.
  const custom = (state.settings.notes || '').split('\n').map(x => x.trim()).filter(Boolean);
  const pool = custom.length ? custom
             : (rotatedNotesCache && rotatedNotesCache.length ? rotatedNotesCache : DEFAULT_NOTES);
  $('#winNote').textContent = pool[Math.floor(Math.random() * pool.length)];
  const stats = loadStats();
  const key = `${state.size}-${state.difficulty}`;
  $('#winBest').textContent = stats.best[key] != null ? `Best · ${fmtTime(stats.best[key])}` : '';
  $('#winDlg').showModal();
}
function openStats() {
  const stats = loadStats();
  $('#streakNum').textContent = getDailyStreak();
  $('#statSolved').textContent = stats.solved || 0;
  $('#statDailies').textContent = Object.keys(stats.dailies || {}).length;

  const grid = $('#bestGrid');
  grid.innerHTML = '';
  const show = [
    { s: 9, d: 'easy' }, { s: 9, d: 'medium' }, { s: 9, d: 'hard' },
    { s: 6, d: 'easy' }, { s: 6, d: 'medium' }, { s: 6, d: 'hard' },
    { s: 4, d: 'easy' }, { s: 4, d: 'medium' }, { s: 4, d: 'hard' },
  ];
  for (const m of show) {
    const key = `${m.s}-${m.d}`;
    const t = stats.best[key];
    const el = document.createElement('div');
    el.className = 'mode-card';
    el.innerHTML = `<div class="m-label">${m.s}×${m.s} · ${m.d.slice(0, 4)}</div><div class="m-value">${t != null ? fmtTime(t) : '—'}</div>`;
    grid.appendChild(el);
  }
  const week = $('#weekGrid');
  week.innerHTML = '';
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const key = todayKey(d);
    const did = !!(stats.dailies || {})[key];
    const el = document.createElement('div');
    el.className = 'day' + (did ? ' done' : '') + (i === 0 ? ' today' : '');
    el.textContent = d.getDate();
    el.title = key;
    week.appendChild(el);
  }
  $('#statsDlg').showModal();
}
function getDailyStreak() {
  const stats = loadStats();
  const dailies = stats.dailies || {};
  let streak = 0;
  const d = new Date();
  if (!dailies[todayKey(d)]) d.setDate(d.getDate() - 1);
  while (dailies[todayKey(d)]) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}
function confirmDialog({ title = 'Are you sure?', msg = '', yes = 'Yes', no = 'Cancel' } = {}) {
  return new Promise(resolve => {
    $('#confirmTitle').textContent = title;
    $('#confirmMsg').textContent = msg;
    $('#confirmYes').textContent = yes;
    $('#confirmNo').textContent = no;
    const dlg = $('#confirmDlg');
    const onYes = () => { cleanup(); resolve(true); };
    const onNo  = () => { cleanup(); resolve(false); };
    const cleanup = () => {
      $('#confirmYes').removeEventListener('click', onYes);
      $('#confirmNo').removeEventListener('click', onNo);
      dlg.close();
    };
    $('#confirmYes').addEventListener('click', onYes);
    $('#confirmNo').addEventListener('click', onNo);
    dlg.showModal();
  });
}
function showWelcome(g) {
  const mm = Math.floor(g.elapsed / 60);
  const ss = String(Math.floor(g.elapsed % 60)).padStart(2, '0');
  const progress = Math.round(
    (g.board.flat().filter((v, i) => v && v === g.solution[Math.floor(i / g.size)][i % g.size]).length / (g.size * g.size)) * 100
  );
  $('#welcomeText').textContent = `Picking up where you left off — ${g.size}×${g.size} ${g.difficulty}, ${mm}:${ss}, ${progress}%`;
  $('#welcomeBanner').classList.add('on');
  setTimeout(hideWelcome, 5500);
}
function hideWelcome() { $('#welcomeBanner').classList.remove('on'); }
function closeAllDialogs() { $$('dialog').forEach(d => { if (d.open) d.close(); }); }

// ============================================================
// KEYBOARD
// ============================================================
function onKey(e) {
  if (e.target && e.target.matches && e.target.matches('input, textarea')) return;
  if ($$('dialog').some(d => d.open)) return;
  const { size, selected } = state;
  if (e.key === 'Escape') { if (state.paused) resumeGame(); return; }
  if (e.key === 'p' || e.key === 'P') { state.pencilMode = !state.pencilMode; renderActions(); return; }
  if (e.key === 'Z') { redo(); return; }
  if (e.key === 'y' || e.key === 'Y') { redo(); return; }
  if (e.key === 'z') { undo(); return; }
  if (e.key === 'h' || e.key === 'H') { useHint(); return; }
  if (e.key === ' ') { togglePause(); e.preventDefault(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace' || e.key === '0') { eraseCell(); e.preventDefault(); return; }
  if (selected) {
    const { r, c } = selected;
    if (e.key === 'ArrowUp')    { if (r > 0)        selectCell(r - 1, c); e.preventDefault(); return; }
    if (e.key === 'ArrowDown')  { if (r < size - 1) selectCell(r + 1, c); e.preventDefault(); return; }
    if (e.key === 'ArrowLeft')  { if (c > 0)        selectCell(r, c - 1); e.preventDefault(); return; }
    if (e.key === 'ArrowRight') { if (c < size - 1) selectCell(r, c + 1); e.preventDefault(); return; }
  } else if (e.key.startsWith('Arrow')) {
    selectCell(0, 0); e.preventDefault(); return;
  }
  const digit = parseInt(e.key, 10);
  if (!isNaN(digit) && digit >= 1 && digit <= size) placeValue(digit);
}

// ============================================================
// UI WIRING
// ============================================================
function wireBoardEvents() {
  $('#board').addEventListener('click', (e) => {
    if (state.paused) return;
    const cell = e.target.closest('.cell');
    if (!cell) return;
    selectCell(+cell.dataset.r, +cell.dataset.c);
  });
}
function inProgress() { return state.board && !state.won && !state.lost && state.elapsed > 2; }

function wireButtons() {
  $('#btnTheme').addEventListener('click', toggleTheme);
  const devBtn = $('#btnCycleTheme');
  if (devBtn) devBtn.addEventListener('click', cycleDevTheme);
  $('#btnPause').addEventListener('click', togglePause);

  $('#btnNew').addEventListener('click', async () => {
    if (inProgress()) {
      const ok = await confirmDialog({ title: 'Start a new game?', msg: 'Your current puzzle will be discarded.', yes: 'New game', no: 'Keep playing' });
      if (!ok) return;
    }
    openMenu();
  });
  $('#btnSettings').addEventListener('click', openSettings);
  $('#btnStats').addEventListener('click', openStats);
  $('#btnDaily').addEventListener('click', async () => {
    const already = (loadStats().dailies || {})[todayKey()];
    if (inProgress()) {
      const ok = await confirmDialog({
        title: 'Start daily?',
        msg: already ? "You've already played today — this will overwrite it." : 'Your current puzzle will be discarded.',
        yes: 'Start daily', no: 'Keep playing'
      });
      if (!ok) return;
    }
    startDaily();
  });
  $('#btnShare').addEventListener('click', shareCurrent);

  $('#actPencil').addEventListener('click', () => { state.pencilMode = !state.pencilMode; renderActions(); });
  $('#actUndo').addEventListener('click', undo);
  $('#actRedo').addEventListener('click', redo);
  $('#actErase').addEventListener('click', eraseCell);
  $('#actHint').addEventListener('click', useHint);

  $('#pauseResume').addEventListener('click', resumeGame);

  $('#onboardStart').addEventListener('click', () => {
    localStorage.setItem(LS_ONBOARD, '1');
    $('#onboardDlg').close();
  });

  $('#winNext').addEventListener('click',   () => { $('#winDlg').close(); newGame({}); });
  $('#winReview').addEventListener('click', () => { $('#winDlg').close(); });
  $('#winShare').addEventListener('click',  shareCurrent);

  $('#loseMore').addEventListener('click', giveOneMoreLife);
  $('#loseReveal').addEventListener('click', revealSolution);
  $('#loseAgain').addEventListener('click', () => { $('#loseDlg').close(); newGame({}); });

  $('#setSave').addEventListener('click', () => {
    state.settings.maxMistakes     = +selectedSeg('setMistakes', '3');
    state.settings.maxHints        = +selectedSeg('setHints', '3');
    state.settings.sound           = $('#setSound').checked;
    state.settings.haptic          = $('#setHaptic').checked;
    state.settings.autoCheck       = $('#setAuto').checked;
    state.settings.hiRelated       = $('#setHiRel').checked;
    state.settings.hiSame          = $('#setHiSame').checked;
    state.settings.autoRemoveNotes = $('#setAutoNotes').checked;
    state.settings.customSymbols   = $('#setCustom').value.trim();
    state.settings.notes           = $('#setNotes').value;
    saveSettings(state.settings);
    state.symbols     = pickSymbols(state.theme, state.settings.customSymbols, state.size);
    state.maxMistakes = state.settings.maxMistakes;
    state.maxHints    = state.settings.maxHints;
    $('#setDlg').close();
    renderAll();
    toast('Saved');
  });
  $('#btnResetGame').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Reset current game?', msg: 'This throws away the puzzle in progress.', yes: 'Reset', no: 'Cancel' });
    if (!ok) return;
    $('#setDlg').close();
    clearGame();
    newGame({});
  });
  $('#btnResetStats').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Reset stats?', msg: 'Best times, streak, daily history — all gone.', yes: 'Reset stats', no: 'Cancel' });
    if (!ok) return;
    localStorage.removeItem(LS_STATS);
    toast('Stats cleared');
  });
  $('#menuStart').addEventListener('click', () => {
    const size  = +selectedSeg('menuSize', '9');
    const diff  = selectedSeg('menuDiff', 'easy');
    const theme = selectedSeg('menuTheme', 'sassy');
    $('#menuDlg').close();
    newGame({ size, difficulty: diff, theme });
  });

  $$('dialog').forEach(dlg => {
    dlg.addEventListener('click', (e) => {
      if (e.target.matches('[data-close]')) dlg.close();
    });
  });
  ['menuSize', 'menuDiff', 'menuTheme', 'setMistakes', 'setHints'].forEach(id => {
    const el = $('#' + id);
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn || !btn.dataset.v) return;
      [...el.children].forEach(c => c.classList.remove('on'));
      btn.classList.add('on');
    });
  });
  $('#welcomeClose').addEventListener('click', hideWelcome);
}

function selectedSeg(id, fallback) { const b = $('#' + id + ' .on'); return b ? b.dataset.v : fallback; }
function setSeg(id, v) { const el = $('#' + id); [...el.children].forEach(c => c.classList.toggle('on', c.dataset.v === v)); }

function openMenu() {
  setSeg('menuSize', String(state.settings.size));
  setSeg('menuDiff', state.settings.difficulty);
  setSeg('menuTheme', state.settings.theme);
  $('#menuDlg').showModal();
}
function openSettings() {
  setSeg('setMistakes', String(state.settings.maxMistakes));
  setSeg('setHints',    String(state.settings.maxHints));
  $('#setSound').checked      = state.settings.sound;
  $('#setHaptic').checked     = state.settings.haptic;
  $('#setAuto').checked       = state.settings.autoCheck;
  $('#setHiRel').checked      = state.settings.hiRelated;
  $('#setHiSame').checked     = state.settings.hiSame;
  $('#setAutoNotes').checked  = state.settings.autoRemoveNotes;
  $('#setCustom').value       = state.settings.customSymbols;
  $('#setNotes').value        = state.settings.notes;
  $('#setDlg').showModal();
}
function toggleTheme() {
  state.settings.dark = !state.settings.dark;
  document.documentElement.setAttribute('data-theme', state.settings.dark ? 'dark' : '');
  $('#btnTheme').textContent = state.settings.dark ? '☀️' : '🌙';
  saveSettings(state.settings);
}
async function startDaily() {
  const key = todayKey();
  // Try curated puzzle from dailies.json (generated by Actions cron).
  try {
    const resp = await fetch('./dailies.json', { cache: 'no-cache' });
    if (resp.ok) {
      const data = await resp.json();
      const p = data.puzzles && data.puzzles[key];
      if (p && p.puzzle && p.solution) {
        loadCuratedDaily(p, key);
        return;
      }
    }
  } catch { /* offline or file missing — fall through to seed generation */ }
  // Fallback: seed from date (same result for everyone, same day).
  const seed = parseInt(key, 10);
  newGame({ size: 9, difficulty: 'medium', theme: state.settings.theme, daily: key, seed });
}

function loadCuratedDaily(p, key) {
  const s = state.settings;
  const n = p.size;
  const solution = [], puzzle = [];
  for (let r = 0; r < n; r++) {
    puzzle.push(p.puzzle.slice(r * n, r * n + n));
    solution.push(p.solution.slice(r * n, r * n + n));
  }
  const chosen = pickSymbols(s.theme, s.customSymbols, n);
  Object.assign(state, {
    size: n, difficulty: p.difficulty, theme: s.theme, symbols: chosen,
    solution, given: deepCopy(puzzle), board: deepCopy(puzzle),
    notes: Array.from({ length: n }, () => Array.from({ length: n }, () => new Set())),
    hinted: {}, selected: null, pencilMode: false,
    mistakes: 0, maxMistakes: s.maxMistakes | 0,
    hintsUsed: 0, maxHints: s.maxHints | 0,
    score: 0, elapsed: 0,
    running: true, paused: false, won: false, lost: false, revealed: false,
    history: [], future: [], daily: key,
  });
  hidePauseVeil();
  hideWelcome();
  closeAllDialogs();
  startTimer();
  renderAll();
  saveGame();
}
function shareCurrent() {
  if (!state.given) return;
  const data = { s: state.size, d: state.difficulty, t: state.theme, g: state.given.flat(), sol: state.solution.flat() };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  const url = `${location.origin}${location.pathname}#p=${encoded}`;
  const msg = state.won ? `Solved in ${fmtTime(state.elapsed)}` : 'A sudoku for you';
  if (navigator.share) navigator.share({ title: 'Sudoku', text: msg, url }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast('Link copied'));
  else prompt('Copy this link:', url);
}
function tryLoadShared() {
  if (!location.hash.startsWith('#p=')) return false;
  try {
    const raw = location.hash.slice(3);
    const data = JSON.parse(decodeURIComponent(escape(atob(raw))));
    const n = data.s;
    const given = [], solution = [];
    for (let r = 0; r < n; r++) {
      given.push(data.g.slice(r * n, r * n + n));
      solution.push(data.sol.slice(r * n, r * n + n));
    }
    Object.assign(state, {
      size: n, difficulty: data.d, theme: data.t,
      symbols: pickSymbols(data.t, state.settings.customSymbols, n),
      solution, given: deepCopy(given), board: deepCopy(given),
      notes: Array.from({ length: n }, () => Array.from({ length: n }, () => new Set())),
      hinted: {}, selected: null, pencilMode: false,
      mistakes: 0, hintsUsed: 0,
      maxMistakes: state.settings.maxMistakes, maxHints: state.settings.maxHints,
      score: 0, elapsed: 0,
      won: false, lost: false, revealed: false, paused: false,
      history: [], future: [], daily: null,
    });
    history.replaceState(null, '', location.pathname);
    startTimer();
    renderAll();
    toast('Shared puzzle loaded');
    return true;
  } catch (e) { console.warn('[sudoku] invalid share url', e); return false; }
}

// ============================================================
// SERVICE WORKER (offline-first)
// ============================================================
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Only register over https / localhost (SW requires secure context)
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.info('[sudoku] service worker failed to register:', err.message);
    });
  });
}

// ============================================================
// BOOT
// ============================================================
function boot() {
  state.settings = loadSettings();
  document.documentElement.setAttribute('data-theme', state.settings.dark ? 'dark' : '');
  $('#btnTheme').textContent = state.settings.dark ? '☀️' : '🌙';

  wireBoardEvents();
  wireButtons();
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopTimer();
    else if (!state.won && !state.lost && !state.paused) startTimer();
  });

  const onboarded = localStorage.getItem(LS_ONBOARD);
  if (tryLoadShared()) { saveGame(); registerServiceWorker(); return; }

  const saved = loadGame();
  if (saved && !saved.won && !boardEquals(saved.board, saved.solution)) {
    Object.assign(state, {
      size: saved.size, difficulty: saved.difficulty, theme: saved.theme,
      symbols: saved.symbols,
      solution: saved.solution, given: saved.given, board: saved.board,
      notes: saved.notes, hinted: saved.hinted || {},
      mistakes: saved.mistakes, hintsUsed: saved.hintsUsed,
      maxMistakes: saved.maxMistakes ?? state.settings.maxMistakes,
      maxHints:    saved.maxHints    ?? state.settings.maxHints,
      score: saved.score, elapsed: saved.elapsed,
      daily: saved.daily,
      history: saved.history || [], future: saved.future || [],
      won: false, lost: saved.lost || false, revealed: saved.revealed || false,
      paused: false, selected: null,
    });
    startTimer();
    renderAll();
    if (saved.elapsed > 30) showWelcome(saved);
  } else {
    newGame({});
  }
  if (!onboarded) setTimeout(() => $('#onboardDlg').showModal(), 350);
  registerServiceWorker();
  // Fire-and-forget: fetch this week's rotated notes so the first win has them.
  loadRotatedNotes();
}
function boardEquals(a, b) {
  if (!a || !b) return false;
  for (let r = 0; r < a.length; r++) for (let c = 0; c < a.length; c++)
    if (a[r][c] !== b[r][c]) return false;
  return true;
}

window.addEventListener('load', boot);
