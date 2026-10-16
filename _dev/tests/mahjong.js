// Mahjong: Enter on a focused mode button only picks the mode, and a mode
// clicked with the mouse doesn't take over the run Enter then starts (a
// Classic deal used to be recorded as the Daily); Ctrl+Z does nothing while
// paused; a reshuffle drops the old selection, and one that can't re-deal
// costs nothing and points at Undo, and so does the no-pairs nudge when no
// reshuffle can fit, which also offers New deal (and on the Daily, giving
// up), asking first; the keycaps hide on a phone. Eight layouts, each a valid
// board of 144 tiles, picked on the menu with the arrows; each deals the full
// set, can be cleared, fits the screen and keeps its own fastest clear; the
// Daily's is the day's own, at random, every layout once in each round of
// days and never the same two days running; the games page's reset clears
// every layout's.
// Animations (an option on the menu, A): a deal's tiles drop in from above, a
// matched pair comes together and is gone, a shuffle's tiles travel from where
// their faces lay; with Visual FX off the three are told by fading; a press, a
// pause or the switch lands whatever is on its way, and a pair still drawn on
// its way out is deaf to the mouse, which plays straight on; no time comes off
// the clock for any of it. With Animations off, none of it. The end card
// comes up once the last pair has gone (as long after, with Animations off).
// The HUD keeps clear of the corner buttons at every window width.
const HOOK = ["    toMenu: toMenu\n  };\n})();", `    toMenu: toMenu,
    pos: function () { return pos; },
    setLive: function (a, k) { live = new Set(a); if (k) a.forEach(function (i, j) { kinds[i] = k[j]; }); undoStack = [[0, 1]]; selected = -1; buildBoard(); hud(); },
    nudge: function () { hint(true); },
    dailyOf: function (n) { return dailyLayout(n == null ? today().n : n).id; }
  };
})();`];
// (the dead-board checks build their desk on the turtle's middle stack, so
// they hold the Daily to the turtle)
const DAILY_TURTLE = ["function layoutNow() { return mode === \"daily\" ? dailyLayout(today().n)", "function layoutNow() { return mode === \"daily\" ? LAYOUTS[0]"];

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
  // (cleared by taking any free pair, shuffling when stuck, which can end on a
  // board no shuffle fits: then a fresh Classic deal is tried)
  let left = started === "play" ? await clearDesk(p) : -1;
  for (let n = 0; n < 3 && left > 0; n++) { await p.evaluate(() => Mahjong.start("classic")); await p.waitForTimeout(150); left = await clearDesk(p); }
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
    const pg = await open(ctx, false, [DAILY_TURTLE]);
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
  // Daily: New deal is today's deal again, so it asks "Start over?" (Esc keeps
  // the board); give up asks "Quit this game?", Enter goes to the menu and records nothing
  s = await stuck("daily");
  await s.pg.evaluate(() => document.getElementById("btn-newdeal").click());
  const again = await s.pg.evaluate(() => ({ title: (document.querySelector(".gs-dialog h2") || {}).textContent || null, text: (document.querySelector(".gs-dialog p") || {}).textContent || "", ok: [...document.querySelectorAll(".gs-dialog button")].map((b) => b.textContent).join("|") }));
  await s.pg.keyboard.press("Escape"); await s.pg.waitForTimeout(80);
  check("mahjong: on a dead Daily, New deal asks \"Start over?\", saying today's layout is dealt again from the start",
    again.title === "Start over?" && /^Today's turtle is dealt again, from the start/.test(again.text) && /Start over/.test(again.ok) && (await s.pg.evaluate(() => Mahjong.tilesLeft())) === 4, again);
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
  const NAMES = ["Turtle", "Fortress", "Pyramid", "Cross", "Twin Peaks", "Butterfly", "Crown", "Spider"], N = NAMES.length;
  check("mahjong: eight layouts (the turtle first, its fastest clear under the old name), each 144 tiles inside the turtle's footprint, none overlapping, every raised tile resting wholly on the layer under it",
    lays.map((l) => l.name).join() === NAMES.join() && lays[0].id === "turtle" && lays[0].best === "mahjong_best_classic" && new Set(lays.map((l) => l.id)).size === N && new Set(lays.map((l) => l.best)).size === N &&
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
  const pick = async (name) => { for (let i = 0; i <= N && (await menuNow()).name !== name; i++) { await p.keyboard.press("ArrowRight"); await p.waitForTimeout(40); } };
  const seen = [await menuNow()];
  for (let i = 0; i < N; i++) { await p.keyboard.press("ArrowRight"); await p.waitForTimeout(60); seen.push(await menuNow()); }
  await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(60);
  const back = await menuNow();
  if (await p.$("#lay-next")) await p.click("#lay-next");
  await p.waitForTimeout(60);
  const clicked = await menuNow();
  check("mahjong: on the menu the right and left arrow keys (shown on the two arrows) go through the layouts, round and round, and a click on an arrow does too; the pick is remembered",
    seen.map((s) => s.name).join() === NAMES.concat("Turtle").join() && seen[0].caps.join() === "←,→" && seen[1].stored === "fortress" &&
    back.name === NAMES[N - 1] && clicked.name === "Turtle" && clicked.stored === "turtle", { names: seen.map((s) => s.name), caps: seen[0].caps, back: back.name, clicked: [clicked.name, clicked.stored] });
  check("mahjong: each layout shows its own picture, its name on the deal button, and its place among the eight",
    new Set(seen.slice(0, N).map((s) => s.sum)).size === N && seen.slice(0, N).every((s, i) => s.ink > 300 && s.play === "Deal the " + s.name.toLowerCase() && s.note === "layout " + (i + 1) + " of " + N),
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
  check("mahjong: the menu shows the picked layout's own fastest clear", new RegExp("^fastest " + NAMES[N - 1].toLowerCase() + " clear: \\d+:\\d\\d$").test(afterAll[0].bests) && /^fastest turtle clear: \d+:\d\d$/.test(afterAll[1].bests), afterAll.map((s) => s.bests));

  // ---- the Daily's layout is the day's own: any layout at random, the same
  // for everyone, every one of them once in each round of days (so each as
  // often as any other: a layout added joins the rounds), never the same two
  // days running. Days 1 to 20 had the first five, all there were then, and
  // keep them; from day 21 the rounds are of all eight.
  const days = await p.evaluate(() => { const a = [], b = []; for (let n = -9; n <= 600; n++) { a.push(Mahjong.dailyOf(n)); b.push(Mahjong.dailyOf(n)); } return { a, same: a.join() === b.join() }; });
  const day = (n) => days.a[n + 9];
  const early = [], rounds = [], runs = [];
  for (let n = 1; n + 5 <= 21; n += 5) early.push(new Set(days.a.slice(n + 9, n + 14)).size);
  for (let n = 21; n + N <= 601; n += N) rounds.push(new Set(days.a.slice(n + 9, n + 9 + N)).size);
  for (let i = 1; i < days.a.length; i++) if (days.a[i] === days.a[i - 1]) runs.push(i - 9);
  const firsts = new Set(rounds.map((r, k) => day(21 + k * N)));
  const count = {};
  days.a.slice(21 + 9).forEach((id) => { count[id] = (count[id] || 0) + 1; });
  check("mahjong: the Daily's layout is the day's own: the same each time it is asked, from day 21 every layout once in each round of eight days (days 1 to 20 kept their rounds of the first five), never the same two days running, and the rounds in orders of their own",
    days.same && early.every((r) => r === 5) && rounds.length >= 70 && rounds.every((r) => r === N) && runs.length === 0 && firsts.size >= 6 && Object.keys(count).length === N &&
      Math.max(...Object.values(count)) - Math.min(...Object.values(count)) <= 1 && day(20) === "turtle",
    { same: days.same, early, notAll: rounds.filter((r) => r !== N).length, runs: runs.slice(0, 5), firsts: [...firsts], count, from21: days.a.slice(30, 30 + N) });
  // ...on the menu: today's is shown with the arrows off, whatever is picked
  // for Classic, which is still picked afterwards; Enter deals it
  await pick("Fortress");
  await p.keyboard.press("2"); await p.waitForTimeout(60);
  const todays = await p.evaluate(() => Mahjong.dailyOf());
  const todaysName = lays.find((l) => l.id === todays).name;
  const onDaily = await menuNow();
  const dailySmall = await p.evaluate(() => document.getElementById("daily-small").textContent);
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(60);
  const onDaily2 = await menuNow();
  await p.keyboard.press("Enter"); await p.waitForTimeout(200);
  const dailyDeal = await p.evaluate(() => ({ layout: Mahjong.layout ? Mahjong.layout() : null, left: Mahjong.tilesLeft() }));
  await p.evaluate(() => Mahjong.toMenu());
  await p.keyboard.press("1"); await p.waitForTimeout(60);
  const onClassic = await menuNow();
  check("mahjong: the Daily shows today's layout by name on the menu, with the arrows off (the arrow key changes nothing), and deals it; back on Classic the Fortress is still picked",
    onDaily.name === todaysName && onDaily.note === "today's Daily layout" && onDaily.off.length === 2 && onDaily.off.every(Boolean) && onDaily.play === "Deal the " + todaysName.toLowerCase() &&
    dailySmall.startsWith("today's " + todaysName.toLowerCase() + ", shareable") && onDaily2.name === todaysName && onDaily2.stored === "fortress" &&
    dailyDeal.layout === todays && dailyDeal.left === 144 && onClassic.name === "Fortress" && !onClassic.off.some(Boolean),
    { todays, dailySmall, onDaily: [onDaily.name, onDaily.note, onDaily.off, onDaily.play], onDaily2: [onDaily2.name, onDaily2.stored], dailyDeal, onClassic: [onClassic.name, onClassic.off] });
  // ...and the cleared Daily's card and shared result name it
  // (cleared by taking any free pair, shuffling when stuck, a few tries as above)
  let shared = null;
  for (let n = 0; n < 4 && !(shared && shared.left === 0); n++) {
    await p.evaluate(() => Mahjong.start("daily"));
    shared = { left: await clearDesk(p) };
  }
  await p.waitForTimeout(80);
  Object.assign(shared, await p.evaluate(async () => {
    let text = null;
    try { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (t) => { text = t; return Promise.resolve(); } } }); } catch (e) {}
    const card = document.getElementById("over-stats").textContent;
    document.getElementById("share").click();
    await new Promise((r) => setTimeout(r, 50));
    return { card, text };
  }));
  check("mahjong: a cleared Daily's card and its shared result name the day's layout",
    shared.left === 0 && new RegExp("^Daily No\\. \\d+, the " + todaysName.toLowerCase()).test(shared.card) && new RegExp("^Mahjong · Daily No\\. \\d+, the " + todaysName.toLowerCase() + " \\(").test(shared.text || ""),
    Object.assign({ todays }, shared));
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
  check("mahjong: Animations is an option on the menu, on to begin with, promising no time off either way; A, shown on it, or a click turns it off and on, and the choice is kept",
    !!o0 && o0.on && o0.pressed === "true" && o0.cap === "A" && /Animations: on/.test(o0.text) && !/time off|off each/.test(o0.text) &&
    !o1.on && o1.stored === "0" && o1.pressed === "false" && /Animations: off/.test(o1.text) && !/time off|off each/.test(o1.text) && o2.on && o2.stored === "1", { o0, o1, o2 });

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
  // deaf to the pointer, only still drawn), and takes nothing off the clock
  const match = await p.evaluate(() => new Promise((res) => {
    const leaving = () => (Mahjong.leaving ? Mahjong.leaving() : -1);
    Mahjong.hintNow();                                  // (+30 s on the clock, so a second taken off would show)
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
      took: t0 - Mahjong.timeNow(), chip: !!document.getElementById("hud-off"), sel: document.querySelectorAll(".tile.sel").length };
    setTimeout(() => res({ far: Math.round(Math.hypot(ra.left - rb.left, ra.top - rb.top)), meet, now,
      after: { tiles: document.querySelectorAll("#board .tile").length, gone: document.querySelectorAll(".tile.gone").length, leaving: leaving() } }), 750);
  }));
  check("mahjong, Animations on: a matched pair is out of the game at once (142 left, neither one selectable or pressable) and still drawn, on its way out",
    match.now.left === 142 && match.now.gone === 2 && match.now.leaving === 2 && match.now.still === 0 && match.now.sel === 0 && match.meet.every((m) => m.deaf), match.now);
  check("mahjong, Animations on: the two tiles of a pair come together, fade there, and are gone from the desk within a second",
    match.meet.length === 2 && Math.abs(match.meet[0].x - match.meet[1].x) < 1.5 && Math.abs(match.meet[0].y - match.meet[1].y) < 1.5 && match.meet.every((m) => m.opacity === 0) && match.far > 10 &&
    match.after.tiles === 142 && match.after.gone === 0 && match.after.leaving === 0, { far: match.far, meet: match.meet, after: match.after });
  check("mahjong, Animations on: a pair takes no time off the clock, and there is no time-off chip over it", match.now.took === 0 && !match.now.chip, match.now);

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
  // ---- a desk cleared at 0:00 is a record like any other (a zero is not taken for no best)
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
  // ---- the end card waits for the last pair to be gone: with Animations on it
  // comes up once their leaving is over, with them off after just as long (it
  // used to come up with the last pair still on its way out), and Space in
  // the meantime doesn't deal again
  const lastPair = (pg) => pg.evaluate(() => new Promise((res) => {
    Mahjong.start("classic");
    Mahjong.setLive(Mahjong.freeIdx().slice(0, 2), ["d1", "d1"]);
    Mahjong.removeOnePair();
    const t0 = performance.now(), card = document.getElementById("over");
    const at0 = { state: Mahjong.state(), up: !card.hidden, leaving: Mahjong.leaving() };
    document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    (function look() {
      if (card.hidden && performance.now() - t0 < 3000) return requestAnimationFrame(look);
      res({ at0, wait: Math.round(performance.now() - t0), leavingThen: Mahjong.leaving(), state: Mahjong.state(), up: !card.hidden });
    })();
  }));
  const endOn = await lastPair(p);
  check("mahjong, Animations on: the end card comes up once the last pair has gone, not while it is still leaving (and Space before it deals nothing)",
    endOn.at0.state === "over" && !endOn.at0.up && endOn.at0.leaving === 2 && endOn.up && endOn.leavingThen === 0 && endOn.wait >= 430 && endOn.wait < 1500 && endOn.state === "over", endOn);
  await done(p, "motion");
  {
    const q = await open(ctx);
    const endOff = await lastPair(q);
    check("mahjong, Animations off: the end card still waits as long as the last pair's leaving would take",
      endOff.at0.state === "over" && !endOff.at0.up && endOff.at0.leaving === 0 && endOff.up && endOff.wait >= 430 && endOff.wait < 1500 && endOff.state === "over", endOff);
    await done(q, "end card wait");
  }

  // ---- a matched pair still drawn on its way out is deaf to the mouse, which
  // plays straight on: a press on the pair where nothing lies under it picks
  // nothing, a press on a tile under it picks that tile, and that tile's match
  // takes a second pair while the first is still leaving. The desk is set: the
  // turtle's top tile and a tile on the floor make the pair, and the four the
  // top tile lay on (two pairs) are free once it goes. (The send-off is slowed
  // to 8 s, so every press comes while it is on its way.)
  for (const fxOff of [false, true]) {
    const what = "mahjong, Animations on, Visual FX " + (fxOff ? "off" : "on");
    const q = await open(ctx, true, [["{ duration: flying ? OFF_MS : FADE_MS,", "{ duration: 8000,"]], fxOff);
    const set = await q.evaluate(() => {
      Mahjong.start("classic");
      const pos = Mahjong.pos(), top = Math.max(...pos.map((t) => t[2])), ids = pos.map((t, i) => i);
      const cap = ids.find((i) => pos[i][2] === top);
      const under = ids.filter((i) => pos[i][2] === top - 1 && Math.abs(pos[i][0] - pos[cap][0]) < 2 && Math.abs(pos[i][1] - pos[cap][1]) < 2);
      const floor = ids.filter((i) => pos[i][2] === 0).sort((i, j) => Math.abs(pos[j][0] - pos[cap][0]) - Math.abs(pos[i][0] - pos[cap][0]))[0];
      Mahjong.setLive([cap, floor].concat(under), ["d1", "d1", "b1", "b1", "c1", "c1"]);
      // a point in rect r, the middle first, where ok(the element the mouse would hit there) holds
      window.__at = (r, ok) => {
        const pts = [], mx = r.left + r.width / 2, my = r.top + r.height / 2;
        for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) pts.push([r.left + r.width * i / 12, r.top + r.height * j / 12]);
        pts.sort((a, b) => Math.hypot(a[0] - mx, a[1] - my) - Math.hypot(b[0] - mx, b[1] - my));
        for (const [x, y] of pts) if (ok(document.elementFromPoint(x, y))) return { x, y };
        return null;
      };
      window.__tile = (i) => { const r = Mahjong.tileRect(i); return (e) => !!e && e.classList.contains("tile") && Math.abs(e.getBoundingClientRect().left - r.left) < 0.5 && Math.abs(e.getBoundingClientRect().top - r.top) < 0.5; };
      const a = __at(Mahjong.tileRect(cap), __tile(cap)), b = __at(Mahjong.tileRect(floor), __tile(floor));
      return { cap, floor, under, a, b, free: Mahjong.freeIdx().sort((i, j) => i - j), top };
    });
    const now = () => q.evaluate(() => ({ left: Mahjong.tilesLeft(), leaving: Mahjong.leaving(), sel: document.querySelectorAll("#board .tile.sel").length }));
    let s1 = null, s2 = null, s3 = null, s4 = null, empty = null, pick = null, other = null;
    if (set.a && set.b && set.under.length === 4) {
      await q.mouse.click(set.a.x, set.a.y); await q.mouse.click(set.b.x, set.b.y);
      s1 = await q.evaluate((u) => ({ left: Mahjong.tilesLeft(), leaving: Mahjong.leaving(), freeUnder: u.every((i) => Mahjong.isFree(i)) }), set.under);
      // the two leaving, as drawn: the top tile is the one from the highest
      // layer (its own z-index, under the leaving tiles' shared one)
      await q.evaluate(() => { window.__gone = () => [...document.querySelectorAll("#board .tile.gone")].sort((e, f) => +f.style.zIndex - +e.style.zIndex).map((e) => e.getBoundingClientRect()); });
      // the middle of the floor tile as it is drawn leaving, with nothing under it
      empty = await q.evaluate(() => { const g = __gone()[1]; return g && { x: Math.round(g.left + g.width / 2), y: Math.round(g.top + g.height / 2) }; });
      if (empty) { await q.mouse.click(empty.x, empty.y); s2 = await now(); }
      // a tile the top tile lay on, pressed well inside where the top tile is
      // drawn over it (not in its rounded corners, which the mouse misses anyway)
      pick = await q.evaluate((u) => {
        const g = __gone()[0];
        if (!g) return null;
        const inner = { left: g.left + g.width * 0.2, top: g.top + g.height * 0.2, width: g.width * 0.6, height: g.height * 0.6 };
        for (const i of u) { const s = __at(inner, __tile(i)); if (s) return Object.assign(s, { i, kind: Mahjong.kindOf(i) }); }
        return null;
      }, set.under);
      if (pick) {
        await q.mouse.click(pick.x, pick.y);
        s3 = await q.evaluate((s) => ({ left: Mahjong.tilesLeft(), leaving: Mahjong.leaving(), sel: document.querySelectorAll("#board .tile.sel").length, picked: document.elementFromPoint(s.x, s.y).classList.contains("sel") }), pick);
        other = await q.evaluate((s) => { const i = s.u.find((j) => j !== s.i && Mahjong.kindOf(j) === s.kind); const at = __at(Mahjong.tileRect(i), __tile(i)); return at && Object.assign(at, { i }); }, { u: set.under, i: pick.i, kind: pick.kind });
        if (other) { await q.mouse.click(other.x, other.y); s4 = await now(); }
      }
    }
    check(what + ": with a pair just matched by the mouse and still drawn on its way out, a press on it where nothing lies under it picks nothing",
      !!s1 && s1.left === 4 && s1.leaving === 2 && s1.freeUnder && !!s2 && s2.sel === 0 && s2.left === 4 && s2.leaving === 2, { set, s1, empty, s2 });
    check(what + ": a press on a tile the leaving pair is drawn over picks that tile at once, and its match takes a second pair while the first is still leaving",
      !!s3 && s3.sel === 1 && s3.picked && s3.leaving === 2 && !!s4 && s4.left === 2 && s4.sel === 0 && s4.leaving === 4, { pick, s3, other, s4 });
    await done(q, "play on " + (fxOff ? "calm" : "moving"));
  }

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
  // flying, and no time comes off for the pair
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
    check("mahjong, Visual FX off, Animations on: the deal, a shuffle and a matched pair are told by fading, nothing flies, and the pair takes no time off",
      calm.deal.fxOff && calm.deal.dealing && calm.deal.fading === 144 && calm.deal.flat && calm.deal.inPlace && calm.shuffle.moving === 144 && calm.shuffle.flat && calm.shuffle.raised === 0 &&
      calm.pair.gone === 2 && calm.pair.fading === 2 && calm.pair.flat && calm.pair.took === 0, calm);
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

  // ---- the HUD keeps clear of the corner buttons at every window width (it
  // goes under their row where the window is too narrow for it to sit between
  // them), on one line, and the whole board is on the screen under it
  {
    const at = {};
    for (const w of [700, 820, 1024, 1099, 1100, 1199, 1200, 1280, 1329, 1330, 1440]) {
      const c = await lib.newContext(browser, { viewport: { width: w, height: 800 } });
      const q = await open(c);
      await q.evaluate(() => Mahjong.start("classic")); await q.waitForTimeout(150);
      at[w] = await q.evaluate(() => {
        const r = (e) => e.getBoundingClientRect();
        const hud = [...document.querySelectorAll("#hudline > *")].filter((e) => e.getClientRects().length).map(r);
        const corners = [...document.querySelectorAll(".nav-back-games, .gs-pause-btn, .mute-toggle, .rm-toggle")].map(r);
        const hit = (a, b) => a.left < b.right + 4 && b.left < a.right + 4 && a.top < b.bottom + 2 && b.top < a.bottom + 2;
        const tiles = [...document.querySelectorAll("#board .tile")].map(r), mids = hud.map((h) => (h.top + h.bottom) / 2);
        return { clear: hud.length >= 4 && corners.length === 4 && hud.every((h) => corners.every((k) => !hit(h, k))), oneLine: Math.max(...mids) - Math.min(...mids) < 10,
          under: Math.min(...tiles.map((t) => t.top)) >= Math.max(...hud.map((h) => h.bottom)) - 2,
          inside: tiles.length === 144 && tiles.every((t) => t.left >= 0 && t.right <= innerWidth && t.top >= 0 && t.bottom <= innerHeight) };
      });
      at[w].errs = q.errs.length;
      await c.close();
    }
    const bad = Object.keys(at).filter((w) => !(at[w].clear && at[w].oneLine && at[w].under && at[w].inside && at[w].errs === 0));
    check("mahjong: at window widths from 700 to 1440 px the HUD is on one line clear of the corner buttons, with the whole board on the screen under it", bad.length === 0, bad.map((w) => [w, at[w]]));
  }

  // ---- ...and so is a dead board's, far wider with its message, New deal
  // and (on the Daily) give up: where it would reach a corner button it goes
  // under their row (it ran under them from 1100 to 1199 px and from 1330 to
  // 1600), and the board, the whole deal still on it, takes the height left
  {
    const DEAD = ["    nudge: function () { hint(true); },", "    nudge: function () { hint(true); },\n    forceDead: function () { dead = true; hud(); },"];
    const at = {};
    for (const w of [390, 820, 1100, 1150, 1199, 1280, 1330, 1366, 1440, 1536, 1600]) {
      const c = await lib.newContext(browser, w < 641 ? { viewport: { width: w, height: 664 }, hasTouch: true, isMobile: true } : { viewport: { width: w, height: 800 } });
      const q = await open(c, false, [DEAD]);
      await q.evaluate(() => { Mahjong.start("daily"); Mahjong.forceDead(); }); await q.waitForTimeout(150);
      at[w] = await q.evaluate(() => {
        const r = (e) => e.getBoundingClientRect();
        const hud = [...document.querySelectorAll("#hudline > span, #hudline button")].filter((e) => e.getClientRects().length && r(e).width > 0).map(r);
        const corners = [...document.querySelectorAll(".nav-back-games, .gs-corner > *")].filter((e) => e.getClientRects().length).map(r);
        const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        const tiles = [...document.querySelectorAll("#board .tile")].map(r);
        return { bar: !!document.getElementById("hud-stuck").offsetParent && !!document.getElementById("btn-giveup").offsetParent,
          clear: hud.every((h) => corners.every((k) => !hit(h, k))), onScreen: hud.every((h) => h.left >= 0 && h.right <= innerWidth),
          under: Math.min(...tiles.map((t) => t.top)) >= Math.max(...hud.map((h) => h.bottom)) - 2,
          inside: tiles.length === 144 && tiles.every((t) => t.left >= 0 && t.right <= innerWidth && t.top >= 0 && t.bottom <= innerHeight) };
      });
      at[w].errs = q.errs.length;
      await c.close();
    }
    const bad = Object.keys(at).filter((w) => !(at[w].bar && at[w].clear && at[w].onScreen && at[w].under && at[w].inside && at[w].errs === 0));
    check("mahjong: a dead board's HUD, New deal and give up and all, keeps clear of the corner buttons at every width, with the whole board on the screen under it", bad.length === 0, bad.map((w) => [w, at[w]]));
  }

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
