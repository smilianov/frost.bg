// Приемателен тест: сметката в браузъра при пълния прозорец дава същото,
// което мрежата е записала — за всичките 2 080 клетки, включително
// null-овете. Това е единственото, което пази страницата и grid.json да не
// се разминат.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pair, selectWindow } from "./stats.js";

const grid = JSON.parse(readFileSync(new URL("../../grid/grid.json", import.meta.url), "utf8"));

test("всички клетки: пълният прозорец съвпада с typical/safe от мрежата", () => {
  let checked = 0, withDates = 0;
  const n = grid.period.end - grid.period.start + 1;
  for (const c of grid.cells) {
    const w = selectWindow(c.years, grid.period.end, n);
    assert.equal(w.withData, c.years.length, `${c.lat},${c.lon}: всички години в прозореца`);
    const p = pair(w.rows);
    assert.deepEqual(
      [p.typical.last_spring, p.typical.first_autumn, p.safe.last_spring, p.safe.first_autumn],
      [c.typical[0], c.typical[1], c.safe[0], c.safe[1]],
      `клетка ${c.lat},${c.lon}`,
    );
    assert.deepEqual([p.springCount, p.autumnCount], [c.years_with_spring, c.years_with_autumn], `клетка ${c.lat},${c.lon}`);
    checked++;
    if (c.typical[0] !== null) withDates++;
  }
  assert.equal(checked, grid.cells.length);
  assert.ok(withDates > 1800, `очаквах над 1800 клетки с дати, намерих ${withDates}`);
});
