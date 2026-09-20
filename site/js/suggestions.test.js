// Списъкът с предложения (.suggestions) виси над картата. Leaflet и Google
// рисуват плочките, маркерите и контролите си със собствени z-index
// стойности (Leaflet: до 1000) — ако картата не е отделен stacking context,
// те се състезават със списъка на едно ниво и картата го покрива: виждаше
// се само първият ред, който попада в пролуката над нея (така „Марково“
// показваше само варненското). С isolation: isolate всичко в картата остава
// под нейния собствен покрив, каквито и числа да ползва библиотеката.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../css/app.css", import.meta.url), "utf8");

function rule(selector) {
  const m = app.match(new RegExp(selector.replace(/[.\-]/g, "\\$&") + "\\s*\\{([^}]*)\\}"));
  assert.ok(m, `няма правило ${selector}`);
  return m[1];
}

test("картата е отделен stacking context — z-index стойностите на картната библиотека не излизат от нея", () => {
  assert.match(rule(".map"), /isolation\s*:\s*isolate/, ".map няма isolation: isolate");
});

test("списъкът с предложения е позициониран със z-index над нулата", () => {
  const r = rule(".suggestions");
  assert.match(r, /position\s*:\s*absolute/);
  const z = r.match(/z-index\s*:\s*(-?\d+)/);
  assert.ok(z && Number(z[1]) > 0, ".suggestions трябва да е с положителен z-index");
});
