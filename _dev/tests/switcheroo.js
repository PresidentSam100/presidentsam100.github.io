// Switcheroo: the shuffle stays watchable at every level (a model run over
// the game's own level table: no switch under 240 ms, at least 180 ms of
// watching for each switch however many happen at once, no tumbler faster
// than 9 slots a second, and the levels only ever get harder); the switches
// keep every marble under its own tumbler, and only the tumblers in a pair
// move; a right pick finds the marble (counted, its best saved as it's
// passed), a wrong one costs a life and shows where the colour was, both
// tumblers staying up, and a colour seen under it isn't asked; a pick or a
// click mid-shuffle does nothing; a round
// cleared is the next level and the best level is saved that moment; three
// misses end the run on a card that waits a moment for Space, then deals
// again, Backspace going to the menu and Esc out to the games page; every
// word is in Chewy at its one weight; a pause mid-shuffle (by P, by Esc's
// leave box, by the window losing focus or the tab hiding) hides the counter
// and freezes it, and the same shuffle carries on from that frame on resume,
// never dealt again; so does one while the marbles go in; one at a question
// hides it too and keeps the question; with Visual FX off the tumblers
// still travel round each other and lift; the keys; a tap picks on a
// phone; the menu and the counter fit every screen without scrolling; and
// the games page's reset clears both bests.
module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  const ctx = await lib.newContext(browser);
  const done = async (p, what) => { check("switcheroo " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  // the page's frames, and its clock, stepped by hand: __frames(n), each a 60th of a second on
  const STEPPED = () => {
    let t = 1000, q = [];
    performance.now = () => t;
    window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
    window.__frames = (n) => { for (let i = 0; i < n; i++) { t += 1000 / 60; const run = q; q = []; run.forEach((cb) => cb(t)); } };
    // step until fn() is true (at most max frames); the frames it took, or -1
    window.__until = (fn, max) => { for (let i = 0; i <= (max || 3000); i++) { if (fn()) return i; window.__frames(1); } return -1; };
  };
  const open = (opts) => lib.open((opts && opts.ctx) || ctx, base, "games/switcheroo/", {
    before: async (pg) => {
      if (opts && opts.fxOff != null) await pg.addInitScript((off) => localStorage.setItem("reduceMotion:switcheroo", off ? "1" : "0"), opts.fxOff);
      if (opts && opts.stepped) await pg.addInitScript(STEPPED);
      if (opts && opts.seed) await pg.addInitScript((kv) => { for (const k in kv) localStorage.setItem(k, kv[k]); }, opts.seed);
    },
  });

  // ---- the model: every level's switches, as the game plans them
  let p = await open();
  const model = await p.evaluate(() => {
    const L = Switcheroo.limits, bad = [];
    let prev = null, mono = true, minMotion = 1e9, minWatch = 1e9, maxSpeed = 0, longest = 0, fastest = null;
    for (let n = 1; n <= 100; n++) {
      const s = Switcheroo.spec(n);
      if (prev && (s.cups < prev.cups || s.swaps < prev.swaps || s.ms > prev.ms || s.gap > prev.gap || s.pairs < prev.pairs)) mono = false;
      prev = s;
      for (let k = 0; k < 25; k++) {
        const steps = Switcheroo.plan(n);
        let count = 0, total = 0, last = "";
        steps.forEach((st) => {
          count += st.pairs.length; total += st.dur + st.gap;
          const spans = st.pairs.map((q) => q[1] - q[0]), span = Math.max(...spans);
          minMotion = Math.min(minMotion, st.dur);
          minWatch = Math.min(minWatch, (st.dur + st.gap) / st.pairs.length);
          maxSpeed = Math.max(maxSpeed, (span / st.dur) * 1000);
          // within the level's reach, side by side and never overlapping, and each pair once
          if (st.pairs.length > s.pairs || spans.some((d) => d < 1 || d > s.span)) bad.push([n, "reach", st.pairs]);
          const sorted = st.pairs.slice().sort((a, b) => a[0] - b[0]);
          for (let i = 1; i < sorted.length; i++) if (sorted[i][0] <= sorted[i - 1][1]) bad.push([n, "overlap", st.pairs]);
          if (st.pairs.some((q) => q[0] < 0 || q[1] >= s.cups)) bad.push([n, "off the counter", st.pairs]);
          const key = sorted.map((q) => q[0] + "-" + q[1]).join();
          if (key === last) bad.push([n, "undoes the step before", key]);
          last = key;
        });
        if (count !== s.swaps) bad.push([n, "switches", count, s.swaps]);
        longest = Math.max(longest, total);
      }
      if (n === 100) fastest = s;
    }
    const one = Switcheroo.spec(1);
    return { bad: bad.slice(0, 5), mono, minMotion, minWatch: Math.round(minWatch), maxSpeed: +maxSpeed.toFixed(2), longest, fastest, one, L };
  });
  check("switcheroo model: every level up to 100, a switch takes at least 240 ms, a watcher gets at least 180 ms a switch (pairs at once share it), no tumbler crosses more than 9.1 slots a second, and no shuffle runs past 16 s",
    model.bad.length === 0 && model.minMotion >= 240 && model.minWatch >= 180 && model.maxSpeed <= 9.1 && model.longest <= 16000, model);
  check("switcheroo model: the levels only get harder (more tumblers, more switches, quicker), from an easy first one (3 tumblers, 3 marbles, 3 switches of neighbours at 760 ms)",
    model.mono && model.one.cups === 3 && model.one.marbles === 3 && model.one.swaps === 3 && model.one.ms === 760 && model.one.span === 1 && model.one.pairs === 1, model.one);
  const ladder = await p.evaluate(() => [1, 5, 6, 9, 10, 12, 23, 40].map((n) => { const s = Switcheroo.spec(n); return [n, s.cups, s.marbles, s.swaps, s.ms, s.pairs]; }));
  check("switcheroo model: 3 tumblers to start, 4 from level 3, 5 from 6 and 6 from 9; the first empty one at level 5, pairs at once from 6, three pairs from 11",
    ladder.map((r) => r[1]).join() === "3,4,5,6,6,6,6,6" && ladder.map((r) => r[2]).join() === "3,3,4,5,4,6,4,5" && ladder.map((r) => r[5]).join() === "1,1,2,2,2,3,3,3", ladder);

  // ---- the menu: Space or Enter deals, the tally says there's no best yet
  const menu = await p.evaluate(() => ({ cap: document.getElementById("play").getAttribute("data-gs-key"), tally: document.getElementById("tally").textContent, state: Switcheroo.state() }));
  await p.keyboard.press("Space"); await p.waitForTimeout(100);
  const dealt = await p.evaluate(() => ({ state: Switcheroo.state(), phase: Switcheroo.phase(), level: Switcheroo.level(), lives: Switcheroo.lives(), hud: !document.getElementById("hud").hidden, active: GameShell.leaveActive() }));
  check("switcheroo: the menu's button wears Space or Enter, says no round is cleared yet, and Space deals level 1 with three lives (nothing to lose yet)",
    menu.cap === "Space or Enter" && /no round cleared/.test(menu.tally) && dealt.state === "play" && dealt.phase === "deal" && dealt.level === 1 && dealt.lives === 3 && dealt.hud && !dealt.active, { menu, dealt });
  // ---- every word in Chewy, at its one weight (no made-up bold): the question, the HUD, the keys line,
  // the buttons and tally, the corner buttons, and the pause card that borrows the back link's look
  await p.keyboard.press("p"); await p.waitForTimeout(150);
  const faces = await p.evaluate(() => {
    const out = {};
    ["#ask", "#hud", "#keys", "#play", "#tally", "#again", "#to-menu", ".nav-back-games", ".rm-toggle", ".mute-toggle", ".gs-pause-btn", ".gs-pause-card h2", ".gs-pause-card button"].forEach((sel) => {
      const e = document.querySelector(sel);
      if (!e) { out[sel] = "missing"; return; }
      const cs = getComputedStyle(e);
      out[sel] = cs.fontFamily.split(",")[0].replace(/["']/g, "").trim() + " " + cs.fontWeight;
    });
    return out;
  });
  check("switcheroo: its writing is all in Chewy at weight 400 (the question, HUD, keys line, buttons, tally, corner buttons and the pause card)",
    Object.values(faces).every((f) => f === "Chewy 400"), faces);
  await done(p, "model and menu");

  // ---- the shuffle, stepped frame by frame: marbles stay under their own tumblers
  p = await open({ stepped: true });
  const run = await p.evaluate(() => {
    Switcheroo.start(9);
    const dealt = Switcheroo.dealt(), steps = Switcheroo.steps();
    __until(() => Switcheroo.phase() === "shuffle", 2000);
    // during the shuffle: no tumbler is lifted (so no marble shows); mid-step only the pairs' tumblers are away from their slots
    const lifted = [], strays = [];
    let seenMid = 0;
    for (let i = 0; i < 4000 && Switcheroo.phase() === "shuffle"; i++) {
      const d = Switcheroo.drawn();
      d.forEach((c) => { if (c.lift > 0.001 || c.up) lifted.push(c.slot); });
      const moving = d.filter((c) => c.moving);
      if (moving.length && moving[0].p > 0.3 && moving[0].p < 0.7) {
        seenMid++;
        d.forEach((c) => { if (!c.moving && Math.abs(c.x - Switcheroo.slotX(c.slot)) > 0.5) strays.push(c.slot); });
        moving.forEach((c) => { const a = Switcheroo.slotX(c.from), b = Switcheroo.slotX(c.to); if (!(c.x > Math.min(a, b) + 1 && c.x < Math.max(a, b) - 1)) strays.push("mid " + c.slot); });
      }
      __frames(1);
    }
    __until(() => Switcheroo.phase() === "ask", 600);
    // what the switches should have done to the marbles as dealt
    const want = dealt.slice();
    steps.forEach((st) => st.pairs.forEach((q) => { const t = want[q[0]]; want[q[0]] = want[q[1]]; want[q[1]] = t; }));
    const at = Switcheroo.drawn().map((c) => Math.abs(c.x - Switcheroo.slotX(c.slot)) < 0.5);
    return { want: want.join(), got: Switcheroo.contents().join(), dealt: dealt.join(), phase: Switcheroo.phase(), lifted: lifted.length, strays: strays.slice(0, 5), seenMid, home: at.every(Boolean), asking: Switcheroo.asking() };
  });
  check("switcheroo: after a level-9 shuffle every marble is under the tumbler the switches took it to, and each tumbler sits in its slot",
    run.phase === "ask" && run.want === run.got && run.dealt !== run.got && run.home && run.asking >= 0, run);
  check("switcheroo: mid-switch only the switching tumblers are away from their slots, each partway between its two, and nothing is lifted all shuffle long",
    run.seenMid > 0 && run.strays.length === 0 && run.lifted === 0, { seenMid: run.seenMid, strays: run.strays, lifted: run.lifted });

  // ---- picks: a right one finds it, a wrong one costs a life and shows the colour's place
  const picks = await p.evaluate(() => {
    const want = Switcheroo.asking(), right = Switcheroo.where(want), n = Switcheroo.contents().length;
    const r1 = Switcheroo.pick(right);
    const busy = Switcheroo.pick((right + 1) % n);   // (while the tumbler lifts: nothing)
    const after1 = { found: Switcheroo.found(), lives: Switcheroo.lives(), status: document.getElementById("ask").textContent,
      hudFound: document.getElementById("hud-found").textContent, savedFound: localStorage.getItem("switcheroo_best_found") };
    __until(() => Switcheroo.phase() === "ask", 600);
    const want2 = Switcheroo.asking(), right2 = Switcheroo.where(want2);
    // a wrong tumbler: one not yet lifted and not the colour's
    const wrong = Switcheroo.drawn().find((c) => c.slot !== right2 && c.lift < 0.01).slot;
    const r2 = Switcheroo.pick(wrong);
    const after2 = { found: Switcheroo.found(), lives: Switcheroo.lives(), hud: document.getElementById("hud-lives").getAttribute("aria-label"), lost: document.querySelectorAll("#hud-lives i.lost").length };
    __until(() => Switcheroo.drawn()[right2].lift > 0.99, 300);
    const shown = { lifted: Switcheroo.drawn()[right2].lift, status: document.getElementById("ask").textContent };
    __until(() => Switcheroo.phase() === "ask" || Switcheroo.phase() === "clear", 900);
    return { r1, busy, after1, r2, after2, shown, wrongUp: Switcheroo.drawn()[wrong].lift, next: Switcheroo.phase(), active: GameShell.leaveActive(), colour2: Switcheroo.colour(want2) };
  });
  check("switcheroo: a right pick finds the marble (no life lost, \"Found it!\", the HUD's found count 1 and the most found saved at once), and a second pick while it lifts does nothing",
    picks.r1 === true && picks.busy === false && picks.after1.found === 1 && picks.after1.lives === 3 && /Found it/.test(picks.after1.status) &&
    picks.after1.hudFound === "1" && picks.after1.savedFound === "1", picks);
  check("switcheroo: a wrong pick costs a life (the HUD shows two), the asked colour's tumbler then lifts to show it, the wrong one stays up beside it, and the next question comes",
    picks.r2 === true && picks.after2.lives === 2 && picks.after2.found === 1 && picks.after2.lost === 1 && /2 lives/.test(picks.after2.hud) &&
    picks.shown.lifted > 0.99 && picks.shown.status.indexOf(picks.colour2) >= 0 && picks.wrongUp > 0.99 && /^(ask|clear)$/.test(picks.next) && picks.active, picks);
  await done(p, "shuffle and picks");

  // ---- a colour seen under a wrong pick isn't asked: at level 1 (three
  // tumblers, three marbles) a wrong first pick leaves one tumbler down,
  // which then shows itself, and the round clears with no other question
  p = await open({ stepped: true });
  const seen = await p.evaluate(() => {
    Switcheroo.start(1); Switcheroo.skip();
    __until(() => Switcheroo.phase() === "ask", 600);
    const want = Switcheroo.asking(), right = Switcheroo.where(want);
    const wrong = Switcheroo.contents().findIndex((m, slot) => slot !== right && m >= 0), under = Switcheroo.contents()[wrong];
    Switcheroo.pick(wrong);
    const asked = [];
    for (let i = 0; i < 3000 && Switcheroo.phase() !== "clear" && Switcheroo.state() === "play"; i++) { const a = Switcheroo.asking(); if (a >= 0 && asked[asked.length - 1] !== a) asked.push(a); __frames(1); }
    return { under, asked, phase: Switcheroo.phase(), wrongUp: Switcheroo.drawn()[wrong].lift, lives: Switcheroo.lives() };
  });
  check("switcheroo: after a wrong pick both tumblers stay up and the colour seen under the wrong one is never asked (level 1: the last tumbler shows itself and the round clears)",
    seen.phase === "clear" && seen.asked.length === 0 && seen.wrongUp > 0.99 && seen.lives === 2, seen);
  await done(p, "a colour seen isn't asked");

  // ---- a pick, a key or a click mid-shuffle does nothing
  p = await open({ stepped: true });
  await p.evaluate(() => { Switcheroo.start(4); __until(() => Switcheroo.phase() === "shuffle", 2000); __frames(3); });
  const box = await p.evaluate(() => { const r = document.getElementById("stage").getBoundingClientRect(); return { x: r.left + Switcheroo.slotX(0), y: r.top + r.height * 0.6 }; });
  await p.mouse.click(box.x, box.y);
  await p.keyboard.press("1"); await p.keyboard.press("2");
  const mid = await p.evaluate(() => ({ pick: Switcheroo.pick(0), picks: Switcheroo.picks(), lives: Switcheroo.lives(), phase: Switcheroo.phase() }));
  check("switcheroo: mid-shuffle a click on a tumbler, its number key and a pick all do nothing", mid.pick === false && mid.picks === 0 && mid.lives === 3 && mid.phase === "shuffle", mid);

  // ---- a pause mid-shuffle, by every way there is to pause (P, Esc's "Leave this game?",
  // the window losing focus, the tab hiding): the counter hidden and nothing moving
  // while paused, and on resume the very same shuffle carries on from the frame it
  // stopped at (the same round, the same switches to come, each tumbler where it was),
  // never dealt again: a pause is neither a second look nor a fresh start
  const snap = (p) => p.evaluate(() => ({
    serial: Switcheroo.serial(), phase: Switcheroo.phase(), clock: +Switcheroo.clock().toFixed(3), steps: JSON.stringify(Switcheroo.steps()),
    dealt: Switcheroo.dealt().join(), contents: Switcheroo.contents().join(),
    drawn: JSON.stringify(Switcheroo.drawn().map((c) => [+c.x.toFixed(2), +c.y.toFixed(2), c.moving, +c.p.toFixed(4), c.up, +c.lift.toFixed(4)])),
  }));
  const hidden = (p) => p.evaluate(() => ({ body: document.body.classList.contains("paused"), cv: getComputedStyle(document.getElementById("stage")).visibility }));
  const same = (a, b) => ["serial", "phase", "clock", "steps", "dealt", "contents", "drawn"].filter((k) => a[k] !== b[k]);
  const WAYS = [
    ["P", (p) => p.keyboard.press("p"), (p) => p.keyboard.press("p")],
    ["Esc and the leave box (Keep playing)", async (p) => { await p.keyboard.press("Escape"); await p.waitForSelector(".gs-dialog", { timeout: 8000 }).catch(() => {}); }, (p) => p.keyboard.press("Enter")],
    ["the window losing focus", (p) => p.evaluate(() => window.dispatchEvent(new Event("blur"))), (p) => p.keyboard.press("p")],
    ["the tab hiding", (p) => p.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); delete document.hidden; }), (p) => p.keyboard.press("p")],
  ];
  await p.evaluate(() => Switcheroo.start(12));   // (fifteen switches: room for every way in one shuffle)
  const plan0 = await snap(p);
  const ways = [];
  for (const [name, pause, resume] of WAYS) {
    // mid-switch, a pair partway round each other
    const found = await p.evaluate(() => __until(() => Switcheroo.phase() === "shuffle" && Switcheroo.drawn().some((c) => c.moving && c.p > 0.25 && c.p < 0.75), 4000));
    await p.evaluate(() => new Promise((r) => setTimeout(r, 30)));   // (the focus-loss guard's own moment passes)
    const before = await snap(p);
    await pause(p);
    const covered = await hidden(p);
    await p.evaluate(() => __frames(45));
    const during = await snap(p);
    await resume(p);
    await p.waitForFunction(() => !document.querySelector(".gs-dialog") && !document.body.classList.contains("paused"), null, { timeout: 8000 }).catch(() => {});
    const after = await snap(p);
    const shown = await hidden(p);
    await p.evaluate(() => __frames(3));
    const on = await snap(p);
    const moved = JSON.parse(on.drawn).some((c, i) => c[2] && c[3] > JSON.parse(after.drawn)[i][3]);
    ways.push({ name, found, covered, frozen: same(before, during), kept: same(before, after), shown: shown.cv, moved, serial: on.serial === before.serial });
  }
  const done0 = await p.evaluate((d) => {
    __until(() => Switcheroo.phase() === "ask", 6000);
    const want = Switcheroo.dealt();
    JSON.parse(d).forEach((st) => st.pairs.forEach((q) => { const t = want[q[0]]; want[q[0]] = want[q[1]]; want[q[1]] = t; }));
    return { phase: Switcheroo.phase(), right: want.join() === Switcheroo.contents().join() };
  }, plan0.steps);
  const badWays = ways.filter((w) => !(w.found >= 0 && w.covered.body && w.covered.cv === "hidden" && w.frozen.length === 0 && w.kept.length === 0 && w.shown === "visible" && w.moved && w.serial));
  check("switcheroo: a pause mid-shuffle, by P, by Esc's leave box, by the window losing focus or by the tab hiding, hides the counter and freezes it; on resume the same shuffle carries on from that frame (same round, same switches, every tumbler where it was), never dealt again",
    badWays.length === 0, badWays.length ? badWays : ways.map((w) => w.name));
  check("switcheroo: after those four pauses the shuffle still ends with every marble where the round's own switches took it",
    done0.phase === "ask" && done0.right && (await snap(p)).serial === plan0.serial, done0);
  // while the marbles go in, the same: hidden, frozen, and carried on (not dealt again)
  const drop = await p.evaluate(() => { Switcheroo.start(5); __until(() => Switcheroo.phase() === "deal" && Switcheroo.drawn().some((c) => c.up) && Switcheroo.clock() > 0, 10); __frames(30); return true; });
  const d0 = await snap(p);
  await p.keyboard.press("p");
  const dCovered = await hidden(p);
  await p.evaluate(() => __frames(60));
  const d1 = await snap(p);
  await p.keyboard.press("p");
  const d2 = await snap(p);
  const dRest = await p.evaluate(() => { __until(() => Switcheroo.phase() === "shuffle", 3000); return Switcheroo.phase(); });
  const d3 = await snap(p);
  check("switcheroo: a pause while the marbles go in hides the counter and freezes it, and resumes that same deal (then the same switches follow)",
    drop && d0.phase === "deal" && dCovered.cv === "hidden" && same(d0, d1).length === 0 && same(d0, d2).length === 0 && dRest === "shuffle" && d3.serial === d0.serial && d3.dealt === d0.dealt && d3.steps === d0.steps,
    { d0: { phase: d0.phase, serial: d0.serial, clock: d0.clock }, frozen: same(d0, d1), kept: same(d0, d2), dRest, d3: { serial: d3.serial, phase: d3.phase } });
  // at a question: hidden too, and the same question waits after
  const q0 = await p.evaluate(() => { __until(() => Switcheroo.phase() === "ask", 3000); return { serial: Switcheroo.serial(), asking: Switcheroo.asking(), contents: Switcheroo.contents().join() }; });
  await p.keyboard.press("p");
  const qp = await p.evaluate(() => getComputedStyle(document.getElementById("stage")).visibility);
  await p.keyboard.press("1");
  const qkey = await p.evaluate(() => Switcheroo.picks());
  await p.keyboard.press("p");
  const q1 = await p.evaluate(() => ({ serial: Switcheroo.serial(), asking: Switcheroo.asking(), contents: Switcheroo.contents().join(), phase: Switcheroo.phase() }));
  check("switcheroo: paused at a question the counter is hidden too and a number key picks nothing; resumed, the same question and tumblers wait",
    qp === "hidden" && qkey === 0 && q1.serial === q0.serial && q1.asking === q0.asking && q1.contents === q0.contents && q1.phase === "ask", { q0, qp, qkey, q1 });
  // the number keys pick at a question
  const key = await p.evaluate(() => Switcheroo.where(Switcheroo.asking()));
  await p.keyboard.press(String(key + 1));
  const keyed = await p.evaluate(() => ({ picks: Switcheroo.picks(), found: Switcheroo.found() }));
  check("switcheroo: at a question a tumbler's number key picks it", keyed.picks === 1 && keyed.found === 1, { key, keyed });
  await done(p, "pause and keys");

  // ---- a round cleared: the next level, the best saved at that moment; three misses end the run
  p = await open({ stepped: true });
  const clear = await p.evaluate(() => {
    Switcheroo.start(1);
    const out = { picks: [] };
    for (let i = 0; i < 6 && Switcheroo.phase() !== "clear"; i++) {
      __until(() => Switcheroo.phase() === "ask" || Switcheroo.phase() === "clear", 4000);
      if (Switcheroo.phase() === "ask") out.picks.push(Switcheroo.pick(Switcheroo.where(Switcheroo.asking())));
      __until(() => Switcheroo.phase() !== "show", 400);
    }
    __until(() => Switcheroo.phase() === "clear", 400);
    out.clearing = { phase: Switcheroo.phase(), level: Switcheroo.level(), stored: localStorage.getItem("switcheroo_best"), status: document.getElementById("ask").textContent };
    __until(() => Switcheroo.level() === 2, 400);
    out.next = { level: Switcheroo.level(), phase: Switcheroo.phase(), cups: Switcheroo.contents().length, hud: document.getElementById("hud-level").textContent };
    return out;
  });
  check("switcheroo: finding every colour clears the round (the last tumbler shows itself), the best level (2) saved the moment it's reached, before level 2 is dealt",
    clear.picks.length === 2 && clear.picks.every(Boolean) && clear.clearing.phase === "clear" && clear.clearing.level === 1 && clear.clearing.stored === "2" && /level 2/.test(clear.clearing.status), clear);
  check("switcheroo: then level 2 is dealt (three tumblers again, more switches), the HUD saying so",
    clear.next.level === 2 && clear.next.phase === "deal" && clear.next.cups === 3 && clear.next.hud === "2", clear.next);
  const lost = await p.evaluate(() => {
    const wrong = () => { __until(() => Switcheroo.phase() === "ask" || Switcheroo.state() !== "play", 4000); if (Switcheroo.state() !== "play") return false;
      const r = Switcheroo.where(Switcheroo.asking()), w = Switcheroo.drawn().find((c) => c.slot !== r && c.lift < 0.01); return Switcheroo.pick(w.slot); };
    // (misses until the lives are gone: at level 2, with no empty tumbler, a
    // miss leaves the third colour's tumbler the only one down, which shows
    // itself, and the run goes on to level 3)
    const out = [];
    let at = 0, lostPhase = "";
    for (let i = 0; i < 6 && Switcheroo.lives() > 0; i++) {
      out.push(wrong()); at = Switcheroo.level();
      __until(() => Switcheroo.phase() !== "show", 600);
      if (Switcheroo.lives() === 0) lostPhase = Switcheroo.phase();
    }
    __until(() => Switcheroo.state() === "over", 400);
    return { out, at, lostPhase, state: Switcheroo.state(), lives: Switcheroo.lives(), card: !document.getElementById("over").hidden, msg: document.getElementById("over-msg").textContent, stats: document.getElementById("over-stats").textContent, active: GameShell.leaveActive() };
  });
  check("switcheroo: the third miss ends the run: the counter shows everything, then the card (the level it ended on, the rounds cleared, a new best)",
    lost.out.length === 3 && lost.out.every(Boolean) && lost.lostPhase === "lost" && lost.state === "over" && lost.lives === 0 && lost.card && lost.msg === "Level " + lost.at &&
    new RegExp("^" + (lost.at - 1) + " rounds? cleared").test(lost.stats) && /best level yet/.test(lost.stats) && !lost.active, lost);
  // the card: Space waits a moment (one pressed as the run ended doesn't skip it), then deals; Backspace the menu
  await p.keyboard.press("Space");
  const early = await p.evaluate(() => Switcheroo.state());
  // (Esc on the card leaves for the games page at once: the run is over, so nothing asks)
  await p.keyboard.press("Escape");
  const escLeft = await lib.leftBy(p, 1);
  const escBox = await p.evaluate(() => !!document.querySelector(".gs-dialog"));
  check("switcheroo: Esc on the end card leaves for the games page without asking", escLeft === 1 && !escBox, { escLeft, escBox });
  await p.evaluate(() => __frames(50));
  const caps = await p.evaluate(() => ({ again: document.getElementById("again").getAttribute("data-gs-key"), menu: document.getElementById("to-menu").getAttribute("data-gs-key") }));
  await p.keyboard.press("Space");
  const again = await p.evaluate(() => ({ state: Switcheroo.state(), level: Switcheroo.level(), lives: Switcheroo.lives() }));
  check("switcheroo: on the card a Space in its first moment does nothing; then Space (worn with Enter on Again) deals a new run from level 1",
    early === "over" && caps.again === "Space or Enter" && caps.menu === "⌫" && again.state === "play" && again.level === 1 && again.lives === 3, { early, caps, again });
  await p.evaluate(() => { Switcheroo.skip(); const w = Switcheroo.where(Switcheroo.asking()); const n = Switcheroo.contents().length;
    for (let i = 0; i < 3; i++) { __until(() => Switcheroo.phase() === "ask" || Switcheroo.state() !== "play", 4000); if (Switcheroo.state() !== "play") break;
      const r = Switcheroo.where(Switcheroo.asking()); const x = Switcheroo.drawn().find((c) => c.slot !== r && c.lift < 0.01); Switcheroo.pick(x.slot); __until(() => Switcheroo.phase() !== "show", 600); }
    __until(() => Switcheroo.state() === "over", 400); __frames(50); });
  await p.keyboard.press("Backspace");
  const toMenu = await p.evaluate(() => ({ state: Switcheroo.state(), menu: !document.getElementById("menu").hidden, tally: document.getElementById("tally").textContent }));
  check("switcheroo: Backspace on the card goes to the menu, which shows the best level and the most found", toMenu.state === "menu" && toMenu.menu &&
    new RegExp("^best: reached level " + lost.at + " · most found: \\d+$").test(toMenu.tally), { toMenu, at: lost.at });
  await done(p, "levels and the end");

  // ---- Visual FX off: the tumblers still travel round each other, and lift, frame by frame
  for (const off of [true, false]) {
    p = await open({ stepped: true, fxOff: off });
    const fx = await p.evaluate(() => {
      Switcheroo.start(3);
      __until(() => Switcheroo.drawn().some((c) => c.moving && c.p > 0.2), 3000);
      const a = Switcheroo.drawn().filter((c) => c.moving);
      __frames(4);
      const b = Switcheroo.drawn().filter((c) => c.moving);
      const between = a.every((c) => { const x0 = Switcheroo.slotX(c.from), x1 = Switcheroo.slotX(c.to); return c.x > Math.min(x0, x1) + 1 && c.x < Math.max(x0, x1) - 1; });
      const arcs = a.map((c) => Math.round(c.y)).sort().join();
      const moved = a.length && b.length && Math.abs(a[0].x - b[0].x) > 0.5;
      // the first question's pick: its tumbler rises over several frames
      __until(() => Switcheroo.phase() === "ask", 4000);
      const slot = Switcheroo.where(Switcheroo.asking());
      Switcheroo.pick(slot); __frames(5);
      const part = Switcheroo.drawn()[slot].lift;
      __frames(30);
      return { rm: RM_ON(), moving: a.length, between, moved, arcs, part: +part.toFixed(2), full: Switcheroo.drawn()[slot].lift };
    });
    check("switcheroo, Visual FX " + (off ? "off" : "on") + ": a switching pair travels (partway between its slots, moving from frame to frame, one round the front and one round the back), and a picked tumbler rises over several frames",
      fx.rm === off && fx.moving === 2 && fx.between && fx.moved && new Set(fx.arcs.split(",")).size === 2 && fx.part > 0.05 && fx.part < 0.95 && fx.full > 0.99, fx);
    await done(p, "fx " + (off ? "off" : "on"));
  }

  // ---- the leave guard: a fresh run has nothing to lose; a pick makes it a run in progress, through a re-deal too
  p = await open({ stepped: true });
  const guard = await p.evaluate(() => {
    Switcheroo.start(1);
    const a0 = GameShell.leaveActive();
    Switcheroo.skip(); Switcheroo.pick(Switcheroo.where(Switcheroo.asking()));
    const a1 = GameShell.leaveActive();
    return { a0, a1 };
  });
  check("switcheroo: a fresh run asks nothing on the way out; once a pick is made it does", guard.a0 === false && guard.a1 === true, guard);
  await done(p, "guard");

  // ---- fit: the menu, the counter in play and the end card, with nothing scrolling, at laptop and phone sizes
  const SIZES = [[1280, 900], [1366, 657], [1280, 600], [390, 664], [360, 560], [375, 553], [320, 568]];
  const misfit = [];
  for (const [w, h] of SIZES) {
    const phone = w < 600;
    const c = await lib.newContext(browser, phone ? Object.assign({}, devices["iPhone 13"], { viewport: { width: w, height: h } }) : { viewport: { width: w, height: h } });
    const q = await lib.open(c, base, "games/switcheroo/");
    const measure = (what) => q.evaluate(([w, h, what]) => {
      const de = document.documentElement, out = [];
      if (de.scrollWidth > w || de.scrollHeight > h) out.push("page " + de.scrollWidth + "x" + de.scrollHeight);
      document.querySelectorAll(".panel").forEach((pn) => { if (!pn.hidden && pn.scrollHeight > pn.clientHeight + 1) out.push(pn.id + " scrolls " + pn.scrollHeight + "/" + pn.clientHeight); });
      if (what === "play") {
        ["hud", "ask", "counter", "keys"].forEach((id) => { const r = document.getElementById(id).getBoundingClientRect(); if (r.height && (r.bottom > h + 0.5 || r.right > w + 0.5 || r.left < -0.5)) out.push(id + " off the screen"); });
        const corner = Math.max(...[...document.querySelectorAll(".nav-back-games, .gs-corner > *")].map((e) => e.getBoundingClientRect().bottom));
        if (document.getElementById("hud").getBoundingClientRect().top < corner - 0.5) out.push("hud under the corner buttons");
        // the row of tumblers, lifted ones and the keys under them, inside the counter
        const cv = document.getElementById("stage").getBoundingClientRect(), d = Switcheroo.drawn();
        if (d.some((t) => t.x - 10 < 0 || t.x + 10 > cv.width)) out.push("a tumbler off the counter");
        const ask = document.getElementById("ask");
        if (ask.scrollWidth > ask.clientWidth + 1 && ask.getBoundingClientRect().width >= w - 1) out.push("the question is cut off");
      }
      return out.map((s) => w + "x" + h + " " + what + ": " + s);
    }, [w, h, what]);
    misfit.push(...await measure("menu"));
    await q.evaluate(() => { Switcheroo.start(12); Switcheroo.skip(); });
    await q.waitForTimeout(150);
    misfit.push(...await measure("play"));
    // the longest question there is, on the counter's own line
    await q.evaluate(() => { const el = document.getElementById("ask"); el.className = "ask bad"; el.textContent = "Nothing under that one"; });
    misfit.push(...await q.evaluate(([w]) => { const e = document.getElementById("ask"), r = e.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(e); const t = range.getBoundingClientRect();
      return t.left < -0.5 || t.right > w + 0.5 ? [w + ": \"Nothing under that one\" runs off the screen"] : []; }, [w]));
    await q.evaluate(() => { Switcheroo.toMenu(); });
    await q.close(); await c.close();
  }
  check("switcheroo fit: at 1280x900, 1366x657, 1280x600 and on 390x664, 360x560, 375x553 and 320x568 phones the menu and the counter in play fit with nothing scrolling or off the screen",
    misfit.length === 0, misfit);

  // ---- a phone: a tap on a tumbler picks it; the keys line speaks of taps
  {
    const c = await lib.newContext(browser, devices["iPhone 13"]);
    const q = await lib.open(c, base, "games/switcheroo/");
    await q.tap("#play");
    await q.evaluate(() => Switcheroo.skip());
    const at = await q.evaluate(() => { const r = document.getElementById("stage").getBoundingClientRect(), s = Switcheroo.where(Switcheroo.asking()); return { x: r.left + Switcheroo.slotX(s), y: r.top + Switcheroo.drawn()[s].y - 20 }; });
    await q.touchscreen.tap(at.x, at.y);
    const tapped = await q.evaluate(() => ({ picks: Switcheroo.picks(), found: Switcheroo.found(), touch: getComputedStyle(document.querySelector("#keys .gs-touch")).display !== "none" && getComputedStyle(document.querySelector("#keys .gs-keys")).display === "none" }));
    check("switcheroo (phone): a tap on the asked colour's tumbler finds it, and the line under the counter speaks of taps, not keys", tapped.picks === 1 && tapped.found === 1 && tapped.touch, tapped);
    check("switcheroo (phone): no page errors", q.errs.length === 0, q.errs);
    await q.close(); await c.close();
  }

  // ---- the games page's reset clears the best
  {
    const q = await lib.open(ctx, base, "games/", { waitCorner: false, before: (pg) => pg.addInitScript(() => { try { localStorage.setItem("switcheroo_best", "7"); localStorage.setItem("switcheroo_best_found", "12"); localStorage.setItem("reduceMotion:switcheroo", "1"); } catch (e) {} }) });
    const before = await q.evaluate(() => localStorage.getItem("switcheroo_best"));
    await q.click("#reset-scores"); await q.waitForTimeout(150);
    await q.click("#reset-dialog .dialog-ok"); await q.waitForTimeout(200);
    const after = await q.evaluate(() => ({ best: localStorage.getItem("switcheroo_best"), found: localStorage.getItem("switcheroo_best_found"), fx: localStorage.getItem("reduceMotion:switcheroo") }));
    check("switcheroo: the games page's reset all high scores clears its best level and most found (and keeps its Visual FX setting)", before === "7" && after.best === null && after.found === null && after.fx === "1", { before, after });
    await q.close();
  }

  await ctx.close();
};
