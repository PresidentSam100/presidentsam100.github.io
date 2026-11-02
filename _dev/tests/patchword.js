// Patchword: the word list (slurs out of it, crude words never suggested, no
// q without its u), the points for each length, patches beside each other
// (corner to corner too, never across a row's end) and none twice in a word,
// Qu as one patch of two letters, a word stitched once only, a typed word
// finding its own way across the block (or saying there's none), a drag
// corner to corner that doesn't catch the patches either side, dragging back
// unpicking, tapping one by one, a pause or a hidden tab turning the block
// over, the best kept the moment it's passed, the Daily the same block for
// everyone with only its first go counting, the end card's keys, the games
// page's reset, Visual FX off as the same play with calmer motion, and the
// fit on phones and laptops.
module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  const ctx = await lib.newContext(browser);
  const open = (c, opts) => lib.open(c || ctx, base, "games/patchword/", opts);
  const done = async (p, what) => { check("patchword " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  const wait = (p, ms) => p.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), ms);
  const rot13 = (s) => s.replace(/[a-z]/g, (c) => String.fromCharCode((c.charCodeAt(0) - 97 + 13) % 26 + 97));
  // a block to play on: index = row * 4 + column
  //   c a t s
  //   o r e Qu
  //   d i n g
  //   e l m p
  const BLOCK = ["c", "a", "t", "s", "o", "r", "e", "qu", "d", "i", "n", "g", "e", "l", "m", "p"];
  const begin = async (p, mode) => { await p.evaluate(({ BLOCK, mode }) => { Patchword.start(mode || "quick"); Patchword.hold(true); Patchword.setTiles(BLOCK); }, { BLOCK, mode }); };

  // ---- the rules
  let p = await open();
  const rules = await p.evaluate((bad) => {
    const R = Patchword.rules;
    const deals = [];
    for (let k = 0; k < 12; k++) {
      const b = R.deal(Math.random), n = {};
      b.tiles.forEach((t) => { n[t] = (n[t] || 0) + 1; });
      deals.push(b.tiles.length === 16 && b.everyday >= 50 && b.long >= 8 && Object.keys(n).every((t) => n[t] <= 3 && (!/^(j|k|qu|v|x|z)$/.test(t) || n[t] === 1)));
    }
    // every word the solver finds has a fair path spelling it
    const b = R.deal(Math.random), fair = Object.keys(b.words).every((w) => R.fair(b.words[w]) && R.spell(b.tiles, b.words[w]) === w);
    return {
      size: R.size(), deals: deals.every(Boolean), fair,
      words: ["quilt", "quest", "cat"].map(R.isWord), noQ: R.isWord("qat"), junk: R.isWord("cao"),
      slur: R.isWord(bad.slur), crude: [R.isWord(bad.crude), R.isEveryday(bad.crude)],
      points: [3, 4, 5, 6, 7, 8, 12].map((n) => R.points("x".repeat(n))),
      next: [R.adjacent(0, 5), R.adjacent(0, 4), R.adjacent(0, 1), R.adjacent(0, 2), R.adjacent(3, 4), R.adjacent(0, 10), R.adjacent(5, 5)],
      daily: [R.deal(R.mulberry(99)).tiles.join(), R.deal(R.mulberry(99)).tiles.join()],
    };
  }, { slur: rot13("avttre"), crude: rot13("chffl") });
  check("patchword: the list holds over 170,000 words; a slur isn't one, a crude word counts but is never suggested, no q goes without its u",
    rules.size > 170000 && rules.words.every(Boolean) && !rules.noQ && !rules.junk && !rules.slur && rules.crude[0] && !rules.crude[1], rules);
  check("patchword: 3 and 4 letters score 1, 5 score 2, 6 score 3, 7 score 5, 8 or more 11", rules.points.join() === "1,1,2,3,5,11,11", rules.points);
  check("patchword: patches are beside each other across, down and corner to corner, never across a row's end or two apart",
    rules.next.join() === "true,true,true,false,false,false,false", rules.next);
  check("patchword: a dealt block has 50 everyday words or more, 8 of them five letters or longer, no letter more than three times and an awkward one once; every word found has a fair path",
    rules.deals && rules.fair, rules);
  check("patchword: the same seed deals the same block (the Daily)", rules.daily[0] === rules.daily[1], rules.daily);

  // ---- the menu: 1 2 3 pick (shown on them, the pick kept), Space or Enter starts
  const caps = await p.evaluate(() => [...document.querySelectorAll("#pick-mode button, #play")].map((b) => b.getAttribute("data-gs-key")));
  await p.keyboard.press("2"); await wait(p, 80);
  const kept = await p.evaluate(() => localStorage.getItem("patchword_mode"));
  await p.keyboard.press("Space"); await wait(p, 150);
  const began = await p.evaluate(() => ({ state: Patchword.state(), mode: Patchword.mode(), left: Patchword.left(), clock: document.getElementById("clock").textContent }));
  check("patchword: the menu's keys are 1 2 3 and Space or Enter; 2 picks Long seam (kept), Space starts it with three minutes on the tape",
    caps.join() === "1,2,3,Space or Enter" && kept === "long" && began.state === "play" && began.mode === "long" && began.left > 179 && began.clock === "3:00", { caps, kept, began });
  await done(p, "menu");

  // ---- stitching words
  p = await open();
  await begin(p);
  const play = await p.evaluate(() => {
    const go = (path) => Patchword.submitPath(path);
    const out = {};
    out.cat = go([0, 1, 2]);                      // across
    out.rate = go([5, 1, 2, 6]);                  // up, across, down
    out.art = go([1, 5, 2]);                      // down, then corner to corner
    out.quest = go([7, 6, 3, 2]);                 // Qu, then corner to corner
    out.again = go([0, 1, 2]);                    // cat once more
    out.againLine = document.getElementById("word").className;
    out.tat = go([2, 1, 2]);                      // a patch twice
    out.cot = go([0, 4, 2]);                      // o to t: two apart
    out.soar = go([3, 4, 1, 5]);                  // s to o: across the row's end
    out.short = go([0, 1]);
    out.junk = go([0, 1, 4]);                     // cao
    out.one = go([3]);                            // a patch tapped twice
    out.score = Patchword.score(); out.found = Patchword.found().join();
    out.felt = document.querySelectorAll(".felt")[7].textContent;
    out.listed = [...document.querySelectorAll("#found li span")].map((e) => e.textContent).join();
    return out;
  });
  check("patchword: words across, down and corner to corner stitch; Qu is one patch of two letters (quest scores 2); the score adds up",
    play.cat === "ok" && play.rate === "ok" && play.art === "ok" && play.quest === "ok" && play.score === 5 && play.found === "cat,rate,art,quest" && play.felt === "Qu" &&
    play.listed === "quest,art,rate,cat", play);
  check("patchword: a word stitched already is refused (and said so); a patch used twice, patches not side by side, across a row's end, two letters, a non-word: refused, nothing scored",
    play.again === "dup" && /\bdup\b/.test(play.againLine) && play.tat === "nopath" && play.cot === "nopath" && play.soar === "nopath" &&
    play.short === "short" && play.junk === "no" && play.one === null && play.score === 5, play);

  // ---- typing: the stitching finds its way (on this block each word typed has one)
  const typed = await p.evaluate(() => {
    const out = {}, path = () => { const x = Patchword.path(); return x ? x.join() : null; };
    Patchword.type("tea"); out.tea = path();
    Patchword.type("r"); out.tear = path(); out.tearLine = document.getElementById("word").className + " " + document.getElementById("word").textContent;
    out.tearGo = Patchword.enter();
    Patchword.type("q"); out.q = path();
    Patchword.type("uest"); out.quest = path(); out.questLine = document.getElementById("word").textContent;
    out.questGo = Patchword.enter();
    Patchword.type("cog"); out.cog = Patchword.path(); out.cogLine = document.getElementById("word").className;
    out.cogGo = Patchword.enter();
    return out;
  });
  check("patchword: typing tea then r keeps the path it had (t e a r), a word not yet stitched shows its points, and Enter stitches it",
    typed.tea === "2,6,1" && typed.tear === "2,6,1,5" && /\bok\b/.test(typed.tearLine) && /\+1/.test(typed.tearLine) && typed.tearGo === "ok", typed);
  check("patchword: a typed q takes the Qu patch while its u is still to come; a typed word stitched already says so; a word with no path says so, and Enter refuses it",
    typed.q === "7" && typed.quest === "7,6,3,2" && /stitched already/.test(typed.questLine) && typed.questGo === "dup" &&
    typed.cog === null && /\bnopath\b/.test(typed.cogLine) && typed.cogGo === "nopath", typed);
  // Backspace unpicks, held it goes on
  await p.keyboard.type("cats"); await p.keyboard.press("Backspace");
  const unpicked = await p.evaluate(() => ({ typed: Patchword.typed(), path: Patchword.path().join() }));
  check("patchword: Backspace unpicks the last letter", unpicked.typed === "cat" && unpicked.path === "0,1,2", unpicked);
  await done(p, "stitching");

  // ---- dragging with a mouse: corner to corner doesn't catch the patches
  // either side (or the one before, which would unpick); back over the patch
  // before unpicks the last
  p = await open();
  await begin(p);
  const centre = (i) => p.evaluate((i) => { const r = document.querySelectorAll(".patch")[i].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, i);
  const drag = async (cells, steps) => {
    const pts = []; for (const i of cells) pts.push(await centre(i));
    await p.mouse.move(pts[0].x, pts[0].y); await p.mouse.down();
    for (const pt of pts.slice(1)) await p.mouse.move(pt.x, pt.y, { steps: steps || 12 });
    const during = await p.evaluate(() => Patchword.path().join());
    await p.mouse.up(); await wait(p, 60);
    return during;
  };
  const artDuring = await drag([1, 5, 2], 24);              // a, down to r, corner up to t: past the corner of a and e
  const carDuring = await drag([0, 1, 2, 1, 5], 12);        // c a t, back to a (t unpicked), down to r
  const dragged = await p.evaluate(() => ({ found: Patchword.found().join(), hit: Patchword.hitRadius, touch: getComputedStyle(document.getElementById("block")).touchAction }));
  check("patchword: a drag corner to corner takes only the patch it's going to (a r t), and dragging back over the patch before unpicks the last (c a t, back to a, on to r: car)",
    artDuring === "1,5,2" && carDuring === "0,1,5" && dragged.found === "art,car", { artDuring, carDuring, dragged });
  check("patchword: the block takes touches itself (no scrolling or zooming under a finger)", dragged.touch === "none", dragged);
  await done(p, "drag");

  // ---- pausing and a hidden tab turn the block over; the clock stops
  p = await open();
  await begin(p);
  await p.evaluate(() => Patchword.hold(false));
  const look = () => p.evaluate(() => ({ paused: Patchword.paused(), patch: getComputedStyle(document.querySelector(".patch")).visibility, left: Patchword.left() }));
  await p.click(".gs-pause-btn"); await wait(p, 100);
  const pz1 = await look(); await wait(p, 700); const pz2 = await look();
  await p.keyboard.press("Enter"); await wait(p, 150);
  const pz3 = await look();
  await p.evaluate(() => window.dispatchEvent(new Event("blur"))); await wait(p, 100);
  const pz4 = await look();
  check("patchword: paused (the ⏸ button, or the tab hidden) the block is hidden and the clock stands still; Enter resumes",
    pz1.paused && pz1.patch === "hidden" && pz2.left === pz1.left && !pz3.paused && pz3.patch === "visible" && pz4.paused && pz4.patch === "hidden", { pz1, pz2, pz3, pz4 });
  await done(p, "pause");

  // ---- the best is kept the moment it's passed
  p = await open();
  await begin(p);
  await p.evaluate(() => { Patchword.submitPath([0, 1, 2]); Patchword.submitPath([5, 1, 2, 6]); });
  const mid = await p.evaluate(() => ({ best: localStorage.getItem("patchword_best_quick"), state: Patchword.state() }));
  check("patchword: the best is saved as it's passed, mid-round", mid.best === "2" && mid.state === "play", mid);

  // ---- the end card: score, words, missed everyday words; Enter waits a moment, then sews again; Backspace goes to the menu
  await p.evaluate(() => { Patchword.setTime(0.02); Patchword.step(0.05); });
  await p.waitForFunction(() => !document.getElementById("over").hidden, null, { timeout: 5000 });
  const card = await p.evaluate(() => ({
    title: document.getElementById("over-title").textContent, score: document.getElementById("over-score").textContent, best: document.getElementById("over-best").textContent,
    got: [...document.querySelectorAll("#got li")].map((e) => e.firstChild.textContent).join(),
    missed: [...document.querySelectorAll("#missed li")].map((e) => e.firstChild.textContent),
    keys: ["#again", "#to-menu"].map((s) => document.querySelector(s).getAttribute("data-gs-key")), share: document.getElementById("share").hidden,
  }));
  const missedOk = await p.evaluate((m) => m.every((w) => Patchword.rules.isEveryday(w)) && !m.includes("cat") && !m.includes("rate"), card.missed);
  check("patchword: the end card has the score, the words stitched and the everyday words missed (longest first), keys on its buttons",
    card.score === "2 points" && /new best/.test(card.best) && card.got === "cat,rate" && card.missed.length > 0 && missedOk && card.missed[0].length >= card.missed[card.missed.length - 1].length &&
    card.keys.join() === "Space or Enter,⌫" && card.share, card);
  await p.keyboard.press("Enter"); await wait(p, 100);
  const early = await p.evaluate(() => Patchword.state());
  await wait(p, 1000); await p.keyboard.press("Enter"); await wait(p, 150);
  const again = await p.evaluate(() => ({ state: Patchword.state(), score: Patchword.score() }));
  await p.evaluate(() => { Patchword.setTime(0.02); Patchword.step(0.05); }); await p.waitForFunction(() => !document.getElementById("over").hidden, null, { timeout: 5000 });
  await wait(p, 1000); await p.keyboard.press("Backspace"); await wait(p, 150);
  const menu = await p.evaluate(() => ({ state: Patchword.state(), menu: !document.getElementById("menu").hidden, bests: document.getElementById("bests").textContent }));
  check("patchword: Enter as the round ends does nothing; a moment later it sews again; Backspace goes to the menu, which shows the best",
    early === "over" && again.state === "play" && again.score === 0 && menu.state === "menu" && menu.menu && /quick stitch 2/.test(menu.bests), { early, again, menu });
  await done(p, "end card");

  // ---- the Daily: the same block for everyone, only the first go counts
  p = await open();
  const d1 = await p.evaluate(() => {
    Patchword.start("daily"); Patchword.hold(true);
    const tiles = Patchword.tiles().join(), atStart = JSON.parse(localStorage.getItem("patchword_daily"));
    const w = Patchword.stitchAny();
    return { tiles, atStart, w, after: JSON.parse(localStorage.getItem("patchword_daily")), best: localStorage.getItem("patchword_best_daily"), counts: Patchword.counts(), n: Patchword.today().n };
  });
  // a second go: the pause card's Restart (it asks first)
  await p.click(".gs-pause-btn"); await wait(p, 100);
  await p.click('.gs-pause-alt[data-gs-act="restart"]'); await wait(p, 100);
  await p.keyboard.press("Enter"); await wait(p, 200);
  const d2 = await p.evaluate(() => {
    Patchword.hold(true);
    const tiles = Patchword.tiles().join(), counts = Patchword.counts();
    Patchword.stitchAny(); Patchword.stitchAny(); Patchword.stitchAny();
    return { tiles, counts, score: Patchword.score(), rec: JSON.parse(localStorage.getItem("patchword_daily")), best: localStorage.getItem("patchword_best_daily") };
  });
  await p.evaluate(() => { Patchword.setTime(0.02); Patchword.step(0.05); });
  await p.waitForFunction(() => !document.getElementById("over").hidden, null, { timeout: 5000 });
  const d3 = await p.evaluate(() => ({ best: document.getElementById("over-best").textContent, share: !document.getElementById("share").hidden, shareKey: document.getElementById("share").getAttribute("data-gs-key"), text: Patchword.share() }));
  await done(p, "daily");
  const p2 = await open();
  const d4 = await p2.evaluate(() => { Patchword.start("daily"); return Patchword.tiles().join(); });
  const quick = await p2.evaluate(() => { Patchword.toMenu(); Patchword.start("quick"); return Patchword.tiles().join(); });
  check("patchword: the Daily's first go is written down as it starts and as each word is stitched, and its best with it",
    d1.atStart && d1.atStart.played && d1.atStart.score === 0 && d1.counts && !!d1.w && d1.after.score > 0 && d1.after.words === 1 && d1.best === String(d1.after.score) && d1.n >= 1, d1);
  check("patchword: a second go at the Daily is the same block but counts nothing: the day's result and best stay the first go's, and the end card says so",
    d2.tiles === d1.tiles && !d2.counts && d2.score > d1.after.score && d2.rec.score === d1.after.score && d2.best === d1.best && /first go/.test(d3.best), { d1, d2, d3 });
  check("patchword: the Daily's end card shares (S) the first go's result, and the same day's block is dealt again on another visit (not the Quick stitch's)",
    d3.share && d3.shareKey === "S" && d3.text.includes("Daily block No. " + d1.n) && d3.text.includes(d1.after.score + " point") && d4 === d1.tiles && quick !== d1.tiles, { d3, d4: d4 === d1.tiles, quick: quick !== d1.tiles });
  await done(p2, "daily again");

  // a first go still on the clock at midnight stops counting there: the new
  // day's block is another one, its first go still to come
  p = await open();
  const mn = await p.evaluate(() => {
    Patchword.start("daily"); Patchword.hold(true); Patchword.stitchAny();
    const before = localStorage.getItem("patchword_daily"), best = localStorage.getItem("patchword_best_daily");
    const Real = Date;
    window.Date = class extends Real { constructor(...a) { if (a.length) super(...a); else super(Real.now() + 86400000); } static now() { return Real.now() + 86400000; } };
    Patchword.stitchAny(); Patchword.stitchAny();
    const out = { before, after: localStorage.getItem("patchword_daily"), best, bestAfter: localStorage.getItem("patchword_best_daily"), counts: Patchword.counts(), nextDay: Patchword.daily() };
    window.Date = Real;
    return out;
  });
  check("patchword: a Daily first go still running at midnight stops counting: the day's result and best stay as they were, and the new day's block is still to play",
    mn.after === mn.before && mn.bestAfter === mn.best && !mn.counts && !mn.nextDay.played, mn);
  await done(p, "daily at midnight");

  // ---- the games page's reset clears the bests and today's Daily, and keeps the mode picked
  {
    const hub = await lib.open(ctx, base, "games/", { waitCorner: false, before: (pg) => pg.addInitScript(() => {
      try { ["patchword_best_quick", "patchword_best_long", "patchword_best_daily"].forEach((k) => localStorage.setItem(k, "40")); localStorage.setItem("patchword_daily", "{}"); localStorage.setItem("patchword_mode", "long"); } catch (e) {}
    }) });
    const keys = () => hub.evaluate(() => Object.keys(localStorage).filter((k) => /^patchword_/.test(k)).sort().join());
    const had = await keys();
    await hub.click("#reset-scores"); await hub.waitForTimeout(150);
    await hub.keyboard.press("Escape"); await hub.waitForTimeout(250);
    const kept = await keys();
    check("patchword: the games page's reset clears its bests and today's Daily and keeps the mode picked",
      had === "patchword_best_daily,patchword_best_long,patchword_best_quick,patchword_daily,patchword_mode" && kept === "patchword_mode", { had, kept });
    await hub.close();
  }

  // ---- Visual FX off: the same play, calmer motion. A word stitched with FX
  // on puffs its patches up and a refused one shakes the block; with it off
  // neither moves, and the colours say the same
  for (const off of [false, true]) {
    const p3 = await open(null, { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:patchword", off ? "1" : "0"); } catch (e) {} }, off) });
    await begin(p3);
    const fxr = await p3.evaluate(() => {
      // (the clock held still for this one step: the line says what just
      // happened to a word for 1.1 s of real time, and a busy machine can
      // take that long over stitching it)
      const now = performance.now, t = now.call(performance);
      performance.now = () => t;
      try {
        Patchword.submitPath([0, 1, 2]);
        const puff = document.getAnimations().filter((a) => a.animationName === "pw-puff").length, line = document.getElementById("word").className;
        Patchword.submitPath([0, 1, 4]);
        const shake = document.getAnimations().filter((a) => a.animationName === "pw-shake").length, line2 = document.getElementById("word").className;
        Patchword.type("ra");
        return { puff, shake, line, line2, score: Patchword.score() };
      } finally { performance.now = now; }
    });
    // (the picked felt eases into its colour: polled)
    await p3.waitForFunction(() => getComputedStyle(document.querySelectorAll(".felt")[5]).backgroundColor === "rgb(255, 209, 102)", null, { timeout: 5000 }).catch(() => {});
    fxr.felt = await p3.evaluate(() => getComputedStyle(document.querySelectorAll(".felt")[5]).backgroundColor);
    check("patchword, FX " + (off ? "off: nothing puffs or shakes" : "on: a word puffs its patches up, a refusal shakes the block") + "; the score, the word's colours and the picked felt are the same",
      (off ? fxr.puff === 0 && fxr.shake === 0 : fxr.puff === 3 && fxr.shake === 1) && fxr.score === 1 && /\bok\b/.test(fxr.line) && /\bno\b/.test(fxr.line2) && fxr.felt === "rgb(255, 209, 102)", fxr);
    await done(p3, "FX " + (off ? "off" : "on"));
  }

  // ---- a phone: a finger drags a word; tapping patches one by one and the
  // last again stitches one; everything fits on the screen
  {
    const c = await lib.newContext(browser, devices["Pixel 7"]);
    const q = await open(c);
    await begin(q);
    const mid = (i) => q.evaluate((i) => { const r = document.querySelectorAll(".patch")[i].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, i);
    // a finger's drag, as the pointer events a touch screen sends
    const pts = []; for (const i of [5, 1, 2, 6]) pts.push(await mid(i));
    await q.evaluate((pts) => {
      const b = document.getElementById("block");
      const ev = (type, pt) => b.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, pointerType: "touch", isPrimary: true, clientX: pt.x, clientY: pt.y, button: 0 }));
      ev("pointerdown", pts[0]);
      for (let k = 1; k < pts.length; k++) for (let s = 1; s <= 8; s++) ev("pointermove", { x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * s / 8, y: pts[k - 1].y + (pts[k].y - pts[k - 1].y) * s / 8 });
      ev("pointerup", pts[pts.length - 1]);
    }, pts);
    for (const i of [0, 1, 2, 2]) { const pt = await mid(i); await q.touchscreen.tap(pt.x, pt.y); await wait(q, 60); }
    const ph = await q.evaluate(() => ({ found: Patchword.found().join(), hint: getComputedStyle(document.querySelector("#keys .gs-touch")).display }));
    check("patchword, phone: a finger dragged across r a t e stitches it; tapping c, a, t and t again stitches cat; the hint speaks of tapping, not keys",
      ph.found === "rate,cat" && ph.hint !== "none", ph);
    await done(q, "phone");
    await c.close();
  }
  // in play and on the menu, at phone and laptop sizes: nothing off the
  // screen or under the corner buttons, the block a good size, the tissue
  // beside the block on a laptop and under it on a phone
  const SIZES = [[320, 568], [360, 640], [390, 664], [375, 553], [360, 560], [1366, 657], [1280, 600], [1280, 900]];
  const bad = [];
  for (const [w, h] of SIZES) {
    const phone = w < 500;
    const c = await lib.newContext(browser, phone ? Object.assign({}, devices["Pixel 7"], { viewport: { width: w, height: h } }) : { viewport: { width: w, height: h } });
    const q = await open(c);
    await q.evaluate(() => { Patchword.start("quick"); Patchword.hold(true); for (let k = 0; k < 14; k++) Patchword.stitchAny(); });
    await wait(q, 100);
    const m = await q.evaluate(() => {
      const box = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const corner = Math.max(...[...document.querySelectorAll(".nav-back-games, .gs-corner > *")].map((e) => e.getBoundingClientRect().bottom));
      return { vw: document.documentElement.clientWidth, vh: innerHeight, sw: document.documentElement.scrollWidth, corner, hud: box("#hud"), block: box("#block"), word: box("#word"), tissue: box("#tissue"), keys: box("#keys"), wide: document.getElementById("work").classList.contains("wide") };
    });
    const parts = ["hud", "block", "word", "tissue", "keys"];
    const off = parts.filter((k) => m[k].l < -0.5 || m[k].r > m.vw + 0.5 || m[k].t < -0.5 || m[k].b > m.vh + 0.5);
    const ok = !off.length && m.sw <= m.vw && m.hud.t >= m.corner - 0.5 && m.block.w >= (phone ? 250 : 380) && m.tissue.h >= 60 && m.wide === !phone &&
      (phone ? m.tissue.t >= m.word.b - 0.5 : m.tissue.l >= m.block.r);
    if (!ok) bad.push({ size: w + "x" + h, off, m });
    await q.close(); await c.close();
  }
  check("patchword: at 320x568, 360x640, 390x664, 375x553, 360x560, 1366x657, 1280x600 and 1280x900 the round fits: nothing off the screen or under the corner buttons, the block at least 250 px on a phone (380 on a laptop), the tissue under it on a phone and beside it on a laptop",
    bad.length === 0, bad);

  // ---- the menu's scoring reads "3/4 -> 1", "5 -> 2" ... (the arrows drawn),
  // the five on one row from a 360 px phone up, wrapping inside the card below
  {
    const rows = {};
    for (const [w, h] of [[1366, 657], [390, 664], [360, 640], [320, 568]]) {
      const c = await lib.newContext(browser, { viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500 });
      const q = await lib.open(c, base, "games/patchword/");
      rows[w + "x" + h] = await q.evaluate(() => {
        const lis = [...document.querySelectorAll(".scale li")], card = document.querySelector("#menu .card").getBoundingClientRect();
        return { text: lis.map((li) => li.querySelector("b").textContent + ">" + li.querySelector("span").textContent).join(" "), arrows: lis.filter((li) => li.querySelector(".to") && li.querySelector(".to").getBoundingClientRect().width > 4).length,
          rows: new Set(lis.map((li) => Math.round(li.getBoundingClientRect().top))).size, inside: lis.every((li) => { const r = li.getBoundingClientRect(); return r.left >= card.left && r.right <= card.right; }) };
      });
      await c.close();
    }
    check("patchword: the menu's scoring reads 3/4 -> 1, 5 -> 2, 6 -> 3, 7 -> 5, 8+ -> 11, each with its arrow, one row from a 360 px phone up and inside the card at 320",
      Object.values(rows).every((r) => r.text === "3/4>1 5>2 6>3 7>5 8+>11" && r.arrows === 5 && r.inside) && rows["1366x657"].rows === 1 && rows["390x664"].rows === 1 && rows["360x640"].rows === 1, rows);
  }

  // ---- the end card lists every everyday word missed, longest first (no cap)
  {
    const q = await open();
    await begin(q);
    await q.evaluate(() => { Patchword.setTime(0.02); Patchword.step(0.05); });
    await q.waitForFunction(() => !document.getElementById("over").hidden, null, { timeout: 5000 });
    const end = await q.evaluate(() => {
      const want = Patchword.words().filter((w) => Patchword.rules.isEveryday(w));
      const shown = [...document.querySelectorAll("#missed li")].map((e) => e.firstChild.textContent);
      return { want: want.length, shown: shown.length, all: want.every((w) => shown.includes(w)), longestFirst: shown.every((w, i) => i === 0 || shown[i - 1].length >= w.length), head: document.getElementById("missed-head").textContent };
    });
    check("patchword: the end card lists every everyday word missed (" + end.want + " on this block), longest first, the heading counting them all",
      end.want > 18 && end.shown === end.want && end.all && end.longestFirst && end.head === "everyday words missed · " + end.want, end);
    await q.close();
  }

  // ---- typed letters found in more than one place light every place, each
  // with its thread (four E's, three ways to spell ST), not one picked; the
  // word stitches whichever is meant
  {
    const q = await open();
    await q.evaluate(() => { Patchword.start("quick"); Patchword.hold(true); Patchword.setTiles(["s", "t", "e", "a", "e", "r", "s", "t", "l", "e", "n", "o", "e", "d", "i", "m"]); });
    const look = () => q.evaluate(() => ({ lit: document.querySelectorAll(".patch.on").length, knots: document.querySelectorAll("#thread .knot").length, threads: document.querySelectorAll("#thread .over").length }));
    await q.evaluate(() => Patchword.type("e")); const e = await look();
    await q.keyboard.press("Backspace"); await q.evaluate(() => Patchword.type("st")); const st = await look();
    await q.keyboard.press("Backspace"); await q.keyboard.press("Backspace");
    await q.evaluate(() => Patchword.type("set")); const set = await look();
    const stitched = await q.evaluate(() => ({ r: Patchword.enter(), found: Patchword.found() }));
    check("patchword: typed letters found in more than one place light every place, each with its thread (E: 4 patches, 4 knots; ST: 3 ways, 4 patches; SET: 3 ways, 6 patches), and the word stitches",
      e.lit === 4 && e.knots === 4 && st.knots === 3 && st.threads === 3 && st.lit === 4 && set.knots === 3 && set.lit === 6 && stitched.r === "ok" && stitched.found.includes("set"), { e, st, set, stitched });
    await done(q, "typed paths");
  }

  await ctx.close();
};
