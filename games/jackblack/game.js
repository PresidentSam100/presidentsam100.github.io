/* =====================================================================
   JackBlack: blackjack at a card table on the sea floor.

   The rules live in rules.js (a Table that answers every action with the
   list of what happened). This file is the page: it plays those events
   out one at a time (a card slides in, the hole card turns, a hand is
   paid), keeps the stake, and takes the bets and the keys.

   Modes
     table  "Open table": a stake of 1,000 that is yours until it's gone;
            it's saved between visits, and the best it has ever stood at
            is the record
     daily  "Daily shoe": ten hands from today's shoe, the same cards in
            the same order for everyone; the first finish is the
            recorded, shareable result

   Keys (each shown on its button): 1 2 the mode and Enter to sit down; at
   the table 1 2 3 4 add a chip, C clears the bet, Enter deals; in a hand
   H hits, S stands, D doubles, X splits, and Y / N answer insurance;
   Backspace goes back to the modes; Esc leaves (the shared scripts).
   ===================================================================== */
(function () {
  "use strict";

  var R = window.JackBlackRules;
  function $(id) { return document.getElementById(id); }
  function fx() { return !(window.RM_ON && window.RM_ON()); }
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function signed(n) { return (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n)); }

  var store = window.GameShell ? GameShell.store : {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } },
    getNum: function (k, f) { var v = parseFloat(this.get(k, "")); return isNaN(v) ? f : v; },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    remove: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  var CHIPS = [10, 50, 100, 500];
  var DAILY_HANDS = 10;
  var SUITS = ["♠", "♥", "♦", "♣"];
  var RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  var RESULT = { natural: "JackBlack!", win: "Win", push: "Push", lose: "Lose", bust: "Bust" };

  // ---- the daily shoe ------------------------------------------------------
  var DAY0 = Date.UTC(2026, 9, 11);
  function today() {
    var d = new Date();
    var utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    var mm = ("0" + (d.getMonth() + 1)).slice(-2), dd = ("0" + d.getDate()).slice(-2);
    return { n: Math.round((utc - DAY0) / 86400000) + 1, ymd: d.getFullYear() + "-" + mm + "-" + dd };
  }
  function readDaily() {
    var t = today();
    try {
      var d = JSON.parse(store.get("jackblack_daily", "null"));
      if (d && d.ymd === t.ymd) return d;
    } catch (e) {}
    return { ymd: t.ymd, n: t.n, stake: 0, marks: "", done: false };
  }
  function writeDaily(d) { store.set("jackblack_daily", JSON.stringify(d)); }

  // ---- sound ----------------------------------------------------------------
  // (muting is the shared speaker button's: mute-toggle.js routes every context)
  var actx = null;
  function audio() {
    try {
      if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
      if (actx && actx.state === "suspended") actx.resume();
    } catch (e) {}
    return actx;
  }
  function tone(freq, dur, type, vol, when, slide) {
    var a = audio(); if (!a) return;
    try {
      var t = a.currentTime + (when || 0), o = a.createOscillator(), g = a.createGain();
      o.type = type || "sine"; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.1, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }
  function hiss(dur, vol) {      // a card across the baize
    var a = audio(); if (!a) return;
    try {
      var n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var src = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
      f.type = "bandpass"; f.frequency.value = 2600; f.Q.value = 0.7;
      g.gain.value = vol || 0.12;
      src.buffer = buf; src.connect(f); f.connect(g); g.connect(a.destination); src.start();
    } catch (e) {}
  }
  var SFX = {
    card: function () { hiss(0.09, 0.14); },
    turn: function () { hiss(0.06, 0.1); tone(520, 0.05, "triangle", 0.04); },
    chip: function () { tone(1900, 0.045, "triangle", 0.07); tone(2500, 0.05, "triangle", 0.05, 0.035); },
    win: function () { [523, 659, 784].forEach(function (f, i) { tone(f, 0.16, "triangle", 0.09, i * 0.09); }); },
    natural: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.2, "triangle", 0.09, i * 0.08); }); },
    lose: function () { tone(196, 0.26, "sine", 0.1, 0, 130); },
    push: function () { tone(392, 0.12, "sine", 0.07); },
    shuffle: function () { for (var i = 0; i < 6; i++) setTimeout(function () { hiss(0.05, 0.08); }, i * 55); },
    no: function () { tone(160, 0.09, "square", 0.04); }
  };

  // ---- state ----------------------------------------------------------------
  var state = "menu";            // menu | table | over
  var mode = store.get("jackblack_mode", "table") === "daily" ? "daily" : "table";
  var table = null;              // the rules' Table
  var view = null;               // what's on the felt right now (the events played so far)
  var bet = 50, lastBet = 50;
  var busy = false;              // events are playing out: the keys wait
  var hands = 0, peak = 0, marks = "", recorded = false;
  var serial = 0;                // each card dealt gets a number, so a redraw knows which are new
  var best = window.GameShell ? GameShell.best("jackblack_best", { higher: true }) : null;

  function inHand() { return !!table && (table.phase === "play" || table.phase === "insure"); }
  // a Daily run is under way from its first hand to its last
  function dailyLive() { return state === "table" && mode === "daily" && hands > 0 && hands < DAILY_HANDS && !table.broke(); }

  // ---- the felt ---------------------------------------------------------------
  function cardEl(c, fresh) {
    var el = document.createElement("div");
    var red = c.card.s === 1 || c.card.s === 2;
    el.className = "pc" + (c.hidden ? " back" : red ? " red" : "") + (c.side ? " side" : "") + (fresh ? " in" : "") + (c.turned ? " turned" : "");
    // Visual FX off: a card still comes from the shoe (where it goes is play),
    // only straight, with no turn of its own. motion-toggle.js flattens the
    // CSS deal then, so this one is played by script (FX on: jb-deal), once
    // render() has put the card on the felt (WebKit runs an animation's clock
    // from when it's made, so one made first could be over before it's seen).
    if (fresh && !c.turned && !fx() && el.animate) {
      var rest = c.side ? "rotate(9deg) translateY(5px)" : "none";
      Promise.resolve().then(function () {
        if (!el.isConnected) return;
        el.animate([{ transform: "translate(130px, -150px)" + (c.side ? " rotate(9deg)" : ""), opacity: 0 }, { opacity: 1, offset: 0.6 }, { transform: rest, opacity: 1 }],
          { duration: 300, easing: "cubic-bezier(0.2, 0.75, 0.25, 1)" });
      });
    }
    if (c.hidden) { el.setAttribute("aria-label", "a card face down"); return el; }
    var r = RANKS[c.card.r], s = SUITS[c.card.s];
    el.setAttribute("aria-label", r + s);
    s += "︎";   // (drawn as a plain suit: a phone may otherwise draw a suit as an emoji)
    el.innerHTML = '<span class="cn">' + r + '<i>' + s + '</i></span><span class="pip">' + s + '</span><span class="cn low">' + r + '<i>' + s + '</i></span>';
    return el;
  }
  function totalText(cards) {
    var shown = cards.filter(function (c) { return !c.hidden; }).map(function (c) { return c.card; });
    if (!shown.length) return "";
    var v = R.value(shown);
    // a soft hand reads both ways ("7 or 17") once it has two cards showing
    return (v.soft && v.total < 21 && shown.length > 1 ? (v.total - 10) + " or " : "") + v.total;
  }
  function render(freshFrom) {
    var d = $("d-cards"), wrap = $("hands");
    d.innerHTML = "";
    view.dealer.forEach(function (c) { d.appendChild(cardEl(c, c.n >= freshFrom)); });
    $("d-total").textContent = totalText(view.dealer);
    wrap.innerHTML = "";
    wrap.className = "hands n" + Math.max(1, view.hands.length);
    view.hands.forEach(function (h, i) {
      var box = document.createElement("div");
      box.className = "hand" + (i === view.active ? " active" : "") + (h.result ? " r-" + h.result : "");
      var cards = document.createElement("div"); cards.className = "cards";
      h.cards.forEach(function (c) { cards.appendChild(cardEl(c, c.n >= freshFrom)); });
      box.appendChild(cards);
      var foot = document.createElement("div"); foot.className = "foot";
      foot.innerHTML = '<span class="total">' + totalText(h.cards) + '</span>' +
        '<span class="stack" title="bet"><i class="chipdot"></i>' + fmt(h.bet) + '</span>' +
        (h.result ? '<span class="tag">' + RESULT[h.result] + (h.delta ? " " + signed(h.delta) : "") + '</span>' : "");
      box.appendChild(foot);
      wrap.appendChild(box);
    });
    $("hud-stake").textContent = fmt(view.stake);
    fit();
  }
  // Where the stylesheet keeps the whole table on the screen at once (a short
  // screen, upright or on its side, sets --fit on the felt), split hands keep
  // to one row and nothing runs off the bottom, whatever the cards and the
  // numbers: when the stylesheet's sizes would break either, the cards come
  // down as far as it takes and no further (FIT_MIN at the least). The
  // hands' cards first, as they are what crowds; then, if the page is still
  // taller than the screen, settled results lie across their hands' cards
  // (.stamp) rather than under them; and only then do the dealer's and the
  // hands' cards come down together. Each call starts again from the
  // stylesheet's sizes, so a smaller hand next round gets its full size back.
  var FIT_MIN = 30;
  function fit() {
    var wrap = $("hands"), d = $("d-cards");
    wrap.style.removeProperty("--card-w"); d.style.removeProperty("--card-w"); wrap.classList.remove("stamp");
    if (getComputedStyle($("felt")).getPropertyValue("--fit").trim() !== "1") return;
    var W = function (e) { return e.getBoundingClientRect().width; };
    // (a card's width, from a row of cards: its min-height is 1.42 cards, in px)
    var unit = function (el) { var c = el.classList.contains("cards") ? el : el.querySelector(".cards"); return c ? parseFloat(getComputedStyle(c).minHeight) / 1.42 : NaN; };
    var dw = unit(d), hw = unit(wrap);
    if (isNaN(hw)) hw = dw;
    var set = function (el, w) { el.style.setProperty("--card-w", (Math.floor(Math.max(FIT_MIN, w) * 10) / 10) + "px"); };
    var hs = Array.prototype.slice.call(wrap.children);
    if (hs.length > 1) {
      var used = (parseFloat(getComputedStyle(wrap).columnGap) || 0) * (hs.length - 1), cardsW = 0;
      hs.forEach(function (h) { used += W(h); cardsW += W(h.firstChild); });
      // (a hand's width is its row of cards, which scales with the card,
      // and its padding and border, which don't)
      if (used > wrap.clientWidth - 0.5) { hw = hw * (wrap.clientWidth - 0.5 - (used - cardsW)) / cardsW; set(wrap, hw); hw = unit(wrap); }
      if (document.documentElement.scrollHeight - innerHeight > 1 && wrap.querySelector(".tag")) wrap.classList.add("stamp");
    }
    for (var k = 0; k < 4; k++) {
      var over = document.documentElement.scrollHeight - innerHeight;
      if (over <= 1) return;          // (a pixel's rounding)
      // each row of cards is 1.42 cards high: bring down the biggest
      var top = Math.max(hw, dw), n = (hw >= top - 0.05 ? 1 : 0) + (dw >= top - 0.05 ? 1 : 0);
      if (top <= FIT_MIN) return;
      top -= over / (1.42 * n) + 0.2;
      if (hw > top) { set(wrap, top); hw = unit(wrap); if (isNaN(hw)) hw = top; }
      if (dw > top) { set(d, top); dw = unit(d); }
    }
  }
  window.addEventListener("resize", fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  function banner(text, kind) {
    var b = $("banner");
    b.textContent = text || "";
    b.className = "banner" + (kind ? " " + kind : "") + (text ? " show" : "");
    fit();
  }

  // ---- playing the events out -----------------------------------------------------
  // how long each thing holds the table: the same with Visual FX on or off
  // (FX off drops the slide, never the pace, so the dealer's hand can be followed)
  function wait(e) {
    if (e.t === "card") return 300;
    if (e.t === "reveal") return 420;
    if (e.t === "shuffle") return 700;
    if (e.t === "settle") return 260;
    if (e.t === "bust" || e.t === "insured") return 380;
    if (e.t === "split" || e.t === "double") return 240;
    return 0;
  }
  function apply(e) {
    var from = serial + 1, h;
    if (e.t === "shuffle") { banner("A fresh shoe", "note"); SFX.shuffle(); }
    else if (e.t === "bet") { view.dealer = []; view.hands = [{ cards: [], bet: e.bet }]; view.active = 0; view.splitHands = false; view.stake = e.stake; banner(""); }
    else if (e.t === "card") {
      var c = { card: e.card, hidden: !!e.hidden, side: !!e.sideways, n: ++serial };
      (e.to === "dealer" ? view.dealer : view.hands[e.to].cards).push(c);
      SFX.card();
    }
    else if (e.t === "insure?") { view.asking = true; }
    else if (e.t === "insure") { view.asking = false; view.stake = e.stake; if (e.take) SFX.chip(); }
    else if (e.t === "insured") { view.stake = e.stake; banner(e.won ? "Insurance pays " + signed(e.delta) : "Insurance lost", e.won ? "good" : "bad"); }
    else if (e.t === "reveal") { view.dealer[1].hidden = false; view.dealer[1].turned = true; view.dealer[1].n = ++serial; SFX.turn(); }
    else if (e.t === "double") { view.hands[e.hand].bet = e.bet; view.stake = e.stake; SFX.chip(); }
    else if (e.t === "split") {
      h = view.hands[e.hand];
      view.hands.splice(e.hand + 1, 0, { cards: [h.cards.pop()], bet: e.bet });
      view.splitHands = true; view.stake = e.stake; SFX.chip();
    }
    else if (e.t === "turn") { view.active = e.hand; }
    else if (e.t === "bust") { if (e.hand === "dealer") banner("Dealer busts", "good"); else view.hands[e.hand].result = "bust"; }
    else if (e.t === "settle") {
      h = view.hands[e.hand]; h.result = e.result; h.delta = e.delta; view.stake = e.stake;
    }
    else if (e.t === "done") { view.active = -1; view.stake = e.stake; }
    render(from);
  }
  function play(events, then) {
    busy = true; sync();
    var i = 0;
    (function step() {
      if (i >= events.length) { busy = false; if (then) then(); sync(); return; }
      var e = events[i++];
      apply(e);
      var ms = wait(e);
      if (e.t === "insure?") { busy = false; sync(); return; }       // the table waits for the answer
      if (e.t === "done") { roundOver(e); }
      if (ms) setTimeout(step, ms); else step();
    })();
  }

  // ---- a round ---------------------------------------------------------------------
  function saveStake() { if (mode === "table") store.set("jackblack_stake", table.stake); }
  function deal() {
    if (state !== "table" || busy || inHand()) return;
    if (bet < R.MIN_BET) { SFX.no(); return; }
    audio();
    bet = Math.min(bet, table.limit());
    lastBet = bet;
    var ev = table.deal(bet);
    if (!ev.length) { SFX.no(); return; }
    hands++;
    saveStake();                    // the bet is down: leaving now doesn't take it back
    $("over").hidden = true;
    play(ev);
  }
  function act(what) {
    if (state !== "table" || busy || !table.can(what)) { if (!busy) SFX.no(); return; }
    var ev = table[what]();
    saveStake();
    play(ev);
  }
  function insure(take) {
    if (state !== "table" || busy || table.phase !== "insure") return;
    var ev = table.insure(take);
    saveStake();
    play(ev);
  }
  function roundOver(e) {
    var net = e.net, nat = table.hands.some(function (h) { return h.result === "natural"; });
    banner(net > 0 ? (nat ? "JackBlack! " : "You win ") + signed(net) : net < 0 ? "House wins " + signed(net) : "Push: your bet comes back", net > 0 ? "good" : net < 0 ? "bad" : "note");
    if (net > 0) (nat ? SFX.natural : SFX.win)(); else if (net < 0) SFX.lose(); else SFX.push();
    if (fx() && net > 0) { var f = $("felt"); f.classList.remove("glow"); void f.offsetWidth; f.classList.add("glow"); }
    marks += nat ? "B" : net > 0 ? "W" : net < 0 ? "L" : "P";
    saveStake();
    if (table.stake > peak) peak = table.stake;
    if (mode === "table" && best) best.submit(table.stake);
    bet = Math.min(lastBet, table.limit());
    if (table.broke() || (mode === "daily" && hands >= DAILY_HANDS)) setTimeout(finish, fx() ? 1100 : 600);
  }

  // ---- the end of a run ---------------------------------------------------------------
  function finish() {
    if (state !== "table") return;
    state = "over";
    var broke = table.broke(), d;
    if (mode === "daily") {
      d = readDaily();
      recorded = !d.done;
      if (!d.done) { d.done = true; d.stake = table.stake; d.marks = marks; writeDaily(d); }
      $("over-title").textContent = broke ? "Cleaned out" : "Shoe's dealt";
      $("over-msg").textContent = fmt(table.stake);
      $("over-stats").textContent = (recorded ? "Daily #" + d.n + ": " : "A practice run. Today's recorded result: " + fmt(d.stake) + ". This one: ") +
        hands + (hands === 1 ? " hand" : " hands") + ", " + signed(table.stake - R.STAKE) + " on the day's 1,000";
      $("again").textContent = "Deal it again";
    } else {
      store.remove("jackblack_stake");
      $("over-title").textContent = "Cleaned out";
      $("over-msg").textContent = "0";
      $("over-stats").textContent = "The house has the lot after " + hands + (hands === 1 ? " hand" : " hands") + ". It stood at " + fmt(peak) + " at its best" +
        (best && best.get() ? " (your record: " + fmt(best.get()) + ")" : "") + ".";
      $("again").textContent = "A fresh 1,000";
    }
    $("share").hidden = mode !== "daily";
    $("over").hidden = false;
    sync();
  }
  function shareText() {
    var d = readDaily(), map = { W: "🟩", L: "🟥", P: "⬜", B: "⭐" };
    return "JackBlack Daily #" + d.n + ": " + fmt(d.stake) + " from 1,000\n" +
      d.marks.split("").map(function (m) { return map[m] || ""; }).join("") + "\n" + location.href.split("#")[0].split("?")[0];
  }
  function shareDaily() {
    var text = shareText();
    function copied() { $("share").textContent = "copied!"; setTimeout(function () { $("share").textContent = "Share result"; }, 1400); }
    // (the clipboard wasn't allowed: show the result to copy, in the game's own look)
    function fallback() { if (window.GameShell) GameShell.copyBox({ title: "Copy your result", text: text }); else try { window.prompt("Copy your result:", text); } catch (e) {} }
    if (navigator.share && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) {
      navigator.share({ text: text }).catch(function (e2) { if (!e2 || e2.name !== "AbortError") fallback(); });
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(copied, fallback);
    else fallback();
  }

  // ---- sitting down, and getting up ------------------------------------------------------
  function startRun(m) {
    mode = m; store.set("jackblack_mode", m);
    audio();
    var t = today();
    if (m === "daily") table = new R.Table({ rng: R.seeded(20261011 + t.n * 7919), reshuffle: false, stake: R.STAKE });
    else {
      var saved = store.getNum("jackblack_stake", R.STAKE);
      table = new R.Table({ stake: saved >= R.MIN_BET ? saved : R.STAKE });
    }
    view = { dealer: [], hands: [], active: -1, stake: table.stake, asking: false, splitHands: false };
    hands = 0; marks = ""; peak = table.stake; serial = 0; recorded = false;
    bet = Math.min(Math.max(R.MIN_BET, lastBet), table.limit());
    state = "table";
    $("menu").hidden = true; $("over").hidden = true; $("hud").hidden = false;
    banner(m === "daily" ? "Ten hands from today's shoe" : "Place your bet", "note");
    render(1);
    sync();
  }
  function toMenu() {
    state = "menu"; table = null; busy = false;
    $("menu").hidden = false; $("over").hidden = true; $("hud").hidden = true;
    banner("");
    paintMenu();
    sync();
  }
  // Modes, from the table: a hand in play (its bet is lost) or a Daily under way asks first
  function askToMenu() {
    if (window.GameShell && GameShell.askQuit) GameShell.askQuit({ title: "Leave the table?", ok: "Leave", text: mode === "daily" ? "This Daily run ends here." : "The bet on the table is lost." }, toMenu);
    else toMenu();
  }

  // ---- the controls: what shows, and what's live -----------------------------------------
  function sync() {
    var atTable = state === "table" && !!table;
    var playing = atTable && table.phase === "play" && !busy;
    var asking = atTable && table.phase === "insure" && !busy;
    var betting = atTable && !inHand() && !busy && !table.broke() && !(mode === "daily" && hands >= DAILY_HANDS);
    $("acts").hidden = !(atTable && table.phase === "play");
    $("insure").hidden = !(atTable && table.phase === "insure");
    $("bets").hidden = !(atTable && !inHand());
    $("foot").hidden = !atTable;
    ["hit", "stand", "double", "split"].forEach(function (a) { $("act-" + a).disabled = !(playing && table.can(a)); });
    $("ins-yes").disabled = $("ins-no").disabled = !asking;
    if (atTable && table.phase === "insure") $("ins-cost").textContent = fmt(table.hands[0].bet / 2);
    var lim = atTable ? table.limit() : 0;
    document.querySelectorAll("#chips button").forEach(function (b) { b.disabled = !(betting && bet + (+b.dataset.v) <= lim); });
    $("clear").disabled = !(betting && bet > 0);
    $("deal").disabled = !(betting && bet >= R.MIN_BET);
    $("bet-amt").textContent = fmt(bet);
    if (atTable) {
      $("hud-mode").textContent = mode === "daily" ? "Daily #" + today().n : "Open table";
      $("hud-hand").textContent = mode === "daily" ? "hand " + Math.min(DAILY_HANDS, hands + (inHand() ? 0 : 1)) + " of " + DAILY_HANDS : hands + (hands === 1 ? " hand" : " hands");
      $("hud-best").textContent = mode === "table" && best && best.get() ? "best " + fmt(best.get()) : "";
      $("hud-stake").textContent = fmt(view.stake);
    }
    fit();
  }
  function addChip(v) {
    if (state !== "table" || busy || inHand()) return;
    var lim = table.limit();
    if (bet + v > lim) { SFX.no(); return; }
    bet += v; SFX.chip(); sync();
  }

  // ---- the menu ---------------------------------------------------------------------------
  function paintMenu() {
    document.querySelectorAll("#pick-mode button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === mode); b.setAttribute("aria-pressed", b.dataset.v === mode); });
    var d = readDaily(), saved = store.getNum("jackblack_stake", 0);
    $("daily-small").textContent = d.done ? "today's result: " + fmt(d.stake) + " (play on for practice)" : "ten hands, the same cards for everyone";
    $("table-small").textContent = saved >= R.MIN_BET ? "your stake stands at " + fmt(saved) : "a stake of 1,000, yours until it's gone";
    $("bests").textContent = best && best.get() ? "Best stake at the open table: " + fmt(best.get()) : "";
  }
  document.querySelectorAll("#pick-mode button").forEach(function (b) {
    b.addEventListener("click", function () { mode = b.dataset.v; store.set("jackblack_mode", mode); paintMenu(); });
    b.addEventListener("mousedown", function (e) { e.preventDefault(); });
  });
  $("play").addEventListener("click", function () { startRun(mode); });

  // ---- buttons ----------------------------------------------------------------------------
  $("act-hit").addEventListener("click", function () { act("hit"); });
  $("act-stand").addEventListener("click", function () { act("stand"); });
  $("act-double").addEventListener("click", function () { act("double"); });
  $("act-split").addEventListener("click", function () { act("split"); });
  $("ins-yes").addEventListener("click", function () { insure(true); });
  $("ins-no").addEventListener("click", function () { insure(false); });
  document.querySelectorAll("#chips button").forEach(function (b) { b.addEventListener("click", function () { addChip(+b.dataset.v); }); });
  $("clear").addEventListener("click", function () { if (state === "table" && !busy && !inHand()) { bet = 0; sync(); } });
  $("deal").addEventListener("click", deal);
  $("leave").addEventListener("click", askToMenu);
  $("again").addEventListener("click", function () { startRun(mode); });
  $("to-menu").addEventListener("click", toMenu);
  $("share").addEventListener("click", shareDaily);
  // a click on a table button doesn't leave it focused, so Enter stays Deal
  document.querySelectorAll("#controls button").forEach(function (b) { b.addEventListener("mousedown", function (e) { e.preventDefault(); }); });

  // ---- keys (GameShell.menuKeys: each presses its button, and the button wears it) ---------
  if (window.GameShell && GameShell.menuKeys) {
    GameShell.menuKeys({ active: function () { return state === "menu"; }, groups: [{ sel: "#pick-mode button", into: "b" }], start: "#play", space: true });
    GameShell.menuKeys({
      active: function () { return state === "table" && !busy && !inHand(); },
      groups: [{ sel: "#chips button", into: ".cap" }, { sel: "#clear", keys: ["c"] }],
      start: "#deal", space: true
    });
    GameShell.menuKeys({
      active: function () { return state === "table" && !busy && inHand(); },
      groups: [{ sel: "#act-hit", keys: ["h"] }, { sel: "#act-stand", keys: ["s"] }, { sel: "#act-double", keys: ["d"] }, { sel: "#act-split", keys: ["x"] },
        { sel: "#ins-yes", keys: ["y"] }, { sel: "#ins-no", keys: ["n"] }]
    });
    // Modes is there the whole time at the table (it asks first mid-hand)
    GameShell.menuKeys({ active: function () { return state === "table" && !busy; }, groups: [{ sel: "#leave", keys: ["Backspace"] }] });
    GameShell.menuKeys({
      active: function () { return state === "over"; },
      groups: [{ sel: "#share", keys: ["s"] }, { sel: "#to-menu", keys: ["Backspace"] }],
      start: "#again", space: true
    });
  }

  // Leaving asks first while a hand is in play (its bet would be lost) or a
  // Daily run is under way; between hands at the open table the stake is
  // saved, so there's nothing to lose
  if (window.GameShell && GameShell.guardLeave) GameShell.guardLeave(function () { return state === "table" && (inHand() || dailyLive()); });
  // The ⏸ button and P bring up the card. Menu is the table's own Modes, which
  // asks first with a bet on the table or a Daily under way. Restart gets up
  // and sits straight back down at the same table (a bet in play is lost, as
  // it is by leaving); a Daily is one run, so it has none.
  if (window.GameShell && GameShell.pausable) GameShell.pausable({
    canPause: function () { return state === "table" && !busy; }, auto: false, hold: true,
    restart: {
      when: function () { return mode !== "daily"; },
      ask: inHand, title: "Start over?", text: "The bet on the table is lost.",
      go: function () { var m = mode; toMenu(); startRun(m); }
    },
    menu: { ask: false, go: askToMenu }
  });

  window.addEventListener("reducemotionchange", function () { document.body.classList.toggle("fxon", fx()); });
  document.body.classList.toggle("fxon", fx());

  paintMenu();
  sync();

  // test hooks: the Playwright harness drives runs through these
  window.JackBlack = {
    state: function () { return state; },
    mode: function () { return mode; },
    busy: function () { return busy; },
    table: function () { return table; },
    bet: function () { return bet; },
    hands: function () { return hands; },
    start: startRun,
    // the next cards the shoe will deal, in order (player, dealer, player, dealer, then draws)
    stack: function (ranks) {
      var cards = ranks.split(" ").map(function (x) { return { r: { A: 1, T: 10, J: 11, Q: 12, K: 13 }[x] || +x, s: 0 }; });
      for (var i = cards.length - 1; i >= 0; i--) table.shoe.push(cards[i]);
    },
    shareText: shareText
  };
})();
