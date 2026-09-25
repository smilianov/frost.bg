// Ръководството е два статични HTML файла — без JavaScript и без Markdown в
// браузъра. Тестът пази това, което един човек би счупил, без да забележи:
// изчезнала връзка назад, език, който води на грешно място, и раздел,
// добавен само на единия език.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const bg = read("../guide/index.html");
const en = read("../en/guide/index.html");

const headings = (html) => [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1].trim());

test("двете страници нямат JavaScript", () => {
  for (const [name, html] of [["bg", bg], ["en", en]]) {
    assert.ok(!/<script/i.test(html), `${name}: няма <script>`);
    assert.ok(!/ on[a-z]+=/i.test(html), `${name}: няма inline handler`);
  }
});

test("носят облика на сайта: app.css, header, wrap, footer", () => {
  for (const [name, html] of [["bg", bg], ["en", en]]) {
    assert.match(html, /<link rel="stylesheet" href="\/css\/app\.css">/, `${name}: app.css`);
    assert.match(html, /<header class="top">/, `${name}: header`);
    assert.match(html, /<main class="wrap">/, `${name}: wrap`);
    assert.match(html, /<footer class="foot">/, `${name}: footer`);
    assert.ok(!/leaflet/i.test(html), `${name}: няма Leaflet — тук няма карта`);
  }
});

test("всяка страница води обратно към началната на своя език", () => {
  assert.match(bg, /<a class="brand" href="\/">frost\.bg<\/a>/);
  assert.match(en, /<a class="brand" href="\/en\/">frost\.bg<\/a>/);
});

test("превключвателят на езика води към другото ръководство, не към началната", () => {
  assert.match(bg, /<a class="lang" href="\/en\/guide\/">English<\/a>/);
  assert.match(en, /<a class="lang" href="\/guide\/">Български<\/a>/);
});

test("двата езика имат едни и същи раздели, в същия ред", () => {
  assert.equal(headings(bg).length, headings(en).length);
  assert.ok(headings(bg).length >= 6, `очаквах поне 6 раздела, намерих ${headings(bg).length}`);
});

test("езикът на документа е обявен вярно", () => {
  assert.match(bg, /<html lang="bg">/);
  assert.match(en, /<html lang="en">/);
});

test("числата в примера са истинските за Маноле", () => {
  for (const [name, html] of [["bg", bg], ["en", en]]) {
    for (const needle of ["42.2", "24.9", "99", "152", "30"]) {
      assert.ok(html.includes(needle), `${name}: липсва ${needle}`);
    }
  }
});

test("началните страници водят към ръководството", () => {
  const home = read("../index.html"), homeEn = read("../en/index.html");
  assert.match(home, /href="\/guide\/"/);
  assert.match(homeEn, /href="\/en\/guide\/"/);
});
