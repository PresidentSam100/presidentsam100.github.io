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

  const input = new Input(canvas);
  const game = new Game(canvas, input);
  window.__game = game; // debug/automation hook

  // Re-apply when the device pixel ratio changes (e.g. dragging the window to a
  // different-density monitor or browser zoom). setTransform is reset by sizing.
  window.addEventListener("resize", setupHiDPI);

  // Muting is handled globally by the shared top-right toggle (mute-toggle.js).
  Sfx.muted = false;
  // Keep canvas clicks from being eaten by the button area only; the button
  // itself stops propagation above.

  // Auto-pause when the tab/window loses focus so the run isn't lost to a
  // background switch (the loop keeps drawing the paused overlay).
  window.addEventListener("blur", () => game.requestPause());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) game.requestPause();
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
