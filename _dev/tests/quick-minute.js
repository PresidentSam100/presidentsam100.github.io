// Quick Minute: lane changes while paused don't count; after resuming they do.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/quick-minute/");
  const card = () => p.evaluate(() => { const g = document.querySelector(".gs-pause:not(.gs-dialog)"); return !!g && !g.hidden; });
  const lane = () => p.evaluate(() => __game.player.lane);
  // a car put right in the player's way: the run ends, the crash card comes up
  const crash = async (pg) => {
    await pg.evaluate(() => __game.obstacles.push({ lane: __game.player.lane, y: 566, w: 44, h: 84, type: "car", color: "#bcc0c6", cx: __game.player.x, pending: false, merging: false, mergeDir: 0, mergeTo: -1, mergeStartY: 0, wc: 0 }));
    await pg.waitForFunction(() => !__game.running && !!document.getElementById("btn-menu"), null, { timeout: 5000 });
  };

  await p.evaluate(() => __game.start("day")); await p.waitForTimeout(100);
  await p.keyboard.press("p"); await p.waitForTimeout(60);
  const paused = await card(), l0 = await lane();
  await p.keyboard.press("ArrowLeft"); await p.keyboard.press("a");
  const l1 = await lane();
  await p.keyboard.press("p"); await p.waitForTimeout(60);
  await p.keyboard.press("ArrowLeft");
  const l2 = await lane();
  check("quick-minute: lane changes while paused don't count; after resuming they do", paused && l0 === 2 && l1 === 2 && l2 === 1, { paused, l0, l1, l2 });

  // the crash card: Esc leaves for the games page, Backspace goes back to the
  // mode menu (Change mode)
  await crash(p);
  await p.keyboard.press("Escape"); await p.waitForTimeout(250);
  await lib.leftBy(p, 1);   // (counted when its request arrives: later on a busy machine)
  const escLeft = p.leaves === 1 && (await p.evaluate(() => !!document.getElementById("btn-menu")));
  await p.keyboard.press("Backspace"); await p.waitForTimeout(100);
  const toModes = await p.evaluate(() => !!document.getElementById("m-day") && document.getElementById("overlay").classList.contains("show"));
  check("quick-minute: on the crash card Esc leaves, Backspace goes back to the mode menu", escLeft && toModes && p.leaves === 1, { escLeft, toModes, leaves: p.leaves });

  // Change mode rebuilds the card: the switches wear their keys as the script
  // ends, before a frame can be drawn (they used to come a frame or two late)
  await p.evaluate(() => __game.start("day")); await p.waitForTimeout(100);
  await crash(p);
  const capsBack = await p.evaluate(async () => {
    document.getElementById("btn-menu").click();
    await Promise.resolve();
    return ["#m-day .t", "#m-night .t", "#m-cycle .t"].map((s) => { const e = document.querySelector(s); return e && e.getAttribute("data-gs-key"); });
  });
  check("quick-minute: Change mode brings the menu back with its keycaps on, with no frame in between",
    capsBack.every(Boolean) && capsBack.indexOf("Space or Enter") >= 0, capsBack);
  check("quick-minute: no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await ctx.close();

  const { devices } = require("@playwright/test");

  // the card over the windscreen: all of it inside (its top isn't cut off),
  // nothing to scroll, and what shows on it: how many of the three how-to-play
  // rules, the three switches (day, night, cycle) and their bests, its name,
  // its buttons, and the two lines that say what night and cycle are
  const cardOf = (pg) => pg.evaluate(() => {
    const r = (e) => e.getBoundingClientRect(), stage = document.getElementById("stage"), card = document.getElementById("card"), ov = document.getElementById("overlay");
    if (!ov.classList.contains("show")) return null;
    const shown = (sel) => Array.from(card.querySelectorAll(sel)).filter((e) => r(e).height > 0);
    return {
      top: Math.round(r(card).top - r(stage).top), gap: Math.round(r(stage).bottom - r(card).bottom), scrolls: ov.scrollHeight - ov.clientHeight,
      rules: shown(".rules li").length, switches: shown(".mode-btn").length,
      bests: shown(".mode-btn .b").filter((b) => /best \d/.test(b.textContent)).length,
      name: shown("h2.nm").length === 1, buttons: shown(".btn").length,
      note: shown("p.note").map((e) => e.textContent).join(" "),
    };
  });
  const inside = (c) => !!c && c.top >= 0 && c.gap >= 0 && c.scrolls <= 0;
  const whole = (c) => inside(c) && c.rules === 3 && c.switches === 3 && /headlights alone.*day and night/.test(c.note);

  // the driver's seat: the dashboard sits under the windscreen and both fit
  // on the screen (a phone's too, nothing wider than it); the speedometer's
  // needle rests at 0 and swings round with the MPH; night mode lights the
  // dials, and going back to the menu puts them out
  for (const [label, opts] of [["desktop", {}], ["phone", devices["iPhone 13"]], ["small phone", Object.assign({}, devices["iPhone 13"], { viewport: { width: 320, height: 568 } })]]) {
    const c = await lib.newContext(browser, opts);
    const q = await lib.open(c, base, "games/quick-minute/");
    const read = () => q.evaluate(() => {
      const r = (e) => e.getBoundingClientRect(), dash = document.getElementById("dash"), stage = document.getElementById("stage");
      const needle = dash && dash.querySelector(".needle"), sp = document.getElementById("value-speed");
      const m = needle ? new DOMMatrix(getComputedStyle(needle).transform) : null;
      return {
        under: !!dash && r(dash).top >= r(stage).bottom - 1, fits: !!dash && r(dash).bottom <= innerHeight + 1, over: document.documentElement.scrollWidth - innerWidth,
        mph: +sp.textContent, set: +sp.parentNode.style.getPropertyValue("--mph"), angle: m ? Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI) : null,
        night: document.body.classList.contains("night"),
      };
    });
    const menu = await read(), menuCard = await cardOf(q);
    await q.evaluate(() => __game.start("night"));
    await q.waitForFunction(() => +document.getElementById("value-speed").textContent >= 60, null, { timeout: 8000 });
    await q.evaluate(() => new Promise((r) => setTimeout(r, 500)));   // (the needle eases to its place)
    const drive = await read();
    await q.evaluate(() => __game.showMenu && __game.showMenu());
    const back = await read();
    check("quick-minute " + label + ": the dashboard is under the windscreen and on the screen, nothing wider than it",
      menu.under && menu.fits && menu.over <= 0 && drive.under && drive.fits && drive.over <= 0, { menu, drive });
    check("quick-minute " + label + ": the needle rests at 0 and swings round with the MPH",
      menu.angle === -135 && drive.mph >= 60 && drive.set === drive.mph && drive.angle > -70 && drive.angle < 100, { menu, drive });
    check("quick-minute " + label + ": night mode lights the dials, the menu puts them out", !menu.night && drive.night && !back.night, { menu: menu.night, drive: drive.night, back: back.night });
    check("quick-minute " + label + ": the whole menu card is inside the windscreen (all three rules, the three switches and what night and cycle mean showing, nothing to scroll)",
      whole(menuCard), menuCard);
    check("quick-minute " + label + " (dashboard): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await c.close();
  }

  // short screens: a phone's browser bars leave about 550 px, and a laptop's
  // window is often 600 to 700 px tall (the desktop above is 900). The
  // windscreen is at or near its smallest there, and the menu still shows
  // everything on it, for a player with a best saved in every mode (the
  // tallest card): its name, the three rules, the three switches and their bests
  // (a phone's menu went without its name once, to fit). Nothing is left out
  // or cut off to make it fit. The crash card is whole too.
  const bests = (pg) => pg.addInitScript(() => { try { localStorage.setItem("rushhour_best_day", "12345"); localStorage.setItem("rushhour_best_night", "23456"); localStorage.setItem("rushhour_best_cycle", "34567"); } catch (e) {} });
  for (const [w, h, phone] of [[375, 553, true], [360, 560, true], [320, 568, true], [320, 480, true], [320, 664, true], [1366, 657, false], [1280, 600, false], [1280, 500, false]]) {
    const c = await lib.newContext(browser, Object.assign({}, phone ? devices["iPhone 13"] : {}, { viewport: { width: w, height: h } }));
    const q = await lib.open(c, base, "games/quick-minute/", { before: bests });
    const label = "quick-minute, a " + w + " x " + h + (phone ? " phone" : " window");
    const card = await cardOf(q);
    check(label + ": the menu keeps its name, all three rules, the three switches and their bests, and what night and cycle mean, whole inside the windscreen",
      whole(card) && card.bests === 3 && card.name, card);
    await q.evaluate(() => __game.start("day")); await q.waitForTimeout(120);
    await crash(q);
    const over = await cardOf(q);
    check(label + ": the crash card is whole inside the windscreen, both its buttons showing", inside(over) && over.buttons === 2, over);
    await q.close();
    await c.close();
  }

  // the hint and the menu's rule name the keys with a keyboard; on a
  // touch-only device they say to tap the left or right side instead
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const c = await lib.newContext(browser, opts);
    const q = await lib.open(c, base, "games/quick-minute/");
    const t = await q.evaluate(() => ({ hint: document.querySelector(".hint").innerText.replace(/\s+/g, " "), rule: document.querySelector("#card .rules li").innerText.replace(/\s+/g, " ") }));
    const ok = label === "desktop"
      ? /^←→ or A \/ D to switch lanes · on mobile, tap/.test(t.hint) && /^←→ or A \/ D to change lanes \(tap left\/right on mobile\)/.test(t.rule)
      : t.hint === "tap the left or right side to switch lanes" && t.rule === "Tap left or right to change lanes.";
    check("quick-minute " + label + ": the hint and the menu " + (label === "desktop" ? "name the keys" : "say to tap left or right, no keys"), ok, t);
    await q.close();
    await c.close();
  }

  // The cars' lamps. A lamp is painted on a face of the car and shows only
  // when that face does: from behind (a run's camera) a signalling car shows
  // its tail lamp, and the mark round the corner where its side faces the
  // camera, never the lamp on its hidden nose (that one used to be drawn
  // through the car). And at night every car drives with its headlamps on: a
  // beam on the road ahead of each. Read from what one frame fills: the
  // signal's amber, the beams' pale yellow. (Visual FX off: the signals stay
  // lit and the camera stays behind.)
  {
    const c = await lib.newContext(browser);
    const q = await lib.open(c, base, "games/quick-minute/", { before: (pg) => pg.addInitScript(() => { try { localStorage.setItem("reduceMotion:quick-minute", "1"); } catch (e) {} }) });
    // cars: [how many lanes to the side of you, how far up the road, which way it signals]
    const frame = (mode, cars) => q.evaluate(([mode, cars]) => new Promise((res) => {
      const g = __game;
      g.start(mode);
      g.obstacles.length = 0;
      for (const [by, y, dir] of cars) g.obstacles.push({ lane: g.player.lane + by, y: y, w: 44, h: 84, type: "car", color: "#bcc0c6", cx: g.player.x + by * 72, pending: !!dir, merging: false, mergeDir: dir, mergeTo: -1, mergeStartY: 0, wc: 0 });
      const P = CanvasRenderingContext2D.prototype, fill = P.fill, seen = [];
      requestAnimationFrame(() => {
        P.fill = function () { seen.push(String(this.fillStyle)); return fill.apply(this, arguments); };
        requestAnimationFrame(() => { P.fill = fill; res({ amber: seen.filter((s) => s === "#ffb12e").length, beams: seen.filter((s) => /^rgba\(255, 243, 196/.test(s)).length }); });
      });
    }), [mode, cars]);
    const ahead = await frame("day", [[0, 300, 1]]);        // dead ahead: only its tail faces the camera
    const sideOn = await frame("day", [[-1, 300, 1]]);      // a lane to the left, signalling right: that side faces the camera too
    const sideOff = await frame("day", [[-1, 300, -1]]);    // ... signalling left: that side is hidden
    const quiet = await frame("day", [[0, 300, 0]]);
    check("quick-minute: a signalling car shows its lamp only where it can be seen (the tail from behind, round the corner where its side shows), never on its hidden nose",
      ahead.amber === 1 && sideOn.amber === 3 && sideOff.amber === 1 && quiet.amber === 0, { ahead, sideOn, sideOff, quiet });
    const day = await frame("day", [[-2, 250, 0], [2, 250, 0]]), night = await frame("night", [[-2, 250, 0], [2, 250, 0]]);
    // (your own beam is two fills; each of the two cars adds two more)
    check("quick-minute: at night the other cars drive with their headlamps on, a beam on the road ahead of each; by day there are none",
      day.beams === 0 && night.beams >= 6, { day, night });
    check("quick-minute (lamps): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await c.close();
  }

  // ---- CYCLE: the run starts at any hour, a whole day passes each minute of
  // driving, and the look goes from day to night and back through a dusk and a
  // dawn that are both scenes at once. Its best is its own.
  {
    const c = await lib.newContext(browser);
    const q = await lib.open(c, base, "games/quick-minute/", { before: (pg) => pg.addInitScript(() => { try { localStorage.setItem("rushhour_best_cycle", "5"); } catch (e) {} }) });
    const hours = [];
    for (let i = 0; i < 4; i++) hours.push(await q.evaluate(() => { __game.start("cycle"); return __game.hour; }));
    // the sky's top pixel and whether the dials are lit, at an hour (the road kept clear)
    const at = (h) => q.evaluate((h) => new Promise((res) => {
      __game.setHour(h); __game.obstacles.length = 0;
      let n = 0;
      (function tick() {
        __game.obstacles.length = 0;
        if (++n < 3) return requestAnimationFrame(tick);
        const cv = document.getElementById("cv"), px = cv.getContext("2d").getImageData(Math.floor(cv.width / 2), 3, 1, 1).data;
        res({ dark: Math.round(__game.dark * 100) / 100, sky: [px[0], px[1], px[2]], dials: document.body.classList.contains("night"), running: __game.running });
      })();
    }), h);
    const noon = await at(0.5), midnight = await at(0.0), dusk = await at(0.75), dawn = await at(0.25);
    // the hour moves on as you drive: a sixtieth of a day each second (counted in frames, as the game's clock is)
    const moved = await q.evaluate(() => new Promise((res) => {
      __game.setHour(0.4); const t0 = performance.now(); let n = 0;
      (function tick() { __game.obstacles.length = 0; if (++n < 60) return requestAnimationFrame(tick); res({ hour: __game.hour, secs: (performance.now() - t0) / 1000 }); })();
    }));
    await q.evaluate(() => __game.addScore(600)); await q.waitForTimeout(450);
    const saved = await q.evaluate(() => ({ cycle: localStorage.getItem("rushhour_best_cycle"), day: localStorage.getItem("rushhour_best_day"), night: localStorage.getItem("rushhour_best_night") }));
    const between = (v, a, b) => v > Math.min(a, b) + 8 && v < Math.max(a, b) - 8;
    check("quick-minute, CYCLE: a run starts at any hour (four starts, four hours)", hours.every((h) => h >= 0 && h < 1) && new Set(hours.map((h) => h.toFixed(4))).size === 4, hours);
    check("quick-minute, CYCLE: noon is the day's look and midnight the night's (the dials lit), and dusk and dawn are between the two",
      noon.dark === 0 && !noon.dials && midnight.dark === 1 && midnight.dials && noon.sky[2] > midnight.sky[2] + 100 &&
      [dusk, dawn].every((t) => t.dark > 0.3 && t.dark < 0.7 && between(t.sky[2], noon.sky[2], midnight.sky[2])) && dawn.running, { noon, midnight, dusk, dawn });
    check("quick-minute, CYCLE: the hour moves on as you drive, a whole day to the minute at most", moved.hour > 0.4 && moved.hour <= 0.4 + moved.secs / 60 + 0.002, moved);
    check("quick-minute, CYCLE: its best is saved under its own name, the other two left alone", Number(saved.cycle) >= 600 && saved.day === null && saved.night === null, saved);
    check("quick-minute (cycle): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await c.close();
  }

  // ---- switching Visual FX mid-run: the camera glides to the view the switch
  // gives (off: the chase view; on: the run's own angle), where it used to
  // cut. From each of the side and high angles the eye's largest step in any
  // one frame stays small, and it ends where it should. (Counted in frames:
  // the game caps the time a frame may cover, so a late frame is no bigger.)
  {
    const c = await lib.newContext(browser);
    const q = await lib.open(c, base, "games/quick-minute/");
    await q.evaluate(() => __game.start("day"));
    // the eye followed for `frames` frames, the switch pressed first if asked
    // (the road kept clear and the score at 0 meanwhile: no crash, no milestone)
    const follow = (frames, press) => q.evaluate(([frames, press]) => new Promise((res) => {
      const cam = __game.cam, out = { step: 0 }; let prev = null, n = 0;
      if (press) document.querySelector(".rm-toggle").click();
      (function tick() {
        __game.obstacles.length = 0; __game.addScore(-__game.score);
        const cur = [cam.ex, cam.ey, cam.ez];
        if (prev) out.step = Math.max(out.step, Math.hypot(cur[0] - prev[0], cur[1] - prev[1], cur[2] - prev[2]));
        prev = cur;
        if (++n > frames) { out.step = Math.round(out.step * 100) / 100; out.eye = cur.map((v) => Math.round(v * 10) / 10); out.running = __game.running; res(out); }
        else requestAnimationFrame(tick);
      })();
    }), [frames, press]);
    const EYES = { 1: [4.6, 5.2, -6.8], 2: [0, 9.5, -10.5], 3: [-4.6, 5.2, -6.8] }, CHASE = [0, 4.6, -7.5];
    const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 0.25);
    const seen = {};
    let glides = true;
    for (const i of [1, 2, 3]) {
      await q.evaluate((i) => __game.setPreset(i), i);
      const there = await follow(130, false);          // (the swing to the new angle, 1.6 s)
      const off = await follow(90, true), on = await follow(90, true);
      seen[i] = { there: there.eye, off, on };
      if (!(near(there.eye, EYES[i]) && off.step < 1.2 && near(off.eye, CHASE) && on.step < 1.2 && near(on.eye, EYES[i]) && on.running)) glides = false;
    }
    check("quick-minute: switching Visual FX mid-run glides the camera (to the chase view when off, back to the run's angle when on) from the right, high and left angles, never a cut", glides, seen);
    check("quick-minute (camera): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await c.close();
  }
};
