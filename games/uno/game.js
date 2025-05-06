"use strict";

// ----------------------------------------------------------------
//  Constants
// ----------------------------------------------------------------
var COLORS = ["red", "yellow", "green", "blue"];
var COLOR_HEX = {
  red: "#d3322f",
  yellow: "#f5b912",
  green: "#2f9e44",
  blue: "#1c7ed6",
};
// Symbols for action / wild cards
var GLYPH = {
  skip: "🚫",
  reverse: "🔄",
  draw2: "+2",
  wild: "W",
  wild4: "+4",
  shuffle: "🔀",
  custom: "★",
};
var POINTS = { skip: 20, reverse: 20, draw2: 20 };

// ----------------------------------------------------------------
//  Game state
// ----------------------------------------------------------------
var G = null; // current game
var cfg = { players: 4, mode: "single", custom: ["", "", ""] };
var totals = []; // running point totals across hands

// ----------------------------------------------------------------
//  Deck building
// ----------------------------------------------------------------
var uid = 0;
function mk(color, type, value, customText) {
  return {
    id: ++uid,
    color: color,
    type: type,
    value: value == null ? null : value,
    customText: customText || null,
  };
}

function buildDeck() {
  var d = [];
  COLORS.forEach(function (c) {
    d.push(mk(c, "number", 0)); // one 0 per color
    for (var v = 1; v <= 9; v++) {
      d.push(mk(c, "number", v));
      d.push(mk(c, "number", v));
    }
    // two each of skip / reverse / draw2
    ["skip", "reverse", "draw2"].forEach(function (t) {
      d.push(mk(c, t));
      d.push(mk(c, t));
    });
  });
  for (var i = 0; i < 4; i++) d.push(mk("wild", "wild"));
  for (var j = 0; j < 4; j++) d.push(mk("wild", "wild4"));
  d.push(mk("wild", "shuffle")); // one Shuffle Hands
  // three customizable wilds, each carrying its written rule
  for (var k = 0; k < 3; k++) {
    var txt = (cfg.custom[k] || "").trim() || "Custom rule #" + (k + 1);
    d.push(mk("wild", "custom", null, txt));
  }
  return d;
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

// ----------------------------------------------------------------
//  Helpers
// ----------------------------------------------------------------
function topCard() {
  return G.discard[G.discard.length - 1];
}
function isWildType(c) {
  return (
    c.type === "wild" ||
    c.type === "wild4" ||
    c.type === "shuffle" ||
    c.type === "custom"
  );
}
function neighbor(i, k) {
  var n = G.players.length;
  return ((i + G.dir * k) % n + n) % n;
}
function cardValuePoints(c) {
  if (c.type === "number") return c.value;
  if (POINTS[c.type] != null) return POINTS[c.type];
  return 50; // all wilds
}

// Can `card` legally be placed on the current top, given active color?
function canPlay(card) {
  if (isWildType(card)) return true; // wild4 bluffing allowed; challenge handles legality
  var t = topCard();
  if (card.color === G.currentColor) return true;
  if (card.type === "number" && t.type === "number" && card.value === t.value)
    return true;
  if (card.type !== "number" && card.type === t.type) return true;
  return false;
}

// ----------------------------------------------------------------
//  Setup screen wiring
// ----------------------------------------------------------------
document.querySelectorAll("#playerSeg button").forEach(function (b) {
  b.addEventListener("click", function () {
    document
      .querySelectorAll("#playerSeg button")
      .forEach(function (x) { x.classList.remove("active"); });
    b.classList.add("active");
    cfg.players = parseInt(b.dataset.n, 10);
  });
});
document.querySelectorAll("#modeSeg button").forEach(function (b) {
  b.addEventListener("click", function () {
    document
      .querySelectorAll("#modeSeg button")
      .forEach(function (x) { x.classList.remove("active"); });
    b.classList.add("active");
    cfg.mode = b.dataset.m;
  });
});

document.getElementById("startBtn").addEventListener("click", function () {
  cfg.custom = [
    document.getElementById("custom0").value,
    document.getElementById("custom1").value,
    document.getElementById("custom2").value,
  ];
  totals = [];
  for (var i = 0; i < cfg.players; i++) totals.push(0);
  document.getElementById("setup").style.display = "none";
  document.getElementById("game").style.display = "block";
  startHand(0);
});

// ----------------------------------------------------------------
//  Start / deal a hand
// ----------------------------------------------------------------
function playerNames(n) {
  var names = ["You"];
  // up to 9 CPUs (2–10 players total), named alphabetically A→I
  var bots = ["CPU Ada", "CPU Bolt", "CPU Cyra", "CPU Dex", "CPU Echo",
    "CPU Flux", "CPU Gizmo", "CPU Halo", "CPU Ion"];
  for (var i = 0; i < n - 1; i++) names.push(bots[i] || "CPU " + (i + 1));
  return names;
}

function startHand(dealer) {
  var n = cfg.players;
  var names = playerNames(n);
  var players = [];
  for (var i = 0; i < n; i++) {
    players.push({ name: names[i], hand: [], isHuman: i === 0, calledUno: false });
  }
  G = {
    players: players,
    deck: shuffle(buildDeck()),
    discard: [],
    dir: 1,
    dealer: dealer,
    currentColor: null,
    currentPlayerIndex: 0,
    busy: true,
    over: false,
    drawnIndex: -1, // index in human hand of card just drawn (awaiting decision)
  };

  // deal 7 to each
  for (var r = 0; r < 7; r++) {
    for (var p = 0; p < n; p++) G.players[p].hand.push(G.deck.pop());
  }

  // flip starter — skip action cards until a non-action card shows
  var starter;
  do {
    starter = G.deck.pop();
    if (starter.type === "number") break;
    G.deck.unshift(starter); // tuck it back at the bottom and try again
  } while (true);
  G.discard.push(starter);
  G.currentColor = starter.color;

  // a random player takes the first turn each hand
  G.currentPlayerIndex = Math.floor(Math.random() * G.players.length);

  log("New hand dealt. " + G.players[G.currentPlayerIndex].name + " starts.");
  beginTurn();
}

// ----------------------------------------------------------------
//  Turn lifecycle
// ----------------------------------------------------------------
// The constant gap before a player may act: a fixed "think" pace (scaled only by
// table size, so it's constant within a game) plus any time left on an in-flight
// draw animation so it never gets cut off. Same for every turn, every action.
function turnGap() {
  var n = G ? G.players.length : 4;
  var think = Math.max(380, 850 - Math.max(0, n - 4) * 80);
  return think + Math.max(0, drawAnimUntil - Date.now());
}

function beginTurn() {
  if (!G) return; // a scheduled turn fired after quitting to menu
  G.drawnIndex = -1;
  if (G.over) {
    render();
    return;
  }
  // Uniform pacing: after the previous action (and its animation) finishes,
  // EVERY next player — CPU or human — gets the same pause before they can move.
  // So a play, a forced draw, or drawing an unplayable card all lead to the same
  // gap before the next player acts.
  var who = G.currentPlayerIndex;
  G.busy = true; // nobody acts (no AI move, human cards inactive) during the pause
  render();
  var delay = turnGap();
  setTimeout(function () {
    if (!G || G.over || G.currentPlayerIndex !== who) return;
    if (G.players[who].isHuman) {
      G.busy = false;
      render(); // activate the human's cards
    } else {
      cpuTurn();
    }
  }, delay);
}

function passTurn(pi) {
  if (!G) return;
  G.currentPlayerIndex = neighbor(pi, 1);
  beginTurn();
}

// Draw n cards to player pi (reshuffling discard if needed). Returns drawn cards.
function drawCards(pi, n) {
  var got = [];
  for (var i = 0; i < n; i++) {
    if (G.deck.length === 0) reshuffle();
    if (G.deck.length === 0) break; // genuinely no cards left anywhere
    var c = G.deck.pop();
    G.players[pi].hand.push(c);
    got.push(c);
  }
  // drawing more than one card means you no longer "have UNO"
  if (G.players[pi].hand.length !== 1) G.players[pi].calledUno = false;
  if (got.length) {
    flyDraw(pi, got.length);
    sfxDraw();
  }
  return got;
}

function reshuffle() {
  if (G.discard.length <= 1) return;
  var keep = G.discard.pop();
  G.deck = shuffle(G.discard);
  G.discard = [keep];
  log("Draw pile empty — discard reshuffled.");
}

// ----------------------------------------------------------------
//  Playing a card (shared by human + CPU)
// ----------------------------------------------------------------
// pi: player index, idx: index in that player's hand.
// For wilds, chosenColor must be supplied (or it'll be picked for CPU).
function playCard(pi, idx, chosenColor, done) {
  if (!G) return;
  var player = G.players[pi];

  // Capture where the card flies FROM before mutating state/DOM: the human's
  // hand card, or one of the CPU's face-down mini-cards.
  var srcEl;
  if (pi === 0) {
    srcEl = document.querySelector('#hand .card[data-idx="' + idx + '"]');
  } else {
    var oppEl = document.querySelectorAll("#opponents .opp")[pi - 1];
    srcEl = oppEl
      ? oppEl.querySelector(".mini-back:last-child") || oppEl
      : null;
  }
  var srcRect = srcEl ? srcEl.getBoundingClientRect() : null;

  var card = player.hand.splice(idx, 1)[0];
  player.calledUno = false;
  // Reflect the move immediately: the player's hand/count drops by one the
  // instant they play, before the card finishes flying to the discard pile.
  render();

  flyCard(card, srcRect, { flip: pi !== 0 }, function () {
    var prevColor = G.currentColor; // color active *before* this card (wild4 challenge)
    G.discard.push(card);
    G.currentColor = isWildType(card) ? chosenColor : card.color;

    log(player.name + " played " + describe(card) +
      (isWildType(card) ? " → " + G.currentColor : ""));

    render();
    sfxPlay(card);
    var landed = document.querySelector("#discardPile .card");
    if (landed) landed.style.animation = "landpop 0.18s ease";

    // The moment your final card touches the discard you're out and win —
    // this applies to EVERY card type, including Wild Shuffle Hands (the
    // round ends before any re-deal would happen).
    if (player.hand.length === 0) {
      return endHand(pi);
    }

    // UNO window if this play left them at exactly one card
    unoWindow(pi, function () {
      applyEffect(pi, card, prevColor, done);
    });
  });
}

function describe(card) {
  if (card.type === "number") return card.color + " " + card.value;
  if (card.type === "skip") return card.color + " Skip";
  if (card.type === "reverse") return card.color + " Reverse";
  if (card.type === "draw2") return card.color + " Draw 2";
  if (card.type === "wild") return "Wild";
  if (card.type === "wild4") return "Wild Draw Four";
  if (card.type === "shuffle") return "Wild Shuffle Hands";
  if (card.type === "custom") return "Custom Wild (“" + card.customText + "”)";
  return "?";
}

// ----------------------------------------------------------------
//  Card effects -> determines who plays next
// ----------------------------------------------------------------
function applyEffect(pi, card, prevColor, done) {
  var finish = function () {
    if (G.over) return;
    beginTurn();
  };

  switch (card.type) {
    case "number":
    case "wild":
      G.currentPlayerIndex = neighbor(pi, 1);
      return finish();

    case "custom":
      toast("Custom rule: “" + card.customText + "”");
      G.currentPlayerIndex = neighbor(pi, 1);
      return finish();

    case "skip": {
      var s = neighbor(pi, 1);
      log(G.players[s].name + " is skipped.");
      G.currentPlayerIndex = neighbor(pi, 2);
      return finish();
    }

    case "reverse": {
      G.dir *= -1;
      log("Direction reversed.");
      if (G.players.length === 2) {
        G.currentPlayerIndex = neighbor(pi, 2); // acts like skip → same player
      } else {
        G.currentPlayerIndex = neighbor(pi, 1);
      }
      return finish();
    }

    case "draw2": {
      var t = neighbor(pi, 1);
      drawCards(t, 2);
      log(G.players[t].name + " draws 2 and is skipped.");
      G.currentPlayerIndex = neighbor(pi, 2);
      render();
      return finish();
    }

    case "shuffle": {
      shuffleHands(pi);
      G.currentPlayerIndex = neighbor(pi, 1);
      render();
      return finish();
    }

    case "wild4":
      return resolveWild4(pi, prevColor, finish);
  }
}

// Wild Shuffle Hands — pool every hand, redeal from player to the left.
function shuffleHands(pi) {
  var pool = [];
  G.players.forEach(function (p) {
    pool = pool.concat(p.hand);
    p.hand = [];
  });
  shuffle(pool);
  var start = neighbor(pi, 1);
  var n = G.players.length;
  var k = 0;
  while (pool.length) {
    var target = ((start + G.dir * k) % n + n) % n;
    G.players[target].hand.push(pool.pop());
    k++;
  }
  G.players.forEach(function (p) {
    if (p.hand.length !== 1) p.calledUno = false;
  });
  log("Shuffle Hands! All cards collected and re-dealt.");
  toast("🔀 Hands shuffled & re-dealt!");
}

// ----------------------------------------------------------------
//  Wild Draw Four resolution (with challenge)
// ----------------------------------------------------------------
function resolveWild4(pi, challengeColor, finish) {
  var target = neighbor(pi, 1);
  var t = G.players[target];

  // Did the player who laid the +4 actually have a matching-color card left?
  var wasIllegal = G.players[pi].hand.some(function (c) {
    return c.color === challengeColor;
  });

  var applyNoChallenge = function () {
    drawCards(target, 4);
    log(t.name + " draws 4 and is skipped.");
    G.currentPlayerIndex = neighbor(pi, 2);
    render();
    finish();
  };

  var applyChallenge = function () {
    if (wasIllegal) {
      // bluff caught → player draws 4, challenger plays next
      drawCards(pi, 4);
      log("Challenge upheld! " + G.players[pi].name + " was bluffing and draws 4.");
      toast("✅ Challenge won — they were bluffing!");
      G.currentPlayerIndex = target; // challenger's turn
    } else {
      // legal +4 → challenger draws 6 and loses turn
      drawCards(target, 6);
      log("Challenge failed! " + t.name + " draws 6 and is skipped.");
      toast("❌ Challenge failed — draw 6!");
      G.currentPlayerIndex = neighbor(pi, 2);
    }
    render();
    finish();
  };

  if (t.isHuman) {
    // Human decides: draw 4 or challenge
    showWild4Choice(pi, function (didChallenge) {
      if (didChallenge) applyChallenge();
      else applyNoChallenge();
    });
  } else {
    // CPU decides whether to challenge. Suspicion: if the layer has few cards,
    // or just a coin-flip-ish chance. CPUs challenge ~25% of the time.
    var suspicious = G.players[pi].hand.length <= 2 || Math.random() < 0.22;
    if (suspicious) {
      log(t.name + " challenges the Wild Draw Four!");
      setTimeout(applyChallenge, 500);
    } else {
      applyNoChallenge();
    }
  }
}

// ----------------------------------------------------------------
//  UNO call window
// ----------------------------------------------------------------
// Called after a play. If `pi` now has exactly 1 card, run the UNO logic,
// then call cont().
function unoWindow(pi, cont) {
  var p = G.players[pi];
  if (p.hand.length !== 1) {
    return cont();
  }

  if (p.isHuman) {
    // Human must press UNO within a short window or get caught.
    var caught = false;
    var done = false;
    var timer = null;
    var finishUno = function () {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      hideOverlay();
      cont();
    };
    showUnoButton(function () {
      // pressed in time
      p.calledUno = true;
      toast("🗣️ UNO!");
      sfxUno();
      finishUno();
    });
    timer = setTimeout(function () {
      if (done) return;
      // a random CPU catches you
      var catcher = pickCatcher(pi);
      drawCards(pi, 2);
      log(G.players[catcher].name + " caught you — you didn't call UNO! Draw 2.");
      toast("😱 " + G.players[catcher].name + " caught you! +2 cards");
      finishUno();
    }, 3200);
  } else {
    // CPU: usually calls in time. Sometimes forgets → human may catch it.
    if (Math.random() < 0.78) {
      p.calledUno = true;
      log(p.name + " calls UNO!");
      toast(p.name + " calls UNO!");
      sfxUno();
      cont();
    } else {
      // forgot — give human a catch window
      offerCatch(pi, cont);
    }
  }
}

function pickCatcher(pi) {
  for (var k = 1; k < G.players.length; k++) {
    var idx = neighbor(pi, k);
    if (!G.players[idx].isHuman) return idx;
  }
  return neighbor(pi, 1);
}

// ----------------------------------------------------------------
//  CPU turn
// ----------------------------------------------------------------
function cpuTurn() {
  if (!G || G.over) return;
  var pi = G.currentPlayerIndex;
  var hand = G.players[pi].hand;

  var playable = [];
  for (var i = 0; i < hand.length; i++) {
    if (canPlay(hand[i])) playable.push(i);
  }

  if (playable.length === 0) {
    // draw one
    var got = drawCards(pi, 1);
    render();
    // Let the drawn card finish gliding in, then play it / pass. The constant
    // inter-turn pause is applied uniformly in beginTurn after this.
    var wait = Math.max(0, drawAnimUntil - Date.now());
    if (got.length && canPlay(got[0])) {
      var di = hand.length - 1;
      log(G.players[pi].name + " draws and plays it.");
      setTimeout(function () {
        playCard(pi, di, chooseColor(pi), null);
      }, wait);
    } else {
      log(G.players[pi].name + " draws and passes.");
      setTimeout(function () { passTurn(pi); }, wait);
    }
    return;
  }

  var idx = chooseCpuCard(pi, playable);
  var card = hand[idx];
  var color = isWildType(card) ? chooseColor(pi, idx) : null;
  playCard(pi, idx, color, null);
}

// Pick which playable card a CPU should play.
function chooseCpuCard(pi, playable) {
  var hand = G.players[pi].hand;
  // prefer non-wilds; among them, action cards then high numbers.
  var normals = [];
  var wilds = [];
  playable.forEach(function (i) {
    if (isWildType(hand[i])) wilds.push(i);
    else normals.push(i);
  });

  if (normals.length) {
    // sort: action cards first (skip/reverse/draw2), then by value desc
    normals.sort(function (a, b) {
      var ca = hand[a], cb = hand[b];
      var pa = ca.type === "number" ? ca.value : 25;
      var pb = cb.type === "number" ? cb.value : 25;
      return pb - pa;
    });
    return normals[0];
  }

  // only wilds available: prefer shuffle/custom/wild before wild4 (save the +4),
  // but a wild4 here is legal (no matching color in hand), so it's fine.
  wilds.sort(function (a, b) {
    var order = { wild: 0, custom: 1, shuffle: 2, wild4: 3 };
    return order[hand[a].type] - order[hand[b].type];
  });
  return wilds[0];
}

// CPU picks the color it holds most of (ignoring an optional card index).
function chooseColor(pi, ignoreIdx) {
  var counts = { red: 0, yellow: 0, green: 0, blue: 0 };
  G.players[pi].hand.forEach(function (c, i) {
    if (i === ignoreIdx) return;
    if (counts[c.color] != null) counts[c.color]++;
  });
  var best = "red", bestN = -1;
  COLORS.forEach(function (c) {
    if (counts[c] > bestN) { bestN = counts[c]; best = c; }
  });
  return best;
}

// ----------------------------------------------------------------
//  Human input
// ----------------------------------------------------------------
function onHumanCardClick(idx) {
  if (G.busy) return;
  var hand = G.players[0].hand;
  var card = hand[idx];

  // If we're mid "drew a card" decision, only the drawn card is playable.
  if (G.drawnIndex >= 0 && idx !== G.drawnIndex) return;

  if (!canPlay(card)) return;
  G.busy = true;
  G.drawnIndex = -1;

  if (isWildType(card)) {
    showColorPicker(function (color) {
      playCard(0, idx, color, null);
    });
  } else {
    playCard(0, idx, null, null);
  }
}

function onHumanDraw() {
  if (G.busy) return;
  if (G.drawnIndex >= 0) return; // already drew this turn
  G.busy = true;
  var got = drawCards(0, 1);
  if (got.length && canPlay(got[0])) {
    // Set the "may play the drawn card" state BEFORE rendering so we render only
    // ONCE. A second render would re-run the hand FLIP, capture the just-drawn
    // card and clobber its deck-to-hand glide animation.
    G.drawnIndex = G.players[0].hand.length - 1;
    G.busy = false;
    log("You drew " + describe(got[0]) + " — play it or pass.");
    render();
  } else {
    log("You drew " + (got.length ? describe(got[0]) : "nothing") + " and pass.");
    render();
    // let the drawn card finish gliding in; the constant inter-turn pause is
    // then applied uniformly in beginTurn.
    setTimeout(function () { passTurn(0); }, Math.max(0, drawAnimUntil - Date.now()));
  }
}

function onHumanPass() {
  if (G.busy) return;
  G.busy = true;
  passTurn(0);
}

// ----------------------------------------------------------------
//  End of hand / game
// ----------------------------------------------------------------
function endHand(winner) {
  G.over = true;
  G.busy = true;
  render();
  sfxEnd(G.players[winner].isHuman);

  if (cfg.mode === "single") {
    showResult(winner, null, null);
    return;
  }

  // points mode: winner scores sum of opponents' remaining cards
  var gained = 0;
  for (var i = 0; i < G.players.length; i++) {
    if (i === winner) continue;
    G.players[i].hand.forEach(function (c) { gained += cardValuePoints(c); });
  }
  totals[winner] += gained;
  var reached500 = totals[winner] >= 500;
  showResult(winner, gained, reached500);
}

// ----------------------------------------------------------------
//  Rendering
// ----------------------------------------------------------------
// Motion follows the shared "✨ Visual FX" toggle (motion-toggle.js exposes
// window.RM_ON()); falls back to the OS reduced-motion setting.
function reducedMotion() {
  if (typeof window.RM_ON === "function") return !!window.RM_ON();
  return !!(
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
function fxOn() {
  return !reducedMotion();
}

// FLIP layout slide: capture element rects (keyed by data-flipkey) before a
// re-render, then after, animate each surviving element from its old spot to
// its new one. Used so hand cards / CPU mini-cards slide when a card is
// played or drawn. Only runs when Visual FX is on.
// Cards whose draw-from-deck glide (flyDraw) is in progress. The hand FLIP must
// leave these alone, or a re-render mid-glide clobbers the animation.
var glidingKeys = {};
// Timestamp (ms) the current draw animation finishes — the next player's turn
// waits for this so its re-render doesn't cut the glide off.
var drawAnimUntil = 0;

function captureRects(els) {
  var map = {};
  for (var i = 0; i < els.length; i++) {
    var k = els[i].getAttribute("data-flipkey");
    if (k != null) map[k] = els[i].getBoundingClientRect();
  }
  return map;
}
function playFlip(els, oldRects) {
  if (!oldRects) return;
  // Compute every element's offset first. If ANY moved, animate them ALL together
  // (don't skip the ones already near target) — otherwise a re-render landing
  // mid-slide desyncs the group and the spacing looks uneven.
  var moved = [];
  var any = false;
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    var k = el.getAttribute("data-flipkey");
    if (k == null || !oldRects[k] || glidingKeys[k]) continue;
    var prev = oldRects[k];
    var now = el.getBoundingClientRect();
    el._fdx = prev.left - now.left;
    el._fdy = prev.top - now.top;
    moved.push(el);
    if (Math.abs(el._fdx) >= 1 || Math.abs(el._fdy) >= 1) any = true;
  }
  if (!any) return;
  moved.forEach(function (el) {
    el.style.transition = "none";
    el.style.transform = "translate(" + el._fdx + "px," + el._fdy + "px)";
  });
  requestAnimationFrame(function () {
    moved.forEach(function (el) {
      el.style.transition = "transform 0.3s cubic-bezier(.2,.7,.3,1)";
      el.style.transform = "";
      el.addEventListener("transitionend", function clr() {
        el.style.transition = "";
        el.removeEventListener("transitionend", clr);
      });
    });
  });
}

// ----------------------------------------------------------------
//  Sound effects (synthesized Web Audio — no assets). The shared
//  mute-toggle.js routes all audio through a master gain, so the 🔊
//  button silences everything; we just make the sounds.
// ----------------------------------------------------------------
var _actx = null;
function actx() {
  try {
    if (!_actx)
      _actx = new (window.AudioContext || window.webkitAudioContext)();
    if (_actx.state === "suspended") _actx.resume();
    return _actx;
  } catch (e) {
    return null;
  }
}
function tone(freq, dur, type, vol, when) {
  var c = actx();
  if (!c) return;
  var t = c.currentTime + (when || 0);
  var o = c.createOscillator();
  var g = c.createGain();
  o.type = type || "sine";
  o.frequency.setValueAtTime(freq, t);
  o.connect(g);
  g.connect(c.destination);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.18, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t);
  o.stop(t + dur + 0.03);
}
function sfxPlay(card) {
  if (card.type === "number") {
    tone(300 + card.value * 18, 0.13, "triangle", 0.16);
  } else if (isWildType(card)) {
    tone(440, 0.1, "sawtooth", 0.12);
    tone(660, 0.12, "sawtooth", 0.12, 0.07);
    tone(880, 0.14, "sawtooth", 0.12, 0.14);
  } else {
    // action card (skip / reverse / draw 2): a sharper two-note
    tone(380, 0.1, "square", 0.12);
    tone(300, 0.12, "square", 0.12, 0.06);
  }
}
function sfxDraw() {
  tone(520, 0.07, "square", 0.07);
  tone(360, 0.08, "sine", 0.08, 0.04);
}
function sfxUno() {
  tone(660, 0.1, "triangle", 0.2);
  tone(990, 0.16, "triangle", 0.2, 0.1);
}
function sfxEnd(win) {
  if (win) {
    [523, 659, 784, 1047].forEach(function (f, i) {
      tone(f, 0.22, "triangle", 0.2, i * 0.12);
    });
  } else {
    [392, 330, 262].forEach(function (f, i) {
      tone(f, 0.24, "sine", 0.16, i * 0.13);
    });
  }
}

// Animate `card` flying from a source rect to the discard pile, then call
// onDone(). opts.flip = start face-down & small (from a CPU mini-card) and
// flip face-up while growing to full size — so you can see what was played.
function flyCard(card, srcRect, opts, onDone) {
  opts = opts || {};
  var fired = false;
  var finish = function () {
    if (fired) return;
    fired = true;
    onDone();
  };
  var target = document.getElementById("discardPile");
  if (!srcRect || !target || reducedMotion()) return finish();

  var tr = target.getBoundingClientRect();
  // Match the end size to the actual discard card.
  var discCard = target.querySelector(".card");
  var dcr = discCard ? discCard.getBoundingClientRect() : { width: 80, height: 114 };
  var CW = dcr.width, CH = dcr.height;

  var el;
  if (opts.flip) {
    el = document.createElement("div");
    el.className = "flying-card flip-wrap";
    el.style.width = CW + "px";
    el.style.height = CH + "px";
    el.innerHTML =
      '<div class="flip-inner">' +
      '<div class="flip-face flip-back"><div class="card back"></div></div>' +
      '<div class="flip-face flip-front">' + cardHTML(card, {}) + "</div>" +
      "</div>";
  } else {
    var wrap = document.createElement("div");
    wrap.innerHTML = cardHTML(card, {});
    el = wrap.firstChild;
    el.classList.add("flying-card");
    el.style.width = CW + "px";
    el.style.height = CH + "px";
    el.style.boxSizing = "border-box";
  }
  // Inline position:fixed MUST win over the .card rule (which sets relative
  // and appears later in the stylesheet).
  el.style.position = "fixed";
  el.style.margin = "0";

  // Center the full-size card box on the source point; scaling shrinks it
  // to visually match the source (a small mini-card for CPU plays).
  var srcCx = srcRect.left + srcRect.width / 2;
  var srcCy = srcRect.top + srcRect.height / 2;
  el.style.left = srcCx - CW / 2 + "px";
  el.style.top = srcCy - CH / 2 + "px";
  el.style.transition = "transform 0.46s cubic-bezier(.2,.75,.3,1)";
  document.body.appendChild(el);

  var inner = el.querySelector(".flip-inner");
  var startScale = opts.flip
    ? Math.max(0.18, srcRect.height / CH)
    : 1.04;
  var rot = opts.flip ? 0 : Math.random() * 14 - 7;
  el.style.transform =
    "translate(0,0) rotate(" + rot + "deg) scale(" + startScale + ")";
  if (inner) inner.style.transform = "rotateY(0deg)";

  var dx = tr.left + tr.width / 2 - srcCx;
  var dy = tr.top + tr.height / 2 - srcCy;

  void el.offsetWidth; // force reflow so the transition runs
  requestAnimationFrame(function () {
    el.style.transform =
      "translate(" + dx + "px," + dy + "px) rotate(0deg) scale(1)";
    if (inner) inner.style.transform = "rotateY(180deg)";
  });

  var cleanup = function () {
    if (el.parentNode) el.parentNode.removeChild(el);
    finish();
  };
  el.addEventListener("transitionend", cleanup, { once: true });
  setTimeout(cleanup, 560); // safety net if transitionend doesn't fire
}

// Animate a draw from the pile. Deferred one frame so the caller's re-render
// has already placed the drawn card(s). The ACTUAL newly-drawn cards glide in
// from the draw pile and settle into place (left-to-right) — no separate
// phantom card ever spawns.
//   • Human: the real hand card(s) glide from the deck to the right of the hand.
//   • CPU: the real mini-card(s) shrink in from the deck into the panel.
var DRAW_STAGGER = 55; // ms between consecutive cards
var DRAW_TRANS = 0.3; // seconds per card glide
function flyDraw(pi, n) {
  if (reducedMotion()) return;
  var animCount = Math.min(n, 7);
  var glideMs = (animCount - 1) * DRAW_STAGGER + DRAW_TRANS * 1000 + 90;
  // Hold off the next player's move until the draw animation finishes (so the
  // turn's re-render doesn't cut it off). beginTurn reads this.
  drawAnimUntil = Math.max(drawAnimUntil, Date.now() + glideMs);
  // For the human, flag the freshly drawn cards (by key) so the hand FLIP skips
  // them while they glide — even across the re-renders a penalty draw triggers.
  if (pi === 0 && G && G.players[0]) {
    var hand = G.players[0].hand;
    var keys = [];
    for (var q = Math.max(0, hand.length - n); q < hand.length; q++) {
      var key = "c" + hand[q].id;
      keys.push(key);
      glidingKeys[key] = true;
    }
    setTimeout(function () {
      keys.forEach(function (k) { delete glidingKeys[k]; });
    }, glideMs + 120);
  }
  requestAnimationFrame(function () {
    var deck = document.getElementById("deckStack");
    if (!deck) return;
    var dr = deck.getBoundingClientRect();
    var dcx = dr.left + dr.width / 2, dcy = dr.top + dr.height / 2;

    var els, startScale;
    if (pi === 0) {
      els = document.querySelectorAll("#hand .card");
      startScale = 1; // a full-size card gliding from the deck to the hand
    } else {
      var opp = document.querySelectorAll("#opponents .opp")[pi - 1];
      els = opp ? opp.querySelectorAll(".mini-back") : [];
      startScale = 3.2; // a mini-card starts ~full-card size at the deck, then shrinks in
    }
    var startIdx = els.length - n; // first (leftmost) of the freshly drawn cards
    for (var j = 0; j < animCount; j++) {
      var el = els[startIdx + j];
      if (!el) continue;
      var r = el.getBoundingClientRect();
      el.style.transition = "none";
      el.style.transform =
        "translate(" + (dcx - (r.left + r.width / 2)) + "px," +
        (dcy - (r.top + r.height / 2)) + "px) scale(" + startScale + ")";
      el.style.opacity = "0.4";
      (function (node, delay) {
        setTimeout(function () {
          requestAnimationFrame(function () {
            node.style.transition =
              "transform " + DRAW_TRANS + "s cubic-bezier(.3,.6,.3,1), opacity 0.24s ease";
            node.style.transform = "";
            node.style.opacity = "";
            node.addEventListener("transitionend", function clr() {
              node.style.transition = "";
              node.removeEventListener("transitionend", clr);
            });
          });
        }, delay);
      })(el, j * DRAW_STAGGER);
    }
  });
}

function cardHTML(card, opts) {
  opts = opts || {};
  var cls = "card " + (card.color === "wild" ? "wild" : card.color);
  if (opts.sm) cls += " sm";
  if (opts.playable) cls += " playable";
  if (opts.dim) cls += " dim";

  var glyph =
    card.type === "number" ? String(card.value) : (GLYPH[card.type] || "?");
  var inner =
    '<div class="oval"></div>' +
    '<span class="corner tl">' + glyph + "</span>" +
    '<span class="big">' + glyph + "</span>" +
    '<span class="corner br">' + glyph + "</span>";
  return '<div class="' + cls + '" ' +
    (opts.idx != null ? 'data-idx="' + opts.idx + '" ' : "") +
    (opts.flipkey != null ? 'data-flipkey="' + opts.flipkey + '"' : "") +
    ">" + inner + "</div>";
}

function render() {
  if (!G) return;
  // Before re-rendering, snapshot the human hand's card positions so they can
  // slide to their new spots after a play or draw (FX-on only). The CPU
  // mini-cards are NOT slid — they're tiny and overlapping, so a per-card slide
  // desyncs and makes their spacing look uneven; they snap to perfectly even
  // positions every render instead.
  var fx = fxOn();
  var handOld = fx
    ? captureRects(document.querySelectorAll("#hand .card"))
    : null;

  // scoreboard (points mode)
  var sb = document.getElementById("scoreboard");
  if (cfg.mode === "points") {
    sb.innerHTML = G.players
      .map(function (p, i) {
        return "<span>" + p.name + ": <b>" + totals[i] + "</b></span>";
      })
      .join("");
  } else {
    sb.innerHTML = "";
  }

  // opponents
  var opp = document.getElementById("opponents");
  var html = "";
  for (var i = 1; i < G.players.length; i++) {
    var p = G.players[i];
    var active = i === G.currentPlayerIndex && !G.over;
    // One mini-card per card in hand. They sit at a 2px gap up to 7 cards,
    // then overlap (fan) so the row stays the same width — the count is
    // always shown accurately no matter how many cards a player holds.
    var backs = "";
    var n = p.hand.length;
    // CARD_W is the rendered mini-card width (16px box + 2px border). Use an
    // INTEGER center-to-center step so every gap is identical AND every card
    // lands on the same sub-pixel phase (otherwise borders anti-alias unevenly
    // and the spacing looks inconsistent). Beyond 7 cards they overlap to keep
    // the row about the width of 7 cards.
    var CARD_W = 18, GAP = 2;
    var MAX_SPAN = 6 * (CARD_W + GAP) + CARD_W; // 7 cards wide
    var step = n <= 7
      ? CARD_W + GAP
      : Math.max(6, Math.round((MAX_SPAN - CARD_W) / (n - 1)));
    var ml = step - CARD_W; // integer margin-left between adjacent cards
    for (var b = 0; b < n; b++) {
      backs +=
        '<div class="mini-back" data-flipkey="' + i + "-" + b + '"' +
        (b === 0 ? "" : ' style="margin-left:' + ml + 'px"') +
        "></div>";
    }
    html +=
      '<div class="opp' + (active ? " active" : "") + '">' +
      '<div class="oname">' + p.name + "</div>" +
      '<div class="ocount">' + p.hand.length + " cards</div>" +
      '<div class="mini-backs">' + backs + "</div>" +
      (p.hand.length === 1 && p.calledUno
        ? '<span class="badge-uno">UNO</span>'
        : "") +
      "</div>";
  }
  opp.innerHTML = html;

  // discard
  document.getElementById("discardPile").innerHTML = cardHTML(topCard(), {});
  // active color dot
  document.getElementById("colorDot").innerHTML =
    '<span class="dot" style="background:' + COLOR_HEX[G.currentColor] +
    '"></span> ' + G.currentColor;

  // deck
  var ds = document.getElementById("deckStack");
  document.getElementById("deckCount").textContent = G.deck.length + " left";

  // direction
  var human = G.players[0];
  var dirText = G.dir === 1 ? "↻ clockwise" : "↺ counter-clockwise";
  var turnText = G.over
    ? "Hand over"
    : (G.players[G.currentPlayerIndex].isHuman
        ? "Your turn"
        : G.players[G.currentPlayerIndex].name + "'s turn");
  document.getElementById("dirIndicator").textContent =
    turnText + "  •  " + dirText;

  // hand
  var myTurn = !G.over && G.players[G.currentPlayerIndex].isHuman && !G.busy;
  var handDiv = document.getElementById("hand");
  var hh = "";
  human.hand.forEach(function (c, idx) {
    var playable = false, dim = false;
    if (myTurn) {
      if (G.drawnIndex >= 0) {
        playable = idx === G.drawnIndex && canPlay(c);
        dim = idx !== G.drawnIndex;
      } else {
        playable = canPlay(c);
        dim = !playable;
      }
    }
    hh += cardHTML(c, {
      idx: idx,
      playable: playable,
      dim: dim,
      flipkey: "c" + c.id,
    });
  });
  handDiv.innerHTML = hh;

  document.getElementById("handLabel").textContent =
    "Your hand (" + human.hand.length + ")" +
    (human.hand.length === 1 && human.calledUno ? " — UNO!" : "");

  // Slide the human's surviving hand cards from their old positions to the new.
  if (fx) {
    playFlip(document.querySelectorAll("#hand .card"), handOld);
  }

  renderControls();
}

function renderControls() {
  var c = document.getElementById("controls");
  var myTurn = !G.over && G.players[G.currentPlayerIndex].isHuman && !G.busy;
  var canDraw = myTurn && G.drawnIndex < 0;
  var ds = document.getElementById("deckStack");
  ds.classList.toggle("disabled", !canDraw);
  ds.onclick = canDraw ? onHumanDraw : null;

  // Draw is always shown (dimmed + disabled when it's not your turn). When you've
  // drawn a card you can still play, a Pass button appears next to it.
  var html =
    '<button class="btn secondary" id="drawBtn"' + (canDraw ? "" : " disabled") +
    ">Draw a card</button>";
  if (myTurn && G.drawnIndex >= 0) {
    html += '<button class="btn secondary" id="passBtn">Pass</button>';
  }
  html += '<button class="btn warn" id="newHandBtn" style="margin-left:auto">Quit to menu</button>';
  c.innerHTML = html;

  var db = document.getElementById("drawBtn");
  if (db) db.onclick = onHumanDraw;
  var pb = document.getElementById("passBtn");
  if (pb) pb.onclick = onHumanPass;
  document.getElementById("newHandBtn").onclick = quitToMenu;
}

function quitToMenu() {
  G = null;
  document.getElementById("game").style.display = "none";
  document.getElementById("setup").style.display = "block";
  hideOverlay();
}

// ----------------------------------------------------------------
//  Overlays
// ----------------------------------------------------------------
var overlay = document.getElementById("overlay");
var modal = document.getElementById("modal");

function hideOverlay() {
  overlay.classList.remove("show");
}

function showColorPicker(cb) {
  modal.innerHTML =
    "<h3>Pick a color</h3><p>Choose the color that play continues with.</p>" +
    '<div class="color-choices">' +
    COLORS.map(function (c) {
      return '<button data-c="' + c + '" style="background:' + COLOR_HEX[c] + '">' +
        c.toUpperCase() + "</button>";
    }).join("") +
    "</div>";
  overlay.classList.add("show");
  modal.querySelectorAll("button").forEach(function (b) {
    b.onclick = function () {
      hideOverlay();
      cb(b.dataset.c);
    };
  });
}

function showUnoButton(cb) {
  modal.innerHTML =
    "<h3>One card left!</h3><p>Call it before someone catches you.</p>" +
    '<button class="btn uno" id="unoBtn" style="font-size:1.4rem;padding:0.9rem 2.4rem">UNO!</button>';
  overlay.classList.add("show");
  document.getElementById("unoBtn").onclick = function () {
    cb();
  };
}

function offerCatch(pi, cont) {
  var done = false;
  var finish = function (caught) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    hideOverlay();
    if (caught) {
      drawCards(pi, 2);
      log("You caught " + G.players[pi].name + " — they forgot UNO! +2 cards.");
      toast("🎯 Caught " + G.players[pi].name + "! +2 cards");
    }
    render();
    cont();
  };
  modal.innerHTML =
    "<h3>" + G.players[pi].name + " has one card…</h3>" +
    "<p>They didn't call UNO! Catch them before the next turn.</p>" +
    '<button class="btn uno" id="catchBtn" style="font-size:1.2rem;padding:0.8rem 2rem">Catch them!</button>';
  overlay.classList.add("show");
  document.getElementById("catchBtn").onclick = function () { finish(true); };
  var timer = setTimeout(function () { finish(false); }, 2600);
}

function showWild4Choice(layer, cb) {
  modal.innerHTML =
    "<h3>Wild Draw Four!</h3>" +
    "<p>" + G.players[layer].name +
    " played a +4. Draw 4, or challenge — if they had a playable color, " +
    "they draw 4 instead; if not, you draw 6.</p>" +
    '<div class="modal-btns">' +
    '<button class="btn" id="drawFourBtn">Draw 4</button>' +
    '<button class="btn warn" id="challengeBtn">Challenge</button>' +
    "</div>";
  overlay.classList.add("show");
  document.getElementById("drawFourBtn").onclick = function () {
    hideOverlay();
    cb(false);
  };
  document.getElementById("challengeBtn").onclick = function () {
    // reveal the layer's hand, then resolve
    var reveal = G.players[layer].hand
      .map(function (c) { return cardHTML(c, { sm: true }); })
      .join("");
    modal.innerHTML =
      "<h3>" + G.players[layer].name + "'s hand</h3>" +
      "<p>Revealed for the challenge…</p>" +
      '<div class="reveal-hand">' + reveal + "</div>" +
      '<button class="btn" id="okReveal">Continue</button>';
    document.getElementById("okReveal").onclick = function () {
      hideOverlay();
      cb(true);
    };
  };
}

function showResult(winner, gained, reached500) {
  var w = G.players[winner];
  var title = w.isHuman ? "🎉 You win the hand!" : w.name + " wins the hand";
  var body = "";
  if (cfg.mode === "points") {
    body += "<p>" + w.name + " scored <b>" + gained + "</b> points." +
      " Totals — " +
      G.players.map(function (p, i) { return p.name + ": " + totals[i]; }).join(", ") +
      ".</p>";
  }
  var btns;
  if (cfg.mode === "points" && reached500) {
    title = (w.isHuman ? "🏆 You reached 500 — game over!" : w.name + " reached 500!");
    btns = '<button class="btn" id="rematchBtn">New game</button>';
  } else if (cfg.mode === "points") {
    btns = '<button class="btn" id="nextHandBtn">Next hand</button>' +
      '<button class="btn secondary" id="menuBtn">Menu</button>';
  } else {
    btns = '<button class="btn" id="rematchBtn">Play again</button>' +
      '<button class="btn secondary" id="menuBtn">Menu</button>';
  }

  modal.innerHTML = "<h3>" + title + "</h3>" + body +
    '<div class="modal-btns">' + btns + "</div>";
  overlay.classList.add("show");

  var rb = document.getElementById("rematchBtn");
  if (rb) rb.onclick = function () {
    hideOverlay();
    if (cfg.mode === "points") { totals = totals.map(function () { return 0; }); }
    startHand(neighbor(G.dealer, 1));
  };
  var nh = document.getElementById("nextHandBtn");
  if (nh) nh.onclick = function () {
    hideOverlay();
    startHand((G.dealer + 1) % G.players.length);
  };
  var mb = document.getElementById("menuBtn");
  if (mb) mb.onclick = quitToMenu;
}

// ----------------------------------------------------------------
//  Toast + log
// ----------------------------------------------------------------
var toastEl = document.getElementById("toast");
var toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    toastEl.classList.remove("show");
  }, 2200);
}

function log(msg) {
  var l = document.getElementById("log");
  var d = document.createElement("div");
  d.textContent = msg;
  l.appendChild(d);
  l.scrollTop = l.scrollHeight;
  while (l.children.length > 40) l.removeChild(l.firstChild);
}

// ----------------------------------------------------------------
//  Init — one delegated tap handler on the hand container. It survives
//  the innerHTML re-renders, and a single listener avoids the mobile
//  "first tap only hovers" problem that per-card listeners can hit.
// ----------------------------------------------------------------
document.getElementById("hand").addEventListener("click", function (e) {
  var card = e.target.closest(".card.playable");
  if (!card || card.dataset.idx == null) return;
  onHumanCardClick(parseInt(card.dataset.idx, 10));
});
