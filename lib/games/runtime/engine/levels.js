// Grid levels written as text, and a maze generator.
import { createRng } from "./math.js";

// rows: strings of one character per cell, first row farthest from the camera.
// legend: { "#": (x, z, cell) => ... } runs for each matching cell. solid lists the
// characters that block movement; it defaults to "#".
export function fromGrid(rows, legend = {}, { cell = 2, solid = "#" } = {}) {
  const depth = rows.length;
  const width = Math.max(...rows.map((row) => row.length));
  const originX = (-(width - 1) * cell) / 2;
  const originZ = (-(depth - 1) * cell) / 2;

  const level = {
    rows,
    cols: width,
    depth,
    cell,
    worldWidth: width * cell,
    worldDepth: depth * cell,
    at: (col, row) => rows[row]?.[col] ?? " ",
    toWorld: (col, row) => ({ x: originX + col * cell, z: originZ + row * cell }),
    toCell: (x, z) => ({
      col: Math.round((x - originX) / cell),
      row: Math.round((z - originZ) / cell),
    }),
    // Out of bounds counts as blocked, so this works directly with ai.findPath
    isBlocked: (col, row) =>
      col < 0 || row < 0 || col >= width || row >= depth || solid.includes(level.at(col, row)),
    // Every cell holding this character, as { col, row, x, z }
    find(character) {
      const found = [];
      for (let row = 0; row < depth; row++) {
        for (let col = 0; col < width; col++) {
          if (level.at(col, row) === character) found.push({ col, row, ...level.toWorld(col, row) });
        }
      }
      return found;
    },
  };

  for (const [character, build] of Object.entries(legend)) {
    for (const spot of level.find(character)) build(spot.x, spot.z, spot);
  }
  return level;
}

// Perfect maze as rows for fromGrid: "#" walls and "." floor. Size is in rooms,
// so the rows come out 2 * size + 1 wide. Start is cell (1, 1), the far corner is free.
export function maze(cols = 10, rows = 10, seed = 1) {
  const rng = createRng(seed);
  const grid = Array.from({ length: rows * 2 + 1 }, () => Array(cols * 2 + 1).fill("#"));
  const stack = [[0, 0]];
  grid[1][1] = ".";

  while (stack.length) {
    const [col, row] = stack.at(-1);
    const options = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dCol, dRow]) => [dCol, dRow, rng.next()])
      .sort((a, b) => a[2] - b[2]);
    const next = options.find(([dCol, dRow]) => {
      const c = col + dCol;
      const r = row + dRow;
      return c >= 0 && r >= 0 && c < cols && r < rows && grid[r * 2 + 1][c * 2 + 1] === "#";
    });
    if (!next) {
      stack.pop();
      continue;
    }
    const [dCol, dRow] = next;
    grid[row * 2 + 1 + dRow][col * 2 + 1 + dCol] = ".";
    grid[(row + dRow) * 2 + 1][(col + dCol) * 2 + 1] = ".";
    stack.push([col + dCol, row + dRow]);
  }
  return grid.map((row) => row.join(""));
}
