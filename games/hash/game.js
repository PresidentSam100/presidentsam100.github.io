/* =====================================================================
   Set: the classic card game.

   A card is four features, each with three possible values:
     number  : 1 | 2 | 3
     shape   : diamond | squiggle | oval
     shading : solid | striped | open
     color   : red | green | purple
   The deck is all 81 combinations, each exactly once.

   Three cards form a Set when, for EVERY feature, the three values are
   either all the same or all different (never two-and-one). Equivalent
   (and what we use): for each feature, value_a + value_b + value_c is a
   multiple of 3 when values are encoded 0/1/2.

   Three ways to play, each with or without Junior (the 27 solid cards,
   so shading never matters), and each of the six with a Daily deal:
     Normal     any Hash on the table
     Set-Chain  the last Hash's three cards move aside, and every Hash
                after the first uses exactly one of them
     UltraSet   four cards: two pairs that each make a Hash with the same
                third card (on the table or not)
   ===================================================================== */
(function () {
  "use strict";

  // ---- feature encodings ----------------------------------------------
  var SHAPES = ["diamond", "squiggle", "oval"];
  var SHADINGS = ["solid", "striped", "open"];
  var COLOR_KEYS = ["red", "green", "purple"];
  var COLOR_HEX = { red: "#e3342f", green: "#2f9e44", purple: "#7048e8" };

  // SVG paths drawn inside a 0..100 x 0..50 viewBox.
  var PATHS = {
    diamond: "M50 3 L97 25 L50 47 L3 25 Z",
    // organic blob standing in for the classic squiggle
    squiggle:
      "M12 25 C12 9 42 6 56 13 C71 21 76 11 90 16 C99 31 80 47 56 40 " +
      "C37 34 26 44 14 38 C7 34 9 30 12 25 Z",
  };

  // ---- deck ------------------------------------------------------------
  // Each card: { n:1-3, shape, shading, color, id, code:[0..2]x4 }
  function cardOf(code) {
    return {
      n: code[0] + 1,
      shape: SHAPES[code[1]],
      shading: SHADINGS[code[2]],
      color: COLOR_KEYS[code[3]],
      code: code,
      id: code.join(""),
    };
  }
  // (Junior: the solid ones only)
  function buildDeck(solidOnly) {
    var deck = [];
    for (var n = 0; n < 3; n++)
      for (var sh = 0; sh < 3; sh++)
        for (var sd = 0; sd < (solidOnly ? 1 : 3); sd++)
          for (var c = 0; c < 3; c++) deck.push(cardOf([n, sh, sd, c]));
    return deck;
  }

  function shuffle(a, rng) {
    rng = rng || Math.random;
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  // a seeded generator, so a Daily is the same deal for everyone
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- set logic -------------------------------------------------------
  function isSet(a, b, c) {
    for (var f = 0; f < 4; f++) {
      if ((a.code[f] + b.code[f] + c.code[f]) % 3 !== 0) return false;
    }
    return true;
  }

  // Returns array of three indices forming a set, or null.
  function findSet(cards) {
    var n = cards.length;
    for (var i = 0; i < n - 2; i++)
      for (var j = i + 1; j < n - 1; j++)
        for (var k = j + 1; k < n; k++)
          if (isSet(cards[i], cards[j], cards[k])) return [i, j, k];
    return null;
  }

  // the one card that makes a Hash with a and b
  function third(a, b) {
    return a.code.map(function (v, f) { return (6 - v - b.code[f]) % 3; });
  }

  // UltraSet: four cards, split any of the three ways into two pairs, where
  // both pairs need the same third card. Returns the cards in pair order
  // and that card, or null.
  var PAIRINGS = [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]];
  function ultraOf(cs) {
    for (var p = 0; p < PAIRINGS.length; p++) {
      var o = PAIRINGS[p], e = third(cs[o[0]], cs[o[1]]);
      if (e.join("") === third(cs[o[2]], cs[o[3]]).join(""))
        return { cards: o.map(function (i) { return cs[i]; }), extra: cardOf(e) };
    }
    return null;
  }
  // four indices into cards forming an UltraSet (in pair order), or null.
  // (Any ten cards hold one, so a table of twelve always does: only the
  // last few cards of a deck can run out of them.)
  function findUltra(cards) {
    var seen = {};
    for (var i = 0; i < cards.length - 1; i++)
      for (var j = i + 1; j < cards.length; j++) {
        var key = third(cards[i], cards[j]).join(""), prev = seen[key] || (seen[key] = []);
        for (var k = 0; k < prev.length; k++) {
          var x = prev[k][0], y = prev[k][1];
          if (x !== i && x !== j && y !== i && y !== j) return [x, y, i, j];
        }
        prev.push([i, j]);
      }
    return null;
  }

  // ---- rendering -------------------------------------------------------
  function symbolSVG(card) {
    var hex = COLOR_HEX[card.color];
    var fill;
    if (card.shading === "solid") fill = hex;
    else if (card.shading === "open") fill = "none";
    else fill = "url(#stripe-" + card.color + ")";

    var inner;
    if (card.shape === "oval") {
      inner =
        '<ellipse cx="50" cy="25" rx="45" ry="20" fill="' +
        fill +
        '" stroke="' +
        hex +
        '" stroke-width="3.5"/>';
    } else {
      inner =
        '<path d="' +
        PATHS[card.shape] +
        '" fill="' +
        fill +
        '" stroke="' +
        hex +
        '" stroke-width="3.5" stroke-linejoin="round"/>';
    }
    return (
      '<svg class="sym" viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">' +
      inner +
      "</svg>"
    );
  }

  function cardHTML(card) {
    var s = symbolSVG(card);
    var body = "";
    for (var i = 0; i < card.n; i++) body += s;
    return body;
  }

  function cardName(card) {
    return card.n + " " + card.color + " " + card.shading + " " + card.shape + (card.n > 1 ? "s" : "");
  }

  // ---- modes, Junior and the Daily -------------------------------------
  var MODES = {
    normal: { name: "Normal", need: 3, found: "Hashes", one: "Hash" },
    chain: { name: "Set-Chain", need: 3, found: "Hashes", one: "Hash" },
    ultra: { name: "UltraSet", need: 4, found: "UltraSets", one: "UltraSet" },
  };
  var PREFS_KEY = "hash_prefs";
  var DAILY_KEY = "hash_daily";
  function load(key, fallback) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return v && typeof v === "object" ? v : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function save(key, v) {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch (e) {}
  }
  var prefs = load(PREFS_KEY, {});
  var mode = MODES[prefs.mode] ? prefs.mode : "normal";
  var junior = !!prefs.junior;
  var daily = !!prefs.daily;

  // the six ways to play, each with its own best and its own Daily:
  // "normal", "normal_junior", "chain", ... "ultra_junior"
  function combo() { return mode + (junior ? "_junior" : ""); }
  // (Normal keeps the key it always had, so a saved best time stays)
  function bestKey() { return "set_best_time" + (mode === "normal" ? "" : "_" + mode) + (junior ? "_junior" : ""); }

  // the Daily: day 1 is 2026-10-15; the same deal for everyone that day, a
  // different one in each of the six ways to play
  var DAY0 = Date.UTC(2026, 9, 15);
  function today() {
    var d = new Date();
    var utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    var mm = ("0" + (d.getMonth() + 1)).slice(-2), dd = ("0" + d.getDate()).slice(-2);
    return { n: Math.round((utc - DAY0) / 86400000) + 1, ymd: d.getFullYear() + "-" + mm + "-" + dd };
  }
  // today's first clear in each way to play: { ymd, n, done: { combo: ms } }
  function readDaily() {
    var t = today(), d = load(DAILY_KEY, null);
    if (d && d.ymd === t.ymd && d.done && typeof d.done === "object") return d;
    return { ymd: t.ymd, n: t.n, done: {} };
  }
  function dailySeed() {
    var s = 0, c = combo();
    for (var i = 0; i < c.length; i++) s = (Math.imul(s, 31) + c.charCodeAt(i)) | 0;
    return ((today().n * 2654435761) >>> 0) ^ s ^ 0x5e7;
  }

  // ---- game state ------------------------------------------------------
  var deck = [];
  var board = []; // array of card objects (or null placeholder removed)
  var selected = []; // indices into board
  var tray = []; // Set-Chain: the last Hash's three cards, set aside
  var traySel = -1; // Set-Chain: the one of them picked, or -1
  var extra = null; // UltraSet: the third card the last UltraSet's pairs need
  var log = []; // what's been found this game: { cards, carried, extra }
  var setsFound = 0;
  var startTime = 0;
  var timerId = null;
  var banked = 0; // ms the clock ran before it was last held
  var penalty = 0; // ms added to the clock for hints used (30s each)
  var HINT_PENALTY = 30000;
  var locked = false; // brief lock during good/bad animation
  var over = false;
  var moved = false; // a Hash claimed, cards added or a hint taken this game
  var hintIds = []; // ids of the cards a hint has lit, until the table changes
  var gameNo = 0; // bumped by newGame, so a claim's slide-out from the last game stops
  var trayNew = false; // the tray's cards have just come in (they're dealt in)

  function $(id) { return document.getElementById(id); }
  var boardEl = $("board");
  var msgEl = $("msg");
  var subEl = $("subtitle");
  var statSets = $("statSets");
  var statSetsK = $("statSetsK");
  var statDeck = $("statDeck");
  var statTime = $("statTime");
  var statBest = $("statBest");
  var statBestK = $("statBestK");
  var trayEl = $("tray");
  var trayK = $("trayK");
  var trayCards = $("trayCards");
  var logN = $("logN");
  var logKey = $("logKey");
  var logList = $("logList");
  var logEmpty = $("logEmpty");
  var addBtn = $("addBtn");
  var hintBtn = $("hintBtn");
  var newBtn = $("newBtn");
  var juniorBtn = $("juniorBtn");
  var dailyBtn = $("dailyBtn");

  // ---- cards on the move (Visual FX on) ----------------------------------
  // New cards come face down from the deck's pile, left of the table, and
  // turn face up where they land; a claimed Hash's cards fly to where it's
  // kept: the Found list, or in Set-Chain the Last Hash beside the table.
  // Each flies as a stand-in drawn over the page while the card itself waits
  // unseen in its place (`arriving` on the table, `landing` in the list or
  // the tray), so a re-render meanwhile doesn't show it early.
  var pileEl = $("pile");
  var arriving = {}, landing = {}, flights = 0;   // (flights: which set of them, as a new game cancels the last)
  function fxOn() { return !(window.RM_ON && window.RM_ON()); }
  // where the pile is (and so where new cards start): beside the table's
  // first column where there's room, else just off the left of the screen
  function placePile() {
    var first = boardEl.querySelector(".card"), r = first ? first.getBoundingClientRect() : null;
    if (!r || !r.width) { pileEl.hidden = true; return null; }
    var left = Infinity, cards = boardEl.querySelectorAll(".card");
    for (var i = 0; i < cards.length; i++) left = Math.min(left, cards[i].getBoundingClientRect().left);
    // (a card's size, or smaller where the margin is narrower, down to half one)
    var b = boardEl.getBoundingClientRect(), w = Math.min(r.width, left - 32), h = w * r.height / r.width;
    var room = w >= r.width * 0.5;
    if (!room) { w = r.width; h = r.height; }
    var at = { x: room ? left - w - 22 : -w - 12, y: b.top + b.height / 2 - h / 2, w: w, h: h };
    pileEl.hidden = !room || deck.length === 0;
    pileEl.style.left = at.x + "px"; pileEl.style.top = at.y + "px";
    pileEl.style.width = w + "px"; pileEl.style.height = h + "px";
    return at;
  }
  // a stand-in flown from one box to another (scaled to fit), then gone
  function fly(el, from, to, opts, done) {
    el.classList.add("flyer");
    el.style.left = from.x + "px"; el.style.top = from.y + "px";
    el.style.width = from.w + "px"; el.style.height = from.h + "px";
    document.body.appendChild(el);
    var move = "translate(" + (to.x - from.x) + "px, " + (to.y - from.y) + "px) scale(" + (to.w / from.w) + ", " + (to.h / from.h) + ")";
    var frames = opts.turn
      ? [{ transform: "none" }, { transform: move, offset: 0.78 }, { transform: move + " perspective(600px) rotateY(90deg)" }]
      : [{ transform: "none" }, { transform: move }];
    var a = el.animate(frames, { duration: opts.duration, delay: opts.delay || 0, easing: opts.easing || "cubic-bezier(0.3, 0.7, 0.3, 1)", fill: "both" });
    var set = flights;
    a.onfinish = a.oncancel = function () { el.remove(); if (set === flights) done(); };
  }
  function boxOf(el) { var r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
  // new cards: from the pile, face down, turning face up where they land
  // (Visual FX off: the same trip, face up all the way, with no turn)
  function dealFromPile(ids) {
    var from = placePile();
    if (!from) { ids.forEach(function (id) { delete arriving[id]; }); return; }
    var step = ids.length > 6 ? 30 : 70;
    ids.forEach(function (id, k) {
      var el = boardEl.querySelector('.card[data-id="' + id + '"]');
      if (!el) { delete arriving[id]; return; }
      var turn = fxOn(), back;
      if (turn) { back = document.createElement("div"); back.className = "card back"; back.innerHTML = ""; }
      else { back = el.cloneNode(true); back.classList.remove("arriving"); back.removeAttribute("tabindex"); }
      fly(back, from, boxOf(el), { duration: 360, delay: k * step, turn: turn }, function () {
        delete arriving[id];
        var now = boardEl.querySelector('.card[data-id="' + id + '"]');
        if (!now) return;
        now.classList.remove("arriving");
        if (turn) now.animate([{ transform: "perspective(600px) rotateY(-90deg)" }, { transform: "none" }], { duration: 160, easing: "ease-out" });
      });
    });
  }
  // a claimed Hash: each card to its place in the Found list (or the tray)
  function flyToKept(sources, targetOf) {
    sources.forEach(function (s, k) {
      var to = targetOf(s.id);
      if (!to) return;
      landing[s.id] = true;
      to.classList.add("landing");
      var ghost = s.el.cloneNode(true);
      ghost.classList.remove("good", "selected", "hint", "dealt", "landing");
      ghost.removeAttribute("tabindex");
      var from = s.from || boxOf(s.el);
      s.el.classList.add("gone");
      fly(ghost, from, boxOf(to), { duration: 420, delay: k * 50, easing: "cubic-bezier(0.45, 0, 0.25, 1)" }, function () {
        delete landing[s.id];
        var now = targetOf(s.id);
        if (now) now.classList.remove("landing");
      });
    });
  }
  window.addEventListener("resize", function () { if (boardEl.children.length) placePile(); });
  function clearFlights() {
    arriving = {}; landing = {}; flights++;
    document.querySelectorAll(".flyer").forEach(function (f) { f.getAnimations().forEach(function (a) { a.cancel(); }); f.remove(); });
  }
  var overlay = $("overlay");
  var ovTitle = $("ovTitle");
  var ovBody = $("ovBody");
  var ovBtn = $("ovBtn");

  // The log stands beside the table on a wider window, How to play and the
  // byline under it. On a phone the table fills the screen, so all three go
  // below it (#below), where they take no height from the cards.
  var logEl = $("log");
  var sideEl = logEl.parentNode;
  var wrapEl = document.querySelector(".wrap");
  var belowEl = $("below");
  var rulesEl = document.querySelector(".rules");
  var bylineEl = $("byline");
  var WIDE = window.matchMedia ? window.matchMedia("(min-width: 860px)") : null;
  function placeLog() {
    var wide = !WIDE || WIDE.matches, to = wide ? null : belowEl;
    if (logEl.parentNode === (to || sideEl)) return;
    (to || sideEl).appendChild(logEl);
    (to || wrapEl).appendChild(rulesEl);
    (to || wrapEl).appendChild(bylineEl);
  }
  placeLog();
  if (WIDE) {
    if (WIDE.addEventListener) WIDE.addEventListener("change", placeLog);
    else if (WIDE.addListener) WIDE.addListener(placeLog);
  }

  function fmtTime(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    s = s % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function loadBest() {
    try {
      var v = localStorage.getItem(bestKey());
      return v ? parseInt(v, 10) : null;
    } catch (e) {
      return null;
    }
  }
  function saveBest(ms) {
    try {
      localStorage.setItem(bestKey(), "" + ms);
    } catch (e) {}
  }

  // Best: this way to play's fastest clear; on the Daily, today's first one
  function renderBest() {
    if (daily) {
      var d = readDaily().done[combo()];
      statBestK.textContent = "Today";
      statBest.textContent = d != null ? fmtTime(d) : "none";
      return;
    }
    var b = loadBest();
    statBestK.textContent = "Best";
    statBest.textContent = b ? fmtTime(b) : "none";
  }

  function setMsg(text, kind) {
    msgEl.textContent = text || "";
    msgEl.className = kind || "";
  }

  // ---- audio (gentle blips; respects the shared mute toggle) -----------
  var actx = null;
  function beep(freq, dur, type, vol) {
    if (window.MUTE_ON && window.MUTE_ON()) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator();
      var g = actx.createGain();
      o.type = type || "sine";
      o.frequency.value = freq;
      g.gain.value = vol || 0.06;
      o.connect(g);
      g.connect(actx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.stop(actx.currentTime + dur);
    } catch (e) {}
  }
  function goodSound() {
    beep(523, 0.12, "triangle");
    setTimeout(function () {
      beep(784, 0.16, "triangle");
    }, 90);
  }
  function badSound() {
    beep(160, 0.18, "sawtooth");
  }
  // soft, quiet UI ticks
  function selectSound() {
    beep(560, 0.05, "sine", 0.045);
  }
  function deselectSound() {
    beep(340, 0.05, "sine", 0.04);
  }
  function hintSound() {
    beep(880, 0.08, "sine", 0.05);
    setTimeout(function () {
      beep(1245, 0.1, "sine", 0.05);
    }, 80);
  }

  // ---- timer -----------------------------------------------------------
  // The clock starts when the deal is shown (newGame) and holds while the
  // game is paused (a hidden tab pauses it): what it ran before the last
  // hold is banked, and startTime is when it last started running.
  function clockMs() {
    return banked + (timerId ? Date.now() - startTime : 0);
  }
  function showTime() {
    statTime.textContent = fmtTime(clockMs() + penalty);
  }
  function startTimer() {
    if (timerId) return;
    startTime = Date.now();
    timerId = setInterval(showTime, 250);
  }
  function stopTimer() {
    if (!timerId) return;
    banked += Date.now() - startTime;
    clearInterval(timerId);
    timerId = null;
  }

  // ---- board rendering -------------------------------------------------
  // animIds: ids of cards that should play an entrance animation;
  // animClass: which one ("dealt" by default, "enter-left" for set refills).
  // inPlay: cards brought in during play (a refill, three more), which come
  // from the pile with Visual FX off too, as where a card goes is play; a
  // new game's deal comes from it with FX on only.
  function render(animIds, animClass, inPlay) {
    animClass = animClass || "dealt";
    var fromPile = (fxOn() || inPlay) && animIds && animIds.length > 0;
    // the cards are rebuilt on every change: keep keyboard focus on the same spot
    var focused = boardEl.contains(document.activeElement) ? +document.activeElement.dataset.idx : -1;
    boardEl.innerHTML = "";
    var nth = 0;   // the dealt cards' order, for the deal's stagger (styles.css)
    // 3 columns; widen rows gracefully when 12/15/18 cards.
    for (var i = 0; i < board.length; i++) {
      var card = board[i];
      var el = document.createElement("div");
      el.className = "card";
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.dataset.idx = i;
      el.setAttribute("aria-label", cardName(card));
      el.dataset.id = card.id;
      el.innerHTML = cardHTML(card);
      if (selected.indexOf(i) !== -1) el.classList.add("selected");
      // a hinted card glows until it's picked (then it shows as picked)
      else if (hintIds.indexOf(card.id) !== -1) el.classList.add("hint");
      if (animIds && animIds.indexOf(card.id) !== -1) {
        // from the pile (below), or (a new game's deal with FX off) as it always has
        if (fromPile) arriving[card.id] = true;
        else { el.classList.add(animClass); el.style.setProperty("--dd", nth++ * 20 + "ms"); }
      }
      if (arriving[card.id]) el.classList.add("arriving");
      boardEl.appendChild(el);
    }
    if (focused >= 0 && board.length)
      boardEl.children[Math.min(focused, board.length - 1)].focus({ preventScroll: true });
    statSets.textContent = setsFound;
    statDeck.textContent = deck.length;
    // Tell the CSS how many rows are on the table so cards can be sized to
    // fit the viewport height (no scrolling) whether it's 12, 15 or 18 cards.
    boardEl.style.setProperty("--rows", Math.max(1, Math.ceil(board.length / 3)));
    renderTray();
    if (fromPile) dealFromPile(animIds.filter(function (id) { return arriving[id]; }));
    else placePile();
  }

  // The tray, beside the table: in Set-Chain the last Hash's three cards
  // (one of them goes into the next Hash; before the first, three empty
  // places), in UltraSet the third card the last UltraSet's pairs needed.
  function renderTray() {
    trayEl.hidden = mode === "normal";
    if (mode === "normal") return;
    var focused = trayCards.contains(document.activeElement) ? +document.activeElement.dataset.tray : -1;
    var html = "";
    if (mode === "chain") {
      trayK.innerHTML = "<span>Last Hash</span>" + (tray.length ? '<span class="tk-use">use one</span>' : "");
      for (var i = 0; i < 3; i++) {
        var c = tray[i];
        if (!c) { html += '<div class="card slot" aria-hidden="true"></div>'; continue; }
        var cls = "card" + (traySel === i ? " selected" : hintIds.indexOf(c.id) !== -1 ? " hint" : "") + (trayNew ? " dealt" : "") + (landing[c.id] ? " landing" : "");
        html += '<div class="' + cls + '" role="button" tabindex="0" data-tray="' + i + '" data-id="' + c.id + '" aria-label="' + cardName(c) + ', from the last Hash">' + cardHTML(c) + "</div>";
      }
    } else {
      trayK.textContent = "Extra card";
      html = extra
        ? '<div class="card extra' + (trayNew ? " dealt" : "") + '" role="img" aria-label="' + cardName(extra) + ', the card both pairs need">' + cardHTML(extra) + "</div>"
        : '<div class="card slot" aria-hidden="true"></div>';
    }
    trayNew = false;
    trayCards.innerHTML = html;
    if (focused >= 0 && trayCards.querySelector('[data-tray="' + focused + '"]'))
      trayCards.querySelector('[data-tray="' + focused + '"]').focus({ preventScroll: true });
  }

  // The log of what's been found this game, newest first: each Hash's three
  // cards (in Set-Chain the one carried from the last Hash ringed), or each
  // UltraSet's two pairs and the extra card they need.
  function miniHTML(card, cls, label) {
    return '<span class="mini' + (cls ? " " + cls : "") + (landing[card.id] ? " landing" : "") + '" role="img" data-id="' + card.id + '" aria-label="' + (label || cardName(card)) + '">' + cardHTML(card) + "</span>";
  }
  function renderLog() {
    logN.textContent = log.length;
    logEmpty.hidden = log.length > 0;
    logEmpty.textContent = "No " + MODES[mode].found + " yet";
    logKey.hidden = mode === "normal";
    logKey.textContent = mode === "chain" ? "Ringed: the card from the last Hash" : "Two pairs, then the card both need";
    var html = "";
    for (var k = log.length - 1; k >= 0; k--) {
      var f = log[k], body = "";
      if (f.extra) {
        body =
          '<span class="pair">' + miniHTML(f.cards[0]) + miniHTML(f.cards[1]) + "</span>" +
          '<span class="pair">' + miniHTML(f.cards[2]) + miniHTML(f.cards[3]) + "</span>" +
          '<span class="need" aria-hidden="true">→</span>' + miniHTML(f.extra, "extra", cardName(f.extra) + ", the card both pairs need");
      } else {
        body = f.cards.map(function (c, i) {
          return i === f.carried ? miniHTML(c, "carried", cardName(c) + ", from the last Hash") : miniHTML(c);
        }).join("");
      }
      html += "<li" + (f.extra ? ' class="ultra"' : "") + '><span class="log-no">' + (k + 1) + "</span>" + body + "</li>";
    }
    logList.innerHTML = html;
  }

  // The rule line under the title, for the way being played
  function renderRules() {
    var each = "<em>all&nbsp;same</em> or <em>all&nbsp;different</em>";
    subEl.innerHTML =
      mode === "chain"
        ? "Find a trio, each feature " + each + ", using <b>one card</b> of the last."
        : mode === "ultra"
        ? "<b>Two pairs</b> that need <b>one same card</b> to make a trio: each feature " + each + "."
        : junior
        ? "Find a trio where <b>number</b>, <b>shape</b> &amp; <b>color</b> are each " + each + "."
        : "Find a trio where <b>number</b>, <b>shape</b>, <b>shading</b> &amp; <b>color</b> are each " + each + ".";
    statSetsK.textContent = MODES[mode].found;
    document.querySelectorAll("#modeRow .chip").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.mode === mode ? "true" : "false");
    });
    juniorBtn.setAttribute("aria-pressed", junior ? "true" : "false");
    dailyBtn.setAttribute("aria-pressed", daily ? "true" : "false");
  }

  // Deal from deck until board has at least `target` cards (or deck empty).
  function dealUpTo(target) {
    var added = [];
    while (board.length < target && deck.length > 0) {
      var c = deck.pop();
      board.push(c);
      added.push(c.id);
    }
    return added;
  }

  // What can be claimed on the table now, its cards in the order a hint
  // shows them (null if nothing): any Hash; in Set-Chain after the first, a
  // Hash with one of the tray's cards (that card first); an UltraSet, by
  // its pairs.
  function findAny() {
    var at;
    if (mode === "ultra") {
      at = findUltra(board);
      return at && at.map(function (i) { return board[i]; });
    }
    if (mode === "chain" && tray.length) {
      for (var t = 0; t < tray.length; t++)
        for (var i = 0; i < board.length - 1; i++)
          for (var j = i + 1; j < board.length; j++)
            if (isSet(tray[t], board[i], board[j])) return [tray[t], board[i], board[j]];
      return null;
    }
    at = findSet(board);
    return at && at.map(function (i) { return board[i]; });
  }

  // ---- selection / claim ----------------------------------------------
  function picks() { return selected.length + (traySel >= 0 ? 1 : 0); }

  function onCardActivate(idx) {
    if (locked || over || PAUSE.isPaused()) return;
    var pos = selected.indexOf(idx);
    if (pos !== -1) {
      selected.splice(pos, 1);
      deselectSound();
      render();
      return;
    }
    if (picks() >= MODES[mode].need) return;
    selected.push(idx);
    selectSound();
    setMsg("");
    render();
    if (picks() === MODES[mode].need) evaluate();
  }

  // Set-Chain: one of the last Hash's cards (picking another swaps it: only
  // one of them goes into a Hash)
  function onTrayActivate(i) {
    if (locked || over || PAUSE.isPaused() || mode !== "chain" || !tray[i]) return;
    if (traySel === i) {
      traySel = -1;
      deselectSound();
      render();
      return;
    }
    if (traySel < 0 && picks() >= 3) return;
    traySel = i;
    selectSound();
    setMsg("");
    render();
    if (picks() === 3) evaluate();
  }

  function evaluate() {
    var cs = selected.map(function (i) { return board[i]; });
    locked = true;
    if (mode === "ultra") {
      var u = ultraOf(cs);
      if (u) claimGood(u);
      else claimBad("Not an UltraSet: no two pairs need the same third card.");
      return;
    }
    if (mode === "chain" && tray.length) {
      if (traySel < 0)
        claimBad(isSet(cs[0], cs[1], cs[2])
          ? "That's a Hash, but in Set-Chain it needs one card from the last Hash."
          : "Not a Hash, and it needs one card from the last Hash.");
      else if (isSet(tray[traySel], cs[0], cs[1])) claimGood({ cards: [tray[traySel], cs[0], cs[1]], carried: 0 });
      else claimBad();
      return;
    }
    if (isSet(cs[0], cs[1], cs[2])) claimGood({ cards: cs, carried: -1 });
    else claimBad();
  }

  function claimGood(found) {
    setsFound++;
    moved = true;
    hintIds = []; // the table changes: a new hint is a new Hash
    goodSound();
    setMsg(MODES[mode].one + "! ✓", "good");
    locked = true;
    var cardEls = boardEl.querySelectorAll(".card");
    var sel = selected.slice(); // the claimed grid positions
    var trayHit = traySel >= 0 && trayCards.querySelector('[data-tray="' + traySel + '"]'), flown = false;
    var game = gameNo;

    // into the log now; the tray shows its new card(s) with the refill
    log.push({ cards: found.cards, carried: found.carried == null ? -1 : found.carried, extra: found.extra || null });
    renderLog();
    if (mode === "chain") tray = found.cards.slice();
    if (mode === "ultra") extra = found.extra;

    // The table's next state is settled now and only shown once the trio has
    // slid out (phase 2), so the deck's last Hash stops the clock and saves a
    // best time the moment it's claimed, not after the animation.
    var newIds = replaceInPlace(sel);
    newIds = newIds.concat(ensureSetAvailable());
    var result = !findAny() && deck.length === 0 ? finish() : null;

    sel.forEach(function (i) {
      if (cardEls[i]) cardEls[i].classList.add("good");
    });
    if (trayHit) trayHit.classList.add("good");

    // Phase 1: hold the green highlight, then fly the cards (with Visual FX
    // on or off: where they go is play) to where the find is kept: in
    // Set-Chain the Last Hash beside the table, the tray shown with its new
    // cards now; else this find's row in the Found list. (Nowhere to go: slide
    // the trio out to the right, through an imaginary column past the
    // rightmost cards; with FX off it stays put, claimed, until the refill.)
    setTimeout(function () {
      if (game !== gameNo) return;
      // (where each card is now, taken before the tray is drawn anew)
      var sources = [];
      sel.forEach(function (i) { if (cardEls[i]) sources.push({ el: cardEls[i], id: cardEls[i].dataset.id, from: boxOf(cardEls[i]) }); });
      if (trayHit) sources.unshift({ el: trayHit, id: trayHit.dataset.id, from: boxOf(trayHit) });
      var targetOf = mode === "chain"
        ? function (id) { return trayCards.querySelector('.card[data-id="' + id + '"]'); }
        : function (id) { var r = logList.firstElementChild; return r && r.querySelector('.mini[data-id="' + id + '"]'); };
      if (mode === "chain") renderTray();
      var kept = sources.length > 0 && sources.every(function (s) { var t = targetOf(s.id); return t && t.getClientRects().length; });
      if (kept) { flown = true; flyToKept(sources, targetOf); return; }
      sel.forEach(function (i) {
        if (cardEls[i]) {
          cardEls[i].classList.remove("good");
          cardEls[i].classList.add("exit-right");
        }
      });
    }, 240);

    // Phase 2: once they've left, show the replacements (dealt above) IN THE
    // SAME CELLS so the other cards never move, and bring the new cards in
    // from the left.
    setTimeout(function () {
      if (game !== gameNo) return; // a new game was dealt meanwhile
      selected = [];
      traySel = -1;
      trayNew = !flown;   // (cards flown into the tray are in already)
      render(newIds, "enter-left", true);
      locked = false;
      updateAddBtn();
      if (result) endGame(result);
    }, 240 + 360);
  }

  // Swap each claimed card for a fresh one in the SAME slot (so positions are
  // stable), while the table is at 12 or under; a table dealt past 12 (no
  // Hash there) shrinks back toward 12 instead, its highest slots going
  // first. Returns the ids of the new cards for the entrance animation.
  function replaceInPlace(sel) {
    var newIds = [];
    var holes = [];
    var excess = Math.max(0, board.length - 12);
    sel
      .slice()
      .sort(function (a, b) {
        return b - a;
      })
      .forEach(function (i) {
        if (excess > 0) {
          holes.push(i);
          excess--;
        } else if (deck.length > 0) {
          var c = deck.pop();
          board[i] = c;
          newIds.push(c.id);
        } else {
          holes.push(i); // deck ran dry: this slot can't be refilled
        }
      });
    // Remove the unfilled slots, high → low so indices stay valid.
    holes
      .sort(function (a, b) {
        return b - a;
      })
      .forEach(function (i) {
        board.splice(i, 1);
      });
    return newIds;
  }

  // If nothing can be claimed on the table, deal three more until something
  // can (or the deck is empty). Returns ids of any cards added so they
  // animate in too.
  function ensureSetAvailable() {
    var ids = [];
    var guard = 0;
    while (!findAny() && deck.length > 0 && guard < 30) {
      ids = ids.concat(dealUpTo(board.length + 3));
      guard++;
    }
    return ids;
  }

  function claimBad(text) {
    badSound();
    setMsg(text || "Not a Hash: two-and-one somewhere.", "bad");
    var cards = boardEl.querySelectorAll(".card");
    selected.forEach(function (i) {
      if (cards[i]) cards[i].classList.add("bad");
    });
    var t = traySel >= 0 && trayCards.querySelector('[data-tray="' + traySel + '"]');
    if (t) t.classList.add("bad");
    setTimeout(function () {
      selected = [];
      traySel = -1;
      locked = false;
      render();
    }, 360);
  }

  function updateAddBtn() {
    // Allow manual add only when more cards remain.
    addBtn.disabled = deck.length === 0;
  }

  function onAdd() {
    if (locked || over || PAUSE.isPaused()) return;
    if (deck.length === 0) return;
    if (findAny()) {
      // There WAS one: gentle nudge, no new cards.
      setMsg(
        mode === "chain" && tray.length
          ? "There's a Hash with a card from the last one: keep looking! 👀"
          : "There's already " + (mode === "ultra" ? "an UltraSet" : "a Hash") + " on the table: keep looking! 👀",
        "info"
      );
      badSound();
      return;
    }
    var dealt = dealUpTo(board.length + 3);
    moved = true;
    hintIds = [];
    setMsg("Dealt 3 more cards.", "info");
    render(dealt, null, true);
    updateAddBtn();
  }

  function onHint() {
    if (locked || over || PAUSE.isPaused()) return;
    var one = MODES[mode].one, an = mode === "ultra" ? "an " : "a ";
    var trio = findAny();
    if (!trio) {
      setMsg("No " + one + " on the table: add more cards.", "info");
      return;
    }
    // Highlight one card of it; reveal a second on a repeat press. (The
    // table is the same until hintIds is cleared, so findAny's cards are
    // too.) In Set-Chain the first is the card from the last Hash; in
    // UltraSet the two are a pair.
    var already = hintIds.length;
    var reveal = Math.min(already + 1, 2); // never give away all of it
    if (reveal <= already) {
      // Both cards are already showing: no new info, so no extra charge.
      setMsg("Two cards of " + an + one + " are already glowing. 💡", "info");
      return;
    }
    hintIds = trio.slice(0, reveal).map(function (c) {
      return c.id;
    });
    render();
    hintSound();
    // Hints aren't free: add a 30s time penalty and show it on the clock now.
    penalty += HINT_PENALTY;
    moved = true;
    showTime();
    setMsg(
      (reveal === 1
        ? "Hint: one card of " + an + one + " is glowing. 💡"
        : "Hint: two cards of " + an + one + " are glowing. 💡") + " (+30s)",
      "info"
    );
  }

  // ---- end / start -----------------------------------------------------
  // The deck's last Hash is claimed: the clock stops and a best time (on
  // the Daily, today's first clear) is saved right then (claimGood),
  // before the trio slides out...
  function finish() {
    over = true;
    stopTimer();
    var total = clockMs() + penalty; // hint penalties count toward the final time; paused time doesn't
    if (daily) {
      var d = readDaily(), before = d.done[combo()];
      if (before == null) {
        d.done[combo()] = total;
        save(DAILY_KEY, d);
      }
      renderBest();
      return { total: total, daily: d.n, before: before };
    }
    var best = loadBest();
    var isBest = best === null || total < best;
    if (isBest) {
      saveBest(total);
      renderBest();
    }
    return { total: total, isBest: isBest };
  }

  // the way being played, as the end card names it
  function comboName() {
    return MODES[mode].name + (junior ? ", Junior" : "") + (daily ? ", Daily No. " + today().n : "");
  }

  // ...and the board-cleared card follows once it has
  function endGame(result) {
    var total = result.total;
    var hints = Math.round(penalty / HINT_PENALTY);
    ovTitle.textContent = mode === "normal" ? "Board cleared! 🎉" : "Deck cleared! 🎉";
    ovBody.innerHTML =
      "<span class='ov-mode'>" + comboName() + "</span><br>" +
      "You found <b>" +
      setsFound +
      "</b> " + (setsFound === 1 ? MODES[mode].one : MODES[mode].found) + " and emptied the deck in <b>" +
      fmtTime(total) +
      "</b>." +
      (hints > 0
        ? " <span style='color:var(--coral)'>(incl. +" +
          hints * 30 +
          "s for " +
          hints +
          " hint" +
          (hints === 1 ? "" : "s") +
          ")</span>"
        : "") +
      (result.daily
        ? result.before != null
          ? "<br><span style='color:var(--gold)'>Today's Daily was recorded earlier: " + fmtTime(result.before) + "</span>"
          : "<br><span style='color:var(--emerald);font-weight:600'>Today's Daily, recorded!</span>"
        : result.isBest
        ? "<br><span style='color:var(--emerald);font-weight:600'>New best time!</span>"
        : "");
    overlay.hidden = false;
  }

  function newGame() {
    gameNo++;
    clearFlights();
    over = false;
    moved = false;
    locked = false;
    selected = [];
    traySel = -1;
    tray = [];
    extra = null;
    log = [];
    hintIds = [];
    setsFound = 0;
    penalty = 0;
    deck = shuffle(buildDeck(junior), daily ? mulberry(dailySeed()) : null);
    board = [];
    overlay.hidden = true;
    // (the rule line above says how this mode plays; a Daily says which)
    setMsg(daily ? "Daily No. " + today().n + ", the same for everyone" : "", daily ? "info" : "");
    var dealt = dealUpTo(12);
    // Guarantee an opening one exists (deal more if the first 12 have none).
    dealt = dealt.concat(ensureSetAvailable());
    renderRules();
    render(dealt);
    renderLog();
    renderBest();
    updateAddBtn();
    // The clock starts with the deal shown. A deal in a hidden tab (a page
    // opened in the background, New game while hidden) never gets the hide
    // that auto-pauses, so it starts paused instead, cards blank.
    stopTimer();
    banked = 0;
    statTime.textContent = "0:00";
    if (document.hidden) PAUSE.pause();
    else if (PAUSE.isPaused()) PAUSE.resume(); // (which starts the clock)
    else startTimer();
  }

  // Normal / Set-Chain / UltraSet, Junior and Daily: each change deals a new
  // game in the new way (asking first mid-deck, as New game does) and is
  // remembered for next time
  function choose(next) {
    if (next.mode === mode && next.junior === junior && next.daily === daily) return;
    function go() {
      mode = next.mode;
      junior = next.junior;
      daily = next.daily;
      save(PREFS_KEY, { mode: mode, junior: junior, daily: daily });
      newGame();
    }
    if (window.GameShell && GameShell.askQuit) GameShell.askQuit({ title: "Start a new game?", ok: "New game" }, go);
    else go();
  }

  // ---- events ----------------------------------------------------------
  boardEl.addEventListener("click", function (e) {
    var el = e.target.closest(".card");
    if (!el) return;
    onCardActivate(parseInt(el.dataset.idx, 10));
  });
  trayCards.addEventListener("click", function (e) {
    var el = e.target.closest("[data-tray]");
    if (el) onTrayActivate(parseInt(el.dataset.tray, 10));
  });
  // A click or a tap doesn't leave the card focused: the focus ring is the
  // keyboard's (Tab walks the cards), and a key pressed after a click (H for
  // a hint, A for more cards) used to outline the card last clicked
  boardEl.addEventListener("mousedown", function (e) { if (e.target.closest(".card")) e.preventDefault(); });
  trayCards.addEventListener("mousedown", function (e) { if (e.target.closest(".card")) e.preventDefault(); });
  boardEl.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (e.repeat) return; // one toggle per physical press
    var el = e.target.closest(".card");
    if (!el) return;
    e.preventDefault();
    onCardActivate(parseInt(el.dataset.idx, 10));
  });
  trayCards.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (e.repeat) return;
    var el = e.target.closest("[data-tray]");
    if (!el) return;
    e.preventDefault();
    onTrayActivate(parseInt(el.dataset.tray, 10));
  });
  addBtn.addEventListener("click", onAdd);
  hintBtn.addEventListener("click", onHint);
  // ↻ New game throws a game in progress away, so mid-deck it asks first
  // (by the leave guard below), paused underneath; a fresh deal goes at once
  newBtn.addEventListener("click", function () {
    if (window.GameShell && GameShell.askQuit) GameShell.askQuit({ title: "Start a new game?", ok: "New game" }, newGame);
    else newGame();
  });
  ovBtn.addEventListener("click", newGame);
  document.querySelectorAll("#modeRow .chip").forEach(function (b) {
    b.addEventListener("click", function () { choose({ mode: b.dataset.mode, junior: junior, daily: daily }); });
  });
  juniorBtn.addEventListener("click", function () { choose({ mode: mode, junior: !junior, daily: daily }); });
  dailyBtn.addEventListener("click", function () { choose({ mode: mode, junior: junior, daily: !daily }); });
  // Keys, shown on the buttons: A adds three cards, H is the hint, N a new
  // game (which asks first mid-deck, as its click does); 1 2 3 the modes, J
  // Junior and D the Daily (asking first too); on the cleared-board card
  // Enter plays again. None of them under the pause card.
  if (window.GameShell && GameShell.menuKeys) {
    GameShell.menuKeys({
      active: function () { return overlay.hidden && !PAUSE.isPaused(); },
      groups: [{ sel: "#addBtn", keys: ["a"] }, { sel: "#hintBtn", keys: ["h"] }, { sel: "#newBtn", keys: ["n"] },
        { sel: "#modeRow .chip", keys: ["1", "2", "3"] }, { sel: "#juniorBtn", keys: ["j"] }, { sel: "#dailyBtn", keys: ["d"] },
        { sel: ".rules > summary", keys: ["i"], caps: false }]   // (I opens or shuts How to play, its key on its line)
    });
    GameShell.menuKeys({ active: function () { return !overlay.hidden; }, start: "#ovBtn", space: true });
  }

  // P, the ⏸ button and a hidden tab pause the game from the deal
  // until the deck is cleared. The pause card is see-through, so the cards
  // go blank under it (styles.css): a pause is no time to look for Hashes.
  var PAUSE =
    window.GameShell && GameShell.pausable
      ? GameShell.pausable({
          canPause: function () {
            return !over;
          },
          onChange: function (paused) {
            boardEl.classList.toggle("paused", paused);
            trayEl.classList.toggle("paused", paused);
            if (paused) stopTimer();
            else if (!over) startTimer();
          },
          restart: newGame,     // on the card: a new deal (there is no menu)
        })
      : // (no shell, no pausing: the clock just runs)
        { isPaused: function () { return false; }, pause: startTimer, resume: function () {} };

  // Leaving asks first once the game has begun (a Hash claimed, cards added
  // or a hint taken) until the deck is cleared; an untouched deal loses
  // nothing. The game is paused under the question, clock held, cards blank.
  if (window.GameShell && GameShell.guardLeave)
    GameShell.guardLeave({
      active: function () {
        return moved && !over;
      },
      pausable: PAUSE,
    });

  // ---- go --------------------------------------------------------------
  renderBest();
  newGame();
})();
