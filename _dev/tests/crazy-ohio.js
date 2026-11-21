// Crazy Ohio: with storage blocked the game still runs; a run whose countdown
// ends with the tab hidden or the window unfocused starts paused, its clock
// still full; the lanes' F G H J labels hide on touch-only devices; a
// Precision hit's judgment says what it scored.
const BLOCK_STORAGE = (pg) => pg.addInitScript(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("The operation is insecure.", "SecurityError"); } });
});

module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  const ctx = await lib.newContext(browser);
  const card = (p) => p.evaluate(() => { const g = document.querySelector(".gs-pause:not(.gs-dialog)"); return !!g && !g.hidden; });
  const shown = (p) => p.evaluate(() => ["setup", "play", "result"].find((id) => !document.getElementById(id).hidden));

  let p = await lib.open(ctx, base, "games/crazy-ohio/", { before: BLOCK_STORAGE });
  const setup = await p.evaluate(() => document.getElementById("setupBest").textContent);
  await p.click("#startBtn"); await p.waitForTimeout(100);
  const sec = await shown(p);
  check("crazy-ohio: with storage blocked the game still runs (no best shown, the countdown starts)", p.errs.length === 0 && /No record/.test(setup) && sec === "play", { errs: p.errs, setup, sec });
  await p.close();

  // the window loses focus during the countdown (as a tab switch would leave it)
  p = await lib.open(ctx, base, "games/crazy-ohio/");
  // Start and lose focus in one step (on a busy machine the 1.5 s countdown can
  // be over before a separate step lands), then wait for the run to begin, paused
  await p.evaluate(() => { document.getElementById("startBtn").click(); document.hasFocus = () => false; });
  await p.waitForFunction(() => { const g = document.querySelector(".gs-pause:not(.gs-dialog)"); return !!g && !g.hidden; }, null, { timeout: 15000 }).catch(() => {});
  const away = { paused: await card(p), time: await p.evaluate(() => document.getElementById("vTime").textContent) };
  await p.evaluate(() => { delete document.hasFocus; });
  await p.keyboard.press("p");
  // resumed, the clock runs down from full (polled: slower on a busy machine)
  await p.waitForFunction(() => Number(document.getElementById("vTime").textContent) < 30, null, { timeout: 10000 }).catch(() => {});
  const back = { paused: await card(p), time: await p.evaluate(() => document.getElementById("vTime").textContent) };
  check("crazy-ohio: a run that begins with the window away starts paused, its clock full; resuming runs it",
    away.paused && away.time === "30.0" && !back.paused && Number(back.time) < 30, { away, back });
  check("crazy-ohio: no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await ctx.close();

  // the lane labels name keys: shown with a keyboard, hidden on touch-only devices
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const c = await lib.newContext(browser, opts);
    const q = await lib.open(c, base, "games/crazy-ohio/");
    await q.evaluate(() => document.getElementById("startBtn").click()); await q.waitForTimeout(100);
    const labels = await q.evaluate(() => [...document.querySelectorAll(".lane .key")].map((k) => k.innerText.trim()).join(""));
    const want = label === "desktop" ? "FGHJ" : "";
    check("crazy-ohio " + label + ": the lanes' key labels " + (want ? "show" : "hide"), labels === want, labels);
    await q.close();
    await c.close();
  }

  // ---- a Precision hit's judgment says what it scored under it ("+300" for a
  // PERFECT, "+150" a GREAT), in the lane pressed; it rises with Visual FX on
  // and holds still with it off; a pause holds it, and it goes after 620 ms.
  // (How much of the tile is in the key zone is set by the test.)
  {
    const FRAC = ["  function judgeFraction(frac) {", "  function judgeFraction(frac) {\n    if (window.__coFrac != null) frac = window.__coFrac;"];
    const wait = (q, ms) => q.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), ms);
    const c = await lib.newContext(browser);
    const got = {};
    for (const off of [false, true]) {
      const q = await lib.open(c, base, "games/crazy-ohio/", { before: (pg) => lib.injectScript(pg, "games/crazy-ohio/game.js", [FRAC]) });
      await q.evaluate((off) => { window.RM_ON = () => off; document.documentElement.classList.toggle("fx-off", off); }, off);
      await q.click('.choice[data-mode="precision"]');
      await q.click("#startBtn");
      const r = {};
      for (const [frac, want] of [[1, "+300"], [0.7, "+150"]]) {
        await q.waitForFunction(() => __OSU_TEST__.getTiles().some((t) => !t.resolved), null, { timeout: 20000 });
        const hit = await q.evaluate(async (frac) => {
          window.__coFrac = frac;
          const t = __OSU_TEST__.getTiles().filter((x) => !x.resolved).sort((a, b) => b.lastY - a.lastY)[0];
          const s0 = +document.getElementById("vScore").textContent;
          document.dispatchEvent(new KeyboardEvent("keydown", { code: ["KeyF", "KeyG", "KeyH", "KeyJ"][t.col], key: "fghj"[t.col], bubbles: true }));
          document.dispatchEvent(new KeyboardEvent("keyup", { code: ["KeyF", "KeyG", "KeyH", "KeyJ"][t.col], key: "fghj"[t.col], bubbles: true }));
          const lane = document.querySelectorAll(".lane")[t.col], j = [...lane.querySelectorAll(".judge")].pop();
          return { col: t.col, gain: +document.getElementById("vScore").textContent - s0, label: j ? j.firstChild.textContent : null,
            pts: j && j.querySelector(".pts") ? j.querySelector(".pts").textContent : null, inLane: !!j };
        }, frac);
        hit.want = want;
        r[want] = hit;
      }
      // the last label: does it move, does a pause hold it, does it go
      const top = () => q.evaluate(() => { const j = document.querySelector(".judge.great"); return j ? j.getBoundingClientRect().top : null; });
      const a = await top(); await wait(q, 250); const b = await top();
      r.moved = a !== null && b !== null ? +(a - b).toFixed(1) : null;
      await q.keyboard.press("p");
      await wait(q, 900);
      r.heldThrough = await q.evaluate(() => !!document.querySelector(".judge.great"));
      await q.keyboard.press("p");
      r.gone = await q.waitForFunction(() => !document.querySelector(".judge.great"), null, { timeout: 10000 }).then(() => true, () => false);
      got[off ? "off" : "on"] = r;
      check("crazy-ohio (Precision points, FX " + (off ? "off" : "on") + "): no page errors", q.errs.length === 0, q.errs);
      await q.close();
    }
    const ok = (r) => ["+300", "+150"].every((w) => r[w] && r[w].inLane && r[w].pts === w && "+" + r[w].gain === w) && r["+300"].label === "PERFECT" && r["+150"].label === "GREAT" && r.heldThrough && r.gone;
    check("crazy-ohio: a Precision hit's judgment says what it scored under it in the lane pressed (PERFECT +300, GREAT +150, the score's own rise); a pause holds it, and it goes after",
      ok(got.on) && ok(got.off), got);
    check("crazy-ohio: the judgment and its points rise as they fade with Visual FX on, and hold still with it off",
      got.on.moved > 2 && got.off.moved === 0, { on: got.on.moved, off: got.off.moved });
    await c.close();
  }

  // the show's banner, SAM LU LIVE, under a length of lighting truss: beside
  // the stage's column where the page is wide, else in the gap under the
  // title where every screen leaves one, else left off (never squeezed in);
  // where it hangs it is on the screen, clear of the title, the screen's
  // contents and the corner buttons, in the same place on the settings, the
  // run and the results, the page no taller for it, and still with Visual FX off
  {
    const sizes = [
      ["1280x900", { viewport: { width: 1280, height: 900 } }, true], ["1366x657", { viewport: { width: 1366, height: 657 } }, true],
      ["1280x600", { viewport: { width: 1280, height: 600 } }, true], ["800x600", { viewport: { width: 800, height: 600 } }, false],
      ["Pixel 7", devices["Pixel 7"], true], ["320x568", { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true }, false],
      ["375x553", { viewport: { width: 375, height: 553 }, isMobile: true, hasTouch: true }, false], ["360x560", { viewport: { width: 360, height: 560 }, isMobile: true, hasTouch: true }, false],
      ["sideways", { viewport: { width: 915, height: 412 }, isMobile: true, hasTouch: true }, true],
    ];
    const look = (q) => q.evaluate(() => {
      const rig = document.getElementById("rig");
      if (!rig) return null;
      const box = (r) => ({ l: r.left, t: r.top + scrollY, r: r.right, b: r.bottom + scrollY });
      const meet = (a, z) => a.l < z.r && z.l < a.r && a.t < z.b && z.t < a.b;
      const shown = !rig.hidden && rig.offsetWidth > 0;
      const out = { shown, sh: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth };
      if (!shown) return out;
      const b = box(rig.getBoundingClientRect()), banner = document.getElementById("banner");
      rig.style.display = "none"; const sh0 = document.documentElement.scrollHeight, sw0 = document.documentElement.scrollWidth; rig.style.display = "";
      const rg = document.createRange(); rg.selectNodeContents(document.querySelector("header.top h1")); const title = box(rg.getBoundingClientRect());
      rg.selectNodeContents(document.getElementById("subtitle")); const sub = box(rg.getBoundingClientRect());
      const sec = ["setup", "play", "result"].map((i) => document.getElementById(i)).find((s) => !s.hidden);
      const parts = [...sec.children].filter((c) => c.offsetHeight > 0).map((c) => box(c.getBoundingClientRect()));
      const corners = [...document.querySelectorAll("body *")].filter((e) => getComputedStyle(e).position === "fixed" && e.offsetWidth > 0 && e.getBoundingClientRect().top < 80).map((e) => box(e.getBoundingClientRect()));
      return Object.assign(out, { b, text: banner.textContent.replace(/\s+/g, " ").trim(), size: parseFloat(getComputedStyle(banner).fontSize), clicks: getComputedStyle(rig).pointerEvents,
        grows: out.sh - sh0, widens: out.sw - sw0, hits: [title, sub].concat(parts, corners).filter((z) => meet(b, z)).length });
    });
    for (const [name, opt, must] of sizes) {
      const c = await lib.newContext(browser, opt);
      const q = await lib.open(c, base, "games/crazy-ohio/");
      const menu = await look(q);
      await q.click("#startBtn");
      await q.waitForFunction(() => !document.getElementById("play").hidden, null, { timeout: 5000 });
      await q.waitForTimeout(150);
      const run = await look(q);
      await q.evaluate(() => { ["setup", "play"].forEach((i) => (document.getElementById(i).hidden = true)); document.getElementById("result").hidden = false; document.getElementById("finalScore").textContent = "88"; document.getElementById("rating").textContent = "Great run"; window.dispatchEvent(new Event("resize")); });
      await q.waitForTimeout(150);
      const res = await look(q);
      const all = [menu, run, res], fine = (s) => !!s && (!s.shown || (s.text === "SAM LU LIVE" && s.size >= 11 && s.clicks === "none" && s.hits === 0 && s.grows === 0 && s.widens === 0 && s.b.l >= 4 && s.b.r <= s.vw - 4 && s.b.t >= 0));
      const same = all.every((s) => s && s.shown === all[0].shown) && (!all[0].shown || all.every((s) => Math.abs(s.b.l - all[0].b.l) < 1.5 && Math.abs(s.b.t - all[0].b.t) < 1.5));
      check("crazy-ohio, " + name + ": the SAM LU LIVE banner under its truss is " + (must ? "hung" : "hung or left off") + " clear of the title, the screen and the corner buttons, in one place on the settings, the run and the results, the page no taller or wider for it",
        all.every(fine) && same && (!must || all[0].shown), { menu, run, res });
      await c.close();
    }
    // Visual FX on, the banner sways on its cables; off, it hangs still
    const swayed = async (off) => {
      const c = await lib.newContext(browser, { viewport: { width: 1280, height: 900 } });
      const q = await lib.open(c, base, "games/crazy-ohio/", { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:crazy-ohio", off ? "1" : "0"); } catch (e) {} }, off) });
      const at = () => q.evaluate(() => { const d = document.querySelector("#rig .drop"); return d ? getComputedStyle(d).transform : null; });
      const a = await at(); await q.waitForTimeout(900); const b = await at();
      await c.close();
      return { a, b };
    };
    const on = await swayed(false), off = await swayed(true);
    check("crazy-ohio: with Visual FX on the banner sways on its cables; with it off it hangs still",
      !!on.a && on.a !== on.b && !!off.a && off.a === off.b, { on, off });
  }

  // ---- the stage's lights: a pink and a violet cone of light thrown down
  // across the backdrop from above (body::before and ::after), under
  // everything and taking no clicks. With Visual FX on they sweep to and fro,
  // held while the run is paused and sweeping again after Restart; FX turned
  // off on the way stops them where they are (no snap back), and on again
  // they sweep on; with FX off from the start they stand still, angled in
  // across the stage. Read as each light's angle, and its own clock.
  {
    const lc = await lib.newContext(browser);
    const PE = ["::before", "::after"];
    const ang = (q) => q.evaluate((PE) => PE.map((pe) => {
      const cs = getComputedStyle(document.body, pe), m = new DOMMatrix(cs.transform === "none" ? undefined : cs.transform);
      return { deg: +(Math.atan2(m.b, m.a) * 180 / Math.PI).toFixed(3), cone: /conic-gradient/.test(cs.backgroundImage), clicks: cs.pointerEvents, z: cs.zIndex };
    }), PE);
    // (moving is waited for, up to a few seconds: a busy machine can give a
    // page few frames, and a fixed window then sees too little of it)
    const moves = async (q) => {
      const a = await ang(q);
      await q.waitForFunction(([a, PE]) => PE.every((pe, i) => { const cs = getComputedStyle(document.body, pe), m = new DOMMatrix(cs.transform === "none" ? undefined : cs.transform); return Math.abs(Math.atan2(m.b, m.a) * 180 / Math.PI - a[i].deg) > 0.5; }), [a, PE], { timeout: 6000, polling: 100 }).catch(() => {});
      const b = await ang(q);
      return { a, b, moved: a.every((x, i) => Math.abs(b[i].deg - x.deg) > 0.5) };
    };
    const still = async (q, ms) => { const a = await ang(q); await q.waitForTimeout(ms); const b = await ang(q); return { a, b, still: a.every((x, i) => x.deg === b[i].deg) }; };
    const clocks = (q) => q.evaluate(() => document.getAnimations().filter((x) => x.effect && x.effect.target === document.body && /co-beam/.test(x.animationName)).map((x) => ({ t: x.currentTime, state: x.playState })));
    // (a pause lands on a coming frame, late on a busy machine: waited for,
    // both sweeps paused and settled, then two frames more)
    const landed = async (q) => {
      await q.waitForFunction(() => { const an = document.getAnimations().filter((x) => x.effect && x.effect.target === document.body && /co-beam/.test(x.animationName)); return an.length === 2 && an.every((x) => x.playState === "paused" && !x.pending); }, null, { timeout: 6000, polling: 50 }).catch(() => {});
      await q.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    };
    const open = (off) => lib.open(lc, base, "games/crazy-ohio/", { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:crazy-ohio", off ? "1" : "0"); } catch (e) {} }, off) });
    let q = await open(false);
    const lit = await ang(q);
    const onMenu = await moves(q);
    await q.click("#startBtn");
    await q.waitForSelector('.gs-pause-btn[aria-disabled="false"]', { timeout: 15000 });
    const inPlay = await moves(q);
    await q.keyboard.press("p");
    await q.waitForFunction(() => document.body.classList.contains("co-held"), null, { timeout: 5000 }).catch(() => {});
    await landed(q);
    const paused = await still(q, 800);
    // Restart from the card asks first while a run is under way: Enter starts over
    await q.keyboard.press("r"); await q.waitForTimeout(150); await q.keyboard.press("Enter");
    await q.waitForFunction(() => !document.body.classList.contains("co-held"), null, { timeout: 5000 }).catch(() => {});
    const again = await moves(q);
    check("crazy-ohio, Visual FX on: a pink and a violet light sweep to and fro across the backdrop, under everything, on the menu and in a run; held while paused, sweeping again after Restart",
      lit.every((l) => l.cone && l.clicks === "none" && l.z === "-1") && onMenu.moved && inPlay.moved && paused.still && again.moved, { lit, onMenu, inPlay, paused, again });
    // FX turned off on the way: each light's own clock, read in the same
    // moment the switch is clicked, is kept (paused, not ended), and its angle
    // stays where it was (a light ended by FX off would spring back upright)
    const before = await q.evaluate(() => {
      const PE = ["::before", "::after"], read = () => PE.map((pe) => { const cs = getComputedStyle(document.body, pe), m = new DOMMatrix(cs.transform === "none" ? undefined : cs.transform); return +(Math.atan2(m.b, m.a) * 180 / Math.PI).toFixed(3); });
      const t = document.getAnimations().filter((x) => x.effect && x.effect.target === document.body && /co-beam/.test(x.animationName)).map((x) => x.currentTime), deg = read();
      document.querySelector(".rm-toggle").click();
      return { t, deg };
    });
    await q.waitForFunction(() => document.documentElement.classList.contains("fx-off"), null, { timeout: 5000 }).catch(() => {});
    await landed(q);
    const stopped = await still(q, 700), c1 = await clocks(q);
    await q.evaluate(() => document.querySelector(".rm-toggle").click());
    await q.waitForFunction(() => document.documentElement.classList.contains("fx-on"), null, { timeout: 5000 }).catch(() => {});
    const on = await moves(q);
    check("crazy-ohio, Visual FX turned off mid-sweep: the lights stop where they are, no jump; on again they sweep on from there",
      before.t.length === 2 && c1.length === 2 && c1.every((c, i) => c.state === "paused" && c.t >= before.t[i] && c.t < before.t[i] + 3000) &&
      stopped.still && stopped.b.every((x, i) => Math.abs(x.deg - before.deg[i]) < 10) && on.moved, { before, c1, stopped, on });
    await q.close();
    q = await open(true);
    const off = await still(q, 800);
    check("crazy-ohio, Visual FX off: the lights stand still, angled in across the stage (pink from the left, violet from the right)",
      off.still && off.b.every((l) => l.cone) && Math.abs(off.b[0].deg + 22) < 0.5 && Math.abs(off.b[1].deg - 22) < 0.5, off);
    check("crazy-ohio (stage lights): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await lc.close();
  }
};
