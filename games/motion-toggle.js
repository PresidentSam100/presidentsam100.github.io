/* =====================================================================
   Per-game "Reduce motion" toggle.
   - Storage key is derived from the game's folder, so each game remembers
     its OWN setting (e.g. /games/spacer/ -> "reduceMotion:spacer").
   - Injects a motion-neutralizing <style> before first paint (no flash).
   - Builds a fixed top-right toggle button that auto-themes to match the
     game's "← Games" back button.
   - Exposes window.RM_ON() so canvas games can gate JS shake/flash live,
     and fires a "reducemotionchange" event on toggle.
   - Keys: V or "]" (just "]" on a page with <html data-letter-keys="off">).
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

  // Keycaps for shortcut hints: <kbd class="gs-kbd">. Used by this button,
  // the sound and ⏸ buttons, the pause card, and games' own hint text.
  // :where() keeps them at zero specificity, so a game that already styles
  // its kbd keys (Passport, Abyss, Demolition Row…) gets its own look; the
  // rest get this one, drawn in the colour of the text around it. Inside the
  // corner buttons the caps get negative margins so the buttons don't grow.
  // A button's keys wrapped in <span class="gs-keys"> hide on touch-only
  // devices (no hover), where there's no keyboard to press them on.
  (function injectKeycaps() {
    if (document.getElementById("gs-kbd-style")) return;
    var st = document.createElement("style");
    st.id = "gs-kbd-style";
    st.textContent =
      ":where(.gs-kbd){display:inline-block;box-sizing:border-box;min-width:1.6em;padding:.12em .4em .1em;margin:0 .06em;" +
      "font-family:inherit;font-size:.8em;font-weight:700;font-style:normal;line-height:1.15;text-align:center;" +
      "vertical-align:.06em;white-space:nowrap;color:inherit;" +
      "background:rgba(128,128,128,.16);background:color-mix(in srgb,currentColor 13%,transparent);" +
      "border:1px solid;border-color:color-mix(in srgb,currentColor 50%,transparent);border-bottom-width:2px;border-radius:.3em}" +
      ".rm-toggle .gs-kbd,.mute-toggle .gs-kbd,.gs-pause-btn .gs-kbd{margin-top:-.6em;margin-bottom:-.6em}" +
      "@media (hover:none){.gs-keys{display:none}}";
    (document.head || document.documentElement).appendChild(st);
  })();

  // ---- keyboard: V, or "]" ---------------------------------------------
  // Same rules as the sound button's M / "[" (see mute-toggle.js): "]"
  // works in every game; V too unless <html data-letter-keys="off">; text
  // fields are left alone except one marked data-game-input, where only
  // "]" works.
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

  var btn = null, shown = "";
  function toggle() {
    var on = !reduced();
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) {}
    apply(on);
    render();
    window.dispatchEvent(new CustomEvent("reducemotionchange", { detail: { on: on } }));
  }
  // Like the ⏸ button: the key shows in the label only on wide screens;
  // the tooltip and aria-label always name it
  function render() {
    if (!btn) return;
    var r = reduced(), key = lettersOn() ? "V" : "]";
    btn.setAttribute("aria-pressed", r ? "true" : "false");
    btn.setAttribute("aria-label", "Toggle visual effects for this game (" + key + ")");
    btn.setAttribute("aria-keyshortcuts", lettersOn() ? "V ]" : "]");
    btn.title = "Toggle visual effects for this game (shake, flash, glow, animations) — " + (lettersOn() ? "V or ]" : "]");
    var html = (r ? "✨ Visual FX: off" : "✨ Visual FX: on") +
      (window.innerWidth >= 1200 ? ' <kbd class="gs-kbd">' + key + "</kbd>" : "");
    if (html !== shown) { btn.innerHTML = html; shown = html; }
    btn.style.opacity = r ? "0.72" : "1";
  }

  document.addEventListener("keydown", function (e) {
    if (!btn || !isKey(e, "v", "]")) return;
    e.preventDefault();
    toggle();
  });

  function build() {
    if (document.querySelector(".rm-toggle")) return;
    btn = document.createElement("button");
    btn.className = "rm-toggle";
    btn.type = "button";
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

    render();
    btn.addEventListener("click", toggle);

    document.body.appendChild(btn);
    // the sound and ⏸ buttons re-place themselves on resize after this runs
    window.addEventListener("resize", render);
  }

  if (document.body) build();
  else document.addEventListener("DOMContentLoaded", build);
})();
