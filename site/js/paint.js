// paint.js — DOM-рисуване от вече решен изглед (historyView() в history.js).
// Изнесено от app.js, за да се тества директно (фалшива $ в paint.test.js,
// в духа на фалшивия document в chart.test.js), без да се внасят app.js-ите
// собствени странични ефекти при зареждане (fetch, картата, event
// listener-ите). Функциите тук не решават нищо — само пишат каквото им
// подадат; решенията са в historyView().

// Ф2/преглед: клетка без нито един ред (view.pairs липсва — виж
// historyView() в history.js) няма да строи празни карти с тирета за
// типична/сигурна дата — обяснението в #history-empty стои само.
export function paintPairs($, view) {
  const shown = view.pairs; // undefined и когато !view.visible, и когато view.empty
  $("pairs").hidden = !shown;
  $("pairs-note").hidden = !shown?.tooFewYears;
  if (!shown) return;
  $("typical-spring").textContent = shown.typicalSpring;
  $("typical-autumn").textContent = shown.typicalAutumn;
  $("safe-spring").textContent = shown.safeSpring;
  $("safe-autumn").textContent = shown.safeAutumn;
  $("pairs-note").textContent = shown.tooFewYearsMessage || "";
  $("safe-means").textContent = view.safeMeans;
}
