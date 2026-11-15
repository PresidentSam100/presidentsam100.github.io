// Reaction: switching away mid-standoff calls the duel off instead of letting
// it play out unseen (the next tap starts it over, not as a false start);
// Ctrl / Alt + Space or Enter are left to the browser.
const HOOKS = [
  ["  function standoffMs() {", "  function standoffMs() { return 300;"],   // a short, fixed standoff
  ["  // ------------------------------------------------ boot", "  window.__reaction = { state: function () { return state; }, results: function () { return results.length; } };\n  // ------------------------------------------------ boot"],
];

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const hook = (pg) => lib.injectScript(pg, "games/reaction/game.js", HOOKS);
  const st = (p) => p.evaluate(() => ({ state: __reaction.state(), results: __reaction.results() }));
  // The standoff is 300 ms, shorter than a few round trips on a busy machine:
  // so what must land inside one runs in the page in one go (key() is
  // lib.fireKey's keydown, in the page), and waits are on the page's clock.
  const IN_PAGE = () => {
    window.__key = (init) => { const e = new KeyboardEvent("keydown", Object.assign({ bubbles: true, cancelable: true }, init));
      const t = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body; t.dispatchEvent(e); return e.defaultPrevented; };
    window.__st = () => ({ state: __reaction.state(), results: __reaction.results() });
    window.__after = (ms) => new Promise((r) => setTimeout(r, ms));
  };
  const hookAll = async (pg) => { await hook(pg); await pg.addInitScript(IN_PAGE); };

  let p = await lib.open(ctx, base, "games/reaction/", { before: hookAll });
  // step into the street and switch away at once (mid-standoff), then wait out
  // the standoff and the shooting window on the page's clock
  const away = await p.evaluate(async () => { document.getElementById("btn-start").click(); window.dispatchEvent(new Event("blur")); await __after(1500); return __st(); });
  // the next tap starts it over (read straight away), and that standoff draws
  const back = await p.evaluate(() => { __key({ key: " ", code: "Space" }); return __st(); });
  const drawn = await p.evaluate(async () => { await __after(400); return __st(); });
  check("reaction: a duel isn't decided while the window is away; the next tap starts it over",
    away.state === "wait" && away.results === 0 && back.state === "wait" && back.results === 0 && drawn.state === "go", { away, back, drawn });
  check("reaction: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  p = await lib.open(ctx, base, "games/reaction/", { before: hookAll });
  // into the street, then the two combos inside its standoff
  const { claimed, combo } = await p.evaluate(() => {
    document.getElementById("btn-start").click();
    const claimed = [__key({ key: " ", code: "Space", ctrlKey: true }), __key({ key: "Enter", code: "Enter", altKey: true })];
    return { claimed, combo: __st() };
  });
  check("reaction: Ctrl / Alt + Space or Enter are left to the browser (no false start)", claimed.every((x) => !x) && combo.state === "wait" && combo.results === 0, { claimed, combo });
  await p.close();
  await ctx.close();

  // the hint names Space with a keyboard; on a touch-only device, just the tap
  const { devices } = require("@playwright/test");
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const c = await lib.newContext(browser, opts);
    const q = await lib.open(c, base, "games/reaction/");
    const hint = await q.evaluate(() => document.querySelector(".hint").innerText);
    const ok = label === "desktop" ? /^tap the street or press Space or Enter the moment/.test(hint) : /^tap the street the moment/.test(hint) && !/Space/.test(hint);
    check("reaction " + label + ": the hint " + (label === "desktop" ? "names Space and Enter" : "says tap the street, no keys"), ok, hint);
    await q.close();
    await c.close();
  }

  // ---- the saloon's sign, SAM LU'S SALOON, hung over the street: in the
  // standoff, at the call, on a time and after a false start it reads, at
  // 12px or more, inside the street, clear of the words on it, the two
  // gunslingers, the tickets and the corner buttons; it hangs still from the
  // standoff on (it creaks only between duels, with Visual FX on); it adds no
  // scroll; and the page carries no "made by" line
  const MEASURE = () => {
    window.__sign = (tag) => {
      const panel = document.getElementById("panel"), board = panel.querySelector(".saloon .board");
      if (!board) return { tag, missing: true };
      const b = board.getBoundingClientRect(), pr = panel.getBoundingClientRect();
      const hit = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top; };
      const words = [...panel.querySelectorAll(".big, .sub, .rating, .duelist")].filter((e) => (e.classList.contains("duelist") || e.textContent.trim()) && hit(e)).map((e) => e.className);
      const chrome = [...document.querySelectorAll(".nav-back-games, .gs-corner button, .hud .stat")].filter(hit).map((e) => e.className);
      const cs = getComputedStyle(board), sh = document.documentElement.scrollHeight;
      const sign = panel.querySelector(".saloon"); sign.style.display = "none";
      const shWithout = document.documentElement.scrollHeight; sign.style.display = "";
      return { tag, state: __reaction.state(), text: board.textContent.replace(/’/g, "'"), size: parseFloat(cs.fontSize),
        inside: b.left >= pr.left && b.right <= pr.right && b.top >= pr.top && b.bottom <= pr.bottom && b.right <= innerWidth,
        words, chrome, anim: cs.animationName, addsScroll: sh !== shWithout, madeBy: /made by/i.test(document.body.innerText) };
    };
  };
  const mob = (w, h) => ({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
  for (const [label, opts] of [["1280x900", {}], ["1366x657", { viewport: { width: 1366, height: 657 } }], ["1280x600", { viewport: { width: 1280, height: 600 } }],
    ["Pixel 7", devices["Pixel 7"]], ["phone 320x568", mob(320, 568)], ["phone 375x553", mob(375, 553)], ["phone 360x560", mob(360, 560)], ["Pixel 7 sideways", devices["Pixel 7 landscape"]]]) {
    const c = await lib.newContext(browser, opts);
    const q = await lib.open(c, base, "games/reaction/", { before: async (pg) => { await hookAll(pg); await pg.addInitScript(MEASURE); } });
    // a standoff, the call, a time; then the next standoff, drawn too soon (all on the page's clock)
    const seen = await q.evaluate(async () => {
      const out = [];
      document.getElementById("btn-start").click();
      out.push(__sign("standoff"));
      for (let k = 0; k < 100 && __reaction.state() !== "go"; k++) await __after(20);
      out.push(__sign("the call"));
      __key({ key: " ", code: "Space" }); await __after(500);
      out.push(__sign("a time"));
      __key({ key: " ", code: "Space" }); await __after(30);
      __key({ key: " ", code: "Space" }); await __after(500);
      out.push(__sign("too soon"));
      return out;
    });
    const bad = seen.filter((r) => r.missing || r.text !== "SAM LU'S SALOON" || r.size < 12 || !r.inside || r.words.length || r.chrome.length || r.addsScroll || r.madeBy ||
      ((r.tag === "standoff" || r.tag === "the call") && r.anim !== "none"));
    check("reaction, " + label + ": the saloon's sign reads SAM LU'S SALOON over the street, clear of the duel and every word, still from the standoff on, adding no scroll",
      bad.length === 0 && seen.map((r) => r.state).join() === "wait,go,result,toosoon", bad.length ? bad : seen.map((r) => r.tag + ":" + r.state));
    check("reaction (saloon sign), " + label + ": no page errors", q.errs.length === 0, q.errs);
    await c.close();
  }
  // with Visual FX on the sign creaks between duels; with it off it hangs still
  const creak = {};
  for (const off of [false, true]) {
    const c = await lib.newContext(browser);
    const q = await lib.open(c, base, "games/reaction/", { before: async (pg) => { await hookAll(pg); await pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:reaction", off ? "1" : "0"); } catch (e) {} }, off); } });
    creak[off ? "off" : "on"] = await q.evaluate(async () => {
      document.getElementById("btn-start").click();
      for (let k = 0; k < 100 && __reaction.state() !== "go"; k++) await __after(20);
      __key({ key: " ", code: "Space" }); await __after(400);
      const b = document.querySelector(".saloon .board");
      return { state: __reaction.state(), anim: b ? getComputedStyle(b).animationName : null };
    });
    await c.close();
  }
  check("reaction: between duels the sign creaks with Visual FX on and hangs still with it off",
    creak.on.state === "result" && creak.on.anim === "saloonCreak" && creak.off.state === "result" && creak.off.anim !== "saloonCreak", creak);
};
