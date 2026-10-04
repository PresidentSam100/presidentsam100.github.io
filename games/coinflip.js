/* =====================================================================
   Shared first-turn picker. Always animates a flip before announcing
   who goes first, then calls back with "you" or "cpu".

   - Visual FX ON  -> a slot-machine reel that spins and decelerates.
   - Visual FX OFF -> a neutral "?" for a few slow ticks, then the winner
                      fades in once (alternating the names read as a strobe).

   Usage:
     coinFlip({ you: "You (X)", cpu: "CPU (O)", accent: "#89b4fa" },
              function (who) { if (who === "cpu") ...cpu moves first... });

   Theming: the default look (a dark glass card) is written with :where(),
   so it has no specificity and a game restyles any part in its own CSS:
     .cf-overlay  the backdrop          .cf-window  the reel / name window
     .cf-card     the card              .cf-nm      a name (.cf-q: the "?")
     .cf-title    "Who goes first?"     .cf-sub     "flipping…" / the result
   The names keep their own colours (youColor / cpuColor) inline.
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

  var CSS =
    ":where(.cf-overlay){position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:1rem;" +
    "background:rgba(6,10,18,.82);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);font-family:inherit}" +
    ":where(.cf-card){text-align:center;padding:1.5rem 2.2rem;border:1px solid var(--cf-edge);border-radius:18px;" +
    "background:rgba(12,18,30,.55);box-shadow:0 0 44px -12px var(--cf-accent)}" +
    ":where(.cf-title){font-size:.72rem;letter-spacing:.2em;text-transform:uppercase;color:#9aa6b8;font-weight:800;margin-bottom:14px}" +
    ":where(.cf-window){position:relative;overflow:hidden;height:1.18em;font-size:clamp(34px,12vw,64px);font-weight:900;line-height:1.18}" +
    ":where(.cf-sub){margin-top:16px;font-size:1rem;color:#9aa6b8;font-weight:800;min-height:1.4em}" +
    ":where(.cf-nm){height:100%;display:flex;align-items:center;justify-content:center;white-space:nowrap}" +
    ":where(.cf-q){color:#9aa6b8}";
  function injectCss() {
    if (document.getElementById("cf-style")) return;
    var st = document.createElement("style");
    st.id = "cf-style";
    st.textContent = CSS;
    // first in <head>, so a game's own stylesheet comes later and wins ties
    var head = document.head || document.documentElement;
    head.insertBefore(st, head.firstChild);
  }

  function coinFlip(opts, cb) {
    opts = opts || {};
    injectCss();
    var you = opts.you || "You", cpu = opts.cpu || "CPU";
    var accent = opts.accent || "#36cfff";
    var youColor = opts.youColor || accent, cpuColor = opts.cpuColor || "#ff7a7a";
    var reduce = !!(window.RM_ON && window.RM_ON());
    var faces = [you, cpu], cols = [youColor, cpuColor];
    var short = function (s) { return s.replace(/\s*\([^)]*\)\s*$/, ""); };   // "You (Red)" -> "You"
    var sFaces = [short(you), short(cpu)];                                    // big reel labels (fit the window)
    var result = Math.random() < 0.5 ? "you" : "cpu", resIdx = result === "you" ? 0 : 1;

    var ov = document.createElement("div");
    ov.className = "cf-overlay";
    ov.setAttribute("role", "status");
    ov.style.setProperty("--cf-accent", accent);
    ov.style.setProperty("--cf-edge", /^#[0-9a-f]{6}$/i.test(accent) ? accent + "55" : accent);
    var card = document.createElement("div");
    card.className = "cf-card";
    card.innerHTML =
      '<div class="cf-title">🎲 Who goes first?</div>' +
      '<div class="cf-window"></div>' +
      '<div class="cf-sub">flipping…</div>';
    ov.appendChild(card);
    document.body.appendChild(ov);
    var win = card.querySelector(".cf-window"), subEl = card.querySelector(".cf-sub");

    function finish() {
      var verb = result === "you" ? "go" : "goes";  // "You go first" vs "CPU goes first"
      subEl.innerHTML = '<span class="cf-win" style="color:' + cols[resIdx] + '">' + faces[resIdx] + "</span> " + verb + " first!";
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
      // ---- calm version: the same card, a neutral "?" while it "flips" to a
      // few slow ticks, then the winner fades in once. (It used to swap the two
      // names in their colours from ~55ms apart, which read as a strobe.) The
      // fade uses el.animate, which the FX-off CSS switch doesn't flatten. ----
      win.innerHTML = '<div class="cf-nm cf-q">?</div>';
      var nm = win.querySelector(".cf-nm");
      [0, 220, 440, 660].forEach(function (t, k) { setTimeout(function () { tick(k % 2); }, t); });
      setTimeout(function () {
        nm.classList.remove("cf-q");
        nm.textContent = sFaces[resIdx]; nm.style.color = cols[resIdx];
        if (nm.animate) nm.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: "ease-out" });
        finish();
      }, 880);
    } else {
      // ---- slot-machine reel: a strip of names that spins up and decelerates ----
      var lineH = win.clientHeight || 70;
      var seq = buildSeq(14), L = seq.length;
      var strip = document.createElement("div");
      strip.style.cssText = "display:flex;flex-direction:column;will-change:transform;";
      seq.forEach(function (idx) {
        var d = document.createElement("div");
        d.className = "cf-nm";
        d.textContent = sFaces[idx];
        d.style.cssText = "height:" + lineH + "px;color:" + cols[idx] + ";";
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
