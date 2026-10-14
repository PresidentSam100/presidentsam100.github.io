// Fish-A-Fish: with Visual FX off the bobbers, the fish shadows and the boot
// are drawn still (with FX on they bob, wag and rock); Enter on a focused menu
// button only presses that button, and a pick clicked with the mouse doesn't
// take over the round Enter then starts; the menu buttons' shortcut keycaps
// hide on a touch-only phone; a late strike on R doesn't skip the end card.
// The key that picks an option is a tab on its corner, not one more keycap
// among the keys the option describes; Shift is a switch of its own, on
// every pond.
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

  // ---- the pick keys (1 2 C L W S) against the pond's keys (Q W E ...): C
  // and W are both, and they used to be drawn alike, side by side. Each pick
  // key is a tab on its button's top right corner, all six the same; the
  // pond's keys are flat tiles in the button's small print.
  p = await open(ctx);
  const tabs = await p.evaluate(() => {
    const look = (k) => { const cs = getComputedStyle(k); return cs.position + " " + cs.backgroundColor + " " + cs.color + " " + cs.borderTopWidth; };
    const picks = [...document.querySelectorAll("#menu .seg .pk kbd")], pond = [...document.querySelectorAll("#menu .seg small kbd")];
    return {
      keys: picks.map((k) => k.textContent).join(""), looks: [...new Set(picks.map(look))], pond: pond.map((k) => k.textContent).join(""), pondLooks: [...new Set(pond.map(look))],
      corner: picks.every((k) => { const b = k.closest("button").getBoundingClientRect(), r = k.getBoundingClientRect(); return Math.abs(r.right - b.right) <= 6 && Math.abs(r.top - b.top) <= 8; }),
    };
  });
  check("fish-a-fish: each option's pick key is a tab on its corner, all alike, and not drawn like the pond keys the options describe",
    tabs.keys === "12CLWS" && tabs.looks.length === 1 && /^absolute/.test(tabs.looks[0]) && tabs.corner && tabs.pond === "QWEASDZXC" && tabs.pondLooks.length === 1 && tabs.pondLooks[0] !== tabs.looks[0], tabs);

  // ---- Shift, a switch of its own (S), on every pond: S or a click switches
  // it on the letter ponds as on the whole keyboard, and it is remembered. The
  // card is the same height whatever is picked.
  const sw = () => p.evaluate(() => { const b = document.getElementById("pick-shift"); return { name: document.getElementById("shift-name").textContent, off: b.getAttribute("aria-disabled"), on: b.getAttribute("aria-pressed"), says: document.getElementById("shift-says").textContent, saved: localStorage.getItem("fishafish_shift"), card: Math.round(document.querySelector("#menu .card").getBoundingClientRect().height) }; });
  await p.keyboard.press("c"); const s0 = await sw();
  await p.keyboard.press("s"); const s1 = await sw();
  await p.keyboard.press("w"); const s2 = await sw();
  await p.keyboard.press("s"); const s3 = await sw();
  await p.click("#pick-shift"); const s4 = await sw();
  await p.keyboard.press("l"); const s5 = await sw();
  await p.keyboard.press("s"); const s6 = await sw();
  check("fish-a-fish: Shift switches on every pond, by S or a click, and is remembered (on the Condensed and All letters ponds as on the whole keyboard)",
    [s0, s1, s2, s3, s4, s5, s6].every((s) => s.off !== "true" && /^Shift: (on|off)$/.test(s.name) && (s.on === "true") === /on$/.test(s.name)) &&
    s0.on === "true" && /gold/.test(s0.says) && s1.on === "false" && s1.saved === "0" && /plain/.test(s1.says) && s2.on === "false" &&
    s3.on === "true" && s3.saved === "1" && s4.on === "false" && s4.saved === "0" && s5.on === "false" && s6.on === "true" && s6.saved === "1",
    { s0, s1, s2, s3, s4, s5, s6 });
  check("fish-a-fish: the menu card keeps its height whichever pond and whichever way Shift is set", [s1, s2, s3, s4, s5, s6].every((s) => s.card === s0.card), [s0, s1, s2, s3, s4, s5, s6].map((s) => s.card));
  // in play: with the symbols on, a plain number fish refuses Shift + its key;
  // with them off the number row is plain keys, Shift held or not, and the
  // best is kept apart from the bests earned with the symbols
  const strike = (shiftOn) => p.evaluate((shiftOn) => {
    FishAFish.toMenu();
    for (const k of ["fishafish_best_daybreak_all", "fishafish_best_daybreak_all_plain"]) localStorage.removeItem(k);
    const key = (k) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
    key("w");
    if ((document.getElementById("pick-shift").getAttribute("aria-pressed") === "true") !== shiftOn) key("s");
    FishAFish.start("daybreak"); FishAFish.hold();
    FishAFish.force(0, "perch", "bite", 9, false); FishAFish.press(0, true);
    const st = FishAFish.state();
    return { shift: st.shift, caught: st.caught, score: st.score, withSym: localStorage.getItem("fishafish_best_daybreak_all"), plain: localStorage.getItem("fishafish_best_daybreak_all_plain") };
  }, shiftOn);
  const playOn = await strike(true), playOff = await strike(false);
  check("fish-a-fish: with Shift on a plain number fish refuses Shift + its key; off, the number row is plain keys and keeps a best of its own",
    playOn.shift === true && playOn.caught === 0 && playOff.shift === false && playOff.caught === 1 && +playOff.plain > 0 && playOff.withSym === null, { playOn, playOff });

  // the letter ponds too: with Shift on a letter is small on its tag, a Shift
  // fish shows the capital (on gold, as it bites) and takes only Shift + its
  // key, a plain one only the bare key; its best is kept apart from the plain
  // pond's. Off, the tags are capitals and Shift held or not hooks.
  const letters = (kb, shiftOn) => p.evaluate(([kb, shiftOn]) => {
    FishAFish.toMenu();
    const best = "fishafish_best_daybreak_" + kb;
    for (const k of [best, best + "_shift"]) localStorage.removeItem(k);
    const key = (k) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
    key(kb === "nine" ? "c" : "l");
    if ((document.getElementById("pick-shift").getAttribute("aria-pressed") === "true") !== shiftOn) key("s");
    FishAFish.start("daybreak"); FishAFish.hold();
    FishAFish.force(0, "perch", "bite", 9, true); FishAFish.force(1, "perch", "bite", 9, false);
    const tags = FishAFish.tags().slice(0, 3).join("");
    FishAFish.press(0, false); const shiftBare = FishAFish.state().caught;
    FishAFish.press(1, true); const plainShift = FishAFish.state().caught;
    if (shiftOn) { FishAFish.press(0, true); FishAFish.press(1, false); }
    const st = FishAFish.state();
    return { tags, shiftBare, plainShift, caught: st.caught, shift: st.shift, score: st.score, plain: localStorage.getItem(best), withShift: localStorage.getItem(best + "_shift") };
  }, [kb, shiftOn]);
  const nineOn = await letters("nine", true), lettersOn = await letters("letters", true), nineOff = await letters("nine", false);
  check("fish-a-fish: on the letter ponds with Shift on, a Shift fish shows its capital and only Shift + its key hooks it, a plain one (small letter) only the bare key, with a best of its own; off, capitals and every press hooks",
    nineOn.shift === true && nineOn.tags === "Qwe" && nineOn.shiftBare === 0 && nineOn.plainShift === 0 && nineOn.caught === 2 && +nineOn.withShift > 0 && nineOn.plain === null &&
    lettersOn.shift === true && lettersOn.tags === "Qwe" && lettersOn.caught === 2 && +lettersOn.withShift > 0 &&
    nineOff.shift === false && nineOff.tags === "QWE" && nineOff.shiftBare === 1 && nineOff.caught === 2 && +nineOff.plain > 0 && nineOff.withShift === null,
    { nineOn, lettersOn, nineOff });
  // and with the fish coming by themselves, Shift fish turn up on a letter pond
  await p.evaluate(() => {
    FishAFish.toMenu();
    const key = (k) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
    key("c");
    if (document.getElementById("pick-shift").getAttribute("aria-pressed") !== "true") key("s");
    window.__seen = 0;
    FishAFish.start("daybreak");
    const look = () => { if (FishAFish.state().spots.some((x) => /!$/.test(x))) window.__seen++; else requestAnimationFrame(look); };
    look();
  });
  const seen = await p.waitForFunction(() => window.__seen > 0, null, { timeout: 30000 }).then(() => true, () => false);
  check("fish-a-fish: on the Condensed pond with Shift on, Shift fish come by themselves", seen, seen);
  await done(p, "pick keys and Shift");
  await ctx.close();

  // ---- touch-only phone: the shortcut keycaps on the menu buttons are hidden
  // (the Condensed pond's QWE / ASD / ZXC describe the pond, and stay), and so
  // is the Shift symbols switch: a tap has no Shift
  ctx = await lib.newContext(browser, { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  p = await open(ctx);
  const caps = await p.evaluate(() => [...document.querySelectorAll("button kbd")].map((k) => { const s = k.closest(".gs-keys"); return { k: k.textContent, wrap: s ? getComputedStyle(s).display : "unwrapped" }; }));
  const keys = caps.filter((c) => c.wrap !== "unwrapped"), plain = caps.filter((c) => c.wrap === "unwrapped").map((c) => c.k).join("");
  const shiftRow = await p.evaluate(() => getComputedStyle(document.getElementById("shift-row")).display);
  // (and with no switch to see, it plays plain: a tap has no Shift)
  const touchRun = await p.evaluate(() => { FishAFish.start("daybreak"); FishAFish.hold(); const st = FishAFish.state(); return { shift: st.shift, tags: FishAFish.tags().join("") }; });
  check("fish-a-fish: on a touch-only phone the menu buttons' shortcut keycaps are hidden, and the Shift switch with them; a round there plays plain",
    keys.length >= 6 && keys.every((c) => c.wrap === "none") && plain === "QWEASDZXC" && shiftRow === "none" && touchRun.shift === false && touchRun.tags === "QWEASDZXC", { keys, plain, shiftRow, touchRun });
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
    [1024, 480, false], [1280, 500, false], [1366, 520, false], [1366, 580, false], [1280, 600, false],
    [1280, 640, false], [1366, 657, false], [1280, 661, false], [1024, 700, false]];   // (with a mouse the card has the Shift row too)
  const shortBad = [];
  for (const [w, h, touch] of SHORT) {
    const c = await lib.newContext(browser, touch ? { viewport: { width: w, height: h }, hasTouch: true, isMobile: true } : { viewport: { width: w, height: h } });
    const q = await lib.open(c, base, "games/fish-a-fish/", { before: (pg) => pg.addInitScript(() => { try { for (const k of ["daybreak_nine", "endless_nine", "daybreak_nine_shift", "endless_nine_shift"]) localStorage.setItem("fishafish_best_" + k, "1234"); } catch (e) {} }) });
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
