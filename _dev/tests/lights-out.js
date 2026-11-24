// Lights Out: Enter on a focused mode button only picks the mode, and a mode
// clicked with the mouse doesn't take over the run Enter then starts (a Zen
// sign used to run as Last Reel and fail on its first press); Backspace mid-sign
// asks before quitting; the keycaps, the end card's included, hide on a phone;
// a press on the bulb a hint glints stops the glint at once.
module.exports = async ({ browser, base, check, lib }) => {
  const open = (ctx) => lib.open(ctx, base, "games/lights-out/");
  const done = async (p, what) => { check("lights-out " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  let ctx = await lib.newContext(browser);

  // ---- Enter on a focused mode button picks that mode and starts nothing
  let p = await open(ctx);
  await p.keyboard.press("3");
  await p.evaluate(() => document.querySelector('#pick-mode button[data-v="windup"]').focus());
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const menu = await p.evaluate(() => ({ state: LightsOut.state(), mode: localStorage.getItem("lightsout_mode") }));
  check("lights-out: Enter on the focused Last Reel button picks it, without starting a Zen sign", menu.state === "menu" && menu.mode === "windup", menu);
  await done(p, "menu Enter");

  // ---- Last Reel clicked, then Zen picked by key: Enter deals a Zen sign that stays Zen
  p = await open(ctx);
  await p.click('#pick-mode button[data-v="windup"]');
  await p.keyboard.press("3");
  await p.keyboard.press("Enter"); await p.waitForTimeout(200);
  const dealt = await p.evaluate(() => LightsOut.state());
  if (dealt === "play") await p.evaluate(() => LightsOut.press(0));
  await p.waitForTimeout(150);
  const run = await p.evaluate(() => ({ after: LightsOut.state(), hud: document.getElementById("hud-mode").textContent, mode: localStorage.getItem("lightsout_mode"), over: document.getElementById("over-title").textContent }));
  check("lights-out: after clicking Last Reel then pressing 3, Enter deals a Zen sign and its first press doesn't end it",
    dealt === "play" && run.after === "play" && run.hud === "zen" && run.mode === "zen", Object.assign({ dealt }, run));
  await done(p, "mouse then Enter");

  // ---- a sign put out from the keyboard (Enter on each bulb): Enter on the end
  // card is its New sign, not one more press of the bulb still focused
  p = await open(ctx);
  await p.evaluate(() => LightsOut.start("zen"));
  for (const i of await p.evaluate(() => LightsOut.solution())) {
    await p.evaluate((i) => document.querySelectorAll("#board .bulb")[i].focus(), i);
    await p.keyboard.press("Enter");
  }
  await p.waitForFunction(() => !document.getElementById("over").hidden, null, { timeout: 3000 });
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const again = await p.evaluate(() => ({ state: LightsOut.state(), moves: LightsOut.moves(), card: !document.getElementById("over").hidden }));
  check("lights-out: after a sign put out with Enter on the bulbs, Enter on the end card deals a new sign", again.state === "play" && again.moves === 0 && !again.card, again);
  await done(p, "keyboard Next");

  // ---- Backspace mid-sign asks first: Esc keeps the sign, Enter quits to the menu
  p = await open(ctx);
  await p.evaluate(() => { LightsOut.start("zen"); LightsOut.press(0); });
  await p.keyboard.press("Backspace"); await p.waitForTimeout(100);
  const ask = await p.evaluate(() => ({ state: LightsOut.state(), title: (document.querySelector(".gs-dialog h2") || {}).textContent || null }));
  await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  const kept = await p.evaluate(() => ({ state: LightsOut.state(), moves: LightsOut.moves(), dialog: !!document.querySelector(".gs-dialog") }));
  await p.keyboard.press("Backspace"); await p.waitForTimeout(100);
  await p.keyboard.press("Enter"); await p.waitForTimeout(100);
  const quit = await p.evaluate(() => LightsOut.state());
  check("lights-out: Backspace mid-sign asks \"Quit this game?\"; Esc keeps the sign, Enter quits to the menu",
    ask.state === "play" && ask.title === "Quit this game?" && kept.state === "play" && kept.moves === 1 && !kept.dialog && quit === "menu" && p.leaves === 0, { ask, kept, quit, leaves: p.leaves });
  // a fresh sign has nothing to lose: straight back
  await p.evaluate(() => LightsOut.start("zen"));
  await p.keyboard.press("Backspace"); await p.waitForTimeout(100);
  const fresh = await p.evaluate(() => ({ state: LightsOut.state(), dialog: !!document.querySelector(".gs-dialog") }));
  check("lights-out: Backspace on a fresh sign goes straight back to the menu (guard)", fresh.state === "menu" && !fresh.dialog, fresh);
  // a last reel's "Next level" card is still the run: Backspace and Modes ask
  // there too; a finished zen sign's card goes at once
  const card = async (m) => {
    await p.evaluate((m) => { LightsOut.start(m); LightsOut.solution().forEach((i) => LightsOut.press(i)); }, m);
    await p.waitForFunction(() => !document.getElementById("over").hidden, null, { timeout: 8000 });
    await p.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  };
  const title = () => p.evaluate(() => (document.querySelector(".gs-dialog h2") || {}).textContent || null);
  await card("windup");
  await p.keyboard.press("Backspace"); await p.waitForTimeout(100);
  const nextKey = await title();
  await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  await p.click("#to-menu"); await p.waitForTimeout(100);
  const nextBtn = await title();
  await p.keyboard.press("Enter"); await p.waitForTimeout(100);
  const nextQuit = await p.evaluate(() => LightsOut.state());
  await card("zen");
  await p.keyboard.press("Backspace"); await p.waitForTimeout(100);
  const zenCard = { state: await p.evaluate(() => LightsOut.state()), title: await title() };
  check("lights-out: on a last reel's Next level card Backspace and Modes ask \"Quit this game?\"; a finished zen sign's card goes straight back",
    nextKey === "Quit this game?" && nextBtn === "Quit this game?" && nextQuit === "menu" && zenCard.state === "menu" && !zenCard.title && p.leaves === 0,
    { nextKey, nextBtn, nextQuit, zenCard, leaves: p.leaves });
  await done(p, "Backspace");
  await ctx.close();

  // ---- every keycap of the game's own (the shared pause card's aside) hides
  // on a touch-only phone, on the menu and the end card
  ctx = await lib.newContext(browser, require("@playwright/test").devices["Pixel 7"]);
  p = await open(ctx);
  const caps = () => p.evaluate(() => [...document.querySelectorAll("kbd")].filter((k) => !k.closest(".gs-pause")).map((k) => { const s = k.closest(".gs-keys"); return k.textContent + ":" + (s ? getComputedStyle(s).display : "unwrapped"); }));
  const onMenu = await caps();
  await p.evaluate(() => { LightsOut.start("zen"); LightsOut.solution().forEach((i) => LightsOut.press(i)); });
  await p.waitForFunction(() => !document.getElementById("over").hidden, null, { timeout: 3000 });
  const onCard = await caps();
  const hidden = (c) => c.length > 0 && c.every((x) => /:none$/.test(x));
  check("lights-out: on a touch-only phone every keycap is hidden, on the menu and the end card", hidden(onMenu) && hidden(onCard), { onMenu, onCard });
  await done(p, "touch keycaps");
  await ctx.close();

  // ---- a bulb clicked with the mouse isn't left focused: H for a hint then
  // glints only the hint (the bulb last clicked used to get the keyboard's
  // dashed ring too); the arrows still walk the sign with their ring
  ctx = await lib.newContext(browser);
  p = await open(ctx);
  await p.evaluate(() => LightsOut.start("zen")); await p.waitForTimeout(300);
  await p.click("#board .bulb:nth-child(1)"); await p.waitForTimeout(100);
  await p.keyboard.press("h"); await p.waitForTimeout(150);
  const hintNow = await p.evaluate(() => ({
    ringed: [...document.querySelectorAll("#board .bulb")].filter((b) => b.matches(":focus-visible")).length,
    focused: !!(document.activeElement && document.activeElement.classList.contains("bulb")),
    glints: document.querySelectorAll("#board .bulb.glint").length
  }));
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(80);
  const walked = await p.evaluate(() => [...document.querySelectorAll("#board .bulb")].filter((b) => b.matches(":focus-visible")).length);
  check("lights-out: after a bulb is clicked, H glints only the hint, with no dashed ring on the bulb clicked; the arrows still bring the ring",
    hintNow.ringed === 0 && !hintNow.focused && hintNow.glints === 1 && walked === 1, Object.assign({ walked }, hintNow));
  // a click on the glinting bulb stops its glint at once, not after its last pulse
  const answered = await p.evaluate(() => {
    const b = document.querySelector("#board .bulb.glint"), was = !!b;
    if (b) b.click();
    return { was, left: document.querySelectorAll("#board .bulb.glint").length, still: b ? getComputedStyle(b).animationName : null };
  });
  check("lights-out: a click on the hinted bulb stops its glint at once", answered.was && answered.left === 0 && answered.still === "none", answered);
  await done(p, "hint after a click");

  // ---- a count of one reads "1 move", not "1 moves" (today's sign put out in one)
  p = await open(ctx);
  const one = await p.evaluate(() => {
    const d = LightsOut.daily();
    localStorage.setItem("lightsout_daily", JSON.stringify(Object.assign({}, d, { done: true, moves: 1, par: 1 })));
    LightsOut.toMenu();
    return document.getElementById("daily-small").textContent;
  });
  check("lights-out: a sign put out in one press reads \"1 move\"", /done: 1 move \(par 1\)/.test(one), one);
  await done(p, "one move");
  await ctx.close();

  // the picture house's own name, THE SAM LU, on a crest astride the sign's
  // top edge: on the screen, readable, clear of the title, the letterboard,
  // the bulbs and the corner buttons, the page no taller (it never scrolls);
  // on the menu and in a run; it goes out with the front
  {
    const { devices } = require("@playwright/test");
    const touch = (w, h) => ({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
    const sizes = [["1280x900", { viewport: { width: 1280, height: 900 } }], ["1366x657", { viewport: { width: 1366, height: 657 } }],
      ["1280x600", { viewport: { width: 1280, height: 600 } }], ["800x600", { viewport: { width: 800, height: 600 } }], ["Pixel 7", devices["Pixel 7"]],
      ["320x568", touch(320, 568)], ["375x553", touch(375, 553)], ["360x560", touch(360, 560)], ["sideways", touch(915, 412)]];
    const look = (q) => q.evaluate(() => {
      const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
      const meet = (a, z) => a.l < z.r && z.l < a.r && a.t < z.b && z.t < a.b;
      const h = document.getElementById("house");
      if (!h) return null;
      const rg = document.createRange(); rg.selectNodeContents(document.querySelector(".sign h1"));
      const tr = rg.getBoundingClientRect(), title = { l: tr.left, t: tr.top, r: tr.right, b: tr.bottom }, b = box(h);
      const others = [title, box(document.querySelector(".letterboard")), box(document.getElementById("board"))]
        .concat([...document.querySelectorAll("body *")].filter((e) => getComputedStyle(e).position === "fixed" && e.offsetWidth > 0 && e.getBoundingClientRect().top < 80 && !e.closest(".panel")).map(box));
      return { text: h.textContent.trim(), b, size: parseFloat(getComputedStyle(h).fontSize), vw: innerWidth, vh: innerHeight,
        sh: document.documentElement.scrollHeight, hits: others.filter((o) => meet(b, o)).length, onSign: meet(b, box(document.querySelector(".sign"))) };
    });
    const bad = [];
    for (const [name, opt] of sizes) {
      const c = await lib.newContext(browser, opt);
      const q = await lib.open(c, base, "games/lights-out/");
      const menu = await look(q);
      await q.evaluate(() => LightsOut.start("windup")); await q.waitForTimeout(300);
      const run = await look(q);
      const good = (s) => !!s && s.text === "THE SAM LU" && s.size >= 10 && s.hits === 0 && s.onSign && s.b.t >= 0 && s.b.l >= 4 && s.b.r <= s.vw - 4 && s.sh <= s.vh;
      if (!good(menu) || !good(run)) bad.push({ name, menu, run });
      await c.close();
    }
    check("lights-out: THE SAM LU, the picture house's name, on a crest astride the sign's top edge: on screen, 10 px or more, clear of the title, letterboard, bulbs and corner buttons, no scroll, on the menu and in a run (9 sizes)", bad.length === 0, bad);
  }

  // ---- a last reel run lost to the reel shows the way out: the sign comes
  // back as it was dealt, its fewest presses numbered on it from the top, and
  // they're made one by one until it's dark (the run lost all the same); then
  // the card. The same pace with Visual FX off. A tap before the sign comes
  // back is no skip; a tap after it, or Enter, skips to the end, and Enter
  // again rolls again. A run begun mid-way, or the menu, isn't touched by the
  // old way's presses. Each run on the page's own clock, moved on by hand.
  {
    const fxKey = (off) => (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:lights-out", off ? "1" : "0"); } catch (e) {} }, off);
    const openClock = async (c, off) => {
      const q = await lib.open(c, base, "games/lights-out/", { before: async (pg) => { await pg.clock.install(); await fxKey(off)(pg); } });
      await q.clock.pauseAt(await q.evaluate(() => Date.now()) + 500);
      return q;
    };
    // level 1 (3×3: its presses are its only way out), then a bulb off that
    // way pressed till the reel runs out (pressed twice it undoes itself, so
    // the sign never goes out)
    const lose = (q) => q.evaluate(() => {
      LightsOut.start("windup");
      const dealt = LightsOut.grid(), sol = LightsOut.solution(), size = LightsOut.size();
      const spare = dealt.findIndex((v, i) => !sol.includes(i));
      let presses = 0;
      while (LightsOut.state() === "play" && presses < 50) { LightsOut.press(spare); presses++; }
      return { dealt, sol, size, presses, state: LightsOut.state(), budget: LightsOut.budget() };
    });
    const look = (q) => q.evaluate(() => {
      const cells = [...document.querySelectorAll("#board .bulb")];
      return {
        grid: LightsOut.grid(), state: LightsOut.state(), level: LightsOut.level(), moves: LightsOut.moves(),
        tags: cells.map((c, i) => { const t = c.querySelector(".way-n"); return t ? [i, +t.textContent, c.classList.contains("spent")] : null; }).filter(Boolean),
        now: cells.map((c, i) => (c.classList.contains("now") ? i : -1)).filter((i) => i >= 0),
        lit: cells.map((c, i) => (c.classList.contains("on") ? i : -1)).filter((i) => i >= 0),
        card: !document.getElementById("over").hidden, title: document.getElementById("over-title").textContent,
        stats: document.getElementById("over-stats").textContent, sub: document.getElementById("sign-sub").textContent,
        dark: document.getElementById("front").classList.contains("dark"),
        dialog: !!document.querySelector(".gs-dialog"),
      };
    });
    const toggle = (g, i, n) => { g = g.slice(); const x = i % n, y = (i / n) | 0; g[i] ^= 1; if (x > 0) g[i - 1] ^= 1; if (x < n - 1) g[i + 1] ^= 1; if (y > 0) g[i - n] ^= 1; if (y < n - 1) g[i + n] ^= 1; return g; };
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const onOf = (g) => g.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);

    // the way watched through, FX on and off (t from the loss: the sign back
    // at 0.9 s, press k made at 2.12 s + 0.6 s each, the card 0.7 s after the last)
    for (const off of [false, true]) {
      const c = await lib.newContext(browser);
      const q = await openClock(c, off);
      const L = await lose(q);
      const left = await look(q);
      await q.clock.runFor(950);
      const back = await look(q);
      await q.clock.runFor(2420 - 950);
      const steps = [];
      let g = L.dealt;
      for (let k = 0; k < L.sol.length; k++) {
        if (k) await q.clock.runFor(600);
        g = toggle(g, L.sol[k], L.size);
        const s = await look(q);
        steps.push({ k, ok: same(s.grid, g) && same(s.lit, onOf(g)) && same(s.now, [L.sol[k]]) && s.tags.filter((t) => t[2]).length === k + 1 && !s.card, grid: s.grid, now: s.now });
      }
      await q.clock.runFor(380);
      const before = await look(q);
      await q.clock.runFor(40);
      const end = await look(q);
      const fx = off ? "FX off" : "FX on";
      check("lights-out (" + fx + "): the reel run out, the sign comes back as it was dealt with its fewest presses numbered on it, 1, 2, 3 from the top; the card waits",
        L.state === "over" && L.presses === L.budget && !same(left.grid, L.dealt) && !left.card && left.tags.length === 0 &&
        same(back.grid, L.dealt) && same(back.lit, onOf(L.dealt)) && same(back.tags, L.sol.map((i, k) => [i, k + 1, false])) && back.sub === "the way out" && !back.card,
        { L, left: left.grid, back });
      check("lights-out (" + fx + "): the way's presses are made one by one, each glinting as it's made, till the sign is dark",
        L.sol.length > 0 && steps.every((s) => s.ok), steps.filter((s) => !s.ok));
      check("lights-out (" + fx + "): then the card, the run lost all the same (no win), with the way out's count",
        !before.card && end.card && end.state === "over" && end.grid.every((v) => v === 0) && end.title === "The reel ran out" && !end.dark &&
        end.stats.includes("the way out: " + L.sol.length + " moves, in any order") && end.tags.length === L.sol.length && end.tags.every((t) => t[2]) && end.now.length === 0,
        { before: before.card, end });
      check("lights-out (" + fx + ", the way out): no page errors", q.errs.length === 0, q.errs);
      await q.close(); await c.close();
    }

    // skips, and an old way's timers
    {
      const c = await lib.newContext(browser);
      let q = await openClock(c, false);
      const tap = () => q.evaluate(() => document.querySelector("#board .bulb").click());
      let L = await lose(q);
      await q.clock.runFor(300);
      await tap();
      const early = await look(q);
      await q.clock.runFor(700);
      const shown = await look(q);
      await tap();
      const tapped = await look(q);
      check("lights-out: a tap before the way out is on the sign doesn't skip it; a tap once it is skips to its end (the sign dark, every press numbered and spent) and the card",
        !early.card && same(shown.grid, L.dealt) && shown.tags.length === L.sol.length && !shown.card &&
        tapped.card && tapped.grid.every((v) => v === 0) && tapped.tags.length === L.sol.length && tapped.tags.every((t) => t[2]) && tapped.now.length === 0,
        { early, shown, tapped });

      L = await lose(q);
      await q.clock.runFor(1000);
      await q.keyboard.press("Enter");
      const skipped = await look(q);
      await q.keyboard.press("Enter");
      const rolled = await look(q);
      await q.clock.runFor(6000);
      const after = await look(q);
      check("lights-out: Enter during the way out skips to its end and the card; Enter again rolls again from level 1, a fresh sign the old way leaves alone",
        skipped.card && skipped.grid.every((v) => v === 0) && skipped.tags.every((t) => t[2]) &&
        rolled.state === "play" && rolled.level === 1 && rolled.moves === 0 && !rolled.card && rolled.tags.length === 0 &&
        same(after.grid, rolled.grid) && after.state === "play" && after.tags.length === 0,
        { skipped, rolled, after });
      // Space too: its skip puts the card up and focuses Roll again, and the
      // same Space let go there doesn't roll on through
      await lose(q);
      await q.clock.runFor(1000);
      await q.keyboard.press(" ");
      const spaced = await look(q);
      await q.keyboard.press(" ");
      const spacedOn = await look(q);
      check("lights-out: Space during the way out skips to the card and stops there; Space again rolls again",
        spaced.card && spaced.state === "over" && spaced.grid.every((v) => v === 0) && spacedOn.state === "play" && spacedOn.level === 1 && !spacedOn.card,
        { spaced, spacedOn });

      // a run begun mid-way (the pause card's Restart does this), then the menu mid-way
      await lose(q);
      await q.clock.runFor(2300);
      await q.evaluate(() => LightsOut.start("windup"));
      const fresh = await look(q);
      await q.clock.runFor(6000);
      const later = await look(q);
      await lose(q);
      await q.clock.runFor(1200);
      await q.keyboard.press("Backspace");
      const menu = await look(q);
      await q.clock.runFor(6000);
      const menuLater = await look(q);
      check("lights-out: a run begun mid-way out, or the menu, is left alone by the old way's presses; Backspace mid-way goes straight to the menu, the numbers off the sign",
        same(later.grid, fresh.grid) && later.state === "play" && later.moves === 0 && later.tags.length === 0 && !later.card &&
        menu.state === "menu" && !menu.dialog && menu.tags.length === 0 && menu.now.length === 0 && same(menuLater.grid, menu.grid) && !menuLater.card,
        { fresh: fresh.grid, later: later.grid, menu, menuLater: menuLater.grid });
      check("lights-out (skipping the way out): no page errors", q.errs.length === 0, q.errs);
      await q.close(); await c.close();
    }
  }

  // ---- the fan of rays over the front: with Visual FX on it sweeps to and
  // fro; a page opened with FX off has it standing straight, still
  {
    const got = {};
    for (const off of [false, true]) {
      const c = await lib.newContext(browser);
      const q = await lib.open(c, base, "games/lights-out/", { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:lights-out", off ? "1" : "0"); } catch (e) {} }, off) });
      const read = () => q.evaluate(() => {
        const a = document.getAnimations().filter((x) => x.effect && x.effect.target && x.effect.target.id === "front" && x.effect.pseudoElement === "::after");
        return { n: a.length, running: a.filter((x) => x.playState === "running").length, tf: getComputedStyle(document.getElementById("front"), "::after").transform };
      });
      await q.waitForTimeout(1500);
      const a = await read();
      await q.waitForTimeout(1500);
      const b = await read();
      got[off ? "off" : "on"] = { a, b };
      check("lights-out (rays, FX " + (off ? "off" : "on") + "): no page errors", q.errs.length === 0, q.errs);
      await q.close(); await c.close();
    }
    const still = (t) => t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)";
    check("lights-out: with Visual FX on the fan of rays over the front sweeps to and fro; opened with FX off it stands straight and still",
      got.on.a.running === 1 && got.on.b.running === 1 && got.on.a.tf !== got.on.b.tf && !still(got.on.b.tf) &&
      got.off.a.n === 0 && still(got.off.a.tf) && got.off.b.tf === got.off.a.tf, got);
  }
};
