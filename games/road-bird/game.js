(() => {
"use strict";

// ---------- constants ----------
const TILE = 64;
const COLS = 9;                 // reachable columns the chicken can hop within (0..COLS-1)
const PAD = 1;                  // shaded, unreachable margin column on each side — see traffic/logs coming, and ride logs off-screen
const VIS_ROWS = 12;
const W = (COLS + 2 * PAD) * TILE;   // full canvas width including the margins
const H = VIS_ROWS * TILE;      // 768
const SCENE_L = -PAD * TILE;         // left world edge inside the (translated) scene
const SCENE_R = (COLS + PAD) * TILE; // right world edge inside the scene
const EAGLE_BORDER = H - TILE * 0.5; // screen-Y at which the chicken is on the bottommost row → eagle strikes
const MINROW = -5;
const HOP_DUR = 0.16;
const IDLE_LIMIT = 6.0;         // seconds before the eagle comes for idling
const LEFTBUF = 5;              // off-screen buffer columns each side (>= longest log so it never pops on screen)
const TRAIN_SPEED = 28;         // every train zips across at this same fast speed (direction still varies)
const TRUCK_CHANCE = 0.32;      // chance a vehicle is a truck vs a car (shared by normal traffic AND chases)

// ---------- canvas ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
// The backing store has the screen's pixels (up to 2 per CSS pixel), so the
// scene is sharp on retina screens and phones; everything still draws in W × H.
let dpr = 0;
function fit() {
  const s = Math.min(window.innerWidth / W, (window.innerHeight - 24) / H);
  canvas.style.width = Math.floor(W * s) + "px";
  canvas.style.height = Math.floor(H * s) + "px";
  const d = Math.min(2, window.devicePixelRatio || 1);
  if (d !== dpr) {   // (a browser zoom changes it too; setting the size resets the context)
    dpr = d;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
window.addEventListener("resize", fit);
fit();

// ---------- helpers ----------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const mod = (a, n) => ((a % n) + n) % n;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
function weighted(arr, w) {
  let s = w.reduce((p, c) => p + c, 0), r = Math.random() * s;
  for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; }
  return arr[arr.length - 1];
}
function roundRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- 2.5D voxel blocks ----------
// The camera looks from the front and above. A block standing on footprint
// (x, y0, w, d) with height h draws a lit top face and a darker front face and
// rises upward on screen; the far-to-near row loop keeps the occlusion right.
const shadeCache = {};
function shadeC(col, amt) {
  const key = col + "|" + amt;
  let v = shadeCache[key];
  if (!v) {
    let cr, cg, cb;
    if (col[0] === "#") { const n = parseInt(col.slice(1), 16); cr = n >> 16 & 255; cg = n >> 8 & 255; cb = n & 255; }
    else { const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(col); cr = +m[1]; cg = +m[2]; cb = +m[3]; }
    const t = amt < 0 ? 0 : 255, a = Math.abs(amt);
    v = shadeCache[key] = "rgb(" + Math.round(cr + (t - cr) * a) + "," + Math.round(cg + (t - cg) * a) + "," + Math.round(cb + (t - cb) * a) + ")";
  }
  return v;
}
function block(x, y0, w, d, h, col, r) {
  r = r == null ? 3 : r;
  ctx.fillStyle = shadeC(col, -0.24);
  roundRect(x, y0 + d - h, w, h, r); ctx.fill();   // front face
  ctx.fillStyle = shadeC(col, 0.12);
  roundRect(x, y0 - h, w, d, r); ctx.fill();       // top face
}

// ---------- audio (tiny, no assets) ----------
let actx = null, masterGain = null;
let muted = false;
const activeRumbles = new Set();
const activeSirens = new Set();
function AC() {
  if (!actx) {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = actx.createGain();
    masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(actx.destination);
  }
  if (actx.state === "suspended") actx.resume();
  return actx;
}
function master() { return masterGain || AC().destination; } // everything routes here so it can be muted/paused
function applyMaster() { // silence when muted OR paused
  if (masterGain && actx) masterGain.gain.setTargetAtTime((muted || paused) ? 0 : 1, actx.currentTime, 0.02);
}
let noiseBuf = null;
function noiseBuffer() {
  if (noiseBuf) return noiseBuf;
  const a = AC();
  noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
// volume + stereo-position output node feeding the speakers
function makeOut(vol, pan) {
  const a = AC();
  const g = a.createGain(); g.gain.value = vol;
  if (a.createStereoPanner && pan != null) {
    const p = a.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    g.connect(p); p.connect(master());
  } else {
    g.connect(master());
  }
  return g;
}
function tone(f, d, ty, vol, t0) {
  const a = AC(), t = t0 != null ? t0 : a.currentTime;
  const o = a.createOscillator(), g = a.createGain();
  o.type = ty; o.frequency.value = f;
  o.connect(g); g.connect(master());
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.start(t); o.stop(t + d + 0.02);
  return { o, g };
}
function sfx(type) {
  try {
    if (type === "hop")    return void cluck(0.16, false);
    if (type === "crash")  return void tone(110, 0.30, "sawtooth", 0.08);
    if (type === "splash") return void splashSound();
    if (type === "eagle")  return void eagleScreech();
    if (type === "log")    return void logThunk();
    if (type === "pad")    return void padPlop();
  } catch (e) {}
}
// a chicken "bock!" cluck — pitch is randomized each call so no two hops sound identical.
// big=true → louder, lower panicked squawk used for deaths.
function cluck(vol, big) {
  try {
    const a = AC(), t = a.currentTime, out = makeOut(vol, 0);
    const base = (big ? 360 : 600) * (0.88 + Math.random() * 0.3);
    const o = a.createOscillator(), g = a.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(base * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(base, t + 0.04);
    o.frequency.exponentialRampToValueAtTime(base * 1.3, t + 0.09);
    o.connect(g); g.connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 0.24 : 0.13));
    o.start(t); o.stop(t + (big ? 0.26 : 0.15));
    const o2 = a.createOscillator(), g2 = a.createGain(); // nasal harmonic
    o2.type = "sawtooth"; o2.frequency.value = base * 2.1;
    o2.connect(g2); g2.connect(out);
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(big ? 0.18 : 0.12, t + 0.01);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o2.start(t); o2.stop(t + 0.1);
  } catch (e) {}
}
// high descending raptor screech for the eagle grab
function eagleScreech() {
  try {
    const a = AC(), t = a.currentTime, out = makeOut(0.42, 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(1500, t);
    o.frequency.exponentialRampToValueAtTime(650, t + 0.32);
    o.connect(g); g.connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    o.start(t); o.stop(t + 0.38);
    const n = a.createBufferSource(); n.buffer = noiseBuffer(); // raspy edge
    const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2100; bp.Q.value = 1.4;
    const ng = a.createGain();
    n.connect(bp); bp.connect(ng); ng.connect(out);
    ng.gain.setValueAtTime(0.12, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    n.start(t); n.stop(t + 0.32);
  } catch (e) {}
}
// bright two-note rising chime when crossing a score milestone (every 50)
function milestoneDing() {
  try {
    const a = AC(), t = a.currentTime, out = makeOut(0.4, 0);
    [880, 1320].forEach((f, i) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = "sine"; o.frequency.value = f;
      o.connect(g); g.connect(out);
      const st = t + i * 0.09;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.4, st + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.42);
      o.start(st); o.stop(st + 0.45);
    });
  } catch (e) {}
}
// quick bright "ding" when grabbing a coin
function coinPop() {
  try {
    const a = AC(), t = a.currentTime, out = makeOut(0.3, 0);
    [988, 1319].forEach((f, i) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = "triangle"; o.frequency.value = f;
      o.connect(g); g.connect(out);
      const st = t + i * 0.05;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.32, st + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.16);
      o.start(st); o.stop(st + 0.18);
    });
  } catch (e) {}
}
// soft UI blip when moving the menu selection (dir < 0 = up/prev, dir > 0 = down/next)
function menuTick(dir) {
  try {
    const a = AC(), t = a.currentTime, out = makeOut(0.16, 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = "triangle";
    const base = dir < 0 ? 620 : 480; // up = brighter, down = lower
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * 1.15, t + 0.025);
    o.connect(g); g.connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.start(t); o.stop(t + 0.08);
  } catch (e) {}
}
// wailing police siren (pitch wobbles between two tones) as a chase appears
// continuous wailing siren that runs for the duration of a chase; gain is set each frame from proximity
function startSiren(row) {
  try {
    const a = AC();
    const o = a.createOscillator(); o.type = "sawtooth"; o.frequency.value = 850;
    const lfo = a.createOscillator(), lfoG = a.createGain();
    lfo.type = "sine"; lfo.frequency.value = 2.2; lfoG.gain.value = 230; // the "wee-woo" wail
    lfo.connect(lfoG); lfoG.connect(o.frequency);
    const g = a.createGain(); g.gain.value = 0.0001;
    o.connect(g);
    // stereo panner so the siren sweeps across the field as the car drives past
    let pan = null;
    if (a.createStereoPanner) { pan = a.createStereoPanner(); pan.pan.value = 0; g.connect(pan); pan.connect(master()); }
    else { g.connect(master()); }
    o.start(); lfo.start();
    row.siren = { o, lfo, g, pan };
    activeSirens.add(row.siren);
  } catch (e) {}
}
function stopSiren(row) {
  if (row && row.siren) {
    const s = row.siren;
    try {
      if (actx) { s.g.gain.cancelScheduledValues(actx.currentTime); s.g.gain.setTargetAtTime(0.0001, actx.currentTime, 0.1); }
      const end = actx ? actx.currentTime + 0.4 : 0;
      s.o.stop(end); s.lfo.stop(end);
    } catch (e) { try { s.o.stop(); s.lfo.stop(); } catch (e2) {} }
    activeSirens.delete(s); row.siren = null;
  }
}
// watery splash: a noise burst sweeping low + a descending bloop
function splashSound() {
  try {
    const a = AC(), t = a.currentTime, out = makeOut(0.5, 0);
    const n = a.createBufferSource(); n.buffer = noiseBuffer();
    const lp = a.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(2600, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.26);
    const ng = a.createGain();
    n.connect(lp); lp.connect(ng); ng.connect(out);
    ng.gain.setValueAtTime(0.5, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    n.start(t); n.stop(t + 0.32);
    const o = a.createOscillator(), g = a.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(600, t);
    o.frequency.exponentialRampToValueAtTime(170, t + 0.18);
    o.connect(g); g.connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.start(t); o.stop(t + 0.24);
  } catch (e) {}
}
// hollow wooden thunk when the chicken lands on a log
function logThunk() {
  try {
    const a = AC(), t = a.currentTime, out = makeOut(0.5, 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    o.connect(g); g.connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.start(t); o.stop(t + 0.18);
    const n = a.createBufferSource(); n.buffer = noiseBuffer();
    const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 800; bp.Q.value = 2;
    const ng = a.createGain();
    n.connect(bp); bp.connect(ng); ng.connect(out);
    ng.gain.setValueAtTime(0.25, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    n.start(t); n.stop(t + 0.06);
  } catch (e) {}
}
// soft watery plop when the chicken lands on a lily pad
function padPlop() {
  try {
    const a = AC(), t = a.currentTime, out = makeOut(0.5, 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(170, t + 0.14);
    o.connect(g); g.connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.start(t); o.stop(t + 0.2);
    const n = a.createBufferSource(); n.buffer = noiseBuffer();
    const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1800;
    const ng = a.createGain();
    n.connect(bp); bp.connect(ng); ng.connect(out);
    ng.gain.setValueAtTime(0.12, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    n.start(t); n.stop(t + 0.12);
  } catch (e) {}
}
// metallic railroad-crossing bell clang (inharmonic partials + striker tick)
function bellDing(vol, pan) {
  try {
    const a = AC(), t = a.currentTime;
    const out = makeOut(0.35 * vol, pan);
    const f0 = 1046;
    [[1, 1], [2.76, 0.5], [5.4, 0.26], [8.9, 0.12]].forEach(([ratio, amp]) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = "sine"; o.frequency.value = f0 * ratio;
      o.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55 / ratio + 0.15);
      o.start(t); o.stop(t + 0.75);
    });
    const n = a.createBufferSource(); n.buffer = noiseBuffer();
    const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 3200;
    const ng = a.createGain();
    n.connect(bp); bp.connect(ng); ng.connect(out);
    ng.gain.setValueAtTime(0.4, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    n.start(t); n.stop(t + 0.05);
  } catch (e) {}
}
// diesel air-horn chord as the train arrives
function trainHorn(vol, pan) {
  try {
    const a = AC(), t = a.currentTime;
    const out = makeOut(0.5 * vol, pan);
    [233, 277, 349].forEach(f => {
      const o = a.createOscillator(), o2 = a.createOscillator(), g = a.createGain();
      o.type = "sawtooth"; o.frequency.value = f;
      o2.type = "sawtooth"; o2.frequency.value = f * 1.006;
      o.connect(g); o2.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.08);
      g.gain.setValueAtTime(0.16, t + 0.65);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
      o.start(t); o2.start(t); o.stop(t + 1.0); o2.stop(t + 1.0);
    });
  } catch (e) {}
}
// low filtered-noise rumble that runs while the train is on the track
function startRumble(row) {
  try {
    const a = AC();
    const src = a.createBufferSource(); src.buffer = noiseBuffer(); src.loop = true;
    const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 320;
    const g = a.createGain(); g.gain.value = 0.0001;
    src.connect(lp); lp.connect(g); g.connect(master());
    src.start();
    row.rumble = { src, g };
    activeRumbles.add(row.rumble);
  } catch (e) {}
}
function stopRumble(row) {
  if (row && row.rumble) {
    const rb = row.rumble;
    try {
      if (actx) {
        rb.g.gain.cancelScheduledValues(actx.currentTime);
        rb.g.gain.setTargetAtTime(0.0001, actx.currentTime, 0.13); // fade out instead of a hard cut
        rb.src.stop(actx.currentTime + 0.6);
      } else { rb.src.stop(); }
    } catch (e) { try { rb.src.stop(); } catch (e2) {} }
    activeRumbles.delete(rb);
    row.rumble = null;
  }
}
// continuous ambient traffic/road hum, volume set from how close the chicken is to a road lane.
// deliberately quiet — much softer than the train rumble.
let roadHum = null, roadHumTarget = 0;
function applyRoadHum() {
  if (!roadHum && roadHumTarget <= 0) return; // don't spin up audio until there's traffic nearby
  if (!roadHum) {
    try {
      const a = AC();
      const g = a.createGain(); g.gain.value = 0.0001; g.connect(master());
      // deep tyre/road rumble (low-passed noise — low cutoff so it rumbles instead of hissing)
      const src = a.createBufferSource(); src.buffer = noiseBuffer(); src.loop = true;
      const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 240;
      const ng = a.createGain(); ng.gain.value = 0.7;
      src.connect(lp); lp.connect(ng); ng.connect(g); src.start();
      // engine drone (a couple of low detuned saws) for an automotive body
      const o1 = a.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = 72;
      const o2 = a.createOscillator(); o2.type = "sawtooth"; o2.frequency.value = 95;
      const olp = a.createBiquadFilter(); olp.type = "lowpass"; olp.frequency.value = 300;
      const og = a.createGain(); og.gain.value = 0.28;
      o1.connect(olp); o2.connect(olp); olp.connect(og); og.connect(g); o1.start(); o2.start();
      // slow LFO on the rumble cutoff so traffic ebbs and flows
      const lfo = a.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.3;
      const lfoG = a.createGain(); lfoG.gain.value = 90;
      lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
      roadHum = { g };
    } catch (e) { return; }
  }
  if (actx) roadHum.g.gain.setTargetAtTime(roadHumTarget, actx.currentTime, 0.15);
}

// continuous water/stream babble, volume set from how close the chicken is to a river lane
let riverHum = null, riverHumTarget = 0;
function applyRiverHum() {
  if (!riverHum && riverHumTarget <= 0) return;
  if (!riverHum) {
    try {
      const a = AC();
      const g = a.createGain(); g.gain.value = 0.0001; g.connect(master());
      const src = a.createBufferSource(); src.buffer = noiseBuffer(); src.loop = true;
      const hp = a.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 600;
      const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1200; bp.Q.value = 0.6;
      src.connect(hp); hp.connect(bp); bp.connect(g); src.start();
      // gentle babbling: drift the band around so it shimmers like flowing water
      const lfo = a.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.45;
      const lfoG = a.createGain(); lfoG.gain.value = 450;
      lfo.connect(lfoG); lfoG.connect(bp.frequency); lfo.start();
      riverHum = { g };
    } catch (e) { return; }
  }
  if (actx) riverHum.g.gain.setTargetAtTime(riverHumTarget, actx.currentTime, 0.2);
}

// clatter of wheels over rail joints while passing
function trainClack(vol, pan) {
  try {
    const a = AC(), t = a.currentTime;
    const out = makeOut(vol, pan);
    const n = a.createBufferSource(); n.buffer = noiseBuffer();
    const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 150; bp.Q.value = 3;
    const env = a.createGain();
    n.connect(bp); bp.connect(env); env.connect(out);
    env.gain.setValueAtTime(0.45, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    n.start(t); n.stop(t + 0.15);
  } catch (e) {}
}

// ---------- palettes ----------
const CAR_COLORS = ["#e8483f", "#3fa9e8", "#f6c945", "#7bd16a", "#b76ce8", "#ff8a3d", "#56d6c0"];
const TRUCK_COLORS = ["#d94f4f", "#4f7fd9", "#e0a23a", "#5fae5f"];
function vehColor(type) {
  if (type === "police") return "#f2f2f5";
  if (type === "truck") return TRUCK_COLORS[randInt(0, TRUCK_COLORS.length - 1)];
  return CAR_COLORS[randInt(0, CAR_COLORS.length - 1)];
}

// ---------- world state ----------
let rows = {};
let nextRow = MINROW;
let sectionType = "grass";
let sectionRemaining = 0;

let state = "menu"; // menu | playing | dying | eagle | dead
let deathCause = "";
let deathAnim = null;
let bufferedMove = null; // one input queued while a hop is in progress
let hopCarrying = false; // true while sliding sideways along a moving log (carry its momentum mid-hop)
const MODES = [
  { id: "classic", label: "Classic",        desc: "Roads, rails & rivers" },
  { id: "cars",    label: "Cars & Trucks",  desc: "Roads only" },
  { id: "trains",  label: "Trains",         desc: "Railways only" },
  { id: "river",   label: "River",          desc: "Water only" }
];
let gameMode = "classic";
let menuSel = 0;
const highKey = (mode) => "crossy_high_" + mode;
const bestCoinsKey = (mode) => "crossy_bestcoins_" + mode; // coins collected during the run that set the high score
// storage is wrapped so private-browsing / disabled storage can't crash the game
function lsGet(k, dflt) { try { const v = localStorage.getItem(k); return v == null ? dflt : v; } catch (e) { return dflt; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function loadHigh(mode) { return +lsGet(highKey(mode), 0); }
function loadBestCoins(mode) { return +lsGet(bestCoinsKey(mode), 0); }
let highScore = loadHigh(gameMode);
let bestCoins = loadBestCoins(gameMode); // coins from the best run, shown next to "Best"
let prevHigh = 0; // best at the start of this run (for the "NEW BEST!" flourish)
let coins = 0;    // coins collected this run

// unlockable chicken skins (gated by the best score reached in any mode)
const SKINS = [
  { name: "Chick",    body: "#ffffff", comb: "#e8483f", beak: "#f5a623", tail: "#e8e8ee", unlock: 0 },
  { name: "Robin",    body: "#c65b3b", comb: "#8a2f1c", beak: "#f5d23a", tail: "#a84a30", unlock: 30 },
  { name: "Bluebird", body: "#4a8fe0", comb: "#e8483f", beak: "#f5a623", tail: "#3f7ec9", unlock: 75 },
  { name: "Duck",     body: "#f6d743", comb: "#f0a500", beak: "#ef7d2e", tail: "#e6c83a", unlock: 140 },
  { name: "Phoenix",  body: "#ff6a2b", comb: "#ffd23d", beak: "#ffe08a", tail: "#e8431f", unlock: 250 }
];
let skinSel = clamp((+lsGet("crossy_skin", 0)) | 0, 0, SKINS.length - 1);
function bestEver() { return Math.max(0, ...MODES.map(m => loadHigh(m.id))); }
function skinUnlocked(i) { return bestEver() >= SKINS[i].unlock; }

const player = { gx: Math.floor(COLS / 2), gy: 0, face: "up" };
let renderGx = player.gx, renderGy = player.gy;
let hopTimer = 0;
let idleTime = 0;
let maxRow = 0;
let lastMilestone = 0;          // highest 50-point score boundary we've already dinged
let cameraY = 0, autoScrollY = 0;
let eagle = null;
let policeTimer = 0;            // global scheduler: seconds until the next police chase on a random lane
let paused = false;
let squashT = 0;                // brief landing-squash timer for the hop animation
let feathers = [];              // burst of feathers on a crash death
let dusts = [];                 // little landing puffs at the chicken's feet
function spawnFeathers(sx, wy, col) {
  for (let i = 0; i < 12; i++) feathers.push({
    x: sx + rand(-8, 8), wy: wy + rand(-10, 2),
    vx: rand(-110, 110), vy: rand(-190, -40),
    rot: rand(0, 6.3), vr: rand(-7, 7), t: 0, col
  });
}
function spawnDust(sx, wy) {
  for (let i = 0; i < 5; i++) dusts.push({ x: sx + rand(-12, 12), wy: wy + rand(-2, 2), vx: rand(-26, 26), t: 0 });
}
// Visual FX on only: the hop's motion-blur trail (the chicken's last few
// poses, newest last), a burst of sparkles off a collected coin, and a short
// screen shake when the chicken is hit
let trail = [];
const TRAIL_SEC = 0.07;
let sparkles = [];
let shakeT = 0;
const SHAKE_DUR = 0.35;
function spawnSparkles(sx, wy) {
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand(-0.2, 0.2), sp = rand(100, 190);
    sparkles.push({ x: sx, wy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, rot: rand(0, 6.3), t: 0, life: rand(0.35, 0.55), white: i % 3 === 0 });
  }
}
function updateFx(dt) {
  if (feathers.length) {
    for (const f of feathers) { f.t += dt; f.x += f.vx * dt; f.wy += f.vy * dt; f.vy += 300 * dt; f.rot += f.vr * dt; }
    feathers = feathers.filter(f => f.t < 0.9);
  }
  if (dusts.length) {
    for (const d of dusts) { d.t += dt; d.x += d.vx * dt; d.wy -= 10 * dt; }
    dusts = dusts.filter(d => d.t < 0.4);
  }
  if (sparkles.length) {
    for (const s of sparkles) { s.t += dt; s.x += s.vx * dt; s.wy += s.vy * dt; s.vx *= Math.pow(0.08, dt); s.vy *= Math.pow(0.08, dt); s.rot += 5 * dt; }
    sparkles = sparkles.filter(s => s.t < s.life);
  }
  if (shakeT > 0) shakeT -= dt;
}
function drawFx() { // particles live in world space, so they stay put as the camera scrolls
  for (const d of dusts) {
    const k = d.t / 0.4;
    ctx.fillStyle = "rgba(255,252,235," + (0.5 * (1 - k)).toFixed(2) + ")";
    ctx.beginPath(); ctx.arc(d.x, d.wy - cameraY, 3 + 9 * k, 0, 7); ctx.fill();
  }
  for (const f of feathers) {
    const k = f.t / 0.9;
    ctx.save();
    ctx.translate(f.x, f.wy - cameraY);
    ctx.rotate(f.rot);
    ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
    ctx.fillStyle = f.col;
    ctx.beginPath(); ctx.ellipse(0, 0, 6, 2.6, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  for (const s of sparkles) { // four-point twinkles, shrinking as they fade
    const k = s.t / s.life, r = 9 * (1 - k * 0.6);
    ctx.save();
    ctx.translate(s.x, s.wy - cameraY);
    ctx.rotate(s.rot);
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = s.white ? "#fffbe6" : "#ffd23d";
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const rr = i % 2 ? r * 0.28 : r, a = i * Math.PI / 4;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
const SQUASH_DUR = 0.13;
let scorePopT = 0;              // brief HUD score "pop" timer, started on each 50-point milestone
const SCORE_POP_DUR = 0.7;     // a little under a second so a fast run still shows the grow-and-shrink
let coinPops = [];              // floating "+1"s over just-collected coins
const COIN_POP_DUR = 0.8;

function difficulty() {
  const base = Math.min(2.3, 1 + maxRow * 0.012); // original ramp up to score ~108
  return Math.min(3.6, base + Math.max(0, maxRow - 108) * 0.0035); // keeps creeping up past 108
}
function scrollSpeed() { return Math.min(105, 40 + maxRow * 0.7); }

// ---------- generation ----------
function makeDecos(trees) {
  const d = [];
  for (let c = 0; c < COLS; c++) {
    if (!trees.has(c) && Math.random() < 0.13) {
      d.push({ col: c, dx: rand(0.15, 0.85), dy: rand(0.2, 0.8), hue: Math.random() < 0.5 ? "#ff5d8f" : "#ffd23d" });
    }
  }
  return d;
}

// Place items of the given lengths around the loop with random gaps that sum to exactly `cycle`.
// Guarantees every gap (including the wrap-around seam) is >= minGap, so nothing ever overlaps or tailgates.
function placeAround(cycle, lens, minGap, maxGap) {
  const n = lens.length;
  const total = lens.reduce((a, b) => a + b, 0);
  let slack = cycle - total - minGap * n;
  if (slack < 0) slack = 0;
  // each gap gets an independent random weight, so within a single lane some gaps come out small and
  // others large (wide spread → pronounced, car-like variation, not a uniform spacing)
  const w = []; let wsum = 0;
  for (let i = 0; i < n; i++) { w[i] = 0.2 + Math.random() * 2.5; wsum += w[i]; }
  const gaps = w.map(wi => minGap + slack * wi / wsum);
  // cap the largest gaps, pushing the overflow into the smaller ones (total stays = cycle, loop seamless)
  if (maxGap) {
    for (let it = 0; it < 5; it++) {
      let over = 0, room = 0;
      for (let i = 0; i < n; i++) if (gaps[i] > maxGap) { over += gaps[i] - maxGap; gaps[i] = maxGap; }
      if (over < 0.01) break;
      for (let i = 0; i < n; i++) if (gaps[i] < maxGap) room += maxGap - gaps[i];
      if (room < 0.01) break;
      for (let i = 0; i < n; i++) if (gaps[i] < maxGap) gaps[i] += over * (maxGap - gaps[i]) / room;
    }
  }
  const items = [];
  let pos = Math.random() * cycle;
  for (let i = 0; i < n; i++) {
    items.push({ pos: mod(pos, cycle), len: lens[i] });
    pos += lens[i] + gaps[i];
  }
  return items;
}

// Roads use LINEAR traffic (not a wrap-around loop): cars drive in from one edge and off the other,
// new ones spawn from the entry edge. This lets a police chase clear the lane and let it refill naturally.
function newVehicle(row, x) {
  const type = Math.random() < TRUCK_CHANCE ? "truck" : "car";
  const len = type === "truck" ? 2.8 : 1.5;
  return { x, len, type, color: vehColor(type) };
}
function prefillRoad(row) { // spread cars across the whole lane so it doesn't start empty
  let x = -3 + rand(0, 2);
  while (x < COLS + 3) {
    const v = newVehicle(row, x); row.items.push(v);
    x += v.len + rand(2.4, 4.5);
  }
}
function makeRoadRow(diff) {
  const row = {
    type: "road", dir: Math.random() < 0.5 ? 1 : -1, speed: rand(1.8, 3.5) * diff,
    items: [], gap: rand(2.4, 4.5),
    police: { state: "none", timer: 0, x: 0, speed: 0, dir: 1, type: "police", len: 1.5 }
  };
  prefillRoad(row);
  return row;
}
// advance a road lane: move cars, cull those that drove off, run the chase, spawn from the entry edge
function updateRoad(row, dt, r) {
  // normal cars never change speed for a chase; the lane clears only because no NEW cars spawn during
  // one (see spawnTraffic gating), so the cars already on it simply drive off as usual
  const v = row.dir * row.speed * dt;
  for (const it of row.items) it.x += v;
  row.items = row.items.filter(it => row.dir > 0 ? it.x < COLS + 2 : it.x + it.len > -2);
  updatePolice(row, dt, r);
  // resume normal traffic when there's no chase, OR as soon as the speeding emergency vehicle has pulled
  // a safe gap onto the screen — a fresh car enters at the edge BEHIND it (the police is faster, so the
  // gap only widens), no rear-ending. We no longer wait for it to reach the midpoint / fully leave.
  const p = row.police;
  const SAFE_BEHIND = 3.0; // cells of clear road kept behind the police before the next car spawns
  const reSpawn = p.state === "none" ||
    (p.state === "active" && (p.dir > 0 ? p.x > -2 + SAFE_BEHIND : p.x + p.len < COLS + 2 - SAFE_BEHIND));
  if (reSpawn) spawnTraffic(row);
}
function spawnTraffic(row) {
  if (row.items.length >= 5) return;
  const entry = row.dir > 0 ? -2 : COLS + 2;
  let gap = Infinity;
  if (row.items.length) {
    if (row.dir > 0) { let m = Infinity; for (const it of row.items) m = Math.min(m, it.x); gap = m - entry; }
    else { let m = -Infinity; for (const it of row.items) m = Math.max(m, it.x + it.len); gap = entry - m; }
  }
  if (gap > row.gap) {
    const v = newVehicle(row, 0);
    v.x = row.dir > 0 ? entry - v.len : entry; // just off the entry edge
    row.items.push(v);
    row.gap = rand(2.4, 4.6); // randomize the next spawn gap
  }
}

// A river lane is EITHER all moving logs OR all stationary lily pads — never mixed.
// forceLogs prevents two stationary pad rows from stacking (which can be uncrossable).
function makeRiverRow(diff, forceLogs) {
  const cycle = COLS + 2 * LEFTBUF;
  if (forceLogs || Math.random() < 0.85) {
    // moving logs (the dominant river lane): drifts and carries the chicken along
    const dir = Math.random() < 0.5 ? 1 : -1;
    const speed = rand(1.0, 2.3) * diff;
    const minGap = 1.0;               // at least one cell of open water between logs
    const targetGap = rand(1.6, 2.0); // keeps the average gap well below the cap so variation shows
    const lens = [];
    let total = 0;
    while (lens.length < 8) {
      const len = [1, 2, 2, 3, 3, 4][randInt(0, 5)]; // mostly 2-3, with the occasional 1- and 4-cell log
      // reserve targetGap of water per log when deciding how many fit, so gaps aren't crammed together
      if (total + len + targetGap * (lens.length + 1) > cycle) break;
      lens.push(len); total += len;
    }
    if (!lens.length) lens.push(3);
    // placeAround keeps a 1-cell minimum but distributes the leftover water very unevenly → gaps of 1, 2, 3+
    const items = placeAround(cycle, lens, minGap, 3.4).map(p => ({ pos: p.pos, len: p.len, type: "log" }));
    return { type: "river", variant: "logs", dir, speed, cycle, items, shift: Math.random() * cycle };
  }
  // stationary lily pads: fixed safe spots, never two open-water columns in a row so it stays crossable
  const items = [];
  let waterRun = 0;
  for (let c = 0; c < COLS; c++) {
    const pad = waterRun >= 2 ? true : Math.random() < 0.45; // fewer pads, but never more than 2 open columns in a row
    if (pad) { items.push({ pos: c + LEFTBUF, len: 1, type: "pad" }); waterRun = 0; }
    else waterRun++;
  }
  if (!items.length) items.push({ pos: randInt(0, COLS - 1) + LEFTBUF, len: 1, type: "pad" });
  return { type: "river", variant: "pads", dir: 1, speed: 0, cycle, items, shift: 0 };
}

function pickSection() {
  // Themed modes are overwhelmingly their obstacle, with only an occasional single grass row to breathe.
  if (gameMode !== "classic") {
    const obstacle = gameMode === "cars" ? "road" : gameMode === "trains" ? "rail" : "river";
    const grassChance = gameMode === "river" ? 0.20 : gameMode === "trains" ? 0.16 : 0.14;
    if (Math.random() < grassChance) { sectionType = "grass"; sectionRemaining = 1; return; }
    sectionType = obstacle;
    sectionRemaining = obstacle === "road" ? randInt(2, 5) : obstacle === "river" ? randInt(1, 3) : randInt(1, 2);
    return;
  }
  sectionType = weighted(["grass", "road", "river", "rail"], [0.27, 0.33, 0.18, 0.22]);
  if (sectionType === "grass") sectionRemaining = randInt(1, 2);
  else if (sectionType === "road") sectionRemaining = randInt(1, 4);
  else if (sectionType === "river") sectionRemaining = randInt(1, 3);
  else sectionRemaining = randInt(1, 2);
}

function generateRow(r) {
  let row;
  if (r <= 3) {
    const trees = new Set();
    row = { type: "grass", trees, decos: makeDecos(trees) };
  } else {
    if (sectionRemaining <= 0) pickSection();
    sectionRemaining--;
    const diff = difficulty();
    if (sectionType === "grass") {
      const trees = new Set();
      const maxT = Math.floor(COLS * 0.38); // capped low so trees can't box the chicken in
      const count = randInt(0, maxT);
      while (trees.size < count) trees.add(randInt(0, COLS - 1));
      row = { type: "grass", trees, decos: makeDecos(trees) };
    } else if (sectionType === "road") {
      row = makeRoadRow(diff);
    } else if (sectionType === "river") {
      const prev = rows[r - 1];
      const forceLogs = prev && prev.type === "river" && prev.variant === "pads"; // no two pad rows in a row
      row = makeRiverRow(diff, forceLogs);
    } else {
      row = {
        type: "rail", dir: Math.random() < 0.5 ? 1 : -1,
        speed: TRAIN_SPEED, state: "idle",
        timer: rand(0.3, 4.5), blink: 0, // wide random initial delay → no predictable "train on reveal" pattern
        trainLen: COLS + 2, trainX: 0,
        bellTimer: 0, bellHi: false, clackTimer: 0
      };
    }
    maybeAddCoin(row, r);
  }
  rows[r] = row;
}

// Occasionally drop a coin on a risky-but-reachable cell (collect it for bonus score).
// Spawn chance varies by terrain (all kept fairly low): safe grass is stingy, the riskier
// road/river lanes pay out a bit more, and the rails — grab-it-before-the-train gamble — are rarest.
const COIN_CHANCE = { grass: 0.08, road: 0.14, river: 0.13, rail: 0.06 };
function maybeAddCoin(row, r) {
  if (Math.random() > (COIN_CHANCE[row.type] || 0.10)) return;
  if (row.type === "grass") {
    const open = [];
    for (let c = 0; c < COLS; c++) if (!row.trees.has(c)) open.push(c);
    if (!open.length) return;
    row.coin = { col: open[randInt(0, open.length - 1)], got: false };
  } else if (row.type === "river" && row.variant === "logs") {
    if (!row.items.length) return;
    const log = row.items[randInt(0, row.items.length - 1)];
    row.coin = { log, k: randInt(0, log.len - 1), got: false }; // rides a cell of that log
  } else if (row.type === "river") {       // lily-pad lane → sit on one of the pads
    if (!row.items.length) return;
    const pad = row.items[randInt(0, row.items.length - 1)];
    row.coin = { col: Math.round(itemCol(row, pad)), got: false };
  } else {
    // road or rail: a riskier middle cell (on the tracks, it must be grabbed before the train arrives)
    row.coin = { col: randInt(1, COLS - 2), got: false };
  }
}

function ensureRows(upTo) {
  while (nextRow <= upTo) { generateRow(nextRow); nextRow++; }
}
function getRow(r) {
  if (!rows[r]) { ensureRows(r); }
  return rows[r];
}
function prune() {
  const low = player.gy - VIS_ROWS - 4;
  for (const k in rows) if (+k < low) { if (rows[k].rumble) stopRumble(rows[k]); if (rows[k].siren) stopSiren(rows[k]); delete rows[k]; }
}

// ---------- geometry ----------
const itemCol = (row, item) => mod(item.pos + row.shift, row.cycle) - LEFTBUF;
const rowTopY = (r) => (-r * TILE - cameraY) - TILE / 2;

// ---------- updates ----------
function updateRow(row, dt, r) {
  if (row.type === "road") {
    updateRoad(row, dt, r); // linear traffic + police chase
  } else if (row.type === "river") {
    row.shift += row.dir * row.speed * dt;
  } else if (row.type === "rail") {
    // volume tracks distance to the railway every frame, so it swells/fades live as the chicken
    // moves toward or away from the tracks while the train is mid-pass
    const f = clamp(1 - Math.abs(r - player.gy) / 7, 0, 1);
    updateRail(row, dt, state === "playing" ? f : 0);
  }
}

// Scripted chase, triggered at random by the scheduler: the existing cars first DRIVE OFF the road
// (clearing), then siren + flashing light, then a fast police car, then normal traffic resumes from the edge.
function triggerPolice(row) {
  // only cars still fully off-screen (not yet entered) are dropped, unnoticed; every car on/near the
  // screen keeps driving at its normal speed and leaves the road on its own
  row.items = row.items.filter(it => row.dir > 0 ? it.x + it.len > -PAD : it.x < COLS + PAD);
  const p = row.police;
  p.state = "clearing";
  p.dir = row.dir;                            // same direction as this lane's normal traffic
  const big = Math.random() < TRUCK_CHANCE;   // fire truck as often as a normal truck; police as often as a car
  p.type = big ? "firetruck" : "police";
  p.len = big ? 2.8 : 1.5;                     // same size/hitbox as a normal truck / car
  // always a clear margin above the fastest a normal car can go (3.5 × difficulty), and below the train (~28)
  p.speed = clamp(3.5 * difficulty() + rand(5, 9), 12, 23);
  p.sirenDone = false; // the short siren flash fires once, just as the lane finishes clearing
}

// every so often, launch a chase on a random on-screen road lane (preferring lanes ahead of the chicken)
function schedulePolice(dt) {
  policeTimer -= dt;
  if (policeTimer > 0) return;
  const cands = [];
  for (let r = player.gy - 2; r <= player.gy + VIS_ROWS - 2; r++) {
    const row = rows[r];
    if (row && row.type === "road" && row.police.state === "none") cands.push(row);
  }
  // exponential (memoryless) gap: consecutive chases are sometimes close together, sometimes far apart —
  // no fixed cadence. The 5s floor stops them getting spammy; the cap avoids a freak multi-minute drought.
  if (cands.length) { triggerPolice(cands[randInt(0, cands.length - 1)]); policeTimer = 5 + Math.min(45, -Math.log(1 - Math.random()) * 14); }
  else policeTimer = 1.5; // no eligible road lane on screen — check again shortly
}

function nearlyClear(row) { // last car(s) are right at the exit edge, lane about to be empty
  const p = row.police;
  return row.items.every(it => p.dir > 0 ? it.x > COLS - 1.5 : it.x + it.len < 1.5);
}
// True once the police can burst in close behind the LAST departing car without a visible rear-end.
// It enters from the entry edge and is faster than the traffic, so we require enough lead that it can't
// catch the trailing car before that car has driven off the far edge (derived from the two speeds).
function policeCanEnter(row) {
  const p = row.police;
  if (!row.items.length) return true;                      // lane already empty → go now
  const closeRate = (p.speed - row.speed) / row.speed;     // gap the police eats per cell the car travels
  if (p.dir > 0) {
    let cx = Infinity; for (const it of row.items) cx = Math.min(cx, it.x); // trailing car's rear
    const gap = cx + 1;                  // police leading edge sits at x ≈ -1 on entry
    const dExit = (COLS + 2) - cx;       // distance the rear still travels before it's culled
    return gap >= dExit * closeRate * 1.15 + 0.5;          // ×1.15 + 0.5: comfort margin
  } else {
    let cx = -Infinity; for (const it of row.items) cx = Math.max(cx, it.x + it.len); // trailing car's rear
    const gap = (COLS + 1) - cx;         // police leading edge sits at x ≈ COLS+1 on entry
    const dExit = cx + 2;                // distance the rear still travels before it's culled
    return gap >= dExit * closeRate * 1.15 + 0.5;
  }
}
function updatePolice(row, dt, r) {
  const p = row.police;
  // siren plays through the vehicle's whole on-screen sweep (then fades on exit); proximity-scaled
  if (row.siren && actx) {
    // vertical: how many rows away the chase lane is from the chicken (always measured
    // against the player's row, never the camera, so it's symmetric above/below)
    const vVert = clamp(1 - Math.abs(r - player.gy) / 9, 0, 1);
    // horizontal: the car's centre column. During the warning ("clearing") phase the
    // car hasn't entered yet, so treat it as sitting at the entry edge it's about to
    // drive in from. That keeps the loudness/pan continuous from the warning straight
    // into the on-screen sweep — no jump when the car actually spawns.
    const carCenter = (p.state === "active" ? p.x : (p.dir > 0 ? -p.len - 1 : COLS + 1)) + p.len / 2;
    const dx = carCenter - (renderGx + 0.5);
    const hHoriz = clamp(1 - Math.abs(dx) / 9, 0, 1);
    // siren grows smoothly as it nears our column and fades/pans away as it passes
    const amp = vVert * (0.4 + 0.6 * hHoriz);
    const pan = clamp(dx / (COLS / 2), -1, 1);
    const vol = state === "playing" ? amp : 0;
    row.siren.g.gain.setTargetAtTime(0.3 * vol, actx.currentTime, 0.06);
    if (row.siren.pan) row.siren.pan.pan.setTargetAtTime(pan, actx.currentTime, 0.08);
  }
  if (p.state === "clearing") {
    // brief siren + light flash, fired by the time the chase is ready to burst in
    if (!row.siren && !p.sirenDone && (nearlyClear(row) || policeCanEnter(row))) { startSiren(row); p.sirenDone = true; }
    // the chase enters close behind the last departing car (safe-gap checked), not after a fully empty road
    if (policeCanEnter(row)) { p.state = "active"; p.x = p.dir > 0 ? -p.len - 1 : COLS + 1; }
  } else if (p.state === "active") {
    p.x += p.dir * p.speed * dt;
    // once it's gone, state returns to "none" and spawnTraffic refills the lane from the entry edge
    if ((p.dir > 0 && p.x > COLS + 1.5) || (p.dir < 0 && p.x < -p.len - 1.5)) { p.state = "none"; stopSiren(row); }
  }
}

function updateRail(row, dt, vol) {
  row.blink += dt;
  row.timer -= dt;
  const pan = row.dir > 0 ? -0.55 : 0.55; // light/train comes from this side
  if (row.state === "idle") {
    if (row.timer <= 0) { row.state = "warn"; row.timer = 1.5; row.bellTimer = 0; }
  } else if (row.state === "warn") {
    // bell rings + light flashes only here, right before the train arrives
    row.bellTimer -= dt;
    if (row.bellTimer <= 0) { if (vol > 0.01) bellDing(vol, pan); row.bellTimer = 0.34; }
    if (row.timer <= 0) {
      row.state = "active";
      row.trainX = row.dir > 0 ? -row.trainLen - 1 : COLS + 1;
      row.clackTimer = 0;
      if (vol > 0.01) trainHorn(vol, pan);
      startRumble(row);
    }
  } else if (row.state === "active") {
    // train on the track: rumble + wheel clatter, no bell, no flashing light.
    // scale by how much of the train is on screen so it swells in and fades out as it passes.
    const onScreen = clamp((Math.min(row.trainX + row.trainLen, COLS) - Math.max(row.trainX, 0)) / COLS, 0, 1);
    if (row.rumble && actx) row.rumble.g.gain.setTargetAtTime(0.5 * vol * Math.sqrt(onScreen), actx.currentTime, 0.06);
    row.clackTimer -= dt;
    if (row.clackTimer <= 0) { if (vol > 0.01 && onScreen > 0.05) trainClack(vol * onScreen, pan); row.clackTimer = 0.12; }
    row.trainX += row.dir * row.speed * dt;
    if (row.dir > 0 && row.trainX > COLS + 1) resetRail(row);
    if (row.dir < 0 && row.trainX < -row.trainLen - 1) resetRail(row);
  }
}
function resetRail(row) { stopRumble(row); row.state = "idle"; row.timer = rand(1.4, 5.2); }

function updateScenery(dt) {
  roadHumTarget = 0; riverHumTarget = 0; // no gameplay ambience on the menu / game-over screens
  animateLanes(dt);  // keep every visible lane moving around where we are
  schedulePolice(dt); // chases keep happening in the background on the menu / game-over scene too
  // a chicken stuck to a car/train keeps being dragged right off the screen, even on the game-over screen
  if (state === "dead" && deathAnim) { deathAnim.t += dt; deathAnim.gx += deathAnim.carryVX * dt; }
}

// the log/pad the chicken's center is currently over (with a little grab tolerance), or null for open water
function findPlatform(row, cx) {
  for (const it of row.items) {
    const c = itemCol(row, it);
    if (cx > c - 0.3 && cx < c + it.len + 0.3) return it;
  }
  return null;
}

// only called once the chicken has landed: ride the log it's on, or drown
function riverUpdate(dt) {
  const row = getRow(player.gy);
  if (row.type !== "river") return;
  const plat = findPlatform(row, player.gx + 0.5);
  if (plat) {
    const delta = row.dir * row.speed * dt; // carried by the log (pads have speed 0)
    player.gx += delta;
    renderGx += delta; // move the render in lockstep with the log; the lerp smoothly settles the centering snap
    // carried into the shaded margin → swept away riding the log (not a
    // drown-in-place). Only when the log is carrying the chicken OUTWARD: a
    // log moving back toward the play area is bringing it to safety, so a
    // landing that edged past the line on an inbound log survives the ride.
    if ((player.gx > COLS - 0.5 && row.dir > 0) || (player.gx < -0.5 && row.dir < 0)) {
      death("swept", row.dir * row.speed, row.dir);
    }
  } else {
    death("water"); // no platform under us → fell in and drowned
  }
}

function checkCollisions(airborne) {
  if (Math.round(renderGy) !== player.gy) return; // mid-hop between rows → in transit, not in either lane yet
  const row = getRow(player.gy);
  const cx = renderGx + 0.5, half = 0.26; // hitbox ≈ the chicken sprite, so real gaps are squeezable
  // airborne → the chicken hopped into the vehicle (splat on contact, carried along);
  // otherwise it was run over while standing still (flattened in place, no dragging)
  if (row.type === "road") {
    for (const it of row.items) {
      if (cx + half > it.x && cx - half < it.x + it.len) {
        death(airborne ? "carjump" : "runover", airborne ? row.dir * row.speed : 0, row.dir); return;
      }
    }
    const p = row.police;
    if (p.state === "active" && cx + half > p.x && cx - half < p.x + p.len) {
      death(airborne ? "carjump" : "runover", airborne ? row.dir * p.speed : 0, row.dir); return;
    }
  } else if (row.type === "rail" && row.state === "active") {
    if (cx + half > row.trainX && cx - half < row.trainX + row.trainLen) {
      death("trainhit", row.dir * row.speed, row.dir); return; // run over or jumped in → carried with the train
    }
  }
}

function cameraStep(dt) {
  const target = -player.gy * TILE - H * 0.62;
  autoScrollY -= scrollSpeed() * dt;
  if (target < autoScrollY) autoScrollY = target;
  cameraY += (autoScrollY - cameraY) * Math.min(1, dt * 10);
}

function updatePlaying(dt) {
  ensureRows(player.gy + VIS_ROWS + 3);
  prune();
  let rp = 0, rivP = 0;
  for (let r = player.gy - VIS_ROWS; r <= player.gy + VIS_ROWS; r++) {
    const row = rows[r]; if (row) updateRow(row, dt, r);
    if (!row) continue;
    const near = clamp(1 - Math.abs(r - player.gy) / 6, 0, 1);
    if (row.type === "road" && row.items.length) rp = Math.max(rp, near);
    else if (row.type === "river") rivP = Math.max(rivP, near);
  }
  roadHumTarget = rp * rp * 0.09;  // ambient traffic, scaled by proximity, kept well under the train
  riverHumTarget = rivP * rivP * 0.07; // ambient flowing water near river lanes

  schedulePolice(dt);

  // advance the current hop and detect the exact frame the chicken lands
  const wasAir = hopTimer > 0;
  if (hopTimer > 0) hopTimer -= dt;
  const landed = hopTimer <= 0;
  const justLanded = wasAir && landed;
  if (squashT > 0) squashT -= dt;
  if (justLanded) { squashT = SQUASH_DUR; spawnDust((renderGx + 0.5) * TILE, -renderGy * TILE + 12); } // landing squash + dust puff

  // mid-hop along a log: ride its momentum so a sideways hop nets one cell relative to the log
  if (!landed && hopCarrying) {
    const row = getRow(player.gy);
    if (row.type === "river") player.gx += row.dir * row.speed * dt;
  }

  renderGx += (player.gx - renderGx) * Math.min(1, dt * 18);
  renderGy += (player.gy - renderGy) * Math.min(1, dt * 18);

  // Visual FX on: remember the last few poses for the hop's motion-blur trail
  // (world coordinates, so it stays put as the camera scrolls); on the ground
  // it drains away, so a standing chicken has none
  if (!fxOff() && (hopTimer > 0 || squashT > 0)) {
    const ps = hopPose();
    trail.push({ x: (renderGx + 0.5) * TILE, wy: -renderGy * TILE, lift: ps.lift, sclX: ps.sclX, sclY: ps.sclY, face: player.face, t: performance.now() });
  }
  const cut = performance.now() - TRAIL_SEC * 1000;
  while (trail.length && trail[0].t < cut) trail.shift();

  // Road/rail collisions are continuous against the chicken's real position: a jump-in flattens the
  // instant it touches the vehicle (no waiting to land), while a vehicle that clears the cell is dodged.
  checkCollisions(wasAir);
  if (state !== "playing") return;

  // River land/drown stays landing-based so the chicken doesn't drown mid-hop over open water.
  if (landed) {
    if (justLanded) onLanded();   // align onto the log + play the log/pad landing sound
    riverUpdate(dt);              // ride the log, or drown
    if (state !== "playing") return;
    if (justLanded && bufferedMove) { // run one queued input now that we've safely landed
      const b = bufferedMove; bufferedMove = null;
      doMove(b[0], b[1]);
    }
  }

  // collect a coin on the chicken's cell
  const crow = getRow(player.gy);
  if (crow.coin && !crow.coin.got && Math.abs(player.gx - coinColOf(crow)) < 0.5) {
    crow.coin.got = true; coins++; coinPop();
    if (!fxOff()) spawnSparkles(coinColOf(crow) * TILE + TILE / 2, -player.gy * TILE);
    // anchored to the coin's row (not the screen) so it stays over the chicken while the camera catches up
    coinPops.push({ x: coinColOf(crow) * TILE + TILE / 2, r: player.gy, t: 0 });
    checkMilestone(); // a coin can push the score across a 50-boundary too
  }

  idleTime += dt;
  cameraStep(dt);
  // eagle strikes once the autoscroll has pushed the chicken's row down to the bottommost row
  if (-player.gy * TILE - cameraY > EAGLE_BORDER) triggerEagle();
}

// keep all visible lanes (cars, logs, trains) moving in the background during non-playing states
function animateLanes(dt) {
  for (let r = player.gy - VIS_ROWS; r <= player.gy + VIS_ROWS; r++) {
    const row = rows[r]; if (row) updateRow(row, dt, r);
  }
}

function updateDying(dt) {
  roadHumTarget = 0; riverHumTarget = 0;
  animateLanes(dt);
  const da = deathAnim;
  da.t += dt;
  da.gx += da.carryVX * dt; // carried deaths (train / jumped into vehicle) slide away
  if (da.t >= da.dur) state = "dead";
}

function updateEagle(dt) {
  roadHumTarget = 0; riverHumTarget = 0;
  animateLanes(dt);
  eagle.t += dt;
  const targetY = -renderGy * TILE - cameraY;
  eagle.x = (renderGx + 0.5) * TILE;
  if (eagle.t < eagle.diveDur) {
    eagle.grabbed = false;
    eagle.y = eagle.startY + (targetY - eagle.startY) * (eagle.t / eagle.diveDur);
  } else {
    if (!eagle.grabbed) cluck(0.55, true); // the chicken's squawk at the moment of the grab
    eagle.grabbed = true; // snatched the chicken, now climbing back out of frame with it
    const ct = clamp((eagle.t - eagle.diveDur) / eagle.carryDur, 0, 1);
    eagle.y = targetY + (-180 - targetY) * ct;
  }
  if (eagle.t >= eagle.diveDur + eagle.carryDur) finalizeDeath("eagle");
}

// ---------- death / lifecycle ----------
function death(cause, carryVX, dir) {
  if (state !== "playing") return;
  state = "dying";
  deathCause = cause;
  deathAnim = {
    cause, t: 0, gx: renderGx, gy: renderGy, face: player.face, // exactly where the chicken is on impact
    carryVX: carryVX || 0, dir: dir || 0, // dir = which way the vehicle/log was travelling (carry + smear)
    dur: (cause === "trainhit" || cause === "carjump" || cause === "swept") ? 1.1 : 0.9
  };
  sfx(cause === "water" || cause === "swept" ? "splash" : "crash");
  if (cause !== "water" && cause !== "swept") {
    spawnFeathers((renderGx + 0.5) * TILE, -renderGy * TILE, (SKINS[skinSel] || SKINS[0]).body);
    if (!fxOff()) shakeT = SHAKE_DUR; // the hit shakes the screen (Visual FX on)
  }
  trail = [];
  cluck(0.6, true); // loud panicked death squawk
  saveScore();
}
function triggerEagle() {
  if (state !== "playing") return;
  state = "eagle";
  deathCause = "eagle";
  eagle = { t: 0, diveDur: 0.5, carryDur: 0.65, startY: -130, x: (renderGx + 0.5) * TILE, y: -130, grabbed: false };
  sfx("eagle"); // screech as it dives in
  saveScore(); // (already saved as it was passed; the swoop can't change it)
}
function finalizeDeath(cause) {
  state = "dead";
  deathCause = cause;
  saveScore();
}
function score() { return maxRow + coins; } // rows crossed + coins collected
// Ding once for each new multiple-of-50 the *score* crosses (rows + coins), in every mode.
// Tracks boundaries instead of testing `score % 50 === 0` so a coin that jumps the score
// past a boundary still triggers exactly one ding.
// Called whenever the score goes up, so it also saves the best the moment
// the run passes it (not only at the death), and closing the tab keeps it.
function checkMilestone() {
  const m = Math.floor(score() / 50);
  if (m > lastMilestone) { lastMilestone = m; milestoneDing(); scorePopT = SCORE_POP_DUR; }
  saveScore();
}
function saveScore() {
  if (score() > highScore) {
    highScore = score(); bestCoins = coins; // record this run's coins alongside the new best
    lsSet(highKey(gameMode), highScore); lsSet(bestCoinsKey(gameMode), bestCoins);
  }
}

function resetWorld() {
  activeRumbles.forEach(rb => { try { rb.src.stop(); } catch (e) {} });
  activeRumbles.clear();
  activeSirens.forEach(s => { try { s.o.stop(); s.lfo.stop(); } catch (e) {} });
  activeSirens.clear();
  rows = {};
  nextRow = MINROW;
  sectionRemaining = 0;
  player.gx = Math.floor(COLS / 2);
  player.gy = 0;
  player.face = "up";
  renderGx = player.gx; renderGy = player.gy;
  hopTimer = 0; idleTime = 0; maxRow = 0; lastMilestone = 0; coins = 0; squashT = 0; scorePopT = 0; coinPops = []; eagle = null; deathAnim = null; policeTimer = rand(4, 12); bufferedMove = null; hopCarrying = false; feathers = []; dusts = [];
  trail = []; sparkles = []; shakeT = 0;
  ensureRows(VIS_ROWS + 3);
  cameraY = autoScrollY = -player.gy * TILE - H * 0.62;
}

function startCurrentMode() { // (re)start the currently selected mode
  highScore = loadHigh(gameMode);
  bestCoins = loadBestCoins(gameMode);
  prevHigh = highScore; // remember so we can flag a new best at game over
  resetWorld();
  paused = false; applyMaster();
  state = "playing";
  idleTime = 0;
}
function startSelectedMode() { gameMode = MODES[menuSel].id; startCurrentMode(); }
function goToMenu() { deathAnim = null; state = "menu"; }

// ---------- input ----------
// Align the chicken onto the nearest grid-cell of whatever log/pad its target cell lands on,
// so it snaps to the log's spacing on entry (mirrors the snap-to-grid we already do on exit).
function snapToPlatform(row, ngx) {
  const cx = ngx + 0.5, TOL = 0.3;
  // Prefer cells that keep the chicken inside the reachable area: landing near
  // the edge must never snap the chicken's position out past the swept
  // boundary when a perfectly good in-bounds cell of the same log is at hand.
  let best = null, bestDist = Infinity, bestOut = true;
  for (const it of row.items) {
    const c = itemCol(row, it);
    if (cx >= c - TOL && cx <= c + it.len + TOL) {
      for (let k = 0; k < it.len; k++) {
        const aligned = c + k; // gx so the chicken sits centered on that cell of the platform
        const dist = Math.abs(aligned + 0.5 - cx);
        if (dist > TOL + 0.5) continue; // only cells actually under / beside the chicken
        const out = aligned > COLS - 0.5 || aligned < -0.5;
        if ((bestOut && !out) || (out === bestOut && dist < bestDist)) {
          bestDist = dist; best = aligned; bestOut = out;
        }
      }
    }
  }
  return best != null ? best : ngx; // no platform under the target → stays put (and drowns)
}

// Called the instant the chicken finishes a hop. River alignment & landing sounds happen here (on
// landing, using the log's position at that moment) rather than at key-press — so they feel real.
function onLanded() {
  const row = getRow(player.gy);
  if (row.type === "river") {
    const plat = findPlatform(row, player.gx + 0.5);
    if (plat) {
      player.gx = snapToPlatform(row, player.gx); // align to the moving log/pad's cell where it now sits
      sfx(plat.type === "pad" ? "pad" : "log");
    }
    // no platform underneath → riverUpdate (next) drowns us and plays the splash
  } else {
    player.gx = clamp(Math.round(player.gx), 0, COLS - 1); // settle onto the grid column on solid ground
  }
}

function move(dx, dy) {
  if (state !== "playing") return;
  if (hopTimer > 0) { bufferedMove = [dx, dy]; return; } // queue input during a hop; runs on landing
  doMove(dx, dy);
}

function doMove(dx, dy) {
  const curRow = getRow(player.gy);
  const onLog = curRow.type === "river" && curRow.variant === "logs";

  const ngy = clamp(player.gy + dy, MINROW, 1e9);
  let ngx;
  if (dy !== 0) ngx = player.gx; // pure forward/back: keep the exact horizontal position, align only on landing
  else if (onLog) {
    // slide one cell along the log, but never hop off the reachable area into the shaded margin
    if (Math.round(player.gx) + dx < 0 || Math.round(player.gx) + dx > COLS - 1) return;
    ngx = player.gx + dx;
  }
  else ngx = clamp(Math.round(player.gx) + dx, 0, COLS - 1);

  ensureRows(player.gy + VIS_ROWS + 3);
  const tRow = getRow(ngy);
  if (tRow.type === "grass" && tRow.trees.has(Math.round(ngx))) return; // blocked by tree (nearest column)

  const moved = !(Math.abs(ngx - player.gx) < 1e-6 && ngy === player.gy);
  player.face = dy > 0 ? "up" : dy < 0 ? "down" : dx < 0 ? "left" : "right";
  player.gx = ngx; player.gy = ngy;

  if (moved) {
    idleTime = 0;
    hopTimer = HOP_DUR;
    // a sideways hop along a log keeps riding the log's momentum during the hop, so the chicken
    // moves exactly one cell *relative to the log* (just like hopping sideways on solid ground)
    hopCarrying = onLog && dy === 0;
    sfx("hop"); // take-off; the landing (log/pad/splash) sound plays when we actually land
    if (player.gy > maxRow) {
      maxRow = player.gy;
      checkMilestone(); // ding when the score crosses each multiple of 50
    }
    ensureRows(player.gy + VIS_ROWS + 3);
  }
}

// (No toggleMute here — muting is global, via the shared mute-toggle.js speaker
//  button. `muted` below stays false and only `paused` drives applyMaster().)
function cycleSkin() {
  for (let i = 1; i <= SKINS.length; i++) {
    const j = (skinSel + i) % SKINS.length;
    if (skinUnlocked(j)) { skinSel = j; lsSet("crossy_skin", skinSel); break; }
  }
}

window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;   // browser shortcuts (Ctrl+P, Ctrl+S, Alt+←…) aren't game keys
  const k = e.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
  if (e.repeat) return; // one hop per physical press — holding a key must not auto-hop
  if (state === "menu") {
    if (k === "arrowup" || k === "w" || k === "arrowleft" || k === "a") { menuSel = (menuSel + MODES.length - 1) % MODES.length; menuTick(-1); }
    else if (k === "arrowdown" || k === "s" || k === "arrowright" || k === "d") { menuSel = (menuSel + 1) % MODES.length; menuTick(1); }
    else if (k === "c") cycleSkin();
    else if (k === " " || k === "enter") startSelectedMode();
    return;
  }
  // Esc is never claimed: the shared motion-toggle.js takes it to the games
  // page (asking first during a run that has scored), and Backspace is the
  // way back to this game's menu
  if (state === "dead") {
    if (k === " " || k === "enter") startCurrentMode();          // play again, same mode
    else if (k === "backspace") { e.preventDefault(); goToMenu(); }
    return;
  }
  if (state !== "playing") return; // ignore movement during death/eagle animations
  if (k === "p") { e.preventDefault(); paused = !paused; applyMaster(); return; } // pause toggle
  if (paused) return;
  if (k === "arrowup" || k === "w") move(0, 1);
  else if (k === "arrowdown" || k === "s") move(0, -1);
  else if (k === "arrowleft" || k === "a") move(-1, 0);
  else if (k === "arrowright" || k === "d") move(1, 0);
}, { passive: false });

// touch + click
let tStart = null;
canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const t = e.changedTouches[0];
  tStart = { x: t.clientX, y: t.clientY };
}, { passive: false });
canvas.addEventListener("touchend", (e) => {
  e.preventDefault();
  if (!tStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - tStart.x, dy = t.clientY - tStart.y;
  tStart = null;
  if (state === "menu" || state === "dead") { handlePointer(t.clientX, t.clientY); return; }
  if (state !== "playing") return;
  if (paused) { paused = false; applyMaster(); return; } // tap to resume
  if (Math.abs(dx) < 24 && Math.abs(dy) < 24) { move(0, 1); return; } // tap = forward
  if (Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? -1 : 1, 0);
  else move(0, dy < 0 ? 1 : -1); // swipe up = forward
}, { passive: false });
canvas.addEventListener("mousedown", (e) => {
  if (state === "menu" || state === "dead") handlePointer(e.clientX, e.clientY);
});

// map a client point to canvas-logical coords and test the on-screen menu / game-over buttons
function canvasPos(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  return { x: (clientX - r.left) / r.width * W, y: (clientY - r.top) / r.height * H };
}
const inRect = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
function menuButtonRects() {
  const bw = 380, bh = 50, gap = 12, x = (W - bw) / 2, y0 = H * 0.40;
  return MODES.map((m, i) => ({ x, y: y0 + i * (bh + gap), w: bw, h: bh }));
}
function deadButtonRects() {
  const bw = 300, bh = 50, gap = 14, x = (W - bw) / 2, y0 = H * 0.60;
  return [{ x, y: y0, w: bw, h: bh }, { x, y: y0 + bh + gap, w: bw, h: bh }];
}
// the skin turntable and its label, under the mode buttons: a tap changes the
// skin, as C does (a phone has no C)
function skinRect() {
  const top = H * 0.775 - 46;
  return { x: W / 2 - 110, y: top, w: 220, h: H * 0.815 + 12 - top };
}
function handlePointer(clientX, clientY) {
  const p = canvasPos(clientX, clientY);
  if (state === "menu") {
    const rects = menuButtonRects();
    for (let i = 0; i < rects.length; i++) if (inRect(p, rects[i])) { menuSel = i; startSelectedMode(); return; }
    if (inRect(p, skinRect())) cycleSkin();
  } else if (state === "dead") {
    const r = deadButtonRects();
    if (inRect(p, r[0])) startCurrentMode();
    else if (inRect(p, r[1])) goToMenu();
  }
}

// ---------- drawing ----------
function drawRow(r, row) {
  const top = rowTopY(r);
  if (top > H + TILE || top < -TILE * 2) return;

  if (row.type === "grass") {
    ctx.fillStyle = (mod(r, 2) === 0) ? "#9bd64f" : "#90cf47";
    ctx.fillRect(SCENE_L, top, W, TILE);
    // terraced edge: a soft shade at the far edge of every grass step
    ctx.fillStyle = "rgba(0,0,0,.06)";
    ctx.fillRect(SCENE_L, top, W, 6);
    // decorations
    for (const d of row.decos) {
      const x = (d.col + d.dx) * TILE, y = top + d.dy * TILE;
      ctx.fillStyle = d.hue;
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff8";
      ctx.beginPath(); ctx.arc(x, y, 1.3, 0, 7); ctx.fill();
    }
    // trees
    for (const c of row.trees) drawTree(c * TILE + TILE / 2, top + TILE * 0.62);
    if (row.coin && !row.coin.got) drawCoin(coinColOf(row), top);

  } else if (row.type === "road") {
    ctx.fillStyle = "#41414c";
    ctx.fillRect(SCENE_L, top, W, TILE);
    ctx.strokeStyle = "rgba(255,255,255,.55)";
    ctx.lineWidth = 3; ctx.setLineDash([14, 14]);
    ctx.beginPath(); ctx.moveTo(SCENE_L, top + TILE / 2); ctx.lineTo(SCENE_R, top + TILE / 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.fillRect(SCENE_L, top, W, 4); ctx.fillRect(SCENE_L, top + TILE - 4, W, 4);
    if (row.coin && !row.coin.got) drawCoin(coinColOf(row), top); // lies on the road, under the cars
    for (const it of row.items) drawVehicle(row, it, top);
    if (row.police.state === "active") drawPoliceCar(row, top);
    // (the warning glow is drawn later, on top of the shaded margins, so it covers the boundary too)

  } else if (row.type === "rail") {
    ctx.fillStyle = "#6b5236";
    ctx.fillRect(SCENE_L, top, W, TILE);
    // ties
    ctx.fillStyle = "#54402a";
    for (let x = SCENE_L; x < SCENE_R; x += 22) ctx.fillRect(x + 4, top + 8, 12, TILE - 16);
    // rails
    ctx.strokeStyle = "#b9bdc4"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(SCENE_L, top + TILE * 0.34); ctx.lineTo(SCENE_R, top + TILE * 0.34); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(SCENE_L, top + TILE * 0.66); ctx.lineTo(SCENE_R, top + TILE * 0.66); ctx.stroke();
    if (row.coin && !row.coin.got) drawCoin(coinColOf(row), top); // on the tracks, under the train
    if (row.state === "active") drawTrain(row, top);
    drawSignal(row, top); // signal sits in front of the train (it's on the near edge)

  } else if (row.type === "river") {
    // sunken water: darker base, a shore shadow cast by the far bank, and two
    // ripple bands drifting in opposite directions
    ctx.fillStyle = "#2b6fc2";
    ctx.fillRect(SCENE_L, top, W, TILE);
    const shoreG = ctx.createLinearGradient(0, top, 0, top + 15);
    shoreG.addColorStop(0, "rgba(6,24,54,.45)");
    shoreG.addColorStop(1, "rgba(6,24,54,0)");
    ctx.fillStyle = shoreG;
    ctx.fillRect(SCENE_L, top, W, 15);
    const rt = fxOff() ? 0 : performance.now();   // (Visual FX off: the ripples stay where they are)
    const t1 = (rt / 130) % 40, t2 = 40 - (rt / 210) % 40;
    ctx.fillStyle = "rgba(255,255,255,.10)";
    for (let x = SCENE_L; x < SCENE_R; x += 40) {
      ctx.beginPath(); ctx.arc(x + t1, top + TILE * 0.32, 6, 0, Math.PI); ctx.fill();
      ctx.beginPath(); ctx.arc(x + t2 + 20, top + TILE * 0.68, 5, Math.PI, 0); ctx.fill();
    }
    for (const it of row.items) drawPlatform(row, it, top);
    if (row.coin && !row.coin.got) drawCoin(coinColOf(row), top, -10); // riding the log, raised onto its top face
  }

  // the near shore's cliff face: land rises out of the water just beyond it
  const beyond = rows[r + 1];
  if (row.type !== "river" && beyond && beyond.type === "river") {
    ctx.fillStyle = "#6f5a33";
    ctx.fillRect(SCENE_L, top - 7, W, 7);
    ctx.fillStyle = "rgba(255,255,255,.22)";
    ctx.fillRect(SCENE_L, top - 7, W, 2);
  }
}

// current column of a coin — fixed for grass/road/pads, but rides its log on a moving river lane
function coinColOf(row) { const c = row.coin; return c.log ? itemCol(row, c.log) + c.k : c.col; }

// spinning gold coin (Visual FX off: face on, still)
function drawCoin(col, top, yOff) {
  const cx = col * TILE + TILE / 2, cy = top + TILE / 2 + (yOff || 0);
  const wob = fxOff() ? 1 : Math.abs(Math.cos(performance.now() / 260)); // 0..1 spin
  ctx.fillStyle = "rgba(0,0,0,.18)";
  ctx.beginPath(); ctx.ellipse(cx, cy + 13, 9, 4, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "#f4c020";
  ctx.beginPath(); ctx.ellipse(cx, cy, 4 + 7 * wob, 11, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "#ffe680";
  ctx.beginPath(); ctx.ellipse(cx, cy, 2 + 4 * wob, 7, 0, 0, 7); ctx.fill();
}

// gold "+1" that floats up from a collected coin, clear of the chicken's head, and fades out
function drawCoinPops() {
  for (const p of coinPops) {
    const k = p.t / COIN_POP_DUR;                // 0 at pickup → 1
    ctx.globalAlpha = k < 0.5 ? 1 : 2 * (1 - k); // hold, then fade over the back half
    textCenter("+1", p.x, rowTopY(p.r) + TILE / 2 - 36 - 40 * k * (2 - k), 24, "#ffd23d");
  }
  ctx.globalAlpha = 1;
}

function drawTree(x, y) {
  // a toy-block tree: trunk cube under two stacked canopy slabs
  ctx.fillStyle = "rgba(0,0,0,.20)";
  ctx.beginPath(); ctx.ellipse(x, y + 14, 17, 6, 0, 0, 7); ctx.fill();
  block(x - 6, y + 2, 12, 8, 16, "#8a5a2e", 2);
  block(x - 17, y - 6, 34, 14, 22, "#2f8f3e", 5);
  block(x - 11, y - 10, 22, 10, 16, "#43b257", 5);
  ctx.fillStyle = "rgba(255,255,255,.20)";
  roundRect(x - 8, y - 24, 12, 4, 2); ctx.fill();
}

function drawVehicle(row, it, top) {
  const x = it.x * TILE, w = it.len * TILE; // roads use linear positions
  if (x > W + TILE || x + w < -TILE) return;
  const facingRight = row.dir > 0;
  const y0 = top + TILE * 0.24, d = TILE * 0.5;

  // shadow, and wheels peeking out under the body
  ctx.fillStyle = "rgba(0,0,0,.22)";
  roundRect(x + 3, y0 + d - 6, w - 6, 9, 5); ctx.fill();
  ctx.fillStyle = "#1b1b1f";
  ctx.fillRect(x + w * 0.14, y0 + d - 4, 11, 7);
  ctx.fillRect(x + w * 0.72, y0 + d - 4, 11, 7);

  if (it.type === "truck") {
    const cabW = w * 0.26, trailW = w * 0.66;
    const cabX = facingRight ? x + w - cabW : x;
    const trailX = facingRight ? x + 2 : x + w - trailW - 2;
    block(cabX, y0, cabW, d, 16, it.color, 4);
    ctx.fillStyle = "#bfe4ff"; // windshield strip on the cab's front face
    roundRect(cabX + 3, y0 + d - 14, cabW - 6, 7, 2); ctx.fill();
    block(trailX, y0, trailW, d, 30, "#e9e9ee", 3);
    ctx.strokeStyle = "rgba(0,0,0,.14)"; ctx.lineWidth = 2; // container ridges
    for (let i = 1; i < 4; i++) {
      const lx = trailX + trailW * i / 4;
      ctx.beginPath(); ctx.moveTo(lx, y0 + d - 30); ctx.lineTo(lx, y0 + d - 2); ctx.stroke();
    }
  } else {
    block(x + 2, y0, w - 4, d, 13, it.color, 5);          // body
    const cabW = w * 0.5, cabX = x + w * 0.25;
    block(cabX, y0 + 2, cabW, d - 4, 25, it.color, 4);    // raised cabin
    ctx.fillStyle = "#bfe4ff";                            // wrap-around glass
    roundRect(cabX + 2, y0 + d - 25, cabW - 4, 9, 3); ctx.fill();
    ctx.fillStyle = "#fff3b0";                            // headlights, leading edge
    const hx = facingRight ? x + w - 9 : x + 3;
    ctx.fillRect(hx, y0 + d - 12, 6, 5);
    ctx.fillStyle = "#e04438";                            // taillight, trailing edge
    const tx2 = facingRight ? x + 3 : x + w - 8;
    ctx.fillRect(tx2, y0 + d - 12, 5, 5);
  }
}

// Visual FX off (motion-toggle.js): warning lights burn steadily instead of flashing
function fxOff() { return !!(window.RM_ON && window.RM_ON()); }

function drawPoliceWarning(row, top) {
  const p = row.police;
  if (!row.siren || p.state !== "clearing") return; // brief edge flash before it enters; the car has its own light during the sweep
  const onLeft = p.dir > 0;              // glow on the side the police car comes from
  const ex = onLeft ? SCENE_L : SCENE_R; // start at the very screen edge so it covers the shaded margin too
  const flash = fxOff() || (((performance.now() / 130) | 0) % 2) === 0;   // steady red with FX off
  const col = flash ? "#ff3030" : "#3a6bff";
  const reach = PAD * TILE + TILE * 1.6; // span the margin + the boundary grid cell
  const g = ctx.createRadialGradient(ex, top + TILE / 2, 4, ex, top + TILE / 2, reach);
  g.addColorStop(0, col);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  ctx.globalAlpha = p.state === "warn" ? 0.62 : 0.34;
  ctx.fillStyle = g;
  ctx.fillRect(onLeft ? SCENE_L : SCENE_R - reach, top - 6, reach, TILE + 12);
  ctx.restore();
}

function drawPoliceCar(row, top) {
  const p = row.police;
  const x = p.x * TILE, w = p.len * TILE;
  if (x > W + TILE || x + w < -TILE) return;
  const facingRight = p.dir > 0;
  const steady = fxOff(), flash = steady || (((performance.now() / 110) | 0) % 2) === 0;
  const y0 = top + TILE * 0.24, d = TILE * 0.5;
  // speed streaks trailing behind
  ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const sy = y0 + d - 8 - i * 9;
    const bx = facingRight ? x - 4 : x + w + 4;
    ctx.beginPath(); ctx.moveTo(bx, sy); ctx.lineTo(bx + (facingRight ? -24 : 24), sy); ctx.stroke();
  }
  // shadow + wheels
  ctx.fillStyle = "rgba(0,0,0,.22)";
  roundRect(x + 3, y0 + d - 6, w - 6, 9, 5); ctx.fill();
  ctx.fillStyle = "#1b1b1f";
  ctx.fillRect(x + w * 0.14, y0 + d - 4, 11, 7);
  ctx.fillRect(x + w * 0.72, y0 + d - 4, 11, 7);

  if (p.type === "firetruck") {
    block(x + 2, y0, w - 4, d, 16, "#d11f1f", 4);
    const cabW = w * 0.26;
    const cabX = facingRight ? x + w - cabW - 2 : x + 2;
    block(cabX, y0 + 2, cabW, d - 4, 26, "#a81616", 3);
    ctx.fillStyle = "#bfe4ff";
    roundRect(cabX + 3, y0 + d - 26, cabW - 6, 8, 2); ctx.fill();
    ctx.strokeStyle = "#d9d9de"; ctx.lineWidth = 3; // ladder along the roof
    ctx.beginPath(); ctx.moveTo(x + w * 0.08, y0 - 10); ctx.lineTo(x + w * 0.66, y0 - 10); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("FIRE", x + w * (facingRight ? 0.4 : 0.6), y0 + d - 6);
    ctx.fillStyle = flash ? "#ff2b2b" : "#7a0f0f"; // flashing beacon on the cab roof
    roundRect(cabX + cabW * 0.28, y0 - 20, cabW * 0.44, 7, 3); ctx.fill();
  } else {
    block(x + 2, y0, w - 4, d, 13, "#f2f2f5", 5);
    const cabW = w * 0.5, cabX = x + w * 0.25;
    block(cabX, y0 + 2, cabW, d - 4, 25, "#f2f2f5", 4);
    ctx.fillStyle = "#1b1b22"; // livery stripe on the body's front face
    ctx.fillRect(x + w * 0.2, y0 + d - 9, w * 0.6, 4);
    ctx.fillStyle = "#bfe4ff";
    roundRect(cabX + 2, y0 + d - 25, cabW - 4, 8, 3); ctx.fill();
    // light bar on the roof: flashing red / blue, or (Visual FX off) a steady two-tone bar
    if (steady) {
      ctx.fillStyle = "#ff3030"; roundRect(cabX + cabW * 0.22, y0 - 21, cabW * 0.28, 7, 3); ctx.fill();
      ctx.fillStyle = "#3a6bff"; roundRect(cabX + cabW * 0.5, y0 - 21, cabW * 0.28, 7, 3); ctx.fill();
    } else {
      ctx.fillStyle = flash ? "#ff3030" : "#3a6bff";
      roundRect(cabX + cabW * 0.22, y0 - 21, cabW * 0.56, 7, 3); ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,.5)";
    roundRect(cabX + cabW * 0.44, y0 - 21, cabW * 0.12, 7, 2); ctx.fill();
    ctx.fillStyle = "#1b1b22"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("POLICE", x + w / 2, y0 + d - 3);
  }
  ctx.fillStyle = "#fff3b0"; // headlights on the leading edge
  const hx = facingRight ? x + w - 9 : x + 3;
  ctx.fillRect(hx, y0 + d - 12, 6, 5);
}

function drawPlatform(row, it, top) {
  const c = itemCol(row, it);
  const x = c * TILE, w = it.len * TILE;
  if (x > W + TILE || x + w < -TILE) return;
  if (it.type === "pad") {
    const cx = x + TILE / 2, cy = top + TILE / 2;
    ctx.fillStyle = "rgba(6,32,64,.35)"; // resting shadow in the water
    ctx.beginPath(); ctx.ellipse(cx + 3, cy + 5, TILE * 0.37, TILE * 0.3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#2f9d4d";
    ctx.beginPath(); ctx.arc(cx, cy, TILE * 0.36, 0, 7); ctx.fill();
    ctx.fillStyle = "#247a3c";
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, TILE * 0.36, -0.5, 0.3); ctx.fill();
    ctx.fillStyle = "#59c274"; // rim light
    ctx.beginPath(); ctx.arc(cx, cy, TILE * 0.3, 3.4, 5.2); ctx.stroke();
    ctx.fillStyle = "#ff77a8";
    ctx.beginPath(); ctx.arc(cx + 6, cy - 6, 4, 0, 7); ctx.fill();
  } else {
    // a floating log: rounded block with grain lines and cut-end rings
    const y0 = top + TILE * 0.26, d = TILE * 0.48, h = 10;
    ctx.fillStyle = "rgba(6,32,64,.35)";
    roundRect(x + 6, y0 + d - 4, w - 12, 8, 4); ctx.fill();
    block(x + 4, y0, w - 8, d, h, "#7a4a24", 7);
    ctx.strokeStyle = "rgba(0,0,0,.16)"; ctx.lineWidth = 2; // grain along the top
    ctx.beginPath();
    ctx.moveTo(x + 10, y0 - h + d * 0.32); ctx.lineTo(x + w - 10, y0 - h + d * 0.32);
    ctx.moveTo(x + 14, y0 - h + d * 0.66); ctx.lineTo(x + w - 14, y0 - h + d * 0.66);
    ctx.stroke();
    ctx.fillStyle = "#9a6a38"; // end grain
    ctx.beginPath(); ctx.ellipse(x + 9, y0 + d - h / 2 - 1, 4, 5, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + w - 9, y0 + d - h / 2 - 1, 4, 5, 0, 0, 7); ctx.fill();
  }
}

function drawSignal(row, top) {
  const onLeft = row.dir > 0;
  // sit on the reachable edge columns, not out in the shaded margins
  const x = onLeft ? 4 : COLS * TILE - 20;
  ctx.fillStyle = "#222";
  ctx.fillRect(x + 6, top + 4, 4, TILE - 8);
  ctx.fillStyle = "#111";
  roundRect(x, top + 2, 16, 16, 4); ctx.fill();
  // flashes only while warning (before the train); dark once the train is on the track
  const lit = row.state === "warn" && (fxOff() || (((row.blink * 6) | 0) % 2) === 0);   // steady while warning with FX off
  ctx.fillStyle = lit ? "#ff2b2b" : "#5a1414";
  ctx.beginPath(); ctx.arc(x + 8, top + 10, 5, 0, 7); ctx.fill();
  if (lit) { ctx.fillStyle = "rgba(255,60,60,.45)"; ctx.beginPath(); ctx.arc(x + 8, top + 10, 10, 0, 7); ctx.fill(); }
}

function drawTrain(row, top) {
  const x = row.trainX * TILE, w = row.trainLen * TILE;
  const y0 = top + TILE * 0.22, d = TILE * 0.56, h = 34;
  ctx.fillStyle = "rgba(0,0,0,.25)";
  roundRect(x + 4, y0 + d - 6, w - 8, 10, 5); ctx.fill();
  for (let i = 0; i < row.trainLen; i++) {
    const cx2 = x + i * TILE + 2, cw = TILE - 5;
    block(cx2, y0, cw, d, h, i === 0 || i === row.trainLen - 1 ? "#a93226" : "#c0392b", 4);
    ctx.fillStyle = "#1c2533"; // window band on the front face
    roundRect(cx2 + 6, y0 + d - h + 7, cw - 12, 11, 3); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.18)"; // roof sheen
    roundRect(cx2 + 4, y0 - h + 3, cw - 8, 5, 2); ctx.fill();
  }
  ctx.fillStyle = "#ffd23d"; // glowing nose at the front
  const nx = row.dir > 0 ? x + w - 8 : x + 2;
  ctx.fillRect(nx, y0 + d - h + 6, 6, h - 12);
}

// Draws the chicken centered at (sx, sy) with optional squash/stretch and rotation (for death poses).
function drawChicken(sx, sy, sclX, sclY, rot, f, skin) {
  // a voxel chick: body cube, head cube nudged toward its facing, comb slab,
  // beak, wing patch. Same footprint and transform contract as the old sprite.
  const sk = skin || SKINS[skinSel] || SKINS[0];
  const dx = f === "left" ? -1 : f === "right" ? 1 : 0;
  ctx.save();
  ctx.translate(sx, sy);
  if (rot) ctx.rotate(rot);
  ctx.scale(sclX, sclY);
  // tail slab: at the back for side hops, small and up top when walking away
  if (f === "up") block(-5, -2, 10, 4, 10, sk.tail, 3);
  else block(dx <= 0 ? 7 : -13, 3, 6, 5, 12, sk.tail, 2);
  // body cube
  block(-12, 4, 24, 8, 18, sk.body, 5);
  // feet
  ctx.fillStyle = shadeC(sk.beak, -0.15);
  ctx.fillRect(-8, 12, 5, 3); ctx.fillRect(3, 12, 5, 3);
  // wing patch on the body
  ctx.fillStyle = shadeC(sk.body, -0.12);
  roundRect(dx >= 0 ? -10 : 3, -2, 7, 9, 3); ctx.fill();
  // head cube + comb
  block(-7 + dx * 5, -10, 14, 6, 12, sk.body, 4);
  block(-3 + dx * 5, -19, 6, 3, 5, sk.comb, 1);
  // face
  ctx.fillStyle = sk.beak;
  if (f === "left" || f === "right") {
    const ex = dx * 12;
    ctx.beginPath();
    ctx.moveTo(ex, -16); ctx.lineTo(ex + dx * 8, -12); ctx.lineTo(ex, -8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#222";
    ctx.fillRect(dx * 5 + (dx > 0 ? 2 : -5), -15, 3, 3);
  } else if (f === "down") {
    ctx.beginPath();
    ctx.moveTo(-4, -9); ctx.lineTo(4, -9); ctx.lineTo(0, -4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#222";
    ctx.fillRect(-5, -15, 3, 3); ctx.fillRect(2, -15, 3, 3);
  } else { // "up" — seen from behind: wing hints, no face
    ctx.fillStyle = shadeC(sk.body, -0.16);
    roundRect(-12, -4, 5, 12, 2); ctx.fill();
    roundRect(7, -4, 5, 12, 2); ctx.fill();
  }
  ctx.restore();
}

// The chicken's hop pose right now: how high it is and its squash & stretch
// (tall and narrow mid-hop, a brief squash on landing).
function hopPose() {
  let lift = 0, sclX = 1, sclY = 1;
  if (hopTimer > 0) {
    const air = Math.sin((1 - hopTimer / HOP_DUR) * Math.PI); // 0 at ends, 1 mid-air
    lift = air * TILE * 0.32;
    sclY = 1 + 0.22 * air; sclX = 1 - 0.14 * air;
  } else if (squashT > 0) {
    const k = squashT / SQUASH_DUR; // 1 at landing → 0
    sclY = 1 - 0.24 * k; sclX = 1 + 0.18 * k;
  }
  return { lift, sclX, sclY };
}

function drawPlayer() {
  const sx = (renderGx + 0.5) * TILE;
  const baseY = (-renderGy * TILE - cameraY);
  const pose = hopPose();
  const lift = pose.lift;

  // eagle warning: darkens as the chicken nears the bottom border (where the eagle strikes)
  if (state === "playing") {
    const warnStart = EAGLE_BORDER - TILE * 1.8;
    if (baseY > warnStart) {
      const p = clamp((baseY - warnStart) / (EAGLE_BORDER - warnStart), 0, 1);
      ctx.fillStyle = "rgba(20,20,30," + (0.12 + 0.28 * p) + ")";
      ctx.beginPath(); ctx.arc(sx, baseY, 26 + 26 * p, 0, 7); ctx.fill();
    }
  }

  // ground shadow
  ctx.fillStyle = "rgba(0,0,0,.22)";
  ctx.beginPath(); ctx.ellipse(sx, baseY + 14, 16 - lift * 0.05, 7, 0, 0, 7); ctx.fill();

  // Visual FX on: motion blur, fading copies where the chicken was a moment
  // ago, so a hop leaves a short trail (trail, recorded in updatePlaying)
  if (!fxOff() && !paused && trail.length > 1) {
    ctx.save();
    for (let i = 0; i < trail.length - 1; i++) {
      const g = trail[i];
      ctx.globalAlpha = 0.1 + 0.16 * (i / (trail.length - 1));
      drawChicken(g.x, g.wy - cameraY - g.lift + (1 - g.sclY) * 13, g.sclX, g.sclY, 0, g.face);
    }
    ctx.restore();
  }

  // squash & stretch (hopPose); keep the feet planted as it squashes/stretches
  const foot = (1 - pose.sclY) * 13;
  drawChicken(sx, baseY - lift + foot, pose.sclX, pose.sclY, 0, player.face);
}

// Renders the death pose/animation for the current deathAnim (everything except the eagle, which has its own swoop).
function drawDeathState() {
  const da = deathAnim; if (!da) return;
  const sx = (da.gx + 0.5) * TILE;
  const sy = -da.gy * TILE - cameraY;
  const t = da.t;

  if (da.cause === "water" || da.cause === "river") {
    const r = Math.round(da.gy), top = rowTopY(r), row = rows[r];
    ctx.save();
    ctx.beginPath(); ctx.rect(SCENE_L, top, W, TILE); ctx.clip(); // keep the splash on the water row only
    drawSplash(sx, sy, t, da.face);
    ctx.restore();
    if (row && row.type === "river") {
      for (const it of row.items) drawPlatform(row, it, top); // splash sits under logs/pads
      if (row.coin && !row.coin.got) drawCoin(coinColOf(row), top, -10); // ...and the coin stays on top of its pad/log
    }
    return;
  }

  if (da.cause === "swept") { // riding the log, carried off the screen by the current
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.beginPath(); ctx.ellipse(sx, sy + 14, 16, 6, 0, 0, 7); ctx.fill();
    drawChicken(sx, sy + Math.sin(t * 16) * 2, 1, 1, Math.sin(t * 9) * 0.12, da.dir > 0 ? "right" : "left");
    return;
  }

  ctx.fillStyle = "rgba(0,0,0,.22)";
  ctx.beginPath(); ctx.ellipse(sx, sy + 14, 18, 7, 0, 0, 7); ctx.fill();

  if (da.cause === "trainhit") {
    drawChicken(sx, sy, 0.85, 0.85, t * 14, da.face); // tumbling away with the train, still facing its last hop
  } else if (da.cause === "carjump") {
    const p = clamp(t / 0.14, 0, 1); // squished thin against the vehicle, carried along
    const sclX = 1 - 0.7 * p;
    // anchor the horizontal squish to whichever side hit the vehicle (the way the chicken was facing) so the
    // pancake stays pressed flat against the car — squishing toward its own centre would open a gap
    const side = da.face === "left" ? -1 : da.face === "right" ? 1 : 0;
    drawChicken(sx + side * 13 * (1 - sclX), sy, sclX, 1 + 0.2 * p, 0, da.face);
  } else { // runover → flattened pancake, smeared slightly in the direction the vehicle was moving
    const p = clamp(t / 0.18, 0, 1);
    const smear = (da.dir || 0) * 13 * p;
    drawChicken(sx + smear, sy + 8 * p, 1 + 0.9 * p, 1 - 0.85 * p, 0, da.face);
  }
}

function drawSplash(sx, sy, t, face) {
  // chicken sinking — still facing the way it last hopped
  if (t < 0.28) {
    ctx.save(); ctx.globalAlpha = 1 - t / 0.28;
    drawChicken(sx, sy + t * 45, 1 - t * 1.6, 1, 0, face || "down");
    ctx.restore();
  }
  // expanding ripple rings
  ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 3;
  ctx.globalAlpha = clamp(1 - t / 0.85, 0, 1);
  ctx.beginPath(); ctx.arc(sx, sy, 8 + t * 44, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.arc(sx, sy, 4 + t * 26, 0, 7); ctx.stroke();
  ctx.globalAlpha = 1;
  // droplets arcing out (kept low so they stay on the water)
  if (t < 0.32) {
    ctx.fillStyle = "#cfe8ff";
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2;
      const d = t * 110;
      ctx.beginPath(); ctx.arc(sx + Math.cos(a) * d, sy + Math.sin(a) * d * 0.5 - 42 * t + 70 * t * t, 3, 0, 7); ctx.fill();
    }
  }
}

function drawEagle() {
  if (!eagle) return;
  const x = eagle.x, y = eagle.y;
  const flap = fxOff() ? 0 : Math.sin(performance.now() / 60) * 10;   // (wings held spread with Visual FX off)
  // ground shadow that grows and darkens as the eagle drops toward the chicken
  const groundY = -renderGy * TILE - cameraY;
  const p = clamp((y - eagle.startY) / (groundY - eagle.startY), 0, 1); // 0 = high up, 1 = at the chicken
  ctx.fillStyle = "rgba(0,0,0," + (0.12 + 0.33 * p) + ")";
  ctx.beginPath(); ctx.ellipse(x, groundY + 14, 10 + 22 * p, 5 + 8 * p, 0, 0, 7); ctx.fill();
  // wings
  ctx.fillStyle = "#5b3a1e";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - 34, y - 14 - flap); ctx.lineTo(x - 8, y + 4); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 34, y - 14 - flap); ctx.lineTo(x + 8, y + 4); ctx.closePath(); ctx.fill();
  // body
  ctx.fillStyle = "#6e4423";
  roundRect(x - 9, y - 12, 18, 26, 8); ctx.fill();
  // head
  ctx.fillStyle = "#f3f1ea";
  ctx.beginPath(); ctx.arc(x, y - 12, 8, 0, 7); ctx.fill();
  ctx.fillStyle = "#f5a623";
  ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 7, y - 6); ctx.lineTo(x, y - 3); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#222";
  ctx.beginPath(); ctx.arc(x - 3, y - 13, 1.8, 0, 7); ctx.fill();
}

// ---------- HUD / overlays ----------
function textCenter(s, x, y, size, color) {
  ctx.font = "bold " + size + "px 'Trebuchet MS', sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(3, size * 0.14); ctx.strokeStyle = "rgba(0,0,0,.55)";
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}
// textCenter for key hints: each [KEY] in s is drawn as a keycap
// (GameShell.drawKeys), outlined like the rest of the caption; `touch` is
// drawn instead on a touch-only device ("" for nothing)
function keysCenter(s, x, y, size, color, touch) {
  ctx.font = "bold " + size + "px 'Trebuchet MS', sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  window.GameShell.drawKeys(ctx, s, x, y, { outline: { width: Math.max(3, size * 0.14), color: "rgba(0,0,0,.55)" }, touch: touch });
}

function drawHUD() {
  // score number briefly grows then eases back each time we cross a 50-point milestone
  const k = scorePopT > 0 ? scorePopT / SCORE_POP_DUR : 0; // 1 at the ding → 0
  const ease = k * (2 - k);                                // easeOutQuad: peak synced to the ding, gentle settle
  textCenter(String(score()), 46, 40, 40 * (1 + 0.55 * ease), "#fff");
  ctx.font = "bold 13px 'Trebuchet MS', sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,.8)";
  ctx.fillText("BEST " + highScore, 18, 70);
  if (coins > 0) { ctx.fillStyle = "#ffd23d"; ctx.fillText("🪙 " + coins, 18, 88); }
}

// soft tinted dim over the scene, in place of the old flat near-black wash
function veil(alpha) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(22,44,30," + (alpha * 0.85).toFixed(2) + ")");
  g.addColorStop(1, "rgba(10,26,36," + alpha + ")");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawButton(b, fill, label, sub, hi, selected) {
  // a chunky toy button: solid face sitting on a darker lip, like the back pill
  ctx.fillStyle = shadeC(fill, -0.4);
  roundRect(b.x, b.y + 4, b.w, b.h, 14); ctx.fill();
  ctx.fillStyle = fill;
  roundRect(b.x, b.y, b.w, b.h, 14); ctx.fill();
  if (selected) {
    ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 2.5;
    roundRect(b.x + 2.5, b.y + 2.5, b.w - 5, b.h - 5, 11); ctx.stroke();
  }
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#2c3a18";
  ctx.font = "bold 22px 'Trebuchet MS', sans-serif";
  if (sub == null && hi == null) { // simple centred button (game-over screen)
    ctx.textAlign = "center";
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2);
    return;
  }
  ctx.textAlign = "left";
  ctx.fillText(label, b.x + 18, b.y + b.h / 2 + (sub ? -8 : 0));
  if (sub) {
    ctx.font = "13px 'Trebuchet MS', sans-serif";
    ctx.fillStyle = "rgba(44,58,24,.72)";
    ctx.fillText(sub, b.x + 18, b.y + b.h / 2 + 12);
  }
  if (hi != null) {
    ctx.textAlign = "right";
    ctx.font = "bold 15px 'Trebuchet MS', sans-serif";
    ctx.fillStyle = "rgba(44,58,24,.78)";
    ctx.fillText("BEST " + hi, b.x + b.w - 16, b.y + b.h / 2);
  }
}

// ---------- true-3D chick for the skin turntable ----------
// The chick as axis-aligned boxes in local space (x right, y up, z toward the
// beak), rotated around Y by `th` and projected with the same oblique camera
// the game world fakes (screen y = -height + depth). Faces are painter-sorted
// and shaded by their rotated normals, so the turn reads as genuine 3D.
function drawChick3D(cx, cy, s, th, sk) {
  const cosT = Math.cos(th), sinT = Math.sin(th);
  const proj = (x, y, z) => {
    const xr = x * cosT + z * sinT, zr = -x * sinT + z * cosT;
    return { x: cx + xr * s, y: cy - y * s + zr * 0.5 * s, z: zr };
  };
  const wing = shadeC(sk.body, -0.12), foot = shadeC(sk.beak, -0.15);
  const boxes = [
    { b: [-12, 12, 4, 22, -8, 8], c: sk.body },      // body
    { b: [-7, 7, 22, 34, -3, 9], c: sk.body },       // head
    { b: [-3, 3, 34, 39, -1, 5], c: sk.comb },       // comb
    { b: [-2.5, 2.5, 25, 29, 9, 16], c: sk.beak },   // beak
    { b: [-5, 5, 12, 20, -15, -8], c: sk.tail },     // tail
    { b: [-14.5, -12, 8, 19, -6, 4], c: wing },      // wings
    { b: [12, 14.5, 8, 19, -6, 4], c: wing },
    // feet go in a base layer (pri 0) under everything else: the belly has no
    // underside face, so without this the far foot pokes below the body's
    // silhouette mid-turn and flickers between "in front" and "behind"
    { b: [-8, -3, 0, 4, -3, 3], c: foot, pri: 0 },
    { b: [3, 8, 0, 4, -3, 3], c: foot, pri: 0 },
    { b: [-7.9, -7, 27, 30.5, 3, 6.5], c: "#222" },  // eyes, on the head's sides
    { b: [7, 7.9, 27, 30.5, 3, 6.5], c: "#222" }
  ];
  const quads = [];
  for (const bx of boxes) {
    const [x0, x1, y0, y1, z0, z1] = bx.b;
    // each face: its 4 corners and its outward normal (local space)
    const F = [
      [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], 0, 1, 0],  // top
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0], // bottom
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1],  // front
      [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], 0, 0, -1], // back
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0], // left
      [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], 1, 0, 0]   // right
    ];
    for (const f of F) {
      const pts = [proj(...f[0]), proj(...f[1]), proj(...f[2]), proj(...f[3])];
      const nz = -f[4] * sinT + f[6] * cosT; // the normal's rotated z (toward viewer)
      const ny = f[5];
      if (ny < 0) continue; // bottoms never show from this camera
      const amt = ny > 0 ? 0.15 : -0.34 + 0.3 * Math.max(0, nz);
      quads.push({ pri: bx.pri == null ? 1 : bx.pri, z: (pts[0].z + pts[1].z + pts[2].z + pts[3].z) / 4, pts, c: shadeC(bx.c, amt) });
    }
  }
  quads.sort((a, b) => (a.pri - b.pri) || (a.z - b.z)); // base layer, then far faces first
  for (const q of quads) {
    ctx.fillStyle = q.c;
    ctx.beginPath();
    ctx.moveTo(q.pts[0].x, q.pts[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(q.pts[i].x, q.pts[i].y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawMenu() {
  veil(0.52);
  // (Visual FX off: the chickens stand still and the hint stays lit)
  const still = fxOff();
  const bob = still ? 0 : Math.sin(performance.now() / 300) * 4;
  ctx.save();
  ctx.translate(W / 2, H * 0.15);
  ctx.rotate(-0.03);
  textCenter("ROAD", 0, 0, 56, "#fff");
  textCenter("BIRD", 0, 50, 56, "#ffd23d");
  ctx.restore();
  // a pair of voxel chickens flanking the title, bobbing in time
  drawChicken(W / 2 - 168, H * 0.15 + 30 + bob, 1.25, 1.25, -0.06, "right", SKINS[skinSel]);
  drawChicken(W / 2 + 168, H * 0.15 + 30 - bob, 1.25, 1.25, 0.06, "left", SKINS[skinSel]);
  textCenter("Select a mode", W / 2, H * 0.30, 20, "#eaf2dc");
  const rects = menuButtonRects();
  MODES.forEach((m, i) => {
    const sel = i === menuSel;
    drawButton(rects[i], sel ? "#ffd23d" : "#f6f2e4", m.label, m.desc, loadHigh(m.id), sel);
  });
  // skin selector: the current chicken turns on a real 3D turntable — the
  // bird is modelled as boxes, rotated around the vertical axis and projected,
  // so its corners orbit and its shading shifts as it spins.
  const sk = SKINS[skinSel], be = bestEver();
  const px2 = W / 2, py2 = H * 0.775;
  ctx.fillStyle = "rgba(0,0,0,.25)"; // turntable shadow
  ctx.beginPath(); ctx.ellipse(px2, py2 + 3, 27, 8, 0, 0, 7); ctx.fill();
  const th = still ? 0 : (performance.now() / 2400) * Math.PI * 2;
  drawChick3D(px2, py2, 1.15, th, sk);
  keysCenter("Skin: " + sk.name + "   ([C] to change)", W / 2, H * 0.815, 17, "#fff", "Skin: " + sk.name + "   (tap to change)");
  const nextLocked = SKINS.find(s => be < s.unlock);
  if (nextLocked) textCenter("Next skin unlocks at " + nextLocked.unlock, W / 2, H * 0.815 + 22, 13, "rgba(255,255,255,.6)");
  const pulse = still ? 1 : 0.6 + 0.4 * Math.sin(performance.now() / 350);
  ctx.globalAlpha = pulse;
  keysCenter("[↑][↓] select  •  [SPACE] / tap to play  •  [ESC] games", W / 2, H * 0.90, 18, "#fff", "tap a mode to play");
  ctx.globalAlpha = 1;
}

function drawDead() {
  veil(0.56);
  const msg = {
    runover: "FLATTENED!", carjump: "SPLATTED INTO A CAR!", trainhit: "HIT BY A TRAIN!",
    water: "SPLASH! You drowned", swept: "Swept down the river!", eagle: "The eagle got you!"
  }[deathCause] || "Game Over";
  const mode = MODES.find(m => m.id === gameMode);
  textCenter("GAME OVER", W / 2, H * 0.17, 50, "#ff6b6b");
  textCenter(msg, W / 2, H * 0.17 + 40, 22, "#fff");
  // "NEW BEST!" flourish when this run beat the previous best (still, at full
  // size, with Visual FX off)
  if (score() > prevHigh && score() > 0) {
    const pop = fxOff() ? 1 : 1 + 0.12 * Math.sin(performance.now() / 150);
    ctx.save();
    ctx.translate(W / 2, H * 0.30); ctx.scale(pop, pop);
    textCenter("★ NEW BEST! ★", 0, 0, 26, "#ffe14d");
    ctx.restore();
  }
  textCenter((mode ? mode.label : "") + "  —  Score " + score(), W / 2, H * 0.39, 26, "#ffd23d");
  textCenter("Best  " + highScore + (bestCoins ? "    (🪙 " + bestCoins + ")" : ""), W / 2, H * 0.39 + 30, 18, "#dfe6f0");
  const r = deadButtonRects();
  drawButton(r[0], "#ffd23d", "Play Again", null, null, true);
  drawButton(r[1], "#f6f2e4", "Main Menu", null, null, false);
  // (only keys, so nothing on a phone: the buttons above say it)
  keysCenter("[SPACE] play again  •  [⌫] menu  •  [ESC] games  •  [M] mute", W / 2, H * 0.86, 15, "rgba(255,255,255,.7)", "");
}

function drawPauseOverlay() {
  veil(0.52);
  textCenter("PAUSED", W / 2, H * 0.42, 56, "#fff");
  const pulse = fxOff() ? 1 : 0.6 + 0.4 * Math.sin(performance.now() / 350);   // (steady with Visual FX off)
  ctx.globalAlpha = pulse;
  keysCenter("[P] to resume", W / 2, H * 0.54, 20, "#dfe6f0", "tap to resume");
  ctx.globalAlpha = 1;
}

// ---------- render ----------
function render() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#8fce46"; ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(PAD * TILE, 0); // shift the world right so unreachable margins show on each side
  if (shakeT > 0 && !fxOff()) { // Visual FX on: the hit shakes the scene (not the HUD), easing out
    const a = 7 * Math.pow(shakeT / SHAKE_DUR, 2);
    ctx.translate(rand(-a, a), rand(-a, a));
  }
  // the row the chicken is on — drawn in-loop right after that row so nearer rows can occlude it
  const chickenRow = state === "playing" ? Math.round(renderGy)
    : ((state === "dying" || state === "dead") && deathAnim && deathCause !== "eagle") ? Math.round(deathAnim.gy)
    : null;
  // a chicken hit mid-hop (jumped into a car/train) lands between two rows; drawing it in-loop lets the
  // nearer row paint over its overhanging half. So those airborne deaths are drawn on top after the loop
  // instead — runover/water/swept stay in-loop where their layering matters (wheels over the pancake, etc.)
  const deathOnTop = deathCause === "carjump" || deathCause === "trainhit";
  for (let r = player.gy + VIS_ROWS; r >= player.gy - VIS_ROWS; r--) {
    const row = rows[r]; if (row) drawRow(r, row);
    if (r === chickenRow) {
      if (state === "playing") {
        drawPlayer();
      } else if (!deathOnTop) {
        drawDeathState();
        if (deathCause === "runover" && row && row.type === "road") { // wheels pass over the pancake
          const top = rowTopY(r);
          for (const it of row.items) drawVehicle(row, it, top);
          if (row.police.state === "active") drawPoliceCar(row, top);
        }
      }
    }
  }
  if ((state === "dying" || state === "dead") && deathOnTop) {
    drawDeathState(); // on top of every row's surface, so the overhang into the row below isn't cut off...
    // ...but the tall sprites in the lane in front of the impact row (nearer the camera) must still pass
    // OVER that overhang, so re-draw them on top of the pancake — the ground/road surface stays behind it.
    const below = rows[chickenRow - 1], top = rowTopY(chickenRow - 1);
    if (below && below.type === "road") {
      for (const it of below.items) drawVehicle(below, it, top);
      if (below.police.state === "active") drawPoliceCar(below, top);
    } else if (below && below.type === "rail") {
      if (below.state === "active") drawTrain(below, top);
      drawSignal(below, top); // crossing light post
    } else if (below && below.type === "grass") {
      for (const c of below.trees) drawTree(c * TILE + TILE / 2, top + TILE * 0.62);
    }
  }
  if (state === "eagle") {
    if (!eagle.grabbed) drawPlayer();
    drawEagle();
    if (eagle.grabbed) drawChicken(eagle.x, eagle.y + 14, 1, 1, 0, "down"); // dangling in the talons
  }
  // shade the unreachable margin columns
  ctx.fillStyle = "rgba(8,12,22,0.32)";
  ctx.fillRect(SCENE_L, 0, PAD * TILE, H);
  ctx.fillRect(COLS * TILE, 0, PAD * TILE, H);
  // police warning glow drawn ON TOP of the shade so the light covers the margin + boundary cell
  for (let r = player.gy + VIS_ROWS; r >= player.gy - VIS_ROWS; r--) {
    const row = rows[r];
    if (row && row.type === "road" && row.siren)
      drawPoliceWarning(row, rowTopY(r));
  }
  drawFx();       // feathers and landing dust over the scene
  drawCoinPops(); // over everything in the scene, including the margin shade
  ctx.restore();

  if (state !== "menu") drawHUD();
  if (state === "menu") drawMenu();
  if (state === "dead") drawDead();
  if (paused && state === "playing") drawPauseOverlay();
}

// ---------- loop ----------
resetWorld();
state = "menu";
let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000; last = now;
  dt = Math.min(dt, 0.05);
  if (!paused) {
    if (scorePopT > 0) scorePopT -= dt; // HUD score-pop easing — ticks in every state so it settles even after death
    if (coinPops.length) { for (const p of coinPops) p.t += dt; coinPops = coinPops.filter(p => p.t < COIN_POP_DUR); }
    updateFx(dt);
    if (state === "playing") updatePlaying(dt);
    else if (state === "dying") updateDying(dt);
    else if (state === "eagle") updateEagle(dt);
    else updateScenery(dt); // keep menu / death scene alive
    applyRoadHum();
    applyRiverHum();
  }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// auto-pause when the tab/window loses focus (resume manually so you're not caught out)
function autoPause() { if (state === "playing" && !paused) { paused = true; applyMaster(); } }
if (window.GameShell) GameShell.onAutoPause(autoPause);
// the shared ⏸ button beside the sound button, so it's plain the game pauses (P)
if (window.GameShell && GameShell.pauseButton) GameShell.pauseButton({
  keys: ["p"],
  canPause: () => state === "playing",
  isPaused: () => paused,
  toggle: () => { if (state === "playing") { paused = !paused; applyMaster(); } },
});
// A run is in progress (paused or not) from the first point until the
// chicken dies: leaving then asks first, pausing underneath. The death and
// eagle animations come after the best is saved, so they don't ask.
if (window.GameShell) GameShell.guardLeave({
  active: () => state === "playing" && score() > 0,
  isPaused: () => paused,
  pause: () => { if (state === "playing") { paused = true; applyMaster(); } },
  resume: () => { paused = false; applyMaster(); },
});
if (!window.GameShell) { // shell missing — keep the original listeners so the behaviour survives
  window.addEventListener("blur", autoPause);
  document.addEventListener("visibilitychange", () => { if (document.hidden) autoPause(); });
}

// test hook
window.__game = {
  get state() { return state; },
  get score() { return score(); },
  get player() { return player; },
  spawnFeathers, spawnDust, death, snapToPlatform
};

})();
