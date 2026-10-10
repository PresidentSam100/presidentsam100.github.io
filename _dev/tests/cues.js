// FX-2b: with Visual FX off, every game cue still shows, as a still version
// of itself, for about as long as its animation would run, and then goes
// (a cue that never goes would mean its cleanup waits for an animationend
// that FX off no longer fires). With FX on the animation is unchanged.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  // open a game with its Visual FX switch set (the setting survives lib.open's storage wipe)
  const open = (game, off, path, before) => lib.open(ctx, base, "games/" + (path || game + "/"), {
    before: async (pg) => {
      await pg.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) {} }, ["reduceMotion:" + game, off ? "1" : "0"]);
      if (before) await before(pg);
    },
  });
  // read a cue now (after two frames), and again once its time is up
  const probe = (p, fn, arg) => p.evaluate(([src, arg]) => new Promise((done) => {
    requestAnimationFrame(() => requestAnimationFrame(() => done(new Function("arg", src)(arg))));
  }), ["return (" + fn + ")(arg)", arg]);
  const anim = "(el) => el.getAnimations().filter((a) => a.effect && a.effect.getTiming().duration > 1).length";
  // A cue lasts a moment, and on a busy machine a couple of frames can take
  // longer than that: so a check sets off its cue and reads it in the same
  // step, then waits (polled, with room to spare) for it to go, instead of
  // reading after fixed waits.
  const goes = (p, fn, ms) => p.waitForFunction(fn, null, { timeout: ms || 8000 }).then(() => true, () => false);
  // For a cue set off by a key (the key is part of what's checked): a watcher
  // set up before the key records the cue the moment it appears, read by
  // `read`; `caught` then returns that record.
  const watchFor = (p, sel, read) => p.evaluate(([sel, src]) => {
    window.__cue = null;
    const f = new Function("el", "return (" + src + ")(el)");
    new MutationObserver(() => { if (window.__cue) return; const el = document.querySelector(sel); if (el) window.__cue = f(el); })
      .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  }, [sel, read.toString()]);
  const caught = (p) => p.waitForFunction(() => window.__cue, null, { timeout: 8000 }).then((h) => h.jsonValue(), () => null);
  const done = async (p, g) => { check(g + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };

  // ---- Crazy Ohio: a judgment label stays readable, then goes
  {
    const p = await open("crazy-ohio", true);
    await p.click("#startBtn");
    await p.waitForFunction(() => __OSU_TEST__.getTiles().length > 0, null, { timeout: 15000 }).catch(() => {});
    await watchFor(p, ".judge", (j) => { j.dataset.probe = "1"; const cs = getComputedStyle(j); return { text: j.textContent, op: cs.opacity, name: cs.animationName }; });
    await p.keyboard.press("f");
    const s = await caught(p);
    await goes(p, () => !document.querySelector('.judge[data-probe="1"]'));
    // (that label, not any: tiles keep falling, and a missed one adds a new MISS)
    const gone = await p.evaluate(() => !document.querySelector('.judge[data-probe="1"]'));
    check("crazy-ohio, FX off: a judgment label shows still and fully, then goes", !!s && s.op === "1" && s.name === "none" && gone, { s, gone });
    await done(p, "crazy-ohio");
  }

  // ---- Speedle: a word it doesn't know marks the row; a solved word's bonuses show
  for (const off of [true, false]) {
    const p = await open("speedle", off, null, (pg) => lib.injectScript(pg, "games/speedle/game.js", [["answer = WORDS[(Math.random() * WORDS.length) | 0];", "answer = WORDS[(Math.random() * WORDS.length) | 0]; window.__answer = answer;"]]));
    await p.click("#m-sprint"); await p.waitForTimeout(400);
    if (off) {
      await p.keyboard.type("zzzzz");
      await watchFor(p, "#board .row.bad .tile", (t) => { const cs = getComputedStyle(t); return cs.outlineStyle + " " + cs.outlineWidth; });
      await p.keyboard.press("Enter");
      const bad = await caught(p);
      await goes(p, () => !document.querySelector("#board .row.bad"));
      const after = await p.evaluate(() => getComputedStyle(document.querySelector("#board .row .tile")).outlineStyle);
      check("speedle, FX off: a word it doesn't know gives the row a red edge for a moment", bad === "solid 2px" && after === "none", { bad, after });
      for (let i = 0; i < 5; i++) await p.keyboard.press("Backspace");
    }
    await p.keyboard.type(await p.evaluate(() => window.__answer)); await p.keyboard.press("Enter");
    const b = await probe(p, (anim) => { const e = document.getElementById("score-bonus"); return { op: getComputedStyle(e).opacity, moving: new Function("return " + anim)()(e) }; }, anim);
    if (off) {
      await p.waitForTimeout(1200);
      const later = await p.evaluate(() => getComputedStyle(document.getElementById("score-bonus")).opacity);
      check("speedle, FX off: the +1 bonus shows still, then goes", b.op === "1" && b.moving === 0 && later === "0", { b, later });
    } else check("speedle, FX on: the +1 bonus still rises", b.moving > 0, b);
    await done(p, "speedle FX " + (off ? "off" : "on"));
  }

  // ---- Sudoku: the hint's ring stays drawn for its second
  {
    const p = await open("sudoku", true);
    // (the puzzle comes from a worker: until it's in, Hint has nothing to point at)
    await p.waitForFunction(() => document.querySelector(".c.given"), null, { timeout: 15000 }).catch(() => {});
    const s = await p.evaluate(() => { document.getElementById("hintBtn").click(); const c = document.querySelector(".c.hinted"); if (!c) return null; const cs = getComputedStyle(c, "::after"); return { op: cs.opacity, name: cs.animationName }; });
    const gone = await goes(p, () => !document.querySelector(".c.hinted"));
    check("sudoku, FX off: the hint ring shows, still, then goes", !!s && s.op === "1" && s.name === "none" && gone, { s, gone });
    await done(p, "sudoku");
  }

  // ---- Metazac: a wrong answer turns the box red; a storm that isn't ready rings red
  {
    const p = await open("metazac", true);
    await p.click("#start-btn"); await p.waitForTimeout(500);
    await p.keyboard.type("987654");
    await watchFor(p, "#answer.wrong", (a) => { const cs = getComputedStyle(a); return { wrong: true, border: cs.borderTopColor, name: cs.animationName }; });
    await p.keyboard.press("Enter");
    const w = (await caught(p)) || { wrong: false };
    const wGone = await goes(p, () => !document.getElementById("answer").classList.contains("wrong"));
    check("metazac, FX off: a wrong answer holds a red box for a moment, then clears", w.wrong && w.border === "rgb(224, 54, 44)" && w.name === "none" && wGone, { w, wGone });
    await p.keyboard.press("Space"); await p.waitForTimeout(300);
    await watchFor(p, "#power-btn.nope .power-face", (el) => getComputedStyle(el).boxShadow);
    await p.keyboard.press("Space");
    const n = (await caught(p)) || "";
    const nGone = await goes(p, () => !document.getElementById("power-btn").classList.contains("nope"));
    check("metazac, FX off: a storm that isn't ready rings red for a moment", /rgb\(224, 54, 44\) 0px 0px 0px 4px/.test(n) && nGone, { n, nGone });
    await done(p, "metazac");
  }

  // ---- Mahjong: the hinted pair glows; a blocked tile gets a red edge
  {
    const p = await open("mahjong", true);
    await p.evaluate(() => Mahjong.start("classic")); await p.waitForTimeout(400);
    await p.evaluate(() => Mahjong.hintNow());
    const h = await probe(p, () => [...document.querySelectorAll("#board button.tile.hintg")].map((t) => getComputedStyle(t).filter));
    await p.waitForTimeout(1900);
    const hGone = await p.evaluate(() => document.querySelectorAll("#board button.tile.hintg").length);
    check("mahjong, FX off: the hinted pair glows, still, then stops", h.length === 2 && h.every((f) => /drop-shadow/.test(f)) && hGone === 0, { h, hGone });
    // (the click and the read in one step: the edge is gone again in under half a second)
    const b = await p.evaluate(() => new Promise((res) => {
      const free = Mahjong.freeIdx(); const all = [...document.querySelectorAll("#board button.tile")].map((t, i) => i); const i = all.find((k) => free.indexOf(k) === -1); Mahjong.click(i);
      requestAnimationFrame(() => requestAnimationFrame(() => { const t = document.querySelector("#board button.tile.shake"); res(t ? getComputedStyle(t).outlineStyle + " " + getComputedStyle(t).outlineWidth : null); }));
    }));
    check("mahjong, FX off: clicking a blocked tile gives it a red edge", b === "solid 3px", b);
    await done(p, "mahjong");
  }

  // ---- Lights Out: the hinted bulb glints (it costs a move); FX on still animates
  for (const off of [true, false]) {
    const p = await open("lights-out", off);
    await p.evaluate(() => LightsOut.start("zen")); await p.waitForTimeout(400);
    await watchFor(p, ".bulb.glint", (w) => { const cs = getComputedStyle(w); return { filter: cs.filter, name: cs.animationName, moving: w.getAnimations().filter((a) => a.effect && a.effect.getTiming().duration > 1).length }; });
    await p.keyboard.press("h");
    const g = await caught(p);
    if (off) {
      const gone = await goes(p, () => !document.querySelector(".bulb.glint"));
      check("lights-out, FX off: the hinted bulb glints, still, then stops", !!g && /drop-shadow/.test(g.filter) && g.name === "none" && gone, { g, gone });
    } else check("lights-out, FX on: the hint still glints in motion", !!g && g.moving > 0, g);
    await done(p, "lights-out FX " + (off ? "off" : "on"));
  }

  // ---- Science Fair: the sun's face follows the game (a smile for a planet
  // got right, a grin for the whole tune, a gasp for a wrong one or a stall),
  // each going back to rest, with FX on or off; FX on bobs the sun as well.
  // And the rocket's dock is Earth, not the corner of the board.
  for (const off of [true, false]) {
    const p = await open("science-fair", off), tag = "science-fair, FX " + (off ? "off" : "on") + ": ";
    // every face it makes, in order (watched as they happen: fast() keeps them brief)
    const watchSun = () => p.evaluate(() => {
      const sun = document.getElementById("sun");
      window.__faces = [sun.getAttribute("data-face")]; window.__bobs = 0;
      if (window.__sunObs) return;
      window.__sunObs = new MutationObserver(() => {
        const f = sun.getAttribute("data-face");
        if (f !== window.__faces[window.__faces.length - 1]) window.__faces.push(f);
        if (sun.querySelector(".disc").getAnimations().length) window.__bobs++;
      });
      window.__sunObs.observe(sun, { attributes: true, attributeFilter: ["data-face", "class"] });
    });
    const seen = () => p.evaluate(() => ({ faces: window.__faces.join(" "), bobs: window.__bobs }));
    const input = () => p.waitForFunction(() => ScienceFair.state() === "input", null, { timeout: 8000 });
    const rest = () => p.waitForFunction(() => document.getElementById("sun").getAttribute("data-face") === "rest", null, { timeout: 8000 });
    // on Earth's shoulder: within a planet's width of its middle, and above it
    // (pressed, a planet has the rocket under it instead)
    const docked = () => p.waitForFunction(() => {
      const s = document.getElementById("ship").getBoundingClientRect(), e = ScienceFair.padRect(2);
      const dx = s.left + s.width / 2 - (e.left + e.width / 2), dy = s.top + s.height / 2 - (e.top + e.height / 2);
      return Math.hypot(dx, dy) < e.width && dy < 0;
    }, null, { timeout: 8000 }).then(() => true, () => false);

    const onMenu = await docked();
    await watchSun();
    await p.evaluate(() => { ScienceFair.fast(); ScienceFair.start("grand"); });
    // round 1: one planet, so getting it right is the whole tune
    await input();
    const atInput = await docked();
    await p.evaluate(() => ScienceFair.press(ScienceFair.seq()[0]));
    // round 2: a smile for the first planet, a grin for the second
    await input();
    const afterRound = await docked();
    await p.evaluate(() => ScienceFair.press(ScienceFair.seq()[0]));
    await rest();
    await p.evaluate(() => ScienceFair.press(ScienceFair.seq()[1]));
    // round 3: a wrong planet
    await input();
    await p.evaluate(() => ScienceFair.press((ScienceFair.seq()[0] + 1) % 9));
    await p.waitForFunction(() => ScienceFair.state() === "over", null, { timeout: 8000 });
    const run = await seen();
    check(tag + "the sun smiles at a planet got right, grins at the whole tune and gasps at a wrong one, back to rest each time",
      run.faces === "rest grin rest smile rest grin rest gasp rest", run);
    check(off ? tag + "the sun changes face without moving" : tag + "the sun bobs as its face changes", off ? run.bobs === 0 : run.bobs > 0, run);
    // a stall (no planet picked in time) is a gasp too
    await watchSun();
    await p.evaluate(() => ScienceFair.start("classic"));
    await p.waitForFunction(() => ScienceFair.state() === "over", null, { timeout: 15000 });
    const stall = await seen();
    check(tag + "a stall gets a gasp", stall.faces === "rest gasp rest", stall);
    check(tag + "the rocket's dock is Earth: on the menu, while it's your turn, and back there after a round", onMenu && atInput && afterRound, { onMenu, atInput, afterRound });
    await done(p, "science-fair FX " + (off ? "off" : "on"));
  }

  // ---- Departures: a name it doesn't know turns the box red; a new departure is lit
  {
    const p = await open("departures", true);
    await p.evaluate(() => Departures.start("world")); await p.waitForTimeout(400);
    const r = await p.evaluate(() => { Departures.enter("xyzzy"); return getComputedStyle(document.getElementById("answer")).color; });
    const rGone = await goes(p, () => !document.getElementById("answer").classList.contains("shake"));
    check("departures, FX off: a name it doesn't know turns the box red for a moment", r === "rgb(239, 106, 90)" && rGone, { r, rGone });
    const f = await p.evaluate(() => { Departures.enter("France"); const li = document.querySelector("#log li"); return li ? getComputedStyle(li.querySelector(".dest")).color : null; });
    const fGone = await goes(p, () => !document.querySelector("#log li.fresh"));
    check("departures, FX off: the newest departure is lit amber for a moment", f === "rgb(255, 201, 77)" && fGone, { f, fGone });
    await done(p, "departures");
  }

  // ---- 2048: with FX off the last move's merged key is ringed and its new key lit, until the next move
  for (const off of [true, false]) {
    const p = await open("2048", off, null, (pg) => lib.injectScript(pg, "games/2048/game.js", [["  newGame();\n})();",
      "  newGame();\n  window.__g = { clear: function () { tilesEl.innerHTML = ''; tiles = {}; for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) grid[r][c] = null; }, makeTile: makeTile, move: move };\n})();"]]));
    await p.evaluate(() => { __g.clear(); __g.makeTile(0, 0, 2, null); __g.makeTile(0, 1, 2, null); __g.move(0); });
    await p.waitForTimeout(off ? 100 : 400);
    const m = await probe(p, () => { const after = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e, "::after").content : null; }; return { merged: after(".tile-inner.is-merged"), fresh: after(".tile-inner.is-new") }; });
    if (off) check("2048, FX off: the merged key is ringed and the new key lit", m.merged === '""' && m.fresh === '""', m);
    else check("2048, FX on: no static marks (the pops show it)", m.merged !== '""' && m.fresh !== '""', m);
    await done(p, "2048 FX " + (off ? "off" : "on"));
  }

  // ---- Dots and Boxes: the last road built carries a pin, in both modes
  for (const off of [true, false]) {
    const p = await open("dots-and-boxes", off);
    await p.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); });
    await p.click("#startGame"); await p.waitForTimeout(300);
    await p.evaluate(() => play("h", 0, 0)); await p.waitForTimeout(off ? 50 : 1100);   // (FX on: past the CPU's reply at 350ms and its pin's fade-in)
    const pin = await p.evaluate(() => { const c = document.querySelectorAll("circle.last-mark"); return { n: c.length, op: c[0] && getComputedStyle(c[0]).opacity }; });
    check("dots-and-boxes, FX " + (off ? "off" : "on") + ": one pin marks the last road", pin.n === 1 && pin.op === "1", pin);
    await done(p, "dots-and-boxes FX " + (off ? "off" : "on"));
  }

  // ---- Link Many: the last disc carries a dot; with FX off a bomb leaves a scorch for a moment
  {
    const p = await open("link-many", true);
    await p.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); });
    await p.click("#startGame"); await p.waitForTimeout(300);
    await p.evaluate(() => __game.humanMove(3)); await p.waitForTimeout(150);
    const dot = await probe(p, () => { const c = document.querySelectorAll(".cell.last"); return { n: c.length, after: c[0] && getComputedStyle(c[0], "::after").content }; });
    check("link-many: the last disc carries a dot", dot.n === 1 && dot.after === '""', dot);
    await p.waitForFunction(() => !__game.busy, null, { timeout: 8000 });   // (the computer's reply is in)
    await p.evaluate(() => __game.usePower(1, "bomb", 3));
    // (the bomb sits lit for a beat before it blows)
    const sc = await p.waitForFunction(() => document.querySelectorAll(".cell.blasted").length, null, { timeout: 8000 }).then((h) => h.jsonValue(), () => 0);
    const scGone = (await goes(p, () => document.querySelectorAll(".cell.blasted").length === 0)) ? 0 : -1;
    check("link-many, FX off: a bomb scorches the cells it hit, then the scorch goes", sc > 0 && scGone === 0, { sc, scGone });
    await done(p, "link-many");
  }

  // ---- Hash: a claimed set stays in place, green, until the refill (no blank holes)
  {
    const p = await open("hash", true, null, (pg) => lib.injectScript(pg, "games/hash/game.js", [["  renderBest();\n  newGame();\n})();",
      "  renderBest();\n  newGame();\n  window.__h = { get board() { return board; }, findSet: findSet };\n})();"]]));
    const set = await p.evaluate(() => __h.findSet(__h.board));
    // the claimed trio is up from about 240 ms to 600 ms after the last click,
    // shorter than a frame or two on a busy machine: a watcher on the board
    // records it the moment it's there (polling could miss it altogether)
    await p.evaluate(() => {
      window.__trio = null;
      new MutationObserver(() => {
        const cs = [...document.querySelectorAll(".card.exit-right")];
        if (window.__trio || cs.length !== 3) return;
        window.__trio = cs.map((c) => { const s = getComputedStyle(c); return s.opacity + "|" + s.animationName + "|" + /52, 201, 138/.test(s.boxShadow); });
      }).observe(document.getElementById("board"), { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    });
    for (const i of set) await p.click('.card[data-idx="' + i + '"]');
    const cards = await p.waitForFunction(() => window.__trio, null, { timeout: 8000 }).then((h) => h.jsonValue(), () => []);
    check("hash, FX off: the claimed trio stays shown, green, until the refill", cards.length === 3 && cards.every((c) => c === "1|none|true"), cards);
    await done(p, "hash");
  }

  // ---- Minesweeper: a won board's flags sit on green (both modes)
  {
    const p = await open("minesweeper", true);
    const bg = await p.evaluate(() => { const f = document.querySelector(".field"); f.classList.add("won"); const c = f.querySelector(".c"); c.classList.add("flag"); return getComputedStyle(c).backgroundColor; });
    check("minesweeper: a won board's flags sit on green", bg === "rgb(159, 212, 159)", bg);
    await done(p, "minesweeper");
  }

  // ---- Jam Jar: a merge shows a ring, still with FX off; with FX on the
  // expanding ring now draws (it used to go NaN and never appear)
  for (const off of [true, false]) {
    const p = await open("jam-jar", off);
    await p.evaluate(() => { __game.reset(); __game.setQueue(0, 0); __game.setAim(270); __game.drop(); });
    // the twin goes in once the first has landed and the drop cooldown is over
    // (polled: on a busy machine the jar's clock runs slow)
    await p.waitForFunction(() => { const f = __game.fruits; if (f.length === 1 && f[0].contacted) { __game.setQueue(0, 0); __game.setAim(270); __game.drop(); } return __game.fruits.length !== 1; }, null, { timeout: 10000 }).catch(() => {});
    const ring = await p.evaluate((off) => new Promise((done) => {
      const t0 = performance.now();
      (function look() {
        const ps = __game.particles;
        const hit = off ? ps.find((q) => q.still) : ps.find((q) => q.ring && isFinite(q.x) && isFinite(q.y));
        if (hit || performance.now() - t0 > 10000) return done(hit ? { ok: true } : { ok: false, n: ps.length, fruits: __game.fruits.length });
        requestAnimationFrame(look);
      })();
    }), off);
    check("jam-jar, FX " + (off ? "off: a merge gets a still ring" : "on: the merge ring draws (finite position)"), ring.ok, ring);
    await done(p, "jam-jar FX " + (off ? "off" : "on"));
  }

  // ---- Yi: with FX off a CPU that draws shows "+n" by its count (cards don't fly)
  for (const off of [true, false]) {
    const p = await open("yi", off);
    await p.click("#startBtn"); await p.waitForTimeout(400);
    const b = await p.evaluate(() => { G.drew = {}; drawCards(1, 2); render(); const e = document.querySelector(".opp .ocount .drew"); return e ? { text: e.textContent, display: getComputedStyle(e).display } : null; });
    if (off) check("yi, FX off: a CPU's draw shows +n by its count", !!b && b.text === "+2" && b.display !== "none", b);
    else check("yi, FX on: the +n badge stays hidden (the cards fly)", !!b && b.display === "none", b);
    await done(p, "yi FX " + (off ? "off" : "on"));
  }

  // ---- canvas games: what the last frame drew, through each game's hook
  const frames = (p, n) => p.evaluate((n) => new Promise((r) => { let k = 0; (function f() { if (++k >= n) r(); else requestAnimationFrame(f); })(); }), n || 3);
  for (const off of [true, false]) {
    const mode = off ? "off" : "on";

    // Fish-a-Fish: a bite about to get away is ringed — steady and dashed with FX off
    let p = await open("fish-a-fish", off);
    await p.evaluate(() => { FishAFish.start(); FishAFish.hold(); FishAFish.force(0, "perch", "bite", 0.3); });
    await frames(p);
    const fw = await p.evaluate(() => FishAFish.cues().escapeWarn);
    check("fish-a-fish, FX " + mode + ": " + (off ? "the escape warning is drawn steadily" : "no steady ring (it blinks)"), off ? fw.indexOf(0) >= 0 : fw.length === 0, fw);
    await done(p, "fish-a-fish FX " + mode);

    // Neon Pinball: the skill lane is outlined steadily with FX off, flashes with FX on; the hint says which
    p = await open("neon-pinball", off);
    await p.evaluate(() => NeonPinball.start("classic")); await p.waitForTimeout(200);
    const hint = await p.evaluate(() => document.getElementById("flipHint").textContent);
    await p.evaluate(() => NeonPinball.launchNow());
    const lanes = [];
    for (let i = 0; i < 10; i++) { await p.waitForTimeout(110); lanes.push(await p.evaluate(() => NeonPinball.state().skillDrawn)); }
    if (off) check("neon-pinball, FX off: the skill lane is drawn steadily, and the hint says outlined", lanes.filter(Boolean).length >= 3 && lanes.filter(Boolean).every((l) => /^steady/.test(l)) && /outlined/.test(hint), { lanes, hint });
    else check("neon-pinball, FX on: the skill lane flashes, and the hint says flashing", lanes.some((l) => /^flash-on/.test(l)) && /flashing/.test(hint), { lanes, hint });
    await done(p, "neon-pinball FX " + mode);

    // Spacer: a protected ship holds at half opacity with FX off, flickers with FX on
    p = await open("spacer", off);
    await p.evaluate(() => { game.startGame(); }); await p.waitForTimeout(300);
    await p.evaluate(() => { game.player.invuln = 5; }); await frames(p);
    const inv = await p.evaluate(() => game.player.invulnCue);
    check("spacer, FX " + mode + ": respawn protection shows " + (off ? "steadily" : "as a flicker"), inv === (off ? "steady" : "flicker"), inv);
    await done(p, "spacer FX " + mode);

    // Abyss: a hard drop leaves a streak and a clear marks its rows at the walls (FX off only)
    p = await open("abyss", off);
    await p.evaluate(() => { Abyss.start("descent"); Abyss.test.setGrav(100000); Abyss.test.fill(19, [0, 1, 2, 7, 8, 9]); Abyss.test.setPiece("I"); Abyss.hard(); });
    await frames(p, 2);
    const mk = await p.evaluate(() => Abyss.test.marks());
    // (a drop that clears ends its streak at the collapse, 80ms on: the streak is read on one that doesn't)
    await p.waitForTimeout(250);   // past the clear's 80ms pause, which ignores a drop
    await p.evaluate(() => { Abyss.test.setPiece("T"); Abyss.hard(); });
    await frames(p, 2);
    const mk2 = await p.evaluate(() => Abyss.test.marks());
    if (off) check("abyss, FX off: a hard drop leaves a streak and a cleared row is marked at the walls", mk2.dropDrawn === true && JSON.stringify(mk.clearDrawn) === "[19]", { mk, mk2 });
    else check("abyss, FX on: no static marks (the sweep shows it)", !mk.dropDrawn && !mk2.dropDrawn && !(mk.clearDrawn || []).length, { mk, mk2 });
    await done(p, "abyss FX " + mode);
  }

  // Ping: the scorer's antenna stays lit (no blink) with FX off
  {
    const p = await open("ping", true);
    await p.evaluate(() => __game.afterPoint(-1));
    const a = await probe(p, () => { const e = document.querySelector(".antenna.flash-l"); if (!e) return null; const cs = getComputedStyle(e, "::before"); return { name: cs.animationName, filter: cs.filter }; });
    check("ping, FX off: the scorer's antenna holds lit", !!a && a.name === "none" && /drop-shadow/.test(a.filter), a);
    await done(p, "ping");
  }

  // Salvo: the last shot at each grid is framed (both modes)
  {
    const p = await open("salvo", true);
    await p.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); });
    await p.keyboard.press("a"); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
    // A hit lets you fire again, and only a miss brings the computer's reply:
    // fire down the grid until one does (polled, so a slow reply still counts)
    for (let i = 0; i < 20; i++) {
      const before = await p.evaluate(() => document.getElementById("status").textContent);
      await p.locator("#enemyGrid .cell").nth(i).click();
      const replied = await p.waitForFunction((before) => document.querySelector("#playerGrid .cell.last") ||
        (/again/i.test(document.getElementById("status").textContent) && document.getElementById("status").textContent !== before), before, { timeout: 10000 }).then(() => true, () => false);
      if (!replied || await p.evaluate(() => !!document.querySelector("#playerGrid .cell.last"))) break;
    }
    const s = await p.evaluate(() => ["#enemyGrid", "#playerGrid"].map((g) => { const c = document.querySelector(g + " .cell.last"); return c ? getComputedStyle(c).outlineStyle : null; }));
    check("salvo: the last shot at each grid is framed", s[0] === "dashed" && s[1] === "dashed", s);
    await done(p, "salvo");
  }

  // poll a page condition (a canvas game's state) for up to ms
  const until = (p, fn, ms) => p.evaluate(([src, ms]) => new Promise((done) => {
    const f = new Function("return (" + src + ")()"), t0 = performance.now();
    (function look() { const v = f(); if (v || performance.now() - t0 > ms) done(v); else requestAnimationFrame(look); })();
  }), [String(fn), ms || 3000]);

  // ---- Quick Minute: a milestone gets a banner (it was sound only)
  {
    const p = await open("quick-minute", true);
    await p.evaluate(() => { __game.start("day"); }); await p.waitForTimeout(300);
    await p.evaluate(() => __game.addScore(500));
    const m = await until(p, () => { const e = document.getElementById("milestone"); return e && e.classList.contains("show") && { text: e.textContent, op: getComputedStyle(e).opacity, name: getComputedStyle(e).animationName }; });
    await p.waitForTimeout(1500);
    const gone = await p.evaluate(() => !document.getElementById("milestone").classList.contains("show"));
    check("quick-minute, FX off: a milestone shows a still banner, then it goes", !!m && /500/.test(m.text) && m.op === "1" && m.name === "none" && gone, { m, gone });
    await done(p, "quick-minute");
  }

  // ---- Steamfitter: a spill leaves a puddle (it had no visual with FX off)
  {
    const p = await open("steamfitter", true);
    await p.evaluate(() => { __game.setMode("panic"); __game.startNow(); });
    const spill = await until(p, () => __game.spillAt, 8000);
    check("steamfitter, FX off: a spill is marked where it happened", !!spill && isFinite(spill.x) && isFinite(spill.y), spill);
    await done(p, "steamfitter");
  }

  // ---- Tall Order: "perfect!" shows with FX off (pop() used to return early)
  {
    const p = await open("tall-order", true);
    await p.evaluate(() => TallOrder.start("bakery"));
    await until(p, () => TallOrder.sliderReady(), 4000);
    await p.evaluate(() => TallOrder.placeAndDrop(0));
    const pops = await until(p, () => { const ps = TallOrder.pops(); return ps.length && ps; }, 3000);
    check("tall-order, FX off: a perfect drop says perfect!", !!pops && pops.some((x) => /perfect/i.test(x.text)), pops);
    await done(p, "tall-order");
  }

  // ---- Click Tap: the pad shows it's pressed (it didn't, in either mode)
  {
    const p = await open("click-tap", true);
    await p.click("#startBtn"); await p.waitForTimeout(300);
    const rim = await p.evaluate(() => {
      const pad = document.getElementById("pad"), r = pad.getBoundingClientRect();
      pad.dispatchEvent(new PointerEvent("pointerdown", { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true }));
      return { pressed: pad.classList.contains("pressed"), shadow: getComputedStyle(pad).boxShadow };
    });
    check("click-tap: a press darkens the pad's rim", rim.pressed && /inset/.test(rim.shadow), rim);
    await done(p, "click-tap");
  }

  // ---- Darkroom: a wrong cell flashes red (still) and +0:30 shows, with FX off
  // (served with the flash and the +0:30 lasting 5s, not 0.45s and 1.1s: on a
  // busy machine three frames can take longer than either, and a cue already
  // gone by then proves nothing)
  {
    const p = await open("darkroom", true, null, (pg) => lib.injectScript(pg, "games/darkroom/game.js",
      [["(t - F.t0) / 450", "(t - F.t0) / 5000"], ["(t - FL.t0) / 1100", "(t - FL.t0) / 5000"]]));
    const r = await p.evaluate(() => { Darkroom.open("plus"); return Darkroom.apply(0, 0, "fill"); });
    await frames(p);
    const st = await p.evaluate(() => { const s = Darkroom.state(); return { flashes: s.flashes, floats: s.floats }; });
    check("darkroom, FX off: a wrong cell shows its red tint and the +0:30", r === "fog" && st.flashes === 1 && st.floats === 1, { r, st });
    await done(p, "darkroom");
  }

  // ---- Klondike: with FX off a moved card wears a gold rim where it lands
  {
    const p = await open("klondike", true);
    await p.evaluate(() => { Klondike.almostWin(); }); await p.waitForTimeout(200);
    const k = await p.evaluate(() => { Klondike.move("t0", "f0", 1); const c = document.querySelector('.card[data-key="0-13"]'); return c && { landed: c.classList.contains("landed"), gold: /233, 182, 64/.test(getComputedStyle(c).boxShadow) }; });
    const gone = await goes(p, () => !document.querySelector('.card[data-key="0-13"]').classList.contains("landed"));
    check("klondike, FX off: a card that moves is rimmed gold where it lands, briefly", !!k && k.landed && k.gold && gone, { k, gone });
    await done(p, "klondike");
  }

  // ---- Tile Maze: an ice slide leaves a trail (FX off); a wall shows a bump bar
  // (served with both marks lasting 5s, not 0.5s, for the same reason as Darkroom)
  {
    const p = await open("tile-maze", true, null, async (pg) => {
      await pg.addInitScript(() => { try { localStorage.setItem("tileMaze.v1", '{"unlocked":3}'); } catch (e) {} });
      await lib.injectScript(pg, "games/tile-maze/anim.js", [["const MARK = 500;", "const MARK = 5000;"]]);
    });
    await p.keyboard.press("ArrowRight");
    const t = await probe(p, () => [1, 2, 3, 4, 5].map((c) => { const e = document.querySelector('.tile[data-r="1"][data-c="' + c + '"]'); return e ? getComputedStyle(e).outlineStyle : null; }));
    check("tile-maze, FX off: an ice slide leaves a dashed trail over the tiles it crossed", t.filter((s) => s === "dashed").length >= 4, t);
    await p.waitForTimeout(150);
    const bar = await p.evaluate(() => { const pl = document.getElementById("player"); const cs = getComputedStyle(pl, "::after"); return { bump: pl.dataset.bump, w: parseFloat(cs.width), h: parseFloat(cs.height) }; });
    check("tile-maze: stopping at a wall shows a bump bar on that side", bar.bump === "right" && bar.w > 0 && bar.h > 0, bar);
    await done(p, "tile-maze");
  }

  await ctx.close();
};
