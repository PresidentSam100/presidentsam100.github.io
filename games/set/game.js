/* =====================================================================
   Set — the classic card game.

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
  function buildDeck() {
    var deck = [];
    for (var n = 0; n < 3; n++)
      for (var sh = 0; sh < 3; sh++)
        for (var sd = 0; sd < 3; sd++)
          for (var c = 0; c < 3; c++) {
            deck.push({
              n: n + 1,
              shape: SHAPES[sh],
              shading: SHADINGS[sd],
              color: COLOR_KEYS[c],
              code: [n, sh, sd, c],
              id: "" + n + sh + sd + c,
            });
          }
    return deck;
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
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

  // ---- game state ------------------------------------------------------
  var BEST_KEY = "set_best_time";
  var TOTAL = 81;

  var deck = [];
  var board = []; // array of card objects (or null placeholder removed)
  var selected = []; // indices into board
  var setsFound = 0;
  var startTime = 0;
  var timerId = null;
  var elapsed = 0;
  var penalty = 0; // ms added to the clock for hints used (30s each)
  var HINT_PENALTY = 30000;
  var locked = false; // brief lock during good/bad animation
  var over = false;

  var boardEl = document.getElementById("board");
  var msgEl = document.getElementById("msg");
  var statSets = document.getElementById("statSets");
  var statDeck = document.getElementById("statDeck");
  var statTime = document.getElementById("statTime");
  var statBest = document.getElementById("statBest");
  var addBtn = document.getElementById("addBtn");
  var hintBtn = document.getElementById("hintBtn");
  var newBtn = document.getElementById("newBtn");
  var overlay = document.getElementById("overlay");
  var ovTitle = document.getElementById("ovTitle");
  var ovBody = document.getElementById("ovBody");
  var ovBtn = document.getElementById("ovBtn");

  function fmtTime(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    s = s % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function loadBest() {
    try {
      var v = localStorage.getItem(BEST_KEY);
      return v ? parseInt(v, 10) : null;
    } catch (e) {
      return null;
    }
  }
  function saveBest(ms) {
    try {
      localStorage.setItem(BEST_KEY, "" + ms);
    } catch (e) {}
  }

  function renderBest() {
    var b = loadBest();
    statBest.textContent = b ? fmtTime(b) : "—";
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
  function startTimer() {
    startTime = Date.now();
    elapsed = 0;
    if (timerId) clearInterval(timerId);
    timerId = setInterval(function () {
      elapsed = Date.now() - startTime;
      statTime.textContent = fmtTime(elapsed + penalty);
    }, 250);
  }
  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  // ---- board rendering -------------------------------------------------
  // animIds: ids of cards that should play an entrance animation;
  // animClass: which one ("dealt" by default, "enter-left" for set refills).
  function render(animIds, animClass) {
    animClass = animClass || "dealt";
    boardEl.innerHTML = "";
    // 3 columns; widen rows gracefully when 12/15/18 cards.
    for (var i = 0; i < board.length; i++) {
      var card = board[i];
      var el = document.createElement("div");
      el.className = "card";
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.dataset.idx = i;
      el.setAttribute(
        "aria-label",
        card.n +
          " " +
          card.color +
          " " +
          card.shading +
          " " +
          card.shape +
          (card.n > 1 ? "s" : "")
      );
      el.innerHTML = cardHTML(card);
      if (selected.indexOf(i) !== -1) el.classList.add("selected");
      if (animIds && animIds.indexOf(card.id) !== -1)
        el.classList.add(animClass);
      boardEl.appendChild(el);
    }
    statSets.textContent = setsFound;
    statDeck.textContent = deck.length;
    // Tell the CSS how many rows are on the table so cards can be sized to
    // fit the viewport height (no scrolling) whether it's 12, 15 or 18 cards.
    boardEl.style.setProperty("--rows", Math.max(1, Math.ceil(board.length / 3)));
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

  // ---- selection / claim ----------------------------------------------
  function onCardActivate(idx) {
    if (locked || over) return;
    var pos = selected.indexOf(idx);
    if (pos !== -1) {
      selected.splice(pos, 1);
      deselectSound();
      render();
      return;
    }
    if (selected.length >= 3) return;
    selected.push(idx);
    selectSound();
    setMsg("");
    render();
    if (selected.length === 3) evaluate();
  }

  function evaluate() {
    var a = board[selected[0]],
      b = board[selected[1]],
      c = board[selected[2]];
    locked = true;
    if (isSet(a, b, c)) {
      claimGood();
    } else {
      claimBad();
    }
  }

  function claimGood() {
    setsFound++;
    goodSound();
    setMsg("Set! ✓", "good");
    locked = true;
    var cardEls = boardEl.querySelectorAll(".card");
    var sel = selected.slice(); // the three claimed grid positions

    sel.forEach(function (i) {
      if (cardEls[i]) cardEls[i].classList.add("good");
    });

    // Phase 1 — hold the green highlight, then slide the trio out to the right
    // (through an imaginary column past the rightmost cards).
    setTimeout(function () {
      sel.forEach(function (i) {
        if (cardEls[i]) {
          cardEls[i].classList.remove("good");
          cardEls[i].classList.add("exit-right");
        }
      });
    }, 240);

    // Phase 2 — once they've left, drop replacements INTO THE SAME CELLS so the
    // other nine cards never move, and bring the new cards in from the left.
    setTimeout(function () {
      var newIds = replaceInPlace(sel);
      newIds = newIds.concat(ensureSetAvailable());
      selected = [];
      render(newIds, "enter-left");
      locked = false;
      updateAddBtn();
      if (!findSet(board) && deck.length === 0) endGame();
    }, 240 + 360);
  }

  // Swap each claimed card for a fresh one in the SAME slot (so positions are
  // stable). Returns the ids of the new cards for the entrance animation.
  function replaceInPlace(sel) {
    var newIds = [];
    if (board.length <= 12) {
      var holes = [];
      sel.forEach(function (i) {
        if (deck.length > 0) {
          var c = deck.pop();
          board[i] = c;
          newIds.push(c.id);
        } else {
          holes.push(i); // deck ran dry — this slot can't be refilled
        }
      });
      // Remove any unfilled slots, high → low so indices stay valid.
      holes
        .sort(function (a, b) {
          return b - a;
        })
        .forEach(function (i) {
          board.splice(i, 1);
        });
    } else {
      // Extra rows were dealt (15/18 cards): claimed cards aren't replaced —
      // the board shrinks back toward 12 (standard Set rule).
      sel
        .slice()
        .sort(function (a, b) {
          return b - a;
        })
        .forEach(function (i) {
          board.splice(i, 1);
        });
    }
    return newIds;
  }

  // If no set is on the table, deal three more until one is (or the deck is
  // empty). Returns ids of any cards added so they animate in too.
  function ensureSetAvailable() {
    var ids = [];
    var guard = 0;
    while (!findSet(board) && deck.length > 0 && guard < 30) {
      ids = ids.concat(dealUpTo(board.length + 3));
      guard++;
    }
    return ids;
  }

  function claimBad() {
    badSound();
    setMsg("Not a Set — two-and-one somewhere.", "bad");
    var cards = boardEl.querySelectorAll(".card");
    selected.forEach(function (i) {
      if (cards[i]) cards[i].classList.add("bad");
    });
    setTimeout(function () {
      selected = [];
      locked = false;
      render();
    }, 360);
  }

  function updateAddBtn() {
    // Allow manual add only when more cards remain.
    addBtn.disabled = deck.length === 0;
  }

  function onAdd() {
    if (locked || over) return;
    if (deck.length === 0) return;
    if (findSet(board)) {
      // There WAS a set — gentle nudge, no new cards.
      setMsg("There's already a Set on the table — keep looking! 👀", "info");
      badSound();
      return;
    }
    var dealt = dealUpTo(board.length + 3);
    setMsg("Dealt 3 more cards.", "info");
    render(dealt);
    updateAddBtn();
  }

  function onHint() {
    if (locked || over) return;
    var trio = findSet(board);
    if (!trio) {
      setMsg("No Set on the table — add more cards.", "info");
      return;
    }
    // Highlight one card of a valid set; reveal a second on a repeat press.
    var cards = boardEl.querySelectorAll(".card");
    var already = boardEl.querySelectorAll(".card.hint").length;
    var reveal = Math.min(already + 1, 2); // never give away all three
    if (reveal <= already) {
      // Both cards are already showing — no new info, so no extra charge.
      setMsg("Two cards of a Set are already glowing. 💡", "info");
      return;
    }
    for (var i = 0; i < reveal; i++) {
      if (cards[trio[i]]) cards[trio[i]].classList.add("hint");
    }
    hintSound();
    // Hints aren't free — add a 30s time penalty and show it on the clock now.
    penalty += HINT_PENALTY;
    elapsed = Date.now() - startTime;
    statTime.textContent = fmtTime(elapsed + penalty);
    setMsg(
      (reveal === 1
        ? "Hint: one card of a Set is glowing. 💡"
        : "Hint: two cards of a Set are glowing. 💡") + " (+30s)",
      "info"
    );
  }

  // ---- end / start -----------------------------------------------------
  function endGame() {
    over = true;
    stopTimer();
    elapsed = Date.now() - startTime;
    var total = elapsed + penalty; // hint penalties count toward the final time
    var best = loadBest();
    var isBest = best === null || total < best;
    if (isBest) {
      saveBest(total);
      renderBest();
    }
    var hints = Math.round(penalty / HINT_PENALTY);
    ovTitle.textContent = "Board cleared! 🎉";
    ovBody.innerHTML =
      "You found <b>" +
      setsFound +
      "</b> sets and emptied the deck in <b>" +
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
      (isBest ? "<br><span style='color:var(--good)'>New best time!</span>" : "");
    overlay.hidden = false;
  }

  function newGame() {
    over = false;
    locked = false;
    selected = [];
    setsFound = 0;
    penalty = 0;
    deck = shuffle(buildDeck());
    board = [];
    overlay.hidden = true;
    setMsg("");
    var dealt = dealUpTo(12);
    // Guarantee an opening set exists (deal more if the first 12 have none).
    var guard = 0;
    while (!findSet(board) && deck.length > 0 && guard < 30) {
      dealt = dealt.concat(dealUpTo(board.length + 3));
      guard++;
    }
    render(dealt);
    renderBest();
    updateAddBtn();
    startTimer();
    statTime.textContent = "0:00";
  }

  // ---- events ----------------------------------------------------------
  boardEl.addEventListener("click", function (e) {
    var el = e.target.closest(".card");
    if (!el) return;
    onCardActivate(parseInt(el.dataset.idx, 10));
  });
  boardEl.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var el = e.target.closest(".card");
    if (!el) return;
    e.preventDefault();
    onCardActivate(parseInt(el.dataset.idx, 10));
  });
  addBtn.addEventListener("click", onAdd);
  hintBtn.addEventListener("click", onHint);
  newBtn.addEventListener("click", newGame);
  ovBtn.addEventListener("click", newGame);

  // ---- go --------------------------------------------------------------
  renderBest();
  newGame();
})();
