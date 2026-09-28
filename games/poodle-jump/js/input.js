"use strict";

// Handles keyboard, mouse and touch. Exposes:
//   input.left / input.right        -> movement intent (bool)
//   input.consumeShots()            -> array of pending shots this frame
//   input.consumeAction()           -> true once if start/restart was pressed
// A "shot" is { x, y } in *screen* pixels to aim toward, or null for straight up.
class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.btnLeft = false;   // on-screen button
    this.btnRight = false;
    this.shots = [];
    this.action = false;    // start / restart pressed
    this.pause = false;     // pause/resume toggle pressed (P / Esc)

    this._bindKeyboard();
    this._bindPointer();
    this._bindTouchButtons();
  }

  get left() { return this.keys["ArrowLeft"] || this.keys["KeyA"] || this.btnLeft; }
  get right() { return this.keys["ArrowRight"] || this.keys["KeyD"] || this.btnRight; }

  consumeShots() {
    const s = this.shots;
    this.shots = [];
    return s;
  }

  consumeAction() {
    const a = this.action;
    this.action = false;
    return a;
  }

  consumePauseToggle() {
    const p = this.pause;
    this.pause = false;
    return p;
  }

  _bindKeyboard() {
    window.addEventListener("keydown", (e) => {
      Sfx.resume();
      // Prevent the page from scrolling on arrows/space
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) {
        e.preventDefault();
      }
      if (e.repeat) return;
      this.keys[e.code] = true;

      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
        this.shots.push(null);   // straight up
        this.action = true;      // also doubles as start/restart
      }
      if (e.code === "Enter") this.action = true;
      if (e.code === "KeyP" || e.code === "Escape") this.pause = true;
    });

    window.addEventListener("keyup", (e) => { this.keys[e.code] = false; });
    // Safety: clear keys if the window loses focus
    window.addEventListener("blur", () => { this.keys = {}; });
  }

  _bindPointer() {
    this.canvas.addEventListener("pointerdown", (e) => {
      Sfx.resume();
      const rect = this.canvas.getBoundingClientRect();
      // Convert client coords -> internal canvas resolution
      const x = (e.clientX - rect.left) * (CONFIG.W / rect.width);
      const y = (e.clientY - rect.top) * (CONFIG.H / rect.height);
      this.shots.push({ x, y });
      this.action = true;
    });
  }

  _bindTouchButtons() {
    const bind = (id, set) => {
      const el = document.getElementById(id);
      if (!el) return;
      const on = (v) => (e) => { e.preventDefault(); Sfx.resume(); set(v); };
      el.addEventListener("pointerdown", on(true));
      el.addEventListener("pointerup", on(false));
      el.addEventListener("pointerleave", on(false));
      el.addEventListener("pointercancel", on(false));
    };
    bind("btn-left", (v) => (this.btnLeft = v));
    bind("btn-right", (v) => (this.btnRight = v));

    // Middle "shoot" button — fires straight up, like the Space key.
    const shootBtn = document.getElementById("btn-shoot");
    if (shootBtn) {
      shootBtn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        Sfx.resume();
        this.shots.push(null); // straight up
        this.action = true;    // also doubles as start/restart
      });
    }
  }
}
