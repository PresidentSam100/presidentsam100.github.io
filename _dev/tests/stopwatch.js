// Stopwatch: Ctrl / Alt + Space or Enter are left to the browser; a plain
// Space still sets the sweep going. A sweep under way when the window loses
// focus is called off, and a new mark is dealt. The end card: Backspace goes
// to the modes, Esc leaves, and neither it nor Space acts in its first second.
// On the start card, Enter on a focused lid button only picks that lid.
// (Math.random takes queued values first, so the marks dealt are known.)
const RANDOM = (pg) => pg.addInitScript(() => {
  const real = Math.random;
  window.__rand = [];
  Math.random = () => (window.__rand.length ? window.__rand.shift() : real());
});

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/stopwatch/", { before: RANDOM });
  const phase = () => p.evaluate(() => document.querySelector(".stage").dataset.phase);
  await p.evaluate(() => { window.__rand = [0.35]; });   // the first mark: 4s
  await p.click("#btn-start"); await p.waitForTimeout(80);
  const ph0 = await phase();
  const claimed = [await lib.fireKey(p, { key: " ", code: "Space", ctrlKey: true }), await lib.fireKey(p, { key: "Enter", code: "Enter", altKey: true })];
  const ph1 = await phase();
  const plain = await lib.fireKey(p, { key: " ", code: "Space" });
  const ph2 = await phase();
  check("stopwatch: Ctrl / Alt + Space or Enter are left to the browser, a plain Space still starts the sweep",
    ph0 === "ready" && claimed.every((x) => !x) && ph1 === "ready" && plain && ph2 === "baking", { ph0, claimed, ph1, plain, ph2 });

  // a sweep under way when the window loses focus (or the tab is hidden) is
  // called off: not a miss, not a bust, and a new mark is dealt, so a botched
  // sweep can't be had again
  await p.waitForTimeout(300);
  const mark = await p.evaluate(() => document.getElementById("target-big").textContent);
  await p.evaluate(() => { window.__rand = [0.35, 0.75]; window.dispatchEvent(new Event("blur")); });   // 4s again is skipped: 8s
  await p.waitForTimeout(1500);   // past when a bust's end card would be up
  const off = await p.evaluate(() => ({ phase: document.querySelector(".stage").dataset.phase, sub: document.getElementById("sub").textContent,
    mark: document.getElementById("target-big").textContent, round: document.getElementById("round").textContent, score: document.getElementById("score").textContent,
    drift: document.getElementById("used").textContent, over: document.getElementById("overlay-card").classList.contains("show"), best: localStorage.getItem("stopwatch_best") }));
  await p.keyboard.press("Space");
  const again = await phase();
  check("stopwatch: a sweep under way when the window loses focus is called off (no miss, no bust, no best); START goes again",
    off.phase === "ready" && /called off/.test(off.sub) && off.round === "1" && off.score === "0" && off.drift === "0.000" && !off.over && off.best === null && again === "baking",
    { off, again });
  check("stopwatch: after a call-off the mark is a new one", mark === "4s" && off.mark === "8s", { mark, after: off.mark });

  // bust the run (stopped at 0.3 s on the 8s mark): the end card. Space and
  // Backspace in its first second do nothing; then Esc leaves for the games
  // page and Backspace goes back to the modes
  await p.waitForTimeout(300); await p.keyboard.press("Space");
  await p.waitForFunction(() => !!document.getElementById("btn-mode"), null, { timeout: 4000 });
  await p.keyboard.press("Space"); await p.keyboard.press("Backspace"); await p.waitForTimeout(80);
  const early = await p.evaluate(() => !!document.getElementById("btn-mode") && document.getElementById("overlay-card").classList.contains("show"));
  await p.waitForTimeout(1000);
  await p.keyboard.press("Escape"); await p.waitForTimeout(250);
  await lib.leftBy(p, 1);   // (counted when its request arrives: later on a busy machine)
  const esc = { card: await p.evaluate(() => !!document.getElementById("btn-mode") && document.getElementById("overlay-card").classList.contains("show")), leaves: p.leaves };
  await p.keyboard.press("Backspace"); await p.waitForTimeout(80);
  const modes = await p.evaluate(() => !!document.getElementById("btn-start") && document.querySelectorAll(".modebtn").length === 2);
  check("stopwatch: on the end card Esc leaves, Backspace goes back to the modes; neither it nor Space acts in the card's first second",
    early && esc.card && esc.leaves === 1 && modes && p.leaves === 1, { early, esc, modes, leaves: p.leaves });
  check("stopwatch: no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await ctx.close();

  // the hint names Space with a keyboard; on a touch-only device, just the tap
  const { devices } = require("@playwright/test");
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const c = await lib.newContext(browser, opts);
    const q = await lib.open(c, base, "games/stopwatch/");
    const hint = await q.evaluate(() => document.querySelector(".hint").innerText);
    const ok = label === "desktop" ? /^tap the watch or press Space or Enter: once/.test(hint) : /^tap the watch: once/.test(hint) && !/Space/.test(hint);
    check("stopwatch " + label + ": the hint " + (label === "desktop" ? "names Space and Enter" : "says tap the watch, no keys"), ok, hint);
    await q.close();
    await c.close();
  }

  // ---- the start card: Enter on a focused lid button picks that lid and
  // stays on the card (it used to open the case as well, with the old lid); a
  // lid picked with the mouse keeps no focus, so the next Enter opens the case
  {
    const c = await lib.newContext(browser);
    const q = await lib.open(c, base, "games/stopwatch/");
    const look = () => q.evaluate(() => ({ card: document.getElementById("overlay-card").classList.contains("show"), sel: document.querySelector(".modebtn.sel").getAttribute("data-mode"),
      pill: document.getElementById("mode-pill").textContent, focus: document.activeElement.tagName }));
    await q.focus('.modebtn[data-mode="visible"]'); await q.keyboard.press("Enter"); await q.waitForTimeout(150);
    const a = await look();
    await q.evaluate(() => document.activeElement.blur());
    await q.click('.modebtn[data-mode="hidden"]', { timeout: 3000 }).catch(() => {}); await q.waitForTimeout(80);
    const b = await look();
    await q.keyboard.press("Enter"); await q.waitForTimeout(150);
    const d = await look();
    check("stopwatch: Enter on a focused lid button only picks that lid; after a mouse pick (which keeps no focus) Enter opens the case",
      a.card && a.sel === "visible" && /Lid open/.test(a.pill) && b.card && b.sel === "hidden" && b.focus !== "BUTTON" && !d.card && /Lid shut/.test(d.pill), { a, b, d });
    check("stopwatch: no page errors (start card keys)", q.errs.length === 0, q.errs);
    await q.close();
    await c.close();
  }

  const FX = (off) => (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:stopwatch", off ? "1" : "0"); } catch (e) {} }, off);

  // ---- the gold mark: FX on, a new round's mark travels round the dial the
  // shorter way (a half turn clockwise) and settles on its second; START or
  // the pause card mid-way puts it there at once. FX off, it's there at once.
  // (A stepped clock: performance.now and the frames move only as the test
  // steps them, 1/60 s at a time, so a busy machine can't skip the glide.)
  {
    const STEPPED = () => {
      let t = 1000, q = [];
      performance.now = () => t;
      window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
      window.cancelAnimationFrame = () => { q = []; };
      window.__frames = (n) => { for (let i = 0; i < n; i++) { t += 1000 / 60; const run = q; q = []; run.forEach((cb) => cb(t)); } };
    };
    const HOOK = ["  function onStart() {", "  window.__sw = { stopOff: function (err) { onStart(); startStamp = performance.now() - (target + err) * 1000; onStop(); } };\n  function onStart() {"];
    const { devices } = require("@playwright/test");
    for (const [label, opts] of [["laptop", {}], ["phone", devices["Pixel 7"]]]) {
      const got = {};
      for (const off of [false, true]) {
        const c = await lib.newContext(browser, opts);
        const q = await lib.open(c, base, "games/stopwatch/", { before: async (pg) => {
          await RANDOM(pg); await pg.addInitScript(STEPPED); await FX(off)(pg);
          await lib.injectScript(pg, "games/stopwatch/game.js", [HOOK]);
        } });
        // the angle the mark is drawn at, frame by frame
        const watch = (n) => q.evaluate((n) => {
          const w = document.getElementById("sw-wedge"), at = () => { const m = /rotate\(([-\d.e]+)/.exec(w.getAttribute("transform") || "rotate(0"); return +(+m[1]).toFixed(2); };
          const out = [at()];
          for (let i = 0; i < n; i++) { __frames(1); out.push(at()); }
          return out;
        }, n);
        // the next round (its mark from the queue), after a sweep stopped 0.1 s out
        const next = async (r) => {
          await q.evaluate((r) => { window.__rand = [r]; __sw.stopOff(0.1); }, r);
          await q.waitForFunction(() => document.querySelector(".stage").dataset.phase === "ready", null, { timeout: 8000, polling: 50 });
        };
        const r = {};
        await q.evaluate(() => { window.__rand = [0.35]; });   // 4s
        await q.click("#btn-start");
        r.to4 = await watch(40);          // from the 10 at the top: 0 to 144
        await next(0.85); r.to9 = await watch(40);   // 4 to 9, a half turn: 144 to 324
        await next(0.65); r.to7 = await watch(40);   // 9 to 7, back the short way: 324 to 252
        if (!off) {
          // START five frames in: the mark is on its second as the sweep starts
          await next(0.15);               // 7 to 2: 252 to 72 (a half turn, clockwise)
          r.startMid = await watch(5);
          await q.keyboard.press("Space");
          r.started = { at: (await watch(20)), phase: await q.evaluate(() => document.querySelector(".stage").dataset.phase) };
          // the pause card five frames in: the same
          await next(0.45);               // 2 to 5: 72 to 180
          r.pauseMid = await watch(5);
          await q.keyboard.press("p");
          await q.waitForFunction(() => document.documentElement.classList.contains("sw-paused"), null, { timeout: 8000, polling: 50 }).catch(() => {});
          r.paused = await watch(20);
        }
        r.errs = q.errs;
        got[off ? "off" : "on"] = r;
        await q.close(); await c.close();
      }
      const on = got.on, offR = got.off;
      // a glide from a to b (b - a the way it turns): starts at a, moves on
      // within the way plus a little overshoot (no more than 3%), ends on the
      // second (its angle as the dial knows it, 0 to 360)
      const glide = (xs, a, d, end) => {
        const lo = Math.min(a, a + d) - Math.abs(d) * 0.03, hi = Math.max(a, a + d) + Math.abs(d) * 0.03;
        const mid = xs.filter((x) => Math.abs(x - a) > 0.5 && Math.abs(x - (a + d)) > 0.5 && x !== end);
        return xs[0] === a && xs[xs.length - 1] === end && mid.length >= 8 && xs.slice(0, -1).every((x) => x >= lo && x <= hi);
      };
      check("stopwatch (" + label + "), FX on: a new mark travels round the dial to its second, the shorter way (10 to 4 clockwise, 9 to 7 back), a half turn clockwise (4 to 9)",
        glide(on.to4, 0, 144, 144) && glide(on.to9, 144, 180, 324) && glide(on.to7, 324, -72, 252), { to4: on.to4, to9: on.to9, to7: on.to7 });
      check("stopwatch (" + label + "), FX on: START or the pause card mid-way puts the mark on its second at once",
        on.startMid.slice(1).some((x) => x > 252.5 && x < 432) && on.started.at.every((x) => x === 72) && on.started.phase === "baking" &&
        on.pauseMid.slice(1).some((x) => x > 72.5 && x < 180) && on.paused.every((x) => x === 180),
        { startMid: on.startMid, started: on.started, pauseMid: on.pauseMid, paused: on.paused });
      check("stopwatch (" + label + "), FX off: each new mark is on its second at once",
        [[offR.to4, 144], [offR.to9, 324], [offR.to7, 252]].every(([xs, b]) => xs.every((x) => x === b)), { to4: offR.to4, to9: offR.to9, to7: offR.to7 });
      check("stopwatch (" + label + "): no page errors (the mark)", on.errs.length === 0 && offR.errs.length === 0, [on.errs, offR.errs]);
    }
  }

  // ---- the velvet behind the watch: FX on, the sheen and every speck of
  // dust drift (waiting on START and through a sweep) and hold still under
  // the pause card; nothing in it comes round in under 12 s, so it keeps no
  // beat to count by. FX off: the same sheen and dust, held still. Behind
  // the page, never in the way of a tap, no sideways scroll. Laptop and phone.
  {
    const { devices } = require("@playwright/test");
    for (const [label, opts] of [["laptop", {}], ["phone", devices["Pixel 7"]]]) {
      const got = {};
      for (const off of [false, true]) {
        const c = await lib.newContext(browser, opts);
        const q = await lib.open(c, base, "games/stopwatch/", { before: FX(off) });
        const spots = () => q.evaluate(() => [...document.querySelectorAll(".velvet .sheen, .velvet .mote")].map((b) => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }));
        const moved = async () => {
          const a = await spots(); await q.waitForTimeout(1500); const b = await spots();
          return { all: a.length, moved: a.filter((x, i) => Math.hypot(x[0] - b[i][0], x[1] - b[i][1]) > 1).length };
        };
        const r = await q.evaluate(() => {
          const v = document.querySelector(".velvet"), w = document.querySelector(".case").getBoundingClientRect();
          if (!v) return { motes: 0, sheens: 0, behind: false, scroll: 0, anims: 0, shortest: 0 };
          const hit = document.elementFromPoint(w.left + w.width / 2, w.top + w.height / 2);
          const secs = (s) => s.split(",").map((x) => parseFloat(x) * (/ms/.test(x) ? 0.001 : 1));
          const durs = [...v.querySelectorAll("*")].map((e) => secs(getComputedStyle(e).animationDuration)[0]);
          return { motes: v.querySelectorAll(".mote").length, sheens: v.querySelectorAll(".sheen").length,
            behind: getComputedStyle(v).zIndex === "-1" && getComputedStyle(v).pointerEvents === "none" && !v.contains(hit),
            scroll: document.documentElement.scrollWidth - innerWidth, anims: v.getAnimations({ subtree: true }).length,
            shortest: Math.min(...durs) };
        });
        await q.click("#btn-start"); await q.waitForTimeout(150);
        r.ready = await moved();
        if (!off) {
          await q.keyboard.press("p");
          await q.waitForFunction(() => document.documentElement.classList.contains("sw-paused"), null, { timeout: 8000 }).catch(() => {});
          r.pausedMove = await moved();
          await q.keyboard.press("p");
          await q.waitForFunction(() => !document.documentElement.classList.contains("sw-paused"), null, { timeout: 8000 }).catch(() => {});
          r.resumedMove = await moved();
        }
        await q.keyboard.press("Space"); await q.waitForTimeout(100);
        r.sweep = await moved();
        r.sweeping = await q.evaluate(() => document.querySelector(".stage").dataset.phase);
        r.errs = q.errs;
        got[off ? "off" : "on"] = r;
        await q.close(); await c.close();
      }
      const on = got.on, offR = got.off, all = (m) => m.all > 2 && m.moved === m.all;
      check("stopwatch (" + label + "): the velvet's sheen and dust lie behind the page, never in the way of a tap, no sideways scroll",
        [on, offR].every((r) => r.motes >= 18 && r.sheens === 2 && r.behind && r.scroll <= 0), { on, off: offR });
      check("stopwatch (" + label + "), FX on: the sheen and every speck of dust drift, waiting on START and through a sweep; held still under the pause card, moving again after",
        all(on.ready) && on.pausedMove.moved === 0 && all(on.resumedMove) && all(on.sweep) && on.sweeping === "baking", on);
      check("stopwatch (" + label + "), FX on: nothing in the velvet comes round in under 12 s",
        on.anims === on.motes + on.sheens && on.shortest >= 12, { anims: on.anims, shortest: on.shortest });
      check("stopwatch (" + label + "), FX off: the same sheen and dust, held still",
        offR.motes === on.motes && offR.anims === 0 && offR.ready.moved === 0 && offR.sweep.moved === 0 && offR.sweeping === "baking", offR);
      check("stopwatch (" + label + "): no page errors (the velvet)", on.errs.length === 0 && offR.errs.length === 0, [on.errs, offR.errs]);
    }
  }
};
