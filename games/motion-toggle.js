/* =====================================================================
   Per-game "Reduce motion" toggle.
   - Storage key is derived from the game's folder, so each game remembers
     its OWN setting (e.g. /games/spacer/ -> "reduceMotion:spacer").
   - Injects a motion-neutralizing <style> before first paint (no flash).
   - Builds a top-right toggle button that auto-themes to match the game's
     "← Games" back button, and the row it shares with the sound and ⏸
     buttons (see "the corner row" below).
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
   - Also the way out for every game: Home or Esc goes to the games page
     (see "Home or Esc" below).
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

  // A phone keeps the game's own type sizes when it turns on its side (iOS
  // Safari otherwise enlarges text in landscape, and labels outgrow the
  // boxes they were sized for).
  (function injectTextSize() {
    if (document.getElementById("gs-text-size")) return;
    var st = document.createElement("style");
    st.id = "gs-text-size";
    st.textContent = "html{-webkit-text-size-adjust:100%;text-size-adjust:100%}";
    (document.head || document.documentElement).appendChild(st);
  })();

  // Hover / active / focus feedback for the back + Visual FX buttons: mirrors the
  // game-card lift on the main page. Injected once; theme-agnostic (works on every game).
  (function injectHover() {
    if (document.getElementById("rm-hover-style")) return;
    var st = document.createElement("style");
    st.id = "rm-hover-style";
    st.textContent =
      ".nav-back-games,.rm-toggle{transition:filter .15s ease,outline-color .15s ease,opacity .15s ease;outline:2px solid transparent;outline-offset:2px}" +
      // Flat buttons: a subtle ring + brightness on hover.
      ".nav-back-games:hover,.rm-toggle:hover{filter:brightness(1.14);outline-color:currentColor}" +
      // 3D / glow buttons (have their own shadow): no ring (it clashes), just energize.
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
  // devices (no hover), where there's no keyboard to press them on, and
  // text in <span class="gs-touch"> shows only there: hint text pairs the two,
  // <span class="gs-keys">press <kbd>Space</kbd></span><span class="gs-touch">tap</span>
  // to start (GameShell.touchOnly() and drawKeys' `touch` do it on a canvas).
  (function injectKeycaps() {
    if (document.getElementById("gs-kbd-style")) return;
    var st = document.createElement("style");
    st.id = "gs-kbd-style";
    st.textContent =
      // (the padding leans by --gs-kcap, so the letters sit in the middle of
      // the cap, see capsCentred; a lean past the padding is taken from the
      // line instead, so the cap is as tall whatever the face)
      ":where(.gs-kbd){display:inline-block;box-sizing:border-box;min-width:1.6em;margin:0 .06em;" +
      "padding:calc(max(.11em,calc(var(--gs-kcap,var(--gs-cap,0)) * 1em),calc(var(--gs-kcap,var(--gs-cap,0)) * -1em)) + var(--gs-kcap,var(--gs-cap,0)) * 1em) .4em calc(max(.11em,calc(var(--gs-kcap,var(--gs-cap,0)) * 1em),calc(var(--gs-kcap,var(--gs-cap,0)) * -1em)) - var(--gs-kcap,var(--gs-cap,0)) * 1em);" +
      "font-family:inherit;font-size:.8em;font-weight:700;font-style:normal;line-height:calc(1.15em - 2 * (max(.11em,calc(var(--gs-kcap,var(--gs-cap,0)) * 1em),calc(var(--gs-kcap,var(--gs-cap,0)) * -1em)) - .11em));text-align:center;" +
      "vertical-align:.06em;white-space:nowrap;color:inherit;" +
      "background:rgba(128,128,128,.16);background:color-mix(in srgb,currentColor 13%,transparent);" +
      "border:1px solid;border-color:color-mix(in srgb,currentColor 50%,transparent);border-bottom-width:2px;border-radius:.3em}" +
      ".rm-toggle .gs-kbd,.mute-toggle .gs-kbd,.gs-pause-btn .gs-kbd,.nav-back-games .gs-kbd{margin-top:-.6em;margin-bottom:-.6em}" +
      // the same keycap on a menu option that GameShell.menuKeys gave a key:
      // drawn from the attribute, so the button's own text and children stay
      // as the game wrote them
      "[data-gs-key]::after{content:attr(data-gs-key);display:inline-block;box-sizing:border-box;min-width:1.6em;margin:-.6em 0 -.6em .5em;" +
      "padding:calc(max(.11em,calc(var(--gs-kcap,var(--gs-cap,0)) * 1em),calc(var(--gs-kcap,var(--gs-cap,0)) * -1em)) + var(--gs-kcap,var(--gs-cap,0)) * 1em) .4em calc(max(.11em,calc(var(--gs-kcap,var(--gs-cap,0)) * 1em),calc(var(--gs-kcap,var(--gs-cap,0)) * -1em)) - var(--gs-kcap,var(--gs-cap,0)) * 1em);" +
      "font:inherit;font-size:.8em;font-weight:700;font-style:normal;line-height:calc(1.15em - 2 * (max(.11em,calc(var(--gs-kcap,var(--gs-cap,0)) * 1em),calc(var(--gs-kcap,var(--gs-cap,0)) * -1em)) - .11em));text-align:center;" +
      "vertical-align:.06em;white-space:nowrap;text-transform:none;letter-spacing:normal;text-shadow:none;" +
      "background:rgba(128,128,128,.16);background:color-mix(in srgb,currentColor 13%,transparent);" +
      "border:1px solid;border-color:color-mix(in srgb,currentColor 50%,transparent);border-bottom-width:2px;border-radius:.3em}" +
      // a menu row where a key picks and Enter starts (menuKeys' `pick`): the
      // picked button's ring. Only where there's a keyboard: on a touch screen
      // every button starts at a tap, so none is "the picked one". (A game
      // sets --gs-pick where the text colour wouldn't show against the page.)
      "@media not all and (hover:none){:where([data-gs-pick]){outline:2px solid var(--gs-pick,currentColor);outline-offset:3px}}" +
      "@media (hover:none){.gs-keys{display:none}[data-gs-key]::after{display:none}}" +
      "@media not all and (hover:none){.gs-touch{display:none}}";
    (document.head || document.documentElement).appendChild(st);
  })();

  // The corner icons' shapes, by the emoji each stands for: [class, mask].
  // Plain paths on a 24-unit square; only their outline matters (the fill is
  // the button's text colour).
  function shape(box, paths) {
    return "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='" + box + "'%3E" + paths + '%3C/svg%3E")';
  }
  function icon(paths) { return shape("0 0 24 24", paths); }
  var SPEAKER = "%3Cpath d='M3 9h4l5-4.2v14.4L7 15H3z'/%3E";
  var LINE = " fill='none' stroke='%23000' stroke-width='2.2' stroke-linecap='round'/%3E";
  var ICONS = {
    "✨": ["fx", icon("%3Cpath d='M9.5 4l1.9 5.6L17 11.5l-5.6 1.9L9.5 19l-1.9-5.6L2 11.5l5.6-1.9zM18.5 2l.95 2.55L22 5.5l-2.55.95L18.5 9l-.95-2.55L15 5.5l2.55-.95zM18 15l.8 2.2 2.2.8-2.2.8L18 21l-.8-2.2-2.2-.8 2.2-.8z'/%3E")],
    "🔊": ["on", icon(SPEAKER + "%3Cpath d='M15.5 8.6a4.6 4.6 0 0 1 0 6.8M18.3 5.8a8.6 8.6 0 0 1 0 12.4'" + LINE)],
    "🔇": ["off", icon(SPEAKER + "%3Cpath d='M16 9l6 6M22 9l-6 6'" + LINE)],
    // (the ⏸ button's two: a phone draws them as blue emoji, a computer as plain marks)
    "⏸": ["pause", icon("%3Cpath d='M6.5 5h4v14h-4zM13.5 5h4v14h-4z'/%3E")],
    "▶": ["play", icon("%3Cpath d='M7.5 4.5l11.5 7.5-11.5 7.5z'/%3E")]
  };

  // ---- the corner row ----------------------------------------------------
  // The ⏸, 🔊 and ✨ buttons share one row at the top right, lined up with
  // the game's "← Games" link: its top, its height, and its distance from
  // the edge of the page (mirrored). The link keeps the look each game gave
  // it; the buttons take their measure from it (syncRow). The row is a flex
  // box, so the buttons space themselves whichever script adds them, in the
  // order ⏸ 🔊 ✨, and stay packed when a web font arrives late.
  // A button whose label changes (on / off, 🔊 / 🔇, Pause / Resume) stays as
  // wide as its longer label, so pressing it never moves anything: the label
  // not showing rides along unseen in the same grid cell (.gs-swap; it's a
  // pseudo-element, so the button's text is just the label that shows).
  (function injectRow() {
    if (document.getElementById("gs-row-style")) return;
    var st = document.createElement("style");
    st.id = "gs-row-style";
    st.textContent =
      ".gs-corner{position:fixed;top:var(--gs-row-top,12px);right:var(--gs-row-edge,12px);height:var(--gs-row-h,32px);z-index:99999;" +
      "display:flex;align-items:stretch;gap:8px;margin:0;padding:0;pointer-events:none}" +
      ".gs-corner>button{position:static!important;order:3;flex:none;pointer-events:auto;box-sizing:border-box!important;" +
      "height:auto!important;min-height:0!important;min-width:0!important;margin:0!important;padding-top:0!important;padding-bottom:0!important;" +
      "display:inline-flex!important;align-items:center;justify-content:center;gap:.45em;" +
      "font-size:13px!important;line-height:1!important;letter-spacing:normal;text-transform:none;white-space:nowrap;" +
      "-webkit-tap-highlight-color:transparent}" +
      ".gs-corner>.gs-pause-btn{order:1}.gs-corner>.mute-toggle{order:2}" +
      ".gs-swap{display:inline-grid;text-align:left}.gs-swap>span,.gs-swap::after{grid-area:1/1}" +
      // the label's letters moved to the middle of the button (by --gs-cap,
      // see capsCentred), its icon left where it was
      ".gs-corner>button>.gs-swap,.nav-back-games>.gs-back-text{position:relative;top:calc(var(--gs-cap,0) * 1em)}" +
      ".gs-corner>button>.gs-swap .gs-ico{top:calc(var(--gs-cap,0) * -1em)}" +
      ".gs-swap::after{content:attr(data-alt);visibility:hidden}" +
      // The buttons' icons (✨, the speaker, ⏸ and ▶) are drawn flat, in the
      // colour of the button's own text (the game's ink): as emoji they
      // ignored every game's palette, and each phone and computer draws them
      // its own way. Each is a shape of its own (ICONS above) laid over the
      // emoji as a mask and filled with the text colour, at one size, so it
      // is the same in every browser. The emoji stays in the label, unseen:
      // it holds the icon's room (so nothing moves when a label changes) and
      // keeps the button's text as it was. <html data-corner-icons="color">
      // keeps the emoji as they are, and so does a browser with no CSS masks.
      "@supports ((-webkit-mask-image:none) or (mask-image:none)){" +
      'html:not([data-corner-icons="color"]) .gs-corner .gs-ico{position:relative;display:inline-block}' +
      'html:not([data-corner-icons="color"]) .gs-corner .gs-ico>span{visibility:hidden}' +
      'html:not([data-corner-icons="color"]) .gs-corner .gs-ico::before{content:"";position:absolute;left:50%;top:50%;width:1.25em;height:1.25em;margin:-.625em 0 0 -.625em;' +
      "background:currentColor;-webkit-mask:var(--gs-ico) center/contain no-repeat;mask:var(--gs-ico) center/contain no-repeat}" +
      Object.keys(ICONS).map(function (k) { return ".gs-ico-" + ICONS[k][0] + "{--gs-ico:" + ICONS[k][1] + "}"; }).join("") +
      "}";
    (document.head || document.documentElement).appendChild(st);
  })();
  function row() {
    var el = document.querySelector(".gs-corner");
    if (!el) {
      el = document.createElement("div");
      el.className = "gs-corner";
      document.body.appendChild(el);
    }
    return el;
  }
  // `now` is the label showing, `alt` the one it turns into when pressed.
  // A label's icon is wrapped (.gs-ico) so its shape can be drawn over it;
  // the unseen `alt` stays plain text, which is as wide.
  function swap(now, alt) {
    var label = now.replace(/^(✨|🔊|🔇|⏸|▶)/, function (e) { return '<span class="gs-ico gs-ico-' + ICONS[e][0] + '"><span>' + e + "</span></span>"; });
    return '<span class="gs-swap" data-alt="' + alt + '"><span>' + label + "</span></span>";
  }
  // the row's top, height and edge distance, read from the "← Games" link
  // (offsetHeight, so a tilted link still gives its own height)
  function syncRow() {
    var back = document.querySelector(".nav-back-games");
    if (!back) return;
    var cs = getComputedStyle(back), root = document.documentElement.style;
    if (cs.position !== "fixed" || !back.offsetHeight) return;
    if (parseFloat(cs.top) >= 0) root.setProperty("--gs-row-top", cs.top);
    if (parseFloat(cs.left) >= 0) root.setProperty("--gs-row-edge", cs.left);
    root.setProperty("--gs-row-h", back.offsetHeight + "px");
  }
  // On a narrow screen the row can run into the "← Games" link (a wide link
  // on a small phone). The ✨ button then says "FX" for "Visual FX", and if
  // that's still too wide just "✨" (dimmed when off, as ever): `tight` is 0,
  // 1 or 2. It's worked out afresh, longest label first, whenever the window,
  // the link or the row changes size, so the long label comes back when it fits.
  var tight = 0, fitting = false;
  function fit() {
    var back = document.querySelector(".nav-back-games"), r = document.querySelector(".gs-corner");
    if (!btn || !back || !r || fitting) return;
    fitting = true;
    for (tight = 0; tight < 3; tight++) {
      render();
      if (r.getBoundingClientRect().left >= back.getBoundingClientRect().right + 6) break;
    }
    if (tight > 2) tight = 2;
    fitting = false;
  }
  // for the sound button (mute-toggle.js) and the ⏸ button (game-shell.js)
  window.GSCorner = { row: row, swap: swap };

  // ---- marks drawn the same on every device -------------------------------
  // The arrows and marks a game's own face doesn't have (the "← Games"
  // arrow, a touch pad's ◀ ▶ ▲ ▼, a ⟳ or ⌫ button) come from whatever
  // symbol face the device has: Segoe UI Symbol, Cambria Math or Arial on a
  // Windows computer, others on a phone, some of which draw them as colour
  // emoji. Each face puts the mark at its own height and size: they sat up to
  // 6px off the middle of their buttons on a computer and somewhere else again
  // on a phone, and in a line of normal height the stand-in face stretched the
  // line, moving the words beside the mark as well. So these are shapes of
  // their own, filled with the text colour like the corner icons:
  // - a button whose whole label is one of these marks keeps the character
  //   (unseen, it still names the button and holds its room), and the shape
  //   is laid over the middle of the button;
  // - the "← Games" arrow is a shape in place of the character, as wide on
  //   every device, centred on the capitals of the word after it;
  // - a mark beside words in a button or link ("↻ Restart", "☰ Menu",
  //   "Pop ✓", "Game ▾") is a shape in the line, as wide on every device,
  //   its middle on the capitals' middle; the character stays inside it,
  //   unseen, so the label reads (and is read out) as before.
  // [class, width, height (em), shape]; a browser with no CSS masks keeps the
  // characters.
  // (a ring open at the top right, its arrowhead at the top going clockwise)
  var TURN = "%3Cpath d='M18.13 6.86A8 8 0 1 1 11.5 4' fill='none' stroke='%23000' stroke-width='2.2' stroke-linecap='round'/%3E%3Cpath d='M16.5 4L10.8 .6V7.4z'/%3E";
  var UNDO = "M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z";
  var MARKS = {
    "◀": ["left", 0.72, 0.8, shape("0 0 72 80", "%3Cpath d='M72 0V80L0 40z'/%3E")],
    "▶": ["right", 0.72, 0.8, shape("0 0 72 80", "%3Cpath d='M0 0V80L72 40z'/%3E")],
    "▲": ["up", 0.8, 0.72, shape("0 0 80 72", "%3Cpath d='M0 72H80L40 0z'/%3E")],
    "▼": ["down", 0.8, 0.72, shape("0 0 80 72", "%3Cpath d='M0 0H80L40 72z'/%3E")],
    "▽": ["down-open", 0.8, 0.72, shape("0 0 80 72", "%3Cpath d='M6 4.5H74L40 64z' fill='none' stroke='%23000' stroke-width='8' stroke-linejoin='round'/%3E")],
    "●": ["dot", 0.5, 0.5, shape("0 0 2 2", "%3Ccircle cx='1' cy='1' r='1'/%3E")],
    "⊞": ["hold", 0.82, 0.82, shape("0 0 20 20", "%3Cpath d='M1 1H19V19H1zM10 1V19M1 10H19' fill='none' stroke='%23000' stroke-width='2'/%3E")],
    "↻": ["cw", 0.76, 0.9, shape("3 0 18 21.5", TURN)],
    "↺": ["ccw", 0.76, 0.9, shape("3 0 18 21.5", "%3Cg transform='matrix(-1 0 0 1 24 0)'%3E" + TURN + "%3C/g%3E")],
    "↶": ["undo", 0.8, 0.35, shape("2 7 20.5 9", "%3Cpath d='" + UNDO + "'/%3E")],
    "↷": ["redo", 0.8, 0.35, shape("1.5 7 20.5 9", "%3Cpath transform='matrix(-1 0 0 1 24 0)' d='" + UNDO + "'/%3E")],
    "⌫": ["erase", 1.13, 0.85, shape("0 3 24 18", "%3Cpath d='M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H7.07L2.4 12l4.66-7H22v14zm-11.59-2L14 13.41 17.59 17 19 15.59 15.41 12 19 8.41 17.59 7 14 10.59 10.41 7 9 8.41 12.59 12 9 15.59z'/%3E")]
  };
  MARKS["⟳"] = MARKS["↻"];
  // The marks beside words, a size down to sit with the letters: [class,
  // width, height (em), shape]; the tick and the three bars are drawn as
  // heavy as the words' own strokes (wordShape: a display face can be heavy
  // at a plain weight, so the stroke is measured from its letters)
  var WORD_MARKS = {
    "▶": ["right", 0.63, 0.7, MARKS["▶"][3]],
    "◀": ["left", 0.63, 0.7, MARKS["◀"][3]],
    "▸": ["right-small", 0.42, 0.47, MARKS["▶"][3]],
    "◂": ["left-small", 0.42, 0.47, MARKS["◀"][3]],
    "▾": ["down", 0.5, 0.45, MARKS["▼"][3]],
    "↻": ["cw", 0.72, 0.86, MARKS["↻"][3]],
    "↺": ["ccw", 0.72, 0.86, MARKS["↺"][3]],
    "↶": ["undo", 0.8, 0.35, MARKS["↶"][3]],
    "↷": ["redo", 0.8, 0.35, MARKS["↷"][3]],
    "☰": ["menu", 0.72, 0.61, null],
    "✓": ["tick", 0.8, 0.63, null]
  };
  WORD_MARKS["⟳"] = WORD_MARKS["↻"];
  var WORD_RE = /[▶◀▸◂▾↻⟳↺↶↷☰✓][︎️]?/;
  // (stem: the face's upright stroke, in em; the tick is 0.8em across 24
  // units, the bars 0.72em across 20, and each takes 0.9 of the stem)
  function wordShape(ch, stem) {
    if (ch === "✓") return shape("0 0 24 19", "%3Cpath d='M2.5 10L9 16.5L21.5 2.5' fill='none' stroke='%23000' stroke-width='" +
      Math.max(2.2, Math.min(5, stem * 0.9 * 24 / 0.8)).toFixed(2) + "' stroke-linecap='round' stroke-linejoin='round'/%3E");
    var bh = Math.max(2, Math.min(4.4, stem * 0.9 * 20 / 0.72));
    var h = bh.toFixed(2), r = (bh / 2).toFixed(2), mid = ((17 - bh) / 2).toFixed(2), low = (17 - bh).toFixed(2);
    return shape("0 0 20 17", [0, mid, low].map(function (y) { return "%3Crect y='" + y + "' width='20' height='" + h + "' rx='" + r + "'/%3E"; }).join(""));
  }
  // (window.CSS: the CSS here is the FX-off rules above)
  var MASKS = !!(window.CSS && window.CSS.supports && (window.CSS.supports("mask-image", "none") || window.CSS.supports("-webkit-mask-image", "none")));
  (function injectMarks() {
    if (!MASKS || document.getElementById("gs-mark-style")) return;
    var st = document.createElement("style");
    st.id = "gs-mark-style";
    var fill = "background:currentColor;-webkit-mask:var(--gs-ico) center/contain no-repeat;mask:var(--gs-ico) center/contain no-repeat}";
    st.textContent =
      // (the button holds the shape; a game that places the button itself keeps its own position)
      ":where(.gs-mark-host){position:relative}" +
      ".gs-mark>span{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}" +
      ".gs-mark::before{content:'';position:absolute;left:50%;top:50%;pointer-events:none;" + fill +
      Object.keys(MARKS).map(function (k) {
        var m = MARKS[k];
        return ".gs-mark-" + m[0] + "::before{width:" + m[1] + "em;height:" + m[2] + "em;margin:" + (-m[2] / 2) + "em 0 0 " + (-m[1] / 2) + "em;--gs-ico:" + m[3] + "}";
      }).join("") +
      // (lifted to the capitals' middle by arrowLift; .14em until it's measured)
      ".gs-back-arrow{display:inline-block;width:.85em;height:.425em;vertical-align:.14em;" + fill +
      // a mark beside words: its box, a little room either side as a face
      // gives its marks, the character in it at no size (lifted to the
      // capitals' middle by symLift; .05em until it's measured)
      ".gs-sym{display:inline-block!important;position:relative!important;overflow:hidden!important;margin:0 .09em!important;padding:0!important;" +
      "border:0!important;background:none!important;font-size:inherit!important;vertical-align:.05em}" +
      ".gs-sym>span{font-size:0!important;line-height:0!important}" +
      ".gs-sym::before{content:'';position:absolute;inset:0;pointer-events:none;" + fill +
      Object.keys(WORD_MARKS).map(function (k) {
        var m = WORD_MARKS[k];
        return ".gs-sym-" + m[0] + "{width:" + m[1] + "em!important;height:" + m[2] + "em!important" + (m[3] ? ";--gs-ico:" + m[3] : "") + "}";
      }).join("");
    (document.head || document.documentElement).appendChild(st);
  })();
  function markButton(b) {
    var n = b && b.firstChild;
    if (!MASKS || !n || n !== b.lastChild || n.nodeType !== 3 || b.closest(".gs-corner")) return;
    var m = MARKS[n.textContent.trim()];
    if (!m) return;
    var outer = document.createElement("span"), inner = document.createElement("span");
    outer.className = "gs-mark gs-mark-" + m[0];
    b.classList.add("gs-mark-host");
    b.insertBefore(outer, n);
    outer.appendChild(inner);
    inner.appendChild(n);
  }
  function markAll(root) {
    var bs = root.querySelectorAll("button");
    for (var i = 0; i < bs.length; i++) markButton(bs[i]);
    markWords(root);
    steadyLines(root);
  }
  // the marks beside words in the labels in root (root itself too)
  var LABELS = "button,a,[role=button],summary";
  function markWords(root) {
    if (!MASKS || !root || !root.querySelectorAll) return;
    var hosts = Array.prototype.slice.call(root.querySelectorAll(LABELS));
    if (root.matches && root.matches(LABELS)) hosts.push(root);
    hosts.forEach(function (h) {
      // (a lone mark is markButton's; the corner row and "← Games" have their own)
      if (!WORD_RE.test(h.textContent) || !/[A-Za-z0-9]/.test(h.textContent) || h.closest(".gs-corner,.nav-back-games") || h.isContentEditable) return;
      var walk = document.createTreeWalker(h, NodeFilter.SHOW_TEXT), found = [], n;
      while ((n = walk.nextNode())) if (WORD_RE.test(n.data) && !n.parentElement.closest(".gs-sym,.gs-mark,kbd,.gs-kbd,svg,script,style")) found.push(n);
      found.forEach(markText);
    });
  }
  function markText(n) {
    var d = getComputedStyle(n.parentElement).display;
    // (in a flex or grid box each run of text is an item of its own, and the
    // space between a mark and its word would be lost at the item's edge: the
    // whole run goes in one box first)
    if (/flex|grid/.test(d)) {
      var run = document.createElement("span");
      run.className = "gs-words";
      n.parentNode.insertBefore(run, n);
      run.appendChild(n);
    }
    var m;
    while (n && (m = WORD_RE.exec(n.data))) {
      var ch = n.splitText(m.index), rest = ch.splitText(m[0].length), w = WORD_MARKS[m[0].charAt(0)];
      var box = document.createElement("span"), inner = document.createElement("span");
      box.className = "gs-sym gs-sym-" + w[0];
      ch.parentNode.insertBefore(box, ch);
      box.appendChild(inner);
      inner.appendChild(ch);
      symLift(box);
      n = rest;
    }
  }
  // A mark's middle on the capitals' middle: their height measured from the
  // face's own letters (as the "← Games" arrow's), and the tick's and bars'
  // weight from its stroke, again once a web font arrives
  var capHOf = {}, stemOf = {};
  function symLift(box) {
    try {
      var cs = getComputedStyle(box), key = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontFamily, h = parseFloat(cs.height) / parseFloat(cs.fontSize);
      if (!(key in capHOf)) {
        capCtx = capCtx || document.createElement("canvas").getContext("2d");
        capCtx.font = cs.fontStyle + " " + cs.fontWeight + " 100px " + cs.fontFamily;
        var cap = capCtx.measureText("H").actualBoundingBoxAscent / 100;
        capHOf[key] = cap > 0.3 && cap < 1.2 ? cap : 0;
      }
      if (capHOf[key] && h > 0) box.style.verticalAlign = ((capHOf[key] - h) / 2).toFixed(3) + "em";
      var ch = box.textContent.charAt(0);
      if (!WORD_MARKS[ch][3]) box.style.setProperty("--gs-ico", wordShape(ch, stem(cs, key)));
    } catch (e) {}
  }
  // the face's upright stroke: the ink across an "l" halfway up its stem
  function stem(cs, key) {
    if (key in stemOf) return stemOf[key];
    var s = 0;
    try {
      var c = document.createElement("canvas");
      c.width = 160; c.height = 1;
      var x = c.getContext("2d");
      x.font = cs.fontStyle + " " + cs.fontWeight + " 100px " + cs.fontFamily;
      x.fillText("l", 40, 40);
      var row = x.getImageData(0, 0, 160, 1).data;
      for (var i = 3; i < row.length; i += 4) s += row[i] / 255;
      s /= 100;
    } catch (e) {}
    // (a face that hides its letters from the canvas: a plain regular stroke)
    return (stemOf[key] = s > 0.03 && s < 0.3 ? s : 0.09);
  }
  function symLiftAll() {
    capHOf = {}; stemOf = {};
    var all = document.querySelectorAll(".gs-sym");
    for (var i = 0; i < all.length; i++) symLift(all[i]);
  }
  // A line of normal height is as tall as the tallest face in it, and an
  // emoji or a mark the game's face lacks brings in the device's own face
  // for it, with its own height: Segoe UI Emoji's on Windows, Apple Color
  // Emoji's on an iPhone. So "💡 Hint", "↻ Reset" and the like were taller
  // buttons, their words pushed down, by a different amount on each device.
  // Where such a character sits in a line of normal height, the line takes
  // the height the element's own face gives it (measured from that face's
  // letters), the same on every device; the character still shows as the
  // device draws it.
  var LENT = /[←-⏿■-➿⟰-⟿⤀-⥿⬀-⯿　-鿿️＀-￯]|[\uD83C-\uD83E][\uDC00-\uDFFF]/;
  var lineOf = {}, steadied = [];
  function faceLine(cs) {
    var key = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontFamily;
    if (key in lineOf) return lineOf[key];
    var probe = document.createElement("span"), h = 0;
    probe.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;line-height:normal;font-size:100px;" +
      "font-style:" + cs.fontStyle + ";font-weight:" + cs.fontWeight + ";font-family:" + cs.fontFamily;
    probe.textContent = "Hg";
    document.body.appendChild(probe);
    h = probe.getBoundingClientRect().height / 100;
    document.body.removeChild(probe);
    return (lineOf[key] = h > 0.5 && h < 3 ? Math.round(h * 1000) / 1000 : 0);
  }
  // (again: measured afresh, unless the game has set a line height of its own since)
  function steady(el, again) {
    if (again ? el.style.lineHeight !== el.gsLine : getComputedStyle(el).lineHeight !== "normal") return;
    var h = faceLine(getComputedStyle(el));
    if (!again) steadied.push(el);
    el.gsLine = h ? String(h) : "";
    el.style.lineHeight = el.gsLine;
  }
  function steadyLines(root) {
    if (!document.body || !root) return;
    var walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n;
    while ((n = walk.nextNode())) {
      var el = n.parentElement;
      if (el && el.gsLine === undefined && el instanceof HTMLElement && LENT.test(n.data) && !el.closest("script,style")) steady(el);
    }
  }
  // (a web font in: its own line height, measured afresh)
  function steadyAgain() {
    lineOf = {};
    steadied.forEach(function (el) { steady(el, true); });
  }
  // the "← Games" arrow, its line as heavy as the words' strokes
  function markBackArrow(label) {
    var n = label.firstChild;
    if (!MASKS || !n || n.nodeType !== 3 || !/^\s*←/.test(n.textContent)) return;
    var wt = parseInt(getComputedStyle(label).fontWeight, 10) || 400, sw = wt >= 800 ? 2.4 : wt >= 600 ? 2 : 1.6;
    var a = document.createElement("span");
    a.className = "gs-back-arrow";
    a.setAttribute("aria-hidden", "true");
    a.style.setProperty("--gs-ico", shape("0 0 20 10", "%3Cpath d='M18.6 5H1.6M6 1.4L1.6 5L6 8.6' fill='none' stroke='%23000' stroke-width='" + sw +
      "' stroke-linecap='round' stroke-linejoin='round'/%3E"));
    n.textContent = n.textContent.replace(/^\s*←/, "");
    label.insertBefore(a, n);
    arrowLift();
  }
  // The arrow's middle on the capitals' middle: their height measured from
  // the face's own letters (some faces state it wrongly: Special Elite's
  // says half what its capitals are), again once a web font arrives.
  function arrowLift() {
    var a = document.querySelector(".gs-back-arrow");
    if (!a) return;
    try {
      var cs = getComputedStyle(a);
      capCtx = capCtx || document.createElement("canvas").getContext("2d");
      capCtx.font = cs.fontStyle + " " + cs.fontWeight + " 100px " + cs.fontFamily;
      var cap = capCtx.measureText("H").actualBoundingBoxAscent / 100;
      if (cap > 0.3 && cap < 1.2) a.style.verticalAlign = ((cap - 0.425) / 2).toFixed(3) + "em";
    } catch (e) {}
  }

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
  // Home leaves for the games list from anywhere in a game, and so does Esc:
  // it is the way out, not a pause key (P pauses, or the ⏸ button where no
  // letter is free). Mid-game it asks "Leave this game?" first, and Esc
  // again leaves (game-shell.js). The one Esc that stays is one the game
  // acted on: closing a panel or stepping back out of a sub-screen. Every
  // game marks such an Esc by calling preventDefault(), so this needs no idea
  // which screen is up; it
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
    back.title = "Back to the games: Home or Esc";
    var cap = back.querySelector(".gs-back-key"), wide = window.innerWidth >= 1200;
    if (wide && !cap) {
      cap = document.createElement("span");
      cap.className = "gs-keys gs-back-key";
      cap.innerHTML = ' <kbd class="gs-kbd">Home</kbd>';
      back.appendChild(cap);
    } else if (!wide && cap) back.removeChild(cap);
    centreKey();
  }
  // That keycap sits on the link's line of text, so how high it rode depended
  // on the game's font: up to 3px low (Science Fair, Dead End), where the caps
  // in the ⏸ 🔊 ✨ buttons, flex boxes all, are dead centre. So it is measured
  // and moved to the middle of the link, as theirs are. Moved, not laid out
  // again: the link keeps its size, and the row that copies it its place.
  function centreKey() {
    var back = document.querySelector(".nav-back-games");
    var k = back && back.querySelector(".gs-back-key .gs-kbd");
    if (!k) return;
    k.style.position = "relative";
    k.style.top = "0px";
    if (!k.offsetHeight) return;   // (not shown: a touch screen has no keys)
    var tf = getComputedStyle(back).transform, d;
    if (!tf || tf === "none") {
      var b = back.getBoundingClientRect(), r = k.getBoundingClientRect();
      d = (r.top + r.height / 2) - (b.top + b.height / 2);
    } else d = (k.offsetTop + k.offsetHeight / 2) - back.clientHeight / 2;   // (a tilted link: its own layout numbers)
    k.style.top = (-d).toFixed(2) + "px";
  }

  // ---- letters in the middle, top to bottom --------------------------------
  // A typeface puts its letters where its designer chose in the line, and
  // some ride well above the middle (Darkroom's typewriter, 3 to 4px in a
  // keycap) or below it. In a keycap, or the label of a button that centres
  // its line, that shows. --gs-cap is how far (in em, + = down) a face's
  // capitals sit from the middle of their line, measured from the face
  // itself; the keycaps lean their padding by it and the corner buttons'
  // labels (and the "← Games" link's) move by it, the boxes keeping their
  // size. Worked out for each face in use, again once a web font arrives.
  var CAP_SEL = ".gs-kbd,[data-gs-key],.gs-corner>button,.nav-back-games,.gs-pause-card button,.gs-pause-more button";
  var capOf = {}, capCtx = null, rootCap = null;
  // (weight: measure el's face at that weight instead of its own: a keycap
  // drawn from the attribute, ::after, is the button's face in bold)
  function capShift(el, weight) {
    var cs = getComputedStyle(el), fw = weight || cs.fontWeight, key = cs.fontStyle + " " + fw + " " + cs.fontFamily;
    if (key in capOf) return capOf[key];
    cs = { fontStyle: cs.fontStyle, fontWeight: fw, fontFamily: cs.fontFamily };
    var s = 0;
    try {
      capCtx = capCtx || document.createElement("canvas").getContext("2d");
      capCtx.font = cs.fontStyle + " " + cs.fontWeight + " 100px " + cs.fontFamily;
      var cap = capCtx.measureText("H").actualBoundingBoxAscent;
      // Where the page itself sets the baseline in a 100px line (line-height
      // 1): a probe line, with a mark of no size sitting on its baseline. The
      // capitals' middle is half their height above it, the line's middle 50
      // down. (The face's own figures, ascent and descent as the canvas
      // reports them, aren't always the ones the page lays a line out by:
      // they put Fredoka's and Segoe UI's letters a pixel off, the wrong way.)
      var probe = document.createElement("div");
      probe.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;padding:0;border:0;margin:0;" +
        "font-style:" + cs.fontStyle + ";font-weight:" + cs.fontWeight + ";font-size:100px;line-height:1;font-family:" + cs.fontFamily;
      probe.innerHTML = 'H<span style="display:inline-block;width:0;height:0;vertical-align:baseline"></span>';
      document.body.appendChild(probe);
      var base = probe.lastChild.getBoundingClientRect().bottom - probe.getBoundingClientRect().top;
      document.body.removeChild(probe);
      if (cap > 0 && base > 0) s = (50 - (base - cap / 2)) / 100;
    } catch (e) {}
    s = Math.max(-0.25, Math.min(0.4, Math.round(s * 1000) / 1000));
    return (capOf[key] = s);
  }
  function capsCentred(els) {
    var root = document.documentElement;
    if (rootCap === null && document.body) { rootCap = capShift(document.body); root.style.setProperty("--gs-cap", String(rootCap)); }
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      // A keycap's lean is --gs-kcap, a label's --gs-cap: a button's label
      // and its keycap can be two weights of the face, which sit differently
      // (they shared one, so the keycap's put Segoe UI's semibold labels a
      // pixel low). Both are kept on the button or link, which the keycap
      // inherits from: the markup inside the button stays as the game wrote it.
      if (el.matches(".gs-kbd")) {
        (el.closest("button, a, summary") || el).style.setProperty("--gs-kcap", String(capShift(el)));
        continue;
      }
      var s = capShift(el);
      if (s === rootCap) el.style.removeProperty("--gs-cap");
      else el.style.setProperty("--gs-cap", String(s));
      // (a keycap drawn from the attribute is the button's face, in bold)
      if (el.hasAttribute("data-gs-key")) el.style.setProperty("--gs-kcap", String(capShift(el, "700")));
    }
  }
  function capsAll() { capsCentred(document.querySelectorAll(CAP_SEL)); }
  function capsWatch() {
    // the "← Games" link's words, in a box of their own so they can move
    var back = document.querySelector(".nav-back-games");
    if (back && !back.querySelector(".gs-back-text")) {
      for (var n = back.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.textContent.trim()) {
        var sp = document.createElement("span");
        sp.className = "gs-back-text";
        back.insertBefore(sp, n); sp.appendChild(n);
        markBackArrow(sp);
        break;
      }
    }
    capsAll();
    markAll(document);
    // keycaps come and go (menus re-drawn, the pause card, a dialog): each
    // batch of new ones is measured as it lands, and so is a button that
    // takes a mark for its label
    if (window.MutationObserver) new MutationObserver(function (list) {
      var found = [];
      list.forEach(function (m) {
        if (m.type === "attributes") { found.push(m.target); return; }
        if (m.target.nodeType === 1 && m.target.tagName === "BUTTON") markButton(m.target);
        // (a label's words rewritten: its marks drawn again)
        if (m.target.nodeType === 1 && m.target.closest) markWords(m.target.closest(LABELS));
        m.addedNodes.forEach(function (nd) {
          if (nd.nodeType !== 1) return;
          if (nd.matches(CAP_SEL)) found.push(nd);
          var inner = nd.querySelectorAll(CAP_SEL);
          for (var j = 0; j < inner.length; j++) found.push(inner[j]);
          if (nd.tagName === "BUTTON") markButton(nd);
          markAll(nd);
        });
      });
      if (found.length) capsCentred(found);
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-gs-key"] });
    // a web font in: the faces are measured afresh
    if (document.fonts && document.fonts.addEventListener)
      document.fonts.addEventListener("loadingdone", function () { capOf = {}; rootCap = null; capsAll(); arrowLift(); symLiftAll(); steadyAgain(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { capOf = {}; rootCap = null; capsAll(); arrowLift(); symLiftAll(); steadyAgain(); });
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
    btn.title = "Toggle visual effects for this game (shake, flash, glow, animations): " + (lettersOn() ? "V or ]" : "]");
    var words = tight === 2 ? ["✨", "✨"] : tight === 1 ? ["✨ FX: on", "✨ FX: off"] : ["✨ Visual FX: on", "✨ Visual FX: off"];
    var html = swap(words[r ? 1 : 0], words[r ? 0 : 1]) +
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
    // (where it sits and how tall it is come from the corner row's styles)
    btn.style.cssText = "cursor:pointer;font-weight:700;border-radius:8px;padding:0 12px;";

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

    var corner = row();
    corner.appendChild(btn);
    markBack();
    syncRow();
    fit();
    capsWatch();
    window.addEventListener("resize", function () { render(); markBack(); syncRow(); fit(); });
    // the link's size can change after this runs (its web font arriving), and
    // so can the row's (the sound and ⏸ buttons joining it). The row is fitted
    // again on the next frame, not inside the observer's own call: fitting it
    // resizes what the observer watches, and a size changed there makes the
    // browser report a loop (an error event; Safari logs it).
    if (window.ResizeObserver) {
      var refit = 0;
      var ro = new ResizeObserver(function () {
        if (!refit) refit = requestAnimationFrame(function () { refit = 0; syncRow(); fit(); centreKey(); });
      });
      if (back) ro.observe(back);
      ro.observe(corner);
    }
    // (a font that arrives without changing the link's size still moves its line)
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(centreKey);
  }

  if (document.body) build();
  else document.addEventListener("DOMContentLoaded", build);
})();
