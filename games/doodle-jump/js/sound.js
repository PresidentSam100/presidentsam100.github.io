"use strict";

// Tiny WebAudio sound-effect helper. All synth beeps, no asset files.
// Everything is wrapped so a missing/blocked AudioContext never breaks the game.
const Sfx = {
  ctx: null,
  muted: false,
  _flyKind: null,   // which flight drone is currently looping (null = none)
  _flyNodes: null,  // its live WebAudio nodes, kept so we can stop them
  _noise: null,     // cached white-noise buffer for the jetpack

  _ensure() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    } catch (e) { this.ctx = null; }
  },

  // Resume the context after a user gesture (browsers require this).
  resume() {
    this._ensure();
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  },

  _tone(freq, dur, type, vol, slideTo) {
    if (this.muted) return;
    this._ensure();
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || "square";
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      gain.gain.setValueAtTime((vol || 0.2), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
    } catch (e) { /* ignore */ }
  },

  jump()     { this._tone(440, 0.12, "square", 0.15, 760); },
  spring()   { this._tone(330, 0.28, "square", 0.2, 1200); },
  stomp()    { this._tone(520, 0.16, "triangle", 0.2, 900); },
  shoot()    { this._tone(900, 0.07, "square", 0.08, 400); },
  hit()      { this._tone(180, 0.18, "sawtooth", 0.2, 80); },
  powerup()  { this._tone(500, 0.4, "triangle", 0.18, 1500); },
  die()      { this._tone(400, 0.6, "sawtooth", 0.25, 60); },
  break_()   { this._tone(220, 0.12, "sawtooth", 0.12, 120); },

  // ---- Continuous flight drone (jetpack / propeller) ----------------------
  // Driven once per frame by the Game with the active power-up's kind, or null
  // to silence it. Idempotent: calling it with the kind that's already playing
  // does nothing, so it's safe to call every frame. Muting (or a null kind)
  // stops the drone; it restarts on the next call once unmuted.
  setFlightLoop(kind) {
    if (this.muted) kind = null;
    if (kind === this._flyKind) return;
    this._stopFly();
    if (kind) this._startFly(kind);
  },

  _noiseBuffer() {
    if (this._noise) return this._noise;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._noise = buf;
    return buf;
  },

  _startFly(kind) {
    if (this.muted) return;
    this._ensure();
    if (!this.ctx) return;
    try {
      const ctx = this.ctx, t = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, t); // fade in to avoid a click
      master.connect(ctx.destination);
      const nodes = { master, sources: [] };

      if (kind === "jetpack") {
        // Rocket thrust: looping filtered white noise + a low body rumble.
        const noise = ctx.createBufferSource();
        noise.buffer = this._noiseBuffer();
        noise.loop = true;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass"; lp.frequency.value = 720; lp.Q.value = 2.5;
        noise.connect(lp).connect(master);
        const rumble = ctx.createOscillator();
        rumble.type = "sine"; rumble.frequency.value = 55;
        const rg = ctx.createGain(); rg.gain.value = 0.5;
        rumble.connect(rg).connect(master);
        noise.start(t); rumble.start(t);
        nodes.sources.push(noise, rumble);
        master.gain.exponentialRampToValueAtTime(0.07, t + 0.06);
      } else {
        // Propeller whirr: a sawtooth chopped by a square-wave LFO ("brrrr").
        const osc = ctx.createOscillator();
        osc.type = "sawtooth"; osc.frequency.value = 120;
        const chop = ctx.createGain(); chop.gain.value = 0.5;
        const lfo = ctx.createOscillator();
        lfo.type = "square"; lfo.frequency.value = 17;
        const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.5;
        lfo.connect(lfoGain).connect(chop.gain); // gain swings 0..1 -> flutter
        osc.connect(chop).connect(master);
        osc.start(t); lfo.start(t);
        nodes.sources.push(osc, lfo);
        master.gain.exponentialRampToValueAtTime(0.05, t + 0.06);
      }
      this._flyNodes = nodes;
      this._flyKind = kind;
    } catch (e) { this._flyKind = null; this._flyNodes = null; }
  },

  _stopFly() {
    this._flyKind = null;
    const nodes = this._flyNodes;
    this._flyNodes = null;
    if (!nodes || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      nodes.master.gain.cancelScheduledValues(t);
      nodes.master.gain.setValueAtTime(Math.max(nodes.master.gain.value, 0.0001), t);
      nodes.master.gain.exponentialRampToValueAtTime(0.0001, t + 0.08); // fade out
      for (const s of nodes.sources) { try { s.stop(t + 0.1); } catch (e) { /* ignore */ } }
    } catch (e) { /* ignore */ }
  },
};
