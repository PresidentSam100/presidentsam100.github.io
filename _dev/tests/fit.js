// Fit on a phone: no page is wider than the screen, a menu's heading starts
// below the corner buttons, a stat row or a board shares the width there is,
// and the hint in an empty answer box shows whole.
//
// Width is measured against the screen's own width, passed in: a phone's
// browser widens its layout to hold a page that is too wide, so innerWidth
// and scrollWidth can agree with each other and both be wrong.
//
// The suites run with the web fonts blocked (lib.js), so these are measured
// in each page's fallback faces; every check here was shown to fail that way
// on the code before the fixes, and to pass with the real fonts let through
// as well as without them.
module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  const phone = (w, h) => Object.assign({}, devices["iPhone 13"], { viewport: { width: w, height: h } });
  const SIZES = [[320, 568], [360, 640], [390, 664]];
  const you = (p) => p.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); });

  // how much wider than the screen the page is (0 when it fits), and any corner button off it
  const side = (p, w) => p.evaluate((w) => {
    const off = Array.from(document.querySelectorAll(".nav-back-games, .gs-corner > *")).filter((e) => e.getClientRects().length)
      .filter((e) => { const r = e.getBoundingClientRect(); return r.right > w + 1 || r.left < -1; }).map((e) => e.className.split(" ")[0]);
    return { wider: Math.max(0, Math.round(Math.max(document.documentElement.scrollWidth, innerWidth) - w)), off };
  }, w);
  // how far below the corner buttons an element's text starts (negative: under them)
  const below = (p, sel) => p.evaluate((sel) => {
    const e = Array.from(document.querySelectorAll(sel)).find((x) => x.getClientRects().length);
    if (!e) return null;
    const row = Array.from(document.querySelectorAll(".nav-back-games, .gs-corner > *")).filter((x) => x.getClientRects().length).map((x) => x.getBoundingClientRect().bottom);
    return Math.round(e.getBoundingClientRect().top - Math.max.apply(null, row));
  }, sel);
  // an empty box's hint against the room inside the box (in the hint's own size)
  const hint = (p, sel) => p.evaluate((sel) => {
    const e = document.querySelector(sel), cs = getComputedStyle(e), ps = getComputedStyle(e, "::placeholder"), cv = document.createElement("canvas").getContext("2d");
    cv.font = cs.fontStyle + " " + cs.fontWeight + " " + ps.fontSize + " " + cs.fontFamily;
    const w = cv.measureText(e.placeholder).width + (parseFloat(ps.letterSpacing) || 0) * e.placeholder.length;
    return { hint: Math.round(w), room: Math.round(e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) };
  }, sel);

  // ---- every game's first screen on the smallest phone: nothing off the side;
  // and where a menu card is taller than that screen, its heading is still
  // below the corner buttons (the card starts under them and scrolls)
  const HEAD = {
    "abyss/": ".card h1", "tall-order/": ".card h1", "rose-window/": ".card h1", "mesa-drift/": ".card h1", "stone-garden/": ".card h2", "sowing/": ".card h2", "potting-shed/": ".card h1", "spice-blend/": ".card h2", "tide-pool/": ".card h1", "stopwatch/": ".card h2", "speedle/": ".card-title", "reaction/": ".card h2",
    "tic-tac-toe/": ".modal-overlay.open .modal h2", "departures/": ".card h1", "crazy-ohio/": "header.top h1",
  };
  {
    const ctx = await lib.newContext(browser, phone(320, 568));
    const wide = {}, under = {}, errs = {};
    for (const pg of lib.gamePages()) {
      const p = await lib.open(ctx, base, "games/" + pg);
      await p.waitForTimeout(250);
      const s = await side(p, 320);
      if (s.wider || s.off.length) wide[pg] = s;
      if (HEAD[pg]) { const b = await below(p, HEAD[pg]); if (b === null || b < 0) under[pg] = b; }
      if (p.errs.length) errs[pg] = p.errs;
      await p.close();
    }
    await ctx.close();
    check("fit: on a 320 px phone no game's first screen is wider than the screen, and every corner button is on it", Object.keys(wide).length === 0, wide);
    check("fit: on a 320 px phone a menu's heading starts below the corner buttons, not under them (" + Object.keys(HEAD).length + " games)", Object.keys(under).length === 0, under);
    check("fit (first screens): no page errors", Object.keys(errs).length === 0, errs);
  }

  // ---- in play, at three phone widths: the page still fits, with the things
  // that used to push it out (a row of stats, a board, a turning radar sweep)
  const PLAY = [
    ["reaction", "reaction/", "four stat tickets, a false start's long figures in them", async (p) => { await p.click("#btn-start"); await p.waitForTimeout(200); await p.keyboard.press("Space"); await p.waitForTimeout(300); }],
    ["salvo", "salvo/", "the board, its fleet tags and the radar's turning sweep", async (p) => { await you(p); await p.keyboard.press("a"); await p.keyboard.press("Enter"); await p.waitForTimeout(300); await p.click("#enemyGrid .cell"); await p.waitForTimeout(700); }],
    ["link-many", "link-many/", "the seven holes across and the stand's feet", async (p) => { await you(p); await p.click("#startGame"); await p.waitForFunction(() => !__game.busy); await p.evaluate(() => __game.humanMove(3)); await p.waitForTimeout(200); }],
    ["mahjong", "mahjong/", "the whole turtle of tiles", async (p) => { await p.evaluate(() => Mahjong.start("classic")); await p.waitForTimeout(400); }],
    ["typetwo", "typetwo/", "the seven stats along the bottom", async (p) => { await p.keyboard.press("Enter"); await p.waitForTimeout(300); }],
    ["departures", "departures/", "the sign's wide lettering", async (p) => { await p.evaluate(() => Departures.start("continent", "OC")); await p.waitForTimeout(300); }],
  ];
  const extra = { typetwo: {}, departures: {}, metazac: {}, fish: {} };
  for (const [g, path, what, start] of PLAY) {
    const got = {}, errs = [];
    for (const [w, h] of SIZES) {
      const ctx = await lib.newContext(browser, phone(w, h));
      const p = await lib.open(ctx, base, "games/" + path);
      await start(p);
      got[w] = (await side(p, w)).wider;
      if (g === "typetwo") extra.typetwo[w] = await below(p, "#hint");
      if (g === "departures") extra.departures[w] = await hint(p, "#answer");
      errs.push(...p.errs);
      await ctx.close();
    }
    check("fit: " + g + " in play fits a phone's width at 320, 360 and 390 px (" + what + ")", SIZES.every(([w]) => got[w] === 0), got);
    check("fit (" + g + "): no page errors", errs.length === 0, errs);
  }
  check("fit: typetwo's hint line sits below the corner buttons on a phone, not under them", SIZES.every(([w]) => extra.typetwo[w] !== null && extra.typetwo[w] >= 0), extra.typetwo);

  // ---- the hint in an empty answer box shows whole; three choices in a row each keep their name inside their button
  for (const [w, h] of SIZES) {
    const ctx = await lib.newContext(browser, phone(w, h));
    const m = await lib.open(ctx, base, "games/metazac/");
    await m.click("#start-btn"); await m.waitForTimeout(400);
    extra.metazac[w] = await hint(m, "#answer");
    const f = await lib.open(ctx, base, "games/fish-a-fish/");
    await f.waitForTimeout(250);
    extra.fish[w] = await f.evaluate(() => Array.from(document.querySelectorAll("#pick-kb button, #pick-clock button")).filter((b) => {
      const g = document.createRange(); g.selectNodeContents(b.querySelector("b"));
      const t = g.getBoundingClientRect(), r = b.getBoundingClientRect();
      return t.right > r.right + 0.5 || t.left < r.left - 0.5;
    }).map((b) => b.querySelector("b").textContent));
    await ctx.close();
  }
  const fits = (o) => SIZES.every(([w]) => o[w] && o[w].hint <= o[w].room + 1);
  check("fit: metazac's \"type an answer\" hint shows whole in the box on a phone", fits(extra.metazac), extra.metazac);
  check("fit: departures' \"type a country\" hint shows whole in the box on a phone", fits(extra.departures), extra.departures);
  check("fit: fish-a-fish's Round and Keys choices each keep their name inside their button on a phone", SIZES.every(([w]) => extra.fish[w].length === 0), extra.fish);

  // ---- nothing that tells the player something is hidden to make a phone
  // fit: the HUD's best and street, a tagline, the desk's label and its
  // "press Enter", the how-to and the fruit chain, the letters' values, the
  // set's lettering. Each shows, inside the screen's width and clear of the
  // corner buttons, on a small phone and a short one (and Ping's on a phone
  // on its side). These all used to be display: none at these sizes.
  const SHOWN = [
    ["dead-end", [".hud .best", ".hud .where"], async (p) => { await p.keyboard.press("Enter"); await p.waitForTimeout(300); }],
    ["jackblack", [".plaque", ".print"], async (p) => { await p.keyboard.press("Enter"); await p.waitForTimeout(300); }],
    ["departures", ["#desk label", "#hint"], async (p) => { await p.evaluate(() => Departures.start("continent", "OC")); await p.waitForTimeout(200); await p.evaluate(() => Departures.type("niger")); await p.waitForTimeout(100); }],
    ["jam-jar", [".hint-panel", ".hint-panel .hint", "#chain"], null],
    ["speedle", ["header.top p", ".key[data-pts]::after"], async (p) => { await p.click("#m-sprint"); await p.waitForTimeout(300); }],
    ["click-tap", ["header.top p"], null],
    ["slither", [".subtitle"], null],
    ["ping", [".model", ".knob small", ".power small"], null],
  ];
  const shown = (p, sels, w) => p.evaluate(({ sels, w }) => {
    const row = Array.from(document.querySelectorAll(".nav-back-games, .gs-corner > *")).filter((x) => x.getClientRects().length).map((x) => x.getBoundingClientRect());
    const bad = [];
    for (const sel of sels) {
      const pseudo = sel.endsWith("::after"), els = Array.from(document.querySelectorAll(pseudo ? sel.slice(0, -7) : sel));
      if (!els.length) { bad.push(sel + ": not on the page"); continue; }
      els.forEach((e, i) => {
        const at = sel + (els.length > 1 ? " #" + (i + 1) : "");
        if (pseudo) { const cs = getComputedStyle(e, "::after"); if (cs.display === "none" || cs.content === "none") bad.push(at + ": hidden"); return; }
        const r = e.getBoundingClientRect();
        if (!e.getClientRects().length || !r.width || !r.height || getComputedStyle(e).visibility === "hidden") bad.push(at + ": hidden");
        else if (r.left < -0.5 || r.right > w + 0.5) bad.push(at + ": off the side");
        else if (row.some((c) => r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top)) bad.push(at + ": under the corner buttons");
      });
    }
    return bad;
  }, { sels, w });
  {
    const missing = {}, errs = {};
    for (const [g, sels, start] of SHOWN) {
      for (const [w, h] of (g === "ping" ? [[320, 568], [375, 553], [667, 375]] : [[320, 568], [375, 553]])) {
        const ctx = await lib.newContext(browser, phone(w, h));
        const p = await lib.open(ctx, base, "games/" + g + "/");
        if (start) await start(p);
        const bad = await shown(p, sels, w);
        if (bad.length) missing[g + " " + w + "x" + h] = bad;
        if (p.errs.length) errs[g] = p.errs;
        await ctx.close();
      }
    }
    check("fit: on a small and a short phone nothing that informs is hidden (" + SHOWN.map((s) => s[0]).join(", ") + "): each shows, on the screen and clear of the corner buttons", Object.keys(missing).length === 0, missing);
    check("fit (shown on phones): no page errors", Object.keys(errs).length === 0, errs);
  }
  // Dead End's HUD on two lines (a big score, a long street's name): the
  // block gives up the height, so the Plank button stays on the screen; and
  // Jam Jar's chain lies across its panel under the jar
  {
    const got = {};
    for (const [w, h] of [[320, 568], [360, 560]]) {
      const ctx = await lib.newContext(browser, phone(w, h));
      const p = await lib.open(ctx, base, "games/dead-end/");
      await p.keyboard.press("Enter"); await p.waitForTimeout(300);
      await p.evaluate(() => { const s = DeadEnd.st(); s.score = 98765; s.lv.name = "Canal Street · round 12"; });
      await p.waitForTimeout(300);
      const de = await p.evaluate(() => { const hud = document.getElementById("hud").getBoundingClientRect(), b = document.getElementById("plank-btn").getBoundingClientRect(); return { hud: Math.round(hud.height), plank: Math.round(b.bottom), screen: innerHeight }; });
      const j = await lib.open(ctx, base, "games/jam-jar/");
      const jj = await j.evaluate(() => { const c = document.getElementById("chain").getBoundingClientRect(), box = c.width && document.querySelector(".chain-panel"); const pr = box ? box.getBoundingClientRect() : c; return { w: Math.round(c.width), h: Math.round(c.height), inside: c.left >= pr.left && c.right <= pr.right }; });
      got[w + "x" + h] = { deadEnd: de, jamJar: jj };
      await ctx.close();
    }
    check("fit: dead end's HUD on two lines on a phone (a big score, a long street) still leaves the Plank button on the screen",
      Object.values(got).every((o) => o.deadEnd.hud > 45 && o.deadEnd.plank <= o.deadEnd.screen), got);
    check("fit: jam jar's fruit chain lies across its panel under the jar on a phone", Object.values(got).every((o) => o.jamJar.w > o.jamJar.h * 3 && o.jamJar.inside), got);
  }

  // ---- small phones get the big pieces at a size that plays, with nothing
  // else given up: Dead End's maze (the sign and the HUD side by side, how
  // to play beside the Plank button, so the block has the height they took;
  // its cells were 12 to 13 px), JackBlack's cards (42 px), Ping's lettering
  // (7.5 px); and the decoration that used to hide on them shows: JackBlack's
  // portholes (either side of its name) and Ping's antenna (a smaller one
  // with the set on its side, and none of it under the corner buttons).
  {
    const got = {};
    for (const [w, h] of [[320, 568], [360, 560], [375, 553]]) {
      const ctx = await lib.newContext(browser, phone(w, h));
      const p = await lib.open(ctx, base, "games/dead-end/");
      await p.keyboard.press("Enter"); await p.waitForTimeout(300);
      for (const big of [false, true]) {
        if (big) { await p.evaluate(() => { const s = DeadEnd.st(); s.score = 98765; s.lv.name = "Canal Street · round 12"; }); await p.waitForTimeout(300); }
        got[w + "x" + h + (big ? " big HUD" : "")] = await p.evaluate(() => {
          const R = (e) => e.getBoundingClientRect(), c = R(document.getElementById("board")), corner = Array.from(document.querySelectorAll(".nav-back-games, .gs-corner > *")).filter((x) => x.getClientRects().length).map((x) => x.getBoundingClientRect());
          const parts = { sign: R(document.querySelector(".sign")), hud: R(document.getElementById("hud")), plank: R(document.getElementById("plank-btn")), hint: R(document.getElementById("hint")) };
          const off = Object.keys(parts).filter((k) => parts[k].bottom > innerHeight + 0.5 || parts[k].right > innerWidth + 0.5 || corner.some((b) => parts[k].left < b.right && parts[k].right > b.left && parts[k].top < b.bottom && parts[k].bottom > b.top));
          return { cell: +(c.width / DeadEnd.st().lv.cols).toFixed(1), scroll: document.documentElement.scrollHeight - innerHeight, off };
        });
      }
      await ctx.close();
    }
    check("fit: dead end's maze on a small or short phone has cells of 15 px or more, with the sign, the HUD (one line or more), the Plank button and how to play all on the screen and no page to scroll",
      Object.values(got).every((o) => o.cell >= 15 && o.scroll <= 0 && o.off.length === 0), got);
  }
  {
    const cards = {}, still = {}, ports = {}, errs = {};
    const idle = (p) => p.waitForFunction(() => !JackBlack.busy(), null, { timeout: 10000 });
    const deal = async (p, stack, hits) => {
      await p.evaluate(() => JackBlack.start("open")); await p.waitForTimeout(150);
      await p.evaluate((s) => JackBlack.stack(s), stack);
      await p.evaluate(() => document.getElementById("deal").click()); await idle(p);
      for (let i = 0; i < hits; i++) { await p.evaluate(() => document.getElementById("act-hit").click()); await idle(p); }
    };
    const inFelt = (p) => p.evaluate(() => { const f = document.getElementById("felt").getBoundingClientRect(); return [...document.querySelectorAll("#hands .pc")].every((c) => { const r = c.getBoundingClientRect(); return r.left >= f.left && r.right <= f.right; }); });
    for (const [w, h, least] of [[320, 568, 46], [375, 553, 46], [360, 640, 46], [390, 664, 50], [390, 844, 55]]) {
      const ctx = await lib.newContext(browser, phone(w, h));
      let p = await lib.open(ctx, base, "games/jackblack/");
      await p.evaluate(() => JackBlack.start("open")); await p.waitForTimeout(150);
      const betScroll = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      await p.close();
      p = await lib.open(ctx, base, "games/jackblack/");
      await deal(p, "T 2 9 3", 0);
      const card = await p.evaluate(() => Math.round(document.querySelector("#hands .pc").getBoundingClientRect().width));
      cards[w + "x" + h] = { card, least };
      if (h >= 640) still[w + "x" + h] = { bet: betScroll, play: await p.evaluate(() => document.documentElement.scrollHeight - innerHeight) };
      await p.close();
      // eight cards in one hand still lie inside the table
      p = await lib.open(ctx, base, "games/jackblack/");
      await deal(p, "A T A 7 A A 2 2 A 2", 6);
      cards[w + "x" + h].eight = { n: await p.evaluate(() => document.querySelectorAll("#hands .pc").length), inside: await inFelt(p) };
      if (p.errs.length) errs[w + "x" + h] = p.errs;
      await ctx.close();
    }
    check("fit: jackblack's cards on a phone are 46 px or more on a small or short one (they were 42), 55 or more on a tall one, and a hand of eight still lies inside the table",
      Object.values(cards).every((o) => o.card >= o.least && o.eight.n === 8 && o.eight.inside), cards);
    check("fit: jackblack on a 360 x 640 or 390 x 664 phone has no page to scroll while betting or playing a hand", Object.values(still).every((o) => o.bet <= 0 && o.play <= 0), still);
    for (const [w, h, dev] of [[320, 568, true], [375, 553, true], [768, 1024, false], [1280, 900, false]]) {
      const ctx = await lib.newContext(browser, dev ? phone(w, h) : { viewport: { width: w, height: h } });
      const p = await lib.open(ctx, base, "games/jackblack/");
      for (const st of ["menu", "table"]) {
        if (st === "table") { await p.evaluate(() => JackBlack.start("open")); await p.waitForTimeout(150); }
        ports[w + "x" + h + " " + st] = await p.evaluate(() => {
          const R = (e) => e.getBoundingClientRect(), corner = Array.from(document.querySelectorAll(".nav-back-games, .gs-corner > *")).filter((x) => x.getClientRects().length).map((x) => x.getBoundingClientRect());
          const text = (sel) => { const g = document.createRange(); g.selectNodeContents(document.querySelector(sel)); return Array.from(g.getClientRects()); };
          const hud = document.getElementById("hud"), keep = [...text("h1"), ...text(".plaque"), ...(hud.hidden ? [] : [R(hud)]), R(document.getElementById("felt"))];
          return Array.from(document.querySelectorAll(".porthole")).map((e) => {
            const r = R(e), hit = (b) => r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
            return { size: getComputedStyle(e).display === "none" ? 0 : Math.round(r.width), x: Math.round(r.left), onScreen: r.left >= 0 && r.right <= innerWidth && r.top >= 0, clear: !corner.some(hit) && !keep.some(hit) };
          });
        });
      }
      await ctx.close();
    }
    check("fit: jackblack's two portholes show on a phone and a tablet, either side of the name (36 px or more), clear of the corner buttons, the name, the tagline and the HUD; on a wide screen they stay 168 px on the walls",
      Object.entries(ports).every(([k, a]) => a.length === 2 && a.every((o) => o.onScreen && o.clear && (k.startsWith("1280") ? o.size === 168 : o.size >= 36))) &&
      ports["1280x900 menu"][0].x === 40, ports);
    check("fit (jackblack on phones): no page errors", Object.keys(errs).length === 0, errs);
  }
  {
    const got = {};
    for (const [w, h] of [[320, 568], [360, 560], [375, 553], [667, 375], [844, 390]]) {
      const ctx = await lib.newContext(browser, phone(w, h));
      const p = await lib.open(ctx, base, "games/ping/");
      got[w + "x" + h] = await p.evaluate(() => {
        const R = (e) => e.getBoundingClientRect(), corner = Array.from(document.querySelectorAll(".nav-back-games, .gs-corner > *")).filter((x) => x.getClientRects().length).map((x) => x.getBoundingClientRect());
        const smalls = Array.from(document.querySelectorAll(".panel small")).map((s) => parseFloat(getComputedStyle(s).fontSize));
        const outside = Array.from(document.querySelectorAll(".panel small, .badge b, .dial, .grille, .led")).filter((e) => {
          const r = R(e), pr = R(e.closest(".panel"));
          return r.width < 4 || r.left < pr.left - 0.5 || r.right > pr.right + 0.5 || r.top < pr.top - 0.5 || r.bottom > pr.bottom + 0.5;
        }).map((e) => e.textContent || e.className);
        // the rods turn about their feet: where their tips end up
        const ant = document.querySelector(".antenna"), a = R(ant), shown = getComputedStyle(ant).display !== "none";
        const tip = (pseudo) => { const cs = getComputedStyle(ant, pseudo), m = new DOMMatrix(cs.transform), ang = Math.atan2(m.b, m.a), len = parseFloat(cs.height); return { x: a.left + a.width / 2 + len * Math.sin(ang), y: a.bottom - parseFloat(cs.bottom) - len * Math.cos(ang) }; };
        const L = tip("::before"), Rt = tip("::after"), box = { left: L.x - 6, right: Rt.x + 6, top: Math.min(L.y, Rt.y) - 6, bottom: a.bottom };
        const underCorner = corner.some((b) => box.left < b.right && box.right > b.left && box.top < b.bottom && box.bottom > b.top);
        return { least: Math.min(...smalls), outside, antenna: shown && a.width > 0, tipsOnScreen: box.top >= 0, underCorner, setFits: R(document.querySelector(".feet")).bottom <= innerHeight };
      });
      await ctx.close();
    }
    check("fit: ping's lettering on a phone is 10 px or more (it was 7.5), inside its panels; the antenna shows upright and on its side, on the screen and clear of the corner buttons, and the whole set fits",
      Object.values(got).every((o) => o.least >= 10 && o.outside.length === 0 && o.antenna && o.tipsOnScreen && !o.underCorner && o.setFits), got);
  }
};
