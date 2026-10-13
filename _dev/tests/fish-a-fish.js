// Fish-A-Fish: with Visual FX off the bobbers, the fish shadows and the boot
// are drawn still (with FX on they bob, wag and rock); Enter on a focused menu
// button only presses that button, and a pick clicked with the mouse doesn't
// take over the round Enter then starts; the menu buttons' shortcut keycaps
// hide on a touch-only phone; a late strike on R doesn't skip the end card.
module.exports = async ({ browser, base, check, lib }) => {
  const open = (ctx) => lib.open(ctx, base, "games/fish-a-fish/");
  const done = async (p, what) => { check("fish-a-fish " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  let ctx = await lib.newContext(browser);

  // ---- the clock the bob / wag / rock run on, frame to frame
  const motion = async (off) => {
    const p = await open(ctx);
    await p.evaluate((off) => localStorage.setItem("reduceMotion:fish-a-fish", off ? "1" : "0"), off);
    await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(200);
    await p.evaluate(() => {
      FishAFish.start("daybreak"); FishAFish.hold();
      FishAFish.force(0, "perch", "bite", 9); FishAFish.force(1, "junk", "bite", 9);
      window.__clock = {};
      ["bobber", "shadowFish", "junk"].forEach((fn) => {
        const real = FishArt[fn];
        FishArt[fn] = function () { (window.__clock[fn] = window.__clock[fn] || []).push(arguments[arguments.length - 1]); return real.apply(this, arguments); };
      });
    });
    // a few frames of each (counted, not timed: a busy machine draws fewer)
    await p.waitForFunction(() => ["bobber", "shadowFish", "junk"].every((fn) => window.__clock[fn] && window.__clock[fn].length >= 4), null, { timeout: 10000 });
    const c = await p.evaluate(() => window.__clock);
    await done(p, "motion FX " + (off ? "off" : "on"));
    const still = (a) => !!a && a.length > 2 && a.every((t) => t === a[0]);
    return { bobber: still(c.bobber), shadowFish: still(c.shadowFish), junk: still(c.junk), drawn: !!(c.bobber && c.shadowFish && c.junk) };
  };
  const off = await motion(true), on = await motion(false);
  check("fish-a-fish: with Visual FX off the bobbers, fish shadows and the boot are drawn still; with FX on they move",
    off.drawn && off.bobber && off.shadowFish && off.junk && on.drawn && !on.bobber && !on.shadowFish && !on.junk, { off, on });

  // ---- Enter on a focused menu button presses that button and starts nothing
  let p = await open(ctx);
  await p.keyboard.press("c");
  await p.evaluate(() => document.querySelector('#pick-kb button[data-v="letters"]').focus());
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const menu = await p.evaluate(() => ({ state: FishAFish.state().state, kb: localStorage.getItem("fishafish_kb") }));
  check("fish-a-fish: Enter on the focused All letters button picks it, without casting off", menu.state === "menu" && menu.kb === "letters", menu);
  await done(p, "menu Enter");

  // ---- All letters clicked, then Condensed picked by key: Enter casts off on
  // the Condensed pond, and the menu still says Condensed
  p = await open(ctx);
  await p.click('#pick-kb button[data-v="letters"]');
  await p.keyboard.press("c");
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const run = await p.evaluate(() => ({ state: FishAFish.state().state, kb: FishAFish.state().kb, saved: localStorage.getItem("fishafish_kb") }));
  check("fish-a-fish: after clicking All letters then pressing C, Enter casts off on the Condensed pond and the pick stays Condensed",
    run.state === "play" && run.kb === "nine" && run.saved === "nine", run);
  await done(p, "mouse then Enter");
  await ctx.close();

  // ---- touch-only phone: the shortcut keycaps on the menu buttons are hidden
  // (the Condensed pond's QWE / ASD / ZXC and Shift describe the pond, and stay)
  ctx = await lib.newContext(browser, { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  p = await open(ctx);
  const caps = await p.evaluate(() => [...document.querySelectorAll("button kbd")].map((k) => { const s = k.closest(".gs-keys"); return { k: k.textContent, wrap: s ? getComputedStyle(s).display : "unwrapped" }; }));
  const keys = caps.filter((c) => c.wrap !== "unwrapped"), plain = caps.filter((c) => c.wrap === "unwrapped").map((c) => c.k).join("");
  check("fish-a-fish: on a touch-only phone the menu buttons' shortcut keycaps are hidden",
    keys.length >= 6 && keys.every((c) => c.wrap === "none") && plain === "QWEASDZXCShift", { keys, plain });
  await done(p, "touch keycaps");
  await ctx.close();

  // ---- the menu's "how": keys on a desktop; on a phone, taps (and no Shift
  // rule, which a tap doesn't need)
  const how = async (dev) => {
    const c = await lib.newContext(browser, dev);
    const pg = await open(c);
    const t = await pg.evaluate(() => document.querySelector("#menu .how").innerText);
    await done(pg, "how to play");
    await c.close();
    return t;
  };
  const desk = await how({}), phone = await how(require("@playwright/test").devices["Pixel 7"]);
  check("fish-a-fish: on a desktop the menu says each bobber has a key, and gives the Shift rule", /has a key/.test(desk) && /strike its key/.test(desk) && /Shift/.test(desk), desk);
  check("fish-a-fish: on a touch-only phone the menu says to tap the bobbers, naming no keys",
    /tap/i.test(phone) && !/\bkeys?\b/i.test(phone) && !/Shift/.test(phone), phone);

  // ---- the end card: R is a fishing key on the letter layouts, so an R that
  // lands as the card appears doesn't restart (it does a second later); Enter
  // and an R that isn't a pond key restart at once, as before
  ctx = await lib.newContext(browser);
  const endRun = async (p, kb) => {
    await p.evaluate(() => FishAFish.toMenu());
    await p.keyboard.press(kb === "nine" ? "c" : "l");   // (the menu's layout picks)
    await p.evaluate(() => { FishAFish.start("daybreak"); FishAFish.hold(); FishAFish.setTime(0.01); });
  };
  // the key, dispatched on the very frame the end card shows; then the state
  const atCard = (p, key, code) => p.evaluate(([key, code]) => new Promise((res) => {
    (function poll() {
      if (FishAFish.state().state !== "over") { requestAnimationFrame(poll); return; }
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
      res(FishAFish.state().state);
    })();
  }), [key, code]);
  const stateNow = (p) => p.evaluate(() => FishAFish.state().state);
  // the Again button's keycaps, and whether each is on screen
  const againCaps = (p) => p.evaluate(() => [...document.querySelectorAll("#again kbd")].map((k) => k.textContent + (k.getClientRects().length ? "" : " (hidden)")).join(", "));
  p = await open(ctx);
  await endRun(p, "letters");
  const early = await atCard(p, "r", "KeyR");
  const deskCaps = await againCaps(p);
  check("fish-a-fish: the end card's Again button names its keys, Space or Enter and R", deskCaps === "Space or Enter, R", deskCaps);
  await p.waitForTimeout(1100);
  await p.keyboard.press("r"); await p.waitForTimeout(100);
  const late = await stateNow(p);
  check("fish-a-fish letters: an R that lands as the end card shows doesn't restart", early === "over", early);
  check("fish-a-fish letters: R a second later restarts (guard)", late === "play", late);
  await endRun(p, "letters");
  const enter = await atCard(p, "Enter", "Enter");
  check("fish-a-fish letters: Enter on the end card restarts at once (guard)", enter === "play", enter);
  await endRun(p, "nine");
  const nineR = await atCard(p, "r", "KeyR");
  check("fish-a-fish condensed: R (not a pond key there) restarts at once (guard)", nineR === "play", nineR);
  await done(p, "end card keys");
  await ctx.close();
  // on a touch-only phone those keycaps are hidden
  ctx = await lib.newContext(browser, require("@playwright/test").devices["Pixel 7"]);
  p = await open(ctx);
  await p.evaluate(() => { FishAFish.start("daybreak"); FishAFish.hold(); FishAFish.setTime(0.01); });
  await p.waitForFunction(() => FishAFish.state().state === "over", null, { timeout: 5000 });
  const phoneCaps = await againCaps(p);
  check("fish-a-fish: on a touch-only phone the Again button's keycaps (Space or Enter, R) are hidden", phoneCaps === "Space or Enter (hidden), R (hidden)", phoneCaps);
  await done(p, "end card keycaps on a phone");
  await ctx.close();

  // ---- short screens: nothing is left out to make the menu fit. With saved
  // bests on it, the how-to is shown and the whole card (Cast off and the
  // bests with it) is inside the window, under the tagline: on a small phone,
  // a phone on its side, and a short laptop window ([wide, high, touch])
  const SHORT = [[320, 480, true], [375, 553, true], [360, 560, true], [568, 320, true], [667, 331, true], [844, 390, true], [915, 412, true],
    [1024, 480, false], [1280, 500, false], [1366, 520, false], [1366, 580, false], [1280, 600, false]];
  const shortBad = [];
  for (const [w, h, touch] of SHORT) {
    const c = await lib.newContext(browser, touch ? { viewport: { width: w, height: h }, hasTouch: true, isMobile: true } : { viewport: { width: w, height: h } });
    const q = await lib.open(c, base, "games/fish-a-fish/", { before: (pg) => pg.addInitScript(() => { try { localStorage.setItem("fishafish_best_daybreak_nine", "1234"); localStorage.setItem("fishafish_best_endless_nine", "1234"); } catch (e) {} }) });
    await q.waitForTimeout(200);
    const m = await q.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect(), how = r("#menu .how"), card = r("#menu .card"), W = innerWidth, H = innerHeight;
      const inWin = (b) => b.left >= -0.5 && b.right <= W + 0.5 && b.top >= -0.5 && b.bottom <= H + 0.5;
      return { how: how.height > 20, bests: /1234/.test(document.getElementById("bests").textContent), card: inWin(card), play: inWin(r("#play")), under: card.top >= r("#menu .tag").bottom - 0.5, off: Math.round(Math.max(0, card.bottom - H)) };
    });
    if (!(m.how && m.bests && m.card && m.play && m.under)) shortBad.push(w + "x" + h + (touch ? " touch " : " mouse ") + JSON.stringify(m));
    if (q.errs.length) shortBad.push(w + "x" + h + " errors " + q.errs.join("; "));
    await q.close(); await c.close();
  }
  check("fish-a-fish: on short screens the menu leaves nothing out to fit: the how-to is shown and the whole card (Cast off, the bests) is inside the window", shortBad.length === 0, shortBad);
};
