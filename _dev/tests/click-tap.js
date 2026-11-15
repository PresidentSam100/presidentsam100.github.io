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
};
