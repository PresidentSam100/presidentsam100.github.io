/* =====================================================================
   Shared first-turn picker. Always animates a flip before announcing
   who goes first, then calls back with "you" or "cpu".

   - Visual FX ON  -> a slot-machine reel that spins and decelerates.
   - Visual FX OFF -> a quick flash between the two names (no motion easing).

   Usage:
     coinFlip({ you: "You (X)", cpu: "CPU (O)", accent: "#89b4fa" },
              function (who) { if (who === "cpu") ...cpu moves first... });
   ===================================================================== */
(function () {
  // --- sound (own AudioContext; audible once the page has had a gesture) ---
  var actx = null;
  function AC() { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch (e) {} return actx; }
  function blip(freq, dur, vol, type) {
    var a = AC(); if (!a) return;
    try {
      var t = a.currentTime, o = a.createOscillator(), g = a.createGain();
      o.type = type || "square"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }
  function tick(i) { blip(i ? 360 : 520, 0.03, 0.05, "square"); }
  function chime() { [660, 990, 1320].forEach(function (f, k) { setTimeout(function () { blip(f, 0.16, 0.12, "triangle"); }, k * 80); }); }

  function coinFlip(opts, cb) {
    opts = opts || {};
    var you = opts.you || "You", cpu = opts.cpu || "CPU";
    var accent = opts.accent || "#36cfff";
    var youColor = opts.youColor || accent, cpuColor = opts.cpuColor || "#ff7a7a";
    var reduce = !!(window.RM_ON && window.RM_ON());
    var faces = [you, cpu], cols = [youColor, cpuColor];
    var short = function (s) { return s.replace(/\s*\([^)]*\)\s*$/, ""); };   // "You (Red)" -> "You"
    var sFaces = [short(you), short(cpu)];                                    // big reel labels (fit the window)
    var result = Math.random() < 0.5 ? "you" : "cpu", resIdx = result === "you" ? 0 : 1;

    var ov = document.createElement("div");
    ov.setAttribute("role", "status");
    ov.style.cssText =
      "position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:1rem;" +
      "background:rgba(6,10,18,.82);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);font-family:inherit;";
    var card = document.createElement("div");
    card.style.cssText =
      "text-align:center;padding:1.5rem 2.2rem;border:1px solid " + accent + "55;border-radius:18px;" +
      "background:rgba(12,18,30,.55);box-shadow:0 0 44px -12px " + accent + ";";
    var fontCss = "font-size:clamp(34px,12vw,64px);font-weight:900;line-height:1.18;";
    card.innerHTML =
      '<div style="font-size:.72rem;letter-spacing:.2em;text-transform:uppercase;color:#9aa6b8;font-weight:800;margin-bottom:14px">🎲 Who goes first?</div>' +
      '<div class="cf-window" style="position:relative;overflow:hidden;height:1.18em;' + fontCss + '"></div>' +
      '<div class="cf-sub" style="margin-top:16px;font-size:1rem;color:#9aa6b8;font-weight:800;min-height:1.4em">flipping…</div>';
    ov.appendChild(card);
    document.body.appendChild(ov);
    var win = card.querySelector(".cf-window"), subEl = card.querySelector(".cf-sub");

    function finish() {
      var verb = result === "you" ? "go" : "goes";  // "You go first" vs "CPU goes first"
      subEl.innerHTML = '<span style="color:' + cols[resIdx] + '">' + faces[resIdx] + "</span> " + verb + " first!";
      chime();
      setTimeout(function () { ov.remove(); if (cb) cb(result); }, 850);
    }

    // A strictly-alternating run of ~base frames that STARTS on a random side and
    // ENDS on the winner — so the opening frame never reveals who was picked.
    function buildSeq(base) {
      var start = Math.random() < 0.5 ? 0 : 1, L = base;
      if ((start + L - 1) % 2 !== resIdx) L += 1;   // nudge length so the alternation lands on resIdx
      var s = [];
      for (var k = 0; k < L; k++) s.push((start + k) % 2);
      return s;
    }

    if (reduce) {
      // ---- flash version of the reel: cycle the two names with no smooth
      // motion, but with decelerating gaps so it visibly slows to a stop on the
      // winner (like the slot machine winding down, just in discrete flashes) ----
      win.innerHTML = '<div class="cf-nm" style="height:100%;display:flex;align-items:center;justify-content:center"></div>';
      var nm = win.querySelector(".cf-nm");
      var fseq = buildSeq(13), fL = fseq.length, fi = 0;
      // gaps grow from ~55ms to ~225ms so each flip lingers a little longer than the last
      function flashGap(i) { return 55 + Math.round(170 * Math.pow(i / (fL - 1), 1.7)); }
      (function step() {
        var v = fseq[fi]; nm.textContent = sFaces[v]; nm.style.color = cols[v]; tick(v); fi++;
        if (fi < fL) setTimeout(step, flashGap(fi));
        else finish();
      })();
    } else {
      // ---- slot-machine reel: a strip of names that spins up and decelerates ----
      var lineH = win.clientHeight || 70;
      var seq = buildSeq(14), L = seq.length;
      var strip = document.createElement("div");
      strip.style.cssText = "display:flex;flex-direction:column;will-change:transform;";
      seq.forEach(function (idx) {
        var d = document.createElement("div");
        d.textContent = sFaces[idx];
        d.style.cssText = "height:" + lineH + "px;display:flex;align-items:center;justify-content:center;white-space:nowrap;color:" + cols[idx] + ";";
        strip.appendChild(d);
      });
      win.appendChild(strip);
      var travel = (seq.length - 1) * lineH;
      strip.style.transition = "transform 1.5s cubic-bezier(0.12, 0.78, 0.18, 1)";
      [0, 80, 170, 270, 380, 500, 640, 800, 990, 1210, 1430].forEach(function (t, kk) { setTimeout(function () { tick(kk % 2); }, t); });
      requestAnimationFrame(function () { requestAnimationFrame(function () { strip.style.transform = "translateY(-" + travel + "px)"; }); });
      setTimeout(finish, 1560);
    }
  }
  window.coinFlip = coinFlip;
})();
