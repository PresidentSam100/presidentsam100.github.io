(function () {
  "use strict";

  var BEST_KEY = "reaction_best";   // lowest average reaction (ms) ever
  var TRIALS = 10;
  var PENALTY = 10000;              // a false start scores this (ms) for the attempt
  var LAST_SHOT_MS = 900;           // let the final shot play before the results poster
  var WINDOW_MS = 1000;             // no shot this long after DRAW! and he fires first
  var LATE_GRACE_MS = 350;          // a tap just after the window mustn't skip the "too slow" screen

  var $ = function (id) { return document.getElementById(id); };
  var panel = $("panel"), pBig = $("panel-big"), pSub = $("panel-sub"), pRating = $("panel-rating");
  var elAttempt = $("attempt"), elLast = $("last"), elAvg = $("avg"), elBest = $("best");
  var elTimes = $("times"), ov = $("overlay"), card = $("card");

  // state: menu | wait | go | result | toosoon | late | ending | done
  var state = "menu";
  var trial = 0, results = [], penal = [], late = [], flashAt = 0, timerId = 0, windowId = 0, lateAt = 0;
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
    // a gunshot: a burst of noise with a falling low-pass. Played on the
    // tap (after the time is taken), never on the DRAW! call itself.
    bang: function () {
      if (this.muted || !this.ctx) return;
      var c = this.ctx, t = c.currentTime, len = Math.floor(c.sampleRate * 0.35);
      var buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      var src = c.createBufferSource(); src.buffer = buf;
      var f = c.createBiquadFilter(); f.type = "lowpass";
      f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(260, t + 0.3);
      var g = c.createGain(); g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      src.connect(f); f.connect(g); g.connect(c.destination); src.start(t); src.stop(t + 0.36);
    },
    early: function () { this.beep(180, 0.35, 0.3, "sawtooth"); },
    done: function () { var s = this; [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { s.beep(f, 0.16, 0.2, "triangle"); }, i * 110); }); },
  };
  Sound.load();

  // ------------------------------------------------ helpers
  var f1 = function (x) { return (Math.round(x * 10) / 10).toFixed(1); }; // reaction times → 1 decimal
  function avg(arr) { if (!arr.length) return 0; var s = 0; for (var i = 0; i < arr.length; i++) s += arr[i]; return Math.round(s / arr.length * 10) / 10; }
  // One set of speed brackets drives both the rating and how hard your shot
  // lands (the t5..t0 classes in styles.css), so the two always agree. Set so
  // a typical reaction (about 250-300ms, a little more on a phone's touch
  // screen) still lands a real hit.
  var BRACKETS = [
    { under: 200, tier: "t5", t: "fastest gun in the West", c: "var(--good)" },  // hat blown off, he drops
    { under: 250, tier: "t4", t: "quick on the draw", c: "var(--good)" },        // he drops
    { under: 300, tier: "t3", t: "sharpshooter", c: "var(--good)" },             // to his knees
    { under: 360, tier: "t2", t: "steady hand", c: "var(--warn)" },              // gun shot out of his hand
    { under: 450, tier: "t1", t: "slow on the trigger", c: "var(--warn)" },      // hat shot off
    { under: Infinity, tier: "t0", t: "too slow, partner", c: "var(--bad)" },    // a miss in the dust
  ];
  function bracket(ms) { for (var i = 0; i < BRACKETS.length; i++) if (ms < BRACKETS[i].under) return BRACKETS[i]; }
  function rate(ms) { var b = bracket(ms); return { t: b.t, c: b.c }; }
  function shotTier(ms) { return bracket(ms).tier; }
  // How long the standoff lasts before the call: usually a few seconds, but
  // sometimes almost at once and sometimes a long wait, so it can't be timed.
  function standoffMs() {
    var r = Math.random();
    if (r < 0.2) return 900 + Math.random() * 1300;   // quick: 0.9-2.2s
    if (r < 0.7) return 2200 + Math.random() * 3800;  // usual: 2.2-6s
    return 6000 + Math.random() * 6000;               // long: 6-12s
  }

  function renderHud() {
    elAttempt.textContent = state === "menu" ? "—" : Math.min(trial, TRIALS) + "/" + TRIALS;
    elLast.textContent = results.length ? f1(results[results.length - 1]) + " ms" : "—";
    elAvg.textContent = results.length ? f1(avg(results)) + " ms" : "—";
    elBest.textContent = best ? f1(best) + " ms" : "—";
  }
  function chipHtml(i) {
    if (penal[i]) return '<span class="chip pen">✗</span>';
    return '<span class="chip' + (late[i] ? ' late" title="outdrawn"' : '"') + '>' + f1(results[i]) + '</span>';
  }
  function renderTimes() {
    var html = "";
    for (var i = 0; i < TRIALS; i++) {
      if (i < results.length) html += chipHtml(i);
      else if (i === results.length && state !== "menu" && state !== "done") html += '<span class="chip cur">' + (i + 1) + '</span>';
      else html += '<span class="chip">·</span>';
    }
    elTimes.innerHTML = html;
  }

  // ------------------------------------------------ flow
  function showStart() {
    state = "menu"; trial = 0; results = []; penal = []; late = []; FX.stop(); delete panel.dataset.shot; clearTimeout(windowId);
    panel.className = "panel idle"; pBig.className = "big"; pBig.textContent = "Reaction"; pSub.textContent = "step into the street to begin"; pRating.textContent = "";
    renderHud(); renderTimes();
    card.innerHTML =
      '<h2>Reaction</h2>' +
      '<p>A high-noon standoff. Wait for the call &mdash; the moment the street flashes <b>DRAW!</b>, tap as fast as you can.</p>' +
      '<ul class="rules">' +
        '<li><b>' + TRIALS + ' attempts.</b> The wait before each flash is random so you can&rsquo;t time it.</li>' +
        '<li>Your score is the <b>average</b> reaction across all ' + TRIALS + ' — lower is better.</li>' +
        '<li>Take longer than <b>' + (WINDOW_MS / 1000) + ' second</b> after the call and he draws first — that duel counts as <b>' + WINDOW_MS + ' ms</b>.</li>' +
        '<li>Draw <b>early</b> and the other gunslinger shoots first: you get an <b>✗</b> — that attempt is scored as a <b>' + (PENALTY / 1000).toFixed(1) + 's</b> penalty, so don&rsquo;t guess!</li>' +
      '</ul>' +
      '<button class="btn" id="btn-start">Step into the street</button>';
    ov.classList.add("show");
    $("btn-start").addEventListener("click", begin);
  }

  function begin() { Sound.init(); clearTimeout(windowId); trial = 0; results = []; penal = []; late = []; ov.classList.remove("show"); nextAttempt(); }

  function nextAttempt() {
    trial++;
    if (trial > TRIALS) { finish(); return; }
    arm();                 // sets state, so the HUD below shows "1/10" and marks the current duel
    renderHud(); renderTimes();
  }

  // the standoff, then the DRAW! call after a random delay. The call must
  // appear the instant flashAt is taken: its look is gradients only, no
  // animation, no image and no sound, so nothing delays what is measured.
  function arm() {
    state = "wait";
    panel.className = "panel wait"; pBig.className = "big"; pBig.textContent = "Steady…"; pSub.textContent = "duel " + trial + " of " + TRIALS; pRating.textContent = "";
    FX.start("214,176,120", 0.5); // dust drifting up during the standoff
    delete panel.dataset.shot; // both back on their feet
    var delay = standoffMs();
    timerId = setTimeout(flash, delay);
  }
  function flash() {
    state = "go"; flashAt = performance.now();
    panel.className = "panel go"; pBig.className = "big"; pBig.textContent = "DRAW!"; pSub.textContent = ""; pRating.textContent = "";
    FX.start("255,236,170", 1.1); // gold sparks over the DRAW! call
    windowId = setTimeout(outdrawn, WINDOW_MS); // your shooting window
  }

  // No shot inside the window: he draws first and you go down. Scored as the
  // window's length: a slow duel, not a foul like drawing early.
  function outdrawn() {
    if (state !== "go") return;
    clearTimeout(windowId); FX.start("214,176,120", 0.5);
    results.push(WINDOW_MS); penal.push(false); late.push(true); Sound.bang();
    renderHud(); renderTimes();
    state = results.length >= TRIALS ? "ending" : "late"; lateAt = performance.now();
    panel.className = "panel toosoon"; pBig.className = "big"; pBig.textContent = "Too slow!";
    pSub.textContent = "he drew first — scored " + WINDOW_MS + " ms · tap to continue";
    pRating.style.color = "var(--bad)"; pRating.textContent = "outdrawn";
    panel.dataset.shot = "lose"; // he fires, you go down
    if (state === "ending") { pSub.textContent = "he drew first"; setTimeout(finish, LAST_SHOT_MS); }
  }

  // false start: the attempt is burned and scored as a fixed penalty time
  function tooSoon() {
    clearTimeout(timerId); FX.start("214,176,120", 0.5); // keep the dust drifting between attempts
    results.push(PENALTY); penal.push(true); late.push(false); Sound.bang(); setTimeout(function () { Sound.early(); }, 160);
    renderHud(); renderTimes();
    state = results.length >= TRIALS ? "ending" : "toosoon";
    panel.className = "panel toosoon"; pBig.className = "big"; pBig.textContent = "✗ Drew too soon!";
    pSub.textContent = "you drew before the call — scored " + (PENALTY / 1000).toFixed(1) + "s · tap to continue";
    pRating.style.color = "var(--bad)"; pRating.textContent = "penalty";
    panel.dataset.shot = "lose"; // the other gunslinger fires, you go down
    if (state === "ending") { pSub.textContent = "you drew before the call"; setTimeout(finish, LAST_SHOT_MS); }
  }

  function record() {
    FX.start("214,176,120", 0.5); // settle back to drifting dust between attempts
    var ms = Math.round((performance.now() - flashAt) * 10) / 10;
    clearTimeout(windowId);
    if (ms >= WINDOW_MS) { outdrawn(); return; } // the timer ran a touch late: still outdrawn
    results.push(ms); penal.push(false); late.push(false); Sound.bang();
    var r = rate(ms);
    renderHud(); renderTimes();
    state = results.length >= TRIALS ? "ending" : "result";
    panel.className = "panel result"; pBig.className = "big ms"; pBig.innerHTML = f1(ms) + '<small> ms</small>'; pSub.textContent = "tap to continue"; pRating.style.color = r.c; pRating.textContent = r.t;
    panel.dataset.shot = shotTier(ms); // you fire; how hard he's hit depends on the time
    if (state === "ending") { pSub.textContent = ""; setTimeout(finish, LAST_SHOT_MS); }
  }

  function finish() {
    state = "done"; FX.stop();
    var a = avg(results);
    var valid = results.filter(function (x, i) { return !penal[i]; });
    var bestSingle = valid.length ? Math.min.apply(null, valid) : null;
    var fouls = penal.filter(Boolean).length, slow = late.filter(Boolean).length;
    var record = (best === 0 || a < best);
    if (record) { best = a; save(BEST_KEY, best); }
    renderHud();
    var r = rate(a);
    var chips = results.map(function (x, i) { return chipHtml(i); }).join("");
    panel.className = "panel idle"; pBig.className = "big"; pBig.textContent = "Showdown over"; pSub.textContent = ""; pRating.textContent = "";
    card.innerHTML =
      '<h2>Showdown Over</h2>' +
      '<div class="big" style="color:' + r.c + '">' + f1(a) + '<small> ms avg</small></div>' +
      '<p style="color:' + r.c + ';font-weight:800;margin-top:0;">' + r.t + (fouls ? ' · ' + fouls + ' false start' + (fouls === 1 ? '' : 's') : '') + (slow ? ' · ' + slow + ' outdrawn' : '') + '</p>' +
      '<p>' + (record ? "★ new best average!" : "best avg " + f1(best) + " ms") + ' &nbsp;·&nbsp; fastest tap ' + (bestSingle === null ? "—" : f1(bestSingle) + " ms") + '</p>' +
      '<div class="summary">' + chips + '</div>' +
      '<button class="btn" id="btn-again" style="margin-top:0.6rem;">Duel again</button>';
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
    else if (state === "late" && performance.now() - lateAt > LATE_GRACE_MS) nextAttempt();
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
