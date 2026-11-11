// Salvo: a shot fired in the moment between the last sinking and the end card
// doesn't count the win again; with storage blocked the game still runs; a
// ship is one piece wherever it shows, and goes down as one; the boards'
// letters and numbers sit in the middle of their rows and columns.
// (__salvo: the fleets; aim, the CPU's next shots; shoot, a shot at your
// waters as the CPU's are fired; over, the end of the game)
const HOOK = ['  $("againBtn").addEventListener("click", newGame);', '  window.__salvo = { get enemyShips() { return enemyShips; }, get playerShips() { return playerShips; }, aim(c) { cpuTargets = c.slice(); },\n' +
  '    shoot(r, c) { const res = attack(playerBoard, r, c); lastShot.player = [r, c]; render(); flashHit(playerGrid, res, r, c); }, over(w) { gameOver(w); } };\n  $("againBtn").addEventListener("click", newGame);'];
const BLOCK_STORAGE = (pg) => pg.addInitScript(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("The operation is insecure.", "SecurityError"); } });
});

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const hook = (pg) => lib.injectScript(pg, "games/salvo/game.js", [HOOK]);

  let p = await lib.open(ctx, base, "games/salvo/", { before: hook });
  await p.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); });
  await p.keyboard.press("a"); await p.keyboard.press("Enter"); await p.waitForTimeout(100);
  const res = await p.evaluate(async () => {
    const grid = document.getElementById("enemyGrid");
    const cellAt = (r, c) => grid.querySelector('.cell[data-r="' + r + '"][data-c="' + c + '"]');
    const click = (el) => el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const ships = new Set();
    __salvo.enemyShips.forEach((s) => s.cells.forEach((rc) => { ships.add(rc[0] + "," + rc[1]); click(cellAt(rc[0], rc[1])); }));   // every shot a hit: the turn never passes
    // the fleet is down and the end card is on its way: one more shot, at open water
    for (let i = 0; i < 100; i++) if (!ships.has(((i / 10) | 0) + "," + (i % 10))) { click(cellAt((i / 10) | 0, i % 10)); break; }
    await new Promise((r) => setTimeout(r, 900));
    return { rec: JSON.parse(localStorage.getItem("battleship_record")), over: !document.getElementById("over").classList.contains("hidden") };
  });
  check("salvo: a shot after the last sinking doesn't count the win twice", res.over && res.rec.w === 1 && res.rec.l === 0, res);

  // the end card: Backspace goes back to the fleet screen, the game's menu,
  // but not in its first second (Backspace is a placement key, Reset); Esc
  // leaves for the games page
  const shown = () => p.evaluate(() => ({ over: !document.getElementById("over").classList.contains("hidden"), placing: document.getElementById("placeControls").style.display !== "none" && document.getElementById("enemyCol").hidden }));
  await p.keyboard.press("Backspace"); await p.waitForTimeout(80);
  const early = await shown();
  await p.waitForTimeout(1000);
  await p.keyboard.press("Escape"); await p.waitForTimeout(250);
  await lib.leftBy(p, 1);   // (counted when its request arrives: later on a busy machine)
  const esc = Object.assign(await shown(), { leaves: p.leaves });
  await p.keyboard.press("Backspace"); await p.waitForTimeout(80);
  const back = await shown();
  check("salvo: on the end card Esc leaves, Backspace goes back to the fleet screen (not in the card's first second)",
    early.over && esc.over && esc.leaves === 1 && !back.over && back.placing && p.leaves === 1, { early, esc, back });
  check("salvo: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  p = await lib.open(ctx, base, "games/salvo/", { before: BLOCK_STORAGE });
  await p.keyboard.press("a"); await p.waitForTimeout(80);
  const placed = await p.evaluate(() => (document.getElementById("placing") || {}).textContent || "");
  check("salvo: with storage blocked the fleet can still be placed", p.errs.length === 0 && /All ships placed/.test(placed), { errs: p.errs, placed });
  await p.close();

  // ---- the fleet screen: a key held down acts once (a held R spun the ship
  // round and round, a held A dealt fleet after fleet); with Visual FX on a
  // ship set down drops into place and the water rings round it, and the
  // swell drifts over your waters; with it off the ships are simply there and
  // the sea holds still. At a laptop's size and a phone's.
  const { devices } = require("@playwright/test");
  for (const [label, dev] of [["laptop", {}], ["phone", Object.assign({}, devices["iPhone 13"], { viewport: { width: 390, height: 664 } })]]) {
    for (const fxOff of [false, true]) {
      const c = await lib.newContext(browser, dev);
      const q = await lib.open(c, base, "games/salvo/", { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:salvo", off ? "1" : "0"); } catch (e) {} }, fxOff) });
      const fleet = () => q.evaluate(() => [...document.querySelectorAll("#playerGrid .cell.ship")].map((e) => e.dataset.r + e.dataset.c).join());
      const orient = () => q.evaluate(() => /vertical/.test(document.getElementById("placing").textContent) ? "v" : "h");
      const key = (k, repeat) => lib.fireKey(q, { key: k, code: "Key" + k.toUpperCase(), repeat });
      const o0 = await orient(); await key("r", false); const o1 = await orient(); await key("r", true); await key("r", true); const o2 = await orient();
      await key("a", false); const f1 = await fleet(); await key("a", true); await key("a", true); const f2 = await fleet();
      const drops = await q.evaluate(() => ({ drop: document.querySelectorAll("#playerGrid .cell.drop").length, ship: document.querySelectorAll("#playerGrid .cell.ship").length,
        swell: getComputedStyle(document.getElementById("playerGrid"), "::before").animationName }));
      // A new fleet at random over the last one (FX on): every ship comes down
      // whole, one hull over exactly its cells, and the water rings out round
      // its cells together, also where it lies on a cell a ship of the last
      // fleet had (that cell kept its old drop, long over). Read the moment A
      // is pressed (every hull still to come down) and mid-drop; then A
      // pressed again and again, and all landed in the end.
      const over = fxOff ? null : await q.evaluate(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const cells = () => [...document.querySelectorAll("#playerGrid .cell.ship")];
        const hulls = () => [...document.querySelectorAll("#playerGrid .vessel")];
        // (how far down its drop a hull is, or a cell's ring out: its fade and its scale)
        const look = (e, pseudo) => { const s = getComputedStyle(e, pseudo), m = /matrix\(([-\d.e]+)/.exec(s.transform); return (+s.opacity).toFixed(2) + " " + (m ? (+m[1]).toFixed(3) : s.transform); };
        const shown = () => hulls().filter((e) => getComputedStyle(e).opacity !== "0").length;
        // the ships (each has its own grey, ship0 to ship4) that aren't one
        // hull laid over just their cells, or whose cells' rings don't go together
        const split = () => {
          const by = {};
          cells().forEach((e) => { const k = [...e.classList].find((c) => /^ship\d$/.test(c)); (by[k] = by[k] || []).push(e); });
          return Object.keys(by).filter((k) => {
            const vs = hulls().filter((v) => v.classList.contains(k)), cs = by[k];
            if (vs.length !== 1) return true;
            const v = vs[0], l = Math.min(...cs.map((e) => e.offsetLeft)), t = Math.min(...cs.map((e) => e.offsetTop));
            const r = Math.max(...cs.map((e) => e.offsetLeft + e.offsetWidth)), b = Math.max(...cs.map((e) => e.offsetTop + e.offsetHeight));
            return Math.abs(v.offsetLeft - l) > 1 || Math.abs(v.offsetTop - t) > 1 || Math.abs(v.offsetLeft + v.offsetWidth - r) > 1 || Math.abs(v.offsetTop + v.offsetHeight - b) > 1 ||
              new Set(cs.map((e) => look(e, "::after"))).size > 1;
          });
        };
        const random = () => document.getElementById("randomBtn").click();
        const res = { tries: 0, shared: 0 };
        await wait(1300);   // the last fleet all landed
        while (!res.shared && res.tries < 12) {
          const old = new Set(cells().map((e) => e.dataset.r + "," + e.dataset.c));
          random(); res.tries++;
          res.shared = cells().filter((e) => old.has(e.dataset.r + "," + e.dataset.c)).length;
          if (!res.shared) await wait(1300);
        }
        res.shownAt0 = shown();
        res.split = [];
        for (let i = 0; i < 6; i++) { await wait(60); res.split.push(...split()); }
        for (let i = 0; i < 5; i++) { random(); await wait(45); }
        random(); res.again = { shownAt0: shown(), split: [] };
        for (let i = 0; i < 6; i++) { await wait(60); res.again.split.push(...split()); }
        await wait(1300);
        res.landed = hulls().filter((e) => /^1\.00 (none|1\.000)$/.test(look(e))).length; res.cells = cells().length;
        return res;
      });
      if (over) check("salvo " + label + ", Visual FX on: a fleet dealt at random over the last one drops ship by ship, each ship one hull over its cells, coming down whole, the water ringing round its cells together (also where it lies on a cell of the last fleet, and with A pressed again and again)",
        over.shared > 0 && over.shownAt0 === 0 && !over.split.length && over.again.shownAt0 === 0 && !over.again.split.length && over.landed === 5 && over.cells === 17, over);
      // a ship set down by hand, on a fresh fleet screen
      await q.click("#resetBtn");
      await q.click('#playerGrid .cell[data-r="0"][data-c="0"]');
      const one = await q.evaluate(() => document.querySelectorAll("#playerGrid .cell.drop").length);
      if (!fxOff) check("salvo " + label + ": R and A act once per press, never again while held (the ship turns once, one fleet is dealt)",
        o1 !== o0 && o2 === o1 && f1.length > 0 && f2 === f1, { o0, o1, o2, same: f2 === f1 });
      check("salvo " + label + ", Visual FX " + (fxOff ? "off: ships set down are simply there and the sea holds still" : "on: a ship set down drops in with the water ringing round it (a random fleet, every ship), and the swell drifts"),
        fxOff ? drops.drop === 0 && one === 0 && drops.swell === "none" : drops.drop === drops.ship && drops.ship === 17 && one === 5 && drops.swell === "swell",
        { drops, one });
      check("salvo " + label + " (fleet screen): no page errors", q.errs.length === 0, q.errs);
      await q.close();
      await c.close();
    }
  }

  // ---- the fleet screen's keycaps, where there's a keyboard (a laptop, and
  // a window as narrow as a phone): each in the middle of its button top to
  // bottom (the level buttons' 1 2 3 hung low, near the foot), and R and A
  // in the middle of their caps (they sat on the cap's foot). The letters
  // are read from the pixels, four to a CSS pixel. The suites keep the web
  // fonts out, so Barlow Condensed comes as a stand-in face given Barlow's
  // own heights: its capitals sit low in their line, which is what put R
  // and A on the foot.
  const BARLOW = '@font-face { font-family: "Barlow Condensed"; src: local("Arial Narrow"), local("Arial"); font-weight: 100 900; ascent-override: 100%; descent-override: 20%; line-gap-override: 0%; }';
  for (const [label, vp] of [["laptop", { width: 1280, height: 900 }], ["narrow window", { width: 390, height: 1100 }]]) {
    const c = await lib.newContext(browser, { viewport: vp, deviceScaleFactor: 4 });
    await c.route(/fonts\.googleapis/, (r) => r.fulfill({ contentType: "text/css", body: BARLOW }));
    const q = await lib.open(c, base, "games/salvo/");
    await q.keyboard.press("a"); await q.waitForTimeout(150);
    const caps = await q.evaluate(() => {
      const out = [];
      document.querySelectorAll("#placeControls button").forEach((b) => {
        // a keycap drawn from the attribute (::after) is read through a twin
        // of it, an element drawn the same in its place
        let k = b.querySelector("kbd"), twin = null, st = null;
        if (!k && b.hasAttribute("data-gs-key")) {
          const cs = getComputedStyle(b, "::after");
          twin = document.createElement("span");
          for (const prop of cs) twin.style.setProperty(prop, cs.getPropertyValue(prop));
          twin.style.setProperty("content", "normal"); twin.textContent = b.getAttribute("data-gs-key");
          st = document.createElement("style"); st.textContent = ".twin-of::after { display: none !important; }"; document.head.appendChild(st);
          b.classList.add("twin-of"); b.appendChild(twin); k = twin;
        }
        if (!k) return;
        const r = k.getBoundingClientRect(), br = b.getBoundingClientRect();
        out.push({ key: k.textContent, off: +((r.top + r.bottom) / 2 - (br.top + br.bottom) / 2).toFixed(2) });
        if (twin) { twin.remove(); st.remove(); b.classList.remove("twin-of"); }
      });
      return out;
    });
    // R and A: the rows with ink inside the cap's borders, clear of its round
    // corners (a picture of the whole CSS pixels round the cap, so a row of
    // it is a known height on the page)
    const ink = [];
    for (const k of await q.$$("#rotateBtn kbd, #randomBtn kbd")) {
      const g = await k.evaluate((e) => { const cs = getComputedStyle(e), r = e.getBoundingClientRect(); return { key: e.textContent, x: r.left, y: r.top, right: r.right, bottom: r.bottom, b: parseFloat(cs.borderTopWidth), r: parseFloat(cs.borderTopLeftRadius) }; });
      const clip = { x: Math.floor(g.x), y: Math.floor(g.y), width: Math.ceil(g.right) - Math.floor(g.x), height: Math.ceil(g.bottom) - Math.floor(g.y) };
      const png = (await q.screenshot({ clip })).toString("base64");
      ink.push(await q.evaluate(async ({ png, g, clip }) => {
        const S = 4, img = new Image(); img.src = "data:image/png;base64," + png; await img.decode();
        const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
        const x = cv.getContext("2d"); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, cv.width, cv.height).data, W = cv.width;
        const L = (i, j) => { const n = (j * W + i) * 4; return 0.3 * d[n] + 0.59 * d[n + 1] + 0.11 * d[n + 2]; };
        const row = (y) => Math.round((y - clip.y) * S), col = (v) => Math.round((v - clip.x) * S);
        const top = g.y + g.b, foot = g.bottom - g.b;   // the inside of the cap
        const x0 = col(g.x + g.r + 0.5), x1 = col(g.right - g.r - 0.5), y0 = row(top + 0.5), y1 = row(foot - 0.5);
        const dev = [];
        for (let j = y0; j < y1; j++) {
          const v = []; for (let i = x0; i < x1; i++) v.push(L(i, j)); v.sort((a, b) => a - b);
          const fill = v[v.length >> 1]; let m = 0; for (let i = x0; i < x1; i++) m = Math.max(m, Math.abs(L(i, j) - fill)); dev.push(m);
        }
        const most = Math.max(...dev); let t = -1, bt = -1;
        dev.forEach((v, n) => { if (v > most / 2) { if (t < 0) t = n; bt = n; } });
        return { key: g.key, above: +(clip.y + (y0 + t) / S - top).toFixed(2), below: +(foot - clip.y - (y0 + bt + 1) / S).toFixed(2) };
      }, { png, g, clip }));
    }
    const digits = caps.filter((k) => /^[123]$/.test(k.key));
    check("salvo " + label + ": every keycap on the fleet screen is in the middle of its button top to bottom (the levels' 1 2 3 too)",
      digits.length === 3 && caps.length >= 7 && caps.every((k) => Math.abs(k.off) <= 0.6), caps);
    check("salvo " + label + ": R and A sit in the middle of their caps, clear of the top and the foot",
      ink.length === 2 && ink.every((k) => k.above > 0.6 && k.below > 0.6 && Math.abs(k.above - k.below) <= 1.2), ink);
    check("salvo " + label + " (keycaps): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await c.close();
  }

  // ---- the boards' labels: each row's letter in the middle of its row top
  // to bottom, each column's number in the middle of its column, on both
  // boards, at a laptop's size and a Pixel 7's. Barlow's capitals sit a
  // little low in their line, which put the letters about 0.85 px low in the
  // real face (0.3 to 0.5 px in the stand-in face the suites use, given
  // Barlow's heights as above). Read from the pixels, four to a CSS pixel;
  // a letter's place snaps to whole pixels as the rows run down the board,
  // so the rows are judged on the whole column of them, each kept within
  // 0.75 px.
  const labels = {};
  for (const [name, opts] of [["laptop", { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 4 }], ["Pixel 7", Object.assign({}, devices["Pixel 7"], { deviceScaleFactor: 4 })]]) {
    const c = await lib.newContext(browser, opts);
    await c.route(/fonts\.googleapis/, (r) => r.fulfill({ contentType: "text/css", body: BARLOW }));
    const q = await lib.open(c, base, "games/salvo/");
    await q.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); });
    await q.keyboard.press("a"); await q.keyboard.press("Enter"); await q.waitForSelector("#enemyGrid.active", { timeout: 30000 });
    for (const grid of ["enemyGrid", "playerGrid"]) {
      await q.evaluate((g) => document.getElementById(g).scrollIntoView({ block: "center" }), grid);
      const png = (await q.locator("#" + grid).screenshot()).toString("base64");
      labels[name + " " + grid] = await q.evaluate(async ({ grid, png }) => {
        const gEl = document.getElementById(grid), b = gEl.getBoundingClientRect(), x0 = Math.floor(b.left), y0 = Math.floor(b.top), k = devicePixelRatio;
        const img = new Image(); img.src = "data:image/png;base64," + png; await img.decode();
        const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
        const x = cv.getContext("2d"); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, cv.width, cv.height).data;
        // the ink in a box of the frame (light lettering on dark steel), its middle on the page
        const ink = (r) => {
          let ax = 1e9, ay = 1e9, bx = -1, by = -1;
          for (let j = Math.floor((r.top - y0) * k); j < Math.ceil((r.bottom - y0) * k); j++) for (let i = Math.floor((r.left - x0) * k); i < Math.ceil((r.right - x0) * k); i++) {
            const n = (j * cv.width + i) * 4; if ((d[n] + d[n + 1] + d[n + 2]) / 3 > 145) { ax = Math.min(ax, i); bx = Math.max(bx, i + 1); ay = Math.min(ay, j); by = Math.max(by, j + 1); }
          }
          return { x: (ax + bx) / 2 / k + x0, y: (ay + by) / 2 / k + y0 };
        };
        const cell = (r, c) => gEl.querySelector('.cell[data-r="' + r + '"][data-c="' + c + '"]').getBoundingClientRect();
        const rows = [...gEl.querySelectorAll(".rhead")].map((e, i) => { const c = cell(i, 0), r = e.getBoundingClientRect(); return +(ink({ left: r.left, right: r.right, top: c.top, bottom: c.bottom }).y - (c.top + c.bottom) / 2).toFixed(2); });
        const cols = [...gEl.querySelectorAll(".chead")].map((e, i) => { const c = cell(0, i), r = e.getBoundingClientRect(); return +(ink({ left: c.left, right: c.right, top: r.top, bottom: r.bottom }).x - (c.left + c.right) / 2).toFixed(2); });
        return { rows, cols, rowsOff: +(rows.reduce((s, v) => s + v, 0) / rows.length).toFixed(2) };
      }, { grid, png });
    }
    labels[name + " errors"] = q.errs.length;
    await c.close();
  }
  const boards = Object.keys(labels).filter((k) => /Grid$/.test(k)).map((k) => labels[k]);
  check("salvo: the boards' row letters sit in the middle of their rows, and the column numbers in the middle of their columns (both boards, a laptop and a Pixel 7)",
    boards.length === 4 && boards.every((l) => Math.abs(l.rowsOff) <= 0.2 && l.rows.every((v) => Math.abs(v) <= 0.75) && l.cols.every((v) => Math.abs(v) <= 0.6)) && !labels["laptop errors"] && !labels["Pixel 7 errors"], labels);

  // ---- a ship set down on your waters is one hull: no hairline of sea where
  // its cells meet, at the scales a laptop or a phone draws at (125%, 150%,
  // 3x; the cells sit at fractions of a pixel there), Visual FX on (landed)
  // and off, and after R draws the board again. Each hull is read along its
  // middle, from its stern's middle to just into its bow, for the sea's blue.
  const hull = async (q, cells) => {
    const g = await q.evaluate((cells) => {
      const rs = cells.map(([r, c]) => document.querySelector('#playerGrid .cell[data-r="' + r + '"][data-c="' + c + '"]').getBoundingClientRect());
      const a = rs[0], z = rs[rs.length - 1], horiz = a.top === z.top;
      return horiz ? { x: a.left + a.width / 2, right: z.left + z.width * 0.4, y: a.top + a.height * 0.3, bottom: a.bottom - a.height * 0.3 }
        : { x: a.left + a.width * 0.3, right: a.right - a.width * 0.3, y: a.top + a.height / 2, bottom: z.top + z.height * 0.4 };
    }, cells);
    const clip = { x: g.x, y: g.y, width: g.right - g.x, height: g.bottom - g.y };
    const png = (await q.screenshot({ clip })).toString("base64");
    return q.evaluate(async (png) => {
      const img = new Image(); img.src = "data:image/png;base64," + png; await img.decode();
      const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
      const x = cv.getContext("2d"); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, cv.width, cv.height).data;
      let blue = -255; for (let n = 0; n < d.length; n += 4) blue = Math.max(blue, d[n + 2] - d[n]);
      return blue;   // the bluest pixel: the hulls' greys are under 30, the sea over 80
    }, png);
  };
  const seas = {};
  for (const [w, h, dpr, phone] of [[1536, 864, 1.25, false], [1280, 900, 1.5, false], [390, 664, 3, true]]) {
    for (const off of [false, true]) {
      const c = await lib.newContext(browser, { viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: phone, isMobile: phone });
      const q = await lib.open(c, base, "games/salvo/", { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:salvo", off ? "1" : "0"); } catch (e) {} }, off) });
      await q.evaluate(() => document.getElementById("playerGrid").scrollIntoView({ block: "center" }));
      const cell = (r, c) => q.locator('#playerGrid .cell[data-r="' + r + '"][data-c="' + c + '"]');
      // the carrier across B2 to B6, then the battleship down D8 to G8; the
      // pointer goes off the board, so no preview frames a cell
      await cell(1, 1).click(); await q.keyboard.press("r"); await cell(3, 7).click();
      await q.mouse.move(2, 2); await q.waitForTimeout(1000);
      const H = [[1, 1], [1, 2], [1, 3], [1, 4], [1, 5]], V = [[3, 7], [4, 7], [5, 7], [6, 7]];
      const set = [await hull(q, H), await hull(q, V)];
      await q.keyboard.press("r"); await q.waitForTimeout(300);
      seas[w + "@" + dpr + (off ? " FX off" : " FX on")] = { set, afterR: [await hull(q, H), await hull(q, V)], errs: q.errs.length };
      await c.close();
    }
  }
  check("salvo: a ship set down on your waters shows no sea between its cells (125%, 150% and a phone's 3x; Visual FX on and off; landed and after R)",
    Object.values(seas).every((s) => !s.errs && s.set.concat(s.afterR).every((b) => b < 40)), seas);

  // ---- a ship is one piece from end to end wherever it shows: set down,
  // sunk on your sea, sunk on the radar, and the radar's contacts at the
  // end, at the scales a laptop or a phone draws at (1x to 3x: the cells sit
  // at fractions of a pixel there), Visual FX on and off. A hull's colour
  // runs across it, never along it, so a line drawn down the hull's length,
  // a third of the way across (clear of the stripe), from past the bridge on
  // the stern to short of the turret on the bow, is one colour, and it
  // crosses every place two of the ship's cells meet. Read from the pixels
  // with the marks, the frames and the radar's sweep hidden: a line where
  // two cells meet (a drawn seam, sea showing through, a grid line or a
  // range ring showing through a contact) stands out from the rest.
  const seam = async (q, grid, cells) => {
    // (the corner buttons, fixed at the top of the screen, would lie over a
    // board's top row whenever the board is at the top of the screen)
    await q.evaluate((grid) => {
      document.getElementById(grid).scrollIntoView({ block: "center" });
      if (document.getElementById("seam-quiet")) return;
      const st = document.createElement("style"); st.id = "seam-quiet";
      st.textContent = ".cell::after, .grid.enemy::after, .gs-corner, .nav-back-games, .mute { visibility: hidden !important; } .cell { outline-color: transparent !important; } #over { display: none !important; }";
      document.head.appendChild(st);
    }, grid);
    // (once every ship has come down or gone down; the board's picture is
    // taken once it's in view and holding still, cut on whole CSS pixels,
    // and read by where the cells sit in the board)
    await q.waitForFunction(() => !document.querySelector(".vessel.drop, .vessel.sinking"), null, { timeout: 15000 }).catch(() => {});
    const png = (await q.locator("#" + grid).screenshot()).toString("base64");
    const g = await q.evaluate(({ grid, cells }) => {
      const b = document.getElementById(grid).getBoundingClientRect(), x0 = Math.floor(b.left), y0 = Math.floor(b.top);
      const rs = cells.map(([r, c]) => document.querySelector("#" + grid + ' .cell[data-r="' + r + '"][data-c="' + c + '"]').getBoundingClientRect());
      const a = rs[0], z = rs[rs.length - 1], w = a.width, horiz = Math.abs(a.top - z.top) < 1, across = 0.17 + 0.66 * 0.3;
      return horiz ? { horiz, k: devicePixelRatio, from: a.left - x0 + w * 0.8, to: z.left - x0 + w * 0.1, at: a.top - y0 + w * across }
        : { horiz, k: devicePixelRatio, from: a.top - y0 + w * 0.8, to: z.top - y0 + w * 0.1, at: a.left - x0 + w * across };
    }, { grid, cells });
    return q.evaluate(async ({ png, g }) => {
      const img = new Image(); img.src = "data:image/png;base64," + png; await img.decode();
      const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
      const x = cv.getContext("2d"); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, cv.width, cv.height).data, k = g.k, L = [];
      // brightness along the hull, a device pixel at a time
      const at = Math.round(g.at * k);
      for (let i = Math.round(g.from * k); i < Math.round(g.to * k); i++) {
        const n = (g.horiz ? at * cv.width + i : i * cv.width + at) * 4;
        L.push(0.3 * d[n] + 0.59 * d[n + 1] + 0.11 * d[n + 2]);
      }
      const sorted = L.slice().sort((a, b) => a - b), med = sorted[sorted.length >> 1];
      return +Math.max(...L.map((v) => Math.abs(v - med))).toFixed(1);
    }, { png, g });
  };
  // a fleet set down by hand: the carrier across B1 to B5, the battleship
  // down D7 to G7, the destroyer across I0 to I2, the submarine across J5 to
  // J7, the patrol boat down F2 to G2
  const fleetDown = async (q) => {
    const cell = (r, c) => q.locator('#playerGrid .cell[data-r="' + r + '"][data-c="' + c + '"]');
    await cell(1, 1).click(); await q.keyboard.press("r"); await cell(3, 7).click(); await q.keyboard.press("r");
    await cell(8, 0).click(); await cell(9, 5).click(); await q.keyboard.press("r"); await cell(5, 2).click();
    await q.mouse.move(2, 2); await q.waitForTimeout(1300);
  };
  const fxPage = async (c, off) => lib.open(c, base, "games/salvo/", { before: async (pg) => {
    await pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:salvo", off ? "1" : "0"); } catch (e) {} }, off);
    await hook(pg);
  } });
  // your shots at enemy waters, fired on the page (a hit keeps the turn)
  const sinkTheirs = (q, i) => q.evaluate((i) => {
    const g = document.getElementById("enemyGrid");
    __salvo.enemyShips[i].cells.forEach(([r, c]) => g.querySelector('.cell[data-r="' + r + '"][data-c="' + c + '"]').dispatchEvent(new MouseEvent("click", { bubbles: true })));
  }, i);
  const seams = {};
  for (const [name, opts] of [["laptop 1x", { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 }], ["laptop 125%", { viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 }],
    ["laptop 150%", { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.5 }], ["laptop 2x", { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }],
    ["Pixel 7", devices["Pixel 7"]], ["phone 3x", { viewport: { width: 390, height: 664 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }]]) {
    for (const off of [false, true]) {
      const c = await lib.newContext(browser, opts);
      const q = await fxPage(c, off);
      await fleetDown(q);
      const mine = await q.evaluate(() => __salvo.playerShips.map((s) => s.cells));
      const r = { set: [await seam(q, "playerGrid", mine[0]), await seam(q, "playerGrid", mine[1])] };
      await q.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); });
      await q.keyboard.press("Enter");
      await q.waitForSelector("#enemyGrid.active", { timeout: 30000 });
      // their carrier and battleship sunk by you; your carrier and battleship by the CPU's shots
      await sinkTheirs(q, 0); await sinkTheirs(q, 1);
      await q.evaluate((cs) => cs.forEach(([r, c]) => __salvo.shoot(r, c)), mine[0].concat(mine[1]));
      await q.waitForTimeout(1400);
      const theirs = await q.evaluate(() => __salvo.enemyShips.map((s) => s.cells));
      r.sunk = [await seam(q, "playerGrid", mine[0]), await seam(q, "playerGrid", mine[1]), await seam(q, "enemyGrid", theirs[0]), await seam(q, "enemyGrid", theirs[1])];
      // the end: their destroyer and submarine, never sunk, show as contacts
      await q.evaluate(() => __salvo.over("cpu")); await q.waitForTimeout(200);
      r.contacts = [await seam(q, "enemyGrid", theirs[2]), await seam(q, "enemyGrid", theirs[3])];
      r.errs = q.errs.length;
      seams[name + (off ? ", FX off" : ", FX on")] = r;
      await c.close();
    }
  }
  check("salvo: a ship is one piece from end to end, with no line where its cells meet: set down, sunk on your sea and on the radar, and the radar's contacts at the end (1x, 125%, 150%, 2x, a Pixel 7 and a phone's 3x; Visual FX on and off)",
    Object.values(seams).every((s) => !s.errs && s.set.concat(s.sunk, s.contacts).every((v) => v <= 6)), seams);

  // ---- a ship sunk goes down as one: the hull and the water round it move
  // (Visual FX on: a list, a swirl and bubbles on your sea; a flare and two
  // rings pinging out on the radar), never its cells on their own, and in
  // about a second it's the wreck, still, just as Visual FX off shows it at
  // once. Paused, it holds where it is. The CPU's next shot comes as soon
  // after a sinking in both modes. At a laptop's size and a Pixel 7's.
  const sinks = {};
  for (const [name, opts] of [["laptop", {}], ["Pixel 7", devices["Pixel 7"]]]) {
    for (const off of [false, true]) {
      const c = await lib.newContext(browser, opts);
      const q = await fxPage(c, off);
      await fleetDown(q);
      await q.evaluate(() => { window.coinFlip = (o, cb) => cb("cpu"); });
      await q.keyboard.press("Enter");
      // what a ship's going down is made of: the animations on its hull and
      // the water round it, and any on its cells themselves
      const parts = (grid, ship) => {
        const g = document.getElementById(grid), v = [...g.querySelectorAll(".vessel")].find((x) => x.classList.contains("ship" + ship.idx));
        const cells = ship.cells.map(([r, c]) => g.querySelector('.cell[data-r="' + r + '"][data-c="' + c + '"]'));
        const hull = v && v.querySelector(".hull"), cs = hull && getComputedStyle(hull);
        return { vessels: g.querySelectorAll(".vessel.ship" + ship.idx).length, sunk: !!v && v.classList.contains("sunk"),
          moving: v ? v.getAnimations({ subtree: true }).filter((a) => a.playState === "running").map((a) => a.animationName).sort().join() : "",
          cells: cells.reduce((n, e) => n + e.getAnimations().filter((a) => a.animationName).length, 0), fx: v ? v.querySelectorAll(".fx").length : 0,
          still: !!cs && cs.transform === "none" && cs.filter === "none" && cs.opacity === "1" };
      };
      // the CPU fires at your destroyer: read it as it goes down (the moment
      // its cells turn to sunk), then how long until the CPU's next shot
      // lands (the moment a cell turns to a hit, a miss or sunk), then once
      // it's down (on a busy machine an animation can start a while late)
      const mine = await q.evaluate((parts) => new Promise((done) => {
        const fn = new Function("return " + parts)();
        __salvo.aim(__salvo.playerShips[2].cells);
        const ship = __salvo.playerShips[2], g = document.getElementById("playerGrid");
        const shots = () => g.querySelectorAll(".cell.hit, .cell.sunk, .cell.miss").length;
        let at = null, t0 = 0, n = 0;
        const mo = new MutationObserver(() => {
          if (!at && ship.sunk) { at = fn("playerGrid", ship); t0 = performance.now(); n = shots(); return; }
          if (at && shots() !== n) {
            mo.disconnect();
            const gap = Math.round(performance.now() - t0), t1 = performance.now();
            const down = () => (!g.querySelector(".vessel.sinking") || performance.now() - t1 > 8000 ? done({ at, gap, after: fn("playerGrid", ship) }) : setTimeout(down, 50));
            setTimeout(down, Math.max(0, 1300 - gap));
          }
        });
        mo.observe(g, { subtree: true, attributes: true, attributeFilter: ["class"] });
        setTimeout(() => { mo.disconnect(); done({ at, gap: -1, after: null }); }, 30000);
      }), parts.toString());
      // then you sink their carrier, and (Visual FX on) pause at once
      await q.waitForSelector("#enemyGrid.active", { timeout: 30000 });
      await sinkTheirs(q, 0);
      const theirs = { at: await q.evaluate((src) => new Function("return " + src)()("enemyGrid", __salvo.enemyShips[0]), parts.toString()) };
      if (!off) {
        // (paused once it's well under way)
        await q.waitForFunction(() => {
          const v = [...document.querySelectorAll("#enemyGrid .vessel")].find((x) => x.classList.contains("ship" + __salvo.enemyShips[0].idx)), an = v ? v.getAnimations({ subtree: true }) : [];
          return !an.length || an[0].currentTime > 120;
        }, null, { timeout: 8000 }).catch(() => {});
        await q.keyboard.press("p");
        await q.waitForFunction(() => document.documentElement.classList.contains("sv-paused"), null, { timeout: 8000 }).catch(() => {});
        // (a pause takes hold on the next frame, which can come late on a busy machine)
        await q.waitForTimeout(300);
        theirs.paused = await q.evaluate(async () => {
          const v = [...document.querySelectorAll("#enemyGrid .vessel")].find((x) => x.classList.contains("ship" + __salvo.enemyShips[0].idx));
          const times = () => (v ? v.getAnimations({ subtree: true }) : []).map((a) => Math.round(a.currentTime)).join();
          const a = times(); await new Promise((r) => setTimeout(r, 500));
          return { a, b: times(), sinking: !!v && v.classList.contains("sinking") };
        });
        await q.keyboard.press("p");
      }
      await q.waitForTimeout(1400);
      await q.waitForFunction(() => !document.querySelector("#enemyGrid .vessel.sinking"), null, { timeout: 8000 }).catch(() => {});
      theirs.after = await q.evaluate((src) => new Function("return " + src)()("enemyGrid", __salvo.enemyShips[0]), parts.toString());
      sinks[name + (off ? ", FX off" : ", FX on")] = { mine, theirs, errs: q.errs.length };
      await c.close();
    }
  }
  const whole = (p) => p.vessels === 1 && p.sunk && p.cells === 0;
  const done = (p) => whole(p) && p.moving === "" && p.fx === 0 && p.still;
  const on = Object.keys(sinks).filter((k) => /FX on/.test(k)).map((k) => sinks[k]), off = Object.keys(sinks).filter((k) => /FX off/.test(k)).map((k) => sinks[k]);
  check("salvo, Visual FX on: a ship sunk goes down as one hull, its cells never moving on their own: on your sea it lists as the water swirls in and bubbles come up, on the radar it flares up with two rings pinging out; then it's the wreck, still (a laptop and a Pixel 7)",
    on.every((s) => !s.errs && whole(s.mine.at) && /^(bubble,)+founder-[hv],swirl,wash$/.test(s.mine.at.moving) && s.mine.at.fx >= 6 &&
      whole(s.theirs.at) && s.theirs.at.moving === "flare,ping,ping" && done(s.mine.after) && done(s.theirs.after)), sinks);
  check("salvo, Visual FX off: a ship sunk is the wreck at once, whole and still, the same as Visual FX on ends on (a laptop and a Pixel 7)",
    off.every((s) => !s.errs && done(s.mine.at) && done(s.theirs.at) && done(s.mine.after) && done(s.theirs.after)), sinks);
  check("salvo, Visual FX on: paused, a ship going down holds where it is, and goes on to the wreck on resume",
    on.every((s) => s.theirs.paused && s.theirs.paused.sinking && /^[1-9]/.test(s.theirs.paused.a) && s.theirs.paused.a === s.theirs.paused.b && done(s.theirs.after)), on.map((s) => s.theirs.paused));
  check("salvo: the CPU's next shot after it sinks your ship comes no sooner and no later with Visual FX on than off (0.8 s)",
    on.concat(off).every((s) => s.mine.gap >= 760) && Math.abs(on[0].mine.gap - off[0].mine.gap) <= 400 && Math.abs(on[1].mine.gap - off[1].mine.gap) <= 400, Object.keys(sinks).map((k) => k + ": " + sinks[k].mine.gap));
  await ctx.close();
};
