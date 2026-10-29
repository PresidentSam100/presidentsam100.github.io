// Dots and Boxes: with the Rules open, Esc closes them and stays put (before
// a move it would leave, after one it would ask to); with them shut it leaves.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/dots-and-boxes/");
  const rules = () => p.evaluate(() => ({ open: document.getElementById("rulesModal").classList.contains("open"), dialog: !!document.querySelector(".gs-dialog") }));
  await p.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); });
  await p.click("#startGame"); await p.waitForTimeout(100);

  await p.click("#rules"); await p.waitForTimeout(80);
  await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  const before = Object.assign(await rules(), { leaves: p.leaves });
  await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  await lib.leftBy(p, 1);   // (counted when its request arrives: later on a busy machine)
  check("dots-and-boxes: Esc closes the Rules without leaving; with them shut, Esc leaves",
    !before.open && before.leaves === 0 && p.leaves === 1, { before, leaves: p.leaves });

  await p.evaluate(() => { document.getElementById("rulesModal").classList.remove("open"); play("h", 0, 0); }); await p.waitForTimeout(50);
  await p.click("#rules"); await p.waitForTimeout(80);
  await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  const mid = await rules();
  check("dots-and-boxes: mid-game, Esc closes the Rules instead of asking to leave", !mid.open && !mid.dialog && p.leaves === 1, { mid, leaves: p.leaves });
  check("dots-and-boxes: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- the CPU takes its time: about three quarters of a second to answer,
  // and nearly half a second between the lines of a run of boxes (it used to
  // be a third of a second for both), with Visual FX off as with it on.
  // Timed in the page: three sides of the corner box are down, so the CPU
  // takes the fourth and then has to go again. Each of its lines is timed as
  // the game lays it (placeLine), so a busy machine's late poll can't shorten
  // the gap between them.
  {
    const times = {}, errs = [];
    for (const off of [false, true]) {
      const q = await lib.open(ctx, base, "games/dots-and-boxes/", { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:dots-and-boxes", off ? "1" : "0"); } catch (e) {} }, off) });
      await q.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); });
      await q.click("#startGame"); await q.waitForTimeout(200);
      times[off ? "off" : "on"] = await q.evaluate(() => new Promise((res) => {
        const theirs = () => hLines.concat(vLines).reduce((n, row) => n + row.filter((v) => v === "ai").length, 0);
        hLines[0][0] = "human"; vLines[0][0] = "human"; vLines[0][1] = "human"; draw();
        const n0 = theirs(), t0 = performance.now(), at = [], lay = placeLine;
        placeLine = function (type, r, c, who) { const made = lay.apply(this, arguments); if (who === AI) at.push(Math.round(performance.now() - t0)); return made; };
        play("h", 2, 2);   // (a line well away from that box)
        (function poll() {
          if (at.length >= 2 || performance.now() - t0 > 8000) { placeLine = lay; res({ reply: at.length ? at[0] : -1, again: at.length > 1 ? at[1] - at[0] : -1, boxes: scores.ai, lines: theirs() - n0 }); }
          else setTimeout(poll, 20);
        })();
      }));
      errs.push(...q.errs);
      await q.close();
    }
    const slow = (t) => t.reply >= 600 && t.boxes >= 1 && t.lines >= 2 && t.again >= 430;
    check("dots-and-boxes: the CPU takes at least 0.6 s to answer and 0.43 s between the lines of a run of boxes, with Visual FX off as with it on", slow(times.on) && slow(times.off), times);
    check("dots-and-boxes (the CPU's pause): no page errors", errs.length === 0, errs);
  }

  // ---- the night over the city behind the picker too: the page opens on the
  // picker over the live sky, the title, tallies and board out of sight; with
  // FX on it moves there (the open sky beside the card, seen twice 1.5 s
  // apart, differs), with it off it's the same sky held still. Red lights on
  // the tallest masts blink with FX on and hold steady with it off. Now and
  // then a shooting star and a plane go over, from the picker on, with FX on
  // only (timers of 5 s or more run 20 times faster here, so the first of
  // each comes within the wait); paused, the plane stops where it is and no
  // shooting star comes; FX switched off takes them away.
  {
    const got = {}, errs = [];
    for (const off of [false, true]) {
      const q = await lib.open(ctx, base, "games/dots-and-boxes/", { before: (pg) => pg.addInitScript((off) => {
        try { localStorage.setItem("reduceMotion:dots-and-boxes", off ? "1" : "0"); } catch (e) {}
        const later = window.setTimeout;
        window.setTimeout = (f, ms, ...a) => later(f, ms >= 5000 ? ms / 20 : ms, ...a);
        window.__went = { meteor: 0, plane: 0 };
        new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
          if (n.classList && n.classList.contains("meteor")) __went.meteor++;
          if (n.classList && n.classList.contains("plane")) __went.plane++;
        }))).observe(document, { childList: true, subtree: true });
      }, off) });
      const r = { off };
      r.menu = await q.evaluate(() => ({ open: document.getElementById("modeModal").classList.contains("open"),
        hidden: ["h1", ".scoreboard", "#board", ".controls"].every((s) => getComputedStyle(document.querySelector(s)).visibility === "hidden") }));
      // (the open sky to the left of the card, top to bottom: a searchlight, stars, windows and masts)
      const clip = await q.evaluate(() => ({ x: 0, y: 0, width: Math.floor(document.querySelector("#modeModal .modal").getBoundingClientRect().left) - 4, height: innerHeight }));
      const a = await q.screenshot({ clip });
      await q.evaluate(() => new Promise((res) => setTimeout(res, 1500)));
      const b = await q.screenshot({ clip });
      await q.evaluate(() => document.querySelectorAll(".sky-back, .sky").forEach((e) => { e.style.visibility = "hidden"; }));
      const bare = await q.screenshot({ clip });
      await q.evaluate(() => document.querySelectorAll(".sky-back, .sky").forEach((e) => { e.style.visibility = ""; }));
      r.moved = !a.equals(b); r.seen = !b.equals(bare);
      r.masts = await q.evaluate(() => {
        const sets = [...document.querySelectorAll(".sky .masts")], ms = [...document.querySelectorAll(".sky .masts .mast")];
        return { n: ms.length, sets: sets.map((e) => e.getAnimations().map((x) => x.animationName + ":" + x.playState).join("+")),
          lit: sets.length > 0 && sets.every((e) => +getComputedStyle(e).opacity >= 0.5),
          onSkyline: ms.length > 0 && ms.every((m) => { const b = m.getBoundingClientRect(); return b.width > 0 && b.top > innerHeight - 170 && b.bottom < innerHeight - 30; }) };
      });
      // (on the picker: a shooting star and a plane come by, with FX on)
      if (off) await q.evaluate(() => new Promise((res) => setTimeout(res, 2500)));
      else await q.waitForFunction(() => __went.meteor > 0 && __went.plane > 0, null, { timeout: 8000 }).catch(() => {});
      r.went = await q.evaluate(() => Object.assign({}, __went, {
        flying: [...document.querySelectorAll(".sky .plane")].map((p) => p.getAnimations().map((x) => x.animationName + ":" + x.playState).join("+")) }));
      // the game: the title, tallies and board out again; paused, the plane holds and no shooting star comes
      await q.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); });
      await q.click("#startGame");
      r.shown = await q.evaluate(() => ["h1", ".scoreboard", "#board", ".controls"].every((s) => getComputedStyle(document.querySelector(s)).visibility === "visible"));
      if (!off) {
        await q.waitForFunction(() => document.querySelector(".sky .plane"), null, { timeout: 8000 }).catch(() => {});
        await q.keyboard.press("p");
        await q.waitForFunction(() => document.documentElement.classList.contains("db-paused"), null, { timeout: 8000 }).catch(() => {});
        r.paused = await q.evaluate(() => new Promise((res) => {
          const n = __went.meteor, p = document.querySelector(".sky .plane"), at = p && p.getBoundingClientRect().left;
          setTimeout(() => res({ plane: !!p, state: p ? p.getAnimations()[0].playState : "", still: p ? p.getBoundingClientRect().left === at : false, meteors: __went.meteor - n }), 2000);
        }));
        await q.keyboard.press("p");
        await q.waitForFunction(() => !document.documentElement.classList.contains("db-paused"), null, { timeout: 8000 }).catch(() => {});
        await q.waitForFunction(() => document.querySelector(".sky .plane"), null, { timeout: 8000 }).catch(() => {});
        await q.keyboard.press("v");
        await q.waitForFunction(() => window.RM_ON && RM_ON(), null, { timeout: 8000 }).catch(() => {});
        r.switched = await q.evaluate(() => document.querySelectorAll(".sky .plane, .sky .meteor").length);
      }
      errs.push(...q.errs);
      got[off ? "off" : "on"] = r;
      await q.close();
    }
    const on = got.on, offS = got.off;
    check("dots-and-boxes: the page opens on the picker over the night sky itself, the title, tallies and board out of sight until the game starts",
      on.menu.open && on.menu.hidden && on.seen && on.shown && offS.menu.open && offS.menu.hidden && offS.seen && offS.shown, { on: [on.menu, on.seen, on.shown], off: [offS.menu, offS.seen, offS.shown] });
    check("dots-and-boxes, FX on: behind the picker the sky moves; FX off: the same sky there, held still", on.moved && !offS.moved, { on: on.moved, off: offS.moved });
    check("dots-and-boxes, FX on: red lights on the tallest masts of the skyline blink, in three sets; FX off: the same lights, lit and still",
      on.masts.n >= 6 && on.masts.onSkyline && on.masts.sets.join() === "dbMast:running,dbMast:running,dbMast:running" &&
      offS.masts.n === on.masts.n && offS.masts.onSkyline && offS.masts.lit && offS.masts.sets.every((s) => s === ""), { on: on.masts, off: offS.masts });
    check("dots-and-boxes, FX on: a shooting star and a plane's lights go over the picker; paused, the plane holds where it is and no shooting star comes; FX switched off takes them away",
      on.went.meteor > 0 && on.went.plane > 0 && on.went.flying.length === 1 && /^dbFly:running/.test(on.went.flying[0]) &&
      on.paused.plane && on.paused.state === "paused" && on.paused.still && on.paused.meteors === 0 && on.switched === 0, { went: on.went, paused: on.paused, switched: on.switched });
    check("dots-and-boxes, FX off: no shooting stars and no planes", offS.went.meteor === 0 && offS.went.plane === 0, offS.went);
    check("dots-and-boxes (the night sky): no page errors", errs.length === 0, errs);
  }
  await ctx.close();
};
