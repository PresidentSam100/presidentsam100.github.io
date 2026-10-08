(function () {
  "use strict";

  var BEST_KEY = "stopwatch_best";
  var LIMIT = 1.0;          // total error budget (seconds)
  var MIN_TARGET = 1, MAX_TARGET = 10;
  var EPS = 1e-9;

  // ---- elements ----
  var $ = function (id) { return document.getElementById(id); };
  var elScore = $("score"), elRound = $("round"), elBest = $("best");
  var elUsed = $("used"), elMargin = $("margin"), elFill = $("meter-fill");
  var elTargetLine = $("target-line"), elTargetBig = $("target-big"), elSub = $("sub");
  var elBtn = $("btn"), elResult = $("result");
  var ovCard = $("overlay-card"), cardInner = $("card-inner");
  var modePill = $("mode-pill");
  var elStage = document.querySelector(".stage");

  // ---- the watch itself: a 10-second regulator dial and the hinged lid ----
  var elHand, elWedge;
  (function buildWatch() {
    var i, a, s = "";
    s += '<svg class="dial" viewBox="0 0 200 200" aria-hidden="true"><defs>' +
      '<radialGradient id="sw-en" cx="0.42" cy="0.36" r="0.95">' +
      '<stop offset="0" stop-color="#fffdf6"/><stop offset="0.75" stop-color="#f4efe0"/>' +
      '<stop offset="1" stop-color="#e0d8c0"/></radialGradient>' +
      '<linearGradient id="sw-steel" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#3d5aa8"/><stop offset="1" stop-color="#1d2c56"/></linearGradient>' +
      "</defs>" +
      '<circle cx="100" cy="100" r="96" fill="url(#sw-en)"/>';
    // the seconds track: 0.2s minors, whole-second majors
    for (i = 0; i < 50; i++) {
      a = (i / 50) * Math.PI * 2;
      var major = i % 5 === 0;
      var r1 = major ? 82 : 87;
      s += '<line x1="' + (100 + Math.sin(a) * r1).toFixed(1) + '" y1="' + (100 - Math.cos(a) * r1).toFixed(1) +
        '" x2="' + (100 + Math.sin(a) * 93).toFixed(1) + '" y2="' + (100 - Math.cos(a) * 93).toFixed(1) +
        '" stroke="#2a2a33" stroke-width="' + (major ? 2.4 : 1) + '"/>';
    }
    // numerals 1..10 around the rim (10 sits at the top: the full sweep)
    s += '<g fill="#22222b" font-family="Georgia, serif" font-size="17" text-anchor="middle">';
    for (i = 1; i <= 10; i++) {
      a = (i / 10) * Math.PI * 2;
      s += '<text x="' + (100 + Math.sin(a) * 68).toFixed(1) + '" y="' + (100 - Math.cos(a) * 68 + 6).toFixed(1) + '">' + i + "</text>";
    }
    s += "</g>";
    s += '<text x="100" y="58" fill="#6b6a5d" font-family="Georgia, serif" font-size="8" text-anchor="middle" letter-spacing="1.5">S.&#8202;LU &amp; CO.</text>' +
      '<text x="100" y="150" fill="#8a897b" font-family="Georgia, serif" font-size="6.5" text-anchor="middle" letter-spacing="2">REGULATOR</text>';
    // the gold target wedge (rotated to the round's second)
    s += '<g class="wedge" id="sw-wedge"><path d="M93 8 L107 8 L103 26 L97 26 Z" fill="#d9a52e" stroke="#8a6a30" stroke-width="1"/>' +
      '<line x1="100" y1="8" x2="100" y2="30" stroke="#8a6a30" stroke-width="1"/></g>';
    // the blued-steel sweep hand
    s += '<g class="hand" id="sw-hand">' +
      '<line x1="100" y1="124" x2="100" y2="16" stroke="url(#sw-steel)" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M97 30 L100 14 L103 30 Z" fill="url(#sw-steel)"/>' +
      '<circle cx="100" cy="124" r="5" fill="url(#sw-steel)"/></g>' +
      '<circle cx="100" cy="100" r="4.5" fill="#c2a15c" stroke="#5d4620" stroke-width="1"/>';
    // glass glare
    s += '<path d="M46 62 A 62 62 0 0 1 118 38" fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round" opacity="0.2"/>';
    s += "</svg>";

    // the engine-turned lid, hinged on the left
    function lidFace() {
      var t = '<svg viewBox="0 0 200 200" aria-hidden="true">' +
        '<defs><radialGradient id="sw-brass" cx="0.35" cy="0.3" r="1">' +
        '<stop offset="0" stop-color="#e8cf96"/><stop offset="0.55" stop-color="#c2a15c"/>' +
        '<stop offset="0.85" stop-color="#8f6f35"/><stop offset="1" stop-color="#6e5426"/></radialGradient></defs>' +
        '<circle cx="100" cy="100" r="99" fill="url(#sw-brass)"/>' +
        '<circle cx="100" cy="100" r="93" fill="none" stroke="#7a5e2c" stroke-width="1.6"/>' +
        '<circle cx="100" cy="100" r="97" fill="none" stroke="#f0dfae" stroke-width="1.2" opacity="0.8"/>';
      for (var k = 0; k < 40; k++) {
        var ka = (k / 40) * Math.PI * 2;
        t += '<line x1="' + (100 + Math.sin(ka) * 26).toFixed(1) + '" y1="' + (100 - Math.cos(ka) * 26).toFixed(1) +
          '" x2="' + (100 + Math.sin(ka) * 90).toFixed(1) + '" y2="' + (100 - Math.cos(ka) * 90).toFixed(1) +
          '" stroke="#7a5e2c" stroke-width="1" opacity="0.5"/>';
      }
      for (var r2 = 34; r2 <= 82; r2 += 12) {
        t += '<circle cx="100" cy="100" r="' + r2 + '" fill="none" stroke="#8a6a30" stroke-width="0.9" opacity="0.5"/>';
      }
      t += '<ellipse cx="100" cy="100" rx="25" ry="19" fill="#d9ba79" stroke="#7a5e2c" stroke-width="1.6"/>' +
        '<ellipse cx="100" cy="100" rx="20" ry="14.5" fill="none" stroke="#8a6a30" stroke-width="0.9" opacity="0.7"/>' +
        "</svg>";
      return t;
    }
    function lidBack() {
      return '<svg viewBox="0 0 200 200" aria-hidden="true">' +
        '<circle cx="100" cy="100" r="99" fill="#e3c88a"/>' +
        '<circle cx="100" cy="100" r="88" fill="none" stroke="#b28e4e" stroke-width="1.4" opacity="0.7"/>' +
        '<path d="M52 58 A 60 60 0 0 1 128 38" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity="0.4"/></svg>';
    }
    $("case").innerHTML = s +
      '<div class="lid"><span class="face">' + lidFace() + '</span><span class="back">' + lidBack() + "</span></div>";
    elHand = $("sw-hand"); elWedge = $("sw-wedge");
  })();
  function setHand(sec) { elHand.setAttribute("transform", "rotate(" + (sec * 36) + " 100 100)"); }
  function setWedge(sec) { elWedge.setAttribute("transform", "rotate(" + (sec * 36) + " 100 100)"); }

  // ---- state ----
  var state = "menu";       // menu | counting | result | gameover (ready handled inline)
  var ready = false;        // true between rounds, waiting for START
  var roundNum = 0, score = 0, cumError = 0, target = 0, lastTarget = 0;
  var startStamp = 0, busy = false, rafId = 0;
  var runBest = 0;          // the best as the run began (the stored one climbs mid-run)
  var busted = false;       // the last sweep blew the budget: the run's over, its end card on the way
  var visibleMode = false;  // false = clock hidden (estimate); true = clock shown (react)
  try { visibleMode = localStorage.getItem("stopwatch_mode") === "visible"; } catch (e) {}
  var best = parseInt(loadBest(), 10) || 0;

  function loadBest() { try { return localStorage.getItem(BEST_KEY) || "0"; } catch (e) { return "0"; } }
  function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) {} }

  // ---------------------------------------------------------- sound
  var Sound = {
    ctx: null, muted: false, // muting is handled globally by the shared toggle (mute-toggle.js)
    load: function () { this.muted = false; },
    init: function () { if (this.ctx) return; try { var AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC(); } catch (e) { this.ctx = null; } },
    beep: function (freq, dur, vol, type) {
      if (this.muted || !this.ctx) return;
      var t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.25, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.12));
      o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + (dur || 0.12) + 0.02);
    },
    start: function () { this.beep(520, 0.08, 0.2, "sine"); },
    stop: function () { this.beep(300, 0.09, 0.22, "square"); },
    good: function () { this.beep(740, 0.1, 0.22, "triangle"); var s = this; setTimeout(function () { s.beep(1110, 0.12, 0.2, "triangle"); }, 90); },
    perfect: function () { var s = this; [740, 990, 1480].forEach(function (f, i) { setTimeout(function () { s.beep(f, 0.12, 0.2, "triangle"); }, i * 80); }); },
    fail: function () { this.beep(200, 0.4, 0.3, "sawtooth"); this.beep(120, 0.45, 0.18, "square"); },
  };
  Sound.load();

  // ---------------------------------------------------------- helpers
  function fmt(n, d) { return Number(n).toFixed(d === undefined ? 3 : d); }
  function pickTarget() {
    var t;
    do { t = MIN_TARGET + Math.floor(Math.random() * (MAX_TARGET - MIN_TARGET + 1)); }
    while (t === lastTarget); // avoid an immediate repeat
    lastTarget = t; return t;
  }
  // The watchmaker's verdict: on the same 0.12s / 0.30s lines as the
  // result colours; short when early, long when late.
  var BAKE = {
    perfect: "regulated to perfection!", golden: "chronometer grade",
    pale: "running a touch short", raw: "wildly short — full service",
    dark: "running a touch long", burnt: "wildly long — full service",
  };
  function doneness(error, late) {
    if (error < 0.05) return "perfect";
    if (error < 0.12) return "golden";
    if (error < 0.30) return late ? "dark" : "pale";
    return late ? "burnt" : "raw";
  }

  function renderBudget() {
    var pctv = Math.min(100, (cumError / LIMIT) * 100);
    elFill.style.width = pctv + "%";
    elUsed.textContent = fmt(cumError);
    elMargin.textContent = fmt(Math.max(0, LIMIT - cumError)) + " s";
  }
  function setHud() { elScore.textContent = score; elBest.textContent = best; elRound.textContent = roundNum || "—"; }
  function updateModePill() { modePill.textContent = visibleMode ? "👁 Lid open" : "🙈 Lid shut"; }

  // ---------------------------------------------------------- flow
  function showStartCard() {
    state = "menu"; ready = false; busy = false;
    elStage.dataset.phase = "idle"; delete elStage.dataset.bake;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    elBtn.disabled = true; elBtn.className = "btn-main"; elBtn.textContent = "START";
    elResult.textContent = ""; elTargetBig.textContent = "—"; elTargetLine.textContent = "get ready…"; elSub.textContent = "press start to begin";
    updateModePill();
    cardInner.innerHTML =
      '<h2>Stopwatch</h2>' +
      '<p>A hunter pocket watch, fresh off the bench. Tap <b>START</b> to set the sweep hand going, then <b>STOP</b> it dead on the gold mark.</p>' +
      '<div class="modepick">' +
        '<button class="modebtn" data-mode="hidden">🙈 Lid shut<small>the lid snaps over the dial — count it blind</small></button>' +
        '<button class="modebtn" data-mode="visible">👁 Lid open<small>watch the sweep hand — react</small></button>' +
      '</div>' +
      '<ul class="rules">' +
        '<li>Each round marks a second from <b>1&ndash;10</b> on the dial.</li>' +
        '<li>Your miss = |your time &minus; target|, to the millisecond. Early runs short, late runs long.</li>' +
        '<li>Misses <b>add up</b> on the service card. Past <b>1.000&nbsp;s</b> of drift, the watch goes back in the drawer.</li>' +
        '<li>+1 point for every sweep you stop in tolerance.</li>' +
      '</ul>' +
      '<button class="btn" id="btn-start">Open the case</button>';
    ovCard.classList.add("show");
    var btns = cardInner.querySelectorAll(".modebtn");
    function syncSel() { for (var i = 0; i < btns.length; i++) { var m = btns[i].getAttribute("data-mode") === "visible"; btns[i].classList.toggle("sel", m === visibleMode); } }
    for (var i = 0; i < btns.length; i++) btns[i].addEventListener("click", function () {
      visibleMode = this.getAttribute("data-mode") === "visible";
      try { localStorage.setItem("stopwatch_mode", visibleMode ? "visible" : "hidden"); } catch (e) {}
      syncSel(); updateModePill();
    });
    syncSel();
    $("btn-start").addEventListener("click", beginGame);
  }

  function beginGame() {
    Sound.init();
    score = 0; cumError = 0; roundNum = 0; lastTarget = 0;
    runBest = best; busted = false;
    setHud(); renderBudget(); updateModePill(); elResult.textContent = "";
    ovCard.classList.remove("show");
    nextRound(); // no countdown — the player starts each round themselves
  }

  function nextRound() {
    roundNum++; target = pickTarget(); ready = true; busy = false; state = "ready";
    setHud();
    elResult.textContent = "";
    elBtn.disabled = false; elBtn.className = "btn-main"; elBtn.textContent = "START";
    elTargetLine.textContent = "stop the sweep at";
    elTargetBig.innerHTML = target + '<small>s</small>';
    elSub.textContent = "tap START, then STOP when the hand reaches the gold mark";
    elStage.dataset.phase = "ready"; delete elStage.dataset.bake;
    setWedge(target); setHand(0);
  }

  function onStart() {
    if (!ready || busy) return;
    ready = false; state = "counting";
    startStamp = performance.now();
    elBtn.className = "btn-main stop counting"; elBtn.textContent = "STOP";
    elStage.dataset.mode = visibleMode ? "visible" : "hidden";
    // with Visual FX off the browning would jump straight to golden: a false
    // cue, so it simply doesn't run
    elStage.dataset.anim = (window.RM_ON && window.RM_ON()) ? "off" : "on";
    elStage.dataset.phase = "baking";
    if (visibleMode) {
      elTargetLine.textContent = "stop at " + target + "s";
      elTargetBig.innerHTML = '0.000<small>s</small>';
      elSub.textContent = "hit STOP right on the gold mark";
      rafId = requestAnimationFrame(tick);
    } else {
      elTargetLine.textContent = "counting… stop at";
      elTargetBig.innerHTML = target + '<small>s</small>';
      elSub.textContent = "the lid is shut — trust your timing";
    }
    Sound.start();
  }
  // live clock readout (Visible mode only)
  function tick() {
    if (state !== "counting") { rafId = 0; return; }
    if (visibleMode) {
      var el = (performance.now() - startStamp) / 1000;
      elTargetBig.innerHTML = fmt(el) + '<small>s</small>';
      setHand(el);
    }
    rafId = requestAnimationFrame(tick);
  }

  function onStop() {
    if (state !== "counting") return;
    var elapsed = (performance.now() - startStamp) / 1000;
    if (elapsed < 0.2) return; // ignore an accidental double-tap (no target is below 1s)
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    state = "result"; busy = true;
    setHand(elapsed);
    elBtn.className = "btn-main"; elBtn.disabled = true; elBtn.textContent = "—";
    elTargetLine.textContent = "target was"; elTargetBig.innerHTML = target + '<small>s</small>';
    Sound.stop();

    var error = Math.abs(elapsed - target);
    var projected = cumError + error;
    var bust = projected > LIMIT + EPS;

    // result readout
    var col = error < 0.12 ? "var(--good)" : error < 0.30 ? "var(--warn)" : "var(--bad)";
    var late = elapsed >= target;
    elResult.innerHTML =
      '<div class="you">' + fmt(elapsed) + '<small style="font-size:1rem;color:var(--muted);">s</small></div>' +
      '<div class="delta" style="color:' + col + '">' + (late ? "over" : "under") + ' by ' + fmt(error) + 's &middot; ' + BAKE[doneness(error, late)] + '</div>';
    elStage.dataset.phase = "done"; elStage.dataset.bake = doneness(error, late);

    if (bust) {
      busted = true;
      Sound.fail();
      setTimeout(function () { gameOver({ round: roundNum, target: target, elapsed: elapsed, error: error, projected: projected }); }, 950);
      return;
    }

    // survived → score it
    cumError = projected; score++;
    // a sweep that takes the run past the best is saved at once
    if (score > best) { best = score; saveBest(best); }
    if (error < 0.05) Sound.perfect(); else Sound.good();
    setHud(); renderBudget();
    setTimeout(nextRound, 1350);
  }

  function gameOver(info) {
    state = "gameover"; busy = false; ready = false;
    var record = score > runBest;
    if (score > best) { best = score; saveBest(best); }
    setHud();
    cardInner.innerHTML =
      '<h2>Back in the drawer</h2>' +
      '<div class="big">' + score + '<small> pts</small></div>' +
      '<p>' + (record ? "🏆 new best!" : "best " + best) + '</p>' +
      '<div class="bust">' +
        'Round ' + info.round + ' · mark at <b>' + info.target + 's</b><br>' +
        'you stopped the hand at <b>' + fmt(info.elapsed) + 's</b> — off by <b>' + fmt(info.error) + 's</b><br>' +
        'drift would be ' + fmt(info.projected) + 's (past the 1.000s tolerance)' +
      '</div>' +
      '<button class="btn" id="btn-again">Wind it again</button>' +
      '<div style="margin-top:0.7rem;"><button class="btn ghost" id="btn-mode">change mode</button></div>';
    ovCard.classList.add("show");
    $("btn-again").addEventListener("click", beginGame);
    $("btn-mode").addEventListener("click", showStartCard);
  }

  // ---------------------------------------------------------- input
  function press() {
    if (state === "counting") onStop();
    else onStart(); // onStart no-ops unless we're in the ready state
  }
  // Use pointerdown (fires the instant of press) for accurate timing, and the
  // whole stage is a hit target so mobile taps are forgiving. The big button
  // lives inside .stage, so its presses bubble here too.
  var stageEl = document.querySelector(".stage");
  stageEl.addEventListener("pointerdown", function (e) {
    if (state === "counting" || state === "ready") { e.preventDefault(); press(); }
  });
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;   // browser shortcuts (Ctrl+P, Ctrl+S, Alt+←…) aren't game keys
    if (e.code !== "Space" && e.code !== "Enter") return;
    e.preventDefault();
    if (e.repeat) return;
    // on the start / game-over overlays, Space/Enter activates the visible button
    if (ovCard.classList.contains("show")) { var b = cardInner.querySelector(".btn"); if (b) b.click(); return; }
    press();
  });

  // Leaving asks first while a run is under way: from the first sweep set
  // going (round 1 still waiting on START has nothing to lose) until a bust
  // ends it. No pause: the sweep runs on under the question.
  if (window.GameShell) GameShell.guardLeave(function () {
    return !busted && (state === "counting" || state === "result" || (state === "ready" && roundNum > 1));
  });

  // ---------------------------------------------------------- boot
  setHud(); renderBudget(); showStartCard();
})();
