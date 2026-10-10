/* =====================================================================
   Per-game mute toggle — a speaker button in the top-right row, just
   to the LEFT of the "Visual FX" toggle from motion-toggle.js.

   - Mutes ALL of a game's Web Audio at once by routing every AudioContext
     through a master GainNode we control, so no per-game audio code is
     needed: games keep connecting to ctx.destination as usual, and that
     destination is transparently our gain.
   - Remembers its OWN setting per game (key "mute:<id>", derived from the
     folder), and themes itself to match the game's "← Games" back button.
   - Exposes window.MUTE_ON() and fires a "mutechange" event on toggle.
   - Keys: M or "[" (just "[" on a page with <html data-letter-keys="off">).

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

  // ---- keyboard: M, or "[" ---------------------------------------------
  // "[" works in every game. M works too, unless the page opts letters out
  // with <html data-letter-keys="off"> — typing games, and games that
  // already use M for something. Text fields are left alone, except one
  // marked data-game-input (the box a typing game plays in): "[" still
  // works there, and the letters stay the player's.
  function lettersOn() { return document.documentElement.getAttribute("data-letter-keys") !== "off"; }
  function isKey(e, letter, sym) {
    if (!e.key || e.repeat || e.metaKey) return false;   // autofill sends keydowns with no key
    // AltGr (Ctrl+Alt) is how some layouts type the brackets
    if ((e.ctrlKey || e.altKey) && !(e.key === sym && e.ctrlKey && e.altKey)) return false;
    var t = e.target, tag = t && t.tagName;
    var typing = tag === "TEXTAREA" || tag === "SELECT" || !!(t && t.isContentEditable) ||
      (tag === "INPUT" && !/^(checkbox|radio|button|submit|reset|range|color|file|image)$/i.test(t.type));
    if (e.key === sym) return !typing || t.hasAttribute("data-game-input");
    return !typing && lettersOn() && e.key.toLowerCase() === letter;
  }

  // the row it shares with the ⏸ and Visual FX buttons (motion-toggle.js),
  // which places it and gives it its height
  var corner = window.GSCorner || null;
  var btn = null, shown = "";
  function toggle() {
    muted = !muted;
    try { localStorage.setItem(KEY, muted ? "1" : "0"); } catch (e) {}
    applyGain();
    render();
    window.dispatchEvent(new CustomEvent("mutechange", { detail: { muted: muted } }));
  }
  // Like the ⏸ button: the key shows in the label only on wide screens (as a
  // keycap; its style lives in motion-toggle.js); the tooltip and aria-label
  // always name it
  function render() {
    if (!btn) return;
    var key = lettersOn() ? "M" : "[";
    btn.setAttribute("aria-pressed", muted ? "true" : "false");
    btn.setAttribute("aria-label", "Mute or unmute this game (" + key + ")");
    btn.setAttribute("aria-keyshortcuts", lettersOn() ? "M [" : "[");
    btn.title = "Mute / unmute sound for this game — " + (lettersOn() ? "M or [" : "[");
    // (both speakers take up room, so the button is the same width muted or not: .gs-swap)
    var icon = corner ? corner.swap(muted ? "🔇" : "🔊", muted ? "🔊" : "🔇") : muted ? "🔇" : "🔊";
    var html = icon + (window.innerWidth >= 1200 ? ' <kbd class="gs-kbd">' + key + "</kbd>" : "");
    if (html !== shown) { btn.innerHTML = html; shown = html; }
    btn.style.opacity = muted ? "0.72" : "1";
  }

  document.addEventListener("keydown", function (e) {
    if (!btn || !isKey(e, "m", "[")) return;
    e.preventDefault();
    toggle();
  });

  function build() {
    if (document.querySelector(".mute-toggle")) return;
    btn = document.createElement("button");
    btn.className = "mute-toggle";
    btn.type = "button";
    btn.style.cssText = "cursor:pointer;font-weight:700;border-radius:8px;padding:0 11px;";
    // (without the row: alone in the corner)
    if (!corner) btn.style.cssText += "position:fixed;top:12px;right:12px;z-index:99999;font-size:15px;line-height:1;padding:8px 11px;";

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

    render();
    btn.addEventListener("click", toggle);
    // a mouse click doesn't take focus (Tab still reaches the button): a focused
    // button would be clicked again by the Enter / Space a player presses next
    btn.addEventListener("mousedown", function (e) { e.preventDefault(); });

    (corner ? corner.row() : document.body).appendChild(btn);
    window.addEventListener("resize", render);
  }

  if (document.body) build();
  else document.addEventListener("DOMContentLoaded", build);
})();
