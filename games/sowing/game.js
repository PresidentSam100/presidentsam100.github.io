/* =====================================================================
   Sowing: mancala (the Kalah rules) on a carved board laid on woven
   cloth. Lift every seed from one of your pits and sow them one to a pit
   round the board; the last seed in your store sows again, the last in an
   empty pit of yours takes the seeds across from it. Most seeds in your
   store when a row runs dry wins. Against the farmer's boy, the
   grandmother, or a friend.
   ===================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  function fx() { return !(window.RM_ON && window.RM_ON()); }
  var store = window.GameShell ? GameShell.store : {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };

  // ---- the rules ---------------------------------------------------------------------
  // 14 places counter-clockwise: 0..5 the near row (the first player's pits,
  // left to right), 6 its store on the right, 7..12 the far row (right to
  // left), 13 the far store on the left. Side 0 sows from 0..5 into 6, side
  // 1 from 7..12 into 13.
  function fresh(n) { var b = []; for (var i = 0; i < 14; i++) b.push(i === 6 || i === 13 ? 0 : n); return b; }
  function pitsOf(side) { return side === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]; }
  function storeOf(side) { return side === 0 ? 6 : 13; }
  function legal(b, side) { return pitsOf(side).filter(function (i) { return b[i] > 0; }); }
  // one move: the board after it, whose turn is next, and the path the seeds took
  function sow(b, pit, side) {
    var nb = b.slice(), seeds = nb[pit], i = pit, path = [], skip = storeOf(1 - side);
    nb[pit] = 0;
    while (seeds > 0) {
      i = (i + 1) % 14;
      if (i === skip) continue;
      nb[i]++; seeds--; path.push(i);
    }
    var again = i === storeOf(side), captured = null;
    // the last seed in an empty pit of your own takes the pit across, if it holds any
    if (!again && pitsOf(side).indexOf(i) >= 0 && nb[i] === 1 && nb[12 - i] > 0) {
      captured = { at: i, across: 12 - i, n: nb[12 - i] + 1 };
      nb[storeOf(side)] += nb[12 - i] + 1;
      nb[i] = 0; nb[12 - i] = 0;
    }
    var next = again ? side : 1 - side, ended = false;
    // a row run dry ends it: the other row's seeds go to their own store
    if (legal(nb, 0).length === 0 || legal(nb, 1).length === 0) {
      ended = true;
      [0, 1].forEach(function (s) { pitsOf(s).forEach(function (p) { nb[storeOf(s)] += nb[p]; nb[p] = 0; }); });
    }
    return { board: nb, next: next, path: path, again: again, captured: captured, ended: ended };
  }

  // ---- the opponents ------------------------------------------------------------------
  // (a look-ahead counts every sowing as a step, a sowing again included,
  // and stops at a budget of positions, so the grandmother never stalls)
  var budget = 0;
  function search(b, side, me, depth, alpha, beta) {
    var ms = legal(b, side);
    if (!ms.length || depth <= 0 || --budget <= 0) return b[storeOf(me)] - b[storeOf(1 - me)];
    var best = side === me ? -Infinity : Infinity;
    for (var k = 0; k < ms.length; k++) {
      var r = sow(b, ms[k], side);
      var v = r.ended ? (r.board[storeOf(me)] - r.board[storeOf(1 - me)]) * 10 : search(r.board, r.next, me, depth - 1, alpha, beta);
      if (side === me) { if (v > best) best = v; if (best > alpha) alpha = best; }
      else { if (v < best) best = v; if (best < beta) beta = best; }
      if (alpha >= beta) break;
    }
    return best;
  }
  var FOES = {
    boy: { name: "the farmer's boy", depth: 1, slip: 0.35 },
    grandmother: { name: "the grandmother", depth: 7, slip: 0 },
    friend: { name: "a friend", depth: -1 }
  };
  function choose(b, side, foe) {
    var ms = legal(b, side), F = FOES[foe];
    if (!ms.length) return null;
    if (Math.random() < (F.slip || 0)) return ms[Math.floor(Math.random() * ms.length)];
    var best = ms[0], bv = -Infinity;
    budget = 400000;
    ms.forEach(function (p) {
      var r = sow(b, p, side);
      var v = r.ended ? (r.board[storeOf(side)] - r.board[storeOf(1 - side)]) * 10 : search(r.board, r.next, side, F.depth - 1, bv, Infinity);
      if (v > bv) { bv = v; best = p; }
    });
    return best;
  }

  // ---- sound ---------------------------------------------------------------------------
  var actx = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  // a seed dropped in a wooden pit: a short hollow tock
  function tock(pitch, vol) {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime, o = ac.createOscillator(), gn = ac.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(pitch, t0); o.frequency.exponentialRampToValueAtTime(pitch * 0.72, t0 + 0.07);
    gn.gain.setValueAtTime(vol || 0.12, t0); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
    o.connect(gn); gn.connect(ac.destination); o.start(t0); o.stop(t0 + 0.13);
  }
  function chord(fs) { fs.forEach(function (f, k) { setTimeout(function () { tock(f, 0.1); }, k * 110); }); }

  // ---- the game ------------------------------------------------------------------------
  var foe = store.get("sowing_foe", "grandmother"); if (!FOES[foe]) foe = "grandmother";
  var records = {};
  ["boy", "grandmother"].forEach(function (f) { records[f] = window.GameShell ? GameShell.record("sowing_record_" + f) : null; });
  var state = "menu", board = fresh(4), turn = 0, history = [], busy = false, timer = 0, overAt = 0;
  var cursor = 0, keyed = false, hintAt = -1, notice = "", lastPath = [];
  var SEED_MS = 170, THINK_MS = 600, OVER_WAIT = 700;
  var SEEDCOLS = ["#efe2c6", "#b5562f", "#5b3a26", "#2a221d", "#7c7a3a", "#c98a3c"];

  function isCpu(side) { return foe !== "friend" && side === 1; }
  function nameOf(side) { return foe === "friend" ? (side === 0 ? "near" : "far") : side === 0 ? "you" : FOES[foe].name; }

  // the board's places, made once: a store, six pits a row, a store
  var places = [];
  (function build() {
    var host = $("board");
    for (var i = 0; i < 14; i++) {
      var el = document.createElement(i === 6 || i === 13 ? "div" : "button");
      el.className = i === 6 || i === 13 ? "store" : i > 6 ? "pit far" : "pit";
      if (el.tagName === "BUTTON") { el.type = "button"; el.tabIndex = -1; el.addEventListener("mousedown", function (e) { e.preventDefault(); }); }
      el.dataset.i = i;
      el.innerHTML = '<span class="seeds"></span><b class="n">0</b>';
      // the grid: the far row on top (12 at the left down to 7), the near row below
      if (i === 13) el.style.gridArea = "1 / 1 / 3 / 2";
      else if (i === 6) el.style.gridArea = "1 / 8 / 3 / 9";
      else if (i < 6) el.style.gridArea = "2 / " + (i + 2);
      else el.style.gridArea = "1 / " + (14 - i);
      if (i !== 6 && i !== 13) el.addEventListener("click", (function (i) { return function () { tryPlay(i); }; })(i));
      host.appendChild(el);
      places.push(el);
    }
  })();
  // seeds drawn in a pit: a scatter that stays put while the count doesn't change
  function seedsInto(el, n, i) {
    var box = el.querySelector(".seeds"), have = box.childElementCount;
    if (have === n) return;
    while (box.childElementCount > n) box.removeChild(box.lastChild);
    var big = i === 6 || i === 13;
    for (var k = box.childElementCount; k < Math.min(n, big ? 48 : 24); k++) {
      var s = document.createElement("i"), h = (i * 131 + k * 71) % 997;
      var ang = (h / 997) * Math.PI * 2, rad = Math.sqrt(((h * 7) % 100) / 100) * 28;
      s.style.left = (50 + Math.cos(ang) * rad * (big ? 0.7 : 1)) + "%";
      s.style.top = (50 + Math.sin(ang) * rad * (big ? 1.25 : 1)) + "%";
      s.style.background = "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), transparent 45%), " + SEEDCOLS[h % SEEDCOLS.length];
      s.style.transform = "translate(-50%, -50%) rotate(" + (h % 180) + "deg)";
      box.appendChild(s);
    }
  }
  function paint(dropAt) {
    var can = state === "play" && !busy && !isCpu(turn) ? legal(board, turn) : [];
    for (var i = 0; i < 14; i++) {
      var el = places[i];
      seedsInto(el, board[i], i);
      el.querySelector(".n").textContent = board[i];
      if (i !== 6 && i !== 13) {
        el.classList.toggle("can", can.indexOf(i) >= 0);
        el.classList.toggle("cursor", state === "play" && keyed && i === cursor);
        el.classList.toggle("hint", i === hintAt);
        el.setAttribute("aria-label", (i < 6 ? "your pit " + (i + 1) : "far pit " + (13 - i)) + ", " + board[i] + (board[i] === 1 ? " seed" : " seeds"));
      }
      el.classList.toggle("drop", dropAt === i && fx());
      if (dropAt === i && fx()) { void el.offsetWidth; }
    }
    $("count-near").textContent = board[6]; $("count-far").textContent = board[13];
    $("name-near").textContent = nameOf(0); $("name-far").textContent = nameOf(1);
    $("turn").textContent = notice || (state !== "play" ? "" : isCpu(turn) ? FOES[foe].name + " is sowing" :
      foe === "friend" ? "the " + nameOf(turn) + " row to sow" : "your sowing");
    $("btn-undo").disabled = state !== "play" || busy || !undoable();
    $("btn-hint").disabled = state !== "play" || busy || isCpu(turn);
    var rec = records[foe];
    $("record").textContent = rec ? "against " + FOES[foe].name + ": " + rec.text() : "two at one board: the near row sows first";
    // the near pits wear their keys, 1 to 6, where there's a keyboard
    for (var p = 0; p < 6; p++) places[p].setAttribute("data-gs-key", String(p + 1));
  }
  function undoable() { return history.length > 0 && (foe === "friend" || history.some(function (h) { return h.turn === 0; })); }

  function startRun() {
    audio();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    clearTimeout(timer);
    board = fresh(4); turn = 0; history = []; busy = false; hintAt = -1; notice = ""; cursor = 0;
    state = "play";
    $("menu").hidden = true; $("over").hidden = true;
    paint(); next();
  }
  function next() {
    if (state !== "play") return;
    paint();
    if (isCpu(turn)) {
      busy = true; paint();
      timer = setTimeout(function () {
        if (state !== "play") return;
        busy = false;
        play(choose(board, 1, foe));
      }, THINK_MS);
    }
  }
  function tryPlay(i) {
    if (state !== "play" || busy || isCpu(turn) || P.isPaused()) return;
    if (pitsOf(turn).indexOf(i) < 0 || board[i] === 0) return;
    play(i);
  }
  // the seeds go round one pit at a time, at the same pace with Visual FX
  // off (only the hop is left out)
  function play(pit) {
    history.push({ board: board.slice(), turn: turn });
    var side = turn, r = sow(board, pit, side), shown = board.slice();
    hintAt = -1; notice = ""; busy = true; cursor = pit;
    shown[pit] = 0; tock(240, 0.1);
    var k = 0;
    paint();
    (function step() {
      if (state !== "play") return;
      if (k < r.path.length) {
        var at = r.path[k++];
        shown[at]++;
        var keep = board; board = shown; paint(at); board = keep;
        tock(300 + (at % 7) * 24, 0.07);
        timer = setTimeout(step, SEED_MS);
        return;
      }
      board = r.board;
      if (r.captured) { notice = (side === 0 && foe !== "friend" ? "you take " : nameOf(side) + " takes ") + r.captured.n + " seeds"; chord([392, 494, 587]); }
      else if (r.again && !r.ended) { notice = (side === 0 && foe !== "friend" ? "into your store: sow again" : nameOf(side) + " sows again"); tock(660, 0.1); }
      turn = r.next;
      paint();
      if (r.ended) { timer = setTimeout(finish, 700); return; }
      timer = setTimeout(function () { busy = false; next(); }, 250);
    })();
  }
  function undo() {
    if (state !== "play" || busy || !undoable()) return;
    clearTimeout(timer);
    var h;
    do { h = history.pop(); } while (foe !== "friend" && h && h.turn !== 0 && history.length);
    board = h.board; turn = h.turn; hintAt = -1; notice = "";
    tock(200, 0.08); paint(); next();
  }
  function hint() {
    if (state !== "play" || busy || isCpu(turn)) return;
    hintAt = choose(board, turn, "grandmother");
    paint();
  }
  function finish() {
    state = "over"; busy = false;
    overAt = performance.now();
    var near = board[6], far = board[13], outcome = near > far ? "w" : near < far ? "l" : "d";
    var title;
    if (foe === "friend") title = near === far ? "An even harvest" : (near > far ? "The near row" : "The far row") + " gathers more";
    else {
      title = outcome === "w" ? "Your harvest is bigger" : outcome === "l" ? FOES[foe].name.replace(/^t/, "T") + " gathers more" : "An even harvest";
      if (records[foe]) records[foe].add(outcome);
    }
    chord(outcome === "l" && foe !== "friend" ? [392, 330, 262] : [523, 659, 784]);
    $("over-title").textContent = title;
    $("over-msg").textContent = Math.max(near, far) + " to " + Math.min(near, far);
    $("over-stats").textContent = (foe === "friend" ? "near " + near + " · far " + far : "you " + near + " · " + FOES[foe].name + " " + far) +
      (records[foe] ? "\nagainst " + FOES[foe].name + ": " + records[foe].text() : "");
    paint();
    $("over").hidden = false;
  }
  function toMenu() {
    clearTimeout(timer);
    state = "menu"; busy = false; board = fresh(4); notice = "";
    $("over").hidden = true; $("menu").hidden = false;
    paintMenu(); paint();
  }
  function paintMenu() { document.querySelectorAll("#pick-foe button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === foe); }); }

  // ---- keys and buttons ------------------------------------------------------------------
  var P = window.GameShell ? GameShell.pausable({
    canPause: function () { return state === "play"; },
    restart: function () { startRun(); },
    menu: toMenu,
    onChange: function (paused) {
      // (a sowing under way is finished at once: the board is never left half sown)
      if (paused && busy) {
        clearTimeout(timer);
        var h = history[history.length - 1];
        if (h) { var r = sow(h.board, cursor, h.turn); board = r.board; turn = r.next; if (r.ended) { busy = false; finish(); return; } }
        busy = false;
      }
      if (!paused) { notice = ""; paint(); next(); }
    }
  }) : { isPaused: function () { return false; } };
  if (window.GameShell && GameShell.guardLeave) GameShell.guardLeave({
    active: function () { return state === "play" && history.length > 0; },
    pausable: P
  });
  function ask(opts, go) { if (window.GameShell && GameShell.askQuit) GameShell.askQuit(opts, go); else go(); }

  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || P.isPaused() || state !== "play") return;
    var k = e.key, mineRow = pitsOf(turn);
    if (/^[1-6]$/.test(k) && !isCpu(turn)) {
      // the near row's pits by number, left to right; the far row's (a friend's) right to left as they face it
      var i = turn === 0 ? Number(k) - 1 : 6 + Number(k);
      cursor = i; keyed = true; tryPlay(i); return;
    }
    if (k === "ArrowLeft" || k === "ArrowRight") {
      e.preventDefault();
      var at = mineRow.indexOf(cursor); if (at < 0) at = 0;
      var dir = (k === "ArrowRight" ? 1 : -1) * (turn === 0 ? 1 : -1);
      if (keyed) at = (at + dir + 6) % 6;
      cursor = mineRow[at]; keyed = true; paint();
    } else if ((k === "Enter" || k === " ") && !(e.target && e.target.closest && e.target.closest("button:not(.pit)"))) {
      e.preventDefault();
      if (!e.repeat) { keyed = true; if (mineRow.indexOf(cursor) < 0) cursor = mineRow[0]; tryPlay(cursor); }
    }
  });

  $("btn-hint").addEventListener("click", hint);
  $("btn-undo").addEventListener("click", undo);
  $("btn-new").addEventListener("click", function () { ask({ title: "Start a new game?", ok: "New game" }, startRun); });
  $("btn-menu").addEventListener("click", function () { ask({ title: "Leave this game for the menu?", ok: "Menu" }, toMenu); });
  ["btn-hint", "btn-undo", "btn-new", "btn-menu"].forEach(function (id) { $(id).addEventListener("mousedown", function (e) { e.preventDefault(); }); });
  document.querySelectorAll("#pick-foe button").forEach(function (b) {
    b.addEventListener("click", function () { foe = b.dataset.v; store.set("sowing_foe", foe); paintMenu(); paint(); });
    b.addEventListener("mousedown", function (e) { e.preventDefault(); });
  });
  $("play").addEventListener("click", startRun);
  $("again").addEventListener("click", startRun);
  $("to-menu").addEventListener("click", toMenu);
  if (window.GameShell && GameShell.menuKeys) {
    GameShell.menuKeys({ active: function () { return state === "menu"; }, groups: [{ sel: "#pick-foe button", into: "b" }], start: "#play", space: true });
    GameShell.menuKeys({ active: function () { return state === "play" && !P.isPaused(); }, groups: [{ sel: "#tools button", keys: ["h", "u", "n", "backspace"] }] });
    GameShell.menuKeys({ active: function () { return state === "over" && performance.now() - overAt > OVER_WAIT; },
      groups: [{ sel: "#to-menu", keys: ["backspace"] }], start: "#again", space: true });
  }

  toMenu();

  // test hooks: the Playwright harness drives games through these
  window.Sowing = {
    state: function () { return state; },
    foe: function () { return foe; },
    turn: function () { return turn; },
    busy: function () { return busy; },
    board: function () { return board.slice(); },
    hintAt: function () { return hintAt; },
    notice: function () { return notice; },
    play: tryPlay,
    start: startRun,
    toMenu: toMenu,
    setBoard: function (b, t) { clearTimeout(timer); board = b.slice(); turn = t; busy = false; history = [{ board: b.slice(), turn: t }]; paint(); next(); },
    rules: { sow: sow, fresh: fresh, legal: legal },
    choose: function (side, f) { return choose(board, side, f || foe); }
  };
})();
