/* =====================================================================
   Shared game shell — small, dependency-free helpers that every game can
   use, so the same three problems stop being re-solved 27 times.

   Include in <head> alongside the other shared scripts:
     <script src="../motion-toggle.js"></script>
     <script src="../mute-toggle.js"></script>
     <script src="../game-shell.js"></script>

   Injects no DOM and touches no styles — it only defines window.GameShell,
   so adding the tag to a page cannot change how that page looks.

   Deliberately NOT in here: audio. Each game has its own hand-tuned sound
   design built on its own AudioContext; folding those together is a
   separate job with real regression risk. Muting is already global via
   mute-toggle.js, which is the part that actually needed sharing.

     GameShell.store.get(key, fallback)     -> string | fallback
     GameShell.store.getNum(key, fallback)  -> number (NaN-safe)
     GameShell.store.set(key, value)        -> true if it stuck
     GameShell.store.remove(key)
     GameShell.best(key, { higher })        -> { get, submit, key }
     GameShell.onAutoPause(fn)              -> fn() when the tab is hidden
     GameShell.pausable(opts)               -> pause overlay + key + ⏸ button
     GameShell.pauseButton(api)             -> just the ⏸ button, for a game
                                               with its own pause screen
     GameShell.drawKeys(ctx, str, x, y)     -> canvas text with [KEY] drawn
                                               as keycaps
     GameShell.confirm(opts, cb)            -> themed stand-ins for the
     GameShell.alert(opts, cb)                 browser's confirm / alert /
     GameShell.copyBox(opts)                   "copy this" prompt boxes
   ===================================================================== */
(function () {
  "use strict";

  // ---- storage ---------------------------------------------------------
  // Every call is guarded: localStorage throws outright in Safari private
  // mode and when a browser blocks third-party storage, and a game that
  // dies on a high-score read is worse than one that forgets scores.
  var store = {
    get: function (key, fallback) {
      try {
        var v = localStorage.getItem(key);
        return v == null ? fallback : v;
      } catch (e) { return fallback; }
    },
    getNum: function (key, fallback) {
      var n = parseFloat(store.get(key, ""));
      return isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
    },
    set: function (key, value) {
      try { localStorage.setItem(key, String(value)); return true; } catch (e) { return false; }
    },
    remove: function (key) {
      try { localStorage.removeItem(key); } catch (e) {}
    }
  };

  // ---- best score ------------------------------------------------------
  // Wraps the read/compare/write dance ~20 games each hand-roll.
  // `higher: false` for scores where lower wins (reaction time, race time).
  //
  // NOTE: keys are passed through verbatim, never namespaced — the hub's
  // "reset all high scores" button in games/index.html matches on exact key
  // names and prefixes, so silently rewriting them would break it.
  function best(key, opts) {
    var higher = !(opts && opts.higher === false);
    return {
      key: key,
      get: function () { return store.getNum(key, 0); },
      /* Stores `value` only if it beats the stored best.
         Returns true when it was a new record. */
      submit: function (value) {
        if (!isFinite(value)) return false;
        var cur = store.getNum(key, NaN);
        var isFirst = !isFinite(cur);
        if (!isFirst && !(higher ? value > cur : value < cur)) return false;
        store.set(key, value);
        return true;
      }
    };
  }

  // ---- auto-pause ------------------------------------------------------
  // Switching tabs used to leave timers and spawners running, so players
  // came back to a dead run. Games register a PAUSE-ONLY callback here —
  // never a toggle, because returning focus must not silently un-pause a
  // game the player paused on purpose.
  var pauseHandlers = [];
  var firing = false;

  function fireAutoPause() {
    // visibilitychange and blur usually both fire for one tab switch; a
    // microtask guard keeps each handler to one call per event pair.
    if (firing) return;
    firing = true;
    setTimeout(function () { firing = false; }, 0);
    for (var i = 0; i < pauseHandlers.length; i++) {
      try { pauseHandlers[i](); } catch (e) {}
    }
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) fireAutoPause();
  });
  window.addEventListener("blur", fireAutoPause);

  // ---- win/loss record -------------------------------------------------
  // For head-to-head games, where "high score" is meaningless but "how do I
  // do against this opponent" isn't. Mirrors battleship's existing
  // {w,l} JSON blob, plus draws, which board games actually need.
  //
  //   var R = GameShell.record("pong_record");
  //   R.add("w");            // "w" | "l" | "d"
  //   el.textContent = R.text();
  //
  // Keys must also be listed in the hub's reset-scores block in
  // games/index.html, or "reset all high scores" silently misses them.
  function record(key) {
    function read() {
      var r = { w: 0, l: 0, d: 0 };
      try {
        var raw = JSON.parse(store.get(key, "") || "null");
        if (raw && typeof raw === "object") {
          r.w = parseInt(raw.w, 10) || 0;
          r.l = parseInt(raw.l, 10) || 0;
          r.d = parseInt(raw.d, 10) || 0;
        }
      } catch (e) {}
      return r;
    }
    return {
      key: key,
      get: read,
      add: function (outcome) {
        var r = read();
        if (outcome === "w") r.w++;
        else if (outcome === "l") r.l++;
        else if (outcome === "d") r.d++;
        else return r;
        store.set(key, JSON.stringify(r));
        return r;
      },
      /* For games that already keep their own {w,l,d} in memory (tic-tac-toe
         has had the counters and the UI all along — they just never survived
         a reload). Persist whatever the game is already tracking. */
      set: function (r) {
        if (!r) return;
        store.set(key, JSON.stringify({ w: r.w | 0, l: r.l | 0, d: r.d | 0 }));
      },
      reset: function () { store.remove(key); return { w: 0, l: 0, d: 0 }; },
      /* "2 W · 1 L · 3 D" — draws omitted when there are none. */
      text: function () {
        var r = read();
        var s = r.w + " W · " + r.l + " L";
        if (r.d) s += " · " + r.d + " D";
        return s;
      }
    };
  }

  // ---- pause -----------------------------------------------------------
  // Opt-in helper so a game gets pause without hand-rolling the overlay, the
  // keybinding and the auto-pause hook. Only games that CALL this get any
  // DOM — the module itself still injects nothing on load.
  //
  //   var P = GameShell.pausable({
  //     canPause: function () { return state === "play"; },
  //     onChange: function (paused) { ... },   // optional
  //     keys: ["Escape", "p"],                 // optional; default shown
  //     button: false                          // optional: the game shows its own
  //   });                                      //   pause control, so no ⏸ button
  //   ...inside the loop:  if (!P.isPaused()) { update(dt); }
  //
  // `keys` matters: games where the player types (ztype) or remaps controls
  // (osu-mania) must not swallow "p", so they pass ["Escape"] only.
  //
  // It also adds a ⏸ button to the top-right row (see pauseButton below), so
  // a player can see that the game pauses and how.
  //
  // The card takes on the game's look by borrowing its "← Games" link's
  // colours, font, border and shadow, like the Visual FX and sound buttons do.
  // A game can restyle it further in its own CSS (.gs-pause, .gs-pause-card,
  // its h2 / p / button): the defaults are written with :where() so they have
  // no specificity and any plain selector in the game's stylesheet wins.
  var PAUSE_CSS =
    ":where(.gs-pause){position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;" +
    "background:rgba(6,8,12,0.62);font-family:var(--gs-font,system-ui,-apple-system,'Segoe UI',sans-serif)}" +
    ".gs-pause[hidden]{display:none!important}" +
    ":where(.gs-pause-card){background:var(--gs-bg,rgba(22,25,33,0.97));color:var(--gs-fg,#eef0f4);" +
    "border:var(--gs-border,1px solid rgba(255,255,255,0.16));border-radius:var(--gs-radius,14px);box-shadow:var(--gs-shadow,none);" +
    "padding:1.3rem 1.6rem;text-align:center;max-width:min(90vw,330px);" +
    // (a see-through back-link colour would let the game's text show through)
    "-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}" +
    ":where(.gs-pause-card h2){margin:0 0 .2rem;font-size:1.5rem;font-weight:800}" +
    ":where(.gs-pause-card p){margin:0 0 .9rem;font-size:.85rem;opacity:.75}" +
    ":where(.gs-pause-card button){cursor:pointer;min-height:44px;padding:.6rem 1.4rem;border-radius:var(--gs-btn-radius,9px);" +
    "border:var(--gs-border,1px solid rgba(255,255,255,0.22));background:var(--gs-btn-bg,rgba(255,255,255,0.09));color:inherit;" +
    "box-shadow:var(--gs-shadow,none);font-family:inherit;font-size:1rem;font-weight:700;line-height:1;-webkit-tap-highlight-color:transparent}" +
    ":where(.gs-pause-card button:hover){filter:brightness(1.1)}" +
    ".gs-pause-btn{transition:filter .15s ease,opacity .15s ease,outline-color .15s ease;outline:2px solid transparent;outline-offset:2px}" +
    ".gs-pause-btn[aria-disabled=false]:hover{filter:brightness(1.12)}" +
    ".gs-pause-btn:focus-visible{outline-color:currentColor;outline-offset:3px}" +
    // the themed dialogs (GameShell.confirm / alert / copyBox) reuse the card
    ":where(.gs-dialog-card){max-width:min(92vw,380px)}" +
    // a copy box is as wide as it may be, so the text in it wraps less
    ":where(.gs-dialog-copy){box-sizing:border-box;width:min(92vw,380px)}" +
    ":where(.gs-dialog-card p){font-size:.95rem;opacity:.85;white-space:pre-line}" +
    ":where(.gs-dialog-row){display:flex;flex-wrap:wrap;gap:.6rem;justify-content:center}" +
    ":where(.gs-dialog-card .gs-dialog-alt){background:transparent;box-shadow:none}" +
    ":where(.gs-dialog-card textarea){display:block;box-sizing:border-box;width:100%;margin:0 0 .9rem;padding:.55rem .65rem;" +
    "resize:none;font-family:inherit;font-size:.9rem;line-height:1.35;text-align:left;color:inherit;background:rgba(0,0,0,0.22);" +
    "border:var(--gs-border,1px solid rgba(255,255,255,0.22));border-radius:8px;white-space:pre-wrap}";
  function injectPauseCss() {
    if (document.getElementById("gs-pause-style")) return;
    var st = document.createElement("style");
    st.id = "gs-pause-style";
    st.textContent = PAUSE_CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  // The game's "← Games" link, as a set of styles to borrow (null if it has
  // none, or its background is clear: then the neutral look stays). A link
  // painted with only a gradient (Salvo's steel, Slither's bronze, 24's
  // phone shell) lends the gradient.
  function backLinkLook() {
    var back = document.querySelector(".nav-back-games");
    if (!back) return null;
    var cs = getComputedStyle(back);
    var bg = cs.backgroundColor, m = /rgba?\(([^)]+)\)/.exec(bg);
    var alpha = m ? (m[1].split(",")[3] === undefined ? 1 : parseFloat(m[1].split(",")[3])) : 1;
    if (!bg || bg === "transparent" || alpha < 0.5) {
      if (/gradient\(/.test(cs.backgroundImage || "")) bg = cs.backgroundImage;
      else return null;
    }
    return {
      bg: bg,
      fg: cs.color,
      font: cs.fontFamily,
      weight: cs.fontWeight,
      border: cs.borderTopWidth + " " + cs.borderTopStyle + " " + cs.borderTopColor,
      radius: parseFloat(cs.borderTopLeftRadius) || 0,
      shadow: cs.boxShadow && cs.boxShadow !== "none" ? cs.boxShadow : ""
    };
  }

  // Give a card overlay (pause card, dialog) the back link's look
  function applyLook(el) {
    var look = backLinkLook();
    if (!look) return;
    el.style.setProperty("--gs-bg", look.bg);
    el.style.setProperty("--gs-fg", look.fg);
    el.style.setProperty("--gs-font", look.font);
    el.style.setProperty("--gs-border", look.border);
    el.style.setProperty("--gs-radius", Math.min(Math.max(look.radius, 10), 22) + "px");
    el.style.setProperty("--gs-btn-radius", Math.min(Math.max(look.radius, 8), 999) + "px");
    el.style.setProperty("--gs-btn-bg", look.bg);
    if (look.shadow) el.style.setProperty("--gs-shadow", look.shadow);
  }

  // "Esc", "P", "P / Esc" — the keys as a player would read them
  function keyLabel(keys) {
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      var k = String(keys[i]);
      k = k === "Escape" ? "Esc" : k.length === 1 ? k.toUpperCase() : k;
      if (out.indexOf(k) === -1) out.push(k);
    }
    return out.join(" / ");
  }
  // the same keys as keycaps (<kbd class="gs-kbd">, styled by motion-toggle.js)
  function keyCaps(keys) {
    return keyLabel(keys).split(" / ").map(function (k) { return '<kbd class="gs-kbd">' + k + "</kbd>"; }).join("/");
  }

  function pausable(opts) {
    opts = opts || {};
    var canPause = opts.canPause || function () { return true; };
    var onChange = opts.onChange || function () {};
    var keys = opts.keys || ["Escape", "p"];
    var title = opts.title || "Paused";
    var paused = false;
    var el = null;
    var corner = null;

    function build() {
      if (el) return el;
      injectPauseCss();
      el = document.createElement("div");
      el.className = "gs-pause";
      el.hidden = true;
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-label", title);
      el.innerHTML =
        '<div class="gs-pause-card"><h2>' + title + "</h2>" +
        "<p>tap resume or press " + keyCaps(keys) + " to continue</p>" +
        '<button type="button">▶ Resume</button></div>';
      el.querySelector("button").addEventListener("click", function () { setPaused(false); });
      applyLook(el);
      document.body.appendChild(el);
      return el;
    }

    function setPaused(v) {
      v = !!v;
      if (v === paused) return;
      if (v && !canPause()) return;      // nothing to pause (menu, game over)
      paused = v;
      build().hidden = !paused;
      if (corner) corner.render();
      try { onChange(paused); } catch (e) {}
    }

    if (document.body) build();
    else document.addEventListener("DOMContentLoaded", build);

    // `button: false` for a game that already shows its own pause control
    if (opts.button !== false) corner = pauseButton({
      keys: keys,
      canPause: canPause,
      isPaused: function () { return paused; },
      toggle: function () { setPaused(!paused); }
    });

    document.addEventListener("keydown", function (e) {
      if (!e.key) return;                // autofill sends keydowns with no key
      if (e.ctrlKey || e.metaKey || e.altKey) return;   // Ctrl+P is Print, not pause
      var hit = false;
      for (var i = 0; i < keys.length; i++) {
        if (e.key === keys[i] || e.key.toLowerCase() === String(keys[i]).toLowerCase()) { hit = true; break; }
      }
      if (!hit || e.repeat) return;
      // Don't swallow a printable key the player is typing into a field — but
      // Escape is never text, and in metazac/ztype the input IS the game
      // surface, so a blanket "ignore while focused in an input" would make
      // pause unreachable exactly where it's needed most.
      if (e.key.length === 1) {
        var t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      }
      // Claim the key only when it pauses or resumes something: on a menu or
      // end screen, Esc and P (and Ctrl+P, Print) keep their usual behaviour
      if (!paused && !canPause()) return;
      e.preventDefault();
      setPaused(!paused);
    });

    // Backgrounding the tab pauses; regaining focus never un-pauses.
    onAutoPause(function () { setPaused(true); });

    return {
      isPaused: function () { return paused; },
      pause: function () { setPaused(true); },
      resume: function () { setPaused(false); },
      toggle: function () { setPaused(!paused); }
    };
  }

  // The ⏸ button in the top-right row, just left of the sound button. Every
  // game that can pause shows one, so it's plain which games pause and with
  // which key; it's dimmed (with a tooltip) while there's nothing to pause.
  // pausable() adds it; a game with its own pause screen calls this directly:
  //
  //   GameShell.pauseButton({ toggle, isPaused, canPause, keys: ["p"] });
  //
  // offTitle replaces the dimmed button's "Pausing works during a game"
  // tooltip, for a game that shows the button but never pauses (keys: [],
  // canPause always false), so players see why:
  //
  //   GameShell.pauseButton({ keys: [], canPause: () => false, offTitle: "…" });
  //
  // It can also be a function, read each time the button updates, for a game
  // where only some modes never pause (24: Classic and Hard have no clock).
  // Returning "" keeps the usual tooltip.
  //
  // A click never takes focus (so the game's Space / Enter / typing keeps
  // going where it was) and never reaches the game's own tap handlers.
  function pauseButton(api) {
    var keys = api.keys || ["Escape", "p"];
    var label = keyLabel(keys), caps = keys.length ? " " + keyCaps(keys) : "", shown = "";
    var keyNote = label ? " (" + label + ")" : "";
    var isPaused = api.isPaused || function () { return false; };
    var canPause = api.canPause || function () { return true; };
    var btn = null;

    // below ~1200px the full label would crowd the top of many games, so it's
    // just the icon there (the tooltip and aria-label still name the key)
    function narrow() { return window.innerWidth < 1200; }
    function render() {
      if (!btn) return;
      var p = isPaused(), ok = p || canPause();
      var html = p ? "▶" : "⏸";
      if (!narrow()) html += (p ? " Resume" : " Pause") + caps;
      if (html !== shown) { btn.innerHTML = html; shown = html; }
      btn.setAttribute("aria-disabled", ok ? "false" : "true");
      var off = !ok && (typeof api.offTitle === "function" ? api.offTitle() : api.offTitle);
      btn.setAttribute("aria-label", off ? off : (p ? "Resume" : "Pause") + keyNote);
      btn.title = ok ? (p ? "Resume" : "Pause") + (label ? " — " + label : "") : off || "Pausing works during a game" + keyNote;
      btn.style.opacity = ok ? "1" : "0.45";
      btn.style.cursor = ok ? "pointer" : "default";
    }
    function place() {
      if (!btn) return;
      var ref = document.querySelector(".mute-toggle") || document.querySelector(".rm-toggle");
      var r = ref && ref.getBoundingClientRect();
      btn.style.right = (r && r.width ? Math.max(12, window.innerWidth - r.left + 8) : 12) + "px";
    }
    function build() {
      if (btn) return;
      injectPauseCss();
      btn = document.createElement("button");
      btn.className = "gs-pause-btn";
      btn.type = "button";
      btn.style.cssText =
        "position:fixed;top:12px;z-index:99999;font-weight:700;font-size:13px;line-height:1;white-space:nowrap;" +
        "border-radius:8px;padding:8px 11px;-webkit-tap-highlight-color:transparent;";
      var back = document.querySelector(".nav-back-games");
      if (back) {
        // like the sound button: take the back link's look even when it's a gradient
        var cs = getComputedStyle(back);
        btn.style.color = cs.color;
        btn.style.background = cs.backgroundImage && cs.backgroundImage !== "none" ? cs.backgroundImage : cs.backgroundColor;
        btn.style.border = cs.borderTopWidth + " " + cs.borderTopStyle + " " + cs.borderTopColor;
        btn.style.borderRadius = cs.borderTopLeftRadius;
        btn.style.fontFamily = cs.fontFamily;
        if (cs.boxShadow && cs.boxShadow !== "none") btn.style.boxShadow = cs.boxShadow;
      } else {
        btn.style.color = "#fff";
        btn.style.background = "rgba(18,20,28,0.55)";
        btn.style.border = "1px solid rgba(255,255,255,0.22)";
      }
      var stop = function (e) { e.stopPropagation(); };
      btn.addEventListener("mousedown", function (e) { e.preventDefault(); e.stopPropagation(); });
      btn.addEventListener("pointerdown", stop);
      btn.addEventListener("touchstart", stop, { passive: true });
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (isPaused() || canPause()) api.toggle();
        render();
      });
      document.body.appendChild(btn);
      render();
      // after the sound and FX buttons have placed themselves
      place();
      requestAnimationFrame(place);
      setTimeout(place, 120);
      setTimeout(place, 400);
      window.addEventListener("resize", function () { render(); place(); });
      window.addEventListener("reducemotionchange", function () { setTimeout(place, 20); });
      setInterval(render, 250);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
    else build();

    return { render: render };
  }

  // ---- canvas keycaps -------------------------------------------------
  // The canvas version of <kbd class="gs-kbd">, for games that draw their key
  // hints on a canvas: every [KEY] in `str` becomes a keycap, the rest is
  // plain text. Uses the context's current font, fillStyle, textAlign and
  // textBaseline, so it sits where a fillText of the same string would.
  //   opts.outline: { width, color } strokes the plain text first (for games
  //                 that outline their captions); keycaps then get a solid
  //                 fill in that colour so they stay readable too
  //   GameShell.drawKeys(ctx, "[P] or [Esc] to resume", W / 2, y);
  function drawKeys(ctx, str, x, y, opts) {
    opts = opts || {};
    var parts = String(str).split(/(\[[^\]]+\])/).filter(function (t) { return t; });
    var isKey = function (t) { return t.charAt(0) === "[" && t.charAt(t.length - 1) === "]" && t.length > 2; };
    var m = /(\d+(?:\.\d+)?)px/.exec(ctx.font);
    var px = m ? parseFloat(m[1]) : 12;
    var padX = px * 0.32, gap = px * 0.14;
    var widths = parts.map(function (t) {
      return isKey(t) ? ctx.measureText(t.slice(1, -1)).width + padX * 2 + gap * 2 : ctx.measureText(t).width;
    });
    var total = widths.reduce(function (a, b) { return a + b; }, 0);
    var align = ctx.textAlign;
    var cx = align === "center" ? x - total / 2 : (align === "right" || align === "end") ? x - total : x;
    var cap = ctx.measureText("M");
    var asc = cap.actualBoundingBoxAscent || px * 0.7, desc = cap.actualBoundingBoxDescent || 0;
    var padY = px * 0.22, color = ctx.fillStyle, a0 = ctx.globalAlpha;
    ctx.save();
    ctx.textAlign = "left";
    parts.forEach(function (t, i) {
      if (!isKey(t)) {
        if (opts.outline) { ctx.lineWidth = opts.outline.width; ctx.strokeStyle = opts.outline.color; ctx.lineJoin = "round"; ctx.strokeText(t, cx, y); }
        ctx.fillStyle = color; ctx.fillText(t, cx, y);
      } else {
        var bx = cx + gap, bw = widths[i] - gap * 2, by = y - asc - padY, bh = asc + desc + padY * 2, r = Math.min(px * 0.28, bh / 2);
        ctx.beginPath();
        ctx.moveTo(bx + r, by); ctx.arcTo(bx + bw, by, bx + bw, by + bh, r); ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
        ctx.arcTo(bx, by + bh, bx, by, r); ctx.arcTo(bx, by, bx + bw, by, r); ctx.closePath();
        if (opts.outline) { ctx.globalAlpha = a0 * 0.92; ctx.fillStyle = opts.outline.color; ctx.fill(); }
        ctx.globalAlpha = a0 * 0.14; ctx.fillStyle = color; ctx.fill();
        ctx.globalAlpha = a0 * 0.55; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, px / 13); ctx.stroke();
        ctx.fillRect(bx + r * 0.6, by + bh - ctx.lineWidth, bw - r * 1.2, ctx.lineWidth * 1.6);   // the keycap's deeper bottom edge
        ctx.globalAlpha = a0; ctx.fillStyle = color;
        ctx.fillText(t.slice(1, -1), bx + padX, y);
      }
      cx += widths[i];
    });
    ctx.restore();
  }

  // ---- themed dialogs ---------------------------------------------------
  // In-page stand-ins for the browser's confirm(), alert() and prompt()
  // boxes, which ignore the game's look. They're built like the pause card
  // (same classes, the same borrowed "← Games" look), so a game that
  // restyles .gs-pause-card restyles these too; .gs-dialog / .gs-dialog-card
  // are there for anything dialog-only.
  //
  //   GameShell.confirm({ title: "Delete this level?", text: "…", ok: "Delete", cancel: "Keep it" },
  //                     function (yes) { if (yes) … });
  //   GameShell.alert({ title: "That link didn't work", text: "…" }, function () { … });
  //   GameShell.copyBox({ title: "Copy your result", text: shareText });
  //
  // Each also returns a Promise (true / false for confirm). Unlike the
  // browser's boxes they don't stop the page, so the code that should wait
  // for the answer goes in the callback. While one is open the game under it
  // gets no keys or clicks: Enter picks the main button, Esc the other one,
  // Tab moves between them, and a click outside the card counts as Esc.
  var openDialog = null;

  function escHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }

  // o: { title, text, copy, role, buttons: [{ label, key, value, main, click }] }
  // A button's `key` ("Enter" / "Esc") is the key that presses it.
  function showDialog(o, done) {
    injectPauseCss();
    if (openDialog) openDialog.dismiss();            // one at a time
    var prevFocus = document.activeElement;
    var resolve = null;
    var promise = typeof Promise === "function" ? new Promise(function (r) { resolve = r; }) : null;

    var el = document.createElement("div");
    el.className = "gs-pause gs-dialog";
    el.style.zIndex = "100001";                      // over the corner buttons and the pause card
    el.setAttribute("role", o.role || "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", o.title);
    var card = document.createElement("div");
    card.className = "gs-pause-card gs-dialog-card" + (o.copy != null ? " gs-dialog-copy" : "");
    var h = document.createElement("h2");
    h.textContent = o.title;
    card.appendChild(h);
    if (o.text) {
      var p = document.createElement("p");
      p.textContent = o.text;
      card.appendChild(p);
    }
    var ta = null;
    if (o.copy != null) {
      ta = document.createElement("textarea");
      ta.readOnly = true;
      ta.value = String(o.copy);
      ta.rows = Math.min(8, ta.value.split("\n").length + 1);   // a row to spare for a wrapped link
      ta.setAttribute("aria-label", o.title);
      ta.addEventListener("focus", function () { ta.select(); });
      card.appendChild(ta);
    }
    var row = document.createElement("div");
    row.className = "gs-dialog-row";
    var byKey = {}, cancelValue;
    var btns = o.buttons.map(function (b) {
      var bt = document.createElement("button");
      bt.type = "button";
      if (!b.main) bt.className = "gs-dialog-alt";
      bt.innerHTML = escHtml(b.label) + (b.key ? ' <span class="gs-keys"><kbd class="gs-kbd">' + b.key + "</kbd></span>" : "");
      bt.addEventListener("click", function () { if (b.click) b.click(bt, close); else close(b.value); });
      if (b.key) byKey[b.key] = bt;
      if (b.key === "Esc") cancelValue = b.value;
      row.appendChild(bt);
      return bt;
    });
    card.appendChild(row);
    el.appendChild(card);
    applyLook(el);
    // a one-button dialog (alert) closes on Esc too
    if (!byKey.Esc && btns.length === 1) byKey.Esc = btns[0];

    // keys: nothing reaches the game while the dialog is up
    function onKey(e) {
      e.stopImmediatePropagation();
      // Enter's keypress clicks the focused button, so when Enter is what
      // opened the dialog its keypress would press the button just focused
      // (Enter is handled on keydown instead)
      if (e.type === "keypress") { e.preventDefault(); return; }
      if (e.type !== "keydown") return;
      if (e.key === "Tab") {
        var all = (ta ? [ta] : []).concat(btns), i = all.indexOf(document.activeElement);
        i = i < 0 ? 0 : (i + (e.shiftKey ? all.length - 1 : 1)) % all.length;
        all[i].focus();
        e.preventDefault();
      } else if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        var bt = byKey[e.key === "Enter" ? "Enter" : "Esc"];
        if (bt && !e.repeat) bt.click();
      }
      // anything else keeps its default action (Space presses the focused
      // button; Ctrl+C / Ctrl+A / the arrows work in the copy box)
    }
    // clicks and taps stop at the overlay; one outside the card is Esc
    function stop(e) { e.stopPropagation(); }
    ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "wheel", "contextmenu"].forEach(function (t) {
      el.addEventListener(t, stop, t.indexOf("touch") === 0 || t === "wheel" ? { passive: true } : false);
    });
    el.addEventListener("click", function (e) {
      e.stopPropagation();
      if (e.target === el && byKey.Esc) byKey.Esc.click();
    });

    function close(v) {
      if (!el.parentNode) return;
      el.parentNode.removeChild(el);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("keypress", onKey, true);
      if (openDialog && openDialog.el === el) openDialog = null;
      try { if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true }); } catch (e) {}
      try { if (done) done(v); } catch (e) { setTimeout(function () { throw e; }); }
      if (resolve) resolve(v);
    }

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    window.addEventListener("keypress", onKey, true);
    (document.body || document.documentElement).appendChild(el);
    openDialog = { el: el, dismiss: function () { close(cancelValue); } };
    if (ta) ta.focus(); else (byKey.Enter || btns[0]).focus();
    return promise;
  }

  function confirmBox(opts, cb) {
    opts = typeof opts === "string" ? { title: opts } : opts || {};
    return showDialog({
      title: opts.title || "Are you sure?",
      text: opts.text,
      role: "alertdialog",
      buttons: [
        { label: opts.cancel || "Cancel", key: "Esc", value: false },
        { label: opts.ok || "OK", key: "Enter", value: true, main: true }
      ]
    }, cb);
  }

  function alertBox(opts, cb) {
    opts = typeof opts === "string" ? { title: opts } : opts || {};
    return showDialog({
      title: opts.title || "",
      text: opts.text,
      role: "alertdialog",
      // Esc closes it too (and is what a click outside the card presses)
      buttons: [{ label: opts.ok || "OK", key: "Enter", value: undefined, main: true }]
    }, function () { if (cb) cb(); });
  }

  // For when navigator.clipboard isn't allowed: the text, selected, with a
  // Copy button (which tries the older copy command) and a Done button.
  function copyBox(opts, cb) {
    opts = typeof opts === "string" ? { text: opts } : opts || {};
    var text = String(opts.text || "");
    var apple = /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent || "");
    return showDialog({
      title: opts.title || "Copy your result",
      text: opts.note,
      copy: text,
      buttons: [
        { label: "Done", key: "Esc", value: false },
        { label: "Copy", key: "Enter", main: true, click: function (bt, close) {
          var area = bt.parentNode.parentNode.querySelector("textarea");
          area.focus(); area.select();
          var ok = false;
          try { ok = document.execCommand("copy"); } catch (e) {}
          if (ok) {
            bt.textContent = "✓ Copied";
            setTimeout(function () { close(true); }, 700);
          } else {
            bt.innerHTML = 'Press <kbd class="gs-kbd">' + (apple ? "⌘" : "Ctrl") + '</kbd>+<kbd class="gs-kbd">C</kbd>';
          }
        } }
      ]
    }, cb);
  }

  function onAutoPause(fn) {
    if (typeof fn === "function") pauseHandlers.push(fn);
  }

  window.GameShell = {
    store: store,
    best: best,
    record: record,
    pausable: pausable,
    pauseButton: pauseButton,
    drawKeys: drawKeys,
    confirm: confirmBox,
    alert: alertBox,
    copyBox: copyBox,
    /* fn is called when the tab is hidden or the window loses focus.
       It must pause only if the game is actually running. */
    onAutoPause: onAutoPause
  };
})();
