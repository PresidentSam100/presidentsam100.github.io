/* Tile Maze — shared sound effects (synthesized, no assets).
   Used by BOTH game.js and editor.js so the cues are defined once.
   Muting is handled globally by the shared top-right toggle (mute-toggle.js),
   which routes every AudioContext through a master gain. */
(function (root, factory) {
  const mod = factory();
  if (typeof window !== "undefined") window.TileSFX = mod;
})(this, function () {
  "use strict";

  let actx = null;
  function audio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function tone(freq, dur, type, gain, slideTo) {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  return {
    step: () => tone(180, 0.05, "triangle", 0.05),
    green: () => tone(660, 0.18, "sine", 0.14),
    orange: () => tone(330, 0.12, "square", 0.08),
    slide: () => tone(520, 0.14, "sine", 0.08, 240),
    water: () => tone(300, 0.28, "sine", 0.07, 180),
    bounce: () => tone(120, 0.16, "sawtooth", 0.14),
    thud: () => tone(90, 0.1, "sine", 0.1),
    win: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, "triangle", 0.13), i * 110)); },
  };
});
