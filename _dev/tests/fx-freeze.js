// Visual FX turned off on the way stops the scenery where it is. Every
// looping animation (CSS or script-made) running when the switch goes off is
// paused where it stands, not cut short or sent back to its start (which
// shows as a jump), and when FX comes back on it carries on from that same
// spot. On every game page: its first screen, and in play.
//
// A few loops are there to be seen rather than to set a scene, and hold a
// still look of their own with FX off instead (a pause there could catch
// them at their faintest): they are listed in KEEP, with the reason.
const KEEP = {
  blink: "TypeTwo's text cursor: shown steady, so it can't freeze unseen",
  powerReady: "Metazac's power-up ready glow: shown steady, so it can't freeze faint",
  chase: "Lights Out's marquee chaser: with FX off every bulb is lit, a look of its own",
  hintPulse: "Hash's hint glow: shown steady, so it can't freeze faint",
  cfWin: "Link Many's win ring: shown steady, so it can't freeze faint",
  fuse: "Link Many's bomb fuse: shown steady, a warning",
};
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const loops = (q) => q.evaluate((keep) => {
    window.__loops = document.getAnimations().filter((a) => a.playState === "running" && a.effect && a.effect.getTiming().iterations === Infinity && !keep.includes(a.animationName));
    return window.__loops.length;
  }, Object.keys(KEEP));
  // each loop: its name and where (the element, and ::before/::after), how
  // it stands now, and its time (a pause keeps it; a cut or restart doesn't)
  const read = (q) => q.evaluate(() => window.__loops.map((a) => {
    const t = a.effect.target;
    return { name: (a.animationName || a.id || "script") + " on " + (t ? (t.id ? "#" + t.id : t.tagName.toLowerCase() + (t.classList[0] ? "." + t.classList[0] : "")) : "?") + (a.effect.pseudoElement || ""),
      state: a.playState, there: document.getAnimations().includes(a), time: Math.round(Number(a.currentTime) || 0) };
  }));
  const flip = (q) => q.evaluate(() => document.querySelector(".rm-toggle").click());
  // (FX_FREEZE=chess,hash runs just those games' pages)
  const only = (process.env.FX_FREEZE || "").split(",").filter(Boolean);
  for (const pg of lib.gamePages().filter((p) => !only.length || only.some((o) => p.startsWith(o)))) {
    const id = pg.split("/")[0];
    for (const inPlay of [false, true]) {
      const q = await lib.open(ctx, base, "games/" + pg, { before: (p) => p.addInitScript((id) => {
        try { localStorage.setItem("reduceMotion:" + id, "0"); } catch (e) {}
        Object.defineProperty(window, "coinFlip", { configurable: true, get: () => (o, cb) => cb("you"), set: () => {} });
      }, id) });
      // (in play: Enter starts nearly every game, a second one gets past a
      // mode's own start card; the loops that run there are what's judged)
      if (inPlay) { await q.keyboard.press("Enter"); await q.waitForTimeout(1200); await q.keyboard.press("Enter"); }
      await q.waitForTimeout(2500);
      const n = await loops(q);
      if (n) {
        const before = await read(q);
        await flip(q); await q.waitForTimeout(300);
        const off = await read(q);
        await q.waitForTimeout(400);
        const offLater = await read(q);
        await flip(q); await q.waitForTimeout(400);
        const on = await read(q);
        const bad = before.map((b, i) => {
          const o = off[i], l = offLater[i], r = on[i];
          if (!o.there || o.state !== "paused") return b.name + ": " + (o.there ? o.state : "cut") + " with FX off";
          if (o.time < b.time) return b.name + ": sent back with FX off (" + b.time + " to " + o.time + " ms)";
          if (l.time !== o.time) return b.name + ": still moving with FX off";
          if (!r.there || r.state !== "running" || r.time < o.time) return b.name + ": with FX on again " + (r.there ? r.state + " at " + r.time + " ms (stopped at " + o.time + ")" : "gone");
          return null;
        }).filter(Boolean);
        check("fx-freeze " + pg + (inPlay ? " (in play)" : "") + ": Visual FX off stops every looping animation where it is (" + n + "), and on again it carries on from there", bad.length === 0, [...new Set(bad)].slice(0, 8));
      }
      check("fx-freeze " + pg + (inPlay ? " (in play)" : "") + ": no page errors", q.errs.length === 0, q.errs.slice(0, 3));
      await q.close();
    }
  }
  await ctx.close();
};
