// Mahjong: Enter on a focused mode button only picks the mode, and a mode
// clicked with the mouse doesn't take over the run Enter then starts (a
// Classic deal used to be recorded as the Daily); Ctrl+Z does nothing while
// paused; a reshuffle drops the old selection, and one that can't re-deal
// costs nothing and points at Undo, and so does the no-pairs nudge when no
// reshuffle can fit, which also offers New deal (and on the Daily, giving
// up), asking first; the keycaps hide on a phone. Five layouts, each a valid
// board of 144 tiles, picked on the menu with the arrows; each deals the full
// set, can be cleared, fits the screen and keeps its own fastest clear; the
// Daily is always the turtle; the games page's reset clears every layout's.
// Animations (an option on the menu, A): a deal's tiles drop in from above, a
// matched pair comes together and is gone, a shuffle's tiles travel from where
// their faces lay; with Visual FX off the three are told by fading; a press, a
// pause or the switch lands whatever is on its way; each pair takes a second
// off the clock, never below zero. With Animations off, none of it.
const HOOK = ["    toMenu: toMenu\n  };\n})();", `    toMenu: toMenu,
    pos: function () { return pos; },
    setLive: function (a, k) { live = new Set(a); if (k) a.forEach(function (i, j) { kinds[i] = k[j]; }); undoStack = [[0, 1]]; selected = -1; buildBoard(); hud(); },
    nudge: function () { hint(true); }
  };
})();`];

module.exports = async ({ browser, base, check, lib }) => {
  // (the checks of the rules run with Animations off, the game as it was:
  // nothing is on its way, and a desk cleared in no time keeps a time. `moving`
  // leaves it on; `more` are further edits to the served script; `off` opens
  // with Visual FX off.)
  const STILL = () => { try { localStorage.setItem("mahjong_anim", "0"); } catch (e) {} };
  const FX_OFF = () => { try { localStorage.setItem("reduceMotion:mahjong", "1"); } catch (e) {} };
  const open = (ctx, moving, more, off) => lib.open(ctx, base, "games/mahjong/", { before: async (pg) => {
    if (!moving) await pg.addInitScript(STILL);
    if (off) await pg.addInitScript(FX_OFF);
    await lib.injectScript(pg, "games/mahjong/game.js", [HOOK].concat(more || []));
  } });
  const done = async (p, what) => { check("mahjong " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  // clear the desk by free pairs (reshuffling when stuck)
  const clearDesk = (p) => p.evaluate(() => { for (let n = 0; n < 500 && Mahjong.tilesLeft(); n++) if (!Mahjong.removeOnePair()) Mahjong.shuffleNow(); return Mahjong.tilesLeft(); });
  let ctx = await lib.newContext(browser);

  // ---- Enter on a focused mode button picks that mode and starts nothing
  let p = await open(ctx);
  await p.keyboard.press("1");
  await p.evaluate(() => document.querySelector('#pick-mode button[data-v="daily"]').focus());
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const menu = await p.evaluate(() => ({ state: Mahjong.state(), mode: localStorage.getItem("mahjong_mode") }));
  check("mahjong: Enter on the focused Daily button picks it, without dealing a Classic turtle", menu.state === "menu" && menu.mode === "daily", menu);
  await done(p, "menu Enter");

  // ---- Daily clicked, then Classic picked by key: the deal Enter starts is a
  // Classic one all the way to its record
  p = await open(ctx);
  await p.click('#pick-mode button[data-v="daily"]');
  await p.keyboard.press("1");
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const started = await p.evaluate(() => Mahjong.state());
  const left = started === "play" ? await clearDesk(p) : -1;
  await p.waitForTimeout(100);
  const rec = await p.evaluate(() => ({ state: Mahjong.state(), daily: Mahjong.daily().done, classic: localStorage.getItem("mahjong_best_classic") }));
  check("mahjong: after clicking Daily then pressing 1, Enter deals a Classic turtle, recorded as Classic and not as today's Daily",
    started === "play" && left === 0 && rec.state === "over" && !rec.daily && Number(rec.classic) > 0, Object.assign({ started, left }, rec));
  await done(p, "mouse then Enter");

  // ---- paused, Ctrl+Z takes nothing back; resumed, it does
  p = await open(ctx);
  await p.evaluate(() => { Mahjong.start("classic"); Mahjong.removeOnePair(); });
  const t0 = await p.evaluate(() => Mahjong.tilesLeft());
  await p.keyboard.press("p"); await p.waitForTimeout(80);
  await p.keyboard.press("Control+z"); await p.waitForTimeout(80);
  const paused = await p.evaluate(() => Mahjong.tilesLeft());
  await p.keyboard.press("p"); await p.waitForTimeout(80);
  await p.keyboard.press("Control+z"); await p.waitForTimeout(80);
  const resumed = await p.evaluate(() => Mahjong.tilesLeft());
  check("mahjong: Ctrl+Z while paused takes nothing back; after resuming it undoes", t0 === 142 && paused === 142 && resumed === 144, { t0, paused, resumed });

  // ---- a reshuffle drops the selection along with the old faces
  await p.evaluate(() => Mahjong.click(Mahjong.freeIdx()[0]));
  const selBefore = await p.evaluate(() => document.querySelectorAll(".tile.sel").length);
  await p.keyboard.press("s"); await p.waitForTimeout(80);
  const selAfter = await p.evaluate(() => document.querySelectorAll(".tile.sel").length);
  check("mahjong: a reshuffle leaves no tile looking selected", selBefore === 1 && selAfter === 0, { selBefore, selAfter });

  // ---- a reshuffle that can't re-deal (only the four-high stack under the
  // apex left) charges nothing, says so and points at Undo
  const stack = await p.evaluate(() => Mahjong.pos().map((q, i) => (q[0] === 12 && q[1] === 6 ? i : -1)).filter((i) => i >= 0));
  await p.evaluate((s) => Mahjong.setLive(s), stack);
  const before = await p.evaluate(() => ({ t: Mahjong.timeNow(), board: Mahjong.boardHash() }));
  await p.keyboard.press("s"); await p.waitForTimeout(80);
  const after = await p.evaluate(() => ({ t: Mahjong.timeNow(), board: Mahjong.boardHash(), note: document.getElementById("hud-pairs").textContent, undo: document.getElementById("btn-undo").style.outline }));
  check("mahjong: a reshuffle that can't re-deal adds no time, says so and points at Undo",
    stack.length === 4 && after.board === before.board && after.t - before.t < 2000 && /undo/i.test(after.note) && /solid/.test(after.undo), { before, after });
  await done(p, "pause and shuffle");

  // ---- the no-pairs nudge points the way on: at Undo when no reshuffle can
  // fit what's left (the four-high stack), at Shuffle when one can (a row of
  // four whose free ends don't match)
  const nudge = async (where, k) => {
    const pg = await open(ctx);
    await pg.evaluate(() => Mahjong.start("classic"));
    const idx = await pg.evaluate((where) => Mahjong.pos().map((q, i) => (where === "stack" ? q[0] === 12 && q[1] === 6 : q[1] === 0 && q[2] === 0 && q[0] >= 2 && q[0] <= 8) ? i : -1).filter((i) => i >= 0), where);
    await pg.evaluate((a) => { Mahjong.setLive(a[0], a[1]); Mahjong.nudge(); }, [idx, k]);
    const r = await pg.evaluate(() => ({ undo: document.getElementById("btn-undo").style.outline, shuffle: document.getElementById("btn-shuffle").style.outline, note: document.getElementById("hud-pairs").textContent, pairs: Mahjong.freePairsCount() }));
    await done(pg, "nudge " + where);
    return Object.assign({ n: idx.length }, r);
  };
  const dead = await nudge("stack", ["d1", "d2", "d1", "d2"]);
  check("mahjong: with no pairs and no reshuffle that fits, the nudge says so and points at Undo, not Shuffle",
    dead.n === 4 && dead.pairs === 0 && /solid/.test(dead.undo) && !dead.shuffle && /undo/i.test(dead.note), dead);
  const row = await nudge("row", ["d1", "d2", "d1", "d2"]);
  check("mahjong: with no pairs but a reshuffle that fits, the nudge still points at Shuffle (guard)",
    row.n === 4 && row.pairs === 0 && /solid/.test(row.shuffle) && !row.undo, row);

  // ---- a dead board (no pairs, no reshuffle fits) offers a way out after
  // Undo: New deal (asking first), and on the Daily, giving up (asking first,
  // recording nothing: the Daily keeps only a clear)
  const stuck = async (mode) => {
    const pg = await open(ctx);
    await pg.evaluate((m) => Mahjong.start(m), mode);
    const idx = await pg.evaluate(() => Mahjong.pos().map((q, i) => (q[0] === 12 && q[1] === 6 ? i : -1)).filter((i) => i >= 0));
    await pg.evaluate((a) => { Mahjong.setLive(a, ["d1", "d2", "d1", "d2"]); Mahjong.nudge(); }, idx);
    const bar = await pg.evaluate(() => {
      const shown = (id) => { const e = document.getElementById(id); return !!e && !!e.offsetParent; };
      return { note: document.getElementById("hud-pairs").textContent, deal: shown("btn-newdeal"), giveUp: shown("btn-giveup") };
    });
    return { pg, bar };
  };
  const ask = (pg) => pg.evaluate(() => (document.querySelector(".gs-dialog h2") || {}).textContent || null);
  // Classic: Undo first, then New deal; Esc on its ask keeps the board, Enter deals afresh
  let s = await stuck("classic");
  await s.pg.evaluate(() => document.getElementById("btn-newdeal") && document.getElementById("btn-newdeal").click());
  const dealAsk = await ask(s.pg);
  await s.pg.keyboard.press("Escape"); await s.pg.waitForTimeout(80);
  const keptN = await s.pg.evaluate(() => Mahjong.tilesLeft());
  await s.pg.evaluate(() => document.getElementById("btn-newdeal") && document.getElementById("btn-newdeal").click());
  await s.pg.keyboard.press("Enter"); await s.pg.waitForTimeout(150);
  const dealt = await s.pg.evaluate(() => ({ state: Mahjong.state(), left: Mahjong.tilesLeft(), bar: !!(document.getElementById("hud-stuck") || {}).offsetParent }));
  check("mahjong: a dead Classic board says undo a pair, or New deal; New deal asks \"Start a new game?\", Esc keeps the board, Enter deals a fresh turtle",
    /undo a pair/.test(s.bar.note) && s.bar.deal && !s.bar.giveUp && dealAsk === "Start a new game?" && keptN === 4 && dealt.state === "play" && dealt.left === 144 && !dealt.bar && s.pg.leaves === 0,
    { bar: s.bar, dealAsk, keptN, dealt });
  await done(s.pg, "dead classic");
  // Undo takes the way-out bar away again
  s = await stuck("classic");
  await s.pg.evaluate(() => Mahjong.undoNow());
  const afterUndo = await s.pg.evaluate(() => ({ bar: !!(document.getElementById("hud-stuck") || {}).offsetParent, note: document.getElementById("hud-pairs").textContent }));
  check("mahjong: after Undo on a dead board, the way-out actions go and the pairs count is back",
    s.bar.deal && !afterUndo.bar && /pairs open/.test(afterUndo.note), { before: s.bar, afterUndo });
  await done(s.pg, "dead undo");
  // Daily: New deal is today's turtle again, so it asks "Start over?" (Esc keeps
  // the board); give up asks "Quit this game?", Enter goes to the menu and records nothing
  s = await stuck("daily");
  await s.pg.evaluate(() => document.getElementById("btn-newdeal").click());
  const again = await s.pg.evaluate(() => ({ title: (document.querySelector(".gs-dialog h2") || {}).textContent || null, text: (document.querySelector(".gs-dialog p") || {}).textContent || "", ok: [...document.querySelectorAll(".gs-dialog button")].map((b) => b.textContent).join("|") }));
  await s.pg.keyboard.press("Escape"); await s.pg.waitForTimeout(80);
  check("mahjong: on a dead Daily, New deal asks \"Start over?\", saying today's turtle is dealt again from the start",
    again.title === "Start over?" && /dealt again, from the start/.test(again.text) && /Start over/.test(again.ok) && (await s.pg.evaluate(() => Mahjong.tilesLeft())) === 4, again);
  await s.pg.evaluate(() => document.getElementById("btn-giveup") && document.getElementById("btn-giveup").click());
  const quitAsk = await ask(s.pg);
  await s.pg.keyboard.press("Enter"); await s.pg.waitForTimeout(150);
  const gaveUp = await s.pg.evaluate(() => ({ state: Mahjong.state(), done: Mahjong.daily().done, stored: localStorage.getItem("mahjong_daily") }));
  check("mahjong: a dead Daily also offers Daily: give up, which asks \"Quit this game?\" and goes to the menu, recording nothing",
    s.bar.deal && s.bar.giveUp && quitAsk === "Quit this game?" && gaveUp.state === "menu" && !gaveUp.done && gaveUp.stored === null && s.pg.leaves === 0,
    { bar: s.bar, quitAsk, gaveUp });
  await done(s.pg, "dead daily");
  await ctx.close();

  // ---- the layouts: five boards of 144 tiles in one footprint, nothing
  // overlapping on a layer, every raised tile held up by the layer under it
  ctx = await lib.newContext(browser);
  p = await open(ctx);
  const lays = await p.evaluate(() => (Mahjong.layouts ? Mahjong.layouts() : []).map((l) => {
    const P = l.pos, bad = [];
    const over = (a, b) => Math.abs(a[0] - b[0]) < 2 && Math.abs(a[1] - b[1]) < 2;
    P.forEach((t, i) => {
      if (t[0] < 0 || t[0] > 28 || t[1] < 0 || t[1] > 14 || t[2] < 0 || t[2] > 4) bad.push("outside " + t);
      P.forEach((q, j) => { if (j > i && q[2] === t[2] && over(t, q)) bad.push("overlap " + t + " and " + q); });
      // (each quarter of a raised tile rests on a tile one layer down)
      if (t[2] > 0) for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
        const cx = t[0] + dx, cy = t[1] + dy;
        if (!P.some((q) => q[2] === t[2] - 1 && cx >= q[0] && cx < q[0] + 2 && cy >= q[1] && cy < q[1] + 2)) bad.push("unheld " + t);
      }
    });
    return { id: l.id, name: l.name, best: l.best, n: P.length, bad: bad.slice(0, 4) };
  }));
  check("mahjong: five layouts (the turtle first, its fastest clear under the old name), each 144 tiles inside the turtle's footprint, none overlapping, every raised tile resting wholly on the layer under it",
    lays.length === 5 && lays[0].id === "turtle" && lays[0].best === "mahjong_best_classic" && new Set(lays.map((l) => l.id)).size === 5 && new Set(lays.map((l) => l.best)).size === 5 &&
    lays.every((l) => l.n === 144 && l.bad.length === 0), lays);

  // ---- the menu's arrows pick the layout (the arrow keys, shown on them, round
  // and round); the name, the picture, the deal button and the fastest clear follow
  const menuNow = () => p.evaluate(() => {
    const cv = document.getElementById("lay-pic"), t = (id) => (document.getElementById(id) || {}).textContent || "";
    let ink = 0, sum = 0;
    if (cv) { const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) { ink++; sum = (sum + i * 7) % 1000003; } }
    const cap = (id) => { const b = document.getElementById(id); return b ? b.getAttribute("data-gs-key") : null; };
    return { name: t("lay-name"), note: t("lay-note"), play: t("play-what"), bests: t("bests"), stored: localStorage.getItem("mahjong_layout"), ink, sum,
      caps: [cap("lay-prev"), cap("lay-next")], off: [...document.querySelectorAll("#pick-layout button")].map((b) => b.disabled) };
  });
  const pick = async (name) => { for (let i = 0; i < 6 && (await menuNow()).name !== name; i++) { await p.keyboard.press("ArrowRight"); await p.waitForTimeout(40); } };
  const seen = [await menuNow()];
  for (let i = 0; i < 5; i++) { await p.keyboard.press("ArrowRight"); await p.waitForTimeout(60); seen.push(await menuNow()); }
  await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(60);
  const back = await menuNow();
  if (await p.$("#lay-next")) await p.click("#lay-next");
  await p.waitForTimeout(60);
  const clicked = await menuNow();
  check("mahjong: on the menu the right and left arrow keys (shown on the two arrows) go through the layouts, round and round, and a click on an arrow does too; the pick is remembered",
    seen.map((s) => s.name).join() === "Turtle,Fortress,Pyramid,Cross,Twin Peaks,Turtle" && seen[0].caps.join() === "←,→" && seen[1].stored === "fortress" &&
    back.name === "Twin Peaks" && clicked.name === "Turtle" && clicked.stored === "turtle", { names: seen.map((s) => s.name), caps: seen[0].caps, back: back.name, clicked: [clicked.name, clicked.stored] });
  check("mahjong: each layout shows its own picture, its name on the deal button, and its place among the five",
    new Set(seen.slice(0, 5).map((s) => s.sum)).size === 5 && seen.slice(0, 5).every((s, i) => s.ink > 300 && s.play === "Deal the " + s.name.toLowerCase() && s.note === "layout " + (i + 1) + " of 5"),
    seen.map((s) => [s.name, s.ink, s.sum, s.play, s.note]));

  // ---- each layout deals its own 144 tiles (the full set, all on the screen),
  // can be cleared, and keeps its own fastest clear
  for (const l of lays) {
    await p.evaluate(() => Mahjong.toMenu());
    await pick(l.name);
    await p.keyboard.press("Enter"); await p.waitForTimeout(450);
    const dealt = await p.evaluate((id) => {
      const want = Mahjong.layouts().find((x) => x.id === id).pos, c = Mahjong.kindCounts(), kinds = Object.keys(c);
      const honours = (k) => k[0] === "f" || k[0] === "s";
      const tiles = [...document.querySelectorAll("#board .tile")].map((e) => e.getBoundingClientRect());
      return { layout: Mahjong.layout(), left: Mahjong.tilesLeft(), same: JSON.stringify(want) === JSON.stringify(Mahjong.pos()), pairs: Mahjong.freePairsCount(),
        set: kinds.length === 42 && kinds.every((k) => c[k] === (honours(k) ? 1 : 4)), onBoard: tiles.length,
        inside: tiles.every((r) => r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight) };
    }, l.id);
    // (cleared by taking any free pair, shuffling when stuck: a deal that way can
    // end on a board no shuffle fits, so a few deals are tried)
    let left = -1;
    for (let n = 0; n < 4 && left !== 0; n++) {
      if (n) { await p.evaluate(() => Mahjong.start("classic")); await p.waitForTimeout(450); }
      left = await clearDesk(p);
    }
    await p.waitForTimeout(80);
    const end = await p.evaluate((key) => ({ state: Mahjong.state(), best: Number(localStorage.getItem(key)), keys: Object.keys(localStorage).filter((k) => /^mahjong_best_/.test(k)).sort().join() }), l.best);
    const want = lays.slice(0, lays.indexOf(l) + 1).map((x) => x.best).sort().join();
    check("mahjong, " + l.name + ": Enter deals it, 144 tiles in its own places, the full set of faces, all on the screen, with pairs to take",
      dealt.layout === l.id && dealt.left === 144 && dealt.same && dealt.set && dealt.onBoard === 144 && dealt.inside && dealt.pairs > 0, dealt);
    check("mahjong, " + l.name + ": the desk can be cleared, and its fastest clear is kept under its own name", left === 0 && end.state === "over" && end.best > 0 && end.keys === want, { left, end, want });
  }
  await p.evaluate(() => Mahjong.toMenu());
  const afterAll = [await menuNow()];
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(60);
  afterAll.push(await menuNow());
  check("mahjong: the menu shows the picked layout's own fastest clear", /^fastest twin peaks clear: \d+:\d\d$/.test(afterAll[0].bests) && /^fastest turtle clear: \d+:\d\d$/.test(afterAll[1].bests), afterAll.map((s) => s.bests));

  // ---- the Daily is always the turtle: the arrows are off there, and the
  // layout picked for Classic is still picked afterwards
  await pick("Fortress");
  await p.keyboard.press("2"); await p.waitForTimeout(60);
  const onDaily = await menuNow();
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(60);
  const onDaily2 = await menuNow();
  await p.keyboard.press("Enter"); await p.waitForTimeout(200);
  const dailyDeal = await p.evaluate(() => ({ layout: Mahjong.layout ? Mahjong.layout() : null, left: Mahjong.tilesLeft() }));
  await p.evaluate(() => Mahjong.toMenu());
  await p.keyboard.press("1"); await p.waitForTimeout(60);
  const onClassic = await menuNow();
  check("mahjong: the Daily is always the turtle: with the Fortress picked it shows the turtle with the arrows off (the arrow key changes nothing) and deals the turtle; back on Classic the Fortress is still picked",
    onDaily.name === "Turtle" && /Daily/.test(onDaily.note) && onDaily.off.length === 2 && onDaily.off.every(Boolean) && onDaily.play === "Deal the turtle" && onDaily2.name === "Turtle" && onDaily2.stored === "fortress" &&
    dailyDeal.layout === "turtle" && dailyDeal.left === 144 && onClassic.name === "Fortress" && !onClassic.off.some(Boolean),
    { onDaily: [onDaily.name, onDaily.note, onDaily.off, onDaily.play], onDaily2: [onDaily2.name, onDaily2.stored], dailyDeal, onClassic: [onClassic.name, onClassic.off] });
  await done(p, "layouts");

  // ---- the games page's reset clears every layout's fastest clear, and leaves the picked layout alone
  {
    const hub = await lib.open(ctx, base, "games/", { waitCorner: false, before: (pg) => pg.addInitScript(() => {
      try { ["mahjong_best_classic", "mahjong_best_fortress", "mahjong_best_peaks"].forEach((k) => localStorage.setItem(k, "90000")); localStorage.setItem("mahjong_layout", "fortress"); } catch (e) {}
    }) });
    const keys = () => hub.evaluate(() => Object.keys(localStorage).filter((k) => /^mahjong_/.test(k)).sort().join());
    const had = await keys();
    await hub.click("#reset-scores"); await hub.waitForTimeout(150);
    await hub.keyboard.press("Enter"); await hub.waitForTimeout(250);
    const kept = await keys();
    check("mahjong: the games page's reset clears every layout's fastest clear and keeps the picked layout", had === "mahjong_best_classic,mahjong_best_fortress,mahjong_best_peaks,mahjong_layout" && kept === "mahjong_layout", { had, kept });
    await hub.close();
  }
  await ctx.close();

  // ---- Animations: an option on the menu (A, shown on it), on to begin with, remembered
  ctx = await lib.newContext(browser);
  p = await open(ctx, true);
  const opt = () => p.evaluate(() => {
    const b = document.getElementById("opt-anim");
    return b && { text: b.textContent.replace(/\s+/g, " ").trim(), cap: b.getAttribute("data-gs-key"), pressed: b.getAttribute("aria-pressed"), stored: localStorage.getItem("mahjong_anim"), on: Mahjong.anim ? Mahjong.anim() : null };
  });
  const o0 = await opt();
  await p.keyboard.press("a"); await p.waitForTimeout(60);
  const o1 = await opt();
  if (o0) await p.click("#opt-anim");
  await p.waitForTimeout(60);
  const o2 = await opt();
  check("mahjong: Animations is an option on the menu, on to begin with (1s off each pair); A, shown on it, or a click turns it off and on, and the choice is kept",
    !!o0 && o0.on && o0.pressed === "true" && o0.cap === "A" && /Animations: on/.test(o0.text) && /1s off each pair/.test(o0.text) &&
    !o1.on && o1.stored === "0" && o1.pressed === "false" && /Animations: off/.test(o1.text) && /no time off/.test(o1.text) && o2.on && o2.stored === "1", { o0, o1, o2 });

  // ---- a deal drops in (Visual FX on): every tile starts above the screen and
  // falls to its place, the bottom layer first; no clock runs meanwhile
  const drop = await p.evaluate(() => new Promise((res) => {
    const t0 = performance.now(), going = () => !!(Mahjong.dealing && Mahjong.dealing());
    const tiles = () => [...document.querySelectorAll("#board .tile")], z = (e) => Math.floor(+e.style.zIndex / 1000);
    document.getElementById("play").click();
    const first = { dealing: going(), n: tiles().length, above: tiles().filter((e) => e.getBoundingClientRect().bottom <= 0).length, flying: tiles().filter((e) => e.getAnimations().length === 1).length };
    let mid = null;
    (function tick() {
      const ts = tiles();
      if (!mid && going() && performance.now() - t0 > 250) {
        const seen = ts.filter((e) => e.getBoundingClientRect().bottom > 0), above = ts.filter((e) => e.getBoundingClientRect().bottom <= 0);
        if (seen.length && above.length) mid = { seen: seen.length, above: above.length, order: Math.max(...seen.map(z)) <= Math.min(...above.map(z)), time: Mahjong.timeNow() };
      }
      if (going()) return setTimeout(tick, 10);
      res({ first, mid, took: Math.round(performance.now() - t0), last: { n: ts.length, moving: ts.filter((e) => e.getAnimations().length).length, shifted: ts.filter((e) => getComputedStyle(e).transform !== "none").length,
        time: Mahjong.timeNow(), inside: ts.every((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }) } });
    })();
  }));
  check("mahjong, Animations on: a deal starts with all 144 tiles above the screen, each on its way down",
    drop.first.dealing && drop.first.n === 144 && drop.first.above === 144 && drop.first.flying === 144, drop.first);
  check("mahjong, Animations on: the tiles drop in a layer at a time from the bottom one up, over most of a second, and land in their places; no clock runs until they have",
    !!drop.mid && drop.mid.order && drop.mid.time === 0 && drop.took >= 600 && drop.last.n === 144 && drop.last.moving === 0 && drop.last.shifted === 0 && drop.last.inside && drop.last.time <= 250, drop);

  // ---- a matched pair comes together and is gone (out of the game at once,
  // deaf to the pointer, only still drawn), and takes a second off the clock
  const match = await p.evaluate(() => new Promise((res) => {
    const leaving = () => (Mahjong.leaving ? Mahjong.leaving() : -1);
    Mahjong.hintNow();                                  // (+30 s on the clock, so there is a second to take)
    const free = Mahjong.freeIdx(), fam = (k) => (k[0] === "f" || k[0] === "s" ? k[0] : k);
    let a = -1, b = -1;
    for (let i = 0; i < free.length && a < 0; i++) for (let j = i + 1; j < free.length; j++) if (fam(Mahjong.kindOf(free[i])) === fam(Mahjong.kindOf(free[j]))) { a = free[i]; b = free[j]; break; }
    const ra = Mahjong.tileRect(a), rb = Mahjong.tileRect(b), t0 = Mahjong.timeNow();
    Mahjong.click(a); Mahjong.click(b);
    const gone = [...document.querySelectorAll("#board .tile.gone")];
    // where each of the two ends up: its place, moved by its last keyframe
    const meet = gone.map((e) => {
      const an = e.getAnimations()[0], k = an ? an.effect.getKeyframes().pop() : {}, m = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)/.exec(k.transform || "") || [0, 0, 0], r = e.getBoundingClientRect();
      return { x: r.left + +m[1], y: r.top + +m[2], opacity: +k.opacity, deaf: getComputedStyle(e).pointerEvents === "none" };
    });
    const now = { left: Mahjong.tilesLeft(), gone: gone.length, leaving: leaving(), still: [Mahjong.tileRect(a), Mahjong.tileRect(b)].filter(Boolean).length,
      took: t0 - Mahjong.timeNow(), chip: (document.getElementById("hud-off") || {}).textContent || "", sel: document.querySelectorAll(".tile.sel").length };
    setTimeout(() => res({ far: Math.round(Math.hypot(ra.left - rb.left, ra.top - rb.top)), meet, now,
      after: { tiles: document.querySelectorAll("#board .tile").length, gone: document.querySelectorAll(".tile.gone").length, leaving: leaving() } }), 750);
  }));
  check("mahjong, Animations on: a matched pair is out of the game at once (142 left, neither one selectable or pressable) and still drawn, on its way out",
    match.now.left === 142 && match.now.gone === 2 && match.now.leaving === 2 && match.now.still === 0 && match.now.sel === 0 && match.meet.every((m) => m.deaf), match.now);
  check("mahjong, Animations on: the two tiles of a pair come together, fade there, and are gone from the desk within a second",
    match.meet.length === 2 && Math.abs(match.meet[0].x - match.meet[1].x) < 1.5 && Math.abs(match.meet[0].y - match.meet[1].y) < 1.5 && match.meet.every((m) => m.opacity === 0) && match.far > 10 &&
    match.after.tiles === 142 && match.after.gone === 0 && match.after.leaving === 0, { far: match.far, meet: match.meet, after: match.after });
  check("mahjong, Animations on: a pair takes a second off the clock, shown over it", match.now.took === 1000 && match.now.chip === "-1s", match.now);
  // ...down to zero and no further: a fresh deal's first pairs take only what the clock has
  await p.evaluate(() => Mahjong.start("classic")); await p.waitForTimeout(450);
  const zero = await p.evaluate(() => { const t0 = Mahjong.timeNow(); Mahjong.removeOnePair(); const t1 = Mahjong.timeNow(); Mahjong.removeOnePair(); return { t0, t1, t2: Mahjong.timeNow(), chip: (document.getElementById("hud-off") || {}).textContent || "" }; });
  check("mahjong, Animations on: the second comes off down to zero and no further", zero.t0 > 0 && zero.t0 < 1000 && zero.t1 === 0 && zero.t2 === 0 && zero.chip === "-" + zero.t0 / 1000 + "s", zero);

  // ---- a shuffle's tiles travel: each starts where a tile of its face lay
  // before, one for one, and ends in its place; a press meanwhile lands them
  // and is the press it was
  const shuf = await p.evaluate(() => new Promise((res) => {
    const moving = () => (Mahjong.moving ? Mahjong.moving() : 0);
    Mahjong.start("classic");
    const ids = [...Array(144).keys()], before = {};
    ids.forEach((i) => { const r = Mahjong.tileRect(i); before[i] = { x: r.left, y: r.top, kind: Mahjong.kindOf(i) }; });
    const t0 = Mahjong.timeNow();
    Mahjong.shuffleNow();
    const src = ids.map((j) => { const r = Mahjong.tileRect(j); return ids.find((i) => Math.abs(before[i].x - r.left) < 1 && Math.abs(before[i].y - r.top) < 1); });
    const now = { sameFace: src.every((i, n) => i != null && before[i].kind === Mahjong.kindOf(ids[n])), oneForOne: new Set(src).size === 144, moved: src.filter((i, n) => i !== ids[n]).length,
      moving: moving(), raised: document.querySelectorAll(".tile.moving").length, cost: Mahjong.timeNow() - t0 };
    (function tick() {
      if (moving()) return setTimeout(tick, 20);
      res({ now, after: { raised: document.querySelectorAll(".tile.moving").length, shifted: [...document.querySelectorAll("#board .tile")].filter((e) => getComputedStyle(e).transform !== "none").length,
        home: ids.every((i) => { const r = Mahjong.tileRect(i); return Math.abs(r.left - before[i].x) < 1 && Math.abs(r.top - before[i].y) < 1; }) } });
    })();
  }));
  check("mahjong, Animations on: on a shuffle each tile starts where a tile of its face lay before, one for one, nearly all of them moving, and each ends in its own place; the shuffle still costs its minute",
    shuf.now.sameFace && shuf.now.oneForOne && shuf.now.moved >= 100 && shuf.now.moving === shuf.now.moved && shuf.now.raised === shuf.now.moved && shuf.now.cost === 60000 &&
    shuf.after.raised === 0 && shuf.after.shifted === 0 && shuf.after.home, shuf);
  const pressed = await p.evaluate(() => { const moving = () => (Mahjong.moving ? Mahjong.moving() : 0); Mahjong.shuffleNow(); const was = moving(); Mahjong.click(Mahjong.freeIdx()[0]); return { was, moving: moving(), sel: document.querySelectorAll(".tile.sel").length }; });
  check("mahjong, Animations on: a press while a shuffle is travelling lands it and picks the tile pressed", pressed.was > 0 && pressed.moving === 0 && pressed.sel === 1, pressed);
  // ---- a desk cleared at 0:00 (the seconds off can bring a clear there) is a record like any other
  const nil = await p.evaluate(() => {
    Mahjong.start("classic");
    Mahjong.setLive(Mahjong.freeIdx().slice(0, 2), ["d1", "d1"]);
    Mahjong.removeOnePair();
    const card = { state: Mahjong.state(), time: document.getElementById("over-msg").textContent, note: document.getElementById("over-stats").textContent };
    Mahjong.toMenu();
    return { card, stored: localStorage.getItem("mahjong_best_classic"), menu: document.getElementById("bests").textContent };
  });
  check("mahjong, Animations on: a desk cleared at 0:00 is kept as the fastest clear, and the menu shows it as one",
    nil.card.state === "over" && nil.card.time === "0:00" && /new fastest clear/.test(nil.card.note) && nil.stored === "0" && nil.menu === "fastest turtle clear: 0:00", nil);
  await done(p, "motion");

  // ---- a slowed deal (a tile every 0.12 s), so a press, a pause and the FX
  // switch are sure to come while it is dropping in
  {
    const q = await open(ctx, true, [["var DROP_MS = 330, DROP_STEP = 6;", "var DROP_MS = 330, DROP_STEP = 120;"]]);
    const state = () => q.evaluate(() => ({ going: Mahjong.dealing(), moving: Mahjong.moving(), sel: document.querySelectorAll(".tile.sel").length, left: Mahjong.tilesLeft(),
      shifted: [...document.querySelectorAll("#board .tile")].filter((e) => getComputedStyle(e).transform !== "none").length }));
    await q.keyboard.press("Enter"); await q.waitForTimeout(600);
    // (a free tile's own place, pressed with the mouse)
    const spot = await q.evaluate(() => { const b = document.getElementById("board").getBoundingClientRect(), e = [...document.querySelectorAll("#board .tile.free")].pop(); return { x: b.left + e.offsetLeft + e.offsetWidth / 2, y: b.top + e.offsetTop + e.offsetHeight / 2, going: Mahjong.dealing() }; });
    await q.mouse.click(spot.x, spot.y); await q.waitForTimeout(80);
    const landed = await state();
    await q.mouse.click(spot.x, spot.y); await q.waitForTimeout(80);
    const picked = await state();
    check("mahjong: a press while the deal is dropping in lands every tile at once and does no more; the next press picks the tile",
      spot.going && !landed.going && landed.moving === 0 && landed.sel === 0 && landed.shifted === 0 && landed.left === 144 && picked.sel === 1, { spot, landed, picked });
    await q.evaluate(() => Mahjong.toMenu()); await q.keyboard.press("Enter"); await q.waitForTimeout(400);
    const g1 = await state();
    await q.keyboard.press("p"); await q.waitForTimeout(120);
    const paused = await state();
    await q.keyboard.press("p"); await q.waitForTimeout(120);
    await q.evaluate(() => Mahjong.toMenu()); await q.keyboard.press("Enter"); await q.waitForTimeout(400);
    const g2 = await state();
    await q.evaluate(() => document.querySelector(".rm-toggle").click()); await q.waitForTimeout(120);
    const flipped = await state();
    check("mahjong: a pause, or Visual FX switched off, while the deal is dropping in lands every tile",
      g1.going && !paused.going && paused.moving === 0 && paused.shifted === 0 && g2.going && !flipped.going && flipped.moving === 0 && flipped.shifted === 0, { g1, paused, g2, flipped });
    await done(q, "slowed deal");
  }

  // ---- Visual FX off, Animations on: the same three told by fading, nothing
  // flying, and the pair's second still comes off
  {
    const q = await open(ctx, true, null, true);
    const calm = await q.evaluate(() => {
      const tiles = () => [...document.querySelectorAll("#board .tile")];
      const flat = (es) => es.every((e) => e.getAnimations().every((a) => a.effect.getKeyframes().every((k) => !k.transform || k.transform === "none")));
      document.getElementById("play").click();
      const deal = { fxOff: window.RM_ON(), dealing: Mahjong.dealing(), fading: tiles().filter((e) => e.getAnimations().length === 1).length, flat: flat(tiles()), inPlace: tiles().every((e) => e.getBoundingClientRect().top >= 0) };
      Mahjong.settle();
      Mahjong.shuffleNow();
      const shuffle = { moving: Mahjong.moving(), flat: flat(tiles()), raised: document.querySelectorAll(".tile.moving").length };
      Mahjong.settle();
      const t0 = Mahjong.timeNow();
      Mahjong.removeOnePair();
      const gone = [...document.querySelectorAll(".tile.gone")];
      return { deal, shuffle, pair: { gone: gone.length, fading: gone.filter((e) => e.getAnimations().length === 1).length, flat: flat(gone), took: t0 - Mahjong.timeNow() } };
    });
    check("mahjong, Visual FX off, Animations on: the deal, a shuffle and a matched pair are told by fading, nothing flies, and the pair still takes its second off",
      calm.deal.fxOff && calm.deal.dealing && calm.deal.fading === 144 && calm.deal.flat && calm.deal.inPlace && calm.shuffle.moving === 144 && calm.shuffle.flat && calm.shuffle.raised === 0 &&
      calm.pair.gone === 2 && calm.pair.fading === 2 && calm.pair.flat && calm.pair.took === 1000, calm);
    await done(q, "calm");
  }

  // ---- Animations off: the game as it was
  {
    const q = await open(ctx);
    const still = await q.evaluate(() => {
      const tiles = () => [...document.querySelectorAll("#board .tile")], anims = () => tiles().reduce((n, e) => n + e.getAnimations().length, 0);
      document.getElementById("play").click();
      const deal = { on: Mahjong.anim ? Mahjong.anim() : null, dealing: Mahjong.dealing ? Mahjong.dealing() : null, anims: anims(), n: tiles().length };
      Mahjong.shuffleNow();
      const shuffle = { anims: anims(), moving: Mahjong.moving ? Mahjong.moving() : null };
      const t0 = Mahjong.timeNow();
      Mahjong.removeOnePair();
      return { deal, shuffle, pair: { n: tiles().length, gone: document.querySelectorAll(".tile.gone").length, took: t0 - Mahjong.timeNow() } };
    });
    check("mahjong, Animations off: a deal is simply there, a shuffle simply done and a matched pair simply gone, and no time comes off",
      still.deal.on === false && still.deal.dealing === false && still.deal.anims === 0 && still.deal.n === 144 && still.shuffle.anims === 0 && still.shuffle.moving === 0 &&
      still.pair.n === 142 && still.pair.gone === 0 && still.pair.took === 0, still);
    await done(q, "still");
  }
  await ctx.close();

  // ---- on a small phone every layout is on the screen whole, and the menu
  // card with its layout row is too (nothing cut off above or below)
  ctx = await lib.newContext(browser, { viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });
  p = await open(ctx, true);
  const card = await p.evaluate(() => { const r = document.querySelector("#menu .card").getBoundingClientRect(), h = document.querySelector("#menu h1").getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h1: Math.round(h.top), H: innerHeight, W: innerWidth, right: Math.round(r.right) }; });
  check("mahjong: on a 320 x 568 phone the menu card, layout row, Animations and all, is on the screen whole, its heading below the corner buttons' row", card.top >= 0 && card.bottom <= card.H && card.right <= 320 && card.h1 >= 44, card);
  const small = {};
  for (let i = 0; i < 5; i++) {
    small[await p.evaluate(() => (document.getElementById("lay-name") || {}).textContent || "none")] = await p.evaluate(() => {
      Mahjong.start("classic");
      const tiles = [...document.querySelectorAll("#board .tile")].map((e) => e.getBoundingClientRect());
      const ok = tiles.length === 144 && tiles.every((r) => r.left >= 0 && r.right <= 320 && r.top >= 0 && r.bottom <= innerHeight);
      Mahjong.toMenu();
      return ok;
    });
    if (await p.$("#lay-next")) await p.tap("#lay-next");
    await p.waitForTimeout(60);
  }
  check("mahjong: on a 320 x 568 phone each of the five layouts is on the screen whole", Object.keys(small).length === 5 && Object.values(small).every(Boolean), small);
  await done(p, "small phone");
  await ctx.close();

  // ---- on a touch-only phone every keycap of the game's own is hidden (the
  // shared pause card's are game-shell.js's): menu, HUD, end card
  ctx = await lib.newContext(browser, require("@playwright/test").devices["Pixel 7"]);
  p = await open(ctx);
  const caps = () => p.evaluate(() => [...document.querySelectorAll("kbd")].filter((k) => !k.closest(".gs-pause")).map((k) => { const s = k.closest(".gs-keys"); return k.textContent + ":" + (s ? getComputedStyle(s).display : "unwrapped"); }));
  const onMenu = await caps();
  await p.evaluate(() => Mahjong.start("classic"));
  const inPlay = await caps();
  await clearDesk(p);
  const onCard = await caps();
  const hidden = (c) => c.length > 0 && c.every((x) => /:none$/.test(x));
  check("mahjong: on a touch-only phone every keycap is hidden, on the menu, the HUD and the end card", hidden(onMenu) && hidden(inPlay) && hidden(onCard), { onMenu, inPlay, onCard });
  await done(p, "touch keycaps");
  await ctx.close();
};
