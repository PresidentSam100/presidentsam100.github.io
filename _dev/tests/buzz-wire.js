// Buzz Wire: the ring is picked up only on the post and carried with the
// mouse (or moved by a finger's movement, from wherever it touches); every
// step of the way is checked, a quick flick included, and leaving the board
// counts as a touch; a touch puts the ring back on the post at once. The
// circuit closes only after a whole lap forwards back across the post, with
// every ticket in (the post stays shut till then); the best time is kept the
// moment the circuit closes. The obstacles keep the level's beat with the
// sound off and Visual FX off, and the backing follows the beat; a pause
// holds the beat, the clock and the ring, and a mouse must pick the ring up
// again after it. Every level passes _dev/tools/buzz-wire-check.js; here the
// level data is checked against what it proves (thirty levels, six stages).
const path = require("path");

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const open = (c, opts) => lib.open(c || ctx, base, "games/buzz-wire/", opts);
  const done = async (p, what) => { check("buzz-wire " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  // points along the circuit from arc a to arc b (either may run past the
  // post), `lane` units across the channel, every `step` units: as screen points
  const along = (p, a, b, lane, step) => p.evaluate(([a, b, lane, step]) => {
    const c = BuzzWire.course(), out = [], n = Math.max(1, Math.ceil(Math.abs(b - a) / step));
    for (let i = 0; i <= n; i++) { const q = BuzzCourse.posAt(c, a + (b - a) * i / n); out.push(BuzzWire.screen(q.x + q.nx * lane, q.y + q.ny * lane)); }
    return out;
  }, [a, b, lane, step || 8]);
  const walk = async (p, pts) => { for (const [x, y] of pts) await p.mouse.move(x, y); };
  const ringAt = (p) => p.evaluate(() => { const r = BuzzWire.run(); return BuzzWire.screen(r.x, r.y); });
  const pickUp = async (p) => { const [x, y] = await ringAt(p); await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.up(); };
  const run = (p) => p.evaluate(() => BuzzWire.run());
  const status = (p) => p.evaluate(() => document.getElementById("status").textContent);
  const LV = require(path.join(lib.ROOT, "games/buzz-wire/levels.js"));

  check("buzz-wire: thirty levels in six stages of five, each stage bringing in its obstacle (sparks, weights, live rails, gates, arms)",
    LV.levels.length === 30 && LV.stages.length === 6 && [0, 1, 2, 3, 4, 5].every((s) => LV.levels.filter((l) => l.stage === s).length === 5) &&
    LV.levels.filter((l) => l.stage === 0).every((l) => !(l.obs || []).length) &&
    ["spark", "weight", "live", "gate", "arm"].every((k, s) => LV.levels.filter((l) => l.stage === s + 1).every((l) => l.obs.some((o) => o.k === k))), LV.levels.length);

  // ---- picked up only on the post; carried all the way round with every
  // ticket, back across the post: the circuit closes, and the time is kept
  // as the level's best there and then, before the card
  let p = await open();
  await p.evaluate(() => BuzzWire.start(0));
  const away = await p.evaluate(() => { const q = BuzzCourse.posAt(BuzzWire.course(), 260); return BuzzWire.screen(q.x, q.y); });
  await p.mouse.move(away[0], away[1]); await p.mouse.down(); await p.mouse.up();
  const r0 = await run(p);
  await pickUp(p);
  const r1 = await run(p);
  await p.evaluate(() => {
    window.__saved = [];
    const o = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k === "buzzwire_best") { const r = BuzzWire.run(); window.__saved.push({ v, t: r && r.t, won: r && r.won, card: !document.getElementById("done").hidden }); } return o.apply(this, arguments); };
  });
  const L0 = await p.evaluate(() => BuzzWire.course().L);
  await walk(p, await along(p, 0, L0 * 0.55, 0));
  const half = await p.evaluate(() => ({ lit: BuzzWire.run().P >= BuzzWire.course().checks[1], got: BuzzWire.run().got }));
  await walk(p, await along(p, L0 * 0.55, L0 + 12, 0));
  const won = await p.evaluate(() => ({ state: BuzzWire.state(), run: BuzzWire.run(), saved: window.__saved, best: BuzzWire.best(0), status: document.getElementById("status").textContent }));
  check("buzz-wire: pressing away from the ring picks nothing up; pressed on the ring at the post it's taken (the run starts)",
    !r0.started && !r0.held && r1.started && r1.held, { r0, r1 });
  check("buzz-wire: carried all the way round taking every ticket, back across the post, the circuit closes (Ding!), its time kept as the level's best there and then, before the card",
    half.lit && half.got.join() === "true,true,false" && won.state === "done" && won.run.won && won.run.got.every(Boolean) && /Ding/.test(won.status) &&
    won.saved.length === 1 && won.saved[0].won && !won.saved[0].card && JSON.parse(won.saved[0].v)[0] === won.best && Math.abs(won.best - won.run.t * 1000) < 2, { half, won });
  // the card: the time, "a new best", and its keys (R again, Backspace the levels, Space or Enter the next)
  await p.waitForFunction(() => !document.getElementById("done").hidden, null, { timeout: 5000 });
  const card = await p.evaluate(() => ({ msg: document.getElementById("done-msg").textContent, stats: document.getElementById("done-stats").textContent,
    keys: ["again", "to-levels", "next"].map((id) => document.getElementById(id).getAttribute("data-gs-key")) }));
  await p.waitForTimeout(800);
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const nextLv = await p.evaluate(() => ({ state: BuzzWire.state(), level: BuzzWire.level() }));
  check("buzz-wire: the card shows the time and \"a new best\"; its buttons wear R, ⌫ and Space or Enter, and Enter plays the next level",
    /^\d+\.\d\d s$/.test(card.msg) && /a new best/.test(card.stats) && card.keys.join() === "R,⌫,Space or Enter" && nextLv.state === "play" && nextLv.level === 1, { card, nextLv });
  await done(p, "a whole circuit");

  // ---- touches: the wire, a quick flick through a wire (one pointer reading
  // on each side of it), and the pointer leaving the board: each one puts
  // the ring back on the post at once
  p = await open();
  await p.evaluate(() => BuzzWire.start(0));
  await pickUp(p);
  await walk(p, await along(p, 0, 300, 0));
  const w0 = await p.evaluate(() => BuzzCourse.posAt(BuzzWire.course(), 300).w);
  await walk(p, await along(p, 300, 300, w0 - 6, 8));
  const wire = { run: await run(p), status: await status(p) };
  // the flick: from the left side of the circuit straight to the right side
  // in one reading (both ends well inside the channel)
  await pickUp(p);
  await walk(p, await along(p, 0, L0 * 0.27, 0));
  const fl = await p.evaluate((L) => { const c = BuzzWire.course(), q = BuzzCourse.posAt(c, L * 0.73); return { pt: BuzzWire.screen(q.x, q.y), deep: BuzzCourse.depth(c, q.x, q.y) }; }, L0);
  await p.mouse.move(fl.pt[0], fl.pt[1]);
  const flick = { run: await run(p), status: await status(p), deep: fl.deep };
  // off the board in one reading, then a pointer leaving with the ring held
  await pickUp(p);
  await walk(p, await along(p, 0, 200, 0));
  const box = await p.evaluate(() => { const r = document.getElementById("board").getBoundingClientRect(); return { right: r.right, top: r.top, bottom: r.bottom }; });
  await p.mouse.move(Math.min(box.right + 40, 1279), (box.top + box.bottom) / 2);
  const off = { run: await run(p), status: await status(p) };
  await pickUp(p);
  await walk(p, await along(p, 0, 120, 0));
  const leave = await p.evaluate(() => {
    const r = BuzzWire.run(), pt = BuzzWire.screen(r.x, r.y), cv = document.getElementById("board");
    cv.dispatchEvent(new PointerEvent("pointerleave", { pointerId: 1, pointerType: "mouse", clientX: pt[0], clientY: pt[1], bubbles: false }));
    return { run: BuzzWire.run(), status: document.getElementById("status").textContent };
  });
  const atPost = (r) => !r.started && !r.held && Math.abs(r.P) < 1e-9 && r.got.every((x) => !x);
  check("buzz-wire: the ring touching the wire buzzes it back to the post at once (not started, nothing taken) and says so",
    atPost(wire.run) && /^Buzz! The ring touched the wire/.test(wire.status), wire);
  check("buzz-wire: a quick flick from one side of the circuit to the other, in a single pointer reading, still touches the wire in between",
    flick.deep > 20 && atPost(flick.run) && /touched the wire/.test(flick.status), flick);
  check("buzz-wire: the pointer leaving the board with the ring held counts as a touch (in one reading, and leaving the board itself)",
    atPost(off.run) && /^Buzz!/.test(off.status) && atPost(leave.run) && /left the board/.test(leave.status), { off, leave });
  await done(p, "touches");

  // ---- the post stays shut until every ticket is in; the circuit only
  // closes by going round forwards, never by doubling back over the post
  p = await open();
  await p.evaluate(() => BuzzWire.start(0));
  await pickUp(p);
  // round the outside of the channel, past every ticket without taking one
  await walk(p, await along(p, 0, L0 + 12, 34));
  const shut = { state: await p.evaluate(() => BuzzWire.state()), run: await run(p), status: await status(p) };
  // round again through the middle: every ticket, and across the post again
  await walk(p, await along(p, L0 + 12, 2 * L0 + 12, 0));
  const second = { state: await p.evaluate(() => BuzzWire.state()), run: await run(p) };
  await done(p, "shut post");
  p = await open();
  await p.evaluate(() => BuzzWire.start(0));
  await pickUp(p);
  // forwards most of the way (every ticket), then back over the post
  await walk(p, await along(p, 0, L0 * 0.85, 0));
  await walk(p, await along(p, L0 * 0.85, -30, 0));
  const back = { state: await p.evaluate(() => BuzzWire.state()), run: await run(p) };
  // and forwards over it again from just behind it
  await walk(p, await along(p, -30, 40, 0));
  const fwd = { state: await p.evaluate(() => BuzzWire.state()), run: await run(p) };
  // backwards all the way round, across the post
  await p.evaluate(() => BuzzWire.restart());
  await pickUp(p);
  await walk(p, await along(p, 0, -L0 - 30, 0));
  const rev = { state: await p.evaluate(() => BuzzWire.state()), run: await run(p) };
  check("buzz-wire: round the circuit past every ticket untaken, the post stays shut and says how many are left; round again taking them, it closes",
    shut.state === "play" && shut.run.P >= L0 && shut.run.got.every((x) => !x) && /stays shut: 3 tickets/.test(shut.status) && second.state === "done" && second.run.won, { shut, second });
  check("buzz-wire: doubling back over the post doesn't close the circuit (every ticket taken), nor does crossing it forwards again from just behind it, nor a whole lap backwards",
    back.state === "play" && back.run.got.every(Boolean) && back.run.P < 0 && fwd.state === "play" && !fwd.run.won && fwd.run.P > 0 && fwd.run.P < L0 &&
    rev.state === "play" && !rev.run.won && rev.run.P < -L0, { back, fwd, rev });
  await done(p, "the loop");

  // ---- the beat: with the sound off and Visual FX off the obstacles keep
  // the level's tempo and move; the backing follows the beat clock
  {
    const c = await lib.newContext(browser);
    const q = await open(c, { before: (pg) => pg.addInitScript(() => { try {
      localStorage.setItem("mute:buzz-wire", "1"); localStorage.setItem("reduceMotion:buzz-wire", "1");
      localStorage.setItem("buzzwire_best", JSON.stringify({ 0: 9000, 1: 9000, 2: 9000, 3: 9000, 4: 9000 })); localStorage.setItem("buzzwire_level", "5");
    } catch (e) {} }) });
    await q.click("#play"); await q.waitForTimeout(300);
    const read = () => q.evaluate(() => ({ beat: BuzzWire.beat(), at: performance.now(), sparks: BuzzWire.obstacles().map((o) => [Math.round(o.x), Math.round(o.y)]), eighths: BuzzWire.eighths(),
      muted: window.MUTE_ON(), fxOff: window.RM_ON(), level: BuzzWire.level(), audio: (() => { try { return !!window.AudioContext; } catch (e) { return false; } })() }));
    const a = await read();
    await q.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
    const b = await read();
    const rate = (b.beat - a.beat) / ((b.at - a.at) / 60000);
    const moved = a.sparks.length === 1 && a.sparks.join() !== b.sparks.join();
    // the obstacles drawn are where course.js puts them at the beat
    const agree = await q.evaluate(() => { const o = BuzzWire.obstacles()[0], c2 = BuzzWire.course(), w = BuzzCourse.obstacles(c2, BuzzWire.beat())[0]; return Math.hypot(o.x - w.x, o.y - w.y) < 1e-6; });
    check("buzz-wire: with the sound off and Visual FX off the beat runs at the level's tempo (100 a minute), the sparks hop on it, and the backing is laid out a beat at a time ahead of it",
      a.muted && a.fxOff && a.level === 5 && Math.abs(rate - 100) < 12 && moved && agree && b.eighths > a.eighths && Math.abs(b.eighths / 2 - b.beat) < 1.5, { a, b, rate, agree });
    check("buzz-wire (sound and FX off): no page errors", q.errs.length === 0, q.errs);
    await c.close();
  }

  // ---- pause: the beat, the clock and the ring hold; resumed, the ring
  // stays put until the mouse comes back and picks it up
  p = await open();
  await p.evaluate(() => BuzzWire.start(5));
  await pickUp(p);
  await walk(p, await along(p, 0, 160, 0));
  await p.keyboard.press("p");
  await p.waitForFunction(() => document.querySelector(".gs-pause:not([hidden])"), null, { timeout: 4000 }).catch(() => {});
  const pz0 = await p.evaluate(() => ({ beat: BuzzWire.beat(), run: BuzzWire.run() }));
  await p.evaluate(() => new Promise((r) => setTimeout(r, 700)));
  const far = await along(p, 260, 260, 0);
  await p.mouse.move(far[0][0], far[0][1]);
  const pz1 = await p.evaluate(() => ({ beat: BuzzWire.beat(), run: BuzzWire.run() }));
  await p.keyboard.press("p");
  await p.waitForTimeout(150);
  await p.mouse.move(far[0][0] + 3, far[0][1] + 3);
  const pz2 = { run: await run(p), status: await status(p), beat: await p.evaluate(() => BuzzWire.beat()) };
  await pickUp(p);
  await walk(p, await along(p, 175, 200, 0));
  const pz3 = await run(p);
  check("buzz-wire: paused, the beat, the clock and the ring hold still (the pointer moving makes no difference)",
    pz1.beat === pz0.beat && pz1.run.t === pz0.run.t && pz1.run.x === pz0.run.x && pz1.run.y === pz0.run.y && !pz1.run.held, { pz0, pz1 });
  check("buzz-wire: resumed, the ring stays where it was until the mouse picks it up again (and says so); then it follows",
    pz2.beat > pz0.beat && pz2.run.x === pz0.run.x && pz2.run.y === pz0.run.y && pz2.run.dropped && !pz2.run.held && /pick it up again/.test(pz2.status) && pz3.held && pz3.P > pz0.run.P + 10, { pz2, pz3 });
  await done(p, "pause");

  // ---- a finger: the ring moves by 0.7 of the finger's movement, from
  // wherever the finger touches (no jump); lifted, the ring stays put
  {
    const { devices } = require("@playwright/test");
    const c = await lib.newContext(browser, devices["Pixel 7"]);
    const q = await open(c);
    await q.evaluate(() => BuzzWire.start(0));
    const t = await q.evaluate(() => {
      const cv = document.getElementById("board"), K = BuzzWire.scale(), r0 = BuzzWire.run(), at = BuzzWire.screen(500, 500);
      const ev = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, { pointerId: 9, pointerType: "touch", clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true }));
      ev("pointerdown", at[0], at[1]); const r1 = BuzzWire.run();
      ev("pointermove", at[0] + 40, at[1]); const r2 = BuzzWire.run();
      ev("pointerup", at[0] + 40, at[1]); const r3 = BuzzWire.run();
      ev("pointerdown", at[0] - 100, at[1] + 60); const r4 = BuzzWire.run();
      ev("pointermove", at[0] - 120, at[1] + 60); const r5 = BuzzWire.run();
      return { K, r0, r1, r2, r3, r4, r5 };
    });
    const step = 40 * 0.7 / t.K, back = 20 * 0.7 / t.K;
    check("buzz-wire (phone): a finger anywhere takes the ring without moving it, and moves it by 0.7 of the finger's movement; lifted, the ring stays; another touch carries on from there",
      t.r1.started && t.r1.held && t.r1.x === t.r0.x && Math.abs(t.r2.x - t.r0.x - step) < 0.5 && Math.abs(t.r2.y - t.r0.y) < 0.5 && !t.r3.held && t.r3.x === t.r2.x &&
      t.r4.held && t.r4.x === t.r3.x && Math.abs(t.r5.x - (t.r4.x - back)) < 0.5, t);
    check("buzz-wire (phone): the hint says to touch, not to press on the ring", /Touch anywhere/.test(await q.evaluate(() => { BuzzWire.restart(); return document.getElementById("status").textContent; })),
      await q.evaluate(() => document.getElementById("status").textContent));
    check("buzz-wire (phone): no page errors", q.errs.length === 0, q.errs);
    await c.close();
  }

  // ---- keys: the menu (Space plays the chosen level), in play (R starts
  // the level over, Backspace the levels), and the level list's locks
  p = await open();
  const mk = await p.evaluate(() => ({ play: document.getElementById("play").getAttribute("data-gs-key"), tiles: document.querySelectorAll("#grid .lv").length,
    open: [...document.querySelectorAll("#grid .lv")].filter((t) => !t.classList.contains("locked")).length }));
  await p.click("#grid .lv:nth-of-type(3)"); await p.waitForTimeout(100);
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  const locked = await p.evaluate(() => ({ state: BuzzWire.state(), note: document.getElementById("lock-note").textContent }));
  await p.keyboard.press("Space"); await p.waitForTimeout(150);
  const sp = await p.evaluate(() => ({ state: BuzzWire.state(), level: BuzzWire.level(), keys: ["btn-restart", "btn-levels"].map((id) => document.getElementById(id).getAttribute("data-gs-key")) }));
  await pickUp(p);
  await walk(p, await along(p, 0, 150, 0));
  await p.keyboard.press("r"); await p.waitForTimeout(100);
  const rr = await run(p);
  await p.keyboard.press("Backspace"); await p.waitForTimeout(150);
  const bs = await p.evaluate(() => BuzzWire.state());
  check("buzz-wire: the menu lists thirty levels, only the first open; a locked one says why and stays shut; Space plays the chosen level; in play R starts it over and Backspace goes to the levels (the buttons wear R and ⌫)",
    mk.play === "Space or Enter" && mk.tiles === 30 && mk.open === 1 && locked.state === "menu" && /locked/.test(locked.note) &&
    sp.state === "play" && sp.level === 0 && sp.keys.join() === "R,⌫" && !rr.started && Math.abs(rr.P) < 1e-9 && bs === "menu", { mk, locked, sp, rr, bs });
  await done(p, "keys");

  // ---- the games page's reset clears the best times and keeps the level picked
  {
    const c = await lib.newContext(browser);
    const hub = await lib.open(c, base, "games/", { waitCorner: false, before: (pg) => pg.addInitScript(() => {
      try { localStorage.setItem("buzzwire_best", '{"0":9000}'); localStorage.setItem("buzzwire_level", "1"); } catch (e) {}
    }) });
    const keys = () => hub.evaluate(() => Object.keys(localStorage).filter((k) => /^buzzwire_/.test(k)).sort().join());
    const had = await keys();
    await hub.click("#reset-scores"); await hub.waitForTimeout(150);
    await hub.keyboard.press("Escape"); await hub.waitForTimeout(250);
    const kept = await keys();
    check("buzz-wire: the games page's reset clears the best times and keeps the level picked", had === "buzzwire_best,buzzwire_level" && kept === "buzzwire_level", { had, kept });
    await c.close();
  }

  // ---- phones and laptops: the menu fits whole, and in play the board, the
  // plate and the buttons fit, clear of each other and the corner buttons
  {
    const SIZES = [[320, 568, true], [360, 640, true], [390, 664, true], [390, 844, true], [375, 553, true], [740, 360, true], [1366, 657, false], [1280, 600, false], [1280, 900, false]];
    const bad = [];
    for (const [w, h, phone] of SIZES) {
      const c = await lib.newContext(browser, phone ? { viewport: { width: w, height: h }, isMobile: true, hasTouch: true } : { viewport: { width: w, height: h } });
      const q = await open(c, { before: (pg) => pg.addInitScript(() => { try { const b = {}; for (let i = 0; i < 12; i++) b[i] = 10000 + i * 1234; localStorage.setItem("buzzwire_best", JSON.stringify(b)); } catch (e) {} }) });
      const look = (inPlay) => q.evaluate(({ w, inPlay }) => {
        const r = (e) => e.getBoundingClientRect(), out = [];
        const over = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        if (Math.max(document.documentElement.scrollWidth, innerWidth) - w > 1) out.push("wider than the screen");
        const corner = [document.querySelector(".nav-back-games"), ...document.querySelectorAll(".gs-corner > *")].filter((e) => e.getClientRects().length).map(r);
        if (!inPlay) {
          const h1 = r(document.querySelector("#menu .card h1")), cb = Math.max(...corner.map((c) => c.bottom));
          if (h1.top < cb) out.push("heading under the corner buttons");
          const panel = document.getElementById("menu"), card = r(panel.querySelector(".card"));
          if (card.right > innerWidth + 1 || card.left < -1) out.push("card off the side");
          if (panel.scrollHeight > panel.clientHeight + 1) out.push("menu scrolls " + (panel.scrollHeight - panel.clientHeight));
        } else {
          const bd = r(document.getElementById("board")), log = r(document.getElementById("log"));
          const btns = [...document.querySelectorAll("#helm button")].map(r);
          const inside = (b) => b.left >= -1 && b.top >= -1 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1;
          if (!inside(bd)) out.push("board off the screen");
          if (bd.width < 200) out.push("board only " + Math.round(bd.width));
          if (!inside(log)) out.push("plate off the screen");
          btns.forEach((b, i) => { if (!inside(b)) out.push("button " + i + " off the screen"); if (over(b, bd)) out.push("button " + i + " over the board"); });
          if (over(log, bd)) out.push("plate over the board");
          corner.forEach((c, i) => { if (over(c, bd)) out.push("corner " + i + " over the board"); if (over(c, log)) out.push("corner " + i + " over the plate"); btns.forEach((b, j) => { if (over(c, b)) out.push("corner " + i + " over button " + j); }); });
          const st = r(document.getElementById("status"));
          if (st.bottom > innerHeight + 1) out.push("status cut off");
          if (document.documentElement.scrollHeight > innerHeight + 1) out.push("page scrolls");
        }
        return out;
      }, { w, inPlay });
      const m = await look(false);
      // in play at its tallest: the longest name, a best time, the longest status line
      await q.evaluate(() => BuzzWire.start(29)); await q.waitForTimeout(150);
      await q.evaluate(() => { document.getElementById("status").textContent = "Buzz! The ring was on a live rail: back to the post."; }); await q.waitForTimeout(150);
      const g1 = await look(true);
      await q.evaluate(() => BuzzWire.start(11)); await q.waitForTimeout(150);
      const g2 = await look(true);
      const all = m.concat(g1, g2.map((x) => "level 12: " + x));
      if (all.length) bad.push(w + "x" + h + ": " + all.join("; "));
      if (q.errs.length) bad.push(w + "x" + h + " errors: " + q.errs.join("; "));
      await c.close();
    }
    check("buzz-wire: on phones (320, 360, 390 upright and tall, 375 x 553, 740 x 360 on the side) and laptops (1366 x 657, 1280 x 600, 1280 x 900) the menu fits whole with nothing to scroll, and in play the board, the plate, the status and every button fit, clear of each other and of the corner buttons",
      bad.length === 0, bad);
  }
  await ctx.close();
};
