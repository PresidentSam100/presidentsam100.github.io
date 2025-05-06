    "use strict";
    // Reduce-motion state for this game (live) — set by the top-right toggle / OS setting.
    var reducedMotion = function () { return !!(window.RM_ON && window.RM_ON()); };
    /* =====================================================================
     * Demolition Row — Wii Party U "Demolition Row" inspired clone.
     *
     * Falling-piece puzzle: PLUS-SHAPED pieces (5 cells: center + 4 arms,
     * each arm independently colored) fall from the top. Move/rotate/drop
     * them; after a piece locks, gravity settles every cell, then any group
     * of 4+ orthogonally-connected same-colored blocks DEMOLISHES, the stack
     * falls, and chains CASCADE until none remain. Top out (stack over the
     * pink line) = loss. VS: race to clear below the purple goal line.
     *
     * Split into: CONFIG · RNG · pure grid logic · Board (state + pieces) ·
     * CPU · Renderer · Game (modes) · Input · Menu.
     * ===================================================================== */

    // ----------------------------- CONFIG --------------------------------
    const CONFIG = {
      cols: 9, rows: 14,  // top 3 rows are an off-grid spawn buffer above the line
      topLineRow: 3,    // pink line at the top of the visible field; loss = a block overflows ABOVE it
      goalLineRow: 9,   // purple line (50-Stage): clear/win when topmost block row > this
      vsGoalLineRow: 10, // VS goal sits lower — win = stack within the bottom 3 rows
      cell: 38, colors: 5, minGroup: 4,
      stoneDurability: 3,
      gaugeMax: 800,           // score (pre-bonus) needed per powerup; higher = rarer/more-earned. combos fill it faster via the chain multiplier
      bonusDurationMs: 8000, bonusMultiplier: 20,
      // falling speed (ms per row); per-stage/level speed-up
      baseFallMs: 800, fallDecreasePerStage: 32, minFallMs: 140,
      softDropMs: 45, slowFactor: 2.5, slowDurationMs: 9000,
      pts: { normal: 10, stone: 50, star: 100 },
      specialWeights: { iron: 3, crystal: 3, thunder: 2, slow: 2 }, // slow stripped in VS
      stoneRate: 0.05, starRate: 0.05, stageStoneBonus: 0.004,
      stage: { startHeight: 5, heightPerStage: 0.1, maxHeight: 7, fillDensity: 0.9, total: 50 },
      endless: { startHeight: 3, fillDensity: 0.88, levelEverySec: 25, maxLevel: 99 },
      vs: { startHeight: 6, fillDensity: 0.95 },
      cpu: { // reactMs = pace · mistake = chance of a random placement · look = next-piece lookahead weight · lookChance = how often lookahead is used · smart = board-quality eval
        easy:       { reactMs: 950, mistake: 0.20, look: 0,    lookChance: 0 },
        normal:     { reactMs: 600, mistake: 0.10, look: 0.45, lookChance: 0.5 },
        hard:       { reactMs: 360, mistake: 0.02, look: 0.6,  lookChance: 1 },
        impossible: { reactMs: 170, mistake: 0,    look: 0.9,  lookChance: 1 }, // never errs, deep lookahead
        kaizo:      { reactMs: 120, mistake: 0,    look: 1.0,  lookChance: 1, smart: true }, // + board-quality eval: plays for the unknown future. top tier.
      },
    };
    const COLOR_HEX = ["#ff8c2b", "#34c759", "#3f8cff", "#a25cff", "#ff4db8"]; // orange green blue purple magenta
    const DIRS = [[-1,0],[1,0],[0,-1],[0,1]];
    const FALL_ACCEL = 0.00020; // rows per ms^2 — gravity for the settle animation
    const FLASH_MS = 150;       // matched group flash duration before it clears
    const ROT_SPEED = 0.013;    // radians/ms for the rotation animation (~120ms per 90°)
    const SPAWN_MS = 360;       // grow-in animation before a piece is fully active (a "prep" beat)

    // ------------------------------ Sound --------------------------------
    // Tiny synthesized SFX engine (Web Audio, no files). Created on first gesture.
    const SFX = {
      ctx: null, master: null, muted: false,
      load() { this.muted = false; }, // global muting handled by the shared toggle (mute-toggle.js); per-board mute stays
      init() { if (this.ctx) return; try { const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = 0.32; this.master.connect(this.ctx.destination); } catch (e) { this.ctx = null; } },
      resume() { try { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); } catch (e) {} },
      setMuted(m) { this.muted = m; try { localStorage.setItem("demolitionRow_muted", m ? "1" : "0"); } catch (e) {} },
      tone(freq, dur, type, vol, slideTo, delay) {
        if (this.muted || !this.ctx) return;
        const t0 = this.ctx.currentTime + (delay || 0), o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = type || "sine"; o.frequency.setValueAtTime(freq, t0);
        if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.03);
      },
      noise(dur, vol, cutoff, delay) {
        if (this.muted || !this.ctx) return;
        const t0 = this.ctx.currentTime + (delay || 0), n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
        const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = cutoff || 1400;
        const g = this.ctx.createGain(); g.gain.setValueAtTime(vol || 0.3, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.connect(f); f.connect(g); g.connect(this.master); src.start(t0); src.stop(t0 + dur + 0.03);
      },
      rotate() { this.tone(430, 0.06, "square", 0.16); },
      cycle() { this.tone(560, 0.05, "triangle", 0.14); this.tone(770, 0.05, "triangle", 0.1, null, 0.04); },
      match(chain) { const b = 360 + Math.min((chain || 1) - 1, 8) * 80; this.tone(b, 0.13, "triangle", 0.26); this.tone(b * 1.5, 0.12, "sine", 0.16, null, 0.02); },
      stoneHit() { this.tone(170, 0.09, "square", 0.2, 95); },
      iron() { this.noise(0.32, 0.4, 700); this.tone(130, 0.3, "sawtooth", 0.3, 48); },
      thunder() { this.noise(0.2, 0.34, 3500); this.tone(950, 0.22, "sawtooth", 0.24, 180); },
      slow() { this.tone(520, 0.45, "sine", 0.24, 150); },
      star() { [660, 880, 1175, 1568].forEach((f, i) => this.tone(f, 0.1, "triangle", 0.18, null, i * 0.05)); },
      win() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.18, "triangle", 0.26, null, i * 0.08)); },
      topout() { this.tone(320, 0.5, "sawtooth", 0.28, 80); this.tone(160, 0.5, "square", 0.16, 50, 0.05); },
      matchWin() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.2, "triangle", 0.28, null, i * 0.1)); this.tone(1047, 0.5, "sine", 0.2, null, 0.42); },
    };
    SFX.load();

    // ------------------------------ RNG ----------------------------------
    function makeRNG(seed) {
      let s = seed >>> 0;
      return function () {
        s |= 0; s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    // -------------------- cell constructors / helpers --------------------
    // normal colored block; `aug` optionally carries a powerup: thunder/slow/star
    const N = (c, aug) => ({ t: "n", c, aug: aug || null });
    const S = (h) => ({ t: "s", h }); // stone block w/ durability
    const inb = (g, r, c) => r >= 0 && r < g.length && c >= 0 && c < g[0].length;
    function emptyGrid(cols, rows) { const g = []; for (let r = 0; r < rows; r++) g.push(new Array(cols).fill(null)); return g; }
    function cloneGrid(g) { return g.map((row) => row.map((c) => (c ? { ...c } : null))); }

    // ----------------------- PURE GRID LOGIC -----------------------------
    function connectedGroup(g, r, c) {
      const cell = g[r] && g[r][c];
      if (!cell || cell.t !== "n") return [];
      const color = cell.c, seen = new Set([r + "," + c]), out = [[r, c]], stack = [[r, c]];
      while (stack.length) {
        const [cr, cc] = stack.pop();
        for (const [dr, dc] of DIRS) {
          const nr = cr + dr, nc = cc + dc, key = nr + "," + nc;
          if (inb(g, nr, nc) && !seen.has(key)) { const nb = g[nr][nc]; if (nb && nb.t === "n" && nb.c === color) { seen.add(key); out.push([nr, nc]); stack.push([nr, nc]); } }
        }
      }
      return out;
    }
    function findGroups(g, min) {
      const seen = new Set(), groups = [];
      for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) {
        const cell = g[r][c]; if (!cell || cell.t !== "n" || seen.has(r + "," + c)) continue;
        const grp = connectedGroup(g, r, c); grp.forEach(([gr, gc]) => seen.add(gr + "," + gc));
        if (grp.length >= min) groups.push(grp);
      }
      return groups;
    }
    // Remove `coords`; crack adjacent stones. Returns counts plus any powerup
    // augments carried by the cleared colored blocks.
    // `broken` (optional) collects [r,c] of stones that were fully destroyed, so the
    // caller can spawn a debris burst there. Pure sims omit it.
    function applyClear(g, coords, crackStones, ignoreAugs, broken) {
      if (crackStones === undefined) crackStones = true;
      const set = new Set(coords.map(([r, c]) => r + "," + c));
      let normals = 0, stones = 0, stars = 0, augSlow = 0;
      const augThunder = new Set();
      for (const [r, c] of coords) {
        const cell = g[r][c]; if (!cell) continue;
        // ignoreAugs = a heavy iron crush: powerups are destroyed but do NOT activate
        if (cell.t === "n") { normals++; if (!ignoreAugs) { if (cell.aug === "thunder") augThunder.add(cell.c); else if (cell.aug === "slow") augSlow++; else if (cell.aug === "star") stars++; } }
        else if (cell.t === "s") { stones++; if (broken) broken.push([r, c]); }
        g[r][c] = null;
      }
      // adjacent stones crack from a demolition — but NOT from the iron crush
      let stoneCracks = 0;
      if (crackStones) {
        const stoneHit = new Set();
        for (const [r, c] of coords) for (const [dr, dc] of DIRS) { const nr = r + dr, nc = c + dc, key = nr + "," + nc; if (!inb(g, nr, nc) || set.has(key)) continue; const nb = g[nr][nc]; if (nb && nb.t === "s") stoneHit.add(key); }
        stoneCracks = stoneHit.size;
        for (const key of stoneHit) { const [r, c] = key.split(",").map(Number); g[r][c].h -= 1; if (g[r][c].h <= 0) { g[r][c] = null; stones++; if (broken) broken.push([r, c]); } }
      }
      return { normals, stones, stars, augThunder, augSlow, stoneCracks };
    }
    function applyGravity(g) {
      const rows = g.length, cols = g[0].length;
      for (let c = 0; c < cols; c++) { let w = rows - 1; for (let r = rows - 1; r >= 0; r--) if (g[r][c]) { const cell = g[r][c]; g[r][c] = null; g[w][c] = cell; w--; } }
    }
    function topRow(g) { for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) if (g[r][c]) return r; return g.length; }
    function belowGoal(g, goalRow) { return topRow(g) > goalRow; }
    function toppedOut(g, topLine) { return topRow(g) < topLine; } // a block overflowed above the line
    function colorCoords(g, color) { const out = []; for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) { const x = g[r][c]; if (x && x.t === "n" && x.c === color) out.push([r, c]); } return out; }
    function laneCoords(g, lanes) { const out = []; for (let r = 0; r < g.length; r++) for (const c of lanes) if (g[r][c]) out.push([r, c]); return out; }
    function mostCommonColor(g) { const cnt = new Array(CONFIG.colors).fill(0); for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) { const x = g[r][c]; if (x && x.t === "n") cnt[x.c]++; } let b = 0; for (let i = 1; i < cnt.length; i++) if (cnt[i] > cnt[b]) b = i; return b; }

    // Cells a piece occupies. 'plus' = center + 4 arms; 'iron' = a 2x2 block.
    function piecePositions(type, pivot) {
      const { r, c } = pivot;
      if (type === "iron") return [[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]];
      return [[r, c], [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
    }
    function canPlace(grid, type, pivot) {
      // cells above the field (r < 0) are allowed (a piece can enter from the
      // top); game-over is decided only by the post-resolve top-line check.
      for (const [r, c] of piecePositions(type, pivot)) { if (c < 0 || c >= grid[0].length || r >= grid.length) return false; if (r >= 0 && grid[r][c]) return false; }
      return true;
    }
    // Rotate the 4 arm cells; the center is unchanged.
    function rotateCellsCW(x) { return { C: x.C, U: x.L, R: x.U, D: x.R, L: x.D }; }
    function rotateCellsCCW(x) { return { C: x.C, U: x.R, L: x.U, D: x.L, R: x.D }; }

    // ------------------------------ Board --------------------------------
    class Board {
      constructor(cfg, rng, opts) {
        this.cfg = cfg; this.rng = rng; this.opts = opts || {};
        this.grid = emptyGrid(cfg.cols, cfg.rows);
        this.score = 0; this.gauge = 0; this.pq = []; // pq = powerup queue (one dispensed per piece)
        this.starCount = 0; this.bonusUntil = 0; this.slowUntil = 0;
        this.piece = null; this.fallProgress = 0; this.fallMs = cfg.baseFallMs;
        this.alive = true; this.cleared = false;
        // settle state machine: 'control' | 'falling' | 'flashing'
        this.phase = "control"; this.fallVel = 0; this.chain = 0; this.muted = false; this.clearingThunder = false;
        this.spawnT = 1; this.softHeld = false; // grow-in progress; soft-drop held
        this.settleTotals = { normals: 0, stones: 0, stars: 0 }; this.settleGained = 0; this.settleGaugeGain = 0;
        this.pendingClear = []; this.flashUntil = 0; this.thunderQueue = []; this.ironCrush = false;
        this.allowStars = false; this.allowSlow = true;
        this.fx = []; this.debris = []; this.shake = 0; this.flash = null;
      }
      now() { return performance.now(); }
      bonusActive() { return this.now() < this.bonusUntil; }
      slowActive() { return this.now() < this.slowUntil; }
      effFallMs() { return this.slowActive() ? this.fallMs * this.cfg.slowFactor : this.fallMs; }
      randColor() { return Math.floor(this.rng() * this.cfg.colors); }
      stoneRateNow() { return this.cfg.stoneRate + (this.opts.stage || 0) * this.cfg.stageStoneBonus; }

      // ---- setup / garbage fill ----
      generateRow(density, stoneRate, starRate) {
        const row = new Array(this.cfg.cols).fill(null);
        for (let c = 0; c < this.cfg.cols; c++) { if (this.rng() > density) continue; const x = this.rng(); if (starRate && x < starRate) row[c] = N(this.randColor(), "star"); else if (x < (starRate || 0) + stoneRate) row[c] = S(this.cfg.stoneDurability); else row[c] = N(this.randColor()); }
        return row;
      }
      fill(heightRows, density, stoneRate, starRate) {
        for (let i = 0; i < heightRows; i++) this.grid[this.cfg.rows - 1 - i] = this.generateRow(density, stoneRate, starRate);
        applyGravity(this.grid);
        this.settleInitial();
      }
      // Clear any pre-existing 4+ groups so a stage starts stable (no score).
      settleInitial() { let g = findGroups(this.grid, this.cfg.minGroup); while (g.length) { const all = []; g.forEach((gr) => gr.forEach((co) => all.push(co))); applyClear(this.grid, all); applyGravity(this.grid); g = findGroups(this.grid, this.cfg.minGroup); } }

      // ---- piece spawning ----
      // A spec is a piece without a position (used for the Next preview).
      // type 'iron' = 2x2; 'plus' = 5-cell plus (mono=crystal). Each plus cell
      // is {t:'n',c,aug} (color, optional powerup) or {t:'s'} (stone).
      generateSpec() {
        const ps = this.pq.length ? this.pq.shift() : null; // pull one banked powerup onto this piece
        if (ps === "iron") return { type: "iron" };
        if (ps === "crystal") return { type: "plus", mono: true, crystalColor: -1 }; // -1 = uncolored white crystal
        const keys = ["C", "U", "D", "L", "R"], cells = {};
        for (const k of keys) cells[k] = this.rng() < this.stoneRateNow() ? { t: "s" } : { t: "n", c: this.randColor(), aug: null };
        if (ps === "thunder" || ps === "slow") this.augCell(cells, ps);
        else if (this.allowStars && this.rng() < this.cfg.starRate) this.augCell(cells, "star");
        return { type: "plus", mono: false, cells };
      }
      augCell(cells, aug) {
        const ck = ["C", "U", "D", "L", "R"].filter((k) => cells[k].t === "n");
        if (!ck.length) { cells.C = { t: "n", c: this.randColor(), aug }; return; }
        cells[ck[Math.floor(this.rng() * ck.length)]].aug = aug;
      }
      spawnPiece() {
        if (!this.nextSpec) this.nextSpec = this.generateSpec();
        const s = this.nextSpec;
        this.nextSpec = this.generateSpec(); // becomes the new "Next" preview
        let piece;
        const spawnR = this.cfg.topLineRow - 2; // plus: lowest arm ends up right above the line
        if (s.type === "iron") piece = { type: "iron", pivot: { r: this.cfg.topLineRow - 3, c: Math.max(0, (this.cfg.cols >> 1) - 1) }, rotOffset: 0 }; // sits at the top of the spawn buffer
        else {
          const cells = {};
          for (const k of ["C", "U", "D", "L", "R"]) {
            if (s.mono) cells[k] = { t: "n", c: s.crystalColor, aug: null };
            else { const cs = s.cells[k]; cells[k] = cs.t === "s" ? { t: "s" } : { t: "n", c: cs.c, aug: cs.aug }; }
          }
          piece = { type: "plus", mono: !!s.mono, crystalColor: s.crystalColor || 0, cells, pivot: { r: spawnR, c: this.cfg.cols >> 1 }, rotOffset: 0 };
        }
        this.piece = piece; this.fallProgress = 0; this.spawnT = 0; this.phase = "spawning"; // grow-in beat
        if (!canPlace(this.grid, piece.type, piece.pivot)) this.die(); // truly no room = top out
      }
      die() { this.alive = false; this.shake = 1; this.piece = null; if (!this.muted) SFX.topout(); }
      // The player may steer the piece both while it grows in and while it falls.
      controllable() { return this.alive && !this.cleared && this.piece && (this.phase === "control" || this.phase === "spawning"); }

      // ---- piece controls ----
      movePiece(dc) { if (!this.controllable()) return; const p = { r: this.piece.pivot.r, c: this.piece.pivot.c + dc }; if (canPlace(this.grid, this.piece.type, p)) this.piece.pivot = p; }
      // dir > 0 = clockwise, dir < 0 = counter-clockwise. Iron is symmetric
      // (no-op); Crystal cycles its color; normal plus swings its arms.
      rotatePiece(dir) {
        if (!this.controllable()) return;
        dir = dir < 0 ? -1 : 1; const p = this.piece;
        if (p.type === "iron") return;
        if (p.mono) { const n = p.crystalColor < 0 ? (dir > 0 ? 0 : this.cfg.colors - 1) : ((p.crystalColor + dir) % this.cfg.colors + this.cfg.colors) % this.cfg.colors; p.crystalColor = n; for (const k of ["C", "U", "D", "L", "R"]) p.cells[k] = { t: "n", c: n, aug: null }; if (!this.muted) SFX.cycle(); return; }
        p.cells = dir > 0 ? rotateCellsCW(p.cells) : rotateCellsCCW(p.cells);
        p.rotOffset = -dir * Math.PI / 2;
        if (!this.muted) SFX.rotate();
      }
      setCrystalColor(color) { if (this.controllable() && this.piece.type === "plus" && this.piece.mono) { this.piece.crystalColor = color; for (const k of ["C", "U", "D", "L", "R"]) this.piece.cells[k] = { t: "n", c: color, aug: null }; if (!this.muted) SFX.cycle(); } }
      hardDrop() { if (!this.controllable()) return; if (this.phase === "spawning") this.spawnT = 1; while (true) { const p = { r: this.piece.pivot.r + 1, c: this.piece.pivot.c }; if (canPlace(this.grid, this.piece.type, p)) this.piece.pivot = p; else break; } this.lock(); }

      tickFall(dt) {
        if (this.phase !== "control" || !this.alive || this.cleared || !this.piece) return;
        if (this.piece.rotOffset) { const s = ROT_SPEED * dt; this.piece.rotOffset = this.piece.rotOffset > 0 ? Math.max(0, this.piece.rotOffset - s) : Math.min(0, this.piece.rotOffset + s); }
        // hold soft-drop = fall at the fast soft-drop rate
        const interval = this.softHeld ? this.cfg.softDropMs : this.effFallMs();
        this.fallProgress += dt / interval;
        while (this.fallProgress >= 1) { this.fallProgress -= 1; const p = { r: this.piece.pivot.r + 1, c: this.piece.pivot.c }; if (this.piece && canPlace(this.grid, this.piece.type, p)) this.piece.pivot = p; else { this.lock(); break; } }
      }
      // grow-in beat: piece scales up at the spawn spot, then becomes active
      tickSpawn(dt) { this.spawnT += dt / SPAWN_MS; if (this.spawnT >= 1) { this.spawnT = 1; this.phase = "control"; this.fallProgress = 0; } }

      // Per-frame driver: grow-in beat, player control, or settle animation.
      update(dt, t) {
        if (!this.alive || this.cleared) return;
        if (this.phase === "spawning") this.tickSpawn(dt);
        else if (this.phase === "control") this.tickFall(dt);
        else this.tickAnim(dt, t);
      }

      // ---- lock -> animated settle -> flash -> clear -> cascade ----
      lock() {
        const p = this.piece; if (!p) return;
        this.chain = 0; this.settleTotals = { normals: 0, stones: 0, stars: 0 }; this.settleGained = 0; this.settleGaugeGain = 0; this.thunderQueue = []; this.clearingThunder = false; this.ironCrush = false;
        if (p.type === "iron") {
          // crush its two columns through the same flash → clear → cascade pipeline as
          // a match. The iron crush itself is heavy: powerup blocks in its path are
          // destroyed but do NOT activate (see ironCrush handling in doClear). Any
          // cascades it triggers afterward are normal matches and do activate powerups.
          const lanes = [p.pivot.c, p.pivot.c + 1].filter((x) => x >= 0 && x < this.cfg.cols);
          const coords = laneCoords(this.grid, lanes);
          this.flashBanner("IRON", "#cfd6e6"); if (!this.muted) SFX.iron();
          this.piece = null;
          if (coords.length) { this.chain = 1; this.pendingClear = coords; this.ironCrush = true; this.phase = "flashing"; this.flashUntil = this.now() + FLASH_MS; return; }
          this.startFalling(); return;
        }
        // a crystal dropped without choosing a color gets a random one
        if (p.mono && p.crystalColor < 0) { const rc = Math.floor(this.rng() * this.cfg.colors); p.crystalColor = rc; for (const k of ["C", "U", "D", "L", "R"]) p.cells[k] = { t: "n", c: rc, aug: null }; }
        this.stampPiece(p);
        this.piece = null;
        this.startFalling(); // animate everything settling, then resolve cascades
      }
      stampPiece(p) {
        const { r, c } = p.pivot, put = (rr, cc, cell) => { if (inb(this.grid, rr, cc)) this.grid[rr][cc] = cell; };
        const keyed = [["C", r, c], ["U", r - 1, c], ["D", r + 1, c], ["L", r, c - 1], ["R", r, c + 1]];
        for (const [k, rr, cc] of keyed) { const cs = p.cells[k]; put(rr, cc, cs.t === "s" ? S(this.cfg.stoneDurability) : N(cs.c < 0 ? 0 : cs.c, cs.aug)); }
      }
      // Gravity that records each block's drop distance so the renderer can
      // animate it falling (cell.oy = remaining rows to fall).
      applyGravityAnim() {
        const g = this.grid, rows = this.cfg.rows, cols = this.cfg.cols;
        for (let c = 0; c < cols; c++) {
          let w = rows - 1;
          for (let r = rows - 1; r >= 0; r--) {
            if (g[r][c]) { const cell = g[r][c]; if (w !== r) { cell.oy = (cell.oy || 0) + (w - r); g[r][c] = null; g[w][c] = cell; } w--; }
          }
        }
      }
      startFalling() { this.applyGravityAnim(); this.fallVel = 0; this.phase = "falling"; }

      tickAnim(dt, t) {
        if (this.phase === "falling") {
          this.fallVel += FALL_ACCEL * dt;
          const d = this.fallVel * dt; let maxOy = 0;
          const g = this.grid;
          for (let r = 0; r < this.cfg.rows; r++) for (let c = 0; c < this.cfg.cols; c++) { const x = g[r][c]; if (x && x.oy) { x.oy = Math.max(0, x.oy - d); if (x.oy > maxOy) maxOy = x.oy; } }
          if (maxOy <= 0.0001) { this.fallVel = 0; this.onSettled(t); }
        } else if (this.phase === "flashing") {
          if (t >= this.flashUntil) this.doClear();
        }
      }
      onSettled(t) {
        const groups = findGroups(this.grid, this.cfg.minGroup);
        if (groups.length) {
          this.chain += 1;
          const all = []; groups.forEach((gr) => gr.forEach((co) => all.push(co)));
          this.pendingClear = all; this.phase = "flashing"; this.flashUntil = t + FLASH_MS;
        } else this.finishSettle();
      }
      doClear() {
        // Clear the currently-flashing cells: a matched group, a thunder color, or an iron crush.
        const thunderStep = this.clearingThunder; this.clearingThunder = false;
        const ironStep = this.ironCrush; this.ironCrush = false;
        // iron crush: no neighbor cracking AND powerups don't activate (just destroyed)
        const broken = [];
        const r = applyClear(this.grid, this.pendingClear, !ironStep, ironStep, broken); this.addFx(this.pendingClear);
        if (broken.length) this.addBreakFx(broken);
        if (!this.muted) {
          if (thunderStep) SFX.thunder(); else if (!ironStep) SFX.match(this.chain); // iron already played its own sound
          if (r.stoneCracks > 0) SFX.stoneHit();
          if (r.augSlow > 0) SFX.slow();
          if (r.stars > 0) SFX.star();
        }
        this.tallyClear(r); this.pendingClear = [];
        // Thunder combo: after the matched group clears, fire each thunder color
        // as its own flash beat — all BEFORE gravity. Only once nothing is left
        // to clear do the blocks fall.
        while (this.thunderQueue.length) {
          const color = this.thunderQueue.shift();
          const coords = colorCoords(this.grid, color);
          if (coords.length) { this.chain += 1; this.pendingClear = coords; this.clearingThunder = true; this.flashBanner("THUNDER", "#ffe169"); this.phase = "flashing"; this.flashUntil = this.now() + FLASH_MS; return; }
        }
        this.applyGravityAnim(); this.fallVel = 0; this.phase = "falling";
      }
      tallyClear(r) {
        this.settleTotals.normals += r.normals; this.settleTotals.stones += r.stones; this.settleTotals.stars += r.stars;
        this.settleGained += this.scoreFor(r, this.chain);
        this.settleGaugeGain += (r.normals * this.cfg.pts.normal + r.stones * this.cfg.pts.stone + r.stars * this.cfg.pts.star) * this.chain; // gauge fills by the (pre-bonus) score gained — combos pump it via the chain multiplier
        if (r.augSlow > 0) { this.slowUntil = this.now() + this.cfg.slowDurationMs; this.flashBanner("SLOW", "#43e8ff"); }
        for (const color of r.augThunder) if (this.thunderQueue.indexOf(color) < 0) this.thunderQueue.push(color);
      }
      finishSettle() {
        if (this.chain > 0) { this.afterClear(this.settleTotals, this.settleGained, this.settleGaugeGain); if (this.chain >= 2) this.flashBanner("CHAIN x" + this.chain, "#46e6a0"); }
        if (toppedOut(this.grid, this.cfg.topLineRow)) this.die();
        this.phase = "control";
        if (this.alive && !this.cleared) this.spawnPiece();
      }
      scoreFor(r, chain) { const p = this.cfg.pts; const base = r.normals * p.normal + r.stones * p.stone + r.stars * p.star; return base * chain * (this.bonusActive() ? this.cfg.bonusMultiplier : 1); }
      afterClear(total, gained, gaugeGain) {
        this.score += gained;
        this.gauge += gaugeGain;                        // combo-weighted fill (chains pump it faster)
        let awarded = 0;
        while (this.gauge >= this.cfg.gaugeMax) {        // each full bar banks one powerup; the remainder carries over (no waste, no overfill)
          this.gauge -= this.cfg.gaugeMax;
          this.pq.push(this.rollSpecial());             // queued — dispensed one per piece, not all at once
          awarded++;
        }
        if (awarded > 0) this.flashBanner(awarded > 1 ? "BONUS x" + awarded + "!" : "BONUS READY", "#ffd23f");
        if (total.stars > 0) { this.starCount += total.stars; while (this.starCount >= 3) { this.starCount -= 3; this.bonusUntil = this.now() + this.cfg.bonusDurationMs; this.flashBanner("x20 BONUS!", "#ffd23f"); } }
        if (this.opts.useGoal && belowGoal(this.grid, this.opts.goalRow)) this.cleared = true;
      }
      rollSpecial() { const w = { ...this.cfg.specialWeights }; if (!this.allowSlow) delete w.slow; const e = Object.entries(w); let sum = e.reduce((a, [, v]) => a + v, 0), x = this.rng() * sum; for (const [k, v] of e) { if (x < v) return k; x -= v; } return e[0][0]; }

      addFx(coords) { const now = this.now(); coords.forEach(([r, c]) => this.fx.push({ r, c, t: now })); if (this.fx.length > 400) this.fx.splice(0, this.fx.length - 400); }
      // A burst of stone shards where a stone block was destroyed.
      addBreakFx(coords) {
        const now = this.now(), s = this.cfg.cell;
        for (const [r, c] of coords) {
          const cx = (c + 0.5) * s, cy = (r + 0.5) * s;
          for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2, sp = 0.05 + Math.random() * 0.13; // px/ms
            this.debris.push({
              x: cx + (Math.random() * 2 - 1) * s * 0.18, y: cy + (Math.random() * 2 - 1) * s * 0.18,
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.08, // slight upward kick
              t: now, life: 340 + Math.random() * 220, size: s * (0.1 + Math.random() * 0.13),
              rot: Math.random() * Math.PI, vr: (Math.random() * 2 - 1) * 0.018, shade: 96 + (Math.random() * 44 | 0),
            });
          }
        }
        if (this.debris.length > 600) this.debris.splice(0, this.debris.length - 600);
        this.shake = Math.min(1, this.shake + 0.22);
      }
      flashBanner(text, color) { this.flash = { text, color, until: this.now() + 850 }; }
    }

    // ------------------------------- CPU ---------------------------------
    // Evaluates every column × rotation for the active piece, simulating the
    // drop + resolve, and picks the highest-scoring placement (clears made,
    // keep the stack low). Difficulty tunes reaction time, mistakes, specials.
    class CPU {
      constructor(board, diff, rng) { this.b = board; this.d = CONFIG.cpu[diff]; this.rng = rng; this.next = 0; this.plan = null; this.planFor = null; }
      moveMs() { return Math.max(this.d.smart ? 50 : 80, this.d.reactMs * 0.32); } // time between visible moves (kaizo is quicker-fingered)
      // Plays like a human: pick a target, then nudge the piece toward it one
      // move/rotation at a time, and only then drop.
      think(now) {
        const b = this.b; if (b.phase !== "control" || !b.alive || b.cleared || !b.piece) { return; }
        const p = b.piece;
        if (this.planFor !== p) { // new piece → think for a beat, then act
          this.plan = this.makePlan(); this.planFor = p; this.next = now + this.d.reactMs; return;
        }
        if (now < this.next) return; this.next = now + this.moveMs();
        const slide = (target) => { const before = p.pivot.c; b.movePiece(p.pivot.c < target ? 1 : -1); if (p.pivot.c === before) b.hardDrop(); }; // blocked → just drop
        if (p.type === "iron") { if (p.pivot.c !== this.plan.c) { slide(this.plan.c); return; } b.hardDrop(); return; }
        if (p.mono) { if (p.crystalColor !== this.plan.color) { b.setCrystalColor(this.plan.color); return; } }
        else if (this.plan.rotLeft !== 0) { const dir = this.plan.rotLeft > 0 ? 1 : -1; b.rotatePiece(dir); this.plan.rotLeft -= dir; return; } // shortest way round
        if (p.pivot.c !== this.plan.c) { slide(this.plan.c); return; }
        b.hardDrop();
      }
      makePlan() {
        const b = this.b, p = b.piece, cMin = 1, cMax = b.cfg.cols - 2;
        // decide once per piece whether to look ahead this turn (Normal does sometimes)
        this.lookNow = this.rng() < this.d.lookChance ? this.d.look : 0;
        let plan;
        if (p.type === "iron") {
          const bi = this.bestIron(); let c = bi ? bi.c : p.pivot.c;
          if (this.rng() < this.d.mistake) c = Math.floor(this.rng() * (b.cfg.cols - 1));
          plan = { c, rotLeft: 0 };
        } else if (p.mono) {
          // Crystal: try every color, keep the color + column that scores best.
          let best = null, color = 0;
          for (let col = 0; col < b.cfg.colors; col++) {
            const cells = {}; for (const k of ["C", "U", "D", "L", "R"]) cells[k] = { t: "n", c: col, aug: null };
            const bp = this.bestPlacement(cells, 1);
            if (bp && (!best || bp.score > best.score)) { best = bp; color = col; }
          }
          let c = best ? best.c : p.pivot.c;
          if (this.rng() < this.d.mistake) { color = Math.floor(this.rng() * b.cfg.colors); c = cMin + Math.floor(this.rng() * (cMax - cMin + 1)); }
          plan = { c, rotLeft: 0, color };
        } else {
          const bp = this.bestPlacement(p.cells, 4); let c = bp ? bp.c : p.pivot.c, rot = bp ? bp.rot : 0;
          if (this.rng() < this.d.mistake) { c = cMin + Math.floor(this.rng() * (cMax - cMin + 1)); rot = Math.floor(this.rng() * 4); }
          plan = { c, rotLeft: this.minRot(rot) };
        }
        return plan;
      }
      // convert CW-step count (0..3) into the fewest signed rotations (3 CW = 1 CCW).
      // A 180° turn (2) is equally short either way, so pick CW/CCW at random.
      minRot(rot) { return rot === 3 ? -1 : rot === 2 ? (this.rng() < 0.5 ? 2 : -2) : rot; }
      bestIron() {
        // Score crushing each adjacent column pair by the RESULTING board (incl.
        // a winning move), plus a weighted look at the next piece's best response.
        const b = this.b, look = this.lookNow || 0; let best = null;
        for (let c = 0; c < b.cfg.cols - 1; c++) {
          const o = this.ironOutcome(b.grid, c); if (!o) continue;
          let score = this.boardScore(o);
          if (look > 0) score += look * this.evalNext(o.sim);
          if (!best || score > best.score) best = { c, score };
        }
        return best;
      }
      // Resolve a clear in the sim INCLUDING thunder augments (a thunder block
      // wipes every block of its color), so placement scores reflect that payoff.
      simClearAugs(sim, coords, crack) {
        if (crack === undefined) crack = true;
        const r = applyClear(sim, coords, crack); let count = r.normals + r.stones + r.stars;
        const colors = [...r.augThunder];
        while (colors.length) { const color = colors.shift(); const tc = colorCoords(sim, color); if (tc.length) { const rr = applyClear(sim, tc, true); count += rr.normals + rr.stones + rr.stars; for (const cc of rr.augThunder) if (colors.indexOf(cc) < 0) colors.push(cc); } }
        return count;
      }
      bestPlacement(baseCells, rots) {
        const b = this.b, cMin = 1, cMax = b.cfg.cols - 2, look = this.lookNow || 0;
        let best = null, cells = { ...baseCells };
        for (let rot = 0; rot < rots; rot++) {
          if (rot > 0) cells = rotateCellsCW(cells);
          for (let c = cMin; c <= cMax; c++) {
            const o = this.dropOutcome(b.grid, cells, c); if (!o) continue;
            // a winning placement dominates; tiny rotation penalty for natural moves
            const rotCost = rot === 3 ? 1 : rot;
            let score = this.boardScore(o) - rotCost * 0.2;
            if (look > 0) score += look * this.evalNext(o.sim); // weigh the known next piece
            if (!best || score > best.score) best = { c, rot, score };
          }
        }
        return best; // mistakes are applied once in makePlan
      }
      // ---- shared simulation / lookahead helpers ----
      // Score a resulting board: winning dominates, then cells cleared, chains, low
      // stack — with a steep survival penalty so the CPU never stacks itself out.
      boardScore(o) {
        const b = this.b, topLine = b.cfg.topLineRow, tr = topRow(o.sim);
        if (b.opts.useGoal && belowGoal(o.sim, b.opts.goalRow)) return 1e6 + tr; // winning dominates
        let s = o.cleared * 12 + o.chain * 8 + tr * 1.5;
        const danger = (topLine + 3) - tr;          // > 0 once the stack climbs into the top band
        if (danger > 0) s -= danger * danger * 10;   // quadratic: gentle up high, severe near the line
        if (tr < topLine) s -= 1e5;                  // a placement that overflows the line = effective loss
        if (this.d.smart) s += this.qualityBonus(o.sim); // kaizo: value board health for unknown future pieces
        return s;
      }
      // Static board-quality heuristic (kaizo only): rewards positions that stay
      // workable no matter what falls next — flat surface + "primed" near-matches,
      // minus stranded lone blocks that can never be matched away.
      qualityBonus(grid) {
        const cols = grid[0].length, rows = grid.length;
        const heights = new Array(cols).fill(0), tops = new Array(cols).fill(rows);
        for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) { if (grid[r][c]) { heights[c] = rows - r; tops[c] = r; break; } }
        // bumpiness: jagged surfaces waste future pieces / punch gaps
        let bump = 0;
        for (let c = 1; c < cols; c++) bump += Math.abs(heights[c] - heights[c - 1]);
        // primed groups: same-color clusters one block short of a 4-clear (after a
        // cascade, nothing is >=4, so every group of 3 is "ready to pop")
        let primed = 0;
        for (const g of findGroups(grid, 3)) if (g.length === 3) primed++;
        // stranded singles: a colored block whose 4 neighbours are none its color
        let stranded = 0;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const cell = grid[r][c]; if (!cell || cell.t !== "n") continue;
          let friend = false;
          for (const [dr, dc] of DIRS) { const nr = r + dr, nc = c + dc; if (!inb(grid, nr, nc)) continue; const nb = grid[nr][nc]; if (nb && nb.t === "n" && nb.c === cell.c) { friend = true; break; } }
          if (!friend) stranded++;
        }
        return primed * 8 - bump * 1.1 - stranded * 1.5;
      }
      // Drop a plus (given cells) at column c and resolve; null if it can't go there.
      dropOutcome(grid, cells, c) {
        const sim = cloneGrid(grid); let r = 1;
        if (!canPlace(sim, "plus", { r, c })) return null;
        while (canPlace(sim, "plus", { r: r + 1, c })) r++;
        this.stampSim(sim, cells, { r, c }); applyGravity(sim);
        return this.resolveCascades(sim, 0);
      }
      // Crush columns c, c+1 (iron) and resolve. The crush itself does NOT activate
      // powerups (heavy block), but the cascades it causes are normal matches that do.
      ironOutcome(grid, c) {
        const sim = cloneGrid(grid), coords = laneCoords(sim, [c, c + 1]); if (!coords.length) return null;
        const r = applyClear(sim, coords, false, true); const cleared = r.normals + r.stones; applyGravity(sim);
        return this.resolveCascades(sim, cleared);
      }
      resolveCascades(sim, cleared) {
        let chain = 0, gg = findGroups(sim, this.b.cfg.minGroup);
        while (gg.length) { chain++; const all = []; gg.forEach((x) => x.forEach((co) => all.push(co))); cleared += this.simClearAugs(sim, all, true); applyGravity(sim); gg = findGroups(sim, this.b.cfg.minGroup); }
        return { sim, cleared, chain };
      }
      // Best board score the KNOWN next piece can reach on a hypothetical board (1-ply).
      evalNext(grid) {
        const b = this.b, spec = b.nextSpec; if (!spec) return 0;
        let best = -Infinity;
        if (spec.type === "iron") { for (let c = 0; c < b.cfg.cols - 1; c++) { const o = this.ironOutcome(grid, c); if (o) best = Math.max(best, this.boardScore(o)); } }
        else if (spec.mono) { for (let col = 0; col < b.cfg.colors; col++) { const cells = {}; for (const k of ["C", "U", "D", "L", "R"]) cells[k] = { t: "n", c: col, aug: null }; best = Math.max(best, this.bestImmediate(grid, cells, 1)); } }
        else best = this.bestImmediate(grid, spec.cells, 4);
        return best === -Infinity ? 0 : best;
      }
      bestImmediate(grid, baseCells, rots) {
        const b = this.b, cMin = 1, cMax = b.cfg.cols - 2; let best = -Infinity, cells = { ...baseCells };
        for (let rot = 0; rot < rots; rot++) { if (rot > 0) cells = rotateCellsCW(cells); for (let c = cMin; c <= cMax; c++) { const o = this.dropOutcome(grid, cells, c); if (o) best = Math.max(best, this.boardScore(o)); } }
        return best === -Infinity ? 0 : best;
      }
      stampSim(g, cells, pivot) {
        const { r, c } = pivot, put = (rr, cc, cell) => { if (inb(g, rr, cc)) g[rr][cc] = cell; };
        const keyed = [["C", r, c], ["U", r - 1, c], ["D", r + 1, c], ["L", r, c - 1], ["R", r, c + 1]];
        for (const [k, rr, cc] of keyed) { const cs = cells[k]; put(rr, cc, cs.t === "s" ? S(CONFIG.stoneDurability) : N(cs.c, cs.aug)); }
      }
    }

    // ---------------------------- Renderer -------------------------------
    const SPECIAL_GLYPH = { iron: "⛓", thunder: "⚡", slow: "🐌", crystal: "🌈" };
    class Renderer {
      constructor(board, canvas) {
        this.b = board; this.canvas = canvas; this.ctx = canvas.getContext("2d"); this.cell = board.cfg.cell;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = board.cfg.cols * this.cell * dpr; canvas.height = board.cfg.rows * this.cell * dpr;
        canvas.style.width = board.cfg.cols * this.cell + "px"; canvas.style.height = board.cfg.rows * this.cell + "px";
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      draw() {
        const b = this.b, ctx = this.ctx, cell = this.cell, cols = b.cfg.cols, rows = b.cfg.rows, W = cols * cell, H = rows * cell;
        ctx.clearRect(0, 0, W, H);
        // grid lines only in the visible field; the spawn buffer above the line stays blank
        const topY = b.cfg.topLineRow * cell;
        ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 1;
        for (let c = 0; c <= cols; c++) { ctx.beginPath(); ctx.moveTo(c * cell, topY); ctx.lineTo(c * cell, H); ctx.stroke(); }
        for (let r = b.cfg.topLineRow; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * cell); ctx.lineTo(W, r * cell); ctx.stroke(); }
        const shakeX = (b.shake > 0 && !reducedMotion()) ? (Math.random() * 2 - 1) * 6 * b.shake : 0;
        ctx.save(); ctx.translate(shakeX, 0);
        // blocks render at their animated offset (cell.oy = rows left to fall)
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const x = b.grid[r][c]; if (x) this.drawCell(x, c * cell, (r - (x.oy || 0)) * cell); }
        // flash matched groups just before they clear
        if (b.phase === "flashing") { const k = 0.35 + 0.45 * Math.abs(Math.sin(b.now() * 0.02)); ctx.fillStyle = "rgba(255,255,255," + k + ")"; for (const [r, c] of b.pendingClear) { this.rr(c * cell + 2, r * cell + 2, cell - 4, cell - 4, 6); ctx.fill(); } }
        if (b.piece && b.alive && !b.cleared) this.drawPiece();
        ctx.restore();
        this.drawLine(b.cfg.topLineRow * cell, "#ff4d9d", "TOP");
        if (b.opts.useGoal) this.drawLine((b.opts.goalRow + 1) * cell, "#a25cff", "GOAL"); // line marks the win zone boundary; no goal in Endless
        const now = b.now(); b.fx = b.fx.filter((f) => now - f.t < 240);
        for (const f of b.fx) { const k = 1 - (now - f.t) / 240; ctx.fillStyle = "rgba(255,255,255," + (0.6 * k) + ")"; const s = cell * (1 + (1 - k) * 0.4); ctx.fillRect(f.c * cell + (cell - s) / 2, f.r * cell + (cell - s) / 2, s, s); }
        // stone-break debris: shards arc out under gravity and fade
        if (b.debris.length) {
          b.debris = b.debris.filter((d) => now - d.t < d.life);
          for (const d of b.debris) {
            const e = now - d.t, k = 1 - e / d.life;
            const x = d.x + d.vx * e, y = d.y + d.vy * e + 0.5 * 0.0009 * e * e;
            ctx.save(); ctx.globalAlpha = Math.max(0, k); ctx.translate(x, y); ctx.rotate(d.rot + d.vr * e);
            ctx.fillStyle = "rgb(" + d.shade + "," + (d.shade + 8) + "," + (d.shade + 18) + ")";
            ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size);
            ctx.restore();
          }
          ctx.globalAlpha = 1;
        }
        if (b.shake > 0) b.shake = Math.max(0, b.shake - 0.04);
        if (b.flash && now < b.flash.until) { ctx.fillStyle = b.flash.color; ctx.font = "800 24px Inter, sans-serif"; ctx.textAlign = "center"; ctx.globalAlpha = Math.min(1, (b.flash.until - now) / 400); ctx.fillText(b.flash.text, W / 2, H * 0.4); ctx.globalAlpha = 1; }
        // persistent overlay for an eliminated board (e.g. while other VS players continue)
        if (!b.alive && !b.cleared) { ctx.fillStyle = "rgba(8,9,14,0.62)"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "#ff5d6c"; ctx.font = "800 22px Inter, sans-serif"; ctx.textAlign = "center"; ctx.fillText("TOPPED OUT", W / 2, H * 0.45); }
      }
      drawPiece() {
        const b = this.b, p = b.piece, cell = this.cell, ctx = this.ctx;
        const spawning = b.phase === "spawning";
        // only slide down when there's room below (and not while growing in)
        const off = spawning ? 0 : (!canPlace(b.grid, p.type, { r: p.pivot.r + 1, c: p.pivot.c }) ? 0 : b.fallProgress * cell);
        let restore = false;
        if (spawning) {
          const e = b.spawnT, scale = 0.25 + 0.75 * (1 - (1 - e) * (1 - e)); // ease-out grow
          const ccx = (p.type === "iron" ? p.pivot.c + 1 : p.pivot.c + 0.5) * cell;
          const ccy = (p.type === "iron" ? p.pivot.r + 1 : p.pivot.r + 0.5) * cell;
          ctx.save(); ctx.translate(ccx, ccy); ctx.scale(scale, scale); ctx.translate(-ccx, -ccy); restore = true;
        }
        if (p.type === "iron") {
          for (const [dr, dc] of [[0, 0], [0, 1], [1, 0], [1, 1]]) this.drawIron((p.pivot.c + dc) * cell, (p.pivot.r + dr) * cell + off);
          if (restore) ctx.restore();
          return;
        }
        const cx = p.pivot.c * cell, cy = p.pivot.r * cell + off;
        const drawOne = (cl, x, y) => p.mono ? this.drawCrystal(cl.c, x, y) : this.drawCell(cl, x, y, true);
        drawOne(p.cells.C, cx, cy);
        const ang = p.rotOffset || 0, cos = Math.cos(ang), sin = Math.sin(ang);
        for (const [key, dc, dr] of [["U", 0, -1], ["D", 0, 1], ["L", -1, 0], ["R", 1, 0]]) {
          const rx = dc * cos - dr * sin, ry = dc * sin + dr * cos;
          drawOne(p.cells[key], cx + rx * cell, cy + ry * cell);
        }
        if (restore) ctx.restore();
      }
      drawIron(x, y) {
        const ctx = this.ctx, s = this.cell, pad = 2, X = x + pad, Y = y + pad, W = s - pad * 2, H = s - pad * 2;
        const g = ctx.createLinearGradient(X, Y, X + W, Y + H); g.addColorStop(0, "#aab2c4"); g.addColorStop(1, "#5b6275");
        ctx.fillStyle = g; this.rr(X, Y, W, H, 5); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 2; this.rr(X, Y, W, H, 5); ctx.stroke();
        ctx.fillStyle = "#1a1d27"; ctx.font = "16px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("⛓", x + s / 2, y + s / 2 + 1); ctx.textBaseline = "alphabetic";
      }
      // powerup icon overlaid on a colored block — sits on a dark badge with a light
      // ring so it stays legible on every block color (orange/green included).
      drawAug(aug, cx, cy) {
        const ctx = this.ctx, R = this.cell * 0.3;
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(8,10,16,0.52)"; ctx.fill();
        ctx.lineWidth = 1.4; ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.stroke();
        if (aug === "star") {
          this.star(cx, cy, R * 0.84, "rgba(18,14,2,0.92)"); // dark outline halo
          this.star(cx, cy, R * 0.72, "#ffd23f");
        } else if (aug === "thunder") {
          this.drawBolt(cx, cy, R * 0.9);
        } else { // slow (snail) — solo modes only
          ctx.font = "15px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillStyle = "#fff"; ctx.fillText("🐌", cx, cy + 1);
        }
        ctx.restore();
      }
      // crisp vector lightning bolt (gold fill, dark outline); `s` is half its height
      drawBolt(cx, cy, s) {
        const ctx = this.ctx;
        const pts = [[0.15, -1.0], [-0.741, 0.097], [-0.05, 0.097], [-0.15, 1.0], [0.741, -0.097], [0.05, -0.097]];
        ctx.beginPath();
        pts.forEach(([px, py], i) => { const x = cx + px * s, y = cy + py * s; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.closePath();
        ctx.fillStyle = "#ffe14d"; ctx.fill();
        ctx.lineJoin = "round"; ctx.lineWidth = 1.6; ctx.strokeStyle = "rgba(20,16,2,0.92)"; ctx.stroke();
      }
      // faceted "crystal" look for the active crystal wildcard, tinted by its current color
      drawCrystal(c, x, y) {
        const ctx = this.ctx, s = this.cell, pad = 2, r = 6, X = x + pad, Y = y + pad, W = s - pad * 2, H = s - pad * 2;
        ctx.fillStyle = c < 0 ? "#dfe6f2" : COLOR_HEX[c]; this.rr(X, Y, W, H, r); ctx.fill(); // white when uncolored
        ctx.save(); this.rr(X, Y, W, H, r); ctx.clip();
        ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + W, Y); ctx.lineTo(X, Y + H); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.beginPath(); ctx.moveTo(X + W, Y); ctx.lineTo(X + W, Y + H); ctx.lineTo(X + W * 0.45, Y + H * 0.45); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.beginPath(); ctx.moveTo(X + W, Y + H); ctx.lineTo(X, Y + H); ctx.lineTo(X + W * 0.55, Y + H * 0.55); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.beginPath(); ctx.arc(X + W * 0.5, Y + H * 0.42, 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 2; this.rr(X + 1, Y + 1, W - 2, H - 2, r); ctx.stroke();
      }
      drawLine(y, color, label) { const ctx = this.ctx, W = this.b.cfg.cols * this.cell, yy = Math.max(2, y); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = color; ctx.font = "700 10px Inter, sans-serif"; ctx.textAlign = "left"; ctx.fillText(label, 4, yy < 12 ? yy + 12 : yy - 3); }
      drawCell(cell, x, y, active) {
        const ctx = this.ctx, s = this.cell, pad = 2, r = 6, X = x + pad, Y = y + pad, W = s - pad * 2, H = s - pad * 2;
        const round = (col) => { ctx.fillStyle = col; this.rr(X, Y, W, H, r); ctx.fill(); };
        if (cell.t === "n") { round(COLOR_HEX[cell.c]); ctx.fillStyle = "rgba(255,255,255,0.22)"; this.rr(X, Y, W, H * 0.4, r); ctx.fill(); if (active) { ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 2; this.rr(X, Y, W, H, r); ctx.stroke(); } if (cell.aug) this.drawAug(cell.aug, x + s / 2, y + s / 2); }
        else if (cell.t === "s") {
          const dur = CONFIG.stoneDurability, h = cell.h == null ? dur : cell.h;
          const dmg = dur > 1 ? Math.min(1, Math.max(0, (dur - h) / (dur - 1))) : 0; // 0 pristine .. 1 nearly broken
          if (cell.cs == null) cell.cs = Math.random(); // stable per-block crack seed
          round(this.mix("#828a99", "#434957", dmg)); // body darkens with damage
          ctx.save(); this.rr(X, Y, W, H, r); ctx.clip();
          ctx.fillStyle = "rgba(255,255,255," + (0.16 * (1 - dmg)) + ")"; ctx.fillRect(X, Y, W, H * 0.4); // top sheen fades
          ctx.fillStyle = "rgba(0,0,0," + (0.1 + 0.22 * dmg) + ")"; ctx.fillRect(X, Y + H * 0.6, W, H * 0.4); // bottom bruise grows
          if (dmg > 0) {
            this.drawCracks(X, Y, W, H, dmg, cell.cs);
            if (dmg >= 0.66) { // chunks knocked out of corners when badly broken
              ctx.fillStyle = "rgba(0,0,0,0.42)";
              ctx.beginPath(); ctx.moveTo(X + W, Y); ctx.lineTo(X + W - 8, Y); ctx.lineTo(X + W, Y + 8); ctx.closePath(); ctx.fill();
              ctx.beginPath(); ctx.moveTo(X, Y + H); ctx.lineTo(X + 7, Y + H); ctx.lineTo(X, Y + H - 7); ctx.closePath(); ctx.fill();
            }
          }
          ctx.restore();
          ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1.5; this.rr(X, Y, W, H, r); ctx.stroke();
          ctx.font = "800 18px Inter"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillStyle = "rgba(8,10,16,0.85)"; ctx.fillText(String(h), x + s / 2 + 0.5, y + s / 2 + 1.5);
          ctx.fillStyle = "#eef2f9"; ctx.fillText(String(h), x + s / 2, y + s / 2 + 1); ctx.textBaseline = "alphabetic";
        }
      }
      // colour lerp between two #rrggbb hex strings
      mix(a, b, t) {
        const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
        const ch = (sh) => Math.round(((pa >> sh) & 255) + (((pb >> sh) & 255) - ((pa >> sh) & 255)) * t);
        return "rgb(" + ch(16) + "," + ch(8) + "," + ch(0) + ")";
      }
      // jagged grooved cracks across a stone; more appear as damage rises (seeded so they don't flicker)
      drawCracks(X, Y, W, H, dmg, seed) {
        const ctx = this.ctx;
        let s = ((seed * 1e6) | 0) || 1;
        const rnd = () => { s = (s * 1664525 + 1013904223) | 0; return (s >>> 0) / 4294967296; };
        const nx = (v) => X + v * W, ny = (v) => Y + v * H;
        const cracks = [[[0.46 + (rnd() - 0.5) * 0.18, -0.04], [0.5, 0.3], [0.4 + (rnd() - 0.5) * 0.18, 0.56], [0.54, 0.8], [0.46, 1.04]]];
        if (dmg >= 0.5) cracks.push([[-0.04, 0.44], [0.26, 0.5], [0.5, 0.4], [0.74, 0.52], [1.04, 0.44]]);
        if (dmg >= 0.66) cracks.push([[0.5, 0.5], [0.7, 0.32], [0.64, 0.1], [0.86, -0.04]]);
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        for (const pts of cracks) {
          ctx.beginPath(); ctx.moveTo(nx(pts[0][0]), ny(pts[0][1]));
          for (let j = 1; j < pts.length; j++) ctx.lineTo(nx(pts[j][0]), ny(pts[j][1]));
          ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = 2.4; ctx.stroke();
          ctx.strokeStyle = "rgba(232,237,247,0.22)"; ctx.lineWidth = 0.9; ctx.stroke();
        }
      }
      star(cx, cy, R, color) { const ctx = this.ctx; ctx.fillStyle = color; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = (Math.PI / 5) * i - Math.PI / 2, rad = i % 2 ? R * 0.45 : R; ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); } ctx.closePath(); ctx.fill(); }
      rr(x, y, w, h, r) { const ctx = this.ctx; ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    }

    // Draw a piece spec (the "Next" preview) into a small 3x3 canvas.
    function drawPreview(canvas, spec) {
      const ctx = canvas.getContext("2d"), cell = canvas.width / 3;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!spec) return;
      const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
      const starPath = (cx, cy, R) => { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = Math.PI / 5 * i - Math.PI / 2, rad = i % 2 ? R * 0.45 : R; ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); } ctx.closePath(); };
      const drawAug = (aug, cx, cy) => {
        const R = cell * 0.3;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = "rgba(8,10,16,0.52)"; ctx.fill();
        ctx.lineWidth = 1.2; ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.stroke();
        if (aug === "star") { starPath(cx, cy, R * 0.84); ctx.fillStyle = "rgba(18,14,2,0.92)"; ctx.fill(); starPath(cx, cy, R * 0.72); ctx.fillStyle = "#ffd23f"; ctx.fill(); return; }
        if (aug === "thunder") {
          const s = R * 0.9, pts = [[0.15, -1.0], [-0.741, 0.097], [-0.05, 0.097], [-0.15, 1.0], [0.741, -0.097], [0.05, -0.097]];
          ctx.beginPath(); pts.forEach(([px, py], i) => { const x = cx + px * s, y = cy + py * s; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath();
          ctx.fillStyle = "#ffe14d"; ctx.fill(); ctx.lineJoin = "round"; ctx.lineWidth = 1.3; ctx.strokeStyle = "rgba(20,16,2,0.92)"; ctx.stroke(); return;
        }
        ctx.font = "12px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff"; ctx.fillText("🐌", cx, cy + 1); ctx.textBaseline = "alphabetic";
      };
      // Iron = a 2x2 block in the middle of the preview.
      if (spec.type === "iron") {
        for (const [gx, gy] of [[0.5, 0.5], [1.5, 0.5], [0.5, 1.5], [1.5, 1.5]]) {
          const X = gx * cell + 2, Y = gy * cell + 2, W = cell - 4, H = cell - 4;
          const g = ctx.createLinearGradient(X, Y, X + W, Y + H); g.addColorStop(0, "#aab2c4"); g.addColorStop(1, "#5b6275"); ctx.fillStyle = g; rr(X, Y, W, H, 5); ctx.fill();
        }
        ctx.fillStyle = "#1a1d27"; ctx.font = "16px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("⛓", cell * 1.5, cell * 1.5); ctx.textBaseline = "alphabetic";
        return;
      }
      const cellAt = (key) => spec.mono ? { t: "n", c: spec.crystalColor, aug: null } : spec.cells[key];
      for (const [key, gx, gy] of [["U", 1, 0], ["L", 0, 1], ["C", 1, 1], ["R", 2, 1], ["D", 1, 2]]) {
        const X = gx * cell + 2, Y = gy * cell + 2, W = cell - 4, H = cell - 4, cs = cellAt(key);
        if (cs.t === "s") { ctx.fillStyle = "#6b7280"; }
        else ctx.fillStyle = cs.c < 0 ? "#dfe6f2" : COLOR_HEX[cs.c];
        rr(X, Y, W, H, 5); ctx.fill();
        if (spec.mono) { ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + W, Y); ctx.lineTo(X, Y + H); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 1; rr(X + 0.5, Y + 0.5, W - 1, H - 1, 5); ctx.stroke(); }
        if (cs.t === "n" && cs.aug) drawAug(cs.aug, X + W / 2, Y + H / 2);
      }
    }

    // ------------------------------ Game ---------------------------------
    const SPECIAL_NAME = { iron: "⛓ Iron", crystal: "💎 Crystal", thunder: "⚡ Thunder", slow: "🐌 Slow" };
    class Game {
      constructor(opts) {
        this.opts = opts; this.mode = opts.mode; this.players = []; this.state = "playing"; this.last = 0; this.raf = null;
        this.boardsEl = document.getElementById("boards"); this.boardsEl.innerHTML = "";
        const seed = (Math.random() * 1e9) | 0;
        this.count = this.mode === "vs" ? this.opts.players : 1;
        // VS: every board starts from the SAME garbage structure (fair), colored independently
        if (this.mode === "vs") { this.vsRng = makeRNG(seed + 4242); this.vsStructure = this.genVSStructure(); }
        for (let i = 0; i < this.count; i++) this.players.push(this.makePlayer(i, seed + i * 777));
        document.getElementById("mode-label").textContent = this.modeLabel();
        this.loop = this.loop.bind(this); this.raf = requestAnimationFrame(this.loop);
      }
      modeLabel() { if (this.mode === "stage") return "50-Stage Mode"; if (this.mode === "endless") return "Endless Mode"; const cpus = this.opts.ptypes.slice(0, this.opts.players).filter((t) => t === "cpu").length; const fmtTxt = this.opts.fmt === Infinity ? "∞ infinite" : "first to " + this.opts.fmt; return "VS · " + fmtTxt + " · " + this.opts.players + " players" + (cpus ? " · " + cpus + " CPU" : ""); }
      ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
      lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

      makePlayer(i, seed) {
        const cfg = CONFIG, rng = makeRNG(seed), isVS = this.mode === "vs";
        const board = new Board(cfg, rng, { useGoal: isVS || this.mode === "stage", stage: 0, goalRow: isVS ? cfg.vsGoalLineRow : cfg.goalLineRow });
        board.allowSlow = !isVS; board.allowStars = this.mode === "endless";
        if (this.mode === "stage") { this.setupStage(board, 1); }
        else if (this.mode === "endless") { board.level = 1; board.elapsed = 0; board.fill(cfg.endless.startHeight, cfg.endless.fillDensity, board.stoneRateNow(), cfg.starRate); board.fallMs = cfg.baseFallMs; board.highKey = "demolitionRow_endlessBest"; board.high = parseInt(this.ls(board.highKey) || "0", 10) || 0; board.spawnPiece(); }
        else { board.wins = (this.opts.carryWins && this.opts.carryWins[i]) || 0; board.matchWins = 0; this.setupVSRound(board); }

        const col = document.createElement("div"); col.className = "board-col";
        const hud = document.createElement("div"); hud.className = "hud";
        const isCpu = isVS && this.opts.ptypes[i] === "cpu";
        const name = isVS ? ((isCpu ? "CPU " : "Player ") + (i + 1)) : "You";
        hud.innerHTML =
          '<div class="hud-row"><span class="name">' + name + '</span><span style="display:flex;align-items:center;gap:8px;"><button class="pmute" type="button" title="Mute this board">🔊</button><span class="wins" data-wins></span></span></div>' +
          '<div class="hud-row"><span class="stat">Score <b data-score>0</b></span><span class="stat" data-extra></span></div>' +
          '<div class="meter"><span data-gauge></span></div>' +
          '<div class="hud-row" style="align-items:center;"><span class="special" data-special>&nbsp;</span>' +
            '<span class="stat" style="display:flex;align-items:center;gap:6px;">Next <canvas class="next" width="66" height="66" style="background:#0d0f17;border-radius:6px;"></canvas></span></div>' +
          (this.mode === "endless" ? '<div class="stars" data-stars></div>' : "");
        const canvas = document.createElement("canvas"); canvas.className = "board";
        col.appendChild(hud); col.appendChild(canvas); this.boardsEl.appendChild(col);
        // per-board mute toggle
        const mbtn = hud.querySelector(".pmute");
        mbtn.addEventListener("click", () => { board.muted = !board.muted; mbtn.textContent = board.muted ? "🔇" : "🔊"; mbtn.classList.toggle("off", board.muted); });
        const p = { board, hud, canvas, renderer: new Renderer(board, canvas), nextCanvas: hud.querySelector(".next"), cpu: isCpu ? new CPU(board, (this.opts.diffs && this.opts.diffs[i]) || "normal", makeRNG(seed + 999)) : null, name, isCpu };
        this.fitCanvas(canvas);
        return p;
      }
      fitCanvas(canvas) { const n = this.count || 1; const maxW = this.mode === "vs" ? Math.min(window.innerWidth / n - 18, n >= 3 ? 240 : 300) : Math.min(window.innerWidth - 32, 360); const natural = CONFIG.cols * CONFIG.cell; if (natural > maxW) { const k = maxW / natural; canvas.style.width = natural * k + "px"; canvas.style.height = CONFIG.rows * CONFIG.cell * k + "px"; } }

      setupStage(board, stage) {
        const s = CONFIG.stage; board.opts.stage = stage - 1;
        board.grid = emptyGrid(CONFIG.cols, CONFIG.rows);
        board.fill(Math.min(s.maxHeight, Math.round(s.startHeight + (stage - 1) * s.heightPerStage)), s.fillDensity, board.stoneRateNow(), 0);
        board.fallMs = Math.max(CONFIG.minFallMs, CONFIG.baseFallMs - (stage - 1) * CONFIG.fallDecreasePerStage);
        board.stage = stage; board.cleared = false; board.alive = true; board.pq = []; board.nextSpec = null; board.spawnPiece();
      }
      // One shared garbage layout (occupancy + stone positions) for all boards.
      genVSStructure() {
        const cfg = CONFIG, v = cfg.vs, rng = this.vsRng, cols = cfg.cols, rows = cfg.rows;
        const g = []; for (let r = 0; r < rows; r++) g.push(new Array(cols).fill(0));
        for (let i = 0; i < v.startHeight; i++) { const r = rows - 1 - i; for (let c = 0; c < cols; c++) { if (rng() > v.fillDensity) continue; g[r][c] = rng() < cfg.stoneRate ? 2 : 1; } }
        for (let c = 0; c < cols; c++) { let w = rows - 1; for (let r = rows - 1; r >= 0; r--) { if (g[r][c]) { const t = g[r][c]; g[r][c] = 0; g[w][c] = t; w--; } } }
        return g; // 0 empty · 1 normal · 2 stone
      }
      // Fill a board from the shared structure, coloring normals with the board's
      // own RNG and recoloring to avoid any pre-existing 4+ group (keeps shape identical).
      fillFromStructure(board, st) {
        board.grid = emptyGrid(CONFIG.cols, CONFIG.rows);
        for (let r = 0; r < CONFIG.rows; r++) for (let c = 0; c < CONFIG.cols; c++) { const t = st[r][c]; if (t === 2) board.grid[r][c] = S(CONFIG.stoneDurability); else if (t === 1) board.grid[r][c] = N(board.randColor()); }
        let groups = findGroups(board.grid, CONFIG.minGroup), guard = 0;
        while (groups.length && guard++ < 120) {
          for (const grp of groups) { const [r, c] = grp[0], cur = board.grid[r][c].c; let nc, t = 0; do { nc = board.randColor(); } while (nc === cur && CONFIG.colors > 1 && t++ < 12); board.grid[r][c] = N(nc); }
          groups = findGroups(board.grid, CONFIG.minGroup);
        }
      }
      setupVSRound(board) {
        this.fillFromStructure(board, this.vsStructure);
        board.fallMs = CONFIG.baseFallMs; board.cleared = false; board.alive = true; board.score = 0; board.gauge = 0; board.pq = []; board.nextSpec = null; board.spawnPiece();
      }

      loop(t) {
        this.raf = requestAnimationFrame(this.loop);
        if (!this.last) this.last = t; let dt = t - this.last; this.last = t; if (dt > 100) dt = 100;
        if (this.state === "playing") this.update(dt, t);
        for (const p of this.players) { p.renderer.draw(); drawPreview(p.nextCanvas, p.board.nextSpec); this.updateHud(p); }
      }
      update(dt, t) {
        for (const p of this.players) { p.board.update(dt, t); if (p.cpu) p.cpu.think(t); }
        if (this.mode === "stage") this.updateStage();
        else if (this.mode === "endless") this.updateEndless(dt);
        else this.updateVS();
      }
      updateStage() {
        const b = this.players[0].board;
        if (!b.alive) return this.end("Game Over", "You reached stage " + b.stage + ".\nFinal score: " + b.score);
        if (b.cleared) { if (b.stage >= CONFIG.stage.total) { SFX.matchWin(); return this.end("You Win! 🏆", "Cleared all 50 stages!\nScore: " + b.score); } const next = b.stage + 1; SFX.win(); b.flashBanner("STAGE " + next, "#46e6a0"); this.setupStage(b, next); }
      }
      updateEndless(dt) {
        const b = this.players[0].board; b.elapsed += dt;
        const lvl = Math.min(CONFIG.endless.maxLevel, 1 + Math.floor(b.elapsed / 1000 / CONFIG.endless.levelEverySec));
        if (lvl !== b.level) { b.level = lvl; b.fallMs = Math.max(CONFIG.minFallMs, CONFIG.baseFallMs - (lvl - 1) * CONFIG.fallDecreasePerStage); }
        if (!b.alive) { if (b.score > b.high) { b.high = b.score; this.lsSet(b.highKey, String(b.high)); } return this.end("Game Over", "Level " + b.level + " · Score " + b.score + "\nBest: " + Math.max(b.high, b.score)); }
      }
      updateVS() {
        // every player who reached the goal this frame wins the round — if two or
        // more clear on the same frame it's a genuine shared win (both count).
        const cleared = this.players.filter((p) => p.board.cleared);
        if (cleared.length) return this.vsRoundEnd(cleared);
        // nobody cleared: the round ends once at most one player is still alive.
        // [survivor] wins; [] = everyone topped out the same frame (a draw, no score).
        const alive = this.players.filter((p) => p.board.alive);
        if (alive.length <= 1) return this.vsRoundEnd(alive);
      }
      vsRoundEnd(winners) {
        const won = new Set(winners), shared = winners.length > 1, draw = winners.length === 0;
        winners.forEach((w) => { w.board.wins = (w.board.wins || 0) + 1; w.board.matchWins = (w.board.matchWins || 0) + 1; }); // each tied clearer scores
        this.players.forEach((p) => p.board.flashBanner(draw ? "DRAW" : (won.has(p) ? (shared ? "TIE WIN!" : "WIN!") : "LOSE"), draw ? "#cfd6e6" : (won.has(p) ? "#46e6a0" : "#ff5d6c")));
        this.state = "roundpause";
        const summary = this.players.map((p) => p.name + " " + (p.board.wins || 0)).join(" · ");
        const champs = winners.filter((w) => w.board.matchWins >= this.opts.fmt); // reached first-to-N this round
        const matchOver = champs.length > 0;
        if (matchOver) SFX.matchWin(); else SFX.win();
        if (matchOver) {
          const names = champs.map((w) => w.name).join(" & ");
          const title = champs.length > 1 ? names + " tie for the win! 🏆" : names + " wins the match! 🏆";
          setTimeout(() => this.end(title, summary), 700);
        } else setTimeout(() => { this.vsStructure = this.genVSStructure(); this.players.forEach((p) => this.setupVSRound(p.board)); this.state = "playing"; this.last = 0; }, 1200);
      }
      updateHud(p) {
        const b = p.board, q = (s) => p.hud.querySelector(s);
        q("[data-score]").textContent = b.score;
        q("[data-gauge]").style.width = Math.min(100, (b.gauge / CONFIG.gaugeMax) * 100) + "%";
        const sp = q("[data-special]");
        const nextPow = b.pq && b.pq.length ? b.pq[0] : null; // next powerup waiting in the queue
        sp.innerHTML = nextPow ? ("Banked: <b>" + SPECIAL_NAME[nextPow] + "</b>" + (b.pq.length > 1 ? " +" + (b.pq.length - 1) : "")) : "&nbsp;";
        const w = q("[data-wins]"); if (w) w.textContent = this.mode === "vs" ? "Wins " + (b.wins || 0) + " (match " + (b.matchWins || 0) + "/" + (this.opts.fmt === Infinity ? "∞" : this.opts.fmt) + ")" : "";
        const ex = q("[data-extra]");
        if (this.mode === "stage") ex.innerHTML = "Stage <b>" + b.stage + "</b>/50 · Spd <b>" + (CONFIG.baseFallMs / b.fallMs).toFixed(1) + "x</b>";
        else if (this.mode === "endless") ex.innerHTML = "Lvl <b>" + b.level + "</b> · Best <b>" + Math.max(b.high || 0, b.score) + "</b>";
        else ex.innerHTML = b.bonusActive() ? '<span class="bonus-tag">x20!</span>' : "";
        const st = q("[data-stars]"); if (st) { const filled = "★".repeat(b.starCount) + "☆".repeat(Math.max(0, 3 - b.starCount)); const bonus = b.bonusActive() ? ' · <span class="bonus-tag">x20 ' + Math.ceil((b.bonusUntil - b.now()) / 1000) + "s</span>" : ""; st.innerHTML = "Stars " + filled + " (" + b.starCount + "/3)" + bonus; }
      }
      end(title, msg) { this.state = "result"; cancelAnimationFrame(this.raf); document.getElementById("result-title").textContent = title; document.getElementById("result-msg").textContent = msg; document.getElementById("result").classList.remove("hidden"); }
      pause() { if (this.state !== "playing") return; this.state = "paused"; document.getElementById("pause").classList.remove("hidden"); }
      resume() { if (this.state !== "paused") return; this.state = "playing"; this.last = 0; document.getElementById("pause").classList.add("hidden"); }
      pauseToggle() { if (this.state === "playing") this.pause(); else if (this.state === "paused") this.resume(); }
      destroy() { cancelAnimationFrame(this.raf); }
    }

    // ------------------------------ Input --------------------------------
    // Three control schemes. In VS, scheme i drives board i; in solo modes,
    // ALL schemes drive the single board. Rotate cycles a crystal's color.
    //  P1: A/D · Q/E rotate · W soft · S hard          (matched by e.key)
    //  P2: K/; · O/P rotate · I soft · L hard          (matched by e.key)
    //  P3: numpad 1/3 · 4/6 rotate · 5 soft · 2 hard   (matched by e.code)
    //  P4: ←/→ · ,/. rotate · ↓ soft · ↑ hard          (matched by e.key)
    // Pause: Esc.
    let GAME = null;
    const SCHEMES = [
      { board: 0, by: "key", left: ["a", "A"], right: ["d", "D"], ccw: ["q", "Q"], cw: ["e", "E"], soft: ["w", "W"], hard: ["s", "S"] },
      { board: 1, by: "key", left: ["k", "K"], right: [";"], ccw: ["i", "I"], cw: ["p", "P"], soft: ["o", "O"], hard: ["l", "L"] },
      { board: 2, by: "code", left: ["Numpad1"], right: ["Numpad3"], ccw: ["Numpad4"], cw: ["Numpad6"], soft: ["Numpad5"], hard: ["Numpad2"] },
      { board: 3, by: "key", left: ["ArrowLeft"], right: ["ArrowRight"], ccw: [","], cw: ["."], soft: ["ArrowDown"], hard: ["ArrowUp"] },
    ];
    function schemeAction(s, e) {
      const v = s.by === "code" ? e.code : e.key;
      if (s.left.includes(v)) return "left";
      if (s.right.includes(v)) return "right";
      if (s.ccw.includes(v)) return "ccw";
      if (s.cw.includes(v)) return "cw";
      if (s.soft.includes(v)) return "soft";
      if (s.hard.includes(v)) return "hard";
      return null;
    }
    function boardForScheme(s) {
      const isVS = GAME.mode === "vs";
      const p = isVS ? GAME.players[s.board] : GAME.players[0];
      return p && !p.isCpu ? p.board : null;
    }
    function handleKey(e) {
      if (!GAME) return;
      SFX.resume();
      if (e.key === "Escape") { if (!e.repeat) GAME.pauseToggle(); e.preventDefault(); return; }
      if (GAME.state !== "playing") return;
      for (const s of SCHEMES) {
        const action = schemeAction(s, e); if (!action) continue;
        const b = boardForScheme(s); if (!b) return;
        // only move & soft-drop auto-repeat; rotate/hard fire once per press
        if (e.repeat && action !== "left" && action !== "right" && action !== "soft") return;
        e.preventDefault();
        if (action === "left") b.movePiece(-1);
        else if (action === "right") b.movePiece(1);
        else if (action === "ccw") b.rotatePiece(-1);
        else if (action === "cw") b.rotatePiece(1);
        else if (action === "soft") b.softHeld = true;
        else if (action === "hard") b.hardDrop();
        return;
      }
    }
    function handleKeyUp(e) {
      if (!GAME) return;
      for (const s of SCHEMES) {
        if (schemeAction(s, e) !== "soft") continue;
        const b = boardForScheme(s); if (b) b.softHeld = false;
        return;
      }
    }
    window.addEventListener("keydown", handleKey);
    window.addEventListener("keyup", handleKeyUp);

    // ------------------------------ Menu ---------------------------------
    const menu = document.getElementById("menu");
    const sel = { mode: "stage", players: 2, ptypes: ["human", "cpu", "cpu", "cpu"], diffs: ["normal", "normal", "normal", "normal"], fmt: 2 };
    function pickGroup(id, attr, cb) { document.getElementById(id).addEventListener("click", (e) => { const btn = e.target.closest("button[" + attr + "]"); if (!btn) return; [...e.currentTarget.querySelectorAll("button")].forEach((b) => b.classList.remove("sel")); btn.classList.add("sel"); cb(btn.getAttribute(attr)); }); }
    pickGroup("mode-pick", "data-mode", (v) => { sel.mode = v; document.getElementById("vs-opts").style.display = v === "vs" ? "" : "none"; });
    pickGroup("count-pick", "data-count", (v) => { sel.players = parseInt(v, 10); updateVsOpts(); });
    pickGroup("fmt-pick", "data-fmt", (v) => (sel.fmt = v === "inf" ? Infinity : parseInt(v, 10))); // ∞ = play forever
    // per-slot Human/CPU toggle + per-CPU difficulty dropdown
    document.getElementById("player-rows").addEventListener("click", (e) => {
      const btn = e.target.closest("button.ptoggle"); if (!btn) return;
      const slot = +btn.getAttribute("data-slot");
      sel.ptypes[slot] = sel.ptypes[slot] === "human" ? "cpu" : "human";
      updateVsOpts();
    });
    document.getElementById("player-rows").addEventListener("change", (e) => {
      const s = e.target.closest("select.diffsel"); if (!s) return;
      sel.diffs[+s.getAttribute("data-slot")] = s.value;
    });
    function updateVsOpts() {
      const labels = ["P1", "P2", "P3", "P4"];
      document.querySelectorAll("#player-rows .prow").forEach((row) => {
        const slot = +row.getAttribute("data-slot");
        row.style.display = slot < sel.players ? "" : "none";
        const cpu = sel.ptypes[slot] === "cpu";
        const btn = row.querySelector(".ptoggle");
        btn.textContent = labels[slot] + ": " + (cpu ? "CPU" : "Human");
        btn.classList.toggle("sel", cpu);
        const ds = row.querySelector(".diffsel");
        ds.style.display = cpu ? "" : "none";
        ds.value = sel.diffs[slot];
      });
    }
    updateVsOpts();
    function updateKeysHelp() {
      const el = document.getElementById("keys-help");
      el.innerHTML =
        "<b>P1</b> <kbd>A</kbd><kbd>D</kbd> move · <kbd>Q</kbd>/<kbd>E</kbd> rotate · <kbd>W</kbd> soft · <kbd>S</kbd> hard" +
        "<br><b>P2</b> <kbd>K</kbd><kbd>;</kbd> move · <kbd>I</kbd>/<kbd>P</kbd> rotate · <kbd>O</kbd> soft · <kbd>L</kbd> hard" +
        "<br><b>P3</b> numpad <kbd>1</kbd><kbd>3</kbd> move · <kbd>4</kbd>/<kbd>6</kbd> rotate · <kbd>5</kbd> soft · <kbd>2</kbd> hard" +
        "<br><b>P4</b> <kbd>←</kbd><kbd>→</kbd> move · <kbd>,</kbd>/<kbd>.</kbd> rotate · <kbd>↓</kbd> soft · <kbd>↑</kbd> hard" +
        "<br>solo: any scheme works · <kbd>Esc</kbd> pause";
    }
    updateKeysHelp();

    function toMenu() { if (GAME) GAME.destroy(); document.getElementById("pause").classList.add("hidden"); document.getElementById("result").classList.add("hidden"); document.getElementById("game-area").style.display = "none"; menu.classList.remove("hidden"); }
    function startGame(carryWins) {
      SFX.init(); SFX.resume(); // first run is from a click → satisfies autoplay policy
      menu.classList.add("hidden"); document.getElementById("result").classList.add("hidden"); document.getElementById("pause").classList.add("hidden"); document.getElementById("game-area").style.display = "";
      if (GAME) GAME.destroy(); GAME = new Game({ mode: sel.mode, players: sel.players, ptypes: sel.ptypes.slice(), diffs: sel.diffs.slice(), fmt: sel.fmt, carryWins: carryWins || null });
    }
    document.getElementById("play-btn").addEventListener("click", () => startGame());
    document.getElementById("menu-btn").addEventListener("click", toMenu);
    document.getElementById("pause-btn").addEventListener("click", () => GAME && GAME.pauseToggle());
    // "Play Again" keeps the running head-to-head wins (a continuing series)
    document.getElementById("result-again").addEventListener("click", () => startGame(GAME ? GAME.players.map((p) => p.board.wins || 0) : null));
    document.getElementById("result-menu").addEventListener("click", toMenu);
    document.getElementById("pause-resume").addEventListener("click", () => GAME && GAME.resume());
    document.getElementById("pause-restart").addEventListener("click", () => startGame());
    document.getElementById("pause-menu").addEventListener("click", toMenu);
