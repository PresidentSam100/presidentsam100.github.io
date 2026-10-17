// Visual FX, continued (fx.js has the first rounds). FX off keeps every bit
// of a game's art and only calms its motion: nothing vanishes, nothing loops.
// FX on adds motion on top (Corner Pocket, Chess, Tic-Tac-Toe, Yi, Minesweeper,
// Speedle, Abyss, Crazy Ohio, Jam Jar, Flappy World, Spacer, Typetwo,
// Stopwatch, Steamfitter, Hash, Klondike, Lights Out, Lanterns, Link Many,
// Dots and Boxes, Tall Order, Demolition Row, Meteor Menace, Neon Pinball,
// Science Fair, 24, Click Tap).
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const done = async (p, what) => { check(what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  // A check of motion with FX on looks at what a move starts. On a busy machine
  // the move's own renders can take longer than a short slide, so the game
  // (rightly) skips it, or it's over before a fixed wait ends. So: hold the
  // page's clock still for the move itself (in the page: __still(fn)), record
  // things as they start, and poll for the end rather than wait a set time.
  const still = (pg) => pg.addInitScript(() => {
    window.__still = (fn) => { const real = performance.now, t = real.call(performance); performance.now = () => t; try { return fn(); } finally { performance.now = real; } };
  });
  // ... or step the page's frames, and its clock, by hand: an init script that
  // leaves __frames(n) in the page, each frame a 60th of a second on
  const STEPPED = () => {
    let t = 1000, q = [];
    performance.now = () => t;
    window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
    window.__frames = (n) => { for (let i = 0; i < n; i++) { t += 1000 / 60; const run = q; q = []; run.forEach((cb) => cb(t)); } };
  };
  // open a game with its Visual FX switch set (off = true means FX off)
  const open = (path, off, before) => lib.open(ctx, base, "games/" + path, { before: async (pg) => {
    await pg.addInitScript(([k, off]) => localStorage.setItem("reduceMotion:" + k, off ? "1" : "0"), [path.split("/")[0], off]);
    if (before) await before(pg);
  } });

  // ---- Abyss: with FX off the sea keeps its snow, jellyfish and fish (held
  // still) and the blocks keep their glow: the same drawing calls either way
  {
    const p = await open("abyss/", true);
    const r = await p.evaluate(() => {
      const draw = (fxOn, t, dt, sea) => {
        const cv = document.createElement("canvas"); cv.width = 300; cv.height = 600;
        const g = cv.getContext("2d"), n = { arc: 0, ellipse: 0, glow: 0 };
        const wrap = (k, c) => { const o = g[k]; g[k] = function () { n[c]++; return o.apply(this, arguments); }; };
        wrap("arc", "arc"); wrap("ellipse", "ellipse"); wrap("createRadialGradient", "glow");
        sea.draw(g, t, dt, fxOn, 0);
        AbyssArt.cell(g, 20, 20, 24, "T", {});
        return { n, img: cv.toDataURL() };
      };
      const on = draw(true, 1000, 0, AbyssArt.makeSea(300, 600));
      const sea = AbyssArt.makeSea(300, 600);
      const off1 = draw(false, 1000, 0.5, sea), off2 = draw(false, 9000, 0.5, sea);
      return { on: on.n, off: off1.n, still: off1.img === off2.img };
    });
    check("abyss, FX off: the snow, jellyfish, fish and block glow are all still drawn (same calls as FX on), held still",
      JSON.stringify(r.on) === JSON.stringify(r.off) && r.off.arc >= 70 && r.still, r);
    await done(p, "abyss");
  }

  // ---- Fish-a-Fish: the shimmer lines on the near water are there with FX
  // off too, lying still
  {
    const p = await open("fish-a-fish/", true);
    const r = await p.evaluate(() => {
      const draw = (fx, t) => {
        const cv = document.createElement("canvas"); cv.width = 400; cv.height = 600;
        const g = cv.getContext("2d"); let strokes = 0;
        const o = g.stroke; g.stroke = function () { strokes++; return o.apply(this, arguments); };
        FishArt.scene(g, 400, 600, t, fx);
        return { strokes, img: cv.toDataURL() };
      };
      const on = draw(true, 1000), a = draw(false, 1000), b = draw(false, 8000);
      return { on: on.strokes, off: a.strokes, still: a.img === b.img };
    });
    check("fish-a-fish, FX off: the water's shimmer lines are drawn (as many as FX on), and lie still", r.off === r.on && r.off >= 5 && r.still, r);
    await done(p, "fish-a-fish");
  }
  // ... and a strike on empty water throws spray only with FX on; its "-2" shows either way
  {
    const got = {};
    for (const off of [false, true]) {
      const p = await open("fish-a-fish/", off, (pg) => lib.injectScript(pg, "games/fish-a-fish/game.js", [["    start: start, toMenu: toMenu, press: press,",
        "    start: start, toMenu: toMenu, press: press,\n    get drops() { return drops.length; }, get popups() { return popups.map(function (q) { return q.text; }); },"]]));
      got[off ? "off" : "on"] = await p.evaluate(() => { FishAFish.start("daybreak"); FishAFish.hold(); FishAFish.press(0); return { drops: FishAFish.drops, popups: FishAFish.popups }; });
      await done(p, "fish-a-fish splash FX " + (off ? "off" : "on"));
    }
    check("fish-a-fish: a strike on empty water sprays with FX on and not with FX off; the -2 shows in both",
      got.on.drops > 0 && got.off.drops === 0 && got.on.popups.includes("-2") && got.off.popups.includes("-2"), got);
  }

  // ---- Ping: the phosphor glow round the paddles, ball and score stays
  // with FX off (only the afterglow trail is FX)
  {
    const blur = {};
    for (const off of [false, true]) {
      const p = await open("ping/", off);
      blur[off ? "off" : "on"] = await p.evaluate(() => {
        let most = 0;
        const o = ctx.fillRect;
        ctx.fillRect = function () { most = Math.max(most, ctx.shadowBlur); return o.apply(this, arguments); };
        draw();
        ctx.fillRect = o;
        return most;
      });
      await done(p, "ping FX " + (off ? "off" : "on"));
    }
    check("ping: the phosphor glow is drawn with FX off as well as on", blur.off === 16 && blur.on === 16, blur);
  }

  // ---- Steamfitter: running water keeps its glow with FX off
  {
    const p = await open("steamfitter/", true, (pg) => lib.injectScript(pg, "games/steamfitter/game.js", [["window.PipeMania = {", `window.PipeMania = {
    __load: function (i) { loadLevelData(LV[i], i); },
    __solveAndFlow: function (i) { grid = gridFromString(LV[i].g); flowing = true; startWater(); },`]]));
    await p.evaluate(() => {
      window.__waterBlur = [];
      const o = CanvasRenderingContext2D.prototype.stroke;
      CanvasRenderingContext2D.prototype.stroke = function () { if (this.strokeStyle === "#2ea9a0") window.__waterBlur.push(this.shadowBlur); return o.apply(this, arguments); };
      PipeMania.__load(0); PipeMania.__solveAndFlow(0);
    });
    await p.waitForFunction(() => window.__waterBlur.length > 3, null, { timeout: 8000 }).catch(() => {});
    const b = await p.evaluate(() => [...new Set(window.__waterBlur)]);
    check("steamfitter, FX off: the running water keeps its glow", b.length > 0 && b.every((v) => v === 8), b);
    await done(p, "steamfitter");
  }

  // ---- Klondike: the sky follows the switch the moment it flips; with FX
  // off it's one still picture that keeps its snow
  {
    const p = await open("klondike/", true);
    const sky = () => p.evaluate(() => {
      const c = document.getElementById("sky"), g = c.getContext("2d");
      // (the bottom fifth: the stars stop three quarters of the way down, so only snow is bright there)
      const h = c.height, band = g.getImageData(0, Math.round(h * 0.8), c.width, Math.round(h * 0.2)).data;
      let snow = 0;
      for (let i = 0; i < band.length; i += 4) if (band[i] > 120 && band[i + 1] > 120 && band[i + 2] > 120) snow++;
      return { img: c.toDataURL(), snow };
    });
    // still: the same picture after 20 frames; moving: a different one within 8 s (polled)
    const frames = (n) => p.evaluate((n) => new Promise((r) => { let k = 0; (function f() { if (++k >= n) r(); else requestAnimationFrame(f); })(); }), n);
    const a = await sky(); await frames(20); const b = await sky();
    await p.click(".rm-toggle"); await frames(3);
    const c = await sky();
    const moved = await p.waitForFunction((was) => document.getElementById("sky").toDataURL() !== was, c.img, { timeout: 8000 }).then(() => true, () => false);
    const d = moved ? { img: "moved" } : c;
    await p.click(".rm-toggle"); await frames(3);
    const e = await sky(); await frames(20); const f = await sky();
    check("klondike: with FX off the sky holds still and keeps its snow; flipping FX on starts it moving, flipping it off stills it again",
      a.img === b.img && a.snow > 0 && c.img !== d.img && e.img === f.img && e.snow > 0, { offStill: a.img === b.img, snow: a.snow, onMoves: c.img !== d.img, backStill: e.img === f.img });
    await done(p, "klondike");
  }

  // ---- Lights Out: the chaser round the sign keeps every bulb lit with FX
  // off, held still (FX on: a gap runs round it); a bulb warms and cools with
  // FX on and switches at once with it off; and the last bulb out darkens the
  // name and the chaser either way
  {
    const got = {};
    for (const off of [false, true]) {
      const p = await open("lights-out/", off);
      await p.evaluate(() => LightsOut.start("zen"));
      await p.waitForFunction(() => document.querySelectorAll("#board .chase .ph circle").length > 0, null, { timeout: 8000 }).catch(() => {});
      const r = await p.evaluate(() => {
        const ph = [...document.querySelectorAll("#board .chase .ph")];
        return {
          groups: ph.length, bulbs: document.querySelectorAll("#board .chase .ph circle").length,
          lit: ph.every((g) => getComputedStyle(g).display !== "none" && getComputedStyle(g).opacity === "1"),
          running: ph.filter((g) => g.getAnimations().length > 0).length,
          warm: parseFloat(getComputedStyle(document.querySelector("#board .bulb .lit")).transitionDuration),
        };
      });
      // put the sign out: the front goes dark with it (polled: FX on fades it)
      await p.evaluate(() => LightsOut.solution().forEach((i) => LightsOut.press(i)));
      r.dark = await p.waitForFunction(() => {
        const h = getComputedStyle(document.querySelector(".sign h1")), l = document.querySelector("#board .chase .lights");
        return h.textShadow === "none" && !!l && getComputedStyle(l).opacity === "0" && !document.querySelector("#board .bulb.on");
      }, null, { timeout: 8000 }).then(() => true, () => false);
      got[off ? "off" : "on"] = r;
      await done(p, "lights-out FX " + (off ? "off" : "on"));
    }
    check("lights-out, FX off: the chaser keeps every bulb lit, still, and a bulb switches at once",
      got.off.groups === 3 && got.off.bulbs > 0 && got.off.lit && got.off.running === 0 && got.off.warm < 0.01, got.off);
    check("lights-out, FX on: a gap runs round the chaser, and a bulb takes a moment to warm",
      got.on.groups === 3 && got.on.running === 3 && got.on.warm > 0.1, got.on);
    check("lights-out: the last bulb out darkens the name and the chaser, FX on or off", got.on.dark && got.off.dark, { on: got.on.dark, off: got.off.dark });
  }

  // ---- Lanterns: the mist over the valleys (the birds ride it) drifts with FX
  // on and lies still with it off; dusk closes in with each lantern lost,
  // either way
  {
    const hook = (pg) => lib.injectScript(pg, "games/lanterns/game.js", [["start: startRun,", "start: startRun, scene: function () { return { mist: mistT, dusk: dusk }; },"]]);
    const got = {};
    for (const off of [false, true]) {
      const p = await open("lanterns/", off, hook);
      await p.evaluate(() => { Lanterns.start("festival"); Lanterns.noSpawn(); Lanterns.setRise(0); });
      // (frames, not milliseconds: a busy machine draws them late)
      const frames = (n) => p.evaluate((n) => new Promise((res) => { const f = () => (--n > 0 ? requestAnimationFrame(f) : res()); requestAnimationFrame(f); }), n);
      await frames(2);
      const a = await p.evaluate(() => Lanterns.scene());
      await frames(12);
      const b = await p.evaluate(() => Lanterns.scene());
      // two lanterns slip away off the top
      await p.evaluate(() => { Lanterns.spawnWord("我", 0.4, -400); Lanterns.spawnWord("你", 0.6, -400); });
      const dusk = await p.waitForFunction(() => Lanterns.escapedCount() === 2 && Lanterns.scene().dusk > 0.13, null, { timeout: 8000 }).then(() => true, () => false);
      got[off ? "off" : "on"] = { drift: b.mist - a.mist, dusk0: a.dusk, dusk };
      await done(p, "lanterns FX " + (off ? "off" : "on"));
    }
    check("lanterns, FX on: the mist drifts", got.on.drift > 0, got.on);
    check("lanterns, FX off: the mist lies still", got.off.drift === 0, got.off);
    check("lanterns: dusk closes in as lanterns are lost, FX on or off", got.on.dusk0 === 0 && got.off.dusk0 === 0 && got.on.dusk && got.off.dusk, got);
  }

  // ---- Hash: with FX off a hovered card doesn't lift, but keeps its deeper shadow
  {
    const p = await open("hash/", true);
    const card = await p.$(".card:not(.selected)");
    const rest = await card.evaluate((c) => getComputedStyle(c).boxShadow);
    await card.hover(); await p.waitForTimeout(250);
    const hov = await card.evaluate((c) => ({ shadow: getComputedStyle(c).boxShadow, transform: getComputedStyle(c).transform }));
    check("hash, FX off: a hovered card keeps its deeper shadow and doesn't lift", hov.shadow !== rest && (hov.transform === "none" || hov.transform === "matrix(1, 0, 0, 1, 0, 0)"), { rest, hov });
    await done(p, "hash");
  }

  // ---- Typetwo: with FX off a keystroke sends no sparks off the staff and
  // the typed text doesn't jump (with FX on, both)
  {
    const got = {};
    for (const off of [false, true]) {
      const p = await open("typetwo/", off, (pg) => lib.injectScript(pg, "games/typetwo/game.js", [["window.__game = {", "window.__game = {\n    get sparks() { return particles.filter((q) => q.kind === \"spark\").length; },"]]));
      await p.keyboard.press("Enter");
      await p.waitForFunction(() => __game.words && __game.words.length > 0, null, { timeout: 8000 });
      got[off ? "off" : "on"] = await p.evaluate(() => {
        const ch = __game.words[0].text[0];
        window.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
        return { sparks: __game.sparks, jump: document.getElementById("typed").style.transform };
      });
      await done(p, "typetwo FX " + (off ? "off" : "on"));
    }
    check("typetwo: a keystroke sparks off the staff and jumps the typed text with FX on, and neither with FX off",
      got.on.sparks > 0 && /1\.08/.test(got.on.jump) && got.off.sparks === 0 && !/1\.08/.test(got.off.jump), got);
  }

  // ---- Sunset Slice: with FX off the menu holds still (the choices don't
  // bob, the koban doesn't sweep its shine, the bomb's fuse doesn't spark)
  {
    const p = await open("sunset-slice/", true);
    const shot = () => p.evaluate(() => document.querySelector("canvas").toDataURL());
    await p.waitForTimeout(300);
    const a = await shot(); await p.waitForTimeout(900); const b = await shot();
    check("sunset-slice, FX off: the menu's choices hold still", a === b, null);
    await done(p, "sunset-slice");
  }

  // ---- Pop the Lock: with FX off a pop or a miss throws no burst; a miss is
  // marked by a still red ring instead
  {
    const got = {};
    for (const off of [false, true]) {
      const p = await open("pop-the-lock/", off, (pg) => lib.injectScript(pg, "games/pop-the-lock/game.js", [["  function updateHud() {",
        "  window.__ptl = { get particles() { return particles.length; }, get missAt() { return typeof missAt === \"undefined\" ? null : missAt; }, fail: fail, start: start };\n  function updateHud() {"]]));
      got[off ? "off" : "on"] = await p.evaluate(() => { __ptl.start(); __ptl.fail(false); return { particles: __ptl.particles, missAt: __ptl.missAt }; });
      await done(p, "pop-the-lock FX " + (off ? "off" : "on"));
    }
    check("pop-the-lock: a miss bursts with FX on; with FX off there's no burst and the miss is marked where it happened",
      got.on.particles > 0 && got.off.particles === 0 && got.off.missAt !== null, got);
  }

  // ---- Corner Pocket, FX on: the cue drives through the ball, a hard break
  // throws sparks and the balls leave short trails; FX off: none of that
  {
    const got = {};
    for (const off of [false, true]) {
      const p = await open("corner-pocket/", off);
      await p.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); });
      await p.click("#startBtn");
      await p.waitForFunction(() => window.__pool && __pool.G.phase === "aim", null, { timeout: 8000 });
      got[off ? "off" : "on"] = await p.evaluate(() => new Promise((res) => {
        __pool.shoot(0, 1);
        const s = { strike: __pool.fx.strike, sparks: 0, trails: 0 };
        let frames = 0;
        (function tick() {   // 40 frames of the break (frames, not a time: a busy machine draws few)
          const f = __pool.fx;
          s.sparks = Math.max(s.sparks, f.sparks); s.trails = Math.max(s.trails, f.trails);
          if (++frames < 40) requestAnimationFrame(tick); else res(s);
        })();
      }));
      await done(p, "corner-pocket FX " + (off ? "off" : "on"));
    }
    check("corner-pocket, FX on: the cue strikes through, the break sparks and the balls trail",
      got.on.strike && got.on.sparks > 0 && got.on.trails > 0, got.on);
    check("corner-pocket, FX off: the same break with no strike, sparks or trails",
      !got.off.strike && got.off.sparks === 0 && got.off.trails === 0, got.off);
  }

  // ---- Chess, FX on: a move slides its piece across from the square it
  // left, a capture flies off to its tray, a king in check pulses; FX off:
  // the board simply changes (the check square still glows, holding still)
  {
    const HOOK2 = ["start(2);  // build a board behind the menu",
      "start(2);  // build a board behind the menu\n  window.__chess = { get G() { return G; }, doMove: doMove, legalFor: legalFor, start: start };"];
    const got = {};
    for (const off of [false, true]) {
      const p = await open("chess/", off, async (pg) => { await still(pg); await lib.injectScript(pg, "games/chess/game.js", [HOOK2]); });
      got[off ? "off" : "on"] = await p.evaluate(() => {
        document.getElementById("menu").classList.remove("show");
        const C = __chess; C.start(2);
        const go = (from, to) => __still(() => C.doMove(C.legalFor(C.G, from).find((m) => m.to === to)));
        const slides = () => document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.matches(".sq .pc"))
          .map((a) => a.effect.getKeyframes()[0].transform);
        go(52, 36);   // e4
        const slide = slides();
        go(11, 27); go(36, 27);   // d5, exd5
        const fly = document.querySelectorAll(".pc.fly").length;
        go(8, 16); go(61, 25);    // a6, Bb5+
        const ck = document.querySelector(".sq.check"), after = ck && getComputedStyle(ck, "::after");
        const pulse = after && after.animationName, glow = after && after.opacity;
        // Ra1xa8, then New Game at once: the fresh board's a8 rook mustn't slide in from a1
        C.start(2); C.G.board[48] = C.G.board[8] = null; go(56, 0); C.start(2);
        const afterNew = slides().length + document.querySelectorAll(".pc.fly").length;
        return { slide, fly, check: !!ck, pulse, glow, afterNew };
      });
      got[off ? "off" : "on"].flyLeft = await p.waitForFunction(() => !document.querySelector(".pc.fly"), null, { timeout: 6000 }).then(() => 0, () => -1);
      await done(p, "chess FX " + (off ? "off" : "on"));
    }
    const on = got.on, off = got.off;
    check("chess, FX on: e4 slides the pawn up from e2, exd5 flies the captured pawn off (and it's gone after), Bb5+ pulses the king",
      on.slide.length === 1 && /^translate\(0px, ?\d/.test(on.slide[0]) && on.fly === 1 && on.flyLeft === 0 && on.check && on.pulse === "checkPulse", on);
    check("chess, FX on: New Game straight after a capture starts still (nothing slides in, nothing left flying)", on.afterNew === 0, on);
    check("chess, FX off: no slide, no flying capture, and the king's check glow is there but holds still",
      off.slide.length === 0 && off.fly === 0 && off.check && off.pulse === "none" && parseFloat(off.glow) > 0.5, off);

    // the 3-player board (its script is inline, so the page is served with the hook)
    const HOOK3 = ["start(3); // build board behind menu (default frozen-pieces rule)",
      "start(3); // build board behind menu (default frozen-pieces rule)\n  window.__three = { get G() { return G; }, cid: cid, legalFor: legalFor, doMove: doMove, start: start };"];
    let html = require("fs").readFileSync(require("path").join(lib.ROOT, "games/chess/three.html"), "utf8");
    if (!html.includes(HOOK3[0])) throw new Error("fx-more: three.html anchor not found");
    html = html.replace(HOOK3[0], HOOK3[1]);
    const got3 = {};
    for (const off of [false, true]) {
      const p = await open("chess/three.html", off, async (pg) => { await still(pg); await pg.route(/\/games\/chess\/three\.html$/, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html })); });
      got3[off ? "off" : "on"] = await p.evaluate(() => {
        const T = __three; T.start(1); document.getElementById("menu").classList.remove("show");
        const anims = () => document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.matches("text.glyph"))
          .map((a) => Object.keys(a.effect.getKeyframes()[1]).includes("opacity") ? "fall" : "slide");
        const pc = (o, t) => ({ o, t, dead: false });
        // Red's rook takes a white knight up its file, then (a fresh board) a white queen checks Red's king
        const b = new Array(96).fill(null);
        b[T.cid(0, 3, 4)] = pc("r", "k"); b[T.cid(1, 3, 4)] = pc("w", "k"); b[T.cid(2, 3, 4)] = pc("k", "k");
        b[T.cid(0, 3, 0)] = pc("r", "r"); b[T.cid(0, 0, 0)] = pc("w", "n");
        T.G.board = b; T.G.turn = "r";
        __still(() => T.doMove(T.legalFor(T.cid(0, 3, 0)).find((m) => m.to === T.cid(0, 0, 0))));
        const cap = anims();
        const b2 = new Array(96).fill(null);
        b2[T.cid(0, 3, 4)] = pc("r", "k"); b2[T.cid(1, 3, 4)] = pc("w", "k"); b2[T.cid(2, 3, 4)] = pc("k", "k"); b2[T.cid(0, 1, 4)] = pc("w", "q");
        T.G.board = b2; T.G.turn = "r";
        document.querySelector('polygon[data-c="40"]').dispatchEvent(new MouseEvent("click"));   // (an empty cell: just redraws)
        const ck = document.querySelector(".ckpulse");
        const red = !!document.querySelector('polygon[fill="#e05d5d"]'), pulse = ck && getComputedStyle(ck).animationName;
        // a rook takes a white pawn on its home rank, then New Game at once: the fresh pawn there mustn't slide in
        T.start(1); T.G.board[T.cid(1, 1, 0)] = pc("r", "r"); T.G.turn = "r";
        __still(() => { T.doMove(T.legalFor(T.cid(1, 1, 0)).find((m) => m.to === T.cid(1, 2, 0))); T.start(1); });
        return { cap, red, pulse, afterNew: anims().length };
      });
      await done(p, "chess three FX " + (off ? "off" : "on"));
    }
    check("chess three, FX on: the rook slides up to its capture while the knight it takes shrinks away; a checked king pulses",
      got3.on.cap.includes("slide") && got3.on.cap.includes("fall") && got3.on.red && got3.on.pulse === "ckPulse", got3.on);
    check("chess three, FX on: New Game straight after a capture starts still", got3.on.afterNew === 0, got3.on);
    check("chess three, FX off: no slide or fall, and the checked king's cell is red, holding still",
      got3.off.cap.length === 0 && got3.off.red && got3.off.pulse === "none", got3.off);
  }

  // ---- Tic-Tac-Toe, FX on: chalk dust puffs off a mark as it's drawn (and
  // keeps falling while the computer replies) and off the strike through a
  // win; FX off: the marks simply appear
  {
    const got = {};
    for (const off of [false, true]) {
      const p = await open("tic-tac-toe/", off);
      await p.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); });
      await p.click("#startGame"); await p.waitForTimeout(150);
      got[off ? "off" : "on"] = await p.evaluate(() => new Promise((res) => {
        const T = __TTT_TEST__, cell = (i) => document.querySelectorAll("#board .cell")[i];
        T.humanMove(4);
        const r = { mark: cell(4).querySelectorAll(".dust").length, moving: cell(4).getAnimations({ subtree: true }).length };
        const m = cell(4).querySelector(".mark"), t0 = performance.now();
        (function wait() { if (T.turn !== "X" && performance.now() - t0 < 4000) return setTimeout(wait, 50); r.after = Math.round(performance.now() - t0);
          r.replied = T.board.filter(Boolean).length === 2;
          r.kept = cell(4).querySelector(".mark") === m && cell(4).querySelectorAll(".dust").length === r.mark;
          // a win along the top row
          for (let i = 0; i < 9; i++) T.board[i] = ""; T.board[0] = T.board[1] = "X"; T.humanMove(2);
          setTimeout(() => res(Object.assign(r, { strike: document.querySelectorAll("#board .dust.da").length, won: document.getElementById("board").dataset.win })), 700);
        })();
      }));
      await done(p, "tic-tac-toe FX " + (off ? "off" : "on"));
    }
    check("tic-tac-toe, FX on: chalk dust puffs off a mark as it's drawn and keeps falling through the computer's reply; the strike through a win puffs too",
      got.on.mark >= 10 && got.on.moving > got.on.mark && got.on.replied && got.on.kept && got.on.strike > 0 && got.on.won === "0", got.on);
    check("tic-tac-toe, FX off: the marks and the strike, with no dust", got.off.mark === 0 && got.off.replied && got.off.strike === 0 && got.off.won === "0", got.off);
  }

  // ---- Yi, FX on: a new hand is dealt round the table a card at a time from
  // the deck (yours fan in) and the first turn waits for it; FX off: the
  // hands are simply there
  {
    const got = {};
    for (const off of [false, true]) {
      const p = await open("yi/", off);
      // each card's starting twist / offset is recorded the moment it's set (a
      // busy machine can be past them by the next frame), timed from the click
      await p.evaluate(() => {
        window.__deal = { fanned: new Set(), minis: new Set(), t0: 0 };
        document.getElementById("startBtn").addEventListener("click", () => { __deal.t0 = Date.now(); }, true);
        new MutationObserver((ms) => ms.forEach((m) => {
          const el = m.target;
          if (el.matches("#hand .card") && /rotate/.test(el.style.transform)) __deal.fanned.add(el.dataset.flipkey);
          if (el.matches("#opponents .mini-back") && /translate/.test(el.style.transform)) __deal.minis.add(el.dataset.flipkey);
        })).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["style"] });
      });
      await p.click("#startBtn");
      // the deal is over once its wait has passed and no card is still moved (polled)
      const settled = await p.waitForFunction(() => __deal.t0 && Date.now() > drawAnimUntil &&
        ![...document.querySelectorAll("#hand .card, #opponents .mini-back")].some((c) => c.style.transform), null, { timeout: 10000 }).then(() => true, () => false);
      got[off ? "off" : "on"] = await p.evaluate((settled) => ({ hand: document.querySelectorAll("#hand .card").length, fanned: __deal.fanned.size,
        minis: __deal.minis.size, waits: Math.round(drawAnimUntil - __deal.t0), settled }), settled);
      await done(p, "yi FX " + (off ? "off" : "on"));
    }
    check("yi, FX on: the hand is dealt round the table from the deck, yours fanning in, and it all settles before the first turn",
      got.on.hand === 7 && got.on.fanned >= 1 && got.on.minis >= 1 && got.on.waits > 300 && got.on.settled, got.on);
    check("yi, FX off: the hands are simply there", got.off.hand === 7 && got.off.fanned === 0 && got.off.minis === 0 && got.off.waits <= 0 && got.off.settled, got.off);
  }

  // ---- Minesweeper, FX on: a win sends a wave across the board from the cell
  // that finished it; FX off: the board simply stands cleared
  {
    const HOOK = ["  let minesPlaced = false;", "  window.__ms = { dig: (i) => dig(i), get mine() { return mine; }, get N() { return N; } };\n  let minesPlaced = false;"];
    const got = {};
    for (const off of [false, true]) {
      const p = await open("minesweeper/", off, (pg) => lib.injectScript(pg, "games/minesweeper/game.js", [HOOK]));
      got[off ? "off" : "on"] = await p.evaluate(() => {
        const M = __ms; M.dig(Math.floor(M.N / 2));
        for (let j = 0; j < M.N; j++) if (!M.mine[j]) M.dig(j);
        const wave = document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.matches(".field .c") && a.effect.getKeyframes().some((k) => /brightness/.test(k.filter || "")));
        return { won: document.querySelector(".field").classList.contains("won"), cells: M.N, wave: wave.length, spread: wave.length ? Math.max(...wave.map((a) => a.effect.getTiming().delay)) - Math.min(...wave.map((a) => a.effect.getTiming().delay)) : 0 };
      });
      await done(p, "minesweeper FX " + (off ? "off" : "on"));
    }
    check("minesweeper, FX on: a win sends a wave across every cell, spreading out from where it finished", got.on.won && got.on.wave === got.on.cells && got.on.spread > 100, got.on);
    check("minesweeper, FX off: the board stands cleared, no wave", got.off.won && got.off.wave === 0, got.off);
  }

  // ---- Speedle, FX on: a guess's tiles flip one after another (their colours
  // all land at once, and the last flip ends inside the 450ms before a solved
  // word's next word); FX off: no stagger
  {
    const HOOK = ["  // ----- boot ---", "  window.__speedle = { setAnswer: function (w) { answer = w; }, key: handleKey };\n  // ----- boot ---"];
    const got = {};
    for (const off of [false, true]) {
      const p = await open("speedle/", off, (pg) => lib.injectScript(pg, "games/speedle/game.js", [HOOK]));
      await p.click("#m-sprint"); await p.waitForTimeout(300);
      got[off ? "off" : "on"] = await p.evaluate(() => {
        __speedle.setAnswer("brave");
        "brain".split("").concat("enter").forEach((k) => __speedle.key(k));
        const row = [...document.querySelectorAll(".row")][0].querySelectorAll(".tile");
        return { colours: [...row].map((t) => (t.className.match(/green|yellow|gray/) || ["-"])[0]).join(" "),
          lags: [...row].map((t) => { const a = t.getAnimations().find((x) => x.animationName === "flip"); return a ? a.effect.getTiming().delay : null; }) };
      });
      await done(p, "speedle FX " + (off ? "off" : "on"));
    }
    const ends = got.on.lags.every((d) => d !== null) ? Math.max(...got.on.lags) + 300 : null;
    check("speedle, FX on: the tiles flip one after another, every colour there at once, all done inside 450ms",
      got.on.colours === "green green green gray gray" && JSON.stringify(got.on.lags) === "[0,35,70,105,140]" && ends <= 450, got.on);
    check("speedle, FX off: the same colours, no stagger", got.off.colours === "green green green gray gray" && got.off.lags.every((d) => !d), got.off);
  }

  // ---- Abyss, FX on: a hard drop leaves a fading trail of the piece down the
  // rows it fell through; FX off: the still streak instead
  {
    const got = {};
    for (const off of [false, true]) {
      const p = await open("abyss/", off);
      got[off ? "off" : "on"] = await p.evaluate(() => new Promise((res) => {
        Abyss.start("descent"); Abyss.test.setGrav(100000);
        requestAnimationFrame(() => {
          Abyss.test.setPiece("T"); Abyss.hard();
          let most = 0, streak = false, frames = 0;
          (function f() {
            const m = Abyss.test.marks(); most = Math.max(most, m.trailDrawn); streak = streak || m.dropDrawn;
            if (++frames < 30) requestAnimationFrame(f); else res({ most, streak, after: Abyss.test.marks().trailDrawn });
          })();
        });
      }));
      await done(p, "abyss trail FX " + (off ? "off" : "on"));
    }
    check("abyss, FX on: a hard drop leaves a fading trail down the rows it fell, gone soon after", got.on.most >= 20 && got.on.after === 0 && !got.on.streak, got.on);
    check("abyss, FX off: no trail, the still streak instead", got.off.most === 0 && got.off.streak, got.off);
  }

  // ---- Crazy Ohio, FX on: a hit bursts where the tile was, a ring and
  // sparks in the lane's colour; FX off: the tile simply goes
  {
    const HOOK = ["  window.__OSU_TEST__ = {", "  window.__co = { hit: (t) => registerHit(t), get tiles() { return tiles; } };\n  window.__OSU_TEST__ = {"];
    const got = {};
    for (const off of [false, true]) {
      const p = await open("crazy-ohio/", off, (pg) => lib.injectScript(pg, "games/crazy-ohio/game.js", [HOOK]));
      await p.click("#startBtn");
      await p.waitForFunction(() => __co.tiles.length > 0, null, { timeout: 8000 });
      got[off ? "off" : "on"] = await p.evaluate(() => {
        const t = __co.tiles[0], lane = document.querySelector('.lane[data-col="' + t.col + '"]');
        __co.hit(t);
        const b = lane.querySelector(".burst");
        return { burst: !!b, sparks: b ? b.querySelectorAll(".spark").length : 0, moving: b ? b.getAnimations({ subtree: true }).length : 0,
          colour: b ? getComputedStyle(b).color === getComputedStyle(lane.querySelector(".key")).color : null };
      });
      await done(p, "crazy-ohio FX " + (off ? "off" : "on"));
    }
    check("crazy-ohio, FX on: a hit bursts in its lane's colour, a ring and sparks", got.on.burst && got.on.sparks === 6 && got.on.moving === 7 && got.on.colour, got.on);
    check("crazy-ohio, FX off: the tile simply goes, no burst", !got.off.burst, got.off);
  }

  // ---- Jam Jar, FX on: a dropped fruit squashes as it lands and springs
  // back; FX off: it simply lands
  {
    const got = {};
    for (const off of [false, true]) {
      const p = await open("jam-jar/", off);
      got[off ? "off" : "on"] = await p.evaluate(() => new Promise((res) => {
        const G = __game, t0 = performance.now();
        let f = null, most = 0, landedAt = null, frames = 0;
        (function w() {
          // (dropped once the jar takes it: a page that's still settling can refuse the first try)
          if (!f) { G.setQueue(3, 0); G.setAim(240); G.drop(); f = G.fruits[G.fruits.length - 1] || null; }
          frames++;
          if (f) { most = Math.max(most, Math.abs(G.squash(f))); if (landedAt === null && f.contacted) landedAt = frames; }
          // until 25 frames after it lands (the squash settles in 0.32 s of the jar's own clock, which a slow frame caps)
          if ((landedAt === null || frames - landedAt < 25) && performance.now() - t0 < 15000) requestAnimationFrame(w);
          else res({ landed: landedAt !== null, most: +most.toFixed(3), after: f ? G.squash(f) : null,
            refused: f ? undefined : { state: G.state, pauseCard: !!document.querySelector(".gs-pause:not([hidden])"), focus: document.hasFocus(), hidden: document.hidden } });
        })();
      }));
      await done(p, "jam-jar FX " + (off ? "off" : "on"));
    }
    check("jam-jar, FX on: a dropped fruit squashes as it lands and springs back", got.on.landed && got.on.most > 0.05 && got.on.after === 0, got.on);
    check("jam-jar, FX off: it simply lands", got.off.landed && got.off.most === 0, got.off);
  }

  // ---- Flappy World, FX on: the medal pops onto the game-over card and a
  // glint sweeps across it now and then; FX off: it simply sits there
  {
    const got = {};
    for (const off of [false, true]) {
      const p = await open("flappy-world/", off);
      got[off ? "off" : "on"] = await p.evaluate(() => {
        game.score = 30; game.die();
        const cv = document.querySelector("canvas"), k = cv.width / 480, g = cv.getContext("2d");
        const at = (t) => { game.medalT = t; game.draw(0); const f = game.medalFx(); return { s: +f.s.toFixed(2), glint: f.glint >= 0, px: Array.from(g.getImageData(Math.round(196 * k), Math.round(330 * k), Math.round(88 * k), Math.round(20 * k)).data).join() }; };
        const a = at(0.05), b = at(0.3), c = at(0.95), d = at(2.2);
        return { pop: [a.s, b.s, c.s], glintAt: c.glint, between: d.glint, glintShows: c.px !== d.px };
      });
      await done(p, "flappy-world FX " + (off ? "off" : "on"));
    }
    check("flappy-world, FX on: the medal pops onto the card, then a glint sweeps across its face",
      got.on.pop[0] === 0 && got.on.pop[1] > 0 && got.on.pop[1] !== 1 && got.on.pop[2] === 1 && got.on.glintAt && !got.on.between && got.on.glintShows, got.on);
    check("flappy-world, FX off: the medal simply sits there", got.off.pop.every((s) => s === 1) && !got.off.glintAt && !got.off.glintShows, got.off);
  }

  // ---- Spacer, FX on: an explosion sends a shockwave ring racing out (a big
  // one for a boss or your ship); FX off: the burst plays alone
  {
    const got = {};
    for (const off of [false, true]) {
      const p = await open("spacer/", off);
      got[off ? "off" : "on"] = await p.evaluate(() => {
        const g = document.createElement("canvas").getContext("2d"), rings = [];
        const o = g.stroke; g.stroke = function () { rings.push(+this.lineWidth.toFixed(2)); return o.apply(this, arguments); };
        const boom = (big, t) => { const e = new Explosion(100, 100, big); e.t = t; e.draw(g); };
        boom(true, 0.15); boom(false, 0.1); const early = rings.length;
        boom(true, 0.7); boom(false, 0.4);
        return { early, late: rings.length - early, widths: rings };
      });
      await done(p, "spacer FX " + (off ? "off" : "on"));
    }
    check("spacer, FX on: an explosion's shockwave ring races out (a thicker one for a big blast), and it's gone once spent",
      got.on.early === 2 && got.on.widths[0] > got.on.widths[1] && got.on.late === 0, got.on);
    check("spacer, FX off: the burst plays alone, no ring", got.off.early === 0 && got.off.late === 0, got.off);
  }

  // ---- Typetwo, FX on: a spell bolt flies with a long glowing trail and
  // sheds motes; FX off: the bolt with its short tail
  {
    const got = {};
    for (const off of [false, true]) {
      const p = await open("typetwo/", off, (pg) => lib.injectScript(pg, "games/typetwo/game.js", [["window.__game = {", "window.__game = {\n    get motes() { return particles.filter((q) => q.kind === \"mote\").length; }, get bolts() { return bullets.length; },"]]));
      await p.keyboard.press("Enter");
      await p.waitForFunction(() => __game.words && __game.words.length > 0, null, { timeout: 8000 });
      got[off ? "off" : "on"] = await p.evaluate(() => new Promise((res) => {
        let glow = 0, motes = 0, bolts = 0;
        const o = CanvasRenderingContext2D.prototype.stroke;
        CanvasRenderingContext2D.prototype.stroke = function () { if (this.shadowBlur === 10 && /177, ?140, ?255/.test(this.shadowColor)) glow++; return o.apply(this, arguments); };
        window.dispatchEvent(new KeyboardEvent("keydown", { key: __game.words[0].text[0], bubbles: true }));
        let frames = 0;
        (function f() {   // until the bolt has flown (frames, not a time: a busy machine draws few)
          motes = Math.max(motes, __game.motes); bolts = Math.max(bolts, __game.bolts);
          if (++frames < 60 && !(bolts && !__game.bolts)) requestAnimationFrame(f); else { CanvasRenderingContext2D.prototype.stroke = o; res({ bolts, glow, motes }); }
        })();
      }));
      await done(p, "typetwo bolts FX " + (off ? "off" : "on"));
    }
    check("typetwo, FX on: a spell bolt flies with a glowing trail and sheds motes", got.on.bolts > 0 && got.on.glow > 0 && got.on.motes > 0, got.on);
    check("typetwo, FX off: the bolt flies with its short tail, no trail or motes", got.off.bolts > 0 && got.off.glow === 0 && got.off.motes === 0, got.off);
  }

  // ---- Stopwatch, FX on: a perfect stop sends a gold ring out from the watch
  // and a scatter of glints (a merely good stop doesn't); FX off: the verdict alone
  {
    const HOOK = ["  function onStart() {", "  window.__sw = { stopOff: function (err) { onStart(); startStamp = performance.now() - (target + err) * 1000; onStop(); } };\n  function onStart() {"];
    const got = {};
    for (const off of [false, true]) {
      const p = await open("stopwatch/", off, (pg) => lib.injectScript(pg, "games/stopwatch/game.js", [HOOK]));
      await p.click("#btn-start"); await p.waitForTimeout(100);
      const look = () => p.evaluate(() => { const r = document.querySelector(".watch .pring"); return { ring: !!r, glints: document.querySelectorAll(".watch .pglint").length, moving: r ? r.getAnimations().length : 0, verdict: document.getElementById("result").textContent }; });
      await p.evaluate(() => __sw.stopOff(0.1));
      const good = await look();
      await p.waitForFunction(() => document.querySelector(".stage").dataset.phase === "ready", null, { timeout: 5000 });
      await p.evaluate(() => __sw.stopOff(0));
      got[off ? "off" : "on"] = { good, perfect: await look() };
      await done(p, "stopwatch FX " + (off ? "off" : "on"));
    }
    check("stopwatch, FX on: a perfect stop rings gold out from the watch with glints; a good one doesn't",
      !got.on.good.ring && got.on.perfect.ring && got.on.perfect.glints === 8 && got.on.perfect.moving === 1 && /perfection/.test(got.on.perfect.verdict), got.on);
    check("stopwatch, FX off: the perfect stop's verdict alone", !got.off.perfect.ring && got.off.perfect.glints === 0 && /perfection/.test(got.off.perfect.verdict), got.off);
  }

  // ---- Steamfitter, FX on: a turned pipe eases its quarter-turn into place
  // (overshooting a touch) while the board's logic has already turned it;
  // FX off: it jumps
  {
    const HOOK = ["window.PipeMania = {", `window.PipeMania = {
    __load: function (i) { loadLevelData(LV[i], i); },
    __turn: function (r, c) { rotateAt(r, c); }, __left: function (r, c) { return turnLeft(grid[r][c]); },`];
    const got = {};
    for (const off of [false, true]) {
      const p = await open("steamfitter/", off, (pg) => lib.injectScript(pg, "games/steamfitter/game.js", [HOOK]));
      got[off ? "off" : "on"] = await p.evaluate(() => new Promise((res) => {
        PipeMania.__load(0);
        let at = null;
        for (let r = 0; r < 12 && !at; r++) for (let c = 0; c < 12 && !at; c++) { const x = PipeMania.cellAt(r, c); if (x && x.kind === "pipe" && x.type.length === 1 && /[HV]/.test(x.type)) at = { r, c, type: x.type }; }
        PipeMania.__turn(at.r, at.c);
        const turned = PipeMania.cellAt(at.r, at.c).type, seen = [];
        // the turn read every 10 ms of the page's clock, stepped by hand (its
        // overshoot lasts a few tens of ms: real frames on a busy machine can skip it)
        const real = performance.now, t = real.call(performance);
        try { for (let ms = 0; ms <= 220; ms += 10) { performance.now = () => t + ms; seen.push(+PipeMania.__left(at.r, at.c).toFixed(3)); } }
        finally { performance.now = real; }
        res({ from: at.type, turned, first: seen[0], least: Math.min(...seen), last: seen[seen.length - 1] });
      }));
      await done(p, "steamfitter turn FX " + (off ? "off" : "on"));
    }
    check("steamfitter, FX on: a turned pipe eases its quarter-turn into place, overshooting a touch, while the board has turned it at once",
      got.on.turned !== got.on.from && got.on.first > 0.5 && got.on.least < 0 && got.on.last === 0, got.on);
    check("steamfitter, FX off: the pipe jumps", got.off.turned !== got.off.from && got.off.first === 0 && got.off.least === 0, got.off);
  }

  // ---- Hash, FX on: the deal comes face down from the pile, a card after
  // another, each turning face up where it lands, all down within about a
  // second; FX off: the cards are simply there
  {
    const got = {};
    for (const off of [false, true]) {
      const p = await open("hash/", off);
      got[off ? "off" : "on"] = await p.evaluate(() => {
        document.getElementById("newBtn").click();
        const backs = [...document.querySelectorAll(".flyer.back")], anims = backs.map((f) => f.getAnimations()[0]).filter(Boolean);
        const lags = anims.map((a) => a.effect.getTiming().delay);
        return { cards: document.querySelectorAll("#board .card").length, waiting: document.querySelectorAll("#board .card.arriving").length, backs: backs.length,
          lags: lags.slice(0, 4), ends: lags.length ? Math.max(...lags) + anims[0].effect.getTiming().duration : 0 };
      });
      // (and all of them landed, by the page's own clock)
      got[off ? "off" : "on"].after = await p.evaluate(() => new Promise((r) => setTimeout(() => r({ backs: document.querySelectorAll(".flyer").length, waiting: document.querySelectorAll("#board .card.arriving").length }), 1600)));
      await done(p, "hash deal FX " + (off ? "off" : "on"));
    }
    check("hash, FX on: the deal comes face down from the pile, one card after another, each turned face up where it lands, all down inside ~0.8s",
      got.on.cards >= 12 && got.on.backs === got.on.cards && got.on.waiting === got.on.cards && JSON.stringify(got.on.lags) === "[0,30,60,90]" && got.on.ends <= 800 &&
      got.on.after.backs === 0 && got.on.after.waiting === 0, got.on);
    check("hash, FX off: the cards are simply there", got.off.cards >= 12 && got.off.backs === 0 && got.off.waiting === 0, got.off);
  }

  // ---- Klondike, FX on: a card that travels arcs there, lifted mid-flight
  // and above the rest; FX off: it jumps (rimmed gold where it lands)
  {
    const got = {};
    for (const off of [false, true]) {
      const p = await open("klondike/", off);
      await p.evaluate(() => Klondike.almostWin()); await p.waitForTimeout(250);
      got[off ? "off" : "on"] = await p.evaluate(() => {
        const moved = Klondike.move("t0", "f0", 1), el = document.querySelector('.card[data-key="0-13"]');
        const a = el.getAnimations().find((x) => x.effect.getKeyframes().length === 9);
        const ys = a ? a.effect.getKeyframes().map((k) => +/,\s*([-\d.]+)px\)/.exec(k.transform)[1]) : [];
        return { moved, arc: !!a, above: el.classList.contains("arc") && getComputedStyle(el).zIndex === "800",
          lifted: ys.length ? Math.min(...ys) < Math.min(ys[0], ys[8]) - 5 : false, rim: el.classList.contains("landed") };
      });
      await done(p, "klondike arc FX " + (off ? "off" : "on"));
    }
    check("klondike, FX on: a card moved to a foundation arcs there, lifted mid-flight and above the rest",
      got.on.moved && got.on.arc && got.on.above && got.on.lifted && !got.on.rim, got.on);
    check("klondike, FX off: it jumps, rimmed gold where it lands", got.off.moved && !got.off.arc && !got.off.above && got.off.rim, got.off);
  }

  // ---- Link Many, FX on: a dropped disc squashes at each touchdown, and a win
  // draws a glowing line through the four, each popping as it's reached;
  // FX off: the disc is simply there and the four wear their white ring
  {
    const got = {};
    for (const off of [false, true]) {
      const p = await open("link-many/", off);
      await p.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); });
      await p.click("#startGame");
      await p.waitForFunction(() => !__game.busy, null, { timeout: 8000 });
      const drop = await p.evaluate(() => {
        const b = __game.board; [0, 1, 2].forEach((c) => { b[5][c] = 1; });
        __game.humanMove(3);
        const el = document.querySelector('.cell[data-r="5"][data-c="3"]'), a = el.getAnimations().find((x) => x.animationName === "drop");
        return { dropping: !!a, squash: !!a && a.effect.getKeyframes().some((k) => /scale\(1\.15/.test(k.transform)), ringed: document.querySelectorAll(".cell.win").length };
      });
      // the line comes once the disc has landed (polled, not timed: a busy machine is slower)
      const line = await p.waitForFunction(() => document.querySelector(".win-line"), null, { timeout: off ? 1500 : 6000 }).then(() => true, () => false);
      const pops = await p.evaluate(() => [...document.querySelectorAll(".cell.win")].filter((c) => c.getAnimations().some((a) => a.effect.getKeyframes().some((k) => /scale\(1\.18/.test(k.transform || "")))).length);
      got[off ? "off" : "on"] = Object.assign(drop, { line, pops });
      await done(p, "link-many FX " + (off ? "off" : "on"));
    }
    check("link-many, FX on: the dropped disc squashes as it lands; the win draws a line through the four and pops each one",
      got.on.dropping && got.on.squash && got.on.ringed === 4 && got.on.line && got.on.pops === 4, got.on);
    check("link-many, FX off: the disc is simply there and the four wear their ring, no line", !got.off.dropping && got.off.ringed === 4 && !got.off.line && got.off.pops === 0, got.off);
  }

  // ---- Dots and Boxes, FX on: a claimed block's lights come on, a ripple runs
  // out across the lot and the owner's letter pops onto the roof, and a redraw
  // (the next move) carries all of it on from where it was; FX off: the block
  // is simply there
  {
    const got = {};
    for (const off of [false, true]) {
      const p = await open("dots-and-boxes/", off);
      await p.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); });
      await p.click("#startGame");
      got[off ? "off" : "on"] = await p.evaluate(() => {
        const names = (sel) => [...document.querySelectorAll(sel)].map((e) => e.getAnimations().map((a) => a.animationName).join("+"));
        const look = () => ({ blocks: document.querySelectorAll(".block").length, lit: document.querySelectorAll(".block.lit-anim").length,
          rings: names(".ripple"), mark: names(".block .mark"), letter: (document.querySelector(".block .pad-letter") || {}).textContent,
          at: [...document.querySelectorAll(".ripple")].map((e) => { const a = e.getAnimations()[0]; return a ? a.effect.getTiming().delay : null; }) });
        // the page's clock, set by hand: the claim, a move 300 ms later, one long after
        const real = performance.now, t = real.call(performance);
        try {
          performance.now = () => t;
          hLines[0][0] = "ai"; vLines[0][0] = "ai"; vLines[0][1] = "ai";
          play("h", 1, 0);
          const claim = look();
          performance.now = () => t + 300; draw();
          const mid = look();
          performance.now = () => t + 5000; draw();
          return { score: scores.human, claim, mid, after: look() };
        } finally { performance.now = real; }
      });
      await done(p, "dots-and-boxes FX " + (off ? "off" : "on"));
    }
    const on = got.on;
    check("dots-and-boxes, FX on: a claimed block lights up, two ripple rings run out across it and its letter pops on",
      on.score === 1 && on.claim.lit === 1 && on.claim.rings.join() === "ripple,ripple" && on.claim.mark.join() === "markPop" && on.claim.letter === "Y", on.claim);
    check("dots-and-boxes, FX on: a redraw 300 ms in carries the light-up on from there, and one long after shows the block lit and still",
      on.mid.lit === 1 && on.mid.rings.length === 2 && on.mid.at.every((d) => d < -90 && d > -310) && on.after.blocks === 1 && on.after.lit === 0 && on.after.rings.length === 0 && on.after.letter === "Y", { mid: on.mid, after: on.after });
    check("dots-and-boxes, FX off: the block is simply there with its letter, no ripple",
      got.off.score === 1 && got.off.claim.blocks === 1 && got.off.claim.lit === 0 && got.off.claim.rings.length === 0 && got.off.claim.mark.join() === "" && got.off.claim.letter === "Y", got.off.claim);
  }

  // ---- Tall Order, FX on: a trimmed tier's offcut drops a tier's height,
  // then sheds tumbling crumbs of frosting and sponge as it falls on whole,
  // out of the picture (it used to break up into them and vanish in mid air,
  // though the pull-back shows it whole on the floor); FX off: it falls whole
  // with no crumbs
  {
    const HOOK = ["  // test hooks: the Playwright harness drives runs through these\n", `  window.__tf = {
    step: update, pitch: function () { return H; }, cam: function () { return cam; },
    debris: function () { return debris.map(function (d) { return d.y; }); },
    bits: function () { return sprinkles.filter(function (s) { return s.bit; }); }
  };
`];
    const got = {};
    for (const off of [false, true]) {
      const p = await open("tall-order/", off, (pg) => lib.injectScript(pg, "games/tall-order/game.js", [HOOK]));
      // the game's own steps, taken by hand (60 a second): frames, not time
      got[off ? "off" : "on"] = await p.evaluate(() => {
        TallOrder.start("bakery");
        TallOrder.placeAndDrop(40);                    // 40 px over the edge: one offcut that wide
        // (shedAt: how far it had fallen, in tiers, when the crumbs came; below:
        // how far below the screen's foot it was last seen, in px)
        const r = { whole: 0, fell: 0, shedAt: null, bits: 0, spins: 0, cols: 0, below: null, left: null };
        let from = null;
        for (let i = 0; i < 400; i++) {
          __tf.step(1 / 60);
          const d = __tf.debris(), b = __tf.bits();
          if (d.length) { if (from === null) from = d[0]; r.whole++; r.fell = Math.max(r.fell, (d[0] - from) / __tf.pitch()); r.below = Math.round(d[0] - __tf.cam() - innerHeight); }
          if (b.length > r.bits) { if (r.shedAt === null) r.shedAt = r.fell; r.bits = b.length; r.spins = new Set(b.map((s) => s.vr.toFixed(2))).size; r.cols = new Set(b.map((s) => s.col)).size; }
          if (i === 399) r.left = d.length + b.length;
        }
        r.tiers = TallOrder.tiers();
        return r;
      });
      await done(p, "tall-order offcut FX " + (off ? "off" : "on"));
    }
    check("tall-order, FX on: an offcut drops a tier's height, then sheds tumbling crumbs as it falls on whole, out of the bottom of the picture",
      got.on.tiers === 2 && got.on.whole >= 20 && got.on.fell > 3 && got.on.shedAt >= 0.5 && got.on.shedAt < 2 && got.on.bits >= 4 && got.on.spins >= 4 && got.on.cols >= 2 && got.on.below > 0 && got.on.left === 0, got.on);
    check("tall-order, FX off: the offcut falls whole, out of the bottom of the picture, with no crumbs",
      got.off.tiers === 2 && got.off.whole >= 20 && got.off.fell > 3 && got.off.bits === 0 && got.off.below > 0 && got.off.left === 0, got.off);
  }

  // ---- Demolition Row, FX on: cleared ice blocks burst into chunks of their
  // own colour, and a chain's second step pops a "×2" where it cleared, which
  // swells in and drifts up; FX off: no chunks, and the "×2" holds still
  {
    const got = {};
    for (const off of [false, true]) {
      const p = await open("demolition-row/", off);
      await p.click('#mode-pick [data-mode="endless"]'); await p.click("#play-btn");
      await p.waitForFunction(() => GAME && GAME.players.length, null, { timeout: 8000 });
      got[off ? "off" : "on"] = await p.evaluate(() => {
        const pl = GAME.players[0], b = pl.board, R = pl.renderer, g = b.grid;
        // a board set by hand: four orange stacked in column 3 with a green on
        // top, and three greens on the floor beside it. The stack clears (step
        // 1), the green drops beside the three (step 2: the chain)
        for (let r = 0; r < b.cfg.rows; r++) for (let c = 0; c < b.cfg.cols; c++) g[r][c] = null;
        const put = (r, c, col) => { g[r][c] = { t: "n", c: col, aug: null }; };
        [13, 12, 11, 10].forEach((r) => put(r, 3, 0)); put(9, 3, 1); [0, 1, 2].forEach((c) => put(13, c, 1));
        b.piece = null; b.muted = true;
        // the game's clock and its steps, by hand (16 ms each); every "×2" the
        // renderer writes is noted with its size, height and alpha
        const real = performance.now; let T = real.call(performance);
        performance.now = () => T;
        const texts = [], oFill = R.ctx.fillText;
        R.ctx.fillText = function (s, x, y) { texts.push({ s: String(s), y: Math.round(y), font: +/(\d+)px/.exec(this.font)[1], a: +this.globalAlpha.toFixed(2) }); return oFill.apply(this, arguments); };
        const r = { chunks1: 0, cols1: [], chunks2: 0, pop: null, popSeen: [] };
        try {
          b.startFalling();
          let popAt = -1;
          for (let i = 0; i < 400 && (popAt < 0 || T - popAt < 1100); i++) {
            T += 16; b.update(16, T);
            const coloured = b.debris.filter((d) => d.col), pops = b.pops || [];
            if (b.chain === 1 && coloured.length && !r.chunks1) { r.chunks1 = coloured.length; r.cols1 = [...new Set(coloured.map((d) => d.col))]; }
            if (pops.length && popAt < 0) { popAt = T; r.pop = { n: pops[0].n }; r.chunks2 = coloured.length; }
            if (popAt >= 0) {
              texts.length = 0; R.draw();
              const tx = texts.find((q) => q.s === "×2");
              r.popSeen.push(tx ? [T - popAt, tx.font, tx.y, tx.a] : [T - popAt, null]);
            }
          }
          r.banner = b.flash && b.flash.text; r.left = b.debris.length + (b.pops || []).length;
        } finally { performance.now = real; R.ctx.fillText = oFill; }
        return r;
      });
      await done(p, "demolition-row burst FX " + (off ? "off" : "on"));
    }
    const seen = (r) => r.popSeen.filter((q) => q[1] !== null), gone = (r) => r.popSeen.length > 0 && r.popSeen[r.popSeen.length - 1][1] === null && r.left === 0;
    const on = got.on, sOn = seen(on), sOff = seen(got.off), end = sOn[sOn.length - 1];
    check("demolition-row, FX on: four cleared ice blocks burst into chunks of their own colour",
      on.chunks1 === 20 && on.cols1.join() === "#ff8c2b" && on.chunks2 >= 20, { chunks1: on.chunks1, cols1: on.cols1, chunks2: on.chunks2 });
    check("demolition-row, FX on: the chain's second step pops ×2 where it cleared; it swells past its size, settles, drifts up and fades, then goes",
      !!on.pop && on.pop.n === 2 && on.banner === "CHAIN x2" && sOn.length >= 30 && Math.max(...sOn.map((q) => q[1])) > end[1] && sOn[0][1] < end[1] && end[2] < sOn[0][2] - 10 && end[3] < 0.5 && gone(on),
      { pop: on.pop, banner: on.banner, first: sOn[0], peak: Math.max(...sOn.map((q) => q[1])), last: end, left: on.left });
    check("demolition-row, FX off: no chunks; the ×2 shows at one size in one place, solid, then goes",
      got.off.chunks1 === 0 && got.off.chunks2 === 0 && !!got.off.pop && got.off.pop.n === 2 && sOff.length >= 30 && new Set(sOff.map((q) => q.slice(1).join())).size === 1 && sOff[0][3] === 1 && gone(got.off),
      { pop: got.off.pop, first: sOff[0], kinds: new Set(sOff.map((q) => q.slice(1).join())).size, left: got.off.left });
  }

  // ---- Meteor Menace, FX on: a blasted rock cracks into inked chunks that
  // fly out tumbling and shrink away, and action lines fly out past the
  // starburst; FX off: the starburst and its word alone
  {
    const HOOK = ["    start: start\n  };", `    start: start,
    step: update, render: render,
    blast: function (i) { splitRock(rocks[i], i); },
    fxState: function () { return { chunks: typeof chunks === "undefined" ? [] : chunks, booms: booms.length, words: words.length }; }
  };`];
    const got = {};
    for (const off of [false, true]) {
      const p = await open("meteor-menace/", off, (pg) => lib.injectScript(pg, "games/meteor-menace/game.js", [HOOK]));
      // the game's own steps, taken by hand (60 a second): frames, not time
      got[off ? "off" : "on"] = await p.evaluate(() => {
        __game.start();
        const before = __game.rocks.length, rk = __game.rocks[0], at = { x: rk.x, y: rk.y, r: rk.r };
        __game.blast(0);
        const s0 = __game.fxState(), dist = (c) => Math.hypot(c.x - at.x, c.y - at.y);
        const r = { rocks: [before, __game.rocks.length], chunks: s0.chunks.length, booms: s0.booms, words: s0.words, near: s0.chunks.every((c) => dist(c) < at.r) };
        // action lines: round-capped paper-white strokes, counted over one render
        let lines = 0;
        const o = CanvasRenderingContext2D.prototype.stroke;
        CanvasRenderingContext2D.prototype.stroke = function () { if (this.lineCap === "round" && this.strokeStyle === "#fff8e7") lines++; return o.apply(this, arguments); };
        try { __game.step(1 / 60); __game.render(); } finally { CanvasRenderingContext2D.prototype.stroke = o; }
        r.lines = lines;
        const turned0 = s0.chunks.map((c) => c.rot), from0 = s0.chunks.map(dist);
        for (let i = 0; i < 14; i++) __game.step(1 / 60);
        const s1 = __game.fxState();
        r.flung = s1.chunks.length ? Math.round(Math.min(...s1.chunks.map((c, i) => dist(c) - from0[i]))) : 0;   // px further out, the slowest of them
        r.tumbled = s1.chunks.filter((c, i) => Math.abs(c.rot - turned0[i]) > 0.5).length;
        for (let i = 0; i < 90; i++) __game.step(1 / 60);
        r.left = __game.fxState().chunks.length;
        return r;
      });
      await done(p, "meteor-menace crack FX " + (off ? "off" : "on"));
    }
    check("meteor-menace, FX on: a blasted big rock throws out eight chunks from inside it, which fly outward tumbling and are gone in a second",
      got.on.rocks[1] === got.on.rocks[0] + 1 && got.on.chunks === 8 && got.on.near && got.on.flung > 8 && got.on.tumbled === 8 && got.on.left === 0, got.on);
    check("meteor-menace, FX on: action lines fly out past the starburst", got.on.booms === 1 && got.on.words === 1 && got.on.lines === 1, got.on);
    check("meteor-menace, FX off: the rock splits the same, with its starburst and word, no chunks or action lines",
      got.off.rocks[1] === got.off.rocks[0] + 1 && got.off.chunks === 0 && got.off.booms === 1 && got.off.words === 1 && got.off.lines === 0, got.off);
  }

  // ---- Neon Pinball, FX on: the ball trails a glowing ribbon of the table's
  // neon, and a pop bumper or slingshot it hits throws off a ring that grows
  // and fades; FX off: no tail, no rings (the bumper and slingshot still light)
  {
    const HOOK = ["start: startGame,", "start: startGame, fxState: () => ({ rings: (typeof rings === \"undefined\" ? [] : rings).map((r) => ({ x: r.x, y: r.y, t: r.t })), bumpers: T.bumpers.map((b) => b.lit), slings: T.slings.map((s) => s.lit) }),"];
    const got = {};
    for (const off of [false, true]) {
      const p = await open("neon-pinball/", off, async (pg) => { await pg.addInitScript(STEPPED); await lib.injectScript(pg, "games/neon-pinball/game.js", [HOOK]); });
      got[off ? "off" : "on"] = await p.evaluate(() => {
        const r = {};
        // the tail: round-capped strokes under its own glow (a 14 px shadow), counted over one frame, with how wide each is
        let tail = [];
        const o = CanvasRenderingContext2D.prototype.stroke;
        CanvasRenderingContext2D.prototype.stroke = function () { if (this.lineCap === "round" && this.shadowBlur === 14) tail.push(+this.lineWidth.toFixed(1)); return o.apply(this, arguments); };
        try {
          NeonPinball.start("classic"); __frames(2);
          // the ball sent up the table at the left pop bumper (165, 235)
          NeonPinball.place(165, 330, 0, -520);
          __frames(6); tail = []; __frames(1);
          r.tail = tail.slice();
          let hit = -1;
          for (let i = 0; i < 40 && hit < 0; i++) { __frames(1); if (NeonPinball.fxState().bumpers[0] > 0.5) hit = i; }
          const a = NeonPinball.fxState();
          r.bumper = { hit: hit >= 0, lit: +a.bumpers[0].toFixed(2), rings: a.rings.length, at: a.rings[0] ? [a.rings[0].x, a.rings[0].y] : null };
          __frames(45);
          r.bumper.after = NeonPinball.fxState().rings.length;
          // ... and dropped onto the left slingshot's face
          NeonPinball.place(140, 600, -60, 260);
          let sl = -1;
          for (let i = 0; i < 40 && sl < 0; i++) { __frames(1); if (NeonPinball.fxState().slings[0] > 0.5) sl = i; }
          const b = NeonPinball.fxState();
          r.sling = { hit: sl >= 0, rings: b.rings.length, at: b.rings[0] ? [b.rings[0].x, b.rings[0].y] : null };
          __frames(45);
          r.sling.after = NeonPinball.fxState().rings.length;
        } finally { CanvasRenderingContext2D.prototype.stroke = o; }
        return r;
      });
      await done(p, "neon-pinball FX " + (off ? "off" : "on"));
    }
    check("neon-pinball, FX on: the ball trails a glowing ribbon, widening toward the ball", got.on.tail.length >= 5 && got.on.tail.every((w, i, a) => !i || w > a[i - 1]) && got.on.tail[got.on.tail.length - 1] > 10, got.on.tail);
    check("neon-pinball, FX on: a pop bumper the ball hits throws a ring off itself, gone within a second; so does a slingshot, off its face",
      got.on.bumper.hit && got.on.bumper.rings === 1 && String(got.on.bumper.at) === "165,235" && got.on.bumper.after === 0 &&
      got.on.sling.hit && got.on.sling.rings === 1 && String(got.on.sling.at) === "128,625" && got.on.sling.after === 0, got.on);
    check("neon-pinball, FX off: the bumper and slingshot light when hit, with no rings and no tail",
      got.off.bumper.hit && got.off.bumper.lit > 0.5 && got.off.bumper.rings === 0 && got.off.sling.hit && got.off.sling.rings === 0 && got.off.tail.length === 0, got.off);
  }

  // ---- Science Fair, FX on: the planet that sings swings on its string, to
  // one side, back through and settling, on top of its gentle sway (in the
  // tune and when picked); FX off: it lights where it hangs
  {
    const got = {};
    for (const off of [false, true]) {
      const p = await open("science-fair/", off);
      // every planet as it lights, with what's moving it at that moment (noted as it happens)
      await p.evaluate(() => {
        window.__lit = [];
        const read = (el) => {
          const an = el.getAnimations(), sw = an.filter((a) => !a.animationName && a.effect.composite === "add").pop();   // (the latest swing: an earlier one may still be going)
          const degs = sw ? sw.effect.getKeyframes().map((k) => +/rotate\(([-\d.]+)deg\)/.exec(k.transform)[1]) : [];
          return { sway: an.some((a) => a.animationName === "sway"), swing: !!sw, degs, ms: sw ? sw.effect.getTiming().duration : 0 };
        };
        document.querySelectorAll(".hang").forEach((el, i) => new MutationObserver(() => {
          if (el.classList.contains("lit") && !el.__was) window.__lit.push(Object.assign({ i }, read(el)));
          el.__was = el.classList.contains("lit");
        }).observe(el, { attributes: true, attributeFilter: ["class"] }));
        ScienceFair.fast(); ScienceFair.start("classic");
      });
      // (picked once its light from the tune has gone out, so the pick lights it afresh)
      await p.waitForFunction(() => ScienceFair.state() === "input" && !document.querySelector(".hang.lit"), null, { timeout: 8000 });
      await p.evaluate(() => ScienceFair.press(ScienceFair.seq()[0]));
      await p.waitForFunction(() => window.__lit.length >= 2, null, { timeout: 8000 });
      got[off ? "off" : "on"] = await p.evaluate(() => ({ lit: window.__lit.slice(0, 2), seq: ScienceFair.seq()[0] }));
      await done(p, "science-fair swing FX " + (off ? "off" : "on"));
    }
    const swung = (l) => l.swing && l.sway && l.degs.length === 6 && l.degs[0] === 0 && l.degs[5] === 0 && Math.abs(l.degs[1]) >= 3 && Math.abs(l.degs[1]) <= 9 &&
      l.degs[1] * l.degs[2] < 0 && Math.abs(l.degs[2]) < Math.abs(l.degs[1]) && Math.abs(l.degs[4]) < Math.abs(l.degs[2]) && l.ms >= 800;
    const on = got.on.lit, offL = got.off.lit;
    check("science-fair, FX on: the planet that sings swings on its string (out, back through, settling) on top of its sway, in the tune and when picked",
      on.length === 2 && on.every((l) => l.i === got.on.seq) && on.every(swung), got.on);
    check("science-fair, FX on: picked again, it's pushed the other way", on.length === 2 && on[0].degs[1] * on[1].degs[1] < 0, on.map((l) => l.degs[1]));
    check("science-fair, FX off: the planet lights where it hangs, no swing", offL.length === 2 && offL.every((l) => l.i === got.off.seq && !l.swing && !l.sway), got.off);
  }

  // ---- 24, FX on: the cards slide together as they combine (the picked one
  // onto the other, the rest to their new places), and a solved 24 pops: its
  // panel springs open past its size and settles, throwing sparks; FX off:
  // the new cards, and the "24!" panel, are simply there
  {
    const got = {};
    for (const off of [false, true]) {
      const p = await open("24/", off, (pg) => pg.addInitScript(STEPPED));
      got[off ? "off" : "on"] = await p.evaluate(() => {
        const L = TwentyFour.lcd, Solver = window.TwentyFourSolver, r = {};
        // every card and panel the game draws in a frame, as x:width (a card
        // picked, or the panel, is a filled box: x:width:height), and every
        // single pixel it sets away from the antenna (the sparks)
        let boxes = [], sparks = 0;
        const oFrame = L.frame, oFill = L.fill, oPx = L.px;
        L.frame = function (x, y, w, h, on) { if (h === 16 && on !== 0) boxes.push([x, w]); return oFrame.apply(this, arguments); };
        L.fill = function (x, y, w, h, on) { if (h >= 6 && w >= 10 && on !== 0 && on !== false) boxes.push([x, w, h]); return oFill.apply(this, arguments); };
        L.px = function (x, y, on) { if (on === undefined && !(x <= 4 && y <= 1)) sparks++; return oPx.apply(this, arguments); };
        const frame = () => { boxes = []; sparks = 0; __frames(1); return boxes.map((b) => b.join(":")).join(" "); };
        try {
          TwentyFour.press("1"); TwentyFour.press("navi"); __frames(2);   // Classic
          const G = () => TwentyFour.state().G;
          r.dealt = frame();
          TwentyFour.press("1"); TwentyFour.press("5"); TwentyFour.press("2");   // card 1 + card 2
          r.left = G().cards.length;
          r.slide = [frame(), frame(), frame()];
          __frames(12);
          r.after = frame();
          // ... then the hand solved, step by step as the solver has it
          TwentyFour.press("0"); __frames(2);
          const steps = Solver.solve(G().cards);
          const same = (a, b) => a.n === b.n && a.d === b.d, KEY = { "+": "5", "-": "6", "*": "7", "/": "8" };
          steps.forEach((s, k) => {
            const cards = G().cards, ia = cards.findIndex((c) => same(c, s.a)), ib = cards.findIndex((c, j) => j !== ia && same(c, s.b));
            if (G().sel !== -1 && G().sel !== ia) TwentyFour.press(String(G().sel + 1));    // (drop the card left picked)
            if (G().sel !== ia) TwentyFour.press(String(ia + 1));
            TwentyFour.press(KEY[s.op]); TwentyFour.press(String(ib + 1));
            if (k < steps.length - 1) __frames(14);
          });
          r.won = !!G().celebrate;
          r.win = [];
          for (let i = 0; i < 44; i++) { const f = frame(); r.win.push([f, sparks]); }
        } finally { L.frame = oFrame; L.fill = oFill; L.px = oPx; }
        return r;
      });
      await done(p, "24 FX " + (off ? "off" : "on"));
    }
    const FINAL = "7:22:16 31:22 55:22", PANEL = "6:72:18";
    const on = got.on, offR = got.off;
    // the card slid onto: the last but one drawn (the picked card goes over it)
    const hitX = on.slide.map((f) => { const b = f.split(" "); return b.length === 4 ? +b[2].split(":")[0] : NaN; });
    check("24, FX on: combining two cards, all four stay on screen as the one slid onto closes in, then the three new cards stand in their places",
      on.left === 3 && hitX.every((x) => x <= 24 && x > 7) && hitX[2] < hitX[0] && on.after === FINAL, { slide: on.slide, after: on.after });
    const two = on.win.filter((f) => f[0].split(" ").length === 2).length;                       // the last two cards sliding together
    const panel = on.win.filter((f) => /^\d+:\d+:\d+$/.test(f[0])).map((f) => +f[0].split(":")[1]);   // then the panel alone: its width
    check("24, FX on: a solved hand's last two cards slide together, then the 24! panel springs open past its width and settles, throwing sparks that are gone by the end",
      on.won && two >= 3 && panel.length >= 20 && panel[0] < 40 && Math.max(...panel) === 74 && panel[panel.length - 1] === 72 &&
      on.win.filter((f) => f[1] > 0).length >= 8 && on.win[on.win.length - 1][1] === 0 && on.win[on.win.length - 1][0] === PANEL,
      { two, panel, sparks: on.win.map((f) => f[1]).join("") });
    check("24, FX off: the new cards are simply there, and so is the 24! panel, with no sparks",
      offR.left === 3 && offR.slide.every((f) => f === FINAL) && offR.won && offR.win.every((f) => f[0] === PANEL && f[1] === 0), { slide: offR.slide, win: offR.win.slice(0, 3) });
  }

  // ---- Click Tap, FX on: each click sends a ripple out from the bed's rim and
  // bumps the clicks-per-second number; a burst of clicks keeps to a few rings,
  // and they clear themselves; FX off: the press and the count alone
  {
    const got = {};
    for (const off of [false, true]) {
      const p = await open("click-tap/", off);
      await p.click("#startBtn");
      await p.waitForFunction(() => !document.getElementById("play").hidden, null, { timeout: 8000 });
      got[off ? "off" : "on"] = await p.evaluate(() => {
        const pad = document.getElementById("pad"), r = pad.getBoundingClientRect(), cps = document.getElementById("vCps");
        const tap = () => pad.dispatchEvent(new PointerEvent("pointerdown", { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true }));
        const rings = () => [...document.querySelectorAll(".pad-wrap .ripple")];
        const names = (el) => el.getAnimations().map((a) => a.animationName).join("+");
        tap();
        const one = { rings: rings().length, ring: rings()[0] ? names(rings()[0]) : "", under: rings()[0] ? rings()[0].nextElementSibling === pad : null,
          bump: names(cps), pressed: pad.classList.contains("pressed"), clicks: document.getElementById("vClicks").textContent };
        for (let i = 0; i < 11; i++) tap();
        return { one, burst: rings().length, clicks: document.getElementById("vClicks").textContent };
      });
      // the rings take themselves away once they've played (polled: a busy machine is slower)
      got[off ? "off" : "on"].cleared = await p.waitForFunction(() => document.querySelectorAll(".pad-wrap .ripple").length === 0, null, { timeout: 8000 }).then(() => true, () => false);
      await done(p, "click-tap ripple FX " + (off ? "off" : "on"));
    }
    const on = got.on, offR = got.off;
    check("click-tap, FX on: a click sends one ripple out from under the bed's rim and bumps the clicks-per-second number",
      on.one.rings === 1 && on.one.ring === "ripple" && on.one.under === true && /bump/.test(on.one.bump) && on.one.pressed && on.one.clicks === "1", on.one);
    check("click-tap, FX on: twelve clicks at once keep to six rings, every click counted, and the rings clear themselves", on.burst === 6 && on.clicks === "12" && on.cleared, { burst: on.burst, clicks: on.clicks, cleared: on.cleared });
    check("click-tap, FX off: the press and the count alone, no ripple or bump",
      offR.one.rings === 0 && offR.one.bump === "" && offR.one.pressed && offR.one.clicks === "1" && offR.burst === 0 && offR.clicks === "12", offR);
  }

  await ctx.close();
};
