/* =====================================================================
   Per-game "Reduce motion" toggle.
   - Storage key is derived from the game's folder, so each game remembers
     its OWN setting (e.g. /games/galaga/ -> "reduceMotion:galaga").
   - Injects a motion-neutralizing <style> before first paint (no flash).
   - Builds a fixed top-right toggle button that auto-themes to match the
     game's "← Games" back button.
   - Exposes window.RM_ON() so canvas games can gate JS shake/flash live,
     and fires a "reducemotionchange" event on toggle.
   Include with:  <script src="../motion-toggle.js"></script>  (in <head>)
   ===================================================================== */
(function () {
  "use strict";

  // Per-game key from the folder name: /games/<id>/[anything.html] -> <id>
  // (strips any trailing *.html so sub-pages like editor.html share the game's setting)
  var seg = location.pathname.replace(/\/([^/]*\.html?)?$/i, "").split("/").filter(Boolean);
  var id = seg[seg.length - 1] || "site";
  var KEY = "reduceMotion:" + id;
  var CSS =
    "*,*::before,*::after{animation-duration:.001ms!important;" +
    "animation-iteration-count:1!important;transition-duration:.001ms!important;" +
    "scroll-behavior:auto!important}";

  // Effective state: an explicit per-game choice wins; otherwise fall back to
  // the OS "prefers-reduced-motion" setting.
  function reduced() {
    try {
      var v = localStorage.getItem(KEY);
      if (v === "1") return true;
      if (v === "0") return false;
    } catch (e) {}
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  window.RM_ON = reduced; // canvas games read this live each frame

  function apply(on) {
    var el = document.getElementById("rm-style");
    if (on && !el) {
      el = document.createElement("style");
      el.id = "rm-style";
      el.textContent = CSS;
      (document.head || document.documentElement).appendChild(el);
    } else if (!on && el) {
      el.parentNode.removeChild(el);
    }
  }

  apply(reduced()); // runs at <head> parse time -> no flash of animation

  // Hover / active / focus feedback for the back + Visual FX buttons — mirrors the
  // game-card lift on the main page. Injected once; theme-agnostic (works on every game).
  (function injectHover() {
    if (document.getElementById("rm-hover-style")) return;
    var st = document.createElement("style");
    st.id = "rm-hover-style";
    st.textContent =
      ".nav-back-games,.rm-toggle{transition:filter .15s ease,outline-color .15s ease,opacity .15s ease;outline:2px solid transparent;outline-offset:2px}" +
      // Flat buttons: a subtle ring + brightness on hover.
      ".nav-back-games:hover,.rm-toggle:hover{filter:brightness(1.14);outline-color:currentColor}" +
      // 3D / glow buttons (have their own shadow): no ring (it clashes) — just energize.
      ".nav-back-games.rm-3d:hover,.rm-toggle.rm-3d:hover{outline-color:transparent;filter:brightness(1.12) saturate(1.25)}" +
      ".nav-back-games:active,.rm-toggle:active{filter:brightness(.92)}" +
      ".nav-back-games:focus-visible,.rm-toggle:focus-visible{outline-color:currentColor;outline-offset:3px}";
    (document.head || document.documentElement).appendChild(st);
  })();

  function build() {
    if (document.querySelector(".rm-toggle")) return;
    var btn = document.createElement("button");
    btn.className = "rm-toggle";
    btn.type = "button";
    btn.setAttribute("aria-label", "Toggle visual effects for this game");
    btn.title = "Toggle visual effects for this game (shake, flash, glow, animations)";
    btn.style.cssText =
      "position:fixed;top:12px;right:12px;z-index:99999;cursor:pointer;" +
      "font-weight:700;font-size:13px;line-height:1;border-radius:8px;" +
      "padding:8px 12px;-webkit-tap-highlight-color:transparent;";

    // Match the game's back button so the toggle feels native to each theme.
    var back = document.querySelector(".nav-back-games");
    if (back) {
      var cs = getComputedStyle(back);
      btn.style.color = cs.color;
      btn.style.background = cs.backgroundColor;
      btn.style.border = cs.borderTopWidth + " " + cs.borderTopStyle + " " + cs.borderTopColor;
      btn.style.borderRadius = cs.borderTopLeftRadius;
      btn.style.fontFamily = cs.fontFamily;
      btn.style.fontWeight = cs.fontWeight;
      // Carry over the back button's shadow so 3D / neon-glow themes match, and
      // mark both buttons so hover skips the (clashing) ring for these.
      if (cs.boxShadow && cs.boxShadow !== "none") {
        btn.style.boxShadow = cs.boxShadow;
        btn.classList.add("rm-3d");
        back.classList.add("rm-3d");
      }
    } else {
      btn.style.color = "#fff";
      btn.style.background = "rgba(18,20,28,0.55)";
      btn.style.border = "1px solid rgba(255,255,255,0.22)";
    }

    function render() {
      var r = reduced();
      btn.setAttribute("aria-pressed", r ? "true" : "false");
      btn.textContent = r ? "✨ Visual FX: off" : "✨ Visual FX: on";
      btn.style.opacity = r ? "0.72" : "1";
    }
    render();

    btn.addEventListener("click", function () {
      var on = !reduced();
      try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) {}
      apply(on);
      render();
      window.dispatchEvent(new CustomEvent("reducemotionchange", { detail: { on: on } }));
    });

    document.body.appendChild(btn);
  }

  if (document.body) build();
  else document.addEventListener("DOMContentLoaded", build);
})();
