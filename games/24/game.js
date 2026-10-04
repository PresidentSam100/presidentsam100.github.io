/* =====================================================================
   24 — make 24 from four cards, on an 84×48 phone LCD.

   Screens are drawn in immediate mode every frame into the LCD
   framebuffer (lcd.js); keys come from the on-screen phone, the
   keyboard, or taps on the cards. The phone has what a 2000s candybar
   had: one Navi key whose label is shown at the bottom of the screen,
   a C key (back / undo; hold to reset), an up/down rocker, and the
   keypad. On the keypad 1-4 pick cards, 5-8 are + - × ÷, 9 hints,
   0 resets, * undoes and # skips.

   Modes: Classic (a streak that ramps easy -> hard), Time attack (2 min),
   Daily (one hand a day, the same for everyone) and Hard (hands that need
   fractions, or have only one way through).
   ===================================================================== */
(function () {
  "use strict";
  var Solver = window.TwentyFourSolver, P = window.TwentyFourPuzzles;
  var canvas = document.getElementById("lcd"), L = window.TwentyFourLCD(canvas);
  var store = window.GameShell ? GameShell.store : { get: function (k, f) { return f; }, getNum: function (k, f) { return f; }, set: function () {} };
  var live = document.getElementById("lcd-live");

  var KEYS = {
    classic: "twentyfour_best_classic", hard: "twentyfour_best_hard", timed: "twentyfour_best_timed",
    daily: "twentyfour_daily",   // { "2026-09-27": { t: seconds, h: hints, g: gave up } }
  };
  var TIMED_MS = 120000, HINT_COST_MS = 10000, SKIP_COST_MS = 3000;
  var SYM = { "+": "+", "-": "-", "*": "×", "/": "÷" };
  var OP_OF_KEY = { "5": "+", "6": "-", "7": "*", "8": "/" };

  function fx() { return !(window.RM_ON && window.RM_ON()); }
  function now() { return performance.now(); }

  // ---- sound: one-voice square-wave beeps -------------------------------------
  var actx = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function beep(freq, dur, gain, delay) {
    var ac = audio();
    if (!ac) return;
    var t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain || 0.05, t + 0.004);
    g.gain.setValueAtTime(gain || 0.05, t + dur - 0.01);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  // Browsers only let audio start from a user gesture, and Safari/iOS only
  // counts some events as one: unlock on all of them (as Slither does).
  ["pointerdown", "pointerup", "touchend", "keydown", "click"].forEach(function (type) {
    document.addEventListener(type, function () { audio(); }, true);
  });
  function tune(notes, len, gain) { notes.forEach(function (f, i) { if (f) beep(f, len * 0.9, gain || 0.045, i * len); }); }
  var SFX = {
    key: function () { beep(1318, 0.045, 0.035); },
    win: function () { tune([1047, 1319, 1568, 2093, 0, 1568, 2093], 0.075); },
    wrong: function () { tune([392, 294], 0.12, 0.05); },
    deny: function () { beep(220, 0.09, 0.05); },
    hint: function () { tune([880, 1175], 0.08); },
    tick: function () { beep(2093, 0.025, 0.03); },
    timeUp: function () { tune([784, 659, 523, 392], 0.14, 0.05); },
    menu: function () { beep(1568, 0.03, 0.03); },
  };

  // ---- numbers on screen ---------------------------------------------------------
  function isInt(v) { return v.d === 1; }
  function fmt(v) { return Solver.str(v); }
  // As an operand in a step: fractions and negatives go in brackets.
  function operand(v, first) { return !isInt(v) || (v.n < 0 && !first) ? "(" + fmt(v) + ")" : fmt(v); }
  function stepText(s) { return operand(s.a, true) + SYM[s.op] + operand(s.b, false) + "=" + fmt(s.r); }

  // Where the cards sit: 72 px between the side meters, centred.
  function cardRects(n) {
    var gap = n === 4 ? 1 : 2, w = Math.min(35, Math.floor((72 - (n - 1) * gap) / n)), total = n * w + (n - 1) * gap;
    var x0 = 6 + Math.floor((72 - total) / 2), out = [];
    for (var i = 0; i < n; i++) out.push({ x: x0 + i * (w + gap), y: 10, w: w, h: 16 });
    return out;
  }
  // How a value is drawn inside a card of inner width `inner`: the biggest
  // font that fits, or a stacked fraction in the tiny font.
  function fitValue(v, inner) {
    if (isInt(v)) {
      var s = String(v.n);
      if (L.width(s, "B") <= inner) return { kind: "B", s: s };
      if (L.width(s, "M") <= inner) return { kind: "M", s: s };
      if (L.width(s, "S") <= inner) return { kind: "S", s: s };
      return null;
    }
    var num = String(v.n), den = String(v.d), w = Math.max(L.width(num, "S"), L.width(den, "S"));
    return w <= inner ? { kind: "frac", num: num, den: den, w: w } : null;
  }
  function drawValue(v, r, on) {
    var inner = r.w - 2, f = fitValue(v, inner);
    if (!f) { L.text("?", r.x + 1 + Math.floor((inner - 5) / 2), r.y + 4, "M", on); return; }
    if (f.kind === "frac") {
      var cx = r.x + 1 + Math.floor((inner - f.w) / 2);
      L.text(f.num, cx + Math.floor((f.w - L.width(f.num, "S")) / 2), r.y + 1, "S", on);
      L.fill(cx, r.y + 7, f.w, 1, on);
      L.text(f.den, cx + Math.floor((f.w - L.width(f.den, "S")) / 2), r.y + 9, "S", on);
      return;
    }
    var h = f.kind === "B" ? 9 : f.kind === "M" ? 7 : 5;
    L.text(f.s, r.x + 1 + Math.floor((inner - L.width(f.s, f.kind)) / 2), r.y + 1 + Math.floor((14 - h) / 2), f.kind, on);
  }
  function center(str, y, font, on, x0, w) {
    x0 = x0 || 0; w = w || 84;
    L.text(str, x0 + Math.floor((w - L.width(str, font || "M")) / 2), y, font || "M", on);
  }

  // ---- side meters: signal bars (difficulty) and battery (time left) ----------
  function signal(level) {
    // antenna
    L.px(0, 0); L.px(2, 0); L.px(4, 0); L.px(1, 1); L.px(2, 1); L.px(3, 1); L.fill(2, 2, 1, 3);
    for (var b = 0; b < 4; b++) {
      var w = 5 - b, y = 7 + b * 3;           // the top bar is the widest
      if (4 - b <= level) L.fill(0, y, w, 2);
    }
  }
  function battery(frac, blink) {
    L.fill(80, 0, 3, 1); L.frame(79, 1, 5, 5); L.fill(79, 1, 5, 1); L.fill(79, 5, 5, 1);
    var bars = Math.ceil(Math.max(0, Math.min(1, frac)) * 4);
    for (var b = 0; b < 4; b++) {
      var w = 5 - b, y = 7 + b * 3;
      if (4 - b <= bars && !(blink && 4 - b === bars)) L.fill(84 - w, y, w, 2);
    }
  }

  // ---- puzzle dealing ---------------------------------------------------------------
  var POOLS = {};
  ["easy", "medium", "hard", "tough", "daily"].forEach(function (k) { POOLS[k] = P[k].split(" "); });
  var bags = {};
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  // No repeats until a pool is used up.
  function draw(pool) {
    if (!bags[pool] || !bags[pool].length) bags[pool] = shuffle(POOLS[pool].slice());
    return bags[pool].pop();
  }
  // The daily hand: day number from a fixed start, by the player's local date.
  var DAY0 = Date.UTC(2026, 8, 27);
  function today() {
    var d = new Date(), ymd = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    var n = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - DAY0) / 86400000);
    var list = POOLS.daily, code = list[((n % list.length) + list.length) % list.length];
    return { ymd: ymd, n: n + 1, code: code };
  }
  // { "2026-09-27": { t: seconds, h: hints, g: 1 if given up, p: 1 while still being played } }
  function dailyLog() { try { var o = JSON.parse(store.get(KEYS.daily, "{}")); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; } }
  function dailyDone(e) { return !!e && !e.p; }
  function dailySolved(e) { return !!e && !e.p && !e.g; }
  function dailySave(fields) {
    if (!G || !G.daily) return;
    var log = dailyLog();
    log[G.daily.ymd] = fields;
    store.set(KEYS.daily, JSON.stringify(log));
  }
  // The attempt is recorded from the first look at the hand, so quitting or
  // reloading resumes the same clock and hint count instead of a fresh try.
  function dailyPending() { if (G && G.daily && !G.over) dailySave({ t: Math.round(G.elapsed / 1000), h: G.hints, p: 1 }); }
  function dailyStreak() {
    var log = dailyLog(), d = new Date(), n = 0;
    for (;;) {
      var k = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
      if (dailySolved(log[k])) n++; else if (n || k !== today().ymd) break;
      d.setDate(d.getDate() - 1);
      if (n > 3650) break;
    }
    return n;
  }
  function mmss(ms) { var s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }

  // ---- state -------------------------------------------------------------------------
  var screen = null;          // the active screen object
  var G = null;               // the game in progress
  var clockLast = 0;

  function go(s) { screen = s; if (s.enter) s.enter(); announce(); }
  function announce() {
    if (!live) return;
    var t = screen && screen.speak ? screen.speak() : "";
    if (t && live.textContent !== t) live.textContent = t;
  }

  // ---- a hand of cards -----------------------------------------------------------------
  function newGame(mode) {
    G = { mode: mode, streak: 0, solved: 0, hints: 0, timeLeft: TIMED_MS, elapsed: 0, over: false };
    if (mode === "daily") {
      var t = today(), prev = dailyLog()[t.ymd];
      G.daily = t;
      deal(Solver.decode(t.code));
      if (prev && prev.p) { G.elapsed = (prev.t || 0) * 1000; G.hints = prev.h || 0; }
      dailyPending();
    } else deal(null);
    go(Game);
  }
  function tierPool() {
    if (G.mode === "hard") return "tough";
    if (G.mode === "timed") return G.solved < 3 ? "easy" : Math.random() < 0.5 ? "easy" : "medium";
    return G.streak < 5 ? "easy" : G.streak < 12 ? "medium" : "hard";
  }
  function deal(ints) {
    var pool = ints ? "daily" : tierPool();
    if (!ints) ints = shuffle(Solver.decode(draw(pool)));
    G.pool = pool;
    G.hand = ints;
    G.cards = Solver.fromInts(ints);
    G.sel = -1; G.op = null; G.hist = []; G.last = null; G.hinted = false; G.msg = null; G.skipArmed = 0; G.celebrate = 0;
  }
  function level() { return G.pool === "easy" ? 2 : G.pool === "medium" ? 3 : 4; }
  function say(text, ms) { G.msg = { text: text, until: now() + (ms || 1800) }; }

  function pickCard(i) {
    if (i >= G.cards.length) return SFX.deny();
    if (G.sel === -1) { G.sel = i; return; }
    if (G.sel === i) { G.sel = -1; G.op = null; return; }
    if (!G.op) { G.sel = i; return; }
    var a = G.cards[G.sel], b = G.cards[i], r = Solver.apply(a, G.op, b);
    if (!r) { say("Can't ÷ 0"); SFX.deny(); return; }
    G.hist.push({ cards: G.cards.slice(), sel: G.sel, last: G.last });
    var step = { a: a, op: G.op, b: b, r: r }, keep = [];
    G.cards.forEach(function (c, k) { if (k !== G.sel) keep.push(k === i ? r : c); });
    var newIdx = i - (G.sel < i ? 1 : 0);
    G.cards = keep; G.last = step; G.op = null; G.sel = newIdx; G.msg = null;
    if (G.cards.length === 1) {
      if (Solver.is24(r)) return solved();
      say("Not 24: undo", 2600); SFX.wrong();
    }
  }
  function pickOp(op) {
    if (G.sel === -1) { say("Pick a card"); SFX.deny(); return; }
    G.op = op;
  }
  function undo() {
    if (G.op) { G.op = null; return; }
    var h = G.hist.pop();
    if (!h) { if (G.sel !== -1) G.sel = -1; else SFX.deny(); return; }
    G.cards = h.cards; G.sel = -1; G.last = h.last; G.msg = null;
  }
  function reset() {
    if (!G.hist.length && G.sel === -1) return;
    G.cards = Solver.fromInts(G.hand); G.sel = -1; G.op = null; G.hist = []; G.last = null; G.msg = null;
  }
  function hint() {
    var sol = Solver.solve(G.cards);
    if (!sol) { say("No 24 here: 0", 2600); SFX.deny(); return; }
    var s = sol[0];
    G.hinted = true; G.hints++;
    dailyPending();
    if (G.mode === "timed") G.timeLeft -= HINT_COST_MS;
    say("Try " + stepText(s).split("=")[0], 3200);
    SFX.hint();
  }
  function solved() {
    SFX.win();
    G.celebrate = now();
    G.sel = -1;
    if (G.mode === "daily") {
      dailySave({ t: Math.round(G.elapsed / 1000), h: G.hints });
      G.over = true;
      setTimeout(function () { if (screen === Game) go(DailyDone); }, 1100);
      return;
    }
    if (G.mode === "timed") G.solved++;
    else if (!G.hinted) { G.streak++; bestSubmit(G.mode === "hard" ? KEYS.hard : KEYS.classic, G.streak); }
    setTimeout(function () { if (screen === Game && G && !G.over) { deal(null); announce(); } }, G.mode === "timed" ? 450 : 900);
  }
  function bestSubmit(key, v) { if (v > store.getNum(key, 0)) store.set(key, v); }
  function skip() {
    if (G.mode === "timed") { G.timeLeft -= SKIP_COST_MS; deal(null); say("Skipped -3s", 1200); return; }
    Answer.from = G.mode === "daily" ? "daily" : "skip";
    go(Answer);
  }

  // ---- screens -----------------------------------------------------------------------------
  function header(title, right) {
    L.text(title, 1, 0, "M");
    if (right) L.text(right, 83 - L.width(right, "M"), 0, "M");
  }
  function navi(label) { if (label) center(label, 39, "M"); }
  // A Nokia-style list: 3 rows, the chosen one inverted, a scrollbar on the right.
  function list(items, cur, top) {
    for (var r = 0; r < 3; r++) {
      var i = top + r;
      if (i >= items.length) break;
      var y = 10 + r * 10;
      if (i === cur) { L.fill(0, y - 1, 80, 10); L.text(items[i], 2, y, "M", 0); }
      else L.text(items[i], 2, y, "M");
    }
    L.fill(82, 9, 1, 30);
    var th = Math.max(4, Math.round(30 * 3 / Math.max(3, items.length))), ty = 9 + Math.round((30 - th) * (items.length > 3 ? top / (items.length - 3) : 0));
    L.fill(81, ty, 3, th);
  }
  function scrollList(state, dir, n) {
    state.cur = (state.cur + dir + n) % n;
    if (state.cur < state.top) state.top = state.cur;
    if (state.cur > state.top + 2) state.top = state.cur - 2;
  }

  var MENU = [
    { label: "Classic", run: function () { newGame("classic"); } },
    { label: "Time attack", run: function () { newGame("timed"); } },
    { label: "Daily", run: function () { if (dailyDone(dailyLog()[today().ymd])) { G = null; go(DailyDone); } else newGame("daily"); } },
    { label: "Hard", run: function () { newGame("hard"); } },
    { label: "Scores", run: function () { go(Scores); } },
    { label: "How to play", run: function () { Help.top = 0; go(Help); } },
  ];
  var Menu = {
    cur: 0, top: 0,
    draw: function () {
      header("24", String(this.cur + 1));
      list(MENU.map(function (m) { return m.label; }), this.cur, this.top);
      navi("Select");
    },
    key: function (k) {
      if (k === "up") scrollList(this, -1, MENU.length);
      else if (k === "down") scrollList(this, 1, MENU.length);
      else if (k === "navi") MENU[this.cur].run();
      else if (/^[1-6]$/.test(k)) { this.cur = Number(k) - 1; this.top = Math.min(this.cur, MENU.length - 3); MENU[this.cur].run(); }
    },
    speak: function () { return "Menu: " + MENU[this.cur].label; },
  };

  var Game = {
    enter: function () { clockLast = now(); },
    draw: function (t) {
      var modeTitle = { classic: "Streak " + G.streak, hard: "Hard " + G.streak, timed: "✓ " + G.solved, daily: "Daily" }[G.mode];
      var right = G.mode === "timed" ? mmss(G.timeLeft) : G.mode === "daily" ? mmss(G.elapsed) : "";
      L.text(modeTitle, 6, 0, "M");
      if (right) L.text(right, 77 - L.width(right, "M"), 0, "M");
      signal(level());
      battery(G.mode === "timed" ? G.timeLeft / TIMED_MS : 1, G.mode === "timed" && G.timeLeft < 15000 && fx() && Math.floor(t / 400) % 2 === 0);
      // The cards (or the win flash).
      var rects = cardRects(G.cards.length);
      if (G.celebrate) {
        var r0 = { x: 6, y: 9, w: 72, h: 18 };
        L.fill(r0.x, r0.y, r0.w, r0.h);
        center("24!", r0.y + 4, "B", 0, r0.x, r0.w);
      } else {
        G.cards.forEach(function (c, i) {
          var r = rects[i], sel = i === G.sel;
          if (sel) L.fill(r.x, r.y, r.w, r.h); else L.frame(r.x, r.y, r.w, r.h);
          if (sel) { L.px(r.x, r.y, 0); L.px(r.x + r.w - 1, r.y, 0); L.px(r.x, r.y + r.h - 1, 0); L.px(r.x + r.w - 1, r.y + r.h - 1, 0); }
          drawValue(c, r, !sel);
        });
      }
      // The line under the cards: a message, the step being built, the last step, or the goal.
      var line;
      if (G.msg && t < G.msg.until) line = G.msg.text;
      else if (G.sel !== -1 && G.op) line = operand(G.cards[G.sel], true) + SYM[G.op] + (fx() && Math.floor(t / 450) % 2 ? " " : "_");
      else if (G.last) line = stepText(G.last);
      else line = G.hand.length === 4 && !G.hist.length ? "Make 24" : "";
      if (line) {
        if (L.width(line, "M") > 84 && G.last && line === stepText(G.last)) line = "=" + fmt(G.last.r);
        center(line, 29, "M");
      }
      navi(G.celebrate ? "" : "Options");
    },
    tick: function (dt) {
      if (G.celebrate) return;
      if (G.mode === "daily") {
        var sec = Math.floor(G.elapsed / 1000);
        G.elapsed += dt;
        if (Math.floor(G.elapsed / 1000) !== sec) dailyPending();   // keep the saved clock current
      }
      if (G.mode === "timed") {
        var before = Math.ceil(G.timeLeft / 1000);
        G.timeLeft -= dt;
        var after = Math.ceil(G.timeLeft / 1000);
        if (after < before && after <= 10 && after > 0) SFX.tick();
        if (G.timeLeft <= 0) { G.timeLeft = 0; G.over = true; bestSubmit(KEYS.timed, G.solved); SFX.timeUp(); go(TimeUp); }
      }
    },
    key: function (k) {
      if (G.celebrate || G.over) return;
      if (/^[1-4]$/.test(k)) pickCard(Number(k) - 1);
      else if (OP_OF_KEY[k]) pickOp(OP_OF_KEY[k]);
      else if (k === "*" || k === "C") undo();
      else if (k === "C-hold" || k === "0") reset();
      else if (k === "9") hint();
      else if (k === "#") {
        if (G.mode === "timed") return skip();
        if (G.mode === "daily") return confirmGiveUp();
        if (G.streak > 0 && now() - G.skipArmed > 2500) { G.skipArmed = now(); say("# again: skip", 2500); return; }
        skip();
      } else if (k === "navi") { Options.cur = 0; Options.top = 0; go(Options); }
      else if (k === "esc") { if (G.mode === "timed" || G.mode === "daily") go(Paused); else { Options.cur = 0; Options.top = 0; go(Options); } }
    },
    speak: function () {
      return (G.celebrate ? "24! " : "") + "Cards: " + G.cards.map(fmt).join(", ") + (G.sel !== -1 ? ". Picked " + fmt(G.cards[G.sel]) : "") + (G.op ? " " + { "+": "plus", "-": "minus", "*": "times", "/": "divided by" }[G.op] : "");
    },
    tap: function (x, y) {
      if (y < 9 || y > 27) return;
      var rects = cardRects(G.cards.length);
      for (var i = 0; i < rects.length; i++) if (x >= rects[i].x && x < rects[i].x + rects[i].w) return this.key(String(i + 1));
    },
  };
  function confirmGiveUp() { Confirm.ask("Give up?", "See the answer", "Give up", function () { skip(); }); }

  var Options = {
    cur: 0, top: 0,
    items: function () {
      var skipLabel = G.mode === "daily" ? "Give up" : "Skip";
      return [["Hint (9)", function () { go(Game); hint(); }], ["Undo (*)", function () { go(Game); undo(); }],
        ["Reset (0)", function () { go(Game); reset(); }], [skipLabel + " (#)", function () { if (G.mode === "daily") confirmGiveUp(); else { go(Game); skip(); } }],
        ["Main menu", function () { quitToMenu(); }]];
    },
    draw: function () {
      var it = this.items();
      header("Options", String(this.cur + 1));
      list(it.map(function (x) { return x[0]; }), this.cur, this.top);
      navi("Select");
    },
    key: function (k) {
      var it = this.items();
      if (k === "up") scrollList(this, -1, it.length);
      else if (k === "down") scrollList(this, 1, it.length);
      else if (k === "navi") it[this.cur][1]();
      else if (k === "C" || k === "esc") go(Game);
    },
    tick: function (dt) { Game.tick(dt); },
    speak: function () { return "Options: " + this.items()[this.cur][0]; },
  };
  function quitToMenu() {
    if (G && G.mode === "timed" && !G.over) bestSubmit(KEYS.timed, G.solved);
    dailyPending();   // a Daily left unfinished resumes from here
    G = null;
    go(Menu);
  }

  var Confirm = {
    ask: function (title, text, yes, fn) { this.title = title; this.text = text; this.yes = yes; this.fn = fn; this.back = screen; go(Confirm); },
    draw: function () { header(this.title); center(this.text, 16, "M"); center("C: back", 27, "M"); navi(this.yes); },
    key: function (k) { if (k === "navi") this.fn(); else if (k === "C" || k === "esc") go(this.back === Options ? Game : this.back); },
    speak: function () { return this.title + " " + this.text; },
  };

  var Paused = {
    draw: function () { header("Paused"); center("Cards hidden,", 12, "M"); center("clock stopped", 22, "M"); navi("Resume"); },
    key: function (k) { if (k === "navi" || k === "esc") go(Game); else if (k === "C") quitToMenu(); },
    speak: function () { return "Paused"; },
  };

  var Answer = {
    enter: function () { this.sol = Solver.solve(Solver.fromInts(G.hand)) || []; },
    draw: function () {
      header("Answer", G.hand.join(" "));
      this.sol.forEach(function (s, i) {
        var t = stepText(s);
        L.text(t, 1, 10 + i * 9, "M");
      });
      navi(this.from === "daily" ? "OK" : "Next");
    },
    key: function (k) {
      if (k !== "navi" && k !== "C") return;
      if (this.from === "daily") {
        dailySave({ t: Math.round(G.elapsed / 1000), h: G.hints, g: 1 });
        G.over = true;
        go(DailyDone);
        return;
      }
      if (k === "C") return quitToMenu();
      G.streak = 0;
      deal(null);
      go(Game);
    },
    speak: function () { return "Answer: " + this.sol.map(stepText).join(", "); },
  };

  var TimeUp = {
    draw: function () {
      header("Time's up!");
      center(G.solved + " solved", 13, "M");
      center("Best " + store.getNum(KEYS.timed, 0), 23, "M");
      navi("Again");
    },
    // C (Backspace) goes to the menu; Esc isn't used here, so it leaves for the games page
    key: function (k) { if (k === "navi") newGame("timed"); else if (k === "C") quitToMenu(); },
    speak: function () { return "Time's up. " + G.solved + " solved."; },
  };

  var shareOut = document.getElementById("share-out");
  var DailyDone = {
    enter: function () { this.copied = 0; },
    draw: function (t) {
      var d = playedDay(), r = dailyLog()[d.ymd] || {};
      header("Daily #" + d.n);
      if (r.g) center("Gave up", 12, "M");
      else center("Solved " + mmss((r.t || 0) * 1000), 12, "M");
      center(r.g ? "Back tomorrow" : (r.h ? r.h + (r.h > 1 ? " hints" : " hint") : "No hints") + " · " + dailyStreak() + "d", 22, "M");
      if (this.copied && t - this.copied < 2000) center("Copied!", 31, "M");
      else center("C: menu", 31, "M");
      navi("Share");
    },
    // C (Backspace) goes to the menu. Esc does too when this was opened from
    // the menu (no game: G is null), like Scores; after a finished Daily it's
    // an end screen, and Esc leaves for the games page (see escActs)
    key: function (k, t) {
      if (k === "navi") share();
      else if (k === "C" || (k === "esc" && !G)) quitToMenu();
    },
    speak: function () { return "Daily done."; },
  };
  function playedDay() { return G && G.daily ? G.daily : today(); }
  function shareText() {
    var d = playedDay(), r = dailyLog()[d.ymd] || {};
    return "24 · Daily #" + d.n + " (" + d.ymd + ")\n" + (r.g ? "Gave up 🏳️" : "Solved in " + mmss((r.t || 0) * 1000) + (r.h ? " with " + r.h + (r.h > 1 ? " hints" : " hint") : " · no hints") + " ✅") +
      "\n" + location.origin + location.pathname;
  }
  function share() {
    var text = shareText();
    function fallback() { if (shareOut) { shareOut.hidden = false; shareOut.querySelector("textarea").value = text; } }
    function copied() { DailyDone.copied = now(); }
    function copy() {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(copied, fallback);
      else fallback();
    }
    if (navigator.share && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) {
      navigator.share({ text: text }).catch(function (e) { if (!e || e.name !== "AbortError") copy(); });   // AbortError: they closed the sheet
      return;
    }
    copy();
  }

  var Scores = {
    cur: 0, top: 0,
    lines: function () {
      var log = dailyLog(), days = Object.keys(log).filter(function (k) { return dailySolved(log[k]); }).length;
      return ["Classic " + store.getNum(KEYS.classic, 0), "Hard " + store.getNum(KEYS.hard, 0), "Time att. " + store.getNum(KEYS.timed, 0),
        "Daily " + days + (days === 1 ? " day" : " days"), "Streak " + dailyStreak() + "d"];
    },
    draw: function () { header("Scores", String(this.cur + 1)); list(this.lines(), this.cur, this.top); navi("Back"); },
    key: function (k) {
      if (k === "up") scrollList(this, -1, this.lines().length);
      else if (k === "down") scrollList(this, 1, this.lines().length);
      else if (k === "navi" || k === "C" || k === "esc") go(Menu);
    },
    speak: function () { return "Scores. " + this.lines().join(", "); },
  };

  var HELP = [
    "Make 24 with", "all four cards", "and + - × ÷.",
    "Pick a card,", "an operator,", "another card:", "they merge.",
    "Keys 1-4: cards", "5 + 6 - 7 × 8 ÷", "* or C: undo", "0: reset", "9: hint", "#: skip",
    "Navi: options", "Hold C: reset",
    "Classic: build", "a streak. It", "gets harder.", "Skipping ends it.",
    "Time attack:", "2 minutes.", "Hints cost 10s.",
    "Daily: one hand", "a day, the same", "for everyone.",
    "Hard: the 116", "trickiest hands;", "some need", "fractions.",
  ];
  var Help = {
    top: 0,
    draw: function () {
      header("How to play");
      for (var r = 0; r < 3; r++) if (HELP[this.top + r]) L.text(HELP[this.top + r], 1, 10 + r * 10, "M");
      L.fill(82, 9, 1, 30);
      L.fill(81, 9 + Math.round(26 * this.top / (HELP.length - 3)), 3, 4);
      navi("Back");
    },
    key: function (k) {
      if (k === "up") this.top = Math.max(0, this.top - 1);
      else if (k === "down" || /^[1-9]$/.test(k)) this.top = Math.min(HELP.length - 3, this.top + 1);
      else if (k === "navi" || k === "C" || k === "esc") go(Menu);
    },
    speak: function () { return HELP.slice(this.top, this.top + 3).join(" "); },
  };

  // ---- input -----------------------------------------------------------------------------------
  function press(k) {
    audio();
    if (!screen) return;
    SFX.key();
    var before = screen;
    screen.key(k, now());
    if (screen === before) announce();
  }
  // Keyboard: digits as on the phone; + - * / (and x) are the operators.
  var KB = {
    "+": "5", "-": "6", "*": "7", "x": "7", "X": "7", "/": "8",
    "Backspace": "C", "Delete": "C", "c": "C", "C": "C", "Enter": "navi", " ": "navi",
    "ArrowUp": "up", "ArrowDown": "down", "Escape": "esc", "#": "#", "h": "9", "H": "9", "r": "0", "R": "0", "s": "#", "S": "#",
  };
  // Esc is claimed only where it does something: pausing (Options in Classic
  // and Hard), resuming, closing Options or a Confirm, or stepping back out
  // of Scores, How to play, or a Daily result opened from the menu. On the
  // main menu and the end screens (Time's up, a finished Daily, an Answer)
  // it's left alone, so the shared motion-toggle.js takes it to the games
  // page; C / Backspace leads from those to this game's menu (a Daily's
  // Answer by way of its result). The Game screen claims it even through
  // the "24!" flash, when it does nothing, so a pause pressed just then
  // never throws the run away.
  function escActs() {
    if (screen === DailyDone) return !G;
    return screen === Game || screen === Options || screen === Confirm || screen === Paused || screen === Scores || screen === Help;
  }
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && /textarea|input/i.test(e.target.tagName)) return;
    var k = /^[0-9]$/.test(e.key) ? e.key : KB[e.key];
    if (!k) return;
    if (k === "esc" && !escActs()) return;
    e.preventDefault();
    if (e.repeat && k !== "up" && k !== "down") return;
    press(k);
  });
  // The phone's keys fire on press; C fires on release, or as "C-hold" after 600 ms.
  Array.prototype.forEach.call(document.querySelectorAll("[data-key]"), function (btn) {
    var k = btn.getAttribute("data-key"), holdTimer = 0, held = false;
    btn.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      btn.classList.add("down");
      if (k === "navi") return;               // fires on release, below
      if (k !== "C") { press(k); return; }
      held = false;
      clearTimeout(holdTimer);
      holdTimer = setTimeout(function () { held = true; press("C-hold"); }, 600);
    });
    function up(e) {
      if (!btn.classList.contains("down")) return;
      btn.classList.remove("down");
      if (k === "C") { clearTimeout(holdTimer); if (!held && e.type === "pointerup") press("C"); held = false; }
      if (k === "navi" && e.type === "pointerup") press("navi");
    }
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointerleave", up);
    btn.addEventListener("pointercancel", up);
    btn.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    btn.addEventListener("click", function (e) { e.preventDefault(); });
    // Keyboard users tabbing onto the phone's keys: Enter / Space on a focused key.
    btn.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); press(k === "C" ? "C" : k); } });
  });
  window.addEventListener("blur", function () {
    Array.prototype.forEach.call(document.querySelectorAll("[data-key].down"), function (b) { b.classList.remove("down"); });
  });
  // Tapping a card on the screen picks it.
  canvas.addEventListener("pointerdown", function (e) {
    if (!screen || !screen.tap) return;
    var r = canvas.getBoundingClientRect();
    var x = Math.floor((e.clientX - r.left) / r.width * 84), y = Math.floor((e.clientY - r.top) / r.height * 48);
    audio(); SFX.key();
    screen.tap(x, y);
    announce();
  });
  window.addEventListener("pagehide", dailyPending);
  function canPause() {
    return (screen === Game || screen === Options || screen === Confirm) && G && (G.mode === "timed" || G.mode === "daily") && !G.over && !G.celebrate;
  }
  if (window.GameShell) GameShell.onAutoPause(function () {
    dailyPending();
    if (canPause()) go(Paused);
  });
  // the ⏸ corner button. Only timed and daily games have a clock to stop;
  // in classic and hard, Esc opens Options and the button stays dimmed, and
  // says why (on the menus it keeps the usual "works during a game")
  if (window.GameShell) GameShell.pauseButton({
    keys: ["Escape"],
    canPause: canPause,
    offTitle: function () {
      var untimed = (screen === Game || screen === Options || screen === Confirm) && G && !G.over && (G.mode === "classic" || G.mode === "hard");
      return untimed ? "No clock in " + (G.mode === "hard" ? "Hard" : "Classic") + " to pause (Esc opens Options)" : "";
    },
    isPaused: function () { return screen === Paused; },
    toggle: function () { audio(); go(screen === Paused ? Game : Paused); }
  });

  // ---- size and loop ------------------------------------------------------------------------------
  var glass = document.getElementById("glass");
  function fit() { L.resize(glass.clientWidth); }
  window.addEventListener("resize", fit);
  fit();

  var prev = new Uint8Array(84 * 48), lastT = 0, settling = true;
  function frame(t) {
    var dt = lastT ? Math.min(t - lastT, 250) : 0;
    lastT = t;
    if (screen && screen.tick && !document.hidden) screen.tick(dt);
    if (G && G.celebrate && t - G.celebrate > (G.mode === "timed" ? 450 : 900)) G.celebrate = 0;
    L.clear();
    if (screen) screen.draw(t);
    var changed = false;
    for (var i = 0; i < prev.length; i++) if (prev[i] !== L.fb[i]) { changed = true; break; }
    if (changed || settling) { settling = L.render(fx()); prev.set(L.fb); }
    requestAnimationFrame(frame);
  }
  window.addEventListener("resize", function () { settling = true; });
  go(Menu);
  requestAnimationFrame(frame);

  // For tests and the fit check.
  window.TwentyFour = { cardRects: cardRects, fitValue: fitValue, stepText: stepText, lcd: L, state: function () { return { screen: screen && screenName(screen), G: G }; }, press: press, today: today };
  function screenName(s) { return s === Menu ? "menu" : s === Game ? "game" : s === Options ? "options" : s === Confirm ? "confirm" : s === Paused ? "paused" : s === Answer ? "answer" : s === TimeUp ? "timeup" : s === DailyDone ? "dailydone" : s === Scores ? "scores" : s === Help ? "help" : "?"; }
})();
