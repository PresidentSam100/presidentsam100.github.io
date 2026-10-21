// Science Fair: a first run that ends at round 0 isn't "a new best"; the
// buttons' keycaps (the mode keys, Blast off, Again) show with a keyboard
// and hide on a touch-only phone; each sits in the middle of its button and
// shows against it. The sun is the biggest thing on the board; the gas giants
// are far bigger than the rocky planets and hang by two strings; and the board
// shows the mode's own planets: all nine, or in Classic the four rocky ones,
// closed in on and spread across it, the others slid away, the sun still in.
// With Visual FX on, the glide between those views keeps every thread tied.
// The report card's grade stamp sits on none of its words, phones included.
module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  // a Classic run that misses the very first note: round 0
  const missFirst = async (p) => {
    await p.evaluate(() => { ScienceFair.fast(); ScienceFair.start("classic"); });
    await p.waitForFunction(() => ScienceFair.state() === "input", null, { timeout: 8000 });
    await p.evaluate(() => { const s = ScienceFair.seq(); ScienceFair.press((s[0] + 1) % 4); });
    await p.waitForFunction(() => ScienceFair.state() === "over", null, { timeout: 8000 });
  };

  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const ctx = await lib.newContext(browser, opts);
    const p = await lib.open(ctx, base, "games/science-fair/");
    const shown = () => p.evaluate(() => [...document.querySelectorAll(".panel button kbd")].filter((k) => k.getClientRects().length).map((k) => k.closest("button").id || k.closest("button").dataset.v));
    const menu = await shown();
    // a button's keycap: how far its middle is from the button's (in the
    // sheet's own layout numbers: the sheet is tilted), and whether it is a
    // patch of another colour than the button
    const capOf = (id) => p.evaluate((id) => {
      const b = document.getElementById(id), k = b.querySelector("kbd");
      return { off: (k.offsetTop + k.offsetHeight / 2) - (b.offsetTop + b.offsetHeight / 2), seen: getComputedStyle(k).backgroundColor !== getComputedStyle(b).backgroundColor };
    }, id);
    const playCap = label === "desktop" ? await capOf("play") : null;
    // the how-to line names the number keys only where there are keys, and so
    // do the keycaps on the planets' tags
    const how = await p.evaluate(() => ({ text: document.querySelector("#menu .how").innerText, tags: [...document.querySelectorAll(".hang .tag kbd")].filter((k) => k.getClientRects().length).length }));
    if (label === "phone") check("science-fair: on a touch-only phone the how-to says tap, and the planets' tags show no keycaps",
      /by tapping them\./.test(how.text) && !/number keys|1 to 9/.test(how.text) && how.tags === 0, how);
    else check("science-fair: with a keyboard the how-to names the number keys, and the planets' tags show them",
      /pressing their number keys \(1 to 9\)/.test(how.text) && how.tags === 9, how);
    await missFirst(p);
    const over = await shown();
    if (label === "desktop") {
      const r = await p.evaluate(() => ({ msg: document.getElementById("over-msg").textContent, stats: document.getElementById("over-stats").textContent }));
      check("science-fair: a first run that ends at round 0 isn't a new best", r.msg === "Round 0" && !/new best/.test(r.stats), r);
      check("science-fair: with a keyboard the buttons' keycaps show", menu.length === 5 && over.length === 2, { menu, over });
      // (on one line of text with its label a keycap rode 2 to 3px low; and
      // Again's, ink on an ink button, could not be seen)
      const caps = { play: playCap, again: await capOf("again"), modes: await capOf("to-menu") };
      check("science-fair: the keycaps on Blast off, Again and Modes sit in the middle of their buttons, and each shows against its button",
        Object.keys(caps).every((k) => Math.abs(caps[k].off) <= 1 && caps[k].seen), caps);
    } else check("science-fair: on a touch-only phone the buttons' keycaps are hidden", menu.length === 0 && over.length === 0, { menu, over });
    check("science-fair (" + label + "): no page errors", p.errs.length === 0, p.errs);
    await ctx.close();
  }

  // Enter on a focused mode button picks that mode and stays on the menu (it
  // used to start a run in the old mode as well); a mode picked with the
  // mouse doesn't keep the focus, so the next Enter is Blast off
  {
    const ctx = await lib.newContext(browser);
    const p = await lib.open(ctx, base, "games/science-fair/");
    const look = () => p.evaluate(() => ({ state: ScienceFair.state(), on: (document.querySelector("#pick-mode button.on") || {}).dataset.v, focus: document.activeElement.tagName }));
    await p.focus('#pick-mode button[data-v="grand"]'); await p.keyboard.press("Enter"); await p.waitForTimeout(150);
    const a = await look();
    await p.evaluate(() => document.activeElement.blur());
    await p.click('#pick-mode button[data-v="classic"]'); const b = await look();
    await p.evaluate(() => ScienceFair.fast()); await p.keyboard.press("Enter"); await p.waitForTimeout(200);
    const c = await look();
    check("science-fair: Enter on a focused mode button only picks it; after a mouse pick (which keeps no focus) Enter blasts off",
      a.state === "menu" && a.on === "grand" && b.on === "classic" && b.focus !== "BUTTON" && c.state !== "menu", { a, b, c });
    check("science-fair (menu keys): no page errors", p.errs.length === 0, p.errs);
    await ctx.close();
  }

  // ---- the diorama: the sun, the planets' sizes and strings, and the view each mode gives
  {
    const ctx = await lib.newContext(browser);
    const p = await lib.open(ctx, base, "games/science-fair/");
    // where everything hangs once it has stopped gliding (two looks alike, a few frames apart)
    const board = () => p.evaluate(() => new Promise((res) => {
      const read = () => {
        const W = innerWidth, H = innerHeight, r = (e) => e.getBoundingClientRect();
        const sun = r(document.getElementById("sun"));
        return { W, H, sun: { w: Math.round(sun.width), cx: Math.round(sun.left + sun.width / 2), cy: Math.round(sun.top + sun.height / 2) },
          planets: [...document.querySelectorAll("#planets .hang")].map((h) => {
            const b = r(h.querySelector("button.pad")), s = r(h.querySelector(".string")), k = h.querySelector(".knot");
            return { w: Math.round(b.width), left: Math.round(b.left), right: Math.round(b.right), bottom: Math.round(b.bottom), two: h.classList.contains("two"),
              span: Math.round(s.width), knots: getComputedStyle(k, "::before").content !== "none" && getComputedStyle(k, "::after").content !== "none" ? 2 : 1,
              dim: h.classList.contains("dim") };
          }) };
      };
      let last = "", same = 0, n = 0;
      (function tick() {
        const now = JSON.stringify(read());
        same = now === last ? same + 1 : 0; last = now;
        if (same >= 6 || ++n > 400) res(JSON.parse(now)); else requestAnimationFrame(tick);
      })();
    }));
    // (Visual FX off for the measuring: nothing sways, and a change of view is there at once)
    await p.evaluate(() => { if (!window.RM_ON()) document.querySelector(".rm-toggle").click(); });
    await p.keyboard.press("2");                                  // Grand Tour: all nine
    const grand = await board();
    await p.keyboard.press("1");                                  // Classic: the four rocky planets
    const classic = await board();
    const inside = (q, b) => q.left >= 0 && q.right <= b.W && q.bottom <= b.H;
    const [me, ve, ea, ma, ju, sa, ur, ne, pl] = grand.planets;
    check("science-fair: the sun is the biggest thing on the board (nearly half its height across), its face inside the frame",
      grand.sun.w >= grand.H * 0.45 && grand.sun.w > ju.w * 1.8 && grand.sun.cx > 0 && grand.sun.cy < grand.H, { sun: grand.sun, H: grand.H, jupiter: ju.w });
    check("science-fair: the planets keep their real order of size: Jupiter about twice Earth across, then Uranus, Neptune, Earth, Venus, Mars, Mercury, Pluto",
      ju.w > ea.w * 1.9 && ju.w > ur.w && ur.w >= ne.w && ne.w > ea.w && ea.w >= ve.w && ve.w > ma.w && ma.w > me.w && me.w > pl.w, grand.planets.map((q) => q.w));
    check("science-fair: the two gas giants hang by two strings, about a radius apart; the rest by one",
      grand.planets.every((q, i) => (i === 4 || i === 5) === q.two && q.knots === (q.two ? 2 : 1)) && Math.abs(ju.span - ju.w * 76 / 168) < ju.w * 0.12 && me.span <= 3,
      grand.planets.map((q) => [q.two, q.knots, q.span]));
    check("science-fair, Grand Tour: all nine planets hang inside the frame", grand.planets.every((q) => inside(q, grand) && !q.dim), grand.planets.map((q) => [q.left, q.right]));
    check("science-fair, Classic: the board closes in on the four rocky planets (each over half as big again, spread over more than half the board), the other five slid away past its edge, the sun still in the frame and bigger",
      classic.planets.slice(0, 4).every((q, i) => inside(q, classic) && q.w > grand.planets[i].w * 1.5) &&
      classic.planets[3].right - classic.planets[0].left > classic.W * 0.55 &&
      classic.planets.slice(4).every((q) => q.left >= classic.W && q.dim) &&
      classic.sun.w > grand.sun.w && classic.sun.cx > 0 && classic.sun.cy < classic.H,
      { classic: classic.planets.map((q) => [q.left, q.right, q.w]), sun: classic.sun });
    check("science-fair (diorama): no page errors", p.errs.length === 0, p.errs);
    await p.close();
    await ctx.close();
  }

  // ---- a change of view with Visual FX on: as the planets glide (Grand Tour
  // to Classic and back), every frame each tag's two threads run from its
  // cutout's edge down to the tag, each cutout's string down to its paper, and
  // each knot in sight sits on the ruler or on the wire, still showing, and
  // between its ends (in Classic the ruler runs on past the board's edge, so
  // the ones sliding away never leave it). (The
  // tags' threads were tied only as the glide began and once it was over, so
  // they hung in the air where the cutouts had been, up to 300 px off; on a
  // phone the outer four slid in at the ruler's height and dropped to the
  // wire on the way, their knots on nothing.)
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const ctx = await lib.newContext(browser, opts);
    const p = await lib.open(ctx, base, "games/science-fair/");
    await p.evaluate(() => { if (window.RM_ON()) document.querySelector(".rm-toggle").click(); });
    const glide = (from, to) => p.evaluate(([from, to]) => new Promise((res) => {
      const key = (k) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, code: "Digit" + k, bubbles: true }));
      const A = window.SciArt, worst = { ties: 0, string: 0, knot: 0 }, at = {};
      const look = () => [...document.querySelectorAll("#planets .hang")].forEach((h, i) => {
        const btn = h.querySelector("button.pad"), str = h.querySelector(".string"), tag = h.querySelector(".tag"), ties = h.querySelectorAll(".tie");
        // (in the cutout's own frame: the sway turns it all together)
        const r = A.PLANETS[i].r * btn.offsetWidth / A.planetSVG(i).w, cx = h.offsetWidth / 2, cy = btn.offsetTop + btn.offsetHeight / 2;
        const d = Math.max(4, Math.min(tag.offsetWidth / 2 - 8, r * 0.7)), edge = cy + Math.sqrt(Math.max(0, r * r - d * d)) - 3;
        let off = 0;
        [-d, d].forEach((dx, k) => {
          const t = ties[k];
          off = Math.max(off, Math.abs(t.offsetLeft + 0.75 - (cx + dx)), Math.abs(t.offsetTop - edge), Math.abs(t.offsetTop + t.offsetHeight - (tag.offsetTop + 3)));
        });
        const foot = str.offsetTop + str.offsetHeight + (parseFloat(getComputedStyle(str).marginBottom) || 0);
        // (a knot is on a line when at its height and between its ends)
        const rr = document.getElementById("ruler").getBoundingClientRect(), wire = document.getElementById("wire"), ws = getComputedStyle(wire), wr = wire.getBoundingClientRect();
        const kx = h.offsetLeft + h.offsetWidth / 2, along = (b) => Math.max(0, b.left - kx, kx - b.right);
        const onRuler = Math.max(Math.abs(h.offsetTop - rr.bottom), along(rr));
        const onWire = ws.visibility !== "hidden" && +ws.opacity > 0.05 ? Math.max(Math.abs(h.offsetTop - wire.offsetTop), along(wr)) : Infinity;
        const seen = h.getBoundingClientRect().left < innerWidth - 20 && kx < innerWidth;
        const q = { ties: off, string: Math.abs(foot - (cy - r)), knot: seen ? Math.min(onRuler, onWire) : 0 };
        Object.keys(q).forEach((k) => { if (q[k] > worst[k]) { worst[k] = q[k]; at[k] = A.PLANETS[i].name; } });
      });
      key(from);
      setTimeout(() => {
        key(to);
        const t0 = performance.now();
        (function tick() { look(); if (performance.now() - t0 < 1100) requestAnimationFrame(tick); else res({ worst: Object.fromEntries(Object.entries(worst).map(([k, v]) => [k, Math.round(v * 10) / 10])), at }); })();
      }, 1300);
    }), [from, to]);
    const toClassic = await glide("2", "1"), toGrand = await glide("1", "2");
    const ok = (g) => g.worst.ties <= 2 && g.worst.string <= 2 && g.worst.knot <= 2;
    check("science-fair (" + label + "), Visual FX on: as the view glides to Classic and back, the tags' threads stay tied to their cutouts and the knots to the ruler or the wire, every frame",
      ok(toClassic) && ok(toGrand), { toClassic, toGrand });
    check("science-fair (" + label + ", glide): no page errors", p.errs.length === 0, p.errs);
    await ctx.close();
  }

  // ---- Pop Quiz: every round a whole new tune, one note longer than the
  // last and never the last one with a note added on, all nine planets in
  // play; Classic and Grand Tour still add a note to the same tune. Its best
  // is saved as each round is cleared, and it is picked with key 4 (a tap on
  // a touch-only phone, where the keycap hides).
  // (clears each round as it comes: the tunes, and Pop Quiz's best as each was cleared)
  const playRounds = async (p, n) => {
    const tunes = [], saved = [];
    for (let r = 1; r <= n; r++) {
      await p.waitForFunction((r) => ScienceFair.state() === "input" && ScienceFair.seq().length === r, r, { timeout: 8000 });
      const got = await p.evaluate(() => {
        const s = ScienceFair.seq();
        s.forEach((i) => ScienceFair.press(i));
        return { s, best: localStorage.getItem("scifair_best_quiz"), state: ScienceFair.state() };
      });
      tunes.push(got.s); saved.push({ best: got.best, state: got.state });
    }
    return { tunes, saved };
  };
  const ROUNDS = 6;
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const ctx = await lib.newContext(browser, opts);
    const p = await lib.open(ctx, base, "games/science-fair/");
    const q = '#pick-mode button[data-v="quiz"]';
    const cap = () => p.evaluate((q) => { const k = document.querySelector(q + " kbd"); return k && k.getClientRects().length ? k.textContent : null; }, q);
    const capShown = await cap();
    await p.evaluate(() => ScienceFair.fast());
    if (label === "desktop") await p.keyboard.press("4"); else if (await p.$(q)) await p.tap(q);
    await p.waitForTimeout(150);
    const picked = await p.evaluate((q) => { const b = document.querySelector(q); return { state: ScienceFair.state(), mode: ScienceFair.mode(), on: !!b && b.classList.contains("on"),
      saved: localStorage.getItem("scifair_mode"), name: b && b.querySelector("b").textContent }; }, q);
    if (label === "desktop") await p.keyboard.press("Enter"); else await p.tap("#play");
    const quiz = await playRounds(p, ROUNDS);
    const nine = await p.evaluate(() => document.querySelectorAll("#planets .hang.dim").length === 0);
    check("science-fair (" + label + "): " + (label === "desktop" ? "key 4, shown on its button, picks Pop Quiz and Enter starts it" : "a tap picks Pop Quiz (no keycap on a phone) and Blast off starts it"),
      picked.state === "menu" && picked.mode === "quiz" && picked.on && picked.saved === "quiz" && picked.name === "Pop Quiz" && (label === "desktop" ? capShown === "4" : capShown === null) && quiz.tunes.length === ROUNDS,
      { capShown, picked, rounds: quiz.tunes.length });
    // each round one note longer, and never the last tune with a note on the end
    const t = quiz.tunes;
    const longer = t.every((s, k) => s.length === k + 1);
    const fresh = t.slice(1).every((s, k) => t[k].some((v, j) => s[j] !== v));
    // (and not just its last note changed: over the rounds, the opening note too)
    const early = t.slice(1).some((s, k) => s[0] !== t[k][0]);
    check("science-fair (" + label + "): in Pop Quiz each round is a whole new tune, exactly one note longer than the last, never the last one with a note added on",
      longer && fresh && early, t.map((s) => s.join("")));
    check("science-fair (" + label + "): Pop Quiz plays on all nine planets", nine && t.flat().every((i) => i >= 0 && i < 9), t.map((s) => s.join("")));
    check("science-fair (" + label + "): Pop Quiz's best is saved the moment each round is cleared, mid-run",
      quiz.saved.every((s, k) => s.best === String(k + 1) && s.state !== "over"), quiz.saved);
    // the old modes: the same tune, one more note each round
    for (const m of ["classic", "grand"]) {
      await p.evaluate((m) => { ScienceFair.toMenu(); ScienceFair.start(m); }, m);
      const old = (await playRounds(p, 5)).tunes;
      check("science-fair (" + label + "): " + m + " still plays the last round's tune with one note added",
        old.every((s, k) => s.length === k + 1 && (k === 0 || s.slice(0, k).join() === old[k - 1].join())), old.map((s) => s.join("")));
    }
    check("science-fair (" + label + ", Pop Quiz): no page errors", p.errs.length === 0, p.errs);
    await ctx.close();
  }

  // Pop Quiz's report card and the menu give its own best (not Grand Tour's);
  // and a pause in it, as in the other modes, is no second look: the tune
  // freezes where it is, nothing plays again, and the run goes on with the
  // same tune
  {
    const ctx = await lib.newContext(browser);
    const p = await lib.open(ctx, base, "games/science-fair/", { before: (pg) => pg.addInitScript(() => {
      localStorage.setItem("scifair_best_quiz", "50"); localStorage.setItem("scifair_best_grand", "40"); localStorage.setItem("scifair_best_classic", "30");
    }) });
    const menuBests = (await p.evaluate(() => document.getElementById("bests").textContent)).replace(/\s/g, " ");   // (its no-break spaces as plain ones)
    await p.evaluate(() => { ScienceFair.fast(); ScienceFair.start("quiz"); });
    await playRounds(p, 2);
    // round 3: paused as the tune plays, then again on your turn (P pressed
    // the moment each comes, before the game's clock moves on: the tune is brief)
    const pauseWhen = (st) => p.waitForFunction((st) => {
      if (ScienceFair.state() !== st || ScienceFair.seq().length !== 3) return false;
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "p", code: "KeyP", bubbles: true }));
      return true;
    }, st, { timeout: 8000 });
    await pauseWhen("watch");
    const tune = await p.evaluate(() => ScienceFair.seq());
    await p.waitForTimeout(400);
    const during = await p.evaluate(() => ({ state: ScienceFair.state(), seq: ScienceFair.seq(), clock: ScienceFair.clockNow() }));
    await p.waitForTimeout(400);
    const still = await p.evaluate(() => ScienceFair.clockNow());
    await p.keyboard.press("p");
    await pauseWhen("input"); await p.waitForTimeout(300);
    // (watched from here: any planet that lights while the card is up or after it)
    await p.evaluate(() => { window.__lit = 0; new MutationObserver(() => { if (document.querySelector("#planets .hang.lit")) window.__lit++; }).observe(document.getElementById("planets"), { subtree: true, attributes: true, attributeFilter: ["class"] }); });
    await p.waitForTimeout(300);
    await p.keyboard.press("p"); await p.waitForTimeout(150);
    const after = await p.evaluate(() => ({ state: ScienceFair.state(), seq: ScienceFair.seq(), lit: window.__lit }));
    check("science-fair: a pause in Pop Quiz freezes the tune and replays nothing; after it the same tune is yours to repeat",
      during.state === "watch" && during.seq.join() === tune.join() && still === during.clock && after.state === "input" && after.seq.join() === tune.join() && after.lit === 0,
      { tune, during, still, after });
    // a wrong planet: round 2 cleared, so "Round 2", and the best on file is Pop Quiz's
    await p.evaluate(() => { const s = ScienceFair.seq(); ScienceFair.press((s[0] + 1) % 9); });
    await p.waitForFunction(() => ScienceFair.state() === "over", null, { timeout: 8000 });
    const card = await p.evaluate(() => ({ msg: document.getElementById("over-msg").textContent, stats: document.getElementById("over-stats").textContent }));
    check("science-fair: Pop Quiz's report card gives its own best; the menu lists it with the others",
      card.msg === "Round 2" && /best: round 50/.test(card.stats) && /Classic 30 · Grand Tour 40 · Pop Quiz 50/.test(menuBests), { card, menuBests });
    check("science-fair (Pop Quiz card): no page errors", p.errs.length === 0, p.errs);
    await ctx.close();
  }

  // ---- the games page's reset clears Pop Quiz's best and keeps the mode picked (a setting)
  {
    const ctx = await lib.newContext(browser);
    const p = await lib.open(ctx, base, "games/", { waitCorner: false, before: (pg) => pg.addInitScript(() => {
      if (!sessionStorage.getItem("__sf_seeded")) { sessionStorage.setItem("__sf_seeded", "1"); localStorage.setItem("scifair_best_quiz", "7"); localStorage.setItem("scifair_mode", "quiz"); }
    }) });
    await p.keyboard.press("Escape"); await p.waitForTimeout(250);
    await p.keyboard.press("Escape"); await p.waitForTimeout(250);
    const left = await p.evaluate(() => ({ best: localStorage.getItem("scifair_best_quiz"), mode: localStorage.getItem("scifair_mode") }));
    check("science-fair: the games page's reset clears Pop Quiz's best, and keeps the mode it was left on", left.best === null && left.mode === "quiz", left);
    await ctx.close();
  }

  // ---- the menu fits with nothing to scroll on laptops and phones, short ones
  // too, at its fullest (a best in every mode, the Field Trip played and not):
  // no wider than the screen, the heading clear of the corner buttons, and
  // the rules, all four modes, Blast off and the bests inside the screen
  {
    const SIZES = [["laptop", 1280, 900], ["laptop", 1366, 657], ["laptop", 1280, 600],
      ["phone", 390, 664], ["phone", 360, 560], ["phone", 375, 553], ["phone", 320, 568]];
    const bad = {};
    for (const [kind, w, h] of SIZES) {
      for (const used of [0, 2]) {
        const ctx = await lib.newContext(browser, kind === "phone" ? Object.assign({}, devices["iPhone 13"], { viewport: { width: w, height: h } }) : { viewport: { width: w, height: h } });
        const p = await lib.open(ctx, base, "games/science-fair/", { before: (pg) => pg.addInitScript((used) => {
          const d = new Date(), ymd = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
          localStorage.setItem("scifair_best_classic", "28"); localStorage.setItem("scifair_best_grand", "24"); localStorage.setItem("scifair_best_quiz", "18");
          localStorage.setItem("scifair_daily", JSON.stringify({ ymd, n: 22, used, best: used ? 14 : 0 }));
        }, used) });
        const r = await p.evaluate((w) => {
          const panel = document.getElementById("menu"), H = innerHeight, box = (e) => e.getBoundingClientRect();
          const inside = (e) => { const b = box(e); return b.height > 0 && b.top >= 0 && b.bottom <= H && b.left >= 0 && b.right <= w; };
          const row = [...document.querySelectorAll(".nav-back-games, .gs-corner > *")].filter((x) => x.getClientRects().length).map((x) => box(x).bottom);
          const modes = [...document.querySelectorAll("#pick-mode button")];
          return { scroll: panel.scrollHeight - panel.clientHeight, wider: Math.round(Math.max(document.documentElement.scrollWidth, innerWidth) - w),
            clear: Math.round(box(panel.querySelector("h1")).top - Math.max.apply(null, row)),
            shown: [panel.querySelector(".how"), ...modes, document.getElementById("play"), document.getElementById("bests")].every(inside), modes: modes.length };
        }, w);
        if (r.scroll > 0 || r.wider > 0 || r.clear < 0 || !r.shown || r.modes !== 4) bad[kind + " " + w + "x" + h + (used ? " (Field Trip played)" : "")] = r;
        if (p.errs.length) bad[w + "x" + h + " errors"] = p.errs;
        await ctx.close();
      }
    }
    check("science-fair: the menu, at its fullest, fits laptops (1280x900, 1366x657, 1280x600) and phones (390x664, 360x560, 375x553, 320x568) with nothing to scroll, its heading clear of the corner buttons",
      Object.keys(bad).length === 0, bad);
  }

  // ---- the report card's grade stamp (and an A+'s gold star) lands on none
  // of the card's words, whichever title and grade it shows, on laptops and
  // phones (on a narrow phone it used to sit on the title)
  {
    const SIZES = [["laptop", 1366, 657], ["laptop", 1280, 900], ["phone", 390, 664], ["phone", 375, 553], ["phone", 360, 560], ["phone", 320, 568]];
    const bad = {};
    for (const [kind, w, h] of SIZES) {
      const ctx = await lib.newContext(browser, kind === "phone" ? Object.assign({}, devices["iPhone 13"], { viewport: { width: w, height: h } }) : { viewport: { width: w, height: h } });
      const p = await lib.open(ctx, base, "games/science-fair/");
      await missFirst(p);
      const hits = await p.evaluate(() => {
        const g = document.getElementById("over-grade"), out = [];
        // each line of a text, as laid out
        const lines = (el) => { const r = document.createRange(); r.selectNodeContents(el); return [...r.getClientRects()].filter((b) => b.width > 0); };
        for (const t of ["Project review", "Judges' notes", "Grading time", "Field notes"]) for (const gr of ["A+", "A", "B+", "B", "C+", "C", "D"]) {
          document.getElementById("over-title").textContent = t;
          g.textContent = gr; g.classList.toggle("gold", gr === "A+");
          // the stamp is a circle; the star, a glyph's box off its top right, turned with it
          const b = g.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2, R = g.offsetWidth / 2;
          let star = null;
          if (gr === "A+") {
            const fs = parseFloat(getComputedStyle(g, "::after").fontSize), m = new DOMMatrix(getComputedStyle(g).transform), a = Math.atan2(m.b, m.a);
            const pts = [[R + 10 - fs * 1.25, -R - 14], [R + 10, -R - 14], [R + 10 - fs * 1.25, -R - 14 + fs * 1.3], [R + 10, -R - 14 + fs * 1.3]]
              .map(([x, y]) => [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)]);
            star = { left: Math.min(...pts.map((q) => q[0])), right: Math.max(...pts.map((q) => q[0])), top: Math.min(...pts.map((q) => q[1])), bottom: Math.max(...pts.map((q) => q[1])) };
          }
          for (const id of ["over-title", "over-msg", "over-stats"]) for (const r of lines(document.getElementById(id))) {
            const x = Math.max(r.left, Math.min(cx, r.right)), y = Math.max(r.top, Math.min(cy, r.bottom));
            if (Math.hypot(cx - x, cy - y) < R) out.push(t + " " + gr + ": stamp on " + id);
            if (star && star.left < r.right && r.left < star.right && star.top < r.bottom && r.top < star.bottom) out.push(t + " " + gr + ": star on " + id);
          }
        }
        return out;
      });
      if (hits.length) bad[kind + " " + w + "x" + h] = hits.slice(0, 4).concat(hits.length > 4 ? [hits.length + " in all"] : []);
      if (p.errs.length) bad[w + "x" + h + " errors"] = p.errs;
      await ctx.close();
    }
    check("science-fair: the report card's grade stamp and an A+'s star are on none of its words (title, round, notes), every title and grade, on laptops (1366x657, 1280x900) and phones (390x664, 375x553, 360x560, 320x568)",
      Object.keys(bad).length === 0, bad);
  }
};
