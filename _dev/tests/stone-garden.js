// Stone Garden: the menu takes 1 to 4 for the opponent and B or W for your
// stones (shown on them, the picks kept) and Space or Enter begins; a stone
// turns exactly the lines it closes, and where it closes none it can't go;
// a keeper answers each move with one of its own, a friend's game waits for
// the other colour; a side with no move passes, saying so; the master takes a
// corner it's given; Undo goes back to before your last move and Hint rings
// a good one; the arrows and Enter play from the keyboard, but not while
// paused; the full garden is counted on the end card and kept in the
// record, the card ignoring Space for a moment, then playing again, and
// Backspace going to the menu; with Visual FX off the stones turn without
// the turning motion; on a phone a tap on a ringed place puts a stone there.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const open = (c, opts) => lib.open(c || ctx, base, "games/stone-garden/", opts);
  const done = async (p, what) => { check("stone-garden " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  const idle = (p) => p.waitForFunction(() => !StoneGarden.busy(), null, { timeout: 10000 });
  const wait = (p, ms) => p.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), ms);

  // ---- the menu
  let p = await open();
  // (the keycaps of the two rows sit on the names, the b in each button)
  const caps = await p.evaluate(() => [...document.querySelectorAll("#pick-foe button, #pick-colour button, #play")].map((b) => (b.querySelector("[data-gs-key]") || b).getAttribute("data-gs-key")));
  await p.keyboard.press("3"); await p.keyboard.press("w"); await p.waitForTimeout(80);
  const picked = await p.evaluate(() => ({ foe: StoneGarden.foe(), mine: StoneGarden.mine(), kept: [localStorage.getItem("stonegarden_foe"), localStorage.getItem("stonegarden_colour")] }));
  await p.keyboard.press("4"); await p.waitForTimeout(80);
  const friendRows = await p.evaluate(() => document.getElementById("pick-colour").hidden);
  await p.keyboard.press("2"); await p.keyboard.press("b");
  await p.keyboard.press("Space"); await p.waitForTimeout(200);
  const began = await p.evaluate(() => ({ state: StoneGarden.state(), foe: StoneGarden.foe(), turn: StoneGarden.turn(), counts: StoneGarden.counts(), moves: StoneGarden.moves().map((m) => m.i).sort((a, b) => a - b) }));
  check("stone-garden: the opponents wear 1 to 4, your stones B and W, Begin Space or Enter; the picks are kept, a friend hides the colours, and Space begins with the four stones in the middle and black's four moves",
    caps.join() === "1,2,3,4,B,W,Space or Enter" && picked.foe === "master" && picked.mine === -1 && picked.kept.join() === "master,w" && friendRows &&
      began.state === "play" && began.foe === "monk" && began.turn === 1 && began.counts.b === 2 && began.counts.w === 2 && began.moves.join() === "19,26,37,44",
    { caps, picked, friendRows, began });

  // ---- the rules: a stone turns what it closes; where it closes nothing it can't go
  const rules = await p.evaluate(() => {
    const R = StoneGarden.rules, b = R.fresh();
    const nowhere = R.flipsFor(b, 0, 1).length;          // a corner at the start closes nothing
    const d3 = R.flipsFor(b, 19, 1);                       // d3 for black closes d4
    // a stone closing two lines at once: white at e4 and d5 surrounded
    const b2 = new Array(64).fill(0);
    b2[27] = -1; b2[36] = -1; b2[45] = 1; b2[26] = -1; b2[25] = 1;   // d4,e5 white with f6 black; c4 white with b4 black
    const two = R.flipsFor(b2, 18, 1).sort((a, c) => a - c);          // c3: the diagonal c3-d4-e5-f6 only
    const three = R.flipsFor(b2, 27 - 9, 1);
    return { nowhere, d3, two, three };
  });
  check("stone-garden: a stone turns exactly the stones it closes (d3 turns d4; c3 turns d4 and e5 on the slant), and closes nothing in a bare corner",
    rules.nowhere === 0 && rules.d3.join() === "27" && rules.two.join() === "27,36", rules);
  // ...in play: a bare corner does nothing; d3 puts a stone and the monk answers
  await p.evaluate(() => StoneGarden.play(0)); await p.waitForTimeout(100);
  const still = await p.evaluate(() => StoneGarden.counts());
  await p.evaluate(() => StoneGarden.play(19)); await idle(p);
  const answered = await p.evaluate(() => ({ turn: StoneGarden.turn(), counts: StoneGarden.counts(), board: StoneGarden.board() }));
  check("stone-garden: a place that closes nothing takes no stone; d3 turns d4, and the monk answers with a move of its own",
    still.b === 2 && still.w === 2 && answered.turn === 1 && answered.counts.b + answered.counts.w === 6, { still, answered: answered.counts });
  // ---- Undo goes back to before your move; Hint rings a move you can make
  await p.keyboard.press("u"); await idle(p);
  const undone = await p.evaluate(() => ({ counts: StoneGarden.counts(), turn: StoneGarden.turn() }));
  await p.keyboard.press("h"); await p.waitForTimeout(100);
  const hinted = await p.evaluate(() => ({ at: StoneGarden.hintAt(), ok: StoneGarden.moves().some((m) => m.i === StoneGarden.hintAt()), ringed: !!document.querySelector(".cell.hint") }));
  check("stone-garden: U takes your move and the keeper's answer back; H rings a move you can make", undone.counts.b === 2 && undone.counts.w === 2 && undone.turn === 1 && hinted.ok && hinted.ringed, { undone, hinted });
  // ---- the arrows and Enter play from the keyboard, but not while paused
  // (Enter on the pause card is Resume: it puts no stone either way)
  const pausedUp = () => p.evaluate(() => !document.querySelector(".gs-pause:not(.gs-dialog)").hidden);
  await p.keyboard.press("p"); await p.waitForTimeout(120);
  const wasPaused = await pausedUp();
  await p.keyboard.press("ArrowDown"); await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const pausedCounts = await p.evaluate(() => StoneGarden.counts());
  if (await pausedUp()) { await p.keyboard.press("p"); await p.waitForTimeout(150); }
  await p.keyboard.press("ArrowLeft");   // (the first arrow only shows the cursor)
  const path = await p.evaluate(() => ({ c: StoneGarden.cursor() }));
  // walk the cursor from where it is to d3, then Enter
  const keys = [];
  { let r = Math.floor(path.c / 8), c = path.c % 8; const tr = 2, tc = 3; while (r !== tr) { keys.push(r < tr ? "ArrowDown" : "ArrowUp"); r += r < tr ? 1 : -1; } while (c !== tc) { keys.push(c < tc ? "ArrowRight" : "ArrowLeft"); c += c < tc ? 1 : -1; } }
  for (const k of keys) await p.keyboard.press(k);
  await p.keyboard.press("Enter"); await idle(p);
  const keyed = await p.evaluate(() => ({ d3: StoneGarden.board()[19], counts: StoneGarden.counts() }));
  check("stone-garden: paused, Enter puts no stone; resumed, the arrows walk the ringed cursor and Enter puts a stone there",
    wasPaused && pausedCounts.b === 2 && pausedCounts.w === 2 && keyed.d3 === 1 && keyed.counts.b + keyed.counts.w === 6, { pausedCounts, keyed });
  await done(p, "menu and play");

  // ---- a pass: white has no move, so black goes again, and the line says so
  p = await open();
  const pass = await p.evaluate(() => new Promise((res) => {
    localStorage.setItem("stonegarden_foe", "friend");
    StoneGarden.toMenu(); document.querySelector('#pick-foe button[data-v="friend"]').click(); StoneGarden.start();
    // black at a1..c1 and white at b2 only: after black takes c3 (closing b2), white has no stone left
    const b = new Array(64).fill(0);
    b[0] = 1; b[9] = -1; b[63] = 1; b[54] = -1; b[62] = -1; b[7] = 1;
    StoneGarden.setBoard(b, 1);
    StoneGarden.play(18);
    setTimeout(() => res({ notice: StoneGarden.notice(), line: document.getElementById("turn").textContent, turn: StoneGarden.turn() }), 700);
  }));
  check("stone-garden: when the other colour has no move the line says so and the same colour moves again", /no move/.test(pass.line) && pass.turn === 1, pass);
  await done(p, "pass");

  // ---- the master takes a corner it's offered
  p = await open();
  const corner = await p.evaluate(() => {
    // the opening's four stones, and a black stone at b7 with white behind it at c6:
    // white (the master) can take the a8 corner over it, or play in the middle
    const b = StoneGarden.rules.fresh();
    b[9] = 1; b[18] = -1;
    StoneGarden.toMenu();
    return StoneGarden.rules.flipsFor(b, 0, -1).length > 0 ? (function () {
      document.querySelector('#pick-foe button[data-v="master"]').click();
      StoneGarden.start(); StoneGarden.setBoard(b, -1);
      return StoneGarden.best(5);
    })() : "no corner on offer";
  });
  check("stone-garden: the master takes a corner when it is offered", corner === 0, corner);
  await done(p, "master");

  // ---- the full garden: counted on the end card and kept in the record; the
  // card ignores Space for a moment, then plays again; Backspace goes to the menu
  p = await open();
  const end = await p.evaluate(() => {
    localStorage.removeItem("stonegarden_record_monk");
    StoneGarden.toMenu(); document.querySelector('#pick-foe button[data-v="monk"]').click(); document.querySelector('#pick-colour button[data-v="b"]').click();
    StoneGarden.start();
    const b = new Array(64).fill(1);
    for (let i = 0; i < 20; i++) b[i] = -1;
    b[63] = 0; b[62] = -1; b[55] = -1; b[54] = -1;   // one bare place, which black alone can take
    StoneGarden.setBoard(b, 1);
    StoneGarden.play(63);
    return null;
  });
  await p.waitForFunction(() => StoneGarden.state() === "over", null, { timeout: 8000 });
  const card = await p.evaluate(() => ({ title: document.getElementById("over-title").textContent, msg: document.getElementById("over-msg").textContent, stats: document.getElementById("over-stats").textContent, rec: localStorage.getItem("stonegarden_record_monk") }));
  await p.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })));
  const early = await p.evaluate(() => StoneGarden.state());
  await wait(p, 900);
  await p.keyboard.press("Space"); await p.waitForTimeout(200);
  const again = await p.evaluate(() => StoneGarden.state());
  check("stone-garden: a full garden is counted on the end card (the winner, the score, the record) and kept in the record; Space waits a moment, then plays again",
    card.title === "The garden is yours" && card.msg === "44 to 20" && /against the monk: 1 W/.test(card.stats) && JSON.parse(card.rec).w === 1 && early === "over" && again === "play", { card, early, again });
  await p.evaluate(() => StoneGarden.setBoard(new Array(64).fill(1).map((v, i) => (i < 40 ? 1 : -1)), 1));
  await p.waitForFunction(() => StoneGarden.state() === "over", null, { timeout: 8000 });
  await wait(p, 900);
  await p.keyboard.press("Backspace"); await p.waitForTimeout(200);
  check("stone-garden: Backspace on the end card goes back to the menu", (await p.evaluate(() => StoneGarden.state())) === "menu", await p.evaluate(() => StoneGarden.state()));
  await done(p, "end card");

  // ---- Visual FX: on, the turned stones turn over in sequence; off, they
  // change colour without the motion
  const turning = {};
  for (const off of [false, true]) {
    const q = await open(null, { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:stone-garden", off ? "1" : "0"); localStorage.setItem("stonegarden_foe", "friend"); } catch (e) {} }, off) });
    turning[off ? "off" : "on"] = await q.evaluate(() => {
      StoneGarden.start(); StoneGarden.play(19);
      const st = document.querySelector('.cell[data-i="27"] .st');
      return { colour: st.className.includes(" b"), anim: getComputedStyle(st).animationName };
    });
    await done(q, "FX " + (off ? "off" : "on"));
  }
  check("stone-garden, FX on: a turned stone turns over; FX off: it turns without the motion", turning.on.colour && turning.on.anim === "sg-turn" && turning.off.colour && turning.off.anim === "none", turning);

  // ---- on a phone: a tap on a ringed place puts a stone there
  {
    const { devices } = require("@playwright/test");
    const c = await lib.newContext(browser, devices["Pixel 7"]);
    const q = await open(c);
    await q.evaluate(() => { document.querySelector('#pick-foe button[data-v="friend"]').click(); StoneGarden.start(); });
    const r = await q.evaluate(() => { const e = document.querySelector('.cell[data-i="19"]').getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; });
    await q.touchscreen.tap(r.x, r.y); await q.waitForTimeout(200);
    const tapped = await q.evaluate(() => StoneGarden.board()[19]);
    check("stone-garden, phone: a tap on a ringed place puts a stone there", tapped === 1, tapped);
    await done(q, "phone");
    await c.close();
  }
  await ctx.close();
};
