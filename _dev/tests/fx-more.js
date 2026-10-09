// Visual FX, continued (fx.js has the first rounds). FX off keeps every bit
// of a game's art and only calms its motion: nothing vanishes, nothing loops.
// FX on adds motion on top (Corner Pocket, Chess).
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const done = async (p, what) => { check(what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
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
    const a = await sky(); await p.waitForTimeout(700); const b = await sky();
    await p.click(".rm-toggle"); await p.waitForTimeout(150);
    const c = await sky(); await p.waitForTimeout(500); const d = await sky();
    await p.click(".rm-toggle"); await p.waitForTimeout(150);
    const e = await sky(); await p.waitForTimeout(700); const f = await sky();
    check("klondike: with FX off the sky holds still and keeps its snow; flipping FX on starts it moving, flipping it off stills it again",
      a.img === b.img && a.snow > 0 && c.img !== d.img && e.img === f.img && e.snow > 0, { offStill: a.img === b.img, snow: a.snow, onMoves: c.img !== d.img, backStill: e.img === f.img });
    await done(p, "klondike");
  }

  // ---- Lights Out: the dials keep their second hand with FX off, resting at twelve
  {
    const hands = {};
    for (const off of [false, true]) {
      const p = await open("lights-out/", off);
      await p.evaluate(() => LightsOut.start("zen")); await p.waitForTimeout(1300);
      hands[off ? "off" : "on"] = await p.evaluate(() => [...document.querySelectorAll(".lo-sec")].map((g) => ({ shown: getComputedStyle(g).display !== "none", rot: g.style.transform }))[0]);
      await done(p, "lights-out FX " + (off ? "off" : "on"));
    }
    check("lights-out: the second hand stays on the dial with FX off, resting at twelve (with FX on it shows the time)",
      hands.off && hands.off.shown && hands.off.rot === "rotate(0deg)" && hands.on && hands.on.shown, hands);
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
        const s = { strike: __pool.fx.strike, sparks: 0, trails: 0 }, t0 = performance.now();
        (function tick() {
          const f = __pool.fx;
          s.sparks = Math.max(s.sparks, f.sparks); s.trails = Math.max(s.trails, f.trails);
          if (performance.now() - t0 < 700) requestAnimationFrame(tick); else res(s);
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
      const p = await open("chess/", off, (pg) => lib.injectScript(pg, "games/chess/game.js", [HOOK2]));
      got[off ? "off" : "on"] = await p.evaluate(() => {
        document.getElementById("menu").classList.remove("show");
        const C = __chess; C.start(2);
        const go = (from, to) => C.doMove(C.legalFor(C.G, from).find((m) => m.to === to));
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
      got[off ? "off" : "on"].flyLeft = await p.waitForTimeout(500).then(() => p.evaluate(() => document.querySelectorAll(".pc.fly").length));
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
      const p = await open("chess/three.html", off, (pg) => pg.route(/\/games\/chess\/three\.html$/, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html })));
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
        T.doMove(T.legalFor(T.cid(0, 3, 0)).find((m) => m.to === T.cid(0, 0, 0)));
        const cap = anims();
        const b2 = new Array(96).fill(null);
        b2[T.cid(0, 3, 4)] = pc("r", "k"); b2[T.cid(1, 3, 4)] = pc("w", "k"); b2[T.cid(2, 3, 4)] = pc("k", "k"); b2[T.cid(0, 1, 4)] = pc("w", "q");
        T.G.board = b2; T.G.turn = "r";
        document.querySelector('polygon[data-c="40"]').dispatchEvent(new MouseEvent("click"));   // (an empty cell: just redraws)
        const ck = document.querySelector(".ckpulse");
        const red = !!document.querySelector('polygon[fill="#e05d5d"]'), pulse = ck && getComputedStyle(ck).animationName;
        // a rook takes a white pawn on its home rank, then New Game at once: the fresh pawn there mustn't slide in
        T.start(1); T.G.board[T.cid(1, 1, 0)] = pc("r", "r"); T.G.turn = "r";
        T.doMove(T.legalFor(T.cid(1, 1, 0)).find((m) => m.to === T.cid(1, 2, 0))); T.start(1);
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

  await ctx.close();
};
