// Orbits: a comet given one push flies under the suns' pull.
// - The physics: the same push gives the same flight, step for step, in the
//   page (twice), in Node and in WebKit, for every chart's solution and for
//   pushes that swing close by two suns.
// - Every chart is charted by its stored solution, flown through the page's
//   own physics, and so is every push within three tenths of it: a patch
//   0.6 wide each way, which the keys' half steps can't jump over wherever
//   they start; no chart is charted by its opening push, and the dotted line
//   for the solution stops before the first gate is passed.
// - The rules, on small charts of the test's own flown by the same code:
//   numbered gates light only in turn, a ring marked II on the second pass,
//   and a flight ends in a sun, a dust cloud, on a moon, off the chart's
//   edge or when it burns out.
// - Launches: each one counts at once and is stored, so a chart's count
//   and push carry over leaving and coming back; the push just flown can't
//   be sent again unchanged; the count is kept the moment the last gate is
//   lit (before the card), and a chart flown again keeps its count.
// - The charts: thirty tiles, a plate to a row, the first open; a locked
//   one says why; charting one opens the next; the arrows ring a chart and
//   Enter flies it.
// - Keys and touch: the arrows turn the push and change its strength (half
//   a step, a tenth with Shift), Space or Enter launches (and skips the rest
//   of a flight), R the opening push, Backspace the charts; the keys are
//   worn on the buttons. A mouse puts the arrow's tip where it points, a
//   finger moves it by as much as it moves.
// - Visual FX off: the same flight at the same pace (on a fake clock), the
//   same art drawn, the sun's rays and the gates still.
// - Paused, a flight holds still and the arrows do nothing; Esc with a comet
//   in the air asks first.
// - The games page's reset clears the counts and keeps the chart picked.
// - Phones and laptops: the menu, the chart and its buttons fit, clear of
//   the corner buttons, upright and on the side.
// (SOLUTIONS, a push for each chart, are at the end of the file.)
const path = require("path");
module.exports = async ({ browser, base, check, lib }) => {
  const Phys = require(path.join(lib.ROOT, "games/orbits/physics.js"));
  const LV = require(path.join(lib.ROOT, "games/orbits/levels.js"));
  let ctx = await lib.newContext(browser);
  const open = (c, opts) => lib.open(c || ctx, base, "games/orbits/", opts);
  const done = async (p, what) => { check("orbits " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  const st = (p) => p.evaluate(() => Orbits.state());
  // chart 1: a push that circles its sun until it burns out (a full flight, no gate)
  const LONG = [1150, 130];

  // ---- the same push, the same flight: Node, the page twice, and WebKit
  // (pushes that swing close by two suns too, where a last bit grows into
  // another course)
  const wild = [];
  for (let k = 0; k < 40; k++) wild.push([(k * 977) % 3600, 80 + (k * 131) % 400, [6, 7, 8, 9, 12, 13][k % 6]]);
  const nodeSol = SOLUTIONS.map(([a, s], n) => Phys.hash(Phys.fly(LV.charts[n], a, s)));
  const nodeWild = wild.map(([a, s, n]) => Phys.hash(Phys.fly(LV.charts[n], a, s)));
  const hashes = (p) => p.evaluate(({ sols, wild }) => ({ sol: sols.map(([a, s], n) => Orbits.fly(n, a, s).hash), wild: wild.map(([a, s, n]) => Orbits.fly(n, a, s).hash) }), { sols: SOLUTIONS, wild });
  let p = await open();
  const h1 = await hashes(p), h2 = await hashes(p);
  check("orbits: the same push gives the same flight, step for step, in the page twice and in Node (" + SOLUTIONS.length + " solutions, " + wild.length + " pushes by two suns)",
    h1.sol.join() === nodeSol.join() && h1.wild.join() === nodeWild.join() && h2.sol.join() === h1.sol.join() && h2.wild.join() === h1.wild.join(),
    { sol: h1.sol.map((h, i) => h === nodeSol[i] ? null : i).filter((x) => x !== null), wild: h1.wild.map((h, i) => h === nodeWild[i] ? null : i).filter((x) => x !== null) });
  {
    // (the plain helpers: a runner that wraps lib to slow Chromium's pages
    // can't do the same to WebKit's)
    const { webkit } = require("@playwright/test"), plain = require(path.join(lib.ROOT, "_dev", "lib.js"));
    const wb = await webkit.launch();
    try {
      const wctx = await plain.newContext(wb);
      const wp = await plain.open(wctx, base, "games/orbits/");
      const hw = await hashes(wp);
      check("orbits: ...and in WebKit (another engine's sums)", hw.sol.join() === nodeSol.join() && hw.wild.join() === nodeWild.join(),
        { sol: hw.sol.map((h, i) => h === nodeSol[i] ? null : i).filter((x) => x !== null), wild: hw.wild.map((h, i) => h === nodeWild[i] ? null : i).filter((x) => x !== null) });
      check("orbits (WebKit): no page errors", wp.errs.length === 0, wp.errs);
      await wctx.close();
    } finally { await wb.close(); }
  }

  // ---- every chart: charted by its solution, and by the pushes three tenths
  // round it; not by its opening push; the dotted line stops short of the
  // first gate
  const sols = await p.evaluate((sols) => sols.map(([a, s], n) => {
    const L = Orbits.level(n), f = Orbits.fly(n, a, s);
    const near = [[-3, -3], [-3, 3], [3, -3], [3, 3], [0, 3], [0, -3], [3, 0], [-3, 0]].filter(([da, ds]) => Orbits.fly(n, (a + da + 3600) % 3600, s + ds).charted === null);
    const opening = Orbits.fly(n, L.push[0], L.push[1]);
    return { n: n + 1, name: L.name, charted: f.charted !== null, near, opening: opening.charted === null, before: f.first !== null && f.preview < f.first && f.why !== "gate", why: f.why, gates: L.gates.length };
  }), SOLUTIONS);
  check("orbits: thirty charts on six plates", LV.charts.length === 30 && LV.plates.length === 6 && sols.length === 30 && [0, 1, 2, 3, 4, 5].every((k) => LV.charts.filter((c) => c.plate === k).length === 5), { charts: LV.charts.length, sols: sols.length });
  check("orbits: every chart is charted by its stored solution, flown through the page's physics, and by every push three tenths round it (a patch the keys' half steps can't jump)",
    sols.every((x) => x.charted && x.near.length === 0), sols.filter((x) => !x.charted || x.near.length));
  check("orbits: no chart is charted by its opening push, and the dotted line for each solution stops before its first gate, by its own length or at its first swing past a sun (not cut short near a gate, pointing at it)",
    sols.every((x) => x.opening && x.before), sols.filter((x) => !x.opening || !x.before));

  // ---- the rules, on charts of the test's own, flown by the page's physics
  const rules = await p.evaluate(() => {
    const P = OrbitsPhysics, far = [[900, 950, 1]];
    const sum = (f) => ({ end: f.end.kind, charted: f.charted !== null, lit: f.lit.map((e) => e.gate + ":" + e.count) });
    // east along y = 500: the gate at x 300 (numbered 2) comes before the one at x 600 (1)
    const line = { start: [100, 500], suns: far, gates: [[600, 500], [300, 500]] };
    const ordered = sum(P.fly(Object.assign({ ordered: true }, line), 900, 300));
    const free = sum(P.fly(line, 900, 300));
    const dust = sum(P.fly({ start: [100, 500], suns: far, gates: [[700, 500]], dust: [[450, 500, 60]] }, 900, 300));
    const sun = sum(P.fly({ start: [100, 500], suns: [[600, 500, 2]], gates: [[100, 100]] }, 900, 300));
    const edge = sum(P.fly({ start: [100, 500], suns: far, gates: [[500, 100]] }, 2700, 300));
    // a circle round a sun: v^2 = GM / r (and a gate on it marked II)
    const r = 250, v = Math.sqrt(P.SUNS[2].gm / r) / P.SPEED * 10;
    const circle = { start: [500, 500 - r], suns: [[500, 500, 2]], gates: [[500 + r, 500, 2]] };
    const twice = sum(P.fly(circle, 900, Math.round(v)));
    const once = sum(P.fly(Object.assign({}, circle, { gates: [[500 + r, 500]] }), 900, Math.round(v)));
    const burn = sum(P.fly(Object.assign({}, circle, { gates: [[100, 900]] }), 900, Math.round(v)));
    // a slow moon straight ahead, on the line from the comet down to its sun
    const moon = sum(P.fly({ start: [500, 100], suns: [[500, 980, 1]], gates: [[100, 900]], moons: [{ sun: 0, r: 480, period: 600, phase: 0, dir: 1 }] }, 1800, 300));
    return { ordered, free, dust, sun, edge, twice, once, burn, moon };
  });
  check("orbits: numbered gates light only in turn (2 passed before 1 stays dark); unnumbered, either order charts",
    !rules.ordered.charted && rules.ordered.lit.join() === "0:1" && rules.free.charted && rules.free.lit.join() === "1:1,0:1", rules);
  check("orbits: a flight ends in a dust cloud (the gate beyond it dark), in a sun, off the chart's edge, on a moon, or when it burns out",
    rules.dust.end === "dust" && !rules.dust.charted && rules.sun.end === "sun" && rules.edge.end === "edge" && rules.moon.end === "moon" && !rules.moon.charted && rules.burn.end === "time", rules);
  check("orbits: a ring marked II lights on the second pass (the first gilds it), a plain ring on the first",
    rules.twice.charted && rules.twice.lit.join() === "0:1,0:2" && rules.once.charted && rules.once.lit.join() === "0:1", rules);

  // ---- launches: counted at once and stored; the push just flown can't go
  // again unchanged; a chart's go carries over leaving and coming back
  await p.evaluate(() => { Orbits.start(0); Orbits.setPush(300, 160); Orbits.launch(); Orbits.skip(); });
  const first = await p.evaluate(() => ({ state: Orbits.state(), tries: Orbits.tries(), go: JSON.parse(localStorage.getItem("orbits_go") || "{}")[0], trace: Orbits.trace() }));
  await p.evaluate(() => Orbits.launch());
  const same = await p.evaluate(() => ({ state: Orbits.state(), tries: Orbits.tries(), status: document.getElementById("status").textContent }));
  await p.evaluate(() => { Orbits.setPush(310, 160); Orbits.launch(); Orbits.skip(); });
  const second = await p.evaluate(() => ({ tries: Orbits.tries(), go: JSON.parse(localStorage.getItem("orbits_go") || "{}")[0] }));
  check("orbits: a launch counts at once and is stored with the push; the flight leaves its trace; the push just flown won't go again unchanged",
    first.state === "aim" && first.tries === 1 && first.go && first.go.t === 1 && first.go.la === 300 && first.trace && first.trace.end === "sun" &&
      same.state === "aim" && same.tries === 1 && /just flown/.test(same.status) && second.tries === 2 && second.go.t === 2 && second.go.la === 310, { first, same, second });
  await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForSelector(".mute-toggle"); await p.waitForTimeout(300);
  const back = await p.evaluate(() => { const note = document.getElementById("pick-best").textContent; Orbits.start(0); return { note, tries: Orbits.tries(), push: Orbits.push(), trace: !!Orbits.trace() }; });
  check("orbits: leaving and coming back, a chart's go carries on: its count (\"2 launches so far\" on the menu), its push and its last flight's trace",
    back.note === "2 launches so far" && back.tries === 2 && back.push.join() === "310,160" && back.trace, back);

  // ---- charted: the count kept the moment the last gate lights, while the
  // comet still flies (before the card); then the card, and Space (after a
  // moment) the next chart
  await p.evaluate(() => {
    window.__saved = [];
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k === "orbits_best") { const f = Orbits.flight(); window.__saved.push({ v, t: f && f.t, charted: f && f.charted, n: f && f.n, state: Orbits.state(), card: !document.getElementById("done").hidden }); } return set.apply(this, arguments); };
  });
  await p.evaluate((s) => { Orbits.setPush(s[0], s[1]); Orbits.launch(); }, SOLUTIONS[0]);
  await p.waitForFunction(() => Orbits.state() === "done" && !document.getElementById("done").hidden, null, { timeout: 30000 });
  const won = await p.evaluate(() => ({ saved: window.__saved, best: Orbits.best(0), title: document.getElementById("done-title").textContent, msg: document.getElementById("done-msg").textContent,
    caps: ["again", "to-charts", "next"].map((id) => document.getElementById(id).getAttribute("data-gs-key")), open: Orbits.isOpen(1) }));
  check("orbits: the last gate lit, the chart's count (3 launches) is kept there and then, the comet still flying, before the card",
    won.saved.length === 1 && won.saved[0].v === '{"0":3}' && won.saved[0].state === "fly" && !won.saved[0].card && won.saved[0].t >= won.saved[0].charted && won.saved[0].t < won.saved[0].n - 1 && won.best === 3, won);
  await p.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })));
  const held = await st(p);
  // (the tab hidden or closed on the card: the chart is charted, so no go is kept for it)
  await p.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await p.evaluate(() => new Promise((r) => setTimeout(r, 900)));
  await p.keyboard.press("Space");
  await p.waitForFunction(() => Orbits.state() === "aim", null, { timeout: 8000 });
  const next = await p.evaluate(() => ({ chart: Orbits.chart(), go: localStorage.getItem("orbits_go") }));
  check("orbits: the card says Charted!, in 3 launches, its buttons wear R, ⌫ and Space or Enter; chart 2 opens; leaving on the card keeps no go for a chart charted; Space waits a moment, then flies the next chart",
    won.title === "Charted!" && won.msg === "in 3 launches" && won.caps.join() === "R,⌫,Space or Enter" && won.open && held === "done" && next.chart === 1 && next.go === "{}", { won, held, next });
  // flown again, a chart keeps its count however few launches it takes
  await p.evaluate((s) => { Orbits.start(0); Orbits.setPush(s[0], s[1]); Orbits.launch(); Orbits.skip(); }, SOLUTIONS[0]);
  await p.waitForFunction(() => !document.getElementById("done").hidden, null, { timeout: 8000 });
  const replay = await p.evaluate(() => {
    const r = { again: Orbits.again(), best: Orbits.best(0), stored: localStorage.getItem("orbits_best"), pill: document.querySelector("#done-stats .best").textContent };
    Orbits.toMenu();
    r.go = JSON.parse(localStorage.getItem("orbits_go") || "{}");
    r.note = document.getElementById("pick-best").textContent;
    return r;
  });
  check("orbits: a chart flown again, charted at the first launch, keeps its count (3) and says so; back on the menu it keeps no go of its own",
    replay.again && replay.best === 3 && replay.stored === '{"0":3}' && /stays 3/.test(replay.pill) && !("0" in replay.go) && replay.note === "charted in 3 launches", replay);
  await done(p, "launches");

  // ---- the charts: thirty tiles, a plate to a row, the first open and
  // chosen; a locked one says why and stays shut; the arrows and Enter
  p = await open();
  const tiles = await p.evaluate(() => ({ n: document.querySelectorAll("#grid .lv").length, plates: [...document.querySelectorAll("#grid .plate-k")].map((k) => k.firstChild.textContent).join(" "),
    marks: [...document.querySelectorAll("#grid .lv")].map((t) => (t.classList.contains("locked") ? "L" : "o") + (t.classList.contains("current") ? "*" : "")).join(""),
    head: [...document.querySelectorAll("#charts-k kbd")].map((k) => k.textContent).join(" "), play: document.getElementById("play").getAttribute("data-gs-key") }));
  await p.click("#grid .lv:nth-child(4)"); await p.waitForTimeout(80);
  const shut = await p.evaluate(() => ({ state: Orbits.state(), note: document.getElementById("lock-note").textContent }));
  check("orbits: thirty charts in the list, a plate to a row (I to VI), the first open and chosen, the rest locked; a locked one says why and stays shut; the arrows and Enter on the heading, Space or Enter on Fly this chart",
    tiles.n === 30 && tiles.plates === "I II III IV V VI" && tiles.marks === "o*" + "L".repeat(29) && shut.state === "menu" && /Chart 3 is locked/.test(shut.note) &&
      tiles.head === "← ↑ ↓ → Enter" && tiles.play === "Space or Enter", { tiles, shut });
  await p.evaluate(() => { localStorage.setItem("orbits_best", JSON.stringify({ 0: 4, 1: 2 })); });
  await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForSelector(".mute-toggle"); await p.waitForTimeout(300);
  const opened = await p.evaluate(() => ({ marks: [...document.querySelectorAll("#grid .lv")].slice(0, 4).map((t) => (t.classList.contains("locked") ? "L" : "o") + (t.classList.contains("charted") ? "c" : "") + (t.classList.contains("current") ? "*" : "")).join(","),
    tally: document.getElementById("tally").textContent }));
  await p.keyboard.press("ArrowLeft"); await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(80);
  const ringed = await p.evaluate(() => ({ chart: Orbits.chart(), name: document.getElementById("pick-name").textContent, best: document.getElementById("pick-best").textContent }));
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => Orbits.state() === "aim", null, { timeout: 8000 });
  const went = await p.evaluate(() => ({ chart: Orbits.chart(), again: Orbits.again(), log: document.getElementById("log-name").textContent }));
  check("orbits: a charted chart opens the next (the list chooses the first not charted); the tally counts charts and launches; the arrows ring and choose a chart, and Enter flies it",
    opened.marks === "oc,oc,o*,L" && opened.tally === "2 of 30 · 6 launches" && ringed.chart === 1 && ringed.best === "charted in 2 launches" &&
      went.chart === 1 && went.again && /^Chart 2 · /.test(went.log), { opened, ringed, went });
  await done(p, "charts");

  // ---- keys: the arrows turn the push and change its strength, Space
  // launches and skips, R the opening push, Backspace the charts; the keys
  // are worn on the buttons
  p = await open();
  await p.evaluate(() => Orbits.start(0));
  const k0 = await p.evaluate(() => Orbits.push()), k0w = await p.evaluate(() => document.getElementById("btn-launch").offsetWidth);
  await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowUp");
  const k1 = await p.evaluate(() => Orbits.push());
  await p.keyboard.down("Shift"); await p.keyboard.press("ArrowLeft"); await p.keyboard.press("ArrowLeft"); await p.keyboard.press("ArrowDown"); await p.keyboard.up("Shift");
  const k2 = await p.evaluate(() => ({ push: Orbits.push(), dial: document.getElementById("dial-a").textContent + " " + document.getElementById("dial-s").textContent }));
  await p.keyboard.press("r");
  const k3 = await p.evaluate(() => Orbits.push());
  const caps = await p.evaluate(() => ["btn-launch", "btn-reset", "btn-charts", "n-ccw", "n-cw", "n-less", "n-more"].map((id) => document.getElementById(id).getAttribute("data-gs-key")));
  await p.evaluate((L) => Orbits.setPush(L[0], L[1]), LONG);
  await p.keyboard.press("Space");
  const flying = await p.evaluate(() => ({ state: Orbits.state(), tries: Orbits.tries(), label: document.getElementById("btn-launch").getAttribute("aria-label"), w: document.getElementById("btn-launch").offsetWidth }));
  await p.keyboard.press("ArrowRight");
  const steady = await p.evaluate(() => Orbits.push());
  await p.keyboard.press("Enter");
  const skipped = await p.evaluate(() => ({ state: Orbits.state(), trace: Orbits.trace() }));
  await p.keyboard.press("Backspace"); await p.waitForTimeout(100);
  const menu = await st(p);
  check("orbits: → turns the push half a degree and ↑ strengthens it half a unit, a tenth each with Shift (the dials say so); R puts back the opening push",
    k1.join() === [k0[0] + 5, k0[1] + 5].join() && k2.push.join() === [k0[0] + 3, k0[1] + 4].join() && k2.dial === ("00" + ((k0[0] + 3) / 10).toFixed(1)).slice(-5) + "° " + ((k0[1] + 4) / 10).toFixed(1) && k3.join() === k0.join(), { k0, k1, k2, k3 });
  check("orbits: the buttons wear their keys (Space or Enter, R, ⌫, and the arrows on turn and strength)", caps.join() === "Space or Enter,R,⌫,←,→,↓,↑", caps);
  check("orbits: Space launches (counted), the button turns to Skip (no wider) and the arrows hold off; Enter skips the rest of the flight (its trace whole); Backspace goes to the charts",
    flying.state === "fly" && flying.tries === 1 && flying.label === "Skip" && flying.w === k0w && steady.join() === LONG.join() && skipped.state === "aim" && skipped.trace && skipped.trace.end === "time" && menu === "menu",
    { flying, steady, skipped, menu });
  await done(p, "keys");

  // ---- dragging: a mouse puts the arrow's tip where it points; a finger
  // takes hold of the tip and moves it by as much as it moves
  p = await open();
  await p.evaluate(() => Orbits.start(0));
  const S = LV.charts[0].start;
  const at = await p.evaluate(([x, y]) => Orbits.screen(x, y), [S[0] + 120, S[1]]);
  await p.mouse.move(at[0], at[1]); await p.mouse.down(); await p.mouse.up();
  const md = await p.evaluate(() => Orbits.push());
  const to = await p.evaluate(([x, y]) => Orbits.screen(x, y), [S[0], S[1] - 90]);
  await p.mouse.move(at[0], at[1]); await p.mouse.down(); await p.mouse.move(to[0], to[1], { steps: 4 }); await p.mouse.up();
  const md2 = await p.evaluate(() => Orbits.push());
  // a finger: down well away from the tip, moved 60 units east
  const fd = await p.evaluate(([x, y, x2]) => {
    Orbits.setPush(0, 150);
    const c = document.getElementById("sky"), a = Orbits.screen(x, y), b = Orbits.screen(x2, y);
    const ev = (type, pt) => c.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: "touch", clientX: pt[0], clientY: pt[1], bubbles: true, cancelable: true, isPrimary: true }));
    ev("pointerdown", a); const mid = Orbits.push(); ev("pointermove", b); ev("pointerup", b);
    return { mid, end: Orbits.push() };
  }, [700, 300, 760]);
  // (the tip was 90 units north of the start: 60 east of that is a bearing of atan(60/90))
  const want = Math.round(Math.atan2(60, 90) * 1800 / Math.PI), wantS = Math.round(Math.hypot(60, 90) / 6 * 10);
  check("orbits: a mouse click on the chart points the push there (east: 090.0°, 120 units long: strength 20.0), and a drag follows it (north: 000.0°, 15.0)",
    Math.abs(md[0] - 900) <= 6 && Math.abs(md[1] - 200) <= 3 && (md2[0] <= 6 || md2[0] >= 3594) && Math.abs(md2[1] - 150) <= 3, { md, md2 });
  check("orbits: a finger moves the arrow's tip by as much as it moves, from wherever it lands (no jump on touching down)",
    fd.mid.join() === "0,150" && Math.abs(fd.end[0] - want) <= 2 && Math.abs(fd.end[1] - wantS) <= 1, { fd, want, wantS });
  await done(p, "drag");

  // ---- pause: a flight holds still, the arrows do nothing; Esc with a comet
  // in the air asks first, and Enter flies on
  p = await open();
  await p.evaluate((L) => { Orbits.start(0); Orbits.setPush(L[0], L[1]); Orbits.launch(); }, LONG);
  await p.waitForFunction(() => Orbits.flight() && Orbits.flight().t > 20, null, { timeout: 8000 });
  await p.keyboard.press("p");
  const t0 = await p.evaluate(() => Orbits.flight().t);
  await p.evaluate(() => new Promise((r) => setTimeout(r, 500)));
  const t1 = await p.evaluate(() => ({ t: Orbits.flight().t, active: GameShell.leaveActive() }));
  await p.keyboard.press("p");
  await p.waitForFunction((t) => Orbits.flight() && Orbits.flight().t > t + 5, t0, { timeout: 8000 });
  check("orbits: paused (P), the comet holds still; P again and it flies on", t1.t === t0 && t1.active, { t0, t1 });
  await p.keyboard.press("Escape");
  await p.waitForSelector(".gs-dialog h2", { timeout: 8000 });
  const asked = await p.evaluate(() => document.querySelector(".gs-dialog h2").textContent);
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => !document.querySelector(".gs-dialog"), null, { timeout: 8000 });
  check("orbits: Esc with a comet in the air asks \"Leave this game?\", and Enter flies on", asked === "Leave this game?" && p.leaves === 0 && (await st(p)) === "fly", { asked, leaves: p.leaves });
  await p.evaluate(() => Orbits.skip());
  await p.keyboard.press("p");
  const pushP = await p.evaluate(() => Orbits.push());
  await p.keyboard.press("ArrowRight");
  const pushQ = await p.evaluate(() => ({ push: Orbits.push(), active: GameShell.leaveActive() }));
  check("orbits: paused while aiming, the arrows don't turn the push; with no comet in the air, leaving has nothing to ask about",
    pushQ.push.join() === pushP.join() && !pushQ.active, { pushP, pushQ });
  await done(p, "pause");
  await ctx.close();

  // ---- Visual FX off: the same flight at the same pace (a fake clock, so
  // every frame lands at the same moment), the same things drawn; the sun's
  // rays and the gates hold still, where with it on they turn and breathe
  {
    const c = await lib.newContext(browser);
    const q = await lib.open(c, base, "games/orbits/", { before: (pg) => pg.clock.install() });
    // (time stands still but for runFor: every frame at its own moment)
    await q.clock.pauseAt(await q.evaluate(() => Date.now() + 1000));
    const run = async () => {
      // (Restart clears the last flight, so the same push may go again)
      await q.evaluate((L) => { Orbits.start(0); Orbits.restart(); Orbits.setPush(L[0], L[1]); Orbits.launch(); }, LONG);
      await q.clock.runFor(1500);
      const a = await q.evaluate(() => ({ t: Orbits.flight().t, hash: Orbits.flight().hash, d: Orbits.drawn() }));
      await q.clock.runFor(500);
      const b = await q.evaluate(() => Orbits.drawn());
      await q.evaluate(() => { Orbits.skip(); Orbits.toMenu(); });
      await q.clock.runFor(100);
      return { t: a.t, hash: a.hash, fx: a.d.fx, art: [a.d.suns.length, a.d.gates.length, a.d.dust, a.d.moons.length, !!a.d.comet, a.d.tail > 0].join(), rays: [a.d.rays, b.rays], breath: [a.d.breath, b.breath] };
    };
    const on = await run();
    await q.keyboard.press("v"); await q.clock.runFor(100);
    const off = await run();
    // (1.5 s at 240 steps a second, less the part of a frame before the launch)
    check("orbits: with Visual FX off the comet flies the same flight at the same pace (fake clock, 1.5 s: 360 steps, within a frame) and the same things are drawn, tail and all",
      on.fx === true && off.fx === false && on.hash === off.hash && Math.abs(on.t - off.t) <= 4.5 && on.t > 350 && on.t <= 360.5 && off.t > 350 && off.t <= 360.5 && on.art === off.art, { on, off });
    check("orbits: Visual FX on, the sun's rays turn and the gates breathe; off, they hold still",
      on.rays[0] !== on.rays[1] && on.breath[0] !== on.breath[1] && off.rays.join() === "0,0" && off.breath.join() === "0,0", { on: [on.rays, on.breath], off: [off.rays, off.breath] });
    check("orbits (FX): no page errors", q.errs.length === 0, q.errs);
    await c.close();
  }

  // ---- the games page's reset clears the counts and keeps the chart picked
  {
    const c = await lib.newContext(browser);
    const hub = await lib.open(c, base, "games/", { waitCorner: false, before: (pg) => pg.addInitScript(() => {
      try { localStorage.setItem("orbits_best", '{"0":3}'); localStorage.setItem("orbits_go", '{"1":{"t":2,"a":0,"s":150,"la":0,"ls":150}}'); localStorage.setItem("orbits_chart", "1"); } catch (e) {}
    }) });
    const keys = () => hub.evaluate(() => Object.keys(localStorage).filter((k) => /^orbits_/.test(k)).sort().join());
    const had = await keys();
    await hub.click("#reset-scores"); await hub.waitForTimeout(150);
    await hub.keyboard.press("Escape"); await hub.waitForTimeout(250);
    const kept = await keys();
    check("orbits: the games page's reset clears the charts' counts and the launches on charts not yet charted, and keeps the chart picked",
      had === "orbits_best,orbits_chart,orbits_go" && kept === "orbits_chart", { had, kept });
    await c.close();
  }

  // ---- phones and laptops: the menu shows whole (its heading below the
  // corner buttons, every tile), and in play the chart, the log and the
  // helm's buttons sit inside the screen, clear of each other and of the
  // corner buttons
  {
    const SIZES = [[320, 568, true], [360, 560, true], [390, 664, true], [750, 340, true], [1366, 657, false], [1280, 600, false], [1280, 900, false]];
    const bad = [];
    for (const [w, h, phone] of SIZES) {
      const c = await lib.newContext(browser, phone ? { viewport: { width: w, height: h }, isMobile: true, hasTouch: true } : { viewport: { width: w, height: h } });
      // (the menu at its tallest: twelve charts charted, counts of two figures,
      // the next one with a go of 15 launches)
      const q = await lib.open(c, base, "games/orbits/", { before: (pg) => pg.addInitScript(() => { try { const b = {}; for (let i = 0; i < 12; i++) b[i] = 12 + i; localStorage.setItem("orbits_best", JSON.stringify(b)); localStorage.setItem("orbits_go", JSON.stringify({ 12: { t: 15, a: 0, s: 200, la: 0, ls: 200 } })); } catch (e) {} }) });
      const look = (inPlay) => q.evaluate(({ w, inPlay }) => {
        const r = (e) => e.getBoundingClientRect(), out = [];
        const over = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        if (Math.max(document.documentElement.scrollWidth, innerWidth) - w > 1) out.push("wider than the screen");
        const corner = [document.querySelector(".nav-back-games"), ...document.querySelectorAll(".gs-corner > *")].filter((e) => e.getClientRects().length).map(r);
        if (!inPlay) {
          const h1 = r(document.querySelector("#menu .card h1")), cb = Math.max(...corner.map((c) => c.bottom));
          if (h1.top < cb) out.push("heading under the corner buttons");
          const tiles = [...document.querySelectorAll("#grid .lv")].filter((t) => t.getClientRects().length && getComputedStyle(t).visibility !== "hidden");
          if (tiles.length !== 30) out.push("tiles " + tiles.length);
          const panel = document.getElementById("menu"), card = r(panel.querySelector(".card"));
          if (card.right > innerWidth + 1 || card.left < -1) out.push("card off the side");
          // (the whole card on the screen: nothing to scroll to)
          if (panel.scrollHeight > panel.clientHeight + 1) out.push("menu scrolls " + (panel.scrollHeight - panel.clientHeight));
        } else {
          const ch = r(document.getElementById("chart")), log = r(document.getElementById("log"));
          const btns = [...document.querySelectorAll("#helm button")].map(r);
          const inside = (b) => b.left >= -1 && b.top >= -1 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1;
          if (!inside(ch)) out.push("chart off the screen");
          if (ch.width < 200) out.push("chart only " + Math.round(ch.width));
          if (!inside(log)) out.push("log off the screen");
          btns.forEach((b, i) => { if (!inside(b)) out.push("button " + i + " off the screen"); if (over(b, ch)) out.push("button " + i + " over the chart"); });
          if (over(log, ch)) out.push("log over the chart");
          corner.forEach((c, i) => { if (over(c, ch)) out.push("corner " + i + " over the chart"); if (over(c, log)) out.push("corner " + i + " over the log"); btns.forEach((b, j) => { if (over(c, b)) out.push("corner " + i + " over button " + j); }); });
          const keys = r(document.querySelector("#helm .keys"));
          if (keys.bottom > innerHeight + 1) out.push("keys line cut off");
        }
        return out;
      }, { w, inPlay });
      const m = await look(false);
      // in play at its tallest: a go of 15 launches and its trace, then a
      // launch that misses (the longest line under the chart), a chart flown
      // again with a long name and a count of two figures, and the moons'
      // plate with its longest hint
      await q.evaluate(() => Orbits.start(12)); await q.waitForTimeout(150);
      const g = await look(true);
      await q.evaluate(() => { const L = Orbits.level(); Orbits.setPush(L.push[0] + 7, L.push[1]); Orbits.launch(); Orbits.skip(); }); await q.waitForTimeout(150);
      const g2 = await look(true);
      await q.evaluate(() => Orbits.start(11)); await q.waitForTimeout(150);
      const g3 = await look(true);
      await q.evaluate(() => Orbits.start(25)); await q.waitForTimeout(150);
      const g4 = await look(true);
      const all = m.concat(g, g2.map((x) => "after a miss: " + x), g3.map((x) => "flown again: " + x), g4.map((x) => "plate VI: " + x));
      if (all.length) bad.push(w + "x" + h + ": " + all.join("; "));
      if (q.errs.length) bad.push(w + "x" + h + " errors: " + q.errs.join("; "));
      await c.close();
    }
    check("orbits: on phones (320, 360, 390 upright, 750 x 340 on the side) and laptops (1366 x 657, 1280 x 600, 1280 x 900) the menu fits whole with nothing to scroll, and in play the chart, the log and every button fit, clear of each other and of the corner buttons",
      bad.length === 0, bad);
  }
};

// a push for each chart, [bearing, strength] in tenths, found by
// _dev/tools/orbits-check.js (the middle of a patch of pushes that chart it)
const SOLUTIONS = [[0,125],[5,130],[270,220],[2120,105],[1250,105],[1075,495],[365,585],[2645,250],[660,425],[3355,310],[2630,220],[2510,255],[1565,100],[0,260],[230,105],[760,500],[1755,90],[955,280],[30,370],[1860,350],[170,195],[850,185],[1280,180],[940,280],[340,85],[1125,530],[1090,125],[3325,435],[900,305],[320,110]];
