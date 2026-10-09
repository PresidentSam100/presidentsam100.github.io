// Visual FX, continued (fx.js has the first rounds). FX off keeps every bit
// of a game's art and only calms its motion: nothing vanishes, nothing loops.
// FX on adds motion on top (Corner Pocket, Chess, Tic-Tac-Toe, Yi, Minesweeper,
// Speedle, Abyss, Crazy Ohio, Jam Jar, Flappy World, Spacer, Typetwo,
// Stopwatch, Steamfitter, Hash, Klondike).
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
      await p.click("#startBtn");
      got[off ? "off" : "on"] = await p.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
        const moved = (sel, re) => [...document.querySelectorAll(sel)].filter((c) => re.test(c.style.transform)).length;
        const r = { hand: document.querySelectorAll("#hand .card").length, fanned: moved("#hand .card", /rotate/), minis: moved("#opponents .mini-back", /translate/), waits: Math.round(drawAnimUntil - Date.now()) };
        // just after the last card lands (the first turn is still waiting its own beat)
        setTimeout(() => { r.settled = moved("#hand .card, #opponents .mini-back", /./) === 0; res(r); }, Math.max(0, r.waits) + 80);
      }))));
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
        const G = __game; G.setQueue(3, 0); G.setAim(240); G.drop();
        const f = G.fruits[G.fruits.length - 1], t0 = performance.now();
        let most = 0, landedAt = null;
        (function w() {
          const k = G.squash(f); most = Math.max(most, Math.abs(k));
          if (landedAt === null && f.contacted) landedAt = performance.now() - t0;
          if (performance.now() - t0 < 2000) requestAnimationFrame(w); else res({ landed: landedAt !== null, most: +most.toFixed(3), after: G.squash(f) });
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
        const t0 = performance.now();
        (function f() {
          motes = Math.max(motes, __game.motes); bolts = Math.max(bolts, __game.bolts);
          if (performance.now() - t0 < 350) requestAnimationFrame(f); else { CanvasRenderingContext2D.prototype.stroke = o; res({ bolts, glow, motes }); }
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
        (function f() { seen.push(+PipeMania.__left(at.r, at.c).toFixed(3)); if (seen.length < 25) requestAnimationFrame(f); else res({ from: at.type, turned, first: seen[0], least: Math.min(...seen), last: seen[seen.length - 1] }); })();
      }));
      await done(p, "steamfitter turn FX " + (off ? "off" : "on"));
    }
    check("steamfitter, FX on: a turned pipe eases its quarter-turn into place, overshooting a touch, while the board has turned it at once",
      got.on.turned !== got.on.from && got.on.first > 0.5 && got.on.least < 0 && got.on.last === 0, got.on);
    check("steamfitter, FX off: the pipe jumps", got.off.turned !== got.off.from && got.off.first === 0 && got.off.least === 0, got.off);
  }

  // ---- Hash, FX on: the deal turns each card face up, one after another,
  // all done within about half a second; FX off: the cards are simply there
  {
    const got = {};
    for (const off of [false, true]) {
      const p = await open("hash/", off);
      got[off ? "off" : "on"] = await p.evaluate(() => {
        document.getElementById("newBtn").click();
        const cards = [...document.querySelectorAll(".card.dealt")];
        const flips = cards.map((c) => c.getAnimations().find((a) => a.animationName === "dealFlip")).filter(Boolean);
        const lags = flips.map((a) => a.effect.getTiming().delay);
        return { dealt: cards.length, flips: flips.length, lags: lags.slice(0, 4), ends: lags.length ? Math.max(...lags) + flips[0].effect.getTiming().duration : 0 };
      });
      await done(p, "hash deal FX " + (off ? "off" : "on"));
    }
    check("hash, FX on: the deal turns each card face up one after another, all inside ~0.6s",
      got.on.dealt >= 12 && got.on.flips === got.on.dealt && JSON.stringify(got.on.lags) === "[0,20,40,60]" && got.on.ends <= 650, got.on);
    check("hash, FX off: the cards are simply there", got.off.dealt >= 12 && got.off.flips === 0, got.off);
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

  await ctx.close();
};
