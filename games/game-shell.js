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
    "padding:1.3rem 1.6rem;text-align:center;max-width:min(90vw,330px)}" +
    ":where(.gs-pause-card h2){margin:0 0 .2rem;font-size:1.5rem;font-weight:800}" +
    ":where(.gs-pause-card p){margin:0 0 .9rem;font-size:.85rem;opacity:.75}" +
    ":where(.gs-pause-card button){cursor:pointer;min-height:44px;padding:.6rem 1.4rem;border-radius:var(--gs-btn-radius,9px);" +
    "border:var(--gs-border,1px solid rgba(255,255,255,0.22));background:var(--gs-btn-bg,rgba(255,255,255,0.09));color:inherit;" +
    "box-shadow:var(--gs-shadow,none);font:700 1rem/1 inherit;-webkit-tap-highlight-color:transparent}" +
    ":where(.gs-pause-card button:hover){filter:brightness(1.1)}" +
    ".gs-pause-btn{transition:filter .15s ease,opacity .15s ease,outline-color .15s ease;outline:2px solid transparent;outline-offset:2px}" +
    ".gs-pause-btn[aria-disabled=false]:hover{filter:brightness(1.12)}" +
    ".gs-pause-btn:focus-visible{outline-color:currentColor;outline-offset:3px}";
  function injectPauseCss() {
    if (document.getElementById("gs-pause-style")) return;
    var st = document.createElement("style");
    st.id = "gs-pause-style";
    st.textContent = PAUSE_CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  // The game's "← Games" link, as a set of styles to borrow (null if it has
  // none, or its background is clear or a gradient: then the neutral look stays)
  function backLinkLook() {
    var back = document.querySelector(".nav-back-games");
    if (!back) return null;
    var cs = getComputedStyle(back);
    var bg = cs.backgroundColor, m = /rgba?\(([^)]+)\)/.exec(bg);
    var alpha = m ? (m[1].split(",")[3] === undefined ? 1 : parseFloat(m[1].split(",")[3])) : 1;
    if (!bg || bg === "transparent" || alpha < 0.5) return null;
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
        "<p>tap resume or press " + keyLabel(keys) + " to continue</p>" +
        '<button type="button">▶ Resume</button></div>';
      el.querySelector("button").addEventListener("click", function () { setPaused(false); });
      var look = backLinkLook();
      if (look) {
        el.style.setProperty("--gs-bg", look.bg);
        el.style.setProperty("--gs-fg", look.fg);
        el.style.setProperty("--gs-font", look.font);
        el.style.setProperty("--gs-border", look.border);
        el.style.setProperty("--gs-radius", Math.min(Math.max(look.radius, 10), 22) + "px");
        el.style.setProperty("--gs-btn-radius", Math.min(Math.max(look.radius, 8), 999) + "px");
        el.style.setProperty("--gs-btn-bg", look.bg);
        if (look.shadow) el.style.setProperty("--gs-shadow", look.shadow);
      }
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
  // A click never takes focus (so the game's Space / Enter / typing keeps
  // going where it was) and never reaches the game's own tap handlers.
  function pauseButton(api) {
    var keys = api.keys || ["Escape", "p"];
    var label = keyLabel(keys);
    var isPaused = api.isPaused || function () { return false; };
    var canPause = api.canPause || function () { return true; };
    var btn = null;

    // below ~1200px the full label would crowd the top of many games, so it's
    // just the icon there (the tooltip and aria-label still name the key)
    function narrow() { return window.innerWidth < 1200; }
    function render() {
      if (!btn) return;
      var p = isPaused(), ok = p || canPause();
      var text = p ? "▶" : "⏸";
      if (!narrow()) text += p ? " Resume" : " Pause (" + label + ")";
      if (btn.textContent !== text) btn.textContent = text;
      btn.setAttribute("aria-disabled", ok ? "false" : "true");
      btn.setAttribute("aria-label", p ? "Resume (" + label + ")" : "Pause (" + label + ")");
      btn.title = ok ? (p ? "Resume — " : "Pause — ") + label : "Pausing works during a game (" + label + ")";
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

  function onAutoPause(fn) {
    if (typeof fn === "function") pauseHandlers.push(fn);
  }

  window.GameShell = {
    store: store,
    best: best,
    record: record,
    pausable: pausable,
    pauseButton: pauseButton,
    /* fn is called when the tab is hidden or the window loses focus.
       It must pause only if the game is actually running. */
    onAutoPause: onAutoPause
  };
})();
