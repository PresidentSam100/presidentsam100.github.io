// Sowing: the menu takes 1 to 3 for the opponent (shown on them, the pick
// kept) and Space or Enter begins; seeds are sown one to a pit round the
// board, into your own store but never the other; the last seed in your
// store sows again; the last in an empty pit of yours takes the pit across;
// a row run dry ends the game, each row's seeds to its own store; a keeper
// answers each sowing; the near pits take 1 to 6 (shown on them), and in a
// friend's game the far row takes them on its turn, its pits wearing them
// then; Undo goes back to before your last sowing and Hint rings a good pit;
// paused, keys sow nothing; the end card counts the stores, keeps the record, ignores Space
// for a moment, then plays again, and Backspace goes to the menu; sowing
// keeps its pace with Visual FX off (only the hop goes); on a phone a tap on
// one of your pits sows from it; Hint, Undo, New game and Menu have their
// words and keycaps in the middle of the button's face.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const open = (c, opts) => lib.open(c || ctx, base, "games/sowing/", opts);
  const done = async (p, what) => { check("sowing " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  const idle = (p) => p.waitForFunction(() => !Sowing.busy(), null, { timeout: 15000 });
  const wait = (p, ms) => p.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), ms);

  // ---- the rules, by themselves
  let p = await open();
  const rules = await p.evaluate(() => {
    const R = Sowing.rules;
    // from pit 2 of a fresh board: 4 seeds into 3, 4, 5 and the store, so sow again
    const a = R.sow(R.fresh(4), 2, 0);
    // from pit 5: 4 seeds into the store and the far pits 7, 8, 9
    const b = R.sow(R.fresh(4), 5, 0);
    // the far side never sows into the near store: 13 seeds from far pit 12 go round past it
    const c0 = R.fresh(0); c0[12] = 13; c0[0] = 1;
    const c = R.sow(c0, 12, 1);
    // a capture: the last seed in an empty pit of yours takes the pit across
    const d0 = R.fresh(0); d0[1] = 2; d0[3] = 0; d0[9] = 5; d0[7] = 1;
    const d = R.sow(d0, 1, 0);
    // a row run dry: the other row's seeds go to their own store
    const e0 = R.fresh(0); e0[5] = 1; e0[8] = 3; e0[10] = 2; e0[6] = 10; e0[13] = 9;
    const e = R.sow(e0, 5, 0);
    return { a: [a.board.join(), a.again, a.next], b: [b.board.join(), b.next], c: [c.board[6], c.path.includes(6), c.board[13]], d: [d.captured && d.captured.n, d.board[6], d.board[3], d.board[9]], e: [e.ended, e.board[6], e.board[13]] };
  });
  check("sowing: seeds go one to a pit round the board; the last in your store sows again; the other side never sows into your store",
    rules.a[0] === "4,4,0,5,5,5,1,4,4,4,4,4,4,0" && rules.a[1] === true && rules.a[2] === 0 && rules.b[0] === "4,4,4,4,4,0,1,5,5,5,4,4,4,0" && rules.b[1] === 1 &&
      rules.c[1] === false && rules.c[0] === 0, rules);
  check("sowing: the last seed in an empty pit of yours takes it and every seed across from it; a row run dry ends it, each row's seeds to its own store",
    rules.d.join() === "6,6,0,0" && rules.e[0] === true && rules.e[1] === 11 && rules.e[2] === 14, rules);

  // ---- the menu, and a keeper answering
  const caps = await p.evaluate(() => [...document.querySelectorAll("#pick-foe button, #play")].map((b) => (b.querySelector("[data-gs-key]") || b).getAttribute("data-gs-key")));
  await p.keyboard.press("1"); await p.waitForTimeout(80);
  const kept = await p.evaluate(() => localStorage.getItem("sowing_foe"));
  await p.keyboard.press("2"); await p.keyboard.press("Space"); await p.waitForTimeout(200);
  const began = await p.evaluate(() => ({ state: Sowing.state(), foe: Sowing.foe(), turn: Sowing.turn(), pitKeys: [...document.querySelectorAll(".pit")].slice(0, 6).map((e) => e.getAttribute("data-gs-key")).join("") }));
  check("sowing: the opponents wear 1 to 3 and Sow Space or Enter; 1 picks the farmer's boy (kept); Space begins with your row's pits wearing 1 to 6",
    caps.join() === "1,2,3,Space or Enter" && kept === "boy" && began.state === "play" && began.foe === "grandmother" && began.turn === 0 && began.pitKeys === "123456", { caps, kept, began });
  // 6 sows from the last pit: 4 seeds into the store and the far pits, so the grandmother sows next
  await p.keyboard.press("6"); await idle(p);
  const answered = await p.evaluate(() => ({ turn: Sowing.turn(), board: Sowing.board() }));
  check("sowing: 6 sows from your last pit, and the grandmother answers with a sowing of her own",
    answered.turn === 0 && answered.board.reduce((a, b) => a + b, 0) === 48 && answered.board.join() !== "4,4,4,4,4,0,1,5,5,5,4,4,4,0", answered);
  // ---- Undo, Hint
  await p.keyboard.press("u"); await idle(p);
  const undone = await p.evaluate(() => Sowing.board().join());
  await p.keyboard.press("h"); await p.waitForTimeout(80);
  const hinted = await p.evaluate(() => ({ at: Sowing.hintAt(), ringed: !!document.querySelector(".pit.hint") }));
  check("sowing: U takes back your sowing and the answer to it; H rings one of your pits",
    undone === "4,4,4,4,4,4,0,4,4,4,4,4,4,0" && hinted.at >= 0 && hinted.at <= 5 && hinted.ringed, { undone, hinted });
  // ---- paused, keys sow nothing
  await p.keyboard.press("p"); await p.waitForTimeout(120);
  await p.keyboard.press("3"); await p.waitForTimeout(200);
  const paused = await p.evaluate(() => Sowing.board().join());
  check("sowing: paused, a number key sows nothing", paused === "4,4,4,4,4,4,0,4,4,4,4,4,4,0", paused);
  await done(p, "menu and play");

  // ---- a friend's game: the keycaps go to the row whose turn it is, as the
  // keys do (the far row's 1 at the right, where its keys start), each
  // centred on its pit and clear of the pit's count
  p = await open();
  await p.evaluate(() => { document.querySelector('#pick-foe button[data-v="friend"]').click(); Sowing.start(); });
  const keysOn = () => p.evaluate(() => {
    const pit = (i) => document.querySelector('.pit[data-i="' + i + '"]');
    const row = (is) => is.map((i) => pit(i).getAttribute("data-gs-key") || "-").join("");
    const one = [...document.querySelectorAll('.pit[data-gs-key="1"]')].map((e) => {
      const r = e.getBoundingClientRect(), n = e.querySelector(".n").getBoundingClientRect(), cs = getComputedStyle(e, "::after");
      const top = parseFloat(cs.top), h = parseFloat(cs.height);
      return { i: +e.dataset.i, shown: cs.display !== "none", mid: +(parseFloat(cs.left) + parseFloat(cs.marginLeft) - r.width / 2).toFixed(1),
        clear: n.bottom - r.top <= top + 0.5 || n.top - r.top >= top + h - 0.5 };
    });
    return { near: row([0, 1, 2, 3, 4, 5]), far: row([12, 11, 10, 9, 8, 7]), one };
  });
  const nearTurn = await keysOn();
  await p.keyboard.press("1"); await idle(p);   // 4 seeds from the first pit: the far row's turn
  const farTurn = await keysOn();
  await p.keyboard.press("1"); await idle(p);
  const farSowed = await p.evaluate(() => ({ turn: Sowing.turn(), seven: Sowing.board()[7] }));
  const capOk = (s) => s.one.length === 1 && s.one[0].shown && Math.abs(s.one[0].mid) <= 1 && s.one[0].clear;
  check("sowing: in a friend's game the row whose turn it is wears 1 to 6 (the far row's 1 at the right) and its 1 sows from there; each keycap centred on its pit, clear of the count",
    nearTurn.near === "123456" && nearTurn.far === "------" && farTurn.near === "------" && farTurn.far === "654321" && capOk(nearTurn) && capOk(farTurn) &&
      nearTurn.one[0].i === 0 && farTurn.one[0].i === 7 && farSowed.seven === 0, { nearTurn, farTurn, farSowed });
  await done(p, "a friend's keys");

  // ---- the end card
  p = await open();
  // (the early Space goes in the moment the card shows: sent after a round
  // trip, a busy machine could have it land after the card's wait)
  const early = await p.evaluate(() => new Promise((r) => {
    localStorage.removeItem("sowing_record_grandmother");
    document.querySelector('#pick-foe button[data-v="grandmother"]').click();
    Sowing.start();
    const b = new Array(14).fill(0);
    b[5] = 1; b[6] = 30; b[13] = 15; b[9] = 2;
    Sowing.setBoard(b, 0);
    const over = document.getElementById("over");
    new MutationObserver((ms, mo) => {
      if (over.hidden) return;
      mo.disconnect();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
      r(Sowing.state());
    }).observe(over, { attributes: true, attributeFilter: ["hidden"] });
    Sowing.play(5);
  }));
  const card = await p.evaluate(() => ({ title: document.getElementById("over-title").textContent, msg: document.getElementById("over-msg").textContent, stats: document.getElementById("over-stats").textContent, rec: localStorage.getItem("sowing_record_grandmother") }));
  await wait(p, 900);
  await p.keyboard.press("Space"); await p.waitForTimeout(200);
  const again = await p.evaluate(() => Sowing.state());
  check("sowing: the end card counts the stores (31 to 17 here) and keeps the record; Space waits a moment, then plays again",
    card.title === "Your harvest is bigger" && card.msg === "31 to 17" && JSON.parse(card.rec).w === 1 && /against the grandmother: 1 W/.test(card.stats) && early === "over" && again === "play", { card, early, again });
  await p.evaluate(() => { const b = new Array(14).fill(0); b[5] = 1; b[6] = 3; b[13] = 30; b[9] = 2; Sowing.setBoard(b, 0); Sowing.play(5); });
  await p.waitForFunction(() => Sowing.state() === "over", null, { timeout: 8000 });
  await wait(p, 900);
  await p.keyboard.press("Backspace"); await p.waitForTimeout(200);
  check("sowing: Backspace on the end card goes to the menu", (await p.evaluate(() => Sowing.state())) === "menu", null);
  await done(p, "end card");

  // ---- the pace is the same with Visual FX off: only the hop goes
  const pace = {};
  for (const off of [true, false]) {
    const q = await open(null, { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:sowing", off ? "1" : "0"); localStorage.setItem("sowing_foe", "friend"); } catch (e) {} }, off) });
    // (timed on a second sowing, the page warmed up by a first)
    pace[off ? "off" : "on"] = await q.evaluate(() => new Promise((res) => {
      Sowing.start();
      Sowing.play(1);
      (function warm() {
        if (Sowing.busy()) return requestAnimationFrame(warm);
        const t0 = performance.now(); let hop = false;
        new MutationObserver(() => { if (document.querySelector(".pit.drop, .store.drop")) hop = true; }).observe(document.getElementById("board"), { subtree: true, attributes: true, attributeFilter: ["class"] });
        Sowing.play(8);
        (function look() { if (Sowing.busy()) return requestAnimationFrame(look); res({ ms: Math.round(performance.now() - t0), hop }); })();
      })();
    }));
    await done(q, "FX " + (off ? "off" : "on"));
  }
  check("sowing: with Visual FX on each pit hops as a seed drops in; off, no hop, and the sowing takes as long", pace.on.hop && !pace.off.hop && Math.abs(pace.on.ms - pace.off.ms) < 250, pace);

  // ---- on a phone: a tap on one of your pits sows from it
  {
    const { devices } = require("@playwright/test");
    const c = await lib.newContext(browser, devices["Pixel 7"]);
    const q = await open(c);
    await q.evaluate(() => { document.querySelector('#pick-foe button[data-v="friend"]').click(); Sowing.start(); });
    const r = await q.evaluate(() => { const e = document.querySelector('.pit[data-i="2"]').getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2, w: e.width }; });
    await q.touchscreen.tap(r.x, r.y); await idle(q);
    const b = await q.evaluate(() => Sowing.board());
    check("sowing, phone: a tap on one of your pits sows from it (the pits a fair size to tap)", b[2] === 0 && b[6] === 1 && r.w >= 32, { b, w: r.w });
    await done(q, "phone");
    await c.close();
  }

  // ---- Hint, Undo, New game and Menu: each label in the middle of its
  // button's black face top to bottom (the face is above the red foot drawn
  // inside the button), and where there's a keyboard each keycap too. The
  // first capital is read from the pixels, four to a CSS pixel. The suites
  // keep the web fonts out, so Work Sans comes as a stand-in face given its
  // own heights (its line sits as Work Sans's does).
  {
    const { devices } = require("@playwright/test");
    const WORK = '@font-face { font-family: "Work Sans"; src: local("Arial"); font-weight: 100 900; ascent-override: 93%; descent-override: 24%; line-gap-override: 0%; }';
    for (const [label, opts] of [["laptop", { deviceScaleFactor: 4 }], ["phone", Object.assign({}, devices["Pixel 7"], { deviceScaleFactor: 4 })]]) {
      const c = await lib.newContext(browser, opts);
      await c.route(/fonts\.googleapis/, (r) => r.fulfill({ contentType: "text/css", body: WORK }));
      const q = await open(c);
      await q.evaluate(() => Sowing.start()); await q.waitForTimeout(200);
      const seen = [];
      for (const id of ["btn-hint", "btn-undo", "btn-new", "btn-menu"]) {
        const g = await q.evaluate((id) => {
          const b = document.getElementById(id), cs = getComputedStyle(b), r = b.getBoundingClientRect();
          const top = r.top + parseFloat(cs.borderTopWidth), foot = r.bottom - parseFloat(cs.borderBottomWidth) - 3;
          const t = [...b.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim()), at = t.textContent.search(/\S/), rg = document.createRange();
          rg.setStart(t, at); rg.setEnd(t, at + 1);
          const ch = rg.getBoundingClientRect();
          // the keycap, drawn from the attribute (::after), read through a twin of it drawn the same in its place
          let key = null;
          const ks = getComputedStyle(b, "::after");
          if (b.hasAttribute("data-gs-key") && ks.display !== "none") {
            const twin = document.createElement("span"), st = document.createElement("style");
            for (const prop of ks) twin.style.setProperty(prop, ks.getPropertyValue(prop));
            twin.style.setProperty("content", "normal"); twin.textContent = b.getAttribute("data-gs-key");
            st.textContent = ".twin-of::after { display: none !important; }"; document.head.appendChild(st);
            b.classList.add("twin-of"); b.appendChild(twin);
            const kr = twin.getBoundingClientRect(); key = +((kr.top + kr.bottom) / 2 - (top + foot) / 2).toFixed(2);
            twin.remove(); st.remove(); b.classList.remove("twin-of");
          }
          return { id, x: r.left, y: r.top, right: r.right, bottom: r.bottom, top, foot, cx0: ch.left, cx1: ch.right, key };
        }, id);
        const clip = { x: Math.floor(g.x), y: Math.floor(g.y), width: Math.ceil(g.right) - Math.floor(g.x), height: Math.ceil(g.bottom) - Math.floor(g.y) };
        const png = (await q.screenshot({ clip })).toString("base64");
        seen.push(await q.evaluate(async ({ png, g, clip }) => {
          const S = 4, img = new Image(); img.src = "data:image/png;base64," + png; await img.decode();
          const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
          const x = cv.getContext("2d"); x.drawImage(img, 0, 0);
          const d = x.getImageData(0, 0, cv.width, cv.height).data, W = cv.width;
          const lum = (i, j) => { const n = (j * W + i) * 4; return 0.3 * d[n] + 0.59 * d[n + 1] + 0.11 * d[n + 2]; };
          const row = (y) => Math.round((y - clip.y) * S), col = (v) => Math.round((v - clip.x) * S);
          let t = -1, bt = -1;   // the rows the cream capital has ink in, on the black face
          for (let j = row(g.top + 0.5); j < row(g.foot); j++) {
            let lit = false; for (let i = col(g.cx0); i < col(g.cx1) && !lit; i++) lit = lum(i, j) > 150;
            if (lit) { if (t < 0) t = j; bt = j; }
          }
          return { id: g.id, above: +(clip.y + t / S - g.top).toFixed(2), below: +(g.foot - clip.y - (bt + 1) / S).toFixed(2), key: g.key };
        }, { png, g, clip }));
      }
      const keyed = label === "laptop";
      check("sowing " + label + ": Hint, Undo, New game and Menu each have their label in the middle of the button's face, above the red foot" + (keyed ? ", and their keycaps too" : ""),
        seen.length === 4 && seen.every((s) => s.above > 2 && s.below > 2 && Math.abs(s.above - s.below) <= 1.2 && (keyed ? s.key !== null && Math.abs(s.key) <= 0.6 : s.key === null)), seen);
      await done(q, "tool buttons, " + label);
      await c.close();
    }
  }
  await ctx.close();
};
