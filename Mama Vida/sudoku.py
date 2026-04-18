import streamlit as st
import random
import copy
from typing import List, Optional, Tuple

# -------------------------------
# PAGE CONFIG & THEME
# -------------------------------
st.set_page_config(page_title="Sassy Sudoku", page_icon="💋", layout="centered")

# Hot red glow CSS + subtle animations
st.markdown(
    """
    <style>
      @keyframes glowPulse {
        0% { box-shadow: 0 0 8px rgba(255,0,64,0.5); }
        50% { box-shadow: 0 0 20px rgba(255,0,64,0.85); }
        100% { box-shadow: 0 0 8px rgba(255,0,64,0.5); }
      }
      .sassy-title h1, .sassy-title p {
        text-align: center !important;
      }
      .sassy-title h1 {
        color: #ff1644 !important;
        text-shadow: 0 0 10px rgba(255,0,64,0.6);
        animation: glowPulse 2.2s infinite ease-in-out;
        letter-spacing: 0.5px;
      }
      .sassy-pill {
        display:inline-block; padding:6px 12px; border-radius:999px;
        background: linear-gradient(90deg, #ff1644 0%, #ff4d6d 60%, #ff1644 100%);
        color:white; font-weight:600; box-shadow: 0 6px 18px rgba(255,0,64,0.35);
      }
      .sassy-box {
        border-radius: 14px; border: 1px solid rgba(255,0,64,0.25);
        padding: 10px 14px; background: rgba(255,0,64,0.06);
      }
      .sassy-picker .stButton>button, .sassy-grid .stButton>button, .sassy-ctrl .stButton>button {
        border-radius: 12px; border: 1px solid rgba(255,0,64,0.25);
        background: white; transition: transform .05s ease, box-shadow .1s ease;
        box-shadow: 0 6px 14px rgba(255,0,64,0.12);
      }
      .sassy-picker .stButton>button:hover, .sassy-grid .stButton>button:hover, .sassy-ctrl .stButton>button:hover {
        transform: translateY(-1px) scale(1.015);
        box-shadow: 0 8px 22px rgba(255,0,64,0.25);
      }
      .selected-btn {
        outline: 2px solid #ff1644 !important; 
        box-shadow: 0 0 0 4px rgba(255,0,64,0.18) !important;
      }
      .filled-cell {
        background: #fff5f7 !important;
      }
      .correct-flash {
        animation: glowPulse 0.9s ease-in-out 1;
      }
      .error-text { color:#d7263d; font-weight:600; }
      .success-text { color:#16a34a; font-weight:700; }
      .info-text { color:#ff1644; font-weight:600; }
      /* Metric tweaks */
      [data-testid="stMetricValue"] { color:#ff1644 !important; }
    </style>
    """,
    unsafe_allow_html=True
)

# -------------------------------
# GAME CONSTANTS & HELPERS
# -------------------------------
DEFAULT_ITEMS = [
    "👠","💄","👜","👒","🕶️","👗","💍","👛","👢","💅","👓","🎀","🧣","🧤","🧥","👚"
]

DIFFICULTY_MAP = {
    "Chill (Easy)": 0.30,   # remove ~30% of cells
    "Sassy (Medium)": 0.45, # remove ~45%
    "Fierce (Hard)": 0.60,  # remove ~60%
}

# Suggested subgrid shapes per board size
SUBGRID_MAP = {
    5: None,         # Latin-square mode (no sub-grids)
    6: (2, 3),
    8: (2, 4),
    10: (2, 5),
}

def pick_items(pool: List[str], n: int) -> List[str]:
    """Return exactly n distinct items; pad from DEFAULT_ITEMS if needed."""
    seen = []
    for x in pool:
        if x not in seen:
            seen.append(x)
        if len(seen) == n:
            return seen
    # pad from default if not enough
    for x in DEFAULT_ITEMS:
        if x not in seen:
            seen.append(x)
        if len(seen) == n:
            return seen
    # worst case (shouldn't happen)
    return (seen + DEFAULT_ITEMS)[:n]

def is_valid_partial(grid, r, c, val, n, subgrid: Optional[Tuple[int,int]]) -> bool:
    # row/col
    if val in grid[r]:
        return False
    for rr in range(n):
        if grid[rr][c] == val:
            return False
    # subgrid
    if subgrid:
        br, bc = subgrid
        r0 = (r // br) * br
        c0 = (c // bc) * bc
        for rr in range(r0, r0 + br):
            for cc in range(c0, c0 + bc):
                if grid[rr][cc] == val:
                    return False
    return True

def backtrack_solution(n: int, symbols: List[str], subgrid: Optional[Tuple[int,int]]) -> List[List[Optional[str]]]:
    grid = [[None]*n for _ in range(n)]
    cells = [(r, c) for r in range(n) for c in range(n)]
    # Randomize cell order and symbol order to vary puzzles
    random.shuffle(cells)

    def dfs(i: int) -> bool:
        if i == len(cells):
            return True
        r, c = cells[i]
        order = symbols[:]  # copy
        random.shuffle(order)
        for val in order:
            if is_valid_partial(grid, r, c, val, n, subgrid):
                grid[r][c] = val
                if dfs(i+1):
                    return True
                grid[r][c] = None
        return False

    dfs(0)
    return grid

def make_puzzle_from_solution(solution, remove_fraction: float) -> List[List[Optional[str]]]:
    n = len(solution)
    puzzle = copy.deepcopy(solution)
    total = n * n
    remove_count = int(total * remove_fraction)
    # ensure at least 1 empty
    remove_count = max(1, min(remove_count, total - 1))
    positions = [(r, c) for r in range(n) for c in range(n)]
    random.shuffle(positions)
    for k in range(remove_count):
        r, c = positions[k]
        puzzle[r][c] = None
    return puzzle

def current_conflicts(puzzle, r, c, val, n, subgrid) -> List[str]:
    """Return list of conflict types for assist mode."""
    issues = []
    # row conflict
    if val in puzzle[r]:
        issues.append("row")
    # column conflict
    for rr in range(n):
        if puzzle[rr][c] == val:
            issues.append("column")
            break
    # subgrid conflict
    if subgrid:
        br, bc = subgrid
        r0 = (r // br) * br
        c0 = (c // bc) * bc
        for rr in range(r0, r0 + br):
            for cc in range(c0, c0 + bc):
                if puzzle[rr][cc] == val:
                    issues.append("zone")
                    break
    return issues

# -------------------------------
# STATE MANAGEMENT
# -------------------------------
def init_state():
    if "initialized" not in st.session_state:
        st.session_state.initialized = True
        st.session_state.board_size = 6
        st.session_state.difficulty = "Sassy (Medium)"
        st.session_state.custom_items_raw = ""
        st.session_state.items_pool = DEFAULT_ITEMS[:]
        st.session_state.subgrid = SUBGRID_MAP[6]
        st.session_state.solution = []
        st.session_state.puzzle = []
        st.session_state.original = []
        st.session_state.score = 0
        st.session_state.confidence = 5
        st.session_state.moves = 0
        st.session_state.selected_item = None
        st.session_state.win = False
        st.session_state.game_over = False
        st.session_state.assist = True
        st.session_state.undo_stack = []

def reset_game(new_board_size: Optional[int] = None, new_difficulty: Optional[str] = None):
    if new_board_size:
        st.session_state.board_size = new_board_size
        st.session_state.subgrid = SUBGRID_MAP.get(new_board_size, None)
    if new_difficulty:
        st.session_state.difficulty = new_difficulty

    n = st.session_state.board_size

    # Process custom items
    raw = st.session_state.custom_items_raw.strip()
    user_items = [x.strip() for x in raw.split(",") if x.strip()] if raw else []
    items = pick_items(user_items + st.session_state.items_pool, n)

    # Generate solution and puzzle
    solution = backtrack_solution(n, items, st.session_state.subgrid)
    remove_fraction = DIFFICULTY_MAP[st.session_state.difficulty]
    puzzle = make_puzzle_from_solution(solution, remove_fraction)

    st.session_state.solution = solution
    st.session_state.puzzle = puzzle
    st.session_state.original = copy.deepcopy(puzzle)
    st.session_state.score = 0
    st.session_state.confidence = 5
    st.session_state.moves = 0
    st.session_state.selected_item = None
    st.session_state.win = False
    st.session_state.game_over = False
    st.session_state.undo_stack = []

def push_undo():
    st.session_state.undo_stack.append(copy.deepcopy(st.session_state.puzzle))

def pop_undo():
    if st.session_state.undo_stack:
        st.session_state.puzzle = st.session_state.undo_stack.pop()

# -------------------------------
# ACTIONS
# -------------------------------
def handle_cell_click(r: int, c: int):
    if st.session_state.game_over or st.session_state.win:
        return
    if st.session_state.original[r][c] is not None:
        st.toast("Locked cell (original).", icon="🔒")
        return
    if st.session_state.selected_item is None:
        st.toast("Pick an item first!", icon="💅")
        return

    chosen = st.session_state.selected_item
    correct = st.session_state.solution[r][c]

    # Assist preview – if the choice conflicts, warn but allow (like Sudoku pencil)
    if st.session_state.assist:
        issues = current_conflicts(st.session_state.puzzle, r, c, chosen, st.session_state.board_size, st.session_state.subgrid)
        if issues:
            st.toast(f"Potential conflict: {', '.join(issues)}", icon="⚠️")

    push_undo()
    if chosen == correct:
        st.session_state.puzzle[r][c] = chosen
        st.session_state.score += 10
        st.session_state.moves += 1
        # Random micro-reward
        if random.random() < 0.15:
            st.session_state.score += 15
            st.toast("✨ Bonus! +15 Style!", icon="💎")
    else:
        # Mark wrong visually by a brief toast and reduce confidence
        st.session_state.confidence -= 1
        st.toast("❌ Not a fit! Confidence -1", icon="💔")
        if st.session_state.confidence <= 0:
            st.session_state.game_over = True

    # Win check
    if not st.session_state.game_over and st.session_state.puzzle == st.session_state.solution:
        st.session_state.win = True
        st.balloons()

# -------------------------------
# UI
# -------------------------------
init_state()

st.markdown('<div class="sassy-title">', unsafe_allow_html=True)
st.title("💋 Sassy Sudoku")
st.caption('<span class="sassy-pill">Sudoku vibes, fashion energy.</span>', unsafe_allow_html=True)
st.markdown('</div>', unsafe_allow_html=True)

# Settings / Sidebar
with st.sidebar:
    st.subheader("🎛️ Settings")
    board_choice = st.radio(
        "Board size",
        [5, 6, 8, 10],
        index=[5,6,8,10].index(st.session_state.board_size),
        horizontal=False,
        key="board_choice_radio"
    )
    diff_choice = st.selectbox(
        "Difficulty",
        list(DIFFICULTY_MAP.keys()),
        index=list(DIFFICULTY_MAP.keys()).index(st.session_state.difficulty),
        key="diff_choice_select"
    )
    st.toggle("Assist mode (show conflicts)", key="assist", value=st.session_state.assist)

    st.markdown("---")
    st.write("**Add custom items (comma-separated):**")
    st.text_input("Examples: 👗,🌸,⭐,💫,🔮,🪩", key="custom_items_raw", value=st.session_state.custom_items_raw)

    if st.button("Apply & New Game", key="apply_new"):
        reset_game(board_choice, diff_choice)
        st.rerun()

# First time load (or ensure a game exists)
if not st.session_state.puzzle:
    reset_game(st.session_state.board_size, st.session_state.difficulty)

# Top HUD
c1, c2, c3, c4 = st.columns([1,1,1,1])
with c1:
    st.metric("Style", st.session_state.score)
with c2:
    st.markdown("**Confidence**")
    hearts = "❤️ " * max(st.session_state.confidence, 0)
    st.write(hearts if hearts else "💔")
with c3:
    st.metric("Moves", st.session_state.moves)
with c4:
    if st.button("Undo", key="ctrl-undo"):
        pop_undo()
        st.rerun()

# Item Picker
st.markdown('<div class="sassy-box sassy-picker">', unsafe_allow_html=True)
st.write("**Pick your fashion:**")
n = st.session_state.board_size
available_items = sorted({x for row in st.session_state.solution for x in row})  # ensure we show the exact set

item_cols = st.columns(min(8, n))
for i, item in enumerate(available_items):
    col = item_cols[i % len(item_cols)]
    is_sel = (st.session_state.selected_item == item)
    btn = col.button(
        item,
        key=f"item-{i}",
        help="Click to select",
    )
    if btn:
        st.session_state.selected_item = item
        st.toast(f"Selected {item}", icon="💅")
        st.rerun()
st.markdown('</div>', unsafe_allow_html=True)

# Show selected item visually
if st.session_state.selected_item:
    st.markdown(f'<div class="info-text">Selected: <span class="sassy-pill">{st.session_state.selected_item}</span></div>', unsafe_allow_html=True)
else:
    st.markdown('<div class="error-text">No item selected.</div>', unsafe_allow_html=True)

st.markdown("")

# GRID
st.markdown('<div class="sassy-grid">', unsafe_allow_html=True)
grid = st.session_state.puzzle
orig = st.session_state.original
rows = st.session_state.board_size
cols = st.session_state.board_size

for r in range(rows):
    cols_ui = st.columns(cols, gap="small")
    for c in range(cols):
        val = grid[r][c]
        locked = orig[r][c] is not None
        label = val if val is not None else "⬜"
        key = f"cell-{r}-{c}"

        # Visual style hints
        btn_label = label
        kwargs = {"key": key, "use_container_width": True, "help": "Locked" if locked else "Click to place"}
        if locked:
            clicked = cols_ui[c].button(btn_label, **kwargs)
        else:
            clicked = cols_ui[c].button(btn_label, **kwargs)
            if clicked:
                handle_cell_click(r, c)
                st.rerun()
st.markdown('</div>', unsafe_allow_html=True)

# FOOTER CONTROLS
st.markdown('<div class="sassy-ctrl">', unsafe_allow_html=True)
cA, cB, cC = st.columns(3)
with cA:
    if st.button("Restart Same Settings", key="restart_same"):
        reset_game(st.session_state.board_size, st.session_state.difficulty)
        st.rerun()
with cB:
    if st.button("Change Board & Difficulty", key="go_change"):
        # reveal sidebar automatically (UX hint)
        st.toast("Use the sidebar to change size/difficulty, then click 'Apply & New Game'.", icon="🛠️")
with cC:
    if st.button("New Random Puzzle", key="new_random"):
        reset_game(st.session_state.board_size, st.session_state.difficulty)
        st.rerun()
st.markdown('</div>', unsafe_allow_html=True)

# END STATES
if st.session_state.game_over:
    st.error("💔 Game Over! You ran out of confidence.")
    g1, g2 = st.columns(2)
    with g1:
        if st.button("Try Again (Same Settings)", key="again1"):
            reset_game(st.session_state.board_size, st.session_state.difficulty)
            st.rerun()
    with g2:
        if st.button("Change Board & Difficulty", key="again2"):
            st.toast("Pick new options in the sidebar, then hit 'Apply & New Game'.", icon="🎛️")

if st.session_state.win:
    st.success(f"👑 You’re the Sassy Queen! Final Style: {st.session_state.score}")
    w1, w2 = st.columns(2)
    with w1:
        if st.button("Play Again (Same Settings)", key="winplay"):
            reset_game(st.session_state.board_size, st.session_state.difficulty)
            st.rerun()
    with w2:
        if st.button("Change Board & Difficulty", key="winchange"):
            st.toast("Change settings in the sidebar, then Apply.", icon="🎉")
