// ClickTap: with storage blocked the game still runs (no best shown, clicks
// still count).
const BLOCK_STORAGE = (pg) => pg.addInitScript(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("The operation is insecure.", "SecurityError"); } });
});

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/click-tap/", { before: BLOCK_STORAGE });
  const setup = await p.evaluate(() => document.getElementById("setupBest").textContent);
  await p.click("#startBtn"); await p.waitForTimeout(80);
  await p.evaluate(() => { const pad = document.getElementById("pad"), r = pad.getBoundingClientRect(); pad.dispatchEvent(new PointerEvent("pointerdown", { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true })); });
  const clicks = await p.evaluate(() => document.getElementById("vClicks").textContent);
  check("click-tap: with storage blocked the game still runs (no best shown, clicks count)", p.errs.length === 0 && /No record/.test(setup) && clicks === "1", { errs: p.errs, setup, clicks });
  await p.close();
  await ctx.close();

  // the gardener's plant label stuck in the soil bed, "Sam Lu" along it: in
  // play, its writing out past the timer ring in the corner the ring leaves,
  // inside the bed's square, clear of the stats, hint and buttons; it never
  // takes a click and adds no scroll. Where the bed is too small to letter
  // (under 200 px, a phone on its side) it isn't there.
  {
    const { devices } = require("@playwright/test");
    const touch = (w, h) => ({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
    const sizes = [["1280x900", { viewport: { width: 1280, height: 900 } }], ["1366x657", { viewport: { width: 1366, height: 657 } }],
      ["1280x600", { viewport: { width: 1280, height: 600 } }], ["800x600", { viewport: { width: 800, height: 600 } }], ["Pixel 7", devices["Pixel 7"]],
      ["320x568", touch(320, 568)], ["375x553", touch(375, 553)], ["360x560", touch(360, 560)], ["sideways", touch(915, 412)]];
    for (const [name, opt] of sizes) {
      const c = await lib.newContext(browser, opt);
      const q = await lib.open(c, base, "games/click-tap/");
      await q.evaluate(() => document.getElementById("startBtn").click()); await q.waitForTimeout(150);
      const m = await q.evaluate(() => {
        const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
        const meet = (a, z) => a.l < z.r && z.l < a.r && a.t < z.b && z.t < a.b;
        const lab = document.getElementById("plabel");
        if (!lab) return null;
        const wrap = box(document.querySelector(".pad-wrap")), W = wrap.r - wrap.l, cx = (wrap.l + wrap.r) / 2, cy = (wrap.t + wrap.b) / 2;
        const span = lab.querySelector("span"), sb = box(span), shown = getComputedStyle(lab).display !== "none" && sb.r - sb.l > 15;
        const mid = Math.hypot((sb.l + sb.r) / 2 - cx, (sb.t + sb.b) / 2 - cy) / W;
        const others = ["#hud", ".hud", "#hint", "#quitBtn", "header.top"].map((s) => document.querySelector(s)).filter((e) => e && e.offsetWidth > 0).map(box);
        const corners = [...document.querySelectorAll("body *")].filter((e) => getComputedStyle(e).position === "fixed" && e.offsetWidth > 0).map(box);
        return { W: Math.round(W), text: span.textContent, shown, pe: getComputedStyle(lab).pointerEvents, size: parseFloat(getComputedStyle(span).fontSize), mid: +mid.toFixed(3),
          inWrap: sb.l >= wrap.l - 1 && sb.r <= wrap.r + 1 && sb.t >= wrap.t - 1 && sb.b <= wrap.b + 1, hits: others.concat(corners).filter((o) => meet(sb, o)).length,
          sh: document.documentElement.scrollHeight, vh: innerHeight, sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth };
      });
      const placed = (s) => s.shown && s.text === "Sam Lu" && s.size >= 10 && s.mid >= 0.5 && s.mid <= 0.7 && s.inWrap && s.hits === 0;
      const ok = !!m && m.pe === "none" && m.sh <= m.vh && m.sw <= m.vw && (m.W >= 200 ? placed(m) : !m.shown);
      check("click-tap, " + name + ": a plant label stuck in the soil bed reads Sam Lu in marker, past the timer ring, clear of the stats, hint and buttons, never taking a click, no scroll (none where the bed is under 200 px)", ok, m);
      await c.close();
    }
  }

  // ---- a breezy day: cloud shadows on the lawn and three butterflies about
  // the garden (yellow, white and orange), all under everything and taking
  // no clicks. With Visual FX on the shadows drift and the butterflies
  // wander, each on its own round, wings beating; held while the pause card
  // is up and moving again after its Restart. With FX off all hold still
  // where they are. Read as the shadows' place across the page and each
  // butterfly's place on it.
  {
    const bc = await lib.newContext(browser);
    const look = (q) => q.evaluate(() => {
      const wrap = document.querySelector(".wrap"), a = getComputedStyle(document.body, "::before");
      const bs = [getComputedStyle(document.body, "::after"), getComputedStyle(wrap, "::before"), getComputedStyle(wrap, "::after")];
      return { shade: new DOMMatrix(a.transform === "none" ? undefined : a.transform).m41, fly: bs.map((b) => b.translate), flap: bs.map((b) => b.transform),
        wings: new Set(bs.map((b) => b.getPropertyValue("--wing").trim())).size,
        drawn: [a].concat(bs).every((x) => /radial-gradient/.test(x.backgroundImage) && x.pointerEvents === "none" && x.zIndex === "-1") };
    });
    // flies: every butterfly has moved; stirs: any one has
    const diff = (a, b) => ({ drawn: a.drawn, wings: a.wings, shade: b.shade - a.shade, flies: a.fly.every((f, i) => f !== b.fly[i]), stirs: a.fly.some((f, i) => f !== b.fly[i]), from: a, to: b });
    const over = async (q, ms) => { const a = await look(q); await q.waitForTimeout(ms); return diff(a, await look(q)); };
    // (moving is waited for, up to a few seconds: a busy machine can give a
    // page few frames, and a fixed window then sees too little of it)
    const goes = async (q) => {
      const a = await look(q);
      await q.waitForFunction((a) => {
        const wrap = document.querySelector(".wrap"), s = getComputedStyle(document.body, "::before");
        const fs = [getComputedStyle(document.body, "::after"), getComputedStyle(wrap, "::before"), getComputedStyle(wrap, "::after")];
        return new DOMMatrix(s.transform === "none" ? undefined : s.transform).m41 > a.shade + 3 && fs.every((f, i) => f.translate !== a.fly[i]);
      }, a, { timeout: 6000, polling: 100 }).catch(() => {});
      return diff(a, await look(q));
    };
    const open = (off) => lib.open(bc, base, "games/click-tap/", { before: (pg) => pg.addInitScript((off) => localStorage.setItem("reduceMotion:click-tap", off ? "1" : "0"), off) });
    let q = await open(false);
    const setup = await goes(q);
    await q.click("#startBtn");
    await q.keyboard.press("p");
    await q.waitForFunction(() => document.body.classList.contains("ct-held"), null, { timeout: 5000 }).catch(() => {});
    await q.waitForTimeout(150);   // (a CSS pause lands on the next frame)
    const paused = await over(q, 900);
    // Restart from the card (nothing clicked yet: no question)
    await q.keyboard.press("r");
    await q.waitForFunction(() => !document.body.classList.contains("ct-held"), null, { timeout: 5000 }).catch(() => {});
    const again = await goes(q);
    check("click-tap, Visual FX on: cloud shadows drift across the lawn and three butterflies (yellow, white, orange) wander the garden, under everything; held while paused, moving again after Restart",
      setup.drawn && setup.wings === 3 && setup.shade > 3 && setup.flies && paused.shade === 0 && !paused.stirs && again.shade > 3 && again.flies, { setup, paused, again });
    // FX turned off on the way: both stop where they are (no snap back to
    // where they started), and turned on again they carry on from there
    const before = await look(q);
    await q.evaluate(() => document.querySelector(".rm-toggle").click());
    await q.waitForFunction(() => document.documentElement.classList.contains("fx-off"), null, { timeout: 5000 }).catch(() => {});
    await q.waitForTimeout(150);
    const stopped = await over(q, 700);
    await q.evaluate(() => document.querySelector(".rm-toggle").click());
    await q.waitForFunction(() => document.documentElement.classList.contains("fx-on"), null, { timeout: 5000 }).catch(() => {});
    const on = await goes(q);
    const near = (a, b) => a.every((f, i) => { const [ax, ay] = f.split(" ").map(parseFloat), [bx, by] = b[i].split(" ").map(parseFloat); return Math.hypot(ax - bx, ay - by) < 60; });   // (two seconds' flight at most)
    check("click-tap, Visual FX turned off on the way: the cloud shadows and the butterflies stop where they are, no jump; on again they carry on from there",
      // (never back towards where they started: a busy machine may let them
      // move on a little before the pause lands, never return)
      before.shade > 5 && stopped.shade === 0 && !stopped.stirs && stopped.from.shade >= before.shade - 0.5 && stopped.from.shade < before.shade + 40 && near(stopped.from.fly, before.fly) &&
      on.from.shade >= stopped.to.shade - 0.5 && on.from.shade < stopped.to.shade + 40 && on.shade > 3 && on.flies, { before, stopped, on });
    await q.close();
    q = await open(true);
    const off = await over(q, 900);
    check("click-tap, Visual FX off: the cloud shadows lie still and the three butterflies rest, wings open",
      off.drawn && off.wings === 3 && off.to.shade === 0 && off.shade === 0 && !off.stirs && off.to.flap.every((f) => /^matrix\(1, 0, 0, 1, 0, 0\)$|^none$/.test(f)), off);
    await q.close();
    await bc.close();
  }
};
