/* =====================================================================
   Stone Garden: Reversi on raked gravel. A stone put down closes lines
   of the other colour between it and stones of its own, straight or
   slanting, and every stone in them turns. Against the garden's keepers
   (the novice, the monk, the master) or a friend at the same screen.
   ===================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  function fx() { return !(window.RM_ON && window.RM_ON()); }
  var store = window.GameShell ? GameShell.store : {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };

  // ---- the rules ----------------------------------------------------------------------
  // The board is 64 places, row by row from the top left; 1 is black, -1
  // white, 0 bare gravel. Black moves first.
  var B = 1, W = -1;
  var DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  function fresh() {
    var b = new Array(64).fill(0);
    b[27] = W; b[28] = B; b[35] = B; b[36] = W;
    return b;
  }
  // the stones a stone of `who` put at i would turn (none: it can't go there)
  function flipsFor(b, i, who) {
    if (b[i]) return [];
    var r = i >> 3, c = i & 7, out = [];
    for (var d = 0; d < 8; d++) {
      var dr = DIRS[d][0], dc = DIRS[d][1], line = [], rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === -who) { line.push(rr * 8 + cc); rr += dr; cc += dc; }
      if (line.length && rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === who) out = out.concat(line);
    }
    return out;
  }
  function moves(b, who) {
    var out = [];
    for (var i = 0; i < 64; i++) { if (b[i]) continue; var f = flipsFor(b, i, who); if (f.length) out.push({ i: i, flips: f }); }
    return out;
  }
  function apply(b, m, who) {
    var nb = b.slice();
    nb[m.i] = who;
    for (var k = 0; k < m.flips.length; k++) nb[m.flips[k]] = who;
    return nb;
  }
  function count(b) { var n = { b: 0, w: 0 }; for (var i = 0; i < 64; i++) { if (b[i] === B) n.b++; else if (b[i] === W) n.w++; } return n; }

  // ---- the keepers --------------------------------------------------------------------
  // What a place is worth: the corners most, the places that give them away least.
  var WEIGHT = [
    100, -22, 10, 6, 6, 10, -22, 100,
    -22, -48, -3, -3, -3, -3, -48, -22,
    10, -3, 3, 1, 1, 3, -3, 10,
    6, -3, 1, 0, 0, 1, -3, 6,
    6, -3, 1, 0, 0, 1, -3, 6,
    10, -3, 3, 1, 1, 3, -3, 10,
    -22, -48, -3, -3, -3, -3, -48, -22,
    100, -22, 10, 6, 6, 10, -22, 100
  ];
  // the corners and the places beside them: once a corner is taken those
  // places can't give it away, and what they're worth turns round
  var CORNERS = [[0, 1, 8, 9], [7, 6, 15, 14], [56, 57, 48, 49], [63, 62, 55, 54]];
  function evaluate(b, who) {
    var s = 0, mine = 0, theirs = 0;
    for (var i = 0; i < 64; i++) {
      if (!b[i]) continue;
      s += WEIGHT[i] * b[i] * who;
      if (b[i] === who) mine++; else theirs++;
    }
    for (var c = 0; c < 4; c++) {
      if (!b[CORNERS[c][0]]) continue;
      for (var k = 1; k < 4; k++) { var a = CORNERS[c][k]; if (b[a]) s += (12 - WEIGHT[a]) * b[a] * who; }
    }
    var mob = moves(b, who).length - moves(b, -who).length;
    return s + mob * 6 + (mine + theirs > 52 ? (mine - theirs) * 4 : 0);
  }
  function search(b, who, depth, alpha, beta) {
    var ms = moves(b, who);
    if (!ms.length) {
      if (!moves(b, -who).length) { var n = count(b), d = (n.b - n.w) * who; return d * 1000; }   // the end: counted
      return -search(b, -who, depth, -beta, -alpha);                                              // a pass
    }
    if (depth === 0) return evaluate(b, who);
    // the likeliest first: the alpha-beta cut goes deeper that way
    ms.sort(function (x, y) { return WEIGHT[y.i] - WEIGHT[x.i]; });
    for (var k = 0; k < ms.length; k++) {
      var v = -search(apply(b, ms[k], who), -who, depth - 1, -beta, -alpha);
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return alpha;
  }
  var FOES = {
    novice: { name: "the novice", depth: 0 },
    monk: { name: "the monk", depth: 2 },
    master: { name: "the master", depth: 5 },
    friend: { name: "a friend", depth: -1 }
  };
  function bestMove(b, who, depth) {
    var ms = moves(b, who);
    if (!ms.length) return null;
    if (depth === 0) {
      // the novice: the move that turns the most, now and then any at all
      if (Math.random() < 0.3) return ms[Math.floor(Math.random() * ms.length)];
      ms.sort(function (x, y) { return y.flips.length - x.flips.length; });
      return ms[0];
    }
    // the endgame read to the end when few places are left
    var empty = 64 - count(b).b - count(b).w, d = empty <= 10 && depth >= 5 ? empty : depth;
    var best = null, alpha = -Infinity;
    ms.sort(function (x, y) { return WEIGHT[y.i] - WEIGHT[x.i]; });
    for (var k = 0; k < ms.length; k++) {
      var v = -search(apply(b, ms[k], who), -who, d - 1, -Infinity, -alpha);
      if (v > alpha || !best) { alpha = v; best = ms[k]; }
    }
    return best;
  }

  // ---- sound --------------------------------------------------------------------------
  var actx = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  // a stone set on gravel: a short knock and a scrunch
  function clack(pitch, vol, delay) {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime + (delay || 0);
    var o = ac.createOscillator(), gn = ac.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(pitch, t0); o.frequency.exponentialRampToValueAtTime(pitch * 0.6, t0 + 0.08);
    gn.gain.setValueAtTime(vol, t0); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    o.connect(gn); gn.connect(ac.destination); o.start(t0); o.stop(t0 + 0.15);
    var len = Math.floor(ac.sampleRate * 0.06), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ac.createBufferSource(), bp = ac.createBiquadFilter(), g2 = ac.createGain();
    src.buffer = buf; bp.type = "bandpass"; bp.frequency.value = 2400; g2.gain.value = vol * 0.6;
    src.connect(bp); bp.connect(g2); g2.connect(ac.destination); src.start(t0);
  }
  function chime(notes) {
    var ac = audio(); if (!ac) return;
    notes.forEach(function (f, k) {
      var t0 = ac.currentTime + k * 0.14, o = ac.createOscillator(), gn = ac.createGain();
      o.type = "sine"; o.frequency.value = f;
      gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(0.09, t0 + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
      o.connect(gn); gn.connect(ac.destination); o.start(t0); o.stop(t0 + 1);
    });
  }

  // ---- the game -----------------------------------------------------------------------
  var foe = store.get("stonegarden_foe", "monk"); if (!FOES[foe]) foe = "monk";
  var mine = store.get("stonegarden_colour", "b") === "w" ? W : B;   // the player's colour against a keeper
  var records = {};
  ["novice", "monk", "master"].forEach(function (f) { records[f] = window.GameShell ? GameShell.record("stonegarden_record_" + f) : null; });

  var state = "menu";            // menu | play | over
  var board = fresh(), turn = B, history = [], last = -1, cursor = 27, hintAt = -1;
  var busy = false, timer = 0, overAt = 0, notice = "";
  var OVER_WAIT = 700, THINK_MS = 520, TURN_MS = 380;

  function cpuSide() { return foe === "friend" ? 0 : -mine; }
  function isCpu(who) { return foe !== "friend" && who === -mine; }
  function nameOf(who) {
    if (foe === "friend") return who === B ? "black" : "white";
    return who === mine ? "you" : FOES[foe].name;
  }

  // the board's places, made once
  var cells = [];
  (function build() {
    var host = $("board");
    for (var i = 0; i < 64; i++) {
      var c = document.createElement("button");
      c.type = "button"; c.className = "cell"; c.tabIndex = -1;
      c.setAttribute("role", "gridcell");
      c.dataset.i = i;
      c.addEventListener("click", (function (i) { return function () { cursor = i; tryPlay(i); }; })(i));
      c.addEventListener("mousedown", function (e) { e.preventDefault(); });   // (no focus ring from a click)
      host.appendChild(c);
      cells.push(c);
    }
  })();
  var COLS = "abcdefgh";
  function placeName(i) { return COLS[i & 7] + (8 - (i >> 3)); }

  // draw the board as it stands; `turned` are the stones that just turned
  // (they turn over, one after another, with Visual FX on), `dropped` the one set down
  function paint(turned, dropped) {
    var can = state === "play" && !busy && !isCpu(turn) ? moves(board, turn) : [];
    var canAt = {};
    can.forEach(function (m) { canAt[m.i] = true; });
    for (var i = 0; i < 64; i++) {
      var c = cells[i], v = board[i], st = c.firstChild;
      if (v) {
        if (!st) { st = document.createElement("span"); c.appendChild(st); }
        var cls = "st " + (v === B ? "b" : "w") + (i === last ? " last" : "");
        if (dropped === i) cls += " drop";
        st.className = cls;
        if (turned && turned.indexOf(i) >= 0) {
          var k = turned.indexOf(i);
          st.style.animationDelay = fx() ? (k * 45) + "ms" : "";
          st.classList.add("turn");
        } else st.style.animationDelay = "";
      } else if (st) c.removeChild(st);
      c.classList.toggle("can", !!canAt[i]);
      c.classList.toggle("hint", i === hintAt);
      c.classList.toggle("cursor", state === "play" && i === cursor && keyed);
      c.setAttribute("aria-label", placeName(i) + (v === B ? ", black" : v === W ? ", white" : canAt[i] ? ", a stone can go here" : ""));
    }
    var n = count(board);
    $("count-b").textContent = n.b; $("count-w").textContent = n.w;
    $("name-b").textContent = nameOf(B); $("name-w").textContent = nameOf(W);
    $("side-b").classList.toggle("now", state === "play" && turn === B);
    $("side-w").classList.toggle("now", state === "play" && turn === W);
    $("turn").textContent = notice || (state !== "play" ? "" : isCpu(turn) ? FOES[foe].name + " is thinking" :
      foe === "friend" ? (turn === B ? "black" : "white") + " to move" : "your move");
    $("btn-undo").disabled = state !== "play" || busy || !undoable();
    $("btn-hint").disabled = state !== "play" || busy || isCpu(turn);
    var rec = records[foe];
    $("record").textContent = rec ? "against " + FOES[foe].name + ": " + rec.text() : "two at one screen: the counts are kept on the board";
  }
  var keyed = false;   // the keyboard's cursor shows once a key has moved it

  function undoable() {
    // against a keeper: back to your last move; with a friend: the last move
    return history.length > 0 && (foe === "friend" || history.some(function (h) { return h.turn === mine; }));
  }

  function startRun() {
    audio();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    clearTimeout(timer);
    board = fresh(); turn = B; history = []; last = -1; cursor = 19; hintAt = -1; busy = false; notice = "";
    state = "play";
    $("menu").hidden = true; $("over").hidden = true;
    paint();
    next();
  }

  // whose move it is now: a pass when one side can't, the count when neither can
  function next() {
    if (state !== "play") return;
    if (!moves(board, turn).length) {
      if (!moves(board, -turn).length) { finish(); return; }
      notice = nameOf(turn) + (foe !== "friend" && turn === mine ? " have" : " has") + " no move: " + nameOf(-turn) + " again";
      turn = -turn;
      busy = true; paint();
      timer = setTimeout(function () { busy = false; notice = ""; paint(); next(); }, 1500);
      return;
    }
    paint();
    if (isCpu(turn)) {
      busy = true; paint();
      timer = setTimeout(function () {
        if (state !== "play") return;
        var m = bestMove(board, turn, FOES[foe].depth);
        busy = false;
        if (m) play(m);
      }, THINK_MS);
    }
  }

  function tryPlay(i) {
    if (state !== "play" || busy || isCpu(turn) || (P && P.isPaused())) return;
    var f = flipsFor(board, i, turn);
    if (!f.length) {
      // no line closes there: a moment's red ring says so
      var c = cells[i];
      c.classList.add("nope");
      setTimeout(function () { c.classList.remove("nope"); }, 450);
      return;
    }
    play({ i: i, flips: f });
  }
  function play(m) {
    history.push({ board: board.slice(), turn: turn, last: last });
    board = apply(board, m, turn);
    last = m.i; hintAt = -1;
    clack(turn === B ? 210 : 260, 0.16);
    m.flips.forEach(function (_, k) { clack(420 + k * 18, 0.05, 0.06 + k * 0.045); });
    turn = -turn;
    busy = true;
    paint(m.flips, m.i);
    // the turning takes its moment whatever the setting: the pace of play
    // stays the same with Visual FX off, only the motion goes
    timer = setTimeout(function () { busy = false; next(); }, TURN_MS);
  }

  function undo() {
    if (state !== "play" || busy || !undoable()) return;
    clearTimeout(timer);
    var h;
    do { h = history.pop(); } while (foe !== "friend" && h && h.turn !== mine && history.length);
    board = h.board; turn = h.turn; last = h.last; hintAt = -1; notice = "";
    clack(160, 0.08);
    paint();
  }
  function hint() {
    if (state !== "play" || busy || isCpu(turn)) return;
    var m = bestMove(board, turn, 2);
    hintAt = m ? m.i : -1;
    if (m) cursor = m.i;
    paint();
  }

  function finish() {
    state = "over";
    overAt = performance.now();
    var n = count(board);
    var title, outcome = null;
    if (foe === "friend") {
      title = n.b === n.w ? "The garden is shared" : (n.b > n.w ? "Black" : "White") + " holds the garden";
    } else {
      var me = mine === B ? n.b : n.w, them = mine === B ? n.w : n.b;
      outcome = me > them ? "w" : me < them ? "l" : "d";
      title = outcome === "w" ? "The garden is yours" : outcome === "l" ? FOES[foe].name.replace(/^t/, "T") + " holds the garden" : "The garden is shared";
      if (records[foe]) records[foe].add(outcome);
    }
    chime(outcome === "l" ? [392, 330, 262] : [523, 659, 784]);
    $("over-title").textContent = title;
    $("over-msg").textContent = Math.max(n.b, n.w) + " to " + Math.min(n.b, n.w);
    $("over-stats").textContent = "black " + n.b + " · white " + n.w + (64 - n.b - n.w ? " · " + (64 - n.b - n.w) + " bare" : "") +
      (records[foe] ? "\nagainst " + FOES[foe].name + ": " + records[foe].text() : "");
    paint();
    $("over").hidden = false;
  }

  function toMenu() {
    clearTimeout(timer);
    state = "menu"; busy = false;
    $("over").hidden = true; $("menu").hidden = false;
    paintMenu(); paint();
  }
  function paintMenu() {
    document.querySelectorAll("#pick-foe button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === foe); });
    document.querySelectorAll("#pick-colour button").forEach(function (b) { b.classList.toggle("on", (b.dataset.v === "w" ? W : B) === mine); });
    // (a friend plays both colours: no colour to pick)
    $("pick-colour").hidden = foe === "friend";
    $("pick-colour").previousElementSibling.hidden = foe === "friend";
  }

  // ---- keys ---------------------------------------------------------------------------
  var P = window.GameShell ? GameShell.pausable({
    canPause: function () { return state === "play"; },
    restart: function () { startRun(); },
    menu: toMenu,
    // (no clock to stop, but a keeper thinking waits for the card)
    onChange: function (paused) {
      if (paused) { clearTimeout(timer); busy = false; }
      else { notice = ""; paint(); next(); }
    }
  }) : { isPaused: function () { return false; } };
  // Leaving (or a new game) asks first once a stone has been put down
  if (window.GameShell && GameShell.guardLeave) GameShell.guardLeave({
    active: function () { return state === "play" && history.length > 0; },
    pausable: P
  });
  function ask(opts, go) { if (window.GameShell && GameShell.askQuit) GameShell.askQuit(opts, go); else go(); }

  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || P.isPaused() || state !== "play") return;
    var k = e.key, r = cursor >> 3, c = cursor & 7;
    if (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown") {
      e.preventDefault();
      if (keyed) {
        if (k === "ArrowLeft") c = (c + 7) % 8; else if (k === "ArrowRight") c = (c + 1) % 8;
        else if (k === "ArrowUp") r = (r + 7) % 8; else r = (r + 1) % 8;
        cursor = r * 8 + c;
      }
      keyed = true; paint();
    } else if ((k === "Enter" || k === " ") && !(e.target && e.target.closest && e.target.closest("button:not(.cell)"))) {
      e.preventDefault();
      if (!e.repeat) { keyed = true; tryPlay(cursor); }
    }
  });
  document.addEventListener("pointerdown", function (e) { if (e.pointerType !== "mouse" || !e.target.closest || !e.target.closest(".board")) return; if (keyed) { keyed = false; paint(); } });

  $("btn-hint").addEventListener("click", hint);
  $("btn-undo").addEventListener("click", undo);
  $("btn-new").addEventListener("click", function () { ask({ title: "Start a new game?", ok: "New game" }, startRun); });
  $("btn-menu").addEventListener("click", function () { ask({ title: "Leave this game for the menu?", ok: "Menu" }, toMenu); });
  ["btn-hint", "btn-undo", "btn-new", "btn-menu"].forEach(function (id) { $(id).addEventListener("mousedown", function (e) { e.preventDefault(); }); });

  document.querySelectorAll("#pick-foe button").forEach(function (b) {
    b.addEventListener("click", function () { foe = b.dataset.v; store.set("stonegarden_foe", foe); paintMenu(); paint(); });
    b.addEventListener("mousedown", function (e) { e.preventDefault(); });
  });
  document.querySelectorAll("#pick-colour button").forEach(function (b) {
    b.addEventListener("click", function () { mine = b.dataset.v === "w" ? W : B; store.set("stonegarden_colour", b.dataset.v); paintMenu(); paint(); });
    b.addEventListener("mousedown", function (e) { e.preventDefault(); });
  });
  $("play").addEventListener("click", startRun);
  $("again").addEventListener("click", startRun);
  $("to-menu").addEventListener("click", toMenu);

  if (window.GameShell && GameShell.menuKeys) {
    // the menu: 1 to 4 the opponent, B or W your stones, Space or Enter begins
    GameShell.menuKeys({ active: function () { return state === "menu"; },
      groups: [{ sel: "#pick-foe button", into: "b" }, { sel: "#pick-colour button", keys: ["b", "w"], into: "b" }], start: "#play", space: true });
    // in play: H a hint, U takes back, N a new game, Backspace the menu
    GameShell.menuKeys({ active: function () { return state === "play" && !P.isPaused(); },
      groups: [{ sel: "#tools button", keys: ["h", "u", "n", "backspace"] }] });
    // the end card: Space or Enter again (not in its first moment), Backspace the menu
    GameShell.menuKeys({ active: function () { return state === "over" && performance.now() - overAt > OVER_WAIT; },
      groups: [{ sel: "#to-menu", keys: ["backspace"] }], start: "#again", space: true });
  }

  toMenu();

  // test hooks: the Playwright harness drives games through these
  window.StoneGarden = {
    state: function () { return state; },
    foe: function () { return foe; },
    mine: function () { return mine; },
    turn: function () { return turn; },
    busy: function () { return busy; },
    board: function () { return board.slice(); },
    counts: function () { return count(board); },
    moves: function () { return moves(board, turn).map(function (m) { return { i: m.i, n: m.flips.length }; }); },
    hintAt: function () { return hintAt; },
    cursor: function () { return cursor; },
    notice: function () { return notice; },
    play: tryPlay,
    start: startRun,
    toMenu: toMenu,
    setBoard: function (b, t) { clearTimeout(timer); board = b.slice(); turn = t; busy = false; history = [{ board: b.slice(), turn: t, last: -1 }]; paint(); next(); },
    best: function (depth) { var m = bestMove(board, turn, depth == null ? 2 : depth); return m ? m.i : -1; },
    rules: { flipsFor: flipsFor, moves: moves, fresh: fresh, apply: apply }
  };
})();
