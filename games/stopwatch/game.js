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

  // ---- state ----
  var state = "menu";       // menu | counting | result | gameover (ready handled inline)
  var ready = false;        // true between rounds, waiting for START
  var roundNum = 0, score = 0, cumError = 0, target = 0, lastTarget = 0;
  var startStamp = 0, busy = false, rafId = 0;
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
  // How the tray comes out: on the same 0.12s / 0.30s lines as the result
  // colours, pale then raw when early, dark then burnt when late.
  var BAKE = {
    perfect: "perfectly golden!", golden: "nicely golden",
    pale: "a little underbaked", raw: "still raw dough",
    dark: "a bit overdone", burnt: "burnt to a crisp",
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
  function updateModePill() { modePill.textContent = visibleMode ? "👁 Visible" : "🙈 Hidden"; }

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
      '<p>Each round a tray of cookies goes in the oven. Tap <b>START</b> to put it in, then <b>STOP</b> when you think the target time is up.</p>' +
      '<div class="modepick">' +
        '<button class="modebtn" data-mode="hidden">🙈 Hidden<small>oven light off — estimate it</small></button>' +
        '<button class="modebtn" data-mode="visible">👁 Visible<small>watch the clock and the cookies — react</small></button>' +
      '</div>' +
      '<ul class="rules">' +
        '<li>Each round gives a target from <b>1&ndash;10&nbsp;seconds</b>.</li>' +
        '<li>Your miss = |your time &minus; target|, to the millisecond. Early comes out pale, late comes out burnt.</li>' +
        '<li>Misses <b>add up</b>. When the total passes <b>1.000&nbsp;s</b>, it&rsquo;s game over.</li>' +
        '<li>+1 point for every clock you stop in time.</li>' +
      '</ul>' +
      '<button class="btn" id="btn-start">Start baking</button>';
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
    setHud(); renderBudget(); updateModePill(); elResult.textContent = "";
    ovCard.classList.remove("show");
    nextRound(); // no countdown — the player starts each round themselves
  }

  function nextRound() {
    roundNum++; target = pickTarget(); ready = true; busy = false; state = "ready";
    setHud();
    elResult.textContent = "";
    elBtn.disabled = false; elBtn.className = "btn-main"; elBtn.textContent = "START";
    elTargetLine.textContent = "stop the clock at";
    elTargetBig.innerHTML = target + '<small>s</small>';
    elSub.textContent = "tap START, then STOP when " + target + "s have passed";
    elStage.dataset.phase = "ready"; delete elStage.dataset.bake;
    elStage.style.setProperty("--t", target + "s"); // browning reaches golden right at the target
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
      elSub.textContent = "hit STOP right at " + fmt(target) + "s";
      rafId = requestAnimationFrame(tick);
    } else {
      elTargetLine.textContent = "counting… stop at";
      elTargetBig.innerHTML = target + '<small>s</small>';
      elSub.textContent = "the clock is hidden — trust your timing";
    }
    Sound.start();
  }
  // live clock readout (Visible mode only)
  function tick() {
    if (state !== "counting") { rafId = 0; return; }
    if (visibleMode) elTargetBig.innerHTML = fmt((performance.now() - startStamp) / 1000) + '<small>s</small>';
    rafId = requestAnimationFrame(tick);
  }

  function onStop() {
    if (state !== "counting") return;
    var elapsed = (performance.now() - startStamp) / 1000;
    if (elapsed < 0.2) return; // ignore an accidental double-tap (no target is below 1s)
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    state = "result"; busy = true;
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
      Sound.fail();
      setTimeout(function () { gameOver({ round: roundNum, target: target, elapsed: elapsed, error: error, projected: projected }); }, 950);
      return;
    }

    // survived → score it
    cumError = projected; score++;
    if (error < 0.05) Sound.perfect(); else Sound.good();
    setHud(); renderBudget();
    setTimeout(nextRound, 1350);
  }

  function gameOver(info) {
    state = "gameover"; busy = false; ready = false;
    var record = score > best;
    if (record) { best = score; saveBest(best); }
    setHud();
    cardInner.innerHTML =
      '<h2>Kitchen closed</h2>' +
      '<div class="big">' + score + '<small> pts</small></div>' +
      '<p>' + (record ? "🏆 new best!" : "best " + best) + '</p>' +
      '<div class="bust">' +
        'Round ' + info.round + ' · target <b>' + info.target + 's</b><br>' +
        'you stopped at <b>' + fmt(info.elapsed) + 's</b> — off by <b>' + fmt(info.error) + 's</b><br>' +
        'total would be ' + fmt(info.projected) + 's (over the 1.000s limit)' +
      '</div>' +
      '<button class="btn" id="btn-again">Bake again</button>' +
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
    if (e.code !== "Space" && e.code !== "Enter") return;
    e.preventDefault();
    if (e.repeat) return;
    // on the start / game-over overlays, Space/Enter activates the visible button
    if (ovCard.classList.contains("show")) { var b = cardInner.querySelector(".btn"); if (b) b.click(); return; }
    press();
  });

  // ---------------------------------------------------------- boot
  setHud(); renderBudget(); showStartCard();
})();
