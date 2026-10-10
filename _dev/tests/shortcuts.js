// Every game page: the corner buttons' keys (M / V for sound and Visual FX, and
// [ / ] everywhere), their keycap labels, the buttons not overlapping on a
// desktop or a phone, the row lined up with the "← Games" link (same top, same
// height) and holding still when a button is pressed, and no page errors.

// Games where letters are gameplay (or M is already taken): only [ and ] work.
const LETTERS_OFF = new Set(["speedle/", "typetwo/", "lanterns/", "departures/", "fish-a-fish/", "neon-pinball/", "slither/", "flappy-world/"]);

const rectsOf = (p) => p.evaluate(() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  return { back: r(".nav-back-games"), pause: r(".gs-pause-btn"), mute: r(".mute-toggle"), fx: r(".rm-toggle") };
});
// The row against the "← Games" link: its top and height as the game's CSS sets
// them (offsetHeight, so Science Fair's tilted link gives its own height).
// Returns the buttons that are off by more than half a pixel.
const rowOf = (p) => p.evaluate(() => {
  const back = document.querySelector(".nav-back-games"), out = { top: parseFloat(getComputedStyle(back).top), h: back.offsetHeight, btns: {} };
  for (const [k, s] of [["pause", ".gs-pause-btn"], ["mute", ".mute-toggle"], ["fx", ".rm-toggle"]]) {
    const e = document.querySelector(s); if (!e) continue;
    const b = e.getBoundingClientRect(); out.btns[k] = { t: b.top, h: b.height, l: b.left, w: b.width };
  }
  return out;
});
const offLine = (r) => Object.keys(r.btns).filter((k) => Math.abs(r.btns[k].t - r.top) > 0.5 || Math.abs(r.btns[k].h - r.h) > 0.5);
// the buttons whose left edge or width differs between two looks at the row
const moved = (a, b) => Object.keys(a.btns).filter((k) => Math.abs(a.btns[k].l - b.btns[k].l) > 0.5 || Math.abs(a.btns[k].w - b.btns[k].w) > 0.5);
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
    const s0 = await st(), seq = [], rows = [await rowOf(p)];
    for (const k of ["BracketLeft", "BracketRight", "BracketLeft", "BracketRight"]) { await p.keyboard.press(k); seq.push(await st()); rows.push(await rowOf(p)); }
    check(pg + ": [ and ] toggle sound and FX once each",
      seq[0].m === !s0.m && seq[0].f === s0.f && seq[1].f === !s0.f && seq[2].m === s0.m && seq[3].f === s0.f, { s0, seq });
    // (rows[1]: sound off; rows[2]: sound and FX off)
    const askew = offLine(rows[0]), mv = moved(rows[0], rows[1]).concat(moved(rows[0], rows[2]));
    check(pg + ": the corner buttons share the ← Games link's top and height", askew.length === 0, { askew, row: rows[0] });
    check(pg + ": turning sound or Visual FX off changes no button's width or place", mv.length === 0, { mv, before: rows[0].btns, after: rows[2].btns });

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
    // (the row mustn't run into the ← Games link either: on a small phone the ✨ button shortens its label to fit)
    const po = overlaps(pr, [["pause", "mute"], ["mute", "fx"], ["pause", "fx"], ["back", "pause"], ["back", "mute"], ["back", "fx"]]);
    check(pg + ": phone shows icon-only labels, no overlap", !/\s[A-Z\[\]]$/.test(txt[0]) && !/\s[A-Z\[\]]$/.test(txt[1]) && po.length === 0, { txt, po });
    const pr0 = await rowOf(pp);
    await pp.evaluate(() => { document.querySelector(".mute-toggle").click(); document.querySelector(".rm-toggle").click(); });
    const pr1 = await rowOf(pp);
    check(pg + ": phone row shares the ← Games link's top and height, and holds still when sound and FX go off",
      offLine(pr0).length === 0 && moved(pr0, pr1).length === 0, { off: offLine(pr0), mv: moved(pr0, pr1), row: pr0 });
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
  // ⏸ Pause turning into ▶ Resume (the longer label) moves nothing either, wide or narrow
  await p.keyboard.press("Enter"); await p.waitForTimeout(400);
  const still = {};
  const pauseSays = (re) => p.waitForFunction((src) => new RegExp(src).test(document.querySelector(".gs-pause-btn").textContent), re.source, { timeout: 8000 }).catch(() => {});
  for (const [name, w] of [["wide", 1280], ["narrow", 1000]]) {
    await p.setViewportSize({ width: w, height: 900 }); await p.waitForTimeout(300);
    await pauseSays(/⏸/);
    const a = await rowOf(p), ta = await p.evaluate(() => document.querySelector(".gs-pause-btn").textContent);
    await p.keyboard.press("p"); await pauseSays(/▶/);
    const b = await rowOf(p), tb = await p.evaluate(() => document.querySelector(".gs-pause-btn").textContent);
    await p.keyboard.press("p"); await pauseSays(/⏸/);
    still[name] = { ta, tb, mv: moved(a, b), off: offLine(b) };
  }
  check("abyss: pausing swaps ⏸ Pause for ▶ Resume without the row moving or changing height",
    still.wide.ta === "⏸ Pause P" && still.wide.tb === "▶ Resume P" && still.narrow.ta === "⏸" && still.narrow.tb === "▶" &&
    still.wide.mv.length === 0 && still.narrow.mv.length === 0 && still.wide.off.length === 0 && still.narrow.off.length === 0, still);
  await p.close();

  // ---- small phones: where the row would run into the ← Games link, the ✨
  // button says less ("FX", then just ✨) and nothing overlaps; with room it
  // says "Visual FX" in full. Flappy World has the widest link.
  const fits = {};
  for (const w of [1280, 390, 360, 320]) {
    const c = await lib.newContext(browser, { viewport: { width: w, height: 800 } });
    const q = await lib.open(c, base, "games/flappy-world/");
    const r = await rectsOf(q);
    fits[w] = { fx: await q.evaluate(() => document.querySelector(".rm-toggle").textContent.replace(/ [A-Z\]]$/, "")), over: overlaps(r, [["back", "pause"], ["back", "mute"], ["back", "fx"], ["pause", "mute"], ["mute", "fx"]]) };
    // (toggling it there still moves nothing)
    const a = await rowOf(q); await q.evaluate(() => document.querySelector(".rm-toggle").click()); const b = await rowOf(q);
    fits[w].mv = moved(a, b);
    await c.close();
  }
  check("flappy-world: the ✨ button says Visual FX in full where it fits, and less on a small phone, never overlapping the ← Games link or moving when pressed",
    fits[1280].fx === "✨ Visual FX: on" && /^✨( FX: on)?$/.test(fits[390].fx) && /^✨( FX: on)?$/.test(fits[320].fx) &&
    [1280, 390, 360, 320].every((w) => fits[w].over.length === 0 && fits[w].mv.length === 0), fits);
  await desk.close(); await phone.close();
};
