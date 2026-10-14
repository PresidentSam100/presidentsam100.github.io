// Science Fair: a first run that ends at round 0 isn't "a new best"; the
// buttons' keycaps (the mode keys, Blast off, Again) show with a keyboard
// and hide on a touch-only phone; each sits in the middle of its button and
// shows against it. The sun is the biggest thing on the board; the gas giants
// are far bigger than the rocky planets and hang by two strings; and the board
// shows the mode's own planets: all nine, or in Classic the four rocky ones,
// closed in on and spread across it, the others slid away, the sun still in.
module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  // a Classic run that misses the very first note: round 0
  const missFirst = async (p) => {
    await p.evaluate(() => { ScienceFair.fast(); ScienceFair.start("classic"); });
    await p.waitForFunction(() => ScienceFair.state() === "input", null, { timeout: 8000 });
    await p.evaluate(() => { const s = ScienceFair.seq(); ScienceFair.press((s[0] + 1) % 4); });
    await p.waitForFunction(() => ScienceFair.state() === "over", null, { timeout: 8000 });
  };

  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const ctx = await lib.newContext(browser, opts);
    const p = await lib.open(ctx, base, "games/science-fair/");
    const shown = () => p.evaluate(() => [...document.querySelectorAll(".panel button kbd")].filter((k) => k.getClientRects().length).map((k) => k.closest("button").id || k.closest("button").dataset.v));
    const menu = await shown();
    // a button's keycap: how far its middle is from the button's (in the
    // sheet's own layout numbers: the sheet is tilted), and whether it is a
    // patch of another colour than the button
    const capOf = (id) => p.evaluate((id) => {
      const b = document.getElementById(id), k = b.querySelector("kbd");
      return { off: (k.offsetTop + k.offsetHeight / 2) - (b.offsetTop + b.offsetHeight / 2), seen: getComputedStyle(k).backgroundColor !== getComputedStyle(b).backgroundColor };
    }, id);
    const playCap = label === "desktop" ? await capOf("play") : null;
    // the how-to line names the number keys only where there are keys, and so
    // do the keycaps on the planets' tags
    const how = await p.evaluate(() => ({ text: document.querySelector("#menu .how").innerText, tags: [...document.querySelectorAll(".hang .tag kbd")].filter((k) => k.getClientRects().length).length }));
    if (label === "phone") check("science-fair: on a touch-only phone the how-to says tap, and the planets' tags show no keycaps",
      /by tapping them\./.test(how.text) && !/number keys|1 to 9/.test(how.text) && how.tags === 0, how);
    else check("science-fair: with a keyboard the how-to names the number keys, and the planets' tags show them",
      /pressing their number keys \(1 to 9\)/.test(how.text) && how.tags === 9, how);
    await missFirst(p);
    const over = await shown();
    if (label === "desktop") {
      const r = await p.evaluate(() => ({ msg: document.getElementById("over-msg").textContent, stats: document.getElementById("over-stats").textContent }));
      check("science-fair: a first run that ends at round 0 isn't a new best", r.msg === "Round 0" && !/new best/.test(r.stats), r);
      check("science-fair: with a keyboard the buttons' keycaps show", menu.length === 4 && over.length === 2, { menu, over });
      // (on one line of text with its label a keycap rode 2 to 3px low; and
      // Again's, ink on an ink button, could not be seen)
      const caps = { play: playCap, again: await capOf("again"), modes: await capOf("to-menu") };
      check("science-fair: the keycaps on Blast off, Again and Modes sit in the middle of their buttons, and each shows against its button",
        Object.keys(caps).every((k) => Math.abs(caps[k].off) <= 1 && caps[k].seen), caps);
    } else check("science-fair: on a touch-only phone the buttons' keycaps are hidden", menu.length === 0 && over.length === 0, { menu, over });
    check("science-fair (" + label + "): no page errors", p.errs.length === 0, p.errs);
    await ctx.close();
  }

  // Enter on a focused mode button picks that mode and stays on the menu (it
  // used to start a run in the old mode as well); a mode picked with the
  // mouse doesn't keep the focus, so the next Enter is Blast off
  {
    const ctx = await lib.newContext(browser);
    const p = await lib.open(ctx, base, "games/science-fair/");
    const look = () => p.evaluate(() => ({ state: ScienceFair.state(), on: (document.querySelector("#pick-mode button.on") || {}).dataset.v, focus: document.activeElement.tagName }));
    await p.focus('#pick-mode button[data-v="grand"]'); await p.keyboard.press("Enter"); await p.waitForTimeout(150);
    const a = await look();
    await p.evaluate(() => document.activeElement.blur());
    await p.click('#pick-mode button[data-v="classic"]'); const b = await look();
    await p.evaluate(() => ScienceFair.fast()); await p.keyboard.press("Enter"); await p.waitForTimeout(200);
    const c = await look();
    check("science-fair: Enter on a focused mode button only picks it; after a mouse pick (which keeps no focus) Enter blasts off",
      a.state === "menu" && a.on === "grand" && b.on === "classic" && b.focus !== "BUTTON" && c.state !== "menu", { a, b, c });
    check("science-fair (menu keys): no page errors", p.errs.length === 0, p.errs);
    await ctx.close();
  }

  // ---- the diorama: the sun, the planets' sizes and strings, and the view each mode gives
  {
    const ctx = await lib.newContext(browser);
    const p = await lib.open(ctx, base, "games/science-fair/");
    // where everything hangs once it has stopped gliding (two looks alike, a few frames apart)
    const board = () => p.evaluate(() => new Promise((res) => {
      const read = () => {
        const W = innerWidth, H = innerHeight, r = (e) => e.getBoundingClientRect();
        const sun = r(document.getElementById("sun"));
        return { W, H, sun: { w: Math.round(sun.width), cx: Math.round(sun.left + sun.width / 2), cy: Math.round(sun.top + sun.height / 2) },
          planets: [...document.querySelectorAll("#planets .hang")].map((h) => {
            const b = r(h.querySelector("button.pad")), s = r(h.querySelector(".string")), k = h.querySelector(".knot");
            return { w: Math.round(b.width), left: Math.round(b.left), right: Math.round(b.right), bottom: Math.round(b.bottom), two: h.classList.contains("two"),
              span: Math.round(s.width), knots: getComputedStyle(k, "::before").content !== "none" && getComputedStyle(k, "::after").content !== "none" ? 2 : 1,
              dim: h.classList.contains("dim") };
          }) };
      };
      let last = "", same = 0, n = 0;
      (function tick() {
        const now = JSON.stringify(read());
        same = now === last ? same + 1 : 0; last = now;
        if (same >= 6 || ++n > 400) res(JSON.parse(now)); else requestAnimationFrame(tick);
      })();
    }));
    // (Visual FX off for the measuring: nothing sways, and a change of view is there at once)
    await p.evaluate(() => { if (!window.RM_ON()) document.querySelector(".rm-toggle").click(); });
    await p.keyboard.press("2");                                  // Grand Tour: all nine
    const grand = await board();
    await p.keyboard.press("1");                                  // Classic: the four rocky planets
    const classic = await board();
    const inside = (q, b) => q.left >= 0 && q.right <= b.W && q.bottom <= b.H;
    const [me, ve, ea, ma, ju, sa, ur, ne, pl] = grand.planets;
    check("science-fair: the sun is the biggest thing on the board (nearly half its height across), its face inside the frame",
      grand.sun.w >= grand.H * 0.45 && grand.sun.w > ju.w * 1.8 && grand.sun.cx > 0 && grand.sun.cy < grand.H, { sun: grand.sun, H: grand.H, jupiter: ju.w });
    check("science-fair: the planets keep their real order of size: Jupiter about twice Earth across, then Uranus, Neptune, Earth, Venus, Mars, Mercury, Pluto",
      ju.w > ea.w * 1.9 && ju.w > ur.w && ur.w >= ne.w && ne.w > ea.w && ea.w >= ve.w && ve.w > ma.w && ma.w > me.w && me.w > pl.w, grand.planets.map((q) => q.w));
    check("science-fair: the two gas giants hang by two strings, about a radius apart; the rest by one",
      grand.planets.every((q, i) => (i === 4 || i === 5) === q.two && q.knots === (q.two ? 2 : 1)) && Math.abs(ju.span - ju.w * 76 / 168) < ju.w * 0.12 && me.span <= 3,
      grand.planets.map((q) => [q.two, q.knots, q.span]));
    check("science-fair, Grand Tour: all nine planets hang inside the frame", grand.planets.every((q) => inside(q, grand) && !q.dim), grand.planets.map((q) => [q.left, q.right]));
    check("science-fair, Classic: the board closes in on the four rocky planets (each over half as big again, spread over more than half the board), the other five slid away past its edge, the sun still in the frame and bigger",
      classic.planets.slice(0, 4).every((q, i) => inside(q, classic) && q.w > grand.planets[i].w * 1.5) &&
      classic.planets[3].right - classic.planets[0].left > classic.W * 0.55 &&
      classic.planets.slice(4).every((q) => q.left >= classic.W && q.dim) &&
      classic.sun.w > grand.sun.w && classic.sun.cx > 0 && classic.sun.cy < classic.H,
      { classic: classic.planets.map((q) => [q.left, q.right, q.w]), sun: classic.sun });
    check("science-fair (diorama): no page errors", p.errs.length === 0, p.errs);
    await p.close();
    await ctx.close();
  }
};
