/* =====================================================================
   Minesweeper Endless — the field scrolls down toward a red line.

   When a row touches the line it's judged: an unflagged mine goes off,
   and so does a flag on a safe tile (otherwise flagging everything
   would win). Digging a mine is fatal too. One life.

   Rows have absolute indices r = 0, 1, 2 … counting up from the bottom
   of the first screen, and `pos` is how many rows the field has moved,
   so row r is judged once pos > r. Rows are generated a couple above the
   top edge before they scroll in, so every visible number already knows
   about the row above it.
   ===================================================================== */
(function () {
  "use strict";

  // ---- tuning: first guesses, adjust by feel ---------------------------
  const COLS = 10;
  const RUNWAY = 2;             // mine-free rows that start open
  const SPEED0 = 0.2;           // rows per second at the start
  const SPEED_STEP = 0.0025;    // added per row survived
  const SPEED_MAX = 0.6;
  // Mines per 10-tile row (2.5 = 25%, above classic Expert's 20.6%). At a
  // random 12% a simulated field opened 85% of its safe tiles by itself —
  // a zero patch keeps flooding each new row. So each row gets a fixed
  // count, drawn at random but weighted toward columns where the two rows
  // below have no mine nearby (the spots that would otherwise become
  // zeros). Simulated: 1.7% of safe tiles are zeros at 2.5, 0.5% at 3.
  const MINES0 = 2.5;
  const MINES_STEP = 0.004;     // added per row
  const MINES_MAX = 3;
  const SPREAD = 3;             // extra weight per would-be zero a mine prevents
  const SIDE = 0.35;            // weight for a spot beside a mine in the same row (not 0: no learnable rule)

  const HIDDEN = 0, OPEN = 1, FLAG = 2;

  const GAP = 2;                // must match --gap in CSS
  const PAD = 6;                // .erow left inset
  const GUTTER = 10;            // .wrap side padding
  const MIN_CELL = 22, MAX_CELL = 40;
  const MIN_ROWS = 9, MAX_ROWS = 15;
  const CHROME_H = 400;         // title + switch + HUD + controls, for the height fit
  const LONG_PRESS_MS = 380;
  const RIPPLE_MS = 16, RIPPLE_CAP = 420;

  const BEST = GameShell.best("minesweeper_best_endless");

  const $ = (id) => document.getElementById(id);
  const fieldEl = $("field");
  const runnerEl = $("runner");
  const defusedEl = $("defused");
  const scoreEl = $("score");
  const faceEl = $("face");
  const statusEl = $("status");
  const statsEl = $("stats");
  const modeBtn = $("modeBtn");

  const reduced = () => !!(window.RM_ON && window.RM_ON());

  // ---- state -------------------------------------------------------------
  let rows = new Map();   // r -> { r, mine, adj, cell, adjReady, judged, el, els }
  let pos = 0;            // rows scrolled
  let nextJudge = 0;      // lowest row not yet judged
  let top = -1;           // highest row generated
  let liveTop = -1;       // highest row with any part on screen
  let state = "ready";    // "ready" | "playing" | "over"
  let score = 0, defused = 0;
  let cellPx = 32, pitch = 34, visRows = 12;
  let flagMode = false;
  let cursor = { r: RUNWAY, c: COLS >> 1 }, kbd = false;

  const speed = () => Math.min(SPEED_MAX, SPEED0 + score * SPEED_STEP);
  const minesFor = (r) => (r < RUNWAY ? 0 : Math.min(MINES_MAX, MINES0 + (r - RUNWAY) * MINES_STEP));

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
  function noise(dur, vol) {
    if (!actx) return;
    const t = actx.currentTime;
    const len = Math.floor(actx.sampleRate * dur);
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / len);
    const src = actx.createBufferSource();
    src.buffer = buf;
    const f = actx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(2200, t);
    f.frequency.exponentialRampToValueAtTime(90, t + dur);
    const g = actx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(actx.destination);
    src.start(t); src.stop(t + dur);
  }
  const sfx = {
    dig() { tone(760, 520, 0.05, "triangle", 0.1); },
    cascade(n) { tone(360, 360 + Math.min(n, 90) * 9, 0.18, "sine", 0.12); tone(900, 900, 0.05, "triangle", 0.06); },
    flag() { tone(880, 1320, 0.07, "triangle", 0.14); },
    unflag() { tone(700, 430, 0.06, "triangle", 0.1); },
    defuse() { tone(990, 1480, 0.09, "sine", 0.07); },
    boom() {
      noise(0.8, 0.55);
      tone(120, 36, 0.6, "sawtooth", 0.16);
      tone(392, 196, 0.5, "triangle", 0.12, 0.35);
    },
  };

  // ---- layout ------------------------------------------------------------
  function layout() {
    const avail = Math.min(document.documentElement.clientWidth - 2 * GUTTER, 700) - 2 * PAD - 2;
    cellPx = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor((avail - (COLS - 1) * GAP) / COLS)));
    pitch = cellPx + GAP;
    visRows = Math.max(MIN_ROWS, Math.min(MAX_ROWS, Math.floor((window.innerHeight - CHROME_H) / pitch)));
    runnerEl.style.setProperty("--cell", cellPx + "px");
    runnerEl.style.setProperty("--cols", COLS);
    runnerEl.style.width = COLS * pitch - GAP + 2 * PAD + "px";
    runnerEl.style.height = visRows * pitch + 3 + "px";
  }

  // ---- rows --------------------------------------------------------------
  function makeRow(r) {
    const row = {
      r: r,
      mine: new Uint8Array(COLS),
      adj: new Uint8Array(COLS),
      cell: new Uint8Array(COLS),
      adjReady: false,
      judged: false,
      el: document.createElement("div"),
      els: [],
    };
    placeMines(row.mine, minesFor(r), rows.get(r - 1), rows.get(r - 2));
    if (r < RUNWAY) row.cell.fill(OPEN);
    row.el.className = "erow";
    for (let c = 0; c < COLS; c++) {
      const el = document.createElement("div");
      el.className = "c";
      el.dataset.r = r;
      el.dataset.c = c;
      row.els.push(el);
      row.el.appendChild(el);
    }
    runnerEl.appendChild(row.el);
    rows.set(r, row);
    if (rows.has(r - 1)) computeAdj(r - 1);
  }

  // `avg` 2.5 means half the rows get 2 and half get 3 — never an empty row.
  // need[c]: the tile at column c of the row below is still on course to be
  // a zero (no mine within reach in the two rows below). A mine at x
  // settles need for x-1..x+1, so those spots weigh more.
  function placeMines(mine, avg, below, below2) {
    const k = Math.floor(avg) + (Math.random() < avg - Math.floor(avg) ? 1 : 0);
    const need = new Uint8Array(COLS);
    for (let c = 0; c < COLS; c++) {
      let near = 0;
      for (let dc = -1; dc <= 1; dc++) near |= (below && below.mine[c + dc]) | (below2 && below2.mine[c + dc]);
      need[c] = near ? 0 : 1;
    }
    const w = new Float64Array(COLS);
    for (let i = 0; i < k; i++) {
      let sum = 0;
      for (let x = 0; x < COLS; x++) {
        if (mine[x]) { w[x] = 0; continue; }
        let cover = 0;
        for (let c = x - 1; c <= x + 1; c++) if (need[c]) cover++;
        w[x] = (1 + SPREAD * cover) * (mine[x - 1] || mine[x + 1] ? SIDE : 1);
        sum += w[x];
      }
      let p = Math.random() * sum, x = 0;
      while (x < COLS - 1 && (p -= w[x]) > 0) x++;
      while (mine[x]) x = (x + 1) % COLS; // rounding (or a 0 roll) landed on a taken column
      mine[x] = 1;
      for (let c = x - 1; c <= x + 1; c++) if (c >= 0 && c < COLS) need[c] = 0;
    }
  }

  // Called once the row above exists; the row below is kept until then.
  function computeAdj(r) {
    const row = rows.get(r);
    for (let c = 0; c < COLS; c++) {
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        const nr = rows.get(r + dr);
        if (!nr) continue;
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const cc = c + dc;
          if (cc >= 0 && cc < COLS) n += nr.mine[cc];
        }
      }
      row.adj[c] = n;
    }
    row.adjReady = true;
    for (let c = 0; c < COLS; c++) if (row.cell[c] === OPEN) paint(row, c, -1);
  }

  const isLive = (r) => r >= nextJudge && r <= liveTop && rows.has(r) && rows.get(r).adjReady;

  // Keep rows generated to two above the top edge; when a new row scrolls
  // in, open anything next to an open zero (it was waiting off-screen).
  function updateLive() {
    const t = Math.ceil(pos + visRows) - 1;
    if (t === liveTop) return;
    liveTop = t;
    while (top < liveTop + 2) makeRow(++top);
    spread();
  }

  function spread() {
    const starts = [];
    for (let r = nextJudge - 1; r <= liveTop; r++) {
      const row = rows.get(r);
      if (!row || !row.adjReady) continue;
      for (let c = 0; c < COLS; c++) {
        if (row.cell[c] !== OPEN || row.adj[c]) continue;
        forNeighbours(r, c, (nr, cc) => {
          if (isLive(nr.r) && nr.cell[cc] === HIDDEN) starts.push([nr.r, cc]);
        });
      }
    }
    if (starts.length) openFrom(starts);
  }

  function forNeighbours(r, c, fn) {
    for (let dr = -1; dr <= 1; dr++) {
      const nr = rows.get(r + dr);
      if (!nr) continue;
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const cc = c + dc;
        if (cc >= 0 && cc < COLS) fn(nr, cc);
      }
    }
  }

  // Every frame: move each row, tint the one about to be judged, and drop
  // rows that are well past the line.
  function place() {
    for (const row of rows.values()) {
      if (row.r < nextJudge - 2) {
        row.el.remove();
        rows.delete(row.r);
        continue;
      }
      const y = (row.r - pos) * pitch;
      row.el.style.transform = "translate3d(0," + (-y).toFixed(2) + "px,0)";
      row.el.classList.toggle("near", !row.judged && state !== "over" && row.r - pos < 1);
    }
  }

  // ---- painting ----------------------------------------------------------
  function paint(row, c, delay) {
    const el = row.els[c];
    let cls = "c", txt = "";
    if (row.cell[c] === OPEN) {
      cls += " open" + (row.adj[c] ? " num n" + row.adj[c] : "");
      txt = row.adj[c] ? String(row.adj[c]) : "";
    } else if (row.cell[c] === FLAG) {
      cls += " flag";
      txt = "🚩";
    }
    if (delay >= 0) {
      cls += " reveal";
      el.style.setProperty("--d", delay + "ms");
    }
    if (kbd && cursor.r === row.r && cursor.c === c) cls += " cur";
    el.className = cls;
    el.textContent = txt;
  }

  const led = (n) => String(n).padStart(3, "0"); // no 999 cap — this is endless
  function renderHud() {
    defusedEl.textContent = led(defused);
    scoreEl.textContent = led(score);
  }
  function renderFace(pressing) {
    faceEl.textContent = state === "over" ? "😵" : pressing ? "😮" : "🙂";
  }
  function setStatus(text, tone) {
    statusEl.textContent = text;
    statusEl.className = tone || "";
  }
  function renderStats() {
    const b = BEST.get();
    statsEl.innerHTML = "<b>Endless</b> · best <b>" + (b > 0 ? b + " rows" : "—") + "</b>";
  }

  // ---- game --------------------------------------------------------------
  function newGame() {
    for (const row of rows.values()) row.el.remove();
    rows = new Map();
    pos = 0;
    nextJudge = 0;
    top = -1;
    liveTop = -1;
    state = "ready";
    score = 0;
    defused = 0;
    cursor = { r: RUNWAY, c: COLS >> 1 };
    fieldEl.classList.remove("shake");
    layout();
    updateLive();
    place();
    renderHud();
    renderFace();
    renderStats();
    setStatus("Dig or flag to start — flag every mine before it reaches the red line.");
  }

  function begin() {
    if (state !== "ready") return;
    state = "playing";
    setStatus("");
  }

  const canAct = (r) => (state === "ready" || state === "playing") && !PAUSE.isPaused() && isLive(r);

  function dig(r, c) {
    if (!canAct(r)) return;
    const row = rows.get(r);
    if (row.cell[c] === OPEN) return chord(r, c);
    if (row.cell[c] === FLAG) return;
    begin();
    if (row.mine[c]) return gameOver([[r, c]], "You dug a mine.");
    const n = openFrom([[r, c]]);
    if (n > 1) sfx.cascade(n);
    else sfx.dig();
  }

  function chord(r, c) {
    const row = rows.get(r);
    if (!canAct(r) || row.cell[c] !== OPEN || !row.adj[c]) return;
    let f = 0;
    const targets = [];
    forNeighbours(r, c, (nr, cc) => {
      if (nr.cell[cc] === FLAG) f++;
      else if (nr.cell[cc] === HIDDEN && isLive(nr.r)) targets.push([nr.r, cc]);
    });
    if (f !== row.adj[c] || !targets.length) return;
    begin();
    const hits = targets.filter((t) => rows.get(t[0]).mine[t[1]]);
    if (hits.length) return gameOver(hits, "A wrong flag let a chord open a mine.");
    const n = openFrom(targets);
    if (n > 1) sfx.cascade(n);
    else sfx.dig();
  }

  function mark(r, c) {
    if (!canAct(r)) return;
    const row = rows.get(r);
    if (row.cell[c] === OPEN) return;
    begin();
    if (row.cell[c] === FLAG) {
      row.cell[c] = HIDDEN;
      sfx.unflag();
    } else {
      row.cell[c] = FLAG;
      sfx.flag();
    }
    paint(row, c, -1);
  }

  // Breadth-first so the FX ripple spreads outward. Never opens rows that
  // are off-screen or already judged — spread() picks those up later.
  function openFrom(starts) {
    const fx = !reduced();
    const q = [];
    let head = 0, count = 0;
    const open = (row, c, d) => {
      row.cell[c] = OPEN;
      count++;
      paint(row, c, fx ? Math.min(d * RIPPLE_MS, RIPPLE_CAP) : -1);
      if (!row.adj[c]) q.push(row, c, d);
    };
    for (const s of starts) {
      const row = rows.get(s[0]);
      if (row && isLive(s[0]) && row.cell[s[1]] === HIDDEN && !row.mine[s[1]]) open(row, s[1], 0);
    }
    while (head < q.length) {
      const row = q[head++], c = q[head++], d = q[head++];
      forNeighbours(row.r, c, (nr, cc) => {
        if (isLive(nr.r) && nr.cell[cc] === HIDDEN && !nr.mine[cc]) open(nr, cc, d + 1);
      });
    }
    return count;
  }

  // The row touched the line.
  function judge(row) {
    row.judged = true;
    row.el.classList.add("judged");
    row.el.classList.remove("near");
    const missed = [], wrong = [];
    let saved = 0;
    for (let c = 0; c < COLS; c++) {
      const flagged = row.cell[c] === FLAG;
      if (row.mine[c] && !flagged) missed.push([row.r, c]);
      else if (!row.mine[c] && flagged) wrong.push([row.r, c]);
      else if (row.mine[c]) {
        saved++;
        row.els[c].classList.add("ok");
      }
    }
    if (missed.length) return gameOver(missed.concat(wrong), "A mine reached the line.");
    if (wrong.length) return gameOver(wrong, "A flag on a safe tile reached the line.");
    defused += saved;
    if (row.r >= RUNWAY) score++;
    if (saved) sfx.defuse();
    renderHud();
  }

  function gameOver(bad, why) {
    state = "over";
    const fx = !reduced();
    const isBad = new Set(bad.map((b) => b[0] + ":" + b[1]));
    for (const row of rows.values()) {
      for (let c = 0; c < COLS; c++) {
        const el = row.els[c];
        const hot = isBad.has(row.r + ":" + c);
        if (hot) row.el.classList.remove("judged"); // don't dim the row that ended it
        if (row.mine[c] && row.cell[c] !== FLAG) {
          el.className = "c open mine" + (hot ? " boom" : "");
          el.textContent = "💣";
        } else if (!row.mine[c] && row.cell[c] === FLAG) {
          el.className = "c open wrong" + (hot ? " boom" : "");
          el.textContent = "❌";
        }
      }
      row.el.classList.remove("near");
    }
    renderFace();
    sfx.boom();
    if (fx) {
      fieldEl.classList.remove("shake");
      void fieldEl.offsetWidth; // restart the animation
      fieldEl.classList.add("shake");
    }
    const isBest = score > 0 && BEST.submit(score);
    setStatus(
      "💥 " + why + " " + score + " row" + (score === 1 ? "" : "s") + ", " + defused + " defused" +
        (isBest ? " — new best!" : ".") + " Tap 🙂 or press N to go again.",
      "bad"
    );
    renderStats();
  }

  // ---- the loop ----------------------------------------------------------
  // One rAF loop for the page's whole life; newGame() only resets state, so
  // restarting can never stack a second loop and double the speed.
  let lastT = 0;
  function frame(t) {
    const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0;
    lastT = t;
    if (state === "playing" && !PAUSE.isPaused()) {
      pos += speed() * dt;
      // a long frame can carry more than one row over the line
      while (state === "playing" && pos > nextJudge) judge(rows.get(nextJudge++));
      updateLive();
      if (kbd && cursor.r < nextJudge) setCursor(nextJudge, cursor.c);
    }
    place();
    requestAnimationFrame(frame);
  }

  // ---- mouse -------------------------------------------------------------
  // The board moves under a still mouse, so every action reads the cell
  // from the event target at that moment rather than a tracked hover.
  let lastTouch = 0;
  const fromTouch = () => performance.now() - lastTouch < 800;
  let btnL = false, btnR = false, chording = false, spent = false, downEl = null;

  function cellOf(t) {
    const el = t && t.closest ? t.closest(".c") : null;
    if (!el || !runnerEl.contains(el)) return null;
    return { r: +el.dataset.r, c: +el.dataset.c, el: el };
  }
  function pressLook(el) {
    if (downEl) downEl.classList.remove("down");
    downEl = el;
    if (el) el.classList.add("down");
    renderFace(!!el || btnL || chording);
  }

  runnerEl.addEventListener("mousedown", (e) => {
    if (fromTouch()) return;
    const h = cellOf(e.target);
    if (!h) return;
    e.preventDefault(); // no text selection, no middle-click autoscroll
    runnerEl.classList.add("mouse");
    runnerEl.focus({ preventScroll: true });
    ensureAudio();
    if (e.button === 0) btnL = true;
    else if (e.button === 2) btnR = true;
    else if (e.button === 1) chording = true;
    if (btnL && btnR) chording = true;
    if (e.button === 2 && !btnL) mark(h.r, h.c);
    const row = rows.get(h.r);
    pressLook(btnL && !chording && row && row.cell[h.c] === HIDDEN && canAct(h.r) ? h.el : null);
  });

  window.addEventListener("mouseup", (e) => {
    if (fromTouch() || (!btnL && !btnR && !chording)) return;
    const wasL = btnL;
    if (e.button === 0) btnL = false;
    else if (e.button === 2) btnR = false;
    const h = cellOf(e.target);
    if (chording) {
      if (!spent) {
        if (h) chord(h.r, h.c);
        spent = true;
      }
    } else if (e.button === 0 && wasL && h) {
      const row = rows.get(h.r);
      if (flagMode && row && row.cell[h.c] !== OPEN) mark(h.r, h.c);
      else dig(h.r, h.c);
    }
    if (!btnL && !btnR) {
      chording = false;
      spent = false;
    }
    pressLook(null);
  });

  runnerEl.addEventListener("contextmenu", (e) => e.preventDefault());

  // ---- touch / pen -------------------------------------------------------
  let touch = null;

  function endTouch() {
    if (!touch) return;
    clearTimeout(touch.timer);
    touch = null;
    pressLook(null);
  }

  runnerEl.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    lastTouch = performance.now();
    if (touch) return; // a second finger — ignore it
    const h = cellOf(e.target);
    if (!h) return;
    ensureAudio();
    if (kbd) setKbd(false);
    const t = { id: e.pointerId, h: h, x: e.clientX, y: e.clientY, long: false };
    touch = t;
    const row = rows.get(h.r);
    if (row && row.cell[h.c] === HIDDEN && canAct(h.r)) pressLook(h.el);
    t.timer = setTimeout(() => {
      if (touch !== t) return; // lifted, cancelled, or a new run started
      t.long = true;
      pressLook(null);
      const row = rows.get(h.r);
      if (!row) return;
      if (flagMode) dig(h.r, h.c);
      else if (row.cell[h.c] === OPEN) chord(h.r, h.c);
      else {
        mark(h.r, h.c);
        try { navigator.vibrate && navigator.vibrate(15); } catch (err) {}
      }
    }, LONG_PRESS_MS);
  });

  runnerEl.addEventListener("pointermove", (e) => {
    if (!touch || e.pointerId !== touch.id) return;
    if (Math.hypot(e.clientX - touch.x, e.clientY - touch.y) > 10) endTouch();
  });

  runnerEl.addEventListener("pointerup", (e) => {
    if (!touch || e.pointerId !== touch.id) return;
    lastTouch = performance.now();
    const t = touch;
    endTouch();
    if (t.long) return;
    const row = rows.get(t.h.r);
    if (!row || row.els[t.h.c] !== t.h.el) return; // the run was restarted under the finger
    if (flagMode && row.cell[t.h.c] !== OPEN) mark(t.h.r, t.h.c);
    else dig(t.h.r, t.h.c);
  });

  runnerEl.addEventListener("pointercancel", (e) => {
    if (touch && e.pointerId === touch.id) endTouch();
  });

  // ---- keyboard ----------------------------------------------------------
  function cursorEl() {
    const row = rows.get(cursor.r);
    return row ? row.els[cursor.c] : null;
  }
  function setKbd(on) {
    kbd = on;
    const el = cursorEl();
    if (el) el.classList.toggle("cur", on);
  }
  function setCursor(r, c) {
    const old = cursorEl();
    if (old) old.classList.remove("cur");
    cursor = { r: Math.max(nextJudge, Math.min(liveTop, r)), c: Math.max(0, Math.min(COLS - 1, c)) };
    setKbd(true);
  }

  // up the screen is up the row numbers
  const ARROWS = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  runnerEl.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (PAUSE.isPaused()) return;
    const k = e.key;
    runnerEl.classList.remove("mouse");
    if (e.repeat && !ARROWS[k]) return;
    if (ARROWS[k]) {
      e.preventDefault();
      if (!kbd) return setCursor(cursor.r, cursor.c);
      setCursor(cursor.r + ARROWS[k][0], cursor.c + ARROWS[k][1]);
    } else if (k === " " || k === "Enter") {
      e.preventDefault();
      ensureAudio();
      setCursor(cursor.r, cursor.c);
      dig(cursor.r, cursor.c);
    } else if (k === "f" || k === "F") {
      e.preventDefault();
      ensureAudio();
      setCursor(cursor.r, cursor.c);
      mark(cursor.r, cursor.c);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.key !== "n" && e.key !== "N" && e.key !== "F2") return;
    const t = e.target;
    const typing = t && ((t.tagName === "INPUT" && t.type !== "checkbox") || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
    if (typing || PAUSE.isPaused()) return;
    e.preventDefault();
    newGame();
  });

  // ---- pause -------------------------------------------------------------
  const PAUSE = GameShell.pausable({
    canPause: () => state === "playing",
    onChange: (paused) => fieldEl.classList.toggle("paused", paused),
  });

  // ---- controls ----------------------------------------------------------
  faceEl.addEventListener("click", () => {
    ensureAudio();
    newGame();
  });

  modeBtn.addEventListener("click", () => {
    flagMode = !flagMode;
    modeBtn.setAttribute("aria-pressed", flagMode ? "true" : "false");
    modeBtn.textContent = flagMode ? "🚩 Tap flags" : "⛏️ Tap digs";
  });

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      layout();
      updateLive();
      place();
    }, 120);
  });

  newGame();
  requestAnimationFrame(frame);
})();
