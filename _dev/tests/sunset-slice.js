// Sunset Slice: once a Duel's bomb has gone off, the rest of that swipe cuts
// nothing (no points, no best) during the end beat. Modes on the pause card
// asks before throwing the run away.
// (The beat is stretched from 1.1s to 5s here: on a busy machine the swipe's
// mouse moves alone can outlast 1.1s, and a swipe after the beat proves nothing.)
const BEAT = ['finish("bomb", 1100);', 'finish("bomb", 5000);'];
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/sunset-slice/", { before: (pg) => lib.injectScript(pg, "games/sunset-slice/game.js", [BEAT]) });
  // a bomb and a peach that hang still, side by side; one swipe through both
  const geo = await p.evaluate(() => { SunsetSlice.start("duel"); SunsetSlice.hold(); SunsetSlice.spawn("bomb", 0.3, 0.5); SunsetSlice.spawn("peach", 0.7, 0.5); return { W: innerWidth, H: innerHeight }; });
  const y = geo.H * 0.5;
  await p.mouse.move(geo.W * 0.18, y); await p.mouse.down();
  await p.mouse.move(geo.W * 0.42, y, { steps: 3 });
  const mid = await p.evaluate(() => SunsetSlice.state());
  await p.mouse.move(geo.W * 0.82, y, { steps: 3 }); await p.mouse.up();
  const after = await p.evaluate(() => ({ s: SunsetSlice.state(), best: localStorage.getItem("sunsetslice_best_duel") }));
  await p.waitForFunction(() => SunsetSlice.state().state === "over", null, { timeout: 12000 });
  const msg = await p.evaluate(() => document.getElementById("over-msg").textContent);
  check("sunset-slice: after a Duel's bomb the rest of the swipe scores nothing",
    mid.state === "ending" && after.s.state === "ending" && after.s.score === 0 && after.s.objs === 1 && after.best === null && /^0 points/.test(msg),
    { mid: mid.state, after: after.s.state, score: after.s.score, objs: after.s.objs, best: after.best, msg });
  check("sunset-slice: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- Modes on the pause card asks before throwing the run away; Esc on
  // the box leaves it paused on the card; Quit goes to the modes
  const q = await lib.open(ctx, base, "games/sunset-slice/");
  const look = () => q.evaluate(() => {
    const d = document.querySelector(".gs-dialog"), s = SunsetSlice.state();
    return { state: s.state, paused: s.paused, card: !document.getElementById("pause").hidden, dlg: d ? d.querySelector("h2").textContent : null,
      ok: d ? [...d.querySelectorAll("button")].map((b) => b.textContent.trim()).join(" | ") : null };
  });
  await q.evaluate(() => { SunsetSlice.start("calm"); SunsetSlice.hold(); });
  await q.keyboard.press("p"); await q.waitForTimeout(100);
  await q.click("#quit"); await q.waitForTimeout(150);
  const a = await look();
  await q.keyboard.press("Escape"); await q.waitForTimeout(250);
  const b = await look();
  if (b.card) { await q.click("#quit"); await q.waitForTimeout(150); await q.keyboard.press("Enter"); await q.waitForTimeout(250); }
  const c = await look();
  check("sunset-slice: Modes on the pause card asks \"Quit this game?\"; Esc keeps the run paused on the card; Quit goes to the modes",
    a.state === "play" && a.paused && a.dlg === "Quit this game?" && /Quit/.test(a.ok) &&
    b.state === "play" && b.paused && b.card && !b.dlg && q.leaves === 0 &&
    c.state === "menu" && !c.paused && !c.card && !c.dlg, { a, b, c, leaves: q.leaves });

  // ---- (guard) a run that's over goes back to the modes at once
  await q.evaluate(() => { SunsetSlice.start("lastlight"); SunsetSlice.hold(); SunsetSlice.setTime(0.01); });
  await q.waitForFunction(() => SunsetSlice.state().state === "over", null, { timeout: 8000 });
  await q.click("#to-menu"); await q.waitForTimeout(150);
  const d = await look();
  check("sunset-slice: Modes on the end screen goes at once, no question", d.state === "menu" && !d.dlg, d);
  check("sunset-slice (modes): no page errors", q.errs.length === 0, q.errs);
  await ctx.close();

  // ---- short screens: nothing is left out to make the menu fit. With saved
  // bests on it, the how-to line and each mode's description are shown, all of
  // it is inside the window, and none of it lies over the three targets in the
  // middle (or the names under them): on a small phone, a phone on its side,
  // ---- the pause card has Restart between Resume and Modes: R presses it, it
  // asks first (any other key keeps the run, still paused), and Enter starts
  // the same mode again from 0
  {
    const c = await lib.newContext(browser);
    const s = await lib.open(c, base, "games/sunset-slice/");
    await s.evaluate(() => { SunsetSlice.start("calm"); SunsetSlice.hold(); SunsetSlice.spawn("peach", 0.5, 0.5); });
    const W = await s.evaluate(() => innerWidth), H = await s.evaluate(() => innerHeight);
    await s.mouse.move(W * 0.3, H * 0.5); await s.mouse.down(); await s.mouse.move(W * 0.7, H * 0.5, { steps: 4 }); await s.mouse.up();
    await s.waitForFunction(() => SunsetSlice.state().score > 0, null, { timeout: 5000 }).catch(() => {});
    await s.keyboard.press("p"); await s.waitForTimeout(150);
    const card = await s.evaluate(() => ({ up: !document.getElementById("pause").hidden, btns: [...document.querySelectorAll("#pause button")].map((b) => b.textContent.replace(/\s+/g, " ").trim() + (b.getAttribute("data-gs-key") ? " " + b.getAttribute("data-gs-key") : "")).join(" | ") }));
    await s.keyboard.press("r"); await s.waitForSelector(".gs-dialog", { timeout: 3000 }).catch(() => {});
    const ask = await s.evaluate(() => (document.querySelector(".gs-dialog h2") || {}).textContent || null);
    await s.keyboard.press("x"); await s.waitForFunction(() => !document.querySelector(".gs-dialog"), null, { timeout: 3000 }).catch(() => {});
    const kept = await s.evaluate(() => { const t = SunsetSlice.state(); return { paused: t.paused, score: t.score, up: !document.getElementById("pause").hidden }; });
    await s.keyboard.press("r"); await s.waitForSelector(".gs-dialog", { timeout: 3000 }).catch(() => {});
    await s.keyboard.press("Enter"); await s.waitForFunction(() => !document.querySelector(".gs-dialog"), null, { timeout: 3000 }).catch(() => {});
    const again = await s.evaluate(() => { const t = SunsetSlice.state(); return { state: t.state, mode: t.mode, score: t.score, paused: t.paused, up: !document.getElementById("pause").hidden }; });
    check("sunset-slice: the pause card has Restart (R) between Resume and Modes; it asks 'Start over?', any other key keeps the run paused, and Enter starts the same mode again from 0",
      card.up && /^Resume P \| Restart R \| Modes ⌫$/.test(card.btns) && ask === "Start over?" && kept.paused && kept.up && kept.score > 0 &&
      again.state === "play" && again.mode === "calm" && again.score === 0 && !again.paused && !again.up, { card, ask, kept, again });
    check("sunset-slice (restart): no page errors", s.errs.length === 0, s.errs);
    await s.close();
    await c.close();
  }

  // ---- with keys, the menu's keys are on its targets (drawn by their names)
  // and one box shows below them: the picked mode's, Space or Enter on it.
  // 1 2 3 pick, and so does the mouse over a target. In a run the clock is a
  // tag of its own, not lettered like the score
  {
    const c = await lib.newContext(browser);
    const s = await lib.open(c, base, "games/sunset-slice/", { before: (pg) => pg.addInitScript(() => { try { localStorage.removeItem("sunsetslice_last"); } catch (e) {} }) });
    await s.waitForTimeout(300);
    const box = () => s.evaluate(() => { const v = [...document.querySelectorAll(".modes button[data-mode]")].filter((b) => b.getClientRects().length);
      return { shown: v.map((b) => b.dataset.mode).join(), cap: v[0] && v[0].querySelector("b").getAttribute("data-gs-key"), inside: v[0] && (() => { const b = v[0].getBoundingClientRect(), n = v[0].querySelector("b").getBoundingClientRect(); return n.right <= b.right && n.left >= b.left; })() }; });
    const b0 = await box();
    await s.keyboard.press("3"); const b3 = await box();
    const t = await s.evaluate(() => { const R = SunsetSlice.state().R; return { x: innerWidth * 0.28, y: innerHeight * 0.5, R }; });
    await s.mouse.move(t.x, t.y); await s.waitForTimeout(150); const bm = await box();
    const keys = await s.evaluate(() => { const said = []; const real = GameShell.drawKeys; GameShell.drawKeys = function (ctx, str) { said.push(str); return real.apply(this, arguments); };
      return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => { GameShell.drawKeys = real; r([...new Set(said)].join(" | ")); }))); });
    check("sunset-slice: with keys one box shows, the picked mode's (Space or Enter inside it); 3 picks Calm, the mouse over the Duel target picks Duel; the targets' names carry 1 2 3",
      b0.shown.split(",").length === 1 && b0.cap === "Space or Enter" && b0.inside && b3.shown === "calm" && bm.shown === "duel" && /Duel \[1\]/.test(keys) && /Last Light \[2\]/.test(keys) && /Calm \[3\]/.test(keys),
      { b0, b3, bm, keys });
    await s.evaluate(() => { SunsetSlice.start("lastlight"); SunsetSlice.hold(); });
    await s.waitForTimeout(200);
    const hud = await s.evaluate(() => { const a = getComputedStyle(document.getElementById("hud-score")), b = getComputedStyle(document.getElementById("hud-sub"));
      return { score: a.color, clock: b.color, bg: b.backgroundColor, text: document.getElementById("hud-sub").textContent }; });
    check("sunset-slice: in a run the clock is a tag of its own (a dark ground, gold letters), told apart from the white score at a glance",
      /s$/.test(hud.text) && hud.clock !== hud.score && !/rgba\(0, 0, 0, 0\)|transparent/.test(hud.bg), hud);
    check("sunset-slice (menu keys): no page errors", s.errs.length === 0, s.errs);
    await s.close();
    await c.close();
  }

  // ---- paused right after a cut, the halves (and the ink, the gleam, the
  // score text) hold where they were instead of fading out under the pause
  // card, or under "Leave this game?"; resumed, they carry on
  {
    const c = await lib.newContext(browser);
    const s = await lib.open(c, base, "games/sunset-slice/");
    await s.evaluate(() => { SunsetSlice.start("calm"); SunsetSlice.hold(); SunsetSlice.spawn("peach", 0.5, 0.5); });
    const W = await s.evaluate(() => innerWidth), H = await s.evaluate(() => innerHeight);
    await s.mouse.move(W * 0.3, H * 0.5); await s.mouse.down(); await s.mouse.move(W * 0.7, H * 0.5, { steps: 4 }); await s.mouse.up();
    await s.keyboard.press("p");
    const look = () => s.evaluate(() => { const t = SunsetSlice.state(); return { halves: t.halves, clock: Math.round(t.clock), paused: t.paused }; });
    const p0 = await look();
    await s.evaluate(() => new Promise((r) => setTimeout(r, 1800)));   // (longer than a half takes to fade)
    const p1 = await look();
    await s.keyboard.press("p"); await s.keyboard.press("Escape"); await s.waitForSelector(".gs-dialog", { timeout: 3000 }).catch(() => {});
    const l0 = await look();
    await s.evaluate(() => new Promise((r) => setTimeout(r, 1800)));
    const l1 = await look();
    await s.keyboard.press("Enter"); await s.waitForFunction(() => !document.querySelector(".gs-dialog"), null, { timeout: 3000 }).catch(() => {});
    await s.evaluate(() => new Promise((r) => setTimeout(r, 300)));
    const back = await look();
    check("sunset-slice: paused right after a cut (by P, or under 'Leave this game?'), the halves hold still, half-faded, on a clock that stops; resumed, it runs on",
      p0.paused && p0.halves === 2 && p1.halves === 2 && p1.clock === p0.clock && l0.paused && l1.halves === 2 && l1.clock === l0.clock && !back.paused && back.clock > l1.clock,
      { p0, p1, l0, l1, back });
    check("sunset-slice (paused cut): no page errors", s.errs.length === 0, s.errs);
    await s.close();
    await c.close();
  }

  // and a short laptop window ([wide, high, touch])
  const SHORT = [[320, 480, true], [375, 553, true], [360, 560, true], [320, 568, true], [568, 320, true], [667, 331, true], [844, 390, true], [915, 412, true],
    [1024, 480, false], [1280, 500, false], [1366, 520, false], [1366, 580, false], [1280, 600, false]];
  const shortBad = [];
  for (const [w, h, touch] of SHORT) {
    const c = await lib.newContext(browser, touch ? { viewport: { width: w, height: h }, hasTouch: true, isMobile: true } : { viewport: { width: w, height: h } });
    const s = await lib.open(c, base, "games/sunset-slice/", { before: (pg) => pg.addInitScript(() => { try { ["duel", "lastlight", "calm"].forEach((k) => localStorage.setItem("sunsetslice_best_" + k, "1234")); } catch (e) {} }) });
    await s.waitForTimeout(200);
    const m = await s.evaluate(() => {
      const menu = document.getElementById("menu"), r = (e) => e.getBoundingClientRect(), W = innerWidth, H = innerHeight, R = SunsetSlice.state().R;
      // the targets hang at mid-height, bobbing a little, their names under them
      const top = H * 0.5 - R * 1.2, bot = H * 0.5 + R * 1.75 + Math.max(15, R * 0.42) * 0.45 + H * 0.015;
      const parts = [...menu.querySelectorAll("h1, .tag, .how, .modes button, .bests")].filter((e) => e.getClientRects().length), out = [], over = [];
      parts.forEach((e) => { const b = r(e), name = e.className || e.tagName; if (b.left < -0.5 || b.right > W + 0.5 || b.top < -0.5 || b.bottom > H + 0.5) out.push(name); if (Math.min(b.bottom, bot) - Math.max(b.top, top) > 0.5) over.push(name); });
      return { how: r(menu.querySelector(".how")).height > 8, small: (() => { const sm = [...menu.querySelectorAll(".modes small")], shown = sm.filter((e) => r(e).height > 8);
        return matchMedia("(hover: none)").matches ? shown.length === 3 : shown.length === 1 && !!shown[0].closest("[data-gs-pick]"); })(), bests: /1234/.test(document.getElementById("bests").textContent), out, over };
    });
    if (!(m.how && m.small && m.bests && m.out.length === 0 && m.over.length === 0)) shortBad.push(w + "x" + h + (touch ? " touch " : " mouse ") + JSON.stringify(m));
    if (s.errs.length) shortBad.push(w + "x" + h + " errors " + s.errs.join("; "));
    await s.close(); await c.close();
  }
  check("sunset-slice: on short screens the menu leaves nothing out to fit: the how-to line and the modes' descriptions are shown (all three on a touch screen; with keys the picked one, the others a key away), inside the window and clear of the targets", shortBad.length === 0, shortBad);

  // ---- the roadside sign: SAM LU cut through a notice board standing black
  // on the skyline in front of the sun's lower left, the sun showing through
  // its letters. In a run it stands inside the window, clear of the HUD and
  // the corner buttons, at every size. On the menu it stands clear of every
  // word and button and of the targets and their names (as they bob); a
  // short phone's menu has no room for it on the skyline and goes without,
  // but laptops and tall phones, upright or on their side, show it there.
  // No page scrolls, and nothing says "made by".
  const { devices } = require("@playwright/test");
  const mob = (w, h) => ({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const SIGN = [["1280x900", {}, true], ["1366x657", { viewport: { width: 1366, height: 657 } }, true], ["1280x600", { viewport: { width: 1280, height: 600 } }, true],
    ["Pixel 7", devices["Pixel 7"], true], ["390x844", mob(390, 844), true], ["Pixel 7 on its side", devices["Pixel 7 landscape"], true],
    ["360x640", mob(360, 640), false], ["320x568", mob(320, 568), false], ["375x553", mob(375, 553), false], ["360x560", mob(360, 560), false]];
  for (const [label, opts, onMenu] of SIGN) {
    const c = await lib.newContext(browser, opts);
    const s = await lib.open(c, base, "games/sunset-slice/");
    await s.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    // everything over the scene, by its words (a line of text) or its box
    const LOOK = () => {
      const boxes = (sel) => [...document.querySelectorAll(sel)].flatMap((el) => {
        let rs = [el.getBoundingClientRect()];
        if (/^(P|H1)$/.test(el.tagName)) { const rg = document.createRange(); rg.selectNodeContents(el); rs = [...rg.getClientRects()]; }
        return rs.filter((r) => r.width && r.height).map((r) => ({ name: el.id || el.className || el.tagName, l: r.left, t: r.top, r: r.right, b: r.bottom }));
      });
      const n = window.SunsetSlice && SunsetSlice.sign ? SunsetSlice.sign() : undefined;
      if (!n) return { sign: n === null ? null : "none", madeBy: /made by/i.test(document.body.innerText) };
      const W = innerWidth, H = innerHeight, hits = [];
      const meet = (a, nm) => { if (a.l < n.x1 + 2 && a.r > n.x0 - 2 && a.t < n.y1 + 2 && a.b > n.y0 - 2) hits.push(nm); };
      boxes(".nav-back-games, .gs-corner, .mute-toggle, .rm-toggle, .gs-pause-btn, #hud").forEach((a) => meet(a, a.name));
      if (SunsetSlice.state().state === "menu") {
        boxes(".menu h1, .menu .tag, .menu .how, .menu .modes button, .menu .bests").forEach((a) => meet(a, a.name));
        // the targets (round, bobbing) and their names under them, keys and all, as they're drawn
        const R = SunsetSlice.state().R, bob = H * 0.015, fs = Math.round(Math.max(15, R * 0.42)), lw = Math.max(3, R * 0.1);
        const g = document.createElement("canvas").getContext("2d"), touch = matchMedia("(hover: none)").matches;
        g.font = "700 " + fs + "px 'Zen Old Mincho', Georgia, serif";
        [["Duel", 0.28, 0.98], ["Last Light", 0.5, 1.06], ["Calm", 0.72, 0.98]].forEach(([name, u, k], i) => {
          const x = u * W, y = H * 0.5, ly = y + R * 1.75;
          const dx = Math.max(n.x0 - x, 0, x - n.x1), dy = Math.max(n.y0 - (y + bob), 0, (y - bob) - n.y1);
          if (Math.hypot(dx, dy) < R * k) hits.push(name + " target");
          const w = (touch ? g.measureText(name).width : g.measureText(name + " ").width + g.measureText(String(i + 1)).width + fs * 0.92) + lw;
          meet({ l: x - w / 2, r: x + w / 2, t: ly - fs * 0.95 - lw / 2 - bob, b: ly + fs * 0.3 + lw / 2 + bob }, name + " name");
        });
      }
      // the letters are cut through: the board is mostly ink, and the sun shows through
      const cv = document.getElementById("stage"), k = cv.width / W;
      const x = Math.round(n.bx0 * k), y = Math.round(n.by0 * k), w = Math.round((n.bx1 - n.bx0) * k), h = Math.round((n.by1 - n.by0) * k);
      const d = cv.getContext("2d").getImageData(x, y, w, h).data;
      let ink = 0, lit = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i] < 45 && d[i + 1] < 35 && d[i + 2] < 40) ink++; else if (d[i] > 170 && d[i + 1] > 70) lit++; }
      const sun = n.sun, cx = (n.x0 + n.x1) / 2;
      return { sign: n.text, fs: n.fs, box: [n.x0, n.y0, n.x1, n.y1].map(Math.round), inside: n.x0 >= 0 && n.x1 <= W && n.y0 >= 0 && n.y1 <= H, hits,
        ink: +(ink / (w * h)).toFixed(2), lit: +(lit / (w * h)).toFixed(2), bySun: Math.abs(cx - sun.x) <= sun.R * 1.35 && n.y1 > sun.y - sun.R && n.y0 < sun.y + sun.R,
        scroll: document.documentElement.scrollWidth > W || document.documentElement.scrollHeight > H, madeBy: /made by/i.test(document.body.innerText) };
    };
    const menu = await s.evaluate(LOOK);
    await s.evaluate(() => { SunsetSlice.start("lastlight"); SunsetSlice.hold(); });
    await s.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const run = await s.evaluate(LOOK);
    const good = (v) => v && v.sign === "SAM LU" && v.inside && v.hits.length === 0 && v.ink > 0.4 && v.ink < 0.92 && v.lit > 0.02 && v.bySun && !v.scroll && !v.madeBy;
    check("sunset-slice, " + label + ": in a run the roadside sign, SAM LU cut through a board black against the sun, stands inside the window clear of the HUD and the corner buttons",
      good(run) && run.fs >= 12, run);
    check("sunset-slice, " + label + ": on the menu the sign " + (onMenu ? "stands clear of every word, button, target and name" : "stands clear of them all, or stays off a skyline with no room for it"),
      onMenu ? good(menu) : (menu.sign === null && !menu.madeBy) || good(menu), menu);
    check("sunset-slice (sign), " + label + ": no page errors", s.errs.length === 0, s.errs);
    await s.close(); await c.close();
  }
};
