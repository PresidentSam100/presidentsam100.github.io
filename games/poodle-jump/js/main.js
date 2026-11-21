"use strict";

(function () {
  const canvas = document.getElementById("game");

  // Crisp rendering on retina / 4K: size the backing store to device pixels and
  // scale the context so all drawing stays in CONFIG.W x CONFIG.H logical units.
  // The CSS controls the on-screen display size, so this only affects sharpness.
  function setupHiDPI() {
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    canvas.width = Math.round(CONFIG.W * dpr);
    canvas.height = Math.round(CONFIG.H * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  setupHiDPI();

  // The canvas text uses the page's marker font once it has loaded.
  if (document.fonts && document.fonts.load) document.fonts.load('26px "Permanent Marker"');

  const input = new Input(canvas);
  const game = new Game(canvas, input);
  window.__game = game; // debug/automation hook
  // test hook: the page's name field as last drawn, in page px (null when it
  // has scrolled off), with the name's letter size
  window.PoodleJump = {
    nameLine() {
      const b = game.nameBox;
      if (!b) return null;
      const r = canvas.getBoundingClientRect(), k = r.width / CONFIG.W;
      return { x: r.left + b.x * k, y: r.top + b.y * k, w: b.w * k, h: b.h * k, nameX: r.left + b.name.x * k, nameW: b.name.w * k, size: b.name.size * k, scale: k };
    },
  };

  // Re-apply when the device pixel ratio changes (e.g. dragging the window to a
  // different-density monitor or browser zoom). setTransform is reset by sizing.
  window.addEventListener("resize", setupHiDPI);

  // The page drops below the corner buttons only where they would sit over
  // it (pj-drop, styles.css). Judged from the plain layout each time: the
  // page with its spiral binding (17 px past its left edge) and its 3 px
  // edge, against each corner button, with a few pixels to spare. The corner
  // row is built once the page has loaded, and its buttons take their width
  // from the font when it arrives.
  const holder = document.getElementById("game-container");
  function fitPage() {
    const root = document.documentElement;
    root.classList.remove("pj-drop");
    if (!holder) return;
    const r = holder.getBoundingClientRect(), page = { left: r.left - 17 - 4, right: r.right + 3 + 4, top: r.top - 3 - 4, bottom: r.bottom + 3 };
    const over = Array.from(document.querySelectorAll(".nav-back-games, .gs-corner > *"))
      .filter((b) => b.getClientRects().length).map((b) => b.getBoundingClientRect())
      .some((b) => page.left < b.right && page.right > b.left && page.top < b.bottom && page.bottom > b.top);
    root.classList.toggle("pj-drop", over);
  }
  fitPage();
  document.addEventListener("DOMContentLoaded", () => {
    fitPage();
    if (window.ResizeObserver) {
      const watch = new ResizeObserver(fitPage);
      document.querySelectorAll(".nav-back-games, .gs-corner").forEach((el) => watch.observe(el));
    }
  });
  window.addEventListener("load", fitPage);
  window.addEventListener("resize", fitPage);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitPage, () => {});

  // Muting is handled globally by the shared top-right toggle (mute-toggle.js).
  Sfx.muted = false;
  // Keep canvas clicks from being eaten by the button area only; the button
  // itself stops propagation above.

  // Auto-pause when the tab/window loses focus so the run isn't lost to a
  // background switch (the loop keeps drawing the paused overlay).
  if (window.GameShell) GameShell.onAutoPause(() => game.requestPause());
  // the shared ⏸ button beside the sound button, so it's plain the game pauses (P)
  if (window.GameShell && GameShell.pauseButton) GameShell.pauseButton({
    keys: ["p"],
    canPause: () => game.state === "play",
    isPaused: () => game.paused,
    toggle: () => { if (game.state === "play") game.paused = !game.paused; },
  });
  else { // shell missing: keep the original listeners so the behaviour survives
    window.addEventListener("blur", () => game.requestPause());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) game.requestPause();
    });
  }
  // While paused: Restart (a new climb) and Menu (the start card), under the
  // board's own Paused note
  if (window.GameShell && GameShell.pauseMore) GameShell.pauseMore({
    isPaused: () => game.paused && game.state === "play",
    resume: () => { game.paused = false; },
    restart: () => game.start(),
    menu: () => game.toStart(),
    anchor: canvas, at: 0.675,
  });
  // A run is in progress (paused or not) from the first point until the
  // poodle goes down: leaving then asks first, pausing underneath. The fall
  // comes after the best is saved, so it doesn't ask.
  if (window.GameShell) GameShell.guardLeave({
    active: () => game.state === "play" && game.score > 0,
    isPaused: () => game.paused,
    pause: () => game.requestPause(),
    resume: () => { game.paused = false; },
  });

  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    // Clamp dt so tab-switches / lag don't teleport the player through platforms
    dt = clamp(dt, 0, 1 / 30);

    game.update(dt);
    game.render();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
