// Mesa Drift: the modes take 1 and 2 (shown on them, the pick kept) and
// Space or Enter lights the burner; held, the burner lifts and spends
// propane, the vent sinks faster than letting it cool; in each band the
// balloon drifts with that band's wind; every flight has a flat field to
// start from, a field to land on beyond a ridge it can't pass, dry ground
// under both, and winds both ways; a soft landing near the flag scores most
// and the next flight follows, a landing in the scrub scores a little and
// the tour goes on, while one too hard or the river ends it; a new best is
// kept as it's passed; the end card ignores Space for a moment, then flies
// again, and Backspace goes to the modes; paused, Space burns nothing; with
// Visual FX off no dust rides the winds (the arrows show them all the same);
// on a phone the burn button, held, burns; the wind guide is drawn over the
// rock; the balloon's shadow lies along the land, slopes and all; a river is
// level from bank to bank, drawn and to come down in.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const open = (c, opts) => lib.open(c || ctx, base, "games/mesa-drift/", opts);
  const done = async (p, what) => { check("mesa-drift " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  const wait = (p, ms) => p.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), ms);

  // ---- the menu
  let p = await open();
  const caps = await p.evaluate(() => [...document.querySelectorAll("#pick-mode button, #play")].map((b) => b.getAttribute("data-gs-key")));
  await p.keyboard.press("2"); await p.waitForTimeout(80);
  const kept = await p.evaluate(() => localStorage.getItem("mesadrift_mode"));
  await p.keyboard.press("1"); await p.keyboard.press("Space"); await p.waitForTimeout(200);
  const began = await p.evaluate(() => ({ state: MesaDrift.state(), mode: MesaDrift.mode(), flight: MesaDrift.flight(), hud: document.getElementById("hud-flight").textContent, b: MesaDrift.balloon() }));
  check("mesa-drift: the modes wear 1 and 2, the start Space or Enter; 2 picks Gusty (kept), 1 Calm air, and Space starts flight 1 with the balloon on the ground",
    caps.join() === "1,2,Space or Enter" && kept === "gusty" && began.state === "play" && began.mode === "calm" && began.flight === 0 && /^Flight 1 of 8 · First Light$/.test(began.hud) && began.b.grounded,
    { caps, kept, began });

  // ---- the burner lifts and spends propane; the vent sinks faster than cooling alone
  const air = await p.evaluate(() => {
    const step = (s) => { for (let i = 0; i < s * 60; i++) MesaDrift.step(1 / 60); };
    const b0 = MesaDrift.balloon();
    MesaDrift.hold("burn", true); step(4); MesaDrift.hold("burn", false);
    const b1 = MesaDrift.balloon();
    // from the same height and heat: cooling alone, then venting
    const w = MesaDrift.world();
    MesaDrift.place(400, 540, 0, 0, 0.5); step(2); const cool = MesaDrift.balloon();
    MesaDrift.place(400, 540, 0, 0, 0.5); MesaDrift.hold("vent", true); step(2); MesaDrift.hold("vent", false); const vent = MesaDrift.balloon();
    return { rose: b1.y - b0.y, fuel: [b0.fuel, b1.fuel], cool: cool.vy, vent: vent.vy };
  });
  check("mesa-drift: held, the burner lifts the balloon and spends propane; the vent brings it down faster than letting it cool",
    air.rose > 60 && air.fuel[1] < air.fuel[0] - 3 && air.vent < air.cool - 5, air);

  // ---- each band's wind carries the balloon its way
  const drift = await p.evaluate(() => {
    MesaDrift.start("calm");
    const w = MesaDrift.world(), L = MesaDrift.layers, out = [];
    for (let i = 0; i < 4; i++) {
      const y = (L[i] + L[i + 1]) / 2;
      if (y - MesaDrift.drop < w.ground(500) + 20) { out.push(null); continue; }
      MesaDrift.place(500, y, 0, 0, 0.5);
      for (let k = 0; k < 180; k++) { MesaDrift.step(1 / 60); const b = MesaDrift.balloon(); MesaDrift.place(b.x, y, b.vx, 0, 0.5); }
      out.push({ wind: Math.round(w.winds[i]), vx: Math.round(MesaDrift.balloon().vx) });
    }
    return out;
  });
  check("mesa-drift: in each band of air the balloon drifts with that band's wind", drift.filter(Boolean).length >= 3 && drift.filter(Boolean).every((d) => Math.abs(d.vx - d.wind) <= Math.max(3, Math.abs(d.wind) * 0.2)), drift);

  // ---- every flight, in both modes: a flat field to start from, the field to
  // land on beyond the mesas, a ridge it can't pass, dry ground under both,
  // and winds blowing both ways
  const flights = await p.evaluate(() => [false, true].map((gusty) => MesaDrift.flights(gusty)));
  const bad = [];
  flights.forEach((list, gusty) => list.forEach((f, n) => {
    const dryField = !f.water.some((w) => w[1] > f.field[0] && w[0] < f.field[1]) && !f.water.some((w) => w[0] < 260);
    const both = f.winds.some((v) => v > 8) && f.winds.some((v) => v < -6);
    const fieldWide = f.field[1] - f.field[0] >= 150;
    if (!dryField || !both || !fieldWide || f.ridge < 300 || f.field[0] < 900) bad.push((gusty ? "gusty " : "calm ") + (n + 1) + " " + f.name + JSON.stringify({ dryField, both, fieldWide, ridge: Math.round(f.ridge), at: Math.round(f.field[0]) }));
  }));
  check("mesa-drift: all eight flights in both modes start on a dry field, end at a dry ringed field before a ridge too high to pass, and have winds both ways", flights[0].length === 8 && bad.length === 0, bad);

  // ---- landings: soft on the field scores most and the next flight follows;
  // in the scrub a little and on goes the tour; too hard ends it
  const landed = await p.evaluate(() => {
    MesaDrift.start("calm");
    const w = MesaDrift.world();
    const settle = () => { for (let i = 0; i < 60 * 4 && !MesaDrift.outcome(); i++) MesaDrift.step(1 / 60); };
    // just above the flag, coming down slowly
    MesaDrift.place(w.flag, w.ground(w.flag) + MesaDrift.drop + 6, 0, -12, 0.46);
    settle();
    const on = MesaDrift.outcome();
    for (let i = 0; i < 60 * 3 && MesaDrift.flight() === 0; i++) MesaDrift.step(1 / 60);
    const next = { flight: MesaDrift.flight(), total: MesaDrift.total(), grounded: MesaDrift.balloon().grounded };
    // in the scrub, between the start and the field, on dry ground
    const w2 = MesaDrift.world();
    let x = 420;
    while (w2.water.some((r) => x > r[0] - 20 && x < r[1] + 20)) x += 40;
    MesaDrift.place(x, w2.ground(x) + MesaDrift.drop + 6, 0, -12, 0.46);
    settle();
    const rough = MesaDrift.outcome();
    for (let i = 0; i < 60 * 3 && MesaDrift.flight() === 1; i++) MesaDrift.step(1 / 60);
    const after = MesaDrift.flight();
    // and too hard
    const w3 = MesaDrift.world();
    MesaDrift.place(w3.flag, w3.ground(w3.flag) + MesaDrift.drop + 4, 0, -120, 0.2);
    settle();
    const hard = MesaDrift.outcome();
    for (let i = 0; i < 60 * 3 && MesaDrift.state() === "play"; i++) MesaDrift.step(1 / 60);
    return { on, next, rough, after, hard, end: MesaDrift.state(), card: document.getElementById("over-title").textContent };
  });
  check("mesa-drift: a soft landing on the flag scores over 700 and the next flight starts on the ground; one in the scrub scores 50 and the tour goes on; one too hard breaks the basket and ends it",
    landed.on && landed.on.kind === "landed" && landed.on.pts > 700 && landed.next.flight === 1 && landed.next.total === landed.on.pts && landed.next.grounded &&
      landed.rough && landed.rough.kind === "rough" && landed.rough.pts === 50 && landed.after === 2 && landed.hard && landed.hard.kind === "crash" && landed.end === "over" && /broke/.test(landed.card),
    landed);
  // ...and the river
  const river = await p.evaluate(() => {
    MesaDrift.start("calm");
    for (let n = 0; n < 8; n++) {
      const w = MesaDrift.world();
      if (w.water.length) {
        const x = (w.water[0][0] + w.water[0][1]) / 2;
        MesaDrift.place(x, w.ground(x) + MesaDrift.drop + 4, 0, -10, 0.46);
        for (let i = 0; i < 120 && !MesaDrift.outcome(); i++) MesaDrift.step(1 / 60);
        return MesaDrift.outcome();
      }
      MesaDrift.place(w.flag, w.ground(w.flag) + MesaDrift.drop + 4, 0, -8, 0.46);
      for (let i = 0; i < 60 * 6 && MesaDrift.flight() === n; i++) MesaDrift.step(1 / 60);
    }
    return "no river";
  });
  check("mesa-drift: coming down in the river ends the tour", river && river.kind === "crash" && /river/.test(river.text), river);
  await done(p, "air");

  // ---- a new best is kept as it's passed; the end card waits a moment, then
  // flies again; Backspace goes to the modes
  p = await open();
  const best = await p.evaluate(() => {
    localStorage.removeItem("mesadrift_best_calm");
    MesaDrift.start("calm");
    const w = MesaDrift.world();
    MesaDrift.place(w.flag, w.ground(w.flag) + MesaDrift.drop + 6, 0, -12, 0.46);
    for (let i = 0; i < 60 * 4 && !MesaDrift.outcome(); i++) MesaDrift.step(1 / 60);
    const kept = Number(localStorage.getItem("mesadrift_best_calm")), total = MesaDrift.total();
    for (let i = 0; i < 60 * 3 && MesaDrift.flight() === 0; i++) MesaDrift.step(1 / 60);
    const w2 = MesaDrift.world();
    MesaDrift.place(w2.flag, w2.ground(w2.flag) + MesaDrift.drop + 4, 0, -120, 0.2);
    for (let i = 0; i < 60 * 6 && MesaDrift.state() === "play"; i++) MesaDrift.step(1 / 60);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
    return { kept, total, state: MesaDrift.state(), stats: document.getElementById("over-stats").textContent };
  });
  await wait(p, 900);
  await p.keyboard.press("Space"); await p.waitForTimeout(200);
  const again = await p.evaluate(() => MesaDrift.state());
  await p.evaluate(() => { const w = MesaDrift.world(); MesaDrift.place(w.flag, w.ground(w.flag) + MesaDrift.drop + 4, 0, -120, 0.2); for (let i = 0; i < 60 * 6 && MesaDrift.state() === "play"; i++) MesaDrift.step(1 / 60); });
  await wait(p, 900);
  await p.keyboard.press("Backspace"); await p.waitForTimeout(200);
  const back = await p.evaluate(() => MesaDrift.state());
  const capsOver = await p.evaluate(() => [document.getElementById("again").getAttribute("data-gs-key"), document.getElementById("to-menu").getAttribute("data-gs-key")]);
  check("mesa-drift: a new best is kept the moment it's passed; the end card says so, ignores Space for a moment, then flies again; Backspace goes to the modes",
    best.total > 0 && best.kept === best.total && best.state === "over" && /record/.test(best.stats) && again === "play" && back === "menu" && capsOver.join() === "Space or Enter,⌫", { best, again, back, capsOver });
  await done(p, "end card");

  // ---- paused, Space burns nothing
  p = await open();
  await p.evaluate(() => MesaDrift.start("calm")); await p.waitForTimeout(150);
  await p.keyboard.press("p"); await p.waitForTimeout(150);
  const f0 = await p.evaluate(() => MesaDrift.balloon().fuel);
  await p.keyboard.down("Space"); await p.waitForTimeout(500); await p.keyboard.up("Space");
  const f1 = await p.evaluate(() => MesaDrift.balloon().fuel);
  await p.keyboard.press("p"); await p.waitForTimeout(150);
  await p.keyboard.down("Space"); await p.waitForTimeout(500); await p.keyboard.up("Space");
  const f2 = await p.evaluate(() => MesaDrift.balloon().fuel);
  check("mesa-drift: paused, Space burns nothing; resumed, it burns", f1 === f0 && f2 < f1 - 0.2, { f0, f1, f2 });
  await done(p, "pause");

  // ---- Visual FX: on, dust rides the winds; off, none (the arrows show the winds)
  const motes = {};
  for (const off of [false, true]) {
    const q = await open(null, { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:mesa-drift", off ? "1" : "0"); } catch (e) {} }, off) });
    motes[off ? "off" : "on"] = await q.evaluate(() => { MesaDrift.start("calm"); for (let i = 0; i < 30; i++) MesaDrift.step(1 / 60); return MesaDrift.motes(); });
    await done(q, "FX " + (off ? "off" : "on"));
  }
  check("mesa-drift: with Visual FX on dust rides the winds; with it off there is none", motes.on > 10 && motes.off === 0, motes);

  // ---- on a phone: the burn button shows in flight, and held, it burns
  {
    const { devices } = require("@playwright/test");
    const c = await lib.newContext(browser, devices["Pixel 7"]);
    const q = await open(c);
    const onMenu = await q.evaluate(() => getComputedStyle(document.getElementById("tbtns")).display);
    await q.evaluate(() => MesaDrift.start("calm")); await q.waitForTimeout(150);
    const r = await q.evaluate(() => { const e = document.getElementById("t-burn").getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2, shown: getComputedStyle(document.getElementById("tbtns")).display }; });
    const cdp = await c.newCDPSession(q);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: r.x, y: r.y }] });
    await q.waitForTimeout(400);
    const burning = await q.evaluate(() => MesaDrift.burning());
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await q.waitForTimeout(100);
    const after = await q.evaluate(() => MesaDrift.burning());
    check("mesa-drift, phone: the burn and vent buttons show in flight (not on the menu), and held, burn burns", onMenu === "none" && r.shown === "flex" && burning && !after, { onMenu, shown: r.shown, burning, after });
    await done(q, "phone");
    await c.close();
  }
  // ...and a desktop has no such buttons
  p = await open();
  await p.evaluate(() => MesaDrift.start("calm"));
  check("mesa-drift: on a desktop there are no touch buttons", (await p.evaluate(() => getComputedStyle(document.getElementById("tbtns")).display)) === "none", null);
  await done(p, "desktop buttons");

  // ---- the wind guide at the right edge is drawn over the rock, not behind
  // it: down its whole height it is the guide's cream laid over what lies just
  // beside it (on the menu, Visual FX off so no dust crosses it), on a desktop
  // and on a phone
  {
    const { devices } = require("@playwright/test");
    for (const [label, opts] of [["desktop", null], ["phone", devices["Pixel 7"]]]) {
      const c = opts ? await lib.newContext(browser, opts) : ctx;
      const q = await open(c, { before: (pg) => pg.addInitScript(() => { try { localStorage.setItem("reduceMotion:mesa-drift", "1"); } catch (e) {} }) });
      const guide = await q.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
        const cv = document.getElementById("stage"), g = cv.getContext("2d"), k = cv.width / innerWidth;
        const VH = innerHeight, x = innerWidth - 56, PADB = matchMedia("(hover: none)").matches ? 104 : 0;
        const SKY = MesaDrift.layers[4], S = (VH - 60 - PADB) / SKY, Y = (v) => VH - PADB - v * S;
        const px = (sx, sy) => Array.from(g.getImageData(Math.round(sx * k), Math.round(sy * k), 1, 1).data);
        const bad = [];
        let rows = 0;
        for (let sy = Y(SKY) + 4; sy < Y(0) - 4; sy += 6) {
          if (MesaDrift.layers.slice(1, 4).some((v) => Math.abs(Y(v) - sy) < 3)) continue;   // (the lines between the bands)
          const inside = px(x + 3, sy), beside = px(x - 14, sy);
          const off = Math.max(...[246, 236, 214].map((c, i) => Math.abs(0.55 * c + 0.45 * beside[i] - inside[i])));
          rows++;
          if (off > 14) bad.push(Math.round(sy) + ": " + inside.slice(0, 3) + " beside " + beside.slice(0, 3));
        }
        res({ rows, bad });
      }))));
      // (a row or two where a rock's edge runs between the two places looked at)
      check("mesa-drift, " + label + ": the wind guide at the right edge is drawn over the rock, not hidden behind it", guide.rows > 20 && guide.bad.length <= 2, guide);
      await done(q, "wind guide, " + label);
      if (opts) await c.close();
    }
  }

  // ---- the balloon's shadow lies along the land: over the flight's steepest
  // slope it follows the ground across its whole width instead of sitting
  // flat as an oval (its outline is caught as it is drawn)
  {
    const q = await open();
    await q.evaluate(() => MesaDrift.start("calm")); await q.waitForTimeout(150);
    const shade = await q.evaluate(() => new Promise((res) => {
      const w = MesaDrift.world();
      let at = 0, most = 0;
      for (let x = 300; x < w.width - 300; x += 5) { const d = Math.abs(w.ground(x + 40) - w.ground(x - 40)); if (d > most) { most = d; at = x; } }
      MesaDrift.place(at, w.ground(at) + 120, 0, 0);
      const P = CanvasRenderingContext2D.prototype, real = {};
      let path = [];
      ["beginPath", "moveTo", "lineTo", "ellipse", "fill"].forEach((k) => { real[k] = P[k]; });
      const undo = () => Object.keys(real).forEach((k) => { P[k] = real[k]; });
      P.beginPath = function () { path = []; return real.beginPath.apply(this, arguments); };
      P.moveTo = function (x, y) { path.push([x, y]); return real.moveTo.apply(this, arguments); };
      P.lineTo = function (x, y) { path.push([x, y]); return real.lineTo.apply(this, arguments); };
      P.ellipse = function () { path.push("ellipse"); return real.ellipse.apply(this, arguments); };
      P.fill = function () {
        if (/^rgba\(60, 30, 26/.test(this.fillStyle)) {
          const b = MesaDrift.balloon(), pts = path.filter((p) => Array.isArray(p)), n = pts.length / 2 - 1;
          undo();
          if (!(n >= 1) || path.includes("ellipse")) return res({ slope: most, shape: path.includes("ellipse") ? "an oval" : "?", points: pts.length }), real.fill.apply(this, arguments);
          // the outline's upper edge against the ground under each of its points
          // (it runs along the skyline, the shadow lying below it, on the rock)
          const S = (innerHeight - 60) / MesaDrift.layers[4], top = pts.slice(0, n + 1), bot = pts.slice(n + 1).reverse();
          const edge = top.map((p) => p[1]), xc = (top[0][0] + top[n][0]) / 2;
          const gr = top.map((p) => w.ground(b.x + (p[0] - xc) / S));
          const err = Math.max(...edge.map((m, k) => Math.abs(m - edge[0] + (gr[k] - gr[0]) * S)));
          res({ slope: most, shape: bot.every((p, k) => p[1] >= top[k][1]) ? "laid along the land" : "partly in the air", points: pts.length,
            err: Math.round(err * 10) / 10, rise: Math.round(Math.max(...edge) - Math.min(...edge)) });
        }
        return real.fill.apply(this, arguments);
      };
    }));
    check("mesa-drift: over a steep slope the balloon's shadow follows the ground across its width, not a flat oval",
      shade.shape === "laid along the land" && shade.points >= 18 && shade.err < 2 && shade.rise > 15, shade);
    await done(q, "shadow");
  }

  // ---- a river is level from bank to bank: it reaches just as far as the
  // land under its surface (16), in every flight and both modes, and as drawn
  // no water lies over a bank above the surface, and the land under the
  // surface is under water (one row of the canvas, 15 up, across each river
  // and its banks; Visual FX off, so no dust crosses it)
  {
    const VIEW = ["    start: startRun,", "    start: startRun, load: loadFlight, view: function () { return { cam: cam, S: S, Y0: VH - PADB, dpr: dpr }; },"];
    const q = await open(null, { before: async (pg) => {
      await pg.addInitScript(() => { try { localStorage.setItem("reduceMotion:mesa-drift", "1"); } catch (e) {} });
      await lib.injectScript(pg, "games/mesa-drift/game.js", [VIEW]);
    } });
    const banks = await q.evaluate(async () => {
      const ends = [], drawn = [];
      for (const m of ["calm", "gusty"]) {
        MesaDrift.start(m);
        for (let n = 0; n < 8; n++) {
          MesaDrift.load(n);
          const W = MesaDrift.world();
          for (const w of W.water) {
            const inside = Math.max(...Array.from({ length: Math.ceil((w[1] - w[0]) * 4) - 1 }, (_, k) => W.ground(w[0] + (k + 1) / 4)));
            const ok = Math.abs(W.ground(w[0]) - 16) < 0.01 && Math.abs(W.ground(w[1]) - 16) < 0.01 && inside < 16 && W.ground(w[0] - 0.5) > 16 && W.ground(w[1] + 0.5) > 16;
            if (!ok) ends.push(m + " " + n + " " + w.map((v) => v.toFixed(1)).join("-") + " ground " + W.ground(w[0]).toFixed(1) + "/" + W.ground(w[1]).toFixed(1));
            if (m !== "calm") continue;
            // the balloon well up and off to the left, the river in view
            for (let k = 0; k < 400; k++) { MesaDrift.place(w[0] - 200, 450); MesaDrift.step(1 / 60); }
            MesaDrift.place(w[0] - 200, 450);
            const row = await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
              const v = MesaDrift.view(), cv = document.getElementById("stage"), y = Math.round((v.Y0 - 15 * v.S) * v.dpr);
              const px = cv.getContext("2d").getImageData(0, y, cv.width, 1).data, bad = [];
              for (let x = w[0] - 8; x <= w[1] + 8; x += 0.25) {
                const i = Math.floor((x - v.cam) * v.S * v.dpr), r = px[4 * i], g = px[4 * i + 1], b = px[4 * i + 2];
                // (judged where the land a pixel either side is on the same
                // side of the surface: a pixel the water's edge crosses is
                // part water)
                const wet = Math.abs(r - 79) < 12 && Math.abs(g - 154) < 12 && Math.abs(b - 168) < 12, gr = W.ground(x);
                const lo = Math.min(W.ground(x - 1 / v.S), W.ground(x + 1 / v.S), gr), hi = Math.max(W.ground(x - 1 / v.S), W.ground(x + 1 / v.S), gr);
                if (wet && lo > 16.4) bad.push("water over the bank at " + x.toFixed(2) + " (land " + gr.toFixed(1) + ")");
                if (!wet && hi < 15.6) bad.push("dry under the surface at " + x.toFixed(2));
              }
              res(bad);
            })));
            if (row.length) drawn.push(n + ": " + row.length + " " + row[0] + " .. " + row[row.length - 1]);
          }
        }
      }
      return { ends, drawn, rivers: [0, 1, 2, 3, 4, 5, 6, 7].map((n) => { MesaDrift.load(n); return MesaDrift.world().water.length; }).join("") };
    });
    check("mesa-drift: each river is level from bank to bank, reaching just as far as the land under its surface (every flight, both modes); drawn, no water lies over a bank and no land under the surface is dry",
      !banks.ends.length && !banks.drawn.length && /[1-9]/.test(banks.rivers), banks);
    await done(q, "rivers");
  }
  await ctx.close();
};
