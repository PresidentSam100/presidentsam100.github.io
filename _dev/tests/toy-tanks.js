// Toy Tanks: the rules (run headless, on the game's own engine.js), the
// campaign (the hand-made missions the same every run, the ones between drawn
// up afresh, a mission tried again kept as it was), the records (saved as
// they're earned), and the page at a laptop's size and a phone's: the mouse,
// the keys, the touch sticks, Visual FX off, and the arena fitting the screen.
const vm = require("vm"), fs = require("fs"), path = require("path");

function engine(root) {
  const win = {}, ctx = vm.createContext({ window: win, Math, console });
  for (const f of ["engine.js", "levels.js"]) vm.runInContext(fs.readFileSync(path.join(root, "games/toy-tanks", f), "utf8"), ctx, { filename: f });
  return { E: win.ToyTanksEngine, L: win.ToyTanksLevels };
}

module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  const { E, L } = engine(lib.ROOT);

  // ---- the rules ------------------------------------------------------------------
  const blank = () => Array.from({ length: E.ROWS }, () => ".".repeat(E.COLS));
  const map = (edits) => { const m = blank().map((r) => r.split("")); edits.forEach(([x, y, ch]) => (m[y][x] = ch)); return { map: m.map((r) => r.join("")) }; };
  const at = (st, x, y) => st.enemies.find((e) => e.x === x + 0.5 && e.y === y + 0.5);
  const play = (st) => { st.status = "play"; st.statusMs = 0; };
  const run = (st, ms, input) => { const ev = []; for (let t = 0; t < ms; t += 16) E.step(st, 16, typeof input === "function" ? input(t) : input).forEach((e) => ev.push(e)); return ev; };
  const still = (e) => { e.cool = 1e9; e.spec = Object.assign({}, e.spec, { fire: 1e9 }); };

  {
    const st = E.create([map([[2, 8, "P"], [20, 1, "b"]])], { seed: 1 }); play(st);
    still(st.enemies[0]);
    const ev = run(st, 16, { aim: 0, fire: true }).concat(run(st, 1500, { mx: 0, my: 1 }), run(st, 7500, {}));
    const bounces = ev.filter((e) => e.t === "bounce").length, spent = ev.filter((e) => e.t === "spent").length;
    check("toy-tanks rules: your shell bounces off one wall and is spent at the next", bounces === 1 && spent === 1 && st.shells.length === 0 && st.lives === 3, { bounces, spent, lives: st.lives });
  }
  {
    const st = E.create([map([[3, 8, "P"], [18, 8, "b"], [18, 2, "b"]])], { seed: 1 }); play(st);
    st.enemies.forEach(still);
    run(st, 16, { aim: 0, fire: true });
    const e = at(st, 18, 8); e.turret = Math.PI; e.cool = 0; E.fire(st, e); e.cool = 1e9;
    const ev = run(st, 3000, {});
    check("toy-tanks rules: two shells that meet knock each other out", ev.some((x) => x.t === "clash") && st.shells.length === 0 && st.player.alive && st.enemies.every((x) => x.alive), ev.map((x) => x.t));
  }
  {
    const st = E.create([map([[2, 8, "P"], [3, 8, "c"], [2, 9, "#"], [2, 10, "b"], [20, 1, "b"]])], { seed: 1 }); play(st);
    st.enemies.forEach(still);
    run(st, 16, { mine: true });
    run(st, 1500, { mx: 0, my: -1 });
    const ev = run(st, 9000, {});
    check("toy-tanks rules: a mine goes off on its own after 10 s, breaks the cork beside it, and takes a tank behind a block",
      ev.filter((e) => e.t === "blast").length === 1 && E.tile(st, 3.5, 8.5) === 0 && !at(st, 2, 10).alive && at(st, 20, 1).alive && st.player.alive,
      { blasts: ev.filter((e) => e.t === "blast").length, cork: E.tile(st, 3.5, 8.5), behind: at(st, 2, 10).alive });
  }
  {
    const st = E.create([map([[5, 8, "P"], [20, 1, "b"]])], { seed: 1 }); play(st);
    still(st.enemies[0]);
    run(st, 16, { mine: true });
    const under = run(st, 300, {});
    run(st, 1500, { mx: 1, my: 0 });
    const back = run(st, 2000, { mx: -1, my: 0 });
    check("toy-tanks rules: your own mine waits while you drive off it, and goes off when you come back", !under.some((e) => e.t === "blast") && back.some((e) => e.t === "blast") && !st.player.alive, { under: under.map((e) => e.t), back: back.map((e) => e.t) });
  }
  {
    const st = E.create([map([[2, 8, "P"], [20, 1, "b"]])], { seed: 1 }); play(st);
    still(st.enemies[0]);
    run(st, 16, { mine: true }); run(st, 1400, { mx: 0, my: -1 });
    const m = st.mines[0], a = Math.atan2(m.y - st.player.y, m.x - st.player.x);
    const ev = run(st, 1500, (t) => (t === 0 ? { aim: a, fire: true } : {}));
    check("toy-tanks rules: a shell sets a mine off", ev.some((e) => e.t === "blast") && st.mines.length === 0, ev.map((e) => e.t));
  }
  {
    const st = E.create([map([[2, 8, "P"], [6, 8, "b"], [20, 2, "b"], [20, 14, "b"]]), map([[2, 8, "P"], [20, 8, "b"]])], { seed: 1 }); play(st);
    st.enemies.forEach(still);
    run(st, 16, { aim: 0, fire: true }); run(st, 1500, {});
    const kills = st.kills;
    run(st, 16, { aim: Math.PI, fire: true });
    let ev = []; for (let t = 0; t < 8000 && !ev.some((e) => e.t === "lost"); t += 16) ev = ev.concat(E.step(st, 16, {}));
    const lives = st.lives;
    run(st, 1700, {});
    check("toy-tanks rules: losing your tank costs a life and starts the mission over, the tanks you destroyed staying destroyed",
      kills === 1 && lives === 2 && st.mi === 0 && st.enemies.length === 2 && st.player.alive, { kills, lives, mi: st.mi, left: st.enemies.length });
  }
  {
    const ms = []; for (let i = 0; i < 6; i++) ms.push(map([[2, 8, "P"], [6, 8, "b"]]));
    const st = E.create(ms, { seed: 1 }), lives = [];
    for (let i = 0; i < 6; i++) { run(st, 1700, {}); still(st.enemies[0]); run(st, 16, { aim: 0, fire: true }); run(st, 2600, {}); lives.push(st.lives); }
    check("toy-tanks rules: a life for clearing every fifth mission", lives.join() === "3,3,3,3,4,4", lives);
  }
  {
    const st = E.create([map([[2, 8, "P"], [12, 8, "b"], [20, 8, "b"]])], { seed: 3 }); play(st);
    const far = st.enemies[1]; far.spec = Object.assign({}, far.spec, { bounces: 0, fire: 200, wobble: 0 });
    still(st.enemies[0]);
    const ev = run(st, 6000, {});
    check("toy-tanks rules: an enemy never fires when one of its own is first in the line", !ev.some((e) => e.t === "fire") && st.enemies.every((e) => e.alive), ev.filter((e) => e.t === "fire").length);
  }
  {
    const st = E.create([map([[2, 2, "P"], [11, 14, "g"]])], { seed: 5 }); play(st);
    const g = st.enemies[0];
    let shot = null;
    for (let t = 0; t < 4000 && !shot; t += 16) if (E.step(st, 16, { mx: 1, my: 0 }).some((e) => e.t === "fire" && !e.player)) shot = { turret: g.turret, px: st.player.x, py: st.player.y };
    const direct = shot && Math.atan2(shot.py - g.y, shot.px - g.x);
    check("toy-tanks rules: the green tank aims ahead of a tank on the move", !!shot && Math.abs(shot.turret - direct) > 0.03, { shot, direct });
  }

  // ---- the tanks that lay mines (yellow, violet, white, black): once a mine
  // is down they drive off it, out of its reach, and keep on the move; they
  // never lay one beside another tank (it would go off at once) nor drive
  // into a mine's reach. Twenty drawn-up runs each (the engine's seeded, so
  // these are the same every time), your tank standing by.
  {
    const out = {};
    for (const kind of ["yellow", "violet", "white", "black"]) {
      const letter = Object.keys(E.LETTER).find((k) => E.LETTER[k] === kind);
      const o = out[kind] = { tanks: 0, laid: 0, cleared: 0, self: 0, moving: 0 };
      let moving = 0, alive = 0;
      for (let r = 0; r < 20; r++) {
        const camp = L.campaign(2000 + r, E.rng), mi = camp.findIndex((m) => m.map.join("").includes(letter));
        const st = E.create(camp, { start: mi, seed: 5 + r }), seen = new Map(), last = new Map();
        st.enemies.forEach((e) => { if (e.kind === kind) { o.tanks++; last.set(e, { x: e.x, y: e.y }); } });
        for (let t = 0; t < 20000 && st.status !== "won"; t += 16) {
          E.step(st, 16, {}).forEach((ev) => { if (ev.t === "dead" && ev.kind === kind && ev.by === "self" && ev.how === "blast") o.self++; });
          st.mines.forEach((m) => { if (m.owner.kind === kind && !seen.has(m)) { seen.set(m, t); o.laid++; } });
          // (out of its reach within 2 s of laying it)
          for (const [m, t0] of seen) if (t0 != null && m.owner.alive && Math.hypot(m.owner.x - m.x, m.owner.y - m.y) > E.TUNE.blast + E.TANK_R) { if (t - t0 < 2000) o.cleared++; seen.set(m, null); }
          for (const [e, p] of last) { if (!e.alive) continue; alive += 16; if (Math.hypot(e.x - p.x, e.y - p.y) > 1e-4) moving += 16; p.x = e.x; p.y = e.y; }
          if (st.status === "lost") { st.player.alive = true; st.status = "play"; st.lives = 3; }   // (your tank's loss isn't the point here: play on)
        }
      }
      o.moving = +(moving / alive).toFixed(2); o.cleared = +(o.cleared / Math.max(1, o.laid)).toFixed(2);
    }
    const all = Object.values(out);
    check("toy-tanks rules: the tanks that lay mines (yellow, violet, white, black) drive off a mine once it's down and out of its reach within 2 s, keep on the move, and all but never blow themselves up",
      all.every((o) => o.laid >= 5 && o.cleared >= 0.7 && o.moving >= 0.6) && all.reduce((n, o) => n + o.self, 0) <= 2, out);
  }
  {
    // a yellow tank right beside yours lays no mine (it would go off at once, taking both)
    const st = E.create([map([[10, 8, "P"], [11, 8, "y"]])], { seed: 3 }); play(st);
    const y = st.enemies[0]; still(y); y.spec = Object.assign({}, y.spec, { move: "none" });
    const ev = run(st, 6000, {});
    check("toy-tanks rules: a mine layer beside another tank lays no mine there", !ev.some((e) => e.t === "mine") && st.player.alive && y.alive, ev.filter((e) => e.t !== "bounce").map((e) => e.t));
  }

  // ---- the campaign -------------------------------------------------------------------
  {
    const a = L.campaign(11, E.rng), b = L.campaign(99, E.rng), a2 = L.campaign(11, E.rng);
    const errs = [], kinds = {};
    a.concat(b).forEach((m) => { const r = E.parse(m); if (r.errors.length) errs.push(m.n + ": " + r.errors.join("; ")); });
    for (let seed = 1; seed <= 12; seed++) L.campaign(seed * 7919, E.rng).forEach((m) => { E.parse(m).enemies.forEach((e) => { kinds[e.kind] = Math.min(kinds[e.kind] || 999, m.n); }); });
    const same = (x, y) => x.map.join() === y.map.join();
    const fixedSame = a.every((m, i) => !m.fixed || same(m, b[i])), between = a.filter((m, i) => !m.fixed && !same(m, b[i])).length;
    check("toy-tanks campaign: 100 missions, every fifth laid out by hand and the same in every run, the 80 between drawn up afresh (and the same again from the same seed)",
      a.length === 100 && a.filter((m) => m.fixed).length === 20 && a.every((m) => m.fixed === (m.n % 5 === 0)) && fixedSame && between >= 75 && a.every((m, i) => same(m, a2[i])) && errs.length === 0,
      { n: a.length, fixedSame, between, errs: errs.slice(0, 5) });
    const first = { brown: 1, ash: 2, marine: 5, yellow: 8, pink: 10, green: 12, violet: 15, white: 20, black: 50 };
    const wrong = Object.keys(first).filter((k) => kinds[k] !== first[k]);
    const debut = [8, 12].every((n) => { for (let seed = 1; seed <= 12; seed++) { const k = E.parse(L.campaign(seed, E.rng)[n - 1]).enemies.map((e) => e.kind); if (!k.includes(n === 8 ? "yellow" : "green")) return false; } return true; });
    check("toy-tanks campaign: each kind of tank first comes on its mission (brown 1, ash 2, marine 5, yellow 8, pink 10, green 12, violet 15, white 20, black 50), yellow and green always on theirs",
      wrong.length === 0 && debut, { kinds, wrong, debut });
  }

  // ---- the page, at a laptop's size --------------------------------------------------
  const ctx = await lib.newContext(browser, { viewport: { width: 1366, height: 657 } });
  let p = await lib.open(ctx, base, "games/toy-tanks/");
  {
    const menu = await p.evaluate(() => ({ ui: ToyTanks.ui(), play: document.getElementById("play").getAttribute("data-gs-key"), pick: document.querySelector("#pick-start button b").getAttribute("data-gs-key"), later: !document.getElementById("start-check").hidden }));
    await p.keyboard.press("Enter"); await p.waitForTimeout(150);
    const card = await p.evaluate(() => ({ ui: ToyTanks.ui(), mission: ToyTanks.st().mi + 1, banner: document.getElementById("banner").textContent, best: localStorage.getItem("toytanks_best_mission") }));
    check("toy-tanks: the menu takes keys (1 picks, Roll out wears Space or Enter), Enter rolls out, the mission card names the mission and its tanks, and the mission reached is a record at once",
      menu.ui === "menu" && menu.play === "Space or Enter" && menu.pick === "1" && !menu.later && card.ui === "run" && card.mission === 1 && /Mission 1/.test(card.banner) && /Enemy tanks: \d/.test(card.banner) && card.best === "1", { menu, card });

    // a mission tried again after a lost tank is the same one (a drawn-up mission keeps its layout)
    const before = await p.evaluate(() => { ToyTanks.advance(1700, {}); const st = ToyTanks.st(); return { grid: st.grid.join(""), foes: st.enemies.map((e) => e.kind + e.x + "," + e.y).join() }; });
    const after = await p.evaluate(() => {
      const st = ToyTanks.st(), pl = st.player;
      // (your own shell, back off the left wall)
      ToyTanks.advance(16, { aim: Math.PI, fire: true });
      for (let t = 0; t < 8000 && st.status === "play"; t += 16) ToyTanks.advance(16, {});
      const lost = st.status;
      ToyTanks.advance(1800, {});
      return { lost, lives: st.lives, grid: st.grid.join(""), foes: st.enemies.map((e) => e.kind + e.x + "," + e.y).join(), card: document.getElementById("banner").textContent, pl: pl === st.player };
    });
    check("toy-tanks: a lost tank costs a life and the same mission starts again, laid out as before", after.lost === "lost" && after.lives === 2 && after.grid === before.grid && after.foes === before.foes && /Mission 1/.test(after.card), { before, after });

    // the mouse: the turret follows the pointer; a click fires, a right-click lays a mine; the keys drive, Space fires, E lays a mine
    const geo = await p.evaluate(() => { ToyTanks.advance(1700, {}); const st = ToyTanks.st(); st.enemies.forEach((e) => { e.cool = 1e9; e.spec = Object.assign({}, e.spec, { fire: 1e9, mines: 0 }); }); const r = document.getElementById("arena").getBoundingClientRect(), s = ToyTanks.cell(), fr = Math.round(s / 2); return { x: r.left + fr, y: r.top + fr, s, px: st.player.x, py: st.player.y }; });
    const tx = geo.px + 3, ty = geo.py - 2;
    await p.mouse.move(geo.x + tx * geo.s, geo.y + ty * geo.s); await p.waitForTimeout(120);
    const aim = await p.evaluate(() => ToyTanks.st().player.turret);
    await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(80);
    const fired = await p.evaluate(() => ToyTanks.st().shells.filter((s) => !s.enemy).length);
    await p.mouse.click(geo.x + tx * geo.s, geo.y + ty * geo.s, { button: "right" }); await p.waitForTimeout(80);
    const mines = await p.evaluate(() => ToyTanks.st().mines.length);
    const x0 = await p.evaluate(() => ToyTanks.st().player.x);
    await p.keyboard.down("d"); await p.waitForTimeout(400); await p.keyboard.up("d");
    const x1 = await p.evaluate(() => ToyTanks.st().player.x);
    await p.keyboard.press("e"); await p.waitForTimeout(80);
    const mines2 = await p.evaluate(() => ToyTanks.st().mines.length);
    await p.keyboard.press("Space"); await p.waitForTimeout(80);
    const fired2 = await p.evaluate(() => ToyTanks.st().shells.filter((s) => !s.enemy).length);
    check("toy-tanks laptop: the turret turns to the mouse, a click fires, a right-click lays a mine; D drives, E lays a mine, Space fires",
      Math.abs(aim - Math.atan2(ty - geo.py, tx - geo.px)) < 0.08 && fired >= 1 && mines === 1 && x1 > x0 + 0.3 && mines2 === 2 && fired2 >= 1, { aim, want: Math.atan2(ty - geo.py, tx - geo.px), fired, mines, x0, x1, mines2, fired2 });

    // records: a tank destroyed is saved at once
    const kills = await p.evaluate(() => {
      // (a fresh run, your tank set down three squares from an enemy, the floor between them cleared)
      ToyTanks.start(); ToyTanks.advance(1700, {});
      const st = ToyTanks.st(), e = st.enemies.find((t) => t.alive), pl = st.player, cols = 22;
      st.enemies.forEach((t) => { t.cool = 1e9; t.spec = Object.assign({}, t.spec, { fire: 1e9, mines: 0, move: "none" }); });
      for (let x = Math.floor(e.x) - 3; x < Math.floor(e.x); x++) if (x >= 0) st.grid[Math.floor(e.y) * cols + x] = 0;
      pl.x = Math.floor(e.x) - 2.5; pl.y = e.y; st.shells = []; st.mines = [];
      ToyTanks.advance(16, { aim: 0, fire: true }); ToyTanks.advance(800, {});
      return { kills: st.kills, saved: localStorage.getItem("toytanks_best_kills") };
    });
    check("toy-tanks: a tank destroyed is counted, and the most in a run is saved the moment it's passed", kills.kills >= 1 && kills.saved === String(kills.kills), kills);
    check("toy-tanks laptop: no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }

  // ---- a pause covers the arena (no studying a shell in flight), and P again uncovers it ----------
  {
    p = await lib.open(ctx, base, "games/toy-tanks/");
    await p.evaluate(() => { ToyTanks.start(); ToyTanks.advance(1700, {}); });
    const cover = () => p.evaluate(() => { const c = getComputedStyle(document.getElementById("stage"), "::after"), a = document.getElementById("stage").getBoundingClientRect(); return { on: c.content !== "none" && c.display !== "none", w: parseFloat(c.width) + parseFloat(c.borderLeftWidth) + parseFloat(c.borderRightWidth), stage: Math.round(a.width) }; });
    const before = await cover();
    await p.keyboard.press("p"); await p.waitForTimeout(150);
    const paused = await cover();
    await p.keyboard.press("p"); await p.waitForTimeout(150);
    const after = await cover();
    check("toy-tanks: paused, the box's lid covers the whole arena; resumed, it lifts", !before.on && paused.on && paused.w >= paused.stage - 1 && !after.on, { before, paused, after });
    check("toy-tanks (pause): no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }

  // ---- the white tank: seen on the mission card, gone from sight once it starts ---------------
  {
    const r = (() => { const c = L.campaign(5, E.rng), m = c[19], st = E.create([m], { seed: 1 }), white = st.enemies.filter((e) => e.kind === "white"); const onCard = white.every((e) => !e.hidden); run(st, 1700, {}); run(st, 100, {}); return { n: white.length, onCard, gone: white.every((e) => e.hidden || !e.alive) }; })();
    check("toy-tanks: mission 20 brings the white tanks, seen on the mission card and gone from sight once it starts", r.n === 2 && r.onCard && r.gone, r);
  }

  // ---- a white tank stays out of sight when your tank is lost (seen only on the mission card)
  {
    const c = await lib.newContext(browser, { viewport: { width: 1280, height: 900 } });
    const q = await lib.open(c, base, "games/toy-tanks/");
    const r = await q.evaluate(() => new Promise((res) => {
      ToyTanks.start(20); ToyTanks.advance(1700, {});
      const st = ToyTanks.st(), A = window.ToyTanksArt, orig = A.tank, seen = {};
      A.tank = function (g, t) { (seen[st.status] = seen[st.status] || []).push(t.kind); return orig.apply(this, arguments); };
      st.player.alive = false;     // (lost: the next step says so)
      setTimeout(() => { A.tank = orig; res({ status: st.status, lost: (seen.lost || []).length, white: (seen.lost || []).filter((k) => k === "white").length }); }, 700);
    }));
    check("toy-tanks: when your tank is lost the white tanks stay out of sight (the others still drawn)", r.status === "lost" && r.lost > 0 && r.white === 0, r);
    check("toy-tanks (white tank): no page errors", q.errs.length === 0, q.errs);
    await q.close(); await c.close();
  }

  // ---- two shells meet: what's left of their smoke trails lingers and fades,
  // rather than going with them (Visual FX on)
  {
    const c = await lib.newContext(browser, { viewport: { width: 1280, height: 900 } });
    const q = await lib.open(c, base, "games/toy-tanks/", { before: (pg) => pg.addInitScript(() => { try { localStorage.setItem("reduceMotion:toy-tanks", "0"); } catch (e) {} }) });
    const r = await q.evaluate(() => new Promise((res) => {
      ToyTanks.start(); ToyTanks.advance(1700, {});
      const st = ToyTanks.st(), E = window.ToyTanksEngine;
      st.enemies.forEach((e) => { e.cool = 1e9; e.spec = Object.assign({}, e.spec, { fire: 1e9, mines: 0, move: "none" }); });
      // a clear stretch of floor, 7 tiles of a row, no tank near the line
      let seg = null;
      const off = (t, x, y) => { const k = Math.max(x + 0.5, Math.min(x + 6.5, t.x)); return Math.hypot(t.x - k, t.y - (y + 0.5)); };
      for (let y = 1; y < E.ROWS - 1 && !seg; y++) for (let x = 0; x + 6 < E.COLS && !seg; x++) {
        let ok = true;
        for (let dx = 0; dx <= 6 && ok; dx++) if (st.grid[y * E.COLS + x + dx] !== 0) ok = false;
        if (ok && [st.player].concat(st.enemies).every((t) => off(t, x, y) > 1.2)) seg = { x: x, y: y };
      }
      if (!seg) return res({ seg: null });
      st.shells.push({ id: 90001, x: seg.x + 0.5, y: seg.y + 0.5, vx: 5.2, vy: 0, owner: st.player, bounces: 0, fast: false, age: 1000, enemy: false },
        { id: 90002, x: seg.x + 6.5, y: seg.y + 0.5, vx: -5.2, vy: 0, owner: st.enemies[0], bounces: 0, fast: false, age: 1000, enemy: true });
      let t0 = null;
      const start = st.clock;
      (function look() {
        if (t0 == null && !st.shells.length) t0 = st.clock;
        if (t0 != null && st.clock >= t0 + 450) return res({ seg, met: st.clock - start, parts: ToyTanks.fx().parts });
        if (st.clock - start > 8000) return res({ seg, met: null });
        requestAnimationFrame(look);
      })();
    }));
    check("toy-tanks: two shells meet and their smoke trails linger a moment after (0.45 s on, still there)", !!r.seg && r.met != null && r.parts > 0, r);
    check("toy-tanks (trails): no page errors", q.errs.length === 0, q.errs);
    await q.close(); await c.close();
  }

  // ---- Visual FX off: the same battle, calmer: shells and tanks still move; no smoke, sparks or shake --------
  for (const off of [false, true]) {
    const c = await lib.newContext(browser, { viewport: { width: 1280, height: 900 } });
    const q = await lib.open(c, base, "games/toy-tanks/", { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:toy-tanks", off ? "1" : "0"); } catch (e) {} }, off) });
    const r = await q.evaluate(() => {
      ToyTanks.start(); ToyTanks.advance(1700, {});
      const st = ToyTanks.st(), pl = st.player;
      st.enemies.forEach((e) => { e.cool = 1e9; e.spec = Object.assign({}, e.spec, { fire: 1e9, mines: 0 }); });
      const x0 = pl.x;
      ToyTanks.advance(16, { mx: 0, my: 0, aim: -Math.PI / 2, fire: true, mine: true });
      const shell = st.shells.find((s) => !s.enemy), sy = shell ? shell.y : null;
      ToyTanks.advance(200, { mx: 1, my: 0 });
      const moved = { tank: pl.x - x0, shell: shell ? sy - shell.y : 0 };
      return new Promise((res) => setTimeout(() => res(Object.assign(moved, ToyTanks.fx())), 300));
    });
    check("toy-tanks, Visual FX " + (off ? "off: shells and tanks move as ever, with no smoke, sparks or shake" : "on: shells trail smoke as they fly"),
      r.tank > 0.2 && r.shell > 0.5 && (off ? r.parts === 0 && r.shake === 0 : r.parts > 0), r);
    check("toy-tanks (Visual FX " + (off ? "off" : "on") + "): no page errors", q.errs.length === 0, q.errs);
    await q.close(); await c.close();
  }
  await ctx.close();

  // ---- a phone: the sticks, the Mine button, a tap on the arena; and the arena fits ----------------------
  {
    const c = await lib.newContext(browser, Object.assign({}, devices["iPhone 13"], { viewport: { width: 390, height: 664 } }));
    const q = await lib.open(c, base, "games/toy-tanks/");
    await q.tap("#play"); await q.waitForTimeout(150);
    // (the blocks cleared away, so the barrel can't be up against one)
    await q.evaluate(() => { ToyTanks.advance(1700, {}); const st = ToyTanks.st(); st.grid.fill(0); st.enemies.forEach((e) => { e.cool = 1e9; e.spec = Object.assign({}, e.spec, { fire: 1e9, mines: 0 }); }); });
    const box = (sel) => q.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; }, sel);
    const touch = async (sel, dx, dy, ms) => {
      const b = await box(sel), cdp = await c.newCDPSession(q);
      const pt = (x, y) => [{ x, y, id: 1 }];
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(b.x, b.y) });
      for (let i = 1; i <= 5; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(b.x + dx * i / 5, b.y + dy * i / 5) });
      await q.waitForTimeout(ms);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await cdp.detach();
      await q.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));   // (a press is taken on the next frame)
    };
    const x0 = await q.evaluate(() => ToyTanks.st().player.x);
    await touch("#move-stick", 40, 0, 400);
    const x1 = await q.evaluate(() => ToyTanks.st().player.x);
    const s0 = await q.evaluate(() => ToyTanks.st().shells.filter((s) => !s.enemy).length);
    await touch("#aim-stick", 0, -40, 150);
    const aimed = await q.evaluate(() => ({ turret: ToyTanks.st().player.turret, shells: ToyTanks.st().shells.filter((s) => !s.enemy).length }));
    await q.tap("#mine-btn"); await q.waitForTimeout(80);
    const mines = await q.evaluate(() => ToyTanks.st().mines.length);
    const vis = await q.evaluate(() => ({ pad: getComputedStyle(document.getElementById("pad")).display, keys: [...document.querySelectorAll("#hint .gs-keys")].some((e) => e.getClientRects().length), touch: [...document.querySelectorAll("#hint .gs-touch")].some((e) => e.getClientRects().length) }));
    check("toy-tanks phone: the left stick drives, the right stick aims (up) and fires as it's let go, Mine lays a mine; the sticks and touch help show, the key help doesn't",
      x1 > x0 + 0.3 && Math.abs(aimed.turret + Math.PI / 2) < 0.15 && aimed.shells > s0 && mines === 1 && vis.pad === "flex" && !vis.keys && vis.touch, { x0, x1, aimed, s0, mines, vis });
    const tap = await q.evaluate(() => { const r = document.getElementById("arena").getBoundingClientRect(), s = ToyTanks.cell(), fr = Math.round(s / 2), pl = ToyTanks.st().player; return { x: r.left + fr + (pl.x + 4) * s, y: r.top + fr + (pl.y + 4) * s, want: Math.atan2(4, 4) }; });
    await q.evaluate(() => { ToyTanks.st().shells = []; });
    await q.touchscreen.tap(tap.x, tap.y); await q.waitForTimeout(80);
    const after = await q.evaluate(() => ({ turret: ToyTanks.st().player.turret, shells: ToyTanks.st().shells.filter((s) => !s.enemy).length }));
    check("toy-tanks phone: a tap on the arena turns the turret to it and fires", Math.abs(after.turret - tap.want) < 0.2 && after.shells >= 1, { tap, after });
    check("toy-tanks phone: no page errors", q.errs.length === 0, q.errs);
    await q.close(); await c.close();
  }
  {
    // the arena whole on the screen, nothing to scroll: laptops, phones upright and on their side
    const ph = (d, w, h) => Object.assign({}, devices[d], { viewport: { width: w, height: h } });
    const sizes = [["1366 x 657", { viewport: { width: 1366, height: 657 } }], ["1280 x 600", { viewport: { width: 1280, height: 600 } }], ["1280 x 900", { viewport: { width: 1280, height: 900 } }],
      ["390 x 664", ph("iPhone 13", 390, 664)], ["375 x 553", ph("iPhone SE", 375, 553)], ["360 x 560", ph("Pixel 5", 360, 560)], ["320 x 568", ph("iPhone SE", 320, 568)],
      ["750 x 340, on its side", ph("iPhone 13 landscape", 750, 340)], ["667 x 330, on its side", ph("iPhone SE landscape", 667, 330)]];
    const bad = [];
    for (const [label, dev] of sizes) {
      const c = await lib.newContext(browser, dev);
      const q = await lib.open(c, base, "games/toy-tanks/");
      await q.evaluate(() => { ToyTanks.start(); ToyTanks.advance(1700, {}); });
      await q.waitForTimeout(200);
      const r = await q.evaluate((w) => {
        const a = document.getElementById("arena").getBoundingClientRect(), d = document.documentElement;
        const inside = (e) => { const b = e.getBoundingClientRect(); return b.left >= -1 && b.right <= w + 1 && b.top >= -1 && b.bottom <= innerHeight + 1; };
        const pad = ["move-stick", "aim-stick", "mine-btn"].map((id) => document.getElementById(id)).filter((e) => e.getClientRects().length);
        return { s: ToyTanks.cell(), arena: [a.left, a.top, a.right, a.bottom].map(Math.round), scrollW: d.scrollWidth, scrollH: d.scrollHeight, h: innerHeight, padInside: pad.every(inside), hud: inside(document.getElementById("hud")) };
      }, dev.viewport.width);
      if (r.arena[0] < 0 || r.arena[2] > dev.viewport.width || r.arena[3] > r.h || r.scrollW > dev.viewport.width || r.scrollH > r.h + 1 || !r.padInside || !r.hud || r.s < 12) bad.push(label + " " + JSON.stringify(r));
      if (q.errs.length) bad.push(label + " errors: " + q.errs.join("; "));
      await q.close(); await c.close();
    }
    check("toy-tanks: in play the arena, the HUD and the sticks are whole on the screen with nothing to scroll, at three laptop sizes, four phones and two phones on their side", bad.length === 0, bad);
  }
};
