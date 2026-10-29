/* =====================================================================
   Switcheroo: the shell game at a diner counter. A glass marble of each
   colour drops into its own red tumbler, the tumblers turn over and
   switch places, a pair at a time and later several pairs at once, and
   then the counter asks where each colour went. A wrong pick costs one of
   three lives, and leaves that tumbler up beside the right one for the rest
   of the round (a colour already in sight isn't asked). Every round cleared
   is a level up: more tumblers, more switches, quicker hands, and from
   level 5 empty tumblers mixed in. Two bests: the level reached, and the
   most marbles found in a run.

   That is The Works. Short Order is the other way to play: one coloured
   marble goes in, a black skull marble into every other tumbler, and the
   counter asks for that one colour alone. Following one marble is easier
   than following them all, so its levels start with quicker hands (a
   ladder of its own, under the same limits). A skull costs a life and
   shows where the colour was, then the same level is dealt again: only a
   find moves a run on. Its best is the level reached.

   Everything that moves runs on the game's own clock (`clock`), which the
   animation frame moves on only while a run is in play and not paused, and
   every step of a round is an event on that clock (after()). A late frame
   is clamped, so it slows the round rather than skipping a switch, and a
   pause stops the round exactly where it was. While paused the counter is
   hidden, and on resume the round carries on from the very frame it
   stopped at, the same switches still to come: a pause is never a second
   look at a shuffle, nor a fresh deal of one.
   ===================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  function fx() { return !(window.RM_ON && window.RM_ON()); }
  var store = window.GameShell ? GameShell.store : {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };

  // ---- the marbles ---------------------------------------------------------------------
  var MARBLES = [
    { name: "red", col: "#e3313f", hi: "#ffb3b8", lo: "#7a0c18" },
    { name: "blue", col: "#2f6fe0", hi: "#b5d0ff", lo: "#112d6b" },
    { name: "yellow", col: "#f6c619", hi: "#fff5b8", lo: "#8d6200" },
    { name: "green", col: "#2ea65a", hi: "#b2f2c8", lo: "#0d4a25" },
    { name: "purple", col: "#8d50d2", hi: "#dcc4ff", lo: "#391561" },
    { name: "orange", col: "#f47b18", hi: "#ffd0a3", lo: "#773100" },
    // (Short Order's: black glass with a bone-white skull, never asked for)
    { name: "skull", col: "#2c2733", hi: "#8b8496", lo: "#09070c", skull: true }
  ];
  var SKULL = 6;

  // ---- the levels -----------------------------------------------------------------------
  // [tumblers, marbles (the rest are empty), switches, ms a switch takes one
  // slot over, ms between switches, pairs that may switch at once, and how
  // many slots apart two switching tumblers may stand]. Past the table every
  // level adds a switch and takes 10 ms off, down to the floors below.
  var LEVELS = [
    [3, 3, 3, 760, 200, 1, 1],
    [3, 3, 5, 680, 170, 1, 2],
    [4, 4, 5, 640, 160, 1, 2],
    [4, 4, 7, 560, 140, 1, 3],
    [4, 3, 8, 520, 130, 1, 3],     // the first empty tumbler
    [5, 4, 8, 500, 120, 2, 3],     // the first pairs switching at once
    [5, 5, 10, 460, 110, 2, 4],
    [5, 4, 11, 430, 100, 2, 4],
    [6, 5, 12, 410, 100, 2, 5],
    [6, 4, 13, 390, 90, 2, 5],     // two empty
    [6, 5, 14, 370, 90, 3, 5],
    [6, 6, 15, 350, 80, 3, 5]
  ];
  // Short Order's: one marble to follow, so quicker hands and more switches
  // from the first level, and each level still a little harder than the last
  // (the same columns; the one marble, the rest skulls)
  var SHORT = [
    [3, 1, 4, 640, 170, 1, 2],
    [3, 1, 6, 580, 150, 1, 2],
    [4, 1, 6, 540, 140, 1, 3],
    [4, 1, 8, 490, 125, 1, 3],
    [5, 1, 8, 460, 115, 1, 4],
    [5, 1, 9, 430, 105, 2, 4],
    [5, 1, 11, 400, 100, 2, 4],
    [6, 1, 11, 380, 95, 2, 5],
    [6, 1, 12, 360, 90, 2, 5],
    [6, 1, 14, 340, 85, 2, 5],
    [6, 1, 15, 320, 80, 3, 5],
    [6, 1, 16, 300, 75, 3, 5]
  ];
  // How quick it may ever get, so a shuffle stays something a person can
  // follow: a watcher gets at least WATCH ms for each switch, however many
  // happen at once (three pairs together take three times as long); no
  // switch travels in under FLOOR ms; and no tumbler crosses more than a
  // slot every SLOT_MS ms (a long switch takes longer).
  var WATCH = 180, FLOOR = 240, SLOT_MS = 110, MOST_SWITCHES = 24;
  // (a level of The Works, or of Short Order with `md` "short")
  function spec(n, md) {
    n = Math.max(1, Math.floor(n) || 1);
    var short = md === "short", table = short ? SHORT : LEVELS;
    var row = table[Math.min(n, table.length) - 1], past = Math.max(0, n - table.length);
    return {
      level: n,
      cups: row[0],
      marbles: short ? 1 : past ? [5, 4, 6][(past - 1) % 3] : row[1],
      swaps: Math.min(MOST_SWITCHES, row[2] + past),
      ms: Math.max(FLOOR, row[3] - 10 * past),
      gap: Math.max(60, row[4] - 2 * past),
      pairs: row[5],
      span: row[6]
    };
  }
  // how long one step takes: its widest pair sets the pace, and pairs at once share the watcher
  function stepTime(s, pairs, span) {
    return Math.round(Math.max(s.ms * (1 + 0.16 * (span - 1)), FLOOR, SLOT_MS * span, WATCH * pairs - s.gap));
  }
  // a round's switches: steps of one or more pairs, the pairs in a step side
  // by side (no two spans overlap, so no tumbler passes through a pair it
  // isn't in), each pair's two tumblers going one round the front and one
  // round the back; a step never just undoes the one before it
  function plan(s, rnd) {
    rnd = rnd || Math.random;
    var steps = [], left = s.swaps, prev = "";
    while (left > 0) {
      var want = 1 + Math.floor(rnd() * Math.min(s.pairs, left)), pairs = [], key = "";
      for (var tries = 0; tries < 60 && pairs.length < want; tries++) {
        var a = Math.floor(rnd() * s.cups), b = Math.floor(rnd() * s.cups);
        if (a === b) continue;
        if (a > b) { var t = a; a = b; b = t; }
        if (b - a > s.span) continue;
        if (pairs.some(function (p) { return !(b < p[0] || a > p[1]); })) continue;
        pairs.push([a, b, rnd() < 0.5 ? 1 : -1]);
      }
      pairs.sort(function (p, q) { return p[0] - q[0]; });
      key = pairs.map(function (p) { return p[0] + "-" + p[1]; }).join(",");
      if (key === prev && s.cups > 2) continue;
      prev = key;
      var span = Math.max.apply(null, pairs.map(function (p) { return p[1] - p[0]; }));
      steps.push({ pairs: pairs, dur: stepTime(s, pairs.length, span), gap: s.gap });
      left -= pairs.length;
    }
    return steps;
  }
  function shuffled(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // the moments of a round (ms on the game clock)
  var FADE_IN = 260, STAGGER = 230, FALL = 430, FLIP = 460, HOLD = 420, SETTLE = 320, LIFT = 330, CLEAR_MS = 1500, LOST_MS = 1500, OVER_WAIT = 700;
  var STAGGER_SHORT = 150, AGAIN_MS = 1300;   // (Short Order: a skull in every other tumbler goes in quicker; after a skull, the wait before the level is dealt again)
  function lookTime(m) { return 650 + 110 * m; }   // the marbles stay in sight this long once the last is in (m: the colours to remember)

  // ---- sound -----------------------------------------------------------------------------
  var actx = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function tone(f, dur, type, vol, delay, slide) {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime + (delay || 0), o = ac.createOscillator(), gn = ac.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(vol || 0.06, t0 + 0.008); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function hiss(dur, freq, vol) {
    var ac = audio(); if (!ac) return;
    var len = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / len);
    var src = ac.createBufferSource(), bp = ac.createBiquadFilter(), gn = ac.createGain();
    src.buffer = buf; bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = 0.9; gn.gain.value = vol;
    src.connect(bp); bp.connect(gn); gn.connect(ac.destination); src.start();
  }
  function sfxClink() { tone(2350 + Math.random() * 300, 0.12, "sine", 0.05); tone(3600, 0.06, "sine", 0.02, 0.01); }
  function sfxFlip() { tone(170, 0.09, "triangle", 0.07); hiss(0.08, 1200, 0.12); }
  function sfxSlide(n) { hiss(0.16, 650 + 90 * n, 0.1 + 0.03 * n); }
  function sfxLift() { tone(520, 0.08, "triangle", 0.04, 0, 700); }
  function sfxGood() { tone(880, 0.16, "sine", 0.06); tone(1320, 0.26, "sine", 0.05, 0.08); }
  function sfxBad() { tone(150, 0.3, "square", 0.035, 0, 110); }
  function sfxClear() { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.32, "sine", 0.055, i * 0.09); }); }
  function sfxLost() { [392, 330, 262].forEach(function (f, i) { tone(f, 0.4, "triangle", 0.06, i * 0.16); }); }

  // ---- the run ---------------------------------------------------------------------------
  var best = window.GameShell ? GameShell.best("switcheroo_best", { higher: true }) : {
    get: function () { return Number(store.get("switcheroo_best", "0")) || 0; },
    submit: function (v) { if (v > this.get()) { store.set("switcheroo_best", String(v)); return true; } return false; }
  };
  var bestFound = window.GameShell ? GameShell.best("switcheroo_best_found", { higher: true }) : {
    get: function () { return Number(store.get("switcheroo_best_found", "0")) || 0; },
    submit: function (v) { if (v > this.get()) { store.set("switcheroo_best_found", String(v)); return true; } return false; }
  };
  var bestShort = window.GameShell ? GameShell.best("switcheroo_short_best", { higher: true }) : {
    get: function () { return Number(store.get("switcheroo_short_best", "0")) || 0; },
    submit: function (v) { if (v > this.get()) { store.set("switcheroo_short_best", String(v)); return true; } return false; }
  };
  // the way to play: "works" (every colour) or "short" (one among skulls),
  // the last one picked kept for next time (a setting, not a record)
  var MODES = ["works", "short"];
  var mode = store.get("switcheroo_mode", "works");
  if (MODES.indexOf(mode) < 0) mode = "works";
  function levelBest() { return mode === "short" ? bestShort : best; }   // the best level reached, this way to play
  var state = "menu";       // menu | play | over
  var phase = "";           // in play: deal | flip | hold | shuffle | settle | ask | show | clear | lost
  var level = 1, lives = 3, picks = 0, found = 0, startBest = 0, startFound = 0, overAt = 0, serial = 0;
  var S = spec(1), cups = [], order = [], steps = [], dealtWith = [], asks = [], askI = 0;
  var dealtAt = 0, flipAt = -1, fadeAt = -1, shakeAt = -1, sparks = [];

  // the game clock and its events
  var clock = 0, queue = [];
  function after(ms, fn) {
    var ev = { at: clock + ms, fn: fn }, i = queue.length;
    while (i > 0 && queue[i - 1].at > ev.at) i--;
    queue.splice(i, 0, ev);
  }
  function runQueue() {
    while (queue.length && queue[0].at <= clock) queue.shift().fn();
  }

  function startRun(at) {
    level = Math.max(1, Math.floor(at) || 1); lives = 3; picks = 0; found = 0;
    startBest = levelBest().get() || 0; startFound = bestFound.get() || 0;
    audio();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    state = "play";
    $("menu").hidden = true; $("over").hidden = true; $("hud").hidden = false;
    deal();
  }

  // a round: the tumblers set out mouth up, a marble into each (some left
  // empty; in Short Order a skull into every one but the colour's), a look,
  // then over they go and the switching starts
  function deal() {
    queue.length = 0; serial++;
    S = spec(level, mode);
    var short = mode === "short", n = S.cups, m = S.marbles, colours = shuffled([0, 1, 2, 3, 4, 5]).slice(0, m), where = shuffled(range(n)).slice(0, m);
    cups = []; order = [];
    for (var i = 0; i < n; i++) { cups.push({ m: short ? SKULL : -1, up: true, dropAt: -1, mv: null, lift: { from: 0, to: 0, at: -1e9 }, done: false, mark: null }); order.push(i); }
    where.forEach(function (slot, k) { cups[slot].m = colours[k]; });
    dealtWith = cups.map(function (c) { return c.m; });
    steps = plan(S);
    asks = shuffled(colours); askI = -1;
    dealtAt = clock; flipAt = -1; fadeAt = -1; shakeAt = -1; sparks = [];
    phase = "deal";
    layout(); hud(); keysLine();
    say("Watch the marbles go in");
    // the marbles go in left to right, one after another
    var k = 0, gap = short ? STAGGER_SHORT : STAGGER;
    for (var s = 0; s < n; s++) {
      var c = cups[order[s]];
      if (c.m < 0) continue;
      c.dropAt = clock + FADE_IN + k * gap;
      after(FADE_IN + k * gap + FALL * 0.9, sfxClink);
      k++;
    }
    after(FADE_IN + (k - 1) * gap + FALL + lookTime(m), turnOver);
  }
  function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }
  function turnOver() {
    phase = "flip"; flipAt = clock;
    if (mode === "short") say(["Keep your eye on ", asks[0], ""]); else say("Keep your eye on them");
    after(FLIP * 0.8, sfxFlip);
    after(FLIP, function () { cups.forEach(function (c) { c.up = false; }); phase = "hold"; });
    after(FLIP + HOLD, shuffle);
  }
  function shuffle() {
    phase = "shuffle";
    var t = 0;
    steps.forEach(function (st, i) { after(t, function () { startStep(i); }); t += st.dur + st.gap; });
    after(t - (steps.length ? steps[steps.length - 1].gap : 0) + SETTLE, function () { phase = "settle"; askNext(); });
  }
  function startStep(i) {
    var st = steps[i];
    st.pairs.forEach(function (p) {
      var ca = cups[order[p[0]]], cb = cups[order[p[1]]];
      ca.mv = { from: p[0], to: p[1], side: p[2], at: clock, dur: st.dur };
      cb.mv = { from: p[1], to: p[0], side: -p[2], at: clock, dur: st.dur };
    });
    sfxSlide(st.pairs.length);
    after(st.dur, function () {
      st.pairs.forEach(function (p) {
        var t = order[p[0]]; order[p[0]] = order[p[1]]; order[p[1]] = t;
        cups[order[p[0]]].mv = null; cups[order[p[1]]].mv = null;
      });
    });
  }

  // ---- the questions ----------------------------------------------------------------------------
  function askNext() {
    askI++;
    // (a colour already in sight, under a tumbler a wrong pick left up, isn't asked)
    while (askI < asks.length && cupWith(asks[askI]).done) askI++;
    if (askI >= asks.length) { roundClear(); return; }
    var open = cups.filter(function (c) { return !c.done; });
    // the last tumbler standing can only hold the last colour: it shows itself
    if (open.length === 1) {
      phase = "show";
      raise(open[0], 1); open[0].done = true;
      say(["And that leaves ", asks[askI], ""]);
      after(LIFT + 650, roundClear);
      return;
    }
    phase = "ask";
    say(["Where's ", asks[askI], "?"]);
    keysLine();
  }
  function cupWith(mi) { for (var i = 0; i < cups.length; i++) if (cups[i].m === mi) return cups[i]; return null; }
  function slotOf(c) { return order.indexOf(cups.indexOf(c)); }
  function raise(c, to) { var now = liftOf(c); c.lift = { from: now, to: to, at: clock }; if (to) sfxLift(); }
  function mark(c, kind) { c.mark = kind ? { kind: kind, at: clock } : null; }

  // a pick: the tumbler at a slot (0 from the left), only while a question waits
  function pick(slot) {
    if (state !== "play" || P.isPaused() || phase !== "ask") return false;
    if (!(slot >= 0 && slot < order.length)) return false;
    var cup = cups[order[slot]];
    if (cup.done) return false;
    var want = asks[askI];
    picks++;
    phase = "show";
    if (cup.m === want) {
      found++; cup.done = true;
      if (mode === "works") bestFound.submit(found);   // (the most found in a run: saved the moment it's passed)
      hud();
      raise(cup, 1); mark(cup, "good"); sparkle(slot);
      after(LIFT * 0.6, sfxGood);
      say("Found it!", "good");
      after(LIFT + 520, askNext);
    } else {
      lives--; hud();
      raise(cup, 1); mark(cup, "bad"); shakeAt = clock; cup.done = true;
      after(LIFT * 0.6, sfxBad);
      say(cup.m < 0 ? "Nothing under that one" : "That's " + (cup.m === SKULL ? "a " : "") + MARBLES[cup.m].name, "bad");
      // then the asked colour's tumbler lifts too, and both stay up for the
      // rest of the round (in Short Order, the round's one question: the same
      // level is dealt again, so only a find moves the run on)
      var right = cupWith(want);
      after(LIFT + 480, function () { raise(right, 1); right.done = true; say(["There's ", want, ""]); });
      after(LIFT * 2 + 480 + 700, function () { mark(cup, null); });
      after(LIFT * 3 + 480 + 900, lives <= 0 ? lose : mode === "short" ? dealAgain : askNext);
    }
    return true;
  }
  function roundClear() {
    phase = "clear";
    cups.forEach(function (c) { if (!c.done) { raise(c, 1); c.done = true; } });
    var reached = level + 1;
    // the best level reached is saved now, the moment it's reached
    if (reached > (levelBest().get() || 0)) levelBest().submit(reached);
    hud();
    say("Round clear! On to level " + reached, "good");
    after(LIFT * 0.5, sfxClear);
    fadeAt = clock + CLEAR_MS - 300;
    after(CLEAR_MS, function () { level = reached; deal(); });
  }
  // Short Order after a skull: the skulls left down show themselves, then
  // the same level is dealt again (a fresh deal and shuffle)
  function dealAgain() {
    phase = "show";
    cups.forEach(function (c) { if (!c.done) { raise(c, 1); c.done = true; } });
    say("Level " + level + " again");
    fadeAt = clock + AGAIN_MS - 300;
    after(AGAIN_MS, deal);
  }
  function lose() {
    phase = "lost";
    cups.forEach(function (c) { if (!c.done) { raise(c, 1); c.done = true; } });
    say("Out of lives", "bad");
    after(LIFT * 0.5, sfxLost);
    after(LOST_MS, finish);
  }
  function finish() {
    state = "over"; phase = ""; queue.length = 0;
    overAt = performance.now();
    var b = levelBest().get() || 0, isBest = level > startBest && level >= 2;
    $("over-title").textContent = "Out of lives";
    $("over-msg").textContent = "Level " + level;
    var line = document.createElement("span"), pill = document.createElement("span");
    var cleared = level - 1;
    // (in Short Order a round cleared is the one marble found: the rounds say it all)
    line.textContent = cleared + (cleared === 1 ? " round" : " rounds") + " cleared" + (mode === "short" ? " in Short Order" :
      " · " + found + (found === 1 ? " marble" : " marbles") + " found" + (found > startFound ? " (the most yet)" : ""));
    pill.className = "best" + (isBest ? " record" : "");
    pill.textContent = isBest ? "your best level yet" : b >= 2 ? "best: level " + b : "no round cleared yet";
    $("over-stats").replaceChildren(line, pill);
    $("over").hidden = false;
  }
  function toMenu() {
    state = "menu"; phase = ""; queue.length = 0;
    $("over").hidden = true; $("hud").hidden = true; $("menu").hidden = false;
    say("");
    $("keys").replaceChildren();
    paintMenu();
    menuScene();
  }
  // the menu: the way to play that's picked, and its bests
  function paintMenu() {
    var b = levelBest().get() || 0;
    var f = mode === "works" ? bestFound.get() || 0 : 0;
    $("tally").textContent = (b >= 2 ? "best: reached level " + b : "no round cleared yet") + (f ? " · most found: " + f : "");
    var btns = document.querySelectorAll("#pick-mode button");
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute("aria-pressed", String(btns[i].getAttribute("data-v") === mode));
  }
  function setMode(md) {
    if (MODES.indexOf(md) < 0 || state !== "menu") return false;
    mode = md; store.set("switcheroo_mode", md);
    paintMenu();
    return true;
  }

  // ---- the words round the counter ----------------------------------------------------------------
  // say("text", tone) or say(["before ", marble, " after"]): the colour as its own marble and name
  function say(what, tone) {
    var el = $("ask");
    el.className = "ask" + (tone ? " " + tone : "");
    if (typeof what === "string") { el.textContent = what; return; }
    var mb = MARBLES[what[1]], sw = document.createElement("span"), nm = document.createElement("span");
    sw.className = "swatch"; nm.className = "name"; nm.textContent = mb.name;
    [sw, nm].forEach(function (e) { e.style.setProperty("--col", mb.col); e.style.setProperty("--hi", mb.hi); e.style.setProperty("--lo", mb.lo); });
    el.replaceChildren(document.createTextNode(what[0]), sw, nm, document.createTextNode(what[2]));
  }
  function hud() {
    $("hud-level").textContent = level;
    $("hud-best").textContent = Math.max(levelBest().get() || 0, level);
    $("hud-found").textContent = found;
    var lv = $("hud-lives"), dots = lv.querySelectorAll("i");
    for (var i = 0; i < dots.length; i++) dots[i].classList.toggle("lost", i >= lives);
    lv.setAttribute("aria-label", lives + (lives === 1 ? " life" : " lives"));
  }
  function keysLine() {
    var n = S.cups, k = function (t) { var e = document.createElement("kbd"); e.className = "gs-kbd"; e.textContent = t; return e; };
    var keys = document.createElement("span"), touch = document.createElement("span");
    keys.className = "gs-keys"; touch.className = "gs-touch";
    keys.append(k("1"), " to ", k(String(n)), " or a click picks a tumbler");
    touch.textContent = "tap a tumbler to pick it";
    $("keys").replaceChildren(keys, touch);
  }

  // ---- the counter, drawn -----------------------------------------------------------------------
  var cv = $("stage"), g = cv.getContext("2d");
  var dpr = 1, VW = 300, VH = 200, OX = 0, slotW = 100, CW = 70, CH = 80, BASE = 150, DEPTH = 24, LIFTH = 70, MR = 16, KEYY = 190;
  function layout() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    var host = $("counter").getBoundingClientRect();
    VW = Math.max(200, host.width); VH = Math.max(150, host.height);
    cv.width = Math.round(VW * dpr); cv.height = Math.round(VH * dpr);
    cv.style.width = VW + "px"; cv.style.height = VH + "px";
    var n = cups.length || 3, pad = Math.max(12, VW * 0.04);
    slotW = Math.min((VW - 2 * pad) / n, 190);
    OX = (VW - slotW * n) / 2;
    // room above the row for a tumbler and its lift, below it for the front of a switch and the keys
    var touch = window.GameShell && GameShell.touchOnly && GameShell.touchOnly(), below = touch ? 14 : 40;
    // (on a narrow counter the tumblers take more of their slots: two switching pass one in front of the other)
    CH = Math.min(slotW * (slotW < 80 ? 0.84 : 0.74) * 1.12, 132, (VH - below - 26) / 2.24);
    CW = CH / 1.12; LIFTH = CH * 0.92; DEPTH = CH * 0.3; MR = CW * 0.23;
    var used = CH + LIFTH + DEPTH + below + 12;
    BASE = Math.round((VH - used) / 2 + 12 + LIFTH + CH);
    KEYY = BASE + DEPTH + 26;
  }
  function slotX(i) { return OX + (i + 0.5) * slotW; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function easeIO(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
  function easeBack(t) { var c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function liftOf(c) {
    var p = clamp01((clock - c.lift.at) / LIFT), e = c.lift.to > c.lift.from && fx() ? easeBack(p) : easeIO(p);
    return c.lift.from + (c.lift.to - c.lift.from) * e;
  }
  // where a tumbler is now: its slot, or partway round a switch (front or back)
  function cupPos(c, slot) {
    if (!c.mv) return { x: slotX(slot), y: BASE, s: 1, lean: 0, p: 0 };
    var p = clamp01((clock - c.mv.at) / c.mv.dur), e = easeSine(p), span = Math.abs(c.mv.to - c.mv.from);
    var arc = Math.sin(Math.PI * e) * DEPTH * (0.7 + 0.3 * Math.min(span, 3) / 3);
    // (with Visual FX on a tumbler leans into its travel)
    var lean = fx() ? Math.sin(Math.PI * e) * 0.1 * Math.sign(c.mv.to - c.mv.from) * Math.min(1, span / 2 + 0.5) : 0;
    return { x: slotX(c.mv.from) + (slotX(c.mv.to) - slotX(c.mv.from)) * e, y: BASE + c.mv.side * arc, s: 1 + c.mv.side * 0.07 * Math.sin(Math.PI * e), lean: lean, p: p };
  }

  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, VW, VH);
    if (!cups.length) return;
    var alpha = 1;
    if (state === "play" && phase === "deal") alpha = clamp01((clock - dealtAt) / FADE_IN);
    if (fadeAt >= 0 && clock > fadeAt) alpha = 1 - clamp01((clock - fadeAt) / 300);
    g.globalAlpha = alpha;
    // (with Visual FX on, a wrong pick jolts the counter)
    if (shakeAt >= 0 && fx() && clock - shakeAt < 280) { var k = 1 - (clock - shakeAt) / 280; g.translate(Math.sin((clock - shakeAt) * 0.09) * 5 * k, 0); }
    // the slots' keys along the front edge (none on a touch screen)
    if (window.GameShell && GameShell.drawKeys) {
      g.font = Math.round(Math.max(14, Math.min(19, CW * 0.26))) + "px Chewy, 'Comic Sans MS', sans-serif";
      g.textAlign = "center"; g.textBaseline = "alphabetic";
      g.fillStyle = "#2b2630";
      var on = state === "play" && phase === "ask";
      for (var s = 0; s < order.length; s++) {
        g.globalAlpha = alpha * (on && !cups[order[s]].done ? 1 : 0.4);
        GameShell.drawKeys(g, "[" + (s + 1) + "]", slotX(s), KEYY, { touch: "" });
      }
      g.globalAlpha = alpha;
    }
    // back to front: a tumbler going round the back is drawn first
    var list = order.map(function (ci, slot) { var c = cups[ci]; return { c: c, slot: slot, pos: cupPos(c, slot) }; });
    list.sort(function (a, b) { return a.pos.y - b.pos.y; });
    list.forEach(function (it) { drawShadow(it); });
    list.forEach(function (it) { drawMarbleUnder(it); });
    list.forEach(function (it) { drawCup(it); });
    list.forEach(function (it) { drawMark(it); });
    drawSparks();
    g.globalAlpha = 1;
  }
  function flipP() { return flipAt < 0 ? 0 : clamp01((clock - flipAt) / FLIP); }
  function drawShadow(it) {
    var c = it.c, L = liftOf(c), w = CW * it.pos.s;
    g.save();
    g.fillStyle = "rgba(43, 38, 48," + (0.24 * (1 - L * 0.6)).toFixed(3) + ")";
    g.beginPath(); g.ellipse(it.pos.x, it.pos.y + 2, w * (0.56 + L * 0.12), w * 0.13 * (1 + L * 0.2), 0, 0, 7); g.fill();
    g.restore();
  }
  // a marble on the counter, seen under a lifted tumbler
  function drawMarbleUnder(it) {
    var c = it.c;
    if (c.m < 0 || c.up) return;
    var L = liftOf(c);
    if (L < 0.04) return;
    drawMarble(it.pos.x, it.pos.y - MR * it.pos.s, MR * it.pos.s, MARBLES[c.m], true);
  }
  function drawMarble(x, y, r, mb, shadow) {
    g.save();
    if (shadow) { g.fillStyle = "rgba(43, 38, 48, 0.28)"; g.beginPath(); g.ellipse(x, y + r * 0.92, r * 0.9, r * 0.26, 0, 0, 7); g.fill(); }
    var gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r);
    gr.addColorStop(0, mb.hi); gr.addColorStop(0.42, mb.col); gr.addColorStop(1, mb.lo);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    if (mb.skull) drawSkull(x, y + r * 0.04, r);
    else {
      // the cat's-eye swirl inside the glass, and the window's glint on it
      g.save(); g.beginPath(); g.arc(x, y, r * 0.96, 0, 7); g.clip();
      g.strokeStyle = mb.hi; g.globalAlpha *= 0.5; g.lineWidth = r * 0.2; g.lineCap = "round";
      g.beginPath(); g.moveTo(x - r * 0.7, y + r * 0.4); g.bezierCurveTo(x - r * 0.2, y - r * 0.45, x + r * 0.2, y + r * 0.6, x + r * 0.7, y - r * 0.3); g.stroke();
      g.restore();
    }
    g.fillStyle = "rgba(255, 255, 255, 0.85)"; g.beginPath(); g.ellipse(x - r * 0.36, y - r * 0.44, r * 0.22, r * 0.13, -0.5, 0, 7); g.fill();
    g.strokeStyle = mb.lo; g.globalAlpha *= 0.55; g.lineWidth = 1; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke();
    g.restore();
  }
  // the skull set in a black marble: a bone-white crown and jaw, dark eyes and nose
  function drawSkull(x, y, r) {
    var bone = "#f1ead8", hole = "#120e16";
    g.save();
    g.fillStyle = bone;
    g.beginPath(); g.arc(x, y - r * 0.12, r * 0.46, Math.PI * 0.82, Math.PI * 2.18); g.fill();
    // the jaw, with its teeth
    var jw = r * 0.5, jt = y + r * 0.1, jb = y + r * 0.46;
    g.beginPath(); g.moveTo(x - jw / 2, jt); g.lineTo(x + jw / 2, jt); g.lineTo(x + jw / 2 - r * 0.04, jb); g.lineTo(x - jw / 2 + r * 0.04, jb); g.closePath(); g.fill();
    g.strokeStyle = hole; g.lineWidth = Math.max(0.8, r * 0.05); g.lineCap = "butt";
    g.beginPath();
    for (var i = -1; i <= 1; i++) { g.moveTo(x + i * jw / 4, jt + r * 0.13); g.lineTo(x + i * jw / 4, jb); }
    g.stroke();
    // the eyes and the nose
    g.fillStyle = hole;
    g.beginPath(); g.ellipse(x - r * 0.19, y - r * 0.1, r * 0.13, r * 0.15, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(x + r * 0.19, y - r * 0.1, r * 0.13, r * 0.15, 0, 0, 7); g.fill();
    g.beginPath(); g.moveTo(x, y + r * 0.04); g.lineTo(x - r * 0.06, y + r * 0.15); g.lineTo(x + r * 0.06, y + r * 0.15); g.closePath(); g.fill();
    g.restore();
  }
  // the tumbler's body: red pebbled plastic, wider at the mouth
  function bodyPath(w, h, up) {
    var tw = w * 0.76, r = w * 0.08, ry = w * 0.12;
    g.beginPath();
    if (!up) {
      // mouth down: the rim on the counter (y 0), the base at the top (y -h)
      g.moveTo(-w / 2, 0);
      g.lineTo(-tw / 2, -h + r); g.quadraticCurveTo(-tw / 2, -h, -tw / 2 + r, -h);
      g.lineTo(tw / 2 - r, -h); g.quadraticCurveTo(tw / 2, -h, tw / 2, -h + r);
      g.lineTo(w / 2, 0);
      g.ellipse(0, 0, w / 2, ry, 0, 0, Math.PI, false);
    } else {
      // mouth up: the base on the counter, the open mouth at the top
      g.moveTo(-w / 2, -h);
      g.lineTo(-tw / 2, -r); g.quadraticCurveTo(-tw / 2, 0, -tw / 2 + r, ry * 0.4);
      g.lineTo(tw / 2 - r, ry * 0.4); g.quadraticCurveTo(tw / 2, 0, tw / 2, -r);
      g.lineTo(w / 2, -h);
      g.ellipse(0, -h, w / 2, ry, 0, 0, Math.PI, true);
    }
    g.closePath();
  }
  function paintBody(w, h, up) {
    var gr = g.createLinearGradient(-w / 2, 0, w / 2, 0);
    gr.addColorStop(0, "#7c0d1c"); gr.addColorStop(0.16, "#b81c2d"); gr.addColorStop(0.34, "#ef4756");
    gr.addColorStop(0.5, "#d42536"); gr.addColorStop(0.82, "#a3172a"); gr.addColorStop(1, "#6e0b18");
    bodyPath(w, h, up); g.fillStyle = gr; g.fill();
    g.save(); bodyPath(w, h, up); g.clip();
    // the pebbling: rows of little raised bumps
    var rows = 6, cols = 7;
    for (var j = 0; j < rows; j++) {
      var yy = -h * (0.16 + 0.13 * j), off = j % 2 ? 0.5 : 0;
      for (var i = 0; i < cols; i++) {
        var xx = (i + off - cols / 2 + 0.5) * w * 0.15, rr = w * 0.026;
        g.fillStyle = "rgba(255, 210, 214, 0.2)"; g.beginPath(); g.arc(xx, yy, rr, 0, 7); g.fill();
        g.fillStyle = "rgba(60, 0, 10, 0.16)"; g.beginPath(); g.arc(xx + rr * 0.5, yy + rr * 0.6, rr, 0, 7); g.fill();
      }
    }
    // the band at the rim, and a long shine down one side
    g.fillStyle = "rgba(70, 0, 12, 0.18)";
    if (!up) g.fillRect(-w, -h * 0.13, 2 * w, h * 0.13 + w * 0.13); else g.fillRect(-w, -h - w * 0.13, 2 * w, h * 0.13 + w * 0.13);
    var sh = g.createLinearGradient(-w * 0.3, 0, -w * 0.12, 0);
    sh.addColorStop(0, "rgba(255,255,255,0)"); sh.addColorStop(0.5, "rgba(255,255,255,0.28)"); sh.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = sh; g.fillRect(-w * 0.3, -h, w * 0.18, h);
    g.restore();
    bodyPath(w, h, up); g.strokeStyle = "#5a0914"; g.lineWidth = 1.5; g.stroke();
  }
  function drawCup(it) {
    var c = it.c, x = it.pos.x, y = it.pos.y, s = it.pos.s, w = CW * s, h = CH * s;
    var L = liftOf(c), fp = c.up ? flipP() : 1;
    g.save();
    if (c.up && fp === 0) {
      // mouth up, a marble dropping in (or sitting in the mouth)
      g.translate(x, y);
      paintBody(w, h, true);
      var ry = w * 0.12;
      g.fillStyle = "#3e0610"; g.beginPath(); g.ellipse(0, -h, w / 2 * 0.9, ry * 0.85, 0, 0, 7); g.fill();
      if (c.m >= 0 && c.dropAt >= 0 && clock >= c.dropAt) {
        var p = clamp01((clock - c.dropAt) / FALL), rest = -h + MR * 0.2, top = -y - MR * 2;
        var my = top + (rest - top) * p * p;
        // (with Visual FX on it bounces once in the mouth)
        if (p >= 1 && fx()) { var q = clamp01((clock - c.dropAt - FALL) / 220); my = rest - Math.sin(Math.PI * q) * MR * 0.45; }
        g.save();
        g.beginPath(); g.rect(-w, -h - VH, 2 * w, VH); g.ellipse(0, -h, w / 2 * 0.9, ry * 0.85, 0, 0, 7); g.clip();
        drawMarble(0, my, MR, MARBLES[c.m], false);
        g.restore();
      }
      // the near lip of the mouth, over the marble
      g.strokeStyle = "#f05a67"; g.lineWidth = Math.max(2, w * 0.035);
      g.beginPath(); g.ellipse(0, -h, w / 2 * 0.95, ry * 0.92, 0, 0, Math.PI, false); g.stroke();
    } else if (c.up) {
      // turning over: up and over, with a hop
      var hop = Math.sin(Math.PI * fp) * h * 0.45, ang = Math.PI * (1 - easeIO(fp));
      g.translate(x, y - h / 2 - hop);
      g.rotate(ang);
      g.translate(0, h / 2);
      paintBody(w, h, false);
      if (Math.cos(ang) > 0) topOf(w, h);
    } else {
      // mouth down, perhaps lifted to show what's under it (tipped back a little as it goes up)
      g.translate(x, y - L * LIFTH);
      g.rotate(-0.09 * L + it.pos.lean);
      paintBody(w, h, false);
      topOf(w, h);
      if (L > 0.02) {
        // the dark inside of the mouth, seen as it lifts
        g.fillStyle = "rgba(62, 6, 16," + Math.min(0.9, L * 1.6).toFixed(3) + ")";
        g.beginPath(); g.ellipse(0, 0, w / 2 * 0.92, w * 0.1 * Math.min(1, L * 2), 0, 0, 7); g.fill();
      }
    }
    g.restore();
  }
  // the base of an upturned tumbler, seen from just above
  function topOf(w, h) {
    var tw = w * 0.76;
    g.fillStyle = "#e23a49"; g.beginPath(); g.ellipse(0, -h + w * 0.02, tw / 2 * 0.92, tw * 0.1, 0, 0, 7); g.fill();
    g.strokeStyle = "rgba(90, 9, 20, 0.6)"; g.lineWidth = 1; g.stroke();
  }
  // a found marble's tick, a wrong pick's cross
  function drawMark(it) {
    var c = it.c;
    if (!c.mark) return;
    var x = it.pos.x + MR * 1.25, y = it.pos.y - MR * 2.1, r = Math.max(9, CW * 0.14);
    var p = clamp01((clock - c.mark.at) / 220), sc = fx() ? 0.6 + 0.4 * easeBack(p) : 1;
    g.save();
    g.translate(x, y); g.scale(sc, sc);
    g.fillStyle = c.mark.kind === "bad" ? "#d3263a" : "#3d7a4c";
    g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
    g.strokeStyle = "#fff8e6"; g.lineWidth = Math.max(2.5, r * 0.28); g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath();
    if (c.mark.kind === "bad") { g.moveTo(-r * 0.4, -r * 0.4); g.lineTo(r * 0.4, r * 0.4); g.moveTo(r * 0.4, -r * 0.4); g.lineTo(-r * 0.4, r * 0.4); }
    else { g.moveTo(-r * 0.45, 0); g.lineTo(-r * 0.1, r * 0.38); g.lineTo(r * 0.48, -r * 0.36); }
    g.stroke();
    g.restore();
  }
  // (Visual FX on: a found marble throws off a few sparkles)
  function sparkle(slot) {
    if (!fx()) return;
    for (var i = 0; i < 7; i++) sparks.push({ x: slotX(slot), y: BASE - MR, a: (i / 7) * Math.PI * 2 + Math.random() * 0.5, at: clock });
  }
  function drawSparks() {
    sparks = sparks.filter(function (s) { return clock - s.at < 650; });
    sparks.forEach(function (s) {
      var p = (clock - s.at) / 650, d = MR * (1.2 + 2.4 * p), x = s.x + Math.cos(s.a) * d, y = s.y + Math.sin(s.a) * d * 0.7, r = MR * 0.32 * (1 - p);
      g.save(); g.globalAlpha *= 1 - p; g.fillStyle = "#fff4b0";
      g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r * 0.3, y - r * 0.3); g.lineTo(x + r, y); g.lineTo(x + r * 0.3, y + r * 0.3); g.lineTo(x, y + r); g.lineTo(x - r * 0.3, y + r * 0.3); g.lineTo(x - r, y); g.lineTo(x - r * 0.3, y - r * 0.3); g.closePath(); g.fill();
      g.restore();
    });
  }
  // behind the menu: three tumblers at rest, the middle one up off its marble
  function menuScene() {
    S = spec(1);
    cups = [0, 1, 2].map(function (i) { return { m: i === 1 ? 0 : -1, up: false, dropAt: -1, mv: null, lift: { from: i === 1 ? 1 : 0, to: i === 1 ? 1 : 0, at: -1e9 }, done: true, mark: null }; });
    order = [0, 1, 2]; flipAt = -1; fadeAt = -1; shakeAt = -1; sparks = [];
    layout();
  }

  // ---- the loop, pause and the way out ------------------------------------------------------
  var P = window.GameShell ? GameShell.pausable({
    canPause: function () { return state === "play"; },
    // (by P, by Esc's "Leave this game?", by the window losing focus or the
    // tab hiding: the counter is hidden while paused and the round's clock
    // stands still, so on resume it carries on from the frame it stopped at)
    onChange: function (paused) { document.body.classList.toggle("paused", paused); },
    restart: function () { startRun(1); },
    menu: toMenu
  }) : { isPaused: function () { return false; } };
  // a run is in progress once a pick has been made (and stays so through a re-deal)
  if (window.GameShell && GameShell.guardLeave) GameShell.guardLeave({
    active: function () { return state === "play" && (picks > 0 || level > 1); },
    pausable: P
  });
  var last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.max(0, Math.min(50, now - last)); last = now;
    if (P.isPaused()) return;
    if (state === "play") { clock += dt; runQueue(); }
    draw();
  }

  // ---- input --------------------------------------------------------------------------------------
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || state !== "play" || P.isPaused()) return;
    if (window.GameShell && GameShell.asking && GameShell.asking()) return;
    if (/^[1-9]$/.test(e.key) && Number(e.key) <= order.length) { e.preventDefault(); pick(Number(e.key) - 1); }
  });
  // a click or a tap on a tumbler (anywhere in its column of the counter)
  cv.addEventListener("pointerdown", function (e) {
    if (e.button !== 0 || state !== "play") return;
    var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    var slot = Math.floor((x - OX) / slotW);
    if (y < BASE - CH - LIFTH - 10 || y > KEYY + 14) return;
    pick(slot);
  });
  $("pick-mode").addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("button[data-v]");
    if (b) setMode(b.getAttribute("data-v"));
  });
  $("play").addEventListener("click", function () { startRun(1); });
  $("again").addEventListener("click", function () { startRun(1); });
  $("to-menu").addEventListener("click", toMenu);
  if (window.GameShell && GameShell.menuKeys) {
    // the menu: 1 The Works, 2 Short Order, Space or Enter deals
    GameShell.menuKeys({ active: function () { return state === "menu"; }, groups: [{ sel: "#pick-mode button", into: "b" }], start: "#play", space: true });
    // out of lives: Space or Enter again (not in its first moment), Backspace the menu
    GameShell.menuKeys({ active: function () { return state === "over" && performance.now() - overAt > OVER_WAIT; },
      groups: [{ sel: "#to-menu", keys: ["backspace"] }], start: "#again", space: true });
  }
  window.addEventListener("resize", function () { layout(); });
  // the counter's lettering is drawn too: lay out again once the face is in
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layout(); });
  toMenu();
  requestAnimationFrame(function (t) { last = t; requestAnimationFrame(loop); });

  // test hooks: the Playwright harness drives rounds through these
  window.Switcheroo = {
    state: function () { return state; },
    phase: function () { return phase; },
    level: function () { return level; },
    lives: function () { return lives; },
    picks: function () { return picks; },
    found: function () { return found; },
    serial: function () { return serial; },
    clock: function () { return clock; },
    best: function () { return levelBest().get() || 0; },
    mode: function () { return mode; },
    setMode: setMode,
    SKULL: SKULL,
    // a level of The Works, or of Short Order with md "short"
    spec: spec,
    plan: function (n, md) { return plan(spec(n, md)); },
    limits: { WATCH: WATCH, FLOOR: FLOOR, SLOT_MS: SLOT_MS },
    start: startRun,
    toMenu: toMenu,
    pick: pick,
    // the round as dealt (the marble in each slot, -1 empty, SKULL a skull), the switches to come, and now
    dealt: function () { return dealtWith.slice(); },
    steps: function () { return steps.map(function (s) { return { pairs: s.pairs.map(function (p) { return p.slice(); }), dur: s.dur, gap: s.gap }; }); },
    contents: function () { return order.map(function (ci) { return cups[ci].m; }); },
    asking: function () { return phase === "ask" ? asks[askI] : -1; },
    where: function (mi) { var c = cupWith(mi); return c ? slotOf(c) : -1; },
    colour: function (mi) { return MARBLES[mi].name; },
    // each tumbler as drawn: its slot, where it is, and whether it's mid-switch
    drawn: function () { return order.map(function (ci, slot) { var c = cups[ci], q = cupPos(c, slot); return { slot: slot, x: q.x, y: q.y, moving: !!c.mv, p: q.p, from: c.mv ? c.mv.from : slot, to: c.mv ? c.mv.to : slot, lift: liftOf(c), up: c.up }; }); },
    slotX: slotX,
    marbleR: function () { return MR; },
    // a round not yet switching, at once to its first question (every
    // switch applied, as the shuffle would have)
    skip: function () {
      if (state !== "play" || !(phase === "deal" || phase === "flip" || phase === "hold")) return false;
      queue.length = 0;
      steps.forEach(function (st) { st.pairs.forEach(function (p) { var t = order[p[0]]; order[p[0]] = order[p[1]]; order[p[1]] = t; }); });
      cups.forEach(function (c) { c.up = false; c.mv = null; });
      flipAt = clock - FLIP;
      phase = "settle"; askNext();
      return true;
    }
  };
})();
