// paint.js рисува в DOM-а от вече решения изглед (historyView()) — тества
// се с минимална фалшива $, в духа на chart.test.js's фалшив document, без
// да се внася app.js (странични ефекти при зареждане: fetch, картата,
// event listener-ите).
import { test } from "node:test";
import assert from "node:assert/strict";
import { paintPairs } from "./paint.js";

function fakeDom(ids) {
  const els = {};
  for (const id of ids) els[id] = { hidden: false, textContent: "изходен текст, трябва да се презапише" };
  return { $: (id) => els[id], els };
}

const IDS = ["pairs", "pairs-note", "typical-spring", "typical-autumn", "safe-spring", "safe-autumn", "safe-means"];

// Преглед кръг 5: предишният тест сравняваше само входа на paintPairs
// (view.pairs), не какво тя реално прави с DOM-а — обръщането на фикса
// оставяше същия тест зелен. Тук се твърди самото поведение: #pairs.hidden.
test("paintPairs: клетка без данни (view.pairs липсва) -> #pairs и #pairs-note СКРИТИ, не карти с тирета", () => {
  const { $, els } = fakeDom(IDS);
  paintPairs($, { visible: true, empty: true, message: "За тази клетка няма години с данни." }); // view.pairs === undefined
  assert.equal(els["pairs"].hidden, true, "картите за типична/сигурна дата не бива да се показват изобщо");
  assert.equal(els["pairs-note"].hidden, true);
});

test("paintPairs: клетка без валиден period.end (visible:false) -> #pairs също СКРИТ", () => {
  const { $, els } = fakeDom(IDS);
  paintPairs($, { visible: false });
  assert.equal(els["pairs"].hidden, true);
});

test("paintPairs: нормална клетка (view.pairs има данни) -> #pairs ВИДИМ, датите/бележката се изписват", () => {
  const { $, els } = fakeDom(IDS);
  const view = {
    visible: true, empty: false,
    pairs: {
      typicalSpring: "1 април", typicalAutumn: "1 октомври",
      safeSpring: "15 април", safeAutumn: "20 септември",
      tooFewYears: false, tooFewYearsMessage: "",
    },
    safeMeans: "сигурната дата 15 април значи: в 3 от 30 години е имало слана след нея",
  };
  paintPairs($, view);
  assert.equal(els["pairs"].hidden, false, "нормална клетка показва картите");
  assert.equal(els["pairs-note"].hidden, true, "без бележка, когато годините са достатъчно");
  assert.equal(els["typical-spring"].textContent, "1 април");
  assert.equal(els["typical-autumn"].textContent, "1 октомври");
  assert.equal(els["safe-spring"].textContent, "15 април");
  assert.equal(els["safe-autumn"].textContent, "20 септември");
  assert.equal(els["safe-means"].textContent, view.safeMeans);
});

test("paintPairs: под 10 години със слана -> #pairs ВИДИМ, но #pairs-note също се показва", () => {
  const { $, els } = fakeDom(IDS);
  const view = {
    visible: true, empty: false,
    pairs: {
      typicalSpring: "—", typicalAutumn: "—", safeSpring: "—", safeAutumn: "—",
      tooFewYears: true, tooFewYearsMessage: "твърде малко години за надеждна дата — графиката показва самите години",
    },
    safeMeans: "",
  };
  paintPairs($, view);
  assert.equal(els["pairs"].hidden, false);
  assert.equal(els["pairs-note"].hidden, false);
  assert.equal(els["pairs-note"].textContent, view.pairs.tooFewYearsMessage);
});
