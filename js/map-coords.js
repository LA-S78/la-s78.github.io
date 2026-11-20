// Game X/Y → our territory map (owner request, 2026-11-20). Our map is a hand-drawn picture,
// not to scale (the middle is drawn larger than the edges), so one straight-line rule can't
// fit it everywhere. Instead a smooth warp (a thin-plate spline) passes exactly through
// reference points read in the game and bends gently between them:
//   - five cities (owner, 2026-11-19): Royal Castle 500/500, Old Oak 39/935, Stonebrook Town
//     955/919, Haystack 67/39, Howling Vale 954/64, each to its territory's middle on our map;
//   - the Capitol area's corners (owner, 2026-11-20): the brown square's corner tiles are
//     448 and 552 on both axes, so its edges are at 447.5 and 552.5, to the Royal Castle
//     territory's corners on our map.
// Game X runs left to right and Y bottom to top (0–1000). Add a point here to tighten the fit
// in its area: [gameX, gameY, mapX, mapY].

const POINTS = [
  [500, 500, 1068, 871], // Royal Castle
  [39, 935, 102, 93], // Old Oak
  [955, 919, 2008, 95], // Stonebrook Town
  [67, 39, 185, 1628], // Haystack
  [954, 64, 2026, 1622], // Howling Vale
  [447.5, 552.5, 938, 773], // the Capitol area's corners
  [552.5, 552.5, 1198, 773],
  [447.5, 447.5, 938, 969],
  [552.5, 447.5, 1198, 969],
];

const U = (r) => (r > 0 ? r * r * Math.log(r) : 0);

/** Solves A·x = b (Gaussian elimination with partial pivoting); A is n×n. */
function solve(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let best = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[best][col])) best = r;
    [M[col], M[best]] = [M[best], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** The spline's weights for one output (map x or map y). */
function fit(index) {
  const n = POINTS.length;
  const A = Array.from({ length: n + 3 }, () => Array(n + 3).fill(0));
  const b = Array(n + 3).fill(0);
  POINTS.forEach(([gx, gy], i) => {
    POINTS.forEach(([hx, hy], j) => {
      A[i][j] = U(Math.hypot(gx - hx, gy - hy));
    });
    A[i][n] = 1;
    A[i][n + 1] = gx;
    A[i][n + 2] = gy;
    A[n][i] = 1;
    A[n + 1][i] = gx;
    A[n + 2][i] = gy;
    b[i] = POINTS[i][index];
  });
  return solve(A, b);
}

const WX = fit(2);
const WY = fit(3);

function apply(w, x, y) {
  const n = POINTS.length;
  let v = w[n] + w[n + 1] * x + w[n + 2] * y;
  POINTS.forEach(([gx, gy], i) => {
    v += w[i] * U(Math.hypot(x - gx, y - gy));
  });
  return v;
}

/** Game X/Y → map coordinates ({ cx, cy }). */
export function toMap(x, y) {
  return { cx: apply(WX, x, y), cy: apply(WY, x, y) };
}
