// Lanterns: letters typed while paused don't light anything; Enter on a
// focused mode button only picks the mode; a 0-point first night isn't a
// record; the results show the best streak of the night; a narrower window
// brings the lanterns back inside it; no two lanterns up start alike and the
// first letter locks onto one; Enter's fireworks; the dusk at the end of a
// night, the lanterns floating on; the slips' words in their middles.
const HOOK = ["start: startRun,", "start: startRun, gameOver: gameOver, xs: function () { return lanterns.map(function (l) { return l.x; }); }, width: function () { return W; },"];

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const open = () => lib.open(ctx, base, "games/lanterns/", { before: (pg) => lib.injectScript(pg, "games/lanterns/game.js", [HOOK]) });
  const done = async (p, what) => { check("lanterns " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };

  // ---- paused, the letters land in the hidden typing box but light nothing
  let p = await open();
  await p.evaluate(() => { Lanterns.start("festival"); Lanterns.noSpawn(); Lanterns.setRise(0); });
  await p.waitForTimeout(100);
  await p.evaluate(() => Lanterns.spawnWord("我", 0.5, 300));
  await p.click(".gs-pause-btn"); await p.waitForTimeout(100);
  await p.keyboard.type("wo"); await p.waitForTimeout(100);
  const paused = await p.evaluate(() => ({ score: Lanterns.score(), lit: Lanterns.clearedCount(), up: Lanterns.active().length }));
  await p.click(".gs-pause-btn", { force: true }); await p.waitForTimeout(100);
  await p.keyboard.type("wo"); await p.waitForTimeout(100);
  const resumed = await p.evaluate(() => ({ score: Lanterns.score(), lit: Lanterns.clearedCount() }));
  check("lanterns: typing a word while paused lights nothing; after resuming it lights",
    paused.score === 0 && paused.lit === 0 && paused.up === 1 && resumed.lit === 1 && resumed.score > 0, { paused, resumed });
  await done(p, "paused typing");

  // ---- Enter on a focused mode button picks that mode and starts nothing
  p = await open();
  await p.keyboard.press("1");
  await p.evaluate(() => document.querySelector('#pick-mode button[data-v="tone"]').focus());
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const menu = await p.evaluate(() => ({ state: Lanterns.state(), tone: document.querySelector('#pick-mode button[data-v="tone"]').classList.contains("on") }));
  check("lanterns: Enter on the focused Tone Master button picks it, without starting a Festival night", menu.state === "menu" && menu.tone, menu);
  await p.evaluate(() => document.activeElement.blur());
  await p.click('#pick-mode button[data-v="festival"]');
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const clicked = await p.evaluate(() => Lanterns.state());
  check("lanterns: clicking a mode, then Enter, starts the night", clicked === "play", clicked);
  await done(p, "menu Enter");

  // ---- a first night that lit nothing isn't a record; the streak shown is the night's best
  p = await open();
  await p.evaluate(() => { Lanterns.start("festival"); Lanterns.noSpawn(); });
  await p.waitForTimeout(100);
  await p.evaluate(() => Lanterns.gameOver()); await p.waitForTimeout(100);
  const zero = await p.evaluate(() => document.getElementById("over-stats").textContent);
  check("lanterns: a 0-point first night isn't \"a new record night\"", !/new record/.test(zero), zero);
  await p.evaluate(() => {
    Lanterns.start("festival"); Lanterns.noSpawn(); Lanterns.setRise(0);
    Lanterns.spawnWord("我", 0.3, 300); Lanterns.type("wo");
    Lanterns.spawnWord("你", 0.6, 300); Lanterns.type("ni");
    Lanterns.spawnWord("他", 0.5, 300); Lanterns.type("tq");   // a miss resets the streak
    Lanterns.gameOver();
  });
  await p.waitForTimeout(100);
  const streak = await p.evaluate(() => document.getElementById("over-stats").textContent);
  check("lanterns: the results show the night's best streak, not the one it ended on", /×1\.1/.test(streak), streak);
  await done(p, "results");

  // ---- a word lights the moment its pinyin is typed (none waits for a
  // longer one: no two lanterns up start with the same letter)
  p = await open();
  // the keys pressed in the page in one step, and what's still up straight
  // after: a busy machine can hold the runner up between real key presses
  const keys = (s) => p.evaluate((s) => {
    for (const k of s) (document.activeElement || document.body).dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    return Lanterns.active().map((l) => l.hanzi).sort().join("");
  }, s);
  const fresh = async (...words) => {
    await p.evaluate((words) => { Lanterns.start("festival"); Lanterns.noSpawn(); Lanterns.setRise(0); words.forEach((w, i) => Lanterns.spawnWord(w, 0.2 + i * 0.3, 300 - i * 40)); }, words);
    await p.waitForTimeout(50);
  };
  await fresh("你");
  const alone = await keys("ni");
  check("lanterns: 你 on its own still lights the moment ni is typed", alone === "", alone);
  await fresh("你", "我");
  const both = { up: await keys("niwo"), lit: await p.evaluate(() => Lanterns.clearedCount()), streak: await p.evaluate(() => Lanterns.streakNow()) };
  check("lanterns: ni lights 你 at once and the w that follows starts 我, which wo lights", both.up === "" && both.lit === 2 && both.streak === 2, both);
  await done(p, "word at once");

  // ---- Tone Master: the neutral tone is 5, and the menu says so; 0 works too
  p = await open();
  const tmHow = await p.evaluate(() => document.getElementById("menu").textContent);
  await p.evaluate(() => { Lanterns.start("tone"); Lanterns.noSpawn(); Lanterns.setRise(0); Lanterns.spawnWord("的", 0.3, 300); Lanterns.type("de5"); });
  const tmFive = await p.evaluate(() => Lanterns.clearedCount());
  await p.evaluate(() => { Lanterns.spawnWord("吗", 0.6, 300); Lanterns.type("ma0"); });
  const tmZero = await p.evaluate(() => Lanterns.clearedCount());
  check("lanterns tone master: the menu explains 5 is the neutral tone; de5 lights 的 and ma0 lights 吗",
    /5 for the neutral tone/.test(tmHow) && tmFive === 1 && tmZero === 2, { tmFive, tmZero, how: /neutral/.test(tmHow) });
  await done(p, "neutral tone");

  // ---- narrowing the window brings a lantern near its right edge back in
  p = await open();
  await p.evaluate(() => { Lanterns.start("festival"); Lanterns.noSpawn(); Lanterns.setRise(0); Lanterns.spawnWord("我", 0.95, 300); });
  await p.setViewportSize({ width: 412, height: 900 }); await p.waitForTimeout(200);
  const fit = await p.evaluate(() => ({ xs: Lanterns.xs(), w: Lanterns.width() }));
  check("lanterns: after the window narrows, every lantern is inside it", fit.w === 412 && fit.xs.length === 1 && fit.xs.every((x) => x > 0 && x < fit.w), fit);
  await done(p, "resize");

  // ---- what's been typed is drawn over every lantern: one spawned later (so
  // drawn later) and hanging across the typed one's letters used to cover them
  p = await open();
  await p.evaluate(() => {
    const real = CanvasRenderingContext2D.prototype.fillText;
    window.__texts = [];
    CanvasRenderingContext2D.prototype.fillText = function (s) { window.__texts.push(String(s)); return real.apply(this, arguments); };
    Lanterns.start("festival"); Lanterns.noSpawn(); Lanterns.setRise(0);
    Lanterns.spawnWord("我", 0.5, 300); Lanterns.spawnWord("你", 0.5, 380);
    Lanterns.type("w");
  });
  // (a few frames on, the last whole frame's text: it starts at the seal's 灯)
  const order = await p.evaluate(() => new Promise((res) => {
    let n = 4;
    const f = () => { if (--n > 0) return requestAnimationFrame(f); const t = window.__texts; res(t.slice(t.lastIndexOf("灯") + 1)); };
    requestAnimationFrame(f);
  }));
  check("lanterns: the letters typed so far are drawn after every lantern, so none covers them",
    order.indexOf("你") !== -1 && order.indexOf("w") > order.indexOf("我") && order.indexOf("w") > order.indexOf("你"), order);
  await done(p, "typed letters on top");

  // ---- no two lanterns up start with the same letter (forty tries: once the
  // free letters run out, none comes), and the first letter typed locks onto
  // one: only it shows the letters, a letter that fits another instead is a
  // miss, and its word lights it alone
  p = await open();
  const firsts = await p.evaluate(() => {
    let a = 7; const r = Math.random; Math.random = () => ((a = (a * 16807) % 2147483647) / 2147483647);
    Lanterns.start("festival"); Lanterns.noSpawn(); Lanterns.setRise(0);
    let made = 0;
    for (let i = 0; i < 40; i++) if (Lanterns.spawnWord()) made++;
    Math.random = r;
    const f = Lanterns.active().map((l) => l.key[0]);
    return { made, firsts: f.join(""), unique: new Set(f).size === f.length };
  });
  check("lanterns: no two lanterns up start with the same letter, and spawning still goes on until the free letters run out",
    firsts.made >= 8 && firsts.unique, firsts);
  await p.evaluate(() => {
    const real = CanvasRenderingContext2D.prototype.fillText;
    window.__texts = [];
    CanvasRenderingContext2D.prototype.fillText = function (s) { window.__texts.push(String(s)); return real.apply(this, arguments); };
    Lanterns.start("festival"); Lanterns.noSpawn(); Lanterns.setRise(0);
    // (two alike only through the test hook: spawning never puts them up together)
    Lanterns.spawnWord("出院", 0.3, 260); Lanterns.spawnWord("吹", 0.7, 340);
    Lanterns.type("chu");
  });
  // (a few frames on, the last whole frame's text, from the seal's 灯: how many lanterns show "chu" under them)
  const shownChu = await p.evaluate(() => new Promise((res) => {
    let n = 4;
    const f = () => { if (--n > 0) return requestAnimationFrame(f); const t = window.__texts; res(t.slice(t.lastIndexOf("灯") + 1).filter((s) => s === "chu").length); };
    requestAnimationFrame(f);
  }));
  const lockI = await p.evaluate(() => { Lanterns.type("i"); return { up: Lanterns.active().map((l) => l.hanzi).sort().join(""), typed: Lanterns.bufferNow(), lit: Lanterns.clearedCount() }; });
  const lockYuan = await p.evaluate(() => { Lanterns.type("yuan"); return { up: Lanterns.active().map((l) => l.hanzi).join(""), lit: Lanterns.clearedCount() }; });
  check("lanterns: the first letter locks onto one lantern (the higher of two alike): only it shows the letters, a letter that fits the other instead is a miss, and its word lights it alone",
    shownChu === 1 && lockI.up === "出院吹" && lockI.typed === "chu" && lockI.lit === 0 && lockYuan.up === "吹" && lockYuan.lit === 1, { shownChu, lockI, lockYuan });
  await done(p, "first letters");

  // ---- Enter sets off fireworks: their light comes down from the top through
  // the upper part of the sky and lights every lantern there (10 each, nothing
  // to the streak), none lower; three a night in either mode, one at a time;
  // none on the menu or the results; the same with Visual FX off
  const sweep = {};
  const openFx = (off) => lib.open(ctx, base, "games/lanterns/", { before: async (pg) => {
    await pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:lanterns", off ? "1" : "0"); } catch (e) {} }, off);
    await lib.injectScript(pg, "games/lanterns/game.js", [HOOK]);
  } });
  const burstDone = (q) => q.waitForFunction(() => Lanterns.bursting && !Lanterns.bursting(), null, { timeout: 8000 }).catch(() => {});
  for (const off of [false, true]) {
    const q = await openFx(off);
    await q.evaluate(() => {
      Lanterns.start("festival"); Lanterns.noSpawn(); Lanterns.setRise(0);
      [["我", 0.15, 0.08], ["他", 0.4, 0.25], ["的", 0.65, 0.4], ["你", 0.3, 0.6], ["吗", 0.8, 0.85]].forEach(([h, x, y]) => Lanterns.spawnWord(h, x, y * innerHeight));
    });
    const left0 = await q.evaluate(() => (Lanterns.burstsLeft ? Lanterns.burstsLeft() : null));
    await q.keyboard.press("Enter");
    await burstDone(q);
    const r = await q.evaluate(() => ({ up: Lanterns.active().map((l) => l.hanzi).sort().join(""), lit: Lanterns.clearedCount(), score: Lanterns.score(), streak: Lanterns.streakNow(), left: Lanterns.burstsLeft ? Lanterns.burstsLeft() : null }));
    r.left0 = left0;
    if (!off) {
      // the rest of the night's fireworks, then a press with none left
      for (let i = 0; i < 2; i++) { await q.keyboard.press("Enter"); await burstDone(q); }
      await q.keyboard.press("Enter");
      // (each read guarded: on a page without fireworks the checks fail, the suite goes on)
      r.none = await q.evaluate(() => { const b = document.getElementById("burst"), c = document.getElementById("hud-bursts"); return Lanterns.burstsLeft ? { left: Lanterns.burstsLeft(), going: Lanterns.bursting(), button: !!b && !b.hidden, hud: c ? c.textContent : null } : null; });
      // Tone Master's count; none on the results or the menu
      r.tone = await q.evaluate(() => { Lanterns.start("tone"); return Lanterns.burstsLeft ? Lanterns.burstsLeft() : null; });
      r.ended = await q.evaluate(() => {
        if (!Lanterns.fireworks) return null;
        Lanterns.gameOver(); Lanterns.fireworks(); const o = { going: Lanterns.bursting(), left: Lanterns.burstsLeft() };
        Lanterns.toMenu(); Lanterns.fireworks(); o.menu = Lanterns.bursting(); return o;
      });
    }
    sweep[off ? "off" : "on"] = r;
    await done(q, "fireworks FX " + (off ? "off" : "on"));
  }
  check("lanterns: Enter's fireworks light every lantern in the upper part of the sky (10 each, no streak) and none lower, FX on and off alike",
    ["on", "off"].every((m) => { const r = sweep[m]; return r.left0 === 3 && r.up === "你吗" && r.lit === 3 && r.score === 30 && r.streak === 0 && r.left === 2; }), sweep);
  check("lanterns: three fireworks a night in either mode; with none left Enter does nothing and the count and button say so; none on the results or the menu",
    !!sweep.on.none && sweep.on.none.left === 0 && !sweep.on.none.going && !sweep.on.none.button && sweep.on.none.hud === "0" &&
      sweep.on.tone === 3 && !!sweep.on.ended && !sweep.on.ended.going && sweep.on.ended.left === 3 && !sweep.on.ended.menu, sweep.on);

  // ---- a night that ends dark: the sky really goes to dusk behind the card
  // (over a moment with FX on, at once with it off), not so dark that a
  // lantern stops glowing out of it; and the lanterns still up float on and
  // away, costing nothing
  const night = {};
  for (const off of [false, true]) {
    const q = await openFx(off);
    // the colour on screen at a patch of open sky (the canvas, under the end
    // card's backdrop) and on a lantern's paper, as relative luminance
    const look = () => q.evaluate(() => {
      const cv = document.getElementById("stage"), g = cv.getContext("2d"), k = cv.width / innerWidth;
      const at = (x, y) => Array.from(g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data).slice(0, 3);
      const over = document.getElementById("over"), m = (over.hidden ? "rgba(0, 0, 0, 0)" : getComputedStyle(over).backgroundColor).match(/[\d.]+/g).map(Number);
      const a = m.length > 3 ? m[3] : 1, seen = (c) => c.map((v, i) => v * (1 - a) + m[i] * a);
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const l = Lanterns.active()[0];
      // (the lantern's paper at its heart, under the hanzi)
      return { sky: +lum(seen(at(innerWidth * 0.93, innerHeight * 0.42))).toFixed(4), lantern: l ? +lum(seen(at(Lanterns.xs()[0], l.y + 23))).toFixed(4) : null, y: l ? l.y : null };
    });
    const frames = (n) => q.evaluate((n) => new Promise((res) => { const f = () => (--n > 0 ? requestAnimationFrame(f) : res()); requestAnimationFrame(f); }), n);
    await q.evaluate(() => { Lanterns.start("festival"); Lanterns.noSpawn(); Lanterns.spawnWord("我", 0.5, innerHeight * 0.62); });
    await frames(3);
    const play = await look();
    await q.evaluate(() => Lanterns.gameOver());
    await frames(2);
    const soon = await look();
    await frames(150);
    const end = await look();
    // the lantern goes on rising; sent on fast, it floats away for nothing
    await q.evaluate(() => Lanterns.setRise(12));
    const gone = await q.waitForFunction(() => Lanterns.active().length === 0, null, { timeout: 8000 }).then(() => true, () => false);
    const after = await q.evaluate(() => ({ state: Lanterns.state(), escaped: Lanterns.escapedCount(), score: Lanterns.score(), card: !document.getElementById("over").hidden }));
    night[off ? "off" : "on"] = { play, soon, end, gone, after };
    await done(q, "dusk FX " + (off ? "off" : "on"));
  }
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  check("lanterns: when a night ends dark the sky goes to dusk behind the card (well under half as bright), not black, and a lantern still glows out of it",
    ["on", "off"].every((m) => { const n = night[m]; return n.end.sky < n.play.sky * 0.45 && n.end.sky > 0.05 && ratio(n.end.lantern, n.end.sky) > 2; }), night);
  check("lanterns: the dusk falls over a moment with FX on, at once with it off",
    night.on.soon.sky > night.on.end.sky * 1.15 && Math.abs(night.off.soon.sky - night.off.end.sky) < 0.002, { on: [night.on.soon.sky, night.on.end.sky], off: [night.off.soon.sky, night.off.end.sky] });
  check("lanterns: after the night the lanterns still up go on rising and float away, costing nothing, the results still up",
    ["on", "off"].every((m) => { const n = night[m]; return n.end.y < n.soon.y - 5 && n.gone && n.after.state === "over" && n.after.escaped === 0 && n.after.card; }), night);

  // ---- what's typed, and what to type, sit in the middle of their slip, and
  // the score, wishes and fireworks in the middle of theirs (by their
  // capitals, the lanterns and stars by their ink: within 0.75 px), on a
  // laptop and on a phone
  const mids = {};
  for (const [w, h] of [[1280, 900], [390, 664]]) {
    const c = await lib.newContext(browser, { viewport: { width: w, height: h } });
    const q = await lib.open(c, base, "games/lanterns/", { before: (pg) => lib.injectScript(pg, "games/lanterns/game.js", [HOOK]) });
    await q.evaluate(() => { Lanterns.start("festival"); Lanterns.noSpawn(); Lanterns.setRise(0); });
    await q.waitForTimeout(150);
    mids[w + "x" + h] = await q.evaluate(() => {
      // an element's baseline (a 0x0 mark on it) and its text's ink above and
      // below it, drawn on a canvas in the same face
      const ink = (el, text) => {
        const cs = getComputedStyle(el), mk = document.createElement("i");
        mk.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline;margin:0;padding:0;border:0";
        el.appendChild(mk); const base = mk.getBoundingClientRect().bottom; mk.remove();
        const S = 4, fs = parseFloat(cs.fontSize) * S, cv = document.createElement("canvas");
        cv.width = Math.ceil(fs * 6) + 40; cv.height = Math.ceil(fs * 3);
        const g = cv.getContext("2d"); g.font = cs.fontStyle + " " + cs.fontWeight + " " + fs + "px " + cs.fontFamily;
        const y0 = Math.round(fs * 2); g.fillText(text, 10, y0);
        const d = g.getImageData(0, 0, cv.width, cv.height).data;
        let top = -1, bot = -1;
        for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 100) { if (top < 0) top = y; bot = y; break; }
        return { base, top: base + (top - y0) / S, bot: base + (bot + 1 - y0) / S };
      };
      const mid = (el) => { const r = el.getBoundingClientRect(); return r.top + el.clientTop + el.clientHeight / 2; };
      const capOff = (el, box) => { const i = ink(el, "H"); return +((i.top + i.base) / 2 - mid(box)).toFixed(2); };
      const inkOff = (el, box) => { const i = ink(el, el.textContent.trim()); return +((i.top + i.bot) / 2 - mid(box)).toFixed(2); };
      const hud = document.getElementById("hud"), echo = document.getElementById("echo"), o = {};
      o.score = capOff(document.getElementById("hud-score"), hud);
      o.wishes = inkOff(document.getElementById("hud-wishes"), hud);
      const b = document.getElementById("hud-bursts");
      o.bursts = b ? inkOff(b, hud) : null;
      // what to type: the slip's own words (or, set as its ::before was, a span of the same)
      let ph = echo.querySelector(".ph");
      if (!ph) { const bs = getComputedStyle(echo, "::before"); ph = document.createElement("span"); ph.style.cssText = "font-size:" + bs.fontSize + ";font-weight:" + bs.fontWeight + ";letter-spacing:" + bs.letterSpacing; ph.textContent = "type the pinyin…"; echo.appendChild(ph); }
      o.placeholder = capOff(ph, echo);
      Lanterns.spawnWord("出院", 0.5, 300); Lanterns.type("chu");
      const typed = echo.querySelector("span") || echo;
      o.typed = capOff(typed, echo);
      return o;
    });
    await done(q, "slips " + w + "x" + h);
    await c.close();
  }
  check("lanterns: the score, wishes and fireworks sit in the middle of the score slip, and what's typed or what to type in the middle of the typing slip (within 0.75 px, laptop and phone)",
    Object.values(mids).every((o) => ["score", "wishes", "bursts", "placeholder", "typed"].every((k) => o[k] !== null && Math.abs(o[k]) <= 0.75)), mids);

  await ctx.close();
};
