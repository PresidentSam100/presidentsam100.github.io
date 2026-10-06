/* =====================================================================
   Per-game "Reduce motion" toggle.
   - Storage key is derived from the game's folder, so each game remembers
     its OWN setting (e.g. /games/spacer/ -> "reduceMotion:spacer").
   - Injects a motion-neutralizing <style> before first paint (no flash).
   - Builds a fixed top-right toggle button that auto-themes to match the
     game's "← Games" back button.
   - Exposes window.RM_ON() (true = FX off) and window.FX_ON() (true = FX on)
     so canvas games can gate effects live, and fires a "reducemotionchange"
     event (detail.on = FX off) on toggle.
   - Marks <html> with "fx-on" or "fx-off" from head-parse time on, so a
     game's CSS can style either mode on purpose (html.fx-on .x { … }).
   - With FX off it also injects a blunt fallback that ends every CSS
     animation / transition at once. A game that styles html.fx-off itself
     opts out with <html data-fx-css="own"> (then FX off can mean calmer
     motion, e.g. short fades, instead of none).
   - Its default follows the OS "reduce motion" setting until the player
     picks; games shouldn't add their own @media (prefers-reduced-motion)
     copy, which would beat the player's explicit "FX on".
   - Keys: V or "]" (just "]" on a page with <html data-letter-keys="off">).
   - Also the way out for every game: Home, or an Esc the game didn't use,
     goes to the games page (see "Home or Esc" below).
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
    "*,*::before,*::after{animation-duration:.001ms!important;animation-delay:0s!important;" +
    "animation-iteration-count:1!important;transition-duration:.001ms!important;transition-delay:0s!important;" +
    "scroll-behavior:auto!important}";
  // a game that styles html.fx-off itself skips the blunt fallback
  var OWN_CSS = document.documentElement.getAttribute("data-fx-css") === "own";

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
  window.FX_ON = function () { return !reduced(); };

  function apply(on) {
    var html = document.documentElement;
    html.classList.toggle("fx-off", !!on);
    html.classList.toggle("fx-on", !on);
    var el = document.getElementById("rm-style");
    if (on && !el && !OWN_CSS) {
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
      ".rm-toggle .gs-kbd,.mute-toggle .gs-kbd,.gs-pause-btn .gs-kbd,.nav-back-games .gs-kbd{margin-top:-.6em;margin-bottom:-.6em}" +
      "@media (hover:none){.gs-keys{display:none}}";
    (document.head || document.documentElement).appendChild(st);
  })();

  // ---- keyboard: V, or "]" ---------------------------------------------
  // Same rules as the sound button's M / "[" (see mute-toggle.js): "]"
  // works in every game; V too unless <html data-letter-keys="off">; text
  // fields are left alone except one marked data-game-input, where only
  // "]" works.
  function lettersOn() { return document.documentElement.getAttribute("data-letter-keys") !== "off"; }
  // a key pressed in a text field (but not a checkbox, button, slider…)
  function typingIn(t) {
    var tag = t && t.tagName;
    return tag === "TEXTAREA" || tag === "SELECT" || !!(t && t.isContentEditable) ||
      (tag === "INPUT" && !/^(checkbox|radio|button|submit|reset|range|color|file|image)$/i.test(t.type));
  }
  function isKey(e, letter, sym) {
    if (!e.key || e.repeat || e.metaKey) return false;   // autofill sends keydowns with no key
    // AltGr (Ctrl+Alt) is how some layouts type the brackets
    if ((e.ctrlKey || e.altKey) && !(e.key === sym && e.ctrlKey && e.altKey)) return false;
    var t = e.target, typing = typingIn(t);
    if (e.key === sym) return !typing || t.hasAttribute("data-game-input");
    return !typing && lettersOn() && e.key.toLowerCase() === letter;
  }

  // ---- keyboard: Home or Esc -> the games page ----------------------------
  // Home leaves for the games list from anywhere in a game. Esc does too,
  // unless the game acted on it: pausing or resuming, closing a panel,
  // stepping back out of a sub-screen. Every game marks such an Esc by
  // calling preventDefault(), so this needs no idea which screen is up; it
  // listens first (capture) and decides once the key has been through the
  // game's own handlers. Neither key works from a text field (except the
  // game's own answer box, marked data-game-input) or while a GameShell
  // dialog is up. A page whose Esc must never leave (an editor, where it
  // would throw away work) sets <html data-esc-leaves="off">.
  var GAMES_URL = new URL("../", location.href).href;
  function leaveKey(e) {
    if ((e.key !== "Escape" && e.key !== "Home") || e.repeat) return false;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
    if (typingIn(e.target) && !e.target.hasAttribute("data-game-input")) return false;
    if (e.key === "Escape" && document.documentElement.getAttribute("data-esc-leaves") === "off") return false;
    return !document.querySelector(".gs-dialog");   // a dialog answers Esc itself, and Home waits for it
  }
  // With a game in progress, GameShell asks "Leave this game?" first
  // (game-shell.js, guardLeave); otherwise it's straight out.
  function leave(url) {
    var go = function () { location.href = url; };
    var gs = window.GameShell;
    if (gs && gs.askLeave && gs.askLeave(go)) return;
    go();
  }
  window.addEventListener("keydown", function (e) {
    if (!leaveKey(e)) return;
    setTimeout(function () { if (!e.defaultPrevented) leave(GAMES_URL); }, 0);
  }, true);
  // the "← Games" button asks the same way, and so does any other link out
  // of a game marked data-leave (Tile Maze's editor "← Back to game"); a
  // middle or Ctrl-click still opens a new tab without asking
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest && e.target.closest(".nav-back-games, a[data-leave]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    var gs = window.GameShell;
    if (gs && gs.leaveActive && gs.leaveActive()) { e.preventDefault(); leave(a.href); }
  }, true);

  // The "← Games" button names the key, like the ✨ and 🔊 buttons do (only
  // where it leads to the games page: Slither's editor links back to Slither)
  function markBack() {
    var back = document.querySelector(".nav-back-games");
    if (!back || back.href !== GAMES_URL) return;
    back.setAttribute("aria-keyshortcuts", "Home Escape");
    back.title = "Back to the games — Home, or Esc when nothing's in play";
    var cap = back.querySelector(".gs-back-key"), wide = window.innerWidth >= 1200;
    if (wide && !cap) {
      cap = document.createElement("span");
      cap.className = "gs-keys gs-back-key";
      cap.innerHTML = ' <kbd class="gs-kbd">Home</kbd>';
      back.appendChild(cap);
    } else if (!wide && cap) back.removeChild(cap);
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
    // a mouse click doesn't take focus (Tab still reaches the button): a focused
    // button would be clicked again by the Enter / Space a player presses next
    btn.addEventListener("mousedown", function (e) { e.preventDefault(); });

    document.body.appendChild(btn);
    markBack();
    // the sound and ⏸ buttons re-place themselves on resize after this runs
    window.addEventListener("resize", function () { render(); markBack(); });
  }

  if (document.body) build();
  else document.addEventListener("DOMContentLoaded", build);
})();
