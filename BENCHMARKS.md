# Generator benchmarks

_Last run: 2026-04-18T23:46:39.051Z. Sample size: 30 puzzles per combo._

Timing for `generatePuzzle(size, difficulty, rng)` including uniqueness verification
during cell removal. Measured on a GitHub Actions `ubuntu-latest` runner — your
hardware will vary.

| Size | Difficulty | N  | Mean (ms) | Median (ms) | P95 (ms) | Clues (min–max) | Unique? |
|------|------------|----|-----------|-------------|----------|-----------------|---------|
| 4×4  | easy       | 30 | 0.1       | 0.1         | 0.1      | 10–10           | ✓       |
| 4×4  | medium     | 30 | 0.1       | 0.1         | 0.1      | 8–8             | ✓       |
| 4×4  | hard       | 30 | 0.1       | 0.0         | 0.1      | 6–6             | ✓       |
| 4×4  | diabolical | 30 | 0.1       | 0.0         | 0.1      | 5–5             | ✓       |
| 6×6  | easy       | 30 | 0.1       | 0.0         | 0.1      | 22–22           | ✓       |
| 6×6  | medium     | 30 | 0.1       | 0.1         | 0.1      | 18–18           | ✓       |
| 6×6  | hard       | 30 | 0.1       | 0.1         | 0.1      | 14–14           | ✓       |
| 6×6  | diabolical | 30 | 0.1       | 0.1         | 0.3      | 12–12           | ✓       |
| 9×9  | easy       | 30 | 0.5       | 0.5         | 1.3      | 40–40           | ✓       |
| 9×9  | medium     | 30 | 0.5       | 0.5         | 0.6      | 32–32           | ✓       |
| 9×9  | hard       | 30 | 1.3       | 1.1         | 2.3      | 26–26           | ✓       |
| 9×9  | diabolical | 30 | 3.4       | 2.9         | 6.5      | 23–26           | ✓       |

**Columns**
- `Mean/Median/P95` — generation wall time across N runs
- `Clues (min–max)` — number of given cells in the final puzzle
- `Unique?` — every puzzle verified to have exactly one solution

_Re-generated automatically on push via [`.github/workflows/benchmarks.yml`](./.github/workflows/benchmarks.yml)._
