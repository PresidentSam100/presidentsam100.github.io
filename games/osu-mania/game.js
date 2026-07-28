(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const setupEl = $("setup"), playEl = $("play"), resultEl = $("result");
  const lanes = [...document.querySelectorAll(".lane")];
  const KEYS_STORAGE = "osumania_keys";
  const IGNORE_CODES = ["ShiftLeft","ShiftRight","ControlLeft","ControlRight","AltLeft","AltRight","MetaLeft","MetaRight","Tab"];
  const LABELS = { Space:"Space", Semicolon:";", Quote:"'", Comma:",", Period:".", Slash:"/",
    BracketLeft:"[", BracketRight:"]", Backslash:"\\", Minus:"-", Equal:"=", Backquote:"`",
    ArrowLeft:"←", ArrowRight:"→", ArrowUp:"↑", ArrowDown:"↓", Enter:"⏎", Backspace:"⌫" };

  function keyLabel(code) {
    if (!code) return "?";
    if (code.indexOf("Key") === 0) return code.slice(3);
    if (code.indexOf("Digit") === 0) return code.slice(5);
    return LABELS[code] || code;
  }
  function defaultKeybinds() { return ["KeyF", "KeyG", "KeyH", "KeyJ"]; }
  function loadKeybinds() {
    try {
      const arr = JSON.parse(localStorage.getItem(KEYS_STORAGE) || "null");
      if (Array.isArray(arr) && arr.length === 4 && new Set(arr).size === 4) return arr;
    } catch (e) {}
    return defaultKeybinds();
  }
  function saveKeybinds() { try { localStorage.setItem(KEYS_STORAGE, JSON.stringify(KEYBINDS)); } catch (e) {} }

  let KEYBINDS = loadKeybinds();
  let rebindCol = -1;

  function renderKeybindButtons() {
    document.querySelectorAll(".keybtn").forEach((b) => {
      const c = +b.dataset.col;
      b.textContent = rebindCol === c ? "…" : keyLabel(KEYBINDS[c]);
      b.classList.toggle("listening", rebindCol === c);
    });
  }
  function applyLaneLabels() {
    lanes.forEach((l) => { const k = l.querySelector(".key"); if (k) k.textContent = keyLabel(KEYBINDS[+l.dataset.col]); });
  }
  renderKeybindButtons();

  const PRECISION_FALL_MS = 1000; // constant fall speed for precision mode (no ramp-up)

  // Density is orthogonal to Mode: Mode decides how a tile is scored,
  // Density decides how often tiles fall (independent of Attack's speed ramp).
  const DENSITIES = {
    sparse: { label: "Sparse", mult: 0.85 },
    normal: { label: "Normal", mult: 0.55 },
    intense: { label: "Intense", mult: 0.35 },
    insane: { label: "Insane", mult: 0.2 },
  };

  let dur = 30;
  let mode = "attack";       // attack | precision
  let density = "normal";    // sparse | normal | intense
  let state = "setup";       // setup | countdown | running | done
  let score = 0, misses = 0, streak = 0, bestStreak = 0, hitTimes = [];
  let hitsCount = 0, judgeCounts = { perfect: 0, great: 0, good: 0, ok: 0 };
  let startT = 0, raf = 0;
  // Multiple tiles can be live at once, one per lane at most — each lane fills
  // and empties independently, so a late/stray press in one lane never
  // touches a tile that's genuinely still falling in another.
  let tiles = [];             // { col, spawnT, duration, el, resolved, lastY, laneH }
  let nextSpawnAt = 0;
  let countdownIv = 0;

  // ---- audio ----
  let actx = null;
  const NOTE = [523.25, 659.25, 783.99, 987.77]; // C5 E5 G5 B5 — one per column
  function tone(freq, dur2, type) {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = type || "triangle"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur2);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur2 + 0.02);
    } catch (e) {}
  }
  function hitSound(col) { tone(NOTE[col], 0.18, "triangle"); }
  function missSound() { tone(110, 0.16, "sawtooth"); }
  function chord(seq) { seq.forEach((f, i) => setTimeout(() => tone(f, 0.22, "triangle"), i * 70)); }
  function selectSound() {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(520, t);
      o.frequency.exponentialRampToValueAtTime(800, t + 0.07);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.13, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.14);
    } catch (e) {}
  }
  function errSound() { tone(220, 0.1, "square"); }

  const bestKey = () => {
    const parts = [];
    if (mode === "precision") parts.push("precision");
    if (density !== "normal") parts.push(density);
    parts.push(dur);
    return "osumania_best_" + parts.join("_");
  };
  const getBest = () => parseFloat(localStorage.getItem(bestKey()) || "0") || 0;
  function showSetupBest() {
    const b = getBest();
    const unit = mode === "precision" ? "points" : "notes";
    $("setupBest").innerHTML = b > 0 ? "Best for " + dur + "s: <b>" + b + " " + unit + "</b>" : "No record yet for this mode/density/duration";
  }

  function defaultHint() {
    return mode === "precision"
      ? "press right when the tile sits fully inside the highlighted key zone — the fuller the overlap, the more points. Bad timing — or pressing an empty lane — breaks your streak!"
      : "click a key above to rebind it — each lane needs a unique key. Pressing a lane with nothing in it counts as a miss!";
  }

  $("modeChoices").addEventListener("click", (e) => {
    const c = e.target.closest(".choice"); if (!c) return;
    mode = c.dataset.mode;
    [...$("modeChoices").children].forEach((x) => x.classList.toggle("sel", x === c));
    selectSound();
    showSetupBest();
    $("setupHint").textContent = defaultHint();
  });

  $("densityChoices").addEventListener("click", (e) => {
    const c = e.target.closest(".choice"); if (!c) return;
    density = c.dataset.density;
    [...$("densityChoices").children].forEach((x) => x.classList.toggle("sel", x === c));
    selectSound();
    showSetupBest();
  });

  $("durChoices").addEventListener("click", (e) => {
    const c = e.target.closest(".choice"); if (!c) return;
    dur = parseInt(c.dataset.dur, 10);
    [...$("durChoices").children].forEach((x) => x.classList.toggle("sel", x === c));
    selectSound();
    showSetupBest();
  });

  // ---- keybind rebinding (setup screen only) ----
  $("keyBinds").addEventListener("click", (e) => {
    const b = e.target.closest(".keybtn"); if (!b || state !== "setup") return;
    rebindCol = +b.dataset.col;
    renderKeybindButtons();
    $("setupHint").textContent = "press any key for lane " + (rebindCol + 1) + "… (Esc to cancel)";
  });

  function show(sec) { [setupEl, playEl, resultEl].forEach((s) => (s.hidden = s !== sec)); }

  // ---- fall speed: attack mode ramps up with score; precision mode holds steady ----
  function fallDuration() {
    if (mode === "precision") return PRECISION_FALL_MS;
    return Math.max(360, 950 - score * 14);
  }
  // How often a new tile can spawn — scaled off the current fall speed so
  // roughly the same number of tiles are in flight at once regardless of
  // difficulty, keeping a contiguous stream rather than one-at-a-time.
  // Density scales that rate independently of Mode/score: Sparse spaces
  // tiles out, Intense/Insane let more lanes fill up at once. The floor is
  // low enough that Insane still stays noticeably faster than Intense even
  // at max Attack-mode difficulty, instead of both clamping to the same value.
  function spawnInterval() {
    const mult = (DENSITIES[density] || DENSITIES.normal).mult;
    return Math.max(120, fallDuration() * mult);
  }

  // Picks which lane the next tile spawns in. Lanes can stack (more than
  // one live tile at once) — capping it at one-per-lane was what made the
  // sequence feel repetitive: whenever only one lane happened to be free,
  // the "random" pick was actually forced, and that kept resolving into
  // the same handful of cycles. Excluding the immediately-previous lane
  // keeps every pick genuinely a 3-way random choice with no back-to-back
  // repeats, instead of relying on raw Math.random() alone (which reliably
  // produces noticeable streaks/cycles to a human ear over a short span).
  let lastSpawnCol = -1;
  function pickSpawnLane() {
    const candidates = [0, 1, 2, 3].filter((c) => c !== lastSpawnCol);
    const col = candidates[Math.floor(Math.random() * candidates.length)];
    lastSpawnCol = col;
    return col;
  }

  function trySpawnTile(now) {
    const col = pickSpawnLane();
    const el = document.createElement("div");
    el.className = "tile";
    lanes[col].appendChild(el);
    tiles.push({ col, spawnT: now, duration: fallDuration(), el, resolved: false, lastY: -el.offsetHeight, laneH: lanes[col].clientHeight });
    return true;
  }

  function removeTile(t) {
    const i = tiles.indexOf(t);
    if (i >= 0) tiles.splice(i, 1);
  }

  // Pops/fades a tile from wherever it actually was (lastY), so the
  // transition never snaps back to the top like a `to`-only keyframe would.
  function clearTileEl(t, kind) {
    const el = t.el, y = t.lastY || 0;
    el.style.transition = "transform .18s ease, opacity .18s ease, filter .22s ease";
    if (kind === "hit") {
      el.style.transform = "translateY(" + y + "px) scale(1.25)";
      el.style.opacity = "0";
    } else {
      el.style.transform = "translateY(" + (y + 10) + "px) scale(.9)";
      el.style.opacity = "0";
      el.style.filter = "saturate(0) brightness(.6)";
    }
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
  }

  // Pressing a lane hits the LOWEST (furthest-fallen, most urgent) tile
  // currently live there — lanes can stack more than one tile at a time
  // now, but a press only ever resolves the one closest to the hit zone;
  // any others still falling in that same lane are untouched.
  function pressCol(col) {
    if (state !== "running") return;
    const inLane = tiles.filter((x) => x.col === col && !x.resolved);
    if (!inLane.length) { registerMiss(null, col); return; } // nothing here — counts as a miss, same as letting a tile expire
    const t = inLane.reduce((lowest, x) => (x.lastY > lowest.lastY ? x : lowest));
    if (mode === "precision") registerPrecisionHit(t); else registerHit(t);
  }

  function registerHit(t) {
    t.resolved = true;
    removeTile(t);
    score++; streak++; if (streak > bestStreak) bestStreak = streak;
    hitTimes.push((performance.now() - startT) / 1000);
    $("vScore").textContent = score;
    $("vStreak").textContent = streak;
    flashLane(t.col, true);
    clearTileEl(t, "hit");
    hitSound(t.col);
  }

  // Score a precision hit by how much of the tile overlaps the key zone at
  // press time: fully inside = PERFECT, partial overlap = graded down, no
  // overlap at all = a miss (same as pressing too early/late).
  function judgeFraction(frac) {
    if (frac >= 1) return { label: "PERFECT", points: 300, cls: "perfect" };
    if (frac >= 0.6) return { label: "GREAT", points: 150, cls: "great" };
    if (frac >= 0.3) return { label: "GOOD", points: 60, cls: "good" };
    if (frac > 0) return { label: "OK", points: 20, cls: "ok" };
    return { label: "MISS", points: 0, cls: "miss" };
  }

  function registerPrecisionHit(t) {
    const col = t.col;
    const laneEl = lanes[col];
    const keyEl = laneEl.querySelector(".key");
    const zoneH = keyEl ? keyEl.offsetHeight : 44;
    const laneHeight = t.laneH || laneEl.clientHeight;
    const th = t.el.offsetHeight;
    const y = t.lastY;
    const zoneTop = laneHeight - zoneH, zoneBottom = laneHeight;
    const overlap = Math.max(0, Math.min(y + th, zoneBottom) - Math.max(y, zoneTop));
    const frac = th > 0 ? Math.min(1, overlap / th) : 0;
    const j = judgeFraction(frac);
    if (j.points <= 0) { registerMiss(t); return; }

    t.resolved = true;
    removeTile(t);
    score += j.points; streak++; if (streak > bestStreak) bestStreak = streak;
    hitsCount++; judgeCounts[j.cls]++;
    hitTimes.push((performance.now() - startT) / 1000);
    $("vScore").textContent = score;
    $("vStreak").textContent = streak;
    flashLane(col, true);
    showJudgment(col, j.label, j.cls);
    clearTileEl(t, "hit");
    hitSound(col);
  }

  function showJudgment(col, label, cls) {
    const l = lanes[col];
    const el = document.createElement("div");
    el.className = "judge " + cls;
    el.textContent = label;
    l.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 620);
  }

  // t is the tile that expired/was pressed-too-early, or null for a press
  // into an empty lane — either way it counts as a miss (col is passed
  // explicitly when t is null).
  function registerMiss(t, col) {
    if (t) { col = t.col; t.resolved = true; removeTile(t); }
    misses++; streak = 0;
    $("vStreak").textContent = "0";
    flashLane(col, false);
    if (mode === "precision") showJudgment(col, "MISS", "miss");
    if (t) clearTileEl(t, "miss");
    missSound();
  }

  function flashLane(col, good) {
    const l = lanes[col];
    l.style.background = good ? "rgba(255,79,168,0.12)" : "rgba(255,93,108,0.14)";
    setTimeout(() => { l.style.background = ""; }, 140);
  }

  function beginCountdown() {
    state = "countdown";
    score = 0; misses = 0; streak = 0; bestStreak = 0; hitTimes = [];
    hitsCount = 0; judgeCounts = { perfect: 0, great: 0, good: 0, ok: 0 };
    $("vScore").textContent = "0"; $("vStreak").textContent = "0";
    $("vTime").textContent = dur.toFixed(1);
    $("timeFill").style.transform = "scaleX(1)";
    $("board").classList.toggle("precision", mode === "precision");
    lanes.forEach((l) => { l.innerHTML = ""; l.appendChild(makeKey(l)); });
    show(playEl);
    let n = 3;
    $("hint").textContent = "get ready… " + n;
    clearInterval(countdownIv);
    countdownIv = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(countdownIv);
        $("hint").textContent = "go!";
        setTimeout(() => { if (state === "running") $("hint").textContent = ""; }, 500);
        beginRun();
      } else {
        $("hint").textContent = "get ready… " + n;
        selectSound();
      }
    }, 500);
  }
  function makeKey(l) {
    const k = document.createElement("div");
    k.className = "key"; k.textContent = keyLabel(KEYBINDS[+l.dataset.col]);
    return k;
  }

  function beginRun() {
    state = "running";
    startT = performance.now();
    tiles = [];
    lastSpawnCol = -1;
    nextSpawnAt = performance.now(); // spawn the first tile immediately
    tickFrame();
  }

  // Pause on "P", NOT Escape — Escape already quits the run further down, and
  // binding both meant the overlay appeared while the game quit underneath.
  // Lane keys are matched on e.code, so "p" only collides if a player rebinds
  // a lane to KeyP; auto-pause stays state-based so a tab-switch always works.
  // Every clock here is anchored to
  // performance.now(), so resuming shifts startT, the next spawn and every
  // in-flight tile by the paused duration; otherwise the whole column would
  // teleport to the judgement line and register a wall of misses.
  let pausedAt = 0;
  const PAUSE = window.GameShell
    ? GameShell.pausable({
        canPause: () => state === "running",
        keys: ["p"],
        onChange: (paused) => {
          if (paused) { pausedAt = performance.now(); return; }
          if (!pausedAt) return;
          const delta = performance.now() - pausedAt;
          pausedAt = 0;
          startT += delta;
          nextSpawnAt += delta;
          for (const t of tiles) t.spawnT += delta;
        }
      })
    : { isPaused: () => false };

  function tickFrame() {
    cancelAnimationFrame(raf);
    const step = () => {
      if (state !== "running") return;
      if (PAUSE.isPaused()) { raf = requestAnimationFrame(step); return; }
      const now = performance.now();
      const elapsed = (now - startT) / 1000;
      const remain = Math.max(0, dur - elapsed);
      $("vTime").textContent = remain.toFixed(1);
      $("timeFill").style.transform = "scaleX(" + Math.max(0, remain / dur) + ")";

      if (now >= nextSpawnAt) {
        trySpawnTile(now);
        nextSpawnAt = now + spawnInterval();
      }

      for (let i = tiles.length - 1; i >= 0; i--) {
        const t = tiles[i];
        const frac = (now - t.spawnT) / t.duration;
        if (frac >= 1) {
          registerMiss(t);
        } else {
          const h = t.laneH || t.el.parentNode.clientHeight;
          const y = -t.el.offsetHeight + frac * (h + t.el.offsetHeight);
          t.el.style.transform = "translateY(" + y + "px)";
          t.lastY = y;
        }
      }

      if (remain <= 0) { finish(); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function finish() {
    cancelAnimationFrame(raf);
    state = "done";
    tiles.forEach((t) => clearTileEl(t, "miss"));
    tiles = [];
    $("finalScore").textContent = score;
    $("finalUnit").textContent = mode === "precision" ? "points" : "notes";
    const r = mode === "precision" ? ratingPrecision(hitsCount > 0 ? score / hitsCount : 0) : rating(score / dur);
    $("rating").textContent = r.t; $("rating").style.color = r.c;
    const hits = mode === "precision" ? hitsCount : score;
    const total = hits + misses;
    const acc = total > 0 ? Math.round((hits / total) * 100) : 0;
    let summary = "";
    if (mode === "precision") {
      // Full judgment breakdown, best to worst, each colored to match its
      // in-lane popup so it's easy to read at a glance.
      summary +=
        '<span class="chip"><b style="color:var(--pink)">' + judgeCounts.perfect + '</b> perfect</span>' +
        '<span class="chip"><b style="color:var(--violet)">' + judgeCounts.great + '</b> great</span>' +
        '<span class="chip"><b style="color:var(--warn)">' + judgeCounts.good + '</b> good</span>' +
        '<span class="chip"><b style="color:var(--muted)">' + judgeCounts.ok + '</b> ok</span>' +
        '<span class="chip"><b style="color:var(--bad)">' + misses + '</b> miss</span>';
    } else {
      summary += '<span class="chip"><b>' + misses + '</b> missed</span>';
    }
    summary +=
      '<span class="chip"><b>' + acc + '%</b> accuracy</span>' +
      '<span class="chip"><b>' + bestStreak + '</b> best streak</span>' +
      '<span class="chip">' + dur + 's</span>';
    $("summary").innerHTML = summary;
    renderGraph();
    const prev = getBest();
    const unit = mode === "precision" ? "points" : "notes";
    if (score > prev) { localStorage.setItem(bestKey(), String(score)); $("newBest").textContent = "★ NEW BEST!"; chord([523.25, 659.25, 783.99, 1046.5]); }
    else { $("newBest").textContent = prev > 0 ? "Best: " + prev + " " + unit : ""; chord([392, 493.88]); }
    show(resultEl);
  }

  function renderGraph() {
    const N = 100, sigma = 0.5;
    const finalRate = (mode === "precision" ? hitsCount : score) / dur;
    const inv = 1 / (sigma * Math.sqrt(2 * Math.PI)), s2 = 2 * sigma * sigma, cut = sigma * 4;
    const cs = [];
    for (const ct of hitTimes) cs.push(ct, -ct, 2 * dur - ct);
    const pts = []; let peak = 0;
    for (let i = 0; i <= N; i++) {
      const t = (dur * i) / N;
      let r = 0;
      for (const c of cs) { const d = t - c; if (d > -cut && d < cut) r += inv * Math.exp(-(d * d) / s2); }
      if (r > peak) peak = r;
      pts.push([t, r]);
    }
    const niceStep = (range) => { const raw = range / 4, mag = Math.pow(10, Math.floor(Math.log10(raw || 1))), n = raw / mag; return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag; };
    const step = niceStep(Math.max(4, peak));
    const niceMax = step * Math.max(1, Math.ceil((peak * 1.05) / step));
    const tStep = dur <= 15 ? 2 : dur <= 30 ? 5 : 10;
    const VW = 300, VH = 134, PL = 30, PR = 12, PT = 10, yBase = 98, midY = (PT + yBase) / 2;
    const X = (t) => PL + (t / dur) * (VW - PL - PR);
    const Y = (c) => PT + (1 - c / niceMax) * (yBase - PT);
    const ps = pts.map((p) => X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1));
    const line = "M" + ps.join(" L");
    const area = "M" + X(0).toFixed(1) + "," + yBase + " L" + ps.join(" L") + " L" + X(dur).toFixed(1) + "," + yBase + " Z";
    let grid = "";
    for (let v = 0; v <= niceMax + 1e-6; v += step) {
      const y = Y(v).toFixed(1);
      grid += '<line x1="' + PL + '" y1="' + y + '" x2="' + (VW - PR) + '" y2="' + y + '" stroke="' + (v === 0 ? "#2a3142" : "#1c2230") + '"/>' +
              '<text x="' + (PL - 5) + '" y="' + (Y(v) + 2.8).toFixed(1) + '" text-anchor="end" fill="#6b7385" font-size="8">' + v + '</text>';
    }
    let xticks = "";
    for (let tt = 0; tt <= dur + 1e-6; tt += tStep) {
      const x = X(tt).toFixed(1);
      xticks += '<line x1="' + x + '" y1="' + PT + '" x2="' + x + '" y2="' + yBase + '" stroke="#161b27"/>' +
                '<text x="' + x + '" y="' + (yBase + 11) + '" text-anchor="middle" fill="#6b7385" font-size="8">' + tt + '</text>';
    }
    const yAvg = Y(finalRate).toFixed(1);
    $("graph").innerHTML =
      '<div class="gtitle">hits per second over time</div>' +
      '<svg class="lg" viewBox="0 0 ' + VW + ' ' + VH + '">' +
        '<defs><linearGradient id="lgF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(255,79,168,.32)"/><stop offset="1" stop-color="rgba(255,79,168,0)"/></linearGradient></defs>' +
        grid + xticks +
        '<path d="' + area + '" fill="url(#lgF)"/>' +
        '<line x1="' + PL + '" y1="' + yAvg + '" x2="' + (VW - PR) + '" y2="' + yAvg + '" stroke="#b06bff" stroke-width="1" stroke-dasharray="4 4" opacity=".65"/>' +
        '<path d="' + line + '" fill="none" stroke="#ff4fa8" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<text transform="rotate(-90 9 ' + midY + ')" x="9" y="' + midY + '" text-anchor="middle" fill="#8b93a7" font-size="8" font-weight="700">hits/s</text>' +
        '<text x="' + ((PL + VW - PR) / 2) + '" y="' + (yBase + 23) + '" text-anchor="middle" fill="#8b93a7" font-size="8" font-weight="700">Time (s)</text>' +
      '</svg>' +
      '<div class="cap">peak <b>' + peak.toFixed(1) + '</b> hits/s &nbsp;·&nbsp; avg <b>' + finalRate.toFixed(1) + '</b> hits/s</div>';
  }

  function rating(r) {
    if (r < 1) return { t: "Warming up", c: "var(--muted)" };
    if (r < 1.6) return { t: "Casual", c: "var(--text)" };
    if (r < 2.2) return { t: "Good rhythm", c: "var(--violet)" };
    if (r < 2.8) return { t: "Fast fingers!", c: "var(--pink)" };
    if (r < 3.4) return { t: "Virtuoso ⚡", c: "var(--warn)" };
    if (r < 4.0) return { t: "Prodigy 🔥", c: "var(--bad)" };
    return { t: "Inhuman? 🎧🤖", c: "var(--bad)" };
  }

  // rated on average points per hit (max 300) rather than throughput, since
  // precision mode rewards accuracy over speed
  function ratingPrecision(avg) {
    if (avg < 60) return { t: "Warming up", c: "var(--muted)" };
    if (avg < 110) return { t: "Casual", c: "var(--text)" };
    if (avg < 170) return { t: "Good rhythm", c: "var(--violet)" };
    if (avg < 230) return { t: "Sharp timing!", c: "var(--pink)" };
    if (avg < 280) return { t: "Virtuoso ⚡", c: "var(--warn)" };
    if (avg < 298) return { t: "Metronomic 🔥", c: "var(--bad)" };
    return { t: "Inhuman? 🎧🤖", c: "var(--bad)" };
  }

  function quit() {
    cancelAnimationFrame(raf);
    clearInterval(countdownIv);
    state = "setup";
    tiles.forEach((t) => { if (t.el && t.el.parentNode) t.el.parentNode.removeChild(t.el); });
    tiles = [];
    show(setupEl);
    showSetupBest();
  }

  // ---- input wiring ----
  lanes.forEach((l) => {
    const col = +l.dataset.col;
    l.addEventListener("pointerdown", (e) => {
      if (state !== "running") return;
      e.preventDefault();
      l.classList.add("kdown"); setTimeout(() => l.classList.remove("kdown"), 90);
      pressCol(col);
    });
  });

  window.addEventListener("keydown", (e) => {
    // Rebind mode intercepts the very next keypress, wherever we are.
    if (rebindCol >= 0) {
      if (e.key === "Escape") {
        rebindCol = -1; renderKeybindButtons();
        $("setupHint").textContent = defaultHint();
        return;
      }
      if (IGNORE_CODES.indexOf(e.code) >= 0) return;
      e.preventDefault();
      const takenBy = KEYBINDS.indexOf(e.code);
      if (takenBy >= 0 && takenBy !== rebindCol) {
        $("setupHint").textContent = keyLabel(e.code) + " is already lane " + (takenBy + 1) + " — try a different key";
        errSound();
        return;
      }
      KEYBINDS[rebindCol] = e.code;
      saveKeybinds();
      rebindCol = -1;
      renderKeybindButtons();
      applyLaneLabels();
      selectSound();
      $("setupHint").textContent = defaultHint();
      return;
    }
    if (e.repeat) return;
    if (e.key === "Escape" && state !== "setup") { quit(); return; }
    const col = KEYBINDS.indexOf(e.code);
    if (col === -1) return;
    if (state !== "running") return;
    e.preventDefault();
    lanes[col].classList.add("kdown"); setTimeout(() => lanes[col].classList.remove("kdown"), 90);
    pressCol(col);
  });

  $("startBtn").addEventListener("click", () => { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} beginCountdown(); });
  $("quitBtn").addEventListener("click", quit);
  $("againBtn").addEventListener("click", beginCountdown);
  $("settingsBtn").addEventListener("click", quit);

  showSetupBest();

  window.__OSU_TEST__ = { getTiles: () => tiles.map((t) => ({ col: t.col, lastY: t.lastY, resolved: t.resolved })) };
})();
