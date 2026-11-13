// Metazac: on the start and game-over cards Enter / Space start a game, but
// not when a focused control acts on the key itself (Space ticks a setting,
// Enter presses a button); a mouse click leaves no button focused; division
// never shows a 0 divisor; the storm button's SPACE tag hides on touch. On a
// phone (no Return key on a number pad) a Pop ✓ button answers, keeping the
// answer box focused, and the key hints name the buttons instead. P pauses,
// typed in the answer box too (it takes digits), and the card wears its
// keys (Resume P, Restart R, Menu ⌫); Esc is the way out, asking mid-run. On
// a laptop's short window the page fits whole, so play never scrolls it.
// 100 lives, a balloon that gets away costing its layers; the dart storm
// recharges in 30 s; V and M work from the answer box; the carnival's pennant.
const HOOK = ["  function endGame() {", "  window.__mz = { end: function () { endGame(); }, make: function () { return makeProblem(); },\n" +
  "    spawn: function () { spawnBloon(); return bloons[bloons.length - 1].ans; }, score: function () { return score; },\n" +
  "    points: function () { return typeof points === 'undefined' ? [] : points.map(function (p) { return { x: p.x, y: p.y, n: p.n, t: p.t }; }); } };\n  function endGame() {"];
// the frames by hand: requestAnimationFrame queues, __frames(n) runs n of 1/60 s
const STEPPED = () => {
  let t = 1000, q = [];
  performance.now = () => t;
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.__frames = (n) => { for (let i = 0; i < n; i++) { t += 1000 / 60; const run = q; q = []; run.forEach((cb) => cb(t)); } };
};

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const open = () => lib.open(ctx, base, "games/metazac/", { before: (pg) => lib.injectScript(pg, "games/metazac/game.js", [HOOK]) });
  const screen = (p) => p.evaluate(() => ({
    start: !document.getElementById("overlay-start").classList.contains("hidden"),
    over: !document.getElementById("overlay-over").classList.contains("hidden"),
  }));

  // ---- keys on the start card
  let p = await open();
  await p.focus("#mul-on");
  await p.keyboard.press(" "); await p.waitForTimeout(100);
  const space = { checked: await p.evaluate(() => document.getElementById("mul-on").checked), screen: await screen(p) };
  check("metazac: Space on a focused setting ticks it and doesn't start a game", space.checked === false && space.screen.start, space);
  await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(300);
  await p.click("#sub-on"); await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const clicked = { sub: await p.evaluate(() => document.getElementById("sub-on").checked), screen: await screen(p) };
  check("metazac: click a setting, then Enter starts the game", clicked.sub === false && !clicked.screen.start, clicked);

  // ---- the game-over card: Enter on a focused Main Menu goes to the menu
  await p.evaluate(() => __mz.end()); await p.waitForTimeout(800);
  await p.focus("#menu-btn"); await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const menu = await screen(p);
  check("metazac: Enter on a focused Main Menu button goes to the menu, not a new game", menu.start && !menu.over, menu);

  // ---- a mouse click doesn't leave a card button focused (Tab still reaches them)
  const held = await p.evaluate(() => ["start-btn", "retry-btn", "menu-btn"].filter((id) => {
    const e = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    document.getElementById(id).dispatchEvent(e);
    return !e.defaultPrevented;
  }));
  check("metazac: a mouse click leaves no Start / Play Again / Main Menu button focused", held.length === 0, held);

  // ---- the storm button's key tag is a hint that hides on touch
  check("metazac: the storm button's SPACE tag hides on touch (in .gs-keys)", await p.evaluate(() => !!document.querySelector("#power-btn .gs-keys .power-key")));
  check("metazac: no page errors (keys)", p.errs.length === 0, p.errs);
  await p.close();

  // ---- division with a 0 in the multiplication ranges: never "… / 0"
  p = await open();
  await p.evaluate(() => {
    ["add-on", "sub-on", "mul-on"].forEach((id) => { document.getElementById(id).checked = false; });
    document.getElementById("div-on").checked = true;
    [["mul-min1", 0], ["mul-max1", 0], ["mul-min2", 0], ["mul-max2", 3]].forEach(([id, v]) => { document.getElementById(id).value = v; });
  });
  await p.click("#start-btn"); await p.waitForTimeout(100);
  const bad = await p.evaluate(() => {
    const out = [];
    for (let i = 0; i < 200; i++) {
      const q = __mz.make(), m = /^(\d+) \/ (\d+)$/.exec(q.text);
      if (!m || +m[2] === 0 || +m[1] / +m[2] !== q.ans) out.push(q.text + " = " + q.ans);
    }
    return out;
  });
  check("metazac: division never divides by 0, even with 0 in the multiplication ranges", bad.length === 0, bad.slice(0, 5));
  check("metazac: no page errors (division)", p.errs.length === 0, p.errs);
  await p.close();

  // ---- key hints and the Pop ✓ button: keys on a desktop, buttons on a phone
  const { devices } = require("@playwright/test");
  const shows = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).display !== "none" : null; }, sel);
  const hints = async (p) => ({
    pop: await shows(p, "#pop-btn"),
    hintKeys: await shows(p, ".hint .gs-keys"), hintTouch: await shows(p, ".hint .gs-touch"),
    noteKeys: await shows(p, ".power-note .gs-keys"), noteTouch: await shows(p, ".power-note .gs-touch"),
  });
  p = await open();
  const desk = await hints(p);
  check("metazac, desktop: the hints name Enter and Space, and there's no Pop button",
    desk.pop === false && desk.hintKeys && desk.hintTouch === false && desk.noteKeys && desk.noteTouch === false, desk);
  await p.close();

  const phone = await lib.newContext(browser, devices["Pixel 7"]);
  p = await lib.open(phone, base, "games/metazac/", { before: (pg) => lib.injectScript(pg, "games/metazac/game.js", [HOOK]) });
  const ph = await hints(p);
  check("metazac, phone: the hints name the Pop and dart buttons, not keys, and the Pop button shows",
    ph.pop === true && ph.hintKeys === false && ph.hintTouch && ph.noteKeys === false && ph.noteTouch, ph);
  await p.tap("#start-btn"); await p.waitForTimeout(200);
  const ans = await p.evaluate(() => __mz.spawn());
  await p.locator("#answer").fill(String(ans));
  await p.tap("#pop-btn"); await p.waitForTimeout(100);
  const right = await p.evaluate(() => ({ score: __mz.score(), value: document.getElementById("answer").value, focused: document.activeElement && document.activeElement.id }));
  await p.locator("#answer").fill("987654");
  await p.tap("#pop-btn"); await p.waitForTimeout(50);
  const wrong = await p.evaluate(() => ({ red: document.getElementById("answer").classList.contains("wrong"), value: document.getElementById("answer").value, focused: document.activeElement && document.activeElement.id }));
  check("metazac, phone: Pop ✓ answers like Enter (pops a match, flags a miss) and keeps the answer box focused",
    right.score > 0 && right.value === "" && right.focused === "answer" && wrong.red && wrong.value === "" && wrong.focused === "answer", { right, wrong });
  check("metazac, phone: no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await phone.close();

  // ---- P pauses (from the answer box: it takes digits, so P is nobody's
  // letter), the card wearing each button's key; P resumes, the box back in
  // hand; Esc mid-run asks "Leave this game?", the run paused under the box
  {
    const q = await open();
    await q.click("#start-btn"); await q.waitForTimeout(400);
    await q.evaluate(() => __mz.spawn());
    await q.keyboard.type("1"); await q.keyboard.press("p"); await q.waitForTimeout(150);
    const paused = await q.evaluate(() => { const c = document.querySelector(".gs-pause:not(.gs-dialog)"); return { up: !!c && !c.hidden, btns: c ? [...c.querySelectorAll("button")].filter((b) => !b.hidden).map((b) => b.textContent.replace(/\s+/g, " ").trim()).join(" | ") : "", box: document.getElementById("answer").value, shut: document.getElementById("answer").disabled }; });
    await q.keyboard.press("p"); await q.waitForTimeout(150);
    const back = await q.evaluate(() => ({ up: !document.querySelector(".gs-pause:not(.gs-dialog)").hidden, box: document.getElementById("answer").value, focused: document.activeElement.id }));
    await q.evaluate(() => { __mz.spawn(); });
    await q.keyboard.press("Escape"); await q.waitForSelector(".gs-dialog", { timeout: 5000 }).catch(() => {});
    const asked = await q.evaluate(() => ({ dlg: (document.querySelector(".gs-dialog h2") || {}).textContent || null, under: !document.querySelector(".gs-pause:not(.gs-dialog)").hidden }));
    await q.keyboard.press("Enter"); await q.waitForFunction(() => !document.querySelector(".gs-dialog"), null, { timeout: 5000 }).catch(() => {});   // (Keep playing: Enter sends answers here, so it mustn't leave)
    check("metazac: P pauses from the answer box (no p typed), the card wearing Resume P, Restart R, Menu ⌫; P resumes with the box in hand; Esc mid-run asks 'Leave this game?' with the run paused under it",
      paused.up && /Resume P \| .*Restart R \| .*Menu ⌫$/.test(paused.btns) && paused.box === "1" && paused.shut && !back.up && back.box === "1" && back.focused === "answer" &&
      asked.dlg === "Leave this game?" && asked.under && q.leaves === 0, { paused, back, asked, leaves: q.leaves });
    check("metazac (P pauses): no page errors", q.errs.length === 0, q.errs);
    await q.close();
  }

  // ---- a popped balloon's points (+1 to +5) show small over its burst once
  // the dart lands: the number it scored, white, rising as it fades with
  // Visual FX on; with it off the same number in the same place, only
  // fading; gone in 0.8 s; a pause holds it
  for (const off of [false, true]) {
    const q = await lib.open(ctx, base, "games/metazac/", { before: async (pg) => {
      await pg.addInitScript(STEPPED); await pg.addInitScript((o) => localStorage.setItem("reduceMotion:metazac", o ? "1" : "0"), off);
      await lib.injectScript(pg, "games/metazac/game.js", [HOOK]);
    } });
    await q.evaluate(() => __frames(2));
    await q.click("#start-btn");
    const ans = await q.evaluate(() => { __frames(2); return __mz.spawn(); });
    await q.evaluate(() => __frames(150));   // (well along the track, clear of the start and the bunting)
    await q.locator("#answer").fill(String(ans));
    const before = await q.evaluate(() => __mz.score());
    await q.keyboard.press("Enter");
    const r = await q.evaluate(() => {
      const cv = document.getElementById("game"), g = cv.getContext("2d"), k = cv.width / 900, out = { frames: [] };
      const p0 = __mz.points()[0];
      // (pure white pixels round the number, and their middle: the burst is cream, the number white)
      const white = (p) => {
        const x0 = Math.round((p.x - 24) * k), y0 = Math.round((p.y - 40) * k), d = g.getImageData(x0, y0, Math.round(48 * k), Math.round(56 * k)).data, w = Math.round(48 * k);
        let n = 0, sy = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 248 && d[i + 1] > 248 && d[i + 2] > 248) { n++; sy += Math.floor(i / 4 / w); }
        return { n, y: n ? +(y0 / k + sy / n / k).toFixed(1) : null };
      };
      out.made = p0 ? { n: p0.n, t: +p0.t.toFixed(3), count: __mz.points().length } : null;
      if (!p0) return out;
      __frames(3); out.waiting = { t: +__mz.points()[0].t.toFixed(3), ink: white(p0).n };
      __frames(4); out.shown = Object.assign({ t: +__mz.points()[0].t.toFixed(3) }, white(p0));
      __frames(20); out.later = Object.assign({ t: +__mz.points()[0].t.toFixed(3) }, white(p0));
      // a pause holds it
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "p", code: "KeyP", bubbles: true }));
      __frames(60); out.paused = +__mz.points()[0].t.toFixed(3);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "p", code: "KeyP", bubbles: true }));
      __frames(1); out.resumed = +__mz.points()[0].t.toFixed(3);
      __frames(14); out.fading = white(p0);
      __frames(20); out.gone = { count: __mz.points().length, ink: white(p0).n };
      return out;
    });
    r.scored = (await q.evaluate(() => __mz.score())) - before;
    // (popped the moment it comes in at the start, still off the map's left edge: its points on the map)
    const a2 = await q.evaluate(() => __mz.spawn());
    await q.locator("#answer").fill(String(a2)); await q.keyboard.press("Enter");
    r.edge = await q.evaluate(() => { const p = __mz.points().pop(); return p ? p.x : null; });
    const fx = off ? "Visual FX off" : "Visual FX on";
    check(`metazac, ${fx}: a popped balloon's points show over its burst once the dart lands (not before), the number it scored, in white`,
      !!r.made && r.made.count === 1 && r.made.n === r.scored && r.scored >= 1 && r.made.t < 0 && r.waiting.ink <= r.gone.ink + 3 && r.shown.n > r.gone.ink + 6, r);
    check(`metazac, ${fx}: the points ` + (off ? "stay in one place, only fading" : "rise as they fade") + ", a pause holds them, and they're gone in 0.8 s",
      !!r.made && (off ? Math.abs(r.later.y - r.shown.y) < 1 : r.shown.y - r.later.y > 6) && r.fading.n < r.later.n &&
      r.paused === r.later.t && Math.abs(r.resumed - r.paused - 1 / 60) < 0.001 && r.gone.count === 0, r);
    check(`metazac, ${fx}: a balloon popped as it comes in at the start (half off the map) shows its points on the map`, r.edge === 18, { edge: r.edge });
    check(`metazac (points, ${fx}): no page errors`, q.errs.length === 0, q.errs);
    await q.close();
  }

  // ---- a laptop's short window (the stacked page is 953 px tall): the map
  // stands beside a column with the sign, stats and answer box, so the whole
  // page fits the window. Starting a game (the answer box takes the focus), a
  // wrong answer, a pause and a dart storm never scroll it; the start card
  // fits whole (over the map, or on a small map over the whole window);
  // nothing is under the corner buttons. So too a narrow short window and a
  // touch screen on its side, down to an iPhone SE's (t: touch).
  for (const [w, h, t] of [[1366, 657], [1280, 600], [1024, 600], [800, 600], [1024, 768, 1], [844, 390, 1], [667, 375, 1]]) {
    const c = await lib.newContext(browser, Object.assign({ viewport: { width: w, height: h } }, t ? { hasTouch: true, isMobile: true } : {}));
    const q = await lib.open(c, base, "games/metazac/", { before: (pg) => lib.injectScript(pg, "games/metazac/game.js", [HOOK]) });
    const at = () => q.evaluate(() => ({ y: Math.round(scrollY), tall: document.documentElement.scrollHeight - innerHeight, wide: document.documentElement.scrollWidth - innerWidth }));
    const menu = await q.evaluate(() => {
      const box = (e) => e.getBoundingClientRect(), o = document.getElementById("overlay-start");
      const corner = [...document.querySelectorAll(".nav-back-games, .gs-corner > *")].filter((e) => e.getClientRects().length).map(box);
      const parts = ["#game", ".title", ".stats", "#answer", "#power-btn"].map((s) => document.querySelector(s)).map(box);
      const meet = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      return { cardScroll: o.scrollHeight - o.clientHeight, under: parts.filter((p) => corner.some((k) => meet(p, k))).length, map: Math.round(box(document.getElementById("game")).width) };
    });
    const steps = { menu: await at() };
    if (t) await q.evaluate(() => document.getElementById("start-btn").click()); else await q.keyboard.press("Enter");
    await q.waitForTimeout(400);
    steps.start = await at();
    await q.evaluate(() => __mz.spawn());
    await q.keyboard.type("99999"); await q.keyboard.press("Enter"); await q.waitForTimeout(150);
    steps.wrong = await at();
    await q.keyboard.press("p"); await q.waitForTimeout(150); await q.keyboard.press("p"); await q.waitForTimeout(150);
    steps.resumed = await at();
    await q.keyboard.press(" "); await q.waitForTimeout(300);
    steps.storm = await at();
    const focused = await q.evaluate(() => document.activeElement.id);
    const what = "metazac, a " + w + " x " + h + (t ? " touch screen" : " window");
    check(what + ": the whole page fits, and starting a game, a wrong answer, a pause and a dart storm never scroll it",
      Object.values(steps).every((s) => s.y === 0 && s.tall <= 0 && s.wide <= 0) && focused === "answer", { steps, focused });
    check(what + ": the start card fits whole, and nothing is under the corner buttons",
      menu.cardScroll <= 0 && menu.under === 0 && menu.map >= 400, menu);
    check(what + ": no page errors", q.errs.length === 0, q.errs);
    await c.close();
  }

  // ---- an upright phone's start card: each sum's two ranges on one line,
  // the boxes whole on the card, and a three digit number whole in its box
  const lines = {};
  for (const [w, h] of [[320, 568], [360, 640], [390, 664], [430, 932]]) {
    const c = await lib.newContext(browser, { viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const q = await lib.open(c, base, "games/metazac/");
    lines[w] = await q.evaluate(() => [...document.querySelectorAll(".opt .range")].map((rg) => {
      const ins = [...rg.querySelectorAll("input")], box = rg.closest(".settings").getBoundingClientRect();
      const rows = new Set(ins.map((i) => Math.round(i.getBoundingClientRect().top))).size;
      const inside = ins.every((i) => { const r = i.getBoundingClientRect(); return r.left >= box.left && r.right <= box.right; });
      const whole = ins.every((i) => { const v = i.value; i.value = "100"; const ok = i.scrollWidth <= i.clientWidth + 1; i.value = v; return ok; });
      return { rows, inside, whole };
    }));
    await c.close();
  }
  check("metazac, phones 320 to 430 px: each sum's two ranges stay on one line, on the card, a three digit number whole in each box",
    Object.values(lines).every((l) => l.length === 2 && l.every((r) => r.rows === 1 && r.inside && r.whole)), lines);

  // ---- lives: 100 to start, shown as a number; a balloon that gets away
  // costs its layers as in Bloons (red 1, blue 2, green 3, yellow 4, pink 5);
  // at 0 the game is over and the count stays at 0. The dart storm recharges
  // in 30 s on the game's clock: a pause doesn't run it down.
  const HOOK2 = ["  function powerReady() {", "  window.__mz2 = { lives: function () { return lives; }, cd: function () { return power.cd; }, state: function () { return state; },\n" +
    "    leak: function (color) { spawnBloon(); var b = bloons[bloons.length - 1]; b.color = color; b.speed = COLORS[color].speed; b.dist = TOTAL - 0.01; } };\n  function powerReady() {"];
  {
    const c = await lib.newContext(browser);
    const q = await lib.open(c, base, "games/metazac/", { before: async (pg) => { await pg.addInitScript(STEPPED); await lib.injectScript(pg, "games/metazac/game.js", [HOOK, HOOK2]); } });
    const r = await q.evaluate(() => {
      const hud = () => document.getElementById("lives-val").textContent;
      __frames(2); document.getElementById("start-btn").click(); __frames(2);
      const out = { start: [__mz2.lives(), hud()], steps: [] };
      for (const color of ["red", "blue", "green", "yellow", "pink"]) { __mz2.leak(color); __frames(2); out.steps.push(color + " " + __mz2.lives() + " " + hud()); }
      let n = 0;
      while (__mz2.state() === "playing" && n < 40) { __mz2.leak("pink"); __frames(2); n++; }
      out.end = [__mz2.state(), __mz2.lives(), hud(), n];
      out.how = document.querySelector("#overlay-start .board > p").textContent.replace(/\s+/g, " ");
      return out;
    });
    check("metazac: 100 lives to start, a number on the panel; a balloon that gets away costs red 1, blue 2, green 3, yellow 4, pink 5; the game ends at 0 and the panel shows 0; How to play says so",
      r.start[0] === 100 && r.start[1] === "100" && r.steps.join() === "red 99 99,blue 97 97,green 94 94,yellow 90 90,pink 85 85" &&
      r.end[0] === "over" && r.end[1] === 0 && r.end[2] === "0" && r.end[3] === 17 && /100 lives/.test(r.how) && /1 \(red\) to 5 \(pink\)/.test(r.how), r);
    check("metazac (lives): no page errors", q.errs.length === 0, q.errs);
    await c.close();
  }
  {
    const c = await lib.newContext(browser);
    const q = await lib.open(c, base, "games/metazac/", { before: async (pg) => { await pg.addInitScript(STEPPED); await lib.injectScript(pg, "games/metazac/game.js", [HOOK, HOOK2]); } });
    await q.evaluate(() => { __frames(2); document.getElementById("start-btn").click(); __frames(2); });
    await q.keyboard.press(" ");
    const r = await q.evaluate(() => {
      const face = () => document.getElementById("power-num").textContent;
      __frames(3);
      const out = { fired: [+__mz2.cd().toFixed(2), face()] };
      return out;
    });
    await q.keyboard.press("p");
    r.paused = await q.evaluate(() => { __frames(180); return [+__mz2.cd().toFixed(2), document.getElementById("power-num").textContent]; });
    await q.keyboard.press("p");
    r.resumed = await q.evaluate(() => { __frames(60); return [+__mz2.cd().toFixed(2), document.getElementById("power-num").textContent]; });
    r.note = await q.evaluate(() => document.querySelector(".power-note").textContent.replace(/\s+/g, " "));
    check("metazac: the dart storm recharges in 30 s (the button counts 30s down), held while paused (3 s paused: still 30s), and How to play says 30 seconds",
      r.fired[0] > 29.9 && r.fired[0] <= 30 && r.fired[1] === "30s" && r.paused[0] === r.fired[0] && r.paused[1] === "30s" &&
      r.resumed[0] > 28.9 && r.resumed[0] < 29.1 && r.resumed[1] === "29s" && /recharges in 30 seconds/.test(r.note), r);
    check("metazac (storm): no page errors", q.errs.length === 0, q.errs);
    await c.close();
  }

  // ---- V and M (and ] and [) toggle Visual FX and sound everywhere: on the
  // start card, in its number boxes, in play with the answer box focused
  // (nothing typed into it) and while paused; the corner buttons name them
  {
    const c = await lib.newContext(browser);
    const q = await lib.open(c, base, "games/metazac/");
    const st = () => q.evaluate(() => ({ fx: RM_ON(), mute: MUTE_ON(), box: document.getElementById("answer").value }));
    const flips = async () => {
      const out = [];
      for (const k of ["v", "m", "]", "["]) { const a = await st(); await q.keyboard.press(k); const b = await st(); if ((k === "v" || k === "]" ? a.fx === b.fx : a.mute === b.mute) || b.box !== a.box) out.push(k); }
      return out;
    };
    const bad = {};
    bad.menu = await flips();
    await q.click("#add-max1"); bad.numberBox = await flips();
    await q.evaluate(() => document.activeElement.blur());
    await q.evaluate(() => document.getElementById("start-btn").click()); await q.waitForTimeout(300);
    await q.keyboard.type("5");
    bad.play = await flips();
    const typed = await q.evaluate(() => ({ box: document.getElementById("answer").value, focus: document.activeElement.id }));
    await q.keyboard.press("p"); await q.waitForTimeout(150); bad.paused = await flips();
    const titles = await q.evaluate(() => [document.querySelector(".rm-toggle").title, document.querySelector(".mute-toggle").title]);
    check("metazac: V / ] toggle Visual FX and M / [ sound on the start card, in its number boxes, in play from the answer box (5 kept, no letter typed) and while paused; the corner buttons name the keys",
      Object.values(bad).every((x) => !x.length) && typed.box === "5" && typed.focus === "answer" && /V or \]$/.test(titles[0]) && /M or \[$/.test(titles[1]), { bad, typed, titles });
    check("metazac (V and M): no page errors", q.errs.length === 0, q.errs);
    await c.close();
  }

  // ---- the carnival's pennant, "SAM LU'S CARNIVAL", flies from a pole
  // beside the marquee sign, or where the sign's line has no room, at the
  // foot of the side column; on the first screen and in play, inside the
  // window, both lines on the flag, on nothing else (the sign, the subtitle,
  // the stats, the map, the answer box and its buttons, the hint, the corner
  // buttons); no "made by" line
  {
    const T = { hasTouch: true, isMobile: true };
    const SIZES = [[1280, 900], [1366, 657], [1280, 600], [1024, 600], [390, 664, T], [360, 640, T], [320, 568, T], [375, 553, T], [667, 375, T], [844, 390, T]];
    const bad = {}, seen = {}, errs = [];
    for (const [w, h, t] of SIZES) {
      const c = await lib.newContext(browser, Object.assign({ viewport: { width: w, height: h } }, t || {}));
      const q = await lib.open(c, base, "games/metazac/");
      for (const when of ["menu", "play"]) {
        if (when === "play") { await q.evaluate(() => document.getElementById("start-btn").click()); await q.waitForTimeout(400); }
        const m = await q.evaluate(() => {
          const pen = document.getElementById("pennant");
          const made = [...document.querySelectorAll("body *")].filter((e) => !e.children.length && /made by/i.test(e.textContent)).length;
          if (!pen) return { none: true, made };
          const R = (e) => e.getBoundingClientRect(), r = R(pen), flag = R(pen.querySelector(".flag")), foot = pen.classList.contains("foot");
          // (with its pole and the ball on top)
          const box = { l: r.left - 3, r: r.right + 2, t: r.top - 15, b: foot ? r.bottom : r.bottom + 7 };
          const meet = (q) => q.width && q.height && q.left < box.r && q.right > box.l && q.top < box.b && q.bottom > box.t;
          const on = [];
          for (const s of [".title", ".subtitle", ".stats", "#game", ".answer-line", ".hint", ".nav-back-games", ".gs-corner > *"])
            for (const e of document.querySelectorAll(s)) if (e.getClientRects().length && meet(R(e))) on.push(s);
          const lines = [...pen.querySelectorAll(".flag b")].map(R);
          return { text: pen.textContent.replace(/\s+/g, " ").trim(), foot, made, on,
            inside: box.l >= 0 && box.r <= innerWidth && box.t >= 0 && box.b <= innerHeight,
            onFlag: lines.length === 2 && lines.every((x) => x.left >= flag.left && x.right <= flag.right && x.top >= flag.top - 1 && x.bottom <= flag.bottom + 1) };
        });
        const key = w + "x" + h + " " + when;
        seen[key] = m.none ? "none" : m.foot ? "foot" : "beside the sign";
        if (m.none || m.made || m.text !== "SAM LU’S CARNIVAL" || !m.inside || m.on.length || !m.onFlag) bad[key] = m;
      }
      errs.push(...q.errs);
      await c.close();
    }
    check("metazac: \"SAM LU'S CARNIVAL\" flies on a pennant beside the sign (or at the column's foot), on the first screen and in play, inside the window, on nothing else; no \"made by\" line (laptops 1280x900, 1366x657, 1280x600, 1024x600; phones 320 to 390 and on their side)",
      Object.keys(bad).length === 0, Object.keys(bad).length ? bad : seen);
    check("metazac (pennant): no page errors", errs.length === 0, errs);
  }

  // ---- the pennant ripples with Visual FX on (now and then, from the pole),
  // holds still while paused, and stays still with Visual FX off
  {
    const flutter = {};
    for (const off of [false, true]) {
      const c = await lib.newContext(browser);
      const q = await lib.open(c, base, "games/metazac/", { before: async (pg) => { if (off) await pg.addInitScript(() => { try { localStorage.setItem("reduceMotion:metazac", "1"); } catch (e) {} }); } });
      const look = () => q.evaluate(() => { const f = document.querySelector("#pennant .flag"); if (!f) return {}; const cs = getComputedStyle(f); return { name: cs.animationName, state: cs.animationPlayState }; });
      const r = { menu: await look() };
      await q.evaluate(() => document.getElementById("start-btn").click()); await q.waitForTimeout(300);
      await q.keyboard.press("p"); await q.waitForTimeout(150);
      r.paused = await look();
      await q.keyboard.press("p"); await q.waitForTimeout(150);
      r.resumed = await look();
      // (the ripple itself: the flag at 74% of its turn is skewed, at rest at the start)
      r.shape = await q.evaluate(() => {
        const f = document.querySelector("#pennant .flag"), a = f && f.getAnimations()[0];
        if (!f) return null;
        if (!a) return getComputedStyle(f).transform;
        const at = (k) => { a.currentTime = k * 3600; return getComputedStyle(f).transform; };
        return [at(0.3), at(0.74)];
      });
      flutter[off ? "off" : "on"] = r;
      await c.close();
    }
    const on = flutter.on, off = flutter.off;
    check("metazac: with Visual FX on the pennant ripples now and then (still at rest, skewed partway through its turn), held still while paused; with it off it stays still",
      on.menu.name === "mzPennant" && on.menu.state === "running" && on.paused.state === "paused" && on.resumed.state === "running" &&
      Array.isArray(on.shape) && on.shape[0] === "none" && on.shape[1] !== "none" &&
      off.menu.name === "none" && off.paused.name === "none" && off.shape === "none", flutter);
  }

  await ctx.close();
};
