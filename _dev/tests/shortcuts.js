// Every game page: the corner buttons' keys (M / V for sound and Visual FX, and
// [ / ] everywhere), their keycap labels, the buttons not overlapping on a
// desktop or a phone, and no page errors.

// Games where letters are gameplay (or M is already taken): only [ and ] work.
const LETTERS_OFF = new Set(["speedle/", "typetwo/", "lanterns/", "departures/", "fish-a-fish/", "neon-pinball/", "slither/", "flappy-world/"]);

const rectsOf = (p) => p.evaluate(() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  return { back: r(".nav-back-games"), pause: r(".gs-pause-btn"), mute: r(".mute-toggle"), fx: r(".rm-toggle") };
});
const overlap = (a, b) => a && b && a.w && b.w && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const overlaps = (r, pairs) => pairs.filter(([a, b]) => overlap(r[a], r[b])).map((x) => x.join("/"));

module.exports = async ({ browser, base, check, lib }) => {
  const desk = await lib.newContext(browser);
  const phone = await lib.newContext(browser, { viewport: { width: 390, height: 844 } });
  const cap = (k) => '<kbd class="gs-kbd">' + k + "</kbd>";

  for (const pg of lib.gamePages()) {
    const off = LETTERS_OFF.has(pg);
    const p = await lib.open(desk, base, "games/" + pg, { settle: 500 });
    await p.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    const lab = await p.evaluate(() => ({
      m: document.querySelector(".mute-toggle").innerHTML, f: document.querySelector(".rm-toggle").innerHTML,
      p: document.querySelector(".gs-pause-btn") && document.querySelector(".gs-pause-btn").innerHTML,
      mt: document.querySelector(".mute-toggle").title,
    }));
    check(pg + ": corner labels show " + (off ? "[ ]" : "M V") + " keycaps",
      // (Speedle's ⏸ is always off, so it names no key)
      lab.m.endsWith(cap(off ? "[" : "M")) && lab.f.endsWith(cap(off ? "]" : "V")) && (!lab.p || lab.p.includes('<kbd class="gs-kbd">') || pg === "speedle/") &&
      (off ? !/M or/.test(lab.mt) : /M or \[/.test(lab.mt)), lab);

    const st = () => p.evaluate(() => ({ m: MUTE_ON(), f: RM_ON() }));
    const s0 = await st(), seq = [];
    for (const k of ["BracketLeft", "BracketRight", "BracketLeft", "BracketRight"]) { await p.keyboard.press(k); seq.push(await st()); }
    check(pg + ": [ and ] toggle sound and FX once each",
      seq[0].m === !s0.m && seq[0].f === s0.f && seq[1].f === !s0.f && seq[2].m === s0.m && seq[3].f === s0.f, { s0, seq });

    await p.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    const l0 = await st(); await p.keyboard.press("m"); const l1 = await st(); await p.keyboard.press("v"); const l2 = await st();
    if (off) check(pg + ": M and V do nothing (letters are off here)", l1.m === l0.m && l2.f === l0.f, { l0, l1, l2 });
    else {
      check(pg + ": M and V toggle sound and FX once each", l1.m === !l0.m && l2.f === !l0.f, { l0, l1, l2 });
      await p.keyboard.press("m"); await p.keyboard.press("v");
    }

    const o = overlaps(await rectsOf(p), [["pause", "mute"], ["mute", "fx"], ["pause", "fx"], ["back", "pause"], ["back", "mute"]]);
    check(pg + ": corner buttons don't overlap at 1280px", o.length === 0, o);
    check(pg + ": no page errors", p.errs.length === 0, p.errs);
    await p.close();

    const pp = await phone.newPage();
    await pp.goto(base + "games/" + pg, { waitUntil: "domcontentloaded" });
    await pp.waitForSelector(".mute-toggle"); await pp.waitForTimeout(400);
    const pr = await rectsOf(pp);
    const txt = await pp.evaluate(() => [document.querySelector(".mute-toggle").textContent, document.querySelector(".rm-toggle").textContent]);
    const po = overlaps(pr, [["pause", "mute"], ["mute", "fx"], ["pause", "fx"]]);
    check(pg + ": phone shows icon-only labels, no overlap", !/\s[A-Z\[\]]$/.test(txt[0]) && !/\s[A-Z\[\]]$/.test(txt[1]) && po.length === 0, { txt, po });
    await pp.close();
  }

  // the labels follow the window across the 1200px line, and the row re-packs
  const p = await lib.open(desk, base, "games/abyss/");
  const look = () => p.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const a = r(".gs-pause-btn"), m = r(".mute-toggle"), f = r(".rm-toggle");
    return { mt: document.querySelector(".mute-toggle").textContent, ft: document.querySelector(".rm-toggle").textContent, gaps: [Math.round(m.left - a.right), Math.round(f.left - m.right)] };
  });
  const w1 = await look();
  await p.setViewportSize({ width: 1000, height: 800 }); await p.waitForTimeout(300); const w2 = await look();
  await p.setViewportSize({ width: 1280, height: 900 }); await p.waitForTimeout(300); const w3 = await look();
  const tidy = (g) => g.every((x) => x >= 4 && x <= 12);
  check("abyss: resizing across 1200px swaps the key labels and keeps the row tidy",
    / M$/.test(w1.mt) && w2.mt.length <= 2 && / V$/.test(w3.ft) && tidy(w1.gaps) && tidy(w2.gaps) && tidy(w3.gaps), { w1, w2, w3 });
  await p.close();
  await desk.close(); await phone.close();
};
