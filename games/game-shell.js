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
  //     keys: ["Escape", "p"]                  // optional; default shown
  //   });
  //   ...inside the loop:  if (!P.isPaused()) { update(dt); }
  //
  // `keys` matters: games where the player types (ztype) or remaps controls
  // (osu-mania) must not swallow "p", so they pass ["Escape"] only.
  function pausable(opts) {
    opts = opts || {};
    var canPause = opts.canPause || function () { return true; };
    var onChange = opts.onChange || function () {};
    var keys = opts.keys || ["Escape", "p"];
    var title = opts.title || "Paused";
    var paused = false;
    var el = null;

    function build() {
      if (el) return el;
      if (!document.getElementById("gs-pause-style")) {
        var st = document.createElement("style");
        st.id = "gs-pause-style";
        st.textContent =
          ".gs-pause{position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;" +
          "background:rgba(6,8,12,0.62);font-family:system-ui,-apple-system,'Segoe UI',sans-serif}" +
          ".gs-pause[hidden]{display:none}" +
          ".gs-pause-card{background:rgba(22,25,33,0.97);border:1px solid rgba(255,255,255,0.16);border-radius:14px;" +
          "padding:1.3rem 1.6rem;text-align:center;color:#eef0f4;max-width:min(90vw,330px)}" +
          ".gs-pause-card h2{margin:0 0 .2rem;font-size:1.5rem;font-weight:800}" +
          ".gs-pause-card p{margin:0 0 .9rem;font-size:.85rem;color:#9aa1b0}" +
          ".gs-pause-card button{cursor:pointer;min-height:44px;padding:.6rem 1.4rem;border-radius:9px;border:1px solid rgba(255,255,255,0.22);" +
          "background:rgba(255,255,255,0.09);color:#eef0f4;font:700 1rem/1 inherit;-webkit-tap-highlight-color:transparent}" +
          ".gs-pause-card button:hover{background:rgba(255,255,255,0.16)}";
        (document.head || document.documentElement).appendChild(st);
      }
      el = document.createElement("div");
      el.className = "gs-pause";
      el.hidden = true;
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-label", title);
      el.innerHTML =
        '<div class="gs-pause-card"><h2>' + title + "</h2>" +
        "<p>tap resume or press " + (keys.indexOf("p") !== -1 ? "P" : "Esc") + " to continue</p>" +
        '<button type="button">▶ Resume</button></div>';
      el.querySelector("button").addEventListener("click", function () { setPaused(false); });
      document.body.appendChild(el);
      return el;
    }

    function setPaused(v) {
      v = !!v;
      if (v === paused) return;
      if (v && !canPause()) return;      // nothing to pause (menu, game over)
      paused = v;
      build().hidden = !paused;
      try { onChange(paused); } catch (e) {}
    }

    if (document.body) build();
    else document.addEventListener("DOMContentLoaded", build);

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

  function onAutoPause(fn) {
    if (typeof fn === "function") pauseHandlers.push(fn);
  }

  window.GameShell = {
    store: store,
    best: best,
    record: record,
    pausable: pausable,
    /* fn is called when the tab is hidden or the window loses focus.
       It must pause only if the game is actually running. */
    onAutoPause: onAutoPause
  };
})();
