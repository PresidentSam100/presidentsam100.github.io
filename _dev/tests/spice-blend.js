// Spice Blend: the menu takes 1 and 2 (shown on them, the pick kept) and
// Space or Enter begins; the weights are right (a brass weight for each spice
// in its bowl, a wooden one for each right spice elsewhere, every bowl of the
// blend counted once); the spices take 1 to 6 (shown on them, in the middle
// and inside each box, and each name fits its box), Backspace takes the last
// back and Enter tastes a full row (not a part-filled one; shown on Taste); a full
// row's weights' place becomes a Taste button; naming the blend wins, keeps
// the fewest tastes and the record, and running out of tastes shows the blend;
// the end card waits a moment for Space, then pours another; paused, keys pour
// nothing; with Visual FX off the weights land without moving; on a phone a
// tap on a spice fills the next bowl.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const open = (c, opts) => lib.open(c || ctx, base, "games/spice-blend/", opts);
  const done = async (p, what) => { check("spice-blend " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  const wait = (p, ms) => p.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), ms);

  // ---- the weights
  let p = await open();
  const sc = await p.evaluate(() => {
    const s = SpiceBlend.score;
    return [s([0, 1, 2, 3], [0, 1, 2, 3]), s([0, 1, 2, 3], [3, 2, 1, 0]), s([0, 0, 1, 1], [0, 1, 0, 1]), s([0, 0, 0, 1], [0, 0, 1, 1]), s([2, 2, 3, 4], [2, 5, 2, 2]), s([0, 1, 2, 3], [4, 4, 5, 5])]
      .map((r) => r.right + "/" + r.near).join(" ");
  });
  check("spice-blend: a brass weight for each spice in its bowl, a wooden one for each right spice in another, every bowl counted once", sc === "4/0 0/4 2/2 3/0 1/1 0/0", sc);

  // ---- the menu and the keys
  const caps = await p.evaluate(() => [...document.querySelectorAll("#pick-mode button, #play")].map((b) => (b.querySelector("[data-gs-key]") || b).getAttribute("data-gs-key")));
  await p.keyboard.press("2"); await p.waitForTimeout(80);
  const kept = await p.evaluate(() => localStorage.getItem("spiceblend_mode"));
  await p.keyboard.press("1"); await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const began = await p.evaluate(() => ({ state: SpiceBlend.state(), mode: SpiceBlend.mode(), spices: [...document.querySelectorAll("#palette .spice")].map((b) => b.getAttribute("data-gs-key")).join(""), bowls: document.querySelectorAll(".row.now .bowl").length }));
  check("spice-blend: the modes wear 1 and 2 and the start Space or Enter; 2 picks the bazaar (kept); Enter pours the stall's blend, its six spices wearing 1 to 6, four bowls a row",
    caps.join() === "1,2,Space or Enter" && kept === "bazaar" && began.state === "play" && began.mode === "stall" && began.spices === "123456" && began.bowls === 4, { caps, kept, began });
  await p.evaluate(() => SpiceBlend.setBlend([0, 1, 2, 3]));
  await p.keyboard.press("1"); await p.keyboard.press("2"); await p.keyboard.press("3"); await p.waitForTimeout(60);
  await p.keyboard.press("Enter"); await p.waitForTimeout(60);
  const part = await p.evaluate(() => ({ cur: SpiceBlend.cur().join(), rows: SpiceBlend.rows().length }));
  await p.keyboard.press("Backspace"); await p.waitForTimeout(60);
  const back = await p.evaluate(() => SpiceBlend.cur().join());
  await p.keyboard.press("6"); await p.keyboard.press("4"); await p.waitForTimeout(60);
  const tasteBtn = await p.evaluate(() => !!document.querySelector(".row.now .taste-here"));
  await p.keyboard.press("Enter"); await p.waitForTimeout(100);
  const tasted = await p.evaluate(() => SpiceBlend.rows());
  check("spice-blend: 1 2 3 pour three bowls; Enter doesn't taste a part-filled row; Backspace takes the last back; a full row grows a Taste button, and Enter tastes it (three brass weights here)",
    part.cur === "0,1,2" && part.rows === 0 && back === "0,1" && tasteBtn && tasted.length === 1 && tasted[0].guess.join() === "0,1,5,3" && tasted[0].right === 3 && tasted[0].near === 0, { part, back, tasteBtn, tasted });
  // ---- paused, keys pour nothing
  await p.keyboard.press("p"); await p.waitForTimeout(120);
  await p.keyboard.press("1"); await p.waitForTimeout(60);
  const paused = await p.evaluate(() => SpiceBlend.cur().length);
  await p.keyboard.press("p"); await p.waitForTimeout(120);
  check("spice-blend: paused, a number key pours nothing", paused === 0, paused);
  // ---- naming the blend wins; the fewest tastes and the record are kept; Space waits, then another
  const win = await p.evaluate(() => {
    localStorage.removeItem("spiceblend_best_stall"); localStorage.removeItem("spiceblend_record_stall");
    SpiceBlend.start("stall"); SpiceBlend.setBlend([2, 2, 5, 0]);
    [5, 5, 5, 5].forEach((s) => SpiceBlend.add(s)); SpiceBlend.taste();
    [2, 2, 5, 0].forEach((s) => SpiceBlend.add(s)); SpiceBlend.taste();
    return { state: SpiceBlend.state(), title: document.getElementById("over-title").textContent, msg: document.getElementById("over-msg").textContent, best: localStorage.getItem("spiceblend_best_stall"), rec: localStorage.getItem("spiceblend_record_stall"), code: document.querySelectorAll("#over-code .bowl").length };
  });
  await p.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })));
  const early = await p.evaluate(() => SpiceBlend.state());
  await wait(p, 900);
  await p.keyboard.press("Space"); await p.waitForTimeout(120);
  const again = await p.evaluate(() => ({ state: SpiceBlend.state(), rows: SpiceBlend.rows().length }));
  check("spice-blend: naming the blend in two tastes wins, the card showing the blend, keeping 2 as the fewest tastes and a win in the record; Space waits a moment, then pours another",
    win.state === "over" && win.title === "That's the blend" && win.msg === "2 tastes" && win.best === "2" && JSON.parse(win.rec).w === 1 && win.code === 4 && early === "over" && again.state === "play" && again.rows === 0, { win, early, again });
  // ...and ten wrong tastes lose, showing it
  const lose = await p.evaluate(() => {
    SpiceBlend.setBlend([0, 0, 0, 0]);
    for (let t = 0; t < 10; t++) { [1, 1, 1, 1].forEach((s) => SpiceBlend.add(s)); SpiceBlend.taste(); }
    return { state: SpiceBlend.state(), title: document.getElementById("over-title").textContent, rec: localStorage.getItem("spiceblend_record_stall"), stats: document.getElementById("over-stats").textContent };
  });
  check("spice-blend: ten tastes without the blend lose, the card showing the blend and a loss in the record", lose.state === "over" && lose.title === "The blend was" && JSON.parse(lose.rec).l === 1 && /saffron · saffron · saffron · saffron/.test(lose.stats), lose);
  await wait(p, 900);
  await p.keyboard.press("Backspace"); await p.waitForTimeout(120);
  check("spice-blend: Backspace on the end card goes to the menu", (await p.evaluate(() => SpiceBlend.state())) === "menu", null);
  await done(p, "play");

  // ---- each spice's key sits in the middle of its box, under the name and
  // inside the border; the Taste button wears Enter; every name fits its box
  // (both stalls, on a laptop and in a window narrow enough to stack the
  // spices two wide)
  const SEATS = () => {
    // a keycap is drawn by ::after, which has no box to measure: a span given
    // its every computed style stands in for it, in its place
    const spices = [...document.querySelectorAll("#palette .spice")];
    const looks = spices.map((b) => { const cs = getComputedStyle(b, "::after"), o = {}; for (let i = 0; i < cs.length; i++) if (cs[i] !== "content") o[cs[i]] = cs.getPropertyValue(cs[i]); return o; });
    const hide = document.createElement("style"); hide.textContent = ".spice::after { display: none !important; }"; document.head.appendChild(hide);
    const bad = [];
    spices.forEach((b, i) => {
      const s = document.createElement("span");
      for (const k in looks[i]) s.style.setProperty(k, looks[i][k]);
      s.textContent = b.getAttribute("data-gs-key"); b.appendChild(s);
      const r = b.getBoundingClientRect(), k = s.getBoundingClientRect(), n = b.querySelector("small").getBoundingClientRect(), bw = parseFloat(getComputedStyle(b).borderBottomWidth);
      const mid = (k.left + k.right) / 2 - (r.left + r.right) / 2;
      const name = b.querySelector("small").textContent;
      if (!(Math.abs(mid) <= 0.75 && k.top >= n.bottom - 0.5 && k.left >= r.left + bw - 0.5 && k.right <= r.right - bw + 0.5 && k.bottom <= r.bottom - bw + 0.5))
        bad.push(name + " key " + mid.toFixed(1) + " off the middle, " + (k.bottom - (r.bottom - bw)).toFixed(1) + " below the inside");
      if (!(n.left >= r.left + bw - 0.5 && n.right <= r.right - bw + 0.5)) bad.push(name + " " + n.width.toFixed(1) + " wide in " + (r.width - 2 * bw).toFixed(1));
      s.remove();
    });
    hide.remove();
    return { bad, n: spices.length, keys: spices.map((b) => b.getAttribute("data-gs-key")).join(""), taste: document.getElementById("btn-taste").getAttribute("data-gs-key") };
  };
  const seats = {};
  for (const w of [1280, 740]) {
    const c = w === 1280 ? ctx : await lib.newContext(browser, { viewport: { width: w, height: 760 } });
    const q = await open(c);
    for (const m of ["stall", "bazaar"]) { await q.evaluate((m) => SpiceBlend.start(m), m); await q.waitForTimeout(150); seats[w + " " + m] = await q.evaluate(SEATS); }
    await done(q, "keys at " + w);
    if (c !== ctx) await c.close();
  }
  check("spice-blend: each spice's key sits in the middle of its box, under the name and inside the border, and each name fits its box; the Taste button wears Enter (both stalls, a laptop and a window two spices wide)",
    Object.values(seats).every((s) => !s.bad.length && s.taste === "Enter" && s.keys === "12345678".slice(0, s.n) && s.n >= 6), seats);

  // ---- Visual FX off: the weights land without moving
  const anim = {};
  for (const off of [false, true]) {
    const q = await open(null, { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:spice-blend", off ? "1" : "0"); } catch (e) {} }, off) });
    anim[off ? "off" : "on"] = await q.evaluate(() => { SpiceBlend.start("stall"); SpiceBlend.setBlend([0, 1, 2, 3]); [0, 2, 4, 4].forEach((s) => SpiceBlend.add(s)); SpiceBlend.taste(); const w = document.querySelector(".weights i.brass"); return getComputedStyle(w).animationName; });
    await done(q, "FX " + (off ? "off" : "on"));
  }
  check("spice-blend: with Visual FX on the weights drop onto the counter; with it off they're just there", anim.on === "sb-weigh" && anim.off === "none", anim);

  // ---- on a phone: a tap on a spice fills the next bowl
  {
    const { devices } = require("@playwright/test");
    const c = await lib.newContext(browser, devices["Pixel 7"]);
    const q = await open(c);
    await q.evaluate(() => SpiceBlend.start("stall"));
    const r = await q.evaluate(() => { const e = document.querySelectorAll("#palette .spice")[2].getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; });
    await q.touchscreen.tap(r.x, r.y); await q.waitForTimeout(120);
    check("spice-blend, phone: a tap on a spice fills the next bowl", (await q.evaluate(() => SpiceBlend.cur().join())) === "2", null);
    await done(q, "phone");
    await c.close();
  }
  await ctx.close();

  // ---- the stall's name, SAM LU SPICES, painted on a canvas flap hung from
  // the awning: tucked up under its scallops in the top row between the
  // corner buttons, or on a phone hung on cords just under them. Its letters
  // are inside the screen and clear of the corner buttons, the title, the
  // tastes' count, the rows, the spices and the buttons, on the menu and in
  // both stalls; the page is no taller and the tastes' bowls no smaller than
  // with the flap taken down; no "made by" line
  {
    const { devices } = require("@playwright/test");
    const mob = (w, h) => ({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
    const SIGN = () => {
      const s = window.SpiceBlend && SpiceBlend.sign && SpiceBlend.sign();
      if (!s) return null;
      const el = document.getElementById("awning-name"), rg = document.createRange();
      rg.selectNodeContents(el);
      const t = rg.getBoundingClientRect();
      const hit = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top; };
      const over = [...document.querySelectorAll(".nav-back-games, .gs-corner > *, .title, .tries, #rows .row, #palette .spice, #tools button, .stall .keys, #record")]
        .filter((e) => getComputedStyle(e).visibility !== "hidden").filter(hit).map((e) => e.id || e.className || e.tagName);
      const cord = parseFloat(getComputedStyle(el).getPropertyValue("--cord")) || 0;
      // the page's height and the bowls' size, and both again with the flap taken down
      const bowl = () => parseFloat(getComputedStyle(document.getElementById("rows")).getPropertyValue("--bowl")) || 0;
      const sh = document.documentElement.scrollHeight, b = bowl(), at = el.nextSibling, home = el.parentNode;
      el.remove(); window.dispatchEvent(new Event("resize"));
      const shBare = document.documentElement.scrollHeight, bBare = bowl();
      home.insertBefore(el, at); window.dispatchEvent(new Event("resize"));
      return { text: s.text.trim(), low: s.low, size: s.size, x: Math.round(t.left), y: Math.round(t.top), right: Math.round(t.right), bottom: Math.round(t.bottom),
        top: Math.round(s.y), hangs: s.low ? s.y - cord <= 27 : s.y <= 26, W: innerWidth, H: innerHeight, sh, shBare, bowl: b, bowlBare: bBare, over,
        madeBy: /made by/i.test(document.body.innerText) };
    };
    for (const [label, opts] of [["1280x900", {}], ["1366x657", { viewport: { width: 1366, height: 657 } }], ["1280x600", { viewport: { width: 1280, height: 600 } }],
      ["Pixel 7", devices["Pixel 7"]], ["390x844", mob(390, 844)], ["360x640", mob(360, 640)], ["320x568", mob(320, 568)], ["375x553", mob(375, 553)], ["360x560", mob(360, 560)],
      ["Pixel 7 sideways", devices["Pixel 7 landscape"]]]) {
      const c = await lib.newContext(browser, opts);
      const q = await open(c);
      const seen = { menu: await q.evaluate(SIGN) };
      for (const m of ["stall", "bazaar"]) { await q.evaluate((m) => window.SpiceBlend && SpiceBlend.start(m), m); await q.waitForTimeout(150); seen[m] = await q.evaluate(SIGN); }
      const bad = Object.entries(seen).filter(([k, r]) => !r || r.text !== "SAM LU SPICES" || !r.hangs || r.size < 12 || r.x < 0 || r.right > r.W || r.y < 0 || r.bottom > r.H ||
        (k !== "menu" && r.over.length) || (k === "menu" && r.over.some((o) => /nav-back|gs-|toggle/.test(o))) || r.sh > Math.max(r.H, r.shBare) || r.bowl < r.bowlBare || r.madeBy);
      check("spice-blend, " + label + ": SAM LU SPICES is painted on a flap hung from the awning, inside the screen and clear of the corner buttons, the title and the play; the page no taller and the bowls no smaller than without it",
        bad.length === 0, bad.length ? Object.fromEntries(bad) : Object.fromEntries(Object.entries(seen).map(([k, r]) => [k, (r.low ? "low " : "top row ") + r.size + "px"])));
      await done(q, "awning name, " + label);
      await c.close();
    }
    // with Visual FX on the flap sways a little on its hooks; off, it hangs still
    const sway = {}, cs = await lib.newContext(browser);
    for (const off of [false, true]) {
      const q = await open(cs, { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:spice-blend", off ? "1" : "0"); } catch (e) {} }, off) });
      sway[off ? "off" : "on"] = await q.evaluate(() => { const e = document.getElementById("awning-name"); return e ? getComputedStyle(e).animationName : null; });
      await done(q, "awning name FX " + (off ? "off" : "on"));
    }
    await cs.close();
    check("spice-blend: with Visual FX on the awning's name flap sways a little; with it off it hangs still", sway.on === "sb-sway" && sway.off === "none", sway);
  }
};
