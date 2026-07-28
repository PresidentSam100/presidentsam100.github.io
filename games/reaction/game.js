(function () {
  "use strict";

  var BEST_KEY = "reaction_best";   // lowest average reaction (ms) ever
  var TRIALS = 10;
  var MIN_WAIT = 1500, MAX_WAIT = 7000; // wide, randomized pre-flash delay (ms)
  var PENALTY = 10000;              // a false start scores this (ms) for the attempt

  var $ = function (id) { return document.getElementById(id); };
  var panel = $("panel"), pBig = $("panel-big"), pSub = $("panel-sub"), pRating = $("panel-rating");
  var elAttempt = $("attempt"), elLast = $("last"), elAvg = $("avg"), elBest = $("best");
  var elTimes = $("times"), ov = $("overlay"), card = $("card");

  // state: menu | wait | go | result | toosoon | done
  var state = "menu";
  var trial = 0, results = [], penal = [], flashAt = 0, timerId = 0;
  var best = parseFloat(load(BEST_KEY)) || 0;

  function load(k) { try { return localStorage.getItem(k) || "0"; } catch (e) { return "0"; } }
  function save(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }

  // ------------------------------------------------ particle field (Visual FX)
  // A gentle drift of glowing motes inside the panel during the "wait" and "go"
  // states — purely decorative. Honors the global "✨ Visual FX" toggle: while
  // FX is off (RM_ON), nothing is drawn, so the panel stays clean.
  var FX = (function () {
    var cv = document.createElement("canvas");
    cv.className = "panel-fx"; cv.setAttribute("aria-hidden", "true");
    panel.insertBefore(cv, panel.firstChild);
    var ctx = cv.getContext("2d");
    var W = 0, H = 0, DPR = 1, ps = [], raf = 0, on = false, color = "255,194,204", rate = 0.5, acc = 0, wasReduced = false;

    function reduced() { return !!(window.RM_ON && window.RM_ON()); }
    function size() {
      var r = panel.getBoundingClientRect();
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      cv.width = Math.max(1, Math.round(W * DPR)); cv.height = Math.max(1, Math.round(H * DPR));
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    function spawn() {
      ps.push({ x: Math.random() * W, y: H + 6, r: 1 + Math.random() * 2.4,
        vy: -(0.18 + Math.random() * 0.5), a: 0, sway: Math.random() * 6.28,
        ss: 0.012 + Math.random() * 0.02, amp: 0.15 + Math.random() * 0.4 });
    }
    // Pre-fill the whole box (random heights, already partly faded-in) so the
    // field looks continuous from the first frame instead of building up from the floor.
    function seed(n) {
      for (var i = 0; i < n; i++) {
        ps.push({ x: Math.random() * W, y: Math.random() * H, r: 1 + Math.random() * 2.4,
          vy: -(0.18 + Math.random() * 0.5), a: 0.2 + Math.random() * 0.4, sway: Math.random() * 6.28,
          ss: 0.012 + Math.random() * 0.02, amp: 0.15 + Math.random() * 0.4 });
      }
    }
    function frame() {
      if (!on) return;
      ctx.clearRect(0, 0, W, H);
      if (reduced()) { ps.length = 0; wasReduced = true; raf = requestAnimationFrame(frame); return; } // FX off -> draw nothing
      if (wasReduced) { wasReduced = false; size(); seed(42); } // FX flipped back on -> refill the box
      acc += rate;
      while (acc >= 1) { acc--; if (ps.length < 60) spawn(); }
      for (var i = ps.length - 1; i >= 0; i--) {
        var p = ps[i];
        p.sway += p.ss; p.x += Math.sin(p.sway) * p.amp; p.y += p.vy;
        p.a = Math.min(p.a + 0.02, 0.42); // fade in once, then hold — no fade-out
        if (p.y < -p.r) { ps.splice(i, 1); continue; } // only gone once it clears the top edge
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832);
        ctx.fillStyle = "rgba(" + color + "," + p.a.toFixed(3) + ")";
        ctx.shadowColor = "rgba(" + color + ",0.5)"; ctx.shadowBlur = 5;
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(frame);
    }
    return {
      // Start (or, if already running, just recolor) the field. The particles
      // persist across attempts so the effect is one continuous drift, not a
      // fresh build-up each round.
      start: function (c, r) {
        color = c; rate = r || 0.5;
        if (!on) { size(); if (!reduced()) seed(42); on = true; raf = requestAnimationFrame(frame); }
      },
      stop: function () {
        on = false; if (raf) { cancelAnimationFrame(raf); raf = 0; }
        if (W) ctx.clearRect(0, 0, W, H); ps.length = 0;
      },
      resize: function () { if (on) size(); }
    };
  })();
  window.addEventListener("resize", function () { FX.resize(); });

  // ------------------------------------------------ sound (no cue on the flash)
  var Sound = {
    ctx: null, muted: false, // muting is handled globally by the shared toggle (mute-toggle.js)
    load: function () { this.muted = false; },
    init: function () { if (this.ctx) return; try { var AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC(); } catch (e) { this.ctx = null; } },
    beep: function (f, dur, vol, type) {
      if (this.muted || !this.ctx) return;
      var t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.12));
      o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + (dur || 0.12) + 0.02);
    },
    tap: function () { this.beep(620, 0.07, 0.18, "triangle"); },
    early: function () { this.beep(180, 0.35, 0.3, "sawtooth"); },
    done: function () { var s = this; [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { s.beep(f, 0.16, 0.2, "triangle"); }, i * 110); }); },
  };
  Sound.load();

  // ------------------------------------------------ helpers
  var f1 = function (x) { return (Math.round(x * 10) / 10).toFixed(1); }; // reaction times → 1 decimal
  function avg(arr) { if (!arr.length) return 0; var s = 0; for (var i = 0; i < arr.length; i++) s += arr[i]; return Math.round(s / arr.length * 10) / 10; }
  function rate(ms) {
    if (ms < 180) return { t: "⚡ lightning", c: "var(--good)" };
    if (ms < 230) return { t: "very fast", c: "var(--good)" };
    if (ms < 280) return { t: "fast", c: "var(--good)" };
    if (ms < 340) return { t: "average", c: "var(--warn)" };
    if (ms < 450) return { t: "a bit slow", c: "var(--warn)" };
    return { t: "slow", c: "var(--bad)" };
  }
  function renderHud() {
    elAttempt.textContent = state === "menu" ? "—" : Math.min(trial, TRIALS) + "/" + TRIALS;
    elLast.textContent = results.length ? f1(results[results.length - 1]) + " ms" : "—";
    elAvg.textContent = results.length ? f1(avg(results)) + " ms" : "—";
    elBest.textContent = best ? f1(best) + " ms" : "—";
  }
  function renderTimes() {
    var html = "";
    for (var i = 0; i < TRIALS; i++) {
      if (i < results.length) html += penal[i] ? '<span class="chip pen">✗</span>' : '<span class="chip">' + f1(results[i]) + '</span>';
      else if (i === results.length && state !== "menu" && state !== "done") html += '<span class="chip cur">' + (i + 1) + '</span>';
      else html += '<span class="chip">·</span>';
    }
    elTimes.innerHTML = html;
  }

  // ------------------------------------------------ flow
  function showStart() {
    state = "menu"; trial = 0; results = []; penal = []; FX.stop();
    panel.className = "panel idle"; pBig.className = "big"; pBig.textContent = "⚡ Reaction"; pSub.textContent = "press start to begin"; pRating.textContent = "";
    renderHud(); renderTimes();
    card.innerHTML =
      '<h2>⚡ Reaction</h2>' +
      '<p>Wait for the screen to flash <b style="color:var(--good)">green</b>, then tap as fast as you can.</p>' +
      '<ul class="rules">' +
        '<li><b>' + TRIALS + ' attempts.</b> The wait before each flash is random so you can&rsquo;t time it.</li>' +
        '<li>Your score is the <b>average</b> reaction across all ' + TRIALS + ' — lower is better.</li>' +
        '<li>Jump <b>early</b> and you get an <b>✗</b> — that attempt is scored as a <b>' + (PENALTY / 1000).toFixed(1) + 's</b> penalty, so don&rsquo;t guess!</li>' +
      '</ul>' +
      '<button class="btn" id="btn-start">Start</button>';
    ov.classList.add("show");
    $("btn-start").addEventListener("click", begin);
  }

  function begin() { Sound.init(); trial = 0; results = []; penal = []; ov.classList.remove("show"); nextAttempt(); }

  function nextAttempt() {
    trial++;
    if (trial > TRIALS) { finish(); return; }
    renderHud(); renderTimes();
    arm();
  }

  // red "wait" screen, then flash green after a random delay
  function arm() {
    state = "wait";
    panel.className = "panel wait"; pBig.className = "big"; pBig.textContent = "Wait for it…"; pSub.textContent = "attempt " + trial + " of " + TRIALS; pRating.textContent = "";
    FX.start("255,194,204", 0.5); // warm motes drifting up during the wait
    var delay = MIN_WAIT + Math.random() * (MAX_WAIT - MIN_WAIT);
    timerId = setTimeout(flash, delay);
  }
  function flash() {
    state = "go"; flashAt = performance.now();
    panel.className = "panel go"; pBig.className = "big"; pBig.textContent = "TAP!"; pSub.textContent = ""; pRating.textContent = "";
    FX.start("236,255,245", 1.1); // bright sparkles burst over the green "TAP!" flash
  }

  // false start: the attempt is burned and scored as a fixed penalty time
  function tooSoon() {
    clearTimeout(timerId); FX.start("255,194,204", 0.5); // keep the field running between attempts
    results.push(PENALTY); penal.push(true); Sound.early();
    renderHud(); renderTimes();
    if (results.length >= TRIALS) { finish(); return; }
    state = "toosoon";
    panel.className = "panel toosoon"; pBig.className = "big"; pBig.textContent = "✗ Too soon!";
    pSub.textContent = "jumped early — scored " + (PENALTY / 1000).toFixed(1) + "s · tap to continue";
    pRating.style.color = "var(--bad)"; pRating.textContent = "penalty";
  }

  function record() {
    FX.start("255,194,204", 0.5); // calm the field back down between attempts (keeps it running)
    var ms = Math.round((performance.now() - flashAt) * 10) / 10;
    results.push(ms); penal.push(false); Sound.tap();
    var r = rate(ms);
    renderHud(); renderTimes();
    if (results.length >= TRIALS) { finish(); return; }
    state = "result";
    panel.className = "panel result"; pBig.className = "big ms"; pBig.innerHTML = f1(ms) + '<small> ms</small>'; pSub.textContent = "tap to continue"; pRating.style.color = r.c; pRating.textContent = r.t;
  }

  function finish() {
    state = "done"; FX.stop();
    var a = avg(results);
    var valid = results.filter(function (x, i) { return !penal[i]; });
    var bestSingle = valid.length ? Math.min.apply(null, valid) : null;
    var fouls = penal.filter(Boolean).length;
    var record = (best === 0 || a < best);
    if (record) { best = a; save(BEST_KEY, best); }
    renderHud();
    var r = rate(a);
    var chips = results.map(function (x, i) { return penal[i] ? '<span class="chip pen">✗</span>' : '<span class="chip">' + f1(x) + '</span>'; }).join("");
    panel.className = "panel idle"; pBig.className = "big"; pBig.textContent = "Done!"; pSub.textContent = ""; pRating.textContent = "";
    card.innerHTML =
      '<h2>Results</h2>' +
      '<div class="big" style="color:' + r.c + '">' + f1(a) + '<small> ms avg</small></div>' +
      '<p style="color:' + r.c + ';font-weight:800;margin-top:0;">' + r.t + (fouls ? ' · ' + fouls + ' false start' + (fouls === 1 ? '' : 's') : '') + '</p>' +
      '<p>' + (record ? "🏆 new best average!" : "best avg " + f1(best) + " ms") + ' &nbsp;·&nbsp; fastest tap ' + (bestSingle === null ? "—" : f1(bestSingle) + " ms") + '</p>' +
      '<div class="summary">' + chips + '</div>' +
      '<button class="btn" id="btn-again" style="margin-top:0.6rem;">Play again</button>';
    ov.classList.add("show");
    Sound.done();
    $("btn-again").addEventListener("click", begin);
  }

  // ------------------------------------------------ input
  function press() {
    if (state === "wait") tooSoon();
    else if (state === "go") record();
    else if (state === "result") nextAttempt();
    else if (state === "toosoon") nextAttempt(); // penalty already recorded — move on
  }
  panel.addEventListener("pointerdown", function (e) { e.preventDefault(); press(); });
  document.addEventListener("keydown", function (e) {
    if (e.code !== "Space" && e.code !== "Enter") return;
    e.preventDefault();
    if (e.repeat) return;
    if (ov.classList.contains("show")) { var b = card.querySelector(".btn"); if (b) b.click(); return; }
    press();
  });

  // ------------------------------------------------ boot
  renderHud(); renderTimes(); showStart();
})();
