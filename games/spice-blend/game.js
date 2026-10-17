/* =====================================================================
   Spice Blend: the code-breaking game (Mastermind) at a market stall. The
   spice-seller has a secret blend: a row of bowls, a spice in each. Fill a
   row of your own and taste it; for every spice in its right bowl you get
   a brass weight, for every right spice in the wrong bowl a wooden one.
   Name the blend before the tries run out.
   ===================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  function fx() { return !(window.RM_ON && window.RM_ON()); }
  var store = window.GameShell ? GameShell.store : {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };

  var SPICES = [
    { name: "saffron", col: "#e8891e" }, { name: "turmeric", col: "#f2c53d" }, { name: "paprika", col: "#c0392b" },
    { name: "cardamom", col: "#6a9a3c" }, { name: "lavender", col: "#8e6bbf" }, { name: "pepper", col: "#2b2622" },
    { name: "cinnamon", col: "#8b4b26" }, { name: "sea salt", col: "#f1ede4" }
  ];
  var MODES = {
    stall: { name: "The stall", spices: 6, bowls: 4, tries: 10 },
    bazaar: { name: "The bazaar", spices: 8, bowls: 5, tries: 12 }
  };

  // ---- the rules -------------------------------------------------------------------------
  // what a guess earns against the blend: right spice in the right bowl, and
  // right spice in a wrong bowl (each bowl of the blend counted once)
  function score(blend, guess) {
    var right = 0, near = 0, a = {}, b = {};
    for (var i = 0; i < blend.length; i++) {
      if (guess[i] === blend[i]) right++;
      else { a[blend[i]] = (a[blend[i]] || 0) + 1; b[guess[i]] = (b[guess[i]] || 0) + 1; }
    }
    for (var k in b) near += Math.min(b[k], a[k] || 0);
    return { right: right, near: near };
  }
  function newBlend(M) { var out = []; for (var i = 0; i < M.bowls; i++) out.push(Math.floor(Math.random() * M.spices)); return out; }

  // ---- sound -------------------------------------------------------------------------------
  var actx = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function tone(f, dur, type, vol, delay) {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime + (delay || 0), o = ac.createOscillator(), gn = ac.createGain();
    o.type = type || "sine"; o.frequency.value = f;
    gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(vol || 0.06, t0 + 0.008); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function sfxPour() { tone(520 + Math.random() * 120, 0.07, "triangle", 0.04); }
  function sfxWeights(r, n) {
    for (var i = 0; i < r; i++) tone(1320, 0.12, "sine", 0.05, 0.08 + i * 0.09);
    for (var k = 0; k < n; k++) tone(392, 0.1, "triangle", 0.06, 0.08 + (r + k) * 0.09);
  }
  function sfxWin() { [659, 784, 988, 1319].forEach(function (f, i) { tone(f, 0.5, "sine", 0.06, i * 0.1); }); }
  function sfxLose() { [392, 349, 294].forEach(function (f, i) { tone(f, 0.4, "triangle", 0.06, i * 0.14); }); }

  // ---- the game ------------------------------------------------------------------------------
  var mode = store.get("spiceblend_mode", "stall"); if (!MODES[mode]) mode = "stall";
  var bests = {}, records = {};
  Object.keys(MODES).forEach(function (m) {
    bests[m] = window.GameShell ? GameShell.best("spiceblend_best_" + m, { higher: false }) : null;
    records[m] = window.GameShell ? GameShell.record("spiceblend_record_" + m) : null;
  });
  var state = "menu", M = MODES[mode], blend = [], rows = [], cur = [], overAt = 0, OVER_WAIT = 700, fresh = -1;

  function startRun(m) {
    if (m && MODES[m]) mode = m;
    store.set("spiceblend_mode", mode);
    M = MODES[mode];
    audio();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    blend = newBlend(M); rows = []; cur = []; fresh = -1;
    state = "play";
    $("menu").hidden = true; $("over").hidden = true;
    buildPalette(); paint();
  }

  function bowl(spice, extra) {
    var b = document.createElement("span");
    b.className = "bowl" + (spice == null ? " empty" : "") + (extra ? " " + extra : "");
    if (spice != null) { b.style.setProperty("--spice", SPICES[spice].col); b.setAttribute("aria-label", SPICES[spice].name); b.title = SPICES[spice].name; }
    return b;
  }
  function weights(sc, animate) {
    var w = document.createElement("span");
    w.className = "weights";
    w.style.setProperty("--n", M.bowls);
    for (var i = 0; i < M.bowls; i++) {
      var d = document.createElement("i");
      d.className = i < sc.right ? "brass" : i < sc.right + sc.near ? "wood" : "none";
      if (animate) d.style.animationDelay = (i * 90) + "ms";
      w.appendChild(d);
    }
    w.setAttribute("aria-label", sc.right + " right in place, " + sc.near + " right but in another bowl");
    return w;
  }
  // the bowls sized so every taste fits the screen: in its height beside the spices
  // and, on a phone, in the width the spices leave too
  function fit() {
    var list = $("rows"), wide = window.matchMedia("(min-width: 760px)").matches, k = M.bowls, R = M.tries;
    $("palette").style.setProperty("--cols", wide ? (M.spices > 6 ? 4 : 3) : 2);
    var top = list.getBoundingClientRect().top + window.scrollY;
    // what sits under the tastes on a phone: the buttons, the keys line, the record (8 px apart) and the page's foot
    var under = wide ? 26 : $("tools").offsetHeight + document.querySelector(".stall .keys").offsetHeight + $("record").offsetHeight + 3 * 8 + 14;
    var room = window.innerHeight - top - under, across = wide ? Infinity : list.clientWidth;
    var pad = wide ? 5 : 3, gap = wide ? 6 : 3;
    function peg(b) { return Math.max(5, Math.min(12, Math.round(b * 0.36))); }
    function last(b) { return wide ? 42 : Math.max(3 * peg(b) + 4, 34); }
    // a phone's row: its ends (2 x 5), the number, two gaps of 4, the bowls 3 apart, the weights
    function wideOf(b) { return 10 + 14 + 8 + k * b + (k - 1) * 3 + last(b); }
    function tallOf(b) { return R * (Math.max(b, 2 * peg(b) + 3) + 2 * pad) + (R - 1) * gap; }
    function biggest() { var b = wide ? 34 : 30; while (b > 14 && (wideOf(b) > across || tallOf(b) > room)) b--; return b; }
    var b = biggest();
    if (wide && b < 30) { pad = 3; gap = 4; b = biggest(); }
    list.style.setProperty("--bowl", b + "px"); list.style.setProperty("--pad", pad + "px"); list.style.setProperty("--gap", gap + "px");
    list.style.setProperty("--peg", peg(b) + "px"); list.style.setProperty("--last", last(b) + "px");
  }
  // where even the smallest bowls don't fit, the row being filled kept in sight
  function keepInView() {
    if (state !== "play") return;
    var now = document.querySelector("#rows .row.now"); if (!now) return;
    var r = now.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 6) window.scrollBy(0, r.bottom - window.innerHeight + 6);
    else if (r.top < 58) window.scrollBy(0, r.top - 58);
  }
  function paint() {
    var board = $("rows");
    board.replaceChildren();
    for (var r = 0; r < M.tries; r++) {
      var row = document.createElement("div");
      row.className = "row" + (r === rows.length && state === "play" ? " now" : "");
      var n = document.createElement("b"); n.className = "n"; n.textContent = r + 1; row.appendChild(n);
      var cells = document.createElement("span"); cells.className = "cells";
      for (var i = 0; i < M.bowls; i++) {
        var s = r < rows.length ? rows[r].guess[i] : r === rows.length ? cur[i] : null;
        var el = bowl(s == null ? null : s, r === rows.length && i === cur.length - 1 && fresh === i ? "pour" : "");
        if (r === rows.length && state === "play") {
          el.dataset.at = i;
          el.addEventListener("click", (function (i) { return function () { if (i < cur.length) { cur.splice(i, 1); fresh = -1; paint(); } }; })(i));
        }
        cells.appendChild(el);
      }
      row.appendChild(cells);
      if (r < rows.length) row.appendChild(weights(rows[r].score, r === rows.length - 1 && fx()));
      else if (r === rows.length && state === "play" && cur.length === M.bowls) {
        var tb = document.createElement("button"); tb.type = "button"; tb.className = "taste-here"; tb.textContent = "taste";
        tb.addEventListener("click", taste); tb.addEventListener("mousedown", function (e) { e.preventDefault(); });
        row.appendChild(tb);
      } else { var blank = document.createElement("span"); blank.className = "weights blank"; row.appendChild(blank); }
      board.appendChild(row);
    }
    fresh = -1;
    $("tries").textContent = state === "play" ? (M.tries - rows.length) + (M.tries - rows.length === 1 ? " taste left" : " tastes left") : "";
    $("btn-taste").disabled = state !== "play" || cur.length < M.bowls;
    $("btn-clear").disabled = state !== "play" || cur.length === 0;
    var rec = records[mode], b = bests[mode];
    $("record").textContent = rec ? MODES[mode].name.toLowerCase() + ": " + rec.text() + (b && b.get() ? " · fewest tastes " + b.get() : "") : "";
    fit(); keepInView();
  }
  function buildPalette() {
    var pal = $("palette");
    pal.replaceChildren();
    for (var i = 0; i < M.spices; i++) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "spice";
      b.innerHTML = "";
      b.appendChild(bowl(i));
      var l = document.createElement("small"); l.textContent = SPICES[i].name; b.appendChild(l);
      b.addEventListener("click", (function (i) { return function () { add(i); }; })(i));
      b.addEventListener("mousedown", function (e) { e.preventDefault(); });
      pal.appendChild(b);
    }
  }
  function add(i) {
    if (state !== "play" || P.isPaused() || cur.length >= M.bowls || i >= M.spices) return;
    cur.push(i); fresh = cur.length - 1;
    sfxPour(); paint();
  }
  function takeBack() { if (state !== "play" || P.isPaused() || !cur.length) return; cur.pop(); tone(300, 0.05, "triangle", 0.03); paint(); }
  function taste() {
    if (state !== "play" || P.isPaused() || cur.length < M.bowls) return;
    var sc = score(blend, cur);
    rows.push({ guess: cur.slice(), score: sc });
    cur = [];
    sfxWeights(sc.right, sc.near);
    if (sc.right === M.bowls) { finish(true); return; }
    if (rows.length >= M.tries) { finish(false); return; }
    paint();
  }
  function finish(won) {
    state = "over"; overAt = performance.now();
    paint();
    var rec = records[mode], b = bests[mode], isBest = false;
    if (rec) rec.add(won ? "w" : "l");
    if (won && b) { var was = b.get(); isBest = b.submit(rows.length) || !was; }
    setTimeout(won ? sfxWin : sfxLose, 300);
    $("over-title").textContent = won ? "That's the blend" : "The blend was";
    $("over-msg").textContent = won ? rows.length + (rows.length === 1 ? " taste" : " tastes") : "";
    var code = $("over-code"); code.replaceChildren();
    blend.forEach(function (s) { code.appendChild(bowl(s)); });
    var line = document.createElement("span"), best = document.createElement("span");
    line.textContent = blend.map(function (s) { return SPICES[s].name; }).join(" · ");
    best.className = "best" + (isBest ? " record" : "");
    best.textContent = won ? (isBest ? "your fewest tastes yet" : "fewest: " + b.get()) : MODES[mode].name.toLowerCase() + ": " + (rec ? rec.text() : "");
    $("over-stats").replaceChildren(line, best);
    $("over").hidden = false;
  }
  function toMenu() {
    state = "menu";
    $("over").hidden = true; $("menu").hidden = false;
    paintMenu();
    M = MODES[mode]; rows = []; cur = []; buildPalette(); paint();
  }
  function paintMenu() {
    document.querySelectorAll("#pick-mode button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === mode); });
    var parts = [];
    Object.keys(MODES).forEach(function (m) { if (bests[m] && bests[m].get()) parts.push(MODES[m].name + ": " + bests[m].get() + " tastes"); });
    $("bests").textContent = parts.length ? "fewest tastes · " + parts.join(" · ") : "no blend named yet";
  }

  // ---- keys -----------------------------------------------------------------------------------
  var P = window.GameShell ? GameShell.pausable({
    canPause: function () { return state === "play"; },
    restart: function () { startRun(mode); },
    menu: toMenu,
    auto: false
  }) : { isPaused: function () { return false; } };
  if (window.GameShell && GameShell.guardLeave) GameShell.guardLeave({
    active: function () { return state === "play" && rows.length > 0; },
    pausable: P
  });
  function ask(opts, go) { if (window.GameShell && GameShell.askQuit) GameShell.askQuit(opts, go); else go(); }
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || state !== "play" || P.isPaused() || e.repeat) return;
    // (the number keys press the spice buttons, through menuKeys below)
    if (e.key === "Enter" || e.key === " ") { if (e.target && e.target.closest && e.target.closest("button")) return; e.preventDefault(); taste(); }
  });
  $("btn-taste").addEventListener("click", taste);
  $("btn-clear").addEventListener("click", takeBack);
  $("btn-new").addEventListener("click", function () { ask({ title: "Start a new blend?", ok: "New blend" }, function () { startRun(mode); }); });
  $("btn-menu").addEventListener("click", function () { ask({ title: "Leave this blend for the menu?", ok: "Menu" }, toMenu); });
  ["btn-taste", "btn-clear", "btn-new", "btn-menu"].forEach(function (id) { $(id).addEventListener("mousedown", function (e) { e.preventDefault(); }); });
  document.querySelectorAll("#pick-mode button").forEach(function (b) {
    b.addEventListener("click", function () { mode = b.dataset.v; store.set("spiceblend_mode", mode); M = MODES[mode]; paintMenu(); buildPalette(); paint(); });
    b.addEventListener("mousedown", function (e) { e.preventDefault(); });
  });
  $("play").addEventListener("click", function () { startRun(mode); });
  $("again").addEventListener("click", function () { startRun(mode); });
  $("to-menu").addEventListener("click", toMenu);
  if (window.GameShell && GameShell.menuKeys) {
    GameShell.menuKeys({ active: function () { return state === "menu"; }, groups: [{ sel: "#pick-mode button", into: "b" }], start: "#play", space: true });
    // in play: 1 to 6 (or 8) the spices, Backspace takes the last back, N a new blend, M the menu
    GameShell.menuKeys({ active: function () { return state === "play" && !P.isPaused(); }, root: "#palette",
      groups: ["#palette .spice", { sel: "#btn-clear", keys: ["backspace"] }, { sel: "#btn-new", keys: ["n"] }, { sel: "#btn-menu", keys: ["m"] }] });
    GameShell.menuKeys({ active: function () { return state === "over" && performance.now() - overAt > OVER_WAIT; },
      groups: [{ sel: "#to-menu", keys: ["backspace"] }], start: "#again", space: true });
  }
  window.addEventListener("resize", function () { fit(); keepInView(); });
  toMenu();

  // test hooks: the Playwright harness drives blends through these
  window.SpiceBlend = {
    state: function () { return state; },
    mode: function () { return mode; },
    blend: function () { return blend.slice(); },
    setBlend: function (b) { blend = b.slice(); },
    rows: function () { return rows.map(function (r) { return { guess: r.guess.slice(), right: r.score.right, near: r.score.near }; }); },
    cur: function () { return cur.slice(); },
    add: add, taste: taste, takeBack: takeBack,
    start: startRun, toMenu: toMenu,
    score: score
  };
})();
