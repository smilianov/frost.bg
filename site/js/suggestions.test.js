// Списъкът с предложения (.suggestions) виси над картата. Leaflet рисува
// плочките, маркерите и контролите си със собствени z-index стойности —
// ако списъкът е под най-високата от тях, картата го покрива и се вижда
// само първият ред, който попада в пролуката над нея (така „Марково“
// показваше само варненското). Тестът чете и двата CSS файла, за да
// хване и обновяване на Leaflet, което вдига стойностите.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

function zIndexOf(rule, source) {
  const m = source.match(new RegExp(rule.replace(/[.\-]/g, "\\$&") + "\\s*\\{([^}]*)\\}"));
  assert.ok(m, `няма правило ${rule}`);
  const z = m[1].match(/z-index\s*:\s*(-?\d+)/);
  assert.ok(z, `${rule} няма z-index`);
  return Number(z[1]);
}

function maxZIndex(source) {
  return Math.max(...[...source.matchAll(/z-index\s*:\s*(-?\d+)/g)].map((m) => Number(m[1])));
}

test("картата е отделен stacking context — z-index стойностите на картната библиотека не излизат от нея", () => {
  const app = css("../css/app.css");
  const m = app.match(/\.map\s*\{([^}]*)\}/);
  assert.ok(m, "няма правило .map");
  assert.match(m[1], /isolation\s*:\s*isolate/, ".map няма isolation: isolate");
});

test("списъкът с предложения е над всичко, което Leaflet рисува", () => {
  const ours = zIndexOf(".suggestions", css("../css/app.css"));
  const leaflet = maxZIndex(css("../vendor/leaflet/leaflet.css"));
  assert.ok(leaflet >= 1000, `очаквах Leaflet да стига поне 1000, а е ${leaflet}`);
  assert.ok(ours > leaflet, `.suggestions z-index ${ours} не е над Leaflet (${leaflet})`);
});
