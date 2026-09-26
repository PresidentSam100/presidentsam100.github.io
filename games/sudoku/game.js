/* =====================================================================
   Sudoku — fresh puzzles, graded by the techniques they need.

   - Puzzles come from engine.js, carved in worker.js so an unlucky Expert
     roll never freezes the page; the next one is pre-carved while you play.
   - Each level keeps its own game in progress (sudoku_save_<level>), so
     switching levels never throws one away.
   - Best times per level count only hint-free solves.

   Cells are indexed i = r * 9 + c. `given` marks the clues, `vals` holds
   every digit on the board (clues included) and `notes` are 9-bit pencil
   masks, bit (d - 1) for digit d.
   ===================================================================== */
(function () {
  "use strict";

  const E = window.SudokuEngine;
  const LABEL = { easy: "Easy", medium: "Medium", hard: "Hard", expert: "Expert" };
  // the masthead's weather ear, in the techniques each level asks for
  const FORECAST = {
    easy: "sunny, singles all day",
    medium: "fair, hidden singles later",
    hard: "cloudy, with pointing pairs",
    expert: "storms; X-Wings likely",
  };

  const MIN_SIZE = 300, MAX_SIZE = 500;
  const CHROME_H = 380;       // masthead + HUD + status + pad + tools, kept on screen with the board
  const LOADING_DELAY = 150;  // don't flash "generating…" for a fast puzzle
  const UNDO_CAP = 500;

  // Keys: scores match the hub's "reset all high scores" prefixes
  // (sudoku_best_ / sudoku_stats_); saves and prefs deliberately don't.
  const PREFS_KEY = "sudoku_prefs";
  const saveKey = (lvl) => "sudoku_save_" + lvl;
  const statsKey = (lvl) => "sudoku_stats_" + lvl;
  const bestFor = (lvl) => GameShell.best("sudoku_best_" + lvl, { higher: false });

  const $ = (id) => document.getElementById(id);
  const fieldEl = $("field");
  const boardEl = $("board");
  const loadingEl = $("loading");
  const statusEl = $("status");
  const statsEl = $("stats");
  const timerEl = $("timer");
  const levelTag = $("levelTag");
  const forecastEl = $("forecast");
  const puzzleNoEl = $("puzzleNo");
  const stampEl = $("stamp");
  const stampNote = $("stampNote");
  const sheetEl = document.querySelector(".sheet");
  const pauseBtn = $("pauseBtn");
  const padEl = $("pad");
  const undoBtn = $("undoBtn");
  const eraseBtn = $("eraseBtn");
  const notesBtn = $("notesBtn");
  const notesBadge = $("notesBadge");
  const hintBtn = $("hintBtn");
  const hintBadge = $("hintBadge");
  const newBtn = $("newBtn");
  const levelBtns = Array.from(document.querySelectorAll(".lvl[data-level]"));

  const reduced = () => !!(window.RM_ON && window.RM_ON());

  // ---- prefs -------------------------------------------------------------
  const prefs = { level: "easy" };
  try {
    const saved = JSON.parse(GameShell.store.get(PREFS_KEY, "null"));
    if (saved && LABEL[saved.level]) prefs.level = saved.level;
  } catch (e) {}
  const savePrefs = () => GameShell.store.set(PREFS_KEY, JSON.stringify(prefs));

  // ---- game state --------------------------------------------------------
  let game = null;           // { level, puzzle, solution, tier, hints }
  let given = new Uint8Array(81);
  let vals = new Uint8Array(81);
  let notes = new Uint16Array(81);
  const conflict = new Uint8Array(81);
  let state = "loading";     // "loading" | "playing" | "won"
  let sel = -1;
  let notesMode = false;
  let undoStack = [];
  let elapsedMs = 0, runningSince = 0, tickTimer = 0;

  // ---- board + pad DOM (built once) -------------------------------------
  // The DOM nests cells in their boxes so the gaps can draw the thick
  // lines; els[] maps back to row-major order.
  const els = new Array(81);
  (function build() {
    const frag = document.createDocumentFragment();
    for (let b = 0; b < 9; b++) {
      const box = document.createElement("div");
      box.className = "box";
      for (let k = 0; k < 9; k++) {
        const r = ((b / 3) | 0) * 3 + ((k / 3) | 0);
        const c = (b % 3) * 3 + (k % 3);
        const el = document.createElement("div");
        el.className = "c";
        el.dataset.i = r * 9 + c;
        els[r * 9 + c] = el;
        box.appendChild(el);
      }
      frag.appendChild(box);
    }
    boardEl.appendChild(frag);
  })();

  const keys = [];
  for (let d = 1; d <= 9; d++) {
    const k = document.createElement("button");
    k.type = "button";
    k.className = "key";
    k.dataset.d = d;
    k.innerHTML = d + "<small></small>";
    padEl.appendChild(k);
    keys[d] = k;
  }

  // ---- sound (Web Audio, generated; mute-toggle.js gates the output) -----
  let actx = null;
  function ensureAudio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { actx = null; }
    }
    if (actx && actx.state === "suspended") actx.resume();
  }
  function tone(f0, f1, dur, type, vol, delay) {
    if (!actx) return;
    const t = actx.currentTime + (delay || 0);
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + dur);
  }
  // each digit plays its own note, G4 up to A5
  const NOTE = [0, 392, 440, 494, 523, 587, 659, 698, 784, 880];
  const sfx = {
    place(d) { tone(NOTE[d], NOTE[d], 0.1, "triangle", 0.12); },
    pencil() { tone(1500, 1500, 0.03, "sine", 0.05); },
    erase() { tone(420, 300, 0.07, "triangle", 0.09); },
    undo() { tone(520, 390, 0.07, "triangle", 0.08); },
    bad() { tone(190, 140, 0.16, "sawtooth", 0.07); },
    stamp() { tone(140, 55, 0.14, "sine", 0.3); tone(900, 300, 0.04, "square", 0.03); },
    unit() {
      tone(659, 659, 0.12, "triangle", 0.12, 0);
      tone(784, 784, 0.12, "triangle", 0.12, 0.07);
      tone(988, 988, 0.18, "triangle", 0.12, 0.14);
    },
    hint() { tone(988, 1319, 0.12, "sine", 0.1); tone(1319, 1760, 0.14, "sine", 0.07, 0.08); },
    win() {
      tone(523, 523, 0.14, "triangle", 0.2, 0.0);
      tone(659, 659, 0.14, "triangle", 0.2, 0.11);
      tone(784, 784, 0.14, "triangle", 0.2, 0.22);
      tone(1047, 1047, 0.14, "triangle", 0.2, 0.33);
      tone(1319, 1319, 0.5, "triangle", 0.22, 0.44);
    },
  };

  // ---- puzzle supply -----------------------------------------------------
  // The worker carves puzzles off the main thread; one spare per level is
  // kept ready so "New puzzle" is instant. If the worker can't start (file://,
  // old browser) the page carves its own.
  let worker = null, reqId = 0;
  const waiting = new Map();
  try {
    worker = new Worker("worker.js");
    worker.onmessage = (e) => {
      const res = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      if (res) res(e.data);
    };
    worker.onerror = () => {
      worker = null;
      for (const [id, res] of waiting) res(generateHere(res.level));
      waiting.clear();
    };
  } catch (e) {
    worker = null;
  }

  function generateHere(level) {
    return E.generate(level, Math.random);
  }

  function carve(level) {
    if (!worker) {
      // let "generating…" paint before the page blocks
      return new Promise((res) => setTimeout(() => res(generateHere(level)), 30));
    }
    return new Promise((res) => {
      const id = ++reqId;
      res.level = level;
      waiting.set(id, res);
      worker.postMessage({ id, level });
    });
  }

  const spare = {}, inflight = {};
  function prefetch(level) {
    if (spare[level] || inflight[level]) return;
    inflight[level] = carve(level).then((g) => {
      spare[level] = g;
      inflight[level] = null;
    });
  }
  function fetchPuzzle(level) {
    if (spare[level]) {
      const g = spare[level];
      spare[level] = null;
      return Promise.resolve(g);
    }
    if (inflight[level]) return inflight[level].then(() => fetchPuzzle(level));
    return carve(level);
  }

  // ---- layout ------------------------------------------------------------
  // The sheet's padding changes at the narrow-screen breakpoint, so measure
  // its content box rather than assume a gutter.
  function layout() {
    const cs = getComputedStyle(sheetEl);
    const inner = sheetEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const w = Math.min(inner, MAX_SIZE);
    const h = window.innerHeight - CHROME_H;
    const size = Math.floor(Math.min(w, Math.max(h, MIN_SIZE)));
    document.documentElement.style.setProperty("--size", size + "px");
  }

  // ---- painting ----------------------------------------------------------
  // Short-lived effect classes (fill pop, unit flash, hint ring, win wave)
  // live here so a repaint mid-animation doesn't strip them.
  const fxCls = new Array(81).fill("");
  const fxUntil = new Float64Array(81);
  function fx(i, cls, ms, delay) {
    delay = delay || 0;
    fxCls[i] = cls;
    fxUntil[i] = performance.now() + ms + delay;
    els[i].style.setProperty("--d", delay + "ms");
    setTimeout(() => {
      if (fxCls[i] === cls && performance.now() >= fxUntil[i] - 5) {
        fxCls[i] = "";
        paint(i);
      }
    }, ms + delay + 30);
  }

  function computeConflicts() {
    conflict.fill(0);
    const first = new Int8Array(10);
    for (const unit of E.UNITS) {
      first.fill(-1);
      for (const i of unit) {
        const v = vals[i];
        if (!v) continue;
        if (first[v] >= 0) { conflict[i] = 1; conflict[first[v]] = 1; }
        else first[v] = i;
      }
    }
  }

  function paint(i) {
    const el = els[i];
    const v = vals[i];
    const selVal = sel >= 0 ? vals[sel] : 0;
    let cls = "c";
    if (given[i]) cls += " given";
    if (sel >= 0) {
      if (i === sel) cls += " sel";
      else if (selVal && v === selVal) cls += " same";
      else if (E.ROW_OF[i] === E.ROW_OF[sel] || E.COL_OF[i] === E.COL_OF[sel] || E.BOX_OF[i] === E.BOX_OF[sel]) cls += " peer";
    }
    if (conflict[i]) cls += given[i] ? " clash" : " bad";
    if (fxCls[i]) cls += " " + fxCls[i];
    if (el.className !== cls) el.className = cls;

    let html = "";
    if (v) {
      html = '<span class="v">' + v + "</span>";
    } else if (notes[i]) {
      html = '<div class="notes">';
      for (let d = 1; d <= 9; d++) {
        if (!(notes[i] & (1 << (d - 1)))) html += "<span></span>";
        else if (d === selVal) html += '<span class="hl">' + d + "</span>";
        else html += "<span>" + d + "</span>";
      }
      html += "</div>";
    }
    if (el._html !== html) {
      el.innerHTML = html;
      el._html = html;
    }
  }

  function renderPad() {
    const count = new Uint8Array(10);
    for (let i = 0; i < 81; i++) count[vals[i]]++;
    for (let d = 1; d <= 9; d++) {
      const left = 9 - count[d];
      keys[d].classList.toggle("done", left <= 0);
      keys[d].lastChild.textContent = left > 0 ? left : "";
      keys[d].setAttribute("aria-label", (notesMode ? "Note " : "Digit ") + d + (left > 0 ? ", " + left + " left" : ", all placed"));
    }
    padEl.classList.toggle("notes-on", notesMode);
  }

  function renderTools() {
    notesBtn.setAttribute("aria-pressed", notesMode ? "true" : "false");
    notesBadge.textContent = notesMode ? "on" : "off";
    const h = game ? game.hints : 0;
    hintBadge.hidden = !h;
    hintBadge.textContent = h;
    undoBtn.disabled = !undoStack.length || state !== "playing";
  }

  function renderAll() {
    for (let i = 0; i < 81; i++) paint(i);
    renderPad();
    renderTools();
  }

  function setStatus(text, tone) {
    statusEl.textContent = text;
    statusEl.className = tone || "";
  }

  // A stable "issue number" per puzzle, so a resumed game keeps its number.
  function puzzleNo(puzzle) {
    let h = 2166136261;
    for (const v of puzzle) h = Math.imul(h ^ v, 16777619);
    return 1000 + ((h >>> 0) % 9000);
  }

  function renderLevel() {
    levelBtns.forEach((b) => b.classList.toggle("sel", b.dataset.level === prefs.level));
    const ready = game && game.level === prefs.level && state !== "loading";
    const clues = ready ? given.reduce((a, b) => a + b, 0) : 0;
    levelTag.innerHTML = LABEL[prefs.level] + (clues ? "<small>" + clues + " clues</small>" : "");
    forecastEl.textContent = FORECAST[prefs.level];
    puzzleNoEl.textContent = "No. " + (ready ? puzzleNo(game.puzzle) : "—");
  }

  function hideStamp() {
    clearTimeout(stampTimer);
    stampEl.hidden = true;
  }

  function readStats(lvl) {
    try {
      const s = JSON.parse(GameShell.store.get(statsKey(lvl), "null"));
      if (s && typeof s === "object") return { w: s.w | 0 };
    } catch (e) {}
    return { w: 0 };
  }
  function addSolved(lvl) {
    const s = readStats(lvl);
    s.w++;
    GameShell.store.set(statsKey(lvl), JSON.stringify(s));
  }
  function renderStats() {
    const best = bestFor(prefs.level).get();   // 0 means "no time yet"
    statsEl.innerHTML =
      "<b>" + LABEL[prefs.level] + "</b> · best <b>" + (best > 0 ? fmt(best * 1000) : "—") +
      "</b> · solved " + readStats(prefs.level).w;
  }

  // ---- clock -------------------------------------------------------------
  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    const two = (n) => String(n).padStart(2, "0");
    return h ? h + ":" + two(m) + ":" + two(ss) : m + ":" + two(ss);
  }
  function elapsed() {
    return elapsedMs + (runningSince ? performance.now() - runningSince : 0);
  }
  function renderTime() { timerEl.textContent = fmt(elapsed()); }
  function startClock() {
    if (runningSince) return;
    runningSince = performance.now();
    tickTimer = setInterval(renderTime, 250);
  }
  function stopClock() {
    if (runningSince) elapsedMs += performance.now() - runningSince;
    runningSince = 0;
    clearInterval(tickTimer);
    renderTime();
  }

  // ---- save / resume -----------------------------------------------------
  function save() {
    if (!game || state !== "playing") return;
    GameShell.store.set(saveKey(game.level), JSON.stringify({
      p: game.puzzle.join(""),
      s: game.solution.join(""),
      g: Array.from(vals).join(""),
      n: Array.from(notes),
      t: Math.round(elapsed()),
      h: game.hints,
      tier: game.tier,
    }));
  }

  // Anything malformed or tampered with is dropped, never half-loaded.
  function loadSave(lvl) {
    try {
      const o = JSON.parse(GameShell.store.get(saveKey(lvl), "null"));
      if (!o || typeof o !== "object") return null;
      const grid = (s, zeros) =>
        typeof s === "string" && s.length === 81 && (zeros ? /^[0-9]+$/ : /^[1-9]+$/).test(s)
          ? Array.from(s, Number) : null;
      const p = grid(o.p, true), s = grid(o.s, false), g = grid(o.g, true);
      if (!p || !s || !g) return null;
      if (E.countSolutions(s, 2) !== 1) return null;           // not a valid solved grid
      let open = 0;
      for (let i = 0; i < 81; i++) {
        if (p[i] && (p[i] !== s[i] || g[i] !== p[i])) return null;
        if (g[i] !== s[i]) open++;
      }
      if (!open) return null;                                  // already solved
      const n = Array.isArray(o.n) && o.n.length === 81
        ? o.n.map((x) => (Number.isInteger(x) && x >= 0 && x <= 511 ? x : 0))
        : new Array(81).fill(0);
      return {
        puzzle: { puzzle: p, solution: s, level: lvl, tier: o.tier | 0 },
        vals: g,
        notes: n,
        t: isFinite(o.t) && o.t > 0 ? +o.t : 0,
        h: Math.max(0, o.h | 0),
      };
    } catch (e) {
      return null;
    }
  }

  const hasProgress = () => {
    for (let i = 0; i < 81; i++) if (!given[i] && (vals[i] || notes[i])) return true;
    return false;
  };

  // ---- starting games ----------------------------------------------------
  let loadToken = 0, loadingTimer = 0, stampTimer = 0;

  function startGame(g, saved) {
    clearTimeout(loadingTimer);
    loadingEl.hidden = true;
    game = { level: g.level, puzzle: g.puzzle, solution: g.solution, tier: g.tier, hints: saved ? saved.h : 0 };
    given = Uint8Array.from(g.puzzle, (v) => (v ? 1 : 0));
    vals = Uint8Array.from(saved ? saved.vals : g.puzzle);
    notes = Uint16Array.from(saved ? saved.notes : new Array(81).fill(0));
    undoStack = [];
    sel = -1;
    stopClock();
    elapsedMs = saved ? saved.t : 0;
    state = "playing";
    fxCls.fill("");
    fieldEl.classList.remove("won");
    hideStamp();
    computeConflicts();
    renderAll();
    renderLevel();
    renderStats();
    renderTime();
    setStatus(saved && hasProgress() ? "Picked up your " + LABEL[g.level] + " game where you left off." : "");
    if (!PAUSE.isPaused()) startClock();
    save();
    prefetch(g.level);
  }

  // Switch to `lvl`: resume its saved game, or carve a new one.
  function openLevel(lvl, fresh) {
    PAUSE.resume();   // before stopClock: resuming restarts the clock
    save();
    stopClock();
    prefs.level = lvl;
    savePrefs();
    const token = ++loadToken;
    const saved = fresh ? null : loadSave(lvl);
    if (fresh) GameShell.store.remove(saveKey(lvl));
    if (saved) return startGame(saved.puzzle, saved);

    state = "loading";
    game = null;
    given = new Uint8Array(81);
    vals = new Uint8Array(81);
    notes = new Uint16Array(81);
    undoStack = [];
    sel = -1;
    elapsedMs = 0;
    fieldEl.classList.remove("won");
    hideStamp();
    computeConflicts();
    renderAll();
    renderLevel();
    renderStats();
    renderTime();
    setStatus("");
    clearTimeout(loadingTimer);
    loadingTimer = setTimeout(() => { loadingEl.hidden = false; }, LOADING_DELAY);
    fetchPuzzle(lvl).then((g) => {
      if (token === loadToken) startGame(g, null);
      else if (!spare[g.level]) spare[g.level] = g;   // player moved on; keep it for later
    });
  }

  // ---- moves -------------------------------------------------------------
  const live = () => state === "playing" && !PAUSE.isPaused();

  // `changes` holds each touched cell's PREVIOUS value and notes.
  function commit(changes) {
    undoStack.push(changes);
    if (undoStack.length > UNDO_CAP) undoStack.shift();
    computeConflicts();
    save();
  }

  function setDigit(i, d, quiet) {
    const bit = 1 << (d - 1);
    const changes = [{ i, v: vals[i], n: notes[i] }];
    vals[i] = d;
    notes[i] = 0;
    // placing a digit rules it out of every note that can see it
    for (const p of E.PEERS[i]) {
      if (!vals[p] && notes[p] & bit) {
        changes.push({ i: p, v: 0, n: notes[p] });
        notes[p] &= ~bit;
      }
    }
    commit(changes);
    fx(i, "fill", 220);
    if (!quiet) {
      if (conflict[i]) sfx.bad();
      else sfx.place(d);
    }
    afterFill(i);
  }

  function afterFill(i) {
    let full = true, clean = true;
    for (let j = 0; j < 81; j++) {
      if (!vals[j]) full = false;
      if (conflict[j]) clean = false;
    }
    // A full grid with no clashes is the (unique) answer.
    if (full && clean) return win(i);
    if (full) return setStatus("Every square is filled, but some digits clash — look for the red ones.", "bad");

    const fxOn = !reduced();
    let done = 0;
    for (const u of [E.ROW_OF[i], 9 + E.COL_OF[i], 18 + E.BOX_OF[i]]) {
      const cells = E.UNITS[u];
      if (!cells.every((j) => vals[j] && !conflict[j])) continue;
      done++;
      if (fxOn) {
        for (const j of cells) {
          const dist = Math.max(Math.abs(E.ROW_OF[j] - E.ROW_OF[i]), Math.abs(E.COL_OF[j] - E.COL_OF[i]));
          fx(j, "unit", 520, dist * 45);
        }
      }
    }
    if (done) sfx.unit();
  }

  function input(d, asNote) {
    if (!live()) return;
    ensureAudio();
    if (sel < 0) return setStatus("Pick a square first.", "info");
    if (given[sel]) return;
    setStatus("");
    if (asNote || notesMode) {
      if (vals[sel]) return setStatus("Clear this square before pencilling in notes.", "info");
      const ch = [{ i: sel, v: 0, n: notes[sel] }];
      notes[sel] ^= 1 << (d - 1);
      commit(ch);
      sfx.pencil();
    } else if (vals[sel] === d) {
      eraseAt(sel);   // tapping the same digit again takes it back
    } else {
      setDigit(sel, d);
    }
    renderAll();
  }

  function eraseAt(i) {
    if (!live() || i < 0 || given[i] || (!vals[i] && !notes[i])) return;
    const ch = [{ i, v: vals[i], n: notes[i] }];
    if (vals[i]) vals[i] = 0;
    else notes[i] = 0;
    commit(ch);
    sfx.erase();
  }

  function undo() {
    if (!live() || !undoStack.length) return;
    ensureAudio();
    const ch = undoStack.pop();
    for (let k = ch.length - 1; k >= 0; k--) {
      vals[ch[k].i] = ch[k].v;
      notes[ch[k].i] = ch[k].n;
    }
    sel = ch[0].i;
    computeConflicts();
    save();
    sfx.undo();
    setStatus("");
    renderAll();
  }

  function toggleNotesMode() {
    notesMode = !notesMode;
    renderPad();
    renderTools();
  }

  function moveSel(dr, dc) {
    if (state !== "playing") return;
    if (sel < 0) sel = 40;
    else sel = ((E.ROW_OF[sel] + dr + 9) % 9) * 9 + ((E.COL_OF[sel] + dc + 9) % 9);
    renderAll();
  }

  // ---- hints -------------------------------------------------------------
  // Mistakes first (a wrong digit poisons every deduction after it), then
  // notes that have lost the answer, then the next square a person could
  // find, with the technique that finds it.
  const TECH = {
    "locked candidates": "locked candidates",
    "naked pair": "a naked pair",
    "hidden pair": "a hidden pair",
    "naked triple": "a naked triple",
    "hidden triple": "a hidden triple",
    "X-Wing": "an X-Wing",
    "XY-Wing": "an XY-Wing",
    "XYZ-Wing": "an XYZ-Wing",
    "Swordfish": "a Swordfish",
  };
  const HINT = "\u261E\uFE0E ";   // printer's fist; FE0E keeps it out of emoji fonts
  const unitName = (u) => (u < 9 ? "row " + (u + 1) : u < 18 ? "column " + (u - 8) : "this box");

  function flagCells(list, text) {
    const i = list.indexOf(sel) >= 0 ? sel : list[0];
    sel = i;
    fx(i, "oops", 1800);
    sfx.bad();
    useHint();
    setStatus(text + (list.length > 1 ? " (" + (list.length - 1) + " more like it)" : ""), "bad");
    renderAll();
  }

  function useHint() {
    game.hints++;
    save();
  }

  function hint() {
    if (!live()) return;
    ensureAudio();
    const sol = game.solution;

    const wrong = [], lost = [];
    for (let i = 0; i < 81; i++) {
      if (given[i]) continue;
      if (vals[i] && vals[i] !== sol[i]) wrong.push(i);
      else if (!vals[i] && notes[i] && !(notes[i] & (1 << (sol[i] - 1)))) lost.push(i);
    }
    if (wrong.length) return flagCells(wrong, HINT + "That " + vals[wrong.indexOf(sel) >= 0 ? sel : wrong[0]] + " doesn't belong here — clear it and look again.");
    if (lost.length) return flagCells(lost, HINT + "Your notes here have ruled out the answer.");

    const step = E.nextStep(Array.from(vals));
    let i, msg;
    if (step) {
      i = step.i;
      msg = step.how === "hidden"
        ? step.d + " has only one place left in " + unitName(step.unit) + "."
        : step.d + " is the only digit that fits here.";
      if (step.via.length) msg = "Using " + step.via.map((n) => TECH[n] || n).join(" and ") + ", " + msg;
      else msg = msg.charAt(0).toUpperCase() + msg.slice(1);
    } else {
      // past what the grader can explain — just give the square
      i = sel >= 0 && !vals[sel] ? sel : vals.indexOf(0);
      msg = "Here's a " + sol[i] + ".";
    }
    useHint();
    sel = i;
    setStatus(HINT + msg, "info");
    sfx.hint();
    setDigit(i, sol[i], true);   // a win here overwrites the hint message
    fx(i, "hinted", 1100);
    renderAll();
  }

  // ---- win ---------------------------------------------------------------
  function win(last) {
    state = "won";
    stopClock();
    GameShell.store.remove(saveKey(game.level));
    sel = -1;

    // floor at 1: best().get() reads a stored 0 as "no time yet"
    const secs = Math.max(1, Math.round(elapsed() / 1000));
    timerEl.textContent = fmt(secs * 1000);   // the clock floors; match the stamp
    const hintNote = game.hints + " hint" + (game.hints === 1 ? "" : "s");
    let msg = "Solved in " + fmt(secs * 1000);
    let note = fmt(secs * 1000);
    if (game.hints) {
      msg += " with " + hintNote + " (unranked)";
      note += " · " + hintNote;
    } else if (bestFor(game.level).submit(secs)) {
      msg += " — new best!";
      note += " · new best";
    }
    addSolved(game.level);

    fieldEl.classList.add("won");
    // the stamp comes down once the ripple has crossed the board
    stampNote.textContent = note;
    clearTimeout(stampTimer);
    stampTimer = setTimeout(() => {
      if (state !== "won") return;
      stampEl.hidden = false;
      sfx.stamp();
    }, reduced() ? 0 : 750);
    if (!reduced()) {
      for (let j = 0; j < 81; j++) {
        const dist = Math.max(Math.abs(E.ROW_OF[j] - E.ROW_OF[last]), Math.abs(E.COL_OF[j] - E.COL_OF[last]));
        fx(j, "win", 600, dist * 60);
      }
    }
    sfx.win();
    setStatus(msg, "good");
    renderAll();
    renderStats();
  }

  // ---- pause -------------------------------------------------------------
  // Only while the clock runs. The shared overlay is see-through, so the
  // board is blurred too; otherwise pausing is free thinking time.
  const PAUSE = GameShell.pausable({
    canPause: () => state === "playing",
    onChange: (paused) => {
      fieldEl.classList.toggle("paused", paused);
      pauseBtn.textContent = paused ? "\u25B6\uFE0E" : "\u23F8\uFE0E";
      pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
      if (paused) {
        stopClock();
        save();
      } else if (state === "playing") {
        startClock();
      }
    },
  });

  // ---- input wiring ------------------------------------------------------
  boardEl.addEventListener("pointerdown", (e) => {
    const el = e.target.closest ? e.target.closest(".c") : null;
    if (!el || state !== "playing" || PAUSE.isPaused()) return;
    ensureAudio();
    sel = +el.dataset.i;
    renderAll();
  });

  // Pad and tool buttons don't take focus from a mouse, so a stray Space
  // afterwards can't re-press them. Keyboard users can still Tab to them.
  for (const el of [padEl, document.querySelector(".tools")]) {
    el.addEventListener("mousedown", (e) => e.preventDefault());
  }
  padEl.addEventListener("click", (e) => {
    const k = e.target.closest(".key");
    if (k) input(+k.dataset.d);
  });
  undoBtn.addEventListener("click", undo);
  eraseBtn.addEventListener("click", () => {
    if (!live()) return;
    ensureAudio();
    eraseAt(sel);
    setStatus("");
    renderAll();
  });
  notesBtn.addEventListener("click", toggleNotesMode);
  hintBtn.addEventListener("click", hint);
  pauseBtn.addEventListener("click", () => PAUSE.toggle());

  const ARROWS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  document.addEventListener("keydown", (e) => {
    const t = e.target;
    if (t && (t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable ||
        (t.tagName === "INPUT" && t.type !== "checkbox"))) return;
    if (PAUSE.isPaused()) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      undo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (ARROWS[k]) {
      e.preventDefault();
      moveSel(ARROWS[k][0], ARROWS[k][1]);
      return;
    }
    // e.code, not e.key: Shift+1 reads as "!" in e.key
    const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code || "");
    const d = m ? +m[1] : /^[0-9]$/.test(k) ? +k : -1;
    if (d > 0) {
      e.preventDefault();
      if (!e.repeat) input(d, e.shiftKey);
    } else if (d === 0 || k === "Backspace" || k === "Delete") {
      e.preventDefault();
      if (e.repeat || !live()) return;
      ensureAudio();
      eraseAt(sel);
      renderAll();
    } else if ((k === "n" || k === "N") && !e.repeat) {
      e.preventDefault();
      toggleNotesMode();
    }
  });

  levelBtns.forEach((b) => {
    b.addEventListener("click", () => {
      const lvl = b.dataset.level;
      if (lvl === prefs.level && state !== "won") return;
      ensureAudio();
      openLevel(lvl, state === "won" && lvl === prefs.level);
    });
  });

  // No confirm() dialog: its window blur would auto-pause the game.
  // A second tap within a few seconds confirms instead.
  let armed = 0;
  const NEW_LABEL = newBtn.textContent;
  newBtn.addEventListener("click", () => {
    ensureAudio();
    if (state === "playing" && hasProgress() && !armed) {
      newBtn.textContent = "Tap again to scrap this one";
      armed = setTimeout(() => { armed = 0; newBtn.textContent = NEW_LABEL; }, 3000);
      return;
    }
    clearTimeout(armed);
    armed = 0;
    newBtn.textContent = NEW_LABEL;
    openLevel(prefs.level, true);
  });

  window.addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 100);
  });

  $("dateline").textContent = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  layout();
  openLevel(prefs.level, false);
})();
