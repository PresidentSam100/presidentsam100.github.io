/* =====================================================================
   Minesweeper — the classic Windows rules.

   - Mines are placed on the first dig, never in the 3×3 around it, so the
     opening move always cracks a patch of the board open.
   - Left/tap digs, right/long-press flags, a finished number chords.
   - Best times per preset difficulty; custom boards aren't ranked.

   Cells are indexed i = r * W + c. Visible state lives in `cell`, the
   hidden truth in `mine` / `adj`.
   ===================================================================== */
(function () {
  "use strict";

  const LEVELS = {
    beginner: { w: 9, h: 9, m: 10, label: "Beginner" },
    intermediate: { w: 16, h: 16, m: 40, label: "Intermediate" },
    expert: { w: 30, h: 16, m: 99, label: "Expert" },
  };
  const LIMITS = { wMin: 5, wMax: 40, hMin: 5, hMax: 30 };

  const HIDDEN = 0, OPEN = 1, FLAG = 2, QUESTION = 3;

  const GAP = 2;              // must match --gap in CSS
  const FRAME = 2 * 6 + 2;    // board padding + scroll border, both sides
  const GUTTER = 10;          // .wrap side padding
  const MAX_W = 1000;
  const MIN_CELL = 18, MAX_CELL = 38, COMFY_CELL = 24;
  const CHROME_H = 380;       // title + mode switch + HUD + controls, for the height fit
  const LONG_PRESS_MS = 380;
  const RIPPLE_MS = 16, RIPPLE_CAP = 420;

  // Keys: scores match the hub's "reset all high scores" prefixes
  // (minesweeper_best_ / minesweeper_stats_); prefs deliberately don't.
  const PREFS_KEY = "minesweeper_prefs";
  const bestFor = (lvl) => GameShell.best("minesweeper_best_" + lvl, { higher: false });
  const statsKey = (lvl) => "minesweeper_stats_" + lvl;

  const $ = (id) => document.getElementById(id);
  const fieldEl = $("field");
  const boardEl = $("board");
  const counterEl = $("counter");
  const timerEl = $("timer");
  const faceEl = $("face");
  const statusEl = $("status");
  const statsEl = $("stats");
  const modeBtn = $("modeBtn");
  const qmarksEl = $("qmarks");
  const customForm = $("customForm");
  const cwEl = $("cw"), chEl = $("ch"), cmEl = $("cm");
  const customTag = $("customTag");
  const levelBtns = Array.from(document.querySelectorAll(".lvl[data-level]"));

  const reduced = () => !!(window.RM_ON && window.RM_ON());

  // ---- prefs -------------------------------------------------------------
  const prefs = { level: "beginner", custom: { w: 20, h: 12, m: 40 }, qmarks: false };
  try {
    const saved = JSON.parse(GameShell.store.get(PREFS_KEY, "null"));
    if (saved && typeof saved === "object") {
      if (LEVELS[saved.level] || saved.level === "custom") prefs.level = saved.level;
      if (saved.custom) prefs.custom = clampCustom(saved.custom);
      prefs.qmarks = !!saved.qmarks;
    }
  } catch (e) {}
  const savePrefs = () => GameShell.store.set(PREFS_KEY, JSON.stringify(prefs));

  function clampCustom(c) {
    const clamp = (v, lo, hi, d) => {
      v = Math.round(Number(v));
      return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
    };
    const w = clamp(c.w, LIMITS.wMin, LIMITS.wMax, 20);
    const h = clamp(c.h, LIMITS.hMin, LIMITS.hMax, 12);
    return { w, h, m: clamp(c.m, 1, w * h - 1, Math.round(w * h * 0.16)) };
  }

  // ---- game state --------------------------------------------------------
  let W, H, M, N;
  let mine, adj, cell, NB, els;
  let state;                 // "ready" (no mines yet) | "playing" | "won" | "lost"
  let opened, flags;
  let elapsedMs = 0, runningSince = 0, tickTimer = 0;
  let flagMode = false;
  let cursor = 0, kbd = false;

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
    boom() { noise(0.7, 0.55); tone(120, 36, 0.6, "sawtooth", 0.16); },
    win() {
      tone(523, 523, 0.14, "triangle", 0.2, 0.0);
      tone(659, 659, 0.14, "triangle", 0.2, 0.11);
      tone(784, 784, 0.14, "triangle", 0.2, 0.22);
      tone(1047, 1047, 0.45, "triangle", 0.22, 0.33);
    },
  };

  // ---- layout ------------------------------------------------------------
  function availW() {
    return Math.min(document.documentElement.clientWidth - 2 * GUTTER, MAX_W) - FRAME;
  }
  const fitW = (cols) => Math.floor((availW() - (cols - 1) * GAP) / cols);

  // Expert is 30 wide; on a phone that's ~11px cells. Stand it on its end
  // instead — the game is the same, just rotated.
  function shouldTranspose(w, h) {
    return w > h && fitW(w) < COMFY_CELL && fitW(h) > fitW(w);
  }

  function layout() {
    const byH = Math.floor((window.innerHeight - CHROME_H - (H - 1) * GAP) / H);
    const size = Math.max(MIN_CELL, Math.min(MAX_CELL, fitW(W), Math.max(byH, COMFY_CELL)));
    boardEl.style.setProperty("--cell", size + "px");
    boardEl.style.setProperty("--cols", W);
  }

  // ---- board setup -------------------------------------------------------
  function newGame() {
    stopClock();
    elapsedMs = 0;
    state = "ready";
    opened = 0;
    flags = 0;

    const L = prefs.level === "custom" ? prefs.custom : LEVELS[prefs.level];
    let w = L.w, h = L.h;
    if (shouldTranspose(w, h)) { const t = w; w = h; h = t; }
    W = w; H = h; M = L.m; N = W * H;

    mine = new Uint8Array(N);
    adj = new Uint8Array(N);
    cell = new Uint8Array(N);
    NB = new Array(N);
    for (let i = 0; i < N; i++) {
      const r = (i / W) | 0, c = i % W, list = [];
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < H && cc >= 0 && cc < W) list.push(rr * W + cc);
        }
      NB[i] = list;
    }

    const frag = document.createDocumentFragment();
    els = new Array(N);
    for (let i = 0; i < N; i++) {
      const el = document.createElement("div");
      el.className = "c";
      el.dataset.i = i;
      els[i] = el;
      frag.appendChild(el);
    }
    boardEl.replaceChildren(frag);
    cursor = Math.min(N - 1, ((H / 2) | 0) * W + ((W / 2) | 0));
    if (kbd) els[cursor].classList.add("cur");

    fieldEl.classList.remove("won", "shake");
    layout();
    renderCounter();
    renderTime();
    setStatus("");
    renderFace();
    renderLevel();
    renderStats();
  }

  function placeMines(safe) {
    const banned = new Uint8Array(N);
    // Keep the whole 3×3 clear when the density allows it, else just the cell.
    const zone = [safe].concat(NB[safe]);
    if (N - zone.length >= M) zone.forEach((j) => (banned[j] = 1));
    else banned[safe] = 1;
    const pool = [];
    for (let j = 0; j < N; j++) if (!banned[j]) pool.push(j);
    for (let k = 0; k < M; k++) {
      const r = k + Math.floor(Math.random() * (pool.length - k));
      const t = pool[k]; pool[k] = pool[r]; pool[r] = t;
      mine[pool[k]] = 1;
    }
    for (let j = 0; j < N; j++) {
      let n = 0;
      for (const x of NB[j]) n += mine[x];
      adj[j] = n;
    }
  }

  // ---- painting ----------------------------------------------------------
  // delay >= 0 plays the reveal ripple after that many ms; -1 paints instantly.
  function paint(i, delay) {
    const el = els[i];
    let cls = "c", txt = "";
    switch (cell[i]) {
      case OPEN:
        cls += " open" + (adj[i] ? " num n" + adj[i] : "");
        txt = adj[i] ? String(adj[i]) : "";
        break;
      case FLAG: cls += " flag"; txt = "🚩"; break;
      case QUESTION: cls += " q"; txt = "?"; break;
    }
    if (delay >= 0) {
      cls += " reveal";
      el.style.setProperty("--d", delay + "ms");
    }
    if (kbd && i === cursor) cls += " cur";
    el.className = cls;
    el.textContent = txt;
  }

  function led(n) {
    if (n < 0) return "-" + String(Math.min(99, -n)).padStart(2, "0");
    return String(Math.min(999, n)).padStart(3, "0");
  }
  function renderCounter() { counterEl.textContent = led(M - flags); }
  function renderTime() { timerEl.textContent = led(Math.floor(elapsed() / 1000)); }

  function renderFace(pressing) {
    faceEl.textContent =
      state === "won" ? "😎" : state === "lost" ? "😵" : pressing ? "😮" : "🙂";
  }

  function setStatus(text, tone) {
    statusEl.textContent = text;
    statusEl.className = tone || "";
  }

  function renderLevel() {
    levelBtns.forEach((b) => b.classList.toggle("sel", b.dataset.level === prefs.level));
    customForm.hidden = prefs.level !== "custom";
    const c = prefs.custom;
    customTag.textContent = c.w + "×" + c.h + " · " + c.m;
    cwEl.value = c.w; chEl.value = c.h; cmEl.value = c.m;
  }

  function readStats(lvl) {
    try {
      const s = JSON.parse(GameShell.store.get(statsKey(lvl), "null"));
      if (s && typeof s === "object") return { p: s.p | 0, w: s.w | 0 };
    } catch (e) {}
    return { p: 0, w: 0 };
  }
  function addStat(won) {
    if (prefs.level === "custom") return;
    const s = readStats(prefs.level);
    s.p++;
    if (won) s.w++;
    GameShell.store.set(statsKey(prefs.level), JSON.stringify(s));
  }

  function renderStats() {
    if (prefs.level === "custom") {
      statsEl.innerHTML = "<b>Custom</b> " + W + "×" + H + " · " + M + " mines — custom boards aren't ranked";
      return;
    }
    const best = bestFor(prefs.level).get();   // 0 means "no time yet"
    const s = readStats(prefs.level);
    statsEl.innerHTML =
      "<b>" + LEVELS[prefs.level].label + "</b> · best <b>" +
      (best > 0 ? best.toFixed(2) + " s" : "—") + "</b> · won " + s.w + " of " + s.p +
      (s.p ? " (" + Math.round((100 * s.w) / s.p) + "%)" : "");
  }

  // ---- clock -------------------------------------------------------------
  function elapsed() {
    return elapsedMs + (runningSince ? performance.now() - runningSince : 0);
  }
  function startClock() {
    if (runningSince) return;
    runningSince = performance.now();
    tickTimer = setInterval(renderTime, 200);
  }
  function stopClock() {
    if (runningSince) elapsedMs += performance.now() - runningSince;
    runningSince = 0;
    clearInterval(tickTimer);
    renderTime();
  }

  // ---- moves -------------------------------------------------------------
  const live = () => (state === "ready" || state === "playing") && !PAUSE.isPaused();
  const covered = (i) => cell[i] === HIDDEN || cell[i] === QUESTION;

  function dig(i) {
    if (!live()) return;
    if (cell[i] === OPEN) return chord(i);
    if (cell[i] === FLAG) return;
    if (state === "ready") {
      placeMines(i);
      state = "playing";
      startClock();
    }
    if (mine[i]) return lose([i]);
    openFrom([i]);
  }

  function chord(i) {
    if (!live() || cell[i] !== OPEN || !adj[i]) return;
    let f = 0;
    const targets = [];
    for (const j of NB[i]) {
      if (cell[j] === FLAG) f++;
      else if (covered(j)) targets.push(j);
    }
    if (f !== adj[i] || !targets.length) return;
    const hits = targets.filter((j) => mine[j]);
    if (hits.length) return lose(hits);
    openFrom(targets);
  }

  // Breadth-first so the FX ripple spreads outward by distance.
  function openFrom(starts) {
    const fx = !reduced();
    const q = [];
    let head = 0, count = 0;
    const open = (j, d) => {
      cell[j] = OPEN;
      opened++;
      count++;
      paint(j, fx ? Math.min(d * RIPPLE_MS, RIPPLE_CAP) : -1);
      if (!adj[j]) q.push(j, d);
    };
    for (const s of starts) if (covered(s)) open(s, 0);
    while (head < q.length) {
      const j = q[head++], d = q[head++];
      for (const k of NB[j]) if (covered(k) && !mine[k]) open(k, d + 1);
    }
    if (count > 1) sfx.cascade(count);
    else sfx.dig();
    if (opened === N - M) win();
  }

  function mark(i) {
    if (!live() || cell[i] === OPEN) return;
    if (cell[i] === HIDDEN) {
      cell[i] = FLAG;
      flags++;
      sfx.flag();
    } else if (cell[i] === FLAG) {
      flags--;
      cell[i] = prefs.qmarks ? QUESTION : HIDDEN;
      sfx.unflag();
    } else {
      cell[i] = HIDDEN;
      sfx.unflag();
    }
    paint(i, -1);
    renderCounter();
  }

  function win() {
    state = "won";
    stopClock();
    const fx = !reduced();
    for (let j = 0; j < N; j++) {
      if (mine[j] && cell[j] !== FLAG) {
        cell[j] = FLAG;
        paint(j, -1);
        if (fx) {
          els[j].classList.add("pop");
          els[j].style.setProperty("--d", "0ms");
        }
      }
    }
    flags = M;
    renderCounter();
    renderFace();
    fieldEl.classList.add("won");
    sfx.win();

    // floor at 0.01: best().get() reads a stored 0 as "no time yet"
    const secs = Math.max(0.01, Math.round(elapsed() / 10) / 100);
    let msg = "🎉 Cleared in " + secs.toFixed(2) + " s";
    if (prefs.level !== "custom") {
      if (bestFor(prefs.level).submit(secs)) msg += " — new best!";
    }
    addStat(true);
    setStatus(msg, "good");
    renderStats();
  }

  function lose(hits) {
    state = "lost";
    stopClock();
    const fx = !reduced();
    const boom = new Set(hits);
    const or = (hits[0] / W) | 0, oc = hits[0] % W;
    for (let j = 0; j < N; j++) {
      const el = els[j];
      if (mine[j] && cell[j] !== FLAG) {
        el.className = "c open mine" + (boom.has(j) ? " boom" : "");
        el.textContent = "💣";
        if (fx && !boom.has(j)) {
          // mines "go off" outward from the one you hit
          const dist = Math.max(Math.abs(((j / W) | 0) - or), Math.abs((j % W) - oc));
          el.classList.add("pop");
          el.style.setProperty("--d", Math.min(dist * 45, 700) + "ms");
        }
      } else if (cell[j] === FLAG && !mine[j]) {
        el.className = "c open wrong";
        el.textContent = "❌";
      }
    }
    renderFace();
    sfx.boom();
    if (fx) {
      fieldEl.classList.remove("shake");
      void fieldEl.offsetWidth; // restart the animation
      fieldEl.classList.add("shake");
    }
    addStat(false);
    setStatus("💥 Boom! Tap 🙂 or press N to try again.", "bad");
    renderStats();
  }

  // ---- mouse -------------------------------------------------------------
  // Per-button mousedown/mouseup rather than Pointer Events: pressing a second
  // button while one is held only fires pointermove, which makes left+right
  // chording awkward. Touch is handled separately below.
  let lastTouch = 0;
  const fromTouch = () => performance.now() - lastTouch < 800;
  let btnL = false, btnR = false, chording = false, spent = false, hover = -1;
  let pressed = [];

  const cellAt = (t) => {
    const el = t && t.closest ? t.closest(".c") : null;
    return el && el.parentNode === boardEl ? +el.dataset.i : -1;
  };

  function setPressed(list) {
    for (const j of pressed) if (els[j]) els[j].classList.remove("down");
    pressed = list;
    for (const j of pressed) els[j].classList.add("down");
    renderFace(list.length > 0 || btnL || chording);
  }

  function preview() {
    const i = hover;
    if (!live() || i < 0 || (!btnL && !chording)) return setPressed([]);
    let list = [];
    if (chording || cell[i] === OPEN) {
      // both buttons (or a left press on a number): show what a chord opens
      list = [i].concat(NB[i]).filter(covered);
    } else if (covered(i)) {
      list = [i];
    }
    setPressed(list);
  }

  boardEl.addEventListener("mousedown", (e) => {
    if (fromTouch()) return;
    const i = cellAt(e.target);
    if (i < 0) return;
    e.preventDefault(); // no text selection, no middle-click autoscroll
    boardEl.classList.add("mouse");
    boardEl.focus({ preventScroll: true });
    ensureAudio();
    hover = i;
    if (e.button === 0) btnL = true;
    else if (e.button === 2) btnR = true;
    else if (e.button === 1) chording = true;
    if (btnL && btnR) chording = true;
    // Right press flags straight away, like the original — unless the left
    // button is already down, in which case this is the start of a chord.
    if (e.button === 2 && !btnL) mark(i);
    preview();
  });

  boardEl.addEventListener("mousemove", (e) => {
    if (fromTouch()) return;
    if (kbd) setKbd(false);
    const i = cellAt(e.target);
    if (i !== hover) {
      hover = i;
      if (btnL || chording) preview();
    }
  });

  boardEl.addEventListener("mouseleave", () => {
    hover = -1;
    if (btnL || chording) preview();
  });

  window.addEventListener("mouseup", (e) => {
    if (fromTouch() || (!btnL && !btnR && !chording)) return;
    const wasL = btnL;
    if (e.button === 0) btnL = false;
    else if (e.button === 2) btnR = false;
    const i = hover;
    if (chording) {
      // a chord fires on the first release; the other button's release is spent
      if (!spent) {
        setPressed([]);
        if (i >= 0) chord(i);
        spent = true;
      }
    } else if (e.button === 0 && wasL) {
      setPressed([]);
      if (i >= 0) {
        if (flagMode && cell[i] !== OPEN) mark(i);
        else dig(i);
      }
    }
    if (!btnL && !btnR) {
      chording = false;
      spent = false;
    }
    setPressed([]);
  });

  boardEl.addEventListener("contextmenu", (e) => e.preventDefault());

  // ---- touch / pen -------------------------------------------------------
  // Tap digs, long-press flags (swapped in flag mode). Moving the finger
  // cancels, so the board can still be scrolled.
  let touch = null;

  function endTouch() {
    if (!touch) return;
    clearTimeout(touch.timer);
    touch = null;
    setPressed([]);
  }

  boardEl.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    lastTouch = performance.now();
    if (touch) return; // a second finger — ignore it
    const i = cellAt(e.target);
    if (i < 0) return;
    ensureAudio();
    if (kbd) setKbd(false);
    touch = { id: e.pointerId, i: i, x: e.clientX, y: e.clientY, long: false };
    if (live() && covered(i)) setPressed([i]);
    touch.timer = setTimeout(() => {
      if (!touch) return;
      touch.long = true;
      setPressed([]);
      if (flagMode) dig(i);
      else if (cell[i] === OPEN) chord(i);
      else if (live()) {
        mark(i);
        try { navigator.vibrate && navigator.vibrate(15); } catch (err) {}
      }
    }, LONG_PRESS_MS);
  });

  boardEl.addEventListener("pointermove", (e) => {
    if (!touch || e.pointerId !== touch.id) return;
    if (Math.hypot(e.clientX - touch.x, e.clientY - touch.y) > 10) endTouch();
  });

  boardEl.addEventListener("pointerup", (e) => {
    if (!touch || e.pointerId !== touch.id) return;
    lastTouch = performance.now();
    const t = touch;
    endTouch();
    if (t.long) return;
    if (flagMode && cell[t.i] !== OPEN) mark(t.i);
    else dig(t.i);
  });

  boardEl.addEventListener("pointercancel", (e) => {
    if (touch && e.pointerId === touch.id) endTouch();
  });

  // ---- keyboard ----------------------------------------------------------
  function setKbd(on) {
    kbd = on;
    if (els[cursor]) els[cursor].classList.toggle("cur", on);
  }
  function moveCursor(dr, dc) {
    const r = Math.min(H - 1, Math.max(0, ((cursor / W) | 0) + dr));
    const c = Math.min(W - 1, Math.max(0, (cursor % W) + dc));
    els[cursor].classList.remove("cur");
    cursor = r * W + c;
    setKbd(true);
    els[cursor].scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  const ARROWS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  boardEl.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (PAUSE.isPaused()) return;
    const k = e.key;
    boardEl.classList.remove("mouse");
    // held Space/F would dig-then-chord or flicker a flag; arrows may repeat
    if (e.repeat && !ARROWS[k]) return;
    if (ARROWS[k]) {
      e.preventDefault();
      if (!kbd) return setKbd(true);
      moveCursor(ARROWS[k][0], ARROWS[k][1]);
    } else if (k === " " || k === "Enter") {
      e.preventDefault();
      ensureAudio();
      setKbd(true);
      dig(cursor);
    } else if (k === "f" || k === "F") {
      e.preventDefault();
      ensureAudio();
      setKbd(true);
      mark(cursor);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.key !== "n" && e.key !== "N" && e.key !== "F2") return;
    const t = e.target;
    const typing = t && ((t.tagName === "INPUT" && t.type !== "checkbox") || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
    if (typing) return;
    if (PAUSE.isPaused()) return;
    e.preventDefault();
    newGame();
  });

  // ---- pause -------------------------------------------------------------
  // Only while the clock runs. The shared overlay is see-through, so the
  // board is blurred too — otherwise pausing is free thinking time.
  const PAUSE = GameShell.pausable({
    canPause: () => state === "playing",
    onChange: (paused) => {
      fieldEl.classList.toggle("paused", paused);
      if (paused) stopClock();
      else if (state === "playing") startClock();
    },
  });

  // ---- controls ----------------------------------------------------------
  faceEl.addEventListener("click", () => {
    ensureAudio();
    newGame();
  });

  levelBtns.forEach((b) => {
    b.addEventListener("click", () => {
      prefs.level = b.dataset.level;
      savePrefs();
      newGame();
      if (prefs.level === "custom") cwEl.focus();
    });
  });

  customForm.addEventListener("submit", (e) => {
    e.preventDefault();
    prefs.custom = clampCustom({ w: cwEl.value, h: chEl.value, m: cmEl.value });
    prefs.level = "custom";
    savePrefs();
    newGame();
  });
  // keep the mines input's max honest as the size changes
  const syncMineMax = () => {
    const w = Math.min(LIMITS.wMax, Math.max(LIMITS.wMin, +cwEl.value || LIMITS.wMin));
    const h = Math.min(LIMITS.hMax, Math.max(LIMITS.hMin, +chEl.value || LIMITS.hMin));
    cmEl.max = w * h - 1;
  };
  cwEl.addEventListener("input", syncMineMax);
  chEl.addEventListener("input", syncMineMax);

  modeBtn.addEventListener("click", () => {
    flagMode = !flagMode;
    modeBtn.setAttribute("aria-pressed", flagMode ? "true" : "false");
    modeBtn.textContent = flagMode ? "🚩 Tap flags" : "⛏️ Tap digs";
  });

  qmarksEl.checked = prefs.qmarks;
  qmarksEl.addEventListener("change", () => {
    prefs.qmarks = qmarksEl.checked;
    savePrefs();
    if (!prefs.qmarks && cell) {
      for (let j = 0; j < N; j++) if (cell[j] === QUESTION) { cell[j] = HIDDEN; paint(j, -1); }
    }
  });

  // Re-fit on resize. Before the first dig (and with nothing flagged) the
  // board can still flip between wide and tall.
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state === "ready" && flags === 0) {
        const L = prefs.level === "custom" ? prefs.custom : LEVELS[prefs.level];
        const wantTall = shouldTranspose(L.w, L.h);
        if (wantTall !== (W !== L.w)) return newGame();
      }
      layout();
    }, 120);
  });

  newGame();
  syncMineMax();
})();
