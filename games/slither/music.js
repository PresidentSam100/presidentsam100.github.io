/* =====================================================================
   Slither — Labyrinth music: one generated loop per zone.

   A tiny step sequencer on the Web Audio clock. Each zone has its own
   mode, root, tempo, chord loop and instruments; the melody is drawn from
   a seeded random walk over the chord, so every zone's tune is the same
   every time you visit. Everything plays into ctx.destination, so the
   site's mute button silences it with the sound effects.

   SlitherMusic(getCtx) -> { play(zone), stop(), setOn(bool), isOn() }
   The on/off choice is saved under "slither_music".
   ===================================================================== */
window.SlitherMusic = function (getCtx) {
  "use strict";

  var KEY = "slither_music";
  var MODES = {
    major: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], harmonic: [0, 2, 3, 5, 7, 8, 11],
    phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
  };
  // chords: the scale degree each bar is built on (four bars loop).
  var THEMES = {
    Garden: { mode: "major", root: 60, bpm: 100, chords: [0, 5, 3, 4], lead: "triangle", bass: "sine", rest: 0.3, hat: 0.025, seed: 11 },
    Ruins: { mode: "dorian", root: 62, bpm: 90, chords: [0, 6, 3, 0], lead: "square", bass: "triangle", rest: 0.4, hat: 0.02, seed: 23, leadGain: 0.03 },
    Citadel: { mode: "harmonic", root: 57, bpm: 112, chords: [0, 5, 3, 4], lead: "sawtooth", bass: "triangle", rest: 0.35, hat: 0.03, seed: 37, leadGain: 0.025 },
    Foundry: { mode: "phrygian", root: 52, bpm: 124, chords: [0, 1, 0, 6], lead: "square", bass: "sawtooth", rest: 0.45, hat: 0.04, kick: true, seed: 41, leadGain: 0.025 },
    Astral: { mode: "lydian", root: 65, bpm: 76, chords: [0, 1, 4, 0], lead: "sine", bass: "sine", rest: 0.5, hat: 0, pad: true, seed: 53, noteLen: 3 },
  };
  var on = (function () { try { return localStorage.getItem(KEY) !== "0"; } catch (e) { return true; } })();
  var zone = null, timer = 0, step = 0, nextAt = 0, bus = null, song = null;

  function rng(seed) { return function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; }
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  // 64 steps (4 bars of 16ths): melody notes as MIDI numbers or null.
  function compose(th) {
    var sc = MODES[th.mode], r = rng(th.seed), mel = [], deg = 4;
    function note(d, oct) { var o = Math.floor(d / 7); return th.root + (oct || 0) * 12 + sc[((d % 7) + 7) % 7] + o * 12; }
    for (var bar = 0; bar < 4; bar++) {
      var c = th.chords[bar];
      for (var s = 0; s < 16; s++) {
        if (s % 2 || r() < th.rest) { mel.push(null); continue; }
        // Downbeats land on a chord tone; elsewhere, step through the scale.
        if (s % 8 === 0) { var tones = [c, c + 2, c + 4]; deg = tones[Math.floor(r() * 3)]; }
        else deg += [-2, -1, -1, 1, 1, 2][Math.floor(r() * 6)];
        deg = Math.max(c - 2, Math.min(c + 9, deg));
        mel.push(note(deg, 0));
      }
    }
    return { mel: mel, bass: th.chords.map(function (c) { return note(c, -1); }), pad: th.chords.map(function (c) { return [note(c, -1), note(c + 2, -1), note(c + 4, -1)]; }) };
  }

  function voice(ac, t, freq, dur, type, gain, dest, attack) {
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + (attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }
  var noiseBuf = null;
  function hit(ac, t, dur, gain, type, freq, dest) {
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.3), ac.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t); s.stop(t + dur + 0.02);
  }

  function schedule() {
    var ac = getCtx();
    if (!ac || !zone || !song) return;
    var th = THEMES[zone], spb = 60 / th.bpm / 4;   // seconds per 16th
    while (nextAt < ac.currentTime + 0.12) {
      var s = step % 64, bar = Math.floor(s / 16), t = nextAt;
      var m = song.mel[s];
      if (m != null) voice(ac, t, hz(m), spb * (th.noteLen || 1.8), th.lead, th.leadGain || 0.045, bus);
      if (s % 16 === 0) voice(ac, t, hz(song.bass[bar]), spb * 7, th.bass, 0.07, bus, 0.02);
      if (s % 16 === 8) voice(ac, t, hz(song.bass[bar]), spb * 6, th.bass, 0.05, bus, 0.02);
      if (th.pad && s % 16 === 0) song.pad[bar].forEach(function (n) { voice(ac, t, hz(n), spb * 15, "sine", 0.018, bus, 0.4); });
      if (th.hat && s % 4 === 2) hit(ac, t, 0.05, th.hat, "highpass", 7000, bus);
      if (th.kick && s % 8 === 0) { voice(ac, t, 110, 0.18, "sine", 0.09, bus); hit(ac, t, 0.08, 0.05, "lowpass", 900, bus); }
      nextAt += spb;
      step++;
    }
  }

  function play(z) {
    if (!THEMES[z]) z = "Garden";
    if (!on) { stop(); return; }
    if (zone === z && timer) return;          // already playing this zone's tune
    stop();
    var ac = getCtx();
    if (!ac) return;
    zone = z;
    song = compose(THEMES[z]);
    bus = ac.createGain();
    bus.gain.setValueAtTime(0.0001, ac.currentTime);
    bus.gain.exponentialRampToValueAtTime(0.9, ac.currentTime + 0.6);
    bus.connect(ac.destination);
    step = 0; nextAt = ac.currentTime + 0.08;
    timer = setInterval(schedule, 30);
    schedule();
  }
  function stop() {
    clearInterval(timer); timer = 0;
    if (bus) {
      var ac = getCtx(), b = bus;
      try { b.gain.cancelScheduledValues(ac.currentTime); b.gain.setTargetAtTime(0.0001, ac.currentTime, 0.08); } catch (e) {}
      setTimeout(function () { try { b.disconnect(); } catch (e) {} }, 600);
    }
    bus = null; zone = null;
  }
  function setOn(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) {}
    if (!on) stop();
  }
  return { play: play, stop: stop, setOn: setOn, isOn: function () { return on; }, zones: Object.keys(THEMES) };
};
