/* =====================================================================
   Per-game mute toggle — a speaker button pinned to the top-right, just
   to the LEFT of the "Visual FX" toggle from motion-toggle.js.

   - Mutes ALL of a game's Web Audio at once by routing every AudioContext
     through a master GainNode we control, so no per-game audio code is
     needed: games keep connecting to ctx.destination as usual, and that
     destination is transparently our gain.
   - Remembers its OWN setting per game (key "mute:<id>", derived from the
     folder), and themes itself to match the game's "← Games" back button.
   - Exposes window.MUTE_ON() and fires a "mutechange" event on toggle.

   Include in <head> AFTER motion-toggle.js:
     <script src="../mute-toggle.js"></script>
   ===================================================================== */
(function () {
  "use strict";

  // Per-game key from the folder name: /games/<id>/[anything.html] -> <id>
  // (strips any trailing *.html so sub-pages like editor.html share the game's setting)
  var seg = location.pathname.replace(/\/([^/]*\.html?)?$/i, "").split("/").filter(Boolean);
  var id = seg[seg.length - 1] || "site";
  var KEY = "mute:" + id;

  var muted = (function () { try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; } })();
  window.MUTE_ON = function () { return muted; };

  // ---- master-gain shim ------------------------------------------------
  // Wrap the AudioContext constructors so every context gets a master gain
  // inserted before the real speakers. Games connect to ctx.destination
  // (now that gain), so flipping it to 0 silences the whole game live.
  var gains = [];
  function patch(name) {
    var Orig = window[name];
    if (!Orig || Orig.__muteWrapped) return;
    function Wrapped(opts) {
      var ctx = opts !== undefined ? new Orig(opts) : new Orig();
      try {
        var realDest = ctx.destination;            // the actual output
        var mg = ctx.createGain();
        mg.gain.value = muted ? 0 : 1;
        mg.connect(realDest);
        gains.push(mg);
        // Shadow the read-only prototype getter with an own property.
        Object.defineProperty(ctx, "destination", { configurable: true, get: function () { return mg; } });
      } catch (e) {}
      return ctx;
    }
    Wrapped.prototype = Orig.prototype;
    Wrapped.__muteWrapped = true;
    try { window[name] = Wrapped; } catch (e) {}
  }
  patch("AudioContext");
  patch("webkitAudioContext");

  function applyGain() {
    for (var i = 0; i < gains.length; i++) {
      try {
        var g = gains[i];
        // a quick ramp avoids clicks when toggling mid-sound
        var now = g.context.currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setTargetAtTime(muted ? 0 : 1, now, 0.01);
      } catch (e) { try { gains[i].gain.value = muted ? 0 : 1; } catch (e2) {} }
    }
  }

  // ---- hover / focus feedback (mirrors the back + FX buttons) ----------
  (function injectHover() {
    if (document.getElementById("mute-hover-style")) return;
    var st = document.createElement("style");
    st.id = "mute-hover-style";
    st.textContent =
      ".mute-toggle{transition:filter .15s ease,outline-color .15s ease,opacity .15s ease;outline:2px solid transparent;outline-offset:2px}" +
      ".mute-toggle:hover{filter:brightness(1.14);outline-color:currentColor}" +
      ".mute-toggle.rm-3d:hover{outline-color:transparent;filter:brightness(1.12) saturate(1.25)}" +
      ".mute-toggle:active{filter:brightness(.92)}" +
      ".mute-toggle:focus-visible{outline-color:currentColor;outline-offset:3px}";
    (document.head || document.documentElement).appendChild(st);
  })();

  // Sit just left of the "Visual FX" toggle (.rm-toggle); fall back to the
  // corner if it isn't present. Re-run on resize / when the FX label changes.
  function place(btn) {
    var fx = document.querySelector(".rm-toggle");
    var r = fx && fx.getBoundingClientRect();
    if (r && r.width) btn.style.right = Math.max(12, window.innerWidth - r.left + 8) + "px";
    else btn.style.right = "12px";
  }

  function build() {
    if (document.querySelector(".mute-toggle")) return;
    var btn = document.createElement("button");
    btn.className = "mute-toggle";
    btn.type = "button";
    btn.setAttribute("aria-label", "Mute or unmute this game");
    btn.title = "Mute / unmute sound for this game";
    btn.style.cssText =
      "position:fixed;top:12px;z-index:99999;cursor:pointer;font-weight:700;font-size:15px;line-height:1;" +
      "border-radius:8px;padding:8px 11px;-webkit-tap-highlight-color:transparent;";

    // Match the game's back button so the toggle feels native to each theme.
    var back = document.querySelector(".nav-back-games");
    if (back) {
      var cs = getComputedStyle(back);
      btn.style.color = cs.color;
      btn.style.background = cs.backgroundColor;
      btn.style.border = cs.borderTopWidth + " " + cs.borderTopStyle + " " + cs.borderTopColor;
      btn.style.borderRadius = cs.borderTopLeftRadius;
      btn.style.fontFamily = cs.fontFamily;
      if (cs.boxShadow && cs.boxShadow !== "none") { btn.style.boxShadow = cs.boxShadow; btn.classList.add("rm-3d"); }
    } else {
      btn.style.color = "#fff";
      btn.style.background = "rgba(18,20,28,0.55)";
      btn.style.border = "1px solid rgba(255,255,255,0.22)";
    }

    function render() {
      btn.setAttribute("aria-pressed", muted ? "true" : "false");
      btn.textContent = muted ? "🔇" : "🔊";
      btn.style.opacity = muted ? "0.72" : "1";
    }
    render();

    btn.addEventListener("click", function () {
      muted = !muted;
      try { localStorage.setItem(KEY, muted ? "1" : "0"); } catch (e) {}
      applyGain();
      render();
      window.dispatchEvent(new CustomEvent("mutechange", { detail: { muted: muted } }));
    });

    document.body.appendChild(btn);
    place(btn);
    requestAnimationFrame(function () { place(btn); });   // after the FX button settles
    setTimeout(function () { place(btn); }, 80);
    window.addEventListener("resize", function () { place(btn); });
    window.addEventListener("reducemotionchange", function () { setTimeout(function () { place(btn); }, 0); });
  }

  if (document.body) build();
  else document.addEventListener("DOMContentLoaded", build);
})();
