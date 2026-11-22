// Tic-Tac-Toe: Esc closes the Rules card (and stays in the game); Order &
// Chaos tells Order the rule the board plays by: five of one symbol.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  // (the coin flip always says "you", as in guard.js)
  const youFirst = (pg) => pg.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); });
  let p = await lib.open(ctx, base, "games/tic-tac-toe/");
  await youFirst(p);
  await p.click("#startGame"); await p.waitForTimeout(150);
  await p.click("#rules");
  const open = await p.evaluate(() => document.getElementById("rulesModal").classList.contains("open"));
  await p.keyboard.press("Escape"); await p.waitForTimeout(250);
  const shut = await p.evaluate(() => !document.getElementById("rulesModal").classList.contains("open"));
  check("tic-tac-toe: Esc closes the Rules card and stays in the game", open && shut && p.leaves === 0, { open, shut, leaves: p.leaves });
  await p.close();

  p = await lib.open(ctx, base, "games/tic-tac-toe/");
  await youFirst(p);
  await p.click('.opt[data-value="chaos"]'); await p.click('#chaosSideGroup .opt[data-value="order"]');
  await p.click("#startGame"); await p.waitForTimeout(150);
  const prompt = await p.evaluate(() => document.getElementById("status").textContent);
  check("tic-tac-toe: Order's prompt asks for five of one symbol (not any mix)", !/any mix/i.test(prompt) && /one symbol/i.test(prompt), prompt);
  check("tic-tac-toe: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- the computer takes its time to answer on every kind of board, with
  // Visual FX off as with it on (FX off used to cut its pause to a quarter of
  // a second). Timed in the page, from your mark to its mark.
  for (const [mode, cell] of [["classic", ".cell"], ["ultimate", ".ucell"], ["gomoku", ".gcell"]]) {
    const gaps = {}, errs = [];
    for (const off of [false, true]) {
      const q = await lib.open(ctx, base, "games/tic-tac-toe/", { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:tic-tac-toe", off ? "1" : "0"); } catch (e) {} }, off) });
      await youFirst(q);
      await q.click('.opt[data-value="' + mode + '"]');
      await q.click("#startGame"); await q.waitForTimeout(150);
      gaps[off ? "off" : "on"] = await q.evaluate((sel) => new Promise((res) => {
        const cells = document.querySelectorAll(sel), t0 = performance.now();
        cells[Math.floor(cells.length / 2)].click();
        (function poll() {
          if (document.querySelector(sel + ".o")) res(Math.round(performance.now() - t0));
          else if (performance.now() - t0 > 8000) res(-1);
          else setTimeout(poll, 5);
        })();
      }), cell);
      errs.push(...q.errs);
      await q.close();
    }
    check("tic-tac-toe " + mode + ": the computer takes the same pause to answer with Visual FX off as with it on (at least 0.4 s)", gaps.on >= 400 && gaps.off >= 400, gaps);
    check("tic-tac-toe " + mode + " (the computer's pause): no page errors", errs.length === 0, errs);
  }
  await ctx.close();

  // ---- the teacher's signature, "Prof. Sam Lu", chalked in the slate's
  // bottom corner: on the slate, clear of everything else written there, and
  // it adds no scroll, on every board; the page has no "made by" line
  const { devices } = require("@playwright/test");
  const mob = (w, h) => ({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
  for (const [label, opts] of [["1280x900", {}], ["1366x657", { viewport: { width: 1366, height: 657 } }], ["Pixel 7", devices["Pixel 7"]],
    ["phone 320x568", mob(320, 568)], ["phone 360x560", mob(360, 560)], ["phone 375x553", mob(375, 553)]]) {
    const c = await lib.newContext(browser, opts);
    const q = await lib.open(c, base, "games/tic-tac-toe/");
    await youFirst(q);
    const seen = [];
    for (const mode of ["classic", "ultimate", "gomoku"]) {
      if (mode !== "classic") { await q.click("#reset"); await q.waitForTimeout(150); }
      await q.click('.opt[data-value="' + mode + '"]'); await q.click("#startGame"); await q.waitForTimeout(200);
      seen.push(await q.evaluate((mode) => {
        const pr = document.querySelector(".slate .prof"), slate = document.querySelector(".slate");
        if (!pr) return { mode, missing: true };
        const b = pr.getBoundingClientRect(), s = slate.getBoundingClientRect();
        const hits = [...slate.querySelectorAll("h1, #status, #symPick, #board, #uboard, #gboard, .controls button, .score span")]
          .filter((e) => e.offsetParent !== null)
          .filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top; })
          .map((e) => e.id || e.className || e.tagName);
        const sh = document.documentElement.scrollHeight;
        pr.style.display = "none";
        const shWithout = document.documentElement.scrollHeight;
        pr.style.display = "";
        return { mode, text: pr.textContent.replace(/ /g, " "), shown: b.width > 0 && getComputedStyle(pr).visibility !== "hidden",
          inside: b.left >= s.left && b.right <= s.right && b.top >= s.top && b.bottom <= s.bottom + 1.5, hits, addsScroll: sh !== shWithout,
          madeBy: /made by/i.test(document.body.innerText) };
      }, mode));
    }
    const bad = seen.filter((r) => r.missing || r.text !== "Prof. Sam Lu" || !r.shown || !r.inside || r.hits.length || r.addsScroll || r.madeBy);
    check("tic-tac-toe, " + label + ": \"Prof. Sam Lu\" is chalked in the slate's bottom corner, clear of the board, buttons and tally, adding no scroll, on Classic, Ultimate and Gomoku",
      bad.length === 0, bad.length ? bad : seen.map((r) => r.mode));
    check("tic-tac-toe (signature), " + label + ": no page errors", q.errs.length === 0, q.errs);
    await c.close();
  }

  // ---- sun through the classroom window: two shafts across the wall behind
  // the slate, with chalk dust floating in them. The shafts are there with
  // Visual FX on or off, on the start screen too (the wall itself, the slate
  // hidden behind it rather than painted over). With FX on the dust drifts,
  // held while paused and drifting again after Restart; turned off on the
  // way it stops where it is (each layer's own clock kept, never sent back);
  // with FX off from the start it hangs still.
  {
    const sc = await lib.newContext(browser);
    const dust = (q) => q.evaluate(() => [...document.querySelectorAll(".sunbeam i")].map((i) => { const m = new DOMMatrix(getComputedStyle(i).transform === "none" ? undefined : getComputedStyle(i).transform); return [+m.m41.toFixed(3), +m.m42.toFixed(3)]; }));
    const same = (a, b) => a.length === 2 && a.every((p, k) => p[0] === b[k][0] && p[1] === b[k][1]);
    // (moving is waited for, up to a few seconds: a busy machine can give a page few frames)
    const moves = async (q) => { const a = await dust(q); await q.waitForFunction((a) => [...document.querySelectorAll(".sunbeam i")].every((i, k) => { const m = new DOMMatrix(getComputedStyle(i).transform === "none" ? undefined : getComputedStyle(i).transform); return Math.hypot(m.m41 - a[k][0], m.m42 - a[k][1]) > 1; }), a, { timeout: 6000, polling: 100 }).catch(() => {}); const b = await dust(q); return { a, b, moved: !same(a, b) && b.every((p, k) => Math.hypot(p[0] - a[k][0], p[1] - a[k][1]) > 1) }; };
    const still = async (q) => { await q.waitForFunction(() => [...document.querySelectorAll(".sunbeam i")].every((i) => i.getAnimations().every((x) => x.playState !== "running" && !x.pending)), null, { timeout: 5000 }).catch(() => {}); const a = await dust(q); await q.waitForTimeout(700); const b = await dust(q); return { a, b, still: same(a, b) }; };
    const fxAt = (off) => ({ before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:tic-tac-toe", off ? "1" : "0"); } catch (e) {} }, off) });
    let q = await lib.open(sc, base, "games/tic-tac-toe/", fxAt(false));
    await youFirst(q);
    const menu = await q.evaluate(() => {
      const s = document.querySelector(".sunbeam"); if (!s) return { missing: true };
      const cs = getComputedStyle(s);
      return { layers: s.children.length, shafts: /linear-gradient/.test(cs.backgroundImage), events: cs.pointerEvents, z: cs.zIndex, fixed: cs.position,
        slateHidden: getComputedStyle(document.querySelector("main.slate")).visibility === "hidden", panel: getComputedStyle(document.getElementById("modeModal")).backgroundImage };
    });
    const onMenu = await moves(q);
    await q.click("#startGame"); await q.waitForTimeout(150);
    const slateShown = await q.evaluate(() => getComputedStyle(document.querySelector("main.slate")).visibility === "visible");
    const inPlay = await moves(q);
    await q.keyboard.press("p");
    await q.waitForFunction(() => document.body.classList.contains("ttt-held"), null, { timeout: 5000 }).catch(() => {});
    const held = await still(q);
    await q.keyboard.press("r");   // Restart (nothing drawn yet: no question)
    await q.waitForFunction(() => !document.body.classList.contains("ttt-held"), null, { timeout: 5000 }).catch(() => {});
    const again = await moves(q);
    check("tic-tac-toe: two shafts of sun cross the wall behind the slate, on the start screen too (the wall itself, the slate hidden behind it), chalk dust in them taking no clicks",
      menu.layers === 2 && menu.shafts && menu.events === "none" && menu.z === "-1" && menu.fixed === "fixed" && menu.slateHidden && menu.panel === "none" && slateShown, { menu, slateShown });
    check("tic-tac-toe, Visual FX on: the chalk dust drifts in the sunlight, on the start screen and in play; held while paused, drifting again after Restart",
      onMenu.moved && inPlay.moved && held.still && again.moved, { onMenu, inPlay, held, again });
    // FX turned off on the way: judged by each layer's own clock, read in the
    // same moment the switch is pressed (a busy machine may let the dust drift
    // on a little before the pause lands, but never back to its start)
    const before = await q.evaluate(() => { const t = [...document.querySelectorAll(".sunbeam i")].map((i) => (i.getAnimations()[0] || {}).currentTime); document.querySelector(".rm-toggle").click(); return t; });
    const stopped = await still(q);
    const t1 = await q.evaluate(() => [...document.querySelectorAll(".sunbeam i")].map((i) => (i.getAnimations()[0] || {}).currentTime));
    await q.evaluate(() => document.querySelector(".rm-toggle").click());
    const on = await moves(q);
    check("tic-tac-toe, Visual FX turned off on the way: the dust stops where it is, no jump; on again it drifts on",
      before.length === 2 && before.every((t, k) => t > 300 && t1[k] >= t && t1[k] < t + 3000) && stopped.still && on.moved, { before, t1, stopped, on });
    await q.close();
    q = await lib.open(sc, base, "games/tic-tac-toe/", fxAt(true));
    const off = await still(q);
    const offShafts = await q.evaluate(() => { const s = document.querySelector(".sunbeam"); return !!s && /linear-gradient/.test(getComputedStyle(s).backgroundImage); });
    check("tic-tac-toe, Visual FX off: the shafts are there and the dust hangs still where it lies", off.still && offShafts && off.a.every((p) => p[0] === 0 && p[1] === 0), { off, offShafts });
    check("tic-tac-toe (sunbeam): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await sc.close();
  }
};
