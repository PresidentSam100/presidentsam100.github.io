// Typetwo with Visual FX off: the night scene (stars, ward, runes, the
// wizard's robe and orb) is drawn but holds still; with FX on it moves.
// A Zen run ends from its End session button or the End key, onto the
// results; the menus' key legends hide on a touch-only phone. On the start
// screen, Enter on a focused mode button only picks that mode. A cleared
// word's points carry the streak's multiplier.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const frames = async (fxOff) => {
    const p = await lib.open(ctx, base, "games/typetwo/");
    await p.evaluate((off) => localStorage.setItem("reduceMotion:typetwo", off ? "1" : "0"), fxOff);
    await p.reload({ waitUntil: "domcontentloaded" });
    const shot = () => p.evaluate(() => document.getElementById("game").toDataURL());
    const blank = await p.evaluate(() => { const c = document.createElement("canvas"), g = document.getElementById("game"); c.width = g.width; c.height = g.height; return c.toDataURL(); });
    // (by frames, not time: a busy machine can take longer than a fixed wait
    // to draw the first frame, or draw none between two shots)
    const frames = (n) => p.evaluate((n) => new Promise((r) => { let k = 0; (function f() { if (++k > n) r(); else requestAnimationFrame(f); })(); }), n);
    await p.waitForFunction((blank) => document.getElementById("game").toDataURL() !== blank, blank, { timeout: 15000, polling: 100 }).catch(() => {});
    await frames(3);
    const a = await shot(); await frames(20); const b = await shot();
    const errs = p.errs;
    await p.close();
    return { still: a === b, drawn: a !== blank, errs };
  };
  const off = await frames(true), on = await frames(false);
  check("typetwo, FX off: the menu's night scene is drawn and holds still (FX on, it moves)", off.still && off.drawn && !on.still, { off, on });
  check("typetwo (FX): no page errors", off.errs.length === 0 && on.errs.length === 0, [off.errs, on.errs]);

  // ---- Visual FX turned off on the way: the scene stops where it is (the
  // ward's shimmer, its runes and its carved name glimmering as they were),
  // not put back to its resting look; on again it moves on. Judged on the
  // ward's band either side of the wizard (his orb flickers with FX on and
  // glows steady off), frame by frame on the page's own clock
  {
    const c = await lib.newContext(browser);
    const q = await lib.open(c, base, "games/typetwo/", { before: async (pg) => {
      await pg.clock.install({ time: new Date("2026-11-22T12:00:00") });
      await pg.addInitScript(() => { try { localStorage.setItem("reduceMotion:typetwo", "0"); } catch (e) {} });
    } });
    const band = () => q.evaluate(() => {
      const g = document.getElementById("game"), n = __game.wardName, k = g.width / n.W, out = document.createElement("canvas"), x = out.getContext("2d");
      const y0 = Math.round((n.lineY - 16) * k), h = Math.round(32 * k), cut0 = Math.round((n.W / 2 - 60) * k), cut1 = Math.round((n.W / 2 + 60) * k);
      out.width = g.width; out.height = h;
      x.drawImage(g, 0, y0, cut0, h, 0, 0, cut0, h);
      x.drawImage(g, cut1, y0, g.width - cut1, h, cut1, 0, g.width - cut1, h);
      return out.toDataURL();
    });
    const flip = () => q.evaluate(() => document.querySelector(".rm-toggle").click());
    // (the page's clock stopped, so time moves only as it's run on: no frame
    // slips in between a reading and the switch)
    await q.clock.pauseAt(await q.evaluate(() => Date.now() + 100));
    await q.clock.runFor(4000);
    const a0 = await band(); await q.clock.runFor(300); const a = await band();
    await flip(); await q.clock.runFor(300); const b = await band(); await q.clock.runFor(600); const b2 = await band();
    await flip(); await q.clock.runFor(300); const c2 = await band();
    check("typetwo: Visual FX turned off on the way stops the ward where it is (its shimmer, runes and carved name as they were), not back to its resting look; on again it moves on",
      a0 !== a && b === a && b2 === a && c2 !== b, { movingOn: a0 !== a, heldAtSwitch: b === a, stillHeld: b2 === a, movingAgain: c2 !== b });
    // the wizard is no part of the scenery: turned off on the way, his robe
    // rests (its hem's left corner back at -12, where it hangs still), and on
    // again it sways on. Read as the robe is drawn
    // (FX is on again here, from the last switch; each frame notes the hem)
    await q.evaluate(() => {
      const P = CanvasRenderingContext2D.prototype, curve = P.quadraticCurveTo;
      P.quadraticCurveTo = function (cx, cy, ex) { if (cx === -13 && cy === -4) window.__hem = ex; return curve.apply(this, arguments); };
    });
    const hem = async () => { await q.evaluate(() => { window.__hem = null; }); await q.clock.runFor(100); return q.evaluate(() => window.__hem); };
    await q.clock.runFor(1300);
    const onHem = await hem();
    await flip(); await q.clock.runFor(300);
    const offHem = await hem();
    await flip(); await q.clock.runFor(300);
    const againHem = await hem();
    check("typetwo: Visual FX turned off on the way rests the wizard's robe (not held mid-sway); on again it sways on",
      onHem !== null && onHem !== -12 && offHem === -12 && againHem !== null && againHem !== -12, { onHem, offHem, againHem });
    check("typetwo (FX switched on the way): no page errors", q.errs.length === 0, q.errs);
    await c.close();
  }

  // ---- Zen: the End key, then the End session button, end the run onto its results
  {
    const p = await lib.open(ctx, base, "games/typetwo/");
    const look = () => p.evaluate(() => {
      const b = document.getElementById("endBtn");
      return { state: __game.state, btn: !!b && !b.hidden && getComputedStyle(b).display !== "none",
        over: !document.getElementById("overScreen").classList.contains("hidden"), best: document.getElementById("overBest").textContent };
    });
    await p.click('.mode[data-mode="zen"]'); await p.keyboard.press("Enter"); await p.waitForTimeout(200);
    const z0 = await look();
    await p.keyboard.press("End"); await p.waitForTimeout(100);
    const z1 = await look();
    check("typetwo zen: an End session button shows in the run, and End ends it onto the results", z0.state === "playing" && z0.btn && z1.state === "over" && z1.over && /Zen session ended/.test(z1.best) && !z1.btn, { z0, z1 });
    await p.click("#againBtn"); await p.waitForTimeout(200);
    await p.click("#endBtn"); await p.waitForTimeout(100);
    const z2 = await look();
    check("typetwo zen: the End session button ends the run too", z2.state === "over" && /Zen session ended/.test(z2.best), z2);
    // Normal: no button, and End is no key there
    await p.waitForTimeout(1000);   // (the results' keys wait a beat)
    await p.keyboard.press("Backspace"); await p.waitForTimeout(100);
    await p.click('.mode[data-mode="normal"]'); await p.keyboard.press("Enter"); await p.waitForTimeout(200);
    await p.keyboard.press("End"); await p.waitForTimeout(100);
    const n = await look();
    check("typetwo normal: no End session button, and End doesn't end the run", n.state === "playing" && !n.btn, n);
    check("typetwo (zen): no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }
  await ctx.close();

  // ---- the menus' key legends and the End session keycap: shown on a desktop, hidden on a phone
  const { devices } = require("@playwright/test");
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const c2 = await lib.newContext(browser, opts);
    const q = await lib.open(c2, base, "games/typetwo/");
    const odd = await q.evaluate((phone) => [...document.querySelectorAll("#startScreen kbd, #overScreen kbd, #endBtn kbd")].filter((k) => {
      const w = k.closest(".gs-keys");
      return !w || (getComputedStyle(w).display === "none") !== phone;
    }).map((k) => (k.closest("[id]") || {}).id + ":" + k.textContent), label === "phone");
    const count = await q.evaluate(() => document.querySelectorAll("#startScreen kbd, #overScreen kbd, #endBtn kbd").length);
    check("typetwo, " + label + ": the menus' key legends " + (label === "phone" ? "are hidden" : "show"), count >= 8 && odd.length === 0, { count, odd });
    if (label === "phone") {
      // a Zen run's HUD, with its button, still fits a phone's width
      await q.click('.mode[data-mode="zen"]'); await q.click("#startBtn"); await q.waitForTimeout(200);
      const fit = await q.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth, btn: !document.getElementById("endBtn").hidden }));
      check("typetwo, phone: a Zen run's End session button fits the HUD", fit.btn && fit.sw <= fit.w, fit);
    } else { await q.click("#startBtn"); await q.waitForTimeout(200); }
    // the in-run hint names no pause (the ⏸ in the corner carries its key)
    // and no Esc, on a desktop as on a phone
    const hint = await q.evaluate(() => ({ text: document.getElementById("hint").innerText, corner: !!document.querySelector(".gs-pause-btn") }));
    check("typetwo, " + label + ": the in-run hint names no pause key (the corner's ⏸ does) and no Esc", /Type to cast/.test(hint.text) && !/pause/i.test(hint.text) && !/Esc/.test(hint.text) && hint.corner, hint);
    await q.close();
    await c2.close();
  }

  // ---- Enter on a focused mode button picks that mode and stays on the start
  // screen (it used to begin as well, in the mode as it was); a mode picked
  // with the mouse keeps no focus, so the next Enter begins
  {
    const c = await lib.newContext(browser);
    const q = await lib.open(c, base, "games/typetwo/");
    const look = () => q.evaluate(() => ({ state: __game.state, mode: document.querySelector("#modes .mode.active").dataset.mode, focus: document.activeElement.tagName }));
    await q.focus('#modes .mode[data-mode="zen"]'); await q.keyboard.press("Enter"); await q.waitForTimeout(150);
    const a = await look();
    await q.evaluate(() => document.activeElement.blur());
    await q.click('#modes .mode[data-mode="hard"]', { timeout: 3000 }).catch(() => {}); await q.waitForTimeout(80);
    const b = await look();
    await q.keyboard.press("Enter"); await q.waitForTimeout(200);
    const d = await look();
    check("typetwo: Enter on a focused mode button only picks it; after a mouse pick (which keeps no focus) Enter begins",
      a.state === "start" && a.mode === "zen" && b.state === "start" && b.mode === "hard" && b.focus !== "BUTTON" && d.state === "playing" && d.mode === "hard", { a, b, d });
    check("typetwo: no page errors (start screen keys)", q.errs.length === 0, q.errs);
    await q.close();
    await c.close();
  }

  // ---- a cleared word's points carry the streak's multiplier: "+N  ×1.04"
  // for the first clean word, "×1.08" for the second
  {
    const cx = await lib.newContext(browser);
    const p = await lib.open(cx, base, "games/typetwo/");
    await p.click('.mode[data-mode="zen"]'); await p.keyboard.press("Enter");
    await p.waitForFunction(() => __game.state === "playing" && __game.words.length >= 2, null, { timeout: 15000 });
    const pops = [];
    for (let k = 0; k < 2; k++) {
      const word = await p.evaluate(() => { const w = __game.words.find((x) => x.y > 20) || __game.words[0]; return { text: w.text, x: w.x + w.w / 2 }; });
      const s0 = await p.evaluate(() => __game.score);
      await p.keyboard.type(word.text, { delay: 30 });   // (a key at a time, as typed)
      await p.waitForFunction((s0) => __game.score > s0, s0, { timeout: 5000 }).catch(() => {});
      pops.push(await p.evaluate(([x, s0]) => { const q = __game.pops.filter((t) => /^\+/.test(t.txt)).pop(); return { txt: q && q.txt, gained: __game.score - s0, dx: q && Math.round(q.x - x) }; }, [word.x, s0]));
    }
    check("typetwo: a cleared word's points carry the streak's multiplier, \"+N  ×1.04\" for the first clean word and \"×1.08\" for the second, at the word",
      pops[0].txt === "+" + pops[0].gained + "  ×1.04" && pops[1].txt === "+" + pops[1].gained + "  ×1.08" && pops.every((q) => q.dx === 0), pops);
    check("typetwo (points): no page errors", p.errs.length === 0, p.errs);
    await cx.close();
  }

  // ---- the ward's name, WARD OF SAM LU, carved into the ward left of the
  // wizard: drawn in gold on the line, inside the screen, clear of the orb's
  // swing (42px either side of the middle), no smaller than 10px on a 320px
  // phone; the page carries no "made by" line
  for (const [label, opts] of [["1280x900", {}], ["1366x657", { viewport: { width: 1366, height: 657 } }], ["Pixel 7", devices["Pixel 7"]],
    ["phone 320", { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }], ["phone 360x560", { viewport: { width: 360, height: 560 }, isMobile: true, hasTouch: true }]]) {
    const c = await lib.newContext(browser, opts);
    const q = await lib.open(c, base, "games/typetwo/");
    await q.evaluate(() => localStorage.setItem("reduceMotion:typetwo", "1"));
    await q.reload({ waitUntil: "domcontentloaded" });
    await q.click("#startBtn");
    await q.waitForFunction(() => __game.state === "playing", null, { timeout: 15000 });
    await q.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const n = await q.evaluate(() => {
      const n = __game.wardName;
      if (!n) return null;
      const cv = document.getElementById("game"), k = cv.width / n.W;
      const x = Math.round(n.x0 * k), y = Math.round((n.lineY - 6) * k), w = Math.round((n.x1 - n.x0) * k), h = Math.round(12 * k);
      const d = cv.getContext("2d").getImageData(x, y, w, h).data;
      let gold = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] > 120 && d[i + 2] < 130 && d[i] - d[i + 2] > 60) gold++;
      return Object.assign(n, { gold: +(gold / (w * h)).toFixed(3), madeBy: /made by/i.test(document.body.innerText) });
    });
    check("typetwo, " + label + ": WARD OF SAM LU is carved in gold into the ward, left of the wizard, inside the screen and clear of the orb's swing",
      !!n && n.text === "WARD OF SAM LU" && n.x0 >= 8 && n.x1 <= n.W / 2 - 42 && n.size >= 10 && n.gold > 0.08 && !n.madeBy, n);
    check("typetwo (ward name), " + label + ": no page errors", q.errs.length === 0, q.errs);
    await c.close();
  }
};
